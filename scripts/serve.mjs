#!/usr/bin/env node
import http from 'node:http';
import { constants } from 'node:fs';
import { open, realpath, stat, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

export const APP_ID = 'temple-molecular-workbench';
export const APP_VERSION = '1.3.0';
export const HEALTH_PATH = '/__temple_health';
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const HOST = '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

function withinRoot(root, file) {
  const path = relative(root, file);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function validateRoot(root) {
  let canonical;
  try {
    canonical = await realpath(resolve(root));
    if (!(await stat(canonical)).isDirectory()) throw new Error('not a directory');
    const index = await realpath(resolve(canonical, 'index.html'));
    if (!withinRoot(canonical, index) || !(await stat(index)).isFile()) throw new Error('invalid index');
  } catch {
    throw new Error('The built site is missing or invalid. Choose a directory containing its own index.html, or run npm run build first.');
  }
  return canonical;
}

function send(request, response, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  const bytes = Buffer.from(body);
  response.writeHead(status, { 'Content-Type': type, 'Content-Length': bytes.length, ...extra });
  response.end(request.method === 'HEAD' ? undefined : bytes);
}

function requestPath(raw) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) throw new Error('Forbidden path');
  const path = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
  // Decode exactly once; residual percent signs also reject double-encoded paths.
  // Reject Windows separators/drive syntax even when running on another OS.
  if (/[\\%:\x00-\x1f\x7f]/.test(path)) throw new Error('Forbidden path');
  const parts = path.split('/').filter(Boolean);
  if (parts.some((part) => part.startsWith('.'))) throw new Error('Forbidden path');
  return parts;
}

/** Validate a built-site root and return an unbound, dependency-free HTTP server. */
export async function createWorkbenchServer({ root = DEFAULT_ROOT } = {}) {
  const siteRoot = await validateRoot(root);
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    const port = request.socket.localPort;
    if (![`${HOST}:${port}`, `localhost:${port}`].includes(request.headers.host)) {
      send(request, response, 403, 'This workbench accepts only local requests.');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(request, response, 405, 'Only GET and HEAD are supported.', undefined, { Allow: 'GET, HEAD' });
      return;
    }
    if ((request.url?.length ?? 0) > 4096) {
      send(request, response, 414, 'Request path is too long.');
      return;
    }
    let parts;
    try { parts = requestPath(request.url); }
    catch (error) {
      send(request, response, error instanceof URIError ? 400 : 403, 'Invalid request path.');
      return;
    }
    if (parts.length === 1 && `/${parts[0]}` === HEALTH_PATH) {
      // A moved app bundle must not reuse an old process pointing at missing files.
      let available = false;
      try { available = await validateRoot(siteRoot) === siteRoot; } catch { /* Report unavailable without exposing its path. */ }
      send(request, response, available ? 200 : 503, JSON.stringify({ app: APP_ID, version: APP_VERSION }), MIME['.json']);
      return;
    }
    const requested = resolve(siteRoot, ...(parts.length ? parts : ['index.html']));
    if (!withinRoot(siteRoot, requested)) {
      send(request, response, 403, 'Path is outside the built site.');
      return;
    }
    const type = MIME[extname(requested).toLowerCase()];
    if (!type) {
      send(request, response, 404, 'Asset not found.');
      return;
    }
    let handle;
    try {
      const canonical = await realpath(requested);
      if (!withinRoot(siteRoot, canonical)) {
        send(request, response, 403, 'Asset is outside the built site.');
        return;
      }
      // Open the checked canonical path and reject a replaced final symlink.
      handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const info = await handle.stat();
      if (!info.isFile()) {
        send(request, response, 404, 'Asset not found.');
        return;
      }
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size });
      if (request.method === 'HEAD') response.end();
      else await pipeline(handle.createReadStream(), response);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        const status = ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : ['EACCES', 'EPERM', 'ELOOP'].includes(error.code) ? 403 : 500;
        send(request, response, status, status === 500 ? 'Could not read this asset.' : 'Asset not found or unavailable.');
      } else if (!response.destroyed) response.destroy();
    } finally {
      await handle?.close().catch(() => {});
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 2_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

function listen(server, port) {
  return new Promise((accept, reject) => {
    const onError = (error) => { server.off('listening', onReady); reject(error); };
    const onReady = () => { server.off('error', onError); accept(); };
    server.once('error', onError);
    server.once('listening', onReady);
    server.listen(port, HOST);
  });
}

function isOwnWorkbench(port) {
  return new Promise((accept) => {
    let settled = false;
    let timer;
    const finish = (own) => { if (!settled) { settled = true; clearTimeout(timer); accept(own); } };
    const request = http.get({ host: HOST, port, path: HEALTH_PATH, agent: false }, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024) { finish(false); request.destroy(); }
      });
      response.on('error', () => finish(false));
      response.on('end', () => {
        try {
          const health = JSON.parse(body);
          finish(response.statusCode === 200 && health?.app === APP_ID && health?.version === APP_VERSION);
        }
        catch { finish(false); }
      });
    });
    // A total deadline also bounds a service that keeps slowly sending bytes.
    timer = setTimeout(() => { finish(false); request.destroy(); }, 800);
    request.on('error', () => finish(false));
  });
}

async function writeReadiness(file, result) {
  const target = resolve(file);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify({ url: result.url, reused: result.reused, pid: result.reused ? null : process.pid })}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}

function openInBrowser(url) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/d', '/s', '/c', 'start', '', url]]
    : ['xdg-open', [url]];
  return new Promise((accept, reject) => {
    // The URL is generated locally from a numeric bound port, never user text.
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); accept(); });
  });
}

/** Start locally, reuse an identified workbench, or find a free ephemeral port. */
export async function startWorkbenchServer({ root = DEFAULT_ROOT, port = 5178, open: shouldOpen = false, openBrowser = openInBrowser, readyFile } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  const server = await createWorkbenchServer({ root });
  let reused = false;
  try { await listen(server, port); }
  catch (error) {
    if (error.code !== 'EADDRINUSE' || port === 0) throw error;
    reused = await isOwnWorkbench(port);
    if (!reused) await listen(server, 0);
  }
  const activePort = reused ? port : server.address().port;
  const result = { server: reused ? null : server, url: `http://${HOST}:${activePort}/`, reused };
  if (readyFile) {
    try { await writeReadiness(readyFile, result); }
    catch (error) {
      if (result.server) await new Promise((accept) => result.server.close(accept));
      throw new Error(`Could not write launcher readiness file: ${error.message}`);
    }
  }
  if (shouldOpen) {
    try { await openBrowser(result.url); }
    catch (error) { result.openError = error instanceof Error ? error.message : String(error); }
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: node serve.mjs [--root PATH] [--port 5178] [--open] [--ready-file PATH]\nServes the built workbench on 127.0.0.1. Stop with Ctrl+C.');
      return;
    }
    if (argument === '--open') { options.open = true; continue; }
    const [flag, inlineValue] = argument.split(/=(.*)/s);
    if (!['--root', '--port', '--ready-file'].includes(flag)) throw new Error(`Unknown option: ${argument}`);
    const value = inlineValue ?? args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    if (flag === '--port') {
      if (!/^\d+$/.test(value)) throw new Error('Port must be an integer from 0 to 65535.');
      options.port = Number(value);
    } else if (flag === '--root') options.root = value;
    else options.readyFile = value;
  }
  const result = await startWorkbenchServer(options);
  console.log(`${result.reused ? 'Existing workbench' : 'Workbench ready'}: ${result.url}`);
  if (result.openError) console.warn(`Could not open the browser automatically. Open the URL above. (${result.openError})`);
  if (result.server) {
    const stop = () => {
      result.server.close();
      result.server.closeAllConnections();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Temple launcher: ${error.message}`); process.exitCode = 1; });
}
