"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccuracyWeek = {
  season: number;
  week: number;
  prediction_count: number;
  mae: number;
  p10_p90_coverage_percent: number;
};

type Backtest = {
  test_season: number;
  training_rows: number;
  test_rows: number;
  model_mae: number;
  last_five_baseline_mae: number;
  mae_improvement_percent: number;
  p10_p90_coverage_percent: number;
  average_interval_width: number;
  weekly: AccuracyWeek[];
};

type AccuracyResponse = {
  stat: string;
  tracking: {
    prediction_count: number;
    mae: number | null;
    p10_p90_coverage_percent: number | null;
    weeks: AccuracyWeek[];
  };
  held_out_backtest: Backtest;
  note: string;
};

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function formatNumber(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value.toFixed(2)}${suffix}`;
}

export default function AccuracyPage() {
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function loadAccuracy() {
      try {
        const response = await fetch(
          `${backendUrl}/accuracy/receiving-yards`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const result: { detail?: string } = await response.json();
          throw new Error(
            result.detail ?? `Backend returned HTTP ${response.status}`,
          );
        }
        const result: AccuracyResponse = await response.json();
        if (isCurrent) setAccuracy(result);
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load model accuracy",
          );
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadAccuracy();
    return () => {
      isCurrent = false;
    };
  }, []);

  const backtest = accuracy?.held_out_backtest;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link className="text-sm text-cyan-300 hover:underline" href="/">
          ← Upcoming schedule
        </Link>
        <header className="border-b border-slate-800 py-5">
          <p className="text-sm font-semibold text-cyan-300">
            Model performance
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Receiving-yards accuracy
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Results are measured on games the model did not train on. MAE is
            mean absolute error in yards; lower is better. Range coverage is
            the share of actual results inside the model&apos;s 10th–90th
            percentile interval.
          </p>
        </header>

        {loading && (
          <p className="mt-6 rounded-lg border border-slate-800 p-5 text-slate-300">
            Calculating the held-out benchmark and checking completed
            predictions...
          </p>
        )}
        {error && (
          <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/40 p-5 text-rose-200">
            Could not load accuracy: {error}. Confirm the backend and
            PostgreSQL are running.
          </p>
        )}

        {backtest && (
          <>
            <section className="py-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {backtest.test_season} held-out test
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Trained on earlier seasons · {backtest.test_rows.toLocaleString()}{" "}
                    player-game results · {backtest.training_rows.toLocaleString()}{" "}
                    training rows
                  </p>
                </div>
                <span className="rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs text-amber-200">
                  Historical test, not a guarantee
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Model MAE",
                    value: `${backtest.model_mae.toFixed(2)} yd`,
                  },
                  {
                    label: "Last-five baseline MAE",
                    value: `${backtest.last_five_baseline_mae.toFixed(2)} yd`,
                  },
                  {
                    label: "P10–P90 coverage",
                    value: `${backtest.p10_p90_coverage_percent.toFixed(1)}%`,
                  },
                  {
                    label: "Average interval width",
                    value: `${backtest.average_interval_width.toFixed(1)} yd`,
                  },
                ].map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-4"
                  >
                    <p className="text-sm text-slate-400">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {metric.value}
                    </p>
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Model MAE</span>
                  <span className="font-medium text-white">
                    {backtest.model_mae.toFixed(2)} yd
                  </span>
                </div>
                <div className="mt-2 h-2 rounded bg-slate-800">
                  <div
                    className="h-2 rounded bg-cyan-400"
                    style={{
                      width: `${
                        (backtest.model_mae /
                          backtest.last_five_baseline_mae) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {backtest.mae_improvement_percent.toFixed(2)}% lower
                  error than the last-five average on this test season.
                </p>
              </div>
            </section>

            <section className="border-t border-slate-800 py-6">
              <h2 className="text-xl font-semibold text-white">
                Completed forecast tracking
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                This section scores actual saved forecasts only when they were
                generated before kickoff and the game has a final result.
              </p>
              {accuracy?.tracking.prediction_count === 0 ? (
                <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                  No saved forecasts have completed yet. The held-out test
                  above is historical validation; it is not counted as live
                  forecast tracking.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                      <p className="text-sm text-slate-400">
                        Scored player forecasts
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {accuracy?.tracking.prediction_count}
                      </p>
                    </article>
                    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                      <p className="text-sm text-slate-400">Live MAE</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(accuracy?.tracking.mae ?? null)} yd
                      </p>
                    </article>
                    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                      <p className="text-sm text-slate-400">
                        Live range coverage
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(
                          accuracy?.tracking.p10_p90_coverage_percent ?? null,
                          "%",
                        )}
                      </p>
                    </article>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="p-3">Week</th>
                          <th className="p-3">Players scored</th>
                          <th className="p-3">MAE</th>
                          <th className="p-3">Range coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accuracy?.tracking.weeks.map((week) => (
                          <tr
                            key={`${week.season}-${week.week}`}
                            className="border-t border-slate-800"
                          >
                            <td className="p-3">
                              {week.season} · Week {week.week}
                            </td>
                            <td className="p-3">{week.prediction_count}</td>
                            <td className="p-3">
                              {week.mae.toFixed(2)} yd
                            </td>
                            <td className="p-3">
                              {week.p10_p90_coverage_percent.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {accuracy && (
          <aside className="rounded-lg border border-amber-900/70 bg-amber-950/30 p-4 text-sm leading-6 text-amber-100">
            {accuracy.note} One held-out season is a limited test, the
            prediction intervals are intentionally broad, and projections
            are estimates—not guarantees or betting advice.
          </aside>
        )}
      </div>
    </main>
  );
}
