'use client';

import { useState, useEffect } from 'react';
import { Wallet, Receipt, TrendingUp, BarChart3, Coins } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { CurrentYearTab } from '@/components/cashflow/CurrentYearTab';
import { TotalHistoryTab } from '@/components/cashflow/TotalHistoryTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseCategory } from '@/types/expenses';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { getAllExpenses } from '@/lib/services/expenseService';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { getAllAssets } from '@/lib/services/assetService';
import { toast } from 'sonner';

export default function CashflowPage() {
  const { user } = useAuth();

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['tracking']));
  const [activeTab, setActiveTab] = useState<string>('tracking');

  // Centralized data cache
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  const loadAllData = async () => {
    if (!user || dataLoaded) return; // Skip if already loaded

    try {
      setLoading(true);

      // Batch fetch in parallel (single Promise.all)
      const [expensesData, categoriesData, dividendsData, assetsData] = await Promise.all([
        getAllExpenses(user.uid),
        getAllCategories(user.uid),
        fetch(`/api/dividends?userId=${user.uid}`).then(r => r.json()).then(d => d.dividends || []),
        getAllAssets(user.uid),
      ]);

      setAllExpenses(expensesData);
      setCategories(categoriesData);
      setDividends(dividendsData);
      setAssets(assetsData.filter(a => a.assetClass === 'equity')); // Only equity for dividends
      setDataLoaded(true);
    } catch (error) {
      console.error('Error loading cashflow data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !dataLoaded) {
      loadAllData();
    }
  }, [user, dataLoaded]);

  const handleRefresh = async () => {
    setDataLoaded(false); // Force re-fetch
    await loadAllData();
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
  };

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Wallet className="h-8 w-8 text-blue-500" />
          Cashflow
        </h1>
        <p className="mt-2 text-gray-600">
          Traccia e analizza le tue entrate e uscite nel tempo
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tracking" value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-4xl grid-cols-4">
          <TabsTrigger value="tracking" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Tracciamento
          </TabsTrigger>
          <TabsTrigger value="dividends" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Dividendi
          </TabsTrigger>
          <TabsTrigger value="current-year" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Anno Corrente
          </TabsTrigger>
          <TabsTrigger value="total-history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Storico Totale
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tracking" className="mt-6">
          <ExpenseTrackingTab
            allExpenses={allExpenses}
            categories={categories}
            loading={loading}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        {mountedTabs.has('dividends') && (
          <TabsContent value="dividends" className="mt-6">
            <DividendTrackingTab
              dividends={dividends}
              assets={assets}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}

        {mountedTabs.has('current-year') && (
          <TabsContent value="current-year" className="mt-6">
            <CurrentYearTab
              allExpenses={allExpenses}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}

        {mountedTabs.has('total-history') && (
          <TabsContent value="total-history" className="mt-6">
            <TotalHistoryTab
              allExpenses={allExpenses}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
