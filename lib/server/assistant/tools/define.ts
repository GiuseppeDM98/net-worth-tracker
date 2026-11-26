import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { QueryClock } from '@/lib/utils/assistantExpenseQueries';
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { CostCenter } from '@/types/costCenters';
import type { BudgetConfig } from '@/types/budget';

/**
 * The pieces every tool is built from, apart from the registry that lists them: each tool module
 * imports this file and `registry.ts` imports each tool, so keeping the two apart leaves no import
 * cycle for a bundler to resolve half-initialised (the registry re-exports everything here).
 */

/** A read that failed: its tool answers with an error, the message still goes. */
export const UNREADABLE = 'unreadable' as const;

/** What a tool may read: built ONCE per request, before the first model round. */
export interface AssistantToolContext {
  /** The account read — the route's `body.userId` after `assertCanAccessAccount`, the owner's also for a co-owner. Never a tool's input. */
  userId: string;
  todayIso: string;
  now: Date;
  /** `queryClockOf(todayIso, settings.cashflowHistoryStartYear)`: what every cashflow query is read against. */
  clock: QueryClock;
  /** The whole recorded cashflow, the read the CASHFLOW block already makes. */
  expenses: readonly Expense[];
  categories: readonly ExpenseCategory[];
  costCenters: readonly CostCenter[] | typeof UNREADABLE;
  /** null = no budget configured. */
  budgetConfig: BudgetConfig | null | typeof UNREADABLE;
  costCentersEnabled: boolean;
}

/** A tool as the loop sees it: its definition, and one call that validates the raw input and runs. */
export interface AssistantTool {
  definition: Anthropic.Beta.BetaTool;
  /** Throws a `z.ZodError` for an input its schema refuses, `AssistantToolError` for a refusal the model can act on. */
  call(rawInput: unknown, context: AssistantToolContext): Promise<unknown>;
}

/** A refusal the model can act on (an unknown name, a period that ends before it starts): its message is the result. */
export class AssistantToolError extends Error {}

/**
 * A tool from its zod schema: the schema sent to the model is generated from it (no `strict`: zod
 * is the one gate), and `run` reads an input already validated. The generic is closed here, so
 * the registry is a plain `AssistantTool[]`.
 */
export function defineAssistantTool<Input>(spec: {
  name: string;
  description: string;
  input: z.ZodType<Input>;
  run: (input: Input, context: AssistantToolContext) => Promise<unknown> | unknown;
}): AssistantTool {
  // The dialect key is no part of a tool's input schema.
  const schema = { ...(z.toJSONSchema(spec.input) as Record<string, unknown>) };
  delete schema.$schema;
  return {
    definition: { name: spec.name, description: spec.description, input_schema: schema as Anthropic.Beta.BetaTool['input_schema'] },
    call: async (rawInput, context) => spec.run(spec.input.parse(rawInput), context),
  };
}
