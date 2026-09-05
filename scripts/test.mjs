import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'temple-tests-'));
try {
  const output = join(directory, 'chemistry.test.mjs');
  await build({
    entryPoints: ['tests/chemistry.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: output,
    tsconfig: 'tsconfig.app.json',
  });
  const result = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
