# DELIGHT-01 — Milestone Celebration con Confetti

## Categoria
Delight

## Priorità
Alta

## Descrizione
Quando l'utente visita la History page e ha completato una milestone di raddoppio del patrimonio (es. "Hai raddoppiato il patrimonio da €50k a €100k"), il momento passa in silenzio. Aggiungere un burst di confetti leggero alla prima visualizzazione di ogni milestone completata — celebra un traguardo finanziario significativo senza essere rumoroso.

## Stato Attuale
- `components/history/DoublingMilestoneTimeline.tsx` — mostra le milestone completate
- `components/history/DoublingTimeSummaryCards.tsx` — summary cards con stato milestone
- Nessun confetti o celebrazione visiva presente
- `types/assets.ts` contiene `DoublingMilestone` type

## Soluzione Proposta
1. Installare `canvas-confetti` (2KB gzipped, zero dipendenze)
2. In `DoublingMilestoneTimeline.tsx`, rilevare le milestone con `completed: true`
3. Al primo render di una milestone completata (non ad ogni visita), triggerare un burst confetti
4. Usare `localStorage` per tracciare quali milestone sono già state "celebrate" (evitare ripetizione)
5. Key localStorage: `celebrated_milestone_{userId}_{milestoneLabel}` o simile

## Parametri Confetti
```ts
confetti({
  colors: ['#10B981', '#F59E0B', '#ffffff', '#6EE7B7'], // emerald + amber + white
  particleCount: 60,
  spread: 70,
  origin: { y: 0.6 },
  gravity: 1.2, // cade veloce, non indugia
  scalar: 0.8,  // particelle piccole, non ingombranti
})
```

## File Coinvolti
- `components/history/DoublingMilestoneTimeline.tsx` — modifica principale
- Nuovo: `lib/utils/celebrationUtils.ts` — logica "già celebrato?" con localStorage
- `package.json` — aggiungere `canvas-confetti` e `@types/canvas-confetti`

## Vincoli
- Rispettare `prefers-reduced-motion`: non sparare confetti se l'utente ha ridotto le animazioni
- Il burst deve essere una tantum per milestone — non ripetersi ad ogni visita
- Nessun confetti su milestone future o in progress
- Duration totale effetto: < 2 secondi

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript, Tailwind v4).

Obiettivo: aggiungere un burst di confetti alla prima visualizzazione di ogni milestone di raddoppio patrimonio completata nella History page.

Contesto:
- `components/history/DoublingMilestoneTimeline.tsx` mostra le milestone — leggi quel file per capire la struttura dei dati (quali milestone sono `completed`)
- `types/assets.ts` contiene il tipo `DoublingMilestone`
- Il confetti deve apparire UNA SOLA VOLTA per milestone per utente (usare localStorage)
- Colori brand: emerald #10B981, amber #F59E0B, white #ffffff

Task:
1. Installa `canvas-confetti` e `@types/canvas-confetti` (`npm install canvas-confetti @types/canvas-confetti`)
2. Crea `lib/utils/celebrationUtils.ts` con due funzioni:
   - `hasCelebrated(key: string): boolean` — controlla localStorage
   - `markCelebrated(key: string): void` — scrive in localStorage
   - `shouldReduceMotion(): boolean` — controlla `window.matchMedia('(prefers-reduced-motion: reduce)')`
3. Leggi e modifica `components/history/DoublingMilestoneTimeline.tsx`:
   - Al mount, per ogni milestone `completed === true`, controlla se è già stata celebrata
   - Se NON è stata celebrata E `!shouldReduceMotion()`, triggera confetti dopo 800ms di delay (aspetta che l'animazione di stagger della lista sia finita)
   - Chiama `markCelebrated` subito dopo aver sparato il confetti
   - La key localStorage deve includere un identificativo della milestone (es. il label o il valore target)
4. Parametri confetti: `{ colors: ['#10B981', '#F59E0B', '#ffffff', '#6EE7B7'], particleCount: 60, spread: 70, origin: { y: 0.6 }, gravity: 1.2, scalar: 0.8 }`

Vincoli:
- Usa `dynamic import` per canvas-confetti (lazy load — non nel bundle principale)
- Non aggiungere confetti alle milestone non ancora completate
- Il delay di 800ms è importante: deve partire DOPO l'animazione di stagger della lista

Al termine dimmi: come testare il confetti (come resettare localStorage per rivederlo), come verificare che non si ripeta alla seconda visita, come testare con prefers-reduced-motion attivo (istruzioni su come simularlo in Chrome DevTools), e quali casi edge verificare (nessuna milestone completata, tutte già celebrate).
```
