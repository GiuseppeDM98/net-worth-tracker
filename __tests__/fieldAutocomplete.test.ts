/**
 * No autofill on the app's own fields (owner, 2026-11-06; components/ui/autofill.ts).
 *
 * Two halves. The primitives: `Input` and `Textarea` render the opt-out attributes by default and
 * let a caller's `autoComplete` win (Login and Registrazione pass theirs on purpose, for the
 * password managers). The sources: every raw `<input>` that takes text and every raw `<textarea>`
 * under app/ and components/ spreads `NO_AUTOFILL_ATTRIBUTES`, and every `<form>` outside the
 * auth pages carries `autoComplete="off"` — a new field written without them turns this red and
 * names the file and line. Seen red on 2026-11-06 with the spread removed from the period
 * picker's «Da» input and with the attribute removed from the expense form.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NO_AUTOFILL_ATTRIBUTES } from '@/components/ui/autofill';

const ROOT = path.resolve(__dirname, '..');
/** The auth pages keep their `autoComplete` tokens: the password managers read them. */
const AUTH_SOURCES = [path.join('app', 'login'), path.join('app', 'register'), path.join('components', 'auth')];
/** An `<input>` of one of these types takes no text, so the browser has nothing to autofill. */
const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'file', 'hidden', 'range', 'color', 'submit', 'button'];

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return name.endsWith('.tsx') && !name.endsWith('.stories.tsx') ? [full] : [];
  });
}

const SOURCES = ['app', 'components'].flatMap((dir) => listSources(path.join(ROOT, dir)));
const relative = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');
const isAuthSource = (file: string) => AUTH_SOURCES.some((prefix) => path.relative(ROOT, file).startsWith(prefix));

/** The source with its comments blanked (same length, so the lines hold): an `<input>` named in a doc comment is not a field. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/[^\n]*/gm, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Every JSX opening tag `<name …>` in a source, with its line, attributes read up to the closing `>`. */
function openingTags(source: string, name: 'input' | 'textarea' | 'form'): { line: number; attributes: string }[] {
  const tags: { line: number; attributes: string }[] = [];
  const pattern = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, 'g');
  for (const match of withoutComments(source).matchAll(pattern)) {
    const line = source.slice(0, match.index).split('\n').length;
    tags.push({ line, attributes: match[1] });
  }
  return tags;
}

function typeOf(attributes: string): string | null {
  return attributes.match(/\btype=["']([a-z-]+)["']/)?.[1] ?? null;
}

describe('the field primitives', () => {
  it('should render Input and Textarea with the opt-out attributes by default', () => {
    for (const element of [createElement(Input, { id: 'amount' }), createElement(Textarea, { id: 'notes' })]) {
      const html = renderToStaticMarkup(element);
      // React serialises the prop name as written; the browser reads the attribute case-insensitively.
      expect(html).toMatch(/autocomplete="off"/i);
      expect(html).toContain('data-1p-ignore=""');
      expect(html).toContain('data-lpignore="true"');
      expect(html).toContain('data-bwignore=""');
    }
  });

  it('should let a caller\'s autoComplete win, which is how the auth pages keep theirs', () => {
    const html = renderToStaticMarkup(createElement(Input, { id: 'email', autoComplete: 'email' }));
    expect(html).toMatch(/autocomplete="email"/i);
    expect(html).not.toMatch(/autocomplete="off"/i);
  });

  it('should keep the constant to the standard attribute and the three managers\' opt-outs', () => {
    expect(Object.keys(NO_AUTOFILL_ATTRIBUTES).sort()).toEqual(['autoComplete', 'data-1p-ignore', 'data-bwignore', 'data-lpignore']);
    expect(NO_AUTOFILL_ATTRIBUTES.autoComplete).toBe('off');
  });
});

describe('the sources', () => {
  it('should spread NO_AUTOFILL_ATTRIBUTES on every raw text input and textarea outside the auth pages', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      if (isAuthSource(file) || relative(file) === 'components/ui/input.tsx' || relative(file) === 'components/ui/textarea.tsx') continue;
      const source = readFileSync(file, 'utf8');
      for (const tag of openingTags(source, 'input')) {
        const type = typeOf(tag.attributes);
        if (type && NON_TEXT_INPUT_TYPES.includes(type)) continue;
        if (!tag.attributes.includes('{...NO_AUTOFILL_ATTRIBUTES}') && !/\bautoComplete=/.test(tag.attributes)) {
          offenders.push(`${relative(file)}:${tag.line} <input>`);
        }
      }
      for (const tag of openingTags(source, 'textarea')) {
        if (!tag.attributes.includes('{...NO_AUTOFILL_ATTRIBUTES}') && !/\bautoComplete=/.test(tag.attributes)) {
          offenders.push(`${relative(file)}:${tag.line} <textarea>`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('should carry autoComplete="off" on every form outside the auth pages', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      if (isAuthSource(file)) continue;
      const source = readFileSync(file, 'utf8');
      for (const tag of openingTags(source, 'form')) {
        if (!/\bautoComplete=["']off["']/.test(tag.attributes)) offenders.push(`${relative(file)}:${tag.line} <form>`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('should see the auth forms keep their own tokens', () => {
    const login = readFileSync(path.join(ROOT, 'app', 'login', 'page.tsx'), 'utf8');
    expect(login).toContain('autoComplete="current-password"');
  });
});
