# Canonical Data Model / ERD

This is the **Resolve AI canonical prototype model**, not a claim about Orange's production database schema. A future integration layer would map Orange's actual fields into this model. All MVP data is synthetic.

The source of truth is the Drizzle schema in [`backend/src/db/schema/`](../backend/src/db/schema/); this diagram mirrors it.

## v2 model (implemented)

Organized by the loop **Detect → Understand → Recommend → Act → Measure → Report**. A **case** is one detection episode for a customer; every later step hangs off it.

```mermaid
erDiagram
    CUSTOMERS ||--o{ CUSTOMER_WEEKLY_USAGE : "uses data"
    CUSTOMERS ||--o{ BUNDLE_ACTIVATIONS : buys
    BUNDLES ||--o{ BUNDLE_ACTIVATIONS : "purchased as"
    CUSTOMERS ||--o{ NETWORK_FAULTS : reports
    DETECTION_RUNS ||--o{ CUSTOMER_METRICS : computes
    CUSTOMERS ||--o{ CUSTOMER_METRICS : "measured in"
    DETECTION_RUNS ||--o{ CASES : flags
    CUSTOMERS ||--o{ CASES : "flagged in"
    CASES ||--o{ FEEDBACK_REQUESTS : "asks via Orange channel"
    FEEDBACK_REQUESTS ||--o{ CUSTOMER_FEEDBACK : "returns"
    CASES ||--o{ CUSTOMER_FEEDBACK : has
    CASES ||--o{ REASON_CLASSIFICATIONS : "explained by"
    CUSTOMER_FEEDBACK ||--o{ REASON_CLASSIFICATIONS : "classified into"
    REASONS ||--o{ REASON_CLASSIFICATIONS : uses
    CASES ||--o{ RECOMMENDATIONS : gets
    REASON_CLASSIFICATIONS ||--o{ RECOMMENDATIONS : "based on"
    ACTIONS ||--o{ RECOMMENDATIONS : proposes
    ACTIONS ||--o{ ACTION_REASONS : "built for"
    REASONS ||--o{ ACTION_REASONS : ""
    REASONS ||--o{ CAMPAIGN_HISTORY : ""
    ACTIONS ||--o{ CAMPAIGN_HISTORY : "past results"
    RECOMMENDATIONS ||--o| INTERVENTIONS : "approved as"
    CASES ||--o{ INTERVENTIONS : ""
    INTERVENTIONS ||--o| OUTCOMES : "measured by"
    CASES ||--o{ OUTCOMES : "treated or control"

    CUSTOMERS {
        text id PK "LR-20417"
        text segment
        text region
        value_tier value_tier
        int tenure_months
        text masked_msisdn
    }
    CUSTOMER_WEEKLY_USAGE {
        text customer_id PK
        date week_start PK
        numeric data_gb "data consumed, separate from purchases"
    }
    BUNDLES {
        text id PK
        bundle_validity validity
        int data_mb
        numeric price
        currency currency "USD or LRD"
    }
    BUNDLE_ACTIVATIONS {
        uuid id PK
        text customer_id FK
        text bundle_id FK
        numeric price_paid
        currency currency
        activation_status status "success or failed"
        timestamptz activated_at
    }
    NETWORK_FAULTS {
        uuid id PK
        text customer_id FK "null = regional incident"
        text region
        fault_source source
        timestamptz reported_at
    }
    DETECTION_RUNS {
        text id PK "RUN-2026-10-28-01"
        timestamptz run_at
        int baseline_weeks
        int current_weeks
        text model_version
    }
    CUSTOMER_METRICS {
        text run_id PK
        text customer_id PK
        metric_period period PK "baseline, current, post_intervention"
        int activations
        numeric data_gb
        numeric spend_usd_equivalent
        int days_since_last_activity
    }
    CASES {
        uuid id PK
        text customer_id FK
        text run_id FK
        int change_pct
        int priority_score
        priority_band priority_band
        jsonb contributions
        queue_status queue_status
    }
    FEEDBACK_REQUESTS {
        uuid id PK
        uuid case_id FK
        text channel "Orange-owned"
        feedback_trigger trigger_reason
        feedback_request_status status
    }
    CUSTOMER_FEEDBACK {
        uuid id PK
        uuid case_id FK
        uuid feedback_request_id FK "null for inbound"
        text channel
        text raw_text
    }
    REASONS {
        text id PK "affordability, competitor, ..."
        text label
    }
    REASON_CLASSIFICATIONS {
        uuid id PK
        uuid case_id FK
        text reason_id FK
        numeric confidence
        classification_source source
        bool needs_review
        text reviewed_reason_id FK
    }
    ACTIONS {
        text id PK "daily_mini_600"
        int sort_order
        numeric price
        text channel
        jsonb eligibility_rules
    }
    ACTION_REASONS {
        text action_id PK
        text reason_id PK
    }
    CAMPAIGN_HISTORY {
        int id PK
        text reason_id FK
        text action_id FK
        numeric recovery_rate
        int sample_size
    }
    RECOMMENDATIONS {
        uuid id PK
        uuid case_id FK
        text action_id FK
        numeric predicted_recovery
        text rationale
        recommendation_status status
    }
    INTERVENTIONS {
        uuid id PK
        text reference "INT-4100"
        uuid recommendation_id FK
        text approved_by
        intervention_status status
        text delivery_window
        timestamptz simulated_through "demo only"
    }
    OUTCOMES {
        uuid id PK
        outcome_cohort cohort "treated or control"
        uuid case_id FK
        uuid intervention_id FK
        int activations_after
        outcome_type outcome_type
        bool recovered
    }
    AI_CONVERSATIONS {
        uuid id PK
        uuid conversation_id
        text question
        text intent
        text routed_by "keywords or llm"
        jsonb facts "with provenance"
        text answer
        text phrased_by "template or llm"
    }
```

## Mapping from the v1 diagram

The first-round diagram ([`diagrams/erd.png`](diagrams/erd.png), superseded) maps to v2 as follows:

| v1 entity | v2 table(s) |
|---|---|
| CUSTOMER | `customers` |
| BUNDLE_ACTIVITY | `bundle_activations` (one row per purchase) + `bundles` (catalog, USD/LRD) + `customer_weekly_usage` (data consumed per week) |
| ENGAGEMENT_SIGNAL | `cases.contributions` (the visible parts of the priority score) + `customer_metrics` |
| BEHAVIORAL_ASSESSMENT | `cases` (one detection episode, with priority and queue status) |
| FEEDBACK_REQUEST | `feedback_requests` (handed off to an existing Orange channel) |
| CUSTOMER_FEEDBACK | `customer_feedback` + `reason_classifications` (structured reason, confidence, human review) |
| RECOMMENDATION | `recommendations` + `actions` / `action_reasons` / `campaign_history` |
| INTERVENTION | `interventions` |
| OUTCOME | `outcomes` (treated cases and a matched control cohort) |
| (new) | `network_faults`, `detection_runs`, `reasons`, `ai_conversations` (Copilot turns, F10) |
