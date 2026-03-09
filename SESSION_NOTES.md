# SESSION NOTES — 2026-03-09

## Sessione corrente
Analisi del calcolo "Dividendi %" nella tabella "Rendimento Totale per Asset" (pagina Cedole & Dividendi).

---

## Ricerca: Formula "Dividendi %"

### Formula
```
Dividendi % = (Dividendi netti storici in EUR / Costo di acquisto) × 100
```

- **Denominatore**: `quantity × averageCost` (costo d'acquisto totale in EUR)
- **Numeratore**: somma cumulativa di tutti i `netAmountEur ?? netAmount` dei dividendi pagati

### File chiave
- **Calcolo server-side**: `app/api/dividends/stats/route.ts` (~linee 105–146)
- **Tipo dati**: `types/dividend.ts` → interfaccia `TotalReturnAsset`
- **UI**: `components/dividends/DividendStats.tsx`

### Caratteristiche
| Aspetto | Dettaglio |
|---|---|
| Storico | Cumulativo da sempre (tutti i dividendi pagati) |
| Denominatore | Costo d'acquisto (`qty × averageCost`), NON valore attuale |
| Valuta | Sempre EUR tramite `netAmountEur` (fallback `netAmount`) |
| Tipi inclusi | Dividendi ordinari, cedole bond, finalPremium |
| Solo pagati | `paymentDate <= oggi` |

### Asset esclusi dalla tabella
- `quantity = 0` (venduti/azzerati)
- Senza `averageCost` o con `averageCost ≤ 0`
- Senza nessun dividendo pagato

### Rendimento Totale %
```
Rend. Totale % = Plusvalenza % + Dividendi %
```

---

---

## Implementazioni sessione

### Fix formula Dividendi % (Rendimento Totale per Asset)

**Cosa**: Modificata la formula di `dividendReturnPercentage` in `app/api/dividends/stats/route.ts`.
Prima: `sum(netAmountEur) / (qty_corrente × averageCost_corrente) × 100`
Dopo: `sum( div.netAmountEur / (div.quantity × div.costPerShare) ) × 100` — somma dei contributi storici per ogni dividendo pagato.

**Perché**: Aggiungere nuove azioni dopo l'ultimo dividendo aumentava il costo base corrente e faceva scendere la percentuale artificialmente, anche senza incassare nulla di nuovo. Con la nuova formula ogni dividendo usa il costo base al momento del suo pagamento (snapshot `costPerShare` da YOC v3), quindi gli acquisti successivi non influenzano il rendimento storico già maturato.

**Nota**: Fallback a `asset.averageCost` corrente per record legacy senza `costPerShare` (coerente con YOC v3). Il valore può superare il 100% — è corretto e significa che storicamente hai incassato più del costo d'acquisto in dividendi.

---

### Colonna Costo/Az. in DividendTable

**Cosa**: Aggiunta colonna "Costo/Az." in `components/dividends/DividendTable.tsx` dopo "Netto/Azione". Mostra il campo `costPerShare` salvato sul record dividendo al momento della creazione. `—` per record legacy.

**Perché**: Rendere visibile il costo di carico storico usato per il calcolo, utile per debug e trasparenza. Permette di vedere a colpo d'occhio a quale prezzo medio si possedeva l'asset quando è stato staccato il dividendo.

**Nota**: `colSpan` del footer aggiornato da 7 a 8 per mantenere l'allineamento. Il valore è sempre in EUR (a differenza di lordo/netto che possono essere in valuta originale).
