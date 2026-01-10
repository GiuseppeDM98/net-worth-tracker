'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { HallOfFameData, MonthlyRecord, YearlyRecord } from '@/types/hall-of-fame';
import { getHallOfFameData } from '@/lib/services/hallOfFameService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, TrendingDown, DollarSign, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { NoteIconCell } from '@/components/hall-of-fame/NoteIconCell';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

export default function HallOfFamePage() {
  const { user } = useAuth();
  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const hallOfFameData = await getHallOfFameData(user.uid);
      setData(hallOfFameData);
    } catch (error) {
      console.error('Error loading Hall of Fame data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!user) return;

    try {
      setRecalculating(true);
      const response = await fetch('/api/hall-of-fame/recalculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (!response.ok) {
        throw new Error('Failed to recalculate Hall of Fame');
      }

      toast.success('Rankings aggiornati con successo!');

      // Ricarica i dati
      await loadData();
    } catch (error) {
      console.error('Error recalculating Hall of Fame:', error);
      toast.error('Errore durante il ricalcolo dei rankings');
    } finally {
      setRecalculating(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Caricamento Hall of Fame...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Trophy className="h-8 w-8 text-yellow-500" />
              Hall of Fame
            </h1>
            <p className="text-muted-foreground mt-1">
              I tuoi migliori e peggiori record finanziari
            </p>
          </div>
          <Button
            onClick={handleRecalculate}
            disabled={recalculating}
            variant="outline"
            className="gap-2"
          >
            {recalculating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ricalcolo in corso...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Ricalcola Rankings
              </>
            )}
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nessun dato disponibile. Crea almeno 2 snapshot per visualizzare la Hall of Fame.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500" />
            Hall of Fame
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            I tuoi migliori e peggiori record finanziari
          </p>
        </div>
        <Button
          onClick={handleRecalculate}
          disabled={recalculating}
          variant="outline"
          className="gap-2 w-full sm:w-auto"
        >
          {recalculating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Ricalcolo in corso...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Ricalcola Rankings
            </>
          )}
        </Button>
      </div>

      {/* Ranking Mensili */}
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold mb-4">Ranking Mensili (Top 20)</h2>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Miglior Mese: Differenza NW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <TrendingUp className="h-5 w-5" />
                Miglior Mese: Differenza NW
              </CardTitle>
              <CardDescription>
                Mesi con il maggior incremento di Net Worth rispetto al mese precedente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.bestMonthsByNetWorthGrowth.length > 0 ? (
                  data.bestMonthsByNetWorthGrowth.map((record, idx) => (
                    <MonthlyRecordCard
                      key={`${record.year}-${record.month}`}
                      record={record}
                      rank={idx + 1}
                      valueKey="netWorthDiff"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <MonthlyTable records={data.bestMonthsByNetWorthGrowth} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>

          {/* Miglior Mese: Entrate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <DollarSign className="h-5 w-5" />
                Miglior Mese: Entrate
              </CardTitle>
              <CardDescription>
                Mesi con le maggiori entrate
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.bestMonthsByIncome.length > 0 ? (
                  data.bestMonthsByIncome.map((record, idx) => (
                    <MonthlyRecordCard
                      key={`${record.year}-${record.month}`}
                      record={record}
                      rank={idx + 1}
                      valueKey="totalIncome"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <MonthlyTable records={data.bestMonthsByIncome} valueKey="totalIncome" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>

          {/* Peggior Mese: Differenza NW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" />
                Peggior Mese: Differenza NW
              </CardTitle>
              <CardDescription>
                Mesi con il maggior decremento di Net Worth rispetto al mese precedente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.worstMonthsByNetWorthDecline.length > 0 ? (
                  data.worstMonthsByNetWorthDecline.map((record, idx) => (
                    <MonthlyRecordCard
                      key={`${record.year}-${record.month}`}
                      record={record}
                      rank={idx + 1}
                      valueKey="netWorthDiff"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <MonthlyTable records={data.worstMonthsByNetWorthDecline} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>

          {/* Peggior Mese: Spese */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" />
                Peggior Mese: Spese
              </CardTitle>
              <CardDescription>
                Mesi con le maggiori spese
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.worstMonthsByExpenses.length > 0 ? (
                  data.worstMonthsByExpenses.map((record, idx) => (
                    <MonthlyRecordCard
                      key={`${record.year}-${record.month}`}
                      record={record}
                      rank={idx + 1}
                      valueKey="totalExpenses"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <MonthlyTable records={data.worstMonthsByExpenses} valueKey="totalExpenses" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ranking Annuali */}
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold mb-4">Ranking Annuali (Top 10)</h2>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Miglior Anno: Differenza NW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <TrendingUp className="h-5 w-5" />
                Miglior Anno: Differenza NW
              </CardTitle>
              <CardDescription>
                Anni con il maggior incremento di Net Worth rispetto all'anno precedente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.bestYearsByNetWorthGrowth.length > 0 ? (
                  data.bestYearsByNetWorthGrowth.map((record, idx) => (
                    <YearlyRecordCard
                      key={record.year}
                      record={record}
                      rank={idx + 1}
                      valueKey="netWorthDiff"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <YearlyTable records={data.bestYearsByNetWorthGrowth} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>

          {/* Miglior Anno: Entrate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <DollarSign className="h-5 w-5" />
                Miglior Anno: Entrate
              </CardTitle>
              <CardDescription>
                Anni con le maggiori entrate
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.bestYearsByIncome.length > 0 ? (
                  data.bestYearsByIncome.map((record, idx) => (
                    <YearlyRecordCard
                      key={record.year}
                      record={record}
                      rank={idx + 1}
                      valueKey="totalIncome"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <YearlyTable records={data.bestYearsByIncome} valueKey="totalIncome" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>

          {/* Peggior Anno: Differenza NW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" />
                Peggior Anno: Differenza NW
              </CardTitle>
              <CardDescription>
                Anni con il maggior decremento di Net Worth rispetto all'anno precedente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.worstYearsByNetWorthDecline.length > 0 ? (
                  data.worstYearsByNetWorthDecline.map((record, idx) => (
                    <YearlyRecordCard
                      key={record.year}
                      record={record}
                      rank={idx + 1}
                      valueKey="netWorthDiff"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <YearlyTable records={data.worstYearsByNetWorthDecline} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>

          {/* Peggior Anno: Uscite */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" />
                Peggior Anno: Uscite
              </CardTitle>
              <CardDescription>
                Anni con le maggiori spese
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2">
                {data.worstYearsByExpenses.length > 0 ? (
                  data.worstYearsByExpenses.map((record, idx) => (
                    <YearlyRecordCard
                      key={record.year}
                      record={record}
                      rank={idx + 1}
                      valueKey="totalExpenses"
                      formatCurrency={formatCurrency}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun dato disponibile
                  </p>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block">
                <YearlyTable records={data.worstYearsByExpenses} valueKey="totalExpenses" formatCurrency={formatCurrency} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Componente card per record mensili (mobile)
function MonthlyRecordCard({
  record,
  rank,
  valueKey,
  formatCurrency,
}: {
  record: MonthlyRecord;
  rank: number;
  valueKey: keyof MonthlyRecord;
  formatCurrency: (amount: number) => string;
}) {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const isCurrentMonth = record.year === currentYear && record.month === currentMonth;
  const showPercentage = valueKey === 'netWorthDiff';
  const value = record[valueKey] as number;

  // Color coding
  const isPositive = value > 0;
  const isNegative = value < 0;
  const valueColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-900';

  // Percentage calculation (if needed)
  let percentage = 0;
  if (showPercentage && record.previousNetWorth > 0) {
    percentage = (record.netWorthDiff / record.previousNetWorth) * 100;
  }
  const percentageColor = percentage >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div
      className={`p-3 rounded-lg border ${
        isCurrentMonth ? 'bg-amber-50/70 border-amber-200' : 'bg-muted/50'
      }`}
    >
      {/* Row 1: Rank badge + Month + Note icon */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold">
            #{rank}
          </Badge>
          <span className="text-sm font-medium">{record.monthYear}</span>
        </div>
        {record.note && <NoteIconCell note={record.note} monthYear={record.monthYear} />}
      </div>

      {/* Row 2: Value + Percentage (highlighted) */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          <p className={`text-lg font-bold ${valueColor}`}>
            {isPositive ? '+' : ''}{formatCurrency(value)}
          </p>
        </div>
        {showPercentage && (
          <div>
            <p className={`text-sm font-semibold ${percentageColor}`}>
              {percentage >= 0 ? '+' : ''}{percentage.toFixed(2)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Componente card per record annuali (mobile)
function YearlyRecordCard({
  record,
  rank,
  valueKey,
  formatCurrency,
}: {
  record: YearlyRecord;
  rank: number;
  valueKey: keyof YearlyRecord;
  formatCurrency: (amount: number) => string;
}) {
  const currentYear = new Date().getFullYear();
  const isCurrentYear = record.year === currentYear;
  const showPercentage = valueKey === 'netWorthDiff';
  const value = record[valueKey] as number;

  // Color coding
  const isPositive = value > 0;
  const isNegative = value < 0;
  const valueColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-900';

  // Percentage calculation (if needed)
  let percentage = 0;
  if (showPercentage && record.startOfYearNetWorth > 0) {
    percentage = (record.netWorthDiff / record.startOfYearNetWorth) * 100;
  }
  const percentageColor = percentage >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div
      className={`p-3 rounded-lg border ${
        isCurrentYear ? 'bg-amber-50/70 border-amber-200' : 'bg-muted/50'
      }`}
    >
      {/* Row 1: Rank badge + Year */}
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold">
          #{rank}
        </Badge>
        <span className="text-sm font-medium">{record.year}</span>
      </div>

      {/* Row 2: Value + Percentage (highlighted) */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          <p className={`text-lg font-bold ${valueColor}`}>
            {isPositive ? '+' : ''}{formatCurrency(value)}
          </p>
        </div>
        {showPercentage && (
          <div>
            <p className={`text-sm font-semibold ${percentageColor}`}>
              {percentage >= 0 ? '+' : ''}{percentage.toFixed(2)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Componente per tabelle mensili
function MonthlyTable({
  records,
  valueKey,
  formatCurrency,
}: {
  records: MonthlyRecord[];
  valueKey: keyof MonthlyRecord;
  formatCurrency: (amount: number) => string;
}) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nessun dato disponibile
      </p>
    );
  }

  const showPercentage = valueKey === 'netWorthDiff';
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 sm:w-16">Rank</TableHead>
            <TableHead className="min-w-[80px]">Mese</TableHead>
            <TableHead className="text-right min-w-[100px]">Valore</TableHead>
            {showPercentage && (
              <TableHead className="text-right min-w-[70px]">%</TableHead>
            )}
            <TableHead className="w-12 text-center">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const percentage = showPercentage && record.previousNetWorth > 0
              ? (record.netWorthDiff / record.previousNetWorth) * 100
              : 0;
            const isCurrentMonth = record.year === currentYear && record.month === currentMonth;

            return (
              <TableRow
                key={`${record.year}-${record.month}`}
                className={isCurrentMonth ? 'bg-amber-50/70 hover:bg-amber-50/80' : undefined}
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell className="whitespace-nowrap">{record.monthYear}</TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                  {formatCurrency(record[valueKey] as number)}
                </TableCell>
                {showPercentage && (
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                    {percentage >= 0 ? '+' : ''}{percentage.toFixed(2)}%
                  </TableCell>
                )}
                <TableCell className="text-center">
                  <NoteIconCell note={record.note} monthYear={record.monthYear} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// Componente per tabelle annuali
function YearlyTable({
  records,
  valueKey,
  formatCurrency,
}: {
  records: YearlyRecord[];
  valueKey: keyof YearlyRecord;
  formatCurrency: (amount: number) => string;
}) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nessun dato disponibile
      </p>
    );
  }

  const showPercentage = valueKey === 'netWorthDiff';
  const currentYear = new Date().getFullYear();

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 sm:w-16">Rank</TableHead>
            <TableHead className="min-w-[60px]">Anno</TableHead>
            <TableHead className="text-right min-w-[100px]">Valore</TableHead>
            {showPercentage && (
              <TableHead className="text-right min-w-[70px]">%</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const percentage = showPercentage && record.startOfYearNetWorth > 0
              ? (record.netWorthDiff / record.startOfYearNetWorth) * 100
              : 0;
            const isCurrentYear = record.year === currentYear;

            return (
              <TableRow
                key={record.year}
                className={isCurrentYear ? 'bg-amber-50/70 hover:bg-amber-50/80' : undefined}
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{record.year}</TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                  {formatCurrency(record[valueKey] as number)}
                </TableCell>
                {showPercentage && (
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                    {percentage >= 0 ? '+' : ''}{percentage.toFixed(2)}%
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
