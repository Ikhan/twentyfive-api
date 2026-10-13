import { approvalEmail } from './approval-email.js';

const input = {
  name: 'Dilini Perera',
  email: 'dilini@example.lk',
  link: 'https://twentyfive.lk/invite/K7M2QX9PRT',
  expiresAt: new Date('2026-10-27T04:00:00Z'),
};

describe('approvalEmail', () => {
  it('welcomes them by first name, with their link and when it expires', () => {
    const mail = approvalEmail(input);
    expect(mail).toMatchObject({ to: 'dilini@example.lk', subject: 'You’re approved: welcome to twentyfive' });
    expect(mail.text).toMatch(/^Hi Dilini,/);
    expect(mail.text).toContain('Get started: https://twentyfive.lk/invite/K7M2QX9PRT');
    expect(mail.text).toContain('until 27 October 2026');
    expect(mail.html).toContain('href="https://twentyfive.lk/invite/K7M2QX9PRT"');
    expect(mail.html).toContain('Welcome, Dilini!');
  });

  it('never lets what they typed become HTML', () => {
    const mail = approvalEmail({ ...input, name: '<img src=x onerror=alert(1)> Perera' });
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img');
  });
});
