"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { WORKED_EXAMPLE } from "../lib/datasets";
import { getHealth, getLatestRun } from "../lib/api/endpoints";
import type { ApiDetectionRun, ApiHealth } from "../lib/api/types";

interface WorkbenchState {
  /** Customer id of the case being worked on (e.g. LR-20417). */
  caseId: string;
  selectCase: (id: string) => void;
  /** Increments after every write so every screen refetches. */
  version: number;
  refresh: () => void;
  /** null while loading; `reachable: false` when the API cannot be reached. */
  health: (ApiHealth & { reachable: true }) | { reachable: false } | null;
  simulationOn: boolean;
  run: ApiDetectionRun | null;
}

const Ctx = createContext<WorkbenchState | null>(null);
const STORAGE_KEY = "resolve-ai.workbench.v2";

/**
 * The selected case is remembered in the browser; everything else (sign-offs,
 * reasons, outcomes) is server state read from the Resolve AI API.
 */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [caseId, setCaseId] = useState(WORKED_EXAMPLE);
  const [hydrated, setHydrated] = useState(false);
  const [version, setVersion] = useState(0);
  const [health, setHealth] = useState<WorkbenchState["health"]>(null);
  const [run, setRun] = useState<ApiDetectionRun | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCaseId(saved);
    } catch {
      /* selection is a convenience only */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, caseId);
    } catch {
      /* ignore quota / private mode */
    }
  }, [caseId, hydrated]);

  useEffect(() => {
    let live = true;
    getHealth()
      .then((h) => live && setHealth({ ...h, reachable: true }))
      .catch(() => live && setHealth({ reachable: false }));
    getLatestRun()
      .then((r) => live && setRun(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const value: WorkbenchState = {
    caseId,
    selectCase: setCaseId,
    version,
    refresh,
    health,
    simulationOn: health?.reachable === true && health.simulation === "on",
    run,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkbench(): WorkbenchState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return ctx;
}
