/**
 * A heading's text with each figure in a `.costume-figure` span, so a digit stays Geist Mono under a
 * costume theme's heading face (DESIGN.md → The Mono Mandate, The Costume Rule); outside a costume no
 * rule names the class. A module of its own, with no hooks: `Tile` and `PageVerdict` render it and
 * stay free of the colour-theme context (`components/ui/theme-costume.tsx` re-exports it).
 */
import { splitHeadingFigures } from '@/lib/utils/headingFigures';

export function HeadingText({ text }: { text: string }) {
  return (
    <>
      {splitHeadingFigures(text).map((part, index) =>
        part.figure ? (
          <span key={index} className="costume-figure">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
