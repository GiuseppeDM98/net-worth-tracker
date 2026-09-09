/**
 * PDF export trigger button for portfolio snapshots
 *
 * Simple wrapper that opens PDFExportDialog modal.
 * Dialog handles the actual PDF generation logic.
 */
'use client';

import { useState } from 'react';
import { Button, type buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import { FileText } from 'lucide-react';
import { PDFExportDialog } from '@/components/pdf/PDFExportDialog';
import type { MonthlySnapshot, Asset, AssetAllocationTarget } from '@/types/assets';

interface ExportPDFButtonProps {
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  allocationTargets: AssetAllocationTarget;
  /** The compact page header wants an `outline` at `h-8 text-xs`; the default stays the primary button. */
  variant?: VariantProps<typeof buttonVariants>['variant'];
  className?: string;
  /** Icon size follows the button; the compact header uses 3.5. */
  iconClassName?: string;
}

export function ExportPDFButton({
  snapshots,
  assets,
  allocationTargets,
  variant = 'default',
  className,
  iconClassName = 'h-4 w-4',
}: ExportPDFButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setDialogOpen(true)} variant={variant} className={className}>
        <FileText className={iconClassName} aria-hidden="true" />
        Esporta PDF
      </Button>

      <PDFExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        snapshots={snapshots}
        assets={assets}
        allocationTargets={allocationTargets}
      />
    </>
  );
}
