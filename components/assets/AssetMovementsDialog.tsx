'use client';

/**
 * AssetMovementsDialog — per-asset ledger history + vitals (Registro operazioni asset, Phase C).
 *
 * Opens for one asset and lists every trade (date desc) at the tile's cadence — eyebrow, a
 * reading line that counts the operations by kind and names the average cost, then the vitals
 * and the rows (DESIGN.md → §5 Modal, Table inside a Tile):
 *   - P&L realizzato (cumulative realized since baseline).
 *   - Rendimento totale (realized + unrealized; dividends are tracked separately in Rendimenti /
 *     Dividendi — the per-asset dividend scoping lands in Fase D, so this view stays ledger-only and
 *     says so in the Popover to avoid a number that silently disagrees with Rendimenti).
 *   - XIRR (money-weighted, date-exact from the real trade dates; the row disappears when it is
 *     not computable — a placeholder would be a claim).
 *
 * Reads are lazy: the trade query fires only while the dialog is open (the exposure/lazy-load rule).
 * Deletes use the two-click confirm WITHOUT a timer (`useArmedDelete`); the baseline row cannot be
 * deleted, only edited (quantity/PMC/note) via TransactionDialog.
 */

import { useMemo, useRef, useState } from 'react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Skeleton } from '@/components/ui/skeleton';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import {
  useAssetTransactions,
  useDeleteAssetTransaction,
} from '@/lib/hooks/useAssetTransactions';
import {
  replayTransactions,
  replayTransactionsWithEffects,
  computeAssetTotalReturn,
  computeAssetXirr,
  buildXirrFlows,
  sortTransactionsForReplay,
  EPSILON,
  type LedgerPositionState,
  type LedgerTransactionEffect,
} from '@/lib/utils/assetTransactionUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import {
  cachedFormatCurrencyEUR,
  formatCurrency,
  formatDate,
  formatPercentageIt,
} from '@/lib/utils/formatters';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { describeMovementsReading, describeWriteError } from '@/lib/utils/dialogNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
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

export function AssetMovementsDialog({ open, onClose, asset }: AssetMovementsDialogProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();

  const { data: transactions = [], isLoading } = useAssetTransactions(ownerId, asset.id, {
    enabled: open,
  });
  const deleteMutation = useDeleteAssetTransaction(ownerId || '');

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<AssetTransaction | null>(null);

  const currentValueEur = calculateAssetValue(asset);

  // Ascending order for replay + per-transaction effects; the list renders descending.
  const sortedAsc = useMemo(() => sortTransactionsForReplay(transactions), [transactions]);
  const effectsById = useMemo((): Record<string, LedgerTransactionEffect> => {
    try {
      const { effects } = replayTransactionsWithEffects(sortedAsc);
      return Object.fromEntries(effects.map((effect) => [effect.transactionId, effect]));
    } catch {
      // A stored sequence is server-validated, so this should not happen; a failed replay must not
      // leave partial per-transaction figures on screen.
      return {};
    }
  }, [sortedAsc]);
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
        averageCostEur: state.averageCostEur,
        xirr,
      };
    } catch {
      return null;
    }
  }, [transactions, currentValueEur]);

  // The reading is a pure function of the ledger: every clause drops when its count is zero.
  const reading = useMemo(
    () =>
      describeMovementsReading({
        buys: sortedAsc.filter((t) => t.type === 'buy' && t.isBaseline !== true).length,
        sells: sortedAsc.filter((t) => t.type === 'sell').length,
        adjustments: sortedAsc.filter((t) => t.type === 'adjustment').length,
        hasBaseline: sortedAsc.some((t) => t.isBaseline === true),
        averageCostEur: vitals?.averageCostEur ?? null,
        firstDate: sortedAsc[0]?.date ?? null,
      }),
    [sortedAsc, vitals],
  );

  const performDelete = async (transactionId: string) => {
    try {
      await deleteMutation.mutateAsync(transactionId);
      toast.success('Operazione eliminata');
    } catch (error) {
      toast.error(describeWriteError(error));
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
        eyebrow={`Registro operazioni · ${asset.ticker ? getAssetDisplayTicker(asset) : asset.name}`}
        title="Movimenti"
        reading={isLoading ? 'Sto leggendo il registro.' : { narrative: reading, tone: 'neutral' }}
        width="lg"
        footer={footer}
      >
        <div className="space-y-4">
          {/* Vitals — a sub-tile on the muted surface, never a card inside a card. */}
          {vitals && (
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-muted p-3.5 sm:grid-cols-3">
              <Vital
                label="P&L realizzato"
                value={formatSignedEur(vitals.realizedPnlEur)}
                tone={signTone(vitals.realizedPnlEur)}
              />
              <Vital
                label="Rendimento totale"
                value={formatSignedEur(vitals.totalReturnEur)}
                sub={
                  vitals.totalReturnPct !== null
                    ? formatSignedPct(vitals.totalReturnPct * 100)
                    : undefined
                }
                tone={signTone(vitals.totalReturnEur)}
                info="Plusvalenze realizzate + non realizzate dal registro operazioni. I dividendi incassati sono conteggiati a parte in Rendimenti e Dividendi."
              />
              {/* No XIRR row when it cannot be computed: a "–" beside two real figures reads as a
                  measured zero (the Narrative Honesty Rule). */}
              {vitals.xirr !== null && (
                <Vital
                  label="XIRR"
                  value={formatSignedPct(vitals.xirr * 100)}
                  sub="annualizzato"
                  tone={signTone(vitals.xirr)}
                  info="Rendimento annualizzato ponderato per i flussi (XIRR), dalle date reali delle operazioni."
                />
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>Le operazioni</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewTrade}
              disabled={isDemo}
              aria-label={isDemo ? 'Non disponibile in modalità demo' : 'Registra operazione'}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Registra operazione
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : sortedDesc.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground opacity-40" aria-hidden="true" />
              <p className="max-w-[280px] text-sm text-muted-foreground">
                Nessuna operazione registrata. Registra il primo acquisto per aprire la posizione.
              </p>
            </div>
          ) : (
            <>
              {/* From sm: the ledger is a table — the columns are what make eight figures
                  comparable down a page. Below it the same rows go flat: a table at 390px
                  either scrolls sideways or squeezes every number to an ellipsis. */}
              <table className="hidden w-full border-collapse sm:table">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left')}>Data</th>
                    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left')}>Tipo</th>
                    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right')}>Quantità</th>
                    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right')}>Prezzo</th>
                    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right')}>Totale</th>
                    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right')}>P&L</th>
                    <th scope="col" className="pb-2">
                      <span className="sr-only">Azioni</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDesc.map((transaction) => (
                    <MovementTableRow
                      key={transaction.id}
                      transaction={transaction}
                      currency={asset.currency || 'EUR'}
                      effect={effectsById[transaction.id]}
                      isDemo={isDemo}
                      onEdit={() => openEditTrade(transaction)}
                      onDelete={() => void performDelete(transaction.id)}
                    />
                  ))}
                </tbody>
              </table>

              <div className="divide-y divide-border rounded-xl border border-border sm:hidden">
                {sortedDesc.map((transaction) => (
                  <MovementRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={asset.currency || 'EUR'}
                    effect={effectsById[transaction.id]}
                    isDemo={isDemo}
                    onEdit={() => openEditTrade(transaction)}
                    onDelete={() => void performDelete(transaction.id)}
                  />
                ))}
              </div>
            </>
          )}

          <p className="border-t border-border pt-3 text-xs leading-[1.45] text-muted-foreground">
            La posizione iniziale non si elimina: apre il registro e si può solo correggere.
            Eliminando una riga con un conto di regolamento, il saldo viene stornato.
            {isDemo && ' In modalità demo il registro è di sola lettura.'}
          </p>
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

// ── The armed delete ────────────────────────────────────────────────────────

interface DeleteButtonProps {
  transaction: AssetTransaction;
  isDemo: boolean;
  onDelete: () => void;
  className?: string;
}

/**
 * Two clicks, no timer, and the armed label names what is about to be reversed — a settlement
 * storno is a second consequence the reader cannot see from the row.
 */
function DeleteButton({ transaction, isDemo, onDelete, className }: DeleteButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onDelete);
  // Emptying a live region announces nothing, so the disarm is announced explicitly.
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);

  const consequence = transaction.linkedCashAssetId
    ? 'eliminare l’operazione e stornare il saldo del conto'
    : 'eliminare l’operazione';

  return (
    <>
      <Button
        ref={ref}
        type="button"
        variant={armed ? 'destructive' : 'ghost'}
        size={armed ? 'sm' : 'icon'}
        className={cn(armed ? 'h-8 px-2 text-[11px]' : 'h-8 w-8', className)}
        onClick={onClick}
        onBlur={onBlur}
        disabled={isDemo}
        aria-pressed={armed}
        aria-label={armed ? `Premi di nuovo per ${consequence}` : 'Elimina operazione'}
      >
        {armed ? (
          transaction.linkedCashAssetId ? 'Di nuovo: storna il saldo' : 'Premi di nuovo'
        ) : (
          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        )}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed
          ? `Premi di nuovo per ${consequence}`
          : wasArmed
            ? 'Eliminazione annullata'
            : ''}
      </span>
    </>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

interface MovementRowProps {
  transaction: AssetTransaction;
  currency: string;
  effect: LedgerTransactionEffect | undefined;
  isDemo: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function MovementTableRow({
  transaction,
  currency,
  effect,
  isDemo,
  onEdit,
  onDelete,
}: MovementRowProps) {
  const isBaseline = transaction.isBaseline === true;
  const realized = transaction.type === 'sell' ? effect?.realizedPnlEur : undefined;

  return (
    <tr className="border-b border-border last:border-b-0">
      <th scope="row" className="py-2.5 text-left font-mono text-[13px] font-normal tabular-nums">
        {formatDate(transaction.date)}
      </th>
      <td className="py-2.5">
        <TypeChip type={transaction.type} isBaseline={isBaseline} />
      </td>
      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums">
        {formatQty(transaction.quantity)}
      </td>
      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums">
        {formatCurrency(transaction.pricePerUnit, currency, 4)}
      </td>
      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums">
        {cachedFormatCurrencyEUR(transaction.quantity * transaction.priceEur)}
      </td>
      <td
        className={cn(
          'py-2.5 text-right font-mono text-[13px] tabular-nums',
          realized === undefined ? 'text-muted-foreground' : signToneClass(realized),
        )}
      >
        {realized === undefined ? '—' : formatSignedEur(realized)}
      </td>
      <td className="whitespace-nowrap py-2.5 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
          disabled={isDemo}
          aria-label="Modifica operazione"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        {/* Baseline cannot be deleted — it is the frozen opening position. */}
        {!isBaseline && (
          <DeleteButton transaction={transaction} isDemo={isDemo} onDelete={onDelete} className="ml-1" />
        )}
      </td>
    </tr>
  );
}

function MovementRow({ transaction, currency, effect, isDemo, onEdit, onDelete }: MovementRowProps) {
  const isBaseline = transaction.isBaseline === true;
  const fees = transaction.fees;
  const gross = transaction.quantity * transaction.priceEur;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDate(transaction.date)}
          </span>
          <TypeChip type={transaction.type} isBaseline={isBaseline} />
        </div>
        <p className="font-mono text-sm tabular-nums text-foreground">
          {formatQty(transaction.quantity)} × {formatCurrency(transaction.pricePerUnit, currency, 4)}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>Totale {cachedFormatCurrencyEUR(gross)}</span>
          {fees !== undefined && fees > 0 && <span>Commissioni {cachedFormatCurrencyEUR(fees)}</span>}
          {transaction.type === 'sell' && effect?.realizedPnlEur !== undefined && (
            <span className={cn('font-medium', signToneClass(effect.realizedPnlEur))}>
              P&L {formatSignedEur(effect.realizedPnlEur)}
              {effect.soldCostBasisEur !== undefined && effect.soldCostBasisEur > EPSILON && (
                <> {formatSignedPct((effect.realizedPnlEur / effect.soldCostBasisEur) * 100)}</>
              )}
            </span>
          )}
          {transaction.type === 'sell' && effect?.averageCostEurAtTrade !== undefined && (
            <span>PMC {cachedFormatCurrencyEUR(effect.averageCostEurAtTrade)}</span>
          )}
        </div>
        {transaction.note && (
          <p className="truncate text-xs italic text-muted-foreground">{transaction.note}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={onEdit}
          disabled={isDemo}
          aria-label="Modifica operazione"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        {!isBaseline && (
          <DeleteButton transaction={transaction} isDemo={isDemo} onDelete={onDelete} className="h-11 w-11" />
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
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <span className={cn(TILE_SUB_EYEBROW_CLASS, 'truncate')}>{label}</span>
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Informazioni su ${label}`}
              >
                <Info className="h-3 w-3" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs leading-relaxed">{info}</PopoverContent>
          </Popover>
        )}
      </div>
      <p
        className={cn(
          'mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums',
          tone === 'positive'
            ? 'text-positive'
            : tone === 'destructive'
              ? 'text-destructive'
              : 'text-foreground',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function signTone(value: number): Tone {
  if (value > 0) return 'positive';
  if (value < 0) return 'destructive';
  return 'neutral';
}

function signToneClass(value: number): string {
  const resolved = signTone(value);
  if (resolved === 'positive') return 'text-positive';
  if (resolved === 'destructive') return 'text-destructive';
  return 'text-muted-foreground';
}

/** Signed EUR through the app's one formatter — nbsp before the € included. */
function formatSignedEur(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${cachedFormatCurrencyEUR(value)}`;
}

/** Signed percentage for it-IT: the comma is the decimal separator (The Comma Rule). */
function formatSignedPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatPercentageIt(value, 2)}`;
}

/** Compact quantity display (up to 8 decimals for crypto, trailing zeros trimmed). */
function formatQty(value: number): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: 8 });
}
