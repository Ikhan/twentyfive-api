import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { UnauthorizedError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/app-config.service.js';

const ISSUER = 'twentyfive-api';
const AUDIENCE = 'twentyfive-web';

/** Short-lived, stateless access tokens (HS256 JWT) carrying only the user id. */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;
  private readonly ttlMinutes: number;

  constructor(config: AppConfigService) {
    this.key = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET'));
    this.ttlMinutes = config.get('ACCESS_TOKEN_TTL_MINUTES');
  }

  get ttlSeconds(): number {
    return this.ttlMinutes * 60;
  }

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlMinutes}m`)
      .sign(this.key);
  }

  /** Returns the user id, or throws UnauthorizedError for any invalid/expired token. */
  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new Error('missing subject');
      return payload.sub;
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }
  }
}
