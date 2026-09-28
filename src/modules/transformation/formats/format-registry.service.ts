import { Injectable } from '@nestjs/common';

import { CsvParser, CsvSerializer } from './csv.format';
import {
  FileFormat,
  FILE_FORMATS,
  FormatParser,
  FormatSerializer,
} from './format.types';
import { JsonParser, JsonSerializer } from './json.format';
import { XmlParser, XmlSerializer } from './xml.format';
import { YamlParser, YamlSerializer } from './yaml.format';

export interface FormatDirections {
  source: FileFormat;
  target: FileFormat[];
}

@Injectable()
export class FormatRegistryService {
  private readonly parsers: Record<FileFormat, FormatParser> = {
    csv: new CsvParser(),
    json: new JsonParser(),
    xml: new XmlParser(),
    yaml: new YamlParser(),
  };

  private readonly serializers: Record<FileFormat, FormatSerializer> = {
    csv: new CsvSerializer(),
    json: new JsonSerializer(),
    xml: new XmlSerializer(),
    yaml: new YamlSerializer(),
  };

  convert(
    sourceFormat: FileFormat,
    targetFormat: FileFormat,
    input: Buffer,
  ): Buffer {
    const data = this.parsers[sourceFormat].parse(input);
    return this.serializers[targetFormat].serialize(data);
  }

  listFormats(): FormatDirections[] {
    return FILE_FORMATS.map((source) => ({
      source,
      target: FILE_FORMATS.filter((target) => target !== source),
    }));
  }
}
