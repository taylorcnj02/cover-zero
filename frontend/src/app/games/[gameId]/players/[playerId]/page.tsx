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

type PlayerModelPrediction = {
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
  players: PlayerModelPrediction[];
};

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

function formatFeatureName(feature: string): string {
  return feature
    .replace(/^last_(\d+)_/, "Last $1 games · ")
    .replace(/^opponent_last5_/, "Opponent last 5 · ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PlayerOutlookContent() {
  const { gameId, playerId } = useParams<{
    gameId: string;
    playerId: string;
  }>();
  const [data, setData] = useState<PlayerOutlook | null>(null);
  const [modelPrediction, setModelPrediction] =
    useState<PlayerModelPrediction | null>(null);
  const [modelPredictionError, setModelPredictionError] =
    useState<string | null>(null);
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
        const prediction =
          result.players.find((item) => item.player_id === playerId) ?? null;
        if (isCurrent) setModelPrediction(prediction);
      })
      .catch((predictionError: unknown) => {
        if (isCurrent) {
          setModelPredictionError(
            predictionError instanceof Error
              ? predictionError.message
              : "Unable to load this player's model prediction",
          );
        }
      });
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

        {modelPredictionError && (
          <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
            Could not load the model range: {modelPredictionError}
          </p>
        )}
        {modelPrediction && (
          <section className="mt-6 rounded-xl border border-cyan-900/70 bg-slate-900 p-5">
            <p className="text-sm font-medium text-cyan-300">
              Trained model · receiving yards
            </p>
            <p className="mt-2 text-3xl font-bold text-white">
              {formatStat(modelPrediction.p50)} yards
            </p>
            <p className="mt-1 text-sm text-slate-300">
              10th–90th percentile range: {formatStat(modelPrediction.p10)}–
              {formatStat(modelPrediction.p90)} yards
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Trained through {modelPrediction.trained_through_season} · saved{" "}
              {new Date(modelPrediction.created_at).toLocaleString()}
            </p>
            {modelPrediction.model_factors.length > 0 && (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Strongest median-model contributions
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                  {modelPrediction.model_factors.map((factor) => (
                    <li
                      key={factor.feature}
                      className="rounded-lg bg-slate-950/70 p-3 text-sm"
                    >
                      <span className="block text-slate-300">
                        {formatFeatureName(factor.feature)}
                      </span>
                      <span
                        className={
                          factor.effect_yards >= 0
                            ? "mt-1 block font-medium text-emerald-300"
                            : "mt-1 block font-medium text-rose-300"
                        }
                      >
                        {factor.effect_yards > 0 ? "+" : ""}
                        {factor.effect_yards} yd contribution
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Additive model attributions, not causal explanations.
                </p>
              </div>
            )}
          </section>
        )}
        {!modelPrediction && !modelPredictionError && (
          <p className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
            {player.position === "WR" || player.position === "TE"
              ? "No saved model range is available for this player in this game."
              : "The trained model currently covers receiving yards for wide receivers and tight ends only."}
          </p>
        )}

        <section className="py-6">
          <h2 className="text-xl font-semibold text-white">
            Recent-form baseline vs. {player.opponent_team}
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
            These non-model stats are recent-form baselines with a small
            adjustment from recent team defensive results. Only the receiving
            yards range above uses the trained, backtested model. Individual
            cornerback matchups and current injury/lineup changes are not
            available.
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
