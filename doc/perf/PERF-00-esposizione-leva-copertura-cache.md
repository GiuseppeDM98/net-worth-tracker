# PERF-00 — Esposizione: la leva come nozionale, la copertura onesta, la base di Allocazione, una cache che va a segno

> Stato: **fatta** (2026-09-28; le decisioni di § 4.9 e le parole FINALI della riga di copertura — due frasi, «In questa vista» / «Fuori da questa vista», riviste dal proprietario sul mirror — in doc/guide/allocazione.md § Esposizione: le frasi di § 4.7 qui sotto sono la stesura di partenza) · Priorità: 1 (entra PRIMA di PERF-01) · Sforzo: L · Dipende da: — (l'integrazione di #400/#401/#403
> del 2026-09-27 è già nel ramo di partenza) · Sblocca: PERF-01 (la baseline di Allocazione senza Yahoo), PERF-10 (che
> perde § A), MOB-01, MOB-07
> · Origine: issue #402 di Ciocc128, accettata con modifiche; il codice lo scriviamo noi (proprietario, 2026-09-27)

## 1. Il problema, verificato

La tessera Esposizione risponde a «a cosa sono esposto davvero?» con tre viste (Titoli · Settori · Emittenti). Le viste
sono giuste; sotto ci sono sei difetti, tutti letti sul codice di `develop` il 2026-09-27:

1. **La leva è invisibile.** Ogni asset vale il suo valore di mercato (`resolveAssetValueEur`,
   `lib/server/portfolioExposureService.ts:56-68`); `leverageRatio` e `composition` non vengono mai letti (`:199`, `:216`).
   Un ETF 2× o un fondo 90/60 pesano quanto un ETF semplice.
2. **La copertura è dichiarata per eccesso.** `analyzedAssets` = ETF + azioni, contati PRIMA di qualunque risposta di
   Yahoo (`:96`); un ETF sintetico senza composizione conta come analizzato e i suoi euro finiscono in «Resto del
   portafoglio» (`allocazioneSummary.ts:869`) insieme all'oro, che una composizione per titoli non l'avrà mai.
3. **La cache non va MAI a segno.** La route costruisce una chiave a tre segmenti (`app/api/portfolio/exposure/route.ts:55`),
   il servizio una a quattro (`portfolioExposureService.ts:336`): non combaciano mai, nemmeno senza azioni dirette (il
   segmento vuoto lascia `--`). Yahoo è chiamato a ogni apertura di Allocazione, in parallelo (`:114-158`). È il difetto
   di PERF-10 § A; l'issue lo descrive più stretto di com'è.
4. **La base è tutto il patrimonio.** Il filtro è solo `quantity > 0` (`:79`): conti, casa e fondo pensione stanno nel
   denominatore, mentre il resto della pagina ragiona sul portafoglio di Allocazione (`allocationRole`).
5. **La route legge l'account sbagliato.** Usa `decodedToken.uid` (`route.ts:32, 40`); la pagina passa `ownerId`
   (`app/dashboard/allocation/page.tsx:516`) e la chiave React Query è per `ownerId`
   (`lib/hooks/usePortfolioExposure.ts:43`). Un membro delegato vede la PROPRIA esposizione sulla pagina del proprietario.
6. **Il servizio tiene una copia divergente di `calculateAssetValue`.** `resolveAssetValueEur` non ha il `Math.max(0, …)`
   e guarda `type` dove l'originale guarda `assetClass` (`lib/services/assetService.ts:549-563`).

Il fork di Ciocc128 ha già un motore (`exposureEngine.ts`) che risolve 1, 2 e 4, ma NON è ciò che l'issue propone: ha
cinque viste e tabelle curate, che l'issue stessa esclude, e la revisione del 2026-09-27 vi ha trovato due difetti
bloccanti: la cache condivisa per ticker salva dati dell'utente (`asset.name` come etichetta e come emittente), e la
chiave della cache del risultato ignora leva e composizione. Il fork si legge come riferimento, non si porta.

## 2. Obiettivo misurabile

- **Zero chiamate a Yahoo a regime**: la seconda apertura di Allocazione non chiama `quoteSummary` (mock a 0 chiamate
  nel test della route, visto ROSSO sul codice di oggi). Un ticker nuovo costa UNA chiamata, per tutti gli utenti.
- **Gli euro combaciano con la pagina**: per ogni vista, base + non applicabile + fuori vista = il totale del portafoglio
  di Allocazione, al centesimo: il nozionale (`allocation.notionalValue`) per Titoli e Settori, il valore di mercato
  (`allocation.marketValue`) per Emittenti.
- **Ogni elenco torna a 100 sullo schermo**: righe + «Resto letto» + «Non letto» = la base della vista.
- **Ogni euro della base ha un destino nominato**: letto · non letto (con il nome dello strumento) · non applicabile per
  natura · fuori da questa vista (le obbligazioni in Titoli e Settori).
- **Un membro delegato vede l'esposizione del proprietario**; un estraneo riceve 403 (coppia positivo/negativo).
- `e2e/allocation.spec.ts` (1440) e `e2e/allocation.mobile.spec.ts` (390, nuovo) verdi senza chiamare Yahoo: ogni
  ticker quotato della fixture ha il suo profilo fresco nel seed (Yahoo lo chiama il server, `page.route` non lo
  intercetta).

## 3. Non-obiettivi

- Nessuna vista Paesi o Valute: Yahoo non pubblica la scomposizione, e lo scraping di justETF è escluso dal 2026-05-14.
- Nessuna tabella curata, nessun alias di ticker, nessuno script che scarica documenti.
- Nessun ottimizzatore, nessun PAC, nessun cambio a Piano, Bilanciamento o ai target.
- Nessun token e nessun blocco tema: le righe restano `var(--chart-1)`.
- Nessuna normalizzazione dei nomi degli emittenti di Yahoo (un emittente può stare su due righe: lo dice la nota del
  metodo). È una spec a parte, se mai.
- `Server-Timing` sulla route: resta a PERF-10, che lo aggiunge dopo PERF-07.

## 4. Design

### 4.1 Decisioni del proprietario (2026-09-27)

| Domanda | Decisione |
|---|---|
| La base delle percentuali | Quella di ogni vista, dichiarata: Titoli e Settori sull'azionario nozionale, Emittenti sul valore di mercato degli strumenti quotati |
| Cosa entra in Emittenti | Solo gli strumenti con un prezzo di mercato (`hasMarketPrice`): conti, immobili e fondo pensione sono «non applicabile» |
| Le obbligazioni in Titoli e Settori | Fuori dalla vista, ma NOMINATE nella riga di copertura |
| La cache | Una sola, condivisa per ticker, con le risposte di Yahoo; gli euro si pesano a ogni apertura sui valori correnti |

### 4.2 Due domande tenute separate

```
esposizione[vista][chiave] = Σ_asset Σ_gamba ( valoreGamba × profilo[vista][chiave] )
```

- **(A) Quanto mette ogni asset in ogni classe** lo dice `expandAssetExposure` (`lib/utils/assetExposureUtils.ts`), che
  esiste già: gambe della composizione e leva, deterministico, nessuna fonte esterna.
- **(B) Che forma ha dentro una gamba azionaria** lo dice Yahoo, e SOLO Yahoo. Quando non ha nulla la risposta è «non
  letto», mai zero e mai una stima.

### 4.3 La pesatura sta nel browser, la route dà i profili

La pagina di Allocazione possiede già gli asset; ciò che le manca sono i profili degli strumenti. Quindi:

- **`GET /api/portfolio/instrument-profiles?userId=<ownerId>[&force=true]`** (nuova): auth →
  `assertCanAccessAccount(decodedToken, ownerId)` → `getUserAssetsAdmin(ownerId)` → i ticker in vista (§ 4.4) → il
  servizio risolve i profili → `{ profiles: Record<string, InstrumentProfile>, oldestFetchedAt: string | null }`. Nessuna
  query e nessuna logica nel corpo della route (AGENTS.md § Server Layer).
- **Chi chiede cosa** è UNA funzione pura, `selectProfileRequests(assets)` → `Array<{ ticker: string; module: 'fund' |
  'stock' }>` (ruolo, `hasMarketPrice`, ticker non vuoto, `type` → modulo), in `lib/utils/exposureRequests.ts`, che
  importa solo `allocationUtils` e `assetPricing`. La chiamano la route (quali ticker risolvere) e l'hook (la firma di
  § 4.6). NON sta in `exposureEngine.ts`: il motore importa `expandAssetExposure` → `assetService` → l'SDK client, e la
  route se lo porterebbe nella Lambda.
- **`lib/utils/exposureEngine.ts`** (nuovo, puro): `computeExposure(assets, profiles)` gira NEL BROWSER, sugli asset che
  la pagina ha in mano, in un `useMemo`. Gli euro sono quelli di Per classe per costruzione, e un asset modificato
  ricalcola la tessera senza una terza invalidazione.
- **`/api/portfolio/exposure`, `lib/server/portfolioExposureService.ts` e `exposure-cache/{userId}` si ritirano**: la
  route e il servizio si cancellano, la regola della collezione esce da `firestore.rules`, i documenti restano orfani
  (nessuno li legge; la pulizia è uno script usa-e-getta, facoltativo).
- **Perché non pesare nella route**: `expandAssetExposure` importa `calculateAssetValue` da `assetService`, che
  inizializza l'SDK client a livello di modulo; in una funzione server trascinerebbe `firebase/firestore` dentro la Lambda.
  Nel browser quel grafo c'è già. E una risposta pesata sul server resterebbe in cache nel client per 20 minuti, con gli
  euro fermi mentre il resto della pagina si muove.

È la sola scelta di ARCHITETTURA che il proprietario non ha ancora visto (§ 4.9, domanda 1); le altre quattro domande
sono di prodotto e di parole.

### 4.4 Chi entra, e con quale destino

La base è il portafoglio di Allocazione: `quantity > 0` e `resolveAllocationRole(asset)` ∈ `tradable`, `frozen`.
`excluded` resta fuori da ogni vista e da ogni riga di copertura.

| Vista | Misura | In vista (la base = letto + non letto) | Non applicabile | Fuori vista, nominato |
|---|---|---|---|---|
| Titoli, Settori | **nozionale** (`notionalValue`) | le gambe `equity` degli strumenti quotati | le gambe di `NON_LOOKTHROUGH_ASSET_CLASSES` (commodity, trendFollowing, carry, crypto, realestate, cash; costante nuova di `exposureEngine.ts`) e OGNI gamba, obbligazioni comprese, di un asset che non è uno strumento quotato (senza prezzo di mercato o senza ticker) | le gambe `bonds` degli strumenti quotati |
| Emittenti | **valore di mercato** | gli strumenti con `hasMarketPrice(type, subCategory)` e un ticker non vuoto, una volta sola | conti, immobili, fondo pensione, Private Equity | — |

- **«Strumento quotato»** è UNA regola: `hasMarketPrice` (`lib/utils/assetPricing.ts:39`) più un ticker non vuoto. Mai
  un elenco di tipi scritto a mano in questo modulo.
- **Letto, per vista**: un'azione diretta è letta in Titoli per costruzione (la chiave è il suo ticker, peso 1; Yahoo le
  dà solo l'etichetta), in Settori se il profilo ha `sectorKey`, in Emittenti sempre (`longName`, o il ticker); un fondo
  è letto in Titoli se ha `holdings`, in Settori se ha `sectors`, in Emittenti se ha `family`. Un profilo assente o vuoto
  è «non letto» solo nelle viste che ne hanno bisogno.
- **La leva non moltiplica una controparte**: Emittenti misura il valore di mercato. Al contrario Titoli e Settori
  misurano quanto il sottostante muove il portafoglio, e un 2× lo muove il doppio.
- **Le percentuali sono quote della base della vista** (`baseEur` = letto + non letto), e la tessera nomina la base
  accanto alla colonna: «% dell'azionario nozionale», «% degli strumenti quotati».
- **Normalizzazione** (in `yahooSource`): i pesi dei titoli di un fondo (`holdingPercent`) sono quote del FONDO e si
  dividono per `stockPosition` per diventare quote della gamba azionaria; i pesi dei settori sono già normalizzati alla
  gamba e non si toccano. `stockPosition` assente o ≤ 0: i pesi restano com'erano e il profilo lo dichiara
  (`holdingsBasis: 'fund'`), così la nota del metodo può dirlo.

### 4.5 Il profilo: solo ciò che Yahoo ha risposto

```ts
interface InstrumentProfile {
  ticker: string;
  fund?: { fetchedAt: string; holdings?: ExposureLegSlice[]; sectors?: ExposureLegSlice[]; holdingsBasis: 'sleeve' | 'fund'; family: string | null };
  stock?: { fetchedAt: string; sectorKey: string | null; longName: string | null };
}
// ExposureLegSlice = { key: string; label: string; weight: number }, nuovo in types/exposure.ts
```

- **Nessun dato dell'utente nel profilo**: mai `asset.name`, mai la classe o la composizione scelte dall'utente. Il
  documento è condiviso fra tutti gli account: ciò che l'utente A ha scritto non deve comparire all'utente B.
  L'etichetta di un'azione diretta e il suo emittente vengono da `longName` di Yahoo; se manca, il ticker.
- **Quali moduli chiedere** dipende dal `type` dell'asset (`etf` → `topHoldings` + `fundProfile`; `stock` →
  `assetProfile` + `price`), che è una scelta dell'utente: per questo ogni modulo sta nel documento con il SUO
  `fetchedAt`: una richiesta che ha bisogno di un modulo assente lo chiede e scrive SOLO quel modulo (`set(…, {
  mergeFields: ['fund'] })` o `['stock']`), mai l'altro, e mai un `merge: true` sull'intero documento, che terrebbe i
  `holdings` di ieri sotto una risposta ora vuota (AGENTS.md § Firestore Writes). TTL (30 giorni utile, 24 ore vuota),
  «Aggiorna» e `oldestFetchedAt` si leggono PER MODULO. La classificazione di un utente non può togliere i titoli a un
  altro. `bond`, `crypto` e `commodity` non chiedono nulla e non entrano nella firma di § 4.6: in Titoli e Settori le
  loro gambe sono fuori vista (`bonds`) o non applicabili per classe, in Emittenti sono «non letti» con il nome, salvo
  diversa risposta alla domanda 2 di § 4.9.
- **Le scelte che dipendono dall'asset** (le gambe, la leva, quale gamba legge quale fetta) stanno nel motore puro, a
  ogni calcolo, mai nella cache.

### 4.6 La cache per ticker

- **`instrument-profile-cache/{encodeURIComponent(ticker)}`**, scritta e letta SOLO dall'Admin SDK. In `firestore.rules`
  un blocco esplicito `allow read, write: if false` (il default nega comunque; il blocco lo documenta). Il nome è quello
  del fork, così i due repo restano allineati; `exposure-holdings-cache` di PERF-10 non nasce.
- **TTL**: 30 giorni per una risposta utile; 24 ore per una risposta vuota (un «non letto» deve poter guarire); se Yahoo
  fallisce e in cache c'è una risposta utile scaduta, vale quella (l'ultima buona) e `fetchedAt` dice quanto è vecchia.
- **Mai un id vuoto**: un asset senza ticker o senza prezzo di mercato non arriva al resolver (`.doc('')` lancia in modo
  sincrono nell'Admin SDK). La scrittura è fire-and-forget DENTRO un `try`, con `removeUndefinedDeep` prima del `set` del solo modulo (§ 4.5).
- **«Aggiorna»** (`force=true`): richiede a Yahoo i ticker di QUESTO portafoglio saltando il TTL; se Yahoo fallisce resta
  l'ultima risposta buona. Il piè di pagina stampa la data della risposta più VECCHIA usata (`oldestFetchedAt`), non
  l'ora del calcolo: «Composizioni lette da Yahoo, la più vecchia del 3 settembre».
- **React Query**: `queryKeys.portfolio.instrumentProfiles(ownerId, tickersSignature)`, dove la firma è l'elenco
  ordinato dei ticker in vista con il loro modulo (`VWCE.DE:fund|AAPL:stock`, da `selectProfileRequests`, § 4.3): un ticker nuovo cambia la chiave e la
  lettura riparte da sola. `staleTime` 60 minuti; `refresh()` passa `force=true` come oggi.

### 4.7 La tessera e le parole

La forma resta: lo stesso `AsideToggle` a tre opzioni, le righe `RankedRows`, una riga aperta alla volta con le fonti e
la formula, «Aggiorna», la lettura che segue la vista. Cambia:

- **La riga di copertura**, sopra l'elenco (`describeExposureCoverage(coverage, view)`, `allocazioneNarrative.ts`):
  «Dei 120.000 € di azionario nozionale ne leggo il 94%: 7000 € (un ETF sintetico) non hanno una composizione
  pubblicata. 8000 € (oro) non hanno titoli per natura; 40.000 € di obbligazionario restano fuori da questa vista.»
  Ogni clausola cade se il suo importo è zero (The Narrative Honesty Rule).
- **«Letto» vuol dire «con una composizione pubblicata», non «titolo per titolo»**: di un fondo letto Yahoo nomina i
  primi dieci titoli, e il resto della sua gamba azionaria cade in «Resto letto». In Titoli la riga di copertura lo dice
  con la sua cifra: «…ne leggo il 94%; i titoli nominati da Yahoo ne coprono il 31%.» La clausola cade in Settori quando
  i pesi coprono la gamba intera.
- **L'elenco torna**: le righe classificate, poi «Resto letto» (letto − mostrato), poi «Non letto» se > 0. «Resto del
  portafoglio» sparisce: non è più vero. `RankedRows` oggi accetta UNA sola riga di chiusura (`remainder`,
  `components/ui/ranked-rows.tsx:47`): la prop diventa `remainders` (un array, stesse classi, nessun cambio visibile per
  le superfici che ne passano una). Ogni riga arrotondata all'unità stampata, lo scarto alla riga che è un resto per
  definizione, «Resto letto» (AGENTS.md § Hierarchy).
- **L'aside nomina la base** della colonna delle percentuali; `describeExposureAside` («X asset su Y analizzati») se ne
  va, e la riga di copertura dice ciò che diceva, giusto.
- **La lettura cambia base con la vista**: `describeExposure` oggi dice «(N% del portafoglio …)» per il titolo
  (`allocazioneNarrative.ts:577`) e «emette il N% degli ETF» per l'emittente (`:592`): diventano «dell'azionario
  nozionale» e «degli strumenti quotati», le stesse parole dell'aside. Cambiano anche le altre parole che nominano gli
  ETF: il caricamento «Sto leggendo la composizione degli ETF…» (`EsposizioneTile.tsx:193`), il nome della lista
  «Emittenti degli ETF» (`:63`), il metodo «Prime ~10 posizioni per ETF…» (`allocazioneNarrative.ts:638`), e « Dalla
  cache.» (`EsposizioneTile.tsx:238`) se ne va: la risposta nuova non ha `cached`.
- **Lo stato vuoto** legge «nessuno strumento quotato nel portafoglio di Allocazione», non «nessun ETF».
- **Una fetta «non letta» non è una lettura fallita**: `failed` e l'eyebrow rosso restano il solo `isError` della query.
- **La tessera riceve gli asset dalla pagina** (`allAssets`, la lista intera: il ruolo lo applica il motore; e
  `ownerId`), come le altre: possiede solo i profili. L'hook è `enabled` solo a firma non vuota (a firma vuota la tessera
  va dritta allo stato vuoto, senza chiamate) e la tessera legge `isLoading`, non `isPending`. Da PERF-05 `allAssets`
  viene da `useAssets` (PERF-05, «Esposizione (PERF-00)»).
- **La nota del metodo** dietro «Come si calcola» (`TileMethodNote`): nozionale contro valore di mercato, la divisione
  per `stockPosition`, i primi dieci titoli di Yahoo, gli emittenti come Yahoo li scrive.

### 4.8 Cosa si cancella

`lib/server/portfolioExposureService.ts`, `app/api/portfolio/exposure/route.ts`, i tipi vecchi di `types/exposure.ts`
(`ExposureHolding`, `ExposureSector`, `ExposureIssuer`, `analyzedAssets`, `totalAnalyzedValue`, `totalPortfolioValue`,
`cacheKey`), `describeExposureAside`, la regola `exposure-cache` di `firestore.rules`. Una catena morta si cancella in
UN commit, dopo il grep di ogni anello (AGENTS.md § Audit habits).

### 4.9 Domande al proprietario (strumento interattivo, prima di scrivere codice)

1. La pesatura nel browser con la route che dà solo i profili (consigliata), o nella route come oggi, con
   `calculateAssetValue` estratto in un modulo puro e l'invalidazione della chiave a ogni modifica di un asset?
2. BTP, crypto ed ETC (`commodity`) sono «strumenti quotati», ma per BTP e crypto Yahoo non conosce l'emittente, e per
   un ETC `fundProfile` ha spesso la famiglia: in Emittenti i primi due risultano «non letti», con il nome. Va bene, o li
   dichiariamo «non applicabile»? E per gli ETC chiediamo `fundProfile` come per un `etf`?
3. «Aggiorna» che richiede a Yahoo saltando i 30 giorni, con la data della risposta più vecchia nel piè di pagina
   (consigliata), o un semplice ricalcolo sui profili in cache?
4. Le parole della riga di copertura e delle due righe di chiusura («Resto letto», «Non letto»).
5. I documenti orfani di `exposure-cache`: si lasciano, o uno script li cancella in produzione con il tuo OK?

## 5. File da toccare

- **Nuovi**: `lib/utils/exposureEngine.ts`, `lib/utils/exposureRequests.ts`,
  `lib/server/exposure/{yahooSource,instrumentProfileService}.ts`, `app/api/portfolio/instrument-profiles/route.ts`,
  `e2e/allocation.mobile.spec.ts`,
  `__tests__/{exposureEngine,exposureRequests,exposureYahooSource,instrumentProfileService,instrumentProfilesRoute}.test.ts`.
- **Riscritti**: `types/exposure.ts`, `lib/hooks/usePortfolioExposure.ts` (i profili + il `useMemo` del motore),
  `components/allocation/tiles/EsposizioneTile.tsx`, le funzioni `*Exposure*` di
  `lib/utils/{allocazioneSummary,allocazioneNarrative}.ts`, `lib/query/queryKeys.ts`.
- **Toccati**: `app/dashboard/allocation/page.tsx` (passa `allAssets`), `components/ui/ranked-rows.tsx` (`remainders`,
  § 4.7, e i suoi chiamanti se la prop cambia nome), `firestore.rules`, `scripts/seedEmulator.ts` (un profilo fresco per
  ogni ticker quotato del fixture base: `VWCE.DE`, `AAPL`, `FONDOPENSIONE`, e `BTP`/`BTC` secondo § 4.5),
  `e2e/allocation.spec.ts`, `__tests__/{allocazioneSummary,allocazioneNarrative,apiAuthRoutes}.test.ts`.
- **Cancellati**: § 4.8.

## 6. Passi

1. Branch, guide, le domande di § 4.9.
2. Il test della route di OGGI che prova il difetto 3: due `GET` di fila, `quoteSummary` chiamato alla seconda → ROSSO
   per costruzione. Resta nel diff come prova, riscritto sulla route nuova al passo 4.
3. Il motore puro e i tipi, con i test su fixture senza rete (§ 7).
4. `yahooSource`, il servizio dei profili, la route owner-scoped, le rules.
5. L'hook, la tessera, summary e narrative; le cancellazioni di § 4.8.
6. Il seed dei profili, le due spec Playwright, l'E2E completo.
7. Giro guidato sul mirror, documentazione, deploy delle rules con l'OK del proprietario, commit.

## 7. Test e falsificazione

- **Motore** (`exposureEngine.test.ts`, fixture inventate): un ETF 2× pesa il doppio in Titoli e una volta in Emittenti
  (falsificare leggendo `marketValue` in Titoli); un 60/40 mette il 60% in vista e il 40% fuori vista, nominato; l'oro è
  «non applicabile»; un ETF senza profilo è «non letto» con il suo nome; un asset `excluded` non compare in nessun
  bucket; Σ(letto + non letto + non applicabile + fuori vista) = Σ `notionalValue` delle gambe della base in Titoli e
  Settori, e = Σ `marketValue` in Emittenti (falsificare saltando un ramo: l'identità diventa rossa).
- **Normalizzazione** (`exposureYahooSource.test.ts`, `quoteSummary` finto): `stockPosition` 0,9 e un titolo al 4,5% →
  5,0% della gamba; i settori NON divisi; `stockPosition` assente → `holdingsBasis: 'fund'`; un fondo a prevalenza
  obbligazionaria. Falsificare togliendo `/ stockPosition`: rosso. Il fixture porta i pesi GREZZI di Yahoo, mai già
  normalizzati, altrimenti il test non può fallire.
- **Profili** (`instrumentProfileService.test.ts`): cache fresca → 0 chiamate; scaduta → 1; Yahoo in errore con una
  risposta utile scaduta → vale quella; risposta vuota → TTL di 24 ore; un ticker chiesto come `stock` e poi come `fund`
  → i due moduli nello stesso documento, e il `fetchedAt` del primo NON rinfrescato dalla seconda richiesta (falsificare
  con un `fetchedAt` di documento: rosso); nessun campo del profilo contiene `asset.name` (falsificare rimettendolo
  come etichetta: rosso); un asset senza ticker non raggiunge `.doc()`.
- **Route** (`instrumentProfilesRoute.test.ts` + `apiAuthRoutes`): la seconda `GET` fa 0 `quoteSummary`; il proprio
  `userId` → 200, quello di un altro account → 403, un delegato con la grant → 200 con i ticker del PROPRIETARIO
  (falsificare leggendo `decodedToken.uid`: il delegato riceve i propri).
- **Parole e somme** (`allocazioneSummary`, `allocazioneNarrative`): righe + «Resto letto» + «Non letto» = 100 sullo
  schermo; ogni clausola della copertura cade a importo zero; la base nominata per vista.
- **Browser**: `e2e/allocation.spec.ts` (1440) la riga di copertura e l'elenco che torna; `e2e/allocation.mobile.spec.ts`
  (390) la stessa riga, nessuno sforamento di `main`. Yahoo lo chiama il SERVER (`yahoo-finance2` dentro la route),
  quindi `page.route` non lo vede: la cintura è il seed, che scrive un profilo FRESCO per OGNI ticker quotato del
  fixture base (`VWCE.DE`, `AAPL`, `FONDOPENSIONE` — un `etf` con ticker, quindi quotato — e `BTP`/`BTC` se il loro
  `type` chiede un modulo, § 4.5), vuoto dove Yahoo non ha nulla. Con il seed completo la route non ha ticker da
  chiedere; la prova che non chiama Yahoo è il test della route (0 `quoteSummary`). Falsificare seminando VUOTO (e
  fresco) il profilo di `VWCE.DE`: la tessera dice «non letto» con il suo nome, senza dipendere dalla rete.
- **Suite**: area Allocazione (AGENTS.md § 5), `assetExposure`, `apiAuthRoutes`, Vitest nei due fusi, E2E completo.

## 8. Collaudo guidato

- **A**: `e2e/allocation.spec.ts`, le suite d'area. **C**: § 7 con le falsificazioni viste rosse.
- **D**: `curl` della route: 200 sul proprio `userId`, 403 su un altro (stesso documento, controllo positivo prima).
- **E**: il delegato: grant seminata, login come secondo account, la tessera mostra gli strumenti del proprietario.
- **F** (mirror, 1440 e 390): 1) la riga di copertura dice il vero sui tuoi strumenti; 2) un ETF a leva pesa di più in
   Titoli e uguale in Emittenti; 3) gli euro della base combaciano con Per classe; 4) la seconda apertura è immediata;
   5) «Aggiorna» e la data nel piè di pagina. Non coperto: il rate limit di Yahoo in produzione.
- **G**: `npm run mirror:remove`; i profili seminati dal giro restano (sono dati pubblici di Yahoo).

## 9. Rischi e rollback

- **Yahoo cambia forma**: `yahooSource` è l'unico file che lo tocca, e non lancia mai; una forma inattesa è «non letto».
- **Le rules**: il blocco nuovo e la rimozione di `exposure-cache` sono inerti finché non deployati; il deploy si fa in
  sessione con l'OK del proprietario, o la spec resta aperta e lo dice (AGENTS.md § 5: il login CLI scaduto dà 401 su
  `serviceusage`).
- **Le percentuali cambiano per tutti**: «NVDA 3%» diventa una quota dell'azionario, più alta di prima. Lo dice la base
  nominata nell'aside, e lo dice la voce del draft.
- **Un tab aperto col bundle di prima** chiama `/api/portfolio/exposure`, che non c'è più: 404 → il ramo d'errore della
  tessera con «Riprova» (`EsposizioneTile.tsx:202-209`) sopra l'ultimo elenco in memoria. Si risolve al primo reload,
  nessun dato toccato: si accetta.
- **Rollback**: un commit; la route vecchia torna con un revert, la collezione nuova resta inerte.

## 10. Documentazione da aggiornare

`CLAUDE.md` «Latest» e la riga Allocazione; `doc/guide/allocazione.md` (§ Files, `:131` che oggi dice «keyed on the
composition» ed è falso, `:144` la base della colonna, `:154` Playwright, i blind spot); `AGENTS.md` § Caching (la cache
condivisa che il client NON legge) e § Shared Constants (l'asimmetria dei moduli di Yahoo, la chiave); `README.md:34`;
`doc/perf/README.md` § 3 e § 6 e PERF-10 (§ A chiusa qui); `doc/mobile/README.md` § 6 e MOB-07; `Draft Release Temp.md`
(New Features + Bug Fixes: l'account condiviso, la cache), senza dati privati; la risposta sull'issue #402.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-00-esposizione-leva-copertura-cache.md: l'Esposizione di
Allocazione con la leva come nozionale, la riga di copertura a quattro destini, la base del portafoglio di Allocazione,
UNA cache condivisa per ticker con le sole risposte di Yahoo e la pesatura nel browser sugli asset della pagina; la route
diventa owner-scoped (oggi un delegato vede la propria esposizione) e la vecchia route, il vecchio servizio e
exposure-cache si ritirano. Il fork di Ciocc128 è un riferimento da leggere, non codice da portare.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Caching, § Server Layer and API Authorization, § Firestore Writes, § Firestore Queries
  and the Rules, § React Query and Derived State, § Hierarchy, § Audit habits), CLAUDE.md
- Leggi doc/guide/allocazione.md, patrimonio.md, account-condiviso-demo.md, stati.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e questa spec per intero; doc/perf/PERF-10 § A e doc/mobile/MOB-07 § 4.2
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le cinque domande di § 4.9 con lo
strumento interattivo prima di scrivere codice; nessuna cifra del mirror in test, documenti o draft; il deploy delle
rules solo con il mio OK.
Chiusura: il test della route visto ROSSO sul codice di oggi; le falsificazioni di § 7 viste ROSSE; curl 200/403; il
delegato nel browser; tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO con il seed dei profili completo (nessun ticker del
fixture da chiedere a Yahoo); giro
guidato di 5 punti sul mirror a 1440 e 390, poi mirror:remove; la documentazione di § 10 in UN diff; la bozza della
risposta sull'issue #402; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** Un motore nuovo con due regole di misura, quattro destini per ogni euro, una cache
condivisa che non deve contenere nulla dell'utente e un confine di autorizzazione da correggere: il rischio è un numero
plausibile e sbagliato, o un dato di un account che compare a un altro.
