# NFL Player Outlook

A local-first web app that shows the NFL schedule for the week and, for each game, **predicts how individual players are expected to perform** (for example, receiving yards, carries, touchdowns). Predictions come from a statistical model trained on many factors: usage, matchup, game script, health, weather, scheme, and recent form. Each prediction includes a range and the key reasons behind it.

> **Status:** the local app scaffold, NFL schedule/player UI, and first WR/TE receiving-yards backtest are implemented. Expanding and validating the prediction models, generating current-week projections, and automating data refreshes remain future steps.

> **Reality check:** NFL games are high-variance. Even a great model will miss often on any single player in any single game. The goal is a well-calibrated prediction: a best estimate **plus an honest range**, with its accuracy tracked over time. Projections are estimates, not guarantees.

---

## What the app does

1. Shows the **week's schedule** of games (teams, kickoff time, spread/total, weather, injuries).
2. For each game, shows **projected stat lines** for the relevant players (QB, RB, WR, TE to start).
3. For each projection, shows a **median estimate and a range** (for example, 10th to 90th percentile), a **confidence level**, and the **top factors** driving it (for example, "target share up, soft matchup, WR1 out").
4. **Tracks accuracy** by comparing past predictions to what actually happened.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12 + FastAPI (managed with `uv`) |
| Database | SQLite to start (one line in `.env` to switch to Postgres later) |
| Data | nflverse via `nflreadpy` (free, no API key) |
| ML | pandas, scikit-learn, XGBoost (SHAP later for explanations) |
| Frontend | Next.js (TypeScript) + Tailwind CSS |

## Target folder structure

```
nfl-player-outlook/
  README.md
  .env.example
  .gitignore
  backend/
    pyproject.toml
    app/
      main.py          # FastAPI app and router registration
      config.py        # settings from .env
      db.py            # SQLAlchemy engine and session
      routes/          # games.py, players.py, predictions.py
      features/        # feature building (player-game table)
      models/          # training, prediction, evaluation code
    scripts/
      load_data.py     # pulls nflverse data into the database
      explore.py       # scratch file for looking at data
      build_predictions.py  # generates predictions for the upcoming week
    tests/
  frontend/            # Next.js app
```

> If you already created a folder named `nfl-parlay-app`, you can keep it or rename it. Nothing in the project depends on the folder name.

---

## How to work with Copilot Free

The free plan has a small monthly allowance for chat/agent requests (roughly 50, but check GitHub's docs for current numbers) and a larger one for inline completions. Spend them wisely:

1. **Use Ask mode, not Agent mode**, and make the changes yourself. Agent mode loops and burns requests.
2. **One focused prompt per step.** Bundle related asks into a single message.
3. **Attach context** with `#file:path/to/file.py` instead of pasting code.
4. **Lean on inline completions.** Write a comment describing what you want, then press Tab:
   `# return this week's games as a list of dicts`
5. **Debug elsewhere when you can.** Paste errors into a separate AI chat (or search them) to save Copilot requests for writing code.
6. **Ask it to explain.** You're learning Python, so end prompts with "explain each part briefly."
7. **Commit after every working step** (`git add . && git commit -m "..."`) so you can always roll back.

### Prompt template

```
Context: [what the app is, what files exist, what step I'm on]
Task: [one specific thing to build]
Constraints: [libraries, beginner-friendly, no extra features]
Output: [full file contents / just the function / explain after]
```

---

## Build rhythm: alternate backend and frontend

For each feature, build the smallest backend piece (data, then endpoint), then a bare-bones page that shows it. Skip styling until the features work. During the modeling steps (9 to 11), stay in the backend for a while, since that work lives in Python scripts. Return to the frontend when there are predictions worth showing.

---

## Step 0: Install tools (no AI needed)

```bash
# Install Homebrew first from brew.sh, then:
brew install git uv node
git --version && uv --version && node --version
```

**Done when:** all three commands print a version.
Docker is **not** required to start.

---

## Step 1: Scaffold the project (mostly no AI needed)

```bash
mkdir nfl-player-outlook && cd nfl-player-outlook
git init
npx create-next-app@latest frontend --typescript --tailwind --app

mkdir backend && cd backend
uv init
uv add fastapi "uvicorn[standard]" sqlalchemy pandas pyarrow nflreadpy python-dotenv scikit-learn xgboost
cd ..
```

Create `.env.example` (and copy it to `.env`):

```
DATABASE_URL=sqlite:///./nfl.db
WEATHER_API_KEY=
```

Make sure `.gitignore` includes `.venv/`, `.env`, `__pycache__/`, `*.db`, `node_modules/`, `.next/`.

**Done when:** the folders exist and `git status` runs without errors.
**Commit:** `Initial scaffold`

---

## Step 2: Backend "hello world"

**Goal:** a running FastAPI server with a `/health` route.

**Copilot prompt:**
```
I'm new to Python. In backend/app/main.py create a FastAPI app with a
GET /health route returning {"status": "ok"}, and enable CORS for
http://localhost:3000. Explain each part briefly. Also tell me the exact
command to run it with uv.
```

Run: `cd backend && uv run uvicorn app.main:app --reload`
**Done when:** `http://localhost:8000/health` shows ok and `http://localhost:8000/docs` loads.
**Commit:** `Add FastAPI health route`

---

## Step 3: Config and database connection

**Goal:** read settings from `.env` and connect to SQLite with SQLAlchemy.

**Copilot prompt:**
```
Create backend/app/config.py that loads DATABASE_URL from .env using
python-dotenv, and backend/app/db.py with a SQLAlchemy engine and a
get_session helper for FastAPI. Beginner-friendly comments. No extra features.
```

**Done when:** importing `engine` in a Python shell works without errors.
**Commit:** `Add config and database setup`

---

## Step 4: Load schedules and weekly player stats

**Goal:** pull NFL schedules and weekly player stats into the database for the
seasons from 2023 through the current calendar year.

**Copilot prompt:**
```
Create backend/scripts/load_data.py that uses nflreadpy to load NFL
schedules and player stats for 2023 through the current calendar year,
converts them to pandas, and writes "schedules" and "player_weekly_stats"
tables to the database using the engine in #file:backend/app/db.py
(if_exists="replace"). Explain how it works. Note: nflreadpy returns polars
dataframes.
```

Run: `cd backend && uv run python -m scripts.load_data`
**Done when:** the script prints row counts for both tables and the database has
the current schedule and weekly player stats.
If a function name errors, the package version may differ. Check the nflreadpy docs.
**Commit:** `Load schedules into database`

---

## Step 5: Explore the data

**Goal:** understand what columns exist before building anything on them. This is your best Python lesson.

Create `backend/scripts/explore.py` and use inline completions:

```python
import pandas as pd
from app.db import engine
games = pd.read_sql("SELECT * FROM games", engine)
# show column names
# show games for the most recent week
# which columns hold the spread, total, roof, surface, temp, wind?
```

**Copilot prompt (optional):**
```
Here are my games table columns: [paste list]. Explain what the key columns
mean (spread, total, rest, roof, surface, weather) in plain English.
```

**Done when:** you can name the columns for spread, total, rest days, and weather.

---

## Step 6: First API endpoint: `/games`

**Goal:** return a week's games as JSON.

**Copilot prompt:**
```
Using #file:backend/app/main.py and #file:backend/app/db.py, add a
backend/app/routes/games.py router with GET /games?season=&week= that reads
from the games table and returns JSON. Register the router in main.py.
Default to the latest season/week if none given. Explain briefly.
```

**Done when:** `http://localhost:8000/games` returns data (also try `/docs`).
**Commit:** `Add /games endpoint`

---

## Step 7: First frontend page: the weekly schedule

**Goal:** a page that fetches `/games` and lists the week's games. No styling worries yet.

**Copilot prompt:**
```
In my Next.js App Router project (#file:frontend/app/page.tsx), fetch
http://localhost:8000/games on the server and render a simple list of
games: away team @ home team, kickoff date/time, spread, total. Use Tailwind
for basic layout. Handle the error case if the backend is down.
```

Run: `cd frontend && npm run dev`
**Done when:** `http://localhost:3000` shows real NFL games. **This is your first end-to-end win.**
**Commit:** `Show weekly schedule on frontend`

---

## Step 8: Player data and the player-game table

**Goal:** one row per player per game, the table your model will learn from.

Load these into the database one dataset at a time (each as its own prompt):
- Weekly player stats
- Rosters / player info (height, weight, age, experience)
- Snap counts
- Injury reports (status + practice participation)
- Depth charts

**Copilot prompt (per dataset):**
```
Add loading of nflreadpy [DATASET] for 2023-2025 to
#file:backend/scripts/load_data.py, writing a "[table_name]" table.
Keep the existing code. Explain which columns matter for predicting
receiving yards, receptions, and rushing yards.
```

Then build the joined table:

```
Create backend/app/features/player_game.py with a function that joins
weekly stats, snap counts, rosters, and injuries into one dataframe with one
row per player per game. Use player id + season + week as keys. Explain the
joins. Show me how to check for duplicate rows.
```

**Done when:** `player_game` has one row per player-game and no duplicates.
**Commit:** `Add player-game table`

---

## Step 9: Feature engineering (Phase 1 features)

**Goal:** 20 to 30 useful inputs. More features don't automatically mean better predictions: a player only plays 17 games a season, so a model with too many inputs memorizes noise instead of learning patterns.

Build in this order (these usually matter most):
1. **Opportunity:** snap share, routes, targets, carries, red-zone usage (rolling averages of the last 3 to 5 games)
2. **Game script:** spread and total (a big favorite runs more, a big underdog passes more)
3. **Matchup:** opponent defense vs. position (yards allowed per game, pressure rate)
4. **Health:** player status, practice participation, key teammates out
5. **Context:** home/away, rest days, roof, surface, wind, temperature

**Important:** only use information that was known *before* the game. Rolling averages must exclude the current game, or the model will cheat (this is called data leakage).

**Copilot prompt:**
```
In #file:backend/app/features/player_game.py add rolling features: last-3 and
last-5 game averages of targets, receptions, receiving yards, carries,
rushing yards, and snap share, calculated per player, excluding the current
game (use shift). Explain why shift matters.
```

**Done when:** you can look at any row and confirm every feature was knowable before kickoff.
**Commit:** `Add rolling features`

The initial WR/TE receiving-yards feature builder is in
`backend/app/features/player_game.py`. It shifts player and opponent history
before calculating rolling averages, so the current game cannot leak into its
own features. Snap-share features are omitted until the importer includes
reliable snap data.

---

## Step 10: Baseline model and honest backtest

**Goal:** predict **one stat for one position first** (for example, receiving yards for WR/TE).

**Rules:**
- Train on older seasons and test on a season the model never saw.
- Compare against a dumb baseline (the player's last-5 average). If you can't beat it, the model isn't adding value.
- Predict a **range**, not just one number. Use quantile models (10th, 50th, 90th percentile) so each prediction has a median and an interval.

The implementation is split into three small pieces: the leakage-safe feature
builder (`backend/app/features/player_game.py`), the XGBoost quantile models
and metrics (`backend/app/models/receiving_yards.py`), and the runnable
backtest (`backend/scripts/backtest_receiving_yards.py`). The backtest builds
features directly from the imported `player_weekly_stats` and `schedules`
tables; it does not rely on a separately persisted `player_game` table.

Run the initial holdout backtest with:

```bash
cd backend
uv run python -m scripts.backtest_receiving_yards
```

On the currently loaded nflverse snapshot, training on 2023-2024 and testing
only on 2025 produced a median MAE of **17.71 receiving yards**, compared with
**18.89 yards** for the last-five-game average (a **6.25% lower MAE**). The
10th-to-90th percentile range contained **85.76%** of test results, with an
average width of **59.63 yards**. A feature comparison found rolling receiving
first downs improved this holdout slightly; adding receiving air yards and
yards after catch did not, so those two features were excluded. This is a
modest improvement on one holdout, not proof of future accuracy; refresh data
and rerun the command to reproduce metrics for the current database.

On macOS, if XGBoost reports that `libomp.dylib` is missing, install its
OpenMP runtime with `brew install libomp`.

**Done when:** the script reports the held-out model and baseline errors and
the share of actual results inside the prediction range.
**Commit:** `Add baseline receiving yards model`

---

## Step 11: Improve the model and expand coverage

Work through these one at a time, backtesting after each. **Keep a change only if it improves test results.**

**Add richer data (Phase 2):**
- Next Gen Stats (separation, time to throw, rush yards over expected)
- PFR advanced stats (pressure rates, drops, blitz rates)
- FTN charting (play-action, motion, RPO, screens)
- Weather forecast (an API with a free tier) and referee crew data
- Quarterback and offensive line context: QB efficiency, pressure allowed, running game strength
- Teammate effects: if WR1 is out, how do WR2 and the TE change?

**Expand targets:**
- Receivers: targets, receptions, receiving yards, touchdowns
- Running backs: carries, rushing yards, receptions, touchdowns
- Quarterbacks: passing yards, passing TDs, interceptions, rushing yards

**Factors that can't be measured directly** (football IQ, confidence, chemistry, motivation, film tells) can only be approximated with proxies (for example contract year, penalty history, target share growth with a QB). Add proxies only if they help in backtests. Paid data (PFF grades and similar) is a Phase 4 decision, only if the model clearly needs it.

**Copilot prompt (per addition):**
```
Add these features to #file:backend/app/features/player_game.py: [list].
Keep existing features. Make sure none use information from the current
game or later. Then show how to compare test MAE before and after.
```

**Commit:** one commit per feature group

---

## Step 12: Generate predictions for the upcoming week

**Goal:** a repeatable pipeline that produces predictions for games that haven't happened yet.

**What's different from training:** upcoming games have no results, so features must be built from data available right now (recent form, current injury report, forecast weather, current spread and total).

- Build a feature row for each expected player in each upcoming game.
- Handle uncertainty: a player listed as "questionable" should get a lower expected snap share and a wider range. Skip players ruled out.
- Save results to a `predictions` table: player, game, stat, 10th/50th/90th percentile, top factors, timestamp.

**Copilot prompt:**
```
Create backend/scripts/build_predictions.py that, for the next unplayed week
in the games table, builds feature rows for each active skill-position
player using #file:backend/app/features/player_game.py, loads the trained
models, and writes a predictions table with player id, game id, stat, p10,
p50, p90, and created_at. Explain how upcoming-game features differ from
training features.
```

**Done when:** running the script fills the `predictions` table for this week's games.
**Commit:** `Add weekly prediction pipeline`

---

## Step 13: Player outlook UI and explanations

**Goal:** the screens that make the predictions useful.

- **Week view:** the schedule from Step 7, each game linking to its detail page.
- **Game page:** key players for both teams with their projected stat lines, ranges, and injury status.
- **Player page:** the player's projection for the next game, recent game log, season trends, and matchup notes.
- **Explanations:** show the top factors behind each projection. Let the **statistical model produce the reasons** (feature contributions, for example with SHAP), so they're real. If you later add an LLM to phrase them in plain English, give it only the model's actual numbers so it can't invent reasons.

The initial UI shows position-specific stat estimates based on a player's last
five available games, with a small adjustment based on the opponent's recent
results against that position. Selecting an estimate opens its game log and
explains the comparison with the opponent and league averages. These are
transparent heuristics, not trained or backtested predictions; the data does
not identify individual cornerback matchups or current injury/lineup changes.
Replace the baseline with validated model output after Step 10.

Endpoints: `GET /games/{id}/predictions`, `GET /players/{id}/outlook`

**Copilot prompt:**
```
Add backend/app/routes/predictions.py with GET /games/{game_id}/predictions
returning each player's projections (p10, p50, p90) and top factors from the
predictions table. Then add a Next.js page at frontend/app/games/[id]/page.tsx
that lists players grouped by team with a simple range display. Explain briefly.
```

**Done when:** you can click a game and see projected stat lines for its players.
**Commit:** `Add game predictions page`

---

## Step 14: Keep data fresh

- Schedule refreshes (injury reports update Wednesday through Friday; inactives post about 90 minutes before kickoff).
- Re-run predictions when key information changes (injury designations, weather forecast, inactives).
- Use a simple scheduler (APScheduler or cron) first. Don't over-engineer.
- Show a "last updated" time in the UI.

---

## Step 15: Track accuracy, polish, and deploy

- [ ] **Accuracy page:** after games finish, compare predictions to actual results and show error and range coverage over time. Honest tracking builds trust (include misses).
- [ ] Calibrate: if the 10-90 range captures only 60% of results, widen it
- [ ] Disclaimers: projections are estimates, not guarantees, and not betting advice
- [ ] Polish the UI (layout, colors, charts, mobile view)
- [ ] Move to Postgres if you need it
- [ ] Deploy (frontend on Vercel, backend on a small host such as Render or Fly.io)

> If you ever add betting lines, odds, or sportsbook links, check state rules and add 21+ and responsible-gambling messaging at that point.

---

## Data roadmap

| Phase | Data | Source |
|---|---|---|
| 1 | Schedules, play-by-play, weekly player stats, snap counts, injuries, rosters, depth charts | nflverse (free) |
| 2 | Next Gen Stats, PFR advanced, FTN charting, officials, combine measurables | nflverse (free) |
| 2 | Weather forecast | Weather API (free tier) |
| 3 | Proxies for subjective factors (contract year, discipline, trends) | Free sources and your own calculations |
| 4 | Route, hands, and blocking grades | Paid (PFF or Sports Info Solutions), only if needed |

---

## Quick troubleshooting

| Problem | Try |
|---|---|
| `uv` or `npm` command not found | Reinstall with Homebrew and restart Terminal |
| Function name errors from `nflreadpy` | Check the package docs; names can change between versions |
| Frontend can't reach backend | Confirm backend is on port 8000 and CORS allows `http://localhost:3000` |
| Model looks too good to be true | You likely have data leakage. Re-check that features exclude the current game |
| Ranges too narrow (actuals fall outside often) | Widen or recalibrate the quantile models |
| Out of Copilot requests | Switch to inline comment completions until the monthly reset |

## Commit checklist

After each step: run it, confirm the "Done when" check, then `git add . && git commit -m "<step name>"`.
