# ANIMATE-01 — Page Transitions

## Categoria
Animate

## Priorità
Alta

## Descrizione
Ogni navigazione tra le pagine del dashboard (sidebar: Overview, History, Performance, Cashflow, Dividends, Allocation, Hall of Fame, FIRE, Settings) avviene in modo istantaneo — la pagina appare di scatto senza alcuna transizione. L'obiettivo è aggiungere una transizione leggera di fade/slide tra le route, coerente con il motion language già usato nell'app (`pageVariants` in `motionVariants.ts`).

## Stato Attuale
- `lib/utils/motionVariants.ts` ha già `pageVariants` con fade-in (0.35s, ease-out-quart)
- Le singole pagine usano `pageVariants` internamente, ma il layout non gestisce la transizione di uscita
- `components/providers/MotionProvider.tsx` wrappa già tutto con `MotionConfig reducedMotion="user"`
- Navigazione gestita da Next.js App Router

## Soluzione Proposta
1. Nel file `app/dashboard/layout.tsx`, usare `usePathname()` come `key` su un `<motion.div>` che wrappa `{children}`
2. Usare `<AnimatePresence mode="wait">` per gestire enter/exit
3. Variante di uscita: fade-out rapido (0.15s) + leggero slide-up, per non appesantire la navigazione
4. La variante di entrata è già `pageVariants` — non modificarla

## File Coinvolti
- `app/dashboard/layout.tsx` — modifica principale
- `lib/utils/motionVariants.ts` — eventuale aggiunta variante exit
- `components/providers/MotionProvider.tsx` — nessuna modifica attesa

## Vincoli
- Exit animation deve essere < 200ms per non sembrare lenta
- Non aggiungere transizioni sui nested layout (es. tab interni alle pagine)
- Rispettare `reducedMotion` già gestito da MotionProvider

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, Tailwind v4).

Obiettivo: aggiungere transizioni tra le pagine del dashboard quando l'utente naviga via sidebar.

Contesto tecnico:
- `lib/utils/motionVariants.ts` contiene già `pageVariants` (fade-in + slide-up, 0.35s, ease-out-quart) e tutti i file che usano Framer Motion importano da lì
- `components/providers/MotionProvider.tsx` wrappa l'app con `<MotionConfig reducedMotion="user">` — le animazioni sono già accessibili
- Il layout principale è `app/dashboard/layout.tsx`
- Le pagine attuali usano `pageVariants` individualmente con `<motion.div variants={pageVariants} initial="hidden" animate="visible">` — questo pattern va mantenuto nelle singole pagine

Task:
1. Leggi `app/dashboard/layout.tsx`, `lib/utils/motionVariants.ts`, `components/providers/MotionProvider.tsx` e una pagina di esempio (es. `app/dashboard/history/page.tsx`) per capire il pattern attuale
2. In `app/dashboard/layout.tsx`, aggiungi `<AnimatePresence mode="wait">` con `usePathname()` come key su un wrapper `<motion.div>` attorno a `{children}`
3. La variante di entrata usa `pageVariants` (già definita). Aggiungi una variante di uscita leggera in `motionVariants.ts`: fade-out (opacity 0) + translateY(-8px), durata 0.15s, ease-in (l'uscita deve essere più rapida dell'entrata)
4. Assicurati che il `<motion.div>` nel layout non interferisca con i `<motion.div>` già presenti nelle singole pagine (mode="wait" gestisce questo)
5. Testa navigando tra almeno 3 pagine diverse per verificare fluidità

Vincoli:
- Exit duration < 200ms
- Non modificare le animazioni interne alle singole pagine
- Il layout deve continuare a funzionare correttamente con sticky sidebar e scroll

Al termine dimmi esattamente quali test manuali eseguire per verificare che la feature funzioni correttamente e quali edge case controllare.
```
