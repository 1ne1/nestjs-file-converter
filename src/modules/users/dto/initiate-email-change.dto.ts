import { z } from 'zod';

export const initiateEmailChangeSchema = z.object({
  newEmail: z.email(),
});

export type InitiateEmailChangeDto = z.infer<typeof initiateEmailChangeSchema>;
