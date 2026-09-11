/**
 * InflationRateDialog — lets the user announce the inflation datum of an inflation-linked
 * bond's upcoming (provisional) coupon, then recomputes it. ONE dialog for the two mechanisms
 * (`resolveInflationIndexation`):
 *   - BTP Italia (`italia`): the FOI inflation rate of the period, added to the fixed rate;
 *   - BTP€i (`euro`): the indexation coefficient at the payment date, multiplying the real rate.
 *
 * Flow on save:
 *   1. upsert the datum into the asset's bondDetails (announcedInflationRates | indexationCoefficients);
 *   2. persist via updateAssetBondDetails (bondDetails-only — never touches cost basis);
 *   3. re-materialize the upcoming coupon via scheduleNextCoupon (clean upsert).
 *
 * A live preview resolves the coupon with the typed datum so the user can
 * cross-check against the figure announced by the broker / Tesoro before saving.
 */
'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { updateAssetBondDetails } from '@/lib/services/assetService';
import { scheduleNextCoupon } from '@/lib/services/couponScheduling';
import {
  buildCouponNote,
  couponFrequencyLabel,
  resolveCoupon,
  resolveInflationIndexation,
  upsertAnnouncedInflationRate,
  upsertIndexationCoefficient,
} from '@/lib/utils/couponUtils';
import { toDate } from '@/lib/utils/dateHelpers';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { Dividend } from '@/types/dividend';
import { Asset, BondDetails } from '@/types/assets';

interface InflationRateDialogProps {
  open: boolean;
  coupon: Dividend | null;
  asset: Asset | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/** The words of each mechanism: what is asked, how it is explained, what the reading promises. */
const MECHANISM_COPY = {
  italia: {
    title: 'Tasso di inflazione della cedola',
    reading:
      'Il coefficiente FOI trasforma la cedola provvisoria nell’incasso definitivo: da qui in poi il pagamento smette di essere un minimo.',
    label: "Tasso d'inflazione FOI del periodo (%)",
    step: '0.01',
    placeholder: 'es. 1.30',
    help: (freqLabel: string) =>
      `Inflazione FOI riferita al periodo della cedola${freqLabel ? ` (${freqLabel})` : ''}, come comunicata dal MEF/Tesoro o dalla tua banca poco prima dello stacco. In deflazione inserisci 0 (il tasso fisso resta garantito).`,
    invalid: 'Inserisci un tasso valido',
    saved: 'Cedola aggiornata con il tasso di inflazione',
  },
  euro: {
    title: 'Coefficiente di indicizzazione della cedola',
    reading:
      'Il coefficiente alla data di stacco trasforma la cedola provvisoria nell’incasso definitivo: finora era calcolata all’ultimo coefficiente noto.',
    label: 'Coefficiente di indicizzazione alla data di stacco',
    step: '0.00001',
    placeholder: 'es. 1.23456',
    help: () =>
      'Il coefficiente HICP del BTP€i alla data di pagamento, dalla tabella giornaliera del MEF o dalla tua banca. Vale anche come ultimo coefficiente noto per il valore in euro della posizione.',
    invalid: 'Inserisci un coefficiente maggiore di zero',
    saved: 'Cedola aggiornata con il coefficiente di indicizzazione',
  },
} as const;

/** A coefficient must be positive; a FOI rate may be 0 or negative (floored by resolveCoupon). */
function parseAnnouncement(raw: string, mechanism: keyof typeof MECHANISM_COPY): number | null {
  const parsed = parseFloat(raw.replace(',', '.'));
  if (isNaN(parsed)) return null;
  if (mechanism === 'euro' && parsed <= 0) return null;
  return parsed;
}

/** The bond details with the typed datum applied — the same function feeds the preview and the save. */
function applyAnnouncement(bondDetails: BondDetails, couponDate: Date, value: number): BondDetails {
  return resolveInflationIndexation(bondDetails) === 'euro'
    ? { ...bondDetails, indexationCoefficients: upsertIndexationCoefficient(bondDetails.indexationCoefficients, couponDate, value) }
    : { ...bondDetails, announcedInflationRates: upsertAnnouncedInflationRate(bondDetails.announcedInflationRates, couponDate, value) };
}

export function InflationRateDialog({ open, coupon, asset, onClose, onSaved }: InflationRateDialogProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset the input on each open and on a change of coupon (dialog form-reset convention).
  // Done while rendering, before anything reads the input — the React "adjust state when a
  // prop changes" pattern — because the same reset inside an effect is banned by
  // react-hooks/set-state-in-effect and would paint one frame with the previous rate.
  const [prevSubject, setPrevSubject] = useState({ open, couponId: coupon?.id });
  if (prevSubject.open !== open || prevSubject.couponId !== coupon?.id) {
    setPrevSubject({ open, couponId: coupon?.id });
    if (open) setRateInput('');
  }

  const bondDetails = asset?.bondDetails;
  const mechanism = bondDetails ? (resolveInflationIndexation(bondDetails) ?? 'italia') : 'italia';
  const copy = MECHANISM_COPY[mechanism];
  const couponDate = coupon ? toDate(coupon.paymentDate) : null;
  const quantity = asset?.quantity ?? coupon?.quantity ?? 0;
  const freqLabel = bondDetails ? couponFrequencyLabel(bondDetails.couponFrequency) : '';

  // Live preview: resolve the coupon with the typed datum.
  const preview = useMemo(() => {
    if (!bondDetails || !couponDate) return null;
    const parsed = parseAnnouncement(rateInput, mechanism);
    if (parsed === null) return null;
    const nominalValue = bondDetails.nominalValue ?? 1;
    const resolved = resolveCoupon(couponDate, applyAnnouncement(bondDetails, couponDate, parsed), nominalValue);
    return { note: buildCouponNote(resolved, bondDetails.couponFrequency), gross: resolved.perShare * quantity };
  }, [bondDetails, couponDate, rateInput, quantity, mechanism]);

  const handleSave = async () => {
    if (!asset?.bondDetails || !couponDate || !user || !ownerId || isDemo) return;
    const parsed = parseAnnouncement(rateInput, mechanism);
    if (parsed === null) {
      toast.error(copy.invalid);
      return;
    }
    try {
      setSaving(true);
      const newBondDetails = applyAnnouncement(asset.bondDetails, couponDate, parsed);
      // Persist the datum on the bond, then re-materialize the upcoming coupon as final.
      await updateAssetBondDetails(asset.id, newBondDetails);
      await scheduleNextCoupon({
        assetId: asset.id,
        bondDetails: newBondDetails,
        quantity: asset.quantity,
        currency: asset.currency,
        taxRate: asset.taxRate,
        userId: ownerId,
      });
      toast.success(copy.saved);
      await onSaved();
      onClose();
    } catch (error) {
      console.error('Error setting inflation datum:', error);
      toast.error("Errore nell'aggiornamento della cedola");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow={
        coupon
          ? `Dividendi · ${coupon.assetTicker}${couponDate ? ` · Stacco ${formatDate(couponDate)}` : ''}`
          : 'Dividendi · Cedola provvisoria'
      }
      title={copy.title}
      reading={isDemo ? 'In modalità demo le cedole sono di sola lettura.' : copy.reading}
      width="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          {/* The demo state is said in the reading line above, not in a `title`: a tooltip added
              by a state change never opens on touch and is ignored by screen readers. */}
          <Button
            onClick={handleSave}
            disabled={saving || !user || !asset || isDemo}
            aria-label={isDemo ? 'Non disponibile in modalità demo' : undefined}
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
          <Label htmlFor="inflationRate">{copy.label}</Label>
          <Input
            id="inflationRate"
            type="number"
            step={copy.step}
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder={copy.placeholder}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{copy.help(freqLabel)}</p>
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
