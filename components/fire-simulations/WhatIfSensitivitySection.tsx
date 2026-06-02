'use client';

/**
 * Sensitivity matrix for the What If tab: how the years-to-FIRE in the Base scenario change
 * when annual expenses (rows) and annual savings (columns) move around a baseline.
 *
 * Relocated here from FireCalculatorTab — it is a structural "what-if" device and belongs
 * with the scenario exploration. The baseline expenses are a LOCAL override (defaulting to
 * the user's actual annual expenses); nothing is persisted, keeping this an exploration
 * surface rather than settings management.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { FIREProjectionScenarios } from '@/types/assets';
import { calculateFIRESensitivityMatrix } from '@/lib/services/fireService';
import type { FIRESensitivityCell } from '@/lib/services/fireService';
import { formatCurrency } from '@/lib/services/chartService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HelpCircle } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface WhatIfSensitivitySectionProps {
  currentNetWorth: number;
  withdrawalRate: number;
  annualSavings: number;
  annualExpenses: number;
  scenarios: FIREProjectionScenarios;
}

// Tints a sensitivity cell by its relation to the baseline, using runtime theme colors.
function cellStyle(
  relation: FIRESensitivityCell['relationToBaseline'],
  colors: { base: string; better: string; worse: string }
): CSSProperties {
  const map: Record<FIRESensitivityCell['relationToBaseline'], string> = {
    baseline: colors.base,
    better: colors.better,
    worse: colors.worse,
    neutral: '',
  };
  const color = map[relation];
  if (!color) {
    return {
      borderColor: 'var(--border)',
      backgroundColor: 'color-mix(in srgb, var(--muted) 20%, transparent)',
    };
  }
  return {
    borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
  };
}

export function WhatIfSensitivitySection({
  currentNetWorth,
  withdrawalRate,
  annualSavings,
  annualExpenses,
  scenarios,
}: WhatIfSensitivitySectionProps) {
  const chartColors = useChartColors();
  // Semantic mapping: Base → primary [0], better (fewer years) → green [1], worse → red [4]
  const relationColors = { base: chartColors[0], better: chartColors[1], worse: chartColors[4] };

  const [baselineExpensesInput, setBaselineExpensesInput] = useState('');
  const parsedBaseline = Number.parseFloat(baselineExpensesInput);
  const baselineExpenses =
    Number.isFinite(parsedBaseline) && parsedBaseline > 0 ? parsedBaseline : annualExpenses;

  const matrix = useMemo(() => {
    if (currentNetWorth <= 0 || baselineExpenses <= 0 || withdrawalRate <= 0) return null;
    return calculateFIRESensitivityMatrix(
      currentNetWorth,
      baselineExpenses,
      annualSavings,
      withdrawalRate,
      scenarios
    );
  }, [annualSavings, baselineExpenses, currentNetWorth, scenarios, withdrawalRate]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Sensibilità Anni al FIRE
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Spiega come leggere la matrice di sensibilità FIRE"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                Righe = spese annue. Colonne = risparmio annuo. Ogni cella mostra quanti anni
                servono per raggiungere il FIRE nello scenario Base. Blu = baseline, verde = meglio
                del baseline, rosso = peggio.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>
          Scenario Base: come cambiano gli anni al FIRE variando spese annue e risparmio annuo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Baseline expenses — local override, defaults to actual expenses */}
        <div className="max-w-xs">
          <Label htmlFor="sensitivityBaselineExpenses" className="mb-1 block text-sm">
            Spese annue di riferimento (€)
          </Label>
          <Input
            id="sensitivityBaselineExpenses"
            type="number"
            step="100"
            min="0"
            inputMode="numeric"
            value={baselineExpensesInput}
            onChange={(e) => setBaselineExpensesInput(e.target.value)}
            placeholder={annualExpenses > 0 ? String(Math.round(annualExpenses)) : 'Es. 25000'}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Centra la matrice su un livello di spesa diverso. Vuoto = spese reali.
          </p>
        </div>

        {matrix ? (
          <>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Leggila cos&igrave;: scendi lungo le{' '}
              <span className="font-medium text-foreground">righe</span> per variare le spese annue,
              spostati sulle <span className="font-medium text-foreground">colonne</span> per cambiare
              il risparmio annuo. La <span className="font-medium text-foreground">cella</span> indica
              in quanti anni arrivi al FIRE nello scenario Base.
            </div>

            {/* Mobile: per-row cards */}
            <div className="space-y-3 desktop:hidden">
              {matrix.rows.map((row) => (
                <div key={row.label} className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{row.label} spese</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(row.annualExpenses)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {row.cells.map((cell, index) => (
                      <div
                        key={`${row.label}-${matrix.columns[index].label}`}
                        className="rounded-md border p-2"
                        style={cellStyle(cell.relationToBaseline, relationColors)}
                      >
                        <p className="text-[11px] text-muted-foreground">
                          {matrix.columns[index].label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(cell.annualSavings)}
                        </p>
                        <p className="mt-1 font-mono text-base font-semibold text-foreground">
                          {cell.yearsToFIRE !== null ? `${cell.yearsToFIRE} anni` : '50+ anni'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: full matrix table */}
            <div className="hidden overflow-x-auto desktop:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Spese annue
                    </th>
                    {matrix.columns.map((column) => (
                      <th
                        key={column.label}
                        scope="col"
                        className="px-3 py-2 text-center font-medium text-muted-foreground"
                      >
                        <div>{column.label}</div>
                        <div className="text-xs font-normal">
                          {formatCurrency(column.annualSavings)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.label} className="border-b border-border/70">
                      <th scope="row" className="px-3 py-3 text-left font-normal">
                        <div className="font-medium text-foreground">{row.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(row.annualExpenses)}
                        </div>
                      </th>
                      {row.cells.map((cell, index) => (
                        <td key={`${row.label}-${matrix.columns[index].label}`} className="px-3 py-3">
                          <div
                            className="rounded-md border px-3 py-2 text-center"
                            style={cellStyle(cell.relationToBaseline, relationColors)}
                          >
                            <span className="font-mono font-semibold text-foreground">
                              {cell.yearsToFIRE !== null ? `${cell.yearsToFIRE} anni` : '50+ anni'}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Servono patrimonio FIRE e spese annue maggiori di zero per calcolare la matrice.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
