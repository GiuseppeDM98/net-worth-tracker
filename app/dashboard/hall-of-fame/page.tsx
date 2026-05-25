/**
 * HALL OF FAME PAGE — redesign (2026-05-22, session UI/UX-improvements)
 *
 * Trade Republic hierarchy: absolute record hero block → period spotlight →
 * single ranking card with Mensile|Annuale + Crescita|Calo|Entrate|Spese pills.
 *
 * Mobile: three-section nav (Panoramica / Mensile / Annuale) shows one section
 * at a time. Desktop: all sections visible simultaneously.
 *
 * Key fixes vs previous version:
 * - Hero block in apertura with absolute best-month and best-year records
 * - chapterReveal: whileInView instead of animate="visible" (prevents simultaneous reveal)
 * - SECTION labels: "Differenza NW" → "Crescita Patrimonio" / "Calo Patrimonio"
 * - Rankings: single card, no max-h overflow-y-auto, top-5 + collapsible on mobile
 * - CurrentPeriodSpotlight: flat divide-y list (no card-within-card)
 * - NoteTrigger: no phantom spacer, always visible on touch / hover-only on desktop
 * - Trophy color: text-amber-500 dark:text-amber-400
 * - MONTH_NAMES from shared constant, SECTION_LABELS from lib/constants/hallOfFame
 */
'use client';

import type { CSSProperties, ComponentType, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { chapterReveal } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { formatCurrency } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SECTION_LABELS } from '@/lib/constants/hallOfFame';
import { useCountUp } from '@/lib/utils/useCountUp';
import {
  HallOfFameData,
  MonthlyRecord,
  YearlyRecord,
  HallOfFameNote,
  HallOfFameSectionKey,
} from '@/types/hall-of-fame';
import {
  getHallOfFameData,
  addHallOfFameNote,
  updateHallOfFameNote,
  deleteHallOfFameNote,
  getNotesForPeriod,
} from '@/lib/services/hallOfFameService';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { HallOfFameNoteDialog } from '@/components/hall-of-fame/HallOfFameNoteDialog';
import { HallOfFameNoteViewDialog } from '@/components/hall-of-fame/HallOfFameNoteViewDialog';
import { HallOfFameSkeleton } from '@/components/hall-of-fame/HallOfFameSkeleton';
import { getItalyMonthYear, getItalyYear } from '@/lib/utils/dateHelpers';
import { toast } from 'sonner';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Loader2,
  RefreshCw,
  Plus,
  NotebookPen,
  ChevronDown,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

type TriggerRect = { left: number; top: number; width: number; height: number } | null;
type RankingTone = 'positive' | 'negative';
type MonthlyValueKey = 'netWorthDiff' | 'totalIncome' | 'totalExpenses';
type YearlyValueKey = 'netWorthDiff' | 'totalIncome' | 'totalExpenses';
type RankingCategory = 'growth' | 'decline' | 'income' | 'expenses';
type MobileView = 'overview' | 'monthly' | 'annual';

type MonthlyConfig = {
  sectionKey: HallOfFameSectionKey;
  title: string;
  description: string;
  recordsKey: keyof Pick<
    HallOfFameData,
    | 'bestMonthsByNetWorthGrowth'
    | 'bestMonthsByIncome'
    | 'worstMonthsByNetWorthDecline'
    | 'worstMonthsByExpenses'
  >;
  valueKey: MonthlyValueKey;
  icon: ComponentType<{ className?: string }>;
  tone: RankingTone;
};

type YearlyConfig = {
  sectionKey: HallOfFameSectionKey;
  title: string;
  description: string;
  recordsKey: keyof Pick<
    HallOfFameData,
    | 'bestYearsByNetWorthGrowth'
    | 'bestYearsByIncome'
    | 'worstYearsByNetWorthDecline'
    | 'worstYearsByExpenses'
  >;
  valueKey: YearlyValueKey;
  icon: ComponentType<{ className?: string }>;
  tone: RankingTone;
};

type SpotlightItem = {
  label: string;
  rank: number;
  value: number;
  percentage?: number | null;
};

type SpotlightSummary = {
  currentLabel: string;
  count: number;
  items: SpotlightItem[];
};

// ─── Module-level constants (stable reference for React Compiler) ────────────

const MOBILE_VIEW_TABS: { value: MobileView; label: string }[] = [
  { value: 'overview', label: 'Panoramica' },
  { value: 'monthly', label: 'Mensile' },
  { value: 'annual', label: 'Annuale' },
];

const PERIOD_TABS: { value: 'monthly' | 'annual'; label: string }[] = [
  { value: 'monthly', label: 'Mensile' },
  { value: 'annual', label: 'Annuale' },
];

const CATEGORY_TABS: { value: RankingCategory; label: string }[] = [
  { value: 'growth', label: 'Crescita' },
  { value: 'decline', label: 'Calo' },
  { value: 'income', label: 'Entrate' },
  { value: 'expenses', label: 'Spese' },
];

const MONTHLY_CONFIGS: MonthlyConfig[] = [
  {
    sectionKey: 'bestMonthsByNetWorthGrowth',
    title: SECTION_LABELS.bestMonthsByNetWorthGrowth,
    description: 'Mesi con il maggior incremento di Patrimonio rispetto al mese precedente',
    recordsKey: 'bestMonthsByNetWorthGrowth',
    valueKey: 'netWorthDiff',
    icon: TrendingUp,
    tone: 'positive',
  },
  {
    sectionKey: 'bestMonthsByIncome',
    title: SECTION_LABELS.bestMonthsByIncome,
    description: 'Mesi con le maggiori entrate',
    recordsKey: 'bestMonthsByIncome',
    valueKey: 'totalIncome',
    icon: DollarSign,
    tone: 'positive',
  },
  {
    sectionKey: 'worstMonthsByNetWorthDecline',
    title: SECTION_LABELS.worstMonthsByNetWorthDecline,
    description: 'Mesi con il maggior decremento di Patrimonio rispetto al mese precedente',
    recordsKey: 'worstMonthsByNetWorthDecline',
    valueKey: 'netWorthDiff',
    icon: TrendingDown,
    tone: 'negative',
  },
  {
    sectionKey: 'worstMonthsByExpenses',
    title: SECTION_LABELS.worstMonthsByExpenses,
    description: 'Mesi con le maggiori spese',
    recordsKey: 'worstMonthsByExpenses',
    valueKey: 'totalExpenses',
    icon: TrendingDown,
    tone: 'negative',
  },
];

const YEARLY_CONFIGS: YearlyConfig[] = [
  {
    sectionKey: 'bestYearsByNetWorthGrowth',
    title: SECTION_LABELS.bestYearsByNetWorthGrowth,
    description: "Anni con il maggior incremento di Patrimonio rispetto all'anno precedente",
    recordsKey: 'bestYearsByNetWorthGrowth',
    valueKey: 'netWorthDiff',
    icon: TrendingUp,
    tone: 'positive',
  },
  {
    sectionKey: 'bestYearsByIncome',
    title: SECTION_LABELS.bestYearsByIncome,
    description: 'Anni con le maggiori entrate',
    recordsKey: 'bestYearsByIncome',
    valueKey: 'totalIncome',
    icon: DollarSign,
    tone: 'positive',
  },
  {
    sectionKey: 'worstYearsByNetWorthDecline',
    title: SECTION_LABELS.worstYearsByNetWorthDecline,
    description: "Anni con il maggior decremento di Patrimonio rispetto all'anno precedente",
    recordsKey: 'worstYearsByNetWorthDecline',
    valueKey: 'netWorthDiff',
    icon: TrendingDown,
    tone: 'negative',
  },
  {
    sectionKey: 'worstYearsByExpenses',
    title: SECTION_LABELS.worstYearsByExpenses,
    description: 'Anni con le maggiori spese',
    recordsKey: 'worstYearsByExpenses',
    valueKey: 'totalExpenses',
    icon: TrendingDown,
    tone: 'negative',
  },
];

// Category → config index mapping
const CATEGORY_TO_MONTHLY_INDEX: Record<RankingCategory, number> = {
  growth: 0,
  income: 1,
  decline: 2,
  expenses: 3,
};

const CATEGORY_TO_YEARLY_INDEX: Record<RankingCategory, number> = {
  growth: 0,
  income: 1,
  decline: 2,
  expenses: 3,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getValueTone(value: number) {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-foreground';
}

function captureTriggerRect(element: HTMLElement | null): TriggerRect {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function buildDialogStyle(
  open: boolean,
  triggerRect: TriggerRect,
  dialogRef: RefObject<HTMLDivElement | null>,
  setStyle: (style: CSSProperties | undefined) => void
) {
  if (!open || !triggerRect) {
    setStyle(undefined);
    return () => undefined;
  }

  const frameId = requestAnimationFrame(() => {
    const dialog = dialogRef.current;
    if (!dialog) { setStyle(undefined); return; }
    const dialogRect = dialog.getBoundingClientRect();
    const originX = triggerRect.left + triggerRect.width / 2 - dialogRect.left;
    const originY = triggerRect.top + triggerRect.height / 2 - dialogRect.top;
    setStyle({ transformOrigin: `${originX}px ${originY}px` });
  });

  return () => cancelAnimationFrame(frameId);
}

function buildMonthlySpotlight(data: HallOfFameData | null): SpotlightSummary {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const currentLabel = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

  if (!data) return { currentLabel, count: 0, items: [] };

  const items = MONTHLY_CONFIGS.flatMap((config) => {
    const records = data[config.recordsKey] as MonthlyRecord[];
    const rank = records.findIndex(
      (r) => r.year === currentYear && r.month === currentMonth
    );
    if (rank < 0) return [];

    const record = records[rank];
    const rawValue = record[config.valueKey];
    const value = config.valueKey === 'totalExpenses' ? -Math.abs(rawValue) : rawValue;
    const percentage =
      config.valueKey === 'netWorthDiff' && record.previousNetWorth > 0
        ? (record.netWorthDiff / record.previousNetWorth) * 100
        : null;

    return [{ label: config.title, rank: rank + 1, value, percentage }];
  });

  return { currentLabel, count: items.length, items };
}

function buildYearlySpotlight(data: HallOfFameData | null): SpotlightSummary {
  const currentYear = getItalyYear();
  const currentLabel = `${currentYear}`;

  if (!data) return { currentLabel, count: 0, items: [] };

  const items = YEARLY_CONFIGS.flatMap((config) => {
    const records = data[config.recordsKey] as YearlyRecord[];
    const rank = records.findIndex((r) => r.year === currentYear);
    if (rank < 0) return [];

    const record = records[rank];
    const rawValue = record[config.valueKey];
    const value = config.valueKey === 'totalExpenses' ? -Math.abs(rawValue) : rawValue;
    const percentage =
      config.valueKey === 'netWorthDiff' && record.startOfYearNetWorth > 0
        ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
        : null;

    return [{ label: config.title, rank: rank + 1, value, percentage }];
  });

  return { currentLabel, count: items.length, items };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function HallOfFamePage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1440px)');

  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const [mobileView, setMobileView] = useState<MobileView>('overview');
  const [rankingPeriod, setRankingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [rankingCategory, setRankingCategory] = useState<RankingCategory>('growth');

  const [noteViewDialogOpen, setNoteViewDialogOpen] = useState(false);
  const [viewingNote, setViewingNote] = useState<HallOfFameNote | null>(null);
  const [noteEditDialogOpen, setNoteEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<HallOfFameNote | null>(null);
  const [noteTriggerRect, setNoteTriggerRect] = useState<TriggerRect>(null);
  const [noteViewDialogStyle, setNoteViewDialogStyle] = useState<CSSProperties>();
  const [noteEditDialogStyle, setNoteEditDialogStyle] = useState<CSSProperties>();

  const addNoteButtonRef = useRef<HTMLButtonElement | null>(null);
  const noteViewDialogRef = useRef<HTMLDivElement | null>(null);
  const noteEditDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  useEffect(
    () => buildDialogStyle(noteViewDialogOpen, noteTriggerRect, noteViewDialogRef, setNoteViewDialogStyle),
    [noteViewDialogOpen, noteTriggerRect]
  );

  useEffect(
    () => buildDialogStyle(noteEditDialogOpen, noteTriggerRect, noteEditDialogRef, setNoteEditDialogStyle),
    [noteEditDialogOpen, noteTriggerRect]
  );

  const currentMonthSpotlight = useMemo(() => buildMonthlySpotlight(data), [data]);
  const currentYearSpotlight = useMemo(() => buildYearlySpotlight(data), [data]);

  // Effective period: desktop uses pill state, mobile derives from section nav
  const activePeriod: 'monthly' | 'annual' = isDesktop
    ? rankingPeriod
    : mobileView === 'annual'
    ? 'annual'
    : 'monthly';

  const activeMonthlyConfig = MONTHLY_CONFIGS[CATEGORY_TO_MONTHLY_INDEX[rankingCategory]];
  const activeYearlyConfig = YEARLY_CONFIGS[CATEGORY_TO_YEARLY_INDEX[rankingCategory]];
  const activeConfig = activePeriod === 'monthly' ? activeMonthlyConfig : activeYearlyConfig;

  async function loadData() {
    if (!user) return;
    try {
      setLoading(true);
      const hallOfFameData = await getHallOfFameData(user.uid);
      setData(hallOfFameData);
    } catch (error) {
      console.error('Error loading Hall of Fame data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecalculate() {
    if (!user) return;
    try {
      setRecalculating(true);
      const response = await authenticatedFetch('/api/hall-of-fame/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      if (!response.ok) throw new Error('Failed to recalculate Hall of Fame');
      toast.success('Record aggiornati.');
      await loadData();
    } catch (error) {
      console.error('Error recalculating Hall of Fame:', error);
      toast.error("Errore durante l'aggiornamento dei record");
    } finally {
      setRecalculating(false);
    }
  }

  function getAvailableYears(d: HallOfFameData): number[] {
    const years = new Set<number>([
      ...d.bestMonthsByNetWorthGrowth,
      ...d.bestMonthsByIncome,
      ...d.worstMonthsByNetWorthDecline,
      ...d.worstMonthsByExpenses,
      ...d.bestYearsByNetWorthGrowth,
      ...d.bestYearsByIncome,
      ...d.worstYearsByNetWorthDecline,
      ...d.worstYearsByExpenses,
    ].map((r) => r.year));
    return Array.from(years).sort((a, b) => b - a);
  }

  async function handleNoteSave(noteData: {
    id?: string;
    text: string;
    sections: HallOfFameSectionKey[];
    year: number;
    month?: number;
  }) {
    if (!user) return;
    try {
      if (noteData.id) {
        await updateHallOfFameNote(user.uid, noteData.id, {
          text: noteData.text,
          sections: noteData.sections,
        });
      } else {
        await addHallOfFameNote(user.uid, {
          text: noteData.text,
          sections: noteData.sections,
          year: noteData.year,
          month: noteData.month,
        });
      }
      await loadData();
    } catch (error) {
      console.error('Error saving note:', error);
      throw error;
    }
  }

  async function handleNoteDelete(noteId: string) {
    if (!user) return;
    try {
      await deleteHallOfFameNote(user.uid, noteId);
      await loadData();
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  }

  function handleNoteIconClick(note: HallOfFameNote, triggerElement: HTMLElement | null) {
    setNoteTriggerRect(captureTriggerRect(triggerElement));
    setViewingNote(note);
    setNoteViewDialogOpen(true);
  }

  function handleEditFromView() {
    setEditingNote(viewingNote);
    setNoteViewDialogOpen(false);
    setNoteEditDialogOpen(true);
  }

  function handleAddNoteClick() {
    setNoteTriggerRect(captureTriggerRect(addNoteButtonRef.current));
    setEditingNote(null);
    setNoteEditDialogOpen(true);
  }

  function handleViewDialogChange(open: boolean) {
    setNoteViewDialogOpen(open);
    if (!open) setNoteViewDialogStyle(undefined);
  }

  function handleEditDialogChange(open: boolean) {
    setNoteEditDialogOpen(open);
    if (!open) { setNoteEditDialogStyle(undefined); setEditingNote(null); }
  }

  if (loading) return <HallOfFameSkeleton />;

  const notes = data?.notes ?? [];

  // Absolute-best records for hero block
  const bestMonth = data?.bestMonthsByNetWorthGrowth[0] ?? null;
  const bestYear = data?.bestYearsByNetWorthGrowth[0] ?? null;
  const bestMonthPct =
    bestMonth && bestMonth.previousNetWorth > 0
      ? (bestMonth.netWorthDiff / bestMonth.previousNetWorth) * 100
      : null;
  const bestYearPct =
    bestYear && bestYear.startOfYearNetWorth > 0
      ? (bestYear.netWorthDiff / bestYear.startOfYearNetWorth) * 100
      : null;

  const showOverview = mobileView === 'overview';
  const showRankings = mobileView !== 'overview';

  return (
    <div className="p-4 sm:p-6 desktop:p-8 space-y-6 max-desktop:portrait:pb-20">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
            Record personali
          </p>
          <div className="flex items-center gap-3">
            <Trophy className="h-7 w-7 text-amber-500 dark:text-amber-400" />
            <h1 className="text-3xl font-semibold desktop:text-4xl">Hall of Fame</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            I record assoluti del tuo percorso finanziario, con focus immediato sul periodo corrente.
          </p>
        </div>

        {/* Mobile section nav pill */}
        <div className="desktop:hidden">
          <div
            role="tablist"
            aria-label="Sezione"
            className="relative flex gap-1 rounded-lg bg-muted p-1"
          >
            {MOBILE_VIEW_TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                type="button"
                aria-selected={mobileView === tab.value}
                onClick={() => setMobileView(tab.value)}
                className={cn(
                  'relative flex-1 h-9 rounded-md text-xs font-medium transition-colors',
                  mobileView === tab.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mobileView === tab.value && (
                  <motion.span
                    layoutId="hof-mobile-nav"
                    className="absolute inset-0 rounded-md bg-background shadow-sm"
                    transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-border" />
      </header>

      {/* ── PANORAMICA (hero + spotlight) ──────────────────────────────── */}
      <motion.section
        variants={chapterReveal}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className={cn('space-y-4', !showOverview && 'hidden desktop:block')}
      >
        {/* Hero block — absolute records */}
        {bestMonth ? (
          <HeroBlock
            bestMonth={bestMonth}
            bestMonthPct={bestMonthPct}
            bestYear={bestYear}
            bestYearPct={bestYearPct}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Crea almeno 2 snapshot per visualizzare i tuoi record.
              </p>
              <div className="mt-4">
                <Button
                  onClick={handleRecalculate}
                  disabled={isDemo || recalculating}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                  variant="outline"
                  className="gap-2"
                >
                  {recalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Aggiorna i record
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Periodo corrente spotlight */}
        {data && (
          <div className="grid gap-4 desktop:grid-cols-2">
            <SpotlightCard
              title="Mese corrente"
              summary={currentMonthSpotlight}
              emptyText="Il mese corrente non è ancora entrato nelle classifiche mensili."
            />
            <SpotlightCard
              title="Anno corrente"
              summary={currentYearSpotlight}
              emptyText="L'anno corrente non è ancora entrato nelle classifiche annuali."
            />
          </div>
        )}
      </motion.section>

      {/* ── CLASSIFICHE ────────────────────────────────────────────────── */}
      {data && (
        <motion.section
          variants={chapterReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className={cn('space-y-4 border-t border-border/40 pt-6', !showRankings && 'hidden desktop:block')}
        >
          <div className="flex flex-col gap-3">
            {/* Section eyebrow */}
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
                Classifiche
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {activePeriod === 'monthly' ? 'Record Mensili' : 'Record Annuali'}
              </h2>
            </div>

            {/* Desktop period pill */}
            <div
              role="tablist"
              aria-label="Periodo"
              className="hidden desktop:flex relative gap-1 self-start rounded-lg bg-muted p-1"
            >
              {PERIOD_TABS.map((tab) => (
                <button
                  key={tab.value}
                  role="tab"
                  type="button"
                  aria-selected={rankingPeriod === tab.value}
                  onClick={() => setRankingPeriod(tab.value)}
                  className={cn(
                    'relative h-9 px-5 rounded-md text-sm font-medium transition-colors',
                    rankingPeriod === tab.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {rankingPeriod === tab.value && (
                    <motion.span
                      layoutId="hof-period-tab"
                      className="absolute inset-0 rounded-md bg-background shadow-sm"
                      transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Category pill */}
            <div
              role="tablist"
              aria-label="Categoria"
              className="relative flex gap-1 rounded-lg bg-muted p-1"
            >
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  role="tab"
                  type="button"
                  aria-selected={rankingCategory === tab.value}
                  onClick={() => setRankingCategory(tab.value)}
                  className={cn(
                    'relative flex-1 h-9 rounded-md text-xs font-medium transition-colors',
                    rankingCategory === tab.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {rankingCategory === tab.value && (
                    <motion.span
                      layoutId="hof-category-tab"
                      className="absolute inset-0 rounded-md bg-background shadow-sm"
                      transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ranking card */}
          <Card className="overflow-hidden">
            {/* Card header */}
            <div className="px-6 py-4 border-b border-border/60">
              <p className="text-sm font-semibold text-foreground">{activeConfig.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{activeConfig.description}</p>
            </div>

            {/* Desktop table — no max-h, no overflow-y-auto */}
            <div className="hidden desktop:block">
              {activePeriod === 'monthly' ? (
                <MonthlyTable
                  records={data[activeMonthlyConfig.recordsKey] as MonthlyRecord[]}
                  valueKey={activeMonthlyConfig.valueKey}
                  sectionKey={activeMonthlyConfig.sectionKey}
                  notes={notes}
                  onNoteClick={handleNoteIconClick}
                />
              ) : (
                <YearlyTable
                  records={data[activeYearlyConfig.recordsKey] as YearlyRecord[]}
                  valueKey={activeYearlyConfig.valueKey}
                  sectionKey={activeYearlyConfig.sectionKey}
                  notes={notes}
                  onNoteClick={handleNoteIconClick}
                />
              )}
            </div>

            {/* Mobile flat list — top 5 + collapsible */}
            <div className="desktop:hidden">
              {activePeriod === 'monthly' ? (
                <MonthlyFlatList
                  records={data[activeMonthlyConfig.recordsKey] as MonthlyRecord[]}
                  valueKey={activeMonthlyConfig.valueKey}
                  sectionKey={activeMonthlyConfig.sectionKey}
                  notes={notes}
                  onNoteClick={handleNoteIconClick}
                />
              ) : (
                <YearlyFlatList
                  records={data[activeYearlyConfig.recordsKey] as YearlyRecord[]}
                  valueKey={activeYearlyConfig.valueKey}
                  sectionKey={activeYearlyConfig.sectionKey}
                  notes={notes}
                  onNoteClick={handleNoteIconClick}
                />
              )}
            </div>
          </Card>
        </motion.section>
      )}

      {/* ── ACTIONS (bottom) ───────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end border-t border-border/40 pt-4">
          <Button
            ref={addNoteButtonRef}
            onClick={handleAddNoteClick}
            disabled={isDemo}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Aggiungi Nota
          </Button>
          <Button
            onClick={handleRecalculate}
            disabled={isDemo || recalculating}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            variant="outline"
            className="gap-2"
          >
            {recalculating ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Ricalcolo in corso...</>
            ) : (
              <><RefreshCw className="h-4 w-4" />Aggiorna i record</>
            )}
          </Button>
        </div>
      )}

      {/* ── DIALOGS ────────────────────────────────────────────────────── */}
      <HallOfFameNoteViewDialog
        open={noteViewDialogOpen}
        onOpenChange={handleViewDialogChange}
        note={viewingNote}
        onEditClick={handleEditFromView}
        dialogRef={noteViewDialogRef}
        style={noteViewDialogStyle}
      />

      {data && (
        <HallOfFameNoteDialog
          open={noteEditDialogOpen}
          onOpenChange={handleEditDialogChange}
          editNote={editingNote}
          availableYears={getAvailableYears(data)}
          onSave={handleNoteSave}
          onDelete={handleNoteDelete}
          dialogRef={noteEditDialogRef}
          style={noteEditDialogStyle}
        />
      )}
    </div>
  );
}

// ─── Hero Block ─────────────────────────────────────────────────────────────

function HeroBlock({
  bestMonth,
  bestMonthPct,
  bestYear,
  bestYearPct,
}: {
  bestMonth: MonthlyRecord;
  bestMonthPct: number | null;
  bestYear: YearlyRecord | null;
  bestYearPct: number | null;
}) {
  const animated = useCountUp(bestMonth.netWorthDiff, { duration: 620, once: true });

  return (
    <Card className="overflow-hidden">
      {/* Primary hero — best month NW growth */}
      <div className="px-6 py-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
          Record mensile assoluto
        </p>
        <p
          className={cn(
            'mt-2 font-mono text-4xl font-bold leading-none tracking-tight tabular-nums',
            getValueTone(bestMonth.netWorthDiff)
          )}
        >
          {bestMonth.netWorthDiff > 0 ? '+' : ''}
          {formatCurrency(animated ?? bestMonth.netWorthDiff)}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {bestMonth.monthYear}
          {bestMonthPct !== null && (
            <span className={cn('ml-2 font-mono font-medium', getValueTone(bestMonthPct))}>
              {bestMonthPct >= 0 ? '+' : ''}{bestMonthPct.toFixed(1)}%
            </span>
          )}
        </p>
      </div>

      {/* Secondary row — best year NW growth */}
      {bestYear && (
        <div className="border-t border-border/60 divide-y divide-border/60">
          <div className="flex items-center justify-between px-6 py-3.5">
            <p className="text-sm text-muted-foreground">Miglior anno</p>
            <div className="text-right">
              <p className={cn('font-mono text-sm font-semibold tabular-nums', getValueTone(bestYear.netWorthDiff))}>
                {bestYear.netWorthDiff > 0 ? '+' : ''}
                {formatCurrency(bestYear.netWorthDiff)}
              </p>
              <p className="text-xs text-muted-foreground">
                {bestYear.year}
                {bestYearPct !== null && (
                  <span className={cn('ml-1.5 font-mono', getValueTone(bestYearPct))}>
                    {bestYearPct >= 0 ? '+' : ''}{bestYearPct.toFixed(1)}%
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Spotlight Card ──────────────────────────────────────────────────────────

function SpotlightCard({
  title,
  summary,
  emptyText,
}: {
  title: string;
  summary: SpotlightSummary;
  emptyText: string;
}) {
  return (
    <Card className={cn('overflow-hidden', summary.count > 0 && 'border-primary/30')}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">{title}</p>
          <p className="mt-1 text-xl font-semibold font-mono tabular-nums">{summary.currentLabel}</p>
        </div>
        <Badge
          variant={summary.count > 0 ? 'default' : 'outline'}
          className="shrink-0"
        >
          {summary.count > 0 ? `${summary.count} ${summary.count === 1 ? 'presenza' : 'presenze'}` : 'Fuori classifica'}
        </Badge>
      </div>

      {/* Items — flat divide-y, no card-within-card */}
      {summary.count > 0 ? (
        <div className="divide-y divide-border/60">
          {summary.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn('font-mono text-sm font-semibold tabular-nums', getValueTone(item.value))}>
                  {item.value > 0 ? '+' : ''}
                  {formatCurrency(item.value)}
                  {item.percentage != null && (
                    <span className={cn('ml-2 text-xs font-medium', getValueTone(item.percentage))}>
                      {item.percentage >= 0 ? '+' : ''}{item.percentage.toFixed(1)}%
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs font-bold text-primary">#{item.rank}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      )}
    </Card>
  );
}

// ─── Note Trigger ────────────────────────────────────────────────────────────

function NoteTrigger({
  notes,
  sectionKey,
  year,
  month,
  onNoteClick,
}: {
  notes: HallOfFameNote[];
  sectionKey: HallOfFameSectionKey;
  year: number;
  month?: number;
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  const matchingNotes = getNotesForPeriod(notes, sectionKey, year, month);
  if (matchingNotes.length === 0) return null;

  const note = matchingNotes[0];

  return (
    <button
      type="button"
      onClick={(e) => onNoteClick(note, e.currentTarget)}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-500 dark:text-amber-400 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/30 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100"
      aria-label="Visualizza nota"
    >
      <NotebookPen className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Period Indicator ────────────────────────────────────────────────────────

function PeriodIndicator({ active, label = 'In corso' }: { active: boolean; label?: string }) {
  if (!active) return null;
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10px] px-1.5 py-0 h-4">
      {label}
    </Badge>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyRankingState() {
  return (
    <div className="px-6 py-8 text-center">
      <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
    </div>
  );
}

// ─── Desktop Monthly Table ───────────────────────────────────────────────────

function MonthlyTable({
  records,
  valueKey,
  sectionKey,
  notes,
  onNoteClick,
}: {
  records: MonthlyRecord[];
  valueKey: MonthlyValueKey;
  sectionKey: HallOfFameSectionKey;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  if (records.length === 0) return <EmptyRankingState />;

  const showPct = valueKey === 'netWorthDiff';
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Rank</TableHead>
          <TableHead className="min-w-[120px]">Mese</TableHead>
          <TableHead className="text-right">Valore</TableHead>
          {showPct && <TableHead className="text-right w-20">%</TableHead>}
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record, index) => {
          const isCurrent = record.year === currentYear && record.month === currentMonth;
          const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
          const pct =
            showPct && record.previousNetWorth > 0
              ? (record.netWorthDiff / record.previousNetWorth) * 100
              : null;

          return (
            <motion.tr
              key={`${record.year}-${record.month}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(index, 12) * 0.025 }}
              className={cn(
                'group border-b transition-colors hover:bg-muted/50',
                isCurrent && 'bg-primary/5 hover:bg-primary/10'
              )}
            >
              <TableCell className={cn('font-mono font-medium', isCurrent && 'text-primary')}>
                {index + 1}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span>{record.monthYear}</span>
                  <PeriodIndicator active={isCurrent} label="Ora" />
                </div>
              </TableCell>
              <TableCell className={cn('text-right font-mono whitespace-nowrap', getValueTone(value))}>
                {value > 0 ? '+' : ''}
                {formatCurrency(value)}
              </TableCell>
              {showPct && (
                <TableCell className={cn('text-right font-mono text-sm whitespace-nowrap', pct !== null && getValueTone(pct))}>
                  {pct !== null && <>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</>}
                </TableCell>
              )}
              <TableCell className="text-center">
                <NoteTrigger
                  notes={notes}
                  sectionKey={sectionKey}
                  year={record.year}
                  month={record.month}
                  onNoteClick={onNoteClick}
                />
              </TableCell>
            </motion.tr>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Desktop Yearly Table ────────────────────────────────────────────────────

function YearlyTable({
  records,
  valueKey,
  sectionKey,
  notes,
  onNoteClick,
}: {
  records: YearlyRecord[];
  valueKey: YearlyValueKey;
  sectionKey: HallOfFameSectionKey;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  if (records.length === 0) return <EmptyRankingState />;

  const showPct = valueKey === 'netWorthDiff';
  const currentYear = getItalyYear();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Rank</TableHead>
          <TableHead className="min-w-[96px]">Anno</TableHead>
          <TableHead className="text-right">Valore</TableHead>
          {showPct && <TableHead className="text-right w-20">%</TableHead>}
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record, index) => {
          const isCurrent = record.year === currentYear;
          const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
          const pct =
            showPct && record.startOfYearNetWorth > 0
              ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
              : null;

          return (
            <motion.tr
              key={record.year}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(index, 10) * 0.025 }}
              className={cn(
                'group border-b transition-colors hover:bg-muted/50',
                isCurrent && 'bg-primary/5 hover:bg-primary/10'
              )}
            >
              <TableCell className={cn('font-mono font-medium', isCurrent && 'text-primary')}>
                {index + 1}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{record.year}</span>
                  <PeriodIndicator active={isCurrent} label="Ora" />
                </div>
              </TableCell>
              <TableCell className={cn('text-right font-mono whitespace-nowrap', getValueTone(value))}>
                {value > 0 ? '+' : ''}
                {formatCurrency(value)}
              </TableCell>
              {showPct && (
                <TableCell className={cn('text-right font-mono text-sm whitespace-nowrap', pct !== null && getValueTone(pct))}>
                  {pct !== null && <>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</>}
                </TableCell>
              )}
              <TableCell className="text-center">
                <NoteTrigger
                  notes={notes}
                  sectionKey={sectionKey}
                  year={record.year}
                  onNoteClick={onNoteClick}
                />
              </TableCell>
            </motion.tr>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Mobile Flat Lists ───────────────────────────────────────────────────────

function MonthlyFlatList({
  records,
  valueKey,
  sectionKey,
  notes,
  onNoteClick,
}: {
  records: MonthlyRecord[];
  valueKey: MonthlyValueKey;
  sectionKey: HallOfFameSectionKey;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();

  if (records.length === 0) return <EmptyRankingState />;

  const top5 = records.slice(0, 5);
  const rest = records.slice(5);
  const hasMore = rest.length > 0;

  function renderRow(record: MonthlyRecord, index: number) {
    const isCurrent = record.year === currentYear && record.month === currentMonth;
    const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
    const pct =
      valueKey === 'netWorthDiff' && record.previousNetWorth > 0
        ? (record.netWorthDiff / record.previousNetWorth) * 100
        : null;

    return (
      <div
        key={`${record.year}-${record.month}`}
        className={cn(
          'group flex items-center gap-3 px-6 py-3.5',
          isCurrent && 'bg-primary/5'
        )}
      >
        <span className={cn('w-6 shrink-0 font-mono text-sm font-bold tabular-nums', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{record.monthYear}</span>
            <PeriodIndicator active={isCurrent} label="Ora" />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('font-mono text-sm font-semibold tabular-nums', getValueTone(value))}>
            {value > 0 ? '+' : ''}{formatCurrency(value)}
          </p>
          {pct !== null && (
            <p className={cn('font-mono text-xs tabular-nums', getValueTone(pct))}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
            </p>
          )}
        </div>
        <NoteTrigger notes={notes} sectionKey={sectionKey} year={record.year} month={record.month} onNoteClick={onNoteClick} />
      </div>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="divide-y divide-border/60">
        {top5.map((r, i) => renderRow(r, i))}
      </div>
      {hasMore && (
        <CollapsibleContent>
          <div className="divide-y divide-border/60">
            {rest.map((r, i) => renderRow(r, 5 + i))}
          </div>
        </CollapsibleContent>
      )}
      {hasMore && (
        <div className="border-t border-border/60 px-6 py-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none', expanded && 'rotate-180')} />
              {expanded ? 'Mostra meno' : `Vedi tutti (${records.length})`}
            </button>
          </CollapsibleTrigger>
        </div>
      )}
    </Collapsible>
  );
}

function YearlyFlatList({
  records,
  valueKey,
  sectionKey,
  notes,
  onNoteClick,
}: {
  records: YearlyRecord[];
  valueKey: YearlyValueKey;
  sectionKey: HallOfFameSectionKey;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentYear = getItalyYear();

  if (records.length === 0) return <EmptyRankingState />;

  const top5 = records.slice(0, 5);
  const rest = records.slice(5);
  const hasMore = rest.length > 0;

  function renderRow(record: YearlyRecord, index: number) {
    const isCurrent = record.year === currentYear;
    const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
    const pct =
      valueKey === 'netWorthDiff' && record.startOfYearNetWorth > 0
        ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
        : null;

    return (
      <div
        key={record.year}
        className={cn('group flex items-center gap-3 px-6 py-3.5', isCurrent && 'bg-primary/5')}
      >
        <span className={cn('w-6 shrink-0 font-mono text-sm font-bold tabular-nums', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{record.year}</span>
            <PeriodIndicator active={isCurrent} label="Ora" />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('font-mono text-sm font-semibold tabular-nums', getValueTone(value))}>
            {value > 0 ? '+' : ''}{formatCurrency(value)}
          </p>
          {pct !== null && (
            <p className={cn('font-mono text-xs tabular-nums', getValueTone(pct))}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
            </p>
          )}
        </div>
        <NoteTrigger notes={notes} sectionKey={sectionKey} year={record.year} onNoteClick={onNoteClick} />
      </div>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="divide-y divide-border/60">
        {top5.map((r, i) => renderRow(r, i))}
      </div>
      {hasMore && (
        <CollapsibleContent>
          <div className="divide-y divide-border/60">
            {rest.map((r, i) => renderRow(r, 5 + i))}
          </div>
        </CollapsibleContent>
      )}
      {hasMore && (
        <div className="border-t border-border/60 px-6 py-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none', expanded && 'rotate-180')} />
              {expanded ? 'Mostra meno' : `Vedi tutti (${records.length})`}
            </button>
          </CollapsibleTrigger>
        </div>
      )}
    </Collapsible>
  );
}
