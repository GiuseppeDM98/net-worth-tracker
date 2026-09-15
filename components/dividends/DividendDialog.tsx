/**
 * Register or edit a dividend / coupon payment — the one manual form of Cashflow › Dividendi,
 * in the modal vocabulary (doc/guide/dialog.md): the reading line IS the status line (what the
 * form wants, what it is doing, how it went), a refused submit lands there in Italian with
 * `aria-invalid` and the focus on the first refused field, and the submit is never `disabled`.
 *
 * Three decisions the 2026-09-14 critique forced, each measured on the owner's mirror:
 *
 *   - The picker lists every instrument that can pay — equities AND bonds, held or sold. It
 *     used to keep `assetClass === 'equity' && quantity > 0`: the only instrument still paying
 *     on the real account (a BTP) could not be selected, and editing a dividend of a sold stock
 *     opened a form with the Asset field blank and «Asset non trovato» on save. A sold
 *     instrument is labelled as such; a record whose instrument is gone keeps its own option.
 *   - The withholding proposal is the instrument's OWN `taxRate` (12,5% on a BTP, 26% on a
 *     stock), never a constant — doc/guide/cashflow-dividendi.md says «never a constant» and the
 *     form typed 26% on every coupon. It is proposed only while the user has not touched the
 *     field, and only on a new record.
 *   - A bond's payment defaults to «Cedola»; the type follows the instrument until it is chosen.
 *
 * Auto-fill is a convenience, never enforcement: on an edit nothing is recomputed, because the
 * saved figures may carry a foreign tax credit or a quantity that differs from today's.
 */
'use client';

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useForm, Controller, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Dividend, DividendFormData, DividendType } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { getAllAssets } from '@/lib/services/assetService';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumberIt } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import {
  describeDividendIntent,
  describeFormRefusal,
  describeModalStatus,
  describeWriteError,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';

/** The form's id, so the footer's submit can live outside the `<form>`. */
const DIVIDEND_FORM_ID = 'dividend-form';

/** The withholding proposed when an instrument declares no rate of its own. */
const DEFAULT_TAX_RATE = 26;

/** The classes whose instruments pay something the registry records — the page's own filter. */
const PAYING_ASSET_CLASSES = new Set(['equity', 'bonds']);
/** A pension fund, an account or a house sits in an equity/bonds class and pays nothing here. */
const NON_PAYING_ASSET_TYPES = new Set(['pensionFund', 'cash', 'realestate']);

/**
 * Every number the form can leave empty carries its own sentence: `valueAsNumber` hands zod a
 * `NaN`, which without `error` reads as «Invalid input» (AGENTS.md → Dialog e form trasversali).
 */
const dividendSchema = z
  .object({
    assetId: z.string().min(1, 'Scegli lo strumento'),
    grossAmountPerShare: z.number({ error: 'Inserisci l’importo lordo per unità' }).positive('L’importo lordo deve essere maggiore di zero'),
    withholdingTax: z.number({ error: 'Inserisci la ritenuta per unità, anche 0' }).min(0, 'La ritenuta non può essere negativa'),
    sharesHeld: z.number({ error: 'Inserisci le unità possedute' }).positive('Le unità devono essere più di zero'),
    exDate: z.date({ error: 'Inserisci la data ex-dividendo' }),
    paymentDate: z.date({ error: 'Inserisci la data di pagamento' }),
    dividendType: z.enum(['ordinary', 'extraordinary', 'interim', 'final', 'coupon', 'finalPremium']),
    currency: z.string().min(1, 'Scegli la valuta'),
    notes: z.string().optional(),
    sourceUrl: z.string().url('Inserisci un indirizzo valido').optional().or(z.literal('')),
  })
  // Cross-field: a payment date is valid on its own and only wrong relative to the ex-date.
  .refine((data) => data.paymentDate >= data.exDate, {
    message: 'La data di pagamento deve essere uguale o successiva alla data ex-dividendo',
    path: ['paymentDate'],
  });

type DividendFormValues = z.infer<typeof dividendSchema>;

/** The field names as the refusal sentence prints them, in the order the reader meets them. */
const FIELD_LABELS: Partial<Record<keyof DividendFormValues, string>> = {
  assetId: 'Strumento',
  grossAmountPerShare: 'Importo lordo',
  withholdingTax: 'Ritenuta',
  sharesHeld: 'Unità',
  exDate: 'Data ex-dividendo',
  paymentDate: 'Data di pagamento',
  dividendType: 'Tipo',
  currency: 'Valuta',
  sourceUrl: 'Link della fonte',
};

interface DividendDialogProps {
  open: boolean;
  onClose: () => void;
  dividend?: Dividend | null;
  onSuccess?: () => void;
  /** The control that opened the form, so the focus goes back to it on close. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const round4 = (value: number) => parseFloat(value.toFixed(4));

/** A field is a 44px target on a phone (the modal is a drawer there) and the dense 36px from `desktop:`. */
const FIELD_CLASS = 'h-11 desktop:h-9';
/** A `SelectTrigger` sizes itself through `data-[size]`, which outranks a bare `h-*`. */
const SELECT_CLASS = 'h-11 data-[size=default]:h-11 desktop:h-9 desktop:data-[size=default]:h-9';

function isBond(asset: Asset | undefined): boolean {
  return asset?.assetClass === 'bonds';
}

/** «VWCE - Vanguard FTSE All-World», with «· venduto» when the position is closed. */
function optionLabel(asset: Asset): string {
  const base = `${getAssetDisplayTicker(asset)} - ${asset.name}`;
  return asset.quantity > 0 ? base : `${base} · venduto`;
}

export function DividendDialog({ open, onClose, dividend, onSuccess, returnFocusTo }: DividendDialogProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  // What the user has typed over: a proposal never overwrites a value the user touched. State,
  // not refs — a ref read inside `register`'s handler trips `react-hooks/refs` during render.
  const [taxEdited, setTaxEdited] = useState(false);
  const [typeEdited, setTypeEdited] = useState(false);

  // Settled during render on the `open` subject (AGENTS.md → react-hooks/set-state-in-effect):
  // a reopened form starts idle and untouched, whatever the last attempt said.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setStatus({ phase: 'idle' });
    setTaxEdited(false);
    setTypeEdited(false);
  }

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DividendFormValues>({
    resolver: zodResolver(dividendSchema),
    // `onInvalid` focuses the first refused field in READING order; react-hook-form's own focus
    // would then move it to the first registered one, which skips the combobox (a Controller).
    shouldFocusError: false,
    defaultValues: {
      currency: 'EUR',
      dividendType: 'ordinary',
      exDate: new Date(),
      paymentDate: new Date(),
    },
  });

  const selectedAssetId = useWatch({ control, name: 'assetId' });
  const grossAmountPerShare = useWatch({ control, name: 'grossAmountPerShare' }) || 0;
  const withholdingTax = useWatch({ control, name: 'withholdingTax' }) || 0;
  const sharesHeld = useWatch({ control, name: 'sharesHeld' }) || 0;

  const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedAssetId), [assets, selectedAssetId]);
  const proposedRate = selectedAsset?.taxRate ?? DEFAULT_TAX_RATE;

  // Calculated fields (read-only)
  const netAmountPerShare = grossAmountPerShare - withholdingTax;
  const totalGross = grossAmountPerShare * sharesHeld;
  const totalTax = withholdingTax * sharesHeld;
  const totalNet = netAmountPerShare * sharesHeld;

  // Every instrument that can pay, held first; a sold one stays selectable because a registry
  // is full of them, and the record of a deleted instrument keeps its own option on an edit.
  const options = useMemo(() => {
    const paying = assets.filter((a) => PAYING_ASSET_CLASSES.has(a.assetClass) && !NON_PAYING_ASSET_TYPES.has(a.type));
    const held = paying.filter((a) => a.quantity > 0).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const sold = paying.filter((a) => a.quantity <= 0).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const list = [...held, ...sold].map((asset) => ({ value: asset.id, label: optionLabel(asset) }));
    if (dividend && !list.some((o) => o.value === dividend.assetId)) {
      list.unshift({ value: dividend.assetId, label: `${dividend.assetTicker} - ${dividend.assetName} · non più tra gli strumenti` });
    }
    return list;
  }, [assets, dividend]);

  // Memoized on what it reads, so the effect below can declare it as a dependency without
  // re-running on every render.
  const loadAssets = useCallback(async () => {
    if (!user || !ownerId) return;
    try {
      setLoadingAssets(true);
      setAssets(await getAllAssets(ownerId));
    } catch (error) {
      console.error('Error loading assets:', error);
      setStatus({ phase: 'error', message: 'Gli strumenti non sono stati letti: chiudi e riapri il modulo.' });
    } finally {
      setLoadingAssets(false);
    }
  }, [user, ownerId]);

  // Load assets when dialog opens. Deferred so the effect body itself sets no state — the
  // loader flips `loadingAssets` before its await (react-hooks/set-state-in-effect); the
  // cleanup drops a load the close beat to it.
  useEffect(() => {
    if (!open || !user) return;
    const timer = setTimeout(() => {
      loadAssets();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, user, loadAssets]);

  // The withholding proposal, for a NEW record and an untouched field only: the instrument's
  // own rate over the gross per unit. On an edit the saved figure is the user's (a foreign tax
  // credit, a special regime) and is never recomputed.
  useEffect(() => {
    if (dividend || taxEdited || !(grossAmountPerShare > 0)) return;
    setValue('withholdingTax', round4((grossAmountPerShare * proposedRate) / 100));
  }, [grossAmountPerShare, proposedRate, dividend, taxEdited, setValue]);

  // A chosen instrument fills what it knows for a NEW record: today's quantity as the units,
  // and «Cedola» as the type of a bond's payment — until the user picks a type by hand.
  useEffect(() => {
    if (!selectedAssetId || dividend) return;
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;
    if (asset.quantity > 0) setValue('sharesHeld', asset.quantity);
    if (!typeEdited) setValue('dividendType', isBond(asset) ? 'coupon' : 'ordinary');
  }, [selectedAssetId, assets, dividend, typeEdited, setValue]);

  // Reset form when dividend changes or dialog opens. Only react-hook-form calls live here
  // (AGENTS.md → Dialog Form Reset).
  useEffect(() => {
    if (!open) return;
    if (dividend) {
      reset({
        assetId: dividend.assetId,
        grossAmountPerShare: dividend.dividendPerShare,
        withholdingTax: dividend.quantity > 0 ? round4(dividend.taxAmount / dividend.quantity) : 0,
        sharesHeld: dividend.quantity,
        exDate: toDate(dividend.exDate),
        paymentDate: toDate(dividend.paymentDate),
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
        grossAmountPerShare: undefined,
        withholdingTax: undefined,
        sharesHeld: undefined,
        notes: '',
        sourceUrl: '',
      });
    }
  }, [dividend, reset, open]);

  /**
   * A refused submit is said in the reading line, in Italian, and the first refused field
   * comes into view with `aria-invalid` and the focus (DESIGN.md → The Status-Is-The-Reading
   * Rule). Named in the order the reader meets the fields, not in zod's.
   */
  const onInvalid = (fieldErrors: FieldErrors<DividendFormValues>) => {
    const values = getValues();
    const form = document.getElementById(DIVIDEND_FORM_ID);
    const fieldOf = (key: string) => form?.querySelector<HTMLElement>(`[name="${key}"], #${key}`) ?? null;
    const keys = (Object.keys(fieldErrors) as (keyof DividendFormValues)[]).sort((a, b) => {
      const ea = fieldOf(a);
      const eb = fieldOf(b);
      if (!ea || !eb) return ea ? -1 : eb ? 1 : 0;
      return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const missing: string[] = [];
    const invalid: string[] = [];
    for (const key of keys) {
      const label = FIELD_LABELS[key] ?? key;
      const value = values[key];
      const isEmpty = value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value));
      (isEmpty ? missing : invalid).push(label);
    }
    setStatus({ phase: 'error', message: describeFormRefusal(missing, invalid) });

    const target = keys.length > 0 ? fieldOf(keys[0]) : null;
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.focus({ preventScroll: true });
    }
  };

  const onSubmit = async (data: DividendFormValues) => {
    if (!user || !ownerId || isSubmitting) return;

    // The route resolves the instrument itself (ticker, name, ISIN, ownership); the client only
    // refuses to send an id it cannot account for — a record's own instrument always can.
    if (!assets.some((a) => a.id === data.assetId) && dividend?.assetId !== data.assetId) {
      setStatus({ phase: 'error', message: 'Lo strumento scelto non è tra i tuoi: riapri il modulo e scegline uno.' });
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

      const endpoint = dividend ? `/api/dividends/${dividend.id}` : '/api/dividends';
      const method = dividend ? 'PUT' : 'POST';
      // PUT takes `updates`, POST the owner and the record.
      const requestBody = dividend ? { updates: dividendData } : { userId: ownerId, dividendData };

      const response = await authenticatedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || 'Errore nel salvataggio del dividendo');
      }

      // The route answers 200 with `skipped` when the same payment is already in the registry:
      // that is not a save, and the form says so instead of closing on a success it did not have.
      const result = (await response.json().catch(() => ({}))) as { skipped?: boolean };
      if (result.skipped) {
        setStatus({ phase: 'error', message: 'Questo pagamento è già nel registro: non è stato registrato di nuovo.' });
        return;
      }

      toast.success(dividend ? 'Pagamento aggiornato' : 'Pagamento registrato');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving dividend:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const editingBond = dividend ? dividend.dividendType === 'coupon' || dividend.dividendType === 'finalPremium' : false;
  const reading = describeModalStatus(isSubmitting ? { phase: 'submitting' } : status, {
    idle: describeDividendIntent({ isEdit: !!dividend, ticker: dividend?.assetTicker, isBond: editingBond }),
    submitting: 'Sto salvando il pagamento.',
  });

  const fieldError = (key: keyof DividendFormValues) => {
    const message = errors[key]?.message;
    if (!message) return null;
    return (
      <p id={`${key}-error`} className="text-[12px] leading-[1.45] text-destructive">
        {String(message)}
      </p>
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow={`Dividendi · ${dividend ? 'Modifica' : 'Nuovo pagamento'}`}
      title={dividend ? 'Modifica il pagamento' : 'Registra un pagamento'}
      reading={reading}
      width="lg"
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          {/* Never `disabled`: a refused submit has to be able to say why (doc/guide/dialog.md). */}
          <Button type="submit" form={DIVIDEND_FORM_ID}>
            {isSubmitting ? 'Salvataggio…' : dividend ? 'Salva modifiche' : 'Registra pagamento'}
          </Button>
        </>
      }
    >
      <form
        id={DIVIDEND_FORM_ID}
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        // An edit after a refusal clears it: the next submit names only what is still missing.
        onChange={() => status.phase === 'error' && setStatus({ phase: 'idle' })}
        className="space-y-6"
      >
        <div className="space-y-2">
          <Label htmlFor="assetId">Strumento *</Label>
          {/* The field stays mounted while the instruments load (disabled, saying so): a field
              that unmounts and comes back drops the focus and whatever was being typed. */}
          <Controller
            control={control}
            name="assetId"
            render={({ field }) => (
              <SearchableCombobox
                id="assetId"
                options={options}
                value={field.value || ''}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (status.phase === 'error') setStatus({ phase: 'idle' });
                }}
                disabled={loadingAssets}
                placeholder={loadingAssets ? 'Caricamento degli strumenti…' : 'Scegli lo strumento'}
                searchPlaceholder="Cerca per nome o ticker…"
                emptyMessage="Nessuno strumento azionario o obbligazionario: aggiungilo dal Patrimonio."
                showBadge={false}
                aria-invalid={!!errors.assetId}
                className={FIELD_CLASS}
              />
            )}
          />
          {fieldError('assetId')}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="grossAmountPerShare">Importo lordo per unità (€) *</Label>
            <Input
              id="grossAmountPerShare"
              className={FIELD_CLASS}
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              aria-invalid={!!errors.grossAmountPerShare}
              aria-describedby={errors.grossAmountPerShare ? 'grossAmountPerShare-error' : undefined}
              {...register('grossAmountPerShare', { valueAsNumber: true })}
            />
            {fieldError('grossAmountPerShare')}
          </div>

          <div className="space-y-2">
            <Label htmlFor="withholdingTax">
              Ritenuta per unità (€) *
              {!dividend && selectedAsset && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  proposta al <span className="font-mono tabular-nums">{formatNumberIt(proposedRate, Number.isInteger(proposedRate) ? 0 : 1)}%</span>
                </span>
              )}
            </Label>
            <Input
              id="withholdingTax"
              className={FIELD_CLASS}
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              aria-invalid={!!errors.withholdingTax}
              aria-describedby={errors.withholdingTax ? 'withholdingTax-error' : 'withholdingTax-help'}
              {...register('withholdingTax', { valueAsNumber: true, onChange: () => setTaxEdited(true) })}
            />
            {fieldError('withholdingTax')}
            <p id="withholdingTax-help" className="text-xs text-muted-foreground">
              Modificabile per un dividendo estero o un regime speciale.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sharesHeld">Unità possedute *</Label>
          <Input
            id="sharesHeld"
            className={FIELD_CLASS}
              type="number"
            inputMode="decimal"
            step="0.0001"
            min="0"
            aria-invalid={!!errors.sharesHeld}
            aria-describedby={errors.sharesHeld ? 'sharesHeld-error' : 'sharesHeld-help'}
            {...register('sharesHeld', { valueAsNumber: true })}
          />
          {fieldError('sharesHeld')}
          <p id="sharesHeld-help" className="text-xs text-muted-foreground">
            Azioni, quote o titoli al giorno dello stacco; precompilato con la quantità attuale.
          </p>
        </div>

        {/* The summary: a `bg-muted` block, never a bordered card inside the modal (dialog.md);
            figures in the mono face; no sign colour, because a total is not a gain or a loss. */}
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p className={TILE_SUB_EYEBROW_CLASS}>Riepilogo</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ['Netto per unità', netAmountPerShare],
              ['Lordo totale', totalGross],
              ['Ritenute totali', totalTax],
              ['Netto totale', totalNet],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[12px] text-muted-foreground">{label}</dt>
                <dd className={cn('font-mono text-[13px] font-semibold tabular-nums', label === 'Netto totale' ? 'text-foreground' : 'text-foreground/90')}>
                  {formatCurrency(value as number)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exDate">Data ex-dividendo *</Label>
            <Controller
              control={control}
              name="exDate"
              render={({ field }) => (
                <Input
                  id="exDate"
                  className={FIELD_CLASS}
              type="date"
                  value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    const dateString = e.target.value;
                    if (!dateString) return;
                    const date = new Date(dateString + 'T00:00:00');
                    if (!isNaN(date.getTime())) field.onChange(date);
                  }}
                  aria-invalid={!!errors.exDate}
                />
              )}
            />
            {fieldError('exDate')}
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentDate">Data di pagamento *</Label>
            <Controller
              control={control}
              name="paymentDate"
              render={({ field }) => (
                <Input
                  id="paymentDate"
                  className={FIELD_CLASS}
              type="date"
                  value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    const dateString = e.target.value;
                    if (!dateString) return;
                    const date = new Date(dateString + 'T00:00:00');
                    if (!isNaN(date.getTime())) field.onChange(date);
                  }}
                  aria-invalid={!!errors.paymentDate}
                />
              )}
            />
            {fieldError('paymentDate')}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dividendType">Tipo *</Label>
            <Controller
              control={control}
              name="dividendType"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    setTypeEdited(true);
                    field.onChange(value as DividendType);
                  }}
                >
                  <SelectTrigger id="dividendType" className={SELECT_CLASS} aria-invalid={!!errors.dividendType}>
                    <SelectValue placeholder="Scegli il tipo" />
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
            {fieldError('dividendType')}
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Valuta *</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="currency" className={SELECT_CLASS} aria-invalid={!!errors.currency}>
                    <SelectValue placeholder="Scegli la valuta" />
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
            {fieldError('currency')}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">
            Note <span className="font-normal text-muted-foreground">(opzionale)</span>
          </Label>
          <textarea
            id="notes"
            {...register('notes')}
            placeholder="es. dividendo del quarto trimestre"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceUrl">
            Link della fonte <span className="font-normal text-muted-foreground">(opzionale)</span>
          </Label>
          <Input
            id="sourceUrl"
            className={FIELD_CLASS}
              type="url"
            {...register('sourceUrl')}
            placeholder="es. https://www.borsaitaliana.it/…"
            aria-invalid={!!errors.sourceUrl}
          />
          {fieldError('sourceUrl')}
        </div>
      </form>
    </ResponsiveModal>
  );
}
