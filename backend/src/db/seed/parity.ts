/**
 * Parity: compares the ported generator with the frontend's generated JSON
 * (frontend/data/*.json), field by field. Skipped when that folder is absent
 * (e.g. a backend-only deployment).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PilotDataset } from './pilot-dataset.js';

export type CheckResult = { label: string; ok: boolean; detail?: string };

/** backend/src/db/seed → repo root → frontend/data (same depth from dist/db/seed). */
const FRONTEND_DATA = fileURLToPath(new URL('../../../../frontend/data/', import.meta.url));

const normalize = (value: unknown) => JSON.stringify(JSON.parse(JSON.stringify(value)));

function firstDifference(ours: unknown, theirs: unknown, path = ''): string {
  if (typeof ours !== 'object' || ours === null || typeof theirs !== 'object' || theirs === null) {
    return `${path || '(root)'}: ours=${JSON.stringify(ours)} theirs=${JSON.stringify(theirs)}`;
  }
  const keys = new Set([...Object.keys(ours), ...Object.keys(theirs)]);
  for (const key of keys) {
    const a = (ours as Record<string, unknown>)[key];
    const b = (theirs as Record<string, unknown>)[key];
    if (normalize(a ?? null) !== normalize(b ?? null))
      return firstDifference(a, b, `${path}.${key}`);
  }
  return `${path}: differs`;
}

export function frontendDataAvailable(): boolean {
  return existsSync(FRONTEND_DATA);
}

export function checkParity(data: PilotDataset): CheckResult[] {
  const read = (name: string): Record<string, unknown> =>
    JSON.parse(readFileSync(`${FRONTEND_DATA}${name}`, 'utf8')) as Record<string, unknown>;

  const outcomes = read('outcomes.json');
  const pairs: [string, unknown, unknown][] = [
    ['customers.json', data.customers, read('customers.json').customers],
    ['bundle-activity.json', data.activity, read('bundle-activity.json').activity],
    ['feedback.json (replies)', data.feedback, read('feedback.json').feedback],
    ['feedback.json (ask template)', data.ask, read('feedback.json').ask_template],
    ['reason-taxonomy.json', data.reasons, read('reason-taxonomy.json').reasons],
    ['action-library.json', data.actions, read('action-library.json').actions],
    ['campaign-history.json', data.campaigns, read('campaign-history.json').campaigns],
    ['interventions.json', data.interventions, read('interventions.json').interventions],
    ['outcomes.json (treated)', data.outcomes, outcomes.outcomes],
    ['outcomes.json (controls)', data.controls, outcomes.control_cohort],
    ['human-review.json', data.reviews, read('human-review.json').reviews],
    ['detection-run.json', data.run, read('detection-run.json')],
  ];

  return pairs.map(([name, ours, theirs]) => {
    const ok = normalize(ours) === normalize(theirs);
    return ok
      ? { label: `parity ${name}`, ok }
      : { label: `parity ${name}`, ok, detail: firstDifference(ours, theirs) };
  });
}
