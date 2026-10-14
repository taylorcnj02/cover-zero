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


@router.get("/games/upcoming", response_model=list[dict[str, Any]])
def list_upcoming_games(
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return unplayed games for the next scheduled week."""
    try:
        next_game = db.execute(
            text(
                """
                SELECT season, week
                FROM schedules
                WHERE CAST(gameday AS DATE) >= CURRENT_DATE
                  AND (away_score IS NULL OR home_score IS NULL)
                ORDER BY gameday, gametime, game_id
                LIMIT 1
                """
            )
        ).mappings().first()
        if next_game is None:
            return []

        rows = db.execute(
            text(
                """
                SELECT *
                FROM schedules
                WHERE season = :season
                  AND week = :week
                  AND CAST(gameday AS DATE) >= CURRENT_DATE
                  AND (away_score IS NULL OR home_score IS NULL)
                ORDER BY gameday, gametime, game_id
                """
            ),
            {"season": next_game["season"], "week": next_game["week"]},
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="The schedules table is unavailable. Run scripts/load_data.py.",
        ) from exc

    return [dict(row) for row in rows]


def _load_game_outlook(db: Session, game_id: str) -> dict[str, Any]:
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
        rows = db.execute(
            text(
                """
                WITH prior_players AS (
                    SELECT
                        p.player_id,
                        p.player_display_name,
                        p.position,
                        p.team,
                        p.season,
                        p.week,
                        s.gameday,
                        s.gametime,
                        ROW_NUMBER() OVER (
                            PARTITION BY p.player_id
                            ORDER BY p.season DESC, p.week DESC, s.gameday DESC
                        ) AS team_rank
                    FROM player_weekly_stats p
                    JOIN schedules s ON s.game_id = p.game_id
                    WHERE p.position IN ('QB', 'RB', 'WR', 'TE')
                      AND p.season BETWEEN :first_season AND :season
                      AND (
                          s.gameday < :gameday
                          OR (s.gameday = :gameday AND s.gametime < :gametime)
                      )
                ),
                active_players AS (
                    SELECT player_id, team
                    FROM prior_players
                    WHERE team_rank = 1
                      AND team IN (:away_team, :home_team)
                ),
                recent_stats AS (
                    SELECT
                        p.player_id,
                        p.player_display_name,
                        p.position,
                        p.team,
                        p.opponent_team,
                        p.season,
                        p.week,
                        s.gameday,
                        p.completions,
                        p.attempts,
                        p.passing_yards,
                        p.passing_tds,
                        p.carries,
                        p.rushing_yards,
                        p.rushing_tds,
                        p.receptions,
                        p.targets,
                        p.receiving_yards,
                        p.receiving_tds,
                        ROW_NUMBER() OVER (
                            PARTITION BY p.player_id
                            ORDER BY s.gameday DESC, p.season DESC, p.week DESC
                        ) AS recent_rank
                    FROM player_weekly_stats p
                    JOIN schedules s ON s.game_id = p.game_id
                    JOIN active_players a
                      ON a.player_id = p.player_id AND a.team = p.team
                    WHERE p.position IN ('QB', 'RB', 'WR', 'TE')
                      AND p.season BETWEEN :first_season AND :season
                      AND (
                          s.gameday < :gameday
                          OR (s.gameday = :gameday AND s.gametime < :gametime)
                      )
                )
                SELECT *
                FROM recent_stats
                WHERE recent_rank <= 5
                ORDER BY player_id, recent_rank
                """
            ),
            {
                "away_team": game["away_team"],
                "home_team": game["home_team"],
                "first_season": game["season"] - 1,
                "season": game["season"],
                "gameday": game["gameday"],
                "gametime": game["gametime"],
            },
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Player statistics are unavailable. Run scripts/load_data.py "
                "to refresh schedules and player stats."
            ),
        ) from exc

    try:
        allowed_rows = db.execute(
            text(
                """
                WITH defense_game AS (
                    SELECT
                        p.opponent_team AS defense_team,
                        s.game_id,
                        s.gameday,
                        p.position,
                        SUM(COALESCE(p.passing_yards, 0)) AS passing_yards,
                        COUNT(*) FILTER (
                            WHERE COALESCE(p.attempts, 0) > 0
                        ) AS passing_players,
                        SUM(COALESCE(p.passing_tds, 0)) AS passing_tds,
                        SUM(COALESCE(p.completions, 0)) AS completions,
                        SUM(COALESCE(p.attempts, 0)) AS attempts,
                        SUM(COALESCE(p.rushing_yards, 0)) AS rushing_yards,
                        COUNT(*) FILTER (
                            WHERE COALESCE(p.carries, 0) > 0
                        ) AS rushing_players,
                        SUM(COALESCE(p.rushing_tds, 0)) AS rushing_tds,
                        SUM(COALESCE(p.carries, 0)) AS carries,
                        SUM(COALESCE(p.receiving_yards, 0)) AS receiving_yards,
                        COUNT(*) FILTER (
                            WHERE COALESCE(p.targets, 0) > 0
                        ) AS receiving_players,
                        SUM(COALESCE(p.receiving_tds, 0)) AS receiving_tds,
                        SUM(COALESCE(p.receptions, 0)) AS receptions,
                        SUM(COALESCE(p.targets, 0)) AS targets
                    FROM player_weekly_stats p
                    JOIN schedules s ON s.game_id = p.game_id
                    WHERE p.position IN ('QB', 'RB', 'WR', 'TE')
                      AND p.opponent_team IS NOT NULL
                      AND p.season BETWEEN :first_season AND :season
                      AND (
                          s.gameday < :gameday
                          OR (s.gameday = :gameday AND s.gametime < :gametime)
                      )
                    GROUP BY p.opponent_team, s.game_id, s.gameday, p.position
                ),
                ranked_defense_games AS (
                    SELECT
                        *,
                        ROW_NUMBER() OVER (
                            PARTITION BY defense_team, position
                            ORDER BY gameday DESC, game_id DESC
                        ) AS game_rank
                    FROM defense_game
                )
                SELECT
                    defense_team,
                    position,
                    AVG(passing_yards::numeric / NULLIF(passing_players, 0))
                        FILTER (WHERE passing_players > 0) AS passing_yards,
                    AVG(passing_tds::numeric / NULLIF(passing_players, 0))
                        FILTER (WHERE passing_players > 0) AS passing_tds,
                    AVG(completions::numeric / NULLIF(passing_players, 0))
                        FILTER (WHERE passing_players > 0) AS completions,
                    AVG(attempts::numeric / NULLIF(passing_players, 0))
                        FILTER (WHERE passing_players > 0) AS attempts,
                    AVG(rushing_yards::numeric / NULLIF(rushing_players, 0))
                        FILTER (WHERE rushing_players > 0) AS rushing_yards,
                    AVG(rushing_tds::numeric / NULLIF(rushing_players, 0))
                        FILTER (WHERE rushing_players > 0) AS rushing_tds,
                    AVG(carries::numeric / NULLIF(rushing_players, 0))
                        FILTER (WHERE rushing_players > 0) AS carries,
                    AVG(receiving_yards::numeric / NULLIF(receiving_players, 0))
                        FILTER (WHERE receiving_players > 0) AS receiving_yards,
                    AVG(receiving_tds::numeric / NULLIF(receiving_players, 0))
                        FILTER (WHERE receiving_players > 0) AS receiving_tds,
                    AVG(receptions::numeric / NULLIF(receiving_players, 0))
                        FILTER (WHERE receiving_players > 0) AS receptions,
                    AVG(targets::numeric / NULLIF(receiving_players, 0))
                        FILTER (WHERE receiving_players > 0) AS targets
                FROM ranked_defense_games
                WHERE game_rank <= 5
                GROUP BY defense_team, position
                """
            ),
            {
                "first_season": game["season"] - 1,
                "season": game["season"],
                "gameday": game["gameday"],
                "gametime": game["gametime"],
            },
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Opponent defensive stats are unavailable from the loaded data.",
        ) from exc

    stat_names = (
        "passing_yards",
        "passing_tds",
        "carries",
        "rushing_yards",
        "rushing_tds",
        "receptions",
        "targets",
        "receiving_yards",
        "receiving_tds",
        "completions",
        "attempts",
    )
    matchup_groups = {
        "QB": "QB",
        "RB": "RB",
        "WR": "WR",
        "TE": "TE",
    }
    allowed_by_defense = {
        (row["defense_team"], row["position"]): row for row in allowed_rows
    }
    league_allowed: dict[tuple[str, str], float] = {}
    for metric in stat_names:
        for position in matchup_groups:
            values = [
                float(row[metric])
                for row in allowed_rows
                if row["position"] == position and row[metric] is not None
            ]
            if values:
                league_allowed[(position, metric)] = sum(values) / len(values)

    players_by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        player_id = row["player_id"]
        player = players_by_id.setdefault(
            player_id,
            {
                "player_id": player_id,
                "player_display_name": row["player_display_name"],
                "position": row["position"],
                "team": row["team"],
                "recent_games": [],
            },
        )
        game_stats = {name: row[name] for name in stat_names}
        player["recent_games"].append(
            {
                "season": row["season"],
                "week": row["week"],
                "gameday": row["gameday"],
                "opponent_team": row["opponent_team"],
                **game_stats,
            }
        )

    players = []
    for player in players_by_id.values():
        recent_games = player["recent_games"]
        player_averages = {
            name: (
                sum(game[name] for game in recent_games if game[name] is not None)
                / sum(game[name] is not None for game in recent_games)
            )
            if any(game[name] is not None for game in recent_games)
            else None
            for name in stat_names
        }
        opponent_team = (
            game["home_team"]
            if player["team"] == game["away_team"]
            else game["away_team"]
        )
        defense = allowed_by_defense.get(
            (opponent_team, matchup_groups[player["position"]])
        )
        projection: dict[str, float | None] = {}
        stat_reasons: dict[str, dict[str, Any]] = {}
        for name in stat_names:
            average = player_averages[name]
            adjusted_average = average
            league_average = league_allowed.get((player["position"], name))
            allowed_average = (
                float(defense[name])
                if defense and defense[name] is not None
                else None
            )
            reason = "No recent opponent defensive comparison is available."

            if (
                average is not None
                and allowed_average is not None
                and league_average is not None
                and league_average > 0
            ):
                relative_matchup = allowed_average / league_average
                # Keep this early matchup adjustment deliberately modest.
                adjusted_average = average * (1 + 0.2 * (relative_matchup - 1))
                if relative_matchup > 1.05:
                    reason = (
                        f"{opponent_team} has recently allowed "
                        f"{allowed_average:.1f} {name.replace('_', ' ')} per "
                        f"{player['position']} appearance versus a league "
                        f"average of {league_average:.1f}, nudging this estimate up."
                    )
                elif relative_matchup < 0.95:
                    reason = (
                        f"{opponent_team} has recently allowed "
                        f"{allowed_average:.1f} {name.replace('_', ' ')} per "
                        f"{player['position']} appearance versus a league "
                        f"average of {league_average:.1f}, nudging this estimate down."
                    )
                else:
                    reason = (
                        f"{opponent_team}'s recent results are close to the "
                        "league average, so this estimate stays near the player's baseline."
                    )
            elif average is not None:
                reason = (
                    "This estimate stays at the player's recent average because "
                    "there is not enough comparable defensive data for this stat."
                )

            projection[name] = (
                round(adjusted_average, 1)
                if adjusted_average is not None
                else None
            )
            if average is not None:
                stat_reasons[name] = {
                    "recent_average": round(average, 1),
                    "projection": projection[name],
                    "reason": reason,
                }

        if player["position"] == "QB":
            primary_yards = projection["passing_yards"] or 0
        elif player["position"] == "RB":
            primary_yards = (projection["rushing_yards"] or 0) + (
                projection["receiving_yards"] or 0
            )
        else:
            primary_yards = projection["receiving_yards"] or 0

        player["recent_averages"] = {
            name: round(value, 1) if value is not None else None
            for name, value in player_averages.items()
        }
        player["projection"] = projection
        player["stat_reasons"] = stat_reasons
        player["primary_yards"] = round(primary_yards, 1)
        player["sample_size"] = len(recent_games)
        player["opponent_team"] = opponent_team
        players.append(player)

    return {"game": dict(game), "players": players}


@router.get("/games/{game_id}/outlook", response_model=dict[str, Any])
def get_game_outlook(
    game_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return recent-form baseline estimates for skill-position players."""
    return _load_game_outlook(db, game_id)


@router.get(
    "/games/{game_id}/players/{player_id}/outlook",
    response_model=dict[str, Any],
)
def get_player_outlook(
    game_id: str,
    player_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return one player's recent stats and baseline estimate for a game."""
    outlook = _load_game_outlook(db, game_id)
    player = next(
        (item for item in outlook["players"] if item["player_id"] == player_id),
        None,
    )
    if player is None:
        raise HTTPException(
            status_code=404,
            detail="No recent player stats were found for this matchup.",
        )
    return {"game": outlook["game"], "player": player}


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
