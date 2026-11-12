/**
 * `ExpenseDialog` opened on `initialValues` (2026-11) — the row the Assistente proposed, handed to
 * the form by «Modifica»: a NEW row that opens already filled, on the form and not on the type
 * picker, keeping the proposal's subcategory and account against the effects that would blank
 * the one and default the other. The four reads are mocked; invented categories and accounts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const NOW = new Date('2026-11-01T10:00:00Z');

const { reads } = vi.hoisted(() => ({
  reads: {
    categories: [] as unknown[],
    assets: [] as unknown[],
    settings: null as unknown,
  },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'owner-1' } }) }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useExpenses', () => ({ useExpenseCategories: () => ({ data: reads.categories, isLoading: false }) }));
vi.mock('@/lib/hooks/useAssets', () => ({ useAssets: () => ({ data: reads.assets }) }));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => ({ data: reads.settings }) }));
vi.mock('@/lib/hooks/useCostCenters', () => ({ useCostCenters: () => ({ data: [] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ExpenseDialog, type ExpenseDialogInitialValues } from '@/components/expenses/ExpenseDialog';

function renderDialog(initialValues?: ExpenseDialogInitialValues) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ExpenseDialog open onClose={() => {}} initialValues={initialValues} />
    </QueryClientProvider>,
  );
}

const PROPOSED: ExpenseDialogInitialValues = {
  type: 'variable', categoryId: 'cat-cibo', subCategoryId: 'sub-spesa', amount: 103, currency: 'EUR',
  date: new Date('2026-10-15T00:00:00'), notes: 'Supermercato', linkedCashAssetId: 'acc-save',
};

beforeEach(() => {
  reads.categories = [
    { id: 'cat-cibo', userId: 'owner-1', name: 'Cibo', type: 'variable', subCategories: [{ id: 'sub-spesa', name: 'Spesa' }, { id: 'sub-bar', name: 'Bar' }], createdAt: NOW, updatedAt: NOW },
    { id: 'cat-svago', userId: 'owner-1', name: 'Svago', type: 'variable', subCategories: [], createdAt: NOW, updatedAt: NOW },
  ];
  reads.assets = [
    { id: 'acc-main', userId: 'owner-1', name: 'Conto principale', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' },
    { id: 'acc-save', userId: 'owner-1', name: 'Conto risparmio', type: 'cash', assetClass: 'cash', quantity: 5000, currentPrice: 1, currency: 'EUR' },
  ];
  reads.settings = { defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main' };
});

const field = (id: string) => document.getElementById(id) as HTMLInputElement | null;

describe('ExpenseDialog — initialValues', () => {
  it('opens a prefilled row on the form, with every proposed value in its field', async () => {
    renderDialog(PROPOSED);
    await waitFor(() => expect(field('amount')).not.toBeNull());
    // Step 2: the form of the proposal's type, not the type picker.
    expect(screen.getByRole('heading', { name: 'Nuova spesa non necessaria' })).not.toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Tipo di voce' })).toBeNull();
    expect(field('amount')?.value).toBe('103');
    expect(field('date')?.value).toBe('2026-10-15');
    expect(field('categoryId')?.value).toBe('Cibo');
    expect(field('notes')?.value).toBe('Supermercato');
  });

  it('keeps the proposal’s subcategory: the clear that follows a category change does not run on the opening', async () => {
    renderDialog(PROPOSED);
    await waitFor(() => expect(field('subCategoryId')?.value).toBe('Spesa'));
  });

  it('keeps the proposal’s account, not the default of the type', async () => {
    renderDialog(PROPOSED);
    await waitFor(() => expect(field('linkedCashAssetId')?.textContent).toContain('Conto risparmio'));
    expect(field('linkedCashAssetId')?.textContent).not.toContain('Conto principale');
  });

  it('still gives a prefilled row with no account the default of its type', async () => {
    renderDialog({ ...PROPOSED, linkedCashAssetId: undefined });
    await waitFor(() => expect(field('linkedCashAssetId')?.textContent).toContain('Conto principale'));
    expect(field('subCategoryId')?.value).toBe('Spesa');
  });

  it('starts from the type picker without initial values, as it always did', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Tipo di voce' })).not.toBeNull());
    expect(field('amount')).toBeNull();
  });

  it('starts from the type picker when the values name no category', async () => {
    renderDialog({ type: 'variable', amount: 103 });
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Tipo di voce' })).not.toBeNull());
  });

  it('opened on another proposal, starts from that proposal', async () => {
    const queryClient = new QueryClient();
    const tree = (values: ExpenseDialogInitialValues) => (
      <QueryClientProvider client={queryClient}>
        <ExpenseDialog open onClose={() => {}} initialValues={values} />
      </QueryClientProvider>
    );
    const view = render(tree(PROPOSED));
    await waitFor(() => expect(field('amount')?.value).toBe('103'));
    view.rerender(tree({ ...PROPOSED, amount: 20, subCategoryId: 'sub-bar', notes: 'Caffè' }));
    await waitFor(() => expect(field('amount')?.value).toBe('20'));
    expect(field('subCategoryId')?.value).toBe('Bar');
    expect(field('notes')?.value).toBe('Caffè');
  });
});

// ── The kinds the card writes since 2026-11: each widened field of the create reset ──

describe('ExpenseDialog — initialValues of a transfer, an instalment, a series', () => {
  beforeEach(() => {
    reads.categories = [
      ...(reads.categories as object[]),
      { id: 'cat-trasf', userId: 'owner-1', name: 'Trasferimenti', type: 'transfer', subCategories: [], createdAt: NOW, updatedAt: NOW },
      { id: 'cat-mutuo', userId: 'owner-1', name: 'Mutuo', type: 'debt', subCategories: [], createdAt: NOW, updatedAt: NOW },
      { id: 'cat-banca', userId: 'owner-1', name: 'Banca', type: 'fixed', subCategories: [], createdAt: NOW, updatedAt: NOW },
    ];
    reads.assets = [
      ...(reads.assets as object[]),
      { id: 'loan-1', userId: 'owner-1', name: 'Mutuo ornitorinco', type: 'loan', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR', debtInterestRate: 1.2 },
    ];
    reads.settings = { defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main', transferFeeCategoryId: 'cat-banca' };
  });

  it('opens a transfer on its destination and its fee', async () => {
    renderDialog({ type: 'transfer', categoryId: 'cat-trasf', amount: 500, currency: 'EUR', date: new Date('2026-10-15T00:00:00'), linkedCashAssetId: 'acc-main', transferCashAssetId: 'acc-save', fee: 1.5 });
    await waitFor(() => expect(field('transferCashAssetId')?.textContent).toContain('Conto risparmio'));
    expect(field('fee')?.value).toBe('1.5');
  });

  it('opens an instalment on its loan and its payoff', async () => {
    renderDialog({ type: 'debt', categoryId: 'cat-mutuo', amount: 300, currency: 'EUR', date: new Date('2026-10-15T00:00:00'), linkedCashAssetId: 'acc-main', debtAssetId: 'loan-1', isDebtPayoff: true });
    await waitFor(() => expect(field('debtAssetId')?.textContent).toContain('Mutuo ornitorinco'));
    expect(field('isDebtPayoff')?.checked).toBe(true);
  });

  it('opens a series on its cadence, its count and its day', async () => {
    renderDialog({ ...PROPOSED, isRecurring: true, recurringFrequency: 'yearly', recurringCount: 3, recurringDay: 5 });
    await waitFor(() => expect(field('isRecurring')?.getAttribute('aria-checked')).toBe('true'));
    expect(field('recurringCount')?.value).toBe('3');
    // The day asked, not the date's (15): the date's spread sets it first.
    expect(field('recurringDay')?.value).toBe('5');
    expect(screen.getByLabelText('Numero di anni *')).not.toBeNull();
    // A date the user moves takes the day with it, as on any new series.
    fireEvent.change(field('date')!, { target: { value: '2026-10-21' } });
    await waitFor(() => expect(field('recurringDay')?.value).toBe('21'));
  });
});
