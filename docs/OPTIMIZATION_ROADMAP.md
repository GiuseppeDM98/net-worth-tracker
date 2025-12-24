# Firebase Optimization Roadmap - Fasi 2 & 3

**Documento di riferimento per le prossime sessioni di ottimizzazione della pagina Overview**

---

## Stato Attuale (Post-Fase 1)

### ✅ Fase 1 Completata: React Query Foundation

**Implementato:**
- React Query con caching automatico (5min stale, 10min gc)
- Custom hooks: `useAssets`, `useSnapshots`, `useExpenseStats`
- Query deduplication automatica
- Parallel fetching (assets, snapshots, expenses)
- Memoization calcoli pesanti (portfolioMetrics, variations, chartData)

**Performance:**
- Query Firebase: 4 → 3 (-25%)
- Query duplicate eliminate (getUserSnapshots chiamato 1 volta invece di 2)
- Caricamenti successivi: 0 query (cache hit)
- Fetching: Sequential → Parallel (-20% tempo caricamento)

**File Creati:**
- `lib/providers/QueryClientProvider.tsx`
- `lib/query/queryKeys.ts`
- `lib/hooks/useAssets.ts`
- `lib/hooks/useSnapshots.ts`
- `lib/hooks/useExpenseStats.ts`

**File Modificati:**
- `app/layout.tsx` - Integrato QueryClientProvider
- `app/dashboard/page.tsx` - Refactoring completo con React Query

---

## 📋 FASE 2: Snapshot Summaries Collection

### Obiettivo
Ridurre il trasferimento dati del 66% creando una collection lightweight `snapshot-summaries` che sostituisce `monthly-snapshots` per la pagina Overview.

### Performance Target
- Trasferimento dati: ~600KB → ~205KB (-66%)
- Query snapshots: ~300KB → ~5KB (-98.3%)
- Computazione client: -40% (variazioni pre-calcolate)

---

### 2.1 Nuovo Data Model: SnapshotSummary

**Creare interface in `types/assets.ts`:**

```typescript
export interface SnapshotSummary {
  userId: string;
  year: number;
  month: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  previousMonthNetWorth: number | null;
  monthlyChange: number | null;          // Pre-calcolato!
  monthlyChangePercent: number | null;   // Pre-calcolato!
  createdAt: Date;
}
```

**Rationale:**
- Footprint: ~100 bytes vs ~3KB per snapshot completo
- Nessun array `byAsset` (non serve per Overview)
- Variazioni mensili pre-calcolate (no calcoli client-side)

---

### 2.2 Service Layer: snapshotSummaryService

**Creare `lib/services/snapshotSummaryService.ts`:**

```typescript
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { SnapshotSummary } from '@/types/assets';

const SUMMARIES_COLLECTION = 'snapshot-summaries';

/**
 * Create or update a snapshot summary
 * Called by createSnapshot() after full snapshot creation
 */
export async function upsertSnapshotSummary(
  userId: string,
  year: number,
  month: number,
  totalNetWorth: number,
  liquidNetWorth: number,
  illiquidNetWorth: number,
  previousMonthNetWorth: number | null
): Promise<void> {
  try {
    const summaryId = `${userId}-${year}-${month}`;

    let monthlyChange: number | null = null;
    let monthlyChangePercent: number | null = null;

    if (previousMonthNetWorth !== null && previousMonthNetWorth > 0) {
      monthlyChange = totalNetWorth - previousMonthNetWorth;
      monthlyChangePercent = (monthlyChange / previousMonthNetWorth) * 100;
    }

    const summary: Omit<SnapshotSummary, 'createdAt'> & { createdAt: Timestamp } = {
      userId,
      year,
      month,
      totalNetWorth,
      liquidNetWorth,
      illiquidNetWorth,
      previousMonthNetWorth,
      monthlyChange,
      monthlyChangePercent,
      createdAt: Timestamp.now(),
    };

    const summaryRef = doc(db, SUMMARIES_COLLECTION, summaryId);
    await setDoc(summaryRef, summary);
  } catch (error) {
    console.error('Error upserting snapshot summary:', error);
    throw new Error('Failed to upsert snapshot summary');
  }
}

/**
 * Get all snapshot summaries for a user (lightweight)
 */
export async function getSnapshotSummaries(userId: string): Promise<SnapshotSummary[]> {
  try {
    const summariesRef = collection(db, SUMMARIES_COLLECTION);
    const q = query(
      summariesRef,
      where('userId', '==', userId),
      orderBy('year', 'asc'),
      orderBy('month', 'asc')
    );

    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as SnapshotSummary[];
  } catch (error) {
    console.error('Error getting snapshot summaries:', error);
    throw new Error('Failed to fetch snapshot summaries');
  }
}

/**
 * Get the most recent summary
 */
export async function getLatestSummary(userId: string): Promise<SnapshotSummary | null> {
  try {
    const summaries = await getSnapshotSummaries(userId);
    return summaries.length > 0 ? summaries[summaries.length - 1] : null;
  } catch (error) {
    console.error('Error getting latest summary:', error);
    return null;
  }
}
```

---

### 2.3 Modificare snapshotService.ts

**In `lib/services/snapshotService.ts`, aggiornare `createSnapshot()`:**

```typescript
import { upsertSnapshotSummary } from './snapshotSummaryService'; // NEW IMPORT

export async function createSnapshot(
  userId: string,
  assets: Asset[],
  year?: number,
  month?: number
): Promise<string> {
  try {
    const now = new Date();
    const snapshotYear = year ?? now.getFullYear();
    const snapshotMonth = month ?? now.getMonth() + 1;

    const totalNetWorth = calculateTotalValue(assets);
    const liquidNetWorth = calculateLiquidNetWorth(assets);
    const illiquidNetWorth = calculateIlliquidNetWorth(assets);
    const allocation = calculateCurrentAllocation(assets);

    // ... resto della logica per creare snapshot completo ...

    const snapshotRef = doc(db, SNAPSHOTS_COLLECTION, snapshotId);
    await setDoc(snapshotRef, snapshot);

    // NEW: Also create summary for Overview page
    const previousSnapshots = await getUserSnapshots(userId);
    const previousSnapshot = previousSnapshots.length > 0
      ? previousSnapshots[previousSnapshots.length - 1]
      : null;

    await upsertSnapshotSummary(
      userId,
      snapshotYear,
      snapshotMonth,
      totalNetWorth,
      liquidNetWorth,
      illiquidNetWorth,
      previousSnapshot?.totalNetWorth || null
    );

    return snapshotId;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw new Error('Failed to create snapshot');
  }
}
```

---

### 2.4 Custom Hook: useSnapshotSummaries

**Creare `lib/hooks/useSnapshotSummaries.ts`:**

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getSnapshotSummaries } from '@/lib/services/snapshotSummaryService';

export function useSnapshotSummaries(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.snapshots.summaries(userId || ''),
    queryFn: () => getSnapshotSummaries(userId!),
    enabled: !!userId,
  });
}
```

---

### 2.5 Modificare Dashboard Page

**In `app/dashboard/page.tsx`, sostituire `useSnapshots` con `useSnapshotSummaries`:**

```typescript
// BEFORE:
import { useSnapshots } from '@/lib/hooks/useSnapshots';
const { data: snapshots = [], isLoading: loadingSnapshots } = useSnapshots(user?.uid);

// AFTER:
import { useSnapshotSummaries } from '@/lib/hooks/useSnapshotSummaries';
const { data: summaries = [], isLoading: loadingSummaries } = useSnapshotSummaries(user?.uid);

const loading = loadingAssets || loadingSummaries;
```

**Aggiornare `variations` useMemo:**

```typescript
// Variations calculation SEMPLIFICATA (usa pre-calculated values)
const variations = useMemo(() => {
  if (summaries.length === 0) return { monthly: null, yearly: null };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const currentMonthSummary = summaries.find(
    (s) => s.year === currentYear && s.month === currentMonth
  );

  const latestSummary = currentMonthSummary || summaries[summaries.length - 1];

  // Monthly variation ALREADY pre-calculated!
  const monthlyVariation = latestSummary.monthlyChange !== null
    ? {
        value: latestSummary.monthlyChange,
        percentage: latestSummary.monthlyChangePercent!,
      }
    : null;

  // Yearly variation: find first summary of current year
  const firstSummaryOfYear = summaries.find((s) => s.year === currentYear);

  const yearlyVariation = firstSummaryOfYear
    ? {
        value: latestSummary.totalNetWorth - firstSummaryOfYear.totalNetWorth,
        percentage: firstSummaryOfYear.totalNetWorth > 0
          ? ((latestSummary.totalNetWorth - firstSummaryOfYear.totalNetWorth) /
              firstSummaryOfYear.totalNetWorth) * 100
          : 0,
      }
    : null;

  return { monthly: monthlyVariation, yearly: yearlyVariation };
}, [summaries]);
```

**Aggiornare `handleCreateSnapshot`:**

```typescript
const handleCreateSnapshot = async () => {
  if (!user) return;

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const existing = summaries.find(
      (s) => s.year === currentYear && s.month === currentMonth
    );

    if (existing) {
      setExistingSnapshot({ year: currentYear, month: currentMonth } as MonthlySnapshot);
      setShowConfirmDialog(true);
    } else {
      await createSnapshot();
    }
  } catch (error) {
    console.error('Error checking existing snapshots:', error);
    toast.error('Errore nel controllo degli snapshot esistenti');
  }
};
```

---

### 2.6 Firestore Index

**Aggiungere in `firestore.indexes.json`:**

```json
{
  "indexes": [
    {
      "collectionGroup": "snapshot-summaries",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "year",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "month",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
```

**Deploy index:**
```bash
firebase deploy --only firestore:indexes
```

---

### 2.7 Backfill Script per Dati Esistenti

**Creare `scripts/backfill-snapshot-summaries.ts`:**

```typescript
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Backfill snapshot-summaries collection from existing monthly-snapshots
 * Run via: npx ts-node scripts/backfill-snapshot-summaries.ts
 */
async function backfillSnapshotSummaries() {
  console.log('Starting snapshot summaries backfill...');

  const snapshotsRef = adminDb.collection('monthly-snapshots');
  const snapshotsQuery = snapshotsRef.orderBy('userId').orderBy('year').orderBy('month');
  const snapshotsSnapshot = await snapshotsQuery.get();

  const summariesByUser: Map<string, any[]> = new Map();

  // Group snapshots by user
  snapshotsSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const userId = data.userId;

    if (!summariesByUser.has(userId)) {
      summariesByUser.set(userId, []);
    }

    summariesByUser.get(userId)!.push({
      year: data.year,
      month: data.month,
      totalNetWorth: data.totalNetWorth,
      liquidNetWorth: data.liquidNetWorth,
      illiquidNetWorth: data.illiquidNetWorth,
    });
  });

  console.log(`Found ${summariesByUser.size} users with snapshots`);

  const batch = adminDb.batch();
  let count = 0;
  let batchCount = 0;

  // Create summaries for each user
  for (const [userId, snapshots] of summariesByUser) {
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      const previousSnapshot = i > 0 ? snapshots[i - 1] : null;

      const summaryId = `${userId}-${snapshot.year}-${snapshot.month}`;

      let monthlyChange: number | null = null;
      let monthlyChangePercent: number | null = null;

      if (previousSnapshot && previousSnapshot.totalNetWorth > 0) {
        monthlyChange = snapshot.totalNetWorth - previousSnapshot.totalNetWorth;
        monthlyChangePercent = (monthlyChange / previousSnapshot.totalNetWorth) * 100;
      }

      const summaryRef = adminDb.collection('snapshot-summaries').doc(summaryId);
      batch.set(summaryRef, {
        userId,
        year: snapshot.year,
        month: snapshot.month,
        totalNetWorth: snapshot.totalNetWorth,
        liquidNetWorth: snapshot.liquidNetWorth,
        illiquidNetWorth: snapshot.illiquidNetWorth,
        previousMonthNetWorth: previousSnapshot?.totalNetWorth || null,
        monthlyChange,
        monthlyChangePercent,
        createdAt: FieldValue.serverTimestamp(),
      });

      count++;
      batchCount++;

      // Firestore batch limit is 500 operations
      if (batchCount === 500) {
        await batch.commit();
        console.log(`Committed batch of 500 (total: ${count})`);
        batchCount = 0;
      }
    }
  }

  // Commit remaining operations
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Backfill complete! Created ${count} snapshot summaries`);
}

backfillSnapshotSummaries().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
```

**IMPORTANTE**: Eseguire script DOPO aver deployato l'applicazione:
```bash
npx ts-node scripts/backfill-snapshot-summaries.ts
```

---

### 2.8 Testing Checklist Fase 2

- [ ] Eseguire backfill script, verificare `snapshot-summaries` popolato
- [ ] Overview page carica con summaries (non snapshots completi)
- [ ] Variazioni mensili/annuali visualizzate correttamente
- [ ] Click "Crea Snapshot" crea ENTRAMBE le collection (snapshot + summary)
- [ ] History page continua a funzionare (usa snapshots completi)
- [ ] Network tab: verificare ~5KB per summaries vs ~300KB per snapshots
- [ ] React Query cache: navigazione Overview → Assets → Overview istantanea

---

### 2.9 File Modificati/Creati Fase 2

**Creati:**
- `types/assets.ts` - Aggiungi interface SnapshotSummary
- `lib/services/snapshotSummaryService.ts` - NEW service
- `lib/hooks/useSnapshotSummaries.ts` - NEW hook
- `scripts/backfill-snapshot-summaries.ts` - Backfill script

**Modificati:**
- `lib/services/snapshotService.ts` - Call upsertSnapshotSummary in createSnapshot
- `app/dashboard/page.tsx` - Use useSnapshotSummaries, semplifica variations
- `firestore.indexes.json` - Add snapshot-summaries index

**NON MODIFICARE:**
- `app/dashboard/history/page.tsx` - Continua a usare useSnapshots (serve byAsset)

---

## 📋 FASE 3: Expense Stats API Route

### Obiettivo
Spostare aggregazione spese su server-side, riducendo query da 2 a 1 e computazione client del 60%.

### Performance Target
- Query expenses: 2 → 1 (single range query)
- Computazione client: -60% (aggregazione server-side)
- Total queries Overview: 2 (assets + API stats, summaries cached)

---

### 3.1 API Route: Expense Stats Aggregation

**Creare `app/api/expenses/stats/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { ExpenseStats } from '@/types/expenses';

export async function GET(request: NextRequest) {
  try {
    // Extract userId from query params
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Calculate previous month
    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear -= 1;
    }

    // Fetch expenses for 2-month range in SINGLE query
    const startDate = new Date(previousYear, previousMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const expensesRef = adminDb.collection('expenses');
    const q = expensesRef
      .where('userId', '==', userId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate);

    const querySnapshot = await q.get();

    // Aggregate expenses in-memory (faster than 2 separate queries)
    const currentMonthData = { income: 0, expenses: 0 };
    const previousMonthData = { income: 0, expenses: 0 };

    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const expenseDate = data.date.toDate();
      const expenseYear = expenseDate.getFullYear();
      const expenseMonth = expenseDate.getMonth() + 1;

      const isCurrentMonth = expenseYear === currentYear && expenseMonth === currentMonth;
      const target = isCurrentMonth ? currentMonthData : previousMonthData;

      if (data.type === 'income') {
        target.income += data.amount;
      } else {
        target.expenses += Math.abs(data.amount);
      }
    });

    // Calculate deltas
    const incomeDelta =
      previousMonthData.income > 0
        ? ((currentMonthData.income - previousMonthData.income) / previousMonthData.income) * 100
        : 0;

    const expensesDelta =
      previousMonthData.expenses > 0
        ? ((currentMonthData.expenses - previousMonthData.expenses) / previousMonthData.expenses) *
          100
        : 0;

    const currentNet = currentMonthData.income - currentMonthData.expenses;
    const previousNet = previousMonthData.income - previousMonthData.expenses;

    const netDelta =
      previousNet !== 0
        ? ((currentNet - previousNet) / Math.abs(previousNet)) * 100
        : 0;

    const stats: ExpenseStats = {
      currentMonth: {
        income: currentMonthData.income,
        expenses: currentMonthData.expenses,
        net: currentNet,
      },
      previousMonth: {
        income: previousMonthData.income,
        expenses: previousMonthData.expenses,
        net: previousNet,
      },
      delta: {
        income: incomeDelta,
        expenses: expensesDelta,
        net: netDelta,
      },
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error calculating expense stats:', error);
    return NextResponse.json({ error: 'Failed to calculate expense stats' }, { status: 500 });
  }
}
```

---

### 3.2 Modificare expenseService

**Aggiungere in `lib/services/expenseService.ts`:**

```typescript
/**
 * Get expense statistics via API route (server-side aggregation)
 */
export async function getExpenseStatsViaAPI(userId: string): Promise<ExpenseStats> {
  try {
    const response = await fetch(`/api/expenses/stats?userId=${userId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch expense stats');
    }

    const stats: ExpenseStats = await response.json();
    return stats;
  } catch (error) {
    console.error('Error getting expense stats via API:', error);
    throw new Error('Failed to get expense stats');
  }
}
```

---

### 3.3 Modificare Hook useExpenseStats

**In `lib/hooks/useExpenseStats.ts`:**

```typescript
import { getExpenseStatsViaAPI } from '@/lib/services/expenseService'; // CHANGED

export function useExpenseStats(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.stats(userId || ''),
    queryFn: () => getExpenseStatsViaAPI(userId!), // CHANGED from getExpenseStats
    enabled: !!userId,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });
}
```

---

### 3.4 Firestore Index per Date Range

**Aggiungere in `firestore.indexes.json`:**

```json
{
  "indexes": [
    {
      "collectionGroup": "expenses",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "date",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

**Deploy index:**
```bash
firebase deploy --only firestore:indexes
```

---

### 3.5 Testing Checklist Fase 3

- [ ] Expense stats cards mostrano dati corretti
- [ ] API route `/api/expenses/stats?userId=xxx` risponde <200ms
- [ ] Firestore console: index `expenses (userId, date)` utilizzato (no warning)
- [ ] Network tab: single request API route invece di 2 query Firestore
- [ ] Confronto valori con implementazione precedente (regression test)
- [ ] Chrome DevTools Performance: CPU usage ridotto (no aggregazione client)

---

### 3.6 File Modificati/Creati Fase 3

**Creati:**
- `app/api/expenses/stats/route.ts` - NEW API route

**Modificati:**
- `lib/services/expenseService.ts` - Add getExpenseStatsViaAPI
- `lib/hooks/useExpenseStats.ts` - Use API route
- `firestore.indexes.json` - Add expenses (userId, date) index

---

## 🚀 Prompt di Inizio Sessione

### Per Fase 2: Snapshot Summaries

```
Ciao Claude, in questa sessione voglio implementare la Fase 2 del piano di ottimizzazione Firebase per la pagina Overview.

Riferimenti:
- Piano completo: /Users/giuseppedimaio/.claude/plans/modular-splashing-scott.md
- Roadmap implementativa: docs/OPTIMIZATION_ROADMAP.md (sezione Fase 2)
- Note sessione precedente: SESSION_NOTES.md

Obiettivo Fase 2:
Creare collection Firebase "snapshot-summaries" lightweight (~5KB invece di ~300KB) per ridurre trasferimento dati del 66%.

Task da completare:
1. Aggiungere interface SnapshotSummary in types/assets.ts
2. Creare snapshotSummaryService.ts con upsertSnapshotSummary(), getSnapshotSummaries()
3. Modificare snapshotService.ts per chiamare upsertSnapshotSummary in createSnapshot()
4. Creare hook useSnapshotSummaries.ts
5. Modificare app/dashboard/page.tsx per usare summaries invece di snapshots completi
6. Aggiungere index Firestore per snapshot-summaries (userId, year, month)
7. Creare script backfill-snapshot-summaries.ts per dati esistenti

IMPORTANTE:
- History page NON va modificata (continua a usare snapshots completi per array byAsset)
- Testare che variazioni mensili/annuali siano calcolate correttamente con summaries
- Eseguire backfill script DOPO deployment per popolare collection

Performance target: Trasferimento dati ~600KB → ~205KB (-66%)

Procediamo step by step, aggiornando SESSION_NOTES.md man mano.
```

---

### Per Fase 3: Expense Stats API Route

```
Ciao Claude, in questa sessione voglio implementare la Fase 3 del piano di ottimizzazione Firebase per la pagina Overview.

Riferimenti:
- Piano completo: /Users/giuseppedimaio/.claude/plans/modular-splashing-scott.md
- Roadmap implementativa: docs/OPTIMIZATION_ROADMAP.md (sezione Fase 3)
- Note sessione precedente: SESSION_NOTES.md

Obiettivo Fase 3:
Creare API route server-side per aggregazione expense stats, riducendo query da 2 a 1 e computazione client del 60%.

Task da completare:
1. Creare app/api/expenses/stats/route.ts con handler GET
   - Query Firebase Admin SDK per 2-month range (single query)
   - Aggregazione in-memory (separa current vs previous month)
   - Return ExpenseStats JSON
2. Aggiungere getExpenseStatsViaAPI() in expenseService.ts
3. Modificare useExpenseStats.ts per chiamare API route invece di getExpenseStats
4. Aggiungere index Firestore per expenses (userId, date DESC)

IMPORTANTE:
- API route deve gestire errori (userId missing, query failure)
- Mantenere stesso formato ExpenseStats per retrocompatibilità
- Testare che delta percentages siano calcolati correttamente
- Verificare latency API route <200ms

Performance target: Query expenses 2→1, computazione client -60%

Procediamo step by step, aggiornando SESSION_NOTES.md man mano.
```

---

## 📊 Performance Impact Summary (Tutte le Fasi)

| Metrica | Prima | Post-Fase 1 | Post-Fase 2 | Post-Fase 3 | Totale |
|---------|-------|-------------|-------------|-------------|--------|
| **Query Firebase** | 4 | 3 | 2 | 2 | **-50%** |
| **Trasferimento dati** | ~600KB | ~600KB | ~205KB | ~205KB | **-66%** |
| **Query duplicate** | Sì | No | No | No | **Eliminate** |
| **Fetching pattern** | Sequential | Parallel | Parallel | Parallel | **Ottimizzato** |
| **Computazione client** | 100% | 80% | 40% | 20% | **-80%** |
| **Cache hits (subsequent)** | 0% | 100% | 100% | 100% | **+100%** |

---

## 🔍 Monitoring Post-Deploy

### Firestore Metrics (Firebase Console)
- Document reads: target -50%
- Query latency: target <100ms
- Index usage: verificare no missing indexes

### React Query Devtools (Browser)
- Cache hit rate: target >80%
- Stale-while-revalidate: verificare background refetch
- Query deduplication: verificare no query duplicate

### Chrome DevTools
- Network tab: data transfer <250KB per page load
- Performance tab: CPU usage ridotto (meno aggregazioni)
- Lighthouse: Core Web Vitals improvement

### Vercel Analytics (se abilitato)
- Page load time: target <1s
- Time to Interactive: target <1.5s

---

## ⚠️ Note Importanti

### Backward Compatibility
- ✅ `monthly-snapshots` collection rimane intatta (serve per History page)
- ✅ Servizi esistenti non modificati (solo aggiunte)
- ✅ API route è addizionale (non sostituisce getExpenseStats, che rimane disponibile)

### Rollback Strategy
**Fase 2 Rollback:**
- In `app/dashboard/page.tsx`: sostituisci `useSnapshotSummaries()` → `useSnapshots()`
- Collection `snapshot-summaries` può rimanere (non crea problemi)

**Fase 3 Rollback:**
- In `lib/hooks/useExpenseStats.ts`: sostituisci `getExpenseStatsViaAPI()` → `getExpenseStats()`
- Disabilita API route (rename o delete file)

### Security
- API route espone endpoint `/api/expenses/stats?userId=xxx`
- NON implementare autenticazione (Next.js API routes sono server-side, Firebase Admin SDK ha già auth)
- Se necessario in futuro: aggiungere middleware per verificare Firebase Auth token

---

**Documento creato**: 2025-12-24
**Versione**: 1.0
**Stato**: Ready for Implementation
