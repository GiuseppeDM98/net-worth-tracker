'use client';

/**
 * The body of each Compravendita screen: the controls, nothing else. The question, the help and the
 * footer are the wizard's (CompravenditaWizard.tsx); every figure is the plan's
 * (lib/utils/realEstateOperationPlan.ts), every sentence the narrative's.
 */

import type { Dispatch } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Asset, FamilyMember } from '@/types/assets';
import type { CostCenter } from '@/types/costCenters';
import { REAL_ESTATE_COST_TYPES, type LifePolicyMode, type RealEstateOperationAnswers, type RealEstateOperationScreen } from '@/types/realEstateOperation';
import type { RealEstateOperationAction } from '@/lib/utils/realEstateOperationDraft';
import { costKindsOf, propertyChoices } from '@/lib/utils/realEstateOperationDraft';
import { futureSeriesAfter, loansFinancing, type RealEstatePlanContext } from '@/lib/utils/realEstateOperationPlan';
import {
  LIFE_POLICY_INSURED_HINT,
  LIFE_POLICY_LINK_HINT,
  LIFE_POLICY_NO_MEMBERS_HINT,
  REAL_ESTATE_COST_LABELS,
  describeBalance,
  describeMortgageEnd,
  describeMortgageInstalment,
  describeSaleAdjustment,
} from '@/lib/utils/realEstateOperationNarrative';
import { formatCurrency } from '@/lib/utils/formatters';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AccountField, CategoryField, ChoiceRows, DateField, FIELD_HEIGHT_CLASS, NumberField } from './fields';

export interface ScreenProps {
  screen: RealEstateOperationScreen;
  answers: RealEstateOperationAnswers;
  dispatch: Dispatch<RealEstateOperationAction>;
  context: RealEstatePlanContext;
  accounts: readonly Asset[];
  familyMembers: readonly FamilyMember[];
  propertyName: string;
}

const NEW_PROPERTY = '__new__';

const KIND_OPTIONS = [
  { value: 'purchase' as const, label: 'Compro casa', description: 'Caparra, rogito, mutuo, polizze, costi: la casa entra in Patrimonio.' },
  { value: 'sale' as const, label: 'Vendo casa', description: 'Caparra ricevuta, rogito, estinzione del mutuo: la casa esce dal patrimonio.' },
];
const EVENT_OPTIONS = [
  { value: 'preliminare' as const, label: 'Preliminare', description: 'Il compromesso: si versa o si riceve la caparra, si paga l’agenzia.' },
  { value: 'rogito' as const, label: 'Rogito', description: 'L’atto dal notaio: il resto del prezzo, il mutuo, le polizze, i costi.' },
];
const LIFE_MODE_OPTIONS: ReadonlyArray<{ value: LifePolicyMode; label: string; description: string }> = [
  { value: 'monthly', label: 'Mensile', description: 'Un premio al mese, con la rata: una serie fino a quando dura.' },
  { value: 'single', label: 'Premio unico pagato', description: 'Una spesa al rogito.' },
  { value: 'financed', label: 'Premio unico finanziato', description: 'Un prestito ha pagato il premio: le sue rate mensili lo rimborsano.' },
];

export function ScreenBody(props: ScreenProps) {
  switch (props.screen) {
    case 'operazione':
      return <OperazioneScreen {...props} />;
    case 'immobile':
      return <ImmobileScreen {...props} />;
    case 'caparra':
      return (
        <div className="flex flex-col gap-4">
          <AccountField id="re-account" label={props.answers.kind === 'purchase' ? 'Dal conto' : 'Sul conto'} accounts={props.accounts} value={props.answers.accountId} onChange={(accountId) => props.dispatch({ type: 'patch', patch: { accountId } })} />
          <NumberField id="re-deposit" label="Caparra, in euro" value={props.answers.depositAmount} onChange={(depositAmount) => props.dispatch({ type: 'patch', patch: { depositAmount } })} />
        </div>
      );
    case 'mutuo':
      return <MutuoScreen {...props} />;
    case 'saldo':
      return <SaldoScreen {...props} />;
    case 'rivaluta':
      return <p className="rounded-xl border border-border bg-muted px-4 py-3 text-[14px] leading-[1.55] text-foreground">{describeSaleAdjustment(props.answers, props.context, props.propertyName)}</p>;
    case 'polizze':
      return <PolizzeScreen {...props} />;
    case 'estinzione':
      return <EstinzioneScreen {...props} />;
    case 'serie':
      return <SerieScreen {...props} />;
    case 'costi':
      return <CostiScreen {...props} />;
    case 'centro':
      return <CentroScreen {...props} />;
    case 'riepilogo':
      return null;
  }
}

function OperazioneScreen({ answers, dispatch, context }: ScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceRows name="re-kind" label="Operazione" value={answers.kind} options={KIND_OPTIONS} onChange={(kind) => dispatch({ type: 'patch', patch: { kind, propertyId: null } })} />
      <ChoiceRows name="re-event" label="Evento" value={answers.event} options={EVENT_OPTIONS} onChange={(event) => dispatch({ type: 'patch', patch: { event } })} />
      <DateField id="re-date" label="Data dell’evento" value={answers.eventDateIso} max={context.todayIso} onChange={(eventDateIso) => dispatch({ type: 'patch', patch: { eventDateIso } })} />
    </div>
  );
}

function ImmobileScreen({ answers, dispatch, context, familyMembers }: ScreenProps) {
  const choices = propertyChoices(answers, context.assets);
  const isPurchase = answers.kind === 'purchase';
  const isNew = isPurchase && !answers.propertyId;
  return (
    <div className="flex flex-col gap-4">
      {(!isPurchase || choices.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="re-property">{isPurchase ? 'La casa' : 'La casa che vendi'}</Label>
          <Select value={answers.propertyId ?? (isPurchase ? NEW_PROPERTY : undefined)} onValueChange={(value) => dispatch({ type: 'patch', patch: { propertyId: value === NEW_PROPERTY ? null : value } })}>
            <SelectTrigger id="re-property" className={FIELD_HEIGHT_CLASS}>
              <SelectValue placeholder="Scegli la casa" />
            </SelectTrigger>
            <SelectContent>
              {isPurchase && <SelectItem value={NEW_PROPERTY}>Una casa nuova</SelectItem>}
              {choices.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.name} · {formatCurrency(asset.quantity)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isPurchase && choices.length > 0 && <p className="text-[12px] text-muted-foreground">Al rogito dopo un preliminare registrato, scegli la casa che il preliminare ha creato.</p>}
        </div>
      )}
      {isNew && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="re-name">Nome della casa</Label>
            <Input id="re-name" className={FIELD_HEIGHT_CLASS} value={answers.propertyName} placeholder="es. Casa in via Roma" onChange={(event) => dispatch({ type: 'patch', patch: { propertyName: event.target.value } })} />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="re-home" checked={answers.isPrimaryResidence} onCheckedChange={(checked) => dispatch({ type: 'patch', patch: { isPrimaryResidence: checked === true } })} className="mt-0.5" />
            <Label htmlFor="re-home" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
              È la casa in cui vivremo: fuori dall’Allocazione e dal calcolo FIRE.
            </Label>
          </div>
          {familyMembers.length > 0 && <OwnershipField answers={answers} dispatch={dispatch} familyMembers={familyMembers} />}
        </>
      )}
      <NumberField id="re-price" label={isPurchase ? 'Prezzo pattuito, in euro' : 'Prezzo di vendita, in euro'} value={answers.price} onChange={(price) => dispatch({ type: 'patch', patch: { price } })} />
    </div>
  );
}

function OwnershipField({ answers, dispatch, familyMembers }: Pick<ScreenProps, 'answers' | 'dispatch' | 'familyMembers'>) {
  const { ownership } = answers;
  const options = [
    { value: 'common' as const, label: 'In comune' },
    { value: 'member' as const, label: 'Di una persona' },
    { value: 'shares' as const, label: 'A quote' },
  ];
  const setMode = (mode: 'common' | 'member' | 'shares') =>
    dispatch({
      type: 'patch',
      patch: {
        ownership:
          mode === 'common'
            ? { mode }
            : mode === 'member'
              ? { mode, memberId: familyMembers[0].id }
              : { mode, shares: familyMembers.map((member) => ({ memberId: member.id, percent: Math.round((100 / familyMembers.length) * 100) / 100 })) },
      },
    });
  return (
    <div className="flex flex-col gap-2">
      <p className={TILE_SUB_EYEBROW_CLASS}>Intestatari</p>
      <ChoiceRows name="re-owner" label="Intestatari" value={ownership.mode} options={options} onChange={setMode} />
      {ownership.mode === 'member' && (
        <Select value={ownership.memberId} onValueChange={(memberId) => dispatch({ type: 'patch', patch: { ownership: { mode: 'member', memberId } } })}>
          <SelectTrigger aria-label="Intestatario" className={FIELD_HEIGHT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {familyMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {ownership.mode === 'shares' && (
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
          {ownership.shares.map((share, index) => (
            <NumberField
              key={share.memberId}
              id={`re-share-${share.memberId}`}
              label={`Quota di ${familyMembers.find((member) => member.id === share.memberId)?.name ?? 'membro'}, in %`}
              value={share.percent}
              step="1"
              onChange={(percent) => dispatch({ type: 'patch', patch: { ownership: { mode: 'shares', shares: ownership.shares.map((s, i) => (i === index ? { ...s, percent } : s)) } } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MutuoScreen({ answers, dispatch, context }: ScreenProps) {
  const loan = answers.mortgage;
  const patchLoan = (patch: Partial<typeof loan>) => dispatch({ type: 'patchMortgage', patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Checkbox id="re-has-mortgage" checked={answers.hasMortgage} onCheckedChange={(checked) => dispatch({ type: 'patch', patch: { hasMortgage: checked === true } })} className="mt-0.5" />
        <Label htmlFor="re-has-mortgage" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
          Sì, con un mutuo.
        </Label>
      </div>
      {answers.hasMortgage && (
        <>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <NumberField id="re-principal" label="Importo del mutuo, in euro" value={loan.principal} onChange={(principal) => patchLoan({ principal })} />
            <NumberField id="re-rate" label="TAN, in %" value={loan.ratePct} step="0.001" onChange={(ratePct) => patchLoan({ ratePct })} />
            <NumberField id="re-years" label="Durata, in anni" value={loan.years} step="1" onChange={(years) => patchLoan({ years })} />
            <DateField id="re-first" label="Prima rata" value={loan.firstInstalmentIso} onChange={(firstInstalmentIso) => patchLoan({ firstInstalmentIso })} />
          </div>
          <NumberField
            id="re-instalment"
            label="Rata mensile, se diversa dal piano (facoltativa)"
            value={loan.instalmentOverride}
            hint={describeMortgageInstalment(answers)}
            onChange={(instalmentOverride) => patchLoan({ instalmentOverride })}
          />
          <CategoryField id="re-mortgage-category" label="Categoria delle rate" categories={context.categories} allowed={REAL_ESTATE_COST_TYPES.mortgageInstalment} value={answers.mortgageCategory} onChange={(mortgageCategory) => dispatch({ type: 'patch', patch: { mortgageCategory } })} />
        </>
      )}
    </div>
  );
}

function SaldoScreen({ answers, dispatch, context, accounts }: ScreenProps) {
  const isPurchase = answers.kind === 'purchase';
  return (
    <div className="flex flex-col gap-4">
      <AccountField id="re-account" label={isPurchase ? 'Dal conto' : 'Sul conto'} accounts={accounts} value={answers.accountId} onChange={(accountId) => dispatch({ type: 'patch', patch: { accountId } })} />
      {!isPurchase && (
        <NumberField
          id="re-deposits-received"
          label="Caparre già ricevute, in euro"
          value={answers.depositsReceived}
          hint="Lette dai trasferimenti già registrati fuori da questa casa."
          onChange={(depositsReceived) => dispatch({ type: 'patch', patch: { depositsReceived } })}
        />
      )}
      <p className="rounded-xl border border-border bg-muted px-4 py-3 text-[14px] leading-[1.55] text-foreground">{describeBalance(answers, context)}</p>
    </div>
  );
}

function PolizzeScreen({ answers, dispatch, context }: ScreenProps) {
  const home = answers.homeInsurance;
  const end = describeMortgageEnd(answers);
  const patchHome = (patch: Partial<typeof home>) => dispatch({ type: 'patch', patch: { homeInsurance: { ...home, ...patch } } });
  const hasFinanced = answers.lifePolicies.some((policy) => policy.mode === 'financed');
  const hasPaid = answers.lifePolicies.some((policy) => policy.mode !== 'financed');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Scoppio e incendio</p>
        <ChoiceRows
          name="re-home-insurance"
          label="Polizza scoppio e incendio"
          value={home.mode}
          options={[
            { value: 'none', label: 'Nessuna' },
            { value: 'single', label: 'Pagata tutta al rogito', description: 'Una spesa nel giorno del rogito.' },
            { value: 'monthly', label: 'Mensile con la rata', description: `Una serie a parte, nello stesso giorno della rata${end ? `, fino a ${end}` : ''}.` },
          ]}
          onChange={(mode) => patchHome({ mode, firstIso: answers.mortgage.firstInstalmentIso, months: home.months ?? (answers.mortgage.years ? Math.round(answers.mortgage.years * 12) : null) })}
        />
        {home.mode !== 'none' && (
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <NumberField id="re-home-amount" label={home.mode === 'monthly' ? 'Premio mensile, in euro' : 'Premio, in euro'} value={home.amount} onChange={(amount) => patchHome({ amount })} />
            {home.mode === 'monthly' && (
              <>
                <DateField id="re-home-first" label="Primo premio" value={home.firstIso} onChange={(firstIso) => patchHome({ firstIso })} />
                <NumberField id="re-home-months" label="Per quanti mesi" value={home.months} step="1" onChange={(months) => patchHome({ months })} />
              </>
            )}
            <div className="tablet:col-span-2">
              <CategoryField id="re-home-category" label="Categoria" categories={context.categories} allowed={REAL_ESTATE_COST_TYPES.homeInsurance} value={home.category} onChange={(category) => patchHome({ category })} />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Vita e CPI</p>
        {answers.lifePolicies.length === 0 && <p className="text-[13px] text-muted-foreground">Nessuna polizza vita.</p>}
        {answers.lifePolicies.map((policy, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border border-border bg-muted px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-foreground">Polizza vita {index + 1}</p>
              <Button type="button" variant="ghost" className={cn(FIELD_HEIGHT_CLASS, 'gap-1.5 text-destructive')} onClick={() => dispatch({ type: 'removeLifePolicy', index })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Rimuovi
              </Button>
            </div>
            {context.familyMembers.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`re-life-${index}-insured`}>Assicurato</Label>
                <Select value={policy.insuredMemberId || undefined} onValueChange={(insuredMemberId) => dispatch({ type: 'updateLifePolicy', index, patch: { insuredMemberId } })}>
                  <SelectTrigger id={`re-life-${index}-insured`} className={FIELD_HEIGHT_CLASS}>
                    <SelectValue placeholder="Scegli chi assicura" />
                  </SelectTrigger>
                  <SelectContent>
                    {context.familyMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[12px] text-muted-foreground">{LIFE_POLICY_INSURED_HINT}</p>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">{LIFE_POLICY_NO_MEMBERS_HINT}</p>
            )}
            <div className="flex items-start gap-3">
              <Checkbox
                id={`re-life-${index}-linked`}
                checked={policy.linkedToProperty === true}
                onCheckedChange={(checked) => dispatch({ type: 'updateLifePolicy', index, patch: { linkedToProperty: checked === true } })}
                className="mt-0.5"
              />
              <Label htmlFor={`re-life-${index}-linked`} className="flex min-h-11 flex-1 cursor-pointer flex-col gap-0.5 desktop:min-h-0">
                <span className="text-[14px] font-medium text-foreground">Legata alla casa</span>
                <span className="text-[13px] font-normal text-muted-foreground">{LIFE_POLICY_LINK_HINT}</span>
              </Label>
            </div>
            <ChoiceRows name={`re-life-${index}-mode`} label={`Come si paga la polizza vita ${index + 1}`} value={policy.mode} options={LIFE_MODE_OPTIONS} onChange={(mode) => dispatch({ type: 'updateLifePolicy', index, patch: { mode } })} />
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <NumberField id={`re-life-${index}-amount`} label={policy.mode === 'monthly' ? 'Premio mensile, in euro' : 'Premio unico, in euro'} value={policy.amount} onChange={(amount) => dispatch({ type: 'updateLifePolicy', index, patch: { amount } })} />
              {policy.mode === 'monthly' && (
                <>
                  <DateField id={`re-life-${index}-first`} label="Primo premio" value={policy.firstIso} onChange={(firstIso) => dispatch({ type: 'updateLifePolicy', index, patch: { firstIso } })} />
                  <NumberField id={`re-life-${index}-months`} label="Per quanti mesi" value={policy.months} step="1" onChange={(months) => dispatch({ type: 'updateLifePolicy', index, patch: { months } })} />
                </>
              )}
              {policy.mode === 'financed' && (
                <>
                  <NumberField id={`re-life-${index}-rate`} label="TAN del prestito, in %" value={policy.loan.ratePct} step="0.001" onChange={(ratePct) => dispatch({ type: 'updateLifePolicy', index, patch: { loan: { ...policy.loan, ratePct } } })} />
                  <NumberField id={`re-life-${index}-years`} label="Durata del prestito, in anni" value={policy.loan.years} step="1" onChange={(years) => dispatch({ type: 'updateLifePolicy', index, patch: { loan: { ...policy.loan, years } } })} />
                  <DateField id={`re-life-${index}-loan-first`} label="Prima rata del prestito" value={policy.loan.firstInstalmentIso} onChange={(firstInstalmentIso) => dispatch({ type: 'updateLifePolicy', index, patch: { loan: { ...policy.loan, firstInstalmentIso } } })} />
                </>
              )}
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" className={cn(FIELD_HEIGHT_CLASS, 'w-fit gap-1.5')} onClick={() => dispatch({ type: 'addLifePolicy' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Aggiungi una polizza vita
        </Button>
        {hasPaid && <CategoryField id="re-life-category" label="Categoria delle polizze vita" categories={context.categories} allowed={REAL_ESTATE_COST_TYPES.lifeInsurance} value={answers.lifeCategory} onChange={(lifeCategory) => dispatch({ type: 'patch', patch: { lifeCategory } })} />}
        {hasFinanced && <CategoryField id="re-life-loan-category" label="Categoria delle rate del prestito" categories={context.categories} allowed={REAL_ESTATE_COST_TYPES.insuranceLoanInstalment} value={answers.lifeLoanCategory} onChange={(lifeLoanCategory) => dispatch({ type: 'patch', patch: { lifeLoanCategory } })} />}
      </div>
    </div>
  );
}

function EstinzioneScreen({ answers, dispatch, context }: ScreenProps) {
  const loans = answers.propertyId ? loansFinancing(answers.propertyId, context.assets) : [];
  return (
    <div className="flex flex-col gap-4">
      {loans.map((loan) => {
        const payoff = answers.payoffs.find((candidate) => candidate.loanId === loan.id) ?? { loanId: loan.id, amount: loan.quantity, include: false };
        const patchPayoff = (patch: Partial<typeof payoff>) =>
          dispatch({ type: 'patch', patch: { payoffs: [...answers.payoffs.filter((candidate) => candidate.loanId !== loan.id), { ...payoff, ...patch }] } });
        return (
          <div key={loan.id} className="flex flex-col gap-3 rounded-xl border border-border px-4 py-4">
            <div className="flex items-start gap-3">
              <Checkbox id={`re-payoff-${loan.id}`} checked={payoff.include} onCheckedChange={(checked) => patchPayoff({ include: checked === true })} className="mt-0.5" />
              <Label htmlFor={`re-payoff-${loan.id}`} className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                Estingui {loan.name} ({formatCurrency(loan.quantity)} di debito).
              </Label>
            </div>
            {payoff.include && <NumberField id={`re-payoff-${loan.id}-amount`} label="Importo estinto, in euro" value={payoff.amount} onChange={(amount) => patchPayoff({ amount })} />}
          </div>
        );
      })}
    </div>
  );
}

function SerieScreen({ answers, dispatch, context }: ScreenProps) {
  const loanIds = new Set(answers.propertyId ? loansFinancing(answers.propertyId, context.assets).map((loan) => loan.id) : []);
  const series = futureSeriesAfter(answers.eventDateIso, context.expenses, loanIds, answers.propertyId || null);
  const selected = new Set(answers.stopSeriesIds);
  return (
    <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Serie con voci dopo il rogito">
      {series.map((entry) => {
        const id = `re-series-${entry.seriesId}`;
        return (
          <li key={entry.seriesId} className="flex items-start gap-3 px-4 py-3">
            <Checkbox
              id={id}
              checked={selected.has(entry.seriesId)}
              onCheckedChange={(checked) =>
                dispatch({ type: 'patch', patch: { stopSeriesIds: checked === true ? [...answers.stopSeriesIds, entry.seriesId] : answers.stopSeriesIds.filter((seriesId) => seriesId !== entry.seriesId) } })
              }
              className="mt-0.5"
            />
            <Label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer flex-col gap-0.5 desktop:min-h-0">
              <span className="text-[14px] font-medium text-foreground">{entry.notes || entry.categoryLabel}</span>
              <span className="text-[13px] font-normal text-muted-foreground">
                {entry.categoryLabel} · {formatCurrency(entry.amount)} · {entry.rows.length} {entry.rows.length === 1 ? 'voce' : 'voci'} dopo il rogito{entry.linkedToProperty ? ' · legata alla casa' : entry.repaysLoan ? ' · rimborsa il mutuo' : ''}
              </span>
            </Label>
          </li>
        );
      })}
    </ul>
  );
}

function CostiScreen({ answers, dispatch, context }: ScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      {costKindsOf(answers).map((kind) => {
        const cost = answers.costs[kind] ?? { amount: null, category: null };
        return (
          <div key={kind} className="grid grid-cols-1 gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0 tablet:grid-cols-2">
            <NumberField id={`re-cost-${kind}`} label={`${REAL_ESTATE_COST_LABELS[kind]}, in euro`} value={cost.amount} onChange={(amount) => dispatch({ type: 'patchCost', kind, patch: { amount } })} />
            <CategoryField id={`re-cost-${kind}-category`} label="Categoria" categories={context.categories} allowed={REAL_ESTATE_COST_TYPES[kind]} value={cost.category} onChange={(category) => dispatch({ type: 'patchCost', kind, patch: { category } })} />
          </div>
        );
      })}
    </div>
  );
}

function CentroScreen({ answers, dispatch, context }: ScreenProps) {
  const open = context.costCenters.filter((center: CostCenter) => !center.archivedAt);
  const center = answers.costCenter;
  const options = [
    { value: 'new' as const, label: 'Un centro nuovo' },
    ...(open.length > 0 ? [{ value: 'existing' as const, label: 'Un centro che esiste' }] : []),
    { value: 'none' as const, label: 'Nessun centro' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <ChoiceRows name="re-center" label="Centro di costo" value={center.mode} options={options} onChange={(mode) => dispatch({ type: 'patch', patch: { costCenter: { ...center, mode, existingId: mode === 'existing' ? center.existingId || open[0]?.id || '' : center.existingId } } })} />
      {center.mode === 'new' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="re-center-name">Nome del centro</Label>
          <Input id="re-center-name" className={FIELD_HEIGHT_CLASS} value={center.name} onChange={(event) => dispatch({ type: 'patch', patch: { costCenter: { ...center, name: event.target.value } } })} />
        </div>
      )}
      {center.mode === 'existing' && (
        <Select value={center.existingId || undefined} onValueChange={(existingId) => dispatch({ type: 'patch', patch: { costCenter: { ...center, existingId } } })}>
          <SelectTrigger aria-label="Centro" className={FIELD_HEIGHT_CLASS}>
            <SelectValue placeholder="Scegli il centro" />
          </SelectTrigger>
          <SelectContent>
            {open.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
