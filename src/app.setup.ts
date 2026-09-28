import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { AppConfigService } from './config/app-config.service.js';
import { createOpenApiDocument } from './openapi.js';

export const API_PREFIX = 'api';

/**
 * Applies everything that must be identical in production and in e2e tests:
 * security headers, CORS, cookies, /api/v1 routing, validation, error and
 * response formats, and (outside production) the OpenAPI docs.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(AppConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // …and reject requests that send them
      transform: true, // turn query strings into typed DTOs
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.enableShutdownHooks();

  if (!config.isProduction) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, createOpenApiDocument(app));
  }

  return app;
}
