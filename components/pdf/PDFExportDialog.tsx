// components/pdf/PDFExportDialog.tsx
// Dialog component for selecting PDF sections and initiating export

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import { generatePDF, validatePDFOptions } from '@/lib/utils/pdfGenerator';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { SectionSelection, TimeFilter } from '@/types/pdf';
import type { MonthlySnapshot, Asset, AssetAllocationTarget } from '@/types/assets';
import {
  filterSnapshotsByTime,
  validateTimeFilterData,
  adjustSectionsForTimeFilter,
  validatePDFGeneration,
  getTimeFilterTooltip,
  getTimeFilterLabel,
} from '@/lib/utils/pdfTimeFilters';

export interface PDFExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  allocationTargets: AssetAllocationTarget;
}

/**
 * Dialog component for configuring and exporting portfolio reports to PDF.
 *
 * Key features:
 * - Time filter selection (total/yearly/monthly) with availability validation
 * - Section checkbox selection with descriptions
 * - Dynamic section disabling based on time filter constraints
 * - Real-time validation with user feedback
 * - Loading state during PDF generation
 *
 * Time filter constraints:
 * - Total: All sections available, includes all-time data
 * - Yearly: All sections available, includes current year data only
 * - Monthly: FIRE and History sections DISABLED (explained in handleTimeFilterChange)
 *
 * Validation flow:
 * 1. Check user authentication
 * 2. Filter snapshots based on selected time period
 * 3. Validate filtered data meets section requirements (e.g., ≥2 snapshots for History)
 * 4. Validate PDF generation options (all required data present)
 * 5. Generate PDF with filtered data
 * 6. Display success/error toast
 *
 * @param open - Controls dialog visibility
 * @param onOpenChange - Callback to update dialog state
 * @param snapshots - All available monthly snapshots (unfiltered)
 * @param assets - Current asset holdings
 * @param allocationTargets - User's asset allocation targets
 */
export function PDFExportDialog({
  open,
  onOpenChange,
  snapshots,
  assets,
  allocationTargets,
}: PDFExportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('total');
  const [validation, setValidation] = useState(validateTimeFilterData(snapshots));
  // All sections default to selected (true)
  const [sections, setSections] = useState<SectionSelection>({
    portfolio: true,
    allocation: true,
    history: true,
    cashflow: true,
    performance: true,
    fire: true,
    summary: true,
  });

  // Revalidate time filter availability when snapshot data changes
  useEffect(() => {
    setValidation(validateTimeFilterData(snapshots));
  }, [snapshots]);

  const toggleSection = (key: keyof SectionSelection) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /**
   * Handles time filter changes with automatic section adjustment.
   *
   * Time filter behavior:
   * - Total/Yearly: All sections re-enabled (reset to default checked state)
   * - Monthly: FIRE and History sections auto-disabled
   *
   * Why disable FIRE and History for monthly exports?
   * - FIRE metrics (Fire Number, years to FI, etc.) are calculated annually based on
   *   annual expenses and long-term portfolio growth. A single month's data doesn't
   *   provide meaningful FIRE metrics.
   * - History section requires multiple time periods for comparison (YoY analysis,
   *   evolution charts). A single month lacks comparison context.
   *
   * User feedback: Toast notification when sections are auto-deselected.
   */
  const handleTimeFilterChange = (newFilter: TimeFilter) => {
    setTimeFilter(newFilter);

    // Reset all sections to checked when switching to total or yearly
    // (user may have previously been on monthly with some sections disabled)
    if (newFilter === 'yearly' || newFilter === 'total') {
      setSections({
        portfolio: true,
        allocation: true,
        history: true,
        cashflow: true,
        performance: true,
        fire: true,
        summary: true,
      });
    }

    // Apply time filter constraints (e.g., disable FIRE/History for monthly)
    const adjustedSections = adjustSectionsForTimeFilter(newFilter, sections);
    if (JSON.stringify(adjustedSections) !== JSON.stringify(sections)) {
      setSections(adjustedSections);
      toast.info('Alcune sezioni sono state deselezionate per questo periodo');
    }
  };

  /**
   * Validates and initiates PDF export.
   *
   * Multi-stage validation process:
   * 1. Authentication check (user must be logged in)
   * 2. Time-based snapshot filtering
   * 3. Data completeness validation for selected sections
   * 4. Options structure validation
   * 5. PDF generation (async, captures charts as images)
   *
   * Error handling:
   * - Validation errors: Show specific message via toast, abort early
   * - Generation errors: Show generic error message, log to console
   * - Always set loading=false in finally block
   *
   * On success: Close dialog and show success toast
   */
  const handleExport = async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    try {
      setLoading(true);

      // Filter snapshots to selected time period (total/yearly/monthly)
      const filteredSnapshots = filterSnapshotsByTime(snapshots, timeFilter);

      // Validate that filtered data meets requirements for selected sections
      try {
        validatePDFGeneration(filteredSnapshots, sections, timeFilter);
      } catch (validationError: any) {
        toast.error(validationError.message);
        setLoading(false);
        return;
      }

      // Prepare PDF generation options with filtered data
      const options = {
        userId: user.uid,
        userName: user.displayName || 'Utente',
        sections,
        snapshots: filteredSnapshots,
        assets,
        allocationTargets,
        timeFilter,
      };

      // Validate options structure
      validatePDFOptions(options);

      // Generate PDF (captures charts, processes data, renders document)
      await generatePDF(options);

      toast.success('PDF generato con successo');
      onOpenChange(false);

    } catch (error: any) {
      console.error('PDF generation error:', error);
      const message = error?.message || 'Errore durante la generazione del PDF';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = Object.values(sections).filter(Boolean).length;

  const sectionOptions = [
    { key: 'portfolio' as const, label: 'Portfolio Assets', description: 'Elenco dettagliato degli asset con valori e G/P' },
    { key: 'allocation' as const, label: 'Asset Allocation', description: 'Confronto allocazione corrente vs target' },
    { key: 'history' as const, label: 'Storico Patrimonio', description: 'Evoluzione patrimonio e grafici storici' },
    { key: 'cashflow' as const, label: 'Entrate e Uscite', description: 'Analisi cashflow e categorie di spesa' },
    { key: 'performance' as const, label: 'Performance', description: 'Metriche di rendimento e rischio (ROI, CAGR, TWR, Sharpe, Drawdown, YOC)' },
    { key: 'fire' as const, label: 'FIRE Calculator', description: 'Metriche FIRE e progresso verso indipendenza finanziaria' },
    { key: 'summary' as const, label: 'Riepilogo', description: 'Panoramica key metrics e metadata report' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Esporta Report PDF</DialogTitle>
          <DialogDescription>
            Seleziona il periodo e le sezioni da includere nel report portfolio
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Time filter radio group */}
          <div className="space-y-2 pb-4 border-b">
            <label className="text-sm font-medium">Periodo di Export</label>
            <TooltipProvider>
              <RadioGroup
                value={timeFilter}
                onValueChange={(value) => handleTimeFilterChange(value as TimeFilter)}
              >
                {/* Export Totale */}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="total" id="filter-total" disabled={loading} />
                  <label htmlFor="filter-total" className="text-sm cursor-pointer">
                    {getTimeFilterLabel('total', validation)}
                  </label>
                </div>

                {/* Export Annuale */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="yearly"
                        id="filter-yearly"
                        disabled={loading || !validation.hasYearlyData}
                      />
                      <label
                        htmlFor="filter-yearly"
                        className={`text-sm cursor-pointer ${
                          !validation.hasYearlyData ? 'text-muted-foreground' : ''
                        }`}
                      >
                        {getTimeFilterLabel('yearly', validation)}
                      </label>
                    </div>
                  </TooltipTrigger>
                  {!validation.hasYearlyData && (
                    <TooltipContent>
                      <p>{getTimeFilterTooltip('yearly', validation)}</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                {/* Export Mensile */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="monthly"
                        id="filter-monthly"
                        disabled={loading || !validation.hasMonthlyData}
                      />
                      <label
                        htmlFor="filter-monthly"
                        className={`text-sm cursor-pointer ${
                          !validation.hasMonthlyData ? 'text-muted-foreground' : ''
                        }`}
                      >
                        {getTimeFilterLabel('monthly', validation)}
                      </label>
                    </div>
                  </TooltipTrigger>
                  {!validation.hasMonthlyData && (
                    <TooltipContent>
                      <p>{getTimeFilterTooltip('monthly', validation)}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </RadioGroup>
            </TooltipProvider>
          </div>

          {/* Section checkboxes */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {sectionOptions.map(({ key, label, description }) => (
              <div key={key} className="flex items-start space-x-3">
                <Checkbox
                  id={key}
                  checked={sections[key]}
                  onCheckedChange={() => toggleSection(key)}
                  disabled={loading || ((key === 'fire' || key === 'history' || key === 'performance') && timeFilter === 'monthly')}
                  className="mt-1"
                />
                <label
                  htmlFor={key}
                  className="flex-1 cursor-pointer select-none"
                >
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {description}
                  </div>
                </label>
              </div>
            ))}
          </div>

          {/* Section count */}
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedCount} {selectedCount === 1 ? 'sezione selezionata' : 'sezioni selezionate'}
              </span>
            </div>

            {/* Warning for FIRE, history, and performance sections in monthly filter */}
            {timeFilter === 'monthly' && (
              <div className="text-xs text-amber-600 dark:text-amber-500">
                Le sezioni Storico Patrimonio, Performance e FIRE non sono disponibili per export mensile
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Annulla
              </Button>
              <Button
                onClick={handleExport}
                disabled={loading || selectedCount === 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generazione...
                  </>
                ) : (
                  'Genera PDF'
                )}
              </Button>
            </div>
          </div>

          {/* Warning messages */}
          {selectedCount === 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-500">
              Seleziona almeno una sezione per generare il PDF
            </div>
          )}

          {loading && (
            <div className="text-xs text-muted-foreground">
              La generazione del PDF potrebbe richiedere qualche secondo...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
