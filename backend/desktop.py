"""Packaged desktop API entry point; no installed Python or MongoDB needed."""
import os
from pathlib import Path
import secrets


def main():
    data = Path(os.environ['AETHER_DATA_DIR'])
    data.mkdir(parents=True, exist_ok=True)
    secret = data / 'jwt-secret'
    if not secret.exists():
        with open(secret, 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as stream:
            stream.write(secrets.token_hex(32))
    os.environ['JWT_SECRET'] = secret.read_text().strip()
    os.environ['AETHER_SQLITE_PATH'] = str(data / 'aether.sqlite3')
    import uvicorn
    uvicorn.run('server:app', host='127.0.0.1', port=int(os.environ['AETHER_API_PORT']), access_log=False)


if __name__ == '__main__':
    main()
