import { BadRequestException } from '@nestjs/common';
import type { Multipart } from '@fastify/multipart';
import type { ZodType } from 'zod';

export function getMultipartFieldValue(
  field: Multipart | Multipart[] | undefined,
): unknown {
  const entry = Array.isArray(field) ? field[0] : field;
  if (!entry || entry.type !== 'field') {
    return undefined;
  }
  return entry.value;
}

export function parseRequiredMultipartField<T>(
  field: Multipart | Multipart[] | undefined,
  schema: ZodType<T>,
  message: string,
): T {
  const result = schema.safeParse(getMultipartFieldValue(field));
  if (!result.success) {
    throw new BadRequestException(message);
  }
  return result.data;
}

export function parseOptionalMultipartField<T>(
  field: Multipart | Multipart[] | undefined,
  schema: ZodType<T>,
  message: string,
): T | undefined {
  const value = getMultipartFieldValue(field);
  if (value === undefined || value === '') {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(message);
  }
  return result.data;
}

export function isFileTooLargeError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'FST_REQ_FILE_TOO_LARGE'
  );
}
