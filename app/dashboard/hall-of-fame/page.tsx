'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { HallOfFameData, MonthlyRecord, YearlyRecord } from '@/types/hall-of-fame';
import { getHallOfFameData } from '@/lib/services/hallOfFameService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trophy, TrendingUp, TrendingDown, DollarSign, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Ranking Mensili */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Ranking Mensili (Top 20)</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Miglior Mese: Differenza NW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <TrendingUp className="h-5 w-5" />
                Miglior Mese: Differenza NW
              </CardTitle>
              <CardDescription>
                Mesi con il maggior incremento di Net Worth
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyTable records={data.bestMonthsByNetWorthGrowth} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
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
              <MonthlyTable records={data.bestMonthsByIncome} valueKey="totalIncome" formatCurrency={formatCurrency} />
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
                Mesi con il maggior decremento di Net Worth
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyTable records={data.worstMonthsByNetWorthDecline} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
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
              <MonthlyTable records={data.worstMonthsByExpenses} valueKey="totalExpenses" formatCurrency={formatCurrency} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ranking Annuali */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Ranking Annuali (Top 10)</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Miglior Anno: Differenza NW */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <TrendingUp className="h-5 w-5" />
                Miglior Anno: Differenza NW
              </CardTitle>
              <CardDescription>
                Anni con il maggior incremento di Net Worth
              </CardDescription>
            </CardHeader>
            <CardContent>
              <YearlyTable records={data.bestYearsByNetWorthGrowth} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
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
              <YearlyTable records={data.bestYearsByIncome} valueKey="totalIncome" formatCurrency={formatCurrency} />
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
                Anni con il maggior decremento di Net Worth
              </CardDescription>
            </CardHeader>
            <CardContent>
              <YearlyTable records={data.worstYearsByNetWorthDecline} valueKey="netWorthDiff" formatCurrency={formatCurrency} />
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
              <YearlyTable records={data.worstYearsByExpenses} valueKey="totalExpenses" formatCurrency={formatCurrency} />
            </CardContent>
          </Card>
        </div>
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

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead>Mese</TableHead>
            <TableHead className="text-right">Valore</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => (
            <TableRow key={`${record.year}-${record.month}`}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>{record.monthYear}</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(record[valueKey] as number)}
              </TableCell>
            </TableRow>
          ))}
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

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead>Anno</TableHead>
            <TableHead className="text-right">Valore</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => (
            <TableRow key={record.year}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>{record.year}</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(record[valueKey] as number)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
