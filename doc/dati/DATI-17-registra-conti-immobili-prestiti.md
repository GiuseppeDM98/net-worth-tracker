# DATI-17 — Assistente › Registra: an account, a property, a pension fund, a loan added in words

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-16 (the second proposal kind: the key's
> widening, the browser's references, the card's states, the router's wider `register`).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 6; decisions 23, 29.

## 1. The problem today (evidence on the code)

- The owner, on which instruments the Assistente may create: «Io farei tutti i tipi, e ovviamente in base al tipo
  fa le domande giuste, ad esempio se legare un mutuo ad un immobile, che tasso ha ecc ecc». After DATI-16 the chat
  creates the ledger types with their first purchase. The other four — `cash`, `realestate`, `pensionFund`, `loan`
  (`types/assets.ts:22`) — are created only by the asset form (`TYPE_CARDS`,
  `components/assets/AssetDialog.tsx:358-368`).
- These four hold their value in `quantity` at price 1 (the form's label is «Saldo», «Valore stimato», «Valore
  attuale», «Debito residuo», `AssetDialog.tsx:1079`; the price path «default 1», `:1570-1572`) and are written by
  one `createAsset` with no ledger (`:1708-1711`). What each needs beyond name and amount is in the form's payload
  builder (`buildAssetFormDataFromValues`, `:219-292`): a loan's TAN and the property it finances (`:270-275`), its
  class from what it finances (`loanClassOf`, `:352-354`), its liquidity (`suggestIsLiquid`,
  `lib/utils/assetLiquidity.ts:22-25`), never in the stamp duty (`:256`), no allocation role (`:279`); a property's
  «abitazione principale» (`:276`); a pension fund's provider, unlock date and family member
  (`buildPensionFundDetailsFromForm`, `:194-211`).
- Registra's data block lists the accounts, the loans and the properties (`formatRegisterContextForPrompt`,
  `lib/utils/assistantRegisterContext.ts:448-516`) and the members only when the Divisione is on.

## 2. Goal and acceptance criteria

1. A message that asks to add an account, a property, a pension fund or a loan is read as a registration, and the
   model asks what that TYPE needs before proposing — for a loan the residual debt, the rate and whether it finances
   a property; for a property whether it is the main home and whether a mortgage sits on it. Proof: P1, R1.
2. The proposal is an `asset-proposal` block and ONE card; nothing is written before «Conferma». Proof: S1, D1.
3. A property told with its mortgage is one card that creates the property and then the loan linked to it; if the
   loan fails, «Riprova» creates only the loan. Proof: S3, D2, D3.
4. Each type is written with the fields the form writes for it (the table of § 4.1). Proof: S2.
5. A name already used by an asset of the same type is refused on the card. Proof: S4.
6. The outcome is saved on the message (`asset:N`); a written card links to Patrimonio and, for a pension fund,
   says the comparto is still to be set. Proof: D4, V1.
7. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1, E2 green
   (fake SSE: no model is called).

## 3. Decisions

- **Decision 23** (owner, 2026-11-23): every type, with the right questions per type.
- **Decision 29** (owner, 2026-11-23): one card creates and records.
- Adopted, reversible:
  - (a) a third block language, `asset-proposal`, at most 2 per message, never mixed with the other block kinds.
  - (b) accounts are in euro (DATI-06: a settlement account is EUR only).
  - (c) a property BOUGHT or SOLD now is Compravendita's (it moves money and has its own path): the model sends the
    user there; this card adds what the user already owns.
  - (d) a pension fund is created without its comparto mix (the form asks for it): the written card says so.
  - (e) no «Modifica» on the card (the asset form has no prefilled open); the user corrects in words or in
    Patrimonio.
  - (f) an owner (`ownerMemberId`) only on an account and a property, only when the user names a family member.

## 4. Solution

### 4.1 The proposal — `lib/utils/assetProposal.ts` (new, written here)

What each type writes (the form's payload, `AssetDialog.tsx:219-292`):

| | `type` / `assetClass` | `quantity` | `isLiquid` | other |
|---|---|---|---|---|
| account | `cash` / `cash` | the balance (may be negative) | true | `ownerMemberId?` |
| property | `realestate` / `realestate` | the estimated value | false | `isPrimaryResidence`, `ownerMemberId?` |
| pension fund | `pensionFund` / `equity` | the statement's value | false | `pensionFundDetails?` |
| loan | `loan` / `realestate` when it finances a property, else `cash` | the residual debt | only when it finances nothing | `debtInterestRate?`, `financedAssetId?`, `stampDutyExempt: true`, no `allocationRole` |

Common: `ticker: ''`, `currency: 'EUR'`, `currentPrice: 1`, `autoUpdatePrice: false`, and — but for a loan —
`stampDutyExempt: false`, `allocationRole: 'tradable'`.

```ts
/**
 * An account, a property, a pension fund or a loan told to the Assistente (2026-11-23): the block
 * the model writes and the asset document it becomes — the fields the asset form writes for that
 * type, no others. These four hold their value in `quantity` at price 1 and have no trade ledger.
 */
import { z } from 'zod';
import type { Asset, AssetFormData } from '@/types/assets';
import type { FamilyMember } from '@/types/assets';
import { foldName } from '@/lib/utils/assistantExpenseQueries';

export const ASSET_PROPOSAL_LANGUAGE = 'asset-proposal';
export const ASSET_PROPOSALS_MAX_PER_MESSAGE = 2;

const mortgageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  residualDebt: z.number().positive().max(1_000_000_000),
  ratePct: z.number().min(0).max(30).optional(),
});

export const assetProposalSchema = z
  .object({
    kind: z.enum(['cash', 'realestate', 'pensionFund', 'loan']),
    name: z.string().trim().min(1).max(80),
    // The balance, the estimated value, the statement's value or the residual debt, in euro.
    amount: z.number().min(-1_000_000_000).max(1_000_000_000),
    // A property.
    isPrimaryResidence: z.boolean().optional(),
    mortgage: mortgageSchema.optional(),
    // A loan.
    ratePct: z.number().min(0).max(30).optional(),
    financedPropertyId: z.string().min(1).optional(),
    // A pension fund.
    provider: z.string().trim().max(80).optional(),
    unlockDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    // The family member: the owner of an account or a property, the holder of a pension fund.
    memberId: z.string().min(1).optional(),
    reason: z.string().min(1).max(240),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (p.kind !== 'cash' && !(p.amount > 0)) issue('only an account may be at or below zero');
    if (p.kind !== 'realestate' && (p.isPrimaryResidence !== undefined || p.mortgage)) issue('only a property has a main-home flag and a mortgage');
    if (p.kind !== 'loan' && (p.ratePct !== undefined || p.financedPropertyId)) issue('only a loan has a rate and a financed property');
    if (p.kind !== 'pensionFund' && (p.provider !== undefined || p.unlockDateIso)) issue('only a pension fund has a provider and an unlock date');
    if (p.kind === 'loan' && p.memberId) issue('a loan names no member');
  });

export type AssetProposal = z.infer<typeof assetProposalSchema>;

export function parseAssetProposal(raw: string): AssetProposal | null {
  try {
    const parsed = assetProposalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const ASSET_KIND_LABELS: Record<AssetProposal['kind'], string> = {
  cash: 'Conto',
  realestate: 'Immobile',
  pensionFund: 'Fondo pensione',
  loan: 'Prestito',
};

/** The word the amount goes by, the asset form's own. */
export const ASSET_AMOUNT_LABELS: Record<AssetProposal['kind'], string> = {
  cash: 'Saldo',
  realestate: 'Valore stimato',
  pensionFund: 'Valore attuale',
  loan: 'Debito residuo',
};

export interface AssetProposalRefs {
  /** Every asset of the account: the duplicate check and the properties a loan may finance. */
  assets: Asset[];
  members: FamilyMember[];
}

export const ASSET_PROBLEM = {
  duplicate: (label: string, name: string) => `Hai già un ${label.toLowerCase()} che si chiama «${name}»`,
  unknownProperty: 'Immobile non trovato',
  unknownMember: 'Componente della famiglia non trovato',
} as const;

const base = (name: string, amount: number): Pick<AssetFormData, 'ticker' | 'name' | 'currency' | 'quantity' | 'currentPrice' | 'autoUpdatePrice'> => ({
  ticker: '',
  name,
  currency: 'EUR',
  quantity: amount,
  currentPrice: 1,
  autoUpdatePrice: false,
});

/** A loan's document; `financedAssetId` undefined = a personal loan. */
export function loanFormData(name: string, residualDebt: number, ratePct: number | undefined, financedAssetId: string | undefined): AssetFormData {
  return {
    ...base(name, residualDebt),
    type: 'loan',
    // The class follows what it finances; a personal loan is negative liquidity.
    assetClass: financedAssetId ? 'realestate' : 'cash',
    isLiquid: !financedAssetId,
    stampDutyExempt: true,
    isPrimaryResidence: false,
    ...(ratePct !== undefined && ratePct > 0 ? { debtInterestRate: ratePct } : {}),
    ...(financedAssetId ? { financedAssetId } : {}),
  };
}

export interface ResolvedAssetProposal {
  create: AssetFormData;
  /** A property's mortgage, created after it and linked to the new id. */
  mortgage: { name: string; residualDebt: number; ratePct?: number } | null;
  labels: { kind: string; amount: string; member: string | null; property: string | null };
  problems: string[];
}

export function resolveAssetProposal(p: AssetProposal, refs: AssetProposalRefs): ResolvedAssetProposal {
  const problems: string[] = [];
  const sameName = (type: Asset['type'], name: string) => refs.assets.some((asset) => asset.type === type && foldName(asset.name) === foldName(name));
  if (sameName(p.kind, p.name)) problems.push(ASSET_PROBLEM.duplicate(ASSET_KIND_LABELS[p.kind], p.name));
  if (p.mortgage && sameName('loan', p.mortgage.name)) problems.push(ASSET_PROBLEM.duplicate(ASSET_KIND_LABELS.loan, p.mortgage.name));

  const member = p.memberId ? (refs.members.find((item) => item.id === p.memberId) ?? null) : null;
  if (p.memberId && !member) problems.push(ASSET_PROBLEM.unknownMember);

  const property = p.financedPropertyId ? (refs.assets.find((asset) => asset.id === p.financedPropertyId && asset.type === 'realestate') ?? null) : null;
  if (p.financedPropertyId && !property) problems.push(ASSET_PROBLEM.unknownProperty);

  let create: AssetFormData;
  if (p.kind === 'loan') {
    create = loanFormData(p.name, p.amount, p.ratePct, property?.id);
  } else if (p.kind === 'cash') {
    create = { ...base(p.name, p.amount), type: 'cash', assetClass: 'cash', isLiquid: true, stampDutyExempt: false, isPrimaryResidence: false, allocationRole: 'tradable', ...(member ? { ownerMemberId: member.id } : {}) };
  } else if (p.kind === 'realestate') {
    create = { ...base(p.name, p.amount), type: 'realestate', assetClass: 'realestate', isLiquid: false, stampDutyExempt: false, isPrimaryResidence: p.isPrimaryResidence ?? false, allocationRole: 'tradable', ...(member ? { ownerMemberId: member.id } : {}) };
  } else {
    const provider = p.provider?.trim();
    const details = provider || p.unlockDateIso || member
      ? { provider: provider ?? '', ...(p.unlockDateIso ? { unlockDate: p.unlockDateIso } : {}), ...(member ? { familyMemberId: member.id } : {}) }
      : undefined;
    create = { ...base(p.name, p.amount), type: 'pensionFund', assetClass: 'equity', isLiquid: false, stampDutyExempt: false, isPrimaryResidence: false, allocationRole: 'tradable', ...(details ? { pensionFundDetails: details } : {}) };
  }

  return {
    create,
    mortgage: p.mortgage ? { name: p.mortgage.name, residualDebt: p.mortgage.residualDebt, ...(p.mortgage.ratePct !== undefined ? { ratePct: p.mortgage.ratePct } : {}) } : null,
    labels: { kind: ASSET_KIND_LABELS[p.kind], amount: ASSET_AMOUNT_LABELS[p.kind], member: member?.name ?? null, property: property?.name ?? null },
    problems,
  };
}
```

### 4.2 Keys

`proposalKey` gains the kind `'asset'`; the PATCH regex becomes `^(expense|goal|question|trade|asset):\d+$`
(`lib/server/validation.ts:226`). `writtenIds` = `[assetId]`, or `[propertyId, loanId]`.

### 4.3 What the model knows — `assistantRegisterContext.ts`, `prompts.ts`, `router.ts`

- `AssistantRegisterContext` gains `household: { id: string; name: string }[]` — `settings.familyMembers`, whatever
  the Divisione's switch (the INTESTATARI block is the Divisione's and stays as it is). Printed after STRUMENTI:

```
--- FAMIGLIA ---
[id] Nome
```

  with `nessun componente configurato` when empty.
- `REGISTER_CONTRACT`: the first paragraph's object gains «…, oppure un conto, un immobile, un fondo pensione o un
  prestito da aggiungere al patrimonio»; the block-count line gains «o al più 2 blocchi ```asset-proposal». A new
  section after «## Operazioni sui titoli»:

```
## Conti, immobili, fondi pensione e prestiti
Quando l'utente vuole aggiungere al patrimonio qualcosa che possiede già — un conto, un immobile, un fondo pensione — o un debito che ha — un mutuo, un prestito — lo proponi con un blocco di codice con linguaggio `asset-proposal` che contenga SOLO JSON valido:
{ "kind": "cash" | "realestate" | "pensionFund" | "loan", "name": string, "amount": number, "isPrimaryResidence"?: boolean, "mortgage"?: { "name": string, "residualDebt": number, "ratePct"?: number }, "ratePct"?: number, "financedPropertyId"?: string, "provider"?: string, "unlockDateIso"?: "YYYY-MM-DD", "memberId"?: string, "reason": string }
"amount" è in euro: il saldo di un conto (può essere negativo: una carta di credito), il valore stimato di un immobile, il valore attuale di un fondo pensione dall'ultimo estratto, il debito residuo di un prestito (sempre positivo). Senza il nome o senza l'importo non emettere il blocco: chiedili in prosa.
Prima di proporre fai le domande del tipo, una per volta con un blocco ```assistant-question, e solo quelle a cui l'utente non ha già risposto:
- Conto ("cash"): nessuna domanda oltre nome e saldo. I conti sono in euro.
- Immobile ("realestate"): «È la tua abitazione principale?» (Sì / No) → "isPrimaryResidence". Poi «C'è un mutuo su questo immobile?» (Sì / No): se sì, chiedi in prosa il debito residuo e il tasso (TAN) e scrivi "mortgage": { "name", "residualDebt", "ratePct" } nella STESSA proposta — la scheda crea l'immobile e il mutuo collegato. Il nome del mutuo è quello che dice l'utente, altrimenti «Mutuo {nome dell'immobile}».
- Prestito ("loan"): il debito residuo è "amount"; chiedi il tasso (TAN) in prosa se non lo dice → "ratePct" (omettilo se non lo sa). Poi, se il blocco IMMOBILI ha almeno un immobile, «Questo prestito finanzia un immobile?» con una domanda "property:" che elenca gli immobili per [id] e l'opzione «Nessuno: è un prestito personale» → "financedPropertyId" con l'[id] scelto, oppure nulla.
- Fondo pensione ("pensionFund"): "provider" è il nome del fondo se l'utente lo dice; se il blocco FAMIGLIA ha più di un componente chiedi «A chi è intestato?» con una domanda "member:" → "memberId"; "unlockDateIso" solo se l'utente dice da quando potrà riscattarlo.
- "memberId" su un conto o un immobile solo se l'utente nomina un componente del blocco FAMIGLIA come intestatario; mai su un prestito.
- Un immobile che l'utente sta comprando o vendendo ADESSO non si propone qui: scrivi che l'acquisto o la vendita di una casa si registra da Patrimonio, con «Compravendita».
- Uno strumento quotato (azione, ETF, obbligazione, criptovaluta, materia prima) non è un "asset-proposal": è un'operazione.
- Non proporre un nome che esiste già per lo stesso tipo nei blocchi CONTI, PRESTITI e IMMOBILI: chiedi se intende quello.
"reason" spiega in una frase che cosa aggiungi.
```

- `ASSISTANT_ROUTER_SYSTEM`'s `register` line (as DATI-16 left it) gains «, un conto, un immobile, un fondo
  pensione o un prestito da aggiungere» and the example «aggiungi il mutuo della casa, restano 120.000 euro».
- The question ids `property:` and `member:` join the prefixes the DOMANDE paragraph lists (`prompts.ts:1215`); the
  question card needs no change (an id is a string).

### 4.4 The browser's references

`RegisterRefsValue` gains `asset: AssetProposalRefs` — `assets` (the read `useRegisterReads` already makes) and
`members` (`settings.familyMembers`, the read that fills `refs.members` today).

### 4.5 The card — `components/assistant/AssetProposalCard.tsx` (new)

The shape and the states of DATI-16's card (`describeTradeProposalState`'s order, generalised: move it to
`lib/utils/proposalCardState.ts` as `describeProposalCardState({ saved, problems, pending, flags, writtenLine })` and
have both cards call it). `MarkdownPre` renders it for `ASSET_PROPOSAL_LANGUAGE && mode === 'register' &&
block.index < ASSET_PROPOSALS_MAX_PER_MESSAGE`.

- Lines: head «{labels.kind}» + the name; «{labels.amount} {amount in EUR}»; by type — a property: «Abitazione
  principale» when set, and with a mortgage a second group «Mutuo «{name}» · debito residuo {eur} · TAN {x,xx}%»; a
  loan: «TAN {x,xx}%» when given, «Finanzia {property}» or «Prestito personale»; a pension fund: the provider, «Di
  {member}», «Riscattabile dal {date}»; an account or a property with a member: «Intestato a {member}»; the reason.
- Buttons: «Conferma», «Ignora».
- The write, module-level:

```ts
async function writeAssetProposal(
  ownerId: string,
  resolved: ResolvedAssetProposal,
  created: { assetId?: string }
): Promise<string[]> {
  let assetId = created.assetId;
  if (!assetId) {
    assetId = await createAsset(ownerId, resolved.create);
    // Kept for the retry: a failed mortgage must not create the property twice.
    created.assetId = assetId;
  }
  if (!resolved.mortgage) return [assetId];
  const { name, residualDebt, ratePct } = resolved.mortgage;
  const loanId = await createAsset(ownerId, loanFormData(name, residualDebt, ratePct, assetId));
  return [assetId, loanId];
}
```

  Success: `recordProposal(key, { status: 'written', writtenIds })`, the toast «{kind} creato» (with a mortgage:
  «Immobile e mutuo creati»), invalidation of `queryKeys.assets.all` and `queryKeys.dashboard.overview`, the PATCH.
  Failure with `created.assetId` set: «Immobile creato, ma il mutuo non è stato creato: {message}» and «Riprova».
- Written state: «creato» and «apri in Patrimonio» → `/dashboard/assets`; a pension fund adds «Imposta il comparto
  in Patrimonio: finché manca, il fondo conta come azionario.»

### 4.6 The fake stream

`e2e/assistantRegister.ts` gains `assetBlock(proposal)` beside `tradeBlock`.

## 5. Constraints and traps

- **A debt is a `loan` asset worth minus its principal** (CLAUDE.md, Patrimonio): the residual debt is a POSITIVE
  quantity; the app signs it. Never a negative `quantity` on a loan.
- **A loan follows what it finances** (`resolveAllocationRoleWithin`): no `allocationRole` on it, class
  `realestate` when linked — the table of § 4.1 is the form's, not a choice.
- **`createAsset` strips `undefined`** (`removeUndefinedDeep`): the payload omits what it does not set; it never
  writes `outstandingDebt` (legacy).
- **Nothing is written before «Conferma», and once**; demo mode writes nothing; a failed read disables the card.
- **The system prompt is static**: the contract is a constant; the family is in the data block.
- **Compravendita owns a purchase or a sale of a house** (doc/guide/compravendita.md): this card never moves money.
- **A probe never spends**: fake SSE only.
- **No owner data**: «Conto Alfa», «Casa Beta», «Mutuo Casa Beta», round figures; members «Persona A», «Persona B».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| S1 | unit · `__tests__/assetProposal.test.ts` | each kind parses with its own fields; a rate on an account, a mortgage on a loan, a member on a loan, a zero value on a property do not; a negative balance on an account does | accept any field on any kind |
| S2 | unit · same | the four documents equal the table of § 4.1 field by field: price 1, EUR, empty ticker; a loan with a property is class `realestate`, illiquid, exempt, no role; a personal loan is class `cash`, liquid; a rate of 0 is not written | `allocationRole` on a loan |
| S3 | unit · same | a property with a mortgage → `mortgage` kept apart; `loanFormData(name, debt, rate, newId)` links it | mortgage without the link |
| S4 | unit · same | a name already used by the same type («conto alfa» vs «Conto Alfa») → the duplicate problem; the same name on another type is fine; an unknown property or member → its problem | exact match |
| C1 | unit · `__tests__/assistantRegisterContext.test.ts` | FAMIGLIA lists the members with the Divisione off; empty → its line | gate on the Divisione |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the contract has «## Conti, immobili, fondi pensione e prestiti», names `asset-proposal`, the mortgage question and Compravendita; the system is equal for two users | — |
| R1 | unit · `__tests__/assistantRouter.test.ts` | the router's `register` line names the four and the example | — |
| V1 | unit · `__tests__/serverValidation.test.ts` | the PATCH accepts `asset:0` | closed regex |
| N1 | unit · `__tests__/proposalCardState.test.ts` (new) | the shared order of states for both cards (DATI-16's N1 moves here) | — |
| D1 | dom · `__tests__/assetProposalCard.test.tsx` (new) | an account: the lines, «Conferma» calls `createAsset` once with the resolved document, the outcome is recorded | write at render |
| D2 | dom · same | a property with a mortgage: the property first, then the loan with `financedAssetId` = the new id; two ids saved | loan first |
| D3 | dom · same | the loan rejecting → «Immobile creato, ma…» and «Riprova»; the retry creates the property zero times more | create again |
| D4 | dom · same | a written pension fund shows the comparto sentence and the link; a duplicate name disables «Conferma» | — |
| D5 | dom · `__tests__/assistantStreamingResponse.test.tsx` | the block is a card only on a `register` message and only the first two | card in chat |
| E1 | e2e · `e2e/assistant.register.asset.spec.ts` (new, fake SSE) | a property with a mortgage: after «Conferma» Patrimonio shows the property and its «Mutuo» tile; reload → «creato» | — |
| E2 | e2e · `e2e/assistant.register.asset.mobile.spec.ts` (new) | 390: no horizontal overflow, targets ≥ 44 px | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the fake stream each of the four kinds shows one card with the type's own
lines; «Casa Beta» with its mortgage creates two assets, the loan under the property in Patrimonio; a second «Conto
Alfa» is refused on the card.

- A — the diff. B–E by a throwaway Playwright script on the emulators with `installFakeStream` at 1440 and 390,
  light and dark: B an account and a pension fund; C a property with a mortgage, then the retry after a planted
  failure of the second write; D a loan on an existing property and a personal loan (Patrimonio's classes after
  each); E a duplicate name, an unknown property id, demo mode, a reload of each written card. Decoys:
  «ornitorinco» (a third `asset-proposal` in one message: code) and «fenicottero» (a loan with a negative amount:
  the block does not parse and renders as code).
- F — at the owner's «pronto», on the mirror with the real model, by his hand: «aggiungi un conto» and «aggiungi un
  mutuo» told in words, to read the questions the model asks — the mirror is removed at the end.

## 8. Putting it into service

No rules, no index: `createAsset` is the form's write. The PATCH key's new kind is accepted from this deploy.

## 9. Documentation

- `doc/guide/assistente-registra.md` — § «Conti, immobili, fondi pensione e prestiti» (the block, the per-type
  questions, the table of what is written, the property-with-mortgage order and its retry); § blind spots: accounts
  in euro only; a pension fund is born without its comparto; a house bought now is Compravendita's; no «Modifica»
  on these cards.
- `doc/guide/patrimonio.md` — a second writer of assets (the card), the form's payload.
- `doc/guide/compravendita.md` — the Assistente points here for a purchase or a sale.
- `README.md` — Registra's feature lines. `Draft Release Temp.md` — «Assistente: aggiungi a parole un conto, un
  immobile con il suo mutuo, un fondo pensione o un prestito».
- `CLAUDE.md` — Assistente line: «…and adds an account, a property with its mortgage, a pension fund, a loan», under
  20.000 characters.
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- Editing or deleting an asset from the chat → doc/guide/assistente-registra.md § blind spots.
- A pension fund's comparto and its contributions from the chat → doc/guide/assistente-registra.md § blind spots.
- An account in another currency → doc/guide/assistente-registra.md § blind spots (accounts are EUR, DATI-06).
- The purchase or the sale of a house from the chat → doc/guide/compravendita.md § blind spots.
- Quotas by person (`ownerShares`) → doc/guide/assistente-registra.md § blind spots (the card names one owner).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-17-registra-conti-immobili-prestiti.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi, regole della serie) e la spec DATI-16, di cui questa riusa la scheda e la chiave
- Leggi doc/guide/assistente-registra.md, doc/guide/patrimonio.md, doc/guide/compravendita.md,
  doc/guide/previdenza.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic (il contratto di Registra e lo smistatore): usa la skill claude-api prima
  di toccare i prompt
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: la proposta pura con S1–S4 (ognuno visto rosso con
la sua mutazione), la chiave e la PATCH (V1), il blocco FAMIGLIA e il contratto (C1, P1, R1), lo stato
condiviso delle schede (N1), la scheda (D1–D5), il finto flusso e E1, E2. Il codice del § 4.1 e la
funzione di scrittura del § 4.5 sono già scritti: copiali.

Fermati e chiedimi se: DATI-16 non è in develop come la descrive la sua spec, un documento scritto dalla
scheda differisce da quello che scrive il modulo dell'app per lo stesso tipo, oppure un test arriverebbe
a chiamare il modello.

Collaudo: § 7 sul finto flusso; la F al mio «pronto», di mia mano. Un branch, un commit, solo dopo il
mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec: a third proposal kind that writes four asset types whose
documents must equal the form's, with a two-step write. Estimated size: L (one pure module, one card, one shared
state module, the contract, ~18 tests).
