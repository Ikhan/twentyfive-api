import { testConfig } from '../../../../test/fakes/config.js';
import { createOAuthProviders } from './oauth-providers.factory.js';

describe('createOAuthProviders', () => {
  it('enables only providers with both id and secret', () => {
    const providers = createOAuthProviders(
      testConfig({ GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'gs', FACEBOOK_CLIENT_ID: 'f' }),
    );
    expect(providers.map((p) => p.id)).toEqual(['google']);
  });

  it('enables Google and Facebook when configured, and none by default', () => {
    expect(createOAuthProviders(testConfig())).toEqual([]);
    const all = createOAuthProviders(
      testConfig({
        GOOGLE_CLIENT_ID: 'g',
        GOOGLE_CLIENT_SECRET: 'gs',
        FACEBOOK_CLIENT_ID: 'f',
        FACEBOOK_CLIENT_SECRET: 'fs',
      }),
    );
    expect(all.map((p) => p.label)).toEqual(['Google', 'Facebook']);
  });
});
