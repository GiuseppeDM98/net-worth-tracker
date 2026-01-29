/**
 * Tavily Search Service
 *
 * Provides web search for financial market events using Tavily API.
 * Used in AI performance analysis to enrich Claude's context with recent market news.
 *
 * Architecture:
 * - Preprocessing pattern: Search executed BEFORE calling Anthropic Claude
 * - Results formatted as concise markdown for prompt inclusion
 * - Graceful degradation: Returns empty array on error (AI continues without context)
 *
 * API Pricing:
 * - Free tier: 1,000 searches/month
 * - Basic search: 1 credit, Advanced: 2 credits
 * - Advanced recommended for better relevance (financial news filtering)
 *
 * @see https://docs.tavily.com/
 */

import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type {
  TavilySearchResult,
  TavilySearchResponse,
  TavilySearchOptions,
} from '@/types/tavily';

const TAVILY_API_BASE = 'https://api.tavily.com/search';

/**
 * Search for financial market events in a specific time period
 *
 * Multi-query strategy:
 * - Executes 3 parallel queries for different event categories
 * - Category 1: Central banks & monetary policy
 * - Category 2: Geopolitical events (tariffs, trade wars, elections)
 * - Category 3: Market events (crashes, rallies, volatility)
 * - Takes top 2 results per category (6 total) for balanced coverage
 * - Deduplicates by URL to avoid repeating same news
 *
 * Cost: 3 queries × 2 credits (advanced) = 6 credits per analysis
 * Latency: ~500ms (parallel execution)
 *
 * @param startDate - Start of analysis period
 * @param endDate - End of analysis period
 * @returns Array of search results (empty on error - graceful degradation)
 */
export async function searchFinancialNews(
  startDate: Date,
  endDate: Date
): Promise<TavilySearchResult[]> {
  // Verify API key is configured
  if (!process.env.TAVILY_API_KEY) {
    console.error('[TavilySearchService] TAVILY_API_KEY not configured in environment');
    return []; // Graceful degradation - continue without web search
  }

  try {
    console.log(
      `[TavilySearchService] Multi-query search for period ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`
    );

    // Build 3 categorized queries
    const queries = buildCategorizedQueries(startDate, endDate);

    // Execute all 3 queries in parallel for performance
    const searchPromises = queries.map((query) =>
      executeSearch(query.query, query.category)
    );

    const results = await Promise.allSettled(searchPromises);

    // Collect successful results and merge
    const allResults: TavilySearchResult[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const categoryResults = result.value;
        console.log(
          `[TavilySearchService] Category "${queries[index].category}": ${categoryResults.length} results`
        );
        // Take top 2 results per category
        allResults.push(...categoryResults.slice(0, 2));
      } else {
        console.warn(
          `[TavilySearchService] Category "${queries[index].category}" failed:`,
          result.reason
        );
      }
    });

    // Deduplicate by URL (in case same article appears in multiple categories)
    const uniqueResults = deduplicateByUrl(allResults);

    console.log(
      `[TavilySearchService] Total unique results: ${uniqueResults.length} (from ${allResults.length} before dedup)`
    );

    return uniqueResults;
  } catch (error) {
    // Graceful degradation: Log error but don't throw
    // AI analysis will continue without market context rather than failing completely
    // A stale knowledge cutoff (Jan 2025) is acceptable fallback vs blocking entire feature
    console.warn(
      '[TavilySearchService] Search failed, continuing without market context:',
      error
    );
    return [];
  }
}

/**
 * Execute a single Tavily search query
 *
 * @param query - Search query string
 * @param category - Category label for logging
 * @returns Array of search results
 */
async function executeSearch(
  query: string,
  category: string
): Promise<TavilySearchResult[]> {
  console.log(`[TavilySearchService] Searching ${category}: "${query}"`);

  const options: TavilySearchOptions = {
    search_depth: 'advanced', // 2 credits - better relevance
    max_results: 3, // Top 3 per category (we'll use top 2, but 3 for safety)
    include_domains: [
      'wsj.com',
      'ft.com',
      'bloomberg.com',
      'reuters.com',
      'cnbc.com',
      'marketwatch.com',
    ],
    include_raw_content: false,
    include_answer: false,
    include_images: false,
  };

  const response = await fetch(TAVILY_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Tavily API error for ${category}: ${response.status} ${response.statusText}`
    );
  }

  const data: TavilySearchResponse = await response.json();

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error(`Invalid Tavily API response for ${category}`);
  }

  return data.results;
}

/**
 * Build categorized search queries for comprehensive event coverage
 *
 * Strategy: 3 parallel queries targeting different event types
 * - Category 1: Central banks & monetary policy (Fed, ECB, rate decisions)
 * - Category 2: Geopolitical events (tariffs, trade wars, elections, policy shocks)
 * - Category 3: Market events (crashes, rallies, volatility spikes, selloffs)
 *
 * Benefits:
 * - Balanced coverage across all major event types
 * - Captures Liberation Day (geopolitical), Fed meetings (monetary), market crashes (volatility)
 * - No single category dominates results
 *
 * @param startDate - Period start
 * @param endDate - Period end
 * @returns Array of categorized queries
 */
function buildCategorizedQueries(
  startDate: Date,
  endDate: Date
): Array<{ query: string; category: string }> {
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  // Build time period string
  let timePeriod: string;
  if (startYear !== endYear) {
    timePeriod = `${startYear} ${endYear}`;
  } else {
    const startMonth = format(startDate, 'MMMM', { locale: it });
    const endMonth = format(endDate, 'MMMM', { locale: it });
    timePeriod = `${startYear} ${startMonth} ${endMonth}`;
  }

  return [
    {
      category: 'Central Banks & Monetary Policy',
      query: `central bank ${timePeriod} Fed ECB interest rates monetary policy rate decision meeting inflation`,
    },
    {
      category: 'Geopolitical Events',
      query: `geopolitical ${timePeriod} tariffs trade war Trump sanctions election policy liberation day`,
    },
    {
      category: 'Market Events',
      query: `stock market ${timePeriod} crash rally selloff volatility spike turmoil correction bear market`,
    },
  ];
}

/**
 * Deduplicate search results by URL
 *
 * Prevents showing same article multiple times if it appears in
 * multiple category results (e.g., "Fed rate cut triggers market rally"
 * could appear in both monetary policy AND market events).
 *
 * @param results - Array of search results (potentially with duplicates)
 * @returns Array of unique results (first occurrence kept)
 */
function deduplicateByUrl(
  results: TavilySearchResult[]
): TavilySearchResult[] {
  const seen = new Set<string>();
  const unique: TavilySearchResult[] = [];

  for (const result of results) {
    if (!seen.has(result.url)) {
      seen.add(result.url);
      unique.push(result);
    }
  }

  return unique;
}

/**
 * Format search results for inclusion in Claude prompt
 *
 * Format: Compact markdown list with source, title, and date
 * Example: - [WSJ] "Stock market rally continues amid Fed signals" (12/02/2025)
 *
 * Keeps prompt concise while providing key context for AI analysis.
 *
 * @param results - Tavily search results
 * @returns Formatted markdown string for prompt inclusion
 */
export function formatSearchResultsForPrompt(
  results: TavilySearchResult[]
): string {
  if (!results || results.length === 0) {
    return '';
  }

  // Format each result as compact markdown line
  const formattedResults = results
    .slice(0, 5) // Ensure max 5 results (defense in depth)
    .map((result) => {
      const source = extractSourceName(result.url);
      const date = result.published_date
        ? formatDate(result.published_date)
        : 'n/a';
      return `- [${source}] "${result.title}" (${date})`;
    })
    .join('\n');

  return formattedResults;
}

/**
 * Extract source name from URL for display
 * Examples: "wsj.com" → "WSJ", "bloomberg.com" → "Bloomberg"
 *
 * @param url - Full URL
 * @returns Source name for display
 */
function extractSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');

    // Map common financial sources to display names
    const sourceMap: Record<string, string> = {
      'wsj.com': 'WSJ',
      'ft.com': 'FT',
      'bloomberg.com': 'Bloomberg',
      'reuters.com': 'Reuters',
      'cnbc.com': 'CNBC',
      'marketwatch.com': 'MarketWatch',
    };

    return sourceMap[hostname] || hostname;
  } catch {
    return 'Source';
  }
}

/**
 * Format ISO date string to Italian format (DD/MM/YYYY)
 *
 * @param isoDate - ISO date string from Tavily API
 * @returns Formatted date string
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return format(date, 'dd/MM/yyyy', { locale: it });
  } catch {
    return 'n/a';
  }
}
