/** Builds the OpenAPI 3.1 document from the endpoint registry and the Zod validators. */
import { z } from 'zod';

import { ENDPOINTS, TAGS, type Endpoint } from './endpoints.js';
import { componentSchemas, ref } from './openapi.schemas.js';

type Json = Record<string, unknown>;

export const SERVERS = [
  {
    url: 'https://resolve-ai-production-8093.up.railway.app/api/v1',
    description: 'Production (Railway)',
  },
  { url: 'http://localhost:4000/api/v1', description: 'Local development' },
];

/** Zod → JSON Schema 2020-12 (what OpenAPI 3.1 uses), without the $schema key. */
function toJson(schema: z.ZodType, io: 'input' | 'output'): Json {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Json;
  delete json.$schema;
  return json;
}

function parameters(schema: z.ZodObject | undefined, where: 'path' | 'query'): Json[] {
  if (!schema) return [];
  const json = toJson(schema, 'output');
  const props = (json.properties ?? {}) as Record<string, Json>;
  return Object.entries(props).map(([name, prop]) => ({
    name,
    in: where,
    required: where === 'path',
    schema: prop,
    ...(typeof prop.description === 'string' ? { description: prop.description } : {}),
  }));
}

const toOpenApiPath = (path: string) => (path === '/' ? '/' : path.replace(/:(\w+)/g, '{$1}'));

const ERROR_RESPONSES: Record<number, string> = {
  400: 'BadRequest',
  404: 'NotFound',
  409: 'Conflict',
  503: 'Degraded',
};

function successContent(e: Endpoint, example: unknown): Json {
  if (e.success.contentType === 'text/html') {
    return { 'text/html': { schema: { type: 'string' } } };
  }
  if (!e.success.schema) {
    return { 'application/json': { schema: { type: 'object' }, ...(example ? { example } : {}) } };
  }
  const data = e.success.list
    ? { type: 'array', items: ref(e.success.schema) }
    : ref(e.success.schema);
  const schema: Json = {
    type: 'object',
    properties: e.success.list ? { data, meta: ref('PageMeta') } : { data },
    required: ['data'],
  };
  return { 'application/json': { schema, ...(example ? { example } : {}) } };
}

function operation(e: Endpoint, examples: Record<string, unknown>): Json {
  const description = [
    e.description,
    e.ai ? '**AI-backed:** rate limit 20 requests/minute per IP.' : undefined,
    e.tag === 'Simulation' ? '**Demo only:** available when `ENABLE_SIMULATION` is on.' : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');

  const responses: Json = {
    [e.success.status]: {
      description: e.success.description,
      content: successContent(e, examples[e.operationId]),
    },
  };
  for (const code of e.errors) {
    const name = ERROR_RESPONSES[code];
    if (name) responses[code] = { $ref: `#/components/responses/${name}` };
  }
  if (!['getOpenApi', 'getDocs'].includes(e.operationId)) {
    responses['429'] = { $ref: '#/components/responses/TooManyRequests' };
  }

  return {
    operationId: e.operationId,
    tags: [e.tag],
    // No authentication in the MVP (explicitly declared).
    security: [],
    summary: e.summary,
    ...(description ? { description } : {}),
    parameters: [...parameters(e.params, 'path'), ...parameters(e.query, 'query')],
    ...(e.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: toJson(e.body, 'input'),
                ...(e.bodyExample !== undefined ? { example: e.bodyExample } : {}),
              },
            },
          },
        }
      : {}),
    responses,
  };
}

const errorResponse = (description: string, code: string, message: string): Json => ({
  description,
  content: {
    'application/json': {
      schema: ref('Error'),
      example: { error: { code, message } },
    },
  },
});

export function buildOpenApi(options: {
  version: string;
  examples?: Record<string, unknown>;
}): Json {
  const examples = options.examples ?? {};
  const paths: Record<string, Json> = {};
  for (const e of ENDPOINTS) {
    const p = toOpenApiPath(e.path);
    paths[p] = { ...(paths[p] ?? {}), [e.method]: operation(e, examples) };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Resolve AI API',
      version: options.version,
      summary:
        'Anti-churn decision intelligence for Orange: Detect → Understand → Recommend → Act → Measure → Report.',
      description: [
        'Resolve AI detects disengagement in data-bundle customers, finds the likely reason (behavioural evidence first, then customer feedback collected through **existing Orange channels**), recommends the next-best action, records the human approval, measures the outcome and reports it.',
        '',
        '- **All data is synthetic** (Orange Summer Challenge 2026 MVP).',
        '- **Envelope:** success `{ "data": …, "meta"?: { page, pageSize, total } }`; error `{ "error": { code, message, details? } }`.',
        '- **Conventions:** camelCase JSON, lowercase enum values, ISO 8601 timestamps, customer ids like `LR-20417`.',
        '- **Auth:** none in the MVP; write actions take a `reviewerName`.',
        '- **Rate limits (per IP):** AI-backed routes 20/min, other writes 120/min, reads 600/min. Exceeding them returns `429 RATE_LIMITED`; see the `RateLimit` header.',
        '- **The LLM is never the source of truth:** it only classifies reply text into a fixed taxonomy and phrases Copilot answers; all figures are computed deterministically.',
        '',
        'Guides: `docs/API.md` (frontend + agent guide) and `docs/postman/` (collection + environments) in the repository.',
      ].join('\n'),
      contact: { name: 'Resolve AI backend' },
      license: { name: 'Proprietary: Orange Summer Challenge 2026 entry (synthetic data)' },
    },
    servers: SERVERS,
    tags: TAGS,
    paths,
    components: {
      schemas: componentSchemas,
      responses: {
        BadRequest: errorResponse(
          'Validation failed or malformed JSON',
          'VALIDATION_ERROR',
          'Request validation failed',
        ),
        NotFound: errorResponse(
          'Resource or route not found',
          'NOT_FOUND',
          'No open case for customer LR-99999',
        ),
        Conflict: errorResponse(
          'Invalid state transition',
          'CONFLICT',
          'Recommendation is already approved; only pending recommendations can be approved',
        ),
        TooManyRequests: errorResponse(
          'Rate limit exceeded',
          'RATE_LIMITED',
          'Too many AI requests: limit is 20 per minute.',
        ),
        Degraded: {
          description: 'API up but database unreachable (same shape as 200, status "degraded")',
          content: {
            'application/json': { schema: { type: 'object', properties: { data: ref('Health') } } },
          },
        },
      },
    },
  };
}
