import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium, devices, firefox, webkit } from 'playwright-core';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const fixture = join(root, 'tests/fixtures/dynamic-3d.html');
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const edgePath = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const firefoxPath = process.env.FIREFOX_PATH || 'C:/Program Files/Mozilla Firefox/firefox.exe';

assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');
assert.ok(existsSync(bundle), 'Build dist/index.js before running compatibility stress tests');

const contentType = file => file.endsWith('.js') ? 'text/javascript; charset=utf-8'
  : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/bundle.js' ? bundle : pathname.startsWith('/assets/')
    ? join(assets, pathname.slice('/assets/'.length)) : fixture;
  try {
    response.setHeader('Content-Type', contentType(file));
    response.setHeader('Cache-Control', 'no-store');
    response.end(readFileSync(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(String(error));
  }
});

const withoutDefaultBrowser = descriptor => {
  const { defaultBrowserType: _defaultBrowserType, ...context } = descriptor;
  return context;
};
const iphone = withoutDefaultBrowser(devices['iPhone 13']);
const ipad = withoutDefaultBrowser(devices['iPad Pro 11']);
const pixel = withoutDefaultBrowser(devices['Pixel 5']);
const desktopViewport = { width: 1366, height: 900 };
const macViewport = { width: 1440, height: 900 };
const windowsChromeUa = version => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`;
const windowsEdgeUa = version => windowsChromeUa(version) + ` Edg/${version}.0.0.0`;
const windowsFirefoxUa = version => `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
const macChromeUa = token => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ${token} Safari/537.36`;
const macFirefoxUa = `Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:153.0) Gecko/20100101 Firefox/153.0`;
const macSafariUa = `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15`;
const androidChromeUa = token => `Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ${token} Mobile Safari/537.36`;
const androidFirefoxUa = `Mozilla/5.0 (Android 15; Mobile; rv:153.0) Gecko/153.0 Firefox/153.0`;
const iosUa = token => `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${token} Mobile/15E148 Safari/604.1`;

const desktop = userAgent => ({ viewport: desktopViewport, screen: desktopViewport, userAgent });
const macDesktop = userAgent => ({ viewport: macViewport, screen: macViewport, userAgent });
const android = userAgent => ({ ...pixel, userAgent });
const ios = userAgent => ({ ...iphone, userAgent });

const profiles = [
  { id: 'win10-chrome-installed', os: 'Windows 10', browser: 'Chrome', runner: 'chrome-installed', evidence: 'installed-browser', context: {} },
  { id: 'win10-edge-installed', os: 'Windows 10', browser: 'Edge', runner: 'edge-installed', evidence: 'installed-browser', context: {} },
  { id: 'win10-brave-chromium', os: 'Windows 10', browser: 'Brave', runner: 'chromium', evidence: 'chromium-family-profile', context: desktop(windowsChromeUa(151)) },
  { id: 'win10-chromium', os: 'Windows 10', browser: 'Chromium', runner: 'chromium', evidence: 'engine-os-profile', context: desktop(windowsChromeUa(151)) },
  { id: 'win10-firefox', os: 'Windows 10', browser: 'Firefox', runner: 'firefox', evidence: 'engine-os-profile', context: desktop(windowsFirefoxUa(153)) },

  { id: 'win11-edge', os: 'Windows 11', browser: 'Edge', runner: 'chromium', evidence: 'engine-os-profile', context: desktop(windowsEdgeUa(151)) },
  { id: 'win11-chrome', os: 'Windows 11', browser: 'Chrome', runner: 'chromium', evidence: 'engine-os-profile', context: desktop(windowsChromeUa(151)) },
  { id: 'win11-brave', os: 'Windows 11', browser: 'Brave', runner: 'chromium', evidence: 'chromium-family-profile', context: desktop(windowsChromeUa(151)) },
  { id: 'win11-chromium', os: 'Windows 11', browser: 'Chromium', runner: 'chromium', evidence: 'engine-os-profile', context: desktop(windowsChromeUa(151)) },
  { id: 'win11-firefox', os: 'Windows 11', browser: 'Firefox', runner: 'firefox', evidence: 'engine-os-profile', context: desktop(windowsFirefoxUa(153)) },

  { id: 'macos-edge', os: 'macOS', browser: 'Edge', runner: 'chromium', evidence: 'engine-os-profile', context: macDesktop(macChromeUa('Chrome/151.0.0.0 Edg/151.0.0.0')) },
  { id: 'macos-chrome', os: 'macOS', browser: 'Chrome', runner: 'chromium', evidence: 'engine-os-profile', context: macDesktop(macChromeUa('Chrome/151.0.0.0')) },
  { id: 'macos-brave', os: 'macOS', browser: 'Brave', runner: 'chromium', evidence: 'chromium-family-profile', context: macDesktop(macChromeUa('Chrome/151.0.0.0')) },
  { id: 'macos-chromium', os: 'macOS', browser: 'Chromium', runner: 'chromium', evidence: 'engine-os-profile', context: macDesktop(macChromeUa('Chrome/151.0.0.0')) },
  { id: 'macos-firefox', os: 'macOS', browser: 'Firefox', runner: 'firefox', evidence: 'engine-os-profile', context: macDesktop(macFirefoxUa) },
  { id: 'macos-safari', os: 'macOS', browser: 'Safari', runner: 'webkit', evidence: 'webkit-os-profile', context: macDesktop(macSafariUa) },

  { id: 'ios-edge', os: 'iOS', browser: 'Edge', runner: 'webkit', evidence: 'webkit-device-profile', context: ios(iosUa('EdgiOS/151.0')) },
  { id: 'ios-chrome', os: 'iOS', browser: 'Chrome', runner: 'webkit', evidence: 'webkit-device-profile', context: ios(iosUa('CriOS/151.0.0.0')) },
  { id: 'ios-brave', os: 'iOS', browser: 'Brave', runner: 'webkit', evidence: 'webkit-device-profile', context: ios(iosUa('Version/18.5')) },
  { id: 'ios-firefox', os: 'iOS', browser: 'Firefox', runner: 'webkit', evidence: 'webkit-device-profile', context: ios(iosUa('FxiOS/153.0')) },
  { id: 'ios-safari-iphone', os: 'iOS', browser: 'Safari', runner: 'webkit', evidence: 'webkit-device-profile', context: ios(iosUa('Version/18.5')) },
  { id: 'ios-safari-ipad', os: 'iOS', browser: 'Safari iPad', runner: 'webkit', evidence: 'webkit-device-profile', context: { ...ipad } },

  { id: 'android-edge', os: 'Android', browser: 'Edge', runner: 'chromium', evidence: 'engine-device-profile', context: android(androidChromeUa('Chrome/151.0.0.0 EdgA/151.0.0.0')) },
  { id: 'android-chrome', os: 'Android', browser: 'Chrome', runner: 'chromium', evidence: 'engine-device-profile', context: android(androidChromeUa('Chrome/151.0.0.0')) },
  { id: 'android-brave', os: 'Android', browser: 'Brave', runner: 'chromium', evidence: 'chromium-family-profile', context: android(androidChromeUa('Chrome/151.0.0.0')) },
  { id: 'android-chromium', os: 'Android', browser: 'Chromium', runner: 'chromium', evidence: 'engine-device-profile', context: android(androidChromeUa('Chrome/151.0.0.0')) },
  { id: 'android-firefox', os: 'Android', browser: 'Firefox', runner: 'firefox', evidence: 'engine-device-profile', context: { viewport: pixel.viewport, screen: pixel.screen, deviceScaleFactor: pixel.deviceScaleFactor, hasTouch: true, userAgent: androidFirefoxUa } }
];

const unsupported = [
  { os: 'Windows 10', browser: 'Safari', reason: 'No Safari release in the five-year window' },
  { os: 'Windows 11', browser: 'Safari', reason: 'Safari is not distributed for current Windows' },
  { os: 'iOS', browser: 'Chromium', reason: 'No standalone iOS Chromium binary is available to this local Windows harness; the iOS-branded profiles run on WebKit' },
  { os: 'Android', browser: 'Safari', reason: 'Safari is not distributed for Android' }
];

const launchers = {
  chromium: () => chromium.launch({ headless: true }),
  firefox: () => firefox.launch({ headless: true }),
  webkit: () => webkit.launch({ headless: true }),
  'chrome-installed': () => chromium.launch({ headless: true, executablePath: chromePath }),
  'edge-installed': () => chromium.launch({ headless: true, executablePath: edgePath })
};

const runProfile = async (profile, browser, url) => {
  const started = performance.now();
  const context = await browser.newContext({
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    ...profile.context
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const browserErrors = [];
  const failedLocalRequests = [];
  page.on('pageerror', error => browserErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push('console: ' + message.text());
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(url)) failedLocalRequests.push(request.url() + ': ' + request.failure()?.errorText);
  });
  await page.addInitScript(() => {
    window.__compatFrameGaps = [];
    window.__compatLongTasks = [];
    let previous = 0;
    const tick = now => {
      if (previous && now - previous > 34) window.__compatFrameGaps.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__compatLongTasks.push(entry.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {}
  });

  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.evaluate(() => window.profileReady());
  const readyMs = performance.now() - started;
  await page.mouse.move(2, 2);
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    window.__compatFrameGaps.length = 0;
    window.__compatLongTasks.length = 0;
  });

  const initial = await page.evaluate(() => ({
    coordinates: Object.fromEntries(['A', 'B', 'C'].map(name => {
      const point = window.__points.raum[name];
      return [name, [point.X(), point.Y(), point.Z()]];
    })),
    mode: window.__boards.raum.__liaSceneMode,
    domNodes: document.getElementsByTagName('*').length
  }));
  assert.equal(initial.mode, '3d', `${profile.id}: initial scene mode`);

  const boardBox = await page.locator('.jxgbox').boundingBox();
  assert.ok(boardBox && boardBox.width > 250 && boardBox.height > 250, `${profile.id}: invalid board size`);
  const interactionStarted = performance.now();
  const phaseMetrics = [];
  const finishPhase = async name => {
    const data = await page.evaluate(() => {
      const result = {
        maxFrameGapMs: Math.max(0, ...window.__compatFrameGaps),
        frameGaps: window.__compatFrameGaps.length,
        longTasks: window.__compatLongTasks.length
      };
      window.__compatFrameGaps.length = 0;
      window.__compatLongTasks.length = 0;
      return result;
    });
    phaseMetrics.push({ name, ...data });
  };
  const point = (x, y) => ({ x: boardBox.x + boardBox.width * x, y: boardBox.y + boardBox.height * y });

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const panStart = point(0.72, 0.74);
    const panEnd = { x: panStart.x + 18 - iteration * 4, y: panStart.y - 12 + iteration * 3 };
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(panEnd.x, panEnd.y, { steps: 4 });
    await page.mouse.up({ button: 'left' });
  }
  await finishPhase('pan');

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const rotateStart = point(0.62, 0.62);
    const rotateEnd = { x: rotateStart.x + 16 + iteration * 3, y: rotateStart.y + 11 - iteration * 2 };
    await page.mouse.move(rotateStart.x, rotateStart.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(rotateEnd.x, rotateEnd.y, { steps: 4 });
    await page.mouse.up({ button: 'right' });
  }
  await finishPhase('rotation');

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await page.mouse.move(point(0.55, 0.55).x, point(0.55, 0.55).y);
    const deltaY = iteration % 2 ? 100 : -100;
    if (profile.os === 'iOS') {
      await page.evaluate(value => {
        const container = window.__boards.raum.containerObj;
        const rect = container.getBoundingClientRect();
        container.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          deltaY: value
        }));
      }, deltaY);
    } else {
      await page.mouse.wheel(0, deltaY);
    }
  }
  await finishPhase('zoom');

  await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const container = window.__boards.raum.containerObj;
    const trigger = container.querySelector('.lia-coordinate-scene-mode-button');
    for (const mode of ['2d', '3d', '2d', '3d']) {
      trigger.click();
      container.querySelector(`.lia-coordinate-scene-mode-option[data-mode="${mode}"]`).click();
      await wait(45);
    }
    for (const selector of ['.lia-dgs-polygon-button', '.lia-dgs-round2d-button', '.lia-dgs-plane3d-button', '.lia-dgs-solid3d-button', '.lia-dgs-round3d-button']) {
      const button = container.querySelector(selector);
      if (!button || button.hidden) continue;
      button.click();
      await wait(20);
      const openMenus = [...container.querySelectorAll('[data-open="1"]')]
        .filter(node => node.matches('.lia-dgs-sectioned-submenu,.lia-dgs-shape-submenu,.lia-dgs-relation-submenu,.lia-dgs-segment6-submenu'));
      if (openMenus.length > 1) throw Error(`Multiple submenus open after ${selector}`);
    }
    container.querySelector('.lia-dgs-select-button')?.click();
    await wait(80);
  });
  await finishPhase('mode-and-menus');
  const interactionMs = performance.now() - interactionStarted;

  const final = await page.evaluate(() => {
    const board = window.__boards.raum;
    const entry = window.__coordinateViews3d.raum;
    const coordinates = Object.fromEntries(['A', 'B', 'C'].map(name => {
      const point = window.__points.raum[name];
      return [name, [point.X(), point.Y(), point.Z()]];
    }));
    const invalidAttributes = [];
    for (const element of document.querySelectorAll('[d],[x],[y],[cx],[cy],[x1],[x2],[y1],[y2],[transform]')) {
      for (const attribute of ['d', 'x', 'y', 'cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'transform']) {
        const value = element.getAttribute(attribute);
        if (value && /(?:NaN|Infinity|undefined)/.test(value)) invalidAttributes.push(`${element.tagName}.${attribute}=${value}`);
      }
    }
    const rect = board.containerObj.getBoundingClientRect();
    const viewport = { width: innerWidth, height: innerHeight };
    const metricLabels = [...entry.decorations].filter(object => object.elType === 'text3d')
      .map(object => String(object.element2D?.plaintext ?? '').trim()).filter(Boolean);
    return {
      coordinates,
      mode: board.__liaSceneMode,
      domNodes: document.getElementsByTagName('*').length,
      invalidAttributes,
      profileErrors: (window.profileErrors || []).slice(),
      frameGaps: window.__compatFrameGaps.slice(),
      longTasks: window.__compatLongTasks.slice(),
      boardRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport,
      metricLabelCount: metricLabels.length,
      finiteMetrics: metricLabels.every(label => !/(?:NaN|Infinity|undefined)/.test(label)),
      visibleSvgObjects: board.containerObj.querySelectorAll('svg path,svg line,svg circle,svg polygon,canvas').length,
      userAgent: navigator.userAgent
    };
  });

  assert.deepEqual(final.coordinates, initial.coordinates, `${profile.id}: camera input changed object coordinates`);
  assert.equal(final.mode, '3d', `${profile.id}: mode did not return to 3D`);
  assert.deepEqual(final.invalidAttributes, [], `${profile.id}: non-finite SVG attributes`);
  assert.deepEqual(final.profileErrors, [], `${profile.id}: fixture errors`);
  assert.deepEqual(failedLocalRequests, [], `${profile.id}: failed local requests`);
  assert.deepEqual(browserErrors, [], `${profile.id}: browser errors`);
  assert.ok(final.metricLabelCount >= 9 && final.finiteMetrics, `${profile.id}: invalid axis metrics`);
  assert.ok(final.visibleSvgObjects >= 10, `${profile.id}: scene did not render`);
  assert.ok(final.domNodes <= initial.domNodes + 250, `${profile.id}: excessive DOM growth`);
  assert.ok(readyMs < 30_000, `${profile.id}: initialization took ${readyMs.toFixed(0)} ms`);
  assert.ok(interactionMs < 20_000, `${profile.id}: interactions took ${interactionMs.toFixed(0)} ms`);
  const tailFrameGap = Math.max(0, ...final.frameGaps);
  phaseMetrics.push({ name: 'tail', maxFrameGapMs: tailFrameGap, frameGaps: final.frameGaps.length, longTasks: final.longTasks.length });
  const maxFrameGap = Math.max(0, ...phaseMetrics.map(phase => phase.maxFrameGapMs));
  assert.ok(maxFrameGap < 1_000, `${profile.id}: main-thread stall ${maxFrameGap.toFixed(0)} ms ${JSON.stringify(phaseMetrics)}`);

  await context.close();
  return {
    id: profile.id,
    os: profile.os,
    browser: profile.browser,
    evidence: profile.evidence,
    engineVersion: browser.version(),
    readyMs: Math.round(readyMs),
    interactionMs: Math.round(interactionMs),
    maxFrameGapMs: Math.round(maxFrameGap),
    longTasks: phaseMetrics.reduce((sum, phase) => sum + phase.longTasks, 0),
    phaseMetrics,
    viewport: `${final.viewport.width}x${final.viewport.height}`,
    boardWidth: Math.round(final.boardRect.width),
    userAgent: final.userAgent
  };
};

const runInstalledFirefoxSmoke = async url => {
  if (!existsSync(firefoxPath)) return { status: 'not-installed' };
  const directory = mkdtempSync(join(tmpdir(), 'lia-coordinate-firefox-smoke-'));
  const screenshot = join(directory, 'firefox.png');
  const profile = join(directory, 'profile');
  try {
    await execFileAsync(firefoxPath, [
      '--headless', '--no-remote', '--profile', profile,
      '--window-size', '1366,900', '--screenshot', screenshot, url
    ], { timeout: 45_000, windowsHide: true, maxBuffer: 2_000_000 });
    assert.ok(existsSync(screenshot) && statSync(screenshot).size > 10_000,
      'Installed Firefox did not create a meaningful screenshot');
    return { status: 'render-smoke-passed', screenshotBytes: statSync(screenshot).size };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const browsers = new Map();
const results = [];
const failures = [];
const profileFilter = process.env.COMPAT_PROFILE;
const selectedProfiles = profileFilter ? profiles.filter(profile => profile.id.includes(profileFilter)) : profiles;
assert.ok(selectedProfiles.length > 0, `No compatibility profile matches COMPAT_PROFILE=${profileFilter}`);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (const runner of [...new Set(selectedProfiles.map(profile => profile.runner))]) {
    const browser = await launchers[runner]();
    browsers.set(runner, browser);
    try {
      for (const profile of selectedProfiles.filter(candidate => candidate.runner === runner)) {
        try {
          const result = await runProfile(profile, browser, url);
          results.push({ ...result, status: 'passed' });
          console.log(`COMPAT_PROFILE_OK ${profile.id} ready=${result.readyMs}ms interactions=${result.interactionMs}ms frameGap=${result.maxFrameGapMs}ms`);
        } catch (error) {
          failures.push({ id: profile.id, error: String(error?.stack || error) });
          console.error(`COMPAT_PROFILE_FAILED ${profile.id}\n${String(error?.stack || error)}`);
        }
      }
    } finally {
      await browser.close().catch(() => {});
      browsers.delete(runner);
    }
  }
  let installedFirefox = { status: 'not-run-for-filtered-matrix' };
  if (!profileFilter) {
    try {
      installedFirefox = await runInstalledFirefoxSmoke(url);
    } catch (error) {
      installedFirefox = { status: 'failed', error: String(error?.stack || error) };
      failures.push({ id: 'win10-firefox-installed-render', error: installedFirefox.error });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    executed: results.length,
    failed: failures.length,
    results,
    installedFirefox,
    unsupported,
    limitations: [
      'OS profiles change browser-visible device parameters; they do not virtualize an operating-system kernel.',
      'WebKit is Safari-compatible engine coverage, not an Apple-signed Safari binary.',
      'Brave profiles validate Chromium-family compatibility; Brave-specific shields are not emulated.',
      'Historical versions are covered by the Browserslist/Babel boundary test, not by historical browser binaries.'
    ]
  };
  console.log('COMPATIBILITY_STRESS_REPORT ' + JSON.stringify(report));
  assert.deepEqual(failures, [], `${failures.length} compatibility profiles failed`);
} finally {
  for (const browser of browsers.values()) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
