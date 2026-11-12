/**
 * The Consulente's report as a book (lib/utils/allocationAdviceBook.ts): the heading reader and its
 * three shapes, the page each section lands on, the degenerate book, the pages a document gives,
 * the address of a page.
 */

import { describe, expect, it } from 'vitest';
import {
  assignSections,
  bookIndexOf,
  bookPageUrl,
  buildBookPages,
  normalizeHeading,
  splitReportSections,
  turnDirection,
  type BookPageInput,
} from '@/lib/utils/allocationAdviceBook';

const assign = (markdown: string, coverTitle = 'In una frase') => assignSections(splitReportSections(markdown), coverTitle);

const SEVEN_ATX = [
  '## 1. In una frase',
  'La proposta regge.',
  '## 2. L\'allocazione proposta',
  'Settanta e trenta.',
  '## 3. Gli strumenti',
  'ETF ornitorinco.',
  '## 4. Gli obiettivi',
  'La casa al mare.',
  '## 5. Casa, fondi pensione e illiquidi',
  'Il Fondo fenicottero resta fuori.',
  '## 6. Cosa fare adesso',
  'Compra a rate.',
  '## 7. Rischi e revisione',
  'Rivedi fra un anno.',
].join('\n');

const FULL: BookPageInput = {
  markdown: SEVEN_ATX,
  source: 'report',
  hasProposal: true,
  hasInstruments: true,
  hasGoals: true,
  hasRoles: true,
  hasInterview: true,
  hasReport: true,
};

describe('normalizeHeading', () => {
  it('drops accents, numbers, bold, colons and the trailing stop; straightens apostrophes', () => {
    expect(normalizeHeading('**1. Gli strumenti**')).toBe('gli strumenti');
    expect(normalizeHeading('L’Allocazione  Proposta:')).toBe("l'allocazione proposta");
    expect(normalizeHeading('3) Cosa fare adesso.')).toBe('cosa fare adesso');
    expect(normalizeHeading('Perché così')).toBe('perche cosi');
    expect(normalizeHeading('__Rischi e revisione__')).toBe('rischi e revisione');
  });
});

describe('splitReportSections', () => {
  it('reads the three shapes, keeps the preamble, skips fenced blocks', () => {
    const split = splitReportSections(
      ['Prima riga.', '## Gli strumenti', 'testo', '**Gli obiettivi**', '1. **Cosa fare adesso** — Compra.', '```', '## dentro', '```', 'fine'].join('\n')
    );
    expect(split.preamble).toBe('Prima riga.');
    expect(split.sections.map((section) => [section.shape, section.heading])).toEqual([
      ['atx', 'Gli strumenti'],
      ['bold', 'Gli obiettivi'],
      ['inline', 'Cosa fare adesso'],
    ]);
    expect(split.sections[2].body).toBe('Compra.\n```\n## dentro\n```\nfine');
  });

  it('an inline bold that names no page is text', () => {
    const split = splitReportSections('**Nota bene** — testo');
    expect(split.sections).toEqual([]);
    expect(split.preamble).toBe('**Nota bene** — testo');
  });

  it('a blank markdown gives an empty split', () => {
    expect(splitReportSections('  \n ')).toEqual({ preamble: '', sections: [] });
  });
});

describe('assignSections', () => {
  it('the review’s seven ATX sections land on seven pages, each first heading dropped', () => {
    const texts = assign(SEVEN_ATX)!;
    expect([...texts.keys()]).toEqual(['copertina', 'allocazione', 'strumenti', 'obiettivi', 'ruoli', 'passi', 'rischi']);
    // Every page's text is its body alone: the heading line is dropped on all seven (2026-11-12).
    expect(Object.fromEntries(texts)).toEqual({
      copertina: 'La proposta regge.',
      allocazione: 'Settanta e trenta.',
      strumenti: 'ETF ornitorinco.',
      obiettivi: 'La casa al mare.',
      ruoli: 'Il Fondo fenicottero resta fuori.',
      passi: 'Compra a rate.',
      rischi: 'Rivedi fra un anno.',
    });
  });

  it('bold-only headings, «2. **…**» followed directly by text', () => {
    const texts = assign(['**In una frase**', 'Regge.', '2. **L\'allocazione proposta**', 'Settanta.', '**Gli strumenti**', 'ETF ornitorinco.'].join('\n'))!;
    expect(texts.get('copertina')).toBe('Regge.');
    expect(texts.get('allocazione')).toBe('Settanta.');
    expect(texts.get('strumenti')).toBe('ETF ornitorinco.');
  });

  it('the inline shape: the bold is the heading, the rest of the line the first paragraph', () => {
    const texts = assign(['1. **In una frase** — La proposta regge.', '2. **Gli strumenti** — ETF ornitorinco.', 'Seconda riga.'].join('\n'))!;
    expect(texts.get('copertina')).toBe('La proposta regge.');
    expect(texts.get('strumenti')).toBe('ETF ornitorinco.\nSeconda riga.');
  });

  it('«**Nota bene** — testo» is text, and so is «**Strumenti alternativi** — testo»', () => {
    const texts = assign(['**In una frase**', 'Regge.', '**Nota bene** — testo', '**Gli strumenti**', 'ETF.', '**Strumenti alternativi** — altro'].join('\n'))!;
    expect(texts.get('copertina')).toBe('Regge.\n**Nota bene** — testo');
    expect(texts.get('strumenti')).toBe('ETF.\n**Strumenti alternativi** — altro');
  });

  it('«## L\'allocazione proposta» and «## Allocazione proposta» both reach the proposal page; only the printed title is dropped', () => {
    expect(assign("## In una frase\nA.\n## L'allocazione proposta\nB.")!.get('allocazione')).toBe('B.');
    expect(assign('## In una frase\nA.\n## Allocazione proposta\nB.')!.get('allocazione')).toBe('## Allocazione proposta\n\nB.');
  });

  it('an unknown heading lands on the page before, under its own `##` line', () => {
    const texts = assign('## In una frase\nA.\n## Cosa fare adesso\nCompra.\n## Note finali\nUltima.')!;
    expect(texts.get('passi')).toBe('Compra.\n\n## Note finali\n\nUltima.');
  });

  it('«## Senza strumenti» names no page: it lands on the page before', () => {
    const texts = assign('## In una frase\nA.\n## Gli obiettivi\nB.\n## Senza strumenti\nC.')!;
    expect(texts.has('strumenti')).toBe(false);
    expect(texts.get('obiettivi')).toBe('B.\n\n## Senza strumenti\n\nC.');
  });

  it('deeper ATX headings stay in the body verbatim, and never move to their page', () => {
    const texts = assign('## In una frase\nA.\n## Gli strumenti\n### ETF azionari\nB.\n## Cosa fare adesso\n### Obiettivi\nC.')!;
    expect(texts.get('strumenti')).toBe('### ETF azionari\nB.');
    expect(texts.get('passi')).toBe('### Obiettivi\nC.');
    expect(texts.has('obiettivi')).toBe(false);
  });

  it('a bold-only line in a text whose sections are ATX is text', () => {
    const texts = assign('## In una frase\nA.\n**Obiettivi**\n## Gli strumenti\nB.')!;
    expect(texts.get('copertina')).toBe('A.\n**Obiettivi**');
    expect(texts.has('obiettivi')).toBe(false);
  });

  it('«## La tua richiesta» after «## In una frase» stays on the cover WITH its heading line', () => {
    const texts = assign('## In una frase\nA.\n## La tua richiesta\nB.\n## Gli strumenti\nC.')!;
    expect(texts.get('copertina')).toBe('A.\n\n## La tua richiesta\n\nB.');
  });

  it('the strategy’s vocabulary', () => {
    const texts = assign('## La situazione\nA.\n## Obiettivi\nB.\n## Cosa cambia rispetto a oggi\nC.\n## Rispetto al piano precedente\nD.', 'La situazione')!;
    expect(texts.get('copertina')).toBe('A.');
    expect(texts.get('obiettivi')).toBe('## Obiettivi\n\nB.');
    expect(texts.get('allocazione')).toBe('## Cosa cambia rispetto a oggi\n\nC.\n\n## Rispetto al piano precedente\n\nD.');
  });

  it('a `##` inside a fenced block is text', () => {
    const texts = assign('## In una frase\nA.\n```\n## Gli strumenti\n```\n## Gli obiettivi\nB.')!;
    expect(texts.get('copertina')).toBe('A.\n```\n## Gli strumenti\n```');
    expect(texts.has('strumenti')).toBe(false);
  });

  it('fewer than two matched pages: null', () => {
    expect(assign('Solo un paragrafo.\n\nE un altro.')).toBeNull();
    expect(assign('## In una frase\nA.\n## Note\nB.')).toBeNull();
  });
});

describe('buildBookPages', () => {
  const ids = (input: BookPageInput) => buildBookPages(input).map((page) => page.id);

  it('a full document gives the ten pages in order', () => {
    expect(ids(FULL)).toEqual(['copertina', 'allocazione', 'strumenti', 'obiettivi', 'ruoli', 'passi', 'rischi', 'colloquio', 'modifica', 'applica']);
    const cover = buildBookPages(FULL)[0];
    expect(cover).toMatchObject({ title: 'In una frase', text: 'La proposta regge.', generated: true });
  });

  it('a strategy alone: the cover «La situazione», no «modifica»', () => {
    const pages = buildBookPages({
      ...FULL,
      markdown: '## La situazione\nA.\n## Obiettivi\nB.',
      source: 'strategy',
      hasInstruments: false,
      hasInterview: false,
      hasReport: false,
    });
    expect(pages.map((page) => page.id)).toEqual(['copertina', 'allocazione', 'obiettivi', 'ruoli', 'rischi', 'applica']);
    expect(pages[0].title).toBe('La situazione');
  });

  it('a proposal without goals and a text without «Cosa fare adesso» drop `obiettivi` and `passi`, keep `rischi`', () => {
    const pages = ids({ ...FULL, markdown: '## In una frase\nA.\n## Gli strumenti\nB.', hasGoals: false });
    expect(pages).not.toContain('obiettivi');
    expect(pages).not.toContain('passi');
    expect(pages).toContain('rischi');
  });

  it('no text and no proposal (failed at the strategy): the cover «In una frase» and «Applica»', () => {
    const pages = buildBookPages({ markdown: null, source: null, hasProposal: false, hasInstruments: false, hasGoals: false, hasRoles: false, hasInterview: false, hasReport: false });
    expect(pages.map((page) => page.id)).toEqual(['copertina', 'applica']);
    expect(pages[0]).toMatchObject({ title: 'In una frase', text: null, generated: false });
  });

  it('the degenerate book: a cover without text, then one page with the whole markdown, titled by source', () => {
    const plain = buildBookPages({ ...FULL, markdown: 'Solo testo.\n\nAncora.' });
    expect(plain.map((page) => page.id).slice(0, 2)).toEqual(['copertina', 'report']);
    expect(plain[0]).toMatchObject({ text: null, generated: false });
    expect(plain[1]).toMatchObject({ title: 'Il report', text: 'Solo testo.\n\nAncora.', generated: true });
    expect(plain.some((page) => page.id === 'passi')).toBe(false);

    const oneHeading = buildBookPages({ ...FULL, markdown: '## In una frase\nSolo questo.', source: 'strategy', hasReport: false });
    expect(oneHeading[0]).toMatchObject({ title: 'La situazione', text: null });
    expect(oneHeading[1]).toMatchObject({ id: 'report', title: 'La strategia', text: '## In una frase\nSolo questo.' });
  });

  it('the accent: never on colloquio, modifica, applica', () => {
    const generated = Object.fromEntries(buildBookPages(FULL).map((page) => [page.id, page.generated]));
    expect(generated).toEqual({ copertina: true, allocazione: true, strumenti: true, obiettivi: true, ruoli: true, passi: true, rischi: true, colloquio: false, modifica: false, applica: false });
  });
});

describe('bookIndexOf and turnDirection', () => {
  it('an unknown or absent id is the cover', () => {
    const pages = buildBookPages(FULL);
    expect(bookIndexOf(pages, 'strumenti')).toBe(2);
    expect(bookIndexOf(pages, 'nessuna')).toBe(0);
    expect(bookIndexOf(pages, null)).toBe(0);
  });

  it('forward toward a later page, back toward an earlier one', () => {
    expect(turnDirection(2, 5)).toBe(1);
    expect(turnDirection(5, 2)).toBe(-1);
  });
});

describe('bookPageUrl', () => {
  it('sets, removes and cleans the address', () => {
    expect(bookPageUrl('/p', '?x=1', 'strumenti')).toBe('/p?x=1&pagina=strumenti');
    expect(bookPageUrl('/p', '?pagina=rischi&x=1', null)).toBe('/p?x=1');
    expect(bookPageUrl('/p', '?rivedi=1', 'obiettivi')).toBe('/p?pagina=obiettivi');
    expect(bookPageUrl('/p', '', null)).toBe('/p');
    expect(bookPageUrl('/p', '?pagina=rischi', 'copertina')).toBe('/p');
  });
});
