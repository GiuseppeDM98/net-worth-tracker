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

## Attività in corso
- Nessuna implementazione pianificata — sessione di analisi/documentazione.
