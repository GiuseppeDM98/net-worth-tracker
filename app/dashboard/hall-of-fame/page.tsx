/**
 * HALL OF FAME PAGE
 *
 * Editorial ranking surface for the user's strongest and weakest monthly/yearly records.
 * The implementation favors hierarchy, local continuity, and static emphasis over
 * celebratory motion so the numbers remain the main subject.
 */
'use client';

import type { CSSProperties, ComponentType, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  chapterReveal,
  staggerContainer,
  cardItem,
  fastStaggerContainer,
  listItem,
} from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { formatCurrency } from '@/lib/utils/formatters';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';

type TriggerRect = {
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

type RankingTone = 'positive' | 'negative';

type MonthlyValueKey = 'netWorthDiff' | 'totalIncome' | 'totalExpenses';
type YearlyValueKey = 'netWorthDiff' | 'totalIncome' | 'totalExpenses';

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

const ITALIAN_MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
] as const;

const MONTHLY_CONFIGS: MonthlyConfig[] = [
  {
    sectionKey: 'bestMonthsByNetWorthGrowth',
    title: 'Miglior Mese: Differenza NW',
    description: 'Mesi con il maggior incremento di Net Worth rispetto al mese precedente',
    recordsKey: 'bestMonthsByNetWorthGrowth',
    valueKey: 'netWorthDiff',
    icon: TrendingUp,
    tone: 'positive',
  },
  {
    sectionKey: 'bestMonthsByIncome',
    title: 'Miglior Mese: Entrate',
    description: 'Mesi con le maggiori entrate',
    recordsKey: 'bestMonthsByIncome',
    valueKey: 'totalIncome',
    icon: DollarSign,
    tone: 'positive',
  },
  {
    sectionKey: 'worstMonthsByNetWorthDecline',
    title: 'Peggior Mese: Differenza NW',
    description: 'Mesi con il maggior decremento di Net Worth rispetto al mese precedente',
    recordsKey: 'worstMonthsByNetWorthDecline',
    valueKey: 'netWorthDiff',
    icon: TrendingDown,
    tone: 'negative',
  },
  {
    sectionKey: 'worstMonthsByExpenses',
    title: 'Peggior Mese: Spese',
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
    title: 'Miglior Anno: Differenza NW',
    description: "Anni con il maggior incremento di Net Worth rispetto all'anno precedente",
    recordsKey: 'bestYearsByNetWorthGrowth',
    valueKey: 'netWorthDiff',
    icon: TrendingUp,
    tone: 'positive',
  },
  {
    sectionKey: 'bestYearsByIncome',
    title: 'Miglior Anno: Entrate',
    description: 'Anni con le maggiori entrate',
    recordsKey: 'bestYearsByIncome',
    valueKey: 'totalIncome',
    icon: DollarSign,
    tone: 'positive',
  },
  {
    sectionKey: 'worstYearsByNetWorthDecline',
    title: 'Peggior Anno: Differenza NW',
    description: "Anni con il maggior decremento di Net Worth rispetto all'anno precedente",
    recordsKey: 'worstYearsByNetWorthDecline',
    valueKey: 'netWorthDiff',
    icon: TrendingDown,
    tone: 'negative',
  },
  {
    sectionKey: 'worstYearsByExpenses',
    title: 'Peggior Anno: Uscite',
    description: 'Anni con le maggiori spese',
    recordsKey: 'worstYearsByExpenses',
    valueKey: 'totalExpenses',
    icon: TrendingDown,
    tone: 'negative',
  },
];

function getToneClasses(tone: RankingTone) {
  return tone === 'positive'
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
}

function getValueTone(value: number) {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-foreground';
}

function getPeriodHighlightClasses(isHighlighted: boolean) {
  return isHighlighted
    ? 'border-primary/30 bg-primary/5'
    : 'border-border/70 bg-muted/30';
}

function captureTriggerRect(element: HTMLElement | null): TriggerRect {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
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

    if (!dialog) {
      setStyle(undefined);
      return;
    }

    const dialogRect = dialog.getBoundingClientRect();
    const originX = triggerRect.left + (triggerRect.width / 2) - dialogRect.left;
    const originY = triggerRect.top + (triggerRect.height / 2) - dialogRect.top;

    setStyle({
      transformOrigin: `${originX}px ${originY}px`,
    });
  });

  return () => cancelAnimationFrame(frameId);
}

function buildMonthlySpotlight(data: HallOfFameData | null): SpotlightSummary {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const currentLabel = `${ITALIAN_MONTHS[currentMonth - 1]} ${currentYear}`;

  if (!data) {
    return { currentLabel, count: 0, items: [] };
  }

  const items = MONTHLY_CONFIGS.flatMap((config) => {
    const records = data[config.recordsKey] as MonthlyRecord[];
    const rank = records.findIndex(
      (record) => record.year === currentYear && record.month === currentMonth
    );

    if (rank < 0) {
      return [];
    }

    const record = records[rank];
    const rawValue = record[config.valueKey];
    const value = config.valueKey === 'totalExpenses' ? -Math.abs(rawValue) : rawValue;
    const percentage =
      config.valueKey === 'netWorthDiff' && record.previousNetWorth > 0
        ? (record.netWorthDiff / record.previousNetWorth) * 100
        : null;

    return [{ label: config.title, rank: rank + 1, value, percentage }];
  });

  return {
    currentLabel,
    count: items.length,
    items,
  };
}

function buildYearlySpotlight(data: HallOfFameData | null): SpotlightSummary {
  const currentYear = getItalyYear();
  const currentLabel = `${currentYear}`;

  if (!data) {
    return { currentLabel, count: 0, items: [] };
  }

  const items = YEARLY_CONFIGS.flatMap((config) => {
    const records = data[config.recordsKey] as YearlyRecord[];
    const rank = records.findIndex(
      (record) => record.year === currentYear
    );

    if (rank < 0) {
      return [];
    }

    const record = records[rank];
    const rawValue = record[config.valueKey];
    const value = config.valueKey === 'totalExpenses' ? -Math.abs(rawValue) : rawValue;
    const percentage =
      config.valueKey === 'netWorthDiff' && record.startOfYearNetWorth > 0
        ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
        : null;

    return [{ label: config.title, rank: rank + 1, value, percentage }];
  });

  return {
    currentLabel,
    count: items.length,
    items,
  };
}

export default function HallOfFamePage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

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
    if (user) {
      void loadData();
    }
  }, [user]);

  useEffect(() => {
    return buildDialogStyle(
      noteViewDialogOpen,
      noteTriggerRect,
      noteViewDialogRef,
      setNoteViewDialogStyle
    );
  }, [noteViewDialogOpen, noteTriggerRect]);

  useEffect(() => {
    return buildDialogStyle(
      noteEditDialogOpen,
      noteTriggerRect,
      noteEditDialogRef,
      setNoteEditDialogStyle
    );
  }, [noteEditDialogOpen, noteTriggerRect]);

  const currentMonthSpotlight = useMemo(() => buildMonthlySpotlight(data), [data]);
  const currentYearSpotlight = useMemo(() => buildYearlySpotlight(data), [data]);

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (!response.ok) {
        throw new Error('Failed to recalculate Hall of Fame');
      }

      toast.success('Record aggiornati.');
      await loadData();
    } catch (error) {
      console.error('Error recalculating Hall of Fame:', error);
      toast.error("Errore durante l'aggiornamento dei record");
    } finally {
      setRecalculating(false);
    }
  }

  function getAvailableYears(hallOfFameData: HallOfFameData): number[] {
    const years = new Set<number>();

    hallOfFameData.bestMonthsByNetWorthGrowth.forEach((record) => years.add(record.year));
    hallOfFameData.bestMonthsByIncome.forEach((record) => years.add(record.year));
    hallOfFameData.worstMonthsByNetWorthDecline.forEach((record) => years.add(record.year));
    hallOfFameData.worstMonthsByExpenses.forEach((record) => years.add(record.year));
    hallOfFameData.bestYearsByNetWorthGrowth.forEach((record) => years.add(record.year));
    hallOfFameData.bestYearsByIncome.forEach((record) => years.add(record.year));
    hallOfFameData.worstYearsByNetWorthDecline.forEach((record) => years.add(record.year));
    hallOfFameData.worstYearsByExpenses.forEach((record) => years.add(record.year));

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

    if (!open) {
      setNoteViewDialogStyle(undefined);
    }
  }

  function handleEditDialogChange(open: boolean) {
    setNoteEditDialogOpen(open);

    if (!open) {
      setNoteEditDialogStyle(undefined);
      setEditingNote(null);
    }
  }

  if (loading) {
    return <HallOfFameSkeleton />;
  }

  if (!data) {
    return (
      <div className="p-4 sm:p-6 desktop:p-8 space-y-6 max-desktop:portrait:pb-20">
        <header className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Analisi editoriali
            </p>
            <div className="flex items-center gap-3">
              <Trophy className="h-7 w-7 text-yellow-500" />
              <h1 className="text-3xl font-semibold">Hall of Fame</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              I record personali del tuo percorso finanziario, ordinati per far emergere subito i
              momenti che hanno contato di piu'.
            </p>
          </div>
          <div className="border-b border-border" />
        </header>

        <div className="flex justify-end">
          <Button
            onClick={handleRecalculate}
            disabled={isDemo || recalculating}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            variant="outline"
            className="gap-2"
          >
            {recalculating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ricalcolo in corso...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Aggiorna i record
              </>
            )}
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nessun dato disponibile. Crea almeno 2 snapshot per visualizzare i tuoi record.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 desktop:p-8 space-y-6 max-desktop:portrait:pb-20">
      <motion.header
        variants={chapterReveal}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        <div className="flex flex-col gap-4 desktop:flex-row desktop:items-end desktop:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Analisi editoriali
            </p>
            <div className="flex items-center gap-3">
              <Trophy className="h-7 w-7 text-yellow-500" />
              <h1 className="text-3xl font-semibold desktop:text-4xl">Hall of Fame</h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Una lettura ordinata dei tuoi record migliori e peggiori, con un focus immediato sul
              periodo corrente e note contestuali quando servono davvero.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row desktop:shrink-0">
            <Button ref={addNoteButtonRef} onClick={handleAddNoteClick} disabled={isDemo} title={isDemo ? 'Non disponibile in modalità demo' : undefined} className="gap-2">
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ricalcolo in corso...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Aggiorna i record
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="border-b border-border" />
      </motion.header>

      <motion.section
        variants={chapterReveal}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        <div className="pt-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Periodo corrente
          </p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            La pagina mette in evidenza dove si collocano mese e anno in corso rispetto ai record
            gia' registrati, senza forzare toni celebrativi.
          </p>
        </div>

        <div className="grid gap-4 desktop:grid-cols-2">
          <CurrentPeriodSpotlight
            title="Mese corrente"
            summary={currentMonthSpotlight}
            emptyText="Il mese corrente non e' ancora entrato nelle classifiche mensili."
          />
          <CurrentPeriodSpotlight
            title="Anno corrente"
            summary={currentYearSpotlight}
            emptyText="L'anno corrente non e' ancora entrato nelle classifiche annuali."
          />
        </div>
      </motion.section>

      <RankingSection
        eyebrow="Record mensili"
        title="Top 20"
        description="I ranking si presentano in ordine, con reveal stretto delle card e enfasi locale sul mese corrente."
      >
        {MONTHLY_CONFIGS.map((config) => (
          <RankingPanel
            key={config.sectionKey}
            title={config.title}
            description={config.description}
            tone={config.tone}
            icon={config.icon}
            hasCurrentPeriod={currentMonthSpotlight.items.some((item) => item.label === config.title)}
          >
            <div className="desktop:hidden">
              <MobileMonthlyList
                records={data[config.recordsKey] as MonthlyRecord[]}
                valueKey={config.valueKey}
                sectionKey={config.sectionKey}
                notes={data.notes || []}
                onNoteClick={handleNoteIconClick}
              />
            </div>
            <div className="hidden desktop:block">
              <MonthlyTable
                records={data[config.recordsKey] as MonthlyRecord[]}
                valueKey={config.valueKey}
                sectionKey={config.sectionKey}
                notes={data.notes || []}
                onNoteClick={handleNoteIconClick}
              />
            </div>
          </RankingPanel>
        ))}
      </RankingSection>

      <RankingSection
        eyebrow="Record annuali"
        title="Top 10"
        description="La lettura annuale resta piu' sintetica, ma mantiene lo stesso ordine tra gerarchia, note e spotlight sull'anno corrente."
      >
        {YEARLY_CONFIGS.map((config) => (
          <RankingPanel
            key={config.sectionKey}
            title={config.title}
            description={config.description}
            tone={config.tone}
            icon={config.icon}
            hasCurrentPeriod={currentYearSpotlight.items.some((item) => item.label === config.title)}
          >
            <div className="desktop:hidden">
              <MobileYearlyList
                records={data[config.recordsKey] as YearlyRecord[]}
                valueKey={config.valueKey}
                sectionKey={config.sectionKey}
                notes={data.notes || []}
                onNoteClick={handleNoteIconClick}
              />
            </div>
            <div className="hidden desktop:block">
              <YearlyTable
                records={data[config.recordsKey] as YearlyRecord[]}
                valueKey={config.valueKey}
                sectionKey={config.sectionKey}
                notes={data.notes || []}
                onNoteClick={handleNoteIconClick}
              />
            </div>
          </RankingPanel>
        ))}
      </RankingSection>

      <HallOfFameNoteViewDialog
        open={noteViewDialogOpen}
        onOpenChange={handleViewDialogChange}
        note={viewingNote}
        onEditClick={handleEditFromView}
        dialogRef={noteViewDialogRef}
        style={noteViewDialogStyle}
      />

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
    </div>
  );
}

function RankingSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={chapterReveal}
      initial="hidden"
      animate="visible"
      className="space-y-4 border-t border-border/40 pt-6"
    >
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </p>
        <div className="flex flex-col gap-2 desktop:flex-row desktop:items-baseline desktop:justify-between">
          <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-4 desktop:grid-cols-2"
      >
        {children}
      </motion.div>
    </motion.section>
  );
}

function RankingPanel({
  title,
  description,
  tone,
  icon: Icon,
  hasCurrentPeriod,
  children,
}: {
  title: string;
  description: string;
  tone: RankingTone;
  icon: ComponentType<{ className?: string }>;
  hasCurrentPeriod: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={cardItem} className="h-full">
      <Card className="h-full">
        <CardHeader className="items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className={cn('flex items-center gap-2', getToneClasses(tone))}>
              <Icon className="h-5 w-5" />
              {title}
            </CardTitle>
            {hasCurrentPeriod && (
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                Periodo corrente
              </Badge>
            )}
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  );
}

function CurrentPeriodSpotlight({
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
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 text-2xl font-semibold desktop:text-3xl">{summary.currentLabel}</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {summary.count > 0 ? `${summary.count} presenze` : 'Fuori classifica'}
          </Badge>
        </div>

        {summary.count > 0 ? (
          <div className="space-y-2 border-t border-border/60 pt-4">
            {summary.items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{item.label}</p>
                  <p className={cn('mt-1 text-sm font-semibold tabular-nums', getValueTone(item.value))}>
                    {item.value > 0 ? '+' : ''}
                    {formatCurrency(item.value)}
                    {item.percentage !== null && item.percentage !== undefined && (
                      <span className={cn('ml-2 text-xs font-medium', getValueTone(item.percentage))}>
                        {item.percentage >= 0 ? '+' : ''}
                        {item.percentage.toFixed(2)}%
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-primary">#{item.rank}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-border/60 pt-4 text-sm text-muted-foreground">
            {emptyText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MobileMonthlyList({
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
  if (records.length === 0) {
    return <EmptyRankingState />;
  }

  return (
    <motion.div
      variants={fastStaggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-2"
    >
      {records.map((record, index) => (
        <MonthlyRecordCard
          key={`${record.year}-${record.month}`}
          record={record}
          rank={index + 1}
          valueKey={valueKey}
          sectionKey={sectionKey}
          notes={notes}
          onNoteClick={onNoteClick}
        />
      ))}
    </motion.div>
  );
}

function MobileYearlyList({
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
  if (records.length === 0) {
    return <EmptyRankingState />;
  }

  return (
    <motion.div
      variants={fastStaggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-2"
    >
      {records.map((record, index) => (
        <YearlyRecordCard
          key={record.year}
          record={record}
          rank={index + 1}
          valueKey={valueKey}
          sectionKey={sectionKey}
          notes={notes}
          onNoteClick={onNoteClick}
        />
      ))}
    </motion.div>
  );
}

function EmptyRankingState() {
  return <p className="py-4 text-center text-sm text-muted-foreground">Nessun dato disponibile</p>;
}

function PeriodIndicator({
  active,
  label = 'In corso',
}: {
  active: boolean;
  label?: string;
}) {
  if (!active) return null;

  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
      {label}
    </Badge>
  );
}

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

  if (matchingNotes.length === 0) {
    return <div className="h-10 w-10 shrink-0" aria-hidden="true" />;
  }

  const note = matchingNotes[0];

  return (
    <button
      type="button"
      onClick={(event) => onNoteClick(note, event.currentTarget)}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-transparent text-amber-600 transition-colors hover:border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:hover:border-amber-900 dark:hover:bg-amber-950/30"
      aria-label="Visualizza nota"
    >
      <NotebookPen className="h-4 w-4" />
    </button>
  );
}

function MonthlyRecordCard({
  record,
  rank,
  valueKey,
  sectionKey,
  notes,
  onNoteClick,
}: {
  record: MonthlyRecord;
  rank: number;
  valueKey: MonthlyValueKey;
  sectionKey: HallOfFameSectionKey;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const isCurrentMonth = record.year === currentYear && record.month === currentMonth;
  const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
  const percentage =
    valueKey === 'netWorthDiff' && record.previousNetWorth > 0
      ? (record.netWorthDiff / record.previousNetWorth) * 100
      : null;

  return (
    <motion.div
      variants={listItem}
      className={cn('rounded-lg border p-3', getPeriodHighlightClasses(isCurrentMonth))}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold">
              #{rank}
            </Badge>
            <PeriodIndicator active={isCurrentMonth} />
          </div>
          <p className="text-sm font-medium">{record.monthYear}</p>
        </div>

        <NoteTrigger
          notes={notes}
          sectionKey={sectionKey}
          year={record.year}
          month={record.month}
          onNoteClick={onNoteClick}
        />
      </div>

      <div className="flex items-end justify-between gap-4 border-t border-border/60 pt-3">
        <p className={cn('text-lg font-bold tabular-nums', getValueTone(value))}>
          {value > 0 ? '+' : ''}
          {formatCurrency(value)}
        </p>
        {percentage !== null && (
          <p className={cn('text-sm font-semibold tabular-nums', getValueTone(percentage))}>
            {percentage >= 0 ? '+' : ''}
            {percentage.toFixed(2)}%
          </p>
        )}
      </div>
    </motion.div>
  );
}

function YearlyRecordCard({
  record,
  rank,
  valueKey,
  sectionKey,
  notes,
  onNoteClick,
}: {
  record: YearlyRecord;
  rank: number;
  valueKey: YearlyValueKey;
  sectionKey: HallOfFameSectionKey;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, triggerElement: HTMLElement | null) => void;
}) {
  const currentYear = getItalyYear();
  const isCurrentYear = record.year === currentYear;
  const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
  const percentage =
    valueKey === 'netWorthDiff' && record.startOfYearNetWorth > 0
      ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
      : null;

  return (
    <motion.div
      variants={listItem}
      className={cn('rounded-lg border p-3', getPeriodHighlightClasses(isCurrentYear))}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold">
              #{rank}
            </Badge>
            <PeriodIndicator active={isCurrentYear} />
          </div>
          <p className="text-sm font-medium">{record.year}</p>
        </div>

        <NoteTrigger
          notes={notes}
          sectionKey={sectionKey}
          year={record.year}
          onNoteClick={onNoteClick}
        />
      </div>

      <div className="flex items-end justify-between gap-4 border-t border-border/60 pt-3">
        <p className={cn('text-lg font-bold tabular-nums', getValueTone(value))}>
          {value > 0 ? '+' : ''}
          {formatCurrency(value)}
        </p>
        {percentage !== null && (
          <p className={cn('text-sm font-semibold tabular-nums', getValueTone(percentage))}>
            {percentage >= 0 ? '+' : ''}
            {percentage.toFixed(2)}%
          </p>
        )}
      </div>
    </motion.div>
  );
}

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
  if (records.length === 0) {
    return <EmptyRankingState />;
  }

  const showPercentage = valueKey === 'netWorthDiff';
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead className="min-w-[112px]">Mese</TableHead>
            <TableHead className="text-right">Valore</TableHead>
            {showPercentage && <TableHead className="text-right">%</TableHead>}
            <TableHead className="w-14 text-center">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const isCurrentMonth = record.year === currentYear && record.month === currentMonth;
            const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
            const percentage =
              showPercentage && record.previousNetWorth > 0
                ? (record.netWorthDiff / record.previousNetWorth) * 100
                : null;

            return (
              <motion.tr
                key={`${record.year}-${record.month}`}
                variants={listItem}
                initial="hidden"
                animate="visible"
                transition={{ delay: Math.min(index, 12) * 0.03 }}
                className={cn(
                  'border-b transition-colors hover:bg-muted/50',
                  isCurrentMonth && 'bg-primary/5 hover:bg-primary/10'
                )}
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>{record.monthYear}</span>
                    <PeriodIndicator active={isCurrentMonth} label="Ora" />
                  </div>
                </TableCell>
                <TableCell className={cn('text-right font-mono whitespace-nowrap', getValueTone(value))}>
                  {value > 0 ? '+' : ''}
                  {formatCurrency(value)}
                </TableCell>
                {showPercentage && (
                  <TableCell
                    className={cn(
                      'text-right font-mono text-sm whitespace-nowrap',
                      percentage !== null && getValueTone(percentage)
                    )}
                  >
                    {percentage !== null && (
                      <>
                        {percentage >= 0 ? '+' : ''}
                        {percentage.toFixed(2)}%
                      </>
                    )}
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
    </div>
  );
}

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
  if (records.length === 0) {
    return <EmptyRankingState />;
  }

  const showPercentage = valueKey === 'netWorthDiff';
  const currentYear = getItalyYear();

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead className="min-w-[96px]">Anno</TableHead>
            <TableHead className="text-right">Valore</TableHead>
            {showPercentage && <TableHead className="text-right">%</TableHead>}
            <TableHead className="w-14 text-center">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const isCurrentYear = record.year === currentYear;
            const value = valueKey === 'totalExpenses' ? -Math.abs(record[valueKey]) : record[valueKey];
            const percentage =
              showPercentage && record.startOfYearNetWorth > 0
                ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
                : null;

            return (
              <motion.tr
                key={record.year}
                variants={listItem}
                initial="hidden"
                animate="visible"
                transition={{ delay: Math.min(index, 10) * 0.03 }}
                className={cn(
                  'border-b transition-colors hover:bg-muted/50',
                  isCurrentYear && 'bg-primary/5 hover:bg-primary/10'
                )}
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{record.year}</span>
                    <PeriodIndicator active={isCurrentYear} label="Ora" />
                  </div>
                </TableCell>
                <TableCell className={cn('text-right font-mono whitespace-nowrap', getValueTone(value))}>
                  {value > 0 ? '+' : ''}
                  {formatCurrency(value)}
                </TableCell>
                {showPercentage && (
                  <TableCell
                    className={cn(
                      'text-right font-mono text-sm whitespace-nowrap',
                      percentage !== null && getValueTone(percentage)
                    )}
                  >
                    {percentage !== null && (
                      <>
                        {percentage >= 0 ? '+' : ''}
                        {percentage.toFixed(2)}%
                      </>
                    )}
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
    </div>
  );
}
