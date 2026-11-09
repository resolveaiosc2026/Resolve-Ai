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
