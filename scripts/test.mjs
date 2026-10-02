import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-tests-'));
const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(process.execPath, [vitestEntry, 'run', '--maxWorkers=1'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DATA_DIR: testDataDir },
});

const cleanup = () => fs.rmSync(testDataDir, { recursive: true, force: true });
child.once('error', error => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  cleanup();
  process.exitCode = signal ? 1 : code ?? 1;
});
