import os
import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


# Ensure CSV relative paths in backend/main.py resolve as expected during tests.
BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402


class SmokeApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _did_login(self, did: str) -> dict:
        challenge_resp = self.client.post('/auth/challenge', json={'did': did})
        self.assertEqual(challenge_resp.status_code, 200)
        challenge = challenge_resp.json()['challenge']

        sign_resp = self.client.post('/auth/sign', json={'did': did, 'challenge': challenge})
        self.assertEqual(sign_resp.status_code, 200)
        signature = sign_resp.json()['signature']

        verify_resp = self.client.post(
            '/auth/verify',
            json={'did': did, 'challenge': challenge, 'signature': signature},
        )
        self.assertEqual(verify_resp.status_code, 200)
        return verify_resp.json()

    def test_end_to_end_issue_verify_revoke(self):
        login_data = self._did_login('did:dpp:factory-alpha')
        token = login_data['token']
        headers = {'Authorization': f'Bearer {token}'}

        factories_resp = self.client.get('/factories?limit=1')
        self.assertEqual(factories_resp.status_code, 200)
        factories = factories_resp.json()
        self.assertTrue(len(factories) >= 1)
        os_id = factories[0]['os_id']

        issue_resp = self.client.post(f'/issue-birth-certificate/{os_id}', headers=headers)
        self.assertEqual(issue_resp.status_code, 200)
        issue_data = issue_resp.json()

        product_id = issue_data['product_id']
        credential_id = issue_data['credential']['id']

        verify_before = self.client.get(f'/product/{product_id}/verify')
        self.assertEqual(verify_before.status_code, 200)
        verify_before_data = verify_before.json()
        self.assertTrue(verify_before_data['total_credentials'] >= 1)

        revoke_resp = self.client.post(
            f'/credentials/{credential_id}/revoke',
            json={'reason': 'smoke test'},
            headers=headers,
        )
        self.assertEqual(revoke_resp.status_code, 200)
        self.assertTrue(revoke_resp.json()['revoked'])

        status_resp = self.client.get(f'/credentials/{credential_id}/status')
        self.assertEqual(status_resp.status_code, 200)
        self.assertTrue(status_resp.json()['revoked'])


if __name__ == '__main__':
    unittest.main()
