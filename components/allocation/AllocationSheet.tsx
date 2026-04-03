/**
 * Allocation Sheet - Bottom Sheet Drawer for Allocation Drill-Down
 *
 * Mobile-friendly bottom sheet component for hierarchical allocation navigation.
 *
 * Features:
 * - Slides up from bottom (85% viewport height)
 * - Sticky header with back navigation and close button
 * - Breadcrumb support for showing navigation path
 * - Scrollable content area for nested allocation data
 *
 * Usage:
 * - Asset class level → SubCategory level → Specific asset level
 * - Each level shows allocation breakdown with drill-down capability
 * - Back button navigates up the hierarchy
 */
'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X as XIcon } from 'lucide-react';
import { contextualSheetPanel } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';

interface AllocationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  breadcrumbPath?: string[];
  onBack?: () => void;
  children: ReactNode;
  transformOrigin?: string;
  levelLabel?: string;
  contentKey: string;
}

export function AllocationSheet({
  open,
  onOpenChange,
  title,
  breadcrumbPath,
  onBack,
  children,
  transformOrigin,
  levelLabel,
  contentKey,
}: AllocationSheetProps) {
  const breadcrumb = breadcrumbPath?.filter(Boolean).join(' / ');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !scrollContainerRef.current) return;

    // Each drill-down level should open from the top of its own content,
    // not inherit the previous scroll offset from the same sheet container.
    scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
  }, [contentKey, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[85vh] flex-col overflow-hidden border-border bg-background px-0"
        showCloseButton={false}
        style={transformOrigin ? { transformOrigin } : undefined}
      >
        <SheetHeader className="shrink-0 border-b border-border bg-background px-4 pb-4 pt-3">
          <div className="mb-3 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-border" />
          </div>
          <div className="flex items-center gap-3">
            {/* Back button (conditional) */}
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack();
                }}
                className="shrink-0"
                aria-label="Torna indietro"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}

            {/* Title and breadcrumb */}
            <div className="flex-1 min-w-0">
              {levelLabel && (
                <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  {levelLabel}
                </p>
              )}
              {breadcrumb && (
                <p className="mb-1 truncate text-xs text-muted-foreground">
                  {breadcrumb}
                </p>
              )}
              <SheetTitle className="text-left text-lg">
                {title}
              </SheetTitle>
            </div>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
              className="shrink-0 rounded-full bg-muted hover:bg-muted/80"
              aria-label="Chiudi"
            >
              <XIcon className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
        </SheetHeader>

        {/* Content area */}
        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={contentKey}
              variants={contextualSheetPanel}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={cn('space-y-4')}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}
