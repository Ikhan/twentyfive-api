import { testConfig } from '../../../test/fakes/config.js';
import { AdminService } from './admin.service.js';
import {
  AccountNotFoundError,
  AdminOnlyError,
  CannotBanSelfError,
  InviteNotFoundError,
  InvitesClosedError,
  NoInvitesLeftError,
  UnknownDistrictError,
} from './invites.errors.js';
import type { AdminRepository, InvitesRepository } from './invites.repository.js';
import { INVITE_TTL_DAYS, INVITES_PER_PERSON } from './invites.types.js';
import { InvitesService } from './invites.service.js';

const invite = {
  code: 'K7M2QX9PRT',
  status: 'pending' as const,
  createdAt: new Date(),
  expiresAt: new Date(),
  usedBy: null,
  usedAt: null,
};

function setup({ inviteOnly = true, admin = false } = {}) {
  const repo = {
    isAdmin: vi.fn().mockResolvedValue(admin),
    listByInviter: vi.fn().mockResolvedValue([invite]),
    countHeld: vi.fn().mockResolvedValue(3),
    createWithin: vi.fn().mockResolvedValue(invite),
    findOpen: vi.fn().mockResolvedValue(null),
    addToWaitlist: vi.fn(),
    districtExists: vi.fn().mockResolvedValue(true),
    listWaitlist: vi.fn().mockResolvedValue([]),
    findWaitlistEntry: vi.fn().mockResolvedValue({ id: 'w1', inviteId: null }),
    inviteFromWaitlist: vi.fn().mockResolvedValue(invite),
  } satisfies Record<keyof InvitesRepository, unknown>;
  const adminRepo = {
    findUserId: vi.fn(async (u: string) => ({ amaya: 'u-amaya', imran: 'u-imran' })[u] ?? null),
    ban: vi.fn(),
    unban: vi.fn(),
    clearFlag: vi.fn(),
    listFlagged: vi.fn().mockResolvedValue([]),
  } satisfies Record<keyof AdminRepository, unknown>;
  const service = new InvitesService(repo as InvitesRepository, testConfig({ INVITE_ONLY: String(inviteOnly) }));
  const admins = new AdminService(adminRepo as AdminRepository, service);
  return { repo, adminRepo, service, admins };
}

describe('InvitesService', () => {
  it('shows how many invites are left', async () => {
    const { service } = setup();
    await expect(service.mine('u1')).resolves.toEqual({
      unlimited: false,
      remaining: INVITES_PER_PERSON - 3,
      admin: false,
      invites: [invite],
    });
  });

  it('gives admins no limit', async () => {
    const { service, repo } = setup({ admin: true });
    await expect(service.mine('u1')).resolves.toMatchObject({ unlimited: true, remaining: null, admin: true });
    await service.create('u1');
    expect(repo.createWithin).toHaveBeenCalledWith(expect.anything(), null, expect.any(Date));
  });

  it(`makes invites that last ${INVITE_TTL_DAYS} days, within the limit`, async () => {
    const { service, repo } = setup();
    await service.create('u1');
    const [next, limit, now] = repo.createWithin.mock.calls[0]!;
    expect(limit).toBe(INVITES_PER_PERSON);
    expect(next.inviterId).toBe('u1');
    expect(next.expiresAt.getTime() - now.getTime()).toBe(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    repo.createWithin.mockResolvedValueOnce(null);
    await expect(service.create('u1')).rejects.toBeInstanceOf(NoInvitesLeftError);
  });

  it('only previews well-formed, open invites', async () => {
    const { service, repo } = setup();
    await expect(service.preview('nope')).rejects.toBeInstanceOf(InviteNotFoundError);
    expect(repo.findOpen).not.toHaveBeenCalled();
    await expect(service.preview('K7M2QX9PRT')).rejects.toBeInstanceOf(InviteNotFoundError);
  });

  it('tidies waitlist sign-ups and checks the district', async () => {
    const { service, repo } = setup();
    await service.joinWaitlist({ name: '  Dilini ', email: ' Dilini@Example.LK ' });
    expect(repo.addToWaitlist).toHaveBeenCalledWith({ name: 'Dilini', email: 'dilini@example.lk' });

    repo.districtExists.mockResolvedValueOnce(false);
    await expect(service.joinWaitlist({ name: 'X', email: 'x@y.lk', districtId: 'atlantis' })).rejects.toBeInstanceOf(
      UnknownDistrictError,
    );
  });

  it('keeps the waitlist to admins', async () => {
    await expect(setup().service.waitlist('u1')).rejects.toBeInstanceOf(AdminOnlyError);
    await expect(setup().service.inviteFromWaitlist('u1', 'w1')).rejects.toBeInstanceOf(AdminOnlyError);
    await expect(setup({ admin: true }).service.waitlist('u1')).resolves.toEqual([]);
  });

  it('switches everything off once sign-up is open to everyone', async () => {
    const { service } = setup({ inviteOnly: false, admin: true });
    expect(service.inviteOnly).toBe(false);
    for (const call of [
      () => service.mine('u1'),
      () => service.create('u1'),
      () => service.preview('K7M2QX9PRT'),
      () => service.joinWaitlist({ name: 'D', email: 'd@x.lk' }),
      () => service.waitlist('u1'),
      () => service.inviteFromWaitlist('u1', 'w1'),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(InvitesClosedError);
    }
  });
});

describe('AdminService', () => {
  it('bans, flagging the people they invited', async () => {
    const { admins, adminRepo } = setup({ admin: true });
    await expect(admins.ban('u-imran', 'Amaya')).resolves.toEqual({ banned: true });
    expect(adminRepo.ban).toHaveBeenCalledWith('u-amaya', 'Invited by @Amaya, who was banned', expect.any(Date));
  });

  it('is for admins only, never on yourself, and only for real accounts', async () => {
    await expect(setup().admins.ban('u1', 'amaya')).rejects.toBeInstanceOf(AdminOnlyError);
    await expect(setup({ admin: true }).admins.ban('u-imran', 'imran')).rejects.toBeInstanceOf(CannotBanSelfError);
    await expect(setup({ admin: true }).admins.ban('u-imran', 'ghost')).rejects.toBeInstanceOf(AccountNotFoundError);
    await expect(setup().admins.flagged('u1')).rejects.toBeInstanceOf(AdminOnlyError);
  });

  it('unbans and clears flags', async () => {
    const { admins, adminRepo } = setup({ admin: true });
    await admins.unban('u-imran', 'amaya');
    await admins.clearFlag('u-imran', 'amaya');
    expect(adminRepo.unban).toHaveBeenCalledWith('u-amaya');
    expect(adminRepo.clearFlag).toHaveBeenCalledWith('u-amaya');
  });
});
