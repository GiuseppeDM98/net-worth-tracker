import type Anthropic from '@anthropic-ai/sdk';

/**
 * The comment an email may print from one response (streamed, read whole), or null.
 *
 * Only a response that ended on `end_turn` is a comment (2026-10-12). A decline is an HTTP 200
 * with `stop_reason: 'refusal'` that can follow some text, and a `max_tokens` cut stops
 * mid-sentence: either way the text is a fragment, and an email cannot say «incompleto» the way
 * Rendimenti's dialog does — it goes out without the AI section, exactly as when the call fails.
 * A `pause_turn` (the server-tool loop paused) is a fragment too.
 *
 * The request opts into the server-side fallback (`SERVER_SIDE_FALLBACK_BETA`), so the comment
 * may have been written by the fallback model: the log says so, the email does not name a model.
 */
export function readCompleteEmailComment(
  message: Anthropic.Beta.Messages.BetaMessage,
  requestedModel: string,
  logLabel: string
): string | null {
  if (message.model !== requestedModel) {
    console.info(`[${logLabel}] ${requestedModel} declined; ${message.model} wrote the comment`);
  }
  if (message.stop_reason !== 'end_turn') {
    console.warn(`[${logLabel}] Comment dropped: stop_reason ${message.stop_reason}`);
    return null;
  }
  // Concatenate the text blocks (skips thinking, tool and fallback blocks).
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  return text || null;
}
