"use client";

/**
 * Wraps the app with MotionConfig so that all Framer Motion animations
 * automatically respect the user's prefers-reduced-motion preference.
 *
 * reducedMotion="user" → reads the OS/browser setting and disables
 * animations for users who need reduced motion (accessibility).
 */
import { MotionConfig } from "framer-motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
