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

type RecentGame = {
  season: number;
  week: number;
  gameday: string | null;
  opponent_team: string | null;
  fantasy_points_ppr: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  receptions: number | null;
  targets: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
  completions: number | null;
  attempts: number | null;
};

type StatKey = keyof Omit<
  RecentGame,
  "season" | "week" | "gameday" | "opponent_team"
>;

type Player = {
  player_id: string;
  player_display_name: string;
  position: string;
  team: string;
  sample_size: number;
  projection: Record<StatKey, number | null>;
  recent_games: RecentGame[];
};

type PlayerOutlook = { game: Game; player: Player };

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const statLabels: Record<keyof Player["projection"], string> = {
  fantasy_points_ppr: "PPR points",
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

const projectionStatsByPosition: Record<
  string,
  Array<keyof Player["projection"]>
> = {
  QB: [
    "fantasy_points_ppr",
    "passing_yards",
    "passing_tds",
    "completions",
    "attempts",
    "rushing_yards",
    "rushing_tds",
  ],
  RB: [
    "fantasy_points_ppr",
    "carries",
    "rushing_yards",
    "rushing_tds",
    "targets",
    "receptions",
    "receiving_yards",
    "receiving_tds",
  ],
  WR: [
    "fantasy_points_ppr",
    "targets",
    "receptions",
    "receiving_yards",
    "receiving_tds",
    "rushing_yards",
  ],
  TE: [
    "fantasy_points_ppr",
    "targets",
    "receptions",
    "receiving_yards",
    "receiving_tds",
    "rushing_yards",
  ],
};

const recentStatsByPosition: Record<
  string,
  Array<{ key: StatKey; label: string }>
> = {
  QB: [
    { key: "completions", label: "Completions" },
    { key: "attempts", label: "Attempts" },
    { key: "passing_yards", label: "Pass Yds" },
    { key: "passing_tds", label: "Pass TD" },
    { key: "rushing_yards", label: "Rush Yds" },
    { key: "fantasy_points_ppr", label: "PPR" },
  ],
  RB: [
    { key: "carries", label: "Carries" },
    { key: "rushing_yards", label: "Rush Yds" },
    { key: "rushing_tds", label: "Rush TD" },
    { key: "receptions", label: "Receptions" },
    { key: "receiving_yards", label: "Rec Yds" },
    { key: "fantasy_points_ppr", label: "PPR" },
  ],
  WR: [
    { key: "targets", label: "Targets" },
    { key: "receptions", label: "Receptions" },
    { key: "receiving_yards", label: "Rec Yds" },
    { key: "receiving_tds", label: "Rec TD" },
    { key: "rushing_yards", label: "Rush Yds" },
    { key: "fantasy_points_ppr", label: "PPR" },
  ],
  TE: [
    { key: "targets", label: "Targets" },
    { key: "receptions", label: "Receptions" },
    { key: "receiving_yards", label: "Rec Yds" },
    { key: "receiving_tds", label: "Rec TD" },
    { key: "rushing_yards", label: "Rush Yds" },
    { key: "fantasy_points_ppr", label: "PPR" },
  ],
};

function formatStat(value: number | null): string {
  return value === null ? "—" : Number(value).toFixed(1).replace(/\.0$/, "");
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
        <Link className="mt-4 inline-block text-cyan-300" href={`/games/${gameId}`}>
          Back to game
        </Link>
      </main>
    );
  }

  const { game, player } = data;
  const projectionStats =
    projectionStatsByPosition[player.position] ?? ["fantasy_points_ppr"];
  const recentStats = recentStatsByPosition[player.position] ?? [
    { key: "fantasy_points_ppr" as const, label: "PPR" },
  ];

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
            Baseline projection vs. {game.away_team} @ {game.home_team}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Simple averages from the last {player.sample_size} available game
            {player.sample_size === 1 ? "" : "s"}.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projectionStats
              .filter((stat) => player.projection[stat] !== null)
              .map((stat) => (
                <div
                  key={stat}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-4"
                >
                  <dt className="text-sm text-slate-400">{statLabels[stat]}</dt>
                  <dd className="mt-1 text-2xl font-semibold text-white">
                    {formatStat(player.projection[stat])}
                  </dd>
                </div>
              ))}
          </dl>
          <aside className="mt-4 rounded-lg border border-amber-900/70 bg-amber-950/30 p-4 text-sm text-amber-100">
            This is a recent-form baseline, not a trained or backtested model.
            It does not account for matchup adjustments, current injuries, or
            confirmed playing time.
          </aside>
        </section>

        <section className="py-4">
          <h2 className="mb-3 text-xl font-semibold text-white">
            Recent game stats
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-3">Week</th>
                  <th className="p-3">Opponent</th>
                  {recentStats.map(({ key, label }) => (
                    <th key={key} className="p-3">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {player.recent_games.map((recentGame) => (
                  <tr key={`${recentGame.season}-${recentGame.week}`}>
                    <td className="p-3">
                      {recentGame.season} W{recentGame.week} ·{" "}
                      {formatDate(recentGame.gameday)}
                    </td>
                    <td className="p-3">{recentGame.opponent_team ?? "—"}</td>
                    {recentStats.map(({ key }) => (
                      <td key={key} className="p-3">
                        {formatStat(recentGame[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function PlayerOutlookPage() {
  return (
    <Suspense fallback={<main className="p-6 text-slate-300">Loading player...</main>}>
      <PlayerOutlookContent />
    </Suspense>
  );
}
