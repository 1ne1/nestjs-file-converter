import { z } from 'zod';

const booleanEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? defaultValue : value === 'true',
    );

const numberEnv = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : Number(value)));

export const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  NODE_ENV: z.enum(['development', 'production']),

  COOKIE_SECRET: z.string().min(1),

  HEALTH_CHECK_ENABLED: booleanEnv(false),

  THROTTLE_GLOBAL_TTL: numberEnv(10000),
  THROTTLE_GLOBAL_LIMIT: numberEnv(10),

  DATABASE_URL: z.url(),
});

export function validateConfig(config: Record<string, unknown>) {
  return configSchema.parse(config);
}
