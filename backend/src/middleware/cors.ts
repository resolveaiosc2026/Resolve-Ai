/** CORS allow-list from CORS_ORIGIN: exact origins, or one `*` wildcard per entry (preview URLs). */
import cors from 'cors';

import { env } from '../config/env.js';

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Exact strings, or regexes for entries with `*` (matches one DNS label part: letters, digits, hyphens). */
export function originMatchers(origins: string[]): (string | RegExp)[] {
  return origins.map((o) => {
    if (!o.includes('*')) return o;
    // One wildcard per entry: "https://app-*.vercel.app" → ^https://app-[a-z0-9-]+\.vercel\.app$
    const [head = '', ...rest] = o.split('*');
    return new RegExp(`^${escape(head)}[a-z0-9-]+${escape(rest.join(''))}$`, 'i');
  });
}

export function isAllowedOrigin(origin: string, matchers: (string | RegExp)[]): boolean {
  const clean = origin.replace(/\/+$/, '');
  return matchers.some((m) => (typeof m === 'string' ? m === clean : m.test(clean)));
}

const matchers = originMatchers(env.CORS_ORIGIN);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Same-origin / server-to-server requests have no Origin header: allowed (CORS is a browser rule).
    if (!origin) return callback(null, true);
    callback(null, isAllowedOrigin(origin, matchers));
  },
  exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
  maxAge: 600,
});
