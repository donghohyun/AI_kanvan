import { rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// 운영 빌드에 이전 sourcemap이 섞이지 않게 비운다.
if (production) rmSync('dist', { recursive: true, force: true });

const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const contexts = await Promise.all([
  esbuild.context({
    ...common,
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  }),
  esbuild.context({
    ...common,
    entryPoints: ['src/hook/hook.ts'],
    outfile: 'dist/hook.js',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
  }),
  esbuild.context({
    ...common,
    entryPoints: ['src/webview/main.tsx'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
  }),
]);

if (watch) {
  // 세 번들을 모두 빌드한 뒤 한 줄로 알린다. F5 실행 전 작업(.vscode/tasks.json)이 이 줄을 기다린다.
  await Promise.all(contexts.map((ctx) => ctx.rebuild().catch(() => undefined)));
  console.log('[watch] initial build finished');
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
