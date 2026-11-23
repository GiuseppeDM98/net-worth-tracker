/**
 * The Consulente's OPERATING PLAN (2026-11-19, doc/guide/consulente-piano.md): what to sell and how
 * much, when, what to buy and in which quotas, when to look again — written by the «Piano» stage as
 * ONE structured object on the finished report, shown on the book's page «Il piano operativo», and
 * the object a plan of accumulation is later created from.
 *
 * The model addresses every instrument by a KEY the app printed in the facts block (S = held and
 * buyable, N = new from the report, M = money-market fund): a key cannot be misspelt the way a name
 * can. `reconcileOperatingPlan` is the ONE pure check of what the model wrote, run on the server when
 * the plan is written and again, on the live portfolio, when the plan is created — every rule reads
 * `instrument.kind`, never the letter of the key.
 *
 * Zod-free and free of the hand-off and the optimizer: the Consulente's route imports this module
 * (the book reads `operatingPlanOf`), and its bundle must not pull them. The facts are built in
 * `operatingPlanFacts.ts`, which no component of the route imports.
 */

import type { AssetClass, AssetPrefill } from '@/types/assets';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { SaleTaxPerEuro } from '@/lib/utils/saleTax';
import { roundToCents } from '@/lib/utils/cents';

export type OperatingPlanAction = 'buy' | 'hold' | 'sell';

/** The legend of a key: what the app knew of the instrument when the plan was written. */
export interface OperatingPlanInstrument {
  ref: string;
  kind: 'held' | 'new' | 'cashFund';
  name: string;
  assetClass: AssetClass;
  subCategory?: string;
  /** held, cashFund. */
  assetId?: string;
  /** new only: what the asset is created from (the hand-off's prefill and the candidate's symbols). */
  prefill?: AssetPrefill;
  symbols?: string[];
}

export interface OperatingPlanRow {
  ref: string;
  action: OperatingPlanAction;
  /** The target weight in the plan: the 'buy' rows sum to 100, 'hold' and 'sell' carry 0. */
  targetPercentage: number;
  /** 'sell' only; absent on a sale = every share. */
  sellQuantity?: number;
  /** 'sell' only, 1..months; absent = 1. */
  sellMonth?: number;
  /** 'sell' only: the ref of the 'buy' row its proceeds buy in the sale's month, the swap (owner, 2026-11-20). */
  reinvestInto?: string;
  reason: string;
  /** Sales only, the app's figures at writing time. */
  estimatedProceedsEur?: number;
  /** null = not estimable. */
  estimatedTaxEur?: number | null;
  taxUnknownReason?: 'cost-basis' | 'rate';
}

export interface OperatingPlan {
  summary: string;
  monthlyInflowEur: number;
  months: number;
  rows: OperatingPlanRow[];
  instruments: OperatingPlanInstrument[];
  reviewMonth?: number;
  reviewReason: string;
  departures: string[];
  /** The app's corrections at writing time, one sentence each. */
  corrections: string[];
  /** false = no 'buy' row above 0, or limits that cannot reach 100. */
  usable: boolean;
}

/** What a reconcile needs to know of today's portfolio, by key. */
export interface OperatingPlanFacts {
  instruments: OperatingPlanInstrument[];
  /** One entry per `held` and per `cashFund` key (never a `new` one). */
  held: Record<string, {
    quantity: number; priceEur: number; valueEur: number; keep: boolean;
    tax: SaleTaxPerEuro; minPct?: number; maxPct?: number;
  }>;
}

/** What the stage answered, after the schema: the numbers are the reconcile's to check. */
export interface RawOperatingPlan {
  summary: string; monthlyInflowEur: number; months: number;
  rows: Array<{ ref: string; action: OperatingPlanAction; targetPercentage: number; sellQuantity?: number; sellMonth?: number; reinvestInto?: string; reason: string }>;
  reviewMonth?: number; reviewReason: string; departures: string[];
}

/** The plan of this report, or null: absent, running, failed, unusable, or written on another report. */
export function operatingPlanOf(document: Pick<AllocationAdviceDocument, 'operatingPlan' | 'report'> | null | undefined): OperatingPlan | null {
  const stored = document?.operatingPlan;
  if (!stored || stored.status !== 'ready' || !stored.plan?.usable || !document?.report) return null;
  return stored.reportFinishedAt.getTime() === document.report.finishedAt.getTime() ? stored.plan : null;
}

// ─── The reconcile ────────────────────────────────────────────────────────────

export const OPERATING_PLAN_MIN_MONTHS = 1;
export const OPERATING_PLAN_MAX_MONTHS = 60;
/** The quotas' sum the reconcile scales silently: the proposal's own tolerance (`PROPOSAL_SUM_TOLERANCE`), here without zod. */
export const OPERATING_PLAN_SUM_TOLERANCE = 0.5;
/** How far from 100 the quotas may stay once the limits are applied before the plan is unusable. */
export const OPERATING_PLAN_LIMITS_TOLERANCE = 0.005;

const EPSILON = 1e-9;

function formatPct(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 }).format(value);
}

/** «A», «A e B», «A, B e C». */
function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export const OPERATING_PLAN_COPY = {
  months: (n: number) => `La durata indicata non è fra ${OPERATING_PLAN_MIN_MONTHS} e ${OPERATING_PLAN_MAX_MONTHS} mesi: il piano dura ${n} ${n === 1 ? 'mese' : 'mesi'}.`,
  unknownRef: 'Il piano citava uno strumento che non è fra i tuoi né fra quelli del report: la riga non entra.',
  cashFund: (name: string) => `${name} è un fondo monetario: il piano non lo compra.`,
  kept: (name: string) => `Hai indicato di tenere ${name}: la vendita non entra nel piano.`,
  tooMany: (asked: number, name: string, held: number) => `Il Consulente indicava ${formatQuantity(asked)} quote di ${name}: il piano ne vende ${formatQuantity(held)}, quelle che possiedi.`,
  saleMonth: (name: string, month: number) => `La vendita di ${name} era fissata fuori dal piano: va al mese ${month}.`,
  swapDropped: (name: string) => `La vendita di ${name} reinvestiva in uno strumento che il piano non compra: il ricavato entra nel piano come le altre vendite.`,
  forgotten: (names: readonly string[]) =>
    names.length === 1
      ? `${names[0]}: il piano non lo cita. Resta dov'è e il piano non lo compra.`
      : `${joinNames(names)}: il piano non li cita. Restano dove sono e il piano non li compra.`,
  scaled: (sum: number) => `Le quote sommavano a ${formatPct(sum)}%: riportate a 100 in proporzione.`,
  limit: (name: string, from: number, to: number) => `${name}: quota portata dal ${formatPct(from)}% al ${formatPct(to)}%, il limite dei tuoi Criteri del modello.`,
  limitsUnreachable: 'I limiti dei tuoi Criteri del modello non lasciano arrivare al 100%: il piano non può diventare un piano di accumulo.',
  nothingBought: 'Il piano non compra niente: non può diventare un piano di accumulo.',
} as const;

type WorkRow = { ref: string; action: OperatingPlanAction; targetPercentage: number; sellQuantity?: number; sellMonth?: number; reinvestInto?: string; reason: string };

const finiteOr = (value: number | undefined, fallback: number) => (value !== undefined && Number.isFinite(value) ? value : fallback);
const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/**
 * Spreads `diff` over the 'buy' rows not yet fixed at a limit, in proportion to their quotas, until
 * every row is within its limits or nothing is left to move: a row a redistribution pushes past a
 * limit is clamped and fixed, silently, and the pass repeats. Moves the quotas in place.
 */
function redistributeWithinLimits(rows: WorkRow[], limits: (ref: string) => { min: number; max: number }, fixed: Set<string>): void {
  for (let pass = 0; pass <= rows.length; pass++) {
    const buys = rows.filter((row) => row.action === 'buy');
    const diff = 100 - buys.reduce((sum, row) => sum + row.targetPercentage, 0);
    if (Math.abs(diff) <= EPSILON) return;
    const free = buys.filter((row) => !fixed.has(row.ref));
    const weight = free.reduce((sum, row) => sum + row.targetPercentage, 0);
    if (free.length === 0) return;
    for (const row of free) {
      row.targetPercentage += weight > 0 ? (diff * row.targetPercentage) / weight : diff / free.length;
    }
    let clamped = false;
    for (const row of free) {
      const { min, max } = limits(row.ref);
      if (row.targetPercentage > max + EPSILON || row.targetPercentage < min - EPSILON) {
        row.targetPercentage = Math.min(max, Math.max(min, row.targetPercentage));
        fixed.add(row.ref);
        clamped = true;
      }
    }
    if (!clamped) return;
  }
}

/**
 * The fifteen rules (doc/guide/consulente-piano.md § The reconcile), in order; each correction
 * pushes ONE sentence. The scaling to 100 runs BEFORE the limits, so a quota clamped to its limit
 * is never scaled off it again — which is what makes the function idempotent: a second pass adds
 * no sentence. The rows come back in the order of `facts.instruments` (S, N, M).
 */
export function reconcileOperatingPlan(raw: RawOperatingPlan, facts: OperatingPlanFacts): OperatingPlan {
  const corrections: string[] = [];
  const byRef = new Map(facts.instruments.map((instrument) => [instrument.ref, instrument]));
  const nameOf = (ref: string) => byRef.get(ref)?.name ?? ref;
  const kindOf = (ref: string) => byRef.get(ref)?.kind;

  // 1. The duration.
  const rawMonths = finiteOr(raw.months, OPERATING_PLAN_MIN_MONTHS);
  const months = clampInt(rawMonths, OPERATING_PLAN_MIN_MONTHS, OPERATING_PLAN_MAX_MONTHS);
  if (Math.round(rawMonths) !== months || !Number.isFinite(raw.months)) corrections.push(OPERATING_PLAN_COPY.months(months));

  // 2. The inflow: whether there is money to invest is the click's check, not this one's.
  const monthlyInflowEur = Number.isFinite(raw.monthlyInflowEur) && raw.monthlyInflowEur > 0 ? raw.monthlyInflowEur : 0;

  // 3. Unknown keys and second rows for a key.
  const seen = new Set<string>();
  let unknown = false;
  const rows: WorkRow[] = [];
  for (const row of raw.rows) {
    if (!byRef.has(row.ref) || seen.has(row.ref)) {
      unknown = true;
      continue;
    }
    seen.add(row.ref);
    rows.push({
      ref: row.ref,
      action: row.action,
      targetPercentage: finiteOr(row.targetPercentage, 0),
      ...(row.sellQuantity !== undefined ? { sellQuantity: row.sellQuantity } : {}),
      ...(row.sellMonth !== undefined ? { sellMonth: row.sellMonth } : {}),
      ...(row.reinvestInto !== undefined ? { reinvestInto: row.reinvestInto } : {}),
      reason: row.reason,
    });
  }
  if (unknown) corrections.push(OPERATING_PLAN_COPY.unknownRef);

  const removeSale = (row: WorkRow) => {
    delete row.sellQuantity;
    delete row.sellMonth;
    delete row.reinvestInto;
    row.action = kindOf(row.ref) === 'held' && row.targetPercentage > 0 ? 'buy' : 'hold';
  };

  // 4. A new instrument is only bought; a money-market fund is never bought.
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const kind = kindOf(row.ref);
    if (kind === 'new' && row.action !== 'buy') rows.splice(index, 1);
  }
  for (const row of rows) {
    if (kindOf(row.ref) === 'cashFund' && row.action === 'buy') {
      row.action = 'hold';
      row.targetPercentage = 0;
      corrections.push(OPERATING_PLAN_COPY.cashFund(nameOf(row.ref)));
    }
  }

  // 5. The answers' «da tenere» are never sold; «smetti di comprare» stays allowed.
  for (const row of rows) {
    if (row.action === 'sell' && facts.held[row.ref]?.keep) {
      removeSale(row);
      corrections.push(OPERATING_PLAN_COPY.kept(nameOf(row.ref)));
    }
  }

  // 6. The quantities held.
  for (const row of rows) {
    if (row.action !== 'sell') continue;
    const heldQuantity = facts.held[row.ref]?.quantity ?? 0;
    if (heldQuantity <= 0) {
      removeSale(row);
      continue;
    }
    if (row.sellQuantity === undefined) continue;
    const asked = Number.isFinite(row.sellQuantity) ? Math.floor(row.sellQuantity) : 0;
    if (asked <= 0) {
      removeSale(row);
      continue;
    }
    if (asked >= heldQuantity) {
      delete row.sellQuantity;
      if (asked > heldQuantity) corrections.push(OPERATING_PLAN_COPY.tooMany(asked, nameOf(row.ref), heldQuantity));
      continue;
    }
    row.sellQuantity = asked;
  }

  // 7. A sale keeps the rest where it is: the plan does not buy what it sells. 8. Its month.
  for (const row of rows) {
    if (row.action !== 'sell') {
      delete row.sellQuantity;
      delete row.sellMonth;
      delete row.reinvestInto;
      continue;
    }
    row.targetPercentage = 0;
    if (row.sellMonth === undefined) continue;
    const asked = finiteOr(row.sellMonth, 1);
    const month = clampInt(asked, 1, months);
    if (month !== Math.round(asked) || !Number.isFinite(row.sellMonth)) corrections.push(OPERATING_PLAN_COPY.saleMonth(nameOf(row.ref), month));
    row.sellMonth = month;
  }

  // 8b. The swap (owner, 2026-11-20): it buys a row the plan buys, never the sold one; otherwise the sale is an
  // ordinary one. A row a swap buys stays a buy at quota 0: the swap alone funds it.
  const swapTargets = new Set<string>();
  for (const row of rows) {
    if (row.reinvestInto === undefined) continue;
    const target = rows.find((other) => other.ref === row.reinvestInto);
    if (!target || target.ref === row.ref || target.action !== 'buy') {
      delete row.reinvestInto;
      corrections.push(OPERATING_PLAN_COPY.swapDropped(nameOf(row.ref)));
      continue;
    }
    swapTargets.add(target.ref);
  }

  // 9. Every held instrument has a row.
  const forgotten = facts.instruments.filter((instrument) => instrument.kind === 'held' && !rows.some((row) => row.ref === instrument.ref));
  for (const instrument of forgotten) rows.push({ ref: instrument.ref, action: 'hold', targetPercentage: 0, reason: '' });
  if (forgotten.length > 0) corrections.push(OPERATING_PLAN_COPY.forgotten(forgotten.map((instrument) => instrument.name)));

  // 10. The quotas' signs and the actions they imply.
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const kind = kindOf(row.ref);
    if (row.targetPercentage < 0) row.targetPercentage = 0;
    if (kind === 'cashFund') row.targetPercentage = 0;
    if (row.action === 'buy' && row.targetPercentage <= 0) {
      if (swapTargets.has(row.ref)) continue;
      if (kind === 'new') rows.splice(index, 1);
      else row.action = 'hold';
    } else if (row.action === 'hold' && row.targetPercentage > 0) {
      if (kind === 'held') row.action = 'buy';
      else row.targetPercentage = 0;
    }
  }

  // 11. The 'buy' quotas back to 100, in proportion.
  const buys = () => rows.filter((row) => row.action === 'buy');
  const sum = buys().reduce((total, row) => total + row.targetPercentage, 0);
  if (sum > 0 && Math.abs(sum - 100) > EPSILON) {
    for (const row of buys()) row.targetPercentage = (row.targetPercentage * 100) / sum;
    if (Math.abs(sum - 100) > OPERATING_PLAN_SUM_TOLERANCE) corrections.push(OPERATING_PLAN_COPY.scaled(sum));
  }

  // 12. The limits of «Criteri del modello», AFTER the scaling.
  const limits = (ref: string) => ({ min: facts.held[ref]?.minPct ?? 0, max: facts.held[ref]?.maxPct ?? 100 });
  let usable = true;
  if (sum > 0) {
    const fixed = new Set<string>();
    for (const row of buys()) {
      const { min, max } = limits(row.ref);
      const bounded = Math.min(max, Math.max(min, row.targetPercentage));
      if (Math.abs(bounded - row.targetPercentage) > EPSILON) {
        corrections.push(OPERATING_PLAN_COPY.limit(nameOf(row.ref), roundToCents(row.targetPercentage), bounded));
        row.targetPercentage = bounded;
        fixed.add(row.ref);
      }
    }
    if (fixed.size > 0) redistributeWithinLimits(rows, limits, fixed);
    const total = buys().reduce((acc, row) => acc + row.targetPercentage, 0);
    if (Math.abs(total - 100) > OPERATING_PLAN_LIMITS_TOLERANCE) {
      usable = false;
      corrections.push(OPERATING_PLAN_COPY.limitsUnreachable);
    }
  }

  // 13. Two decimals; the missing or extra cents to the largest quota its limits leave room on.
  const order = new Map(facts.instruments.map((instrument, index) => [instrument.ref, index]));
  rows.sort((a, b) => (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0));
  for (const row of buys()) row.targetPercentage = roundToCents(row.targetPercentage);
  if (usable && buys().length > 0) {
    const cents = Math.round((100 - buys().reduce((acc, row) => acc + row.targetPercentage, 0)) * 100);
    if (cents !== 0) {
      const delta = cents / 100;
      const room = buys().filter((row) => {
        const { min, max } = limits(row.ref);
        const next = row.targetPercentage + delta;
        return next <= max + EPSILON && next >= min - EPSILON;
      });
      // The stable sort keeps the facts' order among equal quotas: the first one wins a tie.
      const target = [...room].sort((a, b) => b.targetPercentage - a.targetPercentage)[0];
      if (target) target.targetPercentage = roundToCents(target.targetPercentage + delta);
    }
  }

  // 14. The review month.
  const reviewMonth = raw.reviewMonth !== undefined && Number.isFinite(raw.reviewMonth) && Math.round(raw.reviewMonth) >= 1 && Math.round(raw.reviewMonth) <= months
    ? Math.round(raw.reviewMonth)
    : undefined;

  // 15. A plan that buys nothing is no plan of accumulation.
  if (!buys().some((row) => row.targetPercentage > 0)) {
    corrections.push(OPERATING_PLAN_COPY.nothingBought);
    usable = false;
  }

  // The sales' figures: on the quantity really sold, at the price and the tax of today.
  const out: OperatingPlanRow[] = rows.map((row) => {
    if (row.action !== 'sell') return { ref: row.ref, action: row.action, targetPercentage: row.targetPercentage, reason: row.reason };
    const fact = facts.held[row.ref];
    const quantitySold = row.sellQuantity ?? fact?.quantity ?? 0;
    const proceeds = roundToCents(quantitySold * (fact?.priceEur ?? 0));
    const tax = fact?.tax ?? { kind: 'exempt' as const };
    return {
      ref: row.ref,
      action: row.action,
      targetPercentage: 0,
      ...(row.sellQuantity !== undefined ? { sellQuantity: row.sellQuantity } : {}),
      ...(row.sellMonth !== undefined ? { sellMonth: row.sellMonth } : {}),
      ...(row.reinvestInto !== undefined ? { reinvestInto: row.reinvestInto } : {}),
      reason: row.reason,
      estimatedProceedsEur: proceeds,
      ...(tax.kind === 'taxed'
        ? { estimatedTaxEur: roundToCents(proceeds * tax.perEuro) }
        : tax.kind === 'exempt'
          ? { estimatedTaxEur: 0 }
          : { estimatedTaxEur: null, taxUnknownReason: tax.reason }),
    };
  });

  return {
    summary: raw.summary,
    monthlyInflowEur,
    months,
    rows: out,
    instruments: facts.instruments,
    ...(reviewMonth !== undefined ? { reviewMonth } : {}),
    reviewReason: raw.reviewReason,
    departures: raw.departures,
    corrections,
    usable,
  };
}
