/** Report: pure statistics (ported from the prototype's reportView / wilson). */

const round = (v: number, dp = 0) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Wilson 95% interval: small-n honesty, not a point estimate. */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return {
    low: round(Math.max(0, centre - margin), 3),
    high: round(Math.min(1, centre + margin), 3),
  };
}

export type CohortStats = {
  recovered: number;
  n: number;
  rate: number;
  ci: { low: number; high: number };
};

export function cohortStats(recovered: number, n: number): CohortStats {
  return { recovered, n, rate: n ? round(recovered / n, 3) : 0, ci: wilson(recovered, n) };
}

/** Reason distribution over classified cases; ties broken by label for a stable order. */
export function reasonDistribution(labels: string[]) {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const total = labels.length;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
