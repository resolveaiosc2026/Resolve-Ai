import { z } from 'zod';

try {
  // Loads backend/.env when present; real environment variables take precedence.
  process.loadEnvFile();
} catch {
  // No .env file (e.g. in deployment): rely on the real environment.
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /**
   * Comma-separated browser origins. Trailing slashes are ignored (browsers send origins
   * without one). An entry may contain one `*` for preview URLs, e.g. https://app-*.vercel.app.
   */
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z
    .string({ error: 'is required (Neon pooled connection string)' })
    .regex(/^postgres(ql)?:\/\//, 'must start with postgres:// or postgresql://')
    .refine(
      (url) => !url.includes('ep-example-pooler'),
      'is still the placeholder from .env.example; paste your Neon pooled connection string',
    ),
  /** Optional: without a key, reply classification uses the keyword fallback. */
  OPENROUTER_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  OPENROUTER_MODEL: z.string().trim().min(1).default('openai/gpt-4o-mini'),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  /** Demo-only simulation routes. Default: on outside production, off in production. */
  ENABLE_SIMULATION: z.enum(['true', 'false']).optional(),
  /** Per-IP rate limits (on by default; set false to disable, e.g. for load tests). */
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(
    `Invalid environment configuration:\n${problems}\nSee backend/.env.example for the expected variables.`,
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  ENABLE_SIMULATION: parsed.data.ENABLE_SIMULATION
    ? parsed.data.ENABLE_SIMULATION === 'true'
    : parsed.data.NODE_ENV !== 'production',
};
export type Env = typeof env;
