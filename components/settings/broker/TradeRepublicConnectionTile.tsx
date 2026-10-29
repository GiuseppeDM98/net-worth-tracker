/**
 * The Trade Republic half of «Collegamenti» — read-only sync, linked by scanning a QR code.
 *
 * Same shape as its Scalable sibling: an explicit preview, then a save that writes through the
 * standard asset services. The differences are all forced by what this broker does and does not
 * publish, and each one is a divergence a reader of the Scalable tile would otherwise assume is
 * a bug (see `lib/utils/tradeRepublicImport.ts` for the long version):
 *
 *   - **No prices.** The portfolio payload carries no quote, and Yahoo cannot quote the
 *     ISIN the ticker would hold — so a position without a price is created at 0, and the
 *     preview offers a per-row Yahoo-symbol field to fix that before saving (crypto is
 *     resolved automatically: `XF000BTC0017` → `BTC-EUR`). There is no price row in the
 *     preview and no price write on save; a re-sync repairs the ticker of a tracked asset
 *     only when it is still the raw pseudo-ISIN a past sync wrote, never a hand-fixed one.
 *   - **Cash is a real balance, not a residual**, and a second EUR balance is DECLARED rather than
 *     summed into the tracked account.
 *   - **Savings plans («Sparpläne») are a rule, not a fact**: they are listed, matched to the
 *     asset they buy, and never written. No `Asset` field holds a standing order.
 *
 * The QR LOGIN is the one flow in the app where the user approves in a broker's own app and the
 * app never sees a credential. The payload is rendered to a picture ON THE SERVER and only the
 * picture reaches the browser, because a live QR is a credential for as long as the challenge
 * lasts. It can ROTATE before it is scanned, so a new image replaces the old one rather than the
 * first being treated as final.
 *
 * The payload is shown as text next to the picture on purpose: a QR needs a SECOND device, so a
 * reader on a phone cannot scan the screen in front of them and needs the link.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, ExternalLink, Link2, Loader2, LogOut, QrCode, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
import { Tile } from '@/components/ui/tile';
import { BrokerTradeImportDialog } from '@/components/settings/broker/BrokerTradeImportDialog';
import { describeBrokerConnections } from '@/lib/utils/settingsNarrative';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { errorMessage, failureWarning } from '@/lib/utils/errorMessage';
import { formatCurrency, formatDate, formatNumberIt } from '@/lib/utils/formatters';
import { queryKeys } from '@/lib/query/queryKeys';
import { fetchFundAllocations } from '@/lib/utils/fundAllocationClient';
import { usesPublishedFundMix } from '@/lib/utils/fundComposition';
import { describeFundComposition } from '@/lib/utils/fundCompositionLabel';
import {
  applyTrTickerOverride,
  buildTrImportPlan,
  mapTrType,
  resolveTrYahooTicker,
  TR_CASH_ACCOUNT_NAME,
  TR_CASH_TICKER,
  type TrCashInput,
  type TrHoldingInput,
  type TrImportPlan,
  type TrSavingsPlanInput,
} from '@/lib/utils/tradeRepublicImport';
import {
  getBrokerConnection,
  saveBrokerConnection,
  type BrokerConnection,
} from '@/lib/services/brokerConnectionService';
import { createAsset, getAllAssets, updateAsset, updateAssetMetadata } from '@/lib/services/assetService';
import type { Asset } from '@/types/assets';

interface TradeRepublicConnectionTileProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

const BROKER = 'traderepublic' as const;

const KIND_LABEL: Record<TrImportPlan['holdings'][number]['kind'], string> = {
  new: 'Nuovo',
  'drift-only': 'Scostamento quantità',
  'composition-update': 'Composizione',
  unchanged: 'Invariato',
};

const NEW_CASH_VALUE = '__new__';

const INTERVAL_LABEL: Record<string, string> = {
  monthly: 'ogni mese',
  weekly: 'ogni settimana',
  quarterly: 'ogni trimestre',
  yearly: 'ogni anno',
};

function findTrCash(assets: Asset[], ticker: string): Asset | undefined {
  return assets.find((a) => a.type === 'cash' && a.assetClass === 'cash' && a.ticker === ticker);
}

// ─── The read + login transport ──────────────────────────────────────────────

async function readTradeRepublic(
  ownerId: string,
  command: 'positions' | 'cash' | 'savingsPlans'
): Promise<Record<string, unknown>> {
  const response = await authenticatedFetch('/api/broker/traderepublic/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId, command }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Lettura non riuscita: riprova.'
    );
  }
  // A missing key is a CONTRACT break, not an empty reading: defaulting it to `[]` made a
  // mismatched response read as «zero posizioni» on the Scalable side, so it is refused here too.
  if (command === 'positions' && !Array.isArray(data?.positions)) {
    throw new Error('Lettura delle posizioni non riuscita: riprova.');
  }
  if (command === 'cash' && !Array.isArray(data?.balances)) {
    throw new Error('Lettura della liquidità non riuscita: riprova.');
  }
  if (command === 'savingsPlans' && !Array.isArray(data?.savingsPlans)) {
    throw new Error('Lettura dei piani di accumulo non riuscita: riprova.');
  }
  return data as Record<string, unknown>;
}

type QrStatus = 'pending' | 'scanned' | 'approved' | 'failed' | 'expired';

interface QrView {
  id: string;
  status: QrStatus;
  qrDataUrl?: string;
  qrPayload?: string;
  challengeExpiresAt?: string;
  error?: string;
}

async function startTradeRepublicLogin(ownerId: string): Promise<QrView> {
  const response = await authenticatedFetch('/api/broker/traderepublic/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Collegamento non riuscito: riprova.'
    );
  }
  return data as QrView;
}

async function readTradeRepublicLoginStatus(
  ownerId: string,
  sessionId: string
): Promise<QrView | null> {
  const response = await authenticatedFetch(
    `/api/broker/traderepublic/login/status?sessionId=${encodeURIComponent(sessionId)}&ownerId=${encodeURIComponent(ownerId)}`
  );
  // 404 means the server forgot the IN-FLIGHT approval (a restart): the UI restarts the flow
  // rather than showing a failure, because the user's next action is identical either way.
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Stato del collegamento non disponibile.'
    );
  }
  return data as QrView;
}

async function isTradeRepublicConnected(ownerId: string): Promise<boolean> {
  const response = await authenticatedFetch(
    `/api/broker/traderepublic/session?ownerId=${encodeURIComponent(ownerId)}`
  );
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data?.connected === true;
}

/**
 * Revoke the session. A live trading session that cannot be taken back is a defect, not an
 * omission: it renews itself, so «Ricollega» does not help — only a revoke does.
 */
async function revokeTradeRepublicSession(ownerId: string): Promise<void> {
  const response = await authenticatedFetch('/api/broker/traderepublic/session', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Revoca non riuscita: riprova.'
    );
  }
}

// ─── The tile ────────────────────────────────────────────────────────────────

/** What a Trade Republic save did, for the metadata and the toast. */
interface TrSaveResult {
  createdAssets: number;
  repairedTickers: number;
  filledCompositions: number;
  cashBalance?: number;
  cashAssetId?: string;
}

/**
 * The save's writes, out of the component: the React Compiler skips a whole component holding a
 * `?:`/`&&`/`??` inside a `try` (AGENTS.md § Motion), and this body is made of them.
 */
async function applyTrPlan(
  ownerId: string,
  plan: TrImportPlan,
  assets: Asset[],
  tickerOverrides: Record<string, string>,
  cashTarget: string
): Promise<TrSaveResult> {
  let createdAssets = 0;
  let repairedTickers = 0;
  let filledCompositions = 0;
  for (const diff of plan.holdings) {
    // No price write: this broker publishes no quote, so there is nothing to compare or patch.
    if (diff.kind === 'new') {
      await createAsset(ownerId, applyTrTickerOverride(diff.formData, tickerOverrides[diff.holding.isin]));
      createdAssets += 1;
    } else if (diff.existingAssetId) {
      // Self-healing. A tracked asset whose ticker is still the raw broker id a past sync
      // wrote (the ISIN, or a crypto pseudo-ISIN) is UNQUOTABLE, so it would sit at 0 with
      // a permanent -100% G/P. When this sync resolved a real Yahoo symbol — the route's
      // `yahooTicker` (broker quote, table) first, the pure resolver otherwise —
      // write it together with the quote just read, so the position prices at once instead
      // of at the next refresh. A hand-fixed ticker (anything that is no longer the ISIN)
      // is NEVER touched: the user knows better than the sync. This is what makes a
      // re-sync enough — no delete, no retyping.
      const resolved = diff.holding.yahooTicker ?? resolveTrYahooTicker(diff.holding);
      const trackedTicker = assets.find((asset) => asset.id === diff.existingAssetId)?.ticker;
      const shouldRepairTicker = Boolean(
        resolved &&
          diff.holding.price !== undefined &&
          trackedTicker === diff.holding.isin &&
          trackedTicker !== resolved
      );
      if (!shouldRepairTicker && !diff.compositionUpdate) continue;
      // The published composition rides on the same write as a ticker repair: both are
      // metadata. taxRate and displayTicker are carried along because
      // `updateAssetMetadata` treats an absent one as a request to DELETE it (the import
      // must not wipe a cost-basis rate or an alias).
      await updateAssetMetadata(diff.existingAssetId, {
        ...(shouldRepairTicker && resolved
          ? { ticker: resolved, currentPrice: diff.holding.price }
          : {}),
        ...(diff.compositionUpdate ? { composition: diff.formData.composition } : {}),
        taxRate: diff.existingTaxRate,
        displayTicker: diff.existingDisplayTicker ?? undefined,
      });
      if (shouldRepairTicker) repairedTickers += 1;
      if (diff.compositionUpdate) filledCompositions += 1;
    }
  }
  let cashAssetId: string | undefined;
  let cashBalance: number | undefined;
  if (plan.cash) {
    cashBalance = Math.round(plan.cash.balance * 100) / 100;
    if (cashTarget === NEW_CASH_VALUE) {
      cashAssetId = await createAsset(ownerId, {
        ticker: TR_CASH_TICKER,
        displayTicker: TR_CASH_ACCOUNT_NAME,
        name: TR_CASH_ACCOUNT_NAME,
        type: 'cash',
        assetClass: 'cash',
        currency: plan.cash.currency,
        quantity: cashBalance,
        currentPrice: 1,
        isLiquid: true,
        autoUpdatePrice: false,
        exchange: 'Trade Republic',
      });
    } else {
      await updateAsset(cashTarget, { quantity: cashBalance });
      cashAssetId = cashTarget;
    }
  }
  return { createdAssets, repairedTickers, filledCompositions, cashBalance, cashAssetId };
}

function trConnectionRecord(plan: TrImportPlan, result: TrSaveResult) {
  return {
    holdingsCount: plan.stats.holdingCount,
    savingsPlanCount: plan.stats.savingsPlanCount,
    ...(result.cashBalance !== undefined ? { cashBalance: result.cashBalance } : {}),
    ...(result.cashAssetId ? { cashAssetId: result.cashAssetId } : {}),
    createdAssets: result.createdAssets,
    // No price was read, so nothing was updated: recorded as absent rather than as a zero,
    // which would read as «prices checked, none moved».
  };
}

function trSavedMessage(result: TrSaveResult): string {
  const repaired = result.repairedTickers > 0 ? `, ${result.repairedTickers} ticker riparati` : '';
  const filled = result.filledCompositions > 0 ? `, ${result.filledCompositions} composizioni ricavate` : '';
  return `Sincronizzazione salvata: ${result.createdAssets} nuovi asset${repaired}${filled}.`;
}

/** The list a response carries, or an empty one: a `??` would sit inside the handler's `try`. */
function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const QR_DEAD_STATUSES: readonly string[] = ['failed', 'expired'];

function isQrDead(status: string): boolean {
  return QR_DEAD_STATUSES.includes(status);
}

function qrFailureText(view: { error?: string }): string {
  return view.error ?? 'Collegamento non riuscito: riprova.';
}

export function TradeRepublicConnectionTile({ ownerId, disabled = false }: TradeRepublicConnectionTileProps) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TrImportPlan | null>(null);
  const [cashTarget, setCashTarget] = useState<string>(NEW_CASH_VALUE);
  /**
   * Per-row Yahoo-symbol corrections, keyed by holding ISIN. Yahoo cannot quote an ISIN, so a
   * position without a broker price would otherwise be created with an unquotable ticker and
   * sit at 0 forever. Reset with every plan: an override belongs to the preview that showed
   * it, and a stale one would silently re-point the next sync's asset.
   */
  const [tickerOverrides, setTickerOverrides] = useState<Record<string, string>>({});
  /**
   * A failed SAVINGS-PLAN read is declared, not swallowed: positions and cash still sync, and the
   * preview says the plans were left out. A read that silently returned nothing would read as
   * «you have no savings plans», which is a claim about the user's money.
   */
  const [savingsPlanWarning, setSavingsPlanWarning] = useState<string | null>(null);
  const [qr, setQr] = useState<QrView | null>(null);
  const [linking, setLinking] = useState(false);
  const [revoking, setRevoking] = useState(false);
  /** The trade-ledger import is a separate modal, not a step of the portfolio sync above. */
  const [tradeImportOpen, setTradeImportOpen] = useState(false);
  /**
   * Whether a SESSION exists, asked of the server — not inferred from the sync metadata, which
   * would call someone «non collegato» for having linked and not yet pressed Sincronizza.
   */
  const [connected, setConnected] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [conn, allAssets, isConnected] = await Promise.all([
        getBrokerConnection(ownerId, BROKER),
        getAllAssets(ownerId),
        isTradeRepublicConnected(ownerId),
      ]);
      setConnection(conn);
      setAssets(allAssets);
      setConnected(isConnected);
    } catch (err) {
      console.error('[TradeRepublicConnectionTile] load failed:', err);
      toast.error('Impossibile caricare i collegamenti broker');
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const buildPlan = useCallback(
    async (
      holdings: TrHoldingInput[],
      balances: TrCashInput[],
      savingsPlans: TrSavingsPlanInput[],
      savingsPlanWarningText: string | null
    ) => {
      // One extra round trip BEFORE the preview: Yahoo's published mix for every fund in the
      // payload (from the shared per-ticker cache), so a hybrid ETF is created already split
      // across classes instead of landing on one class by name. Fail-soft: an unread ISIN is
      // simply absent, and the row keeps its name-based class.
      const fundIsins = holdings
        .filter((holding) => usesPublishedFundMix(mapTrType(holding.rawType, holding.rawCategory).type))
        .map((holding) => holding.isin);
      const { allocations } = await fetchFundAllocations(fundIsins);
      setPlan(buildTrImportPlan(holdings, balances, savingsPlans, assets, allocations));
      setTickerOverrides({});
      const existingCash = findTrCash(assets, TR_CASH_TICKER);
      setCashTarget(existingCash ? existingCash.id : NEW_CASH_VALUE);
      setSavingsPlanWarning(savingsPlanWarningText);
      setError(null);
    },
    [assets]
  );

  const handleSync = async () => {
    if (disabled) return;
    setSyncing(true);
    setError(null);
    try {
      // The savings plans are deliberately NOT in this Promise.all: a failure there must not cost
      // the user their positions and cash, the way a rejected third read would.
      const [positionsRes, cashRes, plansRes] = await Promise.all([
        readTradeRepublic(ownerId, 'positions'),
        readTradeRepublic(ownerId, 'cash'),
        readTradeRepublic(ownerId, 'savingsPlans').then(
          (r) => ({ plans: r['savingsPlans'] as TrSavingsPlanInput[], warning: null as string | null }),
          (err: unknown) => ({
            plans: [] as TrSavingsPlanInput[],
            warning: failureWarning(err, 'Piani di accumulo non letti'),
          })
        ),
      ]);
      await buildPlan(
        listOf<TrHoldingInput>(positionsRes['positions']),
        listOf<TrCashInput>(cashRes['balances']),
        plansRes.plans,
        plansRes.warning
      );
      // No auto-import: the preview IS the confirmation step, and calling the save right after
      // `setPlan` would close over the PREVIOUS plan (the stale-closure bug the Scalable tile
      // documents at the same line).
      toast.success('Anteprima pronta: controlla le righe e salva.');
    } catch (err) {
      setError(errorMessage(err, 'Lettura non riuscita: riprova.'));
    }
    setSyncing(false);
  };

  const handleStartLogin = async () => {
    if (disabled) return;
    setLinking(true);
    setError(null);
    try {
      setQr(await startTradeRepublicLogin(ownerId));
    } catch (err) {
      setError(errorMessage(err, 'Collegamento non riuscito: riprova.'));
    }
    setLinking(false);
  };

  /**
   * Polls while the user scans and approves. The interval's only state path is the async
   * callback, never a synchronous set in the effect body, and it stops itself as soon as the
   * status is no longer live. The deps are the two PRIMITIVES, not the object: a dep on `qr`
   * would rebuild the interval on every poll tick and starve it.
   */
  const qrId = qr?.id ?? null;
  const qrStatus = qr?.status ?? null;
  useEffect(() => {
    if (!qrId || (qrStatus !== 'pending' && qrStatus !== 'scanned')) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await readTradeRepublicLoginStatus(ownerId, qrId);
          if (!next) {
            setQr(null);
            setError('Il server non ricorda più il collegamento: riavvialo per un nuovo codice.');
            return;
          }
          // A rotated payload arrives as a new image: replace it, never keep the first.
          setQr(next);
          if (next.status === 'approved') {
            setQr(null);
            toast.success('Collegamento completato: ora puoi sincronizzare.');
            await loadAll();
            setConnected(true);
          } else if (isQrDead(next.status)) {
            setQr(null);
            setError(qrFailureText(next));
          }
        } catch (err) {
          setError(errorMessage(err, 'Stato del collegamento non disponibile.'));
        }
      })();
    }, 2500);
    return () => clearInterval(timer);
  }, [qrId, qrStatus, ownerId, loadAll]);

  const handleRevoke = async () => {
    if (disabled) return;
    setRevoking(true);
    try {
      await revokeTradeRepublicSession(ownerId);
      setConnected(false);
      setPlan(null);
      await loadAll();
      toast.success('Sessione revocata: questo server non legge più il conto.');
    } catch (err) {
      setError(errorMessage(err, 'Revoca non riuscita: riprova.'));
    }
    setRevoking(false);
  };

  const handleSave = async () => {
    if (!plan || disabled) return;
    setSaving(true);
    try {
      const saved = await applyTrPlan(ownerId, plan, assets, tickerOverrides, cashTarget);
      await saveBrokerConnection(ownerId, trConnectionRecord(plan, saved), BROKER);

      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
      setPlan(null);
      await loadAll();
      toast.success(trSavedMessage(saved));
    } catch (err) {
      console.error('[TradeRepublicConnectionTile] save failed:', err);
      // A partial save may already have created the cash account, so the in-memory `assets` are
      // stale: keeping them would make the retry create a duplicate. Re-read and drop the preview.
      await loadAll();
      setPlan(null);
      toast.error('Salvataggio non riuscito: riprova con Sincronizza.');
    }
    setSaving(false);
  };

  const cashAssets = assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash');
  /**
   * NEW positions whose ticker is still the raw broker id — unquotable on refresh. Priced or
   * not: a broker-priced position with an ISIN ticker would freeze at the sync price (the
   * refresh quotes the ticker, not the ISIN), so it needs the symbol field exactly as much
   * as an unpriced one does.
   */
  const needsTickerCount =
    plan?.holdings.filter((diff) => diff.kind === 'new' && diff.formData.ticker === diff.holding.isin)
      .length ?? 0;
  const reading = loading
    ? null
    : describeBrokerConnections(BROKER, {
        lastSyncAt: connection?.lastSyncAt.toISOString(),
        holdingsCount: connection?.holdingsCount,
        cashBalance: connection?.cashBalance,
        savingsPlanCount: connection?.savingsPlanCount,
      });

  return (
    <Tile
      eyebrow="Trade Republic"
      aside={loading ? undefined : connected ? 'collegato' : 'non collegato'}
      reading={reading}
    >
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSync} disabled={disabled || syncing || loading} className="h-10">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Lettura…' : 'Sincronizza'}
          </Button>
          {!qr && (
            <Button variant="outline" onClick={handleStartLogin} disabled={disabled || linking} className="h-10">
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              {linking ? 'Preparo…' : connected ? 'Ricollega Trade Republic' : 'Collega Trade Republic'}
            </Button>
          )}
          {connected && !qr && (
            /* A session renews ITSELF, so re-linking is not a revocation: this is the only way to
               take the access back from this server. */
            <Button variant="outline" onClick={handleRevoke} disabled={disabled || revoking} className="h-10">
              {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {revoking ? 'Revoco…' : 'Scollega'}
            </Button>
          )}
          {disabled && (
            <span className="text-xs text-muted-foreground">Modalità demo: sincronizzazione disattivata.</span>
          )}
        </div>

        {/* The ledger import is a SEPARATE act from the portfolio sync, and a second button rather
            than another step inside «Sincronizza» for one reason: the two write different things.
            The sync reconciles positions and cash and never touches the trade ledger; the import is
            the only path that writes operations, and it previews before it does. One button would
            make «I synced» and «I imported my history» indistinguishable in the toast, and the
            second is the one that changes plusvalenze. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            onClick={() => setTradeImportOpen(true)}
            disabled={disabled || !connected}
            className="h-10"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Importa operazioni
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Porta acquisti e vendite nel registro operazioni.
          </span>
        </div>

        {qr && (
          <div className="flex flex-col gap-3 rounded-lg bg-muted p-3">
            <p className="text-[13px] leading-[1.45]">
              Apri l’app Trade Republic e scansione il codice con la funzione di login. L’approvazione
              resta nell’app: qui non ti viene chiesto nessun segreto.
            </p>
            {qr.qrDataUrl ? (
              // `unoptimized` because the src is an inline data URL: there is nothing to fetch and
              // nothing to resize, and the optimization pass would only add a failure mode to a
              // picture the phone has to read.
              <Image
                src={qr.qrDataUrl}
                alt="Codice QR per collegare l’account Trade Republic"
                width={192}
                height={192}
                unoptimized
                className="h-48 w-48 self-start rounded-md bg-white"
              />
            ) : (
              <p className="text-[12px] text-muted-foreground">Preparo il codice…</p>
            )}
            {/* The payload, because a QR needs a SECOND device: a reader on a phone cannot scan
                the screen in front of them, and a dead end here would look like a broken feature. */}
            {qr.qrPayload && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tr-qr-payload" className="text-[12px]">
                  Non puoi scansionare? Apri questo collegamento
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" className="h-10">
                    <a href={qr.qrPayload} target="_blank" rel="noreferrer noopener">
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                      Apri il collegamento
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10"
                    onClick={() => {
                      void navigator.clipboard?.writeText(qr.qrPayload ?? '');
                      toast.success('Collegamento copiato.');
                    }}
                  >
                    Copia
                  </Button>
                </div>
              </div>
            )}
            {qr.challengeExpiresAt && (
              <p className="text-[12px] text-muted-foreground">
                Il codice scade il {formatDate(new Date(qr.challengeExpiresAt))}.
              </p>
            )}
            <p role="status" aria-live="polite" className="text-[12px] text-muted-foreground">
              {qr.status === 'scanned'
                ? 'Codice letto: approva il collegamento nell’app Trade Republic.'
                : 'In attesa della scansione…'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setQr(null)} className="h-8 self-start text-[11px]">
              Annulla
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
            {error}
          </p>
        )}

        {plan && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium">
              Anteprima: {plan.stats.newCount} nuovi
              {plan.stats.driftCount > 0 && `, ${plan.stats.driftCount} scostamenti di quantità`}
              {plan.stats.compositionUpdateCount > 0 &&
                `, ${plan.stats.compositionUpdateCount} composizioni da completare`}
              {plan.stats.unchangedCount > 0 && `, ${plan.stats.unchangedCount} invariati`}
              {plan.stats.savingsPlanCount > 0 && `, ${plan.stats.savingsPlanCount} piani di accumulo`}.
            </p>

            {plan.holdings.length > 0 && (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {plan.holdings.map((diff) => (
                  <li
                    key={diff.holding.isin}
                    className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[13px]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{diff.holding.name}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {diff.holding.isin} · {diff.holding.quantity} quote ·{' '}
                        {diff.holding.price !== undefined
                          ? `${formatNumberIt(diff.holding.price, 4)} ${diff.holding.currency}`
                          : 'prezzo non disponibile'}
                      </span>
                      {diff.kind === 'drift-only' && (
                        <span className="block text-[12px] text-warning-foreground">
                          Nel Registro: scostamento di {diff.quantityDrift} quote — da riconciliare a mano.
                        </span>
                      )}
                      {diff.typeUncertain && diff.kind === 'new' && (
                        <span className="block text-[12px] text-warning-foreground">
                          Tipo non riconosciuto: proposto come ETF, verifica su Patrimonio.
                        </span>
                      )}
                      {(diff.kind === 'new' || diff.compositionUpdate) &&
                        (diff.formData.composition?.length ?? 0) > 0 && (
                          <span className="block text-[12px] text-muted-foreground">
                            Composizione dall&apos;ISIN: {describeFundComposition(diff.formData.composition)}
                          </span>
                        )}
                    </span>
                    <span className="flex-none text-[12px] text-muted-foreground">{KIND_LABEL[diff.kind]}</span>
                  </li>
                ))}
              </ul>
            )}

            {plan.holdings.some(
              (diff) => diff.kind === 'new' && diff.formData.ticker === diff.holding.isin
            ) && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                <p className="text-[13px] font-medium">
                  {needsTickerCount === 1
                    ? '1 posizione con ticker da sistemare'
                    : `${needsTickerCount} posizioni con ticker da sistemare`}
                </p>
                <p className="text-[12px] leading-[1.45] text-muted-foreground">
                  Yahoo non quota gli ISIN: scrivi qui il simbolo con cui lo strumento è
                  quotato (le quotazioni in euro evitano il cambio), così anche i refresh
                  futuri lo troveranno. Lascia vuoto per usarne uno più tardi su Patrimonio.
                </p>
                <div className="flex flex-col gap-2">
                  {plan.holdings
                    .filter((diff) => diff.kind === 'new' && diff.formData.ticker === diff.holding.isin)
                    .map((diff) => (
                      <div key={diff.holding.isin} className="flex items-center gap-2">
                        <Label
                          htmlFor={`tr-ticker-${diff.holding.isin}`}
                          className="w-44 flex-none truncate text-[12px]"
                        >
                          {diff.holding.name}
                        </Label>
                        <Input
                          id={`tr-ticker-${diff.holding.isin}`}
                          value={tickerOverrides[diff.holding.isin] ?? diff.formData.ticker}
                          onChange={(event) =>
                            setTickerOverrides((previous) => ({
                              ...previous,
                              [diff.holding.isin]: event.target.value,
                            }))
                          }
                          placeholder="es. VWCE.MI, AAPL, BTC-EUR"
                          className="h-10 flex-1 font-mono text-[12px]"
                          disabled={disabled}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {plan.cash && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                <Label htmlFor="tr-cash-target" className="text-[13px]">
                  Liquidità rilevata: {formatCurrency(plan.cash.balance, plan.cash.currency)} — conto di
                  destinazione
                </Label>
                <Select value={cashTarget} onValueChange={setCashTarget} disabled={disabled}>
                  <SelectTrigger id="tr-cash-target" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_CASH_VALUE}>Crea «{TR_CASH_ACCOUNT_NAME}»</SelectItem>
                    {cashAssets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {asset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {plan.savingsPlans.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                <p className="text-[13px] font-medium">Piani di accumulo</p>
                <ul className="flex flex-col divide-y divide-border">
                  {plan.savingsPlans.map(({ plan: sp, trackedAssetName }) => (
                    <li key={sp.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {trackedAssetName ?? sp.isin ?? sp.instrumentId}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {formatCurrency(sp.amount, 'EUR')} {INTERVAL_LABEL[sp.interval] ?? sp.interval}
                          {sp.nextExecutionDate &&
                            ` · prossimo ${formatDate(new Date(sp.nextExecutionDate))}`}
                          {sp.paused && ' · in pausa'}
                        </span>
                      </span>
                      {sp.paused && (
                        <span className="flex-none text-[12px] text-muted-foreground">In pausa</span>
                      )}
                    </li>
                  ))}
                </ul>
                {/* Declared, not stored: a standing order is a broker-side rule and no Asset field
                    holds one, so nothing here is written on save. */}
                <p className="text-[12px] leading-[1.45] text-muted-foreground">
                  Sono regolarmente attive sul broker: restano lì e non vengono scritte in questa app.
                </p>
              </div>
            )}

            {savingsPlanWarning && (
              <p role="status" className="text-[12px] leading-[1.45] text-warning-foreground">
                {savingsPlanWarning} Gli altri dati sono stati sincronizzati.
              </p>
            )}

            {plan.warnings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {plan.warnings.map((warning, index) => (
                  <li key={index} className="text-[12px] leading-[1.45] text-muted-foreground">
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={disabled || saving} className="h-10">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Salvataggio…' : 'Salva nel patrimonio'}
              </Button>
              <Button variant="outline" onClick={() => setPlan(null)} disabled={saving} className="h-10">
                Scarta
              </Button>
            </div>
          </div>
        )}
      </div>
      <BrokerTradeImportDialog
        open={tradeImportOpen}
        onClose={() => setTradeImportOpen(false)}
        ownerId={ownerId}
        source="traderepublic"
        brokerName="Trade Republic"
      />
    </Tile>
  );
}
