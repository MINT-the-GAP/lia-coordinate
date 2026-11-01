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
const fixture = join(root, 'tests/fixtures/dynamic-3d.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');
assert.ok(existsSync(bundle), 'Build dist/index.js first');

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/bundle.js' ? bundle : path.startsWith('/assets/')
    ? join(assets, path.slice(8)) : fixture;
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
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-camera-drag-'));
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
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('CDP request timed out: ' + method + ' ' + String(params?.expression || '').slice(0, 160)));
    }, 60_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const rightDragAt = async (from, to, beforeRelease = null) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'right', buttons: 2,
      x: from[0], y: from[1], clickCount: 1 });
    for (let step = 1; step <= 8; step += 1) {
      const ratio = step / 8;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'right', buttons: 2,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
      await sleep(12);
    }
    if (beforeRelease) await beforeRelease();
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'right', buttons: 0,
      x: to[0], y: to[1], clickCount: 1 });
    await sleep(130);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await evaluate('(() => {'
    + 'const section=document.createElement("section");section.style.width="600px";'
    + 'const host=document.createElement("lia-coordinate-board");'
    + 'host.dataset.liaCoordinateKey="camera-drag";'
    + 'host.dataset.spec="id=camera_drag;mode=3d;xmin=-4;xmax=4;ymin=-4;ymax=4;zmin=-4;zmax=4;width=560;projection=parallel;camera=0.8/0.3/0";'
    + 'section.append(host);'
    + 'const dgs=document.createElement("div");dgs.id="dgs-ui-camera-drag";'
    + 'dgs.dataset.spec="camera_drag";dgs.dataset.language="de";section.append(dgs);'
    + 'document.querySelector("#fixture").append(section);'
    + '})()');
  await evaluate('(async()=>{for(let i=0;i<150;i++){'
    + 'const b=__boards?.camera_drag,e=__coordinateViews3d?.camera_drag;'
    + 'if(b&&e&&e.viewMode==="3d")return true;'
    + 'await new Promise(r=>setTimeout(r,25));'
    + '}throw Error("camera board timeout: "+JSON.stringify(profileErrors));})()');
  await evaluate('__boards.camera_drag.containerObj.scrollIntoView({block:"center"})');
  await sleep(180);

  const gestureCenter = () => evaluate('(()=>{const r=__boards.camera_drag.containerObj.getBoundingClientRect();'
    + 'return [r.left+r.width/2,r.top+r.height/2]})()');
  const setCamera = async camera => {
    await evaluate('__coord.setCoordinateCamera(__coordinateViews3d.camera_drag,' + JSON.stringify(camera) + ')');
    await sleep(90);
  };
  const projectedForward = reference => evaluate('(()=>{'
    + 'const b=__boards.camera_drag,e=__coordinateViews3d.camera_drag,'
    + 'c=' + JSON.stringify(reference) + ','
    + 'p=[Math.sin(c.azimuth)*Math.cos(c.elevation),Math.cos(c.azimuth)*Math.cos(c.elevation),Math.sin(c.elevation)],'
    + 'o=e.view.project3DTo2D([0,0,0]),q=e.view.project3DTo2D(p);'
    + 'return [(q[1]-o[1])*b.unitX,-(q[2]-o[2])*b.unitY];'
    + '})()');
  const actualCamera = () => evaluate('(()=>{const e=__coordinateViews3d.camera_drag;'
    + 'return {camera:{azimuth:e.view.az_slide.Value(),elevation:e.view.el_slide.Value(),bank:e.view.bank_slide.Value()},'
    + 'mode:e.viewMode,trackball:e.view.trackballEnabled,errors:profileErrors.slice()};})()');
  const projectedAxes = () => evaluate('(()=>{const b=__boards.camera_drag,e=__coordinateViews3d.camera_drag,'
    + 'o=e.view.project3DTo2D([0,0,0]);return [[1,0,0],[0,1,0],[0,0,1]].map(axis=>{'
    + 'const p=e.view.project3DTo2D(axis);return [(p[1]-o[1])*b.unitX,-(p[2]-o[2])*b.unitY]})})()');
  const axisGesture = axis => evaluate('(()=>{const b=__boards.camera_drag,e=__coordinateViews3d.camera_drag,'
    + 'r=b.containerObj.getBoundingClientRect(),o=e.view.project3DTo2D([0,0,0]),p=e.view.project3DTo2D('
    + JSON.stringify([0, 1, 2].map(index => index === axis ? 1 : 0)) + '),'
    + 'ox=b.origin.scrCoords[1]+o[1]*b.unitX,oy=b.origin.scrCoords[2]-o[2]*b.unitY,'
    + 'dx=(p[1]-o[1])*b.unitX,dy=-(p[2]-o[2])*b.unitY,l=Math.hypot(dx,dy),ux=dx/l,uy=dy/l;'
    + 'return [[r.left+ox+ux*45,r.top+oy+uy*45],[r.left+ox+ux*45-uy*70,r.top+oy+uy*45+ux*70]]})()');
  const originGesture = () => evaluate('(()=>{const b=__boards.camera_drag,e=__coordinateViews3d.camera_drag,'
    + 'r=b.containerObj.getBoundingClientRect(),o=e.view.project3DTo2D([0,0,0]),'
    + 'x=r.left+b.origin.scrCoords[1]+o[1]*b.unitX,y=r.top+b.origin.scrCoords[2]-o[2]*b.unitY;'
    + 'return [[x,y],[x+70,y]]})()');
  const initialCamera = { azimuth: 0.8, elevation: 0.3, bank: 0.2 };
  await setCamera(initialCamera);
  const beforeHorizontal = await projectedForward(initialCamera);
  const center = await gestureCenter();
  await rightDragAt(center, [center[0] + 75, center[1]]);
  const afterHorizontal = await projectedForward(initialCamera);
  assert.ok(afterHorizontal[0] - beforeHorizontal[0] > 10,
    JSON.stringify({ beforeHorizontal, afterHorizontal }));
  assert.ok(Math.abs(afterHorizontal[1] - beforeHorizontal[1]) <
    (afterHorizontal[0] - beforeHorizontal[0]) * 0.5,
    JSON.stringify({ beforeHorizontal, afterHorizontal }));

  await setCamera(initialCamera);
  const beforeVertical = await projectedForward(initialCamera);
  await rightDragAt(center, [center[0], center[1] - 75]);
  const afterVertical = await projectedForward(initialCamera);
  assert.ok(afterVertical[1] - beforeVertical[1] < -10,
    JSON.stringify({ beforeVertical, afterVertical }));
  assert.ok(Math.abs(afterVertical[0] - beforeVertical[0]) <
    (beforeVertical[1] - afterVertical[1]) * 0.5,
    JSON.stringify({ beforeVertical, afterVertical }));
  assert.equal((await actualCamera()).trackball, false);

  const planes = [
    { name: 'XY', camera: { azimuth: 0.8, elevation: Math.PI / 2 - 0.04, bank: 0.2 }, normal: [0, 0, 1] },
    { name: 'YZ', camera: { azimuth: Math.PI / 2 - 0.04, elevation: 0.02, bank: 0.2 }, normal: [1, 0, 0] },
    { name: 'XZ', camera: { azimuth: 0.04, elevation: 0.02, bank: 0.2 }, normal: [0, 1, 0] }
  ];
  for (const plane of planes) {
    await setCamera(plane.camera);
    const before = (await actualCamera()).camera;
    let during;
    await rightDragAt(center, [center[0] + 8, center[1]], async () => { during = await actualCamera(); });
    const duringForward = [Math.sin(during.camera.azimuth) * Math.cos(during.camera.elevation),
      Math.cos(during.camera.azimuth) * Math.cos(during.camera.elevation), Math.sin(during.camera.elevation)];
    assert.ok(Math.hypot(...duringForward.map((value, index) => value - plane.normal[index])) > 1e-4,
      JSON.stringify({ plane: plane.name, before, during }));
    const after = await actualCamera();
    const { azimuth, elevation } = after.camera;
    const forward = [Math.sin(azimuth) * Math.cos(elevation),
      Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation)];
    assert.ok(Math.hypot(...forward.map((value, index) => value - plane.normal[index])) < 1e-8,
      JSON.stringify({ plane: plane.name, before, after, forward }));
    assert.equal(after.mode, '3d', JSON.stringify({ plane: plane.name, after }));
    assert.deepEqual(after.errors, [], JSON.stringify({ plane: plane.name, after }));
  }

  for (const axis of [0, 1, 2]) {
    await setCamera(initialCamera);
    const before = await projectedAxes();
    const gesture = await axisGesture(axis);
    await rightDragAt(gesture[0], gesture[1]);
    const after = await projectedAxes();
    assert.ok(Math.hypot(after[axis][0]-before[axis][0],after[axis][1]-before[axis][1])<.5,
      JSON.stringify({axis,before,after,gesture}));
    assert.ok(after.some((value,index)=>index!==axis&&
      Math.hypot(value[0]-before[index][0],value[1]-before[index][1])>5),
      JSON.stringify({axis,before,after,gesture}));
  }

  const exactPlanes = [
    { name: 'XY', camera: { azimuth: .8, elevation: Math.PI / 2, bank: .2 }, hidden: 2 },
    { name: 'YZ', camera: { azimuth: Math.PI / 2, elevation: 0, bank: .2 }, hidden: 0 },
    { name: 'XZ', camera: { azimuth: 0, elevation: 0, bank: .2 }, hidden: 1 }
  ];
  for (const plane of exactPlanes) {
    await setCamera(plane.camera);
    const before = await projectedAxes();
    const beforeCamera = (await actualCamera()).camera;
    const gesture = await originGesture();
    await rightDragAt(gesture[0], gesture[1]);
    const after = await projectedAxes();
    const afterCamera = (await actualCamera()).camera;
    const beforeForward = [Math.sin(beforeCamera.azimuth)*Math.cos(beforeCamera.elevation),
      Math.cos(beforeCamera.azimuth)*Math.cos(beforeCamera.elevation),Math.sin(beforeCamera.elevation)];
    const afterForward = [Math.sin(afterCamera.azimuth)*Math.cos(afterCamera.elevation),
      Math.cos(afterCamera.azimuth)*Math.cos(afterCamera.elevation),Math.sin(afterCamera.elevation)];
    assert.ok(Math.hypot(...afterForward.map((value,index)=>value-beforeForward[index]))<1e-8,
      JSON.stringify({plane,beforeCamera,afterCamera,beforeForward,afterForward}));
    assert.ok(after.some((value,index)=>index!==plane.hidden&&
      Math.hypot(value[0]-before[index][0],value[1]-before[index][1])>5),
      JSON.stringify({plane,before,after,gesture}));
  }

  await setCamera(initialCamera);
  const objectPosition = await evaluate('(()=>{'
    + 'const b=__boards.camera_drag,p=__coord.createCoordinatePoint3D(b,[0,0,0],{name:"P",withLabel:false});'
    + 'window.__cameraDragPoint=p;b.update();'
    + 'const rect=b.containerObj.getBoundingClientRect(),screen=p.element2D.coords.scrCoords;'
    + 'return [rect.left+screen[1],rect.top+screen[2]];})()');
  const beforeObjectDrag = (await actualCamera()).camera;
  await rightDragAt(objectPosition, [objectPosition[0] + 55, objectPosition[1]]);
  const afterObjectDrag = (await actualCamera()).camera;
  assert.ok(Math.abs(afterObjectDrag.azimuth - beforeObjectDrag.azimuth) > 0.03,
    JSON.stringify({ beforeObjectDrag, afterObjectDrag, objectPosition }));
  console.log('PASS right-drag scene direction, axis locks and XY/YZ/XZ origin roll');
} finally {
  try { ws?.close(); } catch {}
  try { proc?.kill(); } catch {}
  try { server.close(); } catch {}
  if (profile) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(100); }
    }
  }
}
