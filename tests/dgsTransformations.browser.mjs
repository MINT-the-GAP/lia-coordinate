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
  profile = mkdtempSync(join(tmpdir(), 'lia-dgs-transformations-chrome-'));
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
  const clickAt = async position => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position[0], y: position[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
      x: position[0], y: position[1], clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: position[0], y: position[1], clickCount: 1 });
    await sleep(90);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=1&instrument=0&integration=0' });
  await loaded;
  await evaluate('profileReady()');
  await sleep(300);

  const setup = await evaluate(`(() => {
    const points={A:[-2,1],B:[-2,-2],C:[2,-2],O:[0,0]};
    for(const [name,[x,y]] of Object.entries(points)) {
      if(!finalizePointFromSpec('A1;'+name+';'+x+';'+y+';#ff00ff;1')) return false;
    }
    const marker=document.createElement('span');marker.id='linear-spec-transform-axis';
    marker.dataset.spec='A1;[B;C];#1565c0;g';marker.dataset.kind='line';marker.dataset.language='de';
    document.querySelector('.flex-child').append(marker);
    window.screenPoint=(x,y)=>{const b=__boards.A1,r=b.containerObj.getBoundingClientRect();
      return [r.left+b.origin.scrCoords[1]+x*b.unitX,r.top+b.origin.scrCoords[2]-y*b.unitY];};
    return true;
  })()`);
  assert.equal(setup, true);
  for (let index = 0; index < 30; index += 1) {
    if (await evaluate(`!!Object.values(__linearObjectEntries||{}).find(e=>e.boardId==='A1'&&e.objectName==='g')`)) break;
    await sleep(50);
  }

  const activate = async label => {
    const found = await evaluate(`(() => {const c=__boards.A1.containerObj;
      const b=[...c.querySelectorAll('.lia-dgs-relation-submenu .lia-dgs-geometry-tool')]
        .find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)return false;b.click();return true;})()`);
    assert.equal(found, true, 'Missing transformation tool ' + label);
  };
  const point = (x, y) => evaluate(`screenPoint(${x},${y})`);

  await activate('An Gerade spiegeln');
  await clickAt(await point(-2, 1));
  await clickAt(await point(0, -2));

  await activate('An Punkt spiegeln');
  await clickAt(await point(-2, 1));
  await clickAt(await point(0, 0));

  await activate('Um Punkt drehen');
  await clickAt(await point(-2, 1));
  await clickAt(await point(0, 0));
  await evaluate(`(() => {const d=__boards.A1.containerObj.querySelector('.lia-dgs-angle-dialog[data-open="1"]');
    const i=d.querySelector('input');i.value='90';i.dispatchEvent(new Event('input',{bubbles:true}));
    d.querySelector('button[data-primary="1"]').click();})()`);
  await sleep(100);

  await activate('Von Punkt strecken');
  await clickAt(await point(-2, 1));
  await clickAt(await point(0, 0));
  await evaluate(`(() => {const d=__boards.A1.containerObj.querySelector('.lia-dgs-angle-dialog[data-open="1"]');
    const i=d.querySelector('input');i.value='2';i.dispatchEvent(new Event('input',{bubbles:true}));
    d.querySelector('button[data-primary="1"]').click();})()`);
  await sleep(150);

  const polygonSetup = await evaluate(`(() => {
    for(const [name,[x,y]] of Object.entries({P:[2,1],Q:[5,1],R:[2,4]})) {
      if(!finalizePointFromSpec('A1;'+name+';'+x+';'+y+';#ff00ff;1')) return false;
    }
    const marker=document.createElement('span');marker.id='area-spec-transform-polygon';
    marker.dataset.spec='A1;[P;Q;R];#66aa55;0.2;name=SourceTriangle';marker.dataset.language='de';
    document.querySelector('.flex-child').append(marker);return true;
  })()`);
  assert.equal(polygonSetup, true);
  for (let index = 0; index < 30; index += 1) {
    if (await evaluate(`!!Object.values(__areaEntries||{}).find(e=>e.boardId==='A1'&&e.polygon)`)) break;
    await sleep(50);
  }
  await activate('Um Punkt drehen');
  await clickAt(await point(3, 2));
  await clickAt(await point(0, 0));
  await evaluate(`(() => {const d=__boards.A1.containerObj.querySelector('.lia-dgs-angle-dialog[data-open="1"]');
    const i=d.querySelector('input');i.value='90';i.dispatchEvent(new Event('input',{bubbles:true}));
    d.querySelector('button[data-primary="1"]').click();})()`);
  await sleep(120);
  const polygonImage = await evaluate(`(() => {const b=__boards.A1;
    const polygon=b.objectsList.find(o=>o.__liaDgsPolygon&&!o.__liaDgsMacroManaged);
    const points=b.objectsList.filter(p=>p.__liaDgsTransformPoint&&['P','Q','R'].includes(p.__liaDgsTransformSource?.__liaDgsPointName));
    if(!polygon)return {missing:true,objects:b.objectsList.filter(o=>o.__liaDgsPolygon||o.__liaDgsSegment||o.__liaDgsLine)
      .map(o=>({polygon:!!o.__liaDgsPolygon,segment:!!o.__liaDgsSegment,line:!!o.__liaDgsLine,macro:!!o.__liaDgsMacroManaged})),
      transformed:points.length,errors:profileErrors.slice()};
    const vertices=polygon.vertices.slice(0,3).map(p=>[p.X(),p.Y()]);
    b.removeObject(polygon);for(const p of points){const n=p.__liaDgsPointName;b.removeObject(p);
      if(__points.A1[n]===p)delete __points.A1[n];}b.update();
    return vertices;})()`);
  assert.deepEqual(polygonImage, [[-0.9999999999999999, 2], [-0.9999999999999997, 5], [-4, 2.0000000000000004]], JSON.stringify(polygonImage));

  const initial = await evaluate(`(() => Object.fromEntries(__boards.A1.objectsList
    .filter(p=>p.__liaDgsTransformPoint).map(p=>[p.__liaDgsTransformKind,[p.X(),p.Y()]])))()`);
  assert.deepEqual(initial, {
    'reflect-line': [-2, -5],
    'reflect-point': [2, -1],
    'rotate-point': [-1.0000000000000002, -2],
    'dilate-point': [-4, 2]
  });

  await evaluate(`(() => {const p=__points.A1;
    p.A.setPosition(JXG.COORDS_BY_USER,[-1,2]);p.O.setPosition(JXG.COORDS_BY_USER,[1,0]);
    p.B.setPosition(JXG.COORDS_BY_USER,[-2,-1]);p.C.setPosition(JXG.COORDS_BY_USER,[2,-1]);
    __boards.A1.update();})()`);
  await sleep(100);
  const moved = await evaluate(`(() => Object.fromEntries(__boards.A1.objectsList
    .filter(p=>p.__liaDgsTransformPoint).map(p=>[p.__liaDgsTransformKind,[p.X(),p.Y()]])))()`);
  const expected = {
    'reflect-line': [-1, -4], 'reflect-point': [3, -2],
    'rotate-point': [-1, -2], 'dilate-point': [-3, 4]
  };
  for (const [kind, coordinates] of Object.entries(expected)) {
    assert.ok(Math.hypot(moved[kind][0] - coordinates[0], moved[kind][1] - coordinates[1]) < 1e-8,
      kind + ' did not remain dependent: ' + JSON.stringify(moved));
  }

  const block = await evaluate(`(() => {const c=__boards.A1.containerObj;
    c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
    return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  assert.equal((block.match(/^@Transformationspunkt\(/gm) || []).length, 4, block);
  for (const kind of ['reflect-line', 'reflect-point', 'rotate-point', 'dilate-point']) {
    assert.ok(block.includes(';' + kind + ';'), 'Export misses ' + kind + '\n' + block);
  }

  const imported = await evaluate(`(async () => {
    const root=document.createElement('section');root.style.width='700px';document.body.append(root);
    const definitions={Punkt:['point-spec-'],Gerade:['linear-spec-','line'],
      Transformationspunkt:['transform-point-spec-'],ObjektFormat:['object-format-spec-'],DGS:['dgs-ui-']};
    let id='',sequence=0;
    for(const line of ${JSON.stringify(block)}.split('\\n')) {
      const match=line.match(/^@(\\w+)\\(.(.*).\\)$/);if(!match)continue;
      const [,macro,spec]=match,uid='transform-import-'+sequence++;
      if(macro==='Koordinatensystem') {id=spec.match(/(?:^|;)id=([^;]+)/)[1];
        const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey=uid;
        host.dataset.spec=spec;root.append(host);continue;}
      const definition=definitions[macro];if(!definition)continue;
      const node=document.createElement('span');node.id=definition[0]+uid;node.dataset.spec=spec;
      node.dataset.language='de';if(definition[1])node.dataset.kind=definition[1];root.append(node);
    }
    for(let i=0;i<100;i++) {await new Promise(r=>setTimeout(r,50));
      const entries=Object.values(__transformedPointEntries||{}).filter(e=>e.boardId===id);
      if(__boards[id]&&entries.length===4) {const p=__points[id];p.A.setPosition(JXG.COORDS_BY_USER,[0,3]);
        p.O.setPosition(JXG.COORDS_BY_USER,[2,0]);p.B.setPosition(JXG.COORDS_BY_USER,[-2,-2]);
        p.C.setPosition(JXG.COORDS_BY_USER,[2,-2]);__boards[id].update();
        return {count:entries.length,values:Object.fromEntries(entries.map(e=>[e.kind,[e.point.X(),e.point.Y()]])),
          errors:profileErrors.slice()};}}
    return {count:0,values:{},errors:profileErrors.slice()};
  })()`);
  assert.equal(imported.count, 4, JSON.stringify(imported));
  assert.deepEqual(imported.errors, []);
  assert.ok(Math.hypot(imported.values['reflect-line'][0] - 0, imported.values['reflect-line'][1] + 7) < 1e-8);
  assert.ok(Math.hypot(imported.values['reflect-point'][0] - 4, imported.values['reflect-point'][1] + 3) < 1e-8);
  assert.ok(Math.hypot(imported.values['rotate-point'][0] + 1, imported.values['rotate-point'][1] + 2) < 1e-8);
  assert.ok(Math.hypot(imported.values['dilate-point'][0] + 2, imported.values['dilate-point'][1] - 6) < 1e-8);
  console.log('PASS reflections, rotation, and central dilation stay dynamic through export/import');
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
