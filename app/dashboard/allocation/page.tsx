/**
 * ALLOCATION PAGE ARCHITECTURE
 *
 * Three-level hierarchy for portfolio allocation analysis:
 * 1. Asset Class (Equity, Bonds, Crypto, Real Estate, Cash, Commodity)
 * 2. Sub-Category (within each asset class, user-defined like "ETF World", "Italian Bonds")
 * 3. Specific Assets (theoretical allocation targets within subcategories, NOT linked to real portfolio)
 *
 * NAVIGATION PATTERNS:
 *
 * DESKTOP (>768px):
 * - Level 1: Table showing all asset classes with percentages
 * - Level 2: Separate tables for each asset class's subcategories
 * - Level 3: Drill-down to dedicated full-page view for specific assets
 * - Uses URL/component state (drillDown) for navigation
 *
 * MOBILE (≤767px):
 * - Level 1: Cards showing asset classes (touch-friendly)
 * - Level 2: Bottom sheet with subcategory cards
 * - Level 3: Bottom sheet with specific asset cards
 * - Uses sheet state (sheetNav) + breadcrumbs for navigation
 *
 * WHY TWO PATTERNS:
 * - Desktop: Tables show more data density, multiple sections visible at once
 * - Mobile: Cards easier to tap, sheets prevent scroll confusion
 * - Trying to unify would compromise both experiences
 *
 * KEY TRADE-OFFS:
 * - Duplicated rendering logic (desktop tables vs mobile cards) for better UX
 * - Two separate state systems (drillDown vs sheetNav) to isolate concerns
 * - Specific assets are theoretical targets, NOT linked to real portfolio assets (avoids complexity)
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { getAllAssets, ASSET_CLASS_ORDER } from '@/lib/services/assetService';
import {
  getSettings,
  compareAllocations,
  getDefaultTargets,
  buildTargetsFromGoalAllocation,
} from '@/lib/services/assetAllocationService';
import { getGoalData, deriveTargetAllocationFromGoals } from '@/lib/services/goalService';
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
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { AllocationCard } from '@/components/allocation/AllocationCard';
import { AllocationSheet } from '@/components/allocation/AllocationSheet';

type DrillDownLevel = 'assetClass' | 'subCategory' | 'specificAsset';

interface DrillDownState {
  level: DrillDownLevel;
  assetClass: string | null;
  subCategory: string | null;
}

interface SheetNavigation {
  isOpen: boolean;
  level: 'subCategory' | 'specificAsset' | null;
  assetClass: string | null;
  subCategory: string | null;
}

export default function AllocationPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingGoalTargets, setUsingGoalTargets] = useState(false);

  // TWO NAVIGATION STATE SYSTEMS:
  //
  // 1. drillDown (desktop): Tracks current page in multi-page navigation
  //    - Changes component render completely (different page views)
  //    - State: { level, assetClass, subCategory }
  //    - Used when screen width > 768px
  //
  // 2. sheetNav (mobile): Tracks sheet content without changing main page
  //    - Sheet slides up from bottom, main page stays underneath
  //    - State: { isOpen, level, assetClass, subCategory }
  //    - Used when screen width ≤ 767px
  //
  // WHY SEPARATE:
  // - Desktop: Full page transitions feel natural with tables and lots of data
  // - Mobile: Sheets allow quick navigation without losing context
  // - Trying to unify would require complex conditionals and compromise UX
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'assetClass',
    assetClass: null,
    subCategory: null,
  });

  const [sheetNav, setSheetNav] = useState<SheetNavigation>({
    isOpen: false,
    level: null,
    assetClass: null,
    subCategory: null,
  });

  // Responsive detection
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [assetsData, settings, goalData] = await Promise.all([
        getAllAssets(user.uid),
        getSettings(user.uid),
        getGoalData(user.uid),
      ]);

      setAssets(assetsData);

      // Derive targets from goals when goal-based investing is enabled
      let effectiveTargets: AssetAllocationTarget;
      let fromGoals = false;

      if (
        settings?.goalBasedInvestingEnabled &&
        settings?.goalDrivenAllocationEnabled &&
        goalData &&
        goalData.goals.length > 0
      ) {
        const derived = deriveTargetAllocationFromGoals(
          goalData.goals,
          goalData.assignments,
          assetsData
        );
        if (derived) {
          // Preserve sub-category structure from Settings while overriding asset class targets
          effectiveTargets = buildTargetsFromGoalAllocation(derived, settings?.targets);
          fromGoals = true;
        } else {
          effectiveTargets = settings?.targets || getDefaultTargets();
        }
      } else {
        effectiveTargets = settings?.targets || getDefaultTargets();
      }

      setTargets(effectiveTargets);
      setUsingGoalTargets(fromGoals);

      const allocationResult = compareAllocations(assetsData, effectiveTargets);
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

    Object.entries(allocation.bySubCategory).forEach(([key, data]) => {
      const parts = key.split(':');
      if (parts.length === 2) {
        const [assetClass, subCategory] = parts;

        if (!grouped[assetClass]) {
          grouped[assetClass] = {};
        }

        grouped[assetClass][subCategory] = data;
      }
    });

    return grouped;
  };

  // Get specific assets for a subcategory
  const getSpecificAssetsForSubCategory = (assetClass: string, subCategory: string) => {
    if (!allocation) return {};

    const result: Record<string, typeof allocation.bySpecificAsset[string]> = {};

    Object.entries(allocation.bySpecificAsset).forEach(([key, data]) => {
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

  // Check if asset class has subcategories
  const hasSubCategories = (assetClass: string): boolean => {
    const subs = getSubCategoriesByAssetClass()[assetClass];
    return subs && Object.keys(subs).length > 0;
  };

  // ========== MOBILE NAVIGATION HANDLERS ==========

  const openSubCategories = (assetClass: string) => {
    setSheetNav({
      isOpen: true,
      level: 'subCategory',
      assetClass,
      subCategory: null,
    });
  };

  const openSpecificAssets = (assetClass: string, subCategory: string) => {
    setSheetNav({
      isOpen: true,
      level: 'specificAsset',
      assetClass,
      subCategory,
    });
  };

  const handleBack = () => {
    if (sheetNav.level === 'specificAsset') {
      // Go back to subcategories
      setSheetNav({ ...sheetNav, level: 'subCategory', subCategory: null });
    } else {
      // Close sheet
      setSheetNav({ isOpen: false, level: null, assetClass: null, subCategory: null });
    }
  };

  const handleSheetClose = () => {
    setSheetNav({ isOpen: false, level: null, assetClass: null, subCategory: null });
  };

  // ========== DESKTOP NAVIGATION HANDLERS ==========

  const handleDrillDownToSpecificAssets = (assetClass: string, subCategory: string) => {
    setDrillDown({
      level: 'specificAsset',
      assetClass,
      subCategory,
    });
  };

  const handleBackToSubCategories = () => {
    setDrillDown({
      level: 'assetClass',
      assetClass: null,
      subCategory: null,
    });
  };

  // ========== MOBILE RENDERING FUNCTIONS ==========

  const renderAssetClassCards = () => (
    <div className="space-y-4">
      {Object.entries(allocation!.byAssetClass)
        .sort(([a], [b]) => {
          const orderA = ASSET_CLASS_ORDER[a] || 999;
          const orderB = ASSET_CLASS_ORDER[b] || 999;
          return orderA - orderB;
        })
        .map(([assetClass, data]) => {
          const hasSubCats = hasSubCategories(assetClass);

          return (
            <AllocationCard
              key={assetClass}
              name={assetClassLabels[assetClass]}
              data={data}
              level="assetClass"
              hasChildren={hasSubCats}
              onDrillDown={hasSubCats ? () => openSubCategories(assetClass) : undefined}
            />
          );
        })}
    </div>
  );

  const renderSubCategoryCards = () => {
    if (!sheetNav.assetClass) return null;

    const subCategories = getSubCategoriesByAssetClass()[sheetNav.assetClass];
    if (!subCategories) return null;

    return (
      <div className="space-y-4">
        {Object.entries(subCategories)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([subCategory, data]) => {
            const hasSpecificAssets = hasSpecificAssetTracking(sheetNav.assetClass!, subCategory);

            return (
              <AllocationCard
                key={subCategory}
                name={subCategory}
                data={data}
                level="subCategory"
                hasChildren={hasSpecificAssets}
                onDrillDown={
                  hasSpecificAssets
                    ? () => openSpecificAssets(sheetNav.assetClass!, subCategory)
                    : undefined
                }
              />
            );
          })}
      </div>
    );
  };

  const renderSpecificAssetCards = () => {
    if (!sheetNav.assetClass || !sheetNav.subCategory) return null;

    const specificAssets = getSpecificAssetsForSubCategory(
      sheetNav.assetClass,
      sheetNav.subCategory
    );

    if (Object.keys(specificAssets).length === 0) {
      return (
        <div className="flex h-32 items-center justify-center text-gray-500 text-sm">
          Nessun specific asset configurato per questa sotto-categoria.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {Object.entries(specificAssets)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([assetName, data]) => (
            <AllocationCard
              key={assetName}
              name={assetName}
              data={data}
              level="specificAsset"
              hasChildren={false}
            />
          ))}
      </div>
    );
  };

  const renderSheetContent = () => {
    if (sheetNav.level === 'subCategory') {
      return renderSubCategoryCards();
    }
    if (sheetNav.level === 'specificAsset') {
      return renderSpecificAssetCards();
    }
    return null;
  };

  // ========== LOADING & EMPTY STATES ==========

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

  // ========== DESKTOP: DRILL-DOWN VIEW FOR SPECIFIC ASSETS ==========

  if (drillDown.level === 'specificAsset' && drillDown.assetClass && drillDown.subCategory && !isMobile) {
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

  // ========== MAIN VIEW (MOBILE + DESKTOP) ==========

  return (
    <div className="space-y-6">
      {/* Header (shared for both mobile and desktop) */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Allocazione Asset
          </h1>
          <p className="mt-2 text-gray-600">
            Confronta l'allocazione corrente con i tuoi obiettivi
          </p>
        </div>
        {!usingGoalTargets && (
          <Link href="/dashboard/settings">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Modifica Target
            </Button>
          </Link>
        )}
      </div>

      {/* Goal-derived targets indicator */}
      {usingGoalTargets && (
        <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/10">
          <p className="text-sm text-green-800 dark:text-green-200">
            <strong>Target calcolati dagli obiettivi</strong> — I target di allocazione sono derivati come media pesata delle allocazioni raccomandate dei tuoi obiettivi finanziari.
          </p>
        </div>
      )}

      {/* Legend (shared for both mobile and desktop) */}
      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">Legenda</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li><strong>COMPRA:</strong> Sotto-allocato (compra di più)</li>
          <li><strong>VENDI:</strong> Sovra-allocato (riduci posizione)</li>
          <li><strong>OK:</strong> Allocazione ottimale (±2%)</li>
        </ul>
      </div>

      {/* ========== MOBILE VIEW ========== */}
      {isMobile && (
        <>
          {/* Asset Class Cards */}
          {Object.keys(allocation.byAssetClass).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Nessun asset presente. Aggiungi degli asset per vedere l'allocazione.
              </CardContent>
            </Card>
          ) : (
            renderAssetClassCards()
          )}

          {/* Bottom Sheet for drill-down */}
          <AllocationSheet
            open={sheetNav.isOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleSheetClose();
              }
            }}
            title={
              sheetNav.level === 'specificAsset'
                ? 'Specific Assets'
                : 'Sotto-Categoria'
            }
            breadcrumb={
              sheetNav.assetClass
                ? `${assetClassLabels[sheetNav.assetClass]}${
                    sheetNav.subCategory ? ` → ${sheetNav.subCategory}` : ''
                  }`
                : undefined
            }
            onBack={sheetNav.level === 'specificAsset' ? handleBack : undefined}
          >
            {renderSheetContent()}
          </AllocationSheet>
        </>
      )}

      {/* ========== DESKTOP VIEW (unchanged tables) ========== */}
      {!isMobile && (
        <>
          {/* Asset Class Table */}
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

          {/* Sub-Category Tables - One card per asset class */}
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
        </>
      )}
    </div>
  );
}
