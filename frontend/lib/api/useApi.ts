"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkbench } from "../../components/Workbench";
import { errorMessage } from "./client";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Load data from the API. Refetches when `key` changes, when the screen calls
 * `reload()`, and after any write anywhere in the workbench (`refresh()`).
 * Keeps showing the previous data while a refetch is in flight.
 */
export function useApi<T>(load: () => Promise<T>, key: string): ApiState<T> {
  const { version } = useWorkbench();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadRef
      .current()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key, version, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Run a write, track its pending state and error, then refresh every screen. */
export function useAction() {
  const { refresh } = useWorkbench();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        const result = await fn();
        refresh();
        return result;
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
