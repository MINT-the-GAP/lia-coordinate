import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Usage and dependency preparation: tests/performance/README.md.
// Timings are diagnostic; assertions target behavior and deterministic work counts.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const mode = process.argv[2] || 'after';
const integrationOnly = process.argv.includes('--integration-only');
const interactionOnly = process.argv.includes('--interaction-only');
const bundle = process.env.PROFILE_BUNDLE || (mode === 'before'
  ? join(assets, 'baseline-index.js') : join(root, 'dist/index.js'));
const out = join(root, 'tests/performance');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
mkdirSync(out, { recursive: true });
if (mode === 'prepare') {
  const manifest = JSON.parse(readFileSync(join(out, 'assets.json'), 'utf8').replace(/^\uFEFF/, ''));
  mkdirSync(assets, { recursive: true });
  for (const asset of manifest.assets) {
    const target = join(assets, asset.file);
    if (!existsSync(target)) {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(30_000) });
      assert.ok(response.ok, 'Asset download failed: ' + asset.url + ' (' + response.status + ')');
      let bytes = Buffer.from(await response.arrayBuffer());
      if (asset.lineEndings === 'crlf') bytes = Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256,
        'Downloaded asset differs from the recorded baseline: ' + asset.file);
      writeFileSync(target, bytes);
    }
    assert.equal(hash(target), asset.sha256, 'Asset checksum mismatch: ' + target);
  }
  const baselinePath = join(assets, 'baseline-index.js');
  if (!existsSync(baselinePath)) {
    const original = spawnSync('git', ['show', manifest.baseline.gitRef + ':dist/index.js'], {
      cwd: root, windowsHide: true, maxBuffer: 10 * 1024 * 1024
    });
    assert.equal(original.status, 0, 'Cannot read recorded baseline commit from git');
    assert.equal(createHash('sha256').update(original.stdout).digest('hex'), manifest.baseline.sha256);
    writeFileSync(baselinePath, original.stdout);
  }
  assert.equal(hash(baselinePath), manifest.baseline.sha256, 'Baseline checksum mismatch');
  console.log('PROFILE_ASSETS_READY', assets);
  process.exit(0);
}
async function withTimeout(promise, label, duration = 30_000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(label + ' timed out')), duration);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
assert.ok(existsSync(bundle), 'Build dist/index.js, or set PROFILE_BUNDLE to the baseline bundle');
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Missing real JSXGraph distribution; see tests/performance/README.md');
assert.ok(existsSync(join(assets, 'mathjax.js')), 'Missing MathJax; run the prepare command');
const integrationAvailable = ['timer.js', 'dynflex.js', 'freeze.js', 'freeze-coordinate-state.ts']
  .every(name => existsSync(join(assets, name)));
if (!integrationAvailable) console.warn('INTEGRATION_SKIPPED: run prepare to fetch Timer, DynFlex and Freeze assets');
if (integrationAvailable) {
  writeFileSync(join(assets, 'freeze-coordinate-state.js'), ts.transpileModule(
    readFileSync(join(assets, 'freeze-coordinate-state.ts'), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }
  ).outputText);
}
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/bundle.js' ? bundle : path.startsWith('/assets/')
    ? join(assets, path.slice(8)) : join(root, 'tests/fixtures/dynamic-pan-zoom.html');
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(file));
  } catch (error) {
    res.statusCode = 404;
    res.end(String(error));
  }
});
let proc, ws, send, profile;
const pending = new Map();
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-panzoom-chrome-'));
  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1100,1000', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', data => { stderr += data; });
  proc.on('error', error => { stderr += String(error); });
  let debug;
  for (let i = 0; i < 100; i++) {
    if (existsSync(join(profile, 'DevToolsActivePort'))) {
      debug = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      break;
    }
    await sleep(100);
  }
  assert.ok(debug, 'Chrome failed to expose CDP: ' + stderr);
  const pages = await (await fetch('http://127.0.0.1:' + debug + '/json')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await withTimeout(new Promise(r => ws.addEventListener('open', r, { once: true })), 'CDP connection');
  let sequence = 0;
  const events = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request?.timer);
      if (message.error) request?.reject(Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    } else {
      for (const listener of events.get(message.method) || []) listener(message.params);
    }
  });
  send = function(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('CDP request timed out: ' + method));
      }, 30_000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function navigate(options) {
    // Wait for the navigation event, so a prior document cannot satisfy readiness.
    const loaded = new Promise(r => events.set('Page.loadEventFired', [r]));
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=' +
      (options.dgs ? '1' : '0') + '&instrument=' + (options.instrument ? '1' : '0') + '&integration=' + (options.integration ? '1' : '0') });
    await withTimeout(loaded, 'Page navigation');
    await evaluate('profileReady()');
  }
  async function drag(from, to, steps = 12) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
      x: from[0], y: from[1], clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1,
        x: from[0] + (to[0] - from[0]) * i / steps,
        y: from[1] + (to[1] - from[1]) * i / steps });
      await sleep(16);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: to[0], y: to[1], clickCount: 1 });
    await sleep(150);
  }
  async function interactionChecks() {
    await navigate({ dgs: true, integration: integrationAvailable });
    await sleep(900);
    const initial = await evaluate('interactionState()');
    await drag(initial.empty, [initial.empty[0] + 60, initial.empty[1] + 35]);
    const panned = await evaluate('interactionState()');
    assert.notDeepEqual(panned.bbox, initial.bbox, 'Actual pointer drag must pan the board');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: panned.empty[0], y: panned.empty[1] });
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: panned.empty[0],
      y: panned.empty[1], deltaX: 0, deltaY: -160 });
    await sleep(250);
    let zoomed = await evaluate('interactionState()');
    const cdpWheelZoom = zoomed.bbox[2] - zoomed.bbox[0] < panned.bbox[2] - panned.bbox[0];
    if (!cdpWheelZoom) {
      await evaluate('(()=>{const event=new WheelEvent('+JSON.stringify('mousewheel')+',{bubbles:true,composed:true,cancelable:true,clientX:'+panned.empty[0]+',clientY:'+panned.empty[1]+',deltaY:-160});Object.defineProperty(event,'+JSON.stringify('wheelDelta')+',{value:160});__boards.A1.containerObj.dispatchEvent(event)})()');
      await sleep(200);
      zoomed = await evaluate('interactionState()');
    }


    assert.ok(zoomed.bbox[2] - zoomed.bbox[0] < panned.bbox[2] - panned.bbox[0], 'Actual wheel must zoom');
    await evaluate('__boards.A1.setBoundingBox([-10,10,10,-10],true);__boards.A1.update();true');
    await sleep(150);
    const beforeDrag = await evaluate('interactionState()');
    await drag(beforeDrag.pointC, [beforeDrag.pointC[0] + 32, beforeDrag.pointC[1] - 25]);
    const moved = await evaluate('interactionState()');
    assert.notDeepEqual(moved.coordinatesC, zoomed.coordinatesC, 'C must remain draggable');
    assert.deepEqual(moved.coordinatesA, initial.coordinatesA, 'Fixed point A must not move');
    const fullDgsRestore = await evaluate('checkStateRestore()');
    if (fullDgsRestore.status !== 'passed') console.warn('FULL_DGS_RESTORE_FAILURE', JSON.stringify(fullDgsRestore));
    await navigate({ instrument: true, integration: integrationAvailable });
    await sleep(900);
    const standalonePoint = await evaluate('interactionState()');
    await drag(standalonePoint.pointC, [standalonePoint.pointC[0] + 32, standalonePoint.pointC[1] - 25]);
    const restored = await evaluate('checkStateRestore()');
    assert.equal(restored.publicPointRestore, true, 'Public point restore hook must work');
    if (!restored.adapterPointHydrated) console.warn('STANDALONE_FREEZE_POINT_HYDRATION_FAILURE', JSON.stringify({expected:restored.expectedPoint,actual:restored.adapterPointCoordinates}));
    if (mode === 'after') assert.equal(restored.hiddenMutations, 0);
    restored.fullDgsRestore = fullDgsRestore;
    assert.deepEqual(restored.errors, []);
    return { actualPointerPan: true, cdpWheelZoom, legacyWheelZoom: !cdpWheelZoom, movablePointDrag: true,
      fixedPointPreserved: true, ...restored };
  }

  await send('Page.enable');
  await send('Runtime.enable');
  const result = {
    mode, date: new Date().toISOString(), browser: await send('Browser.getVersion'),
    bundleSha256: hash(bundle), jsxgraphSha256: hash(join(assets, 'jsxgraph-template.js')),
    mathjaxSha256: hash(join(assets, 'mathjax.js')),
    fixtureSha256: hash(join(root, 'tests/fixtures/dynamic-pan-zoom.html')),
    integrationAssets: integrationAvailable ? Object.fromEntries(
      ['timer.js', 'dynflex.js', 'freeze.js', 'freeze-coordinate-state.ts']
        .map(name => [name, hash(join(assets, name))])) : null,
    scenarios: []
  };
  const scenarios = integrationOnly || interactionOnly ? [] : [
    { name: 'exact-nine-points' },
    { name: 'menu-closed-square-hidden', dgs: true },
    { name: 'menu-open-square-hidden', dgs: true, menu: true },
    { name: 'menu-open-square-visible', dgs: true, menu: true, square: true },
    { name: 'moving-point', dgs: true, moving: true }
  ];
  if (integrationAvailable && !interactionOnly) scenarios.push(
    { name: 'integration-hidden', dgs: true, integration: true },
    { name: 'integration-visible', dgs: true, menu: true, square: true, integration: true }
  );
  for (const options of scenarios) {
    await navigate(options);
    const chunks = [];
    events.set('Tracing.dataCollected', [data => chunks.push(...data.value)]);
    await send('Tracing.start', {
      categories: 'devtools.timeline,blink.user_timing,v8.execute', options: 'sampling-frequency=10000'
    });
    const metrics = await evaluate('runProfile(' + JSON.stringify(options) + ')');
    const done = new Promise(r => events.set('Tracing.tracingComplete', [r]));
    await send('Tracing.end');
    await withTimeout(done, 'Trace completion');
    const tracePath = join(assets, mode + '-' + options.name + '.trace.json');
    writeFileSync(tracePath, JSON.stringify({ traceEvents: chunks }));
    metrics.trace = tracePath;
    assert.equal(metrics.pointCount, 9);
    assert.deepEqual(metrics.errors, []);
    assert.equal(metrics.counts.suspendUpdate, metrics.counts.unsuspendUpdate);
    assert.equal(metrics.menuOpen, !!options.menu);
    assert.equal(metrics.squareVisible, !!options.square);
    if (mode === 'after' && options.dgs && !options.square) {
      assert.equal(metrics.counts.overlayMutations, 0, 'Hidden set square must not mutate the DOM');
    }
    result.scenarios.push(metrics);
    console.log(options.name, JSON.stringify(metrics));
    // Preserve measurements even if a later, independent behavior check fails.
    writeFileSync(join(out, mode + (interactionOnly ? '-interaction' : integrationOnly ? '-integration' : '') + '.json'), JSON.stringify(result, null, 2) + '\n');
  }
  if (!process.argv.includes('--skip-interaction')) result.interactionChecks = await interactionChecks();
  console.log('INTERACTION_CHECKS', JSON.stringify(result.interactionChecks));
  writeFileSync(join(out, mode + (interactionOnly ? '-interaction' : integrationOnly ? '-integration' : '') + '.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('PROFILE_SAVED', out);
} finally {
  if (send && ws?.readyState === WebSocket.OPEN) {
    await withTimeout(send('Browser.close'), 'Browser shutdown', 2_000).catch(() => {});
  }
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  ws?.close();
  server.closeAllConnections();
  server.close();
  proc?.kill();
  await sleep(300);
  // Only delete the exact directory returned by mkdtemp under the OS temp root.
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/'))) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold locks. */ }
  }
}
