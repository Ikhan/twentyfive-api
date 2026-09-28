import { USERNAME_PATTERN } from '../../common/validation/username.js';
import { usernameCandidates } from './username.js';

describe('usernameCandidates', () => {
  it('starts with a clean handle from the display name, then adds numeric suffixes', () => {
    const [first, ...rest] = usernameCandidates('Kasun Perera');
    expect(first).toBe('kasunperera');
    expect(rest).toHaveLength(5);
    for (const candidate of rest) expect(candidate).toMatch(/^kasunperera\d{4}$/);
  });

  it('strips accents and symbols and caps the length at 20', () => {
    expect(usernameCandidates('Chamári Herath-Silva!')[0]).toBe('chamariherathsi');
    for (const candidate of usernameCandidates('A very long display name indeed'))
      expect(candidate.length).toBeLessThanOrEqual(20);
  });

  it('falls back to user#### for names without Latin letters', () => {
    const candidates = usernameCandidates('කසුන් පෙරේරා');
    expect(candidates).toHaveLength(6);
    for (const candidate of candidates) expect(candidate).toMatch(/^user\d{4}$/);
  });

  it('never suggests reserved handles', () => {
    for (const candidate of usernameCandidates('Admin')) expect(candidate).toMatch(/^user\d{4}$/);
  });

  it('always produces valid usernames', () => {
    for (const name of ['Kasun Perera', 'அருண்', 'Al', 'x_Æ_A-12', '   ']) {
      for (const candidate of usernameCandidates(name)) expect(candidate).toMatch(USERNAME_PATTERN);
    }
  });
});
