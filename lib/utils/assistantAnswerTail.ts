/**
 * The tail of an Assistente answer: the next questions, written by the model as a fenced JSON array
 * at the very end of its text (2026-11-25; until then a static table by mode that never read the
 * question). The server cuts the block off the text it saves and keeps the questions on the message;
 * the browser hides it while the answer streams.
 */
export const FOLLOW_UPS_LANGUAGE = 'assistant-followups';
export const FOLLOW_UPS_MAX = 3;
export const FOLLOW_UP_MAX_LENGTH = 90;

const FENCE = '```' + FOLLOW_UPS_LANGUAGE;
const BLOCK = new RegExp('(?:^|\\n)```' + FOLLOW_UPS_LANGUAGE + '[ \\t]*\\n([\\s\\S]*?)\\n?```[ \\t]*(?=\\n|$)');

/** A chip under the last answer: `send` submits the prompt, `focus-composer` empties and focuses the composer; absent, a Registra chip prefills and the others send. */
export interface AssistantFollowUp {
  id: string;
  label: string;
  prompt: string;
  action?: 'send' | 'focus-composer';
}

export const REGISTER_ANOTHER_FOLLOW_UP: AssistantFollowUp = { id: 'register-another', label: "Registra un'altra", prompt: '', action: 'focus-composer' };

/** Registra writes no next questions: its three starters stay, and prefill the composer (owner, 2026-11-23). */
export const REGISTER_STARTER_FOLLOW_UPS: AssistantFollowUp[] = [
  { id: 'register-expense-today', label: 'Registra una spesa di oggi', prompt: 'Oggi ho speso ' },
  { id: 'register-salary', label: 'Registra lo stipendio', prompt: 'Ho ricevuto lo stipendio di ' },
  { id: 'register-transfer', label: 'Sposta soldi fra due conti', prompt: 'Ho spostato ' },
];

/** The array as chips: strings only, trimmed, no blank, none over the length, no repeat, the first three. */
export function parseFollowUps(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const label = item.trim().replace(/\s+/g, ' ');
    if (label.length === 0 || label.length > FOLLOW_UP_MAX_LENGTH) continue;
    const key = label.toLocaleLowerCase('it-IT');
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(label);
    if (kept.length === FOLLOW_UPS_MAX) break;
  }
  return kept;
}

/**
 * What the reader may see of a text that is still arriving: everything before the tail's fence —
 * closed, open, or being typed (a last line that is a prefix of the fence, «``» or «```assist»).
 * A last line of backticks that CLOSES a block opened before it (a question card) is not the tail:
 * the fences above it are then odd, and the text stays whole.
 */
export function visibleAnswerText(content: string): string {
  const at = content.lastIndexOf(FENCE);
  if (at !== -1) return content.slice(0, at).trimEnd();
  const lastBreak = content.lastIndexOf('\n');
  const lastLine = content.slice(lastBreak + 1);
  if (lastLine.length < 2 || !FENCE.startsWith(lastLine)) return content;
  const before = content.slice(0, Math.max(lastBreak, 0));
  const fencesAbove = before.match(/^```/gm)?.length ?? 0;
  return fencesAbove % 2 === 0 ? before.trimEnd() : content;
}

/**
 * What a streaming answer shows, rendered as Markdown (owner, 2026-11-25: the raw text turned into
 * Markdown at the end, and the page jumped): `visibleAnswerText`, stopped at the first fenced block
 * the text opens. A card's block — a proposal, a question — renders once the answer is complete, so
 * its JSON is never on screen.
 */
export function streamingAnswerText(content: string): string {
  const visible = visibleAnswerText(content);
  const fence = /^```/m.exec(visible);
  return fence ? visible.slice(0, fence.index).trimEnd() : visible;
}

/**
 * A finished answer as the text to save and its next questions. The block is always cut out of the
 * text; it gives chips only when it is the last thing in it. One left open (a cut at the token
 * limit) goes from its fence on; a text with no such block is saved as it is.
 */
export function splitAnswerTail(text: string): { body: string; followUps: string[] } {
  const match = BLOCK.exec(text);
  if (!match) {
    const at = text.lastIndexOf(FENCE);
    return { body: at === -1 ? text : text.slice(0, at).trimEnd(), followUps: [] };
  }
  const after = text.slice(match.index + match[0].length);
  const body = (text.slice(0, match.index) + after).trim();
  return { body, followUps: after.trim().length === 0 ? parseFollowUps(match[1]) : [] };
}

/** What the page knows of the last complete answer. */
export interface FollowUpSource {
  mode: string;
  followUps?: string[];
  /** It holds a question card the reader can answer. */
  hasQuestionCard: boolean;
  /** A card of it was written (a registration confirmed). */
  hasWrittenCard: boolean;
}

/** The chips under the last answer: none beside a question; Registra's own; else the model's. */
export function answerFollowUps(last: FollowUpSource | undefined): AssistantFollowUp[] {
  if (!last || last.hasQuestionCard) return [];
  if (last.mode === 'register') {
    return [...(last.hasWrittenCard ? [REGISTER_ANOTHER_FOLLOW_UP] : []), ...REGISTER_STARTER_FOLLOW_UPS].slice(0, FOLLOW_UPS_MAX);
  }
  return (last.followUps ?? []).map((label, i) => ({ id: `fu-${i}`, label, prompt: label, action: 'send' as const }));
}
