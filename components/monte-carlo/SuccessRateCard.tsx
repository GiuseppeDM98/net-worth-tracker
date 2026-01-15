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

/**
 * Key metrics card displaying Monte Carlo simulation success rate with visual interpretation.
 *
 * Success definition: A simulation succeeds if the portfolio lasts at least retirementYears
 * without running out of money. Success rate = (successful simulations / total simulations) × 100.
 *
 * Three-tier visual rating system:
 * - Excellent (≥90%): Green with checkmark icon - Very safe retirement plan
 * - Caution (80-89%): Yellow with trending up icon - Acceptable but could be improved
 * - Danger (<80%): Red with warning icon - High risk of portfolio depletion
 *
 * Why these thresholds?
 * - 90%: Industry standard for "high confidence" retirement planning (similar to Trinity Study's 95%)
 * - 80%: Minimum acceptable success rate for most financial advisors
 * - Below 80%: Significant risk requiring parameter adjustments
 *
 * @param successRate - Percentage of successful simulations (0-100)
 * @param successCount - Number of successful simulations
 * @param totalSimulations - Total number of simulations run
 * @param retirementYears - Simulation duration in years
 * @param medianFinalValue - Median portfolio value at end (only for successful simulations)
 */
export function SuccessRateCard({
  successRate,
  successCount,
  totalSimulations,
  retirementYears,
  medianFinalValue,
}: SuccessRateCardProps) {
  /**
   * Returns color class based on success rate thresholds.
   * ≥90% = green (safe), ≥80% = yellow (caution), <80% = red (danger)
   */
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  /**
   * Returns appropriate icon based on success rate thresholds.
   * ≥90% = CheckCircle (success), ≥80% = TrendingUp (moderate), <80% = AlertTriangle (warning)
   */
  const getSuccessIcon = (rate: number) => {
    if (rate >= 90) return <CheckCircle className="h-8 w-8 text-green-600" />;
    if (rate >= 80) return <TrendingUp className="h-8 w-8 text-yellow-600" />;
    return <AlertTriangle className="h-8 w-8 text-red-600" />;
  };

  /**
   * Returns contextual guidance message based on success rate.
   *
   * Five-tier messaging:
   * - ≥95%: Excellent (very safe plan)
   * - 90-94%: Very good (high confidence)
   * - 80-89%: Good but suggest improvements (increase portfolio or reduce withdrawals)
   * - 70-79%: Moderate risk (recommend parameter adjustment)
   * - <70%: High risk (strong warning about failure probability)
   */
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

          {/* Median Final Value - Only displayed for successful simulations.

              Why only successful simulations?
              Failed simulations end with €0 (portfolio depleted), which would artificially
              lower the median. We want to show the typical final portfolio value for
              scenarios where the plan succeeds, giving users insight into how much wealth
              they're likely to preserve if they don't run out of money. */}
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
