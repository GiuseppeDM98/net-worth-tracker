import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Settings, Info } from 'lucide-react';
import { MonteCarloParams, PortfolioSource, HistoricalReturnsData } from '@/types/assets';
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
  const [customPortfolio, setCustomPortfolio] = useState<string>('');

  const isHistoricalAvailable = historicalReturns !== null;
  const availableMonths = historicalReturns?.availableMonths ?? 0;

  const updateParam = <K extends keyof MonteCarloParams>(
    key: K,
    value: MonteCarloParams[K]
  ) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handlePortfolioSourceChange = (source: PortfolioSource) => {
    updateParam('portfolioSource', source);
    if (source === 'total') {
      updateParam('initialPortfolio', totalNetWorth);
      setCustomPortfolio('');
    } else if (source === 'liquid') {
      updateParam('initialPortfolio', liquidNetWorth);
      setCustomPortfolio('');
    }
  };

  const handleCustomPortfolioChange = (value: string) => {
    setCustomPortfolio(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      updateParam('initialPortfolio', numValue);
    }
  };

  const handleParameterSourceToggle = (useHistorical: boolean) => {
    if (useHistorical && historicalReturns) {
      updateParam('parameterSource', 'historical');
      updateParam('equityReturn', historicalReturns.equity.mean);
      updateParam('equityVolatility', historicalReturns.equity.volatility);
      updateParam('bondsReturn', historicalReturns.bonds.mean);
      updateParam('bondsVolatility', historicalReturns.bonds.volatility);
    } else {
      updateParam('parameterSource', 'market');
      // Reset to market defaults
      updateParam('equityReturn', 7.0);
      updateParam('equityVolatility', 18.0);
      updateParam('bondsReturn', 3.0);
      updateParam('bondsVolatility', 6.0);
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
          <Label className="text-base font-semibold">Patrimonio Iniziale</Label>
          <div className="grid gap-3">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="total"
                name="portfolioSource"
                checked={params.portfolioSource === 'total'}
                onChange={() => handlePortfolioSourceChange('total')}
                className="h-4 w-4"
              />
              <Label htmlFor="total" className="cursor-pointer font-normal">
                Patrimonio Totale ({formatCurrency(totalNetWorth)})
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="liquid"
                name="portfolioSource"
                checked={params.portfolioSource === 'liquid'}
                onChange={() => handlePortfolioSourceChange('liquid')}
                className="h-4 w-4"
              />
              <Label htmlFor="liquid" className="cursor-pointer font-normal">
                Patrimonio Liquido ({formatCurrency(liquidNetWorth)})
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="custom"
                name="portfolioSource"
                checked={params.portfolioSource === 'custom'}
                onChange={() => handlePortfolioSourceChange('custom')}
                className="h-4 w-4"
              />
              <Label htmlFor="custom" className="cursor-pointer font-normal">
                Valore Personalizzato
              </Label>
            </div>
            {params.portfolioSource === 'custom' && (
              <Input
                type="number"
                placeholder="Inserisci importo (€)"
                value={customPortfolio}
                onChange={(e) => handleCustomPortfolioChange(e.target.value)}
                className="ml-6"
                step="1000"
                min="0"
              />
            )}
          </div>
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
              onChange={(e) => updateParam('annualWithdrawal', parseFloat(e.target.value) || 0)}
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
                value={params.equityPercentage}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  updateParam('equityPercentage', value);
                  updateParam('bondsPercentage', 100 - value);
                }}
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
                value={params.bondsPercentage}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  updateParam('bondsPercentage', value);
                  updateParam('equityPercentage', 100 - value);
                }}
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
                value={params.equityReturn.toFixed(1)}
                onChange={(e) => updateParam('equityReturn', parseFloat(e.target.value) || 0)}
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
                value={params.equityVolatility.toFixed(1)}
                onChange={(e) =>
                  updateParam('equityVolatility', parseFloat(e.target.value) || 0)
                }
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
                value={params.bondsReturn.toFixed(1)}
                onChange={(e) => updateParam('bondsReturn', parseFloat(e.target.value) || 0)}
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
                value={params.bondsVolatility.toFixed(1)}
                onChange={(e) =>
                  updateParam('bondsVolatility', parseFloat(e.target.value) || 0)
                }
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
              value={params.inflationRate.toFixed(1)}
              onChange={(e) => updateParam('inflationRate', parseFloat(e.target.value) || 0)}
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
