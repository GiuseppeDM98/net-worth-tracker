# PERF-08 — Le funzioni Vercel nella regione di Firestore

> Stato: da fare · Priorità: 3 (piccola, ma vale ~100 ms per ogni lettura server) · Sforzo: S · Dipende da: PERF-07 (il `Server-Timing` che prova il prima/dopo) · Sblocca: —

## 1. Il problema, misurato

`vercel.json` contiene solo i due cron; nessuna route esporta `preferredRegion`; `next.config.ts` non ha `regions`. Le
funzioni serverless girano quindi nella regione di default di Vercel, **`iad1` (Washington)**. Firestore di produzione sta in
**Europa** (proprietario, 2026-09-26; il repo non lo registra: `.firebaserc` ha solo il progetto, `SETUP.md:58` consiglia
`europe-west1`). Ogni lettura Admin SDK da una route è un viaggio Washington → Belgio → Washington: ~90–110 ms di andata e
ritorno, per lettura, per stadio sequenziale.

Le route che una PAGINA chiama al mount (audit 2026-09-26): `/api/dashboard/overview` (1 lettura fresca, 3–6 stadi in
ricalcolo), `/api/performance/yoc` e `current-yield` × 5 periodi (ognuna D+A+S: 10 chiamate), `/api/benchmarks/returns` × 6 e
`fx-rates` (una lettura di cache l'una), `/api/portfolio/instrument-profiles` (a regime legge solo la cache per ticker), `/api/dividends/stats` (7 await in serie),
`/api/ai/assistant/*` (4). Le chiamate di Rendimenti partono in PARALLELO (le 7 degli hook e le 10 dei rendimenti in due
`Promise.all`), quindi il costo è di ~2 ondate di ~100 ms di latenza + le letture di ognuna, non 17 viaggi in serie; ma
ogni lettura Admin dentro ognuna è transatlantica, e la route più lenta dell'ondata detta il tempo. Il browser del
proprietario (Italia) → `iad1` aggiunge un altro ~100 ms per ondata rispetto a una regione europea.

## 2. Obiettivo misurabile

- `x-vercel-id` nelle risposte delle route inizia con una regione europea (`fra1::…`, `cdg1::…` o `dub1::…`), letto dalle
  DevTools o con `curl -sI https://<app>/api/benchmarks/fx-rates`.
- `Server-Timing: total` (PERF-07) di `/api/dashboard/overview` in ricalcolo: prima/dopo, atteso −50% o più; di
  `/api/benchmarks/fx-rates` (una lettura): da ~120 ms a ~30 ms.
- I due cron continuano a girare (Vercel → Logs il giorno dopo) e le email arrivano.

## 3. Non-obiettivi

- Non si spostano Firestore né il progetto Firebase.
- Non si toccano le route.
- Non si mette nulla sull'Edge runtime (firebase-admin non ci gira: `ERR_REQUIRE_ESM`, CLAUDE.md § Known Issues).

## 4. Design

`vercel.json` → `"regions": ["fra1"]` (Francoforte; `cdg1` Parigi o `dub1` Dublino sono equivalenti per Belgio/`eur3`; scegliere
quella con il `Server-Timing` migliore se il proprietario vuole provarne due). Il piano Hobby accetta UNA regione in
`regions`; Pro anche più d'una. In alternativa per singola route `export const preferredRegion = 'fra1'` — ma qui vale per
tutte, e un solo posto è la regola del repo (una sorgente).

**Registrare la regione di Firestore** dove il repo la cerca: `SETUP.md` Step 1 (una riga: «Il progetto di produzione è in
`<regione letta dalla console>`; le funzioni Vercel sono in `fra1` per starle vicine»), e CLAUDE.md § Data & Integrations. Il
valore preciso lo legge il proprietario dalla console (Firestore → Database → Posizione) e lo detta in sessione.

**La prova del prima/dopo** si fa in produzione, con il header di PERF-07 e `x-vercel-id`, perché in locale non esiste
latenza. L'app usa l'SDK modulare: NON esiste un `firebase` globale nella pagina. La lettura si fa dalle DevTools senza
codice: Network → una richiesta `/api/*` già fatta dall'app → tasto destro → «Copy as fetch» → incollare nella console →
leggere `.headers.get('server-timing')` e `.headers.get('x-vercel-id')` dalla `Response` (il token è già nell'header
copiato; scade dopo un'ora, basta ricopiare). Sequenza: 1) prima del deploy, 5 letture su `fx-rates` e `overview`
(annotare); 2) la riga, il commit approvato, il push; 3) sul **deploy di anteprima** del branch (Vercel lo costruisce per
ogni push, con la stessa regione) le stesse 5 letture + `x-vercel-id`; 4) i numeri nella descrizione della PR e in CLAUDE.md
nella sessione successiva (o, se il proprietario lo concede, un secondo commit di sole note: è una deroga esplicita alla
regola «un commit per sessione», e va chiesta prima).

## 5. File da toccare

- `vercel.json` — `regions`.
- `SETUP.md` (Step 1 e la sezione Vercel), CLAUDE.md § Data & Integrations — la regione registrata.
- `doc/guide/panoramica.md` — una riga su dove si legge il `Server-Timing`.

## 6. Passi

1. Chiedere al proprietario (strumento interattivo) la posizione letta dalla console, il piano Vercel (Hobby/Pro) e se
   concede il secondo commit di sole note o preferisce i numeri nella PR.
2. Le 5 letture «prima» in produzione («Copy as fetch»).
3. `vercel.json` + il test + la documentazione (SETUP.md, CLAUDE.md § Data & Integrations) in UN commit, dopo l'OK; push.
4. Sul deploy di anteprima: le 5 letture «dopo» + `x-vercel-id`; la tabella in SESSION_NOTES e nella descrizione della PR.
5. Il giorno dopo il merge: i cron nei log.

## 7. Test e falsificazione

- Non c'è codice: la prova è il header. La falsificazione è la lettura «prima» stessa (se «prima» e «dopo» sono uguali, la
  regione non è cambiata: controllare `x-vercel-id`).
- Un test Vitest banale che `vercel.json` è JSON valido con `regions` non vuoto e i due cron intatti (`__tests__/vercelConfig.test.ts`),
  perché una virgola in quel file rompe il deploy senza rumore.

## 8. Collaudo guidato

- F (proprietario, produzione): 1) `x-vercel-id` europeo; 2) `Server-Timing` di `overview` in ricalcolo dimezzato; 3)
  Rendimenti apre visibilmente prima (è la pagina con 17 chiamate); 4) il cron serale ha scritto lo snapshot (Storico il
  giorno dopo). Non coperto: niente in locale.
- G: nessun fixture da rimuovere (la prova è in produzione, in sola lettura).

## 9. Rischi e rollback

- Se il proprietario è su Hobby e `regions` ha più di un valore, il deploy fallisce: una regione sola.
- Se Firestore fosse in `us-central1` (contro quanto detto), la riga peggiorerebbe: la lettura «prima/dopo» lo mostra e il
  rollback è una riga.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Data & Integrations; SETUP.md; `Draft Release Temp.md` (una riga «dev»); doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-08-regione-vercel-europa.md: le funzioni Vercel vanno nella regione
europea vicina a Firestore (vercel.json → regions), con la prova prima/dopo letta dal Server-Timing di PERF-07 e da
x-vercel-id in produzione, e la regione di Firestore registrata in SETUP.md e CLAUDE.md.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Server Layer and API Authorization, § 5 Commands), CLAUDE.md (§ Known Issues: firebase-admin e l'Edge)
- Leggi SETUP.md (Step 1 e la sezione Vercel), doc/guide/panoramica.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE se scrivi codice (il test di vercel.json)
- Leggi doc/perf/README.md e la spec PERF-08 per intero; PERF-07 deve essere in produzione (il header esiste)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; chiedimi con lo strumento interattivo
la posizione di Firestore letta dalla console, il piano Vercel e se concedo un secondo commit di sole note, prima di
scegliere la regione.
Chiusura: le 5 letture «prima» dalle DevTools (Copy as fetch, senza codice), la riga + il test Vitest di vercel.json + la
documentazione (SETUP.md, CLAUDE.md «Latest» e § Data & Integrations, Draft Release Temp.md, doc/perf/README.md) in UN
diff; tsc, lint 0, Vitest in Europe/Rome; proponi il commit; dopo il push le 5 letture «dopo» sul deploy di anteprima con
x-vercel-id, in SESSION_NOTES e nella descrizione della PR.
```

## 12. Modello ed effort

**Claude Sonnet 5, effort medium.** Una riga di configurazione e una procedura di misura; nessun rischio di dominio.
