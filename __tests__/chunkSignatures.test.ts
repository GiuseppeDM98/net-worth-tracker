/**
 * The chunk signatures of the browser suite (`e2e/chunkProbe.ts`) stay unique to their module.
 *
 * A signature is how a Playwright spec knows a chunk by its content, on `next dev` and on the
 * production build alike (2026-11-16). One that another source file also carries would match that
 * file's chunk too: a «downloaded» check would turn green on the wrong chunk, an «absent» one red on a
 * page that is right. Our own sources are the files that can grow a copy, comments included — a dev
 * chunk keeps them.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CHUNK_SIGNATURES } from '../e2e/chunkProbe';

const SOURCE_ROOTS = ['app', 'components', 'lib'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|js|mjs|css)$/.test(name) ? [path.replaceAll('\\', '/')] : [];
  });
}

const sources = SOURCE_ROOTS.flatMap(sourceFiles).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('chunk signatures', () => {
  for (const [name, { text, module }] of Object.entries(CHUNK_SIGNATURES)) {
    it(`${name}: «${text}» is in ${module} and in no other source of ours`, () => {
      expect(readFileSync(module, 'utf8')).toContain(text);
      const carriers = sources.filter((file) => file.text.includes(text)).map((file) => file.path);
      expect(carriers).toEqual(module.startsWith('node_modules/') ? [] : [module]);
    });
  }
});
