'use client';

import type { RefObject } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import type { HallOfFameNote } from '@/types/hall-of-fame';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SECTION_SUBJECTS, MONTHLY_SECTION_KEYS, YEARLY_SECTION_KEYS } from '@/lib/constants/hallOfFame';
import { describeNoteViewReading } from '@/lib/utils/hallOfFameNarrative';

interface HallOfFameNoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: HallOfFameNote | null;
  onEditClick: () => void; // Triggers transition to edit mode
  /** Where the window grows from — `resolveCenteredModalOrigin` of the control that opened it. */
  triggerOrigin?: string;
  /** The control that opened the window, to give the focus back to on close (doc/guide/dialog.md). */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * A note, read. The reading names the ranking when there is one; the body lists them only when
 * there are several — the same list printed twice under one title was the old shape. The footer
 * carries ONE action, «Modifica»: closing is the X and Escape (The Modal-Is-A-Tile Rule).
 */
export function HallOfFameNoteViewDialog({
  open,
  onOpenChange,
  note,
  onEditClick,
  triggerOrigin,
  returnFocusTo,
}: HallOfFameNoteViewDialogProps) {
  if (!note) return null;

  const periodText = note.month
    ? `${MONTH_NAMES[note.month - 1]} ${note.year}`
    : `Anno ${note.year}`;

  const monthlySections = note.sections.filter((s) => MONTHLY_SECTION_KEYS.includes(s));
  const yearlySections = note.sections.filter((s) => YEARLY_SECTION_KEYS.includes(s));
  const listsSections = note.sections.length > 1;

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow={`Hall of Fame · ${periodText}`}
      title="La tua nota"
      reading={describeNoteViewReading(note.sections)}
      width="md"
      triggerOrigin={triggerOrigin}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button type="button" onClick={onEditClick}>
            Modifica
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-[1.6] text-foreground">{note.text}</p>

        {listsSections && (
          <div className="space-y-2 border-t border-border pt-3.5">
            {monthlySections.length > 0 && (
              <div>
                <p className={TILE_SUB_EYEBROW_CLASS}>Classifiche mensili</p>
                <ul className="mt-1.5 divide-y divide-border">
                  {monthlySections.map((section) => (
                    <li key={section} className="py-1.5 text-[13px]">
                      {SECTION_SUBJECTS[section]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {yearlySections.length > 0 && (
              <div>
                <p className={TILE_SUB_EYEBROW_CLASS}>Classifiche annuali</p>
                <ul className="mt-1.5 divide-y divide-border">
                  {yearlySections.map((section) => (
                    <li key={section} className="py-1.5 text-[13px]">
                      {SECTION_SUBJECTS[section]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
