'use client';

/**
 * «Aggiorna valore» — the monthly overwrite of the fund's value from the statement, ON the page
 * that teaches it (2026-09-13). Until now the page said three times «aggiorna Valore attuale
 * in Patrimonio» and offered no control: the one recurring job of the persona lived elsewhere.
 *
 * The modal is a tile lifted off the page (DESIGN.md → The Modal-Is-A-Tile Rule): eyebrow,
 * the act as the title, the status line as the reading. The reading is where the trap is said —
 * a statement already contains the month's contributions, so they are registered BEFORE the
 * value — with the month's paid-in figure when there is one. Nothing is a contribution here:
 * `updatePensionFundValue` writes only the asset (no record, no transfer, no cash movement).
 *
 * With one fund the picker is not drawn; with several the reading names the chosen one.
 */

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { usePensionContributions, useUpdatePensionFundValue } from '@/lib/hooks/usePensionContributions';
import { calculateAssetValue } from '@/lib/services/assetService';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';
import { isPensionValueStale, resolveLastFundUpdate } from '@/lib/utils/pensionSummary';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { describeModalStatus, describePensionValueCopy, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const valueSchema = z.object({
  assetId: z.string().min(1, 'Seleziona un fondo pensione'),
  value: z.number({ error: 'Inserisci il valore dell’estratto conto' }).min(0, 'Il valore non può essere negativo'),
});

type ValueFormValues = z.infer<typeof valueSchema>;

interface PensionValueDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select a fund; with one fund on the account it is the only one anyway. */
  defaultAssetId?: string;
}

export function PensionValueDialog({ open, onClose, defaultAssetId }: PensionValueDialogProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [] } = useAssets(ownerId);
  const { data: contributions = [] } = usePensionContributions(ownerId, undefined, { enabled: open });
  const updateMutation = useUpdatePensionFundValue(ownerId || '');
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  const funds = useMemo(() => assets.filter((asset) => asset.type === 'pensionFund'), [assets]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ValueFormValues>({
    resolver: zodResolver(valueSchema),
    defaultValues: { assetId: '', value: undefined },
  });

  const watchAssetId = useWatch({ control, name: 'assetId' });
  const fund = funds.find((candidate) => candidate.id === watchAssetId) ?? null;

  // Dialog reset pattern (AGENTS.md): `open` in deps, guard on !open, enumerate every field.
  useEffect(() => {
    if (!open) return;
    const initial = funds.find((candidate) => candidate.id === defaultAssetId) ?? funds[0];
    reset({ assetId: initial?.id ?? '', value: initial ? Math.round(calculateAssetValue(initial) * 100) / 100 : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the funds are read once per opening
  }, [open, defaultAssetId, reset]);

  // The status line resets on opening, derived during render (the TransactionDialog pattern):
  // a setState inside the effect above would cascade a render for a value known before it.
  const [statusOpen, setStatusOpen] = useState(open);
  if (open !== statusOpen) {
    setStatusOpen(open);
    if (open) setStatus({ phase: 'idle' });
  }

  // The month's contributions of the chosen fund: already inside a fresh statement.
  const monthPaidIn = useMemo(() => {
    if (!fund) return 0;
    const now = new Date();
    const currentKey = `${getItalyYear(now)}-${String(getItalyMonth(now)).padStart(2, '0')}`;
    return contributions
      .filter((contribution) => contribution.assetId === fund.id && valueEffectMonth(contribution) === currentKey)
      .reduce((sum, contribution) => sum + Math.abs(contribution.amount), 0);
  }, [fund, contributions]);

  const currentValue = fund ? calculateAssetValue(fund) : 0;
  // The same judgement the hero's footer prints («valore fermo dal …»): one rule, one place.
  const stale = isPensionValueStale(resolveLastFundUpdate(fund ? [fund] : []), new Date());

  const reading = describeModalStatus(
    isSubmitting ? { phase: 'submitting' } : status,
    describePensionValueCopy({ fundName: funds.length > 1 ? fund?.name ?? null : null, currentValue, monthPaidIn, stale }),
  );

  const onSubmit = async (data: ValueFormValues) => {
    setStatus({ phase: 'submitting' });
    try {
      await updateMutation.mutateAsync({ assetId: data.assetId, value: data.value });
      toast.success('Valore del fondo aggiornato');
      onClose();
    } catch (error) {
      console.error('Error updating pension fund value:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const hasFunds = funds.length > 0;
  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        Annulla
      </Button>
      <Button type="submit" form="pension-value-form" disabled={isSubmitting || isDemo || !hasFunds}>
        {isSubmitting ? 'Salvataggio...' : 'Aggiorna'}
      </Button>
    </>
  );

  return (
    <ResponsiveModal open={open} onClose={onClose} eyebrow="Previdenza · Valore" title="Aggiorna il valore del fondo" reading={reading} width="sm" footer={footer}>
      {!hasFunds ? (
        <p className="text-sm text-muted-foreground">Prima crea un asset «Fondo Pensione» in Patrimonio.</p>
      ) : (
        <form id="pension-value-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {funds.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="pv-fund">Fondo</Label>
              <Select
                value={watchAssetId}
                onValueChange={(value) => {
                  const next = funds.find((candidate) => candidate.id === value);
                  setValue('assetId', value);
                  if (next) setValue('value', Math.round(calculateAssetValue(next) * 100) / 100);
                }}
              >
                <SelectTrigger id="pv-fund" aria-label="Fondo pensione" disabled={isDemo} aria-invalid={!!errors.assetId} aria-describedby={errors.assetId ? 'pv-fund-error' : undefined}>
                  <SelectValue placeholder="Seleziona fondo" />
                </SelectTrigger>
                <SelectContent>
                  {funds.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assetId && (
                <p id="pv-fund-error" role="alert" className="text-sm text-destructive">
                  {errors.assetId.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pv-value">Valore dall’estratto conto (€)</Label>
            <Input
              id="pv-value"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              disabled={isDemo}
              aria-invalid={!!errors.value}
              aria-describedby={errors.value ? 'pv-value-error' : 'pv-value-hint'}
              {...register('value', { valueAsNumber: true })}
            />
            {errors.value ? (
              <p id="pv-value-error" role="alert" className="text-sm text-destructive">
                {errors.value.message}
              </p>
            ) : (
              <p id="pv-value-hint" className="text-xs text-muted-foreground">
                Versato più rendimento, come lo riporta il fondo. Sostituisce il valore attuale.
              </p>
            )}
          </div>
        </form>
      )}
    </ResponsiveModal>
  );
}
