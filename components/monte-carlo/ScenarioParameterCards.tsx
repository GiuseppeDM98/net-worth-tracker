import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TrendingDown, Target, TrendingUp, RotateCcw, Save } from 'lucide-react';
import { MonteCarloScenarios, MonteCarloScenarioParams } from '@/types/assets';

// Consistent scenario styling, same pattern as FIREProjectionSection
const SCENARIO_CONFIG = {
  bear: { label: 'Scenario Orso', icon: TrendingDown, bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-600', boldColor: 'text-red-700' },
  base: { label: 'Scenario Base', icon: Target, bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200', textColor: 'text-indigo-600', boldColor: 'text-indigo-700' },
  bull: { label: 'Scenario Toro', icon: TrendingUp, bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-600', boldColor: 'text-green-700' },
} as const;

type ScenarioKey = keyof typeof SCENARIO_CONFIG;

// Grouping of fields for display in the card
const ASSET_CLASS_FIELDS: {
  label: string;
  returnKey: keyof MonteCarloScenarioParams;
  volatilityKey: keyof MonteCarloScenarioParams;
}[] = [
  { label: 'Equity', returnKey: 'equityReturn', volatilityKey: 'equityVolatility' },
  { label: 'Bonds', returnKey: 'bondsReturn', volatilityKey: 'bondsVolatility' },
  { label: 'Immobili', returnKey: 'realEstateReturn', volatilityKey: 'realEstateVolatility' },
  { label: 'Mat. Prime', returnKey: 'commoditiesReturn', volatilityKey: 'commoditiesVolatility' },
];

interface ScenarioParameterCardsProps {
  scenarios: MonteCarloScenarios;
  onScenariosChange: (scenarios: MonteCarloScenarios) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
}

/**
 * Three side-by-side scenario parameter cards for Bear/Base/Bull configuration.
 *
 * Each card contains 9 editable fields: 4 return rates, 4 volatilities, and 1 inflation rate.
 * Uses compact layout (small inputs, grouped by return/volatility) to fit all params.
 * Parameters are persisted to Firestore via save button.
 */
export function ScenarioParameterCards({
  scenarios,
  onScenariosChange,
  onSave,
  onReset,
  isSaving,
}: ScenarioParameterCardsProps) {

  const updateScenarioField = (
    scenarioKey: ScenarioKey,
    field: keyof MonteCarloScenarioParams,
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    // Clamp: returns -20..+30, volatility 0..100, inflation -5..20
    if ((field.includes('Return') || field === 'inflationRate') && (numValue < -20 || numValue > 30)) return;
    if (field.includes('Volatility') && (numValue < 0 || numValue > 100)) return;

    onScenariosChange({
      ...scenarios,
      [scenarioKey]: {
        ...scenarios[scenarioKey],
        [field]: numValue,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Parametri Scenari</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Ripristina Default
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {isSaving ? 'Salvataggio...' : 'Salva Parametri'}
          </Button>
        </div>
      </div>

      {/* 3 scenario cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map((key) => {
          const config = SCENARIO_CONFIG[key];
          const Icon = config.icon;
          const scenario = scenarios[key];

          return (
            <Card key={key} className={`${config.borderColor} ${config.bgColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`flex items-center gap-2 text-base ${config.boldColor}`}>
                  <Icon className="h-4 w-4" />
                  {config.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Rendimenti + Volatilita per asset class */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Rendimenti e Volatilità (%)</p>
                  <div className="space-y-1.5">
                    {/* Header row */}
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground font-medium">
                      <span></span>
                      <span className="text-center">Rend.</span>
                      <span className="text-center">Vol.</span>
                    </div>
                    {ASSET_CLASS_FIELDS.map((field) => (
                      <div key={field.returnKey} className="grid grid-cols-3 gap-1 items-center">
                        <Label className="text-xs truncate">{field.label}</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={scenario[field.returnKey]}
                          onChange={(e) => updateScenarioField(key, field.returnKey, e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="h-7 text-xs text-center px-1"
                        />
                        <Input
                          type="number"
                          step="0.5"
                          value={scenario[field.volatilityKey]}
                          onChange={(e) => updateScenarioField(key, field.volatilityKey, e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="h-7 text-xs text-center px-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inflazione */}
                <div className="flex items-center gap-2 pt-1 border-t">
                  <Label className="text-xs whitespace-nowrap">Inflazione (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={scenario.inflationRate}
                    onChange={(e) => updateScenarioField(key, 'inflationRate', e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-7 text-xs text-center px-1 w-20"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
