"""Tests that player-game features exclude the current game's result."""

import unittest

import pandas as pd

from app.features.player_game import build_player_game_features


class PlayerGameFeatureTests(unittest.TestCase):
    def test_rolling_receiving_yards_only_uses_previous_games(self) -> None:
        player_stats = pd.DataFrame(
            [
                {
                    "game_id": f"game-{week}",
                    "player_id": "player-1",
                    "player_display_name": "Example Receiver",
                    "position": "WR",
                    "season": 2024,
                    "week": week,
                    "season_type": "REG",
                    "team": "AAA",
                    "opponent_team": "BBB",
                    "receiving_yards": yards,
                    "targets": 4,
                    "receptions": 3,
                    "receiving_tds": 0,
                    "carries": 0,
                    "rushing_yards": 0,
                    "target_share": 0.2,
                    "air_yards_share": 0.3,
                }
                for week, yards in ((1, 10), (2, 30), (3, 90))
            ]
        )
        schedules = pd.DataFrame(
            [
                {
                    "game_id": f"game-{week}",
                    "gameday": f"2024-09-{week * 7:02d}",
                    "gametime": "13:00",
                    "home_team": "AAA",
                    "away_team": "BBB",
                }
                for week in (1, 2, 3)
            ]
        )

        features = build_player_game_features(player_stats, schedules)

        self.assertTrue(pd.isna(features.loc[0, "last_5_receiving_yards"]))
        self.assertEqual(features.loc[1, "last_5_receiving_yards"], 10)
        self.assertEqual(features.loc[2, "last_5_receiving_yards"], 20)
        self.assertEqual(features.loc[2, "last_3_receiving_yards"], 20)
        self.assertEqual(features.loc[2, "prior_games"], 2)
        self.assertEqual(
            features.loc[1, "opponent_last5_receiving_yards_allowed"],
            10,
        )
        self.assertEqual(
            features.loc[2, "opponent_last5_receiving_yards_allowed"],
            20,
        )


if __name__ == "__main__":
    unittest.main()
