# Resolve AI

**Explainable retention decision intelligence for Orange** · Orange Summer Challenge 2026

Resolve AI detects customer disengagement early, understands why, recommends the right retention action, records the human approval, and measures whether it worked, all in one closed loop:

**Detect → Understand → Recommend → Act → Measure → Report**

> The MVP focuses on **data-bundle engagement** and uses **synthetic data only**. Nothing in this repository represents Orange production data, schemas or systems.

## Live links

| What | Link |
| --- | --- |
| **Prototype: Retention Workbench** | <https://resolve-ai-omega.vercel.app> |
| **Backend API** | <https://resolve-ai-production-8093.up.railway.app/api/v1> |
| **Interactive API docs** | <https://resolve-ai-production-8093.up.railway.app/api/v1/docs> |
| API health | <https://resolve-ai-production-8093.up.railway.app/api/v1/health> |

## The demo journey

Customer **LR-20417**, a PDP reseller in Sinkor, drops from 6.5 to 2.0 GB of data a month (−69%) and gets a **disengagement priority of 87**. No behavioural evidence explains it, so Resolve AI hands a short question to an existing **Orange SMS** channel. The reply, *"Money hard this month. Buy small weekly."*, is classified as **affordability** (86% confidence). A **Daily Mini 600 MB for $0.60** is recommended (62% recovery in past campaigns), a manager approves it, and the outcome is measured against the customer's own baseline and a control group.

## How it works

| Step | What happens |
| --- | --- |
| **Detect** | Compares each customer's recent bundle activity with their own baseline; ranks drops with a transparent, fully explained priority score |
| **Understand** | Uses behavioural evidence first (failed activations, network incidents); otherwise asks through an Orange-owned channel. AI normalizes informal replies into a fixed reason taxonomy with a confidence score |
| **Recommend** | Next-best action from the change and the reason, with eligibility checks, rationale and campaign history |
| **Act** | A human approves, changes or rejects. Nothing is handed off without an approval record |
| **Measure** | Deterministic before/after verdict, compared with a matched control group |
| **Report** | Reasons, coverage, actions, outcomes, treated vs control with Wilson 95% intervals, AI–analyst agreement |
| **Copilot** | Plain-English questions, answered from verified figures; AI phrasing is rejected if it introduces any unverified number |

### Design principles

- **The AI is never the source of truth.** Metrics, scores, recommendations and outcomes are deterministic. The LLM only classifies free text into a fixed taxonomy and phrases answers from facts it is given, with a keyword fallback if it is unavailable.
- **Resolve AI never contacts customers.** It hands requests and approved actions to Orange's existing channels.
- **Human in the loop**, **targeted contact only**, and **honest labelling**: a *disengagement priority*, not a churn prediction.

## Repository

| Folder | Contents | Stack |
| --- | --- | --- |
| [`frontend/`](frontend/) | Retention Workbench: one screen per loop step plus Copilot, reading and writing through the API | Next.js, React, TypeScript (Vercel) |
| [`backend/`](backend/) | Decision API, about 40 endpoints | Node.js 22, TypeScript, Express 5, PostgreSQL (Neon), Drizzle ORM, Zod, OpenRouter (Railway) |
| [`docs/`](docs/) | Architecture, data model, decisions, analyses, API guides | |

## Documentation

- [System architecture](docs/architecture.md)
- [Data model / ERD](docs/erd.md)
- [Architecture decision record](docs/adr.md)
- [Technical SWOT](docs/swot.md) · [Fishbone root-cause analysis](docs/fishbone.md)
- [Backend plan](docs/backend-plan.md): scope, rules and scoring formulas
- [API guide](docs/API.md) · [API reference](docs/api-contract.md) · [OpenAPI 3.1](docs/openapi.json) · [Postman collection](docs/postman/)
- [Deployment runbook](docs/DEPLOYMENT.md)

## Run locally

**Frontend**

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The workbench uses the hosted API by default. To use a local backend, create `frontend/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` (see [`frontend/.env.example`](frontend/.env.example)). Demo-only buttons (simulated reply, simulated 30 days) appear only when the API runs with `ENABLE_SIMULATION=true`.

**Backend** (needs a free [Neon](https://neon.tech) PostgreSQL database; full steps in [`backend/README.md`](backend/README.md))

```bash
cd backend
npm install
cp -n .env.example .env   # then set DATABASE_URL
npm run db:migrate
npm run db:seed           # loads the synthetic pilot dataset
npm run dev               # http://localhost:4000/api/v1
```

## Limitations

Synthetic data only; Orange channels are simulated; the 45-case pilot is illustrative and its treated-vs-control difference is not statistically conclusive; no login in the MVP. A real deployment would need an approved data-mapping layer, data-access authorization and Orange privacy and security review.
