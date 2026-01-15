'use client';

/**
 * CustomChartDot Component
 *
 * Custom Recharts dot renderer for snapshot charts with note indicators.
 * Renders different dot styles based on whether a note exists for the data point.
 *
 * Features:
 * - Amber highlighted dots with message icon for snapshots with notes
 * - Standard blue dots for snapshots without notes
 * - Responsive sizing for mobile vs desktop
 * - Larger invisible hitbox on mobile for better touch targets
 *
 * @param cx - X coordinate from Recharts
 * @param cy - Y coordinate from Recharts
 * @param payload - Data point from Recharts containing note, year, month
 * @param isMobile - Whether to use mobile sizing (larger dots and icons)
 */

interface CustomChartDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    note?: string;
    year?: number;
    month?: number;
  };
  isMobile?: boolean;
}

export function CustomChartDot({ cx, cy, payload, isMobile = false }: CustomChartDotProps) {
  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }

  const hasNote = !!payload.note;

  /**
   * Teacher Comment: Responsive Sizing Ratios
   *
   * Mobile devices need larger touch targets (Apple recommends 44x44pt minimum).
   * Desktop can use smaller elements for denser information display.
   *
   * Sizing strategy:
   * - baseRadius: 5px mobile (10px diameter) vs 4px desktop (8px diameter)
   * - noteRadius: 8px mobile (16px diameter) vs 6px desktop (12px diameter)
   * - iconSize: 10px mobile vs 8px desktop (scales icon path)
   * - iconOffset: Half of iconSize to center the icon within the circle
   *
   * Why larger mobile sizes? Touch accuracy is lower than mouse precision,
   * and smaller targets frustrate mobile users.
   */
  const baseRadius = isMobile ? 5 : 4;
  const noteRadius = isMobile ? 8 : 6;
  const strokeWidth = isMobile ? 2.5 : 2;
  const iconSize = isMobile ? 10 : 8;
  const iconOffset = isMobile ? 5 : 4;

  return (
    <g>
      {/**
       * Why invisible hitbox on mobile only?
       *
       * Even with larger dots, the 16px diameter might still be too small for
       * comfortable touch interaction. A 24px (r=12) invisible circle provides
       * extra touch area without cluttering the visual design. Desktop doesn't
       * need this because mouse precision is higher.
       */}
      {isMobile && (
        <circle cx={cx} cy={cy} r={12} fill="transparent" pointerEvents="all" />
      )}

      {hasNote ? (
        // Amber marker for snapshots with notes
        <>
          <circle
            cx={cx}
            cy={cy}
            r={noteRadius}
            fill="#F59E0B"
            stroke="#fff"
            strokeWidth={strokeWidth}
          />
          {/**
           * Teacher Comment: SVG Message Square Icon Path
           *
           * The path string defines a simplified message/speech bubble icon:
           * - "M0 0" = Move to origin (top-left corner)
           * - "h10" (mobile) or "h8" (desktop) = Draw horizontal line 10px or 8px right
           * - "v7.5" or "v6" = Draw vertical line down 7.5px or 6px
           * - "l-2.5 -2.5" or "l-2 -2" = Draw diagonal line (the chat bubble tail)
           * - "h-7.5" or "h-6" = Draw horizontal line back to close the shape
           * - "z" (implicit) = Close path
           *
           * Result: A simple rectangle with a notch at bottom-right, resembling a message icon.
           * Scaled responsive to maintain icon clarity at different sizes.
           */}
          <g transform={`translate(${cx - iconOffset}, ${cy - iconOffset})`}>
            <path
              d={isMobile ? "M0 0 h10 v7.5 l-2.5 -2.5 h-7.5 z" : "M0 0 h8 v6 l-2 -2 h-6 z"}
              fill="white"
              stroke="white"
              strokeWidth={0.5}
            />
          </g>
        </>
      ) : (
        // Standard blue dot for snapshots without notes
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius}
          fill="#3B82F6"
          stroke="#fff"
          strokeWidth={strokeWidth}
        />
      )}
    </g>
  );
}
