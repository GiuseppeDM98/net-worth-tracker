'use client';

/**
 * PREVIDENZA — a verdict over tiles (2026-08-26)
 *
 * The page answers «il fondo sta lavorando?» before it shows a number: a rule-generated verdict
 * (`buildPensionVerdict` in lib/utils/pensionNarrative.ts) names, per contributor, the three
 * causes of growth as three numbers — the market (TWR on the trusted window), the employer's
 * share and the IRPEF saving — over a 12-column grid of tiles that each answer one question with
 * a reading line above their figures.
 *
 *   Desktop (12 col): Il fondo oggi(5, 2 rows) | Rendimento(3) | Anno fiscale(4)
 *                                              | Versato nel {anno}(7)
 *                     Versamenti {anno}(12)
 *   Below desktop:    ONE sequence, the DOM above (DESIGN.md → The First-Screen Rule,
 *                     since 2026-10-15): the verdict's title → the year in its `axis` slot → with
 *                     ONE contributor measured, no sentence but the strip of three causes («Mercato
 *                     da…», «Datore nel…», «Fisco nel…, circa»: the whole sentence behind «Il
 *                     perché»); with two or more, the whole verdict and no strip →
 *                     Il fondo oggi open, its curve at 120px → «Il resto della pagina» →
 *                     Rendimento, Anno fiscale, Versato, Versamenti as closed rows — a failed read
 *                     a red row, silent (`useMobileSections`, doc/guide/previdenza.md
 *                     § Composizione mobile) → the Dettaglio. No `order-*`: the phone reads the DOM.
 *
 * THE PAGE'S ONE AXIS IS THE FISCAL YEAR, beside the verdict from `desktop:` and under its title
 * below (a second instance of the same control, DESIGN.md → Page Verdict).
 * It governs the verdict's two ANNUAL clauses (the employer's share, the IRPEF saving), «Anno
 * fiscale», «Versato» and «Versamenti». «Il fondo oggi» and «Rendimento» are OFF the axis — the
 * fund's value is a running total and its return has its own trust-derived window
 * (`resolvePensionReturnStart`) — and name their own window in their aside (The Off-Axis Tile
 * Rule). `resolveActivePensionYear` (pure) reconciles the selection with the derived axis so no
 * effect has to sync them.
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/pensionSummary.ts (per-contributor blocks, the fund today, the natures, the ledger),
 * the words from lib/utils/pensionNarrative.ts. «Registra versamento» stays in the compact
 * header (`PensionHeaderAction`, the Panoramica's «Crea snapshot» precedent); the ledger's
 * delete is a two-click confirm without a timer inside `VersamentiTile`.
 *
 * NIENTE ZERI CHE NON SONO STATI LETTI. The four queries default to `[]`, so the skeleton waits
 * for all four and a failed query replaces the tiles that depend on it with an `ErrorNotice`
 * — never a zero — and the verdict says what did not load instead of judging an empty set.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useSettings } from '@/lib/hooks/useSettings';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { usePensionContributions, useDeletePensionContribution } from '@/lib/hooks/usePensionContributions';
import { derivePensionContributionYears, resolveActivePensionYear } from '@/lib/utils/pensionContributions';
import { calculateProgressiveTax, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  PENSION_SECTION_IDS,
  resolvePensionSections,
  selectPensionStrip,
  summarizeFundToday,
  summarizeLedger,
  summarizePensionMembers,
  summarizeVersato,
  versatoRing,
  type LedgerRow,
  type PensionSummaryInput,
} from '@/lib/utils/pensionSummary';
import { useMobileSections } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import {
  ANNO_FISCALE_FOOTER,
  PENSION_CLOSED_ASIDES,
  buildFondoOggiChips,
  buildPensionLoadErrorVerdict,
  buildPensionVerdict,
  COME_AGGIORNARE,
  CRESCITA_FOOTER,
  describeAnnoFiscale,
  describeAnnoFiscaleAside,
  describePensionClosedAnswers,
  describeFondoOggi,
  describeFondoOggiAside,
  describeFondoOggiFooter,
  describeFondoOggiSeriesAside,
  describeRendimento,
  describeRendimentoAside,
  describeVersamenti,
  describeVersamentiAside,
  describeVersato,
  describeVersatoFooter,
  DETTAGLIO_DESCRIPTION,
  RENDIMENTO_FOOTER,
  VERSAMENTI_FOOTER,
  type PensionLoadFailure,
} from '@/lib/utils/pensionNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Tile, TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { RowAnswers } from '@/components/ui/row-answers';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { PensionDettaglio } from '@/components/pension/PensionDettaglio';
import { PensionValueDialog } from '@/components/pension/PensionValueDialog';
import { ASIDE_LINK_CLASS } from '@/components/pension/pensionStyles';
import { indexPensionSnapshots } from '@/lib/utils/pensionReturn';
import { FondoOggiTile } from '@/components/pension/tiles/FondoOggiTile';
import { RendimentoTile } from '@/components/pension/tiles/RendimentoTile';
import { AnnoFiscaleTile } from '@/components/pension/tiles/AnnoFiscaleTile';
import { VersatoTile } from '@/components/pension/tiles/VersatoTile';
import { VersamentiTile } from '@/components/pension/tiles/VersamentiTile';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 12 },
  { span: 3, lines: 6 },
  { span: 4, lines: 6 },
  { span: 7, lines: 4 },
  { span: 12, lines: 6 },
];

const VERDICT_LABEL = 'Verdetto sul fondo pensione';

export function PensionOverview() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [], isLoading: assetsLoading, isError: assetsError } = useAssets(ownerId);
  const { data: contributions = [], isLoading: contributionsLoading, isError: contributionsError } = usePensionContributions(ownerId);
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useSettings(ownerId);
  // The fund's return is read from the monthly snapshots: the only place its value is frozen
  // month by month (the asset carries only the current value).
  const { data: snapshots = [], isLoading: snapshotsLoading, isError: snapshotsError } = useSnapshots(ownerId);
  const deleteMutation = useDeletePensionContribution(ownerId || '');

  // One `now` per mount: the live overlay's month, the digest's window and the year axis agree.
  const now = useMemo(() => new Date(), []);
  const currentYear = getItalyYear(now);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // «Aggiorna valore» from the hero's footer (the header hosts its own instance for the top of the page).
  const [valueDialogOpen, setValueDialogOpen] = useState(false);

  const funds = useMemo(() => assets.filter((asset) => asset.type === 'pensionFund'), [assets]);
  // The snapshots reduced ONCE to the funds: memoized on them alone, so the fiscal-year axis
  // never re-reads the heaviest array the page holds (`indexPensionSnapshots`).
  const snapshotIndex = useMemo(() => indexPensionSnapshots(snapshots, funds.map((fund) => fund.id)), [snapshots, funds]);

  // The year axis is derived, so it survives a refetch that adds or removes a year.
  const availableYears = useMemo(() => derivePensionContributionYears(contributions, currentYear), [contributions, currentYear]);
  const activeYear = resolveActivePensionYear(selectedYear, availableYears, currentYear);

  // ─── The pure layer ──────────────────────────────────────────────────────────
  const taxOf = useMemo(() => {
    const brackets = normalizeCoastFireTaxBrackets(undefined);
    return (income: number) => calculateProgressiveTax(income, brackets);
  }, []);

  // Everything but the axis: «Il fondo oggi» reads THIS input, so the year pill never recomputes it.
  const offAxisInput = useMemo<Omit<PensionSummaryInput, 'taxYear'>>(
    () => ({
      funds,
      assets,
      familyMembers: settings?.familyMembers ?? [],
      contributions,
      snapshots,
      snapshotIndex,
      now,
      configuredStartMonth: settings?.pensionReturnStartMonth,
      taxOf,
      valueOf: calculateAssetValue,
    }),
    [funds, assets, settings, contributions, snapshots, snapshotIndex, now, taxOf],
  );
  const summaryInput = useMemo<PensionSummaryInput>(() => ({ ...offAxisInput, taxYear: activeYear }), [offAxisInput, activeYear]);

  // `summarizeFundToday` never reads `taxYear`; the placeholder keeps the input type honest.
  const today = useMemo(() => summarizeFundToday({ ...offAxisInput, taxYear: 0 }), [offAxisInput]);
  const blocks = useMemo(() => summarizePensionMembers(summaryInput), [summaryInput]);
  const versato = useMemo(() => summarizeVersato(contributions, activeYear), [contributions, activeYear]);
  const versatoRingSegments = useMemo(() => versatoRing(versato), [versato]);
  const ledger = useMemo(() => summarizeLedger(contributions, funds, assets, activeYear), [contributions, funds, assets, activeYear]);

  // ─── The words ───────────────────────────────────────────────────────────────
  // Memoized on its two booleans, the verdict's real inputs, so the verdict below can list it.
  const failures = useMemo<PensionLoadFailure[]>(
    () => [
      ...(contributionsError ? (['contributions'] as const) : []),
      ...(snapshotsError ? (['snapshots'] as const) : []),
    ],
    [contributionsError, snapshotsError],
  );
  const verdict = useMemo(
    () => (failures.length > 0 ? buildPensionLoadErrorVerdict(failures) : buildPensionVerdict({ blocks, taxYear: activeYear, currentYear })),
    [failures, blocks, activeYear, currentYear],
  );

  // ─── The phone composition (2026-10-15) ──────────────────────────────────────
  // The rows (`resolvePensionSections`, lib/utils/pensionSummary.ts: Rendimento fails on the
  // contributions OR the snapshots, the other three on the contributions; none without a fund);
  // the controller hands each tile its row and the verdict its «Il perché». The strip — three
  // causes with one contributor, none with more — is read from the same blocks the verdict reads,
  // and from nothing once a read failed. Every cell opens a row, so `reveal` IS the handler.
  const hasFund = funds.length > 0;
  const sectionSpecs = useMemo(() => resolvePensionSections({ hasFund, contributionsError, snapshotsError }), [hasFund, contributionsError, snapshotsError]);
  const sections = useMobileSections({ route: 'pension', sections: sectionSpecs });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts). The specs ARE the DOM's rows.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: sectionSpecs.map((section) => section.id) });
  const { reveal: handleStripOpen } = sections;
  const strip = failures.length > 0 ? [] : selectPensionStrip({ blocks, taxYear: activeYear });
  // What each closed row answers in the landscape index (2026-10-16): read from the same blocks,
  // natures and ledger the tiles print, never a second computation.
  const rowAnswers = useMemo(
    () => describePensionClosedAnswers({ blocks, versato, ledger, contributionsError, snapshotsError }),
    [blocks, versato, ledger, contributionsError, snapshotsError],
  );

  // ─── Delete: reverses the value/transfer effect (invariant #5) ───────────────
  const handleDelete = (row: LedgerRow) => {
    const contribution = contributions.find((c) => c.id === row.id);
    if (!contribution) return;
    deleteMutation.mutate(contribution, {
      onSuccess: () => toast.success('Versamento eliminato'),
      onError: () => toast.error("Errore nell'eliminazione del versamento"),
    });
  };

  // ─── Loading: all FOUR queries, not only the two that decide the empty state ─
  if (assetsLoading || settingsLoading || contributionsLoading || snapshotsLoading) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  // Without assets or settings it is not even known whether the user owns a fund: blocking.
  if (assetsError || settingsError) {
    return <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: "I tuoi fondi pensione non sono stati letti: senza di essi la pagina non sa nemmeno se ne possiedi uno.",
          untouched: "I versamenti registrati non sono stati toccati.",
        })}
      />;
  }

  // ─── Empty: the verdict says so, one tile points at Patrimonio ──────────────
  if (funds.length === 0) {
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel={VERDICT_LABEL} />
        </div>
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5')}>
            <Tile eyebrow="Il fondo oggi" ariaLabel="Il fondo oggi">
              <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
                Crea un asset di tipo «Fondo Pensione» da Patrimonio per iniziare a registrare i versamenti e vedere qui il rendimento e il beneficio fiscale.
              </p>
              <Link href="/dashboard/assets" className={cn(ASIDE_LINK_CLASS, 'mt-4')}>
                Vai a Patrimonio
              </Link>
            </Tile>
          </div>
        </div>
      </div>
    );
  }

  const yearAxis =
    availableYears.length > 1 ? (
      <SegmentedPill
        options={availableYears.map((year) => ({ value: String(year), label: String(year) }))}
        value={String(activeYear)}
        onChange={(value) => setSelectedYear(Number(value))}
        layoutId="pension-year-axis"
        ariaLabel="Anno fiscale"
        semantics="radio"
        optionClassName="min-h-11 desktop:min-h-0"
        className="w-fit"
      />
    ) : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={STAGE_CLASS}>
      {/* The verdict and the page's one axis: beside it from desktop, under its title below —
          two instances of the same control, the same state (DESIGN.md → Page Verdict, `hidden desktop:block`). */}
      <div
        data-stage="verdict"
        className={cn('flex flex-col gap-3 pt-1 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6', VERDICT_CELL_CLASS)}
      >
        <PageVerdict
          verdict={verdict}
          ariaLabel={VERDICT_LABEL}
          axis={yearAxis}
          strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={sections.eyebrows} />}
          restCollapse={sections.collapse(VERDICT_REST_SECTION)}
        />
        {yearAxis && <div className="hidden desktop:block">{yearAxis}</div>}
      </div>

      {/* ONE sequence: the DOM order is the reading order at every width, no `order-*` (The First-Screen Rule).
          At 768 Il fondo oggi on two columns, the closed rows two by two, an open row (a failed read,
          open on its own) on the whole grid row; on a tablet in landscape the index beside the
          verdict and Il fondo oggi. */}
      <div className={COMPACT_GRID_WRAPPER_CLASS}>
      <div className={COMPACT_GRID_CLASS}>
        <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-5 desktop:row-span-2')}>
          <FondoOggiTile
            reading={contributionsError ? null : describeFondoOggi(today)}
            aside={describeFondoOggiAside(today)}
            footer={describeFondoOggiFooter(today)}
            value={today.value}
            chips={contributionsError ? [] : buildFondoOggiChips(today)}
            series={snapshotsError ? [] : today.series}
            seriesAside={describeFondoOggiSeriesAside(today)}
            onUpdateValue={isDemo ? undefined : () => setValueDialogOpen(true)}
          />
        </div>

        <RowAnswers value={rowAnswers}>
        <div className={INDEX_CLASS}>
        <PageRest sections={sections} className={REST_CELL_CLASS} />

        {/* A failed read is a red row below `desktop:`, silent — `PageRest` carries the one live node
            (`live={!sections.compact}`); at 1440 the notice of today, in the cell. */}
        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PENSION_SECTION_IDS.rendimento), 'desktop:col-span-3')}>
          {contributionsError || snapshotsError ? (
            <ErrorNotice
              compact
              collapse={sections.collapse(PENSION_SECTION_IDS.rendimento)}
              live={!sections.compact}
              notice={describeReadFailure({
                subject: 'Rendimento',
                consequence: 'I dati da cui si calcola il rendimento non sono stati letti.',
              })}
            />
          ) : (
            <RendimentoTile
              collapse={sections.collapse(PENSION_SECTION_IDS.rendimento)}
              asideWhenClosed={describeRendimentoAside(blocks)}
              reading={describeRendimento(blocks)}
              aside={describeRendimentoAside(blocks)}
              footer={RENDIMENTO_FOOTER}
              blocks={blocks}
            />
          )}
        </div>

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PENSION_SECTION_IDS.annoFiscale), 'desktop:col-span-4')}>
          {contributionsError ? (
            <ErrorNotice
              compact
              collapse={sections.collapse(PENSION_SECTION_IDS.annoFiscale)}
              live={!sections.compact}
              notice={describeReadFailure({
                subject: 'Anno fiscale',
                consequence: 'I versamenti non sono stati letti: il beneficio fiscale non è calcolabile.',
              })}
            />
          ) : (
            <AnnoFiscaleTile
              collapse={sections.collapse(PENSION_SECTION_IDS.annoFiscale)}
              asideWhenClosed={PENSION_CLOSED_ASIDES[PENSION_SECTION_IDS.annoFiscale]}
              taxYear={activeYear}
              reading={describeAnnoFiscale(blocks, activeYear)}
              aside={describeAnnoFiscaleAside(blocks)}
              footer={ANNO_FISCALE_FOOTER}
              blocks={blocks}
            />
          )}
        </div>

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PENSION_SECTION_IDS.versato), 'desktop:col-span-7')}>
          {contributionsError ? (
            <ErrorNotice
              collapse={sections.collapse(PENSION_SECTION_IDS.versato)}
              live={!sections.compact}
              notice={describeReadFailure({
                subject: 'Versato',
                consequence: "I versamenti dell'anno non sono stati letti.",
                untouched: 'I versamenti registrati non sono stati toccati.',
              })}
            />
          ) : (
            <VersatoTile
              collapse={sections.collapse(PENSION_SECTION_IDS.versato)}
              asideWhenClosed={PENSION_CLOSED_ASIDES[PENSION_SECTION_IDS.versato]}
              taxYear={activeYear}
              reading={describeVersato(versato, funds.length)}
              aside="per natura"
              footer={describeVersatoFooter(versato)}
              rows={versato.rows}
              ring={versatoRingSegments}
              total={versato.total}
            />
          )}
        </div>

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PENSION_SECTION_IDS.versamenti), 'desktop:col-span-12')}>
          {contributionsError ? (
            <ErrorNotice
              collapse={sections.collapse(PENSION_SECTION_IDS.versamenti)}
              live={!sections.compact}
              notice={describeReadFailure({
                subject: 'Versamenti',
                consequence: 'Lo storico dei versamenti non è stato letto.',
                untouched: 'I versamenti registrati non sono stati toccati.',
              })}
            />
          ) : (
            <VersamentiTile
              collapse={sections.collapse(PENSION_SECTION_IDS.versamenti)}
              asideWhenClosed={describeVersamentiAside(ledger)}
              taxYear={activeYear}
              reading={describeVersamenti(ledger)}
              aside={describeVersamentiAside(ledger)}
              footer={VERSAMENTI_FOOTER}
              rows={ledger.rows}
              showFund={funds.length > 1}
              onDelete={handleDelete}
              isDemo={isDemo}
            />
          )}
        </div>
        </div>
        </RowAnswers>
      </div>
      </div>
      </div>
      </div>

      <PensionDettaglio description={DETTAGLIO_DESCRIPTION} blocks={contributionsError || snapshotsError ? [] : blocks} crescitaFooter={CRESCITA_FOOTER} comeAggiornare={COME_AGGIORNARE} />
      <PensionValueDialog open={valueDialogOpen} onClose={() => setValueDialogOpen(false)} />
    </div>
  );
}
