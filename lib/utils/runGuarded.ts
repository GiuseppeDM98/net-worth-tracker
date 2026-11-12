/**
 * A try/catch/finally at module level, for the page's and the views' async handlers: the React
 * Compiler refuses a `finally`, a `throw` and any conditional expression inside a component's own
 * try block, and these handlers have all three. `work` is the try block (its `return` is the
 * handler's), `onError` the catch, `onSettled` the finally — same order, same propagation.
 */
export async function runGuarded<T>(
  work: () => Promise<T>,
  onError: (error: unknown) => T,
  onSettled?: () => void,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return onError(error);
  } finally {
    onSettled?.();
  }
}
