# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian
- Use `formatCurrency()` for EUR formatting (e.g. €1.234,56)
- Use `formatDate()` for DD/MM/YYYY format
- **All code comments in English only**

### Firebase Date Handling & Timezone
- Use `toDate()` from `dateHelpers.ts` (handles Timestamps, ISO strings, null)
- **Month/year extraction**: Use `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()` (NOT `Date.getMonth()`)
- **Why**: Server (UTC) and client (browser) produce same results

### Custom Tailwind Breakpoint
- Use `desktop:` (1025px) instead of `lg:` (1024px)
- Define in `app/globals.css` with `@theme inline`

---

## Key Patterns

### React Query Cache Invalidation
Invalidate all related caches after mutations (direct + indirect dependencies).

### Lazy-Loading Tabs
Never remove from `mountedTabs` once added to preserve state.

### Date Range Queries (Firestore)
End date must include full day: `new Date(year, month, 0, 23, 59, 59, 999)`

### Asset & Chart Patterns
- **Hall of Fame**: Include years with expenses even if <2 snapshots
- **Asset Price %**: For `price === 1` or `displayMode === 'totalValue'`, use total value
- **Asset Historical Aggregation**: Use `name` (not `assetId`) as aggregation key in price history tables to unify data when asset sold and re-purchased
- **Borsa Italiana**: Pass `assetType` to scraper (ETF vs Stock table structures differ)
- **Currency**: Use `currencyConversionService.ts` (Frankfurter API, 24h cache)
- **Chart Y Axis**: Use `formatCurrencyCompact()` on mobile
- **Chart Data**: Check `chartService.ts` prepared data before adding filters
- **Dividend Calendar**: Use `paymentDate` (not `exDate`) for display and filters

### YOC (Yield on Cost) and Current Yield Calculation Pattern
- **Annualization**: < 12 months scale up, >= 12 months average
- **YOC**: Only assets with `quantity > 0` and `averageCost > 0`, uses original cost basis
- **Current Yield**: Uses `currentPrice` (market value) instead of cost
- **Filter dividends**: Use `paymentDate` not `exDate`
- **Architecture**: Use API route (server-only dividend service)

### Time-Sensitive Metrics Pattern
- **Separate date parameters**: Use dedicated `*EndDate` field capped at TODAY
- **Example**: YOC uses `dividendEndDate = min(endDate, today)` for only received dividends
- **Rationale**: Snapshot metrics need end-of-period; dividend metrics need actual data

### Table Totals Row Pattern
- Use `<TableFooter>` for semantic HTML
- Calculate totals on all filtered data (not just current page)
- Use EUR amounts for multi-currency (`netAmountEur ?? netAmount`)

### Expense Amount Sign Convention
- **Income**: POSITIVE, **Expenses**: NEGATIVE in database
- **Net Savings**: `sum(income) + sum(expenses)` (NOT subtraction)
- **Example**: €1000 + (-€400) = €600

### Sankey Diagram Multi-Layer Pattern
When implementing complex data flow visualizations:
- **4-layer structure**: Income → Budget → Types → Categories + Savings
- **5-layer optional**: Toggle to add Subcategories layer (Categories → Subcategories)
- **Multi-mode drill-down**: Support 4 modes (budget, type drill-down, category drill-down, transactions)
- **State management**: Use `mode` field + `parentType`/`parentCategory` for navigation context
- **Conditional rendering**: `{mode !== 'transactions' && <ResponsiveSankey ... />}` prevents crashes with empty data
- **Mobile filtering**: Top 3-4 items per parent to prevent overcrowding (top 4 for subcategories)
- **Unique IDs with separator**: Use `"Category__Subcategory"` format (double underscore) for collision-free IDs
- **Label vs ID in Nivo**: Add `label` field to nodes + configure `label={(node) => node.label || node.id}` in ResponsiveSankey
- **Dual-path navigation**: Support both drill-down flow (4 clicks) and direct 5-layer click (1 click to transactions)
- **"Altro" filtering**: Skip nodes/links when `subcategories.length === 1 && name === 'Altro'` (not informative)
- **Node/Link consistency**: When filtering nodes, ALWAYS filter corresponding links too (prevents "missing: [NodeName]" errors)
- **Example**: CashflowSankeyChart with 4 modes + optional 5-layer + transaction table

### Settings Service Synchronization Pattern
When adding new fields to settings/configuration types:
- **Three-place rule**: ALL fields in settings types must be handled in THREE places
  1. Type definition (e.g., `AssetAllocationSettings` in `types/assets.ts`)
  2. `getSettings()` function to read from database
  3. `setSettings()` function to save to database
- **Firestore merge mode**: Use `if (field !== undefined)` checks in setSettings to preserve existing fields
- **Example pattern**:
```typescript
// 1. Type definition
export interface AssetAllocationSettings {
  includePrimaryResidenceInFIRE?: boolean;
}

// 2. getSettings()
return {
  includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE,
  // ... other fields
};

// 3. setSettings()
if (settings.includePrimaryResidenceInFIRE !== undefined) {
  docData.includePrimaryResidenceInFIRE = settings.includePrimaryResidenceInFIRE;
}
```
- **Why critical**: Omitting service layer updates causes settings to not persist across reloads
- **Prevention**: Mental checklist when adding any settings field

### Firestore Nested Object Deletion Pattern
**Critical**: Firestore `merge: true` does RECURSIVE merge on nested objects, preventing key deletion.
- **Problem**: Cannot delete nested keys by omitting them in new object
  ```typescript
  // Even if you build completely new object:
  const newSubTargets = { "All-World": 33, "Momentum": 33 }; // "azioni" omitted
  await setDoc(ref, { targets: { equity: { subTargets: newSubTargets } } }, { merge: true });
  // Result: Firestore KEEPS "azioni" key! (recursive merge)
  ```
- **Solution**: Use GET + spread + setDoc WITHOUT merge for complete replacement
  ```typescript
  // Correct approach:
  if (settings.targets !== undefined) {
    const existingDoc = await getDoc(ref);
    const existingData = existingDoc.exists() ? existingDoc.data() : {};

    const docData = {
      ...existingData,           // Preserve all other fields
      targets: settings.targets, // COMPLETELY REPLACE targets
      updatedAt: Timestamp.now()
    };

    await setDoc(ref, docData); // NO merge: true!
  }
  ```
- **Rationale**: Read-modify-write pattern with explicit replacement instead of merge
- **Trade-off**: Extra GET call (~100-200ms overhead) for correctness
- **Use case**: Deleting subcategories, removing asset allocation keys, any nested object cleanup

### Firestore User-Managed Data Preservation Pattern
**Critical**: When updating Firestore documents, user-managed data MUST be preserved.
- **Problem**: Function overwrites entire document, losing user-managed fields
  ```typescript
  // ❌ WRONG: Initializes empty array, loses existing notes
  const docData = {
    userId,
    notes: [],  // Overwrites user notes!
    ...calculatedRankings,
  };
  await setDoc(docRef, docData);
  ```
- **Solution**: GET existing document BEFORE writing, preserve user fields
  ```typescript
  // ✅ CORRECT: Read-modify-write pattern
  const docData = {
    userId,
    // notes: [],  ← DO NOT initialize user-managed fields
    ...calculatedRankings,
  };

  // GET existing to preserve user data
  const docRef = doc(db, COLLECTION_NAME, userId);
  const existingDoc = await getDoc(docRef);
  const existingNotes = existingDoc.exists()
    ? (existingDoc.data()?.notes || [])
    : [];

  // SET with preserved user data
  await setDoc(docRef, {
    ...docData,
    notes: existingNotes,  // Critical: preserve user notes!
  });
  ```
- **Why critical**: Prevents data loss when calculated data (rankings, statistics) is updated
- **When to use**: Any document mixing calculated fields + user-managed fields
- **Client/Server divergence risk**: If duplicating functions client/server, ensure BOTH preserve user data
- **Edge cases**: First write (no existing doc) → use empty array fallback
- **Files**: `hallOfFameService.ts` (client), `hallOfFameService.server.ts` (server)

---

### Doubling Time Milestone Pattern
When calculating time-based milestones from historical data:
- **Skip pre-existing milestones**: If first snapshot already exceeds a threshold, skip it to avoid 0-month duration
- **Example**: Portfolio starts at €164k → skip €100k threshold (would show 0m duration)
- **Why critical**: 0-month milestones falsely inflate "fastest doubling" metric
- **Implementation**: `if (threshold <= firstPositive.totalNetWorth) continue;`
- **Geometric mode exception**: NOT affected because baseline is always first snapshot (2x, 4x of actual start)
- **Files**: `chartService.ts` (`calculateThresholdMilestones`)

### Asset Re-acquisition Aggregation Pattern
When displaying historical asset data across time periods:
- **Aggregation key**: Use `asset.name` instead of `assetId` to unify re-purchased assets
- **Rationale**: When user sells asset (deletes document) and re-buys later, new Firestore doc gets new ID
- **Display logic**: `Map<name, metadata>` groups all instances with same name into single row
- **Badge "Venduto"**: Shows only if name NOT found in current portfolio (`isDeleted: true`)
- **React keys**: Use `asset.name` for stable keys across re-acquisitions
- **Edge case**: Different names (e.g., "Apple Inc." vs "Apple") → separate rows (user controlled)
- **Files**: `assetPriceHistoryUtils.ts` (aggregation), `AssetPriceHistoryTable.tsx` (display)
- **No DB migration**: Snapshots still save `assetId`, transformation happens at render time

### Server-Only Module Constraints (Firebase)
When implementing features requiring Firebase data access:
- **Pattern**: Client Components cannot import modules with `'server-only'` directive
- **Solution**: Create API route for server-side operations, fetch from client
- **Performance**: Use `Promise.all` to parallelize multiple API calls

---

## Common Errors to Avoid

### Date Range Query Errors
**Sintomo**: Missing last day in Firestore results
**Causa**: End date missing time component (cuts at midnight)
**Soluzione**: `new Date(year, month, 0, 23, 59, 59, 999)`

### React Query Incomplete Cache Invalidation
**Sintomo**: Stale UI after mutation
**Soluzione**: Invalidate all related caches (direct + indirect dependencies)

### Firestore Nested Object Deletion Not Persisting
**Sintomo**: Deleted nested keys reappear after page reload (e.g., removed subcategories come back)
**Causa**: Firestore `merge: true` does RECURSIVE merge - even new objects get merged with old data
**Debug time**: >2 hours (tried multiple approaches before discovering root cause)
**Soluzione**:
```typescript
// For nested object deletions, use GET + setDoc WITHOUT merge:
const existingDoc = await getDoc(ref);
const existingData = existingDoc.exists() ? existingDoc.data() : {};
const docData = { ...existingData, targets: newTargets, updatedAt: Timestamp.now() };
await setDoc(ref, docData); // NO { merge: true }
```
**Prevenzione**: Use `merge: true` for partial updates, but NOT for nested object key deletions

### Firestore User Data Loss During Updates
**Sintomo**: User-managed data (notes, configurations) disappears after calculated data updates (rankings, statistics)
**Causa**: Document update initializes user fields with empty values, causing overwrite
**Debug time**: Immediate recognition if familiar with pattern, but critical data loss if missed
**Soluzione**:
```typescript
// GET existing document BEFORE writing
const existingDoc = await getDoc(docRef);
const existingUserData = existingDoc.exists()
  ? (existingDoc.data()?.userManagedField || [])
  : [];

// SET with preserved user data
await setDoc(docRef, {
  ...calculatedData,
  userManagedField: existingUserData,
});
```
**Prevenzione**:
- NEVER initialize user-managed fields in calculated data objects
- Always GET before SET when document mixes calculated + user-managed data
- Test "update calculated data → verify user data still exists" end-to-end
- Watch for client/server function duplications with divergent implementations

### Timezone Boundary Bugs (Server vs Client)
**Sintomo**: Entries in wrong month when server (UTC) vs client (CET) near midnight
**Causa**: `Date.getMonth()` is timezone-dependent
**Debug time**: ~1 hour to identify timezone mismatch
**Soluzione**: Use `getItalyMonthYear()` from `dateHelpers.ts` (NOT `Date.getMonth()`)
**Test**: `TZ=UTC npm run dev` to simulate production

### Settings Persistence Bugs (Service Layer Incomplete)
**Sintomo**: UI toggles/inputs save correctly but reset to defaults after page reload
**Causa**: Type definition includes new field, but service layer doesn't read/write it from Firestore
**Debug time**: ~30min identifying service layer was missing field handling
**Soluzione**: Update BOTH `getSettings()` (read) and `setSettings()` (write) functions
**Debug checklist**:
1. Does field appear in Firestore? NO → setSettings not writing
2. Does UI show saved value after reload? NO → getSettings not reading
**Prevenzione**: Use three-place rule pattern (see Settings Service Synchronization Pattern above)

### Radix UI Dialog with Conditional Mounting Auto-Trigger Bug
**Sintomo**: Dialog opens but callback functions don't fire (e.g., auto-fetch on open doesn't trigger)
**Causa**: When component is rendered conditionally with `open={true}` from start, `onOpenChange` callback never fires (no state transition from `false` to `true`)
**Debug time**: ~1 hour (checked API, checked network, added extensive logging before discovering root cause)
**Soluzione**: Use `useEffect` with `open` dependency instead of relying on `onOpenChange` callback
```typescript
// ❌ WRONG: Callback won't fire if component mounted with open={true}
const handleOpenChange = (newOpen: boolean) => {
  onOpenChange(newOpen);
  if (newOpen && !data) {
    fetchData();  // Never runs if mounted with open={true}
  }
};

// ✅ CORRECT: useEffect detects when dialog is open
useEffect(() => {
  if (open && !data && !loading) {
    fetchData();
  }
}, [open]);
```
**Prevenzione**: For side effects on dialog open (fetch, logging, analytics), always use `useEffect(() => { ... }, [open])` instead of `onOpenChange` callbacks
**Note**: This is a common Radix UI pattern - when conditionally rendering dialogs with `{condition && <Dialog open={true} ...>}`, the open prop is already true on mount

### Anthropic Claude Knowledge Cutoff Pattern
**Pattern**: Provide current date in prompt for time-sensitive analysis
**Use case**: When Claude needs to analyze historical periods beyond its knowledge cutoff (January 2025)
**Implementation**:
```typescript
// Server (API route): Include current date at start of prompt
function buildAnalysisPrompt(metrics: any, timePeriod: string): string {
  const today = format(new Date(), 'dd/MM/yyyy', { locale: it });

  return `Oggi è il ${today}. Sei un esperto analista finanziario italiano.
  Analizza le seguenti metriche di performance del portafoglio per il periodo ${periodLabel}...`;
}
```
**Why critical**: Without explicit date context, Claude treats dates beyond January 2025 as "future" and cannot analyze market events or provide historical context
**Result**: Claude correctly interprets analysis periods (e.g., "feb 25 - gen 26") as past and provides relevant market event context
**Files**: `app/api/ai/analyze-performance/route.ts`

### Anthropic API Streaming SSE Pattern
**Pattern**: Server-Sent Events for progressive text generation
**Use case**: AI-powered analysis with real-time streaming (Performance page)
**Implementation**:
```typescript
// Server (API route): Return ReadableStream with 'text/event-stream' content type
const encoder = new TextEncoder();
const readableStream = new ReadableStream({
  async start(controller) {
    for await (const chunk of anthropicStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
      }
    }
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  },
});

return new NextResponse(readableStream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});

// Client: Use fetch + ReadableStream reader to parse chunks
const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  // Process complete SSE messages (delimited by \n\n)
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';  // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(data);
      if (parsed.text) {
        setAnalysis((prev) => prev + parsed.text);  // Progressive rendering
      }
    }
  }
}
```
**Why critical**: Allows real-time UI updates without waiting for full response (~5-10s), improves perceived performance
**Buffer handling**: Split by `\n\n`, keep incomplete lines in buffer to prevent parse errors on partial chunks
**Error handling**: Stream errors don't crash API route (try-catch in start()), client shows error banner on failure
**Files**: `app/api/ai/analyze-performance/route.ts`, `components/performance/AIAnalysisDialog.tsx`

### Radix UI Select Empty String Value Error
**Sintomo**: Runtime error "Select.Item must have a value prop that is not an empty string"
**Causa**: Radix UI Select doesn't allow `value=""` (empty string) as valid SelectItem value
**Soluzione**:
```typescript
// ❌ WRONG: Empty string not allowed
<SelectItem value="">Nessuno</SelectItem>

// ✅ CORRECT: Use undefined for unselected state, rely on placeholder
<Select
  value={selectedMonth?.toString() || undefined}
  onValueChange={(value) => setSelectedMonth(value ? Number(value) : null)}
>
  <SelectTrigger>
    <SelectValue placeholder="Seleziona mese" />
  </SelectTrigger>
  <SelectContent>
    {ITALIAN_MONTHS.map((month, idx) => (
      <SelectItem key={idx + 1} value={(idx + 1).toString()}>
        {month}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```
**Prevenzione**: For optional fields in Radix Select, use `undefined` instead of empty string and rely on placeholder
**Why**: Radix enforces this to avoid ambiguity between "no value selected" vs "empty value selected"

### Local Scripts with tsx/dotenv Environment Variables
**Sintomo**: Script fails with "Could not load default credentials" despite `.env.local` existing
**Causa**: `tsx` doesn't automatically load `.env.local` files, Firebase Admin SDK initializes before env vars are loaded
**Soluzione**: For one-time local scripts, use service account JSON file directly instead of env vars
```typescript
// ❌ WRONG: Relying on .env.local with tsx
import { adminDb } from '../lib/firebase/admin'; // Initializes before env vars loaded

// ✅ CORRECT: Load service account JSON directly
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccount = JSON.parse(
  readFileSync(join(process.cwd(), 'firebase-admin-key.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const adminDb = getFirestore();
```
**Why**: Simpler and more reliable for one-time migration/maintenance scripts
**Security**: Add `firebase-admin-key.json` to `.gitignore`, delete after use, or revoke key from Firebase Console
**Alternative**: If env vars needed, use `dotenv.config()` BEFORE importing Firebase modules, but JSON approach is cleaner

---

## Key Files
- **Utils**: `lib/utils/dateHelpers.ts`, `formatters.ts`, `assetPriceHistoryUtils.ts`
- **Services**: `performanceService.ts`, `assetAllocationService.ts`, `currencyConversionService.ts`, `chartService.ts`
- **API Routes**: `app/api/performance/yoc/route.ts`
- **Components**: `CashflowSankeyChart.tsx`, `MetricSection.tsx`, `FireCalculatorTab.tsx`
- **Pages**: `app/dashboard/settings/page.tsx`, `history/page.tsx`

**Last updated**: 2026-01-28
