# Security Review — Specifica di Implementazione

**Data review**: 2026-06-10
**Branch analizzato**: `develop` (commit `0670a47`)
**Metodo**: review statica completa di route API, regole Firestore, gestione segreti, superficie XSS/SSRF, validazione input, header HTTP, dipendenze (`npm audit --omit=dev`), endpoint AI e logging. Ogni finding è stato verificato manualmente sui sorgenti (file e righe citati sono reali alla data della review).

**Come usare questo documento**: ogni finding ha un capitolo con istruzioni di implementazione, criteri di accettazione, test richiesti e un **PROMPT pronto** da incollare in una nuova sessione di un modello AI (anche meno potente). Eseguire **un finding per PR**, nell'ordine della sezione [Ordine di esecuzione](#ordine-di-esecuzione-consigliato).

---

## 1. Executive Summary

La postura di sicurezza complessiva è **buona**: autenticazione centralizzata (`lib/server/apiAuth.ts`) usata da 25/30 route, `firestore.rules` con ownership per-utente e default deny, client che usa `authenticatedFetch` in modo coerente per tutte le route private, rendering Markdown dell'AI senza pass-through HTML, nessun segreto committato in git.

I problemi trovati sono mirati e tutti risolvibili con interventi contenuti:

| ID | Finding | Severità | Effort | PR suggerita |
|----|---------|----------|--------|--------------|
| SEC-1 | Endpoint prezzi pubblici senza autenticazione (proxy aperto verso Yahoo Finance / Borsa Italiana) | **ALTA** | S | ✅ implementato — branch `fix/sec-1-auth-price-endpoints` |
| SEC-2 | Confronto `CRON_SECRET` non timing-safe (3 punti) | MEDIA | S | `fix/sec-2-timing-safe-cron-secret` |
| SEC-3 | Nessuna validazione server-side dei body/query (zod installato ma inutilizzato lato server); ISIN interpolato in URL senza validazione | MEDIA | M | `fix/sec-3-server-input-validation` |
| SEC-4 | Nessun security header HTTP (CSP, HSTS, X-Frame-Options, ecc.) | MEDIA | S | `fix/sec-4-security-headers` |
| SEC-5 | Whitelist email di registrazione esposta nel bundle JS client (`NEXT_PUBLIC_*`) | MEDIA | S | `fix/sec-5-server-only-whitelist` |
| SEC-6 | 8 vulnerabilità moderate transitive (`uuid` via `firebase-admin`) | BASSA | S | `chore/sec-6-upgrade-firebase-admin` |
| SEC-7 | Rate limiting assente sugli endpoint AI (difesa in profondità, opzionale) | BASSA | M | `feat/sec-7-ai-rate-limit` |
| SEC-8 | Igiene: copertura test cron auth, logging di debug verboso nello scraper | BASSA | S | `chore/sec-8-test-logging-hygiene` |

Effort: S = < 1h per un modello AI, M = 1-3h.

---

## 2. Verifiche superate (nessun intervento richiesto)

Documentate perché le review future non ripartano da zero:

- **Segreti in git**: verificato con `git ls-files`, `git log --all -- '.env*'` e scansione pattern (`sk-ant-`, `AIzaSy`, `re_...`) su tutti i file tracciati. Solo `.env.local.example` (placeholder) è tracciato; `.gitignore` riga 34 (`.env*`) è efficace; nessun file env reale è mai stato committato in tutta la history. ⚠️ Nota di metodo: un agente di analisi aveva segnalato `.env.local` "committato con chiavi live" — era un **falso positivo** (aveva letto il file locale non tracciato). Le chiavi vive esistono solo sul disco locale, come previsto.
- **Auth delle route private**: tutte le 25 route private usano `requireFirebaseAuth` + `assertSameUser`/`assertResourceOwner` da `lib/server/apiAuth.ts`. Nessuna chiamata client con `fetch` semplice verso route private (`authenticatedFetch` usato ovunque tranne che per gli endpoint pubblici, vedi SEC-1).
- **Firestore rules** (`firestore.rules`): ownership per-utente su tutte le collection utente, cache globali read-only lato client (scritte solo via Admin SDK), catch-all `allow read, write: if false` finale.
- **XSS**: zero `dangerouslySetInnerHTML` nel codebase. L'output AI è renderizzato con `ReactMarkdown` + solo `remark-gfm` (niente `rehype-raw`, quindi l'HTML nel markdown non viene interpretato) in `AssistantStreamingResponse.tsx` e `AIAnalysisDialog.tsx`.
- **Email HTML** (`lib/server/monthlyEmailService.ts`, `weeklyBudgetEmailService.ts`): i dati utente passano per formattatori (`Intl.NumberFormat`) e conversione markdown→HTML controllata; nessun punto di iniezione HTML individuato.
- **Endpoint AI**: il contesto è costruito server-side da Firestore (non dal client); l'output del modello è solo testo persistito/visualizzato — nessun loop output→azione che possa eseguire scritture autonome; web search limitata (max 2-3 usi per richiesta).
- **Logging server**: nessun token, chiave o dato finanziario sensibile nei log (eccezioni minori in SEC-5 e SEC-8).

### Rischi accettati (non fixare)

- **Credenziali demo nel bundle** (`NEXT_PUBLIC_DEMO_EMAIL/PASSWORD`): scelta dichiarata in CLAUDE.md per il progetto Firebase demo non sensibile. Lasciare vuote le env var nasconde la CTA sui deploy self-hosted.
- **Firebase API key client-side** (`NEXT_PUBLIC_FIREBASE_API_KEY`): by design del client SDK Firebase; la protezione è data da Firebase Auth + Firestore rules, non dalla segretezza della chiave.
- **Assenza di `middleware.ts` globale**: l'auth per-route con helper condiviso è un pattern valido; non introdurre un middleware solo per principio.

---

## 3. Finding

### SEC-1 — Endpoint prezzi pubblici senza autenticazione (ALTA)

**File**: `app/api/prices/quote/route.ts`, `app/api/prices/bond-quote/route.ts`, `components/assets/AssetDialog.tsx` (righe ~129 e ~132)

**Problema**: `GET /api/prices/quote?ticker=...` e `GET /api/prices/bond-quote?isin=...` non hanno alcuna autenticazione. Chiunque su internet può usare il deployment come proxy gratuito verso Yahoo Finance e come trigger di scraping verso Borsa Italiana, con ticker/ISIN arbitrari. Rischi: abuso di risorse (costi/ban IP da parte di Yahoo o Borsa Italiana), amplificazione di richieste verso terzi dal tuo IP/dominio, e superficie aperta sul parametro non validato (vedi anche SEC-3).

**Soluzione**: richiedere il token Firebase su entrambe le route. Gli unici chiamanti sono in `AssetDialog.tsx` (utente già autenticato nella dashboard): basta migrare le due `fetch` semplici ad `authenticatedFetch`. Non serve `assertSameUser` (i dati restituiti sono dati di mercato pubblici, non dati utente): è sufficiente che il chiamante sia un utente autenticato dell'istanza.

**Istruzioni di implementazione**:
1. In `app/api/prices/quote/route.ts` e `app/api/prices/bond-quote/route.ts`: importare `requireFirebaseAuth` e `getApiAuthErrorResponse` da `@/lib/server/apiAuth`; come prima istruzione del `try` chiamare `await requireFirebaseAuth(request);` (il valore di ritorno non serve); nel `catch` esistente, PRIMA del fallback 500, aggiungere il branch `const authResponse = getApiAuthErrorResponse(error); if (authResponse) return authResponse;` (stesso pattern di `app/api/dividends/route.ts`).
2. In `components/assets/AssetDialog.tsx`: sostituire le due chiamate `fetch('/api/prices/quote?...')` e `fetch('/api/prices/bond-quote?...')` con `authenticatedFetch(...)` importata da `@/lib/utils/authFetch` (verificare se il file la importa già; in caso contrario aggiungere l'import).
3. Verificare con `grep -rn "api/prices/quote\|api/prices/bond-quote" app components lib` che non esistano altri chiamanti. Nota: il cron e `priceUpdater.ts` chiamano i servizi direttamente (non queste route HTTP), quindi non sono impattati.

**Criteri di accettazione**:
- Richiesta senza header `Authorization` → 401 su entrambe le route.
- Con token valido il comportamento è identico a prima (stesso shape di risposta).
- In app, la creazione di un asset con ticker e il fetch prezzo bond funzionano come prima.
- `npx tsc --noEmit` pulito, `npm test` verde.

**Test richiesti** (estendere `__tests__/apiAuthRoutes.test.ts`, stesso pattern dei test esistenti: `vi.mock('@/lib/firebase/admin')` + `verifyIdTokenMock`):
- `GET /api/prices/quote` senza Authorization → 401.
- `GET /api/prices/quote` con token valido e `getQuote` mockato → 200.
- Stessi due casi per `GET /api/prices/bond-quote` (mockare `getBondPriceByIsin`).

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js App Router + Firebase). Prima di scrivere codice leggi: AGENTS.md (sezione "Private API Authorization"), CLAUDE.md, COMMENTS.md, DEVELOPMENT_GUIDELINES.md, e la sezione "SEC-1" di docs/security-review-spec.md.

TASK: proteggi con autenticazione Firebase le due route oggi pubbliche GET /api/prices/quote e GET /api/prices/bond-quote.

1. In app/api/prices/quote/route.ts e app/api/prices/bond-quote/route.ts: aggiungi `await requireFirebaseAuth(request);` come prima istruzione del try (import da @/lib/server/apiAuth) e nel catch gestisci l'errore auth con getApiAuthErrorResponse prima del fallback 500. Usa come riferimento il pattern di app/api/dividends/route.ts. NON aggiungere assertSameUser: i dati sono di mercato, serve solo un utente autenticato.
2. In components/assets/AssetDialog.tsx sostituisci le due fetch() verso /api/prices/quote e /api/prices/bond-quote con authenticatedFetch da @/lib/utils/authFetch.
3. Verifica con grep che non ci siano altri chiamanti delle due route.
4. Estendi __tests__/apiAuthRoutes.test.ts con 4 test (401 senza header, 200 con token valido, per ciascuna route), replicando il pattern di mock esistente nel file (vi.hoisted + vi.mock di @/lib/firebase/admin e dei servizi getQuote/getBondPriceByIsin).

VINCOLI: commenti in inglese, testo UI in italiano (qui non serve UI). Niente refactoring extra. Verifica finale: npx tsc --noEmit pulito e npm test verde.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch fix/sec-1-auth-price-endpoints da develop, commit conventional (fix: require Firebase auth on public price endpoints), PR verso develop.
```

---

### SEC-2 — Confronto `CRON_SECRET` non timing-safe (MEDIA)

**File**: `app/api/cron/monthly-snapshot/route.ts:61`, `app/api/cron/daily-dividend-processing/route.ts:27`, `app/api/portfolio/snapshot/route.ts:91`, `lib/server/apiAuth.ts`

**Problema**: in tre punti il segreto cron è confrontato con `!==` su stringhe. Il confronto JavaScript termina al primo byte diverso: in teoria un attaccante può ricostruire il segreto byte per byte misurando i tempi di risposta (attacco di timing). Il rischio pratico su rete pubblica è basso ma la fix è banale e il segreto protegge endpoint che scrivono dati per TUTTI gli utenti.

```typescript
// app/api/cron/monthly-snapshot/route.ts:61 (identico in daily-dividend-processing:27)
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {

// app/api/portfolio/snapshot/route.ts:91
if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
```

**Vincolo di contratto** (da AGENTS.md): `/api/portfolio/snapshot` DEVE continuare ad accettare `cronSecret` nel body — è usato dall'orchestrazione interna del cron mensile (riga 98 di `monthly-snapshot/route.ts`). Non cambiare il contratto, solo il confronto.

**Istruzioni di implementazione**:
1. In `lib/server/apiAuth.ts` aggiungere e esportare:

```typescript
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison for the shared cron secret.
 *
 * Hashing both sides first makes timingSafeEqual usable with inputs of
 * different lengths (it throws on length mismatch) without leaking length.
 * Returns false when the env secret is not configured: a missing secret
 * must never mean "open access".
 */
export function verifyCronSecret(provided: string | null | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) {
    return false;
  }
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
```

2. Nelle due route cron: estrarre il token dall'header (`authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null`) e sostituire il confronto con `if (!verifyCronSecret(token)) { return 401 }`.
3. In `app/api/portfolio/snapshot/route.ts`: sostituire `if (cronSecret && cronSecret !== process.env.CRON_SECRET)` con `if (cronSecret && !verifyCronSecret(cronSecret))`. La logica a valle (riga 101 `if (!cronSecret) { ...requireFirebaseAuth... }`) resta invariata.

**Criteri di accettazione**:
- Cron con secret corretto → 200; secret sbagliato/assente → 401; `CRON_SECRET` env non configurato → sempre 401 (mai accesso aperto).
- Il flusso interno monthly-snapshot → portfolio/snapshot continua a funzionare.
- `npx tsc --noEmit` pulito, `npm test` verde.

**Test richiesti**: nuovo `__tests__/cronSecretAuth.test.ts` (o estensione di `apiAuthRoutes.test.ts`):
- `verifyCronSecret` unit: match → true; mismatch → false; `provided` vuoto/null → false; env non settato → false (usare `vi.stubEnv('CRON_SECRET', ...)`).
- Route test: `GET /api/cron/daily-dividend-processing` con secret sbagliato → 401 (pattern mock esistente).

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js App Router + Firebase). Prima di scrivere codice leggi: AGENTS.md (sezione "Private API Authorization"), COMMENTS.md, DEVELOPMENT_GUIDELINES.md, e la sezione "SEC-2" di docs/security-review-spec.md (contiene il codice esatto dell'helper da aggiungere).

TASK: rendi timing-safe il confronto del CRON_SECRET.

1. Aggiungi a lib/server/apiAuth.ts la funzione verifyCronSecret esattamente come specificato in SEC-2 (crypto.timingSafeEqual su digest sha256; ritorna false se env o input mancano).
2. Usala nei 3 punti: app/api/cron/monthly-snapshot/route.ts (~riga 61), app/api/cron/daily-dividend-processing/route.ts (~riga 27), app/api/portfolio/snapshot/route.ts (~riga 91). ATTENZIONE: /api/portfolio/snapshot deve continuare ad accettare cronSecret nel body (contratto usato dal cron interno, vedi AGENTS.md) — cambia solo il confronto, non il contratto, e non toccare il ramo requireFirebaseAuth per i chiamanti interattivi.
3. Test: unit test per verifyCronSecret (match, mismatch, input vuoto, env assente con vi.stubEnv) + un test di route per daily-dividend-processing con secret errato → 401, seguendo il pattern di mock di __tests__/apiAuthRoutes.test.ts.

VINCOLI: commenti in inglese; nessun refactoring extra. Verifica: npx tsc --noEmit pulito e npm test verde.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch fix/sec-2-timing-safe-cron-secret da develop, commit conventional (fix: use timing-safe comparison for CRON_SECRET), PR verso develop.
```

---

### SEC-3 — Validazione server-side degli input assente (MEDIA)

**File principali**: `lib/server/` (nuovo modulo), `app/api/prices/quote/route.ts`, `app/api/prices/bond-quote/route.ts`, `app/api/portfolio/snapshot/route.ts`, `app/api/dividends/route.ts`, `lib/services/borsaItalianaScraperService.ts:117`, `lib/services/borsaItalianaBondScraperService.ts:61`

**Problema**: zod 4 è in `package.json` ma è usato solo nei form client. Le route API leggono i body con cast TypeScript (`body as { ... }`) senza alcuna validazione runtime: tipi, range e formati arrivano ai servizi così come il client (o un attaccante con un token valido) li manda. Casi concreti:
- `scrapeDividendsByIsin` interpola l'ISIN nell'URL senza validarlo: `` const url = `${baseUrl}?isin=${isin}&lang=it` `` (`borsaItalianaScraperService.ts:117`). L'ISIN arriva dal documento asset (creato dal client, validato solo dallo zod del form — bypassabile scrivendo direttamente su Firestore, che le rules non vincolano nel formato). Un valore tipo `IT000&lang=en&x=` altera i parametri della richiesta verso Borsa Italiana (host fisso, quindi niente SSRF pieno, ma parameter injection sì).
- `getBondPriceByIsin` interpola l'ISIN nel **path**: `` `${BASE}/${isin}-MOTX.html` `` (`borsaItalianaBondScraperService.ts:61`) — un valore con `/` o `..` cambia il path richiesto. Esiste già `validateItalianBondIsin()` (riga 237 dello stesso file) ma **non viene chiamata** in questo flusso.
- `POST /api/portfolio/snapshot` usa `year`/`month` dal body per costruire l'ID documento Firestore `{userId}-{year}-{M}` senza range check.

**Strategia**: introdurre un modulo di schemi condivisi e applicarlo alle route prioritarie. NON tentare di validare tutte le 30 route in una PR: stabilire il pattern sulle route a rischio più alto; le altre seguiranno lo stesso pattern in PR future.

**Istruzioni di implementazione**:
1. Creare `lib/server/validation.ts` (con `import 'server-only';` in testa) con schemi zod 4 e un helper:

```typescript
import 'server-only';
import { z } from 'zod';

/** ISIN: 2 country letters + 9 alphanumerics + 1 check digit. */
export const isinSchema = z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'Invalid ISIN format');

/** Yahoo Finance ticker: letters, digits and the symbols Yahoo uses (., -, ^, =). */
export const tickerSchema = z.string().min(1).max(20).regex(/^[A-Za-z0-9.^=\-]+$/, 'Invalid ticker format');

export const snapshotRequestSchema = z.object({
  userId: z.string().min(1),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  cronSecret: z.string().optional(),
});

/** Parse helper: returns the typed data or a ready-to-return 400 NextResponse. */
export function parseOr400<T>(schema: z.ZodType<T>, data: unknown):
  { ok: true; data: T } | { ok: false; response: NextResponse } { /* safeParse + 400 con z.flattenError */ }
```

2. Applicare gli schemi nelle route prioritarie:
   - `GET /api/prices/quote`: validare `ticker` con `tickerSchema` → 400 se invalido.
   - `GET /api/prices/bond-quote`: validare `isin` con `isinSchema` → 400 se invalido.
   - `POST /api/portfolio/snapshot`: validare il body con `snapshotRequestSchema` (sostituisce la destrutturazione non validata; mantenere identici i messaggi/status del flusso auth esistente).
   - `POST /api/dividends` e `PUT /api/dividends/[dividendId]`: schema per i campi usati server-side di `DividendFormData` (almeno: `assetId` string non vuota, importi `z.number().finite()`, date valide, `assetIsin` con `isinSchema.optional()`).
3. Difesa in profondità negli scraper (validazione anche al layer servizio, perché gli input arrivano da Firestore non solo dalle route):
   - `scrapeDividendsByIsin` (`borsaItalianaScraperService.ts`): all'ingresso, se l'ISIN non matcha `/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/` lanciare `Error('Invalid ISIN format')`; usare `encodeURIComponent(isin)` nell'interpolazione URL.
   - `getBondPriceByIsin` (`borsaItalianaBondScraperService.ts`): chiamare la già esistente `validateItalianBondIsin(isin)` all'ingresso e ritornare il result di errore già previsto dalla funzione se invalida; usare `encodeURIComponent(isin)` nel path.
4. NON modificare gli zod schema client esistenti (AssetDialog ecc.): restano la prima linea di validazione UX.

**Criteri di accettazione**:
- Ticker/ISIN malformati → 400 con messaggio chiaro, nessuna richiesta esterna partita.
- `year=99999` o `month=13` su snapshot → 400.
- Flussi legittimi invariati (creazione asset, scrape dividendi, snapshot manuale e da cron).
- `npx tsc --noEmit` pulito, `npm test` verde.

**Test richiesti**: nuovo `__tests__/serverValidation.test.ts` per gli schemi (casi validi/invalidi per isin, ticker, snapshot body) + nei test di route esistenti: un caso 400 per ticker invalido su `/api/prices/quote` e ISIN invalido su `/api/prices/bond-quote`; un caso `month: 13` → 400 su snapshot.

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js App Router + Firebase, zod 4 gia' in package.json). Prima di scrivere codice leggi: AGENTS.md, COMMENTS.md, DEVELOPMENT_GUIDELINES.md (sezione Security Baseline: validare al boundary), e la sezione "SEC-3" di docs/security-review-spec.md (contiene gli schemi esatti da creare).

TASK: introduci la validazione server-side degli input con zod sulle route prioritarie e negli scraper Borsa Italiana.

1. Crea lib/server/validation.ts con import 'server-only', gli schemi isinSchema/tickerSchema/snapshotRequestSchema come da SEC-3, e l'helper parseOr400 che incapsula safeParse e costruisce la NextResponse 400 con gli errori flattened. Attenzione: zod e' alla versione 4 (API z.flattenError o error.flatten() — verifica quella corretta per la versione installata).
2. Applica gli schemi a: GET /api/prices/quote (ticker), GET /api/prices/bond-quote (isin), POST /api/portfolio/snapshot (body completo, SENZA toccare la logica auth cronSecret/requireFirebaseAuth esistente), POST /api/dividends e PUT /api/dividends/[dividendId] (campi server-side di DividendFormData).
3. Difesa in profondita' negli scraper: in lib/services/borsaItalianaScraperService.ts (scrapeDividendsByIsin) valida l'ISIN col pattern /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/ all'ingresso e usa encodeURIComponent nell'URL; in lib/services/borsaItalianaBondScraperService.ts (getBondPriceByIsin) chiama la gia' esistente validateItalianBondIsin all'ingresso e usa encodeURIComponent nel path.
4. Test: nuovo __tests__/serverValidation.test.ts per gli schemi + casi 400 nelle route test esistenti (__tests__/apiAuthRoutes.test.ts come riferimento per i mock).

VINCOLI: non modificare gli schemi zod client nei form; non cambiare i contratti di risposta dei flussi validi; commenti in inglese. Verifica: npx tsc --noEmit pulito e npm test verde.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch fix/sec-3-server-input-validation da develop, commit conventional (fix: add server-side zod validation at API boundaries), PR verso develop.
```

---

### SEC-4 — Security header HTTP assenti (MEDIA)

**File**: `next.config.ts`

**Problema**: `next.config.ts` non definisce `headers()`: nessun CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. L'app è quindi inquadrabile in iframe (clickjacking sui bottoni di mutazione), non dichiara HSTS e non ha difese CSP contro eventuali XSS futuri.

**Strategia**: header "sicuri per definizione" subito in enforcement; CSP prima in **Report-Only** (Firebase Auth/Firestore e Next.js richiedono direttive specifiche; partire enforcing romperebbe l'app), poi promozione a enforcement in una PR successiva dopo osservazione.

**Istruzioni di implementazione**:
1. In `next.config.ts` aggiungere:

```typescript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    // Report-Only on purpose: observe violations in the browser console
    // before enforcing. Promote to Content-Security-Policy in a follow-up.
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      // Next.js inline runtime + styled JSX need unsafe-inline until nonces are wired
      "script-src 'self' 'unsafe-inline' https://apis.google.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // Firebase Auth + Firestore + Identity Toolkit + FCM
      "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com",
      "frame-src 'self' https://*.firebaseapp.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['192.168.1.114'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

2. Build e smoke test locale: login, dashboard, aggiornamento prezzi, assistente AI (streaming SSE), grafici. Controllare la console del browser per violazioni CSP riportate (sono solo report, non bloccano) e annotarle nella PR per la futura promozione a enforcement.

**Criteri di accettazione**:
- `curl -sI http://localhost:3000` (dopo `npx next build && npx next start`) mostra tutti gli header.
- Nessuna regressione funzionale (la CSP è report-only; gli altri header non impattano i flussi esistenti).
- `npx tsc --noEmit` pulito.

**Test richiesti**: verifica manuale degli header con `curl -sI` + smoke test funzionale. (Non servono test Vitest: è configurazione framework.)

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js 16 App Router + Firebase, deploy sia Vercel che Docker standalone). Prima di scrivere codice leggi: AGENTS.md, DEVELOPMENT_GUIDELINES.md, e la sezione "SEC-4" di docs/security-review-spec.md (contiene la configurazione esatta degli header).

TASK: aggiungi i security header HTTP in next.config.ts tramite headers(), esattamente come specificato in SEC-4: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimale, HSTS, e una Content-Security-Policy-Report-Only (NON enforcing) con le direttive per Firebase Auth/Firestore elencate nella spec.

VERIFICA OBBLIGATORIA:
1. npx next build deve passare.
2. Avvia npx next start e verifica con curl -sI http://localhost:3000 che tutti gli header siano presenti.
3. Smoke test nel browser: login, dashboard Panoramica, pagina Patrimonio, assistente AI (lo streaming SSE deve funzionare). Annota nella descrizione della PR le eventuali violazioni CSP riportate in console (serviranno per la futura promozione della CSP a enforcement — NON farla in questa PR).

VINCOLI: non modificare output standalone ne' allowedDevOrigins; commenti in inglese. npx tsc --noEmit pulito.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch fix/sec-4-security-headers da develop, commit conventional (feat: add HTTP security headers with report-only CSP), PR verso develop.
```

---

### SEC-5 — Whitelist registrazioni esposta nel bundle client (MEDIA)

**File**: `lib/constants/appConfig.ts`, `app/api/auth/check-registration/route.ts`, `app/register/page.tsx`, `.env.local.example`

**Problema**: la whitelist email vive in `NEXT_PUBLIC_REGISTRATION_WHITELIST` e `appConfig.ts` è importato anche da codice client (`app/register/page.tsx` usa `APP_CONFIG.REGISTRATIONS_ENABLED` / `REGISTRATION_WHITELIST_ENABLED`). Next.js inline-a le `NEXT_PUBLIC_*` referenziate a build time: **le email in whitelist finiscono in chiaro nel bundle JS pubblico** (PII + bersagli per phishing/enumerazione). In più `check-registration/route.ts:42-44` logga in chiaro ogni email tentata (`[REGISTRATION_BLOCKED] ... ${normalizedEmail}`).

**Soluzione**: separare flag UI (possono restare `NEXT_PUBLIC_`) dalla lista email (deve diventare server-only). La verifica vera è già server-side nell'endpoint — va solo spostata la sorgente del dato.

**Istruzioni di implementazione**:
1. Creare `lib/server/registrationPolicy.ts` con `import 'server-only';`. Spostarci `isRegistrationAllowed()` e la lettura della lista da una **nuova env var senza prefisso**: `REGISTRATION_WHITELIST` (stesso formato comma-separated). I due flag booleani possono continuare a leggere le env `NEXT_PUBLIC_REGISTRATIONS_ENABLED` / `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED` (servono anche alla UI di `register/page.tsx`).
2. In `lib/constants/appConfig.ts`: rimuovere `REGISTRATION_WHITELIST` da `APP_CONFIG` e rimuovere `isRegistrationAllowed` (ora server-only). Lasciare i due flag. Aggiornare il checklist-comment in testa al file (regola COMMENTS.md): chi aggiunge config sensibile deve usare il modulo server-only.
3. `app/api/auth/check-registration/route.ts`: importare `isRegistrationAllowed` da `@/lib/server/registrationPolicy`. Nel `console.warn` mascherare l'email (es. `g***@gmail.com`: primo carattere + `***` + dominio) — il log serve a rilevare tentativi, non a identificare persone.
4. `app/register/page.tsx`: verificare che usi solo i due flag (non la lista) — già così oggi; nessuna modifica attesa oltre agli import se necessario.
5. `.env.local.example`: sostituire `NEXT_PUBLIC_REGISTRATION_WHITELIST=` con `REGISTRATION_WHITELIST=` e aggiungere un commento di migrazione ("renamed from NEXT_PUBLIC_REGISTRATION_WHITELIST: the email list must never be exposed to the client bundle").
6. **Nota deploy da riportare nella PR**: dopo il merge va rinominata la env var anche su Vercel/hosting, altrimenti la whitelist risulterà vuota (= registrazioni bloccate quando il flag whitelist è attivo: fail-closed, accettabile ma da sapere).

**Criteri di accettazione**:
- `grep -r "NEXT_PUBLIC_REGISTRATION_WHITELIST" --include='*.ts' --include='*.tsx' .` → zero occorrenze (escluso eventuale commento di migrazione).
- Dopo `npx next build`, `grep -r "REGISTRATION_WHITELIST" .next/static` non trova la lista nel bundle client.
- Con whitelist attiva: email in lista → `{allowed:true}`, email fuori lista → 403. Log senza email in chiaro.
- `npx tsc --noEmit` pulito, `npm test` verde.

**Test richiesti**: nuovo `__tests__/registrationPolicy.test.ts`: whitelist attiva con email inclusa/esclusa (case-insensitive), registrazioni disabilitate, whitelist disattiva, env vuota (con `vi.stubEnv`).

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js App Router + Firebase). Prima di scrivere codice leggi: AGENTS.md, COMMENTS.md, DEVELOPMENT_GUIDELINES.md, e la sezione "SEC-5" di docs/security-review-spec.md.

TASK: la whitelist email di registrazione e' oggi in NEXT_PUBLIC_REGISTRATION_WHITELIST e finisce nel bundle JS client (PII esposta). Rendila server-only.

1. Crea lib/server/registrationPolicy.ts con import 'server-only': sposta qui isRegistrationAllowed() da lib/constants/appConfig.ts e leggi la lista dalla NUOVA env var REGISTRATION_WHITELIST (senza prefisso NEXT_PUBLIC_, stesso formato comma-separated, confronto case-insensitive). I flag NEXT_PUBLIC_REGISTRATIONS_ENABLED e NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED restano dove sono (servono alla UI di app/register/page.tsx).
2. In lib/constants/appConfig.ts rimuovi REGISTRATION_WHITELIST e isRegistrationAllowed; lascia i due flag; aggiorna i commenti.
3. In app/api/auth/check-registration/route.ts importa isRegistrationAllowed dal nuovo modulo e maschera l'email nel console.warn (primo carattere + *** + @dominio).
4. Aggiorna .env.local.example: REGISTRATION_WHITELIST= al posto di NEXT_PUBLIC_REGISTRATION_WHITELIST=, con commento di migrazione in inglese.
5. Test: nuovo __tests__/registrationPolicy.test.ts con vi.stubEnv (email in lista, fuori lista, case-insensitive, registrazioni chiuse, whitelist off, env vuota).
6. Nella descrizione della PR segnala che la env var va rinominata anche sull'hosting dopo il merge.

VERIFICA: grep che NEXT_PUBLIC_REGISTRATION_WHITELIST non compaia piu' nel codice; npx tsc --noEmit pulito; npm test verde; npx next build passa.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch fix/sec-5-server-only-whitelist da develop, commit conventional (fix: move registration whitelist out of the client bundle), PR verso develop.
```

---

### SEC-6 — Vulnerabilità moderate nelle dipendenze transitive (BASSA)

**File**: `package.json`, `package-lock.json`

**Problema**: `npm audit --omit=dev` riporta **8 vulnerabilità moderate**, tutte nella catena `uuid` (bounds check mancante, CWE-130) → `gaxios`/`teeny-request`/`retry-request`/`google-gax`/`@google-cloud/firestore` → `firebase-admin` (range vulnerabile: `12.1.1 - 13.10.0`; installata: `13.6.0`). Impatto pratico basso (le librerie Google usano uuid internamente, non su input attaccante), ma va sanato con un upgrade controllato. **NON usare `npm audit fix --force`** alla cieca: forza un major bump di firebase-admin.

**Istruzioni di implementazione**:
1. Verificare l'ultima versione: `npm view firebase-admin version`. Se esiste una 13.x > 13.10.0 con il fix, preferirla (no breaking). Altrimenti pianificare il major (14.x) leggendo il changelog ufficiale (breaking tipici: versione minima Node, API rimosse).
2. L'app usa di firebase-admin solo: `adminAuth.verifyIdToken`, `adminDb` (Firestore: collection/doc/query/batch/runTransaction), `Timestamp`/`FieldValue`. Censire con `grep -rn "firebase-admin" lib app --include='*.ts'` e verificare ciascun uso contro il changelog.
3. Aggiornare (`npm install firebase-admin@<target>`), poi: `npm audit --omit=dev` → 0 vulnerabilità attese; `npx tsc --noEmit`; `npm test` (in particolare `__tests__/updateCashAssetBalancesAtomic.test.ts` che usa transazioni reali e `__tests__/apiAuthRoutes.test.ts`); `npx next build`.
4. Smoke test: login (verifica token), creazione snapshot manuale, lettura dashboard.

**Criteri di accettazione**: `npm audit --omit=dev` pulito (o solo advisory senza fix disponibile, documentate nella PR); tutti i test verdi; build ok.

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js + Firebase). Leggi prima la sezione "SEC-6" di docs/security-review-spec.md e DEVELOPMENT_GUIDELINES.md.

TASK: sana le 8 vulnerabilita' moderate di npm audit --omit=dev (catena uuid -> firebase-admin, range vulnerabile 12.1.1-13.10.0).

1. Esegui npm audit --omit=dev e conferma lo stato attuale.
2. Verifica con npm view firebase-admin version se esiste una release che esce dal range vulnerabile restando sulla 13.x; altrimenti valuta il major 14.x leggendo il changelog ufficiale (web search consentita) con focus su: versione minima Node richiesta e API Firestore/Auth rimosse o rinominate.
3. Censisci gli usi reali con grep -rn "firebase-admin" lib app --include='*.ts' (l'app usa solo verifyIdToken, Firestore client adminDb, Timestamp/FieldValue) e verifica la compatibilita'.
4. Aggiorna la dipendenza, poi esegui IN ORDINE: npm audit --omit=dev (atteso 0), npx tsc --noEmit, npm test (attenzione a __tests__/updateCashAssetBalancesAtomic.test.ts e __tests__/apiAuthRoutes.test.ts), npx next build. Se un passo fallisce, NON forzare: documenta l'errore e fermati chiedendo indicazioni.
5. NON usare npm audit fix --force.

A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch chore/sec-6-upgrade-firebase-admin da develop, commit conventional (chore: upgrade firebase-admin to resolve uuid advisories), PR verso develop con il prima/dopo di npm audit nella descrizione.
```

---

### SEC-7 — Rate limiting sugli endpoint AI (BASSA, opzionale)

**File**: nuovo `lib/server/rateLimit.ts`, `app/api/ai/assistant/stream/route.ts`, `app/api/ai/analyze-performance/route.ts`

**Contesto della decisione** (presa con l'utente durante la review): istanza single-user, endpoint AI già dietro auth Firebase, registrazioni controllabili via flag/whitelist → un rate limiting distribuito (Upstash/Redis) è sovradimensionato. La mitigazione primaria dell'abuso anonimo è SEC-1. Questo finding è **difesa in profondità opzionale** contro un account compromesso o un bug client che loopa: un limiter in-memory per-istanza, zero dipendenze.

**Limite noto e accettato**: su deployment serverless multi-istanza il limite vale per istanza (ogni cold start riparte da zero). Per lo scopo (tetto ai costi Anthropic) è sufficiente.

**Istruzioni di implementazione**:
1. Creare `lib/server/rateLimit.ts` (`import 'server-only'`): sliding window su `Map<string, number[]>` (chiave = `uid:endpoint`, valori = timestamp delle richieste). API: `checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSeconds?: number }`. Pulizia lazy dei timestamp scaduti ad ogni chiamata (niente timer globali). Commento di design (COMMENTS.md) che documenta il limite per-istanza.
2. Applicare dopo l'auth (mai prima — il limite è per-uid):
   - `POST /api/ai/assistant/stream`: 30 richieste / 1h per uid.
   - `POST /api/ai/analyze-performance`: 10 richieste / 1h per uid.
3. Risposta al superamento: 429 con `Retry-After` header e body `{ error: 'Hai raggiunto il limite di richieste AI. Riprova piu tardi.' }` (testo UI in italiano). Il client dell'assistente mostra già gli errori SSE/HTTP — verificare che il messaggio arrivi leggibile nella UI.
4. Costanti dei limiti a livello modulo, nominate (no magic numbers).

**Criteri di accettazione**: N+1-esima richiesta nella finestra → 429 con `Retry-After`; finestre separate per endpoint e per uid; flussi normali invariati; `npm test` verde.

**Test richiesti**: `__tests__/rateLimit.test.ts` con `vi.useFakeTimers()`: sotto soglia → allowed; oltre soglia → blocked con retryAfter corretto; avanzando il tempo oltre la finestra → di nuovo allowed; chiavi indipendenti.

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js App Router + Firebase + Anthropic). Prima di scrivere codice leggi: AGENTS.md, COMMENTS.md, DEVELOPMENT_GUIDELINES.md, e la sezione "SEC-7" di docs/security-review-spec.md.

TASK: aggiungi un rate limiter in-memory (difesa in profondita', niente dipendenze esterne) sugli endpoint AI.

1. Crea lib/server/rateLimit.ts con import 'server-only': sliding window su Map<string, number[]>, funzione checkRateLimit(key, maxRequests, windowMs) che ritorna { allowed, retryAfterSeconds? }, pulizia lazy dei timestamp scaduti. Aggiungi un design comment (in inglese) che documenta il limite noto: per-istanza su serverless, scelto deliberatamente per semplicita'.
2. Applicalo DOPO requireFirebaseAuth (chiave `${uid}:stream` e `${uid}:analyze`): POST /api/ai/assistant/stream max 30 req/ora, POST /api/ai/analyze-performance max 10 req/ora. Costanti nominate a livello modulo.
3. Al superamento rispondi 429 con header Retry-After e body { error: 'Hai raggiunto il limite di richieste AI. Riprova piu tardi.' } (testo utente in italiano).
4. Test: __tests__/rateLimit.test.ts con vi.useFakeTimers (sotto soglia, oltre soglia, reset dopo la finestra, chiavi indipendenti).

VINCOLI: non toccare la logica di streaming SSE oltre il guard iniziale; commenti in inglese. Verifica: npx tsc --noEmit pulito, npm test verde.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch feat/sec-7-ai-rate-limit da develop, commit conventional (feat: add in-memory rate limiting to AI endpoints), PR verso develop.
```

---

### SEC-8 — Igiene: copertura test cron e logging di debug (BASSA)

**File**: `__tests__/apiAuthRoutes.test.ts` (o nuovo file), `lib/services/borsaItalianaScraperService.ts`

**Problema**:
1. Le due route cron (`/api/cron/monthly-snapshot`, `/api/cron/daily-dividend-processing`) non hanno test di autorizzazione (secret errato/assente). Nota: se SEC-2 è già stato implementato, parte di questa copertura esiste — verificare ed estendere, non duplicare.
2. `borsaItalianaScraperService.ts` logga in produzione contenuti di debug verbosi: URL completo, lunghezza HTML, conteggi per selettore e fino a 1000 caratteri del body della pagina remota (righe ~118-151). Rumore nei log e contenuto di terzi non controllato persistito nei log dell'hosting.

**Istruzioni di implementazione**:
1. Test cron auth: per entrambe le route cron, casi 401 (header assente, secret errato) e 200 con secret corretto e servizi a valle mockati (pattern mock di `apiAuthRoutes.test.ts`).
2. Logging scraper: rimuovere i `console.log` di debug riga per riga (selettori provati, preview del body, page title); tenere UN log informativo per scrape (`[Scraper] ISIN <isin>: found N dividend rows`) e i `console.error` sui fallimenti HTTP/parsing. Non cambiare alcuna logica di parsing.

**Criteri di accettazione**: test cron verdi; scrape funzionante con output di log ridotto; `npx tsc --noEmit` pulito.

**PROMPT da usare**:

```text
Lavora nel repo net-worth-tracker (Next.js App Router + Firebase). Prima di scrivere codice leggi: COMMENTS.md, DEVELOPMENT_GUIDELINES.md, e la sezione "SEC-8" di docs/security-review-spec.md.

TASK (due micro-interventi di igiene):
1. Aggiungi test di autorizzazione per le route cron GET /api/cron/monthly-snapshot e GET /api/cron/daily-dividend-processing: 401 senza header, 401 con secret errato, 200 con secret corretto (mocka i servizi a valle; usa il pattern di mock di __tests__/apiAuthRoutes.test.ts e vi.stubEnv per CRON_SECRET). Se esistono gia' test equivalenti aggiunti da SEC-2, estendili senza duplicare.
2. In lib/services/borsaItalianaScraperService.ts riduci il logging di debug (righe ~118-151): elimina i console.log con URL completo, lunghezza HTML, conteggi per selettore, page title e preview di 1000 caratteri del body remoto. Tieni UN console.log informativo per scrape ("[Scraper] ISIN <isin>: found N dividend rows") e i console.error esistenti sui fallimenti. NON cambiare la logica di parsing.

VERIFICA: npx tsc --noEmit pulito, npm test verde.
A FINE IMPLEMENTAZIONE: fermati PRIMA di fare commit. Riassumimi cosa hai modificato e dimmi cosa e come testare (passi manuali concreti, comandi inclusi). Solo dopo la mia conferma procediamo al commit e al merge verso develop.
DOPO LA MIA CONFERMA, insieme al commit: (1) AGGIUNGI a SESSION_NOTES.md una voce nel formato standard del progetto:
- Cosa: [cosa hai implementato in questa sessione, con il riferimento al finding SEC e ai file toccati]
- Perché: [motivazione dietro la decisione]
- Nota: [gotcha o dettagli importanti, eventuali azioni di deploy post-merge, e l'impatto utente in 1 riga in inglese per le release notes (sezione "## 🔒 Security" di "Draft Release Temp.md") oppure "nessun impatto utente percepibile"]
(2) aggiorna la riga di questo finding nella tabella Executive Summary di docs/security-review-spec.md con lo stato (es. ✅ implementato — PR #NNN); (3) DOPO IL MERGE in develop, esegui come ULTIMA azione della sessione il "Rituale post-merge" riportato verbatim nella sezione omonima di docs/security-review-spec.md (aggiorna AGENTS.md, CLAUDE.md, Draft Release Temp.md e se serve README.md basandoti su SESSION_NOTES.md, poi elimina SESSION_NOTES.md e fai il commit finale con summary e descrizione in inglese).
CONSEGNA (solo dopo la mia conferma): branch chore/sec-8-test-logging-hygiene da develop, commit conventional (chore: add cron auth tests and trim scraper debug logging), PR verso develop.
```

---

## Ordine di esecuzione consigliato

Una PR per finding, branch da `develop`, merge in `develop` (mai direttamente in `main`).

1. **SEC-1** (ALTA, autonomo, massimo valore immediato)
2. **SEC-2** (piccolo, autonomo)
3. **SEC-3** (stabilisce il pattern di validazione; tocca anche le route di SEC-1 → farlo dopo evita conflitti)
4. **SEC-5** (autonomo; richiede rename env var sull'hosting dopo il merge)
5. **SEC-4** (autonomo; richiede smoke test browser)
6. **SEC-8** (dopo SEC-2, per non duplicare i test cron)
7. **SEC-6** (autonomo; PR di soli aggiornamenti dipendenze, mai mischiarla ad altro)
8. **SEC-7** (opzionale, per ultimo)

Dipendenze: SEC-3 dopo SEC-1 (stesse route); SEC-8 dopo SEC-2 (stessi test). Tutte le altre sono indipendenti.

Al termine di ogni PR: aggiornare la riga corrispondente nella tabella dell'Executive Summary con lo stato (es. `✅ implementato — PR #NNN`).

---

## Promemoria per chi implementa

- Leggere sempre, prima di scrivere codice: `AGENTS.md`, `CLAUDE.md`, `COMMENTS.md`, `DEVELOPMENT_GUIDELINES.md`.
- Testo utente in italiano, commenti in inglese (regola AGENTS.md). Attenzione agli apostrofi tipografici nei file `.tsx` (gotcha `TS1127` documentato in AGENTS.md).
- Verifica minima per ogni PR: `npx tsc --noEmit` + `npm test` (+ `npx next build` dove indicato).
- Conventional commits; una sola preoccupazione per commit; niente refactoring opportunistici dentro le PR di sicurezza.

### Chiusura sessione (rituale standard del progetto)

Ogni sessione di implementazione si chiude — dopo la conferma dell'utente, insieme al commit — **aggiungendo** a `SESSION_NOTES.md` (in root) una voce nel formato standard del progetto:

```
- Cosa: [cosa è stato implementato in questa sessione]
- Perché: [motivazione dietro la decisione]
- Nota: [eventuali gotcha o dettagli importanti]
```

`SESSION_NOTES.md` è la base dei prompt preimpostati dell'utente che aggiornano i file di documentazione e `Draft Release Temp.md`. Per i finding di questa spec, in "Cosa" citare il finding SEC e i file toccati; in "Nota" includere le eventuali azioni di deploy post-merge (es. rename env var per SEC-5) e l'impatto utente in 1 riga in inglese per la sezione `## 🔒 Security` di `Draft Release Temp.md` (o "nessun impatto utente percepibile").

Infine aggiornare lo stato del finding nella tabella dell'[Executive Summary](#1-executive-summary).

Se `SESSION_NOTES.md` non esiste (viene eliminato dal rituale post-merge, vedi sotto), crearlo.

### Rituale post-merge (ultima azione obbligatoria dopo ogni merge in develop)

Dopo il merge del branch SEC in `develop`, eseguire come ultima azione della sessione il prompt standard di chiusura del progetto, riportato qui verbatim:

```text
Sessione completata. Per favore:

1. Basandoti su SESSION_NOTES.md, aggiorna AGENTS.md con:
   - Nuovi pattern scoperti
   - Errori da evitare (solo se >30min di debug)
   - Workflow/comandi modificati
   - Rimuovi: errori risolti, info obsolete

2. Basandoti su SESSION_NOTES.md, aggiorna CLAUDE.md con:
   - Current Status: mantieni SOLO l'entry "Latest" della sessione corrente.
     Rimuovi tutti gli entry "Previous" — sono già in git log.
   - Nuove feature/modifiche nelle sezioni statiche (Key Features, ecc.)
   - Rimuovi: known issues risolti, feature >3 mesi fa, decisioni superate
   - ⚠️ Limite hard: CLAUDE.md deve restare sotto 40.000 caratteri.
     Se supera il limite, taglia ulteriori sezioni verbose (descrizioni Key Features).

3. Basandoti su SESSION_NOTES.md, aggiorna Draft Release Temp.md in formato GitHub Release:
   - Se il file NON esiste, crealo con le sezioni standard:
     ## ✨ New Features
     ## 🐛 Bug Fixes
     ## 🔧 Improvements
     ## ⚠️ Breaking Changes
     ## 🔒 Security
     ## 📚 Documentation
     ## 🏗️ Technical
   - AGGIUNGI (non sovrascrivere) le modifiche user-facing di questa sessione
   - Scrivi TUTTO in INGLESE, tono user-facing, bullet "- Added/Fixed/Improved"
   - Includi SOLO modifiche visibili agli utenti (no refactoring interni)
   - Rimuovi categorie vuote

4. Mantieni i docs lean:
   - AGENTS.md: ~800 righe max
   - CLAUDE.md: ~600 righe max e <40.000 caratteri (hard limit Claude Code)
   - Sostituisci info vecchie, non accumulare

5. Elimina SESSION_NOTES.md

6. Aggiorna il README.md se e dove ha senso

7. Fai il commit finale con summary e descrizione in inglese
```

Nota per i finding SEC: nelle sezioni di `Draft Release Temp.md` usare `## 🔒 Security` per le fix di sicurezza user-facing; le fix senza impatto percepibile possono andare in `## 🏗️ Technical` o essere omesse (la voce Cosa/Perché/Nota in SESSION_NOTES.md lo indica esplicitamente).
