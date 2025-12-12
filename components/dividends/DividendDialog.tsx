'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend, DividendFormData, DividendType } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { getAllAssets } from '@/lib/services/assetService';
import { Timestamp } from 'firebase/firestore';
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
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils/formatters';

const dividendSchema = z.object({
  assetId: z.string().min(1, 'Asset è obbligatorio'),
  grossAmountPerShare: z.number().positive('L\'importo lordo deve essere positivo'),
  withholdingTax: z.number().min(0, 'La ritenuta non può essere negativa'),
  sharesHeld: z.number().positive('Il numero di azioni deve essere positivo'),
  exDate: z.date(),
  paymentDate: z.date(),
  dividendType: z.enum(['ordinary', 'extraordinary', 'interim', 'final']),
  currency: z.string().min(1, 'Valuta è obbligatoria'),
  notes: z.string().optional(),
  sourceUrl: z.string().url('Inserisci un URL valido').optional().or(z.literal('')),
}).refine((data) => data.paymentDate >= data.exDate, {
  message: 'La data di pagamento deve essere successiva o uguale alla data ex-dividendo',
  path: ['paymentDate'],
});

type DividendFormValues = z.infer<typeof dividendSchema>;

interface DividendDialogProps {
  open: boolean;
  onClose: () => void;
  dividend?: Dividend | null;
  onSuccess?: () => void;
}

const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
};

export function DividendDialog({ open, onClose, dividend, onSuccess }: DividendDialogProps) {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DividendFormValues>({
    resolver: zodResolver(dividendSchema),
    defaultValues: {
      currency: 'EUR',
      dividendType: 'ordinary',
      exDate: new Date(),
      paymentDate: new Date(),
      grossAmountPerShare: 0,
      withholdingTax: 0,
      sharesHeld: 0,
    },
  });

  const selectedAssetId = watch('assetId');
  const grossAmountPerShare = watch('grossAmountPerShare') || 0;
  const withholdingTax = watch('withholdingTax') || 0;
  const sharesHeld = watch('sharesHeld') || 0;

  // Calculated fields (read-only)
  const netAmountPerShare = grossAmountPerShare - withholdingTax;
  const totalGross = grossAmountPerShare * sharesHeld;
  const totalTax = withholdingTax * sharesHeld;
  const totalNet = netAmountPerShare * sharesHeld;

  // Load assets when dialog opens
  useEffect(() => {
    if (open && user) {
      loadAssets();
    }
  }, [open, user]);

  const loadAssets = async () => {
    if (!user) return;

    try {
      setLoadingAssets(true);
      const allAssets = await getAllAssets(user.uid);

      // Filter only assets that can have dividends (stocks, ETFs)
      const dividendAssets = allAssets.filter(
        (asset) => asset.assetClass === 'equity' && asset.quantity > 0
      );
      setAssets(dividendAssets);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Errore nel caricamento degli asset');
    } finally {
      setLoadingAssets(false);
    }
  };

  // Auto-calculate withholding tax when gross amount changes
  useEffect(() => {
    if (!dividend && grossAmountPerShare > 0) {
      // 26% Italian withholding tax on dividends
      const calculatedTax = grossAmountPerShare * 0.26;
      setValue('withholdingTax', parseFloat(calculatedTax.toFixed(4)));
    }
  }, [grossAmountPerShare, dividend, setValue]);

  // Pre-fill shares from selected asset
  useEffect(() => {
    if (selectedAssetId && !dividend) {
      const selectedAsset = assets.find((a) => a.id === selectedAssetId);
      if (selectedAsset) {
        setValue('sharesHeld', selectedAsset.quantity);
      }
    }
  }, [selectedAssetId, assets, dividend, setValue]);

  // Reset form when dividend changes or dialog opens
  useEffect(() => {
    if (dividend) {
      const exDate = dividend.exDate instanceof Date
        ? dividend.exDate
        : (dividend.exDate as Timestamp).toDate();
      const paymentDate = dividend.paymentDate instanceof Date
        ? dividend.paymentDate
        : (dividend.paymentDate as Timestamp).toDate();

      reset({
        assetId: dividend.assetId,
        grossAmountPerShare: dividend.dividendPerShare,
        withholdingTax: dividend.taxAmount / dividend.quantity,
        sharesHeld: dividend.quantity,
        exDate,
        paymentDate,
        dividendType: dividend.dividendType,
        currency: dividend.currency,
        notes: dividend.notes || '',
        sourceUrl: '',
      });
    } else {
      reset({
        assetId: '',
        currency: 'EUR',
        dividendType: 'ordinary',
        exDate: new Date(),
        paymentDate: new Date(),
        grossAmountPerShare: 0,
        withholdingTax: 0,
        sharesHeld: 0,
        notes: '',
        sourceUrl: '',
      });
    }
  }, [dividend, reset, open]);

  const onSubmit = async (data: DividendFormValues) => {
    if (!user) {
      toast.error('Devi essere autenticato');
      return;
    }

    // Get selected asset details
    const selectedAsset = assets.find((a) => a.id === data.assetId);
    if (!selectedAsset) {
      toast.error('Asset non trovato');
      return;
    }

    try {
      const dividendData: DividendFormData = {
        assetId: data.assetId,
        exDate: data.exDate,
        paymentDate: data.paymentDate,
        dividendPerShare: data.grossAmountPerShare,
        quantity: data.sharesHeld,
        grossAmount: totalGross,
        taxAmount: totalTax,
        netAmount: totalNet,
        currency: data.currency,
        dividendType: data.dividendType,
        notes: data.notes,
        isAutoGenerated: false,
      };

      const endpoint = dividend
        ? `/api/dividends/${dividend.id}`
        : '/api/dividends';

      const method = dividend ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dividendData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore nel salvataggio del dividendo');
      }

      toast.success(
        dividend
          ? 'Dividendo aggiornato con successo'
          : 'Dividendo creato con successo'
      );

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving dividend:', error);
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio del dividendo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dividend ? 'Modifica Dividendo' : 'Nuovo Dividendo'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Asset Selector */}
          <div className="space-y-2">
            <Label htmlFor="assetId">Asset *</Label>
            {loadingAssets ? (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            ) : (
              <Controller
                control={control}
                name="assetId"
                render={({ field }) => (
                  <SearchableCombobox
                    id="assetId"
                    options={assets.map((asset) => ({
                      value: asset.id,
                      label: `${asset.ticker || asset.name} - ${asset.name}`,
                    }))}
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder="Seleziona asset"
                    searchPlaceholder="Cerca asset..."
                    emptyMessage="Nessun asset con dividendi disponibile"
                    showBadge={false}
                  />
                )}
              />
            )}
            {errors.assetId && (
              <p className="text-sm text-red-500">{errors.assetId.message}</p>
            )}
          </div>

          {/* Gross Amount Per Share and Withholding Tax */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grossAmountPerShare">Importo Lordo per Azione (€) *</Label>
              <Input
                id="grossAmountPerShare"
                type="number"
                step="0.0001"
                min="0"
                {...register('grossAmountPerShare', { valueAsNumber: true })}
                className={errors.grossAmountPerShare ? 'border-red-500' : ''}
              />
              {errors.grossAmountPerShare && (
                <p className="text-sm text-red-500">{errors.grossAmountPerShare.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="withholdingTax">
                Ritenuta per Azione (€) *
                <span className="text-xs text-muted-foreground ml-2">(auto-calcolata 26%)</span>
              </Label>
              <Input
                id="withholdingTax"
                type="number"
                step="0.0001"
                min="0"
                {...register('withholdingTax', { valueAsNumber: true })}
                className={errors.withholdingTax ? 'border-red-500' : ''}
              />
              {errors.withholdingTax && (
                <p className="text-sm text-red-500">{errors.withholdingTax.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Modificabile per dividendi esteri o regimi speciali
              </p>
            </div>
          </div>

          {/* Shares Held */}
          <div className="space-y-2">
            <Label htmlFor="sharesHeld">Azioni Possedute *</Label>
            <Input
              id="sharesHeld"
              type="number"
              step="0.0001"
              min="0"
              {...register('sharesHeld', { valueAsNumber: true })}
              className={errors.sharesHeld ? 'border-red-500' : ''}
            />
            {errors.sharesHeld && (
              <p className="text-sm text-red-500">{errors.sharesHeld.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Pre-compilato dalla quantità dell'asset
            </p>
          </div>

          {/* Calculated Fields (Read-only Display) */}
          <div className="rounded-md border p-4 bg-muted/50 space-y-3">
            <h3 className="font-semibold text-sm">Calcoli Automatici</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Importo Netto per Azione:</span>
                <p className="font-medium">{formatCurrency(netAmountPerShare)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Totale Lordo:</span>
                <p className="font-medium">{formatCurrency(totalGross)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Totale Ritenute:</span>
                <p className="font-medium text-red-600">{formatCurrency(totalTax)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Totale Netto:</span>
                <p className="font-medium text-green-600">{formatCurrency(totalNet)}</p>
              </div>
            </div>
          </div>

          {/* Ex-Date and Payment Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exDate">Data Ex-Dividendo *</Label>
              <Controller
                control={control}
                name="exDate"
                render={({ field }) => (
                  <Input
                    id="exDate"
                    type="date"
                    value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      const dateString = e.target.value;
                      if (dateString) {
                        const date = new Date(dateString + 'T00:00:00');
                        if (!isNaN(date.getTime())) {
                          field.onChange(date);
                        }
                      }
                    }}
                    className={errors.exDate ? 'border-red-500' : ''}
                  />
                )}
              />
              {errors.exDate && (
                <p className="text-sm text-red-500">{errors.exDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentDate">Data di Pagamento *</Label>
              <Controller
                control={control}
                name="paymentDate"
                render={({ field }) => (
                  <Input
                    id="paymentDate"
                    type="date"
                    value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      const dateString = e.target.value;
                      if (dateString) {
                        const date = new Date(dateString + 'T00:00:00');
                        if (!isNaN(date.getTime())) {
                          field.onChange(date);
                        }
                      }
                    }}
                    className={errors.paymentDate ? 'border-red-500' : ''}
                  />
                )}
              />
              {errors.paymentDate && (
                <p className="text-sm text-red-500">{errors.paymentDate.message}</p>
              )}
            </div>
          </div>

          {/* Dividend Type and Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dividendType">Tipo di Dividendo *</Label>
              <Controller
                control={control}
                name="dividendType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="dividendType">
                      <SelectValue placeholder="Seleziona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(dividendTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.dividendType && (
                <p className="text-sm text-red-500">{errors.dividendType.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Valuta *</Label>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="currency">
                      <SelectValue placeholder="Seleziona valuta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="CHF">CHF (Fr)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.currency && (
                <p className="text-sm text-red-500">{errors.currency.message}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Note (opzionale)</Label>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="es. Dividendo Q4 2024"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Source URL */}
          <div className="space-y-2">
            <Label htmlFor="sourceUrl">Link Fonte (opzionale)</Label>
            <Input
              id="sourceUrl"
              type="url"
              {...register('sourceUrl')}
              placeholder="es. https://www.borsaitaliana.it/..."
              className={errors.sourceUrl ? 'border-red-500' : ''}
            />
            {errors.sourceUrl && (
              <p className="text-sm text-red-500">{errors.sourceUrl.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Link alla fonte del dividendo per riferimento futuro
            </p>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Salvataggio...'
                : dividend
                ? 'Salva Modifiche'
                : 'Crea Dividendo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
