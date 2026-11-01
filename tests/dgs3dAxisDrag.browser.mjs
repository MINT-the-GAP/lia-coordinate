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
const fixture = join(root, 'tests/fixtures/dynamic-3d-axis-drag.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

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
  const port = server.address().port;
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-axis-drag-chrome-'));
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
      reject(Error('CDP request timed out: ' + method + ' ' + String(params?.expression || '').slice(0, 200)));
    }, 60_000);
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
    await sleep(100);
  };
  const dragAt = async (from, to) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
      x: from[0], y: from[1], clickCount: 1 });
    for (let step = 1; step <= 8; step += 1) {
      const ratio = step / 8;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
        x: from[0] + (to[0] - from[0]) * ratio,
        y: from[1] + (to[1] - from[1]) * ratio });
      await sleep(18);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: to[0], y: to[1], clickCount: 1 });
    await sleep(150);
  };
  const coords = name => evaluate('(() => { const p=__points.raum[' + JSON.stringify(name) +
    ']; return [p.X(),p.Y(),p.Z()]; })()');
  const cameraAndViewport = () => evaluate('(() => { const e=__coordinateViews3d.raum;' +
    'return {camera:{...e.camera},ranges:e.spatialRanges.map(range=>range.slice())}; })()');
  const gizmoGeometry = axis => evaluate('(() => {' +
    'const root=__boards.raum.containerObj.querySelector(".lia-dgs-axis-drag-3d");' +
    'const group=root?.querySelector("g[data-axis=' + axis + ']");' +
    'if(!root||!group) return null;' +
    'const style=getComputedStyle(root);if(root.hidden||style.display==="none"||style.visibility==="hidden")return null;' +
    'const line=[...group.querySelectorAll("line")].find(element=>Number(element.getAttribute("x1"))!==Number(element.getAttribute("x2"))||Number(element.getAttribute("y1"))!==Number(element.getAttribute("y2")));' +
    'let a,b;if(line){a={x:Number(line.getAttribute("x1")),y:Number(line.getAttribute("y1"))};b={x:Number(line.getAttribute("x2")),y:Number(line.getAttribute("y2"))};}' +
    'else{const path=[...group.querySelectorAll("path")].find(element=>typeof element.getTotalLength==="function"&&element.getTotalLength()>8);if(!path)return null;const length=path.getTotalLength();a=path.getPointAtLength(0);b=path.getPointAtLength(length);}' +
    'const matrix=(line||group.querySelector("path")).getScreenCTM();if(!matrix)return null;' +
    'const p=new DOMPoint(a.x,a.y).matrixTransform(matrix),q=new DOMPoint(b.x,b.y).matrixTransform(matrix);' +
    'const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(length<8||getComputedStyle(group).display==="none")return null;' +
    'const scope=root.getRootNode();let from=null;const tested=[];' +
    'for(const ratio of [.7,.45,.88,.25,.95]){const position=[p.x+dx*ratio,p.y+dy*ratio];let hit=scope.elementFromPoint?.(...position)||document.elementFromPoint(...position);' +
    'if(hit?.shadowRoot)hit=hit.shadowRoot.elementFromPoint(...position)||hit;' +
    'tested.push({ratio,tag:hit?.tagName,cls:typeof hit?.className==="string"?hit.className:hit?.className?.baseVal,zIndex:hit?getComputedStyle(hit).zIndex:null,parent:hit?.parentElement?.tagName,parentZIndex:hit?.parentElement?getComputedStyle(hit.parentElement).zIndex:null,gizmoZIndex:getComputedStyle(root).zIndex});' +
    'if(group.contains(hit)){from=position;break;}}' +
    'return {start:[p.x,p.y],end:[q.x,q.y],from,direction:[dx/length,dy/length],role:group.getAttribute("role"),axis:group.dataset.axis,tested};' +
    '})()');
  const visibleGizmo = () => evaluate('(() => { const root=__boards.raum.containerObj.querySelector(".lia-dgs-axis-drag-3d");' +
    'if(!root)return false;const style=getComputedStyle(root);return !root.hidden&&style.display!=="none"&&style.visibility!=="hidden"&&root.getBoundingClientRect().width>0;})()');
  const clearSelection = async () => {
    const empty = await evaluate('(() => {' +
      'const board=__boards.raum,entry=__coordinateViews3d.raum,rect=board.containerObj.getBoundingClientRect();' +
      'const objects=[...entry.points,...entry.linearObjects,...entry.planeObjects,...entry.circleObjects,...entry.sphereObjects,...entry.polygonObjects,...entry.solidObjects,...Object.values(__transformation3DEntries||{}).map(value=>value.object)];' +
      'for(let y=rect.bottom-65;y>rect.top+125;y-=43){for(let x=rect.right-65;x>rect.left+90;x-=47){' +
      'let target=document.elementFromPoint(x,y);if(target?.shadowRoot)target=target.shadowRoot.elementFromPoint(x,y)||target;' +
      'if(target?.closest?.("button,input,select,textarea,[role=button],.lia-jxg-resize-handle,.lia-dgs-top-menu,.lia-dgs-side-menu,.lia-dgs-object-list-panel,.lia-dgs-axis-drag-3d"))continue;' +
      'const local=[x-rect.left,y-rect.top],hit=objects.some(object=>[object,object?.element2D,object?.curve?.element2D,...(object?.aux2D||[])].some(part=>{try{return part?.hasPoint?.(...local)===true}catch{return false}}));' +
      'if(!hit)return {position:[x,y],target:target?.tagName,cls:typeof target?.className==="string"?target.className:target?.className?.baseVal};' +
      '}}return null;})()');
    assert.ok(empty, 'Could not find an empty board position');
    await clickAt(empty.position);
    return empty;
  };
  const selectPoint = async name => {
    await clearSelection();
    await clickAt(await evaluate('pointScreen(' + JSON.stringify(name) + ')'));
    assert.equal(await visibleGizmo(), true, 'A point click must show the axis handles');
    for (const axis of ['x', 'y', 'z']) {
      const geometry = await gizmoGeometry(axis);
      assert.ok(geometry, 'Missing visible ' + axis + ' axis handle');
      assert.equal(geometry.role, 'button', 'Axis handles must be interactive buttons');
    }
  };
  const dragAxis = async (axis, pixels = 40) => {
    const geometry = await gizmoGeometry(axis);
    assert.ok(geometry, 'Missing handle for ' + axis);
    assert.ok(geometry.from, 'Axis handle is obstructed: ' + JSON.stringify(geometry));
    const before = await cameraAndViewport();
    const to = geometry.from.map((value, index) => value + geometry.direction[index] * pixels);
    await dragAt(geometry.from, to);
    assert.deepEqual(await cameraAndViewport(), before, 'Dragging a handle must not pan or rotate the camera');
    return geometry;
  };
  const assertAxisDelta = (before, after, axis, message) => {
    const axisIndex = 'xyz'.indexOf(axis);
    const delta = after.map((value, index) => value - before[index]);
    assert.ok(Math.abs(delta[axisIndex]) > 0.05, message + ': selected axis did not move ' + JSON.stringify(delta));
    delta.forEach((value, index) => {
      if (index !== axisIndex) assert.ok(Math.abs(value) < 1e-7, message + ': other axis changed ' + JSON.stringify(delta));
    });
    return delta;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await sleep(180);

  for (const axis of ['x', 'y', 'z']) {
    await selectPoint('P');
    const before = await coords('P');
    await dragAxis(axis, 38);
    assertAxisDelta(before, await coords('P'), axis, 'Free point ' + axis + ' drag');
  }

  await selectPoint('Q');
  const undoBefore = await coords('Q');
  await dragAxis('z', 44);
  const undoAfter = await coords('Q');
  assertAxisDelta(undoBefore, undoAfter, 'z', 'Point undo setup');
  const undoClicked = await evaluate('(() => { const regression=Object.values(__liaRegressionStates||{}).find(state=>state.boardId==="raum");' +
    'if(!regression?.undoButton)return false;regression.undoButton.click();return true;})()');
  assert.equal(undoClicked, true, 'Missing regression Undo control');
  await sleep(220);
  const undoRestored = await coords('Q');
  assert.ok(undoBefore.every((value, index) => Math.abs(value - undoRestored[index]) < 1e-7),
    'Undo must restore the coordinates before the entire handle drag');

  await clearSelection();
  const sphereHit = await evaluate('(() => {' +
    'const board=__boards.raum,entry=Object.values(__sphere3DEntries).find(entry=>entry.boardId==="raum"),sphere=entry.object;' +
    'const rect=board.containerObj.getBoundingClientRect(),box=sphere.element2D.rendNode.getBoundingClientRect();' +
    'const points=Object.values(__points.raum).map(point=>[point.element2D.coords.scrCoords[1],point.element2D.coords.scrCoords[2]]);' +
    'for(let y=Math.max(rect.top+100,box.top);y<Math.min(rect.bottom-20,box.bottom);y+=3){' +
    'for(let x=Math.max(rect.left+20,box.left);x<Math.min(rect.right-20,box.right);x+=3){' +
    'const local=[x-rect.left,y-rect.top];if(points.every(point=>Math.hypot(local[0]-point[0],local[1]-point[1])>22)&&sphere.element2D.hasPoint(local[0],local[1]))return [x,y];}}return null;})()');
  assert.ok(sphereHit, 'No selectable sphere surface found');
  await clickAt(sphereHit);
  assert.equal(await visibleGizmo(), true, 'Selecting a sphere must show the axis handles');
  for (const axis of ['x', 'y', 'z']) {
    const beforeA = await coords('A'), beforeB = await coords('B');
    const radius = Math.hypot(...beforeB.map((value, index) => value - beforeA[index]));
    await dragAxis(axis, 36);
    const afterA = await coords('A'), afterB = await coords('B');
    const deltaA = assertAxisDelta(beforeA, afterA, axis, 'Sphere center ' + axis + ' drag');
    const deltaB = assertAxisDelta(beforeB, afterB, axis, 'Sphere radius point ' + axis + ' drag');
    assert.ok(deltaA.every((value, index) => Math.abs(value - deltaB[index]) < 1e-7),
      'Sphere drag must translate both sources by the same vector');
    assert.ok(Math.abs(radius - Math.hypot(...afterB.map((value, index) => value - afterA[index]))) < 1e-7,
      'Sphere radius must remain constant during an axis drag');
  }

  await selectPoint('Q');
  const beforeRotation = await gizmoGeometry('x');
  await evaluate('__coord.setCoordinateCamera(__coordinateViews3d.raum,{azimuth:2.1,elevation:.65,bank:.2})');
  await sleep(150);
  const afterRotation = await gizmoGeometry('x');
  assert.ok(afterRotation, 'The handles must remain attached after a camera rotation');
  assert.ok(Math.hypot(...afterRotation.direction.map((value, index) => value - beforeRotation.direction[index])) > 0.1,
    'The x handle must follow the projected x direction after a camera rotation');
  const afterRotationBefore = await coords('Q');
  await dragAxis('x', 42);
  assertAxisDelta(afterRotationBefore, await coords('Q'), 'x', 'Rotated-camera point drag');

  await selectPoint('Q');
  const cancelBefore = await coords('Q');
  const cancelCamera = await cameraAndViewport();
  const cancelGeometry = await gizmoGeometry('y');
  assert.ok(cancelGeometry?.from, 'Missing or obstructed y handle for Escape cancellation: ' + JSON.stringify(cancelGeometry));
  assert.equal(cancelGeometry.tested.length, 1, 'A projected y handle must remain directly clickable over an overlapping JSXGraph label');
  const cancelEnd = cancelGeometry.from.map((value, index) => value + cancelGeometry.direction[index] * 40);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cancelGeometry.from[0], y: cancelGeometry.from[1] });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
    x: cancelGeometry.from[0], y: cancelGeometry.from[1], clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
    x: cancelEnd[0], y: cancelEnd[1] });
  await sleep(100);
  const cancelDuring = await coords('Q');
  const cancelDiagnostic = await evaluate('(() => { const state=__boards.raum.__liaDgs3DHookState;' +
    'return {multiPointer:state.multiSelectPointerId,axisStarts:state.axisDragStarts?.map(start=>({x:start.x,y:start.y,z:start.z})),selected:state.multiSelectedObjects.map(object=>object.__liaDgsPointName||object.__liaDgsSphere3DName||object.name)};})()');
  assertAxisDelta(cancelBefore, cancelDuring, 'y', 'In-progress handle drag ' + JSON.stringify({cancelGeometry,cancelDiagnostic}));
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
    x: cancelEnd[0], y: cancelEnd[1], clickCount: 1 });
  await sleep(140);
  const cancelAfter = await coords('Q');
  assert.ok(cancelBefore.every((value, index) => Math.abs(value - cancelAfter[index]) < 1e-7),
    'Escape must restore the point position before the active handle drag');
  assert.deepEqual(await cameraAndViewport(), cancelCamera, 'Cancelling a handle drag must leave the camera unchanged');

  await evaluate('__coord.setCoordinateProjection(__coordinateViews3d.raum,"central")');
  await sleep(160);
  for (const axis of ['x', 'y', 'z']) {
    await selectPoint('Q');
    const before = await coords('Q');
    await dragAxis(axis, 34);
    assertAxisDelta(before, await coords('Q'), axis, 'Central-projection point ' + axis + ' drag');
  }
  if (process.env.AXIS_DRAG_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(process.env.AXIS_DRAG_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }

  const emptySelectionTarget = await clearSelection();
  assert.equal(await visibleGizmo(), false, 'An empty selection must hide the handles: ' + JSON.stringify(emptySelectionTarget));
  await selectPoint('Q');
  await evaluate('__coord.setCoordinateViewMode(__coordinateViews3d.raum,"2d")');
  await sleep(140);
  assert.equal(await visibleGizmo(), false, 'The handles must be hidden in 2D');
  assert.deepEqual(await evaluate('profileErrors.slice()'), []);
  console.log('PASS 3D axis handles: point and sphere movement on x/y/z, rigid shape, undo, Escape cancel, parallel/central projection, 2D isolation');
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
