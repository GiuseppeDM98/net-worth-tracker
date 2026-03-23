# DELIGHT-10 — Saluto Contestuale per Ora del Giorno

## Categoria
Delight

## Priorità
Bassa

## Descrizione
L'header del Dashboard mostra un titolo fisso. Sostituirlo con un saluto dinamico basato sull'ora del giorno in timezone Europe/Rome (già gestita dal progetto con `dateHelpers.ts`). Caldo, personale, e coerente con il contesto dell'app.

## Saluti Proposti

| Ora | Saluto |
|-----|--------|
| 5:00 – 11:59 | "Buongiorno" |
| 12:00 – 17:59 | "Buon pomeriggio" |
| 18:00 – 21:59 | "Buonasera" |
| 22:00 – 4:59 | "Buonanotte" |

**Opzionale**: Aggiungere il nome utente se disponibile nel profilo.
**Opzionale**: Sottotitolo contestuale:
- Mattina: "Ecco il tuo patrimonio di stamattina"
- Pomeriggio: "Aggiornamento pomeridiano"
- Sera: "Riepilogo della giornata"
- Notte: "Sei sveglio tardi — ecco il tuo portafoglio"

## Stato Attuale
- `app/dashboard/page.tsx` — header della dashboard con titolo
- `lib/utils/dateHelpers.ts` — `getItalyDate()`, `getItalyMonth()`, ecc. per timezone Europe/Rome
- User info disponibile da `useAuth()` context

## Soluzione Proposta
1. Creare `lib/utils/getGreeting.ts` — funzione pura testabile:
   ```ts
   export function getGreeting(hour: number): { greeting: string; subtitle: string }
   ```
2. In `app/dashboard/page.tsx`, ottenere l'ora corrente in timezone Europe/Rome
3. Sostituire il titolo statico con il saluto dinamico
4. L'ora viene calcolata al mount — non aggiornata in real-time (non necessario)

## File Coinvolti
- Nuovo: `lib/utils/getGreeting.ts`
- `app/dashboard/page.tsx` — modifica dell'header
- `lib/utils/dateHelpers.ts` — riferimento per il pattern timezone

## Vincoli
- Usare timezone Europe/Rome (coerente con il resto dell'app)
- La funzione `getGreeting` deve essere una pure function — testabile con Vitest
- Se il nome utente non è disponibile (profilo incompleto): non mostrarlo, solo il saluto
- Il sottotitolo è opzionale — se l'header è già affollato, skippa il sottotitolo

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript, Tailwind v4).

Obiettivo: sostituire il titolo statico dell'header della dashboard con un saluto contestuale basato sull'ora del giorno in timezone Europe/Rome.

Contesto:
- `lib/utils/dateHelpers.ts` — contiene helper per timezone Europe/Rome (es. `getItalyDate()`). Leggi quel file per capire il pattern usato nel progetto
- `app/dashboard/page.tsx` — file da modificare. Leggi per capire la struttura dell'header e come è disponibile il nome utente
- Il framework di test è Vitest — le funzioni pure vanno messe in `lib/utils/` per essere testabili

Task:
1. Leggi `lib/utils/dateHelpers.ts` per capire come si ottiene l'ora corrente in Europe/Rome
2. Crea `lib/utils/getGreeting.ts`:
   ```ts
   export type GreetingResult = { greeting: string; subtitle: string }
   export function getGreeting(hour: number): GreetingResult {
     // 5-11: Buongiorno / "Ecco il tuo patrimonio di stamattina"
     // 12-17: Buon pomeriggio / "Aggiornamento pomeridiano"
     // 18-21: Buonasera / "Riepilogo della giornata"
     // 22-4: Buonanotte / "Sei sveglio tardi — ecco il tuo portafoglio"
   }
   ```
3. Leggi `app/dashboard/page.tsx` per capire:
   - Come è strutturato l'header
   - Come si chiama il nome utente disponibile (da `useAuth()` o profilo)
4. Nel componente, ottieni l'ora corrente in Europe/Rome usando `Intl.DateTimeFormat` o il pattern di `dateHelpers.ts`
5. Sostituisci il titolo statico con `{greeting.greeting}` e se c'è spazio aggiungi il sottotitolo in muted più piccolo

Vincoli:
- La funzione `getGreeting` deve essere una pure function che accetta solo `hour: number` — non accedere a `Date` direttamente dentro (il caller la ottiene e la passa)
- Se il nome utente è disponibile e non troppo lungo, aggiungilo: "Buongiorno, Giuseppe"
- Non aggiornare il saluto in real-time — calcolato solo al mount con un `useMemo` o `useState`

Al termine dimmi: dove aggiungere il test Vitest per `getGreeting` (in quale test file esistente o nuovo), quali casi testare (boundary ora 5, 12, 18, 22, 0, 4), come verificare visivamente il saluto a diverse ore simulando l'ora in DevTools, e se il nome utente è risultato disponibile nel componente.
```
