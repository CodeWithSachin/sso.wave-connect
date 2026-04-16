import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { AllExceptionsFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors({ origin: ['http://localhost:4200', 'http://localhost:4300', 'http://localhost:4400'] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SSO Directory Service')
    .setDescription(
      'SCIM 2.0 provisioning API — enterprise user and group sync from IdPs (Okta, Azure AD, etc.)'
    )
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'SCIM' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.DIRECTORY_SERVICE_PORT || 3200;
  await app.listen(port);
  Logger.log(`Directory Service is running on: http://localhost:${port}`);
  Logger.log(`Swagger docs available at: http://localhost:${port}/docs`);
}

bootstrap();
