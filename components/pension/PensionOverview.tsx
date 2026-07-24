'use client';

/**
 * PensionOverview — body of the dedicated `/dashboard/pension` view (spec 2-pension-fund/04 §3-§4).
 *
 * Four blocks:
 *  1. Header — total fund value (sum of the user's `pensionFund` assets) + total ever contributed.
 *  2. Versato per natura — this year's contributions split TFR/Volontario/Datoriale.
 *  3. Beneficio fiscale — the annual tax recap (deducted amount, IRPEF saving) and, for
 *     first-employment-post-2007 workers, the extra-deducibilità plafond. RAL + first-employment
 *     params are edited inline here and persisted to `AssetAllocationSettings` (spec 04 §4).
 *  4. Storico versamenti — contribution history with 2-click delete (reverses the value/transfer
 *     effect — invariant #5).
 */

import { useEffect, useRef, useState } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { calculateAssetValue } from '@/lib/services/assetService';
import { getSettings, setSettings, getDefaultTargets } from '@/lib/services/assetAllocationService';
import { usePensionContributions, useDeletePensionContribution } from '@/lib/hooks/usePensionContributions';
import {
  derivePensionContributionsByYearAndNature,
  derivePensionDeductibleByYear,
} from '@/lib/utils/pensionContributions';
import { computePensionTaxRecap, getPensionDeductionCeiling } from '@/lib/utils/pensionDeduction';
import { calculateProgressiveTax, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import type { ContributionSource } from '@/types/pension';
import type { Settings } from '@/types/settings';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PensionContributionDialog } from '@/components/pension/PensionContributionDialog';

const NATURE_ROWS: { key: ContributionSource; label: string; hint: string }[] = [
  { key: 'voluntary', label: 'Volontario', hint: 'deducibile · trasferito dal conto' },
  { key: 'employer', label: 'Datoriale', hint: 'deducibile · non transita dal conto' },
  { key: 'tfr', label: 'TFR', hint: 'non deducibile' },
];

const SOURCE_LABEL: Record<ContributionSource, string> = {
  voluntary: 'Volontario',
  employer: 'Datoriale',
  tfr: 'TFR',
};

export function PensionOverview() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const { data: assets = [] } = useAssets(ownerId);
  const { data: contributions = [] } = usePensionContributions(ownerId);
  const { data: settings } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!ownerId,
  });
  const deleteMutation = useDeletePensionContribution(ownerId || '');
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentYear = getItalyYear(new Date());

  const funds = assets.filter((asset) => asset.type === 'pensionFund');
  const fundNameById = new Map(funds.map((f) => [f.id, f.name]));
  const totalFundValue = funds.reduce((sum, fund) => sum + calculateAssetValue(fund), 0);

  const byYearNature = derivePensionContributionsByYearAndNature(contributions);
  const deductibleByYear = derivePensionDeductibleByYear(contributions);

  const thisYear = byYearNature[currentYear] ?? { tfr: 0, voluntary: 0, employer: 0 };
  const totalThisYear = thisYear.tfr + thisYear.voluntary + thisYear.employer;
  const totalAllTime = Object.values(byYearNature).reduce(
    (sum, nature) => sum + nature.tfr + nature.voluntary + nature.employer,
    0
  );

  // ── Tax params (RAL + first employment) — editable inline, persisted to settings ──────
  const [ral, setRal] = useState('');
  const [isFirstJob, setIsFirstJob] = useState(false);
  const [firstJobYear, setFirstJobYear] = useState('');

  useEffect(() => {
    if (!settings) return;
    setRal(settings.grossAnnualIncome != null ? String(settings.grossAnnualIncome) : '');
    setIsFirstJob(settings.isFirstEmploymentPost2007 ?? false);
    setFirstJobYear(settings.firstEmploymentYear != null ? String(settings.firstEmploymentYear) : '');
  }, [settings]);

  const saveParamsMutation = useMutation({
    mutationFn: async () => {
      const ralValue = parseFloat(ral.replace(',', '.'));
      const yearValue = parseInt(firstJobYear, 10);
      await setSettings(ownerId!, {
        ...(settings ?? {}),
        targets: settings?.targets || getDefaultTargets(),
        grossAnnualIncome: Number.isFinite(ralValue) && ralValue > 0 ? ralValue : undefined,
        isFirstEmploymentPost2007: isFirstJob,
        firstEmploymentYear: Number.isInteger(yearValue) ? yearValue : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
      toast.success('Parametri fiscali salvati');
    },
    onError: () => toast.error('Errore nel salvataggio dei parametri'),
  });

  // ── Tax recap for the current year ─────────────────────────────────────────────────
  const ralNumber = settings?.grossAnnualIncome ?? 0;
  const enrollmentYear = (() => {
    if (settings?.firstEmploymentYear) return settings.firstEmploymentYear;
    const years = Object.keys(deductibleByYear).map(Number);
    return years.length > 0 ? Math.min(...years) : currentYear;
  })();

  const brackets = normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets);
  const recap = computePensionTaxRecap(
    {
      targetYear: currentYear,
      enrollmentYear,
      isFirstJobPost2007: settings?.isFirstEmploymentPost2007 ?? false,
      deductibleContribByYear: deductibleByYear,
    },
    ralNumber,
    (income) => calculateProgressiveTax(income, brackets)
  );
  const { state, taxSaving } = recap;
  const showPlafond = (settings?.isFirstEmploymentPost2007 ?? false) && (state.isAccrualYear || state.isUsageYear);

  // ── Storico versamenti — 2-click delete with 3s auto-disarm ─────────────────────────
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteClick = (contribution: (typeof contributions)[number]) => {
    if (pendingDeleteId === contribution.id) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(undefined);
      deleteMutation.mutate(contribution, {
        onSuccess: () => toast.success('Versamento eliminato'),
        onError: () => toast.error("Errore nell'eliminazione del versamento"),
      });
    } else {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(contribution.id);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(undefined), 3000);
    }
  };

  if (funds.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-[22px] text-center space-y-3">
        <PiggyBank className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-foreground">Nessun fondo pensione ancora tracciato.</p>
        <p className="text-xs text-muted-foreground">
          Crea un asset di tipo «Fondo Pensione» da Patrimonio per iniziare a registrare i versamenti
          e vedere qui il beneficio fiscale.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setDialogOpen(true)} disabled={isDemo} aria-label="Registra versamento">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Registra versamento
        </Button>
      </div>

      {/* Header — valore totale + versato totale */}
      <div className="rounded-2xl border border-border bg-card p-[22px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Valore attuale
        </p>
        <p className="mt-2 font-mono text-[38px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
          {cachedFormatCurrencyEUR(totalFundValue)}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Versato totale
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(totalAllTime)}
          </span>
        </div>
      </div>

      {/* Versato nel {currentYear} — per natura */}
      <div className="rounded-2xl border border-border bg-card p-[22px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Versato nel {currentYear}
        </p>
        <p className="mt-2 font-mono text-[28px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
          {cachedFormatCurrencyEUR(totalThisYear)}
        </p>
        <div className="mt-5 divide-y divide-border/60">
          {NATURE_ROWS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-baseline justify-between gap-3 py-2">
              <div>
                <span className="text-sm text-foreground">{label}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>
              </div>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(thisYear[key])}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Beneficio fiscale */}
      <div className="rounded-2xl border border-border bg-card p-[22px] space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Beneficio fiscale {currentYear}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pension-ral" className="text-xs">Reddito annuo lordo (RAL)</Label>
            <Input
              id="pension-ral"
              type="number"
              inputMode="decimal"
              value={ral}
              onChange={(e) => setRal(e.target.value)}
              placeholder="es. 35000"
              disabled={isDemo}
              aria-label="Reddito annuo lordo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pension-firstjob-year" className="text-xs">Anno prima occupazione</Label>
            <Input
              id="pension-firstjob-year"
              type="number"
              value={firstJobYear}
              onChange={(e) => setFirstJobYear(e.target.value)}
              placeholder="es. 2022"
              disabled={isDemo || !isFirstJob}
              aria-label="Anno prima occupazione"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="pension-firstjob" className="text-xs text-muted-foreground">
            Prima occupazione dopo il 2007 (abilita il recupero plafond)
          </Label>
          <Switch
            id="pension-firstjob"
            checked={isFirstJob}
            onCheckedChange={setIsFirstJob}
            disabled={isDemo}
            aria-label="Prima occupazione dopo il 2007"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveParamsMutation.mutate()}
          disabled={isDemo || saveParamsMutation.isPending || !ownerId}
        >
          {saveParamsMutation.isPending ? 'Salvataggio...' : 'Salva parametri'}
        </Button>

        <div className="divide-y divide-border/60 border-t border-border/60 pt-1">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm text-foreground">
              Contributi deducibili {currentYear}
              <span className="ml-2 text-[11px] text-muted-foreground">volontario + datoriale</span>
            </span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(state.deductedThisYear)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm text-muted-foreground">
              TFR versato <span className="text-[11px]">non deducibile, escluso</span>
            </span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {cachedFormatCurrencyEUR(thisYear.tfr)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm font-medium text-foreground">Risparmio IRPEF stimato</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {ralNumber > 0 ? `~${cachedFormatCurrencyEUR(taxSaving)}` : '—'}
            </span>
          </div>
        </div>

        {ralNumber <= 0 && (
          <p className="text-[11px] text-muted-foreground">
            Imposta la RAL per stimare il risparmio IRPEF.
          </p>
        )}

        {showPlafond && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Plafond deducibilità
            </p>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">Plafond creato quest&apos;anno</span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(state.plafondCreatedThisYear)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">Plafond residuo recuperabile</span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(state.accruedPlafondResidual)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Extra deducibile {currentYear} oltre {cachedFormatCurrencyEUR(getPensionDeductionCeiling(currentYear))}
              </span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(state.extraAvailableThisYear)}
              </span>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Stima informativa, non consulenza fiscale: dipende dalla tua situazione personale (altri
          oneri deducibili, incapienza, tetto). Verifica con un professionista.
        </p>
      </div>

      {/* Storico versamenti */}
      {contributions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Storico versamenti
          </p>
          <div className="mt-3 divide-y divide-border/60">
            {contributions.map((contribution) => {
              const isPending = pendingDeleteId === contribution.id;
              return (
                <div key={contribution.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{SOURCE_LABEL[contribution.source]}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {contribution.date.toLocaleDateString('it-IT')}
                      </span>
                    </div>
                    {funds.length > 1 && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {fundNameById.get(contribution.assetId) ?? '—'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm tabular-nums text-foreground">
                      {cachedFormatCurrencyEUR(contribution.amount)}
                    </span>
                    <Button
                      type="button"
                      variant={isPending ? 'destructive' : 'ghost'}
                      size="sm"
                      onClick={() => handleDeleteClick(contribution)}
                      disabled={isDemo}
                      aria-label={isPending ? 'Conferma eliminazione' : 'Elimina versamento'}
                      title={
                        isPending && contribution.source === 'voluntary'
                          ? 'Conferma? Il saldo del conto verrà ristornato.'
                          : undefined
                      }
                    >
                      {isPending ? (
                        <span className="text-xs px-1">Conferma?</span>
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Eliminare un versamento annulla il suo effetto: il valore del fondo torna indietro e, per
            i volontari, il conto viene riaccreditato e il trasferimento rimosso.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Il valore del fondo (versato + rendimento) si aggiorna a mano dal tuo asset «Fondo Pensione»
        in Patrimonio quando arriva l&apos;estratto conto.
      </p>

      <PensionContributionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
