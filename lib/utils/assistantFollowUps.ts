// Pure derivation of follow-up question suggestions shown after a completed
// assistant answer (Blocco B1). Keeps the conversation moving by proposing the
// next sensible question, so the user is never left facing an empty composer.
//
// Design: a small curated set per analysis mode, optionally enriched by one
// data-derived prompt read from the period context bundle (e.g. the asset class
// that moved the most, or a negative cash flow). No network call, no model call —
// deterministic and unit-testable.
import { AssistantMode, AssistantMonthContextBundle } from '@/types/assistant';

export interface AssistantFollowUp {
  id: string;
  label: string;
  prompt: string;
}

// Maximum chips surfaced at once — keeps the row scannable and within the
// working-memory budget (Miller's law: a short list reads as a glance, not a menu).
const MAX_FOLLOW_UPS = 3;

// Curated, period-appropriate continuations. These read as the natural "next
// question" a methodical investor asks after a first analysis of that period.
const CURATED_FOLLOW_UPS: Record<AssistantMode, AssistantFollowUp[]> = {
  month_analysis: [
    {
      id: 'month-compare-prev',
      label: 'Confronta col mese precedente',
      prompt: 'Confronta questo mese con il mese precedente: cosa è cambiato nel patrimonio, nel cashflow e nell’allocazione?',
    },
    {
      id: 'month-expense-detail',
      label: 'Dove posso risparmiare?',
      prompt: 'Analizza le spese principali del mese e indicami dove avrei margine concreto per risparmiare.',
    },
  ],
  year_analysis: [
    {
      id: 'year-compare-prev',
      label: 'Confronta con l’anno scorso',
      prompt: 'Confronta questo anno con l’anno precedente: patrimonio, capacità di risparmio e principali driver.',
    },
    {
      id: 'year-best-worst',
      label: 'Mesi migliori e peggiori',
      prompt: 'Quali sono stati i mesi migliori e peggiori dell’anno per il mio patrimonio, e perché?',
    },
  ],
  ytd_analysis: [
    {
      id: 'ytd-projection',
      label: 'Proiezione a fine anno',
      prompt: 'In base all’andamento da inizio anno, che proiezione realistica posso fare per il patrimonio a fine anno?',
    },
    {
      id: 'ytd-goal-gap',
      label: 'Sono in linea con gli obiettivi?',
      prompt: 'Rispetto ai miei obiettivi dichiarati, sto andando in linea da inizio anno o sto deviando? Dove?',
    },
  ],
  history_analysis: [
    {
      id: 'history-growth-peak',
      label: 'Periodo di crescita maggiore',
      prompt: 'Qual è stato il periodo di crescita maggiore del mio patrimonio nello storico, e cosa lo ha guidato?',
    },
    {
      id: 'history-savings-vs-returns',
      label: 'Risparmio o rendimenti?',
      prompt: 'Nello storico, quanto della crescita del patrimonio è venuto dal risparmio e quanto dai rendimenti degli investimenti?',
    },
  ],
  quarter_analysis: [
    {
      id: 'quarter-compare-prev',
      label: 'Confronta col trimestre precedente',
      prompt: 'Confronta questo trimestre con il precedente: patrimonio, cashflow e allocazione.',
    },
  ],
  chat: [
    {
      id: 'chat-deepen',
      label: 'Approfondisci',
      prompt: 'Approfondisci l’ultimo punto della tua risposta con più dettaglio.',
    },
    {
      id: 'chat-actions',
      label: 'Cosa faresti al posto mio?',
      prompt: 'Sulla base di quanto abbiamo discusso, quali azioni concrete e prioritarie mi consigli?',
    },
  ],
};

/**
 * Returns the single most relevant data-derived follow-up for the given bundle,
 * or null when nothing notable stands out. Reads only fields the bundle always
 * carries, so it is safe across every period builder.
 *
 * Priority: a negative net cash flow is the most actionable signal, then the
 * asset class whose absolute value moved the most over the period.
 */
function deriveContextualFollowUp(
  bundle: AssistantMonthContextBundle | null
): AssistantFollowUp | null {
  if (!bundle) return null;

  // A period where money left the portfolio is worth explaining before anything else.
  if (bundle.dataQuality.hasCashflowData && bundle.cashflow.netCashFlow < 0) {
    return {
      id: 'ctx-negative-cashflow',
      label: 'Perché ho speso più di quanto ho incassato?',
      prompt: 'In questo periodo il flusso di cassa netto è stato negativo: spiegami nel dettaglio cosa lo ha causato.',
    };
  }

  // The asset class with the largest absolute swing is the natural "what moved?" question.
  const largestSwing = bundle.allocationChanges.reduce<
    AssistantMonthContextBundle['allocationChanges'][number] | null
  >((largest, change) => {
    if (change.absoluteChange === 0) return largest;
    if (!largest) return change;
    return Math.abs(change.absoluteChange) > Math.abs(largest.absoluteChange) ? change : largest;
  }, null);

  if (largestSwing) {
    return {
      id: `ctx-swing-${largestSwing.assetClass}`,
      label: `Perché ${largestSwing.assetClass} è cambiata?`,
      prompt: `Spiegami perché l’allocazione in ${largestSwing.assetClass} è cambiata in questo periodo e se dovrei intervenire.`,
    };
  }

  return null;
}

/**
 * Builds the follow-up chips for a completed answer in a given mode.
 *
 * The contextual (data-derived) suggestion is placed first when present, so the
 * most specific question leads; curated continuations fill the rest up to
 * MAX_FOLLOW_UPS. Results are de-duplicated by id.
 *
 * @param mode   - The mode of the thread the answer belongs to.
 * @param bundle - The period context bundle, when available (null in free chat).
 */
export function buildFollowUpSuggestions(
  mode: AssistantMode,
  bundle: AssistantMonthContextBundle | null
): AssistantFollowUp[] {
  const contextual = deriveContextualFollowUp(bundle);
  const curated = CURATED_FOLLOW_UPS[mode] ?? [];

  const ordered = contextual ? [contextual, ...curated] : curated;

  const seen = new Set<string>();
  const unique: AssistantFollowUp[] = [];
  for (const followUp of ordered) {
    if (seen.has(followUp.id)) continue;
    seen.add(followUp.id);
    unique.push(followUp);
    if (unique.length === MAX_FOLLOW_UPS) break;
  }

  return unique;
}
