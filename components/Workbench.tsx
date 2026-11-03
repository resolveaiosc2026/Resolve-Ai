"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { WORKED_EXAMPLE } from "../lib/datasets";

export interface Approval {
  caseId: string;
  actionId: string;
  channel: string;
  window: string;
  note: string;
  at: string;
  decision: "approved" | "changed" | "review";
}

interface WorkbenchState {
  caseId: string;
  selectCase: (id: string) => void;
  approvals: Record<string, Approval>;
  record: (a: Approval) => void;
  clear: () => void;
}

const Ctx = createContext<WorkbenchState | null>(null);
const STORAGE_KEY = "resolve-ai.workbench.v1";

/**
 * Selection and sign-off live in the browser only — there is no server in this
 * prototype. Approvals are labelled as demo state wherever they are shown.
 */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [caseId, setCaseId] = useState(WORKED_EXAMPLE);
  const [approvals, setApprovals] = useState<Record<string, Approval>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { caseId?: string; approvals?: Record<string, Approval> };
        if (saved.caseId) setCaseId(saved.caseId);
        if (saved.approvals) setApprovals(saved.approvals);
      }
    } catch {
      /* demo state is disposable */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ caseId, approvals }));
    } catch {
      /* ignore quota / private mode */
    }
  }, [caseId, approvals, hydrated]);

  const value: WorkbenchState = {
    caseId,
    selectCase: setCaseId,
    approvals,
    record: (a) => setApprovals((prev) => ({ ...prev, [a.caseId]: a })),
    clear: () => setApprovals({}),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkbench(): WorkbenchState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return ctx;
}
