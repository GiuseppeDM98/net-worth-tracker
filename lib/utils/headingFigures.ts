/**
 * The figures inside a heading's text. A costume theme draws the verdict's headline and the
 * eyebrows in its own face, and a digit there must stay Geist Mono (DESIGN.md → The Mono Mandate,
 * The Costume Rule): `HeadingText` (components/ui/theme-costume.tsx) wraps each figure this
 * returns in a `.costume-figure` span. Outside a costume theme the span is inert.
 */

export interface HeadingPart {
  text: string;
  figure: boolean;
}

// A figure starts where no letter or digit precedes it and ends on a digit, «%» or «€» (a full stop stays prose);
// «/» and «:» inside it keep a date and a time whole (The Mono Mandate: a structured date is a figure).
const FIGURE = /(?<![\p{L}\p{N}])[+\-−]?\d(?:[\d.,/:]*\d)?(?:\s?[%€])?/gu;

export function splitHeadingFigures(text: string): HeadingPart[] {
  const parts: HeadingPart[] = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), figure: false });
    parts.push({ text: match[0], figure: true });
    last = start + match[0].length;
  }
  return last < text.length ? [...parts, { text: text.slice(last), figure: false }] : parts;
}
