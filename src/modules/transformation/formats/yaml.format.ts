import { BadRequestException } from '@nestjs/common';
import { parse, stringify } from 'yaml';

import { FormatParser, FormatSerializer } from './format.types';

export class YamlParser implements FormatParser {
  parse(input: Buffer): unknown {
    try {
      return parse(input.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid YAML syntax');
    }
  }
}

export class YamlSerializer implements FormatSerializer {
  serialize(data: unknown): Buffer {
    try {
      return Buffer.from(stringify(data), 'utf-8');
    } catch {
      throw new BadRequestException('Cannot serialize this data to YAML');
    }
  }
}
