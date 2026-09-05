import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Run against the Vite development server: npm run dev, then npm run test:e2e.
// All changes use visible controls or the real file input. The dev-store import
// below is read-only and lets assertions check graph integrity, not just labels.
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const captureScreenshot =
  process.argv.includes('--screenshot') || process.env.CAPTURE_SCREENSHOT === '1';
const chrome =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const reports = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
// Cold WebGL shader compilation on software-rendered CI runners can outlive
// Playwright's input dispatch. Keep normal actionability checks and allow 30s.
page.setDefaultTimeout(30_000);
page.on('pageerror', (error) => errors.push(error.message));

async function state(target = page) {
  return target.evaluate(async () => {
    // Vite may have replaced this module while other contributors edit. Reuse
    // the latest loaded module URL so assertions observe the mounted app store.
    const modules = performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name))
      .filter((url) => url.pathname === '/src/state/store.ts')
      .sort((a, b) => Number(b.searchParams.get('t') || 0) - Number(a.searchParams.get('t') || 0));
    const { useBench } = await import(modules[0]?.href || '/src/state/store.ts');
    const s = useBench.getState();
    return {
      scene: JSON.parse(s.exportScene()),
      mode: s.mode,
      tableOpen: s.tableOpen,
      cardSym: s.cardSym,
      selectedId: s.selectedId,
      past: s.past.length,
      future: s.future.length,
    };
  });
}

async function frames(target = page) {
  await target.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function canvasReady(target = page) {
  const canvas = target.locator('.scene-viewport canvas');
  await canvas.waitFor({ state: 'visible' });
  await target.waitForFunction(() => {
    const canvas = document.querySelector('.scene-viewport canvas');
    if (!canvas || canvas.width < 100 || canvas.height < 100) return false;
    const gl = canvas.getContext('webgl2');
    return gl && !gl.isContextLost();
  });
  assert.equal(
    await target.getByText('3D view is unavailable', { exact: true }).isVisible(),
    false,
  );
  await frames(target);
  return canvas;
}

async function check(name, fn) {
  await fn();
  reports.push(name);
  console.log(`PASS ${name}`);
}

async function upload(value, name = 'workspace.json') {
  const buffer = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: 'application/json', buffer });
  await frames();
}

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await canvasReady();
  if (captureScreenshot) {
    await mkdir('docs', { recursive: true });
    await page.screenshot({ path: 'docs/workbench.png', fullPage: true });
    console.log('Initial desktop screenshot saved: docs/workbench.png');
  }

  await check('six presets load matching graphs and render distinct WebGL canvases', async () => {
    const hashes = new Set();
    const presets = [
      ['Benzene', 'benzene', 12, 12],
      ['Water', 'water', 3, 2],
      ['Methane', 'methane', 5, 4],
      ['Ammonia', 'ammonia', 4, 3],
      ['Carbon dioxide', 'carbon-dioxide', 3, 2],
      ['Ethanol', 'ethanol', 9, 8],
    ];
    for (const [name, id, atoms, bonds] of presets) {
      await page.locator('.molecule-card').filter({ hasText: name }).click();
      const s = await state();
      assert.equal(s.scene.activePresetId, id);
      assert.equal(s.scene.atoms.length, atoms);
      assert.equal(s.scene.bonds.length, bonds);
      assert.match(await page.getByRole('heading', { level: 1 }).innerText(), new RegExp(name));
      const canvas = await canvasReady();
      hashes.add(
        createHash('sha256')
          .update(await canvas.screenshot())
          .digest('hex'),
      );
    }
    assert.equal(
      hashes.size,
      presets.length,
      'Every preset should produce a distinct rendered scene',
    );
  });

  await check(
    'representations, labels, grid, and rotation change and retain graph data',
    async () => {
      const before = (await state()).scene;
      for (const [label, style] of [
        ['Space fill', 'space-fill'],
        ['Wireframe', 'wireframe'],
        ['Ball & stick', 'ball-stick'],
      ]) {
        const button = page.getByRole('button', { name: label, exact: true });
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal((await state()).scene.display.style, style);
        await canvasReady();
      }
      for (const [label, field] of [
        ['Toggle atom labels', 'labels'],
        ['Toggle reference grid', 'grid'],
      ]) {
        const button = page.getByRole('button', { name: label, exact: true });
        await button.click();
        assert.equal((await state()).scene.display[field], false);
        await button.click();
        assert.equal((await state()).scene.display[field], true);
      }
      await page.getByRole('button', { name: 'Rotate molecule', exact: true }).click();
      assert.equal((await state()).scene.display.autoRotate, true);
      await page.getByRole('button', { name: 'Pause rotation', exact: true }).click();
      assert.equal((await state()).scene.display.autoRotate, false);
      assert.deepEqual((await state()).scene.atoms, before.atoms);
      assert.deepEqual((await state()).scene.bonds, before.bonds);
    },
  );

  await check('clear, undo, and redo restore complete molecular graphs', async () => {
    const before = (await state()).scene;
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal((await state()).scene.atoms.length, 0);
    assert.equal((await state()).scene.bonds.length, 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual((await state()).scene, before);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.equal((await state()).scene.atoms.length, 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual((await state()).scene, before);
  });

  await check('keyboard-accessible atom list edits coordinates, connects, and erases', async () => {
    await page.locator('.molecule-card').filter({ hasText: 'Water' }).click();
    const original = (await state()).scene;
    await page.getByRole('button', { name: /^Your atoms/ }).click();
    await page.locator('.atom-list-item').first().click();
    const x = page.getByRole('spinbutton', { name: 'X position in ångströms', exact: true });
    await x.fill('2.25');
    await x.press('Enter');
    assert.equal((await state()).scene.atoms[0].pos[0], 2.25);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual((await state()).scene, original);
    await page.locator('.atom-list-item').first().click();
    await x.fill('1000');
    await x.press('Enter');
    assert.deepEqual((await state()).scene, original, 'Out-of-range coordinate is rejected');
    await page.locator('.bond-details > summary').click();
    await page.getByRole('button', { name: 'Remove O to H bond', exact: true }).first().click();
    assert.equal((await state()).scene.bonds.length, 1);
    await page.locator('.mode-controls button').filter({ hasText: /^Bond/ }).click();
    await page.locator('.atom-list-item').first().click();
    await page.locator('.atom-list-item').nth(1).click();
    assert.equal((await state()).scene.bonds.length, 2);
    await page
      .locator('.mode-controls button')
      .filter({ hasText: /^Erase/ })
      .click();
    await page.locator('.atom-list-item').nth(2).click();
    assert.equal((await state()).scene.atoms.length, 2);
    assert.equal((await state()).scene.bonds.length, 1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.equal((await state()).scene.atoms.length, 3);
    assert.equal((await state()).scene.bonds.length, 2);
    await page.locator('.mode-controls button').filter({ hasText: /^Move/ }).click();
    await page.getByRole('button', { name: 'Molecules', exact: true }).click();
  });

  await check('real pointer dragging moves one atom with one undo step', async () => {
    await page.locator('.molecule-card').filter({ hasText: 'Water' }).click();
    await canvasReady();
    const before = await state();
    const atom = before.scene.atoms[1];
    const point = await page.evaluate(async (position) => {
      const module = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => new URL(name).pathname.endsWith('/@react-three_fiber.js'));
      if (!module) throw new Error('Could not locate the loaded renderer module');
      const { _roots } = await import(module);
      const canvas = document.querySelector('.scene-viewport canvas');
      const root = _roots.get(canvas);
      if (!root) throw new Error('Could not read the live canvas camera');
      const camera = root.store.getState().camera;
      const projected = camera.position
        .clone()
        .set(...position)
        .project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((projected.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - projected.y) * rect.height) / 2,
      };
    }, atom.pos);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 68, point.y - 32, { steps: 12 });
    await page.mouse.up();
    const after = await state();
    assert.notDeepEqual(after.scene.atoms[1].pos, atom.pos);
    assert.deepEqual(
      after.scene.atoms.filter((a) => a.id !== atom.id),
      before.scene.atoms.filter((a) => a.id !== atom.id),
    );
    assert.deepEqual(after.scene.bonds, before.scene.bonds);
    assert.equal(after.past, before.past + 1, 'A multi-event pointer drag is one history step');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual((await state()).scene, before.scene);
  });

  await check('quick add creates an atom and removes reference-preset identity', async () => {
    const before = (await state()).scene;
    await page.getByRole('button', { name: 'Add Carbon', exact: true }).click();
    const after = (await state()).scene;
    assert.equal(after.atoms.length, before.atoms.length + 1);
    assert.equal(after.atoms.at(-1).sym, 'C');
    assert.equal(after.activePresetId, null);
    assert.deepEqual(after.bonds, before.bonds);
  });

  await check('element modal searches, filters, traps focus, inspects, and adds', async () => {
    const trigger = page.getByRole('button', { name: 'Explore all 118 elements', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Element library', exact: true });
    await dialog.waitFor();
    const search = dialog.getByRole('textbox', {
      name: 'Search elements by name, symbol, or atomic number',
    });
    assert.equal(await search.evaluate((input) => document.activeElement === input), true);
    assert.equal(await dialog.getByRole('button', { name: /atomic number/ }).count(), 118);
    await search.fill('Oxygen');
    assert.equal(
      await dialog
        .getByRole('button', { name: 'Oxygen, O, atomic number 8', exact: true })
        .isEnabled(),
      true,
    );
    await dialog.getByRole('button', { name: 'Inspect', exact: true }).click();
    assert.equal((await state()).cardSym, 'O');
    assert.equal(await trigger.evaluate((button) => document.activeElement === button), true);
    await page.getByRole('button', { name: 'Atomic structure', exact: true }).click();
    await page.getByText('Outer-shell electrons', { exact: true }).waitFor();
    assert.match(await page.locator('.element-inspector').innerText(), /Reference phase: gas/);

    await trigger.click();
    await search.fill('unobtainium');
    assert.equal(
      await dialog.getByRole('button', { name: 'Inspect', exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await dialog.getByRole('button', { name: /^Add .* to canvas$/ }).isDisabled(),
      true,
    );
    await search.fill('');
    await dialog
      .getByRole('combobox', { name: 'Filter element category' })
      .selectOption('noble gas');
    assert.equal(
      await dialog
        .getByRole('button', { name: 'Carbon, C, atomic number 6', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await dialog
        .getByRole('button', { name: 'Neon, Ne, atomic number 10', exact: true })
        .isEnabled(),
      true,
    );
    await dialog.getByRole('combobox', { name: 'Filter element category' }).selectOption('all');
    await search.fill('Neon');
    const add = dialog.getByRole('button', { name: 'Add Ne to canvas', exact: true });
    await add.focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
      true,
      'Tab stays inside the modal',
    );
    const count = (await state()).scene.atoms.length;
    await add.click();
    assert.equal((await state()).scene.atoms.length, count + 1);
    assert.equal((await state()).scene.atoms.at(-1).sym, 'Ne');
    assert.equal((await state()).tableOpen, false);
    const lattice = page.locator('.element-inspector canvas');
    await lattice.scrollIntoViewIfNeeded();
    await lattice.waitFor({ state: 'visible' });
    const rendererRoots = await page.evaluateHandle(async () => {
      const module = performance.getEntriesByType('resource').map((entry) => entry.name)
        .find((name) => new URL(name).pathname.endsWith('/@react-three_fiber.js'));
      if (!module) throw new Error('Could not locate the loaded renderer module');
      const { _roots } = await import(module);
      return _roots;
    });
    // Import once above; Playwright polling predicates must be synchronous.
    // A visible canvas can precede the renderer's layout-effect registration.
    const latticeStateHandle = await page.waitForFunction((roots) => {
      const canvas = document.querySelector('.element-inspector canvas');
      const root = roots.get(canvas)?.store.getState();
      if (!root?.internal.active || typeof root.gl?.getContext !== 'function') return false;
      return { frameloop: root.frameloop, contextLost: root.gl.getContext().isContextLost() };
    }, rendererRoots);
    const latticeState = await latticeStateHandle.jsonValue();
    await latticeStateHandle.dispose();
    await rendererRoots.dispose();
    assert.equal(latticeState.frameloop, 'demand', 'The inspector must not run a second perpetual render loop');
    assert.equal(latticeState.contextLost, false, 'The Neon lattice uses a real WebGL context');
    await trigger.click();
    await page.keyboard.press('Escape');
    assert.equal((await state()).tableOpen, false);
    assert.equal(await trigger.evaluate((button) => document.activeElement === button), true);
  });

  await check(
    'valid import commits; invalid imports leave scene and history unchanged',
    async () => {
      const valid = {
        kind: 'molecule-studio',
        schemaVersion: 1,
        units: 'angstrom',
        activePresetId: null,
        atoms: [
          { id: 'import-c', sym: 'C', pos: [-1, 1.5, 0] },
          { id: 'import-o', sym: 'O', pos: [1, 1.5, 0] },
        ],
        bonds: [{ id: 'import-bond', a: 'import-c', b: 'import-o', order: 2 }],
        display: { style: 'ball-stick', labels: true, grid: true, autoRotate: false },
      };
      await upload(valid);
      assert.deepEqual((await state()).scene, valid);
      await page.getByText('Workspace imported. Ready to explore.', { exact: true }).waitFor();
      const before = await state();
      const invalid = [
        '{broken JSON',
        { ...valid, atoms: [{ ...valid.atoms[0], sym: 'Unknown' }, valid.atoms[1]] },
        { ...valid, bonds: [{ ...valid.bonds[0], b: 'missing' }] },
        { ...valid, atoms: [valid.atoms[0], { ...valid.atoms[1], id: valid.atoms[0].id }] },
      ];
      for (const broken of invalid) {
        await upload(broken, 'invalid.json');
        assert.deepEqual(await state(), before, 'Invalid import must be atomic, including history');
      }
    },
  );

  await check('export downloads the current valid workspace', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    assert.match(download.suggestedFilename(), /\.json$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), (await state()).scene);
  });

  await check('typing in a search input does not invoke editing shortcuts', async () => {
    const search = page.getByRole('textbox', { name: 'Search molecules', exact: true });
    const before = await state();
    await search.focus();
    await page.keyboard.type('123tf');
    await page.keyboard.press('ControlOrMeta+z');
    const after = await state();
    assert.equal(after.mode, before.mode);
    assert.equal(after.tableOpen, false);
    assert.deepEqual(after.scene, before.scene);
    assert.equal(after.past, before.past);
    await search.fill('');
    await page.locator('#workbench').focus();
    await page.keyboard.press('2');
    assert.equal((await state()).mode, 'bond');
    await page.keyboard.press('Escape');
    assert.equal((await state()).mode, 'move');
  });

  await check('reload restores the edited scene and display settings', async () => {
    await page.getByRole('button', { name: 'Wireframe', exact: true }).click();
    const before = (await state()).scene;
    await page.reload({ waitUntil: 'networkidle' });
    await canvasReady();
    assert.deepEqual((await state()).scene, before);
    assert.equal(
      await page
        .getByRole('button', { name: 'Wireframe', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
  });

  await check(
    '390px mobile layout fits and collection/element controls remain usable',
    async () => {
      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      const small = await mobile.newPage();
      small.on('pageerror', (error) => errors.push(error.message));
      await small.goto(baseURL, { waitUntil: 'networkidle' });
      await canvasReady(small);
      assert.equal(
        await small.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        true,
        'Mobile page has no horizontal overflow',
      );
      if (captureScreenshot) {
        await mkdir('docs', { recursive: true });
        await small.screenshot({ path: 'docs/workbench-mobile.png', fullPage: true });
      }
      await small.getByRole('button', { name: 'Open collection', exact: true }).click();
      await small.getByRole('button', { name: 'Explore all 118 elements', exact: true }).focus();
      await small.keyboard.press('Tab');
      assert.equal(
        await small
          .locator('.library-panel')
          .evaluate((panel) => panel.contains(document.activeElement)),
        true,
        'Mobile collection traps keyboard focus',
      );
      await small.keyboard.press('Escape');
      assert.equal(
        await small
          .locator('.library-panel')
          .evaluate((panel) => panel.classList.contains('mobile-open')),
        false,
      );
      assert.equal(
        await small
          .getByRole('button', { name: 'Open collection', exact: true })
          .evaluate((button) => document.activeElement === button),
        true,
      );
      await small.getByRole('button', { name: 'Open collection', exact: true }).click();
      await small.locator('.molecule-card').filter({ hasText: 'Water' }).click();
      assert.equal((await state(small)).scene.atoms.length, 3);
      await small.getByRole('button', { name: 'Open collection', exact: true }).click();
      await small.getByRole('button', { name: 'Explore all 118 elements', exact: true }).click();
      const dialog = small.getByRole('dialog', { name: 'Element library', exact: true });
      const box = await dialog.boundingBox();
      assert(
        box && box.x >= 0 && box.x + box.width <= 391,
        'Element dialog fits the mobile screen',
      );
      await dialog
        .getByRole('textbox', { name: 'Search elements by name, symbol, or atomic number' })
        .fill('Hydrogen');
      await dialog.getByRole('button', { name: 'Add H to canvas', exact: true }).click();
      assert.equal((await state(small)).scene.atoms.length, 4);
      await mobile.close();
    },
  );

  await check('WebGL unavailable shows recovery UI and preserves editing/export', async () => {
    const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await fallbackContext.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
        return original.call(this, kind, ...args);
      };
    });
    const fallback = await fallbackContext.newPage();
    fallback.on('pageerror', (error) => errors.push(error.message));
    await fallback.goto(baseURL, { waitUntil: 'networkidle' });
    await fallback.getByText('3D view is unavailable', { exact: true }).waitFor();
    await fallback.getByRole('button', { name: 'Retry 3D view', exact: true }).click();
    await fallback.getByText('3D view is unavailable', { exact: true }).waitFor();
    await fallback.locator('.molecule-card').filter({ hasText: 'Water' }).click();
    assert.equal((await state(fallback)).scene.atoms.length, 3);
    await fallback.getByRole('button', { name: 'Add Carbon', exact: true }).click();
    assert.equal((await state(fallback)).scene.atoms.length, 4);
    await fallback.getByRole('button', { name: 'Atomic structure', exact: true }).click();
    await fallback
      .getByText('3D lattice preview is unavailable in this browser.', { exact: false })
      .waitFor();
    const [download] = await Promise.all([
      fallback.waitForEvent('download'),
      fallback.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    assert.match(download.suggestedFilename(), /\.json$/);
    await fallbackContext.close();
  });

  await page.locator('.molecule-card').filter({ hasText: 'Benzene' }).click();
  await page.getByRole('button', { name: 'Ball & stick', exact: true }).click();
  const closeInspector = page.getByRole('button', { name: 'Close element inspector', exact: true });
  if (await closeInspector.count()) await closeInspector.click();
  await canvasReady();
  if (captureScreenshot) {
    await mkdir('docs', { recursive: true });
    await page.screenshot({ path: 'docs/workbench.png', fullPage: true });
    console.log('Screenshot saved: docs/workbench.png');
  }
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  console.log(`\n${reports.length} browser workflows passed.`);
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page
    .screenshot({ path: 'test-results/browser-failure.png', fullPage: true })
    .catch(() => {});
  console.error(error);
  if (errors.length) console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
