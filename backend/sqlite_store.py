"""SQLite persistence for the desktop API's document operations.

Each write runs inside BEGIN IMMEDIATE, including predicate matching and updates.
Only the query/update operators used by server.py are supported; others fail.
"""
import copy
import json
import sqlite3
from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4

from pymongo.errors import DuplicateKeyError


def matches(doc, query):
    for key, expected in query.items():
        value = doc.get(key)
        if isinstance(expected, dict):
            for op, other in expected.items():
                if op == '$ne':
                    equal = other in value if isinstance(value, list) else value == other
                    if equal:
                        return False
                elif op == '$gte':
                    if value is None or value < other:
                        return False
                else:
                    raise ValueError(f'Unsupported query operator: {op}')
        elif value != expected:
            return False
    return True


def project(doc, projection):
    if doc is None:
        return None
    doc = copy.deepcopy(doc)
    for key, included in (projection or {}).items():
        if included:
            raise ValueError('Only exclusion projections are supported')
        doc.pop(key, None)
    return doc


class SQLiteStore:
    def __init__(self, path):
        self.path = str(path)
        with self.connection() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS documents (collection TEXT, id TEXT, body TEXT, PRIMARY KEY(collection,id))')
            conn.execute('CREATE TABLE IF NOT EXISTS unique_fields (collection TEXT, field TEXT, PRIMARY KEY(collection,field))')

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.path, timeout=30)
        try:
            conn.execute('BEGIN IMMEDIATE')
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def __getattr__(self, name):
        return Collection(self, name)

    async def command(self, name):
        if name != 'ping':
            raise ValueError('Unsupported database command')
        with self.connection() as conn:
            conn.execute('SELECT 1')
        return {'ok': 1}

    def close(self):
        pass  # Connections are scoped to each transaction.


class Collection:
    def __init__(self, store, name):
        self.store, self.name = store, name

    def rows(self, conn):
        return [(key, json.loads(body)) for key, body in conn.execute('SELECT id,body FROM documents WHERE collection=?', (self.name,))]

    def check_unique(self, conn, doc, exclude=None):
        fields = [r[0] for r in conn.execute('SELECT field FROM unique_fields WHERE collection=?', (self.name,))]
        for key, existing in self.rows(conn):
            if key != exclude and any(existing.get(field) == doc.get(field) for field in fields):
                raise DuplicateKeyError('Duplicate desktop database key')

    async def create_index(self, field, unique=False):
        if unique:
            with self.store.connection() as conn:
                values = [doc.get(field) for _, doc in self.rows(conn)]
                if len(set(values)) != len(values):
                    raise DuplicateKeyError('Existing duplicate desktop database key')
                conn.execute('INSERT OR IGNORE INTO unique_fields VALUES (?,?)', (self.name, field))
        return field

    async def find_one(self, query, projection=None):
        with self.store.connection() as conn:
            return next((project(doc, projection) for _, doc in self.rows(conn) if matches(doc, query)), None)

    async def insert_one(self, doc):
        value = copy.deepcopy(doc)
        value.setdefault('_id', uuid4().hex)
        with self.store.connection() as conn:
            self.check_unique(conn, value)
            try:
                conn.execute('INSERT INTO documents VALUES (?,?,?)', (self.name, str(value['_id']), json.dumps(value)))
            except sqlite3.IntegrityError as exc:
                raise DuplicateKeyError('Duplicate desktop document') from exc
        return SimpleNamespace(inserted_id=value['_id'])

    def update(self, conn, query, changes, upsert):
        found = next(((key, doc) for key, doc in self.rows(conn) if matches(doc, query)), None)
        if not found and not upsert:
            return None, None
        key, old = found if found else (uuid4().hex, None)
        doc = copy.deepcopy(old) if old else {**query, '_id': key}
        for op, fields in changes.items():
            for field, value in fields.items():
                if op == '$set' or (op == '$setOnInsert' and old is None):
                    doc[field] = value
                elif op == '$inc':
                    doc[field] = doc.get(field, 0) + value
                elif op == '$addToSet':
                    values = doc.setdefault(field, [])
                    if value not in values:
                        values.append(value)
                elif op != '$setOnInsert':
                    raise ValueError(f'Unsupported update operator: {op}')
        self.check_unique(conn, doc, exclude=key)
        conn.execute('INSERT OR REPLACE INTO documents VALUES (?,?,?)', (self.name, key, json.dumps(doc)))
        return old, doc

    async def update_one(self, query, changes, upsert=False):
        with self.store.connection() as conn:
            old, new = self.update(conn, query, changes, upsert)
        return SimpleNamespace(matched_count=int(old is not None), modified_count=int(new is not None and new != old))

    async def find_one_and_update(self, query, changes, return_document=False):
        with self.store.connection() as conn:
            old, new = self.update(conn, query, changes, False)
        return new if return_document else old

    async def delete_one(self, query):
        with self.store.connection() as conn:
            found = next((key for key, doc in self.rows(conn) if matches(doc, query)), None)
            if found:
                conn.execute('DELETE FROM documents WHERE collection=? AND id=?', (self.name, found))
        return SimpleNamespace(deleted_count=int(found is not None))

    async def count_documents(self, query):
        with self.store.connection() as conn:
            return sum(matches(doc, query) for _, doc in self.rows(conn))
