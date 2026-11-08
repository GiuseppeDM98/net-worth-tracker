/**
 * The Consulente's bond block (2026-11-08, the owner's addition after the interview's phase F on the mirror):
 * «--- OBBLIGAZIONI: SCADENZE E DURATION ---», the one place the interview, the strategy and the
 * instrument search read what the bond part is made of — every single bond with its redemption
 * date and the years to it, every bond ETF with the effective duration and the average maturity
 * Yahoo publishes (`topHoldings.bondHoldings`, read through the Esposizione's shared profile
 * cache) — so the strategy can tie each bond sub-target to a goal's horizon and name the maturity
 * nobody covers. Yahoo's figures are «secondo Yahoo», unverified: the second agent confirms them
 * with the web search before it names a candidate's `duration`.
 *
 * Pure: the server hands it the holdings, the coupon facts, the profiles it resolved and today's
 * date. Nothing here reaches Firestore or Yahoo (the server does, in `run.ts`).
 */
import type { AssistantCouponFact, AssistantHoldingRow } from '@/lib/utils/assistantPortfolioContext';
import type { InstrumentProfile, ProfileRequest } from '@/types/exposure';
import { formatNumberIt } from '@/lib/utils/formatters';

export const BOND_TERMS_HEADER = 'OBBLIGAZIONI: SCADENZE E DURATION';

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

/** The profile requests for the bond funds Yahoo can describe: an ETF with the raw ticker, the `fund` module, each once. */
export function bondProfileRequests(funds: AssistantHoldingRow[]): ProfileRequest[] {
  const seen = new Set<string>();
  const requests: ProfileRequest[] = [];
  for (const row of funds) {
    const ticker = row.profileTicker?.trim() ?? '';
    if (row.type !== 'etf' || ticker === '' || seen.has(ticker)) continue;
    seen.add(ticker);
    requests.push({ ticker, module: 'fund' });
  }
  return requests.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export interface BondTermsInput {
  holdings: AssistantHoldingRow[];
  coupons: AssistantCouponFact[];
  /** The profiles the server resolved, keyed by raw ticker; `{}` when nothing was asked. */
  profiles: Record<string, InstrumentProfile>;
  /** False when the profile read itself failed: the ETF lines say so instead of «non pubblicata». */
  profilesRead: boolean;
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
 * The block, as lines. Three states, each named: nothing held → one sentence; a single bond → its
 * maturity and the years to it (plus the coupon when the registry knows it); a fund → Yahoo's
 * duration and average maturity with the date they were read, «non pubblicata» when Yahoo has
 * none, «non letta» when the profiles could not be read at all.
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
    lines.push(
      'ETF e fondi obbligazionari (duration effettiva e scadenza media secondo Yahoo Finance, non verificate: il secondo agente le conferma con la ricerca web):',
    );
    for (const row of funds) {
      const profile = row.profileTicker ? input.profiles[row.profileTicker]?.fund : undefined;
      const bond = profile?.bond;
      const parts: string[] = [];
      if (!input.profilesRead) {
        parts.push('duration non letta (profili non disponibili in questa corsa)');
      } else if (bond && (bond.durationYears !== null || bond.maturityYears !== null)) {
        if (bond.durationYears !== null) parts.push(`duration ${years(bond.durationYears)}`);
        if (bond.maturityYears !== null) parts.push(`scadenza media ${years(bond.maturityYears)}`);
        if (profile?.fetchedAt) parts.push(`letto il ${profile.fetchedAt.slice(0, 10)}`);
      } else {
        parts.push('duration non pubblicata da Yahoo');
      }
      parts.push(`valore ${eur(row.valueEur)}`, ROLE_LABELS[row.role]);
      lines.push(`- ${label(row)}: ${parts.join(', ')}`);
    }
  }
  return lines;
}
