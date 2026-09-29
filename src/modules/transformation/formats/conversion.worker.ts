import { HttpException, HttpStatus } from '@nestjs/common';
import { parentPort } from 'node:worker_threads';

import { FormatRegistryService } from './format-registry.service';
import type { FileFormat } from './format.types';

export interface ConversionRequest {
  sourceFormat: FileFormat;
  targetFormat: FileFormat;
  buffer: Buffer;
}

export type ConversionResponse =
  | { ok: true; output: Buffer }
  | { ok: false; status: number; name: string; message: string };

const registry = new FormatRegistryService();

parentPort?.on('message', (request: ConversionRequest) => {
  try {
    const output = registry.convert(
      request.sourceFormat,
      request.targetFormat,
      Buffer.from(request.buffer),
    );
    const response: ConversionResponse = { ok: true, output };
    parentPort?.postMessage(response);
  } catch (error) {
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const response: ConversionResponse = {
      ok: false,
      status,
      name: error instanceof Error ? error.constructor.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    };
    parentPort?.postMessage(response);
  }
});
