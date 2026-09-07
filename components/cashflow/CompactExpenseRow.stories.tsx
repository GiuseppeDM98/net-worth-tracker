import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CompactExpenseRow } from './CompactExpenseRow';
import type { Expense } from '@/types/expenses';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date();

const BASE_EXPENSE: Expense = {
  id: 'exp-1',
  userId: 'u1',
  type: 'variable',
  categoryId: 'cat-1',
  categoryName: 'Alimentari',
  amount: -85.5,
  currency: 'EUR',
  date: now,
  notes: 'Spesa settimanale Esselunga',
  createdAt: now,
  updatedAt: now,
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  component: CompactExpenseRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    expense: BASE_EXPENSE,
    onSelect: fn(),
    categoryIcon: 'ShoppingCart',
    categoryColor: '#ef4444',
  },
  decorators: [
    (Story) => (
      <div className="divide-border max-w-[400px] divide-y">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompactExpenseRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

/** Variable expense with icon and notes. */
export const VariableExpense: Story = {};

/** Fixed expense type. */
export const FixedExpense: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-2',
      type: 'fixed',
      categoryName: 'Abbonamenti',
      notes: 'Netflix mensile',
      amount: -15.99,
    },
    categoryIcon: 'Tv',
    categoryColor: '#8b5cf6',
  },
};

/** Income row — positive amount, the positive sign token. */
export const Income: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-3',
      type: 'income',
      categoryName: 'Stipendio',
      notes: 'Stipendio maggio',
      amount: 2800,
    },
    categoryIcon: 'Banknote',
    categoryColor: '#22c55e',
  },
};

/** Debt payment. */
export const DebtPayment: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-4',
      type: 'debt',
      categoryName: 'Mutuo',
      notes: 'Rata mutuo giugno',
      amount: -650,
    },
    categoryIcon: 'Landmark',
    categoryColor: '#f59e0b',
  },
};

/** Transfer — muted styling. */
export const Transfer: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-5',
      type: 'transfer',
      categoryName: 'Trasferimento',
      notes: 'Verso conto deposito',
      amount: 500,
    },
    categoryIcon: 'ArrowRightLeft',
    categoryColor: '#6b7280',
  },
};

/** Installment badge (e.g. 3/12). */
export const Installment: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-6',
      notes: 'iPhone 16 Pro',
      amount: -83.25,
      isInstallment: true,
      installmentNumber: 3,
      installmentTotal: 12,
    },
  },
};

/** Recurring badge. */
export const Recurring: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-7',
      type: 'fixed',
      categoryName: 'Palestra',
      notes: 'Abbonamento mensile',
      amount: -39.9,
      isRecurring: true,
    },
    categoryIcon: 'Dumbbell',
    categoryColor: '#14b8a6',
  },
};

/** No icon — falls back to type dot. */
export const NoIcon: Story = {
  args: {
    categoryIcon: undefined,
    categoryColor: undefined,
  },
};

/** Long text — tests truncation. */
export const LongText: Story = {
  args: {
    expense: {
      ...BASE_EXPENSE,
      id: 'exp-8',
      categoryName: 'Ristoranti e Bar',
      subCategoryName: 'Pranzo di lavoro aziendale',
      notes: 'Cena di compleanno al ristorante giapponese con amici del lavoro e colleghi',
      amount: -127.5,
    },
    categoryIcon: 'UtensilsCrossed',
    categoryColor: '#f59e0b',
  },
};

/** No notes — title falls back to category name. */
export const NoNotes: Story = {
  args: {
    expense: { ...BASE_EXPENSE, id: 'exp-9', notes: undefined },
  },
};

/** Multiple rows rendered together to show divide-y styling. */
export const MultipleRows: Story = {
  decorators: [
    () => (
      <div className="divide-border border-border bg-card max-w-[400px] divide-y overflow-hidden rounded-xl border px-2">
        <CompactExpenseRow
          expense={{ ...BASE_EXPENSE, id: 'r1', notes: 'Spesa Esselunga', amount: -85.5 }}
          onSelect={fn()}
          categoryIcon="ShoppingCart"
          categoryColor="#ef4444"
        />
        <CompactExpenseRow
          expense={{
            ...BASE_EXPENSE,
            id: 'r2',
            type: 'income',
            categoryName: 'Stipendio',
            notes: 'Stipendio maggio',
            amount: 2800,
          }}
          onSelect={fn()}
          categoryIcon="Banknote"
          categoryColor="#22c55e"
        />
        <CompactExpenseRow
          expense={{
            ...BASE_EXPENSE,
            id: 'r3',
            type: 'fixed',
            categoryName: 'Netflix',
            notes: undefined,
            amount: -15.99,
          }}
          onSelect={fn()}
          categoryIcon="Tv"
          categoryColor="#8b5cf6"
        />
        <CompactExpenseRow
          expense={{
            ...BASE_EXPENSE,
            id: 'r4',
            type: 'transfer',
            categoryName: 'Trasferimento',
            notes: 'Verso deposito',
            amount: 1000,
          }}
          onSelect={fn()}
          categoryIcon="ArrowRightLeft"
          categoryColor="#6b7280"
        />
        <CompactExpenseRow
          expense={{
            ...BASE_EXPENSE,
            id: 'r5',
            notes: 'iPhone 16 Pro',
            amount: -83.25,
            isInstallment: true,
            installmentNumber: 3,
            installmentTotal: 12,
          }}
          onSelect={fn()}
          categoryIcon="Smartphone"
          categoryColor="#3b82f6"
        />
      </div>
    ),
  ],
  // Render nothing for the main story since the decorator handles it
  render: () => <></>,
};
