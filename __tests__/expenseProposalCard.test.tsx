/**
 * `ExpenseProposalCard` (components/assistant/ExpenseProposalCard.tsx, 2026-11): the row the
 * Assistente proposed, printed as the feed prints it, under the AI accent; «Conferma» writes it
 * through the expense services ONCE and records the outcome on the message; a problem closes
 * «Conferma», a local message offers no button. Invented categories, accounts and figures.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const {
  createExpenseSettledOnDateMock, applyDebtRepaymentsMock, applyBalanceEffectsMock, authenticatedFetchMock,
  toastSuccessMock, toastErrorMock, demoModeMock, dialogPropsMock,
  createCategoryMock, updateCategoryMock, getCategoryByIdMock, ensureTransferCategoryMock,
} = vi.hoisted(() => ({
  createCategoryMock: vi.fn(),
  updateCategoryMock: vi.fn(),
  getCategoryByIdMock: vi.fn(),
  ensureTransferCategoryMock: vi.fn(),
  createExpenseSettledOnDateMock: vi.fn(),
  applyDebtRepaymentsMock: vi.fn(),
  applyBalanceEffectsMock: vi.fn(),
  authenticatedFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  demoModeMock: vi.fn(() => false),
  dialogPropsMock: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: demoModeMock }));
vi.mock('@/lib/services/expenseService', () => ({ createExpenseSettledOnDate: createExpenseSettledOnDateMock }));
vi.mock('@/lib/services/expenseCategoryService', () => ({
  createCategory: createCategoryMock,
  updateCategory: updateCategoryMock,
  getCategoryById: getCategoryByIdMock,
  ensureTransferCategory: ensureTransferCategoryMock,
  newSubCategoryId: () => '1700000000000-abc123def',
}));
vi.mock('@/lib/services/debtRepaymentService', () => ({ applyDebtRepayments: applyDebtRepaymentsMock }));
vi.mock('@/lib/services/cashBalanceReconciliation', () => ({ applyBalanceEffects: applyBalanceEffectsMock }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock, error: toastErrorMock } }));
// The form itself has its own suite: here it is the props «Modifica» hands it.
vi.mock('@/components/expenses/ExpenseDialog', () => ({
  ExpenseDialog: (props: { onSuccess: (saved: { id: string; row: { date: Date } } | null) => void; onClose: () => void }) => {
    dialogPropsMock(props);
    // The form saves the row on 20 September 2026 (noon: the same Italian day in every zone),
    // whatever date the proposal carried — the user moved it.
    return (
      <div role="dialog" aria-label="Modulo spesa">
        <button type="button" onClick={() => { props.onSuccess({ id: 'exp-edited', row: { date: new Date(2026, 8, 20, 12) } }); props.onClose(); }}>Salva nel modulo</button>
      </div>
    );
  },
}));

import { ExpenseProposalCard } from '@/components/assistant/ExpenseProposalCard';
import { MessageIdProvider } from '@/components/assistant/MessageIdContext';
import { MessageQuestionsProvider } from '@/components/assistant/MessageQuestionsContext';
import { RegisterRefsProvider } from '@/components/assistant/RegisterRefsContext';
import { AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { queryKeys } from '@/lib/query/queryKeys';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { PROPOSAL_INTERRUPTED_LINE, PROPOSAL_NO_ACCOUNT_LABEL, type ExpenseProposal, type ExpenseProposalRefs } from '@/lib/utils/expenseProposal';
import { EXPENSE_FEE_NEEDS_CATEGORY, PROPOSAL_STATE_NOT_SAVED } from '@/lib/utils/dialogNarrative';
import type { Asset } from '@/types/assets';
import type { AssistantMessage, AssistantProposalState } from '@/types/assistant';
import type { ExpenseCategory } from '@/types/expenses';

const NOW = new Date();
const TODAY_ISO = getItalyDateIso(NOW);

function category(id: string, name: string, type: ExpenseCategory['type'], subs: [string, string][] = []): ExpenseCategory {
  return { id, userId: 'owner-1', name, type, subCategories: subs.map(([subId, subName]) => ({ id: subId, name: subName })), createdAt: NOW, updatedAt: NOW } as ExpenseCategory;
}

const REFS: ExpenseProposalRefs = {
  categories: [category('cat-cibo', 'Cibo', 'variable', [['sub-spesa', 'Spesa']]), category('cat-stipendio', 'Stipendio', 'income')],
  cashAssets: [{ id: 'acc-main', userId: 'owner-1', name: 'Conto principale', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' } as Asset],
  properties: [],
  costCenters: [],
  members: [],
  defaults: { debitId: 'acc-main', creditId: 'acc-main' },
  loans: [],
  feeCategory: null,
  settings: { costCentersEnabled: false, expenseSplitEnabled: false },
};

function proposal(overrides: Partial<ExpenseProposal> = {}): ExpenseProposal {
  return {
    kind: 'expense', type: 'variable', amount: 103, dateIso: TODAY_ISO, categoryId: 'cat-cibo', subCategoryId: 'sub-spesa',
    reason: 'Come le ultime spese al supermercato.',
    ...overrides,
  };
}

interface HostOptions {
  messageId?: string;
  proposals?: Record<string, AssistantProposalState>;
  readFailed?: boolean;
  index?: number;
  refs?: Partial<ExpenseProposalRefs>;
  /** The message also holds a valid question block (the contract forbids it; the card waits). */
  withQuestion?: boolean;
}

const QUESTION_BLOCK = { index: 0, kept: true, problems: [], question: { id: 'account:debit', kind: 'single' as const, text: 'Da quale conto?', options: [{ value: 'acc-main', label: 'Conto principale' }, { value: 'acc-b', label: 'Conto B' }], allowOther: true } };

/** The card under the two contexts the page gives it, the message holding its outcomes as the stream buffer does. */
function renderCard(p: ExpenseProposal, options: HostOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const recordProposal = vi.fn();
  const message: AssistantMessage = {
    id: options.messageId ?? 'msg-1', threadId: 'thread-1', userId: 'owner-1', role: 'assistant', content: '', createdAt: NOW, mode: 'register',
    ...(options.proposals ? { proposals: options.proposals } : {}),
  };
  const tree = (current: AssistantMessage): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <RegisterRefsProvider refs={{ ...REFS, ...options.refs }} readFailed={options.readFailed ?? false} submitAnswer={async () => {}}>
        <MessageIdProvider message={current} mode="register" recordProposal={recordProposal}>
          <MessageQuestionsProvider blocks={options.withQuestion ? [QUESTION_BLOCK] : []} answerable>
            <ExpenseProposalCard proposal={p} index={options.index ?? 0} />
          </MessageQuestionsProvider>
        </MessageIdProvider>
      </RegisterRefsProvider>
    </QueryClientProvider>
  );
  const view = render(tree(message));
  // What the page does on `recordProposal`: the outcome lands on the message and the card re-renders.
  recordProposal.mockImplementation((key: string, state: Omit<AssistantProposalState, 'at'>) => {
    view.rerender(tree({ ...message, proposals: { ...message.proposals, [key]: { ...state, at: new Date() } } }));
  });
  return { ...view, recordProposal, invalidate };
}

const card = (container: HTMLElement) => container.querySelector('[data-proposal]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  demoModeMock.mockReturnValue(false);
  createExpenseSettledOnDateMock.mockResolvedValue({ ids: ['exp-1'], parents: [], appliedEffects: ['effect'], appliedDebtRows: ['debt-row'] });
  applyDebtRepaymentsMock.mockResolvedValue(undefined);
  applyBalanceEffectsMock.mockResolvedValue(undefined);
  authenticatedFetchMock.mockResolvedValue({ ok: true });
});

describe('ExpenseProposalCard — the row', () => {
  it('prints the row as the feed does, the reason under it, on the generated surface', () => {
    const { container } = renderCard(proposal());
    const root = card(container);
    expect(root.getAttribute('data-proposal')).toBe('expense:0');
    expect(root.hasAttribute('data-generated')).toBe(true);
    for (const cls of ['not-prose', 'rounded-xl', ...AI_GENERATED_SURFACE_CLASS.split(' ')]) expect(root.className).toContain(cls);
    const eyebrow = screen.getByText("L'Assistente propone");
    for (const cls of AI_GENERATED_EYEBROW_CLASS.split(' ')) expect(eyebrow.className).toContain(cls);
    expect(root.textContent?.replace(/ /g, ' ')).toContain('Spesa · 103,00 € · Cibo › Spesa · oggi · Conto principale');
    expect(screen.getByText('Come le ultime spese al supermercato.').className).toContain('text-[13px]');
  });

  it('enters with the question card’s motion: a translate of 8px and nothing else', () => {
    const { container } = renderCard(proposal());
    // The first frame of `cardEnterVariants.enter` — a plain div would carry no transform.
    expect(card(container).style.transform).toContain('translateY(8px)');
    expect(card(container).style.opacity).toBe('');
  });

  it('offers three 44px buttons that wrap', () => {
    renderCard(proposal());
    const buttons = ['Conferma', 'Modifica', 'Ignora'].map((name) => screen.getByRole('button', { name }));
    for (const button of buttons) {
      expect(button.className).toContain('h-11');
      expect(button.className).toContain('desktop:h-9');
      expect((button as HTMLButtonElement).disabled).toBe(false);
    }
    const row = buttons[0].parentElement as HTMLElement;
    expect(row.className).toContain('flex-wrap');
    expect(row.className).toContain('gap-2');
  });

  it('keeps the card of a later block under its own key', () => {
    const { container } = renderCard(proposal(), { index: 3 });
    expect(card(container).getAttribute('data-proposal')).toBe('expense:3');
  });

  it('prints the note, the «fuori budget» chip and when a future row moves its account', () => {
    renderCard(proposal({ note: 'Supermercato', excludeFromBudget: true, dateIso: '2099-01-15' }));
    expect(screen.getByText('«Supermercato»')).not.toBeNull();
    expect(screen.getByText('fuori budget')).not.toBeNull();
    expect(screen.getByText('si applica al saldo il 15/01/2099')).not.toBeNull();
  });

  it('says a row with no account moves no balance', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <RegisterRefsProvider refs={{ ...REFS, defaults: { debitId: null, creditId: null } }} readFailed={false} submitAnswer={async () => {}}>
          <MessageIdProvider message={{ id: 'msg-1', threadId: 'thread-1', userId: 'owner-1', role: 'assistant', content: '', createdAt: NOW, mode: 'register' }} mode="register" recordProposal={() => {}}>
            <ExpenseProposalCard proposal={proposal()} index={0} />
          </MessageIdProvider>
        </RegisterRefsProvider>
      </QueryClientProvider>,
    );
    expect(card(container).textContent).toContain(PROPOSAL_NO_ACCOUNT_LABEL);
  });
});

describe('ExpenseProposalCard — what closes the buttons', () => {
  it('names a problem and closes «Conferma», leaving «Modifica» and «Ignora»', () => {
    renderCard(proposal({ categoryId: 'cat-nope', subCategoryId: undefined }));
    expect(screen.getByText('La categoria proposta non esiste più.')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Modifica' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Ignora' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lists what it dropped and stays confirmable', () => {
    renderCard(proposal({ kind: 'income', type: 'income', categoryId: 'cat-stipendio', subCategoryId: undefined, excludeFromBudget: true }));
    expect(screen.getByText('ignorato: fuori budget')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows «Registrata» with the link to the row’s month and to the row itself, and no button, for a persisted outcome', () => {
    renderCard(proposal({ dateIso: '2026-10-15' }), { proposals: { 'expense:0': { status: 'written', writtenIds: ['exp-1'], at: NOW } } });
    expect(screen.getByText('Registrata')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'apri in Cashflow' }).getAttribute('href')).toBe('/dashboard/cashflow?tab=tracking&month=2026-10&row=exp-1');
    expect(screen.queryByRole('button')).toBeNull();
  });

  // Seen red on 2026-11-11 with the link built from the proposal's date alone: it opened October,
  // where `?row=` finds nothing.
  it('links the month the row was SAVED in when «Modifica» moved its date, not the proposal’s', () => {
    renderCard(proposal({ dateIso: '2026-10-15' }), { proposals: { 'expense:0': { status: 'written', writtenIds: ['exp-1'], month: '2026-09', at: NOW } } });
    expect(screen.getByRole('link', { name: 'apri in Cashflow' }).getAttribute('href')).toBe('/dashboard/cashflow?tab=tracking&month=2026-09&row=exp-1');
  });

  it('shows «Ignorata» and no button for an ignored proposal, and reads only its own key', () => {
    renderCard(proposal(), { proposals: { 'expense:0': { status: 'ignored', at: NOW } } });
    expect(screen.getByText('Ignorata')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is idle when the outcome on the message is another card’s', () => {
    renderCard(proposal(), { index: 1, proposals: { 'expense:0': { status: 'written', writtenIds: ['exp-1'], at: NOW } } });
    expect(screen.getByRole('button', { name: 'Conferma' })).not.toBeNull();
  });

  it('offers no button on a message that never received its server id', () => {
    renderCard(proposal(), { messageId: 'local-assistant-1' });
    expect(screen.getByText(PROPOSAL_INTERRUPTED_LINE)).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('writes nothing on failed reads: «Conferma» and «Modifica» closed, the reason said', () => {
    renderCard(proposal(), { readFailed: true });
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Modifica' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Categorie e conti non sono stati letti/)).not.toBeNull();
  });

  it('closes «Conferma» in the demo and says why to a screen reader', () => {
    demoModeMock.mockReturnValue(true);
    renderCard(proposal());
    const confirm = screen.getByRole('button', { name: 'Conferma — non disponibile in modalità demo' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});

describe('ExpenseProposalCard — «Conferma»', () => {
  it('writes through the three services in the form’s order, records, toasts, invalidates the four keys and saves the outcome', async () => {
    const user = userEvent.setup();
    const { recordProposal, invalidate } = renderCard(proposal());
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(createExpenseSettledOnDateMock).toHaveBeenCalledTimes(1);
    const [ownerId, form, categoryName, subCategoryName, now] = createExpenseSettledOnDateMock.mock.calls[0];
    expect(ownerId).toBe('owner-1');
    expect(form).toMatchObject({ type: 'variable', amount: 103, categoryId: 'cat-cibo', subCategoryId: 'sub-spesa', linkedCashAssetId: 'acc-main' });
    expect(getItalyDateIso(form.date)).toBe(TODAY_ISO);
    expect([categoryName, subCategoryName]).toEqual(['Cibo', 'Spesa']);
    expect(now).toBeInstanceOf(Date);
    expect(applyDebtRepaymentsMock).toHaveBeenCalledWith(['debt-row']);
    expect(applyBalanceEffectsMock).toHaveBeenCalledWith(['effect']);
    expect(createExpenseSettledOnDateMock.mock.invocationCallOrder[0]).toBeLessThan(applyDebtRepaymentsMock.mock.invocationCallOrder[0]);
    expect(applyDebtRepaymentsMock.mock.invocationCallOrder[0]).toBeLessThan(applyBalanceEffectsMock.mock.invocationCallOrder[0]);

    expect(recordProposal).toHaveBeenCalledWith('expense:0', { status: 'written', writtenIds: ['exp-1'] });
    expect(toastSuccessMock).toHaveBeenCalledWith('Spesa creata con successo');
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.expenses.all('owner-1'), queryKeys.assets.all('owner-1'), queryKeys.dashboard.overview('owner-1'), queryKeys.costCenters.all('owner-1'),
    ]);

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = authenticatedFetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/assistant/threads/thread-1/messages/msg-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ userId: 'owner-1', key: 'expense:0', status: 'written', writtenIds: ['exp-1'] });
    expect(screen.queryByRole('button')).toBeNull();
    // The focus follows the buttons to the line that replaced them.
    expect(document.activeElement?.textContent).toContain('Registrata');
  });

  it('toasts «Entrata creata con successo» for an income', async () => {
    const user = userEvent.setup();
    renderCard(proposal({ kind: 'income', type: 'income', categoryId: 'cat-stipendio', subCategoryId: undefined, amount: 2000 }));
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Entrata creata con successo'));
  });

  it('writes ONE row on a double click: the first click closes the button', async () => {
    let release: (value: unknown) => void = () => {};
    createExpenseSettledOnDateMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const user = userEvent.setup();
    renderCard(proposal());
    const confirm = screen.getByRole('button', { name: 'Conferma' });
    await user.dblClick(confirm);

    expect(createExpenseSettledOnDateMock).toHaveBeenCalledTimes(1);
    const saving = screen.getByRole('button', { name: 'Registrazione…' }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Modifica' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ignora' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      release({ ids: ['exp-1'], parents: [], appliedEffects: [], appliedDebtRows: [] });
    });
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(createExpenseSettledOnDateMock).toHaveBeenCalledTimes(1);
  });

  it('says the write failed, records nothing and gives the buttons back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createExpenseSettledOnDateMock.mockRejectedValue(new Error('permission-denied'));
    const user = userEvent.setup();
    const { recordProposal } = renderCard(proposal());
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull());
    expect(recordProposal).not.toHaveBeenCalled();
    expect(authenticatedFetchMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('warns when the row is written but its outcome could not be saved', async () => {
    authenticatedFetchMock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    renderCard(proposal());
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(PROPOSAL_STATE_NOT_SAVED));
    expect(screen.getByText('Registrata')).not.toBeNull();
  });
});

describe('ExpenseProposalCard — «Ignora» and «Modifica»', () => {
  it('records and saves «ignored», writing no row', async () => {
    const user = userEvent.setup();
    const { recordProposal } = renderCard(proposal());
    await user.click(screen.getByRole('button', { name: 'Ignora' }));

    expect(recordProposal).toHaveBeenCalledWith('expense:0', { status: 'ignored' });
    expect(createExpenseSettledOnDateMock).not.toHaveBeenCalled();
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({ userId: 'owner-1', key: 'expense:0', status: 'ignored' });
    expect(screen.getByText('Ignorata')).not.toBeNull();
    // A failed save of an ignored card is silent: nothing was written.
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('opens the form on the proposal’s values and remembers the row the form saved', async () => {
    const user = userEvent.setup();
    const { recordProposal, invalidate } = renderCard(proposal());
    await user.click(screen.getByRole('button', { name: 'Modifica' }));

    const dialog = await screen.findByRole('dialog', { name: 'Modulo spesa' });
    expect(dialog).not.toBeNull();
    const props = dialogPropsMock.mock.calls.at(-1)?.[0];
    expect(props.open).toBe(true);
    expect(props.initialValues).toMatchObject({ type: 'variable', amount: 103, categoryId: 'cat-cibo', subCategoryId: 'sub-spesa', linkedCashAssetId: 'acc-main' });
    expect(props.returnFocusTo.current).toBe(screen.getByRole('button', { name: 'Modifica' }));

    await user.click(screen.getByRole('button', { name: 'Salva nel modulo' }));
    // The outcome carries the Italian month of the row AS SAVED: the form may have moved the date.
    expect(recordProposal).toHaveBeenCalledWith('expense:0', { status: 'written', writtenIds: ['exp-edited'], month: '2026-09' });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([queryKeys.expenses.all('owner-1')]);
    // The form wrote the row and its balances itself: the card's services stay untouched.
    expect(createExpenseSettledOnDateMock).not.toHaveBeenCalled();
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toMatchObject({ key: 'expense:0', status: 'written', writtenIds: ['exp-edited'], month: '2026-09' });
    // The form wrote it, maybe changed: the card says so.
    expect(screen.getByText('registrata da Modifica')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'apri in Cashflow' }).getAttribute('href')).toBe('/dashboard/cashflow?tab=tracking&month=2026-09&row=exp-edited');
  });
});

// ── The four kinds, the categories written first, the counts (2026-11) ──

const ACCOUNT_B = { id: 'acc-b', userId: 'owner-1', name: 'Conto B', type: 'cash', assetClass: 'cash', quantity: 500, currentPrice: 1, currency: 'EUR' } as Asset;
const LOAN = { id: 'loan-1', userId: 'owner-1', name: 'Mutuo ornitorinco', type: 'loan', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR', debtInterestRate: 1.2 } as Asset;
const FEE_CATEGORY = { categoryId: 'cat-banca', categoryName: 'Banca', type: 'fixed' as const };
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

describe('ExpenseProposalCard — transfers, instalments, series', () => {
  it('writes a transfer between two accounts under the transfers’ category', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(
      proposal({ kind: 'transfer', type: 'transfer', categoryId: undefined, subCategoryId: undefined, fromAccount: 'acc-main', toAccount: 'conto b', amount: 500 }),
      { refs: { cashAssets: [...REFS.cashAssets, ACCOUNT_B], categories: [...REFS.categories, category('cat-trasf', 'Trasferimenti', 'transfer')] } },
    );
    expect(flat(card(container).textContent)).toContain('Trasferimento · 500,00 € · Trasferimenti · oggi · Conto principale → Conto B');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    const [, form, categoryName, , , fee] = createExpenseSettledOnDateMock.mock.calls[0];
    expect(form).toMatchObject({ type: 'transfer', categoryId: 'cat-trasf', linkedCashAssetId: 'acc-main', transferCashAssetId: 'acc-b' });
    expect(categoryName).toBe('Trasferimenti');
    expect(fee).toBeUndefined();
    expect(toastSuccessMock).toHaveBeenCalledWith('Trasferimento creato con successo');
  });

  it('writes an instalment on its loan, printing the split', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(
      proposal({ kind: 'debt', type: 'debt', categoryId: 'cat-mutuo', subCategoryId: undefined, loanName: 'mutuo', amount: 12.34 }),
      { refs: { loans: [LOAN], categories: [...REFS.categories, category('cat-mutuo', 'Mutuo', 'debt')] } },
    );
    const text = flat(card(container).textContent);
    expect(text).toContain('11,34 €');
    expect(text).toContain('1,00 €');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(createExpenseSettledOnDateMock.mock.calls[0][1]).toMatchObject({ type: 'debt', debtAssetId: 'loan-1', linkedCashAssetId: 'acc-main' });
    expect(applyDebtRepaymentsMock).toHaveBeenCalledWith(['debt-row']);
    expect(toastSuccessMock).toHaveBeenCalledWith('Rata creata con successo');
  });

  it('writes a series with its fee in one call and counts parents and fees', async () => {
    const user = userEvent.setup();
    const ids = [...Array.from({ length: 12 }, (_, i) => `row-${i}`), ...Array.from({ length: 12 }, (_, i) => `fee-${i}`)];
    createExpenseSettledOnDateMock.mockResolvedValue({ ids, parents: ids.slice(0, 12).map((id) => ({ id })), appliedEffects: [], appliedDebtRows: [] });
    const { container, recordProposal } = renderCard(
      proposal({ recurring: { frequency: 'monthly', count: 12 }, fee: { amount: 1.5 }, note: 'Abbonamento' }),
      { refs: { feeCategory: FEE_CATEGORY } },
    );
    expect(flat(card(container).textContent)).toContain('12 occorrenze mensili, dal');
    expect(flat(card(container).textContent)).toContain('commissione 1,50 € su ogni occorrenza');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('12 righe registrate')).not.toBeNull());
    expect(screen.getByText('+ 12 commissioni')).not.toBeNull();
    expect(createExpenseSettledOnDateMock).toHaveBeenCalledTimes(1);
    const [, form, , , , fee] = createExpenseSettledOnDateMock.mock.calls[0];
    expect(form).toMatchObject({ isRecurring: true, recurringFrequency: 'monthly', recurringCount: 12 });
    expect(fee).toEqual({ amount: 1.5, category: FEE_CATEGORY, notes: 'Commissione su Abbonamento' });
    expect(recordProposal).toHaveBeenCalledWith('expense:0', { status: 'written', writtenIds: ids });
    expect(toastSuccessMock).toHaveBeenCalledWith('12 voci ricorrenti con commissione create con successo');
  });

  it('opens «Modifica» on a series with its fee', async () => {
    const user = userEvent.setup();
    renderCard(proposal({ recurring: { frequency: 'monthly', count: 6, day: 5 }, fee: { amount: 2 } }), { refs: { feeCategory: FEE_CATEGORY } });
    await user.click(screen.getByRole('button', { name: 'Modifica' }));
    await screen.findByRole('dialog', { name: 'Modulo spesa' });
    expect(dialogPropsMock.mock.calls.at(-1)?.[0].initialValues).toMatchObject({ isRecurring: true, recurringFrequency: 'monthly', recurringCount: 6, recurringDay: 5, fee: 2 });
  });
});

describe('ExpenseProposalCard — what the card refuses', () => {
  it('names the missing fee category with the door to Impostazioni, and closes «Conferma»', () => {
    renderCard(proposal({ fee: { amount: 2 } }));
    const link = screen.getByRole('link', { name: 'Impostazioni › Spese' });
    expect(link.getAttribute('href')).toBe('/dashboard/settings?tab=spese');
    expect(link.closest('li')?.textContent).toContain(EXPENSE_FEE_NEEDS_CATEGORY);
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the failed read, never «conto sconosciuto»', () => {
    renderCard(proposal({ kind: 'transfer', type: 'transfer', categoryId: undefined, subCategoryId: undefined, fromAccount: 'acc-main', toAccount: 'Conto ignoto' }), { readFailed: true, refs: { cashAssets: [] } });
    expect(screen.getByText('Registra · lettura fallita')).not.toBeNull();
    expect(screen.queryByText(/conto sconosciuto/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says an account with no category has none — not a failed read', () => {
    renderCard(proposal(), { refs: { categories: [] } });
    expect(screen.getByText('nessuna categoria configurata')).not.toBeNull();
    expect(screen.queryByText('Registra · lettura fallita')).toBeNull();
  });

  it('waits for the answer when its message also asks a question', () => {
    renderCard(proposal(), { withQuestion: true });
    expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Rispondi prima alla domanda')).not.toBeNull();
  });
});

describe('ExpenseProposalCard — the categories written before the row', () => {
  it('creates a new category bare, invalidates the categories, then writes the row on its id', async () => {
    const user = userEvent.setup();
    createCategoryMock.mockResolvedValue('cat-new');
    const { invalidate } = renderCard(proposal({ categoryId: undefined, subCategoryId: undefined, newCategory: { name: 'Ceramica', type: 'variable' } }));
    expect(screen.getByText(/Nuova categoria: Ceramica \(Spese Non Necessarie\)/)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(createCategoryMock).toHaveBeenCalledWith('owner-1', { name: 'Ceramica', type: 'variable', subCategories: [] });
    expect(createCategoryMock.mock.invocationCallOrder[0]).toBeLessThan(createExpenseSettledOnDateMock.mock.invocationCallOrder[0]);
    expect(createExpenseSettledOnDateMock.mock.calls[0][1]).toMatchObject({ categoryId: 'cat-new' });
    expect(createExpenseSettledOnDateMock.mock.calls[0][2]).toBe('Ceramica');
    expect(invalidate.mock.calls[0][0]?.queryKey).toEqual(queryKeys.expenses.categories('owner-1'));
  });

  it('appends a new subcategory to a FRESH read of its category, with no cascade', async () => {
    const user = userEvent.setup();
    // Another tab added «Pane» since the page read the categories.
    getCategoryByIdMock.mockResolvedValue(category('cat-cibo', 'Cibo', 'variable', [['sub-spesa', 'Spesa'], ['sub-pane', 'Pane']]));
    renderCard(proposal({ subCategoryId: undefined, newSubCategory: { categoryId: 'cat-cibo', name: 'Mercato' } }));
    expect(screen.getByText(/Nuova sottocategoria: Cibo › Mercato/)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(updateCategoryMock).toHaveBeenCalledTimes(1);
    expect(updateCategoryMock.mock.calls[0]).toEqual([
      'cat-cibo',
      { subCategories: [{ id: 'sub-spesa', name: 'Spesa' }, { id: 'sub-pane', name: 'Pane' }, { id: '1700000000000-abc123def', name: 'Mercato' }] },
    ]);
    expect(updateCategoryMock.mock.invocationCallOrder[0]).toBeLessThan(createExpenseSettledOnDateMock.mock.invocationCallOrder[0]);
    expect(createExpenseSettledOnDateMock.mock.calls[0][1]).toMatchObject({ categoryId: 'cat-cibo', subCategoryId: '1700000000000-abc123def' });
    expect(createExpenseSettledOnDateMock.mock.calls[0][3]).toBe('Mercato');
  });

  it('creates the transfers’ category when there is none', async () => {
    const user = userEvent.setup();
    ensureTransferCategoryMock.mockResolvedValue('cat-trasf-new');
    renderCard(
      proposal({ kind: 'transfer', type: 'transfer', categoryId: undefined, subCategoryId: undefined, fromAccount: 'acc-main', toAccount: 'acc-b', amount: 50 }),
      { refs: { cashAssets: [...REFS.cashAssets, ACCOUNT_B] } },
    );
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(ensureTransferCategoryMock).toHaveBeenCalledWith('owner-1');
    expect(createExpenseSettledOnDateMock.mock.calls[0][1]).toMatchObject({ categoryId: 'cat-trasf-new' });
  });

  it('keeps a category written for a row that then failed, and the retry writes no second one', async () => {
    const user = userEvent.setup();
    createCategoryMock.mockResolvedValue('cat-new');
    createExpenseSettledOnDateMock.mockRejectedValueOnce(new Error('unavailable'));
    renderCard(proposal({ categoryId: undefined, subCategoryId: undefined, newCategory: { name: 'Ceramica', type: 'variable' } }));
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(screen.getByText('Registrata')).not.toBeNull());
    expect(createCategoryMock).toHaveBeenCalledTimes(1);
    expect(createExpenseSettledOnDateMock).toHaveBeenCalledTimes(2);
    expect(createExpenseSettledOnDateMock.mock.calls[1][1]).toMatchObject({ categoryId: 'cat-new' });
  });
});
