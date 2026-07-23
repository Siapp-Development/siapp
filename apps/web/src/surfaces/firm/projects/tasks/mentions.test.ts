import { describe, expect, it } from 'vitest';

import { parseMentions, tokenizeMentions } from './mentions.ts';

const members = [
  { uid: 'u1', displayName: 'Sam' },
  { uid: 'u2', displayName: 'Sam Lee' },
  { uid: 'u3', displayName: 'Aisyah' },
];

describe('parseMentions', () => {
  it('extracts uids for matched members', () => {
    expect(parseMentions('ping @Aisyah about this', members)).toEqual(['u3']);
  });

  it('prefers the longest matching name', () => {
    expect(parseMentions('cc @Sam Lee please', members)).toEqual(['u2']);
  });

  it('matches the shorter name when followed by a word boundary', () => {
    expect(parseMentions('cc @Sam, thanks', members)).toEqual(['u1']);
  });

  it('does not match partial names ("@Sami" is not "Sam")', () => {
    expect(parseMentions('hello @Sami', members)).toEqual([]);
  });

  it('is case-insensitive and deduplicates uids', () => {
    expect(parseMentions('@aisyah and @Aisyah again', members)).toEqual(['u3']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(parseMentions('no mentions here', members)).toEqual([]);
    expect(parseMentions('@nobody known', members)).toEqual([]);
    expect(parseMentions('', members)).toEqual([]);
  });
});

describe('tokenizeMentions', () => {
  it('splits text into plain and mention tokens', () => {
    expect(tokenizeMentions('hi @Sam Lee, see @Aisyah', members)).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@Sam Lee', uid: 'u2' },
      { type: 'text', value: ', see ' },
      { type: 'mention', value: '@Aisyah', uid: 'u3' },
    ]);
  });

  it('keeps unmatched @ sequences as plain text', () => {
    expect(tokenizeMentions('email me @ home', members)).toEqual([
      { type: 'text', value: 'email me @ home' },
    ]);
  });

  it('handles a mention at the very start and end', () => {
    expect(tokenizeMentions('@Sam', members)).toEqual([
      { type: 'mention', value: '@Sam', uid: 'u1' },
    ]);
  });
});
