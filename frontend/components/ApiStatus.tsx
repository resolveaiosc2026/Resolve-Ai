"use client";

import type { ReactNode } from "react";
import { useWorkbench } from "./Workbench";
import { API_BASE_URL } from "../lib/api/client";
import type { ApiState } from "../lib/api/useApi";

/** Top-of-page banner when the API is unreachable or its database is down. */
export function ApiBanner() {
  const { health, refresh } = useWorkbench();
  if (!health) return null;
  const down = !health.reachable || health.database.status !== "up";
  if (!down) return null;
  return (
    <div className="note" data-tone="error" role="alert" style={{ marginBottom: 16 }}>
      <span className="title">Live data unavailable.</span>{" "}
      <span className="body-sm">
        {health.reachable
          ? "The Resolve AI API is up but cannot reach its database."
          : `The Resolve AI API (${API_BASE_URL}) could not be reached.`}{" "}
        The screens below will load once it is back.
      </span>{" "}
      <button className="btn" data-variant="ghost" type="button" onClick={refresh}>
        Try again
      </button>
    </div>
  );
}

/**
 * Renders children once every query has data. Shows a loading note first and
 * an error note with retry if any query fails.
 */
export function Loaded({
  queries,
  label = "Loading live data from the Resolve AI API…",
  children,
}: {
  queries: ApiState<unknown>[];
  label?: string;
  children: () => ReactNode;
}) {
  const failed = queries.find((q) => q.error && q.data === null);
  if (failed) {
    return (
      <div className="note" data-tone="error" role="alert">
        <div className="title">This screen could not load</div>
        <p className="body-sm" style={{ marginTop: 6 }}>
          {failed.error}
        </p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" onClick={() => queries.forEach((q) => q.reload())}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (queries.some((q) => q.data === null)) {
    return (
      <div className="note" data-tone="neutral" aria-busy="true">
        <span className="body-sm muted">{label}</span>
      </div>
    );
  }
  return <>{children()}</>;
}

/** Inline error under a button after a write fails (the server's own message). */
export function ActionError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="meta" role="alert" style={{ color: "var(--error)", marginTop: 8 }}>
      {error}
    </p>
  );
}

/** Explains why demo-only controls are hidden. */
export function SimulationOffNote({ what }: { what: string }) {
  return (
    <p className="meta" style={{ marginTop: 8 }}>
      {what} is a demo step that needs simulation mode on the API (ENABLE_SIMULATION=true). It is
      off on this deployment.
    </p>
  );
}
