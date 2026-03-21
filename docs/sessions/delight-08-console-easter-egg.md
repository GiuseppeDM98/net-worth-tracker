# DELIGHT-08 — Console Easter Egg per Developer

## Categoria
Delight

## Priorità
Bassa

## Descrizione
Un piccolo messaggio nella console del browser — brandizzato, con stile CSS — per chiunque apra i DevTools. Delight istantaneo per sviluppatori, zero impatto sull'utente finale. Il tipo di dettaglio che fa sorridere e che denota cura.

## Soluzione Proposta
Un singolo `console.log` con stile CSS in `app/layout.tsx` (root layout), eseguito solo lato client:

```
╔══════════════════════════════╗
║   Net Worth Tracker          ║
║   Fatto con ♥ a Milano       ║
╚══════════════════════════════╝
Sei curioso? Ottima qualità.
Stack: Next.js · TypeScript · Firebase · Tailwind
```

Con colori: background verde smeraldo, testo bianco per il blocco principale; poi testo normale per le info di stack.

## File Coinvolti
- `app/layout.tsx` — aggiungere un `useEffect` lato client (oppure un componente `ConsoleGreeting` separato)

## Vincoli
- Solo in `process.env.NODE_ENV !== 'production'`? NO — lasciarlo anche in produzione (è un easter egg, non debug output)
- Usare `useEffect` (client-only) per evitare il log lato server in Next.js
- Un solo log pulito — non pollure la console con multipli messaggi
- Nessun dato sensibile (no email, no user info)

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript).

Obiettivo: aggiungere un messaggio Easter Egg nella console del browser, visibile a chiunque apra i DevTools.

Task:
1. Leggi `app/layout.tsx` per capire la struttura del root layout
2. Crea un piccolo componente `ConsoleGreeting` in `components/ConsoleGreeting.tsx`:
   ```tsx
   'use client'
   import { useEffect } from 'react'

   export function ConsoleGreeting() {
     useEffect(() => {
       console.log(
         '%c Net Worth Tracker %c\nFatto con ♥ a Milano\n',
         'background:#10B981;color:white;font-size:14px;font-weight:bold;padding:4px 8px;border-radius:4px 4px 0 0',
         'color:#6b7280;font-size:12px'
       )
       console.log(
         '%cStack: Next.js · TypeScript · Firebase · Tailwind v4',
         'color:#9ca3af;font-size:11px'
       )
     }, [])
     return null
   }
   ```
3. Importa e aggiungi `<ConsoleGreeting />` dentro `app/layout.tsx` (dentro il body, come primo figlio)
4. Verifica che sia `'use client'` (il `useEffect` non funziona server-side in Next.js)

Vincoli:
- `return null` — il componente non rende nulla nel DOM
- Nessun dato utente nel log
- Non wrappare con `process.env.NODE_ENV` check — lasciarlo anche in produzione

Al termine dimmi: come verificare che il messaggio appaia nella console (browser DevTools → tab Console), se appare una o più volte (deve essere solo una), e come verificare che non ci siano warning di hydration da Next.js (il `useEffect` deve essere in un Client Component).
```
