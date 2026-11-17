"""Tests for miscellaneous API routes: health, sleeper, and auth guards."""

import unittest
from unittest.mock import patch

from app import app


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_returns_ok(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})


class AuthGuardTests(unittest.TestCase):
    """Routes that require a configured SECRET_KEY should return 503 when absent."""

    def setUp(self):
        self.client = app.test_client()

    def _with_no_secret(self):
        return patch.object(app, "config", {**app.config, "SECRET_KEY": None})

    def test_register_without_secret_key_returns_503(self):
        with self._with_no_secret():
            response = self.client.post(
                "/api/auth/register",
                json={"username": "user", "password": "password1"},
            )
        self.assertEqual(response.status_code, 503)

    def test_login_without_secret_key_returns_503(self):
        with self._with_no_secret():
            response = self.client.post(
                "/api/auth/login",
                json={"username": "user", "password": "password1"},
            )
        self.assertEqual(response.status_code, 503)

    def test_logout_without_secret_key_returns_503(self):
        with self._with_no_secret():
            response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 503)

    def test_me_without_secret_key_returns_503(self):
        with self._with_no_secret():
            response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 503)

    def test_saved_leagues_without_secret_key_returns_503(self):
        with self._with_no_secret():
            response = self.client.post(
                "/api/users/me/leagues",
                json={"league_id": "123", "platform": "sleeper"},
            )
        self.assertEqual(response.status_code, 503)


class AuthInputValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        patch.object(app, "config", {**app.config, "SECRET_KEY": "test-secret"}).start()
        self.addCleanup(patch.stopall)

    def test_register_rejects_missing_fields(self):
        response = self.client.post("/api/auth/register", json={})
        self.assertEqual(response.status_code, 400)

    def test_register_rejects_invalid_username_characters(self):
        response = self.client.post(
            "/api/auth/register",
            json={"username": "bad user!", "password": "password123"},
        )
        self.assertEqual(response.status_code, 400)

    def test_register_rejects_short_password(self):
        response = self.client.post(
            "/api/auth/register",
            json={"username": "validuser", "password": "short"},
        )
        self.assertEqual(response.status_code, 400)

    def test_login_rejects_missing_fields(self):
        response = self.client.post("/api/auth/login", json={"username": "user"})
        self.assertEqual(response.status_code, 400)


class SleeperTrendingEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_invalid_trend_type_returns_400(self):
        response = self.client.get("/api/sleeper/trending/win")
        self.assertEqual(response.status_code, 400)

    def test_out_of_range_lookback_returns_400(self):
        response = self.client.get("/api/sleeper/trending/add?lookback_hours=200")
        self.assertEqual(response.status_code, 400)

    def test_non_integer_limit_returns_400(self):
        response = self.client.get("/api/sleeper/trending/add?limit=abc")
        self.assertEqual(response.status_code, 400)

    def test_valid_request_calls_get_trending_players(self):
        result = {"trend_type": "add", "players": []}
        with patch("app.get_trending_players", return_value=result):
            response = self.client.get("/api/sleeper/trending/add?lookback_hours=48&limit=5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["trend_type"], "add")


if __name__ == "__main__":
    unittest.main()
