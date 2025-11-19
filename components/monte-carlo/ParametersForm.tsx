import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Settings, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { MonteCarloParams, HistoricalReturnsData } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { useState } from 'react';

interface ParametersFormProps {
  params: MonteCarloParams;
  onParamsChange: (params: MonteCarloParams) => void;
  onRunSimulation: () => void;
  totalNetWorth: number;
  liquidNetWorth: number;
  historicalReturns: HistoricalReturnsData | null;
  isRunning: boolean;
}

export function ParametersForm({
  params,
  onParamsChange,
  onRunSimulation,
  totalNetWorth,
  liquidNetWorth,
  historicalReturns,
  isRunning,
}: ParametersFormProps) {
  const [equityInput, setEquityInput] = useState<string>(params.equityPercentage.toString());
  const [bondsInput, setBondsInput] = useState<string>(params.bondsPercentage.toString());

  // Market parameters local state
  const [equityReturnInput, setEquityReturnInput] = useState<string>(params.equityReturn.toFixed(1));
  const [equityVolatilityInput, setEquityVolatilityInput] = useState<string>(params.equityVolatility.toFixed(1));
  const [bondsReturnInput, setBondsReturnInput] = useState<string>(params.bondsReturn.toFixed(1));
  const [bondsVolatilityInput, setBondsVolatilityInput] = useState<string>(params.bondsVolatility.toFixed(1));
  const [inflationRateInput, setInflationRateInput] = useState<string>(params.inflationRate.toFixed(1));

  // Collapsible state for technical details
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  const isHistoricalAvailable = historicalReturns !== null;
  const availableMonths = historicalReturns?.availableMonths ?? 0;

  const updateParam = <K extends keyof MonteCarloParams>(
    key: K,
    value: MonteCarloParams[K]
  ) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleUseTotalPortfolio = () => {
    updateParam('initialPortfolio', Math.round(totalNetWorth));
  };

  const handleUseLiquidPortfolio = () => {
    updateParam('initialPortfolio', Math.round(liquidNetWorth));
  };

  const handleEquityChange = (value: string) => {
    setEquityInput(value);
  };

  const handleBondsChange = (value: string) => {
    setBondsInput(value);
  };

  const handleEquityBlur = () => {
    const value = parseFloat(equityInput);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateParam('equityPercentage', value);
      updateParam('bondsPercentage', 100 - value);
      setBondsInput((100 - value).toString());
    } else {
      setEquityInput(params.equityPercentage.toString());
    }
  };

  const handleBondsBlur = () => {
    const value = parseFloat(bondsInput);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateParam('bondsPercentage', value);
      updateParam('equityPercentage', 100 - value);
      setEquityInput((100 - value).toString());
    } else {
      setBondsInput(params.bondsPercentage.toString());
    }
  };

  // Market parameter handlers
  const handleMarketParamBlur = (
    paramKey: 'equityReturn' | 'equityVolatility' | 'bondsReturn' | 'bondsVolatility' | 'inflationRate',
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

  const handleParameterSourceToggle = (useHistorical: boolean) => {
    if (useHistorical && historicalReturns) {
      updateParam('parameterSource', 'historical');
      updateParam('equityReturn', historicalReturns.equity.mean);
      updateParam('equityVolatility', historicalReturns.equity.volatility);
      updateParam('bondsReturn', historicalReturns.bonds.mean);
      updateParam('bondsVolatility', historicalReturns.bonds.volatility);
      // Update local state
      setEquityReturnInput(historicalReturns.equity.mean.toFixed(1));
      setEquityVolatilityInput(historicalReturns.equity.volatility.toFixed(1));
      setBondsReturnInput(historicalReturns.bonds.mean.toFixed(1));
      setBondsVolatilityInput(historicalReturns.bonds.volatility.toFixed(1));
    } else {
      updateParam('parameterSource', 'market');
      // Reset to market defaults
      updateParam('equityReturn', 7.0);
      updateParam('equityVolatility', 18.0);
      updateParam('bondsReturn', 3.0);
      updateParam('bondsVolatility', 6.0);
      // Update local state
      setEquityReturnInput('7.0');
      setEquityVolatilityInput('18.0');
      setBondsReturnInput('3.0');
      setBondsVolatilityInput('6.0');
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
            type="number"
            placeholder="Inserisci importo (€)"
            value={params.initialPortfolio}
            onChange={(e) => updateParam('initialPortfolio', parseInt(e.target.value, 10) || 0)}
            onWheel={(e) => e.currentTarget.blur()}
            step="1000"
            min="0"
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

        {/* Asset Allocation */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Asset Allocation</Label>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="equityPercentage">Equity (%)</Label>
              <Input
                id="equityPercentage"
                type="number"
                value={equityInput}
                onChange={(e) => handleEquityChange(e.target.value)}
                onBlur={handleEquityBlur}
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
                onChange={(e) => handleBondsChange(e.target.value)}
                onBlur={handleBondsBlur}
                onWheel={(e) => e.currentTarget.blur()}
                min="0"
                max="100"
                step="5"
                className="mt-1"
              />
            </div>
          </div>
          {Math.abs(params.equityPercentage + params.bondsPercentage - 100) > 0.01 && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              La somma deve essere 100%
            </p>
          )}
        </div>

        {/* Market vs Historical Parameters Explanation */}
        <div className="space-y-2">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-2">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-2">Parametri di Mercato vs Storici</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Parametri di Mercato</strong>: Valori medi storici generali
                    (Equity: 7% rendimento / 18% volatilità, Bonds: 3% / 6%)
                  </li>
                  <li>
                    <strong>Parametri Storici</strong>: Calcolati dai tuoi snapshot mensili reali
                    analizzando i rendimenti passati dei tuoi investimenti in equity e bonds
                  </li>
                  <li>
                    I parametri storici riflettono il <strong>tuo comportamento</strong> di investimento
                    reale e le tue allocazioni specifiche
                  </li>
                  <li>
                    Requisito minimo: <strong>24 snapshot mensili</strong> per avere dati statisticamente significativi
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Technical Details Collapsible */}
          <div className="border border-blue-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="w-full p-3 bg-blue-100 hover:bg-blue-150 transition-colors flex items-center justify-between text-left"
            >
              <span className="text-sm font-semibold text-blue-900">Dettagli Tecnici del Calcolo</span>
              {showTechnicalDetails ? (
                <ChevronUp className="h-4 w-4 text-blue-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-blue-600" />
              )}
            </button>

            {showTechnicalDetails && (
              <div className="p-4 bg-blue-50 text-sm text-blue-900 space-y-3">
                <div>
                  <p className="font-semibold mb-1">Come vengono calcolati i parametri storici:</p>
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li>
                      <strong>Calcolo dei rendimenti mensili</strong>: Per ogni mese viene calcolato
                      il rendimento percentuale degli asset equity e bonds separatamente
                    </li>
                    <li>
                      <strong>Filtraggio degli outlier</strong>: I rendimenti mensili superiori a +50%
                      o inferiori a -50% vengono scartati, in quanto probabilmente dovuti a depositi
                      o prelievi piuttosto che a performance di mercato
                    </li>
                    <li>
                      <strong>Annualizzazione dei rendimenti</strong>: La media dei rendimenti mensili
                      viene annualizzata usando la formula composta: ((1 + rendimento_mensile)<sup>12</sup> - 1) × 100
                    </li>
                    <li>
                      <strong>Calcolo della volatilità</strong>: La deviazione standard dei rendimenti
                      mensili viene calcolata e poi annualizzata moltiplicandola per √12
                    </li>
                    <li>
                      <strong>Requisiti minimi</strong>: Servono almeno 24 snapshot mensili e 12 rendimenti
                      mensili validi (dopo il filtraggio) per ogni asset class
                    </li>
                  </ol>
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-xs italic">
                    Questo approccio statistico garantisce che i parametri riflettano accuratamente
                    la tua esperienza di investimento personale, escludendo anomalie dovute a movimenti
                    di capitale.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Historical vs Market Parameters Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">Parametri di Mercato</Label>
              <p className="text-xs text-muted-foreground">
                {isHistoricalAvailable
                  ? `Usa dati storici personali (${historicalReturns.availableMonths} mesi disponibili)`
                  : 'Servono almeno 24 snapshot mensili per parametri storici'}
              </p>
            </div>
            <Switch
              checked={params.parameterSource === 'historical'}
              onCheckedChange={handleParameterSourceToggle}
              disabled={!isHistoricalAvailable}
            />
          </div>

          {!isHistoricalAvailable && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-900">
                  Per utilizzare parametri storici personali servono almeno 24 snapshot
                  mensili. Attualmente ne hai {availableMonths}.
                  Continua a tracciare il tuo patrimonio!
                </p>
              </div>
            </div>
          )}

          {params.parameterSource === 'historical' && historicalReturns && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-900">
                Parametri calcolati dai tuoi snapshot dal {historicalReturns.startDate} al{' '}
                {historicalReturns.endDate}
              </p>
            </div>
          )}
        </div>

        {/* Market Parameters */}
        <div className="space-y-4">
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
                disabled={params.parameterSource === 'historical'}
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
                disabled={params.parameterSource === 'historical'}
                className="mt-1"
              />
            </div>
          </div>
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
                disabled={params.parameterSource === 'historical'}
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
                disabled={params.parameterSource === 'historical'}
                className="mt-1"
              />
            </div>
          </div>
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
