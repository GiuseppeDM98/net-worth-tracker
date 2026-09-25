/**
 * Scalable read-only proxy — POST /api/broker/scalable/read.
 *
 * Runs one of the two whitelisted `sc` read commands on the hosting machine and returns the
 * parsed payload (positions or totals). Owner-scoped: the caller must own the account or hold
 * a grant over it. No credentials cross this route — the CLI session lives in the OS keyring
 * (`sc login`), and no request field ever reaches a command line.
 *
 * Body: { ownerId: string, command: 'holdings' | 'overview' | 'overnight' }
 *
 * Each command answers with its own parsed payload under its own key (`{ holdings, skipped }`,
 * `{ overview }`, `{ overnight }`); the client composes the plan from the three.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { parseOr400 } from '@/lib/server/validation';
import { runScalableReadCommand, ScalableCliError } from '@/lib/server/scalableCli';
import {
  parseScalableHoldingsJson,
  parseScalableOverviewJson,
  parseScalableOvernightJson,
  ScalableParseError,
} from '@/lib/utils/scalableImport';

const bodySchema = z.object({
  ownerId: z.string().min(1),
  command: z.enum(['holdings', 'overview', 'overnight']),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireFirebaseAuth(request);
  } catch (error) {
    return getApiAuthErrorResponse(error) ?? NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const validated = parseOr400(bodySchema, body);
  if (!validated.ok) return validated.response;

  try {
    await assertCanAccessAccount(decoded, validated.data.ownerId);
  } catch (error) {
    return (
      getApiAuthErrorResponse(error) ??
      NextResponse.json({ error: 'Accesso negato.' }, { status: 403 })
    );
  }

  try {
    const stdout = await runScalableReadCommand(validated.data.command);
    // One command, one PARSED PAYLOAD — never a plan. The plan is built once in the client, which
    // already holds the tracked assets; a per-command plan also read the user's assets per call
    // and the client silently read `res.holdings`/`res.overview` off a `{ plan }` envelope as
    // undefined, so positions arrived empty and the cash block never rendered.
    if (validated.data.command === 'holdings') {
      const { holdings, skipped } = parseScalableHoldingsJson(stdout);
      return NextResponse.json({ holdings, skipped });
    }
    if (validated.data.command === 'overnight') {
      const overnight = parseScalableOvernightJson(stdout);
      return NextResponse.json({ overnight });
    }
    const overview = parseScalableOverviewJson(stdout);
    return NextResponse.json({ overview });
  } catch (error) {
    if (error instanceof ScalableCliError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ScalableParseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error('[scalable/read] unexpected failure', error);
    return NextResponse.json({ error: 'Lettura non riuscita: riprova.' }, { status: 500 });
  }
}