import { z } from 'zod';

export const targetFormatSchema = z.enum(['csv', 'json', 'xml', 'yaml']);
