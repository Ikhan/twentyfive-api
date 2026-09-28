import { usernameProblem } from './username.js';

describe('usernameProblem', () => {
  it.each(['kasun', 'arun_jaffna', 'k25', 'a'.repeat(20)])('accepts %s', (name) => {
    expect(usernameProblem(name)).toBeNull();
  });

  it.each(['ka', 'a'.repeat(21), 'Kasun', 'kasun perera', 'kasun.p', 'කසුන්', ''])(
    'rejects the format of %s',
    (name) => {
      expect(usernameProblem(name)).toBe('invalid');
    },
  );

  it.each(['admin', 'settings', 'twentyfive', 'explore'])('rejects reserved %s', (name) => {
    expect(usernameProblem(name)).toBe('reserved');
  });
});
