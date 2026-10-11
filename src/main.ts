import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap(): Promise<void> {
  // Hold startup logs until the JSON logger is ready, then send all of Nest's logs through it.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  configureApp(app);
  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/${API_PREFIX}/v1`, 'Bootstrap');
}

await bootstrap();
