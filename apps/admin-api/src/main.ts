import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { AppModule } from './app/app.module';
import { buildSwaggerConfig } from './openapi.config';
import { AllExceptionsFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse sso_session and other cookies so SessionCookieGuard can read them
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // credentials: true is required so browsers send the sso_session cookie on cross-origin requests
  app.enableCors({
    origin: ['http://localhost:4300', 'http://localhost:4301', 'http://localhost:4302'],
    credentials: true,
  });

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  // One-shot export mode: when OPENAPI_EXPORT_PATH is set, write the spec
  // to that file and exit without starting the HTTP listener. Used by the
  // `openapi:export` Nx target — runs through the same webpack-built code
  // path as production, so the spec exactly matches what /openapi.json
  // would serve at runtime. No separate tsx/decorator pipeline needed.
  const exportPath = process.env.OPENAPI_EXPORT_PATH;
  if (exportPath) {
    mkdirSync(dirname(exportPath), { recursive: true });
    writeFileSync(exportPath, JSON.stringify(document, null, 2));
    Logger.log(`wrote ${exportPath}`);
    await app.close();
    return;
  }

  // /openapi.json + /reference are public-by-design (spec is non-sensitive in
  // dev; production gates them via ENABLE_OPENAPI). They sit outside the
  // app-level CORS allow-list so the aggregating portal at :4500 (and any
  // future docs origin) can fetch the spec without origin coupling.
  const openApiEnabled = process.env.ENABLE_OPENAPI !== 'false';
  if (openApiEnabled) {
    app.use('/openapi.json', (_req: Request, res: Response) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=60');
      res.json(document);
    });
    app.use('/reference', (req, res, next) => {
      res.set('Access-Control-Allow-Origin', '*');
      next();
    });
    app.use(
      '/reference',
      apiReference({
        spec: { content: document },
        theme: 'default',
      }),
    );
  }

  const port = process.env.ADMIN_API_PORT || 3100;
  await app.listen(port);
  Logger.log(`Admin API is running on: http://localhost:${port}`);
  Logger.log(`API reference (Scalar): http://localhost:${port}/reference`);
  Logger.log(`OpenAPI spec: http://localhost:${port}/openapi.json`);
}

bootstrap();
