/**
 * `AssistantStreamingResponse` — which fenced block of an assistant message becomes which card
 * (2026-11). A card's key is its block's rank among the blocks of its language, read off the
 * markdown's source offsets: the same after a reload. At most five expense cards per message, an
 * expense card in Registra alone, a block inside a quote stays code. The two cards are stubs
 * that print the key they were given: each has its own suite.
 */

import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

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
import { StreamStatusChip } from '@/components/assistant/AssistantConversazioneTile';
import { AI_CONTROL_ACCENT_CLASS, AI_GENERATED_EYEBROW_CLASS } from '@/lib/constants/aiAccent';
import type { AssistantMessage, AssistantRouteReading } from '@/types/assistant';

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

function renderMessages(messages: AssistantMessage[], extra: Partial<Parameters<typeof AssistantStreamingResponse>[0]> = {}) {
  const recordProposal = vi.fn();
  const view = render(
    <AssistantStreamingResponse messages={messages} isInterrupted={false} onRetry={() => {}} threadId="thread-1" recordProposal={recordProposal} changeableMessageId={undefined} onChangeReading={() => {}} {...extra} />,
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
    const { container } = renderMessages([assistant(`${quoted}\n\n${listed}\n\nE infine:\n\n${GOAL_BLOCK}`, { mode: 'chat' })]);
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

  // The cards follow the MESSAGE's mode, never the page's (2026-11-12): in one list a register
  // message's block is a card and a chat message's is code. Seen RED gated on a constant 'chat'.
  it('renders an expense block as a card on a register message and as code on a chat message, in one list', () => {
    const { container } = renderMessages([
      assistant(`${expenseBlock(100)}\n\n${GOAL_BLOCK}`, { id: 'msg-chat', mode: 'chat' }),
      assistant(expenseBlock(20), { id: 'msg-register', mode: 'register', createdAt: new Date(AT.getTime() + 1000) }),
    ]);
    expect(keys(container)).toEqual(['goal:0', 'expense:0']);
    expect(container.querySelector('[data-proposal="expense:0"]')?.textContent).toBe('20');
    const code = container.querySelectorAll('pre');
    expect(code).toHaveLength(1);
    expect(code[0].textContent).toContain('"amount":100');
  });

  // Rewritten 2026-11-25 (owner, phase F): the raw block was on screen while the answer arrived.
  it('shows the message being streamed without its block: no card and no JSON until the stream ends', () => {
    const { container } = renderMessages([assistant(`Ecco la riga.\n\n${expenseBlock(100)}`, { id: 'local-assistant-1' })], { streamingMessageId: 'local-assistant-1' });
    expect(keys(container)).toEqual([]);
    expect(container.textContent).toContain('Ecco la riga.');
    expect(container.textContent).not.toContain('expense-proposal');
    expect(container.textContent).not.toContain('amount');
  });

  it('renders a streaming answer as Markdown already: a heading and a list', () => {
    const { container } = renderMessages([assistant('## Asilo\n\n- Retta 300 €\n- Mensa 80 €', { id: 'local-assistant-1', mode: 'chat' })], { streamingMessageId: 'local-assistant-1' });
    expect(container.querySelector('h2')?.textContent).toBe('Asilo');
    expect(container.querySelector('ul')?.className).toContain('list-disc');
    expect(container.textContent).not.toContain('##');
  });
});

// The line under an answer (2026-11-12): how the message was read, « · cambia» on the last answer
// alone. Seen RED with `changeableMessageId` ignored (a «cambia» under every answer).
describe('AssistantStreamingResponse — «Ho letto: … · cambia»', () => {
  const OCTOBER: AssistantRouteReading = {
    route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false, confidence: 0.9 },
    source: 'router',
  };
  const older = assistant('Prima.', { id: 'msg-1', mode: 'month_analysis', routeReading: OCTOBER });
  const last = assistant('Dopo.', { id: 'msg-2', mode: 'month_analysis', routeReading: OCTOBER, createdAt: new Date(AT.getTime() + 1000) });

  it('reads the line under both answers and offers «cambia» under the last only', async () => {
    const onChangeReading = vi.fn();
    renderMessages([older, last], { changeableMessageId: 'msg-2', onChangeReading });
    const lines = screen.getAllByText(/^Ho letto: analisi di ottobre 2026/);
    expect(lines.map((line) => line.textContent)).toEqual(['Ho letto: analisi di ottobre 2026', 'Ho letto: analisi di ottobre 2026 · cambia']);
    const change = screen.getAllByRole('button', { name: 'Cambia come ho letto la domanda' });
    expect(change).toHaveLength(1);
    expect(lines[1].contains(change[0])).toBe(true);
    // The line is not model text: no accent, no `data-generated` of its own.
    expect(lines[1].closest('[data-generated]')).not.toBeNull();
    expect(lines[1].hasAttribute('data-generated')).toBe(false);
    change[0].click();
    expect(onChangeReading).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-2' }), change[0]);
  });

  it('offers no «cambia» without a changeable message', () => {
    renderMessages([older, last]);
    expect(screen.getAllByText(/^Ho letto:/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Cambia come ho letto la domanda' })).toBeNull();
  });

  it('shows no line on a message without a reading, which keeps «Ricerca web usata»', () => {
    renderMessages([assistant('Vecchia risposta.', { mode: 'chat', webSearchUsed: true })], { changeableMessageId: 'msg-1' });
    expect(screen.queryByText(/^Ho letto:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambia come ho letto la domanda' })).toBeNull();
    expect(screen.getByText('Ricerca web usata')).not.toBeNull();
  });

  it('replaces the badge with the line on a routed message that used the web', () => {
    renderMessages([assistant('Con il web.', { mode: 'chat', webSearchUsed: true, routeReading: { ...OCTOBER, route: { ...OCTOBER.route, intent: 'chat' } } })]);
    expect(screen.getByText('Ho letto: domanda su ottobre 2026 · con ricerca web')).not.toBeNull();
    expect(screen.queryByText('Ricerca web usata')).toBeNull();
  });

  it('shows no line while the message streams', () => {
    renderMessages([assistant('In arrivo', { id: 'local-assistant-1', routeReading: OCTOBER })], { streamingMessageId: 'local-assistant-1', changeableMessageId: 'local-assistant-1' });
    expect(screen.queryByText(/^Ho letto:/)).toBeNull();
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
    renderMessages([assistant('Parziale')], { isInterrupted: true });
    expect(screen.getByRole('button', { name: 'Rigenera' }).className).toContain(AI_CONTROL_ACCENT_CLASS);
  });
});

// The answer's place while no text has arrived (owner, 2026-11-16): a pulsing mark and one phrase
// at a time, from the reading and the server's status; gone at the first chunk.
describe('AssistantStreamingResponse — the wait before the first word', () => {
  const STREAMING = 'local-assistant-1';
  const OCTOBER: AssistantRouteReading = {
    route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false, confidence: 0.9 },
    source: 'router',
  };
  const waiting = (container: HTMLElement) => container.querySelector('[data-assistant-waiting]');

  it('reads the question until the reading arrives, and says so once to a screen reader', () => {
    const { container } = renderMessages([assistant('', { id: STREAMING })], { streamingMessageId: STREAMING });
    expect(waiting(container)?.textContent).toContain('Sto leggendo la domanda…');
    expect(screen.getByText("L'assistente sta preparando la risposta.").className).toContain('sr-only');
  });

  it('turns the phrase every three seconds, from the reading', () => {
    vi.useFakeTimers();
    try {
      const { container } = renderMessages([assistant('', { id: STREAMING, routeReading: OCTOBER })], { streamingMessageId: STREAMING });
      expect(waiting(container)?.textContent).toContain('Apro ottobre 2026…');
      act(() => { vi.advanceTimersByTime(3000); });
      expect(waiting(container)?.textContent).toContain('Confronto entrate e spese…');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says the web while the server searches it', () => {
    const { container } = renderMessages([assistant('', { id: STREAMING, routeReading: OCTOBER })], { streamingMessageId: STREAMING, streamStatus: 'searching' });
    expect(waiting(container)?.textContent).toContain('Sto cercando sul web…');
  });

  it('leaves at the first chunk', () => {
    const { container } = renderMessages([assistant('Ottobre', { id: STREAMING, routeReading: OCTOBER })], { streamingMessageId: STREAMING });
    expect(waiting(container)).toBeNull();
  });
});

describe('StreamStatusChip — the corner of the tile', () => {
  it('shows only the web search', () => {
    const { rerender } = render(<StreamStatusChip isStreaming streamStatus="writing" />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<StreamStatusChip isStreaming streamStatus="searching" />);
    expect(screen.getByRole('status').textContent).toContain('Sto cercando sul web…');
    rerender(<StreamStatusChip isStreaming={false} streamStatus="searching" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

// An answer already begun can stand still for a minute while the server searches the web (owner,
// 2026-11-16): the wait comes back under the text, and leaves when the text resumes.
describe('AssistantStreamingResponse — a pause after the first words', () => {
  const STREAMING = 'local-assistant-1';
  const waiting = (container: HTMLElement) => container.querySelector('[data-assistant-waiting]');

  it('shows the web search under the text while the server searches', () => {
    const { container } = renderMessages([assistant('Cerco il contesto.', { id: STREAMING })], { streamingMessageId: STREAMING, streamStatus: 'searching' });
    expect(screen.getByText(/Cerco il contesto\./)).not.toBeNull();
    expect(waiting(container)?.textContent).toContain('Sto cercando sul web…');
  });

  it('shows nothing under the text while it is being written', () => {
    const { container } = renderMessages([assistant('Cerco il contesto.', { id: STREAMING })], { streamingMessageId: STREAMING, streamStatus: 'writing' });
    expect(waiting(container)).toBeNull();
  });
});

// Generated Markdown is styled by its own renderers (components/ui/markdown-prose.tsx, 2026-11-25):
// the app has no typography plugin, so a `prose` class styled nothing and a list had no bullets.
// Seen RED dropping the `ul` renderer, and (the half-typed fence) rendering `message.content`.
describe('AssistantStreamingResponse — the Markdown of an answer', () => {
  const STREAMING = 'local-assistant-1';

  it('renders a heading, a bulleted and a numbered list with their own classes, and no prose class', () => {
    const { container } = renderMessages([
      assistant('## Titolo\n\n- Asilo 300 €\n- Mensa 80 €\n\n1. Mutuo A\n2. Mutuo B', { mode: 'chat' }),
    ]);
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Titolo');
    expect(heading?.className).toContain('text-[15px]');
    expect(heading?.className).toContain('font-semibold');
    expect(container.querySelector('ul')?.className).toContain('list-disc');
    expect(container.querySelector('ol')?.className).toContain('list-decimal');
    expect(container.querySelector('[class*="prose"]')).toBeNull();
  });

  it('never shows a fence half typed while the answer streams', () => {
    const { container } = renderMessages([assistant('**300 €.**\n\n```assist', { id: STREAMING, mode: 'chat' })], { streamingMessageId: STREAMING, streamStatus: 'writing' });
    expect(container.textContent).toContain('300 €.');
    expect(container.textContent).not.toContain('`');
  });

  it('hides the half-typed tail of an interrupted answer, which never got its server id', () => {
    const { container } = renderMessages([assistant('**300 €.**\n\n```assistant-followups\n["E nel', { id: 'local-assistant-1', mode: 'chat' })]);
    expect(container.textContent).toContain('300 €.');
    expect(container.textContent).not.toContain('`');
    expect(container.textContent).not.toContain('E nel');
  });
});
