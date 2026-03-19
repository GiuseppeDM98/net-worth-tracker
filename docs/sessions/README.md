# Polish + Optimize Sessions — Indice

Audit completo avviato il 2026-03-19. Ogni file contiene la specifica tecnica e un **prompt pronto** da incollare in una nuova sessione Claude.

## Come usare

1. Apri il file della sessione che vuoi eseguire
2. Copia il blocco `## Prompt per Claude` in fondo al file
3. Incollalo come primo messaggio in una nuova sessione Claude Code
4. Claude leggerà AGENTS.md, CLAUDE.md e COMMENTS.md automaticamente e procederà

---

## Sessioni

| # | File | Area | Priorità | File modificati |
|---|------|------|----------|----------------|
| 01 | [session-01-dark-mode-sweep.md](session-01-dark-mode-sweep.md) | Dark mode: colori gray senza `dark:` | 🔴 Critico | 11 file |
| 02 | [session-02-dashboard-polish.md](session-02-dashboard-polish.md) | Dashboard: icona TrendingDown + console.log | 🟡 Medio | 1 file |
| 03 | [session-03-performance-polish.md](session-03-performance-polish.md) | Performance: breakpoint `md:`→`desktop:` + reduced-motion | 🟡 Medio | 3 file |
| 04 | [session-04-filter-memo-optimization.md](session-04-filter-memo-optimization.md) | Ottimizzazione: `useEffect`→`useMemo` filtri | 🔴 Critico | 3 file |
| 05 | [session-05-bundle-optimization.md](session-05-bundle-optimization.md) | Bundle: AIAnalysisDialog dynamic import | 🔴 Critico | 1 file |
| 06 | [session-06-typography-emoji-cleanup.md](session-06-typography-emoji-cleanup.md) | Emoji → Lucide icons nei titoli di sezione | 🟡 Medio | 2 file |
| 07 | [session-07-dialog-ux.md](session-07-dialog-ux.md) | Dialog UX: sticky header/footer + overflow | 🟡 Medio | 3 file |
| 08 | [session-08-loading-states.md](session-08-loading-states.md) | Loading states: `text-gray-500` → `Loader2 animate-spin` | 🟡 Medio | 5 file |

---

## Ordine consigliato di esecuzione

```
01 → 02 → 04 → 05 → 03 → 06 → 08 → 07
```

- Inizia con 01 (dark mode) — il cambio più visibile
- 04 e 05 sono ottimizzazioni indipendenti, eseguibili in parallelo
- 07 (dialog UX) ha il rischio più alto — eseguire per ultimo

## Tracking avanzamento

Aggiornare `SESSION_NOTES.md` (root del progetto) dopo ogni sessione completata.

---

## Riepilogo issues trovati

| Categoria | Issues | Severità |
|-----------|--------|----------|
| Dark mode mancante | ~344 occorrenze in 11 file | 🔴 |
| useMemo mancante (render extra) | 2 componenti | 🔴 |
| Bundle non lazy (AIAnalysisDialog) | 1 import | 🔴 |
| Breakpoint inconsistenti | 2 file | 🟡 |
| Emoji nei titoli | 2 file | 🟡 |
| Loading states senza animazione | 5 file | 🟡 |
| Dialog UX (scroll/overflow) | 3 file | 🟡 |
| console.log in produzione | 1 occorrenza | 🟡 |
