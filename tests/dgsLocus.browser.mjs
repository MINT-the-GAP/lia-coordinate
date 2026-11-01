import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

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

let proc, ws, profile;
const pending = new Map();
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-dgs-locus-chrome-'));
  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1100,1000', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', data => { stderr += data; });
  for (let index = 0; index < 100; index += 1) {
    if (existsSync(join(profile, 'DevToolsActivePort'))) break;
    await sleep(100);
  }
  assert.ok(existsSync(join(profile, 'DevToolsActivePort')), 'Chrome failed to expose CDP: ' + stderr);
  const debug = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const pages = await (await fetch('http://127.0.0.1:' + debug + '/json')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 30_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=1&instrument=0&integration=0' });
  await loaded;
  await evaluate('profileReady()');

  const setup = await evaluate(`(() => {
    for (const [name,[x,y]] of Object.entries({A:[-4,0],B:[4,0],C:[0,4]})) {
      if (!finalizePointFromSpec('A1;'+name+';'+x+';'+y+';#ff00ff;1')) return false;
    }
    const host=document.querySelector('.flex-child');
    const distance=document.createElement('span');distance.id='distance-spec-locus-segment';
    distance.dataset.spec='A1;[A;B];#1565c0;s';distance.dataset.language='de';host.append(distance);
    if (!renderDistanceFromSpec('locus-segment',distance.dataset.spec,'de')) return false;
    if (!finalizePointFromSpec('A1;P;-3;0;#ff00ff;1;on=s')) return false;
    const relation=document.createElement('span');relation.id='relation-spec-locus-target';
    relation.dataset.spec='A1;[P;C];#ff00ff;M';relation.dataset.kind='midpoint';
    relation.dataset.language='de';host.append(relation);
    if (!renderRelationObjectFromSpec('locus-target',relation.dataset.spec,'midpoint','de')) return false;
    window.screenPoint=(x,y)=>{const b=__boards.A1,r=b.containerObj.getBoundingClientRect();
      return [r.left+b.origin.scrCoords[1]+x*b.unitX,r.top+b.origin.scrCoords[2]-y*b.unitY];};
    return true;
  })()`);
  assert.equal(setup, true);
  await sleep(250);

  const started = await evaluate(`(() => {
    const b=__boards.A1,c=b.containerObj,M=__points.A1.M;
    const p=screenPoint(M.X(),M.Y());
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p[0],clientY:p[1]}));
    const option=[...c.querySelectorAll('.lia-dgs-context-option')]
      .find(label=>!label.hidden&&label.textContent.includes('Ortslinie anzeigen'));
    if(!option)return {missing:true,labels:[...c.querySelectorAll('.lia-dgs-context-option')].map(x=>[x.hidden,x.textContent])};
    const input=option.querySelector('input');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));
    const P=__points.A1.P,q=screenPoint(P.X(),P.Y());
    c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,buttons:1,
      isPrimary:true,pointerId:7,clientX:q[0],clientY:q[1]}));
    return {pending:input.indeterminate,open:c.querySelector('.lia-dgs-side-menu').dataset.open};
  })()`);
  assert.deepEqual(started, { pending: false, open: '1' }, JSON.stringify(started));
  await sleep(900);

  const initial = await evaluate(`(() => {
    const b=__boards.A1,l=b.objectsList.find(o=>o.__liaDgsLocus&&!o.__liaDgsMacroManaged),P=__points.A1.P;
    const xs=l?.__liaDgsLocusDataX.filter(Number.isFinite)||[];
    const ys=l?.__liaDgsLocusDataY.filter(Number.isFinite)||[];
    return {count:xs.length,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),
      driver:[P.X(),P.Y()],trace:(P.__liaDgsTraceMarkers||[]).length,errors:profileErrors.slice()};
  })()`);
  assert.ok(initial.count >= 200, JSON.stringify(initial));
  assert.ok(Math.abs(initial.minX + 2) < 1e-6 && Math.abs(initial.maxX - 2) < 1e-6, JSON.stringify(initial));
  assert.ok(Math.abs(initial.minY - 2) < 1e-6 && Math.abs(initial.maxY - 2) < 1e-6, JSON.stringify(initial));
  assert.deepEqual(initial.driver, [-3, 0]);
  assert.equal(initial.trace, 0);
  assert.deepEqual(initial.errors, []);

  await evaluate(`(() => {const C=__points.A1.C;C.setPositionDirectly(JXG.COORDS_BY_USER,[0,2]);__boards.A1.update();})()`);
  await sleep(900);
  const updated = await evaluate(`(() => {const l=__boards.A1.objectsList.find(o=>o.__liaDgsLocus&&!o.__liaDgsMacroManaged);
    const ys=l.__liaDgsLocusDataY.filter(Number.isFinite);return {min:Math.min(...ys),max:Math.max(...ys)};})()`);
  assert.ok(Math.abs(updated.min - 1) < 1e-6 && Math.abs(updated.max - 1) < 1e-6, JSON.stringify(updated));

  const configured = await evaluate(`(() => {
    const b=__boards.A1,c=b.containerObj,p=screenPoint(0,1);
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p[0],clientY:p[1]}));
    const samples=c.querySelector('.lia-dgs-side-menu input[aria-label="Abtastpunkte"]');
    samples.value='64';samples.dispatchEvent(new Event('change',{bubbles:true}));
    const visible=[...c.querySelectorAll('.lia-dgs-context-option')]
      .find(label=>!label.hidden&&label.textContent.includes('Ortslinie anzeigen'))?.querySelector('input');
    visible.checked=false;visible.dispatchEvent(new Event('change',{bubbles:true}));
    const l=b.objectsList.find(o=>o.__liaDgsLocus&&!o.__liaDgsMacroManaged),hidden=l.__liaDgsShowObject===false;
    visible.checked=true;visible.dispatchEvent(new Event('change',{bubbles:true}));
    return {samples:l.__liaDgsLocusSampleCount,hidden,visible:l.__liaDgsShowObject};
  })()`);
  assert.deepEqual(configured, { samples: 64, hidden: true, visible: true });
  await sleep(500);

  const block = await evaluate(`(() => {const c=__boards.A1.containerObj;
    c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
    return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  assert.match(block, /@Ortslinie\([^\n]*;M(?:_\d+)?;P;[^\n]*samples=64/);

  const imported = await evaluate(`(() => {
    const ok=renderDgsLocusFromSpec('locus-import','A1;M;P;#1565c0;name=l_import;samples=80;opacity=0.5','de');
    const l=__dgsLocusEntries['locus-import']?.locus;
    return {ok,name:l?.__liaDgsLocusName,samples:l?.__liaDgsLocusSampleCount,
      opacity:l?.__liaDgsOpacity,target:l?.__liaDgsLocusTarget?.__liaDgsPointName,
      driver:l?.__liaDgsLocusDriver?.__liaDgsPointName,errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(imported, {
    ok: true, name: 'l_import', samples: 80, opacity: 0.5, target: 'M', driver: 'P', errors: []
  });
  console.log('PASS locus creation, recomputation, settings, visibility, and export/import');
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  try { ws?.close(); } catch {}
  server.closeAllConnections();
  server.close();
  proc?.kill();
  await sleep(300);
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/'))) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
