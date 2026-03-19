# Session 07 — Dialog UX Polish

## Obiettivo
Migliorare l'usabilità dei dialog su schermi piccoli e durante lo scrolling: sticky header/footer per form lunghi, overflow mancante su dialogs con liste.

## Scope
- `components/assets/AssetDialog.tsx`
- `components/expenses/ExpenseDialog.tsx`
- `components/expenses/CategoryDeleteConfirmDialog.tsx`

## Fix da applicare

### 1. AssetDialog.tsx — Sticky footer con pulsante submit

**Problema**: Il dialog ha 1806 righe e `max-h-[90vh] overflow-y-auto`. Il pulsante "Salva" è in fondo al form — su schermi corti (iPhone SE landscape, ~375px viewport height) richiede uno scroll significativo per raggiungerlo.

**Approccio consigliato**: Ristrutturare il `DialogContent` per separare la sezione scrollabile dal footer fisso:
```tsx
<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
  {/* Header: non scrolla */}
  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
    <DialogTitle>...</DialogTitle>
  </DialogHeader>

  {/* Body: scrolla */}
  <div className="flex-1 overflow-y-auto px-6 py-4">
    {/* tutto il form */}
  </div>

  {/* Footer: non scrolla */}
  <div className="px-6 pb-6 pt-4 border-t shrink-0 flex justify-end gap-3">
    <Button variant="outline" onClick={onClose}>Annulla</Button>
    <Button onClick={handleSubmit}>Salva</Button>
  </div>
</DialogContent>
```

> **Attenzione**: AssetDialog è 1806 righe — leggere l'intero file prima di modificare. Verificare che la struttura attuale non abbia già un DialogFooter. Se sì, è solo da spostare fuori dall'area scrollabile.
>
> Il rischio principale è rompere il layout del form esistente — testare visivamente dopo.

### 2. ExpenseDialog.tsx — Sticky header durante scroll

**Problema**: Il dialog header non è sticky — scrollando un form lungo il titolo "Aggiungi/Modifica Transazione" sparisce e l'utente perde il contesto.

Applicare la stessa struttura `flex flex-col` del punto 1: DialogHeader fuori dall'area scrollabile.

> **Nota**: ExpenseDialog è meno critico di AssetDialog (form più corto) — questa fix è "nice to have" se il dialog ha già `max-h / overflow-y-auto`.

### 3. CategoryDeleteConfirmDialog.tsx — Aggiungere overflow

**Problema**: Il dialog non ha `max-h + overflow-y-auto`. Se la lista delle categorie da riassegnare è molto lunga, il dialog può eccedere l'altezza dello schermo.

**Fix**:
1. Aprire il file e verificare la struttura attuale
2. Aggiungere `max-h-[80vh] overflow-y-auto` alla sezione che contiene la lista (non all'intero DialogContent se c'è un DialogFooter con bottoni che deve restare visibile)

## Priorità
1. **CategoryDeleteConfirmDialog** — fix semplice, basso rischio
2. **ExpenseDialog** — fix medio, dialog già abbastanza semplice
3. **AssetDialog** — fix più impegnativa, testare accuratamente

## Verifica
1. Aprire AssetDialog su iPhone SE landscape (375×667px) — il pulsante Salva deve essere visibile senza scroll eccessivo
2. Aprire ExpenseDialog e scrollare — il titolo deve restare visibile
3. Simulare molte categorie in CategoryDeleteConfirmDialog — deve scrollare senza overflow fuori viewport
4. `npm test` deve passare

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 07 — Dialog UX Polish
Leggi il file docs/sessions/session-07-dialog-ux.md per le specifiche complete.

File target (in ordine di priorità):
1. components/expenses/CategoryDeleteConfirmDialog.tsx — aggiungi max-h + overflow-y-auto sulla sezione lista se manca
2. components/expenses/ExpenseDialog.tsx — separa header e footer dallo scroll del body (flex flex-col su DialogContent, header e footer shrink-0, body overflow-y-auto)
3. components/assets/AssetDialog.tsx — stessa struttura, ma il file è 1806 righe: leggilo tutto prima di modificare, e applica la stessa separazione header/body scrollabile/footer fisso

Pattern da applicare:
  DialogContent: className="... flex flex-col p-0"
  DialogHeader: className="px-6 pt-6 pb-4 border-b shrink-0"
  Body scrollabile: <div className="flex-1 overflow-y-auto px-6 py-4">
  DialogFooter/bottoni: className="px-6 pb-6 pt-4 border-t shrink-0"

Dopo le modifiche aggiorna SESSION_NOTES.md con le righe della tabella Session 7.
Alla fine esegui npm test.
```
