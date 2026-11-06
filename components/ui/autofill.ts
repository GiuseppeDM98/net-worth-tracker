/**
 * No autofill on the app's own fields (owner, 2026-11-06).
 *
 * An amount, a name, a note or a date is typed fresh every time; the browser's list of values
 * typed before, and the icon a password manager plants in any field it fancies, only cover the
 * field on a phone and the dropdown under it on a desktop. `Input` and `Textarea` spread these by
 * default, a raw `<input>`/`<textarea>` spreads them by hand, and every form carries
 * `autoComplete="off"` too (the attribute a browser reads for a field without its own) —
 * `__tests__/fieldAutocomplete.test.ts` holds the list.
 *
 * Login and Registrazione are the ONE exception: their fields pass `autoComplete="email"` /
 * `"current-password"` / `"new-password"` on purpose, which is what a password manager reads to
 * offer the credentials; the spread sits BEFORE the caller's props, so an explicit value wins.
 *
 * Standard attributes only: Chrome ignores `off` on a field it recognises as part of an address
 * or a name, and the owner chose not to answer that with a non-standard token.
 */
export const NO_AUTOFILL_ATTRIBUTES = {
  autoComplete: 'off',
  /** 1Password, LastPass and Bitwarden each read their own opt-out. */
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': '',
} as const;
