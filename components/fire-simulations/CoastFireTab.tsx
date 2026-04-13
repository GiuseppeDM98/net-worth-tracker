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
  AlertTriangle,
  CalendarRange,
  ChevronDown,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { CoastFireProjectionChart } from './CoastFireProjectionChart';
import { Settings } from '@/types/settings';
import { CoastFirePensionInput, CoastFireTaxBracket } from '@/types/assets';
import { formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';

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

interface PensionDraftIssue {
  pensionId: string;
  severity: 'info' | 'warning' | 'error';
  kind: 'informational' | 'incomplete';
  message: string;
}

type PensionConfigurationState = 'empty' | 'incomplete' | 'informational' | 'valid';

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

function parseDraftDate(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPensionDraftStarted(draft: CoastFirePensionDraft): boolean {
  return (
    draft.label.trim().length > 0 ||
    draft.grossMonthlyAmount.trim().length > 0 ||
    draft.monthsPerYear.trim().length > 0 ||
    draft.startDate.trim().length > 0
  );
}

// Receives `now` as an explicit parameter so callers control the reference date.
// This makes the function pure and easier to test in isolation.
function buildPensionDraftIssues(
  drafts: CoastFirePensionDraft[],
  currentAge: number | null,
  retirementAge: number | null,
  now: Date
): PensionDraftIssue[] {
  const issues: PensionDraftIssue[] = [];

  drafts.forEach((draft, index) => {
    if (!isPensionDraftStarted(draft)) return;

    const grossMonthlyAmount = Number.parseFloat(draft.grossMonthlyAmount.trim());
    const monthsPerYear = Number.parseInt(draft.monthsPerYear.trim(), 10);
    const startDate = parseDraftDate(draft.startDate);
    const label = draft.label.trim() || `Pensione ${index + 1}`;

    if (!Number.isFinite(grossMonthlyAmount) || grossMonthlyAmount <= 0) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: inserisci un lordo mensile maggiore di zero per includerla nel calcolo.`,
      });
    }

    if (!Number.isFinite(monthsPerYear) || monthsPerYear <= 0) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: le mensilità annue devono essere maggiori di zero.`,
      });
    }

    if (!startDate) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: aggiungi una data di decorrenza per stimarne l'impatto nel tempo.`,
      });
      return;
    }

    if (startDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      issues.push({
        pensionId: draft.id,
        severity: 'info',
        kind: 'informational',
        message: `${label}: la data di decorrenza è nel passato, verifica che rispecchi la tua stima effettiva.`,
      });
    }

    if (currentAge !== null && retirementAge !== null) {
      const retirementDate = addYearsToDate(now, Math.max(retirementAge - currentAge, 0));
      if (startDate > retirementDate) {
        const bridgeYears = Math.max(
          Math.ceil((startDate.getTime() - retirementDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)),
          1
        );
        issues.push({
          pensionId: draft.id,
          severity: 'info',
          kind: 'informational',
          message: `${label}: decorre ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} dopo il target, nel periodo ponte il portafoglio copre ancora il fabbisogno per intero.`,
        });
      }
    }
  });

  return issues;
}

function formatCurrencyPerYear(value: number): string {
  return `${formatCurrency(value)} l'anno`;
}

function formatAgeYears(age: number): string {
  return `${Math.round(age)} anni`;
}

function getPensionConfigurationState(
  pensions: CoastFirePensionInput[],
  issues: PensionDraftIssue[]
): PensionConfigurationState {
  if (pensions.length === 0) return 'empty';
  if (issues.length === 0) return 'valid';

  const hasIncompleteIssues = issues.some((issue) => issue.kind === 'incomplete');
  if (!hasIncompleteIssues) return 'informational';

  return 'incomplete';
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
  const isTablet = useMediaQuery('(max-width: 1023px)');

  const [tempUserAge, setTempUserAge] = useState('');
  const [tempRetirementAge, setTempRetirementAge] = useState('60');
  const [tempUseCustomExpenses, setTempUseCustomExpenses] = useState(false);
  const [tempCustomExpenses, setTempCustomExpenses] = useState('');
  const [tempPensions, setTempPensions] = useState<CoastFirePensionDraft[]>([]);
  const [tempTaxBrackets, setTempTaxBrackets] = useState<CoastFireTaxBracketDraft[]>([]);
  const [isConfigOpen, setIsConfigOpen] = useState(true);

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
    setTempUseCustomExpenses(settings?.coastFireCustomExpenses !== undefined);
    setTempCustomExpenses(settings?.coastFireCustomExpenses?.toString() ?? '');
    setTempPensions(toPensionDrafts(settings?.coastFirePensions, settings?.userAge));
    setTempTaxBrackets(toTaxBracketDrafts(settings?.coastFireTaxBrackets));
  }, [isLoadingSettings, settings]);

  const parsedCurrentAge = parseOptionalInteger(tempUserAge);
  const parsedRetirementAge = parseOptionalInteger(tempRetirementAge);
  const currentAge = isValidAge(parsedCurrentAge) ? parsedCurrentAge : null;
  const retirementAge = isValidAge(parsedRetirementAge) ? parsedRetirementAge : null;
  const withdrawalRate = settings?.withdrawalRate ?? 4.0;

  // Use user-defined expenses when the toggle is on and the value parses to a positive number;
  // otherwise fall back to the last-year actuals from the query.
  const parsedCustomExpenses = parseFloat(tempCustomExpenses);
  const effectiveAnnualExpenses =
    tempUseCustomExpenses && !isNaN(parsedCustomExpenses) && parsedCustomExpenses > 0
      ? parsedCustomExpenses
      : annualExpenses;

  const previewPensions = useMemo(() => parsePensionDrafts(tempPensions), [tempPensions]);
  const previewTaxBrackets = useMemo(() => parseTaxBracketDrafts(tempTaxBrackets), [tempTaxBrackets]);
  const pensionDraftIssues = useMemo(
    () => buildPensionDraftIssues(tempPensions, currentAge, retirementAge, new Date()),
    [currentAge, retirementAge, tempPensions]
  );

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
    tempUseCustomExpenses !== (settings?.coastFireCustomExpenses !== undefined) ||
    (tempUseCustomExpenses && parsedCustomExpenses !== settings?.coastFireCustomExpenses) ||
    previewPensionSnapshotKey !== savedPensionSnapshotKey ||
    previewTaxBracketSnapshotKey !== savedTaxBracketSnapshotKey;

  const coastProjection = useMemo(() => {
    if (
      currentAge === null ||
      retirementAge === null ||
      effectiveAnnualExpenses === undefined ||
      effectiveAnnualExpenses <= 0 ||
      withdrawalRate <= 0 ||
      currentNetWorth <= 0
    ) {
      return null;
    }

    return calculateCoastFIREProjection(
      currentNetWorth,
      effectiveAnnualExpenses,
      withdrawalRate,
      currentAge,
      retirementAge,
      scenarios,
      previewPensions,
      previewTaxBrackets
    );
  }, [
    effectiveAnnualExpenses,
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
      coastFireCustomExpenses?: number;
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
      toast.error("Inserisci un'età attuale valida tra 18 e 100 anni");
      return;
    }

    if (retirementAge === null) {
      toast.error("Inserisci un'età di pensionamento valida tra 18 e 100 anni");
      return;
    }

    saveMutation.mutate({
      userAge: currentAge,
      coastFireRetirementAge: retirementAge,
      // Undefined removes the field from Firestore; the service handles the deleteField() call.
      coastFireCustomExpenses:
        tempUseCustomExpenses && !isNaN(parsedCustomExpenses) && parsedCustomExpenses > 0
          ? parsedCustomExpenses
          : undefined,
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

  const baseScenario = coastProjection?.scenarios.base ?? null;
  const resolvedRetirementAge = coastProjection?.retirementAge ?? retirementAge ?? 0;
  const bridgeYears = baseScenario ? Math.max(Math.ceil(baseScenario.latestPensionStartAge - resolvedRetirementAge), 0) : 0;
  const pensionCount = previewPensions.length;
  const hasCompactPensionEditor = tempPensions.length >= 3;
  const sortedPensionBreakdown = useMemo(
    () =>
      baseScenario
        ? [...baseScenario.pensionBreakdown].sort((left, right) => left.startAge - right.startAge)
        : [],
    [baseScenario]
  );
  const retirementCoverageDelta = baseScenario
    ? Math.max((effectiveAnnualExpenses ?? 0) - baseScenario.annualPortfolioNeedAtRetirement, 0)
    : 0;
  const steadyStateCoverageDelta = baseScenario
    ? Math.max((effectiveAnnualExpenses ?? 0) - baseScenario.annualPortfolioNeedAtSteadyState, 0)
    : 0;
  const pensionConfigurationState = useMemo(
    () => getPensionConfigurationState(previewPensions, pensionDraftIssues),
    [pensionDraftIssues, previewPensions]
  );
  // text-*-300 sits at a luminosity that's readable on both light and dark backgrounds
  // without relying on color-theme-specific overrides. -200 was too close to white on
  // light themes; -400 too saturated on some of the 6 custom themes.
  const pensionStateTone =
    pensionConfigurationState === 'valid'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : pensionConfigurationState === 'informational'
        ? 'border-sky-500/20 bg-sky-500/10 text-sky-300'
        : pensionConfigurationState === 'incomplete'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
        : 'border-border/70 bg-background/60 text-muted-foreground';
  const pensionStateLabel =
    pensionConfigurationState === "valid"
      ? "Pensioni configurate"
      : pensionConfigurationState === "informational"
        ? "Configurazione con avviso"
        : pensionConfigurationState === "incomplete"
          ? "Dati incompleti"
          : "Nessuna pensione";
  const pensionStateDescription =
    pensionConfigurationState === "valid"
      ? "Tutte le pensioni hanno importo, mensilità e decorrenza: entrano nel calcolo."
      : pensionConfigurationState === "informational"
        ? "I dati sono completi, ma almeno una pensione decorre dopo il target \u2014 leggi gli avvisi."
        : pensionConfigurationState === "incomplete"
          ? "Mancano dati obbligatori su almeno una pensione: non può ancora ridurre il fabbisogno."
          : "Nessuna pensione inserita: il calcolo assume che il portafoglio debba coprire per intero le spese in pensione.";
  const primaryInformationalIssue =
    pensionDraftIssues.find((issue) => issue.kind === 'informational') ?? null;
  const primaryIncompleteIssue =
    pensionDraftIssues.find((issue) => issue.kind === 'incomplete') ?? null;
  const primaryPensionIssue = primaryIncompleteIssue ?? primaryInformationalIssue;
  const remainingPensionIssues = Math.max(pensionDraftIssues.length - (primaryPensionIssue ? 1 : 0), 0);
  const baseScenarioInterpretation = useMemo(() => {
    if (!baseScenario) return [];

    if (baseScenario.pensionBreakdown.length === 0) {
      return [
        'Nessuna pensione configurata: il portafoglio deve sostenere per intero il fabbisogno annuo anche dopo il target Coast FIRE.',
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
        `Nel tuo caso la pensione statale parte dopo il target Coast FIRE, quindi a ${resolvedRetirementAge} anni il portafoglio deve ancora coprire da solo ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)}.`,
        `La pensione entra davvero in gioco solo dal ${baseScenario.latestPensionStartDate ? formatDate(toDate(baseScenario.latestPensionStartDate)) : 'momento di decorrenza'}, per questo vedi un ponte di ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} prima del regime stabile.`,
      ];
    }

    if (baseScenario.totalNetAnnualPensionAtRetirement > 0 && bridgeYears > 0) {
      return [
        `Al target Coast FIRE una parte delle tue spese è già coperta dalla pensione statale: il portafoglio deve sostenere ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)} invece di ${formatCurrencyPerYear(effectiveAnnualExpenses ?? 0)}.`,
        `Hai comunque un ponte di ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} prima che tutte le pensioni siano attive, quindi il capitale richiesto a pensione resta più alto del capitale steady-state.`,
      ];
    }

    return [
      `Alla decorrenza pensionistica il tuo fabbisogno annuo scende da ${formatCurrency(effectiveAnnualExpenses ?? 0)} a ${formatCurrency(baseScenario.annualPortfolioNeedAtSteadyState)} grazie alla pensione netta reale stimata di ${formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}.`,
      'In questo caso il capitale richiesto a pensione e il capitale a regime sono molto vicini perché non c’è un lungo periodo ponte da finanziare prima della pensione statale.',
    ];
  }, [effectiveAnnualExpenses, baseScenario, bridgeYears, resolvedRetirementAge]);
  const incompleteReason =
    currentNetWorth <= 0
      ? "Serve un patrimonio FIRE positivo per calcolare il Coast FIRE."
      : effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0
        ? "Servono le spese annue per stimare il target Coast FIRE."
        : currentAge === null
          ? "Inserisci la tua età attuale: serve a calcolare quanti anni ha il capitale per crescere fino al target."
          : retirementAge === null
            ? "Inserisci l’età target Coast FIRE: è il momento in cui il capitale deve essere sufficiente."
            : null;
  const timelineSteps = baseScenario
    ? [
        {
          id: 'target',
          label: `A ${resolvedRetirementAge} anni`,
          detail: `Il portafoglio deve sostenere ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)}.`,
          badge: `${formatCurrency(baseScenario.retirementCapitalRequired)} richiesti`,
        },
        ...sortedPensionBreakdown.map((pension, index) => ({
          id: pension.id,
          label: `${pension.label} ${pension.startDate ? `· ${formatDate(toDate(pension.startDate))}` : ''}`.trim(),
          detail: pension.isActiveAtRetirement && index === 0
            ? `È già attiva all'età target e copre ${formatCurrency(pension.netAnnualRealAtStart)} netti reali l'anno.`
            : `Da qui aggiunge ${formatCurrency(pension.netAnnualRealAtStart)} netti reali l'anno alla copertura.`,
          badge: pension.isActiveAtRetirement ? 'Già attiva' : `Parte a ${formatAgeYears(pension.startAge)}`,
        })),
        // Show the "a regime" step only when there's a bridge: without it, steady-state
        // and retirement values are essentially the same row, creating redundant reading.
        ...(bridgeYears > 0
          ? [
              {
                id: 'steady-state',
                label: 'A regime',
                detail: `Dopo l'ultima decorrenza il portafoglio deve coprire ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtSteadyState)}.`,
                badge: `${formatCurrency(baseScenario.steadyStatePortfolioNeed)} a regime`,
              },
            ]
          : []),
      ]
    : [];
  const targetAgeLabel = currentAge !== null ? formatAgeYears(currentAge) : 'Da impostare';
  const retirementAgeLabel = retirementAge !== null ? formatAgeYears(retirementAge) : 'Da impostare';
  const firstPensionStartLabel = sortedPensionBreakdown[0]?.startDate
    ? formatDate(toDate(sortedPensionBreakdown[0].startDate))
    : tempPensions[0]?.startDate
      ? formatDate(toDate(tempPensions[0].startDate))
      : 'Da impostare';
  const changeDrivers = baseScenario
    ? [
        {
          label: 'All’età target',
          value: formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement),
          detail:
            retirementCoverageDelta > 0
              ? `Le pensioni già attive coprono ${formatCurrencyPerYear(retirementCoverageDelta)}.`
              : 'Il portafoglio copre ancora da solo tutto il fabbisogno.',
        },
        {
          label: bridgeYears > 0 ? 'Durante gli anni ponte' : 'Transizione',
          value: bridgeYears > 0 ? `${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'}` : 'Nessun ponte',
          detail:
            bridgeYears > 0
              ? 'Finché non parte l’ultima pensione, il capitale richiesto resta più alto del regime finale.'
              : 'La situazione a pensione e quella a regime sono quasi allineate.',
        },
        {
          label: 'A regime',
          value: formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtSteadyState),
          detail:
            steadyStateCoverageDelta > 0
              ? `La copertura pensionistica sale a ${formatCurrencyPerYear(steadyStateCoverageDelta)}.`
              : 'La pensione non riduce il fabbisogno del portafoglio.',
        },
      ]
    : [];
  const shouldAutoOpenConfig =
    hasUnsavedChanges ||
    pensionConfigurationState === 'empty' ||
    pensionConfigurationState === 'incomplete' ||
    currentAge === null ||
    retirementAge === null;

  // Only auto-open when the user needs to act (missing data, unsaved changes, incomplete pensions).
  // Never auto-close: collapsing after save is disorienting if the user wants to keep editing.
  useEffect(() => {
    if (shouldAutoOpenConfig) setIsConfigOpen(true);
  }, [shouldAutoOpenConfig]);

  if (isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses) {
    return <FireCalculatorSkeleton />;
  }

  return (
    <div className="space-y-6">
      {coastProjection && baseScenario ? (
        <>
          <Card className="border-border/70">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xl">Effetto della pensione sul Coast FIRE</CardTitle>
                  </div>
                  <CardDescription className="max-w-[72ch]">
                    Il tuo capitale attuale può bastare a raggiungere il target Coast FIRE, anche se le pensioni
                    entrano in gioco solo dalla loro data di decorrenza, che può essere anni dopo il target.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="w-fit">
                    Scenario Base
                  </Badge>
                  <Badge variant="outline" className="w-fit">
                    {pensionStateLabel}
                  </Badge>
                </div>
              </div>

              {/* Stack on mobile, side-by-side only at desktop — the 3rd card (stato) stands alone at sm which is worse than stacking */}
              <div className="grid gap-3 desktop:grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,0.9fr)]">
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Timeline minima</p>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Età attuale</span>
                      <span className="font-mono text-foreground">{targetAgeLabel}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Età target Coast FIRE</span>
                      <span className="font-mono text-foreground">{retirementAgeLabel}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Prima decorrenza</span>
                      <span className="font-mono text-foreground">{firstPensionStartLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Perché il numero cambia</p>
                  <div className="mt-3 space-y-3">
                    {changeDrivers.map((item) => (
                      <div key={item.label} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                          <span className="font-mono text-sm text-foreground">{item.value}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={cn('rounded-xl border p-4', pensionStateTone)}>
                  <p className="text-xs uppercase tracking-[0.18em]">Stato configurazione</p>
                  <p className="mt-2 text-lg font-semibold text-foreground desktop:text-2xl">{pensionStateLabel}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{pensionStateDescription}</p>
                  {primaryPensionIssue ? (
                    <p className="mt-3 rounded-lg border border-current/10 bg-background/70 p-3 text-sm text-foreground">
                      {primaryPensionIssue.message}
                      {remainingPensionIssues > 0 ? ` Altri avvisi: ${remainingPensionIssues}.` : ''}
                    </p>
                  ) : (
                    <p className="mt-3 rounded-lg border border-current/10 bg-background/70 p-3 text-sm text-muted-foreground">
                      {pensionCount > 0
                        ? `${pensionCount} pension${pensionCount === 1 ? 'e pronta' : 'i in anteprima'} nel calcolo locale.`
                        : 'Aggiungi una pensione solo se vuoi ridurre il fabbisogno dopo la decorrenza.'}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 desktop:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  Fasi di copertura
                </CardTitle>
                <CardDescription>
                  Come cambia il fabbisogno che resta al portafoglio man mano che le pensioni diventano attive.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {timelineSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="grid gap-3 rounded-xl border border-border bg-background/50 p-4 desktop:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                          {index + 1}
                        </span>
                        <p className="font-medium text-foreground">{step.label}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{step.detail}</p>
                    </div>
                    <div className="flex items-start desktop:justify-end">
                      <Badge variant="outline">{step.badge}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Coast Number</CardTitle>
                <CardDescription>Capitale minimo da avere oggi per poter smettere di contribuire, sapendo che il portafoglio cresce da solo fino al target.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl border border-border bg-background/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Oggi</p>
                  <p className="mt-2 font-mono text-lg font-semibold text-foreground desktop:text-2xl">
                    {formatCurrency(baseScenario.coastFireNumberToday)}
                  </p>
                  <p className="mt-2 text-muted-foreground">Patrimonio FIRE-eligible minimo che, senza nuovi versamenti, cresce fino a coprire il fabbisogno all&apos;età target.</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Progresso totale</span>
                    <span className="font-semibold text-foreground">{formatPercentage(baseScenario.progressToCoastFI)}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    Patrimonio FIRE attuale {formatCurrency(currentNetWorth)}. Quota liquida {formatPercentage(liquidProgressBase)}.
                  </p>
                </div>
                {primaryPensionIssue ? (
                  <Alert
                    className={cn(
                      primaryIncompleteIssue
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-sky-500/30 bg-sky-500/10'
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{primaryIncompleteIssue ? 'Pensione incompleta' : 'Nota sulla decorrenza'}</AlertTitle>
                    <AlertDescription>
                      {primaryPensionIssue.message}
                      {remainingPensionIssues > 0 ? ` Altri ${remainingPensionIssues} avvisi nella configurazione.` : ''}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <Card className="border-border/70">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mountain className="h-5 w-5" />
                  <CardTitle>Configurazione Coast FIRE</CardTitle>
                </div>
                <CardDescription>
                  Dati inseriti e assunzioni operative. Apri questa sezione per modificare età target, pensioni e
                  scaglioni.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between desktop:w-auto">
                  <span>{isConfigOpen ? 'Nascondi configurazione' : 'Mostra configurazione'}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isConfigOpen ? 'rotate-180' : '')} />
                </Button>
              </CollapsibleTrigger>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 desktop:grid-cols-4">
              <div className="rounded-lg border border-border bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Età attuale</p>
                <p className="mt-2 font-mono text-lg font-semibold text-foreground">{targetAgeLabel}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Target Coast FIRE</p>
                <p className="mt-2 font-mono text-lg font-semibold text-foreground">{retirementAgeLabel}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pensioni</p>
                <p className="mt-2 font-mono text-lg font-semibold text-foreground">{pensionCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Stato</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{pensionStateLabel}</p>
              </div>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent>
          {hasUnsavedChanges && (
            <div role="status" aria-live="polite" className="mb-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex items-start gap-2">
                {/* Show spinner only while the mutation is in flight; otherwise a neutral info icon */}
                {saveMutation.isPending ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
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

          <div className="grid gap-6 desktop:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">1. Timeline personale</p>
                <p className="text-sm text-muted-foreground">
                  Questi punti definiscono la distanza tra oggi, target Coast FIRE e decorrenza pensione.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <Label htmlFor="coastRetirementAge">Età target Coast FIRE</Label>
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
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Età attuale</span>: punto di partenza del capitale che
                  cresce senza nuovi contributi pensionistici.
                </p>
                <p className="mt-2">
                  <span className="font-medium text-foreground">Età target Coast FIRE</span>: età in cui il capitale
                  deve essere sufficiente, anche se alcune pensioni partono dopo.
                </p>
                <p className="mt-2">
                  <span className="font-medium text-foreground">Decorrenza pensione</span>: momento in cui la singola
                  pensione inizia davvero a ridurre il fabbisogno annuo.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">2. Assunzioni già attive</p>
                <p className="text-sm text-muted-foreground">
                  SWR, spese e patrimonio vengono dalle impostazioni generali: cambiano il Coast Number anche senza pensioni configurate.
                </p>
              </div>

              {/* Custom expenses toggle — lets the user model retirement spending that differs from last-year actuals */}
              <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Spese personalizzate</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tempUseCustomExpenses
                        ? 'Importo inserito manualmente: sostituisce le spese rilevate.'
                        : "Spese rilevate dall'ultimo anno completo."}
                    </p>
                  </div>
                  <Switch
                    id="coastUseCustomExpenses"
                    checked={tempUseCustomExpenses}
                    onCheckedChange={(checked) => {
                      setTempUseCustomExpenses(checked);
                      if (!checked) setTempCustomExpenses('');
                    }}
                    aria-label="Usa spese personalizzate"
                  />
                </div>
                {tempUseCustomExpenses && (
                  <div className="space-y-1">
                    <Label htmlFor="coastCustomExpenses">Spese annue desiderate (€)</Label>
                    <Input
                      id="coastCustomExpenses"
                      type="number"
                      min="0"
                      step="100"
                      value={tempCustomExpenses}
                      onChange={(event) => setTempCustomExpenses(event.target.value)}
                      className={COAST_CONTROL_CLASSNAME}
                      placeholder="Es. 30000"
                    />
                    {annualExpenses !== undefined && annualExpenses > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Ultimo anno rilevato: {formatCurrency(annualExpenses)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Spese usate</p>
                  <p className="mt-2 font-mono text-lg font-semibold text-foreground desktop:text-2xl">
                    {formatCurrency(effectiveAnnualExpenses ?? 0)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tempUseCustomExpenses ? 'Importo personalizzato.' : 'Ultimo anno completo, non le spese FIRE pianificate.'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Base di patrimonio</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    SWR {formatPercentage(withdrawalRate)} · {includePrimaryResidence ? 'Con' : 'Senza'} prima casa
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Patrimonio FIRE attuale {formatCurrency(currentNetWorth)}. Liquidità {formatCurrency(liquidNetWorth)}.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">3. Pensioni statali</h3>
                <p className="text-sm text-muted-foreground">
                  Ogni pensione riduce il fabbisogno del portafoglio solo dalla sua data di decorrenza. Puoi
                  inserirne più di una se hai contributi in casse diverse.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addPensionRow} className="w-full desktop:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi pensione
              </Button>
            </div>

            {pensionDraftIssues.length > 0 ? (
              <Alert
                className={cn(
                  'text-foreground',
                  primaryIncompleteIssue
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-sky-500/30 bg-sky-500/10'
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {primaryIncompleteIssue ? 'Dati mancanti' : 'Note sulla decorrenza'}
                </AlertTitle>
                <AlertDescription className="space-y-1">
                  {pensionDraftIssues.slice(0, 3).map((issue) => (
                    <p key={`${issue.pensionId}-${issue.message}`}>{issue.message}</p>
                  ))}
                  {pensionDraftIssues.length > 3 ? (
                    <p>Altri avvisi: {pensionDraftIssues.length - 3}.</p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {tempPensions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Nessuna pensione inserita. Il calcolo assume che il portafoglio debba sostenere per intero le spese
                annue anche dopo il target Coast FIRE.
              </div>
            ) : (
              <div className="space-y-3">
                {tempPensions.map((pension, index) => (
                  <div
                    key={pension.id}
                    className="rounded-lg border border-border bg-background/60 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{pension.label.trim() || `Pensione ${index + 1}`}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {pension.startDate
                            ? `Decorrenza prevista ${formatDate(toDate(pension.startDate))}.`
                            : 'Decorrenza non ancora impostata.'}
                        </p>
                      </div>
                      {/* h-10 w-10 ensures a 40px touch target — closer to the 44px minimum on mobile */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePensionRow(pension.id)}
                        aria-label="Rimuovi pensione"
                        className="h-10 w-10 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Always 2-col on mobile so inputs are paired (Name+Amount, Months+Date),
                        then expand to 4-col at desktop. items-start rather than items-end:
                        hint text under some fields makes bottom-alignment impossible without
                        a subgrid, and top-alignment is cleaner and more readable. */}
                    <div
                      className={
                        hasCompactPensionEditor
                          ? 'grid grid-cols-2 items-start gap-3 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_160px]'
                          : 'grid grid-cols-2 items-start gap-3 desktop:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_160px_160px]'
                      }
                    >
                      <div>
                        <Label htmlFor={`coast-pension-label-${pension.id}`}>Nome</Label>
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
                        {/* Critical: the model expects a future nominal amount (euros at the pension
                            start date), not today's equivalent. Getting this wrong silently distorts
                            the entire calculation without any validation error. */}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Lordo stimato alla decorrenza, in euro di quell&apos;anno (nominale futuro).
                        </p>
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
                          placeholder="Es. 13"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          13 con tredicesima, 14 con quattordicesima.
                        </p>
                      </div>
                      <div>
                        <Label htmlFor={`coast-pension-date-${pension.id}`}>Decorrenza</Label>
                        <Input
                          id={`coast-pension-date-${pension.id}`}
                          type="date"
                          value={pension.startDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(event) => updatePensionRow(pension.id, 'startDate', event.target.value)}
                          className={COAST_CONTROL_CLASSNAME}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Collapsible className="rounded-lg border border-border bg-muted/20">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="group flex w-full items-center justify-between rounded-lg px-4 py-3 text-left">
                  <span className="text-sm font-medium text-foreground">4. Assunzioni del modello pensione</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Importo lordo mensile</span>: è la stima dell&apos;importo che riceverai alla decorrenza, espresso in euro di quell&apos;anno (nominale futuro). Non è il netto che spendi oggi.</p>
                <p><span className="font-medium text-foreground">Deflazione</span>: il modello converte il lordo nominale in potere d&apos;acquisto ai prezzi di oggi, usando il rendimento reale dello scenario (crescita − inflazione).</p>
                <p><span className="font-medium text-foreground">IRPEF</span>: l&apos;imposta viene calcolata sul lordo annuo reale con gli scaglioni che configuri sotto. Il netto reale è ciò che abbatte il fabbisogno del portafoglio.</p>
                <p><span className="font-medium text-foreground">Decorrenza</span>: prima di quella data la pensione non riduce nulla — il portafoglio copre da solo.</p>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Scaglioni IRPEF</h3>
                <p className="text-sm text-muted-foreground">
                  Applicati al lordo annuo reale di ciascuna pensione. Modificali se la normativa cambia o se usi un&apos;aliquota media personalizzata.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addTaxBracketRow} className="w-full desktop:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi scaglione
              </Button>
            </div>

            <div className="space-y-3">
              {tempTaxBrackets.map((bracket, index) => (
                <div key={bracket.id} className="rounded-lg border border-border bg-background/60 p-4">
                  {/* Inline 3-col on all viewports: "Fino a" gets most space, Aliquota is narrow, delete is icon-only.
                      On mobile 100px for rate is enough; desktop can afford the wider 200px column. */}
                  <div className="grid grid-cols-[minmax(0,1fr)_100px_44px] items-end gap-3 desktop:grid-cols-[minmax(0,1fr)_200px_52px]">
                    <div>
                      <Label htmlFor={`coast-tax-limit-${bracket.id}`}>
                        {index === tempTaxBrackets.length - 1 ? 'Fino a (vuoto = illimitato)' : 'Fino a (€ annui)'}
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTaxBracketRow(bracket.id)}
                      disabled={tempTaxBrackets.length === 1}
                      aria-label="Rimuovi scaglione"
                      className="h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending} className="mt-6 w-full desktop:w-auto">
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Salvataggio...' : 'Salva'}
          </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {!coastProjection || !baseScenario ? (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Dati insufficienti per il calcolo</CardTitle>
            <CardDescription>
              Servono età attuale, età target, spese annuali dell&apos;ultimo anno completato e patrimonio FIRE positivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{incompleteReason}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 desktop:grid-cols-4">
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Capitale Coast FIRE oggi</CardTitle>
                <CardDescription>Minimo richiesto per smettere di contribuire</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-lg font-semibold text-foreground desktop:text-2xl">
                  {formatCurrency(baseScenario.coastFireNumberToday)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capitale richiesto a pensione: {formatCurrency(baseScenario.retirementCapitalRequired)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Progresso</CardTitle>
                <CardDescription>Totale e quota liquida</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-lg font-semibold text-foreground desktop:text-2xl">
                  {formatPercentage(baseScenario.progressToCoastFI)}
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.min(Math.round(baseScenario.progressToCoastFI), 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso verso il Coast FIRE"
                  className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
                >
                  <motion.div
                    className="h-full bg-primary"
                    initial={false}
                    animate={{ width: `${Math.min(baseScenario.progressToCoastFI, 100)}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Quota liquida: {formatPercentage(liquidProgressBase)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {baseScenario.isCoastReached ? 'Target raggiunto' : 'Mancante al target'}
                </CardTitle>
                <CardDescription>
                  {baseScenario.isCoastReached
                    ? 'Il tuo patrimonio supera già il Coast Number nello scenario Base'
                    : 'Differenza rispetto al capitale richiesto oggi'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-lg font-semibold text-foreground desktop:text-2xl">
                  {baseScenario.isCoastReached ? '✓ Coast FIRE' : formatCurrency(baseScenario.gapToCoastFI)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Patrimonio FIRE attuale: {formatCurrency(currentNetWorth)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Valore stimato a pensione</CardTitle>
                <CardDescription>Senza nuovi contributi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-lg font-semibold text-foreground desktop:text-2xl">
                  {formatCurrency(baseScenario.futureValueAtRetirementWithoutNewContributions)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {baseScenario.yearsToRetirement} anni al target
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 desktop:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Situazione all'età target</CardTitle>
                <CardDescription>
                  Cosa deve coprire il portafoglio quando arrivi all&apos;età Coast FIRE
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Spese reali annue</span>
                  <span className="font-semibold text-foreground">{formatCurrency(effectiveAnnualExpenses ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Pensione netta reale all&apos;età target</span>
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
                <CardTitle className="text-base">Situazione a regime</CardTitle>
                <CardDescription>
                  {baseScenario.pensionBreakdown.length > 0
                    ? <>
                        Assetto stabile dopo l&apos;ultima decorrenza pensionistica{' '}
                        {baseScenario.latestPensionStartDate
                          ? `(${formatDate(toDate(baseScenario.latestPensionStartDate))})`
                          : ''}
                      </>
                    : 'Nessuna pensione configurata: il fabbisogno a regime coincide con il fabbisogno al target.'}
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
                  <span className="text-muted-foreground">Capitale a regime</span>
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
            <Card className="border-border/70 bg-muted/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Perché cambia il numero finale</CardTitle>
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
                  <Landmark className="h-5 w-5 text-primary" />
                  Impatto delle singole pensioni
                </CardTitle>
                <CardDescription>
                  Ogni pensione entra nella timeline solo dalla sua decorrenza, senza essere sommata in anticipo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedPensionBreakdown.map((pension) => (
                  <div
                    key={pension.id}
                    className="rounded-lg border border-border bg-background/60 p-4 text-sm"
                  >
                    {/* Header row: name, badge and start date — always visible */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{pension.label}</p>
                        <Badge variant={pension.isActiveAtRetirement ? 'secondary' : 'outline'}>
                          {pension.isActiveAtRetirement ? 'Già attiva al target' : `Parte a ${formatAgeYears(pension.startAge)}`}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Decorrenza {pension.startDate ? formatDate(toDate(pension.startDate)) : 'non disponibile'}
                        {' · '}{Math.ceil(pension.yearsUntilStart)} anni
                      </p>
                    </div>
                    {/* Metrics: 2-col on mobile keeps labels and values paired without a vertical wall of 5 blocks */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 desktop:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Lordo nominale</p>
                        <p className="font-medium text-foreground">{formatCurrency(pension.grossAnnualFutureNominal)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Lordo reale</p>
                        <p className="font-medium text-foreground">{formatCurrency(pension.grossAnnualRealAtStart)}</p>
                      </div>
                      <div className="col-span-2 desktop:col-span-1">
                        <p className="text-xs text-muted-foreground">Netto reale</p>
                        <p className="font-medium text-foreground">{formatCurrency(pension.netAnnualRealAtStart)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* sm:grid-cols-2 gives a 2-col layout on landscape mobile / tablet before the full 3-col at desktop */}
          <div className="grid gap-4 sm:grid-cols-2 desktop:grid-cols-3">
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
                      <span className="text-muted-foreground">Pensione netta all&apos;età target</span>
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

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" />
                Proiezione senza nuovi contributi
              </CardTitle>
              <CardDescription>
                Le tre linee mostrano il patrimonio FIRE-eligible che cresce da solo fino all&apos;età target. La linea tratteggiata è il capitale reale richiesto a pensione.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CoastFireProjectionChart
                projectionData={coastProjection.projectionData}
                height={isMobile ? 280 : 360}
                marginLeft={isMobile ? 10 : isTablet ? 30 : 50}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-2 text-sm text-muted-foreground">
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
