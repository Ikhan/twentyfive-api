import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AccessTokenService } from '../../src/modules/auth/tokens/access-token.service.js';

export interface TestUser {
  id: string;
  username: string;
  /** Authorization header value. Bearer requests skip CSRF, keeping feature tests focused. */
  auth: string;
}

/** Inserts a user directly and mints an access token for them. */
export async function createUser(
  app: INestApplication,
  prisma: PrismaClient,
  data: { username: string; displayName?: string; hometownId?: string; isPrivate?: boolean; onboarded?: boolean },
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      username: data.username,
      displayName: data.displayName ?? data.username,
      hometownId: data.hometownId,
      isPrivate: data.isPrivate ?? false,
      onboardedAt: data.onboarded === false ? null : new Date(),
    },
  });
  const token = await app.get(AccessTokenService).sign(user.id);
  return { id: user.id, username: user.username, auth: `Bearer ${token}` };
}
