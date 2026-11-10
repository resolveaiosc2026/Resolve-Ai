/**
 * `npm run docs:build`: generates the OpenAPI document and the Postman collection/environments.
 * Read endpoints' examples are captured LIVE from the API (in-process) against the seeded
 * database; write endpoints use representative examples. UUIDs are normalized so re-running
 * on a freshly seeded database produces identical files. Run `npm run db:seed` first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { APP_VERSION, createApp } from '../app.js';
import { closeDatabase } from '../db/client.js';
import { ENDPOINTS } from './endpoints.js';
import { buildOpenApi } from './openapi.js';
import { buildCollection, buildEnvironment } from './postman.js';

const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const DOCS = fileURLToPath(new URL('../../../docs/', import.meta.url));

/** Concrete values for path variables when capturing examples. */
const LIVE_VARS: Record<string, string> = {
  customerId: 'LR-20417',
  interventionRef: 'INT-4100',
};

/** Representative bodies for write endpoints (shapes match the live API). */
const STATIC_EXAMPLES: Record<string, unknown> = {
  getHealth: {
    data: {
      status: 'ok',
      service: 'resolve-ai-backend',
      environment: 'production',
      simulation: 'on',
      uptimeSeconds: 3600,
      timestamp: '2026-11-10T12:00:00.000Z',
      database: { status: 'up', latencyMs: 41 },
    },
  },
  runDetection: {
    data: {
      id: 'RUN-2026-10-28-02',
      asOf: '2026-10-28T08:00:00.000Z',
      modelVersion: 'rules-v1',
      customersScored: 45,
      flagged: 45,
      newCases: 0,
      updatedCases: 45,
      bands: { high: 2, medium: 17, low: 26 },
    },
  },
  handOffFeedbackRequest: {
    data: {
      id: '715f8e54-4cda-4ffa-9754-7fe7c396eac3',
      caseId: '398b2ea9-b179-4a7e-85c9-ba32a51fa087',
      customerId: 'LR-08222',
      channel: 'Orange voice call',
      channelId: 'voice_call',
      question:
        'Call script: We noticed you are buying fewer data bundles. Can you tell us in your own words what changed?',
      status: 'handed_off',
      triggerReason: 'no_evidence',
      handedOffAt: '2026-11-09T18:29:16.586Z',
      handedOffBy: 'analyst.hui',
      previousRequestsMarkedNoResponse: 1,
      note: 'Handed off to the Orange channel. Resolve AI does not contact the customer.',
    },
  },
  recordInboundFeedback: {
    data: {
      id: '1f0c8a2e-6b3d-4e9a-8c7f-2d5e9b1a4c60',
      channel: 'Facebook page comment',
      channelId: 'facebook_comment',
      customerId: null,
      caseId: null,
      region: 'Ganta',
      preview: {
        reasonId: 'network_quality',
        confidence: 0.9,
        sentiment: 'negative',
        summary:
          'The customer reduced their data-bundle purchases due to slow network issues in Ganta.',
        classifiedBy: 'llm:openai/gpt-4o-mini',
      },
      note: 'Inbound feedback is stored as context; it does not change the case reason.',
    },
  },
  approveRecommendation: {
    data: {
      decision: 'approved',
      intervention: {
        id: 'b5a3e7c1-2d4f-4a6b-9c8e-0f1d2e3a4b5c',
        reference: 'INT-4106',
        recommendationId: '9db80ee7-b184-4e6f-988c-bd41e0956487',
        caseId: '398b2ea9-b179-4a7e-85c9-ba32a51fa087',
        customerId: 'LR-08222',
        action: {
          id: 'daily_mini_600',
          name: 'Daily Mini 600 MB for $0.60',
          shortName: 'Daily Mini 600 MB',
        },
        recommendedActionId: 'daily_mini_600',
        decision: 'approved',
        channel: 'Orange SMS',
        channelId: 'sms',
        deliveryWindow: 'Today 16:00–18:00',
        approvedBy: 'analyst.hui',
        approvedAt: '2026-11-09T18:29:22.235Z',
        status: 'handed_off',
        handedOffAt: '2026-11-09T18:29:22.235Z',
        deliveredAt: null,
        clickRecorded: false,
        note: 'Customer says the big bundle is too dear.',
        simulatedThrough: null,
        hasOutcome: false,
      },
    },
  },
  rejectRecommendation: {
    data: {
      recommendationId: '59de00ce-5987-4652-a0b4-d40747dc424f',
      status: 'rejected',
      caseStatus: 'unclassified',
    },
  },
  recordOutcome: {
    data: {
      id: '3ce8b21c-3760-4737-b897-4c5bb079284d',
      interventionId: 'INT-4106',
      customerId: 'LR-08222',
      windowDays: 30,
      baselineActivations: 11,
      activationsAfter: 10,
      changePct: -9,
      shareOfDropRecovered: 0.667,
      outcomeType: 're_engaged',
      recovered: true,
      simulated: true,
      note: "Usage returned toward the customer's own baseline. (recorded by analyst.hui)",
      measuredAt: '2026-12-09T18:29:22.235Z',
    },
  },
  simulateWindow: {
    data: {
      reference: 'INT-4106',
      scenario: 'recover',
      simulatedPurchases: 10,
      windowEnd: '2026-12-09T18:29:22.235Z',
      simulated: true,
    },
  },
  copilotChat: {
    data: {
      id: 'c859f1ff-d0f2-4676-86fc-7bd709c488f3',
      conversationId: '2a6d4c1e-8f3b-4e7a-9d5c-1b0e2f3a4c5d',
      question: 'Is the pilot working?',
      intent: 'pilot',
      routedBy: 'keywords',
      answer:
        "It's too early to determine if the pilot is working. So far, 2 of 6 treated customers recovered (33%) compared to 2 of 8 matched controls (25%), showing an 8-point difference. However, the 95% intervals overlap, indicating we cannot yet distinguish a real effect from noise.",
      draftAnswer:
        'Too early to call. 2 of 6 treated customers recovered (33%), against 2 of 8 matched controls (25%) — a difference of 8 points. The 95% intervals overlap, so this pilot cannot separate a real effect from noise yet.',
      phrasedBy: 'llm:openai/gpt-4o-mini',
      facts: [
        {
          label: 'Treated',
          value: '2/6 (10–70%)',
          source: 'outcomes (treated) · Wilson 95% interval',
        },
        {
          label: 'Control',
          value: '2/8 (7–59%)',
          source: 'outcomes (control cohort) · Wilson 95% interval',
        },
        { label: 'Difference', value: '8 points', source: 'report summary' },
        { label: 'Pilot window', value: '21 days', source: 'detection_runs · population summary' },
      ],
      caveat:
        'These recovery rates are simulated placeholders. Real churn validation needs Orange historical outcomes, which we do not have.',
      followUps: ['Why are customers disengaging?', 'How many customers are at risk?'],
      createdAt: '2026-11-10T12:31:22.237Z',
    },
  },
};

/** Replaces every UUID with a stable placeholder (by order of first appearance). */
function normalizeUuids(value: unknown): unknown {
  const map = new Map<string, string>();
  const text = JSON.stringify(value).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (uuid) => {
      const key = uuid.toLowerCase();
      if (!map.has(key))
        map.set(key, `00000000-0000-4000-8000-${String(map.size + 1).padStart(12, '0')}`);
      return map.get(key) ?? key;
    },
  );
  return JSON.parse(text) as unknown;
}

async function captureLiveExamples(base: string): Promise<Record<string, unknown>> {
  const examples: Record<string, unknown> = {};
  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return (await res.json()) as unknown;
  };

  // A recommendation id from the seeded data, for GET /recommendations/:id.
  const recs = (await get('/recommendations?pageSize=1')) as { data: { id: string }[] };
  const vars: Record<string, string> = { ...LIVE_VARS, recommendationId: recs.data[0]?.id ?? '' };

  for (const e of ENDPOINTS) {
    if (e.method !== 'get' || e.tag === 'Simulation') continue;
    if (['getOpenApi', 'getDocs', 'getConversation', 'getHealth'].includes(e.operationId)) continue;
    const path = e.postman.path.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? name);
    const query = { ...(e.postman.query ?? {}), ...(e.success.list ? { pageSize: '2' } : {}) };
    const qs = Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
    examples[e.operationId] = await get(`${path}${qs}`);
  }
  return examples;
}

async function main(): Promise<void> {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const live = await captureLiveExamples(`http://127.0.0.1:${port}/api/v1`);
    const report = live.getReportSummary as { data: { approvalsTotal: number } } | undefined;
    if (report && report.data.approvalsTotal !== 6) {
      console.warn(
        'Warning: the database is not freshly seeded; run `npm run db:seed` for canonical examples.',
      );
    }
    const examples = normalizeUuids({ ...STATIC_EXAMPLES, ...live }) as Record<string, unknown>;

    const spec = buildOpenApi({ version: APP_VERSION, examples });
    const collection = buildCollection({ version: APP_VERSION, examples });
    const write = (path: string, data: unknown) =>
      writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

    mkdirSync(`${DOCS}postman`, { recursive: true });
    write(`${BACKEND}openapi.json`, spec);
    write(`${DOCS}openapi.json`, spec);
    write(`${DOCS}postman/Resolve-AI.postman_collection.json`, collection);
    write(`${DOCS}postman/Resolve-AI.local.postman_environment.json`, buildEnvironment('Local'));
    write(
      `${DOCS}postman/Resolve-AI.railway.postman_environment.json`,
      buildEnvironment('Railway'),
    );

    const paths = Object.keys(spec.paths as object).length;
    console.log(
      `Docs built: OpenAPI ${String(spec.openapi)} (${paths} paths, ${ENDPOINTS.length} operations, ${Object.keys(examples).length} examples), Postman collection + 2 environments.`,
    );
  } finally {
    server.close();
    await closeDatabase();
  }
}

main().catch((err: unknown) => {
  console.error('docs:build failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
