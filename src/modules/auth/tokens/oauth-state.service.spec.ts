import { SignJWT } from 'jose';
import { testConfig } from '../../../../test/fakes/config.js';
import { UnauthorizedError } from '../../../common/errors/app-error.js';
import { OAuthStateService } from './oauth-state.service.js';

describe('OAuthStateService', () => {
  const service = new OAuthStateService(testConfig());
  const value = { provider: 'google' as const, state: 'state-123', codeVerifier: 'verifier-abc' };

  it('opens what it sealed when provider and state match', async () => {
    await expect(service.open(await service.seal(value), 'google', 'state-123')).resolves.toEqual(value);
  });

  it.each([
    ['a missing cookie', undefined, 'google', 'state-123'],
    ['a missing state', 'sealed', 'google', undefined],
    ['a different provider', 'sealed', 'facebook', 'state-123'],
    ['a different state (CSRF)', 'sealed', 'google', 'attacker-state'],
  ] as const)('rejects %s', async (_case, cookie, provider, state) => {
    const sealed = cookie === 'sealed' ? await service.seal(value) : cookie;
    await expect(service.open(sealed, provider, state)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects tampered cookies and tokens made for another purpose', async () => {
    const sealed = await service.seal(value);
    await expect(service.open(`${sealed}x`, 'google', 'state-123')).rejects.toBeInstanceOf(UnauthorizedError);
    // An access token signed with the raw JWT secret must not work as a state cookie.
    const accessKey = new TextEncoder().encode('unit-test-secret-at-least-32-characters!!');
    const foreign = await new SignJWT({ ...value })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(accessKey);
    await expect(service.open(foreign, 'google', 'state-123')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
