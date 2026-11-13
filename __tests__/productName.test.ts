/**
 * The product name. The app is called «Net Worth Tracker» on every surface the user reads (owner,
 * 2026-11-12): the tab title, the sidebar and the top bar, the access pages' eyebrow, the landing. The old
 * name must not come back in the source or in the setup guide; each expectation was seen red
 * (2026-11-13): the old name put back in `components/layout/Sidebar.tsx` turns the scan and its row red; «Net Worth»
 * alone there turns only its row red; the old title restored on `SETUP.md`'s first line turns the guide test red.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'contexts'];
const OLD_NAME = /portfolio[ -]tracker/i;
const NEW_NAME_SITES: ReadonlyArray<readonly [string, string]> = [
  ['app/layout.tsx', 'title: "Net Worth Tracker - Gestisci il tuo Patrimonio"'],
  ['app/dashboard/layout.tsx', '>Net Worth Tracker</span>'],
  ['components/layout/Sidebar.tsx', '<span className="truncate">Net Worth Tracker</span>'],
  ['components/auth/AuthShell.tsx', '<p className={TILE_EYEBROW_CLASS}>Net Worth Tracker</p>'],
  ['app/login/page.tsx', 'verdictAriaLabel="Che cos’è Net Worth Tracker"'],
  ['app/page.tsx', 'label="Net Worth Tracker"'],
  ['app/page.tsx', 'ariaLabel="Cos’è Net Worth Tracker"'],
  ['app/page.tsx', "Net Worth Tracker — open source su{' '}"],
  ['app/page.tsx', 'aria-label="Net Worth Tracker su GitHub (apre in una nuova scheda)"'],
];

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(ts|tsx|css)$/.test(name) ? [full] : [];
  });
}

describe('the product name', () => {
  it('should never read the old name in the source the user sees', () => {
    const offenders = SOURCE_DIRS.flatMap((dir) => listSources(path.join(ROOT, dir)))
      .filter((file) => OLD_NAME.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it.each(NEW_NAME_SITES)('should print the new name in %s: %s', (file, expected) => {
    expect(readFileSync(path.join(ROOT, file), 'utf8')).toContain(expected);
  });

  it('should keep the setup guide on the new name', () => {
    expect(OLD_NAME.test(readFileSync(path.join(ROOT, 'SETUP.md'), 'utf8'))).toBe(false);
  });
});
