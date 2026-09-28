import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteOnboardingDto, UpdateProfileDto, UsernameQueryDto } from './profile.dto.js';

async function check<T extends object>(cls: new () => T, body: object): Promise<{ dto: T; errors: string[] }> {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors: errors.map((e) => e.property) };
}

describe('profile DTOs', () => {
  it('UpdateProfileDto accepts partial edits and normalises input', async () => {
    const { dto, errors } = await check(UpdateProfileDto, {
      displayName: '  Kasun  ',
      username: ' Kasun_P ',
      bio: ' hi ',
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ displayName: 'Kasun', username: 'kasun_p', bio: 'hi' });
    expect((await check(UpdateProfileDto, {})).errors).toEqual([]);
  });

  it('UpdateProfileDto rejects blank names, long bios, bad usernames and wrong types', async () => {
    const { errors } = await check(UpdateProfileDto, {
      displayName: '   ',
      bio: 'x'.repeat(161),
      username: 'no spaces',
      isPrivate: 'yes',
      hometownId: '',
    });
    expect(errors.sort()).toEqual(['bio', 'displayName', 'hometownId', 'isPrivate', 'username']);
    expect((await check(UpdateProfileDto, { displayName: 'x'.repeat(51) })).errors).toEqual(['displayName']);
  });

  it('CompleteOnboardingDto requires name, username and hometown', async () => {
    expect((await check(CompleteOnboardingDto, {})).errors.sort()).toEqual(['displayName', 'hometownId', 'username']);
    expect(
      (
        await check(CompleteOnboardingDto, {
          displayName: 'Kasun',
          username: 'kasun',
          hometownId: 'kandy',
          isPrivate: true,
        })
      ).errors,
    ).toEqual([]);
  });

  it('UsernameQueryDto lowercases the query', async () => {
    const { dto, errors } = await check(UsernameQueryDto, { username: ' KASUN ' });
    expect(errors).toEqual([]);
    expect(dto.username).toBe('kasun');
  });
});
