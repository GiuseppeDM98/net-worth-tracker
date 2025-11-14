'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2 } from 'lucide-react';

interface CreateManualSnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSuccess?: () => void;
}

interface AssetEntry {
  assetId: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  totalValue: number;
}

export function CreateManualSnapshotModal({
  open,
  onOpenChange,
  userId,
  onSuccess,
}: CreateManualSnapshotModalProps) {
  const currentDate = new Date();
  const [year, setYear] = useState<string>(currentDate.getFullYear().toString());
  const [month, setMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [totalNetWorth, setTotalNetWorth] = useState<string>('');
  const [liquidNetWorth, setLiquidNetWorth] = useState<string>('');
  const [illiquidNetWorth, setIlliquidNetWorth] = useState<string>('');

  // Asset class values
  const [equity, setEquity] = useState<string>('0');
  const [bonds, setBonds] = useState<string>('0');
  const [crypto, setCrypto] = useState<string>('0');
  const [realestate, setRealestate] = useState<string>('0');
  const [cash, setCash] = useState<string>('0');
  const [commodity, setCommodity] = useState<string>('0');

  // Asset entries
  const [assets, setAssets] = useState<AssetEntry[]>([]);

  const [isCreating, setIsCreating] = useState(false);

  const addAsset = () => {
    setAssets([
      ...assets,
      {
        assetId: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ticker: '',
        name: '',
        quantity: 0,
        price: 0,
        totalValue: 0,
      },
    ]);
  };

  const removeAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  const updateAsset = (index: number, field: keyof AssetEntry, value: string | number) => {
    const updatedAssets = [...assets];
    updatedAssets[index] = {
      ...updatedAssets[index],
      [field]: value,
    };

    // Recalculate totalValue if quantity or price changes
    if (field === 'quantity' || field === 'price') {
      const qty = field === 'quantity' ? Number(value) : updatedAssets[index].quantity;
      const prc = field === 'price' ? Number(value) : updatedAssets[index].price;
      updatedAssets[index].totalValue = qty * prc;
    }

    setAssets(updatedAssets);
  };

  const calculateAssetAllocation = (total: number, byAssetClass: Record<string, number>) => {
    const allocation: Record<string, number> = {};
    if (total > 0) {
      Object.entries(byAssetClass).forEach(([assetClass, value]) => {
        allocation[assetClass] = (value / total) * 100;
      });
    }
    return allocation;
  };

  const handleCreate = async () => {
    // Validate inputs
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const totalNW = parseFloat(totalNetWorth);
    const liquidNW = parseFloat(liquidNetWorth);
    const illiquidNW = parseFloat(illiquidNetWorth);

    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      toast.error('Inserisci un anno valido');
      return;
    }

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      toast.error('Inserisci un mese valido (1-12)');
      return;
    }

    if (isNaN(totalNW) || totalNW < 0) {
      toast.error('Inserisci un Patrimonio Totale valido');
      return;
    }

    if (isNaN(liquidNW) || liquidNW < 0) {
      toast.error('Inserisci un Patrimonio Liquido valido');
      return;
    }

    if (isNaN(illiquidNW) || illiquidNW < 0) {
      toast.error('Inserisci un Patrimonio Illiquido valido');
      return;
    }

    // Build byAssetClass object
    const byAssetClass: Record<string, number> = {};
    const equityVal = parseFloat(equity) || 0;
    const bondsVal = parseFloat(bonds) || 0;
    const cryptoVal = parseFloat(crypto) || 0;
    const realestateVal = parseFloat(realestate) || 0;
    const cashVal = parseFloat(cash) || 0;
    const commodityVal = parseFloat(commodity) || 0;

    if (equityVal > 0) byAssetClass.equity = equityVal;
    if (bondsVal > 0) byAssetClass.bonds = bondsVal;
    if (cryptoVal > 0) byAssetClass.crypto = cryptoVal;
    if (realestateVal > 0) byAssetClass.realestate = realestateVal;
    if (cashVal > 0) byAssetClass.cash = cashVal;
    if (commodityVal > 0) byAssetClass.commodity = commodityVal;

    // Validate asset class sum
    const assetClassSum = equityVal + bondsVal + cryptoVal + realestateVal + cashVal + commodityVal;
    if (Math.abs(assetClassSum - totalNW) > 0.01) {
      toast.error(
        `La somma delle Asset Class (${assetClassSum.toFixed(2)}) non corrisponde al Patrimonio Totale (${totalNW.toFixed(2)})`
      );
      return;
    }

    // Validate liquidity sum
    if (Math.abs(liquidNW + illiquidNW - totalNW) > 0.01) {
      toast.error(
        `La somma di Liquido e Illiquido (${(liquidNW + illiquidNW).toFixed(2)}) non corrisponde al Patrimonio Totale (${totalNW.toFixed(2)})`
      );
      return;
    }

    // Calculate asset allocation
    const assetAllocation = calculateAssetAllocation(totalNW, byAssetClass);

    setIsCreating(true);

    try {
      // Create snapshot document
      const snapshot = {
        userId,
        year: yearNum,
        month: monthNum,
        totalNetWorth: totalNW,
        liquidNetWorth: liquidNW,
        illiquidNetWorth: illiquidNW,
        byAssetClass,
        byAsset: assets,
        assetAllocation,
        createdAt: new Date(),
      };

      // Save to Firestore
      const response = await fetch('/api/portfolio/snapshot/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(snapshot),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Errore durante la creazione dello snapshot');
      }

      toast.success('Snapshot creato con successo!');
      onOpenChange(false);
      onSuccess?.();

      // Reset form
      resetForm();
    } catch (error) {
      console.error('Error creating manual snapshot:', error);
      toast.error(error instanceof Error ? error.message : 'Errore durante la creazione dello snapshot');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    const currentDate = new Date();
    setYear(currentDate.getFullYear().toString());
    setMonth((currentDate.getMonth() + 1).toString());
    setTotalNetWorth('');
    setLiquidNetWorth('');
    setIlliquidNetWorth('');
    setEquity('0');
    setBonds('0');
    setCrypto('0');
    setRealestate('0');
    setCash('0');
    setCommodity('0');
    setAssets([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crea Snapshot Manuale</DialogTitle>
          <DialogDescription>
            Inserisci i dati storici per creare uno snapshot manuale di un mese passato.
            Tutti i campi contrassegnati sono obbligatori.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">Dati Generali</TabsTrigger>
            <TabsTrigger value="assetclass">Asset Class</TabsTrigger>
            <TabsTrigger value="assets">Asset (Opzionale)</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="year">Anno *</Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  min="1900"
                  max="2100"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="month">Mese * (1-12)</Label>
                <Input
                  id="month"
                  type="number"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  placeholder="1"
                  min="1"
                  max="12"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="total-net-worth">Patrimonio Totale (€) *</Label>
              <Input
                id="total-net-worth"
                type="number"
                value={totalNetWorth}
                onChange={(e) => setTotalNetWorth(e.target.value)}
                placeholder="100000"
                step="0.01"
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                Valore totale del patrimonio netto
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="liquid-net-worth">Patrimonio Liquido (€) *</Label>
                <Input
                  id="liquid-net-worth"
                  type="number"
                  value={liquidNetWorth}
                  onChange={(e) => setLiquidNetWorth(e.target.value)}
                  placeholder="85000"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="illiquid-net-worth">Patrimonio Illiquido (€) *</Label>
                <Input
                  id="illiquid-net-worth"
                  type="number"
                  value={illiquidNetWorth}
                  onChange={(e) => setIlliquidNetWorth(e.target.value)}
                  placeholder="15000"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>Nota:</strong> La somma di Liquido e Illiquido deve essere uguale al Patrimonio Totale.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="assetclass" className="space-y-4 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="equity">Azioni (€)</Label>
                <Input
                  id="equity"
                  type="number"
                  value={equity}
                  onChange={(e) => setEquity(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bonds">Obbligazioni (€)</Label>
                <Input
                  id="bonds"
                  type="number"
                  value={bonds}
                  onChange={(e) => setBonds(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="crypto">Criptovalute (€)</Label>
                <Input
                  id="crypto"
                  type="number"
                  value={crypto}
                  onChange={(e) => setCrypto(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="realestate">Immobili (€)</Label>
                <Input
                  id="realestate"
                  type="number"
                  value={realestate}
                  onChange={(e) => setRealestate(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cash">Liquidità (€)</Label>
                <Input
                  id="cash"
                  type="number"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="commodity">Materie Prime (€)</Label>
                <Input
                  id="commodity"
                  type="number"
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Attenzione:</strong> La somma di tutte le Asset Class deve essere uguale al Patrimonio Totale.
                Somma attuale: €{' '}
                {(
                  parseFloat(equity || '0') +
                  parseFloat(bonds || '0') +
                  parseFloat(crypto || '0') +
                  parseFloat(realestate || '0') +
                  parseFloat(cash || '0') +
                  parseFloat(commodity || '0')
                ).toFixed(2)}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="assets" className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Aggiungi i dettagli degli asset (opzionale)
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addAsset}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi Asset
              </Button>
            </div>

            {assets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nessun asset aggiunto. Questo campo è opzionale.
              </div>
            ) : (
              <div className="space-y-4">
                {assets.map((asset, index) => (
                  <div
                    key={asset.assetId}
                    className="grid gap-3 p-4 border rounded-lg relative"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => removeAsset(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`ticker-${index}`}>Ticker</Label>
                        <Input
                          id={`ticker-${index}`}
                          value={asset.ticker}
                          onChange={(e) => updateAsset(index, 'ticker', e.target.value)}
                          placeholder="AAPL"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`name-${index}`}>Nome</Label>
                        <Input
                          id={`name-${index}`}
                          value={asset.name}
                          onChange={(e) => updateAsset(index, 'name', e.target.value)}
                          placeholder="Apple Inc."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`quantity-${index}`}>Quantità</Label>
                        <Input
                          id={`quantity-${index}`}
                          type="number"
                          value={asset.quantity}
                          onChange={(e) =>
                            updateAsset(index, 'quantity', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          step="0.01"
                          min="0"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`price-${index}`}>Prezzo (€)</Label>
                        <Input
                          id={`price-${index}`}
                          type="number"
                          value={asset.price}
                          onChange={(e) =>
                            updateAsset(index, 'price', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          step="0.01"
                          min="0"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`total-${index}`}>Valore Totale</Label>
                        <Input
                          id={`total-${index}`}
                          type="number"
                          value={asset.totalValue.toFixed(2)}
                          readOnly
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Annulla
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creazione...' : 'Crea Snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
