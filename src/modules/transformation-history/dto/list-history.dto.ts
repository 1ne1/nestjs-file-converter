import { z } from 'zod';

export const listHistoryQuerySchema = z.object({
  userId: z.uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['file', 'image']).optional(),
  sourceFormat: z.string().optional(),
  targetFormat: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  createdAtFrom: z.iso.datetime().optional(),
  createdAtTo: z.iso.datetime().optional(),
});

export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
