/**
 * The page has stopped moving — the condition a fixed wait used to stand for (2026-11-26).
 *
 * Until that day 87 places of this folder slept a fixed time (`waitForTimeout`) before measuring:
 * «Apri tutte», then 600 ms, then the overflow; a dialog visible, then 400 ms, then its corner. A
 * sleep is long on a quiet machine (207 s of a 22-minute run, measured) and short on a loaded one,
 * which is where four workers put it. What each of them waited for is one of the three conditions
 * below, and the wait is now on the condition.
 *
 * `atRest`        nothing moves: no finite CSS animation or transition running on the scope (or on an
 *                 ancestor of it), no DOM mutation inside it (framer-motion writes inline styles,
 *                 Recharts attributes, a count-up text), its box, its scroll size and the page's
 *                 scroll offsets unchanged, no skeleton standing in for content, the fonts in — for
 *                 `QUIET_MS` and `QUIET_FRAMES` frames in a row. The quiet window is longer than the
 *                 gaps the app's motion has (a count-up starts 60 ms after its value, a stagger
 *                 steps every 80 ms): a reading between two steps is not rest.
 * `afterIdle`     the main thread has been idle once since the call, two painted frames later: every
 *                 effect of the last render has run, a chunk that arrived has been evaluated, and
 *                 an idle callback registered BEFORE the call has fired (`usePreloadWhenIdle` waits
 *                 at most 4 s; this one registers after it, with a longer ceiling). It is the
 *                 positive anchor of an absence — «had the page meant to ask, it has asked».
 * `settledBox`    the box of one element once it is at rest.
 *
 * A wait that stayed fixed says why where it stands: the motion specs sample a window of frames, and
 * the length of the window is the thing under test.
 *
 * On a timeout the error names what was still moving — the reason is the diagnosis.
 */
import type { Locator, Page } from '@playwright/test';

const QUIET_MS = 150;
const QUIET_FRAMES = 6;
const AT_REST_TIMEOUT_MS = 15_000;
/** Above `usePreloadWhenIdle`'s 4 s ceiling: registered after it, this callback cannot fire before it. */
const IDLE_CEILING_MS = 5_000;

export interface AtRestOptions {
  /** How long to wait for rest before failing with what was still moving. */
  timeout?: number;
  /**
   * `false` where a skeleton is on screen on purpose (a held chunk, a held read): by default a
   * visible `[data-slot="skeleton"]` inside the scope is «not at rest» — content is still due.
   */
  skeletons?: boolean;
}

interface AtRestArguments {
  quietMs: number;
  quietFrames: number;
  timeout: number;
  skeletons: boolean;
}

/** Runs in the page. Resolves with `null` at rest, or with the reason it never came to rest. */
function waitForRestInPage(scope: Element, { quietMs, quietFrames, timeout, skeletons }: AtRestArguments): Promise<string | null> {
  return new Promise((resolve) => {
    const describe = (node: Node | null): string => {
      if (!(node instanceof Element)) return node?.parentElement ? describe(node.parentElement) : 'a detached node';
      const id = node.id ? `#${node.id}` : '';
      const name = node.getAttribute('aria-label') ?? node.getAttribute('data-slot') ?? '';
      return `<${node.tagName.toLowerCase()}${id}${name ? ` "${name}"` : ''} class="${(node.getAttribute('class') ?? '').slice(0, 80)}">`;
    };

    let mutated: Node | null = null;
    const observer = new MutationObserver((records) => {
      mutated = records[records.length - 1].target;
    });
    observer.observe(scope, { subtree: true, childList: true, attributes: true, characterData: true });

    const scrollers = [scope, ...document.querySelectorAll('main')];
    const signature = (): string => {
      const box = scope.getBoundingClientRect();
      return [
        box.x,
        box.y,
        box.width,
        box.height,
        scope.scrollWidth,
        scope.scrollHeight,
        window.scrollX,
        window.scrollY,
        ...scrollers.map((scroller) => `${scroller.scrollLeft}:${scroller.scrollTop}`),
      ].join('|');
    };

    const running = (): string | null => {
      for (const animation of document.getAnimations()) {
        if (animation.playState !== 'running') continue;
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target;
        if (!effect || !target) continue;
        // A shimmer or a spinner never ends, and is not what a measure waits for.
        if (!Number.isFinite(Number(effect.getComputedTiming().endTime))) continue;
        if (scope.contains(target) || target.contains(scope)) return `an animation still running on ${describe(target)}`;
      }
      return null;
    };

    const skeleton = (): string | null => {
      if (!skeletons) return null;
      for (const node of scope.querySelectorAll('[data-slot="skeleton"]')) {
        if (node.checkVisibility()) return `a skeleton still on screen: ${describe(node)}`;
      }
      return null;
    };

    const started = performance.now();
    let quietSince = started;
    let frames = 0;
    let previous = signature();
    let reason = 'the first frames';

    const tick = () => {
      const now = performance.now();
      const current = signature();
      let moving: string | null = null;
      if (mutated) moving = `the DOM still changing at ${describe(mutated)}`;
      else if (current !== previous) moving = `the box or a scroll offset still changing (${previous} → ${current})`;
      else if (document.fonts.status === 'loading') moving = 'a font still loading';
      else moving = running() ?? skeleton();
      mutated = null;
      previous = current;

      if (moving) {
        reason = moving;
        quietSince = now;
        frames = 0;
      } else {
        frames++;
        if (frames >= quietFrames && now - quietSince >= quietMs) {
          observer.disconnect();
          resolve(null);
          return;
        }
      }
      if (now - started > timeout) {
        observer.disconnect();
        resolve(reason);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Resolves once nothing moves in the page (the whole document, its portalled dialogs included) or
 * in the element a locator names. Throws, naming what still moved, if rest never comes.
 */
export async function atRest(target: Page | Locator, options: AtRestOptions = {}): Promise<void> {
  const scope: Locator = 'locator' in target && 'goto' in target ? (target as Page).locator('body') : (target as Locator);
  const timeout = options.timeout ?? AT_REST_TIMEOUT_MS;
  const reason = await scope.evaluate(waitForRestInPage, {
    quietMs: QUIET_MS,
    quietFrames: QUIET_FRAMES,
    timeout,
    skeletons: options.skeletons ?? true,
  });
  if (reason !== null) throw new Error(`atRest: not at rest after ${timeout} ms — ${reason}`);
}

/**
 * Resolves once the main thread has been idle after two painted frames: the effects of the last
 * render have run, and any idle callback registered before this call has fired.
 */
export async function afterIdle(page: Page): Promise<void> {
  await page.evaluate(
    (ceiling) =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: ceiling });
            else window.setTimeout(resolve, 0);
          }),
        );
      }),
    IDLE_CEILING_MS,
  );
}

/**
 * A scroller's `scrollTop` once it has held still for the quiet window — while the content under it
 * may still be growing (a stream being written). Throws if the offset never holds: a page that is
 * being scrolled again and again is the failure a caller is looking for.
 */
export async function settledScrollTop(scroller: Locator, timeout = AT_REST_TIMEOUT_MS): Promise<number> {
  const top = await scroller.evaluate(
    (node, { quietMs, quietFrames, limit }) =>
      new Promise<number | null>((resolve) => {
        const started = performance.now();
        let quietSince = started;
        let frames = 0;
        let previous = node.scrollTop;
        const tick = () => {
          const now = performance.now();
          if (node.scrollTop !== previous) {
            previous = node.scrollTop;
            quietSince = now;
            frames = 0;
          } else if (++frames >= quietFrames && now - quietSince >= quietMs) {
            resolve(previous);
            return;
          }
          if (now - started > limit) {
            resolve(null);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { quietMs: QUIET_MS, quietFrames: QUIET_FRAMES, limit: timeout },
  );
  if (top === null) throw new Error(`settledScrollTop: the scroll offset never held still in ${timeout} ms`);
  return top;
}

/** The element's box once it has stopped moving (never `null`: the element is expected on screen). */
export async function settledBox(locator: Locator, options: AtRestOptions = {}): Promise<{ x: number; y: number; width: number; height: number }> {
  await atRest(locator, options);
  const box = await locator.boundingBox();
  if (!box) throw new Error('settledBox: the element has no box');
  return box;
}
