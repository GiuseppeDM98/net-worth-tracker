'use client';

/**
 * FIREProjectionTable Component
 *
 * Collapsible year-by-year table showing projected net worth under each scenario,
 * annual expenses, and FIRE Number. Rows where FIRE is reached in the base scenario
 * get a green tint for quick visual identification.
 *
 * Collapsed by default to save space — the chart is the primary visualization.
 */

import { useState } from 'react';
import { FIREProjectionYearData } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

interface FIREProjectionTableProps {
  yearlyData: FIREProjectionYearData[];
}

export function FIREProjectionTable({ yearlyData }: FIREProjectionTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (yearlyData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Tabella Dettagliata Anno per Anno</span>
          <Button variant="ghost" size="sm">
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Anno</th>
                  <th className="py-2 pr-4 font-medium text-red-600">Orso</th>
                  <th className="py-2 pr-4 font-medium text-indigo-600">Base</th>
                  <th className="py-2 pr-4 font-medium text-green-600">Toro</th>
                  <th className="py-2 pr-4 font-medium">Spese Annuali</th>
                  <th className="py-2 pr-4 font-medium text-amber-600">FIRE Number</th>
                  <th className="py-2 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {yearlyData.map((row) => (
                  <tr
                    key={row.year}
                    className={`border-b ${row.baseFireReached ? 'bg-green-50' : ''}`}
                  >
                    <td className="py-2 pr-4 font-medium">{row.calendarYear}</td>
                    <td className={`py-2 pr-4 ${row.bearFireReached ? 'text-green-600 font-semibold' : 'text-red-600'}`}>
                      {formatCurrency(row.bearNetWorth)}
                    </td>
                    <td className={`py-2 pr-4 ${row.baseFireReached ? 'text-green-600 font-semibold' : 'text-indigo-600'}`}>
                      {formatCurrency(row.baseNetWorth)}
                    </td>
                    <td className={`py-2 pr-4 ${row.bullFireReached ? 'text-green-600 font-semibold' : 'text-green-600'}`}>
                      {formatCurrency(row.bullNetWorth)}
                    </td>
                    <td className="py-2 pr-4">{formatCurrency(row.baseExpenses)}</td>
                    <td className="py-2 pr-4 text-amber-600">{formatCurrency(row.baseFireNumber)}</td>
                    <td className="py-2">
                      {row.baseFireReached && <Check className="h-4 w-4 text-green-600" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
