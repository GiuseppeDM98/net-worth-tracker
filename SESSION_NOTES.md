# Session Notes — Composizione Mensile per Strumento (Storico)

## Obiettivo
Nuova sezione nella pagina Storico (`/dashboard/history`) che permette di:
1. Selezionare un mese preciso e vedere il valore di ogni singolo strumento del patrimonio in quel mese.
2. Selezionare un sottoinsieme di strumenti e vederne la somma nel mese scelto.
3. Vedere l'andamento nel tempo della somma degli strumenti selezionati su tutti i mesi disponibili.

## Scoperta chiave
I dati esistono già: `MonthlySnapshot.byAsset` (`types/assets.ts`) contiene per ogni mese
`{ assetId, ticker, name, quantity, price, totalValue }`, con `totalValue` congelato tramite
`calculateAssetValue()` al momento dello snapshot. Tutte le regole di valore (EUR, GBp, immobili al
netto del debito, quantity×prezzo) sono già applicate. Feature di sola lettura/visualizzazione.

## Decisioni
- Grafico andamento somma asset selezionati: **incluso**.
- Selezione di default: **nessun asset selezionato**.

## File toccati
- [x] `SESSION_NOTES.md` (questo file)
- [x] `lib/utils/snapshotAssetBreakdown.ts` (nuovo — layer puro)
- [x] `__tests__/snapshotAssetBreakdown.test.ts` (nuovo — test)
- [x] `components/history/MonthlyAssetBreakdownSection.tsx` (nuovo — componente)
- [x] `app/dashboard/history/page.tsx` (wiring nuova sezione)
- [x] `CLAUDE.md` (aggiornamento finale)

## Verifica
- `npx vitest run __tests__/snapshotAssetBreakdown.test.ts` → 5/5 passati.
- `npx vitest run` (intera suite) → 697/697 passati.
- `npx tsc --noEmit` → nessun errore.
- ESLint sui file nuovi → pulito (gli errori su `page.tsx`, es. `loadData` hoisting + import inutilizzati, sono preesistenti e non toccati).

## Stato
Completato. Pushato sul branch `claude/add-monthly-history-section-Jxq4y`.

## Riepilogo
- **Cosa:** Nuova sezione "Valore per Strumento" nella pagina Storico. L'utente sceglie un mese e
  vede il valore di ogni singolo strumento di quel mese (dalla `byAsset` dello snapshot), seleziona
  un sottoinsieme via checkbox per vederne somma + % sul totale del mese, e ne segue l'andamento
  combinato nel tempo con un grafico cross-mese. Layer puro tipizzato + testato
  (`snapshotAssetBreakdown.ts`), componente self-contained, wiring come nuovo capitolo `breakdown`
  della pagina.
- **Perché:** Il dato esiste già congelato negli snapshot (`MonthlySnapshot.byAsset.totalValue`,
  calcolato a snapshot-time da `calculateAssetValue`), quindi tutte le regole di valore
  (EUR/GBp/immobili netto debito/quantità×prezzo) sono già applicate: la feature è di sola lettura,
  niente ricalcoli lato client. Default selezione = nessun asset e grafico andamento inclusi su
  scelta dell'utente.
- **Nota / gotcha:**
  - Il selettore mese mostra **solo** gli snapshot con `byAsset` non vuoto: gli snapshot vecchi
    (creati prima dell'introduzione del campo) non hanno il dettaglio per-strumento e sono esclusi
    di proposito — da qui i "salti" tra mesi nel dropdown (es. da Novembre 2025 a Gennaio 2024).
    Comportamento corretto, non un bug.
  - La selezione è per `assetId` e persiste tra i mesi: uno strumento assente in un certo mese
    contribuisce 0 al grafico (comprato dopo / venduto), così la linea riflette l'esposizione reale.
  - `MonthlyAssetBreakdownSection` è self-contained (solo `snapshots` in input); sub-componenti a
    livello di modulo per il React Compiler; colori solo da `useChartColors()`.
  - Gli errori ESLint residui in `app/dashboard/history/page.tsx` (`loadData` hoisting, import
    inutilizzati) sono preesistenti e su righe non toccate.
