/**
 * Loan Migration Service — commits the plan of lib/utils/loanMigration.ts: each property's legacy
 * debt becomes a `loan` asset of its own, the instalments linked to the property move to the loan,
 * the legacy fields leave the property.
 *
 * Fired by the Patrimonio page on each load whose list shows a debt (the same posture as the ledger
 * migration and the `averageCostEur` backfill there): silent, idempotent — it decides on what
 * Firestore holds now, so a second run finds no property with a debt and writes nothing — and gated on the demo like every write, so the demo account keeps
 * the legacy netting of `calculateAssetValue`. Client SDK: every document is the owner's
 * (`firestore.rules`), and the rows are listed with the `userId` the rules need.
 *
 * Three writes per property, in this order so a failure leaves the account readable at every step:
 * the loan first (an extra loan beside a still-netted property double-counts the debt for one
 * reload, which the last write ends), then the rows in batches, then the property's fields. The
 * rows of one property can be a whole plan (up to 360 of a series): `writeBatch` takes 500
 * operations, so they go in chunks.
 */

import { collection, deleteField, doc, getDocFromServer, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { createAsset } from '@/lib/services/assetService';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { planLoanMigration, propertiesWithLegacyDebt } from '@/lib/utils/loanMigration';
import type { Asset } from '@/types/assets';

const ASSETS_COLLECTION = 'assets';
const EXPENSES_COLLECTION = 'expenses';
/** Under Firestore's 500-operation ceiling on a batch, with room for the property's own write. */
const ROWS_PER_BATCH = 450;

export interface LoanMigrationResult {
  /** Loans created, one per property that carried a debt. */
  migrated: number;
}

/** The rows that repay the given properties, read with the `userId` the rules need. */
async function linkedRowsOf(ownerId: string, propertyIds: string[]): Promise<{ id: string; debtAssetId: string }[]> {
  const perProperty = await Promise.all(
    propertyIds.map(async (propertyId) => {
      const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', ownerId), where('debtAssetId', '==', propertyId)));
      return snapshot.docs.map((row) => ({ id: row.id, debtAssetId: propertyId }));
    })
  );
  return perProperty.flat();
}

/**
 * Move every legacy property debt of `ownerId` into a loan. `assets` only names the candidates: the
 * page's list can be the one IndexedDB restored, older than a migration already done, and a second
 * loan was written from it (2026-11-03) — so each property is re-read from the server, never from
 * Firestore's local cache, and a failed read writes nothing. Returns how many properties were
 * migrated (0 = nothing to do). Two tabs reading at the same instant can still both write.
 */
export async function migratePropertyDebtsToLoans(ownerId: string, assets: Asset[]): Promise<LoanMigrationResult> {
  const candidates = propertiesWithLegacyDebt(assets);
  if (candidates.length === 0) return { migrated: 0 };

  const fresh = await Promise.all(
    candidates.map(async (candidate) => {
      const snapshot = await getDocFromServer(doc(db, ASSETS_COLLECTION, candidate.id));
      return snapshot.exists() ? ({ ...snapshot.data(), id: candidate.id } as Asset) : null;
    })
  );
  const current = fresh.filter((asset): asset is Asset => asset !== null);
  const properties = propertiesWithLegacyDebt(current);
  if (properties.length === 0) return { migrated: 0 };

  const linkedRows = await linkedRowsOf(ownerId, properties.map((property) => property.id));
  const steps = planLoanMigration(current, linkedRows);

  for (const step of steps) {
    const loanId = await createAsset(ownerId, step.loan);
    for (let start = 0; start < step.rowIds.length; start += ROWS_PER_BATCH) {
      const batch = writeBatch(db);
      for (const rowId of step.rowIds.slice(start, start + ROWS_PER_BATCH)) {
        batch.update(doc(db, EXPENSES_COLLECTION, rowId), { debtAssetId: loanId, updatedAt: new Date() });
      }
      await batch.commit();
    }
    const property = writeBatch(db);
    property.update(doc(db, ASSETS_COLLECTION, step.propertyId), {
      outstandingDebt: deleteField(),
      debtInterestRate: deleteField(),
      updatedAt: new Date(),
    });
    await property.commit();
  }

  await invalidateDashboardOverviewSummary(ownerId, 'loan_migration');
  return { migrated: steps.length };
}
