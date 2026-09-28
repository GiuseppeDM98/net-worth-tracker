# PERF-02 — La shell prima dell'autenticazione: l'HTML non è più uno spinner

> Stato: da fare · Priorità: 2 · Sforzo: M · Dipende da: PERF-01 (per misurare) · Sblocca: PERF-03 (l'ultimo dato noto ha una pagina su cui posarsi)

## 1. Il problema, misurato

L'HTML prerenderizzato di ogni route `/dashboard/*` ha **0 caratteri di testo nel `body`: solo lo spinner** (i «46» misurati
il 2026-09-26 erano il `<title>`; `perf:budget`, colonna «testo», 2026-09-28). Niente skip link, niente
sidebar, niente `<main>`, niente skeleton. Verificato sulla build del 2026-09-26 (`.next-perf/server/app/dashboard.html`:
`has skip-link=false has spinner=true has <main=false`). La causa è in `app/dashboard/layout.tsx:22-84`: `ProtectedRoute`
avvolge TUTTO (skip link, `SidebarProvider`, `AppSidebar`, `<main>`, `BottomNavigation`), e `components/ProtectedRoute.tsx`
rende lo spinner finché `useAuth().loading` è vero — che sul server è sempre vero (`contexts/AuthContext.tsx:101-102`).

Poi la catena: JS → `onAuthStateChanged` (`AuthContext.tsx:104`) → **se il profilo Auth non ha `displayName` (utenti
email/password) un `getDoc(users/{uid})` ATTESO** (`:113-126`) → `setLoading(false)` → un solo commit che monta sidebar,
template, pagina → le query. Misurato: lo spinner se ne va fra 86 e 228 ms sull'emulatore; in produzione quel `getDoc` è un
round trip Firestore (50–150 ms) messo davanti a tutto, compresa la sidebar che non ne ha bisogno.

Il post di Anthropic ha fatto la stessa cosa al contrario per il composer: HTML statico prima di React, così l'utente
scrive prima che l'app sia pronta. Qui il «composer» è la shell: sidebar, bottom nav, `main` con lo skeleton.

Dettagli verificati: lo spinner ha colori hardcoded (`border-gray-300 border-t-blue-600`, fuori dai token, DESIGN.md);
`MotionConfig reducedMotion="user"` è montato due volte (`components/providers/MotionProvider.tsx` e
`app/dashboard/layout.tsx:21`; `app/dashboard/template.tsx:50-52` ha un commento che cita quello del layout); `ColorThemeContext`
applica `data-theme` solo in `useEffect` (`:78-80`), senza script pre-idratazione — oggi il primo frame è lo spinner e non si
nota, domani con la shell nell'HTML si vedrebbe la palette di default su un tema non-default; `lib/hooks/useMediaQuery.ts:6-13`
legge `window` nell'initializer e dichiara di essere sicuro SOLO perché «all callers are 'use client' components rendered
only after login» — con la shell nell'HTML quella premessa cade (`SidebarProvider` lo chiama, `components/ui/sidebar.tsx:73`).

## 2. Obiettivo misurabile

- L'HTML prerenderizzato di `/dashboard` contiene: lo skip link «Vai al contenuto principale», la `<nav>` della sidebar con
  le voci di `lib/constants/navigation.ts`, `<main id="page-main">` e il `TileGridSkeleton` generico. Il `PageHeader` NO: è
  della pagina e arriva con lei dopo l'auth. Misura: `perf:budget` (PERF-01) stampa «testo nell'HTML (caratteri)» per
  route (il testo del `body`): da 0 a > 300.
- Nessuna lettura Firestore prima di `setLoading(false)`: nel benchmark cold, zero richieste `firestore` prima del marcatore
  `auth` — che questa spec ridefinisce in `scripts/perfBenchmark.mjs` come «il nome del profilo appare nella sidebar»
  (lo spinner non esiste più).
- Nessun avviso di idratazione (`Hydration failed`, `Text content does not match`) nella console a 390 e a 1440: la shell
  rende sul server ciò che rende sul client. Asserzione Playwright su `page.on('console')` in entrambi i progetti.
- Nessun flash di palette: con un tema non-default salvato, `document.documentElement.dataset.theme` è già valorizzato al
  primo frame (asserzione Playwright con `addInitScript` che registra il valore alla prima `MutationObserver` callback).
- Zero regressioni: `npm run test:e2e` completo verde (i sei `auth*.setup.ts` e ogni spec che aspetta `main`).

## 3. Non-obiettivi

- Nessun server rendering dei DATI (RSC, streaming del payload): le pagine restano `'use client'`; qui si porta nell'HTML solo
  ciò che non dipende dall'utente. Il dato «subito» è PERF-03.
- Non si tocca il flusso di login/registrazione né `REGISTRATION_WHITELIST`.
- Non si cambia l'estetica dello skeleton (DESIGN.md → The Absence-Has-Three-Names Rule: lo skeleton è un'ATTESA).
- Non si toglie Firestore dal grafo di `/login` (il modulo resta importato da `lib/firebase/config.ts` nel root layout): questa
  spec toglie solo la LETTURA bloccante.

## 4. Design

**Spostare il cancello.** `ProtectedRoute` non avvolge più la shell: avvolge solo `{children}` dentro `<main>`. La shell
(skip link, sidebar, banner demo, bottom nav) rende sempre; senza utente la sidebar mostra il profilo in stato «attesa»
(`getDisplayInfo(null)` in `lib/utils/userDisplayUtils.ts:8-13` già accetta `null` e risponde `''`: il lavoro è lo stato
visivo — `Skeleton` sulle due righe del nome, `components/layout/Sidebar.tsx:96-218`). `ProtectedRoute` continua a fare il
redirect a `/login` quando `!loading && !user`; mentre `loading` è vero rende **lo skeleton generico** (`fallback`), non uno
spinner:

- `ProtectedRoute` accetta `fallback?: ReactNode`; il layout gli passa `<TileGridSkeleton />`. Le pagine con `cells` proprie
  rendono il loro skeleton appena montate: la sequenza è skeleton generico (SSR) → skeleton della pagina (mount, stesso
  primitivo, stessa larghezza `PageContainer` 1920) → dati. Con `view-transition-name: page-verdict` sullo skeleton (già oggi)
  la scena resta coerente.
- `useDemoMode()` nel layout legge `useAuth()`: con `user` null è `false`, il banner non appare finché l'utente non è noto.

**La shell deve essere idratabile.** `SidebarProvider` (`components/ui/sidebar.tsx:73`) sceglie Sheet o sidebar fissa con
`useMediaQuery`, che oggi legge `window` nell'initializer: sul server risponde `false`, su un telefono `true` → mismatch di
idratazione. Rimedio: `useMediaQuery` passa a `useSyncExternalStore(subscribe, getSnapshot, () => false)` — React idrata con
lo snapshot del server e corregge subito dopo, senza errore — E la shell non deve DIPENDERE dal valore per il primo frame:
la sidebar fissa è nascosta sotto 1440 dalla CSS (`hidden desktop:flex`, come già `BottomNavigation` è `desktop:hidden`), lo
Sheet mobile monta solo quando aperto. Così a 390 il primo frame è corretto anche prima della correzione JS. L'asserzione
sulla console (§ 2) è ciò che prova che non c'è mismatch; `BottomNavigation` resta com'è (CSS) — PERF-14 lo sa.

**Auth senza letture davanti.** In `AuthContext.tsx`, `onAuthStateChanged` fa `setUser({ uid, email, displayName:
firebaseUser.displayName })` e `setLoading(false)` SUBITO; il fallback `getDoc(users/{uid})` per il `displayName` parte dopo,
non atteso, e aggiorna `user` quando arriva (`setUser(prev => prev && prev.uid === uid ? { ...prev, displayName } : prev)`).
Una tantum: `updateProfile(firebaseUser, { displayName })` quando il profilo Auth non ce l'ha e Firestore sì, così il fallback
non serve più dalla seconda volta (idempotente, `try/catch`, mai bloccante). Il saluto della Panoramica («Buongiorno
Giuseppe») può comparire un frame dopo: già oggi `useMemo` dipende da `user?.displayName`. La logica è una funzione pura
`resolveDisplayName(authProfile, firestoreDoc)` testata.

**Palette senza flash.** Uno script inline in `app/layout.tsx` (come fa `next-themes` per `.dark`) che legge la chiave di
`localStorage` del tema e imposta `data-theme` prima del primo paint. La chiave e il nome dell'attributo vanno in un modulo
SENZA `'use client'` (`lib/constants/colorTheme.ts`) importato da `contexts/ColorThemeContext.tsx` E dal layout server:
importare un valore da un modulo client in un Server Component dà un riferimento client, non la stringa. `suppressHydrationWarning`
è già su `<html>`.

**Pulizie:** un solo `MotionConfig` (resta quello di `MotionProvider`; aggiornare il commento di `template.tsx:50-52`); lo
spinner hardcoded sparisce (lo skeleton è il primitivo).

**Cosa NON fare:** non usare `loading.tsx` di Next per la shell (il layout è client e l'attesa qui è dell'auth, non del
routing); non mettere la sidebar in un Server Component separato — legge `usePathname`, `useSidebar`, `useAuth`.

## 5. File da toccare

- `app/dashboard/layout.tsx` — la shell fuori da `ProtectedRoute`; `ProtectedRoute` intorno a `{children}` con `fallback`;
  via il secondo `MotionConfig`. `app/dashboard/template.tsx` — il commento.
- `components/ProtectedRoute.tsx` — prop `fallback`, niente spinner, stesso redirect.
- `lib/hooks/useMediaQuery.ts` — `useSyncExternalStore` con snapshot server `false`; il commento riscritto.
- `components/ui/sidebar.tsx` — la sidebar fissa nascosta da CSS sotto 1440; lo Sheet montato solo aperto (leggere prima
  com'è: se già così, nessuna modifica).
- `contexts/AuthContext.tsx` — `setLoading(false)` prima del `getDoc`; fallback asincrono; `updateProfile`.
  `lib/utils/userDisplayUtils.ts` o nuovo `lib/utils/authProfile.ts` — `resolveDisplayName`.
- `components/layout/Sidebar.tsx` — profilo in attesa con `Skeleton`; `components/layout/SecondaryMenuDrawer.tsx` se mostra il profilo.
- `app/layout.tsx` — script inline pre-idratazione; `lib/constants/colorTheme.ts` — chiave e attributo; `contexts/ColorThemeContext.tsx` li importa.
- `scripts/perfBenchmark.mjs` — il marcatore `auth` ridefinito. `scripts/perfBudget.mts` — la colonna «testo nell'HTML» se
  PERF-01 non l'ha già.
- Test: `e2e/shell.boot.spec.ts` + `e2e/shell.boot.mobile.spec.ts` (il NOME sceglie il progetto: AGENTS.md § 5),
  `__tests__/authProfile.test.ts`, i sei `e2e/auth*.setup.ts` (l'ancora dopo il login).

## 6. Passi

1. Misura prima: `npm run perf:bench -- --routes=dashboard,cashflow --runs=3` e i caratteri dell'HTML.
2. `useMediaQuery` SSR-safe; `ProtectedRoute` con `fallback`; il layout ristrutturato; `tsc`.
3. Sidebar con utente `null`; `npm run dev:emulator`, aprire `/dashboard` da loggato e da sloggato (redirect intatto),
   console pulita a 390 e 1440.
4. `AuthContext`: sblocco immediato + fallback asincrono + `updateProfile`; test della funzione pura.
5. Script inline `data-theme`; verificare in Playwright con tema `cyberpunk` salvato che il primo frame lo porta.
6. Build di produzione: contare il testo dell'HTML di `/dashboard` (> 300 caratteri, `<nav>` presente); il marcatore `auth`
   nuovo nel benchmark.
7. I sei setup ancorati a un elemento che esiste solo con l'utente; `npm run test:e2e` completo; misura dopo.

## 7. Test e falsificazione

- `e2e/shell.boot.spec.ts` (`desktop`) e `.mobile.spec.ts` (390): (a) la risposta HTML di `/dashboard` (`request.get`, senza
  JS) contiene «Vai al contenuto principale» e la `<nav>` — falsificare rimettendo la shell dentro `ProtectedRoute` e vedere
  rosso; (b) nessun messaggio di idratazione in console durante il load (anchor positivo: la spec prima prova che
  `page.on('console')` vede un `console.error` iniettato); (c) da loggato con un tema non-default in `localStorage`
  (`addInitScript`, una volta, senza cancellare nulla — doc/guide/e2e-emulatori.md), la prima `MutationObserver` callback
  vede `data-theme` già impostato.
- Redirect: contesto senza `storageState` → `waitForURL(/login/)` (se una spec esiste già, resta verde).
- Unit: `resolveDisplayName` con profilo Auth vuoto e doc Firestore presente/assente.
- Suite: `tsc`, lint 0, Vitest in `Europe/Rome`, `npm run test:e2e` COMPLETO (i sei `auth*.setup.ts` usano
  `getByRole('navigation').or(page.locator('main'))` dopo `waitForURL`: con la shell nell'HTML la `navigation` esiste PRIMA
  del login → ancorare a `waitForURL(/dashboard/)` + il nome del profilo nella sidebar, in tutti e sei).

## 8. Collaudo guidato

- A: `test:e2e` completo. C: le tre asserzioni viste rosse. E: il redirect senza sessione.
- F (proprietario, mirror seminato, `http://localhost:3000/dashboard` con un tema non-default): 1) al reload la sidebar
  compare PRIMA delle tessere, senza spinner; 2) nessun lampo di colori di default; 3) il nome nel profilo della sidebar
  appare senza salto di layout; 4) da sloggato si finisce su /login; 5) sul telefono (390) la bottom nav è già lì durante
  l'attesa e la console non ha avvisi. Non coperto dal giro: il tempo (lo dice il benchmark).
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- I sei setup (`auth.setup.ts`, `authAnalisi…`, ecc.) potrebbero dichiarare la sessione pronta troppo presto: § 7 li ancora
  al profilo.
- Il redirect ora avviene con la shell visibile: un frame di dashboard vuota prima di /login. Accettabile (è lo skeleton),
  ma va visto (F.4).
- Il mismatch di idratazione sul telefono è il rischio tecnico: la CSS decide il primo frame, `useSyncExternalStore` corregge
  senza errore, e la console pulita a 390 lo prova.
- Rollback: un revert; la struttura del layout è un solo file.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e la riga «Shell» in § Key Features (la shell rende prima dell'auth, `ProtectedRoute` intorno a
  `main`). AGENTS.md § Navigation: «la sidebar accetta `user` null» e «`useMediaQuery` è SSR-safe: la CSS decide il primo
  frame». doc/guide/stati.md: lo skeleton dell'attesa auth. doc/guide/temi.md: lo script pre-idratazione e la costante in
  `lib/constants/colorTheme.ts`. doc/guide/e2e-emulatori.md: l'ancora dei sei setup. `Draft Release Temp.md`. doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-02-avvio-shell-prima-di-auth.md: la shell della dashboard (skip link,
sidebar, bottom nav, main con lo skeleton generico) deve stare nell'HTML prerenderizzato e rendere PRIMA che Firebase
Auth risolva, senza errori di idratazione a 390 e 1440 (useMediaQuery SSR-safe, la CSS decide il primo frame);
AuthContext non deve più attendere un getDoc prima di sbloccare; data-theme impostato da uno script pre-idratazione con
la chiave in un modulo senza 'use client'; il marcatore auth del benchmark ridefinito.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (in particolare § Navigation, § Motion, § React Query and Derived State, § 5 Testing), CLAUDE.md
- Leggi doc/guide/stati.md, doc/guide/temi.md, doc/guide/accesso-registrazione.md, doc/guide/e2e-emulatori.md
- Leggi lib/hooks/useMediaQuery.ts e components/ui/sidebar.tsx PRIMA di toccare il layout
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e poi la spec PERF-02 per intero; PERF-01 deve essere chiusa
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Misura PRIMA e DOPO nella stessa sessione con npm run perf:bench -- --routes=dashboard,cashflow --runs=3, e conta i
caratteri di testo dell'HTML prerenderizzato di /dashboard nella build (oggi 0: npm run perf:budget, colonna «testo»). Le tre asserzioni nuove delle due spec
shell.boot vanno viste ROSSE una volta (dimmi come le hai rotte). Chiusura: tsc, lint 0, Vitest in Europe/Rome,
npm run test:e2e COMPLETO verde con i sei setup ancorati al profilo, giro guidato di 5 punti sul mirror (npm run
mirror:seed -- <email>, poi mirror:remove), poi CLAUDE.md «Latest» e la riga Shell, AGENTS.md § Navigation, le guide
stati/temi/e2e-emulatori, Draft Release Temp.md (senza dati privati), doc/perf/README.md, e proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** Tocca il layout di ogni pagina, il contesto di autenticazione, l'idratazione sul
telefono e la suite E2E intera: la regressione più probabile è silenziosa (un setup che dichiara la sessione pronta troppo
presto, un mismatch che React corregge in silenzio). Serve il modello più capace con effort xhigh sulle interazioni fra shell,
auth, CSS e test.
