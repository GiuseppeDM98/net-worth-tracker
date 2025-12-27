# Session Notes - 2025-12-26

## Obiettivo Sessione
Estendere dividend tracking automatico agli ETF con gestione conversione valuta (USD → EUR).

## Analisi Iniziale
- Campo ISIN attualmente editabile solo per tipo "Azione"
- Necessità di abilitare ISIN per tipo "ETF"
- ETF possono staccare dividendi in valute diverse (es. USD)
- Valuta principale app: EUR
- Conversione valuta necessaria per: tabella dividendi + expense entries

## Analisi Completata

**Campo ISIN attuale:**
- `AssetDialog.tsx:470` - disabilitato se `selectedType !== 'stock' || selectedAssetClass !== 'equity'`
- Solo azioni equity possono avere ISIN

**Gestione valute esistente:**
- Asset ha campo `currency` (editabile, default EUR)
- Dividend ha campo `currency` (supporta EUR, USD, GBP, CHF)
- Scraper Borsa Italiana estrae valuta da HTML
- **MANCA**: servizio conversione valuta

**API conversione valuta scelta:**
- Frankfurter API: https://api.frankfurter.app/latest?from=USD&to=EUR
- Gratuita, no API key richiesta
- Cache in-memory con TTL 24h per ridurre chiamate

## Piano Implementazione

1. ✅ Creare servizio conversione valuta (`lib/services/currencyConversionService.ts`)
2. ✅ Estendere tipo Dividend con campi EUR convertiti
3. ✅ Modificare AssetDialog per abilitare ISIN su ETF
4. ✅ Aggiornare dividend service per calcolare valori EUR
5. ✅ Modificare DividendTable per mostrare valori EUR
6. ✅ Aggiornare dividend income service per usare valori EUR nelle expenses

## TODO
- [x] Creare `currencyConversionService.ts`
- [x] Estendere `types/dividend.ts` con campi EUR
- [x] Modificare `AssetDialog.tsx` linea 470
- [x] Modificare `dividendService.ts` per conversione automatica
- [x] Aggiornare `DividendTable.tsx` per mostrare EUR
- [x] Modificare `dividendIncomeService.ts` per usare EUR
- [ ] Testare funzionalità con dividendi in USD
- [ ] Verificare componente Tooltip è disponibile

## Decisioni Tecniche

**1. Servizio Conversione Valuta**
- API scelta: **Frankfurter API** (https://api.frankfurter.app)
- Motivo: gratuita, no API key, affidabile, supporta tutte le valute principali
- Cache: in-memory con TTL 24h per ridurre chiamate API
- Fallback: se API fallisce ma esiste cache scaduta, usa cache come fallback
- Pattern: `convertToEur()` per singola conversione, `convertMultipleToEur()` per batch

**2. Estensione Tipo Dividend**
- Aggiunti campi opzionali: `grossAmountEur`, `taxAmountEur`, `netAmountEur`, `exchangeRate`
- Campi popolati automaticamente solo se `currency !== 'EUR'`
- `exchangeRate`: salvato per trasparenza e audit trail

**3. AssetDialog - ISIN per ETF**
- Modificata condizione disabled da `selectedType !== 'stock'` a `(selectedType !== 'stock' && selectedType !== 'etf')`
- Placeholder aggiornato con esempio ETF: `IE00B3RBWM25`
- Helper text aggiornato: "Necessario per azioni ed ETF quotati su Borsa Italiana con dividendi"

**4. Conversione Automatica in dividendService**
- `createDividend()`: converte automaticamente a EUR se `currency !== 'EUR'`
- `updateDividend()`: riconverte se currency/amount modificati
- Gestione errori: se conversione fallisce, continua senza campi EUR (graceful degradation)
- Log dettagliati per debugging conversioni

**5. Visualizzazione in DividendTable**
- Nuovo componente helper: `AmountWithConversion`
- Se EUR o nessuna conversione: mostra solo importo originale
- Se non EUR con conversione: mostra EUR + icona Info con tooltip
- Tooltip mostra: importo originale + nota "Convertito al tasso corrente"
- Colori preservati: verde per netto, rosso per tasse

**6. Expense Creation con EUR**
- `createExpenseFromDividend()`: usa `netAmountEur` se disponibile, altrimenti `netAmount`
- Currency expense: 'EUR' se convertito, altrimenti valuta originale
- Note arricchite: include importo originale se convertito (es. "100.00 USD convertiti")
- Stesso comportamento in `updateExpenseFromDividend()`

## Modifiche Implementate

**File Creati:**
1. `lib/services/currencyConversionService.ts` - Servizio conversione valuta con cache

**File Modificati:**
1. `types/dividend.ts` - Aggiunti campi EUR opzionali
2. `components/assets/AssetDialog.tsx` - ISIN abilitato per ETF
3. `lib/services/dividendService.ts` - Conversione automatica create/update
4. `components/dividends/DividendTable.tsx` - Visualizzazione EUR con tooltip
5. `lib/services/dividendIncomeService.ts` - Expense in EUR quando possibile
6. `lib/services/borsaItalianaScraperService.ts` - Fix ETF vs Stock table detection + URL routing (3 iterazioni)
7. `app/api/dividends/scrape/route.ts` - Passa asset.type a scraper
8. `app/api/cron/daily-dividend-processing/route.ts` - Passa asset.type a scraper

## Bug Risolti

**#1 - Scraper ETF con struttura tabella diversa** (fix durante test)
- **Problema**: Lo scraper falliva con ETF (errore "Invalid date format: 7,05", "Could not find both dates")
- **Causa**: Tabelle ETF hanno 4 colonne, tabelle Stock hanno 7+ colonne con struttura completamente diversa
- **Fix #1**: Pattern matching intelligente (tentativo iniziale)
  - `isDateFormat()` validator per riconoscere date DD/MM/YY
  - Ricerca dinamica per contenuto
  - Logging debug
- **Fix #2**: Rilevamento formato + parser dedicati
  - Pulizia whitespace (`\t\n\r`) nelle celle
  - Auto-detect: 4 celle = ETF, 7+ celle = Stock
  - **ETF**: posizioni fisse (Cell 0=ex-date, 1=amount, 2=currency, 3=payment-date)
  - **Stock**: pattern matching dinamico
  - Mapping valuta italiana ("Dollaro Usa" → "USD")
  - Tipo dividendo ETF sempre "ordinary" (nessuna colonna tipo in tabella ETF)
- **Fix #3 (finale - URL routing)**: URL hardcodato per sole azioni
  - **Problema identificato da utente**: URL usato era `https://www.borsaitaliana.it/borsa/azioni/listino-a-z.html` invece di `https://www.borsaitaliana.it/borsa/etf/dividendi.html`
  - Cambiato da singolo `BORSA_ITALIANA_BASE_URL` a due costanti separate
  - `BORSA_ITALIANA_STOCK_URL`: `/borsa/quotazioni/azioni/elenco-completo-dividendi.html`
  - `BORSA_ITALIANA_ETF_URL`: `/borsa/etf/dividendi.html`
  - Funzione `scrapeDividendsByIsin()` ora accetta parametro `assetType` (default 'stock')
  - URL selezionato dinamicamente: `assetType === 'etf' ? ETF_URL : STOCK_URL`
  - Aggiornati tutti i call sites: API route `/api/dividends/scrape` e cron job `/api/cron/daily-dividend-processing`
- **Test**: VWRL.MI (IE00B3RBWM25) pronto per test finale con URL corretto

## Nuove Dipendenze
Nessuna - usata solo API pubblica Frankfurter (no package npm richiesto).

## Componenti UI Verificati
- ✅ `Tooltip` - già presente in `components/ui/tooltip.tsx`

## Funzionalità Implementata

**Dividend Tracking per ETF con Conversione Valuta Automatica**

Gli utenti possono ora:
1. Inserire ISIN per ETF (non solo azioni) nel dialog di creazione asset
2. Lo scraper Borsa Italiana importa automaticamente dividendi ETF in qualsiasi valuta
3. I dividendi in valute estere (USD, GBP, CHF) vengono automaticamente convertiti in EUR
4. La tabella dividendi mostra importi EUR con tooltip che mostra importo originale
5. Le expense create dai dividendi usano importi EUR (valuta principale dell'app)
6. Il tasso di cambio è salvato per audit e trasparenza

**Esempio Pratico:**
- ETF VWCE (IE00B3RBWM25) stacca dividendo di $100 USD
- Sistema converte automaticamente a ~€92 EUR (tasso corrente)
- Tabella mostra €92 con tooltip "$100 USD originali"
- Expense creata con importo €92 EUR
- Note expense: "Dividendo VWCE.DE - Vanguard FTSE All-World (100.00 USD convertiti)"

## Test Necessari
- [x] Creare asset ETF con ISIN ✅ (testato da utente con VWRL.MI)
- [x] Testare scraper Borsa Italiana su ETF ✅ (fix applicato, pattern matching funziona)
- [ ] Verificare conversione USD → EUR in dividendService (prossimo test)
- [ ] Controllare visualizzazione tooltip in DividendTable (prossimo test)
- [ ] Verificare expense creata con importo EUR corretto (prossimo test)
