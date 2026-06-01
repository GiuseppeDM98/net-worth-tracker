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
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

export interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /**
   * Used for the sr-only DialogDescription / DrawerDescription.
   * Falls back to the string value of `title` when not provided.
   */
  description?: string;
  /**
   * Element rendered only in the desktop DialogHeader (e.g. a Badge for edit mode).
   */
  headerExtra?: React.ReactNode;
  /** Scrollable body content. */
  children: React.ReactNode;
  /**
   * Footer actions. Callers resolve mobile/desktop layout themselves via
   * `useMediaQuery` and pass a plain ReactNode.
   */
  footer?: React.ReactNode;
  /**
   * Extra className merged into DialogContent. Use to override the default
   * dialog width of `max-w-4xl`.
   * Example: `dialogClassName="max-w-3xl"`
   */
  dialogClassName?: string;
}

/**
 * ResponsiveModal — renders a bottom-sheet Drawer on mobile (≤768 px) and a
 * centred Dialog on desktop. Use for cashflow modals to avoid repeating the
 * isMobile / Drawer / Dialog split in every component.
 *
 * Default dialog width: `max-w-4xl`. Override with `dialogClassName`.
 */
export function ResponsiveModal({
  open,
  onClose,
  title,
  description,
  headerExtra,
  children,
  footer,
  dialogClassName,
}: Readonly<ResponsiveModalProps>) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  const resolvedDescription =
    description ?? (typeof title === 'string' ? title : undefined);

  if (isMobile) {
    return (
      // noBodyStyles: prevents vaul from setting overflow:hidden on body,
      // which on iOS interferes with layout restoration after keyboard dismiss.
      <Drawer open={open} onOpenChange={(v) => !v && onClose()} noBodyStyles>
        <DrawerContent>
          <DrawerHeader className="border-b px-4 pb-3 pt-2">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {resolvedDescription || 'Finestra modale'}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
            {children}
          </div>

          {footer && (
            <DrawerFooter>{footer}</DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          'max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden',
          dialogClassName
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base font-semibold leading-none">
              {title}
            </DialogTitle>
            {headerExtra}
          </div>
          <DialogDescription className="sr-only">
            {resolvedDescription || 'Finestra modale'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="px-6 pb-6 pt-4 border-t shrink-0 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
