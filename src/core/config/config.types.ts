import { z } from 'zod';

import { configSchema } from './config.validation';

export type Config = z.infer<typeof configSchema>;
