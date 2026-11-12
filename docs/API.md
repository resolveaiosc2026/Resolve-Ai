# Resolve AI API: Frontend & Agent Guide

This is the one document to hand to a frontend developer **or a coding agent** building the Resolve AI UI against the backend. It explains how to call the API, how each prototype function in `frontend/lib/` maps to an endpoint, and the conventions that matter.

| What                              | Where                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| **Production base URL**           | `https://resolve-ai-production-8093.up.railway.app/api/v1`      |
| Local base URL                    | `http://localhost:4000/api/v1`                                  |
| Interactive reference             | `https://resolve-ai-production-8093.up.railway.app/api/v1/docs` |
| OpenAPI 3.1 (machine-readable)    | `…/api/v1/openapi.json`, also `docs/openapi.json` in the repo   |
| Postman collection + environments | `docs/postman/` (import all three files)                        |
| Endpoint-by-endpoint reference    | `docs/api-contract.md`                                          |

> **Status (2026-11-12):** the workbench in `frontend/` is wired to this API. The client lives in `frontend/lib/api/` (`client.ts` fetch wrapper, `endpoints.ts` one function per endpoint, `adapters.ts` API → `lib/types.ts` view models, `useApi.ts` hooks). Base URL: `NEXT_PUBLIC_API_BASE_URL` (defaults to the production URL). The bundled `frontend/data/` JSON is kept only for the backend's seed parity check.

> **For agents:** prefer `docs/openapi.json` as the source of truth for request/response shapes. Every response example in it was captured from the real API.

---

## 1. Ground rules

- **All data is synthetic** (Orange Summer Challenge 2026 MVP). Show the `simulated: true` labels where the API provides them.
- **No authentication** in the MVP. Write actions take a `reviewerName` (the analyst's name) in the body.
- **CORS** allows `https://resolve-ai-omega.vercel.app` and `http://localhost:3000` (plus any origins added to `CORS_ORIGIN` on Railway).
- **Resolve AI never contacts customers.** It hands requests and interventions to Orange's existing channels. UI wording should say _"handed off to Orange SMS"_, never _"sent"_.
- **The LLM is never the source of truth.** Numbers come from deterministic backend logic. The AI only classifies reply text and phrases Copilot answers.

## 2. Response envelope and errors

```jsonc
// success (single)
{ "data": { … } }
// success (list)
{ "data": [ … ], "meta": { "page": 1, "pageSize": 50, "total": 45 } }
// error
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [{ "path": "reviewerName", "message": "…" }] } }
```

| Status            | `error.code`                                | Typical UI handling                                                                                             |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 400               | `VALIDATION_ERROR`, `INVALID_JSON`          | Show `details[].message` next to the field                                                                      |
| 404               | `NOT_FOUND`, `ROUTE_NOT_FOUND`              | "Not found" state                                                                                               |
| 409               | `CONFLICT`                                  | Show `message`: it explains the state (e.g. _"already has a reason"_, _"window closes …"_) and refresh the view |
| 413 / 415         | `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_ENCODING` | Should not happen from the UI                                                                                   |
| 429               | `RATE_LIMITED`                              | Back off; the `RateLimit` header says when (`reset=<seconds>`)                                                  |
| 500               | `INTERNAL_ERROR`                            | Generic error toast                                                                                             |
| 503 (health only) | none; `data.status: "degraded"`             | Banner: "Database unreachable"                                                                                  |

**Rate limits (per IP):** AI-backed routes (`POST /copilot/chat`, reply ingestion, inbound feedback, simulated reply) **20/min**; other writes **120/min**; reads **600/min**.

## 3. Conventions (differences from the prototype JSON)

| Prototype (`frontend/data`, `lib/types.ts`)    | API                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| snake_case fields (`value_tier`, `flagged_at`) | **camelCase** (`valueTier`, `flaggedAt`)                                                                                         |
| `"High"` / `"Medium"` / `"Low"`                | **lowercase** `"high"` / `"medium"` / `"low"` (capitalize in the UI)                                                             |
| `"2026-10-06 08:00"`                           | **ISO 8601** `"2026-10-06T08:00:00.000Z"`                                                                                        |
| `case_id` = customer id                        | `customer.id` = `LR-20417`; **`caseId`** is a separate uuid used by write endpoints                                              |
| channel `"Orange SMS"`                         | `channel` (display label) **and** `channelId` (`sms`, `voice_call`, …)                                                           |
| Wilson CI from `wilson()`                      | The API uses the **correct** formula. The prototype's `wilson()` divides by `n` instead of `√n`, so its intervals are too narrow |

## 4. Prototype function → endpoint

| Screen       | Prototype call (`frontend/lib`)      | Endpoint                                    | Notes                                                                         |
| ------------ | ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Detect       | `priorityQueue(datasets)`            | `GET /risk?pageSize=100`                    | Same rows and order. Filters: `band`, `status`, `segment`, `region`, `search` |
| Detect       | `detectSummary(datasets)`            | `GET /risk/summary`                         | Top-level = synthetic population; `pilot` = live 45-case counts               |
| Detect       | row for one case                     | `GET /risk/:customerId`                     |                                                                               |
| Customer 360 | `usageView` + `priorityView`         | `GET /customers/:customerId`                | Adds monthly metrics (USD, LRD, USD-equivalent)                               |
| Understand   | `classifyReason(datasets, id)`       | `GET /customers/:customerId/reasons`        | Same `ClassificationView` + `assessment` (next step) + `classificationId`     |
| Recommend    | `recommendAction(datasets, id, cls)` | `GET /customers/:customerId/recommendation` | Same `recommended` / `candidates` / `notRecommended` / `history`              |
| Act          | `actQueue(datasets)`                 | `GET /risk?status=new` (or `ready`)         | Then the Act flow below                                                       |
| Measure      | `measureView(datasets, id)`          | `GET /customers/:customerId/measure`        | Same timeline, verdict, control summary                                       |
| Report       | `reportView(datasets)`               | `GET /reports/summary`                      | Plus `/reports/drivers`, `/reports/actions`, `/dashboard/trends`              |
| Copilot      | `answer(question, datasets)`         | `POST /copilot/chat`                        | Same intents and facts; `answer` may be AI-phrased (`phrasedBy`)              |
| Copilot      | `SUGGESTED_QUESTIONS`                | `GET /copilot/suggestions`                  |                                                                               |

## 5. The loop in API calls (the demo journey)

```text
1. POST /customers/LR-08222/feedback-requests        { channel: "voice_call", reviewerName }  → data.id = requestId
2. (demo) POST /simulation/feedback-requests/{requestId}/reply   { text }    → data.reasons (classified)
   (real) POST /feedback-requests/{requestId}/responses          { text }
3. GET  /customers/LR-08222/reasons                   → status "classified", primary reason
4. GET  /customers/LR-08222/recommendation            → recommended action + checks
5. POST /customers/LR-08222/recommendations   {}      → data.id = recommendationId (pending)
6. POST /actions/{recommendationId}/approve   { reviewerName, window?, note?, actionId?, channel? }
                                                      → data.intervention.reference = "INT-4106"
7. (demo) POST /simulation/interventions/INT-4106/advance   { scenario?: "recover" }
8. POST /interventions/INT-4106/outcome       { reviewerName }  → outcomeType, recovered
9. GET  /customers/LR-08222/measure                   → timeline + verdict
10. GET /reports/summary                              → treated n grows
11. POST /copilot/chat  { question: "Tell me about LR-08222" }
```

Postman's **"0. Demo journey"** folder runs exactly this with the Collection Runner. It needs a freshly seeded database. To repeat it without re-seeding, change `journeyCustomerId` to another customer awaiting a reply.

### Act screen decisions

| UI action              | Call                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Approve as recommended | `POST /actions/{recommendationId}/approve` `{ reviewerName, window, note }`                      |
| Change the action      | same, with `actionId` (must be an eligible alternative, otherwise 409) and/or `channel`          |
| Send to human review   | `POST /actions/{recommendationId}/reject` `{ reviewerName, note }` → case becomes `unclassified` |

### Understand screen actions

| `assessment.nextStep` | Offer the user                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `use_evidence`        | "Accept evidence" → `POST /customers/:id/reasons/evidence` `{ reviewerName }`                               |
| `request_feedback`    | "Ask via Orange channel" → `POST /customers/:id/feedback-requests` `{ channel, reviewerName }`              |
| `awaiting_reply`      | Show the pending ask (`feedback`)                                                                           |
| `classified`          | Show the reason; "Correct reason" → `PATCH /reasons/{classificationId}` `{ reasonId, reviewerName, note? }` |
| `monitor`             | Nothing to do                                                                                               |

## 6. Minimal TypeScript client

```ts
// lib/api.ts
const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://resolve-ai-production-8093.up.railway.app/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path?: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<{
  data: T;
  meta?: { page: number; pageSize: number; total: number };
}> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers:
      init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok)
    throw new ApiError(
      res.status,
      json.error?.code ?? "UNKNOWN",
      json.error?.message ?? res.statusText,
      json.error?.details,
    );
  return json;
}

// examples
// const { data: queue } = await api<QueueRow[]>('/risk?pageSize=100');
// const { data: reasons } = await api<ClassificationView>(`/customers/${id}/reasons`);
// await api('/actions/' + recommendationId + '/approve', { method: 'POST', body: { reviewerName: 'analyst.hui' } });
```

Types: generate them from the spec (`npx openapi-typescript docs/openapi.json -o lib/api-types.ts`) or let your agent read `docs/openapi.json`.

## 7. Copilot

`POST /copilot/chat` `{ question, conversationId?, style?: "natural" | "template" }` returns:

- `answer` (show this), `draftAnswer` (the deterministic template)
- `facts[] { label, value, source }`: show them next to the answer (provenance)
- `caveat`, `followUps[]` (clickable suggestions), `conversationId` (send it back to continue the thread)
- `routedBy` (`keywords` | `llm`) and `phrasedBy` (`template` | `llm:<model>`): optional badges

AI-phrased answers take about 3–5 s; use `style: "template"` for instant answers. The AI may not invent numbers: any rephrasing that adds or drops a number is replaced by the template automatically.

## 8. Health and environment flags

`GET /health` → `data.status` (`ok` | `degraded`), `data.database.status`, `data.simulation` (`on` | `off`). Hide the demo-only simulation buttons when `simulation` is `off`.
