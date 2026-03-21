# ANIMATE-02 — Recharts Bar/Line Animations

## Categoria
Animate

## Priorità
Media

## Descrizione
Tutti i grafici dell'app (barre, linee, aree) appaiono istantaneamente al caricamento — le barre "crescono" da zero e le linee "si disegnano" da sinistra a destra. Recharts ha animazioni built-in tramite `isAnimationActive`, ma sono disabilitate o non configurate nella maggior parte dei componenti dell'app.

## Stato Attuale
- Recharts versione in uso (verificare package.json)
- Chart principali: `<Bar>`, `<Line>`, `<Area>`, `<Pie>` in History, Performance, Cashflow, Dividends, Allocation pages
- Molti chart hanno `isAnimationActive={false}` esplicito o non lo impostano (default true ma con duration breve)
- I `<Pie>` chart potrebbero già avere animazioni parziali

## Soluzione Proposta
1. Abilitare `isAnimationActive={true}` (o rimuovere il `false` esplicito) su `<Bar>`, `<Line>`, `<Area>`
2. Impostare `animationDuration={600}` su Bar, `animationDuration={800}` su Line/Area
3. Usare `animationEasing="ease-out"` su tutti
4. Per i `<Pie>` chart: `animationBegin={0}` e `animationDuration={600}`
5. Attenzione: non abilitare su chart che si aggiornano in tempo reale (potrebbero rianimarsi ad ogni render)

## File da Cercare
- Tutti i file in `components/` che importano da `recharts`
- `components/history/`, `components/performance/`, `components/cashflow/`, `components/dividends/`, `app/dashboard/allocation/`

## Vincoli
- Non abilitare l'animazione su chart dentro tooltip o miniature
- Verificare che non ci siano re-render frequenti che causerebbero rianimazioni indesiderate
- Su mobile (ridotto frame budget) considerare durations più brevi (400ms)

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Recharts, Tailwind v4).

Obiettivo: abilitare le animazioni built-in di Recharts sui grafici principali dell'app, così che barre, linee e aree "crescano" al caricamento invece di apparire istantaneamente.

Task:
1. Cerca tutti i file che importano da `recharts` nel progetto (usa grep su `components/` e `app/`)
2. Per ogni file trovato, identifica i componenti `<Bar>`, `<Line>`, `<Area>`, `<Pie>` presenti
3. Per ciascuno:
   - Se ha `isAnimationActive={false}`, rimuovilo o imposta a `true`
   - Aggiungi `animationDuration={600}` su `<Bar>` e `<Pie>`
   - Aggiungi `animationDuration={800}` su `<Line>` e `<Area>`
   - Aggiungi `animationEasing="ease-out"` su tutti
4. Non toccare chart che sono dentro tooltip, popover, o componenti di preview/miniatura
5. Per i `<Pie>` aggiungi anche `animationBegin={0}` per evitare delay

Vincoli:
- Non modificare la logica di dati, solo le props di animazione
- Se un chart riceve dati che cambiano frequentemente (es. con filtri real-time), lascia `isAnimationActive={false}` per evitare re-animazioni continue — commenta il motivo inline
- Mantieni coerenza: usa sempre gli stessi valori di duration per lo stesso tipo di chart in tutta l'app

Al termine dimmi esattamente quali pagine visitare e quali interazioni fare per verificare visivamente che le animazioni funzionino, e su quali chart è stato deliberatamente lasciato `isAnimationActive={false}` e perché.
```
