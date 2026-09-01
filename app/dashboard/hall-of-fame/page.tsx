'use client';

/**
 * HALL OF FAME — a verdict over tiles (2026-08-25)
 *
 * The page answers «quali sono stati i mesi e gli anni migliori?» before it shows a number: a
 * rule-generated verdict (lib/utils/hallOfFameNarrative.ts) names the record month, where the
 * running year stands and where the running month sits, over a 12-column grid of tiles that
 * each answer one question with a reading line above their figures.
 *
 * The page has NO axis. A record is a position, not a period — the old
 * `Mensile|Annuale` + `Crescita|Calo|Entrate|Spese` switcher would have answered the same
 * question the tiles already answer, so it moved into the «Dettaglio» disclosure where it
 * governs the one tile that needs it (DESIGN.md → The Whole-Cost Corollary, the no-axis case).
 *
 *   Desktop (12 col): Record del patrimonio(5, 2 rows) | Entrate(3) | Risparmio record(4)
 *                                                      | Anni(7)
 *                     Note(12)
 *   Mobile (1 col):   Record → Entrate → Risparmio → Anni → Note → Dettaglio
 *
 * DATA: one document, `hall-of-fame/{userId}`, written by `updateHallOfFame` — the rankings are
 * pre-calculated so the page never reads the whole history. What a record IS lives in the pure
 * `lib/utils/hallOfFameRecords.ts`, shared with the periodic email; what a tile SHOWS is derived
 * from the stored rankings in `hallOfFameSummary.ts`. No component computes a figure.
 */

import type { CSSProperties, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import type { HallOfFameData, HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import {
  addHallOfFameNote,
  deleteHallOfFameNote,
  getHallOfFameData,
  updateHallOfFameNote,
} from '@/lib/services/hallOfFameService';
import { buildRecordTimeline, getBoard, summarizeHallOfFame } from '@/lib/utils/hallOfFameSummary';
import {
  buildHallOfFameVerdict,
  describeHallOfFameHeader,
  describeIncomeAverage,
  describeIncomeRecords,
  describeMonthsAside,
  describeNetWorthRecords,
  describeNotes,
  describeSavingsRecords,
  describeWorstMonth,
  describeWorstYear,
  describeYearRecords,
} from '@/lib/utils/hallOfFameNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { RecordPatrimonioTile } from '@/components/hall-of-fame/tiles/RecordPatrimonioTile';
import { RecordBoardTile } from '@/components/hall-of-fame/tiles/RecordBoardTile';
import { NoteTile } from '@/components/hall-of-fame/tiles/NoteTile';
import { HallOfFameDettaglio } from '@/components/hall-of-fame/HallOfFameDettaglio';
import { HallOfFameNoteDialog } from '@/components/hall-of-fame/HallOfFameNoteDialog';
import { HallOfFameNoteViewDialog } from '@/components/hall-of-fame/HallOfFameNoteViewDialog';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 12 },
  { span: 3, lines: 6 },
  { span: 4, lines: 6 },
  { span: 7, lines: 5 },
  { span: 12, lines: 4 },
];

/** How many positions the two five-row tiles show; the rest live in the Dettaglio. */
const BOARD_PREVIEW_SIZE = 5;

type TriggerRect = { left: number; top: number; width: number; height: number } | null;

function captureTriggerRect(element: HTMLElement | null): TriggerRect {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Grows a dialog out of the control that opened it: the transform origin is the trigger's
 * centre, expressed in the dialog's own coordinates.
 */
function buildDialogStyle(
  open: boolean,
  triggerRect: TriggerRect,
  dialogRef: RefObject<HTMLDivElement | null>,
  setStyle: (style: CSSProperties | undefined) => void,
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
    setStyle({
      transformOrigin: `${triggerRect.left + triggerRect.width / 2 - dialogRect.left}px ${
        triggerRect.top + triggerRect.height / 2 - dialogRect.top
      }px`,
    });
  });

  return () => cancelAnimationFrame(frameId);
}

/** Every year a ranking mentions, newest first — the years a note can be filed under. */
function collectAvailableYears(data: HallOfFameData): number[] {
  const rankings = [
    data.bestMonthsByNetWorthGrowth,
    data.bestMonthsByIncome,
    data.worstMonthsByNetWorthDecline,
    data.worstMonthsByExpenses,
    data.bestMonthsBySavings,
    data.bestYearsByNetWorthGrowth,
    data.bestYearsByIncome,
    data.worstYearsByNetWorthDecline,
    data.worstYearsByExpenses,
    data.bestYearsBySavings,
  ];
  const years = new Set<number>();
  rankings.forEach((ranking) => ranking?.forEach((record) => years.add(record.year)));
  return Array.from(years).sort((a, b) => b - a);
}

export default function HallOfFamePage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();

  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  /** A failed load is not an empty set: it gets an alert, never a verdict about zeros. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [noteViewOpen, setNoteViewOpen] = useState(false);
  const [viewingNote, setViewingNote] = useState<HallOfFameNote | null>(null);
  const [noteEditOpen, setNoteEditOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<HallOfFameNote | null>(null);
  const [triggerRect, setTriggerRect] = useState<TriggerRect>(null);
  const [noteViewStyle, setNoteViewStyle] = useState<CSSProperties>();
  const [noteEditStyle, setNoteEditStyle] = useState<CSSProperties>();

  const noteViewRef = useRef<HTMLDivElement | null>(null);
  const noteEditRef = useRef<HTMLDivElement | null>(null);

  const loadData = async () => {
    if (!user || !ownerId) return;
    try {
      setLoading(true);
      setLoadFailed(false);
      setData(await getHallOfFameData(ownerId));
    } catch (error) {
      setLoadFailed(true);
      console.error('Error loading Hall of Fame data:', error);
      toast.error('Errore nel caricamento dei record');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !ownerId) return;
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ownerId]);

  useEffect(
    () => buildDialogStyle(noteViewOpen, triggerRect, noteViewRef, setNoteViewStyle),
    [noteViewOpen, triggerRect],
  );
  useEffect(
    () => buildDialogStyle(noteEditOpen, triggerRect, noteEditRef, setNoteEditStyle),
    [noteEditOpen, triggerRect],
  );

  // ─── The numbers (pure layer) ───────────────────────────────────────────────
  const today = useMemo(() => getItalyMonthYear(), []);
  const summary = useMemo(() => summarizeHallOfFame(data, today), [data, today]);
  const notes = data?.notes ?? [];

  const growthMonths = getBoard(summary, 'monthly', 'growth');
  const declineMonths = getBoard(summary, 'monthly', 'decline');
  const incomeMonths = getBoard(summary, 'monthly', 'income');
  const savingMonths = getBoard(summary, 'monthly', 'savings');
  const growthYears = getBoard(summary, 'annual', 'growth');
  const declineYears = getBoard(summary, 'annual', 'decline');

  const timeline = useMemo(() => buildRecordTimeline(growthMonths?.rows ?? []), [growthMonths]);

  const verdict = useMemo(
    () =>
      buildHallOfFameVerdict({
        hasRecords: summary.hasRecords,
        bestMonth: growthMonths?.top ?? null,
        worstMonth: declineMonths?.top ?? null,
        currentMonth: growthMonths?.current ?? null,
        currentMonthRank: growthMonths?.currentRank ?? null,
        bestYear: growthYears?.top ?? null,
        currentYear: growthYears?.current ?? null,
        currentYearRank: growthYears?.currentRank ?? null,
      }),
    [summary.hasRecords, growthMonths, declineMonths, growthYears],
  );

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleRecalculate = async () => {
    if (!user || !ownerId) return;
    try {
      setRecalculating(true);
      const response = await authenticatedFetch('/api/hall-of-fame/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId }),
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
  };

  const handleNoteSave = async (note: {
    id?: string;
    text: string;
    sections: HallOfFameSectionKey[];
    year: number;
    month?: number;
  }) => {
    if (!user || !ownerId) return;
    if (note.id) {
      await updateHallOfFameNote(ownerId, note.id, { text: note.text, sections: note.sections });
    } else {
      await addHallOfFameNote(ownerId, {
        text: note.text,
        sections: note.sections,
        year: note.year,
        month: note.month,
      });
    }
    await loadData();
  };

  const handleNoteDelete = async (noteId: string) => {
    if (!user || !ownerId) return;
    await deleteHallOfFameNote(ownerId, noteId);
    await loadData();
  };

  const handleNoteClick = (note: HallOfFameNote, trigger: HTMLElement | null) => {
    setTriggerRect(captureTriggerRect(trigger));
    setViewingNote(note);
    setNoteViewOpen(true);
  };

  const handleAddNote = (trigger: HTMLElement | null) => {
    setTriggerRect(captureTriggerRect(trigger));
    setEditingNote(null);
    setNoteEditOpen(true);
  };

  // ─── Header ─────────────────────────────────────────────────────────────────
  const headerActions = (stacked: boolean) => {
    const size = stacked ? 'h-11 w-full justify-center' : 'h-8 px-2.5 text-xs';
    return (
      <>
        <Button
          variant="outline"
          onClick={(event) => handleAddNote(event.currentTarget)}
          disabled={isDemo}
          className={cn('gap-1.5', size)}
          aria-label={isDemo ? 'Aggiungi una nota — non disponibile in modalità demo' : 'Aggiungi una nota'}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Aggiungi nota
        </Button>
        <Button
          variant="outline"
          onClick={handleRecalculate}
          disabled={isDemo || recalculating}
          className={cn('gap-1.5', size)}
          aria-label={isDemo ? 'Aggiorna i record — non disponibile in modalità demo' : 'Aggiorna i record'}
        >
          {recalculating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {recalculating ? 'Ricalcolo…' : 'Aggiorna i record'}
        </Button>
      </>
    );
  };

  const header = (
    <PageHeader
      label="Analisi"
      title="Hall of Fame"
      description={describeHallOfFameHeader(summary.stats)}
      separator={false}
      actions={
        <>
          <div className="hidden items-center gap-2 desktop:flex">{headerActions(false)}</div>
          {/* The sticky navbar's slot is cramped: only the note fits there on a phone. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(event) => handleAddNote(event.currentTarget)}
            disabled={isDemo}
            className="h-9 w-9 text-muted-foreground desktop:hidden"
            aria-label="Aggiungi una nota"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      }
    />
  );

  const dialogs = (
    <>
      <HallOfFameNoteViewDialog
        open={noteViewOpen}
        onOpenChange={(open) => {
          setNoteViewOpen(open);
          if (!open) setNoteViewStyle(undefined);
        }}
        note={viewingNote}
        onEditClick={() => {
          setEditingNote(viewingNote);
          setNoteViewOpen(false);
          setNoteEditOpen(true);
        }}
        dialogRef={noteViewRef}
        style={noteViewStyle}
      />
      {data && (
        <HallOfFameNoteDialog
          open={noteEditOpen}
          onOpenChange={(open) => {
            setNoteEditOpen(open);
            if (!open) {
              setNoteEditStyle(undefined);
              setEditingNote(null);
            }
          }}
          editNote={editingNote}
          availableYears={collectAvailableYears(data)}
          onSave={handleNoteSave}
          onDelete={handleNoteDelete}
          dialogRef={noteEditRef}
          style={noteEditStyle}
        />
      )}
    </>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer width="wide">
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer width="wide">
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void loadData()}
          notice={describeReadFailure({
            consequence: 'I record non sono stati letti: senza di essi la pagina direbbe che non ne hai nessuno.',
            untouched: 'Le rilevazioni e le note registrate non sono state toccate.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  if (!summary.hasRecords) {
    return (
      <PageContainer width="wide">
        {header}
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sui record" />
        </div>
        <div className="grid grid-cols-2 gap-2 desktop:hidden">{headerActions(true)}</div>
        {dialogs}
      </PageContainer>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  const recalculateAction = (
    <Button
      variant="outline"
      onClick={handleRecalculate}
      disabled={isDemo || recalculating}
      className="h-8 gap-1.5 px-2.5 text-xs max-desktop:h-11"
      aria-label="Aggiorna i record"
    >
      {recalculating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Aggiorna i record
    </Button>
  );

  return (
    <PageContainer width="wide">
      {header}

      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sui record" />
      </div>

      {/* Below desktop the two actions sit under the verdict as 44px buttons. */}
      <div className="grid grid-cols-2 gap-2 desktop:hidden">{headerActions(true)}</div>

      {/* Tablet (768-1439): Record full, Entrate beside Risparmio, then Anni and Note full. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
          <RecordPatrimonioTile
            reading={describeNetWorthRecords({ best: growthMonths?.top ?? null, topThreeGrowth: summary.topThreeGrowth })}
            aside={describeMonthsAside(summary.stats)}
            board={growthMonths}
            timeline={timeline}
            footer={describeWorstMonth(declineMonths?.top ?? null)}
            notes={notes}
            onNoteClick={handleNoteClick}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-3')}>
          <RecordBoardTile
            eyebrow="Entrate"
            aside="per mese"
            reading={describeIncomeRecords({
              top: incomeMonths?.top ?? null,
              averageMonthlyIncome: summary.stats?.averageMonthlyIncome ?? null,
            })}
            board={incomeMonths}
            limit={BOARD_PREVIEW_SIZE}
            labelClassName="w-[66px]"
            emptyCopy="Nessuna entrata registrata nei mesi con uno snapshot."
            footer={describeIncomeAverage(summary.stats)}
            notes={notes}
            onNoteClick={handleNoteClick}
            ariaLabel="I mesi con le entrate più alte"
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-4')}>
          <RecordBoardTile
            eyebrow="Risparmio record"
            aside="entrate − spese"
            reading={describeSavingsRecords(savingMonths?.top ?? null)}
            board={savingMonths}
            limit={BOARD_PREVIEW_SIZE}
            labelClassName="w-[68px]"
            emptyCopy={
              savingMonths
                ? "Nessun mese con entrate registrate: senza un'entrata non c'è un tasso di risparmio."
                : 'Questa classifica arriva con il prossimo aggiornamento dei record.'
            }
            emptyAction={savingMonths ? undefined : recalculateAction}
            footerCopy="In classifica solo i mesi con entrate registrate: senza un'entrata non c'è un tasso di risparmio."
            notes={notes}
            onNoteClick={handleNoteClick}
            ariaLabel="I mesi in cui hai messo da parte di più"
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
          <RecordBoardTile
            eyebrow="Anni"
            aside="crescita del patrimonio"
            reading={describeYearRecords({
              top: growthYears?.top ?? null,
              current: growthYears?.current ?? null,
              currentRank: growthYears?.currentRank ?? null,
            })}
            board={growthYears}
            limit={BOARD_PREVIEW_SIZE}
            labelClassName="w-[58px]"
            emptyCopy="Nessun anno chiuso in crescita, per ora."
            footer={describeWorstYear(declineYears?.top ?? null)}
            notes={notes}
            onNoteClick={handleNoteClick}
            ariaLabel="Gli anni con la crescita di patrimonio più alta"
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <NoteTile
            reading={describeNotes(summary.notes)}
            summary={summary.notes}
            notes={notes}
            onOpenNote={handleNoteClick}
            onAddNote={handleAddNote}
            disabled={isDemo}
          />
        </div>
      </div>

      <HallOfFameDettaglio summary={summary} notes={notes} onNoteClick={handleNoteClick} />

      {dialogs}
    </PageContainer>
  );
}
