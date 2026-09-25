/**
 * SETTINGS PAGE
 *
 * Centralized configuration for portfolio targets and preferences.
 *
 * CONFIGURATION SECTIONS:
 * 1. Asset Allocation Targets (3-level hierarchy: Asset Class → Sub-Category → Specific Assets)
 * 2. Performance Settings (age, risk-free rate for calculations)
 * 3. Expense Categories (income/expense/dividend categories)
 * 4. Dividend Sync Configuration
 *
 * AUTO-CALCULATION FEATURE:
 * When enabled, equity and bonds % calculated automatically using rule of thumb:
 * - Equity = 100 - userAge (younger = more risk tolerance)
 * - Bonds = remainder after equity + other asset classes
 * Based on Bogleheads investment principles.
 *
 * PERCENTAGE VALIDATION (lib/utils/allocationTargetValidation.ts):
 * - Asset classes must sum to AT LEAST 100% (or remainder if cash uses fixed €); above 100% is a
 *   legitimate target leverage (exactly 100% = no leverage)
 * - Sub-categories must sum to 100% within parent
 * - Specific assets must sum to 100% within parent sub-category
 * The first broken rule is stated live in the Target per classe reading; «Salva» refuses to write
 * and takes the reader THERE (opens the group, focuses the field) instead of toasting and leaving.
 *
 * SAVE STATE: one «Salva» for every tab. Each tab keeps its own dirty snapshot, so the tab bar
 * marks the tabs holding edits and a bar at the bottom of the page names them, with «Annulla
 * modifiche» (re-read the saved settings) beside «Salva». The color theme and the light/dark
 * mode are the exception: they save themselves.
 *
 * KEY TRADE-OFFS:
 * - Complex nested state vs flat structure: Nested chosen to mirror target hierarchy
 * - Auto-calculation vs manual: Optional auto-calc simplifies for users following standard advice
 * - Live diagnosis vs blocking input: the reading states the problem while typing, the fields
 *   never refuse a keystroke; only the write is refused
 */

'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';
import {
  getSettings,
  setSettings,
  getDefaultTargets,
  calculateEquityPercentage,
} from '@/lib/services/assetAllocationService';
import {
  dropUnnamedSubTargets,
  findTargetProblem,
  isTargetTotalValid,
  sumSubTargets,
  sumsToHundred,
  type ClassTargetDraft,
  type TargetProblem,
} from '@/lib/utils/allocationTargetValidation';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { narrativeToText } from '@/lib/utils/narrative';
import { resolveAutoEquityBondsSplit } from '@/lib/utils/equityBondsAutoTargets';
import { AssetAllocationTarget, AssetClass, SubCategoryTarget as SubCategoryTargetType, FamilyMember } from '@/types/assets';
import { useQueryClient } from '@tanstack/react-query';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, RotateCcw, Plus, Trash2, ChevronDown, Edit, Receipt, FlaskConical, Coins, ArrowRightLeft, Settings, PieChart, Palette, X, Send, Users, Sun, Moon, Monitor, Link2 } from 'lucide-react';
import { AccountSharingSection } from '@/components/settings/AccountSharingSection';
import { BrokerConnectionsSection } from '@/components/settings/BrokerConnectionsSection';
import ExpenseImportSection from '@/components/settings/ExpenseImportSection';
import { queryKeys } from '@/lib/query/queryKeys';
import { useColorTheme, ColorTheme } from '@/contexts/ColorThemeContext';
import { TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { Asset } from '@/types/assets';
import { getAllAssets } from '@/lib/services/assetService';
import { getAllCategories, deleteCategory, getCategoryById } from '@/lib/services/expenseCategoryService';
import { getExpenseCountByCategoryId, reassignExpensesCategory, clearExpensesCategoryAssignment, moveExpensesToCategory, TransferBoundaryError } from '@/lib/services/expenseService';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import { CategoryDeleteConfirmDialog } from '@/components/expenses/CategoryDeleteConfirmDialog';
import { CategoryMoveDialog } from '@/components/expenses/CategoryMoveDialog';
import { LAZY_CATEGORY_ICONS } from '@/components/expenses/IconPickerPopover';
import { CreateDummySnapshotModal } from '@/components/CreateDummySnapshotModal';
import { DeleteDummyDataDialog } from '@/components/DeleteDummyDataDialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import { pageTabPanelId, type TabDef } from '@/components/layout/PageTabBar';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { applyThemeWithTransition } from '@/lib/utils/themeTransition';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { resolveRitaUnlockAge, DEFAULT_INPS_RETIREMENT_AGE } from '@/lib/utils/pensionUnlock';
import {
  describeAllocationTotal,
  describeAssistantPreferences,
  describeAutoCalc,
  describeBtpItalia,
  describeCashflowSettings,
  describeClassTargets,
  describeColorTheme,
  describeCosts,
  describeDefaultAccounts,
  describeTransferFeeCategory,
  describeDividendCategory,
  describeExpenseCategories,
  describeEmails,
  describeFamily,
  describeFireToggles,
  describePerformanceBase,
  describePlanParameters,
  describeTargetProblem,
  describeThemeMode,
  describeUnsavedChanges,
  summarizeExpenseCategories,
  type ThemeMode,
} from '@/lib/utils/settingsNarrative';

interface SubTarget {
  name: string;
  percentage: number;
  specificAssetsEnabled?: boolean;
  specificAssets?: SpecificAsset[];
  expanded?: boolean; // For UI state (expand/collapse specific assets)
}

interface SpecificAsset {
  name: string;
  targetPercentage: number;
}

interface AssetClassState {
  targetPercentage: number;
  subCategoryEnabled: boolean;
  categories: string[];
  subTargets: SubTarget[];
  expanded: boolean;
}

// The class names Allocazione prints (one label map, no English in brackets: «Azioni», never
// «Azioni (Equity)»).
const assetClassLabel = (assetClass: AssetClass): string => ASSET_CLASS_LABELS[assetClass] ?? assetClass;

// Order: Azioni → Obbligazioni → Commodities → Real Estate → Cash → Crypto → Trend Following → Carry.
// trendFollowing/carry get a settable target here from L2 on:
// alt-beta sleeves whose desired notional exposure can push the total above 100% (= target leverage).
const assetClasses: AssetClass[] = [
  'equity',
  'bonds',
  'commodity',
  'realestate',
  'cash',
  'crypto',
  'trendFollowing',
  'carry',
];

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};

// A percentage with only the decimals the value carries (100 → «100%», 3,5 → «3,5%»).
const pctLabel = (value: number): string => formatPercentage(value, value % 1 === 0 ? 0 : 1);

// The words the Assistant's own popover uses for the response styles.
const ASSISTANT_STYLE_LABELS: Record<'balanced' | 'concise' | 'deep', string> = {
  balanced: 'Bilanciato',
  concise: 'Conciso',
  deep: 'Approfondito',
};

/**
 * Sum of every asset-class target OUTSIDE the auto-calculated Azioni/Obbligazioni pair.
 *
 * Cash drops out of the sum when it is configured as a fixed euro amount: it then lives outside
 * the percentage budget entirely, which is what the total row means by "(excl. cash)".
 */
const sumOtherClassTargets = (
  states: Record<AssetClass, AssetClassState>,
  cashUseFixedAmount: boolean
): number =>
  assetClasses
    .filter((assetClass) => assetClass !== 'equity' && assetClass !== 'bonds')
    .filter((assetClass) => !(assetClass === 'cash' && cashUseFixedAmount))
    .reduce((sum, assetClass) => sum + (states[assetClass]?.targetPercentage || 0), 0);

// Famiglia — household members a pension fund can be attributed to (Impostazioni → Preferenze).
// String-typed draft (never fights the user while typing), same shape as CoastFireTab's pension/tax
// bracket draft editors — plain useState array, no react-hook-form field array anywhere in Settings.
interface FamilyMemberDraft {
  id: string;
  name: string;
  grossAnnualIncome: string;
  isFirstEmploymentPost2007: boolean;
  firstEmploymentYear: string;
}

// Local id generator — CoastFireTab.tsx has an identical `createLocalId`, not exported; duplicated
// here rather than introducing a cross-module import for a one-line helper.
function createFamilyMemberId(): string {
  return `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toFamilyMemberDrafts(members: FamilyMember[] | undefined): FamilyMemberDraft[] {
  return (members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    grossAnnualIncome: member.grossAnnualIncome != null ? String(member.grossAnnualIncome) : '',
    isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
    firstEmploymentYear: member.firstEmploymentYear != null ? String(member.firstEmploymentYear) : '',
  }));
}

// Drops rows with an empty/whitespace-only name (same cleanup-before-validation precedent as the
// empty-subcategory-row cleanup in handleSave) — a nameless member can't be attributed to anything.
function parseFamilyMemberDrafts(drafts: FamilyMemberDraft[]): FamilyMember[] {
  return drafts
    .filter((draft) => draft.name.trim() !== '')
    .map((draft) => {
      const ral = Number.parseFloat(draft.grossAnnualIncome.replace(',', '.'));
      const year = Number.parseInt(draft.firstEmploymentYear, 10);
      return {
        id: draft.id,
        name: draft.name.trim(),
        grossAnnualIncome: Number.isFinite(ral) && ral > 0 ? ral : undefined,
        isFirstEmploymentPost2007: draft.isFirstEmploymentPost2007,
        firstEmploymentYear: Number.isInteger(year) ? year : undefined,
      };
    });
}

// Normalized, order-independent snapshot of a FamilyMember[] for the dirty-state comparison —
// used for BOTH the saved baseline and the live draft state so the two are always comparable.
function familyMembersSnapshotValue(members: FamilyMember[]) {
  return [...members]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      grossAnnualIncome:
        member.grossAnnualIncome !== undefined ? roundToTwoDecimals(member.grossAnnualIncome) : null,
      isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
      firstEmploymentYear: member.firstEmploymentYear ?? null,
    }));
}

// Module-level tab definitions drive both the mobile pill and the desktop underline tabs.
const SETTINGS_TABS: TabDef[] = [
  { value: 'allocazione', label: 'Allocazione', icon: PieChart },
  { value: 'generale',    label: 'Preferenze',  icon: Settings },
  { value: 'spese',       label: 'Spese',       icon: Receipt  },
  { value: 'dividendi',   label: 'Dividendi',   icon: Coins    },
  { value: 'condivisione', label: 'Condivisione', icon: Users   },
  { value: 'collegamenti', label: 'Collegamenti', icon: Link2   },
  { value: 'aspetto',     label: 'Aspetto',     icon: Palette  },
];

// The assistant is a route gated by this flag; its state tile follows the same gate.
const SHOW_ASSISTANT = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';

// Stable no-op store for the SSR/hydration split (same guard ThemePicker uses).
const neverChanges = () => () => {};

// Aspetto → Modalità: the three next-themes modes, applied with the circle view transition.
const THEME_MODES = [
  { value: 'light',  label: 'Chiaro',  Icon: Sun     },
  { value: 'dark',   label: 'Scuro',   Icon: Moon    },
  { value: 'system', label: 'Sistema', Icon: Monitor },
] as const;

// Aspetto → Tema colori. Swatch previews carry each theme's own oklch values on purpose:
// they PREVIEW a palette that is not active, which no CSS token can express.
const COLOR_THEME_SWATCHES = [
  {
    id: 'default' as ColorTheme,
    name: 'Default',
    description: 'Zinc classico',
    swatchBg: 'oklch(1 0 0)',
    swatchBgDark: 'oklch(0.145 0 0)',
    swatchPrimary: 'oklch(0.205 0 0)',
    swatchPrimaryDark: 'oklch(0.922 0 0)',
    swatchAccent: 'oklch(0.97 0 0)',
  },
  {
    id: 'solar-dusk' as ColorTheme,
    name: 'Solar Dusk',
    description: 'Ambra calda',
    swatchBg: 'oklch(0.9885 0.0057 84.5659)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.5553 0.1455 48.9975)',
    swatchPrimaryDark: 'oklch(0.7049 0.1867 47.6044)',
    swatchAccent: 'oklch(0.9000 0.0500 74.9889)',
  },
  {
    id: 'elegant-luxury' as ColorTheme,
    name: 'Elegant Luxury',
    description: 'Borgogna raffinato',
    swatchBg: 'oklch(0.9779 0.0042 56.3756)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.4650 0.1470 24.9381)',
    swatchPrimaryDark: 'oklch(0.5054 0.1905 27.5181)',
    swatchAccent: 'oklch(0.9619 0.0580 95.6174)',
  },
  {
    id: 'midnight-bloom' as ColorTheme,
    name: 'Midnight Bloom',
    description: 'Viola profondo',
    swatchBg: 'oklch(0.9821 0 0)',
    swatchBgDark: 'oklch(0.2303 0.0125 264.2926)',
    swatchPrimary: 'oklch(0.5676 0.2021 283.0838)',
    swatchPrimaryDark: 'oklch(0.5676 0.2021 283.0838)',
    swatchAccent: 'oklch(0.8214 0.0720 249.3482)',
  },
  {
    id: 'cyberpunk' as ColorTheme,
    name: 'Cyberpunk',
    description: 'Neon pink & teal',
    swatchBg: 'oklch(0.9816 0.0017 247.8390)',
    swatchBgDark: 'oklch(0.1649 0.0352 281.8285)',
    swatchPrimary: 'oklch(0.6726 0.2904 341.4084)',
    swatchPrimaryDark: 'oklch(0.6726 0.2904 341.4084)',
    swatchAccent: 'oklch(0.8903 0.1739 171.2690)',
  },
  {
    id: 'retro-arcade' as ColorTheme,
    name: 'Retro Arcade',
    description: 'Rosso & teal vintage',
    swatchBg: 'oklch(0.9735 0.0261 90.0953)',
    swatchBgDark: 'oklch(0.2673 0.0486 219.8169)',
    swatchPrimary: 'oklch(0.5924 0.2025 355.8943)',
    swatchPrimaryDark: 'oklch(0.5924 0.2025 355.8943)',
    swatchAccent: 'oklch(0.6437 0.1019 187.3840)',
  },
] as const;

/** Label · mono value row of a read-only declaration tile (Parametri del piano, Assistente, BTP Italia). */
function DeclarationRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold', mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  );
}

/**
 * Ids of the target fields «Salva» can send the focus to (see `revealTargetProblem`). A class's
 * own input keeps the bare class id, which its `aria-label` already names.
 */
const targetFieldId = {
  subName: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-name`,
  subPct: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-pct`,
  assetName: (assetClass: AssetClass, subIndex: number, assetIndex: number) =>
    `target-${assetClass}-sub-${subIndex}-asset-${assetIndex}-name`,
  assetPct: (assetClass: AssetClass, subIndex: number, assetIndex: number) =>
    `target-${assetClass}-sub-${subIndex}-asset-${assetIndex}-pct`,
  assetAdd: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-asset-add`,
};

/** What a first press on a category's delete led to. */
type CategoryDeleteRequest = 'dialog' | 'arm' | 'failed';

interface CategoryRowProps {
  category: ExpenseCategory;
  onEdit: (category: ExpenseCategory) => void;
  onMove: (category: ExpenseCategory, triggerOrigin: string) => void;
  /**
   * The first press: a category WITH movements opens the reassignment dialog (which is its
   * confirmation), one without them arms the row — its second press deletes.
   */
  onRequestDelete: (category: ExpenseCategory, triggerOrigin: string) => Promise<CategoryDeleteRequest>;
  onConfirmDelete: (categoryId: string) => void;
  /** The list's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
}

/**
 * One category of the Categorie tile. Module-level because the armed state of its delete lives
 * here (`useArmedDelete`: no timer — the 3-second auto-disarm this row used to have was a WCAG
 * 2.2.1 time limit and announced nothing); the button stays a compact «Conferma» and the ROW
 * prints what the second press does (AGENTS.md → Accessibility).
 */
function CategoryRow({ category, onEdit, onMove, onRequestDelete, onConfirmDelete, announce }: CategoryRowProps) {
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick: onArmedClick, onBlur } = useArmedDelete(deleteRef, () => onConfirmDelete(category.id));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${category.name}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, category.name]);

  const handleDeleteClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (armed) {
      onArmedClick();
      return;
    }
    const origin = resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect());
    if ((await onRequestDelete(category, origin)) === 'arm') onArmedClick();
  };

  // A LOOKUP in the module-level map, never a call: a component obtained from a call during
  // render is a new type every render (`react-hooks/static-components`).
  const CatIcon = category.icon ? LAZY_CATEGORY_ICONS[category.icon] : undefined;
  const iconButtonClass = 'h-11 w-11 desktop:h-8 desktop:w-8';

  return (
    <div className={cn('flex items-center justify-between gap-3 py-2.5 transition-colors', armed ? 'bg-destructive/5' : 'hover:bg-muted/30')}>
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: category.color ? `${category.color}20` : 'var(--muted)' }}
        >
          {CatIcon ? (
            <Suspense fallback={<div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: category.color || 'var(--chart-1)' }} />}>
              <CatIcon className="h-3.5 w-3.5" style={{ color: category.color || 'var(--muted-foreground)' }} aria-hidden="true" />
            </Suspense>
          ) : (
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color || 'var(--chart-1)' }} />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{category.name}</p>
          {armed ? (
            <p className="text-[11px] leading-[1.4] text-destructive">Nessuna transazione la usa: «Conferma» la elimina.</p>
          ) : (
            category.subCategories.length > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">
                {category.subCategories.length} {category.subCategories.length === 1 ? 'sottocategoria' : 'sottocategorie'}:{' '}
                {category.subCategories.map((sub) => sub.name).join(', ')}
              </p>
            )
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className={iconButtonClass} aria-label={`Modifica ${category.name}`} onClick={() => onEdit(category)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClass}
          aria-label={`Sposta tutte le transazioni di ${category.name}`}
          onClick={(event) => onMove(category, resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect()))}
        >
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          ref={deleteRef}
          variant="ghost"
          size="sm"
          aria-label={armed ? `Conferma eliminazione di ${category.name}` : `Elimina ${category.name}`}
          className={cn('h-11 min-w-11 desktop:h-8 desktop:min-w-8', armed && 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
          onClick={handleDeleteClick}
          onBlur={onBlur}
        >
          <Trash2 className={cn('h-4 w-4', !armed && 'text-muted-foreground')} />
          {armed && <span className="text-xs">Conferma</span>}
        </Button>
      </div>
    </div>
  );
}

interface SyncDividendsButtonProps {
  disabled: boolean;
  syncing: boolean;
  onSync: () => void;
  /** The tile's live region: the armed and disarmed states are said, not only drawn. */
  announce: (text: string) => void;
}

/**
 * «Sincronizza dividendi esistenti» — a two-click confirm (`useArmedDelete`, no timer). It writes
 * cashflow rows for every recorded dividend, so the first press asks; it does not destroy
 * anything, so the armed state is the primary tint, not the destructive one.
 */
function SyncDividendsButton({ disabled, syncing, onSync, announce }: SyncDividendsButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onSync);
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce('Premi di nuovo per sincronizzare i dividendi già registrati');
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Sincronizzazione annullata');
    }
  }, [armed, announce]);

  return (
    <Button
      ref={ref}
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      variant={armed ? 'default' : 'outline'}
      className="h-11 gap-2 desktop:h-9"
    >
      <Coins className="h-4 w-4" />
      {syncing ? 'Sincronizzazione…' : armed ? 'Conferma sincronizzazione' : 'Sincronizza dividendi esistenti'}
    </Button>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  /** A failed read of the settings is not a set of defaults: the form must not offer to save them. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userAge, setUserAge] = useState<number | undefined>(undefined);
  const [riskFreeRate, setRiskFreeRate] = useState<number | undefined>(undefined);
  const [autoCalculate, setAutoCalculate] = useState(false);
  const [cashUseFixedAmount, setCashUseFixedAmount] = useState(false);
  const [cashFixedAmount, setCashFixedAmount] = useState<number>(0);
  const [includePrimaryResidenceInFIRE, setIncludePrimaryResidenceInFIRE] = useState<boolean>(false);
  const [goalBasedInvestingEnabled, setGoalBasedInvestingEnabled] = useState<boolean>(false);
  const [goalDrivenAllocationEnabled, setGoalDrivenAllocationEnabled] = useState<boolean>(false);
  const [stampDutyEnabled, setStampDutyEnabled] = useState<boolean>(false);
  const [stampDutyRate, setStampDutyRate] = useState<number>(0.2);
  const [checkingAccountSubCategory, setCheckingAccountSubCategory] = useState<string>('__none__');
  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(2025);
  const [laborIncomeCategoryIds, setLaborIncomeCategoryIds] = useState<string[]>([]);
  const [costCentersEnabled, setCostCentersEnabled] = useState<boolean>(false);
  const [expenseSplitEnabled, setExpenseSplitEnabled] = useState<boolean>(false);
  const [performanceIncludesPensionFunds, setPerformanceIncludesPensionFunds] = useState<boolean>(false);
  const [performanceIncludesExcludedAssets, setPerformanceIncludesExcludedAssets] = useState<boolean>(false);
  const [performanceExcludesCash, setPerformanceExcludesCash] = useState<boolean>(false);
  const [pensionReturnStartMonth, setPensionReturnStartMonth] = useState<string>('');
  // Read-only declarations (state + link tiles). These fields are OWNED by other pages —
  // FIRE › Calcolatore (Parametri), Coast FIRE (Ipotesi), the Assistant's preferences popover —
  // so this page reads them for the tile's reading line and never writes them (no snapshot).
  const [planParams, setPlanParams] = useState<{
    withdrawalRate?: number;
    plannedAnnualExpenses?: number;
    pensionInpsRetirementAge?: number;
    pensionRitaLongUnemployment: boolean;
    respectPensionLockInFire: boolean;
  }>({ pensionRitaLongUnemployment: false, respectPensionLockInFire: false });
  const [assistantPrefs, setAssistantPrefs] = useState<{
    responseStyle?: 'balanced' | 'concise' | 'deep';
    memoryEnabled?: boolean;
    macroContextEnabled?: boolean;
  }>({});
  const [monthlyEmailEnabled, setMonthlyEmailEnabled] = useState<boolean>(false);
  const [quarterlyEmailEnabled, setQuarterlyEmailEnabled] = useState<boolean>(false);
  const [semiAnnualEmailEnabled, setSemiAnnualEmailEnabled] = useState<boolean>(false);
  const [yearlyEmailEnabled, setYearlyEmailEnabled] = useState<boolean>(false);
  const [weeklyBudgetEmailEnabled, setWeeklyBudgetEmailEnabled] = useState<boolean>(false);
  const [monthlyEmailRecipients, setMonthlyEmailRecipients] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [sendingTestEmailType, setSendingTestEmailType] = useState<'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget' | null>(null);
  const [assetClassStates, setAssetClassStates] = useState<
    Record<AssetClass, AssetClassState>
  >({} as Record<AssetClass, AssetClassState>);

  // Track original subcategory names to handle renames (Bug #2 fix)
  const [subcategoryNameMap, setSubcategoryNameMap] = useState<{
    [assetClass: string]: { [currentName: string]: string }; // currentName -> originalName
  }>({});

  // Expense categories state. `loadingCategories` starts TRUE: before the first read an empty
  // list is «not read yet», never «no categories».
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  /** The categories were not read: every tile fed by them says so instead of «nessuna». */
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  // Announcements of the Categorie list and of the dividend sync (one live region each).
  const [categoryAnnouncement, setCategoryAnnouncement] = useState('');
  const [syncAnnouncement, setSyncAnnouncement] = useState('');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);

  // Delete confirmation dialog state
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);
  const [expenseCountToReassign, setExpenseCountToReassign] = useState(0);

  // Move dialog state
  const [moveCategoryDialogOpen, setMoveCategoryDialogOpen] = useState(false);
  const [categoryToMove, setCategoryToMove] = useState<ExpenseCategory | null>(null);
  const [expenseCountToMove, setExpenseCountToMove] = useState(0);

  // Default cash account settings — the accounts are read beside the settings, with their own
  // wait and their own failure (a failed read is not «nessun conto»).
  const [cashAssets, setCashAssets] = useState<Asset[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [defaultDebitCashAssetId, setDefaultDebitCashAssetId] = useState<string>('__none__');
  const [defaultCreditCashAssetId, setDefaultCreditCashAssetId] = useState<string>('__none__');
  // Where a transfer's fee lands ('' = none: the expense form's «Commissione» stays off).
  const [transferFeeCategoryId, setTransferFeeCategoryId] = useState<string>('');
  const [transferFeeSubCategoryId, setTransferFeeSubCategoryId] = useState<string>('');

  // Dividend settings state
  const [dividendIncomeCategoryId, setDividendIncomeCategoryId] = useState<string>('');
  const [dividendIncomeSubCategoryId, setDividendIncomeSubCategoryId] = useState<string>('');
  // Default account credited by dividends and coupons ('__none__' = none, like the expense defaults).
  const [dividendCashAssetId, setDividendCashAssetId] = useState<string>('__none__');
  const [syncingDividends, setSyncingDividends] = useState(false);

  // Test snapshot modal state
  const [dummySnapshotModalOpen, setDummySnapshotModalOpen] = useState(false);
  const [deleteDummyDataDialogOpen, setDeleteDummyDataDialogOpen] = useState(false);
  const enableTestSnapshots = process.env.NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS === 'true';

  // Tab navigation — lazy-loading pattern (same as Assets/Cashflow pages)
  type SettingsTabId = 'generale' | 'allocazione' | 'spese' | 'dividendi' | 'condivisione' | 'collegamenti' | 'aspetto';
  const VALID_TABS: SettingsTabId[] = ['generale', 'allocazione', 'spese', 'dividendi', 'condivisione', 'collegamenti', 'aspetto'];
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialTab = (VALID_TABS.includes(searchParams.get('tab') as SettingsTabId)
    ? searchParams.get('tab') as SettingsTabId
    : 'allocazione');
  const [mountedTabs, setMountedTabs] = useState<Set<SettingsTabId>>(new Set([initialTab]));
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const { colorTheme, setColorTheme } = useColorTheme();
  const { theme, setTheme } = useTheme();
  // The active next-themes mode does not exist until hydration (same guard as ThemePicker).
  const isThemeHydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  const [allocationBaselineKey, setAllocationBaselineKey] = useState('');
  const [generalBaselineKey, setGeneralBaselineKey] = useState('');
  const [familyMemberDrafts, setFamilyMemberDrafts] = useState<FamilyMemberDraft[]>([]);
  const [dividendBaselineKey, setDividendBaselineKey] = useState('');
  const [speseBaselineKey, setSpeseBaselineKey] = useState('');
  const [deleteDialogOrigin, setDeleteDialogOrigin] = useState<string | undefined>(
    undefined
  );
  const [moveDialogOrigin, setMoveDialogOrigin] = useState<string | undefined>(
    undefined
  );

  const interactiveControlClass =
    'motion-safe:transition-[border-color,box-shadow,background-color,color] motion-safe:duration-150 motion-reduce:transition-none';

  const handleTabChange = (value: string) => {
    setActiveTab(value as SettingsTabId);
    setMountedTabs((prev) => new Set(prev).add(value as SettingsTabId));
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  // Sync URL on mount so the initial tab is always reflected
  useEffect(() => {
    router.replace(`${pathname}?tab=${initialTab}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-calculated Azioni/Obbligazioni: the pair is a function of age, risk-free rate and the
  // other classes' targets (the others are funded out of the equity sleeve, so raising the
  // crypto target lowers Azioni while Obbligazioni stay at the formula's residual). It is
  // applied during render (React's adjust-state-during-render) whenever it moved — the two
  // effects it replaces set the same values, one on age/rate/toggle, one on the other classes
  // (react-hooks/set-state-in-effect); writing only when something moved is what keeps this
  // from looping on its own write.
  if (
    autoCalculate &&
    userAge !== undefined &&
    riskFreeRate !== undefined &&
    Object.keys(assetClassStates).length > 0
  ) {
    const { equityPercentage, bondsPercentage } = resolveAutoEquityBondsSplit(
      calculateEquityPercentage(userAge, riskFreeRate),
      sumOtherClassTargets(assetClassStates, cashUseFixedAmount)
    );
    if (
      assetClassStates.equity?.targetPercentage !== equityPercentage ||
      assetClassStates.bonds?.targetPercentage !== bondsPercentage
    ) {
      setAssetClassStates({
        ...assetClassStates,
        equity: { ...assetClassStates.equity, targetPercentage: equityPercentage },
        bonds: { ...assetClassStates.bonds, targetPercentage: bondsPercentage },
      });
    }
  }

  /**
   * Reads the saved settings into the form and captures the four dirty baselines from them.
   * `quiet` keeps the page on screen instead of the skeleton: it is «Annulla modifiche», which
   * re-reads what is saved rather than keeping a second copy of it — so an edit the co-owner
   * saved meanwhile comes back too. Resolves `true` once the form holds the saved values.
   */
  const loadTargets = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}): Promise<boolean> => {
    if (!user || !ownerId) return false;

    try {
      if (!quiet) setLoading(true);
      setLoadFailed(false);
      const settingsData = await getSettings(ownerId);
      const targets = settingsData?.targets || getDefaultTargets();

      // Load user age and risk-free rate if available
      if (settingsData) {
        setUserAge(settingsData.userAge);
        setRiskFreeRate(settingsData.riskFreeRate);
        // Use explicit persisted flag when available; fall back to presence of age+rate for
        // backward-compat with existing users who never explicitly toggled the switch.
        setAutoCalculate(
          settingsData.autoCalculateEquityBonds ??
          (settingsData.userAge !== undefined && settingsData.riskFreeRate !== undefined)
        );
        // Load FIRE setting (Bug #1 fix)
        setIncludePrimaryResidenceInFIRE(settingsData.includePrimaryResidenceInFIRE ?? false);
        setGoalBasedInvestingEnabled(settingsData.goalBasedInvestingEnabled ?? false);
        setGoalDrivenAllocationEnabled(settingsData.goalDrivenAllocationEnabled ?? false);
        // Load default cash account settings
        setDefaultDebitCashAssetId(settingsData.defaultDebitCashAssetId || '__none__');
        setDefaultCreditCashAssetId(settingsData.defaultCreditCashAssetId || '__none__');
        setTransferFeeCategoryId(settingsData.transferFeeCategoryId || '');
        setTransferFeeSubCategoryId(settingsData.transferFeeSubCategoryId || '');
        // Load stamp duty settings
        setStampDutyEnabled(settingsData.stampDutyEnabled ?? false);
        setStampDutyRate(settingsData.stampDutyRate ?? 0.2);
        setCheckingAccountSubCategory(settingsData.checkingAccountSubCategory || '__none__');
        setCashflowHistoryStartYear(settingsData.cashflowHistoryStartYear ?? 2025);
        setLaborIncomeCategoryIds(settingsData.laborIncomeCategoryIds ?? []);
        setCostCentersEnabled(settingsData.costCentersEnabled ?? false);
        setExpenseSplitEnabled(settingsData.expenseSplitEnabled ?? false);
        setPerformanceIncludesPensionFunds(settingsData.performanceIncludesPensionFunds ?? false);
        setPerformanceIncludesExcludedAssets(settingsData.performanceIncludesExcludedAssets ?? false);
        setPerformanceExcludesCash(settingsData.performanceExcludesCash ?? false);
        setPensionReturnStartMonth(settingsData.pensionReturnStartMonth ?? '');
        setMonthlyEmailEnabled(settingsData.monthlyEmailEnabled ?? false);
        setQuarterlyEmailEnabled(settingsData.quarterlyEmailEnabled ?? false);
        setSemiAnnualEmailEnabled(settingsData.semiAnnualEmailEnabled ?? false);
        setYearlyEmailEnabled(settingsData.yearlyEmailEnabled ?? false);
        setWeeklyBudgetEmailEnabled(settingsData.weeklyBudgetEmailEnabled ?? false);
        setMonthlyEmailRecipients(settingsData.monthlyEmailRecipients ?? []);
        // Load dividend settings
        setDividendIncomeCategoryId(settingsData.dividendIncomeCategoryId || '');
        setDividendIncomeSubCategoryId(settingsData.dividendIncomeSubCategoryId || '');
        setDividendCashAssetId(settingsData.dividendCashAssetId || '__none__');
        // Load family members (fondo pensione per-taxpayer RAL/eligibility)
        setFamilyMemberDrafts(toFamilyMemberDrafts(settingsData.familyMembers));
        // Read-only declarations for the state+link tiles (owned by the FIRE pages / Assistant)
        setPlanParams({
          withdrawalRate: settingsData.withdrawalRate,
          plannedAnnualExpenses: settingsData.plannedAnnualExpenses,
          pensionInpsRetirementAge: settingsData.pensionInpsRetirementAge,
          pensionRitaLongUnemployment: settingsData.pensionRitaLongUnemployment ?? false,
          respectPensionLockInFire: settingsData.respectPensionLockInFire ?? false,
        });
        setAssistantPrefs({
          responseStyle: settingsData.assistantResponseStyle,
          memoryEnabled: settingsData.assistantMemoryEnabled,
          macroContextEnabled: settingsData.assistantMacroContextEnabled,
        });
      }

      // Load cash fixed amount settings if available
      const cashTargetData = targets['cash'];
      if (cashTargetData) {
        setCashUseFixedAmount(cashTargetData.useFixedAmount || false);
        setCashFixedAmount(cashTargetData.fixedAmount || 0);
      }

      const states: Record<AssetClass, AssetClassState> = {} as Record<
        AssetClass,
        AssetClassState
      >;

      // Initialize subcategoryNameMap for rename tracking (Bug #2 fix)
      const nameMapByAssetClass: {
        [assetClass: string]: { [currentName: string]: string };
      } = {};

      assetClasses.forEach((assetClass) => {
        const targetData = targets[assetClass];
        const subCategoryConfig = targetData?.subCategoryConfig;
        const subTargets = targetData?.subTargets;

        const subTargetsArray = subTargets
          ? Object.entries(subTargets).map(([name, value]) => {
              // Support both old format (number) and new format (SubCategoryTarget)
              if (typeof value === 'number') {
                return {
                  name,
                  percentage: value,
                };
              } else {
                return {
                  name,
                  percentage: value.targetPercentage,
                  specificAssetsEnabled: value.specificAssetsEnabled || false,
                  specificAssets: value.specificAssets || [],
                  expanded: false,
                };
              }
            })
          : [];

        // Initialize name map: current name -> original name (initially same)
        const nameMap: { [name: string]: string } = {};
        subTargetsArray.forEach(st => {
          nameMap[st.name] = st.name;
        });
        nameMapByAssetClass[assetClass] = nameMap;

        states[assetClass] = {
          targetPercentage: targetData?.targetPercentage || 0,
          subCategoryEnabled: subCategoryConfig?.enabled || false,
          categories: subCategoryConfig?.categories || [],
          subTargets: subTargetsArray,
          expanded: false,
        };
      });

      setAssetClassStates(states);
      setSubcategoryNameMap(nameMapByAssetClass);

      setAllocationBaselineKey(
        JSON.stringify({
          // Età and risk-free are typed in the Auto-calcolo tile (moved back from Preferenze ›
          // Profilo on 2026-09-22): the snapshot follows the tab that EDITS a field.
          userAge: settingsData?.userAge ?? null,
          riskFreeRate: settingsData?.riskFreeRate ?? null,
          autoCalculate:
            settingsData?.autoCalculateEquityBonds ??
            (settingsData?.userAge !== undefined && settingsData?.riskFreeRate !== undefined),
          cashUseFixedAmount: cashTargetData?.useFixedAmount || false,
          cashFixedAmount: roundToTwoDecimals(cashTargetData?.fixedAmount || 0),
          assetClassStates: assetClasses.map((assetClass) => ({
            assetClass,
            targetPercentage: roundToTwoDecimals(
              states[assetClass]?.targetPercentage || 0
            ),
            subCategoryEnabled: states[assetClass]?.subCategoryEnabled || false,
            categories: states[assetClass]?.categories || [],
            subTargets: (states[assetClass]?.subTargets || []).map((target) => ({
              name: target.name,
              percentage: roundToTwoDecimals(target.percentage),
              specificAssetsEnabled: target.specificAssetsEnabled || false,
              specificAssets: (target.specificAssets || []).map((asset) => ({
                name: asset.name,
                targetPercentage: roundToTwoDecimals(asset.targetPercentage),
              })),
            })),
          })),
        })
      );

      setGeneralBaselineKey(
        JSON.stringify({
          includePrimaryResidenceInFIRE:
            settingsData?.includePrimaryResidenceInFIRE ?? false,
          goalBasedInvestingEnabled: settingsData?.goalBasedInvestingEnabled ?? false,
          goalDrivenAllocationEnabled:
            settingsData?.goalDrivenAllocationEnabled ?? false,
          stampDutyEnabled: settingsData?.stampDutyEnabled ?? false,
          stampDutyRate: roundToTwoDecimals(settingsData?.stampDutyRate ?? 0.2),
          checkingAccountSubCategory:
            settingsData?.checkingAccountSubCategory || '__none__',
          cashflowHistoryStartYear: settingsData?.cashflowHistoryStartYear ?? 2025,
          laborIncomeCategoryIds: [...(settingsData?.laborIncomeCategoryIds ?? [])].sort(),
          costCentersEnabled: settingsData?.costCentersEnabled ?? false,
          expenseSplitEnabled: settingsData?.expenseSplitEnabled ?? false,
          performanceIncludesPensionFunds: settingsData?.performanceIncludesPensionFunds ?? false,
          performanceIncludesExcludedAssets: settingsData?.performanceIncludesExcludedAssets ?? false,
          performanceExcludesCash: settingsData?.performanceExcludesCash ?? false,
          pensionReturnStartMonth: settingsData?.pensionReturnStartMonth ?? '',
          monthlyEmailEnabled: settingsData?.monthlyEmailEnabled ?? false,
          quarterlyEmailEnabled: settingsData?.quarterlyEmailEnabled ?? false,
          semiAnnualEmailEnabled: settingsData?.semiAnnualEmailEnabled ?? false,
          yearlyEmailEnabled: settingsData?.yearlyEmailEnabled ?? false,
          weeklyBudgetEmailEnabled: settingsData?.weeklyBudgetEmailEnabled ?? false,
          monthlyEmailRecipients: [...(settingsData?.monthlyEmailRecipients ?? [])].sort(),
          familyMembers: familyMembersSnapshotValue(settingsData?.familyMembers ?? []),
        })
      );

      setDividendBaselineKey(
        JSON.stringify({
          dividendIncomeCategoryId: settingsData?.dividendIncomeCategoryId || '',
          dividendIncomeSubCategoryId:
            settingsData?.dividendIncomeSubCategoryId || '',
          dividendCashAssetId: settingsData?.dividendCashAssetId || '__none__',
        })
      );

      setSpeseBaselineKey(
        JSON.stringify({
          defaultDebitCashAssetId: settingsData?.defaultDebitCashAssetId || '__none__',
          defaultCreditCashAssetId: settingsData?.defaultCreditCashAssetId || '__none__',
          transferFeeCategoryId: settingsData?.transferFeeCategoryId || '',
          transferFeeSubCategoryId: settingsData?.transferFeeSubCategoryId || '',
        })
      );
      return true;
    } catch (error) {
      setLoadFailed(true);
      console.error('Error loading targets:', error);
      toast.error('Errore nel caricamento dei target');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, ownerId]);

  const loadExpenseCategories = useCallback(async () => {
    if (!user || !ownerId) return;

    try {
      setLoadingCategories(true);
      setCategoriesFailed(false);
      const categories = await getAllCategories(ownerId);
      setExpenseCategories(categories);
    } catch (error) {
      // No toast: the tiles that depend on the categories carry the failure in place.
      console.error('Error loading expense categories:', error);
      setCategoriesFailed(true);
    } finally {
      setLoadingCategories(false);
    }
  }, [user, ownerId]);

  const loadCashAccounts = useCallback(async () => {
    if (!ownerId) return;

    try {
      setLoadingAccounts(true);
      setAccountsFailed(false);
      const assets = await getAllAssets(ownerId);
      // Default debit/credit account picker: an actual conto, not just a "cash-class" asset —
      // a money-market ETF (assetClass 'cash') is not a settlement account. Strict convention
      // (convenzione stretta, doc/guide/patrimonio.md § Asset Pricing, FX and Assets).
      setCashAssets(assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash'));
    } catch (error) {
      // It used to have no catch at all: a failed read left `[]`, and the tile told the reader
      // to create an account they already had.
      console.error('Error loading cash accounts:', error);
      setAccountsFailed(true);
    } finally {
      setLoadingAccounts(false);
    }
  }, [ownerId]);

  // First load, and again when the viewed account changes (doc/guide/account-condiviso-demo.md § Shared Account / Delegated Access: manual
  // loaders key on ownerId).
  useEffect(() => {
    if (!user || !ownerId) return;
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadTargets();
      loadExpenseCategories();
      loadCashAccounts();
    }, 0);
    return () => clearTimeout(timer);
  }, [user, ownerId, loadTargets, loadExpenseCategories, loadCashAccounts]);

  // Refresh categories (the import may have created new ones) and invalidate every
  // Cashflow query key that reads expenses/categories/overview data, so the freshly
  // imported transactions show up without a manual page reload.
  const handleExpenseImported = () => {
    loadExpenseCategories();
    if (ownerId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
    }
  };

  const handleAddExpenseCategory = () => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  };

  const handleEditExpenseCategory = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  };

  // The first press on a category's delete. With movements the reassignment dialog IS the
  // confirmation; without them the row arms itself (CategoryRow) and deletes at the second press.
  const requestCategoryDelete = async (
    category: ExpenseCategory,
    triggerOrigin: string
  ): Promise<CategoryDeleteRequest> => {
    if (!user || !ownerId) return 'failed';

    try {
      const expenseCount = await getExpenseCountByCategoryId(category.id, ownerId);
      if (expenseCount === 0) return 'arm';

      const fresh = await getCategoryById(category.id);
      if (!fresh) return 'failed';
      setCategoryToDelete(fresh);
      setExpenseCountToReassign(expenseCount);
      setDeleteDialogOrigin(triggerOrigin);
      setDeleteConfirmDialogOpen(true);
      return 'dialog';
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Errore nell'eliminazione della categoria");
      return 'failed';
    }
  };

  const announceCategory = useCallback((text: string) => setCategoryAnnouncement(text), []);
  const announceSync = useCallback((text: string) => setSyncAnnouncement(text), []);

  const handleConfirmDeleteWithReassignment = async (
    newCategoryId?: string,
    newSubCategoryId?: string
  ) => {
    if (!categoryToDelete || !user || !ownerId) return;

    try {
      // If no new category ID provided, delete without reassignment
      if (!newCategoryId) {
        // Clear category assignment from expenses (set to "Senza categoria")
        const clearedCount = await clearExpensesCategoryAssignment(
          categoryToDelete.id,
          ownerId
        );

        // Delete the category
        await deleteCategory(categoryToDelete.id);

        toast.success(
          `Categoria "${categoryToDelete.name}" eliminata con successo. ${clearedCount} ${clearedCount === 1 ? 'spesa contrassegnata' : 'spese contrassegnate'} come "Senza categoria".`
        );

        // Reset state and reload categories
        setDeleteConfirmDialogOpen(false);
        setCategoryToDelete(null);
        setExpenseCountToReassign(0);
        await loadExpenseCategories();
        return;
      }

      // Get the new category details
      const newCategory = await getCategoryById(newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      // Get subcategory name if provided
      let newSubCategoryName: string | undefined;
      if (newSubCategoryId) {
        const newSubCategory = newCategory.subCategories.find(
          sub => sub.id === newSubCategoryId
        );
        newSubCategoryName = newSubCategory?.name;
      }

      // Reassign expenses
      const reassignedCount = await reassignExpensesCategory(
        categoryToDelete.id,
        newCategoryId,
        newCategory.name,
        ownerId,
        newSubCategoryId,
        newSubCategoryName
      );

      // Delete the old category
      await deleteCategory(categoryToDelete.id);

      toast.success(
        `${reassignedCount} ${reassignedCount === 1 ? 'spesa riassegnata' : 'spese riassegnate'} a "${newCategory.name}" e categoria eliminata con successo`
      );

      // Reset state and reload categories
      setDeleteConfirmDialogOpen(false);
      setCategoryToDelete(null);
      setExpenseCountToReassign(0);
      await loadExpenseCategories();
    } catch (error) {
      console.error('Error during reassignment and deletion:', error);
      toast.error('Errore durante la riassegnazione delle spese');
    }
  };

  // The second press of an armed row (zero-expense path).
  const handleConfirmDirectDelete = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);
      toast.success('Categoria eliminata con successo');
      await loadExpenseCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Errore nell'eliminazione della categoria");
    }
  };

  // ========== Move Category Handlers ==========

  const handleMoveExpenseCategory = async (source: ExpenseCategory, triggerOrigin: string) => {
    if (!user || !ownerId) return;

    try {
      const expenseCount = await getExpenseCountByCategoryId(source.id, ownerId);

      if (expenseCount === 0) {
        toast.warning(`La categoria «${source.name}» non ha transazioni da spostare`);
        return;
      }

      const category = await getCategoryById(source.id);
      if (category) {
        setCategoryToMove(category);
        setExpenseCountToMove(expenseCount);
        setMoveDialogOrigin(triggerOrigin);
        setMoveCategoryDialogOpen(true);
      }
    } catch (error) {
      console.error('Error checking category expenses:', error);
      toast.error('Errore nel controllo delle transazioni');
    }
  };

  const handleConfirmMoveCategory = async (
    newCategoryId: string,
    newSubCategoryId?: string
  ) => {
    if (!categoryToMove || !user || !ownerId) return;

    try {
      const newCategory = await getCategoryById(newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      // Resolve subcategory name if provided
      let newSubCategoryName: string | undefined;
      if (newSubCategoryId && newSubCategoryId !== '__none__') {
        const newSubCategory = newCategory.subCategories.find(
          sub => sub.id === newSubCategoryId
        );
        newSubCategoryName = newSubCategory?.name;
      } else {
        // Sentinel value or no subcategory selected
        newSubCategoryId = undefined;
      }

      const movedCount = await moveExpensesToCategory(
        categoryToMove.id,
        categoryToMove.type,
        newCategoryId,
        newCategory.name,
        newCategory.type,
        ownerId,
        newSubCategoryId,
        newSubCategoryName
      );

      toast.success(
        `${movedCount} ${movedCount === 1 ? 'transazione spostata' : 'transazioni spostate'} da "${categoryToMove.name}" a "${newCategory.name}"`
      );

      // Reset state — source category is NOT deleted
      setMoveCategoryDialogOpen(false);
      setCategoryToMove(null);
      setExpenseCountToMove(0);
    } catch (error) {
      console.error('Error during category move:', error);
      toast.error(
        error instanceof TransferBoundaryError ? error.message : 'Errore nello spostamento delle transazioni'
      );
    }
  };

  const handleExpenseCategoryDialogClose = () => {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
  };

  const handleExpenseCategorySuccess = async () => {
    await loadExpenseCategories();
  };

  // Dividend sync — the CATEGORY itself is saved by the page's one Save (handleSave already
  // persists it); the tab keeps only the sync action, so the field has a single save surface.
  // Runs at the SECOND press of SyncDividendsButton.
  const handleSyncDividends = async () => {
    if (!user || !ownerId) return;

    if (!dividendIncomeCategoryId) {
      toast.error('Seleziona prima una categoria per le entrate da dividendi');
      return;
    }

    try {
      setSyncingDividends(true);

      // Get category details
      const category = await getCategoryById(dividendIncomeCategoryId);
      if (!category) {
        toast.error('Categoria non trovata');
        return;
      }

      // Get subcategory name if selected
      let subCategoryName: string | undefined;
      if (dividendIncomeSubCategoryId) {
        const subCategory = category.subCategories.find(
          (sub) => sub.id === dividendIncomeSubCategoryId
        );
        subCategoryName = subCategory?.name;
      }

      // Fetch all dividends for this user
      const response = await authenticatedFetch(`/api/dividends?userId=${ownerId}`);
      if (!response.ok) {
        throw new Error('Errore nel caricamento dei dividendi');
      }
      const data = await response.json();
      const dividends = data.dividends || [];

      // Sync dividends via API
      const syncResponse = await authenticatedFetch('/api/dividends/sync-expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: ownerId,
          dividends,
          categoryId: dividendIncomeCategoryId,
          categoryName: category.name,
          subCategoryId: dividendIncomeSubCategoryId || undefined,
          subCategoryName,
        }),
      });

      if (!syncResponse.ok) {
        throw new Error('Errore nella sincronizzazione');
      }

      const syncData = await syncResponse.json();
      const result = syncData.result;

      if (result.failed > 0) {
        toast.warning(
          `Sincronizzazione completata con ${result.failed} errori: ${result.created} voci create, ${result.skipped} già presenti.`
        );
      } else {
        toast.success(`Sincronizzazione completata: ${result.created} voci create, ${result.skipped} già presenti.`);
      }
    } catch (error) {
      console.error('Error syncing dividends:', error);
      toast.error('Errore nella sincronizzazione dei dividendi');
    } finally {
      setSyncingDividends(false);
    }
  };

  const getCategoriesByType = (type: ExpenseType): ExpenseCategory[] => {
    return expenseCategories.filter(cat => cat.type === type);
  };

  const calculateTotal = () => {
    return assetClasses.reduce(
      (sum, assetClass) => {
        // Exclude cash from percentage total if using fixed amount
        if (assetClass === 'cash' && cashUseFixedAmount) {
          return sum;
        }
        return sum + (assetClassStates[assetClass]?.targetPercentage || 0);
      },
      0
    );
  };

  const calculateSubTargetTotal = (assetClass: AssetClass) => sumSubTargets(assetClassStates[assetClass]?.subTargets ?? []);

  // Famiglia — add/update/remove a member row (plain array state, same pattern as
  // updatePensionRow/removePensionRow in CoastFireTab.tsx).
  const addFamilyMemberRow = () => {
    setFamilyMemberDrafts((current) => [
      ...current,
      { id: createFamilyMemberId(), name: '', grossAnnualIncome: '', isFirstEmploymentPost2007: false, firstEmploymentYear: '' },
    ]);
  };

  const updateFamilyMemberRow = (
    id: string,
    field: keyof Omit<FamilyMemberDraft, 'id'>,
    value: string | boolean
  ) => {
    setFamilyMemberDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft))
    );
  };

  const removeFamilyMemberRow = (id: string) => {
    setFamilyMemberDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  // The target tree as the validation module sees it.
  const toClassDrafts = (states: Record<AssetClass, AssetClassState>): ClassTargetDraft[] =>
    assetClasses.map((assetClass) => ({
      assetClass,
      subCategoryEnabled: states[assetClass]?.subCategoryEnabled ?? false,
      subTargets: states[assetClass]?.subTargets ?? [],
    }));

  /**
   * Takes the reader to the first broken rule: the Allocazione tab, the class's group opened
   * (and the subcategory's assets, for an asset rule), the focus on the field to fix. The
   * reading of Target per classe already states the problem; this puts the cursor where it is.
   */
  const revealTargetProblem = (problem: TargetProblem, cleanedStates: Record<AssetClass, AssetClassState>) => {
    let states = cleanedStates;
    if (activeTab !== 'allocazione') handleTabChange('allocazione');

    let fieldId: string;
    if (problem.kind === 'total-below-100') {
      // The first class the reader can type into (the formula owns Azioni/Obbligazioni when on).
      const editable = assetClasses.find(
        (assetClass) => !(autoCalculate && (assetClass === 'equity' || assetClass === 'bonds'))
      );
      fieldId = editable ?? assetClasses[0];
    } else {
      const { assetClass } = problem;
      const subTargets = [...states[assetClass].subTargets];
      if (problem.kind === 'sub-total') {
        // The first row as the list shows it (sorted by name), so the focus lands at the top.
        const firstShown = subTargets
          .map((target, index) => ({ name: target.name, index }))
          .sort((a, b) => a.name.localeCompare(b.name))[0];
        fieldId = firstShown ? targetFieldId.subPct(assetClass, firstShown.index) : `toggle-${assetClass}`;
      } else if (problem.kind === 'sub-name-duplicate') {
        fieldId = targetFieldId.subName(assetClass, problem.subIndex);
      } else {
        subTargets[problem.subIndex] = { ...subTargets[problem.subIndex], expanded: true };
        fieldId =
          problem.kind === 'specific-empty'
            ? targetFieldId.assetAdd(assetClass, problem.subIndex)
            : problem.kind === 'specific-total'
              ? targetFieldId.assetPct(assetClass, problem.subIndex, 0)
              : problem.kind === 'specific-out-of-range'
                ? targetFieldId.assetPct(assetClass, problem.subIndex, problem.assetIndex)
                : targetFieldId.assetName(assetClass, problem.subIndex, problem.assetIndex);
      }
      states = { ...states, [assetClass]: { ...states[assetClass], expanded: true, subTargets } };
    }
    setAssetClassStates(states);

    // After React has committed the open group and the visible tab.
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        field.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        field.focus({ preventScroll: true });
      });
    }, 0);
  };

  const handleSave = async () => {
    if (!user || !ownerId) return;

    // A subcategory row with no name is one the reader started and left: it is dropped, in the
    // form as in the document (dropUnnamedSubTargets). The rest is validated as it will be written.
    const cleanedDrafts = dropUnnamedSubTargets(toClassDrafts(assetClassStates));
    const cleanedStates = { ...assetClassStates };
    cleanedDrafts.forEach(({ assetClass, subTargets }) => {
      const state = assetClassStates[assetClass];
      if (subTargets.length !== state.subTargets.length) {
        cleanedStates[assetClass] = {
          ...state,
          subTargets: subTargets as SubTarget[],
          categories: subTargets.map((target) => target.name),
        };
      }
    });

    const problem = findTargetProblem(calculateTotal(), cleanedDrafts);
    if (problem) {
      revealTargetProblem(problem, cleanedStates);
      toast.error(narrativeToText(describeTargetProblem(problem)));
      return;
    }
    if (cleanedStates !== assetClassStates) setAssetClassStates(cleanedStates);

    try {
      setSaving(true);

      // Fetch current settings to preserve FIRE fields
      const settingsData = await getSettings(ownerId);

      const targets: AssetAllocationTarget = {};

      assetClasses.forEach((assetClass) => {
        const state = cleanedStates[assetClass];
        targets[assetClass] = {
          targetPercentage: state.targetPercentage,
          ...(assetClass === 'cash' && {
            useFixedAmount: cashUseFixedAmount,
            fixedAmount: cashFixedAmount,
          }),
          subCategoryConfig: {
            enabled: state.subCategoryEnabled,
            // Always derive categories from subTargets (Bug #4 fix)
            categories: state.subCategoryEnabled
              ? state.subTargets.map(t => t.name).filter(n => n !== '')
              : [],
          },
        };

        if (state.subCategoryEnabled && state.subTargets.length > 0) {
          // Rebuild subTargets from scratch to ensure deleted/renamed entries are removed (Bug #2 & #3 fix)
          targets[assetClass].subTargets = state.subTargets.reduce(
            (acc, target) => {
              if (target.specificAssetsEnabled && target.specificAssets && target.specificAssets.length > 0) {
                // New format: SubCategoryTarget with specific assets
                acc[target.name] = {
                  targetPercentage: target.percentage,
                  specificAssetsEnabled: true,
                  specificAssets: target.specificAssets.map(sa => ({
                    name: sa.name,
                    targetPercentage: sa.targetPercentage,
                  })),
                };
              } else {
                // Old format: just percentage (or SubCategoryTarget without specific assets)
                acc[target.name] = target.percentage;
              }
              return acc;
            },
            {} as { [key: string]: number | SubCategoryTargetType }
          );
        }
      });

      await setSettings(ownerId, {
        userAge,
        riskFreeRate,
        // Persist the toggle state explicitly so disabling it survives a page reload.
        // Without this field, the toggle was re-derived from age+rate presence on load,
        // making it impossible to disable without clearing age and rate.
        autoCalculateEquityBonds: autoCalculate,
        // Preserve FIRE settings (Bug #1 fix)
        includePrimaryResidenceInFIRE,
        goalBasedInvestingEnabled,
        goalDrivenAllocationEnabled,
        withdrawalRate: settingsData?.withdrawalRate,
        plannedAnnualExpenses: settingsData?.plannedAnnualExpenses,
        targets,
        dividendIncomeCategoryId: dividendIncomeCategoryId || undefined,
        dividendIncomeSubCategoryId: dividendIncomeSubCategoryId || undefined,
        dividendCashAssetId: dividendCashAssetId !== '__none__' ? dividendCashAssetId : undefined,
        defaultDebitCashAssetId: defaultDebitCashAssetId !== '__none__' ? defaultDebitCashAssetId : undefined,
        defaultCreditCashAssetId: defaultCreditCashAssetId !== '__none__' ? defaultCreditCashAssetId : undefined,
        transferFeeCategoryId: transferFeeCategoryId || undefined,
        transferFeeSubCategoryId: transferFeeSubCategoryId || undefined,
        stampDutyEnabled,
        stampDutyRate,
        checkingAccountSubCategory,
        cashflowHistoryStartYear,
        laborIncomeCategoryIds,
        costCentersEnabled,
        expenseSplitEnabled,
        performanceIncludesPensionFunds,
        performanceIncludesExcludedAssets,
        performanceExcludesCash,
        // Stringa vuota = "nessun mese impostato": va salvata come undefined, non come '',
        // altrimenti pensionReturn la leggerebbe come una data da parsare.
        pensionReturnStartMonth: pensionReturnStartMonth || undefined,
        monthlyEmailEnabled,
        quarterlyEmailEnabled,
        semiAnnualEmailEnabled,
        yearlyEmailEnabled,
        weeklyBudgetEmailEnabled,
        monthlyEmailRecipients,
        familyMembers: parseFamilyMemberDrafts(familyMemberDrafts),
      });
      toast.success('Impostazioni salvate');
      // The allocation baseline is captured from what was WRITTEN (the cleaned tree), so a
      // dropped empty row does not leave the tab marked as unsaved.
      setAllocationBaselineKey(buildAllocationSnapshotKey(cleanedStates));
      setGeneralBaselineKey(generalSnapshotKey);
      setDividendBaselineKey(dividendSnapshotKey);
      setSpeseBaselineKey(speseSnapshotKey);
      // Other consumers (AssetDialog's family-member Select, PensionOverview) read settings via
      // React Query with a 5-minute staleTime — without this, a just-added member wouldn't be
      // selectable there until that cache naturally expired.
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    } catch (error) {
      console.error('Error saving targets:', error);
      toast.error('Errore nel salvataggio dei target');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = getDefaultTargets();
    const states: Record<AssetClass, AssetClassState> = {} as Record<
      AssetClass,
      AssetClassState
    >;

    assetClasses.forEach((assetClass) => {
      const targetData = defaults[assetClass];
      const subCategoryConfig = targetData?.subCategoryConfig;
      const subTargets = targetData?.subTargets;

      states[assetClass] = {
        targetPercentage: targetData?.targetPercentage || 0,
        subCategoryEnabled: subCategoryConfig?.enabled || false,
        categories: subCategoryConfig?.categories || [],
        subTargets: subTargets
          ? Object.entries(subTargets).map(([name, value]) => {
              // Support both old format (number) and new format (SubCategoryTarget)
              if (typeof value === 'number') {
                return {
                  name,
                  percentage: value,
                };
              } else {
                return {
                  name,
                  percentage: value.targetPercentage,
                  specificAssetsEnabled: value.specificAssetsEnabled || false,
                  specificAssets: value.specificAssets || [],
                  expanded: false,
                };
              }
            })
          : [],
        expanded: false,
      };
    });

    setAssetClassStates(states);

    // Reset cash fixed amount settings to defaults
    const cashDefaults = defaults['cash'];
    setCashUseFixedAmount(cashDefaults?.useFixedAmount || false);
    setCashFixedAmount(cashDefaults?.fixedAmount || 0);

    toast.info('Target ripristinati ai valori predefiniti');
  };

  const updateAssetClassState = (
    assetClass: AssetClass,
    updates: Partial<AssetClassState>
  ) => {
    setAssetClassStates((prev) => ({
      ...prev,
      [assetClass]: {
        ...prev[assetClass],
        ...updates,
      },
    }));
  };

  const handleToggleSubCategories = (assetClass: AssetClass, enabled: boolean) => {
    const state = assetClassStates[assetClass];

    if (enabled && state.subTargets.length === 0) {
      // Initialize with default categories if enabling for the first time
      const subTargets = state.categories.map((name) => ({
        name,
        percentage: 0,
      }));
      updateAssetClassState(assetClass, {
        subCategoryEnabled: enabled,
        subTargets,
        categories: state.categories, // Explicitly keep in sync (Bug #4 fix)
      });
    } else {
      updateAssetClassState(assetClass, { subCategoryEnabled: enabled });
    }
  };

  const handleAddSubTarget = (assetClass: AssetClass) => {
    const state = assetClassStates[assetClass];

    // Prevent adding if there are existing empty names (Bug #8 fix)
    const hasEmpty = state.subTargets.some(t => !t.name.trim());
    if (hasEmpty) {
      toast.error('Dai un nome alla sottocategoria vuota prima di aggiungerne un\'altra.');
      return;
    }

    const newSubTargets = [...state.subTargets, { name: '', percentage: 0 }];
    // Update categories to stay in sync (Bug #3 fix)
    const newCategories = newSubTargets.map(t => t.name).filter(n => n !== '');
    updateAssetClassState(assetClass, {
      subTargets: newSubTargets,
      categories: newCategories,
    });
  };

  const handleRemoveSubTarget = (assetClass: AssetClass, index: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = state.subTargets.filter((_, i) => i !== index);
    // Update categories to stay in sync (Bug #3 fix)
    const newCategories = newSubTargets.map(t => t.name);
    updateAssetClassState(assetClass, {
      subTargets: newSubTargets,
      categories: newCategories,
    });
  };

  const handleSubTargetChange = (
    assetClass: AssetClass,
    index: number,
    field: 'name' | 'percentage',
    value: string | number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];

    if (field === 'name') {
      // Track rename mapping (Bug #2 fix)
      const oldName = newSubTargets[index].name;
      const newName = value as string;
      newSubTargets[index].name = newName;

      // Update name map to track rename
      const nameMap = subcategoryNameMap[assetClass] || {};
      const originalName = nameMap[oldName] || oldName;
      const updatedNameMap = { ...nameMap };
      updatedNameMap[newName] = originalName; // New name -> original name
      delete updatedNameMap[oldName]; // Remove old mapping
      setSubcategoryNameMap({ ...subcategoryNameMap, [assetClass]: updatedNameMap });

      // Update categories array to stay in sync (Bug #3 & #4 fix)
      const newCategories = newSubTargets.map(t => t.name).filter(n => n !== '');
      updateAssetClassState(assetClass, {
        subTargets: newSubTargets,
        categories: newCategories,
      });
    } else {
      newSubTargets[index].percentage = value as number;
      updateAssetClassState(assetClass, { subTargets: newSubTargets });
    }
  };

  // Specific Assets Management Functions
  const toggleSubCategoryExpanded = (assetClass: AssetClass, subIndex: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    newSubTargets[subIndex].expanded = !newSubTargets[subIndex].expanded;
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleToggleSpecificAssets = (
    assetClass: AssetClass,
    subIndex: number,
    enabled: boolean
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    newSubTargets[subIndex].specificAssetsEnabled = enabled;

    if (enabled && (!newSubTargets[subIndex].specificAssets || newSubTargets[subIndex].specificAssets!.length === 0)) {
      // Initialize with empty array when enabling for the first time
      newSubTargets[subIndex].specificAssets = [];
    }

    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleAddSpecificAsset = (assetClass: AssetClass, subIndex: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    const specificAssets = newSubTargets[subIndex].specificAssets || [];
    specificAssets.push({ name: '', targetPercentage: 0 });
    newSubTargets[subIndex].specificAssets = specificAssets;
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleRemoveSpecificAsset = (
    assetClass: AssetClass,
    subIndex: number,
    specificIndex: number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    const specificAssets = newSubTargets[subIndex].specificAssets || [];
    newSubTargets[subIndex].specificAssets = specificAssets.filter(
      (_, i) => i !== specificIndex
    );
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleSpecificAssetChange = (
    assetClass: AssetClass,
    subIndex: number,
    specificIndex: number,
    field: 'name' | 'targetPercentage',
    value: string | number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    const specificAssets = [...(newSubTargets[subIndex].specificAssets || [])];

    if (field === 'name') {
      specificAssets[specificIndex].name = value as string;
    } else {
      specificAssets[specificIndex].targetPercentage = value as number;
    }

    newSubTargets[subIndex].specificAssets = specificAssets;
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const calculateSpecificAssetTotal = (assetClass: AssetClass, subIndex: number) => {
    const state = assetClassStates[assetClass];
    const subTarget = state?.subTargets[subIndex];
    if (!subTarget?.specificAssets) return 0;

    return subTarget.specificAssets.reduce(
      (sum, asset) => sum + asset.targetPercentage,
      0
    );
  };

  // The three dirty-state keys are plain strings compared by value with the baselines captured
  // after the Firestore state is applied. They are NOT wrapped in useMemo on purpose: nothing
  // consumes them as a value (only `!==` and the save handler), so the React Compiler prunes the
  // scope and a manual memo becomes one it "could not preserve" (react-hooks/preserve-manual-
  // memoization). Three small JSON.stringify calls per render cost less than the comparison.
  const buildAllocationSnapshotKey = (states: Record<AssetClass, AssetClassState>) =>
    JSON.stringify({
      userAge: userAge ?? null,
      riskFreeRate: riskFreeRate ?? null,
      autoCalculate,
      cashUseFixedAmount,
      cashFixedAmount: roundToTwoDecimals(cashFixedAmount),
      assetClassStates: assetClasses.map((assetClass) => ({
        assetClass,
        targetPercentage: roundToTwoDecimals(states[assetClass]?.targetPercentage || 0),
        subCategoryEnabled: states[assetClass]?.subCategoryEnabled || false,
        categories: states[assetClass]?.categories || [],
        subTargets: (states[assetClass]?.subTargets || []).map((target) => ({
          name: target.name,
          percentage: roundToTwoDecimals(target.percentage),
          specificAssetsEnabled: target.specificAssetsEnabled || false,
          specificAssets: (target.specificAssets || []).map((asset) => ({
            name: asset.name,
            targetPercentage: roundToTwoDecimals(asset.targetPercentage),
          })),
        })),
      })),
    });
  const allocationSnapshotKey = buildAllocationSnapshotKey(assetClassStates);

  const generalSnapshotKey = JSON.stringify({
        includePrimaryResidenceInFIRE,
        goalBasedInvestingEnabled,
        goalDrivenAllocationEnabled,
        stampDutyEnabled,
        stampDutyRate: roundToTwoDecimals(stampDutyRate),
        checkingAccountSubCategory,
        cashflowHistoryStartYear,
        laborIncomeCategoryIds: [...laborIncomeCategoryIds].sort(),
        costCentersEnabled,
        expenseSplitEnabled,
        performanceIncludesPensionFunds,
        performanceIncludesExcludedAssets,
        performanceExcludesCash,
        pensionReturnStartMonth,
        monthlyEmailEnabled,
        quarterlyEmailEnabled,
        semiAnnualEmailEnabled,
        yearlyEmailEnabled,
        weeklyBudgetEmailEnabled,
        monthlyEmailRecipients: [...monthlyEmailRecipients].sort(),
        familyMembers: familyMembersSnapshotValue(parseFamilyMemberDrafts(familyMemberDrafts)),
      });

  const dividendSnapshotKey = JSON.stringify({
        dividendIncomeCategoryId: dividendIncomeCategoryId || '',
        dividendIncomeSubCategoryId: dividendIncomeSubCategoryId || '',
        dividendCashAssetId,
      });

  const speseSnapshotKey = JSON.stringify({
        defaultDebitCashAssetId,
        defaultCreditCashAssetId,
        transferFeeCategoryId,
        transferFeeSubCategoryId,
      });

  // One dirty flag per tab that has fields «Salva» writes — each snapshot holds the fields of
  // the tab that EDITS them (doc/guide/impostazioni.md § Settings — the FIVE places).
  const unsavedByTab: Partial<Record<SettingsTabId, boolean>> = {
    allocazione: allocationBaselineKey.length > 0 && allocationSnapshotKey !== allocationBaselineKey,
    generale: generalBaselineKey.length > 0 && generalSnapshotKey !== generalBaselineKey,
    spese: speseBaselineKey.length > 0 && speseSnapshotKey !== speseBaselineKey,
    dividendi: dividendBaselineKey.length > 0 && dividendSnapshotKey !== dividendBaselineKey,
  };
  const settingsTabs = SETTINGS_TABS.map((tab) => ({ ...tab, unsaved: unsavedByTab[tab.value as SettingsTabId] ?? false }));
  const unsavedSentence = describeUnsavedChanges(settingsTabs.filter((tab) => tab.unsaved).map((tab) => tab.label));
  const hasUnsavedChanges = unsavedSentence !== null;
  // `aria-controls` may only name a panel that exists: Allocazione is always mounted, the
  // others once opened.
  const renderedPanels = new Set<string>([...mountedTabs, 'allocazione']);

  // A reload or a closed tab with edits pending asks first (the browser's own prompt). An
  // in-app link does not: the App Router has no navigation guard, so the bar at the bottom is
  // the reminder there.
  useEffect(() => {
    if (!hasUnsavedChanges || isDemo) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges, isDemo]);

  // «Annulla modifiche»: back to what is saved, by reading it again.
  const handleRevert = async () => {
    // A failed re-read replaces the page with its ErrorNotice, which says what happened.
    if (await loadTargets({ quiet: true })) {
      toast.info('Modifiche annullate: il modulo mostra di nuovo le impostazioni salvate.');
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <PageHeader
          label="Configurazione"
          title="Impostazioni"
          description="Target, preferenze e flussi"
        />
        <PageTabs
          tabs={SETTINGS_TABS}
          value={activeTab}
          onValueChange={handleTabChange}
          layoutId="settings-tab-pill"
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
        <PageHeader
          label="Configurazione"
          title="Impostazioni"
          description="Target, preferenze e flussi"
        />
        <ErrorNotice
          className="mt-4 max-w-[920px]"
          onRetry={() => void loadTargets()}
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

  const total = calculateTotal();
  const isValidTotal = isTargetTotalValid(total);
  // Derived, read-only target leverage = Σtarget / 100 (mirrors deriveTargetLeverageRatio). Shown
  // when the user has actually set leverage (> 1); the app never stores a manual leverage input.
  const derivedTargetLeverage = total > 0 ? total / 100 : 1;
  const hasTargetLeverage = derivedTargetLeverage > 1.005;

  // ── Reading-line inputs (numbers from the existing pure utils, words from settingsNarrative) ──
  const formulaSplit =
    userAge !== undefined && riskFreeRate !== undefined && Object.keys(assetClassStates).length > 0
      ? resolveAutoEquityBondsSplit(
          calculateEquityPercentage(userAge, riskFreeRate),
          sumOtherClassTargets(assetClassStates, cashUseFixedAmount)
        )
      : null;
  const otherClassTotal = sumOtherClassTargets(assetClassStates, cashUseFixedAmount);
  const classesWithSubcategories = assetClasses.filter(
    (assetClass) =>
      assetClassStates[assetClass]?.subCategoryEnabled && (assetClassStates[assetClass]?.subTargets.length ?? 0) > 0
  ).length;
  const classesWithTarget = Object.values(assetClassStates).filter((s) => s && s.targetPercentage > 0).length;
  // The first rule «Salva» would refuse, stated live in the Target per classe reading.
  const targetProblem = findTargetProblem(total, dropUnnamedSubTargets(toClassDrafts(assetClassStates)));
  const categoriesState = resolveSurfaceState({ loading: loadingCategories, failed: categoriesFailed });
  const accountsState = resolveSurfaceState({ loading: loadingAccounts, failed: accountsFailed });
  const laborCategoryNames = getCategoriesByType('income')
    .filter((cat) => laborIncomeCategoryIds.includes(cat.id))
    .map((cat) => cat.name);
  const familyMembersForReading = parseFamilyMemberDrafts(familyMemberDrafts);
  const debitAccount = cashAssets.find((a) => a.id === defaultDebitCashAssetId);
  const creditAccount = cashAssets.find((a) => a.id === defaultCreditCashAssetId);
  const categoryCounts = summarizeExpenseCategories(expenseCategories);
  const dividendCategory = expenseCategories.find((cat) => cat.id === dividendIncomeCategoryId);
  const dividendSubCategory = dividendCategory?.subCategories.find((sub) => sub.id === dividendIncomeSubCategoryId);
  const transferFeeCategory = expenseCategories.find((cat) => cat.id === transferFeeCategoryId);
  const transferFeeSubCategory = transferFeeCategory?.subCategories.find((sub) => sub.id === transferFeeSubCategoryId);
  const inpsAgeShown = planParams.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  const ritaAgeShown = resolveRitaUnlockAge(planParams);
  const resolvedThemeMode = isThemeHydrated ? (theme as ThemeMode | undefined) : undefined;
  const activeSwatch = COLOR_THEME_SWATCHES.find((swatch) => swatch.id === colorTheme) ?? COLOR_THEME_SWATCHES[0];

  return (
    <PageContainer>
      <PageHeader
        label="Configurazione"
        title="Impostazioni"
        description="Target, preferenze e flussi"
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
        layoutId="settings-tab-pill"
        ariaLabel="Sezioni delle Impostazioni"
        renderedPanels={renderedPanels}
      >

        {/* Tab: Preferenze (lazy) — every group is a tile: eyebrow = the group, reading = ONE
            rule-generated state line (settingsNarrative), controls below. */}
        {mountedTabs.has('generale') && (
          <TabsContent
          value="generale"
          id={pageTabPanelId('settings-tab-pill', 'generale')}
          aria-label="Preferenze"
          // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
          // generated reference points at nothing. The name is the label above.
          aria-labelledby={undefined}
          className="mt-4"
        >
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Order: what this tab WRITES first (three rows of editable tiles), then the two
                  read-only declarations of fields other pages own. Età and risk-free rate are no
                  longer here: they live in Allocazione › Auto-calcolo, beside the formula whose
                  switch they unlock (2026-09-22). */}
              {/* Calcolo dei rendimenti — measurement base + pension-return start month */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
                <Tile
                  eyebrow="Calcolo dei rendimenti"
                  aside="Rendimenti"
                  reading={describePerformanceBase({
                    includesPensionFunds: performanceIncludesPensionFunds,
                    includesExcludedAssets: performanceIncludesExcludedAssets,
                    excludesCash: performanceExcludesCash,
                    pensionReturnStartMonth,
                  })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="performanceIncludesPensionFunds" className="text-[13px] font-medium">
                          Includi i fondi pensione
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Dentro dal mese in cui i versamenti sono tracciati: TFR, datoriale e busta paga sono flussi, non rendimento
                        </p>
                      </div>
                      <Switch
                        id="performanceIncludesPensionFunds"
                        checked={performanceIncludesPensionFunds}
                        onCheckedChange={setPerformanceIncludesPensionFunds}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="performanceIncludesExcludedAssets" className="text-[13px] font-medium">
                          Includi gli asset esclusi
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          La casa valutata a mano non si muove mai: abbassa la volatilità e alza lo Sharpe
                        </p>
                      </div>
                      <Switch
                        id="performanceIncludesExcludedAssets"
                        checked={performanceIncludesExcludedAssets}
                        onCheckedChange={setPerformanceIncludesExcludedAssets}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="performanceExcludesCash" className="text-[13px] font-medium">
                          Liquidità fuori dalla base
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          I conti escono dai rendimenti (restano nell&apos;Allocazione); un ETF monetario ha un prezzo e resta dentro. Gli acquisti pagati dai conti diventano flussi misurati
                        </p>
                      </div>
                      <Switch
                        id="performanceExcludesCash"
                        checked={performanceExcludesCash}
                        onCheckedChange={setPerformanceExcludesCash}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="pensionReturnStartMonth" className="text-[13px] font-medium">
                          Rendimento del fondo calcolabile da
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Vuoto = dal primo versamento registrato
                        </p>
                      </div>
                      <Input
                        id="pensionReturnStartMonth"
                        type="month"
                        value={pensionReturnStartMonth}
                        onChange={(e) => setPensionReturnStartMonth(e.target.value)}
                        className={cn('w-40 shrink-0', interactiveControlClass)}
                      />
                    </div>
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Le metriche si ricalcolano alla prossima visita di Rendimenti; il risk-free di Sharpe e Sortino
                    si imposta in{' '}
                    <button type="button" onClick={() => handleTabChange('allocazione')} className={TILE_FOOTER_ACTION_CLASS}>
                      Allocazione
                    </button>
                    .
                  </div>
                </Tile>
              </div>

              {/* Costi and FIRE e obiettivi stack beside Calcolo dei rendimenti: three tiles in one
                  row left ~300px empty in the two short ones (critique of 2026-09-22). Below
                  `desktop:` the wrapper dissolves and each tile is a cell of its own. */}
              <div className="contents desktop:col-span-6 desktop:flex desktop:flex-col desktop:gap-3">
              {/* Costi — imposta di bollo */}
              <div className={cn(TILE_CELL_CLASS)}>
                <Tile
                  eyebrow="Costi"
                  aside="stima annua"
                  reading={describeCosts({ stampDutyEnabled, stampDutyRate, checkingAccountSubCategory })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <Label htmlFor="stampDutyToggle" className="text-[13px] font-medium">Imposta di bollo</Label>
                      <Switch
                        id="stampDutyToggle"
                        checked={stampDutyEnabled}
                        onCheckedChange={setStampDutyEnabled}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    {stampDutyEnabled && (
                      <div className="flex items-center justify-between gap-4 py-3">
                        <Label htmlFor="stampDutyRate" className="text-[13px] font-medium">Aliquota</Label>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Input
                            id="stampDutyRate"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={stampDutyRate}
                            onChange={(e) => setStampDutyRate(parseFloat(e.target.value) || 0)}
                            placeholder="es. 0.20"
                            className={cn('w-24 text-right font-mono', interactiveControlClass)}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                    {stampDutyEnabled && (
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Sottocategoria conti correnti</p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                            Applica la soglia dei 5.000&nbsp;€ ai conti
                          </p>
                        </div>
                        {assetClassStates.cash?.subCategoryEnabled && (assetClassStates.cash?.categories?.length ?? 0) > 0 ? (
                          <Select value={checkingAccountSubCategory} onValueChange={setCheckingAccountSubCategory}>
                            <SelectTrigger className={cn('w-44', interactiveControlClass)} aria-label="Sottocategoria conti correnti">
                              <SelectValue placeholder="Seleziona sottocategoria…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nessuna (soglia non applicata)</SelectItem>
                              {assetClassStates.cash.categories.map((cat) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-[11px] leading-[1.4] text-warning-foreground">
                            Configura le sottocategorie di Liquidità, in Allocazione, per abilitarla.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Gli asset esenti si marcano dalla scheda dello strumento, in Patrimonio.
                  </div>
                </Tile>
              </div>

              {/* FIRE e obiettivi — the three toggles this page OWNS; it takes the column's slack */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:flex-1')}>
                <Tile
                  eyebrow="FIRE e obiettivi"
                  reading={describeFireToggles({
                    includePrimaryResidenceInFIRE,
                    goalBasedInvestingEnabled,
                    goalDrivenAllocationEnabled,
                  })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="firePrimaryResidence" className="text-[13px] font-medium">
                          Casa nel patrimonio FIRE
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Lo standard FIRE la esclude</p>
                      </div>
                      <Switch
                        id="firePrimaryResidence"
                        checked={includePrimaryResidenceInFIRE}
                        onCheckedChange={setIncludePrimaryResidenceInFIRE}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="goalBasedInvesting" className="text-[13px] font-medium">
                          Obiettivi di investimento
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Attiva FIRE › Obiettivi e le assegnazioni del portafoglio
                        </p>
                      </div>
                      <Switch
                        id="goalBasedInvesting"
                        checked={goalBasedInvestingEnabled}
                        onCheckedChange={(checked) => {
                          setGoalBasedInvestingEnabled(checked);
                          // Disable goal-driven allocation when goals are disabled
                          if (!checked) setGoalDrivenAllocationEnabled(false);
                        }}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    {goalBasedInvestingEnabled && (
                      <div className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <Label htmlFor="goalDrivenAllocation" className="text-[13px] font-medium">
                            Allocazione derivata dagli obiettivi
                          </Label>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                            Target dal gap di ogni obiettivo, pesato per priorità (Alta 3×, Media 2×, Bassa 1×)
                          </p>
                        </div>
                        <Switch
                          id="goalDrivenAllocation"
                          checked={goalDrivenAllocationEnabled}
                          onCheckedChange={setGoalDrivenAllocationEnabled}
                          className={cn('shrink-0', interactiveControlClass)}
                        />
                      </div>
                    )}
                  </div>
                </Tile>
              </div>

              </div>

              {/* Cashflow — labor income, history floor, cost centers */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile
                  eyebrow="Cashflow"
                  reading={describeCashflowSettings({
                    laborCategoryNames,
                    historyStartYear: cashflowHistoryStartYear,
                    costCentersEnabled,
                    expenseSplitEnabled,
                    familyMemberCount: familyMembersForReading.length,
                    categoriesUnread: categoriesState === 'failed',
                  })}
                >
                  <div className="mt-3">
                    <p className={TILE_SUB_EYEBROW_CLASS}>Reddito da lavoro</p>
                    {categoriesState === 'failed' ? (
                      <p className="mt-2 text-[11px] leading-[1.4] text-destructive">
                        Categorie non lette: la scelta salvata resta quella di prima.
                      </p>
                    ) : categoriesState === 'loading' ? null : getCategoriesByType('income').length === 0 ? (
                      <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
                        Nessuna categoria di tipo «Entrate»: creane una in Spese.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {getCategoriesByType('income').map((cat) => {
                          const checked = laborIncomeCategoryIds.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              aria-pressed={checked}
                              onClick={() =>
                                setLaborIncomeCategoryIds(
                                  checked
                                    ? laborIncomeCategoryIds.filter((id) => id !== cat.id)
                                    : [...laborIncomeCategoryIds, cat.id]
                                )
                              }
                              className={cn(
                                'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors desktop:h-8',
                                checked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              )}
                            >
                              {checked && (
                                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                  <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="cashflowHistoryStartYear" className="text-[13px] font-medium">
                          Anno inizio storico cashflow
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Esclude i dati importati più vecchi dai grafici dello storico
                        </p>
                      </div>
                      <Input
                        id="cashflowHistoryStartYear"
                        type="number"
                        min="2000"
                        max={new Date().getFullYear()}
                        step="1"
                        value={cashflowHistoryStartYear}
                        onChange={(e) =>
                          setCashflowHistoryStartYear(parseInt(e.target.value, 10) || 2025)
                        }
                        className={cn('w-24 shrink-0 text-right font-mono', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="costCentersEnabled" className="text-[13px] font-medium">Centri di Costo</Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Il tab appare in Cashflow, il selettore nel modulo delle spese
                        </p>
                      </div>
                      <Switch
                        id="costCentersEnabled"
                        checked={costCentersEnabled}
                        onCheckedChange={setCostCentersEnabled}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="expenseSplitEnabled" className="text-[13px] font-medium">Divisione delle spese</Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Il tab appare in Cashflow, e ogni voce si può marcare come personale
                        </p>
                      </div>
                      <Switch
                        id="expenseSplitEnabled"
                        checked={expenseSplitEnabled}
                        onCheckedChange={setExpenseSplitEnabled}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                  </div>
                </Tile>
              </div>

              {/* Famiglia — one RAL/eligibility per taxpayer (the IRPEF ceiling is per person) */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <Tile
                  eyebrow="Famiglia"
                  aside={familyMemberDrafts.length === 1 ? '1 membro' : `${familyMemberDrafts.length} membri`}
                  reading={describeFamily({ members: familyMembersForReading })}
                >
                  {familyMemberDrafts.length > 0 && (
                    <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] items-center gap-x-3 pb-1.5 desktop:grid">
                      <span className={TILE_SUB_EYEBROW_CLASS}>Nome</span>
                      <span className={TILE_SUB_EYEBROW_CLASS}>RAL</span>
                      <span className={TILE_SUB_EYEBROW_CLASS}>Prima occupazione dopo il 2007</span>
                      <span className={TILE_SUB_EYEBROW_CLASS}>Primo anno</span>
                      <span aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex flex-col divide-y divide-border">
                    {familyMemberDrafts.map((member) => (
                      <div
                        key={member.id}
                        className="grid grid-cols-2 items-center gap-3 py-3 desktop:grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] desktop:gap-x-3"
                      >
                        <Input
                          value={member.name}
                          onChange={(e) => updateFamilyMemberRow(member.id, 'name', e.target.value)}
                          placeholder="Nome"
                          aria-label="Nome del membro"
                          disabled={isDemo}
                          className={cn('col-span-2 desktop:col-span-1', interactiveControlClass)}
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={member.grossAnnualIncome}
                          onChange={(e) => updateFamilyMemberRow(member.id, 'grossAnnualIncome', e.target.value)}
                          placeholder="RAL"
                          aria-label="Reddito annuo lordo (RAL)"
                          disabled={isDemo}
                          className={cn('text-right font-mono', interactiveControlClass)}
                        />
                        <div className="flex items-center justify-end gap-2 desktop:justify-start">
                          <Switch
                            id={`family-firstjob-${member.id}`}
                            checked={member.isFirstEmploymentPost2007}
                            onCheckedChange={(checked) => updateFamilyMemberRow(member.id, 'isFirstEmploymentPost2007', checked)}
                            disabled={isDemo}
                            aria-label="Prima occupazione dopo il 2007"
                            className={interactiveControlClass}
                          />
                          <Label htmlFor={`family-firstjob-${member.id}`} className="text-[11px] text-muted-foreground desktop:hidden">
                            Post 2007
                          </Label>
                        </div>
                        <Input
                          type="number"
                          value={member.firstEmploymentYear}
                          onChange={(e) => updateFamilyMemberRow(member.id, 'firstEmploymentYear', e.target.value)}
                          placeholder="anno"
                          aria-label="Anno di prima occupazione"
                          disabled={isDemo || !member.isFirstEmploymentPost2007}
                          className={cn('text-right font-mono', interactiveControlClass)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFamilyMemberRow(member.id)}
                          disabled={isDemo}
                          aria-label={`Rimuovi ${member.name || 'membro'}`}
                          className="h-10 w-10 justify-self-end shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className={familyMemberDrafts.length > 0 ? 'mt-2' : 'mt-3'}>
                    <Button type="button" variant="outline" size="sm" onClick={addFamilyMemberRow} disabled={isDemo}>
                      <Plus className="mr-2 h-4 w-4" />
                      Aggiungi membro
                    </Button>
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Colleghi un fondo pensione a un membro dalla sua scheda in Patrimonio; «Prima occupazione dopo il 2007»
                    abilita il recupero del plafond di deducibilità.
                  </div>
                </Tile>
              </div>

              {/* Email periodiche — toggles + recipients + manual send */}
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
                <Tile
                  eyebrow="Email periodiche"
                  aside={monthlyEmailRecipients.length === 1 ? '1 destinatario' : `${monthlyEmailRecipients.length} destinatari`}
                  reading={describeEmails({
                    monthly: monthlyEmailEnabled,
                    quarterly: quarterlyEmailEnabled,
                    semiAnnual: semiAnnualEmailEnabled,
                    yearly: yearlyEmailEnabled,
                    weeklyBudget: weeklyBudgetEmailEnabled,
                    recipientCount: monthlyEmailRecipients.length,
                  })}
                >
                  <div className="mt-1 grid grid-cols-1 gap-x-10 desktop:grid-cols-2">
                    <div className="flex flex-col divide-y divide-border">
                      {([
                        { id: 'monthlyEmailEnabled', label: 'Report mensile', help: "L'ultimo giorno del mese", checked: monthlyEmailEnabled, onChange: setMonthlyEmailEnabled },
                        { id: 'quarterlyEmailEnabled', label: 'Report trimestrale', help: 'Marzo, giugno, settembre e dicembre', checked: quarterlyEmailEnabled, onChange: setQuarterlyEmailEnabled },
                        { id: 'semiAnnualEmailEnabled', label: 'Report semestrale', help: '30 giugno e 31 dicembre', checked: semiAnnualEmailEnabled, onChange: setSemiAnnualEmailEnabled },
                        { id: 'yearlyEmailEnabled', label: 'Report annuale', help: 'Il 31 dicembre', checked: yearlyEmailEnabled, onChange: setYearlyEmailEnabled },
                        { id: 'weeklyBudgetEmailEnabled', label: 'Report budget settimanale', help: 'Ogni domenica, con lo stato dei budget', checked: weeklyBudgetEmailEnabled, onChange: setWeeklyBudgetEmailEnabled },
                      ] as const).map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <Label htmlFor={row.id} className="text-[13px] font-medium">{row.label}</Label>
                            <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{row.help}</p>
                          </div>
                          <Switch
                            id={row.id}
                            checked={row.checked}
                            onCheckedChange={row.onChange}
                            disabled={isDemo}
                            className={cn('shrink-0', interactiveControlClass)}
                          />
                        </div>
                      ))}
                    </div>

                    {(monthlyEmailEnabled || quarterlyEmailEnabled || semiAnnualEmailEnabled || yearlyEmailEnabled || weeklyBudgetEmailEnabled) && (
                      <div className="mt-4 flex flex-col desktop:mt-0 desktop:border-l desktop:border-border desktop:pl-10">
                        <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pt-3')}>Destinatari</p>
                        <div className="mt-2 flex gap-2">
                          <Input
                            type="email"
                            placeholder="email@esempio.com"
                            value={newEmailInput}
                            onChange={(e) => setNewEmailInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const email = newEmailInput.trim();
                                if (email && !monthlyEmailRecipients.includes(email)) {
                                  setMonthlyEmailRecipients([...monthlyEmailRecipients, email]);
                                  setNewEmailInput('');
                                }
                              }
                            }}
                            disabled={isDemo}
                            aria-label="Nuovo destinatario"
                            className={interactiveControlClass}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              isDemo ||
                              !newEmailInput.trim() ||
                              monthlyEmailRecipients.includes(newEmailInput.trim())
                            }
                            onClick={() => {
                              const email = newEmailInput.trim();
                              if (email && !monthlyEmailRecipients.includes(email)) {
                                setMonthlyEmailRecipients([...monthlyEmailRecipients, email]);
                                setNewEmailInput('');
                              }
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Aggiungi
                          </Button>
                        </div>

                        {monthlyEmailRecipients.length > 0 && (
                          <ul className="mt-2.5 space-y-2">
                            {monthlyEmailRecipients.map((email) => (
                              <li
                                key={email}
                                className="flex items-center justify-between rounded-md border border-border bg-muted/30 py-0.5 pl-3 pr-0.5 text-sm"
                              >
                                <span className="truncate text-foreground">{email}</span>
                                {/* Removing a recipient is a draft edit like any other: it waits for «Salva». */}
                                <button
                                  type="button"
                                  aria-label={`Rimuovi ${email}`}
                                  disabled={isDemo}
                                  onClick={() =>
                                    setMonthlyEmailRecipients(
                                      monthlyEmailRecipients.filter((r) => r !== email)
                                    )
                                  }
                                  className="ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40 desktop:h-8 desktop:w-8"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3.5 flex flex-wrap gap-2">
                          {([
                            { type: 'monthly' as const, label: 'Invia mensile ora', enabled: monthlyEmailEnabled },
                            { type: 'quarterly' as const, label: 'Invia trimestrale ora', enabled: quarterlyEmailEnabled },
                            { type: 'semiannual' as const, label: 'Invia semestrale ora', enabled: semiAnnualEmailEnabled },
                            { type: 'yearly' as const, label: 'Invia annuale ora', enabled: yearlyEmailEnabled },
                            { type: 'weekly-budget' as const, label: 'Invia report budget ora', enabled: weeklyBudgetEmailEnabled },
                          ] as const).filter(({ enabled }) => enabled).map(({ type, label }) => (
                            <Button
                              key={type}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isDemo || monthlyEmailRecipients.length === 0 || sendingTestEmailType !== null}
                              onClick={async () => {
                                setSendingTestEmailType(type);
                                try {
                                  const res = await authenticatedFetch(
                                    '/api/user/monthly-email/send',
                                    {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ periodType: type }),
                                    }
                                  );
                                  if (res.ok) {
                                    toast.success('Email inviata ai destinatari.');
                                  } else {
                                    const resBody = await res.json().catch(() => ({}));
                                    toast.error(resBody.error ?? "Errore durante l'invio");
                                  }
                                } catch {
                                  toast.error("Errore durante l'invio dell'email");
                                } finally {
                                  setSendingTestEmailType(null);
                                }
                              }}
                            >
                              {sendingTestEmailType === type ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  Invio in corso…
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <Send className="h-4 w-4" />
                                  {label}
                                </span>
                              )}
                            </Button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] leading-[1.45] text-muted-foreground">
                          Invia il riepilogo del periodo corrente per verificare il formato. Salva prima le impostazioni.
                        </p>
                      </div>
                    )}
                  </div>
                </Tile>
              </div>

              {/* Parametri del piano — read-only declaration; the FIRE pages stay the only write surfaces */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
                <Tile eyebrow="Parametri del piano" aside="sola lettura" reading={describePlanParameters(planParams)}>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    {planParams.withdrawalRate !== undefined && (
                      <DeclarationRow label="Safe withdrawal rate" value={pctLabel(planParams.withdrawalRate)} />
                    )}
                    {planParams.plannedAnnualExpenses !== undefined && (
                      <DeclarationRow
                        label="Spese pianificate"
                        value={`${cachedFormatCurrencyEUR(planParams.plannedAnnualExpenses, true)}/anno`}
                      />
                    )}
                    <DeclarationRow
                      label="Età pensione INPS"
                      value={`${inpsAgeShown} anni${planParams.pensionInpsRetirementAge === undefined ? ' · predefinita' : ''}`}
                    />
                    <DeclarationRow label="RITA (sblocco fondo)" value={`${ritaAgeShown} anni`} />
                    <DeclarationRow
                      label="Vincolo fondo nel FIRE"
                      value={planParams.respectPensionLockInFire ? 'Attivo' : 'Spento'}
                      mono={false}
                    />
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Si modificano dove agiscono:{' '}
                    <Link href="/dashboard/fire-simulations?tab=fire" className={TILE_FOOTER_ACTION_CLASS}>
                      FIRE › Calcolatore → Parametri
                    </Link>
                    {' '}e{' '}
                    <Link href="/dashboard/fire-simulations?tab=coast" className={TILE_FOOTER_ACTION_CLASS}>
                      Coast FIRE → Ipotesi
                    </Link>
                    .
                  </div>
                </Tile>
              </div>

              {/* Assistente — read-only mirror; the popover beside the conversation is the write surface */}
              {SHOW_ASSISTANT ? (
                <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
                  <Tile eyebrow="Assistente" aside="sola lettura" reading={describeAssistantPreferences(assistantPrefs)}>
                    <div className="mt-1 flex flex-col divide-y divide-border">
                      {assistantPrefs.responseStyle !== undefined && (
                        <DeclarationRow
                          label="Stile delle risposte"
                          value={ASSISTANT_STYLE_LABELS[assistantPrefs.responseStyle]}
                          mono={false}
                        />
                      )}
                      {assistantPrefs.memoryEnabled !== undefined && (
                        <DeclarationRow
                          label="Apprendimento automatico"
                          value={assistantPrefs.memoryEnabled ? 'Attivo' : 'Spento'}
                          mono={false}
                        />
                      )}
                      {assistantPrefs.macroContextEnabled !== undefined && (
                        <DeclarationRow
                          label="Contesto macro (web)"
                          value={assistantPrefs.macroContextEnabled ? 'Attivo' : 'Spento'}
                          mono={false}
                        />
                      )}
                    </div>
                    <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                      Si modificano{' '}
                      <Link href="/dashboard/assistant" className={TILE_FOOTER_ACTION_CLASS}>
                        dall&apos;Assistente
                      </Link>
                      , accanto alla conversazione.
                    </div>
                  </Tile>
                </div>
              ) : (
                <div className="hidden desktop:block desktop:col-span-6" aria-hidden="true" />
              )}

            </div>

      {/* Development Features — clearly separated from user-facing settings, only shown in dev mode */}
      {enableTestSnapshots && (
        <div className="mt-6 border-t border-border pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-500" />
            <p className="text-xs uppercase tracking-widest text-orange-500">Strumenti di sviluppo</p>
          </div>
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10 dark:border-orange-900">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 p-4">
                <p className="text-sm text-orange-900 dark:text-orange-200 font-semibold">⚠️ Attenzione</p>
                <p className="text-sm text-orange-800 dark:text-orange-300 mt-1">
                  Questa sezione è visibile solo quando la variabile d&apos;ambiente{' '}
                  <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS</code>{' '}
                  è impostata su <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">true</code>.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Generazione Snapshot di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Genera snapshot mensili fittizi per testare grafici e statistiche.
                  Gli snapshot verranno salvati nella stessa collection Firebase degli snapshot reali.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setDummySnapshotModalOpen(true)}
                  className="border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Genera Snapshot di Test
                </Button>
              </div>

              <div className="space-y-3 border-t border-orange-200 dark:border-orange-800 pt-4">
                <h3 className="font-semibold text-sm text-foreground">Eliminazione Dati di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Elimina tutti i dati dummy (snapshot, spese e categorie) in un&apos;unica operazione.
                  Questa azione è irreversibile.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDummyDataDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina Tutti i Dati Dummy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

          </TabsContent>
        )}

        {/* Tab: Allocazione (default, always mounted) — the total as a tile, the formula's state,
            the editable target list at the tile's cadence. */}
        <TabsContent
          value="allocazione"
          id={pageTabPanelId('settings-tab-pill', 'allocazione')}
          aria-label="Allocazione"
          // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
          // generated reference points at nothing. The name is the label above.
          aria-labelledby={undefined}
          className="mt-4"
        >
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

            {/* Allocazione target — the plan's one number */}
            <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
              <Tile
                eyebrow="Allocazione target"
                aside="capitale investito"
                reading={describeAllocationTotal({
                  total,
                  isValid: isValidTotal,
                  leverageRatio: derivedTargetLeverage,
                  hasLeverage: hasTargetLeverage,
                  cashUseFixedAmount,
                  cashFixedAmount,
                })}
              >
                <div className="mt-3.5 flex items-end gap-3">
                  <p
                    className={cn(
                      'font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums',
                      isValidTotal ? 'text-foreground' : 'text-destructive'
                    )}
                  >
                    {pctLabel(total)}
                  </p>
                  {hasTargetLeverage && (
                    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[12px] font-medium tabular-nums">
                      Leva {formatNumber(derivedTargetLeverage, 2)}×
                    </span>
                  )}
                  {cashUseFixedAmount && (
                    <span className="pb-0.5 text-[11px] text-muted-foreground">esclusa liquidità fissa</span>
                  )}
                </div>
                <div className="mt-3.5 flex flex-col divide-y divide-border">
                  <DeclarationRow label="Classi con target > 0" value={`${classesWithTarget} su ${assetClasses.length}`} />
                  <DeclarationRow
                    label="Sottocategorie configurate"
                    value={classesWithSubcategories === 1 ? '1 classe' : `${classesWithSubcategories} classi`}
                  />
                  {!isValidTotal && (
                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-[13px] text-destructive">Residuo da allocare</span>
                      <span className="font-mono text-[13px] font-semibold tabular-nums text-destructive">
                        {pctLabel(Math.abs(100 - total))}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                  Le percentuali si applicano al patrimonio ribilanciabile: gli asset «esclusi dal ribilanciamento» non
                  entrano. Per escludere un asset (casa, fondo pensione) usa il suo ruolo in Patrimonio, non un target qui.
                </div>
              </Tile>
            </div>

            {/* Auto-calcolo — the formula's switch WITH the two inputs it reads. They used to live
                in Preferenze › Profilo, and the switch stayed disabled until a field on another tab
                was filled in: a dependency the reader had to remember (critique of 2026-09-22). */}
            <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
              <Tile
                eyebrow="Auto-calcolo Azioni / Obbligazioni"
                reading={describeAutoCalc({
                  enabled: autoCalculate,
                  userAge,
                  riskFreeRate,
                  equityPct: formulaSplit?.equityPercentage,
                  bondsPct: formulaSplit?.bondsPercentage,
                  otherTotal: otherClassTotal,
                })}
              >
                <div className="mt-1 flex flex-col divide-y divide-border">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <Label htmlFor="userAge" className="text-[13px] font-medium">Età</Label>
                      <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">In anni compiuti</p>
                    </div>
                    <Input
                      id="userAge"
                      type="number"
                      min="0"
                      max="120"
                      value={userAge || ''}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : undefined;
                        setUserAge(value);
                      }}
                      placeholder="anni"
                      className={cn('w-24 shrink-0 text-right font-mono', interactiveControlClass)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <Label htmlFor="riskFreeRate" className="text-[13px] font-medium">Risk-free rate</Label>
                      <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                        Il rendimento del{' '}
                        <a
                          href="https://www.investing.com/rates-bonds/italy-10-year-bond-yield"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={TILE_FOOTER_ACTION_CLASS}
                        >
                          BTP 10 anni
                        </a>
                        ; vale anche per Sharpe e Sortino
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Input
                        id="riskFreeRate"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={riskFreeRate || ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseFloat(e.target.value) : undefined;
                          setRiskFreeRate(value);
                        }}
                        placeholder="tasso"
                        className={cn('w-24 text-right font-mono', interactiveControlClass)}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <Label htmlFor="autoCalculate" className="text-[13px] font-medium">Calcolo automatico</Label>
                      <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                        Formula di{' '}
                        <a
                          href="https://www.youtube.com/channel/UCNp1e5n6rlnfm5aWbHe3cJw"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={TILE_FOOTER_ACTION_CLASS}
                        >
                          The Bull
                        </a>
                        : 125 {'−'} età {'−'} (tasso {'×'} 5) = % Azioni
                      </p>
                    </div>
                    <Switch
                      id="autoCalculate"
                      checked={autoCalculate}
                      onCheckedChange={setAutoCalculate}
                      disabled={userAge === undefined || riskFreeRate === undefined}
                      className={cn('shrink-0', interactiveControlClass)}
                    />
                  </div>
                </div>
                <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                  Le altre classi scalano dalle Azioni; le Obbligazioni prendono il residuo.
                </div>
              </Tile>
            </div>

            {/* Target per classe — the editable list at the tile's cadence */}
            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
              <Tile
                eyebrow="Target per classe"
                aside={
                  <span className="font-mono tabular-nums">
                    totale {pctLabel(total)}
                    {cashUseFixedAmount && ' (esclusa liquidità)'}
                  </span>
                }
                reading={describeClassTargets({
                  classCount: assetClasses.length,
                  withSubcategories: classesWithSubcategories,
                  problem: targetProblem,
                })}
              >
                <div className="mt-1 flex flex-col divide-y divide-border">
                  {assetClasses.map((assetClass) => {
                    const state = assetClassStates[assetClass];
                    if (!state) return null;

                    const isAutoCalculated = autoCalculate && (assetClass === 'equity' || assetClass === 'bonds');
                    const isCash = assetClass === 'cash';
                    const subTotal = calculateSubTargetTotal(assetClass);
                    const isValidSubTotal = sumsToHundred(subTotal);
                    // A group that does not add up says so ON THE CLASS ROW, closed or open: it
                    // used to be visible only inside the group, which could be collapsed.
                    const showsSubTotalError = state.subCategoryEnabled && !isValidSubTotal;

                    return (
                      <div key={assetClass}>
                        {/* Asset class main row */}
                        <div className="flex items-center gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium">{assetClassLabel(assetClass)}</p>
                            {isAutoCalculated && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">Calcolata dalla formula</p>
                            )}
                          </div>
                          {isCash && !isAutoCalculated && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Switch
                                id="cashFixedToggle"
                                checked={cashUseFixedAmount}
                                onCheckedChange={setCashUseFixedAmount}
                                className={interactiveControlClass}
                              />
                              <Label htmlFor="cashFixedToggle" className="whitespace-nowrap text-[11px] text-muted-foreground">
                                fisso €
                              </Label>
                            </div>
                          )}
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Input
                              id={assetClass}
                              type="number"
                              step="0.01"
                              min="0"
                              // No max cap: a single class can exceed 100% of invested capital under leverage.
                              // The fixed-cash case is a € amount.
                              value={
                                isCash && cashUseFixedAmount
                                  ? cashFixedAmount
                                  : state.targetPercentage || 0
                              }
                              onChange={(e) => {
                                if (isCash && cashUseFixedAmount) {
                                  setCashFixedAmount(parseFloat(e.target.value) || 0);
                                } else {
                                  updateAssetClassState(assetClass, {
                                    targetPercentage: roundToTwoDecimals(parseFloat(e.target.value) || 0),
                                  });
                                }
                              }}
                              disabled={isAutoCalculated}
                              aria-label={`Target ${assetClassLabel(assetClass)}`}
                              className={cn(
                                'w-28 text-right font-mono',
                                interactiveControlClass,
                                isAutoCalculated ? 'bg-muted' : ''
                              )}
                            />
                            <span className="w-4 shrink-0 text-sm text-muted-foreground">
                              {isCash && cashUseFixedAmount ? '€' : '%'}
                            </span>
                          </div>
                          {/* Sub-category expand/collapse */}
                          <button
                            type="button"
                            className={cn(
                              'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-xs transition-colors hover:text-foreground desktop:h-8',
                              showsSubTotalError ? 'text-destructive' : 'text-muted-foreground'
                            )}
                            onClick={() => updateAssetClassState(assetClass, { expanded: !state.expanded })}
                            aria-expanded={state.expanded}
                            aria-label={`${state.expanded ? 'Chiudi' : 'Apri'} sottocategorie di ${assetClassLabel(assetClass)}${
                              showsSubTotalError ? ` (sommano ${pctLabel(subTotal)}, non 100%)` : ''
                            }`}
                          >
                            {showsSubTotalError ? (
                              <span className="font-mono font-semibold tabular-nums">{pctLabel(subTotal)} ≠ 100%</span>
                            ) : (
                              <span className="hidden sm:inline">Sottocategorie</span>
                            )}
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
                                state.expanded && 'rotate-180'
                              )}
                            />
                          </button>
                        </div>

                        {/* Sub-categories — expandable, flush to the tile's edge */}
                        <Collapsible open={state.expanded}>
                          <CollapsibleContent
                            forceMount
                            className={cn(
                              'overflow-hidden motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none',
                              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                              'data-[state=closed]:hidden'
                            )}
                          >
                            <div className="-mx-5 border-t border-border bg-muted/20 px-5">
                              {/* Enable toggle + sub-total */}
                              <div className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`toggle-${assetClass}`}
                                    checked={state.subCategoryEnabled}
                                    onCheckedChange={(checked: boolean) =>
                                      handleToggleSubCategories(assetClass, checked)
                                    }
                                    className={interactiveControlClass}
                                  />
                                  <Label htmlFor={`toggle-${assetClass}`} className="text-[13px]">
                                    Abilita sottocategorie
                                  </Label>
                                </div>
                                {state.subCategoryEnabled && (
                                  <span
                                    className={cn(
                                      'font-mono text-xs font-semibold tabular-nums',
                                      isValidSubTotal ? 'text-muted-foreground' : 'text-destructive'
                                    )}
                                  >
                                    {pctLabel(subTotal)}
                                    {!isValidSubTotal && ' ≠ 100%'}
                                  </span>
                                )}
                              </div>

                              {/* Sub-target rows */}
                              {state.subCategoryEnabled && (
                                <div className="pb-4">
                                  <div className="divide-y divide-border border-t border-border">
                                    {state.subTargets
                                      .map((target, originalIndex) => ({ target, originalIndex }))
                                      .sort((a, b) => a.target.name.localeCompare(b.target.name))
                                      .map(({ target, originalIndex }) => {
                                        const specificAssetTotal = calculateSpecificAssetTotal(assetClass, originalIndex);
                                        const isValidSpecificTotal = Math.abs(specificAssetTotal - 100) < 0.01;

                                        return (
                                          <div key={originalIndex} className="space-y-3 py-3">
                                            {/* Name + % + delete */}
                                            <div className="flex items-center gap-2">
                                              <div className="min-w-0 flex-1">
                                                <Input
                                                  id={targetFieldId.subName(assetClass, originalIndex)}
                                                  placeholder="Nome sottocategoria"
                                                  value={target.name}
                                                  onChange={(e) =>
                                                    handleSubTargetChange(
                                                      assetClass,
                                                      originalIndex,
                                                      'name',
                                                      e.target.value
                                                    )
                                                  }
                                                  list={`${assetClass}-categories`}
                                                  aria-label="Nome sottocategoria"
                                                  className={cn('text-sm', interactiveControlClass)}
                                                />
                                                <datalist id={`${assetClass}-categories`}>
                                                  {state.categories.map((cat) => (
                                                    <option key={cat} value={cat} />
                                                  ))}
                                                </datalist>
                                              </div>
                                              <Input
                                                id={targetFieldId.subPct(assetClass, originalIndex)}
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                aria-label={`Percentuale di ${target.name || 'sottocategoria'}`}
                                                className={cn(
                                                  'w-24 shrink-0 text-right font-mono',
                                                  interactiveControlClass
                                                )}
                                                value={target.percentage}
                                                onChange={(e) =>
                                                  handleSubTargetChange(
                                                    assetClass,
                                                    originalIndex,
                                                    'percentage',
                                                    roundToTwoDecimals(parseFloat(e.target.value) || 0)
                                                  )
                                                }
                                              />
                                              <span className="shrink-0 text-sm text-muted-foreground">%</span>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveSubTarget(assetClass, originalIndex)}
                                                aria-label={`Rimuovi ${target.name || 'sottocategoria'}`}
                                                className="h-11 w-11 shrink-0 desktop:h-8 desktop:w-8"
                                              >
                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                              </Button>
                                            </div>

                                            {/* Specific assets toggle + expand */}
                                            {target.name && (
                                              <div className="ml-4 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2">
                                                    <Switch
                                                      id={`specific-${assetClass}-${originalIndex}`}
                                                      checked={target.specificAssetsEnabled || false}
                                                      onCheckedChange={(checked) =>
                                                        handleToggleSpecificAssets(
                                                          assetClass,
                                                          originalIndex,
                                                          checked
                                                        )
                                                      }
                                                      className={interactiveControlClass}
                                                    />
                                                    <Label
                                                      htmlFor={`specific-${assetClass}-${originalIndex}`}
                                                      className="cursor-pointer text-xs text-muted-foreground"
                                                    >
                                                      Traccia asset specifici
                                                    </Label>
                                                  </div>
                                                  {target.specificAssetsEnabled && (
                                                    <span
                                                      className={cn(
                                                        'font-mono text-xs font-semibold tabular-nums',
                                                        isValidSpecificTotal ? 'text-muted-foreground' : 'text-destructive'
                                                      )}
                                                    >
                                                      {pctLabel(specificAssetTotal)}
                                                      {!isValidSpecificTotal && ' ≠ 100%'}
                                                    </span>
                                                  )}
                                                </div>

                                                {target.specificAssetsEnabled && (
                                                  <>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-8 w-full justify-start text-xs"
                                                      onClick={() =>
                                                        toggleSubCategoryExpanded(assetClass, originalIndex)
                                                      }
                                                    >
                                                      <ChevronDown
                                                        className={cn(
                                                          'mr-1.5 h-3 w-3 transition-transform duration-200 motion-reduce:transition-none',
                                                          target.expanded && 'rotate-180'
                                                        )}
                                                      />
                                                      {target.expanded ? 'Nascondi' : 'Mostra'} asset specifici
                                                      {target.specificAssets &&
                                                        target.specificAssets.length > 0 && (
                                                          <span className="ml-1.5 text-muted-foreground">
                                                            ({target.specificAssets.length})
                                                          </span>
                                                        )}
                                                    </Button>

                                                    <Collapsible open={target.expanded}>
                                                      <CollapsibleContent
                                                        forceMount
                                                        className={cn(
                                                          'overflow-hidden motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none',
                                                          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                                                          'data-[state=closed]:hidden'
                                                        )}
                                                      >
                                                        <div className="mt-1 space-y-2">
                                                          {target.specificAssets &&
                                                            target.specificAssets.map(
                                                              (specificAsset, specificIndex) => (
                                                                <div
                                                                  key={specificIndex}
                                                                  className="flex items-center gap-2"
                                                                >
                                                                  <Input
                                                                    id={targetFieldId.assetName(assetClass, originalIndex, specificIndex)}
                                                                    placeholder="Ticker/Nome (es. AAPL)"
                                                                    value={specificAsset.name}
                                                                    onChange={(e) =>
                                                                      handleSpecificAssetChange(
                                                                        assetClass,
                                                                        originalIndex,
                                                                        specificIndex,
                                                                        'name',
                                                                        e.target.value
                                                                      )
                                                                    }
                                                                    aria-label="Nome asset specifico"
                                                                    className={cn(
                                                                      'flex-1 text-sm',
                                                                      interactiveControlClass
                                                                    )}
                                                                  />
                                                                  <Input
                                                                    id={targetFieldId.assetPct(assetClass, originalIndex, specificIndex)}
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    max="100"
                                                                    aria-label={`Percentuale di ${specificAsset.name || 'asset specifico'}`}
                                                                    className={cn(
                                                                      'w-24 shrink-0 text-right font-mono text-sm',
                                                                      interactiveControlClass
                                                                    )}
                                                                    value={specificAsset.targetPercentage}
                                                                    onChange={(e) =>
                                                                      handleSpecificAssetChange(
                                                                        assetClass,
                                                                        originalIndex,
                                                                        specificIndex,
                                                                        'targetPercentage',
                                                                        roundToTwoDecimals(
                                                                          parseFloat(e.target.value) || 0
                                                                        )
                                                                      )
                                                                    }
                                                                  />
                                                                  <span className="shrink-0 text-xs text-muted-foreground">
                                                                    %
                                                                  </span>
                                                                  <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-11 w-11 shrink-0 desktop:h-8 desktop:w-8"
                                                                    aria-label={`Rimuovi ${specificAsset.name || 'asset specifico'}`}
                                                                    onClick={() =>
                                                                      handleRemoveSpecificAsset(
                                                                        assetClass,
                                                                        originalIndex,
                                                                        specificIndex
                                                                      )
                                                                    }
                                                                  >
                                                                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                                                                  </Button>
                                                                </div>
                                                              )
                                                            )}
                                                          <Button
                                                            id={targetFieldId.assetAdd(assetClass, originalIndex)}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-11 w-full text-xs desktop:h-8"
                                                            onClick={() =>
                                                              handleAddSpecificAsset(assetClass, originalIndex)
                                                            }
                                                          >
                                                            <Plus className="mr-1.5 h-3 w-3" />
                                                            Aggiungi asset specifico
                                                          </Button>
                                                        </div>
                                                      </CollapsibleContent>
                                                    </Collapsible>
                                                  </>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 w-full sm:w-auto"
                                    onClick={() => handleAddSubTarget(assetClass)}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Aggiungi sottocategoria
                                  </Button>
                                  <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
                                    Le sottocategorie sono espresse come percentuale di{' '}
                                    {assetClassLabel(assetClass)} ({pctLabel(state.targetPercentage)})
                                  </p>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
                <TileMethodNote
                  subject="Target per classe"
                  summary="«Salva» controlla il totale (almeno 100%) e ogni gruppo di sottocategorie (esattamente 100%)."
                >
                  <span>Sopra il 100% il totale è una leva target: 110% vuol dire leva 1,10×.</span>
                  <span>
                    La liquidità come importo fisso in euro esce dal budget percentuale: le altre classi si applicano al
                    patrimonio che resta.
                  </span>
                  <span>
                    Le sottocategorie sono percentuali della loro classe; con «Abilita sottocategorie» spento la classe resta
                    un blocco unico. Lo stesso vale per gli asset specifici dentro una sottocategoria.
                  </span>
                  <span>I target arrivano in Allocazione con «Salva», non prima.</span>
                </TileMethodNote>
              </Tile>
            </div>

          </div>
        </TabsContent>

        {/* Tab: Spese (lazy) — default accounts, the CSV import, the category inventory */}
        {mountedTabs.has('spese') && (
          <TabsContent
          value="spese"
          id={pageTabPanelId('settings-tab-pill', 'spese')}
          aria-label="Spese"
          // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
          // generated reference points at nothing. The name is the label above.
          aria-labelledby={undefined}
          className="mt-4"
        >
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Left column: the two settings the expense FORM reads. Below desktop the wrapper
                  dissolves (`contents`) and each tile is a grid cell; from desktop the two stack at
                  their natural height beside the taller import tile. */}
              <div className="contents desktop:col-span-5 desktop:flex desktop:flex-col desktop:gap-3">
              {/* Conti di default (moved here from Preferenze: they act in the expense dialog) */}
              <div className={TILE_CELL_CLASS}>
                {accountsState === 'failed' ? (
                  <ErrorNotice
                    onRetry={() => void loadCashAccounts()}
                    notice={describeReadFailure({
                      subject: 'Conti di default',
                      consequence:
                        'I conti non sono stati letti: non si possono scegliere ora, e i predefiniti salvati restano quelli di prima.',
                      canRetry: true,
                    })}
                  />
                ) : (
                <Tile
                  eyebrow="Conti di default"
                  reading={describeDefaultAccounts({ debitName: debitAccount?.name, creditName: creditAccount?.name })}
                >
                  {accountsState === 'loading' ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">Caricamento dei conti…</p>
                  ) : cashAssets.length === 0 ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      Nessun conto disponibile: crea un conto (tipo «Liquidità») in Patrimonio.
                    </p>
                  ) : (
                    <div className="mt-1 flex flex-col divide-y divide-border">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Conto di prelievo</p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Per spese e debiti</p>
                        </div>
                        <Select value={defaultDebitCashAssetId} onValueChange={setDefaultDebitCashAssetId}>
                          <SelectTrigger className={cn('w-56', interactiveControlClass)} aria-label="Conto di prelievo">
                            <SelectValue placeholder="Nessun default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessun default</SelectItem>
                            {cashAssets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Conto di accredito</p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Per le entrate</p>
                        </div>
                        <Select value={defaultCreditCashAssetId} onValueChange={setDefaultCreditCashAssetId}>
                          <SelectTrigger className={cn('w-56', interactiveControlClass)} aria-label="Conto di accredito">
                            <SelectValue placeholder="Nessun default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessun default</SelectItem>
                            {cashAssets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Proposti nel modulo di spese ed entrate; solo conti veri, non asset di classe liquidità.
                  </div>
                </Tile>
                )}
              </div>

              {/* Commissioni sui trasferimenti — where a transfer's fee lands (lib/utils/transferFee.ts) */}
              <div className={TILE_CELL_CLASS}>
                {categoriesState === 'failed' ? (
                  <ErrorNotice
                    onRetry={() => void loadExpenseCategories()}
                    notice={describeReadFailure({
                      subject: 'Commissioni sui trasferimenti',
                      consequence:
                        'Le categorie non sono state lette: quella delle commissioni non si può mostrare. Quella salvata resta.',
                      canRetry: true,
                    })}
                  />
                ) : (
                <Tile
                  eyebrow="Commissioni sui trasferimenti"
                  reading={
                    categoriesState === 'loading'
                      ? null
                      : describeTransferFeeCategory({
                          categoryName: transferFeeCategory?.name,
                          subCategoryName: transferFeeSubCategory?.name,
                        })
                  }
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Categoria</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Una categoria di spesa</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={transferFeeCategoryId || undefined}
                          onValueChange={(value) => {
                            setTransferFeeCategoryId(value);
                            setTransferFeeSubCategoryId('');
                          }}
                        >
                          <SelectTrigger className={cn('w-52', interactiveControlClass)} aria-label="Categoria delle commissioni sui trasferimenti">
                            <SelectValue placeholder="Seleziona categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Any spending type can take the fee: an income or a transfer is not a cost. */}
                            {(['variable', 'fixed', 'debt'] as ExpenseType[]).map((type) =>
                              getCategoriesByType(type).length === 0 ? null : (
                                <SelectGroup key={type}>
                                  <SelectLabel>{EXPENSE_TYPE_LABELS[type]}</SelectLabel>
                                  {getCategoriesByType(type).map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        {transferFeeCategoryId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 desktop:h-8"
                            aria-label="Rimuovi la categoria delle commissioni"
                            onClick={() => {
                              setTransferFeeCategoryId('');
                              setTransferFeeSubCategoryId('');
                            }}
                          >
                            Rimuovi
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Sottocategoria</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Opzionale</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={transferFeeSubCategoryId || undefined}
                          onValueChange={setTransferFeeSubCategoryId}
                          disabled={!transferFeeCategoryId}
                        >
                          <SelectTrigger className={cn('w-52', interactiveControlClass)} aria-label="Sottocategoria delle commissioni sui trasferimenti">
                            <SelectValue placeholder="Seleziona sottocategoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {transferFeeCategory?.subCategories.map((sub) => (
                              <SelectItem key={sub.id} value={sub.id}>
                                {sub.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {transferFeeSubCategoryId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 desktop:h-8"
                            aria-label="Rimuovi la sottocategoria delle commissioni"
                            onClick={() => setTransferFeeSubCategoryId('')}
                          >
                            Rimuovi
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Vale per le commissioni nuove; una già registrata resta nella sua categoria.
                  </div>
                </Tile>
                )}
              </div>
              </div>

              {/* Import CSV — the section renders its own tile (preview-first, undo per batch) */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <ExpenseImportSection onImported={handleExpenseImported} />
              </div>

              {/* Categorie — the management inventory at the tile's cadence */}
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
                {categoriesState === 'failed' ? (
                  <ErrorNotice
                    onRetry={() => void loadExpenseCategories()}
                    notice={describeReadFailure({
                      subject: 'Categorie',
                      consequence:
                        "Le categorie non sono state lette: l'elenco sembrerebbe vuoto senza esserlo, quindi qui non compare.",
                      canRetry: true,
                    })}
                  />
                ) : (
                <Tile
                  eyebrow="Categorie"
                  aside={
                    <Button onClick={handleAddExpenseCategory} variant="outline" size="sm" className="h-11 text-[12px] desktop:h-8">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Nuova categoria
                    </Button>
                  }
                  reading={categoriesState === 'loading' ? null : describeExpenseCategories(categoryCounts)}
                >
                  {categoriesState === 'loading' ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">Caricamento delle categorie…</p>
                  ) : (
                    <div className="mt-1">
                      {(['income', 'fixed', 'variable', 'debt'] as ExpenseType[]).map((type) => {
                        const categories = getCategoriesByType(type);
                        if (categories.length === 0) return null;
                        return (
                          <div key={type} className="mt-3 first:mt-2">
                            <p className={TILE_SUB_EYEBROW_CLASS}>{EXPENSE_TYPE_LABELS[type]}</p>
                            <div className="mt-1 divide-y divide-border">
                              {categories.map((category) => (
                                <CategoryRow
                                  key={category.id}
                                  category={category}
                                  onEdit={handleEditExpenseCategory}
                                  onMove={handleMoveExpenseCategory}
                                  onRequestDelete={requestCategoryDelete}
                                  onConfirmDelete={handleConfirmDirectDelete}
                                  announce={announceCategory}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* The list's one live region: arm and disarm are sentences, spoken here. */}
                  <span className="sr-only" role="status" aria-live="polite">
                    {categoryAnnouncement}
                  </span>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Elimina chiede la riassegnazione se la categoria ha transazioni (altrimenti conferma al secondo
                    tocco); la freccia sposta tutte le transazioni in un&apos;altra categoria senza eliminarla.
                  </div>
                </Tile>
                )}
              </div>

            </div>
          </TabsContent>
        )}

        {/* Tab: Dividendi (lazy) — the landing category (saved by the page's Save) + the BTP Italia FOI declaration */}
        {mountedTabs.has('dividendi') && (
          <TabsContent
          value="dividendi"
          id={pageTabPanelId('settings-tab-pill', 'dividendi')}
          aria-label="Dividendi"
          // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
          // generated reference points at nothing. The name is the label above.
          aria-labelledby={undefined}
          className="mt-4"
        >
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Entrate da dividendi — it reads the categories AND the accounts: either failing makes
                  its selects empty for a reason that is not «none», so it steps aside for the notice. */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                {categoriesState === 'failed' || accountsState === 'failed' ? (
                  <ErrorNotice
                    onRetry={() => {
                      if (categoriesState === 'failed') void loadExpenseCategories();
                      if (accountsState === 'failed') void loadCashAccounts();
                    }}
                    notice={describeReadFailure({
                      subject: 'Entrate da dividendi',
                      consequence:
                        'Categorie o conti non letti: la categoria e il conto dei dividendi non si possono mostrare. Quelli salvati restano.',
                      canRetry: true,
                    })}
                  />
                ) : (
                <Tile
                  eyebrow="Entrate da dividendi"
                  reading={describeDividendCategory({
                    categoryName: dividendCategory?.name,
                    subCategoryName: dividendSubCategory?.name,
                    accountName: cashAssets.find((a) => a.id === dividendCashAssetId)?.name,
                  })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Categoria</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Di tipo «Entrate»</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={dividendIncomeCategoryId || undefined}
                          onValueChange={(value) => {
                            setDividendIncomeCategoryId(value);
                            setDividendIncomeSubCategoryId(''); // Reset subcategory
                          }}
                        >
                          <SelectTrigger className={cn('w-52', interactiveControlClass)} aria-label="Categoria entrate dividendi">
                            <SelectValue placeholder="Seleziona categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCategoriesByType('income').map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {dividendIncomeCategoryId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 desktop:h-8"
                            aria-label="Rimuovi la categoria dei dividendi"
                            onClick={() => {
                              setDividendIncomeCategoryId('');
                              setDividendIncomeSubCategoryId('');
                            }}
                          >
                            Rimuovi
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Sottocategoria</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Opzionale</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={dividendIncomeSubCategoryId || undefined}
                          onValueChange={setDividendIncomeSubCategoryId}
                          disabled={!dividendIncomeCategoryId}
                        >
                          <SelectTrigger className={cn('w-52', interactiveControlClass)} aria-label="Sottocategoria entrate dividendi">
                            <SelectValue placeholder="Seleziona sottocategoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {dividendIncomeCategoryId &&
                              expenseCategories
                                .find((cat) => cat.id === dividendIncomeCategoryId)
                                ?.subCategories.map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    {sub.name}
                                  </SelectItem>
                                ))}
                          </SelectContent>
                        </Select>
                        {dividendIncomeSubCategoryId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 desktop:h-8"
                            aria-label="Rimuovi la sottocategoria dei dividendi"
                            onClick={() => setDividendIncomeSubCategoryId('')}
                          >
                            Rimuovi
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Conto di accredito</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Predefinito: uno strumento può averne uno suo
                        </p>
                      </div>
                      <Select value={dividendCashAssetId} onValueChange={setDividendCashAssetId}>
                        <SelectTrigger className={cn('w-56', interactiveControlClass)} aria-label="Conto di accredito dei dividendi">
                          <SelectValue placeholder="Nessun conto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nessun conto</SelectItem>
                          {cashAssets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.currency})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <SyncDividendsButton
                      disabled={isDemo || syncingDividends || !dividendIncomeCategoryId}
                      syncing={syncingDividends}
                      onSync={() => void handleSyncDividends()}
                      announce={announceSync}
                    />
                    <span className="sr-only" role="status" aria-live="polite">
                      {syncAnnouncement}
                    </span>
                    {!dividendIncomeCategoryId && (
                      <p className="mt-2 text-[11px] leading-[1.4] text-warning-foreground">
                        Scegli una categoria per abilitare la sincronizzazione dei dividendi già registrati.
                      </p>
                    )}
                  </div>

                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    La sincronizzazione chiede conferma al secondo tocco e salta i dividendi già sincronizzati; la
                    categoria si salva con il Salva della pagina.
                  </div>
                </Tile>
                )}
              </div>

              {/* BTP Italia — declaration: the FOI is announced per coupon, from the Dividendi calendar */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile eyebrow="BTP Italia" aside="FOI" reading={describeBtpItalia()}>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <DeclarationRow label="Cedola indicizzata" value="fisso + FOI del semestre" mono={false} />
                    <DeclarationRow label="FOI non ancora annunciato" value="cedola provvisoria, solo fisso" mono={false} />
                    <DeclarationRow label="Deflazione" value="FOI negativo contato 0" mono={false} />
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Si gestisce in{' '}
                    <Link href="/dashboard/cashflow?tab=dividends" className={TILE_FOOTER_ACTION_CLASS}>
                      Cashflow › Dividendi
                    </Link>
                    , per singola cedola.
                  </div>
                </Tile>
              </div>

            </div>
          </TabsContent>
        )}

        {/* Tab: Condivisione account — the sharing section renders its own tile; beside it, how it works */}
        {mountedTabs.has('condivisione') && (
          <TabsContent
          value="condivisione"
          id={pageTabPanelId('settings-tab-pill', 'condivisione')}
          aria-label="Condivisione"
          // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
          // generated reference points at nothing. The name is the label above.
          aria-labelledby={undefined}
          className="mt-4"
        >
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <AccountSharingSection disabled={isDemo} />
              </div>
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile
                  eyebrow="Come funziona"
                  reading={[{ text: "L'invitata si registra prima; poi l'account condiviso appare nel suo switcher." }]}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    {[
                      'La persona si registra con la propria email (deve essere abilitata alla registrazione).',
                      'Aggiungi qui la stessa email: l’accesso è completo, non esiste un ruolo «sola lettura».',
                      'Dal suo menu account sceglie quale account vedere; le sue preferenze e il suo tema restano suoi.',
                    ].map((step, index) => (
                      <div key={index} className="flex items-start gap-3 py-3">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-[13px] leading-[1.45]">{step}</span>
                      </div>
                    ))}
                  </div>
                </Tile>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Tab: Collegamenti broker — Scalable read-only bridge (own Tile + refresh login) */}
        {mountedTabs.has('collegamenti') && ownerId && (
          <TabsContent value="collegamenti" className="mt-4">
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-12')}>
                <BrokerConnectionsSection ownerId={ownerId} disabled={isDemo} />
              </div>
            </div>
          </TabsContent>
        )}

        {/* Tab: Aspetto — light/dark/system beside the six color themes */}
        {mountedTabs.has('aspetto') && (
          <TabsContent
          value="aspetto"
          id={pageTabPanelId('settings-tab-pill', 'aspetto')}
          aria-label="Aspetto"
          // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
          // generated reference points at nothing. The name is the label above.
          aria-labelledby={undefined}
          className="mt-4"
        >
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Modalità — next-themes, per device, with the circle view transition */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile eyebrow="Modalità" aside="questo dispositivo" reading={describeThemeMode(resolvedThemeMode)}>
                  <div className="mt-3.5 flex rounded-lg bg-muted p-1" role="group" aria-label="Modalità del tema">
                    {THEME_MODES.map(({ value, label, Icon }) => {
                      const isActive = resolvedThemeMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={isActive}
                          onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
                          className={cn(
                            'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
                            isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Il passaggio anima con la transizione circolare dal punto del clic; il selettore resta anche nel menu
                    account della sidebar.
                  </div>
                </Tile>
              </div>

              {/* Tema colori — the six palettes, synced on the account */}
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-8')}>
                <Tile eyebrow="Tema colori" aside="tutti i dispositivi" reading={describeColorTheme(activeSwatch.name)}>
                  <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 desktop:grid-cols-6">
                    {COLOR_THEME_SWATCHES.map((swatch, index) => {
                      const isActive = colorTheme === swatch.id;
                      return (
                        <button
                          key={swatch.id}
                          onClick={() => setColorTheme(swatch.id)}
                          aria-label={`Colore ${index + 1} di ${COLOR_THEME_SWATCHES.length}: ${swatch.name}`}
                          aria-pressed={isActive}
                          className={cn(
                            'relative flex flex-col rounded-[10px] border-2 p-2.5 text-left transition-all hover:border-primary/60',
                            isActive ? 'border-primary shadow-sm' : 'border-border'
                          )}
                        >
                          {/* Mini preview: light half over dark half, in the theme's own values */}
                          <div className="mb-2.5 h-14 overflow-hidden rounded-md border border-border/50" aria-hidden="true">
                            <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBg }}>
                              <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimary }} />
                              <div className="h-2 flex-1 rounded-full" style={{ background: swatch.swatchAccent }} />
                            </div>
                            <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBgDark }}>
                              <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimaryDark }} />
                              <div className="h-2 flex-1 rounded-full opacity-30" style={{ background: swatch.swatchPrimaryDark }} />
                            </div>
                          </div>
                          <span className="text-[13px] font-medium leading-none">{swatch.name}</span>
                          <span className="mt-1 text-[11px] text-muted-foreground">{swatch.description}</span>
                          {isActive && (
                            <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    La scelta si salva da sola sull&apos;account: nessun Salva necessario.
                  </div>
                </Tile>
              </div>

            </div>
          </TabsContent>
        )}

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

      {/* Category Management Dialog */}
      <CategoryManagementDialog
        open={categoryDialogOpen}
        onClose={handleExpenseCategoryDialogClose}
        category={editingCategory}
        onSuccess={handleExpenseCategorySuccess}
      />

      {/* Category Delete Confirmation Dialog */}
      {categoryToDelete && (
        <CategoryDeleteConfirmDialog
          open={deleteConfirmDialogOpen}
          onClose={() => {
            setDeleteConfirmDialogOpen(false);
            setCategoryToDelete(null);
            setExpenseCountToReassign(0);
            setDeleteDialogOrigin(undefined);
          }}
          onConfirm={handleConfirmDeleteWithReassignment}
          categoryToDelete={categoryToDelete}
          expenseCount={expenseCountToReassign}
          allCategories={expenseCategories}
          triggerOrigin={deleteDialogOrigin}
        />
      )}

      {/* Category Move Dialog */}
      {categoryToMove && (
        <CategoryMoveDialog
          open={moveCategoryDialogOpen}
          onClose={() => {
            setMoveCategoryDialogOpen(false);
            setCategoryToMove(null);
            setExpenseCountToMove(0);
            setMoveDialogOrigin(undefined);
          }}
          onConfirm={handleConfirmMoveCategory}
          sourceCategory={categoryToMove}
          expenseCount={expenseCountToMove}
          allCategories={expenseCategories}
          triggerOrigin={moveDialogOrigin}
        />
      )}

      {/* Dummy Snapshot Modal */}
      {enableTestSnapshots && (
        <CreateDummySnapshotModal
          open={dummySnapshotModalOpen}
          onOpenChange={setDummySnapshotModalOpen}
          userId={ownerId || ''}
        />
      )}

      {/* Delete Dummy Data Dialog */}
      {enableTestSnapshots && (
        <DeleteDummyDataDialog
          open={deleteDummyDataDialogOpen}
          onOpenChange={setDeleteDummyDataDialogOpen}
          userId={ownerId || ''}
          onDeleted={() => {
            // Refresh page or data after deletion
            window.location.reload();
          }}
        />
      )}
    </PageContainer>
  );
}
