import { Inject, Injectable } from '@nestjs/common';
import { AccountNotFoundError, CannotBanSelfError } from './invites.errors.js';
import { ADMIN_REPOSITORY, type AdminRepository } from './invites.repository.js';
import type { FlaggedUser } from './invites.types.js';
import { InvitesService } from './invites.service.js';

/** Admin moderation of accounts: bans, and reviewing accounts flagged because whoever invited them was banned. */
@Injectable()
export class AdminService {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    private readonly invites: InvitesService,
  ) {}

  /** Bans them, ends their sessions and flags everyone they invited for review. */
  async ban(adminId: string, username: string): Promise<{ banned: true }> {
    await this.invites.assertAdmin(adminId);
    const userId = await this.userId(username);
    if (userId === adminId) throw new CannotBanSelfError();
    await this.admin.ban(userId, `Invited by @${username}, who was banned`, new Date());
    return { banned: true };
  }

  async unban(adminId: string, username: string): Promise<{ banned: false }> {
    await this.invites.assertAdmin(adminId);
    await this.admin.unban(await this.userId(username));
    return { banned: false };
  }

  async flagged(adminId: string): Promise<FlaggedUser[]> {
    await this.invites.assertAdmin(adminId);
    return this.admin.listFlagged();
  }

  /** Reviewed and fine. */
  async clearFlag(adminId: string, username: string): Promise<null> {
    await this.invites.assertAdmin(adminId);
    await this.admin.clearFlag(await this.userId(username));
    return null;
  }

  private async userId(username: string): Promise<string> {
    const id = await this.admin.findUserId(username.toLowerCase());
    if (!id) throw new AccountNotFoundError();
    return id;
  }
}
