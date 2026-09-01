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
 *   Mobile (1 col):   Il fondo oggi → Rendimento → Anno fiscale → Versato → Versamenti
 *
 * THE PAGE'S ONE AXIS IS THE FISCAL YEAR, beside the verdict from `desktop:` and under it below.
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
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { calculateAssetValue } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { usePensionContributions, useDeletePensionContribution } from '@/lib/hooks/usePensionContributions';
import { derivePensionContributionYears, resolveActivePensionYear } from '@/lib/utils/pensionContributions';
import { calculateProgressiveTax, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import { queryKeys } from '@/lib/query/queryKeys';
import type { MonthlySnapshot } from '@/types/assets';
import type { Settings } from '@/types/settings';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  summarizeFundToday,
  summarizeLedger,
  summarizePensionMembers,
  summarizeVersato,
  type LedgerRow,
  type PensionSummaryInput,
} from '@/lib/utils/pensionSummary';
import {
  ANNO_FISCALE_FOOTER,
  buildFondoOggiChips,
  buildPensionLoadErrorVerdict,
  buildPensionVerdict,
  COME_AGGIORNARE,
  CRESCITA_FOOTER,
  describeAnnoFiscale,
  describeAnnoFiscaleAside,
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
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { PensionDettaglio } from '@/components/pension/PensionDettaglio';
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

const ASIDE_LINK_CLASS =
  'inline-flex h-11 w-fit items-center gap-1 rounded-md border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-7 desktop:px-2.5 desktop:text-[11px]';

export function PensionOverview() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [], isLoading: assetsLoading, isError: assetsError } = useAssets(ownerId);
  const { data: contributions = [], isLoading: contributionsLoading, isError: contributionsError } = usePensionContributions(ownerId);
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!ownerId,
  });
  // The fund's return is read from the monthly snapshots: the only place its value is frozen
  // month by month (the asset carries only the current value).
  const { data: snapshots = [], isLoading: snapshotsLoading, isError: snapshotsError } = useQuery<MonthlySnapshot[]>({
    queryKey: queryKeys.snapshots.all(ownerId || ''),
    queryFn: () => getUserSnapshots(ownerId!),
    enabled: !!ownerId,
  });
  const deleteMutation = useDeletePensionContribution(ownerId || '');

  // One `now` per mount: the live overlay's month, the digest's window and the year axis agree.
  const now = useMemo(() => new Date(), []);
  const currentYear = getItalyYear(now);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const funds = useMemo(() => assets.filter((asset) => asset.type === 'pensionFund'), [assets]);

  // The year axis is derived, so it survives a refetch that adds or removes a year.
  const availableYears = useMemo(() => derivePensionContributionYears(contributions, currentYear), [contributions, currentYear]);
  const activeYear = resolveActivePensionYear(selectedYear, availableYears, currentYear);

  // ─── The pure layer ──────────────────────────────────────────────────────────
  const taxOf = useMemo(() => {
    const brackets = normalizeCoastFireTaxBrackets(undefined);
    return (income: number) => calculateProgressiveTax(income, brackets);
  }, []);

  const summaryInput = useMemo<PensionSummaryInput>(
    () => ({
      funds,
      assets,
      familyMembers: settings?.familyMembers ?? [],
      contributions,
      snapshots,
      now,
      configuredStartMonth: settings?.pensionReturnStartMonth,
      taxYear: activeYear,
      taxOf,
      valueOf: calculateAssetValue,
    }),
    [funds, assets, settings, contributions, snapshots, now, activeYear, taxOf],
  );

  const today = useMemo(() => summarizeFundToday(summaryInput), [summaryInput]);
  const blocks = useMemo(() => summarizePensionMembers(summaryInput), [summaryInput]);
  const versato = useMemo(() => summarizeVersato(contributions, activeYear), [contributions, activeYear]);
  const ledger = useMemo(() => summarizeLedger(contributions, funds, assets, activeYear), [contributions, funds, assets, activeYear]);

  // ─── The words ───────────────────────────────────────────────────────────────
  const failures: PensionLoadFailure[] = [
    ...(contributionsError ? (['contributions'] as const) : []),
    ...(snapshotsError ? (['snapshots'] as const) : []),
  ];
  const verdict = useMemo(
    () => (failures.length > 0 ? buildPensionLoadErrorVerdict(failures) : buildPensionVerdict({ blocks, taxYear: activeYear, currentYear })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `failures` is rebuilt every render; its two booleans are the real inputs.
    [contributionsError, snapshotsError, blocks, activeYear, currentYear],
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
        className="w-fit"
      />
    ) : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* The verdict and the page's one axis: beside it from desktop, under it below. */}
      <div className="flex flex-col gap-3 pt-1 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
        <PageVerdict verdict={verdict} ariaLabel={VERDICT_LABEL} />
        {yearAxis}
      </div>

      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
          <FondoOggiTile
            reading={contributionsError ? null : describeFondoOggi(today)}
            aside={describeFondoOggiAside(today)}
            footer={describeFondoOggiFooter(today)}
            value={today.value}
            chips={contributionsError ? [] : buildFondoOggiChips(today)}
            series={snapshotsError ? [] : today.series}
            seriesAside={describeFondoOggiSeriesAside(today)}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-3')}>
          {contributionsError || snapshotsError ? (
            <ErrorNotice
              compact
              notice={describeReadFailure({
                subject: 'Rendimento',
                consequence: 'I dati da cui si calcola il rendimento non sono stati letti.',
              })}
            />
          ) : (
            <RendimentoTile reading={describeRendimento(blocks)} aside={describeRendimentoAside(blocks)} footer={RENDIMENTO_FOOTER} blocks={blocks} />
          )}
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-4')}>
          {contributionsError ? (
            <ErrorNotice
              compact
              notice={describeReadFailure({
                subject: 'Anno fiscale',
                consequence: 'I versamenti non sono stati letti: il beneficio fiscale non è calcolabile.',
              })}
            />
          ) : (
            <AnnoFiscaleTile taxYear={activeYear} reading={describeAnnoFiscale(blocks, activeYear)} aside={describeAnnoFiscaleAside(blocks)} footer={ANNO_FISCALE_FOOTER} blocks={blocks} />
          )}
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
          {contributionsError ? (
            <ErrorNotice
              notice={describeReadFailure({
                subject: 'Versato',
                consequence: "I versamenti dell'anno non sono stati letti.",
                untouched: 'I versamenti registrati non sono stati toccati.',
              })}
            />
          ) : (
            <VersatoTile taxYear={activeYear} reading={describeVersato(versato)} aside="per natura" footer={describeVersatoFooter(versato)} rows={versato.rows} />
          )}
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          {contributionsError ? (
            <ErrorNotice
              notice={describeReadFailure({
                subject: 'Versamenti',
                consequence: 'Lo storico dei versamenti non è stato letto.',
                untouched: 'I versamenti registrati non sono stati toccati.',
              })}
            />
          ) : (
            <VersamentiTile
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

      <PensionDettaglio description={DETTAGLIO_DESCRIPTION} blocks={contributionsError || snapshotsError ? [] : blocks} crescitaFooter={CRESCITA_FOOTER} comeAggiornare={COME_AGGIORNARE} />
    </div>
  );
}
