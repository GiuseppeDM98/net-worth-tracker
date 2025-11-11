'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSettings,
  setSettings,
  getDefaultTargets,
  calculateEquityPercentage,
} from '@/lib/services/assetAllocationService';
import { AssetAllocationTarget, AssetClass } from '@/types/assets';
import { formatPercentage } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, RotateCcw, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

interface SubTarget {
  name: string;
  percentage: number;
}

interface AssetClassState {
  targetPercentage: number;
  subCategoryEnabled: boolean;
  categories: string[];
  subTargets: SubTarget[];
  expanded: boolean;
}

const assetClassLabels: Record<AssetClass, string> = {
  equity: 'Azioni (Equity)',
  bonds: 'Obbligazioni (Bonds)',
  crypto: 'Criptovalute (Crypto)',
  realestate: 'Immobili (Real Estate)',
  cash: 'Liquidità (Cash)',
  commodity: 'Materie Prime (Commodity)',
};

// Order: Azioni → Obbligazioni → Commodities → Real Estate → Cash → Crypto
const assetClasses: AssetClass[] = [
  'equity',
  'bonds',
  'commodity',
  'realestate',
  'cash',
  'crypto',
];

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userAge, setUserAge] = useState<number | undefined>(undefined);
  const [riskFreeRate, setRiskFreeRate] = useState<number | undefined>(undefined);
  const [autoCalculate, setAutoCalculate] = useState(false);
  const [cashUseFixedAmount, setCashUseFixedAmount] = useState(false);
  const [cashFixedAmount, setCashFixedAmount] = useState<number>(0);
  const [assetClassStates, setAssetClassStates] = useState<
    Record<AssetClass, AssetClassState>
  >({} as Record<AssetClass, AssetClassState>);

  useEffect(() => {
    if (user) {
      loadTargets();
    }
  }, [user]);

  // Auto-calculate equity and bonds percentages when age or risk-free rate changes
  useEffect(() => {
    if (
      autoCalculate &&
      userAge !== undefined &&
      riskFreeRate !== undefined &&
      Object.keys(assetClassStates).length > 0
    ) {
      const equityPercentage = roundToTwoDecimals(
        calculateEquityPercentage(userAge, riskFreeRate)
      );

      // Calculate bonds percentage: 100 - sum of all other asset classes
      // (excluding cash if using fixed amount)
      const otherAssetClasses = assetClasses.filter(
        (ac) => ac !== 'equity' && ac !== 'bonds'
      );
      const otherTotal = otherAssetClasses.reduce(
        (sum, ac) => {
          // Exclude cash from percentage total if using fixed amount
          if (ac === 'cash' && cashUseFixedAmount) {
            return sum;
          }
          return sum + (assetClassStates[ac]?.targetPercentage || 0);
        },
        0
      );
      const bondsPercentage = roundToTwoDecimals(
        Math.max(0, 100 - equityPercentage - otherTotal)
      );

      // Update equity and bonds percentages
      setAssetClassStates((prev) => ({
        ...prev,
        equity: {
          ...prev.equity,
          targetPercentage: equityPercentage,
        },
        bonds: {
          ...prev.bonds,
          targetPercentage: bondsPercentage,
        },
      }));
    }
  }, [userAge, riskFreeRate, autoCalculate]);

  // Recalculate bonds when other asset classes change (excluding equity and bonds)
  useEffect(() => {
    if (
      autoCalculate &&
      userAge !== undefined &&
      riskFreeRate !== undefined &&
      Object.keys(assetClassStates).length > 0
    ) {
      const equityPercentage = roundToTwoDecimals(
        calculateEquityPercentage(userAge, riskFreeRate)
      );

      const otherAssetClasses = assetClasses.filter(
        (ac) => ac !== 'equity' && ac !== 'bonds'
      );
      const otherTotal = otherAssetClasses.reduce(
        (sum, ac) => {
          // Exclude cash from percentage total if using fixed amount
          if (ac === 'cash' && cashUseFixedAmount) {
            return sum;
          }
          return sum + (assetClassStates[ac]?.targetPercentage || 0);
        },
        0
      );
      const bondsPercentage = roundToTwoDecimals(
        Math.max(0, 100 - equityPercentage - otherTotal)
      );

      // Only update if bonds percentage has changed
      if (assetClassStates.bonds?.targetPercentage !== bondsPercentage) {
        setAssetClassStates((prev) => ({
          ...prev,
          bonds: {
            ...prev.bonds,
            targetPercentage: bondsPercentage,
          },
        }));
      }
    }
  }, [
    assetClassStates.crypto?.targetPercentage,
    assetClassStates.realestate?.targetPercentage,
    assetClassStates.cash?.targetPercentage,
    assetClassStates.commodity?.targetPercentage,
    cashUseFixedAmount,
  ]);

  const loadTargets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const settingsData = await getSettings(user.uid);
      const targets = settingsData?.targets || getDefaultTargets();

      // Load user age and risk-free rate if available
      if (settingsData) {
        setUserAge(settingsData.userAge);
        setRiskFreeRate(settingsData.riskFreeRate);
        setAutoCalculate(
          settingsData.userAge !== undefined &&
          settingsData.riskFreeRate !== undefined
        );
      }

      // Load cash fixed amount settings if available
      const cashTargetData = targets['cash'];
      if (cashTargetData) {
        setCashUseFixedAmount(cashTargetData.useFixedAmount || false);
        setCashFixedAmount(cashTargetData.fixedAmount || 0);
      }

      const states: Record<AssetClass, AssetClassState> = {} as Record<
        AssetClass,
        AssetClassState
      >;

      assetClasses.forEach((assetClass) => {
        const targetData = targets[assetClass];
        const subCategoryConfig = targetData?.subCategoryConfig;
        const subTargets = targetData?.subTargets;

        states[assetClass] = {
          targetPercentage: targetData?.targetPercentage || 0,
          subCategoryEnabled: subCategoryConfig?.enabled || false,
          categories: subCategoryConfig?.categories || [],
          subTargets: subTargets
            ? Object.entries(subTargets).map(([name, percentage]) => ({
                name,
                percentage,
              }))
            : [],
          expanded: assetClass === 'equity', // Solo equity espanso di default
        };
      });

      setAssetClassStates(states);
    } catch (error) {
      console.error('Error loading targets:', error);
      toast.error('Errore nel caricamento dei target');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    return assetClasses.reduce(
      (sum, assetClass) => {
        // Exclude cash from percentage total if using fixed amount
        if (assetClass === 'cash' && cashUseFixedAmount) {
          return sum;
        }
        return sum + (assetClassStates[assetClass]?.targetPercentage || 0);
      },
      0
    );
  };

  const calculateSubTargetTotal = (assetClass: AssetClass) => {
    return (
      assetClassStates[assetClass]?.subTargets.reduce(
        (sum, target) => sum + target.percentage,
        0
      ) || 0
    );
  };

  const handleSave = async () => {
    if (!user) return;

    const total = calculateTotal();
    if (Math.abs(total - 100) > 0.01) {
      toast.error(
        `Il totale deve essere 100%. Attualmente è ${formatPercentage(total)}`
      );
      return;
    }

    // Validate sub-targets for each enabled asset class
    for (const assetClass of assetClasses) {
      const state = assetClassStates[assetClass];
      if (state.subCategoryEnabled) {
        const subTotal = calculateSubTargetTotal(assetClass);
        if (Math.abs(subTotal - 100) > 0.01) {
          toast.error(
            `Il totale delle sotto-categorie ${assetClassLabels[assetClass]} deve essere 100%. Attualmente è ${formatPercentage(
              subTotal
            )}`
          );
          return;
        }

        // Check for empty names
        const hasEmptyNames = state.subTargets.some(
          (target) => !target.name.trim()
        );
        if (hasEmptyNames) {
          toast.error(
            `Tutte le sotto-categorie di ${assetClassLabels[assetClass]} devono avere un nome`
          );
          return;
        }

        // Check for duplicates
        const names = state.subTargets.map((t) => t.name.trim().toLowerCase());
        const hasDuplicates = names.length !== new Set(names).size;
        if (hasDuplicates) {
          toast.error(
            `Le sotto-categorie di ${assetClassLabels[assetClass]} non possono avere nomi duplicati`
          );
          return;
        }
      }
    }

    try {
      setSaving(true);

      const targets: AssetAllocationTarget = {};

      assetClasses.forEach((assetClass) => {
        const state = assetClassStates[assetClass];
        targets[assetClass] = {
          targetPercentage: state.targetPercentage,
          ...(assetClass === 'cash' && {
            useFixedAmount: cashUseFixedAmount,
            fixedAmount: cashFixedAmount,
          }),
          subCategoryConfig: {
            enabled: state.subCategoryEnabled,
            // Sync categories array with actual subcategory names from subTargets
            categories: state.subCategoryEnabled && state.subTargets.length > 0
              ? state.subTargets.map(t => t.name)
              : state.categories,
          },
        };

        if (state.subCategoryEnabled && state.subTargets.length > 0) {
          targets[assetClass].subTargets = state.subTargets.reduce(
            (acc, target) => {
              acc[target.name] = target.percentage;
              return acc;
            },
            {} as { [key: string]: number }
          );
        }
      });

      await setSettings(user.uid, {
        userAge,
        riskFreeRate,
        targets,
      });
      toast.success('Impostazioni salvate con successo');
    } catch (error) {
      console.error('Error saving targets:', error);
      toast.error('Errore nel salvataggio dei target');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = getDefaultTargets();
    const states: Record<AssetClass, AssetClassState> = {} as Record<
      AssetClass,
      AssetClassState
    >;

    assetClasses.forEach((assetClass) => {
      const targetData = defaults[assetClass];
      const subCategoryConfig = targetData?.subCategoryConfig;
      const subTargets = targetData?.subTargets;

      states[assetClass] = {
        targetPercentage: targetData?.targetPercentage || 0,
        subCategoryEnabled: subCategoryConfig?.enabled || false,
        categories: subCategoryConfig?.categories || [],
        subTargets: subTargets
          ? Object.entries(subTargets).map(([name, percentage]) => ({
              name,
              percentage,
            }))
          : [],
        expanded: assetClass === 'equity',
      };
    });

    setAssetClassStates(states);

    // Reset cash fixed amount settings to defaults
    const cashDefaults = defaults['cash'];
    setCashUseFixedAmount(cashDefaults?.useFixedAmount || false);
    setCashFixedAmount(cashDefaults?.fixedAmount || 0);

    toast.info('Target ripristinati ai valori predefiniti');
  };

  const updateAssetClassState = (
    assetClass: AssetClass,
    updates: Partial<AssetClassState>
  ) => {
    setAssetClassStates((prev) => ({
      ...prev,
      [assetClass]: {
        ...prev[assetClass],
        ...updates,
      },
    }));
  };

  const handleToggleSubCategories = (assetClass: AssetClass, enabled: boolean) => {
    const state = assetClassStates[assetClass];

    if (enabled && state.subTargets.length === 0) {
      // Initialize with default categories if enabling for the first time
      const subTargets = state.categories.map((name) => ({
        name,
        percentage: 0,
      }));
      updateAssetClassState(assetClass, {
        subCategoryEnabled: enabled,
        subTargets,
      });
    } else {
      updateAssetClassState(assetClass, { subCategoryEnabled: enabled });
    }
  };

  const handleAddSubTarget = (assetClass: AssetClass) => {
    const state = assetClassStates[assetClass];
    updateAssetClassState(assetClass, {
      subTargets: [...state.subTargets, { name: '', percentage: 0 }],
    });
  };

  const handleRemoveSubTarget = (assetClass: AssetClass, index: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = state.subTargets.filter((_, i) => i !== index);
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleSubTargetChange = (
    assetClass: AssetClass,
    index: number,
    field: 'name' | 'percentage',
    value: string | number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    if (field === 'name') {
      newSubTargets[index].name = value as string;
    } else {
      newSubTargets[index].percentage = value as number;
    }
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleAddCategory = (assetClass: AssetClass, categoryName: string) => {
    const state = assetClassStates[assetClass];
    if (!categoryName.trim()) return;

    const trimmedName = categoryName.trim();
    if (state.categories.includes(trimmedName)) {
      toast.error('Questa categoria esiste già');
      return;
    }

    updateAssetClassState(assetClass, {
      categories: [...state.categories, trimmedName],
    });
  };

  const handleRemoveCategory = (assetClass: AssetClass, categoryName: string) => {
    const state = assetClassStates[assetClass];
    const newCategories = state.categories.filter((c) => c !== categoryName);

    // Also remove from subTargets if present
    const newSubTargets = state.subTargets.filter((t) => t.name !== categoryName);

    updateAssetClassState(assetClass, {
      categories: newCategories,
      subTargets: newSubTargets,
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  const total = calculateTotal();
  const isValidTotal = Math.abs(total - 100) < 0.01;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Impostazioni</h1>
          <p className="mt-2 text-gray-600">
            Configura i tuoi target di allocazione del portafoglio
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Ripristina Default
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </div>

      {/* User Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Impostazioni Utente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="userAge">Età (anni)</Label>
                <Input
                  id="userAge"
                  type="number"
                  min="0"
                  max="120"
                  value={userAge || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : undefined;
                    setUserAge(value);
                  }}
                  placeholder="Inserisci la tua età"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="riskFreeRate">
                  Tasso Risk-Free Rate (%)
                </Label>
                <Input
                  id="riskFreeRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={riskFreeRate || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    setRiskFreeRate(value);
                  }}
                  placeholder="Es: 3.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="autoCalculate"
                checked={autoCalculate}
                onCheckedChange={setAutoCalculate}
                disabled={userAge === undefined || riskFreeRate === undefined}
              />
              <Label htmlFor="autoCalculate" className="text-sm">
                Calcola automaticamente % Azioni e Obbligazioni
              </Label>
            </div>

            {autoCalculate && userAge !== undefined && riskFreeRate !== undefined && (
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  <strong>Formula applicata:</strong> 125 - {userAge} - ({riskFreeRate} × 5) ={' '}
                  <strong>{calculateEquityPercentage(userAge, riskFreeRate).toFixed(2)}% Azioni</strong>
                </p>
                <p className="mt-1 text-sm text-blue-800">
                  La percentuale di Obbligazioni sarà calcolata come: 100% - (somma delle altre asset class)
                </p>
              </div>
            )}

            <p className="text-sm text-gray-600">
              <strong>Nota:</strong> Il tasso risk-free può essere recuperato da{' '}
              <a
                href="https://www.investing.com/rates-bonds/italy-10-year-bond-yield"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                BTP 10 anni Italia su Investing.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Asset Class Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Target Allocazione Asset Class</CardTitle>
            <div
              className={`text-sm font-semibold ${
                isValidTotal ? 'text-green-600' : 'text-red-600'
              }`}
            >
              Totale: {formatPercentage(total)}
              {cashUseFixedAmount && ' (escl. liquidità fissa)'}
              {!isValidTotal && ' (deve essere 100%)'}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {assetClasses.map((assetClass) => {
              const isAutoCalculated = autoCalculate && (assetClass === 'equity' || assetClass === 'bonds');
              const isCash = assetClass === 'cash';
              return (
                <div key={assetClass} className="space-y-2">
                  <Label htmlFor={assetClass}>
                    {assetClassLabels[assetClass]}
                    {isAutoCalculated && (
                      <span className="ml-2 text-xs text-blue-600">(Calcolato automaticamente)</span>
                    )}
                  </Label>
                  {isCash && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="cashFixedToggle"
                        checked={cashUseFixedAmount}
                        onCheckedChange={setCashUseFixedAmount}
                      />
                      <Label htmlFor="cashFixedToggle" className="text-sm">
                        Valore fisso in €
                      </Label>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      id={assetClass}
                      type="number"
                      step="0.01"
                      min="0"
                      max={isCash && cashUseFixedAmount ? undefined : "100"}
                      value={
                        isCash && cashUseFixedAmount
                          ? cashFixedAmount
                          : assetClassStates[assetClass]?.targetPercentage || 0
                      }
                      onChange={(e) => {
                        if (isCash && cashUseFixedAmount) {
                          setCashFixedAmount(parseFloat(e.target.value) || 0);
                        } else {
                          updateAssetClassState(assetClass, {
                            targetPercentage: roundToTwoDecimals(parseFloat(e.target.value) || 0),
                          });
                        }
                      }}
                      disabled={isAutoCalculated}
                      className={isAutoCalculated ? 'bg-gray-100' : ''}
                    />
                    <span className="text-sm text-gray-600">
                      {isCash && cashUseFixedAmount ? '€' : '%'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sub-Categories for each Asset Class */}
      {assetClasses.map((assetClass) => {
        const state = assetClassStates[assetClass];
        if (!state) return null;

        const subTotal = calculateSubTargetTotal(assetClass);
        const isValidSubTotal = Math.abs(subTotal - 100) < 0.01;

        return (
          <Card key={`sub-${assetClass}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateAssetClassState(assetClass, {
                        expanded: !state.expanded,
                      })
                    }
                  >
                    {state.expanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                  <CardTitle>
                    Sotto-Categorie {assetClassLabels[assetClass]}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${assetClass}`} className="text-sm">
                      Abilita
                    </Label>
                    <Switch
                      id={`toggle-${assetClass}`}
                      checked={state.subCategoryEnabled}
                      onCheckedChange={(checked: boolean) =>
                        handleToggleSubCategories(assetClass, checked)
                      }
                    />
                  </div>
                  {state.subCategoryEnabled && (
                    <div
                      className={`text-sm font-semibold ${
                        isValidSubTotal ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      Totale: {formatPercentage(subTotal)}
                      {!isValidSubTotal && ' (deve essere 100%)'}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            {state.expanded && state.subCategoryEnabled && (
              <CardContent>
                <div className="space-y-4">
                  {/* Sub-Targets */}
                  <div className="space-y-3">
                    {state.subTargets
                      .map((target, originalIndex) => ({ target, originalIndex }))
                      .sort((a, b) => a.target.name.localeCompare(b.target.name))
                      .map(({ target, originalIndex }) => (
                        <div key={originalIndex} className="flex items-center gap-3">
                        <div className="flex-1">
                          <Input
                            placeholder="Nome sotto-categoria"
                            value={target.name}
                            onChange={(e) =>
                              handleSubTargetChange(
                                assetClass,
                                originalIndex,
                                'name',
                                e.target.value
                              )
                            }
                            list={`${assetClass}-categories`}
                          />
                          <datalist id={`${assetClass}-categories`}>
                            {state.categories.map((cat) => (
                              <option key={cat} value={cat} />
                            ))}
                          </datalist>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            className="w-24"
                            value={target.percentage}
                            onChange={(e) =>
                              handleSubTargetChange(
                                assetClass,
                                originalIndex,
                                'percentage',
                                roundToTwoDecimals(parseFloat(e.target.value) || 0)
                              )
                            }
                          />
                          <span className="text-sm text-gray-600">%</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSubTarget(assetClass, originalIndex)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddSubTarget(assetClass)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi Sotto-Categoria
                  </Button>

                  <p className="text-sm text-gray-600">
                    Le percentuali delle sotto-categorie sono relative al totale
                    della classe asset {assetClassLabels[assetClass]} (
                    {formatPercentage(state.targetPercentage)})
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">Note</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>
            • Il totale delle allocazioni delle asset class deve essere
            esattamente 100%
          </li>
          <li>
            • La liquidità può essere impostata come valore fisso in euro. In questo caso,
            le percentuali delle altre asset class si applicheranno al patrimonio rimanente
            (totale - liquidità fissa)
          </li>
          <li>
            • Per ogni asset class con sotto-categorie abilitate, il totale
            delle sotto-categorie deve essere esattamente 100%
          </li>
          <li>
            • Le sotto-categorie sono espresse come percentuale della loro asset
            class di appartenenza
          </li>
          <li>
            • Usa il toggle &quot;Abilita&quot; per attivare/disattivare le sotto-categorie
            per ciascuna asset class
          </li>
          <li>
            • I cambiamenti saranno applicati immediatamente alla pagina
            Allocazione
          </li>
        </ul>
      </div>
    </div>
  );
}
