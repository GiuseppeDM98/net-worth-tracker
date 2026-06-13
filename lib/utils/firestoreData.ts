/**
 * Firestore write sanitization.
 *
 * DESIGN: Firestore rejects any document that contains an `undefined` value with
 * "Unsupported field value: undefined". The previous per-service helpers stripped
 * undefined only at the TOP level, which let an `undefined` nested inside an array
 * element (e.g. a subcategory `{ id, name, icon: undefined }`) or inside a nested
 * object slip through and crash the write. This module removes `undefined`
 * everywhere — recursing into arrays and plain objects — while leaving values that
 * Firestore understands untouched:
 *
 *   - `null` is preserved (a valid Firestore value; only `undefined` is illegal).
 *   - `Date`, `Timestamp`, and `FieldValue` sentinels (e.g. `deleteField()`,
 *     `serverTimestamp()`) are class instances, not plain objects, so they pass
 *     through unchanged instead of being recursed into and flattened to `{}`.
 *
 * The input is never mutated: arrays and plain objects are rebuilt as new copies.
 */

/**
 * Narrow a value to a plain object — one created by `{}`/`new Object()` or with a
 * null prototype. Class instances (Date, Firestore Timestamp/FieldValue, etc.)
 * return false so the deep clean leaves them intact.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively strip `undefined` so a value is safe to write to Firestore.
 *
 * Recurses into arrays (mapping each element) and plain objects (dropping keys
 * whose value is `undefined`, cleaning the rest). Non-plain objects (Date,
 * Timestamp, FieldValue) and primitives — including `null` — are returned as-is.
 *
 * @param value - The value to sanitize (object, array, or primitive)
 * @returns A new value of the same shape with every `undefined` removed
 */
export function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as unknown as T;
  }

  if (isPlainObject(value)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined) {
        cleaned[key] = removeUndefinedDeep(nested);
      }
    }
    return cleaned as T;
  }

  return value;
}
