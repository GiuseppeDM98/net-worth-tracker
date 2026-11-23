# DATI-15 — Assistente: the tools on the trade ledger, the dividends and the net-worth history; the last 30 days to the Consulente

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-09 (contract C3: the tool registry, the loop,
> the context) and DATI-02 (contract C1: `readDailyPoints`, `DailyPoint`).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's points 8 and 5; decisions 17, 11.

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
   withheld tax and — for a sale — the realised result, plus the totals of ALL the matching rows. Proof: Q1–Q3.
3. `dividendi_cedole` sums dividends and coupons of a period by instrument, month, year or kind, in EUR, with
   «incassati» and «annunciati» always two figures. Proof: Q4, Q5.
4. `patrimonio_storia` returns the month-end net worth, the liquid net worth and the classes between two months, or
   one instrument's quantity, unit price and value. Proof: Q6, Q7.
5. `patrimonio_giorni` returns the daily points of the archive (at most 120 days), or one instrument's; with no
   archive it says so. Proof: Q8, T3.
6. The reads behind these tools happen only when a tool asks, once per request. Proof: T2.
7. The Consulente's data block (strategy, interview, revision) and the Assistente's data of every mode but
   Registra carry «ULTIMI 30 GIORNI» from the archive; with fewer than 5 days the block says the archive is too
   young. No system prompt changes by a byte for it. Proof: B1, B2, C1, S1.
8. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green.

## 3. Decisions

- **Decision 17** (owner, 2026-11-23): besides the cashflow, the tools cover the budget and the cost centres
  (DATI-09), the trade ledger and the dividends, and the net-worth history.
- **Decision 11** (owner, 2026-11-23): the daily archive is read by the Assistente and the Consulente.
- Adopted, reversible:
  - (a) both read the last 30 days as a block (decision 11); beyond 30 days, or for one instrument, the Assistente
    asks the tool — the Consulente's agents have no tools.
  - (b) filters are by instrument NAME or ticker, folded as DATI-09 folds category names (`foldName`).
  - (c) a tool's read is lazy and memoised on the context: a question about spending pays nothing for it; a question
    about trades re-reads what the mode's builder may have read (four queries, accepted).
  - (d) pension contributions get no tool (the portfolio block carries them; Previdenza is not in decision 17).
  - (e) caps: 100 trades shown, 120 days, 60 months.

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
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { foldName } from '@/lib/utils/assistantExpenseQueries';
import { replayTransactionsWithEffects } from '@/lib/utils/assetTransactionUtils';
import { hasNoUnitPrice, snapshotUnitPrice } from '@/lib/utils/assetPerformanceDeltas';
import { dailyUnitPrice, type DailyPoint } from '@/lib/utils/dailySnapshot';

export const TRADES_CAP = 100;
export const DAYS_CAP = 120;
export const MONTHS_CAP = 60;

type Named = Pick<Asset, 'id' | 'name' | 'ticker'>;

/** The instruments a name or a ticker points at; the misses come back to be told to the model. */
export function resolveInstruments(names: readonly string[] | undefined, assets: readonly Named[]): { ids: Set<string> | null; unknown: string[] } {
  if (!names || names.length === 0) return { ids: null, unknown: [] };
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const name of names) {
    const wanted = foldName(name);
    const hits = assets.filter((asset) => foldName(asset.name) === wanted || foldName(asset.ticker ?? '') === wanted);
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
  quantity: number;
  priceEur: number;
  /** quantity × priceEur, before fees. */
  totalEur: number;
  feesEur: number;
  withheldTaxEur: number | null;
  /** Sell only: against the average cost at the sale, fees apart; null when the history does not replay. */
  realizedEur: number | null;
}

export interface TradesResult {
  rows: number;
  omitted: number;
  lines: TradeLine[];
  totals: { boughtEur: number; soldEur: number; feesEur: number; realizedEur: number; withheldTaxEur: number };
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
    .sort((a, b) => b.iso.localeCompare(a.iso));

  const totals = { boughtEur: 0, soldEur: 0, feesEur: 0, realizedEur: 0, withheldTaxEur: 0 };
  const lines: TradeLine[] = matching.map(({ trade, iso }) => {
    const totalEur = roundToCents(trade.quantity * trade.priceEur);
    const realizedEur = trade.type === 'sell' ? (realized.get(trade.id) ?? null) : null;
    if (trade.type === 'buy') totals.boughtEur += totalEur;
    if (trade.type === 'sell') totals.soldEur += totalEur;
    totals.feesEur += trade.fees ?? 0;
    totals.realizedEur += realizedEur ?? 0;
    totals.withheldTaxEur += trade.withheldTaxEur ?? 0;
    const asset = names.get(trade.assetId);
    return {
      date: iso,
      instrument: asset?.name ?? 'Strumento eliminato',
      ticker: asset?.ticker ?? '',
      type: trade.type,
      quantity: trade.quantity,
      priceEur: trade.priceEur,
      totalEur,
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
      withheldTaxEur: roundToCents(totals.withheldTaxEur),
    },
  };
}

export type DividendGroupBy = 'instrument' | 'month' | 'year' | 'kind';

export interface DividendGroup {
  key: string;
  /** Paid on or before today. */
  received: { gross: number; tax: number; net: number; count: number };
  /** Payment day after today: announced, not money yet. */
  announced: { gross: number; tax: number; net: number; count: number };
}

const emptySide = () => ({ gross: 0, tax: 0, net: 0, count: 0 });

/** A dividend's EUR amounts: the converted ones when the record is in another currency. */
function eurOf(dividend: Dividend): { gross: number; tax: number; net: number } {
  const foreign = dividend.currency !== 'EUR';
  return {
    gross: foreign ? (dividend.grossAmountEur ?? 0) : dividend.grossAmount,
    tax: foreign ? (dividend.taxAmountEur ?? 0) : dividend.taxAmount,
    net: foreign ? (dividend.netAmountEur ?? 0) : dividend.netAmount,
  };
}

export function dividendTotals(
  dividends: readonly Dividend[],
  query: { from: string; to: string; instrumentIds: Set<string> | null },
  by: DividendGroupBy,
  todayIso: string
): { groups: DividendGroup[]; total: DividendGroup; unconverted: number } {
  const groups = new Map<string, DividendGroup>();
  const total: DividendGroup = { key: 'Totale', received: emptySide(), announced: emptySide() };
  let unconverted = 0;
  for (const dividend of dividends) {
    const iso = getItalyDateIso(dividend.paymentDate);
    if (iso < query.from || iso > query.to) continue;
    if (query.instrumentIds && !query.instrumentIds.has(dividend.assetId)) continue;
    if (dividend.currency !== 'EUR' && dividend.netAmountEur === undefined) unconverted++;
    const key = by === 'instrument' ? dividend.assetName : by === 'month' ? iso.slice(0, 7) : by === 'year' ? iso.slice(0, 4) : dividend.dividendType;
    const group = groups.get(key) ?? { key, received: emptySide(), announced: emptySide() };
    groups.set(key, group);
    const amounts = eurOf(dividend);
    for (const side of [iso <= todayIso ? group.received : group.announced, iso <= todayIso ? total.received : total.announced]) {
      side.gross = roundToCents(side.gross + amounts.gross);
      side.tax = roundToCents(side.tax + amounts.tax);
      side.net = roundToCents(side.net + amounts.net);
      side.count++;
    }
  }
  const sorted = [...groups.values()].sort((a, b) =>
    by === 'month' || by === 'year' ? a.key.localeCompare(b.key) : b.received.net + b.announced.net - (a.received.net + a.announced.net));
  return { groups: sorted, total, unconverted };
}

export interface MonthPoint {
  month: string;
  netWorth: number;
  liquid: number;
  byClass: Record<string, number>;
}

/** Month-end points between two months (`YYYY-MM`), ascending; the newest `MONTHS_CAP` when more. */
export function netWorthMonths(snapshots: readonly MonthlySnapshot[], fromMonth: string, toMonth: string): { points: MonthPoint[]; omitted: number } {
  const points = snapshots
    .filter((snapshot) => !snapshot.isDummy)
    .map((snapshot) => ({ snapshot, month: `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}` }))
    .filter(({ month }) => month >= fromMonth && month <= toMonth)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ snapshot, month }) => ({ month, netWorth: snapshot.totalNetWorth, liquid: snapshot.liquidNetWorth, byClass: snapshot.byAssetClass ?? {} }));
  return { points: points.slice(-MONTHS_CAP), omitted: Math.max(0, points.length - MONTHS_CAP) };
}

export interface InstrumentMonthPoint {
  month: string;
  quantity: number;
  /** EUR per unit; null for a type without a unit price. */
  unitPrice: number | null;
  value: number;
}

export function instrumentMonths(snapshots: readonly MonthlySnapshot[], asset: Asset, fromMonth: string, toMonth: string): InstrumentMonthPoint[] {
  const priced = !hasNoUnitPrice(asset);
  const points: InstrumentMonthPoint[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.isDummy) continue;
    const month = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    if (month < fromMonth || month > toMonth) continue;
    const row = (snapshot.byAsset ?? []).find((item) => item.assetId === asset.id);
    if (!row) continue;
    points.push({ month, quantity: row.quantity, unitPrice: priced ? snapshotUnitPrice(row, asset.type === 'realestate') : null, value: row.totalValue });
  }
  return points.sort((a, b) => a.month.localeCompare(b.month)).slice(-MONTHS_CAP);
}

export interface DayPoint {
  day: string;
  netWorth: number;
  liquid: number;
  byClass: Record<string, number>;
}

export function netWorthDays(points: readonly DailyPoint[]): DayPoint[] {
  return points.slice(-DAYS_CAP).map((point) => ({ day: point.iso, netWorth: point.netWorth, liquid: point.liquid, byClass: point.byClass }));
}

export function instrumentDays(points: readonly DailyPoint[], assetId: string): Array<{ day: string; quantity: number; unitPrice: number | null; value: number }> {
  return points.slice(-DAYS_CAP).flatMap((point) => {
    const row = point.assets[assetId];
    return row ? [{ day: point.iso, quantity: row.q, unitPrice: dailyUnitPrice(row), value: row.v }] : [];
  });
}
```

`snapshotUnitPrice` and the exported `hasNoUnitPrice` are DATI-12 § 4.1; with DATI-12 not yet in `develop` this
session makes that same extraction (the code is written there) — the two sessions then agree by construction.

### 4.2 The 30-day block — `lib/utils/dailyBlock.ts` (new, written here)

```ts
/**
 * The last 30 days of the daily archive as a block of the Consulente's data (2026-11-23): where the
 * net worth and the classes went in the last weeks, which the monthly history cannot say.
 */
import type { DailyPoint } from '@/lib/utils/dailySnapshot';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { formatCurrency } from '@/lib/utils/formatters';

export const DAILY_BLOCK_DAYS = 30;
export const DAILY_BLOCK_MIN_POINTS = 5;

const signedPct = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')}%`;

export function formatDailyBlockForPrompt(points: readonly DailyPoint[]): string[] {
  const header = `--- ULTIMI ${DAILY_BLOCK_DAYS} GIORNI (archivio giornaliero: una riga per giorno, patrimonio netto a fine giornata) ---`;
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

`AssistantToolContext` gains ONE field (nothing else of C3 changes):

```ts
export interface AssistantPortfolioReads {
  assets: Asset[];
  trades: AssetTransaction[];
  dividends: Dividend[];
  snapshots: MonthlySnapshot[];
}

export interface AssistantToolContext {
  // … the fields of DATI-09, unchanged …
  /** The portfolio documents, read at the first tool that asks and kept for the request. */
  portfolio: () => Promise<AssistantPortfolioReads>;
  /** The daily archive between two Italian days. */
  daily: (fromIso: string, toIso: string) => Promise<DailyPoint[]>;
}
```

`context.ts` (`buildAssistantToolContext`): `portfolio` is a memoised closure over one `Promise.all` of
`getUserAssetsAdmin`, `getAssetTransactionsAdmin`, `getUserSnapshotsAdmin` and a new `getUserDividendsAdmin(userId)`
in `lib/server/assetAdminRepository.ts` (the `dividends` query and the date mapping of `fetchPortfolioDocuments`,
`assistantMonthContextService.ts:300`, `:310`, moved there and called from both); `daily` is
`(from, to) => readDailyPoints(adminDb, userId, from, to)`. A rejected read is not memoised.

Four files beside the five of DATI-09, added to `ASSISTANT_TOOLS`; descriptions in Italian (they are prompt):

| name | description | input (strict) |
|---|---|---|
| `operazioni_registro` | «Elenca le operazioni del registro (acquisti, vendite, rettifiche) in un periodo, anche per uno o più strumenti: per ciascuna data, quantità, prezzo in euro, controvalore, commissioni, tasse trattenute e — per una vendita — il risultato realizzato. Restituisce anche i totali di TUTTE le operazioni che corrispondono. Usalo per "cosa ho comprato quest'anno", "quanto ho realizzato vendendo X", "quante commissioni ho pagato".» | `from`, `to` (`YYYY-MM-DD`), `instruments?: string[]`, `types?: ('buy' \| 'sell' \| 'adjustment')[]`, `limit?: 1..100` |
| `dividendi_cedole` | «Somma dividendi e cedole per data di pagamento in un periodo, raggruppati per strumento, mese, anno o tipo, in euro: lordo, ritenute e netto. Gli incassati (pagati fino a oggi) e gli annunciati (pagamento futuro) sono sempre due cifre distinte: non sommarle mai.» | `from`, `to`, `groupBy: 'instrument' \| 'month' \| 'year' \| 'kind'`, `instruments?: string[]` |
| `patrimonio_storia` | «La storia a fine mese: patrimonio netto, patrimonio liquido e valore per classe tra due mesi; oppure, con uno strumento, la sua quantità, il prezzo unitario in euro e il valore mese per mese. Al più 60 mesi.» | `fromMonth`, `toMonth` (`YYYY-MM`), `instrument?: string` |
| `patrimonio_giorni` | «I punti giornalieri dell'archivio (al più gli ultimi 120 giorni): patrimonio netto, liquido e classi giorno per giorno; oppure, con uno strumento, quantità, prezzo unitario e valore. L'archivio parte dal giorno in cui è stato attivato: prima non esistono giorni.» | `days: 1..120`, `instrument?: string` |

Runs:
- `operazioni_registro` and `dividendi_cedole`: `from ≤ to` or `AssistantToolError`; `resolveInstruments(input.
  instruments, reads.assets)` — `unknown` non-empty → `AssistantToolError('Strumento sconosciuto: «X». Esistono: A,
  B, C…')` (the first 40 names); then `listTrades` / `dividendTotals`, the result with `{ period, today }` echoed.
  `dividendTotals`'s `unconverted > 0` is returned as `note: '{n} righe in valuta senza controvalore in euro: non
  sono nelle somme.'`.
- `patrimonio_storia`: without `instrument` → `netWorthMonths` (classes keyed by their Italian label,
  `ASSET_CLASS_LABELS`); with it → the ONE instrument `resolveInstruments` finds (more than one →
  `AssistantToolError('«X» corrisponde a più strumenti: A, B. Scegline uno.')`) → `{ instrument, points:
  instrumentMonths(...) }`.
- `patrimonio_giorni`: `toIso = context.todayIso`, `fromIso = isoDaysBefore(toIso, days - 1)`; no point →
  `{ days: 0, note: "L'archivio giornaliero non ha ancora giorni in questo intervallo." }`; else `netWorthDays` or
  `instrumentDays`.

### 4.4 The prompt — `lib/server/assistant/prompts.ts`

In the section «# Gli strumenti sui tuoi dati (quando la richiesta te li dà)» (DATI-09) the first sentence becomes:
«Quando la richiesta ti dà strumenti che interrogano il cashflow registrato, il budget, i centri di costo, il
registro delle operazioni, i dividendi e la storia del patrimonio (a fine mese e giorno per giorno), i conti li fa
il codice e tu li chiedi.» — the rest of the section is unchanged. One sentence is added at its end: «Dividendi
incassati e annunciati restano due cifre: non presentarne mai la somma come incasso.»

### 4.5 The Consulente — `lib/server/allocationAdvice/run.ts`

`buildConsulenteContext` (`:324-332`): a fourth read in the `Promise.all` —
`readDailyPoints(adminDb, userId, isoDaysBefore(todayIso, DAILY_BLOCK_DAYS - 1), todayIso).catch(() => [])` with
`todayIso = getItalyDateIso(now)` — and the data block becomes
`${formatBundleForPrompt(bundle)}\n\n${bondBlock}\n\n${formatDailyBlockForPrompt(daily).join('\n')}\n\n${formatAccumulationPlanForPrompt(planRead)}`.
No prompt constant changes: the block describes itself in its header, inside the user content.

### 4.6 The Assistente's block — `app/api/ai/assistant/stream/route.ts`

Where the route reads the cashflow block (`:337`; after DATI-09, where it builds the tool context) it also reads
`readDailyPoints(adminDb, body.userId, isoDaysBefore(todayIso, DAILY_BLOCK_DAYS - 1), todayIso).catch(() => [])`,
and the string it passes as `cashflowBlock` (`:405`) becomes, for every mode but Registra,
`${cashflowBlock}\n\n${formatDailyBlockForPrompt(daily).join('\n')}` — the block follows the cashflow's under the
same note (`formatCashflowBlockSection`, `prompts.ts:972-974`) and names itself in its header. Registra's request
carries the cashflow block alone. The periodic emails are not this route: they get no daily block.

## 5. Constraints and traps

- **C3 is extended, never changed**: the registry's types, `runAssistantTool`, the loop and its cap are DATI-09's.
  `ASSISTANT_TOOL_DEFINITIONS` stays ONE array, the same for every request (the cache prefix).
- **The system prompt is static and byte-identical across users** (`expect(a.system).toBe(b.system)`,
  `__tests__/assistantPromptBundle.test.ts:596`): the two sentences are constants. The Consulente's system prompts are
  untouched — C1 holds it.
- **Received and announced are never one figure** (doc/guide/cashflow-dividendi.md): the tool returns two sides and
  no sum of them.
- **The realised result is fee-free** (`LedgerTransactionEffect`, `assetTransactionUtils.ts:156-158`): the tool
  names fees and withheld tax beside it; it never nets them.
- **A baseline is not a trade** (`isBaseline`): it is filtered out — it is the opening position of a migrated
  instrument.
- **Admin reads, by `userId` of the verified token** (doc/guide/server.md): the tools never take a user id from the
  model.
- **A probe never spends**: the tests fake the SDK; § 7 calls no real model.
- **Italian day** for every date filter (`getItalyDateIso`); fixtures at noon.
- **No owner data**: «ETF Alfa», «Azione Beta», round figures.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| Q1 | unit · `__tests__/assistantPortfolioQueries.test.ts` | trades of a period, newest first; a trade at 23:30 UTC of 31 December counts in the next year; the baseline is not listed | `toISOString` day |
| Q2 | unit · same | buy 10 at 100, sell 4 at 130 → the sale's `realizedEur` 120, totals bought 1.000, sold 520, fees and withheld tax summed apart; a history that does not replay → `realizedEur: null`, rows still listed | net the fee into realised |
| Q3 | unit · same | 130 matching, limit 100 → 100 lines, `omitted: 30`, totals of all 130; `resolveInstruments` finds «etf alfa», a ticker, a partial name; a miss is in `unknown` | totals of the shown |
| Q4 | unit · same | a dividend paid yesterday is `received`, one paid tomorrow `announced`; the total has two sides and no sum | one side |
| Q5 | unit · same | a USD dividend uses its EUR amounts; one without them is counted in `unconverted` and adds zero; groups by month ascending, by instrument by size | native amount as EUR |
| Q6 | unit · same | `netWorthMonths` between two months, ascending, dummies out, 70 months → the newest 60 and `omitted: 10` | oldest 60 |
| Q7 | unit · same | `instrumentMonths`: quantity, unit price, value; a cash account has `unitPrice: null` | — |
| Q8 | unit · same | `netWorthDays` keeps the last 120; `instrumentDays` skips the days without the instrument | first 120 |
| B1 | unit · `__tests__/dailyBlock.test.ts` | 30 points → header, the span, min and max with their days, one line per class with its percent; a class at zero on both ends is not listed | min for max |
| B2 | unit · same | 4 points → the «troppo pochi» line and nothing else | threshold off by one |
| T1 | unit · `__tests__/assistantTools.test.ts` | the registry has nine tools; each of the four returns its query's result with the period echoed | — (wiring) |
| T2 | unit · same | two portfolio tools in one request → ONE read of each collection; a cashflow tool → none; a rejected read is retried by the next call | read per call |
| T3 | unit · same | an unknown instrument → `isError` with «Esistono: …»; two matches for `patrimonio_storia` → `isError` naming both; an empty archive → the note, not an error | throw on empty |
| L1 | unit · `__tests__/anthropicStream.test.ts` | chat sends nine definitions; Registra none | — |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the section names the registers; the system is still equal for two users | — |
| C1 | unit · `__tests__/allocationAdviceRun.test.ts` | the strategy's user content has «ULTIMI 30 GIORNI» between the bonds and the plan; the daily read rejecting → the «troppo pochi» block, the run goes on; every system string is byte-equal to before | block in the system |
| S1 | unit · `__tests__/assistantRoutes.test.ts` | a chat request's user content has «ULTIMI 30 GIORNI» after the cashflow block; a Registra request has none; the daily read rejecting → the «troppo pochi» block, the answer goes on | block on Registra |
| E1 | e2e · `e2e/assistant.chat.spec.ts` (fake SSE) | a `status: computing` event followed by text renders the wait then the answer (the wiring of DATI-09 still holds with nine tools) | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: the registry answers, on the seeded account, «cosa ho comprato quest'anno» with
the seeded purchases and their total, «quanto ho incassato di dividendi» with two figures, a month range of the net
worth, and — with 30 planted days — the days; the Consulente's strategy request carries the 30-day block.

- A — the diff. B–E WITHOUT calling the model: a throwaway script on the emulators imports `buildAssistantToolContext`
  and `runAssistantTool` and prints each tool's JSON for: B the four tools on the seeded account; C an unknown
  instrument, a `from > to`, an empty archive; D 130 planted trades (the cap and the totals), a USD dividend without
  conversion; E the Consulente's prompt built by `buildStrategyPrompt` over the seeded context, printed and read
  (the block present; with 3 planted days, the «troppo pochi» line). Decoys: «ornitorinco» (a baseline row: never
  listed) and «fenicottero» (a dividend announced for next month: never in «incassati»).
- F — at the owner's «pronto», on the mirror with the real model, by his hand: one question on his trades, one on
  his dividends, one on the net worth's last months.

## 8. Putting it into service

No rules, no index (every read is Admin; the `dividends` query by `userId` exists). The first week in production
the route's log line (`[assistant] tools: N calls, R rounds`, DATI-09) is read for the calls of the four tools.

## 9. Documentation

- `doc/guide/assistente.md` — § «The tools» gains the four (what each answers, the caps, the lazy read); § blind
  spots: the realised result is fee-free; a deleted instrument's trades read «Strumento eliminato»; pension
  contributions have no tool; the days start at the archive's first day.
- `doc/guide/consulente.md` — the 30-day block (where it sits, the minimum, the failed read).
- `doc/guide/assistente.md` also gets the block: every mode but Registra, after the cashflow block.
- `doc/guide/server.md` — `getUserDividendsAdmin`.
- `README.md` — the Assistente's feature lines. `Draft Release Temp.md` — «L'Assistente risponde sulle operazioni,
  sui dividendi e sulla storia del patrimonio, anche giorno per giorno».
- `CLAUDE.md` — Assistente line: «tools on the cashflow, the budget, the centres, the ledger, the dividends, the
  net-worth history (2026-11)», under 20.000 characters.
- `doc/dati/README.md` § 6 and § 7 (C3: the added field and the four tools).

## 10. Declared out of scope

- A tool on the pension contributions → doc/guide/assistente.md § blind spots.
- Tools for the Consulente's agents → doc/guide/consulente.md § blind spots (they stay tool-less; the block is
  their reading).
- The periodic emails reading these tools → doc/guide/email-pdf.md § blind spots (an email request carries no
  tool, DATI-08/09).
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
  condivisi — qui C3, da estendere senza cambiarlo, e C1 —, regole della serie)
- Leggi doc/guide/assistente.md, doc/guide/consulente.md, doc/guide/registro-operazioni.md,
  doc/guide/cashflow-dividendi.md e doc/guide/server.md PRIMA di scrivere codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: le interrogazioni pure con Q1–Q8 (ognuno visto
rosso con la sua mutazione), il blocco dei 30 giorni (B1, B2), il contesto con le letture a richiesta
e i quattro strumenti (T1–T3, L1), le due frasi del prompt (P1), il blocco al Consulente (C1) e
all'Assistente (S1), poi E1.
Il codice dei §§ 4.1 e 4.2 è già scritto: copialo.

Fermati e chiedimi se: DATI-09 o DATI-02 non sono in develop con i contratti dell'indice, il prompt di
sistema smette di essere identico tra due utenti, oppure un prompt di sistema del Consulente cambia.

Collaudo: § 7 senza chiamare il modello; la F al mio «pronto», di mia mano. Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec that extends a shared contract (C3) and touches two AI
surfaces whose system prompts must not move. Estimated size: M (two pure modules, four tools, one server reader,
~17 tests).
