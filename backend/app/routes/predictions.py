"""Endpoints for stored model predictions and accuracy tracking."""

from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import engine, get_db
from app.features.player_game import load_player_game_features
from app.models.receiving_yards import backtest_receiving_yards

router = APIRouter()


@router.get("/predictions/status", response_model=dict[str, Any])
def get_prediction_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return the newest saved forecast snapshot and its size."""
    try:
        table_exists = db.execute(
            text("SELECT to_regclass('public.predictions')")
        ).scalar_one_or_none()
        if table_exists is None:
            return {"available": False, "last_updated": None, "player_count": 0}

        snapshot = db.execute(
            text(
                """
                WITH latest AS (
                    SELECT MAX(created_at) AS created_at
                    FROM predictions
                )
                SELECT
                    latest.created_at,
                    COUNT(*) AS player_count,
                    COUNT(DISTINCT predictions.game_id) AS game_count,
                    MAX(predictions.trained_through_season)
                        AS trained_through_season,
                    MAX(schedules.season) AS season,
                    MAX(schedules.week) AS week
                FROM latest
                LEFT JOIN predictions
                    ON predictions.created_at = latest.created_at
                LEFT JOIN schedules
                    ON schedules.game_id = predictions.game_id
                GROUP BY latest.created_at
                """
            )
        ).mappings().one()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not read prediction status from PostgreSQL.",
        ) from exc

    return {
        "available": snapshot["created_at"] is not None,
        "last_updated": snapshot["created_at"],
        "player_count": snapshot["player_count"],
        "game_count": snapshot["game_count"],
        "trained_through_season": snapshot["trained_through_season"],
        "season": snapshot["season"],
        "week": snapshot["week"],
    }


@router.get(
    "/games/{game_id}/predictions",
    response_model=dict[str, Any],
)
def get_game_predictions(
    game_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return the newest saved receiving-yards range for each player in a game."""
    try:
        table_exists = db.execute(
            text("SELECT to_regclass('public.predictions')")
        ).scalar_one_or_none()
        if table_exists is None:
            return {"game_id": game_id, "last_updated": None, "players": []}

        rows = db.execute(
            text(
                """
                WITH ranked_predictions AS (
                    SELECT
                        game_id,
                        player_id,
                        player_display_name,
                        position,
                        team,
                        opponent_team,
                        stat,
                        p10,
                        p50,
                        p90,
                        trained_through_season,
                        COALESCE(
                            to_jsonb(predictions)->'model_factors',
                            '[]'::jsonb
                        ) AS model_factors,
                        created_at,
                        ROW_NUMBER() OVER (
                            PARTITION BY game_id, player_id, stat
                            ORDER BY created_at DESC, prediction_id DESC
                        ) AS prediction_rank
                    FROM predictions
                    WHERE game_id = :game_id
                )
                SELECT *
                FROM ranked_predictions
                WHERE prediction_rank = 1
                ORDER BY p50 DESC, player_display_name
                """
            ),
            {"game_id": game_id},
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not read model predictions from PostgreSQL.",
        ) from exc

    return {
        "game_id": game_id,
        "last_updated": max((row["created_at"] for row in rows), default=None),
        "players": [
            {
                "player_id": row["player_id"],
                "player_display_name": row["player_display_name"],
                "position": row["position"],
                "team": row["team"],
                "opponent_team": row["opponent_team"],
                "stat": row["stat"],
                "p10": row["p10"],
                "p50": row["p50"],
                "p90": row["p90"],
                "trained_through_season": row["trained_through_season"],
                "model_factors": row["model_factors"],
                "created_at": row["created_at"],
            }
            for row in rows
        ],
    }


def _tracked_forecast_rows(db: Session) -> list[dict[str, Any]]:
    """Read only saved predictions made before kickoff for completed games."""
    try:
        return [
            dict(row)
            for row in db.execute(
                text(
                    """
                    WITH ranked_predictions AS (
                        SELECT
                            p.game_id,
                            p.player_id,
                            p.p10,
                            p.p50,
                            p.p90,
                            p.created_at,
                            s.season,
                            s.week,
                            stats.receiving_yards AS actual,
                            ROW_NUMBER() OVER (
                                PARTITION BY p.game_id, p.player_id, p.stat
                                ORDER BY p.created_at DESC, p.prediction_id DESC
                            ) AS prediction_rank
                        FROM predictions p
                        JOIN schedules s ON s.game_id = p.game_id
                        JOIN player_weekly_stats stats
                          ON stats.game_id = p.game_id
                         AND stats.player_id = p.player_id
                        WHERE p.stat = 'receiving_yards'
                          AND s.away_score IS NOT NULL
                          AND s.home_score IS NOT NULL
                          AND stats.receiving_yards IS NOT NULL
                          AND p.created_at < (
                              s.gameday::date
                              + COALESCE(
                                  NULLIF(s.gametime::text, '')::time,
                                  TIME '00:00'
                                )
                          ) AT TIME ZONE 'America/New_York'
                    )
                    SELECT
                        game_id,
                        player_id,
                        season,
                        week,
                        actual,
                        p10,
                        p50,
                        p90
                    FROM ranked_predictions
                    WHERE prediction_rank = 1
                    ORDER BY season, week, game_id, player_id
                    """
                )
            ).mappings().all()
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not compare saved predictions with completed NFL results."
            ),
        ) from exc


def _summarize_tracking(
    predictions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Summarize prediction error and range coverage by completed forecast."""
    if not predictions:
        return {
            "prediction_count": 0,
            "mae": None,
            "p10_p90_coverage_percent": None,
            "weeks": [],
        }

    frame = pd.DataFrame(predictions)
    frame["absolute_error"] = (frame["actual"] - frame["p50"]).abs()
    frame["covered"] = frame["actual"].between(frame["p10"], frame["p90"])
    weekly = (
        frame.groupby(["season", "week"], as_index=False)
        .agg(
            prediction_count=("actual", "size"),
            mae=("absolute_error", "mean"),
            p10_p90_coverage_percent=("covered", "mean"),
        )
        .sort_values(["season", "week"])
    )
    return {
        "prediction_count": len(frame),
        "mae": round(float(frame["absolute_error"].mean()), 2),
        "p10_p90_coverage_percent": round(
            float(frame["covered"].mean() * 100),
            2,
        ),
        "weeks": [
            {
                "season": int(row.season),
                "week": int(row.week),
                "prediction_count": int(row.prediction_count),
                "mae": round(float(row.mae), 2),
                "p10_p90_coverage_percent": round(
                    float(row.p10_p90_coverage_percent * 100),
                    2,
                ),
            }
            for row in weekly.itertuples(index=False)
        ],
    }


def _held_out_backtest() -> dict[str, Any]:
    """Compute the time-ordered holdout benchmark using current database data."""
    with engine.connect() as connection:
        features = load_player_game_features(connection)
    result, predictions = backtest_receiving_yards(features, test_season=2025)
    return {
        **result.as_dict(),
        "weekly": _summarize_tracking(
            predictions.rename(columns={"receiving_yards": "actual"}).to_dict(
                orient="records"
            )
        )["weeks"],
    }


@router.get("/accuracy/receiving-yards", response_model=dict[str, Any])
def get_receiving_yards_accuracy(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Compare saved forecast results and the held-out 2025 benchmark."""
    try:
        table_exists = db.execute(
            text("SELECT to_regclass('public.predictions')")
        ).scalar_one_or_none()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not check prediction tables in PostgreSQL.",
        ) from exc

    tracking = (
        _summarize_tracking(_tracked_forecast_rows(db))
        if table_exists is not None
        else _summarize_tracking([])
    )
    return {
        "stat": "receiving_yards",
        "tracking": tracking,
        "held_out_backtest": _held_out_backtest(),
        "note": (
            "The 2025 holdout uses 2023–2024 for training. Live tracking "
            "includes only saved forecasts made before kickoff."
        ),
    }
