/**
 * The sentences BOTH the Consulente's route and the Accumulo tab show (2026-11-20). Import-free on
 * purpose: each route reads them without loading the other's narrative module — the Consulente's
 * «Applica» page never pulls `accumulationNarrative`, Accumulo never pulls `allocationAdviceNarrative`.
 */

/** The link to the Accumulo tab, everywhere it is offered (owner, 2026-11-19: ONE wording). */
export const ACCUMULO_OPEN_LINK = 'Apri Accumulo';

/** Where that link goes. */
export const ACCUMULO_HREF = '/dashboard/allocation?tab=accumulo';

/** The guided path that creates a plan by hand, continues the draft in Accumulo (2026-11-20), revises the active plan (2026-11-21). */
export const PLAN_PATH_HREF = '/dashboard/allocation/piano';
/** «Rivedi dal modello»: the revision with «Dal portafoglio modello» chosen. */
export const PLAN_PATH_FROM_MODEL_HREF = `${PLAN_PATH_HREF}?da=modello`;

/** An active plan whose every instalment is closed: nothing left for a revision to rewrite (owner, 2026-11-19). */
export const ACCUMULO_PLAN_NOTHING_TO_REVISE =
  'Il piano attivo ha già tutte le rate chiuse: chiudilo in Accumulo per crearne uno nuovo.';

/** The plan stands but the model portfolio was not written with its weights. */
export function describeModelNotUpdated(reason: string): string {
  return `Il portafoglio modello non è stato aggiornato: ${reason.replace(/[.\s]+$/, '')}. Aggiornalo da Accumulo.`;
}

/** The investment account is gone from the re-read assets: the click writes nothing of the plan. */
export const ADVICE_SOURCE_GONE = "Il conto per gli investimenti non c'è più: sceglilo di nuovo e premi «Crea il piano di accumulo».";
