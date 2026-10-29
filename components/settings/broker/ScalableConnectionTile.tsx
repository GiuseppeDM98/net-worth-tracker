/**
 * The Scalable Capital half of «Collegamenti» — read-only sync through the `sc` CLI on the server.
 *
 * One provider, one component: the sibling `TradeRepublicConnectionTile` is the same shape for a
 * broker reachable over HTTP, and the section that owns both is `BrokerConnectionsSection`. They
 * were one file until the second provider arrived, and a single 700-line component with a
 * provider switch inside it would have made every Scalable edit a merge hazard.
 *
 * Two ways in, one plan out. «Sincronizza» calls POST /api/broker/scalable/read (the server runs
 * ONLY the three whitelisted read commands under the caller's own broker profile — one
 * `XDG_CONFIG_HOME` per whitelisted email, so two people on one host never share a session).
 * Otherwise — hosted run, missing binary — the same plan is built from pasted `--json` output.
 * Either way the preview is explicit and saving writes through the standard asset services:
 *   - new positions → createAsset (broker-fed: autoUpdatePrice false)
 *   - price moves → updateAssetMetadata (currentPrice only)
 *   - quantity mismatches on ledger types → drift warning, never a write
 *   - cash residual → a cash account (create or quantity update; cash is not a ledger type)
 *   - the overnight «Deposito non vincolato» → ITS OWN cash account, never merged into the
 *     residual: a different balance at the broker, paying interest on its own schedule
 *
 * Only sync metadata is persisted (brokerConnections/{ownerId}): never tokens, never raw output.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  buildScalableImportPlan,
  type ScalableImportPlan,
  mapScalableType,
  parseScalableHoldingsJson,
  parseScalableOverviewJson,
  parseScalableOvernightJson,
  SCALABLE_CASH_ACCOUNT_NAME,
  SCALABLE_CASH_TICKER,
  SCALABLE_DEPOSIT_ACCOUNT_NAME,
  SCALABLE_DEPOSIT_TICKER,
  ScalableHoldingInput,
  ScalableOvernightInput,
  ScalableOverviewInput,
  ScalableParseError,
  type HoldingDiffKind,
} from '@/lib/utils/scalableImport';
import {
  getBrokerConnection,
  saveBrokerConnection,
  type BrokerConnection,
} from '@/lib/services/brokerConnectionService';
import {
  createAsset,
  getAllAssets,
  updateAsset,
  updateAssetMetadata,
} from '@/lib/services/assetService';
import type { Asset } from '@/types/assets';

interface ScalableConnectionTileProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

const KIND_LABEL: Record<HoldingDiffKind, string> = {
  new: 'Nuovo',
  'price-update': 'Prezzo aggiornato',
  'drift-only': 'Scostamento quantità',
  'price-and-drift': 'Prezzo + scostamento',
  'composition-update': 'Composizione',
  unchanged: 'Invariato',
};

const SCALABLE_LOGIN_MESSAGE =
  'Collega il tuo account Scalable Capital per sincronizzare il portafoglio.';

const NEW_CASH_VALUE = '__new__';

/**
 * The two Scalable cash accounts are told apart by the ticker the sync WRITES, never by the
 * name the user may have edited. The overnight deposit is a separate balance at the broker, so
 * it gets its own account; matching both by the shared `exchange` would cross-wire them.
 */
function findScalableCash(assets: Asset[], ticker: string): Asset | undefined {
  return assets.find((a) => a.type === 'cash' && a.assetClass === 'cash' && a.ticker === ticker);
}

/** The /api/scalable/status enum, in the user's language: never show the raw English key. */
const BACKEND_STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'collegato',
  CONNECTING: 'collegamento in corso',
  NOT_CONNECTED: 'non collegato',
  AUTHENTICATION_REQUIRED: 'sessione scaduta: ricollega',
  ERROR: 'stato non verificabile',
};

async function postReadCommand(
  ownerId: string,
  command: 'holdings' | 'overview' | 'overnight'
): Promise<{
  holdings?: ScalableHoldingInput[];
  overview?: ScalableOverviewInput;
  overnight?: ScalableOvernightInput;
}> {
  const response = await authenticatedFetch('/api/broker/scalable/read', {
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
  // A missing key is a CONTRACT break, not an empty reading: defaulting it to `[]`/`null` made a
  // mismatched response read as «zero posizioni» and «nessuna liquidità» instead of failing.
  if (command === 'holdings' && !Array.isArray(data?.holdings)) {
    throw new Error('Lettura delle posizioni non riuscita: riprova.');
  }
  if (command === 'overview' && !data?.overview) {
    throw new Error('Lettura dei totali non riuscita: riprova.');
  }
  if (command === 'overnight' && !data?.overnight) {
    throw new Error('Lettura del deposito non riuscita: riprova.');
  }
  return data;
}

type LoginStatus = 'pending' | 'approved' | 'failed' | 'expired';

interface LoginView {
  id: string;
  status: LoginStatus;
  verificationUri?: string;
  userCode?: string;
  error?: string;
}

async function startScalableLogin(ownerId: string): Promise<LoginView> {
  const response = await authenticatedFetch('/api/broker/scalable/login/start', {
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
  return data as LoginView;
}

async function readScalableLoginStatus(ownerId: string, sessionId: string): Promise<LoginView | null> {
  const response = await authenticatedFetch(
    `/api/broker/scalable/login/status?sessionId=${encodeURIComponent(sessionId)}&ownerId=${encodeURIComponent(ownerId)}`
  );
  // 404 means the server forgot the session (a restart): the UI restarts the flow rather than
  // showing a failure, because the user's next action is identical either way.
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Stato del collegamento non disponibile.'
    );
  }
  return data as LoginView;
}

/** What a Scalable save did, for the metadata and the toast. */
interface ScalableSaveResult {
  createdAssets: number;
  updatedPrices: number;
  filledCompositions: number;
  cashBalance?: number;
  cashAssetId?: string;
  depositBalance?: number;
  depositAssetId?: string;
}

/**
 * The save's writes, out of the component: the React Compiler skips a whole component holding a
 * `?:`/`&&`/`??` inside a `try` (AGENTS.md § Motion), and this body is made of them.
 */
async function applyScalablePlan(
  ownerId: string,
  plan: ScalableImportPlan,
  cashTarget: string,
  depositTarget: string
): Promise<ScalableSaveResult> {
  let createdAssets = 0;
  let updatedPrices = 0;
  let filledCompositions = 0;
  for (const diff of plan.holdings) {
    if (diff.kind === 'new') {
      await createAsset(ownerId, diff.formData);
      createdAssets += 1;
      continue;
    }
    if (!diff.existingAssetId) continue;
    const shouldWritePrice = diff.kind === 'price-update' || diff.kind === 'price-and-drift';
    // An unchanged row with the right symbol and no composition to fill has nothing to write.
    if (!shouldWritePrice && !diff.tickerUpdate && !diff.compositionUpdate) continue;
    // The symbol repair and the published composition ride on the same write as the price:
    // both are metadata, and a second write per position would double the sync's Firestore
    // traffic for no extra information. `ticker` is sent ONLY when the plan resolved a
    // different one, so a partial caller can never blank it. taxRate and displayTicker are
    // carried along because `updateAssetMetadata` treats an absent one as a request to
    // DELETE it (the import must not wipe a cost-basis rate or an alias).
    await updateAssetMetadata(diff.existingAssetId, {
      ...(shouldWritePrice ? { currentPrice: diff.holding.price } : {}),
      ...(diff.tickerUpdate ? { ticker: diff.tickerUpdate } : {}),
      ...(diff.compositionUpdate ? { composition: diff.formData.composition } : {}),
      taxRate: diff.existingTaxRate,
      displayTicker: diff.existingDisplayTicker ?? undefined,
    });
    if (shouldWritePrice) updatedPrices += 1;
    if (diff.compositionUpdate) filledCompositions += 1;
  }
  let cashAssetId: string | undefined;
  let cashBalance: number | undefined;
  if (plan.cash) {
    cashBalance = Math.round(plan.cash.balance * 100) / 100;
    if (cashTarget === NEW_CASH_VALUE) {
      cashAssetId = await createAsset(ownerId, {
        ticker: SCALABLE_CASH_TICKER,
        displayTicker: SCALABLE_CASH_ACCOUNT_NAME,
        name: SCALABLE_CASH_ACCOUNT_NAME,
        type: 'cash',
        assetClass: 'cash',
        currency: plan.cash.currency,
        quantity: cashBalance,
        currentPrice: 1,
        isLiquid: true,
        autoUpdatePrice: false,
        exchange: 'Scalable Capital',
      });
    } else {
      await updateAsset(cashTarget, { quantity: cashBalance });
      cashAssetId = cashTarget;
    }
  }

  // The deposit is its OWN account: a different balance at the broker, paying interest on
  // its own schedule. Its rate has no Asset field, so it is declared in the preview, not stored.
  let depositAssetId: string | undefined;
  let depositBalance: number | undefined;
  if (plan.deposit) {
    depositBalance = Math.round(plan.deposit.balance * 100) / 100;
    if (depositTarget === NEW_CASH_VALUE) {
      depositAssetId = await createAsset(ownerId, {
        ticker: SCALABLE_DEPOSIT_TICKER,
        displayTicker: SCALABLE_DEPOSIT_ACCOUNT_NAME,
        name: SCALABLE_DEPOSIT_ACCOUNT_NAME,
        type: 'cash',
        assetClass: 'cash',
        currency: plan.deposit.currency,
        quantity: depositBalance,
        currentPrice: 1,
        isLiquid: true,
        autoUpdatePrice: false,
        exchange: 'Scalable Capital',
      });
    } else {
      await updateAsset(depositTarget, { quantity: depositBalance });
      depositAssetId = depositTarget;
    }
  }
  return {
    createdAssets,
    updatedPrices,
    filledCompositions,
    cashBalance,
    cashAssetId,
    depositBalance,
    depositAssetId,
  };
}

function scalableConnectionRecord(plan: ScalableImportPlan, result: ScalableSaveResult) {
  return {
    holdingsCount: plan.stats.holdingCount,
    skippedCount: plan.stats.skippedCount,
    ...(result.cashBalance !== undefined ? { cashBalance: result.cashBalance } : {}),
    ...(result.cashAssetId ? { cashAssetId: result.cashAssetId } : {}),
    ...(result.depositBalance !== undefined ? { depositBalance: result.depositBalance } : {}),
    ...(result.depositAssetId ? { depositAssetId: result.depositAssetId } : {}),
    ...(plan.deposit?.interestRate !== undefined
      ? { depositInterestRate: plan.deposit.interestRate }
      : {}),
    createdAssets: result.createdAssets,
    updatedPrices: result.updatedPrices,
  };
}

function scalableSavedMessage(result: ScalableSaveResult): string {
  const filled = result.filledCompositions > 0 ? `, ${result.filledCompositions} composizioni ricavate` : '';
  return `Sincronizzazione salvata: ${result.createdAssets} nuovi asset, ${result.updatedPrices} prezzi aggiornati${filled}.`;
}

/** The list a response carries, or an empty one: a `??` would sit inside the handler's `try`. */
function listOf<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function orNull<T>(value: T | null | undefined): T | null {
  return value === undefined ? null : value;
}

/** The status line for the backend session, out of the `try` that fetches it. */
function backendStatusText(data: unknown): string | null {
  const status = (data as { status?: unknown } | null)?.status;
  if (typeof status !== 'string') return null;
  const user = (data as { user?: string }).user;
  return `Sessione ${user || 'Scalable'}: ${BACKEND_STATUS_LABEL[status] ?? status}`;
}

const LOGIN_DEAD_STATUSES: readonly string[] = ['failed', 'expired'];

function isLoginDead(status: string): boolean {
  return LOGIN_DEAD_STATUSES.includes(status);
}

function loginFailureText(view: { error?: string }): string {
  return view.error ?? 'Collegamento non riuscito: riprova.';
}

/** The pasted `sc` output, parsed. The nested try is a module-level one, where the compiler is fine. */
function parsePastedScalable(texts: { holdings: string; overview: string; overnight: string }) {
  const { holdings } = parseScalableHoldingsJson(texts.holdings);
  const overview = texts.overview.trim() !== '' ? parseScalableOverviewJson(texts.overview) : null;
  let overnight: ScalableOvernightInput | null = null;
  let overnightWarning: string | null = null;
  if (texts.overnight.trim() !== '') {
    try {
      overnight = parseScalableOvernightJson(texts.overnight);
    } catch (err) {
      overnightWarning =
        err instanceof ScalableParseError
          ? `Deposito non vincolato non letto: ${err.message}`
          : 'Deposito non vincolato non letto: testo non valido.';
    }
  }
  return { holdings, overview, overnight, overnightWarning };
}

function pasteFailureText(err: unknown): string {
  return err instanceof ScalableParseError
    ? err.message
    : "Testo non valido: ricontrolla l'output incollato.";
}

export function ScalableConnectionTile({ ownerId, disabled = false }: ScalableConnectionTileProps) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [holdingsText, setHoldingsText] = useState('');
  /** The trade-ledger import is a separate modal, not a step of the portfolio sync above. */
  const [tradeImportOpen, setTradeImportOpen] = useState(false);
  const [overviewText, setOverviewText] = useState('');
  const [overnightText, setOvernightText] = useState('');
  const [plan, setPlan] = useState<ReturnType<typeof buildScalableImportPlan> | null>(null);
  const [cashTarget, setCashTarget] = useState<string>(NEW_CASH_VALUE);
  const [depositTarget, setDepositTarget] = useState<string>(NEW_CASH_VALUE);
  const [overnightWarning, setOvernightWarning] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginView | null>(null);
  const [linking, setLinking] = useState(false);

  const checkBackendStatus = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/scalable/status');
      if (res.ok) {
        const data = await res.json();
        const text = backendStatusText(data);
        if (text) setStatusText(text);
      }
    } catch {
      // Non-critical status polling error
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [conn, allAssets] = await Promise.all([
        getBrokerConnection(ownerId, 'scalable'),
        getAllAssets(ownerId),
      ]);
      setConnection(conn);
      setAssets(allAssets);
      await checkBackendStatus();
    } catch (err) {
      console.error('[ScalableConnectionTile] load failed:', err);
      toast.error('Impossibile caricare i collegamenti broker');
    }
    setLoading(false);
  }, [ownerId, checkBackendStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const buildPlan = useCallback(
    async (
      holdings: ScalableHoldingInput[],
      overview: ScalableOverviewInput | null,
      overnight: ScalableOvernightInput | null,
      overnightWarningText: string | null
    ) => {
      // One extra round trip BEFORE the preview: Yahoo's published mix for every fund in the
      // payload (from the shared per-ticker cache), so a hybrid ETF is created already split
      // across classes instead of landing on one class by name. Fail-soft: an unread ISIN is
      // simply absent, and the row keeps its name-based class.
      const fundIsins = holdings
        .filter((holding) => usesPublishedFundMix(mapScalableType(holding.rawType).type))
        .map((holding) => holding.isin);
      const { allocations } = await fetchFundAllocations(fundIsins);
      setPlan(buildScalableImportPlan(holdings, overview, assets, overnight, allocations));
      const existingCash = findScalableCash(assets, SCALABLE_CASH_TICKER);
      const existingDeposit = findScalableCash(assets, SCALABLE_DEPOSIT_TICKER);
      setCashTarget(existingCash ? existingCash.id : NEW_CASH_VALUE);
      setDepositTarget(existingDeposit ? existingDeposit.id : NEW_CASH_VALUE);
      setOvernightWarning(overnightWarningText);
      setError(null);
    },
    [assets]
  );

  const handleSync = async () => {
    if (disabled) return;
    setSyncing(true);
    setError(null);
    try {
      // The overnight read carries its own rejection handler: a user with no overnight
      // account (or a CLI that refuses it) still syncs their positions and broker cash.
      const [holdingsRes, overviewRes, overnightRes] = await Promise.all([
        postReadCommand(ownerId, 'holdings'),
        postReadCommand(ownerId, 'overview'),
        postReadCommand(ownerId, 'overnight').then(
          (r) => ({ overnight: orNull(r.overnight), warning: null as string | null }),
          (err: unknown) => ({
            overnight: null,
            warning: failureWarning(err, 'Deposito non vincolato non letto'),
          })
        ),
      ]);
      await buildPlan(
        listOf(holdingsRes.holdings),
        orNull(overviewRes.overview),
        overnightRes.overnight,
        overnightRes.warning
      );
      // No auto-import: `handleSave` closes over the `plan` of the render it was created in, so
      // calling it right after `setPlan` read the PREVIOUS plan (null on a fresh load) and bailed
      // on its own guard — the write never ran while the toast below claimed it had. The preview
      // is the confirmation step («Salva nel patrimonio»), which is also what the tile's own
      // docstring describes.
      toast.success('Anteprima pronta: controlla le righe e salva.');
    } catch (err) {
      const message = errorMessage(err, 'Lettura non riuscita: riprova.');
      setError(message);
    }
    setSyncing(false);
  };

  const handlePreviewFromText = async () => {
    if (disabled) return;
    setPreparing(true);
    try {
      const { holdings, overview, overnight, overnightWarning } = parsePastedScalable({
        holdings: holdingsText,
        overview: overviewText,
        overnight: overnightText,
      });
      await buildPlan(holdings, overview, overnight, overnightWarning);
      toast.success('Anteprima pronta: controlla le righe prima di salvare.');
    } catch (err) {
      setError(pasteFailureText(err));
    }
    setPreparing(false);
  };

  const handleStartLogin = async () => {
    if (disabled) return;
    setLinking(true);
    setError(null);
    try {
      setLogin(await startScalableLogin(ownerId));
    } catch (err) {
      setError(errorMessage(err, 'Collegamento non riuscito: riprova.'));
    }
    setLinking(false);
  };

  const loginId = login?.id ?? null;
  const loginStatus = login?.status ?? null;
  useEffect(() => {
    if (!loginId || loginStatus !== 'pending') return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await readScalableLoginStatus(ownerId, loginId);
          if (!next) {
            setLogin(null);
            setError('Il server non ricorda più il collegamento: riavvialo per un nuovo codice.');
            return;
          }
          setLogin(next);
          if (next.status === 'approved') {
            setLogin(null);
            toast.success('Collegamento completato: ora puoi sincronizzare.');
            await loadAll();
          } else if (isLoginDead(next.status)) {
            setLogin(null);
            setError(loginFailureText(next));
          }
        } catch (err) {
          setError(errorMessage(err, 'Stato del collegamento non disponibile.'));
        }
      })();
    }, 2500);
    return () => clearInterval(timer);
  }, [loginId, loginStatus, ownerId, loadAll]);

  const handleSave = async () => {
    if (!plan || disabled) return;
    setSaving(true);
    try {
      const saved = await applyScalablePlan(ownerId, plan, cashTarget, depositTarget);
      await saveBrokerConnection(ownerId, scalableConnectionRecord(plan, saved), 'scalable');
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
      setPlan(null);
      await loadAll();
      toast.success(scalableSavedMessage(saved));
    } catch (err) {
      console.error('[ScalableConnectionTile] save failed:', err);
      // A partial save can have ALREADY created the cash/deposit accounts, so the in-memory
      // `assets` (and the plan's «create new» targets) are stale: keeping them would make the
      // retry create duplicates. Re-read and drop the preview — the next «Sincronizza» resolves
      // the targets again, this time against what actually exists.
      await loadAll();
      setPlan(null);
      toast.error('Salvataggio non riuscito: riprova con Sincronizza.');
    }
    setSaving(false);
  };

  const cashAssets = assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash');
  const reading = loading
    ? null
    : describeBrokerConnections('scalable', {
        lastSyncAt: connection?.lastSyncAt.toISOString(),
        holdingsCount: connection?.holdingsCount,
        cashBalance: connection?.cashBalance,
      });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tile
        eyebrow="Scalable Capital"
        aside={loading ? undefined : connection ? 'collegato' : 'non collegato'}
        reading={reading}
      >
        <div className="mt-3 flex flex-col gap-3">
          {statusText && (
            <p className="text-[12px] font-medium text-muted-foreground">{statusText}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSync} disabled={disabled || syncing || preparing || loading} className="h-10">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Lettura…' : 'Sincronizza'}
            </Button>
            {!login && (
              <Button
                variant="outline"
                onClick={handleStartLogin}
                disabled={disabled || linking}
                className="h-10"
              >
                {linking && <Loader2 className="h-4 w-4 animate-spin" />}
                {linking ? 'Preparo…' : connection ? 'Ricollega Scalable' : 'Collega Scalable'}
              </Button>
            )}
            {disabled && (
              <span className="text-xs text-muted-foreground">Modalità demo: sincronizzazione disattivata.</span>
            )}
          </div>

          {/* The ledger import is a SEPARATE act from the portfolio sync, and a second button rather
              than another step inside «Sincronizza» for one reason: the two write different things.
              The sync reconciles positions and cash and never touches the trade ledger; the import
              is the only path that writes operations, and it previews before it does. One button
              would make «I synced» and «I imported my history» indistinguishable in the toast, and
              the second is the one that changes plusvalenze.
              Gated on `connection` (a live `sc` session) and NOT offered in the pasted-JSON path:
              a hand-pasted payload has no detail reads behind it, so there is nothing to import
              without the CLI. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              onClick={() => setTradeImportOpen(true)}
              disabled={disabled || !connection}
              className="h-10"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Importa operazioni
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Porta acquisti e vendite nel registro operazioni.
            </span>
          </div>

          {login?.verificationUri && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <p className="text-[13px] leading-[1.45]">
                Apri il link di Scalable, accedi con le tue credenziali e conferma il codice: la
                sessione si salva su questo server per il tuo account Google e non ti viene chiesto nessun segreto qui.
              </p>
              <Button asChild variant="default" className="h-10 self-start">
                <a href={login.verificationUri} target="_blank" rel="noreferrer noopener">
                  Apri il collegamento sicuro
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              <p className="text-[12px] text-muted-foreground">
                Codice: <span className="font-mono text-[15px] font-semibold text-foreground">{login.userCode}</span>
              </p>
              <p role="status" aria-live="polite" className="text-[12px] text-muted-foreground">
                In attesa della conferma nel browser…
              </p>
              <Button variant="ghost" size="sm" onClick={() => setLogin(null)} className="h-8 self-start text-[11px]">
                Annulla
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
              {typeof error === 'string'
                ? error
                : error && typeof error === 'object' && 'message' in error
                  ? (error as { message: string }).message
                  : SCALABLE_LOGIN_MESSAGE}
            </p>
          )}

          {plan && (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium">
                Anteprima: {plan.stats.newCount} nuovi, {plan.stats.priceUpdateCount} prezzi da
                aggiornare
                {plan.stats.driftCount > 0 && `, ${plan.stats.driftCount} scostamenti di quantità`}
                {plan.stats.compositionUpdateCount > 0 &&
                  `, ${plan.stats.compositionUpdateCount} composizioni da completare`}
                {plan.stats.unchangedCount > 0 && `, ${plan.stats.unchangedCount} invariati`}
                {plan.stats.tickerUpdateCount > 0 &&
                  `, ${plan.stats.tickerUpdateCount} ticker ISIN da sostituire col simbolo Yahoo`}
                .
              </p>
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {plan.holdings.map((diff) => (
                  <li
                    key={diff.holding.isin}
                    className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[13px]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{diff.holding.name}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {diff.holding.isin} · {diff.holding.quantity} quote · {diff.holding.price}{' '}
                        {diff.holding.currency}
                      </span>
                      {(diff.kind === 'drift-only' || diff.kind === 'price-and-drift') && (
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
                    <span className="flex-none text-[12px] text-muted-foreground">
                      {KIND_LABEL[diff.kind]}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.cash && (
                <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                  <Label htmlFor="scalable-cash-target" className="text-[13px]">
                    Liquidità rilevata: {formatCurrency(plan.cash.balance, plan.cash.currency)} — conto di
                    destinazione
                  </Label>
                  <Select value={cashTarget} onValueChange={setCashTarget} disabled={disabled}>
                    <SelectTrigger id="scalable-cash-target" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_CASH_VALUE}>Crea «{SCALABLE_CASH_ACCOUNT_NAME}»</SelectItem>
                      {cashAssets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {plan.deposit && (
                <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                  <Label htmlFor="scalable-deposit-target" className="text-[13px]">
                    Deposito non vincolato: {formatCurrency(plan.deposit.balance, plan.deposit.currency)} —
                    conto di destinazione
                  </Label>
                  <p className="text-[12px] leading-[1.45] text-muted-foreground">
                    {plan.deposit.displayName ?? 'Deposito'}
                    {plan.deposit.interestRate !== undefined &&
                      ` · rendimento annuo ${formatNumberIt(plan.deposit.interestRate * 100, 2)}%`}
                    {plan.deposit.nextPayoutDate &&
                      ` · prossimo pagamento ${formatDate(new Date(plan.deposit.nextPayoutDate))}`}
                    {plan.deposit.estimatedNextPayoutAmount !== undefined &&
                      ` (${formatCurrency(plan.deposit.estimatedNextPayoutAmount, plan.deposit.currency)})`}
                    . Il rendimento e la data sono dichiarati qui: restano nel broker.
                  </p>
                  <Select value={depositTarget} onValueChange={setDepositTarget} disabled={disabled}>
                    <SelectTrigger id="scalable-deposit-target" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_CASH_VALUE}>Crea «{SCALABLE_DEPOSIT_ACCOUNT_NAME}»</SelectItem>
                      {cashAssets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {overnightWarning && (
                <p role="status" className="text-[12px] leading-[1.45] text-warning-foreground">
                  {overnightWarning} Gli altri dati sono stati sincronizzati.
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

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[12px] leading-[1.45] text-muted-foreground">
              Senza server locale (o se «Sincronizza» fallisce): esegui sul tuo PC{' '}
              <span className="font-mono">sc broker holdings --json</span>,{' '}
              <span className="font-mono">sc broker overview --json</span> e{' '}
              <span className="font-mono">sc overnight --json</span>, poi incolla qui gli output.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scalable-holdings-json">Output di holdings</Label>
              <Textarea
                id="scalable-holdings-json"
                value={holdingsText}
                onChange={(e) => setHoldingsText(e.target.value)}
                placeholder="Incolla l'output di sc broker holdings --json"
                rows={4}
                className="font-mono text-[12px]"
                disabled={disabled}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scalable-overview-json">Output di overview (opzionale, per la liquidità)</Label>
              <Textarea
                id="scalable-overview-json"
                value={overviewText}
                onChange={(e) => setOverviewText(e.target.value)}
                placeholder="Incolla l'output di sc broker overview --json"
                rows={3}
                className="font-mono text-[12px]"
                disabled={disabled}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scalable-overnight-json">
                Output di overnight (opzionale, per il deposito non vincolato)
              </Label>
              <Textarea
                id="scalable-overnight-json"
                value={overnightText}
                onChange={(e) => setOvernightText(e.target.value)}
                placeholder="Incolla l'output di sc overnight --json"
                rows={3}
                className="font-mono text-[12px]"
                disabled={disabled}
              />
            </div>
            <div>
              <Button
                variant="outline"
                onClick={handlePreviewFromText}
                disabled={disabled || preparing}
                className="h-10"
              >
                {preparing && <Loader2 className="h-4 w-4 animate-spin" />}
                {preparing ? 'Lettura composizioni…' : 'Anteprima dal testo'}
              </Button>
            </div>
          </div>
        </div>
        <BrokerTradeImportDialog
          open={tradeImportOpen}
          onClose={() => setTradeImportOpen(false)}
          ownerId={ownerId}
          source="scalable"
          brokerName="Scalable Capital"
        />
      </Tile>
    </div>
  );
}
