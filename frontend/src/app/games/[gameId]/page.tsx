"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
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
  location: string | null;
  stadium: string | null;
  away_rest: number | null;
  home_rest: number | null;
  roof: string | null;
  surface: string | null;
  temp: number | null;
  wind: number | null;
};

type Player = {
  player_id: string;
  player_display_name: string;
  position: string | null;
  team: string;
  opponent_team: string | null;
  completions: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  receptions: number | null;
  targets: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
  fantasy_points_ppr: number | null;
};

type GameDetails = { game: Game; players: Player[] };
type SortStat =
  | "fantasy_points_ppr"
  | "receiving_yards"
  | "rushing_yards"
  | "passing_yards";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
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

function formatStat(value: number | null, decimals = 0): string {
  if (value === null) return "—";
  return Number(value).toFixed(decimals).replace(/\.0$/, "");
}

function PlayerTable({
  players,
  sortStat,
}: {
  players: Player[];
  sortStat: SortStat;
}) {
  if (players.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
        No player stats are available for this game yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Player</th>
            <th className="px-3 py-3 font-medium">Pass Yds</th>
            <th className="px-3 py-3 font-medium">Pass TD</th>
            <th className="px-3 py-3 font-medium">Rush Yds</th>
            <th className="px-3 py-3 font-medium">Carries</th>
            <th className="px-3 py-3 font-medium">Rec Yds</th>
            <th className="px-3 py-3 font-medium">Receptions</th>
            <th className="px-3 py-3 font-medium">Targets</th>
            <th className="px-3 py-3 font-medium">PPR Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {[...players]
            .sort((a, b) => (b[sortStat] ?? 0) - (a[sortStat] ?? 0))
            .map((player) => (
            <tr key={player.player_id} className="bg-slate-900/50">
              <th className="whitespace-nowrap px-4 py-3 font-medium text-slate-100">
                <span>{player.player_display_name}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {player.position ?? "—"}
                </span>
              </th>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.passing_yards)}
              </td>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.passing_tds)}
              </td>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.rushing_yards)}
              </td>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.carries)}
              </td>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.receiving_yards)}
              </td>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.receptions)}
              </td>
              <td className="px-3 py-3 text-slate-300">
                {formatStat(player.targets)}
              </td>
              <td className="px-3 py-3 font-semibold text-emerald-300">
                {formatStat(player.fantasy_points_ppr, 1)}
              </td>
            </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function GameDetailContent() {
  const { gameId } = useParams<{ gameId: string }>();
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [sortStat, setSortStat] = useState<SortStat>("fantasy_points_ppr");

  useEffect(() => {
    let isCurrent = true;

    async function loadGame() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${backendUrl}/games/${encodeURIComponent(gameId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const result: { detail?: string } = await response.json();
          throw new Error(
            result.detail ?? `Backend returned HTTP ${response.status}`,
          );
        }

        const gameDetails: GameDetails = await response.json();
        if (isCurrent) setDetails(gameDetails);
      } catch (fetchError) {
        if (isCurrent) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to reach the backend",
          );
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadGame();
    return () => {
      isCurrent = false;
    };
  }, [gameId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
        <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
          Loading game details...
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Link
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
            href="/"
          >
            ← Back to schedule
          </Link>
          <div className="mt-8 rounded-2xl border border-rose-900 bg-rose-950/40 p-6">
            <h1 className="text-xl font-semibold text-rose-300">
              Could not load this game
            </h1>
            <p className="mt-2 text-sm text-rose-100/80">
              {error ?? "Game details are unavailable."}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Check that the backend is running at {backendUrl} and that the
              schedule and player data have been imported.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { game, players } = details;
  const skillPlayers = players.filter((player) =>
    ["QB", "RB", "WR", "TE"].includes(player.position ?? ""),
  );
  const positions = [...new Set(skillPlayers.map((player) => player.position!))].sort();
  const filteredPlayers = skillPlayers.filter(
    (player) =>
      positionFilter === "ALL" || player.position === positionFilter,
  );
  const awayPlayers = filteredPlayers.filter(
    (player) => player.team === game.away_team,
  );
  const homePlayers = filteredPlayers.filter(
    (player) => player.team === game.home_team,
  );
  const neutralPlayers = players.filter(
    (player) => player.team !== game.away_team && player.team !== game.home_team,
  );
  const isFinal = game.away_score !== null && game.home_score !== null;
  const topPerformer = [...skillPlayers].sort(
    (a, b) => (b.fantasy_points_ppr ?? 0) - (a.fantasy_points_ppr ?? 0),
  )[0];
  const teamStats = [game.away_team, game.home_team].map((team) => {
    const teamPlayers = skillPlayers.filter((player) => player.team === team);
    return {
      team,
      passing: teamPlayers.reduce(
        (sum, player) => sum + (player.passing_yards ?? 0),
        0,
      ),
      rushing: teamPlayers.reduce(
        (sum, player) => sum + (player.rushing_yards ?? 0),
        0,
      ),
      receiving: teamPlayers.reduce(
        (sum, player) => sum + (player.receiving_yards ?? 0),
        0,
      ),
    };
  });

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Link
          className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
          href={`/?season=${game.season}&week=${game.week}`}
        >
          ← Back to {game.season} Week {game.week}
        </Link>

        <header className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            NFL Player Outlook · {game.season} · Week {game.week}
            {game.game_type && game.game_type !== "REG" && ` · ${game.game_type}`}
          </p>
          <p className="mt-4 text-sm text-slate-400">
            {formatDate(game.gameday)} · {formatTime(game.gametime)}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-4xl font-bold sm:text-6xl">
            <span>{game.away_team}</span>
            {game.away_score !== null && (
              <span className="text-slate-400">{game.away_score}</span>
            )}
            <span className="text-xl font-normal text-slate-600">@</span>
            <span>{game.home_team}</span>
            {game.home_score !== null && (
              <span className="text-slate-400">{game.home_score}</span>
            )}
          </div>
          <div className="mt-8 grid gap-4 border-t border-slate-800 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Game status</p>
              <p className="mt-1 text-sm text-slate-200">{isFinal ? "Final score" : "Scheduled"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Venue</p>
              <p className="mt-1 text-sm text-slate-200">
                {[game.stadium, game.location].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Venue
              </p>
              <p className="mt-1 text-sm capitalize text-slate-200">
                {[game.roof, game.surface].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Weather
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {game.temp === null ? "—" : `${game.temp}°`}
                {game.wind === null ? "" : ` · ${game.wind} mph wind`}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Rest days · Away / Home
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {formatStat(game.away_rest)} / {formatStat(game.home_rest)}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-10">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Observed player performance
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white">
                Game analytics
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Weekly results from nflverse. These are actual stats, not model
                projections.
              </p>
            </div>
            <label className="grid gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              Rank players by
              <select
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400"
                onChange={(event) =>
                  setSortStat(event.target.value as SortStat)
                }
                value={sortStat}
              >
                <option value="fantasy_points_ppr">PPR points</option>
                <option value="receiving_yards">Receiving yards</option>
                <option value="rushing_yards">Rushing yards</option>
                <option value="passing_yards">Passing yards</option>
              </select>
            </label>
          </div>

          {topPerformer && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Top PPR performer
                </p>
                <p className="mt-2 font-semibold text-white">
                  {topPerformer.player_display_name}
                </p>
                <p className="mt-1 text-sm text-cyan-200">
                  {formatStat(topPerformer.fantasy_points_ppr, 1)} points
                </p>
              </article>
              {teamStats.map((stats) => (
                <article
                  key={stats.team}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    {stats.team} · player totals
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Pass{" "}
                    <span className="font-semibold text-white">
                      {formatStat(stats.passing)}
                    </span>
                    <span className="mx-2 text-slate-700">·</span>
                    Rush{" "}
                    <span className="font-semibold text-white">
                      {formatStat(stats.rushing)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Receiving{" "}
                    <span className="font-semibold text-white">
                      {formatStat(stats.receiving)}
                    </span>{" "}
                    yards
                  </p>
                </article>
              ))}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Position
            </span>
            {["ALL", ...positions].map((position) => (
              <button
                key={position}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  positionFilter === position
                    ? "bg-cyan-300 text-slate-950"
                    : "border border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
                onClick={() => setPositionFilter(position)}
                type="button"
              >
                {position === "ALL" ? "All skill players" : position}
              </button>
            ))}
          </div>

          <div className="grid gap-8">
            {[game.away_team, game.home_team].map((team) => {
              const teamPlayers =
                team === game.away_team ? awayPlayers : homePlayers;
              return (
                <section key={team}>
                  <h2 className="mb-3 text-lg font-semibold">{team}</h2>
                  <PlayerTable players={teamPlayers} sortStat={sortStat} />
                </section>
              );
            })}
            {neutralPlayers.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Other players</h2>
                <PlayerTable players={neutralPlayers} sortStat={sortStat} />
              </section>
            )}
          </div>
        </section>
        <aside className="mt-8 rounded-2xl border border-cyan-900/60 bg-cyan-950/20 p-5">
          <p className="text-sm font-semibold text-cyan-100">
            Projection and accuracy analytics are coming next
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            This view summarizes recorded performance. Forecasts will be shown
            with a median, an uncertainty range, and backtest results once the
            prediction model is built and evaluated.
          </p>
        </aside>
      </div>
    </main>
  );
}

function GameLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
        Loading game details...
      </div>
    </main>
  );
}

export default function GameDetailPage() {
  return (
    <Suspense fallback={<GameLoading />}>
      <GameDetailContent />
    </Suspense>
  );
}
