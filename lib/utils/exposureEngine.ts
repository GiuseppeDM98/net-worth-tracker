/**
 * exposureEngine — the ONE formula behind the Esposizione tile's three views, pure and I/O-free.
 * It runs IN THE BROWSER, in a `useMemo`, on the assets the Allocazione page already holds and on
 * the profiles the route answered (doc/perf/PERF-00 § 4.3, owner's decision 2026-09-28):
 *
 *   esposizione[vista][chiave] = Σ_asset Σ_gamba ( valoreGamba × profilo[vista][chiave] )
 *
 * Two questions kept apart. (A) How much an asset puts in each class is `expandAssetExposure`'s
 * answer — composition legs and leverage, deterministic, no external source. (B) What shape an
 * equity sleeve has inside is Yahoo's answer and ONLY Yahoo's: when it has none the sleeve is
 * «non letto», never zero and never an estimate.
 *
 * Two measures. Titoli and Settori answer «how much does the underlying move me», so they run
 * on NOTIONAL (a 2× fund moves twice its price). Emittenti answers «whose paper do I hold», and
 * leverage does not multiply a counterparty: it runs on MARKET value, every quoted instrument once.
 *
 * The base is the Allocazione portfolio (`isExposureBaseAsset`): a held asset that is `tradable`
 * or `frozen`. Every euro of it gets ONE of four destinies per view — read, unread, not
 * applicable, out of this view — and their sum is the measure over every leg of the base, an
 * identity the tests falsify by dropping a branch.
 *
 * Why not on the server: this module imports `expandAssetExposure`, which imports
 * `calculateAssetValue` from `assetService`, which initialises the client SDK at module level.
 * In the browser that graph is already loaded; in a route it would ride into the Lambda.
 */
import type { Asset, AssetClass } from '@/types/assets';
import type {
  ExposureBucket,
  ExposureCoverage,
  ExposureEntry,
  ExposureLegSlice,
  ExposureNotApplicable,
  ExposureSource,
  ExposureViewData,
  InstrumentProfile,
  PortfolioExposure,
} from '@/types/exposure';
import { expandAssetExposure, type ExposureComponent } from '@/lib/utils/assetExposureUtils';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { sectorLabel } from '@/lib/constants/exposureSectors';
import { instrumentTicker, isExposureBaseAsset, isQuotedInstrument, profileModuleFor } from '@/lib/utils/exposureRequests';

// ─── What each class can say about itself ────────────────────────────────────

type LegDestiny = 'lookthrough' | 'outOfView' | 'notApplicable';

/**
 * What Titoli and Settori do with a leg of each class. Only an equity sleeve has a published
 * composition; a bond sleeve is real money outside these two views' question (and is NAMED as
 * such by the coverage line); everything else has no holdings or sectors by nature.
 *
 * WARNING: widening `AssetClass` fails here until the new class declares its destiny — a class
 * missing from this map would drop its EUROS from the identity, not just its label.
 */
const LEG_DESTINY: Record<AssetClass, LegDestiny> = {
  equity: 'lookthrough',
  bonds: 'outOfView',
  crypto: 'notApplicable',
  realestate: 'notApplicable',
  cash: 'notApplicable',
  commodity: 'notApplicable',
  trendFollowing: 'notApplicable',
  carry: 'notApplicable',
};

/** The classes with no security-level look-through by nature; derived from the map so the two can never disagree. */
export const NON_LOOKTHROUGH_ASSET_CLASSES: ReadonlySet<string> = new Set(
  (Object.keys(LEG_DESTINY) as AssetClass[]).filter((assetClass) => LEG_DESTINY[assetClass] === 'notApplicable'),
);

/** A class the map does not know (a document written by a later schema) has no look-through here either. */
function legDestiny(assetClass: string): LegDestiny {
  return LEG_DESTINY[assetClass as AssetClass] ?? 'notApplicable';
}

// ─── Accumulators ────────────────────────────────────────────────────────────

interface BucketAccumulator {
  amount: number;
  /** Asset name → its euros in this bucket, so the coverage line can list the instruments largest first. */
  byInstrument: Map<string, number>;
}

function newBucket(): BucketAccumulator {
  return { amount: 0, byInstrument: new Map() };
}

function addToBucket(bucket: BucketAccumulator, instrumentName: string, amount: number): void {
  bucket.amount += amount;
  bucket.byInstrument.set(instrumentName, (bucket.byInstrument.get(instrumentName) ?? 0) + amount);
}

function finalizeBucket(bucket: BucketAccumulator): ExposureBucket {
  const instruments = Array.from(bucket.byInstrument.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  return { amount: bucket.amount, instruments };
}

/** The «not applicable» bucket also keeps WHY: the class of a quoted leg, or «nobody quotes it». */
interface NotApplicableAccumulator extends BucketAccumulator {
  byClass: Map<string, number>;
  unquoted: number;
}

function newNotApplicable(): NotApplicableAccumulator {
  return { ...newBucket(), byClass: new Map(), unquoted: 0 };
}

function addQuotedLeg(bucket: NotApplicableAccumulator, instrumentName: string, assetClass: string, amount: number): void {
  addToBucket(bucket, instrumentName, amount);
  bucket.byClass.set(assetClass, (bucket.byClass.get(assetClass) ?? 0) + amount);
}

function addUnquoted(bucket: NotApplicableAccumulator, instrumentName: string, amount: number): void {
  addToBucket(bucket, instrumentName, amount);
  bucket.unquoted += amount;
}

function finalizeNotApplicable(bucket: NotApplicableAccumulator): ExposureNotApplicable {
  return { ...finalizeBucket(bucket), byClass: Object.fromEntries(bucket.byClass), unquoted: bucket.unquoted };
}

interface EntryAccumulator {
  label: string;
  caption?: string;
  amount: number;
  sources: ExposureSource[];
}

interface ViewAccumulator {
  measure: ExposureCoverage['measure'];
  entries: Map<string, EntryAccumulator>;
  read: BucketAccumulator;
  unread: BucketAccumulator;
  notApplicable: NotApplicableAccumulator;
  outOfView: BucketAccumulator;
  named: number;
}

function newView(measure: ExposureCoverage['measure']): ViewAccumulator {
  return { measure, entries: new Map(), read: newBucket(), unread: newBucket(), notApplicable: newNotApplicable(), outOfView: newBucket(), named: 0 };
}

function addEntry(view: ViewAccumulator, key: string, label: string, caption: string | undefined, amount: number, source: ExposureSource): void {
  view.named += amount;
  const existing = view.entries.get(key);
  if (existing) {
    existing.amount += amount;
    existing.sources.push(source);
    return;
  }
  view.entries.set(key, { label, caption, amount, sources: [source] });
}

function finalizeView(view: ViewAccumulator): ExposureViewData {
  const entries: ExposureEntry[] = Array.from(view.entries.entries())
    .map(([key, { label, caption, amount, sources }]) => ({ key, label, caption, amount, sources: [...sources].sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.amount - a.amount);
  const read = finalizeBucket(view.read);
  const unread = finalizeBucket(view.unread);
  return {
    entries,
    coverage: {
      measure: view.measure,
      base: read.amount + unread.amount,
      read,
      unread,
      notApplicable: finalizeNotApplicable(view.notApplicable),
      outOfView: finalizeBucket(view.outOfView),
      named: view.named,
    },
  };
}

// ─── The base, expanded once ─────────────────────────────────────────────────

interface BaseAsset {
  asset: Asset;
  /** The asset's own name and display ticker: the ONLY user data in the result, and it never leaves the browser. */
  name: string;
  displayTicker: string;
  quoted: boolean;
  profile: InstrumentProfile | undefined;
  legs: ExposureComponent[];
  marketValue: number;
}

function buildBaseAssets(assets: Asset[], profiles: Record<string, InstrumentProfile>): BaseAsset[] {
  return assets.filter(isExposureBaseAsset).map((asset) => {
    const legs = expandAssetExposure(asset);
    return {
      asset,
      name: asset.name,
      displayTicker: getAssetDisplayTicker(asset),
      quoted: isQuotedInstrument(asset),
      profile: profiles[instrumentTicker(asset)],
      legs,
      marketValue: legs.reduce((sum, leg) => sum + leg.marketValue, 0),
    };
  });
}

// ─── Titoli · Settori: equity sleeves, notional ──────────────────────────────

/** The slices a view reads from an instrument's equity sleeve; null when nothing was read. */
type SliceReader = (base: BaseAsset) => ExposureLegSlice[] | null;

/**
 * A direct stock IS its own holding (weight 1; Yahoo only supplies the label), a fund is read
 * when Yahoo published its holdings. A ticker with no module (a bond, a crypto) has no equity
 * composition to read.
 */
const readHoldings: SliceReader = ({ asset, profile }) => {
  const profileModule = profileModuleFor(asset.type);
  if (profileModule === 'stock') {
    const ticker = instrumentTicker(asset);
    return [{ key: ticker.toUpperCase(), label: profile?.stock?.longName ?? ticker, weight: 1 }];
  }
  if (profileModule === 'fund') return profile?.fund?.holdings?.length ? profile.fund.holdings : null;
  return null;
};

/** A stock is read when Yahoo named a sector; a fund when it published its weights. */
const readSectors: SliceReader = ({ asset, profile }) => {
  const profileModule = profileModuleFor(asset.type);
  if (profileModule === 'stock') {
    const key = profile?.stock?.sectorKey;
    return key ? [{ key, label: sectorLabel(key), weight: 1 }] : null;
  }
  if (profileModule === 'fund') return profile?.fund?.sectors?.length ? profile.fund.sectors : null;
  return null;
};

function accumulateEquityView(baseAssets: BaseAsset[], readSlices: SliceReader, withCaption: boolean): ExposureViewData {
  const view = newView('notional');
  for (const base of baseAssets) {
    for (const leg of base.legs) {
      // A leg of an instrument nobody quotes has nothing to read, whatever its class: a pension
      // fund's 70/30 is the user's own split, not a published composition.
      if (!base.quoted) {
        addUnquoted(view.notApplicable, base.name, leg.notionalValue);
        continue;
      }
      const destiny = legDestiny(leg.assetClass);
      if (destiny === 'outOfView') {
        addToBucket(view.outOfView, base.name, leg.notionalValue);
        continue;
      }
      if (destiny === 'notApplicable') {
        addQuotedLeg(view.notApplicable, base.name, leg.assetClass, leg.notionalValue);
        continue;
      }
      const slices = readSlices(base);
      if (!slices) {
        addToBucket(view.unread, base.name, leg.notionalValue);
        continue;
      }
      addToBucket(view.read, base.name, leg.notionalValue);
      for (const slice of slices) {
        const amount = slice.weight * leg.notionalValue;
        const key = withCaption ? slice.key.toUpperCase() : slice.key;
        addEntry(view, key, slice.label, withCaption ? key : undefined, amount, {
          ticker: base.displayTicker,
          name: base.name,
          amount,
          // A weight of 1 is the instrument itself: «100% di 6000 € = 6000 €» would repeat the figure.
          ...(slice.weight < 1 ? { weight: slice.weight, baseValue: leg.notionalValue } : {}),
        });
      }
    }
  }
  return finalizeView(view);
}

// ─── Emittenti: every quoted instrument once, market value ───────────────────

function accumulateIssuers(baseAssets: BaseAsset[]): ExposureViewData {
  const view = newView('market');
  for (const base of baseAssets) {
    const { asset, profile, marketValue } = base;
    if (!base.quoted) {
      addUnquoted(view.notApplicable, base.name, marketValue);
      continue;
    }
    const profileModule = profileModuleFor(asset.type);
    // A stock's issuer is the company itself, named as Yahoo names it; a fund's is its family.
    // A bond or a crypto is quoted but has no issuer Yahoo knows: «non letto», with its name
    // (owner, 2026-09-28).
    const issuer =
      profileModule === 'stock' ? (profile?.stock?.longName ?? instrumentTicker(asset)) : profileModule === 'fund' ? (profile?.fund?.family ?? null) : null;
    if (!issuer) {
      addToBucket(view.unread, base.name, marketValue);
      continue;
    }
    addToBucket(view.read, base.name, marketValue);
    addEntry(view, issuer, issuer, undefined, marketValue, { ticker: base.displayTicker, name: base.name, amount: marketValue });
  }
  return finalizeView(view);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * The three views of the Esposizione, weighed on `assets` (the whole list: the role is applied
 * here) with the profiles the route answered, keyed by trimmed ticker.
 */
export function computeExposure(assets: Asset[], profiles: Record<string, InstrumentProfile>): PortfolioExposure {
  const baseAssets = buildBaseAssets(assets, profiles);
  return {
    holdings: accumulateEquityView(baseAssets, readHoldings, true),
    sectors: accumulateEquityView(baseAssets, readSectors, false),
    issuers: accumulateIssuers(baseAssets),
    quotedCount: baseAssets.filter((base) => base.quoted).length,
  };
}
