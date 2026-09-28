import { testConfig } from '../../../../test/fakes/config.js';
import { createOAuthProviders } from './oauth-providers.factory.js';

describe('createOAuthProviders', () => {
  it('enables only providers with both id and secret', () => {
    const providers = createOAuthProviders(
      testConfig({
        GOOGLE_CLIENT_ID: 'g',
        GOOGLE_CLIENT_SECRET: 'gs',
        FACEBOOK_CLIENT_ID: 'f',
        X_CLIENT_ID: 'x',
        X_CLIENT_SECRET: 'xs',
      }),
    );
    expect(providers.map((p) => p.id)).toEqual(['google', 'x']);
  });

  it('enables all three when configured, and none by default', () => {
    expect(createOAuthProviders(testConfig())).toEqual([]);
    const all = createOAuthProviders(
      testConfig({
        GOOGLE_CLIENT_ID: 'g',
        GOOGLE_CLIENT_SECRET: 'gs',
        FACEBOOK_CLIENT_ID: 'f',
        FACEBOOK_CLIENT_SECRET: 'fs',
        X_CLIENT_ID: 'x',
        X_CLIENT_SECRET: 'xs',
      }),
    );
    expect(all.map((p) => p.label)).toEqual(['Google', 'Facebook', 'X']);
  });
});
