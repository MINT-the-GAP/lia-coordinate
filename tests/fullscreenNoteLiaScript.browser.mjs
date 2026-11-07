import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const fixture = join(root, 'tests/fixtures/fullscreen-note-course.md');
const devServerPackage = join(root, 'node_modules/@liascript/devserver');
const devServer = join(devServerPackage, 'dist/lib.js');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const require = createRequire(import.meta.url);
const liaScriptServer = require(devServer);

assert.ok(existsSync(devServer), 'Install @liascript/devserver before running this test');
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');
assert.ok(existsSync(join(root, 'dist/index.js')), 'Build dist/index.js before running this test');

const reservePort = async () => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
};

const testRoot = mkdtempSync(join(tmpdir(), 'lia-fullscreen-note-course-'));
mkdirSync(join(testRoot, 'assets'));
mkdirSync(join(testRoot, 'dist'));
writeFileSync(join(testRoot, 'README.md'), readFileSync(fixture));
copyFileSync(join(assets, 'jsxgraph-template.js'), join(testRoot, 'assets/jsxgraph-template.js'));
copyFileSync(join(root, 'dist/index.js'), join(testRoot, 'dist/index.js'));

let browser;
try {
  const port = await reservePort();
  liaScriptServer.init(devServerPackage, join(root, 'node_modules'));
  await liaScriptServer.start(
    port,
    '127.0.0.1',
    join(testRoot, 'README.md'),
    undefined,
    false,
    false,
    false
  );

  const baseUrl = 'http://127.0.0.1:' + port;
  let serverReady = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/README.md');
      if (response.ok) {
        serverReady = true;
        break;
      }
    } catch {}
    await sleep(100);
  }
  assert.equal(serverReady, true, 'LiaScript DevServer did not start');

  const executablePath = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].find(path => path && existsSync(path));
  assert.ok(executablePath, 'No browser found; set CHROME_PATH or EDGE_PATH');

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu', '--disable-extensions', '--disable-component-update']
  });
  const context = await browser.newContext({
    viewport: { width: 640, height: 760 },
    colorScheme: 'dark',
    hasTouch: true,
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleMessages = [];
  page.on('pageerror', error => pageErrors.push(String(error.stack || error)));
  page.on('console', message => consoleMessages.push(message.type() + ': ' + message.text()));

  const courseUrl = baseUrl + '/liascript/index.html?' + baseUrl + '/README.md';
  await page.goto(courseUrl, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() =>
      window.__boards?.A1?.containerObj &&
      window.__boards?.B2?.containerObj &&
      document.querySelectorAll('.lia-fullscreen-note-start[data-board-id="A1"]').length === 3 &&
      window.__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar') &&
      window.__boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
    , null, { timeout: 60_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      body: document.body?.innerText?.slice(0, 4000) || '',
      boards: Object.keys(window.__boards || {}),
      coordinateHosts: document.querySelectorAll('lia-coordinate-board').length,
      starts: Array.from(document.querySelectorAll('.lia-fullscreen-note-start'))
        .map(marker => ({ id: marker.id, boardId: marker.getAttribute('data-board-id') })),
      scripts: Array.from(document.scripts).map(script => script.src).filter(Boolean).slice(-10)
    }));
    throw new Error('Real LiaScript course did not initialize: ' +
      JSON.stringify({ diagnostic, pageErrors, consoleMessages }), { cause: error });
  }

  const embedded = await page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll(
      '.lia-fullscreen-note-start[data-board-id="A1"]'
    ));
    const first = markers.find(marker => {
      const endId = marker.id.replace('-start-', '-end-');
      const end = document.getElementById(endId);
      if (!end) return false;
      const range = document.createRange();
      range.setStartAfter(marker);
      range.setEndBefore(end);
      return range.cloneContents().textContent?.includes('Zeichne die Funktion');
    });
    const end = first && document.getElementById(first.id.replace('-start-', '-end-'));
    const sourceHost = document.createElement('div');
    const allSourceHost = document.createElement('div');
    if (first && end) {
      const range = document.createRange();
      range.setStartAfter(first);
      range.setEndBefore(end);
      sourceHost.appendChild(range.cloneContents());
    }
    markers.forEach(marker => {
      const markerEnd = document.getElementById(marker.id.replace('-start-', '-end-'));
      if (!markerEnd) return;
      const range = document.createRange();
      range.setStartAfter(marker);
      range.setEndBefore(markerEnd);
      allSourceHost.appendChild(range.cloneContents());
    });
    const firstBar = __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    const secondBar = __boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    return {
      sourceText: sourceHost.textContent.replace(/\s+/g, ' ').trim(),
      sourceStrong: sourceHost.querySelector('strong')?.textContent || null,
      sourceListItems: sourceHost.querySelectorAll('li').length,
      sourceMath: !!allSourceHost.querySelector('lia-formula, mjx-container, .formula, .lia-formula, .katex'),
      barMath: !!firstBar.querySelector('lia-formula, mjx-container, .formula, .lia-formula, .katex'),
      formulaState: (() => {
        const original = document.querySelector(
          'lia-formula:not([data-lia-fullscreen-note-formula])'
        );
        const mirrored = firstBar.querySelector('lia-formula');
        const probe = document.createElement('lia-formula');
        return {
          originalFormula: original?.formula,
          mirroredFormula: mirrored?.formula,
          originalRendered: !!original?.shadowRoot?.querySelector('.katex'),
          mirroredRendered: !!mirrored?.shadowRoot?.querySelector('.katex'),
          mirroredFresh: mirrored?.dataset.liaFullscreenNoteFormula,
          detachedProbeHasShadow: !!probe.shadowRoot
        };
      })(),
      firstEntries: firstBar.querySelectorAll('.lia-dgs-fullscreen-note-entry').length,
      secondEntries: secondBar.querySelectorAll('.lia-dgs-fullscreen-note-entry').length,
      firstDisplay: getComputedStyle(firstBar).display,
      secondDisplay: getComputedStyle(secondBar).display,
      firstTitle: firstBar.querySelector('.lia-dgs-fullscreen-note-title')?.textContent,
      secondTitle: secondBar.querySelector('.lia-dgs-fullscreen-note-title')?.textContent,
      errors: window.__liaCoordinateErrors || []
    };
  });
  assert.match(embedded.sourceText, /Zeichne die Funktion/, JSON.stringify(embedded));
  assert.equal(embedded.sourceStrong, 'Aufgabe:');
  assert.equal(embedded.sourceListItems, 2);
  assert.equal(embedded.sourceMath, true, JSON.stringify(embedded));
  assert.equal(embedded.barMath, true, JSON.stringify(embedded));
  assert.deepEqual(embedded.formulaState, {
    originalFormula: 'g(x)=x^2',
    mirroredFormula: 'g(x)=x^2',
    originalRendered: true,
    mirroredRendered: true,
    mirroredFresh: '1',
    detachedProbeHasShadow: false
  });
  assert.equal(embedded.firstEntries, 3);
  assert.equal(embedded.secondEntries, 1);
  assert.equal(embedded.firstDisplay, 'none');
  assert.equal(embedded.secondDisplay, 'none');
  assert.equal(embedded.firstTitle, 'Vollbildnotizen');
  assert.equal(embedded.secondTitle, 'Fullscreen notes');

  await page.waitForFunction(() => {
    const container = __boards.A1.containerObj;
    const button = container.querySelector(
      '.lia-dgs-menu-button:not(.lia-dgs-standalone-set-square-button)'
    );
    const menu = button && container.getRootNode().getElementById(
      button.getAttribute('aria-controls')
    );
    return menu?.dataset.open === '1';
  });
  const menuState = await page.evaluate(() => {
    const container = __boards.A1.containerObj;
    const button = container.querySelector(
      '.lia-dgs-menu-button:not(.lia-dgs-standalone-set-square-button)'
    );
    const menu = button && container.getRootNode().getElementById(
      button.getAttribute('aria-controls')
    );
    return {
      open: menu?.dataset.open,
      expanded: button?.getAttribute('aria-expanded'),
      setSquareVisible: container.querySelector('.lia-dgs-set-square-overlay')?.dataset.visible
    };
  });
  assert.deepEqual(menuState, { open: '1', expanded: 'true', setSquareVisible: '1' });
  assert.equal(pageErrors.length, 0, JSON.stringify({ pageErrors, consoleMessages }));
  const fullscreenPoint = await page.evaluate(() => {
    const rect = __boards.A1.containerObj
      .querySelector('.lia-dgs-fullscreen-button').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(fullscreenPoint.x, fullscreenPoint.y);
  await page.waitForFunction(() => {
    const container = __boards.A1.containerObj;
    return container.getRootNode().fullscreenElement === container ||
      document.fullscreenElement === container;
  });
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '1'
  );
  await sleep(80);

  const moving = await page.evaluate(() => {
    const bar = __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    const transform = getComputedStyle(bar).transform;
    const match = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
    return {
      transform,
      translateY: match ? Number(match[1]) : 0,
      height: bar.getBoundingClientRect().height
    };
  });
  assert.ok(moving.translateY >= 0 && moving.translateY < moving.height, JSON.stringify(moving));
  await sleep(300);

  const fullscreen = await page.evaluate(() => {
    const container = __boards.A1.containerObj;
    const firstBar = container.querySelector('.lia-dgs-fullscreen-note-bar');
    const secondBar = __boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    const toggle = firstBar.querySelector('.lia-dgs-fullscreen-note-toggle');
    const menu = container.querySelector('.lia-dgs-top-menu-end');
    const themedMenu = container.querySelector('.lia-dgs-top-menu');
    const barRect = firstBar.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    return {
      open: firstBar.dataset.open,
      fullscreen: firstBar.dataset.fullscreen,
      expanded: toggle.getAttribute('aria-expanded'),
      iconText: firstBar.querySelector('.lia-dgs-fullscreen-note-toggle-icon')?.textContent,
      iconBorder: getComputedStyle(
        firstBar.querySelector('.lia-dgs-fullscreen-note-toggle-icon'), '::before'
      ).borderRightWidth,
      dividerHeight: getComputedStyle(toggle, '::before').height,
      dividerContent: getComputedStyle(toggle, '::before').content,
      labelHeight: firstBar.querySelector('.lia-dgs-fullscreen-note-toggle-label')
        .getBoundingClientRect().height,
      labelBorder: getComputedStyle(
        firstBar.querySelector('.lia-dgs-fullscreen-note-toggle-label')
      ).borderTopWidth,
      toggleHeight: toggle.getBoundingClientRect().height,
      toggleWidth: toggle.getBoundingClientRect().width,
      barWidth: barRect.width,
      dividerOffset: Math.abs(
        toggle.getBoundingClientRect().top + toggle.getBoundingClientRect().height / 2 - barRect.top
      ),
      controls: toggle.getAttribute('aria-controls'),
      label: toggle.getAttribute('aria-label'),
      regionLabel: firstBar.querySelector('[role="region"]')?.getAttribute('aria-label'),
      display: getComputedStyle(firstBar).display,
      transform: getComputedStyle(firstBar).transform,
      background: getComputedStyle(firstBar).backgroundColor,
      border: getComputedStyle(firstBar).borderTopColor,
      menuBackground: getComputedStyle(themedMenu).backgroundColor,
      height: barRect.height,
      viewportHeight: innerHeight,
      scrollable: firstBar.querySelector('.lia-dgs-fullscreen-note-viewport').scrollHeight >
        firstBar.querySelector('.lia-dgs-fullscreen-note-viewport').clientHeight,
      menuSeparated: menuRect.bottom <= barRect.top,
      layering: {
        bar: Number(getComputedStyle(firstBar).zIndex),
        menu: Number(getComputedStyle(container.querySelector('.lia-dgs-menu-clip')).zIndex),
        panel: Number(getComputedStyle(container.querySelector('.lia-dgs-side-menu-clip')).zIndex),
        instrument: Number(getComputedStyle(container.querySelector('.lia-dgs-set-square-overlay')).zIndex),
        dialog: Number(getComputedStyle(container.querySelector('.lia-dgs-function-dialog')).zIndex)
      },
      setSquareButtonVisible: !!container.querySelector('.lia-dgs-set-square-button')
        ?.getClientRects().length,
      secondDisplay: getComputedStyle(secondBar).display,
      secondFullscreen: secondBar.dataset.fullscreen
    };
  });
  assert.equal(fullscreen.open, '1');
  assert.equal(fullscreen.fullscreen, '1');
  assert.equal(fullscreen.expanded, 'true');
  assert.equal(fullscreen.iconText, '');
  assert.equal(fullscreen.iconBorder, '2px');
  assert.equal(fullscreen.dividerHeight, '1px');
  assert.equal(fullscreen.dividerContent, '""');
  assert.equal(fullscreen.labelHeight, 24);
  assert.equal(fullscreen.labelBorder, '1px');
  assert.equal(fullscreen.toggleHeight, 32);
  assert.ok(fullscreen.toggleWidth >= fullscreen.barWidth - 1);
  assert.ok(fullscreen.dividerOffset < 1);
  assert.ok(fullscreen.controls);
  assert.equal(fullscreen.label, 'Vollbildnotizen ausblenden');
  assert.equal(fullscreen.regionLabel, 'Vollbildnotizen');
  assert.equal(fullscreen.display, 'flex');
  assert.equal(fullscreen.transform, 'matrix(1, 0, 0, 1, 0, 0)');
  assert.equal(fullscreen.background, fullscreen.menuBackground);
  assert.ok(fullscreen.height <= fullscreen.viewportHeight * 0.35 + 2);
  assert.equal(fullscreen.scrollable, true);
  assert.equal(fullscreen.menuSeparated, true);
  assert.ok(fullscreen.layering.instrument < fullscreen.layering.bar);
  assert.ok(fullscreen.layering.bar < fullscreen.layering.panel);
  assert.ok(fullscreen.layering.bar < fullscreen.layering.menu);
  assert.ok(fullscreen.layering.bar < fullscreen.layering.dialog);
  assert.equal(fullscreen.setSquareButtonVisible, true);
  assert.equal(fullscreen.secondDisplay, 'none');
  assert.equal(fullscreen.secondFullscreen, '0');

  if (process.env.FULLSCREEN_NOTE_SCREENSHOT) {
    await page.screenshot({ path: process.env.FULLSCREEN_NOTE_SCREENSHOT });
  }

  const themeVariants = await page.evaluate(() => {
    const container = __boards.A1.containerObj;
    const bar = container.querySelector('.lia-dgs-fullscreen-note-bar');
    const label = bar.querySelector('.lia-dgs-fullscreen-note-toggle-label');
    const read = () => ({
      background: getComputedStyle(bar).backgroundColor,
      color: getComputedStyle(bar).color,
      border: getComputedStyle(label).borderTopColor
    });
    const original = {
      background: container.style.getPropertyValue('--lia-dgs-menu-bg'),
      color: container.style.getPropertyValue('--lia-dgs-neutral-color'),
      accent: container.style.getPropertyValue('--lia-dgs-theme-color')
    };
    container.style.setProperty('--lia-dgs-menu-bg', '#18212a');
    container.style.setProperty('--lia-dgs-neutral-color', '#f4f7fa');
    container.style.setProperty('--lia-dgs-theme-color', '#47b8ff');
    const dark = read();
    container.style.setProperty('--lia-dgs-menu-bg', '#ffffff');
    container.style.setProperty('--lia-dgs-neutral-color', '#172024');
    container.style.setProperty('--lia-dgs-theme-color', '#007d87');
    const light = read();
    container.style.setProperty('--lia-dgs-menu-bg', original.background);
    container.style.setProperty('--lia-dgs-neutral-color', original.color);
    container.style.setProperty('--lia-dgs-theme-color', original.accent);
    return { dark, light };
  });
  assert.deepEqual({
    dark: {
      background: themeVariants.dark.background,
      color: themeVariants.dark.color
    },
    light: {
      background: themeVariants.light.background,
      color: themeVariants.light.color
    }
  }, {
    dark: { background: 'rgb(24, 33, 42)', color: 'rgb(244, 247, 250)' },
    light: { background: 'rgb(255, 255, 255)', color: 'rgb(23, 32, 36)' }
  });
  assert.notEqual(themeVariants.dark.border, 'rgba(0, 0, 0, 0)');
  assert.notEqual(themeVariants.light.border, 'rgba(0, 0, 0, 0)');
  assert.notEqual(themeVariants.dark.border, themeVariants.light.border);

  const togglePoint = await page.evaluate(() => {
    const rect = __boards.A1.containerObj
      .querySelector('.lia-dgs-fullscreen-note-toggle').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(togglePoint.x, togglePoint.y);
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '0'
  );
  await page.evaluate(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-toggle').focus()
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '1'
  );
  const keyboardState = await page.evaluate(() => {
    const toggle = __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-toggle');
    return {
      focused: toggle.getRootNode().activeElement === toggle,
      expanded: toggle.getAttribute('aria-expanded')
    };
  });
  assert.deepEqual(keyboardState, { focused: true, expanded: 'true' });
  await page.touchscreen.tap(togglePoint.x, togglePoint.y);
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '0'
  );
  await page.touchscreen.tap(togglePoint.x, togglePoint.y);
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '1'
  );
  assert.equal(await page.evaluate(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-toggle')
      .getAttribute('aria-expanded')
  ), 'true');

  const beforeInteraction = await page.evaluate(() => ({
    bbox: __boards.A1.getBoundingBox().slice(),
    objects: Object.keys(__boards.A1.objects || {}).length,
    heading: document.querySelector('h1')?.textContent
  }));
  const notePoint = await page.evaluate(() => {
    const rect = __boards.A1.containerObj
      .querySelector('.lia-dgs-fullscreen-note-entry strong').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(notePoint.x, notePoint.y);
  await page.mouse.move(notePoint.x, notePoint.y);
  await page.mouse.down();
  await page.mouse.move(notePoint.x + 18, notePoint.y + 8);
  await page.mouse.up();
  await page.mouse.wheel(0, 260);
  await page.evaluate(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-toggle').focus()
  );
  await page.keyboard.press('ArrowRight');
  await sleep(100);
  const afterInteraction = await page.evaluate(() => ({
    bbox: __boards.A1.getBoundingBox().slice(),
    objects: Object.keys(__boards.A1.objects || {}).length,
    heading: document.querySelector('h1')?.textContent,
    open: __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open,
    scrollTop: __boards.A1.containerObj
      .querySelector('.lia-dgs-fullscreen-note-viewport').scrollTop
  }));
  assert.deepEqual({
    bbox: afterInteraction.bbox,
    objects: afterInteraction.objects,
    heading: afterInteraction.heading,
    open: afterInteraction.open
  }, { ...beforeInteraction, open: '1' });
  assert.ok(afterInteraction.scrollTop > 0);

  const exitPoint = await page.evaluate(() => {
    const rect = __boards.A1.containerObj
      .querySelector('.lia-dgs-fullscreen-button').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(exitPoint.x, exitPoint.y);
  await page.waitForFunction(() => {
    const container = __boards.A1.containerObj;
    return container.getRootNode().fullscreenElement !== container &&
      document.fullscreenElement !== container;
  });
  await page.waitForFunction(() =>
    getComputedStyle(__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')).display === 'none'
  );

  const oldBoardIdentity = await page.evaluate(() => {
    window.__fullscreenNoteOldBoard = __boards.A1;
    document.body.focus();
    return !!window.__fullscreenNoteOldBoard;
  });
  assert.equal(oldBoardIdentity, true);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() =>
    document.body.textContent.includes('Diese Folie prüft das saubere Entfernen')
  );
  await page.waitForFunction(() =>
    !window.__boards?.A1?.containerObj?.isConnected ||
    !window.__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
  );
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() =>
    window.__boards?.A1?.containerObj?.isConnected &&
    window.__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar') &&
    document.body.textContent.includes('Zeichne die Funktion')
  , null, { timeout: 60_000 });
  const revisited = await page.evaluate(() => ({
    replaced: __boards.A1 !== window.__fullscreenNoteOldBoard,
    bars: __boards.A1.containerObj.querySelectorAll('.lia-dgs-fullscreen-note-bar').length,
    entries: __boards.A1.containerObj.querySelectorAll('.lia-dgs-fullscreen-note-entry').length,
    display: getComputedStyle(
      __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
    ).display
  }));
  assert.deepEqual(revisited, { replaced: true, bars: 1, entries: 3, display: 'none' });

  assert.deepEqual(pageErrors, []);
  console.log('PASS real LiaScript macro expansion, fullscreen UX, input modes, themes, and slide lifecycle');
} finally {
  try { await browser?.close(); } catch {}
  try { liaScriptServer.stop(); } catch {}
  if (resolve(testRoot).startsWith(resolve(tmpdir()))) {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch {}
  }
}
