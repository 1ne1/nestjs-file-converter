import { z } from 'zod';

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email(),
    status: z.enum(['ACTIVE', 'BLOCKED']),
  })
  .partial()
  .strict();

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
