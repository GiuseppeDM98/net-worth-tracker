/**
 * The guided tour's windows (WORKFLOW.md § 2, obligation 5): opens one or more VISIBLE Chromium windows on the app,
 * already signed in, and EXITS BY ITSELF — when the owner closes every window, when the browser goes, or after a time
 * limit. Never an endless wait: closing a driven window closes the PAGE, not the browser, so `disconnected` alone
 * would never fire (2026-11-09, a hundred Chromium found alive hours after two sessions closed).
 *
 * The file is named `collaudo-*` on purpose: `node ~/.claude/processi-collaudo.mjs` counts the live trees of
 * `scripts/collaudo-*`, so a window left open is still found and closed by the session gate.
 *
 * Run it directly (the usual way; options after `--`):
 *   npx tsx scripts/collaudo-finestre.mts --email=test@example.com --url=/dashboard/assets [--url=/dashboard/assets]
 *     [--title="Finestra 1"] [--title="Finestra 2"] [--base=http://localhost:3000] [--minutes=30] [--width=390]
 * Two `--url` open two windows of ONE signed-in session (the same account in two tabs — a comparison); each window's
 * tab title starts with its `--title` (default «Finestra N»), so the owner can tell them apart.
 *
 * `--width=390` (optionally `--height=844`) opens the windows at a FIXED viewport: a phone's width stays that width
 * even if the owner maximises the window (without it the window follows its real size, `viewport: null`).
 * `--chiudi` closes the windows still alive (every `collaudo-finestre` process tree) and exits: `taskkill` on
 * Windows, where Git Bash has no `pkill`; `pkill -TERM -f` elsewhere.
 *
 * Or import it from a throwaway script: `await openTourWindows({ email, windows: [{ url, title }] })`.
 * Password: `test1234`, every emulator fixture's (WORKFLOW.md § 3). Emulators only: refuses a non-local base URL.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';

export interface TourWindow {
  /** Path or absolute URL on the base. */
  url: string;
  /** Prefix of the tab title, so two windows of a comparison can be named. */
  title?: string;
}

export interface TourOptions {
  email: string;
  password?: string;
  windows: TourWindow[];
  base?: string;
  /** The time limit, after which the windows close by themselves. */
  minutes?: number;
  /** A fixed viewport width in px (a phone: 390); without it the window follows its real size. */
  width?: number;
  /** The fixed viewport's height; only read with `width`. */
  height?: number;
}

const DEFAULT_BASE = 'http://localhost:3000';
const DEFAULT_MINUTES = 30;

/** Keeps «<title> · » in front of the page's own title, which the app rewrites on every navigation. */
function titlePrefixScript(prefix: string): string {
  return `(() => {
    const prefix = ${JSON.stringify(`${prefix} · `)};
    const apply = () => { if (!document.title.startsWith(prefix)) document.title = prefix + document.title; };
    setInterval(apply, 500);
  })();`;
}

async function signIn(page: Page, base: string, email: string, password: string): Promise<void> {
  await page.goto(new URL('/login', base).toString());
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** Resolves when every page is closed, the browser goes, or the limit passes — whichever comes first. */
function untilDone(browser: Browser, pages: Page[], minutes: number): Promise<string> {
  return new Promise((resolve) => {
    let open = pages.length;
    for (const page of pages) {
      page.on('close', () => {
        open -= 1;
        if (open === 0) resolve('finestre chiuse');
      });
    }
    browser.on('disconnected', () => resolve('browser chiuso'));
    setTimeout(() => resolve(`limite di ${minutes} minuti`), minutes * 60_000).unref();
  });
}

export async function openTourWindows(options: TourOptions): Promise<string> {
  const base = options.base ?? DEFAULT_BASE;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
    throw new Error(`Solo il server locale degli emulatori, non ${base}`);
  }
  const minutes = options.minutes ?? DEFAULT_MINUTES;
  const browser = await chromium.launch({ headless: false });
  const viewport = options.width ? { width: options.width, height: options.height ?? 844 } : null;
  const stop = () => void browser.close().finally(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const context = await browser.newContext({ viewport });
    const pages: Page[] = [];
    for (const [index, window] of options.windows.entries()) {
      const page = await context.newPage();
      await page.addInitScript(titlePrefixScript(window.title ?? `Finestra ${index + 1}`));
      // The first window signs in; the others share its session (one context).
      if (index === 0) await signIn(page, base, options.email, options.password ?? 'test1234');
      await page.goto(new URL(window.url, base).toString());
      pages.push(page);
    }
    console.log(`[collaudo-finestre] ${pages.length} finestra/e aperte come ${options.email}; si chiudono da sole entro ${minutes} min`);
    return await untilDone(browser, pages, minutes);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Closes every live `collaudo-finestre` tree except this process; the platform's own tool (no `pkill` on Windows). */
export function closeTourWindows(): number {
  if (process.platform === 'win32') {
    const script =
      "$all = Get-CimInstance Win32_Process; $keep = @(" +
      process.pid +
      "); $cur = " +
      process.pid +
      "; while ($cur) { $p = $all | Where-Object { $_.ProcessId -eq $cur }; if (-not $p) { break }; $cur = $p.ParentProcessId; $keep += $cur }; " +
      "$n = 0; $all | Where-Object { $_.CommandLine -match 'collaudo-finestre' -and $_.Name -in 'node.exe','cmd.exe' -and $keep -notcontains $_.ProcessId } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null; $n++ }; $n";
    return Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()) || 0;
  }
  try {
    execFileSync('pkill', ['-TERM', '-f', 'scripts/collaudo-finestre.mts']);
    return 1;
  } catch {
    return 0;
  }
}

// CLI: run directly with tsx. `pathToFileURL`, not `file://` + argv[1]: on Windows the URL is `file:///C:/…` and
// the path `C:\…`, so the plain concatenation never matched and the script exited 0 with no window (2026-11-15).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = (name: string) =>
    process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
  if (process.argv.includes('--chiudi')) {
    console.log(`[collaudo-finestre] chiusi ${closeTourWindows()} processi`);
    process.exit(0);
  }
  const [email] = values('email');
  const urls = values('url');
  if (!email || urls.length === 0) {
    console.error('Uso: npx tsx scripts/collaudo-finestre.mts --email=<fixture> --url=<path> [--url=…] [--title=…] [--base=…] [--minutes=N] [--width=PX] [--height=PX] | --chiudi');
    process.exit(1);
  }
  const titles = values('title');
  const reason = await openTourWindows({
    email,
    windows: urls.map((url, i) => ({ url, title: titles[i] })),
    base: values('base')[0],
    minutes: values('minutes')[0] ? Number(values('minutes')[0]) : undefined,
    width: values('width')[0] ? Number(values('width')[0]) : undefined,
    height: values('height')[0] ? Number(values('height')[0]) : undefined,
  });
  console.log(`[collaudo-finestre] fine: ${reason}`);
  process.exit(0);
}
