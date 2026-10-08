/**
 * SETTINGS PAGE — the orchestrator (2026-10-08).
 *
 * Six tabs, six views, ONE draft. Until 2026-10-08 this file was one 4100-line component with 70
 * `useState`s, and every keystroke re-ran the whole function (286 components per key on the
 * laptop with the compiler on, 318 on the Mac — the census, doc/guide/velocita.md). Now the page holds
 * the draft in a single `useReducer(settingsDraftReducer)`
 * (lib/utils/settingsDraft.ts) and each tab — `components/settings/tabs/*Tab.tsx` — is a
 * controlled view of its SLICE: it receives the slice, emits a patch, keeps no form state. It has
 * to be so: Radix unmounts an inactive panel, a view with fields of its own would lose them at
 * the first tab change, and «Salva» from another tab would never see them.
 *
 * What this file keeps:
 *   - the read: the settings document OBSERVED through the key every page shares (`useSettings`),
 *     seeding the draft during render — from the persisted cache at once on a warm visit, from
 *     the fresh read behind it while no tab is dirty; the skeleton only for a first visit;
 *   - the tab: which one is active, which ones were mounted (`aria-controls` only names a panel
 *     that exists), the `?tab=` canonicalised on mount only when absent or invalid;
 *   - the ONE «Salva»: `composeSettingsDocument` validates the tree as it will be written and
 *     names the first broken rule WITH its place — the page then opens that group, activates
 *     Allocazione and hands the view a field to focus through the draft (`pendingFocus`);
 *   - the save state PER TAB: a dot on each tab holding edits (`isSliceDirty`), a bar at the
 *     bottom naming them, «Annulla modifiche» as a RE-READ of the saved document, never a copy;
 *   - «Ripristina default»: the FACTORY targets, a different act from «Annulla».
 *
 * The colour theme and the light/dark mode are the exception: they save themselves (Aspetto).
 */

'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, RotateCcw, Receipt, Coins, Settings, PieChart, Palette, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { setSettings, getDefaultTargets } from '@/lib/services/assetAllocationService';
import type { TargetProblem } from '@/lib/utils/allocationTargetValidation';
import {
  composeSettingsDocument,
  createSettingsDraft,
  isSettingsTabId,
  isSliceDirty,
  revealTargetProblem,
  settingsDraftReducer,
  WRITABLE_TABS,
  type AllocazioneSlice,
  type AssetClassDraft,
  type DividendiSlice,
  type GeneraleSlice,
  type SettingsTabId,
  type SpeseSlice,
} from '@/lib/utils/settingsDraft';
import { narrativeToText } from '@/lib/utils/narrative';
import type { Asset, AssetClass } from '@/types/assets';
import type { ExpenseCategory } from '@/types/expenses';
import { queryKeys } from '@/lib/query/queryKeys';
import { settingsQueryOptions, useSettings } from '@/lib/hooks/useSettings';
import { useAssets } from '@/lib/hooks/useAssets';
import { useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabBar';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { describeTargetProblem, describeUnsavedChanges } from '@/lib/utils/settingsNarrative';
import { AllocazioneTab } from '@/components/settings/tabs/AllocazioneTab';
import { AspettoTab } from '@/components/settings/tabs/AspettoTab';
import { CondivisioneTab } from '@/components/settings/tabs/CondivisioneTab';
import { DividendiTab } from '@/components/settings/tabs/DividendiTab';
import { GeneraleTab } from '@/components/settings/tabs/GeneraleTab';
import { SpeseTab } from '@/components/settings/tabs/SpeseTab';
import { runGuarded, SETTINGS_TABS_LAYOUT_ID } from '@/components/settings/tabs/shared';

// Module-level tab definitions drive both the mobile pill and the desktop underline tabs.
const SETTINGS_TABS: TabDef[] = [
  { value: 'allocazione', label: 'Allocazione', icon: PieChart },
  { value: 'generale',    label: 'Preferenze',  icon: Settings },
  { value: 'spese',       label: 'Spese',       icon: Receipt  },
  { value: 'dividendi',   label: 'Dividendi',   icon: Coins    },
  { value: 'condivisione', label: 'Condivisione', icon: Users   },
  { value: 'aspetto',     label: 'Aspetto',     icon: Palette  },
];

const EMPTY_CATEGORIES: ExpenseCategory[] = [];
const EMPTY_ASSETS: Asset[] = [];

const PAGE_HEADER = { label: 'Configurazione', title: 'Impostazioni', description: 'Target, preferenze e flussi' } as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // THE draft: one reducer, one slice per tab (lib/utils/settingsDraft.ts).
  const [draft, dispatch] = useReducer(settingsDraftReducer, undefined, createSettingsDraft);
  const { allocazione, generale, spese, dividendi, declarations } = draft.slices;
  const setGenerale = (patch: Partial<GeneraleSlice>) => dispatch({ type: 'generale/set', patch });
  const setSpese = (patch: Partial<SpeseSlice>) => dispatch({ type: 'spese/set', patch });
  const setDividendi = (patch: Partial<DividendiSlice>) => dispatch({ type: 'dividendi/set', patch });
  const setAllocazione = (patch: Partial<Omit<AllocazioneSlice, 'classes'>>) => dispatch({ type: 'allocazione/set', patch });
  const setAllocationClass = (assetClass: AssetClass, patch: Partial<AssetClassDraft>) =>
    dispatch({ type: 'allocazione/setClass', assetClass, patch });
  const consumeFocus = () => dispatch({ type: 'focusConsumed' });

  // The expense categories from the key Cashflow, Analisi and the expense form read (2026-09-29).
  // `isLoading` is true before the first read, so an empty list is «not read yet», never «no
  // categories»; `isError` = the categories were not read, and every tile fed by them says so.
  const categoriesQuery = useExpenseCategories(ownerId);
  const { data: expenseCategories = EMPTY_CATEGORIES, isLoading: loadingCategories, isError: categoriesFailed } = categoriesQuery;

  // The cash accounts for the default debit/credit pickers, from the assets key: an actual conto,
  // not just a "cash-class" asset — a money-market ETF (assetClass 'cash') is not a settlement
  // account. Strict convention (doc/guide/patrimonio.md § Asset Pricing, FX and Assets). A failed
  // read is `isError`, never `[]`: the tile used to tell the reader to create an account they had.
  const accountsQuery = useAssets(ownerId);
  const { data: allAssets = EMPTY_ASSETS, isLoading: loadingAccounts, isError: accountsFailed } = accountsQuery;
  const cashAssets = useMemo(() => allAssets.filter((a) => a.type === 'cash' && a.assetClass === 'cash'), [allAssets]);

  // The settings document, OBSERVED through the key every page shares (2026-10-08). On a warm
  // visit the persisted cache hands the document at once and the form is seeded from it — no
  // skeleton — while the fresh read lands behind, dated by «Aggiornato alle…» in the header
  // (the owner's decision of 2026-09-29, doc/guide/impostazioni.md). The skeleton is for the first
  // visit of the account only.
  const settingsQuery = useSettings(ownerId);
  const settingsDocument = settingsQuery.data; // undefined = not read yet; null = no document
  const freshness = useFreshness([settingsQuery, categoriesQuery, accountsQuery]);

  // Tab navigation — lazy-loading pattern (same as Assets/Cashflow pages). Allocazione is always
  // mounted (the default), the others once opened; `aria-controls` may only name a panel that exists.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedTab = searchParams.get('tab');
  const initialTab: SettingsTabId = isSettingsTabId(requestedTab) ? requestedTab : 'allocazione';
  const [mountedTabs, setMountedTabs] = useState<Set<SettingsTabId>>(new Set([initialTab]));
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const renderedPanels = new Set<string>([...mountedTabs, 'allocazione']);

  const handleTabChange = (value: string) => {
    setActiveTab(value as SettingsTabId);
    setMountedTabs((prev) => new Set(prev).add(value as SettingsTabId));
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  // Canonicalize the URL on mount only when the tab param is absent or invalid (as Cashflow does):
  // an unconditional replace re-rendered every `useSearchParams` consumer of the shell. An Effect
  // Event: the URL and the router are read, never triggers — it runs once, at mount.
  const canonicalizeTabParam = useEffectEvent(() => {
    if (searchParams.get('tab') !== initialTab) {
      router.replace(`${pathname}?tab=${initialTab}`, { scroll: false });
    }
  });
  useEffect(() => {
    canonicalizeTabParam();
  }, []);

  // One dirty flag per tab that has fields «Salva» writes — each slice holds the fields of the
  // tab that EDITS them (doc/guide/impostazioni.md § Settings — the FIVE places). The tab
  // definitions are rebuilt only when the SET of dirty tabs changes (a string key, not the draft):
  // the two tab bars and their icons re-rendered on every keystroke otherwise (the census, 2026-10-08).
  const unsavedKey = WRITABLE_TABS.filter((tab) => draft.loaded && isSliceDirty(tab, draft.slices, draft.saved)).join(',');
  const settingsTabs = useMemo(() => {
    const unsaved = new Set(unsavedKey.split(','));
    return SETTINGS_TABS.map((tab) => ({ ...tab, unsaved: unsaved.has(tab.value) }));
  }, [unsavedKey]);
  const unsavedSentence = describeUnsavedChanges(settingsTabs.filter((tab) => tab.unsaved).map((tab) => tab.label));
  const hasUnsavedChanges = unsavedSentence !== null;

  // The draft is seeded from the document — settled DURING render on the (owner, read) subject
  // (AGENTS.md § Motion, the third answer): the first document of this owner seeds it, a fresher
  // read reseeds it ONLY while no tab is dirty — a co-owner's save never overwrites what the
  // reader is typing; it lands at the next «Salva» or «Annulla», which re-read anyway.
  const seedSubject = settingsDocument === undefined ? null : `${ownerId}:${settingsQuery.dataUpdatedAt}`;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (seedSubject !== null && seedSubject !== seededFrom && !(draft.loaded && hasUnsavedChanges)) {
    setSeededFrom(seedSubject);
    dispatch({ type: 'reset', document: settingsDocument ?? null, fallbackTargets: getDefaultTargets() });
  }
  // The skeleton: this owner's document not read yet and not failed (a first visit, or a switch to
  // an account never read). A failed FIRST read is not a form full of defaults (below).
  const loading = settingsDocument === undefined && !settingsQuery.isError;
  const loadFailed = settingsDocument === undefined && settingsQuery.isError;

  // Re-read the categories after a write in Spese (a category created, moved, deleted, imported)
  // and «Riprova»: an invalidation of the key every reader shares, never a private re-read.
  const loadExpenseCategories = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId || '') }),
    [queryClient, ownerId],
  );

  /** «Riprova» on the accounts: the assets key, which Patrimonio invalidates on every write. */
  const loadCashAccounts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId || '') }),
    [queryClient, ownerId],
  );

  // Invalidate every Cashflow query key that reads expenses/categories/overview data (the import
  // may have created categories), so the freshly imported transactions show up without a manual
  // page reload.
  const handleExpenseImported = () => {
    if (ownerId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
    }
  };

  /**
   * Takes the reader to the first broken rule: the Allocazione tab, the class's group opened
   * (and the subcategory's assets, for an asset rule), the focus on the field to fix — through
   * the draft (`revealTargetProblem` says where, the view consumes `pendingFocus` once mounted).
   * The reading of Target per classe already states the problem; this puts the cursor where it is.
   */
  const revealProblem = (problem: TargetProblem, cleaned: AllocazioneSlice) => {
    const { slice, fieldId } = revealTargetProblem(problem, cleaned);
    dispatch({ type: 'allocazione/replace', slice });
    dispatch({ type: 'focus', fieldId });
    if (activeTab !== 'allocazione') handleTabChange('allocazione');
  };

  const handleSave = async () => {
    if (!user || !ownerId) return;

    // Validated as it will be written (unnamed rows dropped), BEFORE any read: a refused save
    // costs no round trip. The two FIRE fields the document carries through come from the
    // CURRENT document, pre-read below.
    const checked = composeSettingsDocument(draft.slices, null);
    if (!checked.ok) {
      revealProblem(checked.problem, checked.cleaned);
      toast.error(narrativeToText(describeTargetProblem(checked.problem)));
      return;
    }
    if (checked.cleaned !== allocazione) dispatch({ type: 'allocazione/replace', slice: checked.cleaned });

    await runGuarded(async () => {
      setSaving(true);

      // Fetch the CURRENT settings (never the cache) to preserve the fields other pages write.
      const current = await queryClient.fetchQuery({ ...settingsQueryOptions(ownerId), staleTime: 0 });
      const composed = composeSettingsDocument(draft.slices, current);
      if (!composed.ok) return; // the same tree was just validated

      await setSettings(ownerId, composed.document);
      toast.success('Impostazioni salvate');
      // The baseline is what was WRITTEN (the cleaned tree), so a dropped empty row does not
      // leave the tab marked as unsaved.
      dispatch({ type: 'saved', cleaned: composed.cleaned });
      // Other consumers (AssetDialog's family-member Select, PensionOverview) read settings via
      // React Query with a 5-minute staleTime — without this, a just-added member wouldn't be
      // selectable there until that cache naturally expired.
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) });
    }, (error) => {
      console.error('Error saving targets:', error);
      toast.error('Errore nel salvataggio dei target');
    }, () => {
      setSaving(false);
    });
  };

  // «Ripristina default»: the FACTORY targets, a different act from «Annulla modifiche».
  const handleReset = () => {
    dispatch({ type: 'allocazione/replaceTargets', targets: getDefaultTargets() });
    toast.info('Target ripristinati ai valori predefiniti');
  };

  // «Annulla modifiche»: back to what is saved, by READING it again (the current document,
  // `staleTime: 0`, through the shared key) — never a copy kept in memory, so a co-owner's save
  // comes back too. A failed re-read leaves the draft as it is and says so.
  const handleRevert = async () => {
    if (!ownerId) return;
    await runGuarded(async () => {
      const document = await queryClient.fetchQuery({ ...settingsQueryOptions(ownerId), staleTime: 0 });
      dispatch({ type: 'reset', document, fallbackTargets: getDefaultTargets() });
      toast.info('Modifiche annullate: il modulo mostra di nuovo le impostazioni salvate.');
    }, (error) => {
      console.error('Error re-reading the settings:', error);
      toast.error('Lettura delle impostazioni fallita: le modifiche restano nel modulo.');
    });
  };

  // A reload or a closed tab with edits pending asks first (the browser's own prompt). An
  // in-app link does not: the App Router has no navigation guard, so the bar at the bottom is
  // the reminder there.
  useEffect(() => {
    if (!hasUnsavedChanges || isDemo) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges, isDemo]);

  if (loading) {
    return (
      <PageContainer>
        <PageHeader {...PAGE_HEADER} freshness={freshness} />
        <PageTabs
          tabs={SETTINGS_TABS}
          value={activeTab}
          onValueChange={handleTabChange}
          layoutId={SETTINGS_TABS_LAYOUT_ID}
          ariaLabel="Sezioni delle Impostazioni"
          loading
        >
          <TileGridSkeleton verdict={false} className="mt-4" cells={[{ span: 5 }, { span: 7 }, { span: 12, lines: 8 }]} />
        </PageTabs>
      </PageContainer>
    );
  }

  // A failed read must not become a form full of defaults: saving those would OVERWRITE the
  // settings that were never read (lib/utils/statesNarrative.ts).
  if (loadFailed) {
    return (
      <PageContainer>
        <PageHeader {...PAGE_HEADER} freshness={freshness} />
        <ErrorNotice
          className="mt-4 max-w-[920px]"
          onRetry={() => void settingsQuery.refetch()}
          notice={describeReadFailure({
            consequence:
              'Le tue impostazioni non sono state lette: il modulo mostrerebbe i valori predefiniti, e salvarli sovrascriverebbe i tuoi.',
            untouched: 'Nessuna impostazione è stata modificata.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  const categoriesState = resolveSurfaceState({ loading: loadingCategories, failed: categoriesFailed });
  const accountsState = resolveSurfaceState({ loading: loadingAccounts, failed: accountsFailed });

  return (
    <PageContainer>
      <PageHeader
        {...PAGE_HEADER}
        freshness={freshness}
        actions={
          <div className="flex items-center gap-2">
            {/* The save STATE is the bar at the bottom of the page (it names the tabs) and the dot
                on each tab; the header keeps the actions. In demo the disabled reason is visible
                copy (never a title). */}
            {isDemo && (
              <span className="hidden sm:inline-flex items-center rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground">
                Modalità demo: salvataggio disattivato
              </span>
            )}
            {/* Reset is only meaningful for allocation targets; it is the FACTORY targets, not
                the last save — «Annulla modifiche» in the bar is that. */}
            {activeTab === 'allocazione' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isDemo}
                aria-label="Ripristina default"
                className="h-11 desktop:h-8"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Ripristina default</span>
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={isDemo || saving} className="h-11 desktop:h-8">
              <Save className="h-4 w-4" />
              {saving ? 'Salvataggio…' : 'Salva'}
            </Button>
          </div>
        }
      />

      <PageTabs
        tabs={settingsTabs}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId={SETTINGS_TABS_LAYOUT_ID}
        ariaLabel="Sezioni delle Impostazioni"
        renderedPanels={renderedPanels}
      >
        {/* Each view is a controlled view of its slice; the two without one (Condivisione,
            Aspetto) write where they act. Every panel but Allocazione mounts once opened. */}
        {mountedTabs.has('generale') && (
          <GeneraleTab
            slice={generale}
            onChange={setGenerale}
            declarations={declarations}
            ownerId={ownerId}
            isDemo={isDemo}
            expenseCategories={expenseCategories}
            categoriesState={categoriesState}
            cashSubCategories={allocazione.classes.cash?.subCategoryEnabled ? allocazione.classes.cash.categories : []}
            onGoToAllocazione={() => handleTabChange('allocazione')}
          />
        )}

        <AllocazioneTab
          slice={allocazione}
          onChange={setAllocazione}
          onClassChange={setAllocationClass}
          pendingFocus={draft.pendingFocus}
          onFocusConsumed={consumeFocus}
        />

        {mountedTabs.has('spese') && (
          <SpeseTab
            slice={spese}
            onChange={setSpese}
            ownerId={ownerId}
            expenseCategories={expenseCategories}
            categoriesState={categoriesState}
            onRetryCategories={loadExpenseCategories}
            cashAssets={cashAssets}
            accountsState={accountsState}
            onRetryAccounts={() => void loadCashAccounts()}
            onExpenseImported={handleExpenseImported}
          />
        )}

        {mountedTabs.has('dividendi') && (
          <DividendiTab
            slice={dividendi}
            onChange={setDividendi}
            ownerId={ownerId}
            isDemo={isDemo}
            expenseCategories={expenseCategories}
            categoriesState={categoriesState}
            onRetryCategories={() => void loadExpenseCategories()}
            cashAssets={cashAssets}
            accountsState={accountsState}
            onRetryAccounts={() => void loadCashAccounts()}
          />
        )}

        {mountedTabs.has('condivisione') && <CondivisioneTab isDemo={isDemo} />}

        {mountedTabs.has('aspetto') && <AspettoTab />}
      </PageTabs>

      {/* The save state, where the thumb and the eye are: a bar that sticks to the bottom of the
          scroll area while any tab holds edits, naming them, with the way back beside «Salva».
          Sticky, not fixed: it lives in `<main>`'s flow, so its offset is measured from the
          scroller's content edge — clear of the phone's bottom pill (main's 88px portrait
          padding) and of the sidebar on desktop without a single hand-tuned inset. */}
      {!isDemo && unsavedSentence && (
        <div className="sticky bottom-4 z-20 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
          <section
            aria-label="Modifiche non salvate"
            className="mx-auto flex max-w-[720px] flex-wrap desktop:ml-0 items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg"
          >
            <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              {unsavedSentence}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" className="h-11 desktop:h-8" onClick={() => void handleRevert()} disabled={saving}>
                Annulla modifiche
              </Button>
              <Button size="sm" className="h-11 desktop:h-8" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Salvataggio…' : 'Salva'}
              </Button>
            </div>
          </section>
        </div>
      )}
      {/* Said once when the set of unsaved tabs changes; the bar above is its visible twin. */}
      <span className="sr-only" role="status" aria-live="polite">
        {isDemo ? '' : unsavedSentence ?? ''}
      </span>
    </PageContainer>
  );
}
