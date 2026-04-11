'use client';

/**
 * CoastFireTab reuses the FIRE settings and scenario model to answer a narrower
 * planning question: can the user's current FIRE-eligible patrimonio compound
 * on its own until the chosen retirement age, without further retirement
 * contributions, and still reach the full FIRE number?
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock3, Info, Loader2, Mountain, Percent, PiggyBank, Save, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import {
  calculateCoastFIREProjection,
  getAnnualExpenses,
  getDefaultScenarios,
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

const COAST_CONTROL_CLASSNAME =
  'mt-1 transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidAge(value: number | null): value is number {
  return value !== null && value >= 18 && value <= 100;
}

export function CoastFireTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [tempUserAge, setTempUserAge] = useState('');
  const [tempRetirementAge, setTempRetirementAge] = useState('60');

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
    if (!settings) return;
    setTempUserAge(settings.userAge !== undefined ? String(settings.userAge) : '');
    setTempRetirementAge(String(settings.coastFireRetirementAge ?? 60));
  }, [settings]);

  const parsedCurrentAge = parseOptionalInteger(tempUserAge);
  const parsedRetirementAge = parseOptionalInteger(tempRetirementAge);
  const currentAge = isValidAge(parsedCurrentAge) ? parsedCurrentAge : null;
  const retirementAge = isValidAge(parsedRetirementAge) ? parsedRetirementAge : null;
  const withdrawalRate = settings?.withdrawalRate ?? 4.0;
  const hasUnsavedChanges =
    tempUserAge !== (settings?.userAge !== undefined ? String(settings.userAge) : '') ||
    tempRetirementAge !== String(effectiveSavedRetirementAge);

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
      scenarios
    );
  }, [annualExpenses, currentAge, currentNetWorth, retirementAge, scenarios, withdrawalRate]);

  const liquidProgressBase = useMemo(() => {
    const coastNumber = coastProjection?.scenarios.base.coastFireNumberToday ?? 0;
    return coastNumber > 0 ? (liquidNetWorth / coastNumber) * 100 : 0;
  }, [coastProjection?.scenarios.base.coastFireNumberToday, liquidNetWorth]);

  const saveMutation = useMutation({
    mutationFn: (nextSettings: { userAge: number; coastFireRetirementAge: number }) =>
      setSettings(user!.uid, {
        ...settings,
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
    });
  };

  if (isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses) {
    return <FireCalculatorSkeleton />;
  }

  const baseScenario = coastProjection?.scenarios.base ?? null;
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
            Il Coast FIRE usa sempre le spese reali dell&apos;ultimo anno completo e riutilizza gli scenari Bear/Base/Bull già configurati nel FIRE classico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasUnsavedChanges && (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Loader2 className={`mt-0.5 h-4 w-4 shrink-0 ${saveMutation.isPending ? 'animate-spin' : 'opacity-60'}`} />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Anteprima locale attiva</p>
                  <p className="text-muted-foreground">
                    Le metriche sotto riflettono i valori inseriti ma non ancora salvati. Il salvataggio resta esplicito.
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
              Base spese: <span className="font-medium text-foreground">{formatCurrency(annualExpenses ?? 0)}</span> dall&apos;ultimo anno completo.
            </p>
            <p className="mt-1">
              Il patrimonio usato nel calcolo è quello FIRE-eligible {includePrimaryResidence ? 'con' : 'senza'} casa di abitazione, in linea con la tua impostazione FIRE corrente.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending} className="mt-4 w-full desktop:w-auto">
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
              Il tab Coast FIRE mostra risultati solo quando sono presenti età valide, spese annuali e patrimonio FIRE positivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {incompleteReason}
          </CardContent>
        </Card>
      ) : (
        <>
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Coast FIRE Scenario Base
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Obiettivo: arrivare al FIRE number a {retirementAge} anni senza nuovi contributi pensionistici.
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
                  FIRE target a pensione: {formatCurrency(baseScenario.fireNumberAtRetirement)}
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
                      {scenario.isCoastReached ? 'Target Coast FIRE già raggiunto' : `Mancano ${formatCurrency(scenario.gapToCoastFI)}`}
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
                      <span className="text-muted-foreground">Coast Number oggi</span>
                      <span className="font-semibold text-foreground">{formatCurrency(scenario.coastFireNumberToday)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Valore a pensione</span>
                      <span className="font-semibold text-foreground">{formatCurrency(scenario.futureValueAtRetirementWithoutNewContributions)}</span>
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
                Le tre linee mostrano il patrimonio FIRE-eligible che cresce da solo fino all&apos;età target. La linea tratteggiata è il FIRE number reale richiesto a pensione.
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
                <strong>Come leggere il Coast FIRE:</strong> significa che puoi smettere di versare per la pensione, non smettere di lavorare. Dopo il traguardo Coast, il tuo capitale attuale dovrebbe bastare a raggiungere il FIRE number all&apos;età target grazie alla capitalizzazione composta.
              </p>
              <p>
                <strong>Spese usate:</strong> il target si basa sempre sulle spese reali dell&apos;ultimo anno completo, non sulle spese previste del FIRE classico.
              </p>
              <p>
                <strong>Scenario Base:</strong> è il riferimento principale del tab. Gli scenari Orso e Toro servono a stressare il risultato con ipotesi di rendimento reale più prudenti o più favorevoli.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="pt-6">
          <div className="grid gap-3 text-sm text-muted-foreground desktop:grid-cols-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Patrimonio FIRE attuale: <span className="font-medium text-foreground">{formatCurrency(currentNetWorth)}</span>
            </div>
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Patrimonio liquido: <span className="font-medium text-foreground">{formatCurrency(liquidNetWorth)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Safe Withdrawal Rate: <span className="font-medium text-foreground">{formatPercentage(withdrawalRate)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
