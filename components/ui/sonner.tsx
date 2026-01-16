"use client"

/**
 * Custom Toaster Configuration
 *
 * Wraps Sonner toast library with custom Lucide icons and theme integration.
 * Maps CSS variables to Sonner's internal styling system for consistent theming
 * across light/dark modes.
 */

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Themed toast notification component.
 *
 * Replaces default Sonner icons with Lucide icons for visual consistency
 * and maps application CSS variables to Sonner's styling system.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Override default Sonner icons with Lucide icons to match the rest of the UI.
      // Each toast type gets a consistent icon style and size.
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
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
