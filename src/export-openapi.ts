import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';
import { createOpenApiDocument } from './openapi.js';

/** Writes openapi.json (for API clients) without starting the server or touching the database. */
async function exportOpenApi(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule, { logger: ['error', 'warn'] }));
  const server = app.get(AppConfigService).get('API_PUBLIC_URL'); // paths already include /api/v1
  const file = resolve(process.argv[2] ?? 'openapi.json');
  await writeFile(file, `${JSON.stringify(createOpenApiDocument(app, server), null, 2)}\n`);
  await app.close();
  process.stdout.write(`OpenAPI written to ${file}\n`);
}

await exportOpenApi();
