/**
 * Register or edit a dividend / coupon payment — the one manual form of Cashflow › Dividendi,
 * in the modal vocabulary (doc/guide/dialog.md): the reading line IS the status line (what the
 * form wants, what it is doing, how it went), a refused submit lands there in Italian with
 * `aria-invalid` and the focus on the first refused field, and the submit is never `disabled`.
 *
 * Three decisions the 2026-09-14 critique forced, each measured on the owner's mirror:
 *
 *   - The picker lists every instrument that can pay — equities AND bonds, held or sold. It
 *     used to keep `assetClass === 'equity' && quantity > 0`: a bond still paying coupons
 *     (a BTP, say) could not be selected, and editing a dividend of a sold stock
 *     opened a form with the Asset field blank and «Asset non trovato» on save. A sold
 *     instrument is labelled as such; a record whose instrument is gone keeps its own option.
 *   - The withholding proposal is the instrument's OWN `taxRate` (12,5% on a BTP, 26% on a
 *     stock), never a constant — doc/guide/cashflow-dividendi.md says «never a constant» and the
 *     form typed 26% on every coupon. It is proposed only while the user has not touched the
 *     field, and only on a new record.
 *   - A bond's payment defaults to «Cedola»; the type follows the instrument until it is chosen.
 *
 * A foreign dividend (2026-11-23, lib/utils/dividendFx.ts): the currency follows the instrument
 * until the owner picks one, every amount says its currency, and an issuer whose ISIN is not
 * Italian is withheld twice — «Ritenuta estera» on the gross, «Ritenuta italiana» on what is left.
 * The euro side is the server's (the payment day's ECB rate, or «Netto accreditato in euro» from
 * the statement); the form previews it with the same rate (`useFxRate`) and never disables the
 * submit for a credit the rate refuses — the server's 422 says it again.
 *
 * Auto-fill is a convenience, never enforcement: on an edit nothing is recomputed, because the
 * saved figures may carry a foreign tax credit or a quantity that differs from today's.
 */
'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { NO_AUTOFILL_ATTRIBUTES } from '@/components/ui/autofill';
import { useForm, Controller, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Dividend, DividendFormData, DividendType } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { useAssets } from '@/lib/hooks/useAssets';
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
import { formatItalianDate, getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import { INSTRUMENT_CURRENCIES, normalizeCurrencyAmount } from '@/lib/constants/currencies';
import { useFxRate } from '@/lib/hooks/useFxRate';
import {
  foreignRateOf,
  hasForeignWithholding,
  proposeForeignTaxRate,
  resolveDividendFx,
  type DividendFxInput,
  type DividendFxResolution,
} from '@/lib/utils/dividendFx';
import { TradeFxError, describeTotalOff, formatFxPair, type TradeFxErrorCode } from '@/lib/utils/tradeFx';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { stripFloatNoise } from '@/lib/utils/floatNoise';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import {
  describeDividendIntent,
  describeFormRefusal,
  describeModalStatus,
  describeWriteError,
  userFacingError,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';

/** The form's id, so the footer's submit can live outside the `<form>`. */
const DIVIDEND_FORM_ID = 'dividend-form';

/** The withholding proposed when an instrument declares no rate of its own. */
const DEFAULT_TAX_RATE = 26;

/** The classes whose instruments pay something the registry records — the page's own filter. */
const PAYING_ASSET_CLASSES = new Set(['equity', 'bonds']);
/** A pension fund, an account or a house sits in an equity/bonds class and pays nothing here. */
const NON_PAYING_ASSET_TYPES = new Set(['pensionFund', 'cash', 'realestate', 'loan']);

/**
 * Every number the form can leave empty carries its own sentence: `valueAsNumber` hands zod a
 * `NaN`, which without `error` reads as «Invalid input» (doc/guide/dialog.md § Dialog e form trasversali).
 */
const dividendSchema = z
  .object({
    assetId: z.string().min(1, 'Scegli lo strumento'),
    grossAmountPerShare: z.number({ error: 'Inserisci l’importo lordo per unità' }).positive('L’importo lordo deve essere maggiore di zero'),
    withholdingTax: z.number({ error: 'Inserisci la ritenuta per unità, anche 0' }).min(0, 'La ritenuta non può essere negativa'),
    // Required only when the issuer is foreign: the resolver below asks for it then.
    foreignWithholdingTax: z.number().min(0, 'La ritenuta estera non può essere negativa').optional().or(z.nan()),
    settledNetEur: z.number().positive('Il netto accreditato deve essere maggiore di zero').optional().or(z.nan()),
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

/** What the resolver is told at each validation: whether the form shows the foreign withholding. */
interface DividendFormContext {
  /** The ISIN of an instrument id, the record's own when the instrument is gone. */
  isinOf: (assetId: string) => string | undefined;
}

/**
 * The schema, plus the one rule it cannot see: with two withholdings the foreign one is required
 * (its label carries the `*`, AGENTS.md § Two-Step Create Dialogs → a marker is a claim).
 */
const dividendResolver: Resolver<DividendFormValues, DividendFormContext> = async (values, context, options) => {
  const result = await zodResolver(dividendSchema)(values, context, options);
  const foreign = values.foreignWithholdingTax;
  const twoWithholdings = !!context && hasForeignWithholding(context.isinOf(values.assetId), values.currency);
  if (!twoWithholdings || (typeof foreign === 'number' && Number.isFinite(foreign))) return result;
  return {
    values: {},
    errors: {
      ...result.errors,
      foreignWithholdingTax: { type: 'required', message: 'Inserisci la ritenuta estera per unità, anche 0' },
    },
  };
};

/** The field names as the refusal sentence prints them, in the order the reader meets them. */
const FIELD_LABELS: Partial<Record<keyof DividendFormValues, string>> = {
  assetId: 'Strumento',
  grossAmountPerShare: 'Importo lordo',
  foreignWithholdingTax: 'Ritenuta estera',
  withholdingTax: 'Ritenuta',
  settledNetEur: 'Netto accreditato in euro',
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
  /** The tab's registry: the foreign rate proposed is the instrument's last one. */
  dividends: Dividend[];
}

/** What the routes take: `null` removes a stored foreign part or credit on an edit. */
type DividendPayload = Omit<DividendFormData, 'foreignTaxAmount' | 'settledNetEur'> & {
  foreignTaxAmount?: number | null;
  settledNetEur?: number | null;
};

type FxPreview =
  | { kind: 'resolved'; resolution: DividendFxResolution }
  | { kind: 'error'; code: TradeFxErrorCode; ecbRate?: number };

/** Module-level so the component holds no try/catch around a branch (the React Compiler's rule). */
function previewDividendFx(input: DividendFxInput): FxPreview {
  try {
    return { kind: 'resolved', resolution: resolveDividendFx(input) };
  } catch (error) {
    if (error instanceof TradeFxError) return { kind: 'error', code: error.code, ecbRate: error.ecbRate };
    throw error;
  }
}

/** A typed number, or undefined for an empty or non-positive field. */
function positiveOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && !isNaN(value) && value > 0 ? value : undefined;
}

/** A typed number, or 0 for an empty field. */
const numberOrZero = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : 0);

/** The foreign rate of the instrument's last record that had one: the next proposal starts there. */
function lastForeignRateOf(dividends: Dividend[], assetId: string | undefined): number | undefined {
  if (!assetId) return undefined;
  const withForeign = dividends.filter((d) => d.assetId === assetId && d.foreignTaxAmount !== undefined);
  if (withForeign.length === 0) return undefined;
  const latest = withForeign.reduce((a, b) => (toDate(b.paymentDate).getTime() > toDate(a.paymentDate).getTime() ? b : a));
  return foreignRateOf(latest);
}

interface FxLineInput {
  isEur: boolean;
  preview: FxPreview | null;
  loading: boolean;
  isFutureDay: boolean;
  hasNet: boolean;
  currency: string;
  paymentDayIso: string | undefined;
}

/**
 * The line under «Netto accreditato in euro»: the rate the save will use, or why there is none
 * yet. A credit the rate refuses says so under the field instead (`describeTotalOff`).
 */
function describeFxLine({ isEur, preview, loading, isFutureDay, hasNet, currency, paymentDayIso }: FxLineInput): string | null {
  if (isEur || !preview || !hasNet) return null;
  if (preview.kind === 'resolved' && preview.resolution.fxSource === 'statement') {
    return `Cambio dal tuo accredito: ${formatFxPair(currency, preview.resolution.exchangeRate)}`;
  }
  if (isFutureDay) return 'Cambio di oggi: quello del giorno di pagamento lo applico quando arriva.';
  if (preview.kind === 'error') {
    if (preview.code !== 'no-rate') return null;
    return loading ? 'Leggo il cambio…' : 'Cambio non disponibile: il netto in euro si calcola al salvataggio.';
  }
  const { exchangeRate, fxSource, netAmountEur } = preview.resolution;
  const pair = formatFxPair(currency, exchangeRate);
  const estimated = `netto stimato ${formatCurrency(netAmountEur)}`;
  if (fxSource === 'ecb' && paymentDayIso) {
    return `Cambio BCE del ${formatItalianDate(`${paymentDayIso}T12:00:00`)}: ${pair} · ${estimated}`;
  }
  return `Cambio BCE più recente, quello del giorno non è disponibile: ${pair} · ${estimated}`;
}

/** «(€)» for the euro, the code otherwise: the label of every amount. */
const currencyMark = (currency: string) => (currency === 'EUR' ? '€' : currency);

/** «15%», «12,5%». */
const formatRate = (rate: number) => `${formatNumberIt(rate, Number.isInteger(rate) ? 0 : 1)}%`;

const round4 = (value: number) => parseFloat(value.toFixed(4));

/**
 * Today at the day's start, as a typed date is (`T00:00:00`): a default carrying the clock of the
 * form's opening made a payment left on «today» later than the tab's `now`, read at its mount, and
 * the tab counted it as announced («Attesa») until a reload (2026-11-25).
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A field is a 44px target on a phone (the modal is a drawer there) and the dense 36px from `desktop:`. */
const FIELD_CLASS = 'h-11 desktop:h-9';

const EMPTY_ASSETS: Asset[] = [];
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

export function DividendDialog({ open, onClose, dividend, onSuccess, returnFocusTo, dividends }: DividendDialogProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  // The instruments from the assets key every page shares (2026-09-29), read only while the dialog
  // is open: on Cashflow they are already in the cache, so the picker opens filled.
  const { data: assets = EMPTY_ASSETS, isLoading: loadingAssets, isError: assetsUnread } = useAssets(ownerId, { enabled: open && !!user });
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  // What the user has typed over: a proposal never overwrites a value the user touched. State,
  // not refs — a ref read inside `register`'s handler trips `react-hooks/refs` during render.
  const [taxEdited, setTaxEdited] = useState(false);
  const [foreignEdited, setForeignEdited] = useState(false);
  const [typeEdited, setTypeEdited] = useState(false);
  const [currencyEdited, setCurrencyEdited] = useState(false);

  // Settled during render on the `open` subject (AGENTS.md § React Compiler and the hooks rules → react-hooks/set-state-in-effect):
  // a reopened form starts idle and untouched, whatever the last attempt said.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setStatus({ phase: 'idle' });
    setTaxEdited(false);
    setForeignEdited(false);
    setTypeEdited(false);
    setCurrencyEdited(false);
  }

  // The issuer's ISIN decides the two withholdings; the record's own when its instrument is gone.
  const isinOf = (assetId: string) =>
    assets.find((a) => a.id === assetId)?.isin ?? (dividend?.assetId === assetId ? dividend.assetIsin : undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DividendFormValues, DividendFormContext>({
    resolver: dividendResolver,
    context: { isinOf },
    // `onInvalid` focuses the first refused field in READING order; react-hook-form's own focus
    // would then move it to the first registered one, which skips the combobox (a Controller).
    shouldFocusError: false,
    defaultValues: {
      currency: 'EUR',
      dividendType: 'ordinary',
      exDate: startOfToday(),
      paymentDate: startOfToday(),
    },
  });

  const selectedAssetId = useWatch({ control, name: 'assetId' });
  const grossAmountPerShare = useWatch({ control, name: 'grossAmountPerShare' }) || 0;
  const withholdingTax = useWatch({ control, name: 'withholdingTax' }) || 0;
  const foreignWithholdingTax = useWatch({ control, name: 'foreignWithholdingTax' });
  const sharesHeld = useWatch({ control, name: 'sharesHeld' }) || 0;
  const currency = useWatch({ control, name: 'currency' }) || 'EUR';
  const paymentDate = useWatch({ control, name: 'paymentDate' });
  const settledNetEur = useWatch({ control, name: 'settledNetEur' });

  const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedAssetId), [assets, selectedAssetId]);
  const proposedRate = selectedAsset?.taxRate ?? DEFAULT_TAX_RATE;
  const isEur = currency === 'EUR';
  // The issuer decides the withholdings, the currency only the conversion (owner, 2026-11-23).
  const twoWithholdings = hasForeignWithholding(selectedAssetId ? isinOf(selectedAssetId) : undefined, currency);
  const proposedForeignRate = proposeForeignTaxRate(
    selectedAsset?.isin,
    selectedAsset?.assetClass,
    lastForeignRateOf(dividends, selectedAssetId)
  );

  // Calculated fields (read-only); a foreign part counts only while the form shows it.
  const foreignPerShare = twoWithholdings ? numberOrZero(foreignWithholdingTax) : 0;
  const netAmountPerShare = grossAmountPerShare - foreignPerShare - withholdingTax;
  const totalGross = grossAmountPerShare * sharesHeld;
  const totalForeignTax = foreignPerShare * sharesHeld;
  const totalItalianTax = withholdingTax * sharesHeld;
  const totalTax = totalForeignTax + totalItalianTax;
  const totalNet = netAmountPerShare * sharesHeld;

  // The euro side, previewed with the rate the save will read: the payment day's ECB fixing.
  const paymentDayIso = paymentDate instanceof Date && !isNaN(paymentDate.getTime()) ? format(paymentDate, 'yyyy-MM-dd') : undefined;
  const fxRateQuery = useFxRate(open && !isEur ? currency : undefined, paymentDayIso);
  const typedCredit = isEur ? undefined : positiveOrUndefined(settledNetEur);
  const fxPreview = isEur
    ? null
    : previewDividendFx({
        grossAmount: totalGross,
        netAmount: totalNet,
        foreignTaxAmount: totalForeignTax,
        settledNetEur: typedCredit,
        ecb: fxRateQuery.data ?? null,
      });
  const creditOffMessage =
    fxPreview?.kind === 'error' && fxPreview.code === 'total-off' && fxPreview.ecbRate !== undefined
      ? describeTotalOff(currency, fxPreview.ecbRate)
      : null;
  const fxLine = describeFxLine({
    isEur,
    preview: fxPreview,
    loading: fxRateQuery.isLoading,
    isFutureDay: !!paymentDayIso && paymentDayIso > getItalyDateIso(),
    hasNet: totalNet > 0,
    currency,
    paymentDayIso,
  });

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

  // The withholding proposals, for a NEW record and an untouched field only. Abroad: the
  // instrument's last foreign rate, else the US treaty's for a US share, over the gross. In Italy:
  // the instrument's own rate over what crosses the border (the gross less the foreign part). On an
  // edit the saved figures are the user's (a tax credit, a special regime) and never recomputed.
  useEffect(() => {
    if (dividend || foreignEdited || !twoWithholdings || !(grossAmountPerShare > 0)) return;
    setValue('foreignWithholdingTax', round4((grossAmountPerShare * proposedForeignRate) / 100));
  }, [grossAmountPerShare, proposedForeignRate, twoWithholdings, dividend, foreignEdited, setValue]);

  useEffect(() => {
    if (dividend || taxEdited || !(grossAmountPerShare > 0)) return;
    setValue('withholdingTax', round4(((grossAmountPerShare - foreignPerShare) * proposedRate) / 100));
  }, [grossAmountPerShare, foreignPerShare, proposedRate, dividend, taxEdited, setValue]);

  // A chosen instrument fills what it knows for a NEW record: today's quantity as the units,
  // «Cedola» as the type of a bond's payment and its own currency (pence as pounds) — until the
  // user picks a type or a currency by hand.
  useEffect(() => {
    if (!selectedAssetId || dividend) return;
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;
    if (asset.quantity > 0) setValue('sharesHeld', asset.quantity);
    if (!typeEdited) setValue('dividendType', isBond(asset) ? 'coupon' : 'ordinary');
    if (!currencyEdited) setValue('currency', normalizeCurrencyAmount(asset.currency || 'EUR', 0).currency);
  }, [selectedAssetId, assets, dividend, typeEdited, currencyEdited, setValue]);

  // Reset form when dividend changes or dialog opens. Only react-hook-form calls live here
  // (doc/guide/dialog.md § Dialog Form Reset).
  useEffect(() => {
    if (!open) return;
    if (dividend) {
      reset({
        assetId: dividend.assetId,
        // A coupon saved before 2026-10-07 can carry binary noise (6.500000000000001): shown and
        // saved back as the decimal it is (lib/utils/floatNoise.ts).
        grossAmountPerShare: stripFloatNoise(dividend.dividendPerShare),
        // A record with a foreign part opens on its two per-unit figures; one without it shows a
        // foreign 0 and the saved total as the Italian one.
        foreignWithholdingTax:
          dividend.quantity > 0 && dividend.foreignTaxAmount !== undefined ? round4(dividend.foreignTaxAmount / dividend.quantity) : 0,
        withholdingTax:
          dividend.quantity > 0 ? round4((dividend.taxAmount - (dividend.foreignTaxAmount ?? 0)) / dividend.quantity) : 0,
        settledNetEur: dividend.settledNetEur,
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
        exDate: startOfToday(),
        paymentDate: startOfToday(),
        grossAmountPerShare: undefined,
        withholdingTax: undefined,
        foreignWithholdingTax: undefined,
        settledNetEur: undefined,
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
      const label = key === 'withholdingTax' && twoWithholdings ? 'Ritenuta italiana' : (FIELD_LABELS[key] ?? key);
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

  /**
   * The foreign part: on a create, present only with two withholdings. On an edit, sent only when
   * the record had one or the owner typed it — a record without one, corrected in its note, must not
   * gain a foreign part of 0, which the next proposal would read as 0% — and `null` when the form
   * went back to one withholding on a record that had it.
   */
  const foreignTaxPayload = (): Pick<DividendPayload, 'foreignTaxAmount'> => {
    const hadForeign = dividend?.foreignTaxAmount !== undefined;
    if (!twoWithholdings) return hadForeign ? { foreignTaxAmount: null } : {};
    if (dividend && !hadForeign && !foreignEdited) return {};
    return { foreignTaxAmount: totalForeignTax };
  };

  /** The euro credited, when typed on a foreign record; `null` clears a stored one (or on EUR). */
  const creditPayload = (): Pick<DividendPayload, 'settledNetEur'> => {
    if (typedCredit !== undefined) return { settledNetEur: typedCredit };
    return dividend?.settledNetEur !== undefined ? { settledNetEur: null } : {};
  };

  const onSubmit = async (data: DividendFormValues) => {
    if (!user || !ownerId || isSubmitting) return;

    // The route resolves the instrument itself (ticker, name, ISIN, ownership); the client only
    // refuses to send an id it cannot account for — a record's own instrument always can.
    if (!assets.some((a) => a.id === data.assetId) && dividend?.assetId !== data.assetId) {
      setStatus({ phase: 'error', message: 'Lo strumento scelto non è tra i tuoi: riapri il modulo e scegline uno.' });
      return;
    }

    // The save is a function of its own, awaited in the try below: the React Compiler does not
    // compile a `throw` or a conditional expression written inside a try/catch.
    const save = async () => {
      const dividendData: DividendPayload = {
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
        ...foreignTaxPayload(),
        ...creditPayload(),
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
        // A 422 is a sentence written for the reader (a credit the day's rate refuses): shown as it is.
        if (response.status === 422 && typeof error.error === 'string') throw userFacingError(error.error);
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
    };
    try {
      await save();
    } catch (error) {
      console.error('Error saving dividend:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  // The listed currencies, plus the instrument's own (or the record's) when it is not among them.
  const currencyOptions = useMemo(() => {
    const list: string[] = [...INSTRUMENT_CURRENCIES];
    const own = [selectedAsset?.currency, dividend?.currency].filter((code): code is string => !!code);
    for (const code of own.map((c) => normalizeCurrencyAmount(c, 0).currency)) {
      if (!list.includes(code)) list.push(code);
    }
    return list;
  }, [selectedAsset, dividend]);

  const editingBond = dividend ? dividend.dividendType === 'coupon' || dividend.dividendType === 'finalPremium' : false;
  // An unread instrument list is the status line's error while it lasts: derived, never set in an
  // effect, and a retry is a close and a reopen (the query re-runs with the dialog).
  const shownStatus: ModalStatus =
    status.phase === 'idle' && assetsUnread
      ? { phase: 'error', message: 'Gli strumenti non sono stati letti: chiudi e riapri il modulo.' }
      : status;
  const reading = describeModalStatus(isSubmitting ? { phase: 'submitting' } : shownStatus, {
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
        autoComplete="off"
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
                label="Strumento"
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
            <Label htmlFor="grossAmountPerShare">Importo lordo per unità ({currencyMark(currency)}) *</Label>
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

          {/* A foreign issuer is withheld twice (owner, 2026-11-23): abroad on the gross, then in
              Italy on what crosses the border. An Italian ISIN keeps the single field. */}
          {twoWithholdings && (
            <div className="space-y-2">
              <Label htmlFor="foreignWithholdingTax">
                Ritenuta estera per unità ({currencyMark(currency)}) *
                {!dividend && selectedAsset && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    proposta al <span className="font-mono tabular-nums">{formatRate(proposedForeignRate)}</span>
                  </span>
                )}
              </Label>
              <Input
                id="foreignWithholdingTax"
                className={FIELD_CLASS}
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0"
                aria-invalid={!!errors.foreignWithholdingTax}
                aria-describedby={errors.foreignWithholdingTax ? 'foreignWithholdingTax-error' : 'foreignWithholdingTax-help'}
                {...register('foreignWithholdingTax', { valueAsNumber: true, onChange: () => setForeignEdited(true) })}
              />
              {fieldError('foreignWithholdingTax')}
              <p id="foreignWithholdingTax-help" className="text-xs text-muted-foreground">
                Trattenuta nel paese dell’emittente: la proposta è un punto di partenza, controlla l’estratto.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="withholdingTax">
              {twoWithholdings ? 'Ritenuta italiana' : 'Ritenuta'} per unità ({currencyMark(currency)}) *
              {!dividend && selectedAsset && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  proposta al <span className="font-mono tabular-nums">{formatRate(proposedRate)}</span>
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
              {twoWithholdings
                ? 'Sul netto frontiera: il lordo meno la ritenuta estera.'
                : 'Modificabile per un dividendo estero o un regime speciale.'}
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

        {/* The euro actually credited, from the statement: the euro net IS this figure. A credit
            the day's rate refuses is said under the field; the submit stays enabled (the server
            answers the same refusal with a 422). */}
        {!isEur && (
          <div className="space-y-2">
            <Label htmlFor="settledNetEur">
              Netto accreditato in euro <span className="font-normal text-muted-foreground">(opzionale)</span>
            </Label>
            <Input
              id="settledNetEur"
              className={FIELD_CLASS}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="es. 40.00"
              aria-invalid={!!errors.settledNetEur || creditOffMessage !== null || undefined}
              aria-describedby="settledNetEur-help"
              {...register('settledNetEur', { valueAsNumber: true })}
            />
            {fieldError('settledNetEur')}
            {creditOffMessage && <p className="text-[12px] leading-[1.45] text-destructive">{creditOffMessage}</p>}
            <p id="settledNetEur-help" className="text-xs text-muted-foreground">
              Dall’estratto del conto. Se lo lasci vuoto uso il cambio BCE del giorno di pagamento.
            </p>
            {fxLine && (
              <p className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="dividend-fx-line">
                {fxLine}
              </p>
            )}
          </div>
        )}

        {/* The summary: a `bg-muted` block, never a bordered card inside the modal (dialog.md);
            figures in the mono face; no sign colour, because a total is not a gain or a loss. */}
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p className={TILE_SUB_EYEBROW_CLASS}>Riepilogo</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {(
              [
                ['Netto per unità', netAmountPerShare],
                ['Lordo totale', totalGross],
                ...(twoWithholdings
                  ? [
                      ['Ritenuta estera', totalForeignTax],
                      ['Ritenuta italiana', totalItalianTax],
                    ]
                  : [['Ritenute totali', totalTax]]),
                ['Netto totale', totalNet],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12px] text-muted-foreground">{label}</dt>
                <dd className={cn('font-mono text-[13px] font-semibold tabular-nums', label === 'Netto totale' ? 'text-foreground' : 'text-foreground/90')}>
                  {formatCurrency(value, currency)}
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
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    setCurrencyEdited(true);
                    field.onChange(value);
                  }}
                >
                  <SelectTrigger id="currency" className={SELECT_CLASS} aria-invalid={!!errors.currency}>
                    <SelectValue placeholder="Scegli la valuta" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
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
            {...NO_AUTOFILL_ATTRIBUTES}
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
