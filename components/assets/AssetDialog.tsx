'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Asset, AssetFormData, AssetType, AssetClass } from '@/types/assets';
import { createAsset, updateAsset } from '@/lib/services/assetService';
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

const assetSchema = z.object({
  ticker: z.string().min(1, 'Ticker è obbligatorio'),
  name: z.string().min(1, 'Nome è obbligatorio'),
  type: z.enum(['stock', 'etf', 'bond', 'crypto', 'commodity', 'cash', 'realestate']),
  assetClass: z.enum(['equity', 'bonds', 'crypto', 'realestate', 'cash', 'commodity']),
  subCategory: z.string().optional(),
  exchange: z.string().optional(),
  currency: z.string().default('EUR'),
  quantity: z.number().positive('Quantità deve essere positiva'),
  averageCost: z.number().optional(),
  currentPrice: z.number().positive('Prezzo deve essere positivo'),
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

const subCategories = [
  'All-World',
  'Momentum',
  'Quality',
  'Value',
  'Pension',
  'Private Equity',
  'High Risk',
  'Single Stocks',
];

export function AssetDialog({ open, onClose, asset }: AssetDialogProps) {
  const { user } = useAuth();
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
      currentPrice: 0,
    },
  });

  const selectedType = watch('type');
  const selectedAssetClass = watch('assetClass');

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
        averageCost: asset.averageCost || undefined,
        currentPrice: asset.currentPrice,
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
        averageCost: undefined,
        currentPrice: 0,
      });
    }
  }, [asset, reset]);

  const onSubmit = async (data: AssetFormValues) => {
    if (!user) return;

    try {
      const formData: AssetFormData = {
        ticker: data.ticker,
        name: data.name,
        type: data.type,
        assetClass: data.assetClass,
        subCategory: data.subCategory || undefined,
        exchange: data.exchange || undefined,
        currency: data.currency,
        quantity: data.quantity,
        averageCost: data.averageCost || undefined,
        currentPrice: data.currentPrice,
      };

      if (asset) {
        await updateAsset(asset.id, formData);
        toast.success('Asset aggiornato con successo');
      } else {
        await createAsset(user.uid, formData);
        toast.success('Asset creato con successo');
      }

      onClose();
    } catch (error) {
      console.error('Error saving asset:', error);
      toast.error('Errore nel salvataggio dell\'asset');
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
            <div className="space-y-2">
              <Label htmlFor="subCategory">Sotto-categoria</Label>
              <Select
                value={watch('subCategory')}
                onValueChange={(value) => setValue('subCategory', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona sotto-categoria" />
                </SelectTrigger>
                <SelectContent>
                  {subCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="averageCost">Costo Medio</Label>
              <Input
                id="averageCost"
                type="number"
                step="0.01"
                {...register('averageCost', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentPrice">Prezzo Corrente *</Label>
              <Input
                id="currentPrice"
                type="number"
                step="0.01"
                {...register('currentPrice', { valueAsNumber: true })}
              />
              {errors.currentPrice && (
                <p className="text-sm text-red-500">
                  {errors.currentPrice.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvataggio...' : asset ? 'Aggiorna' : 'Crea'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
