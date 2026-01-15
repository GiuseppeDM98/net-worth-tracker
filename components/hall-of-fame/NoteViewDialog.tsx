'use client';

/**
 * NoteViewDialog Component
 *
 * Simple read-only dialog for displaying full note text from Hall of Fame entries.
 * Uses whitespace-pre-wrap to preserve line breaks and formatting from user input.
 *
 * @param open - Controls dialog visibility
 * @param onOpenChange - Callback when dialog open state changes
 * @param monthYear - Formatted date string for dialog title (e.g., "Jan 2024")
 * @param note - Full note text to display
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthYear: string;
  note: string;
}

export function NoteViewDialog({ open, onOpenChange, monthYear, note }: NoteViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nota - {monthYear}</DialogTitle>
          <DialogDescription>
            Visualizza la nota completa per questo periodo
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {note}
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
