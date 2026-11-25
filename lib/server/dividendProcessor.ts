import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { scrapeDividendsByIsin } from '@/lib/services/borsaItalianaScraperService';
import {
  createDividend,
  deleteDividend,
  getDividendById,
  isDuplicateDividend,
  reconvertAtPaymentDay,
  updateDividend,
} from '@/lib/services/dividendService';
import { computeDividendTaxes } from '@/lib/utils/dividendFx';
import { createExpenseFromDividend } from '@/lib/services/dividendIncomeService';
import { getAssetTransactionsAdmin } from '@/lib/server/assetAdminRepository';
import { Dividend, DividendFormData } from '@/types/dividend';
import { ExpenseSubCategory } from '@/types/expenses';
import type { AssetTransaction } from '@/types/assetTransactions';
import { isDividendEligible } from '@/lib/utils/dividendEligibility';
import { canBeOwedSince, entitledQuantity, reconcileAnnouncedDividend } from '@/lib/utils/dividendEntitlement';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { Asset, BondDetails } from '@/types/assets';
import {
  getFollowingCouponDate,
  resolveCoupon,
  buildCouponNote,
} from '@/lib/utils/couponUtils';

/**
 * Lower-bound lookback (days) for the catch-up queries in Phases 2 and 3.
 *
 * Why 370: the cron runs daily, so a miss is normally one day old, but bonds can
 * pay annually. 370 days (just over a year) lets a single missed annual coupon
 * still be recovered, while bounding the Firestore range scan to roughly one year
 * of dividends instead of the whole history.
 */
export const COUPON_CATCHUP_LOOKBACK_DAYS = 370;

/**
 * Auto-generated dividend types whose cashflow expense and schedule are owned
 * exclusively by this cron (see commit 9aa1a50). Only these are eligible for
 * catch-up when their payment date already passed without being processed;
 * scraped equity dividends are intentionally NOT back-dated.
 */
const CATCHUP_DIVIDEND_TYPES = new Set(['coupon', 'finalPremium']);

/**
 * What a stored date field looks like by the time it reaches this module: a real
 * Timestamp from the Admin SDK, a `{ toDate }` stand-in from the fixtures, or an
 * already-converted Date / ISO string / epoch number.
 */
type StoredDateValue = Timestamp | { toDate(): Date } | Date | string | number;

/**
 * Normalizes a stored date to epoch milliseconds, so payment dates can be compared
 * regardless of the exact shape Firestore returns.
 */
function toMillis(value: StoredDateValue): number {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return new Date(value).getTime();
  }
  if ('toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  return value.toDate().getTime();
}

/**
 * The Admin SDK hands back a Timestamp where the domain type says Date, and the
 * fixtures hand back a Date; the coupon walk below needs a real Date either way.
 */
function toJsDate(value: Date | Timestamp): Date {
  return value instanceof Date ? value : value.toDate();
}

/** One user's trades by asset id; an asset with no trade reads `[]` (the rule then takes today's quantity). */
type LedgerByAsset = (assetId: string) => AssetTransaction[];

/**
 * The user's ledger, read ONCE per phase (2026-11-23): every quantity a dividend is created,
 * corrected or cashed on is the one held at its ex-date. Null when the read fails — the phase then
 * skips the user for the evening and counts an error, so nothing is written on a guessed quantity;
 * the scrape's 60-day window and the coupons' catch-up absorb the day.
 */
async function readLedgerByAsset(userId: string): Promise<LedgerByAsset | null> {
  let trades: AssetTransaction[];
  try {
    trades = await getAssetTransactionsAdmin(userId);
  } catch (error) {
    console.error(`Error reading the ledger of user ${userId}:`, error);
    return null;
  }
  const byAsset = new Map<string, AssetTransaction[]>();
  for (const trade of trades) byAsset.set(trade.assetId, [...(byAsset.get(trade.assetId) ?? []), trade]);
  return (assetId) => byAsset.get(assetId) ?? [];
}

export interface ScrapingResult {
  assetsScraped: number;
  newDividends: number;
  errors: number;
}

export interface ExpenseCreationResult {
  processedCount: number;
  errorCount: number;
  processedDividends: Array<{
    userId: string;
    dividendId: string;
    expenseId: string;
    amount: number;
    asset: string;
  }>;
  errors: Array<{ userId: string; dividendId?: string; error: string }>;
}

export interface CouponSchedulingResult {
  scheduled: number;
  skipped: number;
  errors: number;
}

/**
 * Phase 1: Scrape Borsa Italiana for recent dividends and create entries
 * for all users with equity assets that have an ISIN.
 *
 * Uses a 60-day lookback window to balance coverage vs. scraping load.
 * Non-blocking per-asset: errors for one asset never stop other assets.
 *
 * Each dividend is created on the quantity the ledger held the day before its ex-date (today's
 * when the ledger cannot say), and not at all when that was 0; an instrument sold out with no
 * trade in the window is not scraped (2026-11-23).
 */
export async function runDividendScraping(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  sixtyDaysAgo: Date
): Promise<ScrapingResult> {
  let assetsScraped = 0;
  let newDividends = 0;
  let errors = 0;

  for (const userDoc of users) {
    const userId = userDoc.id;

    try {
      const assetsSnapshot = await adminDb
        .collection('assets')
        .where('userId', '==', userId)
        .where('assetClass', '==', 'equity')
        .get();

      const assetsWithIsin = assetsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        } as Asset))
        .filter(asset => asset.isin && asset.isin.trim() !== '');

      if (assetsWithIsin.length === 0) continue;

      const tradesOf = await readLedgerByAsset(userId);
      if (!tradesOf) {
        errors++;
        continue;
      }

      console.log(`User ${userId}: Found ${assetsWithIsin.length} equity assets with ISIN`);

      for (const asset of assetsWithIsin) {
        // Sold out with no trade in the window: nothing can be owed, so Borsa Italiana is not asked.
        if (!canBeOwedSince(asset.quantity, tradesOf(asset.id), sixtyDaysAgo)) continue;
        try {
          console.log(`Scraping dividends for ${asset.ticker} (ISIN: ${asset.isin}, Type: ${asset.type})`);

          const scrapedDividends = await scrapeDividendsByIsin(asset.isin!, asset.type);
          if (scrapedDividends.length === 0) continue;

          // Two-part eligibility: 60-day recency AND on or after the asset's dividend floor
          // (the holding start when the ledger knows it, else the creation date — the ONE
          // rule in lib/utils/dividendEligibility.ts, shared with the scrape route).
          const relevantDividends = scrapedDividends.filter(div =>
            div.exDate >= sixtyDaysAgo && isDividendEligible(div.exDate, asset)
          );

          console.log(`Found ${scrapedDividends.length} total, ${relevantDividends.length} relevant dividends for ${asset.ticker}`);

          for (const scrapedDiv of relevantDividends) {
            try {
              const isDuplicate = await isDuplicateDividend(userId, asset.id, scrapedDiv.exDate);
              if (isDuplicate) continue;

              // What was held the day before the ex-date, not today's quantity; nothing held, no record.
              const quantity = entitledQuantity(asset.quantity, tradesOf(asset.id), scrapedDiv.exDate);
              if (quantity <= 0) continue;

              const grossAmount = scrapedDiv.dividendPerShare * quantity;
              // The instrument's own rate (owner, 2026-11-23), 26% when it declares none — the
              // capital-income withholding of Legislative Decree 461/1997, Art. 27. A scrape knows
              // nothing of a foreign withholding: none is recorded.
              const { taxAmount, netAmount } = computeDividendTaxes(grossAmount, 0, asset.taxRate ?? 26);

              const dividendData: DividendFormData = {
                assetId: asset.id,
                exDate: scrapedDiv.exDate,
                paymentDate: scrapedDiv.paymentDate,
                dividendPerShare: scrapedDiv.dividendPerShare,
                quantity,
                grossAmount,
                taxAmount,
                netAmount,
                currency: scrapedDiv.currency,
                dividendType: scrapedDiv.dividendType,
                isAutoGenerated: true,
                costPerShare: asset.averageCost,
              };

              await createDividend(userId, dividendData, asset.ticker, asset.name, asset.isin!, true);
              newDividends++;
              console.log(`Created dividend: ${asset.ticker} - ${scrapedDiv.dividendPerShare} ${scrapedDiv.currency} on ${scrapedDiv.exDate.toLocaleDateString('it-IT')}`);
            } catch (dividendError) {
              console.error(`Error creating dividend for ${asset.ticker}:`, dividendError);
            }
          }

          assetsScraped++;
        } catch (assetError) {
          console.error(`Error scraping dividends for asset ${asset.ticker}:`, assetError);
          errors++;
        }
      }
    } catch (userError) {
      console.error(`Error processing user ${userId} for dividend scraping:`, userError);
      errors++;
    }
  }

  return { assetsScraped, newDividends, errors };
}

/**
 * Phase 2: For each user, create cashflow expense entries for dividends that are
 * due and not yet processed.
 *
 * A dividend is processed when it has no linked expense (idempotency) AND either:
 *   - its paymentDate falls within today's Italian-day window, OR
 *   - it is an auto-generated coupon/finalPremium whose paymentDate already passed
 *     (catch-up): these are owned solely by the cron, so a previously missed run
 *     must still produce the expense instead of losing it forever.
 * Scraped equity/manual dividends with a past paymentDate are intentionally NOT
 * back-dated, to avoid surprising retroactive cashflow entries.
 *
 * Requires dividendIncomeCategoryId to be configured in user settings.
 *
 * Before an automatic record is cashed it is re-read against the ledger (2026-11-23): one left at a
 * stale quantity is corrected first, one not held at its ex-date is deleted with no income.
 */
export async function runExpenseCreation(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  todayStart: Timestamp,
  todayEnd: Timestamp,
  lookbackStart: Timestamp
): Promise<ExpenseCreationResult> {
  let processedCount = 0;
  let errorCount = 0;
  const processedDividends: ExpenseCreationResult['processedDividends'] = [];
  const errors: ExpenseCreationResult['errors'] = [];

  for (const userDoc of users) {
    const userId = userDoc.id;

    try {
      const settingsDoc = await adminDb
        .collection('assetAllocationTargets')
        .doc(userId)
        .get();

      if (!settingsDoc.exists) {
        console.log(`No settings found for user ${userId}, skipping`);
        continue;
      }

      const settings = settingsDoc.data();
      const dividendIncomeCategoryId = settings?.dividendIncomeCategoryId;

      if (!dividendIncomeCategoryId) {
        console.log(`No dividend income category configured for user ${userId}, skipping`);
        continue;
      }

      const categoryDoc = await adminDb
        .collection('expenseCategories')
        .doc(dividendIncomeCategoryId)
        .get();

      if (!categoryDoc.exists) {
        console.log(`Category ${dividendIncomeCategoryId} not found for user ${userId}, skipping`);
        continue;
      }

      const category = categoryDoc.data();
      const categoryName = category?.name || 'Dividendi';

      let subCategoryName: string | undefined;
      if (settings?.dividendIncomeSubCategoryId) {
        const subCategory = (category?.subCategories ?? []).find(
          (sub: ExpenseSubCategory) => sub.id === settings.dividendIncomeSubCategoryId
        );
        if (subCategory) subCategoryName = subCategory.name;
      }

      // Range covers the catch-up lookback up to end-of-today; per-dividend
      // eligibility is decided below so past equity dividends are excluded.
      const dividendsSnapshot = await adminDb
        .collection('dividends')
        .where('userId', '==', userId)
        .where('paymentDate', '>=', lookbackStart)
        .where('paymentDate', '<=', todayEnd)
        .get();

      if (dividendsSnapshot.empty) {
        console.log(`No dividends due for user ${userId}`);
        continue;
      }

      const tradesOf = await readLedgerByAsset(userId);
      if (!tradesOf) {
        errorCount++;
        errors.push({ userId, error: 'Failed to read the ledger' });
        continue;
      }

      console.log(`Found ${dividendsSnapshot.size} candidate dividends for user ${userId}`);

      for (const dividendDoc of dividendsSnapshot.docs) {
        const dividend = dividendDoc.data();
        const dividendId = dividendDoc.id;

        // Idempotency: skip if expense already created (covers cron retries and manual creation)
        if (dividend.expenseId) {
          continue;
        }

        // Eligibility: due today, or an auto-generated coupon/premium being recovered.
        // Compare in milliseconds so both real Firestore Timestamps and normalized
        // dates behave consistently; the query already bounds the upper edge.
        const paymentMs = toMillis(dividend.paymentDate);
        const isDueToday = paymentMs >= todayStart.toMillis() && paymentMs <= todayEnd.toMillis();
        const isCatchupCoupon =
          dividend.isAutoGenerated === true &&
          CATCHUP_DIVIDEND_TYPES.has(dividend.dividendType);
        if (!isDueToday && !isCatchupCoupon) {
          continue;
        }

        try {
          // Normalize Firestore Timestamps to Date for dividendIncomeService
          const storedDividend = {
            id: dividendId,
            userId,
            assetId: dividend.assetId,
            assetTicker: dividend.assetTicker,
            assetName: dividend.assetName,
            isin: dividend.isin,
            exDate: dividend.exDate?.toDate(),
            paymentDate: dividend.paymentDate?.toDate(),
            dividendPerShare: dividend.dividendPerShare,
            quantity: dividend.quantity,
            grossAmount: dividend.grossAmount,
            taxAmount: dividend.taxAmount,
            netAmount: dividend.netAmount,
            currency: dividend.currency,
            dividendType: dividend.dividendType,
            grossAmountEur: dividend.grossAmountEur,
            taxAmountEur: dividend.taxAmountEur,
            netAmountEur: dividend.netAmountEur,
            exchangeRate: dividend.exchangeRate,
            foreignTaxAmount: dividend.foreignTaxAmount,
            foreignTaxAmountEur: dividend.foreignTaxAmountEur,
            settledNetEur: dividend.settledNetEur,
            fxSource: dividend.fxSource,
            notes: dividend.notes,
            isAutoGenerated: dividend.isAutoGenerated,
            createdAt: dividend.createdAt?.toDate(),
            updatedAt: dividend.updatedAt?.toDate(),
          };
          let dividendData: Dividend = storedDividend;

          // The net under a failed or late reconciliation: an automatic record is cashed on what
          // was held at its ex-date. As of its OWN payment day — this pass is cashing it now, a
          // recovered coupon included, so «still to be paid» never excludes it.
          if (dividendData.isAutoGenerated) {
            const verdict = reconcileAnnouncedDividend(
              dividendData, tradesOf(dividendData.assetId), getItalyDateIso(dividendData.paymentDate)
            );
            if (verdict.kind === 'delete') {
              await deleteDividend(dividendId);
              console.log(`Deleted dividend ${dividendId} (${dividend.assetTicker}): not held at its ex-date`);
              continue;
            }
            if (verdict.kind === 'update') {
              const { quantity, grossAmount, taxAmount, netAmount, foreignTaxAmount } = verdict;
              await updateDividend(dividendId, { quantity, grossAmount, taxAmount, netAmount, foreignTaxAmount, currency: dividendData.currency });
              // Read back: a foreign record's income reads netAmountEur, which the update recomputed.
              const reread = await getDividendById(dividendId);
              if (!reread) throw new Error(`Dividend ${dividendId} vanished after its reconciliation`);
              dividendData = reread;
            }
          }

          // A foreign record converted at another day's rate (announced ahead, or saved before
          // 2026-11-23) is converted again at its payment day's before its income is built.
          dividendData = await reconvertAtPaymentDay(dividendData);

          const expenseId = await createExpenseFromDividend(
            dividendData,
            dividendIncomeCategoryId,
            categoryName,
            settings?.dividendIncomeSubCategoryId,
            subCategoryName
          );

          processedCount++;
          processedDividends.push({
            userId,
            dividendId,
            expenseId,
            amount: dividendData.netAmountEur ?? dividendData.netAmount,
            asset: dividend.assetTicker,
          });

          console.log(`Created expense ${expenseId} for dividend ${dividendId} (${dividend.assetTicker})`);
        } catch (dividendError) {
          console.error(`Error processing dividend ${dividendId}:`, dividendError);
          errorCount++;
          errors.push({ userId, dividendId, error: (dividendError as Error).message });
        }
      }
    } catch (userError) {
      console.error(`Error processing user ${userId}:`, userError);
      errorCount++;
      errors.push({ userId, error: (userError as Error).message });
    }
  }

  return { processedCount, errorCount, processedDividends, errors };
}

/**
 * Phase 3: Keep the coupon chain advanced so that each bond always has exactly
 * one upcoming (future-dated) coupon stored.
 *
 * Design: only one coupon per bond is materialized at a time; when it is paid,
 * the next one must be created. Rather than reacting only to coupons paid exactly
 * today, this walks forward from the most recent paid coupon and generates every
 * missing coupon up to the first future one. This self-heals a chain that was
 * interrupted by a missed run (cron downtime, timezone drift) — without it, a
 * single skipped coupon would stop all future coupons for that bond permanently.
 *
 * Idempotent: isDuplicateDividend (plus deterministic IDs in createDividend)
 * prevents double-creation across runs and retries.
 *
 * Each coupon is created on the units entitled at its value date (2026-11-23), never at 0.
 */
export async function runNextCouponScheduling(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  todayStart: Timestamp,
  todayEnd: Timestamp,
  lookbackStart: Timestamp
): Promise<CouponSchedulingResult> {
  let scheduled = 0;
  let skipped = 0;
  let errors = 0;
  const todayEndMs = todayEnd.toMillis();

  for (const userDoc of users) {
    const userId = userDoc.id;

    try {
      // Include coupons due within the catch-up window, not just today's, so a
      // previously missed coupon still triggers regeneration of its successor.
      const couponSnapshot = await adminDb
        .collection('dividends')
        .where('userId', '==', userId)
        .where('dividendType', '==', 'coupon')
        .where('isAutoGenerated', '==', true)
        .where('paymentDate', '>=', lookbackStart)
        .where('paymentDate', '<=', todayEnd)
        .get();

      if (couponSnapshot.empty) continue;

      const tradesOf = await readLedgerByAsset(userId);
      if (!tradesOf) {
        errors++;
        continue;
      }

      // Process each bond once, from its most recent paid coupon: the heal loop
      // below advances the whole chain, so older coupons of the same bond would
      // only do redundant duplicate checks.
      const latestCouponByAsset = new Map<string, FirebaseFirestore.DocumentData>();
      for (const couponDoc of couponSnapshot.docs) {
        const coupon = couponDoc.data();
        const existing = latestCouponByAsset.get(coupon.assetId);
        if (!existing || toMillis(coupon.paymentDate) > toMillis(existing.paymentDate)) {
          latestCouponByAsset.set(coupon.assetId, coupon);
        }
      }

      console.log(`User ${userId}: Found ${latestCouponByAsset.size} bonds with coupons due to advance`);

      for (const coupon of latestCouponByAsset.values()) {
        try {
          const assetDoc = await adminDb.collection('assets').doc(coupon.assetId).get();

          if (!assetDoc.exists) {
            console.log(`Asset ${coupon.assetId} not found, skipping next-coupon generation`);
            skipped++;
            continue;
          }

          const asset = assetDoc.data() as Asset & { bondDetails?: BondDetails };

          if (!asset.bondDetails) {
            skipped++;
            continue;
          }

          const bd = asset.bondDetails;
          const maturityDate = toJsDate(bd.maturityDate);
          const nominalValue = bd.nominalValue ?? 1;
          // Use asset taxRate if set (e.g. 12.5% for BTPs), otherwise default 26%
          const taxRate = asset.taxRate && asset.taxRate > 0 ? asset.taxRate : 26;

          // Walk forward one period at a time from the paid coupon, creating any
          // missing coupon until we land on (or confirm) the first future one.
          let fromDate = toJsDate(coupon.paymentDate);
          let createdForBond = 0;

          while (true) {
            const nextDate = getFollowingCouponDate(fromDate, bd.couponFrequency, maturityDate);
            if (!nextDate) {
              console.log(`Bond ${coupon.assetTicker} has matured, no further coupon`);
              break;
            }

            const isDuplicate = await isDuplicateDividend(userId, coupon.assetId, nextDate);
            if (isDuplicate) {
              // Already in the chain. If it is the upcoming future coupon the chain
              // is healed; otherwise advance past this gap-filling coupon.
              if (nextDate.getTime() > todayEndMs) break;
              fromDate = nextDate;
              continue;
            }

            // The units entitled on the coupon's value date. None (sold before it): no coupon, and the
            // walk steps over it as over a duplicate — past a date at 0 to the first future one,
            // so a bond sold before one coupon and bought back after it is scheduled again tonight.
            const quantity = entitledQuantity(asset.quantity, tradesOf(coupon.assetId), nextDate, 'settlement');
            if (quantity <= 0) {
              if (nextDate.getTime() > todayEndMs) break;
              fromDate = nextDate;
              continue;
            }

            // Resolve via the shared pure layer so the cron matches the client scheduler.
            // For inflation-linked bonds whose FOI rate for nextDate is not yet announced,
            // this yields a PROVISIONAL coupon at the guaranteed fixed floor.
            const resolved = resolveCoupon(nextDate, bd, nominalValue);
            const gross = resolved.perShare * quantity;
            const tax = gross * (taxRate / 100);

            const couponData: DividendFormData = {
              assetId: coupon.assetId,
              exDate: nextDate,
              paymentDate: nextDate,
              dividendPerShare: resolved.perShare,
              quantity,
              grossAmount: gross,
              taxAmount: tax,
              netAmount: gross - tax,
              currency: coupon.currency,
              dividendType: 'coupon',
              isAutoGenerated: true,
              isProvisional: resolved.isProvisional,
              notes: buildCouponNote(resolved, bd.couponFrequency),
              costPerShare: asset.averageCost,
            };

            await createDividend(userId, couponData, coupon.assetTicker, coupon.assetName, asset.isin, true);
            scheduled++;
            createdForBond++;
            console.log(`Scheduled coupon for ${coupon.assetTicker} on ${nextDate.toLocaleDateString('it-IT')}`);

            // Stop once the upcoming (future-dated) coupon exists.
            if (nextDate.getTime() > todayEndMs) break;
            fromDate = nextDate;
          }

          if (createdForBond === 0) skipped++;
        } catch (couponError) {
          console.error(`Error scheduling next coupon for asset ${coupon.assetId}:`, couponError);
          errors++;
        }
      }
    } catch (userError) {
      console.error(`Error in Phase 3 for user ${userId}:`, userError);
      errors++;
    }
  }

  return { scheduled, skipped, errors };
}
