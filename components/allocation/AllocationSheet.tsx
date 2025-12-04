'use client';

import { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X as XIcon } from 'lucide-react';

interface AllocationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  breadcrumb?: string;
  onBack?: () => void;
  children: ReactNode;
}

export function AllocationSheet({
  open,
  onOpenChange,
  title,
  breadcrumb,
  onBack,
  children,
}: AllocationSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] overflow-y-auto"
        showCloseButton={false}
      >
        <SheetHeader className="sticky top-0 bg-white dark:bg-gray-950 z-10 pb-4 border-b">
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
              {breadcrumb && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1">
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
              className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="Chiudi"
            >
              <XIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </Button>
          </div>
        </SheetHeader>

        {/* Content area */}
        <div className="mt-4 space-y-4 pb-8">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
