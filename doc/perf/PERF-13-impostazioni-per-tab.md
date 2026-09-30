# PERF-13 — Impostazioni: sei tab, sei componenti, una bozza sola

> Stato: da fare · Priorità: 3 · Sforzo: L · Dipende da: PERF-12 (il compiler memoizza le viste; il census in `scripts/`), PERF-05 (chiusa il 2026-09-29: `useSettings`, `settingsQueryOptions`) · Sblocca: —

## 1. Il problema, misurato

`app/dashboard/settings/page.tsx` è **un componente di 4105 righe** (`SettingsPage` da `:546`) con **70 chiamate a `useState`**, 5 `useEffect`,
5 `useCallback`, 0 `useMemo`; dal 2026-09-29 le letture passano dalle chiavi condivise (`fetchQuery(settingsQueryOptions)`
in `loadTargets` e nel pre-read di «Salva», `useExpenseCategories`, `useAssets`) ma il seed dei 70 stati resta imperativo. Sei tab (generale `:2014`, allocazione `:2774`, spese `:3373`, dividendi `:3686`, condivisione
`:3875`, aspetto `:3915`) gated da `mountedTabs` (`:661`; `allocazione` sempre in `renderedPanels`, `:1855`): Radix smonta i
pannelli inattivi (`TabsContent` senza `forceMount`, `:2013-2021`, `:2774-2782`), ma **il JSX di ogni tab visitata più
allocazione viene ricostruito a ogni render**, e ogni tasto in un campo controllato è un render dell'intera funzione. In
allocazione, `forceMount` sui `CollapsibleContent` per classe (`:3055`) e per sotto-categoria (`:3226`) rende OGNI editor
anche collassato. Al mount, `router.replace(\`${pathname}?tab=${initialTab}\`)` incondizionato (`:688-691`) e a ogni cambio tab
(`:685`): ogni `useSearchParams`/`usePathname` consumer (i `SceneLink`, `AddExpenseFab`) ri-renderizza.

Il proprietario lo sente digitando (2026-09-26). Con il compiler acceso (PERF-12) i FIGLI memoizzano, ma il componente
stesso ha 70 stati e continua a rieseguire 4000 righe di funzione: il compiler non può spezzare un componente. La regola del
repo esiste già: «Prefer rendering large local subtrees as pure render helpers or top-level components» (AGENTS.md
§ Hierarchy). E doc/guide/impostazioni.md fissa la struttura: UN «Salva» per pagina con lo stato di salvataggio PER TAB (un
punto sulla tab, la barra in basso, «Annulla modifiche» come RILETTURA dal server — `loadTargets({ quiet: true })`, così il
salvataggio di un co-proprietario torna), il «Salva» che apre il gruppo e focalizza il campo in errore
(`allocationTargetValidation.ts` dice DOVE).

**Visto sul mirror il 2026-09-29, chiudendo PERF-03 (proprietario, punto 4 del giro).** Impostazioni è, con Rendimenti (PERF-09 § 1), la
pagina che al reload mostra ancora lo skeleton: il documento è letto con `fetchQuery(settingsQueryOptions)` in `loadTargets` e il
ripristino della cache persistita lo invalida, quindi la pagina attende il documento fresco (~244 ms sul mirror, «primo
numero» 348 ms contro 115–180 delle altre route, `perf/README.md` § Revisit) — e lo skeleton che mostra
(`TileGridSkeleton verdict={false} cells={[{ span: 5 }, { span: 7 }, { span: 12, lines: 8 }]}`) ha proporzioni diverse
dalle tessere della tab che lo sostituisce, così la pagina «si ricompone» sotto gli occhi. Decisione del proprietario:
non uno skeleton più fedele, ma la stessa regola delle altre pagine, QUI: la vista di una tab si semina dal documento
già in cache (`queryClient.getQueryData(settingsQueryOptions(ownerId).queryKey)`, che dopo il ripristino c'è) e la
rilettura fresca — la stessa `loadTargets({ quiet: true })` di «Annulla» — la aggiorna dietro, con «Aggiornato alle…»
nell'header intanto (`useFreshness` su un `useSettings(ownerId)` osservato dalla pagina, oggi assente: il
`fetchQuery` non ha observer e la riga dice solo categorie e conti). Lo skeleton resta per la sola prima visita
dell'account. Rischio da collaudare: la bozza (§ 4) non deve essere sovrascritta dalla rilettura se il lettore ha già
toccato un campo — la rilettura entra solo finché nessuna tab è sporca.

## 2. Obiettivo misurabile

- `app/dashboard/settings/page.tsx` sotto **500 righe**: l'orchestratore (tab attiva, `mountedTabs`, la BOZZA con `useReducer`,
  il Salva unico, la barra dello stato, il focus attraverso le tab), niente campi.
- Sei componenti a livello di modulo in `components/settings/tabs/{Generale,Allocazione,Spese,Dividendi,Condivisione,Aspetto}Tab.tsx`,
  **viste controllate**: ricevono la loro fetta di bozza e gli errori, emettono `onChange(patch)`; NON tengono stato di form
  proprio (Radix smonta il pannello inattivo: uno stato locale si perderebbe al cambio tab e un Salva da un'altra tab non
  lo vedrebbe). Lo stato UI effimero (un accordion aperto) può restare locale.
- La bozza è UN `useReducer(settingsDraftReducer)` nella pagina, con il reducer e `composeSettingsDocument`/`sliceSettings`
  in `lib/utils/settingsDraft.ts` (puri, testati contro `STORED_SETTINGS`); le sette sedi di § Settings — the FIVE places
  restano UNA scrittura.
- Census (PERF-12, `npm run perf:census -- --route=settings`): 10 tasti in Generale → componenti ri-renderizzati per tasto =
  la vista Generale e l'orchestratore, MAI le altre viste; `ScriptDuration` per tasto −70% rispetto a prima.
- `router.replace` al mount solo quando `?tab` manca o è invalido (come Cashflow `:236`), mai incondizionato.
- Allocazione: un editor di classe/sotto-categoria collassato NON è nel DOM; quando «Salva» trova un errore in un gruppo
  chiuso, la pagina attiva la tab, APRE il gruppo (stato nella bozza: `openGroups`) e focalizza il campo (`pendingFocus`
  nella bozza, consumato dalla vista al mount con un effetto).
- Round trip invariato: `__tests__/settingsRoundTrip.test.ts` verde senza modifiche al fixture `STORED_SETTINGS`;
  `e2e/settings*.spec.ts` verdi; il dirty tracking per tab con le stesse parole (`settingsNarrative.ts`, 23 `describe*`).

## 3. Non-obiettivi

- Nessun cambiamento visivo, di parole o di ordine dei campi; nessun verdetto (la pagina «must not grow one»).
- Non si tocca `setSettings` né le sette sedi; non si cambia `settingsRoundTrip`.
- Non si converte la pagina a react-hook-form (un reducer per la bozza basta; RHF sarebbe un secondo refactor).

## 4. Design

**La bozza nella pagina, le tab come viste.** `settingsDraftReducer(state, action)` con azioni per fetta (`{ type: 'generale/set',
patch }`, `{ type: 'allocazione/setTarget', … }`, `{ type: 'reset', document }`, `{ type: 'openGroup', key }`, `{ type: 'focus',
path }`). `sliceSettings(document)` → le sei fette all'apertura e alla rilettura; `composeSettingsDocument(draft)` → il documento
da salvare, o gli errori con la sede (`allocationTargetValidation.ts` per i target). `isDirty` per tab = confronto fetta vs
fetta iniziale (`settingsDraft.ts`, puro): il punto sulla tab e la barra in basso lo leggono dalla pagina — invariati.

**«Annulla modifiche»** = `invalidateQueries(settings.all)` + `reset` della bozza sul documento riletto (la rilettura che oggi
fa `loadTargets({ quiet: true })`), mai una copia dalla memoria.

**Il focus attraverso le tab.** Al Salva con errore: `dispatch({ type: 'openGroup' })`, `dispatch({ type: 'focus', path })`,
`setActiveTab(sede)`; la vista che monta legge `pendingFocus` dalla sua fetta e, in un effetto sul mount, focalizza il
campo e `dispatch({ type: 'focusConsumed' })`. Nessun `useImperativeHandle` attraverso un pannello smontato.

**Allocazione** è la tab più grande (`:2774-3372`): classi, sotto-categorie, target specifici, formula, leva. Dentro, un
componente per classe (`AllocationClassEditor`) e uno per sotto-categoria, a livello di modulo, che ricevono la loro fetta
e `onChange`; `Collapsible` SENZA `forceMount`, aperto/chiuso da `openGroups` nella bozza; la lista delle classi da
`ASSET_CLASS_SEQUENCE`.

**Spese** ha, nella colonna sinistra, Conti di default, Commissioni sui trasferimenti e **Ruoli 50/30/20** (dal
2026-09-27, #400: una tessera sua e non una riga di Categorie, perché resta leggibile quando le categorie non si leggono,
«non letti»), poi Import e Categorie. La fetta «spese» della bozza porta `spendingRolesEnabled`. `CategoryRow` (il colore
del badge per ruolo) e `CategoryManagementDialog` (il selettore del ruolo) ricevono il valore DELLA BOZZA, non del
documento salvato: oggi l'interruttore acceso e non ancora salvato colora già i badge e apre il selettore nel dialog, e
così deve restare. `summarizeCategoryClassification(expenseCategories)` si calcola nella vista, non nell'orchestratore.

**Le letture** (impostazioni, categorie, asset) dagli hook (dal 2026-09-29); il «Salva» invalida `settings.all` e le chiavi delle
pagine che leggono un'impostazione (la lista in doc/guide/impostazioni.md).

**Un `useSearchParams` in un figlio dentro `<Suspense>`** (AGENTS.md § Navigation): verificare; il `router.replace`
condizionato come Cashflow.

**Ordine di lavoro**: prima la bozza + `settingsDraft.ts` + il test di identità, con la pagina ancora monolitica ma che
LEGGE dalla bozza; poi una tab alla volta, dalla più piccola (aspetto → condivisione → dividendi → spese → generale →
allocazione), con `tsc`, `settingsRoundTrip`, `settingsNarrative` e `e2e/settings*.spec.ts` dopo ognuna; la pagina si
accorcia a ogni passo e il diff resta leggibile.

## 5. File da toccare

- `app/dashboard/settings/page.tsx` — l'orchestratore con `useReducer`.
- `lib/utils/settingsDraft.ts` (nuovo, puro): reducer, `sliceSettings`, `composeSettingsDocument`, `isSliceDirty`.
- `components/settings/tabs/*Tab.tsx` (6 nuovi), `components/settings/allocation/{AllocationClassEditor,SubTargetEditor}.tsx`
  (nuovi), `components/settings/{ExpenseImportSection,AccountSharingSection}.tsx` (invariati, ospitati dalle viste).
- Test: `__tests__/settingsDraft.test.ts` (compose∘slice = identità sul fixture; una fetta con errore blocca il compose e
  nomina la sede; `isSliceDirty`), `settingsRoundTrip`, `settingsNarrative`, `allocationTargetValidation`,
  `e2e/settings{,.mobile}.spec.ts` (+ una spec che salva da una tab e verifica, dopo hard refresh — «only a hard refresh
  proves a setting was saved» — che le altre tab non hanno perso nulla: il caso del 2026-09-25 in cui «Salva» aveva perso i
  sub-target; + la spec del focus attraverso le tab).

## 6. Passi

1. Census prima (PERF-12): tasti in Generale e in Allocazione.
2. `settingsDraft.ts` + test di identità sul fixture; la pagina legge/scrive la bozza (ancora monolitica).
3. Le sei viste nell'ordine di § 4, con le suite dopo ognuna.
4. `router.replace` condizionato; `useSearchParams` in Suspense; il focus attraverso le tab.
5. Census dopo; E2E completo; giro.

## 7. Test e falsificazione

- `composeSettingsDocument(sliceSettings(STORED_SETTINGS))` deep-equals `STORED_SETTINGS`; falsificare togliendo un campo dalla
  fetta «dividendi» → rosso (è ESATTAMENTE il bug che questa struttura può reintrodurre: un campo che non torna); seconda
  falsificazione: togliere `spendingRolesEnabled` dalla fetta «spese» → rosso.
- `e2e/settings.roles.spec.ts` (#400: l'interruttore salvato e riletto, il dialog che imposta un ruolo, «Da classificare»
  che cancella il campo, il dialog a interruttore spento che non mostra né riscrive un ruolo) resta verde dopo OGNI tab.
- La spec «salva da una tab, le altre restano»: leggere il documento in `beforeAll`, `set()` intero in `afterAll` (la regola
  di `cashflow.transfer-fee.spec.ts`).
- Il focus attraverso le tab: spec che mette un target a 150% in allocazione, va in generale, preme Salva → la tab
  allocazione è attiva, il gruppo aperto e il campo ha il focus (`document.activeElement`); falsificare togliendo
  `openGroup` → il campo resta chiuso e il focus fallisce.
- Il cambio tab non perde la bozza: spec che scrive in generale, va in aspetto, torna: il valore c'è (anchor: senza la
  bozza nella pagina — una versione con stato locale — il valore sparisce).
- Suite: area Impostazioni (`settingsNarrative`, `settingsRoundTrip`, `equityBondsAutoTargets`, `pensionUnlock`), E2E completo
  (Allocazione legge i target: `e2e/allocation.spec.ts`).

## 8. Collaudo guidato

- A: E2E completo. C: le quattro falsificazioni. D: il documento salvato intero letto dall'emulatore (`curl … Bearer owner`)
  prima e dopo un salvataggio da ogni tab: identico salvo il campo cambiato.
- F (mirror, 390 e 1440): 1) digitare in Generale: fluido; 2) cambiare un target in Allocazione, il punto sulla tab appare,
  Salva, hard refresh: tiene, e i sub-target ci sono ancora; 3) «Annulla modifiche» rilegge; 4) un target sbagliato da
  un'altra tab: Salva apre la tab, il gruppo e il campo; 5) sul telefono la barra in basso e il Salva sticky (la regola del
  2026-09-22). Non coperto: il tempo (census).
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Il rischio è un campo che non torna nel documento: il test di identità e la spec «le altre tab restano» lo pinnano.
- Il focus attraverso le tab: la bozza porta `openGroups` e `pendingFocus`, la vista li consuma al mount — la spec lo prova.
- Rollback per tab (ogni tab un blocco del diff); la bozza è il primo blocco e regge da sola.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e la riga «Impostazioni» in § Key Features (le sei viste, la bozza); doc/guide/impostazioni.md (la bozza
  nella pagina, `settingsDraft`, le viste controllate, il focus attraverso le tab, il `router.replace` condizionato);
  AGENTS.md § Hierarchy (il caso come esempio della regola) e § React Query (Annulla = rilettura); `Draft Release Temp.md`;
  doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-13-impostazioni-per-tab.md: la pagina Impostazioni (4105 righe, 70
chiamate a useState in un componente) diventa un orchestratore sotto 500 righe con UNA bozza (useReducer + lib/utils/settingsDraft.ts:
reducer, sliceSettings, composeSettingsDocument, isSliceDirty, testati contro STORED_SETTINGS) e sei viste-tab controllate
a livello di modulo SENZA stato di form proprio (Radix smonta il pannello inattivo); «Annulla modifiche» rilegge dal
server; il Salva con errore attiva la tab, apre il gruppo e focalizza il campo attraverso la bozza; un editor collassato in
Allocazione non sta nel DOM. Nessun cambiamento visivo, di parole o di documento salvato.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Hierarchy, § Navigation, § Dialog Form Reset, § Motion: set-state-in-effect, § React Query), CLAUDE.md
- Leggi doc/guide/impostazioni.md PER INTERO (§ Settings — the FIVE places, lo stato per tab, «Annulla» come rilettura, il focus del campo in errore)
- Leggi doc/guide/allocazione.md (i target), doc/guide/e2e-emulatori.md (la spec che salva restaura il documento intero)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-13 per intero; PERF-05 è chiusa (2026-09-29), PERF-12 deve esserlo
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: prima la bozza con la pagina ancora monolitica, poi una tab alla volta nell'ordine della spec § 4 con tsc +
settingsRoundTrip + settingsNarrative + e2e/settings* dopo ognuna; il census dei re-render per tasto prima/dopo (npm run
perf:census -- --route=settings); le quattro falsificazioni di § 7 viste ROSSE; il documento letto dall'emulatore
prima/dopo un salvataggio da OGNI tab. Chiusura: tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO; giro
guidato di 5 punti sul mirror a 390 e 1440, poi mirror:remove; CLAUDE.md «Latest» e la riga Impostazioni,
doc/guide/impostazioni.md, AGENTS.md § Hierarchy e § React Query, Draft Release Temp.md (senza dati privati),
doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Quattromila righe da spezzare senza perdere un campo delle sette sedi, con una bozza che
deve sopravvivere allo smontaggio dei pannelli e un focus che attraversa le tab: il rischio è la regressione silenziosa che il
repo ha già visto il 2026-09-25. Il modello più capace, effort high (il lavoro è lungo e ordinato più che difficile).
