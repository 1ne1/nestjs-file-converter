import { z } from 'zod';

export const createPermissionSchema = z.object({
  name: z.string().min(1).max(100),
  actions: z.array(z.string().min(1)).default([]),
  description: z.string().max(500).optional(),
});
export type CreatePermissionDto = z.infer<typeof createPermissionSchema>;

export const updatePermissionSchema = createPermissionSchema.partial();
export type UpdatePermissionDto = z.infer<typeof updatePermissionSchema>;
