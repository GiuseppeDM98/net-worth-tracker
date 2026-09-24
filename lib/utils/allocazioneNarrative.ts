/**
 * Allocazione's words: the verdict that answers «sono allineato al piano, e cosa faccio con i
 * prossimi soldi?» before any number, and the reading line under each tile of that page.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`/`sign`) rendered by `NarrativeText`; the phrasings are
 * pinned by tests, and a sentence never claims what the data cannot support — a missing input
 * drops its clause, never a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * Two things this page must keep straight. A drift is neither a gain nor a loss, so no figure
 * here carries a sign colour: the action colours (COMPRA/VENDI/OK) belong to the chips, never
 * to the prose. And the verdict's last clause is always the VERSA answer — «con 1000 € in più
 * compreresti…» — at the Piano tile's amount, whatever mode that tile is showing: the page's
 * question is about the next money, and a verdict that changed with a toggle would be that
 * tile's title, not the page's.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, atThePercent } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { OrphanedTarget, RebalanceBand, RebalanceMove } from '@/lib/utils/allocationUtils';
import type { InstrumentTrade } from '@/lib/utils/leverageAwareAllocationUtils';
import type {
  ClassGap,
  ClassSlice,
  ExposureHighlights,
  ExposureViewKey,
  HoldingsGroup,
  NextMoney,
  PlanMode,
  PlanView,
  SaleTaxEstimate,
} from '@/lib/utils/allocazioneSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** An euro amount without cents, set in mono and uncoloured: a drift is neither a gain nor a loss. */
function amount(value: number): NarrativeSegment {
  return figure(cachedFormatCurrencyEUR(Math.abs(value), true));
}

/** «3,3 pp» — points of drift, uncoloured. */
function points(pp: number, decimals = 1): NarrativeSegment {
  return figure(`${formatPercentage(Math.abs(pp), decimals).replace('%', '')} pp`);
}

function percent(value: number, decimals = 1): NarrativeSegment {
  return figure(formatPercentage(Math.abs(value), decimals));
}

/** Leverage the Italian way: 1.3 → «1,30×». */
export function formatLeverage(ratio: number): string {
  return `${ratio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

/** The band as the pill prints it: «±2%», «±3,5%», «5/25». */
export function describeBand(band: RebalanceBand): string {
  if (band.type === 'rule525') return '5/25';
  return `±${band.pp.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;
}

/** «entro la soglia del ±2%» / «con la regola 5/25» — the band as a clause. */
function bandClause(band: RebalanceBand): string {
  return band.type === 'rule525' ? 'con la regola 5/25' : `entro la soglia del ${describeBand(band)}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «a, b e c» — joins narratives the Italian way. */
function joinList(parts: Narrative[]): Narrative {
  return parts.flatMap((part, i) => {
    if (i === 0) return part;
    const separator = i === parts.length - 1 ? ' e ' : ', ';
    return [prose(separator), ...part];
  });
}

const NUMBER_WORDS: Record<number, string> = { 2: 'due', 3: 'tre', 4: 'quattro', 5: 'cinque', 6: 'sei', 7: 'sette', 8: 'otto' };

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Each asset class as it reads in a sentence: with its article, after «da», as a bare object. */
interface ClassSubject {
  subject: string;
  plural: boolean;
  feminine: boolean;
  from: string;
  object: string;
}

const CLASS_SUBJECTS: Record<string, ClassSubject> = {
  equity: { subject: 'le azioni', plural: true, feminine: true, from: 'dalle azioni', object: 'azioni' },
  bonds: { subject: 'le obbligazioni', plural: true, feminine: true, from: 'dalle obbligazioni', object: 'obbligazioni' },
  cash: { subject: 'la liquidità', plural: false, feminine: true, from: 'dalla liquidità', object: 'liquidità' },
  commodity: { subject: 'le materie prime', plural: true, feminine: true, from: 'dalle materie prime', object: 'materie prime' },
  crypto: { subject: 'le criptovalute', plural: true, feminine: true, from: 'dalle criptovalute', object: 'criptovalute' },
  realestate: { subject: 'gli immobili', plural: true, feminine: false, from: 'dagli immobili', object: 'immobili' },
  trendFollowing: { subject: 'il Trend Following', plural: false, feminine: false, from: 'dal Trend Following', object: 'Trend Following' },
  carry: { subject: 'il Carry', plural: false, feminine: false, from: 'dal Carry', object: 'Carry' },
};

function classSubject(key: string, label: string): ClassSubject {
  return CLASS_SUBJECTS[key] ?? { subject: label, plural: false, feminine: false, from: `da ${label}`, object: label };
}

/** A class as the object of «di»/«in»; an instrument keeps its ticker. */
function sliceObject(slice: { key: string; label: string; kind: 'class' | 'instrument' }): string {
  return slice.kind === 'class' ? classSubject(slice.key, slice.label).object : slice.label;
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface AllocazioneVerdictInput {
  hasAssets: boolean;
  /** Euro in `excluded` assets — the empty state says when everything is there. */
  excludedValue: number;
  /** The band-independent balance score, 0-100. */
  score: number;
  /** Whether every class is within the band. */
  isBalanced: boolean;
  band: RebalanceBand;
  /** The off-target classes, farthest in points first (`offTargetGaps`). */
  offTarget: ClassGap[];
  /** Present when the portfolio is leveraged or the target is. */
  leverage: { current: number; target: number } | null;
  /** The Versa answer at the Piano's amount; null when the page has no amount. */
  nextMoney: NextMoney | null;
  orphans: OrphanedTarget[];
}

/** «Le azioni pesano 3,3 pp più del target, le obbligazioni 9,1 pp meno e la liquidità 3,3 pp meno» */
function driftClause(offTarget: ClassGap[]): Narrative {
  const items = offTarget.map((gap, i) => {
    const subject = classSubject(gap.assetClass, gap.label);
    const direction = gap.differencePp > 0 ? 'più' : 'meno';
    if (i === 0) {
      return [prose(`${capitalize(subject.subject)} ${subject.plural ? 'pesano' : 'pesa'} `), points(gap.differencePp), prose(` ${direction} del target`)];
    }
    return [prose(`${subject.subject} `), points(gap.differencePp), prose(` ${direction}`)];
  });
  return joinList(items);
}

/** «con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità» */
function nextMoneyClause(nextMoney: NextMoney | null): Narrative {
  if (!nextMoney || nextMoney.amount <= 0 || nextMoney.slices.length === 0) return [];
  const slices = nextMoney.slices.map((slice) => [amount(slice.amount), prose(` di ${sliceObject(slice)}`)]);
  return [prose('con '), amount(nextMoney.amount), prose(' in più compreresti '), ...joinList(slices)];
}

function leverageClause(leverage: { current: number; target: number } | null): Narrative {
  if (!leverage) return [];
  const inLine = Math.abs(leverage.current - leverage.target) <= 0.01;
  if (inLine) return [prose('la leva è '), figure(formatLeverage(leverage.current)), prose(', in linea col target')];
  return [prose('la leva è '), figure(formatLeverage(leverage.current)), prose(' contro un target di '), figure(formatLeverage(leverage.target))];
}

function orphanSentence(orphans: OrphanedTarget[]): Narrative {
  if (orphans.length === 0) return [];
  const names = orphans.map((orphan) => [prose(`${orphan.label} (`), figure(`${Math.round(orphan.targetPercentage)}%`), prose(')')]);
  if (orphans.length === 1) {
    return [prose(' Il target '), ...names[0], prose(' non è raggiungibile: il suo valore è tutto in asset esclusi.')];
  }
  return [prose(' I target '), ...joinList(names), prose(' non sono raggiungibili: il loro valore è tutto in asset esclusi.')];
}

export function buildAllocazioneVerdict(input: AllocazioneVerdictInput): PageVerdictModel {
  if (!input.hasAssets) {
    if (input.excludedValue > 0) {
      return {
        headline: "Tutto il patrimonio è escluso dall'allocazione.",
        tone: 'neutral',
        sentence: [prose('I '), amount(input.excludedValue), prose(' che possiedi sono in asset esclusi dal ribilanciamento: cambia il ruolo di un asset in Patrimonio per vederlo qui.')],
      };
    }
    return {
      headline: 'Nessun asset da allocare.',
      tone: 'neutral',
      sentence: [prose('Aggiungi un asset in Patrimonio per confrontare la tua allocazione con i target.')],
    };
  }

  const tone: VerdictTone = input.isBalanced ? 'positive' : input.score >= 80 ? 'warning' : 'negative';
  // «all'85%», not «al 85%»: the articulated preposition follows the number NAME, and 1, 8, 11 and
  // 80-89 start with a vowel — thirteen of the hundred-and-one scores this headline can print.
  const score = Math.round(input.score);
  const headline = `Allineato ${atThePercent(score, 0)}${score}%.`;

  const clauses: Narrative[] = [];
  if (input.isBalanced || input.offTarget.length === 0) {
    clauses.push([prose(input.band.type === 'rule525' ? 'Tutte le classi rispettano la regola 5/25' : `Tutte le classi sono ${bandClause(input.band)}`)]);
  } else {
    clauses.push(driftClause(input.offTarget));
  }
  const leverage = leverageClause(input.leverage);
  if (leverage.length > 0) clauses.push(leverage);
  const next = nextMoneyClause(input.nextMoney);
  if (next.length > 0) clauses.push(next);

  const sentence: Narrative = clauses.flatMap((clause, i) => (i === 0 ? clause : [prose('; '), ...clause]));
  sentence.push(prose('.'));
  sentence.push(...orphanSentence(input.orphans));
  return { headline, tone, sentence };
}

// ─── Header ───────────────────────────────────────────────────────────────────

/** «245.000 € allocati · 5 classi · target dalle impostazioni» — the compact header's description. */
export function describeAllocazioneHeader(input: { marketValue: number; classCount: number; targetSource: 'settings' | 'goals' }): string | undefined {
  if (input.classCount === 0) return undefined;
  const classes = input.classCount === 1 ? '1 classe' : `${input.classCount} classi`;
  const source = input.targetSource === 'goals' ? 'target dagli obiettivi' : 'target dalle impostazioni';
  return `${cachedFormatCurrencyEUR(input.marketValue, true)} allocati · ${classes} · ${source}`;
}

// ─── Bilanciamento ────────────────────────────────────────────────────────────

export interface BalanceInput {
  marketValue: number;
  misallocationPct: number;
  /** Σdrift in points; non-zero only under a leveraged target (the exposure gap). */
  leverageGapPp: number;
  offTargetCount: number;
  classCount: number;
  band: RebalanceBand;
  /** Wealth held in classes the targets do not name — the honest reading of a negative Σdrift without leverage. */
  untargeted?: { pct: number; labels: string[] } | null;
}

/**
 * «Su 245.000 € allocati il 3,5% è fuori posizione; entro la soglia del ±2% sono 2 classi su 5
 * fuori target.» The misallocation is band-independent, the count is the band's: the two halves
 * of the sentence answer two different questions on purpose. A Σdrift is read as a leverage gap
 * only when the page says leverage is in play; otherwise it is wealth in classes without a target,
 * and the sentence names them.
 */
export function describeBalance(input: BalanceInput): Narrative {
  const head: Narrative = [prose('Su '), amount(input.marketValue), prose(' allocati ')];
  const hasLeverageGap = Math.abs(input.leverageGapPp) >= 0.5;
  const untargeted = input.untargeted && input.untargeted.pct >= 0.5 ? input.untargeted : null;
  if (input.misallocationPct < 0.05 && !hasLeverageGap && !untargeted) {
    return [...head, prose('nulla è fuori posizione: ogni classe è sul suo target.')];
  }
  head.push(prose(articleForPercent(input.misallocationPct, 1)), percent(input.misallocationPct, 1), prose(' è fuori posizione'));
  if (hasLeverageGap) {
    head.push(prose(" e l'esposizione è "), points(input.leverageGapPp, 0), prose(` ${input.leverageGapPp < 0 ? 'sotto' : 'sopra'} il target di leva`));
  }
  if (untargeted) {
    const names = untargeted.labels.length > 0 ? ` (${untargeted.labels.join(', ')})` : '';
    head.push(prose(` e ${articleForPercent(untargeted.pct, 0)}`), percent(untargeted.pct, 0), prose(` è in classi senza target${names}`));
  }
  const count: Narrative =
    input.offTargetCount === 0
      ? [prose('nessuna classe è fuori target')]
      : [prose(input.offTargetCount === 1 ? 'è ' : 'sono '), figure(String(input.offTargetCount)), prose(input.offTargetCount === 1 ? ' classe su ' : ' classi su '), figure(String(input.classCount)), prose(' fuori target')];
  return [...head, prose(`; ${bandClause(input.band)} `), ...count, prose('.')];
}

/**
 * What changing the band just did, for a screen reader — «Soglia ±5%: 3 classi su 6 fuori target.»
 *
 * The band silently rewrites four regions at once (the verdict, this reading, the Piano's whole
 * body and every chip in Per classe). A sighted reader sees them move; without a live region a
 * keyboard reader pressed a button and nothing was announced at all.
 */
export function describeBandChange(input: { band: RebalanceBand; offTargetCount: number; classCount: number }): string {
  const scope = input.band.type === 'rule525' ? 'Regola 5/25' : `Soglia ${describeBand(input.band)}`;
  if (input.offTargetCount === 0) return `${scope}: nessuna classe fuori target.`;
  const noun = input.offTargetCount === 1 ? 'classe' : 'classi';
  return `${scope}: ${input.offTargetCount} ${noun} su ${input.classCount} fuori target.`;
}

/**
 * The tile's footer: what sits INSIDE the total but cannot move, and what sits OUTSIDE it —
 * two opposite relationships to the number above, hence two sentences, never one figure.
 */
export function describeBalanceFooter(input: { frozen: HoldingsGroup; excluded: HoldingsGroup; netWorth: number }): Narrative | null {
  const parts: Narrative[] = [];
  if (input.frozen.count > 0) {
    parts.push([prose('Nel totale '), amount(input.frozen.total), prose(` non negoziabili (${input.frozen.count} asset: contano nelle percentuali, nessun piano li muove).`)]);
  }
  if (input.excluded.count > 0) {
    parts.push([prose('Fuori dal totale '), amount(input.excluded.total), prose(` esclusi (${input.excluded.count} asset): il patrimonio è `), amount(input.netWorth), prose('.')]);
  }
  if (parts.length === 0) return null;
  return parts.flatMap((part, i) => (i === 0 ? part : [prose(' '), ...part]));
}

// ─── Piano ────────────────────────────────────────────────────────────────────

function operationsCount(n: number, balanced: boolean): Narrative {
  const label = n === 1 ? 'una sola operazione' : `${numberWord(n)} operazioni`;
  return [prose(`, ${label}${balanced ? ' a saldo zero' : ''}`)];
}

function describeMoves(moves: RebalanceMove[], band: RebalanceBand): Narrative {
  if (moves.length === 0) return [prose(`Tutto in linea: nessuna operazione necessaria ${bandClause(band)}.`)];

  const sells = moves.filter((move) => move.action === 'VENDI');
  const buys = moves.filter((move) => move.action === 'COMPRA');
  let operations = 0;
  let sold = 0;
  let bought = 0;

  const sellItems: Narrative[] = sells.map((move, i) => {
    const subject = classSubject(move.assetClass, move.label);
    if (move.limitedByFrozen && move.amount < MIN_MOVE) {
      return [prose(`${subject.subject} ${subject.plural ? 'sono' : 'è'} sopra target ma ${subject.plural ? 'tutte' : 'tutta'} non negoziabil${subject.plural ? 'i' : 'e'}`)];
    }
    operations += 1;
    sold += move.amount;
    const verb = i === 0 ? 'vendi ' : '';
    if (move.limitedByFrozen) {
      return [prose(`${verb}i `), amount(move.amount), prose(` negoziabili di ${subject.object} (il gap è `), amount(move.requestedAmount), prose(')')];
    }
    return [prose(verb), amount(move.amount), prose(` di ${subject.object}`)];
  });
  const buyItems: Narrative[] = buys.map((move) => {
    operations += 1;
    bought += move.amount;
    return [amount(move.amount), prose(` di ${classSubject(move.assetClass, move.label).object}`)];
  });

  const sentence: Narrative = [prose('Per rientrare nella soglia: ')];
  if (sellItems.length > 0) sentence.push(...sellItems.flatMap((item, i) => (i === 0 ? item : [prose(', '), ...item])));
  if (buyItems.length > 0) {
    if (sellItems.length > 0) sentence.push(prose(sellItems.length > 1 ? ', e ' : ' e '));
    sentence.push(prose('compra '), ...joinList(buyItems));
  }
  if (operations > 0) sentence.push(...operationsCount(operations, Math.abs(sold - bought) < 1));
  sentence.push(prose('.'));
  return sentence;
}

const MIN_MOVE = 0.5;

function tradeItems(trades: InstrumentTrade[]): { sells: Narrative[]; buys: Narrative[] } {
  const label = (trade: InstrumentTrade) => trade.displayTicker || trade.ticker;
  return {
    sells: trades.filter((t) => t.amount < 0).map((t) => [amount(t.amount), prose(` di ${label(t)}`)]),
    buys: trades.filter((t) => t.amount > 0).map((t) => [amount(t.amount), prose(` di ${label(t)}`)]),
  };
}

function describeTrades(trades: InstrumentTrade[], resultingLeverageRatio: number | null): Narrative {
  if (trades.length === 0) return [prose('Tutto in linea: nessuna operazione riporta esposizione e leva più vicine al target.')];
  const { sells, buys } = tradeItems(trades);
  const sentence: Narrative = [prose('Per rientrare nella soglia: ')];
  if (sells.length > 0) sentence.push(prose('vendi '), ...joinList(sells));
  if (buys.length > 0) {
    if (sells.length > 0) sentence.push(prose(sells.length > 1 ? ', e ' : ' e '));
    sentence.push(prose('compra '), ...joinList(buys));
  }
  if (resultingLeverageRatio !== null) sentence.push(prose('; la leva risultante è '), figure(formatLeverage(resultingLeverageRatio)));
  sentence.push(prose('.'));
  return sentence;
}

/** «le azioni non ne prendono» / «la liquidità non ne prende» / «le azioni e la liquidità non ne prendono». */
function overTargetClause(labels: string[], byLabel: Map<string, ClassSubject>): Narrative {
  if (labels.length === 0) return [];
  const subjects = labels.map((label) => byLabel.get(label) ?? { subject: label, plural: false, feminine: false, from: `da ${label}`, object: label });
  const plural = subjects.length > 1 || subjects[0].plural;
  return [prose(`; ${joinList(subjects.map((s) => [prose(s.subject)])).map((seg) => seg.text).join('')} non ne ${plural ? 'prendono' : 'prende'}`)];
}

/** The subjects the plan's class labels map to — labels are what the plan carries, keys are what the prose needs. */
function subjectsByLabel(labels: Record<string, string>): Map<string, ClassSubject> {
  return new Map(Object.entries(labels).map(([key, label]) => [label, classSubject(key, label)]));
}

const LABELS_TO_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(CLASS_SUBJECTS).map(([key]) => [key, key]),
);

/**
 * The reading of the Piano tile for its mode, from the `PlanView` the page built.
 *
 * `saleTax` is appended to the modes that SELL — a rebalance and a withdrawal — because the figure
 * they name is gross and the money that reaches the account is not. A contribution never sells, so
 * it never carries the clause.
 */
export function describePlan(
  view: PlanView,
  band: RebalanceBand,
  saleTax: SaleTaxEstimate | null = null,
  labels: Record<string, string> = DEFAULT_LABELS,
): Narrative {
  const byLabel = subjectsByLabel(labels);
  const subjectFor = (node: { key: string; label: string }) => byLabel.get(node.label) ?? classSubject(LABELS_TO_KEYS[node.key] ?? node.key, node.label);
  /** The tax clause sits INSIDE the full stop the sentence already ends with. */
  const withTax = (sentence: Narrative, netIsTheSubject = false): Narrative => {
    const clause = describeSaleTaxClause(saleTax, netIsTheSubject);
    return clause.length === 0 ? sentence : [...sentence.slice(0, -1), ...clause, prose('.')];
  };

  if (view.mode === 'rebalance') {
    return withTax(view.trades ? describeTrades(view.trades, view.resultingLeverageRatio) : describeMoves(view.moves, band));
  }

  if (view.mode === 'contribute') {
    if (view.amount <= 0) return [prose('Inserisci un importo per vedere dove andrebbe.')];
    if (view.trades) {
      if (view.trades.length === 0) return [prose('Con '), amount(view.amount), prose(' in più nessun acquisto avvicina il portafoglio al target.')];
      const { buys } = tradeItems(view.trades);
      return [prose('Con '), amount(view.amount), prose(' in più: '), ...joinList(buys), prose(', solo acquisti.')];
    }
    if (view.nodes.length === 0) return [prose('Con '), amount(view.amount), prose(' in più nessun acquisto avvicina il portafoglio al target.')];
    const items = view.nodes.map((node) => [amount(node.amount), prose(` in ${subjectFor(node).object}`)]);
    return [prose('Con '), amount(view.amount), prose(' in più: '), ...joinList(items), prose(', senza vendere nulla'), ...overTargetClause(view.overTarget, byLabel), prose('.')];
  }

  if (view.amount <= 0) return [prose('Inserisci un importo per vedere da dove conviene prelevare.')];
  if (view.exceedsPortfolio) {
    // Two different failures. Below the tradable total the request simply does not fit, and the
    // old sentence is still the right one. Above it, the request fits but its GROSS does not: the
    // reader asked for a net, so the sentence has to say the net will fall short — the tax clause
    // then names what actually arrives.
    if (!view.grossedUp) {
      return [amount(view.amount), prose(' superano i '), amount(view.tradableTotal), prose(' negoziabili: il piano liquida tutto.')];
    }
    // The full stop is its OWN segment: `withTax` inserts the clause before it, and a stop glued to
    // the prose would be sliced away with the words it sits on.
    return withTax([
      prose('Per prelevare '),
      amount(view.amount),
      prose(' netti servirebbe vendere più dei '),
      amount(view.tradableTotal),
      prose(' negoziabili: il piano liquida tutto'),
      prose('.'),
    ]);
  }
  // «Prelevare 1000 €» means 1000 € IN HAND, so the head names the net first and the gross second:
  // the rows below add up to the gross, and a reader who checks them must find the figure named.
  // The leverage engine is grossed up by the same fixed point, so it takes the same head.
  const head: Narrative = view.grossedUp
    ? [prose('Per prelevare '), amount(view.amount), prose(' netti vendi '), amount(view.grossAmount), prose(': ')]
    : [prose('Per prelevare '), amount(view.amount), prose(': ')];
  if (view.trades) {
    if (view.trades.length === 0) return [prose('Per prelevare '), amount(view.amount), prose(' nessuna vendita avvicina il portafoglio al target.')];
    const { sells } = tradeItems(view.trades);
    // «netti vendi 1080 €: vendi 648 € di…» would say the verb twice; the grossed head already has it.
    return withTax([...head, ...(view.grossedUp ? [] : [prose('vendi ')]), ...joinList(sells), prose('.')], view.grossedUp);
  }
  if (view.nodes.length === 0) return [prose('Per prelevare '), amount(view.amount), prose(' nessuna vendita avvicina il portafoglio al target.')];
  if (view.nodes.length === 1) {
    const subject = subjectFor(view.nodes[0]);
    const over = view.overTarget.includes(view.nodes[0].label);
    return withTax([...head, prose(`tutto ${subject.from}`), ...(over ? [prose(`, che ${subject.plural ? 'sono' : 'è'} sopra target`)] : []), prose('.')], view.grossedUp);
  }
  const items = view.nodes.map((node) => [amount(node.amount), prose(` ${subjectFor(node).from}`)]);
  return withTax(
    [...head, ...joinList(items), ...(view.overTarget.length > 0 ? [prose(', partendo da ciò che è sopra target')] : []), prose('.')],
    view.grossedUp,
  );
}

const DEFAULT_LABELS: Record<string, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Criptovalute',
  realestate: 'Immobili',
  cash: 'Liquidità',
  commodity: 'Materie Prime',
  trendFollowing: 'Trend Following',
  carry: 'Carry',
};

/**
 * «; incassi 19.000 € netti, dopo circa 3000 € di ritenuta» — what a plan's sells actually deliver.
 *
 * In regime amministrato the broker withholds on the day of the sale, so a bare «vendi 22.000 €» is
 * a gross figure the reader never sees whole. When the estimate is not available the clause is
 * DROPPED, not softened (The Narrative Honesty Rule) — and the footer then keeps saying the tax is
 * not counted, so the surface never both hides a figure and implies it was included.
 */
export function describeSaleTaxClause(estimate: SaleTaxEstimate | null, netIsTheSubject = false): Narrative {
  if (!estimate || estimate.tax === null || estimate.net === null) return [];
  if (estimate.tax < 1) {
    return [prose('; nessuna ritenuta, le posizioni da vendere non sono in guadagno')];
  }
  // On a withdrawal the headline already opens on the net («Per prelevare 1000 € netti…»), so the
  // clause names only what the broker keeps: repeating the net would print it twice in one sentence.
  if (netIsTheSubject) return [prose('; la ritenuta stimata è '), amount(estimate.tax)];
  return [prose('; incassi '), amount(estimate.net), prose(' netti, dopo circa '), amount(estimate.tax), prose(' di ritenuta')];
}

/**
 * The disclaimer under the plan, per mode and per engine — the same words the panels carried.
 *
 * `taxEstimated` swaps the «le tasse sulla plusvalenza non sono considerate» admission for the
 * method behind the figure the reading now prints. The two must never both appear: a footer that
 * disclaims a tax the sentence above just quoted contradicts its own tile.
 */
export function describePlanFooter(mode: PlanMode, leveraged: boolean, taxEstimated = false): string {
  const disclaimer = 'Stima indicativa, non un consiglio finanziario.';
  const taxNote = taxEstimated
    ? 'La ritenuta è stimata sulla plusvalenza della quota venduta, al netto di eventuali minusvalenze pregresse che non sono considerate.'
    : 'Le tasse sulla plusvalenza non sono considerate.';
  if (mode === 'rebalance') {
    return leveraged
      ? `Operazioni sugli strumenti reali che detieni, a saldo cassa nullo, per riportare l'esposizione nozionale di ogni classe verso il target. ${taxNote} ${disclaimer}`
      : `Le vendite sono limitate a ciò che puoi negoziare. ${taxNote} ${disclaimer}`;
  }
  if (mode === 'contribute') {
    return leveraged
      ? `Ripartisce la nuova liquidità sugli strumenti reali che detieni (solo acquisti), verso l'esposizione nozionale target di ogni classe. ${disclaimer}`
      : `Colma prima le classi e le sottocategorie sotto target, senza vendere nulla. Sul singolo strumento segue i tuoi asset specifici, se configurati; altrimenti ripartisce in proporzione a quanto detieni. ${disclaimer}`;
  }
  return leveraged
    ? `Raccoglie la cifra vendendo gli strumenti reali che detieni (solo vendite), riportando l'esposizione nozionale verso il target. ${taxNote} ${disclaimer}`
    : `Attinge prima da classi e sottocategorie sopra target, così il prelievo ti riavvicina all'obiettivo. Dove non c'è un target, ripartisce in proporzione a quanto detieni. ${taxNote} ${disclaimer}`;
}

// ─── Per classe ───────────────────────────────────────────────────────────────

/**
 * «Il gap più grande in euro è Azioni, 8085 € sopra il target; Liquidità, Materie Prime e
 * Criptovalute sono in linea.» The verdict reads the drifts in POINTS; this tile reads the
 * largest one in EURO, so the two never print the same figure for the same class.
 */
export function describeClasses(gaps: ClassGap[], band: RebalanceBand): Narrative | null {
  if (gaps.length === 0) return null;
  const inLine = gaps.filter((gap) => gap.action === 'OK');

  if (inLine.length === gaps.length) {
    const farthest = gaps.reduce((best, gap) => (Math.abs(gap.differencePp) > Math.abs(best.differencePp) ? gap : best));
    const head =
      gaps.length === 1
        ? `L'unica classe ${band.type === 'rule525' ? 'rispetta la regola 5/25' : `è ${bandClause(band)}`}`
        : `Tutte e ${numberWord(gaps.length)} le classi ${band.type === 'rule525' ? 'rispettano la regola 5/25' : `sono ${bandClause(band)}`}`;
    if (gaps.length === 1 || Math.abs(farthest.differencePp) < 0.05) return [prose(`${head}.`)];
    return [prose(`${head}; la più lontana è ${farthest.label}, `), points(farthest.differencePp), prose(` ${farthest.differencePp > 0 ? 'sopra' : 'sotto'} il target.`)];
  }

  const largest = gaps.reduce((best, gap) => (Math.abs(gap.differenceValue) > Math.abs(best.differenceValue) ? gap : best));
  const head: Narrative = [prose(`Il gap più grande in euro è ${largest.label}, `), amount(largest.differenceValue), prose(` ${largest.differenceValue > 0 ? 'sopra' : 'sotto'} il target`)];
  if (inLine.length === 0) return [...head, prose('; nessuna è in linea.')];
  const names = joinList(inLine.map((gap) => [prose(gap.label)]));
  return [...head, prose('; '), ...names, prose(inLine.length === 1 ? ' è in linea.' : ' sono in linea.')];
}

// ─── Esposizione ──────────────────────────────────────────────────────────────

/**
 * «Il titolo più pesante è Apple (4,1% del portafoglio, in 3 strumenti); il primo settore è
 * Tecnologia (24,3%) e iShares emette il 61% degli ETF.» Null when nothing was analysed.
 *
 * The clause of the view the reader is IN comes first. The tile shows one list at a time, and a
 * reading that opened on the heaviest holding while the list ranked issuers answered a question
 * nobody had asked — it was the only reading on the page that did not answer the state it was in.
 * All three facts stay: the tile is one question («cosa possiedo davvero?») and the other two are
 * the context that makes the first one worth reading.
 */
export function describeExposure(highlights: ExposureHighlights, view: ExposureViewKey = 'holdings'): Narrative | null {
  /**
   * A clause that OPENS on a proper name is never capitalised: the issuer's own spelling is the
   * fact, and «iShares» turned into «IShares» is the app correcting a brand.
   */
  type Clause = { narrative: Narrative; opensOnProperName: boolean };

  const holdingClause = (): Clause | null => {
    if (!highlights.topHolding) return null;
    const { name, pct, sourceCount } = highlights.topHolding;
    return {
      narrative: [prose(`il titolo più pesante è ${name} (`), percent(pct, 1), prose(` del portafoglio, in ${sourceCount} strument${sourceCount === 1 ? 'o' : 'i'})`)],
      opensOnProperName: false,
    };
  };
  const sectorClause = (): Clause | null =>
    highlights.topSector
      ? {
          narrative: [prose(`il primo settore è ${highlights.topSector.label} (`), percent(highlights.topSector.pct, 1), prose(')')],
          opensOnProperName: false,
        }
      : null;
  const issuerClause = (): Clause | null => {
    if (!highlights.topIssuer) return null;
    const share = highlights.topIssuer.etfShare;
    return {
      narrative: [prose(`${highlights.topIssuer.family} emette ${articleForPercent(share, 0)}`), figure(`${share}%`), prose(' degli ETF')],
      opensOnProperName: true,
    };
  };

  const order: Array<Clause | null> =
    view === 'sectors'
      ? [sectorClause(), holdingClause(), issuerClause()]
      : view === 'issuers'
        ? [issuerClause(), holdingClause(), sectorClause()]
        : [holdingClause(), sectorClause(), issuerClause()];

  const clauses = order.filter((clause): clause is Clause => clause !== null);
  if (clauses.length === 0) return null;
  const [first, ...rest] = clauses;
  const sentence: Narrative = first.opensOnProperName
    ? [...first.narrative]
    : [prose(capitalize(first.narrative[0].text)), ...first.narrative.slice(1)];
  if (rest.length > 0) sentence.push(prose('; '), ...joinList(rest.map((clause) => clause.narrative)));
  sentence.push(prose('.'));
  return sentence;
}

/** What an empty exposure view means — the rule each list encoded, one line, no figure. */
export function describeExposureEmpty(view: 'holdings' | 'sectors' | 'issuers'): string {
  switch (view) {
    case 'holdings':
      return 'Nessun titolo riconosciuto: verifica che i ticker degli ETF siano noti a Yahoo Finance.';
    case 'sectors':
      return 'Nessun dato settoriale per gli ETF in portafoglio.';
    default:
      return 'Nessun ETF in portafoglio.';
  }
}

/**
 * «12 asset su 16 analizzati · % del portafoglio» — the tile's aside.
 *
 * The second half names the base of the percentage column, which is the WHOLE portfolio: the
 * reading beside it says an issuer emits «il 46% degli ETF» and the row under it printed «29%» for
 * the same issuer, two true figures on two bases with only one of them declared.
 */
export function describeExposureAside(input: { analyzedAssets: number; totalAssets: number }): string {
  return `${input.analyzedAssets} asset su ${input.totalAssets} analizzati · % del portafoglio`;
}

const EXPOSURE_METHOD = 'Prime ~10 posizioni per ETF da Yahoo Finance: approssimato per i fondi molto diversificati. Nessuna copertura geografica.';

/** The tile's footer: the method, then the day of the last computation when known. */
export function describeExposureFooter(computedAt: string | null): string {
  if (!computedAt) return EXPOSURE_METHOD;
  const date = new Date(computedAt);
  if (Number.isNaN(date.getTime())) return EXPOSURE_METHOD;
  const day = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(date);
  return `${EXPOSURE_METHOD} Aggiornato il ${day}.`;
}

// ─── Previdenza ───────────────────────────────────────────────────────────────

export interface PensionInput {
  fundCount: number;
  fundValue: number;
  fundSlices: ClassSlice[];
  combinedTotal: number;
  combinedSlices: ClassSlice[];
  hasExcluded: boolean;
  allFrozen: boolean;
}

/** «per il 70% obbligazioni e il 30% azioni» — a mix as a list, class names as bare objects. */
function mixList(slices: ClassSlice[], decimals: number): Narrative {
  return joinList(slices.map((slice) => [prose(articleForPercent(slice.percentage, decimals)), percent(slice.percentage, decimals), prose(` ${classSubject(slice.assetClass, slice.label).object}`)]));
}

/**
 * «Il fondo pensione (42.000 €) è per il 70% obbligazioni e il 30% azioni ed è già dentro il
 * totale allocato come non negoziabile; sull'intero patrimonio (425.000 €, esclusi compresi) gli
 * immobili pesano il 42,4% e le azioni il 33,6%.»
 */
export function describePension(input: PensionInput): Narrative {
  const many = input.fundCount > 1;
  const head: Narrative = [prose(many ? `I ${input.fundCount} fondi pensione (` : 'Il fondo pensione ('), amount(input.fundValue), prose(many ? ') sono per ' : ') è per '), ...mixList(input.fundSlices, 0)];
  const role = input.allFrozen
    ? prose(many ? ' e sono già dentro il totale allocato come non negoziabili' : ' ed è già dentro il totale allocato come non negoziabile')
    : prose(many ? ', ma non tutti dentro il totale allocato' : ', ma fuori dal totale allocato');
  const sentence: Narrative = [...head, role];

  const [top, second] = input.combinedSlices;
  if (top) {
    const topSubject = classSubject(top.assetClass, top.label);
    sentence.push(
      prose(`; sull'intero patrimonio (`),
      amount(input.combinedTotal),
      prose(`${input.hasExcluded ? ', esclusi compresi' : ''}) ${topSubject.subject} ${topSubject.plural ? 'pesano' : 'pesa'} ${articleForPercent(top.percentage, 1)}`),
      percent(top.percentage, 1),
    );
    if (second) {
      sentence.push(prose(` e ${classSubject(second.assetClass, second.label).subject} ${articleForPercent(second.percentage, 1)}`), percent(second.percentage, 1));
    }
  }
  sentence.push(prose('.'));
  return sentence;
}

/** «Cometa · 42.000 € · non negoziabile» — the Previdenza tile's aside. */
export function describePensionAside(input: { fundNames: string[]; fundValue: number; allFrozen: boolean }): string {
  const names = input.fundNames.length > 0 ? input.fundNames.join(', ') : 'Fondo pensione';
  const parts = [names, cachedFormatCurrencyEUR(input.fundValue, true)];
  if (input.allFrozen) parts.push(input.fundNames.length > 1 ? 'non negoziabili' : 'non negoziabile');
  return parts.join(' · ');
}

// ─── Dettaglio ────────────────────────────────────────────────────────────────

/** «1 asset, 42.000 €: contano nel totale e nelle percentuali, ma nessun piano li muove; il ruolo si cambia in Patrimonio.» */
export function describeFrozen(group: HoldingsGroup): Narrative {
  return [prose(`${group.count} asset, `), amount(group.total), prose(': contano nel totale e nelle percentuali, ma nessun piano li muove; il ruolo si cambia in Patrimonio.')];
}

/** «2 asset, 200.000 €: nel patrimonio, fuori da ogni calcolo di questa pagina; per questo il totale allocato è più basso del patrimonio netto.» */
export function describeExcluded(group: HoldingsGroup): Narrative {
  return [prose(`${group.count} asset, `), amount(group.total), prose(': nel patrimonio, fuori da ogni calcolo di questa pagina; per questo il totale allocato è più basso del patrimonio netto.')];
}
