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

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';
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
import {
  buildRecordTimeline,
  getBoard,
  isPeriodRanked,
  rowAboveCurrent,
  summarizeHallOfFame,
} from '@/lib/utils/hallOfFameSummary';
import {
  buildHallOfFameVerdict,
  describeHallOfFameHeader,
  describeIncomeAverage,
  describeIncomeRecords,
  describeNetWorthRecords,
  describeNotes,
  describeRecordWindow,
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
import type { NotePrefill } from '@/components/hall-of-fame/NoteTrigger';

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
  /** The period and ranking a row hands the form; null when the form opens from a header button. */
  const [notePrefill, setNotePrefill] = useState<NotePrefill | null>(null);
  // The control that opened a note window: a controlled modal with no Radix Trigger drops the
  // focus on `body` when it closes unless it is told where to put it back (doc/guide/dialog.md).
  const noteOpenerRef = useRef<HTMLElement | null>(null);
  // Where a note's window grows from: the control that opened it, resolved at the click
  // (lib/utils/modalOrigin.ts) and shared by the two windows — «Modifica» hands the view over
  // to the form, which keeps growing from the same record. Never cleared on close: the exit
  // animates too, and an origin that changes mid-animation is tweened, not swapped.
  const [noteOrigin, setNoteOrigin] = useState<string | undefined>(undefined);

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
  const availableYears = useMemo(() => (data ? collectAvailableYears(data) : []), [data]);

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

  const rememberOpener = (trigger: HTMLElement | null) => {
    noteOpenerRef.current = trigger;
    setNoteOrigin(trigger ? resolveCenteredModalOrigin(trigger.getBoundingClientRect()) : undefined);
  };

  const handleNoteClick = (note: HallOfFameNote, trigger: HTMLElement | null) => {
    rememberOpener(trigger);
    setViewingNote(note);
    setNoteViewOpen(true);
  };

  /** From a header button or the Note tile: the form opens empty. */
  const handleAddNote = (trigger: HTMLElement | null) => {
    rememberOpener(trigger);
    setEditingNote(null);
    setNotePrefill(null);
    setNoteEditOpen(true);
  };

  /** From a ranked row: the form opens with that row's period and ranking already written. */
  const handleAddNoteForRow = (prefill: NotePrefill, trigger: HTMLElement | null) => {
    rememberOpener(trigger);
    setEditingNote(null);
    setNotePrefill(prefill);
    setNoteEditOpen(true);
  };

  const isRankedPeriod = (section: HallOfFameSectionKey, year: number, month?: number) =>
    isPeriodRanked(summary, section, year, month);

  // ─── Header ─────────────────────────────────────────────────────────────────
  const headerActions = (stacked: boolean) => {
    const size = stacked ? 'h-11 w-full justify-center' : 'h-8 px-2.5 text-xs';
    return (
      <>
        {/* The visible text IS the accessible name; only the demo adds why the button is off. */}
        <Button
          variant="outline"
          onClick={(event) => handleAddNote(event.currentTarget)}
          disabled={isDemo}
          className={cn('gap-1.5', size)}
          aria-label={isDemo ? 'Aggiungi una nota — non disponibile in modalità demo' : undefined}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Aggiungi una nota
        </Button>
        <Button
          variant="outline"
          onClick={handleRecalculate}
          disabled={isDemo || recalculating}
          className={cn('gap-1.5', size)}
          aria-label={isDemo ? 'Aggiorna i record — non disponibile in modalità demo' : undefined}
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
      description={describeHallOfFameHeader(summary.stats, summary.rankingsUpdatedAt)}
      // Below desktop the two actions sit under the verdict at 44px; the sticky navbar carries
      // no third «Aggiungi una nota» (a 36px icon, the same name twice in the Tab order).
      actions={<div className="hidden items-center gap-2 desktop:flex">{headerActions(false)}</div>}
    />
  );

  const dialogs = (
    <>
      <HallOfFameNoteViewDialog
        open={noteViewOpen}
        onOpenChange={(open) => {
          setNoteViewOpen(open);
        }}
        note={viewingNote}
        onEditClick={() => {
          setEditingNote(viewingNote);
          setNoteViewOpen(false);
          setNoteEditOpen(true);
        }}
        triggerOrigin={noteOrigin}
        returnFocusTo={noteOpenerRef}
      />
      {data && (
        <HallOfFameNoteDialog
          open={noteEditOpen}
          onOpenChange={(open) => {
            setNoteEditOpen(open);
            if (!open) {
              setEditingNote(null);
              setNotePrefill(null);
            }
          }}
          editNote={editingNote}
          prefill={notePrefill}
          availableYears={availableYears}
          isPeriodRanked={isRankedPeriod}
          onSave={handleNoteSave}
          onDelete={handleNoteDelete}
          triggerOrigin={noteOrigin}
          returnFocusTo={noteOpenerRef}
        />
      )}
    </>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer>
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
      <PageContainer>
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
    <PageContainer>
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
            reading={describeNetWorthRecords({
              best: growthMonths?.top ?? null,
              topThreeGrowth: summary.topThreeGrowth,
              last: growthMonths?.rows[Math.min(BOARD_PREVIEW_SIZE, growthMonths.total) - 1] ?? null,
            })}
            aside={describeRecordWindow(summary.stats)}
            board={growthMonths}
            timeline={timeline}
            footer={describeWorstMonth(declineMonths?.top ?? null, summary.stats?.sinceWorstMonth ?? null)}
            notes={notes}
            onNoteClick={handleNoteClick}
            onAddNote={handleAddNoteForRow}
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
            labelClassName="min-w-[66px]"
            emptyCopy="Nessuna entrata registrata nei mesi con uno snapshot."
            footer={describeIncomeAverage(summary.stats)}
            notes={notes}
            onNoteClick={handleNoteClick}
            onAddNote={handleAddNoteForRow}
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
            labelClassName="min-w-[68px]"
            emptyCopy={
              savingMonths
                ? "Nessun mese con entrate registrate: senza un'entrata non c'è un tasso di risparmio."
                : 'Questa classifica arriva con il prossimo aggiornamento dei record.'
            }
            emptyAction={savingMonths ? undefined : recalculateAction}
            footerCopy="In classifica solo i mesi con entrate registrate."
            method={
              <span>
                Senza un{"'"}entrata non c{"'"}è un tasso di risparmio: un mese non tracciato risparmierebbe
                quanto uno che non ha guadagnato nulla, e batterebbe ogni mese vero.
              </span>
            }
            notes={notes}
            onNoteClick={handleNoteClick}
            onAddNote={handleAddNoteForRow}
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
              above: rowAboveCurrent(growthYears),
            })}
            board={growthYears}
            limit={BOARD_PREVIEW_SIZE}
            labelClassName="min-w-[58px]"
            emptyCopy="Nessun anno chiuso in crescita, per ora."
            footer={describeWorstYear(declineYears?.top ?? null)}
            notes={notes}
            onNoteClick={handleNoteClick}
            onAddNote={handleAddNoteForRow}
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

      <HallOfFameDettaglio summary={summary} notes={notes} onNoteClick={handleNoteClick} onAddNote={handleAddNoteForRow} />

      {dialogs}
    </PageContainer>
  );
}
