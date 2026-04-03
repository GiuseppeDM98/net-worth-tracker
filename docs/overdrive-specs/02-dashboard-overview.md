# Panoramica - Dashboard premium e precisa

## Perche' questa sezione
Panoramica e' la prima superficie davvero consultiva del prodotto. Deve dare subito sensazione di ordine, precisione e fiducia, non di homepage generica.

## Outcome UX atteso
La pagina deve sembrare viva ma controllata:
- i KPI si assestano con credibilita'
- i blocchi si riorganizzano senza salti
- i chart entrano con discrezione
- i dialog sembrano nascere dal punto giusto

## Feature da implementare
### 1. Hero KPI con settling fisico
- **Comportamento utente**: il KPI principale e i numeri chiave si compongono con assestamento elegante, non con jump secco.
- **Superficie coinvolta**: hero card e metriche principali.
- **Priorita'**: alta.
- **Impatto atteso**: maggiore percezione di precisione.

### 2. Continuita' tra CTA snapshot e dialog
- **Comportamento utente**: il dialog di conferma o creazione snapshot sembra emergere dal bottone che l'ha attivato.
- **Superficie coinvolta**: CTA snapshot, dialog associato.
- **Priorita'**: alta.
- **Impatto atteso**: wow misurato e molto coerente col task.

### 3. Reflow morbido dei blocchi condizionali
- **Comportamento utente**: le sezioni che compaiono solo in certi casi non causano layout shift percepito.
- **Superficie coinvolta**: card condizionali, gruppi KPI.
- **Priorita'**: media.
- **Impatto atteso**: pagina piu' stabile.

### 4. Chart reveal discreto
- **Comportamento utente**: i grafici si compongono in modo sobrio, con ingresso coerente con il resto della pagina.
- **Superficie coinvolta**: pie chart e blocchi chart.
- **Priorita'**: media.
- **Impatto atteso**: polish premium.

## Implementazione tecnica
- Rafforzare il pattern di count-up e armonizzarlo con il motion timing della pagina.
- Usare layout transitions nei gruppi KPI e nelle card condizionali per evitare jump secchi.
- Per i dialog, preferire origin transition dal trigger o shared visual continuity, con fallback a scale/fade rapidi.
- Evitare replay completi dei chart a ogni refetch secondario; distinguere primo ingresso da aggiornamento dati.
- Mantenere il focus sul KPI hero, non distribuire troppa enfasi su tutte le card.

## Vincoli e guardrail
- `prefers-reduced-motion`: niente assestamenti complessi, solo aggiornamento numerico leggibile.
- Niente durate lunghe sui KPI: i numeri devono restare percepiti come affidabili.
- Nessuna interferenza con clickability dei chart collassabili o dei dialog.
- Su mobile portrait evitare accumulo di animazioni concorrenti.

## Accettazione e test
- Il KPI principale e' il punto focale senza risultare teatrale.
- Aprendo il dialog snapshot la continuita' visiva e' percepibile.
- Le card condizionali non causano spostamenti bruschi del layout.
- I chart si rivelano con eleganza senza ritardare la lettura dei dati.
- Testare caricamento iniziale, refresh dati e utilizzo su mobile portrait.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/02-dashboard-overview.md` come fonte di verita' specifica per questa implementazione della pagina Panoramica. Concentrati su hero KPI con settling fisico, continuita' visiva tra CTA snapshot e dialog, reflow morbido delle card condizionali e chart reveal discreto. Non introdurre effetti decorativi gratuiti e non sacrificare la leggibilita' dei numeri. Rispetta le convenzioni del repo, `prefers-reduced-motion`, i token esistenti e prevedi fallback semplici quando le transizioni avanzate non sono disponibili. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
