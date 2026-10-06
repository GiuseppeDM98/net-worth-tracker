/**
 * CASHFLOW PAGE
 *
 * Tab orchestration page for cashflow analysis with lazy loading.
 *
 * LAZY LOADING STRATEGY:
 * - Tabs mounted only when first activated (mountedTabs state tracking)
 * - Once mounted, tabs stay mounted (no unmounting on tab switch)
 * - Reduces initial page load time, improves perceived performance
 * - The CODE of every tab but Tracciamento is a chunk of its own too (`lazyComponent`, preloaded
 *   once the page's data is in): see the note above `getInitialTab`
 *
 * TAB STRUCTURE:
 * - Tracking: verdict + tile grid over the period's movements (ExpenseTrackingTab)
 * - Dividends: dividend tracking
 * - Budget: verdict + tile grid over the month's ceiling and the category budgets (BudgetTab)
 * - Cost centers: optional tab (settings.costCentersEnabled) — verdict + tile grid over the centers' whole cost
 * - Divisione: optional tab (settings.expenseSplitEnabled) — verdict + tile grid over how a household splits its spending
 *
 * The root is the 1920px tile-page width (`PageContainer`): Tracciamento is a
 * 12-column bento, and a bento uses width.
 *
 * WHY LAZY LOADING:
 * Each tab makes separate API calls and renders heavy charts.
 * Loading all tabs at once would cause ~3x longer initial load time.
 */

'use client';

import { useState, useEffect, useEffectEvent, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Coins, Target, Layers, Users, Download, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { TabsContent } from '@/components/ui/tabs';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { lazyComponent, usePreloadWhenIdle } from '@/components/ui/lazy-component';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import {
  BUDGET_SKELETON_CELLS,
  COST_CENTERS_SKELETON_CELLS,
  DIVIDENDS_SKELETON_CELLS,
  SPLIT_SKELETON_CELLS,
} from '@/lib/constants/cashflowTabSkeletons';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { Dividend } from '@/types/dividend';
import { FamilyMember } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import { useExpensesInRange, useExpenseBounds, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { queryKeys } from '@/lib/query/queryKeys';
import { dividendStatsQueryKey, useDividendRegistry } from '@/lib/hooks/useDividendStats';
import { listExpenseYears, trackingWindow } from '@/lib/utils/expenseWindows';
import { type Period, currentMonthPeriod } from '@/lib/utils/period';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import type { TabDef } from '@/components/layout/PageTabs';

// Module-level constant: stable reference for React Compiler
// Analisi tab removed — it now lives at /dashboard/analisi as a standalone page.
const CASHFLOW_TABS_BASE: TabDef[] = [
  { value: 'tracking',  label: 'Tracciamento', icon: ArrowRightLeft },
  { value: 'dividends', label: 'Dividendi',    icon: Coins          },
  { value: 'budget',    label: 'Budget',       icon: Target         },
];

const VALID_CASHFLOW_TABS = ['tracking', 'dividends', 'budget', 'cost-centers', 'split'] as const;
/** The cashflow floor when the settings carry none: last year (the same default Analisi uses). */
const DEFAULT_HISTORY_START_YEAR = new Date().getFullYear() - 1;
const EMPTY_FAMILY_MEMBERS: FamilyMember[] = [];
const EMPTY_DIVIDENDS: Dividend[] = [];
const EMPTY_EXPENSES: Expense[] = [];
type CashflowTabId = (typeof VALID_CASHFLOW_TABS)[number];

// The four tabs that are not the default load their code on demand (PERF-12, 2026-10-05): with the
// React Compiler on, all five tabs as static imports cost Cashflow +96 KB gz of initial JavaScript
// and its first figure +114 ms cold, measured on the mirror. Each one draws its own skeleton until
// its chunk arrives (`lazyComponent`, no Suspense), and they are preloaded once the page's data is
// in, so a click usually finds the chunk in memory. Never import a VALUE from these modules here:
// it would put them back in the page's initial graph (types only).
const DividendTrackingTab = lazyComponent(() => import('@/components/dividends/DividendTrackingTab').then((m) => m.DividendTrackingTab));
const BudgetTab = lazyComponent(() => import('@/components/cashflow/BudgetTab').then((m) => m.BudgetTab));
const ExpenseSplitTab = lazyComponent(() => import('@/components/cashflow/ExpenseSplitTab').then((m) => m.ExpenseSplitTab));
const CostCentersTab = lazyComponent(() => import('@/components/cashflow/CostCentersTab').then((m) => m.CostCentersTab));
// Module-level arrays (usePreloadWhenIdle runs its effect on the array's identity); the optional
// tabs are preloaded only for an account that has them on.
const ALWAYS_SHOWN_LAZY_TABS = [DividendTrackingTab, BudgetTab];
const SPLIT_LAZY_TAB = [ExpenseSplitTab];
const COST_CENTERS_LAZY_TAB = [CostCentersTab];

function getInitialTab(param: string | null): CashflowTabId {
  return (VALID_CASHFLOW_TABS as readonly string[]).includes(param ?? '') ? (param as CashflowTabId) : 'tracking';
}

export default function CashflowPage() {
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = getInitialTab(searchParams.get('tab'));
  // «Attribuisci spese» on the Divisione tab lands here: the row filter Tracciamento would
  // otherwise have to be found by hand. Null when absent, which is every other entry.
  const ownerParam = searchParams.get('owner');
  // Tracciamento's panel is rendered unconditionally, so it is mounted whatever the URL said:
  // leaving it out would deny its tab the `aria-controls` its panel can honour.
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([initialTab, 'tracking']));
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  // Tracciamento's axis lives here, beside the read that follows it: the tab is handed the rows of
  // ITS WINDOW — the period and the twelve months behind it (lib/utils/expenseWindows.ts) — not the
  // account's history, so a new period is a new key, and a period already visited opens from the
  // cache. Budget and Divisione mount later and read their own windows when they do; Centri di
  // Costo reads the whole collection, a centre being lifetime.
  const [trackingPeriod, setTrackingPeriod] = useState<Period>(() => currentMonthPeriod());
  const trackingExpensesWindow = useMemo(() => trackingWindow(trackingPeriod), [trackingPeriod]);
  const expensesQuery = useExpensesInRange(ownerId, trackingExpensesWindow);
  // What a window cannot say about the rest of the collection: the years the pickers offer.
  const { data: expenseBounds } = useExpenseBounds(ownerId);
  const availableYears = useMemo(() => listExpenseYears(expenseBounds), [expenseBounds]);
  const categoriesQuery = useExpenseCategories(ownerId);
  const assetsQuery = useAssets(ownerId);
  const settingsQuery = useSettings(ownerId);
  const { data: trackingExpenses = EMPTY_EXPENSES, isLoading: expensesLoading, isError: expensesError } = expensesQuery;
  const { data: categories = [], isLoading: categoriesLoading, isError: categoriesError } = categoriesQuery;
  const { data: allAssets = [], isLoading: assetsLoading, isError: assetsError } = assetsQuery;
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = settingsQuery;
  // The header's «Aggiornato alle…» while figures restored from the persisted cache are being
  // reread: Tracciamento's window and the three keys every tab paints from.
  const freshness = useFreshness([expensesQuery, categoriesQuery, assetsQuery, settingsQuery]);

  // The optional tabs are null UNTIL the settings have answered (a tab appearing late, after an
  // async flip from false, moves the tab bar under the reader's cursor) — and settled on a failed
  // read too, with the safe defaults: the settings are non-fatal for the page.
  const settingsSettled = !settingsLoading && (settings !== undefined || settingsError);
  const costCentersEnabled: boolean | null = settingsSettled ? (settings?.costCentersEnabled ?? false) : null;
  const expenseSplitEnabled: boolean | null = settingsSettled ? (settings?.expenseSplitEnabled ?? false) : null;
  const familyMembers = useMemo(() => settings?.familyMembers ?? EMPTY_FAMILY_MEMBERS, [settings]);
  const cashflowHistoryStartYear = settings?.cashflowHistoryStartYear ?? DEFAULT_HISTORY_START_YEAR;

  useEffect(() => {
    if (!settingsError) return;
    // Logged, not shown: the page keeps its defaults (the floor year, no optional tab).
    console.error('Failed to load cashflow settings, using fallback defaults', {
      userId: ownerId,
      operation: 'loadCashflowSettings',
      fallbackHistoryStartYear: DEFAULT_HISTORY_START_YEAR,
      fallbackCostCentersEnabled: false,
      fallbackExpenseSplitEnabled: false,
    });
  }, [settingsError, ownerId]);

  const assetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allAssets) map.set(a.id, a.name);
    return map;
  }, [allAssets]);
  // The Dividendi tab's instruments: equity and bonds (bonds have coupons tracked as dividend
  // entries), from the SAME assets key every page reads — no second read when the tab mounts.
  const dividendAssets = useMemo(() => allAssets.filter((a) => a.assetClass === 'equity' || a.assetClass === 'bonds'), [allAssets]);

  // The dividends come from the tab's ONE request, read once the tab is mounted: the same answer
  // carries the list (here) and the server's measures (`useDividendStats`, in the tab). Until
  // 2026-10-05 the list was a second request, `/api/dividends`, and a second read of the collection.
  const {
    data: dividends = EMPTY_DIVIDENDS,
    isLoading: dividendsLoading,
    isError: dividendsError,
  } = useDividendRegistry(ownerId, mountedTabs.has('dividends'));

  // The dividends' own read is NOT in here: it is the Dividendi tab's wait alone (below). Until
  // 2026-09-29 it was, so every expense saved put the skeleton over Tracciamento for the length
  // of a dividend read it never uses — the «refresh» the owner saw on the tour.
  const loading = expensesLoading || categoriesLoading;
  // Every tab defaults its data to `[]`, so without this a dropped connection reads as an
  // empty ledger — the one thing a tracker must never say (lib/utils/statesNarrative.ts).
  const loadFailed = expensesError || categoriesError;
  const isDemo = useDemoMode();
  // After Tracciamento's figures, never during them: a preload is a download competing with the
  // first read (the «idle» browser waiting on Firestore — AGENTS.md § Dynamic Imports).
  const tabsPreloadReady = !loading && !loadFailed;
  usePreloadWhenIdle(ALWAYS_SHOWN_LAZY_TABS, tabsPreloadReady);
  usePreloadWhenIdle(SPLIT_LAZY_TAB, tabsPreloadReady && expenseSplitEnabled === true);
  usePreloadWhenIdle(COST_CENTERS_LAZY_TAB, tabsPreloadReady && costCentersEnabled === true);

  const handleRefresh = async () => {
    // Invalidate React Query caches for expenses, categories and assets. `expenses.all` is the
    // PREFIX of every window and of the bounds, so this one call rereads Tracciamento's period,
    // Budget's year and Divisione's period where they are mounted, and marks every other window
    // in the cache (another period, FIRE's, the whole list of Storico, Analisi and Centri) to be
    // reread when it is next opened.
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.all(ownerId || ''),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.categories(ownerId || ''),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.assets.all(ownerId || ''),
    });

    // The dividends — list and measures, one key — are reread only where they are on screen: the
    // query is enabled by the mounted tab, so on a page that never opened it this only marks the
    // key stale and fetches nothing. The list stays drawn while the fresh answer is in flight.
    await queryClient.invalidateQueries({
      queryKey: dividendStatsQueryKey(ownerId),
    });
  };

  /**
   * @param extraSearch Additional query the destination tab reads, already `&`-prefixed. A plain
   *   `<Link>` cannot do this job: the route does not change, so Next does not remount the page
   *   and `activeTab` — seeded from the URL at mount — would stay where it was while the address
   *   bar said otherwise (caught by `e2e/cashflow.split.spec.ts`).
   */
  const handleTabChange = (value: string, extraSearch = '') => {
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
    router.replace(`${pathname}?tab=${value}${extraSearch}`, { scroll: false });
  };

  // Canonicalize the URL on mount only when the tab param is absent or invalid. An Effect Event:
  // the URL and the router are read, never triggers — it runs once, at mount.
  const canonicalizeTabParam = useEffectEvent(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== initialTab) {
      router.replace(`${pathname}?tab=${initialTab}`, { scroll: false });
    }
  });
  useEffect(() => {
    canonicalizeTabParam();
  }, []);

  const allTabs: TabDef[] = [
    ...CASHFLOW_TABS_BASE,
    ...(costCentersEnabled ? [{ value: 'cost-centers', label: 'Centri di Costo', icon: Layers }] : []),
    ...(expenseSplitEnabled ? [{ value: 'split', label: 'Divisione', icon: Users }] : []),
  ];

  // A URL naming an OPTIONAL tab whose feature is off used to leave the page blank — no tab bar
  // and no panel, because `getInitialTab` accepts the id while the panel is gated on the
  // setting. It is reachable from a bookmark, from a shared link, or simply by turning the
  // feature off with the tab open. The tab is DERIVED rather than corrected in an effect, so
  // there is no render where the page is briefly empty. Settled only once the settings have
  // loaded: before that every optional tab is legitimately unknown, not absent.
  const settingsLoaded = costCentersEnabled !== null && expenseSplitEnabled !== null;
  const effectiveTab =
    settingsLoaded && !allTabs.some((tab) => tab.value === activeTab) ? 'tracking' : activeTab;

  return (
    <PageContainer>
      <PageHeader
        label="Operatività"
        title="Cashflow"
        description="Traccia e analizza le tue entrate e uscite nel tempo"
        freshness={freshness}
        actions={
          <div className="flex items-center gap-2">
            {effectiveTab === 'tracking' && (
              <Button
                size="sm"
                disabled={isDemo}
                aria-label={isDemo ? 'Nuova Spesa — non disponibile in modalità demo' : 'Nuova Spesa'}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-expense'))}
                className="hidden desktop:flex"
              >
                <Plus className="h-4 w-4" />
                Nuova Spesa
              </Button>
            )}
            {/* Dividendi's two page-level actions. The tab owns the dialogs behind them, so the
                header only dispatches — the same channel «Nuova Spesa» uses above. Both are
                desktop-only: on a phone the add button sits beside the tab's period axis. */}
            {/* Budget's page-level action: the tab owns the dialog, the header dispatches.
                Desktop-only: on a phone the add button sits under the tab's verdict. */}
            {effectiveTab === 'budget' && (
              <Button
                size="sm"
                disabled={isDemo}
                aria-label={isDemo ? 'Aggiungi budget — non disponibile in modalità demo' : 'Aggiungi budget'}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-budget'))}
                className="hidden desktop:flex"
              >
                <Plus className="h-4 w-4" />
                Aggiungi budget
              </Button>
            )}
            {/* Centri di Costo's page-level action: same channel, same desktop-only rule. */}
            {effectiveTab === 'cost-centers' && (
              <Button
                size="sm"
                disabled={isDemo}
                aria-label={isDemo ? 'Nuovo centro — non disponibile in modalità demo' : 'Nuovo centro'}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-cost-center'))}
                className="hidden desktop:flex"
              >
                <Plus className="h-4 w-4" />
                Nuovo centro
              </Button>
            )}
            {/* Divisione's page-level action. It is the ONE verb the tab had none of: every
                figure on it was inert, and the route that changes who a row belongs to lives one
                tab away, in Tracciamento's «Intestatario» filter. A link, not a dispatch, because
                the work happens on another tab and not in a dialog of this one. */}
            {effectiveTab === 'split' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleTabChange('tracking', '&owner=common')}
                className="hidden desktop:flex"
              >
                <Users className="h-4 w-4" />
                Attribuisci spese
              </Button>
            )}
            {effectiveTab === 'dividends' && (
              <>
                <Button
                  size="sm"
                  disabled={isDemo}
                  aria-label={isDemo ? 'Aggiungi dividendo — non disponibile in modalità demo' : 'Aggiungi dividendo'}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                  onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-dividend'))}
                  className="hidden desktop:flex"
                >
                  <Plus className="h-4 w-4" />
                  Aggiungi dividendo
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isDemo}
                  aria-label={
                    isDemo
                      ? 'Scarica dividendi storici — non disponibile in modalità demo'
                      : 'Scarica dividendi storici per gli asset con ISIN'
                  }
                  title={isDemo ? 'Non disponibile in modalità demo' : 'Scarica dividendi storici'}
                  onClick={() => window.dispatchEvent(new CustomEvent('cashflow:scrape-dividends'))}
                  className="hidden desktop:flex"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              size="icon"
              variant="ghost"
              asChild
              aria-label="Impostazioni Spese"
            >
              <Link href="/dashboard/settings?tab=spese">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      <PageTabs
        tabs={allTabs}
        value={effectiveTab}
        onValueChange={handleTabChange}
        layoutId="cashflow-tab"
        ariaLabel="Sezioni di Cashflow"
        renderedPanels={mountedTabs}
        loading={costCentersEnabled === null || expenseSplitEnabled === null}
      >

        <TabsContent
            value="tracking"
            forceMount
            id={pageTabPanelId('cashflow-tab', 'tracking')}
            aria-label="Tracciamento"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
          >
          <motion.div
            initial={false}
            animate={effectiveTab === 'tracking' ? 'visible' : 'hidden'}
            variants={tabPanelSwitch}
          >
            <ExpenseTrackingTab
              windowExpenses={trackingExpenses}
              period={trackingPeriod}
              onPeriodChange={setTrackingPeriod}
              availableYears={availableYears}
              categories={categories}
              initialOwnerId={ownerParam}
              loading={loading}
                loadFailed={loadFailed}
              onRefresh={handleRefresh}
              assetNameMap={assetNameMap}
              splitEnabled={expenseSplitEnabled === true}
              familyMembers={familyMembers}
            />
          </motion.div>
        </TabsContent>

        {mountedTabs.has('dividends') && (
          <TabsContent
            value="dividends"
            forceMount
            id={pageTabPanelId('cashflow-tab', 'dividends')}
            aria-label="Dividendi"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
          >
            <motion.div
              initial={false}
              animate={effectiveTab === 'dividends' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <DividendTrackingTab
                fallback={<TileGridSkeleton cells={DIVIDENDS_SKELETON_CELLS} className="pt-1" />}
                dividends={dividends}
                assets={dividendAssets}
                loading={loading || dividendsLoading || assetsLoading}
                loadFailed={dividendsError || assetsError}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('budget') && (
          <TabsContent
            value="budget"
            forceMount
            id={pageTabPanelId('cashflow-tab', 'budget')}
            aria-label="Budget"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
          >
            <motion.div
              initial={false}
              animate={effectiveTab === 'budget' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <BudgetTab
                fallback={<TileGridSkeleton cells={BUDGET_SKELETON_CELLS} className="pt-1" />}
                categories={categories}
                categoriesLoading={categoriesLoading}
                categoriesFailed={categoriesError}
                historyStartYear={cashflowHistoryStartYear}
                userId={ownerId ?? ''}
              />
            </motion.div>
          </TabsContent>
        )}
        {expenseSplitEnabled && mountedTabs.has('split') && (
          <TabsContent
            value="split"
            forceMount
            id={pageTabPanelId('cashflow-tab', 'split')}
            aria-label="Divisione"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
          >
            <motion.div
              initial={false}
              animate={effectiveTab === 'split' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <ExpenseSplitTab
                fallback={<TileGridSkeleton cells={SPLIT_SKELETON_CELLS} className="pt-1" />}
                familyMembers={familyMembers}
                availableYears={availableYears}
              />
            </motion.div>
          </TabsContent>
        )}
        {costCentersEnabled && mountedTabs.has('cost-centers') && (
          <TabsContent
            value="cost-centers"
            forceMount
            id={pageTabPanelId('cashflow-tab', 'cost-centers')}
            aria-label="Centri di Costo"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
          >
            <motion.div
              initial={false}
              animate={effectiveTab === 'cost-centers' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CostCentersTab fallback={<TileGridSkeleton cells={COST_CENTERS_SKELETON_CELLS} className="pt-1" />} />
            </motion.div>
          </TabsContent>
        )}
      </PageTabs>
    </PageContainer>
  );
}
