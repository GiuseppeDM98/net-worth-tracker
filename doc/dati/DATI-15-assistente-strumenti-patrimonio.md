# DATI-15 — Assistente: the tools on the trade ledger, the dividends and the net-worth history; the last 30 days to the Consulente

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-09 (contract C3: the tool registry, the loop,
> the context), DATI-02 (contract C1: `readDailyPoints`, `DailyPoint`, `dailyUnitPrice`), DATI-12 (contract C6:
> `hasNoMarketPrice`, `snapshotUnitPrice`), DATI-05 (`DELETED_INSTRUMENT_NAME`) and DATI-06 (a trade's
> `settledTotalEur`). Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a line number is a hint, the
> function's name is the anchor). Owner's points 8 and 5; decisions 17, 11 and 53. Extends C3 (index § 7).

## 1. The problem today (evidence on the code)

- After DATI-09 the Assistente computes on the cashflow, the budget and the cost centres. The owner asked the same
  for «Registro operazioni e dividendi, Storia del patrimonio». Today those reach the model only as the portfolio
  block of the message (`formatPortfolioForPrompt`, `lib/server/assistant/prompts.ts:313`): today's holdings and the
  registers summarised — no trade can be listed by period, no dividend summed over an arbitrary window, no month of
  the net worth beyond what the mode's builder chose.
- The documents are read on the server already (`fetchPortfolioDocuments`,
  `lib/services/assistantMonthContextService.ts:297-316`: every trade, every dividend, every pension contribution;
  `getUserSnapshotsAdmin`, `getAssetTransactionsAdmin`, `getUserAssetsAdmin`,
  `lib/server/assetAdminRepository.ts:26`, `:47`, `:71`); the realised result of a sale exists as a replay effect
  (`replayTransactionsWithEffects`, `lib/utils/assetTransactionUtils.ts:190`; `LedgerTransactionEffect.realizedPnlEur`,
  `:155-159`).
- The Consulente reads the year-to-date bundle, the cashflow block and the plan (`buildConsulenteContext`,
  `lib/server/allocationAdvice/run.ts:324-332`): nothing about the last weeks. After DATI-02 a daily archive exists.

## 2. Goal and acceptance criteria

1. Four tools join the registry of C3: `operazioni_registro`, `dividendi_cedole`, `patrimonio_storia`,
   `patrimonio_giorni`. Every mode that has the cashflow tools has these. Proof: T1, L1.
2. `operazioni_registro` lists the trades of a period (by instrument and type), each with its EUR total, fee,
   withheld tax and — for a sale — the realised result, plus the totals of ALL the matching rows; an adjustment
   is listed as what it is, a new quantity and a new average cost, with no total. Proof: Q1–Q3.
3. `dividendi_cedole` sums dividends and coupons of a period by instrument, month, year or kind, in EUR, with
   «incassati» and «annunciati» always two figures; a foreign row without its euro amounts counts at its native
   amount, as everywhere in the app, and the result says how many. Proof: Q4, Q5.
4. `patrimonio_storia` returns the month-end net worth, the liquid net worth and the classes between two months, or
   one instrument's quantity, unit price and value; the dummy snapshots are in or out as the user's preference
   says. Proof: Q6, Q7.
5. `patrimonio_giorni` returns the daily points of the archive (at most 120 days), or one instrument's; with no
   archive it says so. What has no market price has no unit price, by month and by day. Proof: Q7, Q8, T3.
6. The reads behind these tools happen only when a tool asks, each once per request — the portfolio documents
   once, the archive once per window. Proof: T2.
7. The Consulente's data block (the strategy and every interview round, a revision's included) and the
   Assistente's data of every mode but Registra carry «ULTIMI 30 GIORNI» from the archive; with fewer than 5 days
   the block says the archive is too young, with a failed read that it was not read. No system prompt of the
   Consulente changes by a byte. Proof: B1, B2, C1, S1.
8. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green. No E2E: the
   spec changes no screen (the wait's status is DATI-09's and has its test there).

## 3. Decisions

- **Decision 17** (owner, 2026-11-23): besides the cashflow, the tools cover the budget and the cost centres
  (DATI-09), the trade ledger and the dividends, and the net-worth history.
- **Decision 11** (owner, 2026-11-23): the daily archive is read by the Assistente and the Consulente.
- **Decision 53** (owner, 2026-11-23): what has no market price — an account, a pension fund, a property, a loan —
  has no unit price in the tools either, by month or by day: only its value.
- Adopted, reversible:
  - (a) both read the last 30 days as a block (decision 11); beyond 30 days, or for one instrument, the Assistente
    asks the tool — the Consulente's agents have no tools.
  - (b) filters are by instrument NAME or ticker, folded as DATI-09 folds category names (`foldName`).
  - (c) a tool's read is lazy and memoised on the context: a question about spending pays nothing for it; a question
    about trades re-reads what the mode's builder may have read (four queries, accepted).
  - (d) pension contributions get no tool (the portfolio block carries them; Previdenza is not in decision 17).
  - (e) caps: 100 trades shown, 120 days, 60 months.
  - (f) a foreign dividend without its euro amounts counts at its native amount, as `netEur`/`grossEur` of
    `lib/utils/dividendAnalytics.ts` do for every other reader: the tool's total equals Dividendi's.
  - (g) the tools follow the user's `includeDummySnapshots` preference, as the message's bundle does.
  - (h) a dividend is «incassato» when its payment DAY is today or before (the Italian day); the Dividendi page
    compares the instant, so a payment dated later today is announced there and received here.
  - (i) a deleted instrument cannot be asked by name; its trades are listed under «Strumento eliminato».

## 4. Solution

### 4.1 Pure queries — `lib/utils/assistantPortfolioQueries.ts` (new, written here)

```ts
/**
 * What the Assistente's portfolio tools compute (2026-11-23): the trade ledger, the dividends and
 * the net-worth history, asked by period and by instrument name. Pure — the documents come in.
 * Amounts are EUR; a day is the Italian day.
 */
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';
import type { Dividend } from '@/types/dividend';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { foldName } from '@/lib/utils/assistantExpenseQueries';
import { replayTransactionsWithEffects } from '@/lib/utils/assetTransactionUtils';
import { hasNoMarketPrice, snapshotUnitPrice } from '@/lib/utils/assetPerformanceDeltas';
import { grossEur, netEur } from '@/lib/utils/dividendAnalytics';
import { DELETED_INSTRUMENT_NAME } from '@/lib/utils/instrumentArchive';
import { dailyUnitPrice, type DailyPoint } from '@/lib/utils/dailySnapshot';

export const TRADES_CAP = 100;
export const DAYS_CAP = 120;
export const MONTHS_CAP = 60;

type Named = Pick<Asset, 'id' | 'name' | 'ticker' | 'displayTicker'>;

/** A map by class keyed by the label the app shows («Azioni»), not by the stored key. */
const labelled = (byClass: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(byClass).map(([cls, value]) => [ASSET_CLASS_LABELS[cls] ?? cls, value]));

/** The instruments a name or a ticker points at; the misses come back to be told to the model. */
export function resolveInstruments(names: readonly string[] | undefined, assets: readonly Named[]): { ids: Set<string> | null; unknown: string[] } {
  if (!names || names.length === 0) return { ids: null, unknown: [] };
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const name of names) {
    const wanted = foldName(name);
    // An empty name would match every instrument without a ticker, and `includes('')` everything.
    if (wanted === '') {
      unknown.push(name);
      continue;
    }
    const hits = assets.filter((asset) =>
      foldName(asset.name) === wanted || foldName(asset.ticker ?? '') === wanted || foldName(asset.displayTicker ?? '') === wanted);
    const loose = hits.length > 0 ? hits : assets.filter((asset) => foldName(asset.name).includes(wanted));
    if (loose.length === 0) unknown.push(name);
    for (const asset of loose) ids.add(asset.id);
  }
  return { ids, unknown };
}

export interface TradeLine {
  date: string;
  instrument: string;
  ticker: string;
  type: AssetTransactionType;
  /** Buy and sell: the quantity traded. Adjustment: the NEW total quantity. */
  quantity: number;
  /** Buy and sell: the price. Adjustment: the new average cost. */
  priceEur: number;
  /** quantity × priceEur, before fees; null for an adjustment, which trades nothing. */
  totalEur: number | null;
  /** The statement's euro total, when the trade recorded one (a trade in a foreign currency). */
  settledEur: number | null;
  feesEur: number;
  withheldTaxEur: number | null;
  /** Sell only: against the average cost at the sale, fees apart; null when the history does not replay. */
  realizedEur: number | null;
}

export interface TradesResult {
  rows: number;
  omitted: number;
  lines: TradeLine[];
  totals: {
    boughtEur: number;
    soldEur: number;
    feesEur: number;
    realizedEur: number;
    /** The sales whose realised result could not be rebuilt: they are not in `realizedEur`. */
    realizedUnknown: number;
    withheldTaxEur: number;
  };
}

export function listTrades(
  trades: readonly AssetTransaction[],
  assets: readonly Named[],
  query: { from: string; to: string; instrumentIds: Set<string> | null; types?: readonly AssetTransactionType[] },
  limit = TRADES_CAP
): TradesResult {
  const names = new Map(assets.map((asset) => [asset.id, asset]));

  // The realised result of a sale depends on every trade before it: replay each instrument whole.
  const realized = new Map<string, number>();
  const byAsset = new Map<string, AssetTransaction[]>();
  for (const trade of trades) byAsset.set(trade.assetId, [...(byAsset.get(trade.assetId) ?? []), trade]);
  for (const list of byAsset.values()) {
    try {
      for (const effect of replayTransactionsWithEffects(list).effects) {
        if (effect.realizedPnlEur !== undefined) realized.set(effect.transactionId, effect.realizedPnlEur);
      }
    } catch {
      // An invalid history has no realised figures; its rows are still listed.
    }
  }

  const matching = trades
    .filter((trade) => !trade.isBaseline)
    .map((trade) => ({ trade, iso: getItalyDateIso(trade.date) }))
    .filter(({ trade, iso }) => iso >= query.from && iso <= query.to
      && (!query.instrumentIds || query.instrumentIds.has(trade.assetId))
      && (!query.types || query.types.includes(trade.type)))
    // Newest first; two trades of one day keep a fixed order.
    .sort((a, b) => b.iso.localeCompare(a.iso) || b.trade.id.localeCompare(a.trade.id));

  const totals = { boughtEur: 0, soldEur: 0, feesEur: 0, realizedEur: 0, realizedUnknown: 0, withheldTaxEur: 0 };
  const lines: TradeLine[] = matching.map(({ trade, iso }) => {
    // An adjustment resets the position: its quantity × price is the whole position's cost, not an amount traded.
    const totalEur = trade.type === 'adjustment' ? null : roundToCents(trade.quantity * trade.priceEur);
    const realizedEur = trade.type === 'sell' ? (realized.get(trade.id) ?? null) : null;
    if (trade.type === 'buy') totals.boughtEur += totalEur ?? 0;
    if (trade.type === 'sell') {
      totals.soldEur += totalEur ?? 0;
      if (realizedEur === null) totals.realizedUnknown++;
    }
    totals.feesEur += trade.fees ?? 0;
    totals.realizedEur += realizedEur ?? 0;
    totals.withheldTaxEur += trade.withheldTaxEur ?? 0;
    const asset = names.get(trade.assetId);
    return {
      date: iso,
      instrument: asset?.name ?? DELETED_INSTRUMENT_NAME,
      ticker: asset ? getAssetDisplayTicker(asset) : '',
      type: trade.type,
      quantity: trade.quantity,
      priceEur: trade.priceEur,
      totalEur,
      settledEur: trade.settledTotalEur ?? null,
      feesEur: trade.fees ?? 0,
      withheldTaxEur: trade.type === 'sell' ? (trade.withheldTaxEur ?? null) : null,
      realizedEur: realizedEur === null ? null : roundToCents(realizedEur),
    };
  });
  const shown = Math.max(1, Math.min(limit, TRADES_CAP));
  return {
    rows: lines.length,
    omitted: Math.max(0, lines.length - shown),
    lines: lines.slice(0, shown),
    totals: {
      boughtEur: roundToCents(totals.boughtEur),
      soldEur: roundToCents(totals.soldEur),
      feesEur: roundToCents(totals.feesEur),
      realizedEur: roundToCents(totals.realizedEur),
      realizedUnknown: totals.realizedUnknown,
      withheldTaxEur: roundToCents(totals.withheldTaxEur),
    },
  };
}

export type DividendGroupBy = 'instrument' | 'month' | 'year' | 'kind';

export interface DividendGroup {
  /** What the group is called: the instrument's name today, the month, the year, the kind's Italian label. */
  key: string;
  /** Payment day today or before. */
  received: { gross: number; tax: number; net: number; count: number };
  /** Payment day after today: announced, not money yet. */
  announced: { gross: number; tax: number; net: number; count: number };
}

const emptySide = () => ({ gross: 0, tax: 0, net: 0, count: 0 });

export function dividendTotals(
  dividends: readonly Dividend[],
  assets: readonly Named[],
  query: { from: string; to: string; instrumentIds: Set<string> | null },
  by: DividendGroupBy,
  todayIso: string
): { groups: DividendGroup[]; total: DividendGroup; unconverted: number; provisional: number } {
  const names = new Map(assets.map((asset) => [asset.id, asset.name]));
  // Grouped by the instrument's id — two instruments of one name stay two, a renamed one stays one.
  const groups = new Map<string, DividendGroup>();
  const total: DividendGroup = { key: 'Totale', received: emptySide(), announced: emptySide() };
  let unconverted = 0;
  let provisional = 0;
  for (const dividend of dividends) {
    const iso = getItalyDateIso(dividend.paymentDate);
    if (iso < query.from || iso > query.to) continue;
    if (query.instrumentIds && !query.instrumentIds.has(dividend.assetId)) continue;
    if (dividend.currency !== 'EUR' && dividend.netAmountEur === undefined) unconverted++;
    if (dividend.isProvisional) provisional++;
    const [id, key] =
      by === 'instrument' ? [dividend.assetId, names.get(dividend.assetId) ?? dividend.assetName]
        : by === 'month' ? [iso.slice(0, 7), iso.slice(0, 7)]
          : by === 'year' ? [iso.slice(0, 4), iso.slice(0, 4)]
            : [dividend.dividendType, dividendTypeLabels[dividend.dividendType] ?? dividend.dividendType];
    const group = groups.get(id) ?? { key, received: emptySide(), announced: emptySide() };
    groups.set(id, group);
    // The app's one rule: the euro amount when the record has it, the native amount otherwise.
    const amounts = { gross: grossEur(dividend), tax: dividend.taxAmountEur ?? dividend.taxAmount, net: netEur(dividend) };
    for (const side of [iso <= todayIso ? group.received : group.announced, iso <= todayIso ? total.received : total.announced]) {
      side.gross = roundToCents(side.gross + amounts.gross);
      side.tax = roundToCents(side.tax + amounts.tax);
      side.net = roundToCents(side.net + amounts.net);
      side.count++;
    }
  }
  const sorted = [...groups.values()].sort((a, b) =>
    by === 'month' || by === 'year' ? a.key.localeCompare(b.key) : b.received.net + b.announced.net - (a.received.net + a.announced.net));
  return { groups: sorted, total, unconverted, provisional };
}

export interface MonthPoint {
  month: string;
  netWorth: number;
  liquid: number;
  /** By the class's Italian label. */
  byClass: Record<string, number>;
}

/** Month-end points between two months (`YYYY-MM`), ascending; the newest `MONTHS_CAP` when more. */
export function netWorthMonths(
  snapshots: readonly MonthlySnapshot[],
  fromMonth: string,
  toMonth: string,
  includeDummy: boolean
): { points: MonthPoint[]; omitted: number } {
  const points = snapshots
    .filter((snapshot) => includeDummy || !snapshot.isDummy)
    .map((snapshot) => ({ snapshot, month: `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}` }))
    .filter(({ month }) => month >= fromMonth && month <= toMonth)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ snapshot, month }) => ({ month, netWorth: snapshot.totalNetWorth, liquid: snapshot.liquidNetWorth, byClass: labelled(snapshot.byAssetClass ?? {}) }));
  return { points: points.slice(-MONTHS_CAP), omitted: Math.max(0, points.length - MONTHS_CAP) };
}

export interface InstrumentMonthPoint {
  month: string;
  quantity: number;
  /** EUR per unit; null for what has no market price (`hasNoMarketPrice`). */
  unitPrice: number | null;
  value: number;
}

export function instrumentMonths(
  snapshots: readonly MonthlySnapshot[],
  asset: Pick<Asset, 'id' | 'type'>,
  fromMonth: string,
  toMonth: string,
  includeDummy: boolean
): { points: InstrumentMonthPoint[]; omitted: number } {
  const priced = !hasNoMarketPrice(asset);
  const points: InstrumentMonthPoint[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.isDummy && !includeDummy) continue;
    const month = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    if (month < fromMonth || month > toMonth) continue;
    const row = (snapshot.byAsset ?? []).find((item) => item.assetId === asset.id);
    if (!row) continue;
    points.push({ month, quantity: row.quantity, unitPrice: priced ? snapshotUnitPrice(row) : null, value: row.totalValue });
  }
  points.sort((a, b) => a.month.localeCompare(b.month));
  return { points: points.slice(-MONTHS_CAP), omitted: Math.max(0, points.length - MONTHS_CAP) };
}

export interface DayPoint {
  day: string;
  netWorth: number;
  liquid: number;
  /** By the class's Italian label. */
  byClass: Record<string, number>;
}

export function netWorthDays(points: readonly DailyPoint[]): DayPoint[] {
  return points.slice(-DAYS_CAP).map((point) => ({ day: point.iso, netWorth: point.netWorth, liquid: point.liquid, byClass: labelled(point.byClass) }));
}

export function instrumentDays(
  points: readonly DailyPoint[],
  asset: Pick<Asset, 'id' | 'type'>
): Array<{ day: string; quantity: number; unitPrice: number | null; value: number }> {
  const priced = !hasNoMarketPrice(asset);
  return points.slice(-DAYS_CAP).flatMap((point) => {
    const row = point.assets[asset.id];
    return row ? [{ day: point.iso, quantity: row.q, unitPrice: priced ? dailyUnitPrice(row) : null, value: row.v }] : [];
  });
}
```

`hasNoMarketPrice` and `snapshotUnitPrice(row)` are C6 (DATI-12 § 4.1), `DELETED_INSTRUMENT_NAME` is DATI-05's
(`lib/utils/instrumentArchive.ts`), `settledTotalEur` is a trade's field since DATI-06: all four are in `develop`
when this spec starts (the number is the order).

### 4.2 The 30-day block — `lib/utils/dailyBlock.ts` (new, written here)

```ts
/**
 * The last 30 days of the daily archive as a block of the Consulente's and the Assistente's data
 * (2026-11-23): where the net worth and the classes went in the last weeks, which the monthly
 * history cannot say.
 */
import type { DailyPoint } from '@/lib/utils/dailySnapshot';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { formatCurrency } from '@/lib/utils/formatters';

export const DAILY_BLOCK_DAYS = 30;
export const DAILY_BLOCK_MIN_POINTS = 5;

const signedPct = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')}%`;

/** `null` = the read failed, which is not an archive with no days (The Absence-Has-Three-Names Rule). */
export function formatDailyBlockForPrompt(points: readonly DailyPoint[] | null): string[] {
  const header = `--- ULTIMI ${DAILY_BLOCK_DAYS} GIORNI (dall'archivio giornaliero: sintesi del patrimonio netto a fine giornata; sono gli ultimi giorni fino a oggi, qualunque periodo tu stia leggendo) ---`;
  if (points === null) return [header, "L'archivio giornaliero non è stato letto: usa la storia mensile."];
  if (points.length < DAILY_BLOCK_MIN_POINTS) {
    return [header, `L'archivio giornaliero ha ${points.length} giorni: troppo pochi per una lettura. Usa la storia mensile.`];
  }
  const first = points[0];
  const last = points[points.length - 1];
  const low = points.reduce((min, point) => (point.netWorth < min.netWorth ? point : min));
  const high = points.reduce((max, point) => (point.netWorth > max.netWorth ? point : max));
  const lines = [
    header,
    `Dal ${first.iso} al ${last.iso} (${points.length} giorni registrati): da ${formatCurrency(first.netWorth)} a ${formatCurrency(last.netWorth)}${first.netWorth > 0 ? ` (${signedPct((last.netWorth / first.netWorth - 1) * 100)})` : ''}.`,
    `Minimo ${formatCurrency(low.netWorth)} il ${low.iso}; massimo ${formatCurrency(high.netWorth)} il ${high.iso}.`,
    'Per classe (valore, flussi compresi: un acquisto alza la classe quanto un rialzo):',
  ];
  const classes = new Set([...Object.keys(first.byClass), ...Object.keys(last.byClass)]);
  for (const cls of classes) {
    const from = first.byClass[cls] ?? 0;
    const to = last.byClass[cls] ?? 0;
    if (from === 0 && to === 0) continue;
    lines.push(`- ${ASSET_CLASS_LABELS[cls] ?? cls}: da ${formatCurrency(from)} a ${formatCurrency(to)}${from > 0 ? ` (${signedPct((to / from - 1) * 100)})` : ''}`);
  }
  return lines;
}
```

### 4.3 The tools — `lib/server/assistant/tools/` (C3, extended)

`AssistantToolContext` gains THREE fields (nothing else of the registry's types changes):

```ts
export interface AssistantPortfolioReads {
  assets: Asset[];
  trades: AssetTransaction[];
  dividends: Dividend[];
  snapshots: MonthlySnapshot[];
}

export interface AssistantToolContext {
  // … the existing fields, unchanged …
  /** The portfolio documents, read at the first tool that asks and kept for the request. */
  portfolio: () => Promise<AssistantPortfolioReads>;
  /** The daily archive between two Italian days, read once per window. */
  daily: (fromIso: string, toIso: string) => Promise<DailyPoint[]>;
  /** The user's preference, as the message's bundle reads it: false keeps the dummy snapshots out. */
  includeDummySnapshots: boolean;
}
```

`context.ts`: `readAssistantTurnData(userId, now, options?: { includeDummySnapshots?: boolean })` and
`buildAssistantToolContext(userId, now, options?)` take the preference (default false; the route passes its
`preferences.includeDummySnapshots ?? false`). `portfolio` is a closure that keeps the PROMISE of one `Promise.all`
of `getUserAssetsAdmin`, `getAssetTransactionsAdmin`, `getUserSnapshotsAdmin` (`lib/server/assetAdminRepository.ts`)
and `getAllDividends` (`lib/services/dividendService.ts`, the Admin reader that exists: no new one is written) —
the calls of one round run together and share it; `daily` keeps one promise per `fromIso|toIso` key over
`readDailyPoints(adminDb, userId, fromIso, toIso)`. A promise that rejects is dropped from its memo, so the next
call reads again.

Four files beside DATI-09's, each one `defineAssistantTool({ name, description, input, run })` and added at the end
of `ASSISTANT_TOOLS` in this order: `lib/server/assistant/tools/tradeLedger.ts` (`tradeLedger`),
`dividendSums.ts` (`dividendSums`), `netWorthHistory.ts` (`netWorthHistory`), `netWorthDaily.ts`
(`netWorthDaily`). The descriptions are in Italian (they are prompt) and say «titolo» for a financial instrument,
never «strumento» alone — in the prompt «strumenti» are the tools. The inputs are zod objects: a day is
`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, a month `z.string().regex(/^\d{4}-\d{2}$/)`, a name
`z.string().trim().min(1)`.

| name | description | input |
|---|---|---|
| `operazioni_registro` | «Elenca le operazioni del registro (acquisti, vendite, rettifiche) in un periodo, anche per uno o più titoli: per ciascuna data, quantità, prezzo in euro, controvalore, commissioni, tasse trattenute, il totale dell'estratto conto quando è registrato e — per una vendita — il risultato realizzato. Per una rettifica la quantità è la nuova posizione totale e il prezzo il nuovo prezzo medio di carico: non ha controvalore. Restituisce anche i totali di TUTTE le operazioni che corrispondono. Usalo per "cosa ho comprato quest'anno", "quanto ho realizzato vendendo X", "quante commissioni ho pagato".» | `from`, `to` (days), `instruments?: name[]` (min 1), `types?: ('buy' \| 'sell' \| 'adjustment')[]` (min 1), `limit?: 1..100` (integer) |
| `dividendi_cedole` | «Somma dividendi e cedole per data di pagamento in un periodo, raggruppati per titolo, mese, anno o tipo, in euro: lordo, ritenute e netto. Gli incassati (pagati fino a oggi) e gli annunciati (pagamento futuro) sono sempre due cifre distinte: non sommarle mai.» | `from`, `to` (days), `groupBy: 'instrument' \| 'month' \| 'year' \| 'kind'`, `instruments?: name[]` (min 1) |
| `patrimonio_storia` | «La storia a fine mese: patrimonio netto, patrimonio liquido e valore per classe tra due mesi; oppure, con un titolo, la sua quantità, il prezzo unitario in euro e il valore mese per mese. Conti, fondi pensione, immobili e prestiti non hanno un prezzo unitario: solo il valore. Al più 60 mesi.» | `fromMonth`, `toMonth` (months), `instrument?: name` |
| `patrimonio_giorni` | «I punti giornalieri dell'archivio (al più gli ultimi 120 giorni): patrimonio netto, liquido e classi giorno per giorno; oppure, con un titolo, quantità, prezzo unitario e valore. L'archivio parte dal giorno in cui è stato attivato: prima non esistono giorni.» | `days: 1..120` (integer), `instrument?: name` |

Runs (`reads = await context.portfolio()`):
- **A name that finds nothing**, in every tool: `AssistantToolError('Nessun titolo si chiama «X». Esistono: A, B,
  C…')` — the first 40 names of `reads.assets`. (DATI-09's «Strumento sconosciuto: {name}.» is the message for a
  TOOL that does not exist: the two never share words.)
- **ONE instrument** (`patrimonio_storia`, `patrimonio_giorni` with `instrument`): `resolveInstruments([input.
  instrument], reads.assets)`; more than one id → `AssistantToolError('«X» corrisponde a più titoli: A, B.
  Scegline uno.')`.
- `operazioni_registro`: `from ≤ to` or `AssistantToolError('Il periodo finisce prima di cominciare.')`;
  `resolveInstruments(input.instruments, reads.assets)`; then `{ period: { from, to }, today: context.todayIso,
  ...listTrades(reads.trades, reads.assets, { from, to, instrumentIds, types }, input.limit) }`.
- `dividendi_cedole`: the same checks; `{ period, today, ...dividendTotals(reads.dividends, reads.assets, { from,
  to, instrumentIds }, input.groupBy, context.todayIso) }`, with `notes: string[]` when they apply:
  `unconverted > 0` → «{n} righe in valuta senza controvalore in euro: contate al loro importo in valuta, come
  nel resto dell'app.»; `provisional > 0` → «{n} cedole provvisorie: l'importo cambia quando l'inflazione è
  definitiva.»
- `patrimonio_storia`: `fromMonth ≤ toMonth` or the same period error; without `instrument` → `{ ...netWorthMonths(
  reads.snapshots, fromMonth, toMonth, context.includeDummySnapshots) }`; with it → `{ instrument: asset.name,
  ...instrumentMonths(reads.snapshots, asset, fromMonth, toMonth, context.includeDummySnapshots) }`; no point →
  `note: 'Nessuno snapshot in questi mesi.'` (for an instrument: «… per questo titolo.»).
- `patrimonio_giorni`: `toIso = context.todayIso`, `fromIso = isoDaysBefore(toIso, input.days - 1)`, `points =
  await context.daily(fromIso, toIso)`; no point → `{ days: 0, note: "L'archivio giornaliero non ha ancora giorni
  in questo intervallo." }`; without `instrument` → `{ days: points.length, points: netWorthDays(points) }`; with
  it → `{ instrument: asset.name, points: instrumentDays(points, asset) }`, and with no row for it `note: 'Nessun
  giorno in archivio per questo titolo in questo intervallo.'`.

**The loop's log** (`lib/server/assistant/anthropicStream.ts`, an addition to C3): the return gains `toolNames:
string[]` — each call's name, in order — beside `toolCalls` and `toolRounds`, and the route's line ends with them
grouped: `[assistant] tools: N calls, R rounds, S s (operazioni_registro×1, cashflow_totali×2)`. § 8 reads it.

### 4.4 The prompt — `lib/server/assistant/prompts.ts`

`TOOLS_SECTION` («# Gli strumenti sui tuoi dati», DATI-09 § 4.4) changes in four places; the rest is unchanged:

- its first sentence becomes «Hai strumenti che interrogano il cashflow registrato, il budget, i centri di costo,
  il registro delle operazioni, i dividendi e la storia del patrimonio (a fine mese e giorno per giorno): i conti
  sulle righe li fa il codice e tu li chiedi.»;
- the list of what to ask («…le righe dietro un numero») gains «, le operazioni e i dividendi di un periodo, il
  patrimonio di un mese o di un giorno»;
- its closing «…poi rispondi: non nominare mai gli strumenti nella risposta.» becomes «…poi rispondi: non
  nominare mai queste funzioni di calcolo nella risposta (i titoli e i conti dell'utente invece si nominano).» —
  with tools on the portfolio, «strumenti» would read as the user's securities;
- one sentence is added at the end of the section: «Dividendi incassati e annunciati restano due cifre: non
  presentarne mai la somma come incasso.»

### 4.5 The Consulente — `lib/server/allocationAdvice/run.ts`

`buildConsulenteContext` (`:324-332`; called by `runStrategy` and by `runInterviewRound`, a revision's round
included — `runRevise` reads the plan alone and gets no block): a fourth read in the `Promise.all` —
`readDailyPoints(adminDb, userId, isoDaysBefore(todayIso, DAILY_BLOCK_DAYS - 1), todayIso).catch(() => null)` with
`todayIso = getItalyDateIso(now)` — and the data block becomes
`${formatBundleForPrompt(bundle)}\n\n${bondBlock}\n\n${formatDailyBlockForPrompt(daily).join('\n')}\n\n${formatAccumulationPlanForPrompt(planRead)}`.
No prompt constant changes: the block describes itself in its header, inside the user content.

### 4.6 The Assistente's block — `app/api/ai/assistant/stream/route.ts`

Where the route calls `readAssistantTurnData` (DATI-09: every mode but Registra) it starts beside it, in the same
`Promise.all`, `readDailyPoints(adminDb, body.userId, isoDaysBefore(todayIso, DAILY_BLOCK_DAYS - 1),
todayIso).catch(() => null)`, and the string it passes on as `cashflowBlock` becomes
`${cashflowBlock}\n\n${formatDailyBlockForPrompt(daily).join('\n')}` — the block follows the cashflow's under the
same note (`formatCashflowBlockSection`, `prompts.ts:972-974`) and names itself in its header. Registra's branch
makes no daily read and carries the cashflow block alone. The periodic emails are not this route: they get no
daily block.

## 5. Constraints and traps

- **C3 is extended, and what is added is said in the index § 7**: three fields on the context, the optional
  third argument of `readAssistantTurnData`/`buildAssistantToolContext`, `toolNames` on the loop's return, four
  tools. `defineAssistantTool`, `runAssistantTool`, the loop, its limits and its statuses are DATI-09's.
  `ASSISTANT_TOOL_DEFINITIONS` stays ONE array, the same on every request of an answer (the cache prefix).
- **No `strict` on a tool** (DATI-09): zod is the one gate, the schema sent is `z.toJSONSchema` of it.
- **The system prompt is static and byte-identical across users** (`expect(a.system).toBe(b.system)`,
  `__tests__/assistantPromptBundle.test.ts:596`): the section's sentences are constants. The Consulente's system
  prompts are untouched — C1 holds it.
- **In the prompt «strumenti» are the tools**: the user's securities are «titoli», in the section and in the four
  descriptions.
- **Received and announced are never one figure** (doc/guide/cashflow-dividendi.md): the tool returns two sides and
  no sum of them.
- **A dividend's euro amount is `netEur`/`grossEur`** (`lib/utils/dividendAnalytics.ts`): the tool's totals must
  equal Cashflow › Dividendi's and the portfolio block's of the same message.
- **The realised result is fee-free** (`LedgerTransactionEffect`, `assetTransactionUtils.ts:156-158`): the tool
  names fees and withheld tax beside it; it never nets them.
- **A baseline is not a trade** (`isBaseline`): it is filtered out — it is the opening position of a migrated
  instrument. **An adjustment is not a traded amount**: a new quantity and a new average cost.
- **A failed read is not an empty archive**: the block's builder takes `null` for it.
- **Admin reads, by `userId` of the verified token** (doc/guide/server.md): the tools never take a user id from the
  model.
- **Nothing here spends** (index § 8 rule 5): the tests fake the SDK; § 7 calls no real model before F.
- **`__tests__/assistantRoutes.test.ts` mocks `adminDb.collection`** and throws on an unknown collection: S1 mocks
  `@/lib/server/dailySnapshotStore` (`readDailyPoints`), or every case runs the «not read» branch.
- **Italian day** for every date filter (`getItalyDateIso`); fixtures at noon.
- **No owner data**: «ETF Alfa», «Azione Beta», round figures.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| Q1 | unit · `__tests__/assistantPortfolioQueries.test.ts` | trades of a period, newest first, two of one day in a fixed order; a trade at 23:30 UTC of 31 December counts in the next year; the baseline is not listed; an adjustment has `totalEur: null` and adds nothing to bought or sold | `toISOString` day; quantity × price on an adjustment |
| Q2 | unit · same | buy 10 at 100, sell 4 at 130 → the sale's `realizedEur` 120, totals bought 1.000, sold 520, fees and withheld tax summed apart; a history that does not replay → `realizedEur: null`, rows still listed, `realizedUnknown: 1`; a trade with `settledTotalEur` shows it as `settledEur` | net the fee into realised; count the unknown as zero silently |
| Q3 | unit · same | 130 matching, limit 100 → 100 lines, `omitted: 30`, totals of all 130; `resolveInstruments` finds «etf alfa», a ticker, a display ticker, a partial name; a miss and an empty name are in `unknown`; a deleted instrument's trade reads `DELETED_INSTRUMENT_NAME` | totals of the shown; match the empty name |
| Q4 | unit · same | a dividend paid yesterday is `received`, one paid tomorrow `announced`; the total has two sides and no sum; a provisional coupon is counted in `provisional` | one side |
| Q5 | unit · same | a USD dividend uses its EUR amounts; one without them counts at its native amount and is in `unconverted`; groups by month ascending, by instrument by size and under the instrument's name today (two rows of one renamed instrument are ONE group), by kind under «Cedola» | zero for the unconverted; group by `assetName` |
| Q6 | unit · same | `netWorthMonths` between two months, ascending, classes under their Italian labels, 70 months → the newest 60 and `omitted: 10`; a dummy snapshot is out with `includeDummy: false` and in with `true` | oldest 60; always drop the dummies |
| Q7 | unit · same | `instrumentMonths`: quantity, unit price, value; a pension fund, a property and a loan have `unitPrice: null` by month AND by day (`instrumentDays`) | `priced` always true |
| Q8 | unit · same | `netWorthDays` keeps the last 120; `instrumentDays` skips the days without the instrument | first 120 |
| B1 | unit · `__tests__/dailyBlock.test.ts` | 30 points → header, the span, min and max with their days, one line per class with its percent; a class at zero on both ends is not listed | min for max |
| B2 | unit · same | 4 points → the «troppo pochi» line and nothing else; `null` → «non è stato letto» and nothing else | threshold off by one; null read as zero days |
| T1 | unit · `__tests__/assistantTools.test.ts` | the registry has nine tools, the four at the end in the table's order; each of the four returns its query's result with the period echoed | drop one of the four from `ASSISTANT_TOOLS` |
| T2 | unit · same | two portfolio tools called together → ONE read of each collection; two `patrimonio_giorni` on the same window → ONE archive read; a cashflow tool → none; a rejected read is retried by the next call | read per call; keep the rejected promise |
| T3 | unit · same | an unknown name → `isError` with «Nessun titolo si chiama … Esistono: …», in the four tools; two matches for `patrimonio_storia` and for `patrimonio_giorni` → `isError` naming both; `from` after `to` → `isError`; an empty archive → the note, not an error; the dummy preference reaches `patrimonio_storia` | throw on empty; ignore `includeDummySnapshots` |
| L1 | unit · `__tests__/anthropicStream.test.ts` | the existing assertion on five definitions becomes nine (the same array for two requests, kept); Registra sends none | tools on Registra |
| L2 | unit · same | the loop's return carries `toolNames` in call order | names of the last round only |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the section names the registers and the history, closes with «non nominare mai queste funzioni di calcolo» and the sentence on received and announced; the system is still equal for two users | the old closing sentence |
| C1 | unit · `__tests__/allocationAdviceRun.test.ts` | the strategy's and an interview round's user content have «ULTIMI 30 GIORNI» between the bonds and the plan; the daily read rejecting → the «non è stato letto» block, the run goes on; the system strings with 30 points and with a rejected read are byte-equal | block in the system |
| S1 | unit · `__tests__/assistantRoutes.test.ts` | `@/lib/server/dailySnapshotStore` mocked: the `cashflowBlock` argument of a chat request contains «ULTIMI 30 GIORNI» after the cashflow block; a Registra request has none and makes no daily read; the read rejecting → the «non è stato letto» block, the answer goes on; the route passes the dummy preference to `readAssistantTurnData` | block on Registra |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: the registry answers, on the seeded account, «cosa ho comprato quest'anno» with
the seeded purchases and their total, «quanto ho incassato di dividendi» with two figures, a month range of the net
worth, and — with 30 planted days — the days; the Consulente's strategy request carries the 30-day block.

- A — the diff; the four definitions read aloud. B–E WITHOUT calling the model: a throwaway script inside the repo
  on the emulators imports `buildAssistantToolContext` and `runAssistantTool` and prints each tool's JSON for: B
  the four tools on the seeded account; C an unknown name, a `from > to`, an empty archive, a pension fund by
  month and by day (no unit price); D 130 planted trades (the cap and the totals), an adjustment, a USD dividend
  without conversion (its native amount, the note); E the Consulente's prompt built by `buildStrategyPrompt` over
  the seeded context, printed and read (the block present; with 3 planted days, the «troppo pochi» line). Decoys:
  «ornitorinco» (a baseline row: never listed) and «fenicottero» (a dividend announced for next month: never in
  «incassati»).
- F — at the owner's «pronto», on the mirror with the real model, by his hand: one question on his trades, one on
  his dividends, one on the net worth's last months.

## 8. Putting it into service

No rules, no index (every read is Admin; the `dividends` query by `userId` exists). The first week in production
the route's log line (`[assistant] tools: N calls, R rounds, S s (name×n, …)`, § 4.3) is read for the calls of
the four tools. With phase F closed and the commit in `develop`, the owner opens the PR `develop` → `main` (index
§ 8 rule 13).

## 9. Documentation

- `doc/guide/assistente.md` — § «The tools» gains the four (what each answers, the caps, the lazy reads and their
  memo, the dummy preference, the log's names) and the 30-day block (every mode but Registra, after the cashflow
  block, its three states); § Per-page blind spots: the realised result is fee-free; an adjustment has no total;
  a deleted instrument's trades read «Strumento eliminato» and it cannot be asked by name; pension contributions
  have no tool; the days start at the archive's first day; «incassato» is by the payment DAY; a foreign dividend
  without its euro amounts counts at its native amount; a trade's price is the ledger's (an inflation-linked
  bond's as it was typed); what has no market price has no unit price.
- `doc/guide/consulente.md` — the 30-day block (where it sits, the minimum, the failed read); § Per-page blind
  spots: the agents stay tool-less, the block is their reading of the days.
- `doc/guide/email-pdf.md` § Per-page blind spots — an email request carries no tool, these four included.
- `README.md` — the Assistente's feature lines. `AGENTS.md` § 3 — the stubs of the guides touched rewritten at
  equal or shorter length (decision 47).
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Assistente — le
  operazioni, i dividendi e la storia del patrimonio** — The Assistente now computes on the trade ledger, on
  dividends and coupons and on the net-worth history, month by month and day by day; the Consulente reads the
  last 30 days.»
- `CLAUDE.md` — the Assistente line rewritten at equal or shorter length with «tools on the cashflow, the budget,
  the centres, the ledger, the dividends, the net-worth history»; the «Latest» entry REPLACED whole (decision 46:
  the date, this spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-16»); under 20.000 characters,
  counted with `node`.
- `doc/dati/README.md` § 6 (the row of 15 to `implemented`) and § 7 (C3 as built: the three fields, the optional
  argument, `toolNames`, the four tools).

## 10. Declared out of scope

- A tool on the pension contributions → doc/guide/assistente.md § Per-page blind spots.
- Tools for the Consulente's agents → doc/guide/consulente.md § Per-page blind spots (they stay tool-less; the
  block is their reading).
- The periodic emails reading these tools → doc/guide/email-pdf.md § Per-page blind spots (an email request
  carries no tool, DATI-08/09).
- Recording a trade from the chat → DATI-16.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-15-assistente-strumenti-patrimonio.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C3, che questa spec estende, C1 e C6 —, regole della serie)
- Leggi doc/guide/assistente.md, doc/guide/consulente.md, doc/guide/registro-operazioni.md,
  doc/guide/cashflow-dividendi.md, doc/guide/email-pdf.md, doc/guide/server.md e
  doc/guide/e2e-emulatori.md PRIMA di scrivere codice in quei domini
- Tocca l'API di Anthropic: usa la skill claude-api prima di toccare la chiamata o le definizioni
  degli strumenti
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: le interrogazioni pure con Q1–Q8, il blocco dei 30
giorni (B1, B2), il contesto con le letture a richiesta e i quattro strumenti (T1–T3, L1), i nomi nel
log del ciclo (L2), le frasi del prompt (P1), il blocco al Consulente (C1) e all'Assistente (S1), i
documenti del § 9 e la riga 15 di doc/dati/README.md § 6 a `implemented` (C3 nel § 7 com'è costruito).
OGNI test del § 6 va visto rosso con la sua mutazione. Il codice dei §§ 4.1 e 4.2 è già scritto:
copialo.

Fermati e chiedimi se: DATI-09, DATI-02, DATI-12, DATI-05 o DATI-06 non sono in develop con i contratti
dell'indice (defineAssistantTool, readAssistantTurnData, readDailyPoints, hasNoMarketPrice,
DELETED_INSTRUMENT_NAME, settledTotalEur — nomi o firme diversi), il prompt di sistema smette di essere
identico tra due utenti, oppure un prompt di sistema del Consulente cambia.

Collaudo: § 7 senza chiamare il modello; la F al mio «pronto», di mia mano. Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A commit in develop,
ricordami la PR develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an M spec that extends a shared contract (C3) and touches two AI
surfaces whose system prompts must not move. Estimated size: M (two pure modules, four tools, the context's lazy
reads, 18 tests).
