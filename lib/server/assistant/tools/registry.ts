import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AssistantToolError, type AssistantTool, type AssistantToolContext } from './define';
import { spendingTotals } from './cashflowTotals';
import { spendingCompare } from './cashflowCompare';
import { spendingRows } from './cashflowRows';
import { budgetState } from './budgetState';
import { costCentersState } from './costCentersState';

/**
 * The Assistente's tools: the questions the model may ask the server about the user's data,
 * answered by code on what the request read once (`context.ts`). A later tool is ONE more entry
 * of `ASSISTANT_TOOLS` — a `defineAssistantTool` in its own file — never a change to the loop in
 * anthropicStream.ts. The order is fixed and the descriptions name no date and no user: the list
 * is part of the request's prefix, identical for every request and every round.
 */
export {
  AssistantToolError,
  defineAssistantTool,
  UNREADABLE,
  type AssistantTool,
  type AssistantToolContext,
} from './define';

export const ASSISTANT_TOOLS: readonly AssistantTool[] = [spendingTotals, spendingCompare, spendingRows, budgetState, costCentersState];
export const ASSISTANT_TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = ASSISTANT_TOOLS.map((tool) => tool.definition);

const UNANSWERED_RESULT = 'Lo strumento non ha risposto: rispondi con i dati che hai e dillo.';

/** One tool call as the `tool_result` content: the JSON on success, an error sentence otherwise. Never throws. */
export async function runAssistantTool(
  name: string,
  rawInput: unknown,
  context: AssistantToolContext,
): Promise<{ content: string; isError: boolean }> {
  const tool = ASSISTANT_TOOLS.find((candidate) => candidate.definition.name === name);
  if (!tool) return { isError: true, content: `Strumento sconosciuto: ${name}.` };
  try {
    return { isError: false, content: JSON.stringify(await tool.call(rawInput, context)) };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
      return { isError: true, content: `Parametri non validi: ${issues}` };
    }
    if (error instanceof AssistantToolError) return { isError: true, content: error.message };
    console.error(`[assistant] tool ${name} failed`, error);
    return { isError: true, content: UNANSWERED_RESULT };
  }
}
