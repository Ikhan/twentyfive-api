import { mentionedUsernames } from './mentions.js';

describe('mentionedUsernames', () => {
  it('finds each @handle once, lowercase, in order', () => {
    expect(mentionedUsernames('@Kasun and @tharushi, thanks @kasun!')).toEqual(['kasun', 'tharushi']);
    expect(mentionedUsernames('(@dilan_99)\n@arun')).toEqual(['dilan_99', 'arun']);
  });

  it('ignores emails, too-short or too-long handles, and a bare @', () => {
    expect(mentionedUsernames('mail me@kasun.lk or @ab or @ or @abcdefghijklmnopqrstu')).toEqual([]);
    expect(mentionedUsernames('@@kasun')).toEqual([]);
  });
});
