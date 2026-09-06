import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from './serve.mjs';
import { assertAppVersion, cleanupPublishedStage } from './macos-build-safety.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'packaging', 'macos');
const outputRoot = path.join(projectRoot, 'release');
const GENERATOR = 'temple-lab-macos-builder/v1';

function run(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`);
  return result.stdout;
}
async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}
async function requireFile(target, hint) {
  if (!(await exists(target)) || !(await stat(target)).isFile()) throw new Error(`${hint}\nMissing file: ${target}`);
}
function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function fill(template, variables) {
  return template.replace(/__([A-Z_]+)__/g, (match, key) => variables[key] ?? match);
}
async function sha256(target) {
  return createHash('sha256').update(await readFile(target)).digest('hex');
}
async function verifyDistTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`The production build contains a symlink and is not self-contained: ${target}`);
    if (entry.isDirectory()) await verifyDistTree(target);
    else if (!entry.isFile()) throw new Error(`Unexpected non-file in the production build: ${target}`);
  }
}
async function locateNodeLicense(runtime) {
  const prefix = path.dirname(path.dirname(runtime));
  const candidates = [
    process.env.TEMPLE_NODE_LICENSE,
    path.join(prefix, 'LICENSE'),
    path.join(prefix, 'LICENSE.txt'),
    path.join(prefix, 'share', 'doc', 'node', 'LICENSE'),
    path.join(prefix, 'share', 'doc', 'nodejs', 'LICENSE'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    const text = await readFile(candidate, 'utf8');
    if (text.includes('Node.js') && text.includes('Permission is hereby granted') && text.includes('V8') && text.length > 20_000) return candidate;
  }
  throw new Error(`The complete license for Node.js ${process.versions.node} was not found. Set TEMPLE_NODE_LICENSE to that runtime's original LICENSE, including its third-party notices.`);
}
async function copyFrontendNotices(destination) {
  const lock = JSON.parse(await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'));
  await mkdir(destination, { recursive: true });
  const lines = ['# Frontend dependency notices', '', 'Production dependency license files copied from the installed packages. Bundled JavaScript also retains its original legal comments.', ''];
  let count = 0;
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (!location.startsWith('node_modules/') || entry.dev) continue;
    const packageRoot = path.resolve(projectRoot, location);
    if (!packageRoot.startsWith(`${path.join(projectRoot, 'node_modules')}${path.sep}`)) throw new Error(`Unsafe package path in lockfile: ${location}`);
    const packageFile = path.join(packageRoot, 'package.json');
    if (!(await exists(packageFile))) continue; // An optional dependency may target a different platform.
    const metadata = JSON.parse(await readFile(packageFile, 'utf8'));
    const folder = `${metadata.name}-${metadata.version}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const packageDestination = path.join(destination, folder);
    await mkdir(packageDestination, { recursive: true });
    const notices = (await readdir(packageRoot)).filter((name) => /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(name));
    for (const name of notices) {
      const notice = path.join(packageRoot, name);
      if ((await lstat(notice)).isSymbolicLink()) continue;
      await cp(notice, path.join(packageDestination, name), { recursive: true, dereference: false });
    }
    await writeFile(path.join(packageDestination, 'package-notice.json'), `${JSON.stringify({ name: metadata.name, version: metadata.version, license: metadata.license ?? 'See package notices', homepage: metadata.homepage, repository: metadata.repository }, null, 2)}\n`);
    lines.push(`- ${metadata.name} ${metadata.version}: ${typeof metadata.license === 'string' ? metadata.license : 'see package notices'} (${folder}/)`);
    count += 1;
  }
  await writeFile(path.join(destination, 'INDEX.md'), `${lines.join('\n')}\n`);
  return count;
}
async function preserveExistingOutputs(names) {
  const existing = [];
  for (const name of names) if (await exists(path.join(outputRoot, name))) existing.push(name);
  if (!existing.length) return null;
  const marker = path.join(outputRoot, 'bundle-manifest.json');
  let previous;
  try { previous = JSON.parse(await readFile(marker, 'utf8')); } catch { /* A foreign artifact must not be moved. */ }
  if (previous?.generatedBy !== GENERATOR) throw new Error('release/ already contains output without this builder’s ownership marker. Move it aside before building.');
  for (const name of existing) {
    const info = await lstat(path.join(outputRoot, name));
    if (info.isSymbolicLink()) throw new Error(`Refusing to replace a symlink: release/${name}`);
  }
  if (existing.includes('Temple Lab.app')) {
    const appMarker = JSON.parse(await readFile(path.join(outputRoot, 'Temple Lab.app', 'Contents', 'Resources', 'bundle-manifest.json'), 'utf8'));
    if (appMarker.generatedBy !== GENERATOR) throw new Error('The existing Temple Lab.app was not created by this builder.');
  }
  const previousRoot = path.join(outputRoot, '.previous');
  await mkdir(previousRoot, { recursive: true });
  const backup = await mkdtemp(path.join(previousRoot, 'build-'));
  for (const name of existing) await rename(path.join(outputRoot, name), path.join(backup, name));
  return backup;
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Build this macOS app on a Mac. Other operating systems are not packaged by this script.');
  if (!['arm64', 'x64'].includes(process.arch)) throw new Error(`Unsupported macOS runtime architecture: ${process.arch}`);
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Building requires Node.js 22.12 or newer.');
  const metadata = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assertAppVersion(metadata.version, APP_VERSION);
  const runtime = await realpath(process.execPath);
  const nodeLicense = await locateNodeLicense(runtime);
  const icon = path.join(sourceRoot, 'AppIcon.icns');
  const server = path.join(projectRoot, 'scripts', 'serve.mjs');
  await requireFile(path.join(projectRoot, 'dist', 'index.html'), 'Run npm run build before bundling.');
  await requireFile(icon, 'Generate the macOS icon before bundling (npm run icons).');
  await requireFile(server, 'The standalone local server is required.');
  await verifyDistTree(path.join(projectRoot, 'dist'));
  const libraries = run('/usr/bin/otool', ['-L', runtime]).split('\n').slice(1).map((line) => line.trim().split(' (')[0]).filter(Boolean);
  const externalLibraries = libraries.filter((library) => !library.startsWith('/System/Library/') && !library.startsWith('/usr/lib/'));
  if (externalLibraries.length) throw new Error(`This Node runtime requires external dynamic libraries and is not standalone:\n${externalLibraries.join('\n')}\nUse an official standalone Node distribution.`);
  const loadCommands = run('/usr/bin/otool', ['-l', runtime]);
  const minMacOS = loadCommands.match(/\bminos\s+([\d.]+)/)?.[1] ?? loadCommands.match(/LC_VERSION_MIN_MACOSX[\s\S]*?\bversion\s+([\d.]+)/)?.[1];
  if (!minMacOS) throw new Error('Could not determine the runtime’s minimum macOS version.');
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const variables = { APP_VERSION: metadata.version, MIN_MACOS: minMacOS, ARCHITECTURE: architecture, NODE_ARCH: process.arch, NODE_VERSION: process.versions.node, ARCH_LABEL: process.arch === 'arm64' ? 'Apple silicon Macs (M1 or later)' : 'Intel Macs (64-bit)' };

  await mkdir(outputRoot, { recursive: true });
  if ((await lstat(outputRoot)).isSymbolicLink()) throw new Error('The release directory must not be a symlink.');
  const stage = await mkdtemp(path.join(outputRoot, '.temple-build-'));
  console.log(`Staging standalone macOS ${process.arch} app…`);
  const payload = path.join(stage, 'Temple Lab');
  const app = path.join(payload, 'Temple Lab.app');
  const contents = path.join(app, 'Contents');
  const resources = path.join(contents, 'Resources');
  const executableDirectory = path.join(contents, 'MacOS');
  const runtimeDirectory = path.join(resources, 'runtime');
  const licenseDirectory = path.join(resources, 'licenses');
  await Promise.all([mkdir(executableDirectory, { recursive: true }), mkdir(runtimeDirectory, { recursive: true }), mkdir(licenseDirectory, { recursive: true })]);
  const launcher = path.join(executableDirectory, 'TempleLab');
  const bundledNode = path.join(runtimeDirectory, 'node');
  await copyFile(path.join(sourceRoot, 'launch.sh'), launcher);
  await chmod(launcher, 0o755);
  await copyFile(runtime, bundledNode);
  await chmod(bundledNode, 0o755);
  await copyFile(server, path.join(resources, 'serve.mjs'));
  await copyFile(icon, path.join(resources, 'AppIcon.icns'));
  await copyFile(nodeLicense, path.join(licenseDirectory, 'NODE-LICENSE.txt'));
  await copyFile(path.join(projectRoot, 'LICENSE'), path.join(licenseDirectory, 'TEMPLE-LAB-LICENSE.txt'));
  await cp(path.join(projectRoot, 'dist'), path.join(resources, 'dist'), { recursive: true, dereference: false });
  const frontendNotices = await copyFrontendNotices(path.join(licenseDirectory, 'web'));
  const plist = fill(await readFile(path.join(sourceRoot, 'Info.plist'), 'utf8'), Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, xml(value)])));
  await writeFile(path.join(contents, 'Info.plist'), plist);
  await writeFile(path.join(contents, 'PkgInfo'), 'APPL????');
  await writeFile(path.join(payload, 'QUICK-START.md'), fill(await readFile(path.join(sourceRoot, 'QUICK-START.md'), 'utf8'), variables));
  await copyFile(path.join(projectRoot, 'LICENSE'), path.join(payload, 'LICENSE'));
  const manifest = {
    generatedBy: GENERATOR, name: 'Temple Lab', version: metadata.version, platform: 'darwin', architecture: process.arch,
    minimumMacOS: minMacOS, nodeVersion: process.versions.node, runtimeSHA256: await sha256(bundledNode),
    serverSHA256: await sha256(server), iconSHA256: await sha256(icon), frontendNoticeCount: frontendNotices,
    builtAt: new Date().toISOString(), developerIDSigned: false, notarized: false, launcher: 'shell-with-readiness-handshake',
  };
  await writeFile(path.join(resources, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  run('/usr/bin/plutil', ['-lint', path.join(contents, 'Info.plist')]);
  run('/bin/sh', ['-n', launcher]);
  if (run(bundledNode, ['--version']).trim() !== `v${process.versions.node}`) throw new Error('The bundled runtime version did not match the build runtime.');
  run(bundledNode, ['--check', path.join(resources, 'serve.mjs')]);
  const archiveName = `Temple-Lab-macOS-${process.arch}.zip`;
  const archive = path.join(stage, archiveName);
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', payload, archive]);
  const publishedManifest = { ...manifest, archive: archiveName, archiveSHA256: await sha256(archive), archiveBytes: (await stat(archive)).size };
  await writeFile(path.join(stage, 'bundle-manifest.json'), `${JSON.stringify(publishedManifest, null, 2)}\n`);
  const outputs = ['Temple Lab.app', archiveName, 'QUICK-START.md', 'LICENSE', 'bundle-manifest.json'];
  const previous = await preserveExistingOutputs(outputs);
  for (const name of ['Temple Lab.app', 'QUICK-START.md', 'LICENSE']) await rename(path.join(payload, name), path.join(outputRoot, name));
  await rename(archive, path.join(outputRoot, archiveName));
  await rename(path.join(stage, 'bundle-manifest.json'), path.join(outputRoot, 'bundle-manifest.json'));
  await cleanupPublishedStage(stage, outputRoot);
  console.log(`Ready: release/Temple Lab.app\nReady: release/${archiveName} (${(publishedManifest.archiveBytes / 1024 / 1024).toFixed(1)} MB)\nNative ${process.arch}; macOS ${minMacOS}+; bundled Node.js ${process.versions.node}.\nPreserved ${frontendNotices} frontend dependency notices and the complete Node license.`);
  if (previous) console.log(`Previous generated outputs preserved at ${path.relative(projectRoot, previous)}.`);
}

main().catch((error) => { console.error(`macOS bundle failed: ${error.message}`); process.exitCode = 1; });
