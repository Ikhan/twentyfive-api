import { SignJWT } from 'jose';
import { testConfig } from '../../../../test/fakes/config.js';
import { UnauthorizedError } from '../../../common/errors/app-error.js';
import { AccessTokenService } from './access-token.service.js';

describe('AccessTokenService', () => {
  const service = new AccessTokenService(testConfig({ ACCESS_TOKEN_TTL_MINUTES: '15' }));

  it('round-trips the user id', async () => {
    await expect(service.verify(await service.sign('user-1'))).resolves.toBe('user-1');
    expect(service.ttlSeconds).toBe(900);
  });

  it('rejects tokens signed with another secret', async () => {
    const other = new AccessTokenService(testConfig({ JWT_ACCESS_SECRET: 'a-completely-different-secret-value-123' }));
    await expect(service.verify(await other.sign('user-1'))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects tampered, garbage and expired tokens', async () => {
    const token = await service.sign('user-1');
    await expect(service.verify(`${token.slice(0, -2)}xx`)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.verify('not.a.jwt')).rejects.toBeInstanceOf(UnauthorizedError);
    const key = new TextEncoder().encode('unit-test-secret-at-least-32-characters!!');
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('twentyfive-api')
      .setAudience('twentyfive-web')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    await expect(service.verify(expired)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects tokens without a subject or with the wrong audience', async () => {
    const key = new TextEncoder().encode('unit-test-secret-at-least-32-characters!!');
    const base = () =>
      new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer('twentyfive-api').setExpirationTime('5m');
    await expect(service.verify(await base().setAudience('twentyfive-web').sign(key))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(
      service.verify(await base().setSubject('u').setAudience('someone-else').sign(key)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
