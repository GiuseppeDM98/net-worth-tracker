# Session Notes - 2026-01-03

## Obiettivo Sessione
Miglioramenti UI per grafici Cashflow e tabelle Asset Price History:
1. Filtrare grafici "Storico Totale" (Cashflow) per mostrare solo dati dal 2025 in poi
2. Aggiungere colonna "YTD" in tab "Prezzi Anno Corrente" (Assets)
3. Aggiungere colonna "From Start" in tab "Prezzi Storici" (Assets)

## Contesto Iniziale
- Stato progetto: Next.js 16 + TypeScript + Firebase + React Query
- Ultima sessione: Implementazione separazione dividend income in performance metrics (2026-01-02)
- Asset Price History: 5 tabs implementati con conditional display logic e total row (2025-12-31)
- Cashflow: 4 tabs (Tracciamento, Dividendi, Anno Corrente, Storico Totale) con grafici trend

## Riferimenti
- File target cashflow: `app/dashboard/cashflow/page.tsx`, `components/cashflow/TotalHistoryTab.tsx`
- File target assets: `app/dashboard/assets/page.tsx`, `components/assets/AssetPriceHistoryTable.tsx`
- Utility esistenti: `lib/utils/assetPriceHistoryUtils.ts`

---

## Timeline Sviluppo

### [In corso] - Analisi Requirements

**Domande di chiarimento:**
1. Task #1 (Grafici Cashflow): Confermi che il filtro deve applicarsi SOLO ai 6 grafici trend nella tab "Storico Totale"? Oppure anche ad altri grafici nella pagina?
2. Task #2 (YTD Column): La percentuale YTD deve confrontare il prezzo del primo snapshot dell'anno (gennaio 2025) con l'ultimo snapshot disponibile dell'anno corrente?
3. Task #3 (From Start Column): Il "primo snapshot" è novembre 2025 come hardcoded nel filterStartDate, corretto?
4. Colonne YTD/From Start: Devono apparire anche per assets con price=1 (cash/liquidity) oppure solo per assets tradabili?

---

## Decisioni Tecniche
<!-- Scelte importanti con motivazioni -->

---

## Bug Risolti
<!-- Problema → Causa → Soluzione -->

---

## Dipendenze Aggiunte
<!-- Libreria | Versione | Scopo -->

---

## TODO & Refactoring
<!-- Task posticipati o miglioramenti identificati -->

---

## Pattern & Convenzioni
<!-- Nuovi pattern seguiti o modifiche agli esistenti -->

---

## Blocchi & Workaround
<!-- Problemi temporanei e soluzioni provvisorie -->
