/**
 * One Firestore project per Playwright worker — and never outside the emulators.
 *
 * The whole E2E run gives every worker its own Firestore project (lib/firebase/emulatorProject.ts).
 * The override lives in the two modules the app creates its Firebase apps in, so what this file
 * holds is the half that matters to production: without the emulator flag (the browser) and without
 * FIRESTORE_EMULATOR_HOST (the server) the project is the configured one, whatever port serves the
 * page and whatever `E2E_FIRESTORE_PROJECT` says. The two modules are imported for real, with only
 * the Firebase SDKs replaced by recorders.
 *
 * Seen red on 2026-11-26: the client reading the port without the flag (3 red), the Admin module
 * reading `E2E_FIRESTORE_PROJECT` without the emulator host (2 red).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminFirestoreProjectOverride,
  clientProjectId,
  E2E_BASE_PORT,
  workerIndexOfPort,
  workerProjectId,
} from '@/lib/firebase/emulatorProject';

describe('the rule, as pure functions', () => {
  it('names worker 0 the base project and worker N `<base>-wN`', () => {
    expect(workerProjectId('demo-net-worth', 0)).toBe('demo-net-worth');
    expect(workerProjectId('demo-net-worth', 3)).toBe('demo-net-worth-w3');
  });

  it('reads the worker from the port, and 0 from any port that is not a worker’s', () => {
    expect(E2E_BASE_PORT).toBe(3100);
    expect(workerIndexOfPort('3100')).toBe(0);
    expect(workerIndexOfPort('3101')).toBe(1);
    expect(workerIndexOfPort('3103')).toBe(3);
    // The tour server, the benchmark's server, a default port, no port at all (the server side).
    expect(workerIndexOfPort('3000')).toBe(0);
    expect(workerIndexOfPort('3200')).toBe(0);
    expect(workerIndexOfPort('')).toBe(0);
    expect(workerIndexOfPort(undefined)).toBe(0);
    expect(workerIndexOfPort('31o1')).toBe(0);
  });

  it('gives the browser the worker’s project only with the emulator flag', () => {
    expect(clientProjectId('demo-net-worth', true, '3102')).toBe('demo-net-worth-w2');
    expect(clientProjectId('demo-net-worth', true, '3100')).toBe('demo-net-worth');
    expect(clientProjectId('demo-net-worth', true, undefined)).toBe('demo-net-worth');
    expect(clientProjectId('real-project', false, '3102')).toBe('real-project');
    expect(clientProjectId(undefined, true, '3102')).toBeUndefined();
  });

  it('gives the Admin SDK a second project only under the emulator host', () => {
    expect(adminFirestoreProjectOverride('127.0.0.1:8080', 'demo-net-worth-w2', 'demo-net-worth')).toBe('demo-net-worth-w2');
    expect(adminFirestoreProjectOverride('127.0.0.1:8080', 'demo-net-worth', 'demo-net-worth')).toBeUndefined();
    expect(adminFirestoreProjectOverride('127.0.0.1:8080', undefined, 'demo-net-worth')).toBeUndefined();
    expect(adminFirestoreProjectOverride(undefined, 'demo-net-worth-w2', 'real-project')).toBeUndefined();
    expect(adminFirestoreProjectOverride('', 'demo-net-worth-w2', 'real-project')).toBeUndefined();
  });
});

// ── The browser's module, imported for real ──────────────────────────────────────────────────────

const clientApp = vi.hoisted(() => ({
  initializeApp: vi.fn((config: { projectId?: string }) => ({ options: config })),
}));

vi.mock('firebase/app', () => ({
  initializeApp: clientApp.initializeApp,
  getApps: () => [],
  getApp: () => ({}),
}));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), connectAuthEmulator: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  initializeFirestore: () => ({}),
  connectFirestoreEmulator: vi.fn(),
  memoryLocalCache: () => ({}),
  persistentLocalCache: () => ({}),
  persistentMultipleTabManager: () => ({}),
}));

// ── The server's module, imported for real ───────────────────────────────────────────────────────

const adminSdk = vi.hoisted(() => {
  const apps: Array<{ name: string; options: { projectId?: string } }> = [];
  return {
    apps,
    initializeApp: vi.fn((options: { projectId?: string }, name = '[DEFAULT]') => {
      const app = { name, options };
      apps.push(app);
      return app;
    }),
    getFirestore: vi.fn((app: { name: string }) => ({ app })),
    getAuth: vi.fn((app: { name: string }) => ({ app })),
  };
});

vi.mock('firebase-admin/app', () => ({
  initializeApp: adminSdk.initializeApp,
  getApps: () => adminSdk.apps,
  cert: (value: unknown) => value,
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: adminSdk.getAuth }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: adminSdk.getFirestore }));

/** A page served on a worker's port, the way `window.location.port` reads there. */
function serveOnPort(port: string): void {
  vi.stubGlobal('window', { location: { port } });
}

beforeEach(() => {
  vi.resetModules();
  clientApp.initializeApp.mockClear();
  adminSdk.apps.length = 0;
  adminSdk.initializeApp.mockClear();
  adminSdk.getFirestore.mockClear();
  adminSdk.getAuth.mockClear();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lib/firebase/config.ts — the browser', () => {
  it('a production build keeps its project on a worker’s port', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'real-project');
    vi.stubEnv('NEXT_PUBLIC_USE_FIREBASE_EMULATOR', '');
    serveOnPort('3102');

    await import('@/lib/firebase/config');

    expect(clientApp.initializeApp).toHaveBeenCalledTimes(1);
    expect(clientApp.initializeApp.mock.calls[0][0].projectId).toBe('real-project');
  });

  it('only the exact flag value turns the override on', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'real-project');
    vi.stubEnv('NEXT_PUBLIC_USE_FIREBASE_EMULATOR', 'false');
    serveOnPort('3102');

    await import('@/lib/firebase/config');

    expect(clientApp.initializeApp.mock.calls[0][0].projectId).toBe('real-project');
  });

  it('on the emulators the page of worker 2 reads the project of worker 2', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'demo-net-worth');
    vi.stubEnv('NEXT_PUBLIC_USE_FIREBASE_EMULATOR', 'true');
    serveOnPort('3102');

    await import('@/lib/firebase/config');

    expect(clientApp.initializeApp.mock.calls[0][0].projectId).toBe('demo-net-worth-w2');
  });

  it('on the emulators the tour server and worker 0 keep the base project', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'demo-net-worth');
    vi.stubEnv('NEXT_PUBLIC_USE_FIREBASE_EMULATOR', 'true');
    serveOnPort('3000');

    await import('@/lib/firebase/config');

    expect(clientApp.initializeApp.mock.calls[0][0].projectId).toBe('demo-net-worth');
  });
});

describe('lib/firebase/admin.ts — the server', () => {
  it('with real credentials E2E_FIRESTORE_PROJECT is inert: one app, Firestore on it', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_KEY', JSON.stringify({ project_id: 'real-project' }));
    vi.stubEnv('E2E_FIRESTORE_PROJECT', 'demo-net-worth-w2');

    const admin = await import('@/lib/firebase/admin');

    expect(adminSdk.apps).toHaveLength(1);
    expect(adminSdk.apps[0].name).toBe('[DEFAULT]');
    expect(adminSdk.getFirestore).toHaveBeenCalledWith(admin.default);
    expect(adminSdk.getAuth).toHaveBeenCalledWith(admin.default);
  });

  it('on the emulators Firestore moves to the worker’s project and Auth stays on the base one', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
    vi.stubEnv('GCLOUD_PROJECT', 'demo-net-worth');
    vi.stubEnv('E2E_FIRESTORE_PROJECT', 'demo-net-worth-w2');

    const admin = await import('@/lib/firebase/admin');

    expect(adminSdk.apps.map((app) => [app.name, app.options.projectId])).toEqual([
      ['[DEFAULT]', 'demo-net-worth'],
      ['e2e-worker-firestore', 'demo-net-worth-w2'],
    ]);
    expect(adminSdk.getAuth).toHaveBeenCalledWith(admin.default);
    expect(adminSdk.getFirestore).toHaveBeenCalledWith(adminSdk.apps[1]);
  });

  it('on the emulators without the variable — the tour server, worker 0 — there is one app', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
    vi.stubEnv('GCLOUD_PROJECT', 'demo-net-worth');
    vi.stubEnv('E2E_FIRESTORE_PROJECT', '');

    const admin = await import('@/lib/firebase/admin');

    expect(adminSdk.apps).toHaveLength(1);
    expect(adminSdk.getFirestore).toHaveBeenCalledWith(admin.default);
  });
});
