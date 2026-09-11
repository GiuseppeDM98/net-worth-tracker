/**
 * The words for a period's sales and for the market-vs-flows split — shared by the Panoramica,
 * Patrimonio and the periodic email, so the three say the same thing about the same trade.
 *
 * SDK-free: formatters from `lib/utils/formatters`, never from `chartService` (the email Lambda
 * imports this — AGENTS.md → Italian Localization).
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { DeclineCause, PeriodSalesSummary } from '@/lib/utils/periodSales';
import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** Signed compact euro figure with a typographic minus, coloured by sign. */
function signedCompactEuro(value: number): NarrativeSegment {
  const sign = value >= 0 ? '+' : '−';
  return {
    text: `${sign}${cachedFormatCurrencyEUR(Math.abs(value), true)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

/** The tail of a falling headline, after «{subject} è in calo». Empty for `unknown`. */
export function declineHeadlineTail(cause: DeclineCause): string {
  switch (cause) {
    case 'despite-market':
      return ', nonostante il mercato.';
    case 'taxes-over-market':
      return ': il mercato ha pesato, le tasse sulle vendite di più.';
    case 'market-and-taxes':
      return ': il mercato ha pesato, e con lui le tasse sulle vendite.';
    case 'flows-over-market':
      return ': più per le uscite che per il mercato.';
    case 'market':
      return ': il mercato ha pesato.';
    case 'unknown':
      return '.';
  }
}

/**
 * «Di quel movimento, −1079 € viene dal mercato e −3859 € dai tuoi movimenti.» — the month's
 * change split into the price effect and everything else the user did (deposits, spending,
 * sales, taxes). Stated whenever both halves exist; the split is exact by construction.
 */
export function describeOwnFlowsSplit(delta: number, marketEffect: number): Narrative {
  const ownFlows = delta - marketEffect;
  return [
    prose('Di quel movimento, '),
    signedCompactEuro(marketEffect),
    prose(' viene dal mercato e '),
    signedCompactEuro(ownFlows),
    prose(' dai tuoi movimenti.'),
  ];
}

/** «Vanguard FTSE All-World» for one instrument, «3 strumenti» for more. */
function salesSubject(sales: PeriodSalesSummary): NarrativeSegment[] {
  if (sales.instruments.length === 1) return [prose(sales.instruments[0].name)];
  return [figure(String(sales.instruments.length)), prose(' strumenti')];
}

/**
 * «Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato
 * circa 4089 € di tasse.» The tax is the broker's withholding, already gone at the sale (regime
 * amministrato), so the verb is «pagato», not «pagherai»; «circa» because it is estimated from the
 * instrument's rate. A loss carries no tax; a missing rate says so instead of printing zero.
 */
export function describeSales(sales: PeriodSalesSummary): Narrative {
  const narrative: Narrative = [
    prose('Hai venduto '),
    ...salesSubject(sales),
    prose(' per '),
    figure(cachedFormatCurrencyEUR(sales.proceeds, true)),
  ];

  if (sales.realizedGain <= 0) {
    narrative.push(
      prose(' con una minusvalenza di '),
      figure(cachedFormatCurrencyEUR(Math.abs(sales.realizedGain), true)),
      prose(', senza tasse.'),
    );
    return narrative;
  }

  narrative.push(prose(' con una plusvalenza di '), figure(cachedFormatCurrencyEUR(sales.realizedGain, true)));
  if (sales.estimatedTax === null) {
    const where = sales.instruments.length === 1 ? 'sullo strumento' : 'su ogni strumento';
    narrative.push(prose(`; senza un'aliquota ${where} le tasse non sono stimate.`));
    return narrative;
  }
  narrative.push(
    prose(' e pagato circa '),
    figure(cachedFormatCurrencyEUR(sales.estimatedTax, true)),
    prose(' di tasse.'),
  );
  return narrative;
}
