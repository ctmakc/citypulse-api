import { z } from 'zod';

/**
 * CityPulse API — environment validation.
 *
 * Validates the process environment once, at application boot, via Nest's
 * `ConfigModule.forRoot({ validate })` hook. If a *required* variable is
 * missing or malformed we throw a single, human-readable error and the process
 * exits before it ever binds a port — fail fast instead of 500ing at runtime.
 *
 * Required:
 *   - DATABASE_URL  (Postgres connection string)
 *   - JWT_SECRET    (auth signing secret; must be non-trivial in production)
 *
 * Optional with sane defaults:
 *   - NODE_ENV      → "development"
 *   - PORT          → 3096
 *   - REDIS_HOST    → 127.0.0.1
 *   - REDIS_PORT    → 6387
 *   - CORS_ORIGIN   → http://localhost:3095
 */

// Coerce "3096" → 3096 and validate it's a sane TCP port.
const port = (fallback: number) =>
  z.coerce
    .number({ message: 'must be a number' })
    .int('must be an integer')
    .min(1, 'must be >= 1')
    .max(65535, 'must be <= 65535')
    .default(fallback);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // ---- Required ----
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (Postgres connection string)'),
  JWT_SECRET: z
    .string()
    .min(1, 'JWT_SECRET is required'),

  // ---- Optional / defaulted ----
  PORT: port(3096),
  REDIS_HOST: z.string().min(1).default('127.0.0.1'),
  REDIS_PORT: port(6387),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3095'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate fn wired into `ConfigModule.forRoot({ validate })`.
 *
 * Nest calls this with the raw `process.env` and uses the *returned* object as
 * the validated, typed config. We return the parsed value (with coercions +
 * defaults applied) so downstream `ConfigService.get()` reads are clean.
 *
 * On failure we assemble every issue into one message and throw, which aborts
 * boot with a clear, actionable error.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => {
        const path = i.path.join('.') || '(root)';
        return `  • ${path}: ${i.message}`;
      })
      .join('\n');

    // A single, loud, readable failure — printed before the process exits.
    throw new Error(
      `\n[CityPulse] Invalid environment configuration:\n${issues}\n\n` +
        `Set the required variables (DATABASE_URL, JWT_SECRET) and restart.\n`,
    );
  }

  // Extra guard: a placeholder/weak JWT secret in production is a security
  // footgun — refuse to boot rather than ship a guessable token signer.
  if (
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.JWT_SECRET.trim().length < 16
  ) {
    throw new Error(
      '\n[CityPulse] JWT_SECRET must be at least 16 characters in production.\n',
    );
  }

  return parsed.data;
}
