import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, symlink, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createWorkbenchServer, startWorkbenchServer, APP_ID, APP_VERSION, HEALTH_PATH } from '../scripts/serve.mjs';
import { assertAppVersion, cleanupPublishedStage } from '../scripts/macos-build-safety.mjs';

test('package metadata and the exported launcher health version stay in sync', async () => {
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(metadata.version, APP_VERSION);
  assert.doesNotThrow(() => assertAppVersion(metadata.version, APP_VERSION));
  for (const invalid of ['0.0.0-mismatch', '', undefined, 12]) {
    assert.throws(() => assertAppVersion(invalid, APP_VERSION), /App version mismatch/);
  }
});

test('successful publication removes only its empty stage and preserves output and recovery backups', async (t) => {
  const { temporary } = await fixture(t);
  const release = join(temporary, 'release');
  const previous = join(release, '.previous', 'build-recovery');
  await mkdir(previous, { recursive: true });
  await writeFile(join(previous, 'backup.zip'), 'recoverable previous output');
  await writeFile(join(release, 'bundle-manifest.json'), 'published output');
  const stage = await mkdtemp(join(release, '.temple-build-'));
  await mkdir(join(stage, 'Temple Lab'));
  await cleanupPublishedStage(stage, release);
  await assert.rejects(lstat(stage), { code: 'ENOENT' });
  assert.equal(await readFile(join(previous, 'backup.zip'), 'utf8'), 'recoverable previous output');
  assert.equal(await readFile(join(release, 'bundle-manifest.json'), 'utf8'), 'published output');
  assert.deepEqual((await readdir(release)).sort(), ['.previous', 'bundle-manifest.json']);
});

test('stage cleanup preserves all files when publication is incomplete or unexpected content exists', async (t) => {
  const { temporary } = await fixture(t);
  const release = join(temporary, 'release');
  await mkdir(release);
  for (const fileLocation of ['Temple Lab', '']) {
    const stage = await mkdtemp(join(release, '.temple-build-'));
    const payload = join(stage, 'Temple Lab');
    await mkdir(payload);
    const leftover = join(stage, fileLocation, 'keep.txt');
    await writeFile(leftover, 'must remain recoverable');
    await assert.rejects(cleanupPublishedStage(stage, release), /still contains files/);
    assert.equal(await readFile(leftover, 'utf8'), 'must remain recoverable');
    assert.ok((await lstat(payload)).isDirectory());
  }
});

test('stage cleanup rejects recovery paths, outside targets, and symlinks', async (t) => {
  const { temporary } = await fixture(t);
  const release = join(temporary, 'release');
  const previous = join(release, '.previous');
  await mkdir(previous, { recursive: true });
  await assert.rejects(cleanupPublishedStage(previous, release), /exact generated/);
  const outside = await mkdtemp(join(temporary, '.temple-build-'));
  await mkdir(join(outside, 'Temple Lab'));
  await assert.rejects(cleanupPublishedStage(outside, release), /exact generated/);
  const linkedStage = join(release, '.temple-build-AbCd12');
  await symlink(outside, linkedStage, 'dir');
  await assert.rejects(cleanupPublishedStage(linkedStage, release), /symlink/);
  const stage = await mkdtemp(join(release, '.temple-build-'));
  await symlink(join(outside, 'Temple Lab'), join(stage, 'Temple Lab'), 'dir');
  await assert.rejects(cleanupPublishedStage(stage, release), /symlink/);
  assert.ok((await lstat(previous)).isDirectory());
  assert.ok((await lstat(join(outside, 'Temple Lab'))).isDirectory());
});

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'temple-launcher-tests-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'dist');
  await mkdir(join(root, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'index.html'), '<!doctype html><title>Temple fixture</title>'),
    writeFile(join(root, 'assets', 'app.js'), 'export const ready = true;'),
    writeFile(join(root, 'assets', 'app.css'), 'body { color: lime; }'),
    writeFile(join(root, 'assets', 'model.json'), '{"test":true}'),
    writeFile(join(root, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    writeFile(join(root, 'assets', 'preview.png'), Buffer.from([137, 80, 78, 71])),
    writeFile(join(root, 'favicon.ico'), Buffer.from([0, 0, 1, 0])),
    writeFile(join(root, 'assets', 'named asset.js'), '// space in asset name'),
    writeFile(join(root, 'assets', 'app.js.map'), '{"sourcesContent":["private source"]}'),
    writeFile(join(temporary, 'private.json'), '{"secret":"outside-root"}'),
  ]);
  return { temporary, root };
}

function close(t, server) {
  t.after(() => new Promise((accept, reject) => {
    server.close((error) => error ? reject(error) : accept());
    server.closeAllConnections();
  }));
}

function request(url, path = '/', { method = 'GET', headers = {} } = {}) {
  const target = new URL(url);
  return new Promise((accept, reject) => {
    const req = http.request({ host: target.hostname, port: target.port, method, path, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => accept({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function launch(t) {
  const files = await fixture(t);
  const running = await startWorkbenchServer({ root: files.root, port: 0 });
  close(t, running.server);
  return { ...files, ...running };
}

test('starts only on loopback and serves its exact app health and index', async (t) => {
  const { server, url, reused } = await launch(t);
  assert.equal(reused, false);
  assert.equal(server.address().address, '127.0.0.1');
  const index = await request(url);
  assert.equal(index.status, 200);
  assert.match(index.body.toString(), /Temple fixture/);
  assert.equal(index.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(index.headers['x-content-type-options'], 'nosniff');
  const health = await request(url, HEALTH_PATH);
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { app: APP_ID, version: APP_VERSION });
});

test('serves assets with their MIME types and HEAD has no response body', async (t) => {
  const { url } = await launch(t);
  const assets = [
    ['/assets/app.js', 'text/javascript'], ['/assets/app.css', 'text/css'],
    ['/assets/logo.svg', 'image/svg+xml'], ['/assets/preview.png', 'image/png'],
    ['/assets/model.json', 'application/json'], ['/favicon.ico', 'image/x-icon'],
  ];
  for (const [path, type] of assets) {
    const get = await request(url, path);
    const head = await request(url, path, { method: 'HEAD' });
    assert.equal(get.status, 200, path);
    assert.ok(get.headers['content-type'].startsWith(type), path);
    assert.equal(head.status, 200, path);
    assert.equal(head.body.length, 0, path);
    assert.equal(Number(head.headers['content-length']), get.body.length, path);
  }
  assert.equal((await request(url, '/assets/named%20asset.js?cache=1')).status, 200);
  assert.equal((await request(url, HEALTH_PATH, { method: 'HEAD' })).body.length, 0);
});

test('rejects traversal, encoded separators, backslashes, double encoding, and dotfiles', async (t) => {
  const { url } = await launch(t);
  for (const path of [
    '/../private.json', '/%2e%2e/private.json', '/assets/%2E%2E/%2e%2e/private.json',
    '/assets/%2e%2e%2f%2e%2e%2fprivate.json', '/assets/..\\..\\private.json',
    '/assets/%2e%2e%5c%2e%2e%5cprivate.json', '/%252e%252e/private.json',
    '/%2f..%2fprivate.json', '//private.json', '/.git/config', '/assets/.hidden.json',
    '/assets/app.js%00.json', '/C:/private.json',
  ]) {
    const response = await request(url, path);
    assert.equal(response.status, 403, path);
    assert.doesNotMatch(response.body.toString(), /outside-root/);
  }
  assert.equal((await request(url, '/bad%XX.json')).status, 400);
});

test('refuses source maps, directory listings, unknown routes, methods, and nonlocal hosts', async (t) => {
  const { url } = await launch(t);
  for (const path of ['/assets/', '/missing', '/assets/app.js.map', '/src/App.tsx']) {
    assert.equal((await request(url, path)).status, 404, path);
  }
  const post = await request(url, '/', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  assert.equal((await request(url, '/', { headers: { Host: 'not-local.example' } })).status, 403);
});

test('blocks file and directory symlinks escaping the built root', async (t) => {
  const { root, temporary, url } = await launch(t);
  await symlink(join(temporary, 'private.json'), join(root, 'assets', 'leak.json'));
  await symlink(temporary, join(root, 'assets', 'escape'), 'dir');
  await symlink(join(root, 'assets', 'model.json'), join(root, 'assets', 'internal.json'));
  assert.equal((await request(url, '/assets/leak.json')).status, 403);
  assert.equal((await request(url, '/assets/escape/private.json')).status, 403);
  assert.equal((await request(url, '/assets/internal.json')).status, 200);
});

test('missing or invalid built roots fail before a server is returned', async (t) => {
  const { root, temporary } = await fixture(t);
  await assert.rejects(createWorkbenchServer({ root: join(temporary, 'missing') }), /built site/);
  await assert.rejects(createWorkbenchServer({ root: join(root, 'index.html') }), /built site/);
  const empty = join(temporary, 'empty');
  await mkdir(empty);
  await assert.rejects(createWorkbenchServer({ root: empty }), /index.html/);
  await symlink(join(root, 'index.html'), join(empty, 'index.html'));
  await assert.rejects(createWorkbenchServer({ root: empty }), /built site/);
  await assert.rejects(startWorkbenchServer({ root, port: -1 }), /Port/);
  await assert.rejects(startWorkbenchServer({ root, port: 65536 }), /Port/);
});

test('relaunching an identified workbench reuses its port and opens only after health confirmation', async (t) => {
  const { root, url, server } = await launch(t);
  const opened = [];
  const again = await startWorkbenchServer({
    root, port: server.address().port, open: true,
    openBrowser: async (target) => {
      const health = await request(target, HEALTH_PATH);
      assert.equal(JSON.parse(health.body).app, APP_ID);
      opened.push(target);
    },
  });
  assert.equal(again.reused, true);
  assert.equal(again.server, null);
  assert.equal(again.url, url);
  assert.deepEqual(opened, [url]);
});

test('a busy unrelated port chooses a free port and never opens the unrelated app', async (t) => {
  const { root } = await fixture(t);
  const unrelated = http.createServer((_, res) => res.end(JSON.stringify({ app: `${APP_ID}-other` })));
  await new Promise((accept) => unrelated.listen(0, '127.0.0.1', accept));
  close(t, unrelated);
  const occupied = unrelated.address().port;
  let opened;
  const result = await startWorkbenchServer({
    root, port: occupied, open: true,
    openBrowser: async (target) => { assert.equal((await request(target)).status, 200); opened = target; },
  });
  close(t, result.server);
  assert.equal(result.reused, false);
  assert.notEqual(result.server.address().port, occupied);
  assert.equal(opened, result.url);
});

test('browser launch failure leaves a working server and a manual URL', async (t) => {
  const { root } = await fixture(t);
  const result = await startWorkbenchServer({ root, port: 0, open: true, openBrowser: async () => { throw new Error('no browser'); } });
  close(t, result.server);
  assert.equal(result.openError, 'no browser');
  assert.equal((await request(result.url)).status, 200);
});

test('a moved app bundle does not reuse a server pointing at its old build directory', async (t) => {
  const { root, temporary, url, server } = await launch(t);
  const moved = join(temporary, 'moved-dist');
  await rename(root, moved);
  assert.equal((await request(url, HEALTH_PATH)).status, 503);
  const restarted = await startWorkbenchServer({ root: moved, port: server.address().port });
  close(t, restarted.server);
  assert.equal(restarted.reused, false);
  assert.notEqual(restarted.url, url);
  assert.equal((await request(restarted.url)).status, 200);
});

test('an older app version or unresponsive health endpoint is not reused', async (t) => {
  const { root } = await fixture(t);
  for (const reply of [(_, res) => res.end(JSON.stringify({ app: APP_ID, version: '0.0.1' })), () => {}]) {
    const occupied = http.createServer(reply);
    await new Promise((accept, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', accept); });
    close(t, occupied);
    const result = await startWorkbenchServer({ root, port: occupied.address().port });
    close(t, result.server);
    assert.equal(result.reused, false);
    assert.notEqual(result.server.address().port, occupied.address().port);
    assert.equal((await request(result.url)).status, 200);
  }
});

test('readiness is written atomically before browser opening and identifies reused servers', async (t) => {
  const { root, temporary } = await fixture(t);
  const readyFile = join(temporary, 'ready.json');
  let ready;
  const result = await startWorkbenchServer({
    root, port: 0, open: true, readyFile,
    openBrowser: async (url) => {
      ready = JSON.parse(await readFile(readyFile, 'utf8'));
      assert.equal(ready.url, url);
      assert.equal((await request(url)).status, 200);
    },
  });
  close(t, result.server);
  assert.deepEqual(ready, { url: result.url, reused: false, pid: process.pid });
  await startWorkbenchServer({ root, port: result.server.address().port, readyFile });
  assert.deepEqual(JSON.parse(await readFile(readyFile, 'utf8')), { url: result.url, reused: true, pid: null });
  assert.equal((await readdir(temporary)).filter((name) => name.includes('.tmp-')).length, 0);
  await assert.rejects(startWorkbenchServer({ root, port: 0, readyFile: join(temporary, 'missing', 'ready.json') }), /readiness file/);
});

test('CLI runs independently of its current directory and exits when terminated', async (t) => {
  const { root, temporary } = await fixture(t);
  const script = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--root', root, '--port', '0'], { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const exited = new Promise((accept, reject) => { child.once('exit', (code, signal) => accept({ code, signal })); child.once('error', reject); });
  const url = await new Promise((accept, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Launcher did not become ready: ${output}`)), 3000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); accept(match[0]); }
    });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  assert.equal((await request(url)).status, 200);
  child.kill('SIGTERM');
  assert.deepEqual(await exited, { code: 0, signal: null });
});
