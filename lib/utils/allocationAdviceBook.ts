/**
 * The Consulente's report read as a BOOK (owner, 2026-11-08: «una specie di libro, dove ogni pagina
 * ha un senso logico da sola e quelle dopo continuano il racconto»): which pages exist, in which
 * order, and which part of the model's text each one carries. Pure — no React, no zod: the book is
 * its only importer, and nothing the Allocazione page loads may reach zod (doc/guide/consulente.md
 * § Files).
 *
 * The text is split by its SECTIONS onto the page of the tile it explains. The reader is lenient
 * because a model writes the headings the contracts prescribe in more than one shape (2026-11-11):
 * an ATX heading, a bold-only line, or the contracts' own list shape «1. **Titolo** — testo».
 * It never trusts the model: a heading it does not know lands on the page before it (nothing is
 * dropped), fenced blocks are skipped, and a text it cannot spread over two pages is read whole on
 * one page. It only decides WHERE the prose is shown; no figure and no decision is taken from it.
 */

export type BookPageId =
  | 'copertina'
  | 'allocazione'
  | 'strumenti'
  | 'obiettivi'
  | 'ruoli'
  | 'passi'
  | 'rischi'
  | 'report'
  | 'colloquio'
  | 'modifica'
  | 'applica';

export type BookTextSource = 'report' | 'strategy';

export interface BookPageSpec {
  id: BookPageId;
  title: string;
  /** The section headings that land on this page, normalised (`normalizeHeading`). */
  aliases: readonly string[];
  /** Whether the page's body is what the model wrote (DESIGN.md → The AI-Accent Rule); the cover decides from its text. */
  generated: boolean;
}

/** The ten pages in reading order; `report` is not here — `buildBookPages` inserts it after `copertina` in the degenerate book. */
export const BOOK_PAGE_TABLE: readonly BookPageSpec[] = [
  { id: 'copertina', title: 'In una frase', aliases: ['in una frase', 'la situazione', 'la tua richiesta'], generated: false },
  {
    id: 'allocazione',
    title: "L'allocazione proposta",
    aliases: ["l'allocazione proposta", 'allocazione proposta', 'cosa cambia rispetto a oggi', 'rispetto al piano precedente'],
    generated: true,
  },
  { id: 'strumenti', title: 'Gli strumenti', aliases: ['gli strumenti', 'strumenti'], generated: true },
  { id: 'obiettivi', title: 'Gli obiettivi', aliases: ['gli obiettivi', 'obiettivi'], generated: true },
  { id: 'ruoli', title: 'Casa, fondi pensione e illiquidi', aliases: ['casa, fondi pensione e illiquidi'], generated: true },
  { id: 'passi', title: 'Cosa fare adesso', aliases: ['cosa fare adesso'], generated: true },
  { id: 'rischi', title: 'Rischi e revisione', aliases: ['rischi e revisione', 'i rischi', 'la revisione'], generated: true },
  { id: 'colloquio', title: 'Il colloquio', aliases: [], generated: false },
  { id: 'modifica', title: 'Chiedi una modifica', aliases: [], generated: false },
  { id: 'applica', title: 'Applica', aliases: [], generated: false },
];

/** The cover's title follows the text's source (2026-11-11): the review opens «In una frase», the strategy «La situazione». */
export const BOOK_COVER_TITLE: Record<BookTextSource, string> = { report: 'In una frase', strategy: 'La situazione' };
/** The one text page of the degenerate book, by source. */
export const BOOK_REPORT_TITLE: Record<BookTextSource, string> = { report: 'Il report', strategy: 'La strategia' };

const REPORT_PAGE: BookPageSpec = { id: 'report', title: BOOK_REPORT_TITLE.report, aliases: [], generated: true };

/**
 * A heading as the reader compares it: no diacritics, lower case, no `*`/`_`, straight apostrophes,
 * no leading «1.» / «1)», no `:` and no trailing `.`, single spaces.
 */
export function normalizeHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*_]/g, '')
    .replace(/[‘’ʼ′]/g, "'")
    .trim()
    .replace(/^\d+[.)]\s*/, '')
    .replace(/:/g, '')
    .replace(/\.\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ReportSection {
  /** The heading's own text, as written (the ATX text, or the bold's content). */
  heading: string;
  /** The ATX level (1–4); null for the two bold shapes. */
  level: number | null;
  shape: 'atx' | 'bold' | 'inline';
  /** What follows the heading up to the next candidate; for `inline`, the rest of the heading's line first. */
  body: string;
  /** The heading line exactly as written, so a candidate that does not open a section goes back verbatim. */
  line: string;
}

const ATX_HEADING = /^#{1,4}\s+(.+?)\s*#*\s*$/;
const BOLD_ONLY_HEADING = /^(?:\d+[.)]\s+)?\*\*(.+?)\*\*:?\s*$/;
const INLINE_HEADING = /^(?:\d+[.)]\s+)?\*\*(.+?)\*\*\s*[—–:-]\s+(\S.*)$/;
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;

/** The page whose alias the heading names, by `match` (equality, or equality-or-prefix). */
function pageOfHeading(heading: string, allowPrefix: boolean): BookPageId | null {
  const normalized = normalizeHeading(heading);
  for (const page of BOOK_PAGE_TABLE) {
    for (const alias of page.aliases) {
      if (normalized === alias || (allowPrefix && normalized.startsWith(`${alias} `))) return page.id;
    }
  }
  return null;
}

function isInlineAlias(bold: string): boolean {
  return pageOfHeading(bold, false) !== null;
}

/**
 * Every candidate heading line of the three shapes, outside fenced blocks, with the text between
 * them; an inline candidate only when its bold equals an alias. A blank markdown gives an empty split.
 */
export function splitReportSections(markdown: string): { preamble: string; sections: ReportSection[] } {
  if (markdown.trim() === '') return { preamble: '', sections: [] };
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const preamble: string[] = [];
  const sections: (Omit<ReportSection, 'body'> & { bodyLines: string[] })[] = [];
  let fence: string | null = null;
  const push = (line: string) => (sections.length > 0 ? sections[sections.length - 1].bodyLines : preamble).push(line);

  for (const line of lines) {
    if (fence !== null) {
      push(line);
      const trimmed = line.trim();
      if (trimmed.startsWith(fence) && trimmed.replace(new RegExp(`^\\${fence[0]}+`), '') === '' && trimmed.length >= fence.length) fence = null;
      continue;
    }
    const opening = FENCE_OPEN.exec(line);
    if (opening) {
      fence = opening[1];
      push(line);
      continue;
    }
    const atx = ATX_HEADING.exec(line);
    if (atx) {
      const level = /^#+/.exec(line)![0].length;
      sections.push({ heading: atx[1], level, shape: 'atx', line, bodyLines: [] });
      continue;
    }
    const bold = BOLD_ONLY_HEADING.exec(line);
    if (bold) {
      sections.push({ heading: bold[1], level: null, shape: 'bold', line, bodyLines: [] });
      continue;
    }
    const inline = INLINE_HEADING.exec(line);
    if (inline && isInlineAlias(inline[1])) {
      sections.push({ heading: inline[1], level: null, shape: 'inline', line, bodyLines: [inline[2]] });
      continue;
    }
    push(line);
  }
  // Bodies keep their blank lines: a candidate that opens no section is glued back verbatim.
  return {
    preamble: preamble.join('\n'),
    sections: sections.map(({ bodyLines, ...section }) => ({ ...section, body: bodyLines.join('\n') })),
  };
}

const TITLE_OF: Partial<Record<BookPageId, string>> = Object.fromEntries(BOOK_PAGE_TABLE.map((page) => [page.id, page.title]));

/**
 * The text of each page (2026-11-11). When an ATX heading names a page, the sections are the ATX
 * headings of the shallowest such level or above, and the bold shapes are text; otherwise the bold
 * shapes open the sections and every ATX heading is text. A cursor walks the sections from the
 * cover: a known heading moves it, an unknown one lands on the page before. The heading line is
 * dropped only when it is the first section of its page and equals that page's printed title;
 * otherwise it is re-emitted as `## ` + its text. `null` when the known headings land on fewer than
 * two different pages — the degenerate book.
 */
export function assignSections(split: { preamble: string; sections: ReportSection[] }, coverTitle: string): Map<BookPageId, string> | null {
  const atxLevels = split.sections.filter((section) => section.shape === 'atx' && pageOfHeading(section.heading, true) !== null).map((section) => section.level as number);
  const atxMode = atxLevels.length > 0;
  const sectionLevel = atxMode ? Math.min(...atxLevels) : 0;
  const opens = (section: ReportSection) => (atxMode ? section.shape === 'atx' && (section.level as number) <= sectionLevel : section.shape !== 'atx');

  const chunks = new Map<BookPageId, string[]>();
  const append = (page: BookPageId, text: string) => {
    const list = chunks.get(page) ?? [];
    list.push(text);
    chunks.set(page, list);
  };
  // A line that opens nothing continues the text it interrupted, one newline after it, as written.
  const glue = (page: BookPageId, text: string) => {
    const list = chunks.get(page);
    if (list && list.length > 0) list[list.length - 1] = `${list[list.length - 1]}\n${text}`;
    else append(page, text);
  };
  append('copertina', split.preamble);

  const matched = new Set<BookPageId>();
  const opened = new Set<BookPageId>();
  let cursor: BookPageId = 'copertina';
  for (const section of split.sections) {
    if (!opens(section)) {
      // A candidate that opens nothing goes back where it was, verbatim (an inline one's line already holds its rest).
      const rest = section.shape === 'inline' ? section.body.split('\n').slice(1) : section.body.split('\n');
      glue(cursor, [section.line, ...rest].join('\n'));
      continue;
    }
    const page = pageOfHeading(section.heading, section.shape !== 'inline');
    if (page !== null) {
      cursor = page;
      matched.add(page);
    }
    const printedTitle = cursor === 'copertina' ? coverTitle : (TITLE_OF[cursor] ?? '');
    const normalized = normalizeHeading(section.heading);
    const dropHeading =
      page !== null && !opened.has(page) && BOOK_PAGE_TABLE.some((spec) => spec.id === page && spec.aliases.includes(normalized)) && normalized === normalizeHeading(printedTitle);
    opened.add(cursor);
    append(cursor, dropHeading ? section.body : `## ${section.heading.trim()}\n\n${section.body.trim()}`);
  }

  if (matched.size < 2) return null;
  const texts = new Map<BookPageId, string>();
  for (const [page, list] of chunks) {
    const text = list.map((chunk) => chunk.trim()).filter((chunk) => chunk !== '').join('\n\n');
    if (text !== '') texts.set(page, text);
  }
  return texts;
}

export interface BookPageInput {
  markdown: string | null;
  source: BookTextSource | null;
  hasProposal: boolean;
  hasInstruments: boolean;
  hasGoals: boolean;
  hasRoles: boolean;
  hasInterview: boolean;
  hasReport: boolean;
}

export interface BookPage {
  id: BookPageId;
  title: string;
  text: string | null;
  generated: boolean;
}

/**
 * The pages of the book, in order. A page exists when it has text or figures: the proposal's two
 * (`allocazione`, `rischi` — the review date is required, so a proposal always has its risks page),
 * the instruments, the goals, the roles, the interview, the revision with a report; `passi` only
 * with its section; the cover and «Applica» always.
 */
export function buildBookPages(input: BookPageInput): BookPage[] {
  const source = input.source ?? 'report';
  const coverTitle = BOOK_COVER_TITLE[source];
  const markdown = input.markdown !== null && input.markdown.trim() !== '' ? input.markdown : null;
  const texts = markdown === null ? null : assignSections(splitReportSections(markdown), coverTitle);
  const degenerate = markdown !== null && texts === null;
  const textOf = (id: BookPageId) => texts?.get(id) ?? null;

  const figures: Record<BookPageId, boolean> = {
    copertina: true,
    allocazione: input.hasProposal,
    strumenti: input.hasInstruments,
    obiettivi: input.hasGoals,
    ruoli: input.hasRoles,
    passi: false,
    rischi: input.hasProposal,
    report: false,
    colloquio: input.hasInterview,
    modifica: input.hasReport,
    applica: true,
  };

  const pages: BookPage[] = [];
  for (const spec of BOOK_PAGE_TABLE) {
    const text = textOf(spec.id);
    if (spec.id === 'copertina') {
      pages.push({ id: 'copertina', title: coverTitle, text, generated: text !== null });
      if (degenerate) pages.push({ id: 'report', title: BOOK_REPORT_TITLE[source], text: markdown, generated: REPORT_PAGE.generated });
      continue;
    }
    if (text === null && !figures[spec.id]) continue;
    pages.push({ id: spec.id, title: spec.title, text, generated: spec.generated });
  }
  return pages;
}

/** The index of the page with that id; 0 (the cover) when there is none. */
export function bookIndexOf(pages: readonly BookPage[], id: string | null | undefined): number {
  if (!id) return 0;
  const index = pages.findIndex((page) => page.id === id);
  return index < 0 ? 0 : index;
}

/** +1 toward a later page, −1 toward an earlier one. */
export function turnDirection(from: number, to: number): 1 | -1 {
  return to > from ? 1 : -1;
}

export const BOOK_PAGE_PARAM = 'pagina';

/** `pathname` + the query with `pagina` set (removed when `id` is null or 'copertina'), `rivedi` removed, the rest kept; never ''. */
export function bookPageUrl(pathname: string, search: string, id: BookPageId | null): string {
  const params = new URLSearchParams(search);
  params.delete('rivedi');
  if (id === null || id === 'copertina') params.delete(BOOK_PAGE_PARAM);
  else params.set(BOOK_PAGE_PARAM, id);
  const query = params.toString();
  return `${pathname || '/'}${query ? `?${query}` : ''}`;
}
