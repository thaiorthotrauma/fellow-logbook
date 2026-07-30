// Rebuilds both usage guides end to end: start the harness, capture the app
// figures, run the app's own PDF export, prepare the assets, check the page
// fit, and render the two PDFs into docs/.
//
//   node docs/guides/tools/build.mjs
//
// See ../README.md for the one-off prerequisites.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { HARNESS, REPO } from './paths.mjs';

function run(cmd, args, label) {
  return new Promise((resolveRun, reject) => {
    console.log(`\n── ${label} ──`);
    const child = spawn(cmd, args, { cwd: REPO, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolveRun() : reject(new Error(`${label} failed (exit ${code})`))));
  });
}

async function waitForHarness(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HARNESS);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`harness did not come up at ${HARNESS}`);
}

console.log('── starting harness ──');
// Spawned in its own process group, and its output kept off this process's
// stdio: killing an `npx` wrapper leaves the real vite running, and an inherited
// pipe held open by a surviving child stops this script from ever returning to
// the shell.
const viteBin = resolve(REPO, 'node_modules/.bin/vite');
const vite = spawn(viteBin, ['--config', 'vite.guide.config.ts'], {
  cwd: REPO,
  stdio: ['ignore', 'ignore', 'pipe'],
  detached: true,
});
let viteStderr = '';
vite.stderr.on('data', chunk => (viteStderr += chunk));

try {
  await waitForHarness().catch(err => {
    if (viteStderr) console.error(viteStderr);
    throw err;
  });
  console.log(`harness up at ${HARNESS}`);

  await run('node', ['docs/guides/tools/capture.mjs'], 'capturing app figures');
  await run('node', ['docs/guides/tools/export-pdfs.mjs'], 'running the in-app PDF export');
  await run('python3', ['docs/guides/tools/prepare-assets.py'], 'preparing fonts and figures');
  await run('node', ['docs/guides/tools/measure.mjs'], 'checking page fit');
  await run('node', ['docs/guides/tools/render.mjs'], 'rendering the guides');
  console.log('\nDone.');
} finally {
  // Negative pid: the whole group, so vite itself goes down with the wrapper.
  try {
    process.kill(-vite.pid, 'SIGTERM');
  } catch {
    vite.kill('SIGTERM');
  }
}
