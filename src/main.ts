import { ConfigService } from '@/core/config/config.service';

import compression from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './core/app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(compression);

  app.enableCors({
    origin: [
      'http://localhost:5174',
      'http://localhost:4200',
      'http://localhost:8080',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  const configService = app.get(ConfigService);
  const cookieSecret = configService.get('COOKIE_SECRET');

  await app.register(fastifyCookie, {
    secret: cookieSecret,
  });

  const port = configService.get('PORT');

  await app.listen(port);
}

void bootstrap();
