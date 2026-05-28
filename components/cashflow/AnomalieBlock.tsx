/**
 * Conditional anomaly block for AnalisiTab.
 *
 * Renders only when anomalie.length > 0. Each chip is clickable and
 * navigates to the pie chart drill-down for that category.
 *
 * DESIGN: amber tint background, flat divide-y list on mobile,
 * horizontal chip row on desktop.
 *
 * ALGORITHM: anomalies are spending categories whose current-month total
 * exceeds the 6-month rolling average by >25% AND >€50 in absolute terms.
 * The parent (AnalisiTab) computes anomalieData and passes it here.
 */
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/services/chartService';

export interface AnomaliaItem {
  category: string;
  currentTotal: number;
  referenceAverage: number;
  deltaPercent: number;
  absoluteDelta: number;
}

interface AnomalieBlockProps {
  anomalie: AnomaliaItem[];
  onCategoryClick: (category: string) => void;
}

export function AnomalieBlock({ anomalie, onCategoryClick }: AnomalieBlockProps) {
  if (anomalie.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-950/20 px-4 py-3 space-y-3">
      {/* Header + legenda formato */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Da controllare
          </p>
        </div>
        <p className="text-xs text-amber-600/70 dark:text-amber-400/60 pl-6">
          Spesa superiore alla media degli ultimi 6 mesi · (media → mese selezionato)
        </p>
      </div>

      {/* Chips — wrap on all viewports */}
      <div className="flex flex-wrap gap-2">
        {anomalie.map((a) => (
          <button
            key={a.category}
            type="button"
            onClick={() => onCategoryClick(a.category)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 dark:border-amber-700/40 bg-amber-100/60 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-colors"
          >
            <span className="font-semibold">{a.category}</span>
            <span className="text-amber-700 dark:text-amber-300 font-mono">
              +{a.deltaPercent.toFixed(0)}%
            </span>
            <span className="text-xs text-amber-600/80 dark:text-amber-400/80 font-mono">
              ({formatCurrency(a.referenceAverage)} → {formatCurrency(a.currentTotal)})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
