import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

interface SuccessRateCardProps {
  successRate: number;
  successCount: number;
  totalSimulations: number;
  retirementYears: number;
  medianFinalValue: number;
}

export function SuccessRateCard({
  successRate,
  successCount,
  totalSimulations,
  retirementYears,
  medianFinalValue,
}: SuccessRateCardProps) {
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSuccessIcon = (rate: number) => {
    if (rate >= 90) return <CheckCircle className="h-8 w-8 text-green-600" />;
    if (rate >= 80) return <TrendingUp className="h-8 w-8 text-yellow-600" />;
    return <AlertTriangle className="h-8 w-8 text-red-600" />;
  };

  const getSuccessMessage = (rate: number) => {
    if (rate >= 95) return 'Eccellente! Il tuo piano è molto sicuro.';
    if (rate >= 90) return 'Molto buono! Il tuo piano ha ottime probabilità di successo.';
    if (rate >= 80) return 'Buono, ma considera di aumentare il patrimonio o ridurre i prelievi.';
    if (rate >= 70) return 'Moderato. Valuta di aggiustare i parametri per maggiore sicurezza.';
    return 'Attenzione! Il tuo piano ha alte probabilità di fallimento.';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getSuccessIcon(successRate)}
          <span>Probabilità di Successo</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Success Rate */}
          <div className="text-center">
            <div className={`text-6xl font-bold ${getSuccessColor(successRate)}`}>
              {formatPercentage(successRate)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              In {successCount.toLocaleString('it-IT')} su{' '}
              {totalSimulations.toLocaleString('it-IT')} simulazioni il patrimonio
              dura almeno {retirementYears} anni
            </p>
          </div>

          {/* Success Message */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium text-center">
              {getSuccessMessage(successRate)}
            </p>
          </div>

          {/* Median Final Value */}
          {medianFinalValue > 0 && (
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Valore Mediano (solo simulazioni riuscite):
                </span>
                <span className="text-lg font-semibold">
                  {formatCurrency(medianFinalValue)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Valore mediano del patrimonio nelle simulazioni che durano almeno {retirementYears} anni
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
