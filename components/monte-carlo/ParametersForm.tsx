import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, Settings, Info } from 'lucide-react';
import { MonteCarloParams } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { useState, useEffect } from 'react';

interface ParametersFormProps {
  params: MonteCarloParams;
  onParamsChange: (params: MonteCarloParams) => void;
  onRunSimulation: () => void;
  totalNetWorth: number;
  liquidNetWorth: number;
  isRunning: boolean;
  hideMarketParams?: boolean; // Hide market params section when scenario mode handles them
}

/**
 * Comprehensive form for configuring all Monte Carlo simulation parameters.
 *
 * Key features:
 * - Portfolio settings (initial amount, retirement years, annual withdrawal)
 * - Asset allocation (equity/bonds/real estate/commodities with sum-to-100 validation)
 * - Market parameters (return/volatility per asset class, inflation) - all editable
 * - Simulation count selector (1,000-50,000)
 * - Quick-select buttons for net worth values
 *
 * State management pattern:
 * This component uses separate useState calls for local input tracking.
 * Why? To provide smooth UX during user input:
 * 1. Allow partial/invalid input while typing (e.g., "7." before completing "7.5")
 * 2. Only validate and sync with parent on blur (handleBlur handlers)
 * 3. Format display values after validation (Italian locale for currency)
 * 4. Prevent input field "jumping" during typing due to premature formatting
 *
 * @param params - Current simulation parameters (controlled by parent)
 * @param onParamsChange - Callback to update parameters in parent
 * @param onRunSimulation - Callback to trigger simulation execution
 * @param totalNetWorth - User's total net worth for quick-select
 * @param liquidNetWorth - User's liquid net worth for quick-select
 * @param isRunning - Whether simulation is currently executing
 * @param hideMarketParams - When true, hides market params section (scenario mode manages them)
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
  // ===== Input State Management =====
  // All numeric input fields maintain local string state to allow partial input during typing.
  // Values sync with parent params only on blur after validation.

  // Asset allocation inputs (all 4 must sum to 100%)
  const [equityInput, setEquityInput] = useState<string>(params.equityPercentage.toString());
  const [bondsInput, setBondsInput] = useState<string>(params.bondsPercentage.toString());
  const [realEstateInput, setRealEstateInput] = useState<string>(params.realEstatePercentage.toString());
  const [commoditiesInput, setCommoditiesInput] = useState<string>(params.commoditiesPercentage.toString());

  // Initial portfolio (formatted in Italian locale with decimal places)
  const [initialPortfolioInput, setInitialPortfolioInput] = useState<string>(
    params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  // Market parameters (return and volatility for each asset class, plus inflation rate)
  const [equityReturnInput, setEquityReturnInput] = useState<string>(params.equityReturn.toFixed(1));
  const [equityVolatilityInput, setEquityVolatilityInput] = useState<string>(params.equityVolatility.toFixed(1));
  const [bondsReturnInput, setBondsReturnInput] = useState<string>(params.bondsReturn.toFixed(1));
  const [bondsVolatilityInput, setBondsVolatilityInput] = useState<string>(params.bondsVolatility.toFixed(1));
  const [realEstateReturnInput, setRealEstateReturnInput] = useState<string>(params.realEstateReturn.toFixed(1));
  const [realEstateVolatilityInput, setRealEstateVolatilityInput] = useState<string>(params.realEstateVolatility.toFixed(1));
  const [commoditiesReturnInput, setCommoditiesReturnInput] = useState<string>(params.commoditiesReturn.toFixed(1));
  const [commoditiesVolatilityInput, setCommoditiesVolatilityInput] = useState<string>(params.commoditiesVolatility.toFixed(1));
  const [inflationRateInput, setInflationRateInput] = useState<string>(params.inflationRate.toFixed(1));

  // Sync initialPortfolio input when params change (e.g., from buttons)
  useEffect(() => {
    setInitialPortfolioInput(
      params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }, [params.initialPortfolio]);

  /**
   * Generic helper to update a single parameter and trigger parent callback.
   * Uses TypeScript generics to ensure type safety for all parameter keys.
   */
  const updateParam = <K extends keyof MonteCarloParams>(
    key: K,
    value: MonteCarloParams[K]
  ) => {
    onParamsChange({ ...params, [key]: value });
  };

  /**
   * Quick-select buttons for portfolio initialization.
   * Round values to avoid decimal precision issues in calculations.
   */
  const handleUseTotalPortfolio = () => {
    updateParam('initialPortfolio', Math.round(totalNetWorth));
  };

  const handleUseLiquidPortfolio = () => {
    updateParam('initialPortfolio', Math.round(liquidNetWorth));
  };

  // ===== Asset Allocation Handlers =====
  // With 4 asset classes, auto-complement is ambiguous, so each field is independent.
  // Validation shows current sum and error when not 100%.

  const allocationSum = params.equityPercentage + params.bondsPercentage +
    params.realEstatePercentage + params.commoditiesPercentage;
  const allocationRemaining = 100 - allocationSum;

  /**
   * Generic blur handler for allocation fields.
   * Validates 0-100 range and syncs with parent. No auto-complement with 4 classes.
   */
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

  // ===== Initial Portfolio Handlers =====

  const handleInitialPortfolioChange = (value: string) => {
    // Allow user to type freely (including partial numbers, formatting characters)
    setInitialPortfolioInput(value);
  };

  /**
   * Parses and validates initial portfolio value from Italian locale format.
   *
   * Italian number format: Uses comma as decimal separator (e.g., "1.234,56" = 1234.56)
   * vs US format which uses period (e.g., "1,234.56" = 1234.56)
   *
   * Parsing strategy:
   * 1. Strip all characters except digits, comma, dot, and minus sign
   * 2. Replace Italian comma decimal separator with dot for parseFloat()
   * 3. Validate result is a positive number
   * 4. Round to integer (fractional currency not needed for portfolio totals)
   * 5. Format back to Italian locale for display
   *
   * Example: User types "50.000,00" -> parses as 50000.00 -> displays as "50.000,00"
   */
  const handleInitialPortfolioBlur = () => {
    // Strip all non-numeric characters except comma (decimal) and dot (thousands) and minus
    const cleanValue = initialPortfolioInput.replace(/[^\d,.-]/g, '');
    // Convert Italian decimal separator (comma) to JavaScript standard (dot)
    const normalizedValue = cleanValue.replace(',', '.');
    const value = parseFloat(normalizedValue);

    if (!isNaN(value) && value >= 0) {
      updateParam('initialPortfolio', Math.round(value));
      // Format the display value
      setInitialPortfolioInput(
        Math.round(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    } else {
      // Reset to current param value if invalid
      setInitialPortfolioInput(
        params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    }
  };

  // ===== Market Parameter Handlers =====

  /**
   * Generic blur handler for all market parameters (return/volatility per asset class, inflation).
   * Validates input is within reasonable range (-100% to +100%) before updating.
   * Formats to 1 decimal place for consistency.
   */
  const handleMarketParamBlur = (
    paramKey: 'equityReturn' | 'equityVolatility' | 'bondsReturn' | 'bondsVolatility' |
      'realEstateReturn' | 'realEstateVolatility' | 'commoditiesReturn' | 'commoditiesVolatility' | 'inflationRate',
    inputValue: string,
    setInputState: (value: string) => void,
    fallbackValue: number
  ) => {
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value >= -100 && value <= 100) {
      updateParam(paramKey, value);
      setInputState(value.toFixed(1));
    } else {
      // Reset to fallback if invalid
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
        {/* Instructions */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex gap-2">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-2">Come Funziona</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Vengono eseguite migliaia di simulazioni con rendimenti casuali</li>
                <li>Ogni simulazione parte dal patrimonio iniziale e preleva annualmente</li>
                <li>I rendimenti sono generati seguendo una distribuzione normale</li>
                <li>
                  La <strong>probabilità di successo</strong> indica in quante simulazioni
                  il patrimonio dura almeno {params.retirementYears} anni
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Portfolio Source */}
        <div className="space-y-3">
          <Label htmlFor="initialPortfolio" className="text-base font-semibold">
            Patrimonio Iniziale
          </Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseTotalPortfolio}
              className="flex-1"
            >
              Usa Patrimonio Totale ({formatCurrency(totalNetWorth)})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseLiquidPortfolio}
              className="flex-1"
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

        {/* Retirement Years & Annual Withdrawal */}
        <div className="grid gap-4 md:grid-cols-2">
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
            <p className="mt-1 text-xs text-muted-foreground">
              Spesa annuale durante il pensionamento
            </p>
          </div>
        </div>

        {/* Asset Allocation — 4 classes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Asset Allocation</Label>
            {/* Show remaining allocation to help user balance to 100% */}
            <span className={`text-xs font-medium ${
              Math.abs(allocationRemaining) < 0.01 ? 'text-green-600' :
              allocationRemaining > 0 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {Math.abs(allocationRemaining) < 0.01
                ? 'Totale: 100%'
                : `Rimanente: ${allocationRemaining > 0 ? '+' : ''}${allocationRemaining.toFixed(1)}%`
              }
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="equityPercentage">Equity (%)</Label>
              <Input
                id="equityPercentage"
                type="number"
                value={equityInput}
                onChange={(e) => setEquityInput(e.target.value)}
                onBlur={() => handleAllocationBlur('equityPercentage', equityInput, setEquityInput, params.equityPercentage)}
                onWheel={(e) => e.currentTarget.blur()}
                min="0"
                max="100"
                step="5"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="bondsPercentage">Bonds (%)</Label>
              <Input
                id="bondsPercentage"
                type="number"
                value={bondsInput}
                onChange={(e) => setBondsInput(e.target.value)}
                onBlur={() => handleAllocationBlur('bondsPercentage', bondsInput, setBondsInput, params.bondsPercentage)}
                onWheel={(e) => e.currentTarget.blur()}
                min="0"
                max="100"
                step="5"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="realEstatePercentage">Immobili (%)</Label>
              <Input
                id="realEstatePercentage"
                type="number"
                value={realEstateInput}
                onChange={(e) => setRealEstateInput(e.target.value)}
                onBlur={() => handleAllocationBlur('realEstatePercentage', realEstateInput, setRealEstateInput, params.realEstatePercentage)}
                onWheel={(e) => e.currentTarget.blur()}
                min="0"
                max="100"
                step="5"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="commoditiesPercentage">Materie Prime (%)</Label>
              <Input
                id="commoditiesPercentage"
                type="number"
                value={commoditiesInput}
                onChange={(e) => setCommoditiesInput(e.target.value)}
                onBlur={() => handleAllocationBlur('commoditiesPercentage', commoditiesInput, setCommoditiesInput, params.commoditiesPercentage)}
                onWheel={(e) => e.currentTarget.blur()}
                min="0"
                max="100"
                step="5"
                className="mt-1"
              />
            </div>
          </div>
          {Math.abs(allocationSum - 100) > 0.01 && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              La somma delle allocazioni deve essere 100% (attuale: {allocationSum.toFixed(1)}%)
            </p>
          )}
        </div>

        {/* Market Parameters — hidden in scenario mode */}
        {!hideMarketParams && (
          <>
            <div className="space-y-3">
              <Label className="text-base font-semibold">Parametri di Mercato</Label>
              <p className="text-xs text-muted-foreground">
                Valori default basati su medie storiche di lungo periodo. Modifica per testare scenari diversi.
              </p>
            </div>
            <div className="space-y-4">
              {/* Equity */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="equityReturn">Rendimento Equity (%/anno)</Label>
                  <Input
                    id="equityReturn"
                    type="number"
                    value={equityReturnInput}
                    onChange={(e) => setEquityReturnInput(e.target.value)}
                    onBlur={() => handleMarketParamBlur('equityReturn', equityReturnInput, setEquityReturnInput, params.equityReturn)}
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
                    onBlur={() => handleMarketParamBlur('equityVolatility', equityVolatilityInput, setEquityVolatilityInput, params.equityVolatility)}
                    onWheel={(e) => e.currentTarget.blur()}
                    step="0.1"
                    className="mt-1"
                  />
                </div>
              </div>
              {/* Bonds */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="bondsReturn">Rendimento Bonds (%/anno)</Label>
                  <Input
                    id="bondsReturn"
                    type="number"
                    value={bondsReturnInput}
                    onChange={(e) => setBondsReturnInput(e.target.value)}
                    onBlur={() => handleMarketParamBlur('bondsReturn', bondsReturnInput, setBondsReturnInput, params.bondsReturn)}
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
                    onBlur={() => handleMarketParamBlur('bondsVolatility', bondsVolatilityInput, setBondsVolatilityInput, params.bondsVolatility)}
                    onWheel={(e) => e.currentTarget.blur()}
                    step="0.1"
                    className="mt-1"
                  />
                </div>
              </div>
              {/* Real Estate */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="realEstateReturn">Rendimento Immobili (%/anno)</Label>
                  <Input
                    id="realEstateReturn"
                    type="number"
                    value={realEstateReturnInput}
                    onChange={(e) => setRealEstateReturnInput(e.target.value)}
                    onBlur={() => handleMarketParamBlur('realEstateReturn', realEstateReturnInput, setRealEstateReturnInput, params.realEstateReturn)}
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
                    onBlur={() => handleMarketParamBlur('realEstateVolatility', realEstateVolatilityInput, setRealEstateVolatilityInput, params.realEstateVolatility)}
                    onWheel={(e) => e.currentTarget.blur()}
                    step="0.1"
                    className="mt-1"
                  />
                </div>
              </div>
              {/* Commodities */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="commoditiesReturn">Rendimento Materie Prime (%/anno)</Label>
                  <Input
                    id="commoditiesReturn"
                    type="number"
                    value={commoditiesReturnInput}
                    onChange={(e) => setCommoditiesReturnInput(e.target.value)}
                    onBlur={() => handleMarketParamBlur('commoditiesReturn', commoditiesReturnInput, setCommoditiesReturnInput, params.commoditiesReturn)}
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
                    onBlur={() => handleMarketParamBlur('commoditiesVolatility', commoditiesVolatilityInput, setCommoditiesVolatilityInput, params.commoditiesVolatility)}
                    onWheel={(e) => e.currentTarget.blur()}
                    step="0.1"
                    className="mt-1"
                  />
                </div>
              </div>
              {/* Inflation */}
              <div>
                <Label htmlFor="inflationRate">Inflazione (%/anno)</Label>
                <Input
                  id="inflationRate"
                  type="number"
                  value={inflationRateInput}
                  onChange={(e) => setInflationRateInput(e.target.value)}
                  onBlur={() => handleMarketParamBlur('inflationRate', inflationRateInput, setInflationRateInput, params.inflationRate)}
                  onWheel={(e) => e.currentTarget.blur()}
                  step="0.1"
                  className="mt-1"
                />
              </div>
            </div>
          </>
        )}

        {/* Number of Simulations */}
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

        {/* Run Simulation Button */}
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
