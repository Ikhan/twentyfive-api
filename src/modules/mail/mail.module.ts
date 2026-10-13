import { Global, Module } from '@nestjs/common';
import { MAILER } from './mailer.js';
import { PlaceholderMailer } from './placeholder-mailer.js';

/** Email for the whole app. Swap PlaceholderMailer for a real one (Amazon SES) here. */
@Global()
@Module({
  providers: [{ provide: MAILER, useClass: PlaceholderMailer }],
  exports: [MAILER],
})
export class MailModule {}
