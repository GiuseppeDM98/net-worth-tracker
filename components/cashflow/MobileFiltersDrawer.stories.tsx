import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MobileFiltersDrawer } from './MobileFiltersDrawer';
import type { MultiSelectGroup } from '@/components/ui/multi-select';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: MultiSelectGroup[] = [
  {
    heading: 'Spese Fisse',
    options: [
      { value: 'cat-1', label: 'Affitto' },
      { value: 'cat-2', label: 'Abbonamenti' },
      { value: 'cat-3', label: 'Assicurazioni' },
    ],
  },
  {
    heading: 'Spese Variabili',
    options: [
      { value: 'cat-4', label: 'Alimentari' },
      { value: 'cat-5', label: 'Trasporti' },
      { value: 'cat-6', label: 'Ristoranti' },
      { value: 'cat-7', label: 'Svago' },
    ],
  },
  {
    heading: 'Entrate',
    options: [
      { value: 'cat-8', label: 'Stipendio' },
      { value: 'cat-9', label: 'Freelance' },
    ],
  },
];

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Data (recenti)', shortLabel: 'Recenti' },
  { value: 'date-asc', label: 'Data (meno recenti)', shortLabel: 'Meno rec.' },
  { value: 'amount-desc', label: 'Importo (alto)', shortLabel: '€ Alto' },
  { value: 'amount-asc', label: 'Importo (basso)', shortLabel: '€ Basso' },
];

const ACCOUNT_OPTIONS = [
  { id: 'acc-1', name: 'Conto Principale' },
  { id: 'acc-2', name: 'Conto Deposito' },
  { id: 'acc-3', name: 'Carta Prepagata' },
];

const SUB_CATEGORY_OPTIONS = [
  { id: 'sub-1', name: 'Supermercato', categoryId: 'cat-4', categoryName: 'Alimentari' },
  { id: 'sub-2', name: 'Mercato', categoryId: 'cat-4', categoryName: 'Alimentari' },
  { id: 'sub-3', name: 'Biologico', categoryId: 'cat-4', categoryName: 'Alimentari' },
];

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  component: MobileFiltersDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    viewport: { defaultViewport: 'mobile1' },
  },
  args: {
    period: { kind: 'month', year: 2026, month: 5 },
    onPeriodChange: fn(),
    availableYears: [2024, 2025, 2026],
    searchQuery: '',
    onSearchChange: fn(),
    categoryMultiSelectOptions: CATEGORY_OPTIONS,
    multiSelectValue: [],
    onCategoryChange: fn(),
    soloSelectedCategory: null,
    subCategoryOptions: [],
    selectedSubCategoryId: 'all',
    onSubCategoryChange: fn(),
    accountOptions: [],
    selectedAccountId: 'all',
    onAccountChange: fn(),
    ownerOptions: [],
    selectedOwnerId: 'all',
    onOwnerChange: fn(),
    activeFilterCount: 0,
    onReset: fn(),
    mobileSortKey: 'date-desc',
    onSortChange: fn(),
    sortOptions: SORT_OPTIONS,
  },
} satisfies Meta<typeof MobileFiltersDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

/** Default state — no filters active. */
export const NoFilters: Story = {};

/** Filters badge showing 2 active filters. */
export const WithActiveFilters: Story = {
  args: {
    activeFilterCount: 2,
    searchQuery: 'Esselunga',
    multiSelectValue: ['cat-4', 'cat-6'],
  },
};

/** Year period selected. */
export const YearPeriod: Story = {
  args: {
    period: { kind: 'year', year: 2026 },
  },
};

/** Custom date range period. */
export const CustomPeriod: Story = {
  args: {
    period: { kind: 'custom', from: new Date(2026, 0, 1), to: new Date(2026, 5, 30) },
  },
};

/** With account filter visible (2+ accounts). */
export const WithAccounts: Story = {
  args: {
    accountOptions: ACCOUNT_OPTIONS,
    selectedAccountId: 'acc-1',
    activeFilterCount: 1,
  },
};

/** Divisione on: the «Intestatario» section exists, filtered on one person. */
export const WithOwnerFilter: Story = {
  args: {
    ownerOptions: [
      { value: 'all', label: 'Tutti' },
      { value: 'common', label: 'In comune' },
      { value: 'member-1', label: 'Giuseppe' },
      { value: 'member-2', label: 'Marcella' },
    ],
    selectedOwnerId: 'member-1',
    activeFilterCount: 1,
  },
};

/** With subcategory filter visible (single category selected). */
export const WithSubcategory: Story = {
  args: {
    soloSelectedCategory: {
      id: 'cat-4',
      userId: 'u1',
      name: 'Alimentari',
      type: 'variable',
      color: '#ef4444',
      subCategories: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    subCategoryOptions: SUB_CATEGORY_OPTIONS,
    multiSelectValue: ['cat-4'],
    activeFilterCount: 1,
  },
};

/** Many active filters — badge, search, category, account all set. */
export const FullyFiltered: Story = {
  args: {
    activeFilterCount: 4,
    searchQuery: 'pranzo',
    multiSelectValue: ['cat-4', 'cat-5', 'cat-6'],
    accountOptions: ACCOUNT_OPTIONS,
    selectedAccountId: 'acc-2',
    soloSelectedCategory: null,
  },
};

/** No sort options — sort select hidden. */
export const WithoutSort: Story = {
  args: {
    sortOptions: undefined,
    mobileSortKey: undefined,
    onSortChange: undefined,
  },
};
