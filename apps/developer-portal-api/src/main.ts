import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SSO Developer Portal API')
    .setDescription('API key management, OAuth app registration, SDK documentation, and SCIM token management')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.DEVELOPER_PORTAL_API_PORT || 3500;
  await app.listen(port);
  Logger.log(`Developer Portal API running on: http://localhost:${port}`);
  Logger.log(`OpenAPI docs: http://localhost:${port}/api/docs`);
}

bootstrap();
