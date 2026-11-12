/**
 * The pure figures behind Patrimonio's tiles — cash accounts, the month's trades, the unrealized
 * gain over the cost basis, the ranking of instrument returns, the concentration of the largest
 * positions and the last price update. Every number the page shows that is not already in the
 * overview payload is born here, with a test, never inside a component.
 *
 * Deliberately imports nothing from Firebase: `calculateAssetValue` (assetService) is the only
 * service dependency, and it is the single definition of an asset's EUR value.
 */

import { isCashAccount, type Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { DashboardOverviewTopAsset } from '@/types/dashboardOverview';
import { calculateAssetValue } from '@/lib/services/assetService';
import { costBasisPerUnitEur } from '@/lib/utils/costBasisEur';
import { hasMarketPrice } from '@/lib/utils/assetPricing';
import { getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { getNextCouponDate, hasCouponPayments } from '@/lib/utils/couponUtils';
import { narrativeToText, type Narrative, type PageVerdictModel } from '@/lib/utils/narrative';
import { formatStripFigure, type StripFigure } from '@/lib/utils/verdictStrip';
import { cachedFormatCurrencyEUR, formatPercentageIt, formatSignedEuro, formatSignedPercentIt, printedSign, withTypographicMinus } from '@/lib/utils/formatters';
import { describeLeadingClass } from '@/lib/utils/overviewNarrative';
import { describeOwnershipAnswer, pluralArticleFor, shortMonthYear } from '@/lib/utils/patrimonioNarrative';
import type { MortgageSummary } from '@/lib/utils/mortgageSummary';
import type { OwnershipSummary } from '@/lib/utils/assetOwnership';

// ─── Bond row facts ───────────────────────────────────────────────────────────

export interface BondRowFacts {
  maturityDate: Date;
  hasCoupons: boolean;
  /** The next coupon date from the schedule; null for a zero coupon or a matured bond. */
  nextCoupon: Date | null;
}

/**
 * What a bond row says under its name (maturity, next coupon) — the dates the coupon scheduler
 * already knows, read once for the table. Null for anything that is not a bond with details.
 * The dates come through `toDate` because a Firestore `Timestamp` survives in `bondDetails`.
 */
export function resolveBondRowFacts(asset: Asset): BondRowFacts | null {
  if (asset.type !== 'bond' || !asset.bondDetails) return null;
  const maturityDate = toDate(asset.bondDetails.maturityDate);
  if (Number.isNaN(maturityDate.getTime())) return null;
  const hasCoupons = hasCouponPayments(asset.bondDetails);
  const nextCoupon = hasCoupons
    ? getNextCouponDate(toDate(asset.bondDetails.issueDate), asset.bondDetails.couponFrequency, maturityDate)
    : null;
  return { maturityDate, hasCoupons, nextCoupon };
}

// ─── Cash accounts ────────────────────────────────────────────────────────────

// The cash-ACCOUNT rule lives in types/assets.ts since 2026-11; re-exported so its callers stay as they are.
export { isCashAccount };

/**
 * A row of the Liquidità tile: a cash account, or a loan that finances no property (owner,
 * 2026-10-10: a personal loan is negative liquidity, like a credit card — it reads «debito» beside
 * the accounts). A mortgage sits in the Immobili class and is not liquidity. Wider than
 * `isCashAccount` on purpose: a loan is never a settlement account, so the picker rule stays.
 */
export function isLiquidityRow(asset: Pick<Asset, 'type' | 'assetClass'>): boolean {
  return isCashAccount(asset) || (asset.type === 'loan' && asset.assetClass === 'cash');
}

/**
 * A position still held. `quantity = 0` marks a sold asset (doc/guide/patrimonio.md § Asset Pricing, FX and Assets): it stays
 * in the table with its «Azzerato» badge, but it is not something the user owns — every count,
 * share and sum on the page runs over held positions only.
 */
export function isHeld(asset: Pick<Asset, 'quantity'>): boolean {
  return asset.quantity > 0;
}

export interface CashAccountRow {
  id: string;
  name: string;
  /** EUR balance (a foreign-currency account through its converted price). */
  balance: number;
  /**
   * Share of the money HELD on accounts (the positive balances), 0-100; null for an account in the red
   * — a credit card is a debt, and a share of a total that nets it out read «138%» and «−57%».
   */
  shareOfCash: number | null;
}

export interface CashAccountsSummary {
  /** Largest balance first. */
  accounts: CashAccountRow[];
  total: number;
  /** Share of the gross portfolio total, 0-100; null without a total to measure against. */
  shareOfTotal: number | null;
  largest: CashAccountRow | null;
}

export function summarizeCashAccounts(cashAccounts: Asset[], totalValue: number): CashAccountsSummary {
  const valued = cashAccounts
    .map((asset) => ({ id: asset.id, name: asset.name, balance: calculateAssetValue(asset) }))
    .sort((a, b) => b.balance - a.balance);
  const total = valued.reduce((sum, row) => sum + row.balance, 0);
  const held = valued.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
  const accounts = valued.map((row) => ({ ...row, shareOfCash: row.balance < 0 ? null : held > 0 ? (row.balance / held) * 100 : 0 }));
  return {
    accounts,
    total,
    shareOfTotal: totalValue > 0 ? (total / totalValue) * 100 : null,
    largest: accounts[0] ?? null,
  };
}

// ─── The month's trades ───────────────────────────────────────────────────────

export interface MonthTradeRow {
  id: string;
  assetId: string;
  date: Date;
  type: 'buy' | 'sell';
  /** Money that moved: buy = gross + fees, sell = gross − fees (the ledger engine's definition). */
  amountEur: number;
}

export interface MonthTradesSummary {
  bought: number;
  sold: number;
  /** bought − sold: what the month added to the invested capital. */
  net: number;
  count: number;
  /** Newest first. */
  rows: MonthTradeRow[];
}

/**
 * Buys and sells of one Italian calendar month. Migration baselines are opening positions, not
 * purchases, and an adjustment resets a quantity without moving money: both are skipped. The
 * EUR amount follows `computeInvestedCapital` in assetTransactionUtils — fees enter a buy and
 * leave a sell.
 */
export function summarizeMonthTrades(
  transactions: AssetTransaction[],
  period: { month: number; year: number },
): MonthTradesSummary {
  const rows: MonthTradeRow[] = [];
  for (const trade of transactions) {
    if (trade.isBaseline || trade.type === 'adjustment') continue;
    const { month, year } = getItalyMonthYear(trade.date);
    if (month !== period.month || year !== period.year) continue;
    const gross = trade.quantity * trade.priceEur;
    const fees = trade.fees ?? 0;
    rows.push({
      id: trade.id,
      assetId: trade.assetId,
      date: trade.date,
      type: trade.type,
      amountEur: trade.type === 'buy' ? gross + fees : gross - fees,
    });
  }
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  const bought = rows.filter((r) => r.type === 'buy').reduce((sum, r) => sum + r.amountEur, 0);
  const sold = rows.filter((r) => r.type === 'sell').reduce((sum, r) => sum + r.amountEur, 0);
  return { bought, sold, net: bought - sold, count: rows.length, rows };
}

// ─── Unrealized gains ─────────────────────────────────────────────────────────

export interface UnrealizedGainsSummary {
  gainLoss: number;
  costBasis: number;
  /** gainLoss over costBasis, 0-100 scale; null when nothing has a cost basis. */
  gainPercent: number | null;
  /** Positions that entered the sum. */
  count: number;
}

/** The EUR PMC to compare against `calculateAssetValue` (itself always EUR) — see costBasisEur.ts. */
export { costBasisPerUnitEur };

/**
 * Whether an asset's G/P against its PMC is meaningful. Cash accounts do not represent invested
 * capital (their cost basis would dilute the percentage without adding any gain), and a pension
 * fund's leftover `averageCost` from a type conversion is not a PMC — its exit taxation is a
 * different regime altogether.
 */
export function hasCostBasis(asset: Asset): boolean {
  if (isCashAccount(asset) || asset.type === 'pensionFund' || !isHeld(asset)) return false;
  // A hand-valued holding (a property, a private-equity commitment) keeps its VALUE in
  // `quantity` at price 1, so any PMC it carries equals the price and the G/P is a structural
  // «+0,00 €» — a zero nothing measured, which the table must not print as one
  // (DESIGN.md → The Absence-Has-Three-Names Rule). Found live on the owner's account, 2026-09-14.
  if (!hasMarketPrice(asset.type, asset.subCategory)) return false;
  const basis = costBasisPerUnitEur(asset);
  return basis !== undefined && basis > 0;
}

/**
 * One position's G/P against its PMC — the figure the table cell, the mobile row and the sort
 * share. Both sides of the subtraction are EUR (see `costBasisPerUnitEur`), so a foreign-currency
 * position is never measured against its own native-currency PMC. Null when `hasCostBasis` says
 * there is no PMC to measure against.
 */
export function computeUnrealizedGain(asset: Asset): { gainLoss: number; gainPercent: number } | null {
  const basis = costBasisOf(asset);
  if (basis === null) return null;
  const gainLoss = calculateAssetValue(asset) - basis;
  return { gainLoss, gainPercent: basis > 0 ? (gainLoss / basis) * 100 : 0 };
}

/**
 * The position's cost in EUR — quantity × the fiscal PMC (`costBasisPerUnitEur`, fees included) —
 * the ONE figure the G/P, the Rendimento tile and the Intestatari tile's «Carico» view stand
 * against `calculateAssetValue`. Null exactly when `hasCostBasis` says there is no PMC to read:
 * an account, a hand-valued holding or a pension fund (their value IS what was put in), a foreign
 * position before its EUR backfill, a sold-out one.
 */
export function costBasisOf(asset: Asset): number | null {
  if (!hasCostBasis(asset)) return null;
  return asset.quantity * (costBasisPerUnitEur(asset) as number);
}

export function summarizeUnrealizedGains(assets: Asset[]): UnrealizedGainsSummary {
  let gainLoss = 0;
  let costBasis = 0;
  let count = 0;
  for (const asset of assets) {
    const gain = computeUnrealizedGain(asset);
    if (!gain) continue;
    gainLoss += gain.gainLoss;
    costBasis += costBasisOf(asset) as number;
    count += 1;
  }
  return {
    gainLoss,
    costBasis,
    gainPercent: costBasis > 0 ? (gainLoss / costBasis) * 100 : null,
    count,
  };
}

// ─── Instrument returns ───────────────────────────────────────────────────────

export interface InstrumentReturnRanking {
  /** Highest `returnPercent` first, at most `bestCount`. */
  best: DashboardOverviewTopAsset[];
  /** The lowest `returnPercent`, when it is not already among the best. */
  worst: DashboardOverviewTopAsset | null;
  /** Positions with a measured return (a cost basis). */
  measuredCount: number;
  /** Instruments the ranking was drawn from — the largest positions, cash accounts excluded. */
  rankedFrom: number;
}

/**
 * The best few and the single worst position by return over PMC, from the overview's
 * `topAssets` (the largest positions, returns already computed server-side — never recomputed
 * here). Positions without a cost basis (`returnPercent === null`) are not ranked, nor are cash
 * accounts and pension funds: the payload computes a "return" on any `averageCost`, but a fund's
 * leftover PMC is not a PMC (same exclusion as `hasCostBasis`), and the tile's KPI must agree.
 */
export function rankInstrumentReturns(topAssets: DashboardOverviewTopAsset[], bestCount = 3): InstrumentReturnRanking {
  const instruments = topAssets.filter((asset) => !(asset.assetType === 'cash' && asset.assetClass === 'cash'));
  const measured = instruments
    .filter((asset): asset is DashboardOverviewTopAsset & { returnPercent: number } => asset.returnPercent !== null)
    .filter((asset) => asset.assetType !== 'pensionFund')
    .sort((a, b) => b.returnPercent - a.returnPercent);
  const best = measured.slice(0, bestCount);
  const last = measured[measured.length - 1];
  const worst = last && !best.includes(last) ? last : null;
  return { best, worst, measuredCount: measured.length, rankedFrom: instruments.length };
}

// ─── Concentration ────────────────────────────────────────────────────────────

/**
 * The share of the gross total held by the `count` largest positions — the concentration the
 * table does not state out loud. Null when the positions are not more than `count` (the
 * largest n would be the whole table) or there is no total.
 */
export function computeTopWeightShare(
  assets: Asset[],
  totalValue: number,
  count = 3,
): { count: number; percent: number } | null {
  const held = assets.filter(isHeld);
  if (totalValue <= 0 || held.length <= count) return null;
  const top = held
    .map((asset) => calculateAssetValue(asset))
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((sum, value) => sum + value, 0);
  return { count, percent: (top / totalValue) * 100 };
}

// ─── Last price update ────────────────────────────────────────────────────────

/**
 * The most recent quote among the market-priced assets. A hand-valued asset's
 * `lastPriceUpdate` is the user's last edit, not a quote, so it does not count — nor does an
 * asset whose automatic updates are switched off.
 */
export function resolveLastPriceUpdate(assets: Asset[]): Date | null {
  let latest: Date | null = null;
  for (const asset of assets) {
    if (!hasMarketPrice(asset.type, asset.subCategory) || asset.autoUpdatePrice === false) continue;
    if (!(asset.lastPriceUpdate instanceof Date)) continue;
    if (!latest || asset.lastPriceUpdate.getTime() > latest.getTime()) latest = asset.lastPriceUpdate;
  }
  return latest;
}

// ─── The phone composition (2026-10-14) ───────────────────────────────────────

/** THE tile of the page (Patrimonio totale lordo): open at every width, never a row (The First-Screen Rule). */
export const PATRIMONIO_PATRIMONIO_ID = 'patrimonio-patrimonio';

/**
 * The rows below `desktop:`, in the DOM's order (The First-Screen Rule). A loan's «Mutuo» row is
 * `patrimonio-mutuo-<loanId>` (`patrimonioMutuoSectionId`), one per loan with linked instalments;
 * a failed read of the instalments is ONE row, `mutuo`.
 */
export const PATRIMONIO_SECTION_IDS = {
  movimenti: 'patrimonio-movimenti',
  liquidita: 'patrimonio-liquidita',
  classi: 'patrimonio-classi',
  rendimento: 'patrimonio-rendimento',
  mutuo: 'patrimonio-mutuo',
  // «Intestatari» (2026-10-17): present only when a held asset names a person.
  intestatari: 'patrimonio-intestatari',
  strumenti: 'patrimonio-strumenti',
} as const;

/** The row of one loan's «Mutuo» tile: a row opened before the first-visit migration closes after it (its id changes). */
export function patrimonioMutuoSectionId(loanId: string): string {
  return `${PATRIMONIO_SECTION_IDS.mutuo}-${loanId}`;
}

/** The block of `RendimentoTile` the strip lifts: the «G/P non realizzato» KPI. */
export const PATRIMONIO_GAIN_BLOCK = 'gain';

/**
 * The two figures under the verdict on a phone (The First-Screen Rule; doc/guide/patrimonio.md
 * § Composizione mobile): the unrealized gain over the cost basis, with the cents the Rendimento
 * tile prints (its KPI is lifted), and the share of the gross total on the accounts, which repeats
 * the Liquidità READING — a reading stays whole (The Lifted-Figure Rule). The month's change is in
 * the verdict's first sentence, the total is THE tile's hero (never lifted). If the census counts
 * more than five figures outside the verdict, the Liquidità cell is the one to go.
 */
export function selectPatrimonioStrip({ gains, cash }: { gains: UnrealizedGainsSummary; cash: CashAccountsSummary }): StripFigure[] {
  const cashReason =
    cash.accounts.length === 0
      ? 'nessun conto registrato'
      : cash.shareOfTotal === null
        ? 'nessun totale su cui misurarla'
        : cash.shareOfTotal <= 0
          ? 'i debiti superano i conti'
          : null;
  return [
    {
      label: 'G/P non realizzato',
      value: gains.count > 0 ? gains.gainLoss : null,
      format: 'signed-currency',
      decimals: 2,
      opens: PATRIMONIO_SECTION_IDS.rendimento,
      lifts: { section: PATRIMONIO_SECTION_IDS.rendimento, block: PATRIMONIO_GAIN_BLOCK },
      ...(gains.count > 0 ? {} : { reason: 'nessuna posizione con un prezzo di carico' }),
    },
    {
      label: 'Liquidità',
      value: cashReason === null ? cash.shareOfTotal : null,
      format: 'percent',
      decimals: 1,
      opens: PATRIMONIO_SECTION_IDS.liquidita,
      ...(cashReason === null ? {} : { reason: cashReason }),
    },
  ];
}

/**
 * Whether the verdict names the market in words — then THE tile's «Mercato:» digest is lifted on a
 * phone (its words are behind «Il perché»), otherwise it stays. The Panoramica's
 * `verdictNamesMarket` on the built model: the sentence names it only with a top mover and a
 * measured market effect, or with the month's split.
 */
export function patrimonioVerdictNamesMarket(verdict: PageVerdictModel): boolean {
  return /mercato/.test(narrativeToText(verdict.sentence));
}

// ─── The closed rows' answers (the landscape index, 2026-10-16) ───────────────

export interface PatrimonioClosedAnswersInput {
  trades: { summary: MonthTradesSummary; ledgerReady: boolean; loading: boolean; failed: boolean };
  cash: CashAccountsSummary;
  /** The «Classi» legend, largest first (the overview's `charts.assetClassData`). */
  classes: ReadonlyArray<{ name: string; percentage: number }>;
  /** The strip under the verdict: a figure it prints is never repeated by a row. */
  strip: readonly StripFigure[];
  gains: UnrealizedGainsSummary;
  mortgages: readonly MortgageSummary[];
  mortgageFailed: boolean;
  /** The Strumenti table's positions and the gross total they weigh on (`computeTopWeightShare`). */
  instruments: Asset[];
  totalValue: number;
  /** The net worth by Intestatario; null when the tile is absent (no held asset names a person). */
  ownership?: OwnershipSummary | null;
}

/**
 * What each closed row of Patrimonio ANSWERS in the landscape index (components/ui/row-answers.tsx):
 * words and at most one figure, never one the strip or THE tile print (The Lifted-Figure Rule) —
 * Liquidità answers with the amount because its share is the strip's cell, Rendimento with the
 * percentage because its euro is. `null` keeps the scope aside: no operation in the month, a
 * ledger not active, loading or failed; no account; «Classi» when its first share prints as a
 * strip cell does; several loans, whose aside is the name that tells «Mutuo» from «Mutuo»; a
 * failed read of the instalments; three positions or fewer, where «the largest three» is the
 * whole table. Every figure is printed as its tile prints it, from the same function.
 */
export function describePatrimonioClosedAnswers(input: PatrimonioClosedAnswersInput): Record<string, Narrative | null> {
  const { trades, cash, gains, mortgages } = input;
  const answers: Record<string, Narrative | null> = {};

  // Investing is not a gain: the net carries its sign but no sign colour, as the footer prints it.
  answers[PATRIMONIO_SECTION_IDS.movimenti] =
    trades.failed || !trades.ledgerReady || trades.loading || trades.summary.count === 0
      ? null
      : [{ text: 'netto ' }, { text: formatSignedEuro(trades.summary.net, true), mono: true }];

  answers[PATRIMONIO_SECTION_IDS.liquidita] =
    cash.accounts.length === 0
      ? null
      : [{ text: 'sui conti ' }, { text: withTypographicMinus(cash.total, cachedFormatCurrencyEUR(Math.abs(cash.total))), mono: true }];

  const leadingClass = describeLeadingClass(input.classes);
  const stripTexts = new Set(input.strip.map((cell) => formatStripFigure(cell)?.text).filter(Boolean));
  const classFigure = leadingClass?.find((segment) => segment.mono)?.text;
  answers[PATRIMONIO_SECTION_IDS.classi] = leadingClass && classFigure && !stripTexts.has(classFigure) ? leadingClass : null;

  const gainPercent = gains.count > 0 ? gains.gainPercent : null;
  const gainSign = gainPercent === null ? 0 : printedSign(gainPercent, 1);
  answers[PATRIMONIO_SECTION_IDS.rendimento] =
    gainPercent === null
      ? null
      : [
          { text: 'sul costo ' },
          gainSign === 0
            ? { text: formatSignedPercentIt(gainPercent, 1), mono: true }
            : { text: formatSignedPercentIt(gainPercent, 1), mono: true, sign: gainSign > 0 ? 'positive' : 'negative' },
        ];

  answers[PATRIMONIO_SECTION_IDS.mutuo] = null;
  for (const summary of input.mortgageFailed ? [] : mortgages) {
    answers[patrimonioMutuoSectionId(summary.loanId)] = mortgages.length > 1 ? null : describePayoffAnswer(summary.payoff);
  }

  const topShare = computeTopWeightShare(input.instruments, input.totalValue);
  answers[PATRIMONIO_SECTION_IDS.strumenti] = topShare
    ? [{ text: `${pluralArticleFor(topShare.count)} ${topShare.count} maggiori ` }, { text: formatPercentageIt(topShare.percent, 1), mono: true }]
    : null;

  // The largest owner and its share (2026-10-17) — printed by no cell, no hero and no other row.
  answers[PATRIMONIO_SECTION_IDS.intestatari] = input.ownership ? describeOwnershipAnswer(input.ownership) : null;

  return answers;
}

/** One loan's answer: where the plan ends (the «Fine prevista» KPI), in the reading's words when it never does. */
function describePayoffAnswer(payoff: MortgageSummary['payoff']): Narrative | null {
  if (!payoff) return null;
  if (payoff.kind === 'repaid') return [{ text: 'estinto' }];
  if (payoff.kind === 'never') return [{ text: 'il debito non scende' }];
  return [{ text: 'fine prevista ' }, { text: shortMonthYear(payoff.date), mono: true }];
}
