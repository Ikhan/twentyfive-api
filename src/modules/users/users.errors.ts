import { ConflictError, ValidationError } from '../../common/errors/app-error.js';

export class UsernameTakenError extends ConflictError {
  constructor(username: string) {
    super(`@${username} is already taken.`, { field: 'username' });
  }
}

export class UsernameNotAllowedError extends ValidationError {
  constructor(username: string) {
    super(`@${username} can’t be used. Pick another username.`, { field: 'username' });
  }
}

export class UnknownDistrictError extends ValidationError {
  constructor(districtId: string) {
    super(`“${districtId}” isn’t one of Sri Lanka’s 25 districts.`, { field: 'hometownId' });
  }
}
