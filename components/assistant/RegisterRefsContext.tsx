'use client';

/**
 * What the page holds for a proposed row to be read against (2026-11): the categories, the cash
 * accounts, the cost centres and the household — the four reads the expense form makes, from the
 * keys every page shares, so a visit after Cashflow opens with nothing to wait for.
 *
 * The page enables the reads in Registra only (the one mode in which an expense card renders) and
 * provides them to the cards, which sit under ReactMarkdown and cannot take props. The same reads
 * give the companion tile its summary before any message is sent, through the builder the server
 * uses (lib/utils/assistantRegisterContext.ts) with no rows and no month.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAssets } from '@/lib/hooks/useAssets';
import { useCostCenters } from '@/lib/hooks/useCostCenters';
import { useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useSettings } from '@/lib/hooks/useSettings';
import { calculateAssetValue } from '@/lib/services/assetService';
import { buildAssistantRegisterContext, summarizeRegisterContext } from '@/lib/utils/assistantRegisterContext';
import type { ExpenseProposalRefs } from '@/lib/utils/expenseProposal';
import { isCashAccount, type Asset, type FamilyMember } from '@/types/assets';
import type { AssistantRegisterSummary } from '@/types/assistant';
import type { CostCenter } from '@/types/costCenters';
import type { ExpenseCategory } from '@/types/expenses';

const EMPTY_CATEGORIES: ExpenseCategory[] = [];
const EMPTY_ASSETS: Asset[] = [];
const EMPTY_COST_CENTERS: CostCenter[] = [];
const EMPTY_MEMBERS: FamilyMember[] = [];

export interface RegisterReads {
  refs: ExpenseProposalRefs;
  /** Any of the four reads failed: a card cannot check its ids, so it writes nothing. */
  readFailed: boolean;
  loading: boolean;
  /** The companion tile's summary, computed here; null until the reads have answered. */
  summary: AssistantRegisterSummary | null;
}

export function useRegisterReads(ownerId: string | undefined, enabled: boolean): RegisterReads {
  const categoriesQuery = useExpenseCategories(ownerId, { enabled });
  const assetsQuery = useAssets(ownerId, { enabled });
  const settingsQuery = useSettings(ownerId, { enabled });
  const costCentersQuery = useCostCenters(ownerId, { enabled });

  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const settings = settingsQuery.data ?? null;
  const costCenters = costCentersQuery.data ?? EMPTY_COST_CENTERS;

  const readFailed = categoriesQuery.isError || assetsQuery.isError || settingsQuery.isError || costCentersQuery.isError;
  const loading = categoriesQuery.isLoading || assetsQuery.isLoading || settingsQuery.isLoading || costCentersQuery.isLoading;
  const answered = categoriesQuery.data !== undefined && assetsQuery.data !== undefined && settingsQuery.data !== undefined;

  // «Today» is the mount's: the summary prints no date, and a render must not read the clock.
  const [now] = useState(() => new Date());
  const context = buildAssistantRegisterContext({
    now,
    categories,
    assets,
    settings,
    costCenters,
    recentExpenses: null,
    month: null,
    assetValueOf: calculateAssetValue,
  });

  const refs: ExpenseProposalRefs = {
    categories,
    cashAssets: assets.filter(isCashAccount),
    properties: [],
    costCenters,
    members: settings?.familyMembers ?? EMPTY_MEMBERS,
    defaults: context.defaults,
    loans: [],
    feeCategory: null,
    settings: {
      costCentersEnabled: settings?.costCentersEnabled === true,
      expenseSplitEnabled: settings?.expenseSplitEnabled === true,
    },
  };

  return { refs, readFailed, loading, summary: answered ? summarizeRegisterContext(context) : null };
}

type RegisterRefsValue = ExpenseProposalRefs & {
  readFailed: boolean;
  /** Sends a message in the open conversation (a card that answers in prose). */
  submitAnswer: (text: string) => Promise<void>;
};

const RegisterRefsContext = createContext<RegisterRefsValue>({
  categories: EMPTY_CATEGORIES,
  cashAssets: EMPTY_ASSETS,
  properties: EMPTY_ASSETS,
  costCenters: EMPTY_COST_CENTERS,
  members: EMPTY_MEMBERS,
  defaults: { debitId: null, creditId: null },
  loans: EMPTY_ASSETS,
  feeCategory: null,
  settings: { costCentersEnabled: false, expenseSplitEnabled: false },
  // Without a provider nothing was read: a card must not write on empty lists.
  readFailed: true,
  submitAnswer: async () => {},
});

interface RegisterRefsProviderProps {
  refs: ExpenseProposalRefs;
  readFailed: boolean;
  submitAnswer: (text: string) => Promise<void>;
  children: ReactNode;
}

export function RegisterRefsProvider({ refs, readFailed, submitAnswer, children }: RegisterRefsProviderProps) {
  const value: RegisterRefsValue = { ...refs, readFailed, submitAnswer };
  return <RegisterRefsContext.Provider value={value}>{children}</RegisterRefsContext.Provider>;
}

export function useRegisterRefs(): RegisterRefsValue {
  return useContext(RegisterRefsContext);
}
