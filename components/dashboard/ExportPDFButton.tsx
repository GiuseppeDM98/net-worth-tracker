/**
 * PDF export trigger button for portfolio snapshots
 *
 * Simple wrapper that opens PDFExportDialog modal.
 * Dialog handles the actual PDF generation logic; the press also starts downloading the PDF
 * engine, which is not in the page's initial JavaScript (`loadPDFGenerator`, PERF-04).
 */
'use client';

import { useState } from 'react';
import { Button, type buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import { FileText } from 'lucide-react';
import { PDFExportDialog, loadPDFGenerator } from '@/components/pdf/PDFExportDialog';
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
      <Button
        onClick={() => {
          // A failed download surfaces at «Genera PDF», which awaits the same promise and retries.
          loadPDFGenerator().catch(() => {});
          setDialogOpen(true);
        }}
        variant={variant}
        className={className}
      >
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
