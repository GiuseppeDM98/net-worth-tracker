import * as cheerio from 'cheerio';
import { ScrapedDividend, DividendType } from '@/types/dividend';

const BORSA_ITALIANA_BASE_URL = 'https://www.borsaitaliana.it/borsa/quotazioni/azioni/elenco-completo-dividendi.html';

/**
 * Check if a string looks like a date in DD/MM/YY or DD/MM/YYYY format
 */
function isDateFormat(str: string): boolean {
  const trimmed = str.trim();
  // Match DD/MM/YY or DD/MM/YYYY
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed);
}

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

        // Debug: Log cell contents for first row to understand structure
        if (i === 0) {
          console.log(`[Scraper] First row cell count: ${cells.length}`);
          cells.each((cellIndex, cell) => {
            const cellText = $(cell).text().trim();
            console.log(`[Scraper] Cell ${cellIndex}: "${cellText}"`);
          });
        }

        if (cells.length < 5) {
          // Skip rows that don't have enough data (need at least: amount, currency, 2 dates, type)
          return;
        }

        // Extract all cell texts
        const cellTexts = cells.map((_, cell) => $(cell).text().trim()).get();

        // Find date cells by pattern matching
        let exDateText = '';
        let paymentDateText = '';
        let exDateIndex = -1;
        let paymentDateIndex = -1;

        cellTexts.forEach((text, index) => {
          if (isDateFormat(text)) {
            if (exDateIndex === -1) {
              exDateText = text;
              exDateIndex = index;
            } else if (paymentDateIndex === -1) {
              paymentDateText = text;
              paymentDateIndex = index;
            }
          }
        });

        // Validate we found both dates
        if (!exDateText || !paymentDateText) {
          console.warn(`[Scraper] Row ${i}: Could not find both dates, skipping`, cellTexts);
          return;
        }

        // Find dividend amount (look for decimal number with comma)
        let dividendPerShareText = '';
        for (const text of cellTexts) {
          if (/^\d+[.,]\d+$/.test(text) || /^\d+$/.test(text)) {
            // This looks like a number
            const num = parseItalianNumber(text);
            if (num > 0 && num < 1000) { // Reasonable dividend range
              dividendPerShareText = text;
              break;
            }
          }
        }

        if (!dividendPerShareText) {
          console.warn(`[Scraper] Row ${i}: Could not find dividend amount, skipping`, cellTexts);
          return;
        }

        // Find currency (usually "EUR", "USD", "EURO", "DOLLARO USA", etc.)
        let currencyText = 'EUR'; // Default
        for (const text of cellTexts) {
          const upper = text.toUpperCase();
          if (upper === 'EUR' || upper === 'EURO') {
            currencyText = 'EUR';
            break;
          } else if (upper === 'USD' || upper.includes('DOLLAR')) {
            currencyText = 'USD';
            break;
          } else if (upper === 'GBP' || upper.includes('STERL')) {
            currencyText = 'GBP';
            break;
          } else if (upper === 'CHF' || upper.includes('FRANC')) {
            currencyText = 'CHF';
            break;
          }
        }

        // Find dividend type (last text cell usually)
        let typeText = 'ordinario';
        const lastCell = cellTexts[cellTexts.length - 1];
        if (lastCell && lastCell.length > 0 && !/^\d/.test(lastCell) && !isDateFormat(lastCell)) {
          typeText = lastCell;
        }

        // Parse dates
        const exDate = parseItalianDate(exDateText);
        const paymentDate = parseItalianDate(paymentDateText);

        // Parse dividend per share
        const dividendPerShare = parseItalianNumber(dividendPerShareText);

        // Parse currency and type
        const currency = currencyText.toUpperCase() === 'EURO' ? 'EUR' : currencyText.toUpperCase();
        const dividendType = parseDividendType(typeText);

        // Validate parsed data
        if (
          isNaN(exDate.getTime()) ||
          isNaN(paymentDate.getTime()) ||
          isNaN(dividendPerShare) ||
          dividendPerShare <= 0
        ) {
          console.warn(`[Scraper] Row ${i}: Invalid parsed data, skipping:`, {
            exDate,
            paymentDate,
            dividendPerShare,
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

        // Log successful parse
        if (i < 3) {
          console.log(`[Scraper] Row ${i} parsed:`, {
            exDate: exDateText,
            paymentDate: paymentDateText,
            dividendPerShare: dividendPerShareText,
            currency,
            type: dividendType,
          });
        }
      } catch (rowError) {
        console.warn(`[Scraper] Error parsing row ${i}:`, rowError);
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
