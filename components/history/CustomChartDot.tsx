'use client';

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

  // Responsive sizes
  const baseRadius = isMobile ? 5 : 4;
  const noteRadius = isMobile ? 8 : 6;
  const strokeWidth = isMobile ? 2.5 : 2;
  const iconSize = isMobile ? 10 : 8;
  const iconOffset = isMobile ? 5 : 4;

  return (
    <g>
      {/* Invisible larger hitbox for touch (mobile only) */}
      {isMobile && (
        <circle cx={cx} cy={cy} r={12} fill="transparent" pointerEvents="all" />
      )}

      {hasNote ? (
        // Marker ambra per snapshot con nota
        <>
          <circle
            cx={cx}
            cy={cy}
            r={noteRadius}
            fill="#F59E0B"
            stroke="#fff"
            strokeWidth={strokeWidth}
          />
          {/* Icona MessageSquare responsive */}
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
        // Dot standard blu per snapshot senza nota
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
