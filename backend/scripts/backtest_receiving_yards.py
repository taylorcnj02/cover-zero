"""Run the WR/TE receiving-yards holdout backtest."""

import argparse
import json

from app.db import engine
from app.features.player_game import (
    BASE_FEATURE_COLUMNS,
    FEATURE_COLUMNS,
    load_player_game_features,
)
from app.models.receiving_yards import backtest_receiving_yards


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backtest WR/TE receiving yards against the last-five baseline."
    )
    parser.add_argument(
        "--test-season",
        type=int,
        default=2025,
        help="Held-out season; all earlier seasons are used to train (default: 2025).",
    )
    args = parser.parse_args()

    with engine.connect() as connection:
        features = load_player_game_features(connection)
    core_result, _ = backtest_receiving_yards(
        features,
        args.test_season,
        BASE_FEATURE_COLUMNS,
    )
    result, predictions = backtest_receiving_yards(
        features,
        args.test_season,
        FEATURE_COLUMNS,
    )

    print("WR/TE receiving-yards holdout backtest")
    print(
        json.dumps(
            {
                "core_features": core_result.as_dict(),
                "plus_receiving_first_downs": result.as_dict(),
            },
            indent=2,
        )
    )
    print("\nSample held-out predictions (yards):")
    print(
        predictions[
            [
                "player_display_name",
                "position",
                "team",
                "week",
                "receiving_yards",
                "baseline_last5",
                "p10",
                "p50",
                "p90",
            ]
        ]
        .head(10)
        .round(1)
        .to_string(index=False)
    )
    print(
        "\nMAE is the average absolute miss in yards (lower is better). "
        "The P10–P90 coverage is the share of actual results inside the "
        "model's 10th-to-90th percentile range; it should be about 80%."
    )


if __name__ == "__main__":
    main()
