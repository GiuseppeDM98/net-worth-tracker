import * as cheerio from 'cheerio';
import { ScrapedDividend, DividendType } from '@/types/dividend';

const BORSA_ITALIANA_BASE_URL = 'https://www.borsaitaliana.it/borsa/quotazioni/azioni/elenco-completo-dividendi.html';

/**
 * Parse Italian date format (DD/MM/YY or DD/MM/YYYY) to Date object
 */
function parseItalianDate(dateString: string): Date {
  const parts = dateString.trim().split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateString}`);
  }

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed in JavaScript
  let year = parseInt(parts[2], 10);

  // Handle 2-digit year (YY format)
  if (year < 100) {
    // Assume 20XX for years 00-99
    year += 2000;
  }

  return new Date(year, month, day);
}

/**
 * Parse dividend type from Italian text
 */
function parseDividendType(typeText: string): DividendType {
  const normalizedType = typeText.toLowerCase().trim();

  if (normalizedType.includes('ordinario') || normalizedType.includes('ordinary')) {
    return 'ordinary';
  } else if (normalizedType.includes('straordinario') || normalizedType.includes('extraordinary')) {
    return 'extraordinary';
  } else if (normalizedType.includes('acconto') || normalizedType.includes('interim')) {
    return 'interim';
  } else if (normalizedType.includes('saldo') || normalizedType.includes('final')) {
    return 'final';
  }

  // Default to ordinary if type is unclear
  return 'ordinary';
}

/**
 * Parse decimal number from Italian format (1.234,56 -> 1234.56)
 */
function parseItalianNumber(numberString: string): number {
  // Remove thousands separators (.) and replace decimal comma (,) with period (.)
  const normalized = numberString
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');

  return parseFloat(normalized);
}

/**
 * Scrape dividends by ISIN from Borsa Italiana website
 * Returns array of scraped dividend data
 */
export async function scrapeDividendsByIsin(isin: string): Promise<ScrapedDividend[]> {
  try {
    // Construct URL with ISIN parameter
    const url = `${BORSA_ITALIANA_BASE_URL}?isin=${isin}&lang=it`;
    console.log(`[Scraper] Fetching URL: ${url}`);

    // Fetch HTML
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    console.log(`[Scraper] Received HTML, length: ${html.length} characters`);

    // Parse HTML with cheerio
    const $ = cheerio.load(html);

    // Debug: Try multiple selectors to find the table
    console.log(`[Scraper] Looking for dividend table...`);
    const tableRows1 = $('table.m-table tbody tr');
    const tableRows2 = $('table tbody tr');
    const allTables = $('table');

    console.log(`[Scraper] Found with 'table.m-table tbody tr': ${tableRows1.length} rows`);
    console.log(`[Scraper] Found with 'table tbody tr': ${tableRows2.length} rows`);
    console.log(`[Scraper] Total tables in page: ${allTables.length}`);

    // Use the selector that finds rows
    const tableRows = tableRows1.length > 0 ? tableRows1 : tableRows2;

    if (tableRows.length === 0) {
      console.log(`[Scraper] No dividend data found for ISIN: ${isin}`);
      console.log(`[Scraper] Page title: ${$('title').text()}`);

      // Log first 1000 chars of body for debugging
      const bodyText = $('body').text().substring(0, 1000) || 'No body content';
      console.log(`[Scraper] Page content preview: ${bodyText}`);

      return [];
    }

    console.log(`[Scraper] Processing ${tableRows.length} table rows...`);

    const dividends: ScrapedDividend[] = [];

    tableRows.each((i, row) => {
      try {
        const cells = $(row).find('td');

        if (cells.length < 7) {
          // Skip rows that don't have enough data
          return;
        }

        // Extract data from table cells based on Borsa Italiana structure:
        // Cell 0: Azioni (stock type - ignored)
        // Cell 1: Div. Cda (proposed dividend - ignored)
        // Cell 2: Div. Ass. (final dividend per share - THIS IS WHAT WE NEED)
        // Cell 3: Divisa (currency)
        // Cell 4: Stacco (ex-date in DD/MM/YY format)
        // Cell 5: Pagamento (payment date in DD/MM/YY format)
        // Cell 6: Tipo Dividendo (dividend type)

        const dividendPerShareText = $(cells[2]).text().trim() || '';
        const currencyText = $(cells[3]).text().trim() || '';
        const exDateText = $(cells[4]).text().trim() || '';
        const paymentDateText = $(cells[5]).text().trim() || '';
        const typeText = $(cells[6]).text().trim() || '';

        // Parse dates (DD/MM/YY format)
        const exDate = parseItalianDate(exDateText);
        const paymentDate = parseItalianDate(paymentDateText);

        // Parse dividend per share
        const dividendPerShare = parseItalianNumber(dividendPerShareText);

        // Parse type (convert "EURO" to "EUR")
        const currency = currencyText.toUpperCase() === 'EURO' ? 'EUR' : currencyText;
        const dividendType = parseDividendType(typeText);

        // Validate parsed data
        if (
          isNaN(exDate.getTime()) ||
          isNaN(paymentDate.getTime()) ||
          isNaN(dividendPerShare) ||
          dividendPerShare <= 0
        ) {
          console.warn(`Invalid dividend data in row, skipping:`, {
            exDateText,
            paymentDateText,
            dividendPerShareText,
          });
          return;
        }

        dividends.push({
          exDate,
          paymentDate,
          dividendPerShare,
          currency,
          dividendType,
        });
      } catch (rowError) {
        console.warn('Error parsing dividend row:', rowError);
        // Continue processing other rows
      }
    });

    console.log(`Successfully scraped ${dividends.length} dividends for ISIN: ${isin}`);
    return dividends;
  } catch (error) {
    console.error(`Error scraping dividends for ISIN ${isin}:`, error);
    // Return empty array on failure (as per requirements)
    return [];
  }
}

/**
 * Calculate withholding tax amount
 * Default Italian withholding tax rate: 26%
 */
export function calculateWithholdingTax(
  grossAmount: number,
  taxRate: number = 26
): number {
  return grossAmount * (taxRate / 100);
}

/**
 * Calculate net dividend after tax
 */
export function calculateNetDividend(
  grossAmount: number,
  taxRate: number = 26
): number {
  const tax = calculateWithholdingTax(grossAmount, taxRate);
  return grossAmount - tax;
}
