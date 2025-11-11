'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Asset, AssetFormData, AssetType, AssetClass, AssetAllocationTarget, AssetComposition } from '@/types/assets';
import { createAsset, updateAsset } from '@/lib/services/assetService';
import { getTargets, addSubCategory } from '@/lib/services/assetAllocationService';
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
import { Plus, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
  manualPrice: z.number().positive('Il prezzo deve essere positivo').optional().or(z.nan()),
  isLiquid: z.boolean().optional(),
  autoUpdatePrice: z.boolean().optional(),
  isComposite: z.boolean().optional(),
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
  const [showNewSubCategory, setShowNewSubCategory] = useState(false);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [isAddingSubCategory, setIsAddingSubCategory] = useState(false);
  const [composition, setComposition] = useState<AssetComposition[]>([]);
  const [isComposite, setIsComposite] = useState(false);
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
      isLiquid: true,
      autoUpdatePrice: true,
      isComposite: false,
    },
  });

  const selectedType = watch('type');
  const selectedAssetClass = watch('assetClass');
  const selectedSubCategory = watch('subCategory');
  const watchIsLiquid = watch('isLiquid');
  const watchAutoUpdatePrice = watch('autoUpdatePrice');
  const watchIsComposite = watch('isComposite');

  // Determina il default per isLiquid e autoUpdatePrice basato sull'asset class
  useEffect(() => {
    if (selectedAssetClass) {
      // Default intelligente per isLiquid
      const defaultIsLiquid =
        selectedAssetClass !== 'realestate' &&
        selectedSubCategory !== 'Private Equity';

      // Default intelligente per autoUpdatePrice
      const defaultAutoUpdatePrice = shouldUpdatePrice(selectedType, selectedSubCategory);

      // Imposta solo se non è già stato impostato dall'utente
      if (watchIsLiquid === undefined) {
        setValue('isLiquid', defaultIsLiquid);
      }
      if (watchAutoUpdatePrice === undefined) {
        setValue('autoUpdatePrice', defaultAutoUpdatePrice);
      }
    }
  }, [selectedAssetClass, selectedSubCategory, selectedType, watchIsLiquid, watchAutoUpdatePrice, setValue]);

  // Gestisci il toggle della composizione
  useEffect(() => {
    setIsComposite(watchIsComposite || false);
    if (!watchIsComposite) {
      setComposition([]);
    }
  }, [watchIsComposite]);

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
      // Determine default for isLiquid if not set
      const defaultIsLiquid = asset.isLiquid !== undefined
        ? asset.isLiquid
        : (asset.assetClass !== 'realestate' && asset.subCategory !== 'Private Equity');

      reset({
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        assetClass: asset.assetClass,
        subCategory: asset.subCategory || '',
        exchange: asset.exchange || '',
        currency: asset.currency,
        quantity: asset.quantity,
        manualPrice: asset.currentPrice > 0 ? asset.currentPrice : undefined,
        isLiquid: defaultIsLiquid,
        autoUpdatePrice: asset.autoUpdatePrice !== undefined ? asset.autoUpdatePrice : shouldUpdatePrice(asset.type, asset.subCategory),
        isComposite: !!(asset.composition && asset.composition.length > 0),
      });

      if (asset.composition && asset.composition.length > 0) {
        setComposition(asset.composition);
        setIsComposite(true);
      } else {
        setComposition([]);
        setIsComposite(false);
      }
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
        manualPrice: undefined,
        isLiquid: true,
        autoUpdatePrice: true,
        isComposite: false,
      });
      setComposition([]);
      setIsComposite(false);
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

  const handleAddSubCategory = async () => {
    if (!user || !selectedAssetClass || !newSubCategoryName.trim()) {
      toast.error('Inserisci un nome per la sottocategoria');
      return;
    }

    try {
      setIsAddingSubCategory(true);
      await addSubCategory(user.uid, selectedAssetClass, newSubCategoryName.trim());
      toast.success(`Sottocategoria "${newSubCategoryName}" creata con successo!`);

      // Ricarica i targets per ottenere la nuova sottocategoria
      await loadAllocationTargets();

      // Seleziona automaticamente la nuova sottocategoria
      setValue('subCategory', newSubCategoryName.trim());

      // Reset
      setNewSubCategoryName('');
      setShowNewSubCategory(false);
    } catch (error: any) {
      console.error('Error adding subcategory:', error);
      toast.error(error.message || 'Errore nella creazione della sottocategoria');
    } finally {
      setIsAddingSubCategory(false);
    }
  };

  const addCompositionEntry = () => {
    setComposition([...composition, { assetClass: 'equity', percentage: 0 }]);
  };

  const removeCompositionEntry = (index: number) => {
    setComposition(composition.filter((_, i) => i !== index));
  };

  const updateCompositionEntry = (index: number, field: 'assetClass' | 'percentage', value: any) => {
    const updated = [...composition];
    updated[index] = { ...updated[index], [field]: value };
    setComposition(updated);
  };

  const validateComposition = (): boolean => {
    if (!isComposite || composition.length === 0) return true;

    const totalPercentage = composition.reduce((sum, comp) => sum + comp.percentage, 0);

    if (Math.abs(totalPercentage - 100) > 0.01) {
      toast.error(`La somma delle percentuali deve essere 100% (attuale: ${totalPercentage.toFixed(2)}%)`);
      return false;
    }

    return true;
  };

  const onSubmit = async (data: AssetFormValues) => {
    if (!user) return;

    // Validate that sub-category is provided if enabled for the asset class
    if (isSubCategoryEnabled() && !data.subCategory) {
      toast.error('La sotto-categoria è obbligatoria per questa classe di asset');
      return;
    }

    // Validate composition if enabled
    if (isComposite && !validateComposition()) {
      return;
    }

    try {
      setFetchingPrice(true);

      // Determine current price
      let currentPrice = 1; // Default for cash and fixed-price assets

      // Check if manual price is provided
      if (data.manualPrice && !isNaN(data.manualPrice) && data.manualPrice > 0) {
        currentPrice = data.manualPrice;
        toast.success(`Prezzo manuale impostato: ${currentPrice.toFixed(2)} ${data.currency}`);
      }
      // Check if we need to fetch price from Yahoo Finance
      else if (shouldUpdatePrice(data.type, data.subCategory)) {
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
              `Impossibile recuperare il prezzo per ${data.ticker}. Puoi inserire manualmente il prezzo nel campo apposito.`
            );
            // Use a placeholder price of 0 to indicate it needs manual update
            currentPrice = 0;
          }
        } catch (error) {
          console.error('Error fetching quote:', error);
          toast.error(
            `Errore nel recupero del prezzo per ${data.ticker}. Puoi inserire manualmente il prezzo nel campo apposito.`
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
        isLiquid: data.isLiquid,
        autoUpdatePrice: data.autoUpdatePrice,
        composition: isComposite && composition.length > 0 ? composition : undefined,
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="subCategory">
                    Sotto-categoria
                    {isSubCategoryEnabled() && availableSubCategories().length > 0 && ' *'}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewSubCategory(!showNewSubCategory)}
                    className="h-7 px-2"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {showNewSubCategory ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nuova sottocategoria"
                      value={newSubCategoryName}
                      onChange={(e) => setNewSubCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSubCategory();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddSubCategory}
                      disabled={isAddingSubCategory || !newSubCategoryName.trim()}
                    >
                      {isAddingSubCategory ? 'Creazione...' : 'Crea'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowNewSubCategory(false);
                        setNewSubCategoryName('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
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
                )}
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

          {/* Liquidità */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isLiquid">Asset Liquido</Label>
                <p className="text-xs text-gray-500">
                  Indica se questo asset può essere convertito rapidamente in contanti
                </p>
              </div>
              <Switch
                id="isLiquid"
                checked={watch('isLiquid')}
                onCheckedChange={(checked) => setValue('isLiquid', checked)}
              />
            </div>
          </div>

          {/* Aggiornamento Automatico Prezzo */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="autoUpdatePrice">Aggiornamento Automatico Prezzo</Label>
                <p className="text-xs text-gray-500">
                  Indica se il prezzo deve essere aggiornato automaticamente da Yahoo Finance
                </p>
              </div>
              <Switch
                id="autoUpdatePrice"
                checked={watch('autoUpdatePrice')}
                onCheckedChange={(checked) => setValue('autoUpdatePrice', checked)}
              />
            </div>
          </div>

          {/* Composizione */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isComposite">Asset Composto</Label>
                <p className="text-xs text-gray-500">
                  Es. fondo pensione con mix di azioni e obbligazioni
                </p>
              </div>
              <Switch
                id="isComposite"
                checked={watch('isComposite')}
                onCheckedChange={(checked) => setValue('isComposite', checked)}
              />
            </div>

            {isComposite && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Composizione Percentuale</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCompositionEntry}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi
                  </Button>
                </div>

                {composition.map((comp, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Select
                        value={comp.assetClass}
                        onValueChange={(value) =>
                          updateCompositionEntry(index, 'assetClass', value as AssetClass)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Classe Asset" />
                        </SelectTrigger>
                        <SelectContent>
                          {assetClasses.map((ac) => (
                            <SelectItem key={ac.value} value={ac.value}>
                              {ac.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="%"
                        value={comp.percentage || ''}
                        onChange={(e) =>
                          updateCompositionEntry(
                            index,
                            'percentage',
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCompositionEntry(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {composition.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Totale: {composition.reduce((sum, c) => sum + c.percentage, 0).toFixed(2)}% (deve essere 100%)
                  </p>
                )}
              </div>
            )}
          </div>

          {shouldUpdatePrice(selectedType, selectedSubCategory) && (
            <div className="space-y-2">
              <Label htmlFor="manualPrice">Prezzo Manuale (opzionale)</Label>
              <Input
                id="manualPrice"
                type="number"
                step="0.01"
                {...register('manualPrice', { valueAsNumber: true })}
                placeholder="Lascia vuoto per recupero automatico da Yahoo Finance"
              />
              {errors.manualPrice && (
                <p className="text-sm text-red-500">{errors.manualPrice.message}</p>
              )}
              <p className="text-xs text-gray-500">
                Se inserisci un prezzo manuale, questo verrà utilizzato al posto del recupero automatico da Yahoo Finance.
              </p>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong>
              {selectedType === 'cash' && ' Per asset di tipo liquidità, il prezzo sarà impostato a 1.'}
              {selectedType === 'realestate' && ' Per immobili, il prezzo deve essere aggiornato manualmente.'}
              {selectedSubCategory === 'Private Equity' && ' Per Private Equity, il prezzo deve essere aggiornato manualmente.'}
              {shouldUpdatePrice(selectedType, selectedSubCategory) && ' Puoi inserire un prezzo manuale nel campo apposito, oppure il prezzo verrà recuperato automaticamente da Yahoo Finance. In caso di errore nel recupero automatico, potrai sempre impostare il prezzo manualmente.'}
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
