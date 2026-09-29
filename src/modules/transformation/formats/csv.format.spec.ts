import { BadRequestException } from '@nestjs/common';

import { CsvParser, CsvSerializer } from './csv.format';

describe('CsvParser', () => {
  const parser = new CsvParser();

  it('parses a CSV with a header row into an array of objects', () => {
    const input = Buffer.from('name,age\nAlice,30\nBob,25\n');
    expect(parser.parse(input)).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ]);
  });

  it('strips a UTF-8 BOM from the header', () => {
    const input = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('name,age\nAlice,30\n'),
    ]);
    expect(parser.parse(input)).toEqual([{ name: 'Alice', age: '30' }]);
  });

  it('skips empty lines', () => {
    const input = Buffer.from('name,age\nAlice,30\n\nBob,25\n');
    expect(parser.parse(input)).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ]);
  });

  it('throws BadRequestException for a mismatched column count', () => {
    const input = Buffer.from('a,b\n1,2,3\n');
    expect(() => parser.parse(input)).toThrow(BadRequestException);
  });

  it('uses the message "Invalid CSV syntax"', () => {
    const input = Buffer.from('a,b\n1,2,3\n');
    try {
      parser.parse(input);
      throw new Error('expected parse to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe('Invalid CSV syntax');
    }
  });
});

describe('CsvSerializer', () => {
  const serializer = new CsvSerializer();

  it('serializes an array of flat objects to CSV with a header', () => {
    const buffer = serializer.serialize([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    expect(buffer.toString('utf-8')).toBe('name,age\nAlice,30\nBob,25\n');
  });

  it('unwraps a single-key object whose value is an array', () => {
    const buffer = serializer.serialize({
      item: [{ name: 'Alice' }, { name: 'Bob' }],
    });
    expect(buffer.toString('utf-8')).toBe('name\nAlice\nBob\n');
  });

  it('throws when data is not an array and not a single-key array wrapper', () => {
    expect(() => serializer.serialize('a plain string')).toThrow(
      BadRequestException,
    );
    expect(() => serializer.serialize(42)).toThrow(BadRequestException);
    expect(() => serializer.serialize({ a: 1, b: 2 })).toThrow(
      BadRequestException,
    );
    expect(() => serializer.serialize({ item: 'not-an-array' })).toThrow(
      BadRequestException,
    );
  });

  it('throws when array elements are not plain objects', () => {
    expect(() => serializer.serialize(['a', 'b'])).toThrow(BadRequestException);
    expect(() => serializer.serialize([1, 2, 3])).toThrow(BadRequestException);
    expect(() => serializer.serialize([['nested', 'array']])).toThrow(
      BadRequestException,
    );
  });

  it('throws when a row contains a nested object value', () => {
    expect(() =>
      serializer.serialize([{ name: 'Alice', address: { city: 'NYC' } }]),
    ).toThrow(BadRequestException);
  });

  it('throws when a row contains an array value', () => {
    expect(() =>
      serializer.serialize([{ name: 'Alice', tags: ['a', 'b'] }]),
    ).toThrow(BadRequestException);
  });

  it('allows null values in a row', () => {
    const buffer = serializer.serialize([{ name: 'Alice', nickname: null }]);
    expect(buffer.toString('utf-8')).toContain('name,nickname');
  });

  it('throws with the specific nested-values message', () => {
    try {
      serializer.serialize([{ a: { b: 1 } }]);
      throw new Error('expected serialize to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'CSV output requires an array of flat objects (no nested values)',
      );
    }
  });

  it('throws with the general shape message for a non-array root', () => {
    try {
      serializer.serialize('nope');
      throw new Error('expected serialize to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'CSV output requires an array of flat objects',
      );
    }
  });
});
