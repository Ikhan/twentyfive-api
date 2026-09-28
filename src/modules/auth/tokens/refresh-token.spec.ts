import { hashToken, newRefreshToken } from './refresh-token.js';

describe('refresh tokens', () => {
  it('are random 256-bit URL-safe strings', () => {
    const token = newRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRefreshToken()).not.toBe(token);
  });

  it('hash deterministically to hex SHA-256 without exposing the token', () => {
    const token = newRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});
