import { parse as parseCsv } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseYaml } from 'yaml';

import { FormatRegistryService } from './format-registry.service';
import { FileFormat } from './format.types';

describe('FormatRegistryService', () => {
  const registry = new FormatRegistryService();

  const samples: Record<FileFormat, Buffer> = {
    csv: Buffer.from('name,age\nAlice,30\nBob,25\n'),
    json: Buffer.from(
      JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]),
    ),
    xml: Buffer.from(
      '<root><item><name>Alice</name><age>30</age></item><item><name>Bob</name><age>25</age></item></root>',
    ),
    yaml: Buffer.from('- name: Alice\n  age: 30\n- name: Bob\n  age: 25\n'),
  };

  function assertParseableAs(format: FileFormat, buffer: Buffer): void {
    switch (format) {
      case 'csv': {
        const rows = parseCsv(buffer, { columns: true });
        expect(rows.length).toBeGreaterThan(0);
        break;
      }
      case 'json': {
        expect(() => {
          JSON.parse(buffer.toString('utf-8'));
        }).not.toThrow();
        break;
      }
      case 'xml': {
        const parsed = new XMLParser().parse(buffer.toString('utf-8')) as
          | Record<string, unknown>
          | undefined;
        expect(Object.keys(parsed ?? {}).length).toBe(1);
        break;
      }
      case 'yaml': {
        expect(() => {
          parseYaml(buffer.toString('utf-8'));
        }).not.toThrow();
        break;
      }
    }
  }

  const formats: FileFormat[] = ['csv', 'json', 'xml', 'yaml'];

  for (const source of formats) {
    for (const target of formats) {
      if (source === target) continue;

      it(`converts ${source} -> ${target}`, () => {
        const output = registry.convert(source, target, samples[source]);
        expect(output).toBeInstanceOf(Buffer);
        expect(output.length).toBeGreaterThan(0);
        assertParseableAs(target, output);
      });
    }
  }

  describe('listFormats', () => {
    it('returns all 4 formats as sources', () => {
      const result = registry.listFormats();
      expect(result.map((entry) => entry.source).sort()).toEqual([
        'csv',
        'json',
        'xml',
        'yaml',
      ]);
    });

    it('lists the other 3 formats as targets for each source', () => {
      const result = registry.listFormats();
      for (const entry of result) {
        expect(entry.target).toHaveLength(3);
        expect(entry.target).not.toContain(entry.source);
      }
    });

    it('produces exactly 12 total directions', () => {
      const result = registry.listFormats();
      const totalDirections = result.reduce(
        (sum, entry) => sum + entry.target.length,
        0,
      );
      expect(totalDirections).toBe(12);
    });
  });
});
