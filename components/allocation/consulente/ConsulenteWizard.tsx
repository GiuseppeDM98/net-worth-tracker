'use client';

/**
 * The PATH: one question per screen, «Indietro» always, the draft on this browser. Every
 * screen is the same card — eyebrow «Passo n di 8 · {tema}», the question as the headline, a
 * help line, the controls, the footer with the two buttons — so the reader learns the shape
 * once. The goals screen walks one goal per sub-screen and ends on «cosa manca?».
 *
 * The card is a SCENE (2026-11-07; DESIGN.md → The Path-Scene Rule): the headline, the
 * help and the body slide 24px from the side the reader is going to, under an eyebrow and a
 * footer that do not move, beside a rail that says where they are (`PathRail`). The direction is
 * state set by the same handler as the dispatch — never a ref read during render, which would
 * make the React Compiler skip the whole component. After the slide the headline takes the focus
 * only when the focus still sits where the gesture left it (or on `body`, the pressed button
 * unmounted): a reader who already tapped a field keeps it.
 *
 * The reducer is `lib/utils/allocationAdviceDraft.ts` (pure, tested); the loss scenario of the
 * second screen is computed on the base of today's Allocazione (`currentAllocationOnBase`).
 * The last screen opens the INTERVIEW (2026-11-08, doc/ai/AI-04-colloquio.md): one more scene
 * in the same card (`ConsulenteInterviewScene`), whose rounds live in the draft (`phase`,
 * `interview`) and are requested by this component's `useConsulenteInterview` from the click —
 * «Avvia il colloquio», «Continua», «Riprova» — never from an effect; «Salta il colloquio» aborts
 * the round in flight. The summary and the interview then hand the answers AND the interview to
 * `ConsulenteRun` (`run.start`), and the rail's three ticks light one round at a time.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { ALLOCATION_ADVICE_STEPS } from '@/types/allocationAdvice';
import type { AllocationAdviceDocument, AllocationAdviceInterview } from '@/types/allocationAdvice';
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import type { AllocationAdviceAnswers, AnswerGoal } from '@/lib/utils/allocationAdviceProposal';
import {
  allocationAdviceDraftReducer,
  describeStepBlock,
  initialAnswers,
  reconcileDraftGoals,
  initialDraft,
  readStoredDraft,
  reopenStoredDraft,
  stepOf,
  writeStoredDraft,
} from '@/lib/utils/allocationAdviceDraft';
import { EMPTY_INTERVIEW, currentRoundNumber, interviewReducer } from '@/lib/utils/allocationAdviceInterview';
import { currentAllocationOnBase, lossScenarios } from '@/lib/utils/allocationAdviceApply';
import {
  DISTRIBUTION_POLICY_OPTIONS,
  EXCHANGE_OPTIONS,
  EXCHANGE_OTHER,
  EXCHANGE_OTHER_LABEL,
  LOSS_TOLERANCE_OPTIONS,
  isListedExchange,
  STEP_COPY,
  INTERVIEW_COPY,
  describeLossScenario,
} from '@/lib/utils/allocationAdviceNarrative';
import { calculateAssetValue } from '@/lib/services/assetService';
import { formatCurrency } from '@/lib/utils/formatters';
import { sceneVariants, sceneVariantsReduced } from '@/lib/utils/motionVariants';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ChoiceList } from '@/components/ui/choice-list';
import { PathRail } from '@/components/ui/path-rail';
import { cn } from '@/lib/utils';
import { ConsulenteRun, SCENE_CARD_CLASS, SCENE_GRID_CLASS } from './ConsulenteRun';
import { ConsulenteInterviewScene } from './ConsulenteInterviewScene';
import { useConsulenteInterview } from './useConsulenteInterview';
import type { useConsulenteRun } from './useConsulenteRun';

interface ConsulenteWizardProps {
  ownerId: string;
  configured: boolean;
  settings: AssetAllocationSettings | null;
  goalData: GoalBasedInvestingData | null;
  assets: Asset[];
  lastDocument: AllocationAdviceDocument | null;
  /** The page's run (ConsulenteClient owns it, so the page keeps this screen while it goes). */
  run: ReturnType<typeof useConsulenteRun>;
}

const HEADLINE_CLASS = 'text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]';
const HELP_CLASS = 'text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]';
const BUTTON_CLASS = 'h-11 desktop:h-9';
/** A control that asks the model: the hover accent on a filled button (decisions 36 and 85). */
const AI_PRIMARY_CLASS = cn(BUTTON_CLASS, 'border border-transparent', AI_CONTROL_ACCENT_CLASS);

/**
 * The exchange: a closed list of the four the instrument agent knows plus «Altra…», which opens a
 * free text field (owner, 2026-10-20: the datalist's arrow looked like a dropdown and was not one).
 * «Altra…» is local state, so the field stays open while the text is still empty; a draft that
 * comes back with an unlisted exchange reopens it.
 */
function ExchangeField({ value, onChange }: { value: string; onChange: (exchange: string) => void }) {
  const [other, setOther] = useState(() => !isListedExchange(value));
  const showOther = other || !isListedExchange(value);
  const selected = showOther ? EXCHANGE_OTHER : value;
  const pick = (next: string) => {
    if (next === EXCHANGE_OTHER) {
      setOther(true);
      onChange('');
      return;
    }
    setOther(false);
    onChange(next);
  };
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="consulente-exchange">Borsa di riferimento</Label>
        <Select value={selected} onValueChange={pick}>
          <SelectTrigger id="consulente-exchange" className={BUTTON_CLASS}>
            <SelectValue placeholder="Scegli la borsa…" />
          </SelectTrigger>
          <SelectContent>
            {EXCHANGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
            <SelectItem value={EXCHANGE_OTHER}>{EXCHANGE_OTHER_LABEL}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showOther && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="consulente-exchange-other">Quale borsa</Label>
          <Input id="consulente-exchange-other" value={value} onChange={(event) => onChange(event.target.value)} placeholder="es. SIX Swiss Exchange (Zurigo)" autoFocus />
        </div>
      )}
    </>
  );
}

const ROLE_OPTIONS_HOME = [
  { value: 'excluded' as const, label: 'Esclusa', hint: 'Fuori dalla base e dai piani: la casa in cui vivi non si vende per ribilanciare.' },
  { value: 'frozen' as const, label: 'Non negoziabile', hint: 'Conta negli Immobili della base; i piani non la toccano.' },
];
const ROLE_OPTIONS_FROZEN_FIRST = [
  { value: 'frozen' as const, label: 'Non negoziabile', hint: 'Conta nella base (abbassa quanto comprare di quella classe); i piani non lo toccano.' },
  { value: 'excluded' as const, label: 'Escluso', hint: 'Fuori dalla base: le percentuali si misurano solo sul resto.' },
];

/** The rail's names: the eyebrow of every step, in the path's order. */
const STEP_NAMES = ALLOCATION_ADVICE_STEPS.map((step) => STEP_COPY[step].eyebrow);

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

export function ConsulenteWizard({ ownerId, configured, settings, goalData, assets, lastDocument, run }: ConsulenteWizardProps) {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const [draft, dispatch] = useReducer(
    allocationAdviceDraftReducer,
    null,
    // A draft that comes back follows FIRE › Obiettivi: goals added since are added, deleted ones
    // dropped; an interview a run already used is dropped too (`reopenStoredDraft`, criterion 8 of AI-04).
    () => reconcileDraftGoals(reopenStoredDraft(readStoredDraft(storage, ownerId), lastDocument) ?? initialDraft(lastDocument?.answers ?? initialAnswers(settings, goalData, assets)), goalData)
  );
  // The draft follows every change onto this browser — the interview's rounds and answers included; a finished run clears it.
  useEffect(() => {
    writeStoredDraft(storage, ownerId, draft);
  }, [storage, ownerId, draft]);

  // The interview (2026-11-08): the rounds live in the draft, the request in flight here.
  const interviewRound = useConsulenteInterview(ownerId);
  const interview: AllocationAdviceInterview = draft.interview ?? EMPTY_INTERVIEW;
  const inInterview = draft.phase === 'interview' && stepOf(draft) === 'riepilogo';
  const asking = interviewRound.state.kind === 'asking';

  const base = useMemo(() => currentAllocationOnBase(assets, calculateAssetValue), [assets]);
  const scenarios = useMemo(() => lossScenarios(base.baseTotal), [base.baseTotal]);
  const heldNames = useMemo(() => assets.filter((asset) => asset.quantity > 0 && asset.type !== 'loan' && asset.type !== 'cash').map((asset) => asset.name), [assets]);

  const step = stepOf(draft);
  const copy = STEP_COPY[step];
  const stepNumber = draft.step + 1;
  const block = describeStepBlock(draft);
  const { answers } = draft;
  const patch = (next: Partial<AllocationAdviceAnswers>) => dispatch({ type: 'patch', patch: next });

  // The scene: where the next screen comes from (+1 forward, −1 back), the element focused at
  // the gesture, the headline to focus once the slide has landed. All before the early return.
  const [direction, setDirection] = useState<1 | -1>(1);
  const pendingFocus = useRef<Element | null>(null);
  const headlineRef = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();
  const move = (toward: 1 | -1, action: Parameters<typeof dispatch>[0]) => {
    pendingFocus.current = document.activeElement;
    setDirection(toward);
    dispatch(action);
  };
  const focusHeadline = () => {
    const pending = pendingFocus.current;
    if (pending === null) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    if (active === pending || active === document.body) headlineRef.current?.focus({ preventScroll: true });
  };

  // The interview's gestures. A round is requested from a click, never from an effect; the received
  // round enters the draft at once with no answers (criterion 7 of AI-04).
  const requestRound = (current: AllocationAdviceInterview) =>
    interviewRound.requestRound({ answers, interview: current }, (round) => dispatch({ type: 'interview', action: { type: 'roundReceived', round } }));
  const startInterview = () => {
    move(1, { type: 'phase', phase: 'interview' });
    requestRound({ rounds: interview.rounds, skipped: false });
  };
  const skipInterview = () => {
    interviewRound.abort();
    dispatch({ type: 'interview', action: { type: 'skip' } });
    run.start(answers, 'strategy', interviewReducer(interview, { type: 'skip' }));
  };

  if (run.state.kind !== 'idle') {
    const { state } = run;
    return <ConsulenteRun state={state} onRetry={run.retry} onBack={run.reset} />;
  }

  const onGoalsScreen = step === 'obiettivi';
  const goalIndex = draft.goalIndex;
  const currentGoal: AnswerGoal | null = onGoalsScreen && goalIndex < answers.goals.length ? answers.goals[goalIndex] : null;
  const subEyebrow = onGoalsScreen
    ? currentGoal
      ? `Obiettivo ${goalIndex + 1} di ${answers.goals.length}`
      : answers.goals.length === 0
        ? 'Nessun obiettivo registrato'
        : 'Cosa manca'
    : null;
  // An added or a removed goal changes the length, so the scene plays; a keystroke changes nothing.
  const sceneKey = `${draft.step}:${draft.goalIndex}:${answers.goals.length}`;
  const variants = reduced ? sceneVariantsReduced : sceneVariants;
  const roundNumber = currentRoundNumber(interview, asking);
  const interviewEyebrow = INTERVIEW_COPY.eyebrow(roundNumber, 3);

  return (
    <div className={SCENE_GRID_CLASS}>
      <PathRail mode="path" steps={STEP_NAMES} current={draft.step} interview={{ total: 3, reached: inInterview ? roundNumber : null }} />
      <section className={cn(TILE_SURFACE_CLASS, SCENE_CARD_CLASS)} aria-label={inInterview ? interviewEyebrow : `Passo ${stepNumber} di ${ALLOCATION_ADVICE_STEPS.length}: ${copy.eyebrow}`}>
        {/* The summary and the interview trade places as whole scenes (the interview's eyebrow and footer are its own); the path's screens slide inside the second branch. */}
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {inInterview ? (
            <motion.div
              key="interview"
              data-scene="interview"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              onAnimationComplete={(definition) => definition === 'center' && focusHeadline()}
            >
              <ConsulenteInterviewScene
                interview={interview}
                round={interviewRound.state}
                configured={configured}
                headlineRef={headlineRef}
                onAnswer={(questionId, value) => dispatch({ type: 'interview', action: { type: 'answer', questionId, value } })}
                onBack={() => move(-1, { type: 'phase', phase: 'path' })}
                onSkip={skipInterview}
                onContinue={() => requestRound(interview)}
                onRun={() => run.start(answers, 'strategy', interview)}
                onRetry={() => requestRound(interview)}
              />
            </motion.div>
          ) : (
            <motion.div key="path" custom={direction} variants={variants} initial="enter" animate="center" exit="exit" onAnimationComplete={(definition) => definition === 'center' && focusHeadline()}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className={TILE_EYEBROW_CLASS}>
                  Passo {stepNumber} di {ALLOCATION_ADVICE_STEPS.length} · {copy.eyebrow}
                </h2>
                {subEyebrow && <span className={cn(TILE_SUB_EYEBROW_CLASS, 'shrink-0')}>{subEyebrow}</span>}
              </div>
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={sceneKey}
                  data-scene={sceneKey}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  onAnimationComplete={(definition) => definition === 'center' && focusHeadline()}
                >
                  <p ref={headlineRef} tabIndex={-1} className={cn(HEADLINE_CLASS, 'mt-3 outline-none')}>{currentGoal ? (currentGoal.goalId ? `«${currentGoal.name}» è ancora un tuo obiettivo?` : 'Un nuovo obiettivo.') : copy.question}</p>
                  <p className={cn(HELP_CLASS, 'mt-2 max-w-[600px]')}>{copy.help}</p>

                  <div className="mt-5 flex flex-col gap-4">
                    {step === 'profilo' && (
                      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="consulente-age">Età</Label>
                          <Input id="consulente-age" type="number" inputMode="numeric" min={18} max={100} value={answers.age ?? ''} onChange={(event) => patch({ age: numberOrNull(event.target.value) })} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="consulente-horizon">Orizzonte, in anni</Label>
                          <Input id="consulente-horizon" type="number" inputMode="numeric" min={1} max={60} value={answers.horizonYears ?? ''} onChange={(event) => patch({ horizonYears: numberOrNull(event.target.value) })} />
                        </div>
                      </div>
                    )}

                    {step === 'tolleranza' && (
                      <>
                        <ul className="divide-y divide-border rounded-xl border border-border bg-muted/40 px-4" aria-label="Scenari di perdita sulla tua base">
                          {scenarios.map((scenario) => (
                            <li key={scenario.pct} className="py-2.5">
                              <NarrativeText segments={describeLossScenario(scenario.pct, scenario.eur)} className="text-[13px] leading-[1.45] text-foreground" />
                            </li>
                          ))}
                        </ul>
                        <p className="text-[11px] text-muted-foreground">Base di oggi: {formatCurrency(base.baseTotal)} (negoziabile e non negoziabile, al netto dei debiti).</p>
                        <ChoiceList mode="single" name="loss" label="Tolleranza alle perdite" value={answers.lossTolerance} options={LOSS_TOLERANCE_OPTIONS} onChange={(lossTolerance) => patch({ lossTolerance })} />
                      </>
                    )}

                    {step === 'borsa' && (
                      <>
                        <ExchangeField value={answers.exchange} onChange={(exchange) => patch({ exchange })} />
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="consulente-broker">Broker (facoltativo)</Label>
                          <Input id="consulente-broker" value={answers.broker} onChange={(event) => patch({ broker: event.target.value })} placeholder="es. Directa, Fineco, Degiro" />
                        </div>
                      </>
                    )}

                    {step === 'politica' && (
                      <ChoiceList mode="single" name="policy" label="Proventi" value={answers.distributionPolicy} options={DISTRIBUTION_POLICY_OPTIONS} onChange={(distributionPolicy) => patch({ distributionPolicy })} />
                    )}

                    {step === 'obiettivi' && currentGoal && (
                      <GoalFields goal={currentGoal} index={goalIndex} onChange={(fields) => dispatch({ type: 'updateGoal', index: goalIndex, patch: fields })} onRemove={() => move(-1, { type: 'removeGoal', index: goalIndex })} />
                    )}

                    {step === 'obiettivi' && !currentGoal && (
                      <>
                        {answers.goals.length > 0 && (
                        <div className="flex items-start gap-3">
                          <Checkbox id="consulente-reflect" checked={answers.goalsReflectReality} onCheckedChange={(checked) => patch({ goalsReflectReality: checked === true })} className="mt-0.5" />
                          <Label htmlFor="consulente-reflect" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                            Gli obiettivi di sopra rispecchiano la realtà.
                          </Label>
                        </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="consulente-missing">Cosa manca, nelle tue parole (facoltativo)</Label>
                          <Textarea id="consulente-missing" rows={3} value={answers.newGoalsNote} onChange={(event) => patch({ newGoalsNote: event.target.value })} placeholder="es. vorrei mettere da parte per cambiare auto fra tre anni" />
                        </div>
                        <Button type="button" variant="outline" className={cn(BUTTON_CLASS, 'w-fit gap-1.5')} onClick={() => move(1, { type: 'addGoal' })}>
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Aggiungi un obiettivo
                        </Button>
                      </>
                    )}

                    {step === 'ruoli' && (
                      <div className="flex flex-col gap-4">
                        <RoleBlock title="La casa in cui vivi" name="home" value={answers.homeRole} options={ROLE_OPTIONS_HOME} onChange={(homeRole) => patch({ homeRole })} />
                        <RoleBlock title="I fondi pensione" name="pension" value={answers.pensionRole} options={ROLE_OPTIONS_FROZEN_FIRST} onChange={(pensionRole) => patch({ pensionRole })} />
                        <RoleBlock title="Private equity e altri illiquidi" name="pe" value={answers.privateEquityRole} options={ROLE_OPTIONS_FROZEN_FIRST} onChange={(privateEquityRole) => patch({ privateEquityRole })} />
                      </div>
                    )}

                    {step === 'vincoli' && (
                      <>
                        {heldNames.length > 0 && (
                          <fieldset className="flex flex-col gap-2">
                            <legend className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1')}>Strumenti da tenere comunque</legend>
                            <div className="grid grid-cols-1 gap-1 tablet:grid-cols-2">
                              {heldNames.map((name) => {
                                const id = `keep-${name.replace(/\W+/g, '-')}`;
                                const checked = answers.keepAssets.includes(name);
                                return (
                                  <div key={name} className="flex items-center gap-3">
                                    <Checkbox
                                      id={id}
                                      checked={checked}
                                      onCheckedChange={(next) => patch({ keepAssets: next === true ? [...answers.keepAssets, name] : answers.keepAssets.filter((kept) => kept !== name) })}
                                    />
                                    <Label htmlFor={id} className="min-h-11 cursor-pointer truncate text-[13px] font-normal desktop:min-h-8">
                                      {name}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          </fieldset>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="consulente-avoid">Da evitare (facoltativo)</Label>
                          <Input id="consulente-avoid" value={answers.avoid} onChange={(event) => patch({ avoid: event.target.value })} placeholder="es. niente leva, niente singole azioni" />
                        </div>
                        <div className="flex items-start gap-3">
                          <Checkbox id="consulente-esg" checked={answers.esg} onCheckedChange={(checked) => patch({ esg: checked === true })} className="mt-0.5" />
                          <Label htmlFor="consulente-esg" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                            Preferisco strumenti ESG quando esistono.
                          </Label>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="consulente-notes">Altre note per il Consulente (facoltativo)</Label>
                          <Textarea id="consulente-notes" rows={3} value={answers.notes} onChange={(event) => patch({ notes: event.target.value })} />
                        </div>
                      </>
                    )}

                    {step === 'riepilogo' && <Summary answers={answers} onGoto={(index) => move(-1, { type: 'goto', step: index })} />}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
                <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={() => move(-1, { type: 'back' })} disabled={draft.step === 0 && goalIndex === 0}>
                  Indietro
                </Button>
                <div className="flex flex-col gap-2 tablet:items-end">
                  {block && (
                    <p role="status" className="text-[12px] text-warning-foreground">
                      {block}
                    </p>
                  )}
                  {step === 'riepilogo' ? (
                    // The interview first (2026-11-08): with no round, «Avvia il colloquio» (the accent: it asks the
                    // model) beside «Salta il colloquio e avvia la ricerca» (never accented, decision 78); with
                    // rounds, back to the scene or a fresh start. All four need the key.
                    <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:items-center">
                      {interview.rounds.length === 0 ? (
                        <>
                          <Button type="button" variant="outline" className={BUTTON_CLASS} disabled={!configured} onClick={() => run.start(answers, 'strategy', { rounds: [], skipped: true })}>
                            {INTERVIEW_COPY.skipAndRun}
                          </Button>
                          <Button type="button" className={AI_PRIMARY_CLASS} disabled={!configured} onClick={startInterview}>
                            {configured ? INTERVIEW_COPY.start : INTERVIEW_COPY.notConfigured}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="outline" className={BUTTON_CLASS} disabled={!configured} onClick={() => dispatch({ type: 'interview', action: { type: 'reset' } })}>
                            {INTERVIEW_COPY.restart}
                          </Button>
                          <Button type="button" className={BUTTON_CLASS} disabled={!configured} onClick={() => move(1, { type: 'phase', phase: 'interview' })}>
                            {configured ? INTERVIEW_COPY.resume : INTERVIEW_COPY.notConfigured}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <Button type="button" className={BUTTON_CLASS} disabled={block !== null} onClick={() => move(1, { type: 'next' })}>
                      Avanti
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function RoleBlock<T extends string>({
  title,
  name,
  value,
  options,
  onChange,
}: {
  title: string;
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className={TILE_SUB_EYEBROW_CLASS}>{title}</p>
      <ChoiceList mode="single" name={name} label={title} value={value} options={options} onChange={onChange} />
    </div>
  );
}

function GoalFields({ goal, index, onChange, onRemove }: { goal: AnswerGoal; index: number; onChange: (patch: Partial<AnswerGoal>) => void; onRemove: () => void }) {
  const idOf = (field: string) => `goal-${index}-${field}`;
  return (
    <div className="flex flex-col gap-4">
      {goal.goalId && (
        <div className="flex items-start gap-3">
          <Checkbox id={idOf('keep')} checked={goal.keep} onCheckedChange={(checked) => onChange({ keep: checked === true })} className="mt-0.5" />
          <Label htmlFor={idOf('keep')} className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
            Sì, lo tengo. {goal.keep ? '' : 'Deselezionato: il Consulente lo propone da eliminare.'}
          </Label>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor={idOf('name')}>Nome</Label>
          <Input id={idOf('name')} value={goal.name} onChange={(event) => onChange({ name: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idOf('target')}>Importo target in euro (facoltativo)</Label>
          <Input id={idOf('target')} type="number" inputMode="decimal" min={1} value={goal.targetAmount ?? ''} onChange={(event) => onChange({ targetAmount: numberOrNull(event.target.value) })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idOf('date')}>Scadenza (facoltativa)</Label>
          <Input id={idOf('date')} type="date" value={goal.targetDateIso ?? ''} onChange={(event) => onChange({ targetDateIso: event.target.value || null })} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className={TILE_SUB_EYEBROW_CLASS}>Priorità</p>
        <ChoiceList
          mode="single"
          name={idOf('priority')}
          label="Priorità"
          value={goal.priority}
          options={[
            { value: 'alta' as const, label: 'Alta', hint: 'Va raggiunto: meno rischio man mano che si avvicina.' },
            { value: 'media' as const, label: 'Media', hint: 'Importante, ma può slittare.' },
            { value: 'bassa' as const, label: 'Bassa', hint: 'Tollera molto rischio e tempo.' },
          ]}
          onChange={(priority) => onChange({ priority })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idOf('note')}>Nota per il Consulente (facoltativa)</Label>
        <Textarea id={idOf('note')} rows={2} value={goal.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="es. le quote di SWDA sono metà per ciascuna figlia" />
      </div>
      {!goal.goalId && (
        <Button type="button" variant="ghost" className={cn(BUTTON_CLASS, 'w-fit gap-1.5 text-destructive')} onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Rimuovi questo obiettivo
        </Button>
      )}
    </div>
  );
}

const LOSS_LABEL: Record<AllocationAdviceAnswers['lossTolerance'], string> = { bassa: 'bassa', media: 'media', alta: 'alta' };
const POLICY_LABEL: Record<AllocationAdviceAnswers['distributionPolicy'], string> = { accumulazione: 'accumulazione', distribuzione: 'distribuzione', indifferente: 'scelga il Consulente' };
const ROLE_LABEL = { tradable: 'negoziabile', frozen: 'non negoziabile', excluded: 'escluso' } as const;

/** «tieni 2 · evita: niente leva · ESG», or «nessuno». A plain loop: a ternary inside a `||` is a block the React Compiler skips. */
function describeConstraints(answers: AllocationAdviceAnswers): string {
  const parts: string[] = [];
  if (answers.keepAssets.length > 0) parts.push(`tieni ${answers.keepAssets.length}`);
  if (answers.avoid.trim()) parts.push(`evita: ${answers.avoid.trim()}`);
  if (answers.esg) parts.push('ESG');
  return parts.length > 0 ? parts.join(' · ') : 'nessuno';
}

/** The answers as rows, each a link back to its screen. */
function Summary({ answers, onGoto }: { answers: AllocationAdviceAnswers; onGoto: (step: number) => void }) {
  const rows: { step: number; label: string; value: string }[] = [
    { step: 0, label: 'Età e orizzonte', value: `${answers.age ?? '—'} anni · ${answers.horizonYears ?? '—'} anni di orizzonte` },
    { step: 1, label: 'Tolleranza alle perdite', value: LOSS_LABEL[answers.lossTolerance] },
    { step: 2, label: 'Borsa e broker', value: `${answers.exchange}${answers.broker ? ` · ${answers.broker}` : ''}` },
    { step: 3, label: 'Proventi', value: POLICY_LABEL[answers.distributionPolicy] },
    {
      step: 4,
      label: 'Obiettivi',
      value: answers.goals.length === 0 ? 'nessuno' : answers.goals.map((goal) => `${goal.name}${goal.keep ? '' : ' (da eliminare)'}`).join(', '),
    },
    { step: 5, label: 'Casa · pensione · illiquidi', value: `${ROLE_LABEL[answers.homeRole]} · ${ROLE_LABEL[answers.pensionRole]} · ${ROLE_LABEL[answers.privateEquityRole]}` },
    { step: 6, label: 'Vincoli', value: describeConstraints(answers) },
  ];
  return (
    <ul className="divide-y divide-border" aria-label="Le tue risposte">
      {rows.map((row) => (
        <li key={row.step}>
          <button type="button" onClick={() => onGoto(row.step)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left hover:underline desktop:min-h-9">
            <span className="text-[13px] text-muted-foreground">{row.label}</span>
            <span className="min-w-0 truncate text-[13px] text-foreground">{row.value}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
