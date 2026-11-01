import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const fixture = join(root, 'tests/fixtures/dynamic-3d-solid-tools.html');
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

  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-solid-tools-chrome-'));
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 45000);
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
  await Promise.race([loaded, sleep(1500)]);
  await evaluate('profileReady()');await sleep(1000);

  const clickAt=async(point)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point[0],y:point[1]});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:point[0],y:point[1],clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:point[0],y:point[1],clickCount:1});await sleep(80);};
  const buttonCenter = expression => evaluate("(()=>{const b=" + expression + ";if(!b)throw Error('Missing button');b.scrollIntoView({block:'nearest',inline:'nearest'});const r=b.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]})()");
  const activate = async label => {
    const container = '__boards.raum.containerObj';
    await evaluate(container + ".querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click())");
    if (await evaluate(container + ".querySelector('.lia-dgs-menu-button').getAttribute('aria-expanded')!=='true'")) {
      await clickAt(await buttonCenter(container + ".querySelector('.lia-dgs-menu-button')"));
      await sleep(200);
    }
    const prismLabels = new Set(['Prisma', 'Spat', 'Quader', 'Zylinder']);
    const parentSelector = prismLabels.has(label) ? '.lia-dgs-plane3d-button' : '.lia-dgs-solid3d-button';
    await clickAt(await buttonCenter(container + '.querySelector(' + JSON.stringify(parentSelector) + ')'));
    const tool = "[..." + container + ".querySelectorAll('.lia-dgs-geometry-tool')].find(b=>b.textContent.trim()===" + JSON.stringify(label) + ")";
    await clickAt(await buttonCenter(tool));
    assert.equal(await evaluate("(" + tool + ").getAttribute('aria-pressed')"), 'true', 'Missing active tool ' + label);
  };
  const point=async name=>clickAt(await evaluate('toolPointScreen('+JSON.stringify(name)+')'));
  const world=async p=>clickAt(await evaluate('toolScreen('+JSON.stringify(p)+')'));
  const inspect=()=>evaluate("(()=>{const e=__coordinateViews3d.raum;return{solids:[...e.solidObjects].map(o=>({kind:o.__liaSolid3DDefinition,volume:__coord.coordinateSolid3DData(o)?.volume})),status:__boards.raum.containerObj.querySelector('.lia-dgs-construction-status')?.textContent,error:__boards.raum.containerObj.querySelector('.lia-dgs-construction-status')?.dataset.error,errors:profileErrors.slice()}})()");
  const rejected = async kind => {
    const state = await inspect();
    assert.equal(state.error, '1', 'Missing actionable feedback for invalid ' + kind + ': ' + JSON.stringify(state));
    assert.equal(state.solids.filter(object => object.kind === kind).length, 0, 'Invalid ' + kind + ' was constructed');
  };
  const checks = [
    ['Tetraeder', 'tetrahedron', async () => {
      for (const name of ['O', 'X', 'U']) await point(name);
      await rejected('tetrahedron');
      for (const name of ['Y', 'XY']) await point(name);
      await rejected('tetrahedron');
      await point('Z');
    }],
    ['Pyramide', 'pyramid', async () => {
      await world([1, 1, 0]);
      await point('XY');
      await rejected('pyramid');
      await point('A');
    }],
    ['Prisma', 'prism', async () => {
      await world([1, 1, 0]);
      await world([1, 0, 0]);
      await rejected('prism');
      await world([0, 0, 1]);
    }],
    ['Spat', 'parallelepiped', async () => {
      await point('O');
      for (const p of [[1, 0, 0], [0, 1, 0], [1, 1, 0]]) await world(p);
      await rejected('parallelepiped');
      await world([0, 0, 1]);
    }],
    ['Quader', 'cuboid', async () => {
      await point('O');
      await world([1, 0, 0]);
      await world([1, 1, 0]);
      await rejected('cuboid');
      await world([0, 1, 0]);
      await world([0, 0, 1]);
    }],
    ['Zylinder', 'cylinder', async () => {
      for (const name of ['O', 'Z', 'M']) await point(name);
      await rejected('cylinder');
      await point('X');
    }],
    ['Kegel', 'cone', async () => {
      for (const name of ['O', 'Z', 'M']) await point(name);
      await rejected('cone');
      await point('X');
    }]
  ];
  for (const [label, definition, construct] of checks) {
    await activate(label);
    await construct();
    const state = await inspect();
    assert.ok(state.solids.some(object => object.kind === definition && object.volume > 0),
      'Failed ' + label + ': ' + JSON.stringify(state));
    assert.equal(state.status, undefined, 'Construction guidance must close after completion');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const path = join(tmpdir(), 'lia-coordinate-solid-tools-' + definition + '.png');
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log('PASS ' + label + ': invalid input recovered, positive volume, screenshot ' + path);
    await evaluate("(()=>{for(const o of __coordinateViews3d.raum.solidObjects){o.__liaSolid3DUserVisible=false;o.__liaDgsShowObject=false;}__boards.raum.fullUpdate()})()");
  }
  assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
  console.log('PASS actual solid construction tools');
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
