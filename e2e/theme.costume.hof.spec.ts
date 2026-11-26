/**
 * Hall of Fame under a costume (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume, 2026-11-23): the bar of
 * a ranking is a pill — round in Egeo, square under Orbita — and the header draws the page's own Egeo emblem.
 *
 * The FILENAME picks the project: `…hof.spec.ts` runs on the Hall of Fame fixture account, the only one with
 * records. Where `hall-of-fame.hof.spec.ts` ran first in this worker, its first test built the document; in a
 * worker it did not run in — every worker has its own Firestore project — or alone on a fresh seed, this file
 * presses «Aggiorna i record» itself. Alone, that leaves the document behind: that spec's first test, which
 * expects the empty page, then needs a new seed (the next run's `global-setup`). The theme is written on THAT account's preferences and put back.
 *
 * Seen red with `RecordRows` back to `rounded-full` on its track.
 */
import { expect, test } from '@playwright/test';
import { restoreColorThemeOf, setAccountColorTheme, startWith } from './themeEgeo';
import { COSTUMES, WREATH, cornerOf, desktopEmblem, isRoundPill } from './themeCostume';

const UID = 'hof-user';
const BAR_TRACK = '#page-main ul > li div[role="presentation"]';

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.afterAll(() => restoreColorThemeOf(UID));

for (const costume of COSTUMES) {
  test(`${costume}: a ranking's bar takes the pill radius, the header its emblem`, async ({ page }) => {
    await setAccountColorTheme(costume, UID);
    await startWith(page, costume, 'light');
    await page.goto('/dashboard/hall-of-fame');
    // Never `networkidle`: Firestore keeps its sockets open for the life of the page.
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 45_000 });
    if (await page.getByRole('heading', { level: 2, name: 'I record cominciano dal secondo snapshot' }).isVisible()) {
      await page.getByRole('button', { name: 'Aggiorna i record' }).filter({ visible: true }).first().click();
    }
    await expect(page.locator(BAR_TRACK).first()).toBeVisible({ timeout: 30_000 });

    const track = await cornerOf(page, BAR_TRACK);
    const fill = await cornerOf(page, `${BAR_TRACK} > div`);
    if (costume === 'orbita') expect([track, fill]).toEqual(['0px', '0px']);
    else expect([isRoundPill(track ?? undefined), isRoundPill(fill ?? undefined)], `${track} · ${fill}`).toEqual([true, true]);

    const emblem = await desktopEmblem(page);
    if (costume === 'orbita') expect(emblem.circles).toBe(1);
    else expect(emblem.paths).toEqual([WREATH]);
  });
}
