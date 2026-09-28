import { httpContext } from '../../../test/fakes/http-context.js';
import { UnauthorizedError } from '../errors/app-error.js';
import { currentUserFrom } from './current-user.decorator.js';

describe('currentUserFrom', () => {
  it('returns the authenticated user', () => {
    expect(currentUserFrom(httpContext({ user: { id: 'u1' } }))).toEqual({ id: 'u1' });
  });

  it('throws when the route was reached without a user', () => {
    expect(() => currentUserFrom(httpContext({}))).toThrow(UnauthorizedError);
  });
});

describe('optionalUserFrom', () => {
  it('returns the user when present and undefined otherwise', async () => {
    const { optionalUserFrom } = await import('./optional-user.decorator.js');
    expect(optionalUserFrom(httpContext({ user: { id: 'u1' } }))).toEqual({ id: 'u1' });
    expect(optionalUserFrom(httpContext({}))).toBeUndefined();
  });
});
