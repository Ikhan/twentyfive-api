import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * The OpenAPI description served at /api/docs and exported by `npm run openapi:export`.
 * Declares both ways to authenticate: the httpOnly cookie the web app uses, and a Bearer
 * token (handy in API clients such as Yaak or Postman; Bearer requests skip CSRF).
 */
export function createOpenApiDocument(app: INestApplication, serverUrl?: string): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('twentyfive.lk API')
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addCookieAuth('access_token', { type: 'apiKey', in: 'cookie', name: 'access_token' }, 'cookie')
    .addSecurityRequirements('bearer');
  if (serverUrl) builder.addServer(serverUrl);
  return SwaggerModule.createDocument(app, builder.build());
}
