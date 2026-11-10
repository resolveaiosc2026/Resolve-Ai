/** Serves the OpenAPI document and an interactive reference (Redoc, pinned, from jsDelivr). */
import { readFileSync } from 'node:fs';

import { Router } from 'express';

import { buildOpenApi } from './openapi.js';

export const REDOC_VERSION = '2.5.0';
const REDOC_SRC = `https://cdn.jsdelivr.net/npm/redoc@${REDOC_VERSION}/bundles/redoc.standalone.js`;

/** backend/openapi.json is produced by `npm run docs:build` (with real examples). */
const GENERATED = new URL('../../openapi.json', import.meta.url);

let cached: unknown;
function spec(): unknown {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(GENERATED, 'utf8')) as unknown;
  } catch {
    // Not generated yet: build it on the fly (same structure, without examples).
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      version: string;
    };
    cached = buildOpenApi({ version: pkg.version });
  }
  return cached;
}

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resolve AI API</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <redoc spec-url="./openapi.json" hide-download-button="false"></redoc>
    <script src="${REDOC_SRC}"></script>
  </body>
</html>`;

/** CSP for the docs page only: the pinned Redoc script, its inline styles, web workers and fonts. */
const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const docsRouter = Router();

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(spec());
});

docsRouter.get('/docs', (_req, res) => {
  res.setHeader('Content-Security-Policy', DOCS_CSP);
  res.type('html').send(PAGE);
});
