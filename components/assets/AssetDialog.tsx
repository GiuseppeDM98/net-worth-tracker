'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Asset, AssetFormData, AssetType, AssetClass, AssetAllocationTarget } from '@/types/assets';
import { createAsset, updateAsset } from '@/lib/services/assetService';
import { getTargets } from '@/lib/services/assetAllocationService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

/**
 * Helper to check if asset type requires price updates
 */
function shouldUpdatePrice(assetType: string, subCategory?: string): boolean {
  // Real estate and private equity have fixed valuations
  if (assetType === 'realestate' || subCategory === 'Private Equity') {
    return false;
  }

  // Cash always has price = 1
  if (assetType === 'cash') {
    return false;
  }

  return true;
}

const assetSchema = z.object({
  ticker: z.string().min(1, 'Ticker è obbligatorio'),
  name: z.string().min(1, 'Nome è obbligatorio'),
  type: z.enum(['stock', 'etf', 'bond', 'crypto', 'commodity', 'cash', 'realestate']),
  assetClass: z.enum(['equity', 'bonds', 'crypto', 'realestate', 'cash', 'commodity']),
  subCategory: z.string().optional(),
  exchange: z.string().optional(),
  currency: z.string().min(1, 'Valuta è obbligatoria'),
  quantity: z.number().positive('Quantità deve essere positiva'),
});

type AssetFormValues = z.infer<typeof assetSchema>;

interface AssetDialogProps {
  open: boolean;
  onClose: () => void;
  asset?: Asset | null;
}

const assetTypes: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Azione' },
  { value: 'etf', label: 'ETF' },
  { value: 'bond', label: 'Obbligazione' },
  { value: 'crypto', label: 'Criptovaluta' },
  { value: 'commodity', label: 'Materia Prima' },
  { value: 'cash', label: 'Liquidità' },
  { value: 'realestate', label: 'Immobile' },
];

const assetClasses: { value: AssetClass; label: string }[] = [
  { value: 'equity', label: 'Azioni' },
  { value: 'bonds', label: 'Obbligazioni' },
  { value: 'crypto', label: 'Criptovalute' },
  { value: 'realestate', label: 'Immobili' },
  { value: 'cash', label: 'Liquidità' },
  { value: 'commodity', label: 'Materie Prime' },
];

export function AssetDialog({ open, onClose, asset }: AssetDialogProps) {
  const { user } = useAuth();
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [allocationTargets, setAllocationTargets] = useState<AssetAllocationTarget | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      currency: 'EUR',
      quantity: 0,
    },
  });

  const selectedType = watch('type');
  const selectedAssetClass = watch('assetClass');
  const selectedSubCategory = watch('subCategory');

  // Load allocation targets when dialog opens
  useEffect(() => {
    if (open && user) {
      loadAllocationTargets();
    }
  }, [open, user]);

  const loadAllocationTargets = async () => {
    if (!user) return;

    try {
      setLoadingTargets(true);
      const targets = await getTargets(user.uid);
      setAllocationTargets(targets);
    } catch (error) {
      console.error('Error loading allocation targets:', error);
    } finally {
      setLoadingTargets(false);
    }
  };

  useEffect(() => {
    if (asset) {
      reset({
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        assetClass: asset.assetClass,
        subCategory: asset.subCategory || '',
        exchange: asset.exchange || '',
        currency: asset.currency,
        quantity: asset.quantity,
      });
    } else {
      reset({
        ticker: '',
        name: '',
        type: 'etf',
        assetClass: 'equity',
        subCategory: '',
        exchange: '',
        currency: 'EUR',
        quantity: 0,
      });
    }
  }, [asset, reset]);

  // Get available sub-categories for the selected asset class
  const availableSubCategories = (): string[] => {
    if (!selectedAssetClass || !allocationTargets) return [];

    const assetClassConfig = allocationTargets[selectedAssetClass];
    if (!assetClassConfig?.subCategoryConfig?.enabled) return [];

    return assetClassConfig.subCategoryConfig.categories || [];
  };

  const isSubCategoryEnabled = (): boolean => {
    if (!selectedAssetClass || !allocationTargets) return false;

    const assetClassConfig = allocationTargets[selectedAssetClass];
    return assetClassConfig?.subCategoryConfig?.enabled || false;
  };

  const onSubmit = async (data: AssetFormValues) => {
    if (!user) return;

    // Validate that sub-category is provided if enabled for the asset class
    if (isSubCategoryEnabled() && !data.subCategory) {
      toast.error('La sotto-categoria è obbligatoria per questa classe di asset');
      return;
    }

    try {
      setFetchingPrice(true);

      // Determine current price
      let currentPrice = 1; // Default for cash and fixed-price assets

      // Check if we need to fetch price from Yahoo Finance
      if (shouldUpdatePrice(data.type, data.subCategory)) {
        try {
          const response = await fetch(
            `/api/prices/quote?ticker=${encodeURIComponent(data.ticker)}`
          );
          const quote = await response.json();

          if (quote.price && quote.price > 0) {
            currentPrice = quote.price;
            toast.success(
              `Prezzo recuperato: ${currentPrice.toFixed(2)} ${quote.currency}`
            );
          } else {
            toast.error(
              `Impossibile recuperare il prezzo per ${data.ticker}. Inserisci manualmente il prezzo nella tabella.`
            );
            // Use a placeholder price of 0 to indicate it needs manual update
            currentPrice = 0;
          }
        } catch (error) {
          console.error('Error fetching quote:', error);
          toast.error(
            `Errore nel recupero del prezzo per ${data.ticker}. Inserisci manualmente il prezzo nella tabella.`
          );
          currentPrice = 0;
        }
      }

      const formData: AssetFormData = {
        ticker: data.ticker,
        name: data.name,
        type: data.type,
        assetClass: data.assetClass,
        subCategory: data.subCategory || undefined,
        exchange: data.exchange || undefined,
        currency: data.currency,
        quantity: data.quantity,
        currentPrice,
      };

      if (asset) {
        // When editing, keep the existing price if we're not fetching a new one
        if (!shouldUpdatePrice(data.type, data.subCategory)) {
          formData.currentPrice = asset.currentPrice;
        }
        await updateAsset(asset.id, formData);
        toast.success('Asset aggiornato con successo');
      } else {
        await createAsset(user.uid, formData);
        toast.success('Asset creato con successo');
      }

      onClose();
    } catch (error) {
      console.error('Error saving asset:', error);
      toast.error("Errore nel salvataggio dell'asset");
    } finally {
      setFetchingPrice(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {asset ? 'Modifica Asset' : 'Aggiungi Nuovo Asset'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker *</Label>
              <Input
                id="ticker"
                {...register('ticker')}
                placeholder="es. VWCE.DE"
              />
              {errors.ticker && (
                <p className="text-sm text-red-500">{errors.ticker.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="es. Vanguard FTSE All-World"
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo *</Label>
              <Select
                value={selectedType}
                onValueChange={(value) => setValue('type', value as AssetType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {assetTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-sm text-red-500">{errors.type.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assetClass">Classe Asset *</Label>
              <Select
                value={selectedAssetClass}
                onValueChange={(value) =>
                  setValue('assetClass', value as AssetClass)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona classe" />
                </SelectTrigger>
                <SelectContent>
                  {assetClasses.map((assetClass) => (
                    <SelectItem key={assetClass.value} value={assetClass.value}>
                      {assetClass.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assetClass && (
                <p className="text-sm text-red-500">
                  {errors.assetClass.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {isSubCategoryEnabled() && (
              <div className="space-y-2">
                <Label htmlFor="subCategory">
                  Sotto-categoria
                  {isSubCategoryEnabled() && availableSubCategories().length > 0 && ' *'}
                </Label>
                <Select
                  value={watch('subCategory')}
                  onValueChange={(value) => setValue('subCategory', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sotto-categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubCategories().map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="exchange">Exchange</Label>
              <Input
                id="exchange"
                {...register('exchange')}
                placeholder="es. XETRA, NYSE"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Valuta *</Label>
              <Input
                id="currency"
                {...register('currency')}
                placeholder="EUR"
              />
              {errors.currency && (
                <p className="text-sm text-red-500">{errors.currency.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantità *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                {...register('quantity', { valueAsNumber: true })}
              />
              {errors.quantity && (
                <p className="text-sm text-red-500">{errors.quantity.message}</p>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> Il prezzo corrente verrà recuperato automaticamente da Yahoo Finance.
              {selectedType === 'cash' && ' Per asset di tipo liquidità, il prezzo sarà impostato a 1.'}
              {selectedType === 'realestate' && ' Per immobili, il prezzo deve essere aggiornato manualmente.'}
              {selectedSubCategory === 'Private Equity' && ' Per Private Equity, il prezzo deve essere aggiornato manualmente.'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting || fetchingPrice}>
              {fetchingPrice ? 'Recupero prezzo...' : isSubmitting ? 'Salvataggio...' : asset ? 'Aggiorna' : 'Crea'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
