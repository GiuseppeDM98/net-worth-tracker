"use client"

/**
 * AnimatedErrorIcon
 *
 * SVG error icon: circle draws in, then an X appears — same timing pattern
 * as AnimatedCheckIcon for visual consistency across toast types.
 *
 * Uses currentColor to inherit the toast's text color in both themes.
 * Respects prefers-reduced-motion.
 */

interface AnimatedErrorIconProps {
  className?: string
}

export function AnimatedErrorIcon({ className = "size-4" }: AnimatedErrorIconProps) {
  return (
    <>
      <style>{`
        @keyframes error-circle-draw {
          from { stroke-dashoffset: 44; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes error-x-appear {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .error-circle {
            stroke-dasharray: 44;
            stroke-dashoffset: 44;
            animation: error-circle-draw 300ms ease-out forwards;
          }
          .error-x {
            opacity: 0;
            animation: error-x-appear 200ms ease-out 250ms forwards;
          }
        }
      `}</style>
      <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        <circle
          className="error-circle"
          cx="8" cy="8" r="7"
          stroke="currentColor" strokeWidth="1.5"
        />
        <path
          className="error-x"
          d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </>
  )
}
