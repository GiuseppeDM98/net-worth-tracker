# Collegamenti broker

> **Quando aprire questa guida** — chi tocca `components/settings/BrokerConnectionsSection.tsx`,
> `components/settings/broker/ScalableConnectionTile.tsx`,
> `components/settings/broker/TradeRepublicConnectionTile.tsx`,
> `components/settings/broker/IntesaSanpaoloConnectionTile.tsx`,
> `components/settings/broker/AzimutConnectionTile.tsx`,
> `lib/utils/scalableImport.ts` o `lib/utils/tradeRepublicImport.ts` (i mapping puri),
> `lib/utils/intesaSanpaoloImport.ts` (parser e piano del file XLSX) o
> `lib/utils/intesaSanpaoloWorkbook.ts` (lettura del file, libreria importata in modo lazily),
> `lib/utils/azimutImport.ts` (parser e piano del file XLSX) o
> `lib/utils/azimutWorkbook.ts` (lettura del file, libreria importata in modo lazily),
> `lib/utils/fundComposition.ts` (la composizione pubblicata → `Asset.composition`),
> `lib/utils/fundAllocationClient.ts` (la porta client, a chunk di 40 strumenti per lista) o
> `app/api/portfolio/fund-allocation/route.ts` (la lettura dall'ISIN o dal ticker),
> `lib/utils/fundIdentity.ts` (il nome di un fondo → la sua classe: l'unica decisione sul match),
> `lib/utils/fundIdentityClient.ts` (la porta client, a chunk di 10 nomi),
> `lib/server/eodhd/fundIdentityService.ts` (la Search di EODHD e la cache per nome) o
> `app/api/portfolio/fund-identity/route.ts` (l'identità di un prodotto senza codice),
> `lib/utils/importClassChoice.ts` (la classe che il mercato non ha deciso: la regola dei due
> ponti su file),
> `lib/server/scalableCli.ts` (runner `sc`), `lib/server/scalableService.ts` (profili per
> email, device flow, guard dell'host),
> `lib/server/tradeRepublicQr.ts` (handshake QR), `lib/server/tradeRepublicClient.ts` (sessione),
> `lib/utils/tradeRepublicSession.ts` (involucro della sessione), `app/api/broker/traderepublic/session`,
> `lib/server/qrImage.ts`,
> `app/api/broker/**`, `lib/services/brokerConnectionService.ts` (metadati
> `brokerConnections/{ownerId}/brokers/{broker}`) o `firestore.rules` (la match `brokerSessions`).
> File: `CLAUDE.md` → *Key Features* → *Collegamenti broker*.

## I quattro ponti, e cosa li distingue

- **Ogni broker è un componente e un modulo puri propri.** `BrokerConnectionsSection` possiede la
   pagina e nient'altro: tre tile in una griglia `items-start`. Il resto — come si ottiene la
   sessione o il file, cosa contiene il payload, quali cifre si possono scrivere — è diverso per
   broker, e accorparlo avrebbe prodotto un file da 700 righe con un `broker ===` in ogni ramo. La
   griglia usa `items-start` perché le colonne hanno altezze diverse: senza, la più corta verrebbe
   stirata fino all'altezza della vicina. (La seconda tile della colonna Scalable — «Refresh
   login», le istruzioni da terminale — è stata rimossa quando il login è diventato un device
   flow guidato dal server: `sc login` non si fa più dal terminale dell'utente.)
- **La regola comune è UNA SOLA: una sync legge e non scrive.** Per Scalable è una whitelist di
  argv (`READ_COMMAND_ARGS`); per Trade Republic è una whitelist di topic (`TR_READ_COMMANDS`).
  Trade Republic NON ha una sessione «sola lettura» come la CLI di Scalable, quindi la garanzia è
  **strutturale** — l'elenco chiuso in `tradeRepublicClient.ts` — e non un'impostazione lato
  broker. Aggiungere un comando in quella lista è il cambio che questa guida vieta, esattamente
  come aggiungere un argv in quella. Intesa Sanpaolo non ha una sessione: il file è letto nel
  browser e non viene mai inviato al server, quindi anche lì la garanzia è strutturale.
- **Il doc id dei metadati è il broker, non l'owner** (`brokerConnections/{ownerId}/brokers/{broker}`).
  Con più broker servono più documenti per owner, e le rules non possono estrarre una sottostringa
  da un doc id composto: l'owner resta sul padre, così le rule sopra non si toccano. Il documento
  piatto dell'era mono-broker NON è migrato, di proposito: ogni campo che conteneva
  (`lastSyncAt`, i conteggi, gli id degli asset) lo riscrive la sync successiva, quindi si perderebbe
  solo il «quando» di una lettura passata.

## Trade Republic — sola lettura, collegamento con QR (`tradeRepublicImport.ts`, `tradeRepublicQr.ts`)

- **TRE differenze rispetto a Scalable, e ognuna è imposta dal broker.** Ognuna è una cosa che un
  lettore del tile Scalable scambierebbe per un bug:
  - **Il portafoglio NON porta i prezzi.** `compactPortfolioByType` restituisce
    `{ isin, averageBuyIn, netSize, virtualSize, status, instrumentType, name }` e niente di
    quotabile: Trade Republic quota un titolo come `ticker` su `ISIN.EXCHANGE` e il suffisso
    exchange NON è nel payload. Quindi il ponte **non cerca un prezzo**: i nuovi asset nascono con
    `autoUpdatePrice: TRUE` e li quota il path Yahoo di sempre. Indovinare un exchange metterebbe
    un prezzo sbagliato su un asset reale, che è peggio di un prezzo che arriva al cron dopo.
    Conseguenze: **il plan non ha un ramo prezzo** (i `kind` sono `new` / `drift-only` /
    `unchanged`, e `plan.stats` non ha `priceUpdateCount`) e la chiusura della narrazione NON dice
    «i prezzi si aggiornano».
  - **La cassa è un saldo REALE, non un residuo.** `valuation − securities − crypto` era l'unico
    modo di Scalable perché la sua overview non espone altro; Trade Republic pubblica il conto
    cassa stesso (`cash`, importi in unità **maggiori** — `projectCash` dell'SDK mappa `amount`
    verbatim, nessuna divisione per 100). Niente da sottrarre, e il saldo non può diventare
    negativo per aritmetica.
  - **I piani di accumulo sono una REGOLA, non un fatto.** Uno Sparplan non è una posizione né una
    transazione, e nessun campo di `Asset` lo contiene: sono **dichiarati** nell'anteprima (con
    l'asset che comprano, agganciato per ISIN) e **mai scritti**. Stessa postura del tasso del
    deposito Scalable.
- **Il prezzo lo riempie la route, tre sorgenti in ordine** (`withQuotes`). PRIMA il topic
  `ticker` del broker stesso (`readTrTickerQuotes`: `<ISIN>.LSX`, misurato live — TSLA 310,7 €,
  VWCE 169,44 €): autorevole, in EUR, senza mapping di simboli. POI Yahoo sul simbolo risolto,
  MAI sull'ISIN grezzo — Yahoo non quota un ISIN nudo (misurato su ISIN azionario ed ETF:
  nessuna quotazione), e quotare `holding.isin` non prezzava nulla: ogni posizione entrava a
  0 con G/P −100% per sempre, perché anche il refresh quota `asset.ticker` e anche lì trovava
  l'ISIN. Il simbolo Yahoo viene dalla tabella curata o dalla derivazione crypto
  (sotto) e viaggia su `holding.yahooTicker`, così il ticker scritto resta quotabile per ogni
  refresh futuro. Il prezzo si allega SOLO in EUR: una quotazione estera sotto la currency EUR
  leggerebbe come euro fino al primo refresh. Serve perché `AssetFormData.currentPrice` è
  obbligatorio: senza, un portafoglio sincronizzato nasce a 0 e il patrimonio dell'utente cala
  di tutto ciò che possiede. Il fallimento **non è fatale e non è silenzioso**: una quotazione
  mancante lascia `price` ASSENTE e il plan ne fa un avviso che nomina la posizione. Uno `0`
  lì sarebbe una lettura che il broker non ha mai dato.
  - **Il topic `ticker` è pubblico** (niente sessione) ma si legge dal client di sessione per
    riuso connessione; una quota che non arriva mai bloccherebbe la sync, quindi ogni
    strumento ha un timeout rigido (8s) e il miss è fail-open. Misurato: la hanging osservata
    in locale è il motivo del timeout, non un dettaglio.
  - **Crypto: lo pseudo-ISIN `XF000…` porta il codice della moneta** (`XF000BTC0017` → la
    posizione Bitcoin misurata su un conto reale, 2026-09-30). `resolveTrYahooTicker` ne deriva
    `BTC-EUR`, che Yahoo quota: il ticker scritto è quello, l'`isin` resta l'id broker per il
    match, e una re-sync ripara il ticker di un asset tracciato solo se è ancora il
    pseudo-ISIN grezzo (mai uno corretto a mano).
  - **Azioni/ETF: il simbolo Yahoo lo mette l'utente, nella riga dell'anteprima.** Indovinare
    il suffisso exchange metterebbe un prezzo sbagliato su un asset reale — la regola della
    sezione Scalable vale identica. L'avviso non promette più «si aggiornerà alla prossima
    quotazione» (falso: non sarebbe mai arrivata) ma dice dove scrivere il simbolo. Uno
    strumento davvero non quotato da nessuna parte resta a prezzo manuale per costruzione
    (SpaceX e Bending Spoons sembravano il caso, poi misurate quotate — `SPCX` e `BSP`).
- **Più saldi EUR sono PIÙ conti, mai una somma** (`parseTrCash` ritorna una LISTA). Il piano
  traccia il primo e **dichiara** gli altri per importo. La lezione Scalable (deposito ≠ liquidità)
  vale identica: due saldi presso un broker sono due conti, e sommarli li fonderebbe silenziosamente.
- **`amount` dei piani di accumulo è l'unica cifra non verificata** contro un account reale: l'SDK
  passa il valore del topic intatto (a differenza di `cash`, non ha un `projectMoney`), e il client
  web di Trade Republic lo manda in unità minori. Passa quindi da **UNA costante**
  (`SAVINGS_PLAN_MINOR_UNIT_DIVISOR`) e l'anteprima stampa la cifra calcolata, così un'assunzione
  sbagliata è visibile e non solo sbagliata. Non inlineare un `100` altrove.
- **`netSize`, non `virtualSize`.** `virtualSize` conta gli ordini non regolati: una vendita in
  attesa si leggerebbe come una posizione che l'utente non ha più. E uno `status` **non
  riconosciuto** mantiene la posizione: cancellare una posizione reale perché il broker ha
  rinominato uno stato è il fallimento peggiore qui, e sarebbe invisibile.
- **Il login è un QR e il FRONTEND lo mostra** (`tradeRepublicQr.ts` + `login/start` +
  `login/status`), misurato sull'API prima di scriverlo:
  `POST /api/v2/auth/web/login/qr-challenges` → `challengeId`; il poll su `qr-challenges/{id}`
  restituisce `qrCodePayload` (il payload da **codificare**, e **ruota** finché non viene
  scansionato: l'UI sostituisce l'immagine, non la congela) e poi `processId`; da lì il poll su
  `login/processes/{id}` finché non arriva il cookie `tr_session`.
  - **Il QR è una CREDENZIALE finché il challenge vive**, quindi è reso in immagine **sul server**
    (`qrImage.ts`) e al browser viaggia solo la `data:` URL. Il payload è comunque mostrato come
    testo accanto all'immagine: un QR richiede un **secondo dispositivo**, e chi legge da telefono
    non può scansionare lo schermo che ha davanti.
  - **La sessione SOPRAVVIVE al riavvio** (`brokerSessions/{ownerId}`, solo Admin SDK, rules
    `allow read, write: if false`). È la differenza vera rispetto a Scalable: lì la sessione sta
    nel keyring della macchina e un riavvio la dimentica; qui è un documento, e i cookie che
    l'SDK rinnova vengono riscritti dopo ogni lettura (`persistRefreshedSession`). L'in-flight
    vive invece in memoria e un riavvio lo dimentica → 404 → l'UI riavvia il flusso.
  - **Il jar è unito per NOME**: il broker ri-emette `tr_session` durante l'handshake e deve
    vincere il valore più recente, altrimenti il poll ripropone per sempre il cookie
    pre-approvazione. Il traguardo sono **ENTAMBI** i cookie, `tr_session` **e** `tr_refresh`:
    l'SDK rifiuta un restore senza il secondo (non può rinnovare senza) e anche il suo login
    li controlla entrambi. Fermarsi al primo avrebbe salvato una sessione leggibile una volta e mai
    rinnovabile — un fallimento che l'utente avrebbe incontrato alla prima sync, senza indizi.
  - **L'involucro della sessione sta in `lib/utils/tradeRepublicSession.ts`, non nel modulo server**,
    per un motivo misurato: `version` è il **NUMERO** `1`. Lo schema dell'SDK è
    `type({ version: "1", cookies: "string[]" })` e in **arktype un letterale numerico tra apici è
    un numero**, quindi la forma stringa è rifiutata con «version must be 1 (was "1")». Scriverla
    come `"1"` ha prodotto «Invalid exported Session» alla **prima sync**, molto dopo che il login
    QR era riuscito e aveva salvato una sessione perfettamente valida. `parseTrSession` tollera la
    forma legacy e la riscrive: quei cookie sono buoni e obbligare a riscanire un QR per riparare
    un dettaglio di serializzazione sarebbe il consiglio sbagliato. Il test asserisce contro
    `TRClient` vero, non contro un commento.
  - **Una sessione che l'SDK rifiuta è una sessione MORTA**, non un errore inatteso: il costruttore
    la parla e può buttare, quindi `buildClient` la traduce in «ricallegati» (401). Non tralasciata,
    la stessa cosa arrivava come 500 con dentro il messaggio di arktype.
  - **Per UTENTE, non per macchina** (a differenza di `sc`): ogni entry porta il proprio jar, quindi
    due proprietari di uno stesso host non condividono la sessione. `getTrLogin` esige `ownerId` e
    una sessione d'altri è un 404, non uno stato — altrimenti un utente qualsiasi potrebbe vedere
    il QR di un altro.
  - **Il WAF è dichiarato, non nascosto.** Tre client Trade Republic alternativi girano un browser
    headless solo per un `x-aws-waf-token`; questo modulo non lo chiede, perché nemmeno il path
    telefono+PIN dell'SDK ne ha bisogno. **Se gli endpoint QR siano protetti non è stato verificabile
    da qui**: un 403 con challenge WAF diventa quindi `TradeRepublicWafError`, con parole sue e uno
    status proprio, perché il rimedio (un passo col token) è un altro lavoro e l'utente deve poterlo
    dire. Non è un errore di credenziali e non si risolve ritentando.
- **Il salvataggio scrive solo asset nuovi e la cassa.** Nessun prezzo (non letto), nessuna
  quantità (è del Registro), nessun piano di accumulo (una regola del broker).

##Collegamenti broker — sync in sola lettura da Scalable (`scalableImport.ts`, `scalableCli.ts`)

- **L'app non parla mai con Scalable: parla con `sc`, e solo in locale.** Il login OAuth
  (device flow) e la sessione vivono nel keyring della macchina dell'utente, dove solo il
  binario `sc` li raggiunge. La route esegue con `execFile` (niente shell) TRE argv fissi —
  `broker holdings --json`, `broker overview --json` e `overnight --json` — e nessun campo
  della request tocca mai la riga di comando. Su un deploy ospitato il binario manca: la route
  risponde 503 e il tile offre il fallback incolla-JSON, che usa gli STESSI parser puri.
- **Solo lettura, per costruzione.** La whitelist è l'intera superficie eseguibile
  (`READ_COMMAND_ARGS` in `lib/server/scalableCli.ts`): aggiungere un comando di scrittura
  lì dentro è il cambio che questa guida vieta. `sc login --local-read-only` è l'unico argv
  fuori dalla superficie di LETTURA (`SCALABLE_LOGIN_ARGS`, stesso file) e non è una scrittura
  verso il broker: scrive una sessione nel keyring di questa macchina e non legge nulla
  dall'account. Il `--local-read-only` non è opzionale — è ciò che rende una sessione rubata
  incapace di ordinare, quindi solo di leggere.
- **Il login è un device flow che il FRONTEND può mostrare** (`ScalableService` +
  `login/start` + `login/status`). Misurato prima di scriverlo: con stdout in pipe e stdin
  chiuso `sc login` stampa `https://secure.scalable.capital/activate?user_code=…` e il codice,
  poi attende. Quindi `human_only` in `sc capabilities` riguarda l'APPROVAZIONE, non il
  terminale. L'output arriva a CHUNK: il parser accumula (`output += chunk`) e lo ri-matcha a
  ogni chunk, perché un `user_code=` spezzato in due letture non matcherebbe mai
  (`__tests__/scalableService.test.ts`, casi chunk-splitting).
  - **Il server deve essere SEMPRE ATTIVO.** Non è una preferenza: il processo figlio deve
    sopravvivere tra l'avvio e l'approvazione, e il token deve vivere in uno store persistente.
    Su Vercel/Lambda `assertLongLivedHost` (in `scalableService.ts`) rifiuta al click — la
    route lo risponde come 503 con «Anteprima dal testo» come rimedio — invece di half-working.
  - **Lo stato di una sessione non è leggibile da altri**: `getLoginSession` esige il
    PROFILO, e una sessione d'altri risponde 404 come se non esistesse. Un riavvio del server
    la dimentica: la UI riavvia il flow invece di mostrare un errore.
  - **Il consenso resta a Scalable**: l'app non vede né riceve credenziali, mostra un link e un
    codice monouso. Il codice non viene loggato.
- **Una sessione per EMAIL, non per macchina** (dal 2026-09-28; prima: una sola nel keyring).
  Ogni email in `SCALABLE_PROFILES` ottiene un profilo e un `XDG_CONFIG_HOME` proprio
  (`…/profiles/<profilo>`): `sc` risolve la config da quella variabile e, con
  `[auth] session_backend = "file"` nella `config.toml` (scritta al primo uso, un solo
  scrittore: `runScalableReadCommand`), sposta sessione, chiave DPoP e refresh token dal
  keyring a un file dentro la directory. Il login si rinnova da solo e il logout non serve
  più. Misurato su questo binario: con `XDG_CONFIG_HOME` vuoto l'errore è «The DPoP
  signing key … is missing» (sessione trovata nel keyring, chiave altrove); con
  `session_backend = "file"` diventa «No active session. Run 'sc login'» — il config è stato
  letto e lo store è un altro.
  - **Chi può sincronizzare è config di deploy, non codice**: `SCALABLE_PROFILES`
    (`profilo:email,…`, server-only, mai `NEXT_PUBLIC_`). Il profilo diventa un segmento di
    path, quindi il parser accetta solo `[A-Za-z0-9_-]`. Senza la variabile, ogni chiamata al
    ponte risponde 403. Vedi SETUP.md § 4b.
  - **`sc logout` dopo ogni sync NON è la risposta**, ed è importante dirne il perché: la
    finestra di esposizione è la sync stessa (fra «sessione salvata» e logout, qualsiasi lettura
    in corso prende la sessione corrente), e si pretenderebbe un MFA — quindi un link — prima di
    ogni singola sincronizzazione.
  - **Il file su disco è più debole di un keyring** (directory 0700, config 0600): per un
    server che deve per forza tenere i token è lo standard; su un desktop sarebbe un
    peggioramento che non ha senso fare.
  - **Bonus non previsto: risolve anche il deploy headless.** `session_backend = "file"` è la
    strada documentata quando il keyring D-Bus non esiste, quindi la stessa impostazione rende
    utilizzabile la sync su una VM senza keyring.
- **Un comando, un payload, nella sua chiave** (`{ holdings, skipped }` · `{ overview }` ·
  `{ overnight }`), mai un `plan`: il piano lo compone il client, che ha già gli asset
  tracciati. La route ha risposto `{ plan }` per `holdings`/`overview` mentre il client leggeva
  `res.holdings`/`res.overview`: due chiavi `undefined`, silenziosamente diventate `[]`/`null`
  dal `??` del client, e l'anteprima mostrava ZERO posizioni e NESSUNA liquidità dichiarando
  sincronizzazione riuscita. La forma della risposta è bloccata da
  `__tests__/scalableReadRoute.test.ts`, e il client rifiuta una chiave mancante invece di
  defaultedarla a zero.
- **La quantità dei tipi ledger non si scrive mai.** `quantity`/`averageCost` di
  stock/etf/bond/crypto/commodity sono del Registro (replay): la sync aggiorna solo
  `currentPrice` via `updateAssetMetadata` e riporta lo scostamento come avviso da
  riconciliare con una rettifica (`quantityDrift` nel plan, mai una write). I nuovi asset
  nascono con `autoUpdatePrice: false` e `ticker` = ISIN — il prezzo lo porta la sync, non Yahoo.
- **La liquidità è un residuo, e va detto.** `valuation − securitiesValuation − cryptoValuation`
  dall'overview è la stima di cassa (`resolveScalableCashBalance`); il conto di destinazione
  lo sceglie l'utente (esistente o «Scalable — Liquidità», mai assegnato in silenzio).
- **Il deposito non vincolato NON è la liquidità broker** (2026-09-25, misurato: cassa broker
  120,00 € contro un deposito di 59.201,61 €). `sc overnight --json` legge un saldo separato,
  che la valuation del broker NON contiene: i due non si sommano mai e non si fondono in un
  conto solo. Ogni cifra ha il suo conto («Scalable — Liquidità» / «Scalable — Deposito»,
  `SCALABLE_CASH_TICKER` / `SCALABLE_DEPOSIT_TICKER`).
  - **L'identità dei due conti è il `ticker` scritto, non il nome né il `exchange`**: l'utente
    può rinominare un conto, e un match per nome (o per il `exchange: 'Scalable Capital'`
    condiviso) creerebbe un duplicato alla sync successiva.
  - **Il rendimento e la data di pagamento sono DICHIARATI, non scritti**: nessun campo di
    `Asset` tiene un tasso, e un cash asset non accresce nulla da solo. L'anteprima li mostra e
    dice che restano nel broker.
  - **Una lettura overnight fallita non è un deposito azzerato**: la `Promise.all` della sync la
    tiene FUORI apposta, così posizioni e cassa si sincronizzano comunque e l'anteprima dichiara
    («Deposito non vincolato non letto: …») invece di mostrare uno zero. `plan.deposit` è `null`
    quando non è stato letto, e un saldo 0 letto davvero resta uno zero da sincronizzare.
- **Persistono solo i metadati.** `brokerConnections/{ownerId}/brokers/{broker}` (rules
  sull'owner del padre, `userId` e `broker` coincidenti con il path) tiene quando/quante
  posizioni/cassa — mai token, mai output grezzo. La pagina resta senza verdetto: il tab
  Collegamenti è un form con tre tile (una per broker, solo sync o import).
- **Le letture riuscite vivono 60 secondi in memoria, per profilo.** Il secondo
  «Sincronizza» entro un minuto rilegge la cache, non il broker — voluto (una sync sono tre
  spawn di CLI), ma la cache è per PROCESSO: su un deploy con più istanze ogni istanza ha la
  sua. Una lettura OVERNIGHT fallita non entra mai in cache: il fallimento non è una lettura,
  e la sync successiva riprova.
- **Il mapping del tipo broker è best-effort.** `mapScalableType` copre ETF/azioni/bond/fondi/crypto;
  l'ignoto cade su ETF azionario con `typeUncertain` — l'anteprima lo nomina, la correzione sta
  su Patrimonio. Stessa regola per il `taxRate` proposto (26%, 12,5% sui bond).

## Intesa Sanpaolo — import del file `.xlsx` (`intesaSanpaoloImport.ts`, `intesaSanpaoloWorkbook.ts`)

- **Intesa non ha un'API di lettura per il retail, quindi il ponte è il file.** L'utente esporta il
  portafoglio dal sito della banca e carica l'`.xlsx` nella tile: il file è letto nel BROWSER
  (`readIntesaWorkbookFile`, libreria XLSX importata lazy) e non lascia mai la macchina. Solo
  `.xlsx`: il CSV non è accettato, e il controllo sta sia nell'`accept` dell'input sia nella
  funzione di lettura.
- **Il parser legge per INTESTAZIONI, mai per numeri di riga.** L'export ha una sezione per conto,
  una tabella per fondi/SICAV, una per obbligazioni/certificati e la sezione liquidità; le righe
  vuote e i titoli di sezione si spostano quando l'utente aggiunge un conto, ma ogni tabella ripete
  `Descrizione`/`ISIN`. Una tabella con `Quantità` e `Prezzo medio fiscale` è obbligazionaria, le
  altre sono fondi.
- **I numeri sono ITALIANI: il punto è separatore delle migliaia e la virgola è il decimale**
  (`2.995` è 2995, `1.234,56 €` è 1234.56, `19.699,016` è 19699.016). `parseIntesaNumber` è l'unica
  regola; un `16.29.36` di `Data-Ora` non deve mai attraversarla.
- **Nessun salvataggio senza anteprima**, stessa postura degli altri ponti. Le posizioni nuove
  nascono con `exchange: 'Intesa Sanpaolo'`, `autoUpdatePrice: false` (il file è la fonte), `ticker`
  dal catalogo ISIN o l'ISIN, `taxRate` 26% sui fondi e 12,5% sulle obbligazioni.
- **Una posizione già tracciata si riconosce per ISIN e non si duplica.** Di lei l'import ripara
  solo prezzo ed etichetta broker, MAI la quantità: per i tipi ledger `quantity`/`averageCost`
  appartengono al Registro, e uno scostamento è un avviso da riconciliare a mano. La patch dei
  metadati passa a `updateAssetMetadata` insieme a `taxRate` e `displayTicker` correnti, perché su
  quel path un campo assente è un `deleteField()`: senza, un aggiornamento di prezzo cancellerebbe
  aliquota e alias.
- **La liquidità è un conto suo** (`Intesa Sanpaolo — Liquidità`, ticker stabile `INTESA-EUR`): il
  saldo è il `Saldo totale` del file, il conto si crea la prima volta e si aggiorna per ticker (mai
  per nome, che l'utente può rinominare). Un import successivo non crea duplicati.
- **Solo metadati persistono** (`brokerConnections/{ownerId}/brokers/intesa`): quando, quante
  posizioni, saldo e id del conto. Mai il file, mai le righe grezze.
- **La classe dei fondi è best-effort** (`inferFundClass`): le parole `BOND`/`OBBLIG`/`TESORERIA`
  danno bonds, `EQUITY`/`WORLD`/`RESEARCH` danno equity, un multi-asset cade su equity con
  `typeUncertain` — e quando nessuna parola decide, **la riga dell'anteprima chiede la classe**
  (vedi «La classe scelta a mano»): la deduzione dal nome non viene scritta, la scelta sì. Un
  certificato è sempre `bond`/`bonds`.
- **La composizione di un fondo si legge dall'ISIN, o dal ticker quando l'ISIN non c'è, e i
  fondi ibridi si scompongono davvero**
  (`lib/utils/fundComposition.ts`, `GET /api/portfolio/fund-allocation?isins=…&tickers=…`): Yahoo pubblica in
  `topHoldings` i sei campi `stockPosition`/`bondPosition`/`cashPosition`/`otherPosition`/
  `preferredPosition`/`convertiblePosition` come frazioni del fondo INTERO, e l'import li traduce in
  `Asset.composition` — `stock`→equity, `bond`/`preferred`/`convertible`→bonds, `cash`→cash,
  `other`→la classe dell'asset — normalizzate a 100 esatti, gambe sotto l'1% scartate e lo scarto
  di arrotondamento sulla gamba più grande. La `assetClass` salvata diventa la gamba più grande,
  così un lettore che ignora `composition` mostra la sleeve reale. **Una composizione già digitata
  non viene MAI sovrascritta**; una esistente ma vuota viene riempita (`compositionUpdate`, kind
  `composition-update`). Fail-soft: un ISIN che Yahoo non legge resta ASSENTE (mai 0/0/0), la riga
  chiede la classe all'utente, e l'import parte solo dopo la scelta. La route è autenticata ma non
  owner-scoped (la risposta è di Yahoo, condivisa da ogni account) e non è un proxy Yahoo: due
  liste chiuse e limitate (`isins=` e `tickers=`, 40 ciascuna — un ISIN non è un ticker e il
  client non le mescola), un modulo `fund` ciascuno, attraverso la cache per ticker. Quella
  cache richiede di nuovo un modulo `fund` privo di `allocation` dopo 24 ore (`requireAllocation`),
  così i documenti scritti prima che il campo esistesse si sanano al primo import invece di
  aspettare il TTL di 30 giorni.
- **Il certificato porta un prezzo in EURO PER UNITÀ, non una quotazione % di Borsa.** Il file
  dell'esempio lo quota `1.014,9 €` con PMC `1.000 €`: il valore importato è corretto, ma
  l'editor di Patrimonio applica la convenzione `% del nominale` (nominale 1 €) a ogni bond con
  ISIN, quindi mostrerebbe `101.490` come prezzo. L'anteprima lo dichiara e la nota dell'asset lo
  ricorda; non è un errore di lettura e non si corregge cambiando il prezzo importato.

## Azimut — import del file `.xlsx` (`azimutImport.ts`, `azimutWorkbook.ts`)

- **Import del file XLSX con 4 fogli distinti**: Azimut esporta un file `.xlsx` contenente i fogli `AZIMUT - GESTITO`, `AZIMUT - ECONOMIA REALE`, `AZIMUT - AMMINISTRATO` e `AZIMUT - LIQUIDITA`.
- **Il foglio `AZIMUT - GESTITO` non porta ALCUN codice: la forma del file è la regola.** L'export vero (fixture `__tests__/fixtures/azimut-portfolio.xlsx`, 34 posizioni) non ha **una sola cella a forma di ISIN** in nessuno dei quattro fogli; `AZIMUT - GESTITO` espone solo Macro Prodotto, Prodotto, Contratto, Quantità, Divisa, PMC e prezzo, e il «codice» di quelle righe è il NOME del prodotto (il parser lo mette in `ticker` come identità di match, mai come simbolo). **La ricerca per nome su Yahoo è stata misurata e non è usabile** (nessun risultato per «Fidelity Funds Global Multi Asset Defensive», ETF non correlati in fuzzy, classi `0P…` anonime): l'identità si chiede a EODHD (bullet successivo).
- **L'identità di un fondo senza codice viene dal NOME, con EODHD — ma solo se è UNIVOCA.** La tile chiede prima `GET /api/portfolio/fund-identity?names=…` (autenticata, non owner-scoped: la risposta è di EODHD e il documento di cache non contiene nulla dell'utente; massimo 10 nomi per richiesta) per le sole righe `needsFundIdentity` (un fondo senza ISIN e senza ticker vero). `matchFundIdentity` (`lib/utils/fundIdentity.ts`) decompone il nome in strategia + classe + divisa + copertura + accumulo/distribuzione e **pretende che ogni parte coincida**: «Global Multi Asset Defensive A» non è la «Tactical Defensive A» (che EODHD elenca con lo stesso ISIN di un'altra classe — attaccarlo darebbe al fondo il prezzo e la classe di un altro), `EURHDG` non è la classe senza copertura, una `A-MINCOME` non è una `A-Acc`. Zero o due candidati rispondono `none`/`ambiguous` e **non si sceglie**: la riga resta senza ISIN e lo dice. `buildFundIdentityQuery` manda a EODHD la sola strategia (senza `"C" (EUR) ACC`), perché la Search API è un AND di token: il nome intero risponde 0 risultati, la strategia risponde tutte le classi (misurato 2026-10-22). La cache è `fund-identity-cache/{encodeURIComponent(nome normalizzato)}` — **Admin SDK soltanto** (`allow read, write: if false`), 90 giorni per una risposta `matched`, 7 per una `none`/`ambiguous`; un `unavailable` non viene mai messo in cache, così il prossimo import richiede. Senza `EODHD_API_TOKEN` ogni nome risponde `unavailable` e l'import funziona lo stesso (l'anteprima lo dichiara). Il piano gratuito EODHD consente la Search e **rifiuta i fundamentals** (403 «Only EOD data allowed for free users»): l'identità sì, la classe no.
- **Estrazione codice ISIN o ticker Bloomberg**: in `AZIMUT - AMMINISTRATO`, per le sezioni Azioni, Obbligazioni e ETF/ETC/ETN, viene estratto l'ISIN o il ticker tra parentesi (convertendo i suffissi Bloomberg come `GY` → `.DE`, `IM` → `.MI`, `FP` → `.PA`). Le indicazioni di valuta tra parentesi come `(EUR)` vengono ignorate.
- **Il ticker estratto è un'identità di mercato, non solo un'etichetta**: `azimutAllocationLookup` è L'UNICA regola su cosa si può chiedere a Yahoo — l'ISIN se c'è, altrimenti il ticker del foglio, mai il nome del prodotto (la tile che prepara la domanda e il piano che la abbina leggono la stessa funzione). **Dal 2026-10-22 la chiave del mix è `azimutAllocationKey(position) ?? identity.isin`**: l'ISIN che la ricerca per nome ha trovato è anche la chiave con cui la composizione pubblicata arriva.
- **La classe di un fondo viene dal MIX PUBBLICATO quando c'è** (`resolveAllocationClass`, `lib/utils/fundComposition.ts`): il secchiello MISURATO più grande decide la classe. Serve perché un fondo quasi mono-classe non produce `composition` (una gamba sola non è una composizione) e senza questa regola finirebbe `azionaria` per ripiego: `GRID.MI` è 99,45% azioni, `FLXI.MI` 99,98%. **`other` non è una classe** — è ciò che Morningstar non ha saputo collocare — quindi un fondo tutto `other` (i due coperti `EUJP.MI`/`USEU.MI`) resta `measured: false` e **la riga chiede la classe all'utente** (non c'è mix che la nomini). `buildAzimutImportPlan` chiude la domanda solo con `hasComposition || allocationClass.measured`, mai contando le gambe. Quando l'ISIN c'è ma il mix no, l'ISIN resta **sulla riga** (`displayCode`): è l'identità, non la classe — e la classe la sceglie l'utente.
- **Un mix valido non si perde per un modulo che non c'entra**: `quoteSummary(symbol, ['topHoldings','fundProfile'])` valida TUTTA la risposta e lancia quando `fundProfile.brokerages` torna come array di NOMI (Yahoo lo fa: misurato su `0P00017T6E.F`, «R-co Valor C EUR») — il mix di `topHoldings` andava perso con lui. `quoteSummaryLoose` riprova una volta con `{ validateResult: false }` e i normalizzatori restano difensivi (una forma inattesa è un profilo vuoto).
- **Liquidità**: la sezione `AZIMUT - LIQUIDITA` rileva il saldo del conto corrente e crea/aggiorna il conto di cassa `Azimut — Liquidità` con ticker fisso `AZIMUT-EUR`.
- **Anteprima e persistenza**: le posizioni nuove nascono con `exchange: 'Azimut'` e `autoUpdatePrice: false`; un fondo senza codice nasce con l'ISIN trovato (è la sua `ticker`), quindi riconoscibile al prossimo import e alla ricerca del suo mix. Un asset già tracciato **non cambia identità**: se non ha ISIN e la ricerca ne trova uno, il piano lo scrive (`identity-update`, una scrittura di metadati) e **non sostituisce mai** un ISIN già presente — e non riscrive mai il ticker. Solo i metadati di sincronizzazione sono salvati in `brokerConnections/{ownerId}/brokers/azimut`.
- **FundFacts è stato scartato**: l'API richiede una chiave (`ffk_…`) anche per la ricerca, e il suo indice pubblico elenca 533 ISIN — non le due Fidelity in questione. EODHD l'ha sostituito perché la Search non richiede un piano a pagamento (i fundamentals sì), quindi una chiave `EODHD_API_TOKEN` server-side e il modulo `lib/server/eodhd/fundIdentityService.ts`.

## La classe scelta a mano — i due ponti su file (`importClassChoice.ts`)

> I due ponti che leggono un file (Intesa, Azimut) chiedono la classe CHE IL MERCATO NON HA DETTO, e
> la chiedono DOVE LA DECISIONE SI FA: la riga dell'anteprima.

- **La regola è UNA e vive in `lib/utils/importClassChoice.ts`, che i due ponti leggono.** Tre righe:
  - una riga che il mercato non ha classificato (nessun mix pubblicato, nessuna identità) **aspetta
    una classe dall'UTENTE**: la riga dell'anteprima porta un menu a tendina sulle classi
    dell'app (`IMPORT_CLASS_OPTIONS`, che enumera `ASSET_CLASS_SEQUENCE` — mai una lista scritta a
    fianco);
  - una riga che **aggiorna un asset già tracciato** prende la classe **già salvata** (l'import non
    la sovrascrive MAI) → il secondo caricamento dello stesso file **non chiede niente**;
  - un import che porta ancora una riga senza classe **NON parte**: il bottone «Salva nel patrimonio»
    resta disabilitato e il gestore rifiuta comunque (`classChoiceMissing`).
- **Il mix pubblicato è la risposta, la parola del nome è una domanda.** «Il mercato ha deciso» =
  il mix ha prodotto una composizione, OPPURE ha nominato la classe di un fondo quasi mono-classe
  (`resolveAllocationClass`, l'unica regola: `GRID.MI` è 99,45% azioni, `FLXI.MI` 99,98% — senza
  questa regola finirebbero `azionaria` per ripiego). Tutto il resto è la deduzione dal nome, e la
  deduzione non è una classe: la riga chiede.
- **La classe non è più un avviso.** L'avviso «classe non deducibile dal nome, proposta azionaria —
  verifica su Patrimonio» è sparito dai `plan.warnings` delle due tile: la domanda è nella riga, con
  il menu, e il conto delle righe ancora senza classe sta nella riga di stato
  («N di M righe senza classe: sceglila nella riga per importarle»). L'ISIN che la ricerca per nome
  ha trovato resta sulla riga (`displayCode`): quel codice è l'identità, non la classe.
- **La classe scelta viene applicata dal LIVELLO PURO** (`applyAzimutClassChoices` /
  `applyIntesaClassChoices`, sopra `applyClassChoices`): le scelte sono file per CHIAVE DI RIGA (l'id
  della posizione su Azimut, l'ISIN su Intesa), quindi una scelta non può finire sulla riga
  sbagliata, e una riga che non aspettava nessuna scelta tiene la classe che il piano aveva misurato.
- **Una riga che aggiorna un asset tracciato mostra la classe che ha già** («Classe: Obbligazioni (dal
  patrimonio)»): la classe salvata è un fatto dell'asset, e l'import non la tocca.
- **Il piano confronta gli asset CORRENTI, non la lista del hook.** Le due tile costruiscono il piano
  con `queryClient.fetchQuery(assetsQueryOptions(ownerId), { staleTime: 0 })`: la lista dell'hook può
  essere un'ISTANTANEA (la cache persistita ne ripristina l'ultima), e un piano costruito su una lista
  vecchia chiama «nuova» ogni posizione già tracciata — e la crea una seconda volta. L'import è un
  percorso di scrittura: legge gli asset come sono (verificato da `e2e/broker.azimut.spec.ts`).
- **Le suite di questa area**: `__tests__/azimutImport.test.ts`, `__tests__/intesaSanpaoloImport.test.ts`,
  `__tests__/importClassChoice.test.ts` (la regola condivisa) e `e2e/broker.azimut.spec.ts` (il menu
  nella riga, l'import che aspetta, il secondo caricamento che non chiede).

## Per-page blind spots

- **Collegamenti**: «Sincronizza» su un deploy ospitato risponde sempre 503 (manca `sc`) — è il
   degrado previsto, non un bug: il fallback incolla-JSON è la strada; con più portafogli la sync
   legge il contesto attivo del PROFILO (`sc broker context select` con l'`XDG_CONFIG_HOME` del
   profilo, non dal terminale dell'utente — il login ormai avviene lì); la liquidità può risultare
  negativa se i totali non quadrano — è il residuo dei totali broker, non un calcolo dell'app.
  Un utente SENZA conto overnight non deve perdere la sync: la terza lettura è separata e il suo
  fallimento compare come avviso, non come errore. Su Vercel anche «Ricollega Scalable» si
  rifiuta: il flusso è costruito per una VM, e il rifiuto è l'informazione utile. Trade Republic ha
  lo stesso `assertTrLongLivedHost` e lo stesso motivo.
- **Trade Republic**: i prezzi NON vengono dalla sync e la pagina non lo promette — se una posizione
  entra a 0 è perché Yahoo non l'ha quotata, e l'avviso la nomina. Uno Sparplan in pausa compare
  due volte (nel testo e nella colonna) per non poterlo distinguere a colpo d'occhio. Il secondo
  saldo EUR non viene sommato: se ti serve, creane il conto a parte. E un piano di accumulo qui è
  solo DICHIARATO: l'app non lo usa per calcolare la spesa futura, quindi non aspettarti che
  compaia nel Cashflow o nel piano FIRE.
- **Intesa Sanpaolo**: il «Totale Controvalore» del file comprende le posizioni, non la liquidità —
  il saldo arriva dalla sezione Liquidità e diventa un conto a parte. Una riga di certificato porta
  un `Data-Ora` (`16.29.36`) nella colonna della data: non è un numero e non deve finire nel parser
  dei prezzi. Una posizione già tracciata NON cambia quantità tramite l'import: se il file dice
  altro, l'avviso lo dichiara e la rettifica resta manuale. E un fondo multi-asset viene proposto
  azionario SOLO quando Yahoo non ne pubblica la composizione (ISIN non letto): se il mix arriva,
  le gambe sono già in «Composizione» — è la classe di ripiego dichiarata, non un errore di
  lettura. Da oggi la deduzione non viene scritta: la riga chiede la classe all'utente e l'import
  aspetta la risposta.
- **Azimut**: la riga senza classe NON è un errore di lettura: il foglio Gestito non porta alcun
  codice e quei fondi vanno classificati da chi li conosce. La domanda sta nella riga dell'anteprima
  (menu a tendina sulle classi dell'app) e l'import non parte finché una riga ne è senza. L'ISIN che
  la ricerca per nome ha trovato resta sulla riga: quel codice è l'identità (una classe da scegliere,
  non un'identità da inventare). Un import che mostra `—` al posto di un codice sta dicendo la
  verità: il nome del prodotto non è un ticker. Un fondo senza codice che non chiede nulla ha una
  classe MISURATA dal mix (R-CO Valor, 75,6% azioni) — non è una deduzione dal nome.
