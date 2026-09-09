/**
 * The HTML vocabulary the two periodic emails share: the shell, the verdict, the tile, and the
 * few figure shapes a tile can contain.
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

      const trailingColour = signColor(row.trailingSign) ?? PRINT_COLORS.mutedForeground;
      const trailing =
        row.trailing === undefined
          ? ''
          : `<td align="right" valign="top" width="56" style="padding:7px 0;${rule}${MONO}font-size:12px;font-weight:600;color:${trailingColour};white-space:nowrap;">${escapeHtml(row.trailing)}</td>`;

      return `                <tr>
                  <td valign="top" style="padding:7px 0;${rule}font-size:13px;color:${labelColour};">${escapeHtml(row.label)}${caption}${bar}</td>
                  <td align="right" valign="top" width="96" style="padding:7px 0 7px 12px;${rule}${MONO}font-size:13px;color:${labelColour};white-space:nowrap;">${escapeHtml(row.amount)}</td>
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

/**
 * The budget track: a 3px bar whose fill is what has been used and whose 1px mark is TODAY on
 * the budget's own window (day of month for a monthly budget, day of year for an annual one).
 *
 * The two numbers only mean something together — "96% of the ceiling at 97% of the month" is
 * legible at a glance precisely because they are drawn on the same line. Out of the DOM there
 * is no positioning to overlay the mark with, so the row is SPLIT at both points instead: the
 * cell order changes depending on whether the fill has passed the mark.
 */
export function emailBudgetTrack(usedPct: number, markPct: number | null, hex: string): string {
  const used = Math.max(0, Math.min(100, usedPct));
  const cell = (width: string, background: string) =>
    `<td width="${width}" height="3" style="background:${background};font-size:0;line-height:0;">&nbsp;</td>`;

  let cells: string;
  if (markPct === null) {
    cells = cell(`${used}%`, hex) + cell(`${100 - used}%`, PRINT_COLORS.rowRule);
  } else {
    const mark = Math.max(0, Math.min(100, markPct));
    const markCell = `<td width="1" height="7" style="background:${PRINT_COLORS.mutedForeground};font-size:0;line-height:0;">&nbsp;</td>`;
    cells =
      used <= mark
        ? cell(`${used}%`, hex) + cell(`${mark - used}%`, PRINT_COLORS.rowRule) + markCell + cell(`${100 - mark}%`, PRINT_COLORS.rowRule)
        : cell(`${mark}%`, hex) + markCell + cell(`${used - mark}%`, hex) + cell(`${100 - used}%`, PRINT_COLORS.rowRule);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:7px;border-collapse:collapse;">
                      <tr>${cells}</tr>
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

/** A budget row: label, figures, the track with today's mark, and an optional note under it. */
export function emailBudgetRow(options: {
  label: string;
  scope?: string;
  scopeLevel?: 'exceeded' | 'warning';
  figures: string;
  usedPct: number;
  markPct: number | null;
  hex: string;
  note?: string;
  breakdown?: string;
  last?: boolean;
}): string {
  const rule = options.last ? '' : `border-bottom:1px solid ${PRINT_COLORS.rowRule};`;
  const scopeColour =
    options.scopeLevel === 'exceeded'
      ? PRINT_COLORS.negative
      : options.scopeLevel === 'warning'
        ? PRINT_COLORS.warning
        : PRINT_COLORS.mutedForeground;
  const scope = options.scope
    ? ` <span style="font-size:10px;color:${scopeColour};">· ${escapeHtml(options.scope)}</span>`
    : '';
  const note = options.note
    ? `<div style="margin-top:5px;${MONO}font-size:11px;color:${PRINT_COLORS.mutedForeground};">${escapeHtml(options.note)}</div>`
    : '';

  return `                <tr>
                  <td style="padding:9px 0;${rule}">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:13px;color:${PRINT_COLORS.foreground};">${escapeHtml(options.label)}${scope}</td>
                        <td align="right" style="${MONO}font-size:12px;color:${PRINT_COLORS.mutedForeground};white-space:nowrap;">${options.figures}</td>
                      </tr>
                    </table>
                    ${emailBudgetTrack(options.usedPct, options.markPct, options.hex)}
                    ${note}${options.breakdown ?? ''}
                  </td>
                </tr>`;
}

/** Wraps budget rows in the table their tile expects. */
export function emailBudgetRows(rows: string[]): string {
  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse;">
${rows.join('\n')}
            </table>`;
}
