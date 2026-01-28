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
 * Provides insights on portfolio metrics, strengths, weaknesses, and actionable recommendations.
 *
 * FEATURES:
 * - Auto-fetch analysis on dialog open
 * - Real-time streaming text generation (SSE pattern)
 * - Markdown rendering for rich formatting (bold, lists, etc.)
 * - Error handling with user-friendly messages
 * - Regenerate button for new analysis
 * - Disclaimer footer (AI is not financial advice)
 *
 * UX FLOW:
 * 1. Dialog opens → auto-starts analysis fetch
 * 2. Spinner shows: "Analisi in corso..."
 * 3. First chunk arrives (~0.5s) → text starts appearing
 * 4. Text streams progressively (real-time updates)
 * 5. Stream completes → spinner disappears
 * 6. User reads analysis → optional regenerate → close
 */

interface AIAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: any; // PerformanceMetrics
  timePeriod: TimePeriod;
  userId: string;
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
   *
   * BUFFER HANDLING:
   * - SSE messages delimited by `\n\n`
   * - Keep incomplete lines in buffer for next iteration
   * - Prevents parsing errors on partial chunks
   *
   * ERROR HANDLING:
   * - Network errors: Show error banner, allow regenerate
   * - API errors: Parse error message from response
   * - Stream errors: Log warning, continue processing
   */
  const fetchAnalysis = async () => {
    console.log('[AIAnalysisDialog] Starting analysis fetch...');
    setLoading(true);
    setAnalysis('');
    setError(null);

    try {
      console.log('[AIAnalysisDialog] Sending request to API...', {
        userId,
        timePeriod,
        hasMetrics: !!metrics,
      });
      const response = await fetch('/api/ai/analyze-performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          metrics,
          timePeriod,
        }),
      });

      // Handle non-OK responses (400, 500)
      if (!response.ok) {
        console.error('[AIAnalysisDialog] API returned error status:', response.status);
        const errorData = await response.json();
        console.error('[AIAnalysisDialog] Error details:', errorData);
        throw new Error(errorData.error || 'Failed to generate analysis');
      }

      console.log('[AIAnalysisDialog] Response OK, starting SSE stream...');

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove "data: " prefix

            // Check for [DONE] signal
            if (data === '[DONE]') {
              console.log('[AIAnalysisDialog] Stream completed (DONE signal received)');
              setLoading(false);
              setGeneratedAt(new Date());
              return;
            }

            // Parse JSON chunk
            try {
              const parsed = JSON.parse(data);

              // Check if it's an error message from server
              if (parsed.error) {
                console.error('[AIAnalysisDialog] Error from server:', parsed.error);
                setError(parsed.error);
                setLoading(false);
                return;
              }

              // Otherwise it's text content
              if (parsed.text) {
                // Append text chunk to analysis (progressive rendering)
                setAnalysis((prev) => prev + parsed.text);
              }
            } catch (e) {
              console.warn('[AIAnalysisDialog] Failed to parse SSE chunk:', e);
            }
          }
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('[AIAnalysisDialog] Error:', err);
      setError(
        (err as Error).message || "Errore durante la generazione dell'analisi"
      );
      setLoading(false);
    }
  };

  /**
   * Auto-fetch analysis when dialog opens
   * Uses useEffect to trigger on mount or when dialog opens
   */
  useEffect(() => {
    console.log('[AIAnalysisDialog] useEffect triggered:', {
      open,
      hasAnalysis: !!analysis,
      isLoading: loading,
    });

    // Trigger fetch when dialog opens and no analysis is loaded yet
    if (open && !analysis && !loading) {
      console.log('[AIAnalysisDialog] Auto-fetching analysis...');
      fetchAnalysis();
    }
  }, [open]); // Re-run when dialog open state changes

  /**
   * Copy analysis text to clipboard
   * Shows success/error toast and temporary checkmark icon
   */
  const handleCopyAnalysis = async () => {
    if (!analysis) return;

    try {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      toast.success('Analisi copiata negli appunti');

      // Reset icon after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[AIAnalysisDialog] Failed to copy:', err);
      toast.error('Impossibile copiare il testo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Analisi AI del Portafoglio
          </DialogTitle>
          <DialogDescription>
            Periodo: {formatTimePeriodLabel(timePeriod, metrics)} • Generato da Claude Sonnet 4.5
          </DialogDescription>
        </DialogHeader>

        {/* Summary Metrics - Quick Reference */}
        {metrics && (
          <div className="grid grid-cols-3 gap-3 py-3 px-1 border-b">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">ROI</div>
              <div className={cn(
                "text-lg font-semibold",
                metrics.roi !== null && metrics.roi > 0 ? "text-green-600" :
                metrics.roi !== null && metrics.roi < 0 ? "text-red-600" : ""
              )}>
                {metrics.roi !== null ? `${metrics.roi.toFixed(2)}%` : 'N/D'}
              </div>
            </div>

            <div className="text-center border-x">
              <div className="text-xs text-muted-foreground mb-1">CAGR</div>
              <div className={cn(
                "text-lg font-semibold",
                metrics.cagr !== null && metrics.cagr > 0 ? "text-green-600" :
                metrics.cagr !== null && metrics.cagr < 0 ? "text-red-600" : ""
              )}>
                {metrics.cagr !== null ? `${metrics.cagr.toFixed(2)}%` : 'N/D'}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">TWR</div>
              <div className={cn(
                "text-lg font-semibold",
                metrics.timeWeightedReturn !== null && metrics.timeWeightedReturn > 0 ? "text-green-600" :
                metrics.timeWeightedReturn !== null && metrics.timeWeightedReturn < 0 ? "text-red-600" : ""
              )}>
                {metrics.timeWeightedReturn !== null ? `${metrics.timeWeightedReturn.toFixed(2)}%` : 'N/D'}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading state (no analysis yet) */}
          {loading && !analysis && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              <p className="text-sm text-muted-foreground">
                Analisi in corso...
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              <p className="font-semibold">Errore</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Analysis content (with markdown rendering) */}
          {analysis && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Customize markdown rendering for better styling
                  strong: ({ children }) => (
                    <strong className="font-semibold text-foreground">
                      {children}
                    </strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside space-y-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside space-y-1">
                      {children}
                    </ol>
                  ),
                }}
              >
                {analysis}
              </ReactMarkdown>
            </div>
          )}

          {/* Streaming indicator (show while loading AND has partial text) */}
          {loading && analysis && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generazione in corso...</span>
            </div>
          )}
        </div>

        {/* Footer with disclaimer and action buttons */}
        <DialogFooter className="flex-row justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {generatedAt && (
              <span className="inline-block mr-2">
                Generato il {format(generatedAt, 'dd/MM/yyyy HH:mm', { locale: it })} •
              </span>
            )}
            L&apos;analisi AI è generata automaticamente e non costituisce
            consulenza finanziaria.
          </p>
          <div className="flex gap-2">
            {/* Copy and Regenerate buttons (only show when analysis complete) */}
            {analysis && !loading && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCopyAnalysis}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copiato
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copia Analisi
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={fetchAnalysis}>
                  Rigenera
                </Button>
              </>
            )}
            <Button variant="default" onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
