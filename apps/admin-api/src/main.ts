import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SSO Admin API')
    .setDescription(
      'Admin API for the SSO platform — tenant management, users, memberships, groups, identity providers, and security policies'
    )
    .setVersion('2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.ADMIN_API_PORT || 3100;
  await app.listen(port);
  Logger.log(`Admin API is running on: http://localhost:${port}`);
  Logger.log(`Swagger docs available at: http://localhost:${port}/docs`);
}

bootstrap();
