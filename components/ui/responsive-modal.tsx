'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ModalStatusLine } from '@/components/ui/modal-status-line';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { hasArmedConfirm } from '@/lib/hooks/useArmedDelete';
import { cn } from '@/lib/utils';
import type { ModalReading } from '@/lib/utils/dialogNarrative';

/**
 * While a two-click confirm is armed, Escape means «disarm» — not «close».
 *
 * One key can only mean one thing at a time, and the armed button is the more recent, more
 * dangerous state. The confirm's own listener does the disarming; this only refuses the
 * dismissal, which is the one thing a button inside the layer cannot do for itself.
 */
function refuseEscapeWhileArmed(event: KeyboardEvent) {
  if (hasArmedConfirm()) event.preventDefault();
}

/**
 * The four widths a modal may take, and no others.
 *
 * The old default was `max-w-4xl` (896px), which is none of them: a six-field form at that
 * width leaves half of every row empty, and a report cramped at 512px wraps its prose to
 * ribbons. The width is a consequence of what the modal holds, so it is named after that.
 */
export type ModalWidth = 'sm' | 'md' | 'lg' | 'xl';

const WIDTH_CLASS: Record<ModalWidth, string> = {
  /** One question: a confirmation, a period, a rate. */
  sm: 'sm:max-w-[420px]',
  /** One form, one column. */
  md: 'sm:max-w-[560px]',
  /** A two-column form, or a list. */
  lg: 'sm:max-w-[720px]',
  /** A report to read. */
  xl: 'sm:max-w-[960px]',
};

export interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * The context above the title, in the app's one eyebrow: «Nuova voce · Passo 1 di 2»,
   * «Registro operazioni · VWCE». A centred dot appends the scope without a second label
   * (DESIGN.md → The One-Eyebrow Rule).
   */
  eyebrow?: string;
  /** The act, at Headline 20px — «Nuova spesa variabile», not «Modulo spesa». */
  title: React.ReactNode;
  /**
   * The reading line under the title, and on a form the status line. A `ModalReading` carries
   * its own tone; a plain string is a static reading in the neutral tone.
   *
   * Leave it out only where the modal must show nothing there — `description` then feeds the
   * `sr-only` text the accessibility tree still requires.
   */
  reading?: ModalReading | string | null;
  /**
   * The accessible description, used when `reading` is absent (rendered `sr-only`) and as the
   * fallback for a non-string title. Never silence Radix with `aria-describedby={undefined}`.
   */
  description?: string;
  /** Scrollable body content. */
  children: React.ReactNode;
  /**
   * Footer actions, in DOM order «secondary … primary». The modal lays them out: right-aligned
   * on a dialog, and stacked `flex-col-reverse` at 44px on a drawer, so the primary action is
   * the top row on a phone without every caller branching on `useMediaQuery`.
   */
  footer?: React.ReactNode;
  /** A muted note beside the footer — «Esc annulla» — left on a dialog, above on a drawer. */
  footerNote?: React.ReactNode;
  width?: ModalWidth;
  /**
   * `transform-origin` for the open animation — the point the modal grows from, usually the
   * control that opened it. Dialog only: a drawer always rises from the bottom edge, which is
   * the only direction a bottom sheet can honestly come from.
   */
  triggerOrigin?: string;
  /**
   * The dialog surface itself, for a caller that must MEASURE it — Hall of Fame computes its
   * `triggerOrigin` in the dialog's own coordinates, which needs the rendered rect. Dialog only.
   */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  /** Escape hatch for a width the four steps genuinely cannot express. */
  dialogClassName?: string;
}

/**
 * A modal is a tile lifted off the page (DESIGN.md → §5 Modal): eyebrow · title · reading ·
 * body, plus the one thing a tile has no use for — a footer, because a modal asks for a
 * decision and a tile only reports.
 *
 * It renders a bottom-sheet Drawer at ≤768px and a centred Dialog above, so one component is
 * the whole vocabulary and a surface cannot drift between the two widths.
 */
export function ResponsiveModal({
  open,
  onClose,
  eyebrow,
  title,
  reading,
  description,
  children,
  footer,
  footerNote,
  width = 'lg',
  triggerOrigin,
  contentRef,
  dialogClassName,
}: Readonly<ResponsiveModalProps>) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  const resolvedReading: ModalReading | null =
    typeof reading === 'string' ? { narrative: [{ text: reading }], tone: 'neutral' } : (reading ?? null);

  const resolvedDescription =
    description ?? (typeof title === 'string' ? title : undefined) ?? 'Finestra modale';

  if (isMobile) {
    return (
      // noBodyStyles: prevents vaul from setting overflow:hidden on body.
      // repositionInputs={false}: disables vaul's logic that shifts the drawer
      // upward when an input receives focus; without this, the drawer moves up
      // when the keyboard opens and doesn't fully restore when it closes,
      // leaving the footer buttons stuck away from the bottom edge.
      <Drawer open={open} onOpenChange={(v) => !v && onClose()} noBodyStyles repositionInputs={false}>
        <DrawerContent onEscapeKeyDown={refuseEscapeWhileArmed}>
          <DrawerHeader className="border-b px-4 pb-3 pt-2 text-left">
            {eyebrow && <p className={TILE_EYEBROW_CLASS}>{eyebrow}</p>}
            <DrawerTitle className="text-[20px] font-semibold leading-[1.25] tracking-[-0.01em]">
              {title}
            </DrawerTitle>
            {resolvedReading ? (
              <DrawerDescription asChild>
                <ModalStatusLine reading={resolvedReading} className="mt-1" />
              </DrawerDescription>
            ) : (
              <DrawerDescription className="sr-only">{resolvedDescription}</DrawerDescription>
            )}
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

          {(footer || footerNote) && (
            <DrawerFooter>
              {footerNote && <p className="text-xs text-muted-foreground">{footerNote}</p>}
              {/* col-reverse: the caller writes «Annulla, Salva» and the phone shows «Salva» first. */}
              <div className="flex flex-col-reverse gap-2 [&>button]:h-11 [&>button]:w-full">
                {footer}
              </div>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        ref={contentRef}
        onEscapeKeyDown={refuseEscapeWhileArmed}
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden p-0',
          WIDTH_CLASS[width],
          dialogClassName,
        )}
        style={triggerOrigin ? { transformOrigin: triggerOrigin } : undefined}
      >
        {/* pr-14 clears the close button, which sits at top-4 right-4 in a 36px box. The
            hairline exists because the body scrolls under it: it is a scroll edge, not a rule. */}
        <DialogHeader className="shrink-0 gap-1.5 border-b px-6 pb-4 pr-14 pt-6 text-left">
          {eyebrow && <p className={TILE_EYEBROW_CLASS}>{eyebrow}</p>}
          <DialogTitle className="text-[20px] font-semibold leading-[1.25] tracking-[-0.01em]">
            {title}
          </DialogTitle>
          {resolvedReading ? (
            <DialogDescription asChild>
              <ModalStatusLine reading={resolvedReading} className="mt-1" />
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{resolvedDescription}</DialogDescription>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {(footer || footerNote) && (
          <div className="flex shrink-0 items-center gap-3 border-t px-6 pb-6 pt-4">
            {footerNote && <p className="text-xs text-muted-foreground">{footerNote}</p>}
            <div className="ml-auto flex gap-2">{footer}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
