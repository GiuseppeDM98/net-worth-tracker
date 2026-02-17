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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { Calculator } from 'lucide-react';

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

  // Reset inputs when modal opens or closes
  useEffect(() => {
    if (open) {
      setQuantityInput('');
      setTargetValueInput('');
      setInputMode('quantity');
    }
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calcolatore Plusvalenze - {asset.name}
          </DialogTitle>
          <DialogDescription>
            Simula l&apos;impatto fiscale della vendita di una parte delle tue posizioni
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Asset Info */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Ticker:</span>{' '}
                <span className="font-medium">{asset.ticker}</span>
              </div>
              <div>
                <span className="text-gray-600">Quantità posseduta:</span>{' '}
                <span className="font-medium">{formatNumber(asset.quantity, 4)}</span>
              </div>
              <div>
                <span className="text-gray-600">Prezzo corrente:</span>{' '}
                <span className="font-medium">{formatCurrency(asset.currentPrice, asset.currency, 4)}</span>
              </div>
              <div>
                <span className="text-gray-600">PMC:</span>{' '}
                <span className="font-medium">{formatCurrency(asset.averageCost || 0, asset.currency, 4)}</span>
              </div>
              <div>
                <span className="text-gray-600">Aliquota fiscale:</span>{' '}
                <span className="font-medium">{asset.taxRate || 0}%</span>
              </div>
            </div>
          </div>

          {/* Input Mode Selection */}
          <div className="space-y-2">
            <Label>Modalità di calcolo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={inputMode === 'quantity' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setInputMode('quantity')}
              >
                Per Quantità
              </Button>
              <Button
                type="button"
                variant={inputMode === 'targetValue' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setInputMode('targetValue')}
              >
                Per Valore Target
              </Button>
            </div>
          </div>

          {/* Input Fields */}
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
              />
              {results.exceedsOwned && hasInput && (
                <p className="text-sm text-red-500">
                  ⚠️ La quantità inserita ({formatNumber(results.originalQuantity, 4)}) supera quella posseduta ({formatNumber(asset.quantity, 4)}). Il calcolo è limitato alla quantità disponibile.
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
              />
              {results.exceedsOwned && hasInput && (
                <p className="text-sm text-red-500">
                  ⚠️ Il valore target richiede la vendita di {formatNumber(results.originalQuantity, 4)} unità, ma ne possiedi solo {formatNumber(asset.quantity, 4)}. Il calcolo è limitato alla quantità disponibile.
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {hasInput && (
            <div className="space-y-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold text-lg text-blue-900">Riepilogo Calcolo</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Quantità da vendere</p>
                  <p className="text-lg font-semibold">
                    {formatNumber(results.quantity, 4)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Prezzo per unità</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(results.currentPrice)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Prezzo medio di carico (PMC)</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(results.averageCost, asset.currency, 4)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600">Valore lordo vendita</p>
                  <p className="text-lg font-semibold text-blue-700">
                    {formatCurrency(results.saleValue)}
                  </p>
                </div>
              </div>

              <hr className="border-gray-300" />

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    {results.isGain ? 'Plusvalenza' : results.isLoss ? 'Minusvalenza' : 'Nessun guadagno/perdita'}
                  </p>
                  <p
                    className={`text-xl font-bold ${
                      results.isGain
                        ? 'text-green-600'
                        : results.isLoss
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {results.isGain ? '+' : ''}
                    {formatCurrency(results.gainLoss)}{' '}
                    <span className="text-base">
                      ({results.isGain ? '+' : ''}{formatNumber(results.gainLossPercentage, 2)}%)
                    </span>
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    Tasse dovute ({results.taxRate}%)
                  </p>
                  <p className="text-xl font-bold text-orange-600">
                    {formatCurrency(results.taxes)}
                  </p>
                  {results.isLoss && (
                    <p className="text-xs text-gray-500">
                      Nessuna tassa dovuta in caso di minusvalenza
                    </p>
                  )}
                </div>

                <hr className="border-gray-300" />

                <div className="space-y-1 rounded-lg bg-white p-3">
                  <p className="text-sm text-gray-600 font-medium">
                    Ricavo netto (dopo tasse)
                  </p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(results.netProceeds)}
                  </p>
                </div>
              </div>

              {/* Additional Info */}
              {inputMode === 'targetValue' && hasInput && (
                <div className="rounded-lg bg-blue-100 p-3 text-sm text-blue-800">
                  <p className="font-medium">💡 Informazione utile:</p>
                  <p>
                    Per ottenere {formatCurrency(parseFloat(targetValueInput))} di ricavo netto dopo le tasse,
                    {results.taxes > 0 ? (
                      <> dovresti vendere un valore lordo di circa{' '}
                        <strong>{formatCurrency(parseFloat(targetValueInput) + results.taxes)}</strong>
                      </>
                    ) : (
                      <> il valore lordo coincide con quello netto (nessuna tassa da pagare)</>
                    )}
                  </p>
                </div>
              )}

              {results.isLoss && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <p className="font-medium">⚠️ Nota sulla minusvalenza:</p>
                  <p>
                    Questa vendita genererebbe una minusvalenza di {formatCurrency(Math.abs(results.gainLoss))}.
                    Le minusvalenze possono essere utilizzate per compensare plusvalenze future,
                    riducendo il carico fiscale complessivo.
                  </p>
                </div>
              )}
            </div>
          )}

          {!hasInput && (
            <div className="text-center py-8 text-gray-500">
              Inserisci una quantità o un valore target per vedere il calcolo
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
