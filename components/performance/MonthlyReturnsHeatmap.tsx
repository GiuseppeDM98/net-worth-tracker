'use client';

import { MonthlyReturnHeatmapData } from '@/types/performance';
import { formatPercentage } from '@/lib/services/chartService';

interface MonthlyReturnsHeatmapProps {
  data: MonthlyReturnHeatmapData[];
}

const MONTH_NAMES = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/**
 * Get background color for a return percentage
 * Uses a red-to-green color scale:
 * - Strongly negative (< -5%): Dark red
 * - Negative (-5% to 0%): Light red
 * - Zero/Near-zero: Light gray
 * - Positive (0% to +5%): Light green
 * - Strongly positive (> +5%): Dark green
 */
function getReturnColor(returnValue: number | null): string {
  if (returnValue === null) return 'bg-muted'; // No data

  if (returnValue <= -5) return 'bg-red-600 dark:bg-red-700';
  if (returnValue < -2) return 'bg-red-400 dark:bg-red-500';
  if (returnValue < 0) return 'bg-red-200 dark:bg-red-400';
  if (returnValue === 0) return 'bg-gray-200 dark:bg-gray-700';
  if (returnValue < 2) return 'bg-green-200 dark:bg-green-400';
  if (returnValue < 5) return 'bg-green-400 dark:bg-green-500';
  return 'bg-green-600 dark:bg-green-700';
}

/**
 * Get text color based on background intensity
 */
function getTextColor(returnValue: number | null): string {
  if (returnValue === null) return 'text-muted-foreground';
  if (Math.abs(returnValue) >= 5) return 'text-white';
  if (Math.abs(returnValue) >= 2) return 'text-foreground';
  return 'text-foreground';
}

export function MonthlyReturnsHeatmap({ data }: MonthlyReturnsHeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Dati insufficienti per visualizzare l'heatmap dei rendimenti mensili
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-border p-2 bg-muted font-semibold text-left">Anno</th>
            {MONTH_NAMES.map((month) => (
              <th key={month} className="border border-border p-2 bg-muted font-semibold text-center">
                {month}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((yearData) => (
            <tr key={yearData.year}>
              <td className="border border-border p-2 bg-muted font-semibold">{yearData.year}</td>
              {yearData.months.map((monthData) => {
                const bgColor = getReturnColor(monthData.return);
                const textColor = getTextColor(monthData.return);

                return (
                  <td
                    key={monthData.month}
                    className={`border border-border p-2 text-center ${bgColor} ${textColor}`}
                    title={
                      monthData.return !== null
                        ? `${MONTH_NAMES[monthData.month - 1]} ${yearData.year}: ${formatPercentage(monthData.return)}`
                        : 'Nessun dato disponibile'
                    }
                  >
                    {monthData.return !== null ? formatPercentage(monthData.return) : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
