# DELIGHT-03 — Toast Success: Checkmark Draw Animation

## Categoria
Delight

## Priorità
Bassa

## Descrizione
Il toast di successo mostra `CircleCheckIcon` (Lucide) staticamente. Aggiungere una piccola animazione SVG "draw" sul checkmark — il cerchio si disegna e poi il tick appare — per rendere ogni conferma di azione leggermente più soddisfacente.

## Stato Attuale
- `components/ui/sonner.tsx` — usa `CircleCheckIcon` da Lucide per i toast success
- Lucide icons sono SVG React component — non animabili direttamente con stroke-dashoffset senza sostituzione
- Sonner supporta `icons` custom per tipo

## Soluzione Proposta
1. Creare un componente SVG custom `AnimatedCheckIcon` che usa `stroke-dashoffset` animation via CSS
2. Il cerchio si "disegna" in 300ms, poi il tick appare in 200ms con fade-in
3. Sostituire `CircleCheckIcon` nel toast success con `AnimatedCheckIcon`
4. L'animazione si attiva automaticamente ad ogni toast (non usa localStorage — ogni successo merita il feedback)

## Implementazione SVG
```tsx
// AnimatedCheckIcon.tsx
// SVG: cerchio (r=10) + path tick (M5,10 L8,13 L15,7)
// stroke-dasharray + stroke-dashoffset per draw animation
// keyframes in CSS: dash-draw (cerchio 0→62.8) + tick-appear (fade 0→1)
```

## File Coinvolti
- `components/ui/sonner.tsx` — sostituire l'icona success
- Nuovo: `components/ui/AnimatedCheckIcon.tsx`

## Vincoli
- Rispettare `prefers-reduced-motion`: se ridotto, mostrare l'icona statica
- L'animazione deve completarsi in < 600ms totali (non deve ritardare la lettura del messaggio)
- Il componente deve funzionare sia in tema chiaro che scuro (usare `currentColor` per il stroke)
- Non usare librerie aggiuntive — solo CSS + SVG inline

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript, Tailwind v4).

Obiettivo: animare l'icona di successo nel toast di Sonner con un effetto "draw" SVG — il cerchio si disegna, poi appare il tick.

Contesto:
- `components/ui/sonner.tsx` — file da modificare. Leggi questo file per capire come sono configurati gli icon per tipo di toast
- Sonner accetta un oggetto `icons` nel `<Toaster>` con una chiave `success` per l'icona custom
- L'app usa Tailwind v4 — puoi usare sia classi Tailwind che style inline

Task:
1. Leggi `components/ui/sonner.tsx` per capire la struttura attuale
2. Crea `components/ui/AnimatedCheckIcon.tsx` — un componente SVG con queste caratteristiche:
   - SVG 16×16 con viewBox="0 0 16 16"
   - Cerchio: `<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />`
     - Animato con stroke-dasharray + stroke-dashoffset: da nascosto (dashoffset=44) a visibile (dashoffset=0) in 300ms ease-out
   - Tick: `<path d="M4.5 8L7 10.5L11.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />`
     - Appare con opacity 0→1 in 200ms, con delay di 250ms (dopo che il cerchio è quasi completato)
   - Usare `@keyframes` inline con `<style>` JSX, oppure classi CSS globali in `globals.css`
   - Rispettare `prefers-reduced-motion`: se il media query è attivo, mostrare tutto visibile senza animazione
3. Sostituire l'icona success in `sonner.tsx` con `<AnimatedCheckIcon />`
4. Verifica che usi `currentColor` per il colore — eredita dal contesto del toast (tema chiaro/scuro)

Vincoli:
- Durata totale animazione: ≤ 600ms
- Non usare librerie aggiuntive (solo SVG + CSS)
- Il componente deve essere size-controllabile (accettare `className` prop per width/height)
- Testare in dark mode: il colore deve rimanere corretto

Al termine dimmi: come triggerare un toast di successo per testare l'animazione (quale azione nell'app genera `toast.success`), come verificare in dark mode, come testare con prefers-reduced-motion (istruzioni per Chrome DevTools), e se ci sono altri toast che potrebbero beneficiare dello stesso trattamento.
```
