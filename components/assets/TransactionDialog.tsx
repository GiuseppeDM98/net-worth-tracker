'use client';

/**
 * TransactionDialog — register / edit one trade in the asset ledger (Registro operazioni asset).
 *
 * Phase C UI over the Fase B Admin API. Three operation types share one form:
 *   - Compra  (buy)        → adds units at a price; optional fees + cash settlement.
 *   - Vendi   (sell)       → removes units; shows an ESTIMATED realized P&L preview run through the
 *                            SAME pure engine the server uses (Cross-Component Metric Consistency).
 *   - Rettifica (adjustment) → absolute reset of quantity + PMC (splits, corrections). No fees, no
 *                            settlement, no realized P&L.
 *
 * Correctness notes:
 *   - `priceEur` is server-resolved; the client can only ESTIMATE it via the asset's
 *     current conversion ratio (`currentPriceEur / currentPrice`) — hence "stimato" on the preview.
 *     The authoritative realized figure comes back in the mutation response.
 *   - The success toast fires AFTER the request resolves (toast-after-reconcile rule).
 *   - Bond quotes reuse the SAME `resolveBondPrice` helper AssetDialog uses — never a
 *     re-implementation.
 *   - Baseline trades are locked to quantity/PMC/note edits; the type selector is
 *     disabled in edit mode (changing a trade's type is a delete+recreate, kept out of v1).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import {
  useAssetLedgerMeta,
  useAssetTransactions,
  useCreateAssetTransaction,
  useUpdateAssetTransaction,
} from '@/lib/hooks/useAssetTransactions';
import {
  replayTransactions,
  LedgerValidationError,
} from '@/lib/utils/assetTransactionUtils';
import { resolveBondPrice } from '@/components/assets/AssetDialog';

import { cachedFormatCurrencyEUR, formatCurrency } from '@/lib/utils/formatters';
import {
  describeModalStatus,
  describeTradeIntent,
  describeWriteError,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/assets';
import type {
  AssetTransaction,
  AssetTransactionFormData,
  AssetTransactionType,
} from '@/types/assetTransactions';

// Sentinel for "no settlement account" — a Radix Select item value can never be the empty string.
const NO_SETTLEMENT = '__none__';

const TYPE_OPTIONS: { key: AssetTransactionType; label: string }[] = [
  { key: 'buy', label: 'Compra' },
  { key: 'sell', label: 'Vendi' },
  { key: 'adjustment', label: 'Rettifica' },
];

const transactionSchema = z.object({
  type: z.enum(['buy', 'sell', 'adjustment']),
  date: z.string(),
  // Numeric fields validated in the submit handler (per-type rules), kept permissive here so an
  // empty <input type="number"> (NaN) does not throw a raw zod error before the handler runs —
  // mirrors AssetDialog's `.or(z.nan())` convention.
  quantity: z.number().optional().or(z.nan()),
  pricePerUnit: z.number().optional().or(z.nan()),
  fees: z.number().min(0, 'Le commissioni non possono essere negative').optional().or(z.nan()),
  linkedCashAssetId: z.string(),
  note: z.string().max(500, 'Massimo 500 caratteri').optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface TransactionDialogProps {
  open: boolean;
  onClose: () => void;
  asset: Asset;
  /** Present = edit mode (same field-visibility logic as create). */
  transaction?: AssetTransaction | null;
}

/**
 * Estimate a trade's per-unit EUR price for the CLIENT-SIDE preview only. The server resolves the
 * authoritative value from historical FX; here we scale the native price by the asset's
 * current conversion ratio. GBp is normalized to GBP first, mirroring `calculateAssetValue`.
 */
function estimateTradePriceEur(asset: Asset, pricePerUnitNative: number): number {
  const currency = (asset.currency || 'EUR').toUpperCase();
  if (currency === 'EUR') return pricePerUnitNative;

  // currentPrice may be in pence for GBp listings — divide by 100 before taking the ratio.
  const nativeCurrent = asset.currency === 'GBp' ? asset.currentPrice / 100 : asset.currentPrice;
  if (asset.currentPriceEur && asset.currentPriceEur > 0 && nativeCurrent > 0) {
    return pricePerUnitNative * (asset.currentPriceEur / nativeCurrent);
  }
  // Last resort: no conversion available — the server will correct it. Same pre-migration FX
  // caveat already documented for `calculateUnrealizedGains`.
  return pricePerUnitNative;
}

export function TransactionDialog({ open, onClose, asset, transaction }: TransactionDialogProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const reducedMotion = useReducedMotion();
  const layoutId = useId();
  const isEdit = !!transaction;
  const isBaseline = transaction?.isBaseline === true;

  const { data: ledgerMeta } = useAssetLedgerMeta(ownerId);
  const { data: allAssets = [] } = useAssets(ownerId);
  const { data: existingTransactions = [] } = useAssetTransactions(ownerId, asset.id, {
    enabled: open,
  });

  const createMutation = useCreateAssetTransaction(ownerId || '');
  const updateMutation = useUpdateAssetTransaction(ownerId || '');
  // The modal's reading IS the status line, so a failure lands there and not in a paragraph of
  // its own at the bottom of the form (DESIGN.md → The Status-Is-The-Reading Rule).
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  // Cash accounts eligible as a settlement target.
  const cashAssets = useMemo(
    () => allAssets.filter((a) => a.type === 'cash' && a.assetClass === 'cash'),
    [allAssets]
  );

  // Bond % of par ↔ EUR conversion (same conditions as AssetDialog): ISIN present AND nominal > 1.
  const isBondWithIsin =
    asset.type === 'bond' && asset.assetClass === 'bonds' && !!asset.isin?.trim();
  const bondNominal = asset.bondDetails?.nominalValue;
  const isBondPctMode = isBondWithIsin && (bondNominal ?? 0) > 1;

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const baselineIso = useMemo(
    () => (ledgerMeta ? ledgerMeta.baselineDate.toISOString().split('T')[0] : undefined),
    [ledgerMeta]
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'buy',
      date: todayIso,
      quantity: undefined,
      pricePerUnit: undefined,
      fees: undefined,
      linkedCashAssetId: NO_SETTLEMENT,
      note: '',
    },
  });

  const type = useWatch({ control, name: 'type' });
  const quantity = useWatch({ control, name: 'quantity' });
  const pricePerUnit = useWatch({ control, name: 'pricePerUnit' });
  const fees = useWatch({ control, name: 'fees' });
  const linkedCashAssetId = useWatch({ control, name: 'linkedCashAssetId' });

  // Reset on open (Dialog Form Reset Pattern): include `open` in deps + `if (!open) return`, and
  // enumerate EVERY field in the new-record branch so stale values never carry across opens.
  useEffect(() => {
    if (!open) return;
    setStatus({ phase: 'idle' });
    if (transaction) {
      const toBI = (eurVal: number) =>
        isBondPctMode && bondNominal ? eurVal / (bondNominal / 100) : eurVal;
      reset({
        type: transaction.type,
        date: transaction.date.toISOString().split('T')[0],
        quantity: transaction.quantity,
        pricePerUnit: toBI(transaction.pricePerUnit),
        fees: transaction.fees,
        linkedCashAssetId: transaction.linkedCashAssetId ?? NO_SETTLEMENT,
        note: transaction.note ?? '',
      });
    } else {
      reset({
        type: 'buy',
        date: todayIso,
        quantity: undefined,
        pricePerUnit: undefined,
        fees: undefined,
        linkedCashAssetId: NO_SETTLEMENT,
        note: '',
      });
    }
  }, [open, transaction, reset, todayIso, isBondPctMode, bondNominal]);

  const isAdjustment = type === 'adjustment';
  const heldQuantity = asset.quantity;

  // Native price the engine sees (bond BI quote → EUR-per-unit; everything else passthrough).
  const resolvedPricePerUnit = useMemo(() => {
    if (pricePerUnit === undefined || isNaN(pricePerUnit)) return undefined;
    return resolveBondPrice(pricePerUnit, bondNominal, isBondWithIsin);
  }, [pricePerUnit, bondNominal, isBondWithIsin]);

  // Live EUR figures for the summary (estimated for non-EUR assets — server resolves the real FX).
  const currency = asset.currency || 'EUR';
  const isEur = currency.toUpperCase() === 'EUR';
  const feesEur = fees && !isNaN(fees) && fees > 0 ? fees : 0;

  const summary = useMemo(() => {
    if (resolvedPricePerUnit === undefined || quantity === undefined || isNaN(quantity) || quantity <= 0) {
      return null;
    }
    const priceEur = estimateTradePriceEur(asset, resolvedPricePerUnit);
    const gross = quantity * priceEur;
    if (type === 'buy') return { totalEur: gross + feesEur };
    if (type === 'sell') return { totalEur: gross - feesEur };
    return { totalEur: gross }; // adjustment: new position value at the new PMC
  }, [resolvedPricePerUnit, quantity, feesEur, type, asset]);

  // Estimated realized P&L for a sell: replay the SAME engine on the prospective sequence and take
  // the marginal realized versus the current sequence (delta of cumulative realized). Reuses the one
  // engine so the preview always agrees with the server figure (up to the estimated FX).
  const realizedPreview = useMemo((): { value: number } | { error: string } | null => {
    if (type !== 'sell') return null;
    if (resolvedPricePerUnit === undefined || quantity === undefined || isNaN(quantity) || quantity <= 0) {
      return null;
    }
    const priceEur = estimateTradePriceEur(asset, resolvedPricePerUnit);
    const draft: AssetTransaction = {
      id: transaction?.id ?? '__draft__',
      userId: ownerId || '',
      assetId: asset.id,
      type: 'sell',
      date: new Date(),
      quantity,
      pricePerUnit: resolvedPricePerUnit,
      priceEur,
      fees: feesEur > 0 ? feesEur : undefined,
      isBaseline: false,
      createdAt: transaction?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    // Exclude the edited trade so an edit re-prices against the rest of the history.
    const base = existingTransactions.filter((t) => t.id !== transaction?.id);
    try {
      const withDraft = replayTransactions([...base, draft]).realizedPnlEur;
      const without = replayTransactions(base).realizedPnlEur;
      return { value: withDraft - without };
    } catch (error) {
      if (error instanceof LedgerValidationError) return { error: error.userMessage };
      return { error: 'Sequenza non valida.' };
    }
  }, [type, resolvedPricePerUnit, quantity, feesEur, asset, existingTransactions, transaction, ownerId]);

  const onSubmit = async (data: TransactionFormValues) => {
    if (isDemo || !ownerId) return;

    if (!data.date) {
      setStatus({ phase: 'error', message: 'Serve una data per registrare l’operazione.' });
      return;
    }
    const qty = data.quantity;
    if (qty === undefined || isNaN(qty) || qty < 0) {
      setStatus({ phase: 'error', message: 'La quantità non è un numero valido.' });
      return;
    }
    if (data.type !== 'adjustment' && qty <= 0) {
      setStatus({ phase: 'error', message: 'La quantità deve essere maggiore di zero.' });
      return;
    }
    const rawPrice = data.pricePerUnit;
    if (rawPrice === undefined || isNaN(rawPrice) || rawPrice < 0) {
      setStatus({ phase: 'error', message: 'Il prezzo non è un numero valido.' });
      return;
    }

    setStatus({ phase: 'submitting' });
    const price = resolveBondPrice(rawPrice, bondNominal, isBondWithIsin);
    const settlement =
      data.linkedCashAssetId && data.linkedCashAssetId !== NO_SETTLEMENT
        ? data.linkedCashAssetId
        : undefined;
    const noteValue = data.note?.trim() ? data.note.trim() : undefined;
    const feeValue = data.fees && !isNaN(data.fees) && data.fees > 0 ? data.fees : undefined;

    try {
      if (transaction) {
        // Edit. Baseline trades accept only quantity/pricePerUnit/note (server enforces it too).
        const updates: Partial<AssetTransactionFormData> = isBaseline
          ? { quantity: qty, pricePerUnit: price, note: noteValue }
          : {
              date: new Date(data.date),
              quantity: qty,
              pricePerUnit: price,
              ...(data.type === 'adjustment' ? {} : { fees: feeValue, linkedCashAssetId: settlement }),
              note: noteValue,
            };
        const result = await updateMutation.mutateAsync({ transactionId: transaction.id, updates });
        toast.success(
          result.realizedPnlEur !== undefined
            ? `Operazione aggiornata · P&L realizzato ${formatSignedEur(result.realizedPnlEur)}`
            : 'Operazione aggiornata'
        );
      } else {
        const formData: AssetTransactionFormData = {
          assetId: asset.id,
          type: data.type,
          date: new Date(data.date),
          quantity: qty,
          pricePerUnit: price,
          ...(data.type === 'adjustment' ? {} : { fees: feeValue, linkedCashAssetId: settlement }),
          note: noteValue,
        };
        const result = await createMutation.mutateAsync(formData);
        toast.success(
          result.realizedPnlEur !== undefined
            ? `Operazione registrata · P&L realizzato ${formatSignedEur(result.realizedPnlEur)}`
            : 'Operazione registrata'
        );
      }
      onClose();
    } catch (error) {
      // A 422 body carries the server's own Italian, marked user-facing by the service; anything
      // else is translated rather than shown, so an SDK string never reaches the reader.
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const priceLabel = isBondPctMode
    ? 'Prezzo (quotazione Borsa Italiana)'
    : isAdjustment
      ? `Nuovo PMC (${currency})`
      : `Prezzo per unità (${currency})`;

  const submitting = createMutation.isPending || updateMutation.isPending;
  const formId = 'transaction-form';

  // The reading: what this operation does while idle, what is happening while it saves, and why
  // it failed if it did. One sentence, in the one place the reader is already looking.
  const reading = describeModalStatus(submitting ? { phase: 'submitting' } : status, {
    idle: describeTradeIntent({
      type,
      isBaseline,
      hasSettlement: linkedCashAssetId !== NO_SETTLEMENT,
      isDemo,
    }),
    submitting:
      type === 'sell'
        ? 'Sto registrando la vendita e aggiornando la posizione.'
        : 'Sto registrando l’operazione e aggiornando la posizione.',
  });

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Annulla
      </Button>
      <Button
        type="submit"
        form={formId}
        disabled={isDemo || submitting}
        aria-label={isDemo ? 'Non disponibile in modalità demo' : undefined}
      >
        {submitting ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Registra operazione'}
      </Button>
    </>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow={`Registro operazioni · ${asset.name}`}
      title={isEdit ? 'Modifica operazione' : 'Registra operazione'}
      reading={reading}
      width="md"
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Type selector — segmented pill (DESIGN.md Variant B). Disabled in edit; locked for baseline. */}
        <div
          role="radiogroup"
          aria-label="Tipo di operazione"
          className={cn(
            'flex items-center gap-1 rounded-lg bg-muted p-1',
            isEdit && 'opacity-60'
          )}
        >
          {TYPE_OPTIONS.map((option) => {
            const isActive = type === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={isEdit}
                onClick={() => setValue('type', option.key)}
                className={cn(
                  'relative flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId={`trade-type-pill-${layoutId}`}
                    className="absolute inset-0 rounded-md bg-background shadow-sm"
                    transition={
                      reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }
                    }
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>

        {isBaseline && (
          <p className="text-xs text-muted-foreground">
            Posizione iniziale: puoi modificarne solo quantità, prezzo e nota.
          </p>
        )}

        {/* Data — hidden for baseline (its date is locked to the migration day). */}
        {!isBaseline && (
          <div className="space-y-2">
            <Label htmlFor="trade-date">Data</Label>
            <Input
              id="trade-date"
              type="date"
              min={baselineIso}
              max={todayIso}
              {...register('date')}
            />
            {baselineIso && (
              <p className="text-xs text-muted-foreground">
                Le operazioni partono dal {ledgerMeta ? formatItDate(ledgerMeta.baselineDate) : ''}{' '}
                (inizio del registro).
              </p>
            )}
          </div>
        )}

        {/* Quantità */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="trade-quantity">
              {isAdjustment ? 'Nuova quantità' : 'Quantità'}
            </Label>
            {type === 'sell' && heldQuantity > 0 && (
              <button
                type="button"
                onClick={() => setValue('quantity', heldQuantity)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Vendi tutto ({formatQty(heldQuantity)})
              </button>
            )}
          </div>
          <Input
            id="trade-quantity"
            type="number"
            step="0.00000001"
            min="0"
            placeholder={isAdjustment ? 'es. 10' : 'es. 5'}
            {...register('quantity', { valueAsNumber: true })}
          />
          {type === 'sell' && (
            <p className="text-xs text-muted-foreground">
              Quantità posseduta: {formatQty(heldQuantity)}
            </p>
          )}
          {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
        </div>

        {/* Prezzo / Nuovo PMC */}
        <div className="space-y-2">
          <Label htmlFor="trade-price">{priceLabel}</Label>
          <Input
            id="trade-price"
            type="number"
            step="0.0001"
            min="0"
            placeholder={isBondPctMode ? 'es. 100 (quotazione Borsa Italiana)' : 'es. 85.1234'}
            {...register('pricePerUnit', { valueAsNumber: true })}
          />
          {isBondPctMode && resolvedPricePerUnit !== undefined && (
            <p className="text-xs font-medium text-primary">
              ≈ {formatCurrency(resolvedPricePerUnit)} per unità
            </p>
          )}
          {errors.pricePerUnit && (
            <p className="text-sm text-destructive">{errors.pricePerUnit.message}</p>
          )}
        </div>

        {/* Commissioni + Conto di regolamento — buy/sell only, and never for a baseline (its editable
            fields are limited to quantity/PMC/note). */}
        {!isAdjustment && !isBaseline && (
          <>
            <div className="space-y-2">
              <Label htmlFor="trade-fees">Commissioni (€)</Label>
              <Input
                id="trade-fees"
                type="number"
                step="0.01"
                min="0"
                placeholder="es. 1.00"
                {...register('fees', { valueAsNumber: true })}
              />
              {errors.fees && <p className="text-sm text-destructive">{errors.fees.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="trade-settlement">Conto di regolamento</Label>
              <Select
                value={linkedCashAssetId ?? NO_SETTLEMENT}
                onValueChange={(value) => setValue('linkedCashAssetId', value)}
              >
                <SelectTrigger id="trade-settlement" aria-label="Conto di regolamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SETTLEMENT}>Nessuno</SelectItem>
                  {cashAssets.map((cash) => (
                    <SelectItem key={cash.id} value={cash.id}>
                      {cash.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se selezionato, il saldo del conto viene aggiornato automaticamente.
              </p>
            </div>
          </>
        )}

        {isAdjustment && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Imposta la posizione da questa data: per split, correzioni o strumenti valorizzati a
            versamento. Nessuna plusvalenza realizzata.
          </p>
        )}

        {/* Note */}
        <div className="space-y-2">
          <Label htmlFor="trade-note">Note</Label>
          <Textarea
            id="trade-note"
            rows={2}
            placeholder="Facoltativo"
            {...register('note')}
          />
          {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
        </div>

        {/* What the save will do — a sub-tile on the muted surface, at the tile's cadence. */}
        {summary && (
          <div className="space-y-1 rounded-xl bg-muted p-3.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>Cosa succede al salvataggio</p>
            <div className="flex items-baseline justify-between gap-3 pt-1.5 text-sm">
              <span className="text-muted-foreground">
                {isEur ? 'Totale' : 'Totale stimato'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(summary.totalEur)}
              </span>
            </div>
            {type === 'sell' && realizedPreview && 'value' in realizedPreview && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">P&L realizzato stimato</span>
                <span
                  className={cn(
                    'font-mono font-semibold tabular-nums',
                    realizedPreview.value > 0
                      ? 'text-positive'
                      : realizedPreview.value < 0
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  )}
                >
                  {formatSignedEur(realizedPreview.value)}
                </span>
              </div>
            )}
            {type === 'sell' && realizedPreview && 'error' in realizedPreview && (
              <p className="text-xs text-destructive">{realizedPreview.error}</p>
            )}
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}

// ── Local formatting helpers ────────────────────────────────────────────────

/** Signed EUR, e.g. "+1.234,56 €" / "−89,00 €" — sign always explicit for P&L figures. */
function formatSignedEur(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${cachedFormatCurrencyEUR(value)}`;
}

/** Compact quantity display (up to 8 decimals for crypto, trailing zeros trimmed). */
function formatQty(value: number): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: 8 });
}

/** DD/MM/YYYY without pulling date-fns into this module. */
function formatItDate(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
