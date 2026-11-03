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
