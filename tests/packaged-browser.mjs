import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Verify the built app served by the Mac launcher, without Vite or source-module
// imports. Start the launcher first, then: node tests/packaged-browser.mjs
const baseURL = process.env.TEST_PACKAGED_URL || 'http://127.0.0.1:5178';
const origin = new URL(baseURL).origin;
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const captureScreenshot = process.argv.includes('--screenshot');
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
context.setDefaultTimeout(30_000);
const externalRequests = [];
const failedLocalRequests = [];
const errors = [];
const reports = [];

// The launcher must work without internet access. Do not substitute fixtures or
// stub the application: only deny network requests leaving its loopback origin.
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) {
    externalRequests.push(url.href);
    await route.abort('internetdisconnected');
    return;
  }
  await route.continue();
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (new URL(response.url()).origin === origin && response.status() >= 400) {
    failedLocalRequests.push(`${response.status()} ${response.url()}`);
  }
});

async function snapshot() {
  return page.evaluate(() => {
    const saved = localStorage.getItem('molecule-studio:scene:v1');
    if (!saved) throw new Error('The edited workspace was not saved to local storage');
    return JSON.parse(saved);
  });
}

async function frames() {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function canvasReady() {
  const canvas = page.locator('.scene-viewport canvas');
  await canvas.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.scene-viewport canvas');
    if (!canvas || canvas.width < 100 || canvas.height < 100) return false;
    const gl = canvas.getContext('webgl2');
    return gl && !gl.isContextLost();
  });
  assert.equal(await page.getByText('3D view is unavailable', { exact: true }).isVisible(), false);
  await frames();
  return canvas;
}

async function check(name, action) {
  await action();
  reports.push(name);
  console.log(`PASS ${name}`);
}

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  let benzeneImage;
  await check('packaged production assets and logo load without the internet', async () => {
    const entry = await page.locator('script[type="module"][src]').first().getAttribute('src');
    assert.match(new URL(entry, baseURL).pathname, /\/assets\/.+\.js$/);
    assert.equal(await page.locator('script[src*="@vite/client"]').count(), 0);
    await page.waitForFunction(() => {
      const logo = document.querySelector('.brand-mark img');
      return logo && logo.complete && logo.naturalWidth > 0 && logo.naturalHeight > 0;
    });
    assert.match(await page.locator('.brand-mark img').first().getAttribute('src'), /temple-lab-mark\.svg$/);
  });

  await check('the packaged app opens a real Benzene WebGL workbench', async () => {
    assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /Benzene/);
    assert.equal(await page.locator('.stats-strip > div').nth(1).locator('strong').innerText(), '12');
    const canvas = await canvasReady();
    benzeneImage = createHash('sha256').update(await canvas.screenshot()).digest('hex');
    if (captureScreenshot) {
      await mkdir('docs', { recursive: true });
      await page.screenshot({ path: 'docs/workbench.png', fullPage: true });
      console.log('Packaged desktop screenshot saved: docs/workbench.png');
    }
  });

  await check('Water renders and clear/undo restores its complete graph', async () => {
    await page.locator('.molecule-card').filter({ hasText: 'Water' }).click();
    assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /Water/);
    const water = await snapshot();
    assert.equal(water.activePresetId, 'water');
    assert.equal(water.atoms.length, 3);
    assert.equal(water.bonds.length, 2);
    const canvas = await canvasReady();
    assert.notEqual(createHash('sha256').update(await canvas.screenshot()).digest('hex'), benzeneImage);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal((await snapshot()).atoms.length, 0);
    assert.equal((await snapshot()).bonds.length, 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(await snapshot(), water);
  });

  await check('the packaged element library searches and adds Sodium', async () => {
    await page.getByRole('button', { name: 'Explore all 118 elements', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Element library', exact: true });
    await dialog.getByRole('textbox', { name: 'Search elements by name, symbol, or atomic number' }).fill('Sodium');
    assert.equal(await dialog.getByRole('button', { name: 'Sodium, Na, atomic number 11', exact: true }).isEnabled(), true);
    await dialog.getByRole('button', { name: 'Add Na to canvas', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const scene = await snapshot();
    assert.equal(scene.atoms.length, 4);
    assert.equal(scene.atoms.at(-1).sym, 'Na');
    assert.equal(scene.bonds.length, 2);
    assert.equal(scene.activePresetId, null);
    await page.getByRole('heading', { name: 'Sodium', exact: true }).waitFor();
    await canvasReady();
  });

  await check('export downloads the edited workspace and reload preserves it', async () => {
    const before = await snapshot();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
    ]);
    assert.match(download.suggestedFilename(), /\.json$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), before);
    await page.reload({ waitUntil: 'networkidle' });
    await canvasReady();
    assert.deepEqual(await snapshot(), before);
    assert.equal(await page.locator('.stats-strip > div').nth(1).locator('strong').innerText(), '04');
    assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /Your creation/);
    assert.equal(await page.locator('.brand-mark img').first().evaluate((img) => img.complete && img.naturalWidth > 0), true);
  });

  assert.deepEqual(externalRequests, [], 'The packaged app must not request external assets');
  assert.deepEqual(failedLocalRequests, [], 'All packaged assets must be present');
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  const sourceRequests = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname)
    .filter((pathname) => pathname.startsWith('/src/') || pathname.includes('/@vite/')));
  assert.deepEqual(sourceRequests, [], 'Verification must exercise built assets, not source modules');
  console.log(`\n${reports.length} packaged browser workflows passed with external networking blocked.`);
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/packaged-browser-failure.png', fullPage: true }).catch(() => {});
  console.error(error);
  if (errors.length) console.error('Browser errors:', errors);
  if (externalRequests.length) console.error('Blocked external requests:', externalRequests);
  process.exitCode = 1;
} finally {
  await browser.close();
}
