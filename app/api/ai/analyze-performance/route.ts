import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatTimePeriodLabel } from '@/lib/utils/formatters';
import { TimePeriod } from '@/types/performance';

/**
 * API Route for AI-powered performance analysis using Anthropic Claude
 *
 * STREAMING PATTERN:
 * - Uses Server-Sent Events (SSE) for real-time text generation
 * - Client receives progressive chunks as Claude generates the response
 * - Format: `data: {JSON}\n\n` with final `data: [DONE]\n\n` signal
 *
 * DATA FLOW:
 * 1. Client sends POST request with userId, metrics, timePeriod
 * 2. Server validates parameters and builds Italian prompt
 * 3. Anthropic API streams response chunks
 * 4. Server forwards chunks to client via SSE
 * 5. Client appends chunks progressively for real-time UI updates
 *
 * ERROR HANDLING:
 * - 400: Missing or invalid parameters
 * - 500: Anthropic API failure or stream error
 * - Errors logged with [API /ai/analyze-performance] prefix
 */

// Initialize Anthropic client with API key from environment
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    // Verify API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[API /ai/analyze-performance] ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { error: 'AI service not configured. Please add ANTHROPIC_API_KEY to environment variables.' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { userId, metrics, timePeriod } = body;

    // Validate required parameters
    if (!userId || !metrics || !timePeriod) {
      console.error('[API /ai/analyze-performance] Missing parameters:', { userId: !!userId, metrics: !!metrics, timePeriod: !!timePeriod });
      return NextResponse.json(
        { error: 'Missing required parameters: userId, metrics, timePeriod' },
        { status: 400 }
      );
    }

    console.log('[API /ai/analyze-performance] Request received for user:', userId, 'period:', timePeriod);

    // Build Italian prompt with performance metrics context
    const prompt = buildAnalysisPrompt(metrics, timePeriod);

    // Call Anthropic API with streaming enabled
    // Uses claude-sonnet-4-5-20250929 (latest Sonnet model with optimal cost/quality balance)
    // Extended Thinking enabled for deeper analysis (10k token budget)
    let stream;
    try {
      stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16000, // Total tokens (thinking 10k + output ~6k max)
        thinking: {
          type: 'enabled',
          budget_tokens: 10000, // Budget for internal reasoning (~10k tokens for deep analysis)
        },
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
      });
    } catch (apiError: any) {
      // Handle Anthropic API-specific errors
      console.error('[API /ai/analyze-performance] Anthropic API error:', apiError);

      if (apiError?.error?.type === 'overloaded_error') {
        return NextResponse.json(
          {
            error: 'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.',
            retryable: true
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          error: 'Errore nella chiamata AI: ' + (apiError?.error?.message || apiError.message),
          retryable: false
        },
        { status: 500 }
      );
    }

    // Create ReadableStream for Server-Sent Events (SSE)
    // Converts Anthropic stream chunks into SSE format for client consumption
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Iterate through Anthropic stream chunks
          for await (const chunk of stream) {
            // Filter for text delta events (actual content)
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text;

              // Encode as SSE format: `data: {JSON}\n\n`
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }

          // Send [DONE] signal to indicate stream completion
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamError: any) {
          console.error('[API /ai/analyze-performance] Stream error:', streamError);

          // Send error message to client via SSE
          if (streamError?.error?.type === 'overloaded_error') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                error: 'I server AI sono temporaneamente sovraccarichi. Clicca "Rigenera" per riprovare.'
              })}\n\n`)
            );
          } else {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                error: streamError?.error?.message || streamError.message || 'Errore durante la generazione'
              })}\n\n`)
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    // Return SSE response with appropriate headers
    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[API /ai/analyze-performance] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate AI analysis',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * Build Italian prompt for Claude with performance metrics context
 *
 * PROMPT DESIGN:
 * - Professional analyst persona (Italian financial expert)
 * - Structured metrics presentation (4 categories: Rendimento, Rischio, Contesto, Dividendi)
 * - Clear instructions for concise, actionable analysis (max 300 words)
 * - Markdown formatting requested (bold, bullet points) for better readability
 * - Includes translated period label + date range for better context
 *
 * @param metrics - PerformanceMetrics object with all calculated metrics
 * @param timePeriod - TimePeriod string (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
 * @returns Formatted Italian prompt string
 */
function buildAnalysisPrompt(metrics: any, timePeriod: string): string {
  // Format period label in Italian with date range for context
  const periodLabel = formatTimePeriodLabel(timePeriod as TimePeriod, metrics);
  const dateRange = `(${format(metrics.startDate, 'dd/MM/yyyy', { locale: it })} - ${format(metrics.endDate, 'dd/MM/yyyy', { locale: it })})`;

  // Include current date to help Claude contextualize the analysis period
  const today = format(new Date(), 'dd/MM/yyyy', { locale: it });

  return `Oggi è il ${today}. Sei un esperto analista finanziario italiano. Analizza le seguenti metriche di performance del portafoglio per il periodo ${periodLabel} ${dateRange}:

**Metriche di Rendimento:**
- ROI Totale: ${formatMetric(metrics.roi)}
- CAGR: ${formatMetric(metrics.cagr)}
- Time-Weighted Return: ${formatMetric(metrics.timeWeightedReturn)}
- Money-Weighted Return (IRR): ${formatMetric(metrics.moneyWeightedReturn)}

**Metriche di Rischio:**
- Volatilità: ${formatMetric(metrics.volatility)}
- Sharpe Ratio: ${formatMetric(metrics.sharpeRatio)}
- Max Drawdown: ${formatMetric(metrics.maxDrawdown)} (${metrics.maxDrawdownDate || 'n/a'})
- Durata Drawdown: ${metrics.drawdownDuration || 'n/a'} mesi
- Recovery Time: ${metrics.recoveryTime || 'n/a'} mesi

**Metriche di Contesto:**
- Contributi Netti: ${formatCurrency(metrics.netCashFlow)}
- Durata: ${metrics.numberOfMonths} mesi

${metrics.yocGross !== null ? `**Metriche Dividendi:**
- YOC Lordo: ${formatMetric(metrics.yocGross)}
- YOC Netto: ${formatMetric(metrics.yocNet)}
- Current Yield Lordo: ${formatMetric(metrics.currentYield)}
- Current Yield Netto: ${formatMetric(metrics.currentYieldNet)}` : ''}

Fornisci un'analisi concisa e actionable (massimo 350 parole) che:
1. Interpreta le metriche chiave e cosa significano per questo portafoglio
2. Identifica gli eventi chiave dei mercati finanziari nel periodo analizzato (crisi, rally, shock geopolitici, decisioni banche centrali) e spiega come potrebbero aver influenzato la performance del portafoglio
3. Evidenzia i punti di forza della performance
4. Identifica aree di miglioramento o rischi da considerare
5. Se appropriato, offri 1-2 suggerimenti concreti

Usa un tono professionale ma accessibile. Rispondi in italiano con formattazione markdown (grassetto per concetti chiave, bullet points per elenchi).`;
}

/**
 * Format metric value as percentage string
 * Handles null values gracefully (shows "n/a" instead of error)
 *
 * @param value - Numeric metric value or null
 * @returns Formatted string like "12.34%" or "n/a"
 */
function formatMetric(value: number | null): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(2)}%`;
}

/**
 * Format currency value as EUR string
 * Uses Italian locale formatting (€1.234,56)
 *
 * @param value - Numeric currency value or null
 * @returns Formatted string like "€1.234,56" or "n/a"
 */
function formatCurrency(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}
