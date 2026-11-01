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
const fixture = join(root, 'tests/fixtures/dynamic-3d-solid-export.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://localhost').pathname;
  const file = requestPath === '/bundle.js' ? bundle : requestPath.startsWith('/assets/')
    ? join(assets, requestPath.slice(8)) : fixture;
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(file));
  } catch (error) {
    res.statusCode = 404;
    res.end(String(error));
  }
});

let proc;
let ws;
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

  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-solid3d-chrome-'));
  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1180,980', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', data => { stderr += data; });
  for (let index = 0; index < 100; index += 1) {
    if (existsSync(join(profile, 'DevToolsActivePort'))) break;
    await sleep(100);
  }
  assert.ok(existsSync(join(profile, 'DevToolsActivePort')), 'Chrome failed to expose CDP: ' + stderr);
  const debugPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(String.fromCharCode(10))[0];
  const pages = await (await fetch('http://127.0.0.1:' + debugPort + '/json')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));

  let sequence = 0;
  const events = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request && request.timer);
      if (message.error) request && request.reject(Error(JSON.stringify(message.error)));
      else request && request.resolve(message.result);
    } else {
      for (const listener of events.get(message.method) || []) listener(message.params);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 300000);
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
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');

  const ready = await evaluate("(() => ({solids:Object.keys(__solid3DEntries).length,transforms:Object.keys(__transformation3DEntries).length,intersections:Object.keys(__intersection3DEntries).length,bindings:[__points.raum.BP.__liaPoint3DBindingParameters,__points.raum.BK.__liaPoint3DBindingParameters],errors:profileErrors.slice()}))()");
  assert.equal(ready.solids, 8);
  assert.equal(ready.transforms, 6);
  assert.equal(ready.intersections, 3);
  assert.equal(ready.bindings[0].kind, 'polygon');
  assert.equal(ready.bindings[1].kind, 'solid');
  assert.deepEqual(ready.errors, []);

  const exported = await evaluate("(() => { const c=__boards.raum.containerObj; c.querySelector('.lia-dgs-side-menu-close')&&c.querySelector('.lia-dgs-side-menu-close').click(); const panel=c.querySelector('.lia-dgs-object-list-panel'); if(!panel.classList.contains('is-open')) c.querySelector('.lia-dgs-object-list-button').click(); c.querySelector('.lia-dgs-object-list-export').click(); [...c.querySelectorAll('.lia-dgs-export-dialog button')].find(b=>b.dataset.primary==='1').click(); return c.querySelector('.lia-dgs-export-textarea').value; })()");
  for (const macro of ['Vieleck3D', 'Tetraeder3D', 'Pyramide3D', 'Prisma3D', 'Spat3D', 'Quader3D', 'Zylinder3D', 'Kegel3D',
    'Verschiebung3D', 'Punktspiegelung3D', 'Geradenspiegelung3D', 'Ebenenspiegelung3D', 'Achsendrehung3D', 'ZentrischeStreckung3D', 'Schnitt3D']) {
    assert.ok(exported.includes('@' + macro + '('), 'Missing export macro ' + macro);
  }
  assert.ok(exported.split(String.fromCharCode(10)).some(line => line.includes('auf=F0') && line.includes('u=0') && line.includes('v=0')));
  assert.ok(exported.split(String.fromCharCode(10)).some(line => line.includes('auf=Zyl') && line.includes('surface=side') && line.includes('angle=0') && line.includes('height=0.5')));
  assert.match(exported, /objectid=base-polygon/);
  assert.match(exported, /objectid=cuboid/);
  assert.match(exported, /objectid=tr-dilate/);

  console.log('PASS Segment 5 export/import macros, surface bindings, and stable ids');
} finally {
  try { ws && ws.close(); } catch {}
  try { proc && proc.kill(); } catch {}
  try { server.close(); } catch {}
  if (profile) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(100); }
    }
  }
}
