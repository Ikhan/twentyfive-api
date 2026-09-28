import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/${API_PREFIX}/v1`, 'Bootstrap');
}

await bootstrap();
