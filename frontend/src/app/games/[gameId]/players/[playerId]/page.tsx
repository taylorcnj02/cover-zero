"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Game = {
  game_id: string;
  season: number;
  week: number;
  gameday: string | null;
  away_team: string;
  home_team: string;
};

type StatKey =
  | "passing_yards"
  | "passing_tds"
  | "carries"
  | "rushing_yards"
  | "rushing_tds"
  | "receptions"
  | "targets"
  | "receiving_yards"
  | "receiving_tds"
  | "completions"
  | "attempts";

type RecentGame = {
  season: number;
  week: number;
  gameday: string | null;
  opponent_team: string | null;
} & Record<StatKey, number | null>;

type Player = {
  player_id: string;
  player_display_name: string;
  position: string;
  team: string;
  opponent_team: string;
  sample_size: number;
  projection: Record<StatKey, number | null>;
  recent_averages: Record<StatKey, number | null>;
  stat_reasons: Partial<
    Record<
      StatKey,
      { recent_average: number; projection: number; reason: string }
    >
  >;
  recent_games: RecentGame[];
};

type PlayerOutlook = { game: Game; player: Player };

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const statLabels: Record<StatKey, string> = {
  passing_yards: "Passing yards",
  passing_tds: "Passing touchdowns",
  carries: "Carries",
  rushing_yards: "Rushing yards",
  rushing_tds: "Rushing touchdowns",
  receptions: "Receptions",
  targets: "Targets",
  receiving_yards: "Receiving yards",
  receiving_tds: "Receiving touchdowns",
  completions: "Completions",
  attempts: "Pass attempts",
};

const statsByPosition: Record<string, StatKey[]> = {
  QB: [
    "passing_yards",
    "passing_tds",
    "completions",
    "attempts",
    "rushing_yards",
    "rushing_tds",
  ],
  RB: [
    "rushing_yards",
    "carries",
    "rushing_tds",
    "receiving_yards",
    "receptions",
    "targets",
    "receiving_tds",
  ],
  WR: [
    "receiving_yards",
    "receptions",
    "targets",
    "receiving_tds",
    "rushing_yards",
  ],
  TE: [
    "receiving_yards",
    "receptions",
    "targets",
    "receiving_tds",
    "rushing_yards",
  ],
};

function formatStat(value: number | null): string {
  return value === null
    ? "—"
    : Number(value).toFixed(1).replace(/\.0$/, "");
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );
}

function PlayerOutlookContent() {
  const { gameId, playerId } = useParams<{
    gameId: string;
    playerId: string;
  }>();
  const [data, setData] = useState<PlayerOutlook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function loadPlayerOutlook() {
      try {
        const response = await fetch(
          `${backendUrl}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/outlook`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const result: { detail?: string } = await response.json();
          throw new Error(
            result.detail ?? `Backend returned HTTP ${response.status}`,
          );
        }
        const result: PlayerOutlook = await response.json();
        if (isCurrent) setData(result);
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load this player",
          );
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadPlayerOutlook();
    return () => {
      isCurrent = false;
    };
  }, [gameId, playerId]);

  if (loading) {
    return <main className="p-6 text-slate-300">Loading player outlook...</main>;
  }
  if (!data) {
    return (
      <main className="p-6">
        <p className="text-rose-300">
          Could not load this player: {error ?? "Player details are unavailable."}
        </p>
        <Link
          className="mt-4 inline-block text-cyan-300"
          href={`/games/${encodeURIComponent(gameId)}`}
        >
          Back to game
        </Link>
      </main>
    );
  }

  const { game, player } = data;
  const projectionStats =
    statsByPosition[player.position] ?? ["receiving_yards"];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm text-cyan-300 hover:underline"
          href={`/games/${encodeURIComponent(game.game_id)}`}
        >
          ← Back to {game.away_team} @ {game.home_team}
        </Link>
        <header className="border-b border-slate-800 py-5">
          <p className="text-sm text-slate-400">
            {player.team} · {player.position} · {game.season} Week {game.week}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            {player.player_display_name}
          </h1>
        </header>

        <section className="py-6">
          <h2 className="text-xl font-semibold text-white">
            Projected stats vs. {player.opponent_team}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Select a stat to see its recent game log and matchup explanation.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {projectionStats
              .filter((stat) => player.projection[stat] !== null)
              .map((stat) => {
                const reason = player.stat_reasons[stat];
                const average =
                  reason?.recent_average ?? player.recent_averages[stat];
                const projected = player.projection[stat];
                const trend =
                  average === null || projected === null
                    ? "No recent average available"
                    : projected > average + 0.05
                      ? `Above recent average (${formatStat(average)})`
                      : projected < average - 0.05
                        ? `Below recent average (${formatStat(average)})`
                        : `Near recent average (${formatStat(average)})`;

                return (
                  <details
                    key={stat}
                    className="group rounded-lg border border-slate-800 bg-slate-900"
                  >
                    <summary className="cursor-pointer list-none p-4">
                      <span className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block text-sm text-slate-400">
                            {statLabels[stat]}
                          </span>
                          <span className="mt-1 block text-2xl font-semibold text-white">
                            {formatStat(projected)}
                          </span>
                          <span className="mt-1 block text-xs text-slate-400">
                            {trend}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-sm text-cyan-300 group-open:rotate-180"
                        >
                          ▼
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-slate-800 px-4 py-3">
                      <p className="text-sm leading-6 text-slate-300">
                        {reason?.reason ??
                          "This estimate uses the player's recent average; no matchup adjustment is available."}
                      </p>
                      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Previous games · {statLabels[stat]}
                      </h3>
                      <ul className="mt-2 divide-y divide-slate-800">
                        {player.recent_games.map((recentGame) => (
                          <li
                            key={`${recentGame.season}-${recentGame.week}`}
                            className="flex items-center justify-between gap-3 py-2 text-sm"
                          >
                            <span className="text-slate-300">
                              {recentGame.season} Week {recentGame.week} ·{" "}
                              {formatDate(recentGame.gameday)} · vs.{" "}
                              {recentGame.opponent_team ?? "—"}
                            </span>
                            <span className="font-medium text-white">
                              {formatStat(recentGame[stat])}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                );
              })}
          </div>
          <aside className="mt-4 rounded-lg border border-amber-900/70 bg-amber-950/30 p-4 text-sm text-amber-100">
            These are simple recent-form baselines with a small adjustment from
            recent team defensive results. They are not trained or backtested.
            The data does not identify individual cornerback matchups or current
            injury/lineup changes.
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function PlayerOutlookPage() {
  return (
    <Suspense
      fallback={<main className="p-6 text-slate-300">Loading player...</main>}
    >
      <PlayerOutlookContent />
    </Suspense>
  );
}
