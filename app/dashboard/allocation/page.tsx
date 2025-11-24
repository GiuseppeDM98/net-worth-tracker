'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { getAllAssets, ASSET_CLASS_ORDER } from '@/lib/services/assetService';
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
import { Settings, TrendingUp, TrendingDown, Minus, Info, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type DrillDownLevel = 'assetClass' | 'subCategory' | 'specificAsset';

interface DrillDownState {
  level: DrillDownLevel;
  assetClass: string | null;
  subCategory: string | null;
}

export default function AllocationPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'assetClass',
    assetClass: null,
    subCategory: null,
  });

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
  // Le chiavi in bySubCategory sono nel formato "assetClass:subCategory"
  const getSubCategoriesByAssetClass = () => {
    if (!targets || !allocation) return {};

    const grouped: Record<
      string,
      Record<string, AllocationResult['bySubCategory'][string]>
    > = {};

    // Iterate through all subcategory entries
    Object.entries(allocation.bySubCategory).forEach(([key, data]) => {
      // Parse the composite key "assetClass:subCategory"
      const parts = key.split(':');
      if (parts.length === 2) {
        const [assetClass, subCategory] = parts;

        // Initialize asset class group if needed
        if (!grouped[assetClass]) {
          grouped[assetClass] = {};
        }

        // Add subcategory to its asset class group
        grouped[assetClass][subCategory] = data;
      }
    });

    return grouped;
  };

  // Get specific assets for a subcategory
  const getSpecificAssetsForSubCategory = (assetClass: string, subCategory: string) => {
    if (!allocation) return {};

    const result: Record<string, typeof allocation.bySpecificAsset[string]> = {};

    // Filter specific assets that match the asset class and subcategory
    Object.entries(allocation.bySpecificAsset).forEach(([key, data]) => {
      // Key format: "assetClass:subCategory:assetName"
      const parts = key.split(':');
      if (parts.length === 3) {
        const [ac, sc, assetName] = parts;
        if (ac === assetClass && sc === subCategory) {
          result[assetName] = data;
        }
      }
    });

    return result;
  };

  // Check if a subcategory has specific asset tracking enabled
  const hasSpecificAssetTracking = (assetClass: string, subCategory: string): boolean => {
    if (!targets || !targets[assetClass]) return false;

    const subTargets = targets[assetClass].subTargets;
    if (!subTargets) return false;

    const subTargetData = subTargets[subCategory];
    if (!subTargetData || typeof subTargetData === 'number') return false;

    return subTargetData.specificAssetsEnabled || false;
  };

  // Navigate to specific asset drill-down
  const handleDrillDownToSpecificAssets = (assetClass: string, subCategory: string) => {
    setDrillDown({
      level: 'specificAsset',
      assetClass,
      subCategory,
    });
  };

  // Navigate back to subcategories
  const handleBackToSubCategories = () => {
    setDrillDown({
      level: 'assetClass',
      assetClass: null,
      subCategory: null,
    });
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

  // Render drill-down view for specific assets
  if (drillDown.level === 'specificAsset' && drillDown.assetClass && drillDown.subCategory) {
    const specificAssets = getSpecificAssetsForSubCategory(drillDown.assetClass, drillDown.subCategory);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBackToSubCategories}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="text-sm text-gray-500">
                  {assetClassLabels[drillDown.assetClass]} → {drillDown.subCategory}
                </div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Specific Assets
                </h1>
                <p className="mt-2 text-gray-600">
                  Target teorici per asset specifici
                </p>
              </div>
            </div>
          </div>
          <Link href="/dashboard/settings">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Modifica Target
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Allocazione Specific Assets - {drillDown.subCategory}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(specificAssets).length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                Nessun specific asset configurato per questa sotto-categoria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset Name</TableHead>
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
                    {Object.entries(specificAssets)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([assetName, data]) => (
                        <TableRow key={assetName}>
                          <TableCell className="font-medium">
                            {assetName}
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
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-lg bg-blue-50 p-4">
          <h3 className="font-semibold text-blue-900">Nota</h3>
          <ul className="mt-2 space-y-1 text-sm text-blue-800">
            <li>
              • Gli specific assets sono target teorici e non sono collegati agli asset reali del portfolio
            </li>
            <li>
              • I valori correnti sono sempre 0 e le azioni sono sempre COMPRA
            </li>
            <li>
              • Le percentuali target sono relative alla sotto-categoria {drillDown.subCategory}
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // Normal view (asset classes and subcategories)
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
                  {Object.entries(allocation.byAssetClass)
                    .sort(([a], [b]) => {
                      const orderA = ASSET_CLASS_ORDER[a] || 999;
                      const orderB = ASSET_CLASS_ORDER[b] || 999;
                      return orderA - orderB;
                    })
                    .map(([assetClass, data]) => (
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
      {Object.entries(getSubCategoriesByAssetClass())
        .sort(([a], [b]) => {
          const orderA = ASSET_CLASS_ORDER[a] || 999;
          const orderB = ASSET_CLASS_ORDER[b] || 999;
          return orderA - orderB;
        })
        .map(([assetClass, subCategories]) => (
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
                    {Object.entries(subCategories)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([subCategory, data]) => {
                        const hasSpecificAssets = hasSpecificAssetTracking(assetClass, subCategory);

                        return (
                          <TableRow
                            key={subCategory}
                            className={hasSpecificAssets ? 'cursor-pointer hover:bg-gray-50' : ''}
                            onClick={() => {
                              if (hasSpecificAssets) {
                                handleDrillDownToSpecificAssets(assetClass, subCategory);
                              }
                            }}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {subCategory}
                                {hasSpecificAssets && (
                                  <Info className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
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
                        );
                      })}
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
