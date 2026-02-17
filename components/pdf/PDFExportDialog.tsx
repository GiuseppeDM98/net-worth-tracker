// components/pdf/PDFExportDialog.tsx
// Dialog component for selecting PDF sections and initiating export

'use client';

import { useState, useEffect, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

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
  const [selectedYear, setSelectedYear] = useState(validation.currentYear);
  const [selectedMonth, setSelectedMonth] = useState(validation.currentMonth);
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

  // Derive available years and months from snapshot data
  const availableYears = useMemo(() => {
    const years = new Set(snapshots.map(s => s.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [snapshots]);

  const availableMonthsForYear = useMemo(() => {
    const months = new Set(
      snapshots.filter(s => s.year === selectedYear).map(s => s.month)
    );
    return Array.from(months).sort((a, b) => a - b);
  }, [snapshots, selectedYear]);

  // Whether the selected period is in the past (no current asset-level data available)
  const isPastPeriod = useMemo(() => {
    const now = new Date();
    if (timeFilter === 'monthly') return true;
    if (timeFilter === 'yearly' && selectedYear < now.getFullYear()) return true;
    return false;
  }, [timeFilter, selectedYear]);

  // Sections that should be disabled for the current period selection
  const disabledSections = useMemo(() => {
    const disabled = new Set<keyof SectionSelection>();
    if (timeFilter === 'monthly') {
      disabled.add('fire');
      disabled.add('history');
      disabled.add('performance');
      disabled.add('portfolio');
      disabled.add('allocation');
      disabled.add('summary');
    } else if (isPastPeriod) {
      disabled.add('portfolio');
      disabled.add('allocation');
      disabled.add('summary');
      disabled.add('fire');
    }
    return disabled;
  }, [timeFilter, isPastPeriod]);

  // Revalidate time filter availability when snapshot data changes
  useEffect(() => {
    setValidation(validateTimeFilterData(snapshots));
  }, [snapshots]);

  // Auto-adjust sections when year selection changes within yearly mode
  useEffect(() => {
    if (timeFilter !== 'yearly') return;
    setSections(prev => {
      const adjusted = adjustSectionsForTimeFilter(timeFilter, prev, isPastPeriod);
      if (JSON.stringify(adjusted) !== JSON.stringify(prev)) {
        return adjusted;
      }
      // Re-enable sections when switching back to current year
      if (!isPastPeriod && (!prev.portfolio || !prev.allocation || !prev.summary || !prev.fire)) {
        return { ...prev, portfolio: true, allocation: true, summary: true, fire: true };
      }
      return prev;
    });
  }, [selectedYear, isPastPeriod, timeFilter]);

  const toggleSection = (key: keyof SectionSelection) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /**
   * Handles time filter changes with automatic section adjustment.
   *
   * Section availability rules:
   * - Total: all sections available
   * - Yearly (current year): all sections available
   * - Yearly (past year): Portfolio/Allocation/Summary disabled (no historical asset data)
   * - Monthly: only Cashflow available (single month lacks context for other sections)
   *
   * User feedback: Toast notification when sections are auto-deselected.
   */
  const handleTimeFilterChange = (newFilter: TimeFilter) => {
    setTimeFilter(newFilter);

    // Reset to most recent available period when switching modes
    let newYear = selectedYear;
    if (availableYears.length > 0) {
      newYear = availableYears[0];
      setSelectedYear(newYear);
      const monthsForLatestYear = snapshots
        .filter(s => s.year === newYear)
        .map(s => s.month);
      if (monthsForLatestYear.length > 0) {
        setSelectedMonth(Math.max(...monthsForLatestYear));
      }
    }

    // Determine if the new period is in the past
    const newIsPast = newFilter === 'monthly' ||
      (newFilter === 'yearly' && newYear < new Date().getFullYear());

    // Reset all sections to checked, then apply constraints
    const allEnabled: SectionSelection = {
      portfolio: true,
      allocation: true,
      history: true,
      cashflow: true,
      performance: true,
      fire: true,
      summary: true,
    };
    const adjusted = adjustSectionsForTimeFilter(newFilter, allEnabled, newIsPast);
    setSections(adjusted);

    if (JSON.stringify(adjusted) !== JSON.stringify(allEnabled)) {
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

      // Filter snapshots to selected time period with user-chosen year/month
      const filteredSnapshots = filterSnapshotsByTime(
        snapshots,
        timeFilter,
        timeFilter !== 'total' ? selectedYear : undefined,
        timeFilter === 'monthly' ? selectedMonth : undefined
      );

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
        selectedYear: timeFilter !== 'total' ? selectedYear : undefined,
        selectedMonth: timeFilter === 'monthly' ? selectedMonth : undefined,
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

                {/* Export Annuale — with year selector */}
                <div>
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
                          {getTimeFilterLabel('yearly', validation, selectedYear)}
                        </label>
                      </div>
                    </TooltipTrigger>
                    {!validation.hasYearlyData && (
                      <TooltipContent>
                        <p>{getTimeFilterTooltip('yearly', validation)}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {timeFilter === 'yearly' && availableYears.length > 1 && (
                    <div className="ml-6 mt-1.5">
                      <Select
                        value={selectedYear.toString()}
                        onValueChange={(v) => setSelectedYear(parseInt(v))}
                      >
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableYears.map(year => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Export Mensile — with month + year selectors */}
                <div>
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
                          {getTimeFilterLabel('monthly', validation, selectedYear, selectedMonth)}
                        </label>
                      </div>
                    </TooltipTrigger>
                    {!validation.hasMonthlyData && (
                      <TooltipContent>
                        <p>{getTimeFilterTooltip('monthly', validation)}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {timeFilter === 'monthly' && (
                    <div className="ml-6 mt-1.5 flex gap-2">
                      <Select
                        value={selectedMonth.toString()}
                        onValueChange={(v) => setSelectedMonth(parseInt(v))}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMonthsForYear.map(m => (
                            <SelectItem key={m} value={m.toString()}>
                              {ITALIAN_MONTHS[m - 1]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {availableYears.length > 1 && (
                        <Select
                          value={selectedYear.toString()}
                          onValueChange={(v) => {
                            const newYear = parseInt(v);
                            setSelectedYear(newYear);
                            // Reset month if not available in new year
                            const monthsForNewYear = snapshots
                              .filter(s => s.year === newYear)
                              .map(s => s.month);
                            if (!monthsForNewYear.includes(selectedMonth)) {
                              setSelectedMonth(Math.max(...monthsForNewYear));
                            }
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableYears.map(year => (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
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
                  disabled={loading || disabledSections.has(key)}
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

            {/* Warning for disabled sections based on period selection */}
            {timeFilter === 'monthly' && (
              <div className="text-xs text-amber-600 dark:text-amber-500">
                Solo la sezione Entrate e Uscite è disponibile per export mensile
              </div>
            )}
            {isPastPeriod && timeFilter === 'yearly' && (
              <div className="text-xs text-amber-600 dark:text-amber-500">
                Portfolio, Allocation, FIRE e Riepilogo non sono disponibili per anni passati (dati storici solo aggregati)
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
