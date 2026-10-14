"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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
};

type RecentGame = {
  season: number;
  week: number;
  gameday: string | null;
  opponent_team: string | null;
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

type Player = {
  player_id: string;
  player_display_name: string;
  position: string;
  team: string;
  opponent_team: string;
  sample_size: number;
  projection: Record<StatKey, number | null>;
  recent_averages: Record<StatKey, number | null>;
  primary_yards: number;
  recent_games: RecentGame[];
};

type StatKey = keyof Omit<
  RecentGame,
  "season" | "week" | "gameday" | "opponent_team"
>;

type Outlook = { game: Game; players: Player[] };

type ModelPrediction = {
  player_id: string;
  player_display_name: string;
  position: string;
  team: string;
  opponent_team: string;
  stat: string;
  p10: number;
  p50: number;
  p90: number;
  trained_through_season: number;
  model_factors: { feature: string; effect_yards: number }[];
  created_at: string;
};

type GamePredictions = {
  game_id: string;
  last_updated: string | null;
  players: ModelPrediction[];
};

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const statLabels: Partial<Record<keyof Player["projection"], string>> = {
  passing_yards: "pass yds",
  passing_tds: "pass TD",
  carries: "carries",
  rushing_yards: "rush yds",
  rushing_tds: "rush TD",
  receptions: "receptions",
  targets: "targets",
  receiving_yards: "rec yds",
  receiving_tds: "rec TD",
};

function projectionSummary(player: Player): string {
  const statsByPosition: Record<string, Array<keyof Player["projection"]>> = {
    QB: ["passing_yards", "passing_tds"],
    RB: ["rushing_yards", "carries", "receiving_yards", "receptions"],
    WR: ["receiving_yards", "receptions"],
    TE: ["receiving_yards", "receptions"],
  };
  const stats = statsByPosition[player.position] ?? [];
  return [
    ...stats
      .filter((stat) => player.projection[stat] !== null)
      .map(
        (stat) =>
          `${formatStat(player.projection[stat])} ${statLabels[stat] ?? stat}`,
      ),
  ].join(" · ");
}

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-US",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
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

function formatStat(value: number | null, decimals = 1): string {
  return value === null ? "—" : Number(value).toFixed(decimals).replace(/\.0$/, "");
}

function formatFeatureName(feature: string): string {
  return feature
    .replace(/^last_(\d+)_/, "Last $1 games · ")
    .replace(/^opponent_last5_/, "Opponent last 5 · ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function GameOutlookContent() {
  const { gameId } = useParams<{ gameId: string }>();
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [modelPredictions, setModelPredictions] =
    useState<GamePredictions | null>(null);
  const [modelPredictionError, setModelPredictionError] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function loadOutlook() {
      try {
        const response = await fetch(
          `${backendUrl}/games/${encodeURIComponent(gameId)}/outlook`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const result: { detail?: string } = await response.json();
          throw new Error(
            result.detail ?? `Backend returned HTTP ${response.status}`,
          );
        }
        const result: Outlook = await response.json();
        if (isCurrent) setOutlook(result);
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load player outlooks",
          );
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadOutlook();
    return () => {
      isCurrent = false;
    };
  }, [gameId]);

  useEffect(() => {
    let isCurrent = true;
    fetch(
      `${backendUrl}/games/${encodeURIComponent(gameId)}/predictions`,
      { cache: "no-store" },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }
        return response.json() as Promise<GamePredictions>;
      })
      .then((result) => {
        if (isCurrent) setModelPredictions(result);
      })
      .catch((predictionError: unknown) => {
        if (isCurrent) {
          setModelPredictionError(
            predictionError instanceof Error
              ? predictionError.message
              : "Unable to load model predictions",
          );
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [gameId]);

  if (loading) {
    return <p className="p-6 text-slate-300">Loading game outlook...</p>;
  }
  if (error || !outlook) {
    return (
      <div className="p-6">
        <p className="text-rose-300">
          Could not load this matchup: {error ?? "Game details are unavailable."}
        </p>
        <Link className="mt-4 inline-block text-cyan-300" href="/">
          Back to schedule
        </Link>
      </div>
    );
  }

  const { game } = outlook;
  const presumedStarterByTeam = new Map<string, Player>();
  for (const player of outlook.players) {
    if (player.position !== "QB") continue;
    const attempts = player.recent_averages.attempts ?? 0;
    const currentStarter = presumedStarterByTeam.get(player.team);
    if (
      attempts > 0 &&
      (!currentStarter ||
        attempts > (currentStarter.recent_averages.attempts ?? 0))
    ) {
      presumedStarterByTeam.set(player.team, player);
    }
  }

  const rankedPlayers = [...outlook.players]
    .filter(
      (player) =>
        player.primary_yards > 0 &&
        (player.position !== "QB" ||
          presumedStarterByTeam.get(player.team)?.player_id ===
            player.player_id),
    )
    .sort((a, b) => b.primary_yards - a.primary_yards)
    .slice(0, 5);
  const homePlayers = outlook.players.filter(
    (player) => player.team === game.home_team,
  );
  const awayPlayers = outlook.players.filter(
    (player) => player.team === game.away_team,
  );
  const hasFinalScore =
    game.away_score !== null && game.home_score !== null;

  function playerHref(playerId: string) {
    return `/games/${encodeURIComponent(game.game_id)}/players/${encodeURIComponent(playerId)}`;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link className="text-sm text-cyan-300 hover:underline" href="/">
          ← Upcoming schedule
        </Link>
        <header className="border-b border-slate-800 py-5">
          <p className="text-sm text-slate-400">
            {game.season} · Week {game.week}
            {game.game_type && game.game_type !== "REG"
              ? ` · ${game.game_type}`
              : ""}
            {" · "}
            {formatDate(game.gameday)} · {formatTime(game.gametime)}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            {game.away_team} @ {game.home_team}
            {hasFinalScore && (
              <span className="ml-3 text-xl font-normal text-slate-400">
                {game.away_score}–{game.home_score}
              </span>
            )}
          </h1>
        </header>

        <section className="py-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Receiving-yards model outlook
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Median estimate with a broad 10th–90th percentile range.
                Select a player for recent results.
              </p>
            </div>
            {modelPredictions?.last_updated && (
              <p className="text-xs text-slate-500">
                Updated{" "}
                {new Date(modelPredictions.last_updated).toLocaleString()}
              </p>
            )}
          </div>
          {modelPredictionError ? (
            <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
              Could not load saved model ranges: {modelPredictionError}
            </p>
          ) : !modelPredictions?.players.length ? (
            <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
              No saved model ranges for this game. Run the weekly prediction
              command after refreshing the NFL data.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {modelPredictions.players.map((prediction) => (
                <li key={prediction.player_id}>
                  <Link
                    href={playerHref(prediction.player_id)}
                    className="block rounded-lg border border-cyan-900/70 bg-slate-900 p-4 hover:border-cyan-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-cyan-300">
                          {prediction.team} · {prediction.position}
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {prediction.player_display_name}
                        </p>
                      </div>
                      <span className="rounded-full bg-cyan-950 px-2 py-1 text-xs text-cyan-200">
                        Model
                      </span>
                    </div>
                    <p className="mt-4 text-2xl font-semibold text-white">
                      {formatStat(prediction.p50)}{" "}
                      <span className="text-sm font-normal text-slate-300">
                        median yards
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Range {formatStat(prediction.p10)}–{formatStat(prediction.p90)}{" "}
                      receiving yards
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Model trained through {prediction.trained_through_season}
                    </p>
                    {prediction.model_factors.length > 0 && (
                      <p className="mt-2 text-xs text-slate-400">
                        Top model input:{" "}
                        {formatFeatureName(prediction.model_factors[0].feature)}{" "}
                        (
                        {prediction.model_factors[0].effect_yards > 0 ? "+" : ""}
                        {prediction.model_factors[0].effect_yards} yd)
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="py-6">
          <h2 className="text-xl font-semibold text-white">
            Players by recent-form baseline
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            These transparent averages are separate from the trained
            receiving-yards model above.
          </p>
          {rankedPlayers.length === 0 ? (
            <p className="mt-4 rounded-lg border border-slate-800 p-4 text-slate-300">
              No recent offensive player stats are available for this matchup.
              Refresh the NFL data to continue.
            </p>
          ) : (
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {rankedPlayers.map((player, index) => (
                <li key={player.player_id}>
                  <Link
                    href={playerHref(player.player_id)}
                    className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-cyan-700"
                  >
                    <p className="text-xs text-slate-400">#{index + 1} · {player.team} · {player.position}</p>
                    <p className="mt-1 font-semibold text-white">
                      {player.player_display_name}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {projectionSummary(player)}
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="rounded-lg border border-amber-900/70 bg-amber-950/30 p-4 text-sm text-amber-100">
          Baseline estimates use recent player averages and are not trained or
          backtested. Model intervals are available only for WR/TE receiving
          yards. Current injury status and confirmed lineups are not included.
        </aside>

        <section className="py-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Offensive players
          </h2>
          {[{ team: game.away_team, players: awayPlayers }, { team: game.home_team, players: homePlayers }].map(
            ({ team, players }) => (
              <div key={team} className="mb-6">
                <h3 className="mb-2 font-semibold text-slate-200">{team}</h3>
                {players.length === 0 ? (
                  <p className="rounded-lg border border-slate-800 p-4 text-sm text-slate-400">
                    No recent offensive player stats found.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                    {[...players]
                      .sort((a, b) =>
                        a.player_display_name.localeCompare(b.player_display_name),
                      )
                      .map((player) => (
                      <li key={player.player_id}>
                        <Link
                          href={playerHref(player.player_id)}
                          className="flex items-center justify-between gap-4 p-3 hover:bg-slate-900"
                        >
                          <span>
                            <span className="font-medium text-white">
                              {player.player_display_name}
                            </span>
                            <span className="ml-2 text-sm text-slate-400">
                              {player.position}
                            </span>
                          </span>
                          <span className="text-sm text-slate-300">
                            {projectionSummary(player)} →
                          </span>
                        </Link>
                      </li>
                      ))}
                  </ul>
                )}
              </div>
            ),
          )}
        </section>
      </div>
    </main>
  );
}

export default function GameOutlookPage() {
  return (
    <Suspense fallback={<main className="p-6 text-slate-300">Loading game...</main>}>
      <GameOutlookContent />
    </Suspense>
  );
}
