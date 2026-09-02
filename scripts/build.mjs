/**
 * ClipPiP ビルドスクリプト
 */
import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  absWorkingDir: root,
  entryPoints: {
    'service-worker': 'src/background/service-worker.ts',
    content: 'src/content/content.ts',
    popup: 'src/popup/popup.ts',
    helper: 'src/helper/helper.ts',
    permission: 'src/permission/permission.ts',
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: ['chrome116'],
  platform: 'browser',
  charset: 'utf8',
  legalComments: 'none',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

/** public/ は加工せず dist へ出すファイルの置き場。 */
async function copyStaticAssets() {
  await cp(path.join(root, 'public'), outdir, { recursive: true });
  await cp(path.join(root, 'src', 'popup', 'popup.html'), path.join(outdir, 'popup.html'));
  await cp(path.join(root, 'src', 'popup', 'popup.css'), path.join(outdir, 'popup.css'));
  // helper.html と permission.html は popup.css を共有する
  await cp(path.join(root, 'src', 'helper', 'helper.html'), path.join(outdir, 'helper.html'));
  await cp(
    path.join(root, 'src', 'permission', 'permission.html'),
    path.join(outdir, 'permission.html'),
  );
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyStaticAssets();

if (watch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log('[ClipPiP] watching for changes... (Ctrl+C to stop)');
} else {
  await esbuild.build(buildOptions);
  console.log(`[ClipPiP] build complete -> ${path.relative(root, outdir)}`);
}
