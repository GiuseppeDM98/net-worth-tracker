/**
 * The class a broker import cannot deduce — and the human chooses, in the preview row.
 *
 * WHY. A broker's file names a fund («FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC») and prints no
 * code for it; when the market publishes no mix for it, the app cannot say which class the
 * position belongs to. Proposing «azionaria» and writing it is a claim the app cannot back, and
 * the user could only repair it later — row by row, on Patrimonio, without seeing which rows were
 * guesses. So the class is asked where the decision is made: the PREVIEW ROW.
 *
 * THE RULE, three lines:
 *  - a row whose class the market did not decide waits for a class FROM THE USER, picked in the
 *    preview row from the app's own classes;
 *  - a row that UPDATES a tracked asset takes the class already stored there — the import never
 *    overwrites it — so the second upload of the same file asks nothing;
 *  - an import that still carries a row without a class does NOT proceed.
 *
 * PURE and shared: the Azimut and the Intesa preview read the same decision from here, so the
 * rule cannot drift between the two bridges (doc/guide/collegamenti.md).
 */
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import type { AssetClass } from '@/types/assets';

/**
 * The classes the preview's dropdown offers: the app's OWN enumeration, in its own order and
 * with its own labels — never a list written beside the control (a hand-listed class drops the
 * newer ones silently, `ASSET_CLASS_SEQUENCE` exists for that).
 */
export const IMPORT_CLASS_OPTIONS: { value: AssetClass; label: string }[] = ASSET_CLASS_SEQUENCE.map(
  (assetClass) => ({ value: assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass })
);

/** What a preview row knows about its own class. */
export interface ImportClassDecision {
  /** The market did not decide the class: no published mix, no identity, only the name's guess. */
  uncertain: boolean;
  /** The class stored on the tracked asset this row updates — `undefined` for a new position. */
  storedClass?: AssetClass;
  /** The class the user picked in the preview row. */
  chosenClass?: AssetClass;
}

/**
 * TRUE while the row waits for the user: the market did not decide the class, and nobody stored
 * one either. A row that updates a tracked asset NEVER waits — the class is already there.
 */
export function needsClassChoice(decision: ImportClassDecision): boolean {
  return decision.uncertain && !decision.storedClass && !decision.chosenClass;
}

/**
 * The class a row is imported with: the user's choice first, then the class already stored on a
 * tracked asset, then the class the plan proposes (the measured one, or the name-based guess).
 */
export function resolveImportClass(decision: ImportClassDecision, proposed: AssetClass): AssetClass {
  return decision.chosenClass ?? decision.storedClass ?? proposed;
}

/** The row of a broker import's plan: what the shared rule needs to decide, and where the class goes. */
export interface ImportClassChoiceRow {
  /** The key the choice is filed under — the row's own identity in the plan (an id, an ISIN). */
  classChoiceKey: string;
  /** The class the plan would store if the user chose nothing. */
  formData: { assetClass: AssetClass };
  /** The row waits for a class from the user. */
  needsClassChoice: boolean;
}

/**
 * The rows as they are SAVED: the classes the user picked, on the rows that were waiting for one.
 * A row that was not waiting keeps its class — the plan's measured one, or the guess it declared.
 *
 * The choices are filed by the row's own key, so a row that needs one and a row that does not
 * cannot swap classes: a choice for a row that does not wait is ignored.
 */
export function applyClassChoices<Row extends ImportClassChoiceRow>(
  rows: Row[],
  choices: Record<string, AssetClass>
): Row[] {
  return rows.map((row) => {
    const chosen = choices[row.classChoiceKey];
    if (!chosen || !row.needsClassChoice) return row;
    return { ...row, formData: { ...row.formData, assetClass: chosen }, needsClassChoice: false };
  });
}
