"""Load NFL player weekly statistics and schedules into PostgreSQL."""

import pandas as pd
import nflreadpy
from polars import DataFrame

from app.db import engine

SEASONS = [2023, 2024, 2025]


def replace_table(frame: DataFrame, table_name: str) -> int:
    """Write an nflreadpy Polars DataFrame into a PostgreSQL table."""
    # nflreadpy returns Polars data; dictionaries convert it to pandas without
    # requiring an additional Polars-to-pandas bridge dependency.
    data = pd.DataFrame.from_records(frame.to_dicts(), columns=frame.columns)
    data.to_sql(
        table_name,
        con=engine,
        if_exists="replace",
        index=False,
        chunksize=1000,
    )
    return len(data)


def main() -> None:
    # Run with `uv run ...` so the project's isolated .venv supplies dependencies.
    player_stats = nflreadpy.load_player_stats(
        seasons=SEASONS,
        summary_level="week",
    )
    schedules = nflreadpy.load_schedules(seasons=SEASONS)

    for table_name, frame in (
        ("player_weekly_stats", player_stats),
        ("schedules", schedules),
    ):
        row_count = replace_table(frame, table_name)
        print(f"Loaded {row_count:,} rows into {table_name}.")


if __name__ == "__main__":
    main()
