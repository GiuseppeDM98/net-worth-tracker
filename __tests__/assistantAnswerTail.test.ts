/**
 * The answer's tail (2026-11-25): the next questions the model writes as a fenced JSON array at
 * the end of its text, cut by the server and hidden by the browser while the answer streams.
 *
 * Seen RED: splitAnswerTail keeping the block in the body, accepting a block anywhere, and falling
 * back to visibleAnswerText when there is no block; parseFollowUps with no cap; visibleAnswerText
 * hiding only a closed block, and without the count of the fences above; answerFollowUps reading
 * the starters for every mode.
 */
import { describe, expect, it } from 'vitest';
import {
  REGISTER_ANOTHER_FOLLOW_UP,
  REGISTER_STARTER_FOLLOW_UPS,
  answerFollowUps,
  parseFollowUps,
  splitAnswerTail,
  streamingAnswerText,
  visibleAnswerText,
} from '@/lib/utils/assistantAnswerTail';

const FENCE = '```';
const tail = (json: string) => `${FENCE}assistant-followups\n${json}\n${FENCE}`;
// The notice anthropicStream.ts appends after a cut at max_tokens (a private constant there).
const TRUNCATION_NOTICE = '\n\n_(Risposta interrotta: ho raggiunto il limite di lunghezza. Chiedimi di continuare o restringi la domanda.)_';
const BODY = '**2.400 € nel 2026.**\n\nAsilo 300 € × 8 mesi = 2.400 €.';

describe('splitAnswerTail', () => {
  it('cuts a final block off the text and keeps its three questions', () => {
    const text = `${BODY}\n\n${tail('["E nel 2025?", "Quanto pesa sul reddito?", "E il mutuo A?"]')}`;
    expect(splitAnswerTail(text)).toEqual({
      body: BODY,
      followUps: ['E nel 2025?', 'Quanto pesa sul reddito?', 'E il mutuo A?'],
    });
  });

  it('removes a block followed by more text and gives no chips, keeping what follows', () => {
    const text = `${BODY}\n\n${tail('["E nel 2025?"]')}\n\nUn'ultima riga.`;
    const { body, followUps } = splitAnswerTail(text);
    // The cut leaves the blank lines on both sides of the block: one paragraph break in Markdown.
    expect(body.replace(/\n{3,}/g, '\n\n')).toBe(`${BODY}\n\nUn'ultima riga.`);
    expect(followUps).toEqual([]);
  });

  it('leaves untouched a text that ends with a closed question block and has no tail', () => {
    const text = `${BODY}\n\n${FENCE}assistant-question\n{"id":"q1"}\n${FENCE}`;
    expect(splitAnswerTail(text)).toEqual({ body: text, followUps: [] });
  });

  it('saves a finished text whose last line is a lone fence as it is (only the stream hides it)', () => {
    const text = `${BODY}\n\n${FENCE}`;
    expect(splitAnswerTail(text)).toEqual({ body: text, followUps: [] });
  });

  it('saves a tail cut at the token limit up to its fence, without the notice', () => {
    const text = `${BODY}\n\n${FENCE}assistant-followups\n["E nel 2025?", "Quan${TRUNCATION_NOTICE}`;
    expect(splitAnswerTail(text)).toEqual({ body: BODY, followUps: [] });
  });

  it('saves a text with no tail as it is', () => {
    expect(splitAnswerTail(BODY)).toEqual({ body: BODY, followUps: [] });
  });
});

describe('parseFollowUps', () => {
  it('keeps the first three valid strings: no repeat, none too long, no number', () => {
    const long = 'x'.repeat(120);
    const raw = JSON.stringify(['Prima?', 'prima?', long, 42, 'Seconda?', 'Terza?', 'Quarta?']);
    expect(parseFollowUps(raw)).toEqual(['Prima?', 'Seconda?', 'Terza?']);
  });

  it('gives none for a value that is not an array', () => {
    expect(parseFollowUps('{"a":"Prima?"}')).toEqual([]);
  });

  it('gives none for invalid JSON', () => {
    expect(parseFollowUps('["Prima?",')).toEqual([]);
  });
});

describe('streamingAnswerText (2026-11-25)', () => {
  it('stops at the first fenced block the text opens, closed or not', () => {
    expect(streamingAnswerText('Ecco la riga.\n\n```expense-proposal\n{"amount": 1')).toBe('Ecco la riga.');
    expect(streamingAnswerText('Una domanda.\n\n```assistant-question\n{}\n```\n\nDopo.')).toBe('Una domanda.');
  });

  it('hides the tail as visibleAnswerText does and keeps a text with no fence', () => {
    expect(streamingAnswerText('**300 €**.\n\n```assist')).toBe('**300 €**.');
    expect(streamingAnswerText('## Asilo\n\n- Retta')).toBe('## Asilo\n\n- Retta');
  });
});

describe('visibleAnswerText', () => {
  it('hides a fence being typed, as two backticks or a prefix of its language', () => {
    expect(visibleAnswerText(`${BODY}\n\n\`\``)).toBe(BODY);
    expect(visibleAnswerText(`${BODY}\n\n${FENCE}assist`)).toBe(BODY);
  });

  it('hides an open tail with half an array', () => {
    expect(visibleAnswerText(`${BODY}\n\n${FENCE}assistant-followups\n["E nel`)).toBe(BODY);
  });

  it('keeps another language whole', () => {
    const text = `${BODY}\n\n${FENCE}python`;
    expect(visibleAnswerText(text)).toBe(text);
  });

  it('keeps the fence that closes a question block', () => {
    const text = `${BODY}\n\n${FENCE}assistant-question\n{"id":"q1"}\n${FENCE}`;
    expect(visibleAnswerText(text)).toBe(text);
  });
});

describe('answerFollowUps', () => {
  const chat = { mode: 'chat', hasQuestionCard: false, hasWrittenCard: false };

  it('turns two stored questions of a chat answer into two chips that send', () => {
    expect(answerFollowUps({ ...chat, followUps: ['E nel 2025?', 'E il mutuo A?'] })).toEqual([
      { id: 'fu-0', label: 'E nel 2025?', prompt: 'E nel 2025?', action: 'send' },
      { id: 'fu-1', label: 'E il mutuo A?', prompt: 'E il mutuo A?', action: 'send' },
    ]);
  });

  it('shows none beside a question card', () => {
    expect(answerFollowUps({ ...chat, followUps: ['E nel 2025?'], hasQuestionCard: true })).toEqual([]);
  });

  it('shows the three starters after a Registra answer', () => {
    expect(answerFollowUps({ ...chat, mode: 'register' })).toEqual(REGISTER_STARTER_FOLLOW_UPS);
  });

  it('puts «Registra un\'altra» before two starters after a written card', () => {
    expect(answerFollowUps({ ...chat, mode: 'register', hasWrittenCard: true })).toEqual([
      REGISTER_ANOTHER_FOLLOW_UP,
      ...REGISTER_STARTER_FOLLOW_UPS.slice(0, 2),
    ]);
  });

  it('shows none for a chat answer with a written card and no stored question', () => {
    expect(answerFollowUps({ ...chat, hasWrittenCard: true })).toEqual([]);
  });

  it('shows none without a last answer', () => {
    expect(answerFollowUps(undefined)).toEqual([]);
  });
});
