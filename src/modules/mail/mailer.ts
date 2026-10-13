/** One email: plain text for every client, HTML for the ones that show it. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends email. The app talks to this, never to an email service directly, so the service can change. */
export interface Mailer {
  /** False for the placeholder: nothing actually reaches anyone, so callers mustn't say it was sent. */
  readonly delivers: boolean;
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');
