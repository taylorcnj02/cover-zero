"""Tests that player-game features exclude the current game's result."""

import unittest

import pandas as pd

from app.features.player_game import (
    build_player_game_features,
    build_upcoming_player_features,
)


class PlayerGameFeatureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.player_stats = pd.DataFrame(
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
                    "receiving_first_downs": week,
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
        self.schedules = pd.DataFrame(
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

    def test_rolling_receiving_yards_only_uses_previous_games(self) -> None:
        features = build_player_game_features(self.player_stats, self.schedules)

        self.assertTrue(pd.isna(features.loc[0, "last_5_receiving_yards"]))
        self.assertEqual(features.loc[1, "last_5_receiving_yards"], 10)
        self.assertEqual(features.loc[2, "last_5_receiving_yards"], 20)
        self.assertEqual(features.loc[2, "last_3_receiving_yards"], 20)
        self.assertEqual(
            features.loc[2, "last_5_receiving_first_downs"],
            1.5,
        )
        self.assertEqual(features.loc[2, "prior_games"], 2)
        self.assertEqual(
            features.loc[1, "opponent_last5_receiving_yards_allowed"],
            10,
        )
        self.assertEqual(
            features.loc[2, "opponent_last5_receiving_yards_allowed"],
            20,
        )

    def test_upcoming_features_use_latest_stats_and_the_upcoming_opponent(self) -> None:
        old_season_stats = self.player_stats.iloc[[0]].copy()
        old_season_stats["game_id"] = "old-season-game"
        old_season_stats["season"] = 2023
        old_season_stats["player_id"] = "retired-player"
        old_season_stats["player_display_name"] = "Former Receiver"
        stats = pd.concat([self.player_stats, old_season_stats], ignore_index=True)
        schedules = pd.concat(
            [
                self.schedules,
                pd.DataFrame(
                    [
                        {
                            "game_id": "old-season-game",
                            "gameday": "2023-09-07",
                            "gametime": "13:00",
                            "home_team": "AAA",
                            "away_team": "BBB",
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )
        upcoming_game = pd.DataFrame(
            [
                {
                    "game_id": "game-4",
                    "season": 2024,
                    "week": 4,
                    "gameday": "2024-09-28",
                    "gametime": "13:00",
                    "away_team": "AAA",
                    "home_team": "BBB",
                }
            ]
        )

        features = build_upcoming_player_features(
            stats,
            schedules,
            upcoming_game,
        )

        self.assertEqual(len(features), 1)
        self.assertEqual(features["player_id"].tolist(), ["player-1"])
        player = features.iloc[0]
        self.assertEqual(player["game_id"], "game-4")
        self.assertEqual(player["opponent_team"], "BBB")
        self.assertEqual(player["prior_games"], 3)
        self.assertAlmostEqual(player["last_3_receiving_yards"], 130 / 3)
        self.assertAlmostEqual(player["last_5_receiving_yards"], 130 / 3)
        self.assertAlmostEqual(
            player["opponent_last5_receiving_yards_allowed"],
            35,
        )
        self.assertEqual(player["opponent_last5_targets_allowed"], 4)


if __name__ == "__main__":
    unittest.main()
