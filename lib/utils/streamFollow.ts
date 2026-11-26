/**
 * Whether the Assistente's page keeps following an answer that is still arriving (owner,
 * 2026-11-25: every chunk brought the page back to the end, so the reader could not scroll up).
 * Pure: the page feeds it each scroll of its container.
 *
 * A scroll up is the reader's own — the page only ever scrolls down to follow — and stops the
 * following; a scroll down that brings the conversation's end into view starts it again. Anything
 * else leaves it as it was. A new message starts it again too (the page's own reset).
 */
export function nextStreamFollow(previousTop: number, top: number, endVisible: boolean, following: boolean): boolean {
  if (top < previousTop - 1) return false;
  if (top > previousTop && endVisible) return true;
  return following;
}
