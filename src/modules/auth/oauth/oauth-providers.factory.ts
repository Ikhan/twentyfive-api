import type { AppConfigService } from '../../../config/app-config.service.js';
import { FacebookProvider } from './facebook.provider.js';
import { GoogleProvider } from './google.provider.js';
import type { OAuthProvider } from './oauth-provider.js';

/** Builds the providers whose credentials are configured. Unconfigured providers simply don't exist. */
export function createOAuthProviders(config: AppConfigService): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  const google = [config.get('GOOGLE_CLIENT_ID'), config.get('GOOGLE_CLIENT_SECRET')] as const;
  const facebook = [config.get('FACEBOOK_CLIENT_ID'), config.get('FACEBOOK_CLIENT_SECRET')] as const;
  if (google[0] && google[1]) providers.push(new GoogleProvider(google[0], google[1]));
  if (facebook[0] && facebook[1]) providers.push(new FacebookProvider(facebook[0], facebook[1]));
  return providers;
}
