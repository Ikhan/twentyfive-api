import type { Reaction } from './reactions.types.js';

export interface ReactionsRepository {
  /** Adds the reaction; false when it was already there. */
  add(kind: Reaction, userId: string, postId: string): Promise<boolean>;
  /** Removes the reaction if present. */
  remove(kind: Reaction, userId: string, postId: string): Promise<void>;
}

export const REACTIONS_REPOSITORY = Symbol('REACTIONS_REPOSITORY');
