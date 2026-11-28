/**
 * The HTML vocabulary the periodic emails share: the shell, the verdict, the way back to the app,
 * the tile, and the few figure shapes a tile can contain.
 *
 * It exists for the same reason `components/ui/tile.tsx` does in the app — one shell, so a
 * surface cannot drift — with one constraint the DOM does not have: **every layout here is a
 * table**. Outlook on Windows renders through Word, which ignores flexbox, grid, and most of
 * `display`; a nested table with percentage widths is the only construct that lays out the same
 * way in Gmail, Apple Mail and Outlook. Radii and shadows are stated anyway and simply do not
 * appear there, which is acceptable: they carry no information.
 *
 * Colours and type stacks come from `lib/constants/printTokens.ts` and never from a literal
 * here. The words come from `lib/utils/emailNarrative.ts` and are never typed in this file.
 */

import { PRINT_COLORS, EMAIL_SANS_STACK, EMAIL_MONO_STACK, PRINT_RANK_HEX } from '@/lib/constants/printTokens';
import type { Narrative, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import { EMAIL_APP_LINK_LABEL } from '@/lib/utils/emailNarrative';

/**
 * Escapes the characters that would break out of HTML text when interpolating anything the user
 * typed — a note, a category name, a person's name.
 *
 * Text nodes only: it deliberately does not escape quotes, and no caller may put user text
 * inside an attribute. Every interpolation below that can carry user input goes through it.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Type ramp ────────────────────────────────────────────────────────────────
//
// The same steps DESIGN.md §3 enumerates, as inline style fragments. An email cannot carry a
// class, so each one is spelled out where it is used; keeping them here means the ramp has one
// definition rather than forty.

const EYEBROW = `font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${PRINT_COLORS.mutedForeground};`;
const SCOPE = `font-size:10px;color:${PRINT_COLORS.mutedForeground};white-space:nowrap;`;
const READING = `margin:8px 0 0;font-size:13px;line-height:1.45;color:${PRINT_COLORS.foreground};`;
const FOOTNOTE = `font-size:11px;line-height:1.5;color:${PRINT_COLORS.mutedForeground};`;
const MONO = `font-family:${EMAIL_MONO_STACK};font-variant-numeric:tabular-nums;`;

/** The colour a verdict's full stop takes — the only thing tone paints. */
function toneColor(tone: VerdictTone): string {
  switch (tone) {
    case 'positive':
      return PRINT_COLORS.positive;
    case 'negative':
      return PRINT_COLORS.negative;
    case 'warning':
      return PRINT_COLORS.warning;
    default:
      return PRINT_COLORS.mutedForeground;
  }
}

function signColor(sign: 'positive' | 'negative' | undefined): string | null {
  if (sign === 'positive') return PRINT_COLORS.positive;
  if (sign === 'negative') return PRINT_COLORS.negative;
  return null;
}

/**
 * Renders a `Narrative` — the same segment list the app's `NarrativeText` renders in the DOM.
 * Prose stays prose; a `mono` segment is set in the numeric face at 600 and takes its sign
 * colour, which is what makes a figure findable inside a sentence.
 */
export function renderNarrative(narrative: Narrative): string {
  return narrative
    .map((segment) => {
      const text = escapeHtml(segment.text);
      if (!segment.mono && !segment.sign) return text;
      const colour = signColor(segment.sign);
      const style = [
        segment.mono ? `${MONO}font-weight:600;` : '',
        colour ? `color:${colour};` : '',
      ].join('');
      return `<span style="${style}">${text}</span>`;
    })
    .join('');
}

// ─── The shell ────────────────────────────────────────────────────────────────

interface EmailShellOptions {
  /** The `<title>` and the subject the reader already saw. */
  title: string;
  /**
   * The inbox preview line. It is the VERDICT headline: the one sentence that answers the
   * email's question is also the one the reader sees before opening it.
   */
  preheader: string;
  /** The tile rows, already rendered. */
  body: string;
  /** The closing line under the last tile. */
  footer: string;
}

/**
 * The card the email lives in: 600px, the card surface, one 1px border.
 *
 * A hidden preheader `<div>` sits first in the body — Gmail and Apple Mail lift it into the
 * inbox preview, and without one they lift the first visible words instead, which used to be
 * the eyebrow ("NET WORTH TRACKER · RIEPILOGO MENSILE" told the reader nothing they did not
 * already know from the subject).
 */
export function emailShell({ title, preheader, body, footer }: EmailShellOptions): string {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PRINT_COLORS.surfaceMuted};font-family:${EMAIL_SANS_STACK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PRINT_COLORS.surfaceMuted};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${PRINT_COLORS.card};border:1px solid ${PRINT_COLORS.border};border-radius:16px;overflow:hidden;">
${body}
        <tr>
          <td style="padding:18px 32px 22px;background:${PRINT_COLORS.surfaceMuted};border-top:1px solid ${PRINT_COLORS.border};">
            <p style="margin:0;${FOOTNOTE}text-align:center;">${footer}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── The verdict ──────────────────────────────────────────────────────────────

/**
 * The email's opening: eyebrow and scope on one line, then the headline, then the facts.
 *
 * The headline's trailing full stop is a separate span in the tone colour — the one thing tone
 * paints, exactly as `PageVerdict` does in the app. The stop is split off the string rather
 * than appended, so a headline that ends on a question mark or an ellipsis keeps it.
 */
export function emailVerdict(options: {
  eyebrow: string;
  scope: string;
  verdict: PageVerdictModel;
}): string {
  const { headline, tone, sentence } = options.verdict;
  const stop = headline.endsWith('.') ? '.' : '';
  const stem = stop ? headline.slice(0, -1) : headline;

  return `        <tr>
          <td style="padding:26px 32px 22px;">
${headRow(options.eyebrow, options.scope)}
            <h1 style="margin:14px 0 0;font-size:24px;font-weight:600;line-height:1.15;letter-spacing:-0.025em;color:${PRINT_COLORS.foreground};">${escapeHtml(stem)}<span style="color:${toneColor(tone)};">${stop}</span></h1>
            <p style="${READING}">${renderNarrative(sentence)}</p>
          </td>
        </tr>`;
}

// ─── The way back to the app ──────────────────────────────────────────────────

/**
 * The email's one link, «Apri Net Worth Tracker», a button under the verdict to `{appUrl}/dashboard`.
 *
 * `''` when the app URL is absent or not `https://`: a dev or emulator URL in a real inbox is a link
 * to nowhere. A table-cell button (bgcolor on the cell, the anchor inside) is the one shape Outlook
 * draws as a button; the colours are the print tokens' ink on the card (The Out-Of-DOM Token Rule),
 * and the button keeps its own width, so it reads the same at 390, 600 and 1440.
 */
export function emailAppLink(appUrl: string | undefined): string {
  if (!appUrl || !appUrl.startsWith('https://')) return '';
  const href = `${appUrl.replace(/\/+$/, '')}/dashboard`.replace(/"/g, '%22');
  return `        <tr>
          <td style="padding:0 32px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="${PRINT_COLORS.foreground}" style="background:${PRINT_COLORS.foreground};border-radius:8px;">
                  <a href="${href}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;line-height:1.2;color:${PRINT_COLORS.card};text-decoration:none;">${escapeHtml(EMAIL_APP_LINK_LABEL)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/** The eyebrow / scope line that opens the verdict and every tile. */
function headRow(eyebrow: string, scope: string): string {
  const right = scope ? `<td align="right" style="${SCOPE}">${escapeHtml(scope)}</td>` : '';
  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="${EYEBROW}">${escapeHtml(eyebrow)}</td>${right}</tr>
            </table>`;
}

// ─── The tile ─────────────────────────────────────────────────────────────────

export interface EmailTileOptions {
  /** The question this tile answers. */
  eyebrow: string;
  /** The window or count the figures are measured over. Empty when the tile has no scope. */
  scope?: string;
  /** The answer in words. Omitted when the tile's body speaks for itself. */
  reading?: Narrative | null;
  /** The figures, already rendered. */
  body?: string;
  /** A secondary fact under a rule — the tile's `mt-auto` footer in the app. */
  footer?: Narrative | string | null;
  /** Sets the tile on `--muted`; used by the AI comment, which is prose and not figures. */
  muted?: boolean;
}

/**
 * One tile: eyebrow · scope · reading · figures · footnote, separated from its neighbours by a
 * 1px rule rather than by a gap. One card containing ruled tiles, rather than a column of
 * separate cards, is what survives Outlook: there, radius and shadow are dropped and a stack of
 * cards degrades into a stack of hard rectangles.
 */
export function emailTile(options: EmailTileOptions): string {
  const background = options.muted ? `background:${PRINT_COLORS.surfaceMuted};` : '';
  const reading = options.reading
    ? `\n            <p style="${READING}">${renderNarrative(options.reading)}</p>`
    : '';
  const body = options.body ? `\n${options.body}` : '';
  const footer = options.footer
    ? `\n            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid ${PRINT_COLORS.border};">
              <tr><td style="padding-top:12px;${FOOTNOTE}">${typeof options.footer === 'string' ? options.footer : renderNarrative(options.footer)}</td></tr>
            </table>`
    : '';

  return `        <tr>
          <td style="padding:20px 32px;border-top:1px solid ${PRINT_COLORS.border};${background}">
${headRow(options.eyebrow, options.scope ?? '')}${reading}${body}${footer}
          </td>
        </tr>`;
}

// ─── Figure shapes ────────────────────────────────────────────────────────────

/** The single dominant number of a tile — the 36px hero. */
export function emailHero(value: string, colour: string = PRINT_COLORS.foreground): string {
  return `            <p style="margin:12px 0 0;${MONO}font-size:36px;font-weight:700;letter-spacing:-0.03em;line-height:1;color:${colour};">${escapeHtml(value)}</p>`;
}

export interface EmailKeyFigure {
  label: string;
  value: string;
  sign?: 'positive' | 'negative';
  muted?: boolean;
}

/** Two or three paired values under a hero — the 22px sub-hero step. */
export function emailKeyFigures(figures: EmailKeyFigure[]): string {
  if (figures.length === 0) return '';
  const width = `${Math.floor(100 / figures.length)}%`;
  const cells = figures
    .map((entry) => {
      const colour = signColor(entry.sign) ?? (entry.muted ? PRINT_COLORS.mutedForeground : PRINT_COLORS.foreground);
      return `<td width="${width}" valign="top" style="padding-right:12px;">
                  <div style="font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${PRINT_COLORS.mutedForeground};">${escapeHtml(entry.label)}</div>
                  <div style="margin-top:5px;${MONO}font-size:22px;font-weight:700;letter-spacing:-0.025em;line-height:1;color:${colour};">${escapeHtml(entry.value)}</div>
                </td>`;
    })
    .join('\n                ');

  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
              <tr>
                ${cells}
              </tr>
            </table>`;
}

export interface EmailRankedRow {
  label: string;
  /** A second line under the label — a date, a subcategory. */
  caption?: string;
  amount: string;
  /**
   * Colours the AMOUNT by sign, for the lists whose amount is a gain or a loss rather than a size
   * — a household residual, not a category total. Omitted everywhere else, where a ranked amount
   * is a magnitude and a green one would assert a verdict the list has no baseline for.
   */
  amountSign?: 'positive' | 'negative';
  /** The right-hand column: a share, a percentage change. Omitted for a bare list. */
  trailing?: string;
  trailingSign?: 'positive' | 'negative';
  /** 0-1, the row's length against the largest row. Omitted for rows without a bar. */
  fill?: number;
  /** The bar's colour; defaults to the one ranked hue. */
  fillHex?: string;
  /** The residual row: no bar, muted, closing a list that shows only its head. */
  residual?: boolean;
}

/**
 * The ranked list: label · 3px bar · amount · share.
 *
 * The bar's length carries the RANK, so every row shares one hue — a list of eleven expense
 * categories in eleven colours is a rainbow, not a ranking. Asset classes are the exception and
 * pass their own `fillHex`, because there a colour is an identity the app uses elsewhere.
 */
export function emailRankedRows(rows: EmailRankedRow[]): string {
  const body = rows
    .map((row, index) => {
      const last = index === rows.length - 1;
      const rule = last ? '' : `border-bottom:1px solid ${PRINT_COLORS.rowRule};`;
      const labelColour = row.residual ? PRINT_COLORS.mutedForeground : PRINT_COLORS.foreground;

      const caption = row.caption
        ? `<div style="font-size:11px;color:${PRINT_COLORS.mutedForeground};margin-top:2px;">${escapeHtml(row.caption)}</div>`
        : '';
      const bar = row.fill === undefined ? '' : barHtml(row.fill, row.fillHex ?? PRINT_RANK_HEX);

      // The amount keeps the label's ink unless the row asks for a sign: a ranked total is a size.
      const amountColour = signColor(row.amountSign) ?? labelColour;
      const trailingColour = signColor(row.trailingSign) ?? PRINT_COLORS.mutedForeground;
      const trailing =
        row.trailing === undefined
          ? ''
          : `<td align="right" valign="top" width="56" style="padding:7px 0;${rule}${MONO}font-size:12px;font-weight:600;color:${trailingColour};white-space:nowrap;">${escapeHtml(row.trailing)}</td>`;

      return `                <tr>
                  <td valign="top" style="padding:7px 0;${rule}font-size:13px;color:${labelColour};">${escapeHtml(row.label)}${caption}${bar}</td>
                  <td align="right" valign="top" width="96" style="padding:7px 0 7px 12px;${rule}${MONO}font-size:13px;color:${amountColour};white-space:nowrap;">${escapeHtml(row.amount)}</td>
                  ${trailing}
                </tr>`;
    })
    .join('\n');

  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse;">
${body}
            </table>`;
}

/** The 3px rank bar, as nested tables — the only bar shape Outlook draws at the right length. */
function barHtml(fill: number, hex: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(fill * 1000) / 10));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-collapse:collapse;">
                      <tr>
                        <td width="${pct}%" height="3" style="background:${hex};font-size:0;line-height:0;">&nbsp;</td>
                        <td height="3" style="background:${PRINT_COLORS.rowRule};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>`;
}

// ─── Comparison table ─────────────────────────────────────────────────────────

export interface EmailComparisonRow {
  label: string;
  baseline: string;
  change: string;
  /** Whether the change is a good one — expenses invert, so it cannot be read off the sign. */
  favourable: boolean | null;
}

/** The one table in the emails that is a table on purpose: metric · baseline · change. */
export function emailComparisonTable(headings: [string, string, string], rows: EmailComparisonRow[]): string {
  const head = headings
    .map((label, index) =>
      `<th ${index === 0 ? 'align="left"' : 'align="right"'} style="padding:0 0 8px;font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${PRINT_COLORS.mutedForeground};border-bottom:1px solid ${PRINT_COLORS.border};">${escapeHtml(label)}</th>`,
    )
    .join('');

  const body = rows
    .map((row, index) => {
      const rule = index === rows.length - 1 ? '' : `border-bottom:1px solid ${PRINT_COLORS.rowRule};`;
      const colour =
        row.favourable === null
          ? PRINT_COLORS.mutedForeground
          : row.favourable
            ? PRINT_COLORS.positive
            : PRINT_COLORS.negative;
      return `                <tr>
                  <td style="padding:8px 0;${rule}font-size:13px;color:${PRINT_COLORS.foreground};">${escapeHtml(row.label)}</td>
                  <td align="right" style="padding:8px 0;${rule}${MONO}font-size:13px;color:${PRINT_COLORS.mutedForeground};white-space:nowrap;">${escapeHtml(row.baseline)}</td>
                  <td align="right" style="padding:8px 0 8px 12px;${rule}${MONO}font-size:13px;font-weight:600;color:${colour};white-space:nowrap;">${escapeHtml(row.change)}</td>
                </tr>`;
    })
    .join('\n');

  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse;">
              <tr>${head}</tr>
${body}
            </table>`;
}

// ─── Prose ────────────────────────────────────────────────────────────────────

/**
 * The AI comment's body: already-sanitised HTML paragraphs at the reading size, on the muted
 * ground its tile carries. Line height is looser than a tile reading (1.7 against 1.45) because
 * this is the one block in the email that is read as prose rather than scanned.
 */
/** A markdown table row: `| a | b |`. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** The rule under a table's header: `|---|:---:|`. */
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** A cell that reads as a figure — "+5.000 €", "48,3%", "−1,1 p.p." — is right-aligned, like the tiles. */
const FIGURE_CELL = /^(<strong>)?[+\-−≈~]?\s*\d/;

function tableCells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * A markdown table as an email table: one line of HTML, so the later newline → `<br/>` pass adds
 * nothing inside it. A column is right-aligned when every body cell of it is a figure. Inside a
 * scrolling block, so a wide table does not widen the email on a phone.
 */
function markdownTableToHtml(header: string[], body: string[][]): string {
  const figureColumn = header.map((_, index) => body.length > 0 && body.every((row) => FIGURE_CELL.test(row[index] ?? '')));
  const align = (index: number) => (figureColumn[index] ? 'right' : 'left');
  const cell = (tag: 'th' | 'td', text: string, index: number) =>
    tag === 'th'
      ? `<th style="text-align:${align(index)};padding:4px 8px;border-bottom:1px solid ${PRINT_COLORS.border};font-size:11px;font-weight:600;color:${PRINT_COLORS.mutedForeground};">${text}</th>`
      : `<td style="text-align:${align(index)};padding:4px 8px;border-bottom:1px solid ${PRINT_COLORS.rowRule};${figureColumn[index] ? 'white-space:nowrap;' : ''}">${text}</td>`;
  const head = `<tr>${header.map((text, index) => cell('th', text, index)).join('')}</tr>`;
  const rows = body.map((row) => `<tr>${header.map((_, index) => cell('td', row[index] ?? '', index)).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto;margin:8px 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;line-height:1.5;">${head}${rows}</table></div>`;
}

function markdownTablesToHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (TABLE_ROW.test(lines[index]) && TABLE_RULE.test(lines[index + 1] ?? '')) {
      const header = tableCells(lines[index]);
      const body: string[][] = [];
      let next = index + 2;
      while (next < lines.length && TABLE_ROW.test(lines[next])) body.push(tableCells(lines[next++]));
      out.push(markdownTableToHtml(header, body));
      index = next - 1;
    } else {
      out.push(lines[index]);
    }
  }
  return out.join('\n');
}

/** An indented bullet: `  - voce`, a sub-item of the item above it. */
const SUB_ITEM = /^[ \t]+[-*] (.+)$/;
/** A top-level item a sub-list can hang from: `- voce` or `1. voce`. */
const PARENT_ITEM = /^(- |\d+\. )/;
const SUB_OPEN = '§SUB§';
const SUB_SEP = '§SEP§';
const SUB_CLOSE = '§/SUB§';

/**
 * Indented bullets folded into the line of the item above them, as one placeholder the list passes
 * expand into a nested `<ul>` at the end — so a sub-list is never printed as «  - voce» (seen in
 * both models' emails on 2026-11-28) and never puts a `</li>` inside its parent before the parent's
 * own list is wrapped. A blank line between the parent and its sub-items, or between two sub-items,
 * is dropped. Indented bullets with no item above are plain bullets.
 */
function foldSubLists(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!SUB_ITEM.test(lines[index])) {
      out.push(lines[index]);
      continue;
    }
    const items: string[] = [];
    let next = index;
    while (next < lines.length && (SUB_ITEM.test(lines[next]) || (lines[next].trim() === '' && SUB_ITEM.test(lines[next + 1] ?? '')))) {
      const match = lines[next].match(SUB_ITEM);
      if (match) items.push(match[1]);
      next++;
    }
    while (out.length > 0 && out[out.length - 1].trim() === '' && PARENT_ITEM.test(out[out.length - 2] ?? '')) out.pop();
    const parent = out.length > 0 ? out[out.length - 1] : '';
    if (PARENT_ITEM.test(parent)) out[out.length - 1] = `${parent}${SUB_OPEN}${items.join(SUB_SEP)}${SUB_CLOSE}`;
    else out.push(...items.map((item) => `- ${item}`));
    index = next - 1;
  }
  return out.join('\n');
}

/**
 * The AI comment's markdown as email-safe HTML: bold, italics, headings at any level, bullet and
 * numbered lists with one level of sub-items, tables; `---` rules removed (the headings already
 * separate the sections). No `marked` dependency — the output is narrow and predictable.
 *
 * A list and a table are written on ONE line each: a newline inside them would become a `<br/>`,
 * an empty line between two bullets (seen in the October 2026 email, 2026-11-28).
 */
export function emailMarkdownToHtml(text: string): string {
  // Ordered list items use a placeholder so they can be collapsed and wrapped independently
  // from unordered items before the final <br/> conversion runs.
  const OLI_OPEN = '§OLI§';
  const OLI_CLOSE = '§/OLI§';

  return foldSubLists(markdownTablesToHtml(
    text
      // Strip <details>/<summary> blocks — the AI occasionally wraps content in collapsible HTML,
      // which email clients render as interactive elements
      .replace(/<summary[^>]*>[\s\S]*?<\/summary>/gi, '')
      .replace(/<\/?details[^>]*>/gi, '')
      // Remove horizontal rules (--- or ***), never a table's own rule (it starts with |)
      .replace(/^[-*]{3,}\s*$/gm, '')
      // Bold (must run before single-asterisk italic to avoid conflict)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic — single asterisk emphasis (e.g. *Limite del dato*)
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>'),
  ))
    // Any-level headings (# ## ###) → compact bold paragraph
    .replace(
      /^#{1,3}\s+(.+)$/gm,
      `<p style="margin:16px 0 2px;font-size:13px;font-weight:600;color:${PRINT_COLORS.foreground};">$1</p>`,
    )
    // Ordered list items (1. 2. 3.) — must run before bullet items to avoid conflicts
    .replace(/^\d+\. (.+)$/gm, `${OLI_OPEN}$1${OLI_CLOSE}`)
    // Collapse blank lines between consecutive ordered items so they group into one <ol>
    .replace(new RegExp(`(${OLI_CLOSE})\\n\\n(${OLI_OPEN})`, 'g'), `$1\n$2`)
    // Wrap consecutive ordered item runs in <ol>, on one line
    .replace(
      new RegExp(`(${OLI_OPEN}[\\s\\S]*?${OLI_CLOSE}\\n?)+`, 'g'),
      (match) =>
        `<ol style="margin:4px 0 4px 16px;padding:0;list-style:decimal;">${match
          .replace(/\n/g, '')
          .replace(new RegExp(OLI_OPEN, 'g'), '<li style="margin:5px 0;padding-left:0;">')
          .replace(new RegExp(OLI_CLOSE, 'g'), '</li>')}</ol>`,
    )
    // Unordered bullet items
    .replace(/^- (.+)$/gm, '<li style="margin:1px 0;padding-left:0;">$1</li>')
    // Collapse blank lines between consecutive unordered items so they merge into one <ul>
    .replace(/(<\/li>)\n\n(<li)/g, '$1\n$2')
    // Wrap consecutive bullet <li> runs in a <ul>, on one line — only the bullets' own style, or
    // the items of an <ol> above would get a <ul> inside it
    .replace(
      /(<li style="margin:1px 0;[^>]*>[\s\S]*?<\/li>\n?)+/g,
      (match) => `<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc;">${match.replace(/\n/g, '')}</ul>`,
    )
    // Collapse 3+ newlines to 2 (avoid giant gaps left by removed ---)
    .replace(/\n{3,}/g, '\n\n')
    // Double newline → two line breaks (paragraph-like spacing without block-level margins)
    .replace(/\n\n/g, '<br/><br/>')
    // Single remaining newlines → line break
    .replace(/\n/g, '<br/>')
    // A heading, a list and a table carry their own margins: no <br/> doubles them
    .replace(/(<br\/>)+(<p style="margin:\d+px)/g, '$2')
    .replace(/<\/p>(<br\/>)+/g, '</p>')
    .replace(/<\/(ul|ol)>(<br\/>)+/g, '</$1>')
    .replace(/(<br\/>)+(<(ul|ol))/g, '$2')
    .replace(/<\/table><\/div>(<br\/>)+/g, '</table></div>')
    .replace(/(<br\/>)+(<div style="overflow-x:auto)/g, '$2')
    // The folded sub-lists, last: a nested <ul> inside the item they belong to
    .replace(
      new RegExp(`${SUB_OPEN}([\\s\\S]*?)${SUB_CLOSE}`, 'g'),
      (_, items: string) =>
        `<ul style="margin:2px 0 2px 16px;padding:0;list-style:circle;">${items
          .split(SUB_SEP)
          .map((item) => `<li style="margin:1px 0;padding-left:0;">${item}</li>`)
          .join('')}</ul>`,
    );
}

export function emailProse(html: string): string {
  return `            <div style="margin:10px 0 0;font-size:13px;line-height:1.7;color:${PRINT_COLORS.foreground};">${html}</div>`;
}

/** A severity rail beside a row — the budget alert's only chrome. */
export function emailAlertRows(
  alerts: Array<{ label: string; caption: string; level: 'exceeded' | 'warning' }>,
): string {
  const body = alerts
    .map((alert, index) => {
      const rule = index === alerts.length - 1 ? '' : `border-bottom:1px solid ${PRINT_COLORS.rowRule};`;
      const colour = alert.level === 'exceeded' ? PRINT_COLORS.negative : PRINT_COLORS.warning;
      return `                <tr>
                  <td width="3" style="padding:9px 0;${rule}"><div style="width:3px;height:100%;min-height:28px;background:${colour};font-size:0;line-height:0;">&nbsp;</div></td>
                  <td style="padding:9px 0 9px 12px;${rule}">
                    <div style="font-size:13px;color:${PRINT_COLORS.foreground};">${escapeHtml(alert.label)}</div>
                    <div style="margin-top:3px;${MONO}font-size:11px;color:${colour};">${escapeHtml(alert.caption)}</div>
                  </td>
                </tr>`;
    })
    .join('\n');

  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse;">
${body}
            </table>`;
}
