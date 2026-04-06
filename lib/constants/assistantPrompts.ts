// Static catalog of suggested prompt chips for the assistant page.
// "Direct" chips (requiresMonthContext: true) submit immediately on click.
// "Exploratory" chips (requiresMonthContext: false) prefill the composer for user editing.
//
// WARNING: If you add a chip here, review AssistantPageClient.handleChipClick
// to ensure the direct-vs-prefill routing logic covers the new requiresMonthContext value.
import { AssistantPromptChip } from '@/types/assistant';

export const assistantPromptChips: AssistantPromptChip[] = [
  {
    id: 'month-analysis',
    label: 'Analizza questo mese',
    prompt: 'Analizza il mese selezionato e spiegami cosa ha mosso il patrimonio.',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'optional',
  },
  {
    id: 'net-worth-drivers',
    label: 'Cosa pesa di più sul patrimonio?',
    prompt: 'Quali fattori stanno pesando di più sul mio patrimonio in questo momento?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'none',
  },
  {
    id: 'spending-savings',
    label: 'Spese e risparmio',
    prompt: 'Guardando i miei dati recenti, come stanno andando spese, entrate e capacità di risparmio?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'none',
  },
  {
    id: 'returns-recent',
    label: 'Rendimenti recenti',
    prompt: 'Come stanno andando i miei rendimenti recenti e cosa significa per il portafoglio?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'none',
  },
  {
    id: 'macro-watch',
    label: 'Contesto geopolitico',
    // The apostrophe in "d'occhio" is a genuine Italian contraction, not a JS escape issue.
    prompt: "C'è qualcosa nel contesto geopolitico o macroeconomico che dovrei tenere d'occhio per il mio patrimonio?",
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'macro',
  },
];
