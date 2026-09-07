/**
 * Previdenza's words: the verdict that answers «il fondo sta lavorando?» before any number, and
 * the reading line under each tile.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`) rendered by `NarrativeText`; the phrasings are pinned by
 * `__tests__/pensionNarrative.test.ts`, and a sentence never claims what the data cannot support
 * (DESIGN.md → The Narrative Honesty Rule). Three rules of this page:
 *
 *  - **Three causes, three numbers, never one blended percentage.** The verdict names the market
 *    (TWR), the employer's share (compensation, in euro) and the IRPEF saving (in euro) as three
 *    clauses; a cause with nothing behind it drops its clause instead of printing a zero.
 *  - **A return that is not a measure is said as such** — «il rendimento non è misurabile perché
 *    mancano versamenti registrati» takes the place of the percentage, in the verdict and in the
 *    Rendimento tile alike (`isPensionReturnMeasurable` is the one predicate behind both).
 *  - **The verdict is per contributor**: one sentence per block, the subject being that person's
 *    fund («Il fondo di Mario», «I fondi di Anna») or, for a fund linked to no member, the fund's
 *    own name. «restituisce» rather than «ti restituisce»: a household can track a spouse's fund.
 *
 * Only the TWR (and the month effect chip) wears a sign token: a contribution and a saving are
 * flows, never gains. Percentages go through chartService's it-IT formatter, currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { PensionContributionNature } from '@/types/pension';
import type { FundTodaySummary, LedgerRow, LedgerSummary, PensionMemberBlock, VersatoSummary } from '@/lib/utils/pensionSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** A whole-euro figure in the prose: «2321 €», «31.450 €». */
const amount = (value: number): NarrativeSegment => figure(cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true));

const TYPOGRAPHIC_MINUS = '−';

/** «+7,96%» / «−2,40%», coloured by sign. */
function signedPct(value: number): NarrativeSegment {
  const sign = value >= 0 ? '+' : TYPOGRAPHIC_MINUS;
  return { text: `${sign}${formatPercentage(Math.abs(value), 2)}`, mono: true, sign: value >= 0 ? 'positive' : 'negative' };
}

/** 'YYYY-MM' → «novembre 2025» / «nov 2025». */
export function formatMonthKey(key: string, style: 'long' | 'short' = 'long'): string {
  const [year, month] = key.split('-').map(Number);
  const name = (MONTH_NAMES[month - 1] ?? String(month)).toLowerCase();
  return `${style === 'short' ? name.slice(0, 3) : name} ${year}`;
}

/** «10 agosto» — a day in the prose. */
function formatDayLong(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].toLowerCase()}`;
}

/** «12 ago 2026» — a day in a footer. */
function formatDayShort(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3).toLowerCase()} ${date.getFullYear()}`;
}

const NUMBER_WORDS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** «a, b e c» — the Italian list, on narratives. */
function joinList(items: Narrative[]): Narrative {
  const out: Narrative = [];
  items.forEach((item, index) => {
    if (index > 0) out.push(prose(index === items.length - 1 ? ' e ' : ', '));
    out.push(...item);
  });
  return out;
}

/** The nature after an amount: «500 € volontari», «535 € di TFR», «134 € dal datore». */
const NATURE_AFTER_AMOUNT: Record<PensionContributionNature, string> = {
  voluntary: 'volontari',
  tfr: 'di TFR',
  employer: 'dal datore',
};

/** «Il fondo» / «I fondi» — the subject when the funds are the subject. */
function fundSubject(count: number): { subject: string; verb: string; lower: string } {
  return count > 1 ? { subject: 'I fondi', verb: 'valgono', lower: 'i fondi' } : { subject: 'Il fondo', verb: 'vale', lower: 'il fondo' };
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface PensionVerdictInput {
  blocks: PensionMemberBlock[];
  /** The axis year the two annual clauses (employer, IRPEF) are read on. */
  taxYear: number;
  currentYear: number;
}

/** The market clause of a block, by the state of its return. */
function marketClause(block: PensionMemberBlock): Narrative {
  const start = block.windowStart ? formatMonthKey(block.windowStart) : null;
  switch (block.returnState) {
    case 'measured':
      return [prose(`da ${start} il mercato ha reso `), signedPct(block.return!.twr), prose(' (TWR)')];
    case 'suspicious':
      return [prose('il rendimento non è misurabile perché mancano versamenti registrati')];
    case 'contradictory':
      return [prose('il rendimento non è misurabile perché risultano più versamenti della crescita')];
    case 'idle':
      return [prose(`da ${start} il valore non si è ancora mosso`)];
    case 'no-contributions':
      return [prose('il rendimento non è ancora misurabile: registra il primo versamento')];
    case 'one-point':
      return [prose(`il rendimento non è ancora misurabile: serve un secondo mese di valori dopo ${start}`)];
  }
}

/** «Il fondo di Mario vale 31.450 €: {market}, nel 2026 il datore ha aggiunto 134 € e il fisco restituisce circa 275 €.» */
function blockSentence(block: PensionMemberBlock, taxYear: number, currentYear: number): Narrative {
  const subject =
    block.kind === 'member'
      ? block.fundIds.length > 1
        ? `I fondi di ${block.name} valgono `
        : `Il fondo di ${block.name} vale `
      : `Il fondo ${block.fundNames[0]} vale `;

  const clauses: Narrative[] = [marketClause(block)];
  const annual: Narrative[] = [];
  if (block.tax && block.tax.employerInYear > 0) {
    annual.push([prose('il datore ha aggiunto '), amount(block.tax.employerInYear)]);
  }
  if (block.tax && block.tax.taxSaving !== null && block.tax.taxSaving > 0) {
    annual.push([prose(taxYear < currentYear ? 'il fisco ha restituito circa ' : 'il fisco restituisce circa '), amount(block.tax.taxSaving)]);
  }
  if (annual.length > 0) {
    annual[0] = [prose(`nel ${taxYear} `), ...annual[0]];
    clauses.push(...annual);
  }

  return [prose(subject), amount(block.value), prose(': '), ...joinList(clauses), prose('.')];
}

/** The headline judges the measured returns; a block whose return is not a measure is not judged. */
function resolveHeadline(blocks: PensionMemberBlock[]): { headline: string; tone: VerdictTone } {
  const many = blocks.length > 1;
  const measured = blocks.filter((b) => b.returnState === 'measured');
  if (measured.length === 0) {
    const pending = blocks.every((b) => b.returnState === 'no-contributions' || b.returnState === 'one-point');
    return {
      headline: `Il rendimento ${many ? 'dei fondi' : 'del fondo'} non è ${pending ? 'ancora ' : ''}misurabile.`,
      tone: 'neutral',
    };
  }
  const negatives = measured.filter((b) => (b.return?.twr ?? 0) < 0);
  if (negatives.length === 0) return { headline: many ? 'I fondi stanno lavorando.' : 'Il fondo sta lavorando.', tone: 'positive' };
  if (negatives.length === measured.length) return { headline: many ? 'I fondi hanno perso terreno.' : 'Il fondo ha perso terreno.', tone: 'negative' };
  return {
    headline:
      negatives.length === 1
        ? `Un fondo su ${numberWord(blocks.length)} ha perso terreno.`
        : `${capitalize(numberWord(negatives.length))} fondi su ${numberWord(blocks.length)} hanno perso terreno.`,
    tone: 'warning',
  };
}

/**
 * «Il fondo sta lavorando?» — three causes as three numbers, one sentence per contributor. The
 * market clause is the TWR on the block's trusted window, or the reason it is not a measure; the
 * employer's share and the IRPEF saving are read on the axis year and dropped when nothing is
 * behind them (no employer contribution, no RAL).
 */
export function buildPensionVerdict({ blocks, taxYear, currentYear }: PensionVerdictInput): PageVerdictModel {
  if (blocks.length === 0) {
    return {
      headline: 'Nessun fondo pensione ancora tracciato.',
      tone: 'neutral',
      sentence: [prose('Crea un asset di tipo «Fondo Pensione» da Patrimonio per registrare i versamenti e vedere qui il rendimento e il beneficio fiscale.')],
    };
  }

  const { headline, tone } = resolveHeadline(blocks);
  const sentence: Narrative = [];
  blocks.forEach((block, index) => {
    if (index > 0) sentence.push(prose(' '));
    sentence.push(...blockSentence(block, taxYear, currentYear));
  });
  return { headline, tone, sentence };
}

// ─── Il fondo oggi ────────────────────────────────────────────────────────────

/** «Il fondo vale 31.450 €, con 2321 € di versamenti registrati da novembre 2025; questo mese il mercato ha aggiunto 300 €.» */
export function describeFondoOggi(today: FundTodaySummary): Narrative {
  const { subject, verb } = fundSubject(today.fundCount);
  const out: Narrative = [prose(`${subject} ${verb} `), amount(today.value)];

  if (today.contributionsAllTime > 0 && today.firstContributionMonth) {
    out.push(prose(', con '), amount(today.contributionsAllTime), prose(` di versamenti registrati da ${formatMonthKey(today.firstContributionMonth)}`));
  } else {
    out.push(prose('; nessun versamento registrato'));
  }

  if (today.monthEffect !== null) {
    if (today.monthEffect >= 1) out.push(prose('; questo mese il mercato ha aggiunto '), { ...amount(today.monthEffect), sign: 'positive' });
    else if (today.monthEffect <= -1) out.push(prose('; questo mese il mercato ha tolto '), { ...amount(today.monthEffect), sign: 'negative' });
    else out.push(prose('; questo mese il mercato non ha mosso il valore'));
  }

  out.push(prose('.'));
  return out;
}

/** «Fondo Cometa · oggi» / «2 fondi · oggi». */
export function describeFondoOggiAside(today: FundTodaySummary): string {
  return today.fundCount === 1 ? `${today.fundNames[0]} · oggi` : `${today.fundCount} fondi · oggi`;
}

/** «1 fondo · valore aggiornato a mano dall’estratto conto · ultimo aggiornamento 12 ago 2026». */
export function describeFondoOggiFooter(today: FundTodaySummary): string {
  const parts = [`${today.fundCount} ${today.fundCount === 1 ? 'fondo' : 'fondi'}`, 'valore aggiornato a mano dall’estratto conto'];
  if (today.lastUpdated) parts.push(`ultimo aggiornamento ${formatDayShort(today.lastUpdated)}`);
  return parts.join(' · ');
}

export interface FondoOggiChip {
  value: string;
  sign?: 'positive' | 'negative';
  caption: string;
}

/** The grouped chips under the hero: this month's market effect (signed) and what was ever paid in. */
export function buildFondoOggiChips(today: FundTodaySummary): FondoOggiChip[] {
  const chips: FondoOggiChip[] = [];
  if (today.monthEffect !== null) {
    const sign = today.monthEffect >= 0 ? '+' : TYPOGRAPHIC_MINUS;
    const pct = today.monthEffectPct !== null ? ` (${sign}${formatPercentage(Math.abs(today.monthEffectPct), 2)})` : '';
    chips.push({
      value: `${sign}${cachedFormatCurrencyEUR(Math.abs(today.monthEffect))}${pct}`,
      sign: today.monthEffect >= 0 ? 'positive' : 'negative',
      caption: 'questo mese, effetto mercato',
    });
  }
  if (today.contributionsAllTime > 0 && today.firstContributionMonth) {
    chips.push({ value: cachedFormatCurrencyEUR(today.contributionsAllTime), caption: `versati in tutto, da ${formatMonthKey(today.firstContributionMonth)}` });
  }
  return chips;
}

// ─── Rendimento ───────────────────────────────────────────────────────────────

/** The reading of one block; `named` prefixes the member's name and drops it from the capital clause. */
function rendimentoClause(block: PensionMemberBlock, named: boolean): Narrative {
  const many = block.fundIds.length > 1;
  const start = block.windowStart ? formatMonthKey(block.windowStart) : null;
  const capitalOwner = !named && block.name ? `il capitale di ${block.name}` : 'il capitale';
  const result = block.return;

  let body: Narrative;
  switch (block.returnState) {
    case 'measured': {
      const r = result!;
      const annualised: Narrative =
        r.annualizedTwr === null
          ? [prose(`(su ${r.monthsCovered} ${r.monthsCovered === 1 ? 'mese' : 'mesi'}, troppo pochi per annualizzare)`)]
          : [prose('('), signedPct(r.annualizedTwr), prose(' annualizzato)')];
      body = [prose(`da ${start} il mercato ha reso `), signedPct(r.twr), prose(' '), ...annualised, prose(', '), amount(r.marketGain), prose(r.marketGain >= 0 ? ' di guadagno' : ' di perdita')];
      if (r.contributions.employer > 0 && r.personalReturn !== null) {
        body.push(prose('; con i '), amount(r.contributions.employer), prose(` del datore, ${capitalOwner} ha reso `), signedPct(r.personalReturn));
      }
      body.push(prose('.'));
      break;
    }
    case 'suspicious': {
      const r = result!;
      body = [
        prose(`${many ? 'i fondi sono cresciuti' : 'il fondo è cresciuto'} di `),
        amount(r.valueGrowth),
        prose(' ma risultano registrati solo '),
        amount(r.contributions.total),
        prose(' di versamenti: la differenza verrebbe letta come rendimento di mercato, e non lo è. Registra i versamenti mancanti'),
        prose(block.hasConfiguredStart ? '.' : ', oppure indica da quale mese il calcolo è affidabile nelle Impostazioni.'),
      ];
      break;
    }
    case 'contradictory': {
      const r = result!;
      body = [
        prose(`${many ? 'i fondi sono cresciuti' : 'il fondo è cresciuto'} di `),
        amount(r.valueGrowth),
        prose(' ma risultano registrati '),
        amount(r.contributions.total),
        prose(' di versamenti, più della crescita stessa: o alcuni erano già inclusi nel valore che hai inserito a mano, o sono stati contati due volte. Non è un rendimento negativo, è un dato da sistemare'),
        prose(block.hasConfiguredStart ? '.' : ': indica da quale mese il calcolo è affidabile nelle Impostazioni.'),
      ];
      break;
    }
    case 'idle':
      body = [prose(`da ${start} il valore ${many ? 'dei fondi' : 'del fondo'} non si è ancora mosso e non risultano versamenti registrati dopo quel mese: non c’è ancora niente da misurare. La prima misura arriva quando aggiorni «Valore attuale» col prossimo estratto conto.`)];
      break;
    case 'no-contributions':
      body = [prose(`registra il primo versamento per iniziare a misurare il rendimento: prima di quello la crescita ${many ? 'dei fondi' : 'del fondo'} e i versamenti sono indistinguibili.`)];
      break;
    case 'one-point':
      body = [prose(`serve un secondo mese dopo ${start} per calcolare un rendimento: con un solo valore non c’è nulla da confrontare.`)];
      break;
  }

  if (named) return [prose(`${block.name ?? block.fundNames[0]}: `), ...body];
  return [prose(capitalize(body[0].text)), ...body.slice(1)];
}

/** «Da novembre 2025 il mercato ha reso +7,96% (+10,75% annualizzato), 2229 € di guadagno; con i 134 € del datore, il capitale di Mario ha reso +8,12%.» */
export function describeRendimento(blocks: PensionMemberBlock[]): Narrative {
  const named = blocks.length > 1;
  const out: Narrative = [];
  blocks.forEach((block, index) => {
    if (index > 0) out.push(prose(' '));
    out.push(...rendimentoClause(block, named));
  });
  return out;
}

/** «nov 2025 → ago 2026» — the window actually measured, or why there is none yet. */
export function describeRendimentoAside(blocks: PensionMemberBlock[]): string {
  if (blocks.length > 1) return 'una finestra per contribuente';
  const block = blocks[0];
  if (!block?.return) return 'non ancora misurabile';
  return `${formatMonthKey(block.return.windowStart, 'short')} → ${formatMonthKey(block.return.windowEnd, 'short')}`;
}

export const RENDIMENTO_FOOTER: Narrative = [
  prose('Un versamento sposta il valore, non la percentuale; il contributo del datore è retribuzione e il TFR salario differito, entrambi fuori dal TWR. La finestra parte da dove i versamenti sono registrati.'),
];

// ─── Anno fiscale ─────────────────────────────────────────────────────────────

function annoFiscaleClause(block: PensionMemberBlock, taxYear: number): Narrative {
  if (block.kind === 'unassigned' || !block.tax) {
    return [prose(`${block.fundNames.join(', ')} non è collegato a nessun contribuente: collega il fondo a un membro della famiglia dalla sua scheda in Patrimonio per stimare il beneficio fiscale.`)];
  }
  const tax = block.tax;
  const name = block.name ?? '';

  if (tax.deductible <= 0) {
    return [prose(`Nel ${taxYear} ${name} non ha ancora versato contributi deducibili: il tetto di `), amount(tax.effectiveCeiling), prose(' è tutto disponibile.')];
  }

  const over = tax.deductible > tax.effectiveCeiling;
  const out: Narrative = over
    ? [prose(`Nel ${taxYear} ${name} ha versato `), amount(tax.deductible), prose(' deducibili, di cui '), amount(tax.deducted), prose(' entro il tetto')]
    : [prose(`Nel ${taxYear} ${name} ha dedotto `), amount(tax.deducted), prose(' su un tetto di '), amount(tax.effectiveCeiling)];

  const tail: Narrative[] = [];
  if (over) tail.push([amount(tax.deductible - tax.effectiveCeiling), prose(' oltre il tetto non si deducono')]);
  else if (tax.remaining > 0) tail.push([prose('restano '), amount(tax.remaining), prose(' deducibili')]);
  const tfr: Narrative = tax.tfr > 0 ? [prose('il TFR ('), amount(tax.tfr), prose(') non conta')] : [];

  if (tax.taxSaving !== null) {
    out.push(prose(': circa '), amount(tax.taxSaving), prose(' di IRPEF in meno'));
    if (tail.length) out.push(prose('; '), ...tail[0]);
    if (tfr.length) out.push(prose(tail.length ? ', e ' : ', e '), ...tfr);
    out.push(prose('.'));
    return out;
  }

  out.push(prose('; senza la RAL il risparmio IRPEF non si stima.'));
  if (tail.length || tfr.length) {
    const rest: Narrative[] = [];
    if (tail.length) rest.push([prose(capitalize(tail[0][0].text)), ...tail[0].slice(1)]);
    if (tfr.length) rest.push(tail.length ? tfr : [prose(capitalize(tfr[0].text)), ...tfr.slice(1)]);
    out.push(prose(' '), ...joinList(rest), prose('.'));
  }
  return out;
}

/** «Nel 2026 Mario ha dedotto 786 € su un tetto di 7950 €: circa 275 € di IRPEF in meno; restano 7164 € deducibili, e il TFR (535 €) non conta.» */
export function describeAnnoFiscale(blocks: PensionMemberBlock[], taxYear: number): Narrative {
  const out: Narrative = [];
  blocks.forEach((block, index) => {
    if (index > 0) out.push(prose(' '));
    out.push(...annoFiscaleClause(block, taxYear));
  });
  return out;
}

/** «Mario · RAL 38.000 €» / «Mario · senza RAL» / «fondo non assegnato» / «per contribuente». */
export function describeAnnoFiscaleAside(blocks: PensionMemberBlock[]): string {
  if (blocks.length > 1) return 'per contribuente';
  const block = blocks[0];
  if (!block || block.kind === 'unassigned' || !block.tax) return 'fondo non assegnato';
  return block.tax.ral !== null ? `${block.name} · RAL ${cachedFormatCurrencyEUR(block.tax.ral, true)}` : `${block.name} · senza RAL`;
}

export const ANNO_FISCALE_FOOTER: Narrative = [
  prose('Stima informativa, non consulenza fiscale: dipende dalla situazione di ciascun contribuente (altri oneri deducibili, incapienza, tetto). Verifica con un professionista.'),
];

// ─── Versato per natura ───────────────────────────────────────────────────────

/** «Nel 2026 il fondo ha ricevuto 1321 €: 652 € volontari, 535 € di TFR e 134 € dal datore.» */
export function describeVersato(versato: VersatoSummary): Narrative {
  if (versato.rows.length === 0) return [prose(`Nessun versamento con competenza ${versato.year}.`)];
  const out: Narrative = [prose(`Nel ${versato.year} il fondo ha ricevuto `), amount(versato.total)];
  if (versato.rows.length === 1) {
    out.push(prose(`, tutti ${NATURE_AFTER_AMOUNT[versato.rows[0].nature]}.`));
    return out;
  }
  out.push(prose(': '), ...joinList(versato.rows.map((row) => [amount(row.amount), prose(` ${NATURE_AFTER_AMOUNT[row.nature]}`)])), prose('.'));
  return out;
}

/** «Nel 2025 aveva ricevuto 1000 €, tutti volontari. Versamenti per anno d’imposta, non per data.» */
export function describeVersatoFooter(versato: VersatoSummary): Narrative {
  const out: Narrative = [];
  if (versato.previousYear !== null && versato.previousYearTotal !== null) {
    out.push(prose(`Nel ${versato.previousYear} aveva ricevuto `), amount(versato.previousYearTotal));
    if (versato.previousYearSingleNature) out.push(prose(`, tutti ${NATURE_AFTER_AMOUNT[versato.previousYearSingleNature]}`));
    out.push(prose('. '));
  }
  out.push(prose('Versamenti per anno d’imposta, non per data.'));
  return out;
}

// ─── Versamenti (the ledger) ──────────────────────────────────────────────────

/** «500 € volontari dal Conto BancoPosta, registrati il 5 luglio» — the latest row in the prose. */
function ledgerRowClause(row: LedgerRow): Narrative {
  const out: Narrative = [amount(row.amount), prose(` ${NATURE_AFTER_AMOUNT[row.nature]}`)];
  if (row.sourceAccountName) out.push(prose(` dal ${row.sourceAccountName}`));
  if (row.recordedInLaterMonth) out.push(prose(`, registrati il ${formatDayLong(row.recordedOn)}`));
  return out;
}

/** «4 versamenti con competenza 2026, l’ultimo il 10 agosto: 500 € volontari dal Conto BancoPosta.» */
export function describeVersamenti(ledger: LedgerSummary): Narrative {
  if (ledger.count === 0 || !ledger.latest) return [prose(`Nessun versamento registrato con competenza ${ledger.year}.`)];
  const when = ledger.count === 1 ? `il ${formatDayLong(ledger.latest.date)}` : `l’ultimo il ${formatDayLong(ledger.latest.date)}`;
  return [figure(String(ledger.count)), prose(` ${ledger.count === 1 ? 'versamento' : 'versamenti'} con competenza ${ledger.year}, ${when}: `), ...ledgerRowClause(ledger.latest), prose('.')];
}

/** «4 versamenti». */
export function describeVersamentiAside(ledger: LedgerSummary): string {
  return `${ledger.count} ${ledger.count === 1 ? 'versamento' : 'versamenti'}`;
}

export const VERSAMENTI_FOOTER: Narrative = [
  prose('Eliminare un versamento annulla il suo effetto: il valore del fondo torna indietro e, per i volontari, il conto viene riaccreditato e il trasferimento rimosso. Un versamento di gennaio con competenza dell’anno prima resta sotto quell’anno.'),
];

export const DETTAGLIO_DESCRIPTION = 'Da dove viene la crescita, euro per euro, e come aggiornare il valore del fondo';

// ─── Load errors and the Dettaglio ────────────────────────────────────────────

export type PensionLoadFailure = 'contributions' | 'snapshots';

/**
 * A fetch that failed is not an empty set: instead of a verdict computed on `[]` («nessun
 * versamento registrato», «non ancora misurabile») the page says what did not load.
 */
export function buildPensionLoadErrorVerdict(failures: PensionLoadFailure[]): PageVerdictModel {
  const what =
    failures.includes('contributions') && failures.includes('snapshots')
      ? 'i versamenti e lo storico mensile'
      : failures.includes('contributions')
        ? 'i versamenti'
        : 'lo storico mensile da cui si calcola il rendimento';
  return {
    headline: 'I dati della Previdenza non si sono caricati.',
    tone: 'neutral',
    sentence: [prose(`Non è stato possibile caricare ${what}: ricarica la pagina per riprovare. I dati registrati non sono stati toccati.`)],
  };
}

/** «nov 2025 → oggi · valore vivo» — the sparkline's window, closed on the live value. */
export function describeFondoOggiSeriesAside(today: FundTodaySummary): string {
  const first = today.series[0];
  if (!first) return 'valore vivo';
  return `${formatMonthKey(`${first.year}-${String(first.month).padStart(2, '0')}`, 'short')} → oggi · valore vivo`;
}

export const CRESCITA_FOOTER: Narrative = [
  prose('Il rendimento isola il mercato: i versamenti spostano il valore, non la percentuale. Il contributo del datore è retribuzione — contarlo come rendimento farebbe risultare il fondo a doppia cifra ogni anno. Il risparmio IRPEF, la terza componente, è nella tessera «Anno fiscale».'),
];

/** How the fund's value is kept current — the paragraphs of the «Come aggiornare il valore» tile. */
export const COME_AGGIORNARE: readonly string[] = [
  'Il valore del fondo (versato + rendimento) si aggiorna a mano dal tuo asset «Fondo Pensione» in Patrimonio quando arriva l’estratto conto. Ordine corretto: registra prima tutti i versamenti del mese, poi aggiorna «Valore attuale» — l’estratto conto li include già, quindi aggiornarlo prima li farebbe contare due volte.',
  'Fallo entro la fine del mese di competenza: lo storico salva una fotografia del patrimonio a fine mese e quella dei mesi passati non si riscrive più, quindi un versamento di giugno registrato a luglio compare nel valore di luglio. Il rendimento resta corretto — viene attribuito al mese in cui il valore si è mosso — ma il confronto mese per mese si legge meglio se le due cose coincidono.',
];
