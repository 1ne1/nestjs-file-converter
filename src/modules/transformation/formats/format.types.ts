import { UnsupportedMediaTypeException } from '@nestjs/common';

export type FileFormat = 'csv' | 'json' | 'xml' | 'yaml';

export const FILE_FORMATS: FileFormat[] = ['csv', 'json', 'xml', 'yaml'];

export interface FormatParser {
  parse(input: Buffer): unknown;
}

export interface FormatSerializer {
  serialize(data: unknown): Buffer;
}

export const CONTENT_TYPES: Record<FileFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
};

export const EXTENSIONS: Record<FileFormat, string> = {
  csv: 'csv',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
};

export function detectFormatFromFilename(filename: string): FileFormat {
  const ext = filename.split('.').pop()?.toLowerCase();

  const match = FILE_FORMATS.find(
    (format) =>
      EXTENSIONS[format] === ext || (format === 'yaml' && ext === 'yml'),
  );

  if (!match) {
    throw new UnsupportedMediaTypeException(
      `Unsupported file extension: .${ext ?? ''}`,
    );
  }

  return match;
}
