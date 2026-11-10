# API Contract — Resolve AI Backend

Base URL (local): `http://localhost:4000/api/v1`

This document is the agreement between backend and frontend. Each backend feature adds its endpoints here, with example responses, in the same PR as the code.

## Conventions

- JSON bodies use camelCase. Paths use kebab-case and plural nouns.
- **Success:** `{ "data": <object | array>, "meta"?: { "page", "pageSize", "total" } }`. `meta` appears only on paginated lists.
- **Error:** `{ "error": { "code": "<STABLE_CODE>", "message": "<human readable>", "details"?: [{ "path", "message" }] } }`

| Status | Code                   | When                                                                                 |
| ------ | ---------------------- | ------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`     | Params, query or body failed validation (`details` lists each field)                 |
| 400    | `INVALID_JSON`         | Body is not valid JSON                                                               |
| 404    | `ROUTE_NOT_FOUND`      | No such endpoint                                                                     |
| 404    | `NOT_FOUND`            | Resource does not exist                                                              |
| 409    | `CONFLICT`             | Invalid state transition (for example, approving an already approved recommendation) |
| 413    | `PAYLOAD_TOO_LARGE`    | JSON body larger than 100 KB                                                         |
| 415    | `UNSUPPORTED_ENCODING` | Body uses an unsupported charset or encoding                                         |
| 500    | `INTERNAL_ERROR`       | Unexpected server error                                                              |

- No authentication in the MVP. Write actions take a `reviewerName` in the body where a person is recorded.
- CORS allows the origins in `CORS_ORIGIN` (default `http://localhost:3000`).

## Endpoints

### `GET /health`

Liveness and database reachability.

**200**: API and database are up:

```json
{
  "data": {
    "status": "ok",
    "service": "resolve-ai-backend",
    "environment": "development",
    "uptimeSeconds": 42,
    "timestamp": "2026-11-03T15:19:09.881Z",
    "database": { "status": "up", "latencyMs": 38 }
  }
}
```

**503**: API is running but the database is unreachable (same shape, `data` not `error`, so the UI can show a banner):

```json
{
  "data": {
    "status": "degraded",
    "service": "resolve-ai-backend",
    "environment": "development",
    "uptimeSeconds": 42,
    "timestamp": "2026-11-03T15:19:09.881Z",
    "database": { "status": "down" }
  }
}
```

---

## Detect

Response shapes mirror the frontend view models in `frontend/lib/types.ts`, converted to camelCase: `QueueRow`, `Customer`, `UsageView`, `PriorityView`, and the `detectSummary()` result. Differences from the prototype JSON:

- Enum values are **lowercase** (`valueTier: "high"`, `band: "high"`); the UI capitalizes for display.
- Timestamps are **ISO 8601** (`"2026-10-06T08:00:00.000Z"`), not `"2026-10-06 08:00"`.
- Each row also carries `caseId` (needed by later Understand/Act endpoints).

Shared query parameters for lists: `band` (`high`|`medium`|`low`), `status` (`new`|`awaiting_reply`|`unclassified`|`ready`|`action_done`), `segment`, `region`, `search` (part of a customer id, letters/digits/spaces/hyphens only), `page` (≥ 1, default 1), `pageSize` (1–100, default 50).

### `QueueRow` (used by `/risk`, `/risk/:customerId`, `/segments/:band`)

```json
{
  "caseId": "4d1c…",
  "customer": {
    "id": "LR-20417",
    "segment": "PDP reseller",
    "region": "Sinkor",
    "valueTier": "high",
    "tenureMonths": 38,
    "maskedMsisdn": "+231 77• ••• 231",
    "daysSinceLastActivity": 22,
    "careContacts30d": 2,
    "networkFaultReports30d": 0,
    "baselineActivationsPerMonth": 18,
    "activationsPerMonthNow": 6,
    "queueStatus": "new",
    "flaggedAt": "2026-10-06T08:00:00.000Z"
  },
  "usage": {
    "weeks": [{ "weekStart": "2026-08-12", "gb": 1.56 }],
    "baselineGb": 6.5,
    "currentGb": 2,
    "changePct": -69,
    "dropPct": 0.69,
    "bandLowGb": 5.72,
    "bandHighGb": 7.28,
    "baselineActivations": 18,
    "currentActivations": 6
  },
  "priority": {
    "total": 87,
    "band": "high",
    "contributions": [
      {
        "key": "drop",
        "label": "Usage drop",
        "points": 40,
        "max": 40,
        "detail": "-69% against their own 6.5 GB baseline"
      },
      {
        "key": "value",
        "label": "Value tier",
        "points": 18,
        "max": 18,
        "detail": "PDP reseller, High value tier"
      },
      {
        "key": "tenure",
        "label": "Tenure",
        "points": 13,
        "max": 15,
        "detail": "38 months on the network"
      },
      {
        "key": "inactivity",
        "label": "Days inactive",
        "points": 10,
        "max": 12,
        "detail": "22 days since last activity"
      },
      {
        "key": "care",
        "label": "Recent care contact",
        "points": 6,
        "max": 8,
        "detail": "2 care contacts in the last 30 days"
      }
    ]
  },
  "status": "new",
  "reasonLabel": "Affordability"
}
```

`usage.weeks` holds 12 entries (8 baseline + 4 current). `reasonLabel` is `"Awaiting reply"` when the case has no classification yet.

### `GET /risk`

The priority queue (frontend `priorityQueue()`), sorted by priority descending, then customer id. Supports the shared filters and paging.

```json
{ "data": [/* QueueRow */], "meta": { "page": 1, "pageSize": 50, "total": 45 } }
```

### `GET /risk/summary`

Detect KPIs (frontend `detectSummary()`). The top-level figures come from the detection run's **synthetic population** (`simulated: true`); `pilot` holds live counts for the 45-case sample.

```json
{
  "data": {
    "runId": "RUN-2026-10-28-01",
    "flagged": 1284,
    "subscribersScored": 41820,
    "awaitingReply": 463,
    "readyForAction": 218,
    "actionsAwaitingApproval": 47,
    "minimumDaysInactive": 19,
    "pilotSample": 45,
    "historyRecoveryRate": 45,
    "bands": [
      {
        "key": "high",
        "label": "High risk",
        "band": "high",
        "count": 312,
        "pct": 24
      },
      {
        "key": "medium",
        "label": "Medium risk",
        "band": "medium",
        "count": 541,
        "pct": 42
      },
      {
        "key": "low",
        "label": "Low risk",
        "band": "low",
        "count": 431,
        "pct": 34
      }
    ],
    "simulated": true,
    "pilot": {
      "total": 45,
      "bands": [
        {
          "key": "high",
          "label": "High risk",
          "band": "high",
          "count": 2,
          "pct": 4
        },
        {
          "key": "medium",
          "label": "Medium risk",
          "band": "medium",
          "count": 17,
          "pct": 38
        },
        {
          "key": "low",
          "label": "Low risk",
          "band": "low",
          "count": 26,
          "pct": 58
        }
      ],
      "statuses": {
        "new": 13,
        "awaiting_reply": 9,
        "unclassified": 5,
        "action_done": 18
      }
    }
  }
}
```

### `GET /risk/:customerId`

One `QueueRow`. `customerId` must look like `LR-12345`.

Errors: `400 VALIDATION_ERROR` (bad id), `404 NOT_FOUND` (no open case for that customer).

### `GET /customers`

Customer list sorted by id, with the same filters and paging. Each item: `{ caseId, customer, priority: { total, band }, status, reasonLabel }`.

### `GET /customers/:customerId`

Customer 360 (Detect part): a full `QueueRow` plus monthly metrics for the baseline and current windows.

```json
{
  "data": {
    "caseId": "4d1c…",
    "customer": { "id": "LR-20417" },
    "usage": { "baselineGb": 6.5, "currentGb": 2 },
    "priority": { "total": 87, "band": "high", "contributions": [] },
    "status": "new",
    "reasonLabel": "Affordability",
    "metrics": {
      "baseline": {
        "activations": 18,
        "dataGb": 6.5,
        "spendUsd": 24.85,
        "spendLrd": 1691,
        "spendUsdEquivalent": 33.75,
        "activeDays": 13,
        "failedActivationRate": 0,
        "daysSinceLastActivity": 1
      },
      "current": {
        "activations": 6,
        "dataGb": 2,
        "spendUsd": 7,
        "spendLrd": 1330,
        "spendUsdEquivalent": 14,
        "activeDays": 5,
        "failedActivationRate": 0,
        "daysSinceLastActivity": 22
      }
    }
  }
}
```

Activation windows: **current** = last 30 days before the run; **baseline** = the 60 days before that, averaged per 30 days. USD-equivalent uses a fixed configured rate (190 LRD/USD), which is an assumption.

Errors: `400`, `404` as for `/risk/:customerId`.

### `GET /segments`

Priority bands for the pilot sample, the synthetic population bands, and a breakdown by customer segment.

```json
{
  "data": {
    "bands": [
      {
        "id": "high",
        "label": "High risk",
        "minScore": 75,
        "count": 2,
        "pct": 4
      },
      {
        "id": "medium",
        "label": "Medium risk",
        "minScore": 55,
        "count": 17,
        "pct": 38
      },
      {
        "id": "low",
        "label": "Low risk",
        "minScore": 0,
        "count": 26,
        "pct": 58
      }
    ],
    "population": {
      "simulated": true,
      "flagged": 1284,
      "bands": [{ "id": "high", "label": "High risk", "count": 312, "pct": 24 }]
    },
    "bySegment": [{ "segment": "Home fix", "count": 11, "avgPriority": 53.4 }]
  }
}
```

### `GET /segments/:band`

`QueueRow[]` for one band (`high`, `medium` or `low`), with paging. Unknown band → `400`.

### `GET /detection-runs/latest`

```json
{
  "data": {
    "id": "RUN-2026-10-28-01",
    "asOf": "2026-10-28T08:00:00.000Z",
    "modelVersion": "rules-v1",
    "baselineWeeks": 8,
    "currentWeeks": 4,
    "customersScored": 45,
    "casesInRun": 45,
    "hasSimulatedPopulation": true
  }
}
```

### `POST /detection-runs`

Re-runs detection from the stored behaviour. Body (optional): `{ "asOf": "2026-10-28T08:00:00Z" }`. The default is the latest run's date (the dataset snapshot); `asOf` must not be in the future, and unknown fields are rejected. It updates the score of each open case **without changing its queue status**, and opens a new case for any newly flagged customer (usage change ≤ −15%).

**201**:

```json
{
  "data": {
    "id": "RUN-2026-10-28-02",
    "asOf": "2026-10-28T08:00:00.000Z",
    "modelVersion": "rules-v1",
    "customersScored": 45,
    "flagged": 45,
    "newCases": 0,
    "updatedCases": 45,
    "bands": { "high": 2, "medium": 17, "low": 26 }
  }
}
```

Errors: `400 VALIDATION_ERROR` (bad/future `asOf`, unknown field), `409 CONFLICT` (two runs started at once).

---

## Understand (evidence)

Implements the decision point **"Reason known?"**. Resolve AI first checks behavioural **evidence**. If evidence doesn't explain the change, the case needs customer feedback through an **existing Orange channel**; Resolve AI never contacts customers itself (hand-off and AI normalization arrive in F5).

### Evidence rules (current 30-day window)

| Reason                  | Signal                                                                                     | Strength                                            |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `activation_difficulty` | ≥ 3 failed purchase attempts and failed rate ≥ 30%                                         | 0.85                                                |
|                         | ≥ 2 failed attempts                                                                        | 0.60                                                |
| `network_quality`       | Regional incident in the customer's region overlapping the window and ≥ 1 own fault report | 0.85                                                |
|                         | Regional incident only, or ≥ 2 own fault reports                                           | 0.65                                                |
|                         | 1 own fault report                                                                         | 0.40                                                |
| `affordability`         | Average price per bundle (USD-equivalent) fell ≥ 30% vs baseline (trading down)            | 0.55 (never strong: needs the customer's own words) |

A reason is **known from evidence** when the strongest signal is ≥ 0.80 (the same gate recommendations use).

### Next step (`assessment.nextStep`)

| Value              | Meaning                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `classified`       | The case already has a reason (from feedback, evidence or a human)       |
| `use_evidence`     | Evidence is strong enough: an analyst can accept it as the reason        |
| `awaiting_reply`   | A feedback request was handed off to an Orange channel and is unanswered |
| `request_feedback` | Prioritized (high/medium band), no strong evidence, no request yet       |
| `monitor`          | Low priority, no strong evidence                                         |

### `GET /customers/:customerId/reasons`

The case's reason, shaped like the frontend `ClassificationView` (`classifyReason()`), plus `caseId`, `source`, `review` and `assessment`.

```json
{
  "data": {
    "caseId": "4d1c…",
    "status": "classified",
    "primary": {
      "id": "affordability",
      "label": "Affordability",
      "icon": "wallet",
      "confidence": 0.862
    },
    "alternatives": [
      {
        "id": "reduced_need",
        "label": "Reduced need",
        "icon": "arrow-down",
        "confidence": 0.041
      }
    ],
    "evidence": [
      {
        "kind": "behavioural",
        "title": "Behavioural signal — the customer's own words",
        "body": "\"Money hard this month. Buy small weekly.\" — …"
      },
      {
        "kind": "usage",
        "title": "Usage pattern",
        "body": "6 bundle activations this month against their own baseline of 18 per month (-69%)."
      },
      {
        "kind": "exclusion",
        "title": "Network faults checked",
        "body": "No fault reported from this customer in 22 days, …"
      }
    ],
    "feedback": {
      "requestId": "…",
      "askedAt": "2026-10-12T08:00:00.000Z",
      "channel": "Orange SMS",
      "channelId": "sms",
      "question": "Orange: We noticed your bundle use dropped. Reply with one number: …",
      "replyReceived": true,
      "repliedAt": "2026-10-12T15:00:00.000Z",
      "classifiedBy": "analyst.hui",
      "classifiedAt": "2026-10-14T16:00:00.000Z",
      "verbatim": "Money hard this month. Buy small weekly."
    },
    "source": "feedback",
    "review": {
      "reasonId": "affordability",
      "reviewedBy": "analyst.hui",
      "reviewedAt": "2026-10-24T08:00:00.000Z"
    },
    "assessment": {
      "nextStep": "classified",
      "reasonKnown": true,
      "signals": []
    }
  }
}
```

- `status`: `classified`, `awaiting_reply`, or `unclassified` (as in the prototype).
- `primary` is `null` and `alternatives` is empty until a reason exists.
- `feedback` is `null` if no request was ever made.
- `source`: `feedback` | `evidence` | `human` | `null`.

Example for a case explained by evidence (`LR-00714`, Ganta outage):

```json
"assessment": {
  "nextStep": "use_evidence",
  "reasonKnown": true,
  "signals": [
    { "reasonId": "network_quality", "label": "Network quality", "strength": 0.85,
      "detail": "Network incident in Ganta (reported 2026-10-16) overlaps the drop, and 2 network fault reports from this customer in the last 30 days." },
    { "reasonId": "affordability", "label": "Affordability", "strength": 0.55,
      "detail": "Average price per bundle fell from $2.27 to $1.47 (USD-equivalent): the customer is trading down to cheaper bundles." }
  ]
}
```

Errors: `400` (bad id), `404` (no open case).

### `POST /customers/:customerId/reasons/evidence`

A human accepts strong behavioural evidence as the case's reason. It stores a classification with `source: "evidence"` and `classifiedBy: "rules:evidence-v1"`, records the reviewer, and moves the case to `ready`.

Body: `{ "reviewerName": "analyst.hui" }` (1–60 chars).

**201**: the updated `GET /customers/:customerId/reasons` view.

Errors: `400` (missing/invalid `reviewerName`, unknown field), `404`, `409 CONFLICT` (the case already has a reason, or the evidence is below 80%; the message says to request feedback instead).

### `GET /feedback-requests`

The feedback queue: requests handed off to Orange channels, sorted by case priority. Filters: `status` (`pending`|`handed_off`|`responded`|`no_response`), `channel` (`voice_call`|`sms`|`ussd`|`field_agent_interview`|`customer_service`|`facebook_comment`), `page`, `pageSize`.

```json
{
  "data": [
    {
      "id": "…",
      "caseId": "…",
      "customerId": "LR-26878",
      "segment": "Home fix",
      "region": "Sinkor",
      "priority": { "total": 75, "band": "high" },
      "queueStatus": "awaiting_reply",
      "channel": "Orange SMS",
      "channelId": "sms",
      "question": "Orange: We noticed your bundle use dropped. …",
      "status": "handed_off",
      "triggerReason": "no_evidence",
      "createdAt": "2026-10-13T08:00:00.000Z",
      "handedOffAt": "2026-10-13T08:00:00.000Z",
      "respondedAt": null,
      "reply": null
    }
  ],
  "meta": { "page": 1, "pageSize": 50, "total": 22 }
}
```

`reply` is `{ "text", "receivedAt" }` once the channel returns an answer.

### `GET /feedback-requests/suggestions`

Cases that should get a feedback request: prioritized (high/medium band), open, no reason, no open or answered request, and no strong evidence. Each item has `caseId`, `customerId`, `segment`, `region`, `valueTier`, `priority`, `queueStatus`, `suggestedChannel` (`voice_call` for high band or high value tier, otherwise `sms`), `channelLabel`, `trigger` (`no_evidence` | `low_confidence`) and `signals`.

On the seeded data this list is **empty** (every pilot case already has a request); it fills when detection opens new cases. Resolve AI only suggests; the hand-off to an Orange channel is F5.

---

## Understand: channels and AI

Resolve AI **hands off** feedback requests to Orange's existing channels and **ingests** the replies those channels return; it never contacts customers itself. Replies are normalized into the fixed taxonomy by an LLM (OpenRouter, behind an `LlmProvider` interface) with a deterministic **keyword fallback**: the API works fully without an API key.

AI boundary:

- Only the reply text and the taxonomy are sent; no customer id, MSISDN or region.
- The output is Zod-validated: `{ reasonId ∈ taxonomy, confidence 0–1, sentiment, summary }`.
- Timeout 8 s, then 1 retry, then the fallback.
- `classifiedBy` is `llm:<model>` or `keyword_fallback`.
- The LLM never decides recommendations or outcomes.

### `POST /customers/:customerId/feedback-requests`

Hands an ask to an Orange outbound channel. Body: `{ "channel": "sms" | "voice_call" | "ussd" | "field_agent_interview", "reviewerName": "analyst.hui", "question"?: string }` (a default question exists per channel).

An unanswered ask older than **7 days** is marked `no_response`, and a follow-up on another channel is allowed. The case moves to `awaiting_reply`.

**201**:

```json
{
  "data": {
    "id": "715f8e54-…",
    "caseId": "398b2ea9-…",
    "customerId": "LR-08222",
    "channel": "Orange voice call",
    "channelId": "voice_call",
    "question": "Call script: We noticed you are buying fewer data bundles. …",
    "status": "handed_off",
    "triggerReason": "no_evidence",
    "handedOffAt": "2026-11-09T18:29:16.586Z",
    "handedOffBy": "analyst.hui",
    "previousRequestsMarkedNoResponse": 1,
    "note": "Handed off to the Orange channel. Resolve AI does not contact the customer."
  }
}
```

Errors: `409` (the case already has a reason, or an ask is still inside the 7-day reply window), `400`, `404`.

### `POST /feedback-requests/:id/responses`

How a real Orange channel returns a reply. Body: `{ "text": "…" (≤ 1000), "receivedAt"?: ISO }`.

It stores the reply, marks the request `responded`, classifies the text and stores the reason (`source: "feedback"`). The case then becomes:

- `ready` when confidence ≥ 0.80
- otherwise `unclassified` (needs a human read; `needsReview` when < 0.60)

A reason set meanwhile by evidence or a human is never overwritten; the reply is stored for the record (`stored: "reply_only"`).

**201**: `{ "stored": "reply_and_reason", "classifiedBy": "llm:openai/gpt-4o-mini", "reasons": <reason view> }`

Errors: `404`, `409` (the request already has a reply), `400`.

### `POST /simulation/feedback-requests/:id/reply` (demo only)

Plays Orange's channel returning a reply. Body: `{ "text"?: string }`. Without `text`, a synthetic Liberian-English reply is chosen deterministically. The reply goes through the same ingestion as above and is flagged `simulated`. **Not mounted when `NODE_ENV=production`.**

### `POST /feedback`

Inbound feedback that arrives without an ask. Body: `{ "channel": "customer_service" | "facebook_comment", "text", "customerId"?: "LR-12345", "region"?: string }`.

It's stored as context (linked to the open case when `customerId` is given) and returns a classification **preview**. It never changes the case's reason.

**201**: `{ "id", "channel", "channelId", "customerId", "caseId", "region", "preview": { "reasonId", "confidence", "sentiment", "summary", "classifiedBy" }, "note" }`

### `PATCH /reasons/:classificationId`

A human confirms or corrects a reason (`classificationId` is in the reason view). Body: `{ "reasonId", "reviewerName", "note"? }`.

- **Confirming** marks the record as reviewed.
- **Correcting** also adds a `source: "human"` reason (confidence 1). From then on, the queue label, the recommendation and the report use it, and the human/AI agreement metric counts the disagreement.

The case moves to `ready`.

**200**: the updated reason view. Errors: `404` (unknown classification or reason), `400`.

---

## Recommend

### `GET /customers/:customerId/recommendation`

The live next-best-action, shaped like the frontend `RecommendationView` (`recommendAction()`).

Predicted recovery comes from campaign history (reason × action; 0.20 when there's no row). The eligibility rules match the prototype:

| Code                | Rule                                          |
| ------------------- | --------------------------------------------- |
| `plan_active`       | Active within 90 days                         |
| `no_discount_30d`   | No offer within 30 days of the run date       |
| `regional_stock`    | Monrovia, Sinkor or Paynesville               |
| `confidence_gate`   | Reason confidence ≥ 80%                       |
| `affordability_cap` | Price ≤ $2.00                                 |
| `fault_reported`    | A network fault was reported                  |
| `prior_activation`  | The customer has activated this bundle before |
| `pricing_approval`  | Always fails (outside the pilot)              |
| `consent_call`      | ≥ 2 care contacts                             |

```json
{
  "data": {
    "caseId": "…",
    "customerId": "LR-20417",
    "reason": {
      "id": "affordability",
      "label": "Affordability",
      "icon": "wallet",
      "confidence": 0.862
    },
    "recommended": {
      "action": {
        "id": "daily_mini_600",
        "name": "Daily Mini 600 MB for $0.60",
        "shortName": "Daily Mini 600 MB",
        "price": 0.6,
        "currency": "USD",
        "sizeMb": 600,
        "validityHours": 24,
        "reasons": ["affordability"],
        "mismatchNote": "",
        "channel": "Orange SMS",
        "channelId": "sms",
        "window": "Today 16:00–18:00",
        "body": "Orange: Daily Mini 600 MB for $0.60, …",
        "eligibility": [{ "code": "plan_active", "label": "Plan is active" }]
      },
      "predictedRecovery": 0.62,
      "eligible": true,
      "checks": [
        {
          "code": "plan_active",
          "label": "Plan is active",
          "passed": true,
          "detail": "Line active, last seen 22 days ago."
        }
      ],
      "why": "Matches a affordability reply: daily mini 600 mb keeps the spend the customer is already making.",
      "rejectedReason": null
    },
    "candidates": [],
    "notRecommended": [],
    "history": [
      {
        "reason": "Affordability",
        "action": "Daily Mini 600 MB for $0.60",
        "outcome": "62% recovered (n=214, synthetic)"
      }
    ],
    "current": null
  }
}
```

`candidates` are the eligible actions ranked by predicted recovery. `notRecommended` lists the rest, each with its `rejectedReason`. `current` is the case's latest persisted recommendation, if any.

### `POST /customers/:customerId/recommendations`

Persists the current best action as a **pending** recommendation. The snapshot includes the action, predicted recovery, checks, alternatives (with eligibility and rejection reasons), the rationale (`why`) and the objective. Body: `{}`.

**201**: the recommendation (see `GET /recommendations/:id`). Errors: `409` (no reason yet, no eligible action, or a pending recommendation already exists).

### `GET /recommendations` and `GET /recommendations/:id`

List (filter `status`: `pending` | `approved` | `rejected` | `superseded`, paging) and detail. Each item:

`{ id, caseId, customerId, action: { id, name, shortName }, predictedRecovery, rationale, objective, eligibilityChecks, alternatives, status, decidedBy, decidedAt, decisionNote, createdAt, intervention: { id, reference } | null }`

---

## Act

`:recommendationId` is the **recommendation id**.

### `POST /actions/:recommendationId/approve`

Body: `{ "reviewerName", "actionId"?, "channel"?, "window"?, "note"? }`.

- Same action → decision `approved`.
- A different **eligible** alternative → decision `changed`.

It creates the intervention `INT-<next>`, status `handed_off` (handed to Orange's workflow; Resolve AI sends nothing). The recommendation becomes `approved` and the case `action_done`.

**201**: `{ "decision": "approved" | "changed", "intervention": <intervention> }`. Errors: `409` (not pending, or the action isn't an eligible alternative), `404`, `400`.

### `POST /actions/:recommendationId/reject`

The Act screen's **"send to human review"**. Body: `{ "reviewerName", "note" }` (note required). The recommendation becomes `rejected` and the case `unclassified`.

**200**: `{ "recommendationId", "status": "rejected", "caseStatus": "unclassified" }`. Errors: `409`, `404`, `400`.

### `GET /interventions` and `GET /interventions/:id`

`:id` accepts the uuid or the reference (`INT-4106`). Filter `status`: `approved` | `handed_off` | `delivered` | `failed` | `cancelled`. Each item:

`{ id, reference, recommendationId, caseId, customerId, action, recommendedActionId, decision, channel, channelId, deliveryWindow, approvedBy, approvedAt, status, handedOffAt, deliveredAt, clickRecorded, note, simulatedThrough, hasOutcome }`

---

## Measure

### `POST /simulation/interventions/:id/advance` (demo only)

Simulates Orange delivering the intervention and the customer's next **30 days**: synthetic purchases are generated, the intervention becomes `delivered`, and `simulatedThrough` is set. Body: `{ "scenario"?: "recover" | "partial" | "no_change" | "decline" }`.

The default scenario is deterministic (a stable hash of the reference against the predicted recovery), so recoveries happen about as often as campaign history predicts. The window may extend past today. **Not mounted in production.**

**200**: `{ "reference", "scenario", "simulatedPurchases", "windowEnd", "simulated": true }`. Errors: `409` (already simulated, failed/cancelled, or already measured).

### `POST /interventions/:id/outcome`

Measures the outcome from recorded purchases in (hand-off, hand-off + 30 days], against the case's baseline and the level at which it was flagged. The rule is the share of the drop recovered:

| Share recovered | Outcome                  |
| --------------- | ------------------------ |
| ≥ 50%           | `re_engaged` (recovered) |
| 15–50%          | `partially_engaged`      |
| −10% to 15%     | `no_change`              |
| worse           | `declined_further`       |

It writes the outcome (`cohort: "treated"`) and a `post_intervention` metrics row. Body: `{ "reviewerName"?, "notes"? }`.

**201**:

```json
{
  "data": {
    "id": "…",
    "interventionId": "INT-4106",
    "customerId": "LR-08222",
    "windowDays": 30,
    "baselineActivations": 11,
    "activationsAfter": 8,
    "changePct": -27,
    "shareOfDropRecovered": 0,
    "outcomeType": "no_change",
    "recovered": false,
    "simulated": true,
    "note": "…",
    "measuredAt": "2026-12-09T18:29:42.634Z"
  }
}
```

Errors: `409` (the window hasn't closed and hasn't been simulated, or an outcome already exists), `404`.

### `GET /customers/:customerId/measure`

The frontend `MeasureView` (`measureView()`):

- `events[]`: `{ label, detail, at, system }`, with the same wording and order as the prototype. Automated classifications say "classified automatically (…)" rather than "confirmed by a human".
- `outcome`, `intervention`, `action`
- `verdict`: `recovered` | `not_recovered` | `awaiting_window`
- `activationsAfter`, `vsBaselinePct`
- `controlSummary`: `{ recovered, total, rate }`

---

## Report

### `GET /reports/summary`

The frontend `reportView()`: `flagged`, `windowDays`, `churned`, `churnPct`, `approvalsThisWeek`, `approvalsTotal`, `marginImpactPct`, `awaitingReply`, `classified`, `reasons[] { label, count, pct }` (ties ordered by label), `treated` and `control` `{ recovered, n, rate, ci: { low, high } }`, `differencePoints`, `intervalsOverlap`, `agreement { agreed, reviewed, pct, rows[] }`, `history[]`, `simulated: true`.

`ci` is the **Wilson 95% interval, using the standard formula**. The prototype's `wilson()` divides by `n` instead of `√n` and produces intervals that are too narrow (treated 2/6: [0.275, 0.522] there, versus [0.097, 0.700] here).

### `GET /reports/drivers`

Reasons for open cases with `count`, `pct` and `bySource { feedback, evidence, human }`, plus `coverage { openCases, classified, unknown, needsReview, asked, answered, unanswered, noReasonYet }`.

### `GET /reports/actions`

The funnel per action: `recommended`, `approved`, `changedTo`, `rejected`, `delivered`, `measured`, `recovered`; plus `campaignHistory[]` (synthetic).

### `GET /dashboard/trends`

Average weekly GB across open cases for the 12 detection weeks: `weeks[] { weekStart, period: "baseline" | "current", customers, avgGb }`.

---

## Executive Copilot

Plain-language questions answered **only from Resolve AI's own aggregates**: the same figures the dashboard shows. Each answer lists its facts with provenance. The pipeline is a port of the prototype's `copilot.ts`:

| Step      | How                                               | LLM role                                                                                                                                                                                                      |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Route  | Keyword rules (same order as the prototype)       | Only when the keywords find nothing: picks one intent from the fixed list below (Zod-validated). A customer it names must exist, or the Copilot refuses                                                       |
| 2. Facts  | Detect, Understand, Recommend and Report services | None                                                                                                                                                                                                          |
| 3. Answer | Deterministic template (prototype wording)        | Optional rephrasing. **Rejected if it adds any number that isn't in the facts or the template, or drops any number from the template** (numeric grounding and completeness guards); the template is then used |

**Intents:**

| Intent       | Example question                                                        |
| ------------ | ----------------------------------------------------------------------- |
| `customer`   | Tell me about LR-20417 / this customer                                  |
| `pilot`      | Is the pilot working?                                                   |
| `population` | How many customers are at risk?                                         |
| `segment`    | Which segment needs the most attention?                                 |
| `reasons`    | Why are customers disengaging?                                          |
| `action`     | What should we do about affordability / network quality / activation?   |
| `approvals`  | What is waiting for approval?                                           |
| `trust`      | How confident are we in the reasons?                                    |
| `unknown`    | Honest refusal: "I only answer from the data loaded in this workbench…" |

Without `OPENROUTER_API_KEY`, routing is keywords-only and every answer is the template.

### `POST /copilot/chat`

Body: `{ "question": string (1–500), "conversationId"?: uuid, "style"?: "natural" | "template" }`. `style: "template"` skips the LLM phrasing. Pass `conversationId` to continue a thread.

**201**:

```json
{
  "data": {
    "id": "…",
    "conversationId": "…",
    "question": "Is the pilot working?",
    "intent": "pilot",
    "routedBy": "keywords",
    "answer": "It's too early to determine if the pilot is working. So far, 2 of 6 treated customers recovered (33%) compared to 2 of 8 matched controls (25%), showing an 8-point difference. However, the 95% intervals overlap, indicating we cannot yet distinguish a real effect from noise.",
    "draftAnswer": "Too early to call. 2 of 6 treated customers recovered (33%), against 2 of 8 matched controls (25%) — a difference of 8 points. The 95% intervals overlap, so this pilot cannot separate a real effect from noise yet.",
    "phrasedBy": "llm:openai/gpt-4o-mini",
    "facts": [
      {
        "label": "Treated",
        "value": "2/6 (10–70%)",
        "source": "outcomes (treated) · Wilson 95% interval"
      },
      {
        "label": "Control",
        "value": "2/8 (7–59%)",
        "source": "outcomes (control cohort) · Wilson 95% interval"
      },
      {
        "label": "Difference",
        "value": "8 points",
        "source": "report summary"
      },
      {
        "label": "Pilot window",
        "value": "21 days",
        "source": "detection_runs · population summary"
      }
    ],
    "caveat": "These recovery rates are simulated placeholders. Real churn validation needs Orange historical outcomes, which we do not have.",
    "followUps": [
      "Why are customers disengaging?",
      "How many customers are at risk?"
    ],
    "createdAt": "…"
  }
}
```

- `routedBy`: `keywords` | `llm`
- `phrasedBy`: `template` | `llm:<model>`
- `draftAnswer` is always the deterministic template; `answer === draftAnswer` when `phrasedBy` is `template`

Errors: `400` (empty or over-long question, bad uuid, unknown field), `404` (unknown `conversationId`).

### `GET /copilot/suggestions`

The 6 suggested questions (same as the prototype).

### `GET /copilot/conversations/:conversationId`

`{ "conversationId", "turns": [ /* answers as above, oldest first */ ] }`. Errors: `404`.

Stored turns live in `ai_conversations`. They are references to the facts used, not a source of truth.
