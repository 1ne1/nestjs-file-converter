import { BadRequestException } from '@nestjs/common';

import { JsonParser, JsonSerializer } from './json.format';

describe('JsonParser', () => {
  const parser = new JsonParser();

  it('parses a valid JSON object', () => {
    const input = Buffer.from('{"name":"Alice","age":30}');
    expect(parser.parse(input)).toEqual({ name: 'Alice', age: 30 });
  });

  it('parses a valid JSON array', () => {
    const input = Buffer.from('[1,2,3]');
    expect(parser.parse(input)).toEqual([1, 2, 3]);
  });

  it('parses a JSON primitive', () => {
    expect(parser.parse(Buffer.from('null'))).toBeNull();
    expect(parser.parse(Buffer.from('"hello"'))).toBe('hello');
    expect(parser.parse(Buffer.from('42'))).toBe(42);
  });

  it('throws BadRequestException for malformed JSON', () => {
    const input = Buffer.from('{bad json');
    expect(() => parser.parse(input)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for an empty buffer', () => {
    expect(() => parser.parse(Buffer.from(''))).toThrow(BadRequestException);
  });

  it('uses the message "Invalid JSON syntax"', () => {
    try {
      parser.parse(Buffer.from('{bad'));
      throw new Error('expected parse to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'Invalid JSON syntax',
      );
    }
  });
});

describe('JsonSerializer', () => {
  const serializer = new JsonSerializer();

  it('serializes an object as pretty-printed JSON', () => {
    const buffer = serializer.serialize({ name: 'Alice' });
    expect(buffer.toString('utf-8')).toBe('{\n  "name": "Alice"\n}');
  });

  it('serializes an array', () => {
    const buffer = serializer.serialize([1, 2, 3]);
    expect(JSON.parse(buffer.toString('utf-8'))).toEqual([1, 2, 3]);
  });

  it('serializes null', () => {
    const buffer = serializer.serialize(null);
    expect(buffer.toString('utf-8')).toBe('null');
  });

  it('serializes a string primitive', () => {
    const buffer = serializer.serialize('hello');
    expect(buffer.toString('utf-8')).toBe('"hello"');
  });

  it('round-trips through the parser', () => {
    const parser = new JsonParser();
    const original = { a: 1, b: ['x', 'y'], c: null };
    const buffer = serializer.serialize(original);
    expect(parser.parse(buffer)).toEqual(original);
  });
});
