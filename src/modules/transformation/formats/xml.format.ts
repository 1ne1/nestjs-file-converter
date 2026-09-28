import { BadRequestException } from '@nestjs/common';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { FormatParser, FormatSerializer } from './format.types';

const ATTRIBUTE_PREFIX = '@_';
const ROOT_TAG = 'root';
const ARRAY_ITEM_TAG = 'item';

export class XmlParser implements FormatParser {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    processEntities: false,
  });

  parse(input: Buffer): unknown {
    let parsed: unknown;
    try {
      parsed = this.parser.parse(input.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid XML syntax');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new BadRequestException('Invalid XML syntax');
    }

    const keys = Object.keys(parsed);
    if (keys.length !== 1) {
      throw new BadRequestException('XML must have exactly one root element');
    }

    return (parsed as Record<string, unknown>)[keys[0]];
  }
}

export class XmlSerializer implements FormatSerializer {
  private readonly builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: ATTRIBUTE_PREFIX,
  });

  serialize(data: unknown): Buffer {
    try {
      const wrapped = { [ROOT_TAG]: wrapForXml(data) };
      return Buffer.from(this.builder.build(wrapped), 'utf-8');
    } catch {
      throw new BadRequestException('Cannot serialize this data to XML');
    }
  }
}

function wrapForXml(data: unknown): unknown {
  if (Array.isArray(data)) {
    return { [ARRAY_ITEM_TAG]: data };
  }
  return data;
}
