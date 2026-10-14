"""Build and save next-week WR/TE receiving-yards predictions."""

import argparse
import json
from datetime import date

import pandas as pd
from sqlalchemy import text

from app.db import engine
from app.features.player_game import (
    FEATURE_COLUMNS,
    build_upcoming_player_features,
    build_player_game_features,
    load_player_game_data,
)
from app.models.receiving_yards import (
    load_receiving_yards_models,
    predict_receiving_yards,
    explain_receiving_yards,
    save_receiving_yards_models,
    train_receiving_yards_models,
)


CREATE_PREDICTIONS_TABLE = text(
    """
    CREATE TABLE IF NOT EXISTS predictions (
        prediction_id BIGSERIAL PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_display_name TEXT NOT NULL,
        position TEXT NOT NULL,
        team TEXT NOT NULL,
        opponent_team TEXT NOT NULL,
        stat TEXT NOT NULL,
        p10 DOUBLE PRECISION NOT NULL,
        p50 DOUBLE PRECISION NOT NULL,
        p90 DOUBLE PRECISION NOT NULL,
        trained_through_season INTEGER NOT NULL,
        model_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """
)
ADD_MODEL_FACTORS_COLUMN = text(
    """
    ALTER TABLE predictions
    ADD COLUMN IF NOT EXISTS model_factors JSONB NOT NULL DEFAULT '[]'::jsonb
    """
)
INSERT_PREDICTION = text(
    """
    INSERT INTO predictions (
        game_id, player_id, player_display_name, position, team, opponent_team,
        stat, p10, p50, p90, trained_through_season, model_factors
    ) VALUES (
        :game_id, :player_id, :player_display_name, :position, :team,
        :opponent_team, 'receiving_yards', :p10, :p50, :p90,
        :trained_through_season, CAST(:model_factors AS JSONB)
    )
    """
)


def select_upcoming_week(schedules: pd.DataFrame) -> pd.DataFrame:
    """Choose unplayed games in the earliest scheduled week from today onward."""
    games = schedules.copy()
    games["gameday"] = pd.to_datetime(games["gameday"], errors="coerce")
    upcoming = games.loc[
        (games["gameday"].dt.date >= date.today())
        & (games["away_score"].isna() | games["home_score"].isna())
    ].sort_values(["gameday", "gametime", "game_id"], kind="stable")
    if upcoming.empty:
        raise ValueError(
            "No unplayed games are scheduled from today onward. "
            "Refresh the schedule data and try again."
        )

    first_game = upcoming.iloc[0]
    return upcoming.loc[
        (upcoming["season"] == first_game["season"])
        & (upcoming["week"] == first_game["week"])
    ].copy()


def save_predictions(
    predictions: pd.DataFrame,
    trained_through_season: int,
) -> None:
    """Append one timestamped prediction snapshot for each player and game."""
    rows = [
        {
            "game_id": str(row.game_id),
            "player_id": str(row.player_id),
            "player_display_name": str(row.player_display_name),
            "position": str(row.position),
            "team": str(row.team),
            "opponent_team": str(row.opponent_team),
            "p10": float(row.p10),
            "p50": float(row.p50),
            "p90": float(row.p90),
            "trained_through_season": trained_through_season,
            "model_factors": json.dumps(row.model_factors),
        }
        for row in predictions.itertuples(index=False)
    ]
    if not rows:
        raise ValueError(
            "No eligible WR/TE players have prior game data for the upcoming week."
        )

    with engine.begin() as connection:
        connection.execute(CREATE_PREDICTIONS_TABLE)
        connection.execute(ADD_MODEL_FACTORS_COLUMN)
        connection.execute(INSERT_PREDICTION, rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate WR/TE receiving-yards ranges for the next NFL week."
    )
    parser.add_argument(
        "--season",
        type=int,
        help="Optional season override, useful for testing historical schedules.",
    )
    parser.add_argument(
        "--week",
        type=int,
        help="Optional week override; must be provided with --season.",
    )
    args = parser.parse_args()
    if (args.season is None) != (args.week is None):
        parser.error("--season and --week must be supplied together.")

    with engine.connect() as connection:
        player_stats, schedules = load_player_game_data(connection)

    if args.season is not None:
        upcoming_games = schedules.loc[
            (schedules["season"] == args.season)
            & (schedules["week"] == args.week)
            & (schedules["away_score"].isna() | schedules["home_score"].isna())
        ].copy()
        if upcoming_games.empty:
            raise ValueError(f"No unplayed games found for {args.season} week {args.week}.")
    else:
        upcoming_games = select_upcoming_week(schedules)

    target_season = int(upcoming_games["season"].iloc[0])
    trained_through_season = target_season - 1
    features = build_upcoming_player_features(
        player_stats,
        schedules,
        upcoming_games,
    )
    if features.empty:
        raise ValueError(
            "No eligible WR/TE players had prior appearances for these games. "
            "Check that player stats are loaded."
        )

    models = load_receiving_yards_models(trained_through_season)
    if models is None:
        training_features = build_player_game_features(player_stats, schedules)
        models = train_receiving_yards_models(
            training_features,
            trained_through_season,
        )
        save_receiving_yards_models(models, trained_through_season)

    quantiles = predict_receiving_yards(models, features)
    explanations = explain_receiving_yards(models, features)
    output = features[
        [
            "game_id",
            "player_id",
            "player_display_name",
            "position",
            "team",
            "opponent_team",
        ]
    ].reset_index(drop=True)
    output[["p10", "p50", "p90"]] = quantiles.reset_index(drop=True)
    output["model_factors"] = explanations
    save_predictions(output, trained_through_season)

    print(
        f"Saved {len(output):,} WR/TE receiving-yards predictions for "
        f"{target_season} week {int(upcoming_games['week'].iloc[0])} "
        f"({upcoming_games['game_id'].nunique()} games)."
    )
    print(
        f"Models trained through {trained_through_season}; "
        f"features: {', '.join(FEATURE_COLUMNS)}."
    )
    print(
        "The player list uses appearances from the target season, or the "
        "previous season before target-season results exist. This is not a "
        "confirmed roster or injury report."
    )
    print(output.head(10).round(1).to_string(index=False))


if __name__ == "__main__":
    main()
