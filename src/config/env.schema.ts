import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 * The app refuses to boot with a clear message if anything is missing or malformed,
 * so misconfiguration fails fast instead of surfacing as a runtime error later.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** PostgreSQL connection string, e.g. postgresql://user:pass@localhost:5433/twentyfive */
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),

  /** Comma-separated list of browser origins allowed to call the API (the web app). */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),

  /** Where the web app lives: sign-in redirects back here. */
  WEB_APP_URL: z.url().default('http://localhost:5173'),
  /** Public base URL of this API, used to build OAuth redirect URIs (…/api/v1/auth/<provider>/callback). */
  API_PUBLIC_URL: z.url().default('http://localhost:3000'),

  /** Signs access tokens (HS256). At least 32 characters; generate with `openssl rand -base64 48`. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Optional cookie domain, e.g. ".twentyfive.lk" so api. and www. share the session. */
  COOKIE_DOMAIN: z.string().optional(),

  /** OAuth apps. A provider is enabled only when both its id and secret are set. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),

  /**
   * Object storage for photos (AWS S3, or MinIO locally). Uploads are disabled unless
   * S3_BUCKET and both keys are set. S3_ENDPOINT is only needed for non-AWS (MinIO).
   */
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Base URL photos are served from (CDN or public bucket), e.g. https://cdn.twentyfive.lk */
  S3_PUBLIC_URL: z.url().optional(),

  /** Requests allowed per client per window (see ThrottlerModule). */
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: returns parsed env or throws one readable error listing every problem. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
