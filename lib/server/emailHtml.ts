/**
 * The few HTML helpers the email builders share.
 *
 * `escapeHtml` lived inside `weeklyBudgetEmailService.ts` and was needed by
 * `monthlyEmailService.ts` the moment a user-entered name (a household member's) started
 * reaching the markup. An escaping function is the last thing that should exist in two copies:
 * the copy that drifts is the one that stops escaping.
 */

/**
 * Escapes the characters that would break out of HTML text when interpolating anything the user
 * typed — a note, a category name, a person's name.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
