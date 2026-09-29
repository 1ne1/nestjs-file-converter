import type { ServerResponse } from 'node:http';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { FastifyRequest } from 'fastify';

import { buildOpenApiDocument } from './openapi-document';

export function setupApiDocs(app: NestFastifyApplication): void {
  const document = buildOpenApiDocument();
  const reference = apiReference({ content: document, withFastify: true }) as (
    req: FastifyRequest,
    res: ServerResponse,
  ) => void;

  app
    .getHttpAdapter()
    .getInstance()
    .get('/docs', (request, reply) => {
      reference(request, reply.raw);
    });
}
