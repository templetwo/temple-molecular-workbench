import { build } from 'esbuild';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'temple-tests-'));
try {
  const tests = (await readdir('tests')).filter((name) => name.endsWith('.test.ts')).sort();
  await build({
    entryPoints: tests.map((name) => join('tests', name)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: directory,
    outExtension: { '.js': '.mjs' },
    tsconfig: 'tsconfig.app.json',
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
  const result = spawnSync(
    process.execPath,
    ['--test', ...tests.map((name) => join(directory, name.replace(/\.ts$/, '.mjs')))],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
