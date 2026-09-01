/**
 * Tax Calculator Modal - Capital Gains Tax Simulation
 *
 * Calculates tax impact for selling partial positions in portfolio assets.
 *
 * Teacher Note - Capital Gains Tax Calculation:
 * =============================================
 * 1. Sale Value = quantity × current price
 * 2. Cost Basis = quantity × average cost (PMC - Prezzo Medio di Carico)
 * 3. Gain/Loss = sale value - cost basis
 * 4. Tax = gain × (tax rate ÷ 100)  [ONLY if gain > 0, no tax on losses]
 * 5. Net Proceeds = sale value - tax
 *
 * Example (Gain):
 * - Sell 10 shares at €50 each = €500 sale value
 * - Bought at €30 each = €300 cost basis
 * - Gain = €200
 * - Tax (26%) = €200 × 0.26 = €52
 * - Net proceeds = €500 - €52 = €448
 *
 * Example (Loss):
 * - Sell 10 shares at €20 each = €200 sale value
 * - Bought at €30 each = €300 cost basis
 * - Loss = -€100
 * - Tax = €0 (no tax on losses, can't get refund)
 * - Net proceeds = €200 - €0 = €200
 *
 * Dual Input Modes:
 * - Quantity mode: User enters number of units to sell
 * - Target value mode: User enters desired sale amount, quantity calculated automatically
 *
 * Why quantity clamping?
 * Prevents selling more than owned. If user enters 100 but owns 50, we clamp to 50
 * and show a warning. Better UX than showing confusing errors.
 */
'use client';

import { useState, useEffect } from 'react';
import { Asset } from '@/types/assets';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/services/chartService';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

// The restyle of 2026-08-22 touches presentation only: every figure in the numeric face on the
// type ramp (22px hero, 13px rows), sign and warning colours through the theme tokens, no
// literal palette. The arithmetic above is untouched.
const ROW_LABEL_CLASS = 'text-[13px] text-muted-foreground';
const ROW_VALUE_CLASS = 'font-mono text-[13px] tabular-nums text-foreground';

interface TaxCalculatorModalProps {
  open: boolean;
  onClose: () => void;
  asset: Asset;
}

type InputMode = 'quantity' | 'targetValue';

export function TaxCalculatorModal({ open, onClose, asset }: TaxCalculatorModalProps) {
  const [inputMode, setInputMode] = useState<InputMode>('quantity');
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [targetValueInput, setTargetValueInput] = useState<string>('');

  // Reset the inputs on every open. Deferred with setTimeout(0) (and its cleanup) because a
  // synchronous setState inside an effect is banned by react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setQuantityInput('');
      setTargetValueInput('');
      setInputMode('quantity');
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  /**
   * Calculate tax impact based on input mode
   *
   * Two input paths:
   * 1. Quantity mode: user enters units → calculate sale value
   * 2. Target value mode: user enters desired amount → calculate required units
   */
  const calculateResults = () => {
    let quantity = 0;

    if (inputMode === 'quantity') {
      quantity = parseFloat(quantityInput) || 0;
    } else {
      // Target value mode: reverse calculate quantity from desired sale amount
      const targetValue = parseFloat(targetValueInput) || 0;
      quantity = asset.currentPrice > 0 ? targetValue / asset.currentPrice : 0;
    }

    // Ensure quantity is not negative
    quantity = Math.max(0, quantity);

    // Clamp quantity to prevent selling more than owned
    // Why clamp instead of error? Better UX - user might enter large number by mistake,
    // or target value mode might calculate quantity > owned. Clamping + warning is clearer.
    const exceedsOwned = quantity > asset.quantity;
    const clampedQuantity = Math.min(quantity, asset.quantity);

    const currentPrice = asset.currentPrice;
    const averageCost = asset.averageCost || 0;
    const taxRate = asset.taxRate || 0;

    // Step 1-2: Calculate sale value and cost basis
    const saleValue = clampedQuantity * currentPrice;
    const costBasis = clampedQuantity * averageCost;

    // Step 3: Calculate gain or loss
    const gainLoss = saleValue - costBasis;
    const gainLossPercentage = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

    // Step 4: Calculate tax (ONLY on gains, not losses)
    // Why? You can't get a tax refund for investment losses in most tax systems.
    // Losses can be carried forward to offset future gains, but that's outside this calculator's scope.
    const taxes = gainLoss > 0 ? gainLoss * (taxRate / 100) : 0;

    // Step 5: Calculate net proceeds after tax
    const netProceeds = saleValue - taxes;

    return {
      quantity: clampedQuantity,
      originalQuantity: quantity,
      exceedsOwned,
      currentPrice,
      averageCost,
      taxRate,
      saleValue,
      costBasis,
      gainLoss,
      gainLossPercentage,
      taxes,
      netProceeds,
      isGain: gainLoss > 0,
      isLoss: gainLoss < 0,
    };
  };

  const results = calculateResults();
  const hasInput =
    (inputMode === 'quantity' && parseFloat(quantityInput) > 0) ||
    (inputMode === 'targetValue' && parseFloat(targetValueInput) > 0);

  const signedCurrency = (value: number) => `${value >= 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow={`Patrimonio · ${asset.name}`}
      title="Quanto costa vendere"
      reading="Una simulazione: niente viene registrato. La plusvalenza è calcolata sul PMC del registro operazioni, con l'aliquota dello strumento."
      width="md"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Chiudi
        </Button>
      }
    >
        <div className="space-y-5">
          {/* Asset facts — flat rows, no sub-card */}
          <div className="divide-y divide-border border-y border-border">
            {[
              { label: 'Ticker', value: getAssetDisplayTicker(asset) },
              { label: 'Quantità posseduta', value: formatNumber(asset.quantity, 4) },
              { label: 'Prezzo corrente', value: formatCurrency(asset.currentPrice, asset.currency, 4) },
              { label: 'PMC', value: formatCurrency(asset.averageCost || 0, asset.currency, 4) },
              { label: 'Aliquota fiscale', value: formatPercentage(asset.taxRate || 0, 0) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                <span className={ROW_LABEL_CLASS}>{row.label}</span>
                <span className={ROW_VALUE_CLASS}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Input mode */}
          <div className="space-y-2">
            <Label>Modalità di calcolo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={inputMode === 'quantity' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setInputMode('quantity')}
                aria-pressed={inputMode === 'quantity'}
              >
                Per quantità
              </Button>
              <Button
                type="button"
                variant={inputMode === 'targetValue' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setInputMode('targetValue')}
                aria-pressed={inputMode === 'targetValue'}
              >
                Per valore target
              </Button>
            </div>
          </div>

          {/* Inputs */}
          {inputMode === 'quantity' ? (
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantità da vendere</Label>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                min="0"
                max={asset.quantity}
                placeholder={`es. ${formatNumber(asset.quantity / 2, 4)}`}
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value)}
                className="font-mono tabular-nums"
              />
              {results.exceedsOwned && hasInput && (
                <p className="text-[13px] text-warning-foreground" role="status">
                  La quantità inserita ({formatNumber(results.originalQuantity, 4)}) supera quella posseduta (
                  {formatNumber(asset.quantity, 4)}): il calcolo è limitato alla quantità disponibile.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="targetValue">Valore lordo desiderato (€)</Label>
              <Input
                id="targetValue"
                type="number"
                step="0.01"
                min="0"
                placeholder="es. 10000"
                value={targetValueInput}
                onChange={(e) => setTargetValueInput(e.target.value)}
                className="font-mono tabular-nums"
              />
              {results.exceedsOwned && hasInput && (
                <p className="text-[13px] text-warning-foreground" role="status">
                  Il valore target richiede la vendita di {formatNumber(results.originalQuantity, 4)} unità, ma ne
                  possiedi {formatNumber(asset.quantity, 4)}: il calcolo è limitato alla quantità disponibile.
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {hasInput ? (
            <div className="space-y-4 rounded-xl bg-muted/40 p-4">
              <div className="flex flex-col gap-1.5">
                <p className={TILE_SUB_EYEBROW_CLASS}>Ricavo netto dopo le tasse</p>
                <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
                  {formatCurrency(results.netProceeds)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  su{' '}
                  <span className="font-mono tabular-nums text-foreground">{formatCurrency(results.saleValue)}</span> di
                  valore lordo, <span className="font-mono tabular-nums">{formatNumber(results.quantity, 4)}</span> unità
                </p>
              </div>

              <div className="divide-y divide-border border-t border-border">
                {[
                  { label: 'Prezzo per unità', value: formatCurrency(results.currentPrice, asset.currency, 4) },
                  { label: 'Prezzo medio di carico (PMC)', value: formatCurrency(results.averageCost, asset.currency, 4) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                    <span className={ROW_LABEL_CLASS}>{row.label}</span>
                    <span className={ROW_VALUE_CLASS}>{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className={ROW_LABEL_CLASS}>
                    {results.isGain ? 'Plusvalenza' : results.isLoss ? 'Minusvalenza' : 'Nessun guadagno o perdita'}
                  </span>
                  <span className={cn('font-mono text-[13px] font-semibold tabular-nums', getMetricValueColor(results.gainLoss, 'number'))}>
                    {signedCurrency(results.gainLoss)}{' '}
                    <span className="text-[11px] font-normal">
                      ({results.gainLoss >= 0 ? '+' : '−'}
                      {formatPercentage(Math.abs(results.gainLossPercentage), 2)})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className={ROW_LABEL_CLASS}>Tasse dovute ({formatPercentage(results.taxRate, 0)})</span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-warning-foreground">
                    {formatCurrency(results.taxes)}
                  </span>
                </div>
              </div>

              {inputMode === 'targetValue' && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Per ottenere{' '}
                  <span className="font-mono tabular-nums text-foreground">{formatCurrency(parseFloat(targetValueInput))}</span> di
                  ricavo netto dopo le tasse
                  {results.taxes > 0 ? (
                    <>
                      {' '}
                      dovresti vendere un valore lordo di circa{' '}
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(parseFloat(targetValueInput) + results.taxes)}
                      </span>
                      .
                    </>
                  ) : (
                    <> il valore lordo coincide con quello netto: nessuna tassa da pagare.</>
                  )}
                </p>
              )}

              {results.isLoss && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Nessuna tassa in caso di minusvalenza. Questa vendita ne genererebbe una di{' '}
                  <span className="font-mono tabular-nums text-foreground">{formatCurrency(Math.abs(results.gainLoss))}</span>,
                  utilizzabile per compensare plusvalenze future.
                </p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Inserisci una quantità o un valore target per vedere il calcolo.
            </p>
          )}

        </div>
    </ResponsiveModal>
  );
}
