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
  stadium: string | null;
};

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" },
  );
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

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadUpcomingGames() {
      try {
        const response = await fetch(`${backendUrl}/games/upcoming`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }
        const upcomingGames: Game[] = await response.json();
        if (isCurrent) setGames(upcomingGames);
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load upcoming games",
          );
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadUpcomingGames();
    return () => {
      isCurrent = false;
    };
  }, []);

  const firstGame = games[0];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-slate-800 pb-6">
          <p className="text-sm font-semibold text-cyan-300">
            NFL Player Outlook
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">Upcoming games</h1>
          {firstGame && (
            <p className="mt-2 text-sm text-slate-400">
              {firstGame.season} · Week {firstGame.week}
              {firstGame.game_type && firstGame.game_type !== "REG"
                ? ` · ${firstGame.game_type}`
                : ""}
            </p>
          )}
        </header>

        <section className="py-6" aria-live="polite">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Schedule
            {!loading && !error && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                {games.length} {games.length === 1 ? "game" : "games"}
              </span>
            )}
          </h2>

          {loading && (
            <p className="rounded-lg border border-slate-800 p-5 text-slate-300">
              Loading upcoming games...
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-rose-900 bg-rose-950/40 p-5 text-rose-200">
              Could not load the schedule: {error}. Check that the backend is
              running and NFL data has been refreshed.
            </p>
          )}
          {!loading && !error && games.length === 0 && (
            <p className="rounded-lg border border-slate-800 p-5 text-slate-300">
              No upcoming games were found. Refresh the NFL schedule data and
              check again.
            </p>
          )}

          <div className="grid gap-3">
            {games.map((game) => (
              <Link
                key={game.game_id}
                href={`/games/${encodeURIComponent(game.game_id)}`}
                className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-cyan-700 focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <p className="text-sm text-slate-400">
                  {formatDate(game.gameday)} · {formatTime(game.gametime)}
                </p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {game.away_team} <span className="text-slate-500">@</span>{" "}
                  {game.home_team}
                </p>
                {game.stadium && (
                  <p className="mt-1 text-sm text-slate-400">{game.stadium}</p>
                )}
                <span className="mt-3 inline-block text-sm text-cyan-300">
                  View player outlook →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
