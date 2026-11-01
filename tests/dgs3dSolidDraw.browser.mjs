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
const fixture = join(root, 'tests/fixtures/dynamic-3d-solid-draw.html');
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

  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-solid-draw-chrome-'));
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
    const tool = "[..." + container + ".querySelectorAll('.lia-dgs-geometry-tool')].find(b=>b.textContent.trim()===" + JSON.stringify(label) + ")";
    await evaluate(container + ".querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click())");
    if (await evaluate("(" + tool + ").getAttribute('aria-pressed')") === 'true') return;
    if (await evaluate(container + ".querySelector('.lia-dgs-menu-button').getAttribute('aria-expanded')!=='true'")) {
      await clickAt(await buttonCenter(container + ".querySelector('.lia-dgs-menu-button')"));
      await sleep(200);
    }
    const prismLabels = new Set(['Prisma', 'Spat', 'Quader']);
    const parentSelector = prismLabels.has(label) ? '.lia-dgs-plane3d-button' : '.lia-dgs-solid3d-button';
    await clickAt(await buttonCenter(container + '.querySelector(' + JSON.stringify(parentSelector) + ')'));
    await clickAt(await buttonCenter(tool));
    assert.equal(await evaluate("(" + tool + ").getAttribute('aria-pressed')"), 'true', 'Missing active tool ' + label);
  };
  const state=()=>evaluate('drawState()');
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(100);};
  const down=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p[0],y:p[1]});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:p[0],y:p[1],clickCount:1});};
  const move=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:p[0],y:p[1]});await sleep(70);};
  const up=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:p[0],y:p[1],clickCount:1});await sleep(150);};
  const history=async direction=>{
    const control="Object.values(__liaRegressionStates).find(s=>s.boardId==='raum')."+direction+"Button";
    await clickAt(await buttonCenter(control));await sleep(140);
  };
  const closePanels=()=>evaluate("__boards.raum.containerObj.querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click())");
  const anchor=()=>evaluate("(()=>{const r=__boards.raum.containerObj.getBoundingClientRect();return[r.left+r.width*.48,r.top+r.height*.62]})()");
  const near=(a,b,tolerance=1e-6)=>Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
  const clean=(actual,expected,message)=>assert.deepEqual(actual.counts,expected.counts,message+': '+JSON.stringify(actual.counts));
  const assertRegular=(solid,kind)=>{
    assert.ok(solid.volume>0&&solid.edgeLengths.length>=6,'Must form a solid with positive volume: '+JSON.stringify(solid));
    const lengths=solid.edgeLengths;
    if(kind!=='pyramid')assert.ok(lengths.every(v=>near(v,lengths[0])),'Regular body must have equal edges: '+JSON.stringify(solid));
    if(kind==='cuboid')assert.ok(solid.cornerDots.every(v=>Math.abs(v)<1e-7),'Cube edges must be perpendicular');
    if(kind==='parallelepiped')assert.ok(solid.cornerDots.some(v=>Math.abs(v)>.1),'Spat must remain oblique');
  };
  const baseline=await state();
  assert.equal(baseline.solids.length,0);
  const shapes=[['Tetraeder','tetrahedron','Tetraeder3D'],['Pyramide','pyramid','Pyramide3D'],['Prisma','prism','Prisma3D'],['Spat','parallelepiped','Spat3D'],['Quader','cuboid','Quader3D']];
  for(const [label,kind,macro] of shapes){
    await activate(label);
    const start=await anchor(),mid=[start[0]+42,start[1]],end=[start[0]+84,start[1]];
    const before=await state();
    await down(start);
    await move(mid);
    const small=await state();
    assert.equal(small.solids.length,1,'First drag must show exactly one preview: '+kind);
    assert.equal(small.solids[0].preview,true,'Dragging must remain a preview before release');
    assert.ok(small.solids[0].visible,'Preview must actually render');
    assert.ok(Math.hypot(...small.solids[0].anchor.map((value,index)=>value-start[index]))<2,'First vertex must stay under the initial click: '+JSON.stringify({actual:small.solids[0].anchor,expected:start}));
    await move(end);
    const large=await state();
    assert.equal(large.solids.length,1,'Growing preview must reuse one body');
    assert.ok(near(large.solids[0].volume/small.solids[0].volume,8,1e-3),'Doubling cursor distance must scale volume by8: '+kind);
    assert.deepEqual(large.camera,before.camera,'Drawing must not pan or rotate the camera');
    await up(end);
    const committed=await state();
    assert.equal(committed.solids.length,1,'Release must commit one body: '+kind);
    assert.equal(committed.undoCount,before.undoCount+1,'Release must create one history transaction: '+kind);
    assert.equal(committed.solids[0].preview,false);
    assert.equal(committed.solids[0].kind,kind);
    assert.ok(committed.solids[0].visible);
    assertRegular(committed.solids[0],kind);
    assert.deepEqual(committed.camera,before.camera,'Commit must retain camera');
    assert.ok(near(committed.solids[0].volume,large.solids[0].volume),'Release must keep preview dimensions');
    await closePanels();
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(tmpdir(),'lia-coordinate-solid-draw-'+kind+'.png'),Buffer.from(screenshot.data,'base64'));
    await history('undo');
    clean(await state(),baseline,'One undo must remove whole body and all generated sources');
    await history('redo');
    const restored=await state();
    assert.equal(restored.solids.length,1,'Redo must restore body: '+JSON.stringify(restored));
    assert.ok(near(restored.solids[0].volume,committed.solids[0].volume),'Redo must restore geometry');
    const exported=await evaluate("(()=>{const c=__boards.raum.containerObj;c.querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click());const panel=c.querySelector('.lia-dgs-object-list-panel');if(!panel.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();[...c.querySelectorAll('.lia-dgs-export-dialog button')].find(b=>b.dataset.primary==='1').click();const value=c.querySelector('.lia-dgs-export-textarea').value;[...c.querySelectorAll('.lia-dgs-export-dialog .lia-dgs-angle-dialog-button')].find(b=>/Schlie|Close/i.test(b.textContent)).click();c.querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click());return value;})()");
    assert.ok(exported.includes('@'+macro+'('),'Dragged body must export with normal source-based macro: '+exported);
    assert.ok(exported.includes('@Punkt3D(')||exported.includes('@Point3D('),'Generated defining points must export');
    await history('undo');
    clean(await state(),baseline,'Undo after redo must remove generated construction');
    console.log('PASS drag '+label+': live proportional preview, commit, undo/redo, source export');
  }

  // Escape must remove the preview without creating sources/history.
  await activate('Tetraeder');
  let start=await anchor(),end=[start[0]+75,start[1]-20];
  const beforeCancel=await state();
  await down(start);await move(end);
  assert.equal((await state()).solids[0]?.preview,true);
  await escape();await up(end);
  const cancelled=await state();
  clean(cancelled,baseline,'Escape must clean preview and all temporary sources');
  assert.equal(cancelled.undoCount,beforeCancel.undoCount,'Cancelling must not create an undo action');

  // A short click keeps the existing point-by-point construction path.
  await activate('Tetraeder');
  await clickAt(await anchor());
  const clicked=await state();
  assert.equal(clicked.solids.length,0,'Short click must not create a regular solid');
  assert.equal(clicked.counts.points,baseline.counts.points+1,'Short click must select/create the first manual source point');
  await escape();
  clean(await state(),baseline,'Escaping a manual first point must clean pending sources');

  // Measure the same screen drag before and after actual wheel zoom.
  const cubeEdge=async()=>{
    await activate('Quader');const a=await anchor(),b=[a[0]+70,a[1]];
    await down(a);await move(b);await up(b);const result=(await state()).solids[0].edgeLengths[0];
    await closePanels();await history('undo');return result;
  };
  const edgeBefore=await cubeEdge();
  const zoomAnchor=await anchor();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:zoomAnchor[0],y:zoomAnchor[1],deltaX:0,deltaY:-200});
  await sleep(200);
  const edgeAfter=await cubeEdge();
  assert.ok(edgeAfter<edgeBefore*.95&&edgeAfter>edgeBefore*.1,'Zooming in must reduce world size for the same pixel drag: '+JSON.stringify({edgeBefore,edgeAfter}));

  // A toolbar selection must cancel an in-progress preview without committing it.
  await activate('Tetraeder');start=await anchor();end=[start[0]+65,start[1]];
  const beforeToolChange=await state();
  await down(start);await move(end);
  await evaluate("(()=>{const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-solid3d-button').click();[...c.querySelectorAll('.lia-dgs-geometry-tool')].find(b=>b.textContent.trim()==='Pyramide').click()})()");
  await up(end);
  const toolChanged=await state();
  clean(toolChanged,baseline,'Changing tools must cancel the draft');
  assert.equal(toolChanged.undoCount,beforeToolChange.undoCount,'Tool cancellation must not create history');

  // Dragging from an existing vertex must reuse that source and keep its position.
  await activate('Tetraeder');start=await anchor();end=[start[0]+85,start[1]];
  await down(start);await move(end);await up(end);await closePanels();
  const original=await state(),existingStart=original.solids[0].anchor;
  await activate('Quader');end=[existingStart[0]+70,existingStart[1]-20];
  await down(existingStart);await move(end);
  const withPreview=await state();
  assert.equal(withPreview.solids.length,2,'Existing vertex drag must start an additional preview');
  assert.ok(withPreview.solids.some(s=>s.preview),'Existing source must support drag construction');
  await up(end);await closePanels();
  const shared=await state(),cube=shared.solids.find(s=>s.kind==='cuboid');
  assert.equal(shared.solids.length,2,'Existing vertex drag must commit one additional body');
  assert.equal(shared.counts.points,original.counts.points+3,'Cube must reuse existing anchor and add only three source points');
  assert.deepEqual(cube.vertices[0],original.solids[0].vertices[0],'Existing anchor coordinates must remain unchanged');
  await history('undo');
  clean(await state(),original,'Undo must preserve the shared original source');
  await history('undo');
  clean(await state(),baseline,'Undo must clean the original test body');
  // Switching mode during a draft must dispose of its 3D resources.
  await activate('Prisma');start=await anchor();end=[start[0]+65,start[1]];
  await down(start);await move(end);
  assert.equal((await state()).solids[0]?.preview,true);
  await evaluate("__coord.setCoordinateViewMode(__coordinateViews3d.raum,'2d')");
  await up(end);
  const switched=await state();
  clean(switched,baseline,'Mode switch must cancel the draft');
  assert.equal(switched.mode,'2d');
  assert.deepEqual(switched.errors,[]);
  console.log('PASS Escape/manual-click/zoom/mode cleanup and no camera interference');
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
