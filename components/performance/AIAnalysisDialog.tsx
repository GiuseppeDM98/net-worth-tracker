'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatTimePeriodLabel } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TimePeriod } from '@/types/performance';

/**
 * AI Analysis Dialog Component
 *
 * PURPOSE:
 * Displays AI-generated performance analysis in a modal dialog with real-time streaming.
 * Two-column layout: metrics panel (left) + analysis text (right).
 *
 * STREAMING FIX:
 * During streaming, analysis is rendered as plain text (whitespace-pre-wrap) to avoid
 * layout jumps from ReactMarkdown re-parsing partial/incomplete markdown on every chunk.
 * ReactMarkdown is only used once the stream is complete.
 *
 * UX FLOW:
 * 1. Dialog opens → auto-starts analysis fetch
 * 2. Spinner shows: "Analisi in corso..."
 * 3. First chunk arrives (~0.5s) → plain text starts appearing smoothly
 * 4. Stream completes → plain text replaced by rendered markdown
 * 5. User reads analysis with metrics panel visible on the left
 */

export interface AIAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: any; // PerformanceMetrics
  timePeriod: TimePeriod;
  userId: string;
}

// Format percentage metric, returns "N/D" for null
function fmtPct(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return 'N/D';
  return `${value.toFixed(decimals)}%`;
}

// Format EUR currency value, returns "N/D" for null
function fmtEur(value: number | null): string {
  if (value === null || value === undefined) return 'N/D';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

// Color class based on positive/negative value
function valueColor(value: number | null): string {
  if (value === null || value === undefined) return '';
  return value > 0 ? 'text-green-600 dark:text-green-400' : value < 0 ? 'text-red-600 dark:text-red-400' : '';
}

export function AIAnalysisDialog({
  open,
  onOpenChange,
  metrics,
  timePeriod,
  userId,
}: AIAnalysisDialogProps) {
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  /**
   * Fetch AI analysis with streaming support
   *
   * STREAMING PATTERN (Server-Sent Events):
   * 1. Send POST request to /api/ai/analyze-performance
   * 2. Receive SSE stream: `data: {JSON}\n\n` format
   * 3. Parse chunks and append text progressively
   * 4. Stop when receiving `data: [DONE]\n\n`
   */
  const fetchAnalysis = async () => {
    setLoading(true);
    setAnalysis('');
    setError(null);

    try {
      const response = await fetch('/api/ai/analyze-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, metrics, timePeriod }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate analysis');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') {
            setLoading(false);
            setGeneratedAt(new Date());
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              setError(parsed.error);
              setLoading(false);
              return;
            }
            if (parsed.text) {
              setAnalysis((prev) => prev + parsed.text);
            }
          } catch (e) {
            console.warn('[AIAnalysisDialog] Failed to parse SSE chunk:', e);
          }
        }
      }

      setLoading(false);
    } catch (err) {
      setError((err as Error).message || "Errore durante la generazione dell'analisi");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !analysis && !loading) {
      fetchAnalysis();
    }
  }, [open]);

  const handleCopyAnalysis = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      toast.success('Analisi copiata negli appunti');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossibile copiare il testo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Analisi AI del Portafoglio
          </DialogTitle>
          <DialogDescription>
            Periodo: {formatTimePeriodLabel(timePeriod, metrics)} • Generato da Claude Sonnet 4.6
          </DialogDescription>
        </DialogHeader>

        {/* Body: stacked on mobile (metrics above text), side-by-side on desktop */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-0 min-h-0">

          {/* Metrics panel — top on mobile, left sidebar on desktop */}
          {metrics && (
            <div className="shrink-0 overflow-y-auto
              w-full border-b pb-3 mb-1 md:mb-0 md:pb-0 md:border-b-0 md:border-r md:w-[260px] md:pr-4
              max-h-[180px] md:max-h-none text-sm">

              {/* On mobile: 2-column grid for compactness. On desktop: vertical list per section */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0 md:grid-cols-1 md:space-y-4 md:gap-0">

                {/* Rendimento */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-1 md:mt-0">Rendimento</p>
                  <div className="space-y-1.5">
                    <MetricRow label="ROI" value={fmtPct(metrics.roi)} colorClass={valueColor(metrics.roi)} />
                    <MetricRow label="CAGR" value={fmtPct(metrics.cagr)} colorClass={valueColor(metrics.cagr)} />
                    <MetricRow label="TWR" value={fmtPct(metrics.timeWeightedReturn)} colorClass={valueColor(metrics.timeWeightedReturn)} />
                    <MetricRow label="MWR / IRR" value={fmtPct(metrics.moneyWeightedReturn)} colorClass={valueColor(metrics.moneyWeightedReturn)} />
                  </div>
                </div>

                {/* Contesto — second column on mobile (most readable pair with Rendimento) */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-1 md:mt-0">Contesto</p>
                  <div className="space-y-1.5">
                    <MetricRow label="Inizio" value={fmtEur(metrics.startNetWorth)} />
                    <MetricRow label="Fine" value={fmtEur(metrics.endNetWorth)} />
                    <MetricRow label="Contributi" value={fmtEur(metrics.netCashFlow)} colorClass={valueColor(metrics.netCashFlow)} />
                    <MetricRow label="Durata" value={`${metrics.numberOfMonths} mesi`} />
                  </div>
                </div>

                {/* Rischio */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-2 md:mt-0">Rischio</p>
                  <div className="space-y-1.5">
                    <MetricRow label="Volatilità" value={fmtPct(metrics.volatility)} />
                    <MetricRow label="Sharpe Ratio" value={metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : 'N/D'} colorClass={valueColor(metrics.sharpeRatio)} />
                    <MetricRow
                      label="Max Drawdown"
                      value={metrics.maxDrawdown !== null ? `${fmtPct(metrics.maxDrawdown)}${metrics.maxDrawdownDate ? ` (${metrics.maxDrawdownDate})` : ''}` : 'N/D'}
                      colorClass={metrics.maxDrawdown !== null && metrics.maxDrawdown < 0 ? 'text-red-600 dark:text-red-400' : ''}
                    />
                    <MetricRow label="Durata DD" value={metrics.drawdownDuration ? `${metrics.drawdownDuration} mesi` : 'N/D'} />
                    <MetricRow label="Recovery" value={metrics.recoveryTime ? `${metrics.recoveryTime} mesi` : 'N/D'} />
                  </div>
                </div>

                {/* Dividendi — solo se disponibili */}
                {metrics.yocGross !== null && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-2 md:mt-0">Dividendi</p>
                    <div className="space-y-1.5">
                      <MetricRow label="YOC Lordo" value={fmtPct(metrics.yocGross)} colorClass={valueColor(metrics.yocGross)} />
                      <MetricRow label="YOC Netto" value={fmtPct(metrics.yocNet)} colorClass={valueColor(metrics.yocNet)} />
                      <MetricRow label="Yield Lordo" value={fmtPct(metrics.currentYield)} colorClass={valueColor(metrics.currentYield)} />
                      <MetricRow label="Yield Netto" value={fmtPct(metrics.currentYieldNet)} colorClass={valueColor(metrics.currentYieldNet)} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analysis content */}
          <div className="flex-1 overflow-y-auto md:pl-4 min-h-0">

            {/* Loading state — no text yet */}
            {loading && !analysis && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                <p className="text-sm text-muted-foreground">Analisi in corso...</p>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-300">
                <p className="font-semibold">Errore</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            )}

            {/* Streaming: plain text to avoid ReactMarkdown re-parse jumps on partial markdown */}
            {loading && analysis && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{analysis}</p>
            )}

            {/* Complete: full markdown rendering */}
            {!loading && analysis && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({ children }) => (
                      <strong className="font-semibold text-foreground">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-1">{children}</ol>
                    ),
                  }}
                >
                  {analysis}
                </ReactMarkdown>
              </div>
            )}

            {/* Streaming indicator shown while text is arriving */}
            {loading && analysis && (
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Generazione in corso...</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-row justify-between items-center border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {generatedAt && (
              <span className="mr-2">
                Generato il {format(generatedAt, 'dd/MM/yyyy HH:mm', { locale: it })} •
              </span>
            )}
            L&apos;analisi AI è generata automaticamente e non costituisce consulenza finanziaria.
          </p>
          <div className="flex gap-2">
            {analysis && !loading && (
              <>
                <Button variant="outline" onClick={handleCopyAnalysis} className="gap-2">
                  {copied ? <><Check className="h-4 w-4" />Copiato</> : <><Copy className="h-4 w-4" />Copia Analisi</>}
                </Button>
                <Button variant="outline" onClick={fetchAnalysis}>Rigenera</Button>
              </>
            )}
            <Button variant="default" onClick={() => onOpenChange(false)}>Chiudi</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small helper for a label + value row in the metrics panel
function MetricRow({ label, value, colorClass = '' }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <span className={cn('text-xs font-medium tabular-nums shrink-0', colorClass)}>{value}</span>
    </div>
  );
}
