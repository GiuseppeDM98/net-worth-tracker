/**
 * The words of the public landing (DESIGN.md → §5 Page Verdict, Tile).
 *
 * The landing is the Panoramica told to someone who has no data yet, so it takes the same
 * cadence — a verdict, then a grid of tiles, each with a reading above its figures — and the
 * same rule: no component writes copy. Like the two authentication pages, this surface
 * measures nothing about the reader, so its verdict is the PRODUCT's promise rather than a
 * reading of data; it is still generated from state (is there a demo account? are
 * registrations open?), so a clause that has nothing behind it disappears instead of turning
 * into a placeholder (the Narrative Honesty Rule).
 *
 * The three tiles that do not show figures state what the app COMPUTES, and every fact in them
 * is read from the module that owns it — the benchmark list, the Monte Carlo default, the
 * pension deduction ceiling — never typed here. A landing that claims a number the app no
 * longer computes is the worst kind of stale copy: it is the first thing a stranger reads.
 */

import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';
import { BENCHMARKS } from '@/lib/constants/benchmarks';
import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import { DEFAULT_MONTE_CARLO_SIMULATIONS } from '@/lib/utils/monteCarloParams';
import { getPensionDeductionCeiling } from '@/lib/utils/pensionDeduction';
import { PRODUCT_PROMISE_HEADLINE } from '@/lib/utils/authNarrative';

import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { RegistrationAccess } from '@/lib/utils/authNarrative';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** One measure a promise tile names, and what it answers. */
export interface LandingPromiseRow {
  label: string;
  caption: Narrative;
}

/** A tile that shows no figures: it says what the section it stands for computes. */
export interface LandingPromise {
  key: string;
  eyebrow: string;
  reading: Narrative;
  rows: LandingPromiseRow[];
}

/**
 * The landing's verdict. `demoAvailable` is the only state it has: without the
 * NEXT_PUBLIC_DEMO_* variables there is no demo to promise, so the clause about it is dropped
 * rather than softened — the sentence must never send a visitor looking for a button that
 * is not on the page.
 */
export function buildLandingVerdict(demoAvailable: boolean): PageVerdictModel {
  const opening =
    'Patrimonio, cashflow, dividendi, rendimenti e piano FIRE in un unico posto. ' +
    'Ogni pagina apre con una frase che risponde alla sua domanda: i numeri vengono dopo. ' +
    'Qui sotto c’è la Panoramica su un profilo inventato';

  return {
    headline: PRODUCT_PROMISE_HEADLINE,
    tone: 'neutral',
    sentence: [
      prose(
        demoAvailable
          ? `${opening}; la demo apre l’app vera, su un account condiviso in sola lettura.`
          : `${opening}.`,
      ),
    ],
  };
}

/**
 * The line under the two buttons. It exists only where a demo does: a page with no demo has
 * nothing to warn about, and printing the sentence anyway would describe a button that is not
 * rendered.
 */
export function describeDemoAccess(demoAvailable: boolean): Narrative | null {
  if (!demoAvailable) return null;
  return [prose('La demo è un account condiviso: puoi guardare tutto, non si modifica niente.')];
}

/**
 * The secondary path off the landing, shown only where a profile can actually be created.
 * `closed` returns null — an invitation to register behind a closed door is a promise the
 * server does not keep (`resolveRegistrationAccess` mirrors the server's own precedence).
 */
export function describeRegistrationInvite(
  access: RegistrationAccess,
): { question: string; linkLabel: string } | null {
  if (access === 'closed') return null;
  return {
    question: access === 'invite-only' ? 'Hai un invito?' : 'Non hai un profilo?',
    linkLabel: 'Registrati',
  };
}

/**
 * The declaration above the grid. The landing states once, in the eyebrow's own voice and at
 * the head of the region it governs, which tiles carry invented figures and which carry none:
 * a caption under a single number would read as a footnote to that number alone.
 */
export function describeSampleProfile(): Narrative {
  return [
    prose(
      'I numeri delle prime quattro tessere sono un profilo inventato, coerente al suo interno ' +
        'e con nessun account reale. Le ultime tre non stampano numeri: dicono che cosa l’app calcola.',
    ),
  ];
}

/** The eyebrow of that region, in the app's one label register. */
export const SAMPLE_PROFILE_EYEBROW = 'Panoramica · dati d’esempio';

/**
 * The three tiles that measure nothing on this page.
 *
 * `year` decides the pension deduction ceiling, which changed in 2026 and will change again;
 * it is passed in rather than read from a clock so the copy stays a pure function of its
 * inputs (AGENTS.md → functions that call `new Date()` internally are untestable).
 */
export function buildLandingPromises(year: number): LandingPromise[] {
  const benchmarkCount = BENCHMARKS.length;
  const deductionCeiling = getPensionDeductionCeiling(year);

  return [
    {
      key: 'rendimenti',
      eyebrow: 'Rendimenti',
      reading: [
        prose(
          'Il rendimento del portafoglio, non la variazione del saldo: i versamenti sono neutralizzati, e il confronto è con ',
        ),
        figure(String(benchmarkCount)),
        prose(' portafogli modello in euro.'),
      ],
      rows: [
        { label: 'TWR e IRR', caption: [prose('rendimento time-weighted e money-weighted')] },
        { label: 'Sharpe, Sortino, volatilità', caption: [prose('quanto rischio è costato')] },
        { label: 'Drawdown massimo', caption: [prose('la caduta peggiore, e quanto è durata')] },
        { label: 'Benchmark', caption: [prose('i portafogli modello con cui ti confronti')] },
      ],
    },
    {
      key: 'fire',
      eyebrow: 'FIRE',
      reading: [
        prose('Quando il capitale basta, e quanto regge: una proiezione deterministica e '),
        figure(formatNumberIt(DEFAULT_MONTE_CARLO_SIMULATIONS, 0)),
        prose(' simulazioni per scenario.'),
      ],
      rows: [
        { label: 'Calcolatore', caption: [prose('l’anno e l’età in cui i soldi bastano')] },
        { label: 'Coast FIRE', caption: [prose('se puoi smettere di versare da oggi')] },
        { label: 'Monte Carlo', caption: [prose('in quante simulazioni il piano regge')] },
        { label: 'What If', caption: [prose('cosa cambia se salta un anno di stipendio')] },
      ],
    },
    {
      key: 'previdenza',
      eyebrow: 'Previdenza',
      reading: [
        prose(
          'Il fondo pensione cresce per tre cause diverse, e l’app non le somma: mercato, datore e fisco.',
        ),
      ],
      rows: [
        { label: 'Rendimento', caption: [prose('TWR, dal mese da cui si misura')] },
        { label: 'Versamenti', caption: [prose('tuoi, del datore e TFR, tenuti distinti')] },
        {
          label: 'Deduzione IRPEF',
          caption: [
            prose('il plafond di '),
            figure(cachedFormatCurrencyEUR(deductionCeiling, true)),
            prose(', più l’extra dei primi anni'),
          ],
        },
        { label: 'Sblocco', caption: [prose('l’anno in cui rientra nel piano FIRE')] },
      ],
    },
  ];
}

/**
 * The footer's one line of structural facts about the tool. Both are checkable: the count of
 * classes is the union's own enumeration (a landing that typed «6» kept saying so for the ten
 * days after `trendFollowing` and `carry` were added), and the absence of telemetry is a
 * settled fact of this repository — there is no analytics dependency of any kind
 * (PRODUCT.md → Absences that must never be fabricated).
 */
export function describeProjectFacts(): Narrative {
  return [
    figure(String(ASSET_CLASS_SEQUENCE.length)),
    prose(' classi di asset · nessuna telemetria · open source'),
  ];
}
