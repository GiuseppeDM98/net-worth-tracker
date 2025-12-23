'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { NoteViewDialog } from './NoteViewDialog';

interface NoteIconCellProps {
  note?: string;
  monthYear: string;
}

export function NoteIconCell({ note, monthYear }: NoteIconCellProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!note) {
    return <div className="w-8" />; // Spacer per allineamento
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors"
        aria-label={`Visualizza nota per ${monthYear}`}
      >
        <MessageSquare className="h-4 w-4 text-amber-500" />
      </button>

      <NoteViewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        monthYear={monthYear}
        note={note}
      />
    </>
  );
}
