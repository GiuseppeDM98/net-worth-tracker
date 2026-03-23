# DELIGHT-06 — Savings Rate Badge del Mese

## Categoria
Delight

## Priorità
Bassa

## Descrizione
Se il savings rate del mese corrente supera una soglia configurabile (es. 30%), mostrare un piccolo badge celebrativo "Ottimo risparmio questo mese!" con scale-in animation per 2-3 secondi, poi fade. Appare una sola volta per sessione (non persiste in localStorage, ma non si ripete nello stesso browser tab).

## Stato Attuale
- Dati di cashflow/budget già disponibili nell'app
- Savings rate = (entrate - uscite) / entrate × 100
- Non esistono badge o indicatori contestuali di "buona performance" nella UI

## Soluzione Proposta
1. Calcolare savings rate nel Cashflow Tab o Dashboard dall'ultimo mese completo disponibile
2. Se savings rate >= 30%: mostrare un badge toast-like (diverso dal Sonner toast — posizionato in modo custom)
3. Il badge appare una sola volta per sessione: flag in-memory (React state/ref, non localStorage)
4. Animazione: scala da 0 a 1 (spring) + fade-in, visibile 3s, poi slide-out verso il basso e fade

## Design del Badge
```
┌─────────────────────────────────┐
│  ✦  Ottimo risparmio a Marzo!   │
│     Hai risparmiato il 35%      │
└─────────────────────────────────┘
```
- Position: `fixed bottom-4 left-4` (angolo in basso a sinistra, diverso dai toast Sonner in basso a destra)
- Background: `bg-emerald-600 text-white` o `bg-emerald-50 border border-emerald-200 text-emerald-800`
- Piccolo, discreto (max-width 280px)

## File Coinvolti
- `app/dashboard/page.tsx` — o `components/cashflow/CurrentYearTab.tsx` a seconda di dove i dati sono più accessibili
- Nessuna nuova dipendenza (Framer Motion già disponibile)

## Vincoli
- Una sola volta per sessione (in-memory flag, non localStorage)
- Non mostrare il badge se i dati non sono ancora caricati
- Non mostrare il badge per il mese corrente se siamo < 5 del mese (dati parziali)
- Rispettare `prefers-reduced-motion`: se ridotto, skip l'animazione e mostrarlo staticamente (o non mostrarlo affatto)
- Soglia savings rate configurabile come costante (non hardcoded 30% sparso nel codice)

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, TypeScript, Tailwind v4).

Obiettivo: aggiungere un badge celebrativo temporaneo che appare una volta per sessione quando il savings rate del mese precedente supera il 30%.

Contesto:
- Il savings rate si calcola dai dati di cashflow: `(totalIncome - totalExpenses) / totalIncome * 100`
- Questi dati devono essere disponibili da qualche parte nell'app — leggi `app/dashboard/page.tsx` e `components/cashflow/CurrentYearTab.tsx` per capire dove
- La soglia è `SAVINGS_RATE_BADGE_THRESHOLD = 30` (costante definita nel file)
- Il badge deve apparire una sola volta per sessione (usa `useRef` per il flag "già mostrato")

Task:
1. Leggi `app/dashboard/page.tsx` e `components/cashflow/CurrentYearTab.tsx` per identificare dove sono disponibili i dati di entrate/uscite mensili
2. Identifica il mese di riferimento: usa il mese precedente al corrente (dati completi), non il mese in corso
3. Crea un componente `SavingsRateBadge` (nel file che ha i dati o in `components/ui/SavingsRateBadge.tsx`):
   - Posizione: `fixed bottom-4 left-4 z-50`
   - Design: `bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 shadow-lg max-w-[280px]`
   - Contenuto: "✦ Ottimo risparmio a {nomeMese}!" in bold + "Hai risparmiato il {X}% delle entrate" in muted
   - Animazione Framer Motion: `initial={{ opacity: 0, y: 20, scale: 0.95 }}` → `animate={{ opacity: 1, y: 0, scale: 1 }}` con spring `{ stiffness: 300, damping: 20 }`
   - Auto-dismiss: `useEffect` con `setTimeout(3000)` → `exit={{ opacity: 0, y: 10 }}` con `AnimatePresence`
4. Usa un `useRef` per il flag "già mostrato" nella sessione corrente
5. Non mostrare se: dati non caricati, mese in corso (giorno < 5), savings rate < soglia, già mostrato, `prefers-reduced-motion`

Vincoli:
- La soglia deve essere una costante `const SAVINGS_RATE_BADGE_THRESHOLD = 30` — non hardcodata inline
- Il badge deve scomparire automaticamente dopo 3 secondi, non essere dismissibile manualmente
- Posizionamento `bottom-4 left-4` — diverso dai toast Sonner (che sono `bottom-4 right-4` o centro)

Al termine dimmi: dove nel codice sono stati trovati i dati di cashflow mensile, come forzare la visualizzazione del badge durante i test (come abbassare temporaneamente la soglia), come verificare che si mostri solo una volta per sessione (ricaricando la pagina non deve riapparire), e come testare il comportamento a inizio mese (giorno < 5).
```
