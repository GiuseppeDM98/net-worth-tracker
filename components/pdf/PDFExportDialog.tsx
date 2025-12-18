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
  const [sections, setSections] = useState<SectionSelection>({
    portfolio: true,
    allocation: true,
    history: true,
    cashflow: true,
    fire: true,
    summary: true,
  });

  // Recalculate validation when snapshots change
  useEffect(() => {
    setValidation(validateTimeFilterData(snapshots));
  }, [snapshots]);

  const toggleSection = (key: keyof SectionSelection) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTimeFilterChange = (newFilter: TimeFilter) => {
    setTimeFilter(newFilter);

    // If switching to yearly or total, reset all sections to checked
    if (newFilter === 'yearly' || newFilter === 'total') {
      setSections({
        portfolio: true,
        allocation: true,
        history: true,
        cashflow: true,
        fire: true,
        summary: true,
      });
    }

    // Adjust sections if necessary (disable FIRE and history for monthly)
    const adjustedSections = adjustSectionsForTimeFilter(newFilter, sections);
    if (JSON.stringify(adjustedSections) !== JSON.stringify(sections)) {
      setSections(adjustedSections);
      toast.info('Alcune sezioni sono state deselezionate per questo periodo');
    }
  };

  const handleExport = async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    try {
      setLoading(true);

      // Filter snapshots based on timeFilter
      const filteredSnapshots = filterSnapshotsByTime(snapshots, timeFilter);

      // Validate PDF generation
      try {
        validatePDFGeneration(filteredSnapshots, sections, timeFilter);
      } catch (validationError: any) {
        toast.error(validationError.message);
        setLoading(false);
        return;
      }

      // Validate options
      const options = {
        userId: user.uid,
        userName: user.displayName || 'Utente',
        sections,
        snapshots: filteredSnapshots, // Use filtered snapshots
        assets,
        allocationTargets,
        timeFilter, // Pass timeFilter to generator
      };

      validatePDFOptions(options);

      // Generate PDF
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
                  disabled={loading || ((key === 'fire' || key === 'history') && timeFilter === 'monthly')}
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

            {/* Warning for FIRE and history sections in monthly filter */}
            {timeFilter === 'monthly' && (
              <div className="text-xs text-amber-600 dark:text-amber-500">
                Le sezioni Storico Patrimonio e FIRE non sono disponibili per export mensile
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
