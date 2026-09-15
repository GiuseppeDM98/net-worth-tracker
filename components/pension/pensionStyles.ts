/**
 * The two chrome classes Previdenza's tiles share — written once, because the same bordered
 * chip link used to live in two files with two text colours, and the same ghost button in a
 * third (2026-09-13).
 *
 * Both keep a 44px height below `desktop:` and drop to 32px from 1440 — the dense-list floor of
 * AGENTS.md → Accessibility, never 28px: the page's own tables are read on a 1440px tablet in
 * landscape too (CLAUDE.md → Known Issues, the icon rail's blind spot).
 */

/** A bordered chip link inside a tile's aside or row («Vai a Patrimonio», «Collega … a un contribuente»). */
export const ASIDE_LINK_CLASS =
  'inline-flex h-11 w-fit items-center gap-1 rounded-md border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-8 desktop:px-2.5 desktop:text-[11px]';

/** A ghost button inside a tile (a row's delete, «Mostra tutti»). Size it at the call site. */
export const GHOST_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
