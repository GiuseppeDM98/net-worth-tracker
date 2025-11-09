'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getTargets,
  setTargets,
  getDefaultTargets,
} from '@/lib/services/assetAllocationService';
import { AssetAllocationTarget } from '@/types/assets';
import { formatPercentage } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface SubTarget {
  name: string;
  percentage: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Asset class targets
  const [equityTarget, setEquityTarget] = useState(70);
  const [bondsTarget, setBondsTarget] = useState(20);
  const [cryptoTarget, setCryptoTarget] = useState(3);
  const [realEstateTarget, setRealEstateTarget] = useState(5);
  const [cashTarget, setCashTarget] = useState(2);
  const [commodityTarget, setCommodityTarget] = useState(0);

  // Sub-targets for equity
  const [equitySubTargets, setEquitySubTargets] = useState<SubTarget[]>([
    { name: 'All-World', percentage: 40 },
    { name: 'Momentum', percentage: 10 },
    { name: 'Quality', percentage: 10 },
    { name: 'Value', percentage: 10 },
    { name: 'Pension', percentage: 15 },
    { name: 'Private Equity', percentage: 5 },
    { name: 'High Risk', percentage: 5 },
    { name: 'Single Stocks', percentage: 5 },
  ]);

  useEffect(() => {
    if (user) {
      loadTargets();
    }
  }, [user]);

  const loadTargets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const targetsData = await getTargets(user.uid);
      const targets = targetsData || getDefaultTargets();

      // Set asset class targets
      setEquityTarget(targets.equity?.targetPercentage || 70);
      setBondsTarget(targets.bonds?.targetPercentage || 20);
      setCryptoTarget(targets.crypto?.targetPercentage || 3);
      setRealEstateTarget(targets.realestate?.targetPercentage || 5);
      setCashTarget(targets.cash?.targetPercentage || 2);
      setCommodityTarget(targets.commodity?.targetPercentage || 0);

      // Set equity sub-targets
      if (targets.equity?.subTargets) {
        const subTargets = Object.entries(targets.equity.subTargets).map(
          ([name, percentage]) => ({ name, percentage })
        );
        setEquitySubTargets(subTargets);
      }
    } catch (error) {
      console.error('Error loading targets:', error);
      toast.error('Errore nel caricamento dei target');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    return (
      equityTarget +
      bondsTarget +
      cryptoTarget +
      realEstateTarget +
      cashTarget +
      commodityTarget
    );
  };

  const calculateSubTargetTotal = () => {
    return equitySubTargets.reduce((sum, target) => sum + target.percentage, 0);
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

    const subTotal = calculateSubTargetTotal();
    if (Math.abs(subTotal - 100) > 0.01) {
      toast.error(
        `Il totale delle sotto-categorie equity deve essere 100%. Attualmente è ${formatPercentage(
          subTotal
        )}`
      );
      return;
    }

    try {
      setSaving(true);

      const targets: AssetAllocationTarget = {
        equity: {
          targetPercentage: equityTarget,
          subTargets: equitySubTargets.reduce(
            (acc, target) => {
              acc[target.name] = target.percentage;
              return acc;
            },
            {} as { [key: string]: number }
          ),
        },
        bonds: {
          targetPercentage: bondsTarget,
        },
        crypto: {
          targetPercentage: cryptoTarget,
        },
        realestate: {
          targetPercentage: realEstateTarget,
        },
        cash: {
          targetPercentage: cashTarget,
        },
        commodity: {
          targetPercentage: commodityTarget,
        },
      };

      await setTargets(user.uid, targets);
      toast.success('Target salvati con successo');
    } catch (error) {
      console.error('Error saving targets:', error);
      toast.error('Errore nel salvataggio dei target');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = getDefaultTargets();
    setEquityTarget(defaults.equity.targetPercentage);
    setBondsTarget(defaults.bonds.targetPercentage);
    setCryptoTarget(defaults.crypto.targetPercentage);
    setRealEstateTarget(defaults.realestate.targetPercentage);
    setCashTarget(defaults.cash.targetPercentage);
    setCommodityTarget(defaults.commodity.targetPercentage);

    if (defaults.equity.subTargets) {
      const subTargets = Object.entries(defaults.equity.subTargets).map(
        ([name, percentage]) => ({ name, percentage })
      );
      setEquitySubTargets(subTargets);
    }

    toast.info('Target ripristinati ai valori predefiniti');
  };

  const handleAddSubTarget = () => {
    setEquitySubTargets([...equitySubTargets, { name: '', percentage: 0 }]);
  };

  const handleRemoveSubTarget = (index: number) => {
    const newSubTargets = equitySubTargets.filter((_, i) => i !== index);
    setEquitySubTargets(newSubTargets);
  };

  const handleSubTargetChange = (
    index: number,
    field: 'name' | 'percentage',
    value: string | number
  ) => {
    const newSubTargets = [...equitySubTargets];
    if (field === 'name') {
      newSubTargets[index].name = value as string;
    } else {
      newSubTargets[index].percentage = value as number;
    }
    setEquitySubTargets(newSubTargets);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  const total = calculateTotal();
  const subTotal = calculateSubTargetTotal();
  const isValidTotal = Math.abs(total - 100) < 0.01;
  const isValidSubTotal = Math.abs(subTotal - 100) < 0.01;

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
              {!isValidTotal && ' (deve essere 100%)'}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="equity">Azioni (Equity)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="equity"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={equityTarget}
                  onChange={(e) => setEquityTarget(parseFloat(e.target.value))}
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bonds">Obbligazioni (Bonds)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="bonds"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={bondsTarget}
                  onChange={(e) => setBondsTarget(parseFloat(e.target.value))}
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="crypto">Criptovalute (Crypto)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="crypto"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={cryptoTarget}
                  onChange={(e) => setCryptoTarget(parseFloat(e.target.value))}
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="realestate">Immobili (Real Estate)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="realestate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={realEstateTarget}
                  onChange={(e) =>
                    setRealEstateTarget(parseFloat(e.target.value))
                  }
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cash">Liquidità (Cash)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cash"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={cashTarget}
                  onChange={(e) => setCashTarget(parseFloat(e.target.value))}
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commodity">Materie Prime (Commodity)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commodity"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commodityTarget}
                  onChange={(e) =>
                    setCommodityTarget(parseFloat(e.target.value))
                  }
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equity Sub-Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sotto-Categorie Equity</CardTitle>
            <div className="flex items-center gap-4">
              <div
                className={`text-sm font-semibold ${
                  isValidSubTotal ? 'text-green-600' : 'text-red-600'
                }`}
              >
                Totale: {formatPercentage(subTotal)}
                {!isValidSubTotal && ' (deve essere 100%)'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddSubTarget}
              >
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {equitySubTargets.map((target, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Nome sotto-categoria"
                    value={target.name}
                    onChange={(e) =>
                      handleSubTargetChange(index, 'name', e.target.value)
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    className="w-24"
                    value={target.percentage}
                    onChange={(e) =>
                      handleSubTargetChange(
                        index,
                        'percentage',
                        parseFloat(e.target.value)
                      )
                    }
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveSubTarget(index)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Le percentuali delle sotto-categorie sono relative al totale della
            classe asset Equity ({formatPercentage(equityTarget)})
          </p>
        </CardContent>
      </Card>

      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">Note</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>
            • Il totale delle allocazioni delle asset class deve essere esattamente
            100%
          </li>
          <li>
            • Il totale delle sotto-categorie equity deve essere esattamente 100%
          </li>
          <li>
            • Le sotto-categorie sono espresse come percentuale della loro asset
            class di appartenenza
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
