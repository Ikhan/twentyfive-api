import { Inject, Injectable } from '@nestjs/common';
import type { Paginated } from '../../common/api-response.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import type { Province } from '../../generated/prisma/enums.js';
import type { UserSummary } from '../users/users.types.js';
import { DISTRICTS_REPOSITORY, type DistrictsRepository } from './districts.repository.js';
import type {
  DistrictDetail,
  DistrictListItem,
  DistrictRow,
  DistrictSummary,
  FollowState,
  TrendingDistrict,
  TrendingWindow,
} from './districts.types.js';
import { PROVINCE_NAMES } from './province.js';

type ResidentsCursor = { u: string };
const isResidentsCursor = (v: unknown): v is ResidentsCursor =>
  typeof v === 'object' && v !== null && typeof (v as { u?: unknown }).u === 'string';

const HOUR_MS = 3_600_000;
/** Today first, then this week; older activity fades faster in the shorter window. */
const TRENDING_WINDOWS: { window: TrendingWindow; hours: number; halfLifeHours: number }[] = [
  { window: 'day', hours: 24, halfLifeHours: 12 },
  { window: 'week', hours: 24 * 7, halfLifeHours: 72 },
];
/** Roughly one fresh post: below this a district isn't trending in that window. */
export const MIN_TRENDING_SCORE = 2.5;
/** The ranking is the same for everyone, so it's worked out at most once per 5 minutes. */
export const TRENDING_TTL_MS = 5 * 60_000;

@Injectable()
export class DistrictsService {
  private trendingCache?: { at: number; ranking: Promise<TrendingDistrict[]> };

  constructor(@Inject(DISTRICTS_REPOSITORY) private readonly districts: DistrictsRepository) {}

  /** Trending cities: busiest today, then this week, then most followed, so the list is always full. */
  async trending(limit: number): Promise<TrendingDistrict[]> {
    const cached = this.trendingCache;
    if (cached && Date.now() - cached.at < TRENDING_TTL_MS) return (await cached.ranking).slice(0, limit);
    const ranking = this.rankTrending();
    this.trendingCache = { at: Date.now(), ranking };
    // A failed ranking isn't kept: the next request tries again.
    ranking.catch(() => {
      if (this.trendingCache?.ranking === ranking) this.trendingCache = undefined;
    });
    return (await ranking).slice(0, limit);
  }

  /** Explore: every district with its follower count (and, signed in, whether you follow it). */
  async list(province?: Province, viewerId?: string): Promise<DistrictListItem[]> {
    const [rows, states] = await Promise.all([this.districts.list(province), this.districts.followStates(viewerId)]);
    return rows.map((row) => ({
      ...toSummary(row),
      ...(states.get(row.id) ?? { followerCount: 0, followedByMe: false, notifying: false }),
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

  /** The bell: tell this follower about new posts in the district. */
  async setNotifications(userId: string, districtId: string, on: boolean): Promise<FollowState> {
    const row = await this.require(districtId);
    if (!(await this.districts.setNotify(userId, districtId, on))) {
      throw new ConflictError(`Follow ${row.name} to get notified about its posts.`);
    }
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

  private async rankTrending(): Promise<TrendingDistrict[]> {
    const now = Date.now();
    const [rows, states, ...windows] = await Promise.all([
      this.districts.list(),
      this.districts.followStates(),
      ...TRENDING_WINDOWS.map((w) => this.districts.activity(new Date(now - w.hours * HOUR_MS), w.halfLifeHours)),
    ]);
    const followers = (id: string) => states.get(id)?.followerCount ?? 0;
    const picked = new Map<string, { postCount: number; window: TrendingWindow }>();
    TRENDING_WINDOWS.forEach(({ window }, i) => {
      [...windows[i]!]
        .filter((a) => a.score >= MIN_TRENDING_SCORE)
        .sort((a, b) => b.score - a.score)
        .forEach((a) => picked.has(a.districtId) || picked.set(a.districtId, { postCount: a.posts, window }));
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const active = [...picked].flatMap(([id, why]) => {
      const row = byId.get(id);
      return row ? [{ ...toSummary(row), followerCount: followers(id), ...why }] : [];
    });
    // Rows come A–Z, and the sort is stable, so ties on followers stay alphabetical.
    const rest = rows
      .filter((r) => !picked.has(r.id))
      .sort((a, b) => followers(b.id) - followers(a.id))
      .map((r) => ({ ...toSummary(r), followerCount: followers(r.id), postCount: 0, window: null }));
    return [...active, ...rest];
  }

  private async followState(districtId: string, viewerId?: string): Promise<FollowState> {
    const [followerCount, follow] = await Promise.all([
      this.districts.followerCount(districtId),
      viewerId ? this.districts.findFollow(viewerId, districtId) : Promise.resolve(null),
    ]);
    return { followerCount, followedByMe: follow !== null, notifying: follow?.notify ?? false };
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
