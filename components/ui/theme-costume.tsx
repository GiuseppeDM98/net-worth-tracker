'use client';

/**
 * The React parts of a costume theme (DESIGN.md → The Costume Rule; doc/guide/temi.md § Il costume):
 * the emblem beside a page's name, the band under the header, the figures of a heading (`HeadingText`,
 * re-exported from its own hook-free module). Outside a costume theme, or outside the dashboard, each
 * renders what was there before: no emblem, a band with no height, a span no rule names.
 */
import type { ReactNode } from 'react';
// From ColorThemeContext, not CostumeScopeContext: the shared bundle (see `CostumeScopeContext` there).
import { useColorTheme, useThemeCostume } from '@/contexts/ColorThemeContext';
import { EMBLEM_TONE_COLOR, resolveEmblem, type EmblemArt, type EmblemPage } from '@/lib/constants/themeCostume';

export { HeadingText } from '@/components/ui/heading-text';

/** An emblem's art: decorative, hidden from the reader, stroked with the scope's tokens. */
export function EmblemSvg({ art, size }: { art: EmblemArt; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={art.viewBox}
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Never on paper: the print reset is CSS and cannot reach a React mark.
      className="shrink-0 self-center print:hidden"
    >
      {art.shapes.map((shape, index) => {
        const style = { stroke: EMBLEM_TONE_COLOR[shape.tone], strokeWidth: shape.strokeWidth };
        if (shape.kind === 'path') return <path key={index} d={shape.d} style={style} />;
        if (shape.kind === 'circle') return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} style={style} />;
        return (
          <ellipse
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            rx={shape.rx}
            ry={shape.ry}
            transform={`rotate(${shape.rotate} ${shape.cx} ${shape.cy})`}
            style={style}
          />
        );
      })}
    </svg>
  );
}

/** The active theme's emblem for a page, or nothing (a palette theme, or out of scope). */
export function ThemeEmblem({ page, size }: { page?: EmblemPage; size: number }) {
  const { colorTheme } = useColorTheme();
  const art = resolveEmblem(colorTheme, page, useThemeCostume() !== null);
  return art ? <EmblemSvg art={art} size={size} /> : null;
}

/** A heading with the emblem before it; without an emblem the heading alone, the DOM of a palette theme. */
export function ThemeEmblemLead({ page, size, children }: { page?: EmblemPage; size: number; children: ReactNode }) {
  const { colorTheme } = useColorTheme();
  const art = resolveEmblem(colorTheme, page, useThemeCostume() !== null);
  if (!art) return <>{children}</>;
  // A `div`: it wraps an `h1`.
  return (
    <div className="flex min-w-0 items-center gap-2">
      <EmblemSvg art={art} size={size} />
      {children}
    </div>
  );
}

/**
 * The band under the page header, always in the DOM: only a costume's `--costume-header-band-height`
 * gives it a height (globals.css → Theme costume), so the prerendered first paint already holds it.
 */
export function ThemeHeaderBand() {
  return <div aria-hidden="true" className="costume-header-band" />;
}
