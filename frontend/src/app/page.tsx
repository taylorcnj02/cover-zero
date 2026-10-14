"use client";

import { useEffect, useState } from "react";

type BackendStatus =
  | { state: "checking" }
  | { state: "connected" }
  | { state: "error"; message: string };

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    state: "checking",
  });

  useEffect(() => {
    let isCurrent = true;

    async function checkBackend() {
      try {
        const response = await fetch(`${backendUrl}/health`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }

        const health: { status?: string } = await response.json();
        if (health.status !== "ok") {
          throw new Error("Backend returned an unexpected health response");
        }
        if (isCurrent) {
          setBackendStatus({ state: "connected" });
        }
      } catch (error) {
        if (isCurrent) {
          setBackendStatus({
            state: "error",
            message:
              error instanceof Error ? error.message : "Unable to reach backend",
          });
        }
      }
    }

    void checkBackend();
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
          NFL Parlay App
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Your football data workspace
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-300">
          The starter workspace is ready for NFL data. This connection check
          confirms the frontend can reach the FastAPI backend.
        </p>

        <div
          className="mt-8 rounded-2xl border border-slate-700 bg-slate-950/70 p-5"
          aria-live="polite"
        >
          <p className="text-sm text-slate-400">Backend status</p>
          {backendStatus.state === "checking" && (
            <p className="mt-2 font-semibold text-slate-200">
              Checking backend...
            </p>
          )}
          {backendStatus.state === "connected" && (
            <p className="mt-2 font-semibold text-emerald-400">
              Backend connected
            </p>
          )}
          {backendStatus.state === "error" && (
            <div className="mt-2">
              <p className="font-semibold text-rose-400">
                Backend connection failed
              </p>
              <p className="mt-1 break-words text-sm text-slate-300">
                {backendStatus.message}. Make sure the API is running at{" "}
                {backendUrl}.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
