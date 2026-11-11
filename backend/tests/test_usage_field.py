import json
import pathlib
import unittest
from unittest.mock import mock_open, patch

from app import app


FIXTURE = [
    {
        "id": "00-0036900",
        "name": "J.Chase",
        "team": "CIN",
        "position": "WR",
        "targets": 185,
        "avg_depth": 8.5,
        "shares": [16.22, 8.65, 8.65, 4.32, 3.78, 2.7,
                   8.65, 7.57, 3.78, 1.08, 0.0, 0.54,
                   13.51, 9.19, 3.24, 4.32, 1.62, 2.16],
    },
    {
        "id": "00-0038988",
        "name": "S.Diggs",
        "team": "NE",
        "position": "WR",
        "targets": 92,
        "avg_depth": 6.1,
        "shares": [20.0, 12.0, 8.0, 3.0, 2.0, 1.0,
                   10.0, 8.0, 5.0, 3.0, 2.0, 1.0,
                   10.0, 5.0, 4.0, 3.0, 2.0, 1.0],
    },
]


class UsageFieldTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_usage_field_players_returns_array(self):
        fixture_json = json.dumps(FIXTURE)
        with patch("pathlib.Path.exists", return_value=True), \
                patch("builtins.open", mock_open(read_data=fixture_json)):
            response = self.client.get("/api/usage-field/players")

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)

        player = data[0]
        for key in ("id", "name", "team", "position", "targets", "avg_depth", "shares"):
            self.assertIn(key, player)
        self.assertEqual(len(player["shares"]), 18)

    def test_usage_field_players_missing_file(self):
        with patch("pathlib.Path.exists", return_value=False):
            response = self.client.get("/api/usage-field/players")

        self.assertEqual(response.status_code, 503)
        data = response.get_json()
        self.assertIn("error", data)


if __name__ == "__main__":
    unittest.main()
