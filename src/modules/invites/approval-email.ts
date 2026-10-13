import type { MailMessage } from '../mail/mailer.js';

export interface ApprovalEmail {
  /** As they typed it on the waitlist. */
  name: string;
  email: string;
  /** Their invite link. */
  link: string;
  expiresAt: Date;
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "27 October 2026" (Sri Lanka time, where the day ends for most readers). */
const day = (date: Date): string =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Colombo' });

/** The "you're approved" email for someone on the waitlist, with their invite link to get started. */
export function approvalEmail({ name, email, link, expiresAt }: ApprovalEmail): MailMessage {
  const first = name.trim().split(/\s+/)[0] || 'there';
  const until = day(expiresAt);
  const text = [
    `Hi ${first},`,
    '',
    'Good news: you’re approved. Welcome to twentyfive!',
    '',
    'twentyfive is where Sri Lankans, at home and around the world, share what’s happening in their hometowns, across all 25 districts.',
    '',
    `Get started: ${link}`,
    '',
    `Sign in with Google or Facebook from that link to create your account. The link is just for you: it works once, until ${until}.`,
    '',
    'See you there,',
    'The twentyfive team',
  ].join('\n');

  const safeLink = escapeHtml(link);
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#eef2fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px">
      <p style="margin:0 0 24px;font-size:24px;font-weight:800;color:#1d4ed8">twentyfive</p>
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25">You’re approved. Welcome, ${escapeHtml(first)}!</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#334155">twentyfive is where Sri Lankans, at home and around the world, share what’s happening in their hometowns, across all 25 districts.</p>
      <p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px">Get started</a></p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#64748b">Sign in with Google or Facebook from that button to create your account. The link is just for you: it works once, until ${until}.</p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8">If the button doesn’t work, copy this into your browser:<br><a href="${safeLink}" style="color:#2563eb;word-break:break-all">${safeLink}</a></p>
    </div>
  </body>
</html>`;

  return { to: email, subject: 'You’re approved: welcome to twentyfive', text, html };
}
