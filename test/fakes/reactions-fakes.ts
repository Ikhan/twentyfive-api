import type { ReactionsRepository } from '../../src/modules/reactions/reactions.repository.js';
import type { Reaction } from '../../src/modules/reactions/reactions.types.js';

export class InMemoryReactionsRepository implements ReactionsRepository {
  readonly reactions = new Set<string>(); // `${kind}:${userId}>${postId}`

  async add(kind: Reaction, userId: string, postId: string): Promise<boolean> {
    const key = `${kind}:${userId}>${postId}`;
    if (this.reactions.has(key)) return false;
    this.reactions.add(key);
    return true;
  }

  async remove(kind: Reaction, userId: string, postId: string): Promise<void> {
    this.reactions.delete(`${kind}:${userId}>${postId}`);
  }
}
