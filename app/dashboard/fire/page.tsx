'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllAssets, calculateTotalValue } from '@/lib/services/assetService';
import { getSettings, setSettings, getDefaultTargets } from '@/lib/services/assetAllocationService';
import { getFIREData, FIREMetrics, MonthlyFIREData } from '@/lib/services/fireService';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { Asset } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Flame, TrendingUp, Calendar, DollarSign, Percent, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function FIREPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [withdrawalRate, setWithdrawalRate] = useState<number>(4.0);
  const [tempWithdrawalRate, setTempWithdrawalRate] = useState<string>('4.0');
  const [fireMetrics, setFireMetrics] = useState<FIREMetrics | null>(null);
  const [chartData, setChartData] = useState<MonthlyFIREData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load assets and settings
      const [assetsData, settingsData] = await Promise.all([
        getAllAssets(user.uid),
        getSettings(user.uid),
      ]);

      setAssets(assetsData);

      // Get withdrawal rate from settings or use default
      const wr = settingsData?.withdrawalRate ?? 4.0;
      setWithdrawalRate(wr);
      setTempWithdrawalRate(wr.toString());

      // Calculate current net worth
      const currentNetWorth = calculateTotalValue(assetsData);

      // Get FIRE data
      const fireData = await getFIREData(user.uid, currentNetWorth, wr);
      setFireMetrics(fireData.metrics);
      setChartData(fireData.chartData);

    } catch (error) {
      console.error('Error loading FIRE data:', error);
      toast.error('Errore nel caricamento dei dati FIRE');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWithdrawalRate = async () => {
    if (!user) return;

    try {
      setSaving(true);
      const newWR = parseFloat(tempWithdrawalRate);

      if (isNaN(newWR) || newWR <= 0 || newWR > 100) {
        toast.error('Inserisci un valore valido tra 0 e 100');
        return;
      }

      // Get current settings
      const currentSettings = await getSettings(user.uid);

      // Update settings with new withdrawal rate
      await setSettings(user.uid, {
        userAge: currentSettings?.userAge,
        riskFreeRate: currentSettings?.riskFreeRate,
        withdrawalRate: newWR,
        targets: currentSettings?.targets || getDefaultTargets(),
      });

      setWithdrawalRate(newWR);
      toast.success('Withdrawal Rate salvato con successo');

      // Reload data with new WR
      await loadData();

    } catch (error) {
      console.error('Error saving withdrawal rate:', error);
      toast.error('Errore nel salvataggio del Withdrawal Rate');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
            <Flame className="h-8 w-8 text-orange-500" />
            FIRE Calculator
          </h1>
          <p className="mt-2 text-gray-600">
            Financial Independence, Retire Early - Monitora il tuo progresso verso la libertà finanziaria
          </p>
        </div>
      </div>

      {/* Withdrawal Rate Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Impostazioni FIRE
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="withdrawalRate">Safe Withdrawal Rate (%)</Label>
              <Input
                id="withdrawalRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={tempWithdrawalRate}
                onChange={(e) => setTempWithdrawalRate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500">
                Tipicamente 4% secondo la regola del 4% (Trinity Study)
              </p>
            </div>
            <Button
              onClick={handleSaveWithdrawalRate}
              disabled={saving}
            >
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* FIRE Metrics Cards */}
      {fireMetrics && (
        <>
          {/* Row 1: FIRE Number and Progress */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  FIRE Number
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {formatCurrency(fireMetrics.fireNumber)}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Patrimonio necessario per raggiungere la FI con spese annuali di {formatCurrency(fireMetrics.annualExpenses)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Percent className="h-5 w-5 text-green-500" />
                  Progresso verso FI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatPercentage(fireMetrics.progressToFI)}
                </div>
                <div className="mt-3">
                  <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                      style={{
                        width: `${Math.min(fireMetrics.progressToFI, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {fireMetrics.progressToFI >= 100
                      ? '🎉 Hai raggiunto la Financial Independence!'
                      : `Ancora ${formatCurrency(fireMetrics.fireNumber - fireMetrics.currentNetWorth)} da accumulare`
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Allowances */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  Indennità Annuale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {formatCurrency(fireMetrics.annualAllowance)}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Quanto potresti prelevare all'anno con il WR attuale
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-indigo-500" />
                  Indennità Mensile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-600">
                  {formatCurrency(fireMetrics.monthlyAllowance)}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Reddito mensile passivo potenziale
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-teal-500" />
                  Indennità Giornaliera
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-teal-600">
                  {formatCurrency(fireMetrics.dailyAllowance)}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Budget giornaliero sostenibile
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Current WR and Years of Expenses */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Percent className="h-5 w-5 text-orange-500" />
                  Current Withdrawal Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">
                  {formatPercentage(fireMetrics.currentWR)}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Rapporto tra spese annuali e patrimonio attuale
                </p>
                {fireMetrics.currentWR > withdrawalRate && (
                  <p className="mt-2 text-sm text-red-600 font-semibold">
                    ⚠️ Superiore al Safe Withdrawal Rate ({withdrawalRate}%)
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-cyan-500" />
                  Anni di Spesa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-cyan-600">
                  {fireMetrics.yearsOfExpenses.toFixed(1)} anni
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Per quanti anni il tuo patrimonio coprirebbe le spese attuali
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Chart: Income, Expenses, Monthly Allowance Evolution */}
      <Card>
        <CardHeader>
          <CardTitle>Evoluzione Storica: Entrate, Uscite e Indennità Mensile</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile. Gli snapshot mensili verranno creati automaticamente.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" />
                <YAxis
                  width={100}
                  tickFormatter={(value) => formatCurrency(value).replace(/,00$/, '')}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Entrate Mensili"
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#EF4444"
                  strokeWidth={2}
                  name="Uscite Mensili"
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="monthlyAllowance"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  name="Indennità Mensile"
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Come funziona il FIRE?</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p>
              <strong>FIRE Number:</strong> È il patrimonio target calcolato come: Spese Annuali ÷ Safe Withdrawal Rate.
              Con un WR del 4%, devi accumulare 25 volte le tue spese annuali.
            </p>
            <p>
              <strong>Safe Withdrawal Rate (SWR):</strong> La percentuale del tuo patrimonio che puoi prelevare ogni anno
              in modo sostenibile. Il 4% è basato sul Trinity Study e su un orizzonte temporale di 30 anni.
            </p>
            <p>
              <strong>Indennità Mensile:</strong> Basata sul tuo patrimonio attuale e sul WR impostato.
              Mostra quanto potresti già prelevare mensilmente in modo sostenibile.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
