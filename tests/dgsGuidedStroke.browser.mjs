import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Uses the same local JSXGraph/MathJax assets as dynamicPanZoom.browser.mjs.
// Prepare them using: node tests/dynamicPanZoom.browser.mjs prepare
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-guided-stroke-chrome-'));
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

  await send('Page.enable');
  await send('Runtime.enable');
  await navigate({ dgs: true });
  await sleep(600);
  await evaluate(`(() => {
    window.regression = Object.values(__liaRegressionStates).find(s => s.boardId === 'A1');
    if (!regression) throw Error('Drawing controls missing');
    __boards.A1.containerObj.querySelector('.lia-dgs-set-square-button').click();
    regression.drawButton.click();
    regression.drawColor = '#0055ff';
    window.guidedState = () => ({
      segments: __boards.A1.objectsList.filter(o => o.__liaDgsSegment).map(o => ({
        a: [o.point1.X(), o.point1.Y()], b: [o.point2.X(), o.point2.Y()],
        color: o.visProp.strokecolor, width: o.visProp.strokewidth,
        names: [o.point1.__liaDgsPointName, o.point2.__liaDgsPointName]
      })),
      points: Object.keys(__points.A1).length,
      strokes: regression.strokes.length,
      history: regression.undoActions.length,
      errors: profileErrors.slice()
    });
    window.edgeGesture = edge => {
      const board = __boards.A1;
      const svg = board.containerObj.querySelector('.lia-dgs-set-square-overlay svg');
      const matrix = svg.getScreenCTM();
      const vertices = [[10, 34], [590, 34], [300, 334]].map(([x,y]) => {
        const p = svg.createSVGPoint(); p.x = x; p.y = y;
        const s = p.matrixTransform(matrix); return [s.x, s.y];
      });
      const a = vertices[edge], b = vertices[(edge + 1) % 3];
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      const rect = regression.drawLayer.getBoundingClientRect();
      const positions = [0.25, 0.6].map(t => [a[0] + t * dx, a[1] + t * dy]);
      return {
        pointer: positions.map(([x,y]) => [x + 5 * dy / length, y - 5 * dx / length]),
        expected: positions.map(([x,y]) => [
          ((x - rect.left) * regression.drawLayer.clientWidth / rect.width - board.origin.scrCoords[1]) / board.unitX,
          (board.origin.scrCoords[2] - (y - rect.top) * regression.drawLayer.clientHeight / rect.height) / board.unitY
        ]),
        units: [board.unitX, board.unitY]
      };
    };
  })()`);
  await sleep(300);
  const initial = await evaluate('guidedState()');
  for (const edge of [0, 1, 2]) {
    const before = await evaluate('guidedState()');
    const gesture = await evaluate('edgeGesture(' + edge + ')');
    await drag(...gesture.pointer);
    const after = await evaluate('guidedState()');
    assert.equal(after.segments.length, before.segments.length + 1, 'edge ' + edge);
    assert.equal(after.points, before.points + 2);
    assert.equal(after.strokes, before.strokes);
    assert.equal(after.history, before.history + 1, 'one history entry');
    const segment = after.segments.at(-1);
    assert.equal(segment.color, '#0055ff');
    assert.equal(segment.width, 3);
    assert.ok(segment.names.every(Boolean));
    for (const [index, actual] of [segment.a, segment.b].entries()) {
      assert.ok(Math.hypot(...actual.map((v, axis) =>
        (v - gesture.expected[index][axis]) * gesture.units[axis])) < 1.5, 'endpoint follows pointer');
    }
    await evaluate('regression.undoButton.click()');
    const undone = await evaluate('guidedState()');
    assert.equal(undone.points, before.points);
    assert.equal(undone.segments.length, before.segments.length);
    await evaluate('regression.redoButton.click()');
    const redone = await evaluate('guidedState()');
    assert.deepEqual(redone.segments, after.segments);
    assert.equal(redone.points, after.points);
    console.log('PASS edge', edge, 'endpoints, style, undo/redo');
  }
  // Rotate via the real instrument handle, then draw a vertical segment.
  await evaluate('regression.drawButton.click()');
  const rotation = await evaluate(`(() => {
    const svg = __boards.A1.containerObj.querySelector('.lia-dgs-set-square-overlay svg');
    const at = (x,y) => { const p = svg.createSVGPoint(); p.x=x; p.y=y;
      const s=p.matrixTransform(svg.getScreenCTM()); return [s.x,s.y]; };
    const pivot=at(300,34), handle=at(300,270);
    return [handle, [pivot[0]-(handle[1]-pivot[1]), pivot[1]+handle[0]-pivot[0]]];
  })()`);
  await drag(...rotation);
  await evaluate('regression.drawButton.click()');
  const vertical = await evaluate('edgeGesture(0)');
  assert.ok(Math.abs(vertical.pointer[0][0] - vertical.pointer[1][0]) < 2, 'instrument rotated');
  await drag(...vertical.pointer);
  const rotated = await evaluate('guidedState()');
  assert.equal(rotated.segments.length, initial.segments.length + 4);
  assert.equal(rotated.strokes, initial.strokes);
  console.log('PASS rotated instrument');

  // Reusing an existing endpoint must preserve its identity and survive undo.
  const reused = await evaluate(`(() => {
    const point = __points.A1.A, count = Object.keys(__points.A1).length;
    const before = regression.undoActions.length;
    const result = __createDgsDrawnSegment('A1', {x:point.X(),y:point.Y()}, {x:8,y:7}, '#00ff00', 5);
    const segment = __boards.A1.objectsList.filter(o => o.__liaDgsSegment).at(-1);
    const same = segment.point1 === point;
    const added = Object.keys(__points.A1).length-count;
    const steps = regression.undoActions.length-before;
    regression.undoButton.click();
    return {result, same, added, steps, retained:__points.A1.A===point};
  })()`);
  assert.deepEqual(reused, { result:true, same:true, added:1, steps:1, retained:true });
  console.log('PASS existing endpoint reuse');

  await evaluate(`__boards.A1.containerObj.querySelector('.lia-dgs-set-square-button').click()`);
  const freehandBefore = await evaluate('guidedState()');
  await drag(...vertical.pointer);
  const freehandAfter = await evaluate('guidedState()');
  assert.equal(freehandAfter.segments.length, freehandBefore.segments.length);
  assert.equal(freehandAfter.strokes, freehandBefore.strokes + 1);
  assert.deepEqual(freehandAfter.errors, []);
  console.log('PASS ordinary freehand stays freehand; no browser errors');

  const quizResults = await evaluate(`(() => {
    const points = [{x:0,y:0}, {x:4,y:0}, {x:4,y:3}];
    const spec = 'A1;3;fest;S4,W90,S3';
    const check = () => __checkConstructionQuizFromSpec(spec);
    const countPolygons = () => __boards.A1.objectsList.filter(o => o.__liaDgsPolygon).length;
    const polygonsBefore = countPolygons();
    const created = [];
    created.push(__createDgsDrawnSegment('A1',points[0],points[1],'#0055ff',3));
    created.push(__createDgsDrawnSegment('A1',points[1],points[2],'#0055ff',3));
    const open = check();
    created.push(__createDgsDrawnSegment('A1',points[2],points[0],'#0055ff',3));
    const closed = check();
    const wrongAngle = __checkConstructionQuizFromSpec('A1;3;offen;S3,S4,S5,W60');
    const combined = __checkCombinedQuizFromSpec('A1;3;Construction(fixed;S4,W90,S3);Area(6;0.001);Perimeter(12;0.001)');
    regression.undoButton.click();
    const undone = check();
    regression.redoButton.click();
    const redone = check();
    return { created, open, closed, wrongAngle, combined, undone, redone,
      polygonsBefore, polygonsAfter:countPolygons(), errors:profileErrors.slice() };
  })()`);
  assert.deepEqual(quizResults.created, [true,true,true]);
  assert.equal(quizResults.open, false);
  assert.equal(quizResults.closed, true);
  assert.equal(quizResults.wrongAngle, false);
  assert.equal(quizResults.combined, true);
  assert.equal(quizResults.undone, false);
  assert.equal(quizResults.redone, true);
  assert.equal(quizResults.polygonsAfter, quizResults.polygonsBefore);
  assert.deepEqual(quizResults.errors, []);
  console.log('PASS segment-only triangle: construction, combined metrics, undo/redo, no polygon created');

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
