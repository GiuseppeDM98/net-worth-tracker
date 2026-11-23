# DATI-19 — The Consulente reads the instruments the user chose: specific assets kept, a «Ticker o ISIN» on every leaf

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: none by contract; implemented after DATI-08 and
> DATI-09, which edit the same file of the Assistente's prompts (`lib/server/assistant/prompts.ts`).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 13 (added at the end of the planning
> session); decisions 34–38.

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
   parent and it is not saved there. Proof: S1, S2, D1, E1.
2. The Consulente's and the Assistente's context print the third level and the codes. Proof: C1.
3. «Applica» keeps the specific assets and the codes of every sub-category (and class) the proposal keeps, by
   name, and says before the click what leaves with a sub-category the proposal drops. Proof: T1–T3, D2, E2.
4. The plan names every specific asset and every coded leaf: a held one is matched (ISIN, then ticker, then the
   Allocazione page's name rule); one not held with a code is created at 0 quotes by «Applica» and bought; one not
   held without a code is out of the plan, and the plan says so in one sentence. Proof: H1–H4, F1, R1.
5. A ticker fixes listing and currency: the instrument is created with that symbol, in the quote's currency. An
   ISIN alone leaves the listing to the exchange of the interview. Proof: H2, A1.
6. A new instrument's type follows its quote: a share is a `stock`, a fund an `etf`. Proof: A1, Y1.
7. The strategy does not rename, replace or re-weigh what the user chose; the instruments' agent verifies only the
   chosen instruments that have an ISIN alone and proposes no other candidate for that sleeve. Proof: P1, P2.
8. The specific assets split their sub-category's share of the plan by the weights the user gave. Proof: F1, P3.
9. Allocazione matches a specific asset by its code too. Proof: M1.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run`, `npm run
    perf:budget` green; E1, E2 green.

## 3. Decisions

- **Decision 34** (owner, 2026-11-23): the Consulente is fixed in this series, the four improvements in one spec.
- **Decision 35** (owner): the Consulente READS the specific assets and leaves them as they are — it decides
  classes and sub-categories only; «Applica» keeps them where the sub-category stays and says what it removes.
- **Decision 36** (owner, after asking for the field on the upper levels too): the optional «Ticker o ISIN» sits
  on the lowest open level — class, sub-category or specific asset.
- **Decision 37** (owner): a specific asset with a ticker or an ISIN that is not held is created at 0 quotes and
  bought by the plan, by the weight it has in its sub-category.
- **Decision 38** (owner): one without ticker and ISIN that is not held stays out of the plan, said in one line.
- Adopted, reversible:
  - (a) one field, one string: twelve characters that read as an ISIN are an ISIN, anything else is a Yahoo
    ticker; upper-cased, at most 20 characters of `A-Z 0-9 . - = ^`.
  - (b) a ticker fixes listing and currency (a Nasdaq symbol is in dollars, «.MI» in euro); the owner asked how
    a purchase in dollars reaches the Consulente: through the ticker.
  - (c) an ISIN written in a sub-category's name («Nome (IE…)») is read as that leaf's code while the field is
    empty.
  - (d) the kept levels are found by name, case- and space-insensitively; a renamed sub-category is a dropped one.
  - (e) the weights of the specific assets reach the plan's stage as facts and by contract; the reconcile does not
    enforce them.
  - (f) the new instrument's type comes from Yahoo's `quoteType` at the click; without a quote it is `stock` for a
    specific asset, `etf` for a coded class or sub-category, `bond` and `crypto` as today.
  - (g) no field on `cash` and `realestate` (the plan never searches them).
  - (h) the web-search ceiling of the instruments' stage stays 20: the chosen instruments with an ISIN alone are
    verified first.

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
export const INSTRUMENT_CODE_INVALID = 'Ticker o ISIN non valido: lettere, cifre, punto e trattino, al massimo 20 caratteri.';

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

/** Every leaf of the targets, in the document's order. */
export function listTargetLeaves(targets: AssetAllocationTarget | null | undefined): TargetLeaf[] {
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
      const inName = isinInName(subCategory);
      leaves.push({ assetClass, subCategory, pctOfParent: pctOf(value), code: written ?? (inName ? { isin: inName } : null) });
    }
  }
  return leaves;
}

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

/** The type a leaf's instrument is created with before a quote says better. */
export function typeOfLeaf(leaf: TargetLeaf): AssetType {
  if (leaf.assetClass === 'crypto') return 'crypto';
  if (leaf.assetClass === 'bonds' && !leaf.code?.ticker && /^(IT|XS)/.test(leaf.code?.isin ?? '')) return 'bond';
  return leaf.specificName !== undefined ? 'stock' : 'etf';
}

/** Yahoo's `quoteType` as an asset type; null when it says nothing the app distinguishes. */
export function instrumentTypeFromQuote(quoteType: string | undefined): AssetType | null {
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

/**
 * `next` (the targets a proposal describes: classes and sub-categories as numbers) with the user's
 * third level and codes carried over from `current` wherever the level survives by name; `dropped`
 * is what leaves with a level the proposal no longer has.
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
      const old = beforeSubs.find(([oldName]) => norm(oldName) === norm(name))?.[1];
      const code = isObject(old) ? normalizeInstrumentCode(old.instrument) : '';
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
      const code = isObject(value) ? normalizeInstrumentCode(value.instrument) : '';
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
  return listTargetLeaves(targets).filter((leaf) => leaf.specificName !== undefined || leaf.code !== null).length;
}

/** «Azioni › Tematici: Alfa, Beta escono dai target con la sottocategoria.» */
export function describeDroppedInstruments(row: DroppedInstruments, classLabel: string): string {
  const where = row.subCategory ? `${classLabel} › ${row.subCategory}` : classLabel;
  const verb = row.names.length === 1 ? 'esce' : 'escono';
  return `${where}: ${row.names.join(', ')} ${verb} dai target con la ${row.subCategory ? 'sottocategoria' : 'classe'}.`;
}
```

### 4.2 The targets' shape and Impostazioni

- `types/assets.ts`: `SpecificAssetAllocation.instrument?: string`, `SubCategoryTarget.instrument?: string`, the
  class entry of `AssetAllocationTarget` gains `instrument?: string` — each «the user's Ticker o ISIN for this
  leaf, upper-cased (`lib/utils/targetInstruments.ts`)». No new settings key: the field lives inside `targets`,
  which every writer already replaces whole.
- `lib/utils/settingsDraft.ts`: `SpecificAssetDraft`, `SubTargetDraft` and `AssetClassDraft` gain `instrument:
  string` (`''` when absent; read in `toSubTargetDrafts`, `:242-256`, and where the class draft is built). The
  save writes leaves only (`:494-503`):

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

  and the class entry gets `instrument` only when it has no sub-category rows and the code is valid. The dirty
  check's projection (`:612-624`) carries `instrument` at the three levels. Ids for the fields:
  `target-{class}-instrument`, `target-{class}-sub-{i}-instrument`, `target-{class}-sub-{i}-asset-{j}-instrument`.
- `lib/utils/allocationTargetValidation.ts`: a non-empty field `parseInstrumentCode` refuses is a problem on its id,
  `INSTRUMENT_CODE_INVALID`.
- `components/settings/allocation/AllocationClassEditor.tsx` and `SubTargetEditor.tsx`: an input «Ticker o ISIN»
  (placeholder «es. ALFA.MI o IE00…», `maxLength` 20, upper-cased on blur) beside the percentage of a leaf — the
  class while «Abilita sottocategorie» is off (not on `cash`, `realestate`), the sub-category while «Traccia asset
  specifici» is off, each specific asset. Under the first field of a class, once: «Facoltativo: lo strumento che
  vuoi qui. Un ticker fissa listino e valuta (un simbolo del Nasdaq è in dollari); un ISIN lascia il listino alla
  borsa che indichi al Consulente.» The field takes the row's second line below `desktop:`.

### 4.3 The context — Assistente and Consulente

- `lib/utils/assistantPortfolioContext.ts`: `AssistantTargetRow` gains `instrument?: string`;
  `AssistantTargetSubRow` gains `instrument?: string` and `specific?: { name: string; targetPctOfSub: number;
  instrument?: string; held: boolean }[]`. `buildTargetRows` (`:462-511`, called at `:453`) takes the assets and fills them from
  `listTargetLeaves({ [assetClass]: target })`: a class leaf's code on the row; a sub-category's code on its
  sub-row; the specific assets with `held = (findLeafAsset(leaf, assets)?.quantity ?? 0) > 0`.
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
  sottocategoria, con il loro peso.)`. No system prompt of the Assistente changes.

### 4.4 The Consulente's contracts — `lib/server/allocationAdvice/prompts.ts`

- Strategy, appended to the «Vincoli» paragraph (`:170`):
  `Una riga «·» sotto un sotto-target è un asset specifico che l'utente ha scelto da sé, con il suo peso nella
  sottocategoria: non lo cambi, non lo ripesi e non ne proponi altri; se tieni quel sotto-target ne ricopi il nome
  ESATTO e non scrivi "instrument"; se lo togli, di' nel testo che i suoi asset specifici escono con lui.
  «strumento voluto: X» accanto a una classe o a un sotto-target è lo strumento che l'utente vuole lì: tieni il nome
  ESATTO del sotto-target e scrivi X in "instrument"; se lo ritieni inadatto dillo nel testo, ma resta quello.`
- Instruments: `buildInstrumentsPrompt(answers, proposal, holdingsBlock, userTargets: AssistantTargetRow[] | null)`
  — the caller passes `bundle.portfolio.allocation.targets` (`run.ts:377`). Each sleeve line (`:464-466`) ends
  with the pins of the sub-row of the same class and name (case- and space-insensitive; the class row for a class
  without sub-targets): ` | strumento voluto dall'utente: X`, or ` | asset specifici scelti dall'utente: Alfa
  [ALFA.MI] 60%, Beta [IE00…] 25%, Gamma (senza codice) 15%`. One paragraph is added to the contract after `:446`:
  `Uno «strumento voluto dall'utente» e gli «asset specifici scelti dall'utente» non si sostituiscono e per quel
  sotto-target non proponi altri candidati. Sono i candidati del loro sotto-target, con il nome che l'utente ha
  scritto: per quelli che non possiede e che hanno il solo ISIN verifica per primi quotazione sulla borsa indicata
  e simboli di Yahoo Finance; quelli con un ticker non li cerchi, il ticker fissa già listino e valuta; quelli
  senza codice non li cerchi. Un asset specifico può essere un'azione.`
- Plan, `PLAN_CONTRACT` (after the line on `targetPercentage`, `:677`): `Le righe con «peso voluto nella
  sotto-categoria» sono asset specifici scelti dall'utente: si dividono la quota della loro sotto-categoria in
  proporzione a quei pesi. Gli strumenti sotto «Fuori dal piano» non hanno una riga: nominali in "departures".`

### 4.5 «Applica» keeps what the user chose — `lib/utils/allocationAdviceApply.ts`, the book

- `buildTargetsFromProposal(proposal, current?: AssetAllocationTarget | null)`: the loop of today, then
  `return current ? preserveUserInstruments(targets, current).targets : targets;`.
- The three callers pass the live targets: the write (`ConsulenteReport.tsx:270`, `settings?.targets ?? null`), the
  plan's effective targets (`:171`), the stage's reserve (`run.ts:501`, `settings?.targets ?? null`).
- The tick «I target» (`ConsulenteBookPages.tsx:442-446`) gains, under its label, from
  `preserveUserInstruments(buildTargetsFromProposal(proposal), settings?.targets ?? null)`: «Restano i {n}
  strumenti che hai scelto tu.» when `countUserInstruments(targets) > 0` («Resta lo strumento che hai scelto tu.»
  for one), and one `describeDroppedInstruments` line per dropped row, in the warning tone.

### 4.6 The hand-off — `lib/utils/allocationAdviceHandoff.ts`

`ConsulenteHandoffPlan` gains `outOfPlan: Array<HandoffRow & { name: string }>`; a `matched` and a `toCreate` row
gain `wantedPct?: number`. The function, whole (the last branch is today's code, unchanged):

```ts
export function planConsulenteHandoff(proposal: AllocationAdviceProposal, candidates: InstrumentCandidates | null,
  keepAssets: readonly string[], assets: readonly Asset[], userTargets: AssetAllocationTarget | null = null): ConsulenteHandoffPlan {
  const out: ConsulenteHandoffPlan = { matched: [], toCreate: [], unnamed: [], notBuyable: [], outOfPlan: [], keepAssetIds: [] };
  // The targets «Applica» would write: the proposal's, with the user's third level and codes where the level stays.
  const leaves = listTargetLeaves(buildTargetsFromProposal(proposal, userTargets));
  const place = (row: HandoffRow, asset: Asset, wantedPct?: number) => {
    if (!isPlanBuyable(asset, assets)) out.notBuyable.push({ ...row, assetId: asset.id, name: asset.name });
    else if (!out.matched.some((m) => m.assetId === asset.id)) {
      out.matched.push({ ...row, assetId: asset.id, name: asset.name, held: asset.quantity > 0, ...(wantedPct !== undefined ? { wantedPct } : {}) });
    }
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
        && (leaf.specificName !== undefined || leaf.code !== null));
      if (pinned.length > 0) {
        for (const leaf of pinned) {
          const wantedPct = leaf.specificName !== undefined ? leaf.pctOfParent : undefined;
          const asset = findLeafAsset(leaf, assets);
          if (asset) { place(row, asset, wantedPct); continue; }
          const candidate = list.find((c) => !!leaf.code?.isin && (c.isin ?? '').toUpperCase() === leaf.code.isin)
            ?? list.find((c) => !!leaf.code?.ticker && (c.ticker ?? '').toUpperCase() === leaf.code.ticker)
            ?? null;
          const name = leaf.specificName?.trim() || candidate?.name || splitNamed(sub.instrument ?? '').head || nameWithoutCode(sub.name);
          // Not held and no code: nothing to price or buy (owner, 2026-11-23).
          if (!leaf.code) { out.outOfPlan.push({ ...row, name }); continue; }
          if (out.toCreate.some((c) => norm(c.name) === norm(name))) continue;
          out.toCreate.push({ ...row, name, ...(wantedPct !== undefined ? { wantedPct } : {}), prefill: {
            name, ticker: leaf.code.ticker ?? candidate?.ticker ?? '', isin: leaf.code.isin ?? candidate?.isin,
            type: typeOfLeaf(leaf), assetClass: cls.assetClass, subCategory: hasSubs ? sub.name : '' } });
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

- `lib/utils/operatingPlan.ts`: `OperatingPlanInstrument.wantedPct?: number` («a specific asset's weight in its
  sub-category, as the user set it»); `OperatingPlanFacts.outOfPlan?: string[]`; `OPERATING_PLAN_COPY.outOfPlan =
  (name: string) => `${name} non ha un ticker né un ISIN: il piano non lo compra.``; in `reconcileOperatingPlan`,
  last before the result (`:401`): `for (const name of facts.outOfPlan ?? []) corrections.push(OPERATING_PLAN_COPY.outOfPlan(name));`
  — the click's refreshed facts carry none, and the stored sentence stays among the notes.
- `lib/utils/operatingPlanFacts.ts`: `OperatingPlanFactsInput.userTargets: AssetAllocationTarget | null`, passed
  to the hand-off (`:51`); a held key takes `wantedPct` from its `matched` row, a new one from its `toCreate` row
  (`:69-85`); the result carries `outOfPlan: handoff.outOfPlan.map((row) => row.name)`. The server passes
  `settings?.targets ?? null` (`run.ts:489-496`).
- `lib/server/allocationAdvice/prompts.ts`, `formatOperatingPlanFacts` (`:627-661`): a held and a new row with
  `wantedPct` end with ` · peso voluto nella sotto-categoria {n}%`; a fourth section, printed only when it has
  rows: «Fuori dal piano (asset specifici non posseduti, senza ticker né ISIN):» with the names.
- The type at the click: `lib/services/yahooFinanceService.ts` `getQuote` returns `quoteType` beside the price
  (`...(quote.quoteType ? { quoteType: quote.quoteType } : {})`, `:49-54`; the route spreads it, `quote/route.ts:67`);
  `RawQuote` and `AdviceQuote` gain `quoteType?: string` and `pickFreshQuote` carries it
  (`lib/utils/advicePlan.ts:69-83`); in `newInstrumentFormData` (`:118`): `type:
  instrumentTypeFromQuote(priced?.quoteType) ?? prefill.type`. The currency, the symbol and the euro price are
  already the quote's (`:117-126`).
- `lib/services/assetAllocationService.ts`, `findMatchingAssets` (`:758-778`): takes the specific asset, not its
  name, and filters with `matchesSpecificAsset` (§ 4.1) — the service is Firestore-coupled and has no unit test, the
  rule lives in the pure module.

## 5. Constraints and traps

- **«Applica» replaces the targets document** (doc/guide/consulente-piano.md § The book and «Applica»): whatever
  the merge does not carry is lost; `preserveUserInstruments` is the only place that decides it.
- **Settings — the places** (doc/guide/impostazioni.md): `instrument` is NOT a settings key; it travels inside
  `targets`. Check the draft's read, write and dirty projection, the three of them.
- **A sub-target stored as an object without specific assets** is new: `subTargetPct`, `hasSpecificAssetTracking`
  (`allocationUtils.ts:254-265`) and the optimizer's test (`weightOptimizer.ts:305`) already read it right; U6
  holds them.
- **A system prompt is static** (index § 8): the pins go in the user content; the three contract paragraphs are
  constants.
- **Never an asset id, a tax rate or a held ISIN in the plan's block**: a code is printed for what the user wrote,
  on the targets block and on the «new» rows only.
- **The hand-off runs on the server and its result is stored**; the click re-matches by ISIN, then name
  (`findAdviceInstrument`): a ticker-coded instrument created by a first press is found by its name on a second.
- **The Consulente's route keeps `advicePlan.ts` out of its first load**; `targetInstruments.ts` imports types
  only, so the settings and the context can load it.
- **No call that spends** in a test or a probe: the stages are faked as today (doc/guide/consulente-piano.md).
- **No owner data**: «Alfa» (ALFA.MI), «Beta» (BETA, in dollars), «Gamma» (no code), ISIN `IE00TEST0017`.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/targetInstruments.test.ts` (new) | `parseInstrumentCode`: «alfa.mi» → ticker ALFA.MI; `IE00TEST0017` → ISIN; empty, 21 characters, a space inside → null | ISIN read as a ticker |
| U2 | unit · same | `listTargetLeaves`: a class leaf, a sub-category leaf with a code, three specific assets with their weights; an ISIN in a sub-category's name is its code while the field is empty, the field wins | name read before the field |
| U3 | unit · same | `findLeafAsset`: by ISIN; by ticker exactly before the bare symbol (BETA beside BETA.MI); a specific asset by the name rule inside its class and sub-category only; a held one before one at 0 | bare match first |
| U4 | unit · same | `preserveUserInstruments`: the specific assets and the codes follow a kept sub-category (case-insensitive) with the NEW percentage; a class code survives only leaf to leaf | old percentage kept |
| U5 | unit · same | `dropped`: a removed sub-category with specific assets, a renamed one, a coded class that gets sub-targets; `describeDroppedInstruments` singular and plural | dropped left empty |
| U6 | unit · `__tests__/allocationUtils.test.ts`, `__tests__/weightOptimizer.test.ts` | `{ targetPercentage, instrument }` reads as its percentage, opens no third level, raises no optimizer note | object taken for a tracked level |
| S1 | unit · `__tests__/settingsDraft.test.ts` | the draft reads the three codes; the save writes a leaf's code upper-cased, a number when there is none, nothing on a class with sub-categories nor on a sub-category with specific assets | parent's code written |
| S2 | unit · `__tests__/allocationTargetValidation.test.ts` | a malformed code is a problem on its field's id; an empty one is not | empty refused |
| C1 | unit · `__tests__/assistantPortfolioContext.test.ts`, `__tests__/assistantTargetsBlock.test.ts` (new) | the rows carry `instrument` and `specific` with `held`; the block prints «strumento voluto», the «·» rows with their three states and the legend line; no legend without pins | third level not printed |
| T1 | unit · `__tests__/allocationAdviceApply.test.ts` | `buildTargetsFromProposal(proposal, current)` keeps the third level and the codes; without `current` it is today's output byte for byte | numbers only |
| T2 | unit · same | a sub-category the proposal drops loses them | carried to another sub-category |
| H1 | unit · `__tests__/allocationAdviceHandoff.test.ts` | a sub-category with three specific assets: the held one matched with `wantedPct`, the coded one in `toCreate` (type `stock`, its sub-category), the uncoded one in `outOfPlan`; the report's `instrument` is ignored there | report's instrument wins |
| H2 | unit · same | a ticker-coded leaf: `prefill.ticker` is the code; an ISIN-coded one takes the candidate's ticker and name; a coded class without sub-targets | candidate's ticker over the user's |
| H3 | unit · same | a coded sub-category held by ISIN is matched, never created | created twice |
| H4 | unit · same | without `userTargets`, and for a level with no pin, the result equals today's on the existing fixtures | unchanged branch touched |
| F1 | unit · `__tests__/operatingPlanFacts.test.ts`, `__tests__/allocationAdvicePrompts.test.ts` | the keys carry `wantedPct`, the facts `outOfPlan`; the block prints «peso voluto…» and the section «Fuori dal piano» only when it has rows | section always printed |
| R1 | unit · `__tests__/operatingPlan.test.ts` | the reconcile adds one sentence per `outOfPlan` name; run twice it adds none; without the field, none | sentence repeated |
| P1 | unit · `__tests__/allocationAdvicePrompts.test.ts` | the strategy's and the plan's contracts hold the new paragraphs; each system is identical for two users | paragraph in the user content |
| P2 | unit · same | the instruments' sleeve lines end with the pins of the same class and name; a sleeve with no pin is today's line | pins on every sleeve |
| P3 | unit · same | `buildInstrumentsPrompt` with `null` targets is today's output | — |
| A1 | unit · `__tests__/advicePlan.test.ts` | a `new` instrument priced by a quote in USD with `quoteType: 'EQUITY'` is created as `stock`, in USD, with its euro price; `'ETF'` → `etf`; no `quoteType` → the prefill's type | prefill's type always |
| Y1 | unit · `__tests__/yahooFinanceService.test.ts` | `getQuote` returns the `quoteType` of the mocked quote | field dropped |
| M1 | unit · `__tests__/targetInstruments.test.ts` | `matchesSpecificAsset`: the name rule as today; a row whose name matches nothing is found by its ISIN and by its ticker; never outside its class and sub-category | code ignored |
| D1 | dom · `__tests__/subTargetEditor.test.tsx` (new) | the field shows on a leaf and hides when its level opens; the helper line shows once | field on a parent |
| D2 | dom · `__tests__/consulenteBook.test.tsx` | the tick «I target» says how many chosen instruments stay and names what leaves | no line |
| E1 | e2e · `e2e/settings.spec.ts` | type a code on a sub-category, save, reload: it is there upper-cased; a malformed one blocks the save with its message | — |
| E2 | e2e · `e2e/allocation.consulente.plan.spec.ts` | targets seeded with two specific assets (one held, one coded) and the faked report: the tick says they stay, «Applica» leaves them in Impostazioni, the coded one exists at 0 quotes and has its row in Accumulo | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: after «Applica» on a faked report, Impostazioni still shows the specific assets
with their weights and codes; the instrument chosen with a ticker exists at 0 quotes in its quote's currency and
Accumulo lists it; the one without a code is named as out of the plan.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390 (the stages faked, no call
  that spends): B the fields in Impostazioni on the three levels, saved and reloaded; C «Applica» with a kept and a
  dropped sub-category (the two lines of the tick, the document after); D the plan's page and Accumulo (the new
  instruments, «Fuori dal piano»); E the shared account and a targets document with no third level (today's
  behaviour, unchanged). Decoys: «ornitorinco» (a code on a class WITH sub-categories: no field) and «fenicottero»
  (a specific asset without a code and not held: no row in Accumulo).
- F — at the owner's «pronto», on his account: one run of the Consulente (it spends, by his hand), the context's
  third level read in the report, «Applica», the targets and Accumulo after.

## 8. Putting it into service

No rules, no index, no migration: the three fields are optional and absent on every stored document. The stored
reports written before keep working (the hand-off without pins is today's). Release note: the owner re-enters the
codes once, and may take the ISIN out of a sub-category's name after writing it in the field.

## 9. Documentation

- `doc/guide/consulente.md` — § The schemas: the pins (what the strategy reads, what it may not change); § blind
  spots: a renamed sub-category is a dropped one; the weights of the specific assets are not enforced by the
  reconcile; a bare-ticker match may find another listing of the same symbol already held; the search ceiling.
- `doc/guide/consulente-piano.md` — the hand-off's first branch, `wantedPct`, «Fuori dal piano», the type from
  `quoteType`; «Applica» keeps the third level (`preserveUserInstruments`).
- `doc/guide/impostazioni.md` — the «Ticker o ISIN» of a leaf, inside `targets`.
- `doc/guide/allocazione.md` — a specific asset matched by its code too.
- `doc/guide/assistente.md` — the targets block's third level.
- `README.md` — Allocazione's and the Consulente's feature lines. `AGENTS.md` § 3 — the stubs touched.
- `CLAUDE.md` — Allocazione › Consulente: «it reads the instruments the user chose on the targets and keeps them
  (2026-11)», under 20.000 characters.
- `Draft Release Temp.md` — «Consulente: legge gli asset specifici e il ticker o l'ISIN che segni sui target, li
  conserva con "Applica" e crea a zero quelli che non possiedi».
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- The Consulente proposing or re-weighing specific assets (decision 35) → doc/guide/consulente.md § blind spots.
- Enforcing the specific assets' weights in the reconcile → doc/guide/consulente-piano.md § blind spots.
- A lookup from ISIN to listings without the agent → doc/guide/consulente-piano.md § blind spots.
- The Portafoglio modello and the optimizer reading the codes → doc/guide/ottimizzatore.md § blind spots.
- The manual path of Accumulo offering the pinned instruments → doc/guide/accumulo.md § blind spots.

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
  doc/guide/allocazione.md, doc/guide/assistente.md e doc/guide/accumulo.md PRIMA di scrivere codice in
  quei domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
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

Implementa la spec così com'è scritta, nell'ordine: la regola pura con U1–U5 (ognuno visto rosso con la
sua mutazione), la forma dei target e Impostazioni (U6, S1, S2, D1), il contesto (C1), «Applica» che
conserva (T1, T2, D2), il passaggio agli strumenti (H1–H4), i fatti del piano e la riconciliazione (F1,
R1), i tre contratti (P1–P3), il tipo dalla quotazione (A1, Y1), l'abbinamento in Allocazione (M1), poi
E1 ed E2. Il codice dei §§ 4.1 e 4.6 è già scritto: copialo.

Fermati e chiedimi se: un documento dei target salvato si legge diverso dopo la modifica dei tipi, un
test esistente del passaggio agli strumenti cambia esito senza un segno dell'utente sui target, oppure un
passo del collaudo chiederebbe una chiamata vera al modello.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on a shared shape (the targets document) read by the settings,
the Allocazione page, the Assistente's context and three stages of the Consulente. Estimated size: L (one pure
module, the hand-off rewritten, three contracts, the settings' editors, 27 tests).
