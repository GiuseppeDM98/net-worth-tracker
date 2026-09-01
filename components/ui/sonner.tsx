"use client"

/**
 * The app's toast surface.
 *
 * Sonner paints EVERY type on one background, so before 2026-09-01 a `toast.error` and a
 * `toast.success` were the same grey tile distinguished by a 16px glyph — colour, the one
 * carrier of sign in this product, was missing from the one surface that interrupts the reader.
 *
 * The severity now lives in the two elements that carry no text: the ICON and a 2px rule down
 * the leading edge, both on the semantic token. The surface stays `--popover`, like every
 * dialog, dropdown and popover in the app — a tinted background would be the only tinted
 * surface in the system, and a 10% sign tint washes the fill with the text's own hue, which
 * CLAUDE.md already records as structurally below AA (see DESIGN.md → The Sign-Color Token
 * Rule). Text keeps a ground whose contrast is known.
 *
 * The WORDS of a failed write are `describeWriteError`'s, never the SDK's — the same single
 * translation the modals use.
 */

import {
  InfoIcon,
  Loader2Icon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { AnimatedCheckIcon } from "./AnimatedCheckIcon"
import { AnimatedErrorIcon } from "./AnimatedErrorIcon"
import { AnimatedWarningIcon } from "./AnimatedWarningIcon"

/** The 2px severity rule, painted by the per-type classes below. */
const TOAST_CLASS =
  'relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-[""] before:bg-transparent'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Lucide/hand-drawn icons instead of Sonner's, each carrying its severity token.
      // They draw with `currentColor`, so a `text-*` class is the whole colouring.
      icons={{
        success: <AnimatedCheckIcon className="size-4 text-positive" />,
        info: <InfoIcon className="size-4 text-muted-foreground" />,
        warning: <AnimatedWarningIcon className="size-4 text-warning-foreground" />,
        error: <AnimatedErrorIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 motion-safe:animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: TOAST_CLASS,
          success: 'before:bg-positive',
          warning: 'before:bg-warning-foreground',
          error: 'before:bg-destructive',
          // The tile's own reading sizes: a toast is a tile that leaves, not a second typography.
          title: 'text-[13px] font-medium leading-[1.4]',
          description: 'text-[12px] leading-[1.45] text-muted-foreground',
        },
      }}
      // Map application theme CSS variables to Sonner's internal styling system.
      // This ensures toasts automatically adapt to light/dark mode using the
      // same colors as other popover components (dialogs, dropdowns, etc.).
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
