'use client';

import type { CSSProperties, RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HallOfFameNote } from '@/types/hall-of-fame';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SECTION_LABELS, MONTHLY_SECTION_KEYS, YEARLY_SECTION_KEYS } from '@/lib/constants/hallOfFame';

interface HallOfFameNoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: HallOfFameNote | null;
  onEditClick: () => void; // Triggers transition to edit mode
  dialogRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
}

export function HallOfFameNoteViewDialog({
  open,
  onOpenChange,
  note,
  onEditClick,
  dialogRef,
  style,
}: HallOfFameNoteViewDialogProps) {
  if (!note) return null;

  const periodText = note.month
    ? `${MONTH_NAMES[note.month - 1]} ${note.year}`
    : `Anno ${note.year}`;

  const monthlySections = note.sections.filter((s) => MONTHLY_SECTION_KEYS.includes(s));
  const yearlySections = note.sections.filter((s) => YEARLY_SECTION_KEYS.includes(s));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        style={style}
        className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>Visualizza Nota</DialogTitle>
          <DialogDescription>
            {periodText} — {note.sections.length === 1 ? '1 sezione' : `${note.sections.length} sezioni`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Periodo:</p>
            <p className="text-base">{periodText}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Sezioni Associate:</p>

              {monthlySections.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Ranking Mensili:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  {monthlySections.map((section) => (
                    <li key={section} className="text-sm">{SECTION_LABELS[section]}</li>
                  ))}
                </ul>
              </div>
            )}

            {yearlySections.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Ranking Annuali:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  {yearlySections.map((section) => (
                    <li key={section} className="text-sm">{SECTION_LABELS[section]}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Nota:</p>
            <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg p-3 bg-muted/50">
              <p className="text-base whitespace-pre-wrap">{note.text}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onEditClick}>
            Modifica Nota
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
