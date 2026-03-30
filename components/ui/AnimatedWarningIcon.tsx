"use client"

/**
 * AnimatedWarningIcon
 *
 * SVG warning icon: triangle draws in via stroke-dasharray, then the
 * exclamation mark appears. Same timing pattern as the other animated icons.
 *
 * Uses currentColor to inherit the toast's text color in both themes.
 * Respects prefers-reduced-motion.
 *
 * Triangle perimeter ≈ 42px (equilateral triangle inscribed in 16×16).
 */

interface AnimatedWarningIconProps {
  className?: string
}

export function AnimatedWarningIcon({ className = "size-4" }: AnimatedWarningIconProps) {
  return (
    <>
      <style>{`
        @keyframes warning-triangle-draw {
          from { stroke-dashoffset: 42; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes warning-exclaim-appear {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .warning-triangle {
            stroke-dasharray: 42;
            stroke-dashoffset: 42;
            animation: warning-triangle-draw 300ms ease-out forwards;
          }
          .warning-exclaim {
            opacity: 0;
            animation: warning-exclaim-appear 200ms ease-out 250ms forwards;
          }
        }
      `}</style>
      <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        {/* Rounded triangle */}
        <path
          className="warning-triangle"
          d="M8 2.5L14 13.5H2L8 2.5Z"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round"
        />
        {/* Exclamation mark stem + dot */}
        <g className="warning-exclaim">
          <line x1="8" y1="6.5" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
        </g>
      </svg>
    </>
  )
}
