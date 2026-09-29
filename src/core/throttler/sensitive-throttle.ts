export const SENSITIVE_THROTTLE = {
  default: {
    limit: Number(process.env.SENSITIVE_THROTTLE_LIMIT ?? 5),
    ttl: Number(process.env.SENSITIVE_THROTTLE_TTL_MS ?? 60_000),
  },
};
