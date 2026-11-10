# Deployment Runbook (Railway + Neon)

Production API: `https://resolve-ai-production-8093.up.railway.app` · Frontend: `https://resolve-ai-omega.vercel.app`

## 1. Railway service settings

| Setting                | Value                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root directory         | `backend`                                                                                                        |
| Build command          | `npm ci && npm run build` (Railway's default `npm run build` also works)                                         |
| **Pre-deploy command** | `npm run db:migrate:deploy` (applies pending migrations; uses Drizzle's runtime migrator, no drizzle-kit needed) |
| Start command          | `npm start`                                                                                                      |
| **Healthcheck path**   | `/api/v1/health` (returns 503 when the database is unreachable)                                                  |
| Instances              | 1. Rate limits use an in-memory store; with more instances, each keeps its own counters                          |

## 2. Environment variables (Railway → Variables)

| Variable                | Production value                                               | Notes                                                                                                  |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`              | `production`                                                   | Hides internal error messages                                                                          |
| `DATABASE_URL`          | Neon **production branch** pooled URL, `…?sslmode=verify-full` | See §3. Secret                                                                                         |
| `CORS_ORIGIN`           | `https://resolve-ai-omega.vercel.app,http://localhost:3000`    | Comma-separated; trailing slashes ignored. Optional preview pattern: `https://resolve-ai-*.vercel.app` |
| `ENABLE_SIMULATION`     | `true` for the hosted demo                                     | Mounts `/simulation/*` (demo-only routes). Omit or set `false` for a "real" deployment                 |
| `OPENROUTER_API_KEY`    | your key                                                       | Optional; without it, keyword fallback. Secret                                                         |
| `OPENROUTER_MODEL`      | `openai/gpt-4o-mini`                                           |                                                                                                        |
| `OPENROUTER_TIMEOUT_MS` | `8000`                                                         |                                                                                                        |
| `RATE_LIMIT_ENABLED`    | `true`                                                         | `false` only for load tests                                                                            |
| `LOG_LEVEL`             | `info`                                                         |                                                                                                        |
| `PORT`                  | _(Railway sets it)_                                            |                                                                                                        |

## 3. Separate production database (Neon branch)

Railway and your laptop must not share a database, otherwise `npm run db:seed` locally wipes the hosted demo.

1. Neon console → your project → **Branches** → **Create branch**: name `production`, parent `main` (it copies the current data instantly).
2. Open the `production` branch → **Connect** → choose **Pooled connection** → copy the URL. Make sure it ends with `sslmode=verify-full`.
3. Railway → Variables → set `DATABASE_URL` to that URL → **Deploy**.
4. Check `GET https://resolve-ai-production-8093.up.railway.app/api/v1/health` → `database.status: "up"`.

Your local `backend/.env` keeps the `main` branch URL.

## 4. Re-seeding the hosted demo data

Before a demo, or after testing writes on production:

```powershell
cd C:\Users\USER\Desktop\Resolve-Ai\backend
$env:DATABASE_URL = "<production branch pooled URL>"   # this terminal only
npm run db:seed
npm run db:verify
Remove-Item Env:DATABASE_URL                           # back to backend/.env
```

The seed refuses to run when `NODE_ENV=production`. Running it from your laptop is fine because your `NODE_ENV` stays `development`.

## 5. After each deploy

1. `GET /api/v1/health`: `ok`, `database: up`, `simulation` as expected.
2. `GET /api/v1/docs`: the interactive reference loads.
3. Postman → environment **Resolve AI — Railway** → run **"0. Demo journey"** on a freshly seeded production branch.

## 6. Updating the docs

After changing endpoints or schemas:

```powershell
cd backend
npm run db:seed        # canonical examples
npm run docs:build     # writes backend/openapi.json, docs/openapi.json, docs/postman/*
npx @redocly/cli lint ../docs/openapi.json
```

Commit the generated files with the code change.

## 7. Troubleshooting

| Symptom                                           | Cause / fix                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Server exits: `DATABASE_URL … placeholder`        | The variable still holds the `.env.example` value                                     |
| Browser: "blocked by CORS policy"                 | Add the exact origin (scheme + host, no path) to `CORS_ORIGIN`, then redeploy         |
| `429 RATE_LIMITED`                                | Too many requests from one IP; wait for the `reset` seconds in the `RateLimit` header |
| `/simulation/*` returns 404                       | `ENABLE_SIMULATION` isn't `true`                                                      |
| `Connection terminated due to connection timeout` | Neon waking up or a network blip; retry. The seed rolls back cleanly                  |
| Copilot/replies use `keyword_fallback`            | `OPENROUTER_API_KEY` missing or OpenRouter unreachable (by design, nothing breaks)    |
