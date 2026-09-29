import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.string().min(1),
    age: z.number().int().min(0),
  });

  it('returns the parsed data when validation succeeds', () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform({ email: 'a@b.com', age: 30 });
    expect(result).toEqual({ email: 'a@b.com', age: 30 });
  });

  it('throws BadRequestException when validation fails', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ email: '', age: -1 })).toThrow(
      BadRequestException,
    );
  });

  it('maps each issue to a path/message pair in the exception response', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ email: '', age: -1 });
      throw new Error('expected transform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: { path: string; message: string }[];
      };
      expect(Array.isArray(response.message)).toBe(true);
      const issues = response.message;
      expect(issues.some((issue) => issue.path === 'email')).toBe(true);
      expect(issues.some((issue) => issue.path === 'age')).toBe(true);
      for (const issue of issues) {
        expect(typeof issue.message).toBe('string');
        expect(issue.message.length).toBeGreaterThan(0);
      }
    }
  });

  it('joins nested paths with a dot', () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string().min(1),
      }),
    });
    const pipe = new ZodValidationPipe(nestedSchema);

    try {
      pipe.transform({ user: { name: '' } });
      throw new Error('expected transform to throw');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        message: { path: string; message: string }[];
      };
      expect(response.message[0].path).toBe('user.name');
    }
  });

  it('rejects unknown top-level input shapes', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform('not-an-object')).toThrow(BadRequestException);
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
