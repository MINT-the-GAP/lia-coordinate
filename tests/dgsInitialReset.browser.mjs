import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const fixture = join(root, 'tests/fixtures/dgs-initial-reset.html');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = path === '/bundle.js' ? bundle : path.startsWith('/assets/')
    ? join(assets, path.slice(8)) : fixture;
  try {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.setHeader('Cache-Control', 'no-store');
    response.end(readFileSync(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(String(error));
  }
});

let browser;
let socket;
let profile;
const pending = new Map();
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-dgs-initial-reset-chrome-'));
  browser = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1300,1100', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.on('data', data => { stderr += data; });
  for (let index = 0; index < 100 && !existsSync(join(profile, 'DevToolsActivePort')); index += 1) await sleep(100);
  assert.ok(existsSync(join(profile, 'DevToolsActivePort')), 'Chrome failed to expose CDP: ' + stderr);
  const debugPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const pages = await (await fetch('http://127.0.0.1:' + debugPort + '/json')).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const events = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      for (const listener of events.get(message.method) || []) listener(message.params);
      return;
    }
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request?.timer);
    if (message.error) request?.reject(Error(JSON.stringify(message.error)));
    else request?.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 30_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await sleep(300);

  const prepared = await evaluate(`(() => {
    const plotBoard=__boards.L1101A1,plot=__plotFunctionEntries['plot-course-plot'];
    window.resetOld={graph:plot.graph,anchor:plot.anchor,label:plot.label,schar:__scharEntries['schar-course-schar'],learner:null};
    const learnerEvaluator=x=>x+1;
    const learner=plotBoard.create('functiongraph',[learnerEvaluator],{strokeColor:'#ff00ff',fillColor:'#ff00ff',fillOpacity:.7,highlightFillOpacity:.7,strokeWidth:3,fixed:true,withLabel:false});
    learner.__liaDgsFunction=true;learner.__liaDgsFunctionEvaluator=learnerEvaluator;
    learner.__liaDgsFunctionName='g';learner.__liaDgsFunctionExpression='x+1';
    learner.__liaDgsPersistentId='learner-function';learner.__liaDgsShowName=false;
    learner.__liaDgsShowObject=true;learner.__liaDgsOpacity=.7;
    learner.__liaDgsTextColor='#ff00ff';learner.__liaDgsLineColor='#ff00ff';learner.__liaDgsFillColor='#ff00ff';
    resetOld.learner=learner;
    plot.graph.__liaDgsOpacity=.4;
    plot.graph.setAttribute({fillOpacity:.4,highlightFillOpacity:.4});
    __persistDgsBoardState('L1101A1',true);
    const schar=resetOld.schar,slider=schar.slidersByParam.a;
    slider.value='4';slider.dispatchEvent(new Event('input',{bubbles:true}));
    __persistDgsBoardState('L1101A7',true);
    return {learner:plotBoard.objectsList.includes(learner),scharA:schar.values.a,errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(prepared, { learner: true, scharA: 4, errors: [] });

  await evaluate(`(() => {
    __boards.L1101A1.__liaDgsRestoreInitialState();
    __boards.L1101A7.__liaDgsRestoreInitialState();
  })()`);
  await sleep(1400);

  const restored = await evaluate(`(() => {
    const board=__boards.L1101A1,entry=__plotFunctionEntries['plot-course-plot'];
    const functions=board.objectsList.filter(object=>object.__liaDgsFunction);
    const scharBoard=__boards.L1101A7,schar=__scharEntries['schar-course-schar'];
    const live=value=>board.objectsList.includes(value)||Object.values(board.objects||{}).includes(value);
    const scharLive=value=>scharBoard.objectsList.includes(value)||Object.values(scharBoard.objects||{}).includes(value);
    const fill=Number(entry.graph.getAttribute?.('fillOpacity')??entry.graph.visProp?.fillopacity);
    const highlightFill=Number(entry.graph.getAttribute?.('highlightFillOpacity')??entry.graph.visProp?.highlightfillopacity);
    return {
      plot:{functions:functions.length,registryGraphIsOnly:functions[0]===entry.graph,
        recreated:entry.graph!==resetOld.graph,oldGraph:live(resetOld.graph),oldAnchor:live(resetOld.anchor),
        oldLabel:live(resetOld.label),learner:live(resetOld.learner),fill,highlightFill,opacity:entry.graph.__liaDgsOpacity,
        details:functions.map(graph=>({name:graph.__liaDgsFunctionName,expression:graph.__liaDgsFunctionExpression,
          id:graph.__liaDgsPersistentId,macroKey:graph.__liaDgsMacroKey,registry:graph===entry.graph}))},
      schar:{recreated:schar!==resetOld.schar,graphRecreated:schar.graph!==resetOld.schar.graph,
        oldGraph:scharLive(resetOld.schar.graph),oldDrag:scharLive(resetOld.schar.dragGraph),
        oldLabel:scharLive(resetOld.schar.graphLabel),graphLive:scharLive(schar.graph),
        dragLive:!schar.dragGraph||scharLive(schar.dragGraph),a:schar.values.a,panelScale:schar.panelScale},
      errors:profileErrors.slice()
    };
  })()`);
  assert.deepEqual(restored.plot, {
    functions: 1, registryGraphIsOnly: true, recreated: true, oldGraph: false, oldAnchor: false,
    oldLabel: false, learner: false, fill: 0, highlightFill: 0, opacity: 1,
    details: [{name:'f',expression:'0.25*x^2+2',id:'macro:plotFunctionEntries:plot-course-plot:graph',
      macroKey:'macro:plotFunctionEntries:plot-course-plot:graph',registry:true}]
  }, JSON.stringify(restored));
  assert.equal(restored.schar.recreated, true, JSON.stringify(restored));
  assert.equal(restored.schar.graphRecreated, true, JSON.stringify(restored));
  assert.equal(restored.schar.oldGraph, false, JSON.stringify(restored));
  assert.equal(restored.schar.oldDrag, false, JSON.stringify(restored));
  assert.equal(restored.schar.oldLabel, false, JSON.stringify(restored));
  assert.equal(restored.schar.graphLive, true, JSON.stringify(restored));
  assert.equal(restored.schar.dragLive, true, JSON.stringify(restored));
  assert.equal(restored.schar.a, 1, JSON.stringify(restored));
  assert.deepEqual(restored.errors, []);
  console.log('PASS DGS initial-state reset recreates PlotFunction and Schar without stale, filled, or moving graphs');
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  await new Promise(resolve => server.close(resolve));
  await sleep(300);
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + sep)) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
