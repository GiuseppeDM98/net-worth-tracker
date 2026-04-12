'use client';

/**
 * CoastFireTab reuses the FIRE settings and scenario model to answer a narrower
 * planning question: can the user's current FIRE-eligible patrimonio compound
 * on its own until the chosen retirement age, without further retirement
 * contributions, and still cover the retirement capital required?
 *
 * The state-pension inputs are intentionally scoped to Coast FIRE only:
 * they affect the retirement-phase portfolio need, not the classic FIRE tab.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Clock3,
  Info,
  Landmark,
  Loader2,
  Mountain,
  Percent,
  PiggyBank,
  Plus,
  Save,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import {
  calculateCoastFIREProjection,
  getAnnualExpenses,
  getDefaultScenarios,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
} from '@/lib/services/fireService';
import {
  calculateFIRENetWorth,
  calculateLiquidFIRENetWorth,
  getAllAssets,
} from '@/lib/services/assetService';
import { getDefaultTargets, getSettings, setSettings } from '@/lib/services/assetAllocationService';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { CoastFireProjectionChart } from './CoastFireProjectionChart';
import { Settings } from '@/types/settings';
import { CoastFirePensionInput, CoastFireTaxBracket } from '@/types/assets';
import { formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';

const COAST_CONTROL_CLASSNAME =
  'mt-1 transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

interface CoastFirePensionDraft {
  id: string;
  label: string;
  grossMonthlyAmount: string;
  monthsPerYear: string;
  startDate: string;
}

interface CoastFireTaxBracketDraft {
  id: string;
  upTo: string;
  rate: string;
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidAge(value: number | null): value is number {
  return value !== null && value >= 18 && value <= 100;
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addYearsToDate(date: Date, years: number): Date {
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
}

function createPensionDraft(defaultStartDate: string): CoastFirePensionDraft {
  return {
    id: createLocalId('coast-pension'),
    label: '',
    grossMonthlyAmount: '',
    monthsPerYear: '13',
    startDate: defaultStartDate,
  };
}

function createTaxBracketDraft(bracket: CoastFireTaxBracket): CoastFireTaxBracketDraft {
  return {
    id: bracket.id,
    upTo: bracket.upTo !== null ? String(bracket.upTo) : '',
    rate: String(bracket.rate),
  };
}

function toPensionDrafts(
  pensions: CoastFirePensionInput[] | undefined,
  currentAge: number | undefined
): CoastFirePensionDraft[] {
  const normalized = normalizeCoastFirePensions(pensions);
  const today = new Date();

  return normalized.map((pension) => ({
    id: pension.id,
    label: pension.label,
    grossMonthlyAmount: pension.grossMonthlyAmount.toString(),
    monthsPerYear: pension.monthsPerYear.toString(),
    startDate:
      pension.startDate ??
      (currentAge !== undefined && pension.startAge !== undefined
        ? addYearsToDate(today, Math.max(pension.startAge - currentAge, 0)).toISOString().slice(0, 10)
        : ''),
  }));
}

function toTaxBracketDrafts(brackets: CoastFireTaxBracket[] | undefined): CoastFireTaxBracketDraft[] {
  return normalizeCoastFireTaxBrackets(brackets).map(createTaxBracketDraft);
}

function parsePensionDrafts(drafts: CoastFirePensionDraft[]): CoastFirePensionInput[] {
  return normalizeCoastFirePensions(
    drafts.map((draft, index) => {
      const grossMonthlyAmount = Number.parseFloat(draft.grossMonthlyAmount.trim());
      const monthsPerYear = Number.parseInt(draft.monthsPerYear.trim(), 10);

      return {
        id: draft.id,
        label: draft.label.trim() || `Pensione ${index + 1}`,
        grossMonthlyAmount: Number.isFinite(grossMonthlyAmount) ? grossMonthlyAmount : 0,
        monthsPerYear: Number.isFinite(monthsPerYear) ? monthsPerYear : 0,
        startDate: draft.startDate.trim() || undefined,
      };
    })
  );
}

function parseTaxBracketDrafts(drafts: CoastFireTaxBracketDraft[]): CoastFireTaxBracket[] {
  return normalizeCoastFireTaxBrackets(
    drafts.map((draft) => {
      const upTo = draft.upTo.trim();
      const rate = Number.parseFloat(draft.rate.trim());

      return {
        id: draft.id,
        upTo: upTo ? Number.parseFloat(upTo) : null,
        rate: Number.isFinite(rate) ? rate : NaN,
      };
    })
  );
}

function buildPensionSnapshotKey(pensions: CoastFirePensionInput[]): string {
  return JSON.stringify(
    pensions.map((pension) => ({
      id: pension.id,
      label: pension.label,
      grossMonthlyAmount: pension.grossMonthlyAmount,
      monthsPerYear: pension.monthsPerYear,
      startDate: pension.startDate ?? null,
      startAge: pension.startAge ?? null,
    }))
  );
}

function buildTaxBracketSnapshotKey(brackets: CoastFireTaxBracket[]): string {
  return JSON.stringify(
    brackets.map((bracket) => ({
      id: bracket.id,
      upTo: bracket.upTo,
      rate: bracket.rate,
    }))
  );
}

export function CoastFireTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [tempUserAge, setTempUserAge] = useState('');
  const [tempRetirementAge, setTempRetirementAge] = useState('60');
  const [tempPensions, setTempPensions] = useState<CoastFirePensionDraft[]>([]);
  const [tempTaxBrackets, setTempTaxBrackets] = useState<CoastFireTaxBracketDraft[]>([]);

  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings | null>({
    queryKey: ['settings', user?.uid],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', user?.uid],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const { data: annualExpenses, isLoading: isLoadingAnnualExpenses } = useQuery({
    queryKey: ['coastFireAnnualExpenses', user?.uid],
    queryFn: () => getAnnualExpenses(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;
  const currentNetWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) : 0;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const scenarios = settings?.fireProjectionScenarios ?? getDefaultScenarios();
  const effectiveSavedRetirementAge = settings?.coastFireRetirementAge ?? 60;

  useEffect(() => {
    if (isLoadingSettings) return;

    setTempUserAge(settings?.userAge !== undefined ? String(settings.userAge) : '');
    setTempRetirementAge(String(settings?.coastFireRetirementAge ?? 60));
    setTempPensions(toPensionDrafts(settings?.coastFirePensions, settings?.userAge));
    setTempTaxBrackets(toTaxBracketDrafts(settings?.coastFireTaxBrackets));
  }, [isLoadingSettings, settings]);

  const parsedCurrentAge = parseOptionalInteger(tempUserAge);
  const parsedRetirementAge = parseOptionalInteger(tempRetirementAge);
  const currentAge = isValidAge(parsedCurrentAge) ? parsedCurrentAge : null;
  const retirementAge = isValidAge(parsedRetirementAge) ? parsedRetirementAge : null;
  const withdrawalRate = settings?.withdrawalRate ?? 4.0;

  const previewPensions = useMemo(() => parsePensionDrafts(tempPensions), [tempPensions]);
  const previewTaxBrackets = useMemo(() => parseTaxBracketDrafts(tempTaxBrackets), [tempTaxBrackets]);

  const savedPensionSnapshotKey = useMemo(
    () => buildPensionSnapshotKey(normalizeCoastFirePensions(settings?.coastFirePensions)),
    [settings?.coastFirePensions]
  );
  const savedTaxBracketSnapshotKey = useMemo(
    () => buildTaxBracketSnapshotKey(normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets)),
    [settings?.coastFireTaxBrackets]
  );
  const previewPensionSnapshotKey = useMemo(
    () => buildPensionSnapshotKey(previewPensions),
    [previewPensions]
  );
  const previewTaxBracketSnapshotKey = useMemo(
    () => buildTaxBracketSnapshotKey(previewTaxBrackets),
    [previewTaxBrackets]
  );

  const hasUnsavedChanges =
    tempUserAge !== (settings?.userAge !== undefined ? String(settings.userAge) : '') ||
    tempRetirementAge !== String(effectiveSavedRetirementAge) ||
    previewPensionSnapshotKey !== savedPensionSnapshotKey ||
    previewTaxBracketSnapshotKey !== savedTaxBracketSnapshotKey;

  const coastProjection = useMemo(() => {
    if (
      currentAge === null ||
      retirementAge === null ||
      annualExpenses === undefined ||
      annualExpenses <= 0 ||
      withdrawalRate <= 0 ||
      currentNetWorth <= 0
    ) {
      return null;
    }

    return calculateCoastFIREProjection(
      currentNetWorth,
      annualExpenses,
      withdrawalRate,
      currentAge,
      retirementAge,
      scenarios,
      previewPensions,
      previewTaxBrackets
    );
  }, [
    annualExpenses,
    currentAge,
    currentNetWorth,
    previewPensions,
    previewTaxBrackets,
    retirementAge,
    scenarios,
    withdrawalRate,
  ]);

  const liquidProgressBase = useMemo(() => {
    const coastNumber = coastProjection?.scenarios.base.coastFireNumberToday ?? 0;
    return coastNumber > 0 ? (liquidNetWorth / coastNumber) * 100 : 0;
  }, [coastProjection?.scenarios.base.coastFireNumberToday, liquidNetWorth]);

  const saveMutation = useMutation({
    mutationFn: (nextSettings: {
      userAge: number;
      coastFireRetirementAge: number;
      coastFirePensions: CoastFirePensionInput[];
      coastFireTaxBrackets: CoastFireTaxBracket[];
    }) =>
      setSettings(user!.uid, {
        ...(settings ?? {}),
        targets: settings?.targets || getDefaultTargets(),
        ...nextSettings,
      }),
    onSuccess: () => {
      toast.success('Impostazioni Coast FIRE salvate con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', user?.uid] });
    },
    onError: (error) => {
      console.error('Error saving Coast FIRE settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni Coast FIRE');
    },
  });

  const handleSave = () => {
    if (currentAge === null) {
      toast.error("Inserisci un'eta attuale valida tra 18 e 100 anni");
      return;
    }

    if (retirementAge === null) {
      toast.error("Inserisci un'eta di pensionamento valida tra 18 e 100 anni");
      return;
    }

    saveMutation.mutate({
      userAge: currentAge,
      coastFireRetirementAge: retirementAge,
      coastFirePensions: previewPensions,
      coastFireTaxBrackets: previewTaxBrackets,
    });
  };

  const buildDefaultPensionDate = (): string => {
    if (currentAge !== null && retirementAge !== null) {
      return addYearsToDate(new Date(), Math.max(retirementAge - currentAge, 0))
        .toISOString()
        .slice(0, 10);
    }

    return '';
  };

  const addPensionRow = () => {
    setTempPensions((current) => [
      ...current,
      createPensionDraft(buildDefaultPensionDate()),
    ]);
  };

  const updatePensionRow = (
    pensionId: string,
    field: keyof Omit<CoastFirePensionDraft, 'id'>,
    value: string
  ) => {
    setTempPensions((current) =>
      current.map((pension) => (pension.id === pensionId ? { ...pension, [field]: value } : pension))
    );
  };

  const removePensionRow = (pensionId: string) => {
    setTempPensions((current) => current.filter((pension) => pension.id !== pensionId));
  };

  const addTaxBracketRow = () => {
    setTempTaxBrackets((current) => [
      ...current,
      createTaxBracketDraft({ id: createLocalId('coast-tax'), upTo: null, rate: 43 }),
    ]);
  };

  const updateTaxBracketRow = (
    bracketId: string,
    field: keyof Omit<CoastFireTaxBracketDraft, 'id'>,
    value: string
  ) => {
    setTempTaxBrackets((current) =>
      current.map((bracket) => (bracket.id === bracketId ? { ...bracket, [field]: value } : bracket))
    );
  };

  const removeTaxBracketRow = (bracketId: string) => {
    setTempTaxBrackets((current) =>
      current.length > 1 ? current.filter((bracket) => bracket.id !== bracketId) : current
    );
  };

  if (isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses) {
    return <FireCalculatorSkeleton />;
  }

  const baseScenario = coastProjection?.scenarios.base ?? null;
  const resolvedRetirementAge = coastProjection?.retirementAge ?? retirementAge ?? 0;
  const bridgeYears = baseScenario ? Math.max(Math.ceil(baseScenario.latestPensionStartAge - resolvedRetirementAge), 0) : 0;
  const pensionCount = previewPensions.length;
  const baseScenarioInterpretation = useMemo(() => {
    if (!baseScenario) return [];

    if (baseScenario.pensionBreakdown.length === 0) {
      return [
        'Non hai inserito pensioni statali: il Coast FIRE coincide con il caso in cui il portafoglio deve coprire tutte le spese anche in pensione.',
      ];
    }

    const pensionStartsAtTargetCount = baseScenario.pensionBreakdown.filter((pension) => pension.isActiveAtRetirement).length;

    if (baseScenario.pensionBreakdown.length > 1) {
      return [
        `Hai configurato ${baseScenario.pensionBreakdown.length} pensioni con decorrenze diverse. Il calcolo non le somma tutte subito: in ogni fase considera solo quelle già attive.`,
        pensionStartsAtTargetCount > 0
          ? `All'età target risultano attive ${pensionStartsAtTargetCount} pension${pensionStartsAtTargetCount === 1 ? 'e' : 'i'}, mentre le altre entrano più avanti e riducono il fabbisogno del portafoglio in step successivi.`
          : `All'età target non è ancora attiva nessuna pensione, quindi il portafoglio deve coprire l'intero fabbisogno iniziale. Le pensioni ridurranno il fabbisogno solo nelle fasi successive.`,
        bridgeYears > 0
          ? `Per questo vedi un ponte di ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} prima del regime stabile finale, cioè prima che l'ultima pensione sia partita.`
          : 'Non c’è un ponte significativo prima del regime finale: le pensioni risultano già attive in prossimità dell’età target.',
      ];
    }

    if (baseScenario.totalNetAnnualPensionAtRetirement <= 0 && bridgeYears > 0) {
      return [
        `Nel tuo caso la pensione statale parte dopo il target Coast FIRE, quindi a ${resolvedRetirementAge} anni il portafoglio deve ancora coprire da solo ${formatCurrency(baseScenario.annualPortfolioNeedAtRetirement)} l'anno.`,
        `La pensione entra davvero in gioco solo dal ${baseScenario.latestPensionStartDate ? formatDate(toDate(baseScenario.latestPensionStartDate)) : 'momento di decorrenza'}, per questo vedi un ponte di ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} prima del regime stabile.`,
      ];
    }

    if (baseScenario.totalNetAnnualPensionAtRetirement > 0 && bridgeYears > 0) {
      return [
        `Al target Coast FIRE una parte delle tue spese è già coperta dalla pensione statale: il portafoglio deve sostenere ${formatCurrency(baseScenario.annualPortfolioNeedAtRetirement)} l'anno invece di ${formatCurrency(annualExpenses ?? 0)}.`,
        `Hai comunque un ponte di ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} prima che tutte le pensioni siano attive, quindi il capitale richiesto a pensione resta più alto del capitale steady-state.`,
      ];
    }

    return [
      `Alla decorrenza pensionistica il tuo fabbisogno annuo scende da ${formatCurrency(annualExpenses ?? 0)} a ${formatCurrency(baseScenario.annualPortfolioNeedAtSteadyState)} grazie alla pensione netta reale stimata di ${formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}.`,
      'In questo caso il capitale richiesto a pensione e il capitale a regime sono molto vicini perché non c’è un lungo periodo ponte da finanziare prima della pensione statale.',
    ];
  }, [annualExpenses, baseScenario, bridgeYears, resolvedRetirementAge]);
  const incompleteReason =
    currentNetWorth <= 0
      ? 'Serve un patrimonio FIRE positivo per calcolare il Coast FIRE.'
      : annualExpenses === undefined || annualExpenses <= 0
        ? 'Servono spese reali dell’ultimo anno completo per stimare il target Coast FIRE.'
        : currentAge === null
          ? 'Inserisci la tua età attuale per attivare il calcolo.'
          : retirementAge === null
            ? 'Inserisci l’età di pensionamento target per attivare il calcolo.'
            : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mountain className="h-5 w-5" />
            Impostazioni Coast FIRE
          </CardTitle>
          <CardDescription>
            Il Coast FIRE usa sempre le spese reali dell&apos;ultimo anno completo e riutilizza gli scenari
            Bear/Base/Bull già configurati nel FIRE classico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasUnsavedChanges && (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Loader2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${saveMutation.isPending ? 'animate-spin' : 'opacity-60'}`}
                />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Anteprima locale attiva</p>
                  <p className="text-muted-foreground">
                    Le metriche sotto riflettono i valori inseriti ma non ancora salvati. Il salvataggio resta
                    esplicito.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 desktop:grid-cols-2">
            <div>
              <Label htmlFor="coastCurrentAge">Età attuale</Label>
              <Input
                id="coastCurrentAge"
                type="number"
                min="18"
                max="100"
                step="1"
                value={tempUserAge}
                onChange={(event) => setTempUserAge(event.target.value)}
                className={COAST_CONTROL_CLASSNAME}
                placeholder="Es. 35"
              />
            </div>
            <div>
              <Label htmlFor="coastRetirementAge">Età pensionamento</Label>
              <Input
                id="coastRetirementAge"
                type="number"
                min="18"
                max="100"
                step="1"
                value={tempRetirementAge}
                onChange={(event) => setTempRetirementAge(event.target.value)}
                className={COAST_CONTROL_CLASSNAME}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>
              Base spese:{' '}
              <span className="font-medium text-foreground">{formatCurrency(annualExpenses ?? 0)}</span>{' '}
              dall&apos;ultimo anno completo.
            </p>
            <p className="mt-1">
              Il patrimonio usato nel calcolo è quello FIRE-eligible{' '}
              {includePrimaryResidence ? 'con' : 'senza'} casa di abitazione, in linea con la tua impostazione FIRE
              corrente.
            </p>
            <p className="mt-1">
              Le pensioni statali vanno inserite al <span className="font-medium text-foreground">lordo mensile</span>,
              come importi nominali futuri stimati oggi. Il modello le converte in netto reale scenario-specifico prima
              di usarle nel Coast FIRE.
            </p>
          </div>

          <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Pensioni statali</h3>
                <p className="text-sm text-muted-foreground">
                  Inserisci una o più pensioni lorde mensili. Ogni pensione può avere una decorrenza diversa.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addPensionRow}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi pensione
              </Button>
            </div>

            {tempPensions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Nessuna pensione inserita. In questo caso il Coast FIRE resta identico al modello attuale.
              </div>
            ) : (
              <div className="space-y-3">
                {tempPensions.map((pension, index) => (
                  <div
                    key={pension.id}
                    className="rounded-lg border border-border bg-background/60 p-4"
                  >
                    <div className="grid gap-3 desktop:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_160px_160px_52px]">
                      <div>
                        <Label htmlFor={`coast-pension-label-${pension.id}`}>Etichetta</Label>
                        <Input
                          id={`coast-pension-label-${pension.id}`}
                          value={pension.label}
                          onChange={(event) => updatePensionRow(pension.id, 'label', event.target.value)}
                          className={COAST_CONTROL_CLASSNAME}
                          placeholder={`Pensione ${index + 1}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`coast-pension-gross-${pension.id}`}>Lordo mensile</Label>
                        <Input
                          id={`coast-pension-gross-${pension.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={pension.grossMonthlyAmount}
                          onChange={(event) =>
                            updatePensionRow(pension.id, 'grossMonthlyAmount', event.target.value)
                          }
                          className={COAST_CONTROL_CLASSNAME}
                          placeholder="Es. 4242"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`coast-pension-months-${pension.id}`}>Mensilità annue</Label>
                        <Input
                          id={`coast-pension-months-${pension.id}`}
                          type="number"
                          min="1"
                          max="24"
                          step="1"
                          value={pension.monthsPerYear}
                          onChange={(event) => updatePensionRow(pension.id, 'monthsPerYear', event.target.value)}
                          className={COAST_CONTROL_CLASSNAME}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`coast-pension-date-${pension.id}`}>Data pensionamento</Label>
                        <Input
                          id={`coast-pension-date-${pension.id}`}
                          type="date"
                          value={pension.startDate}
                          onChange={(event) => updatePensionRow(pension.id, 'startDate', event.target.value)}
                          className={COAST_CONTROL_CLASSNAME}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePensionRow(pension.id)}
                          aria-label="Rimuovi pensione"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Scaglioni IRPEF</h3>
                <p className="text-sm text-muted-foreground">
                  Gli scaglioni sono modificabili e vengono applicati al lordo annuo reale di ciascuna pensione.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addTaxBracketRow}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi scaglione
              </Button>
            </div>

            <div className="space-y-3">
              {tempTaxBrackets.map((bracket, index) => (
                <div key={bracket.id} className="rounded-lg border border-border bg-background/60 p-4">
                  <div className="grid gap-3 desktop:grid-cols-[minmax(0,1fr)_200px_52px]">
                    <div>
                      <Label htmlFor={`coast-tax-limit-${bracket.id}`}>
                        {index === tempTaxBrackets.length - 1 ? 'Fino a (€ annui, vuoto = illimitato)' : 'Fino a (€ annui)'}
                      </Label>
                      <Input
                        id={`coast-tax-limit-${bracket.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={bracket.upTo}
                        onChange={(event) => updateTaxBracketRow(bracket.id, 'upTo', event.target.value)}
                        className={COAST_CONTROL_CLASSNAME}
                        placeholder={index === tempTaxBrackets.length - 1 ? 'Illimitato' : 'Es. 28000'}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`coast-tax-rate-${bracket.id}`}>Aliquota %</Label>
                      <Input
                        id={`coast-tax-rate-${bracket.id}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={bracket.rate}
                        onChange={(event) => updateTaxBracketRow(bracket.id, 'rate', event.target.value)}
                        className={COAST_CONTROL_CLASSNAME}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTaxBracketRow(bracket.id)}
                        disabled={tempTaxBrackets.length === 1}
                        aria-label="Rimuovi scaglione"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending} className="mt-6 w-full desktop:w-auto">
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Salvataggio...' : hasUnsavedChanges ? 'Salva Anteprima' : 'Salva Impostazioni'}
          </Button>
        </CardContent>
      </Card>

      {!coastProjection || !baseScenario ? (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Calcolo non ancora disponibile</CardTitle>
            <CardDescription>
              Il tab Coast FIRE mostra risultati solo quando sono presenti età valide, spese annuali e patrimonio FIRE
              positivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{incompleteReason}</CardContent>
        </Card>
      ) : (
        <>
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Coast FIRE Scenario Base
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Obiettivo: arrivare al capitale necessario a {retirementAge} anni senza nuovi contributi pensionistici,
              considerando {pensionCount > 0 ? `${pensionCount} pension${pensionCount === 1 ? 'e statale' : 'i statali'}` : 'nessuna pensione statale'}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 desktop:grid-cols-4">
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Coast Number Oggi</CardTitle>
                <CardDescription>Capitale minimo richiesto oggi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-indigo-600 desktop:text-2xl">
                  {formatCurrency(baseScenario.coastFireNumberToday)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capitale richiesto a pensione: {formatCurrency(baseScenario.retirementCapitalRequired)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Progresso verso Coast FIRE</CardTitle>
                <CardDescription>Totale e quota liquida</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-green-600 desktop:text-2xl">
                  {formatPercentage(baseScenario.progressToCoastFI)}
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full bg-gradient-to-r from-green-400 to-green-600"
                    initial={false}
                    animate={{ width: `${Math.min(baseScenario.progressToCoastFI, 100)}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Progresso liquidità: {formatPercentage(liquidProgressBase)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Gap Residuo</CardTitle>
                <CardDescription>Quanto manca oggi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-amber-600 desktop:text-2xl">
                  {formatCurrency(baseScenario.gapToCoastFI)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Patrimonio FIRE attuale: {formatCurrency(currentNetWorth)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Valore Stimato a Pensione</CardTitle>
                <CardDescription>Senza nuovi contributi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-blue-600 desktop:text-2xl">
                  {formatCurrency(baseScenario.futureValueAtRetirementWithoutNewContributions)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {baseScenario.yearsToRetirement} anni al target
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 desktop:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Situazione all'età target</CardTitle>
                <CardDescription>
                  Scenario Base: cosa deve coprire il portafoglio quando arrivi all&apos;età Coast FIRE
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Spese reali annue</span>
                  <span className="font-semibold text-foreground">{formatCurrency(annualExpenses ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Pensione netta reale a pensione</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(baseScenario.totalNetAnnualPensionAtRetirement)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Fabbisogno annuo da portafoglio</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(baseScenario.annualPortfolioNeedAtRetirement)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Capitale richiesto a pensione</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(baseScenario.retirementCapitalRequired)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Situazione dopo l'avvio della pensione</CardTitle>
                <CardDescription>
                  Scenario Base: assetto stabile dopo l&apos;ultima decorrenza pensionistica{' '}
                  {baseScenario.latestPensionStartDate
                    ? `(${formatDate(toDate(baseScenario.latestPensionStartDate))})`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Pensione netta reale a regime</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Fabbisogno annuo da portafoglio</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(baseScenario.annualPortfolioNeedAtSteadyState)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Capitale steady-state</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(baseScenario.steadyStatePortfolioNeed)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Ponte prima dell&apos;ultima pensione</span>
                  <span className="font-semibold text-foreground">
                    {bridgeYears > 0
                      ? `${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'}`
                      : 'Nessuno'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {baseScenarioInterpretation.length > 0 && (
            <Card className="border-indigo-200 bg-indigo-50/70 dark:border-indigo-900 dark:bg-indigo-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Come leggere questo scenario</CardTitle>
                <CardDescription>Interpretazione automatica dello Scenario Base con i tuoi dati attuali</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground/90">
                {baseScenarioInterpretation.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {baseScenario.pensionBreakdown.length > 0 && (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="h-5 w-5 text-indigo-500" />
                  Dettaglio pensioni nello Scenario Base
                </CardTitle>
                <CardDescription>
                  Ogni pensione viene deflazionata con l&apos;inflazione dello scenario e poi tassata con gli scaglioni IRPEF correnti.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {baseScenario.pensionBreakdown.map((pension) => (
                  <div
                    key={pension.id}
                    className="grid gap-3 rounded-lg border border-border bg-background/60 p-4 text-sm desktop:grid-cols-[minmax(0,1.2fr)_140px_repeat(3,minmax(0,1fr))]"
                  >
                    <div>
                      <p className="font-medium text-foreground">{pension.label}</p>
                      <p className="text-muted-foreground">
                        Decorrenza{' '}
                        {pension.startDate ? formatDate(toDate(pension.startDate)) : 'non disponibile'}{' '}
                        {pension.isActiveAtRetirement ? '· attiva a pensione' : '· parte dopo il target Coast'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Anni alla decorrenza</p>
                      <p className="font-medium text-foreground">{Math.ceil(pension.yearsUntilStart)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lordo annuo nominale</p>
                      <p className="font-medium text-foreground">{formatCurrency(pension.grossAnnualFutureNominal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lordo annuo reale</p>
                      <p className="font-medium text-foreground">{formatCurrency(pension.grossAnnualRealAtStart)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Netto annuo reale</p>
                      <p className="font-medium text-foreground">{formatCurrency(pension.netAnnualRealAtStart)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 desktop:grid-cols-3">
            {(['bear', 'base', 'bull'] as const).map((key) => {
              const scenario = coastProjection.scenarios[key];
              const liquidProgress =
                scenario.coastFireNumberToday > 0 ? (liquidNetWorth / scenario.coastFireNumberToday) * 100 : 0;

              return (
                <Card key={key} className="border-border/70">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span>{scenario.label}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Reale {formatPercentage(scenario.realReturnRate)}
                      </span>
                    </CardTitle>
                    <CardDescription>
                      {scenario.isCoastReached
                        ? 'Target Coast FIRE già raggiunto'
                        : `Mancano ${formatCurrency(scenario.gapToCoastFI)}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Progresso totale</span>
                      <span className="font-semibold text-foreground">{formatPercentage(scenario.progressToCoastFI)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Progresso liquido</span>
                      <span className="font-semibold text-foreground">{formatPercentage(liquidProgress)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Pensione netta reale a pensione</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(scenario.totalNetAnnualPensionAtRetirement)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Capitale richiesto a pensione</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(scenario.retirementCapitalRequired)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Capitale a regime</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(scenario.steadyStatePortfolioNeed)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-indigo-500" />
                Proiezione senza Nuovi Contributi
              </CardTitle>
              <CardDescription>
                Le tre linee mostrano il patrimonio FIRE-eligible che cresce da solo fino all&apos;età target. La linea tratteggiata è il capitale reale richiesto a pensione.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CoastFireProjectionChart
                projectionData={coastProjection.projectionData}
                height={isMobile ? 280 : 360}
                marginLeft={isMobile ? 10 : 50}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p>
                <strong>Come leggere il Coast FIRE:</strong> significa che puoi smettere di versare per la pensione,
                non smettere di lavorare. Dopo il traguardo Coast, il tuo capitale attuale dovrebbe bastare a coprire
                il capitale richiesto al pensionamento grazie alla capitalizzazione composta.
              </p>
              <p>
                <strong>Spese usate:</strong> il target si basa sempre sulle spese reali dell&apos;ultimo anno completo,
                non sulle spese previste del FIRE classico.
              </p>
              <p>
                <strong>Pensione statale:</strong> ogni importo inserito viene trattato come lordo mensile nominale
                futuro, deflazionato con l&apos;inflazione dello scenario e convertito in netto reale con IRPEF
                progressiva.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="pt-6">
          <div className="grid gap-3 text-sm text-muted-foreground desktop:grid-cols-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Patrimonio FIRE attuale:{' '}
              <span className="font-medium text-foreground">{formatCurrency(currentNetWorth)}</span>
            </div>
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Patrimonio liquido:{' '}
              <span className="font-medium text-foreground">{formatCurrency(liquidNetWorth)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Safe Withdrawal Rate:{' '}
              <span className="font-medium text-foreground">{formatPercentage(withdrawalRate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Pensioni attive in anteprima:{' '}
              <span className="font-medium text-foreground">{pensionCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
