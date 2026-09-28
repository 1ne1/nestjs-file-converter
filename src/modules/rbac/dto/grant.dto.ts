import { z } from 'zod';

export const createGrantSchema = z.object({
  roleId: z.uuid(),
  permissionId: z.uuid(),
  actions: z.array(z.string().min(1)).default([]),
});
export type CreateGrantDto = z.infer<typeof createGrantSchema>;

export const updateGrantSchema = z.object({
  actions: z.array(z.string().min(1)).default([]),
});
export type UpdateGrantDto = z.infer<typeof updateGrantSchema>;
