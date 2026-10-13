import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import type { MailMessage, Mailer } from './mailer.js';

/** "dilini@example.lk" → "d***@example.lk": enough to tell people apart in logs, without the address. */
export const maskEmail = (email: string): string => email.replace(/^(.).*(@.*)$/, '$1***$2');

/**
 * Stands in until a real email service (Amazon SES) is set up: nothing is sent. In development the whole
 * email goes to the log, so its links can be tried; elsewhere only that an email wasn't sent, and to whom
 * (masked), since invite links are as good as a password for signing up.
 */
@Injectable()
export class PlaceholderMailer implements Mailer {
  readonly delivers = false;
  private readonly logger = new Logger('Email');

  constructor(private readonly config: AppConfigService) {}

  async send({ to, subject, text }: MailMessage): Promise<void> {
    if (this.config.get('NODE_ENV') === 'development') {
      this.logger.log(`Not sent (no email service yet). To: ${to}\nSubject: ${subject}\n\n${text}`);
    } else {
      this.logger.warn(`Not sent (no email service yet): "${subject}" to ${maskEmail(to)}`);
    }
  }
}
