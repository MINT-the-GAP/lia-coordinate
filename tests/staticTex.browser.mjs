import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const remoteCache = new Map();

// Mirror genuine public browser dependencies through CDP. This makes component
// timing controllable without replacing MathJax/JSXGraph or depending on the
// browser's proxy/certificate setup. The test still requires internet access.
async function remoteAsset(url) {
  if (!remoteCache.has(url)) remoteCache.set(url, (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `Cannot fetch real browser dependency ${url}: ${response.status}`);
    return { body: Buffer.from(await response.arrayBuffer()).toString('base64'),
      type: response.headers.get('content-type') || 'application/javascript' };
  })());
  return remoteCache.get(url);
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      } else this.handlers.get(message.method)?.(message.params);
    });
  }
  on(method, callback) { this.handlers.set(method, callback); }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 40000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!response.exceptionDetails, 'Browser evaluation failed: ' + JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(predicate, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    assert.ok(Date.now() < deadline, 'Timed out: ' + description);
    await delay(50);
  }
}

function macroBodies(readme, prefix) {
  const source = readFileSync(join(root, readme), 'utf8');
  const body = name => {
    const match = source.match(new RegExp('^@' + name + '\\r?\\n([\\s\\S]*?)^@end', 'm'));
    assert.ok(match, `Missing @${name} in ${readme}`);
    return match[1];
  };
  return { board: body(prefix ? 'StaticCoordinateSystem_' : 'CoordinateSystem_'),
    text: body(prefix ? 'StaticCoordText_' : 'CoordText_'),
    axis: body(prefix ? 'StaticAxisLabel_' : 'AxisLabel_') };
}

function verifySnapshot(result, mode) {
  assert.deepEqual(result.errors, []);
  assert.match(result.mathJaxVersion, /^3\./);
  assert.equal(result.hostName, mode === 'normal' ? 'lia-coordinate-board' : 'div');
  assert.equal(result.svgCount, 1);
  assert.equal(result.readyCount, 9);
  assert.equal(result.pendingCount, 0);
  assert.equal(result.axisMathCount, 2);
  assert.equal(result.foreignObjectCount, 0);
  assert.equal(result.native, true);
  assert.equal(result.staticHasJsx, false);
  assert.equal(result.staticHasBoard, false);
  assert.equal(result.jsxPresent, mode === 'normal');
  assert.deepEqual(result.duplicateIds, []);
  assert.deepEqual(result.missingReferences, []);
  assert.equal(result.duplicateObjects, 0);
  assert.equal(result.detachedReadyCount, 0, 'Detached pending labels must never receive late TeX');
  assert.equal(result.detachedConnected, false);
  assert.equal(result.chtmlUnchanged, true, 'The global CHTML renderer and existing prose must be unchanged');
  assert.equal(result.interactiveUnchanged, true);
  assert.equal(result.measured.length, 9);
  const labels = Object.fromEntries(result.measured.map(label => [label.uid, label]));
  for (const uid of ['vector', 'difference', 'subscript', 'momentum', 'fraction', 'nested', 'mixed']) {
    const label = labels[uid];
    assert.ok(label, 'Missing label ' + uid + ': ' + JSON.stringify(result.measured));
    assert.equal(label.tex, 'ready', uid);
    assert.ok(label.glyphs.length > 0 && label.glyphs.every(glyph => glyph.path?.length > 10), uid + ': real font paths');
    assert.ok(label.bounds.width > 0 && label.bounds.height > 0, uid + ': visible bounds');
  }
  assert.ok(labels.vector.mathNodes.includes('mover'), 'Vector requires an accent layout');
  assert.ok(labels.vector.glyphs.some(glyph => glyph.code === '20D7'), 'Vector arrow glyph missing');
  assert.equal(labels.difference.mathNodes.filter(kind => kind === 'mover').length, 2);
  assert.ok(labels.subscript.mathNodes.includes('msub'));
  assert.ok(labels.fraction.mathNodes.includes('mfrac'));
  assert.ok(labels.nested.mathNodes.includes('mfrac'));
  assert.ok(labels.nested.mathNodes.includes('msqrt'));
  assert.equal(labels.money.tex, null);
  assert.equal(labels.money.text, String.raw`Price \$5 and \$10`);
  assert.equal(labels.vector.color, 'rgb(0, 0, 255)');
  assert.equal(labels.subscript.color, 'rgb(255, 0, 0)');
  assert.equal(labels.fraction.color, 'rgb(0, 136, 0)');
  assert.equal(Number(labels.fraction.opacity), 0.4);
  assert.equal(Number(labels.mixed.opacity), 0.6);
  assert.equal(labels.plain.tex, null);
  assert.equal(labels.plain.text, String.raw`Ordinary \vec{a} text`);
  assert.equal(labels.plain.fill, '#654321');
  assert.equal(Number(labels.plain.opacity), 0.7);
  assert.ok(labels.mixed.plainRuns.join('').includes('Force '));
  assert.ok(labels.mixed.plainRuns.join('').includes(' and '));
  assert.ok(result.ordered.indexOf('coord-text:difference') < result.ordered.indexOf('distance:order'));
  assert.ok(result.ordered.indexOf('distance:order') < result.ordered.indexOf('coord-text:subscript'));
  assert.ok(result.size.width <= result.size.viewport - 16 + 0.1, 'Responsive SVG overflow');
  assert.ok(result.size.scrollWidth <= result.size.viewport, 'Page overflow at narrow width');
  assert.ok(Math.abs(result.size.width / result.size.height - 9 / 7) < 0.01);
  const positions = { vector: [1.5, 0.35], difference: [4, 3], subscript: [6, -0.35], momentum: [5, 5], fraction: [1, 4], nested: [6.2, 2], mixed: [4, 4] };
  for (const [uid, [x, y]] of Object.entries(positions)) {
    const bounds = labels[uid].bounds;
    const expectedX = result.size.x + (x + 1) / 9 * result.size.width;
    const expectedY = result.size.y + (6 - y) / 7 * result.size.height;
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - expectedX) < 2, `${uid}: horizontal centering at ${expectedX}, got ${JSON.stringify(bounds)}`);
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - expectedY) < 2, `${uid}: vertical centering at ${expectedY}, got ${JSON.stringify(bounds)}`);
  }
  for (const [uid, x] of [['plain', 3], ['money', 2]]) {
    const bounds = labels[uid].bounds;
    const expectedX = result.size.x + (x + 1) / 9 * result.size.width;
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - expectedX) < 1, uid + ': ordinary text remains centered');
  }
  return labels;
}

test('real MathJax typesets static labels through both README imports', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable found' : false,
  timeout: 180000
}, async context => {
  for (const file of ['dist/index.js', 'dist/static.js']) assert.ok(existsSync(join(root, file)), `${file} required; run npm run build`);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const jsxgraphImport = readme.match(/^import:\s+(https:\/\/\S+)/m)[1];
  const jsxReadme = await fetch(jsxgraphImport, { signal: AbortSignal.timeout(30000) }).then(response => response.text());
  const mathjax = jsxReadme.match(/^script:\s+(https:\/\/\S*mathjax\S*)/m)?.[1];
  assert.ok(mathjax, 'The normal import must still expose its real MathJax CHTML dependency');
  const definitions = { normal: macroBodies('README.md', false), static: macroBodies('README.static.md', true),
    jsxgraph: { mathjax, bundle: new URL('dist/index.js', jsxgraphImport).href } };
  const files = { '/fixtures/static-tex.html': ['tests/fixtures/static-tex.html', 'text/html'],
    '/dist/index.js': ['dist/index.js', 'application/javascript'], '/dist/static.js': ['dist/static.js', 'application/javascript'] };
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/imports.json') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(definitions));
    } else if (files[path]) {
      response.writeHead(200, { 'content-type': files[path][1] }); response.end(readFileSync(join(root, files[path][0])));
    } else { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const artifactDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-tex-artifacts-'));
  console.log('Static TeX browser artifacts:', artifactDirectory);
  try {
    for (const mode of ['normal', 'static']) await context.test(mode + ' import preserves native SVG and lazy TeX lifecycle', { timeout: 75000 }, async () => {
      const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-tex-profile-'));
      const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--disable-background-networking',
        '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--no-first-run',
        '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profileDirectory, 'about:blank'],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      browser.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
      let cdp;
      let release;
      const released = new Promise(resolve => { release = resolve; });
      let gated = false;
      const requests = [];
      const protocolErrors = [];
      const browserErrors = [];
      const transfers = new Set();
      try {
        const portFile = join(profileDirectory, 'DevToolsActivePort');
        await waitFor(() => existsSync(portFile), 'Chrome debugging port: ' + stderr, 15000);
        const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
        const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
        const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        cdp = new CDP(socket);
        cdp.on('Runtime.exceptionThrown', event => browserErrors.push(event.exceptionDetails));
        cdp.on('Fetch.requestPaused', event => {
          const work = (async () => {
            requests.push(event.request.url);
            const asset = await remoteAsset(event.request.url);
            if ((mode === 'normal' && /\/output\/svg\.js(?:[?#]|$)/.test(event.request.url)) ||
                (mode === 'static' && /\/tex-chtml\.js(?:[?#]|$)/.test(event.request.url))) {
              gated = true;
              await released;
            }
            await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
              responseHeaders: [{ name: 'content-type', value: asset.type }, { name: 'access-control-allow-origin', value: '*' }], body: asset.body });
          })().catch(error => protocolErrors.push(String(error)));
          transfers.add(work); work.finally(() => transfers.delete(work));
        });
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
        await cdp.send('Page.navigate', { url: `${origin}/fixtures/static-tex.html?mode=${mode}` });
        await waitFor(async () => {
          assert.deepEqual(browserErrors, [], 'Browser errors during setup');
          assert.deepEqual(protocolErrors, [], 'Dependency errors during setup');
          return cdp.evaluate('!!window.staticTexFixture');
        }, mode + ' fixture setup');
        assert.equal(requests.some(url => /\/output\/svg\.js/.test(url)), false, 'Plain text must not load SVG output');
        if (mode === 'static') assert.equal(requests.length, 0, 'Standalone plain text must not load any library');
        await cdp.evaluate('staticTexFixture.start()');
        await waitFor(() => gated, mode + ' asynchronous dependency download');
        assert.ok(await cdp.evaluate('document.querySelectorAll("[data-lia-static-tex=pending]").length > 0'));
        await cdp.evaluate('staticTexFixture.remountWhileLoading()');
        release();
        await waitFor(() => cdp.evaluate('staticTexFixture.ready()'), mode + ' SVG TeX after remount');
        const wide = await cdp.evaluate('staticTexFixture.snapshot()');
        writeFileSync(join(artifactDirectory, mode + '-wide.json'), JSON.stringify(wide, null, 2));
        const wideImage = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        writeFileSync(join(artifactDirectory, mode + '-wide.png'), Buffer.from(wideImage.data, 'base64'));
        const wideLabels = verifySnapshot(wide, mode);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
        await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const narrow = await cdp.evaluate('staticTexFixture.snapshot()');
        writeFileSync(join(artifactDirectory, mode + '-narrow.json'), JSON.stringify(narrow, null, 2));
        const narrowImage = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        writeFileSync(join(artifactDirectory, mode + '-narrow.png'), Buffer.from(narrowImage.data, 'base64'));
        const narrowLabels = verifySnapshot(narrow, mode);
        assert.ok(narrow.size.width <= 304.1);
        for (const uid of Object.keys(wideLabels)) assert.ok(Math.abs(
          narrowLabels[uid].bounds.width / wideLabels[uid].bounds.width - narrow.size.width / wide.size.width
        ) < 0.02, uid + ': text must scale with the native SVG');
        for (let iteration = 0; iteration < 3; iteration++) {
          await cdp.evaluate('staticTexFixture.rerender()');
          await waitFor(() => cdp.evaluate('staticTexFixture.ready()'), 'repeated render');
          verifySnapshot(await cdp.evaluate('staticTexFixture.snapshot()'), mode);
          await cdp.evaluate('staticTexFixture.remount()');
          await waitFor(() => cdp.evaluate('staticTexFixture.ready()'), 'slide revisit');
          verifySnapshot(await cdp.evaluate('staticTexFixture.snapshot()'), mode);
        }
        await cdp.evaluate('staticTexFixture.renderHidden()');
        await waitFor(() => cdp.evaluate('staticTexFixture.ready()'), 'TeX in a connected hidden slide');
        await cdp.evaluate('staticTexFixture.reveal()');
        await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const revealed = await cdp.evaluate('staticTexFixture.snapshot()');
        writeFileSync(join(artifactDirectory, mode + '-revealed.json'), JSON.stringify(revealed, null, 2));
        const revealedImage = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        writeFileSync(join(artifactDirectory, mode + '-revealed.png'), Buffer.from(revealedImage.data, 'base64'));
        const revealedLabels = verifySnapshot(revealed, mode);
        for (const uid of Object.keys(narrowLabels)) assert.ok(Math.abs(revealedLabels[uid].bounds.width - narrowLabels[uid].bounds.width) < 0.1, uid + ': hidden measurement must preserve text spacing');
        assert.equal(await cdp.evaluate('staticTexFixture.verifyInteractive()'), true, 'Interactive movement and subsequent CHTML rendering');
        assert.equal(requests.filter(url => /\/output\/svg\.js/.test(url)).length, 1, 'Single shared SVG dependency load');
        assert.equal(requests.filter(url => /\/tex-chtml\.js/.test(url)).length, 1, 'Single shared MathJax load');
        assert.deepEqual(protocolErrors, []);
        assert.deepEqual(browserErrors, []);
        console.log(mode + ' static TeX:', JSON.stringify({ mathJaxVersion: wide.mathJaxVersion,
          texLabels: wide.readyCount, wideWidth: wide.size.width, narrowWidth: narrow.size.width,
          remounts: 4, componentRequests: requests.filter(url => /\.js(?:[?#]|$)/.test(url)) }));
      } finally {
        release();
        await Promise.allSettled([...transfers]);
        cdp?.close();
        browser.kill();
        if (browser.exitCode === null) await once(browser, 'exit');
        // Resolve and verify the temporary profile target before recursive cleanup.
        const profileTarget = resolve(profileDirectory);
        const withinTemp = relative(resolve(tmpdir()), profileTarget);
        assert.ok(withinTemp && !withinTemp.startsWith('..') && !withinTemp.includes('..\\'));
        rmSync(profileTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
      }
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});