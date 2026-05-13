# JustETF Scraping — Geographic & Currency Exposure (v2)

**Status**: Spec — not yet implemented
**Depends on**: v1 Portfolio Exposure feature (`/dashboard/allocation` → "Esposizione Portfolio")
**Goal**: add two new tabs to the Esposizione Portfolio section — **"Esposizione geografica"** and **"Esposizione valutaria"** — populated from JustETF data scraped by ISIN.

---

## 1. Why JustETF

Yahoo Finance does not expose:
- Geographic breakdown per ETF (country / region weights)
- Currency breakdown per ETF (CHF / EUR / USD / JPY / etc.)

JustETF publishes both on the public ETF profile page, keyed by ISIN. The `Asset` type already has the optional field `isin?: string` so ETF identification is solved.

**ToS caveat**: JustETF terms forbid automated scraping. This feature is acceptable for personal/non-commercial use of the app but **must be behind a feature flag** and ship with an explicit disclaimer ("uso personale, dati non garantiti, fonte JustETF"). For any future public/SaaS deployment, replace with a licensed feed (Morningstar, Refinitiv).

---

## 2. Scope

### In scope (v2)
- Scrape JustETF etf-profile.html for geographic + currency breakdowns by ISIN
- Per-ISIN Firestore cache (shared across users, 30-day TTL)
- Integrate into `lib/server/portfolioExposureService.ts` — aggregate weighted across all ETFs the same way sectors already are
- Two new tabs in `ExposureSection.tsx`
- Fallback: ETFs without ISIN, missing JustETF data, or scraping failures are silently skipped (same pattern as Yahoo Finance unknown-ticker handling)
- Feature flag `NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED` (default `false`)

### Out of scope (v3+)
- Bond rating / duration breakdown (different JustETF section)
- Replication method / TER scraping
- Forcing JustETF data to override Yahoo Finance holdings/sectors (we keep Yahoo as source of truth for those; JustETF is additive)
- UI for the user to manually correct/override scraped geographic data
- Multi-language scraping (only `/it/` URL, since the app is Italian-only)

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ GET /api/portfolio/exposure                                     │
│                                                                  │
│  ┌─ requireFirebaseAuth                                          │
│  ├─ getUserAssetsAdmin(userId)                                   │
│  ├─ check exposure-cache/{userId} → hit → return                 │
│  └─ cache miss → computePortfolioExposure(assets)                │
│                                                                  │
│      ┌──────────────────────────────────────────────────────┐    │
│      │ computePortfolioExposure (unchanged sectors path)    │    │
│      │   yahooFinance.quoteSummary(...) ───┐                │    │
│      │                                     ▼                │    │
│      │   aggregate topHoldings / sectors / issuers          │    │
│      │                                                      │    │
│      │ NEW: per ETF with isin AND feature flag enabled:     │    │
│      │   fetchJustEtfBreakdown(isin) ──┐                    │    │
│      │                                 ▼                    │    │
│      │   aggregate countries / currencies                   │    │
│      └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘

       │
       ▼
┌──────────────────────────────────┐
│ lib/server/justetfScraperService │
│   fetchJustEtfBreakdown(isin)    │
│     1. read justetf-cache/{isin} │
│     2. if fresh → return         │
│     3. else fetch + parse + cache│
└──────────────────────────────────┘
```

**Dependency direction**: the existing `portfolioExposureService.ts` is the orchestrator. `justetfScraperService.ts` is a new sibling under `lib/server/`. They do not import each other except in the orchestration direction (`exposureService` → `scraperService`).

---

## 4. JustETF page structure

### URL

```
https://www.justetf.com/it/etf-profile.html?isin={ISIN}
```

Example: `https://www.justetf.com/it/etf-profile.html?isin=IE00B4L5Y983` (SWDA / iShares Core MSCI World).

### Page layout

The profile page is server-rendered HTML with JS hydration. The breakdowns we need are present in the initial HTML — **no JS execution needed**, so `fetch` + `cheerio` is enough.

Sections relevant to us:

| Section | Anchor / heading | Data shape |
|---------|------------------|------------|
| Composizione (paesi) | `<h2>Composizione (paesi)</h2>` or `id="country"` | `[{country: string, weight: number}]` |
| Composizione (valute) | `<h2>Composizione (valute)</h2>` or `id="currency"` | `[{currency: string, weight: number}]` |
| Composizione (settori) | (already covered by Yahoo) | — |
| Top 10 posizioni | (already covered by Yahoo) | — |

### Concrete HTML pattern (as of writing this spec — verify in DevTools before implementing)

The breakdown tables on JustETF have a consistent shape:

```html
<div class="vallist">
  <table>
    <tbody>
      <tr>
        <td class="vallabel">Stati Uniti</td>
        <td class="val">66,21%</td>
      </tr>
      <tr>
        <td class="vallabel">Giappone</td>
        <td class="val">5,87%</td>
      </tr>
      ...
    </tbody>
  </table>
</div>
```

Each breakdown section sits inside a parent block identifiable by a heading text or an `id` attribute. The **safest selector strategy** is two-step:

1. Find the heading element by text match (`h2:contains("Composizione (paesi)")` or similar).
2. From that heading, walk to the next sibling table or container and extract `<tr>` rows.

```ts
// Pseudo-code with cheerio:
const countryHeading = $('h2, h3').filter((_, el) =>
  $(el).text().trim().toLowerCase().includes('paesi') ||
  $(el).text().trim().toLowerCase().includes('country')
).first();

const countryTable = countryHeading.nextAll('table, .vallist').first();
const countries = countryTable.find('tr').map((_, tr) => {
  const label = $(tr).find('td').eq(0).text().trim();
  const pctText = $(tr).find('td').eq(1).text().trim();
  return { country: label, weight: parseItalianPercent(pctText) };
}).get();
```

### Italian number parsing

JustETF uses Italian formatting: `66,21%`. Reuse the existing parsing helper in `borsaItalianaScraperService.ts` (period thousands, comma decimal) or inline a simple `parseFloat(pctText.replace('%', '').replace(',', '.')) / 100` to get a normalized 0–1 weight.

### Edge cases on the page

- **Synthetic ETFs** sometimes hide country breakdown behind a swap counterparty disclosure — table may be absent. Handle as "data unavailable".
- **Bond ETFs** show issuer-country breakdown rather than equity-domicile breakdown. For v2 we accept that and aggregate it into the same map — geographic mixing is intentional.
- **Multi-asset ETFs** show 100% in a single bucket per asset class. Acceptable.
- **Currency hedged ETFs**: JustETF shows the currency of the underlying assets, not the hedge currency. This is what we want (we are measuring underlying exposure).

---

## 5. New files

### 5.1 `lib/server/justetfScraperService.ts`

```ts
import * as cheerio from 'cheerio';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const JUSTETF_CACHE_COLLECTION = 'justetf-cache';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface JustEtfBreakdownEntry {
  label: string;     // e.g. "Stati Uniti", "USD"
  weight: number;    // 0..1
}

export interface JustEtfBreakdown {
  isin: string;
  countries: JustEtfBreakdownEntry[];
  currencies: JustEtfBreakdownEntry[];
  fetchedAt: string; // ISO
  /** True if we returned cached data, false if freshly scraped this call. */
  cached: boolean;
}

/**
 * Fetch JustETF country + currency breakdown for one ISIN.
 *
 * - Reads Firestore cache first; on hit within TTL, returns cached data.
 * - On cache miss, fetches HTML, parses with cheerio, writes cache.
 * - On any error (network, parse, ToS block), returns null. Caller MUST treat
 *   null as "data unavailable for this ETF" and continue.
 *
 * Never throws — always returns a value or null.
 */
export async function fetchJustEtfBreakdown(
  isin: string
): Promise<JustEtfBreakdown | null> {
  // 1. cache read
  // 2. cache hit + fresh → return
  // 3. fetch HTML with User-Agent + AbortController(15s)
  // 4. parse with cheerio (see selectors above)
  // 5. fire-and-forget cache write
  // 6. return
}
```

**Implementation rules**:
- Always set the `User-Agent` header — JustETF returns a 403 to default Node fetch UA.
- Always use `AbortController` with a 15s timeout.
- `Promise.allSettled` is the caller's responsibility — this function fetches a single ISIN.
- Log failures with `console.error('[justetf]', isin, err)` but return `null`.
- ISIN normalization: uppercase, strip whitespace.

### 5.2 `types/exposure.ts` — additions

```ts
// Append to types/exposure.ts:

export interface ExposureCountry {
  country: string;        // "Stati Uniti", "Giappone", "Sconosciuto"
  exposureEur: number;
  exposurePct: number;
  sources: Array<{
    assetName: string;
    ticker: string;
    contributionEur: number;
  }>;
}

export interface ExposureCurrency {
  currency: string;       // "USD", "EUR", "JPY"
  exposureEur: number;
  exposurePct: number;
  sources: Array<{
    assetName: string;
    ticker: string;
    contributionEur: number;
  }>;
}

// Extend PortfolioExposureData:
export interface PortfolioExposureData {
  // ... existing fields ...
  countries: ExposureCountry[];   // [] when feature flag is off OR no JustETF data
  currencies: ExposureCurrency[]; // same
  /** True when the JustETF feature flag was on for this computation. */
  justEtfEnabled: boolean;
}
```

The `justEtfEnabled` flag lets the UI decide whether to render the new tabs at all.

---

## 6. Changes to `lib/server/portfolioExposureService.ts`

### 6.1 New helper

```ts
async function fetchJustEtfDataForEtfs(
  etfAssets: Asset[]
): Promise<Map<string, JustEtfBreakdown>> {
  const map = new Map<string, JustEtfBreakdown>();
  const eligible = etfAssets.filter((a) => a.isin && a.isin.trim().length > 0);

  // Parallel fetch with Promise.allSettled. Each call is itself cache-aware,
  // so the cost is bounded even on cache-cold first run (parallel HTTP).
  const results = await Promise.allSettled(
    eligible.map((a) =>
      fetchJustEtfBreakdown(a.isin!).then((b) => ({ assetId: a.id, breakdown: b }))
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.breakdown) {
      map.set(r.value.assetId, r.value.breakdown);
    }
  }
  return map;
}
```

### 6.2 Aggregation logic (geographic)

After the existing sectors aggregation:

```ts
const countryMap = new Map<string, { exposureEur: number; sources: ExposureCountry['sources'] }>();

for (const asset of etfAssets) {
  const breakdown = justEtfData.get(asset.id);
  if (!breakdown) continue;
  const assetValue = assetValues.get(asset.id) ?? 0;
  for (const entry of breakdown.countries) {
    if (entry.weight <= 0) continue;
    const contribution = entry.weight * assetValue;
    const existing = countryMap.get(entry.label);
    if (existing) {
      existing.exposureEur += contribution;
      existing.sources.push({ assetName: asset.name, ticker: asset.ticker, contributionEur: contribution });
    } else {
      countryMap.set(entry.label, {
        exposureEur: contribution,
        sources: [{ assetName: asset.name, ticker: asset.ticker, contributionEur: contribution }],
      });
    }
  }
}
```

Same shape for `currencyMap` from `breakdown.currencies`.

### 6.3 Direct stocks geographic attribution

Stocks (`type === 'stock'`) don't have a JustETF profile. Two options:

- **Option A (cheap)**: classify stocks as `"Sconosciuto"` for country. Simple, but pollutes the geographic chart.
- **Option B (preferred)**: extend the Yahoo Finance call to also include the `assetProfile` module — that already returns `country` for individual stocks. Add the stock's full `assetValueEur` to that country.

Implement Option B. It's two additional fields in the existing `quoteSummary` modules call (no extra HTTP request).

For currency attribution of direct stocks: use `asset.currency` (already on the Asset). USD-listed stock → USD bucket, etc.

### 6.4 Cache key

The exposure cache key already encodes ETF composition + total value. **Add `justEtfEnabled` to the key**:

```
{etfCount}-{sortedTickers}-{roundedValue}-{justEtfEnabled ? 'je1' : 'je0'}
```

Otherwise flipping the feature flag wouldn't invalidate stale cached results.

---

## 7. Feature flag

| Variable | Default | Effect |
|----------|---------|--------|
| `NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED` | `false` | When `false`, `portfolioExposureService` skips JustETF entirely. `PortfolioExposureData.justEtfEnabled` is set accordingly. |

The flag must be readable both server-side (the API route lives in `app/api/...`, so `process.env.NEXT_PUBLIC_*` works) and at build time so client-side UI logic can pre-render correctly.

In the API route handler, before computing exposure:

```ts
const justEtfEnabled =
  process.env.NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED === 'true';
```

Pass it explicitly into `computePortfolioExposure(assets, { justEtfEnabled })`.

---

## 8. Firestore rules

Add to `firestore.rules`:

```
// Collezione justetf-cache - breakdown per ISIN scrapato da JustETF (dato globale)
// Document ID == ISIN; nessun campo userId.
// Leggibile da qualsiasi utente autenticato; scrivibile solo via Admin SDK.
match /justetf-cache/{isin} {
  allow read: if isAuthenticated();
  allow write: if false;
}
```

This mirrors the `benchmark-cache` / `fx-rate-cache` / `ecb-rate-cache` patterns documented in AGENTS.md (Global Shared Firestore Cache).

---

## 9. UI changes

### 9.1 `components/allocation/ExposureSection.tsx`

Add two new tabs **only when `data.exposure.justEtfEnabled === true`**:

```tsx
<TabsList>
  <TabsTrigger value="holdings">Principali Holdings</TabsTrigger>
  <TabsTrigger value="sectors">Settori</TabsTrigger>
  {exposure.justEtfEnabled && (
    <>
      <TabsTrigger value="countries">Paesi</TabsTrigger>
      <TabsTrigger value="currencies">Valute</TabsTrigger>
    </>
  )}
  <TabsTrigger value="issuers">Emittenti ETF</TabsTrigger>
</TabsList>
```

Tab content follows the existing `SectorList` / `IssuerList` pattern: a list of rows with progress bar, % and EUR value.

### 9.2 Disclaimer copy

Append to the existing disclaimer paragraph at the bottom of the card:

> "I dati geografici e valutari sono basati sui factsheet pubblicati da JustETF. Le percentuali rappresentano l'esposizione sottostante (non l'eventuale copertura valutaria attiva sull'ETF)."

### 9.3 Empty state

If `exposure.countries.length === 0` despite `justEtfEnabled === true` (all ETFs missing ISIN or scraping failed):

> "Nessun dato JustETF disponibile. Aggiungi un ISIN agli ETF dal pannello asset per attivare l'analisi geografica."

---

## 10. Rate limiting & politeness

JustETF should be treated as a courtesy guest, not a free API.

1. **Aggressive caching**: 30-day TTL per ISIN. ETF allocations change quarterly at most; 30 days is generous and ToS-friendly.
2. **Shared cache across users**: same `justetf-cache/{isin}` document serves every user. A user with the same ETF as another user pays zero network cost.
3. **Parallel within a single user request only**: never run a background batch scraper for the whole catalog. Scrape only what an authenticated user actively requests.
4. **No retry on failure within the same request**: one shot, if it fails the ETF is excluded for that computation. Next time the user refreshes, it'll try again.
5. **User-Agent** that identifies as a real browser (set in code, see §5.1).

If JustETF starts returning 429 / 403, fall back to silent skip — never surface the error message to the end user (it can include "blocked"-style text we don't want to display).

---

## 11. Error handling

Failure modes and behavior:

| Failure | Behavior |
|---------|----------|
| ETF has no `isin` field | Skip silently. The asset still contributes to holdings/sectors/issuers as before. |
| JustETF returns 4xx/5xx | `fetchJustEtfBreakdown` returns `null`; ETF excluded from countries/currencies aggregation. |
| HTML structure unexpectedly empty for one section | Return what we have (e.g., empty `currencies`, valid `countries`). |
| HTML structure unexpectedly empty for both sections | Treat as parse failure → return `null`. |
| Cache write fails (Firestore quota / permission) | Log, continue. Result is returned without caching. |
| Feature flag off | Skip the entire `fetchJustEtfDataForEtfs` step. `countries`/`currencies` are empty arrays. `justEtfEnabled: false`. |

Never let JustETF failure block the rest of the exposure response.

---

## 12. Testing

### 12.1 Unit tests

Create `__tests__/justetfScraper.test.ts`:

- **Parser test**: feed a real `etf-profile.html` (committed under `__tests__/fixtures/justetf-swda.html`) and assert the parser returns the expected country/currency arrays. Use a fixture from `Mozilla/5.0` UA fetch saved to disk, NOT a live network call.
- **Italian percent parsing**: `66,21%` → `0.6621`; `0,5%` → `0.005`; edge `100,00%` → `1`.
- **Heading match fallback**: if the primary `h2#country` is absent, the text-based fallback still finds the country section.
- **Empty section**: feed an HTML with only the currency section; assert `countries === []` and `currencies` populated.
- **Malformed HTML**: feed `"<html></html>"`; assert function returns `null`.

### 12.2 Service test

Create `__tests__/portfolioExposureService.test.ts`:

- Mock `fetchJustEtfBreakdown` to return canned `JustEtfBreakdown` per ISIN.
- Provide 3 fake ETF assets with different `assetValueEur` and overlapping country buckets.
- Assert aggregation: `countries[0].exposureEur === sum of weight * assetValueEur per asset`.
- Assert `sources` correctly attribute contributions back to each asset.
- Assert feature flag off → empty `countries` array and `justEtfEnabled: false`.

### 12.3 Manual / E2E

1. Set `NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED=true` in `.env.local`.
2. Have at least one ETF asset with an ISIN filled in (e.g. SWDA `IE00B4L5Y983`).
3. Open `/dashboard/allocation`, expand Esposizione Portfolio.
4. Verify "Paesi" and "Valute" tabs appear and contain plausible data.
5. Check Firestore: `justetf-cache/IE00B4L5Y983` exists with `countries`, `currencies`, `fetchedAt`, no `userId`.
6. Click "Aggiorna" → second request must be a cache hit on the JustETF side (verify by logging in `fetchJustEtfBreakdown` that the function returned within ~10 ms, not network time).
7. Turn flag off → reload → tabs disappear, exposure cache key changes from `...je1` to `...je0`, recomputed result has no countries/currencies.

---

## 13. Implementation phases

Do these in order; each is a separate commit so reviewers can verify in isolation.
Each phase is meant to be run in its own Claude Code session — the suggested prompts below are self-contained (no prior conversation context required) and point at the relevant sections of this spec.

---

### Phase 1 — Scraper service + tests

**Scope**:
- `lib/server/justetfScraperService.ts`
- `__tests__/justetfScraper.test.ts` + fixture HTML at `__tests__/fixtures/justetf-swda.html`
- `firestore.rules` additions (the `justetf-cache` collection)
- **No** integration with exposure service yet. The function exists, has tests, doesn't run from any user flow.

**Suggested prompt**:
```
Implementa la Fase 1 della spec descritta in docs/justetf-exposure-v2-spec.md.
Concentrati esclusivamente su:
  - lib/server/justetfScraperService.ts (vedi §4 per i selettori cheerio,
    §5.1 per lo skeleton, §10 per User-Agent e timeouts, §11 per error handling)
  - __tests__/justetfScraper.test.ts con la fixture
    __tests__/fixtures/justetf-swda.html (salva una vera pagina JustETF
    fetchata con un User-Agent browser, vedi §12.1)
  - firestore.rules: aggiungi la regola justetf-cache (§8)

NON modificare portfolioExposureService.ts, ExposureSection.tsx, types/exposure.ts
o l'API route in questa fase. La funzione fetchJustEtfBreakdown deve esistere ed
essere testata ma non essere chiamata da nessun user flow.

Al termine:
  - npx tsc --noEmit deve passare
  - npx vitest run __tests__/justetfScraper.test.ts deve passare
  - commit + push sul branch corrente
```

---

### Phase 2 — Types & feature flag wiring

**Scope**:
- `types/exposure.ts` additions (`ExposureCountry`, `ExposureCurrency`, `countries`/`currencies`/`justEtfEnabled` on `PortfolioExposureData`)
- Feature flag read in `app/api/portfolio/exposure/route.ts`
- Pass `{ justEtfEnabled }` option to `computePortfolioExposure`
- `computePortfolioExposure` accepts the option but for now just sets `countries: []`, `currencies: []`, `justEtfEnabled`
- Cache key now includes the flag suffix (`je0`/`je1`)
- `.env.example` documents the new variable

**Suggested prompt**:
```
Implementa la Fase 2 della spec descritta in docs/justetf-exposure-v2-spec.md.
Presupponi che la Fase 1 sia già completata (lib/server/justetfScraperService.ts
esiste e ha test passanti, ma non è chiamata da nessuna parte).

Concentrati su:
  - types/exposure.ts: aggiungi i tipi ExposureCountry e ExposureCurrency e
    estendi PortfolioExposureData con countries, currencies, justEtfEnabled
    (vedi §5.2)
  - app/api/portfolio/exposure/route.ts: leggi
    process.env.NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED === 'true' e passalo
    come opzione { justEtfEnabled } a computePortfolioExposure (vedi §7)
  - lib/server/portfolioExposureService.ts: la firma diventa
    computePortfolioExposure(assets, opts?: { justEtfEnabled?: boolean }).
    Per ora ritorna countries: [], currencies: [] e propaga justEtfEnabled
    nel result. NON chiamare ancora fetchJustEtfBreakdown.
  - cacheKey: aggiungi il suffisso -je0 / -je1 in modo che flippare il flag
    invalidi automaticamente la cache utente (vedi §6.4)
  - .env.example: documenta NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED

NON toccare la UI in questa fase. ExposureSection.tsx resta invariato.

Al termine:
  - npx tsc --noEmit deve passare
  - commit + push
```

---

### Phase 3 — Aggregation

**Scope**:
- Wire `fetchJustEtfDataForEtfs` into `computePortfolioExposure`
- Aggregate `countries` + `currencies` maps following the pattern in §6.2
- Extend Yahoo `quoteSummary` modules to include `assetProfile` for direct stocks (country + currency attribution per §6.3 Option B)
- Unit test the aggregation per §12.2

**Suggested prompt**:
```
Implementa la Fase 3 della spec descritta in docs/justetf-exposure-v2-spec.md.
Presupponi che le Fasi 1 e 2 siano completate: fetchJustEtfBreakdown esiste con
i suoi test, i tipi sono in types/exposure.ts, il feature flag è propagato
dall'API route a computePortfolioExposure ma non viene ancora usato per fare
fetch reali.

Concentrati su:
  - lib/server/portfolioExposureService.ts:
    1. Aggiungi l'helper fetchJustEtfDataForEtfs(etfAssets) (§6.1) che usa
       Promise.allSettled su tutti gli ETF con isin valorizzato
    2. Esegui l'helper SOLO quando opts.justEtfEnabled === true
    3. Aggrega countryMap e currencyMap come nel pattern di §6.2
       (stessa struttura del settoriale esistente)
    4. Per le azioni dirette (type === 'stock'): aggiungi 'assetProfile' ai
       modules di quoteSummary già richiesti e usa il country/currency del
       profilo per attribuire il 100% del valore dell'asset (§6.3 Option B)
    5. Popola countries/currencies nel result, ordinati per exposureEur desc
  - __tests__/portfolioExposureService.test.ts: crea il file con i test
    descritti in §12.2 (mock di fetchJustEtfBreakdown, 3 ETF fake, asserzioni
    sull'aggregazione e sulle sources, flag off → array vuoti)

NON toccare la UI in questa fase.

Al termine:
  - npx tsc --noEmit deve passare
  - npx vitest run __tests__/portfolioExposureService.test.ts deve passare
  - commit + push
```

---

### Phase 4 — UI

**Scope**:
- Two new tabs in `ExposureSection.tsx` rendered **conditionally** on `exposure.justEtfEnabled`
- New `CountryList` and `CurrencyList` row components (or one shared, parameterized)
- Empty state copy per §9.3
- Updated disclaimer copy per §9.2
- Tabs reuse the existing `<ExposureBar>` and row layout — keep new code minimal

**Suggested prompt**:
```
Implementa la Fase 4 della spec descritta in docs/justetf-exposure-v2-spec.md.
Presupponi che le Fasi 1–3 siano completate: il backend già restituisce
countries[] e currencies[] popolati quando NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED
è true.

Concentrati su components/allocation/ExposureSection.tsx:
  - Aggiungi due TabsTrigger ("Paesi" e "Valute") tra "Settori" e "Emittenti
    ETF", visibili SOLO quando exposure.justEtfEnabled === true (§9.1)
  - Implementa CountryList e CurrencyList come componenti row identici a
    SectorList già esistente nel file (stesso layout, stessa ExposureBar, no
    drill-down sources per le valute — facoltativo per i paesi)
  - Empty state quando justEtfEnabled è true ma countries è vuoto: copy in §9.3
  - Aggiorna la copy del disclaimer in fondo alla card aggiungendo il paragrafo
    in §9.2

NON modificare il backend, i tipi, l'API route, o il service. Lavora solo
sul componente UI.

Per testare manualmente: imposta NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED=true in
.env.local, riavvia npm run dev, apri /dashboard/allocation, espandi
"Esposizione Portfolio". Servono asset ETF con ISIN valorizzato.

Al termine:
  - npx tsc --noEmit deve passare
  - commit + push
```

---

### Phase 5 — Polish & docs

**Scope**:
- Update `CLAUDE.md` "Latest implementation" line + the existing `Esposizione Portfolio (2026-05-13)` entry to mention v2 additions
- Update `SESSION_NOTES.md`
- Manual E2E walkthrough as per §12.3 and capture any rough edges
- (Optional) Update the disclaimer wording based on what real data looks like

**Suggested prompt**:
```
Implementa la Fase 5 della spec descritta in docs/justetf-exposure-v2-spec.md.
Le Fasi 1–4 sono completate, la feature gira end-to-end dietro al flag
NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED.

Lavoro da fare:
  - CLAUDE.md: aggiorna la "Latest implementation" section con la nuova v2 ed
    estendi la riga esistente "Esposizione Portfolio (2026-05-13)" menzionando
    i due nuovi tab Paesi/Valute, il flag, e il file dei tipi
  - SESSION_NOTES.md: aggiungi una nuova sezione "JustETF v2" con: file
    creati/modificati, decisioni prese, limitazioni note (vedi §15, §17 dello
    spec)
  - Esegui manualmente il walkthrough di §12.3 e annota eventuali problemi
    riscontrati. Se trovi bug minori (es. label paesi tradotti male, percentuali
    troncate, ETF che falliscono in modo non documentato), aprili come piccoli
    fix nello stesso commit. Bug grossi → segnalali e fermati.

Al termine:
  - npx tsc --noEmit deve passare
  - commit + push
```

---

## 14. Files touched (final summary)

### New
- `lib/server/justetfScraperService.ts`
- `__tests__/justetfScraper.test.ts`
- `__tests__/fixtures/justetf-swda.html` (golden HTML)
- `__tests__/portfolioExposureService.test.ts` *(if not yet created in v1)*

### Modified
- `types/exposure.ts` (new types + extended `PortfolioExposureData`)
- `lib/server/portfolioExposureService.ts` (new branch for countries/currencies, extended Yahoo modules)
- `app/api/portfolio/exposure/route.ts` (read feature flag, pass option)
- `components/allocation/ExposureSection.tsx` (two new tabs, conditional)
- `firestore.rules` (`justetf-cache` collection)
- `CLAUDE.md` (latest implementation line)
- `.env.example` (document `NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED`)

---

## 15. Open questions / decisions to confirm before implementing

1. **Country label language**: JustETF Italian site returns "Stati Uniti", "Regno Unito", etc. We keep them as-is (the app UI is Italian). Confirm acceptable.
2. **Aggregation across stock + ETF currencies**: a USD-listed stock contributes 100% to USD. A EUR-listed S&P 500 ETF contributes mostly USD (because JustETF reports underlying currency). They sum correctly. Confirm this is the intended semantics — yes, it represents true underlying currency exposure.
3. **What if an ETF's ISIN exists in our DB but JustETF doesn't have a profile for it?** (e.g. very new ETF). Treat as `null` return → skipped. No special UI signal.
4. **Cache invalidation on portfolio change**: the per-ISIN JustETF cache (30d) is independent from per-user `exposure-cache` (24h). Adding/removing an ETF invalidates the user-level cache; the ISIN-level cache is unaffected (same ISIN, same data). Correct.
5. **GDPR / personal data**: JustETF cache contains no user data, only ETF metadata. No GDPR implications. Confirm with project owner before shipping publicly.
6. **Bundle impact**: `cheerio` is already in the dependency tree (used by Borsa Italiana scrapers). No new heavy deps.

---

## 16. Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| JustETF changes HTML structure | Medium | Heading-based fallback selectors; golden HTML fixture tests catch regressions early; users still see Yahoo-sourced data (holdings/sectors/issuers) when JustETF parsing fails |
| JustETF rate-limits or blocks us | Low (30d cache, parallel only within request) | Silent fallback to "data unavailable"; consider exponential backoff on cache TTL after 429 |
| ToS challenge | Low (personal use) | Feature flag default `false`; clear disclaimer in the UI; documented "personal use" intent in README; ready to disable globally |
| Cache poisoning if JustETF returns garbage HTML one time | Low | Parser validates `weight` is `0..1` and `label` is non-empty before writing cache; partial parse failures return `null` rather than empty arrays |
| Stale data after an ETF reorganises holdings | Medium | 30-day TTL caps staleness; user-triggered "Aggiorna" still hits the JustETF cache (not the source) so it won't help; document this trade-off in the disclaimer |

---

## 17. Future work (v3+)

- **User-driven cache refresh** for an individual ISIN (small "↻" button next to the country/currency badge)
- **Bond rating / duration breakdown** from JustETF for fixed-income ETFs
- **Geographic drill-down** by region (Nord America / Europa / Pacifico / Emergenti) computed by mapping country list to a region table — same UI pattern as the existing `AllocationCard` drill-down
- **Exclude FX-hedged ETFs from currency exposure** (currently they appear as their underlying currency, which over-states exposure for a hedged investor; needs explicit "hedged?" flag scraped from JustETF or set manually on Asset)
- **Manual override**: let the user edit a per-asset country/currency breakdown when JustETF data is wrong or missing (e.g., for direct stocks of holding companies whose true exposure differs from their listing country)
