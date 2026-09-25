/**
 * Local `sc` CLI runner — the server side of the Scalable read-only bridge.
 *
 * Runs ONLY the three whitelisted read commands (`broker holdings/overview --json` and
 * `overnight --json`) through
 * `execFile` (no shell, fixed argv — no caller input ever reaches the command line) on the
 * machine hosting the app. That is why this works on a local run and degrades on Vercel:
 * `sc login` lives in the OS keyring of the machine the user sits at, and only there.
 *
 * `overnight` is the interest-bearing «Deposito non vincolato»: a SEPARATE balance from the
 * broker's cash residual, so the two never collapse into one figure.
 *
 * No tokens are handled here: the CLI owns its own session (`sc login`, ideally with
 * `--local-read-only`). This module only collects stdout and translates failures into
 * Italian, user-facing errors.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ScalableReadCommand = 'holdings' | 'overview' | 'overnight';

/** The complete read surface: nothing outside these three argv arrays can ever run. */
const READ_COMMAND_ARGS: Record<ScalableReadCommand, string[]> = {
  holdings: ['broker', 'holdings', '--json'],
  overview: ['broker', 'overview', '--json'],
  overnight: ['overnight', '--json'],
};

export class ScalableCliError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ScalableCliError';
    this.status = status;
  }
}

/** Override the binary location with `SCALABLE_CLI_PATH`; defaults to `sc` on PATH. */
export function scalableCliPath(): string {
  const configured = process.env.SCALABLE_CLI_PATH?.trim();
  return configured && configured !== '' ? configured : 'sc';
}

function isLoginFailure(stderr: string): boolean {
  return /not logged in|login|unauthori|session|auth/i.test(stderr);
}

/**
 * The CLI exits 0 even when the broker call failed (`{"ok":false,...}`) — without this,
 * a dead session surfaces as a generic 502 parse error instead of the login prompt.
 */
function assertBrokerOk(stdout: string): void {
  let doc: unknown;
  try {
    doc = JSON.parse(stdout);
  } catch {
    return; // Not JSON — leave it to the row/overview parser to report.
  }
  if (
    typeof doc === 'object' &&
    doc !== null &&
    (doc as Record<string, unknown>)['ok'] === false
  ) {
    throw new ScalableCliError(
      401,
      'Sessione Scalable scaduta o assente: esegui `sc login` nel terminale (consigliato: `sc login --local-read-only`) e riprova.'
    );
  }
}

/**
 * Run one whitelisted READ command and return its stdout.
 *
 * @throws ScalableCliError 503 when the binary is missing, 401 when the CLI session is
 * gone (refresh with `sc login`), 504 on timeout, 502 on any other broker failure.
 */
export async function runScalableReadCommand(command: ScalableReadCommand): Promise<string> {
  const bin = scalableCliPath();
  try {
    const { stdout } = await execFileAsync(bin, READ_COMMAND_ARGS[command], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    assertBrokerOk(stdout);
    return stdout;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
    if (err?.code === 'ENOENT') {
      throw new ScalableCliError(
        503,
        'Comando `sc` non trovato su questa macchina: installalo ed esegui `sc login`, oppure incolla l’output qui sotto a mano.'
      );
    }
    if (err?.killed) {
      throw new ScalableCliError(504, 'La lettura da Scalable ha impiegato troppo tempo: riprova.');
    }
    const stderr = typeof err?.stderr === 'string' ? err.stderr : '';
    if (isLoginFailure(stderr)) {
      throw new ScalableCliError(
        401,
        'Sessione Scalable scaduta o assente: esegui `sc login` nel terminale (consigliato: `sc login --local-read-only`) e riprova.'
      );
    }
    const detail = stderr.trim().slice(0, 300);
    throw new ScalableCliError(
      502,
      detail !== '' ? `Scalable ha risposto con un errore: ${detail}` : 'Lettura da Scalable non riuscita: riprova.'
    );
  }
}
