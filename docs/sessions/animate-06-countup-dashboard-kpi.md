# ANIMATE-06 — useCountUp sui KPI del Dashboard

## Categoria
Animate

## Priorità
Media

## Descrizione
Le card KPI della dashboard principale (Totale Patrimonio, Liquidità, Investimenti, ecc.) mostrano i valori staticamente al caricamento. Il hook `useCountUp` è già implementato e usato nei MetricCard di Performance — applicarlo ai KPI del Dashboard per creare un "contatore" animato coerente tra le due pagine.

## Stato Attuale
- `components/performance/MetricCard.tsx` — contiene il hook `useCountUp` (700ms, ease-out-quart, rispetta reducedMotion)
- `app/dashboard/page.tsx` — le card KPI mostrano valori formattati staticamente (es. `formatCurrency(totalNetWorth)`)
- Il hook NON è estratto in un file separato — è definito inline in MetricCard

## Soluzione Proposta
1. Estrarre `useCountUp` da `MetricCard.tsx` in `lib/utils/useCountUp.ts` (o `hooks/useCountUp.ts`)
2. Importarlo in `app/dashboard/page.tsx`
3. Applicarlo ai valori numerici principali: Totale Patrimonio, Liquidità Totale, Totale Investimenti, Variazione mensile
4. Attenzione alla formattazione: `useCountUp` lavora su numeri raw, la formattazione (€, %) va applicata al valore animato in output

## File Coinvolti
- `components/performance/MetricCard.tsx` — estrarre il hook (ma mantenerlo funzionante lì)
- `app/dashboard/page.tsx` — applicare il hook ai KPI
- Nuovo file: `lib/utils/useCountUp.ts` oppure `hooks/useCountUp.ts`

## Vincoli
- Il hook deve restare funzionante in MetricCard dopo l'estrazione
- Non animare percentuali di variazione negativa con il countup se il numero parte da 0 — sembrerebbe che il patrimonio sia cresciuto e poi sia sceso (confusione visiva)
- Animare solo al primo mount della pagina, non ad ogni re-render
- Duration: 700ms coerente con Performance page

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript, Tailwind v4).

Obiettivo: estrarre il hook useCountUp da MetricCard e applicarlo ai KPI della dashboard principale.

Contesto:
- `components/performance/MetricCard.tsx` contiene un hook `useCountUp` definito inline — leggi quel file per trovarlo
- Il hook anima un numero da 0 al target usando requestAnimationFrame, ease-out-quart, 700ms, rispetta `prefers-reduced-motion`
- `app/dashboard/page.tsx` mostra i KPI principali (Totale Patrimonio, Liquidità, ecc.) — leggi quel file per capire i valori e come sono formattati

Task:
1. Leggi `components/performance/MetricCard.tsx` per trovare e capire `useCountUp`
2. Leggi `app/dashboard/page.tsx` per identificare i KPI da animare
3. Crea `lib/utils/useCountUp.ts` con il hook estratto — esporta sia il hook che i tipi necessari
4. Aggiorna `MetricCard.tsx` per importare da `lib/utils/useCountUp.ts` invece di definirlo inline — verifica che MetricCard continui a funzionare identicamente
5. In `app/dashboard/page.tsx`, importa `useCountUp` e applicalo ai valori numerici delle card KPI principali (Totale Patrimonio almeno, poi gli altri se ha senso)
6. La formattazione (formatCurrency, %) va applicata al valore restituito dal hook, non al valore raw

Vincoli:
- Non animare valori negativi (variazioni negative): passa al hook il valore assoluto e gestisci il segno separatamente, oppure salta l'animazione se il valore è < 0
- L'animazione deve partire solo al primo mount della pagina (non re-triggerare su ogni re-render dei dati)
- Mantieni TypeScript strict — il hook deve avere types corretti

Al termine dimmi: quali KPI sono stati animati e quali no (con motivazione), come verificare che MetricCard in Performance funzioni ancora identicamente, e come testare che l'animazione parta solo al mount e non si ritrigger con i filtri/aggiornamenti dati.
```
