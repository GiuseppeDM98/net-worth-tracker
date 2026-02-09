'use client';

/**
 * FIREProjectionTable Component
 *
 * Collapsible year-by-year table showing projected net worth and FIRE Number
 * under each scenario. Headers are grouped by scenario for readability.
 * Rows where FIRE is reached in the base scenario get a green tint.
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
                  <th rowSpan={2} className="py-2 pr-4 font-medium align-bottom">Anno</th>
                  <th colSpan={2} className="py-1 pr-4 font-medium text-red-600 text-center border-b">Orso</th>
                  <th colSpan={2} className="py-1 pr-4 font-medium text-indigo-600 text-center border-b">Base</th>
                  <th colSpan={2} className="py-1 pr-4 font-medium text-green-600 text-center border-b">Toro</th>
                  <th rowSpan={2} className="py-2 font-medium align-bottom">Stato</th>
                </tr>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-1 pr-2">Patrimonio</th>
                  <th className="py-1 pr-4">FIRE Nr.</th>
                  <th className="py-1 pr-2">Patrimonio</th>
                  <th className="py-1 pr-4">FIRE Nr.</th>
                  <th className="py-1 pr-2">Patrimonio</th>
                  <th className="py-1 pr-4">FIRE Nr.</th>
                </tr>
              </thead>
              <tbody>
                {yearlyData.map((row) => {
                  const allReached = row.bearFireReached && row.baseFireReached && row.bullFireReached;
                  return (
                    <tr
                      key={row.year}
                      className={`border-b ${allReached ? 'bg-green-50' : row.baseFireReached ? 'bg-green-50/50' : ''}`}
                    >
                      <td className="py-2 pr-4 font-medium">{row.calendarYear}</td>
                      {/* Bear scenario */}
                      <td className={`py-2 pr-2 ${row.bearFireReached ? 'text-green-600 font-semibold' : 'text-red-600'}`}>
                        {formatCurrency(row.bearNetWorth)}
                      </td>
                      <td className="py-2 pr-4 text-red-400 text-xs">
                        {formatCurrency(row.bearFireNumber)}
                      </td>
                      {/* Base scenario */}
                      <td className={`py-2 pr-2 ${row.baseFireReached ? 'text-green-600 font-semibold' : 'text-indigo-600'}`}>
                        {formatCurrency(row.baseNetWorth)}
                      </td>
                      <td className="py-2 pr-4 text-indigo-400 text-xs">
                        {formatCurrency(row.baseFireNumber)}
                      </td>
                      {/* Bull scenario */}
                      <td className={`py-2 pr-2 ${row.bullFireReached ? 'text-green-600 font-semibold' : 'text-green-600'}`}>
                        {formatCurrency(row.bullNetWorth)}
                      </td>
                      <td className="py-2 pr-4 text-green-400 text-xs">
                        {formatCurrency(row.bullFireNumber)}
                      </td>
                      {/* Status */}
                      <td className="py-2">
                        {allReached
                          ? <Check className="h-4 w-4 text-green-600" />
                          : row.baseFireReached
                            ? <Check className="h-4 w-4 text-green-400" />
                            : null
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
