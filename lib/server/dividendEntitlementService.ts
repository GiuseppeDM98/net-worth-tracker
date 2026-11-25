import 'server-only';
import { getAssetTransactionsForAssetAdmin } from '@/lib/server/assetAdminRepository';
import { deleteDividend, getDividendsByAsset, updateDividend } from '@/lib/services/dividendService';
import { reconcileAnnouncedDividend, type AnnouncedDividendsOutcome } from '@/lib/utils/dividendEntitlement';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

/**
 * After a trade: every automatic dividend or coupon of the asset still to be paid follows the
 * quantity the ledger now says was held at its ex-date (2026-11-23) — rewritten, or deleted at 0.
 *
 * Runs AFTER the ledger's transaction, outside it, and is idempotent: a dividend is a forecast,
 * not money, and the payment-day pass of the cron re-applies the same verdict before it cashes
 * one. So a failure here never undoes the trade (the caller catches it), and two concurrent trades
 * on one asset are corrected by the next one. `ownerId` is the account the trade route authorized.
 *
 * Returns the counts the trade's answer carries; no write when every verdict is «keep».
 */
export async function reconcileAnnouncedDividendsForAsset(
  ownerId: string,
  assetId: string
): Promise<AnnouncedDividendsOutcome> {
  const [trades, dividends] = await Promise.all([
    getAssetTransactionsForAssetAdmin(ownerId, assetId),
    getDividendsByAsset(ownerId, assetId),
  ]);
  const asOfIso = getItalyDateIso();
  const outcome: AnnouncedDividendsOutcome = { updated: 0, deleted: 0 };

  for (const dividend of dividends) {
    const verdict = reconcileAnnouncedDividend(dividend, trades, asOfIso);
    if (verdict.kind === 'delete') {
      await deleteDividend(dividend.id);
      outcome.deleted += 1;
    } else if (verdict.kind === 'update') {
      const { quantity, grossAmount, taxAmount, netAmount, foreignTaxAmount } = verdict;
      // A changed amount makes updateDividend convert the euro fields again, at the payment day's rate.
      await updateDividend(dividend.id, { quantity, grossAmount, taxAmount, netAmount, foreignTaxAmount, currency: dividend.currency });
      outcome.updated += 1;
    }
  }
  return outcome;
}
