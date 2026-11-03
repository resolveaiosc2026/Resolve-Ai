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
cp .env.example .env   # then set DATABASE_URL to your Neon pooled connection string
npm run db:migrate     # creates the tables in Neon
npm run dev
```

The API listens on `http://localhost:4000/api/v1`. Check it with:

```bash
curl http://localhost:4000/api/v1/health
```

`database.status` should be `"up"`. If the database is unreachable the endpoint returns `503` with `"status": "degraded"`.

## Database

PostgreSQL on Neon, accessed through [Drizzle ORM](https://orm.drizzle.team). The schema lives in `src/db/schema/` (one file per loop area); SQL migrations generated from it live in `drizzle/` and are committed.

To change the schema: edit `src/db/schema/*`, run `npm run db:generate`, review the new SQL in `drizzle/`, then `npm run db:migrate`. Never edit an applied migration; generate a new one.

## Scripts

| Script                            | What it does                                 |
| --------------------------------- | -------------------------------------------- |
| `npm run dev`                     | Start the API with auto-reload (tsx)         |
| `npm run build`                   | Compile TypeScript to `dist/`                |
| `npm start`                       | Run the compiled API from `dist/`            |
| `npm run typecheck`               | Type-check without emitting                  |
| `npm run lint`                    | ESLint                                       |
| `npm run format` / `format:check` | Prettier write / check                       |
| `npm run db:generate`             | Generate a SQL migration from schema changes |
| `npm run db:migrate`              | Apply pending migrations to the database     |
| `npm run db:studio`               | Browse the database in Drizzle Studio        |

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
  db/client.ts      # Postgres pool + Drizzle instance + health check
  db/schema/        # tables by loop area: catalog, customers, detect, understand, act
  lib/              # logger, HttpError helpers
  middleware/       # request logger, 404, error handler
  modules/<feature>/<feature>.routes.ts | .service.ts | .repository.ts
```

Routes stay thin (HTTP only), services hold business logic, repositories hold database queries.

## Conventions

- Responses: `{ "data": ... }` on success, `{ "error": { "code", "message", "details?" } }` on failure.
- Throw `HttpError` (or the `badRequest` / `notFound` / `conflict` helpers); the error handler formats it. Zod validation errors become `400 VALIDATION_ERROR` automatically.
- Branches `feat/backend-<feature>`, Conventional Commits (`feat(detect): ...`, `docs(api): ...`).
