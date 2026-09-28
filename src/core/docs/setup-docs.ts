import type { ServerResponse } from 'node:http';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { FastifyRequest } from 'fastify';

export function setupApiDocs(app: NestFastifyApplication): void {
  const documentConfig = new DocumentBuilder()
    .setTitle('NestJS Monolith Boilerplate API')
    .setDescription('Auto-generated reference for every registered route')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
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
