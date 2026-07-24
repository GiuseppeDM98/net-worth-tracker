'use client';

/**
 * PensionContributionDialog — "Registra versamento" flow (spec 2-pension-fund/04 §2).
 *
 * Records a contribution into the dedicated `pensionContributions` collection (never as an Expense
 * of consumption — invariant #1). Nature carries an inline micro-education note at the point of
 * entry: TFR/datoriale never leave the user's account, volontario does (modelled as a transfer, so
 * the "conto di provenienza" selector only appears for that nature).
 */

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { useRecordPensionContribution } from '@/lib/hooks/usePensionContributions';
import type { ContributionSource } from '@/types/pension';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
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
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

const NATURE_OPTIONS: { value: ContributionSource; label: string; hint: string }[] = [
  {
    value: 'voluntary',
    label: 'Volontario',
    hint: 'Deducibile IRPEF entro il tetto annuo. Esce dal conto scelto sotto, come un trasferimento.',
  },
  {
    value: 'employer',
    label: 'Datoriale',
    hint: 'Quota versata dal datore di lavoro: deducibile IRPEF, non transita dal tuo conto.',
  },
  {
    value: 'tfr',
    label: 'TFR',
    hint: 'Trattamento di fine rapporto conferito al fondo: NON deducibile, non transita dal tuo conto.',
  },
];

const contributionSchema = z
  .object({
    assetId: z.string().min(1, 'Seleziona un fondo pensione'),
    source: z.enum(['tfr', 'voluntary', 'employer']),
    amount: z.number().positive('Inserisci un importo maggiore di zero'),
    date: z.string().min(1, 'Inserisci una data'),
    taxYear: z.number().int(),
    sourceCashAssetId: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.source === 'voluntary' && (!data.sourceCashAssetId || data.sourceCashAssetId === '__none__')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seleziona il conto di provenienza per il versamento volontario',
        path: ['sourceCashAssetId'],
      });
    }
  });

type ContributionFormValues = z.infer<typeof contributionSchema>;

interface PensionContributionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select a fund, e.g. when opened from a specific fund's context. */
  defaultAssetId?: string;
}

export function PensionContributionDialog({ open, onClose, defaultAssetId }: PensionContributionDialogProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { data: assets = [] } = useAssets(ownerId);
  const recordMutation = useRecordPensionContribution(ownerId || '');

  const funds = assets.filter((a) => a.type === 'pensionFund');
  const cashAccounts = assets.filter((a) => a.assetClass === 'cash');
  const todayIso = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      assetId: '',
      source: 'voluntary',
      amount: undefined,
      date: todayIso,
      taxYear: new Date().getFullYear(),
      sourceCashAssetId: '__none__',
      notes: '',
    },
  });

  const watchSource = useWatch({ control, name: 'source' });
  const watchAssetId = useWatch({ control, name: 'assetId' });
  const watchSourceCashAssetId = useWatch({ control, name: 'sourceCashAssetId' });

  // Dialog reset pattern (AGENTS.md): `open` in deps, guard on !open, enumerate every field.
  useEffect(() => {
    if (!open) return;
    reset({
      assetId: defaultAssetId ?? funds[0]?.id ?? '',
      source: 'voluntary',
      amount: undefined,
      date: todayIso,
      taxYear: new Date().getFullYear(),
      sourceCashAssetId: cashAccounts[0]?.id ?? '__none__',
      notes: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAssetId, reset]);

  const onSubmit = async (data: ContributionFormValues) => {
    try {
      await recordMutation.mutateAsync({
        assetId: data.assetId,
        source: data.source,
        amount: data.amount,
        date: new Date(data.date),
        taxYear: data.taxYear,
        notes: data.notes?.trim() || undefined,
        sourceCashAssetId:
          data.source === 'voluntary' && data.sourceCashAssetId !== '__none__'
            ? data.sourceCashAssetId
            : undefined,
      });
      toast.success('Versamento registrato');
      onClose();
    } catch (error) {
      console.error('Error recording pension contribution:', error);
      const message = error instanceof Error ? error.message : 'Errore nella registrazione del versamento';
      toast.error(message);
    }
  };

  const hasFunds = funds.length > 0;
  const selectedNature = NATURE_OPTIONS.find((o) => o.value === watchSource);

  const footer = isMobile ? (
    <>
      <Button type="submit" form="pension-contribution-form" disabled={isSubmitting || isDemo || !hasFunds} className="w-full">
        {isSubmitting ? 'Salvataggio...' : 'Registra'}
      </Button>
      <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={onClose}>
        Annulla
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        Annulla
      </Button>
      <Button type="submit" form="pension-contribution-form" disabled={isSubmitting || isDemo || !hasFunds}>
        {isSubmitting ? 'Salvataggio...' : 'Registra'}
      </Button>
    </>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Registra versamento"
      description="Aggiungi un versamento al fondo pensione: fondo, natura, importo, data e anno fiscale."
      dialogClassName="max-w-md"
      footer={footer}
    >
      {!hasFunds ? (
        <p className="text-sm text-muted-foreground">
          Prima crea un asset «Fondo Pensione» in Patrimonio: i versamenti si collegano a quel fondo.
        </p>
      ) : (
        <form id="pension-contribution-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pc-fund">Fondo</Label>
            <Select value={watchAssetId} onValueChange={(value) => setValue('assetId', value)}>
              <SelectTrigger id="pc-fund" aria-label="Fondo pensione" disabled={isDemo}>
                <SelectValue placeholder="Seleziona fondo" />
              </SelectTrigger>
              <SelectContent>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.assetId && <p className="text-sm text-red-500">{errors.assetId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-nature">Natura</Label>
            <Select
              value={watchSource}
              onValueChange={(value) => setValue('source', value as ContributionSource)}
            >
              <SelectTrigger id="pc-nature" aria-label="Natura del versamento" disabled={isDemo}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NATURE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedNature && (
              <p className="text-xs text-muted-foreground">{selectedNature.hint}</p>
            )}
          </div>

          {watchSource === 'voluntary' && (
            <div className="space-y-2">
              <Label htmlFor="pc-source">Conto di provenienza</Label>
              {cashAccounts.length > 0 ? (
                <Select
                  value={watchSourceCashAssetId}
                  onValueChange={(value) => setValue('sourceCashAssetId', value)}
                >
                  <SelectTrigger id="pc-source" aria-label="Conto di provenienza" disabled={isDemo}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nessun conto di liquidità disponibile: crea un asset di tipo «Liquidità» in
                  Patrimonio per registrare un versamento volontario.
                </p>
              )}
              {errors.sourceCashAssetId && (
                <p className="text-sm text-red-500">{errors.sourceCashAssetId.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pc-amount">Importo (€)</Label>
            <Input
              id="pc-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              disabled={isDemo}
              {...register('amount', { valueAsNumber: true })}
              placeholder="0,00"
            />
            {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pc-date">Data</Label>
              <Input id="pc-date" type="date" disabled={isDemo} {...register('date')} />
              {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-taxyear">Anno fiscale</Label>
              <Input
                id="pc-taxyear"
                type="number"
                step="1"
                disabled={isDemo}
                {...register('taxYear', { valueAsNumber: true })}
              />
              {errors.taxYear && <p className="text-sm text-red-500">{errors.taxYear.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-notes">Note (opzionale)</Label>
            <Textarea id="pc-notes" disabled={isDemo} rows={2} {...register('notes')} />
          </div>

          <p className="text-xs text-muted-foreground">
            Il versamento aumenta subito il valore del fondo. Il rendimento di mercato lo aggiorni a
            mano dal tuo asset in Patrimonio quando arriva l&apos;estratto conto.
          </p>
        </form>
      )}
    </ResponsiveModal>
  );
}
