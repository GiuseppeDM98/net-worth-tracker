/**
 * `AssistantStreamingResponse` — which fenced block of an assistant message becomes which card
 * (2026-11). A card's key is its block's rank among the blocks of its language, read off the
 * markdown's source offsets: the same after a reload. At most five expense cards per message, an
 * expense card in Registra alone, a block inside a quote stays code. The two cards are stubs
 * that print the key they were given: each has its own suite.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// MessageIdContext imports the authenticated fetch, which initialises Firebase.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/components/assistant/ExpenseProposalCard', () => ({
  ExpenseProposalCard: ({ proposal, index }: { proposal: { amount: number }; index: number }) => (
    <div data-proposal={`expense:${index}`}>{proposal.amount}</div>
  ),
}));
vi.mock('@/components/assistant/GoalProposalCard', () => ({
  GoalProposalCard: ({ proposal, index }: { proposal: { name: string }; index: number }) => (
    <div data-proposal={`goal:${index}`}>{proposal.name}</div>
  ),
}));

import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { AI_CONTROL_ACCENT_CLASS, AI_GENERATED_EYEBROW_CLASS } from '@/lib/constants/aiAccent';
import type { AssistantMessage, AssistantMode } from '@/types/assistant';

const AT = new Date('2026-11-01T10:00:00Z');

const expenseBlock = (amount: number, indent = '') =>
  [
    '```expense-proposal',
    JSON.stringify({ kind: 'expense', type: 'variable', amount, dateIso: '2026-11-01', categoryId: 'cat-cibo', reason: 'Come le ultime.' }),
    '```',
  ].map((line) => indent + line).join('\n');

const GOAL_BLOCK = ['```goal-proposal', JSON.stringify({ name: 'Acquisto Casa', priority: 'alta' }), '```'].join('\n');

function assistant(content: string, overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return { id: 'msg-1', threadId: 'thread-1', userId: 'u1', role: 'assistant', content, createdAt: AT, mode: 'register', ...overrides };
}

function renderMessages(messages: AssistantMessage[], mode: AssistantMode = 'register', extra: Partial<Parameters<typeof AssistantStreamingResponse>[0]> = {}) {
  const recordProposal = vi.fn();
  const view = render(
    <AssistantStreamingResponse messages={messages} isInterrupted={false} onRetry={() => {}} mode={mode} threadId="thread-1" recordProposal={recordProposal} {...extra} />,
  );
  return { ...view, recordProposal };
}

const keys = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-proposal]')).map((node) => node.getAttribute('data-proposal'));

describe('AssistantStreamingResponse — the cards of a message', () => {
  it('keys two expense blocks and a goal block by their rank within their language', () => {
    const { container } = renderMessages([assistant(`Ecco le righe.\n\n${expenseBlock(100)}\n\n${GOAL_BLOCK}\n\n${expenseBlock(20)}`)]);
    expect(keys(container)).toEqual(['expense:0', 'goal:0', 'expense:1']);
    expect(container.querySelector('[data-proposal="expense:0"]')?.textContent).toBe('100');
    expect(container.querySelector('[data-proposal="expense:1"]')?.textContent).toBe('20');
    expect(container.querySelector('pre')).toBeNull();
  });

  it('renders five cards of six blocks: the sixth stays code', () => {
    const content = Array.from({ length: 6 }, (_, index) => expenseBlock(10 + index)).join('\n\n');
    const { container } = renderMessages([assistant(content)]);
    expect(keys(container)).toEqual(['expense:0', 'expense:1', 'expense:2', 'expense:3', 'expense:4']);
    const code = container.querySelectorAll('pre');
    expect(code).toHaveLength(1);
    expect(code[0].textContent).toContain('"amount":15');
  });

  it('keeps the key of a fence indented by two spaces', () => {
    const { container } = renderMessages([assistant(`Due righe.\n\n${expenseBlock(100)}\n\n${expenseBlock(20, '  ')}`)]);
    expect(keys(container)).toEqual(['expense:0', 'expense:1']);
  });

  it('leaves a block inside a quote as code, and the next block’s key unchanged', () => {
    const quoted = expenseBlock(999).split('\n').map((line) => `> ${line}`).join('\n');
    const { container } = renderMessages([assistant(`${quoted}\n\n${expenseBlock(100)}`)]);
    expect(keys(container)).toEqual(['expense:0']);
    expect(container.querySelector('[data-proposal="expense:0"]')?.textContent).toBe('100');
    expect(container.querySelector('blockquote pre')?.textContent).toContain('999');
  });

  // Seen red on 2026-11-11: since the keys are derived from the message's list of blocks, a goal
  // block the list did not hold had become code — until then ANY ```goal-proposal was a card.
  it('keeps a goal block inside a quote or behind a list marker a card, keyed after the top-level ones', () => {
    const quoted = GOAL_BLOCK.split('\n').map((line) => `> ${line}`).join('\n');
    const listed = `- ${GOAL_BLOCK.split('\n').join('\n  ')}`;
    const { container } = renderMessages([assistant(`${quoted}\n\n${listed}\n\nE infine:\n\n${GOAL_BLOCK}`, { mode: 'chat' })], 'chat');
    // Document order: the quoted and the listed block first, the top-level one last — which keeps «goal:0».
    expect(keys(container)).toEqual(['goal:1', 'goal:2', 'goal:0']);
    expect(container.querySelector('pre')).toBeNull();
  });

  it('leaves a block that does not parse as code, and still counts it', () => {
    const broken = '```expense-proposal\n{ "kind": "expense", "amount": 103,50 }\n```';
    const { container } = renderMessages([assistant(`${broken}\n\n${expenseBlock(20)}`)]);
    // The second block is still the message's second: its outcome is stored under «expense:1».
    expect(keys(container)).toEqual(['expense:1']);
    expect(container.querySelectorAll('pre')).toHaveLength(1);
  });

  it('renders an expense block as code outside Registra, and the goal card everywhere', () => {
    const { container } = renderMessages([assistant(`${expenseBlock(100)}\n\n${GOAL_BLOCK}`, { mode: 'chat' })], 'chat');
    expect(keys(container)).toEqual(['goal:0']);
    expect(container.querySelector('pre')?.textContent).toContain('"amount":100');
  });

  it('shows the message being streamed as plain text: no card until the stream ends', () => {
    const { container } = renderMessages([assistant(expenseBlock(100), { id: 'local-assistant-1' })], 'register', { streamingMessageId: 'local-assistant-1' });
    expect(keys(container)).toEqual([]);
    expect(container.textContent).toContain('expense-proposal');
  });
});

describe('AssistantStreamingResponse — what the model wrote', () => {
  it('marks every assistant message as generated, with its eyebrow accented, and no user message', () => {
    const user: AssistantMessage = { id: 'u-1', threadId: 'thread-1', userId: 'u1', role: 'user', content: 'ho speso 5 euro', createdAt: new Date(AT.getTime() - 1000), mode: 'register' };
    const { container } = renderMessages([user, assistant('Ecco.'), assistant('Altro.', { id: 'msg-2', createdAt: new Date(AT.getTime() + 1000) })]);
    expect(container.querySelectorAll('[data-generated]')).toHaveLength(2);
    for (const eyebrow of screen.getAllByText('Assistente')) {
      for (const cls of AI_GENERATED_EYEBROW_CLASS.split(' ')) expect(eyebrow.className).toContain(cls);
    }
    for (const cls of AI_GENERATED_EYEBROW_CLASS.split(' ')) expect(screen.getByText('Tu').className).not.toContain(cls);
  });

  it('accents «Rigenera» — it calls the model', () => {
    renderMessages([assistant('Parziale')], 'register', { isInterrupted: true });
    expect(screen.getByRole('button', { name: 'Rigenera' }).className).toContain(AI_CONTROL_ACCENT_CLASS);
  });
});
