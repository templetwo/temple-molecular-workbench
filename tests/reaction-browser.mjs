import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

// Reaction Lab, species card, and unit toggle against Vite or the offline packaged
// build. Every number asserted below is arithmetic over the quoted Chase 1998 values
// in src/data/species.ts; nothing here is a prediction.
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
const externalRequests = [];
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
    externalRequests.push(url.href);
    return route.abort('internetdisconnected');
  }
  return route.continue();
});
const page = await context.newPage();
const errors = [];
const reports = [];
page.on('pageerror', (error) => errors.push(error.message));
const frames = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const storage = (key) => page.evaluate((k) => localStorage.getItem(k), key);
const dialog = page.getByRole('dialog', { name: 'Reaction lab', exact: true });
const thermo = dialog.locator('.reaction-thermo');
async function check(name, callback) {
  await callback();
  reports.push(name);
  console.log(`PASS ${name}`);
}
async function expectThermo(pattern) {
  await page.waitForFunction(
    ({ source, flags }) =>
      new RegExp(source, flags).test(
        document.querySelector('[role="dialog"] .reaction-thermo')?.textContent ?? '',
      ),
    { source: pattern.source, flags: pattern.flags },
  );
}

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('.scene-viewport canvas, .scene-fallback').first().waitFor();
  let sceneBefore = '';

  await check('the species card cites identity and Chase 1998 thermochemistry for methane', async () => {
    await page.locator('.molecule-card').filter({ hasText: 'Methane' }).click();
    const card = page.getByRole('region', { name: /Methane identity and thermochemistry/ });
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, /74-82-8/, 'hyphenated CAS');
    assert.match(text, /VNWKTOKETHGBQD-UHFFFAOYSA-N/, 'InChIKey');
    assert.match(text, /-74\.87/, 'quoted Chase 1998 ΔfH°');
    assert.match(text, /186\.25/, 'quoted Chase 1998 S°');
    for (const name of ['NIST WebBook', 'CCCBDB', 'PubChem']) {
      const link = card.getByRole('link', { name: new RegExp(name) });
      assert.match(await link.getAttribute('href'), /^https:\/\//, name);
    }
    assert.doesNotMatch(text, /predict/i);
  });

  await check('benzene keeps its identity while its formation data stays unavailable', async () => {
    await page.locator('.molecule-card').filter({ hasText: 'Benzene' }).click();
    const card = page.getByRole('region', { name: /Benzene identity and thermochemistry/ });
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, /71-43-2/);
    assert.match(text, /Not available/);
    assert.equal((await card.locator('[data-appearance="unavailable"]').count()) >= 1, true);
  });

  await check('the Reaction lab opens on methane combustion and totals the quoted numbers', async () => {
    await frames();
    sceneBefore = await storage('molecule-studio:scene:v1');
    await page.getByRole('button', { name: 'Reaction lab', exact: true }).click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /does not predict/i);
    assert.match(
      await dialog.locator('.reaction-equation').innerText(),
      /1 CH4\(g\) \+ 2 O2\(g\) → 1 CO2\(g\) \+ 2 H2O\(l\)/,
    );
    // ΔrH° = [−393.52 + 2(−285.83)] − [−74.87 + 0] = −890.31 kJ/mol
    await expectThermo(/ΔrH°\s*-890\.31 kJ\/mol/);
    // ΔrS° = [213.79 + 2(69.95)] − [186.25 + 2(205.15)] = −242.86 J/mol/K → ΔrG° = −817.90 kJ/mol
    await expectThermo(/ΔrG°\s*-817\.90 kJ\/mol/);
    assert.match(await thermo.innerText(), /K\s*[0-9.]+e\+143/);
    assert.equal(await thermo.locator('[data-appearance="measured_evaluated"]').count(), 3);
    // CO2 44.009 u over CH4 16.043 u + 2 O2 63.996 u = 55.0%, from the CIAAW masses on the bench
    assert.match(await dialog.locator('.reaction-stoich').innerText(), /Atom economy \(first product\)\s*55\.0%/);
    if (capture) {
      await mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/reaction-lab.png', fullPage: true });
    }
  });

  await check('switching the water phase changes the enthalpy by the quoted difference', async () => {
    await dialog.getByLabel('Product 2', { exact: true }).selectOption('water-g');
    // [−393.52 + 2(−241.83)] − (−74.87) = −802.31 kJ/mol
    await expectThermo(/ΔrH°\s*-802\.31 kJ\/mol/);
    await dialog.getByLabel('Product 2', { exact: true }).selectOption('water-l');
    await expectThermo(/ΔrH°\s*-890\.31 kJ\/mol/);
  });

  await check('an unavailable formation enthalpy makes every total unavailable, never zero', async () => {
    await dialog.getByLabel('Reactant 1', { exact: true }).selectOption('benzene-g');
    // 2 C6H6 + 15 O2 → 12 CO2 + 6 H2O balances within the coefficient bound
    assert.match(
      await dialog.locator('.reaction-equation').innerText(),
      /2 C6H6\(g\) \+ 15 O2\(g\) → 12 CO2\(g\) \+ 6 H2O\(l\)/,
    );
    await expectThermo(/ΔrH°\s*Not available/);
    const text = await thermo.innerText();
    assert.match(text, /ΔrG°\s*Not available/);
    assert.match(text, /K\s*Not available/);
    assert.doesNotMatch(text, /0\.00 kJ/);
    assert.equal(await thermo.locator('[data-appearance="unavailable"]').count(), 3);
    await dialog.getByLabel('Reactant 1', { exact: true }).selectOption('methane-g');
    await expectThermo(/ΔrH°\s*-890\.31 kJ\/mol/);
  });

  await check('limiting reagent and theoretical moles follow the declared amounts', async () => {
    const stoich = dialog.locator('.reaction-stoich');
    assert.match(await stoich.innerText(), /Limiting reagent\s*Methane/);
    await dialog.getByLabel('Moles of reactant 2', { exact: true }).fill('1');
    await page.waitForFunction(
      () => /Limiting reagent\s*Oxygen/.test(document.querySelector('[role="dialog"] .reaction-stoich')?.textContent ?? ''),
    );
    assert.match(await stoich.innerText(), /0\.500 CO2\(g\), 1\.000 H2O\(l\)/);
    await dialog.getByLabel('Moles of reactant 2', { exact: true }).fill('2');
  });

  await check('an unbalanceable declaration fails with a labeled reason and no totals', async () => {
    await dialog.getByLabel('Product 1', { exact: true }).selectOption('ammonia-g');
    await dialog.getByLabel('Product 2', { exact: true }).selectOption('hydrogen-g');
    const failure = dialog.locator('.reaction-failure');
    await failure.waitFor();
    assert.ok(await failure.getAttribute('data-kind'));
    assert.equal(await thermo.count(), 0);
    assert.equal(await dialog.locator('.reaction-equation').count(), 0);
    await dialog.getByLabel('Product 1', { exact: true }).selectOption('carbon-dioxide-g');
    await dialog.getByLabel('Product 2', { exact: true }).selectOption('water-l');
    await expectThermo(/ΔrH°\s*-890\.31 kJ\/mol/);
  });

  await check('closing the lab leaves the bench, its saved scene, and focus intact', async () => {
    await dialog.getByRole('button', { name: 'Add reactant', exact: true }).focus();
    for (const key of ['1', '2', '3', 'Delete', 'Control+z', 'Meta+z']) await page.keyboard.press(key);
    assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Reaction lab',
    );
    await frames();
    assert.equal(await storage('molecule-studio:scene:v1'), sceneBefore);
    const saved = JSON.parse(sceneBefore);
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.units, 'angstrom', 'the scene keeps its coordinate unit, nothing else');
    assert.doesNotMatch(sceneBefore, /kcal|kJ|Btu|reaction|unitSystem/);
  });

  await check('the unit toggle converts exactly, persists on its own key, and never touches the scene', async () => {
    await page.locator('.molecule-card').filter({ hasText: 'Methane' }).click();
    const card = page.getByRole('region', { name: /Methane identity and thermochemistry/ });
    await card.waitFor();
    await frames();
    const sceneAtStart = await storage('molecule-studio:scene:v1');
    const headerUnits = () =>
      page.locator('.header-actions').getByRole('group', { name: 'Unit system', exact: true });
    await headerUnits().locator('select').nth(1).selectOption('kcal/mol');
    await page.waitForFunction(() => /-17\.89/.test(document.querySelector('.species-card')?.textContent ?? ''));
    assert.match(await card.innerText(), /-17\.89/, 'ΔfH° −74.87 kJ/mol = −17.89 kcal/mol');
    await page.getByRole('button', { name: 'Reaction lab', exact: true }).click();
    await dialog.waitFor();
    // −890.31 kJ/mol ÷ 4.184 = −212.79 kcal/mol
    await expectThermo(/ΔrH°\s*-212\.79 kcal\/mol/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.match(await storage('molecule-studio:units:v1'), /kcal/);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await headerUnits().locator('select').nth(1).inputValue(), 'kcal/mol');
    await headerUnits().locator('select').nth(1).selectOption('kJ/mol');
    await frames();
    assert.equal(await storage('molecule-studio:scene:v1'), sceneAtStart);
  });

  await check('390px keeps the Reaction lab inside the viewport', async () => {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: engine === 'chromium',
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const mobile = await mobileContext.newPage();
    try {
      await mobile.goto(baseURL, { waitUntil: 'networkidle' });
      await mobile.getByRole('button', { name: 'Reaction lab', exact: true }).click();
      const modal = mobile.getByRole('dialog', { name: 'Reaction lab', exact: true });
      await modal.waitFor();
      await modal.locator('.reaction-thermo').waitFor();
      const box = await modal.boundingBox();
      assert.ok(box.x >= -1 && box.x + box.width <= 391, 'dialog stays inside the narrow viewport');
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
      if (capture) {
        await mkdir('test-results', { recursive: true });
        await mobile.screenshot({ path: 'test-results/reaction-lab-mobile.png' });
      }
    } finally {
      await mobileContext.close();
    }
  });

  assert.deepEqual(errors, [], 'no unhandled browser errors');
  assert.deepEqual(externalRequests, [], 'the Reaction lab must work offline');
  if (production) {
    const sourceRequests = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((pathname) => pathname.startsWith('/src/') || pathname.includes('/@vite/')),
    );
    assert.deepEqual(sourceRequests, [], 'production verification must not import development modules');
  }
  console.log(
    `\n${reports.length} reaction browser workflows passed (${engine}${production ? ', production bundle' : ''}; external networking blocked).`,
  );
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/reaction-failure.png', fullPage: true }).catch(() => {});
  console.error(error);
  if (errors.length) console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
