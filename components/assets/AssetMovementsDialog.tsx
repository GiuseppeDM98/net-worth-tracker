'use client';

/**
 * AssetMovementsDialog — per-asset ledger history + vitals (Registro operazioni asset, Phase C).
 *
 * Opens for one asset and lists every trade (date desc), with a header strip of the asset's ledger
 * vitals computed by the pure engine + the live EUR value:
 *   - P&L realizzato (cumulative realized since baseline).
 *   - Rendimento totale (realized + unrealized; dividends are tracked separately in Rendimenti /
 *     Dividendi — the per-asset dividend scoping lands in Fase D, so this view stays ledger-only and
 *     says so in the Popover to avoid a number that silently disagrees with Rendimenti).
 *   - XIRR (money-weighted, date-exact from the real trade dates; "–" when not computable).
 *
 * Reads are lazy: the trade query fires only while the dialog is open (the exposure/lazy-load rule).
 * Deletes use the 2-click / 3s auto-disarm confirm; the baseline row cannot be deleted (spec 03 §1),
 * only edited (quantity/PMC/note) via TransactionDialog.
 */

import { useMemo, useRef, useState } from 'react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import {
  useAssetTransactions,
  useDeleteAssetTransaction,
} from '@/lib/hooks/useAssetTransactions';
import {
  replayTransactions,
  computeAssetTotalReturn,
  computeAssetXirr,
  buildXirrFlows,
  sortTransactionsForReplay,
  type LedgerPositionState,
} from '@/lib/utils/assetTransactionUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TransactionDialog } from '@/components/assets/TransactionDialog';
import { cn } from '@/lib/utils';
import { Info, Pencil, Plus, Trash2, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

interface AssetMovementsDialogProps {
  open: boolean;
  onClose: () => void;
  asset: Asset;
}

/** Per-transaction realized P&L: cumulative realized after each sell minus the running total before it. */
function computeRealizedByTransactionId(
  sortedAsc: AssetTransaction[]
): Record<string, number> {
  const result: Record<string, number> = {};
  let previousCumulative = 0;
  for (let i = 0; i < sortedAsc.length; i++) {
    const prefix = sortedAsc.slice(0, i + 1);
    let cumulative = previousCumulative;
    try {
      cumulative = replayTransactions(prefix).realizedPnlEur;
    } catch {
      // A stored sequence is server-validated, so prefixes are valid; keep the last value if not.
    }
    if (sortedAsc[i].type === 'sell') {
      result[sortedAsc[i].id] = cumulative - previousCumulative;
    }
    previousCumulative = cumulative;
  }
  return result;
}

export function AssetMovementsDialog({ open, onClose, asset }: AssetMovementsDialogProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();

  const { data: transactions = [], isLoading } = useAssetTransactions(ownerId, asset.id, {
    enabled: open,
  });
  const deleteMutation = useDeleteAssetTransaction(ownerId || '');

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<AssetTransaction | null>(null);

  const currentValueEur = calculateAssetValue(asset);

  // Ascending order for replay + per-transaction realized; the list renders descending.
  const sortedAsc = useMemo(() => sortTransactionsForReplay(transactions), [transactions]);
  const realizedById = useMemo(() => computeRealizedByTransactionId(sortedAsc), [sortedAsc]);
  const sortedDesc = useMemo(() => [...sortedAsc].reverse(), [sortedAsc]);

  const vitals = useMemo(() => {
    if (transactions.length === 0) return null;
    try {
      const state: LedgerPositionState = replayTransactions(transactions);
      const totalReturn = computeAssetTotalReturn(state, currentValueEur, 0);
      const xirr = computeAssetXirr(
        buildXirrFlows({ transactions, dividendsNetEur: [], currentValueEur, now: new Date() })
      );
      return {
        realizedPnlEur: state.realizedPnlEur,
        totalReturnEur: totalReturn.totalReturnEur,
        totalReturnPct: totalReturn.totalReturnPct,
        xirr,
      };
    } catch {
      return null;
    }
  }, [transactions, currentValueEur]);

  // 2-click inline confirm with 3s auto-disarm (the AssetManagementTab delete precedent). The
  // settlement-reversal warning is rendered from the row's own linkedCashAssetId.
  const handleDeleteClick = (transactionId: string) => {
    if (isDemo) return;
    if (pendingDeleteId === transactionId) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(null);
      void performDelete(transactionId);
    } else {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(transactionId);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  const performDelete = async (transactionId: string) => {
    try {
      await deleteMutation.mutateAsync(transactionId);
      toast.success('Operazione eliminata');
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante l'eliminazione.";
      toast.error(message);
    }
  };

  const openNewTrade = () => {
    setEditingTx(null);
    setTxDialogOpen(true);
  };

  const openEditTrade = (transaction: AssetTransaction) => {
    setEditingTx(transaction);
    setTxDialogOpen(true);
  };

  const footer = (
    <Button type="button" variant="outline" onClick={onClose}>
      Chiudi
    </Button>
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        title="Movimenti"
        description={`Storico delle operazioni per ${asset.name}.`}
        dialogClassName="max-w-xl"
        footer={footer}
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{asset.name}</p>
            {asset.ticker && (
              <p className="text-xs font-mono text-muted-foreground">{asset.ticker}</p>
            )}
          </div>

          {/* Vitals strip */}
          {vitals && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border p-3">
              <Vital
                label="P&L realizzato"
                value={formatSignedEur(vitals.realizedPnlEur)}
                tone={signTone(vitals.realizedPnlEur)}
              />
              <Vital
                label="Rendimento totale"
                value={formatSignedEur(vitals.totalReturnEur)}
                sub={vitals.totalReturnPct !== null ? formatSignedPct(vitals.totalReturnPct * 100) : undefined}
                tone={signTone(vitals.totalReturnEur)}
                info="Plusvalenze realizzate + non realizzate dal registro operazioni. I dividendi incassati sono conteggiati a parte in Rendimenti e Dividendi."
              />
              <Vital
                label="XIRR"
                value={vitals.xirr !== null ? formatSignedPct(vitals.xirr * 100) : '–'}
                tone={vitals.xirr !== null ? signTone(vitals.xirr) : 'neutral'}
                info="Rendimento annualizzato ponderato per i flussi (XIRR), dalle date reali delle operazioni."
              />
            </div>
          )}

          {/* Register a new trade */}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewTrade}
              disabled={isDemo}
              aria-label={isDemo ? 'Non disponibile in modalità demo' : 'Registra operazione'}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Registra operazione
            </Button>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : sortedDesc.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground opacity-40" />
              <p className="max-w-[280px] text-sm text-muted-foreground">
                Nessuna operazione registrata. Registra il primo acquisto per aprire la posizione.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {sortedDesc.map((transaction) => (
                <MovementRow
                  key={transaction.id}
                  transaction={transaction}
                  currency={asset.currency || 'EUR'}
                  realizedEur={realizedById[transaction.id]}
                  isPendingDelete={pendingDeleteId === transaction.id}
                  isDemo={isDemo}
                  onEdit={() => openEditTrade(transaction)}
                  onDeleteClick={() => handleDeleteClick(transaction.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ResponsiveModal>

      <TransactionDialog
        open={txDialogOpen}
        onClose={() => {
          setTxDialogOpen(false);
          setEditingTx(null);
        }}
        asset={asset}
        transaction={editingTx}
      />
    </>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

interface MovementRowProps {
  transaction: AssetTransaction;
  currency: string;
  realizedEur: number | undefined;
  isPendingDelete: boolean;
  isDemo: boolean;
  onEdit: () => void;
  onDeleteClick: () => void;
}

function MovementRow({
  transaction,
  currency,
  realizedEur,
  isPendingDelete,
  isDemo,
  onEdit,
  onDeleteClick,
}: MovementRowProps) {
  const isBaseline = transaction.isBaseline === true;
  const fees = transaction.fees;
  const gross = transaction.quantity * transaction.priceEur;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(transaction.date)}
          </span>
          <TypeChip type={transaction.type} isBaseline={isBaseline} />
        </div>
        <p className="font-mono text-sm text-foreground tabular-nums">
          {formatQty(transaction.quantity)} × {formatCurrency(transaction.pricePerUnit, currency, 4)}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>Totale {formatCurrency(gross)}</span>
          {fees !== undefined && fees > 0 && <span>Commissioni {formatCurrency(fees)}</span>}
          {transaction.type === 'sell' && realizedEur !== undefined && (
            <span className={cn('font-medium', signToneClass(realizedEur))}>
              P&L {formatSignedEur(realizedEur)}
            </span>
          )}
        </div>
        {transaction.note && (
          <p className="truncate text-xs text-muted-foreground italic">{transaction.note}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
          disabled={isDemo}
          aria-label="Modifica operazione"
          title={isDemo ? 'Non disponibile in modalità demo' : undefined}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {/* Baseline cannot be deleted — it is the frozen opening position (spec 03 §1). */}
        {!isBaseline && (
          <Button
            type="button"
            variant={isPendingDelete ? 'destructive' : 'ghost'}
            size={isPendingDelete ? 'sm' : 'icon'}
            className={isPendingDelete ? undefined : 'h-8 w-8'}
            onClick={onDeleteClick}
            disabled={isDemo}
            aria-label={
              isPendingDelete
                ? transaction.linkedCashAssetId
                  ? 'Conferma? Il saldo del conto verrà ristornato.'
                  : 'Conferma eliminazione'
                : 'Elimina operazione'
            }
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          >
            {isPendingDelete ? (
              <span className="px-1 text-xs">
                {transaction.linkedCashAssetId ? 'Conferma? Storno saldo' : 'Conferma?'}
              </span>
            ) : (
              <Trash2 className="h-4 w-4 text-destructive" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function TypeChip({ type, isBaseline }: { type: AssetTransaction['type']; isBaseline: boolean }) {
  if (isBaseline) {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Posizione iniziale
      </span>
    );
  }
  const config: Record<AssetTransaction['type'], { label: string; className: string }> = {
    buy: { label: 'Compra', className: 'bg-positive/10 text-positive' },
    sell: { label: 'Vendi', className: 'bg-destructive/10 text-destructive' },
    adjustment: { label: 'Rettifica', className: 'bg-muted text-muted-foreground' },
  };
  const { label, className } = config[type];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>
      {label}
    </span>
  );
}

// ── Vital cell ───────────────────────────────────────────────────────────────

type Tone = 'positive' | 'destructive' | 'neutral';

function Vital({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  info?: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground truncate">{label}</span>
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Informazioni su ${label}`}
              >
                <Info className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs leading-relaxed">{info}</PopoverContent>
          </Popover>
        )}
      </div>
      <p
        className={cn(
          'font-mono text-sm font-semibold tabular-nums',
          tone === 'positive'
            ? 'text-positive'
            : tone === 'destructive'
              ? 'text-destructive'
              : 'text-foreground'
        )}
      >
        {value}
      </p>
      {sub && <p className={cn('font-mono text-[11px] tabular-nums', signToneClass(0, tone))}>{sub}</p>}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function signTone(value: number): Tone {
  if (value > 0) return 'positive';
  if (value < 0) return 'destructive';
  return 'neutral';
}

function signToneClass(value: number, tone?: Tone): string {
  const resolved = tone ?? signTone(value);
  if (resolved === 'positive') return 'text-positive';
  if (resolved === 'destructive') return 'text-destructive';
  return 'text-muted-foreground';
}

function formatSignedEur(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

function formatSignedPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatQty(value: number): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: 8 });
}
