# ANIMATE-05 — Collapsibili Budget con slideDown

## Categoria
Animate

## Priorità
Media

## Descrizione
Le sezioni collassabili del Budget Tab (tipi Fisse/Variabili/Debiti/Entrate) appaiono e spariscono di scatto quando l'utente le apre/chiude. La variante `slideDown` è già definita in `motionVariants.ts` e usata correttamente nella History page per le note — va applicata anche al Budget Tab.

## Stato Attuale
- `components/cashflow/BudgetTab.tsx` — sezioni collassabili con stato toggle ma senza animazione
- `lib/utils/motionVariants.ts` — `slideDown` variant già presente:
  ```ts
  slideDown: {
    hidden: { height: 0, opacity: 0 },
    visible: { height: "auto", opacity: 1, transition: { duration: 0.3 } },
    exit: { height: 0, opacity: 0, transition: { duration: 0.2 } }
  }
  ```
- Pattern di riferimento: uso di `slideDown` in `app/dashboard/history/page.tsx` per il pannello Note

## Soluzione Proposta
1. Trovare in `BudgetTab.tsx` i punti dove le sezioni vengono mostrate/nascoste (condizione `isOpen` o simile)
2. Wrappare il contenuto collassabile con `<AnimatePresence>` + `<motion.div variants={slideDown} initial="hidden" animate="visible" exit="hidden">`
3. Aggiungere `overflow: hidden` al motion.div per evitare contenuto visibile durante l'animazione height
4. Stessa cosa per `MobileAnnualView` se ha sezioni collassabili proprie

## File Coinvolti
- `components/cashflow/BudgetTab.tsx` — modifica principale
- `lib/utils/motionVariants.ts` — nessuna modifica attesa

## Vincoli
- Non animare le righe interne del budget (ogni voce) — solo le sezioni/contenitori
- Il chevron/icona di toggle deve ruotare: `rotate-180` su `open` state (già Tailwind, solo `transition-transform`)
- Verificare su mobile: `MobileAnnualView` ha proprie sezioni collassabili?

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, Tailwind v4).

Obiettivo: aggiungere animazione slideDown alle sezioni collassabili del Budget Tab, usando la variante già presente in motionVariants.ts.

Contesto:
- `lib/utils/motionVariants.ts` ha già `slideDown` variant con height 0→auto + fade (0.3s enter, 0.2s exit)
- `app/dashboard/history/page.tsx` usa `slideDown` per il pannello Note — leggi quel file per capire il pattern esatto con `AnimatePresence`
- `components/cashflow/BudgetTab.tsx` è il file target

Task:
1. Leggi `app/dashboard/history/page.tsx` per vedere come si usa `AnimatePresence` + `slideDown`
2. Leggi `components/cashflow/BudgetTab.tsx` per identificare le sezioni collassabili (cerca: toggle di sezione, `isCollapsed`, `isOpen`, o pattern condizionale simile)
3. Wrappa ogni contenuto collassabile con `<AnimatePresence>` e `<motion.div variants={slideDown} initial="hidden" animate="visible" exit="hidden" style={{ overflow: 'hidden' }}>`
4. Aggiungi `transition-transform duration-200` all'icona chevron/freccia del toggle header, con `rotate-180` quando la sezione è aperta
5. Se `MobileAnnualView` (< 1440px) ha sezioni collassabili proprie, applica lo stesso pattern

Vincoli:
- Non usare `key` sul motion.div dei collapsibili (non sono liste)
- Usare `AnimatePresence` con `mode="sync"` (default) — non "wait"
- Non animare le singole righe della tabella budget, solo i container di sezione
- `overflow: hidden` è fondamentale per height 0→auto, non dimenticarlo

Al termine dimmi quali sezioni testare nel Budget Tab (Fisse, Variabili, Debiti, Entrate), come verificare che l'animazione di chiusura funzioni (exit), e come testare su viewport mobile (< 1440px) per `MobileAnnualView`.
```
