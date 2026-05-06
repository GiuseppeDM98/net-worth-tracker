'use client';

import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useHouseholdConfig } from '@/lib/hooks/useHousehold';
import { useInternalTransfers } from '@/lib/hooks/useInvestmentOperations';
import { calculateMonthlyCompensations, isHouseholdEnabled } from '@/lib/utils/householdUtils';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { formatCurrency } from '@/lib/utils/formatters';
import type { Expense } from '@/types/expenses';

const MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
];

interface CompensationsTabProps {
  allExpenses: Expense[];
  loading: boolean;
  historyStartYear: number;
}

export function CompensationsTab({ allExpenses, loading, historyStartYear }: CompensationsTabProps) {
  const { user } = useAuth();
  const { data: assets = [], isLoading: assetsLoading } = useAssets(user?.uid);
  const { data: transfers = [], isLoading: transfersLoading } = useInternalTransfers(user?.uid);
  const { data: householdConfig, isLoading: householdLoading } = useHouseholdConfig(user?.uid);
  const householdEnabled = isHouseholdEnabled(householdConfig);
  const currentYear = getItalyYear();
  const currentMonth = getItalyMonth();
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(currentMonth));

  const years = useMemo(() => {
    const result: number[] = [];
    for (let item = historyStartYear; item <= currentYear; item++) {
      result.push(item);
    }
    return result.reverse();
  }, [currentYear, historyStartYear]);

  const report = useMemo(() => {
    if (!householdConfig) return null;
    return calculateMonthlyCompensations(
      allExpenses,
      assets,
      transfers,
      householdConfig,
      Number(year),
      Number(month)
    );
  }, [allExpenses, assets, householdConfig, month, transfers, year]);

  const isLoading = loading || assetsLoading || transfersLoading || householdLoading;

  if (!householdLoading && !householdEnabled) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Le compensazioni sono disponibili dopo aver attivato la gestione multi-persona nelle impostazioni.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Scale className="h-6 w-6 text-primary" />
          Compensazioni
        </h2>
        <p className="mt-1 text-muted-foreground">
          Confronta chi ha pagato con chi doveva sostenere le spese del mese
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Periodo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 desktop:max-w-xl">
          <div className="space-y-2">
            <Label>Mese</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Anno</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((item) => (
                  <SelectItem key={item} value={String(item)}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report mensile</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !report ? (
            <p className="text-sm text-muted-foreground">Caricamento compensazioni...</p>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm text-muted-foreground">Spese considerate</p>
                <p className="text-2xl font-semibold">{formatCurrency(report.totalExpenses)}</p>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partecipante</TableHead>
                      <TableHead className="text-right">Pagato</TableHead>
                      <TableHead className="text-right">Attribuito</TableHead>
                      <TableHead className="text-right">Comp. pagate</TableHead>
                      <TableHead className="text-right">Comp. ricevute</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row) => (
                      <TableRow key={row.participantId}>
                        <TableCell className="font-medium">{row.participantName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.paid)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.attributed)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.settlementPaid)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.settlementReceived)}</TableCell>
                        <TableCell className={row.balance >= 0 ? 'text-right text-green-600' : 'text-right text-red-600'}>
                          {formatCurrency(row.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Movimenti consigliati</h3>
                {report.settlementSuggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna compensazione aperta per il mese selezionato.</p>
                ) : (
                  <div className="space-y-2">
                    {report.settlementSuggestions.map((suggestion) => (
                      <div
                        key={`${suggestion.fromParticipantId}-${suggestion.toParticipantId}-${suggestion.amount}`}
                        className="flex items-center justify-between rounded-md border p-3 text-sm"
                      >
                        <span>
                          {suggestion.fromParticipantName} paga {suggestion.toParticipantName}
                        </span>
                        <span className="font-semibold">{formatCurrency(suggestion.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
