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
const fixture = join(root, 'tests/fixtures/dynamic-3d-round-surfaces.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-round-surfaces-chrome-'));
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method + ' ' + String(params?.expression || '').slice(0, 220))), 45_000);
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
  await evaluate('prepareRoundScene()');
  await sleep(100);
  await evaluate(`(() => {
    window.inspectRound = object => {
      const shape=part=>{
        const node=(part.element2D||part).rendNode;
        if(!node)return {missing:true};
        const style=getComputedStyle(node),fill=style.fill,id=fill.match(/#([^)'\" ]+)/)?.[1],gradient=id?node.getRootNode().getElementById(id):null,rect=node.getBoundingClientRect();
        return {id:node.id,tag:node.tagName,fill,opacity:Number(style.fillOpacity),stroke:style.stroke,strokeOpacity:Number(style.strokeOpacity),visible:style.display!=='none'&&style.visibility==='visible',width:rect.width,height:rect.height,role:part.__liaSolid3DSurfaceRole||part.__liaSolid3DGuideRole,stops:gradient?[...gradient.querySelectorAll('stop')].map(stop=>({color:getComputedStyle(stop).stopColor,opacity:Number(getComputedStyle(stop).stopOpacity)})):[]};
      };
      return {definition:object.__liaSolid3DDefinition,faces:(object.faces||[]).map(shape),guides:(object.__liaSolid3DGuideCurves||[]).map(shape),surfaces:(object.__liaSolid3DSurfaces||[]).map(shape)};
    };
  })()`);
  const rgba=color=>(String(color).match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const assertSurfaces=(state,color,opacity)=>{
    const expected=rgba(color),faces=state.surfaces.length?state.surfaces:state.faces;
    assert.ok(faces.length>=3,'Solid must render mantle and closure surfaces: '+JSON.stringify(state));
    assert.ok(faces.some(face=>face.role==='base'),'The base must be an independently rendered filled surface');
    if(state.definition==='cylinder')assert.ok(faces.some(face=>face.role==='top'),'Cylinder must have a filled top cap');
    assert.ok(faces.some(face=>face.role==='mantle'),'Solid must have a mantle');
    for(const face of faces){
      assert.ok(face.visible&&Math.max(face.width,face.height)>1,'Every surface must remain visible: '+JSON.stringify(face));
      assert.deepEqual(rgba(face.fill),expected,'All faces must use the chosen surface hue instead of native alternating black/white');
      assert.ok(Math.abs(face.opacity-opacity)<1e-6,'Each cap and mantle face must preserve chosen transparency: '+JSON.stringify(face));
      assert.equal(face.strokeOpacity,0,'Round surface facets must not introduce mesh strokes');
    }
    for(const guide of state.guides){
      assert.equal(guide.opacity,0,'Outline curves must never become independent filled surfaces: '+JSON.stringify(guide));
      assert.ok(guide.visible,'Outline guide must remain visible');
    }
  };
  const inspect=kind=>evaluate('inspectRound(roundProbe['+JSON.stringify(kind)+'])');
  const selectColor=async(kind,channel,color)=>{
    await evaluate(`(()=>{
      const c=__boards.raum.containerObj,list=c.querySelector('.lia-dgs-object-list-panel'),name=${JSON.stringify(kind==='cylinder'?'Z':'K')};
      if(!list.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();
      const item=[...list.querySelectorAll('.lia-dgs-object-list-entry')].find(item=>item.querySelector('.lia-dgs-object-list-name')?.textContent===name);
      if(!item)throw Error('Solid missing from object list: '+name);item.click();
      c.querySelector('.lia-dgs-color-button[data-color-kind="'+${JSON.stringify(channel)}+'"]').click();
      const input=c.querySelector('.lia-dgs-color-hex');input.value=${JSON.stringify(color)};input.dispatchEvent(new Event('change',{bubbles:true}));
      __boards.raum.fullUpdate();
    })()`);
    await sleep(240);
  };
  const opacity=async value=>{
    await evaluate(`(()=>{const c=__boards.raum.containerObj,input=c.querySelector('.lia-dgs-opacity-input');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));__boards.raum.fullUpdate();})()`);
    await sleep(100);
  };
  assertSurfaces(await inspect('cylinder'),'rgb(255,0,255)',.22);
  assertSurfaces(await inspect('cone'),'rgb(255,0,255)',.22);
  for(const kind of ['cylinder','cone']){
    await selectColor(kind,'line','#ff0000');
    const lineState=await inspect(kind);
    for(const guide of lineState.guides){
      assert.equal(guide.opacity,0,'Line edits must preserve empty guides');
      const channels=rgba(guide.stroke);
      assert.ok(channels[0]>240&&channels[1]<5&&channels[2]<5,'Guides must track chosen line color: '+JSON.stringify(guide));
    }
    await selectColor(kind,'fill','#00aaee');
    assertSurfaces(await inspect(kind),'rgb(0,170,238)',.22);
    await opacity(36);
    assertSurfaces(await inspect(kind),'rgb(0,170,238)',.36);
    await opacity(0);
    assertSurfaces(await inspect(kind),'rgb(0,170,238)',0);
    await opacity(22);
    await selectColor(kind,'line','#ff00ff');
    await selectColor(kind,'fill','#ff00ff');
    assertSurfaces(await inspect(kind),'rgb(255,0,255)',.22);
  }
  await evaluate(`__boards.raum.containerObj.querySelectorAll('.lia-dgs-side-menu-close').forEach(button=>button.click())`);
  const motion=await evaluate(`(async()=>{
    const e=__coordinateViews3d.raum,times=[];
    for(let i=0;i<12;i++){const start=performance.now();__coord.setCoordinateCamera(e,{azimuth:.8+i*.16,elevation:.4,bank:0});await new Promise(requestAnimationFrame);times.push(performance.now()-start);}
    __coord.setCoordinateCamera(e,roundProbe.camera);times.sort((a,b)=>a-b);return {medianMs:times[6],maxMs:times.at(-1)};
  })()`);
  assertSurfaces(await inspect('cylinder'),'rgb(255,0,255)',.22);
  assertSurfaces(await inspect('cone'),'rgb(255,0,255)',.22);
  for(const projection of ['central','parallel']){
    await evaluate('__coord.setCoordinateProjection(__coordinateViews3d.raum,'+JSON.stringify(projection)+')');
    await sleep(80);
    assertSurfaces(await inspect('cylinder'),'rgb(255,0,255)',.22);
    assertSurfaces(await inspect('cone'),'rgb(255,0,255)',.22);
  }
  await evaluate(`(()=>{
    const e=__coordinateViews3d.raum,b=e.board,p=roundProbe.cylinder.__liaSolid3DSourcePoints[1];
    __coord.setCoordinatePoint3D(p,[-1.5,.5,2.5]);b.fullUpdate();
  })()`);
  await sleep(80);
  assertSurfaces(await inspect('cylinder'),'rgb(255,0,255)',.22);
  const depth=await evaluate(`(()=>{const e=__coordinateViews3d.raum;e.occlusion.beginFrame();return {inside:e.occlusion.opacityAt([-2,0,0]),outside:e.occlusion.opacityAt([20,0,0])};})()`);
  assert.ok(depth.inside<.9&&depth.outside>.99,'Closed round bodies must retain depth occlusion: '+JSON.stringify(depth));
  assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(root,'tests/browser/3d-round-surfaces.png'),Buffer.from(screenshot.data,'base64'));
  console.log('PASS cylinder/cone mantle, filled caps, consistent surface hue/transparency, unfilled guides, UI color/opacity, rotation, projection and source movement');
  console.log('Round solid rotation '+JSON.stringify(motion));
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