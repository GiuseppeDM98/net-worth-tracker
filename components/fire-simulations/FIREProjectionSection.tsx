'use client';

/**
 * FIREProjectionSection Component
 *
 * Orchestrates the FIRE scenario projection feature within the FIRE Calculator tab.
 * Projects portfolio growth under Bear/Base/Bull market scenarios with inflation-adjusted
 * expenses to determine how many years until FIRE is reached.
 *
 * Data Flow:
 *   1. Fetches annual savings via React Query (from last year's cashflow)
 *   2. Loads scenario parameters from settings (or uses defaults)
 *   3. Runs deterministic projection via calculateFIREProjection() (useMemo)
 *   4. Renders parameter cards, summary cards, chart, and collapsible table
 *
 * Scenario parameters are editable locally with immediate recalculation,
 * and can be persisted to Firestore via the "Salva Parametri" button.
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FIREProjectionScenarios, FIREScenarioParams } from '@/types/assets';
import { Settings } from '@/types/settings';
import { getAnnualCashflowData, getDefaultScenarios, calculateFIREProjection } from '@/lib/services/fireService';
import { setSettings, getDefaultTargets } from '@/lib/services/assetAllocationService';
import { formatCurrency } from '@/lib/services/chartService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, Target, RotateCcw, Save, Info, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { FIREProjectionChart } from './FIREProjectionChart';
import { FIREProjectionTable } from './FIREProjectionTable';

interface FIREProjectionSectionProps {
  userId: string;
  currentNetWorth: number;
  withdrawalRate: number;
  settings: Settings | null | undefined;
}

// Scenario display config for consistent UI rendering
const SCENARIO_CONFIG = {
  bear: { label: 'Scenario Orso', icon: TrendingDown, color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-600', boldColor: 'text-red-700' },
  base: { label: 'Scenario Base', icon: Target, color: 'indigo', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200', textColor: 'text-indigo-600', boldColor: 'text-indigo-700' },
  bull: { label: 'Scenario Toro', icon: TrendingUp, color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-600', boldColor: 'text-green-700' },
} as const;

type ScenarioKey = keyof typeof SCENARIO_CONFIG;

export function FIREProjectionSection({
  userId,
  currentNetWorth,
  withdrawalRate,
  settings,
}: FIREProjectionSectionProps) {
  const queryClient = useQueryClient();
  const defaults = getDefaultScenarios();

  // Local state for scenario parameters (editable, recalculates immediately)
  const [scenarios, setScenarios] = useState<FIREProjectionScenarios>(
    settings?.fireProjectionScenarios ?? defaults
  );

  // Sync from settings when they load/change
  useEffect(() => {
    if (settings?.fireProjectionScenarios) {
      setScenarios(settings.fireProjectionScenarios);
    }
  }, [settings?.fireProjectionScenarios]);

  // Fetch annual savings and expenses from cashflow data (same source for consistency)
  const { data: cashflowData, isLoading: isLoadingSavings } = useQuery({
    queryKey: ['annualCashflowData', userId],
    queryFn: () => getAnnualCashflowData(userId),
    staleTime: 300000, // 5 minutes
  });

  const annualSavings = cashflowData?.annualSavings ?? 0;
  const annualExpenses = cashflowData?.annualExpensesFromCashflow ?? 0;

  // Calculate projection whenever inputs change
  const projection = useMemo(() => {
    if (currentNetWorth <= 0 || annualExpenses <= 0 || withdrawalRate <= 0) return null;
    return calculateFIREProjection(
      currentNetWorth,
      annualExpenses,
      annualSavings,
      withdrawalRate,
      scenarios
    );
  }, [currentNetWorth, annualExpenses, annualSavings, withdrawalRate, scenarios]);

  // Save scenario parameters to Firestore
  const saveMutation = useMutation({
    mutationFn: () => {
      return setSettings(userId, {
        ...settings,
        targets: settings?.targets || getDefaultTargets(),
        fireProjectionScenarios: scenarios,
      });
    },
    onSuccess: () => {
      toast.success('Parametri scenari salvati con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', userId] });
    },
    onError: (error) => {
      console.error('Error saving scenario parameters:', error);
      toast.error('Errore nel salvataggio dei parametri scenari');
    },
  });

  const handleResetDefaults = () => {
    setScenarios(defaults);
    toast.success('Parametri ripristinati ai valori predefiniti');
  };

  const updateScenario = (key: ScenarioKey, field: keyof FIREScenarioParams, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    // Validate ranges
    if (field === 'growthRate' && (numValue < 0 || numValue > 30)) return;
    if (field === 'inflationRate' && (numValue < 0 || numValue > 15)) return;

    setScenarios(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: numValue },
    }));
  };

  if (isLoadingSavings) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-gray-500">Calcolo risparmi annuali...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">📈 Proiezione Scenari</h2>
        <p className="text-sm text-gray-600">
          Proiezione del patrimonio sotto 3 scenari di mercato con inflazione sulle spese.
          Il FIRE Number cresce ogni anno perché le spese aumentano con l&apos;inflazione.
        </p>
      </div>

      {/* Annual Cashflow Data Banner */}
      <Card className={`${annualSavings > 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-1 desktop:flex-row desktop:gap-6">
            <div className="flex items-center gap-2">
              <Wallet className={`h-5 w-5 ${annualSavings > 0 ? 'text-green-600' : 'text-amber-600'}`} />
              <span className={`font-semibold ${annualSavings > 0 ? 'text-green-800' : 'text-amber-800'}`}>
                Risparmio Annuale: {formatCurrency(annualSavings)}
              </span>
            </div>
            {annualExpenses > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-green-800">
                  Spese Annuali: {formatCurrency(annualExpenses)}
                </span>
              </div>
            )}
          </div>
          <p className={`mt-1 text-xs ${annualSavings > 0 ? 'text-green-700' : 'text-amber-700'}`}>
            {cashflowData && annualSavings > 0
              ? `Dati dal ${cashflowData.referenceYear}${cashflowData.isAnnualized ? ' (annualizzati)' : ''}. Calcolati automaticamente dal cashflow (entrate - uscite).`
              : 'Nessun dato cashflow disponibile. Aggiungi entrate e uscite nella sezione Cashflow per una proiezione accurata.'
            }
          </p>
        </CardContent>
      </Card>

      {/* Scenario Parameter Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map((key) => {
          const config = SCENARIO_CONFIG[key];
          const Icon = config.icon;
          return (
            <Card key={key} className={`${config.borderColor} ${config.bgColor}`}>
              <CardHeader className="pb-3">
                <CardTitle className={`flex items-center gap-2 text-base ${config.boldColor}`}>
                  <Icon className="h-4 w-4" />
                  {config.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Crescita Mercati (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="30"
                    value={scenarios[key].growthRate}
                    onChange={(e) => updateScenario(key, 'growthRate', e.target.value)}
                    className="mt-1 h-8 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs">Inflazione (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="15"
                    value={scenarios[key].inflationRate}
                    onChange={(e) => updateScenario(key, 'inflationRate', e.target.value)}
                    className="mt-1 h-8 bg-white"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={handleResetDefaults}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Ripristina Default
        </Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? 'Salvataggio...' : 'Salva Parametri'}
        </Button>
      </div>

      {projection && (
        <>
          {/* Summary Cards: Years to FIRE */}
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map((key) => {
              const config = SCENARIO_CONFIG[key];
              const Icon = config.icon;
              const yearsKey = `${key}YearsToFIRE` as keyof typeof projection;
              const years = projection[yearsKey] as number | null;
              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className={`flex items-center gap-2 text-base ${config.textColor}`}>
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </CardTitle>
                    <CardDescription>Anni al FIRE</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${config.boldColor}`}>
                      {years !== null ? `${years} anni` : '50+ anni'}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {years !== null
                        ? `FIRE raggiunto nel ${new Date().getFullYear() + years}`
                        : 'Non raggiunto entro 50 anni'
                      }
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Projection Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Proiezione Patrimonio</CardTitle>
              <CardDescription>
                Crescita stimata del patrimonio netto nei 3 scenari. La linea tratteggiata ambra è il FIRE Number (scenario base).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FIREProjectionChart yearlyData={projection.yearlyData} />
            </CardContent>
          </Card>

          {/* Year-by-Year Table */}
          <FIREProjectionTable yearlyData={projection.yearlyData} />
        </>
      )}

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800 space-y-2">
              <p>
                <strong>Come funziona la proiezione:</strong> Ogni anno il patrimonio cresce con il rendimento di mercato
                dello scenario, poi si aggiungono i risparmi annuali. Le spese aumentano con l&apos;inflazione, facendo
                crescere il FIRE Number nel tempo.
              </p>
              <p>
                <strong>Risparmi annuali:</strong> Calcolati automaticamente dalle tue entrate e uscite dell&apos;ultimo
                anno completo. Per una proiezione accurata, mantieni aggiornata la sezione Cashflow.
              </p>
              <p>
                <strong>Nota:</strong> Questa è una proiezione deterministica (non stocastica). Per un&apos;analisi
                probabilistica con volatilità di mercato, usa la simulazione Monte Carlo.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
