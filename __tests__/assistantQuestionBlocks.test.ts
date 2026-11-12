/**
 * The question blocks of an Assistente message (lib/utils/assistantQuestionBlocks.ts, 2026-11):
 * their rank among the message's question blocks (never a render counter), the per-message cap,
 * the problems that turn a block back into code, and when a message may still be answered.
 * Invented questions.
 */
import { describe, expect, it } from 'vitest';
import { isAnswerableQuestionMessage, readAssistantQuestionBlocks } from '@/lib/utils/assistantQuestionBlocks';

const question = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ id, kind: 'single', text: `Domanda ${id}?`, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], allowOther: true, ...extra });
const fence = (language: string, body: string) => `\`\`\`${language}\n${body}\n\`\`\``;

describe('readAssistantQuestionBlocks', () => {
  it('ranks the question blocks among themselves, whatever stands between them', () => {
    const content = ['Due domande.', fence('assistant-question', question('account:debit')), fence('expense-proposal', '{}'), fence('assistant-question', question('member:'))].join('\n\n');
    const blocks = readAssistantQuestionBlocks(content);
    expect(blocks.map((block) => [block.index, block.question?.id, block.kept, block.problems])).toEqual([
      [0, 'account:debit', true, []],
      [1, 'member:', true, []],
    ]);
  });

  it('does not keep a third block', () => {
    const content = [1, 2, 3].map((n) => fence('assistant-question', question(`q${n}`))).join('\n\n');
    expect(readAssistantQuestionBlocks(content).map((block) => block.kept)).toEqual([true, true, false]);
  });

  it('carries the problems of bad JSON, a refused question and a broken entity rule', () => {
    const content = [
      fence('assistant-question', '{ "id": "x", '),
      fence('assistant-question', JSON.stringify({ id: 'y', kind: 'single', text: 'Senza opzioni?', options: [], allowOther: true })),
      fence('assistant-question', question('account:to', { allowOther: false })),
    ].join('\n\n');
    const blocks = readAssistantQuestionBlocks(content);
    expect(blocks[0]).toMatchObject({ question: null, problems: ['JSON non valido'] });
    expect(blocks[1].question).toBeNull();
    expect(blocks[1].problems).toHaveLength(1);
    expect(blocks[2].question?.id).toBe('account:to');
    expect(blocks[2].problems).toEqual(['domanda su un\'entità: "allowOther" deve essere true']);
  });

  it('reads the body the scanner closed, a longer fence included', () => {
    const content = `\`\`\`\`assistant-question\n${question('q1')}\n\`\`\`\`\n\nDopo.`;
    expect(readAssistantQuestionBlocks(content)[0].question?.id).toBe('q1');
  });
});

describe('isAnswerableQuestionMessage', () => {
  const message = { id: 'msg-2', mode: 'register' as const };

  it('answers the last assistant message of Registra while nothing streams', () => {
    expect(isAnswerableQuestionMessage(message, 'msg-2', undefined)).toBe(true);
  });

  it('refuses an analysis message, an older message, a stream in flight and a message never saved', () => {
    expect(isAnswerableQuestionMessage({ ...message, mode: 'chat' }, 'msg-2', undefined)).toBe(false);
    expect(isAnswerableQuestionMessage(message, 'msg-3', undefined)).toBe(false);
    expect(isAnswerableQuestionMessage(message, 'msg-2', 'local-assistant-9')).toBe(false);
    expect(isAnswerableQuestionMessage({ id: 'local-assistant-1', mode: 'register' }, 'local-assistant-1', undefined)).toBe(false);
  });
});
