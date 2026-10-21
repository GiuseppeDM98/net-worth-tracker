/**
 * weightOptimizerNarrative — every word the weight optimizer's PAC panel and report speak
 *. Pure: no Firebase, no DOM. A signed figure always carries
 * the typographic minus «−», never the ASCII hyphen (same rule as `accumulationNarrative.ts`).
 *
 * `describeObjectiveLabel` moved here from `weightOptimizer.ts` (O1 kept a local `labelForRow`
 * only so that module compiled and reported on its own before this one existed — see its header
 * comment) and fixes the factor label to match this file's own convention: "Momentum nell'azionario",
 * not "Momentum (Azioni)".
 */
import { isLoanAsset, type Asset, type AssetClass } from '@/types/assets';
import type { ConflictReport, ObjectiveReport, OptimizerMode, OptimizerWarning, SecondLevelGap } from './weightOptimizer';
import { ASSET_CLASS_LABELS, resolveAllocationRoleWithin } from './allocationUtils';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from './formatters';
import { formatSignedCurrency } from './accumulationNarrative';

const SECOND_LEVEL_GAP_NAME_LIMIT = 5;

// ---------------------------------------------------------------------------
// Objective labels
// ---------------------------------------------------------------------------

/** "Momentum nell'azionario", "X nell'obbligazionario" — never "Momentum (Azioni)". */
const CLASS_SCOPE_PHRASE: Partial<Record<AssetClass, string>> = {
  equity: "nell'azionario",
  bonds: "nell'obbligazionario",
};

function classScopePhrase(assetClass: AssetClass | undefined): string {
  if (!assetClass) return '';
  return CLASS_SCOPE_PHRASE[assetClass] ?? `nella classe ${ASSET_CLASS_LABELS[assetClass] ?? assetClass}`;
}

export function describeObjectiveLabel(
  kind: ObjectiveReport['kind'],
  assetClass?: AssetClass,
  subCategory?: string,
  groupLabel?: string
): string {
  switch (kind) {
    case 'class':
      return `Classe ${ASSET_CLASS_LABELS[assetClass as string] ?? assetClass}`;
    case 'leverage':
      return 'Leva';
    case 'factor':
      return `${subCategory} ${classScopePhrase(assetClass)}`;
    case 'group':
      return `Gruppo ${groupLabel}`;
  }
}

// ---------------------------------------------------------------------------
// Gap / target / achieved formatting — pp with one decimal, leverage with two and "×"
// ---------------------------------------------------------------------------

function isLeverageObjective(objective: Pick<ObjectiveReport, 'kind'>): boolean {
  return objective.kind === 'leverage';
}

export function formatObjectiveTarget(objective: ObjectiveReport): string {
  return isLeverageObjective(objective) ? `${formatNumberIt(objective.targetValue, 2)}×` : formatPercentageIt(objective.targetValue, 1);
}

export function formatObjectiveAchieved(objective: ObjectiveReport): string {
  return isLeverageObjective(objective) ? `${formatNumberIt(objective.achievedValue, 2)}×` : formatPercentageIt(objective.achievedValue, 1);
}

/** «+0,4 pp» / «−0,4 pp» / «+0,04×» / «−0,04×» — typographic minus, never the ASCII hyphen. */
export function formatObjectiveGap(objective: ObjectiveReport): string {
  const leverage = isLeverageObjective(objective);
  const value = leverage ? objective.gapPp / 100 : objective.gapPp;
  const amount = formatNumberIt(Math.abs(value), leverage ? 2 : 1);
  const suffix = leverage ? '×' : ' pp';
  if (value < -1e-9) return `−${amount}${suffix}`;
  if (value > 1e-9) return `+${amount}${suffix}`;
  return `${amount}${suffix}`;
}

/** «Azioni 102,0% → 101,6% (−0,4 pp)» — one line of the optimizer's report (§9.2 point 6). */
export function describeObjectiveRow(objective: ObjectiveReport): string {
  return `${objective.label} ${formatObjectiveTarget(objective)} → ${formatObjectiveAchieved(objective)} (${formatObjectiveGap(objective)})`;
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/** «Senza il criterio «Leva»: Stati Uniti nell'azionario da 66,1% a 62,0%.» — `fromGapPp`/`toGapPp`
 *  are gaps, not raw values, so the sentence rebuilds the achieved figure from each objective's
 *  own `targetValue` (looked up by id in the same `objectives` list the report carries). */
export function describeConflict(conflict: ConflictReport, objectives: ObjectiveReport[]): string {
  const removed = objectives.find((o) => o.id === conflict.removedObjectiveId);
  const removedLabel = removed?.label ?? conflict.removedObjectiveId;

  const parts = conflict.improvements
    .map((improvement) => {
      const objective = objectives.find((o) => o.id === improvement.objectiveId);
      if (!objective) return null;
      const leverage = isLeverageObjective(objective);
      const fromValue = objective.targetValue + improvement.fromGapPp;
      const toValue = objective.targetValue + improvement.toGapPp;
      const fromText = leverage ? `${formatNumberIt(fromValue, 2)}×` : formatPercentageIt(fromValue, 1);
      const toText = leverage ? `${formatNumberIt(toValue, 2)}×` : formatPercentageIt(toValue, 1);
      return `${objective.label} da ${fromText} a ${toText}`;
    })
    .filter((text): text is string => text !== null);

  return `Senza il criterio «${removedLabel}»: ${parts.join('; ')}.`;
}

/** The tile's reading of a conflict, as in the render: «Leva e Stati Uniti nell'azionario tirano in
 *  direzioni opposte: senza «Leva», Stati Uniti nell'azionario passerebbe da 66,1% a 62,0%.» */
export function describeConflictReading(conflict: ConflictReport, objectives: ObjectiveReport[]): string {
  const removed = objectives.find((o) => o.id === conflict.removedObjectiveId);
  const removedLabel = removed?.label ?? conflict.removedObjectiveId;
  const labels = conflict.improvements
    .map((improvement) => objectives.find((o) => o.id === improvement.objectiveId)?.label)
    .filter((label): label is string => !!label);
  const detail = describeConflict(conflict, objectives).replace(/^Senza il criterio «[^»]*»: /, '').replace(/ da /g, ' passerebbe da ');
  const pull = labels.length === 0 ? removedLabel : `${removedLabel} e ${labels.join(', ')}`;
  return `${pull} tirano in direzioni opposte: senza «${removedLabel}», ${detail}`;
}

// ---------------------------------------------------------------------------
// Warnings — one text per OptimizerWarning.code
// ---------------------------------------------------------------------------

/** `labelOf` resolves a candidate/position key to its display label — the report only carries the
 *  key, the panel is the one that knows the positions. */
export function describeOptimizerWarning(warning: OptimizerWarning, labelOf: (key: string) => string): string {
  switch (warning.code) {
    case 'factor_unmapped':
      return `«${warning.subCategory}» (${ASSET_CLASS_LABELS[warning.assetClass] ?? warning.assetClass}) non ha un peso tra i sotto-criteri: pesa zero nel calcolo.`;
    case 'proxy_mismatch':
      return `«${labelOf(warning.key)}»: i membri del gruppo hanno un'esposizione diversa dallo strumento che compra; il calcolo usa solo quella dello strumento che compra.`;
    case 'bound_conflict':
      return `«${labelOf(warning.key)}»: i limiti impostati si escludono a vicenda, il massimo è stato allineato al minimo.`;
    case 'not_converged':
      return "Il calcolo non ha raggiunto la convergenza entro le iterazioni disponibili: il risultato resta un'approssimazione.";
  }
}

// ---------------------------------------------------------------------------
// Second-level gaps (G5) — preventive warning, IdealAllocationTile and OptimizerPanel
// ---------------------------------------------------------------------------

/** «VWCE, IWDA, EIMI e altri 2» — unique names in order of first appearance, capped at 5. */
function joinTruncatedNames(names: string[]): string {
  const unique = Array.from(new Set(names));
  if (unique.length <= SECOND_LEVEL_GAP_NAME_LIMIT) return unique.join(', ');
  const shown = unique.slice(0, SECOND_LEVEL_GAP_NAME_LIMIT);
  const rest = unique.length - SECOND_LEVEL_GAP_NAME_LIMIT;
  return `${shown.join(', ')} e altri ${rest}`;
}

/** One sentence per (class, reason) group — «3 strumenti nella classe Azioni senza sottocategoria:
 *  VWCE, IWDA, EIMI.» / «…con una sottocategoria non configurata: …» — never blocks the calculation. */
export function describeSecondLevelGaps(gaps: SecondLevelGap[]): string[] {
  const groups = new Map<string, { assetClass: AssetClass; reason: 'missing' | 'unknown'; names: string[] }>();
  for (const gap of gaps) {
    const key = `${gap.assetClass}:${gap.reason}`;
    const group = groups.get(key) ?? { assetClass: gap.assetClass, reason: gap.reason, names: [] };
    group.names.push(gap.assetName);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const uniqueCount = new Set(group.names).size;
    const classLabel = ASSET_CLASS_LABELS[group.assetClass] ?? group.assetClass;
    const subject = uniqueCount === 1 ? '1 strumento' : `${uniqueCount} strumenti`;
    const clause = group.reason === 'missing' ? 'senza sottocategoria' : 'con una sottocategoria non configurata';
    return `${subject} nella classe ${classLabel} ${clause}: ${joinTruncatedNames(group.names)}.`;
  });
}

/** §3.5 — shown wherever a class carries an enabled `specificAssets` target: instrument-level
 *  targets are never a soft objective, they are what the optimizer computes. */
export const OPTIMIZER_SPECIFIC_ASSETS_NOTE =
  `I target sui singoli strumenti non entrano nel calcolo: sono ciò che l'ottimizzatore propone.`;

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export const OPTIMIZER_MODE_LABELS: Record<OptimizerMode, string> = {
  reachable: 'Raggiungibile col PAC',
  ideal: 'Ideale',
};

/** The one-line difference shown under the mode toggle (§9.2 point 3). */
export function describeOptimizerMode(mode: OptimizerMode): string {
  switch (mode) {
    case 'reachable':
      return 'Raggiungibile non scende sotto ciò che possiedi, perché il PAC non vende.';
    case 'ideal':
      return 'Ideale ignora quanto possiedi oggi: propone i pesi più vicini ai criteri del modello, anche sotto il posseduto.';
  }
}

/** §9.2 point 7 — shown before applying Ideale weights that would sell nothing but ask for it. */
export const OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM =
  'In modalità Ideale alcuni pesi sono sotto ciò che possiedi: il PAC non vende, quindi quelle posizioni riceveranno zero acquisti.';

/** §9.2 point 1 — the panel's whole content when `idealAllocation` is off or unset. */
export const OPTIMIZER_DISABLED_READING = 'Nessuna allocazione ideale impostata: definiscila in Allocazione › Accumulo.';

// ---------------------------------------------------------------------------
// Panel copy — no PAC component carries an Italian literal of its own (accumulationNarrative.ts's rule)
// ---------------------------------------------------------------------------

export const OPTIMIZER_STEP2_MANUAL = 'Manuale';
export const OPTIMIZER_STEP2_OPTIMIZED = 'Ottimizzato';
/** The objectives live in Allocazione › Accumulo since A1; the query opens their modal. */
export const OPTIMIZER_OBJECTIVES_HREF = '/dashboard/allocation?tab=accumulo&obiettivi=1';
export const OPTIMIZER_ACTION_MODIFY_IN_SETTINGS = 'Modifica i criteri';
export const OPTIMIZER_ACTION_CALCULATE = 'Calcola';
export const OPTIMIZER_ACTION_APPLY = 'Usa questi pesi';
export const OPTIMIZER_COL_INSTRUMENT = 'Strumento';
export const OPTIMIZER_COL_CURRENT = 'Peso oggi';
export const OPTIMIZER_COL_PROPOSED = 'Proposto';
export const OPTIMIZER_OBJECTIVES_TITLE = 'Criteri attivi';
export const OPTIMIZER_REPORT_TITLE = 'Rapporto';
export const OPTIMIZER_CONFLICTS_TITLE = 'Conflitti';
export const OPTIMIZER_WARNINGS_TITLE = 'Avvisi';
export const OPTIMIZER_STATUS_NO_CANDIDATES = 'Nessuno strumento nel piano su cui proporre pesi.';
export const OPTIMIZER_STATUS_INFEASIBLE_BOUNDS = 'I limiti minimi impostati superano da soli il 100%: nessun peso proponibile.';
export const OPTIMIZER_STEP2_ARIA_LABEL = 'Come compilare i pesi target';
export const OPTIMIZER_MODE_ARIA_LABEL = 'Modalità di calcolo dei pesi';

// ---------------------------------------------------------------------------
// The step-3 snapshot provenance row (§9.4)
// ---------------------------------------------------------------------------

export interface OptimizerSnapshotSummary {
  computedAt: Date;
  mode: OptimizerMode;
  weights: Array<{ key: string; proposedPct: number }>;
}

/** «Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile), poi modificati a mano.» — only the
 *  clause that changes, never re-run the optimizer to know it: compares the snapshot's proposed
 *  weights against the draft's CURRENT ones by position key. */
export function describeOptimizerSnapshot(
  snapshot: OptimizerSnapshotSummary,
  currentPositions: Array<{ id: string; targetPercentage: number }>
): string {
  const day = String(snapshot.computedAt.getDate()).padStart(2, '0');
  const month = String(snapshot.computedAt.getMonth() + 1).padStart(2, '0');
  const modeLabel = OPTIMIZER_MODE_LABELS[snapshot.mode];
  const currentByKey = new Map(currentPositions.map((p) => [p.id, p.targetPercentage]));
  const edited = snapshot.weights.some((w) => {
    const current = currentByKey.get(w.key);
    return current !== undefined && Math.abs(current - w.proposedPct) > 0.01;
  });
  const base = `Pesi proposti dall'ottimizzatore il ${day}/${month} (${modeLabel})`;
  return edited ? `${base}, poi modificati a mano.` : `${base}.`;
}

// ---------------------------------------------------------------------------
// §4 — the standalone tool, Allocazione's `ComposizioneIdealeTile` + `IdealCompositionDialog`
// ---------------------------------------------------------------------------

export const IDEAL_COMPOSITION_TILE_EYEBROW = 'Composizione ideale';
export const IDEAL_COMPOSITION_TILE_OFF_READING =
  "Imposta i criteri del modello per vedere com'è fatto il tuo portafoglio ideale, strumento per strumento.";
export const IDEAL_COMPOSITION_TITLE = 'Ricalcola il portafoglio modello';
export const IDEAL_COMPOSITION_AMOUNT_LABEL = 'Importo da investire (€)';
export const IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON =
  'Inserisci un importo da investire per vedere cosa è raggiungibile senza vendere.';
export const IDEAL_COMPOSITION_COL_INSTRUMENT = 'Strumento';
export const IDEAL_COMPOSITION_COL_CURRENT = 'Peso attuale';
export const IDEAL_COMPOSITION_COL_IDEAL = 'Peso ideale';
export const IDEAL_COMPOSITION_COL_DIFF = 'Differenza';
export const IDEAL_COMPOSITION_ACTION_CREATE_PAC = 'Crea un PAC con questi pesi';
export const IDEAL_COMPOSITION_PLAN_ALREADY_OPEN =
  'Hai già un piano aperto: modificalo dal tile Accumulo.';

/** «+1.240,00 €» — the weight's € distance at B, mono (The Comma Rule: never `toFixed`). */
export function formatOptimizerWeightDiffEur(currentPct: number, proposedPct: number, baseEur: number): string {
  return formatSignedCurrency(((proposedPct - currentPct) / 100) * baseEur);
}

// ---------------------------------------------------------------------------
// Criteri del modello (the allocation's objectives, AL19), in Allocazione › Accumulo
// ---------------------------------------------------------------------------

export const OBJECTIVES_TILE_EYEBROW = 'Criteri del modello';
export const OBJECTIVES_TILE_ASIDE = 'target · raggiunto dal modello';
export const OBJECTIVES_TILE_PLAN_ASIDE = 'target · raggiunto dal piano';
export const OBJECTIVES_TILE_PLAN_NOTE = 'A fine piano, ai prezzi di oggi: le barre sono quanto raggiunge il PAC aperto.';
export const OBJECTIVES_DIALOG_TITLE = 'Criteri del modello';
export const OBJECTIVES_ACTION_EDIT = 'Modifica i criteri';
export const OBJECTIVES_ACTION_TRY = 'Prova';
export const OBJECTIVES_ACTION_SAVE = 'Salva i criteri';
export const OBJECTIVES_ACTION_CANCEL = 'Annulla';
export const OBJECTIVES_DIALOG_READING = 'Cambia i criteri e premi «Prova»: il calcolo gira sulla bozza e non salva nulla. «Salva i criteri» li rende quelli dell’account.';
export const OBJECTIVES_OFF_READING = 'I criteri sono spenti: la composizione ideale e il passo Target del PAC restano manuali finché non li accendi.';
export const OBJECTIVES_SAVED_TOAST = 'Criteri salvati';
export const OBJECTIVES_TRY_EMPTY = 'Nessuno strumento acquistabile su cui provare i criteri.';
export const OBJECTIVES_CLASS_TARGETS_EYEBROW = 'Target di classe';
export const OBJECTIVES_CLASS_TARGETS_READING = 'Il criterio «Classi» porta i pesi verso questi target. Si scrivono in un posto solo: Impostazioni › Allocazione.';
export const OBJECTIVES_CLASS_TARGETS_EMPTY = 'Nessun target di classe: il criterio «Classi» non ha nulla da inseguire finché non ne scrivi uno.';
export const OBJECTIVES_CLASS_TARGETS_LINK = 'Modifica in Impostazioni';
export const OBJECTIVES_CLASS_TARGETS_HREF = '/dashboard/settings?tab=allocazione';
export const OBJECTIVES_LINK_FROM_SETTINGS = 'Modifica in Allocazione › Accumulo';
export const OBJECTIVES_SETTINGS_EYEBROW = 'Criteri del modello';

// ---------------------------------------------------------------------------
// The model portfolio — `PortafoglioModelloTile` and its dialogs
// ---------------------------------------------------------------------------

export const MODEL_TILE_EYEBROW = 'Portafoglio modello';
export const MODEL_TILE_EMPTY_READING =
  'Nessun portafoglio modello: calcola i pesi con l’ottimizzatore o scrivili a mano, e un piano parte da lì.';
export const MODEL_TILE_READ_FAILURE_READING =
  'Non riesco a leggere il portafoglio modello. Se è la prima volta, la regola Firestore della nuova collezione potrebbe non essere ancora pubblicata.';
export const MODEL_ACTION_RECALCULATE = 'Ricalcola';
export const MODEL_ACTION_EDIT = 'Modifica a mano';
export const MODEL_ACTION_ADD_CANDIDATE = 'Aggiungi strumento da valutare';
export const MODEL_ADD_CANDIDATE_NEEDS_MODEL = 'Salva prima un portafoglio modello: lo strumento da valutare ci entra a peso 0.';
export const MODEL_RECALCULATE_NEEDS_OBJECTIVES = 'Accendi i criteri per far calcolare i pesi all’ottimizzatore.';
export const MODEL_COL_INSTRUMENT = 'Strumento';
export const MODEL_COL_TODAY = 'Oggi';
export const MODEL_COL_MODEL = 'Modello';
export const MODEL_COL_DIFF = 'Differenza';
export const MODEL_CANDIDATE_TAG = 'da valutare';
export const MODEL_OUTSIDE_LABEL = 'Fuori dal modello';
/** AL16: a group's other members, under the buyer in the tile and in «Modifica a mano». */
export const MODEL_GROUP_NO_BUY = 'non riceve acquisti';
export function describeModelGroupMembers(otherLabels: string[]): string {
  return `Gruppo con ${otherLabels.join(', ')}: compra solo il primo.`;
}

function formatModelDay(updatedAt: Date): string {
  return `${String(updatedAt.getDate()).padStart(2, '0')}/${String(updatedAt.getMonth() + 1).padStart(2, '0')}/${updatedAt.getFullYear()}`;
}

/**
 * «Calcolato dall'ottimizzatore il 07/10/2026» / «Scritto a mano il 07/10/2026». With the snapshot of
 * the calculation the model started from, the mode is named too (render, view 1): «Proposto
 * dall'ottimizzatore il 02/10/2026 (Raggiungibile)», then «, poi cambiato a mano» when the origin is manual.
 */
export function describeModelOrigin(origin: 'manual' | 'optimizer', updatedAt: Date, snapshot?: { computedAt: Date; mode: OptimizerMode }): string {
  if (!snapshot) {
    const day = formatModelDay(updatedAt);
    return origin === 'optimizer' ? `Calcolato dall'ottimizzatore il ${day}.` : `Scritto a mano il ${day}.`;
  }
  const proposed = `Proposto dall'ottimizzatore il ${formatModelDay(snapshot.computedAt)} (${OPTIMIZER_MODE_LABELS[snapshot.mode]})`;
  return origin === 'optimizer' ? `${proposed}.` : `${proposed}, poi cambiato a mano.`;
}

/** R11-S2 (D-R11-2): the two bases differ only when a debt sits inside the allocation. */
export const MODEL_DEBT_BASE_NOTE = 'I pesi di oggi non contano i debiti: Bilanciamento li sottrae alla classe che finanziano.';

/**
 * The line under the model's table, only when it is true: a loan with a debt that Bilanciamento nets (a personal loan, or a
 * mortgage on a property INSIDE the allocation). A mortgage on an excluded home changes no figure on either side, so it says nothing.
 */
export function describeModelDebtNote(assets: readonly Asset[], valueOf: (asset: Asset) => number): string | null {
  const nets = assets.some((asset) => isLoanAsset(asset) && valueOf(asset) < 0 && resolveAllocationRoleWithin(asset, assets) !== 'excluded');
  return nets ? MODEL_DEBT_BASE_NOTE : null;
}

/** The tile's aside: «pesi di mercato · base 182.000 €». */
export function describeModelTileAside(baseEur: number): string {
  return `pesi di mercato · base ${cachedFormatCurrencyEUR(baseEur, true)}`;
}

/** The tile's foot: who stays above the model, since the PAC never sells. Null when nobody does. */
export function describeModelSalesHint(overweightLabels: string[]): string | null {
  if (overweightLabels.length === 0) return null;
  const names = overweightLabels.length === 1 ? overweightLabels[0] : `${overweightLabels.slice(0, -1).join(', ')} e ${overweightLabels[overweightLabels.length - 1]}`;
  const verb = overweightLabels.length === 1 ? 'resta sopra' : 'restano sopra';
  return `Senza vendere, ${names} ${verb} il modello.`;
}

export const MODEL_SAVE_ACTION = 'Salva come portafoglio modello';
export const MODEL_SAVED_TOAST = 'Portafoglio modello salvato';
/** AL14: with an active plan and no model, the tile offers the plan's weights as the model. */
export const MODEL_ACTION_USE_PLAN = 'Usa i pesi del piano';
export const MODEL_SAVE_REPLACES_NOTE = 'Sostituisce il portafoglio modello attuale.';

export const MODEL_EDIT_TITLE = 'Modifica il portafoglio modello';
export const MODEL_EDIT_READING =
  'Scrivi i pesi di mercato di ogni strumento: devono sommare 100%. Uno strumento da valutare entra a peso 0 e lo togli da qui.';
export const MODEL_EDIT_ACTION_NORMALIZE = 'Riporta a 100%';
export const MODEL_EDIT_ACTION_SAVE = 'Salva';
export const MODEL_EDIT_ACTION_CANCEL = 'Annulla';
export const MODEL_EDIT_ACTION_REMOVE = 'Togli';
export const MODEL_EDIT_SUM_LABEL = 'Somma';

/** The conflict sentence the Criteri del modello tile shows under the bars (first conflict of the saved snapshot). */
export const OBJECTIVES_TILE_CALCULATED_ON = 'Calcolati sull’ultimo portafoglio modello salvato.';
