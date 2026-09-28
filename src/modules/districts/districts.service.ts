import { Inject, Injectable } from '@nestjs/common';
import type { Paginated } from '../../common/api-response.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import type { Province } from '../../generated/prisma/enums.js';
import type { UserSummary } from '../users/users.types.js';
import { DISTRICTS_REPOSITORY, type DistrictsRepository } from './districts.repository.js';
import type { DistrictDetail, DistrictListItem, DistrictRow, DistrictSummary, FollowState } from './districts.types.js';
import { PROVINCE_NAMES } from './province.js';

type ResidentsCursor = { u: string };
const isResidentsCursor = (v: unknown): v is ResidentsCursor =>
  typeof v === 'object' && v !== null && typeof (v as { u?: unknown }).u === 'string';

@Injectable()
export class DistrictsService {
  constructor(@Inject(DISTRICTS_REPOSITORY) private readonly districts: DistrictsRepository) {}

  /** Explore: every district with its follower count (and, signed in, whether you follow it). */
  async list(province?: Province, viewerId?: string): Promise<DistrictListItem[]> {
    const [rows, states] = await Promise.all([this.districts.list(province), this.districts.followStates(viewerId)]);
    return rows.map((row) => ({
      ...toSummary(row),
      ...(states.get(row.id) ?? { followerCount: 0, followedByMe: false }),
    }));
  }

  async detail(districtId: string, viewerId?: string): Promise<DistrictDetail> {
    const row = await this.require(districtId);
    return {
      ...toSummary(row),
      description: row.description,
      famousFor: row.famousFor,
      ...(await this.followState(districtId, viewerId)),
    };
  }

  async follow(userId: string, districtId: string): Promise<FollowState> {
    await this.require(districtId);
    await this.districts.follow(userId, districtId);
    return this.followState(districtId, userId);
  }

  async unfollow(userId: string, districtId: string): Promise<FollowState> {
    await this.require(districtId);
    await this.districts.unfollow(userId, districtId);
    return this.followState(districtId, userId);
  }

  async residents(districtId: string, page: { cursor?: string; limit: number }): Promise<Paginated<UserSummary>> {
    await this.require(districtId);
    const after = decodeCursor(page.cursor, isResidentsCursor);
    const rows = await this.districts.residents(districtId, { afterUsername: after?.u, take: page.limit + 1 });
    return toPage(
      rows,
      page.limit,
      (u) => u,
      (u): ResidentsCursor => ({ u: u.username }),
    );
  }

  private async followState(districtId: string, viewerId?: string): Promise<FollowState> {
    const [followerCount, followedByMe] = await Promise.all([
      this.districts.followerCount(districtId),
      viewerId ? this.districts.isFollowing(viewerId, districtId) : Promise.resolve(false),
    ]);
    return { followerCount, followedByMe };
  }

  private async require(districtId: string): Promise<DistrictRow> {
    const row = await this.districts.findById(districtId);
    if (!row) throw new NotFoundError(`“${districtId}” isn’t one of Sri Lanka’s 25 districts.`);
    return row;
  }
}

function toSummary(row: DistrictRow): DistrictSummary {
  return {
    id: row.id,
    name: row.name,
    nameSi: row.nameSi,
    nameTa: row.nameTa,
    province: { id: row.province, name: PROVINCE_NAMES[row.province] },
    tagline: row.tagline,
    colors: [row.colorFrom, row.colorTo],
  };
}
