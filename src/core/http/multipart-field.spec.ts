import { BadRequestException } from '@nestjs/common';
import type { Multipart } from '@fastify/multipart';
import { z } from 'zod';

import {
  getMultipartFieldValue,
  isFileTooLargeError,
  parseOptionalMultipartField,
  parseRequiredMultipartField,
} from './multipart-field';

function fieldEntry(value: unknown): Multipart {
  return {
    type: 'field',
    value,
    fieldname: 'test',
    mimetype: 'text/plain',
    encoding: '7bit',
    fieldnameTruncated: false,
    valueTruncated: false,
    fields: {},
  } as unknown as Multipart;
}

function fileEntry(): Multipart {
  return {
    type: 'file',
    fieldname: 'file',
    filename: 'test.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    fields: {},
  } as unknown as Multipart;
}

describe('getMultipartFieldValue', () => {
  it('returns undefined when field is undefined', () => {
    expect(getMultipartFieldValue(undefined)).toBeUndefined();
  });

  it('returns the value for a field-type entry', () => {
    expect(getMultipartFieldValue(fieldEntry('hello'))).toBe('hello');
  });

  it('takes the first entry when field is an array', () => {
    expect(
      getMultipartFieldValue([fieldEntry('first'), fieldEntry('second')]),
    ).toBe('first');
  });

  it('returns undefined for a file-type entry', () => {
    expect(getMultipartFieldValue(fileEntry())).toBeUndefined();
  });
});

describe('parseRequiredMultipartField', () => {
  const schema = z.enum(['csv', 'json']);

  it('returns the parsed value when valid', () => {
    expect(parseRequiredMultipartField(fieldEntry('csv'), schema, 'bad')).toBe(
      'csv',
    );
  });

  it('throws BadRequestException with the given message when missing', () => {
    expect(() =>
      parseRequiredMultipartField(
        undefined,
        schema,
        'targetFormat is required',
      ),
    ).toThrow(BadRequestException);
    try {
      parseRequiredMultipartField(
        undefined,
        schema,
        'targetFormat is required',
      );
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'targetFormat is required',
      );
    }
  });

  it('throws BadRequestException when the value fails schema validation', () => {
    expect(() =>
      parseRequiredMultipartField(fieldEntry('xml'), schema, 'bad format'),
    ).toThrow(BadRequestException);
  });
});

describe('parseOptionalMultipartField', () => {
  const schema = z.coerce.number().int().min(1).max(100);

  it('returns undefined when the field is missing', () => {
    expect(
      parseOptionalMultipartField(undefined, schema, 'bad'),
    ).toBeUndefined();
  });

  it('returns undefined when the value is an empty string', () => {
    expect(
      parseOptionalMultipartField(fieldEntry(''), schema, 'bad'),
    ).toBeUndefined();
  });

  it('returns the parsed value when valid', () => {
    expect(parseOptionalMultipartField(fieldEntry('80'), schema, 'bad')).toBe(
      80,
    );
  });

  it('throws BadRequestException when the value fails schema validation', () => {
    expect(() =>
      parseOptionalMultipartField(fieldEntry('200'), schema, 'out of range'),
    ).toThrow(BadRequestException);
  });
});

describe('isFileTooLargeError', () => {
  it('returns true for an error with the FST_REQ_FILE_TOO_LARGE code', () => {
    expect(isFileTooLargeError({ code: 'FST_REQ_FILE_TOO_LARGE' })).toBe(true);
  });

  it('returns false for an error with a different code', () => {
    expect(isFileTooLargeError({ code: 'SOME_OTHER_ERROR' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isFileTooLargeError(null)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isFileTooLargeError('a string error')).toBe(false);
    expect(isFileTooLargeError(42)).toBe(false);
    expect(isFileTooLargeError(undefined)).toBe(false);
  });

  it('returns false for an object without a code property', () => {
    expect(isFileTooLargeError({ message: 'oops' })).toBe(false);
  });
});
