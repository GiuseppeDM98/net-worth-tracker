/**
 * The Consulente's INTERVIEW in a browser, shared by its specs (desktop, mobile, report;
 * 2026-11-08, doc/guide/e2e-emulatori.md § Browser-Driven E2E). A helper, not a spec: no project collects it.
 *
 * The run route is ALWAYS faked here (`page.route`): three invented rounds answered in order,
 * the strategy failing on a decoy sentence so no run goes past its first stage, and a recorder of
 * every body the page sent — what the specs assert on (which rounds and answers reached the
 * strategy, whether the skip carried the round as it stood). A round may be delayed, to see the
 * skeleton; a fulfil on a request «Salta il colloquio» aborted is swallowed.
 */

import type { Page } from '@playwright/test';

export const sse = (events: object[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
export const stream = (events: object[]) => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(events) });

/** Round 1: one single and one multiple question, both with «Altro…». Invented figures. */
export const ROUND_1 = {
  note: "Vedo un reddito concentrato: l'86% delle entrate arriva da una fonte sola.",
  satisfied: false,
  questions: [
    {
      id: 'reddito',
      kind: 'single',
      text: 'Quanto dipendi da quella fonte?',
      why: "l'86% delle entrate degli ultimi 12 mesi",
      options: [
        { value: 'tutto', label: 'Interamente' },
        { value: 'meta', label: 'Circa metà' },
      ],
      allowOther: true,
    },
    {
      id: 'riserva',
      kind: 'multiple',
      text: 'Cosa conta come riserva di emergenza?',
      why: '2 mesi di spesa sui conti liquidi',
      options: [
        { value: 'conti', label: 'I conti correnti' },
        { value: 'btp', label: 'I BTP a breve' },
      ],
      allowOther: true,
    },
  ],
  model: 'opus-finto',
};

/** Round 2: two single questions. */
export const ROUND_2 = {
  note: 'Resta da capire la casa e il prestito.',
  satisfied: false,
  questions: [
    {
      id: 'casa',
      kind: 'single',
      text: 'La casa resta fuori dal piano anche fra vent\'anni?',
      why: 'il 40% del patrimonio',
      options: [
        { value: 'fuori', label: 'Sì, resta fuori' },
        { value: 'dentro', label: 'No, potrei venderla' },
      ],
      allowOther: true,
    },
    {
      id: 'prestito',
      kind: 'single',
      text: 'La rata del prestito finisce prima dell\'orizzonte?',
      why: 'una rata di 320 € al mese',
      options: [
        { value: 'si', label: 'Sì' },
        { value: 'no', label: 'No' },
      ],
      allowOther: true,
    },
  ],
  model: 'opus-finto',
};

/** Round 3: unsatisfied, one question — the cap stops here. */
export const ROUND_3 = {
  note: 'Un\'ultima cosa sulla previdenza.',
  satisfied: false,
  questions: [
    {
      id: 'previdenza',
      kind: 'single',
      text: 'Il fondo pensione resta congelato?',
      why: '110 € al mese di versamenti',
      options: [
        { value: 'si', label: 'Sì, congelato' },
        { value: 'no', label: 'No, lo conto' },
      ],
      allowOther: true,
    },
  ],
  model: 'opus-finto',
};

export const FAKE_ROUNDS = [ROUND_1, ROUND_2, ROUND_3];

/** The ONE round about a revision request. */
export const REVISION_ROUND = {
  note: 'Prima di togliere le cripto, una domanda.',
  satisfied: true,
  questions: [
    {
      id: 'cedere',
      kind: 'single',
      text: 'Cosa accetti di cedere per avere meno cripto?',
      why: 'il 5% del portafoglio',
      options: [
        { value: 'rendimento', label: 'Un po\' di rendimento atteso' },
        { value: 'niente', label: 'Niente: solo spostare' },
      ],
      allowOther: true,
    },
  ],
  model: 'opus-finto',
};

export const FAKE_RUN_ERROR = 'Ricerca finta interrotta: ornitorinco.';

export interface InterviewBody {
  stage: 'interview';
  answers: unknown;
  interview: { rounds: { answers: { questionId: string; value: unknown }[] }[]; skipped: boolean };
  revision?: { requests: string };
}
export interface StrategyBody {
  stage: 'strategy';
  answers: unknown;
  interview: { rounds: { answers: { questionId: string; value: unknown }[] }[]; skipped: boolean } | null;
}
export interface ReviseBody {
  stage: 'revise';
  request: string;
  interview: { rounds: unknown[]; skipped: boolean } | null;
}

export interface FakeRunRecorder {
  interview: InterviewBody[];
  strategy: StrategyBody[];
  revise: ReviseBody[];
}

/**
 * Fakes the run route. An `interview` request answers the round after the ones the body holds
 * (`FAKE_ROUNDS`), or `REVISION_ROUND` when the body carries a revision; `delayRoundMs(n)` holds
 * round n before answering. A `strategy` request fails on the decoy; a `revise` request completes.
 */
export async function installFakeRun(page: Page, options: { delayRoundMs?: (round: number) => number } = {}): Promise<FakeRunRecorder> {
  const recorder: FakeRunRecorder = { interview: [], strategy: [], revise: [] };
  await page.route('**/api/allocation-advice/run', async (route) => {
    const body = route.request().postDataJSON() as InterviewBody | StrategyBody | ReviseBody;
    if (body.stage === 'interview') {
      recorder.interview.push(body);
      const n = body.interview.rounds.length + 1;
      const delay = options.delayRoundMs?.(n) ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const round = body.revision ? REVISION_ROUND : FAKE_ROUNDS[n - 1];
      try {
        await route.fulfill(stream([{ type: 'interview', round: { ...round, askedAt: new Date().toISOString() } }]));
      } catch {
        // «Salta il colloquio» aborted the request: nothing to answer.
      }
      return;
    }
    if (body.stage === 'strategy') {
      recorder.strategy.push(body);
      await route.fulfill(stream([{ type: 'stage', stage: 'context' }, { type: 'error', error: FAKE_RUN_ERROR, retryable: true }]));
      return;
    }
    if (body.stage === 'revise') {
      recorder.revise.push(body);
      await route.fulfill(stream([{ type: 'stage', stage: 'review' }, { type: 'done' }]));
      return;
    }
    await route.fulfill(stream([{ type: 'done' }]));
  });
  return recorder;
}

/** The scene's card: the one region named by the interview's eyebrow. */
export const interviewScene = (page: Page, round: number) => page.getByRole('region', { name: `Colloquio · tornata ${round} di 3` });
export const questionCard = (page: Page, id: string) => page.locator(`[data-question-card="${id}"]`);
