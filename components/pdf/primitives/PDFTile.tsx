// components/pdf/primitives/PDFTile.tsx
// The PDF's shared chrome: the page, the section head, the reading line, and the two figure
// shapes a section can contain.

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { PRINT_COLORS, PDF_FONTS, PRINT_RANK_HEX } from '@/lib/constants/printTokens';
import type { Narrative, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import { pdfSafeText } from '@/lib/utils/pdfNarrative';

/**
 * The report's type ramp and spacing, in POINTS.
 *
 * `@react-pdf/renderer` measures in points (72 per inch), while DESIGN.md's ramp is in CSS
 * pixels (96 per inch): every step below is the documented pixel size divided by 4/3, so the
 * printed page carries the same hierarchy the screen does at the same physical size. A4 is
 * 595×842pt; the 44pt margin leaves a 507pt column.
 *
 * There is no monospace face here — see `PDF_FONTS` for why, and note the consequence: numeric
 * alignment comes from fixed-width, right-aligned COLUMNS, so a numeric column must always
 * declare its width.
 */
export const PDF_RAMP = {
  eyebrow: 7,
  scope: 7.5,
  reading: 9.5,
  verdict: 22,
  hero: 26,
  metricLabel: 6.5,
  metricValue: 15,
  metricNote: 7.5,
  tableHead: 6.5,
  tableCell: 8.5,
  caption: 7.5,
  footer: 7,
} as const;

export const PDF_PAGE_MARGIN = 44;

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE_MARGIN,
    paddingBottom: PDF_PAGE_MARGIN + 22, // room for the fixed footer
    paddingHorizontal: PDF_PAGE_MARGIN,
    backgroundColor: PRINT_COLORS.background,
    fontFamily: PDF_FONTS.regular,
    color: PRINT_COLORS.foreground,
  },
  pageHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontSize: PDF_RAMP.eyebrow,
    fontFamily: PDF_FONTS.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: PRINT_COLORS.mutedForeground,
  },
  rule: {
    height: 1,
    backgroundColor: PRINT_COLORS.border,
    marginTop: 7,
  },
  footer: {
    position: 'absolute',
    left: PDF_PAGE_MARGIN,
    right: PDF_PAGE_MARGIN,
    bottom: 26,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 7,
  },
  footerText: {
    fontSize: PDF_RAMP.footer,
    color: PRINT_COLORS.mutedForeground,
  },

  section: { marginTop: 22 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 6,
  },
  scope: { fontSize: PDF_RAMP.scope, color: PRINT_COLORS.mutedForeground },
  reading: { fontSize: PDF_RAMP.reading, lineHeight: 1.5, marginTop: 7 },

  metricsRow: { flexDirection: 'row', marginTop: 12 },
  metric: {
    backgroundColor: PRINT_COLORS.surfaceMuted,
    borderRadius: 7,
    padding: 11,
    marginRight: 9,
  },
  metricLabel: {
    fontSize: PDF_RAMP.metricLabel,
    fontFamily: PDF_FONTS.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PRINT_COLORS.mutedForeground,
  },
  metricValue: { fontSize: PDF_RAMP.metricValue, fontFamily: PDF_FONTS.bold, marginTop: 6 },
  metricNote: { fontSize: PDF_RAMP.metricNote, color: PRINT_COLORS.mutedForeground, marginTop: 5 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: PRINT_COLORS.rowRule,
  },
  rowLabel: { fontSize: PDF_RAMP.tableCell },
  rowCaption: { fontSize: PDF_RAMP.caption, color: PRINT_COLORS.mutedForeground, marginTop: 2 },
  track: { height: 2.5, backgroundColor: PRINT_COLORS.rowRule, marginTop: 5 },
  fill: { height: 2.5 },

  note: { fontSize: PDF_RAMP.caption, lineHeight: 1.6, color: PRINT_COLORS.mutedForeground, marginTop: 10 },
  hero: { fontSize: PDF_RAMP.hero, fontFamily: PDF_FONTS.bold, marginTop: 9 },
  verdict: { fontSize: PDF_RAMP.verdict, fontFamily: PDF_FONTS.bold, lineHeight: 1.2 },
});

/** The colour a verdict's full stop takes — the one thing tone paints. */
function toneColor(tone: VerdictTone): string {
  if (tone === 'positive') return PRINT_COLORS.positive;
  if (tone === 'negative') return PRINT_COLORS.negative;
  if (tone === 'warning') return PRINT_COLORS.warning;
  return PRINT_COLORS.mutedForeground;
}

function signColor(sign: 'positive' | 'negative' | undefined): string | undefined {
  if (sign === 'positive') return PRINT_COLORS.positive;
  if (sign === 'negative') return PRINT_COLORS.negative;
  return undefined;
}

/**
 * A generated sentence, rendered as one `<Text>` with the figures nested inside it.
 *
 * `mono` cannot change the face here (there is no Geist in a PDF), so a figure is marked by
 * WEIGHT and by its sign colour instead. Nesting keeps it one text flow, so the line wraps
 * like prose rather than breaking into blocks.
 */
export function PDFNarrative({ segments, style }: { segments: Narrative; style?: Style | Style[] }) {
  return (
    <Text style={style ? [styles.reading, ...(Array.isArray(style) ? style : [style])] : styles.reading}>
      {segments.map((segment, index) => (
        <Text
          key={index}
          style={{
            fontFamily: segment.mono ? PDF_FONTS.bold : PDF_FONTS.regular,
            color: signColor(segment.sign) ?? PRINT_COLORS.foreground,
          }}
        >
          {pdfSafeText(segment.text)}
        </Text>
      ))}
    </Text>
  );
}

/** The report's opening: the headline, its tone-coloured stop, then the facts. */
export function PDFVerdict({ verdict }: { verdict: PageVerdictModel }) {
  const stop = verdict.headline.endsWith('.') ? '.' : '';
  const stem = stop ? verdict.headline.slice(0, -1) : verdict.headline;
  return (
    <View>
      <Text style={styles.verdict}>
        {pdfSafeText(stem)}
        <Text style={{ color: toneColor(verdict.tone) }}>{stop}</Text>
      </Text>
      <PDFNarrative segments={verdict.sentence} style={{ marginTop: 12, fontSize: 10 }} />
    </View>
  );
}

interface PDFPageProps {
  /** Left of the page's head strip: what the report is. */
  eyebrow: string;
  /** Right of the head strip: which section this page belongs to. */
  section: string;
  /** Left of the footer; the page number is added on the right. */
  footerNote: string;
  children: React.ReactNode;
}

/**
 * One page of the report.
 *
 * Every section used to repeat this chrome — a page style, a blue title, a 2px blue divider and
 * a footer — in eight files, which is how the divider ended up 2px in six of them and 1px in
 * two. It is one component now, and the accent is gone with it: a report about achromatic data
 * has no reason to carry a brand colour (The Zero-Chroma Rule).
 */
export function PDFPage({ eyebrow, section, footerNote, children }: PDFPageProps) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageHead}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.eyebrow}>{section}</Text>
      </View>
      <View style={styles.rule} />

      {children}

      <View style={styles.footer} fixed>
        <View style={styles.rule} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{footerNote}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </View>
    </Page>
  );
}

interface PDFSectionProps {
  /** The question this block answers. */
  eyebrow: string;
  /** Its window, its count — whatever bounds the figures. */
  scope?: string;
  /** The answer in words, before the figures. */
  reading?: Narrative | null;
  /** Draws the hairline under the head. The first block of a page usually does not need it. */
  ruled?: boolean;
  children?: React.ReactNode;
}

/** A block inside a page: eyebrow · scope · reading · figures. The tile's cadence, on paper. */
export function PDFSection({ eyebrow, scope, reading, ruled = true, children }: PDFSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {scope ? <Text style={styles.scope}>{pdfSafeText(scope)}</Text> : null}
      </View>
      {ruled ? <View style={[styles.rule, { marginTop: 0 }]} /> : null}
      {reading ? <PDFNarrative segments={reading} /> : null}
      {children}
    </View>
  );
}

export interface PDFMetric {
  label: string;
  value: string;
  note?: string;
  sign?: 'positive' | 'negative' | 'warning';
}

function metricColor(sign: PDFMetric['sign']): string {
  if (sign === 'positive') return PRINT_COLORS.positive;
  if (sign === 'negative') return PRINT_COLORS.negative;
  if (sign === 'warning') return PRINT_COLORS.warning;
  return PRINT_COLORS.foreground;
}

/**
 * A row of figures on the muted ground.
 *
 * No borders: on white paper a 1px rule at 0.92 lightness is invisible, so grouping is carried
 * by a 4%-ink fill instead — which also survives a photocopy, where a hairline does not.
 * `perRow` defaults to three; the last cell of each row drops its right margin so the row ends
 * flush with the text column.
 */
export function PDFMetrics({ items, perRow = 3 }: { items: PDFMetric[]; perRow?: number }) {
  const rows: PDFMetric[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  const width = `${(100 - (perRow - 1) * 1.8) / perRow}%`;

  return (
    <>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.metricsRow}>
          {row.map((metric, index) => (
            <View
              key={metric.label}
              style={[styles.metric, { width }, index === row.length - 1 ? { marginRight: 0 } : {}]}
            >
              <Text style={styles.metricLabel}>{pdfSafeText(metric.label)}</Text>
              <Text style={[styles.metricValue, { color: metricColor(metric.sign) }]}>{pdfSafeText(metric.value)}</Text>
              {metric.note ? <Text style={styles.metricNote}>{pdfSafeText(metric.note)}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

export interface PDFRankedRow {
  label: string;
  caption?: string;
  amount: string;
  /** The right-hand column: a share, a delta. */
  trailing?: string;
  trailingSign?: 'positive' | 'negative';
  /** 0-1 against the largest row. Omitted for a list without a rank. */
  fill?: number;
  fillHex?: string;
  /** The muted row that closes a partial list, so the shares reach 100%. */
  residual?: boolean;
}

/**
 * The ranked list: label · 2.5pt bar · amount · share.
 *
 * One hue for every row — the bar's LENGTH is the rank. Asset classes pass their own `fillHex`,
 * because there the colour is an identity the app uses on every chart.
 */
export function PDFRankedRows({ rows }: { rows: PDFRankedRow[] }) {
  return (
    <View style={{ marginTop: 9 }}>
      {rows.map((row, index) => {
        const colour = row.residual ? PRINT_COLORS.mutedForeground : PRINT_COLORS.foreground;
        const last = index === rows.length - 1;
        return (
          <View key={`${row.label}-${index}`} style={[styles.row, last ? { borderBottomWidth: 0 } : {}]}>
            <View style={{ flexGrow: 1, flexShrink: 1 }}>
              <Text style={[styles.rowLabel, { color: colour }]}>{pdfSafeText(row.label)}</Text>
              {row.caption ? <Text style={styles.rowCaption}>{pdfSafeText(row.caption)}</Text> : null}
              {row.fill === undefined ? null : (
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.max(0, Math.min(100, row.fill * 100))}%`,
                        backgroundColor: row.fillHex ?? PRINT_RANK_HEX,
                      },
                    ]}
                  />
                </View>
              )}
            </View>
            <Text style={[styles.rowLabel, { width: 72, textAlign: 'right', color: colour }]}>{pdfSafeText(row.amount)}</Text>
            {row.trailing === undefined ? null : (
              <Text
                style={[
                  styles.rowCaption,
                  {
                    width: 52,
                    textAlign: 'right',
                    marginTop: 0,
                    color: signColor(row.trailingSign) ?? PRINT_COLORS.mutedForeground,
                  },
                ]}
              >
                {pdfSafeText(row.trailing)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** A muted caption under a block — a definition, a limit, a source. */
export function PDFNote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.note}>{typeof children === 'string' ? pdfSafeText(children) : children}</Text>;
}

/** The single dominant number of a page. */
export function PDFHero({ value, sign }: { value: string; sign?: 'positive' | 'negative' }) {
  return <Text style={[styles.hero, { color: signColor(sign) ?? PRINT_COLORS.foreground }]}>{pdfSafeText(value)}</Text>;
}
