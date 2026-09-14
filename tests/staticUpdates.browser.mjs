import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const browserPath = [process.env.CHROME_PATH, process.env.EDGE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean).find(existsSync);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const diagnosticOnly = process.env.STATIC_UPDATE_BASELINE === '1';
const bundleDirectory = process.env.STATIC_UPDATE_BUNDLES || join(root, 'dist');
const assets = new Map();
async function remoteAsset(url) {
  if (!assets.has(url)) assets.set(url, (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, 'MathJax download failed: ' + url);
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  })());
  return assets.get(url);
}

async function waitFor(predicate, message, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    assert.ok(Date.now() < deadline, 'Timed out: ' + message);
    await delay(25);
  }
}

test('three original Superposition SVGs update selectively and stay idle during scroll and touch zoom', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable found' : false,
  timeout: 180000
}, async context => {
  for (const mode of ['static', 'index']) await context.test(mode + ' bundle', { timeout: 85000 }, async () => {
    const bundle = join(bundleDirectory, mode + '.js');
    assert.ok(existsSync(bundle), 'Run npm run build: missing ' + bundle);
    const server = createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      const file = path.endsWith('/' + mode + '.js') ? bundle :
        path.endsWith('/static-superposition.json') ? join(root, 'tests/fixtures/static-superposition.json') :
        join(root, 'tests/fixtures/static-selective-updates.html');
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' :
        file.endsWith('.json') ? 'application/json' : 'text/html');
      response.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const profile = mkdtempSync(join(tmpdir(), 'lia-static-updates-'));
    const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run',
      '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
      '--disable-component-update', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    browser.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
    let socket, sequence = 0, gateSeen = false, release;
    const released = new Promise(resolve => { release = resolve; });
    const pending = new Map();
    const transfers = new Set();
    const protocolErrors = [];
    try {
      const portFile = join(profile, 'DevToolsActivePort');
      await waitFor(() => existsSync(portFile), 'browser CDP: ' + stderr, 15000);
      const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
      await once(socket, 'open');
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 40000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
      socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        if (message.id) {
          const job = pending.get(message.id);
          if (!job) return;
          pending.delete(message.id);
          clearTimeout(job.timer);
          if (message.error) job.reject(Error(JSON.stringify(message.error)));
          else job.resolve(message.result);
        } else if (message.method === 'Fetch.requestPaused') {
          const event = message.params;
          const transfer = (async () => {
            const body = await remoteAsset(event.request.url);
            if (/\/output\/svg\.js(?:[?#]|$)/.test(event.request.url)) {
              gateSeen = true;
              await released;
            }
            await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
              responseHeaders: [{ name: 'content-type', value: 'application/javascript' },
                { name: 'access-control-allow-origin', value: '*' }], body });
          })().catch(error => protocolErrors.push(String(error)));
          transfers.add(transfer);
          transfer.finally(() => transfers.delete(transfer));
        }
      });
      const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      const settle = async () => {
        await delay(150);
        await waitFor(() => evaluate('staticUpdatesFixture.ready()'), 'all 20 real TeX labels');
        assert.deepEqual(protocolErrors, []);
      };
      const snapshot = () => evaluate('staticUpdatesFixture.snapshot()');
      const save = () => evaluate('staticUpdatesFixture.save()');
      const reports = {};
      const measure = async (name, action, same, options = {}) => {
        await save();
        await action();
        await settle();
        const value = await snapshot();
        reports[name] = value;
        assert.deepEqual(value.errors, []);
        assert.equal(value.svgCount, 3);
        assert.equal(value.vectorCount, 16);
        assert.equal(value.readyCount, 20);
        assert.equal(value.jsxBoardCount, 0);
        if (!diagnosticOnly) {
          assert.deepEqual(value.svgSame, same, name + ': SVG identities');
          if (same.every(Boolean)) {
            assert.deepEqual(value.geometrySame, same, name + ': geometry identities');
            assert.deepEqual(value.labelsSame, same, name + ': TeX identities');
            assert.equal(value.bboxReads, 0, name + ': no label getBBox');
            assert.equal(value.clientRectsReads, 0, name + ': no label getClientRects');
            assert.equal(value.textLengthReads, 0, name + ': no text measurements');
          } else {
            same.forEach((unchanged, index) => {
              if (unchanged) {
                assert.equal(value.geometrySame[index], true, name + ': unaffected geometry ' + index);
                assert.equal(value.labelsSame[index], true, name + ': unaffected TeX ' + index);
              }
            });
          }
          if (options.maxMarkerSearches !== undefined) assert.ok(
            value.markerSearches <= options.maxMarkerSearches,
            name + ': document-wide marker searches: ' + value.markerSearches);
          assert.equal(value.svgInsertions, same.filter(same => !same).length,
            name + ': no extra output-triggered render');
        }
        return value;
      };
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
      await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/tests/fixtures/static-selective-updates.html?bundle=' + mode });
      await waitFor(() => gateSeen || protocolErrors.length, 'delayed real MathJax SVG component');
      assert.deepEqual(protocolErrors, []);
      await waitFor(() => evaluate('document.querySelectorAll("[data-lia-static-svg]").length === 3'), 'initial SVGs');
      assert.equal(await evaluate('document.querySelectorAll("[data-lia-static-tex=pending]").length'), 20);
      await save();
      release();
      await settle();
      reports.lateTex = await snapshot();
      assert.equal(reports.lateTex.readyCount, 20);
      if (!diagnosticOnly) assert.deepEqual(reports.lateTex.svgSame, [true, true, true], 'late TeX preserves board SVGs');
      for (const label of reports.lateTex.labelBounds.flat()) {
        assert.ok(label.width > 0 && label.height > 0, 'real TeX has measurable glyphs');
      }

      await measure('idle', () => delay(700), [true, true, true], { maxMarkerSearches: 0 });
      await measure('unrelatedRootChanges', () => evaluate('(async () => { for (let i=0;i<12;i++) { staticUpdatesFixture.unrelated(i); await new Promise(resolve => requestAnimationFrame(resolve)); } })()'), [true, true, true]);
      await evaluate('staticUpdatesFixture.sameStyle()');
      await settle();
      await measure('identicalCssWrites', () => evaluate('(async () => { let records=0; const observer=new MutationObserver(changes => records+=changes.length); observer.observe(document.documentElement,{attributes:true,attributeFilter:["style"]}); for(let i=0;i<6;i++) { staticUpdatesFixture.sameStyle(); await new Promise(resolve=>requestAnimationFrame(resolve)); } observer.disconnect(); window.identicalCssMutationRecords=records; })()'), [true, true, true]);
      reports.identicalCssMutationRecords = await evaluate('window.identicalCssMutationRecords');
      if (mode === 'index') await measure('explicitBootstrap', () => evaluate('window.__coord.bootstrapStaticCoordinateBoards()'), [true, true, true], { maxMarkerSearches: 1 });
      const beforeVector = await snapshot();
      const afterVector = await measure('oneVectorEdit', () => evaluate('staticUpdatesFixture.editVector()'), [true, false, true], { maxMarkerSearches: 1 });
      assert.notDeepEqual(afterVector.vectorEndpoints[1], beforeVector.vectorEndpoints[1], 'edited endpoint reaches SVG');
      const afterLabel = await measure('oneLabelEdit', () => evaluate('staticUpdatesFixture.editText()'), [true, false, true], { maxMarkerSearches: 1 });
      assert.notEqual(afterLabel.labelContent[1][0], afterVector.labelContent[1][0], 'edited TeX reaches SVG');
      const afterBoard = await measure('oneBoardEdit', () => evaluate('staticUpdatesFixture.editBoard()'), [true, false, true], { maxMarkerSearches: mode === 'index' ? 3 : 1 });
      assert.notEqual(afterBoard.viewBoxes[1], afterLabel.viewBoxes[1], 'edited bounds reach SVG');
      const beforeTheme = await snapshot();
      const afterTheme = await measure('realTheme', () => evaluate('staticUpdatesFixture.theme()'), [false, true, false], { maxMarkerSearches: 1 });
      assert.notEqual(afterTheme.axisStrokes[0], beforeTheme.axisStrokes[0], 'axes adapt to actual body background');
      assert.equal(afterTheme.vectorStrokes[1], beforeTheme.vectorStrokes[1], 'explicit vector color remains');
      await measure('hiddenAndRevealed', async () => {
        await evaluate('staticUpdatesFixture.hide()'); await delay(100);
        await evaluate('staticUpdatesFixture.reveal()');
      }, [true, true, true]);
      await measure('slideRemount', () => evaluate('staticUpdatesFixture.remount()'), [true, false, true]);
      await measure('renderHiddenSlide', async () => {
        await evaluate('staticUpdatesFixture.addHidden()');
        await settle();
        await evaluate('staticUpdatesFixture.reveal()');
      }, [true, false, true]);
      const visible = await snapshot();
      for (const label of visible.labelBounds.flat()) assert.ok(label.width > 0 && label.height > 0);

      await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      await settle();
      await send('Page.bringToFront');
      await evaluate('scrollTo(0, 0)');
      await measure('touchScroll', async () => {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 450, id: 1 }] });
        for (let step = 1; step <= 12; step++) {
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 450-step*25, id: 1 }] });
          await delay(20);
        }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }, [true, true, true], { maxMarkerSearches: 0 });
      assert.ok(reports.touchScroll.scrollY > 0, 'touch gesture really scrolls the fixture');
      await delay(250);
      await measure('touchPinch', async () => {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
          { x: 160, y: 350, id: 2 }, { x: 240, y: 350, id: 3 }
        ] });
        for (let step = 1; step <= 12; step++) {
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
            { x: 160-step*5, y: 350, id: 2 }, { x: 240+step*5, y: 350, id: 3 }
          ] });
          await delay(20);
        }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }, [true, true, true], { maxMarkerSearches: 0 });
      assert.ok(reports.touchPinch.viewportScale > 1, 'touch gesture really changes visual viewport scale');
      await measure('finalIdle', () => delay(700), [true, true, true], { maxMarkerSearches: 0 });
      const compact = Object.fromEntries(Object.entries(reports).map(([key, value]) => [key,
        typeof value !== 'object' ? value : {
          svgSame: value.svgSame, svgInsertions: value.svgInsertions,
          markerSearches: value.markerSearches, bboxReads: value.bboxReads,
          clientRectsReads: value.clientRectsReads, textLengthReads: value.textLengthReads,
          scrollY: value.scrollY, viewportScale: value.viewportScale
        }]));
      console.log('Static selective update browser metrics ' + mode +
        (diagnosticOnly ? ' BASELINE: ' : ': '), JSON.stringify(compact));
    } finally {
      release();
      await Promise.allSettled([...transfers]);
      socket?.close();
      browser.kill();
      if (browser.exitCode === null) await once(browser, 'exit');
      const profileTarget = resolve(profile);
      const withinTemp = relative(resolve(tmpdir()), profileTarget);
      assert.ok(withinTemp && !withinTemp.startsWith('..') && !withinTemp.includes('..\\'));
      rmSync(profileTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
