# Session 05 — Bundle Optimization

## Obiettivo
Ridurre il bundle JavaScript caricato sulla pagina Performance convertendo `AIAnalysisDialog` in un import dinamico (lazy). Attualmente `react-markdown` e `remark-gfm` vengono caricati su ogni visita alla pagina Performance, anche senza mai aprire il dialog AI.

## Scope
- `app/dashboard/performance/page.tsx`

## Fix da applicare

### 1. Dynamic import di AIAnalysisDialog

**Problema**: La pagina Performance importa `AIAnalysisDialog` staticamente:
```tsx
import { AIAnalysisDialog } from '@/components/performance/AIAnalysisDialog';
```

`AIAnalysisDialog` a sua volta importa `react-markdown` e `remark-gfm` — librerie pesanti (~60KB gzipped) caricate anche se il dialog non viene mai aperto.

**Fix**: Convertire in `next/dynamic`:
```tsx
import dynamic from 'next/dynamic';

const AIAnalysisDialog = dynamic(
  () => import('@/components/performance/AIAnalysisDialog').then(m => ({ default: m.AIAnalysisDialog })),
  { ssr: false }
);
```

> **Nota sul named export**: `AIAnalysisDialog` è probabilmente un named export (non default). `next/dynamic` richiede un default export, quindi usa `.then(m => ({ default: m.AIAnalysisDialog }))`.

> **`ssr: false`**: Il dialog usa hooks client-side (useState, streaming SSE) — non renderizzabile lato server.

> **Nessun loading state necessario**: Il dialog si apre solo al click di un bottone — il caricamento avviene in background mentre l'utente non ha ancora cliccato, quindi non serve un skeleton loader per il dialog stesso.

### 2. Verificare che il tipo props sia preservato

Dopo la conversione, TypeScript potrebbe non inferire le props automaticamente da `dynamic()`. Se compaiono errori di tipo, aggiungere un cast esplicito:

```tsx
import type { AIAnalysisDialogProps } from '@/components/performance/AIAnalysisDialog';

const AIAnalysisDialog = dynamic<AIAnalysisDialogProps>(
  () => import('@/components/performance/AIAnalysisDialog').then(m => ({ default: m.AIAnalysisDialog })),
  { ssr: false }
);
```

> Verificare il nome del tipo nell'file sorgente — potrebbe essere `AIAnalysisDialogProps` o essere inline.

## Impatto atteso
- Riduzione bundle iniziale pagina Performance: ~60-80KB gzipped
- Il dialog viene caricato solo al primo click su "Analisi AI"
- Nessuna regressione funzionale

## Verifica
1. `npx next build` — verificare output bundle size per la route `/dashboard/performance`
2. Aprire pagina Performance in Network tab (Chrome DevTools) — non deve caricare chunk `react-markdown` all'apertura
3. Cliccare "Analisi AI" — il chunk deve caricarsi in quel momento
4. Il dialog deve funzionare identicamente a prima
5. `npm test` deve passare

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 05 — Bundle Optimization
Leggi il file docs/sessions/session-05-bundle-optimization.md per le specifiche complete.

File target: app/dashboard/performance/page.tsx

Fix: Converti l'import statico di AIAnalysisDialog in un import dinamico con next/dynamic e ssr: false.

AIAnalysisDialog è probabilmente un named export — usa la sintassi:
  const AIAnalysisDialog = dynamic(
    () => import('@/components/performance/AIAnalysisDialog').then(m => ({ default: m.AIAnalysisDialog })),
    { ssr: false }
  );

Se TypeScript si lamenta dei tipi delle props, aggiungi il type parameter a dynamic<Props>() e importa il tipo dal file sorgente.

Rimuovi il vecchio import statico di AIAnalysisDialog.

Verifica che il dialog funzioni ancora aprendo la pagina — il component viene caricato lazy solo al primo utilizzo.

Dopo le modifiche aggiorna SESSION_NOTES.md con le righe della tabella Session 5.
Esegui npx next build per verificare che non ci siano errori TypeScript e controllare l'output del bundle.
Alla fine esegui npm test e dimmi che test devo fare per ciò che hai implementato in questa sessione.
```
