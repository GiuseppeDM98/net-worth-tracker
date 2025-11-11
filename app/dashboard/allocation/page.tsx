'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { getAllAssets } from '@/lib/services/assetService';
import {
  getTargets,
  compareAllocations,
  getDefaultTargets,
} from '@/lib/services/assetAllocationService';
import { Asset, AllocationResult, AssetAllocationTarget } from '@/types/assets';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Settings, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toast } from 'sonner';

export default function AllocationPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [assetsData, targetsData] = await Promise.all([
        getAllAssets(user.uid),
        getTargets(user.uid),
      ]);

      setAssets(assetsData);
      setTargets(targetsData || getDefaultTargets());

      const allocationResult = compareAllocations(
        assetsData,
        targetsData || getDefaultTargets()
      );
      setAllocation(allocationResult);
    } catch (error) {
      console.error('Error loading allocation data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'COMPRA':
        return <TrendingUp className="h-4 w-4 text-orange-500" />;
      case 'VENDI':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'OK':
        return <Minus className="h-4 w-4 text-green-500" />;
    }
  };

  const getActionColor = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'COMPRA':
        return 'text-orange-600 bg-orange-50';
      case 'VENDI':
        return 'text-red-600 bg-red-50';
      case 'OK':
        return 'text-green-600 bg-green-50';
    }
  };

  const getDifferenceColor = (difference: number) => {
    if (Math.abs(difference) <= 1) return 'text-green-600';
    if (difference > 1) return 'text-red-600';
    return 'text-orange-600';
  };

  const assetClassLabels: Record<string, string> = {
    equity: 'Azioni (Equity)',
    bonds: 'Obbligazioni (Bonds)',
    crypto: 'Criptovalute (Crypto)',
    realestate: 'Immobili (Real Estate)',
    cash: 'Liquidità (Cash)',
    commodity: 'Materie Prime (Commodity)',
  };

  // Group sub-categories by asset class
  const getSubCategoriesByAssetClass = () => {
    if (!targets || !allocation) return {};

    const grouped: Record<
      string,
      Record<string, AllocationResult['bySubCategory'][string]>
    > = {};

    // Iterate through asset classes that have sub-targets
    Object.entries(targets).forEach(([assetClass, targetData]) => {
      if (targetData.subTargets) {
        grouped[assetClass] = {};

        // Get all sub-categories for this asset class
        Object.keys(targetData.subTargets).forEach((subCategory) => {
          if (allocation.bySubCategory[subCategory]) {
            grouped[assetClass][subCategory] =
              allocation.bySubCategory[subCategory];
          }
        });

        // Remove asset class if no sub-categories have data
        if (Object.keys(grouped[assetClass]).length === 0) {
          delete grouped[assetClass];
        }
      }
    });

    return grouped;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  if (!allocation) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Nessun dato disponibile</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Allocazione Asset
          </h1>
          <p className="mt-2 text-gray-600">
            Confronta l'allocazione corrente con i tuoi obiettivi
          </p>
        </div>
        <Link href="/dashboard/settings">
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Modifica Target
          </Button>
        </Link>
      </div>

      {/* Asset Class Allocation */}
      <Card>
        <CardHeader>
          <CardTitle>Allocazione per Classe di Asset</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(allocation.byAssetClass).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-500">
              Nessun asset presente. Aggiungi degli asset per vedere
              l'allocazione.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classe Asset</TableHead>
                    <TableHead className="text-right">Corrente %</TableHead>
                    <TableHead className="text-right">Corrente €</TableHead>
                    <TableHead className="text-right">Target %</TableHead>
                    <TableHead className="text-right">Target €</TableHead>
                    <TableHead className="text-right">Differenza %</TableHead>
                    <TableHead className="text-right">Differenza €</TableHead>
                    <TableHead className="text-center">Azione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(allocation.byAssetClass).map(
                    ([assetClass, data]) => (
                      <TableRow key={assetClass}>
                        <TableCell className="font-medium">
                          {assetClassLabels[assetClass] || assetClass}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercentage(data.currentPercentage)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.currentValue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercentage(data.targetPercentage)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.targetValue)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${getDifferenceColor(
                            data.difference
                          )}`}
                        >
                          {data.difference > 0 ? '+' : ''}
                          {formatPercentage(data.difference)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${getDifferenceColor(
                            data.difference
                          )}`}
                        >
                          {data.differenceValue > 0 ? '+' : ''}
                          {formatCurrency(data.differenceValue)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${getActionColor(
                                data.action
                              )}`}
                            >
                              {getActionIcon(data.action)}
                              {data.action}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-Category Allocation - One card per asset class */}
      {Object.entries(getSubCategoriesByAssetClass()).map(
        ([assetClass, subCategories]) => (
          <Card key={`sub-${assetClass}`}>
            <CardHeader>
              <CardTitle>
                Allocazione Sotto-Categoria {assetClassLabels[assetClass]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sotto-Categoria</TableHead>
                      <TableHead className="text-right">Corrente %</TableHead>
                      <TableHead className="text-right">Corrente €</TableHead>
                      <TableHead className="text-right">Target %</TableHead>
                      <TableHead className="text-right">Target €</TableHead>
                      <TableHead className="text-right">Differenza %</TableHead>
                      <TableHead className="text-right">Differenza €</TableHead>
                      <TableHead className="text-center">Azione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(subCategories).map(
                      ([subCategory, data]) => (
                        <TableRow key={subCategory}>
                          <TableCell className="font-medium">
                            {subCategory}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPercentage(data.currentPercentage)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(data.currentValue)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPercentage(data.targetPercentage)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(data.targetValue)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${getDifferenceColor(
                              data.difference
                            )}`}
                          >
                            {data.difference > 0 ? '+' : ''}
                            {formatPercentage(data.difference)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${getDifferenceColor(
                              data.difference
                            )}`}
                          >
                            {data.differenceValue > 0 ? '+' : ''}
                            {formatCurrency(data.differenceValue)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${getActionColor(
                                  data.action
                                )}`}
                              >
                                {getActionIcon(data.action)}
                                {data.action}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )
      )}

      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">Legenda</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>
            <strong>COMPRA:</strong> La percentuale corrente è inferiore al
            target (sotto-allocato)
          </li>
          <li>
            <strong>VENDI:</strong> La percentuale corrente è superiore al target
            (sovra-allocato)
          </li>
          <li>
            <strong>OK:</strong> La percentuale corrente è vicina al target
            (±1%)
          </li>
        </ul>
      </div>
    </div>
  );
}
