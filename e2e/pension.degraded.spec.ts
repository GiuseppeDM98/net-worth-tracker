/**
 * Previdenza — i tre stati in cui il rendimento NON è una misura.
 *
 * La fixture principale descrive un fondo che va bene, e da quei dati i rami degradati sono
 * irraggiungibili: la tessera Rendimento mostra sempre una percentuale e il Dettaglio contiene
 * sempre la scomposizione. Sono però i rami dove vive la logica più delicata della pagina — quella
 * che decide di NON dare un numero, nel verdetto e nella tessera con lo STESSO predicato.
 *
 * Ogni test risemina il proprio scenario prima di navigare. Gira su un account separato
 * (`test-user-degraded`) proprio per potersi permettere di riscrivere snapshot e versamenti senza
 * che nessun'altra spec ne dipenda; il progetto Playwright `degraded` è quello che gli passa la
 * sessione giusta.
 */

import { spawnSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

/**
 * Riscrive lo scenario dell'account degradato.
 *
 * Sincrono, e va bene: la suite gira con `workers: 1`, quindi non c'è nessun altro test a metà
 * navigazione mentre Firestore viene riscritto.
 */
function seedScenario(scenario: 'suspicious' | 'idle' | 'fresh'): void {
  const result = spawnSync('npm', ['run', 'e2e:seed', '--', scenario], { stdio: 'pipe', shell: true });
  if (result.status !== 0) {
    throw new Error(`Seed dello scenario «${scenario}» fallito:\n${result.stderr?.toString() ?? ''}`);
  }
}

/** La tessera del rendimento — la stessa in tutti e tre gli stati, ma senza numeri. */
function rendimento(page: Page) {
  return page.getByRole('region', { name: 'Rendimento del fondo' });
}

function verdict(page: Page) {
  return page.getByRole('region', { name: 'Verdetto sul fondo pensione' });
}

async function gotoPension(page: Page): Promise<void> {
  await page.goto('/dashboard/pension');
  // La tessera del fondo è l'ultimo elemento stabile comune a tutti gli scenari.
  await expect(page.getByRole('region', { name: 'Il fondo oggi' })).toBeVisible({ timeout: 30_000 });
}

/** Una percentuale con segno, come la tessera la stamperebbe se misurasse. */
const SIGNED_PCT = /^[+−]\d+,\d{2}%$/;

test('copertura sospetta: verdetto e tessera dichiarano il rendimento inattendibile, niente scomposizione', async ({ page }) => {
  seedScenario('suspicious');
  await gotoPension(page);

  await expect(verdict(page).getByRole('heading', { name: 'Il rendimento del fondo non è misurabile' })).toBeVisible();
  await expect(verdict(page)).toContainText('mancano versamenti registrati');

  // La spiegazione prende il posto della percentuale.
  await expect(rendimento(page)).toContainText('verrebbe letta come rendimento di mercato');
  await expect(rendimento(page).getByText(SIGNED_PCT)).toHaveCount(0);

  // IL PUNTO DI QUESTO TEST: nessun «Guadagno di mercato» sotto un avviso che dice che quella
  // differenza NON è guadagno di mercato — la scomposizione sparisce con la percentuale.
  await page.getByRole('button', { name: /^Dettaglio/ }).click();
  await expect(page.getByRole('region', { name: 'Da dove viene la crescita' })).toHaveCount(0);
  await expect(page.getByText('Guadagno di mercato')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Come aggiornare il valore del fondo' })).toBeVisible();
});

test('finestra ferma: spiega invece di stampare +0,00% e NON scompone la crescita', async ({ page }) => {
  seedScenario('idle');
  await gotoPension(page);

  await expect(verdict(page)).toContainText('il valore non si è ancora mosso');
  await expect(rendimento(page)).toContainText('non si è ancora mosso');
  await expect(rendimento(page).getByText(SIGNED_PCT)).toHaveCount(0);

  await page.getByRole('button', { name: /^Dettaglio/ }).click();
  await expect(page.getByRole('region', { name: 'Da dove viene la crescita' })).toHaveCount(0);
});

test('fondo appena creato: la tessera Rendimento spiega, e la riga non resta vuota a 1440px', async ({ page }) => {
  seedScenario('fresh');
  await gotoPension(page);

  // Con l'overlay del valore vivo la serie non è mai vuota finché il fondo ha un valore: il
  // prerequisito mancante è il primo versamento registrato, non la prima fotografia del cron.
  await expect(verdict(page).getByRole('heading', { name: 'Il rendimento del fondo non è ancora misurabile' })).toBeVisible();
  await expect(rendimento(page)).toContainText('Registra il primo versamento');
  await expect(rendimento(page)).toContainText('non ancora misurabile');

  // LA REGRESSIONE DI LAYOUT: la tessera esiste e sta nella riga dell'hero, a destra.
  const hero = (await page.getByRole('region', { name: 'Il fondo oggi' }).boundingBox())!;
  const returnBox = (await rendimento(page).boundingBox())!;
  expect(returnBox.x).toBeGreaterThan(hero.x + hero.width - 1);
  expect(Math.abs(returnBox.y - hero.y)).toBeLessThan(2);

  await page.getByRole('button', { name: /^Dettaglio/ }).click();
  await expect(page.getByRole('region', { name: 'Da dove viene la crescita' })).toHaveCount(0);
});
