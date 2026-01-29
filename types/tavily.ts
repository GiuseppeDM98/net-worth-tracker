/**
 * Tavily Search API Types
 *
 * TypeScript interfaces for Tavily API requests and responses.
 * Used for web search preprocessing in AI performance analysis.
 *
 * @see https://docs.tavily.com/
 */

/**
 * Single search result from Tavily API
 */
export interface TavilySearchResult {
  /** Article/page title */
  title: string;

  /** Source URL */
  url: string;

  /** Extracted content snippet */
  content: string;

  /** Relevance score (0-1) */
  score: number;

  /** Publication date (ISO string) */
  published_date?: string;

  /** Raw content (full text if available) */
  raw_content?: string;
}

/**
 * Response from Tavily Search API
 */
export interface TavilySearchResponse {
  /** Search query used */
  query: string;

  /** Array of search results */
  results: TavilySearchResult[];

  /** Response ID for debugging */
  response_time?: number;

  /** Follow-up questions (if enabled) */
  follow_up_questions?: string[];

  /** Answer summary (if enabled) */
  answer?: string;

  /** Images (if enabled) */
  images?: string[];
}

/**
 * Tavily API request options
 */
export interface TavilySearchOptions {
  /** Search depth: 'basic' (1 credit) or 'advanced' (2 credits) */
  search_depth?: 'basic' | 'advanced';

  /** Maximum number of results (default: 5) */
  max_results?: number;

  /** Include domains (whitelist) */
  include_domains?: string[];

  /** Exclude domains (blacklist) */
  exclude_domains?: string[];

  /** Include raw content in response */
  include_raw_content?: boolean;

  /** Include answer summary */
  include_answer?: boolean;

  /** Include images */
  include_images?: boolean;
}
