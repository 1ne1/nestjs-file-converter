import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import {
  HttpException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';

import { ConfigService } from '@/core/config/config.service';

import type { ConversionResponse } from './conversion.worker';
import type { FileFormat } from './format.types';

@Injectable()
export class WorkerConversionService {
  constructor(private readonly config: ConfigService) {}

  convert(
    sourceFormat: FileFormat,
    targetFormat: FileFormat,
    buffer: Buffer,
  ): Promise<Buffer> {
    const timeoutMs = this.config.get('CONVERT_TIMEOUT_SECONDS') * 1000;

    return new Promise<Buffer>((resolve, reject) => {
      const worker = new Worker(join(__dirname, 'conversion.worker.js'));
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
        void worker.terminate();
      };

      const timer = setTimeout(() => {
        settle(() =>
          reject(new RequestTimeoutException('Conversion timed out')),
        );
      }, timeoutMs);

      worker.once('message', (response: ConversionResponse) => {
        settle(() => {
          if (response.ok) {
            resolve(Buffer.from(response.output));
            return;
          }

          const error = new HttpException(response.message, response.status);
          Object.assign(error, { errorCode: response.name });
          reject(error);
        });
      });

      worker.once('error', (error) => {
        settle(() => reject(error));
      });

      worker.postMessage({ sourceFormat, targetFormat, buffer });
    });
  }
}
