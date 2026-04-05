# Step 2 - Guided Month Analysis

## Obiettivo
Consegnare il primo rilascio utile della feature: analisi AI del mese selezionato, con mese corrente come default, contesto numerico affidabile e risposta in streaming generata da Claude.

## UX finale
- L'utente apre `Assistente AI` e vede subito:
  - titolo pagina;
  - picker mese/anno;
  - CTA primaria `Analizza il mese`;
  - 3-5 prompt guidati riferiti al mese attivo.
- Se il mese corrente non ha ancora uno snapshot, la UI seleziona comunque il mese corrente ma mostra un callout che spiega se l'analisi si basa su cashflow parziale, sull'ultimo snapshot disponibile o se i dati sono insufficienti.
- Quando parte l'analisi:
  - compare uno stato “Analisi in corso...”
  - il testo arriva in streaming
  - il pannello laterale mostra i numeri di contesto del mese
- Al termine, l'utente legge una risposta che spiega:
  - variazione del patrimonio;
  - peso di entrate/uscite/dividendi;
  - differenza tra crescita da mercato e crescita da apporti;
  - principali variazioni di allocazione;
  - contesto macro solo se abilitato o pertinente.

## Contratti dati/API

### Bundle di contesto mensile
Creare un builder condiviso, ad esempio `lib/services/assistantMonthContextService.ts`, che produca:

```ts
export interface AssistantMonthContextBundle {
  selector: { year: number; month: number };
  currentSnapshot: MonthlySnapshot | null;
  previousSnapshot: MonthlySnapshot | null;
  cashflow: {
    totalIncome: number;
    totalExpenses: number;
    totalDividends: number;
    netCashFlow: number;
    transactionCount: number;
  };
  netWorth: {
    start: number | null;
    end: number | null;
    delta: number | null;
    deltaPct: number | null;
  };
  allocationChanges: {
    assetClass: string;
    previousValue: number | null;
    currentValue: number | null;
    absoluteChange: number;
    percentagePointsChange: number | null;
  }[];
  dataQuality: {
    hasSnapshot: boolean;
    hasPreviousBaseline: boolean;
    hasCashflowData: boolean;
    isPartialMonth: boolean;
    notes: string[];
  };
}
```

### Regole dati
- Il mese si identifica sempre con helper Italia, non con `Date.getMonth()` / `getFullYear()`.
- `start` e `end` del mese per query Firestore devono includere l'intero ultimo giorno.
- `currentSnapshot`
  - snapshot del mese selezionato, se esiste;
  - altrimenti `null`.
- `previousSnapshot`
  - snapshot del mese precedente, se esiste;
  - altrimenti `null`.
- `netWorth.start`
  - `previousSnapshot.totalNetWorth` se esiste;
  - altrimenti `null`.
- `netWorth.end`
  - `currentSnapshot.totalNetWorth` se esiste;
  - altrimenti `null`.
- `netWorth.delta`
  - solo se esistono entrambi i valori.
- `cashflow.totalDividends`
  - separato dal resto delle entrate usando `dividendIncomeCategoryId` dalle impostazioni, come già avviene in [performanceService.ts](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/lib/services/performanceService.ts).
- `allocationChanges`
  - calcolati confrontando `byAssetClass` di snapshot corrente e precedente;
  - ordinati per `Math.abs(absoluteChange)` decrescente;
  - limitati ai primi 5.

### Uso della route stream
- `mode: 'month_analysis'`
- payload obbligatorio:

```ts
{
  userId: string;
  mode: 'month_analysis';
  prompt: string;
  month: { year: number; month: number };
  preferences?: AssistantPreferences;
}
```

- Il server non deve fidarsi del testo utente per il mese: il contesto numerico deve essere sempre rigenerato lato server dal `month`.

## Implementazione
- Pagina: [app/dashboard/assistant/page.tsx](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/assistant/page.tsx)
  - usare `useMemo` per derivare mesi selezionabili e prompt chips
  - mese default:
    - mese Italia corrente, se utente ha dati almeno fino a quel mese o ha cashflow nello stesso mese
    - altrimenti ultimo mese disponibile con snapshot
- Nuovi componenti consigliati:
  - `components/assistant/AssistantPageShell.tsx`
  - `components/assistant/AssistantMonthPicker.tsx`
  - `components/assistant/AssistantContextCard.tsx`
  - `components/assistant/AssistantStreamingResponse.tsx`
- Builder server-side:
  - recupera snapshot utente con `getUserSnapshots(userId)`
  - recupera transazioni del mese con `getExpensesByDateRange(userId, startDate, endDate)`
  - legge settings con `getSettings(userId)` per separare dividendi e preferenze
- Prompt server-side:
  - creare funzione `buildMonthAnalysisPrompt(bundle, userPrompt, preferences)` in `lib/server/assistant/prompts.ts`
  - output richiesto a Claude:
    - massimo 450 parole
    - markdown semplice
    - sezione iniziale “In sintesi”
    - sezione “Cosa ha mosso il patrimonio”
    - sezione finale “1-2 azioni o attenzioni”
- Web search:
  - usare solo se `preferences.includeMacroContext === true`
  - massimo 2 ricerche
  - se il mese è molto recente, Claude può cercare eventi rilevanti del mese selezionato

## Stati ed errori
- Mese senza snapshot ma con cashflow: analisi permessa, ma con disclaimer che il patrimonio finale non è consolidato.
- Mese con snapshot ma senza baseline: analisi permessa, ma niente delta percentuale; il prompt deve dirlo a Claude.
- Mese senza snapshot e senza cashflow: bloccare CTA e mostrare “Nessun dato disponibile per questo mese”.
- Stream fallito: mantenere il pannello numerico visibile e offrire `Rigenera`.

## Criteri di accettazione
- Aprendo la pagina, il mese corrente è pre-selezionato quando sensato.
- Il contesto mensile mostra snapshot, cashflow, dividendi e top cambi di allocazione.
- L'analisi usa sempre il mese scelto dall'utente, non dedotto dal testo del prompt.
- Il primo rilascio è utile anche senza thread persistenti.

## Test
- `npx tsc --noEmit`
- `npx vitest run __tests__/assistantMonthContextService.test.ts`
- Casi minimi:
  - snapshot mancante
  - unico snapshot disponibile
  - mese senza cashflow
  - mese con soli dividendi
  - esclusione dummy snapshot
  - confini mese vicino a mezzanotte
- Validazione manuale:
  - cambio mese
  - CTA disabilitata quando mancano dati
  - streaming completo

## Prompt di implementazione
```text
Implementa lo step 2 dell'Assistente AI: analisi guidata del mese.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/02-guided-month-analysis.md

Obiettivo:
- costruire il bundle AssistantMonthContextBundle server-side
- aggiungere month picker e pannello numerico in /dashboard/assistant
- inviare a Claude un prompt strutturato basato sul mese selezionato
- supportare streaming SSE per la risposta

Regole dati:
- usa snapshot mese corrente + snapshot del mese precedente come baseline
- separa dividendi dal resto delle entrate usando dividendIncomeCategoryId
- end date Firestore deve includere l'ultimo giorno intero del mese
- nessun calcolo dominio con Date.getMonth()/getFullYear()
- la nuova funzionalità deve essere fruibile e ottimizzata per desktop, tablet e mobile

Output atteso:
- pagina Assistente AI con analisi mensile realmente funzionante
- mese corrente default
- fallback leggibili per dati incompleti
- test unitari sul builder del contesto mese
```
