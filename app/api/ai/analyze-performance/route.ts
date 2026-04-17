import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatTimePeriodLabel } from '@/lib/utils/formatters';
import { PerformanceMetrics, TimePeriod } from '@/types/performance';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';

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
 * 3. Anthropic API streams response chunks (Claude may invoke web_search autonomously)
 * 4. Server forwards text chunks to client via SSE (tool use blocks are ignored)
 * 5. Client appends chunks progressively for real-time UI updates
 *
 * WEB SEARCH:
 * - Claude uses native web_search_20250305 tool to fetch recent market events
 * - No preprocessing needed — Claude decides what to search and when
 * - tool_use and web_search_tool_result stream blocks are silently ignored
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
    const decodedToken = await requireFirebaseAuth(request);
    // Verify API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[API /ai/analyze-performance] ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { error: 'AI service not configured. Please add ANTHROPIC_API_KEY to environment variables.' },
        { status: 500 }
      );
    }

    // Parse request body
    const requestBody = await request.json();
    const { userId, metrics: performanceMetrics, timePeriod } = requestBody;

    assertSameUser(decodedToken, userId);

    // Validate required parameters
    if (!userId || !performanceMetrics || !timePeriod) {
      console.error('[API /ai/analyze-performance] Missing parameters:', {
        userId: !!userId,
        metrics: !!performanceMetrics,
        timePeriod: !!timePeriod
      });
      return NextResponse.json(
        { error: 'Missing required parameters: userId, metrics, timePeriod' },
        { status: 400 }
      );
    }

    console.log('[API /ai/analyze-performance] Request received for user:', userId, 'period:', timePeriod);

    // Build Italian prompt with performance metrics
    const prompt = buildAnalysisPrompt(performanceMetrics, timePeriod);

    // Call Anthropic API with streaming enabled
    // Uses claude-sonnet-4-6 (latest Sonnet model with optimal cost/quality balance)
    // Extended Thinking enabled for deeper analysis (10k token budget)
    // web_search_20250305 tool: Claude autonomously searches for market events in the period
    let anthropicStream;
    try {
      anthropicStream = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000, // Total tokens (thinking 10k + output ~6k max)
        thinking: {
          type: 'enabled',
          budget_tokens: 10000, // Budget for internal reasoning (~10k tokens for deep analysis)
        },
        tools: [
          {
            // Native Anthropic web search — Claude decides what to search and when.
            // No external API key needed; billed at $10/1000 searches + token costs.
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 3, // Limit searches to keep latency reasonable
          } as any,
        ],
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
    // Converts Anthropic stream chunks into SSE format for client consumption.
    // Tool use blocks (server_tool_use, web_search_tool_result) are silently skipped —
    // only text_delta chunks (Claude's written response) are forwarded to the client.
    const encoder = new TextEncoder();
    const sseResponseStream = new ReadableStream({
      async start(controller) {
        try {
          // Iterate through Anthropic stream chunks
          for await (const chunk of anthropicStream) {
            // Filter for text delta events only (skip tool use, thinking, etc.)
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
    return new NextResponse(sseResponseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

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
 * - Instructs Claude to use web_search to find recent market events for the period
 * - Structured metrics presentation (4 categories: Rendimento, Rischio, Contesto, Dividendi)
 * - Clear instructions for concise, actionable analysis (max 350 words)
 * - Markdown formatting requested (bold, bullet points) for better readability
 * - Includes translated period label + date range for better context
 *
 * @param metrics - PerformanceMetrics object with all calculated metrics
 * @param timePeriod - TimePeriod string (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
 * @returns Formatted Italian prompt string
 */
function buildAnalysisPrompt(
  performanceMetrics: PerformanceMetrics,
  timePeriod: string,
): string {
  // Format period label in Italian with date range for context
  const periodLabel = formatTimePeriodLabel(timePeriod as TimePeriod, performanceMetrics);
  const dateRange = `(${format(performanceMetrics.startDate, 'dd/MM/yyyy', { locale: it })} - ${format(performanceMetrics.endDate, 'dd/MM/yyyy', { locale: it })})`;

  // Include current date to help Claude contextualize the analysis period
  const today = format(new Date(), 'dd/MM/yyyy', { locale: it });

  return `Oggi è il ${today}. Sei un esperto analista finanziario italiano.

Prima di rispondere, usa la web search per trovare i principali eventi di mercato nel periodo ${periodLabel} ${dateRange}: decisioni delle banche centrali, eventi geopolitici rilevanti, rally o correzioni di mercato significativi.

Poi analizza le seguenti metriche di performance del portafoglio per il periodo ${periodLabel} ${dateRange}:

**Metriche di Rendimento:**
- ROI Totale: ${formatMetric(performanceMetrics.roi)}
- CAGR: ${formatMetric(performanceMetrics.cagr)}
- Time-Weighted Return: ${formatMetric(performanceMetrics.timeWeightedReturn)}
- Money-Weighted Return (IRR): ${formatMetric(performanceMetrics.moneyWeightedReturn)}

**Metriche di Rischio:**
- Volatilità: ${formatMetric(performanceMetrics.volatility)}
- Sharpe Ratio: ${formatMetric(performanceMetrics.sharpeRatio)}
- Max Drawdown: ${formatMetric(performanceMetrics.maxDrawdown)} (${performanceMetrics.maxDrawdownDate || 'n/a'})
- Durata Drawdown: ${performanceMetrics.drawdownDuration || 'n/a'} mesi
- Recovery Time: ${performanceMetrics.recoveryTime || 'n/a'} mesi

**Metriche di Contesto:**
- Patrimonio Iniziale: ${formatCurrency(performanceMetrics.startNetWorth)}
- Patrimonio Finale: ${formatCurrency(performanceMetrics.endNetWorth)}
- Contributi Netti: ${formatCurrency(performanceMetrics.netCashFlow)}
- Durata: ${performanceMetrics.numberOfMonths} mesi

${performanceMetrics.yocGross !== null ? `**Metriche Dividendi:**
- YOC Lordo: ${formatMetric(performanceMetrics.yocGross)}
- YOC Netto: ${formatMetric(performanceMetrics.yocNet)}
- Current Yield Lordo: ${formatMetric(performanceMetrics.currentYield)}
- Current Yield Netto: ${formatMetric(performanceMetrics.currentYieldNet)}` : ''}

Fornisci un'analisi concisa e actionable (massimo 350 parole) che:
1. Interpreta le metriche chiave e cosa significano per questo portafoglio
2. Decomponi la variazione del patrimonio: quanta parte della crescita (o perdita) è organica (rendimenti) vs apporti di nuovo capitale. Se TWR e MWR divergono significativamente, spiega cosa implica sul timing dei contributi
3. Identifica gli eventi chiave dei mercati finanziari nel periodo analizzato (trovati con la web search) e spiega come potrebbero aver influenzato la performance del portafoglio
4. Evidenzia i punti di forza della performance
5. Identifica aree di miglioramento o rischi da considerare
6. Se appropriato, offri 1-2 suggerimenti concreti

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
