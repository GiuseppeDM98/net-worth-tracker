# DELIGHT-02 — FIRE Goal Raggiunto: Banner Celebrativo

## Categoria
Delight

## Priorità
Alta

## Descrizione
Se il patrimonio attuale dell'utente supera il FIRE Number calcolato, questo traguardo straordinario viene mostrato silenziosamente nella UI. Aggiungere un banner celebrativo animato (con confetti leggero) che compare sopra al FIRE Calculator quando il patrimonio >= FIRE Number.

## Stato Attuale
- `components/fire-simulations/FireCalculatorTab.tsx` — calcola e mostra FIRE Number
- `lib/services/fireService.ts` — logica di calcolo
- Il FIRE Number e il patrimonio attuale sono già disponibili nella stessa vista
- Nessuna celebrazione visiva attuale

## Soluzione Proposta
1. Calcolare la condizione: `currentNetWorth >= fireNumber` (escludendo casa se l'opzione è attiva)
2. Se condizione vera, mostrare un banner animato con `AnimatePresence` + `slideDown`
3. Banner content: icona 🔥 (o SVG), titolo "Obiettivo FIRE Raggiunto!", sottotitolo con patrimonio attuale vs FIRE Number
4. Confetti burst al mount del banner (stessa logica di DELIGHT-01 con localStorage per "già visto")
5. Banner dismissibile (X button) con persist in localStorage

## Design del Banner
```
┌─────────────────────────────────────────────────────┐
│  🔥  Obiettivo FIRE Raggiunto!                     X │
│     Il tuo patrimonio (€XXX.XXX) supera il FIRE     │
│     Number (€YYY.YYY). Sei finanziariamente libero! │
└─────────────────────────────────────────────────────┘
```
- Background: gradiente emerald `from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20`
- Border: `border-emerald-200 dark:border-emerald-800`
- Testo: colori standard

## File Coinvolti
- `components/fire-simulations/FireCalculatorTab.tsx` — aggiungere banner
- `lib/utils/celebrationUtils.ts` — riutilizzare (creato in DELIGHT-01)
- `package.json` — `canvas-confetti` già installato in DELIGHT-01

## Vincoli
- Mostrare solo se i dati sono caricati (non durante loading)
- Il banner deve essere dismissibile — una volta chiuso non ricompare (localStorage)
- Rispettare `prefers-reduced-motion` per il confetti
- Se l'utente ha impostato "escludi casa" nel FIRE Calculator, usare il patrimonio corretto per il confronto

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, TypeScript, Tailwind v4).

Obiettivo: aggiungere un banner celebrativo animato nel FIRE Calculator quando il patrimonio dell'utente raggiunge o supera il FIRE Number.

Prerequisiti: assicurati che `canvas-confetti` e `lib/utils/celebrationUtils.ts` esistano (creati in sessione DELIGHT-01). Se non esistono, creali tu (vedi specifiche in DELIGHT-01).

Contesto:
- `components/fire-simulations/FireCalculatorTab.tsx` — file principale da modificare. Leggi questo file per capire come sono calcolati e disponibili `currentNetWorth` e `fireNumber`
- `lib/services/fireService.ts` — logica FIRE se serve capire i calcoli
- `lib/utils/motionVariants.ts` — usa `slideDown` per l'animazione del banner
- Il patrimonio attuale viene da settings/snapshot — identifica come è disponibile in FireCalculatorTab

Task:
1. Leggi `components/fire-simulations/FireCalculatorTab.tsx` per identificare:
   - Come si chiama la variabile del FIRE Number calcolato
   - Come si chiama la variabile del patrimonio attuale
   - Se c'è l'opzione "escludi casa abitazione" e come influenza il confronto
2. Aggiungi la condizione `isFireReached = currentNetWorth >= fireNumber && fireNumber > 0`
3. Crea un componente `FireReachedBanner` nello stesso file (o in `components/fire-simulations/FireReachedBanner.tsx`):
   - Usa `slideDown` da `motionVariants.ts` con `AnimatePresence`
   - Background: `bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20`
   - Border: `border border-emerald-200 dark:border-emerald-800 rounded-lg`
   - Contenuto: titolo "Obiettivo FIRE Raggiunto! 🔥", testo con patrimonio attuale vs FIRE Number formattati in EUR
   - X button per dismiss (salva in localStorage: `fire_reached_dismissed_{userId}`)
4. Al mount del banner (se non già dismissed e !reducedMotion), triggera confetti con `celebrationUtils`
5. Posiziona il banner SOPRA al form del FIRE Calculator (come prima card della pagina)

Vincoli:
- Non mostrare il banner durante il caricamento dati
- `fireNumber > 0` è un guard importante (evita false positive con dati non ancora calcolati)
- Il dismiss è permanente — non resettarlo mai automaticamente
- Usa `useAuth()` o il context disponibile per avere lo `userId` per la localStorage key

Al termine dimmi: come testare il banner (come forzare la condizione `isFireReached` per vederlo), come testare il dismiss, come resettare il localStorage per rivederlo, e come verificare che non appaia con patrimonio < FIRE Number.
```
