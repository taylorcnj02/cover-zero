"""Load local application settings from the repository's .env file."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# uv keeps each project's Python packages in an isolated virtual environment.
# Loading the root .env here lets the app find settings from any working folder.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    odds_api_key: str | None


database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is missing; copy .env.example to .env first.")

settings = Settings(
    database_url=database_url,
    odds_api_key=os.getenv("ODDS_API_KEY"),
)
