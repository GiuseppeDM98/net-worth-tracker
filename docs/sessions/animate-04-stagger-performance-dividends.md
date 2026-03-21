# ANIMATE-04 — Stagger su Performance e Dividends Pages

## Categoria
Animate

## Priorità
Media

## Descrizione
Le pagine Performance e Dividends usano solo animazioni CSS (`motion-safe:animate-in`, `slide-in-from-bottom`) via `MetricSection`, ma mancano delle animazioni Framer Motion di stagger/cascade già presenti su Dashboard, History e Hall of Fame. Il risultato è che le sezioni di queste pagine appaiono senza la coerenza del motion language globale.

## Stato Attuale
- `app/dashboard/performance/page.tsx` — usa MetricSection con CSS stagger ma nessun `<motion.div>` di page-level
- `app/dashboard/dividends/` (o componente equivalente) — stesso problema
- `components/performance/MetricSection.tsx` — già ha stagger CSS sulle card individuali
- Pattern target: `app/dashboard/history/page.tsx` — usa `pageVariants`, `staggerContainer`, `cardItem` da `motionVariants.ts`

## Soluzione Proposta
1. In `performance/page.tsx`: aggiungere `<motion.div variants={pageVariants}>` come wrapper root, e `<motion.div variants={staggerContainer}>` + `<motion.div variants={cardItem}>` sulle sezioni principali (header, chart cards, metric sections)
2. Stesso pattern sulla pagina dividendi
3. Coerenza: non duplicare lo stagger interno di MetricSection — usare il Framer Motion stagger solo per i blocchi macro (chart card, sezioni intere), non per le singole metric card

## File Coinvolti
- `app/dashboard/performance/page.tsx`
- Pagina/componente principale dividendi (verificare struttura esatta)
- `lib/utils/motionVariants.ts` — nessuna modifica attesa

## Vincoli
- Non wrappare con motion.div elementi che contengono Radix portals (Tooltip, Dialog)
- Lo skeleton screen (`PerformancePageSkeleton`) deve rimanere non animato o con animazione separata
- Verificare che il layout non cambi a causa di `overflow: hidden` implicito nelle motion.div

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, Tailwind v4).

Obiettivo: portare il motion language Framer Motion coerente su performance/page.tsx e sulla pagina dividendi, allineandola al pattern già usato su history/page.tsx.

Contesto:
- `lib/utils/motionVariants.ts` contiene: `pageVariants`, `staggerContainer`, `cardItem`, `listItem`, `slideDown`, `fadeVariants`
- `app/dashboard/history/page.tsx` è il file di riferimento — studia come usa i variants prima di procedere
- `components/performance/MetricSection.tsx` ha già un proprio stagger CSS sulle singole card — non toccarlo
- `components/providers/MotionProvider.tsx` gestisce `reducedMotion="user"` globalmente

Task:
1. Leggi `app/dashboard/history/page.tsx` per capire il pattern esatto di utilizzo
2. Leggi `app/dashboard/performance/page.tsx` per capire la struttura attuale
3. Applica lo stesso pattern: `pageVariants` sul wrapper root, `staggerContainer` sui container di sezioni, `cardItem` sulle chart card e section wrapper principali
4. Trova la pagina/componente principale dei dividendi e applica lo stesso pattern
5. NON aggiungere motion wrapper dentro `<PerformancePageSkeleton>` o `<DividendStatsSkeleton>` — quelli hanno già `animate-pulse` separato

Vincoli:
- Usa sempre `<motion.div>` con `variants` dichiarativi — non usare `animate={{ ... }}` inline
- Non wrappare Radix Dialog/Tooltip trigger con motion.div (interferisce con portals)
- La pagina deve avere lo stesso "feel" della History page al mount

Al termine dimmi su quali pagine navigare per testare, cosa osservare visivamente (sequenza di cascade, timing), e come verificare che la Performance page non mostri flash di contenuto non animato durante il caricamento skeleton.
```
