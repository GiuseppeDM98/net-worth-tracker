"use client"

/**
 * AnimatedCheckIcon
 *
 * SVG success icon with a two-phase draw animation:
 * 1. Circle strokes in (0–300ms, ease-out)
 * 2. Tick appears (250–450ms)
 *
 * Uses currentColor to inherit the toast's text color in both themes.
 * Respects prefers-reduced-motion: shows fully rendered with no animation.
 */

interface AnimatedCheckIconProps {
  className?: string
}

export function AnimatedCheckIcon({ className = "size-4" }: AnimatedCheckIconProps) {
  return (
    <>
      <style>{`
        @keyframes check-circle-draw {
          from { stroke-dashoffset: 44; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes check-tick-appear {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .check-circle {
            stroke-dasharray: 44;
            stroke-dashoffset: 44;
            animation: check-circle-draw 300ms ease-out forwards;
          }
          .check-tick {
            opacity: 0;
            animation: check-tick-appear 200ms ease-out 250ms forwards;
          }
        }
      `}</style>
      <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        <circle
          className="check-circle"
          cx="8" cy="8" r="7"
          stroke="currentColor" strokeWidth="1.5"
        />
        <path
          className="check-tick"
          d="M4.5 8L7 10.5L11.5 5.5"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </>
  )
}
