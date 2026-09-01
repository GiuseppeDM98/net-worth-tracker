/**
 * CASHFLOW PAGE
 *
 * Tab orchestration page for cashflow analysis with lazy loading.
 *
 * LAZY LOADING STRATEGY:
 * - Tabs mounted only when first activated (mountedTabs state tracking)
 * - Once mounted, tabs stay mounted (no unmounting on tab switch)
 * - Reduces initial page load time, improves perceived performance
 *
 * TAB STRUCTURE:
 * - Tracking: verdict + tile grid over the period's movements (ExpenseTrackingTab)
 * - Dividends: dividend tracking
 * - Budget: verdict + tile grid over the month's ceiling and the category budgets (BudgetTab)
 * - Cost centers: optional tab (settings.costCentersEnabled) — verdict + tile grid over the centers' whole cost
 * - Divisione: optional tab (settings.expenseSplitEnabled) — verdict + tile grid over how a household splits its spending
 *
 * The root is the 1920px tile-page width (`PageContainer width="wide"`): Tracciamento is a
 * 12-column bento, and a bento uses width.
 *
 * WHY LAZY LOADING:
 * Each tab makes separate API calls and renders heavy charts.
 * Loading all tabs at once would cause ~3x longer initial load time.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Coins, Target, Layers, Users, Download, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { TabsContent } from '@/components/ui/tabs';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';
import { BudgetTab } from '@/components/cashflow/BudgetTab';
import { CostCentersTab } from '@/components/cashflow/CostCentersTab';
import { ExpenseSplitTab } from '@/components/cashflow/ExpenseSplitTab';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { Dividend } from '@/types/dividend';
import { Asset, FamilyMember } from '@/types/assets';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useAssets } from '@/lib/hooks/useAssets';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabs';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Module-level constant: stable reference for React Compiler
// Analisi tab removed — it now lives at /dashboard/analisi as a standalone page.
const CASHFLOW_TABS_BASE: TabDef[] = [
  { value: 'tracking',  label: 'Tracciamento', icon: ArrowRightLeft },
  { value: 'dividends', label: 'Dividendi',    icon: Coins          },
  { value: 'budget',    label: 'Budget',       icon: Target         },
];

const VALID_CASHFLOW_TABS = ['tracking', 'dividends', 'budget', 'cost-centers', 'split'] as const;
type CashflowTabId = (typeof VALID_CASHFLOW_TABS)[number];

function getInitialTab(param: string | null): CashflowTabId {
  return (VALID_CASHFLOW_TABS as readonly string[]).includes(param ?? '') ? (param as CashflowTabId) : 'tracking';
}

export default function CashflowPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = getInitialTab(searchParams.get('tab'));
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([initialTab]));
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  // null = settings not yet loaded (avoids the tab appearing late after an async flip from false → true)
  const [costCentersEnabled, setCostCentersEnabled] = useState<boolean | null>(null);
  // Same null-until-loaded contract as the cost centres above: a tab that appears late, after an
  // async flip from false, moves the tab bar under the reader's cursor.
  const [expenseSplitEnabled, setExpenseSplitEnabled] = useState<boolean | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [laborIncomeCategoryIds, setLaborIncomeCategoryIds] = useState<string[]>([]);

  // React Query hooks for expenses and categories
  const { data: allExpenses = [], isLoading: expensesLoading, isError: expensesError } =
    useExpenses(ownerId);
  const { data: categories = [], isLoading: categoriesLoading, isError: categoriesError } =
    useExpenseCategories(ownerId);
  const { data: allAssets = [] } = useAssets(ownerId);

  const assetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allAssets) map.set(a.id, a.name);
    return map;
  }, [allAssets]);

  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(new Date().getFullYear() - 1);

  // Manual state for other tabs data (dividends, assets)
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [otherDataLoading, setOtherDataLoading] = useState(false);
  const [otherDataFailed, setOtherDataFailed] = useState(false);
  const [otherDataLoaded, setOtherDataLoaded] = useState(false);

  const loading = expensesLoading || categoriesLoading || otherDataLoading;
  // Every tab defaults its data to `[]`, so without this a dropped connection reads as an
  // empty ledger — the one thing a tracker must never say (lib/utils/statesNarrative.ts).
  const loadFailed = expensesError || categoriesError;
  const isDemo = useDemoMode();

  // Load dividends and assets only when their tabs are mounted
  const loadOtherData = async () => {
    if (!user || !ownerId || otherDataLoaded) return;

    try {
      setOtherDataLoading(true);
      setOtherDataFailed(false);

      // Fetch only dividends and assets (expenses/categories handled by React Query)
      const [dividendsData, assetsData] = await Promise.all([
        authenticatedFetch(`/api/dividends?userId=${ownerId}`)
          .then(r => r.json())
          .then(d => d.dividends || []),
        getAllAssets(ownerId),
      ]);

      setDividends(dividendsData);
      // Include equity and bonds: bonds have coupons tracked as dividend entries
      setAssets(assetsData.filter(a => a.assetClass === 'equity' || a.assetClass === 'bonds'));
      setOtherDataLoaded(true);
    } catch (error) {
      console.error('Failed to load cashflow secondary data', {
        userId: ownerId,
        operation: 'loadOtherData',
        error: getErrorMessage(error),
      });
      setOtherDataFailed(true);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setOtherDataLoading(false);
    }
  };

  useEffect(() => {
    const needsOtherData = mountedTabs.has('dividends');
    if (user && ownerId && needsOtherData && !otherDataLoaded) {
      loadOtherData();
    }
  }, [user, ownerId, mountedTabs, otherDataLoaded]);

  // Load cashflow history start year from user settings (one-time read per session)
  useEffect(() => {
    if (!user || !ownerId) return;
    const loadSettings = async () => {
      try {
        const settings = await getSettings(ownerId);

        if (settings?.cashflowHistoryStartYear !== undefined) {
          setCashflowHistoryStartYear(settings.cashflowHistoryStartYear);
        }
        setCostCentersEnabled(settings?.costCentersEnabled ?? false);
        setExpenseSplitEnabled(settings?.expenseSplitEnabled ?? false);
        setFamilyMembers(settings?.familyMembers ?? []);
        setLaborIncomeCategoryIds(settings?.laborIncomeCategoryIds ?? []);
      } catch (error) {
        // Settings bootstrap is non-fatal for the page: keep safe defaults and log explicitly.
        console.error('Failed to load cashflow settings, using fallback defaults', {
          userId: ownerId,
          operation: 'loadCashflowSettings',
          fallbackHistoryStartYear: 2025,
          fallbackCostCentersEnabled: false,
          fallbackExpenseSplitEnabled: false,
          error: getErrorMessage(error),
        });
        setCostCentersEnabled(false);
        setExpenseSplitEnabled(false);
      }
    };

    void loadSettings();
  }, [user, ownerId]);

  const handleRefresh = async () => {
    // Invalidate React Query caches for expenses and categories
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.all(ownerId || ''),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.categories(ownerId || ''),
    });

    // Force re-fetch of other data (dividends, assets)
    setOtherDataLoaded(false);
    await loadOtherData();
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  // Canonicalize the URL on mount only when the tab param is absent or invalid
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== initialTab) {
      router.replace(`${pathname}?tab=${initialTab}`, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <PageContainer width="wide">
      <PageHeader
        label="Operatività"
        title="Cashflow"
        description="Traccia e analizza le tue entrate e uscite nel tempo"
        separator={false}
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
        loading={costCentersEnabled === null || expenseSplitEnabled === null}
      >

        <TabsContent value="tracking" forceMount>
          <motion.div
            initial={false}
            animate={effectiveTab === 'tracking' ? 'visible' : 'hidden'}
            variants={tabPanelSwitch}
          >
            <ExpenseTrackingTab
              allExpenses={allExpenses}
              categories={categories}
              loading={loading}
                loadFailed={loadFailed}
              onRefresh={handleRefresh}
              assetNameMap={assetNameMap}
            />
          </motion.div>
        </TabsContent>

        {mountedTabs.has('dividends') && (
          <TabsContent value="dividends" forceMount>
            <motion.div
              initial={false}
              animate={effectiveTab === 'dividends' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <DividendTrackingTab
                dividends={dividends}
                assets={assets}
                loading={loading}
                loadFailed={otherDataFailed}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('budget') && (
          <TabsContent value="budget" forceMount>
            <motion.div
              initial={false}
              animate={effectiveTab === 'budget' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <BudgetTab
                allExpenses={allExpenses}
                categories={categories}
                loading={loading}
                loadFailed={loadFailed}
                historyStartYear={cashflowHistoryStartYear}
                userId={ownerId ?? ''}
              />
            </motion.div>
          </TabsContent>
        )}
        {expenseSplitEnabled && mountedTabs.has('split') && (
          <TabsContent value="split" forceMount>
            <motion.div
              initial={false}
              animate={effectiveTab === 'split' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <ExpenseSplitTab
                allExpenses={allExpenses}
                familyMembers={familyMembers}
                laborIncomeCategoryIds={laborIncomeCategoryIds}
                loading={loading}
                loadFailed={loadFailed}
              />
            </motion.div>
          </TabsContent>
        )}
        {costCentersEnabled && mountedTabs.has('cost-centers') && (
          <TabsContent value="cost-centers" forceMount>
            <motion.div
              initial={false}
              animate={effectiveTab === 'cost-centers' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CostCentersTab />
            </motion.div>
          </TabsContent>
        )}
      </PageTabs>
    </PageContainer>
  );
}
