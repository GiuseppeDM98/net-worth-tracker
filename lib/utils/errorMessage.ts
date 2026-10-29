/**
 * The error's own message, or the fallback when the thrown value is not an `Error`.
 *
 * A module-level function on purpose: the React Compiler skips a whole component that holds a
 * `?:`/`&&`/`??` inside a `try`/`catch` (AGENTS.md § Motion), and the one place every tile wants
 * this ternary is its `catch`.
 */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** «<subject>: <message>» for an Error, «<subject>.» otherwise — the same reason as `errorMessage`. */
export function failureWarning(err: unknown, subject: string): string {
  return err instanceof Error ? `${subject}: ${err.message}` : `${subject}.`;
}
