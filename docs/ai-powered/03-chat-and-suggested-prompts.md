# Step 3 - Chat and Suggested Prompts

## Obiettivo
Estendere la pagina Assistente AI da analisi guidata singola a workspace conversazionale completo, con prompt suggeriti, composer libero e transizione naturale tra richiesta contestuale e chat aperta sul patrimonio.

## UX finale
- La pagina si comporta come una chat principale del prodotto, non come un semplice dialog.
- In alto l'utente vede prompt chips iniziali:
  - `Analizza questo mese`
  - `Cosa sta pesando di più sul patrimonio?`
  - `Come stanno andando spese e risparmio?`
  - `Parlami dei rendimenti recenti`
  - `C'è qualcosa nel contesto geopolitico da tenere d'occhio?`
- I chip compilano o inviano direttamente il prompt in base al caso:
  - chip strettamente guidati: invio diretto
  - chip esplorativi: prefill del composer modificabile
- Composer fisso in basso:
  - textarea autosize
  - invio con `Enter` e newline con `Shift+Enter`
  - pulsante `Invia`
- Se il prompt riguarda il mese attivo, il contesto mese resta agganciato.
- Se il prompt è generale sul patrimonio, la chat passa a `mode: 'chat'`.

## Contratti dati/API

### Catalogo prompt suggeriti
Creare un modulo statico `lib/constants/assistantPrompts.ts`:

```ts
export const assistantPromptChips: AssistantPromptChip[] = [
  {
    id: 'month-analysis',
    label: 'Analizza questo mese',
    prompt: 'Analizza il mese selezionato e spiegami cosa ha mosso il patrimonio.',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'optional',
  },
  {
    id: 'net-worth-drivers',
    label: 'Cosa pesa di più sul patrimonio?',
    prompt: 'Quali fattori stanno pesando di più sul mio patrimonio in questo momento?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'none',
  },
  {
    id: 'spending-savings',
    label: 'Spese e risparmio',
    prompt: 'Guardando i miei dati recenti, come stanno andando spese, entrate e capacità di risparmio?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'none',
  },
  {
    id: 'returns-recent',
    label: 'Rendimenti recenti',
    prompt: 'Come stanno andando i miei rendimenti recenti e cosa significa per il portafoglio?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'none',
  },
  {
    id: 'macro-watch',
    label: 'Contesto geopolitico',
    prompt: 'C’è qualcosa nel contesto geopolitico o macroeconomico che dovrei tenere d’occhio per il mio patrimonio?',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'macro',
  },
];
```

### Regole di routing
- `month_analysis`
  - usato per richieste centrate su un mese preciso o chip guidati del mese
- `chat`
  - usato per prompt generali su patrimonio, rischio, cashflow, allocazione, rendimento, geopolitica
- Se l'utente scrive in chat libera ma c'è un mese attivo, il client invia comunque il mese come contesto opzionale; il server decide se usarlo.

## Implementazione
- Componenti consigliati:
  - `components/assistant/AssistantPromptChips.tsx`
  - `components/assistant/AssistantComposer.tsx`
  - `components/assistant/AssistantConversation.tsx`
- La shell pagina deve tenere tre stati distinti:
  - `selectedMonth`
  - `draftPrompt`
  - `activeRequest`
- Non salvare `derived state` con `useEffect + setState`; usare `useMemo`.
- I messaggi assistant durante lo streaming si renderizzano come plain text fino a `done`, poi markdown, replicando il pattern già usato in [AIAnalysisDialog.tsx](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/performance/AIAnalysisDialog.tsx).
- UI mobile:
  - il composer deve restare leggibile sopra la bottom navigation;
  - il wrapper pagina deve usare `max-desktop:portrait:pb-20`.
- UI desktop:
  - layout 2 colonne solo se il pannello laterale aggiunge valore reale;
  - non usare dialog per questa v1, la route dedicata è la shell primaria.

## Stati ed errori
- Nessun messaggio ancora inviato: mostra hero compatta con prompt chips.
- Invio in corso: disabilitare input e bottone, mantenendo visibile il testo già digitato.
- Errore stream: mostrare toast + inline error nel thread attivo.
- Chat vuota dopo cambio thread futuro: tornare allo stato hero, non a schermata bianca.

## Criteri di accettazione
- I prompt suggeriti coprono patrimonio, mese corrente, spese, rendimenti e geopolitica.
- L'utente può passare da prompt guidato a chat libera senza cambiare pagina.
- Il composer supporta tastiera e streaming in modo solido su desktop e mobile.
- Nessun remount inutile dell'intera conversazione a ogni token ricevuto.

## Test
- `npx tsc --noEmit`
- Test unitari per il catalogo prompt e il routing `mode`
- Validazione manuale:
  - invio chip diretto
  - prefill composer
  - enter / shift+enter
  - streaming e copy della risposta
  - mobile portrait con bottom nav visibile

## Prompt di implementazione
```text
Implementa lo step 3 dell'Assistente AI: chat e prompt suggeriti.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/03-chat-and-suggested-prompts.md

Obiettivo:
- trasformare /dashboard/assistant in una chat page completa
- aggiungere prompt chips iniziali
- aggiungere composer fisso in basso
- supportare sia richieste month_analysis sia chat libera sul patrimonio

Vincoli:
- usa plain text durante lo streaming e markdown solo a stream completato
- niente dialog come shell principale
- su mobile portrait lascia spazio alla bottom navigation
- usa useMemo per derived state, non useEffect + setState
- la nuova funzionalità deve essere fruibile e ottimizzata per desktop, tablet e mobile

Output atteso:
- esperienza conversazionale completa e stabile
- prompt suggeriti già pronti
- passaggio fluido tra analisi guidata e chat libera
```
