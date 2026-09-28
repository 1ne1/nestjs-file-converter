import { BadRequestException } from '@nestjs/common';

import { FormatParser, FormatSerializer } from './format.types';

export class JsonParser implements FormatParser {
  parse(input: Buffer): unknown {
    try {
      return JSON.parse(input.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid JSON syntax');
    }
  }
}

export class JsonSerializer implements FormatSerializer {
  serialize(data: unknown): Buffer {
    return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  }
}
