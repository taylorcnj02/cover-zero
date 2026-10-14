"""Endpoints for reading NFL schedules from the database."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter()


@router.get("/games", response_model=list[dict[str, Any]])
def list_games(
    season: int | None = Query(default=None, ge=1999, le=2100),
    week: int | None = Query(default=None, ge=1, le=22),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return schedule rows for a season and week, defaulting to latest data."""
    try:
        if season is None:
            season = db.execute(
                text("SELECT MAX(season) FROM schedules")
            ).scalar_one_or_none()
            if season is None:
                raise HTTPException(
                    status_code=503,
                    detail="No schedule data is loaded. Run scripts/load_data.py first.",
                )

        if week is None:
            week = db.execute(
                text("SELECT MAX(week) FROM schedules WHERE season = :season"),
                {"season": season},
            ).scalar_one_or_none()
            if week is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"No schedule weeks were found for season {season}.",
                )

        rows = db.execute(
            text(
                """
                SELECT *
                FROM schedules
                WHERE season = :season AND week = :week
                ORDER BY gameday, gametime, game_id
                """
            ),
            {"season": season, "week": week},
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The schedules table is unavailable. Start the database and run "
                "scripts/load_data.py."
            ),
        ) from exc

    return [dict(row) for row in rows]


@router.get("/games/weeks", response_model=list[dict[str, int]])
def list_available_weeks(
    db: Session = Depends(get_db),
) -> list[dict[str, int]]:
    """List season/week pairs present in the imported schedule table."""
    try:
        rows = db.execute(
            text(
                """
                SELECT DISTINCT season, week
                FROM schedules
                WHERE season IS NOT NULL AND week IS NOT NULL
                ORDER BY season DESC, week DESC
                """
            )
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="The schedules table is unavailable. Run scripts/load_data.py.",
        ) from exc

    return [dict(row) for row in rows]


@router.get("/games/{game_id}", response_model=dict[str, Any])
def get_game(
    game_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return one schedule entry and its player statistics, when available."""
    try:
        game = db.execute(
            text("SELECT * FROM schedules WHERE game_id = :game_id"),
            {"game_id": game_id},
        ).mappings().first()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="The schedules table is unavailable. Run scripts/load_data.py.",
        ) from exc

    if game is None:
        raise HTTPException(status_code=404, detail="Game not found.")

    try:
        players = db.execute(
            text(
                """
                SELECT
                    player_id, player_display_name, position, team, opponent_team,
                    completions, passing_yards, passing_tds, carries, rushing_yards,
                    rushing_tds, receptions, targets, receiving_yards,
                    receiving_tds, fantasy_points_ppr
                FROM player_weekly_stats
                WHERE game_id = :game_id
                ORDER BY position, player_display_name
                """
            ),
            {"game_id": game_id},
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Player statistics are not loaded. Run scripts/load_data.py "
                "to load the schedule and player stats."
            ),
        ) from exc

    return {"game": dict(game), "players": [dict(player) for player in players]}
