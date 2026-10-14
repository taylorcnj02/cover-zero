# NFL Parlay App

A local monorepo starter for NFL data: FastAPI and PostgreSQL in the backend,
with a Next.js frontend. It loads weekly player statistics and schedules from
nflverse through `nflreadpy`. No odds API key is needed for this scaffold.

## Prerequisites

- macOS with Homebrew
- Node.js and npm
- `uv` (`brew install uv`)
- Docker Desktop, running on your Mac

The backend project requires Python 3.12. The repository's `.python-version`
file pins `uv` to that version, even if another version is installed globally.

If Docker Desktop is not installed yet, install it from Docker's website or run
these commands, then finish Docker Desktop's first-launch prompts:

```bash
brew install --cask docker
open -a Docker
docker info
```

## First-time setup

From the repository root:

```bash
cp .env.example .env
```

Change `POSTGRES_PASSWORD` in `.env` to a local password, and make the same
change in `DATABASE_URL`. Keep `.env` private; it is excluded from Git.

Install/select Python 3.12 and install the backend dependencies:

```bash
cd backend
uv python install 3.12
uv sync
cd ..
```

`uv sync` reads `pyproject.toml` and installs the backend packages into the
project's `backend/.venv` virtual environment, keeping them separate from other
Python projects. You do not need to activate it manually; `uv run` uses it.

The frontend dependencies were installed by `create-next-app`. If needed, you
can restore them with:

```bash
cd frontend
npm install
cd ..
```

## Start the database

Make sure Docker Desktop is open, then run from the repository root:

```bash
docker compose up -d db
docker compose ps
```

The PostgreSQL 16 data is kept in the named `postgres_data` Docker volume, so it
survives container restarts.

## Load NFL data

With the database running and `.env` configured:

```bash
cd backend
uv run python scripts/load_data.py
```

This replaces and reloads the `player_weekly_stats` and `schedules` tables for
seasons 2023, 2024, and 2025.

## Run the app

Open two Terminal windows from the repository root.

In the first window, start the API:

```bash
cd backend
uv run uvicorn app.main:app --reload
```

In the second window, start Next.js:

```bash
cd frontend
npm run dev
```

Open <http://localhost:3000>. The homepage checks the API at
<http://localhost:8000/health> and displays **Backend connected** when it
receives a successful health response. You can also verify the API directly:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

After importing the schedules, `GET http://localhost:8000/games` returns the
games in the latest available season and week. You can select a season and/or
week with query parameters, for example:

```bash
curl "http://localhost:8000/games?season=2025&week=1"
```

Interactive API documentation is available at <http://localhost:8000/docs>.

## Stop the services

Stop the API and frontend with `Ctrl+C` in their Terminal windows. Stop the
database container from the repository root:

```bash
docker compose down
```

The named database volume is preserved by this command.
