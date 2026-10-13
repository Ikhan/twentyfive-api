import { Logger } from '@nestjs/common';
import { testConfig } from '../../../test/fakes/config.js';
import { AdminService } from './admin.service.js';
import {
  AccountNotFoundError,
  AdminOnlyError,
  AlreadyJoinedError,
  CannotBanSelfError,
  InviteNotFoundError,
  InvitesClosedError,
  NoInvitesLeftError,
  UnknownDistrictError,
  WaitlistEntryNotFoundError,
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

const entry = { id: 'w1', name: 'Dilini Perera', email: 'dilini@example.lk', invite: null };

function setup({ inviteOnly = true, admin = false, delivers = true } = {}) {
  const mailer = { delivers, send: vi.fn() };
  const repo = {
    isAdmin: vi.fn().mockResolvedValue(admin),
    listByInviter: vi.fn().mockResolvedValue([invite]),
    countHeld: vi.fn().mockResolvedValue(3),
    createWithin: vi.fn().mockResolvedValue(invite),
    findOpen: vi.fn().mockResolvedValue(null),
    addToWaitlist: vi.fn(),
    districtExists: vi.fn().mockResolvedValue(true),
    listWaitlist: vi.fn().mockResolvedValue([]),
    findWaitlistEntry: vi.fn().mockResolvedValue(entry),
    approve: vi.fn().mockResolvedValue(invite),
    markEmailed: vi.fn(),
  } satisfies Record<keyof InvitesRepository, unknown>;
  const adminRepo = {
    findUserId: vi.fn(async (u: string) => ({ amaya: 'u-amaya', imran: 'u-imran' })[u] ?? null),
    ban: vi.fn(),
    unban: vi.fn(),
    clearFlag: vi.fn(),
    listFlagged: vi.fn().mockResolvedValue([]),
  } satisfies Record<keyof AdminRepository, unknown>;
  const service = new InvitesService(
    repo as unknown as InvitesRepository,
    mailer,
    testConfig({ INVITE_ONLY: String(inviteOnly) }),
  );
  const admins = new AdminService(adminRepo as AdminRepository, service);
  return { repo, adminRepo, service, admins, mailer };
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
    await expect(setup().service.approve('u1', 'w1')).rejects.toBeInstanceOf(AdminOnlyError);
    await expect(setup({ admin: true }).service.waitlist('u1')).resolves.toEqual([]);
  });

  it('approves someone on the waitlist: a new link, emailed to them with a welcome', async () => {
    const { service, repo, mailer } = setup({ admin: true });
    await expect(service.approve('u-imran', 'w1')).resolves.toEqual({ invite, emailed: true });
    expect(repo.approve).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ inviterId: 'u-imran' }),
      expect.any(Date),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dilini@example.lk',
        subject: 'You’re approved: welcome to twentyfive',
        text: expect.stringContaining('Get started: https://twentyfive.test/invite/K7M2QX9PRT'),
      }),
    );
    expect(repo.markEmailed).toHaveBeenCalledWith('w1', expect.any(Date));
  });

  it('re-sends the same link while it is unused, and makes a new one once it expires', async () => {
    const { service, repo } = setup({ admin: true });
    const later = new Date(Date.now() + 60_000);
    repo.findWaitlistEntry.mockResolvedValueOnce({
      ...entry,
      invite: { code: 'K7M2QX9PRT', usedAt: null, expiresAt: later },
    });
    await service.approve('u-imran', 'w1');
    expect(repo.approve).toHaveBeenLastCalledWith('w1', null, expect.any(Date));

    repo.findWaitlistEntry.mockResolvedValueOnce({
      ...entry,
      invite: { code: 'K7M2QX9PRT', usedAt: null, expiresAt: new Date(0) },
    });
    await service.approve('u-imran', 'w1');
    expect(repo.approve).toHaveBeenLastCalledWith(
      'w1',
      expect.objectContaining({ code: expect.any(String) }),
      expect.any(Date),
    );
  });

  it('won’t approve someone who already joined, or who isn’t on the list', async () => {
    const { service, repo } = setup({ admin: true });
    repo.findWaitlistEntry.mockResolvedValueOnce({
      ...entry,
      invite: { code: 'X', usedAt: new Date(), expiresAt: new Date() },
    });
    await expect(service.approve('u-imran', 'w1')).rejects.toBeInstanceOf(AlreadyJoinedError);
    repo.findWaitlistEntry.mockResolvedValueOnce(null);
    await expect(service.approve('u-imran', 'nope')).rejects.toBeInstanceOf(WaitlistEntryNotFoundError);
  });

  it('doesn’t claim an email went out while email isn’t set up, or when sending fails', async () => {
    const placeholder = setup({ admin: true, delivers: false });
    await expect(placeholder.service.approve('u-imran', 'w1')).resolves.toEqual({ invite, emailed: false });
    expect(placeholder.mailer.send).toHaveBeenCalled();
    expect(placeholder.repo.markEmailed).not.toHaveBeenCalled();

    const failing = setup({ admin: true });
    failing.mailer.send.mockRejectedValueOnce(new Error('SES is down'));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(failing.service.approve('u-imran', 'w1')).resolves.toEqual({ invite, emailed: false });
    expect(failing.repo.markEmailed).not.toHaveBeenCalled();
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
      () => service.approve('u1', 'w1'),
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
