/**
 * Asset Dialog - Create and Edit Assets
 *
 * Complex form component for managing portfolio assets with React Hook Form and Zod validation.
 *
 * Key Features:
 * - Dynamic field visibility based on asset type and class
 * - Intelligent defaults for isLiquid and autoUpdatePrice based on asset characteristics
 * - Price fetching: manual entry, Yahoo Finance API, or keep existing price
 * - Composition management for multi-asset portfolios (e.g., funds with multiple holdings)
 * - Inline subcategory creation without leaving the form
 * - Outstanding debt tracking for real estate assets
 * - Cost basis tracking for capital gains calculations
 * - Total Expense Ratio (TER) for ETFs and funds
 *
 * Form State Management:
 * - 10 useState hooks for UI state (composition, toggles, loading states)
 * - React Hook Form for form data and validation
 * - Zod schema for type-safe validation with custom error messages
 *
 * Price Resolution Strategy:
 * 1. Manual price provided → use it directly
 * 2. Ticker exists + auto-update enabled → fetch from Yahoo Finance API
 * 3. Editing existing asset → keep current price
 * 4. No price source → validation error
 *
 * Teacher Note - ISIN Format:
 * ISIN (International Securities Identification Number) format: XX000000000C
 * - XX: 2-letter country code (e.g., IT for Italy, US for United States)
 * - 000000000: 9 alphanumeric characters (security identifier)
 * - C: 1 check digit
 * Example: IT0003128367 (Italian government bond)
 */
'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Asset, AssetFormData, AssetType, AssetClass, AssetAllocationTarget, AssetComposition, CouponFrequency, BondDetails, CouponRateTier } from '@/types/assets';
import { createAsset, updateAsset } from '@/lib/services/assetService';
import { getNextCouponDate, calculateCouponPerShare, getApplicableCouponRate } from '@/lib/utils/couponUtils';
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
 * Determines if an asset type should fetch automatic price updates
 *
 * Asset types with fixed or manual valuations should not auto-update:
 * - Real estate: Uses property appraisals, not market prices
 * - Private equity: Valuations done periodically by fund managers
 * - Cash: Always has price = 1 (no market fluctuation)
 *
 * All other asset types (stocks, ETFs, bonds, crypto, commodities) fetch prices
 * from Yahoo Finance API for real-time portfolio valuation.
 *
 * @param assetType - The asset type (stock, etf, bond, crypto, commodity, cash, realestate)
 * @param subCategory - Optional subcategory (e.g., "Private Equity" within equity class)
 * @returns true if asset should automatically update prices from Yahoo Finance
 */
function shouldUpdatePrice(assetType: string, subCategory?: string): boolean {
  // Real estate and private equity have fixed valuations (no market price)
  if (assetType === 'realestate' || subCategory === 'Private Equity') {
    return false;
  }

  // Cash always has price = 1 (no updates needed)
  if (assetType === 'cash') {
    return false;
  }

  return true;
}

// Zod validation schema for asset form
// Note: .or(z.nan()) allows undefined values for optional numeric fields
const assetSchema = z.object({
  ticker: z.string().min(1, 'Ticker is required'),
  name: z.string().min(1, 'Name is required'),
  isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'Invalid ISIN format (example: IT0003128367)').optional().or(z.literal('')),
  type: z.enum(['stock', 'etf', 'bond', 'crypto', 'commodity', 'cash', 'realestate']),
  assetClass: z.enum(['equity', 'bonds', 'crypto', 'realestate', 'cash', 'commodity']),
  subCategory: z.string().optional(),
  currency: z.string().min(1, 'Currency is required'),
  quantity: z.number().min(0, 'La quantità non può essere negativa'),
  manualPrice: z.number().positive('Price must be positive').optional().or(z.nan()),
  averageCost: z.number().positive('Average cost must be positive').optional().or(z.nan()),
  taxRate: z.number().min(0, 'Tax rate must be at least 0').max(100, 'Tax rate must be at most 100').optional().or(z.nan()),
  totalExpenseRatio: z.number().min(0, 'TER must be at least 0').max(100, 'TER must be at most 100').optional().or(z.nan()),
  stampDutyExempt: z.boolean().optional(),
  isLiquid: z.boolean().optional(),
  autoUpdatePrice: z.boolean().optional(),
  isComposite: z.boolean().optional(),
  outstandingDebt: z.number().nonnegative('Debt cannot be negative').optional().or(z.nan()),
  isPrimaryResidence: z.boolean().optional(),
  // Bond coupon details (optional, only shown for type=bond + assetClass=bonds)
  bondCouponRate: z.number().min(0).max(100).optional().or(z.nan()),
  bondCouponFrequency: z.enum(['monthly', 'quarterly', 'semiannual', 'annual']).optional(),
  bondIssueDate: z.string().optional(),
  bondMaturityDate: z.string().optional(),
  bondNominalValue: z.number().positive('Il valore nominale deve essere positivo').optional().or(z.nan()),
  // Step-up coupon rate tiers (optional, up to 5)
  bondCouponRateSchedule: z.array(z.object({
    yearFrom: z.number().int().min(1, 'Anno minimo 1'),
    yearTo: z.number().int().min(1, 'Anno minimo 1'),
    rate: z.number().min(0).max(100),
  })).optional(),
  // Final premium at maturity (optional, e.g. BTP Valore 0.8%)
  bondFinalPremiumRate: z.number().min(0).max(100).optional().or(z.nan()),
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
  const [hasOutstandingDebt, setHasOutstandingDebt] = useState(false);
  const [showCostBasis, setShowCostBasis] = useState(false);
  const [showTER, setShowTER] = useState(false);
  const [showBondDetails, setShowBondDetails] = useState(false);
  const [showStepUp, setShowStepUp] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      currency: 'EUR',
      quantity: 0,
      isLiquid: true,
      autoUpdatePrice: true,
      isComposite: false,
      outstandingDebt: undefined,
      isPrimaryResidence: false,
    },
  });

  const { fields: tierFields, append: appendTier, remove: removeTier, replace: replaceTiers } = useFieldArray({
    control,
    name: 'bondCouponRateSchedule',
  });

  const selectedType = watch('type');
  const selectedAssetClass = watch('assetClass');
  const selectedSubCategory = watch('subCategory');
  const watchIsLiquid = watch('isLiquid');
  // True when the bond qualifies for % of par ↔ EUR conversion:
  // must have ISIN (triggers Borsa Italiana pricing) AND nominalValue > 1.
  // Used to conditionally show % labels and apply the conversion on save.
  const isBondPctMode =
    selectedType === 'bond' &&
    selectedAssetClass === 'bonds' &&
    !!(watch('isin') ?? '').trim() &&
    (watch('bondNominalValue') ?? 0) > 1;
  const watchAutoUpdatePrice = watch('autoUpdatePrice');

  // Determine price source based on asset type
  const priceSource = selectedType === 'bond' && selectedAssetClass === 'bonds'
    ? 'Borsa Italiana'
    : 'Yahoo Finance';
  const watchIsComposite = watch('isComposite');

  // Set intelligent defaults for isLiquid and autoUpdatePrice based on asset class
  // Why intelligent defaults? Reduces user errors and form friction.
  // - Equity/bonds → liquid, auto-update enabled (traded on markets)
  // - Real estate → not liquid, manual pricing (property appraisals)
  // - Cash → liquid, no updates (price always 1)
  useEffect(() => {
    if (selectedAssetClass) {
      // Default for isLiquid: most assets are liquid except real estate and private equity
      const defaultIsLiquid =
        selectedAssetClass !== 'realestate' &&
        selectedSubCategory !== 'Private Equity';

      // Default for autoUpdatePrice: use shouldUpdatePrice logic
      const defaultAutoUpdatePrice = shouldUpdatePrice(selectedType, selectedSubCategory);

      // Only set if user hasn't explicitly changed the value
      // This preserves user intent when they toggle these fields manually
      if (watchIsLiquid === undefined) {
        setValue('isLiquid', defaultIsLiquid);
      }
      if (watchAutoUpdatePrice === undefined) {
        setValue('autoUpdatePrice', defaultAutoUpdatePrice);
      }
    }
  }, [selectedAssetClass, selectedSubCategory, selectedType, watchIsLiquid, watchAutoUpdatePrice, setValue]);

  // Auto-activate bond detail toggles for new bond assets
  // When type=bond and assetClass=bonds, automatically open the bond details and cost basis sections
  // so the user sees the available fields without needing to manually toggle them.
  // Only applies to new assets (!asset) to avoid overriding the user's existing saved state.
  useEffect(() => {
    if (!asset && selectedType === 'bond' && selectedAssetClass === 'bonds') {
      setShowBondDetails(true);
      setShowCostBasis(true);
    }
  }, [selectedType, selectedAssetClass, asset]);

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
        currency: asset.currency,
        quantity: asset.quantity,
        // For bonds with ISIN and nominalValue > 1, both currentPrice and averageCost are
        // stored in EUR but both form fields use the Borsa Italiana convention (price
        // per 100€ of nominal, same as what the user sees on BI). Back-convert so the
        // round-trip is consistent: Firestore (EUR) → form (BI price) → onSubmit → Firestore (EUR).
        // Example: currentPrice=1042€, nominalValue=1000 → show 104.2 in form.
        //          averageCost=1000€, nominalValue=1000 → show 100 in form.
        ...((): { manualPrice: number | undefined; averageCost: number | undefined } => {
          const bondNominal = asset.bondDetails?.nominalValue;
          const isBondPct =
            asset.type === 'bond' &&
            asset.assetClass === 'bonds' &&
            !!asset.isin &&
            !!bondNominal &&
            bondNominal > 1;
          const toBI = (eurVal: number) => eurVal / (bondNominal! / 100);
          return {
            manualPrice: asset.currentPrice > 0
              ? (isBondPct ? toBI(asset.currentPrice) : asset.currentPrice)
              : undefined,
            averageCost: asset.averageCost
              ? (isBondPct ? toBI(asset.averageCost) : asset.averageCost)
              : undefined,
          };
        })(),
        taxRate: asset.taxRate || undefined,
        totalExpenseRatio: asset.totalExpenseRatio || undefined,
        stampDutyExempt: asset.stampDutyExempt || false,
        isLiquid: defaultIsLiquid,
        autoUpdatePrice: asset.autoUpdatePrice !== undefined ? asset.autoUpdatePrice : shouldUpdatePrice(asset.type, asset.subCategory),
        isComposite: !!(asset.composition && asset.composition.length > 0),
        outstandingDebt: asset.outstandingDebt || undefined,
        isPrimaryResidence: asset.isPrimaryResidence || false,
        isin: asset.isin || undefined,
      });

      if (asset.composition && asset.composition.length > 0) {
        setComposition(asset.composition);
        setIsComposite(true);
      } else {
        setComposition([]);
        setIsComposite(false);
      }

      // Set hasOutstandingDebt state based on asset data
      setHasOutstandingDebt(!!(asset.outstandingDebt && asset.outstandingDebt > 0));

      // Set showCostBasis state based on asset data
      setShowCostBasis(!!((asset.averageCost && asset.averageCost > 0) || (asset.taxRate && asset.taxRate > 0)));

      // Set showTER state based on asset data
      setShowTER(!!(asset.totalExpenseRatio && asset.totalExpenseRatio > 0));

      // Set bond details state and pre-fill form fields
      setShowBondDetails(!!asset.bondDetails);
      if (asset.bondDetails) {
        const bd = asset.bondDetails;
        // Convert Timestamp or Date to ISO date string for <input type="date">
        const toDateStr = (d: Date | any): string => {
          const date = d instanceof Date ? d : d.toDate();
          return date.toISOString().split('T')[0];
        };
        setValue('bondCouponRate', bd.couponRate);
        setValue('bondCouponFrequency', bd.couponFrequency);
        setValue('bondIssueDate', toDateStr(bd.issueDate));
        setValue('bondMaturityDate', toDateStr(bd.maturityDate));
        setValue('bondNominalValue', bd.nominalValue);
        setValue('bondFinalPremiumRate', bd.finalPremiumRate);
        if (bd.couponRateSchedule && bd.couponRateSchedule.length > 0) {
          setShowStepUp(true);
          replaceTiers(bd.couponRateSchedule);
        } else {
          setShowStepUp(false);
          replaceTiers([]);
        }
      }
    } else {
      reset({
        ticker: '',
        name: '',
        type: 'etf',
        assetClass: 'equity',
        subCategory: '',
        currency: 'EUR',
        quantity: 0,
        manualPrice: undefined,
        averageCost: undefined,
        taxRate: undefined,
        totalExpenseRatio: undefined,
        stampDutyExempt: false,
        isLiquid: true,
        autoUpdatePrice: true,
        isComposite: false,
        outstandingDebt: undefined,
        isPrimaryResidence: false,
      });
      setComposition([]);
      setIsComposite(false);
      setHasOutstandingDebt(false);
      setShowCostBasis(false);
      setShowTER(false);
      setShowBondDetails(false);
      setShowStepUp(false);
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

  const updateCompositionEntry = (index: number, field: 'assetClass' | 'percentage' | 'subCategory', value: any) => {
    const updated = [...composition];
    updated[index] = { ...updated[index], [field]: value };
    setComposition(updated);
  };

  // Get available sub-categories for a specific asset class in composition
  const getAvailableSubCategoriesForAssetClass = (assetClass: AssetClass): string[] => {
    if (!allocationTargets) return [];

    const assetClassConfig = allocationTargets[assetClass];
    if (!assetClassConfig?.subCategoryConfig?.enabled) return [];

    return assetClassConfig.subCategoryConfig.categories || [];
  };

  /**
   * Validate that composition percentages sum to 100%
   *
   * Teacher Note - Floating Point Tolerance:
   * We use a tolerance of 0.01% instead of exact equality to account for
   * floating-point rounding errors in JavaScript.
   *
   * Examples:
   * - 33.33% + 33.33% + 33.34% = 100.00% (valid)
   * - 33.33% + 33.33% + 33.33% = 99.99% (valid with tolerance)
   * - 30% + 30% + 30% = 90% (invalid - missing 10%)
   *
   * @returns true if composition is valid or not enabled
   */
  const validateComposition = (): boolean => {
    if (!isComposite || composition.length === 0) return true;

    const totalPercentage = composition.reduce((sum, comp) => sum + comp.percentage, 0);

    // Check if total is within 0.01% of 100% to account for floating-point errors
    if (Math.abs(totalPercentage - 100) > 0.01) {
      toast.error(`La somma delle percentuali deve essere 100% (attuale: ${totalPercentage.toFixed(2)}%)`);
      return false;
    }

    return true;
  };

  /**
   * Handle form submission - create or update asset
   *
   * Price Resolution Strategy (3 paths):
   * 1. Manual price provided → use it directly (user knows best)
   * 2. shouldUpdatePrice=true → fetch from Yahoo Finance API
   * 3. shouldUpdatePrice=false → use default price of 1 (cash, real estate)
   * 4. If all fail → set price to 0 as indicator for manual update
   */
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

      // Step 1: Determine current price using resolution strategy
      let currentPrice = 1; // Default for cash and fixed-price assets

      // Determine bond type once — used in both Path 1 (manual) and Path 2 (auto-fetch)
      // to apply the % of par → EUR conversion consistently.
      const isBondWithIsin =
        data.type === 'bond' &&
        data.assetClass === 'bonds' &&
        data.isin &&
        data.isin.trim().length > 0;

      // Path 1: Check if manual price is provided (highest priority)
      if (data.manualPrice && !isNaN(data.manualPrice) && data.manualPrice > 0) {
        currentPrice = data.manualPrice;
        // Bond prices are quoted as % of par (e.g. 104.2 = 104.2%), same convention
        // as Borsa Italiana auto-fetch. Mirror the Path 2 conversion so manual entry
        // is consistent: rawPercent × (nominalValue / 100) = EUR per unit.
        if (isBondWithIsin && data.bondNominalValue && !isNaN(data.bondNominalValue) && data.bondNominalValue > 1) {
          currentPrice = data.manualPrice * (data.bondNominalValue / 100);
        }
        toast.success(`Prezzo manuale impostato: ${currentPrice.toFixed(2)} ${data.currency}`);
      }
      // Path 2: Check if we need to fetch price from market data sources
      // Bonds with ISIN: Borsa Italiana
      // Other assets (stocks, ETFs, crypto, commodities): Yahoo Finance
      else if (shouldUpdatePrice(data.type, data.subCategory)) {
        try {
          // isBondWithIsin already computed above

          let response;
          let source = 'Yahoo Finance';

          if (isBondWithIsin) {
            // Use Borsa Italiana scraper for bonds with ISIN
            response = await fetch(
              `/api/prices/bond-quote?isin=${encodeURIComponent(data.isin!.trim())}`
            );
            source = 'Borsa Italiana';
          } else {
            // Use Yahoo Finance for other assets
            response = await fetch(
              `/api/prices/quote?ticker=${encodeURIComponent(data.ticker)}`
            );
          }

          const quote = await response.json();

          if (quote.price && quote.price > 0) {
            currentPrice = quote.price;
            // Bonds from Borsa Italiana are quoted as % of par (e.g. 104.2 = 104.2%).
            // Convert to actual EUR per unit: price% × (nominalValue / 100)
            // This mirrors the same conversion in priceUpdater.ts.
            if (isBondWithIsin && data.bondNominalValue && !isNaN(data.bondNominalValue) && data.bondNominalValue > 1) {
              currentPrice = currentPrice * (data.bondNominalValue / 100);
            }
            toast.success(
              `Prezzo recuperato da ${source}: ${currentPrice.toFixed(2)} ${quote.currency}`
            );
          } else {
            toast.error(
              `Impossibile recuperare il prezzo ${isBondWithIsin ? `per ISIN ${data.isin}` : `per ${data.ticker}`}. Puoi inserire manualmente il prezzo nel campo apposito.`
            );
            // Set price to 0 as indicator that manual update is needed
            // This allows saving the asset while flagging price as missing
            currentPrice = 0;
          }
        } catch (error) {
          console.error('Error fetching quote:', error);
          toast.error(
            `Errore nel recupero del prezzo. Puoi inserire manualmente il prezzo nel campo apposito.`
          );
          currentPrice = 0;
        }
      }
      // Path 3: Use default price of 1 for assets that don't need market prices
      // (cash, real estate, private equity)

      // Build optional bond details object (only when toggle is on and required fields filled)
      let bondDetailsValue: BondDetails | undefined;
      if (
        showBondDetails &&
        data.bondCouponRate && !isNaN(data.bondCouponRate) &&
        data.bondCouponFrequency &&
        data.bondIssueDate &&
        data.bondMaturityDate
      ) {
        bondDetailsValue = {
          couponRate: data.bondCouponRate,
          couponFrequency: data.bondCouponFrequency,
          issueDate: new Date(data.bondIssueDate),
          maturityDate: new Date(data.bondMaturityDate),
          // Include nominalValue only if provided (avoids undefined in Firestore nested object)
          ...(data.bondNominalValue && !isNaN(data.bondNominalValue) ? { nominalValue: data.bondNominalValue } : {}),
          // Include step-up schedule only if active and non-empty
          ...(showStepUp && data.bondCouponRateSchedule && data.bondCouponRateSchedule.length > 0
            ? { couponRateSchedule: data.bondCouponRateSchedule as CouponRateTier[] }
            : {}),
          // Include final premium only if provided
          ...(data.bondFinalPremiumRate && !isNaN(data.bondFinalPremiumRate)
            ? { finalPremiumRate: data.bondFinalPremiumRate }
            : {}),
        };
      }

      const formData: AssetFormData = {
        ticker: data.ticker,
        name: data.name,
        isin: data.isin && data.isin.trim() !== '' ? data.isin.trim().toUpperCase() : undefined,
        type: data.type,
        assetClass: data.assetClass,
        subCategory: data.subCategory || undefined,
        currency: data.currency,
        quantity: data.quantity,
        // averageCost uses the same Borsa Italiana convention as currentPrice: the user
        // enters the BI price (per 100€ of nominal), so we apply the same % → EUR
        // conversion. Example: user enters 100 (= bought at par on BI) with nominalValue=1000
        // → stored as 1000€. User enters 95 → stored as 950€.
        averageCost: data.averageCost && !isNaN(data.averageCost) && data.averageCost > 0
          ? (isBondWithIsin && data.bondNominalValue && !isNaN(data.bondNominalValue) && data.bondNominalValue > 1
              ? data.averageCost * (data.bondNominalValue / 100)
              : data.averageCost)
          : undefined,
        taxRate: data.taxRate && !isNaN(data.taxRate) && data.taxRate >= 0 ? data.taxRate : undefined,
        totalExpenseRatio: data.totalExpenseRatio && !isNaN(data.totalExpenseRatio) && data.totalExpenseRatio >= 0 ? data.totalExpenseRatio : undefined,
        stampDutyExempt: data.stampDutyExempt || false,
        currentPrice,
        isLiquid: data.isLiquid,
        autoUpdatePrice: data.autoUpdatePrice,
        composition: isComposite && composition.length > 0 ? composition : undefined,
        outstandingDebt: data.outstandingDebt && !isNaN(data.outstandingDebt) && data.outstandingDebt > 0 ? data.outstandingDebt : undefined,
        isPrimaryResidence: data.isPrimaryResidence || false,
        bondDetails: bondDetailsValue,
      };

      let savedAssetId: string;

      if (asset) {
        // When editing, keep the existing price if we're not fetching a new one
        if (!shouldUpdatePrice(data.type, data.subCategory)) {
          formData.currentPrice = asset.currentPrice;
        }
        await updateAsset(asset.id, formData);
        savedAssetId = asset.id;
        toast.success('Asset aggiornato con successo');
      } else {
        savedAssetId = await createAsset(user.uid, formData);
        toast.success('Asset creato con successo');
      }

      // Generate next coupon dividend if bond details are configured
      if (bondDetailsValue) {
        try {
          const issueDate = bondDetailsValue.issueDate as Date;
          const maturityDate = bondDetailsValue.maturityDate as Date;
          const nominalValue = bondDetailsValue.nominalValue ?? 1;
          // Use asset tax rate if set (e.g. 12.5% for BTPs), otherwise default 26%
          const taxRate = data.taxRate && !isNaN(data.taxRate) && data.taxRate > 0 ? data.taxRate : 26;

          const nextDate = getNextCouponDate(issueDate, bondDetailsValue.couponFrequency, maturityDate);

          if (nextDate) {
            // For step-up bonds: pick the rate applicable to the payment date
            const effectiveRate = getApplicableCouponRate(
              nextDate,
              issueDate,
              bondDetailsValue.couponRate,
              bondDetailsValue.couponRateSchedule
            );
            const perShare = calculateCouponPerShare(effectiveRate, nominalValue, bondDetailsValue.couponFrequency);
            const gross = perShare * data.quantity;
            const tax = gross * (taxRate / 100);

            const couponResponse = await fetch('/api/dividends', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.uid,
                dividendData: {
                  assetId: savedAssetId,
                  exDate: nextDate,
                  paymentDate: nextDate,
                  dividendPerShare: perShare,
                  quantity: data.quantity,
                  grossAmount: gross,
                  taxAmount: tax,
                  netAmount: gross - tax,
                  currency: data.currency,
                  dividendType: 'coupon',
                  isAutoGenerated: true,
                  notes: `Cedola ${data.bondCouponFrequency} — tasso annuo ${effectiveRate}%`,
                },
              }),
            });

            if (couponResponse.ok) {
              const formattedDate = nextDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
              toast.success(`Prossima cedola programmata: ${formattedDate}`);
            }
          }

          // Generate final premium dividend if configured and maturity is in the future.
          // Cleanup of existing finalPremium entries happens server-side in POST /api/dividends.
          if (bondDetailsValue.finalPremiumRate && maturityDate > new Date()) {
            const premiumPerShare = (bondDetailsValue.finalPremiumRate / 100) * nominalValue;
            const premiumGross = premiumPerShare * data.quantity;
            const premiumTax = premiumGross * (taxRate / 100);

            await fetch('/api/dividends', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.uid,
                dividendData: {
                  assetId: savedAssetId,
                  exDate: maturityDate,
                  paymentDate: maturityDate,
                  dividendPerShare: premiumPerShare,
                  quantity: data.quantity,
                  grossAmount: premiumGross,
                  taxAmount: premiumTax,
                  netAmount: premiumGross - premiumTax,
                  currency: data.currency,
                  dividendType: 'finalPremium',
                  isAutoGenerated: true,
                  notes: `Premio finale a scadenza — ${bondDetailsValue.finalPremiumRate}%`,
                },
              }),
            });
          }
        } catch (couponError) {
          // Non-critical: asset was saved successfully, coupon generation failed
          console.error('Error generating coupon dividend:', couponError);
          toast.error('Asset salvato, ma errore nella generazione della cedola automatica');
        }
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

          {/* ISIN Field */}
          <div className="space-y-2">
            <Label htmlFor="isin">ISIN</Label>
            <Input
              id="isin"
              {...register('isin')}
              placeholder="IE00B3RBWM25"
              disabled={
                // Enable for stocks/ETFs in equity class (dividends)
                !((selectedType === 'stock' || selectedType === 'etf') && selectedAssetClass === 'equity') &&
                // Enable for bonds in bonds class (price scraping)
                !(selectedType === 'bond' && selectedAssetClass === 'bonds')
              }
            />
            {errors.isin && (
              <p className="text-sm text-red-500">{errors.isin.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Necessario per dividendi automatici (azioni/ETF) e aggiornamento prezzi obbligazioni MOT
            </p>
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
                  Indica se il prezzo deve essere aggiornato automaticamente da {priceSource}
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

                {composition.map((comp, index) => {
                  const subCategoriesForAssetClass = getAvailableSubCategoriesForAssetClass(comp.assetClass);
                  const hasSubCategories = subCategoriesForAssetClass.length > 0;

                  return (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Select
                          value={comp.assetClass}
                          onValueChange={(value) => {
                            updateCompositionEntry(index, 'assetClass', value as AssetClass);
                            // Reset subCategory when asset class changes
                            updateCompositionEntry(index, 'subCategory', undefined);
                          }}
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
                      {hasSubCategories && (
                        <div className="flex-1">
                          <Select
                            value={comp.subCategory || ''}
                            onValueChange={(value) =>
                              updateCompositionEntry(index, 'subCategory', value || undefined)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sottocategoria" />
                            </SelectTrigger>
                            <SelectContent>
                              {subCategoriesForAssetClass.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
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
                  );
                })}

                {composition.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Totale: {composition.reduce((sum, c) => sum + c.percentage, 0).toFixed(2)}% (deve essere 100%)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Debito Residuo - solo per immobili */}
          {selectedType === 'realestate' && selectedAssetClass === 'realestate' && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="hasOutstandingDebt">Debito Residuo</Label>
                  <p className="text-xs text-gray-500">
                    Es. mutuo residuo sull&apos;immobile. Il valore netto sarà: valore - debito
                  </p>
                </div>
                <Switch
                  id="hasOutstandingDebt"
                  checked={hasOutstandingDebt}
                  onCheckedChange={(checked) => {
                    setHasOutstandingDebt(checked);
                    if (!checked) {
                      setValue('outstandingDebt', undefined);
                    }
                  }}
                />
              </div>

              {hasOutstandingDebt && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="outstandingDebt">Importo Debito Residuo ({watch('currency')})</Label>
                  <Input
                    id="outstandingDebt"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('outstandingDebt', { valueAsNumber: true })}
                    placeholder="es. 150000"
                  />
                  {errors.outstandingDebt && (
                    <p className="text-sm text-red-500">{errors.outstandingDebt.message}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Il valore netto dell&apos;immobile sarà calcolato come: valore lordo - debito residuo
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Primary Residence - solo per immobili */}
          {selectedType === 'realestate' && selectedAssetClass === 'realestate' && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isPrimaryResidence">Casa di Abitazione</Label>
                  <p className="text-xs text-gray-500">
                    Marca questo immobile come casa di abitazione. Il calcolo FIRE può escludere questi immobili
                    (configurabile nelle impostazioni FIRE).
                  </p>
                </div>
                <Switch
                  id="isPrimaryResidence"
                  checked={watch('isPrimaryResidence')}
                  onCheckedChange={(checked) => setValue('isPrimaryResidence', checked)}
                />
              </div>
            </div>
          )}

          {/* Dettagli Cedole - only for bond assets in bonds class */}
          {selectedType === 'bond' && selectedAssetClass === 'bonds' && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="showBondDetails">Dettagli Cedole</Label>
                  <p className="text-xs text-gray-500">
                    Configura il piano cedolare per generare automaticamente la prossima cedola
                  </p>
                </div>
                <Switch
                  id="showBondDetails"
                  checked={showBondDetails}
                  onCheckedChange={(checked) => {
                    setShowBondDetails(checked);
                    if (!checked) {
                      setValue('bondCouponRate', undefined);
                      setValue('bondCouponFrequency', undefined);
                      setValue('bondIssueDate', undefined);
                      setValue('bondMaturityDate', undefined);
                      setValue('bondNominalValue', undefined);
                      setValue('bondCouponRateSchedule', []);
                      setValue('bondFinalPremiumRate', undefined);
                      setShowStepUp(false);
                    }
                  }}
                />
              </div>

              {showBondDetails && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bondCouponRate">Tasso Cedolare Annuo (%)</Label>
                      <Input
                        id="bondCouponRate"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        {...register('bondCouponRate', { valueAsNumber: true })}
                        placeholder="es. 4.00"
                      />
                      {errors.bondCouponRate && (
                        <p className="text-sm text-red-500">{errors.bondCouponRate.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bondCouponFrequency">Periodicità Cedole</Label>
                      <Select
                        value={watch('bondCouponFrequency') || ''}
                        onValueChange={(value) => setValue('bondCouponFrequency', value as CouponFrequency)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona periodicità" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensile (12/anno)</SelectItem>
                          <SelectItem value="quarterly">Trimestrale (4/anno)</SelectItem>
                          <SelectItem value="semiannual">Semestrale (2/anno)</SelectItem>
                          <SelectItem value="annual">Annuale (1/anno)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bondIssueDate">Data di Emissione</Label>
                      <Input
                        id="bondIssueDate"
                        type="date"
                        {...register('bondIssueDate')}
                      />
                      {errors.bondIssueDate && (
                        <p className="text-sm text-red-500">{errors.bondIssueDate.message}</p>
                      )}
                      <p className="text-xs text-gray-500">Ancora del calendario cedolare</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bondMaturityDate">Data di Rimborso</Label>
                      <Input
                        id="bondMaturityDate"
                        type="date"
                        {...register('bondMaturityDate')}
                      />
                      {errors.bondMaturityDate && (
                        <p className="text-sm text-red-500">{errors.bondMaturityDate.message}</p>
                      )}
                      <p className="text-xs text-gray-500">Nessuna cedola oltre questa data</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bondNominalValue">
                      Valore Nominale per Unità ({watch('currency')}){' '}
                      <span className="text-gray-400 font-normal">(opzionale)</span>
                    </Label>
                    <Input
                      id="bondNominalValue"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register('bondNominalValue', { valueAsNumber: true })}
                      placeholder="es. 1000"
                    />
                    {errors.bondNominalValue && (
                      <p className="text-sm text-red-500">{errors.bondNominalValue.message}</p>
                    )}
                    {/* Dynamic coupon preview based on current form values */}
                    {(() => {
                      const rate = watch('bondCouponRate');
                      const freq = watch('bondCouponFrequency');
                      const nominal = watch('bondNominalValue');
                      const qty = watch('quantity');
                      const periodsMap: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
                      const periods = freq ? periodsMap[freq] : null;
                      if (rate && !isNaN(rate) && periods && nominal && !isNaN(nominal) && nominal > 0 && qty > 0) {
                        const perShare = (rate / 100 / periods) * nominal;
                        const total = perShare * qty;
                        return (
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            → Cedola stimata: {perShare.toFixed(2)} {watch('currency')}/unità × {qty} = {total.toFixed(2)} {watch('currency')} per pagamento
                          </p>
                        );
                      }
                      return (
                        <div className="text-xs text-gray-500 space-y-1">
                          <p>Valore faccia per singola unità nella tua valuta.</p>
                          <p>• Hai 5 lotti da €1000 (qty=5) → inserisci <strong>1000</strong></p>
                          <p>• Hai qty=5000 e ogni unità vale €1 → inserisci <strong>1</strong></p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Step-Up Coupon Rate Schedule */}
                  <div className="space-y-3 rounded-md border border-dashed p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showStepUp"
                        checked={showStepUp}
                        onChange={(e) => {
                          setShowStepUp(e.target.checked);
                          if (!e.target.checked) {
                            setValue('bondCouponRateSchedule', []);
                          }
                        }}
                        className="h-4 w-4 rounded"
                      />
                      <Label htmlFor="showStepUp" className="cursor-pointer font-normal">
                        Tasso variabile (step-up)
                      </Label>
                    </div>
                    {showStepUp && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">
                          Il tasso base sopra è usato come fallback se nessuna fascia corrisponde.
                        </p>
                        {tierFields.map((field, index) => (
                          <div key={field.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                            <div className="space-y-1">
                              {index === 0 && <Label className="text-xs">Anno da</Label>}
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                placeholder="1"
                                {...register(`bondCouponRateSchedule.${index}.yearFrom`, { valueAsNumber: true })}
                              />
                            </div>
                            <div className="space-y-1">
                              {index === 0 && <Label className="text-xs">Anno a</Label>}
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                placeholder="2"
                                {...register(`bondCouponRateSchedule.${index}.yearTo`, { valueAsNumber: true })}
                              />
                            </div>
                            <div className="space-y-1">
                              {index === 0 && <Label className="text-xs">Tasso (%)</Label>}
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="2.50"
                                {...register(`bondCouponRateSchedule.${index}.rate`, { valueAsNumber: true })}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeTier(index)}
                              className={index === 0 ? 'mt-5' : ''}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => appendTier({ yearFrom: 1, yearTo: 2, rate: 0 })}
                          disabled={tierFields.length >= 5}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Aggiungi fascia {tierFields.length >= 5 && '(max 5)'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Premio Finale */}
                  <div className="space-y-2">
                    <Label htmlFor="bondFinalPremiumRate">
                      Premio Finale a Scadenza (%){' '}
                      <span className="text-gray-400 font-normal">(opzionale)</span>
                    </Label>
                    <Input
                      id="bondFinalPremiumRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      {...register('bondFinalPremiumRate', { valueAsNumber: true })}
                      placeholder="es. 0.80"
                    />
                    {errors.bondFinalPremiumRate && (
                      <p className="text-sm text-red-500">{errors.bondFinalPremiumRate.message}</p>
                    )}
                    {(() => {
                      const premRate = watch('bondFinalPremiumRate');
                      const nominal = watch('bondNominalValue');
                      const qty = watch('quantity');
                      if (premRate && !isNaN(premRate) && nominal && !isNaN(nominal) && nominal > 0 && qty > 0) {
                        const perShare = (premRate / 100) * nominal;
                        const total = perShare * qty;
                        return (
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            → Premio stimato: {perShare.toFixed(2)} {watch('currency')}/unità × {qty} = {total.toFixed(2)} {watch('currency')} alla scadenza
                          </p>
                        );
                      }
                      return (
                        <p className="text-xs text-gray-500">
                          Bonus una-tantum pagato alla scadenza (es. 0.8% per BTP Valore)
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cost Basis Tracking */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="showCostBasis">Tracciamento Cost Basis</Label>
                <p className="text-xs text-gray-500">
                  Abilita il calcolo di plusvalenze non realizzate e tasse stimate
                </p>
              </div>
              <Switch
                id="showCostBasis"
                checked={showCostBasis}
                onCheckedChange={(checked) => {
                  setShowCostBasis(checked);
                  if (!checked) {
                    setValue('averageCost', undefined);
                    setValue('taxRate', undefined);
                  }
                }}
              />
            </div>

            {showCostBasis && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="averageCost">
                      {isBondPctMode
                        ? 'Prezzo di Carico (quotazione Borsa Italiana)'
                        : `Costo Medio per Azione (${watch('currency')})`}
                    </Label>
                    <Input
                      id="averageCost"
                      type="number"
                      step="0.0001"
                      min="0"
                      {...register('averageCost', { valueAsNumber: true })}
                      placeholder={isBondPctMode ? 'es. 100 (acquistato a 100 su Borsa Italiana)' : 'es. 85.1234'}
                    />
                    {errors.averageCost && (
                      <p className="text-sm text-red-500">{errors.averageCost.message}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {isBondPctMode
                        ? 'Inserire il prezzo di acquisto come riportato su Borsa Italiana (per 100€ di nominale).'
                        : 'Il costo medio di acquisto per singola azione/unità'}
                    </p>
                    {isBondPctMode && (() => {
                      const biPrice = watch('averageCost');
                      const nominal = watch('bondNominalValue');
                      if (!biPrice || isNaN(biPrice) || !nominal) return null;
                      const eurVal = biPrice * (nominal / 100);
                      return (
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          ≈ {eurVal.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€ per unità
                        </p>
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">Aliquota Fiscale (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      {...register('taxRate', { valueAsNumber: true })}
                      placeholder="es. 26"
                    />
                    {errors.taxRate && (
                      <p className="text-sm text-red-500">{errors.taxRate.message}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      Percentuale di tassazione sulle plusvalenze (es. 26 per 26%)
                    </p>
                    {(selectedType === 'bond' || selectedAssetClass === 'bonds') && (
                      <button
                        type="button"
                        onClick={() => setValue('taxRate', 12.5)}
                        className="text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline"
                      >
                        Titoli di Stato italiani (BTP, CCT, BOT): imposta 12,5%
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TER (Total Expense Ratio) */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="showTER">TER (Total Expense Ratio)</Label>
                <p className="text-xs text-gray-500">
                  Costi annuali di gestione del fondo (es. ETF, fondi comuni)
                </p>
              </div>
              <Switch
                id="showTER"
                checked={showTER}
                onCheckedChange={(checked) => {
                  setShowTER(checked);
                  if (!checked) {
                    setValue('totalExpenseRatio', undefined);
                  }
                }}
              />
            </div>

            {showTER && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="totalExpenseRatio">TER (%)</Label>
                <Input
                  id="totalExpenseRatio"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...register('totalExpenseRatio', { valueAsNumber: true })}
                  placeholder="es. 0.20"
                />
                {errors.totalExpenseRatio && (
                  <p className="text-sm text-red-500">{errors.totalExpenseRatio.message}</p>
                )}
                <p className="text-xs text-gray-500">
                  Percentuale annuale dei costi di gestione (es. 0.20 per 0.20%)
                </p>
              </div>
            )}
          </div>

          {/* Stamp duty exemption (imposta di bollo) */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="stampDutyExempt">Esente da imposta di bollo</Label>
              <p className="text-xs text-gray-500">
                Se attivo, questo asset non viene incluso nel calcolo dell&apos;imposta di bollo (es. fondi pensione, immobili)
              </p>
            </div>
            <Switch
              id="stampDutyExempt"
              checked={!!watch('stampDutyExempt')}
              onCheckedChange={(checked) => setValue('stampDutyExempt', checked)}
            />
          </div>

          {shouldUpdatePrice(selectedType, selectedSubCategory) && (
            <div className="space-y-2">
              <Label htmlFor="manualPrice">Prezzo Manuale (opzionale)</Label>
              <Input
                id="manualPrice"
                type="number"
                step="0.0001"
                {...register('manualPrice', { valueAsNumber: true })}
                placeholder={
                  isBondPctMode
                    ? 'es. 104.20 (% del nominale, lascia vuoto per auto-recupero)'
                    : `Lascia vuoto per recupero automatico da ${priceSource}`
                }
              />
              {errors.manualPrice && (
                <p className="text-sm text-red-500">{errors.manualPrice.message}</p>
              )}
              <p className="text-xs text-gray-500">
                {isBondPctMode
                  ? `Inserire come % del nominale (es. 104.20 per un BTP quotato a 104.20% di 1000€ → prezzo salvato come 1042€/unità). Lascia vuoto per recupero automatico da ${priceSource}.`
                  : `Se inserisci un prezzo manuale, questo verrà utilizzato al posto del recupero automatico da ${priceSource}.`}
              </p>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong>
              {selectedType === 'cash' && ' Per asset di tipo liquidità, il prezzo sarà impostato a 1.'}
              {selectedType === 'realestate' && ' Per immobili, il prezzo deve essere aggiornato manualmente.'}
              {selectedSubCategory === 'Private Equity' && ' Per Private Equity, il prezzo deve essere aggiornato manualmente.'}
              {shouldUpdatePrice(selectedType, selectedSubCategory) && ` Puoi inserire un prezzo manuale nel campo apposito, oppure il prezzo verrà recuperato automaticamente da ${priceSource}. In caso di errore nel recupero automatico, potrai sempre impostare il prezzo manualmente.`}
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
