import { newInviteCode, normalizeInviteCode } from './invite-code.js';

describe('invite codes', () => {
  it('are 10 easy-to-read characters, different every time', () => {
    const codes = new Set(Array.from({ length: 200 }, newInviteCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{10}$/);
  });

  it('are read leniently: any case, spaces or dashes', () => {
    expect(normalizeInviteCode('k7m2-qx9p rt')).toBe('K7M2QX9PRT');
  });

  it('reject anything that could not be one', () => {
    for (const bad of [undefined, 42, '', 'SHORT', 'K7M2QX9PRT1', 'K7M2QX9PR0', '<script>a']) {
      expect(normalizeInviteCode(bad)).toBeNull();
    }
  });
});
