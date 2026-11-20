/**
 * The Consulente's bond block (2026-11-08, the owner's addition after the interview's phase F on the mirror):
 * «--- OBBLIGAZIONI: SCADENZE ---», the one place the interview, the strategy and the instrument
 * search read what the bond part is made of — every single bond with its redemption date and the
 * years to it, every bond ETF with its value and role — so the strategy can tie each bond
 * sub-target to a goal's horizon and name the maturity nobody covers.
 *
 * No duration (owner, 2026-11-20, after NOVE-25's phase F on the mirror): Yahoo's
 * `topHoldings.bondHoldings` proved wrong on real ETFs — an inflation-linked fund at 1,08 years of
 * duration against about 7, a 1-3 year fund at 9,8 years of average maturity — and the strategy
 * built its reasoning on the wrong figure. Only the second agent writes a duration, verified with
 * the web search; the block says so instead of printing one.
 *
 * Pure: the server hands it the holdings, the coupon facts and today's date. Nothing here reaches
 * Firestore (the server does, in `run.ts`).
 */
import type { AssistantCouponFact, AssistantHoldingRow } from '@/lib/utils/assistantPortfolioContext';
import { formatNumberIt } from '@/lib/utils/formatters';

export const BOND_TERMS_HEADER = 'OBBLIGAZIONI: SCADENZE';

/** The line over the funds: no duration here, and nobody writes one in figures before the search (2026-11-20). */
export const BOND_FUNDS_LINE =
  'ETF e fondi obbligazionari (nessuna duration qui: la verifica il secondo agente con la ricerca web, e nessuno ne scrive una in numeri prima):';

const ROLE_LABELS: Record<AssistantHoldingRow['role'], string> = {
  tradable: 'negoziabile',
  frozen: 'non negoziabile',
  excluded: "fuori dall'allocazione",
};

export interface BondHoldings {
  /** Held `bond` assets, whatever class they sit in. */
  singles: AssistantHoldingRow[];
  /** Held funds classified under Obbligazioni — an ETF, never a single bond, an account or a loan. */
  funds: AssistantHoldingRow[];
}

/** The bond part of the held portfolio: singles by TYPE, funds by CLASS. A sold-out or negative row is not held. */
export function selectBondHoldings(holdings: AssistantHoldingRow[]): BondHoldings {
  const held = holdings.filter((row) => row.valueEur > 0);
  return {
    singles: held.filter((row) => row.type === 'bond'),
    funds: held.filter((row) => row.assetClass === 'bonds' && row.type !== 'bond' && row.type !== 'cash' && row.type !== 'loan'),
  };
}

export interface BondTermsInput {
  holdings: AssistantHoldingRow[];
  coupons: AssistantCouponFact[];
  /** The Italian day, ISO, the years to maturity are counted from. */
  todayIso: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Years between two ISO days, one decimal; negative past the date. */
export function yearsBetweenIso(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return (to - from) / (365.25 * DAY_MS);
}

const eur = (value: number): string => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
const years = (value: number): string => `${formatNumberIt(value, 1)} anni`;
const label = (row: AssistantHoldingRow): string => `${row.name}${row.ticker ? ` (${row.ticker})` : ''}`;

/**
 * The block, as lines. Nothing held → one sentence; a single bond → its maturity and the years to
 * it (plus the coupon when the registry knows it); a fund → its value and role, never a duration.
 */
export function formatBondTermsBlock(input: BondTermsInput): string[] {
  const { singles, funds } = selectBondHoldings(input.holdings);
  if (singles.length === 0 && funds.length === 0) {
    return [`--- ${BOND_TERMS_HEADER} ---`, 'Nessun titolo né ETF obbligazionario in portafoglio.'];
  }
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const lines: string[] = [
    `--- ${BOND_TERMS_HEADER} (${count(singles.length, 'titolo', 'titoli')}, ${count(funds.length, 'ETF o fondo', 'ETF o fondi')}; le scadenze degli obiettivi sono nelle risposte del percorso) ---`,
  ];

  if (singles.length > 0) {
    lines.push('Titoli singoli:');
    for (const row of singles) {
      const coupon = input.coupons.find((fact) => fact.assetName === row.name);
      const parts: string[] = [];
      if (row.maturityIso) {
        const toGo = yearsBetweenIso(input.todayIso, row.maturityIso);
        parts.push(`scade il ${row.maturityIso}${toGo !== null ? ` (${toGo < 0 ? 'scaduto' : years(toGo)})` : ''}`);
      } else {
        parts.push('scadenza non registrata');
      }
      if (coupon) {
        parts.push(coupon.annualRatePct !== null ? `cedola ${formatNumberIt(coupon.annualRatePct, 2)}% ${coupon.frequency}` : `cedola ${coupon.frequency}`);
        if (coupon.indexation) parts.push(coupon.indexation);
      }
      parts.push(`valore ${eur(row.valueEur)}`, ROLE_LABELS[row.role]);
      lines.push(`- ${label(row)}: ${parts.join(', ')}`);
    }
  }

  if (funds.length > 0) {
    lines.push(BOND_FUNDS_LINE);
    for (const row of funds) lines.push(`- ${label(row)}: valore ${eur(row.valueEur)}, ${ROLE_LABELS[row.role]}`);
  }
  return lines;
}
