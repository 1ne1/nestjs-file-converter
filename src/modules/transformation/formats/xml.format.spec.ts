import { BadRequestException } from '@nestjs/common';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { XmlParser, XmlSerializer } from './xml.format';

describe('XmlParser', () => {
  const parser = new XmlParser();

  it('unwraps the single root element', () => {
    const input = Buffer.from('<root><name>Alice</name></root>');
    expect(parser.parse(input)).toEqual({ name: 'Alice' });
  });

  it('exposes attributes with the @_ prefix convention', () => {
    const input = Buffer.from('<root id="5"><name>Alice</name></root>');
    expect(parser.parse(input)).toEqual({ name: 'Alice', '@_id': '5' });
  });

  it('turns repeated sibling tags into an array', () => {
    const input = Buffer.from('<root><item>a</item><item>b</item></root>');
    expect(parser.parse(input)).toEqual({ item: ['a', 'b'] });
  });

  it('keeps a single occurrence of a repeatable tag as a scalar, not a 1-element array', () => {
    const input = Buffer.from('<root><item>a</item></root>');
    expect(parser.parse(input)).toEqual({ item: 'a' });
  });

  it('throws when there is more than one root-level element', () => {
    const input = Buffer.from('<a>1</a><b>2</b>');
    expect(() => parser.parse(input)).toThrow(BadRequestException);
  });

  it('throws when there are zero root-level elements', () => {
    const input = Buffer.from('');
    expect(() => parser.parse(input)).toThrow(BadRequestException);
  });

  it('uses the message "XML must have exactly one root element" for the multi-root case', () => {
    try {
      parser.parse(Buffer.from('<a>1</a><b>2</b>'));
      throw new Error('expected parse to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'XML must have exactly one root element',
      );
    }
  });

  it('throws "Invalid XML syntax" when the underlying parser throws', () => {
    const spy = jest
      .spyOn(XMLParser.prototype, 'parse')
      .mockImplementation(() => {
        throw new Error('boom');
      });
    try {
      expect(() => parser.parse(Buffer.from('<a/>'))).toThrow(
        BadRequestException,
      );
      try {
        parser.parse(Buffer.from('<a/>'));
      } catch (error) {
        expect((error as BadRequestException).message).toBe(
          'Invalid XML syntax',
        );
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('throws "Invalid XML syntax" when the parsed result is an array', () => {
    const spy = jest
      .spyOn(XMLParser.prototype, 'parse')
      .mockReturnValue(['unexpected']);
    try {
      expect(() => parser.parse(Buffer.from('<a/>'))).toThrow(
        BadRequestException,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('throws "Invalid XML syntax" when the parsed result is a primitive', () => {
    const spy = jest
      .spyOn(XMLParser.prototype, 'parse')
      .mockReturnValue('a string, not an object');
    try {
      expect(() => parser.parse(Buffer.from('<a/>'))).toThrow(
        BadRequestException,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('throws "Invalid XML syntax" when the parsed result is null', () => {
    const spy = jest.spyOn(XMLParser.prototype, 'parse').mockReturnValue(null);
    try {
      expect(() => parser.parse(Buffer.from('<a/>'))).toThrow(
        BadRequestException,
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('XmlSerializer', () => {
  const serializer = new XmlSerializer();

  it('wraps a plain object under a literal <root> tag', () => {
    const buffer = serializer.serialize({ name: 'Alice' });
    expect(buffer.toString('utf-8')).toBe('<root><name>Alice</name></root>');
  });

  it('wraps an array as repeated <item> tags under <root>', () => {
    const buffer = serializer.serialize([{ name: 'Alice' }, { name: 'Bob' }]);
    expect(buffer.toString('utf-8')).toBe(
      '<root><item><name>Alice</name></item><item><name>Bob</name></item></root>',
    );
  });

  it('wraps a primitive value as root text content', () => {
    const buffer = serializer.serialize('hello');
    expect(buffer.toString('utf-8')).toBe('<root>hello</root>');
  });

  it('throws BadRequestException when the builder cannot serialize the data', () => {
    const spy = jest
      .spyOn(XMLBuilder.prototype, 'build')
      .mockImplementation(() => {
        throw new Error('boom');
      });
    try {
      expect(() => serializer.serialize({ a: 1 })).toThrow(BadRequestException);
    } finally {
      spy.mockRestore();
    }
  });

  it('uses the message "Cannot serialize this data to XML"', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    try {
      serializer.serialize(circular);
      throw new Error('expected serialize to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toBe(
        'Cannot serialize this data to XML',
      );
    }
  });
});
