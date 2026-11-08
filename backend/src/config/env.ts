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
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
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

export const env = parsed.data;
export type Env = typeof env;
