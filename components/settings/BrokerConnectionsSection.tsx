/**
 * Broker connections — the «Collegamenti» tile: read-only sync from Scalable Capital.
 *
 * Two ways in, one plan out. When the app runs on the same machine as the `sc` CLI,
 * «Sincronizza» calls POST /api/broker/scalable/read (the server runs ONLY the three
 * whitelisted read commands, no credentials involved). Otherwise — hosted run, missing
 * binary — the same plan is built from pasted `--json` output. Either way the preview
 * is explicit and saving writes through the standard asset services:
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
import { Loader2, RefreshCw } from 'lucide-react';
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
import { describeBrokerConnections } from '@/lib/utils/settingsNarrative';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { formatCurrency, formatDate, formatNumberIt } from '@/lib/utils/formatters';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  buildScalableImportPlan,
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

interface BrokerConnectionsSectionProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

const KIND_LABEL: Record<HoldingDiffKind, string> = {
  new: 'Nuovo',
  'price-update': 'Prezzo aggiornato',
  'drift-only': 'Scostamento quantità',
  'price-and-drift': 'Prezzo + scostamento',
  unchanged: 'Invariato',
};

const SCALABLE_LOGIN_MESSAGE =
  'Esegui <code class="font-mono">sc login --local-read-only</code> nel terminale (consigliato) o collega il tuo account Scalable Capital dal web.';

const NEW_CASH_VALUE = '__new__';

/**
 * The two Scalable cash accounts are told apart by the ticker the sync WRITES, never by the
 * name the user may have edited. The overnight deposit is a separate balance at the broker, so
 * it gets its own account; matching both by the shared `exchange` would cross-wire them.
 */
function findScalableCash(assets: Asset[], ticker: string): Asset | undefined {
  return assets.find((a) => a.type === 'cash' && a.assetClass === 'cash' && a.ticker === ticker);
}

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

export function BrokerConnectionsSection({ ownerId, disabled = false }: BrokerConnectionsSectionProps) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdingsText, setHoldingsText] = useState('');
  const [overviewText, setOverviewText] = useState('');
  const [overnightText, setOvernightText] = useState('');
  const [plan, setPlan] = useState<ReturnType<typeof buildScalableImportPlan> | null>(null);
  const [cashTarget, setCashTarget] = useState<string>(NEW_CASH_VALUE);
  const [depositTarget, setDepositTarget] = useState<string>(NEW_CASH_VALUE);
  /**
   * A failed OVERNIGHT read is declared, not swallowed: positions and the broker cash still
   * sync, and the preview says the deposit was left out and why (a read that silently returned
   * nothing would look like an emptied account).
   */
  const [overnightWarning, setOvernightWarning] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [conn, allAssets] = await Promise.all([
        getBrokerConnection(ownerId),
        getAllAssets(ownerId),
      ]);
      setConnection(conn);
      setAssets(allAssets);
    } catch (err) {
      console.error('[BrokerConnections] load failed:', err);
      toast.error('Impossibile caricare i collegamenti broker');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const buildPlan = useCallback(
    (
      holdings: ScalableHoldingInput[],
      overview: ScalableOverviewInput | null,
      overnight: ScalableOvernightInput | null,
      overnightWarningText: string | null
    ) => {
      setPlan(buildScalableImportPlan(holdings, overview, assets, overnight));
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
      // The overnight read is deliberately NOT in this Promise.all: a user with no overnight
      // account (or a CLI that refuses it) still syncs their positions and broker cash.
      const [holdingsRes, overviewRes, overnightRes] = await Promise.all([
        postReadCommand(ownerId, 'holdings'),
        postReadCommand(ownerId, 'overview'),
        postReadCommand(ownerId, 'overnight').then(
          (r) => ({ overnight: r.overnight ?? null, warning: null as string | null }),
          (err: unknown) => ({
            overnight: null,
            warning:
              err instanceof Error
                ? `Deposito non vincolato non letto: ${err.message}`
                : 'Deposito non vincolato non letto.',
          })
        ),
      ]);
      buildPlan(holdingsRes.holdings ?? [], overviewRes.overview ?? null, overnightRes.overnight, overnightRes.warning);
      // No auto-import: `handleSave` closes over the `plan` of the render it was created in, so
      // calling it right after `setPlan` read the PREVIOUS plan (null on a fresh load) and bailed
      // on its own guard — the write never ran while the toast below claimed it had. The preview
      // is the confirmation step («Salva nel patrimonio»), which is also what the tile's own
      // docstring describes.
      toast.success('Anteprima pronta: controlla le righe e salva.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lettura non riuscita: riprova.';
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  const handlePreviewFromText = () => {
    if (disabled) return;
    try {
      const { holdings } = parseScalableHoldingsJson(holdingsText);
      const overview = overviewText.trim() !== '' ? parseScalableOverviewJson(overviewText) : null;
      // The overnight paste is OPTIONAL: an empty box is a declared absence, not a failure.
      let overnight: ScalableOvernightInput | null = null;
      let overnightWarningText: string | null = null;
      if (overnightText.trim() !== '') {
        try {
          overnight = parseScalableOvernightJson(overnightText);
        } catch (err) {
          overnightWarningText =
            err instanceof ScalableParseError
              ? `Deposito non vincolato non letto: ${err.message}`
              : 'Deposito non vincolato non letto: testo non valido.';
        }
      }
      buildPlan(holdings, overview, overnight, overnightWarningText);
      toast.success('Anteprima pronta: controlla le righe prima di salvare.');
    } catch (err) {
      setError(
        err instanceof ScalableParseError ? err.message : 'Testo non valido: ricontrolla l\'output incollato.'
      );
    }
  };

  const handleSave = async () => {
    if (!plan || disabled) return;
    setSaving(true);
    try {
      let createdAssets = 0;
      let updatedPrices = 0;
      for (const diff of plan.holdings) {
        if (diff.kind === 'new') {
          await createAsset(ownerId, diff.formData);
          createdAssets += 1;
        } else if (
          (diff.kind === 'price-update' || diff.kind === 'price-and-drift') &&
          diff.existingAssetId
        ) {
          await updateAssetMetadata(diff.existingAssetId, { currentPrice: diff.holding.price });
          updatedPrices += 1;
        }
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
      await saveBrokerConnection(ownerId, {
        holdingsCount: plan.stats.holdingCount,
        skippedCount: plan.stats.skippedCount,
        ...(cashBalance !== undefined ? { cashBalance } : {}),
        ...(cashAssetId ? { cashAssetId } : {}),
        ...(depositBalance !== undefined ? { depositBalance } : {}),
        ...(depositAssetId ? { depositAssetId } : {}),
        ...(plan.deposit?.interestRate !== undefined
          ? { depositInterestRate: plan.deposit.interestRate }
          : {}),
        createdAssets,
        updatedPrices,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
      setPlan(null);
      await loadAll();
      toast.success(
        `Sincronizzazione salvata: ${createdAssets} nuovi asset, ${updatedPrices} prezzi aggiornati.`
      );
    } catch (err) {
      console.error('[BrokerConnections] save failed:', err);
      // A partial save can have ALREADY created the cash/deposit accounts, so the in-memory
      // `assets` (and the plan's «create new» targets) are stale: keeping them would make the
      // retry create duplicates. Re-read and drop the preview — the next «Sincronizza» resolves
      // the targets again, this time against what actually exists.
      await loadAll();
      setPlan(null);
      toast.error('Salvataggio non riuscito: riprova con Sincronizza.');
    } finally {
      setSaving(false);
    }
  };

  const cashAssets = assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash');
  const reading = loading
    ? null
    : describeBrokerConnections({
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
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSync} disabled={disabled || syncing || loading} className="h-10">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Lettura…' : 'Sincronizza'}
            </Button>
            {disabled && (
              <span className="text-xs text-muted-foreground">Modalità demo: sincronizzazione disattivata.</span>
            )}
          </div>

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
                {plan.stats.unchangedCount > 0 && `, ${plan.stats.unchangedCount} invariati`}.
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
                  {/* The rate and the payout are DECLARED here, not written: no Asset field holds
                      an interest rate, and a cash account cannot accrue it on its own. */}
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
              <Button variant="outline" onClick={handlePreviewFromText} disabled={disabled} className="h-10">
                Anteprima dal testo
              </Button>
            </div>
          </div>
        </div>
      </Tile>

      <Tile
        eyebrow="Refresh login"
        reading={[{ text: 'La sessione vive nel tuo PC, mai in questa app: quando scade la rinnovi dal terminale.' }]}
      >
        <div className="mt-1 flex flex-col divide-y divide-border">
          {[
            'Abilita la CLI nel profilo Scalable (web): Profilo › Sicurezza › Agentic Investing.',
            'Accedi dal terminale: sc login — consigliato sc login --local-read-only, che blocca gli ordini e lascia attive le letture.',
            'Verifica con sc whoami e, se hai più portafogli, scegli con sc broker context select.',
            'Torna qui e premi Sincronizza: vengono letti solo posizioni, totali e il deposito non vincolato.',
          ].map((step, index) => (
            <div key={index} className="flex items-start gap-3 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold">
                {index + 1}
              </span>
              <span className="text-[13px] leading-[1.45]">{step}</span>
            </div>
          ))}
        </div>
      </Tile>
    </div>
  );
}