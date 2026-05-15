import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { buildSwaggerConfig } from './openapi.config';
import { AppModule } from './app/app.module';
import { AllExceptionsFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableCors({
    origin: ['http://localhost:4300', 'http://localhost:4301', 'http://localhost:4302'],
    credentials: true,
  });

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  const exportPath = process.env.OPENAPI_EXPORT_PATH;
  if (exportPath) {
    mkdirSync(dirname(exportPath), { recursive: true });
    writeFileSync(exportPath, JSON.stringify(document, null, 2));
    Logger.log(`wrote ${exportPath}`);
    await app.close();
    return;
  }

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

  const port = process.env.AUDIT_SERVICE_PORT || 3400;
  await app.listen(port);
  Logger.log(`Audit Service is running on: http://localhost:${port}`);
  Logger.log(`API reference (Scalar): http://localhost:${port}/reference`);
  Logger.log(`OpenAPI spec: http://localhost:${port}/openapi.json`);
}

bootstrap();
