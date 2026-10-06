/**
 * Every component and hook compiles under the React Compiler.
 *
 * `reactCompiler: true` (next.config.ts, since 2026-10-05) compiles each component or hook as ONE
 * unit, and a single construct it does not support ANYWHERE inside it — a `try … finally`, a
 * `throw` inside a `try`, an `import()`, one `eslint-disable` of a `react-hooks` rule — makes it
 * skip the WHOLE component in silence: the page still works, it just re-renders everything again.
 * `npm run lint` does not see most of these (the `todo` and `hooks` rules are not in the plugin's
 * `recommended`, and «value blocks within a try/catch» reaches no ESLint rule at all), so this test
 * is the map: it runs the same Babel plugin Next runs, with a logger, over app/, components/,
 * contexts/ and lib/, and fails naming each skipped function and the compiler's reason.
 *
 * On 2026-10-05 (PERF-12) the first run found 48 skipped functions, the settings, Cashflow,
 * Rendimenti, Patrimonio and Panoramica pages among them; each was rewritten without changing
 * behaviour, and the ways to do it are in AGENTS.md § Motion. Seen red that day with a
 * `try … finally` put back in a component, and with an `eslint-disable-next-line
 * react-hooks/exhaustive-deps`.
 *
 * ~12 s for ~700 files, so it runs once, in `beforeAll`, with its own timeout.
 */
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'contexts', 'lib'];

type Skip = { file: string; line: number | string; reason: string };

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });
}

/** The compiler's own events for one file: how many functions compiled, and every one it skipped. */
async function compileFile(file: string): Promise<{ compiled: number; skips: Skip[] }> {
  let compiled = 0;
  const skips: Skip[] = [];
  await transformAsync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [
      [
        'babel-plugin-react-compiler',
        {
          // Report instead of throwing, so one run lists every skipped function.
          panicThreshold: 'none',
          logger: {
            logEvent(_filename: string | null, event: { kind: string; fnLoc?: { start?: { line: number } }; detail?: { reason?: string; options?: { reason?: string } } }) {
              if (event.kind === 'CompileSuccess') compiled++;
              else if (event.kind === 'CompileError' || event.kind === 'CompileSkip' || event.kind === 'PipelineError') {
                skips.push({
                  file: path.relative(ROOT, file),
                  line: event.fnLoc?.start?.line ?? '?',
                  reason: event.detail?.reason ?? event.detail?.options?.reason ?? event.kind,
                });
              }
            },
          },
        },
      ],
    ],
  });
  return { compiled, skips };
}

describe('React Compiler coverage', () => {
  let compiled = 0;
  let skips: Skip[] = [];

  beforeAll(async () => {
    const files = SOURCE_DIRS.flatMap((dir) => listSources(path.join(ROOT, dir)));
    for (const file of files) {
      const result = await compileFile(file);
      compiled += result.compiled;
      skips = skips.concat(result.skips);
    }
  }, 120_000);

  it('compiles the components it finds (the logger is wired)', () => {
    // A positive anchor: a logger that never fires would make the next case pass on nothing.
    expect(compiled).toBeGreaterThan(500);
  });

  it('skips no component or hook', () => {
    expect(skips.map((s) => `${s.file}:${s.line} — ${s.reason}`)).toEqual([]);
  });
});
