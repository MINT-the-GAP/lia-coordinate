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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-linear3d-chrome-'));
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 120_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const clickAt = async (position, button = 'left') => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position[0], y: position[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button, buttons: button === 'left' ? 1 : 2,
      x: position[0], y: position[1], clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, buttons: 0,
      x: position[0], y: position[1], clickCount: 1 });
    await sleep(180);
  };
  const dragAt = async (from, to, modifiers = 0) => {
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1], modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, x: from[0], y: from[1], clickCount: 1, modifiers });
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, modifiers,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, x: to[0], y: to[1], clickCount: 1, modifiers });
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await sleep(220);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await evaluate(`(async()=>{for(let i=0;i<120;i++){if(Object.keys(__linear3DEntries||{}).filter(k=>k.startsWith('macro-')).length===5)return true;await new Promise(r=>setTimeout(r,25));}throw Error('Linear3D macro timeout');})()`);

  const macros = await evaluate(`(() => {const entries=Object.fromEntries(Object.entries(__linear3DEntries).filter(([key])=>key.startsWith('macro-')));
    const data={};for(const [key,entry] of Object.entries(entries)){const o=entry.object,p=o.__liaLinear3DSourcePoints;
      data[key]={kind:o.__liaLinear3DKind,free:!!o.__liaLinear3DFreeVector,points:p.map(x=>[x.X(),x.Y(),x.Z()]),
        components:__coord.coordinateVector3DComponents(o),native:o.elType||o.constructor?.name,
        straight:[o.element2D?.visProp?.straightfirst,o.element2D?.visProp?.straightlast],arrows:[o.element2D?.visProp?.firstarrow,o.element2D?.visProp?.lastarrow],
        style:[o.__liaDgsLineColor,o.__liaDgsTextColor,o.__liaDgsOpacity,o.__liaDgsLineStyle,o.__liaDgsSegmentStrokeWidth,o.__liaDgsLayer],
        scene:o.__liaSceneRecord};}return {data,registry:__coordinateViews3d.raum.linearObjects.size,errors:profileErrors.slice()};})()`);
  assert.deepEqual(Object.values(macros.data).map(value => value.kind).sort(), ['line','ray','segment','vector','vector']);
  assert.equal(macros.data['macro-free-vector'].free, true);
  assert.deepEqual(macros.data['macro-free-vector'].components, [-1.5,2.25,0.5]);
  assert.deepEqual(macros.data['macro-free-vector'].scene.components, [-1.5,2.25,0.5]);
  assert.equal(macros.data['macro-free-vector'].scene.anchorPointId, 'macro:point3d:b');
  assert.equal(macros.registry, 5);
  assert.deepEqual(macros.errors, []);

  const outsideViewportProjection = await evaluate(`(() => {
    const entry=__coordinateViews3d.raum,board=__boards.raum;
    const ranges=entry.spatialRanges,center=ranges.map(range=>(range[0]+range[1])/2);
    const outside=[ranges[0][1]+(ranges[0][1]-ranges[0][0])*.8,center[1],center[2]];
    const first=__points.raum.A,second=__points.raum.B;
    const original=[second.X(),second.Y(),second.Z()];
    __coord.setCoordinatePoint3D(second,outside);
    const items=['segment','vector','ray','line'].map(kind=>__coord.createCoordinateLinear3D(board,kind,first,second,{name:'',withLabel:false,visible:false}));
    board.fullUpdate();
    const expected=entry.view.project3DTo2D(outside);
    const result=items.map(object=>({kind:object.__liaLinear3DKind,
      endpoint:object.point2.element2D.coords.usrCoords.slice(0,3),
      straight:[object.element2D.visProp.straightfirst,object.element2D.visProp.straightlast]}));
    items.forEach(object=>{object.__liaLinear3DCleanup?.();board.removeObject(object);});
    __coord.setCoordinatePoint3D(second,original);
    board.fullUpdate();
    return {expected,result,errors:profileErrors.slice()};
  })()`);
  for (const item of outsideViewportProjection.result) {
    assert.ok(Math.abs(item.endpoint[1]-outsideViewportProjection.expected[1])<1e-8&&
      Math.abs(item.endpoint[2]-outsideViewportProjection.expected[2])<1e-8,
    JSON.stringify(outsideViewportProjection));
  }
  assert.deepEqual(outsideViewportProjection.result.map(item=>[item.kind,item.straight]), [
    ['segment',[false,false]],['vector',[false,false]],['ray',[false,true]],['line',[true,true]]
  ]);
  assert.deepEqual(outsideViewportProjection.errors, []);

  const linearVisual = await evaluate(`(() => {const board=__boards.raum.containerObj.getBoundingClientRect(),items=[...Object.entries(__linear3DEntries).filter(([name])=>name.startsWith('macro-')).map(([name,entry])=>({name,kind:entry.object.__liaLinear3DKind,object:entry.object})),...Object.entries(__points.raum).filter(([,object])=>object?.__liaPoint3D).map(([name,object])=>({name,kind:'point',object}))];return items.map(item=>{const node=item.object?.element2D?.rendNode||item.object?.rendNode,rect=node?.getBoundingClientRect?.(),style=node?getComputedStyle(node):null;return {...item,object:undefined,node:!!node,width:rect?.width||0,height:rect?.height||0,visible:!!rect&&style?.display!=='none'&&style?.visibility!=='hidden'&&rect.right>board.left&&rect.left<board.right&&rect.bottom>board.top&&rect.top<board.bottom&&Math.max(rect.width,rect.height)>3}})})()`);
  assert.ok(linearVisual.length>=8,JSON.stringify(linearVisual));
  assert.ok(linearVisual.every(item=>item.node&&item.visible),JSON.stringify(linearVisual));
  const dynamicBefore = await evaluate(`__coord.coordinateVector3DComponents(__linear3DEntries['macro-vector'].object)`);
  const screenA = await evaluate('pointScreen("A")');
  await dragAt(screenA, [screenA[0] + 46, screenA[1] + 28]);
  const dynamicXY = await evaluate(`({coords:[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()],components:__coord.coordinateVector3DComponents(__linear3DEntries['macro-vector'].object)})`);
  assert.notDeepEqual(dynamicXY.components, dynamicBefore);
  assert.equal(dynamicXY.coords[2], 3);
  const screenAZ = await evaluate('pointScreen("A")');
  await dragAt(screenAZ, [screenAZ[0], screenAZ[1] - 60], 8);
  const dynamicZ = await evaluate(`({coords:[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()],components:__coord.coordinateVector3DComponents(__linear3DEntries['macro-vector'].object)})`);
  assert.ok(Math.abs(dynamicZ.coords[2] - 3) > .1, JSON.stringify(dynamicZ));
  assert.notDeepEqual(dynamicZ.components, dynamicXY.components);

  const createWithTool = async (label, first, second) => {
    const activated = await evaluate(`(() => {const c=__boards.raum.containerObj,b=[...c.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!b)return {found:false};const before=b.getAttribute('aria-pressed');if(before!=='true')b.click();return {found:true,disabled:b.disabled,before,pressed:b.getAttribute('aria-pressed')};})()`);
    assert.equal(activated.found, true, 'Missing DGS tool ' + label);
    assert.equal(activated.disabled, false, 'Disabled DGS tool ' + label);
    assert.equal(activated.pressed, 'true', 'Inactive DGS tool ' + label + ': ' + JSON.stringify(activated));
    await clickAt(await evaluate(`pointScreen(${JSON.stringify(first)})`));
    assert.equal(await evaluate(`__points.raum[${JSON.stringify(first)}].rendNode.classList.contains('lia-dgs-segment-endpoint')`), true, label + ' did not select first Point3D');
    await clickAt(await evaluate(`pointScreen(${JSON.stringify(second)})`));
  };
  await createWithTool('Strecke', 'A', 'B');
  await createWithTool('Gerade', 'B', 'C');
  await createWithTool('Strahl', 'C', 'A');
  await createWithTool('Vektor', 'A', 'C');
  const dgsObjects = await evaluate(`(() => {const objects=[...__coordinateViews3d.raum.linearObjects].filter(o=>!o.__liaDgsMacroManaged);
    const state=Object.values(__liaRegressionStates).find(x=>x.boardId==='raum');return {kinds:objects.map(o=>o.__liaLinear3DKind).sort(),count:objects.length,sources:objects.map(o=>o.__liaLinear3DSourcePoints.map(p=>p.__liaDgsPersistentId)),active:state?.activeTool,selected:state?.selectedSegmentPoint?.__liaDgsPointName,all:__coordinateViews3d.raum.linearObjects.size,errors:profileErrors.slice()};})()`);
  assert.deepEqual(dgsObjects.kinds, ['line','ray','segment','vector'], JSON.stringify(dgsObjects));
  assert.equal(dgsObjects.count, 4);
  assert.deepEqual(dgsObjects.errors, []);

  const spatialAngleTool = await evaluate(`(() => {
    const container=__boards.raum.containerObj;
    container.querySelector('.lia-dgs-angle-button')?.click();
    const button=[...container.querySelectorAll('.lia-dgs-angle-submenu .lia-dgs-geometry-tool')]
      .find(item=>item.textContent.trim()==='Winkel zwischen Objekten');
    if(!button)return {found:false,labels:[...container.querySelectorAll('.lia-dgs-angle-submenu .lia-dgs-geometry-tool')].map(item=>item.textContent.trim())};
    if(button.getAttribute('aria-pressed')!=='true')button.click();
    [...__coordinateViews3d.raum.planeObjects].forEach(object=>{object.__liaDgsShowObject=false;});
    return {found:true,disabled:button.disabled,hidden:button.hidden,label:button.textContent.trim(),pressed:button.getAttribute('aria-pressed')};
  })()`);
  assert.deepEqual(spatialAngleTool, {found:true,disabled:false,hidden:false,label:'Winkel zwischen Objekten',pressed:'true'});
  await clickAt(await evaluate("(()=>{const r=__linear3DEntries['macro-line'].object.element2D.rendNode.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()"));
  const selectedSpatialAngleSource = await evaluate("[...__coordinateViews3d.raum.linearObjects].filter(object=>object.element2D?.rendNode?.classList?.contains('lia-dgs-relation-source')).map(object=>object.__liaDgsLineName||object.__liaDgsRayName||object.__liaDgsSegmentName||object.__liaDgsVectorName||object.name)");
  assert.deepEqual(selectedSpatialAngleSource, ['b'], JSON.stringify(selectedSpatialAngleSource));
  await clickAt(await evaluate("(()=>{const r=__linear3DEntries['macro-ray'].object.element2D.rendNode.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()"));
  await sleep(220);
  const spatialAngle = await evaluate(`(() => {
    [...__coordinateViews3d.raum.planeObjects].forEach(object=>{object.__liaDgsShowObject=true;});
    const angle=[...__coordinateViews3d.raum.curveObjects].find(object=>object.__liaDgsAngle3D&&!object.__liaDgsMacroManaged);
    const rect=angle?.element2D?.rendNode?.getBoundingClientRect?.();
    return {exists:!!angle,definition:angle?.__liaDgsAngle3DDefinition,
      sources:angle?.__liaDgsAngle3DSources?.map(object=>object.__liaDgsLineName||object.__liaDgsRayName),
      helpers:angle?.__liaDgsAngle3DHelpers?.length,label:String(angle?.label?.rendNode?.textContent||''),
      visible:!!rect&&Math.max(rect.width,rect.height)>2,pressed:__boards.raum.containerObj.querySelector('.lia-dgs-angle-submenu .lia-dgs-geometry-tool[aria-pressed=true]')?.getAttribute('aria-pressed')||'false',errors:profileErrors.slice()};
  })()`);
  assert.equal(spatialAngle.exists, true, JSON.stringify(spatialAngle));
  assert.equal(spatialAngle.definition, 'lines', JSON.stringify(spatialAngle));
  assert.deepEqual(spatialAngle.sources, ['b','c'], JSON.stringify(spatialAngle));
  assert.equal(spatialAngle.helpers, 2, JSON.stringify(spatialAngle));
  assert.match(spatialAngle.label, /[°∘]/);
  assert.equal(spatialAngle.visible, true, JSON.stringify(spatialAngle));
  assert.equal(spatialAngle.pressed, 'false');
  assert.deepEqual(spatialAngle.errors, []);

  const activateSpatialAngle = async () => {
    const result=await evaluate("(()=>{const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-angle-button').click();const b=[...c.querySelectorAll('.lia-dgs-angle-submenu .lia-dgs-geometry-tool')].find(x=>x.textContent.trim()==='Winkel zwischen Objekten');b?.click();return {found:!!b,disabled:b?.disabled,pressed:b?.getAttribute('aria-pressed')}})()");
    if(result.found&&result.pressed!=='true'){
      result.pressed=await evaluate(`(()=>{const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-angle-button').click();return c.querySelector('.lia-dgs-angle-submenu .lia-dgs-geometry-tool')?.getAttribute('aria-pressed')})()`);
    }
    assert.deepEqual(result,{found:true,disabled:false,pressed:'true'});
  };
  const planeScreen = async key => evaluate("(()=>{const o=__plane3DEntries["+JSON.stringify(key)+"].object,p=o.__liaPlane3DClippedPolygon,e=__coordinateViews3d.raum,b=__boards.raum,r=b.containerObj.getBoundingClientRect(),q=p.map(x=>e.view.project3DTo2D(x)),x=q.reduce((s,v)=>s+v[1],0)/q.length,y=q.reduce((s,v)=>s+v[2],0)/q.length;return [r.left+b.origin.scrCoords[1]+x*b.unitX,r.top+b.origin.scrCoords[2]-y*b.unitY]})()");

  await activateSpatialAngle();
  await evaluate("(()=>{[...__coordinateViews3d.raum.linearObjects].forEach(o=>o.__liaDgsShowObject=false);[...__coordinateViews3d.raum.planeObjects].forEach(o=>o.__liaDgsShowObject=false);__linear3DEntries['macro-line'].object.__liaDgsShowObject=true})()");
  await clickAt(await evaluate("(()=>{const r=__linear3DEntries['macro-line'].object.element2D.rendNode.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()"));
  assert.equal(await evaluate("__linear3DEntries['macro-line'].object.element2D.rendNode.classList.contains('lia-dgs-relation-source')"),true);
  await evaluate("(()=>{__linear3DEntries['macro-line'].object.__liaDgsShowObject=false;__plane3DEntries['macro-plane-normal'].object.__liaDgsShowObject=true})()");
  await clickAt(await planeScreen('macro-plane-normal'));
  await sleep(180);
  assert.equal(await evaluate("[...__coordinateViews3d.raum.curveObjects].filter(o=>o.__liaDgsAngle3DDefinition==='line-plane'&&!o.__liaDgsMacroManaged).length"),1);

  await activateSpatialAngle();
  await evaluate("(()=>{[...__coordinateViews3d.raum.linearObjects].forEach(o=>o.__liaDgsShowObject=false);[...__coordinateViews3d.raum.planeObjects].forEach(o=>o.__liaDgsShowObject=false);__plane3DEntries['macro-plane-points'].object.__liaDgsShowObject=true})()");
  await clickAt(await planeScreen('macro-plane-points'));
  assert.equal(await evaluate("__plane3DEntries['macro-plane-points'].object.element2D.rendNode.classList.contains('lia-dgs-relation-source')"),true);
  await evaluate("(()=>{__plane3DEntries['macro-plane-points'].object.__liaDgsShowObject=false;__plane3DEntries['macro-plane-normal'].object.__liaDgsShowObject=true})()");
  await clickAt(await planeScreen('macro-plane-normal'));
  await sleep(180);
  const spatialAngleDefinitions = await evaluate("(()=>{[...__coordinateViews3d.raum.linearObjects].forEach(o=>o.__liaDgsShowObject=true);[...__coordinateViews3d.raum.planeObjects].forEach(o=>o.__liaDgsShowObject=true);return [...__coordinateViews3d.raum.curveObjects].filter(o=>o.__liaDgsAngle3D&&!o.__liaDgsMacroManaged).map(o=>o.__liaDgsAngle3DDefinition).sort()})()");
  assert.deepEqual(spatialAngleDefinitions,['line-plane','lines','planes']);

  const beforeDegenerate = dgsObjects.count;
  const activated = await evaluate(`(() => {const b=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()==='Strecke');if(b.getAttribute('aria-pressed')!=='true')b.click();return b.getAttribute('aria-pressed')==='true';})()`);
  assert.equal(activated, true);
  await clickAt(await evaluate('pointScreen("A")'));
  await clickAt(await evaluate('pointScreen("A")'));
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.linearObjects].filter(o=>!o.__liaDgsMacroManaged).length`), beforeDegenerate);
  assert.equal(await evaluate(`[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()==='Strecke').getAttribute('aria-pressed')`), 'false');

  const boardArea = await evaluate(`(()=>{const r=__boards.raum.containerObj.getBoundingClientRect();return [[r.left+r.width*.27,r.top+r.height*.68],[r.left+r.width*.39,r.top+r.height*.61]]})()`);
  await evaluate(`(()=>{const b=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()==='Strecke');if(b.getAttribute('aria-pressed')!=='true')b.click();return b.getAttribute('aria-pressed')})()`);
  await clickAt(boardArea[0]);
  await clickAt(boardArea[1]);
  const autoCreated = await evaluate(`({points:[...__coordinateViews3d.raum.points].filter(o=>!o.__liaDgsMacroManaged).length,linears:[...__coordinateViews3d.raum.linearObjects].filter(o=>!o.__liaDgsMacroManaged).length})`);
  assert.equal(autoCreated.linears, 5, JSON.stringify(autoCreated));
  assert.equal(autoCreated.points, 2);
  const historyButton = async kind => {
    const ok = await evaluate(`(()=>{const s=Object.values(__liaRegressionStates).find(x=>x.boardId==='raum'),b=${JSON.stringify(kind)}==='undo'?s.undoButton:s.redoButton;if(!b)return false;b.click();return true})()`);
    assert.equal(ok, true);
    await sleep(260);
  };
  await historyButton('undo');
  const afterAtomicUndo = await evaluate(`(()=>{const points=[...__coordinateViews3d.raum.points].filter(o=>!o.__liaDgsMacroManaged),s=Object.values(__liaRegressionStates).find(x=>x.boardId==='raum'),redo=s?.redoActions?.at(-1);return {points:points.length,names:points.map(p=>p.__liaDgsPointName),linears:[...__coordinateViews3d.raum.linearObjects].filter(o=>!o.__liaDgsMacroManaged).length,snapshot:(__dgsConstructionStates?.raum?.records||[]).filter(r=>r.type==='point'&&r.origin==='dgs').map(r=>r.name),redo:redo?{keys:Object.keys(redo),before:redo.before?.records?.filter(r=>r.type==='point'&&r.origin==='dgs').map(r=>r.name),after:redo.after?.records?.filter(r=>r.type==='point'&&r.origin==='dgs').map(r=>r.name)}:null};})()`);
  assert.deepEqual({points:afterAtomicUndo.points,linears:afterAtomicUndo.linears}, { points: 0, linears: 4 }, JSON.stringify(afterAtomicUndo));
  await historyButton('redo');
  assert.deepEqual(await evaluate(`({points:[...__coordinateViews3d.raum.points].filter(o=>!o.__liaDgsMacroManaged).length,linears:[...__coordinateViews3d.raum.linearObjects].filter(o=>!o.__liaDgsMacroManaged).length})`), { points: 2, linears: 5 });

  const openEntry = async name => {
    const ok = await evaluate(`(() => {const c=__boards.raum.containerObj,p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();const e=[...c.querySelectorAll('.lia-dgs-object-list-entry')].find(x=>x.querySelector('.lia-dgs-object-list-name')?.textContent===${JSON.stringify(name)});if(!e)return false;e.click();return true;})()`);
    assert.equal(ok, true, 'Missing object list entry ' + name);
    await sleep(160);
  };
  await openEntry('mf');
  const componentUi = await evaluate(`(() => {const c=__boards.raum.containerObj,q=a=>c.querySelector('[aria-label="Vektorkomponente '+a+'"]');
    q('x').value='-2.5';q('y').value='1.25';q('z').value='3.5';q('z').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    return [q('x').disabled,q('y').disabled,q('z').disabled];})()`);
  assert.deepEqual(componentUi, [false,false,false]);
  await sleep(220);
  assert.deepEqual(await evaluate(`__coord.coordinateVector3DComponents(__linear3DEntries['macro-free-vector'].object)`), [-2.5,1.25,3.5]);
  await historyButton('undo');
  assert.deepEqual(await evaluate(`__coord.coordinateVector3DComponents(__linear3DEntries['macro-free-vector'].object)`), [-1.5,2.25,0.5]);
  await historyButton('redo');
  assert.deepEqual(await evaluate(`__coord.coordinateVector3DComponents(__linear3DEntries['macro-free-vector'].object)`), [-2.5,1.25,3.5]);

  await openEntry('mf');
  const styled = await evaluate(`(() => {const c=__boards.raum.containerObj,o=__linear3DEntries['macro-free-vector'].object;
    const n=c.querySelector('.lia-dgs-name-input');n.value='w';n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const ls=c.querySelector('.lia-dgs-line-style-select');ls.value='dashdotted';ls.dispatchEvent(new Event('change',{bubbles:true}));
    const width=c.querySelector('.lia-dgs-stroke-style-section input[type="text"]');width.value='6.5';width.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    c.querySelector('.lia-dgs-color-button[data-color-kind="line"]').click();let hex=c.querySelector('.lia-dgs-color-hex');hex.value='#3949ab';hex.dispatchEvent(new Event('change',{bubbles:true}));
    c.querySelector('.lia-dgs-color-button[data-color-kind="text"]').click();hex=c.querySelector('.lia-dgs-color-hex');hex.value='#00897b';hex.dispatchEvent(new Event('change',{bubbles:true}));
    const opacity=c.querySelector('.lia-dgs-opacity-input');opacity.value='42';opacity.dispatchEvent(new Event('change',{bubbles:true}));
    const fixed=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Fixieren'))?.querySelector('input');if(fixed&&!fixed.checked){fixed.checked=true;fixed.dispatchEvent(new Event('change',{bubbles:true}));}
    const measurement=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Komponenten und Betrag'))?.querySelector('input');if(measurement&&!measurement.checked){measurement.checked=true;measurement.dispatchEvent(new Event('change',{bubbles:true}));}
    return true;})()`);
  assert.equal(styled, true);
  await sleep(250);
  const properties = await evaluate(`(()=>{const o=__linear3DEntries['macro-free-vector'].object;return {name:o.__liaDgsVectorName,color:o.__liaDgsLineColor,text:o.__liaDgsTextColor,opacity:o.__liaDgsOpacity,style:o.__liaDgsLineStyle,width:o.__liaDgsSegmentStrokeWidth,fixed:o.__liaDgsFixed,value:o.__liaDgsShowValue,label:o.label?.plaintext||o.label?.Value?.()||''}})()`);
  assert.deepEqual({ ...properties, label: undefined }, { name:'w',color:'#3949ab',text:'#00897b',opacity:.42,style:'dashdotted',width:6.5,fixed:true,value:true,label:undefined });
  assert.match(String(properties.label), /w|pmatrix|begin/i);
  const objectListText = await evaluate(`__boards.raum.containerObj.querySelector('.lia-dgs-object-list-content').textContent`);
  for (const name of ['ms','mg','mr','mv','w','a','b','c','AC','d']) assert.match(objectListText, new RegExp(name));

  await openEntry('a');
  const hiddenLinear = await evaluate(`(() => {const c=__boards.raum.containerObj,o=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Strecke anzeigen'))?.querySelector('input');if(!o)return false;o.checked=false;o.dispatchEvent(new Event('change',{bubbles:true}));const s=[...__coordinateViews3d.raum.linearObjects].find(x=>x.__liaDgsSegmentName==='a');return s?.__liaDgsShowObject===false})()`);
  assert.equal(hiddenLinear,true,'3D segment visibility option missing');
  await historyButton('undo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.linearObjects].find(x=>x.__liaDgsSegmentName==='a').__liaDgsShowObject!==false`),true);
  await historyButton('redo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.linearObjects].find(x=>x.__liaDgsSegmentName==='a').__liaDgsShowObject===false`),true);
  await historyButton('undo');

  await openEntry('a');
  const deletedLinear = await evaluate(`(() => {const c=__boards.raum.containerObj,b=c.querySelector('.lia-dgs-delete-button');b.click();b.click();return ![...__coordinateViews3d.raum.linearObjects].some(x=>x.__liaDgsSegmentName==='a')})()`);
  assert.equal(deletedLinear,true,'3D segment delete failed');
  await historyButton('undo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.linearObjects].filter(x=>x.__liaDgsSegmentName==='a').length`),1);
  await historyButton('redo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.linearObjects].some(x=>x.__liaDgsSegmentName==='a')`),false);
  await historyButton('undo');

  await clickAt(await evaluate('pointScreen("D")'), 'right');
  const dependentDelete = await evaluate(`(() => {const c=__boards.raum.containerObj,b=c.querySelector('.lia-dgs-delete-button');b.click();b.click();return {point:!!__points.raum.D,segment:[...__coordinateViews3d.raum.linearObjects].some(x=>x.__liaDgsSegmentName==='d')}})()`);
  assert.deepEqual(dependentDelete,{point:false,segment:false});
  await historyButton('undo');
  assert.deepEqual(await evaluate(`({point:!!__points.raum.D?.__liaPoint3D,points:[...__coordinateViews3d.raum.points].filter(x=>x.__liaDgsPointName==='D').length,segments:[...__coordinateViews3d.raum.linearObjects].filter(x=>x.__liaDgsSegmentName==='d').length})`),{point:true,points:1,segments:1});

  const views = await evaluate(`(() => {const e=__coordinateViews3d.raum;
    for(const camera of [{azimuth:0,elevation:Math.PI/2,bank:0},{azimuth:Math.PI/2,elevation:0,bank:0},{azimuth:0,elevation:0,bank:0},e.config.camera])__coord.setCoordinateCamera(e,camera);
    __coord.setCoordinateProjection(e,'central');
    const visibility=[...e.linearObjects].map(o=>({name:o.__liaDgsSegmentName||o.__liaDgsLineName||o.__liaDgsRayName||o.__liaDgsVectorName||o.name,
      connected:o.rendNode?.isConnected!==false,user:o.__liaLinear3DUserVisible!==false,show:o.__liaDgsShowObject!==false}));
    return {mode:e.viewMode,projection:e.projection,count:e.linearObjects.size,
      available:visibility.every(item=>item.connected&&item.user&&item.show),visibility,errors:profileErrors.slice()};})()`);
  assert.equal(views.mode,'3d',JSON.stringify(views));
  assert.equal(views.projection,'central',JSON.stringify(views));
  assert.equal(views.count,10,JSON.stringify(views));
  assert.equal(views.available,true,JSON.stringify(views));
  assert.deepEqual(views.errors,[]);

  const exportResult = await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-side-menu-close')?.click();const p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();const dialog=c.querySelector('.lia-dgs-export-dialog'),toolStep=dialog.querySelector('.lia-dgs-export-tools-step'),sectionNodes=[...dialog.querySelectorAll('.lia-dgs-export-dimension-section')],sections=sectionNodes.map(x=>x.querySelector('.lia-dgs-export-dimension-title').textContent.trim()),modes=[...dialog.querySelectorAll('.lia-dgs-export-mode-option')].map(x=>x.textContent.trim()),nestedScrollers=[...dialog.querySelectorAll('.lia-dgs-export-dimension-section,.lia-dgs-export-tool-groups')].filter(el=>{const style=getComputedStyle(el);return /auto|scroll/.test(style.overflowX+' '+style.overflowY)}).map(el=>el.className),groupTitles=[...dialog.querySelectorAll('.lia-dgs-export-tool-group-title')].map(x=>x.textContent.trim()),sectionHeights=sectionNodes.map(x=>Math.round(x.getBoundingClientRect().height)),contained=sectionNodes.every(section=>{const sr=section.getBoundingClientRect(),groups=section.querySelector('.lia-dgs-export-tool-groups').getBoundingClientRect();return groups.bottom<=sr.bottom+1&&groups.right<=sr.right+1}),spatialTools=sectionNodes[2].querySelectorAll('.lia-dgs-export-tool').length,visibleSpatialTools=[...sectionNodes[2].querySelectorAll('.lia-dgs-export-tool')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0}).length,layout={toolStepOverflow:getComputedStyle(toolStep).overflowY,hasOverflow:toolStep.scrollHeight>toolStep.clientHeight+1,sectionRows:new Set(sectionNodes.map(x=>Math.round(x.getBoundingClientRect().top/2))).size,optionsAligned:Math.abs(dialog.querySelector('.lia-dgs-export-mode').getBoundingClientRect().top-dialog.querySelector('.lia-dgs-export-restrictions').getBoundingClientRect().top)<2,nestedScrollers,groupTitles,sectionHeights,contained,spatialTools,visibleSpatialTools,metrics:{toolStep:[toolStep.clientWidth,toolStep.clientHeight,toolStep.scrollWidth,toolStep.scrollHeight],sections:sectionNodes.map(section=>{const r=section.getBoundingClientRect(),groups=[...section.querySelectorAll('.lia-dgs-export-tool-group')].map(group=>{const g=group.getBoundingClientRect();return [Math.round(g.width),Math.round(g.height),group.querySelectorAll('.lia-dgs-export-tool').length]});return [Math.round(r.width),Math.round(r.height),groups]}),button:(()=>{const button=dialog.querySelector('.lia-dgs-export-tool'),r=button.getBoundingClientRect(),s=getComputedStyle(button);return [Math.round(r.width),Math.round(r.height),s.width,s.height,s.padding]})()}};layout.unreachableTools=[];for(const tool of dialog.querySelectorAll('.lia-dgs-export-tool')){tool.scrollIntoView({block:'nearest',inline:'nearest'});const r=tool.getBoundingClientRect(),hit=dialog.getRootNode().elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!tool.contains(hit))layout.unreachableTools.push(tool.dataset.toolId)}toolStep.scrollTop=0;c.querySelector('.lia-dgs-export-mode input[value="3d"]').click();dialog.querySelector('button[data-primary="1"]').click();return {value:dialog.querySelector('.lia-dgs-export-textarea').value,sections,modes,layout};})()`);
  const exported = exportResult.value;
  assert.deepEqual(exportResult.sections, ['Allgemein', '2D', '3D']);
  assert.equal(exportResult.layout.toolStepOverflow, 'auto');
  // This fixture deliberately embeds a 760px board in a desktop viewport. The
  // three compact sections must remain in one row and every control reachable.
  assert.deepEqual(exportResult.layout.unreachableTools, [], JSON.stringify(exportResult.layout));
  assert.equal(exportResult.layout.sectionRows, 1, JSON.stringify(exportResult.layout));
  assert.equal(exportResult.layout.optionsAligned, true, JSON.stringify(exportResult.layout));
  assert.deepEqual(exportResult.layout.nestedScrollers, []);
  assert.equal(exportResult.layout.groupTitles.length, 10);
  assert.ok(exportResult.layout.sectionHeights.every(height => height > 60), JSON.stringify(exportResult.layout));
  assert.equal(exportResult.layout.contained, true, JSON.stringify(exportResult.layout));
  assert.equal(exportResult.layout.spatialTools, 29, JSON.stringify(exportResult.layout));
  assert.equal(exportResult.layout.visibleSpatialTools, exportResult.layout.spatialTools, JSON.stringify(exportResult.layout));
  assert.deepEqual(exportResult.modes, ['2D/3D umschaltbar', 'Auf 2D festlegen', 'Auf 3D festlegen']);
  assert.match(exported, /viewmode=3d/);
  for (const macro of ['Strecke3D','Gerade3D','Strahl3D','Vektor3D']) assert.match(exported, new RegExp('@'+macro+'\\('));
  for (const macro of ['Geradenwinkel3D','WinkelGeradeEbene3D','Ebenenwinkel3D']) assert.match(exported, new RegExp('@'+macro+'\\('));
  assert.match(exported, /@Vektor3D\(`[^`]*;w;[^`]*;\[-2\.5;1\.25;3\.5\];#3949ab;[^`]*textcolor=#00897b[^`]*opacity=0\.42[^`]*width=6\.5[^`]*objectid=macro-free-vector-id[^`]*wert=1[^`]*linestyle=dashdotted/);

  const importedSetup = await evaluate(`(() => {const block=${JSON.stringify(exported)},lines=block.split(/\\r?\\n/),value=line=>line.slice(line.indexOf('\x60')+1,line.lastIndexOf('\x60'));
    const coordinate=value(lines.find(line=>/^@(?:Koordinatensystem|CoordinateSystem)\\(/.test(line))),id=(coordinate.match(/(?:^|;)id=([^;]+)/i)||[])[1];
    const dgs=value(lines.find(line=>/^@DGS\\(/.test(line)));    const points=lines.filter(line=>/^@(?:Punkt3D|Point3D)\\(/.test(line)).map(value),linears=lines.filter(line=>/^@(?:Strecke3D|Segment3D|Gerade3D|Line3D|Strahl3D|Ray3D|Vektor3D|Vector3D)\\(/.test(line)).map(line=>({spec:value(line),kind:/Strecke3D|Segment3D/.test(line)?'segment':(/Gerade3D|Line3D/.test(line)?'line':(/Strahl3D|Ray3D/.test(line)?'ray':'vector'))}));
    const section=document.createElement('section');section.className='roundtrip-linear3d';section.style.width='760px';const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='roundtrip-linear3d';host.dataset.spec=coordinate;section.append(host);
    points.forEach((spec,i)=>{const m=document.createElement('span');m.id='point3d-spec-linear-roundtrip-'+i;m.dataset.spec=spec;m.style.display='none';section.append(m);});
    linears.forEach((item,i)=>{const m=document.createElement('span');m.id='linear3d-spec-linear-roundtrip-'+i;m.dataset.spec=item.spec;m.dataset.kind=item.kind;m.dataset.language='de';m.style.display='none';section.append(m);});
    const d=document.createElement('div');d.id='dgs-ui-linear-roundtrip';d.dataset.spec=dgs;d.dataset.language='de';section.append(d);document.querySelector('#fixture').append(section);window.linearRoundtrip={id,section,host,coordinate,points,linears,dgs};return {id,points:points.length,linears:linears.length};})()`);
  assert.ok(importedSetup.linears >= 10, JSON.stringify(importedSetup));
  await evaluate(`(async()=>{for(let i=0;i<200;i++){const x=linearRoundtrip;if(__boards?.[x.id]&&__coordinateViews3d?.[x.id]?.linearObjects.size===x.linears.length&&__boards[x.id].containerObj.querySelector('.lia-dgs-object-list-export'))return true;await new Promise(r=>setTimeout(r,30));}throw Error('linear roundtrip timeout');})()`);
  const imported = await evaluate(`(()=>{const x=linearRoundtrip,e=__coordinateViews3d[x.id],free=[...e.linearObjects].find(o=>o.__liaDgsVectorName==='w');return {count:e.linearObjects.size,components:__coord.coordinateVector3DComponents(free),style:[free.__liaDgsLineColor,free.__liaDgsTextColor,free.__liaDgsOpacity,free.__liaDgsLineStyle,free.__liaDgsSegmentStrokeWidth,free.__liaDgsFixed],errors:profileErrors.slice()}})()`);
  assert.equal(imported.count, importedSetup.linears);
  assert.deepEqual(imported.components, [-2.5,1.25,3.5]);
  assert.deepEqual(imported.style, ['#3949ab','#00897b',.42,'dashdotted',6.5,true]);
  assert.deepEqual(imported.errors, []);
  const importedMode = await evaluate(`(()=>{const b=__boards[linearRoundtrip.id],controls=b.containerObj.querySelector('.lia-coordinate-3d-controls');return {policy:b.__liaDgsSceneModePolicy,mode:b.__liaSceneMode,hidden:!!controls?.hidden,request:__coord.requestCoordinateSceneMode(b,'2d')}})()`);
  assert.equal(importedMode.policy, '3d');
  assert.equal(importedMode.mode, '3d');
  assert.equal(importedMode.hidden, true);
  assert.equal(importedMode.request.ok, false);
  const reexported = await evaluate(`(()=>{const c=__boards[linearRoundtrip.id].containerObj;c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value})()`);
  const semantic = block => block.split(/\r?\n/).filter(line=>/^@(?:Strecke3D|Segment3D|Gerade3D|Line3D|Strahl3D|Ray3D|Vektor3D|Vector3D)\(/.test(line)).map(line=>{
    const normalized=line.replace(/^@(Strecke3D|Segment3D)/,'@segment').replace(/^@(Gerade3D|Line3D)/,'@line').replace(/^@(Strahl3D|Ray3D)/,'@ray').replace(/^@(Vektor3D|Vector3D)/,'@vector');
    const tick=normalized.indexOf('\x60'),separator=normalized.indexOf(';',tick);return normalized.slice(0,tick+1)+normalized.slice(separator+1);
  }).sort();
  assert.deepEqual(semantic(reexported), semantic(exported));
  assert.match(reexported, /viewmode=3d/);
  const fixed2dExport = await evaluate(`(()=>{const c=__boards.raum.containerObj,dialog=c.querySelector('.lia-dgs-export-dialog');[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='Zurück')?.click();dialog.querySelector('.lia-dgs-export-mode input[value="2d"]').click();dialog.querySelector('button[data-primary="1"]').click();return dialog.querySelector('.lia-dgs-export-textarea').value})()`);
  assert.match(fixed2dExport, /viewmode=2d/);
  assert.match(fixed2dExport, /mode=3d;view=2d/);
  const fixed2dSetup = await evaluate(`(()=>{const lines=${JSON.stringify(fixed2dExport)}.split(/\\r?\\n/),value=line=>line.slice(line.indexOf('\x60')+1,line.lastIndexOf('\x60')),coordinate=value(lines.find(line=>/^@(?:Koordinatensystem|CoordinateSystem)\\(/.test(line))),dgs=value(lines.find(line=>/^@DGS\\(/.test(line))),id=(coordinate.match(/(?:^|;)id=([^;]+)/i)||[])[1],section=document.createElement('section'),host=document.createElement('lia-coordinate-board'),marker=document.createElement('div');section.className='fixed2d-export-roundtrip';host.dataset.liaCoordinateKey='fixed2d-export-roundtrip';host.dataset.spec=coordinate;marker.id='dgs-ui-fixed2d-export-roundtrip';marker.dataset.spec=dgs;marker.dataset.language='de';section.append(host,marker);document.querySelector('#fixture').append(section);window.fixed2dRoundtrip={id,section};return id})()`);
  await evaluate(`(async()=>{for(let i=0;i<160;i++){const b=__boards?.[fixed2dRoundtrip.id];if(b?.containerObj.querySelector('.lia-dgs-object-list-button'))return true;await new Promise(r=>setTimeout(r,30));}throw Error('fixed 2D roundtrip timeout')})()`);
  const fixed2dMode = await evaluate(`(()=>{const b=__boards[fixed2dRoundtrip.id],controls=b.containerObj.querySelector('.lia-coordinate-3d-controls');return {policy:b.__liaDgsSceneModePolicy,mode:b.__liaSceneMode,hidden:!!controls?.hidden,request:__coord.requestCoordinateSceneMode(b,'3d')}})()`);
  assert.deepEqual(fixed2dMode, { policy: '2d', mode: '2d', hidden: true, request: { ok: false, message: 'Dieses DGS ist auf die 2D-Ansicht festgelegt.' } });
  await evaluate(`fixed2dRoundtrip.section.remove()`);

  const macroLifecycle = await evaluate(`(async()=>{const marker=document.getElementById('linear3d-spec-macro-ray'),clone=marker.cloneNode(true),entry=__linear3DEntries['macro-ray'],object=entry.object;
    marker.dataset.spec=marker.dataset.spec.replace('#2e7d32','#00695c');__bootstrapLinear3D();
    const inPlace=__linear3DEntries['macro-ray'].object===object&&object.__liaDgsLineColor==='#00695c';
    for(let i=0;i<12;i++)__bootstrapLinear3D();const repeated={same:__linear3DEntries['macro-ray'].object===object,count:__coordinateViews3d.raum.linearObjects.size};
    marker.remove();await new Promise(r=>setTimeout(r,120));const removed={entry:!!__linear3DEntries['macro-ray'],count:__coordinateViews3d.raum.linearObjects.size};
    document.querySelector('.flex-child').insertBefore(clone,document.getElementById('dgs-ui-segment-1-3d'));await new Promise(r=>setTimeout(r,140));
    return {inPlace,repeated,removed,restored:!!__linear3DEntries['macro-ray']&&__coordinateViews3d.raum.linearObjects.size===10,errors:profileErrors.slice()};})()`);
  assert.deepEqual(macroLifecycle,{inPlace:true,repeated:{same:true,count:10},removed:{entry:false,count:9},restored:true,errors:[]});

  const lifecycle = await evaluate(`(async()=>{const x=linearRoundtrip,views=[__coordinateViews3d[x.id].view],objects=[[...__coordinateViews3d[x.id].linearObjects][0]];let disposedCleanly=true;
    for(let cycle=0;cycle<2;cycle++){x.host.remove();await new Promise(r=>setTimeout(r,180));
      disposedCleanly=disposedCleanly&&!__coordinateViews3d[x.id]&&!__boards[x.id]&&!Object.values(__linear3DEntries).some(e=>e.boardId===x.id);
      const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='linear-roundtrip-remount-'+cycle;host.dataset.spec=x.coordinate;x.section.prepend(host);x.host=host;__scheduleBootstrapPoint3D();__scheduleBootstrapLinear3D();
      for(let i=0;i<180;i++){if(__coordinateViews3d?.[x.id]?.linearObjects.size===x.linears.length&&__boards?.[x.id]?.containerObj.querySelector('.lia-dgs-object-list-button'))break;await new Promise(r=>setTimeout(r,30));}
      const e=__coordinateViews3d[x.id];if(!e)return {ok:false,cycle,phase:'mount'};views.push(e.view);objects.push([...e.linearObjects][0]);
      if(e.linearObjects.size!==x.linears.length||e.points.size!==x.points.length||__boards[x.id].containerObj.querySelectorAll('.lia-coordinate-3d-controls').length!==1)return {ok:false,cycle,phase:'duplicates',linears:e.linearObjects.size,points:e.points.size};
    }
    return {ok:disposedCleanly&&new Set(views).size===3&&new Set(objects).size===3,views:new Set(views).size,objects:new Set(objects).size,linears:__coordinateViews3d[x.id].linearObjects.size,points:__coordinateViews3d[x.id].points.size,controls:__boards[x.id].containerObj.querySelectorAll('.lia-coordinate-3d-controls').length,errors:profileErrors.slice()};})()`);
  assert.deepEqual(lifecycle,{ok:true,views:3,objects:3,linears:importedSetup.linears,points:importedSetup.points,controls:1,errors:[]});

  const segment3Setup = await evaluate(`(() => {
    const host=document.querySelector('.flex-child'),before=document.getElementById('dgs-ui-segment-1-3d');
    const add=(id,spec,language='de')=>{const m=document.createElement('span');m.id=id;m.dataset.spec=spec;m.dataset.language=language;m.style.display='none';host.insertBefore(m,before);return m;};
    add('intersection3d-spec-browser-point','raum;S;mg;F;#ad1457;1;objectid=browser-spatial-point');
    add('intersection3d-spec-browser-line','raum;s;E;F;#00838f;0.8;objectid=browser-spatial-line');
    add('point3d-spec-browser-bound','raum;P;4;4;4;#6a1b9a;1;on=E;u=0.35;v=-0.2;objectid=browser-bound-plane');
    add('point3d-spec-browser-bound-line','raum;Q;0;0;0;#283593;1;on=mg;t=0.25;objectid=browser-bound-line');
    __scheduleBootstrapIntersection3D();__scheduleBootstrapPoint3D();
    return true;
  })()`);
  assert.equal(segment3Setup, true);
  await evaluate(`(async()=>{for(let i=0;i<160;i++){if(__intersection3DEntries?.['browser-point']&&__intersection3DEntries?.['browser-line']&&__points?.raum?.P?.__liaPoint3DBindingSource&&__points?.raum?.Q?.__liaPoint3DBindingSource)return true;await new Promise(r=>setTimeout(r,30));}throw Error('Segment 3 macro timeout');})()`);

  const planeState = await evaluate(`(() => {
    const planes=Object.fromEntries(Object.entries(__plane3DEntries).filter(([key])=>key.startsWith('macro-plane')));
    const point=__intersection3DEntries['browser-point'].object,line=__intersection3DEntries['browser-line'].object;
    const bound=__points.raum.P,e=planes['macro-plane-points'].object,data=__coord.coordinatePlane3DData(e);
    const distance=Math.abs(data.normal[0]*bound.X()+data.normal[1]*bound.Y()+data.normal[2]*bound.Z()+data.coefficients[3]);
    return {count:Object.keys(planes).length,definitions:Object.values(planes).map(x=>x.object.__liaPlane3DDefinition).sort(),
      point:[point.X(),point.Y(),point.Z()],b:[__points.raum.B.X(),__points.raum.B.Y(),__points.raum.B.Z()],
      line:__coord.coordinateLinear3DData(line),distance,planeParameters:bound.__liaPoint3DBindingParameters,
      lineParameters:__points.raum.Q.__liaPoint3DBindingParameters,registry:__coordinateViews3d.raum.planeObjects.size,errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(planeState.definitions, ['point-normal','point-vectors','three-points']);
  assert.equal(planeState.count, 3);
  assert.equal(planeState.registry, 3);
  assert.deepEqual(planeState.point, planeState.b);
  assert.ok(planeState.line && planeState.line.direction.every(Number.isFinite), JSON.stringify(planeState));
  assert.ok(planeState.distance < 1e-8, JSON.stringify(planeState));
  assert.deepEqual(planeState.planeParameters,{kind:'plane',u:0.35,v:-0.2});
  assert.deepEqual(planeState.lineParameters,{kind:'line',t:0.25});
  assert.deepEqual(planeState.errors, []);

  const planeMacroLifecycle = await evaluate(`(async()=>{const marker=document.getElementById('plane3d-spec-macro-plane-normal'),clone=marker.cloneNode(true),old=__plane3DEntries['macro-plane-normal'].object;
    marker.dataset.spec=marker.dataset.spec.replace('#ef6c00','#f4511e');__bootstrapPlane3D();
    const inPlace=__plane3DEntries['macro-plane-normal'].object===old&&old.__liaDgsLineColor==='#f4511e';
    for(let i=0;i<12;i++)__bootstrapPlane3D();await new Promise(r=>setTimeout(r,80));
    const repeated={same:__plane3DEntries['macro-plane-normal'].object===old,planes:__coordinateViews3d.raum.planeObjects.size};
    marker.remove();
    for(let i=0;i<80&&__plane3DEntries['macro-plane-normal'];i++)await new Promise(r=>setTimeout(r,20));
    const removed={plane:!!__plane3DEntries['macro-plane-normal'],intersections:['browser-point','browser-line'].filter(key=>__intersection3DEntries[key]).length,planes:__coordinateViews3d.raum.planeObjects.size};
    document.querySelector('.flex-child').insertBefore(clone,document.getElementById('dgs-ui-segment-1-3d'));
    for(let i=0;i<120;i++){if(__plane3DEntries['macro-plane-normal']&&__intersection3DEntries['browser-point']&&__intersection3DEntries['browser-line'])break;await new Promise(r=>setTimeout(r,20));}
    const current=__plane3DEntries['macro-plane-normal']?.object;
    return {inPlace,repeated,removed,restored:{newObject:!!current&&current!==old,planes:__coordinateViews3d.raum.planeObjects.size,intersections:['browser-point','browser-line'].filter(key=>__intersection3DEntries[key]).length},errors:profileErrors.slice()};})()`);
  assert.deepEqual(planeMacroLifecycle,{inPlace:true,repeated:{same:true,planes:3},removed:{plane:false,intersections:0,planes:2},restored:{newObject:true,planes:3,intersections:2},errors:[]});

  const dynamicPlane = await evaluate(`(() => {
    const b=__points.raum.B,before=__coord.coordinateLinear3DData(__intersection3DEntries['browser-line'].object).direction.slice();
    __coord.setCoordinatePoint3D(b,[b.X()+0.7,b.Y()-0.4,b.Z()+0.5]);__boards.raum.fullUpdate();
    const s=__intersection3DEntries['browser-point'].object,after=__coord.coordinateLinear3DData(__intersection3DEntries['browser-line'].object).direction.slice();
    const p=__points.raum.P,q=__points.raum.Q,plane=__coord.coordinatePlane3DData(__plane3DEntries['macro-plane-points'].object),line=__coord.coordinateLinear3DData(__linear3DEntries['macro-line'].object);
    const pp=p.__liaPoint3DBindingParameters,qp=q.__liaPoint3DBindingParameters;
    const expectedP=plane.point.map((value,index)=>value+pp.u*plane.direction1[index]+pp.v*plane.direction2[index]);
    const expectedQ=line.anchor.map((value,index)=>value+qp.t*line.direction[index]);
    const error=(point,expected)=>Math.max(...expected.map((value,index)=>Math.abs(value-point[index])));
    return {point:[s.X(),s.Y(),s.Z()],b:[b.X(),b.Y(),b.Z()],before,after,planeParameters:pp,lineParameters:qp,
      planeError:error([p.X(),p.Y(),p.Z()],expectedP),lineError:error([q.X(),q.Y(),q.Z()],expectedQ)};
  })()`);
  assert.deepEqual(dynamicPlane.point, dynamicPlane.b);
  assert.notDeepEqual(dynamicPlane.after, dynamicPlane.before);
  assert.deepEqual(dynamicPlane.planeParameters,{kind:'plane',u:0.35,v:-0.2});
  assert.deepEqual(dynamicPlane.lineParameters,{kind:'line',t:0.25});
  assert.ok(dynamicPlane.planeError<1e-8&&dynamicPlane.lineError<1e-8,JSON.stringify(dynamicPlane));

  const degeneracy = await evaluate(`(() => {
    const c=__points.raum.C,original=[c.X(),c.Y(),c.Z()],a=__points.raum.A,e=__plane3DEntries['macro-plane-points'].object;
    __coord.setCoordinatePoint3D(c,[a.X(),a.Y(),a.Z()]);__boards.raum.fullUpdate();
    const invalid=__coord.coordinatePlane3DData(e)===null;
    const visible=typeof e.visProp?.visible==='function'?e.visProp.visible():e.visProp?.visible;
    __coord.setCoordinatePoint3D(c,original);__boards.raum.fullUpdate();
    return {invalid,visible,restored:!!__coord.coordinatePlane3DData(e)};
  })()`);
  assert.deepEqual(degeneracy,{invalid:true,visible:false,restored:true});

  const planeTool = await evaluate(`(() => {
    const buttons=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')];
    const labels=['Ebene durch drei Punkte','Punkt-Normalen-Ebene','Parameter-Ebene'];
    const found=labels.map(label=>buttons.find(button=>button.textContent.trim()===label));
    found[0]?.click();
    return {found:found.map(Boolean),active:found[0]?.getAttribute('aria-pressed')};
  })()`);
  assert.deepEqual(planeTool.found,[true,true,true]);
  assert.equal(planeTool.active,'true');
  await clickAt(await evaluate('pointScreen("A")'));
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escapedPlane = await evaluate(`(() => {const state=Object.values(__liaRegressionStates).find(x=>x.boardId==='raum');return {planes:[...__coordinateViews3d.raum.planeObjects].filter(o=>!o.__liaDgsMacroManaged).length,points:(state.selectedPlanePoints||[]).length,vectors:(state.selectedPlaneVectors||[]).length,active:state.activeTool};})()`);
  assert.deepEqual(escapedPlane,{planes:0,points:0,vectors:0,active:''});
  await evaluate(`(()=>{const b=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()==='Ebene durch drei Punkte');b.click();return b.getAttribute('aria-pressed')})()`);
  await clickAt(await evaluate('pointScreen("A")'));
  await clickAt(await evaluate('pointScreen("B")'));
  await clickAt(await evaluate('pointScreen("C")'));
  const dgsPlane = await evaluate(`(() => {const planes=[...__coordinateViews3d.raum.planeObjects].filter(o=>!o.__liaDgsMacroManaged),object=planes[0];
    const state=Object.values(__liaRegressionStates).find(x=>x.boardId==='raum'),data=__coord.coordinatePlane3DData(object),element=object?.element2D,node=element?.rendNode;
    const rect=node?.getBoundingClientRect?.(),bounds=__boards.raum.containerObj.getBoundingClientRect();
    const visibleWidth=rect?Math.max(0,Math.min(rect.right,bounds.right)-Math.max(rect.left,bounds.left)):0;
    const visibleHeight=rect?Math.max(0,Math.min(rect.bottom,bounds.bottom)-Math.max(rect.top,bounds.top)):0;
    return {count:planes.length,definition:object?.__liaPlane3DDefinition,rendered:!!element&&element.visProp.visible!==false,
      valid:!!data&&data.point.every(Number.isFinite)&&data.normal.every(Number.isFinite),active:state?.activeTool,
      visual:{vertices:object?.__liaPlane3DClippedPolygon?.length||0,points:element?.dataX?.length||0,path:node?.getAttribute?.('d')||'',
        fill:node?.getAttribute?.('fill')||'',fillOpacity:Number(node?.getAttribute?.('fill-opacity')),visibleArea:visibleWidth*visibleHeight},
      record:(__dgsConstructionStates.raum.records||[]).find(r=>r.type==='plane')};})()`);
  assert.equal(dgsPlane.count,1,JSON.stringify(dgsPlane));
  assert.equal(dgsPlane.definition,'three-points');
  assert.equal(dgsPlane.rendered,true,JSON.stringify(dgsPlane));
  assert.equal(dgsPlane.valid,true,JSON.stringify(dgsPlane));
  assert.ok(dgsPlane.visual.vertices>=3&&dgsPlane.visual.points>=4&&/L/.test(dgsPlane.visual.path)&&
    dgsPlane.visual.fill&&dgsPlane.visual.fill!=='none'&&dgsPlane.visual.fillOpacity>0&&dgsPlane.visual.visibleArea>1000,JSON.stringify(dgsPlane));
  assert.equal(dgsPlane.active,'');
  assert.equal(dgsPlane.record.definition,'three-points');


  await historyButton('undo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.planeObjects].filter(o=>!o.__liaDgsMacroManaged).length`),0);
  await historyButton('redo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.planeObjects].filter(o=>!o.__liaDgsMacroManaged).length`),1);

  const linearScreen = async key => evaluate(`(() => {const o=__linear3DEntries[${JSON.stringify(key)}].object.element2D,r=__boards.raum.containerObj.getBoundingClientRect();
    const a=o.point1?.coords?.scrCoords,b=o.point2?.coords?.scrCoords;return [r.left+(a[1]+b[1])/2,r.top+(a[2]+b[2])/2];})()`);
  const activateShapeTool = async label => {
    const active = await evaluate(`(() => {const b=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()===${JSON.stringify(label)});b?.click();return b?.getAttribute('aria-pressed')})()`);
    assert.equal(active,'true','Could not activate '+label);
  };
  await activateShapeTool('Punkt-Normalen-Ebene');
  await clickAt(await evaluate('pointScreen("B")'));
  await clickAt(await linearScreen('macro-vector'));
  await activateShapeTool('Parameter-Ebene');
  await clickAt(await evaluate('pointScreen("C")'));
  await clickAt(await linearScreen('macro-vector'));
  await clickAt(await linearScreen('macro-free-vector'));
  const allDgsPlanes = await evaluate(`[...__coordinateViews3d.raum.planeObjects].filter(o=>!o.__liaDgsMacroManaged).map(o=>o.__liaPlane3DDefinition).sort()`);
  assert.deepEqual(allDgsPlanes,['point-normal','point-vectors','three-points']);
  const allDgsPlaneVisuals = await evaluate(`(()=>[...__coordinateViews3d.raum.planeObjects].filter(o=>!o.__liaDgsMacroManaged).map(object=>({
    definition:object.__liaPlane3DDefinition,vertices:object.__liaPlane3DClippedPolygon?.length||0,points:object.element2D?.dataX?.length||0,
    path:object.element2D?.rendNode?.getAttribute?.('d')||'',fill:object.element2D?.rendNode?.getAttribute?.('fill')||'',
    fillOpacity:Number(object.element2D?.rendNode?.getAttribute?.('fill-opacity'))
  })))()`);
  assert.equal(allDgsPlaneVisuals.length,3,JSON.stringify(allDgsPlaneVisuals));
  assert.ok(allDgsPlaneVisuals.every(item=>item.vertices>=3&&item.points>=4&&/L/.test(item.path)&&item.fill&&item.fill!=='none'&&item.fillOpacity>0),JSON.stringify(allDgsPlaneVisuals));

  const shiftedPlaneVisual = await evaluate(`(()=>{const board=__boards.raum,entry=__coordinateViews3d.raum;
    const object=[...entry.planeObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaPlane3DDefinition==='three-points'),plane=__coord.coordinatePlane3DData(object);
    const originalRanges=entry.spatialRanges.map(range=>range.slice()),originalBox=entry.view.bbox3D.map(range=>range.slice());
    const center=plane.point.map((value,index)=>value+plane.direction1[index]*80+plane.direction2[index]*60);
    const spans=originalRanges.map(range=>range[1]-range[0]);
    const shifted=center.map((value,index)=>[value-spans[index]/2,value+spans[index]/2]);
    entry.spatialRanges=shifted.map(range=>range.slice());entry.view.bbox3D=shifted.map(range=>range.slice());board.fullUpdate();
    const polygon=(object.__liaPlane3DClippedPolygon||[]).map(point=>point.slice()),path=object.element2D?.rendNode?.getAttribute?.('d')||'';
    const inside=polygon.every(point=>point.every((value,index)=>value>=shifted[index][0]-1e-7&&value<=shifted[index][1]+1e-7));
    entry.spatialRanges=originalRanges;entry.view.bbox3D=originalBox;board.fullUpdate();
    return {vertices:polygon.length,points:object.element2D?.dataX?.length||0,path,inside};})()`);
  assert.ok(shiftedPlaneVisual.vertices>=3&&shiftedPlaneVisual.points>=4&&/L/.test(shiftedPlaneVisual.path)&&shiftedPlaneVisual.inside,JSON.stringify(shiftedPlaneVisual));


  const intersectionTool = await evaluate(`(() => {const b=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()==='Schnittpunkte bestimmen');b?.click();return {found:!!b,active:b?.getAttribute('aria-pressed'),disabled:b?.disabled}})()`);
  assert.deepEqual(intersectionTool,{found:true,active:'true',disabled:false});
  await clickAt(await evaluate('pointScreen("B")'));
  await clickAt(await evaluate('pointScreen("B")'));
  const dgsSpatialCount = await evaluate(`[...__coordinateViews3d.raum.linearObjects,...__coordinateViews3d.raum.points].filter(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged).length`);
  assert.ok(dgsSpatialCount>=1,'DGS intersection tool did not create a spatial result');
  const dgsSpatialVisual = await evaluate(`(()=>{const board=__boards.raum.containerObj.getBoundingClientRect(),objects=[...__coordinateViews3d.raum.linearObjects,...__coordinateViews3d.raum.points].filter(object=>object.__liaDgsSpatialIntersection&&!object.__liaDgsMacroManaged);return objects.map(object=>{const node=object?.element2D?.rendNode||object?.rendNode,rect=node?.getBoundingClientRect?.(),style=node?getComputedStyle(node):null;return {kind:object.__liaDgsSpatialIntersectionKind,node:!!node,width:rect?.width||0,height:rect?.height||0,visible:!!rect&&style?.display!=='none'&&style?.visibility!=='hidden'&&rect.right>board.left&&rect.left<board.right&&rect.bottom>board.top&&rect.top<board.bottom&&Math.max(rect.width,rect.height)>3}})})()`);
  assert.ok(dgsSpatialVisual.length>=1&&dgsSpatialVisual.every(item=>item.node&&item.visible),JSON.stringify(dgsSpatialVisual));
  assert.ok(await evaluate(`(__dgsConstructionStates.raum.records||[]).some(r=>r.type==='spatial-intersection')`));
  await historyButton('undo');
  assert.equal(await evaluate(`[...__coordinateViews3d.raum.linearObjects,...__coordinateViews3d.raum.points].filter(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged).length`),0);
  await historyButton('redo');
  assert.ok(await evaluate(`[...__coordinateViews3d.raum.linearObjects,...__coordinateViews3d.raum.points].filter(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged).length`)>=1);
  const equationPlaneName = await evaluate(`(([...__coordinateViews3d.raum.planeObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaPlane3DDefinition==='three-points')).__liaDgsPlaneName)`);
  await openEntry(equationPlaneName);
  const planeEquationUi = await evaluate(`(() => {const c=__boards.raum.containerObj,o=[...__coordinateViews3d.raum.planeObjects].find(x=>x.__liaDgsPlaneName===${JSON.stringify(equationPlaneName)});
    const select=c.querySelector('select[aria-label="Gleichungsform"]');if(!select)return {found:false};
    select.value='coordinate';select.dispatchEvent(new Event('change',{bubbles:true}));
    const measurement=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Geradengleichung'))?.querySelector('input');
    if(measurement&&!measurement.checked){measurement.checked=true;measurement.dispatchEvent(new Event('change',{bubbles:true}));}
    return {found:true,form:o.__liaDgsPlaneEquationForm,shown:o.__liaDgsShowEquation,selected:select.value,type:c.querySelector('.lia-dgs-side-menu-title span')?.textContent||''};})()`);
  assert.deepEqual({...planeEquationUi,type:undefined},{found:true,form:'coordinate',shown:true,selected:'coordinate',type:undefined});
  assert.match(planeEquationUi.type,/Ebene/);
  await evaluate("__boards.raum.containerObj.querySelector('.lia-dgs-side-menu-close')?.click()");
  const segment3Export = await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-side-menu-close')?.click();const p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  assert.match(segment3Export, /@Ebene3D\(/);
  assert.match(segment3Export, /@PunktNormalenEbene3D\(/);
  assert.match(segment3Export, /@ParameterEbene3D\(/);
  assert.match(segment3Export, /@Schnitt3D\(/);
  assert.match(segment3Export, /@Punkt3D\(`[^`]*objectid=browser-bound-plane[^`]*auf=E[^`]*u=0\.35[^`]*v=-0\.2/);
  assert.match(segment3Export, /@Punkt3D\(`[^`]*objectid=browser-bound-line[^`]*auf=mg[^`]*t=0\.25/);
  assert.match(segment3Export, /@Ebene3D\(`[^`]*equation=coordinate/);

  const segment3Roundtrip = await evaluate(`(() => {const block=${JSON.stringify(segment3Export)},lines=block.split(/\\r?\\n/),value=line=>line.slice(line.indexOf('\\x60')+1,line.lastIndexOf('\\x60'));
    const coordinate=value(lines.find(line=>/^@(?:Koordinatensystem|CoordinateSystem)\\(/.test(line))),id=(coordinate.match(/(?:^|;)id=([^;]+)/i)||[])[1];
    const points=lines.filter(line=>/^@(?:Punkt3D|Point3D)\\(/.test(line)).map(value);
    const linears=lines.filter(line=>/^@(?:Strecke3D|Segment3D|Gerade3D|Line3D|Strahl3D|Ray3D|Vektor3D|Vector3D)\\(/.test(line)).map(line=>({spec:value(line),kind:/Strecke3D|Segment3D/.test(line)?'segment':(/Gerade3D|Line3D/.test(line)?'line':(/Strahl3D|Ray3D/.test(line)?'ray':'vector'))}));
    const planes=lines.filter(line=>/^@(?:Ebene3D|Plane3D|PunktNormalenEbene3D|PlanePointNormal3D|ParameterEbene3D|PlanePointVectors3D)\\(/.test(line)).map(line=>({spec:value(line),definition:/PunktNormalen|PlanePointNormal/.test(line)?'point-normal':(/ParameterEbene|PlanePointVectors/.test(line)?'point-vectors':'three-points')}));
    const intersections=lines.filter(line=>/^@(?:Schnitt3D|Intersection3D)\\(/.test(line)).map(value);
    const section=document.createElement('section');section.className='roundtrip-plane3d';section.style.width='760px';
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='roundtrip-plane3d';host.dataset.spec=coordinate;section.append(host);
    points.forEach((spec,i)=>{const m=document.createElement('span');m.id='point3d-spec-plane-roundtrip-'+i;m.dataset.spec=spec;m.style.display='none';section.append(m);});
    linears.forEach((item,i)=>{const m=document.createElement('span');m.id='linear3d-spec-plane-roundtrip-'+i;m.dataset.spec=item.spec;m.dataset.kind=item.kind;m.dataset.language='de';m.style.display='none';section.append(m);});
    planes.forEach((item,i)=>{const m=document.createElement('span');m.id='plane3d-spec-plane-roundtrip-'+i;m.dataset.spec=item.spec;m.dataset.definition=item.definition;m.dataset.language='de';m.style.display='none';section.append(m);});
    intersections.forEach((spec,i)=>{const m=document.createElement('span');m.id='intersection3d-spec-plane-roundtrip-'+i;m.dataset.spec=spec;m.dataset.language='de';m.style.display='none';section.append(m);});
    const d=document.createElement('div');d.id='dgs-ui-plane-roundtrip';d.dataset.spec=id;d.dataset.language='de';section.append(d);document.querySelector('#fixture').append(section);
    window.planeRoundtrip={id,section,host,coordinate,points,linears,planes,intersections};return {id,points:points.length,linears:linears.length,planes:planes.length,intersections:intersections.length};
  })()`);
  assert.ok(segment3Roundtrip.planes>=6,JSON.stringify(segment3Roundtrip));
  assert.ok(segment3Roundtrip.intersections>=3,JSON.stringify(segment3Roundtrip));
  await evaluate(`(async()=>{for(let i=0;i<240;i++){const x=planeRoundtrip,e=__coordinateViews3d?.[x.id],intersections=Object.values(__intersection3DEntries||{}).filter(v=>v.boardId===x.id);
    if(e?.planeObjects.size===x.planes.length&&intersections.length===x.intersections.length&&__points?.[x.id]?.P?.__liaPoint3DBindingSource&&__points?.[x.id]?.Q?.__liaPoint3DBindingSource)return true;await new Promise(r=>setTimeout(r,30));}
    throw Error('plane roundtrip timeout '+JSON.stringify({errors:profileErrors,planes:__coordinateViews3d?.[planeRoundtrip.id]?.planeObjects.size,intersections:Object.values(__intersection3DEntries||{}).filter(v=>v.boardId===planeRoundtrip.id).length}));})()`);
  const segment3Imported = await evaluate(`(() => {const x=planeRoundtrip,e=__coordinateViews3d[x.id],p=__points[x.id].P,q=__points[x.id].Q,source=p.__liaPoint3DBindingSource,data=__coord.coordinatePlane3DData(source);
    const distance=Math.abs(data.normal[0]*p.X()+data.normal[1]*p.Y()+data.normal[2]*p.Z()+data.coefficients[3]);
    const coordinateForm=[...e.planeObjects].some(o=>o.__liaDgsPlaneEquationForm==='coordinate'&&o.__liaDgsShowEquation);
    return {planes:e.planeObjects.size,intersections:Object.values(__intersection3DEntries).filter(v=>v.boardId===x.id).length,bound:!!source,distance,coordinateForm,
      planeParameters:p.__liaPoint3DBindingParameters,lineParameters:q.__liaPoint3DBindingParameters,
      pointIds:[p.__liaDgsPersistentId,q.__liaDgsPersistentId],errors:profileErrors.slice()};})()`);
  assert.deepEqual({planes:segment3Imported.planes,intersections:segment3Imported.intersections,bound:segment3Imported.bound,coordinateForm:segment3Imported.coordinateForm},
    {planes:segment3Roundtrip.planes,intersections:segment3Roundtrip.intersections,bound:true,coordinateForm:true});
  assert.ok(segment3Imported.distance<1e-8,JSON.stringify(segment3Imported));
  assert.deepEqual(segment3Imported.planeParameters,{kind:'plane',u:0.35,v:-0.2});
  assert.deepEqual(segment3Imported.lineParameters,{kind:'line',t:0.25});
  assert.deepEqual(segment3Imported.pointIds,['browser-bound-plane','browser-bound-line']);
  assert.deepEqual(segment3Imported.errors,[]);

  const dependentSource = await evaluate(`(() => {const e=__coordinateViews3d.raum,dependent=[...e.linearObjects,...e.points].find(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged);
    const source=dependent?.__liaDgsSpatialIntersectionSource,name=source?.__liaDgsPlaneName||source?.__liaDgsLineName||source?.__liaDgsRayName||source?.__liaDgsSegmentName||source?.__liaDgsVectorName||'';
    return {name,before:[...e.linearObjects,...e.points].filter(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged).length,planes:e.planeObjects.size,linears:e.linearObjects.size,points:e.points.size};})()`);
  assert.ok(dependentSource.name,'Spatial intersection source has no object-list name');
  await openEntry(dependentSource.name);
  const deletedSource = await evaluate(`(() => {const c=__boards.raum.containerObj,b=c.querySelector('.lia-dgs-delete-button');b.click();b.click();const e=__coordinateViews3d.raum;
    return {dependent:[...e.linearObjects,...e.points].filter(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged).length,planes:e.planeObjects.size,linears:e.linearObjects.size,points:e.points.size};})()`);
  assert.ok(deletedSource.dependent<dependentSource.before,JSON.stringify({dependentSource,deletedSource}));
  await historyButton('undo');
  const restoredSource = await evaluate(`(() => {const e=__coordinateViews3d.raum;return {dependent:[...e.linearObjects,...e.points].filter(o=>o.__liaDgsSpatialIntersection&&!o.__liaDgsMacroManaged).length,planes:e.planeObjects.size,linears:e.linearObjects.size,points:e.points.size};})()`);
  assert.deepEqual(restoredSource,{dependent:dependentSource.before,planes:dependentSource.planes,linears:dependentSource.linears,points:dependentSource.points});

  const equationConstructions = await evaluate(`(() => {
    const c=__boards.raum.containerObj,entry=__coordinateViews3d.raum;
    c.querySelector('.lia-dgs-select-button').click();
    const choose=(parent,label)=>{parent.click();const button=[...c.querySelectorAll('.lia-dgs-geometry-tool')].find(item=>item.textContent.trim()===label);button?.click();return !!button;};
    const setValues=(row,values)=>[...row.querySelectorAll('input')].forEach((input,index)=>{input.value=String(values[index]);input.dispatchEvent(new Event('input',{bubbles:true}));});
    const pointFound=choose(c.querySelector('.lia-dgs-point-button'),'Punkt aus Koordinaten');
    let dialog=c.querySelector('.lia-dgs-equation-dialog'),rows=[...dialog.querySelectorAll('.lia-dgs-equation-row')];
    setValues(rows[0],[2.5,-1.25,3.75]);dialog.querySelector('button[data-primary]').click();
    const point=[...entry.points].find(object=>object.__liaDgsPointName&&!object.__liaDgsMacroManaged&&Math.abs(object.X()-2.5)<1e-8&&Math.abs(object.Y()+1.25)<1e-8&&Math.abs(object.Z()-3.75)<1e-8);
    const lineFound=choose(c.querySelector('.lia-dgs-segment-button'),'Gerade aus Geradengleichung');
    dialog=c.querySelector('.lia-dgs-equation-dialog');rows=[...dialog.querySelectorAll('.lia-dgs-equation-row')];
    setValues(rows[0],[1,2,3]);setValues(rows[1],[2,-1,4]);dialog.querySelector('button[data-primary]').click();
    const line=[...entry.linearObjects].find(object=>object.__liaDgsLine&&!object.__liaDgsMacroManaged&&object.__liaDgsLinearPoints?.some(source=>Math.abs(source.X()-1)<1e-8&&Math.abs(source.Y()-2)<1e-8&&Math.abs(source.Z()-3)<1e-8));
    const lineData=line&&__coord.coordinateLinear3DData(line);
    const planeFound=choose(c.querySelector('.lia-dgs-plane3d-button'),'Ebene aus Ebenengleichung');
    dialog=c.querySelector('.lia-dgs-equation-dialog');
    const forms=[...dialog.querySelectorAll('.lia-dgs-equation-form-button')].map(button=>button.textContent.trim());
    [...dialog.querySelectorAll('.lia-dgs-equation-form-button')].find(button=>button.textContent.trim()==='Koordinatenform').click();
    rows=[...dialog.querySelectorAll('.lia-dgs-equation-row')];setValues(rows[0],[1,2,-1]);setValues(rows[1],[4]);
    dialog.querySelector('button[data-primary]').click();
    const plane=[...entry.planeObjects].reverse().find(object=>!object.__liaDgsMacroManaged&&object.__liaDgsPlaneEquationForm==='coordinate');
    const planeData=plane&&__coord.coordinatePlane3DData(plane),support=planeData?.point;
    return {pointFound,lineFound,planeFound,point:!!point,line:!!line,
      direction:lineData?.direction,forms,plane:!!plane,planeForm:plane?.__liaDgsPlaneEquationForm,
      planeError:support?Math.abs(support[0]+2*support[1]-support[2]-4):null,
      dialogClosed:dialog.dataset.open==='0',errors:profileErrors.slice()};
  })()`);
  assert.deepEqual({pointFound:equationConstructions.pointFound,lineFound:equationConstructions.lineFound,
    planeFound:equationConstructions.planeFound,point:equationConstructions.point,line:equationConstructions.line,
    plane:equationConstructions.plane,planeForm:equationConstructions.planeForm,dialogClosed:equationConstructions.dialogClosed},
    {pointFound:true,lineFound:true,planeFound:true,point:true,line:true,plane:true,planeForm:'coordinate',dialogClosed:true});
  assert.deepEqual(equationConstructions.forms,['Parameterform','Normalenform','Koordinatenform']);
  assert.ok(equationConstructions.direction.every((value,index)=>Math.abs(value-[2,-1,4][index])<1e-8),JSON.stringify(equationConstructions));
  assert.ok(equationConstructions.planeError<1e-8,JSON.stringify(equationConstructions));
  assert.deepEqual(equationConstructions.errors,[]);

  assert.deepEqual(await evaluate('profileErrors.slice()'), []);
  console.log('PASS Segments 2/3: linear and plane 3D macros, DGS tools, spatial intersections, bindings, dynamics, export/import, and lifecycle');
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
