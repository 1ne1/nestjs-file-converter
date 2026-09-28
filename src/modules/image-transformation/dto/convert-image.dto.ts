import { z } from 'zod';

export const targetImageFormatSchema = z.enum(['png', 'jpeg', 'svg']);

export const qualitySchema = z.coerce.number().int().min(1).max(100);
export const dimensionSchema = z.coerce.number().int().positive();
export const backgroundSchema = z.string().min(1);
