'use client';

/**
 * PensionContributionDialog — "Registra versamento" flow.
 *
 * Records a contribution into the dedicated `pensionContributions` collection (never as an Expense
 * of consumption — invariant #1). Nature carries an inline micro-education note at the point of
 * entry: TFR/datoriale never leave the user's account, volontario does (modelled as a transfer, so
 * the "conto di provenienza" selector only appears for that nature).
 *
 * The words come from `lib/utils/dialogNarrative.ts` and the reading is the form's status line
 * (DESIGN.md → The Status-Is-The-Reading Rule): what the form wants, what it is doing, how it
 * failed. «Anno fiscale» is DERIVED from the date — the year of the date, or the one before or
 * after (a January payment for the previous year) — never a free integer: both roll-ups group by
 * it, so a typo would file the contribution into a year the axis never shows. Every error is
 * wired to its field (`aria-invalid`, `aria-describedby`, `role="alert"`), so a screen reader
 * hears it where a sighted reader sees it.
 *
 * On success the toast says the NEXT step — update the value once the statement arrives, it
 * already includes this contribution — and, when the caller passes `onRecorded`, offers it as
 * the toast's action: the order that prevents the double count is taught where it matters.
 */

import { useEffect, useState } from 'react';
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
import { getItalyDateIso, getItalyYear } from '@/lib/utils/dateHelpers';
import {
  describeModalStatus,
  describeWriteError,
  PENSION_CONTRIBUTION_COPY,
  PENSION_CONTRIBUTION_RECORDED,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';

const NATURE_OPTIONS: { value: ContributionSource; label: string; hint: string }[] = [
  {
    value: 'voluntary',
    label: 'Volontario',
    hint: 'Deducibile IRPEF entro il tetto annuo. Se versato da un tuo conto, scegli quale sotto — se invece è trattenuto in busta paga, lascia il campo vuoto.',
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

/** The year of an ISO date ('YYYY-MM-DD'), or null while the field is empty or malformed. */
function yearOfIso(iso: string | undefined): number | null {
  const year = Number(iso?.slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

/**
 * Every numeric field carries its OWN type-error message, not just a constraint message.
 * `valueAsNumber` turns an empty input into `NaN`, which fails the *type* check — and a message
 * attached only to `.positive()`/`.int()` leaves zod's English default ("Invalid input: expected
 * number, received NaN") to surface in an all-Italian form, on the most likely first mistake.
 *
 * The fiscal year is constrained to the date's year ±1 here too (the service enforces the same
 * rule), so the failure is named beside the field instead of arriving as a raw toast.
 */
const contributionSchema = z
  .object({
    assetId: z.string().min(1, 'Seleziona un fondo pensione'),
    source: z.enum(['tfr', 'voluntary', 'employer']),
    amount: z
      .number({ error: 'Inserisci un importo' })
      .positive('Inserisci un importo maggiore di zero'),
    date: z.string().min(1, 'Inserisci una data'),
    taxYear: z
      .number({ error: "Inserisci l'anno fiscale" })
      .int("L'anno fiscale deve essere un numero intero"),
    sourceCashAssetId: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const year = yearOfIso(data.date);
    if (year !== null && Math.abs(data.taxYear - year) > 1) {
      ctx.addIssue({ code: 'custom', path: ['taxYear'], message: "L'anno fiscale può essere solo quello della data, il precedente o il successivo" });
    }
  });

type ContributionFormValues = z.infer<typeof contributionSchema>;

interface PensionContributionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select a fund, e.g. when opened from a specific fund's context. */
  defaultAssetId?: string;
  /** Offered as the success toast's action («Aggiorna valore»): the next step of the monthly order. */
  onRecorded?: () => void;
}

export function PensionContributionDialog({ open, onClose, defaultAssetId, onRecorded }: PensionContributionDialogProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [] } = useAssets(ownerId);
  const recordMutation = useRecordPensionContribution(ownerId || '');
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  const funds = assets.filter((a) => a.type === 'pensionFund');
  const cashAccounts = assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash');
  // Ora italiana, non UTC: dalle 22:00 (23:00 d'inverno) `toISOString` restituisce il giorno prima,
  // e il form proporrebbe ieri a chi registra un versamento la sera. Stesso motivo per l'anno fiscale.
  const todayIso = getItalyDateIso();
  const currentTaxYear = getItalyYear();

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
      taxYear: currentTaxYear,
      sourceCashAssetId: '__none__',
      notes: '',
    },
  });

  const watchSource = useWatch({ control, name: 'source' });
  const watchAssetId = useWatch({ control, name: 'assetId' });
  const watchSourceCashAssetId = useWatch({ control, name: 'sourceCashAssetId' });
  const watchDate = useWatch({ control, name: 'date' });
  const watchTaxYear = useWatch({ control, name: 'taxYear' });

  // Dialog reset pattern (AGENTS.md): `open` in deps, guard on !open, enumerate every field.
  useEffect(() => {
    if (!open) return;
    reset({
      assetId: defaultAssetId ?? funds[0]?.id ?? '',
      source: 'voluntary',
      amount: undefined,
      date: todayIso,
      taxYear: currentTaxYear,
      sourceCashAssetId: '__none__',
      notes: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAssetId, reset]);

  // The status line resets on opening, derived during render (the TransactionDialog pattern):
  // a setState inside the effect above would cascade a render for a value known before it.
  const [statusOpen, setStatusOpen] = useState(open);
  if (open !== statusOpen) {
    setStatusOpen(open);
    if (open) setStatus({ phase: 'idle' });
  }

  // The fiscal year follows the date: a new date resets it to its own year, and the reader
  // re-chooses the neighbouring year only for the straddling case (January for the year before).
  const dateYear = yearOfIso(watchDate);
  useEffect(() => {
    if (dateYear !== null) setValue('taxYear', dateYear, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the date's year only; the fiscal year is what it sets
  }, [dateYear]);
  const taxYearOptions = dateYear !== null ? [dateYear - 1, dateYear, dateYear + 1] : [currentTaxYear - 1, currentTaxYear, currentTaxYear + 1];

  const onSubmit = async (data: ContributionFormValues) => {
    setStatus({ phase: 'submitting' });
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
      toast.success(PENSION_CONTRIBUTION_RECORDED.title, {
        description: PENSION_CONTRIBUTION_RECORDED.next,
        action: onRecorded ? { label: PENSION_CONTRIBUTION_RECORDED.action, onClick: onRecorded } : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Error recording pension contribution:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const hasFunds = funds.length > 0;
  const selectedNature = NATURE_OPTIONS.find((o) => o.value === watchSource);
  const reading = describeModalStatus(isSubmitting ? { phase: 'submitting' } : status, PENSION_CONTRIBUTION_COPY);

  // DOM order «secondary … primary»: the modal right-aligns them on a dialog and stacks them
  // primary-first at 44px on a drawer, so no `useMediaQuery` branch is needed here.
  const footer = (
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
      eyebrow="Previdenza · Versamenti"
      title="Registra un versamento"
      reading={reading}
      width="md"
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
            <Select value={watchAssetId} onValueChange={(value) => setValue('assetId', value, { shouldValidate: true })}>
              <SelectTrigger
                id="pc-fund"
                aria-label="Fondo pensione"
                disabled={isDemo}
                aria-invalid={!!errors.assetId}
                aria-describedby={errors.assetId ? 'pc-fund-error' : undefined}
              >
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
            {errors.assetId && (
              <p id="pc-fund-error" role="alert" className="text-sm text-destructive">
                {errors.assetId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-nature">Natura</Label>
            <Select
              value={watchSource}
              onValueChange={(value) => setValue('source', value as ContributionSource)}
            >
              <SelectTrigger id="pc-nature" aria-label="Natura del versamento" disabled={isDemo} aria-describedby="pc-nature-hint">
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
              <p id="pc-nature-hint" className="text-xs text-muted-foreground">{selectedNature.hint}</p>
            )}
          </div>

          {watchSource === 'voluntary' && (
            <div className="space-y-2">
              <Label htmlFor="pc-source">Conto di provenienza (opzionale)</Label>
              {cashAccounts.length > 0 ? (
                <Select
                  value={watchSourceCashAssetId}
                  onValueChange={(value) => setValue('sourceCashAssetId', value)}
                >
                  <SelectTrigger
                    id="pc-source"
                    aria-label="Conto di provenienza"
                    disabled={isDemo}
                    aria-invalid={!!errors.sourceCashAssetId}
                    aria-describedby={errors.sourceCashAssetId ? 'pc-source-error' : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno (trattenuto in busta paga)</SelectItem>
                    {cashAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nessun conto di liquidità disponibile: se il versamento è trattenuto in busta paga
                  puoi comunque registrarlo senza selezionare un conto.
                </p>
              )}
              {errors.sourceCashAssetId && (
                <p id="pc-source-error" role="alert" className="text-sm text-destructive">
                  {errors.sourceCashAssetId.message}
                </p>
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
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'pc-amount-error' : undefined}
              {...register('amount', { valueAsNumber: true })}
              placeholder="0,00"
            />
            {errors.amount && (
              <p id="pc-amount-error" role="alert" className="text-sm text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pc-date">Data</Label>
              <Input
                id="pc-date"
                type="date"
                disabled={isDemo}
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? 'pc-date-error' : undefined}
                {...register('date')}
              />
              {errors.date && (
                <p id="pc-date-error" role="alert" className="text-sm text-destructive">
                  {errors.date.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-taxyear">Anno fiscale</Label>
              <Select value={String(watchTaxYear)} onValueChange={(value) => setValue('taxYear', Number(value), { shouldValidate: true })}>
                <SelectTrigger
                  id="pc-taxyear"
                  aria-label="Anno fiscale"
                  disabled={isDemo}
                  aria-invalid={!!errors.taxYear}
                  aria-describedby={errors.taxYear ? 'pc-taxyear-error' : 'pc-taxyear-hint'}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taxYearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.taxYear ? (
                <p id="pc-taxyear-error" role="alert" className="text-sm text-destructive">
                  {errors.taxYear.message}
                </p>
              ) : (
                <p id="pc-taxyear-hint" className="text-xs text-muted-foreground">
                  {dateYear !== null && watchTaxYear !== dateYear ? `Competenza ${watchTaxYear}, pagato nel ${dateYear}.` : 'Segue la data; cambialo per un pagamento di gennaio dell’anno prima.'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-notes">Note (opzionale)</Label>
            <Textarea id="pc-notes" disabled={isDemo} rows={2} {...register('notes')} />
          </div>

          <p className="text-xs text-muted-foreground">
            Il versamento aumenta subito il valore del fondo. Registra prima tutti i versamenti del
            mese, poi aggiorna il valore con «Aggiorna valore» quando arriva l&apos;estratto conto —
            che li include già. Meglio entro la fine del mese di competenza: lo storico congela una
            fotografia a fine mese.
          </p>
        </form>
      )}
    </ResponsiveModal>
  );
}
