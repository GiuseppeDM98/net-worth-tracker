/**
 * InflationRateDialog — lets the user announce the FOI inflation rate for an
 * inflation-linked bond's upcoming (provisional) coupon, then recomputes it.
 *
 * Flow on save:
 *   1. upsert the rate into the asset's bondDetails.announcedInflationRates;
 *   2. persist via updateAssetBondDetails (bondDetails-only — never touches cost basis);
 *   3. re-materialize the upcoming coupon via scheduleNextCoupon (clean upsert).
 *
 * A live preview resolves the coupon with the typed rate so the user can
 * cross-check against the figure announced by the broker / Tesoro before saving.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { updateAssetBondDetails } from '@/lib/services/assetService';
import { scheduleNextCoupon } from '@/lib/services/couponScheduling';
import {
  buildCouponNote,
  couponFrequencyLabel,
  resolveCoupon,
  upsertAnnouncedInflationRate,
} from '@/lib/utils/couponUtils';
import { toDate } from '@/lib/utils/dateHelpers';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';

interface InflationRateDialogProps {
  open: boolean;
  coupon: Dividend | null;
  asset: Asset | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export function InflationRateDialog({ open, coupon, asset, onClose, onSaved }: InflationRateDialogProps) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset the input on each open (dialog form-reset convention).
  useEffect(() => {
    if (open) setRateInput('');
  }, [open, coupon?.id]);

  const bondDetails = asset?.bondDetails;
  const couponDate = coupon ? toDate(coupon.paymentDate) : null;
  const quantity = asset?.quantity ?? coupon?.quantity ?? 0;
  const freqLabel = bondDetails ? couponFrequencyLabel(bondDetails.couponFrequency) : '';

  // Live preview: resolve the coupon with the typed rate.
  const preview = useMemo(() => {
    if (!bondDetails || !couponDate) return null;
    const parsed = parseFloat(rateInput.replace(',', '.'));
    if (isNaN(parsed)) return null;
    const nominalValue = bondDetails.nominalValue ?? 1;
    const previewDetails = {
      ...bondDetails,
      announcedInflationRates: upsertAnnouncedInflationRate(
        bondDetails.announcedInflationRates,
        couponDate,
        parsed
      ),
    };
    const resolved = resolveCoupon(couponDate, previewDetails, nominalValue);
    return { note: buildCouponNote(resolved, bondDetails.couponFrequency), gross: resolved.perShare * quantity };
  }, [bondDetails, couponDate, rateInput, quantity]);

  const handleSave = async () => {
    if (!asset?.bondDetails || !couponDate || !user || isDemo) return;
    const parsed = parseFloat(rateInput.replace(',', '.'));
    if (isNaN(parsed)) {
      toast.error('Inserisci un tasso valido');
      return;
    }
    try {
      setSaving(true);
      const newBondDetails = {
        ...asset.bondDetails,
        announcedInflationRates: upsertAnnouncedInflationRate(
          asset.bondDetails.announcedInflationRates,
          couponDate,
          parsed
        ),
      };
      // Persist the rate on the bond, then re-materialize the upcoming coupon as final.
      await updateAssetBondDetails(asset.id, newBondDetails);
      await scheduleNextCoupon({
        assetId: asset.id,
        bondDetails: newBondDetails,
        quantity: asset.quantity,
        currency: asset.currency,
        taxRate: asset.taxRate,
        userId: user.uid,
      });
      toast.success('Cedola aggiornata con il tasso di inflazione');
      await onSaved();
      onClose();
    } catch (error) {
      console.error('Error setting inflation rate:', error);
      toast.error("Errore nell'aggiornamento della cedola");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Tasso di inflazione cedola"
      description={
        coupon ? `${coupon.assetTicker} - stacco ${couponDate ? formatDate(couponDate) : ''}` : undefined
      }
      dialogClassName="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !user || !asset || isDemo}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          >
            {saving ? 'Salvataggio...' : 'Salva e ricalcola'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {coupon && (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-sm font-medium">{coupon.assetTicker}</p>
            <p className="text-xs text-muted-foreground">
              Stacco {couponDate ? formatDate(couponDate) : '—'}
              {freqLabel && ` · cedola ${freqLabel}`}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="inflationRate">Tasso d&apos;inflazione FOI del periodo (%)</Label>
          <Input
            id="inflationRate"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder="es. 1.30"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Inflazione FOI riferita al periodo della cedola{freqLabel ? ` (${freqLabel})` : ''}, come comunicata dal
            MEF/Tesoro o dalla tua banca poco prima dello stacco. In deflazione inserisci 0 (il tasso fisso resta
            garantito).
          </p>
        </div>

        {preview && (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cedola lorda stimata</span>
              <span className="font-mono font-semibold tabular-nums">{formatCurrency(preview.gross)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{preview.note}</p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
