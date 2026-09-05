import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Works against Vite or the offline production bundle. Every mutation uses real
// UI controls. Vite-only, read-only assertions additionally inspect the actual
// rendered point geometry and complete undo history; production imports no src.
const baseURL =
  process.env.TEST_BASE_URL ||
  (process.argv.includes('--production') ? 'http://127.0.0.1:5178' : 'http://127.0.0.1:5173');
const origin = new URL(baseURL).origin;
const capture = process.argv.includes('--screenshot') || process.env.CAPTURE_SCREENSHOT === '1';
const data = JSON.parse(
  await readFile(new URL('../src/data/hydrogen-bond.json', import.meta.url), 'utf8'),
);
const chrome =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const failedRequests = [];
const externalRequests = [];
const reports = [];
const storageKey = 'molecule-studio:scene:v1';

async function newContext(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    ...options,
  });
  context.setDefaultTimeout(30_000);
  // No external fonts, scripts, data services, or computation are required.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
      externalRequests.push(url.href);
      return route.abort('internetdisconnected');
    }
    await route.continue();
  });
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    page.on('response', (response) => {
      if (new URL(response.url()).origin === origin && response.status() >= 400)
        failedRequests.push(`${response.status()} ${response.url()}`);
    });
  });
  return context;
}

const context = await newContext();
const page = await context.newPage();
let development = false;
let roots;

async function frames(target = page) {
  await target.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function saved(target = page) {
  return target.evaluate((key) => {
    const value = localStorage.getItem(key);
    if (!value) throw new Error('The workspace must have been saved by a real edit');
    return JSON.parse(value);
  }, storageKey);
}

async function benchState() {
  if (!development) return null;
  return page.evaluate(async () => {
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name))
      .filter((url) => url.pathname === '/src/state/store.ts')
      .sort((a, b) => Number(b.searchParams.get('t') || 0) - Number(a.searchParams.get('t') || 0));
    const { useBench } = await import(urls[0].href);
    const state = useBench.getState();
    return JSON.parse(
      JSON.stringify({
        scene: JSON.parse(state.exportScene()),
        mode: state.mode,
        selectedId: state.selectedId,
        bondSourceId: state.bondSourceId,
        cardSym: state.cardSym,
        past: state.past,
        future: state.future,
      }),
    );
  });
}

async function canvasReady(target = page, selector = '[data-testid="electron-scene"] canvas') {
  const canvas = target.locator(selector);
  await canvas.waitFor({ state: 'visible' });
  await target.waitForFunction((selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas || canvas.width < 100 || canvas.height < 100) return false;
    const gl = canvas.getContext('webgl2');
    return gl && !gl.isContextLost();
  }, selector);
  await frames(target);
  return canvas;
}

async function cloudMetrics() {
  if (!development) return null;
  if (!roots)
    roots = await page.evaluateHandle(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => new URL(name).pathname.endsWith('/@react-three_fiber.js'));
      if (!url) throw new Error('The actual Fiber module was not loaded');
      return (await import(url))._roots;
    });
  // The polling predicate is deliberately synchronous: import/await first, then
  // wait for the mounted renderer rather than a truthy unresolved Promise.
  await page.waitForFunction((roots) => {
    const canvas = document.querySelector('[data-testid="electron-scene"] canvas');
    const state = roots.get(canvas)?.store.getState();
    if (!state?.internal?.active || typeof state.gl?.getContext !== 'function') return false;
    let ready = false;
    state.scene.traverse((object) => {
      if (object.isPoints && object.geometry.attributes.position?.count > 1000) ready = true;
    });
    return ready;
  }, roots);
  return page.evaluate((roots) => {
    const canvas = document.querySelector('[data-testid="electron-scene"] canvas');
    const state = roots.get(canvas).store.getState();
    let position;
    const nuclei = [];
    state.scene.traverse((object) => {
      if (object.isPoints && !position) position = object.geometry.attributes.position;
      if (object.isMesh && object.geometry.type === 'SphereGeometry') {
        nuclei.push(object.getWorldPosition(object.position.clone()).toArray());
      }
    });
    let nearPlane = 0,
      nodeBand = 0,
      innerBand = 0,
      outerBand = 0,
      radiusSum = 0;
    const fingerprint = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        y = position.getY(i),
        z = position.getZ(i);
      const radius = Math.hypot(x, y, z);
      if (![x, y, z].every(Number.isFinite))
        throw new Error('Cloud geometry contains non-finite values');
      if (Math.abs(z) / radius < 0.1) nearPlane++;
      if (radius >= 0.95 && radius < 1.15) nodeBand++;
      if (radius >= 0.55 && radius < 0.75) innerBand++;
      if (radius >= 1.55 && radius < 1.75) outerBand++;
      radiusSum += radius;
      if (i < 24) fingerprint.push(x, y, z);
    }
    return {
      count: position.count,
      nearPlane,
      nodeBand,
      innerBand,
      outerBand,
      meanRadius: radiusSum / position.count,
      fingerprint,
      nuclei,
      camera: state.camera.position.toArray(),
    };
  }, roots);
}

async function cloudImage() {
  const canvas = await canvasReady();
  await cloudMetrics();
  await frames();
  return createHash('sha256')
    .update(await canvas.screenshot())
    .digest('hex');
}

async function screenshot(name, target = page) {
  if (!capture) return;
  await mkdir('test-results', { recursive: true });
  await target.screenshot({
    path: `test-results/electrons-${name}.png`,
    fullPage: name !== 'mobile',
  });
  if (name === '2p' || name === 'bond') {
    await target.screenshot({
      path: name === '2p' ? 'docs/electron-lab.png' : 'docs/hydrogen-bond.png',
      fullPage: true,
    });
  }
}

async function energyAt(index, target = page) {
  const step = data.steps[index];
  await target.waitForFunction(
    ({ index, distance, energy }) => {
      const slider = document.querySelector('input[aria-label="Nuclear separation"]');
      const shownDistance = document.querySelector('[data-testid="bond-distance"]')?.textContent;
      const shownEnergy = document.querySelector('[data-testid="bond-energy"]')?.textContent;
      return (
        slider?.value === String(index) &&
        shownDistance &&
        shownEnergy &&
        Math.abs(Number(shownDistance) - distance) < 0.0051 &&
        Math.abs(Number(shownEnergy) - energy) < 0.00051
      );
    },
    { index, distance: step.distanceAngstrom, energy: step.relativeEnergyEv },
  );
  const curve = target.locator('.electron-energy-curve svg');
  assert.match(await curve.getAttribute('aria-label'), /relative to two separated hydrogen atoms/);
  assert.equal(await curve.locator('.energy-sample').count(), data.steps.length);
  const points = await curve.locator('.energy-sample').evaluateAll((elements) =>
    elements.map((element) => ({
      x: Number(element.getAttribute('cx')),
      y: Number(element.getAttribute('cy')),
    })),
  );
  const energies = data.steps.map((value) => value.relativeEnergyEv);
  const minimumEnergy = Math.min(...energies),
    maximumEnergy = Math.max(...energies);
  const minimumY = Math.min(...points.map((value) => value.y)),
    maximumY = Math.max(...points.map((value) => value.y));
  for (let i = 0; i < points.length; i++) {
    const xFraction = (points[i].x - points[0].x) / (points.at(-1).x - points[0].x);
    const distanceFraction =
      (data.steps[i].distanceAngstrom - data.steps[0].distanceAngstrom) /
      (data.steps.at(-1).distanceAngstrom - data.steps[0].distanceAngstrom);
    const yFraction = (maximumY - points[i].y) / (maximumY - minimumY);
    const energyFraction = (energies[i] - minimumEnergy) / (maximumEnergy - minimumEnergy);
    assert.ok(
      Math.abs(xFraction - distanceFraction) < 1e-8,
      `Curve point ${i} must plot the computed separation on its linear axis`,
    );
    assert.ok(
      Math.abs(yFraction - energyFraction) < 1e-8,
      `Curve point ${i} must plot the computed energy, not a decorative curve`,
    );
  }
  for (const coordinate of ['cx', 'cy']) {
    assert.equal(
      await curve.getByTestId('energy-selected-point').getAttribute(coordinate),
      await curve.locator('.energy-sample').nth(index).getAttribute(coordinate),
    );
  }
  return step;
}

async function check(name, action) {
  await action();
  reports.push(name);
  console.log(`PASS ${name}`);
}

try {
  console.log(`Opening Electron Lab browser checks at ${baseURL}`);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  development = (await page.locator('script[src*="@vite/client"]').count()) > 0;
  await canvasReady(page, '.scene-viewport canvas');
  await page.locator('.molecule-card').filter({ hasText: 'Water' }).click();
  await page.getByRole('button', { name: 'Add Carbon', exact: true }).click();
  const addedGraph = await saved();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Wireframe', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle atom labels', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle reference grid', exact: true }).click();
  await page.getByRole('button', { name: /^Your atoms/ }).click();
  await page.locator('.atom-list-item').first().click();
  const baseline = await saved();
  const baselineState = await benchState();
  assert.equal(baseline.atoms.length, 3);
  if (development)
    assert.ok(
      baselineState.selectedId,
      'A real selected atom is needed to test selection preservation',
    );
  assert.equal(
    await page
      .getByRole('spinbutton', { name: 'X position in ångströms', exact: true })
      .isVisible(),
    true,
  );
  assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), true);
  console.log(
    'Prepared an edited Water workspace with non-default display, selection, and pending redo.',
  );
  const dialog = page.getByRole('dialog', { name: 'Electron lab', exact: true });

  await check('Electron lab opens a real isolated WebGL probability cloud', async () => {
    await page.getByRole('button', { name: 'Electron lab', exact: true }).click();
    await dialog.waitFor({ state: 'visible' });
    await canvasReady();
    assert.equal(
      await page.locator('.scene-viewport canvas').count(),
      0,
      'Only the active learning view should retain a heavy canvas',
    );
    assert.equal(
      await dialog
        .getByRole('button', { name: '1s orbital', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.match(await dialog.innerText(), /probability per unit volume/);
    assert.match(await dialog.innerText(), /not a simulated excitation/);
    assert.match(
      await dialog.getByTestId('electron-scene').innerText(),
      /not individual electrons/,
    );
    assert.deepEqual(await saved(), baseline);
    await screenshot('1s');
  });

  await check(
    'hydrogen 1s, 2s, and 2p display different clouds with the correct nodes',
    async () => {
      const firstImage = await cloudImage();
      const first = await cloudMetrics();
      await dialog.getByRole('button', { name: '2s orbital', exact: true }).click();
      assert.equal(
        await dialog
          .getByRole('button', { name: '2s orbital', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      assert.match(await dialog.innerText(), /radial node/);
      const secondImage = await cloudImage();
      const second = await cloudMetrics();
      await dialog.getByRole('button', { name: '2p orbital', exact: true }).click();
      assert.equal(
        await dialog
          .getByRole('button', { name: '2p orbital', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      assert.match(await dialog.innerText(), /nodal plane/);
      const thirdImage = await cloudImage();
      const third = await cloudMetrics();
      assert.equal(
        new Set([firstImage, secondImage, thirdImage]).size,
        3,
        'Actual rendered pixels must change with the state',
      );
      if (development) {
        for (const cloud of [first, second, third]) assert.equal(cloud.count, 14_000);
        assert.notDeepEqual(first.fingerprint, second.fingerprint);
        assert.notDeepEqual(second.fingerprint, third.fingerprint);
        assert.ok(
          first.nearPlane / first.count > 0.075,
          'Positive control: isotropic 1s occupies the equatorial band',
        );
        assert.ok(
          third.nearPlane / third.count < 0.004,
          '2p_z strongly suppresses density at the z=0 nodal plane',
        );
        assert.ok(first.nodeBand > 100, 'Positive control: 1s has no radial gap at the 2s node');
        assert.ok(
          second.nodeBand < second.innerBand / 3 && second.nodeBand < second.outerBand / 3,
          'Rendered 2s samples retain the radial node around 2a0',
        );
        assert.ok(
          second.meanRadius > first.meanRadius * 3,
          'Excited 2s samples are genuinely more extended, despite independent camera fitting',
        );
      }
      await screenshot('2p');
    },
  );

  await check(
    'nucleus visibility and real pointer orbit/reset affect only the learning view',
    async () => {
      const nuclei = dialog.getByRole('checkbox', { name: 'Show nuclei', exact: true });
      const visibleImage = await cloudImage();
      await nuclei.uncheck();
      assert.notEqual(await cloudImage(), visibleImage);
      if (development) assert.equal((await cloudMetrics()).nuclei.length, 0);
      await nuclei.check();
      const before = await cloudMetrics();
      const canvas = await canvasReady();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.55);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 12 });
      await page.mouse.up();
      await frames();
      const orbitedImage = await cloudImage();
      assert.notEqual(
        orbitedImage,
        visibleImage,
        'A real pointer drag should rotate the rendered cloud',
      );
      if (development) assert.notDeepEqual((await cloudMetrics()).camera, before.camera);
      await dialog.getByRole('button', { name: 'Reset electron cloud view', exact: true }).click();
      await frames();
      // Floating-point camera updates need not reproduce byte-identical raster
      // edges. Check that reset visibly changes the orbited view; below, the dev
      // renderer assertion checks the fitted camera numerically to 1e-4 Å.
      assert.notEqual(
        await cloudImage(),
        orbitedImage,
        'Reset should visibly leave the orbited view, including in production',
      );
      if (development) {
        const reset = await cloudMetrics();
        assert.equal(reset.nuclei.length, 1);
        assert.ok(
          reset.camera.every((value, i) => Math.abs(value - before.camera[i]) < 0.0001),
          `Reset should restore the fitted camera: expected ${before.camera}, received ${reset.camera}`,
        );
      }
      assert.deepEqual(await saved(), baseline);
    },
  );

  await check(
    'the H2 slider, energy curve, and density use the calculated 25-point model',
    async () => {
      await dialog.getByRole('tab', { name: /A bond forms$/ }).click();
      const slider = dialog.getByRole('slider', { name: 'Nuclear separation', exact: true });
      assert.equal(await slider.getAttribute('max'), String(data.steps.length - 1));
      const far = await energyAt(data.steps.length - 1);
      const farImage = await cloudImage();
      await screenshot('far');
      assert.ok(
        Math.abs(far.relativeEnergyEv) < 0.001,
        'Separated neutral H atoms define the zero, not the minimum',
      );
      await slider.press('Home');
      const close = await energyAt(0);
      const closeImage = await cloudImage();
      assert.ok(close.relativeEnergyEv > 9);
      await screenshot('close');
      await slider.press('ArrowRight');
      await energyAt(1);
      await dialog.getByRole('button', { name: 'Lowest sampled energy', exact: true }).click();
      const minimum = await energyAt(data.equilibriumStepIndex);
      const minimumImage = await cloudImage();
      assert.equal(minimum.distanceAngstrom, 0.74);
      assert.ok(Math.abs(minimum.relativeEnergyEv - -5.554392) < 0.000001);
      assert.ok(
        minimum.relativeEnergyEv < far.relativeEnergyEv &&
          minimum.relativeEnergyEv < close.relativeEnergyEv,
      );
      assert.equal(
        new Set([farImage, closeImage, minimumImage]).size,
        3,
        'Density must change, not only the labels or curve',
      );
      if (development) {
        const cloud = await cloudMetrics();
        assert.equal(cloud.count, 18_000);
        assert.deepEqual(
          cloud.nuclei.sort((a, b) => a[0] - b[0]),
          [
            [-0.37, 0, 0],
            [0.37, 0, 0],
          ],
        );
      }
      await screenshot('bond');
      await dialog.getByText('Calculation method & limitations', { exact: true }).click();
      assert.match(
        await dialog.locator('.electron-method-details').innerText(),
        /FCI \(singlet\) \/ STO-3G/,
      );
      assert.match(
        await dialog.locator('.electron-method-details').innerText(),
        /two separated neutral H atoms/,
      );
      assert.match(
        await dialog.locator('.electron-method-details').innerText(),
        /includes nuclear repulsion/,
      );
      await slider.press('End');
      await energyAt(data.steps.length - 1);
    },
  );

  await check(
    'focus trapping and keyboard controls preserve the graph, selection, and undo/redo',
    async () => {
      const slider = dialog.getByRole('slider', { name: 'Nuclear separation', exact: true });
      await slider.focus();
      for (const key of ['1', '2', '3', 't', 'f', 'Delete', 'Backspace', 'Control+z', 'Meta+z'])
        await page.keyboard.press(key);
      assert.deepEqual(await saved(), baseline);
      if (development) assert.deepEqual(await benchState(), baselineState);
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press(i < 9 ? 'Tab' : 'Shift+Tab');
        assert.equal(
          await dialog.evaluate((element) => element.contains(document.activeElement)),
          true,
        );
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await canvasReady(page, '.scene-viewport canvas');
      assert.equal(
        await page
          .getByRole('button', { name: 'Electron lab', exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
      );
      assert.deepEqual(await saved(), baseline);
      if (development) assert.deepEqual(await benchState(), baselineState);
      assert.equal(
        await page
          .locator('.mode-controls button')
          .filter({ hasText: /^Move/ })
          .getAttribute('aria-pressed'),
        'true',
      );
      assert.equal(
        await page
          .getByRole('spinbutton', { name: 'X position in ångströms', exact: true })
          .isVisible(),
        true,
        'The originally selected atom stays selected when the lab closes',
      );
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      const redone = await saved();
      assert.deepEqual(redone.atoms, addedGraph.atoms);
      assert.deepEqual(redone.bonds, addedGraph.bonds);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual(await saved(), baseline);
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual(await saved(), baseline);
    },
  );

  await check(
    '390px mobile supports both lessons without page overflow or workspace loss',
    async () => {
      const mobileContext = await newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const mobile = await mobileContext.newPage();
      try {
        await mobile.goto(baseURL, { waitUntil: 'networkidle' });
        // A display control establishes a saved, non-default baseline without
        // assuming the mobile collection drawer starts expanded.
        await mobile.getByRole('button', { name: 'Toggle atom labels', exact: true }).click();
        const before = await saved(mobile);
        await mobile.getByRole('button', { name: 'Electron lab', exact: true }).click();
        const modal = mobile.getByRole('dialog', { name: 'Electron lab', exact: true });
        await canvasReady(mobile);
        await modal.getByRole('button', { name: '2p orbital', exact: true }).click();
        assert.equal(
          await modal
            .getByRole('button', { name: '2p orbital', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await modal.getByRole('tab', { name: /A bond forms$/ }).click();
        await modal.getByRole('button', { name: 'Lowest sampled energy', exact: true }).click();
        await energyAt(data.equilibriumStepIndex, mobile);
        await canvasReady(mobile);
        const box = await modal.boundingBox();
        assert.ok(
          box.x >= -1 && box.x + box.width <= 391,
          'Dialog stays inside the narrow viewport',
        );
        assert.equal(
          await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        assert.equal(
          await modal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
          true,
          'Dialog content must not need horizontal scrolling',
        );
        await modal.evaluate((element) => {
          element.scrollTop = 0;
        });
        await screenshot('mobile', mobile);
        await modal.getByRole('button', { name: 'Close electron lab', exact: true }).click();
        assert.deepEqual(await saved(mobile), before);
      } finally {
        await mobileContext.close();
      }
    },
  );

  await check('without WebGL, scientific lessons and energy controls remain usable', async () => {
    const fallbackContext = await newContext();
    // Explicit negative capability test only; scientific data and application
    // code are real and are never replaced with fixtures.
    await fallbackContext.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return original.call(this, type, ...args);
      };
    });
    const fallback = await fallbackContext.newPage();
    try {
      await fallback.goto(baseURL, { waitUntil: 'networkidle' });
      await fallback.locator('.molecule-card').filter({ hasText: 'Water' }).click();
      const before = await saved(fallback);
      await fallback.getByRole('button', { name: 'Electron lab', exact: true }).click();
      const modal = fallback.getByRole('dialog', { name: 'Electron lab', exact: true });
      await modal.getByText('Electron cloud view is unavailable', { exact: true }).waitFor();
      await modal.getByRole('button', { name: 'Retry electron cloud view', exact: true }).click();
      await modal.getByText('Electron cloud view is unavailable', { exact: true }).waitFor();
      await modal.getByRole('button', { name: '2s orbital', exact: true }).click();
      assert.match(await modal.innerText(), /radial node/);
      await modal.getByRole('tab', { name: /A bond forms$/ }).click();
      await modal.getByRole('button', { name: 'Lowest sampled energy', exact: true }).click();
      await energyAt(data.equilibriumStepIndex, fallback);
      assert.equal(await modal.locator('canvas').count(), 0);
      await modal.getByRole('button', { name: 'Close electron lab', exact: true }).click();
      assert.deepEqual(await saved(fallback), before);
      await fallback.getByText('3D view is unavailable', { exact: true }).waitFor();
    } finally {
      await fallbackContext.close();
    }
  });

  assert.deepEqual(errors, [], 'No unhandled browser errors');
  assert.deepEqual(failedRequests, [], 'All local runtime assets are available');
  assert.deepEqual(
    externalRequests,
    [],
    'The Electron Lab must work offline without external assets',
  );
  if (!development) {
    const sourceRequests = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((pathname) => pathname.startsWith('/src/') || pathname.includes('/@vite/')),
    );
    assert.deepEqual(
      sourceRequests,
      [],
      'Production verification must not import development modules',
    );
  }
  console.log(
    `\n${reports.length} Electron Lab browser workflows passed (${development ? 'Vite, including actual cloud geometry and full history' : 'production bundle, no source imports'}; external networking blocked).`,
  );
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page
    .screenshot({ path: 'test-results/electrons-failure.png', fullPage: true })
    .catch(() => {});
  console.error(error);
  if (errors.length) console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
