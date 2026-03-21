# DELIGHT-05 — Dashboard KPI: Hover Breakdown Reveal

## Categoria
Delight

## Priorità
Media

## Descrizione
Le card KPI della dashboard (Totale Patrimonio, Liquidità, ecc.) mostrano un singolo numero. Su hover, potrebbe apparire una breakdown rapida (composizione per asset class o per categoria) come layer aggiuntivo animato — trasforma un numero opaco in una vista informativa istantanea, senza dover navigare altrove.

## Stato Attuale
- `app/dashboard/page.tsx` — card KPI con valori aggregati
- I dati di breakdown per asset class sono già calcolati nel dashboard (presenti negli snapshot)
- Nessun hover reveal attuale sulle card

## Soluzione Proposta
1. Sul hover della card "Totale Patrimonio", mostrare una mini breakdown:
   - Azioni / Obbligazioni / Crypto / Immobili / Liquidità / Materie Prime con importi e %
2. Implementare con Tailwind `group/hover` + `<motion.div variants={fadeVariants}>` (già in motionVariants.ts)
3. Il breakdown appare come un layer sovrapposto (absolute) in basso alla card, con `AnimatePresence`
4. Alternativa più semplice: espandere la card verso il basso con `slideDown` — più safe per layout

## Design del Reveal
```
┌──────────────────────────────┐
│  Totale Patrimonio            │
│  €XXX.XXX  (+2.1% mtd)       │
│  ─────────────────────────── │  ← appare su hover
│  Azioni    €XX.XXX  (45%)    │
│  Liquid.   €XX.XXX  (30%)    │
│  Obblig.   €XX.XXX  (15%)    │
│  Altro     €XX.XXX  (10%)    │
└──────────────────────────────┘
```

## File Coinvolti
- `app/dashboard/page.tsx` — modifica principale
- `lib/utils/motionVariants.ts` — usa `fadeVariants` o `slideDown`

## Vincoli
- Il reveal non deve spostare il layout delle altre card (usare position absolute o animare solo dentro la card stessa con overflow hidden)
- Dati breakdown devono già essere disponibili nel componente — non fare nuove chiamate API
- Su mobile: nessun hover reveal (touch device), la card è semplicemente tappabile per navigare
- Non usare tooltip Radix — troppo rigido per un layout custom

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Framer Motion, TypeScript, Tailwind v4).

Obiettivo: aggiungere un reveal di breakdown su hover alla card "Totale Patrimonio" della dashboard, mostrando la composizione per asset class.

Contesto:
- `app/dashboard/page.tsx` — file principale. Leggi questo file per capire:
  1. Come è strutturata la card "Totale Patrimonio"
  2. Quali dati di breakdown per asset class sono già disponibili (cerca `byAssetClass`, `assetClass`, o simili negli snapshot/metrics)
- `lib/utils/motionVariants.ts` — usa `fadeVariants` per il reveal (fade 0.25s)
- `lib/utils/formatters.ts` — usa i formatter già disponibili per currency e percentuali

Task:
1. Leggi `app/dashboard/page.tsx` per capire la struttura della card e i dati disponibili
2. Se i dati di breakdown per asset class sono già calcolati (da snapshot.byAssetClass o portfolioMetrics), usali direttamente
3. Aggiungi stato `isHovered` sulla card "Totale Patrimonio" con `onMouseEnter`/`onMouseLeave`
4. Con `AnimatePresence` e `fadeVariants`, mostra un layer di breakdown sotto il valore principale:
   - Mostra le asset class con valore > 0
   - Formato: nome asset class | importo EUR | percentuale sul totale
   - Font size: `text-xs text-muted-foreground`
   - Separatore sottile `border-t border-border/50 mt-2 pt-2` prima del breakdown
5. Su mobile (`useMediaQuery` o Tailwind responsive): `hidden desktop:block` sul breakdown hover

Vincoli:
- Non fare nuove chiamate API — usa solo dati già disponibili nel componente
- Il reveal deve espandersi verso il basso dentro la card stessa (no absolute positioning che rompe il grid layout)
- Usa `AnimatePresence` con `mode="wait"` sul contenuto hover
- Se i dati di breakdown NON sono disponibili nel componente dashboard, NON implementare la feature e spiega al developer quali dati mancano

Al termine dimmi: quali dati di breakdown sono risultati disponibili (o non disponibili), come testare il hover manualmente, come verificare che il layout del grid dashboard non si rompa con il reveal, e come verificare il comportamento su mobile.
```
