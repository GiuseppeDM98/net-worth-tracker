# PERF-08 — Le funzioni Vercel nella regione di Firestore

> Stato: da fare · Priorità: 3 (piccola, ma vale ~100 ms per ogni lettura server) · Sforzo: S · Dipende da: PERF-07 (il `Server-Timing` che si legge alla release) · Sblocca: —

## 1. Il problema, misurato

`vercel.json` contiene solo i due cron; nessuna route esporta `preferredRegion`; `next.config.ts` non ha `regions`. Le
funzioni serverless girano quindi nella regione di default di Vercel, **`iad1` (Washington)**. Firestore di produzione sta in
**Europa**, in **`eur3`** (la multi-regione Belgio + Paesi Bassi, letta dal proprietario nella console il 2026-10-03; il repo non lo registra: `.firebaserc` ha solo il progetto, `SETUP.md:58` consiglia
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
- **Nessun «prima/dopo» di produzione** (proprietario, 2026-10-03): la spec si chiude per costruzione — le funzioni
  accanto al database — senza portare develop su main prima. Il header che darebbe il «prima» (`Server-Timing` di
  `/api/dashboard/overview`: `auth, db, compute, total, source`) arriva in produzione con la stessa release che porta
  questa riga, e le anteprime Vercel non leggono il Firestore di produzione. Il numero si legge UNA volta, alla
  release: `db` di `overview` in ricalcolo è un solo giro di letture, atteso nell'ordine di un round trip europeo
  (decine di ms, non ~100).
- I due cron continuano a girare (Vercel → Logs il giorno dopo) e le email arrivano.

## 3. Non-obiettivi

- Non si spostano Firestore né il progetto Firebase.
- Non si toccano le route.
- Non si mette nulla sull'Edge runtime (firebase-admin non ci gira: `ERR_REQUIRE_ESM`, CLAUDE.md § Known Issues).

## 4. Design

`vercel.json` → `"regions": ["fra1"]` (Francoforte; `cdg1` Parigi o `dub1` Dublino sono equivalenti per Belgio/`eur3`).
Il proprietario è sul piano **Hobby** (2026-10-03), che accetta UNA regione in `regions`: `fra1` e basta. In alternativa per singola route `export const preferredRegion = 'fra1'` — ma qui vale per
tutte, e un solo posto è la regola del repo (una sorgente).

**Registrare la regione di Firestore** dove il repo la cerca: `SETUP.md` Step 1 (una riga: «Il progetto di produzione è in
`<regione letta dalla console>`; le funzioni Vercel sono in `fra1` per starle vicine»), e CLAUDE.md § Data & Integrations. Il
valore preciso lo legge il proprietario dalla console (Firestore → Database → Posizione) e lo detta in sessione.

**La prova è la regione, non un confronto** (proprietario, 2026-10-03). In sessione: la posizione di Firestore letta
dalla console decide la regione, il test tiene `vercel.json`. Alla release, in produzione e in SOLA LETTURA, dalle
DevTools senza codice (l'app usa l'SDK modulare: NON esiste un `firebase` globale nella pagina): Network → una
richiesta `/api/*` già fatta dall'app → Headers: `x-vercel-id` con la regione scelta; Timing → Server Timing sulla
richiesta `overview` (doc/guide/panoramica.md § The materialized summary). `x-vercel-id` si può leggere già sul deploy
di anteprima del branch, se l'anteprima è raggiungibile (`curl -sI <anteprima>/api/benchmarks/fx-rates`: il header
c'è anche su un 401); i tempi no, perché l'anteprima non legge il Firestore di produzione.

## 5. File da toccare

- `vercel.json` — `regions`.
- `SETUP.md` (Step 1 e la sezione Vercel), CLAUDE.md § Data & Integrations — la regione registrata.
- `doc/guide/panoramica.md` — una riga su dove si legge il `Server-Timing`.

## 6. Passi

1. Niente da chiedere: la posizione (`eur3`) e il piano (Hobby) sono già detti (2026-10-03, § 1 e § 4). Se il
   proprietario dice che una delle due è cambiata, e la posizione NON è più europea, fermarsi: la riga peggiorerebbe.
2. `vercel.json` + il test + la documentazione (SETUP.md, CLAUDE.md § Data & Integrations) in UN commit, dopo l'OK; push.
3. Sul deploy di anteprima, se raggiungibile: `x-vercel-id`, nella descrizione della PR.
4. Alla release (§ 8 F): `x-vercel-id`, il `Server-Timing` di `overview`, i cron nei log il giorno dopo.

## 7. Test e falsificazione

- Non c'è codice: la prova è `x-vercel-id`. Senza un «prima» non c'è un confronto da falsificare: se alla release `db`
  di `overview` in ricalcolo resta nell'ordine dei ~100 ms, la regione scelta non è quella di Firestore.
- Un test Vitest banale che `vercel.json` è JSON valido con `regions` non vuoto e i due cron intatti (`__tests__/vercelConfig.test.ts`),
  perché una virgola in quel file rompe il deploy senza rumore.

## 8. Collaudo guidato

- F (proprietario, IN PRODUZIONE ALLA RELEASE, in SOLA LETTURA): 1) `x-vercel-id` con la regione scelta; 2) il cron
  serale ha scritto lo snapshot (Storico il giorno dopo). Non coperto: niente in locale, nessun «prima».
- Nello stesso giro, quello che il ricalcolo a un giro della Panoramica (2026-10-03) non ha ancora avuto — DevTools →
  Network → `overview` → Timing → Server Timing: 1) alla prima apertura `source=recompute`, annotare `total` e `db`;
  2) ricaricando dopo 10 minuti senza modifiche `source=materialized`. Il terzo caso (il giorno cambia → di nuovo
  `recompute`) non si aspetta: lo tiene `__tests__/dashboardOverviewService.test.ts`, visto rosso.
- G: nessun fixture da rimuovere (la prova è in produzione, in sola lettura).

## 9. Rischi e rollback

- Il proprietario è su Hobby: se `regions` ha più di un valore, il deploy fallisce — una regione sola.
- Senza un «prima/dopo» una regione sbagliata non si vedrebbe: per questo la posizione è stata letta dalla console
  (`eur3`, 2026-10-03) prima di scegliere `fra1`. Il rollback è una riga.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Data & Integrations; SETUP.md; `Draft Release Temp.md` (una riga «dev»); doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-08-regione-vercel-europa.md: le funzioni Vercel vanno nella regione
europea vicina a Firestore (vercel.json → regions), SENZA un prima/dopo di produzione (deciso il 2026-10-03: main riceve
tutto con la release, la prova è x-vercel-id), e la regione di Firestore registrata in SETUP.md e CLAUDE.md.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Server Layer and API Authorization, § 5 Commands), CLAUDE.md (§ Known Issues: firebase-admin e l'Edge)
- Leggi SETUP.md (Step 1 e la sezione Vercel), doc/guide/panoramica.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE se scrivi codice (il test di vercel.json)
- Leggi doc/perf/README.md e la spec PERF-08 per intero; PERF-07 è chiusa dal 2026-10-03 (il header Server-Timing
  della Panoramica è in develop e arriva in produzione con la release, insieme a questa riga)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; la posizione di
Firestore (eur3) e il piano Vercel (Hobby: una regione sola) sono già nella spec, la regione è fra1.
Chiusura: la riga + il test Vitest di vercel.json + la documentazione (SETUP.md, CLAUDE.md «Latest» e § Data &
Integrations, Draft Release Temp.md, doc/perf/README.md) in UN diff; tsc, lint 0, Vitest in Europe/Rome; proponi il
commit; dopo il push x-vercel-id dal deploy di anteprima se è raggiungibile, nella descrizione della PR; scrivimi i
punti del giro di produzione da fare alla release (§ 8 F).
```

## 12. Modello ed effort

**Claude Sonnet 5, effort medium.** Una riga di configurazione e una procedura di misura; nessun rischio di dominio.
