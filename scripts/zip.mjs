/** Package the build for a manual install or a store upload. Requires `zip`. */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const source = join(root, 'dist', 'chrome');
const archive = join(root, 'dist', `efatura-activity-helper-${version}-chrome.zip`);

try {
  await run('zip', ['-q', '-r', archive, '.'], { cwd: source });
  console.log(`dist/efatura-activity-helper-${version}-chrome.zip`);
} catch (error) {
  console.error('could not zip chrome:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
