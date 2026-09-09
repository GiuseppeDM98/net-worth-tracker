/**
 * Calcolatore FIRE — desktop regressions that only a real browser can catch.
 *
 * Runs on the BASE account (test-user-1), whose FIRE figures depend on the run month (the
 * cashflow fallback annualizes the current year), so these tests assert STRUCTURE and FORMAT,
 * never exact amounts: the verdict is one of the headlines the narrative can produce, the
 * Traguardo's hero is a well-formed euro amount, the Scenari|Ventaglio toggle actually swaps the
 * chart (via the charts' aria-labels), and the Parametri disclosure really opens and closes
 * (measured by height — a collapsed region can still be "visible" to Playwright, AGENTS →
 * Browser-Driven E2E).
 *
 * The arithmetic (accumulation engine, percentiles, coherence with the deterministic
 * projection) lives in __tests__/monteCarloService.test.ts, the words in
 * __tests__/fireNarrative.test.ts — not here.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * A euro amount without cents as Intl prints it: a (non-breaking) space before €, the integer
 * part either dot-grouped ("604.000") or — Italian CLDR gives `minimumGroupingDigits = 2` —
 * plain up to four digits ("3270"). Anchored so "1821" can never pass as "821".
 */
const EURO_AMOUNT = /^(\d{1,3}(\.\d{3})+|\d{1,4})[\s ]*€$/;

/** Every headline `buildFireVerdict` can produce on an account with assets. */
const VERDICT_HEADLINE = /^(FIRE nel \d{4}(, a \d+ anni)?|Sei già FIRE|FIRE oltre i \d+ anni|Proiezione non disponibile|Numero FIRE non calcolabile|Nessun patrimonio FIRE)\.$/;

async function gotoFire(page: Page): Promise<void> {
  await page.goto('/dashboard/fire-simulations');
  // The Reddito passivo tile is the last thing to settle; waiting on its eyebrow makes every
  // later assertion stable. Text matched on textContent, so the CSS uppercase is irrelevant.
  await expect(page.getByRole('region', { name: 'Reddito passivo sostenibile' })).toBeVisible({ timeout: 30_000 });
}

test('the verdict and the Traguardo render: a rule headline and a well-formed FIRE number', async ({ page }) => {
  await gotoFire(page);

  const verdict = page.getByRole('region', { name: 'Verdetto sul FIRE' });
  await expect(verdict.getByRole('heading', { level: 2 })).toHaveText(VERDICT_HEADLINE);

  // The hero figure is the FIRE number: the span right after the «Numero FIRE» sub-eyebrow (the
  // reading line above it also carries mono spans, so «first mono span» would read the reading).
  // The count-up animates through valid formats, so the final state also matches — never "—".
  const traguardo = page.getByRole('region', { name: 'Traguardo FIRE' });
  await expect(traguardo.locator('p:has-text("Numero FIRE") + span')).toHaveText(EURO_AMOUNT);
  await expect(traguardo.getByRole('progressbar', { name: 'Progresso verso il numero FIRE' })).toBeVisible();

  // Four tiles, one question each.
  for (const name of ['Base di calcolo del FIRE', 'Reddito passivo sostenibile', 'Scenari di mercato']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
});

test('the Scenari | Ventaglio toggle swaps the projection chart inside the Traguardo', async ({ page }) => {
  await gotoFire(page);

  const scenariChart = page.locator('[role="img"][aria-label*="proiezione scenari"]');
  const fanChart = page.locator('[role="img"][aria-label*="Ventaglio Monte Carlo"]');
  const toggle = page.getByRole('group', { name: 'Vista della proiezione' });

  // Default view: deterministic scenarios, no fan mounted.
  await expect(scenariChart).toBeVisible({ timeout: 15_000 });
  await expect(fanChart).toHaveCount(0);

  // Switch to Ventaglio: the fan replaces the scenario chart (same tile, one chart at a time).
  await toggle.getByRole('button', { name: 'Ventaglio' }).click();
  await expect(toggle.getByRole('button', { name: 'Ventaglio' })).toHaveAttribute('aria-pressed', 'true');
  await expect(fanChart).toBeVisible({ timeout: 15_000 });
  await expect(scenariChart).toHaveCount(0);

  // The tile's footer states the cumulative FIRE probability.
  await expect(page.getByRole('region', { name: 'Traguardo FIRE' }).getByText(/Probabilità di FIRE entro il/)).toBeVisible();

  // And back.
  await toggle.getByRole('button', { name: 'Scenari' }).click();
  await expect(scenariChart).toBeVisible({ timeout: 15_000 });
  await expect(fanChart).toHaveCount(0);
});

test('the Parametri disclosure opens and closes, measured by height', async ({ page }) => {
  await gotoFire(page);

  // Radix stamps data-state + aria-controls on the trigger. The initial state depends on the
  // account (config-first opens it when no SWR is saved), so the test drives a full cycle
  // from whatever state it finds.
  // The trigger's accessible name is its visible text (eyebrow + description), so «Anteprima non
  // salvata» reaches a screen reader; the spec matches the eyebrow.
  const trigger = page.getByRole('button', { name: /^Parametri/ });
  await expect(trigger).toBeVisible();
  const contentId = await trigger.getAttribute('aria-controls');
  expect(contentId).toBeTruthy();
  const content = page.locator(`[id="${contentId}"]`);

  const measuredHeight = async (): Promise<number> => {
    if ((await content.count()) === 0) return 0;
    return content.evaluate((el) => el.getBoundingClientRect().height);
  };

  // Normalize to open.
  if ((await trigger.getAttribute('data-state')) === 'closed') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
  // Open panel really contains the SWR input and the scenario parameters.
  await expect(page.getByLabel('Safe Withdrawal Rate (%)')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Parametri degli scenari' })).toBeVisible();

  // Close: the content collapses to (near) zero height or unmounts entirely.
  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'closed');
  await expect.poll(measuredHeight).toBeLessThan(1);

  // Re-open: the cycle is symmetric.
  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
});

test('the pension-lock switch in Base di calcolo persists and is reflected in the verdict', async ({ page }) => {
  await gotoFire(page);

  const lockSwitch = page.getByRole('switch', { name: 'Considera il fondo pensione come capitale bloccato fino allo sblocco' });
  await expect(lockSwitch).toBeVisible();
  const initial = (await lockSwitch.getAttribute('aria-checked')) === 'true';

  // Flip, and expect the saved-state toast (the switch saves on change).
  await lockSwitch.click();
  await expect(page.getByText(initial ? 'Fondo pensione considerato disponibile' : 'Fondo pensione considerato bloccato')).toBeVisible({ timeout: 10_000 });
  await expect(lockSwitch).toHaveAttribute('aria-checked', String(!initial));

  // The setting survives a reload: it was written, not previewed.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Reddito passivo sostenibile' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('switch', { name: 'Considera il fondo pensione come capitale bloccato fino allo sblocco' })).toHaveAttribute('aria-checked', String(!initial));

  // Restore the fixture's state so the Coast spec reads what it seeded.
  await page.getByRole('switch', { name: 'Considera il fondo pensione come capitale bloccato fino allo sblocco' }).click();
  await expect(page.getByText(initial ? 'Fondo pensione considerato bloccato' : 'Fondo pensione considerato disponibile')).toBeVisible({ timeout: 10_000 });
});
