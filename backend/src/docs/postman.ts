/**
 * Builds the Postman collection (v2.1) and environments from the endpoint registry.
 * "0. Demo journey" runs the whole loop in order; its tests save IDs for the next request.
 */
import { ENDPOINTS, TAGS, type Endpoint } from './endpoints.js';

type Json = Record<string, unknown>;

export const LOCAL_BASE = 'http://localhost:4000/api/v1';
export const RAILWAY_BASE = 'https://resolve-ai-production-8093.up.railway.app/api/v1';

const VARIABLES: [string, string, string][] = [
  ['baseUrl', LOCAL_BASE, 'API base URL (the environment overrides it)'],
  ['customerId', 'LR-20417', 'Customer used by the reference requests (the hero case)'],
  [
    'journeyCustomerId',
    'LR-08222',
    'Customer used by the demo journey (needs a freshly seeded DB)',
  ],
  ['requestId', '', 'Set by the journey: feedback request id'],
  ['classificationId', '', 'Set by the journey: reason (classification) id'],
  ['recommendationId', '', 'Set by the journey: recommendation id'],
  ['rejectRecommendationId', '', 'Set in "Act": recommendation used to demo a rejection'],
  ['interventionRef', '', 'Set by the journey: intervention reference (INT-…)'],
  ['conversationId', '', 'Set by Copilot requests: conversation id'],
];

function url(path: string, query?: Record<string, string>): Json {
  const entries = Object.entries(query ?? {});
  const qs = entries.length
    ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
    : '';
  return {
    raw: `{{baseUrl}}${path}${qs}`,
    host: ['{{baseUrl}}'],
    path: path.split('/').filter(Boolean),
    ...(entries.length ? { query: entries.map(([key, value]) => ({ key, value })) } : {}),
  };
}

function request(
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: unknown; description?: string },
): Json {
  return {
    method: method.toUpperCase(),
    header: opts.body !== undefined ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: url(path, opts.query),
    ...(opts.body !== undefined
      ? {
          body: {
            mode: 'raw',
            raw: JSON.stringify(opts.body, null, 2),
            options: { raw: { language: 'json' } },
          },
        }
      : {}),
    ...(opts.description ? { description: opts.description } : {}),
  };
}

const testEvent = (lines: string[]): Json[] => [
  { listen: 'test', script: { type: 'text/javascript', exec: lines } },
];

const isJson = (e: Endpoint) => e.success.contentType !== 'text/html';

function referenceItem(e: Endpoint, examples: Record<string, unknown>): Json {
  const accept = e.postman.accept ?? [e.success.status];
  const lines = [
    `pm.test('status is ${accept.join(' or ')}', () => pm.expect(pm.response.code).to.be.oneOf([${accept.join(', ')}]));`,
    ...(isJson(e)
      ? [
          "pm.test('JSON body', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'));",
        ]
      : []),
    ...(e.postman.tests?.length
      ? [
          `if (pm.response.code === ${e.success.status}) {`,
          ...e.postman.tests.map((t) => `  ${t}`),
          '}',
        ]
      : []),
  ];
  const req = request(e.method, e.postman.path, {
    query: e.postman.query,
    body: e.postman.body,
    description: [e.summary, e.description, e.ai ? 'AI-backed: 20 requests/minute.' : '']
      .filter(Boolean)
      .join('\n\n'),
  });
  const example = examples[e.operationId];
  return {
    name: e.summary,
    event: testEvent(lines),
    request: req,
    response:
      example !== undefined
        ? [
            {
              name: `${e.success.status} example`,
              originalRequest: req,
              status: e.success.status === 201 ? 'Created' : 'OK',
              code: e.success.status,
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: JSON.stringify(example, null, 2),
            },
          ]
        : [],
  };
}

const strict = (status: number, extra: string[] = []): Json[] =>
  testEvent([
    `pm.test('status is ${status}', () => pm.response.to.have.status(${status}));`,
    'const body = pm.response.json();',
    ...extra,
  ]);

/** The full loop on {{journeyCustomerId}}, in order. Requires a freshly seeded database. */
function journeyItems(): Json[] {
  const reviewer = 'analyst.hui';
  const reply = 'Money hard this month o. Price too high now, I buy only small small bundle.';
  return [
    {
      name: '1. Hand off an ask to Orange (voice call)',
      event: strict(201, [
        "pm.collectionVariables.set('requestId', body.data.id);",
        "pm.test('handed off', () => pm.expect(body.data.status).to.eql('handed_off'));",
      ]),
      request: request('post', '/customers/{{journeyCustomerId}}/feedback-requests', {
        body: { channel: 'voice_call', reviewerName: reviewer },
        description: "Resolve AI records the hand-off; Orange's channel contacts the customer.",
      }),
    },
    {
      name: "2. Orange's channel returns the reply (simulated)",
      event: strict(201, [
        "pm.collectionVariables.set('classificationId', body.data.reasons.classificationId);",
        "pm.test('reason attached', () => pm.expect(body.data.reasons.primary).to.not.equal(null));",
      ]),
      request: request('post', '/simulation/feedback-requests/{{requestId}}/reply', {
        body: { text: reply },
        description:
          'Demo only. The reply is classified by AI (keyword fallback without an API key).',
      }),
    },
    {
      name: '3. Reason view (Understand screen)',
      event: strict(200, [
        "pm.test('classified', () => pm.expect(body.data.status).to.eql('classified'));",
      ]),
      request: request('get', '/customers/{{journeyCustomerId}}/reasons', {}),
    },
    {
      name: '4. Live next-best action (Recommend screen)',
      event: strict(200, [
        "pm.test('an action is recommended', () => pm.expect(body.data.recommended).to.not.equal(null));",
      ]),
      request: request('get', '/customers/{{journeyCustomerId}}/recommendation', {}),
    },
    {
      name: '5. Persist the recommendation',
      event: strict(201, ["pm.collectionVariables.set('recommendationId', body.data.id);"]),
      request: request('post', '/customers/{{journeyCustomerId}}/recommendations', { body: {} }),
    },
    {
      name: '6. Approve (human sign-off) → intervention handed off',
      event: strict(201, [
        "pm.collectionVariables.set('interventionRef', body.data.intervention.reference);",
        "pm.test('handed off to Orange', () => pm.expect(body.data.intervention.status).to.eql('handed_off'));",
      ]),
      request: request('post', '/actions/{{recommendationId}}/approve', {
        body: {
          reviewerName: reviewer,
          window: 'Today 16:00–18:00',
          note: 'Customer says the big bundle is too dear.',
        },
      }),
    },
    {
      name: '7. Simulate the 30-day window (demo)',
      event: strict(200, [
        "pm.test('scenario applied', () => pm.expect(body.data.scenario).to.eql('recover'));",
      ]),
      request: request('post', '/simulation/interventions/{{interventionRef}}/advance', {
        body: { scenario: 'recover' },
      }),
    },
    {
      name: '8. Measure the outcome',
      event: strict(201, [
        "pm.test('re-engaged', () => pm.expect(body.data.outcomeType).to.eql('re_engaged'));",
      ]),
      request: request('post', '/interventions/{{interventionRef}}/outcome', {
        body: { reviewerName: reviewer },
      }),
    },
    {
      name: '9. Measure view: timeline and verdict',
      event: strict(200, [
        "pm.test('recovered', () => pm.expect(body.data.verdict).to.eql('recovered'));",
      ]),
      request: request('get', '/customers/{{journeyCustomerId}}/measure', {}),
    },
    {
      name: '10. Report: treated vs control',
      event: strict(200, [
        "pm.test('treated cohort grew', () => pm.expect(body.data.treated.n).to.be.above(6));",
      ]),
      request: request('get', '/reports/summary', {}),
    },
    {
      name: '11. Ask the Copilot about the customer',
      event: strict(201, [
        "pm.collectionVariables.set('conversationId', body.data.conversationId);",
        "pm.test('customer intent', () => pm.expect(body.data.intent).to.eql('customer'));",
      ]),
      request: request('post', '/copilot/chat', {
        body: { question: 'Tell me about {{journeyCustomerId}}' },
      }),
    },
  ];
}

/** A pending recommendation to reject, created right before the reject request. */
const rejectSetup: Json = {
  name: 'Persist a recommendation to reject (LR-19076)',
  event: testEvent([
    "pm.test('status is 201 or 409', () => pm.expect(pm.response.code).to.be.oneOf([201, 409]));",
    "if (pm.response.code === 201) pm.collectionVariables.set('rejectRecommendationId', pm.response.json().data.id);",
  ]),
  request: request('post', '/customers/LR-19076/recommendations', {
    body: {},
    description: 'Setup for the reject example below.',
  }),
};

export function buildCollection(options: {
  version: string;
  examples: Record<string, unknown>;
}): Json {
  const folders: Json[] = [
    {
      name: '0. Demo journey (run in order)',
      description:
        'The whole loop on {{journeyCustomerId}}: hand-off → reply → reason → recommendation → approval → simulated window → outcome → measure → report → Copilot. Needs a freshly seeded database (`npm run db:seed`) and simulation enabled. To run it again without re-seeding, set journeyCustomerId to another customer that is awaiting a reply (e.g. LR-29623).',
      item: journeyItems(),
    },
    ...TAGS.map((tag) => {
      const items = ENDPOINTS.filter((e) => e.tag === tag.name).map((e) =>
        referenceItem(e, options.examples),
      );
      const index = items.findIndex((it) => String(it.name).startsWith('"Send to human review"'));
      if (tag.name === 'Act' && index >= 0) items.splice(index, 0, rejectSetup);
      return { name: tag.name, description: tag.description, item: items };
    }),
  ];

  return {
    info: {
      _postman_id: '6f1c2b8e-4c1a-4f7e-9d2a-5e7b1c0a9f31',
      name: 'Resolve AI API',
      description: [
        `Resolve AI backend v${options.version}: Detect → Understand → Recommend → Act → Measure → Report (synthetic data).`,
        '',
        '1. Import this collection and an environment (Local or Railway) from docs/postman/.',
        '2. Run "0. Demo journey" with the Collection Runner: each step saves the IDs the next one needs.',
        '3. The other folders are a reference for every endpoint, with saved example responses.',
        '',
        'Envelope: { data, meta? } / { error: { code, message, details? } }. Rate limits: AI 20/min, writes 120/min, reads 600/min.',
        'Full guide: docs/API.md. OpenAPI: {{baseUrl}}/openapi.json · interactive docs: {{baseUrl}}/docs',
      ].join('\n'),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: folders,
    variable: VARIABLES.map(([key, value, description]) => ({
      key,
      value,
      type: 'string',
      description,
    })),
  };
}

export function buildEnvironment(name: 'Local' | 'Railway'): Json {
  return {
    id:
      name === 'Local'
        ? '3a8e2f61-1b7c-4d5e-9f0a-2c4b6d8e0f11'
        : '7c9d1e23-5f4a-4b6c-8d0e-1f2a3b4c5d6e',
    name: `Resolve AI — ${name}`,
    values: [
      {
        key: 'baseUrl',
        value: name === 'Local' ? LOCAL_BASE : RAILWAY_BASE,
        type: 'default',
        enabled: true,
      },
    ],
    _postman_variable_scope: 'environment',
  };
}
