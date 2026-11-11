/**
 * `AssistantQuestionBlock` (components/assistant/AssistantQuestionBlock.tsx, 2026-11): the
 * questions the Assistente asks inside a Registra message — ONE card per block, ONE «Rispondi»
 * under the message's last card, the answers sent as one user message, one line each; an entity
 * question picks among the page's own items; an answered or older question is read-only.
 * Invented accounts, houses and questions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const { authenticatedFetchMock, toastErrorMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastErrorMock } }));

import { AssistantQuestionBlock } from '@/components/assistant/AssistantQuestionBlock';
import { MessageIdProvider } from '@/components/assistant/MessageIdContext';
import { MessageQuestionsProvider } from '@/components/assistant/MessageQuestionsContext';
import { RegisterRefsProvider } from '@/components/assistant/RegisterRefsContext';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import { readAssistantQuestionBlocks } from '@/lib/utils/assistantQuestionBlocks';
import { ANSWER_STATE_NOT_SAVED } from '@/lib/utils/dialogNarrative';
import type { ExpenseProposalRefs } from '@/lib/utils/expenseProposal';
import type { Asset } from '@/types/assets';
import type { AssistantMessage, AssistantProposalState } from '@/types/assistant';

const NOW = new Date();
const asset = (id: string, name: string, type: 'cash' | 'realestate'): Asset =>
  ({ id, userId: 'owner-1', name, type, assetClass: type === 'cash' ? 'cash' : 'realestate', quantity: 1000, currentPrice: 1, currency: 'EUR' }) as Asset;

const REFS: ExpenseProposalRefs = {
  categories: [],
  cashAssets: [asset('acc-a', 'Conto A', 'cash'), asset('acc-b', 'Conto B', 'cash'), asset('acc-e', 'Conto E', 'cash')],
  properties: [asset('prop-1', 'Casa ornitorinco', 'realestate')],
  costCenters: [],
  members: [],
  defaults: { debitId: null, creditId: null },
  loans: [],
  feeCategory: null,
  settings: { costCentersEnabled: false, expenseSplitEnabled: false },
};

const question = (id: string, text: string, options: [string, string][]) =>
  JSON.stringify({ id, kind: 'single', text, options: options.map(([value, label]) => ({ value, label })), allowOther: true });
const fence = (body: string) => `\`\`\`assistant-question\n${body}\n\`\`\``;

const TWO_QUESTIONS = [
  'Mi servono due dettagli.',
  fence(question('account:from', 'Da quale conto?', [['acc-a', 'Conto A'], ['acc-b', 'Conto B']])),
  fence(question('abitudine', 'È una spesa abituale?', [['si', 'Sì'], ['no', 'No']])),
].join('\n\n');

interface HostOptions {
  content?: string;
  proposals?: Record<string, AssistantProposalState>;
  answerable?: boolean;
  readFailed?: boolean;
  /** Which block indexes the host renders (as the `pre` interceptor would). */
  render?: number[];
}

function renderBlocks(options: HostOptions = {}) {
  const content = options.content ?? TWO_QUESTIONS;
  const recordProposal = vi.fn();
  const submitAnswer = vi.fn(async () => {});
  const message: AssistantMessage = {
    id: 'msg-1', threadId: 'thread-1', userId: 'owner-1', role: 'assistant', content, createdAt: NOW, mode: 'register',
    ...(options.proposals ? { proposals: options.proposals } : {}),
  };
  const blocks = readAssistantQuestionBlocks(content);
  const tree = (current: AssistantMessage): ReactNode => (
    <RegisterRefsProvider refs={REFS} readFailed={options.readFailed ?? false} submitAnswer={submitAnswer}>
      <MessageIdProvider message={current} mode="register" recordProposal={recordProposal}>
        <MessageQuestionsProvider blocks={blocks} answerable={options.answerable ?? true}>
          {(options.render ?? blocks.map((block) => block.index)).map((index) => (
            <div key={index} data-testid={`block-${index}`}>
              <AssistantQuestionBlock index={index} codeBlock={<pre data-testid={`code-${index}`}>codice</pre>} />
            </div>
          ))}
        </MessageQuestionsProvider>
      </MessageIdProvider>
    </RegisterRefsProvider>
  );
  const view = render(tree(message));
  // What the page does on `recordProposal`: the state lands on the message, which re-renders.
  let current = message;
  recordProposal.mockImplementation((key: string, state: Omit<AssistantProposalState, 'at'>) => {
    current = { ...current, proposals: { ...current.proposals, [key]: { ...state, at: new Date() } } };
    view.rerender(tree(current));
  });
  return { ...view, recordProposal, submitAnswer };
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetchMock.mockResolvedValue({ ok: true });
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.releasePointerCapture ??= () => undefined;
  HTMLElement.prototype.scrollIntoView ??= () => undefined;
});

describe('AssistantQuestionBlock — the cards and the one «Rispondi»', () => {
  it('draws ONE «Rispondi», under the last card, closed until every card has an answer', async () => {
    const user = userEvent.setup();
    renderBlocks();
    expect(screen.getAllByText("L'Assistente chiede")).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Rispondi' })).toHaveLength(1);
    const respond = screen.getByRole('button', { name: 'Rispondi' });
    expect(screen.getByTestId('block-1').contains(respond)).toBe(true);
    expect(respond.className).toContain('h-11');
    for (const cls of AI_CONTROL_ACCENT_CLASS.split(' ')) expect(respond.className).toContain(cls);
    expect((respond as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Conto B' }));
    expect((respond as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Sì' }));
    expect((respond as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers no «Preferisco non dire» on an entity question, and keeps it on another', () => {
    renderBlocks();
    expect(within(screen.getByTestId('block-0')).queryByRole('radio', { name: 'Preferisco non dire' })).toBeNull();
    expect(within(screen.getByTestId('block-0')).getByRole('radio', { name: 'Altro…' })).not.toBeNull();
    expect(within(screen.getByTestId('block-1')).getByRole('radio', { name: 'Preferisco non dire' })).not.toBeNull();
  });

  it('lists the accounts and the houses behind «Altro…» on a transfer end', async () => {
    const user = userEvent.setup();
    renderBlocks();
    await user.click(screen.getAllByRole('radio', { name: 'Altro…' })[0]);
    const trigger = screen.getByRole('combobox', { name: 'Scegli fra tutti i conti' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(options).toEqual(['Conto A', 'Conto B', 'Conto E', 'Casa ornitorinco (immobile)']);
  });

  it('records every answer, saves each, then sends ONE message with one line per question', async () => {
    const user = userEvent.setup();
    const { recordProposal, submitAnswer } = renderBlocks();
    await user.click(screen.getAllByRole('radio', { name: 'Altro…' })[0]);
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Scegli fra tutti i conti' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    const pick = await screen.findByRole('option', { name: 'Conto E' });
    pick.focus();
    fireEvent.keyDown(pick, { key: 'Enter' });
    await user.click(screen.getByRole('radio', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Rispondi' }));

    await waitFor(() => expect(submitAnswer).toHaveBeenCalledTimes(1));
    expect(submitAnswer).toHaveBeenCalledWith('Da quale conto? → Conto E [acc-e]\nÈ una spesa abituale? → No');
    expect(recordProposal.mock.calls).toEqual([
      ['question:0', { status: 'answered', answer: 'Conto E' }],
      ['question:1', { status: 'answered', answer: 'No' }],
    ]);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({ userId: 'owner-1', key: 'question:0', status: 'answered', answer: 'Conto E' });
    // The saves come before the message; the focus lands on the first answer line.
    expect(authenticatedFetchMock.mock.invocationCallOrder[1]).toBeLessThan(submitAnswer.mock.invocationCallOrder[0]);
    expect(document.activeElement?.textContent).toBe('Risposta: Conto E');
    expect(screen.queryByRole('button', { name: 'Rispondi' })).toBeNull();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('says ONCE that the answers were not saved, and still sends them', async () => {
    const user = userEvent.setup();
    authenticatedFetchMock.mockResolvedValue({ ok: false });
    const { submitAnswer } = renderBlocks();
    await user.click(screen.getByRole('radio', { name: 'Conto A' }));
    await user.click(screen.getByRole('radio', { name: 'Sì' }));
    await user.click(screen.getByRole('button', { name: 'Rispondi' }));
    await waitFor(() => expect(submitAnswer).toHaveBeenCalledTimes(1));
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(ANSWER_STATE_NOT_SAVED);
  });
});

describe('AssistantQuestionBlock — read-only and fallbacks', () => {
  it('reads an answered question back after a reload, with no rows and no button', () => {
    renderBlocks({ proposals: { 'question:0': { status: 'answered', answer: 'Conto B', at: NOW }, 'question:1': { status: 'answered', answer: 'Sì', at: NOW } } });
    expect(screen.getByText('Risposta: Conto B')).not.toBeNull();
    expect(screen.getByText('Risposta: Sì')).not.toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says «Non risposta qui» on a message that may no longer be answered', () => {
    renderBlocks({ answerable: false });
    expect(screen.getAllByText('Non risposta qui')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Rispondi' })).toBeNull();
  });

  it('gives a broken block back as code, a block past the cap as nothing, and a block outside Registra as code', () => {
    const content = [
      fence(question('account:to', 'A quale conto?', [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']])),
      fence(question('q2', 'Seconda?', [['a', 'A'], ['b', 'B']])),
      fence(question('q3', 'Terza?', [['a', 'A'], ['b', 'B']])),
    ].join('\n\n');
    renderBlocks({ content, render: [0, 1, 2, 7] });
    expect(screen.getByTestId('code-0')).not.toBeNull();
    expect(screen.getByText('Seconda?')).not.toBeNull();
    expect(screen.getByTestId('block-2').textContent).toBe('');
    expect(screen.getByTestId('code-7')).not.toBeNull();
    // The one valid card carries the «Rispondi».
    expect(within(screen.getByTestId('block-1')).getByRole('button', { name: 'Rispondi' })).not.toBeNull();
  });

  it('turns «Altro…» into free text when the reads failed', async () => {
    const user = userEvent.setup();
    renderBlocks({ readFailed: true });
    await user.click(screen.getAllByRole('radio', { name: 'Altro…' })[0]);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('textbox')).not.toBeNull();
  });
});
