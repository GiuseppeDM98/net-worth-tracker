import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, Settings, ChevronDown } from 'lucide-react';
import { MonteCarloParams } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { getDefaultMarketParameters } from '@/lib/services/monteCarloService';
import { useState, useEffect } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface ParametersFormProps {
  params: MonteCarloParams;
  onParamsChange: (params: MonteCarloParams) => void;
  onRunSimulation: () => void;
  totalNetWorth: number;
  liquidNetWorth: number;
  isRunning: boolean;
  hideMarketParams?: boolean; // Hide advanced section when scenario mode handles market params
}

/**
 * Configuration form for Monte Carlo simulation parameters.
 *
 * Split into two tiers:
 * - Base (always visible): initial portfolio, retirement years, annual withdrawal, asset allocation
 * - Advanced (Collapsible): market parameters per asset class, number of simulations
 *
 * The advanced section auto-opens on mount when the loaded params differ from defaults,
 * so users with customized market assumptions see them immediately.
 *
 * State management pattern:
 * Local string state for each numeric input allows partial values while typing.
 * Values sync with the parent only on blur after validation.
 */
export function ParametersForm({
  params,
  onParamsChange,
  onRunSimulation,
  totalNetWorth,
  liquidNetWorth,
  isRunning,
  hideMarketParams = false,
}: ParametersFormProps) {
  // ===== Advanced section open state =====

  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-open on mount when market params differ from defaults
  useEffect(() => {
    const defaults = getDefaultMarketParameters();
    const isNonDefault = [
      [params.equityReturn, defaults.equityReturn],
      [params.equityVolatility, defaults.equityVolatility],
      [params.bondsReturn, defaults.bondsReturn],
      [params.bondsVolatility, defaults.bondsVolatility],
      [params.realEstateReturn, defaults.realEstateReturn],
      [params.realEstateVolatility, defaults.realEstateVolatility],
      [params.commoditiesReturn, defaults.commoditiesReturn],
      [params.commoditiesVolatility, defaults.commoditiesVolatility],
      [params.inflationRate, defaults.inflationRate],
    ].some(([current, def]) => Math.abs(current - def) > 0.001);

    const hasNonDefaultSimCount = params.numberOfSimulations !== 10000;

    if (isNonDefault || hasNonDefaultSimCount) setAdvancedOpen(true);
  }, []); // Only on mount — params may not be auto-filled yet but Collapsible can reopen later

  // ===== Input State Management =====
  // Each numeric field maintains local string state to allow partial input while typing.
  // Values sync with parent params only on blur after validation.

  const [equityInput, setEquityInput] = useState<string>(params.equityPercentage.toString());
  const [bondsInput, setBondsInput] = useState<string>(params.bondsPercentage.toString());
  const [realEstateInput, setRealEstateInput] = useState<string>(params.realEstatePercentage.toString());
  const [commoditiesInput, setCommoditiesInput] = useState<string>(params.commoditiesPercentage.toString());

  const [initialPortfolioInput, setInitialPortfolioInput] = useState<string>(
    params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  const [equityReturnInput, setEquityReturnInput] = useState<string>(params.equityReturn.toFixed(1));
  const [equityVolatilityInput, setEquityVolatilityInput] = useState<string>(params.equityVolatility.toFixed(1));
  const [bondsReturnInput, setBondsReturnInput] = useState<string>(params.bondsReturn.toFixed(1));
  const [bondsVolatilityInput, setBondsVolatilityInput] = useState<string>(params.bondsVolatility.toFixed(1));
  const [realEstateReturnInput, setRealEstateReturnInput] = useState<string>(params.realEstateReturn.toFixed(1));
  const [realEstateVolatilityInput, setRealEstateVolatilityInput] = useState<string>(params.realEstateVolatility.toFixed(1));
  const [commoditiesReturnInput, setCommoditiesReturnInput] = useState<string>(params.commoditiesReturn.toFixed(1));
  const [commoditiesVolatilityInput, setCommoditiesVolatilityInput] = useState<string>(params.commoditiesVolatility.toFixed(1));
  const [inflationRateInput, setInflationRateInput] = useState<string>(params.inflationRate.toFixed(1));

  // Sync initialPortfolio display when the value changes from quick-select buttons
  useEffect(() => {
    setInitialPortfolioInput(
      params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }, [params.initialPortfolio]);

  // Sync allocation inputs when params change (e.g., auto-filled from real portfolio)
  useEffect(() => {
    setEquityInput(params.equityPercentage.toString());
    setBondsInput(params.bondsPercentage.toString());
    setRealEstateInput(params.realEstatePercentage.toString());
    setCommoditiesInput(params.commoditiesPercentage.toString());
  }, [params.equityPercentage, params.bondsPercentage, params.realEstatePercentage, params.commoditiesPercentage]);

  /**
   * Generic helper to update a single parameter and trigger parent callback.
   */
  const updateParam = <K extends keyof MonteCarloParams>(key: K, value: MonteCarloParams[K]) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleUseTotalPortfolio = () => updateParam('initialPortfolio', Math.round(totalNetWorth));
  const handleUseLiquidPortfolio = () => updateParam('initialPortfolio', Math.round(liquidNetWorth));

  const allocationSum =
    params.equityPercentage +
    params.bondsPercentage +
    params.realEstatePercentage +
    params.commoditiesPercentage;
  const allocationRemaining = 100 - allocationSum;

  const handleAllocationBlur = (
    key: 'equityPercentage' | 'bondsPercentage' | 'realEstatePercentage' | 'commoditiesPercentage',
    inputValue: string,
    setInputState: (v: string) => void,
    fallbackValue: number
  ) => {
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateParam(key, value);
      setInputState(value.toString());
    } else {
      setInputState(fallbackValue.toString());
    }
  };

  const handleInitialPortfolioChange = (value: string) => setInitialPortfolioInput(value);

  /**
   * Parses Italian-locale number format (e.g. "50.000,00" → 50000) on blur.
   */
  const handleInitialPortfolioBlur = () => {
    const cleanValue = initialPortfolioInput.replace(/[^\d,.-]/g, '');
    const normalizedValue = cleanValue.replace(',', '.');
    const value = parseFloat(normalizedValue);
    if (!isNaN(value) && value >= 0) {
      updateParam('initialPortfolio', Math.round(value));
      setInitialPortfolioInput(
        Math.round(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    } else {
      setInitialPortfolioInput(
        params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    }
  };

  /**
   * Generic blur handler for all market parameters (return/volatility per asset class, inflation).
   * Validates within ±100% range before syncing.
   */
  const handleMarketParamBlur = (
    paramKey:
      | 'equityReturn'
      | 'equityVolatility'
      | 'bondsReturn'
      | 'bondsVolatility'
      | 'realEstateReturn'
      | 'realEstateVolatility'
      | 'commoditiesReturn'
      | 'commoditiesVolatility'
      | 'inflationRate',
    inputValue: string,
    setInputState: (value: string) => void,
    fallbackValue: number
  ) => {
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value >= -100 && value <= 100) {
      updateParam(paramKey, value);
      setInputState(value.toFixed(1));
    } else {
      setInputState(fallbackValue.toFixed(1));
    }
  };

  const canRunSimulation = params.initialPortfolio > 0 && params.annualWithdrawal > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Parametri Simulazione
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ===== Base params: always visible ===== */}

        {/* Patrimonio Iniziale */}
        <div className="space-y-3">
          <Label htmlFor="initialPortfolio" className="text-base font-semibold">
            Patrimonio Iniziale
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseTotalPortfolio}
              className="w-full sm:flex-1"
            >
              Usa Patrimonio Totale ({formatCurrency(totalNetWorth)})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseLiquidPortfolio}
              className="w-full sm:flex-1"
            >
              Usa Patrimonio Liquido ({formatCurrency(liquidNetWorth)})
            </Button>
          </div>
          <Input
            id="initialPortfolio"
            type="text"
            placeholder="Inserisci importo (€)"
            value={initialPortfolioInput}
            onChange={(e) => handleInitialPortfolioChange(e.target.value)}
            onBlur={handleInitialPortfolioBlur}
          />
        </div>

        {/* Anni di Pensionamento + Prelievo Annuale */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="retirementYears">Anni di Pensionamento</Label>
            <Input
              id="retirementYears"
              type="number"
              value={params.retirementYears}
              onChange={(e) => updateParam('retirementYears', parseInt(e.target.value) || 30)}
              onWheel={(e) => e.currentTarget.blur()}
              min="1"
              max="60"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Durata del pensionamento</p>
          </div>
          <div>
            <Label htmlFor="annualWithdrawal">Prelievo Annuale (€)</Label>
            <Input
              id="annualWithdrawal"
              type="number"
              value={params.annualWithdrawal}
              onChange={(e) => updateParam('annualWithdrawal', parseInt(e.target.value, 10) || 0)}
              onWheel={(e) => e.currentTarget.blur()}
              step="1000"
              min="0"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Spesa annuale durante il pensionamento</p>
          </div>
        </div>

        {/* Asset Allocation — 4 classes, must sum to 100% */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Asset Allocation</Label>
            <span
              className={`text-xs font-medium ${
                Math.abs(allocationRemaining) < 0.01
                  ? 'text-green-600 dark:text-green-400'
                  : allocationRemaining > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-destructive'
              }`}
            >
              {Math.abs(allocationRemaining) < 0.01
                ? 'Totale: 100%'
                : `Rimanente: ${allocationRemaining > 0 ? '+' : ''}${allocationRemaining.toFixed(1)}%`}
            </span>
          </div>
          <div className="grid gap-4 grid-cols-2 desktop:grid-cols-4">
            {[
              { id: 'equityPercentage', label: 'Equity (%)', input: equityInput, setInput: setEquityInput, key: 'equityPercentage' as const, fallback: params.equityPercentage },
              { id: 'bondsPercentage', label: 'Bonds (%)', input: bondsInput, setInput: setBondsInput, key: 'bondsPercentage' as const, fallback: params.bondsPercentage },
              { id: 'realEstatePercentage', label: 'Immobili (%)', input: realEstateInput, setInput: setRealEstateInput, key: 'realEstatePercentage' as const, fallback: params.realEstatePercentage },
              { id: 'commoditiesPercentage', label: 'Materie Prime (%)', input: commoditiesInput, setInput: setCommoditiesInput, key: 'commoditiesPercentage' as const, fallback: params.commoditiesPercentage },
            ].map((field) => (
              <div key={field.id}>
                <Label htmlFor={field.id}>{field.label}</Label>
                <Input
                  id={field.id}
                  type="number"
                  value={field.input}
                  onChange={(e) => field.setInput(e.target.value)}
                  onBlur={() =>
                    handleAllocationBlur(field.key, field.input, field.setInput, field.fallback)
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  min="0"
                  max="100"
                  step="5"
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          {Math.abs(allocationSum - 100) > 0.01 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              La somma delle allocazioni deve essere 100% (attuale: {allocationSum.toFixed(1)}%)
            </p>
          )}
        </div>

        {/* ===== Advanced params: Collapsible (hidden entirely in scenario mode) ===== */}
        {!hideMarketParams && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <div className="group flex cursor-pointer select-none items-center justify-between border-t pt-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <span>Parametri di mercato avanzati</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Valori default basati su medie storiche di lungo periodo. Modifica per testare scenari diversi.
                </p>

                {/* Equity */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="equityReturn">Rendimento Equity (%/anno)</Label>
                    <Input
                      id="equityReturn"
                      type="number"
                      value={equityReturnInput}
                      onChange={(e) => setEquityReturnInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('equityReturn', equityReturnInput, setEquityReturnInput, params.equityReturn)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="equityVolatility">Volatilità Equity (%)</Label>
                    <Input
                      id="equityVolatility"
                      type="number"
                      value={equityVolatilityInput}
                      onChange={(e) => setEquityVolatilityInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('equityVolatility', equityVolatilityInput, setEquityVolatilityInput, params.equityVolatility)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Bonds */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bondsReturn">Rendimento Bonds (%/anno)</Label>
                    <Input
                      id="bondsReturn"
                      type="number"
                      value={bondsReturnInput}
                      onChange={(e) => setBondsReturnInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('bondsReturn', bondsReturnInput, setBondsReturnInput, params.bondsReturn)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bondsVolatility">Volatilità Bonds (%)</Label>
                    <Input
                      id="bondsVolatility"
                      type="number"
                      value={bondsVolatilityInput}
                      onChange={(e) => setBondsVolatilityInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('bondsVolatility', bondsVolatilityInput, setBondsVolatilityInput, params.bondsVolatility)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Real Estate */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="realEstateReturn">Rendimento Immobili (%/anno)</Label>
                    <Input
                      id="realEstateReturn"
                      type="number"
                      value={realEstateReturnInput}
                      onChange={(e) => setRealEstateReturnInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('realEstateReturn', realEstateReturnInput, setRealEstateReturnInput, params.realEstateReturn)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="realEstateVolatility">Volatilità Immobili (%)</Label>
                    <Input
                      id="realEstateVolatility"
                      type="number"
                      value={realEstateVolatilityInput}
                      onChange={(e) => setRealEstateVolatilityInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('realEstateVolatility', realEstateVolatilityInput, setRealEstateVolatilityInput, params.realEstateVolatility)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Commodities */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="commoditiesReturn">Rendimento Materie Prime (%/anno)</Label>
                    <Input
                      id="commoditiesReturn"
                      type="number"
                      value={commoditiesReturnInput}
                      onChange={(e) => setCommoditiesReturnInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('commoditiesReturn', commoditiesReturnInput, setCommoditiesReturnInput, params.commoditiesReturn)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="commoditiesVolatility">Volatilità Materie Prime (%)</Label>
                    <Input
                      id="commoditiesVolatility"
                      type="number"
                      value={commoditiesVolatilityInput}
                      onChange={(e) => setCommoditiesVolatilityInput(e.target.value)}
                      onBlur={() =>
                        handleMarketParamBlur('commoditiesVolatility', commoditiesVolatilityInput, setCommoditiesVolatilityInput, params.commoditiesVolatility)
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Inflazione */}
                <div>
                  <Label htmlFor="inflationRate">Inflazione (%/anno)</Label>
                  <Input
                    id="inflationRate"
                    type="number"
                    value={inflationRateInput}
                    onChange={(e) => setInflationRateInput(e.target.value)}
                    onBlur={() =>
                      handleMarketParamBlur('inflationRate', inflationRateInput, setInflationRateInput, params.inflationRate)
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    step="0.1"
                    className="mt-1"
                  />
                </div>

                {/* Numero di Simulazioni */}
                <div>
                  <Label htmlFor="numberOfSimulations">Numero di Simulazioni</Label>
                  <Input
                    id="numberOfSimulations"
                    type="number"
                    value={params.numberOfSimulations}
                    onChange={(e) =>
                      updateParam('numberOfSimulations', parseInt(e.target.value) || 10000)
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    step="1000"
                    min="1000"
                    max="50000"
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Più simulazioni = risultati più accurati (ma più lente)
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ===== Run Simulation CTA — always visible ===== */}
        <Button
          onClick={onRunSimulation}
          disabled={!canRunSimulation || isRunning}
          className="w-full"
          size="lg"
        >
          {isRunning ? 'Simulazione in corso...' : 'Esegui Simulazione'}
        </Button>
      </CardContent>
    </Card>
  );
}
