"""Build features that were available before each WR/TE game."""

import pandas as pd

CORE_ROLLING_STATS = (
    "targets",
    "receptions",
    "receiving_yards",
    "carries",
    "rushing_yards",
    "target_share",
    "air_yards_share",
)
EXTRA_ROLLING_STATS = (
    "receiving_first_downs",
)
ROLLING_STATS = CORE_ROLLING_STATS + EXTRA_ROLLING_STATS
BASE_FEATURE_COLUMNS = (
    "prior_games",
    "is_home",
    "is_te",
    *(
        f"last_{window}_{stat}"
        for window in (3, 5)
        for stat in CORE_ROLLING_STATS
    ),
    "opponent_last5_receiving_yards_allowed",
    "opponent_last5_targets_allowed",
)
FEATURE_COLUMNS = BASE_FEATURE_COLUMNS + tuple(
    f"last_{window}_{stat}"
    for window in (3, 5)
    for stat in EXTRA_ROLLING_STATS
)


def build_player_game_features(
    player_stats: pd.DataFrame,
    schedules: pd.DataFrame,
) -> pd.DataFrame:
    """Return regular-season WR/TE rows with all rolling stats lagged one game."""
    schedule_columns = [
        "game_id",
        "gameday",
        "gametime",
        "home_team",
        "away_team",
    ]
    schedule = schedules[schedule_columns].drop_duplicates("game_id")
    games = player_stats.merge(schedule, on="game_id", how="inner")
    games = games.loc[
        (games["season_type"] == "REG")
        & games["position"].isin(("WR", "TE"))
        & games["player_id"].notna()
        & games["receiving_yards"].notna()
    ].copy()
    games["gameday"] = pd.to_datetime(games["gameday"], errors="coerce")
    games = games.dropna(subset=["gameday"])
    games = games.sort_values(
        ["gameday", "gametime", "game_id", "player_id"],
        kind="stable",
    ).reset_index(drop=True)
    games["is_home"] = (games["team"] == games["home_team"]).astype("int8")
    games["is_te"] = (games["position"] == "TE").astype("int8")

    grouped_stats = games.groupby("player_id", sort=False)
    games["prior_games"] = grouped_stats.cumcount()
    for stat in ROLLING_STATS:
        if stat not in games:
            games[stat] = pd.NA
        prior_values = games.groupby("player_id", sort=False)[stat].transform(
            lambda values: values.shift(1)
        )
        for window in (3, 5):
            games[f"last_{window}_{stat}"] = prior_values.groupby(
                games["player_id"], sort=False
            ).transform(lambda values: values.rolling(window, min_periods=1).mean())

    # Each opponent's position-specific game totals are shifted before they are
    # rolled, so a player's current-game result cannot enter its own features.
    defense_games = (
        games.groupby(
            ["opponent_team", "position", "game_id", "gameday"],
            as_index=False,
            dropna=False,
        )
        .agg(
            receiving_yards_allowed=("receiving_yards", "sum"),
            targets_allowed=("targets", "sum"),
            receiving_players=("targets", lambda values: values.gt(0).sum()),
        )
        .sort_values(
            ["gameday", "game_id", "opponent_team", "position"],
            kind="stable",
        )
    )
    denominator = defense_games["receiving_players"].replace(0, float("nan"))
    defense_games["receiving_yards_per_player"] = (
        defense_games["receiving_yards_allowed"] / denominator
    )
    defense_games["targets_per_player"] = (
        defense_games["targets_allowed"] / denominator
    )
    defense_group = defense_games.groupby(
        ["opponent_team", "position"],
        sort=False,
    )
    for source, feature in (
        ("receiving_yards_per_player", "opponent_last5_receiving_yards_allowed"),
        ("targets_per_player", "opponent_last5_targets_allowed"),
    ):
        prior_values = defense_group[source].transform(lambda values: values.shift(1))
        defense_games[feature] = prior_values.groupby(
            [defense_games["opponent_team"], defense_games["position"]],
            sort=False,
        ).transform(lambda values: values.rolling(5, min_periods=1).mean())

    games = games.merge(
        defense_games[
            [
                "opponent_team",
                "position",
                "game_id",
                "opponent_last5_receiving_yards_allowed",
                "opponent_last5_targets_allowed",
            ]
        ],
        on=["opponent_team", "position", "game_id"],
        how="left",
        validate="many_to_one",
    )
    return games


def load_player_game_features(connection) -> pd.DataFrame:
    """Load NFLverse tables from the database and build leakage-safe features."""
    player_stats = pd.read_sql(
        """
        SELECT *
        FROM player_weekly_stats
        WHERE position IN ('WR', 'TE')
        """,
        con=connection,
    )
    schedules = pd.read_sql(
        """
        SELECT game_id, gameday, gametime, home_team, away_team
        FROM schedules
        """,
        con=connection,
    )
    return build_player_game_features(player_stats, schedules)
