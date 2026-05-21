# Session Notes — 2026-05-21 (assets-critique)

## Obiettivo sessione
Impeccable critique completa della pagina Patrimonio (assets) — tutti e 3 i tab.
Questa sessione è SOLO critique e documentazione. L'implementazione avverrà in sessioni successive.

## File analizzati
- `app/dashboard/assets/page.tsx`
- `components/assets/AssetManagementTab.tsx`
- `components/assets/AssetCard.tsx`
- `components/assets/AssetPriceHistoryTable.tsx`
- `components/assets/AssetClassHistoryTable.tsx`

## Design Health Score: 18/40
Critica persistita: `.impeccable/critique/2026-05-21T05-58-04Z__app-dashboard-assets-page-tsx.md`

---

## Decisioni prese (2026-05-21)

1. **Mobile banner Anno Corrente / Storico** → da sostituire con vera mobile summary view. La tabella scrollabile resta per chi la vuole, ma sopra va aggiunta una vista compatta degli ultimi 3 mesi per asset (senza scroll orizzontale forzato). Il banner attuale va rimosso.

2. **Sorting tabella desktop** → da aggiungere in sessione dedicata. Sort su Valore Totale (desc default), G/P%, Peso%, Nome, Classe.

3. **Tutto il resto** → implementare in sessioni successive, in ordine P1 → P2 → P3.

---

## Finding Inventory Completo

### P1 — Alta priorità

#### 1. Token violations sistemiche — pagina theme-unaware
**Dove:** `AssetManagementTab.tsx` e `AssetCard.tsx` (entrambi i componenti)
**Problema:** ~30+ istanze di classi Tailwind hardcoded che bypassano il sistema CSS variables:
- `text-gray-900 dark:text-gray-100` → deve diventare `text-foreground`
- `text-gray-500 dark:text-gray-400` → `text-muted-foreground`
- `text-gray-600 dark:text-gray-400` → `text-muted-foreground`
- `bg-gray-50 dark:bg-gray-800` → `bg-muted/40` o `bg-accent/30`
- `bg-gray-100 dark:bg-gray-700` → `bg-muted`
- `text-purple-600` su TER (flaggato in AGENTS.md come `ai-color-palette`) → `text-muted-foreground`
- `text-blue-600` su Peso % e Calculator icon → `text-foreground` o `text-muted-foreground`
- `dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600` sui bottoni in AssetManagementTab → rimuovere, i variant classes gestiscono dark mode
- `bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600` sul badge "Azzerato" in AssetManagementTab → `bg-muted text-muted-foreground border-border`

**Sweep esteso necessario anche in:**
- `AssetClassHistoryTable.tsx`: `PercentCell` usa `text-gray-400` e `text-gray-600 dark:text-gray-400` → `text-muted-foreground`
- `AssetClassHistoryTable.tsx`: `colorClasses.neutral` usa `text-gray-700 dark:text-gray-300` → `text-foreground`
- `AssetPriceHistoryTable.tsx`: `colorClasses.neutral` usa `text-gray-700 dark:text-gray-300` → `text-foreground`
- `AssetPriceHistoryTable.tsx`: sticky columns usano `bg-white dark:bg-gray-900` (TableHeader + TableCell) → `bg-card`
- `AssetPriceHistoryTable.tsx`: `text-gray-500 dark:text-gray-400` nel secondo sticky cell (asset name) → `text-muted-foreground`
- `AssetPriceHistoryTable.tsx`: `text-gray-400` nel dash placeholder → `text-muted-foreground`

**Impatto:** Qualsiasi utente su tema custom (Solar Dusk, Cyberpunk, Elegant Luxury, Midnight Bloom, Retro Arcade) vede colori rotti. Fix blocca la regressione visiva su tutti i temi.

---

#### 2. Side-stripe borders (vietati) sulle colonne summary
**Dove:** `AssetPriceHistoryTable.tsx` — colonne header Mese Prec. %, YTD %, From Start %
**Problema:**
- `border-l-2 border-amber-300 dark:border-amber-800` + `bg-amber-50 dark:bg-amber-950/20` su "Mese Prec. %"
- `border-l-2 border-blue-300 dark:border-blue-800` + `bg-blue-50 dark:bg-blue-950/20` su "YTD %"
- `border-l-2 border-purple-300 dark:border-purple-800` + `bg-purple-50 dark:bg-purple-950/20` su "From Start %"

Design law esplicita: "Side-stripe borders: `border-left` greater than 1px as a colored accent. Never intentional. Rewrite with full borders, background tints, leading icons, or nothing."

**Fix:** Rimuovere `border-l-2 border-*` colorati da tutti e 3 gli header. Sostituire con:
- Background tint neutro: `bg-muted/40` (nessun bordo aggiuntivo) — opzione più pulita
- Oppure separatore neutro: aggiungere `border-r border-border` alla colonna prima delle summary columns per marcare il confine, senza colorazione per colonna individuale
- I background colorati (`bg-amber-50`, `bg-blue-50`, `bg-purple-50`) vanno rimossi — usare `bg-muted/20` se si vuole ancora un tint neutro che si adatti ai temi

---

#### 3. `confirm()` per delete — rompe il pattern 2-click
**Dove:** `AssetManagementTab.tsx:156` (table row) e `AssetCard.tsx:309` (mobile card)
**Problema:** `window.confirm()` per confermare l'eliminazione di un asset. Il pattern stabilito nell'app (AGENTS.md "Inline destructive confirmation") è 2-click inline con 3s auto-disarm.

**Fix per AssetManagementTab.tsx (table row):**
```tsx
// Stato per tabella desktop
const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
const pendingDeleteTimerRef = useRef<NodeJS.Timeout | null>(null);

const handleDeleteClick = (assetId: string) => {
  if (pendingDeleteId === assetId) {
    // Second click — execute delete
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setPendingDeleteId(undefined);
    handleDelete(assetId);
  } else {
    // First click — arm
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setPendingDeleteId(assetId);
    pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(undefined), 3000);
  }
};
// Nel JSX: botone Trash2 diventa "Conferma" (variant destructive) quando pendingDeleteId === asset.id
```

**Fix per AssetCard.tsx:**
Stessa logica ma con `useState` locale alla card:
```tsx
const [isPendingDelete, setIsPendingDelete] = useState(false);
const pendingTimerRef = useRef<NodeJS.Timeout | null>(null);
```

Aggiungere `type="button"` esplicito su tutti i bottoni di questo pattern (AGENTS.md).

---

#### 4. Nessun skeleton loading state
**Dove:** `assets/page.tsx` e `AssetManagementTab.tsx` — entrambi usano `<div className="text-gray-500 dark:text-gray-400">Caricamento...</div>`

**Pattern richiesto (da AGENTS.md "Loading skeleton over spinner"):** Skeleton strutturale isomorfico al layout post-load con `animate-pulse bg-muted rounded`.

**Fix per `assets/page.tsx` (loading di alto livello):**
```tsx
if (loading) {
  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        <div className="h-8 w-40 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-56 rounded bg-muted animate-pulse" />
      </div>
      {/* Tab skeleton */}
      <div className="h-10 w-80 rounded-xl bg-muted animate-pulse" />
      {/* Summary card skeleton */}
      <div className="h-24 rounded-xl bg-muted animate-pulse" />
      {/* Table/cards area skeleton */}
      <div className="h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}
```

**Fix per `AssetManagementTab.tsx` (loading dei dati):**
```tsx
if (loading) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-32 rounded-md bg-muted animate-pulse" />
        </div>
      </div>
      {/* Summary card */}
      <div className="h-24 rounded-xl bg-muted animate-pulse" />
      {/* Mobile cards skeleton (< desktop) */}
      <div className="desktop:hidden grid grid-cols-1 gap-4 landscape:grid-cols-2">
        {[1,2,3].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
      </div>
      {/* Desktop table skeleton */}
      <div className="hidden desktop:block h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}
```

---

#### 5. Nested card in AssetCard — `bg-gray-50 rounded-lg` dentro `<Card>`
**Dove:** `AssetCard.tsx` — blocco "Valore Totale + G/P" (linee ~137-199)
**Problema:** Il div con `bg-gray-50 dark:bg-gray-800 rounded-lg p-3` dentro `<Card>` è un nested card pattern. Design law: "Nested cards are always wrong."

**Fix:**
Rimuovere il div wrapper con background/rounded. Layout diretto:
```tsx
{/* Valore Totale e G/P — layout semplice con separatore */}
<div className="flex justify-between items-center mb-3">
  <div>
    <p className="text-xs text-muted-foreground">Valore Totale</p>
    <p className="text-lg font-bold text-foreground font-mono">
      {/* ... contenuto invariato ... */}
    </p>
  </div>
  {hasGainLoss && (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">G/P</p>
      {/* ... contenuto invariato ... */}
    </div>
  )}
</div>
{/* Peso % separato da border-t */}
<div className="pt-2 border-t border-border mb-3">
  <p className="text-xs text-muted-foreground">Peso in %</p>
  <p className="text-sm font-semibold text-foreground font-mono">
    {totalValue > 0 ? `${((value / totalValue) * 100).toFixed(2)}%` : '-'}
  </p>
</div>
```

**Bonus:** Rimuovendo il panel grigio, `text-blue-600` su Peso % sparisce naturalmente.

---

### P2 — Importanti ma non bloccanti

#### 6. `border-2 border-primary` sul Totale Patrimonio card
**Dove:** `AssetManagementTab.tsx` — `<Card className="border-2 border-primary">`
**Problema:** Pattern unico in app. Su temi custom (es. Cyberpunk, Solar Dusk) `--primary` è un colore acceso che rende il bordo molto aggressivo. La posizione già rende la card primaria.
**Fix:** Rimuovere `border-2 border-primary`. Lasciare `<Card>` con bordo default. La gerarchia viene dall'aumento font (`text-2xl font-bold`).

---

#### 7. Header ridondante — eyebrow = h1 = "Patrimonio"
**Dove:** `assets/page.tsx` linee 158-159
**Problema:**
```tsx
<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Patrimonio</p>
<h1 className="text-2xl sm:text-3xl font-bold text-foreground">Patrimonio</h1>
```
L'eyebrow dovrebbe fornire contesto di navigazione, non ripetere l'h1.
**Fix (opzione A):** Rimuovere l'eyebrow — la sidebar già mostra il contesto.
**Fix (opzione B):** Eyebrow → "Gestione" (il contesto della sezione), h1 rimane "Patrimonio".

---

#### 8. No sorting sulla tabella a 12 colonne
**Dove:** `AssetManagementTab.tsx` — `<Table>` desktop
**Problema:** 12 colonne non ordinabili. Il target primario (investitore metodico) ha bisogno di ordinare per Valore Totale, G/P%, Peso% per trovare rapidamente best/worst performers.
**Decisione sessione:** Implementare in sessione dedicata.
**Specifiche per implementazione:**
- `useState<{ column: 'value' | 'gainPct' | 'weight' | 'name' | 'class'; dir: 'asc' | 'desc' } | null>(null)` in AssetManagementTab
- Default: `null` (nessun sort, ordine naturale Firestore)
- TableHead clickable con `cursor-pointer` + `ArrowUpDown` (neutro) / `ChevronUp`/`ChevronDown` (attivo)
- Priority columns: Valore Totale (desc default on first click), G/P% (desc), Peso % (desc), Nome (asc), Classe (asc)
- `useMemo` per sorted assets basato su sort state

---

### P3 — Cosmetico / UX migliorativa

#### 9. Colonna "Aggiornato" — rumore per riga
**Dove:** `AssetManagementTab.tsx` — `<TableCell>` con `format(lastUpdate, 'dd/MM/yyyy HH:mm')`
**Fix:** Rimuovere la colonna dalla tabella. Aggiungere timestamp di freshness nel header accanto al bottone "Aggiorna Prezzi": `text-xs text-muted-foreground` — "Prezzi: {formato compatto ultimo update}".
**Side effect positivo:** La tabella scende da 12 a 11 colonne.

---

#### 10. Mobile banner "desktop suggerito" → mobile summary view
**Dove:** `assets/page.tsx` — banner nelle tab Anno Corrente e Storico
**Decisione sessione:** Sostituire con vera mobile summary view.

**Specifiche per implementazione:**
- Il banner attuale con `Monitor` icon va rimosso
- Sopra alla tabella (solo su mobile, `desktop:hidden`) aggiungere una sezione compatta:
  - Mostra gli ultimi 3 mesi disponibili come colonne
  - Una riga per asset (ticker + nome tronco + 3 valori mensili)
  - Color coding verde/rosso per MoM (stesso sistema della tabella)
  - "Mostra tabella completa" button che rivela la tabella scrollabile (Collapsible con default chiuso su mobile)
- Su desktop: niente cambia, la tabella resta sempre visibile

**Nota implementativa:** Questo riutilizza `tableData` già calcolato (`transformPriceHistoryData`), prendendo solo gli ultimi 3 `monthColumns`. Non richiede nuova logica di dati.

---

#### 11. "From Start %" in inglese in interfaccia italiana
**Dove:** `AssetPriceHistoryTable.tsx` — TableHead "From Start %"
**Fix:** → "Da Inizio %"

---

#### 12. `formatAssetName` duplicato
**Dove:** Definito identicamente in `AssetManagementTab.tsx` e `AssetCard.tsx`
**Fix:** Estrarre in `lib/utils/assetUtils.ts` → `export function formatAssetClassName(name: string): string`

---

#### 13. `hasCostBasisTracking` vs `hasGainLoss` — logica inconsistente
**Dove:** `AssetManagementTab.tsx:196` controlla `averageCost > 0 && taxRate >= 0`; `AssetCard.tsx:89` controlla solo `averageCost > 0`
**Fix:** Allineare entrambi a: `!!(asset.averageCost && asset.averageCost > 0)` — il taxRate non dovrebbe essere prerequisito per mostrare il G/P (un asset può avere PMC senza aliquota impostata).

---

#### 14. AssetCard "Mostra dettagli" button — affordance pesante
**Dove:** `AssetCard.tsx` — `<Button variant="ghost" size="default" onClick={() => setShowDetails(!showDetails)} className="w-full mb-3">`
**Fix:** Sostituire con chevron nel `CardHeader`. Rimuovere il bottone full-width, aggiungere un `ChevronDown className={...${showDetails ? 'rotate-180' : ''}}` in alto a destra nell'header della card (accanto al badge asset class). Pattern da AGENTS.md per chevron rotation con useState.

---

## Raccomandazioni Impeccable Comandi (prossime sessioni)

```
Sessione 2A — Token sweep + borders:
/impeccable polish — AssetManagementTab.tsx, AssetCard.tsx, AssetClassHistoryTable.tsx, AssetPriceHistoryTable.tsx

Sessione 2B — UX patterns:
/impeccable harden — confirm() → 2-click inline, skeleton loading

Sessione 2C — Card refactor:
/impeccable distill — AssetCard nested card removal, "Mostra dettagli" → chevron

Sessione 2D — Visual hierarchy:
/impeccable quieter — border-2 border-primary removal, header eyebrow fix, "Aggiornato" column refactor

Sessione 3 — Mobile:
/impeccable adapt — Mobile summary view per Anno Corrente / Storico

Sessione 4 — Sorting:
/impeccable shape — Column sorting design + implementation

Finale:
/impeccable polish — Quality pass finale
```

---

## Note per sessioni future

- Tutti i file coinvolti nel token sweep sono stati identificati con precisione (vedere sezione P1.1)
- La mobile summary view riusa `tableData.monthColumns.slice(-3)` — nessuna nuova API necessaria
- Il 2-click delete va implementato in entrambi i componenti (Tab + Card) nella stessa sessione per coerenza
- Dopo il token sweep, ri-eseguire `npx tsc --noEmit` per verificare che non ci siano type errors introdotti dalla rimozione delle classi dark-mode hardcoded
- Score obiettivo dopo tutti i P1: ~28/40. Dopo P2+P3: ~34/40.
