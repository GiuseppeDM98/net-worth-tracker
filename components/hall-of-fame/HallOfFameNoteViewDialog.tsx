'use client';

import type { CSSProperties, RefObject } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
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
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow={`Hall of Fame · ${periodText}`}
      title="La tua nota"
      reading={
        note.sections.length === 1
          ? `Appesa a una classifica: ${SECTION_LABELS[note.sections[0]]}.`
          : `Appesa a ${note.sections.length} classifiche di questo periodo.`
      }
      width="md"
      contentRef={dialogRef}
      triggerOrigin={style?.transformOrigin as string | undefined}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onEditClick}>
            Modifica
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-[1.6] text-foreground">{note.text}</p>

        <div className="space-y-2 border-t border-border pt-3.5">
          {monthlySections.length > 0 && (
            <div>
              <p className={TILE_SUB_EYEBROW_CLASS}>Classifiche mensili</p>
              <ul className="mt-1.5 divide-y divide-border">
                {monthlySections.map((section) => (
                  <li key={section} className="py-1.5 text-[13px]">
                    {SECTION_LABELS[section]}
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
                    {SECTION_LABELS[section]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
