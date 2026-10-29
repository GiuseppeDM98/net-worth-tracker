/**
 * The broker TRADE import — one modal, two brokers.
 *
 * It is one component rather than one per broker because everything the user sees is
 * broker-agnostic: the same three groups (da importare · già presenti · non compatibili), the same
 * idempotent write, the same invalidation. Only the URL and the broker's own name differ, and those
 * are two props. The per-broker parts (how the session is obtained, what the payload contains) stay
 * in the connection tiles, which is where they already live.
 *
 * WHAT THIS MODAL IS NOT ALLOWED TO DO, and why each rule is here:
 *
 * - **Write on open.** The first call is the preview branch of the route, which never touches
 *   Firestore. A broker history is not the user's assertion that it is correct: it can name an
 *   instrument that is not in Portafoglio, or a trade dated before the asset's baseline, and writing
 *   either produces a position that is wrong rather than incomplete. So the user sees exactly what
 *   would happen, and only the approved rows are written.
 * - **Write a row it did not show.** The approval travels as the broker's own ids, and the server
 *   re-derives the plan from its CURRENT ledger before writing, so a row that stopped being
 *   importable in the meantime is refused rather than written on the strength of a stale preview.
 * - **Pretend a partial write was a whole one.** The write is per-row and continues past a failure
 *   (a historical sell whose lots predate the baseline is a real, expected case). The summary says
 *   how many landed AND how many did not, and the failures are listed with the ledger's own words —
 *   a silent «done» over thirty of forty operations is the one outcome that would make the ledger
 *   quietly disagree with the broker.
 * - **Invalidate the wrong caches.** A ledger mutation moves the asset's derived fields (quantity,
 *   PMC) AND the Patrimonio hero, so the trades list, the assets and the dashboard overview are all
 *   invalidated together — the dual-invalidation rule, plus the ledger's own prefix key.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency, formatDate, formatNumberIt } from '@/lib/utils/formatters';
import { errorMessage } from '@/lib/utils/errorMessage';
import { queryKeys } from '@/lib/query/queryKeys';
import { signChipClass } from '@/lib/utils/metricColors';
import {
  applyBrokerTrades,
  fetchBrokerTradePreview,
} from '@/lib/services/brokerTradeImportService';
import type { BrokerTradeRow, BrokerTradeSkip } from '@/lib/utils/brokerTradePlan';
import type { SkippedBrokerTrade } from '@/lib/utils/brokerTrade';
import type { AssetTransactionSource } from '@/types/assetTransactions';

type Phase = 'loading' | 'ready' | 'saving' | 'failed';

/**
 * Everything one preview produced, stored WITH the request that produced it.
 *
 * The reset setters the naive version needed are gone: a stored `requestKey` that no longer matches
 * the live one makes the whole subject read as «not loaded yet», so a reopen falls back to the
 * defaults DURING RENDER, with no effect and no extra pass. That is the repo's `scopeKey` shape
 * (`EntityDossier`) and the reason `react-hooks/set-state-in-effect` does not apply here.
 */
interface LoadedPreview {
  requestKey: string;
  phase: Phase;
  error: string | null;
  preview: Preview | null;
  approved: ReadonlySet<string>;
  outcome: ImportOutcome | null;
}

interface Preview {
  toImport: BrokerTradeRow[];
  alreadyImported: BrokerTradeRow[];
  skipped: BrokerTradeSkip[];
  parserSkipped: SkippedBrokerTrade[];
  brokerCount: number;
}

interface ImportOutcome {
  imported: number;
  duplicates: number;
  failed: { sourceRef: string; message: string }[];
  realizedPnlEur: number;
}

interface BrokerTradeImportDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  source: AssetTransactionSource;
  /** The broker's own display name — «Scalable Capital» / «Trade Republic». */
  brokerName: string;
}

const SIDE_LABEL = { buy: 'Acquisto', sell: 'Vendita' } as const;

/** A stable empty selection — a fresh `Set` every render would re-render the whole list. */
const NO_APPROVED: ReadonlySet<string> = new Set<string>();

/**
 * The side, in the user's words.
 *
 * `BrokerTrade.type` is the ledger's own `AssetTransactionType`, so the compiler is right that
 * 'adjustment' is missing from the map — and the parser is equally right never to produce one: an
 * adjustment is a ledger correction, not a fact a broker reports. The fallback exists so a future
 * parser that ever widens the type prints a word instead of rendering an empty cell.
 */
function sideLabel(type: BrokerTradeRow['trade']['type']): string {
  return SIDE_LABEL[type as keyof typeof SIDE_LABEL] ?? 'Operazione';
}

/** Italian plural for a count, without a pluralization library. */
function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** The success line, out of the `try` that writes: the realized-gain clause is a ternary. */
function importedMessage(imported: number, realizedPnlEur: number): string {
  const realized = realizedPnlEur !== 0 ? ` · plusvalenza ${formatCurrency(realizedPnlEur)}` : '';
  return `${imported} operazioni importate${realized}.`;
}

export function BrokerTradeImportDialog({
  open,
  onClose,
  ownerId,
  source,
  brokerName,
}: BrokerTradeImportDialogProps) {
  const queryClient = useQueryClient();
  /** The ONLY state: the whole preview subject, stored WITH the request that produced it. */
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  /** Guards against a slow response for a closed (or superseded) modal overwriting the live one. */
  const requestIdRef = useRef(0);
  /** The control that opened the modal, so focus returns there (ResponsiveModal § returnFocusTo). */
  const openerRef = useRef<HTMLElement | null>(null);

  /** Reopen = new request: the key changes, so the subject reads as «not loaded yet». */
  const requestKey = `${ownerId}:${source}:${open ? 'open' : 'closed'}`;
  const subject: LoadedPreview =
    loaded?.requestKey === requestKey
      ? loaded
      : { requestKey, phase: 'loading', error: null, preview: null, approved: NO_APPROVED, outcome: null };
  const { phase, error, preview, approved, outcome } = subject;

  // The preview is re-read on every OPEN, never cached: it is a statement about the broker's
  // history at this moment, and a stale one would show trades that have since settled differently.
  // The effect body sets no state itself (the timer defers it, per react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchBrokerTradePreview(ownerId, source);
          if (requestId !== requestIdRef.current) return;
          // EVERYTHING SELECTED BY DEFAULT, and that is a deliberate reading: the user opened this
          // to import their history, the rows that cannot be imported are not selectable at all,
          // and a default of NOTHING would make the common case a two-click no-op. The unchecked
          // exceptions are the point of the checkboxes.
          setLoaded({
            requestKey,
            phase: 'ready',
            error: null,
            preview: {
              toImport: data.toImport,
              alreadyImported: data.alreadyImported,
              skipped: data.skipped,
              parserSkipped: data.parserSkipped,
              brokerCount: data.brokerCount,
            },
            approved: new Set(data.toImport.map((row) => row.trade.sourceRef)),
            outcome: null,
          });
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setLoaded({
            requestKey,
            phase: 'failed',
            error: errorMessage(err, 'Lettura non riuscita: riprova.'),
            preview: null,
            approved: NO_APPROVED,
            outcome: null,
          });
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, ownerId, source, requestKey]);

  const toggle = (sourceRef: string, checked: boolean) => {
    setLoaded({
      ...subject,
      approved: (() => {
        const next = new Set(subject.approved);
        if (checked) next.add(sourceRef);
        else next.delete(sourceRef);
        return next;
      })(),
    });
  };

  const handleSave = async () => {
    setLoaded({ ...subject, phase: 'saving', error: null });
    try {
      const written = await applyBrokerTrades(ownerId, source, [...approved]);
      // A ledger mutation rewrites the asset's derived fields AND the Patrimonio hero, so the
      // trades list, the assets and the dashboard overview go together. `assetTransactions.all` is
      // a prefix of `byAsset`, so one call refreshes any per-asset movements list too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assetTransactions.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) }),
      ]);
      if (written.failed.length === 0) {
        setLoaded({ ...subject, phase: 'ready', outcome: written });
        toast.success(importedMessage(written.imported, written.realizedPnlEur));
        onClose();
      } else {
        // A partial write STAYS OPEN, with the failures listed: the user has to see which operations
        // did not land before closing the surface that explains them.
        setLoaded({ ...subject, phase: 'ready', outcome: written });
        toast.error(`${written.imported} importate, ${written.failed.length} non riuscite.`);
      }
    } catch (err) {
      setLoaded({
        ...subject,
        phase: 'failed',
        error: errorMessage(err, 'Salvataggio non riuscito: riprova.'),
      });
    }
  };

  const toImport = preview?.toImport ?? [];
  const failures = outcome?.failed ?? [];
  const busy = phase === 'loading' || phase === 'saving';
  const alreadyImported = preview?.alreadyImported.length ?? 0;
  const parserSkipped = preview?.parserSkipped.length ?? 0;

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      returnFocusTo={openerRef}
      eyebrow="Registro operazioni · Importa da broker"
      title="Importa le operazioni"
      width="lg"
      reading={
        phase === 'loading'
          ? `Sto leggendo lo storico di ${brokerName}…`
          : phase === 'saving'
            ? 'Sto registrando le operazioni nel registro…'
            : phase === 'failed'
              ? (error ?? 'Operazione non riuscita: riprova.')
              : toImport.length === 0 && (preview?.brokerCount ?? 0) > 0
                ? 'Nessuna operazione da importare: il registro è già allineato.'
                : `${toImport.length} ${countLabel(toImport.length, 'operazione da importare', 'operazioni da importare')}${alreadyImported > 0 ? `, ${alreadyImported} già ${countLabel(alreadyImported, 'presente', 'presenti')}` : ''}.`
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy || approved.size === 0}>
            {phase === 'saving' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {`Importa${approved.size > 0 ? ` ${approved.size}` : ''}`}
          </Button>
        </>
      }
      footerNote={
        <span className="text-muted-foreground">
          Le operazioni già importate non vengono riscritte.
        </span>
      }
    >
      {phase === 'loading' ? (
        <p className="text-[13px] text-muted-foreground">Lettura dello storico in corso…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {toImport.length > 0 && (
            <section aria-label="Operazioni da importare" className="flex flex-col gap-2">
              <h4 className="text-[13px] font-medium">Da importare</h4>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {toImport.map((row) => (
                  <li key={row.trade.sourceRef} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox
                      checked={approved.has(row.trade.sourceRef)}
                      onCheckedChange={(checked) => toggle(row.trade.sourceRef, checked === true)}
                      aria-label={`Importa ${row.trade.label}`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px]">{row.trade.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {`${formatDate(row.trade.date)} · ${sideLabel(row.trade.type)} · ${formatNumberIt(row.trade.quantity)} × ${formatCurrency(row.trade.pricePerUnit, row.trade.currency)}`}
                        {row.trade.fees !== undefined && row.trade.fees > 0
                          ? ` · ${formatCurrency(row.trade.fees, row.trade.currency)} commissioni`
                          : ''}
                      </span>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {sideLabel(row.trade.type)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {alreadyImported > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {`${alreadyImported} ${countLabel(alreadyImported, 'operazione già presente', 'operazioni già presenti')}: non verranno riscritte.`}
            </p>
          )}

          {(preview?.skipped.length ?? 0) > 0 && (
            <section aria-label="Operazioni non compatibili" className="flex flex-col gap-2">
              <h4 className="text-[13px] font-medium">Non compatibili</h4>
              <ul className="flex flex-col gap-1.5">
                {preview?.skipped.map((skip) => (
                  <li key={skip.trade.sourceRef} className="text-[11px] text-muted-foreground">
                    <span className="text-foreground">{skip.trade.label}</span>
                    {` — ${skip.message}`}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {parserSkipped > 0 && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">
                {`${parserSkipped} ${countLabel(parserSkipped, 'riga non è un’operazione', 'righe non sono operazioni')}`}
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {preview?.parserSkipped.map((skip) => (
                  <li key={skip.sourceRef}>{`${skip.label || skip.sourceRef} — ${skip.reason}`}</li>
                ))}
              </ul>
            </details>
          )}

          {failures.length > 0 && (
            <section aria-label="Operazioni non riuscite" className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-[13px] font-medium text-destructive">
                <TriangleAlert className="size-4" />
                Non riuscite
              </h4>
              <ul className="flex flex-col gap-1">
                {failures.map((failure) => (
                  <li key={failure.sourceRef} className="text-[11px] text-muted-foreground">
                    <span className="text-foreground">{failure.sourceRef}</span>
                    {` — ${failure.message}`}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {outcome && outcome.realizedPnlEur !== 0 && (
            <p className="text-[13px]">
              <ArrowDownUp className="mr-1.5 inline size-3.5" />
              <span className={signChipClass(outcome.realizedPnlEur)}>
                {formatCurrency(outcome.realizedPnlEur)}
              </span>
              <span className="text-muted-foreground"> di plusvalenza registrata</span>
            </p>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
