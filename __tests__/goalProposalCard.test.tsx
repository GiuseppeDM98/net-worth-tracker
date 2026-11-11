/**
 * `GoalProposalCard` (components/assistant/GoalProposalCard.tsx): since 2026-11 its outcome lives
 * on the message (`proposals["goal:N"]`), like the expense card's — a persisted outcome shows its
 * label and no button, «Conferma» and «Ignora» record and save it — and the labels it always had
 * stay. Invented goal.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { authenticatedFetchMock, toastSuccessMock, toastErrorMock, demoModeMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  demoModeMock: vi.fn(() => false),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: demoModeMock }));
vi.mock('@/lib/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/useGoalData', () => ({ useGoalData: () => ({ data: { goals: [] } }) }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock, error: toastErrorMock } }));

import { GoalProposalCard } from '@/components/assistant/GoalProposalCard';
import { MessageIdProvider } from '@/components/assistant/MessageIdContext';
import { AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import type { GoalProposal } from '@/lib/utils/goalProposal';
import type { AssistantMessage, AssistantProposalState } from '@/types/assistant';

const NOW = new Date('2026-11-01T10:00:00Z');
const PROPOSAL: GoalProposal = { name: 'Acquisto Casa', targetAmount: 200000, targetDateIso: '2032-06-01', priority: 'alta' };

function renderCard(options: { messageId?: string; proposals?: Record<string, AssistantProposalState>; proposal?: GoalProposal; index?: number } = {}) {
  const queryClient = new QueryClient();
  const recordProposal = vi.fn();
  const message: AssistantMessage = {
    id: options.messageId ?? 'msg-1', threadId: 'thread-1', userId: 'owner-1', role: 'assistant', content: '', createdAt: NOW, mode: 'chat',
    ...(options.proposals ? { proposals: options.proposals } : {}),
  };
  const tree = (current: AssistantMessage): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <MessageIdProvider message={current} mode="chat" recordProposal={recordProposal}>
        <GoalProposalCard proposal={options.proposal ?? PROPOSAL} index={options.index ?? 0} />
      </MessageIdProvider>
    </QueryClientProvider>
  );
  const view = render(tree(message));
  recordProposal.mockImplementation((key: string, state: Omit<AssistantProposalState, 'at'>) => {
    view.rerender(tree({ ...message, proposals: { ...message.proposals, [key]: { ...state, at: new Date() } } }));
  });
  return { ...view, recordProposal };
}

/** The two calls of a confirmation: the goal route answers the goal, the message route `ok`. */
function answerRoutes() {
  authenticatedFetchMock.mockImplementation(async (url: string) =>
    url === '/api/goals'
      ? { ok: true, json: async () => ({ goal: { id: 'goal-1' } }) }
      : { ok: true, json: async () => ({}) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  demoModeMock.mockReturnValue(false);
  answerRoutes();
});

describe('GoalProposalCard — the outcome on the message', () => {
  it('is a generated card keyed «goal:N», with 44px buttons that wrap', () => {
    const { container } = renderCard({ index: 2 });
    const root = container.querySelector('[data-proposal]') as HTMLElement;
    expect(root.getAttribute('data-proposal')).toBe('goal:2');
    expect(root.hasAttribute('data-generated')).toBe(true);
    for (const cls of AI_GENERATED_SURFACE_CLASS.split(' ')) expect(root.className).toContain(cls);
    expect(root.style.transform).toContain('translateY(8px)');
    const confirm = screen.getByRole('button', { name: 'Conferma' });
    expect(confirm.className).toContain('h-11');
    expect((confirm.parentElement as HTMLElement).className).toContain('flex-wrap');
    expect(screen.getByText('Proposta di obiettivo')).not.toBeNull();
  });

  it('shows «Obiettivo creato» and no button for a persisted write', () => {
    renderCard({ proposals: { 'goal:0': { status: 'written', writtenIds: ['goal-1'], at: NOW } } });
    expect(screen.getByText('Obiettivo creato')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows «Obiettivo aggiornato» for a persisted update', () => {
    renderCard({ proposal: { ...PROPOSAL, goalId: 'goal-9' }, proposals: { 'goal:0': { status: 'written', writtenIds: ['goal-9'], at: NOW } } });
    expect(screen.getByText('Obiettivo aggiornato')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows «Proposta ignorata» and no button for a persisted dismissal', () => {
    renderCard({ proposals: { 'goal:0': { status: 'ignored', at: NOW } } });
    expect(screen.getByText('Proposta ignorata')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not read another card’s outcome: an expense written on the same message leaves it idle', () => {
    renderCard({ proposals: { 'expense:0': { status: 'written', writtenIds: ['exp-1'], at: NOW } } });
    expect(screen.getByRole('button', { name: 'Conferma' })).not.toBeNull();
  });

  it('«Conferma» writes the goal, then records and saves the outcome with the goal’s id', async () => {
    const user = userEvent.setup();
    const { recordProposal } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() => expect(screen.getByText('Obiettivo creato')).not.toBeNull());
    expect(recordProposal).toHaveBeenCalledWith('goal:0', { status: 'written', writtenIds: ['goal-1'] });
    expect(toastSuccessMock).toHaveBeenCalledWith('Obiettivo "Acquisto Casa" creato');
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    const [goalCall, messageCall] = authenticatedFetchMock.mock.calls;
    expect(goalCall[0]).toBe('/api/goals');
    expect(goalCall[1].method).toBe('POST');
    expect(messageCall[0]).toBe('/api/ai/assistant/threads/thread-1/messages/msg-1');
    expect(JSON.parse(messageCall[1].body)).toEqual({ userId: 'owner-1', key: 'goal:0', status: 'written', writtenIds: ['goal-1'] });
  });

  it('«Ignora» records and saves «ignored», writing no goal', async () => {
    const user = userEvent.setup();
    const { recordProposal } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Ignora' }));

    expect(recordProposal).toHaveBeenCalledWith('goal:0', { status: 'ignored' });
    expect(screen.getByText('Proposta ignorata')).not.toBeNull();
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(authenticatedFetchMock.mock.calls[0][0]).toBe('/api/ai/assistant/threads/thread-1/messages/msg-1');
  });

  it('a failed write toasts the route’s error and records nothing', async () => {
    authenticatedFetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Nome già usato' }) });
    const user = userEvent.setup();
    const { recordProposal } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Nome già usato'));
    expect(recordProposal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Conferma' })).not.toBeNull();
  });

  it('still works on a message that never received its server id: the goal is written, the outcome kept in the session', async () => {
    // The goal card predates the persisted state: an interrupted answer must not take its buttons away.
    authenticatedFetchMock.mockImplementation(async (url: string) =>
      url === '/api/goals' ? { ok: true, json: async () => ({ goal: { id: 'goal-1' } }) } : { ok: false, json: async () => ({}) },
    );
    const user = userEvent.setup();
    renderCard({ messageId: 'local-assistant-1' });
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Obiettivo creato')).not.toBeNull());
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
