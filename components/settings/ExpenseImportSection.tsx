'use client';

/**
 * ExpenseImportSection — Settings → Spese, the «Import CSV» tile.
 *
 * A 4-phase wizard (idle → preview → committing → done) to migrate historical
 * expense/income data from a standardized CSV. Parsing/validation is delegated to
 * the pure lib/utils/expenseImport.ts layer; the Firestore commit/undo to
 * lib/services/expenseImportService.ts. Every import is undoable via its batch id.
 *
 * The tile's reading line states the phase (settingsNarrative.describeImport): the
 * idle promise, the preview's three counts (import/skip/create — nothing moves
 * without confirmation), the undoable outcome. The preview's figures are flat KPIs
 * (sub-eyebrow · 18px mono · caption), never tinted sub-cards.
 *
 * Owner-scoped like every other Cashflow surface: `ownerId` comes from
 * `useActiveAccount()`, not `user.uid`, so a shared-account delegate imports into
 * the active account's data, not their own.
 */

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, FileText, AlertTriangle, CheckCircle2, Undo2, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { describeImport } from '@/lib/utils/settingsNarrative';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { buildImportPlan, parseImportCsv, buildTemplateCsv } from '@/lib/utils/expenseImport';
import { commitImportPlan, deleteExpensesByImportBatch } from '@/lib/services/expenseImportService';
import { ImportPlan } from '@/types/expenseImport';

type Phase = 'idle' | 'preview' | 'committing' | 'done';

interface ExpenseImportSectionProps {
  /** Called after a successful commit or undo, so the parent can refresh categories/expenses. */
  onImported?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  fixed: 'Spese Fisse',
  variable: 'Spese Variabili',
  debt: 'Debiti',
  income: 'Entrate',
};

/** A flat KPI of the preview: sub-eyebrow, 18px mono figure, muted caption. */
function PreviewKpi({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="mt-1 font-mono text-[18px] font-bold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      {caption && <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>}
    </div>
  );
}

export default function ExpenseImportSection({ onImported }: ExpenseImportSectionProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [lastBatch, setLastBatch] = useState<{ importBatchId: string; created: number } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const reset = () => {
    setPhase('idle');
    setPlan(null);
    setFileName('');
    setLastBatch(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-spese.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseImportCsv(text);
      const categories = await getAllCategories(ownerId);
      const built = buildImportPlan(rows, categories);
      setPlan(built);
      setPhase('preview');
      if (built.validRows.length === 0) {
        toast.warning('Nessuna riga valida trovata nel file.');
      }
    } catch (err) {
      console.error('CSV parse error:', err);
      toast.error(err instanceof Error ? err.message : 'Impossibile leggere il file CSV.');
      reset();
    }
  };

  const handleConfirm = async () => {
    if (!plan || plan.validRows.length === 0 || !ownerId) return;
    setPhase('committing');
    try {
      // Re-read categories right before committing: the preview may be stale if the
      // user edited categories elsewhere while this dialog was open.
      const categories = await getAllCategories(ownerId);
      const result = await commitImportPlan(ownerId, plan, categories);
      setLastBatch(result);
      setPhase('done');
      toast.success(`Importate ${result.created} transazioni.`);
      onImported?.();
    } catch (err) {
      console.error('Import commit error:', err);
      toast.error("Errore durante l'importazione.");
      setPhase('preview');
    }
  };

  const handleUndo = async () => {
    if (!lastBatch || !ownerId) return;
    setUndoing(true);
    try {
      const deleted = await deleteExpensesByImportBatch(ownerId, lastBatch.importBatchId);
      toast.success(`Import annullato: ${deleted} transazioni rimosse.`);
      onImported?.();
      reset();
    } catch (err) {
      console.error('Undo import error:', err);
      toast.error("Errore durante l'annullamento.");
    } finally {
      setUndoing(false);
    }
  };

  const reading =
    phase === 'preview' && plan
      ? describeImport({
          phase: 'preview',
          fileName,
          validCount: plan.summary.validCount,
          skippedCount: plan.summary.skippedCount,
          newCategoriesCount: plan.summary.newCategoriesCount,
        })
      : phase === 'done' && lastBatch
        ? describeImport({ phase: 'done', created: lastBatch.created })
        : describeImport({ phase: 'idle' });

  return (
    <Tile eyebrow="Import CSV" aside="anteprima obbligatoria" reading={reading}>
      {phase === 'idle' && (
        <>
          <div className="mt-3.5 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Scarica template CSV
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isDemo}
              className="w-full sm:w-auto"
            >
              <Upload className="mr-2 h-4 w-4" />
              Carica file CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
              aria-label="Carica file CSV storico spese"
            />
          </div>
          {isDemo && (
            <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
              Il caricamento non è disponibile in modalità demo.
            </p>
          )}
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Una riga per transazione; le categorie mancanti vengono create; i saldi dei conti non vengono toccati.
          </div>
        </>
      )}

      {phase === 'preview' && plan && (
        <>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{fileName}</span>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <PreviewKpi
              label="Da importare"
              value={String(plan.summary.validCount)}
              caption={`${cachedFormatCurrencyEUR(plan.summary.totalIncome, true)} entrate · ${cachedFormatCurrencyEUR(plan.summary.totalExpense, true)} uscite`}
            />
            <PreviewKpi
              label="Scartate"
              value={String(plan.summary.skippedCount)}
              caption={plan.summary.skippedCount > 0 ? 'motivi riga per riga qui sotto' : undefined}
            />
            <PreviewKpi
              label="Da creare"
              value={String(plan.summary.newCategoriesCount)}
              caption={
                plan.summary.dateFrom && plan.summary.dateTo
                  ? `periodo ${formatDate(plan.summary.dateFrom)} → ${formatDate(plan.summary.dateTo)}`
                  : undefined
              }
            />
          </div>

          {plan.categoriesToCreate.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Categorie che verranno create</p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.categoriesToCreate.map((c) => (
                  // Keyed by (type, name): two same-named categories of different
                  // types can legitimately be created by the same import.
                  <li key={`${c.type}::${c.name}`}>
                    • {c.name} <span className="opacity-70">({TYPE_LABELS[c.type] ?? c.type})</span>
                    {c.subCategories.length > 0 && (
                      <span className="opacity-70"> — {c.subCategories.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Deterministic choices the user must SEE before committing — e.g. two
              same-named same-typed categories, rows attaching to the oldest one. */}
          {plan.notices.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={`${TILE_SUB_EYEBROW_CLASS} flex items-center gap-1.5`}>
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Da sapere prima di importare
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.notices.map((n) => (
                  <li key={`${n.type}::${n.categoryName}`}>• {n.message}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.errors.length > 0 && (
            <Collapsible className="mt-3.5 border-t border-border pt-3">
              <CollapsibleTrigger className="flex items-center gap-2 text-[13px] text-warning-foreground hover:underline">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Mostra {plan.errors.length} righe scartate
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border text-[13px]">
                  {plan.errors.map((err, i) => (
                    <div key={i} className="flex gap-3 px-3 py-2">
                      <span className="shrink-0 font-mono text-muted-foreground">Riga {err.line}</span>
                      <span>{err.reason}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3.5 sm:flex-row">
            <Button
              onClick={handleConfirm}
              disabled={isDemo || plan.validRows.length === 0}
              className="w-full sm:w-auto"
            >
              Importa {plan.validRows.length} voci
            </Button>
            <Button variant="outline" onClick={reset} className="w-full sm:w-auto">
              Annulla
            </Button>
          </div>
        </>
      )}

      {phase === 'committing' && (
        <div className="mt-3.5 flex items-center gap-3 py-4 text-[13px] text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Importazione in corso…
        </div>
      )}

      {phase === 'done' && lastBatch && (
        <>
          <div className="mt-3.5 flex items-center gap-2 text-[13px]">
            <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden="true" />
            <span className="font-medium">Importate {lastBatch.created} transazioni.</span>
          </div>
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3.5 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleUndo}
              disabled={undoing || isDemo}
              className="w-full sm:w-auto"
            >
              {undoing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
              Annulla import
            </Button>
            <Button variant="ghost" onClick={reset} className="w-full sm:w-auto">
              Importa un altro file
            </Button>
          </div>
        </>
      )}
    </Tile>
  );
}
