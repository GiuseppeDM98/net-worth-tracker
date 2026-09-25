---
target: critique Impostazioni
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/settings/page.tsx"
target_fingerprint: "sha256:7eecc4dd537bd5af12544af1dc9fb6795454611154ac01e8722b0eec712b2f2e"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/settings/page.tsx
timestamp: 2026-09-22T17-31-56Z
slug: app-dashboard-settings-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector + Playwright evidence sub-agent), 2026-09-22. Chrome extension not connected: browser evidence is Playwright's on the emulator dev server (`test@example.com`, tema **Solar Dusk** in modalità «Sistema», quindi chiaro — i rapporti di contrasto sono di quel tema; `NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS` acceso, per cui il blocco «Strumenti di sviluppo» in Preferenze è dev-only e non è contato).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Le letture si aggiornano dal vivo, ma il chip «Anteprima attiva: modifiche non salvate» è `hidden sm:inline-flex` (page.tsx:1729-1739): sotto 640 px non esiste; su telefono «Salva» scorre via (misurato `top −817px`); il chip non dice QUALE tab è sporco. |
| 2 | Match System / Real World | 3 | Lingua fiscale italiana nativa (bollo 5.000 €, RAL, RITA, «67 anni · predefinita»), sporcata da anglicismi: «Azioni (Equity)», «Safe withdrawal rate», «Risk-free rate», «toggle», «tab», «dialog». |
| 3 | User Control and Freedom | 2 | Nessun «Annulla modifiche» (ritorno all'ultimo salvato): «Ripristina default» torna ai valori di fabbrica; nessuna guardia all'uscita con modifiche; la revoca di un accesso è una × singola, senza conferma. |
| 4 | Consistency and Standards | 2 | Cinque modelli di salvataggio su una pagina (Salva; tema/modalità da soli; accessi immediati; categorie immediate; sync/import immediati); due conferme a due click con timer di 3 s (page.tsx:817-823, 1023-1026) che AGENTS § 4 vieta. |
| 5 | Error Prevention | 2 | «Salva» abilitato (`disabled={isDemo || saving}`, page.tsx:1748) mentre la lettura dice «il salvataggio è bloccato»; concedere pieno accesso al patrimonio non chiede conferma; placeholder col punto («es. 3.5»). |
| 6 | Recognition Rather Than Recall | 2 | Su telefono 5 tab su 6 sono sole icone 38×32; l'interruttore Auto-calcolo (Allocazione, page.tsx:2673) resta disabilitato finché Età e risk-free non sono impostati in UN ALTRO tab. |
| 7 | Flexibility and Efficiency | 2 | Nessun ⌘S; nessun deep link a una tessera; l'input mese costa 3 fermate di Tab. |
| 8 | Aesthetic and Minimalist Design | 3 | Cromia calma e acromatica; ma in Preferenze a 1440 la prima riga è alta 544 px per «Calcolo dei rendimenti» (~230 px vuoti in Profilo, ~300 in Costi) ed Email periodiche occupa 12 colonne con la metà destra vuota. |
| 9 | Error Recovery | 2 | L'`ErrorNotice` di caricamento (page.tsx:1661-1681) è esemplare; ma somme di sottocategoria/asset specifici ≠ 100 sono solo toast al Salva (page.tsx:1175-1228) e il gruppo colpevole può essere chiuso. |
| 10 | Help and Documentation | 3 | Footer che dichiarano l'effetto, «Come funziona» chiaro; ma una nota dice il falso: «I cambiamenti saranno applicati immediatamente alla pagina Allocazione» (page.tsx:3111), contro il Salva. |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Le PAROLE sono di questo prodotto, la FORMA no. Le letture di `settingsNarrative.ts` dichiarano l'effetto a valle e cosa si ferma senza un dato («senza il risk-free rate l'auto-calcolo dei target non parte», «Divisione attiva, ma in Famiglia c'è una persona sola: servono almeno due», «Report … attivi, ma senza destinatari»), il fisco italiano è nativo, le tessere-dichiarazione (Parametri del piano, Assistente) rifiutano di diventare un secondo percorso di scrittura. La composizione invece è un modulo impostazioni di categoria: etichetta + aiuto a sinistra, controllo a destra, ~30 righe; 22 switch identici 36×20, 13-14 in un solo scroll di Preferenze; tessere dimensionate per riempire la griglia, non per il contenuto. Solo Allocazione guadagna la forma a tessera (totale mono 36 px, una lettura, le righe). La divisione in sei tab è per accumulo storico, non per decisione dell'utente: Preferenze tiene 9 tessere (2314 px a 1440, **3948 px a 390 ≈ 4,7 schermi**) che agiscono su Rendimenti, Allocazione, Previdenza, Cashflow, FIRE ed Email; Dividendi ha una tessera modificabile più una scheda BTP Italia senza controlli; Condivisione un campo.

**Deterministic scan.** CLI `impeccable detect` su `page.tsx` + le due sezioni: exit 0, **0 findings** (legge HTML/CSS; il TSX gli è opaco). Overlay in pagina (detect.js via live-server, 1440, Allocazione/Preferenze/Aspetto): grezzi 20 / 64 / 16. **Della superficie**: `low-contrast` 4,4:1 (token `--muted-foreground` #78716c su tessera #f8f4ee — eyebrow, etichette laterali, footer 11 px: 8/34/5), 4,0:1 il chip «Tutte le modifiche sono salvate» su `bg-muted` #f1e9da (una volta per tab), `line-length` ~103 caratteri sulla nota «Formula di The Bull…» a 11 px; `nested-cards` su ogni `section` = **falso positivo** (catena di antenati trasparente fino a `main`); `undersized-ui-text`/`tiny-text` 9-11 px = la rampa enumerata, attesi. **Esclusi** (30): sidebar, `body` («cream-palette» = il tema Solar Dusk, h1→h3 = convenzione eyebrow `<h3>`), dev-only, nodi dell'overlay. Playwright, 6 tab × {1440, 390}: overflow di `main` 0 ovunque, nessun elemento oltre `main` né oltre la propria tessera; console pulita (solo notice CSP report-only). Sotto 44 px su puntatore coarse: «Salva» 77×32, tab 38×32, chevron sottocategorie 24×24, switch 36×20 (×14 in Preferenze), link 13 px di altezza, «Nuova categoria» 135×28, azioni di riga categoria 36×32, × revoca/destinatario ~16 px — la pagina non usa l'idioma `h-11 desktop:h-8`. A11y: a 390 «Ripristina default» **senza nome accessibile** (l'unica etichetta è `hidden sm:inline`); al primo caricamento 5 `aria-controls` puntano a pannelli mai montati (la pagina non passa `renderedPanels` a `PageTabs`, pur tenendo `mountedTabs`); nome dello swatch «Colore 2 di 6: Solar Dusk» senza il sottotitolo visibile.

**Visual overlays.** Nessuna scheda [Human]: estensione non connessa. L'overlay è stato iniettato in Playwright e fotografato (`evidence-b/detect-<tab>-desktop.png` nello scratchpad), non è visibile nel browser dell'owner.

## Overall Impression

Il miglior testo di configurazione dell'app dentro la forma più generica dell'app. Ogni tessera dice cosa succede a valle, e questo è raro; ma la pagina tratta tre cose ad alto rischio — un'assenza, un salvataggio, un accesso al patrimonio — con la stessa voce piatta di un interruttore. La singola opportunità più grande: **rendere visibile e reversibile lo stato non salvato**, e smettere di scambiare una lettura fallita per «niente».

## What's Working

1. **Le letture sono oneste su lacune ed effetti.** Un input mancante lascia cadere la sua clausola e dice cosa si ferma, invece di stampare un segnaposto: il modulo diventa spiegazione. È la Narrative Honesty Rule applicata a una pagina che non misura nulla.
2. **Un caricamento fallito rifiuta di diventare un modulo di default** (page.tsx:1661-1681): «salvarli sovrascriverebbe i tuoi». È l'errore che quasi ogni pagina impostazioni commette, e qui è evitato per costruzione.
3. **Tessere-dichiarazione e «(predefinita)».** SWR, età INPS, RITA e preferenze dell'assistente sono in sola lettura, ciascuno col link all'unico posto dove si scrive; il default applicativo è nominato come tale. Elimina un'intera classe di bug da doppia scrittura.

## Priority Issues

**[P1] Una lettura fallita si presenta come «niente registrato», proprio sulla tessera più delicata.**
- **Why it matters**: `AccountSharingSection.loadMembers` in caso d'errore fa solo un toast (riga 51) e `members` resta `[]`, quindi la lettura diventa «Nessun accesso condiviso: questi dati li vedi solo tu.» — un'affermazione di sicurezza falsa. Lo stesso per le categorie («Nessuna categoria: creane una…») e peggio per i conti: `getAllAssets(ownerId).then(…)` (page.tsx:764) non ha `catch`, e la tessera dice «Nessun conto disponibile: crea un conto». Viola The Absence-Has-Three-Names Rule.
- **Fix**: ogni loader tiene uno stato `failed`; la tessera passa per `resolveSurfaceState` e mostra `describeReadFailure` con la conseguenza e «Riprova», senza lettura. Per la condivisione la conseguenza è esplicita: «non sappiamo chi ha accesso: non è la stessa cosa di nessuno».
- **Suggested command**: /impeccable harden

**[P1] Lo stato non salvato è invisibile su telefono, e non c'è via di ritorno.**
- **Why it matters**: il chip è `hidden sm:inline-flex`; il `PageHeader` mobile è `sticky top-0` dentro un wrapper alto quanto lui, quindi non resta mai attaccato (difetto TRASVERSALE a ogni pagina, non di questa) e «Salva» esce dallo schermo; nessun `beforeunload`/guardia di rotta; nessun ritorno all'ultimo salvato («Ripristina default» è un'altra cosa); il chip non nomina il tab; «Anteprima attiva» dice «anteprima» dove nulla viene anteprimato. In più la nota a page.tsx:3111 promette un'applicazione immediata che non avviene.
- **Fix**: su telefono, barra inferiore quando sporco («Modifiche non salvate in Allocazione · Annulla · Salva»); un punto sul tab sporco in `PageTabBar`; «Annulla modifiche» che riporta lo snapshot salvato, separato da «Ripristina default»; guardia all'uscita; chip rinominato «Modifiche non salvate»; nota corretta.
- **Suggested command**: /impeccable harden + /impeccable clarify

**[P1] Preferenze è un tab-contenitore, e una dipendenza attraversa i tab.**
- **Why it matters**: 9 tessere, ~30 controlli, 4,7 schermi su telefono; l'Auto-calcolo dei target in Allocazione è disabilitato finché Età e risk-free non vivono in Preferenze → Profilo — l'utente deve ricordare cosa c'è in un altro tab per sbloccare questo (fallimento di working memory).
- **Fix**: raggruppare per decisione, ≤ 4 tessere per tab. Proposta: **Portafoglio** (target + Profilo accanto all'Auto-calcolo + Calcolo dei rendimenti + Costi), **Entrate e conti** (conti di default, dividendi, reddito da lavoro, categorie, import CSV), **Famiglia e accessi** (Famiglia + Condivisione), **Report e aspetto** (Email + tema). Da decidere con l'owner: è un cambio di IA.
- **Suggested command**: /impeccable distill + /impeccable layout

**[P2] Gli errori di allocazione si diagnosticano in toast, non sul posto.**
- **Why it matters**: sottocategorie e asset specifici ≠ 100% emergono solo come toast al Salva (page.tsx:1181-1224); il «≠ 100%» in linea sta in un gruppo che può essere chiuso; «Salva» resta abilitato mentre la lettura dice che è bloccato.
- **Fix**: la somma di sottocategoria sulla riga della classe accanto a «Sotto-cat.» («95% ≠ 100%» in `text-destructive`); il primo errore nominato nella lettura della tessera; al Salva con errori, aprire e mettere a fuoco il primo gruppo colpevole invece del toast.
- **Suggested command**: /impeccable harden

**[P2] Bersagli, conferme a tempo e nomi accessibili sotto le regole della casa.**
- **Why it matters**: × revoca e × destinatario ~16 px, chevron 24×24, «Nuova categoria» 28 px, azioni di riga 36×32, tab 38×32, link a 13 px (senza `TILE_FOOTER_ACTION_CLASS`); le conferme di eliminazione categoria e sync dividendi si disarmano dopo 3 s senza annuncio (WCAG 2.2.1; AGENTS § 4 → `useArmedDelete`), e il sync armato diventa rosso benché non distrugga nulla; «Ripristina default» senza nome a 390; `aria-controls` pendenti per `renderedPanels` non passato.
- **Fix**: idioma `h-11 desktop:h-8`, `TILE_FOOTER_ACTION_CLASS`; `useArmedDelete` (niente timer, Escape, pointerdown, una live region); `aria-label` sul bottone icona; `renderedPanels={mountedTabs}`; la revoca con conferma in riga che nomina la conseguenza.
- **Suggested command**: /impeccable adapt + /impeccable harden

## Persona Red Flags

**Alex (power user)**: nessun ⌘S; non sa quale dei 6 tab è sporco; configurare l'auto-calcolo significa cambiare tab; l'annullamento dell'import vive nello stato del componente e si perde navigando; «Invia … ora» spedisce le impostazioni SALVATE mentre il modulo è sporco, e solo un aiuto lo dice.

**Sam (screen reader / tastiera)**: gli errori di validazione arrivano come toast transitori; le due conferme a tempo non annunciano né l'armo né il disarmo; al primo caricamento 5 tab puntano `aria-controls` a pannelli inesistenti; a 390 «Ripristina default» è un «pulsante» senza nome. Positivo: ordine di Tab sensato (Salva → tab → contenuto), switch etichettati via `htmlFor`.

**Casey (telefono, una mano)**: «Salva» fuori portata dopo lo scroll e nessun segnale di non salvato; cinque tab icona 38×32 senza etichetta; chevron 24 px e × revoca 16 px; a 390 la riga Liquidità schiaccia l'etichetta su due righe accanto allo switch «fisso €»; Preferenze lunga 4,7 schermi.

**Co-intestatario che legge ciò che l'owner ha configurato**: le letture parlano in seconda persona dei dati dell'OWNER («Hai …», settingsNarrative.ts:69/78), falso per chi legge; il tab Condivisione gestisce l'account DEL CO-INTESTATARIO, quindi sull'account dell'owner dice «Nessun accesso condiviso: questi dati li vedi solo tu» (settingsNarrative.ts:671) — sbagliato nel contesto, spiegato solo nel footer a 11 px; la pagina non nomina mai di chi sono le impostazioni che «Salva» sovrascrive.

## Minor Observations

- Contrasto: eyebrow, footer e aiuti a **4,38:1** in Solar Dusk chiaro sulla tessera (#78716c su #f8f4ee), il chip salvato e i pulsanti inattivi «Chiaro/Scuro» a **3,98:1** su #f1e9da. È debito di token di tema (stessa famiglia del Known Issue su `--muted-foreground`, qui più basso perché misurato sulla tessera), non della pagina: va a una sessione `doc/guide/temi.md`.
- Vuoti a 1440 in Preferenze: prima riga 544 px guidata da «Calcolo dei rendimenti»; Assistente ~150 px; Auto-calcolo ~100 px; in «Target per classe» ~870 px di viaggio dell'occhio fra etichetta di classe e input.
- «sotto-categorie» e «sottocategorie» nella stessa pagina; «Cancella» per svuotare un select suona come «elimina»; «Salvataggio...» con tre punti invece di «…»; «Email inviata con successo!» col punto esclamativo; placeholder Famiglia «es. Giuseppe» (il nome dell'autore); input mese vuoto reso nativamente «--------- ----»; lista categorie create nell'anteprima import a `opacity-70` su testo già muted; il disclosure «Note e dettagli tecnici» è una striscia bordata, non una tessera.
- Due `<h1>` nel DOM (uno nell'header compatto `display:none`): esposto uno solo, non è un difetto.
- Swatch: il nome accessibile «Colore 2 di 6: Solar Dusk» omette il sottotitolo visibile «Ambra calda» (WCAG 2.5.3 lieve).

## Questions to Consider

1. La Declaration-Tile Rule dice già che un'impostazione vive dove agisce. Perché Impostazioni tiene ~20 campi che agiscono altrove? Potrebbe diventare un indice «dove si imposta» più la manciata di impostazioni davvero globali?
2. DESIGN.md dice «uno switch è una decisione, non una bozza». Perché i 22 switch qui aspettano «Salva», quando lo stesso tipo di switch su FIRE si salva al cambio?
3. Dare a qualcuno lettura e scrittura su tutto il tuo patrimonio deve pesare quanto aggiungere un destinatario email?
4. Il chip dice «Anteprima». E se modificare i target mostrasse davvero, prima del Salva, cosa cambierebbe in Allocazione?
