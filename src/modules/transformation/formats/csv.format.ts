import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import { FormatParser, FormatSerializer } from './format.types';

export class CsvParser implements FormatParser {
  parse(input: Buffer): unknown {
    try {
      return parse(input, { columns: true, skip_empty_lines: true, bom: true });
    } catch {
      throw new BadRequestException('Invalid CSV syntax');
    }
  }
}

export class CsvSerializer implements FormatSerializer {
  serialize(data: unknown): Buffer {
    const rows = toFlatObjectArray(data);

    try {
      const csv = stringify(rows, { header: true });
      return Buffer.from(csv, 'utf-8');
    } catch {
      throw new BadRequestException('Cannot serialize this data to CSV');
    }
  }
}

function toFlatObjectArray(data: unknown): Record<string, unknown>[] {
  let candidate = data;

  if (!Array.isArray(candidate) && isPlainObject(candidate)) {
    const values = Object.values(candidate);
    if (values.length === 1 && Array.isArray(values[0])) {
      candidate = values[0];
    }
  }

  if (!Array.isArray(candidate)) {
    throw new BadRequestException(
      'CSV output requires an array of flat objects',
    );
  }

  for (const row of candidate) {
    if (!isPlainObject(row)) {
      throw new BadRequestException(
        'CSV output requires an array of flat objects',
      );
    }
    for (const value of Object.values(row)) {
      if (value !== null && typeof value === 'object') {
        throw new BadRequestException(
          'CSV output requires an array of flat objects (no nested values)',
        );
      }
    }
  }

  return candidate as Record<string, unknown>[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
