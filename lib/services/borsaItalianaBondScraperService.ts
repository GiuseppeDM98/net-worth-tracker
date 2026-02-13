/**
 * Borsa Italiana Bond Price Scraper
 *
 * Scrapes bond prices from borsaitaliana.it by ISIN.
 * Pattern: https://www.borsaitaliana.it/borsa/obbligazioni/mot/btp/scheda/{ISIN}-MOTX.html?lang=it
 *
 * Price Selection Strategy (fallback chain):
 * 1. Main price in <strong> tag (most visible on page, typically "Ultimo Contratto")
 * 2. "Ultimo Contratto" label in data section - last trade price
 * 3. "Prezzo ufficiale" (official price) - daily reference price
 * 4. "Apertura" (opening price) - session opening price
 *
 * Scope: Currently supports BTP and MOT bonds only.
 * Future: Can be extended for corporate bonds, EuroMOT with different URL patterns.
 *
 * Error Handling: Returns null price on failure (graceful degradation).
 */

import * as cheerio from 'cheerio';

// Base URL for MOT bonds - BTP pattern (valid for all MOT bonds per user confirmation)
const BORSA_ITALIANA_BOND_BASE_URL = 'https://www.borsaitaliana.it/borsa/obbligazioni/mot/btp/scheda';

export interface BondPriceResult {
  isin: string;
  price: number | null;
  currency: string;
  priceType: 'ultimo' | 'ufficiale' | 'apertura'; // Which price was successfully extracted
  lastUpdate?: Date;
  error?: string;
}

/**
 * Parse decimal number from Italian format (100,31 -> 100.31)
 * Reuses pattern from borsaItalianaScraperService.ts
 *
 * Italian number format:
 * - Period (.) as thousands separator: "1.234"
 * - Comma (,) as decimal separator: "0,31"
 */
function parseItalianNumber(numberString: string): number {
  const normalized = numberString
    .trim()
    .replace(/\./g, '')      // Remove thousands separator
    .replace(',', '.');       // Replace decimal comma with period
  return parseFloat(normalized);
}

/**
 * Scrape bond price by ISIN from Borsa Italiana
 *
 * URL Pattern: {BASE}/{ISIN}-MOTX.html?lang=it
 * Example: https://www.borsaitaliana.it/borsa/obbligazioni/mot/btp/scheda/IT0005672024-MOTX.html?lang=it
 *
 * @param isin - ISIN code (e.g., "IT0005672024")
 * @returns Bond price result with price and metadata, or null price on failure
 */
export async function getBondPriceByIsin(isin: string): Promise<BondPriceResult> {
  try {
    // Construct URL with -MOTX suffix (confirmed by user as constant for all MOT bonds)
    const url = `${BORSA_ITALIANA_BOND_BASE_URL}/${isin}-MOTX.html?lang=it`;
    console.log(`[Bond Scraper] Fetching: ${url}`);

    // Fetch HTML with timeout
    // Note: Borsa Italiana can be slow, using 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Bond Scraper] HTTP error! status: ${response.status}`);
      return {
        isin,
        price: null,
        currency: 'EUR',
        priceType: 'ultimo',
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    console.log(`[Bond Scraper] Received HTML, length: ${html.length} characters`);

    const $ = cheerio.load(html);

    // Fallback strategy: Try multiple price sources in order of preference
    let price: number | null = null;
    let priceType: 'ultimo' | 'ufficiale' | 'apertura' = 'ultimo';

    // Priority 1: Try main price with specific class (most visible price on page)
    // This is typically the "Ultimo Contratto" (last trade price)
    // Borsa Italiana uses: <strong class="t-text -black-warm-60 -formatPrice">104,28</strong>
    // Use attribute selector for classes with leading dash (more reliable in cheerio)
    let foundMainPrice = false;
    $('strong').each((_, element) => {
      const className = $(element).attr('class') || '';
      const text = $(element).text().trim();

      // Check if this strong has the formatPrice class and contains a valid price
      if (className.includes('formatPrice') && /^\d+[.,]\d+$/.test(text) && !foundMainPrice) {
        price = parseItalianNumber(text);
        priceType = 'ultimo';
        foundMainPrice = true;
        console.log(`[Bond Scraper] Found main price (formatPrice class): ${text} -> ${price}`);
        return false; // Break loop
      }
    });

    // Debug: log if main price element was not found
    if (!foundMainPrice) {
      console.log(`[Bond Scraper] Main price element not found, trying fallback strategies`);
    }

    // Priority 2: Try "Ultimo Contratto" (last trade) in data section
    if (!price || price <= 0) {
      $('dt, td').each((_, element) => {
        const label = $(element).text().trim().toLowerCase();
        if (label.includes('ultimo contratto') && !price) {
          const valueElement = $(element).next('dd, td');
          if (valueElement.length > 0) {
            const priceText = valueElement.text().trim();
            if (/^\d+[.,]\d+$/.test(priceText)) {
              price = parseItalianNumber(priceText);
              priceType = 'ultimo';
              console.log(`[Bond Scraper] Found "Ultimo Contratto": ${priceText} -> ${price}`);
              return false;
            }
          }
        }
      });
    }

    // Priority 3: Fallback to "Prezzo ufficiale" (official price)
    if (!price || price <= 0) {
      $('dt, td').each((_, element) => {
        const label = $(element).text().trim().toLowerCase();
        if ((label.includes('prezzo ufficiale') || label.includes('ufficiale')) && !price) {
          const valueElement = $(element).next('dd, td');
          if (valueElement.length > 0) {
            const priceText = valueElement.text().trim();
            if (/^\d+[.,]\d+$/.test(priceText)) {
              price = parseItalianNumber(priceText);
              priceType = 'ufficiale';
              console.log(`[Bond Scraper] Found "Prezzo ufficiale": ${priceText} -> ${price}`);
              return false;
            }
          }
        }
      });
    }

    // Priority 4: Last fallback to "Apertura" (opening price)
    if (!price || price <= 0) {
      $('dt, td').each((_, element) => {
        const label = $(element).text().trim().toLowerCase();
        if (label.includes('apertura') && !price) {
          const valueElement = $(element).next('dd, td');
          if (valueElement.length > 0) {
            const priceText = valueElement.text().trim();
            if (/^\d+[.,]\d+$/.test(priceText)) {
              price = parseItalianNumber(priceText);
              priceType = 'apertura';
              console.log(`[Bond Scraper] Found "Apertura": ${priceText} -> ${price}`);
              return false;
            }
          }
        }
      });
    }

    // Priority 5: Try table structure (generic fallback)
    if (!price || price <= 0) {
      $('table tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const label = $(cells[0]).text().trim().toLowerCase();

          // Try all price types in table format
          if (label.includes('ultimo contratto') || label.includes('ultimo') || label.includes('prezzo ufficiale') || label.includes('apertura')) {
            const priceText = $(cells[1]).text().trim();
            if (/^\d+[.,]\d+$/.test(priceText)) {
              price = parseItalianNumber(priceText);
              if (label.includes('ultimo')) priceType = 'ultimo';
              else if (label.includes('ufficiale')) priceType = 'ufficiale';
              else priceType = 'apertura';
              console.log(`[Bond Scraper] Found in table "${label}": ${priceText} -> ${price}`);
              return false;
            }
          }
        }
      });
    }

    if (!price || price <= 0) {
      console.warn(`[Bond Scraper] No valid price found for ISIN: ${isin}`);
      console.log(`[Bond Scraper] Page title: ${$('title').text()}`);
      return {
        isin,
        price: null,
        currency: 'EUR',
        priceType: 'ultimo',
        error: 'Price not found on page',
      };
    }

    console.log(`[Bond Scraper] Successfully scraped ${isin}: ${price} (${priceType})`);

    return {
      isin,
      price,
      currency: 'EUR', // MOT bonds are typically EUR
      priceType,
      lastUpdate: new Date(),
    };

  } catch (error) {
    console.error(`[Bond Scraper] Error fetching price for ISIN ${isin}:`, error);
    return {
      isin,
      price: null,
      currency: 'EUR',
      priceType: 'ultimo',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate ISIN format for Italian bonds
 * ISIN format: IT + 10 alphanumeric characters + 1 check digit
 *
 * Note: This is an additional validation layer. The main ISIN validation
 * is already handled by Zod schema in AssetDialog.tsx.
 */
export function validateItalianBondIsin(isin: string): boolean {
  // Basic ISIN validation (same pattern as AssetDialog Zod schema)
  const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

  if (!isinPattern.test(isin)) {
    return false;
  }

  // Italian bonds start with "IT"
  // Note: This is optional - can be relaxed in future if supporting non-IT MOT bonds
  return isin.startsWith('IT');
}
