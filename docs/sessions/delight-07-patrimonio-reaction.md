# DELIGHT-07 — Numero Patrimonio: Reazione Direzionale

## Categoria
Delight

## Priorità
Media

## Descrizione
Il numero del Totale Patrimonio nella dashboard non dà segnali visivi sulla direzione del cambiamento rispetto all'ultimo snapshot. Aggiungere una reazione direzionale: se il patrimonio è aumentato rispetto al mese precedente, il numero appare con un leggero "rise" animation (slide-up + verde); se diminuito, "fall" animation (slide-down + rosso). Sottile, preciso, informativo.

## Stato Attuale
- `app/dashboard/page.tsx` — Totale Patrimonio mostrato con `formatCurrency(totalNetWorth)`
- Variazione mensile già calcolata (es. `monthlyChange`, `monthlyChangePercent`) — presente come card separata
- Nessuna animazione direzionale sul numero principale

## Soluzione Proposta
1. Leggere il segno di `monthlyChange` (o `monthlyChangePercent`)
2. Al mount del componente (con `useCountUp` se implementato da ANIMATE-06), aggiungere:
   - Se `change > 0`: il numero slide da `y: 8` a `y: 0` con colore che parte da verde smeraldo e torna al colore normale in 1.5s
   - Se `change < 0`: slide da `y: -8` a `y: 0` con colore che parte da rosso e torna al normale
   - Se `change === 0`: nessuna animazione direzionale
3. Il colore finale è sempre quello standard — la tinta è temporanea (hint visivo, non stato permanente)

## Dettaglio Animazione
```
Entrata positiva:  y: +8px → y: 0  (risale dal basso, sale come un numero che cresce)
Entrata negativa:  y: -8px → y: 0  (scende dall'alto, cade come un numero che scende)
Colore positivo:   text-emerald-600 → text-foreground  (fade in 1.5s)
Colore negativo:   text-red-500 → text-foreground  (fade in 1.5s)
```

## File Coinvolti
- `app/dashboard/page.tsx` — modifica sulla card Totale Patrimonio
- `lib/utils/motionVariants.ts` — nessuna modifica (usare `animate` inline su motion.div)

## Vincoli
- Animazione solo al mount della pagina — non re-triggerare su re-render
- Non cambiare il colore finale del testo (deve tornare al colore standard del tema)
- Rispettare `prefers-reduced-motion`: skip dell'animazione direzionale, mostrare solo il colore finale (che è comunque sempre neutro)
- Non applicare a tutte le card — solo al Totale Patrimonio (la metrica principale)

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, TypeScript, Tailwind v4).

Obiettivo: aggiungere una reazione visiva direzionale al numero del Totale Patrimonio nella dashboard — slide da sotto se aumentato, slide da sopra se diminuito, con tinta di colore temporanea che torna al neutro.

Contesto:
- `app/dashboard/page.tsx` — file principale da modificare
- Framer Motion è disponibile, `MotionProvider` gestisce `reducedMotion`
- Leggi il file per capire: come si chiama la variabile del patrimonio totale, come si chiama la variabile della variazione mensile (positiva/negativa), come è strutturata la card

Task:
1. Leggi `app/dashboard/page.tsx` per identificare:
   - Il valore del patrimonio totale
   - La variabile di variazione mensile (cerca: `monthlyChange`, `change`, `delta`, o simile)
   - La struttura JSX della card Totale Patrimonio
2. Wrappa il numero principale con `<motion.span>`:
   - Se `monthlyChange > 0`: `initial={{ y: 8, color: '#10B981' }}` → `animate={{ y: 0, color: 'currentColor' }}` con `transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}`
   - Se `monthlyChange < 0`: `initial={{ y: -8, color: '#EF4444' }}` → `animate={{ y: 0, color: 'currentColor' }}`
   - Se `monthlyChange === 0` o `undefined`: nessuna animazione (usa `<span>` normale)
3. Usa una costante per i colori: `const POSITIVE_COLOR = '#10B981'` e `const NEGATIVE_COLOR = '#EF4444'`
4. L'animazione deve partire solo al mount — aggiungi `key={userId}` o simile per evitare re-trigger su re-render

Vincoli:
- `color: 'currentColor'` nel target finale — non deve cambiare il colore statico del testo
- Non wrappare l'intera card, solo lo span del numero principale
- Se `prefers-reduced-motion`: non usare l'animazione y, ma puoi mantenere la tinta temporanea (o skipparla del tutto)
- Non modificare le altre card della dashboard (solo Totale Patrimonio)

Al termine dimmi: come verificare il comportamento con patrimonio in aumento (cosa cercare nel DOM), come simulare un calo per testare la reazione negativa, e come verificare che l'animazione non si ritrigger navigando tra pagine e tornando al dashboard.
```
