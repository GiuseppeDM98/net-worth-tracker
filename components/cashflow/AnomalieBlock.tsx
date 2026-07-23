/**
 * Conditional anomaly block for AnalisiTab.
 *
 * Renders only when anomalie.length > 0. Each chip is clickable and
 * navigates to the pie chart drill-down for that category.
 *
 * DESIGN: filled warning banner via the theme-aware --warning/--warning-foreground/
 * --warning-border tokens (same set as the low-balance banner in dashboard/layout.tsx)
 * — NOT raw amber-* Tailwind classes, which stay literal amber regardless of theme.
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
    <div className="rounded-xl border border-warning-border bg-warning px-4 py-3 space-y-3">
      {/* Header + legenda formato */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-widest text-warning-foreground">
            Da controllare
          </p>
        </div>
        <p className="text-xs text-warning-foreground/70 pl-6">
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
            className="inline-flex items-center gap-1.5 rounded-full border border-warning-border bg-warning-foreground/10 px-3 py-1.5 text-sm font-medium text-warning-foreground hover:bg-warning-foreground/15 transition-colors"
          >
            <span className="font-semibold">{a.category}</span>
            <span className="font-mono">
              +{a.deltaPercent.toFixed(0)}%
            </span>
            <span className="text-xs text-warning-foreground/80 font-mono">
              ({formatCurrency(a.referenceAverage)} → {formatCurrency(a.currentTotal)})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
