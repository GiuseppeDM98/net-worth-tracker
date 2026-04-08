# Critique — Assistente AI

**Date**: 2026-04-08
**Score**: 25/40 (Solid foundation, room for polish)
**Anti-patterns**: Pass — no AI slop detected

---

## P1 — High Impact

### 1. Right sidebar cognitive overload
**Issue**: 4 stacked cards (Conversazioni, Contesto numerico, Preferenze, Memoria) with equal visual weight. Context card — the most useful panel during analysis — gets pushed below the fold.
**Affected files**:
- `components/assistant/AssistantPageClient.tsx` (lines 969–1133)
**Fix direction**: Collapse Preferences into a popover/dropdown in the page header. Promote Context Card to first position below a compact thread list. Memory panel: accordion or collapsible.
**Status**: ✅ Done (session 68c)

### 2. Composer toolbar complexity in chat mode
**Issue**: 3 dropdowns on one row (mode + context type + period picker). On mobile wraps awkwardly. The mode→context→period hierarchy is unclear to new users.
**Affected files**:
- `components/assistant/AssistantComposer.tsx` (lines 100–209)
**Fix direction**: Unify mode + period into a single selector. Surface chat context type as a secondary control, not a same-level dropdown. Consider descriptive labels or grouping.

---

## P2 — Medium Impact

### 3. No stop/cancel during streaming
**Issue**: Send button shows spinner but offers no abort. Extended thinking + web search = 15-30s wait with no escape.
**Affected files**:
- `components/assistant/AssistantPageClient.tsx` (lines 492–650, streaming logic)
- `components/assistant/AssistantComposer.tsx` (lines 238–250, send button)
**Fix direction**: Wire `AbortController` to fetch. Swap send button icon to `Square` (stop) during streaming. On abort, keep partial text visible with "Risposta interrotta" state.

### 4. Memory item delete lacks confirmation
**Issue**: Single-item delete is one-click destructive on a `h-6 w-6` hover target. No undo, no confirmation. Auto-extracted items can't be re-learned from past threads.
**Affected files**:
- `components/assistant/AssistantMemoryItemRow.tsx` (lines 133–140)
**Fix direction**: Inline confirmation state (click → "Conferma?") or toast-with-undo pattern. Alternative: require archiving before delete (only deletable from archived tab).

### 5. No mode descriptions
**Issue**: 5 analysis modes have labels but zero explanation of what data each mode uses. High-stakes choice (determines AI's data scope) made with no guidance.
**Affected files**:
- `components/assistant/AssistantComposer.tsx` (lines 101–112, SelectItems)
**Fix direction**: Add short descriptions to each `SelectItem` or an info tooltip. Example: "Analisi mensile — Patrimonio, cashflow e allocazione del mese selezionato."

---

## P3 — Low Impact

### 6. Mobile hero: threads and chips compete
**Issue**: On mobile, 5 recent threads render above prompt chips, pushing the primary CTA below the fold.
**Affected files**:
- `components/assistant/AssistantPageClient.tsx` (lines 819–876)
**Fix direction**: Show prompt chips first on mobile. Collapse recent threads into a secondary "Riprendi" section or accordion.
**Status**: ✅ Done (session 68c)

### 7. `MONTH_NAMES` duplicated in 4 files
**Issue**: Same Italian month names array in `AssistantPageClient.tsx`, `AssistantComposer.tsx`, `AssistantContextCard.tsx`, `AssistantMonthPicker.tsx`.
**Affected files**: All 4 above
**Fix direction**: Extract to `lib/constants/months.ts` or `lib/utils/dateHelpers.ts`.

### 8. Duplicate memory toggle
**Issue**: "Apprendimento automatico" switch in Memory panel and "Memoria assistente" switch in Preferences card control the same `memoryEnabled` preference.
**Affected files**:
- `components/assistant/AssistantPageClient.tsx` (lines 1085–1097, Preferences card)
- `components/assistant/AssistantMemoryPanel.tsx` (lines 159–174)
**Fix direction**: Remove the duplicate from Preferences card (memory panel owns this toggle). Or remove from memory panel and keep only in Preferences.

### 9. `eur()` in ContextCard doesn't use formatter cache
**Issue**: `AssistantContextCard` creates `new Intl.NumberFormat` on every `eur()` call instead of using `cachedFormatCurrencyEUR`.
**Affected files**:
- `components/assistant/AssistantContextCard.tsx` (lines 40–46)
**Fix direction**: Import `cachedFormatCurrencyEUR` from `lib/utils/formatters.ts`.

### 10. Decorative "Assistente AI" badge in header
**Issue**: Badge repeats the page title, consuming header space without adding information.
**Affected files**:
- `components/assistant/AssistantPageClient.tsx` (lines 784–787)
**Fix direction**: Remove or replace with a functional element (e.g., model indicator, token usage).

---

## Suggested Command Sequence

1. `/arrange` — Restructure right sidebar hierarchy (P1 #1) and mobile hero order (P3 #6) ✅ Done
2. `/distill` — Simplify composer toolbar (P1 #2), remove duplicate toggle (P3 #8), remove decorative badge (P3 #10)
3. `/clarify` — Add mode descriptions (P2 #5)
4. `/harden` — Stop button (P2 #3), memory delete confirmation (P2 #4)
5. `/polish` — Final pass: formatter cache (P3 #9), extract MONTH_NAMES (P3 #7)
