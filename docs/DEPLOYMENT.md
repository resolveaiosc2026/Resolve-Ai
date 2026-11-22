# Deployment Runbook (Railway + Neon)

Production API: `https://resolve-ai-production-8093.up.railway.app` Â· Frontend: `https://resolve-ai-omega.vercel.app`

## 1. Railway service settings

| Setting                | Value                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root directory         | `backend`                                                                                                        |
| Build command          | `npm ci && npm run build` (Railway's default `npm run build` also works)                                         |
| **Pre-deploy command** | `npm run db:migrate:deploy` (applies pending migrations; uses Drizzle's runtime migrator, no drizzle-kit needed) |
| Start command          | `npm start`                                                                                                      |
| **Healthcheck path**   | `/api/v1/health` (returns 503 when the database is unreachable)                                                  |
| Instances              | 1. Rate limits use an in-memory store; with more instances, each keeps its own counters                          |

## 2. Environment variables (Railway â†’ Variables)

| Variable                | Production value                                               | Notes                                                                                                  |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`              | `production`                                                   | Hides internal error messages                                                                          |
| `DATABASE_URL`          | Neon **production branch** pooled URL, `â€¦?sslmode=verify-full` | See Â§3. Secret                                                                                         |
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

1. Neon console â†’ your project â†’ **Branches** â†’ **Create branch**: name `production`, parent `main` (it copies the current data instantly).
2. Open the `production` branch â†’ **Connect** â†’ choose **Pooled connection** â†’ copy the URL. Make sure it ends with `sslmode=verify-full`.
3. Railway â†’ Variables â†’ set `DATABASE_URL` to that URL â†’ **Deploy**.
4. Check `GET https://resolve-ai-production-8093.up.railway.app/api/v1/health` â†’ `database.status: "up"`.

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
3. Postman â†’ environment **Resolve AI â€” Railway** â†’ run **"0. Demo journey"** on a freshly seeded production branch.

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
| Server exits: `DATABASE_URL â€¦ placeholder`        | The variable still holds the `.env.example` value                                     |
| Browser: "blocked by CORS policy"                 | Add the exact origin (scheme + host, no path) to `CORS_ORIGIN`, then redeploy         |
| `429 RATE_LIMITED`                                | Too many requests from one IP; wait for the `reset` seconds in the `RateLimit` header |
| `/simulation/*` returns 404                       | `ENABLE_SIMULATION` isn't `true`                                                      |
| `Connection terminated due to connection timeout` | Neon waking up or a network blip; retry. The seed rolls back cleanly                  |
| Copilot/replies use `keyword_fallback`            | `OPENROUTER_API_KEY` missing or OpenRouter unreachable (by design, nothing breaks)    |

## 8. Frontend on Vercel: workbench sign-in (Auth.js + Google OAuth)

The workbench pages (/detect … /copilot) require Google sign-in; / and /signin are public. The app does not keep a user table. Sessions are encrypted JWT cookies with a 30-day lifetime. The application session keeps only the Google display name for the shell; API writes still use the shared reviewer analyst.hui. The backend does **not** check frontend sessions, so anyone can still call the API directly.

The app has no application-level Google email allow-list. Google Cloud's project audience and publishing status control who can complete sign-in.

### Google Cloud setup

Use separate Google Cloud projects for development/testing and production. In the development/testing project, create an OAuth client of type Web application and configure:

- Authorized JavaScript origin: http://localhost:3000
- Authorized redirect URI: http://localhost:3000/api/auth/callback/google

For local testing, add the Google accounts that need access to the project's test users. Google may show the unverified-app warning; testing-mode authorizations expire after seven days and the test-user list is limited to 100 accounts. See [Google's testing status guidance](https://support.google.com/cloud/answer/15549945?hl=en-KI).

Before making production sign-in available to arbitrary Google accounts, Google requires verified app branding and ownership of domains associated with the OAuth client. Production also requires a public home page and a privacy policy on the same owned domain. The current resolve-ai-omega.vercel.app hostname has not been documented as owned or verified, and this repository does not contain a privacy policy. Do not describe the production Google client as ready until those prerequisites are met. Review [Google's production requirements](https://developers.google.com/identity/verification/authentication-policy-compliance).

After the team configures a domain it controls, use its HTTPS origin and callback URI, for example https://<your-domain>/api/auth/callback/google. Do not add local or preview deployment URLs to the production client. Use a separate testing project/client for local and preview builds.

### Environment variables (Vercel → Settings → Environment Variables, and frontend/.env.local)

| Variable | Notes |
| --- | --- |
| NEXT_PUBLIC_API_BASE_URL | Set Vercel Production to `https://resolve-ai-production-8093.up.railway.app/api/v1`. The local `.env.local` value should be `http://localhost:4000/api/v1`. Next.js embeds this public value at build time, so redeploy after changing it. Production builds also fall back to the Railway URL if this variable is missing or points to a loopback address. |
| AUTH_SECRET | Generate with npx auth secret or openssl rand -base64 33. Use a different value per environment. Secret. |
| AUTH_GOOGLE_ID | Google OAuth Web application client ID. Use the testing client locally and in Preview; production client in Production. |
| AUTH_GOOGLE_SECRET | Google OAuth Web application client secret. Server-only secret. |
| AUTH_TRUST_HOST | true only for npm start outside Vercel. Not needed on Vercel or with npm run dev. |

Set the testing client values for local development and Vercel Preview, then set the production client values only for Vercel Production after its domain and branding are ready. Set a separate AUTH_SECRET per environment and redeploy. Remove the obsolete AUTH_DEMO_USERNAME and AUTH_DEMO_PASSWORD variables.

For local development, copy .env.example to .env.local without overwriting existing values, then set AUTH_SECRET, AUTH_GOOGLE_ID, and AUTH_GOOGLE_SECRET for the testing client. Never commit .env.local.

### Check after deploy

1. In a private window, open the public homepage at the configured domain, then open /detect; a signed-out visitor should be redirected to /signin.
2. Click **Continue with Google**, finish the Google flow, and confirm the visitor returns to /detect with their initials in the topbar.
3. Open /api/auth/session; it should expose the app session with the display name and an empty email field, not Google tokens.
4. Sign out, then open /report; it should redirect to /signin again.
5. Open a workbench page and inspect DevTools → Network. API requests must use `resolve-ai-production-8093.up.railway.app`, never localhost.

| Symptom | Cause / fix |
| --- | --- |
| /signin shows the setup message and disables the button | One or more of AUTH_SECRET, AUTH_GOOGLE_ID, or AUTH_GOOGLE_SECRET is missing; set them in the server environment and redeploy. |
| Google returns redirect_uri_mismatch | Add the exact callback URI for that environment to its Google OAuth client. |
| Google says the app is not available to this account | In Testing status, add the account to the test-user list; for open production access, complete Google's production branding and domain requirements. |
| Production API requests target localhost | Set Vercel Production `NEXT_PUBLIC_API_BASE_URL` to `https://resolve-ai-production-8093.up.railway.app/api/v1` and redeploy. The production bundle has a loopback fallback, but Vercel should still have the correct value. |
| UntrustedHost when running npm start locally | Set AUTH_TRUST_HOST=true for that local process. Do not add it to Vercel unless Auth.js reports it is needed. |
