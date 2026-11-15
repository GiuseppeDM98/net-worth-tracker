'use client';

/**
 * RingChart — the parts of ONE positive whole as a thin ring with the total in its hole (DESIGN.md →
 * The Ring Rule, 2026-11-12); the tile's rows are its legend. Hand-written SVG on the model of
 * `BalanceRing`, with plain `<circle>`s: `motion.circle` reads `pathLength` as Framer's drawing value
 * and rewrites the dashes. No draw-in on mount; the arcs glide when the parts change, at once under
 * reduced motion.
 */
import { useReducedMotion } from 'framer-motion';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import {
  RING_DEFAULT_SIZE,
  RING_RADIUS,
  RING_STROKE,
  RING_VIEWBOX,
  buildRingArcs,
  describeRingSegments,
  formatRingCenter,
  ringCenterFontPx,
  ringCenterMaxChars,
  type RingSegment,
} from '@/lib/utils/ringChart';

/** Ring and rows side by side from a 400px container (the parent carries `@container`), stacked below it. */
export const RING_LAYOUT_CLASS = 'flex flex-col items-center gap-4 @min-[400px]:flex-row @min-[400px]:gap-5';
/** The rows' column inside `RING_LAYOUT_CLASS`. */
export const RING_ROWS_CLASS = 'w-full min-w-0 @min-[400px]:flex-1';

const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'; // ease-out-quart (lib/utils/motionVariants.ts)
const ARC_TRANSITION = `stroke-dasharray 400ms ${EASE}, stroke-dashoffset 400ms ${EASE}`;

export interface RingChartProps {
  /** The parts, largest first — folded by the host when its rows fold (`foldRingSegments`). */
  segments: RingSegment[];
  /** The whole in euros (≥ 0), the sum of the parts. */
  centerValue: number;
  /** One word under the figure («entrate», «versati»), at most 10 characters. */
  centerLabel: string;
  /** The ring's name; the text alternative appends each part's share and the total. */
  ariaLabel: string;
  size?: number;
}

export function RingChart({ segments, centerValue, centerLabel, ariaLabel, size = RING_DEFAULT_SIZE }: RingChartProps) {
  const reducedMotion = useReducedMotion();
  const arcs = buildRingArcs(segments);
  // One part is a sentence, not a ring: no host can show a ring of a single colour (The Ring Rule).
  if (arcs.length < 2) return null;

  const maxChars = ringCenterMaxChars(size);
  const inHole = formatRingCenter(centerValue, maxChars);
  const full = cachedFormatCurrencyEUR(centerValue, true);
  const name = `${ariaLabel}: ${describeRingSegments(segments)}; ${centerLabel} ${full}`;
  const transition = reducedMotion ? 'none' : ARC_TRANSITION;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5" data-ring="" data-ring-max-chars={maxChars}>
      {!inHole && (
        // No form fits the hole: the figure stands whole above the ring, never across the arc.
        <p className="whitespace-nowrap text-center" aria-hidden="true" data-ring-center="above">
          <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{full}</span>{' '}
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
        </p>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`}
          role="img"
          aria-label={name}
          className="-rotate-90"
        >
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={RING_VIEWBOX / 2}
              cy={RING_VIEWBOX / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={RING_STROKE}
              strokeLinecap="butt"
              pathLength={100}
              style={{
                strokeDasharray: `${arc.length} ${100 - arc.length}`,
                strokeDashoffset: -arc.offset,
                transition,
              }}
            />
          ))}
        </svg>
        {inHole && (
          // The text alternative names the total; the printed figure is for the eye.
          <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
            <span
              data-ring-center="hole"
              style={{ fontSize: ringCenterFontPx(size) }}
              className="whitespace-nowrap font-mono font-semibold leading-none tabular-nums text-foreground"
            >
              {inHole}
            </span>
            <span className="mt-1 text-[11px] leading-[13px] text-muted-foreground">{centerLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
