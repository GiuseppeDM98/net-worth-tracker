# Collegamenti broker

> **Quando aprire questa guida** — chi tocca `components/settings/BrokerConnectionsSection.tsx`,
> `lib/utils/scalableImport.ts` (mapping puro), `lib/server/scalableCli.ts` (runner `sc`),
> `app/api/broker/scalable/read/route.ts`, `lib/services/brokerConnectionService.ts`
> (metadati `brokerConnections/{ownerId}`). File: `CLAUDE.md` → *Key Features* → *Collegamenti broker*.

## Collegamenti broker — sync in sola lettura da Scalable (`scalableImport.ts`, `scalableCli.ts`)

- **L'app non parla mai con Scalable: parla con `sc`, e solo in locale.** Il login OAuth
  (device flow) e la sessione vivono nel keyring della macchina dell'utente, dove solo il
  binario `sc` li raggiunge. La route esegue con `execFile` (niente shell) TRE argv fissi —
  `broker holdings --json`, `broker overview --json` e `overnight --json` — e nessun campo
  della request tocca mai la riga di comando. Su un deploy ospitato il binario manca: la route
  risponde 503 e il tile offre il fallback incolla-JSON, che usa gli STESSI parser puri.
- **Solo lettura, per costruzione.** La whitelist è l'intera superficie eseguibile
  (`READ_COMMAND_ARGS` in `lib/server/scalableCli.ts`): aggiungere un comando di scrittura
  lì dentro è il cambio che questa guida vieta. `sc login --local-read-only` è la modalità
  raccomandata nel tile Refresh login — blocca gli ordini lato CLI, le letture restano attive.
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
- **Persistono solo i metadati.** `brokerConnections/{ownerId}` (rules come `budgets`: doc id =
  owner, `userId` coincidente) tiene quando/quante posizioni/cassa — mai token, mai output grezzo.
  La pagina resta senza verdetto: il tab Collegamenti è un form con due tile (sync + refresh login).
- **Il mapping del tipo broker è best-effort.** `mapScalableType` copre ETF/azioni/bond/fondi/crypto;
  l'ignoto cade su ETF azionario con `typeUncertain` — l'anteprima lo nomina, la correzione sta
  su Patrimonio. Stessa regola per il `taxRate` proposto (26%, 12,5% sui bond).

## Per-page blind spots

- **Collegamenti**: «Sincronizza» su un deploy ospitato risponde sempre 503 (manca `sc`) — è il
  degrado previsto, non un bug: il fallback incolla-JSON è la strada; con più portafogli la sync
  legge il contesto attivo (`sc broker context select` dal terminale); la liquidità può risultare
  negativa se i totali non quadrano — è il residuo dei totali broker, non un calcolo dell'app.
  Un utente SENZA conto overnight non deve perdere la sync: la terza lettura è separata e il suo
  fallimento compare come avviso, non come errore.