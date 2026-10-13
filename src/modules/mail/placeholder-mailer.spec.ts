import { Logger } from '@nestjs/common';
import { testConfig } from '../../../test/fakes/config.js';
import { maskEmail, PlaceholderMailer } from './placeholder-mailer.js';

const message = {
  to: 'dilini@example.lk',
  subject: 'Welcome',
  text: 'Get started: https://x/invite/K7M2QX9PRT',
  html: '<p>hi</p>',
};

describe('PlaceholderMailer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says it delivers nothing', () => {
    expect(new PlaceholderMailer(testConfig()).delivers).toBe(false);
  });

  it('logs the whole email in development, so its links can be tried', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new PlaceholderMailer(testConfig({ NODE_ENV: 'development' })).send(message);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('https://x/invite/K7M2QX9PRT'));
  });

  it('never logs the address or the link anywhere else', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await new PlaceholderMailer(testConfig({ NODE_ENV: 'production' })).send(message);
    expect(warn).toHaveBeenCalledWith('Not sent (no email service yet): "Welcome" to d***@example.lk');
  });

  it('masks addresses', () => {
    expect(maskEmail('a@b.lk')).toBe('a***@b.lk');
  });
});
