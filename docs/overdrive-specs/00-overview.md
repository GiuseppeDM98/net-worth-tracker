# Overdrive Specs Overview

## Scopo
Questa cartella raccoglie le specifiche Overdrive per Net Worth Tracker. Il focus non e' aggiungere effetti decorativi, ma aumentare la percezione di **fluidita' premium da app nativa**, con pochi momenti di **wow visivo misurato** nelle sezioni dove il brand e i dati lo reggono davvero.

Le sezioni epicentro del lavoro sono:
- `Rendimenti`
- `Storico`
- `FIRE e Simulazioni`

Le altre aree devono beneficiare soprattutto di:
- continuita' spaziale
- assestamento fisico credibile
- navigazione fluida
- feedback immediato
- riduzione dei cambi di stato percepiti come "redraw"

## Principi condivisi
- **Dati prima di tutto**: nessun effetto deve ridurre leggibilita', densita' informativa o fiducia nei numeri.
- **Motion con intenzione**: ogni transizione deve spiegare un cambio di stato, non intrattenere.
- **Fluidita' nativa**: favorire continuita' tra trigger e destinazione, tra lista e dettaglio, tra tab e contenuto, tra periodo e grafico.
- **Wow selettivo**: i momenti speciali vanno concentrati, non distribuiti in modo rumoroso.
- **Progressive enhancement**: la UI deve restare ottima anche senza API avanzate o con motion ridotta.

## Priorita'
1. Shell e navigation foundations
2. Rendimenti
3. Storico
4. FIRE e Simulazioni
5. Panoramica
6. Allocazione
7. Cashflow e Dividendi
8. Patrimonio
9. Hall of Fame
10. Impostazioni
11. Auth

## Standard tecnici trasversali
- Riutilizzare il layer condiviso in `lib/utils/motionVariants.ts` invece di introdurre varianti isolate pagina per pagina.
- Espandere il vocabolario motion con pattern standard per:
  - page transitions
  - shared element transitions
  - dialog/sheet origin transitions
  - chart state changes
  - metric settling
  - tab/filter feedback
- Fare leva su Framer Motion gia' presente nel repo; usare View Transitions come enhancement e non come requisito.
- Per tabelle o dataset pesanti preferire fluidita' e performance percepita rispetto a coreografie sofisticate.
- Evitare librerie nuove se gli obiettivi si raggiungono con stack gia' presente.

## Fallback e performance
- Rispettare sempre `prefers-reduced-motion`.
- Se una transizione avanzata non e' disponibile, degradare a fade/slide sobrio e rapido.
- Evitare effetti che causano jank su mobile medi o in landscape compatti.
- Per grafici e liste dense, privilegiare:
  - assestamento breve
  - animazioni una tantum
  - no replay continuo a ogni filtro secondario

## Come leggere le spec di sezione
Ogni file contiene:
1. perche' la sezione merita Overdrive
2. outcome UX desiderato
3. feature implementabili
4. dettagli tecnici di implementazione
5. guardrail
6. criteri di accettazione
7. un prompt finale pronto da incollare in una nuova sessione Codex

## Regole per i prompt finali
Ogni prompt in fondo alle spec:
- tratta una sola sezione
- usa la spec corrente come fonte di verita'
- chiede implementazione, non brainstorming
- richiama i vincoli del repo
- vieta effetti gratuiti
- richiede un riepilogo sintetico finale
- termina con la frase obbligatoria:

`dimmi cosa e come testare riguardo ciò che hai implementato finora`
