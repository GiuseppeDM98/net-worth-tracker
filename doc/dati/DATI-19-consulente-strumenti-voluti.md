# DATI-19 — The Consulente reads the instruments the user chose: specific assets kept, a «Ticker o ISIN» on every leaf

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-16 (`LEDGER_TYPE_CLASS`); implemented after
> DATI-08 and DATI-09, which edit the same file of the Assistente's prompts (`lib/server/assistant/prompts.ts`),
> and after DATI-15, which edits `buildConsulenteContext`. DATI-20 reads its hand-off. Written on 2026-11-23; every
> `file:line` is cited @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's point 13;
> decisions 34–38 and 89–92.

## 1. The problem today (evidence on the code)

The allocation targets have three levels — class, sub-category, specific assets (`SpecificAssetAllocation`,
`SubCategoryTarget`, `types/assets.ts:340-349`; a sub-target is a number or the object, `:371-378`). The third
level is read by the Allocazione page (`lib/services/assetAllocationService.ts:1051-1075`, matched by a name
contained in the asset's name or ticker, `:757-778`) and by the optimizer's note
(`lib/utils/weightOptimizer.ts:299-307`). The Consulente and the Assistente do not know it exists:

- **The context prints two levels.** `buildTargetRows` reads a sub-target's percentage alone
  (`lib/utils/assistantPortfolioContext.ts:484-489`) and the block prints class and sub-category
  (`lib/server/assistant/prompts.ts:364-378`).
- **«Applica» erases the third level.** `buildTargetsFromProposal` writes every sub-target as a number
  (`lib/utils/allocationAdviceApply.ts:71-85`) and the click replaces the targets document with it
  (`components/allocation/consulente/ConsulenteReport.tsx:270`): the switch «Traccia asset specifici» and the
  weights under it are gone, and no line of the page says so.
- **The plan creates one instrument per sub-target.** The hand-off reads the proposal's `instrument` or the
  sleeve's candidates (`lib/utils/allocationAdviceHandoff.ts:56-101`), splitting only on « + » and «;»
  (`:64-67`): the specific assets the user does not hold are never created at 0 quotes, so Accumulo has no row to
  «Registra» for them.
- **A new instrument is an ETF.** The type is `crypto`, `bond` (an IT/XS ISIN with no ticker) or `etf`
  (`allocationAdviceHandoff.ts:93-94`), and the instruments' agent searches «ETF/ETC UCITS, o titoli di Stato»
  (`lib/server/allocationAdvice/prompts.ts:445`): a single share would be created as an ETF.
- **The wanted instrument has no home.** A user writes an ISIN in the sub-category's name; the hand-off reads an
  ISIN only in the proposal's `instrument` (`splitNamed`, `allocationAdviceHandoff.ts:37-46`, called at `:73`), and
  nothing fixes the listing — the same ISIN trades in euro in Milan and in dollars in New York.
- What already works and is kept: the strategy is told to keep the sub-categories' names
  (`allocationAdvice/prompts.ts:170`); a held instrument wins a match (`findAssetByName`,
  `allocationAdviceApply.ts:35-`); a new instrument is created in its quote's currency with its euro price
  (`newInstrumentFormData`, `lib/utils/advicePlan.ts:110-137`); the quote route already converts
  (`app/api/prices/quote/route.ts:50-72`).

## 2. Goal and acceptance criteria

1. Every LEAF of the targets has an optional «Ticker o ISIN»: a class without sub-categories, a sub-category
   without specific assets, each specific asset. The field moves with the leaf: opening a level hides it on the
   parent and it is not saved there. Proof: S1, S2, D1, E1, E3.
2. The Assistente's context prints the third level and the codes; the Consulente's four prompts (strategy,
   instruments, review, revision) carry ONE block of what the user pinned. Proof: C1, U8, P2.
3. «Applica» keeps the specific assets and the codes of every sub-category (and class) the proposal keeps, by
   name, and says before the click what leaves with a sub-category the proposal drops. Proof: T1, T2, D2, E2.
4. The plan names every specific asset and every coded leaf: a held one is matched (ISIN, then ticker, then the
   Allocazione page's name rule); one not held with a code is created at 0 quotes by «Applica» and bought; one not
   held without a code is out of the plan, and the plan says so in one sentence. Proof: H1–H5, F1, R1.
5. A ticker fixes listing and currency: the instrument is created with that symbol — never a candidate's — in
   the quote's currency, and takes the quote's name when the user gave none. An ISIN alone leaves the listing to
   the exchange of the interview. Proof: H2, A1, A2.
6. A new instrument's type follows its quote: a share is a `stock`, a fund an `etf` — never a type whose class
   is not the leaf's. Proof: A1, Y1, Y2, U7.
7. The strategy does not rename, replace or re-weigh what the user chose; the instruments' agent verifies only the
   chosen instruments that have an ISIN alone and proposes no other candidate for that level; the review and
   «Chiedi una modifica» cannot rename or remove a level the user pinned — the contract says it and the code
   restores it. Proof: P1, P2, T3, T4.
8. The specific assets split their sub-category's share of the plan by the weights the user gave: the reconcile
   imposes it. Proof: F1, R2, R3.
9. Allocazione matches a specific asset by its code too. Proof: M1.
10. An instrument the plan created is found again by ISIN, then ticker, then name: renaming it in Patrimonio does
    not break the link. Proof: A2.
11. A code on the targets does not make the Portafoglio modello «superato». Proof: S3.
12. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1–E3
    green; `npm run perf:budget` green with `/dashboard/settings` and `/dashboard/allocation` inside their
    ceilings, raised by no more than 1 KB gz and only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 34** (owner, 2026-11-23): the Consulente is fixed in this series, the four improvements in one spec.
- **Decision 35** (owner): the Consulente READS the specific assets and leaves them as they are — it decides
  classes and sub-categories only; «Applica» keeps them where the sub-category stays and says what it removes.
- **Decision 36** (owner, after asking for the field on the upper levels too): the optional «Ticker o ISIN» sits
  on the lowest open level — class, sub-category or specific asset.
- **Decision 37** (owner): a specific asset with a ticker or an ISIN that is not held is created at 0 quotes and
  bought by the plan, by the weight it has in its sub-category.
- **Decision 38** (owner): one without ticker and ISIN that is not held stays out of the plan, said in one line.
- **Decision 89** (owner, 2026-11-23): the review and «Chiedi una modifica» get the same constraints as the
  strategy — in `REVIEW_CONTRACT`, with the pins in their message — AND a guard in the code: after either, a
  pinned sub-target that was renamed goes back to its name, one that was removed is put back.
- **Decision 90** (owner, 2026-11-23): the weights of the specific assets are IMPOSED by the code: the reconcile
  re-proportions the buy rows of one sub-category's specific assets to the wanted weights, their sum unchanged.
- **Decision 91** (owner, 2026-11-23): an instrument created from a ticker with no name of the user's takes the
  quote's name at the click, else the ticker.
- **Decision 92** (owner, 2026-11-23): `findAdviceInstrument` recognises by ISIN, then ticker, then name.
- Adopted, reversible:
  - (a) one field, one string: twelve characters that read as an ISIN are an ISIN, anything else is a Yahoo
    ticker; upper-cased, at most 20 characters of `A-Z 0-9 . - = ^`.
  - (b) a ticker fixes listing and currency (a Nasdaq symbol is in dollars, «.MI» in euro); the owner asked how
    a purchase in dollars reaches the Consulente: through the ticker.
  - (c) an ISIN written in a sub-category's name («Nome (IE…)») is read as that leaf's code while the field is
    empty — in the USER's stored targets only, never in a name a proposal wrote; «Applica» writes it in the field.
  - (d) the kept levels are found by name, case- and space-insensitively; a sub-category the STRATEGY renames is
    a dropped one, said before the click.
  - (e) the guard of decision 89 puts back the whole list of sub-targets of the class as the reference had it
    (the strategy's for the review, the previous report's for a revision): the only repair that keeps the class
    at 100. A reviewed proposal that lost the whole class is refused, as one that breaks a sum is today.
  - (f) the new instrument's type comes from Yahoo's `quoteType` at the click, when that type is a fund or its
    class in `LEDGER_TYPE_CLASS` (DATI-16's table, the one the Registra card reads) is the leaf's; else: a
    specific asset is one security (`stock` in Azioni, `bond` in Obbligazioni), a coded class or sub-category is
    a fund (`etf`, but `bond` for an IT/XS ISIN with no ticker), `crypto` in Cripto.
  - (g) no field on `cash` and `realestate` (the plan never searches them).
  - (h) the web-search ceiling of the instruments' stage stays 20: the chosen instruments with an ISIN alone are
    verified first.
  - (i) the Consulente's prompts read the pins from the targets document, not from the context's rows: an
    account with nothing invested yet, or a class at 0%, has no rows and still has pins.
  - (j) two specific assets that match the same held instrument buy it once, with their weights added; the same
    code on two leaves creates one instrument, under the first.

## 4. Solution

### 4.1 The rule — `lib/utils/targetInstruments.ts` (new, written here)

```ts
/**
 * The instruments a user pins on the allocation targets (2026-11-23). Every LEAF of the target tree
 * — a class without sub-categories, a sub-category without specific assets, each specific asset —
 * may carry a «Ticker o ISIN». The Consulente reads the leaves, never rewrites them: «Applica» keeps
 * them wherever the proposal keeps their level, and the plan of accumulation creates and buys the
 * ones not held. A ticker fixes listing and currency; an ISIN alone does not.
 * Types only: loaded by the settings, the allocation service, the assistant's context and the hand-off.
 */
import type { Asset, AssetAllocationTarget, AssetType, SubCategoryTarget } from '@/types/assets';

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const CODE = /^[A-Z0-9.\-=^]+$/;
export const INSTRUMENT_CODE_MAX = 20;
export const INSTRUMENT_CODE_INVALID = 'Ticker o ISIN non valido: lettere, cifre e . - = ^, al massimo 20 caratteri.';

export interface InstrumentCode { isin?: string; ticker?: string }

/** «vwce.de» → ticker VWCE.DE; twelve characters shaped as an ISIN → ISIN; empty or malformed → null. */
export function parseInstrumentCode(text: string | null | undefined): InstrumentCode | null {
  const code = (text ?? '').trim().toUpperCase();
  if (code === '' || code.length > INSTRUMENT_CODE_MAX || !CODE.test(code)) return null;
  return ISIN.test(code) ? { isin: code } : { ticker: code };
}

export function printInstrumentCode(code: InstrumentCode | null | undefined): string {
  return code?.isin ?? code?.ticker ?? '';
}

/** The stored form of what the field holds: the code upper-cased, '' when there is none. */
export function normalizeInstrumentCode(text: string | null | undefined): string {
  return printInstrumentCode(parseInstrumentCode(text));
}

/** «Globale (IE00…)»: the ISIN a user wrote in a sub-category's name before the field existed. */
export function isinInName(name: string): string | null {
  const printed = /\(([^()]+)\)\s*$/.exec(name.trim());
  const first = printed?.[1].split(',')[0].trim().toUpperCase() ?? '';
  return ISIN.test(first) ? first : null;
}

/** A sub-category's name without the code in its parentheses. */
export function nameWithoutCode(name: string): string {
  return isinInName(name) ? name.replace(/\s*\([^()]*\)\s*$/, '').trim() : name.trim();
}

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
type SubValue = number | SubCategoryTarget | undefined;
const isObject = (value: SubValue): value is SubCategoryTarget => typeof value === 'object' && value !== null;
const tracksSpecific = (value: SubValue): value is SubCategoryTarget =>
  isObject(value) && value.specificAssetsEnabled === true && (value.specificAssets?.length ?? 0) > 0;
const pctOf = (value: number | SubCategoryTarget) => (isObject(value) ? value.targetPercentage : value);

export interface TargetLeaf {
  assetClass: string;
  /** '' on a class without sub-categories. */
  subCategory: string;
  /** Set on a specific asset. */
  specificName?: string;
  /** Of its parent: the sub-category for a specific asset, the class for a sub-category, 100 for a class. */
  pctOfParent: number;
  code: InstrumentCode | null;
}

/**
 * Every leaf of the targets, in the document's order. `isinInNames` reads «Nome (IE…)» as the
 * leaf's code while its field is empty: for the USER's stored targets only — a name a proposal
 * wrote is never the user's choice.
 */
export function listTargetLeaves(targets: AssetAllocationTarget | null | undefined, options: { isinInNames?: boolean } = {}): TargetLeaf[] {
  const leaves: TargetLeaf[] = [];
  for (const [assetClass, entry] of Object.entries(targets ?? {})) {
    const subs = Object.entries(entry.subTargets ?? {});
    if (subs.length === 0) {
      leaves.push({ assetClass, subCategory: '', pctOfParent: 100, code: parseInstrumentCode(entry.instrument) });
      continue;
    }
    for (const [subCategory, value] of subs) {
      if (tracksSpecific(value)) {
        for (const specific of value.specificAssets!) {
          leaves.push({ assetClass, subCategory, specificName: specific.name, pctOfParent: specific.targetPercentage, code: parseInstrumentCode(specific.instrument) });
        }
        continue;
      }
      const written = isObject(value) ? parseInstrumentCode(value.instrument) : null;
      const inName = options.isinInNames ? isinInName(subCategory) : null;
      leaves.push({ assetClass, subCategory, pctOfParent: pctOf(value), code: written ?? (inName ? { isin: inName } : null) });
    }
  }
  return leaves;
}

/** Something the user chose: a specific asset, or a code on a class or a sub-category. */
export const isPinnedLeaf = (leaf: TargetLeaf): boolean => leaf.specificName !== undefined || leaf.code !== null;

/**
 * The asset a leaf names: by ISIN, by ticker (exactly, then without the exchange suffix), else — a
 * specific asset — by the Allocazione page's rule (same class and sub-category, the name or the
 * ticker containing the row's name). A held one wins over one at 0 quotes.
 */
export function findLeafAsset(leaf: TargetLeaf, assets: readonly Asset[]): Asset | null {
  const pool = [...assets.filter((asset) => asset.quantity > 0), ...assets.filter((asset) => !(asset.quantity > 0))];
  const isin = leaf.code?.isin;
  if (isin) {
    const found = pool.find((asset) => (asset.isin ?? '').replace(/\s+/g, '').toUpperCase() === isin);
    if (found) return found;
  }
  const ticker = leaf.code?.ticker?.toLowerCase();
  if (ticker) {
    const tickersOf = (asset: Asset) => [asset.ticker, asset.displayTicker].map((t) => (t ?? '').trim().toLowerCase()).filter((t) => t !== '');
    const bare = (text: string) => text.split('.')[0];
    const found = pool.find((asset) => tickersOf(asset).includes(ticker))
      ?? pool.find((asset) => tickersOf(asset).some((t) => bare(t) === bare(ticker)));
    if (found) return found;
  }
  const wanted = leaf.specificName?.trim().toLowerCase() ?? '';
  if (wanted === '') return null;
  return pool.find((asset) => asset.assetClass === leaf.assetClass && (asset.subCategory ?? '') === leaf.subCategory
    && ((asset.ticker ?? '').toLowerCase().includes(wanted) || asset.name.toLowerCase().includes(wanted))) ?? null;
}

/**
 * The Allocazione page's third-level match: an asset of the class and sub-category whose name or
 * ticker contains the row's name (the rule of always), or whose ISIN or ticker IS the row's code.
 */
export function matchesSpecificAsset(
  asset: Pick<Asset, 'assetClass' | 'subCategory' | 'name' | 'ticker' | 'isin'>,
  specific: { name: string; instrument?: string },
  assetClass: string,
  subCategory: string
): boolean {
  if (asset.assetClass !== assetClass || asset.subCategory !== subCategory) return false;
  const wanted = specific.name.trim().toLowerCase();
  const ticker = (asset.ticker ?? '').toLowerCase();
  if (ticker.includes(wanted) || asset.name.toLowerCase().includes(wanted)) return true;
  const code = parseInstrumentCode(specific.instrument);
  if (code?.isin) return (asset.isin ?? '').replace(/\s+/g, '').toUpperCase() === code.isin;
  return !!code?.ticker && ticker === code.ticker.toLowerCase();
}

/**
 * The type a leaf's instrument is created with before a quote says better. A specific asset is ONE
 * security — a share in Azioni, a bond in Obbligazioni; a coded class or sub-category is a fund,
 * but for a government bond named by its ISIN alone.
 */
export function typeOfLeaf(leaf: TargetLeaf): AssetType {
  if (leaf.assetClass === 'crypto') return 'crypto';
  const single = leaf.specificName !== undefined;
  if (leaf.assetClass === 'bonds') {
    return single || (!leaf.code?.ticker && /^(IT|XS)/.test(leaf.code?.isin ?? '')) ? 'bond' : 'etf';
  }
  return single && leaf.assetClass === 'equity' ? 'stock' : 'etf';
}

/** Yahoo's `quoteType` as an asset type; null when it says nothing the app distinguishes. */
export function instrumentTypeFromQuote(quoteType: string | undefined): 'stock' | 'etf' | 'crypto' | null {
  switch ((quoteType ?? '').toUpperCase()) {
    case 'EQUITY': return 'stock';
    case 'ETF':
    case 'MUTUALFUND': return 'etf';
    case 'CRYPTOCURRENCY': return 'crypto';
    default: return null;
  }
}

export interface DroppedInstruments { assetClass: string; subCategory: string; names: string[] }
export interface PreservedTargets { targets: AssetAllocationTarget; dropped: DroppedInstruments[] }

/** The code of a sub-category of the USER's targets: its field, else the ISIN in its name. */
const subCodeOf = (name: string, value: SubValue): string =>
  (isObject(value) ? normalizeInstrumentCode(value.instrument) : '') || (isinInName(name) ?? '');

/**
 * `next` (the targets a proposal describes: classes and sub-categories as numbers) with the user's
 * third level and codes carried over from `current` wherever the level survives by name; `dropped`
 * is what leaves with a level the proposal no longer has. A code read in a kept name is written in
 * the field.
 */
export function preserveUserInstruments(next: AssetAllocationTarget, current: AssetAllocationTarget | null | undefined): PreservedTargets {
  const targets: AssetAllocationTarget = {};
  for (const [assetClass, entry] of Object.entries(next)) {
    const before = current?.[assetClass];
    const nextSubs = Object.entries(entry.subTargets ?? {});
    const beforeSubs = Object.entries(before?.subTargets ?? {});
    if (nextSubs.length === 0) {
      // A class keeps its code only while it was a leaf before too.
      const code = beforeSubs.length === 0 ? normalizeInstrumentCode(before?.instrument) : '';
      targets[assetClass] = code ? { ...entry, instrument: code } : { ...entry };
      continue;
    }
    const subTargets: Record<string, number | SubCategoryTarget> = {};
    for (const [name, value] of nextSubs) {
      const found = beforeSubs.find(([oldName]) => norm(oldName) === norm(name));
      const old = found?.[1];
      const code = found ? subCodeOf(found[0], old) : '';
      if (tracksSpecific(old)) {
        subTargets[name] = { targetPercentage: pctOf(value), specificAssetsEnabled: true, specificAssets: old.specificAssets!.map((asset) => ({ ...asset })) };
      } else if (code) {
        subTargets[name] = { targetPercentage: pctOf(value), instrument: code };
      } else {
        subTargets[name] = pctOf(value);
      }
    }
    targets[assetClass] = { ...entry, subTargets };
  }

  const dropped: DroppedInstruments[] = [];
  for (const [assetClass, before] of Object.entries(current ?? {})) {
    const after = targets[assetClass];
    const kept = new Set(Object.keys(after?.subTargets ?? {}).map(norm));
    const beforeSubs = Object.entries(before.subTargets ?? {});
    for (const [name, value] of beforeSubs) {
      if (kept.has(norm(name))) continue;
      const code = subCodeOf(name, value);
      if (tracksSpecific(value)) dropped.push({ assetClass, subCategory: name, names: value.specificAssets!.map((asset) => asset.name) });
      else if (code) dropped.push({ assetClass, subCategory: name, names: [code] });
    }
    const classCode = beforeSubs.length === 0 ? normalizeInstrumentCode(before.instrument) : '';
    if (classCode && !(after && Object.keys(after.subTargets ?? {}).length === 0)) dropped.push({ assetClass, subCategory: '', names: [classCode] });
  }
  return { targets, dropped };
}

/** How many leaves of the targets carry something the user chose: a specific asset or a code. */
export function countUserInstruments(targets: AssetAllocationTarget | null | undefined): number {
  return listTargetLeaves(targets).filter(isPinnedLeaf).length;
}

/** «Azioni › Tematici: Alfa, Beta escono dai target con la sottocategoria.» */
export function describeDroppedInstruments(row: DroppedInstruments, classLabel: string): string {
  const where = row.subCategory ? `${classLabel} › ${row.subCategory}` : classLabel;
  const verb = row.names.length === 1 ? 'esce' : 'escono';
  return `${where}: ${row.names.join(', ')} ${verb} dai target con la ${row.subCategory ? 'sottocategoria' : 'classe'}.`;
}

export const USER_PINS_HEADER = "--- SCELTE DELL'UTENTE SUI TARGET (fissate da lui in Impostazioni: non si rinominano, non si sostituiscono, non si ripesano) ---";

/**
 * What the user pinned, as the block the Consulente's prompts read; `[]` when nothing is pinned.
 * Read from the targets document, not from the context's rows: an account with nothing invested
 * yet has no rows and still has pins. Only the user's own codes are printed.
 */
export function formatUserPinsForPrompt(
  targets: AssetAllocationTarget | null | undefined,
  assets: readonly Asset[],
  classLabel: (assetClass: string) => string
): string[] {
  const pinned = listTargetLeaves(targets, { isinInNames: true }).filter(isPinnedLeaf);
  if (pinned.length === 0) return [];
  const stateOf = (leaf: TargetLeaf) =>
    (findLeafAsset(leaf, assets)?.quantity ?? 0) > 0 ? 'posseduto' : leaf.code ? 'non posseduto' : 'non posseduto, senza ticker né ISIN';
  const levels = new Map<string, TargetLeaf[]>();
  for (const leaf of pinned) {
    const key = `${leaf.assetClass}|${leaf.subCategory}`;
    levels.set(key, [...(levels.get(key) ?? []), leaf]);
  }
  const lines = [USER_PINS_HEADER];
  for (const group of levels.values()) {
    const [first] = group;
    const where = first.subCategory ? `${classLabel(first.assetClass)} › ${first.subCategory}` : classLabel(first.assetClass);
    if (first.specificName === undefined) {
      lines.push(`${where} — strumento voluto: ${printInstrumentCode(first.code)} (${stateOf(first)})`);
    } else {
      const parts = group.map((leaf) => `${leaf.specificName}${leaf.code ? ` [${printInstrumentCode(leaf.code)}]` : ''} ${leaf.pctOfParent}% (${stateOf(leaf)})`);
      lines.push(`${where} — asset specifici: ${parts.join(', ')}`);
    }
  }
  return lines;
}
```

### 4.2 The targets' shape and Impostazioni

- `types/assets.ts`: `SpecificAssetAllocation.instrument?: string`, `SubCategoryTarget.instrument?: string`, the
  class entry of `AssetAllocationTarget` gains `instrument?: string` — each «the user's Ticker o ISIN for this
  leaf, upper-cased (`lib/utils/targetInstruments.ts`)». No new settings key: the field lives inside `targets`,
  which every writer already replaces whole.
- `lib/utils/settingsDraft.ts`: `SpecificAssetDraft`, `SubTargetDraft` and `AssetClassDraft` gain `instrument:
  string` (`''` when absent; read in `toSubTargetDrafts`, `:242-256`, and where the class draft is built; the two
  constructors of an empty row — `emptySubTarget` in `AllocationClassEditor.tsx` and the «aggiungi asset» row of
  `SubTargetEditor.tsx` — start with `instrument: ''`). The save writes leaves only (`:494-503`):

```ts
acc[target.name] =
  target.specificAssetsEnabled && target.specificAssets.length > 0
    ? {
        targetPercentage: target.percentage,
        specificAssetsEnabled: true,
        specificAssets: target.specificAssets.map((asset) => {
          const code = normalizeInstrumentCode(asset.instrument);
          return { name: asset.name, targetPercentage: asset.targetPercentage, ...(code ? { instrument: code } : {}) };
        }),
      }
    : normalizeInstrumentCode(target.instrument)
      ? { targetPercentage: target.percentage, instrument: normalizeInstrumentCode(target.instrument) }
      : target.percentage;
```

  and the class entry gets `instrument` when `subCategoryEnabled` is false, the class is neither `cash` nor
  `realestate`, and `normalizeInstrumentCode(draft.instrument)` is not empty — the same condition that shows the
  field. The dirty check's projection (`:612-624`) carries `instrument` under the same three conditions as the
  save: a code left in the draft of a level that is no longer a leaf does not make the tab dirty.
  `targetFieldId` (`:96`) gains `classInstrument(class)`, `subInstrument(class, i)` and `assetInstrument(class, i,
  j)`: `target-{class}-instrument`, `target-{class}-sub-{i}-instrument`,
  `target-{class}-sub-{i}-asset-{j}-instrument`.
- `lib/utils/allocationTargetValidation.ts`: `TargetProblem` gains `{ kind: 'instrument-invalid'; assetClass;
  subIndex?: number; assetIndex?: number }`; the validation drafts (`ClassTargetDraft`, `SubTargetDraft`,
  `SpecificAssetDraft`, `:26-42`) gain `instrument?: string` and `toClassTargetDrafts` (`settingsDraft.ts:354-360`)
  passes them; `findTargetProblem` checks a class leaf's code BEFORE its `if (!draft.subCategoryEnabled)
  continue;`, then each sub-category leaf and each specific asset — a non-empty field `parseInstrumentCode`
  refuses is the problem, an empty one is not. `describeTargetProblem` (`lib/utils/settingsNarrative.ts:491`, an
  exhaustive switch) returns `INSTRUMENT_CODE_INVALID` for it; `revealTargetProblem` (`settingsDraft.ts:681-693`)
  opens the class (and the asset list) and focuses the matching one of the three new field ids.
- `lib/utils/modelPortfolio.ts`, `weighingTargets` (the fingerprint that turns the model «superato»): it drops
  `instrument` at the three levels, and reads a `{ targetPercentage, instrument }` sub-target without tracked
  specific assets as its number — a code does not weigh.
- `components/settings/allocation/AllocationClassEditor.tsx` and `SubTargetEditor.tsx`: an input «Ticker o ISIN»
  (placeholder «es. ALFA.MI o IE00…», `maxLength` 20, upper-cased on blur) beside the percentage of a leaf — the
  class while «Abilita sottocategorie» is off (not on `cash`, `realestate`), the sub-category while «Traccia asset
  specifici» is off, each specific asset. Once per class editor, under the first «Ticker o ISIN» field the class
  shows (its own, or its first sub-category's, or its first specific asset's): «Facoltativo: lo strumento che
  vuoi qui. Un ticker fissa listino e valuta (un simbolo del Nasdaq è in dollari); un ISIN lascia il listino alla
  borsa che indichi al Consulente.» The field takes the row's second line below `desktop:`.

### 4.3 The context — Assistente and Consulente

- `lib/utils/assistantPortfolioContext.ts`: `AssistantTargetRow` gains `instrument?: string`;
  `AssistantTargetSubRow` gains `instrument?: string` and `specific?: { name: string; targetPctOfSub: number;
  instrument?: string; held: boolean }[]`. `buildTargetRows` (`:462-511`, called at `:453`) takes the assets and
  fills them from `listTargetLeaves({ [assetClass]: target }, { isinInNames: true })`: a class leaf's code on the
  row; a sub-category's code on its sub-row; the specific assets with `held = (findLeafAsset(leaf,
  assets)?.quantity ?? 0) > 0`.
- `lib/server/assistant/prompts.ts:364-378`, the block:

```ts
lines.push(`${row.label}: attuale ${share(row.currentPct)} (${eur(row.currentValue)}) | ${target} | gap ${pp(row.gapPp)}${row.instrument ? ` | strumento voluto: ${row.instrument}` : ''}`);
for (const sub of row.subRows) {
  lines.push(
    `  › ${sub.subCategory}: attuale ${share(sub.currentPctOfClass)} della classe | target ${share(sub.targetPctOfClass)} della classe | gap ${pp(sub.gapPp)}${sub.instrument ? ` | strumento voluto: ${sub.instrument}` : ''}`
  );
  for (const specific of sub.specific ?? []) {
    const state = specific.held ? 'posseduto' : specific.instrument ? 'non posseduto' : 'non posseduto, senza ticker né ISIN';
    lines.push(`    · ${specific.name}${specific.instrument ? ` [${specific.instrument}]` : ''}: ${share(specific.targetPctOfSub)} della sottocategoria — ${state}`);
  }
}
```

  and, right under the header, only when a row carries one of the two: `(«strumento voluto» e le righe «·» sono
  scelte dell'utente: il ticker o l'ISIN che ha segnato in Impostazioni e gli asset specifici di una
  sottocategoria, con il loro peso.)`. No system prompt of the Assistente changes. These rows exist only where
  `buildTargetRows` has rows (a base above zero, a class with a target): the Consulente does not depend on them
  (§ 4.4).

### 4.4 The Consulente's contracts — `lib/server/allocationAdvice/prompts.ts`

- **The pins, ONE block for the four prompts.** `lib/server/allocationAdvice/run.ts` gains `readUserPins(userId):
  Promise<{ targets: AssetAllocationTarget | null; block: string }>` — `fetchSettings` and `getUserAssetsAdmin`
  together, then `formatUserPinsForPrompt(settings?.targets ?? null, assets, (cls) => ASSET_CLASS_LABELS[cls] ??
  cls).join('\n')` (`''` when nothing is pinned). `buildConsulenteContext` (the strategy and the interview's
  rounds) calls it in its `Promise.all` and appends the block, when not empty, at the END of its data block,
  after PIANO DI ACCUMULO; `runInstruments`, `runReview` and `runRevise` call it beside their own reads.
- Strategy, appended to the «Vincoli» paragraph (`:170`):
  `Il blocco «SCELTE DELL'UTENTE SUI TARGET» elenca ciò che l'utente ha fissato da sé in Impostazioni: gli asset
  specifici di una sottocategoria con il loro peso, e lo «strumento voluto» di una classe o di una sottocategoria.
  Non li cambi, non li ripesi e non ne proponi altri per quel livello. Se tieni un sotto-target che ha asset
  specifici ne ricopi il nome ESATTO e non scrivi "instrument"; se lo togli, di' nel testo che i suoi asset
  specifici escono con lui. Per uno «strumento voluto: X» tieni il nome ESATTO del sotto-target e scrivi X in
  "instrument"; se lo ritieni inadatto dillo nel testo, ma resta quello.`
- Instruments: `buildInstrumentsPrompt(answers, proposal, holdingsBlock, userPins = '')` — the block, when not
  empty, goes in the user content after the sleeves' list. One paragraph is added to the contract after `:446`:
  `Gli strumenti del blocco «SCELTE DELL'UTENTE SUI TARGET» non si sostituiscono, e per il loro sotto-target (o
  la loro classe) non proponi altri candidati: i candidati sono quelli, con il nome che l'utente ha scritto. Per
  quelli «non posseduto» che hanno il solo ISIN verifica per primi la quotazione sulla borsa indicata e i simboli
  di Yahoo Finance; quelli con un ticker non li cerchi: il ticker fissa già listino e valuta; quelli senza ticker
  né ISIN non li cerchi. Un asset specifico può essere un'azione.`
- Review and revision (decision 89): `buildReviewPrompt` and `buildRevisionPrompt` take `opts.userPins?: string`
  and print it, when not empty, before their closing instruction line. `REVIEW_CONTRACT`, in the paragraph on
  `proposal`, gains: `I sotto-target e le classi del blocco «SCELTE DELL'UTENTE SUI TARGET» restano con il nome
  ESATTO che hanno nella strategia: non li rinomini, non li togli e non ne cambi lo strumento; nella sezione «Gli
  strumenti» li presenti come scelte dell'utente.` `REVISION_CONTRACT` gains: `Se la richiesta chiede di togliere
  o rinominare un sotto-target che porta scelte dell'utente, non farlo: spiega che deve prima togliere quegli
  strumenti in Impostazioni › Allocazione.`
- Plan, `PLAN_CONTRACT` (after the line on `targetPercentage`, `:677`): `Le righe con «peso voluto nella
  sotto-categoria» sono asset specifici scelti dall'utente: si dividono la quota della loro sotto-categoria in
  proporzione a quei pesi. Gli strumenti sotto «Fuori dal piano» non hanno una riga: nominali in "departures".`

### 4.5 «Applica» keeps what the user chose — `lib/utils/allocationAdviceApply.ts`, the book

- `buildTargetsFromProposal(proposal, current?: AssetAllocationTarget | null)`: the loop of today, then
  `return current ? preserveUserInstruments(targets, current).targets : targets;`.
- The three callers pass the live targets: the write (`ConsulenteReport.tsx:270`, `settings?.targets ?? null`), the
  plan's effective targets (`:171`), the stage's reserve (`run.ts:501`, `settings?.targets ?? null`).
- The tick «I target»: `ApplyPiecesInput` (`ConsulenteBookPages.tsx:371-401`) gains `keptTargets: PreservedTargets
  | null`, computed in `ConsulenteReport` with `preserveUserInstruments(buildTargetsFromProposal(proposal),
  settings?.targets ?? null)`. Under the label (`:442-446`): «Restano i {n} strumenti che hai scelto tu.» when
  `countUserInstruments(keptTargets.targets) > 0` («Resta lo strumento che hai scelto tu.» for one), and one
  `describeDroppedInstruments` line per dropped row, in the warning tone.
- **The guard of decision 89**, in the same module (written here):

```ts
/**
 * After the review or a revision: every level of `reference` that carries the user's pins is in
 * `reviewed` under its exact name (owner, 2026-11-23). A renamed or removed sub-target puts back the
 * class's sub-targets as `reference` had them — the one repair that keeps the class at 100. Null
 * when the class itself is gone: the reviewed proposal is refused and the reference stands.
 */
export function restorePinnedSubTargets(
  reviewed: AllocationAdviceProposal,
  reference: AllocationAdviceProposal,
  userTargets: AssetAllocationTarget | null | undefined
): { proposal: AllocationAdviceProposal; restored: string[] } | null {
  const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
  const pinned = new Set(listTargetLeaves(userTargets, { isinInNames: true }).filter(isPinnedLeaf)
    .map((leaf) => `${leaf.assetClass}|${norm(leaf.subCategory)}`));
  const restored: string[] = [];
  const classes = reviewed.classes.map((cls) => ({ ...cls, subTargets: cls.subTargets.map((sub) => ({ ...sub })) }));
  for (const ref of reference.classes) {
    const leafPinned = ref.subTargets.length === 0 && pinned.has(`${ref.assetClass}|`);
    const names = ref.subTargets.filter((sub) => pinned.has(`${ref.assetClass}|${norm(sub.name)}`)).map((sub) => sub.name);
    if (!leafPinned && names.length === 0) continue;
    const cls = classes.find((item) => item.assetClass === ref.assetClass);
    if (!cls) return null;
    const missing = names.filter((name) => !cls.subTargets.some((sub) => norm(sub.name) === norm(name)));
    if ((leafPinned && cls.subTargets.length > 0) || missing.length > 0) {
      cls.subTargets = ref.subTargets.map((sub) => ({ ...sub }));
      restored.push(...(leafPinned ? [ASSET_CLASS_LABELS[ref.assetClass] ?? ref.assetClass] : missing));
      continue;
    }
    // Kept: the exact name, whatever case the review wrote.
    for (const sub of cls.subTargets) {
      const exact = names.find((name) => norm(name) === norm(sub.name));
      if (exact) sub.name = exact;
    }
  }
  return { proposal: { ...reviewed, classes }, restored };
}

/** The line the report gains when the guard put something back. */
export function describeRestoredPins(restored: readonly string[]): string {
  const names = restored.map((name) => `«${name}»`).join(', ');
  return restored.length === 1
    ? `Nota: ${names} resta nei target com'era: porta strumenti che hai scelto tu. Per toglierlo, togli prima quegli strumenti in Impostazioni › Allocazione.`
    : `Nota: ${names} restano nei target com'erano: portano strumenti che hai scelto tu. Per toglierli, togli prima quegli strumenti in Impostazioni › Allocazione.`;
}
```

  `runReview` and `runRevise` (`run.ts`), where they take `reviewed?.proposal`: `const guarded = reviewed?.proposal
  ? restorePinnedSubTargets(reviewed.proposal, reference, pins.targets) : null;` with `reference` =
  `strategy.proposal` in the review and `report.proposal` (the previous report's) in a revision. The stored
  proposal is `guarded?.proposal ?? reference`; when `guarded.restored` is not empty the stored markdown ends with
  a blank line and `describeRestoredPins(guarded.restored)`, and the log gets `[consulente] pinned sub-targets
  restored` with the names.

### 4.6 The hand-off — `lib/utils/allocationAdviceHandoff.ts`

`ConsulenteHandoffPlan` gains `outOfPlan: Array<HandoffRow & { name: string }>`; a `matched` and a `toCreate` row
gain `wantedPct?: number`. `AssetPrefill` (`types/assets.ts:184`) gains `pinnedTicker?: true` («the ticker is the
user's: the only symbol to quote, kept also without a fresh quote») and `nameFromQuote?: true` («the name is a
placeholder — the code: the quote's name replaces it at the click»). The file's imports gain `listTargetLeaves`,
`isPinnedLeaf`, `findLeafAsset`, `typeOfLeaf`, `printInstrumentCode` (`@/lib/utils/targetInstruments`),
`buildTargetsFromProposal` (`@/lib/utils/allocationAdviceApply`) and the type `AssetAllocationTarget`. The
function, whole (the last branch is today's code, unchanged):

```ts
export function planConsulenteHandoff(proposal: AllocationAdviceProposal, candidates: InstrumentCandidates | null,
  keepAssets: readonly string[], assets: readonly Asset[], userTargets: AssetAllocationTarget | null = null): ConsulenteHandoffPlan {
  const out: ConsulenteHandoffPlan = { matched: [], toCreate: [], unnamed: [], notBuyable: [], outOfPlan: [], keepAssetIds: [] };
  // The targets «Applica» would write: the proposal's, with the user's third level and codes where the level stays.
  // No name is read here: `preserveUserInstruments` already wrote in the field the ISIN of a kept name.
  const leaves = listTargetLeaves(buildTargetsFromProposal(proposal, userTargets));
  const place = (row: HandoffRow, asset: Asset, wantedPct?: number) => {
    if (!isPlanBuyable(asset, assets)) { out.notBuyable.push({ ...row, assetId: asset.id, name: asset.name }); return; }
    const already = out.matched.find((m) => m.assetId === asset.id);
    // Two specific assets that name the same instrument buy it once, with their weights added.
    if (already) { if (wantedPct !== undefined) already.wantedPct = (already.wantedPct ?? 0) + wantedPct; return; }
    out.matched.push({ ...row, assetId: asset.id, name: asset.name, held: asset.quantity > 0, ...(wantedPct !== undefined ? { wantedPct } : {}) });
  };
  for (const cls of proposal.classes) {
    if (cls.assetClass === 'cash' || cls.assetClass === 'realestate') continue;
    const sleeves = (candidates?.sleeves ?? []).filter((sleeve) => sleeve.assetClass === cls.assetClass);
    const hasSubs = cls.subTargets.length > 0;
    // A class without sub-targets was searched under the class's label (the instruments' prompt).
    const subs: Array<{ name: string; instrument?: string }> = hasSubs ? cls.subTargets
      : [{ name: ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass, instrument: undefined }];
    for (const sub of subs) {
      const row: HandoffRow = { assetClass: cls.assetClass, subTarget: sub.name };
      const sleeve = hasSubs ? sleeves.find((s) => norm(s.subTarget) === norm(sub.name)) : sleeves[0];
      const list = sleeve?.candidates ?? [];

      // What the user chose for this level wins over the report's instrument and the search (owner, 2026-11-23).
      const pinned = leaves.filter((leaf) => leaf.assetClass === cls.assetClass
        && (hasSubs ? norm(leaf.subCategory) === norm(sub.name) : leaf.subCategory === '')
        && isPinnedLeaf(leaf));
      if (pinned.length > 0) {
        for (const leaf of pinned) {
          const wantedPct = leaf.specificName !== undefined ? leaf.pctOfParent : undefined;
          const asset = findLeafAsset(leaf, assets);
          if (asset) { place(row, asset, wantedPct); continue; }
          const candidate = list.find((c) => !!leaf.code?.isin && (c.isin ?? '').toUpperCase() === leaf.code.isin)
            ?? list.find((c) => !!leaf.code?.ticker && (c.ticker ?? '').toUpperCase() === leaf.code.ticker)
            ?? null;
          // The user's name; else the candidate's; else the code, which the quote's name replaces at the click.
          const ownName = leaf.specificName?.trim() || candidate?.name || '';
          const name = ownName || printInstrumentCode(leaf.code) || (hasSubs ? sub.name : ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass);
          // Not held and no code: nothing to price or buy (owner, 2026-11-23).
          if (!leaf.code) { out.outOfPlan.push({ ...row, name }); continue; }
          const code = leaf.code;
          const sameCode = (prefill: AssetPrefill) =>
            (!!code.isin && (prefill.isin ?? '').toUpperCase() === code.isin) || (!!code.ticker && prefill.pinnedTicker === true && prefill.ticker.toUpperCase() === code.ticker);
          if (out.toCreate.some((c) => norm(c.name) === norm(name) || sameCode(c.prefill))) continue;
          out.toCreate.push({ ...row, name, ...(wantedPct !== undefined ? { wantedPct } : {}), prefill: {
            name, ticker: code.ticker ?? candidate?.ticker ?? '', isin: code.isin ?? candidate?.isin,
            type: typeOfLeaf(leaf), assetClass: cls.assetClass, subCategory: hasSubs ? sub.name : '',
            ...(code.ticker ? { pinnedTicker: true as const } : {}), ...(ownName === '' ? { nameFromQuote: true as const } : {}) } });
        }
        continue;
      }

      // No choice of the user's here: the report's instrument, else the sleeve's candidates (unchanged).
      // A sub-target may name several instruments, «A (IT…) + B (IT…)» or «A; B» (owner, 2026-11-20): each is its own.
      const namedParts = (sub.instrument ?? '').split(/\s+\+\s+|;\s*/).map((part) => part.trim()).filter((part) => part !== '');
      const parts = namedParts.length > 1 ? namedParts.map((instrument) => ({ ...sub, instrument })) : [sub];
      for (const part of parts) {
        const named = splitNamed(part.instrument ?? '');
        const namesOne = named.head !== '' || !!named.isin;
        const candidate = list.find((c) => !!named.isin && (c.isin ?? '').toUpperCase() === named.isin)
          ?? list.find((c) => named.head !== '' && norm(c.name) === norm(named.head))
          ?? (namesOne ? null : list.find((c) => c.alreadyHeld) ?? list[0] ?? null);
        const asset = (part.instrument ? findAssetByName(assets, part.instrument) : null)
          ?? findAssetByIsin(assets, named.isin) ?? (named.head ? findAssetByName(assets, named.head) : null)
          ?? (candidate ? findAssetByIsin(assets, candidate.isin) ?? findAssetByName(assets, candidate.name)
            ?? (candidate.ticker ? findAssetByName(assets, candidate.ticker) : null) : null);
        if (asset) { place(row, asset); continue; }
        const name = candidate?.name ?? named.head;
        if (!name) { out.unnamed.push(row); continue; }
        if (out.toCreate.some((c) => norm(c.name) === norm(name))) continue;
        const ticker = candidate?.ticker ?? '';
        const isin = candidate ? candidate.isin : named.isin; // one source: never a name with another's ISIN
        const type = cls.assetClass === 'crypto' ? 'crypto'
          : cls.assetClass === 'bonds' && !ticker && /^(IT|XS)/.test(isin ?? '') ? 'bond' : 'etf';
        out.toCreate.push({ ...row, name, prefill: { name, ticker, isin, type,
          assetClass: cls.assetClass, subCategory: hasSubs ? sub.name : '' } });
      }
    }
  }
  const kept = keepAssets.map((name) => findAssetByName(assets, name)).filter((a): a is Asset => a !== null);
  out.keepAssetIds = [...new Set([...out.matched.map((m) => m.assetId), ...kept.map((a) => a.id)])];
  return out;
}
```

### 4.7 The plan's facts, the reconcile, the click

- `lib/utils/operatingPlan.ts`: `OperatingPlanInstrument.wanted?: { pct: number; group: string }` («a specific
  asset's weight in its sub-category as the user set it, and the level it is of — `{assetClass}|{sub-target}` of
  the hand-off's row, not the asset's own sub-category»); `OperatingPlanFacts.outOfPlan?: string[]`;
  `OPERATING_PLAN_COPY.outOfPlan = (name: string) => `${name} non ha un ticker né un ISIN: il piano non lo
  compra.`` and `OPERATING_PLAN_COPY.wantedWeights = (subTarget: string) => `${subTarget}: le quote degli asset
  specifici seguono i pesi che hai dato in Impostazioni.``.
- **The reconcile imposes the weights** (decision 90). In `reconcileOperatingPlan`, a new rule after the scaling
  to 100 (today's 11) and before the limits (today's 12):

```ts
// 12. The user's weights (owner, 2026-11-23): the specific assets of one sub-category split what the plan gives
// them TOGETHER in proportion to the weights set in Impostazioni. Only the rows the plan buys: one it holds or
// sells keeps out, and the others split among themselves.
const wantedOf = (ref: string) => facts.instruments.find((item) => item.ref === ref)?.wanted;
const groups = new Map<string, WorkRow[]>();
for (const row of buys()) {
  const wanted = wantedOf(row.ref);
  if (!wanted || !(row.targetPercentage > 0)) continue;
  groups.set(wanted.group, [...(groups.get(wanted.group) ?? []), row]);
}
for (const [group, members] of groups) {
  const weights = members.map((row) => wantedOf(row.ref)!.pct);
  const weightSum = weights.reduce((sum, pct) => sum + pct, 0);
  if (members.length < 2 || !(weightSum > 0)) continue;
  const total = members.reduce((sum, row) => sum + row.targetPercentage, 0);
  let moved = false;
  members.forEach((row, index) => {
    const next = (total * weights[index]) / weightSum;
    if (Math.abs(next - row.targetPercentage) > OPERATING_PLAN_SUM_TOLERANCE) moved = true;
    row.targetPercentage = next;
  });
  if (moved) corrections.push(OPERATING_PLAN_COPY.wantedWeights(group.split('|')[1]));
}
```

  The rules that follow keep their order (the limits of «Criteri del modello» come AFTER and win: they are the
  user's too). Last before the result (`:401`): `for (const name of facts.outOfPlan ?? [])
  corrections.push(OPERATING_PLAN_COPY.outOfPlan(name));` — the click's refreshed facts carry no `outOfPlan`, and
  the stored sentence stays among the notes; the stored instruments keep `wanted`, so the click's reconcile
  finds the same weights and moves nothing. The function's comment and doc/guide/consulente-piano.md say
  SEVENTEEN rules: the user's weights the twelfth, the out-of-plan sentence the last.
- `lib/utils/operatingPlanFacts.ts`: `OperatingPlanFactsInput.userTargets: AssetAllocationTarget | null`, passed
  to the hand-off (`:51`); a held key takes `wanted: { pct: row.wantedPct, group: `${row.assetClass}|${row.
  subTarget}` }` from its `matched` row, a new one from its `toCreate` row (`:69-85`); the result carries
  `outOfPlan: handoff.outOfPlan.map((row) => row.name)`. A new instrument whose prefill has `pinnedTicker` gets
  `symbols = [prefill.ticker]` — never a candidate's `yahooSymbols`. The server passes `settings?.targets ?? null`
  (`run.ts:489-496`).
- `findAdviceInstrument(assets, prefill: Pick<AssetPrefill, 'name' | 'isin' | 'ticker'>)` (decision 92): by ISIN;
  else, with a non-empty `prefill.ticker`, by the asset's `ticker` or `displayTicker`, case-insensitively; else
  by name through `findAssetByName`, as today. Its two callers (`advicePlanService.ts`, the form data;
  `refreshOperatingPlanFacts`, the prefill) already pass an object that has the ticker.
- `lib/server/allocationAdvice/prompts.ts`, `formatOperatingPlanFacts` (`:627-661`): a held and a new row with
  `wanted` end with ` · peso voluto nella sotto-categoria {pct}%`; a fourth section, printed only when it has
  rows: «Fuori dal piano (asset specifici non posseduti, senza ticker né ISIN):» with the names.
- **The quote at the click** (decisions 91 and the type): `lib/services/yahooFinanceService.ts` — `QuoteResult`
  gains `quoteType?: string` and `name?: string`, and `getQuote` returns them beside the price
  (`...(quote.quoteType ? { quoteType: quote.quoteType } : {})`, `name` = `quote.longName ?? quote.shortName`
  when one is a non-empty string; `:49-54`); the route spreads the quote (`quote/route.ts:67`);
  `lib/hooks/useAdviceQuotes.ts`, `fetchQuote` — which copies the body field by field — copies the two when they
  are strings; `RawQuote` and `AdviceQuote` gain `quoteType?: string` and `name?: string` and `pickFreshQuote`
  carries them (`lib/utils/advicePlan.ts:69-83`). In `newInstrumentFormData` (`:110-137`):
  `const quoted = instrumentTypeFromQuote(priced?.quoteType);` then `type: quoted && (quoted === 'etf' ||
  LEDGER_TYPE_CLASS[quoted] === prefill.assetClass) ? quoted : prefill.type` — `LEDGER_TYPE_CLASS` imported from
  `@/lib/utils/tradeProposal` (DATI-16), `instrumentTypeFromQuote` typed `'stock' | 'etf' | 'crypto' | null`: a
  fund sits in any class, a share quoted for a leaf of Materie prime keeps the leaf's type;
  `name: prefill.nameFromQuote ? (priced?.name?.trim() || prefill.name) : prefill.name`;
  `ticker: priced ? priced.symbol : prefill.pinnedTicker ? prefill.ticker : fallbackTicker(prefill)`.
  The currency, the symbol and the euro price are already the quote's (`:117-126`).
- `lib/services/assetAllocationService.ts`, `findMatchingAssets` (`:758-778`): takes the specific asset, not its
  name, and filters with `matchesSpecificAsset` (§ 4.1) — the service is Firestore-coupled and has no unit test, the
  rule lives in the pure module.

## 5. Constraints and traps

- **«Applica» replaces the targets document** (doc/guide/consulente-piano.md § The book and «Applica»): whatever
  the merge does not carry is lost; `preserveUserInstruments` is the only place that decides it.
- **The proposal «Applica» reads is the REVIEW's** (`document.report.proposal`, `run.ts`), rewritten again by
  every «Chiedi una modifica»: a constraint on the strategy alone is undone two stages later — hence decision 89.
- **Settings — the places** (doc/guide/impostazioni.md): `instrument` is NOT a settings key; it travels inside
  `targets`. Check the draft's read, write and dirty projection, the three of them.
- **A sub-target stored as an object without specific assets** is new: `subTargetPct`
  (`assistantPortfolioContext.ts`, private), `hasSpecificAssetTracking` (`allocationUtils.ts:254-265`) and the
  optimizer's test (`weightOptimizer.ts:305`) already read it right; U6 holds them. The model's fingerprint did
  not: § 4.2.
- **A system prompt is static** (index § 8): the pins go in the user content; the contract paragraphs are
  constants.
- **Never an asset id, a tax rate or a held ISIN in the plan's block**: the pins block prints the codes the user
  wrote; the «new» rows print their prefill's, as today.
- **The hand-off runs on the server and its result is stored**; the click re-matches by ISIN, then ticker, then
  name (`findAdviceInstrument`): a second press finds what a first one created, also after a rename.
- **`fetchQuote` copies the route's body field by field** (`useAdviceQuotes.ts`): a field added to the service
  and not there never reaches the click, and the unit tests on a faked `RawQuote` stay green.
- **The Consulente's route keeps `advicePlan.ts` out of its first load**; `targetInstruments.ts` imports types
  only, so the settings and the context can load it.
- **Nothing here spends** (index § 8 rule 5): the stages are faked as today (doc/guide/consulente-piano.md).
- **No owner data**: «Alfa» (ALFA.MI), «Beta» (BETA, in dollars), «Gamma» (no code), ISIN `IE00TEST0017`.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/targetInstruments.test.ts` (new) | `parseInstrumentCode`: «alfa.mi» → ticker ALFA.MI; `IE00TEST0017` → ISIN; empty, 21 characters, a space inside → null | ISIN read as a ticker |
| U2 | unit · same | `listTargetLeaves`: a class leaf, a sub-category leaf with a code, three specific assets with their weights; with `isinInNames` an ISIN in a sub-category's name is its code while the field is empty and the field wins; without the option the name is not read | name read before the field; names read by default |
| U3 | unit · same | `findLeafAsset`: by ISIN; by ticker exactly before the bare symbol (BETA beside BETA.MI); a specific asset by the name rule inside its class and sub-category only; a held one before one at 0 | bare match first |
| U4 | unit · same | `preserveUserInstruments`: the specific assets and the codes follow a kept sub-category (case-insensitive) with the NEW percentage; an ISIN in the kept OLD name becomes the field; a class code survives only leaf to leaf | old percentage kept |
| U5 | unit · same | `dropped`: a removed sub-category with specific assets, a renamed one, one whose only code was the ISIN in its name, a coded class that gets sub-targets; `describeDroppedInstruments` singular and plural | dropped left empty |
| U6 | unit · `__tests__/allocationUtils.test.ts`, `__tests__/weightOptimizer.test.ts`, `__tests__/assistantPortfolioContext.test.ts` | `{ targetPercentage, instrument }`: `hasSpecificAssetTracking` false, no optimizer note, the context's sub-row reads its percentage | object taken for a tracked level |
| U7 | unit · `__tests__/targetInstruments.test.ts` | `typeOfLeaf`: a specific asset of Azioni `stock`, of Obbligazioni `bond` (a `DE…` ISIN too), of Materie prime `etf`; a coded sub-category `etf`, `bond` for an `IT…` ISIN with no ticker; Cripto `crypto`. `instrumentTypeFromQuote`: EQUITY, ETF, MUTUALFUND, CRYPTOCURRENCY, an unknown one → null | `stock` for every specific asset |
| U8 | unit · same | `formatUserPinsForPrompt`: the header, one line per level — «asset specifici» with code, weight and the three states, «strumento voluto» — for a class at 0% too; nothing pinned → `[]` | print with nothing pinned |
| S1 | unit · `__tests__/settingsDraft.test.ts` | the draft reads the three codes; the save writes a leaf's code upper-cased, a number when there is none, nothing on a class with sub-categories enabled, on `cash`, nor on a sub-category with specific assets; a code left on a level that is no longer a leaf does not make the draft dirty | parent's code written |
| S2 | unit · `__tests__/allocationTargetValidation.test.ts`, `__tests__/settingsNarrative.test.ts` | a malformed code is `instrument-invalid` at each of the three levels — a class leaf's too, sub-categories off; an empty one is not; its sentence; `revealTargetProblem` returns the field's id | empty refused; class skipped |
| S3 | unit · `__tests__/modelPortfolio.test.ts` | the fingerprint is equal with and without codes at the three levels | `instrument` kept in `weighingTargets` |
| C1 | unit · `__tests__/assistantPortfolioContext.test.ts`, `__tests__/assistantTargetsBlock.test.ts` (new) | the rows carry `instrument` and `specific` with `held`; the block prints «strumento voluto», the «·» rows with their three states and the legend line; no legend without pins | third level not printed |
| T1 | unit · `__tests__/allocationAdviceApply.test.ts` | `buildTargetsFromProposal(proposal, current)` keeps the third level and the codes; without `current` it is today's output byte for byte | numbers only |
| T2 | unit · same | a sub-category the proposal drops loses them | carried to another sub-category |
| T3 | unit · same | `restorePinnedSubTargets`: a pinned sub-target kept in another case gets its exact name; renamed, or removed → the class's sub-targets are the reference's, the name in `restored`; a pinned class leaf given sub-targets → emptied; the pinned class gone → null; nothing pinned → the reviewed proposal untouched; the two sentences of `describeRestoredPins` | accept the rename |
| T4 | unit · `__tests__/allocationAdviceRun.test.ts` | a review whose proposal renames a pinned sub-target stores the restored proposal and a markdown that ends with the note; a revision likewise against the PREVIOUS report; with nothing pinned both store what the model wrote | store the model's proposal |
| H1 | unit · `__tests__/allocationAdviceHandoff.test.ts` | a sub-category with three specific assets: the held one matched with `wantedPct`, the coded one in `toCreate` (type `stock`, its sub-category), the uncoded one in `outOfPlan`; the report's `instrument` is ignored there | report's instrument wins |
| H2 | unit · same | a ticker-coded leaf: `prefill.ticker` is the code, `pinnedTicker` set; an ISIN-coded one takes the candidate's ticker and name; a coded class without sub-targets and without a candidate is named by its code with `nameFromQuote` — never «Azioni» | candidate's ticker over the user's |
| H3 | unit · same | a coded sub-category held by ISIN is matched, never created | created twice |
| H4 | unit · same | without `userTargets`, for a level with no pin, and for a proposal's sub-target whose NAME carries an ISIN, the result equals today's on the existing fixtures | unchanged branch touched; names read |
| H5 | unit · same | two specific assets that match one held instrument → one `matched` row with the two weights added; the same code on two leaves → one `toCreate` | second weight lost |
| F1 | unit · `__tests__/operatingPlanFacts.test.ts`, `__tests__/allocationAdvicePrompts.test.ts` | the keys carry `wanted` with the hand-off's group, the facts `outOfPlan`; a `pinnedTicker` instrument has that one symbol beside a candidate with others; the block prints «peso voluto…» and the section «Fuori dal piano» only when it has rows | section always printed; candidate's symbols |
| R1 | unit · `__tests__/operatingPlan.test.ts` | the reconcile adds one sentence per `outOfPlan` name; run on its own output it adds none; without the field, none | sentence repeated |
| R2 | unit · same | two bought specific assets of one sub-category at 30 and 10 with wanted weights 60/40 → 24 and 16, the other rows untouched, the sum 100, one `wantedWeights` sentence; already in proportion → no sentence | proportion to the model's quotas |
| R3 | unit · same | of three, one is held (not bought): the other two split their total by their two weights; a single bought member is left alone; run on its own output it moves nothing | the held one given a quota |
| P1 | unit · `__tests__/allocationAdvicePrompts.test.ts` | the strategy's, the instruments', the review's, the revision's and the plan's contracts hold the new paragraphs; each system is identical for two users | paragraph in the user content |
| P2 | unit · same | with pins, the user content of the instruments', the review's and the revision's prompt holds the block once; with `''` each is today's output byte for byte, `buildInstrumentsPrompt` called with three arguments too | block printed when empty |
| A1 | unit · `__tests__/advicePlan.test.ts` | a `new` instrument priced by a quote in USD with `quoteType: 'EQUITY'` is created as `stock`, in USD, with its euro price; `'ETF'` → `etf`; no `quoteType`, and `'CRYPTOCURRENCY'` on a leaf of Azioni → the prefill's type; `nameFromQuote` takes the quote's name, and the code when the quote has none; a `pinnedTicker` with no fresh quote keeps its ticker | prefill's type always; `fallbackTicker` for a pinned one |
| A2 | unit · `__tests__/operatingPlanFacts.test.ts` | `findAdviceInstrument`: by ISIN; with no ISIN by ticker, an asset renamed since; else by name; an empty ticker matches nothing | name before ticker |
| Y1 | unit · `__tests__/yahooFinanceService.test.ts` | `getQuote` returns the `quoteType` and the name (`longName`, else `shortName`) of the mocked quote | field dropped |
| Y2 | dom · `__tests__/useAdviceQuotes.test.tsx` | a body with `quoteType` and `name` reaches the hook's quote | copy without the two |
| M1 | unit · `__tests__/targetInstruments.test.ts` | `matchesSpecificAsset`: the name rule as today; a row whose name matches nothing is found by its ISIN and by its ticker; never outside its class and sub-category | code ignored |
| D1 | dom · `__tests__/subTargetEditor.test.tsx` (new) | the field shows on a leaf and hides when its level opens; the helper line shows once per open class | field on a parent |
| D2 | dom · `__tests__/consulenteBookPlan.test.tsx` | `applyPieces` with `keptTargets`: the tick «I target» says how many chosen instruments stay and names what leaves; with `null` it is today's | no line |
| E1 | e2e · `e2e/settings.spec.ts` | type a code in lower case on a sub-category, save, reload: it is there upper-cased; a malformed one blocks the save with its message | `normalizeInstrumentCode` not called on save |
| E2 | e2e · `e2e/allocation.consulente.plan.spec.ts` | targets seeded with two specific assets (one held, one coded); the operating plan seeded with the coded one as a `new` instrument (its prefill as the hand-off writes it, `wanted` set) and `/api/prices/quote` routed with `quoteType: 'EQUITY'`: the tick says they stay, «Applica» leaves them in Impostazioni, the coded one exists at 0 quotes as a `stock` and has its row in Accumulo | `buildTargetsFromProposal` without `current` at the write |
| E3 | e2e · `e2e/settings.mobile.spec.ts` | 390: the field sits on the row's second line, no horizontal overflow, the target ≥ 44 px | the field on the percentage's line |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: after «Applica» on a faked report, Impostazioni still shows the specific assets
with their weights and codes; the instrument chosen with a ticker exists at 0 quotes in its quote's currency and
Accumulo lists it; the one without a code is named as out of the plan; the bought specific assets stand in the
plan in the proportion of their weights.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390 (the stages faked, no call
  that spends): B the fields in Impostazioni on the three levels, saved and reloaded, the model still current; C
  «Applica» with a kept and a dropped sub-category (the two lines of the tick, the document after); D the plan's
  page and Accumulo (the new instruments with the quote's name, «Fuori dal piano», the weights), then the created
  instrument renamed in Patrimonio and «Applica» pressed again (no second instrument); E the shared account, a
  targets document with no third level (today's behaviour, unchanged), and — with the stage's answer faked — a
  review that renames a pinned sub-target (the report keeps the name and ends with the note). Decoys:
  «ornitorinco» (a code on a class WITH sub-categories: no field) and «fenicottero» (a specific asset without a
  code and not held: no row in Accumulo).
- F — at the owner's «pronto», on his account: one run of the Consulente (it spends, by his hand), the pins read
  in the report, «Chiedi una modifica», «Applica», the targets and Accumulo after.

## 8. Putting it into service

No rules, no index, no migration: the three fields are optional and absent on every stored document. The stored
reports written before keep working (the hand-off without pins is today's; a stored plan's instruments have no
`wanted`). Release note: the owner writes the codes once in the field; a sub-category's name with an ISIN keeps
working as it is — renaming it also needs its instruments' sub-category changed in Patrimonio. Measure: `npm run
perf:budget` on `/dashboard/settings` and `/dashboard/allocation`, inside their ceilings; a ceiling is raised by
no more than 1 KB gz and only with the register row (index § 8 rule 7). With phase F closed and the commit in
`develop`, the owner opens the PR `develop` → `main` (index § 8 rule 13).

## 9. Documentation

- `doc/guide/consulente.md` (507 lines: past ~500, this session splits it by sub-topic — decision 47) — § The
  schemas: the pins block (what each of the four prompts reads, what it may not change) and the guard after the
  review and a revision; § Per-page blind spots: the Consulente neither proposes nor re-weighs specific assets; a
  sub-category the STRATEGY renames is a dropped one; «Chiedi una modifica» cannot remove a level that carries
  the user's instruments; a bare-ticker match may find another listing of the same symbol already held; the
  search ceiling; the Assistente's rows show the pins only where it has rows.
- `doc/guide/consulente-piano.md` — the hand-off's first branch, `wanted`, «Fuori dal piano», the type and the
  name from the quote, the pinned ticker's one symbol; «Applica» keeps the third level
  (`preserveUserInstruments`); § The stage, the reconcile: seventeen rules; § Per-page blind spots: no lookup from
  an ISIN to its listings without the agent; a name that matches several held instruments takes one (Allocazione
  sums them); the same code on two leaves buys once; a code changed in Impostazioni after the plan was written
  reaches the plan when it is written again; a pinned ticker with no fresh quote is created in euro with no
  price; a pinned instrument that is an account, a property or a pension fund is not bought and no line says so;
  under goal-driven targets a class's code is not in the effective targets.
- `doc/guide/impostazioni.md` — the «Ticker o ISIN» of a leaf, inside `targets`.
- `doc/guide/allocazione.md` — a specific asset matched by its code too.
- `doc/guide/assistente.md` — the targets block's third level. `doc/guide/assistente-registra.md` § Per-page
  blind spots — the Registra card keeps the model's type; only the plan's click reads the quote's.
- `doc/guide/ottimizzatore.md` § Per-page blind spots — the model and the optimizer do not read the codes, and a
  code does not make the model «superato». `doc/guide/accumulo.md` § Per-page blind spots — the manual path does
  not offer the pinned instruments.
- `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- `README.md` — Allocazione's and the Consulente's feature lines. `AGENTS.md` § 3 — the stubs of the guides
  touched rewritten at equal or shorter length (decision 47).
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Consulente — gli
  strumenti che scegli tu** — The Consulente reads the specific assets and the ticker or ISIN pinned on the
  targets, keeps them through the review and «Applica», creates at zero the ones not held and buys them by the
  weights given.»
- `CLAUDE.md` — the Consulente's sentence rewritten at equal or shorter length with «it reads the instruments the
  user pinned on the targets and keeps them»; the «Latest» entry REPLACED whole (decision 46: the date, this spec
  in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-20»); under 20.000 characters, counted with `node`.
- `doc/dati/README.md` § 6 (the row of 19 to `implemented`).

## 10. Declared out of scope

- The Consulente proposing or re-weighing specific assets (decision 35) → doc/guide/consulente.md § Per-page blind
  spots.
- A lookup from ISIN to listings without the agent → doc/guide/consulente-piano.md § Per-page blind spots.
- The Portafoglio modello and the optimizer reading the codes → doc/guide/ottimizzatore.md § Per-page blind spots.
- The manual path of Accumulo offering the pinned instruments → doc/guide/accumulo.md § Per-page blind spots.
- The Registra card (DATI-16) reading the quote's type → doc/guide/assistente-registra.md § Per-page blind spots.
- A bond's minimum lot in the plan → DATI-20.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-19-consulente-strumenti-voluti.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi, regole della serie)
- Leggi doc/guide/consulente.md, doc/guide/consulente-piano.md, doc/guide/impostazioni.md,
  doc/guide/allocazione.md, doc/guide/assistente.md, doc/guide/accumulo.md,
  doc/guide/ottimizzatore.md, doc/guide/velocita.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic (i contratti del Consulente): usa la skill claude-api prima di toccare i
  prompt
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: la regola pura (U1–U5, U7, U8, M1), la forma dei
target e Impostazioni con la validazione, settingsNarrative e l'impronta del modello (U6, S1–S3, D1),
il contesto dell'Assistente (C1), «Applica» che conserva e la guardia dopo la revisione (T1–T4, D2), il
passaggio agli strumenti (H1–H5), i fatti del piano, findAdviceInstrument e la riconciliazione con i
pesi imposti (F1, A2, R1–R3), il blocco delle scelte e i contratti di strategia, strumenti, revisione
e piano (P1, P2), la quotazione fino al click — servizio, hook, tipo, nome, ticker (Y1, Y2, A1) —,
poi E1–E3, perf:budget, i documenti del § 9 e la riga 19 di doc/dati/README.md § 6 a `implemented`.
OGNI test del § 6 va visto rosso con la sua mutazione. Il codice dei §§ 4.1, 4.5, 4.6 e la regola del
§ 4.7 sono già scritti: copiali.

Fermati e chiedimi se: un documento dei target salvato si legge diverso dopo la modifica dei tipi, un
test esistente del passaggio agli strumenti cambia esito senza un segno dell'utente sui target,
LEDGER_TYPE_CLASS non esiste in lib/utils/tradeProposal.ts con il nome dell'indice § 7, un
prompt di sistema del Consulente smette di essere identico tra due utenti, un passo del collaudo
chiederebbe una chiamata vera al modello, oppure un tetto di perf:budget si alzerebbe di più di 1 KB gz.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec on a shared shape (the targets document) read by the settings,
the Allocazione page, the Assistente's context and four stages of the Consulente. Estimated size: L (one pure
module, the hand-off rewritten, the guard after the review, the reconcile's new rule, five contracts, the
settings' editors, 37 tests).
