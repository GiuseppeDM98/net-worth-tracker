/**
 * No `prose` class anywhere in the UI (2026-11-26).
 *
 * The app has no typography plugin, so `prose`, `prose-sm` and `not-prose` style nothing: generated
 * Markdown is styled by `MARKDOWN_PROSE_COMPONENTS` (components/ui/markdown-prose.tsx; DESIGN.md →
 * Typography, Generated Markdown). Three cards of the Assistente kept a dead `not-prose` until
 * 2026-11-26, where the rendered-message test could not see them. This reads the sources, comments
 * stripped, for the class inside a string literal.
 *
 * Seen RED with `not-prose` put back on the question card.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['components', 'app', 'lib'];
// A class token, never the `prose(…)` segment builder of lib/utils/narrative.ts.
const PROSE_CLASS = /(?<![\w-])(?:not-)?prose(?:-[a-z0-9]+)?(?![\w(-])/;
const STRING_LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('generated Markdown — no prose class in the sources', () => {
  it('finds no prose, prose-* or not-prose class in a string of components, app or lib', () => {
    const offenders = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root))).flatMap((file) => {
      const strings = withoutComments(fs.readFileSync(file, 'utf8')).match(STRING_LITERAL) ?? [];
      return strings.filter((literal) => PROSE_CLASS.test(literal)).map((literal) => `${path.relative(process.cwd(), file)}: ${literal}`);
    });
    expect(offenders).toEqual([]);
  });
});
