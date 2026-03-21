# DELIGHT-04 — Empty States con Personalità

## Categoria
Delight

## Priorità
Media

## Descrizione
Gli empty state dell'app sono messaggi di testo grigi generici. Aggiungere messaggi specifici al contesto e mini-icone SVG con una leggera animazione "float" — trasforma un momento vuoto in un momento di brand voice.

## Empty States Identificati

| Location | Testo attuale | Proposta |
|----------|---------------|----------|
| `DoublingMilestoneTimeline` | "Nessuna milestone ancora completata. Continua a costruire il tuo patrimonio!" | + Icona seme/pianta con float animation |
| Dividendi — nessun dato nel periodo | Testo generico | "Nessun dividendo incassato in questo periodo." + icona calendario |
| Filtro asset senza risultati | "Nessun risultato trovato" | "Nessun asset corrisponde ai filtri selezionati." + icona filtro |
| Hall of Fame — nessun dato | (verificare) | "Nessun dato disponibile per questo periodo." + icona trofeo |
| Budget — nessuna transazione nel mese | (verificare) | Messaggio specifico per contesto |

## Soluzione Proposta
1. Creare un componente `EmptyState` riutilizzabile in `components/ui/EmptyState.tsx`
2. Props: `icon`, `title`, `description?`, `action?` (button opzionale)
3. Float animation: `@keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }` — 3s infinito, ease-in-out
4. Icons: SVG inline semplici (seedling, calendar, filter, trophy, chart) — no emoji
5. Sostituire gli empty state più importanti con il nuovo componente

## Design
```
┌─────────────────────────┐
│                         │
│    [🌱 icona float]     │
│                         │
│  Titolo dell'empty state│
│  Descrizione opzionale  │
│                         │
│    [Azione opzionale]   │
└─────────────────────────┘
```

## File Coinvolti
- Nuovo: `components/ui/EmptyState.tsx`
- `components/history/DoublingMilestoneTimeline.tsx`
- `components/dividends/DividendTrackingTab.tsx` (o simile)
- Altri file identificati durante l'implementazione

## Vincoli
- Float animation: solo su `motion-safe:` (non per prefers-reduced-motion)
- Icone SVG semplici, monocromatiche, `currentColor` — no colori hardcoded
- Il componente non deve essere troppo alto — empty states devono essere discreti
- Non aggiungere empty states dove già c'è una call-to-action (es. "Aggiungi il tuo primo asset")

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript, Tailwind v4).

Obiettivo: creare un componente EmptyState riutilizzabile con icone animate e sostituire i principali empty state dell'app.

Task:
1. Crea `components/ui/EmptyState.tsx` con:
   - Props: `icon: React.ReactNode`, `title: string`, `description?: string`, `action?: React.ReactNode`, `className?: string`
   - Layout: flex-col centrato, icona in alto con float animation, titolo `text-sm font-medium text-muted-foreground`, descrizione `text-xs text-muted-foreground/70`
   - Float animation: definisci i keyframes inline con `<style>` o in `globals.css`:
     `@keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`
     Applicala con `motion-safe:animate-[float_3s_ease-in-out_infinite]` (Tailwind v4 arbitrary animation)
   - Padding interno: `py-8 px-4`

2. Crea 4 SVG icon components inline (semplici, 24×24, `currentColor`, monocromatici):
   - `SeedlingIcon` — seme/pianta che cresce (per milestone vuote)
   - `CalendarEmptyIcon` — calendario senza eventi (per dividendi vuoti)
   - `FilterEmptyIcon` — filtro con X (per ricerche senza risultati)
   - `TrophyEmptyIcon` — trofeo/medaglia (per Hall of Fame vuota)

3. Cerca nell'app i principali empty state (cerca: "Nessun", "nessun", "No data", "empty") e sostituisci almeno questi 3:
   - `components/history/DoublingMilestoneTimeline.tsx` — usa `SeedlingIcon`
   - Il componente dividendi che mostra "nessun dividendo" — usa `CalendarEmptyIcon`
   - `SearchableCombobox` o simile con `emptyMessage` — usa `FilterEmptyIcon`

4. Non sostituire empty state che hanno già una call-to-action prominente (es. "Aggiungi il tuo primo asset" con button)

Vincoli:
- Le SVG icons devono essere file separati in `components/ui/icons/` o inline nel file EmptyState — scegli la soluzione più pulita
- Usa `currentColor` per tutto il colore: funziona in dark mode automaticamente
- Il componente deve essere minimale — non deve dominare la pagina
- `motion-safe:` prefix per la float animation (accessibilità)

Al termine dimmi: quali empty state sono stati sostituiti (con path del file), come triggerare ogni empty state per testarlo visivamente, come verificare che la float animation si fermi con prefers-reduced-motion, e se ci sono altri empty state nell'app che potrebbero beneficiare dello stesso trattamento.
```
