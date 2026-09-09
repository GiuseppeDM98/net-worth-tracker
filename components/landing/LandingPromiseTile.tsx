import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import type { LandingPromise } from '@/lib/utils/landingNarrative';

interface LandingPromiseTileProps {
  promise: LandingPromise;
  className?: string;
}

/**
 * A tile of the landing that shows NO figures: it names a section of the app and states what
 * that section computes, one measure per row.
 *
 * It keeps the tile's cadence — eyebrow (the section), aside (its scope), reading (the answer
 * in words), then the rows — so it sits in the same grid as the four tiles that carry the
 * sample profile without reading as a different kind of object. What it deliberately does NOT
 * do is print numbers: those four tiles already carry an invented profile, and four more
 * invented figures here would make the whole page a mock-up of itself. The one figure a
 * reading may hold is a fact about the TOOL (how many model portfolios, how many simulated
 * paths), read from the module that owns it.
 *
 * The caption sits under its label until `desktop:`, where the row has the width to put the
 * two on one line — a 358px phone would break the label onto two lines instead.
 */
export function LandingPromiseTile({ promise, className }: LandingPromiseTileProps) {
  return (
    <Tile
      eyebrow={promise.eyebrow}
      aside="cosa calcola"
      reading={promise.reading}
      ariaLabel={`${promise.eyebrow}: cosa calcola`}
      className={className}
    >
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {promise.rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-col gap-0.5 py-2.5 desktop:flex-row desktop:items-baseline desktop:justify-between desktop:gap-4"
          >
            <span className="text-[13px] text-foreground desktop:shrink-0">{row.label}</span>
            <NarrativeText
              segments={row.caption}
              className="min-w-0 text-[11px] leading-[1.4] text-muted-foreground desktop:text-right"
            />
          </li>
        ))}
      </ul>
    </Tile>
  );
}
