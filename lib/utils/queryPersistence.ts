/**
 * How a persisted React Query client crosses IndexedDB and comes back with its dates intact.
 *
 * The readers hand the pages `Date` values (`toDate()` in the service, AGENTS.md § Firebase Dates),
 * and `JSON.stringify` turns a `Date` into a string that no page would recognise as a date again.
 * A reader can also still hand out a raw Firestore `Timestamp` (AGENTS.md § Firebase Dates: a typed
 * `Expense[]` did until 2026-09-18), or a plain `{ seconds, nanoseconds }` object when a Timestamp has
 * already been through a structured clone. All three are written as ONE tagged form and revived as
 * a `Date` — so a restored payload is never LESS typed than the live one, and a Timestamp that
 * slipped through comes back as the `Date` its type declared.
 *
 * Tagging by VALUE, not by a list of date fields per key: a field list would have to be kept in
 * step with every payload the allowlist grows to hold, and the field it forgets is the one the
 * page then reads as a string. Pure: no Firebase import — a Timestamp is recognised by its shape.
 */

/** The marker a date takes in storage. `__persisted` is a key no payload uses. */
const DATE_TAG = 'date';
const TAG_KEY = '__persisted';

interface TaggedDate {
  [TAG_KEY]: typeof DATE_TAG;
  iso: string;
}

interface TimestampShape {
  seconds: number;
  nanoseconds: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A Firestore `Timestamp` instance, recognised by its converter — no SDK import. */
function hasToDate(value: unknown): value is { toDate: () => Date } {
  return isRecord(value) && typeof value.toDate === 'function';
}

/**
 * A Timestamp that lost its prototype (a structured clone, a `JSON.parse` of the SDK's own
 * `toJSON`, which adds `type: 'timestamp'`): exactly the two numeric fields, that marker aside.
 */
function isTimestampShape(value: unknown): value is TimestampShape {
  if (!isRecord(value)) return false;
  if (typeof value.seconds !== 'number' || typeof value.nanoseconds !== 'number') return false;
  const keys = Object.keys(value).filter((key) => key !== 'type');
  return keys.length === 2 && (value.type === undefined || value.type === 'timestamp');
}

function isTaggedDate(value: unknown): value is TaggedDate {
  return isRecord(value) && value[TAG_KEY] === DATE_TAG && typeof value.iso === 'string';
}

function tagDate(date: Date): TaggedDate | null {
  // An invalid Date has no instant to keep: dropping it (→ `null`) beats storing "Invalid Date".
  if (Number.isNaN(date.getTime())) return null;
  return { [TAG_KEY]: DATE_TAG, iso: date.toISOString() };
}

/**
 * The `JSON.stringify` replacer. `this[key]` is the ORIGINAL value — `JSON.stringify` calls a
 * Date's `toJSON` before the replacer sees `value`, so the string in `value` is useless; the
 * holder still has the instance.
 */
export function persistReplacer(this: unknown, key: string, value: unknown): unknown {
  const original = isRecord(this) ? (this as Record<string, unknown>)[key] : value;
  if (original instanceof Date) return tagDate(original);
  if (hasToDate(original)) return tagDate(original.toDate());
  if (isTimestampShape(original)) {
    return tagDate(new Date(original.seconds * 1000 + Math.floor(original.nanoseconds / 1_000_000)));
  }
  return value;
}

/** The `JSON.parse` reviver: a tagged date becomes a `Date` again; everything else is untouched. */
export function persistReviver(_key: string, value: unknown): unknown {
  return isTaggedDate(value) ? new Date(value.iso) : value;
}

/** Write a value for the persister: dates and Timestamps tagged, the rest as JSON. */
export function serializeForPersist(value: unknown): string {
  return JSON.stringify(value, persistReplacer);
}

/** Read a value the persister wrote: every tagged date is a `Date`. */
export function deserializeFromPersist<T = unknown>(text: string): T {
  return JSON.parse(text, persistReviver) as T;
}
