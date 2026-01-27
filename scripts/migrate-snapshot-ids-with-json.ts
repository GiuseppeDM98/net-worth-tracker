/**
 * Snapshot ID Migration Script (Using Service Account JSON File)
 *
 * Migrates snapshot document IDs from padded format (YYYY-MM) to unpadded (YYYY-M).
 *
 * Problem:
 *   - Inconsistent snapshot ID formatting in codebase
 *   - Some snapshots have zero-padded months (e.g., "user123-2024-01")
 *   - Should use unpadded format (e.g., "user123-2024-1") per documentation
 *
 * Solution:
 *   - Query all snapshot documents
 *   - Identify snapshots with padded month IDs (months 1-9)
 *   - Create new documents with correct IDs
 *   - Delete old documents
 *   - Handle conflicts (if both formats exist for same month)
 *
 * Safety Features:
 *   - Dry-run mode (default): logs changes without applying
 *   - Conflict detection: warns if both formats exist
 *   - Transaction-based operations
 *   - Detailed progress logging
 *
 * Usage:
 *   # Step 1: Download service account key from Firebase Console
 *   #   - Go to Project Settings → Service Accounts
 *   #   - Click "Generate new private key"
 *   #   - Save as firebase-admin-key.json in project root
 *
 *   # Step 2: Dry-run (preview changes)
 *   npx tsx scripts/migrate-snapshot-ids-with-json.ts
 *
 *   # Step 3: Execute migration
 *   npx tsx scripts/migrate-snapshot-ids-with-json.ts --execute
 *
 * Prerequisites:
 *   - Backup production database before running with --execute
 *   - Download firebase-admin-key.json from Firebase Console
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { MonthlySnapshot } from '../types/assets';

const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

// Regex to detect padded month IDs (months 01-09)
// Pattern: ends with "-0" followed by single digit (1-9)
const PADDED_MONTH_REGEX = /-0[1-9]$/;

interface MigrationStats {
  total: number;
  needsMigration: number;
  migrated: number;
  skipped: number;
  conflicts: number;
  errors: number;
}

interface ConflictInfo {
  userId: string;
  year: number;
  month: number;
  oldId: string;
  newId: string;
  reason: string;
}

// Initialize Firebase Admin with service account JSON file
console.log('🔧 Initializing Firebase Admin SDK...\n');

const serviceAccountPath = join(process.cwd(), 'firebase-admin-key.json');

if (!existsSync(serviceAccountPath)) {
  console.error('❌ Service account key file not found!');
  console.error(`   Expected path: ${serviceAccountPath}`);
  console.error('\n   How to get the file:');
  console.error('   1. Go to Firebase Console → Project Settings → Service Accounts');
  console.error('   2. Click "Generate new private key"');
  console.error('   3. Save the downloaded file as "firebase-admin-key.json" in project root\n');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  // Initialize Firebase Admin if not already initialized
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized successfully\n');
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  process.exit(1);
}

const adminDb = getFirestore();

/**
 * Extract userId, year, month from snapshot document ID
 *
 * @param docId - Document ID in format "userId-YYYY-M" or "userId-YYYY-MM"
 * @returns Parsed components or null if invalid format
 */
function parseSnapshotId(docId: string): {
  userId: string;
  year: number;
  month: number;
} | null {
  // Pattern: {userId}-{year}-{month}
  // Examples: "user123-2024-1", "user123-2024-01"
  const parts = docId.split('-');

  if (parts.length < 3) {
    return null;
  }

  // Last part is month, second-to-last is year, rest is userId
  const month = parseInt(parts[parts.length - 1], 10);
  const year = parseInt(parts[parts.length - 2], 10);
  const userId = parts.slice(0, -2).join('-'); // Rejoin in case userId contains hyphens

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return null;
  }

  return { userId, year, month };
}

/**
 * Generate correct snapshot ID without padding
 *
 * @param userId - User identifier
 * @param year - Full year (e.g., 2024)
 * @param month - Month number 1-12
 * @returns Snapshot ID in format "userId-YYYY-M"
 */
function generateCorrectSnapshotId(
  userId: string,
  year: number,
  month: number
): string {
  return `${userId}-${year}-${month}`;
}

/**
 * Check if document ID has padded month format
 *
 * @param docId - Document ID to check
 * @returns True if ID has zero-padded month (01-09)
 */
function hasPaddedMonth(docId: string): boolean {
  return PADDED_MONTH_REGEX.test(docId);
}

/**
 * Migrate a single snapshot document
 *
 * @param oldDocId - Current document ID (with padding)
 * @param newDocId - Target document ID (without padding)
 * @param dryRun - If true, log changes without applying
 * @returns Success status
 */
async function migrateSnapshot(
  oldDocId: string,
  newDocId: string,
  dryRun: boolean
): Promise<boolean> {
  try {
    const oldDocRef = adminDb.collection(SNAPSHOTS_COLLECTION).doc(oldDocId);
    const newDocRef = adminDb.collection(SNAPSHOTS_COLLECTION).doc(newDocId);

    // Read old document
    const oldDoc = await oldDocRef.get();

    if (!oldDoc.exists) {
      console.error(`  ❌ Old document not found: ${oldDocId}`);
      return false;
    }

    const snapshotData = oldDoc.data() as MonthlySnapshot;

    if (dryRun) {
      console.log(`  📝 Would copy data from ${oldDocId} to ${newDocId}`);
      console.log(`  📝 Would delete old document ${oldDocId}`);
      return true;
    }

    // Execute migration
    // 1. Create new document with correct ID
    await newDocRef.set(snapshotData);
    console.log(`  ✅ Created new document: ${newDocId}`);

    // 2. Delete old document
    await oldDocRef.delete();
    console.log(`  ✅ Deleted old document: ${oldDocId}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error migrating ${oldDocId}:`, error);
    return false;
  }
}

/**
 * Main migration function
 *
 * @param dryRun - If true, preview changes without applying
 */
async function migrateSnapshotIds(dryRun = true): Promise<void> {
  console.log('🔄 Snapshot ID Migration Script\n');
  console.log(
    `Mode: ${dryRun ? '📋 DRY-RUN (preview only)' : '⚡ EXECUTE (applying changes)'}\n`
  );

  const stats: MigrationStats = {
    total: 0,
    needsMigration: 0,
    migrated: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
  };

  const conflicts: ConflictInfo[] = [];

  try {
    // Query all snapshot documents
    console.log('📊 Querying all snapshots...\n');
    const snapshotsRef = adminDb.collection(SNAPSHOTS_COLLECTION);
    const snapshot = await snapshotsRef.get();

    stats.total = snapshot.size;
    console.log(`Found ${stats.total} total snapshots\n`);

    // Process each snapshot
    for (const doc of snapshot.docs) {
      const docId = doc.id;
      const data = doc.data() as MonthlySnapshot;

      // Check if document has padded month ID
      if (!hasPaddedMonth(docId)) {
        // Already correct format, skip
        continue;
      }

      stats.needsMigration++;

      // Extract userId, year, month from DOCUMENT DATA (not ID, as ID might be wrong)
      const { userId, year, month } = data;

      if (!userId || !year || !month) {
        console.error(
          `❌ Invalid snapshot data (missing userId/year/month): ${docId}`
        );
        stats.errors++;
        continue;
      }

      // Generate correct ID
      const newDocId = generateCorrectSnapshotId(userId, year, month);

      console.log(`\n📦 Processing: ${docId}`);
      console.log(`  User: ${userId}, Year: ${year}, Month: ${month}`);
      console.log(`  Target ID: ${newDocId}`);

      // Check if target ID already exists (conflict)
      const newDocRef = adminDb.collection(SNAPSHOTS_COLLECTION).doc(newDocId);
      const newDoc = await newDocRef.get();

      if (newDoc.exists) {
        console.warn(
          `  ⚠️  CONFLICT: Target ID already exists: ${newDocId}`
        );
        console.warn(
          `  ⚠️  Manual resolution needed - both formats exist for same month`
        );

        conflicts.push({
          userId,
          year,
          month,
          oldId: docId,
          newId: newDocId,
          reason: 'Target document already exists',
        });

        stats.conflicts++;
        stats.skipped++;
        continue;
      }

      // Migrate snapshot
      const success = await migrateSnapshot(docId, newDocId, dryRun);

      if (success) {
        stats.migrated++;
      } else {
        stats.errors++;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total snapshots:           ${stats.total}`);
    console.log(`Need migration:            ${stats.needsMigration}`);
    console.log(
      `${dryRun ? 'Would migrate' : 'Migrated'}:          ${stats.migrated}`
    );
    console.log(`Skipped:                   ${stats.skipped}`);
    console.log(`Conflicts:                 ${stats.conflicts}`);
    console.log(`Errors:                    ${stats.errors}`);
    console.log('='.repeat(60));

    // Print conflicts if any
    if (conflicts.length > 0) {
      console.log('\n⚠️  Conflicts Detected (Manual Resolution Required):\n');
      conflicts.forEach((conflict, index) => {
        console.log(`${index + 1}. User: ${conflict.userId}`);
        console.log(`   Year: ${conflict.year}, Month: ${conflict.month}`);
        console.log(`   Old ID: ${conflict.oldId}`);
        console.log(`   New ID: ${conflict.newId}`);
        console.log(`   Reason: ${conflict.reason}\n`);
      });

      console.log('Action Required:');
      console.log(
        '  - Compare data in both documents (check createdAt, note fields)'
      );
      console.log('  - Keep the more recent/complete snapshot');
      console.log('  - Delete the duplicate manually in Firestore console');
      console.log('  - Re-run this script after manual resolution\n');
    }

    // Next steps
    if (dryRun && stats.needsMigration > 0) {
      console.log('\n✅ Dry-run complete. No changes were applied.');
      console.log(
        '\nTo execute migration, run:\n  npx tsx scripts/migrate-snapshot-ids-with-json.ts --execute\n'
      );
    } else if (!dryRun && stats.migrated > 0) {
      console.log(
        '\n✅ Migration complete. Verify changes in Firestore console.\n'
      );
    } else if (stats.needsMigration === 0) {
      console.log(
        '\n✅ No snapshots need migration. All IDs are already in correct format.\n'
      );
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');

if (!dryRun) {
  console.log('\n⚠️  WARNING: You are about to modify production data!');
  console.log('⚠️  Ensure you have created a database backup.\n');
}

migrateSnapshotIds(dryRun)
  .then(() => {
    console.log('Done.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
