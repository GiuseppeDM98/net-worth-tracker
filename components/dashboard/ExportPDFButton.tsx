/**
 * PDF export trigger button for portfolio snapshots
 *
 * Simple wrapper that opens PDFExportDialog modal.
 * Dialog handles the actual PDF generation logic.
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { PDFExportDialog } from '@/components/pdf/PDFExportDialog';
import type { MonthlySnapshot, Asset, AssetAllocationTarget } from '@/types/assets';

interface ExportPDFButtonProps {
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  allocationTargets: AssetAllocationTarget;
}

export function ExportPDFButton({
  snapshots,
  assets,
  allocationTargets,
}: ExportPDFButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <FileText className="h-4 w-4 mr-2" />
        Export PDF
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
