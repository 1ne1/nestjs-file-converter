import { BadRequestException } from '@nestjs/common';

import { YamlParser, YamlSerializer } from './yaml.format';

describe('YamlParser', () => {
  const parser = new YamlParser();

  it('parses a mapping', () => {
    const input = Buffer.from('name: Alice\nage: 30\n');
    expect(parser.parse(input)).toEqual({ name: 'Alice', age: 30 });
  });

  it('parses a sequence', () => {
    const input = Buffer.from('- a\n- b\n- c\n');
    expect(parser.parse(input)).toEqual(['a', 'b', 'c']);
  });

  it('parses a scalar', () => {
    expect(parser.parse(Buffer.from('42'))).toBe(42);
    expect(parser.parse(Buffer.from('hello'))).toBe('hello');
  });

  it('throws BadRequestException for an unterminated flow sequence', () => {
    const input = Buffer.from('[1, 2,');
    expect(() => parser.parse(input)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for tab-based indentation', () => {
    const input = Buffer.from('a:\n\tb: 1\n');
    expect(() => parser.parse(input)).toThrow(BadRequestException);
  });

  it('uses the message "Invalid YAML syntax"', () => {
    try {
      parser.parse(Buffer.from('[1, 2,'));
      throw new Error('expected parse to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'Invalid YAML syntax',
      );
    }
  });
});

describe('YamlSerializer', () => {
  const serializer = new YamlSerializer();

  it('serializes a mapping', () => {
    const buffer = serializer.serialize({ name: 'Alice', age: 30 });
    expect(buffer.toString('utf-8')).toBe('name: Alice\nage: 30\n');
  });

  it('serializes a sequence', () => {
    const buffer = serializer.serialize(['a', 'b']);
    expect(buffer.toString('utf-8')).toBe('- a\n- b\n');
  });

  it('round-trips through the parser', () => {
    const parser = new YamlParser();
    const original = { a: 1, b: ['x', 'y'] };
    const buffer = serializer.serialize(original);
    expect(parser.parse(buffer)).toEqual(original);
  });

  it('throws BadRequestException when the value cannot be tagged', () => {
    expect(() => serializer.serialize({ fn: () => {} })).toThrow(
      BadRequestException,
    );
  });

  it('uses the message "Cannot serialize this data to YAML"', () => {
    try {
      serializer.serialize({ fn: () => {} });
      throw new Error('expected serialize to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'Cannot serialize this data to YAML',
      );
    }
  });
});
