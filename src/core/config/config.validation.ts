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

  STORAGE_ENDPOINT: z.url(),
  STORAGE_REGION: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: booleanEnv(true),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: booleanEnv(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.email(),

  APP_BASE_URL: z.url(),
  REGISTRATION_EMAIL_CONFIRMATION_ENABLED: booleanEnv(false),
  REGISTRATION_CONFIRMATION_METHOD: z
    .enum(['OTP', 'MAGIC_LINK'])
    .optional()
    .transform((value) => value ?? 'OTP'),
  LOGIN_EMAIL_CONFIRMATION_ENABLED: booleanEnv(false),
  LOGIN_CONFIRMATION_METHOD: z
    .enum(['OTP', 'MAGIC_LINK'])
    .optional()
    .transform((value) => value ?? 'OTP'),

  UPLOAD_MAX_BYTES: numberEnv(10 * 1024 * 1024),
  CONVERT_MAX_SIZE_CSV_BYTES: numberEnv(5 * 1024 * 1024),
  CONVERT_MAX_SIZE_JSON_BYTES: numberEnv(5 * 1024 * 1024),
  CONVERT_MAX_SIZE_XML_BYTES: numberEnv(5 * 1024 * 1024),
  CONVERT_MAX_SIZE_YAML_BYTES: numberEnv(5 * 1024 * 1024),
});

export function validateConfig(config: Record<string, unknown>) {
  return configSchema.parse(config);
}
