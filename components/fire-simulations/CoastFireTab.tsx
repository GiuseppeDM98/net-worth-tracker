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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Info,
  Landmark,
  Loader2,
  Mountain,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
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
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { CoastFireProjectionChart } from './CoastFireProjectionChart';
import { HeroMetricBlock } from '@/components/performance/HeroMetricBlock';
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
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1023px)');

  const [tempUserAge, setTempUserAge] = useState('');
  const [tempRetirementAge, setTempRetirementAge] = useState('60');
  const [tempUseCustomExpenses, setTempUseCustomExpenses] = useState(false);
  const [tempCustomExpenses, setTempCustomExpenses] = useState('');
  const [tempPensions, setTempPensions] = useState<CoastFirePensionDraft[]>([]);
  const [tempTaxBrackets, setTempTaxBrackets] = useState<CoastFireTaxBracketDraft[]>([]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

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

  // Mirrors the useEffect body — resets all temp state to the last saved settings.
  const handleResetToSaved = () => {
    if (isLoadingSettings) return;
    setTempUserAge(settings?.userAge !== undefined ? String(settings.userAge) : '');
    setTempRetirementAge(String(settings?.coastFireRetirementAge ?? 60));
    setTempUseCustomExpenses(settings?.coastFireCustomExpenses !== undefined);
    setTempCustomExpenses(settings?.coastFireCustomExpenses?.toString() ?? '');
    setTempPensions(toPensionDrafts(settings?.coastFirePensions, settings?.userAge));
    setTempTaxBrackets(toTaxBracketDrafts(settings?.coastFireTaxBrackets));
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
  const pensionStateLabel =
    pensionConfigurationState === 'valid'
      ? 'Pensioni configurate'
      : pensionConfigurationState === 'informational'
        ? 'Configurazione con avviso'
        : pensionConfigurationState === 'incomplete'
          ? 'Dati incompleti'
          : 'Nessuna pensione';

  // CSS-var colors for pension state — theme-aware via color-mix instead of raw tailwind hues.
  const pensionStateColor =
    pensionConfigurationState === 'valid'
      ? 'var(--chart-2)'
      : pensionConfigurationState === 'informational'
        ? 'var(--chart-1)'
        : pensionConfigurationState === 'incomplete'
          ? 'var(--chart-3)'
          : undefined;

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
          : "Non c'è un ponte significativo prima del regime finale: le pensioni risultano già attive in prossimità dell'età target.",
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
      "In questo caso il capitale richiesto a pensione e il capitale a regime sono molto vicini perché non c'è un lungo periodo ponte da finanziare prima della pensione statale.",
    ];
  }, [effectiveAnnualExpenses, baseScenario, bridgeYears, resolvedRetirementAge]);

  const incompleteReason =
    currentNetWorth <= 0
      ? 'Serve un patrimonio FIRE positivo per calcolare il Coast FIRE.'
      : effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0
        ? 'Servono le spese annue per stimare il target Coast FIRE.'
        : currentAge === null
          ? "Inserisci la tua età attuale: serve a calcolare quanti anni ha il capitale per crescere fino al target."
          : retirementAge === null
            ? "Inserisci l'età target Coast FIRE: è il momento in cui il capitale deve essere sufficiente."
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

  // Decide the initial collapsed/expanded state ONCE, after the form has settled to match saved
  // settings (hasUnsavedChanges === false ⇒ temp state seeded). Collapsed when the user has already
  // configured their age (config-first for new users). Waiting for the settled state avoids the
  // transient first-render mismatch (empty temp vs saved age) popping the panel open.
  const hasSeededConfigRef = useRef(false);
  useEffect(() => {
    if (hasSeededConfigRef.current || isLoadingSettings || hasUnsavedChanges) return;
    hasSeededConfigRef.current = true;
    if (settings?.userAge == null) setIsConfigOpen(true);
  }, [isLoadingSettings, hasUnsavedChanges, settings?.userAge]);

  // After seeding, reopen on a genuine unsaved edit or an incomplete pension to fix.
  // Never auto-close: collapsing after save is disorienting if the user keeps editing.
  useEffect(() => {
    if (!hasSeededConfigRef.current) return;
    if (hasUnsavedChanges || pensionConfigurationState === 'incomplete') setIsConfigOpen(true);
  }, [hasUnsavedChanges, pensionConfigurationState]);

  if (isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses) {
    return <FireCalculatorSkeleton />;
  }

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">

      {/* 2. CONFIG COLLAPSIBLE */}
      <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <Card className="overflow-hidden">
          {/* Trigger covers the full header — keyboard-accessible via native button */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full cursor-pointer items-start justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Configurazione Coast FIRE</p>
                </div>
                {/* Non-bordered summary chips — plain text with font-medium for values */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    {"Età "}
                    <span className="font-medium text-foreground">{targetAgeLabel}</span>
                  </span>
                  <span>
                    {"Target "}
                    <span className="font-medium text-foreground">{retirementAgeLabel}</span>
                  </span>
                  <span>
                    {"Pensioni "}
                    <span className="font-medium text-foreground">{pensionCount}</span>
                  </span>
                  {pensionConfigurationState !== 'empty' && (
                    <span className="font-medium" style={{ color: pensionStateColor }}>
                      {pensionStateLabel}
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                  isConfigOpen ? 'rotate-180' : ''
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-border px-6 pb-6 pt-4">
              {/* Unsaved-changes banner with Annulla */}
              {hasUnsavedChanges && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm"
                >
                  <div className="flex items-start gap-3">
                    {saveMutation.isPending ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium text-foreground">Anteprima locale attiva</p>
                      <p className="text-muted-foreground">
                        Le metriche riflettono i valori inseriti ma non ancora salvati.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetToSaved}
                      disabled={saveMutation.isPending}
                      className="shrink-0"
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-6 desktop:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                {/* Section 1 — Timeline */}
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">1. Timeline personale</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Definisce la distanza tra oggi, il target Coast FIRE e la decorrenza pensione.
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
                  {/* Plain text info — no border box */}
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">{"Età attuale"}</span>
                      {": punto di partenza del capitale che cresce senza nuovi contributi pensionistici."}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">{"Età target"}</span>
                      {": quando il capitale deve essere sufficiente, anche se le pensioni partono dopo."}
                    </p>
                  </div>
                </div>

                {/* Section 2 — Assunzioni */}
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">2. Assunzioni già attive</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      SWR, spese e patrimonio dalle impostazioni generali.
                    </p>
                  </div>

                  {/* Custom expenses toggle — flat, no card wrapper */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Spese personalizzate</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {tempUseCustomExpenses
                            ? "Importo inserito manualmente: sostituisce le spese rilevate."
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
                        <Label htmlFor="coastCustomExpenses">{"Spese annue desiderate (€)"}</Label>
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

                  {/* Flat metric rows inside a single bordered container */}
                  <div className="divide-y divide-border rounded-lg border border-border">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">Spese usate</span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatCurrency(effectiveAnnualExpenses ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">SWR · Prima casa</span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatPercentage(withdrawalRate)} · {includePrimaryResidence ? 'Con' : 'Senza'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">{"Liquidità FIRE"}</span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatCurrency(liquidNetWorth)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3 — Pensioni */}
              <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
                <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">3. Pensioni statali</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ogni pensione riduce il fabbisogno del portafoglio solo dalla sua data di decorrenza.
                      Puoi inserirne più di una se hai contributi in casse diverse.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPensionRow}
                    className="w-full desktop:w-auto"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi pensione
                  </Button>
                </div>

                {/* Pension issues — color-mix tint, no raw amber/sky */}
                {pensionDraftIssues.length > 0 && (
                  <div
                    className="rounded-md border p-4 text-sm"
                    style={{
                      borderColor: primaryIncompleteIssue
                        ? 'color-mix(in srgb, var(--chart-3) 30%, transparent)'
                        : 'color-mix(in srgb, var(--chart-1) 30%, transparent)',
                      backgroundColor: primaryIncompleteIssue
                        ? 'color-mix(in srgb, var(--chart-3) 10%, transparent)'
                        : 'color-mix(in srgb, var(--chart-1) 10%, transparent)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {primaryIncompleteIssue ? 'Dati mancanti' : 'Note sulla decorrenza'}
                        </p>
                        {pensionDraftIssues.slice(0, 3).map((issue) => (
                          <p key={`${issue.pensionId}-${issue.message}`} className="text-muted-foreground">
                            {issue.message}
                          </p>
                        ))}
                        {pensionDraftIssues.length > 3 && (
                          <p className="text-muted-foreground">
                            Altri avvisi: {pensionDraftIssues.length - 3}.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tempPensions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Nessuna pensione inserita. Il calcolo assume che il portafoglio debba sostenere per intero le spese
                    annue anche dopo il target Coast FIRE.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tempPensions.map((pension, index) => (
                      <div key={pension.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <Badge variant="outline">{pension.label.trim() || `Pensione ${index + 1}`}</Badge>
                            <p className="text-sm text-muted-foreground">
                              {pension.startDate
                                ? `Decorrenza prevista ${formatDate(toDate(pension.startDate))}.`
                                : 'Decorrenza non ancora impostata.'}
                            </p>
                          </div>
                          {/* h-10 w-10 ensures a 40px touch target — minimum for destructive actions */}
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
                            {/* The model expects a future nominal amount (euros at the pension start date),
                                not today's equivalent. Getting this wrong silently distorts the calculation. */}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {"Lordo stimato alla decorrenza, in euro di quell'anno (nominale futuro)."}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor={`coast-pension-months-${pension.id}`}>{"Mensilità annue"}</Label>
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

                {/* Inner collapsible for pension model assumptions — progressive disclosure */}
                <Collapsible className="rounded-lg border border-border bg-muted/20">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="group flex w-full items-center justify-between rounded-lg px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium text-foreground">
                        4. Assunzioni del modello pensione
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">{"Importo lordo mensile"}</span>
                      {": stima dell'importo che riceverai alla decorrenza, espresso in euro di quell'anno (nominale futuro)."}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Deflazione</span>
                      {": il modello converte il lordo nominale in potere d'acquisto ai prezzi di oggi, usando il rendimento reale dello scenario."}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">IRPEF</span>
                      {": imposta calcolata sul lordo annuo reale con gli scaglioni configurati. Il netto reale è ciò che abbatte il fabbisogno del portafoglio."}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Decorrenza</span>
                      {": prima di quella data la pensione non riduce nulla — il portafoglio copre da solo."}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Section 4 — Scaglioni IRPEF */}
              <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
                <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Scaglioni IRPEF</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {"Applicati al lordo annuo reale di ciascuna pensione. Modificali se la normativa cambia o se usi un'aliquota media personalizzata."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTaxBracketRow}
                    className="w-full desktop:w-auto"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi scaglione
                  </Button>
                </div>

                {/* Tax brackets as flat divide-y rows — no card wrapper per row */}
                <div className="divide-y divide-border rounded-lg border border-border">
                  {tempTaxBrackets.map((bracket, index) => (
                    <div
                      key={bracket.id}
                      className="grid grid-cols-[minmax(0,1fr)_100px_44px] items-end gap-3 px-4 py-3 desktop:grid-cols-[minmax(0,1fr)_200px_52px]"
                    >
                      <div>
                        <Label htmlFor={`coast-tax-limit-${bracket.id}`}>
                          {index === tempTaxBrackets.length - 1
                            ? "Fino a (vuoto = illimitato)"
                            : "Fino a (€ annui)"}
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
                        <Label htmlFor={`coast-tax-rate-${bracket.id}`}>{"Aliquota %"}</Label>
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
                  ))}
                </div>
              </div>

              {/* Footer actions */}
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/40 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={isDemo || saveMutation.isPending}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saveMutation.isPending ? 'Salvataggio...' : 'Salva'}
                </Button>
                {hasUnsavedChanges && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetToSaved}
                    disabled={saveMutation.isPending}
                  >
                    Annulla
                  </Button>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 1. HERO — always visible, even without projection */}
      <Card className="overflow-hidden">
        <HeroMetricBlock
          label="Coast FIRE Number · Scenario Base"
          value={baseScenario?.coastFireNumberToday ?? null}
          format="currency"
        />
        <div className="divide-y divide-border border-t border-border">
          {/* Progresso totale with animated fill bar */}
          <div className="px-6 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Progresso totale</span>
              <div className="flex items-center gap-2">
                {baseScenario?.isCoastReached && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Coast FIRE
                  </Badge>
                )}
                <span className="font-mono text-sm font-semibold text-foreground">
                  {baseScenario ? formatPercentage(baseScenario.progressToCoastFI) : '–'}
                </span>
              </div>
            </div>
            {baseScenario && (
              <div
                role="progressbar"
                aria-valuenow={Math.min(Math.round(baseScenario.progressToCoastFI), 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progresso verso il Coast FIRE"
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <motion.div
                  className="h-full bg-primary"
                  initial={false}
                  animate={{ width: `${Math.min(baseScenario.progressToCoastFI, 100)}%` }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
          {/* Liquid-only progress */}
          <div className="flex items-center justify-between px-6 py-3.5">
            <span className="text-sm text-muted-foreground">Progresso (solo liquidi)</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {baseScenario ? formatPercentage(liquidProgressBase) : '–'}
            </span>
          </div>
          {/* Patrimonio FIRE attuale */}
          <div className="flex items-center justify-between px-6 py-3.5">
            <span className="text-sm text-muted-foreground">Patrimonio FIRE attuale</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatCurrency(currentNetWorth)}
            </span>
          </div>
          {/* Patrimonio FIRE attuale (solo liquidi) */}
          <div className="flex items-center justify-between px-6 py-3.5">
            <span className="text-sm text-muted-foreground">Patrimonio FIRE attuale (liquido)</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatCurrency(liquidNetWorth)}
            </span>
          </div>
          {/* Reason why projection is unavailable */}
          {!baseScenario && incompleteReason && (
            <div className="px-6 py-3.5">
              <p className="text-sm text-muted-foreground">{incompleteReason}</p>
            </div>
          )}
        </div>
      </Card>

      {/* 3–8: projection sections — only when calculation is available */}
      {coastProjection && baseScenario && (
        <>
          {/* 3. SCENARIO COMPARISON — 3 cards with flat divide-y rows inside each.
              An @container query (px-consistent) keeps all three on one row from 960px; Tailwind v4 mis-orders arbitrary min-[px] vs rem-based sm:, so plain media queries fail here. */}
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2 @[960px]:grid-cols-3">
              {(['bear', 'base', 'bull'] as const).map((key) => {
                const scenario = coastProjection.scenarios[key];
                const liquidProgress =
                  scenario.coastFireNumberToday > 0
                    ? (liquidNetWorth / scenario.coastFireNumberToday) * 100
                    : 0;
                const isBase = key === 'base';

                return (
                  <Card key={key} className="overflow-hidden">
                    <div className="flex items-start justify-between gap-3 px-6 py-4">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-muted-foreground/70">
                          {scenario.label}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          Reale {formatPercentage(scenario.realReturnRate)}
                        </p>
                      </div>
                      {scenario.isCoastReached ? (
                        <Badge variant="secondary" className="shrink-0 gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Raggiunto
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 font-mono">
                          {formatCurrency(scenario.gapToCoastFI)}
                        </Badge>
                      )}
                    </div>
                    <div className="divide-y divide-border border-t border-border">
                      <div className="flex items-center justify-between px-6 py-3">
                        <span className="text-sm text-muted-foreground">Progresso</span>
                        <span
                          className={cn(
                            'font-mono text-sm text-foreground',
                            isBase ? 'font-bold' : 'font-semibold'
                          )}
                        >
                          {formatPercentage(scenario.progressToCoastFI)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-6 py-3">
                        <span className="text-sm text-muted-foreground">Progresso liquido</span>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatPercentage(liquidProgress)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-6 py-3">
                        <span className="text-sm text-muted-foreground">{"Pensione netta al target"}</span>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(scenario.totalNetAnnualPensionAtRetirement)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-6 py-3">
                        <span className="text-sm text-muted-foreground">{"Capitale a pensione"}</span>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(scenario.retirementCapitalRequired)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-6 py-3">
                        <span className="text-sm text-muted-foreground">{"Capitale a regime"}</span>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(scenario.steadyStatePortfolioNeed)}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* 4. CHART */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" />
                Proiezione senza nuovi contributi
              </CardTitle>
              <CardDescription>
                Le tre linee mostrano il patrimonio FIRE-eligible che cresce da solo fino
                {"all'età target. La linea tratteggiata è il capitale reale richiesto a pensione."}
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

          {/* 5. COVERAGE PHASES — flat divide-y steps */}
          {timelineSteps.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-5">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Fasi di copertura</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Come cambia il fabbisogno al portafoglio man mano che le pensioni diventano attive.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {timelineSteps.map((step, index) => (
                  <div key={step.id} className="flex items-start justify-between gap-4 px-6 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {index + 1}
                      </span>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">{step.label}</p>
                        <p className="text-sm text-muted-foreground">{step.detail}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {step.badge}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 6. DETAIL — target situation and steady-state side by side */}
          <div className="grid gap-4 desktop:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-foreground">{"All'età target"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {"Cosa deve coprire il portafoglio quando arrivi all'età Coast FIRE."}
                </p>
              </div>
              <div className="divide-y divide-border border-t border-border">
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">Spese reali annue</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(effectiveAnnualExpenses ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">{"Pensione netta reale al target"}</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(baseScenario.totalNetAnnualPensionAtRetirement)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">Fabbisogno da portafoglio</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(baseScenario.annualPortfolioNeedAtRetirement)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">Capitale richiesto a pensione</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(baseScenario.retirementCapitalRequired)}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-foreground">A regime</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {baseScenario.pensionBreakdown.length > 0
                    ? `Assetto stabile dopo l'ultima decorrenza pensionistica${
                        baseScenario.latestPensionStartDate
                          ? ` (${formatDate(toDate(baseScenario.latestPensionStartDate))})`
                          : ''
                      }.`
                    : "Nessuna pensione configurata: il fabbisogno a regime coincide col target."}
                </p>
              </div>
              <div className="divide-y divide-border border-t border-border">
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">Pensione netta reale a regime</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">Fabbisogno da portafoglio</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(baseScenario.annualPortfolioNeedAtSteadyState)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">Capitale a regime</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(baseScenario.steadyStatePortfolioNeed)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm text-muted-foreground">{"Ponte prima dell'ultima pensione"}</span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {bridgeYears > 0
                      ? `${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'}`
                      : 'Nessuno'}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* 7. PENSION IMPACT — flat divide-y per pension */}
          {baseScenario.pensionBreakdown.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-5">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Impatto delle singole pensioni</p>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {sortedPensionBreakdown.map((pension) => (
                  <div key={pension.id} className="px-6 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{pension.label}</p>
                        <Badge variant={pension.isActiveAtRetirement ? 'secondary' : 'outline'}>
                          {pension.isActiveAtRetirement
                            ? 'Già attiva al target'
                            : `Parte a ${formatAgeYears(pension.startAge)}`}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {'Decorrenza '}
                        {pension.startDate ? formatDate(toDate(pension.startDate)) : 'non disponibile'}
                        {' · '}{Math.ceil(pension.yearsUntilStart)} anni
                      </p>
                    </div>
                    {/* 2-col on mobile keeps labels and values paired without a tall single column */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 desktop:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Lordo nominale</p>
                        <p className="font-mono text-sm font-medium text-foreground">
                          {formatCurrency(pension.grossAnnualFutureNominal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Lordo reale</p>
                        <p className="font-mono text-sm font-medium text-foreground">
                          {formatCurrency(pension.grossAnnualRealAtStart)}
                        </p>
                      </div>
                      <div className="col-span-2 desktop:col-span-1">
                        <p className="text-xs text-muted-foreground">Netto reale</p>
                        <p className="font-mono text-sm font-medium text-foreground">
                          {formatCurrency(pension.netAnnualRealAtStart)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 8. INTERPRETATION — prose based on Scenario Base */}
          {baseScenarioInterpretation.length > 0 && (
            <Card className="border-border/70 bg-muted/20">
              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-foreground">Perché cambia il numero finale</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Interpretazione automatica dello Scenario Base con i tuoi dati attuali.
                </p>
              </div>
              <div className="space-y-2 px-6 pb-6 text-sm text-foreground/90">
                {baseScenarioInterpretation.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* 9. FOOTNOTE — collapsible, default closed. Replaces the two redundant bottom strips. */}
      <Collapsible className="rounded-xl border border-border bg-muted/20">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="group flex w-full items-center justify-between rounded-xl px-6 py-4 text-left"
          >
            <span className="text-sm font-medium text-foreground">Come leggere il Coast FIRE</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 px-6 pb-5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Coast FIRE</span>
            {" significa che puoi smettere di versare per la pensione, non smettere di lavorare. Dopo il traguardo Coast, il tuo capitale attuale dovrebbe bastare a coprire il capitale richiesto al pensionamento grazie alla capitalizzazione composta."}
          </p>
          <p>
            <span className="font-medium text-foreground">Spese usate</span>
            {": il target si basa sempre sulle spese reali dell'ultimo anno completo, non sulle spese previste del FIRE classico."}
          </p>
          <p>
            <span className="font-medium text-foreground">Pensione statale</span>
            {": ogni importo inserito viene trattato come lordo mensile nominale futuro, deflazionato con l'inflazione dello scenario e convertito in netto reale con IRPEF progressiva."}
          </p>
        </CollapsibleContent>
      </Collapsible>

    </div>
  );
}
