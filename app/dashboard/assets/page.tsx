'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Asset } from '@/types/assets';
import {
  getAllAssets,
  deleteAsset,
  calculateAssetValue,
  calculateTotalValue,
} from '@/lib/services/assetService';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { getAssetClassColor } from '@/lib/constants/colors';
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
import { Plus, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export default function AssetsPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  useEffect(() => {
    if (user) {
      loadAssets();
    }
  }, [user]);

  const loadAssets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getAllAssets(user.uid);
      setAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Errore nel caricamento degli asset');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrices = async () => {
    if (!user) return;

    try {
      setUpdating(true);
      const response = await fetch('/api/prices/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `Aggiornati ${data.updated} prezzi${
            data.failed.length > 0
              ? `, ${data.failed.length} falliti`
              : ''
          }`
        );
        await loadAssets();
      } else {
        toast.error('Errore nell\'aggiornamento dei prezzi');
      }
    } catch (error) {
      console.error('Error updating prices:', error);
      toast.error('Errore nell\'aggiornamento dei prezzi');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo asset?')) {
      return;
    }

    try {
      await deleteAsset(assetId);
      toast.success('Asset eliminato con successo');
      await loadAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Errore nell\'eliminazione dell\'asset');
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAsset(null);
    loadAssets();
  };

  const totalValue = calculateTotalValue(assets);

  // Helper function to check if asset requires manual price update
  const requiresManualPricing = (asset: Asset) => {
    // If autoUpdatePrice is explicitly set to false
    if (asset.autoUpdatePrice === false) {
      return true;
    }
    // Types that don't support automatic updates
    const manualTypes = ['realestate', 'cash'];
    if (manualTypes.includes(asset.type)) {
      return true;
    }
    // Private Equity subcategory
    if (asset.subCategory === 'Private Equity') {
      return true;
    }
    return false;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
          <p className="mt-2 text-gray-600">
            Gestisci i tuoi asset di investimento
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleUpdatePrices}
            disabled={updating || assets.length === 0}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${updating ? 'animate-spin' : ''}`}
            />
            Aggiorna Prezzi
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Asset
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Totale Patrimonio: {formatCurrency(totalValue)}</CardTitle>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessun asset presente. Clicca su "Aggiungi Asset" per iniziare.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-right">Quantità</TableHead>
                    <TableHead className="text-right">Prezzo</TableHead>
                    <TableHead className="text-right">Valore Totale</TableHead>
                    <TableHead>Ultimo Aggiornamento</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => {
                    const value = calculateAssetValue(asset);
                    const lastUpdate =
                      asset.lastPriceUpdate instanceof Date
                        ? asset.lastPriceUpdate
                        : new Date();
                    const isManualPrice = requiresManualPricing(asset);
                    const assetClassColor = getAssetClassColor(asset.assetClass);

                    return (
                      <TableRow
                        key={asset.id}
                        className={isManualPrice ? 'bg-amber-50' : ''}
                      >
                        <TableCell className="font-medium">
                          {asset.name}
                        </TableCell>
                        <TableCell>{asset.ticker}</TableCell>
                        <TableCell className="capitalize">{asset.type}</TableCell>
                        <TableCell className="capitalize">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                            style={{
                              backgroundColor: `${assetClassColor}20`,
                              color: assetClassColor,
                              border: `1px solid ${assetClassColor}40`
                            }}
                          >
                            {asset.assetClass}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(asset.quantity, 2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(asset.currentPrice)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(value)}
                        </TableCell>
                        <TableCell>
                          {format(lastUpdate, 'dd/MM/yyyy HH:mm', {
                            locale: it,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(asset)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(asset.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AssetDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        asset={editingAsset}
      />
    </div>
  );
}
