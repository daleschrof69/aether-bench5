"""Desktop SQLite contracts and a real local-process startup/persistence check."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import httpx
import requests
import test_owned_integrations as owned
from sqlite_store import SQLiteStore
import server


class SQLiteContractTests(owned.ApplicationIntegrationTests):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = SQLiteStore(Path(self.temp.name) / 'test.sqlite3')
        self.database_patch = patch.object(server, 'db', self.db)
        self.database_patch.start()
        self.secret_patch = patch.object(server, 'STRIPE_WEBHOOK_SECRET', owned.SECRET)
        self.secret_patch.start()
        await self.db.users.create_index('email', unique=True)
        await self.db.users.create_index('user_id', unique=True)
        self.http = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url='http://testserver')
        self.user = {'user_id': 'user_test', 'email': 'test@example.com', 'credits': 100, 'plan': 'free'}
        await self.db.users.insert_one(self.user)
        self.txn = {'session_id': 'cs_synthetic', 'user_id': 'user_test', 'tier_id': 'credits_starter', 'amount': 19.0, 'currency': 'usd', 'fulfilled': False}
        await self.db.payment_transactions.insert_one(self.txn)
        self.session = {'id': 'cs_synthetic', 'status': 'complete', 'payment_status': 'paid', 'amount_total': 1900, 'currency': 'usd'}

    async def asyncTearDown(self):
        await self.http.aclose()
        self.secret_patch.stop()
        self.database_patch.stop()
        self.temp.cleanup()

    async def test_credit_spend_refund_and_reopen(self):
        token = server.create_access_token('user_test', 'test@example.com')
        self.http.headers['Authorization'] = f'Bearer {token}'
        payload = {'action_key': 'mtk.frp_bypass', 'op_id': 'desktop-test-op', 'cost': 25}
        result = await self.http.post('/api/credits/spend', json=payload)
        self.assertEqual(result.status_code, 200, result.text)
        charged = result.json()['charged']
        self.assertEqual(charged, 0)  # Existing repository contract: operations are free.
        repeated = await self.http.post('/api/credits/spend', json=payload)
        self.assertEqual(repeated.json()['credits'], 100 - charged)
        store = SQLiteStore(self.db.path)
        self.assertEqual((await store.users.find_one({'user_id': 'user_test'}))['credits'], 100 - charged)
        # Existing charged records can still be refunded after an upgrade.
        await self.db.credit_ops.insert_one({'op_id':payload['op_id'], 'user_id':'user_test', 'status':'charged', 'charged':25})
        await self.db.users.update_one({'user_id':'user_test'}, {'$inc':{'credits':-25}})
        refund = await self.http.post('/api/credits/refund', json={'op_id': payload['op_id']})
        self.assertEqual(refund.status_code, 200)
        self.assertEqual(refund.json()['credits'], 100)
        self.assertEqual((await self.http.post('/api/credits/refund', json={'op_id': payload['op_id']})).json()['refunded'], 0)

    async def test_sqlite_unique_keys_and_insufficient_credit_predicate(self):
        from pymongo.errors import DuplicateKeyError
        with self.assertRaises(DuplicateKeyError):
            await self.db.users.insert_one({'user_id':'other', 'email':'test@example.com'})
        result = await self.db.users.find_one_and_update({'user_id':'user_test','credits':{'$gte':101}}, {'$inc':{'credits':-101}}, return_document=True)
        self.assertIsNone(result)
        self.assertEqual((await self.db.users.find_one({'user_id':'user_test'}))['credits'], 100)


class DesktopProcessTests(unittest.TestCase):
    def test_start_authentication_persistence_and_clean_shutdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ui = root / 'ui'
            (ui / 'static').mkdir(parents=True)
            (ui / 'index.html').write_text('<html><head></head><body>Desktop test UI</body></html>')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            origin = f'http://127.0.0.1:{port}'
            env = {**os.environ, 'AETHER_DATA_DIR':str(root/'data'), 'AETHER_API_PORT':str(port), 'AETHER_DESKTOP_TOKEN':'synthetic-desktop-key', 'AETHER_UI_ROOT':str(ui), 'AETHER_BRIDGE_URL':'ws://127.0.0.1:1234/?token=synthetic', 'GOOGLE_CLIENT_ID':'', 'GOOGLE_CLIENT_SECRET':'', 'ADMIN_EMAIL':'', 'BRAIDEN_EMAIL':''}
            for iteration in range(2):
                process = subprocess.Popen([sys.executable, str(Path(__file__).resolve().parents[1]/'desktop.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    deadline = time.monotonic() + 15
                    while True:
                        try:
                            ready = requests.get(origin+'/api/health', headers={'Authorization':'Desktop synthetic-desktop-key'}, timeout=1)
                            if ready.status_code == 200:
                                break
                        except requests.ConnectionError:
                            pass
                        if time.monotonic() > deadline or process.poll() is not None:
                            self.fail('Desktop API failed to start')
                        time.sleep(.1)
                    self.assertEqual(requests.get(origin+'/api/health').status_code, 401)
                    self.assertEqual(requests.get(origin+'/desktop/start?token=wrong').status_code, 401)
                    session = requests.Session()
                    response = session.get(origin+'/desktop/start?token=synthetic-desktop-key')
                    self.assertEqual(response.status_code, 200)
                    self.assertIn('window.__AETHER_DESKTOP__', response.text)
                    self.assertEqual(session.get(origin+'/api/health',headers={'Origin':'https://example.invalid'}).status_code, 403)
                    self.assertEqual(session.get(origin+'/api/unknown').status_code, 404)
                    credentials={'email':'desktop@example.com','password':'local-desktop-test'}
                    route='signup' if iteration == 0 else 'login'
                    login=session.post(origin+'/api/auth/'+route,json=credentials)
                    self.assertEqual(login.status_code,200,login.text)
                    self.assertEqual(session.get(origin+'/api/auth/me').json()['email'],credentials['email'])
                finally:
                    process.terminate()
                    process.wait(timeout=10)
            self.assertTrue((root/'data/aether.sqlite3').is_file())


if __name__ == '__main__':
    unittest.main()
