/** Port other modules use to respect blocks without depending on how they're stored. */
export interface BlockChecker {
  /** True when either user has blocked the other. */
  isBlockedBetween(userA: string, userB: string): Promise<boolean>;
}

export const BLOCK_CHECKER = Symbol('BLOCK_CHECKER');
