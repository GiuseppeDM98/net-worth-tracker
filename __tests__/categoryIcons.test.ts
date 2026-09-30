/**
 * Every curated category icon loads the lucide icon it names (PERF-04, 2026-09-30).
 *
 * The category icons load one chunk per icon through a hand-kept map of deep paths
 * (`components/expenses/categoryIconLoaders.ts`). A name with no loader renders the fallback in
 * silence and a loader pointing at the wrong file draws the wrong icon in silence, so this test is
 * the only thing that stops either: the curated names and the loaders are the same list, and each
 * loader yields the same drawing as lucide's own map (`dynamicIconImports`, keyed by kebab name,
 * aliases included) — the reference a lucide upgrade cannot move without this going red.
 */
import { describe, expect, it } from 'vitest';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { CATEGORY_ICON_NAMES, CATEGORY_ICONS_BY_TYPE, CATEGORY_ICONS } from '@/lib/constants/categoryIcons';
import { CATEGORY_ICON_LOADERS } from '@/components/expenses/categoryIconLoaders';

/** lucide's kebab key: `UtensilsCrossed` → `utensils-crossed`, `BarChart2` → `bar-chart-2`. */
const toLucideKey = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();

type IconModule = { default: unknown; __iconNode: unknown };
const lucideMap = dynamicIconImports as unknown as Record<string, (() => Promise<IconModule>) | undefined>;

describe('category icon loaders', () => {
  it('curates 121 icons, and the loaders are exactly those names', () => {
    expect(CATEGORY_ICON_NAMES).toHaveLength(121);
    expect(Object.keys(CATEGORY_ICON_LOADERS).sort()).toEqual([...CATEGORY_ICON_NAMES].sort());
  });

  it.each(CATEGORY_ICON_NAMES)('%s loads the icon lucide files under its name', async (name) => {
    const reference = lucideMap[toLucideKey(name)];
    expect(reference, `lucide has no icon «${toLucideKey(name)}»`).toBeDefined();
    const [loaded, expected] = await Promise.all([
      CATEGORY_ICON_LOADERS[name]() as unknown as Promise<IconModule>,
      reference!(),
    ]);
    expect(loaded.default).toBeTruthy();
    expect(loaded.__iconNode).toEqual(expected.__iconNode);
  });

  it('lists by type only icons of the curated set', () => {
    const outside = Object.values(CATEGORY_ICONS_BY_TYPE).flat().filter((name) => !(name in CATEGORY_ICONS));
    expect(outside).toEqual([]);
  });
});
