'use client';

interface CustomChartDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    note?: string;
    year?: number;
    month?: number;
  };
}

export function CustomChartDot({ cx, cy, payload }: CustomChartDotProps) {
  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }

  const hasNote = !!payload.note;

  return (
    <g>
      {/* Dot visibile (no click) */}
      <circle cx={cx} cy={cy} r={1} fill="transparent" />

      {hasNote ? (
        // Marker ambra per snapshot con nota
        <>
          <circle
            cx={cx}
            cy={cy}
            r={6}
            fill="#F59E0B"
            stroke="#fff"
            strokeWidth={2}
          />
          {/* Icona MessageSquare piccola */}
          <g transform={`translate(${cx - 4}, ${cy - 4})`}>
            <path
              d="M0 0 h8 v6 l-2 -2 h-6 z"
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
          r={4}
          fill="#3B82F6"
          stroke="#fff"
          strokeWidth={2}
        />
      )}
    </g>
  );
}
