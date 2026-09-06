import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import sharp from 'sharp';

// Runs on Vite or the offline packaged build; no source-module mutations.
const production = process.argv.includes('--production');
const baseURL =
  process.env.TEST_BASE_URL ||
  (production ? process.env.TEST_PACKAGED_URL || 'http://127.0.0.1:5178' : 'http://127.0.0.1:5173');
const origin = new URL(baseURL).origin;
const engine = process.env.TEST_BROWSER || 'chromium';
const capture = process.argv.includes('--screenshot');
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unsupported test browser: ${engine}`);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await browserType.launch({
  headless: true,
  ...(engine === 'chromium'
    ? {
        ...(existsSync(chrome) ? { executablePath: chrome } : {}),
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
context.setDefaultTimeout(30_000);
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  return /^https?:$/.test(url.protocol) && url.origin !== origin
    ? route.abort('internetdisconnected')
    : route.continue();
});
const page = await context.newPage();
const errors = [];
const reports = [];
page.on('pageerror', (error) => errors.push(error.message));
const coach = page.getByRole('region', { name: 'Bonding coach', exact: true });
const frames = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const snapshot = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('molecule-studio:scene:v1')));
const atom = (id, sym, pos = [0, 0, 0]) => ({ id, sym, pos });
const bond = (id, a, b, order = 1) => ({ id, a, b, order });
const scene = (atoms, bonds = []) => ({
  kind: 'molecule-studio',
  schemaVersion: 1,
  units: 'angstrom',
  atoms,
  bonds,
  activePresetId: null,
  display: { style: 'ball-stick', labels: true, grid: true, autoRotate: false },
});
async function upload(value) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'bonding-case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await frames();
}
async function check(name, callback) {
  await callback();
  reports.push(name);
  console.log(`PASS ${name}`);
}
async function startGuide(id) {
  await coach
    .getByLabel('Try a guided build', { exact: true })
    .or(coach.getByLabel('Start another guide', { exact: true }))
    .selectOption(id);
  await coach.getByRole('button', { name: 'Start guided build', exact: true }).click();
  await frames();
}

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await coach.waitFor();
  await check(
    'recognition separates exact connectivity, formula-only matches, and unknown combinations',
    async () => {
      const atoms = [atom('o', 'O'), atom('h1', 'H', [1, 2, 0]), atom('h2', 'H', [-1, 2, 0])];
      await upload(scene(atoms));
      assert.match(await coach.innerText(), /Atom counts match; bonds do not/);
      await upload(scene(atoms, [bond('oh1', 'o', 'h1'), bond('oh2', 'o', 'h2')]));
      assert.match(await coach.innerText(), /Connectivity matches/);
      assert.equal(await coach.getByRole('link', { name: 'Water reference source' }).count(), 1);
      await upload(scene(atoms, [bond('oh1', 'o', 'h1', 2), bond('oh2', 'o', 'h2')]));
      assert.match(await coach.innerText(), /Atom counts match; bonds do not/);
      assert.equal(await coach.getByText('Connectivity matches', { exact: true }).count(), 0);
      await upload(scene([atom('na', 'Na')]));
      assert.match(await coach.innerText(), /does not mean impossible/);
      assert.match(await page.locator('.structure-check').innerText(), /apply to none/);
    },
  );

  await check('disconnected recognized molecules do not conceal unrelated atoms', async () => {
    const atoms = [
      atom('o1', 'O'),
      atom('a', 'H', [1, 0, 0]),
      atom('b', 'H', [-1, 0, 0]),
      atom('o2', 'O', [4, 0, 0]),
      atom('c', 'H', [5, 0, 0]),
      atom('d', 'H', [3, 0, 0]),
      atom('na', 'Na', [8, 0, 0]),
    ];
    await upload(
      scene(atoms, [
        bond('b1', 'o1', 'a'),
        bond('b2', 'o1', 'b'),
        bond('b3', 'o2', 'c'),
        bond('b4', 'o2', 'd'),
      ]),
    );
    assert.match(await coach.innerText(), /Water × 2/);
    assert.match(await coach.innerText(), /1 additional atom is/);
    assert.match(await page.locator('.structure-check').innerText(), /Na.*not checked/);
  });

  await check(
    'guided water connections, reference comparison, and every edit remain undoable',
    async () => {
      const previous = await snapshot();
      await startGuide('water');
      const staged = await snapshot();
      assert.equal(staged.bonds.length, 0);
      assert.equal(staged.activePresetId, null);
      assert.equal(staged.atoms.length, 3);
      assert.match(await coach.innerText(), /expanded for editing/);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual(await snapshot(), previous);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      assert.deepEqual(await snapshot(), staged);
      await coach.getByRole('button', { name: 'Bond with Oxygen atom 1', exact: true }).click();
      await coach.getByRole('button', { name: 'Bond with Hydrogen atom 2', exact: true }).click();
      assert.equal((await snapshot()).bonds.length, 1);
      if (capture) {
        await mkdir('docs', { recursive: true });
        const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
        if (await dismiss.count()) await dismiss.click();
        await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).focus();
        await page.locator('.inspector-content').evaluate((node) => {
          node.scrollTop = 0;
        });
        await frames();
        await page.screenshot({ path: 'docs/bonding-coach.png', fullPage: true });
      }
      await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).click();
      assert.match(await coach.innerText(), /Bond pattern complete/);
      const completed = await snapshot();
      assert.equal(completed.activePresetId, null);
      assert.deepEqual(completed.atoms, staged.atoms);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal((await snapshot()).bonds.length, 1);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await coach.getByRole('button', { name: 'Load reference geometry', exact: true }).click();
      const reference = await snapshot();
      assert.equal(reference.activePresetId, 'water');
      assert.notDeepEqual(reference.atoms, staged.atoms);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual(await snapshot(), completed);
      await startGuide('water');
      await page.locator('.molecule-card').filter({ hasText: 'Water' }).click();
      assert.equal(await coach.getByRole('button', { name: 'End guide', exact: true }).count(), 0);
      await startGuide('water');
      await upload(reference);
      assert.equal(await coach.getByRole('button', { name: 'End guide', exact: true }).count(), 0);
    },
  );

  await check(
    'guided double bonds and incorrect connections get specific reversible feedback',
    async () => {
      await startGuide('carbon-dioxide');
      await coach.getByRole('button', { name: 'Bond with Carbon atom 1', exact: true }).click();
      await coach.getByRole('button', { name: 'Bond with Oxygen atom 2', exact: true }).click();
      assert.match(await coach.innerText(), /Change C1–O2 to a double bond/);
      await coach.getByRole('button', { name: 'Apply suggested change', exact: true }).click();
      assert.equal((await snapshot()).bonds[0].order, 2);
      await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).click();
      assert.match(await coach.innerText(), /Bond pattern complete/);
      assert.deepEqual(
        (await snapshot()).bonds.map((edge) => edge.order),
        [2, 2],
      );
      await coach.getByRole('button', { name: 'End guide', exact: true }).click();
    },
  );

  await check(
    'helium totals are clean and citations never become nested or hidden controls',
    async () => {
      await upload(
        scene([atom('he1', 'He'), atom('he2', 'He', [2, 0, 0]), atom('he3', 'He', [4, 0, 0])]),
      );
      assert.match(await page.locator('.stats-strip').innerText(), /12\.007806\(6\)/);
      assert.doesNotMatch(await page.locator('.stats-strip').innerText(), /000000002/);
      assert.equal(await page.locator('.composition-row a, .composition-row button').count(), 0);
      await page.locator('.mass-source-details > summary').click();
      assert.equal(
        await page.locator('.mass-source-details a[href="https://ciaaw.org/helium.htm"]').count(),
        1,
      );
      await page.getByRole('button', { name: 'Explore all 118 elements', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Element library', exact: true });
      await dialog
        .getByRole('textbox', { name: 'Search elements by name, symbol, or atomic number' })
        .fill('Helium');
      assert.equal(
        await dialog
          .locator(
            '[aria-hidden="true"] a, [aria-hidden="true"] button, [aria-hidden="true"] [tabindex="0"]',
          )
          .count(),
        0,
      );
      await dialog.getByRole('button', { name: 'Inspect', exact: true }).click();
      await page
        .locator('[data-property="mass"] a[href="https://ciaaw.org/helium.htm"]')
        .waitFor({ state: 'visible' });
      assert.equal(
        await page.locator('[data-property="mass"] a[href="https://ciaaw.org/helium.htm"]').count(),
        1,
      );
      assert.match(await page.locator('[data-property="phase"]').innerText(), /Unverified/i);
      await page.getByRole('button', { name: 'Close element inspector', exact: true }).click();
    },
  );

  await check(
    'orbit camera and drawn structure survive opening and closing Electron Lab',
    async () => {
      await startGuide('methane');
      await coach.getByRole('button', { name: 'End guide', exact: true }).click();
      const canvas = page.locator('.scene-viewport canvas');
      await canvas.waitFor({ state: 'visible' });
      await page.waitForFunction(() => {
        const c = document.querySelector('.scene-viewport canvas');
        return c && c.getContext('webgl2') && !c.getContext('webgl2').isContextLost();
      });
      const initial = await canvas.screenshot();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 30, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + 100, box.y + box.height * 0.65, { steps: 12 });
      await page.mouse.up();
      // Wait until damping is effectively settled, not a fixed loading assumption.
      const settled = async () => {
        let previous = await canvas.screenshot();
        for (let attempt = 0; attempt < 30; attempt++) {
          await frames();
          const current = await canvas.screenshot();
          if (previous.equals(current)) return current;
          previous = current;
        }
        return previous;
      };
      const before = await settled();
      assert.equal(
        initial.equals(before),
        false,
        'A real pointer orbit must change the rendered view',
      );
      const beforeSize = await canvas.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          cssWidth: rect.width,
          cssHeight: rect.height,
          pixelWidth: element.width,
          pixelHeight: element.height,
        };
      });
      const graph = await snapshot();
      await page.getByRole('button', { name: 'Electron lab', exact: true }).click();
      await page.getByRole('button', { name: 'Close electron lab', exact: true }).click();
      await canvas.waitFor({ state: 'visible' });
      // A remounted canvas is visible before R3F resizes its default 300 × 150
      // backing store. Two identical screenshots of that placeholder are not
      // proof that the restored scene is ready. Wait for the original CSS and
      // actual drawing-buffer dimensions before testing pixel convergence.
      await page.waitForFunction((expected) => {
        const element = document.querySelector('.scene-viewport canvas');
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const gl = element.getContext('webgl2');
        return (
          Math.abs(rect.width - expected.cssWidth) < 0.5 &&
          Math.abs(rect.height - expected.cssHeight) < 0.5 &&
          element.width === expected.pixelWidth &&
          element.height === expected.pixelHeight &&
          gl &&
          !gl.isContextLost() &&
          gl.drawingBufferWidth === expected.pixelWidth &&
          gl.drawingBufferHeight === expected.pixelHeight
        );
      }, beforeSize);
      const after = await settled();
      const decode = (buffer) => sharp(buffer).ensureAlpha().raw().toBuffer();
      const [a, b] = await Promise.all([decode(before), decode(after)]);
      assert.equal(a.length, b.length);
      const meanError =
        a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
      assert.ok(
        meanError < 1,
        `Restored view should match prior camera (mean pixel error ${meanError})`,
      );
      assert.deepEqual(await snapshot(), graph);
    },
  );

  await check('guided builds work at 390px and without WebGL', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startGuide('water');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (capture) {
      const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
      if (await dismiss.count()) await dismiss.click();
      await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).focus();
      await page.evaluate(() => window.scrollTo(0, 0));
      await frames();
      await page.screenshot({ path: 'docs/bonding-coach-mobile.png', fullPage: true });
    }
    await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).click();
    await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).click();
    assert.match(await coach.innerText(), /Bond pattern complete/);
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return String(kind).startsWith('webgl') ? null : original.call(this, kind, ...args);
      };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('3D view is unavailable', { exact: true }).waitFor();
    await startGuide('water');
    await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).click();
    await coach.getByRole('button', { name: 'Add suggested bond', exact: true }).click();
    assert.match(await coach.innerText(), /Bond pattern complete/);
  });
  assert.deepEqual(errors, []);
  console.log(
    `\n${reports.length} bonding browser workflows passed (${engine}; external networking blocked).`,
  );
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page
    .screenshot({ path: `test-results/bonding-${engine}-failure.png`, fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
