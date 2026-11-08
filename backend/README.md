# Resolve AI — Backend

REST API for the Resolve AI decision-intelligence loop: **Detect → Understand → Recommend → Act → Measure → Report**.
See [`docs/backend-plan.md`](../docs/backend-plan.md) for scope and roadmap, and [`docs/api-contract.md`](../docs/api-contract.md) for endpoints.

> The MVP uses **synthetic data only**. Nothing here represents Orange production data or systems.

## Requirements

- Node.js 22 or later
- npm

## Setup

1. Create a free [Neon](https://neon.tech) project and copy its **pooled** connection string (Dashboard → Connect).
2. Install, configure and migrate:

```bash
cd backend
npm install
cp -n .env.example .env   # FIRST SETUP ONLY (-n never overwrites an existing .env); then set DATABASE_URL
npm run db:migrate        # creates the tables in Neon
npm run db:seed           # loads the synthetic pilot dataset (wipes existing data)
npm run db:verify         # checks the anchor figures; every line should say PASS
npm run dev
```

> Never re-copy `.env.example` over an existing `.env`: it replaces your real `DATABASE_URL` with the placeholder.

The API listens on `http://localhost:4000/api/v1`. Check it with:

```bash
curl http://localhost:4000/api/v1/health
```

`database.status` should be `"up"`. If the database is unreachable the endpoint returns `503` with `"status": "degraded"`.

## Database

PostgreSQL on Neon, accessed through [Drizzle ORM](https://orm.drizzle.team). The schema lives in `src/db/schema/` (one file per loop area); SQL migrations generated from it live in `drizzle/` and are committed.

To change the schema: edit `src/db/schema/*`, run `npm run db:generate`, review the new SQL in `drizzle/`, then `npm run db:migrate`. Never edit an applied migration; generate a new one.

### Synthetic data

`npm run db:seed` loads a **synthetic** pilot dataset (no real Orange data) in one transaction: it truncates every table, then inserts. It is safe to re-run and refuses to run with `NODE_ENV=production` unless `--force` is passed.

The dataset is a faithful port of the frontend generator (`frontend/scripts/generate-data.mjs`, seed `20261028`): the same 45 case IDs and figures, so the API reproduces what the UI shows. Purchase events, bundles (USD and LRD at a configured 190 LRD/USD) and care/fault rows come from a second seed so the original sequence is untouched.

`npm run db:verify` checks the database against the frontend's anchor figures (e.g. `LR-20417`: 6.5 → 2.0 GB/month, −69%, priority 87) and, when `frontend/data/` is present, compares the ported generator with the frontend JSON field by field.

## Scripts

| Script                            | What it does                                     |
| --------------------------------- | ------------------------------------------------ |
| `npm run dev`                     | Start the API with auto-reload (tsx)             |
| `npm run build`                   | Compile TypeScript to `dist/`                    |
| `npm start`                       | Run the compiled API from `dist/`                |
| `npm run typecheck`               | Type-check without emitting                      |
| `npm run lint`                    | ESLint                                           |
| `npm run format` / `format:check` | Prettier write / check                           |
| `npm run db:generate`             | Generate a SQL migration from schema changes     |
| `npm run db:migrate`              | Apply pending migrations to the database         |
| `npm run db:studio`               | Browse the database in Drizzle Studio            |
| `npm run db:seed`                 | Wipe and load the synthetic pilot dataset        |
| `npm run db:verify`               | Check the seeded data against the anchor figures |

## Environment

| Variable       | Default                 | Purpose                                                                                         |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `development`           | `development` or `production` (hides internal error messages)                                   |
| `PORT`         | `4000`                  | HTTP port                                                                                       |
| `CORS_ORIGIN`  | `http://localhost:3000` | Comma-separated browser origins allowed to call the API                                         |
| `LOG_LEVEL`    | `info`                  | `debug`, `info`, `warn` or `error`                                                              |
| `DATABASE_URL` | _(required)_            | Neon pooled Postgres connection string (`postgresql://…?sslmode=require`). Secret: never commit |

The environment is validated at startup; the server refuses to start with a clear message if a value is invalid.

## Structure

```
src/
  app.ts            # builds the Express app (middleware, routes, error handling)
  server.ts         # starts the HTTP server, graceful shutdown
  routes.ts         # mounts feature modules under /api/v1
  config/env.ts     # Zod-validated environment
  config/rules.ts   # tunable rules: windows, weights, thresholds, FX rate, channels
  db/client.ts      # Postgres pool + Drizzle instance + health check
  db/schema/        # tables by loop area: catalog, customers, detect, understand, act
  db/seed/          # synthetic pilot dataset (db:seed) and verification (db:verify)
  lib/              # logger, HttpError helpers
  middleware/       # request logger, 404, error handler
  modules/<feature>/<feature>.routes.ts | .service.ts | .repository.ts
```

Routes stay thin (HTTP only), services hold business logic, repositories hold database queries. Pure, deterministic logic (scoring, detection, classification) lives in its own files (`detect/scoring.ts`, `detect/detection.compute.ts`, `understand/keyword-classifier.ts`) and is shared by the API and the seed.

## Endpoints

Full contract with examples: [`docs/api-contract.md`](../docs/api-contract.md).

| Method | Path                            | Purpose                                         |
| ------ | ------------------------------- | ----------------------------------------------- |
| GET    | `/api/v1/health`                | Liveness + database status                      |
| GET    | `/api/v1/risk`                  | Priority queue (filters, paging)                |
| GET    | `/api/v1/risk/summary`          | Detect KPIs and risk distribution               |
| GET    | `/api/v1/risk/:customerId`      | One queue row                                   |
| GET    | `/api/v1/customers`             | Customer list                                   |
| GET    | `/api/v1/customers/:id`         | Customer 360 (usage, priority, monthly metrics) |
| GET    | `/api/v1/segments`              | Priority bands + breakdown by customer segment  |
| GET    | `/api/v1/segments/:band`        | Queue rows for one band                         |
| GET    | `/api/v1/detection-runs/latest` | Latest detection run                            |
| POST   | `/api/v1/detection-runs`        | Re-run detection from stored behaviour          |

## Conventions

- Responses: `{ "data": ... }` on success, `{ "error": { "code", "message", "details?" } }` on failure.
- Throw `HttpError` (or the `badRequest` / `notFound` / `conflict` helpers); the error handler formats it. Zod validation errors become `400 VALIDATION_ERROR` automatically.
- Work on `main`; Conventional Commits (`feat(detect): ...`, `docs(api): ...`).
