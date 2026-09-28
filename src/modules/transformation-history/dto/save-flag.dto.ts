import { z } from 'zod';

export const saveFlagSchema = z
  .union([z.literal('true'), z.literal('false')])
  .transform((value) => value === 'true');
