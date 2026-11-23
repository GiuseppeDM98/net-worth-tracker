/**
 * `NarrativeText` renders its own `<p>` (components/ui/narrative-text.tsx): a `<p>` that wraps it is a
 * `<p>` inside a `<p>`, invalid HTML that React reports as a hydration error. Found on the guided tour of the
 * Consulente's hand-off (2026-11-18) on Accumulo's «Questo mese», under an active plan below its reserve. A scan of the
 * components' source, so every host is held, not only the one that broke.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

describe('NarrativeText is never the child of a <p>', () => {
  // Mutation: QuestoMeseTile's reserve warning back in a <p> → red.
  it('no component wraps <NarrativeText> directly in a <p>', () => {
    const offenders = tsxFiles(join(process.cwd(), 'components')).filter((file) =>
      /<p\b[^>]*>\s*<NarrativeText\b/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
