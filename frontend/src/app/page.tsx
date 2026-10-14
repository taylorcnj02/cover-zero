"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Game = {
  game_id: string;
  season: number;
  week: number;
  game_type: string;
  gameday: string | null;
  gametime: string | null;
  away_team: string;
  home_team: string;
  away_score: number | null;
  home_score: number | null;
  stadium: string | null;
};

type SeasonWeek = { season: number; week: number };

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(value: string | null): string {
  if (!value) return "Time TBD";
  const [hours, minutes] = value.split(":").map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours)) {
    return value;
  }
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{note}</p>
    </article>
  );
}

export default function Home() {
  const [availableWeeks, setAvailableWeeks] = useState<SeasonWeek[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadWeeks() {
      try {
        const response = await fetch(`${backendUrl}/games/weeks`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
        const weeks: SeasonWeek[] = await response.json();
        if (!isCurrent) return;

        setAvailableWeeks(weeks);
        if (weeks.length > 0) {
          const query = new URLSearchParams(window.location.search);
          const requestedSeason = Number(query.get("season"));
          const requestedWeek = Number(query.get("week"));
          const requestedPair = weeks.find(
            (entry) =>
              entry.season === requestedSeason && entry.week === requestedWeek,
          );
          const initialSelection = requestedPair ?? weeks[0];
          setSelectedSeason(initialSelection.season);
          setSelectedWeek(initialSelection.week);
        } else {
          setLoading(false);
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load available NFL weeks",
          );
          setLoading(false);
        }
      }
    }

    void loadWeeks();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSeason === null || selectedWeek === null) return;
    let isCurrent = true;

    async function loadGames() {
      setLoading(true);
      setError(null);
      setGames([]);
      try {
        const query = new URLSearchParams({
          season: String(selectedSeason),
          week: String(selectedWeek),
        });
        const response = await fetch(`${backendUrl}/games?${query}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
        const data: Game[] = await response.json();
        if (isCurrent) setGames(data);
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the weekly schedule",
          );
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadGames();
    return () => {
      isCurrent = false;
    };
  }, [selectedSeason, selectedWeek]);

  const seasons = [...new Set(availableWeeks.map(({ season }) => season))];
  const weeksForSeason = availableWeeks
    .filter(({ season }) => season === selectedSeason)
    .map(({ week }) => week)
    .sort((a, b) => a - b);
  const completedGames = games.filter(
    (game) => game.away_score !== null && game.home_score !== null,
  );
  const averagePoints =
    completedGames.length > 0
      ? (
          completedGames.reduce(
            (sum, game) => sum + game.away_score! + game.home_score!,
            0,
          ) / completedGames.length
        ).toFixed(1)
      : "—";
  const averageMargin =
    completedGames.length > 0
      ? (
          completedGames.reduce(
            (sum, game) => sum + Math.abs(game.away_score! - game.home_score!),
            0,
          ) / completedGames.length
        ).toFixed(1)
      : "—";

  function updateUrl(season: number, week: number) {
    window.history.replaceState(null, "", `/?season=${season}&week=${week}`);
  }

  function selectSeason(value: string) {
    const season = Number(value);
    const firstWeek = availableWeeks.find((entry) => entry.season === season)?.week;
    if (firstWeek !== undefined) {
      setSelectedSeason(season);
      setSelectedWeek(firstWeek);
      updateUrl(season, firstWeek);
    }
  }

  function selectWeek(value: string) {
    const week = Number(value);
    setSelectedWeek(week);
    if (selectedSeason !== null) updateUrl(selectedSeason, week);
  }

  return (
    <main className="min-h-screen bg-[#080d18] px-4 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-8 border-b border-slate-800/80 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
              NFL Player Outlook
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Weekly analytics
            </h1>
            <p className="mt-3 max-w-xl leading-6 text-slate-400">
              Explore game results and player performance. Model forecasts will
              appear here once they have been trained and validated.
            </p>
          </div>
          <div className="flex gap-3">
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              Season
              <select
                className="min-w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400"
                disabled={seasons.length === 0}
                onChange={(event) => selectSeason(event.target.value)}
                value={selectedSeason ?? ""}
              >
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              Week
              <select
                className="min-w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400"
                disabled={weeksForSeason.length === 0}
                onChange={(event) => selectWeek(event.target.value)}
                value={selectedWeek ?? ""}
              >
                {weeksForSeason.map((week) => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Games this week"
            value={loading ? "…" : String(games.length)}
            note={`${selectedSeason ?? "—"} season · Week ${selectedWeek ?? "—"}`}
          />
          <SummaryCard
            label="Final scores"
            value={loading ? "…" : String(completedGames.length)}
            note="Games with recorded results"
          />
          <SummaryCard
            label="Avg. combined points"
            value={averagePoints}
            note="Completed games in selected week"
          />
          <SummaryCard
            label="Avg. scoring margin"
            value={averageMargin}
            note="Absolute point difference"
          />
        </section>

        <section className="mt-4 rounded-2xl border border-cyan-900/60 bg-cyan-950/20 p-5 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Forecasting status
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Projections are not available yet
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
              This dashboard shows observed NFL data. Player estimates,
              uncertainty ranges, and model accuracy will be added after a
              baseline model has been backtested.
            </p>
          </div>
          <span className="mt-4 inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 sm:mt-0">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            Model not trained
          </span>
        </section>

        <section className="pt-9" aria-live="polite">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Game results and context
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-white">
                {selectedSeason && selectedWeek
                  ? `${selectedSeason} · Week ${selectedWeek}`
                  : "Weekly schedule"}
              </h2>
            </div>
            {!loading && !error && (
              <span className="text-sm text-slate-500">
                {games.length} {games.length === 1 ? "game" : "games"}
              </span>
            )}
          </div>

          {loading && (
            <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
              Loading game data...
            </p>
          )}
          {error && (
            <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-6">
              <p className="font-semibold text-rose-300">
                Could not load the schedule
              </p>
              <p className="mt-2 text-sm text-rose-200/80">{error}</p>
              <p className="mt-2 text-sm text-slate-400">
                Make sure the API is running at {backendUrl} and NFL data has
                been loaded.
              </p>
            </div>
          )}
          {!loading && !error && availableWeeks.length === 0 && (
            <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
              No schedule data is available yet. Load NFL data from the backend
              to get started.
            </p>
          )}
          {!loading && !error && availableWeeks.length > 0 && games.length === 0 && (
            <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
              No games are listed for this week.
            </p>
          )}

          <div className="grid gap-3">
            {games.map((game) => {
              const isFinal =
                game.away_score !== null && game.home_score !== null;
              return (
                <Link
                  key={game.game_id}
                  href={`/games/${encodeURIComponent(game.game_id)}`}
                  className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-cyan-700 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:p-6"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {formatDate(game.gameday)} · {formatTime(game.gametime)}
                        {game.game_type && game.game_type !== "REG" && (
                          <> · {game.game_type}</>
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-2xl font-semibold">
                        <span>{game.away_team}</span>
                        {isFinal && (
                          <span className="text-slate-400">{game.away_score}</span>
                        )}
                        <span className="text-base font-normal text-slate-600">
                          @
                        </span>
                        <span>{game.home_team}</span>
                        {isFinal && (
                          <span className="text-slate-400">{game.home_score}</span>
                        )}
                      </div>
                      {game.stadium && (
                        <p className="mt-2 truncate text-sm text-slate-500">
                          {game.stadium}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-5 sm:justify-end">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          isFinal
                            ? "bg-slate-800 text-slate-300"
                            : "bg-cyan-950 text-cyan-200"
                        }`}
                      >
                        {isFinal ? "Final" : "Scheduled"}
                      </span>
                      <span className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-4 text-sm font-medium text-slate-200 transition group-hover:border-cyan-600 group-hover:text-cyan-200">
                        Game analysis <span className="ml-2">→</span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">
          Historical results are observed data, not forecasts. Model estimates
          will be presented with ranges and validation metrics when available.
        </footer>
      </div>
    </main>
  );
}
