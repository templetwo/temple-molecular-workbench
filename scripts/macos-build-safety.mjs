import { lstat, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';

/** The packaged health response must identify the version shown by macOS. */
export function assertAppVersion(packageVersion, serverVersion) {
  if (typeof packageVersion !== 'string' || !packageVersion || packageVersion !== serverVersion) {
    throw new Error(`App version mismatch: package.json=${String(packageVersion)}, serve.mjs APP_VERSION=${String(serverVersion)}. Update them together before bundling.`);
  }
}

/** Remove only the two empty directories left after all published-file renames. */
export async function cleanupPublishedStage(stage, outputRoot) {
  const root = path.resolve(outputRoot);
  const target = path.resolve(stage);
  if (path.dirname(target) !== root || !/^\.temple-build-[A-Za-z0-9]{6}$/.test(path.basename(target))) {
    throw new Error('Refusing cleanup outside an exact generated macOS staging directory.');
  }
  const payload = path.join(target, 'Temple Lab');
  for (const directory of [root, target, payload]) {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('Refusing cleanup through a symlink or non-directory.');
    }
  }
  const entries = await readdir(target);
  if (entries.length !== 1 || entries[0] !== 'Temple Lab' || (await readdir(payload)).length !== 0) {
    throw new Error('Refusing cleanup of a staging directory that still contains files.');
  }
  // Never recurse: unexpected files or a concurrent change make rmdir fail safely.
  // Recovery backups live in release/.previous and are never considered here.
  await rmdir(payload);
  await rmdir(target);
}
