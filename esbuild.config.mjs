/**
 * One target: Chromium. The worker does every network read so the page never
 * receives a cross-origin request from the portal's own origin.
 */

import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, 'dist', 'chrome');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [
    { in: join(root, 'src/background.ts'), out: 'background' },
    { in: join(root, 'src/ui/content.ts'), out: 'content' },
    { in: join(root, 'src/ui/options.ts'), out: 'options' },
    { in: join(root, 'src/ui/popup.ts'), out: 'popup' },
  ],
  outdir,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome116'],
  legalComments: 'none',
  logLevel: 'warning',
  banner: {
    js: '/* e-Fatura Activity Helper — suggestions only; it never submits a form. */',
  },
});

await cp(join(root, 'public/content.css'), join(outdir, 'content.css'));
await cp(join(root, 'public/options.html'), join(outdir, 'options.html'));
await cp(join(root, 'public/popup.html'), join(outdir, 'popup.html'));
await cp(join(root, 'public/icons'), join(outdir, 'icons'), { recursive: true });
await cp(join(root, 'public/manifest.json'), join(outdir, 'manifest.json'));

const manifest = JSON.parse(await readFile(join(outdir, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('manifest must stay MV3');
if (manifest.version === '0.0.0') throw new Error('set a real version');

console.log('built dist/chrome');
