/**
 * The two pure steps on the Assistente's message list: the local message adopting its server id
 * at the stream's end, and a card's outcome written on its message.
 */
import { describe, expect, it } from 'vitest';
import { adoptStreamMessageId, applyProposalToMessages, conversationScrollSignal } from '@/lib/utils/assistantStreamBuffer';
import type { AssistantMessage, AssistantProposalState } from '@/types/assistant';

const AT = new Date('2026-11-01T10:00:00Z');

function message(id: string, role: AssistantMessage['role'], threadId = 'pending'): AssistantMessage {
  return { id, threadId, userId: 'u1', role, content: role, createdAt: AT, mode: 'register' };
}

const buffer = (): AssistantMessage[] => [message('local-user-1', 'user'), message('local-assistant-1', 'assistant')];

describe('adoptStreamMessageId', () => {
  it('gives the local assistant message the server id and thread, and leaves the user message alone', () => {
    const adopted = adoptStreamMessageId(buffer(), 'local-assistant-1', { messageId: 'msg-1', threadId: 'thread-1' });
    expect(adopted.map((m) => m.id)).toEqual(['local-user-1', 'msg-1']);
    expect(adopted[1].threadId).toBe('thread-1');
    expect(adopted[0].threadId).toBe('pending');
  });

  it('keeps the thread id when the event names none', () => {
    const adopted = adoptStreamMessageId([message('local-assistant-1', 'assistant', 'thread-9')], 'local-assistant-1', { messageId: 'msg-1' });
    expect(adopted[0]).toMatchObject({ id: 'msg-1', threadId: 'thread-9' });
  });

  it('changes nothing without a message id', () => {
    const messages = buffer();
    expect(adoptStreamMessageId(messages, 'local-assistant-1', { threadId: 'thread-1' })).toBe(messages);
  });
});

describe('applyProposalToMessages', () => {
  const written: AssistantProposalState = { status: 'written', writtenIds: ['exp-1'], at: AT };
  const ignored: AssistantProposalState = { status: 'ignored', at: AT };

  it('writes the outcome on its message only', () => {
    const messages = [message('msg-0', 'assistant'), message('msg-1', 'assistant')];
    const applied = applyProposalToMessages(messages, 'msg-1', 'expense:0', written);
    expect(applied[1].proposals).toEqual({ 'expense:0': written });
    expect(applied[0].proposals).toBeUndefined();
  });

  it('keeps the outcomes of the other cards of the message', () => {
    const first = applyProposalToMessages([message('msg-1', 'assistant')], 'msg-1', 'expense:0', written);
    const second = applyProposalToMessages(first, 'msg-1', 'expense:1', ignored);
    expect(second[0].proposals).toEqual({ 'expense:0': written, 'expense:1': ignored });
  });

  it('does not mutate the list it is given', () => {
    const messages = [message('msg-1', 'assistant')];
    applyProposalToMessages(messages, 'msg-1', 'expense:0', written);
    expect(messages[0].proposals).toBeUndefined();
  });
});

describe('conversationScrollSignal', () => {
  const written: AssistantProposalState = { status: 'written', writtenIds: ['exp-1'], at: AT };

  it('does not change when a card records its outcome', () => {
    const messages = [message('msg-0', 'user'), message('msg-1', 'assistant')];
    const applied = applyProposalToMessages(messages, 'msg-1', 'expense:0', written);
    expect(applied).not.toBe(messages);
    expect(conversationScrollSignal(applied)).toBe(conversationScrollSignal(messages));
  });

  it('changes when a message is added and when the last one grows', () => {
    const messages = [message('msg-0', 'user'), message('msg-1', 'assistant')];
    const signal = conversationScrollSignal(messages);
    expect(conversationScrollSignal([...messages, message('msg-2', 'user')])).not.toBe(signal);
    const grown = [messages[0], { ...messages[1], content: `${messages[1].content} e ancora` }];
    expect(conversationScrollSignal(grown)).not.toBe(signal);
  });

  it('is empty for an empty conversation', () => {
    expect(conversationScrollSignal([])).toBe('');
  });
});
