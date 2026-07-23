/**
 * Start the local Firebase Emulator Suite (Auth + Firestore) with data persistence.
 *
 * Wraps `firebase emulators:start` so the emulator state SURVIVES restarts: it always exports on
 * exit, and imports the previous export when one exists. Net effect — you seed ONCE (`npm run
 * emulators:seed`), and the data (plus anything you created in the app) is reloaded on the next
 * start instead of resetting to empty.
 *
 * First run has no export yet → starts fresh (then seed it). To wipe and start clean, delete the
 * `.emulator-data` directory (gitignored). A tiny Node wrapper is used instead of an inline npm
 * script because the `--import` flag must be added conditionally (the CLI errors if the import
 * directory does not exist), and that check has to be cross-platform.
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const DATA_DIR = './.emulator-data';
const hasSavedData = existsSync(DATA_DIR);

const args = [
  'emulators:start',
  '--project',
  'demo-net-worth',
  '--only',
  'auth,firestore',
  `--export-on-exit=${DATA_DIR}`,
  ...(hasSavedData ? [`--import=${DATA_DIR}`] : []),
];

console.info(
  hasSavedData
    ? `[emulators] Importing saved data from ${DATA_DIR} — state persists across restarts.`
    : `[emulators] No saved data yet — starting fresh. Seed it once with \`npm run emulators:seed\`.`
);

// shell:true so the local node_modules/.bin/firebase(.cmd) resolves on both Windows and Unix.
const child = spawn(`firebase ${args.join(' ')}`, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
