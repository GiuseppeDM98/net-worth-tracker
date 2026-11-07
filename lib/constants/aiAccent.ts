/**
 * The AI accent, as classes (DESIGN.md → The AI-Accent Rule; AI-03, 2026-11-07). Two things wear
 * it, and differently: what the model WROTE carries the 1px accent border at rest and a glow on
 * hover; a control that ASKS the model turns the accent on hover and keyboard focus only, never at
 * rest. The tokens are `--ai-accent` and `--ai-glow` in app/globals.css.
 */

/** What the model wrote: the 1px accent border at rest; the glow on hover and while a control inside has the keyboard focus (decision 36). The 200 ms shadow fade carries no `motion-safe:` guard — a fade is not motion, and the control class and DESIGN.md's table transition under reduced motion too (decision 87, 2026-11-07). */
export const AI_GENERATED_SURFACE_CLASS =
  'border-[color:var(--ai-accent)] transition-shadow duration-200 hover:shadow-[0_0_14px_var(--ai-glow)] has-[:focus-visible]:shadow-[0_0_14px_var(--ai-glow)]';

/** The eyebrow of a generated tile: the accent as its colour, the words unchanged. */
export const AI_GENERATED_EYEBROW_CLASS = 'text-[color:var(--ai-accent)]';

/**
 * A control that calls the model (The AI-Accent Rule): on hover and on keyboard focus only, the border turns the
 * accent and the glow appears, over 200 ms; never at rest, never a fill. The focus ring stays `ring-ring`.
 * A FILLED control (shadcn's `default` variant) has no border width of its own: the host adds `border
 * border-transparent` beside this class, or the hover colours nothing (decision 85).
 */
export const AI_CONTROL_ACCENT_CLASS =
  'transition-[border-color,color,box-shadow] duration-200 hover:border-[color:var(--ai-accent)] focus-visible:border-[color:var(--ai-accent)] hover:shadow-[0_0_14px_var(--ai-glow)] focus-visible:shadow-[0_0_14px_var(--ai-glow)]';

/** Added to AI_CONTROL_ACCENT_CLASS on an outline or ghost control only: its label turns the accent too; a filled control keeps --primary-foreground. */
export const AI_CONTROL_ACCENT_LABEL_CLASS = 'hover:text-[color:var(--ai-accent)] focus-visible:text-[color:var(--ai-accent)]';
