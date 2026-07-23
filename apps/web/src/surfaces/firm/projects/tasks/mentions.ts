/**
 * @mention parsing for task comments (#13). Mentions are matched against the
 * live workspace member list at compose time; the stored payload keeps only
 * the uids (`payload.mentions`) so renames don't break history.
 * Notification fan-out is #18/#19 — this is parse + highlight only.
 */

export interface IMentionMember {
  uid: string;
  displayName: string;
}

export type TMentionToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; uid: string };

/**
 * Matches members longest-name-first so "@Sam Lee" wins over "@Sam", and
 * requires a non-word (or end) boundary after the name so "@Sami" does not
 * match member "Sam".
 */
function matchMemberAt(
  text: string,
  atIndex: number,
  members: readonly IMentionMember[],
): IMentionMember | null {
  const rest = text.slice(atIndex + 1);
  const restLower = rest.toLowerCase();
  let best: IMentionMember | null = null;
  for (const member of members) {
    const name = member.displayName;
    if (name.length === 0 || (best !== null && name.length <= best.displayName.length)) {
      continue;
    }
    if (!restLower.startsWith(name.toLowerCase())) {
      continue;
    }
    const after = rest.charAt(name.length);
    if (after === '' || !/[\p{L}\p{N}_]/u.test(after)) {
      best = member;
    }
  }
  return best;
}

/** Uids of members @mentioned in `text`, deduplicated, in order of appearance. */
export function parseMentions(text: string, members: readonly IMentionMember[]): string[] {
  const uids: string[] = [];
  for (const token of tokenizeMentions(text, members)) {
    if (token.type === 'mention' && !uids.includes(token.uid)) {
      uids.push(token.uid);
    }
  }
  return uids;
}

/** Splits `text` into plain-text and mention tokens for render highlighting. */
export function tokenizeMentions(
  text: string,
  members: readonly IMentionMember[],
): TMentionToken[] {
  const tokens: TMentionToken[] = [];
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text.charAt(i) !== '@') {
      i += 1;
      continue;
    }
    const member = matchMemberAt(text, i, members);
    if (member === null) {
      i += 1;
      continue;
    }
    if (plainStart < i) {
      tokens.push({ type: 'text', value: text.slice(plainStart, i) });
    }
    const consumed = 1 + member.displayName.length;
    tokens.push({ type: 'mention', value: text.slice(i, i + consumed), uid: member.uid });
    i += consumed;
    plainStart = i;
  }
  if (plainStart < text.length) {
    tokens.push({ type: 'text', value: text.slice(plainStart) });
  }
  return tokens;
}
