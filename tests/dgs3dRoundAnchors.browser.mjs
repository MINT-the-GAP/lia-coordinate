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
const fixture = join(root, 'tests/fixtures/dynamic-3d-round-anchors.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-round-anchors-chrome-'));
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
  await evaluate("__boards.raum.containerObj.querySelector('.lia-dgs-menu-button').click()");
  await sleep(200);
  const assertAnchors = async message => {
    for(const kind of ['cylinder','cone']){
      const state=await evaluate('inspectAnchor('+JSON.stringify(kind)+')');
      assert.ok(state.strokeWidth>=1.5,message+': radius point cross must be visibly stroked '+JSON.stringify(state));
      assert.ok(Math.abs(state.axial)<1e-7,message+': radius point must lie in the actual base plane '+JSON.stringify(state));
      assert.ok(Math.abs(state.radial-state.radius)<1e-7,message+': radius point must lie on the rim '+JSON.stringify(state));
    }
  };
  const assertTangents = async message => {
    for(const kind of ['cylinder','cone']){
      const state=await evaluate('inspectTangents('+JSON.stringify(kind)+')');
      if(kind==='cone'&&state.endInsideBase){
        assert.ok(state.lines.every(line=>!line.visible||!line.finite),'No fictitious cone edges when the apex is inside the projected base: '+JSON.stringify(state));
      }else{
        assert.equal(state.lines.filter(line=>line.visible&&line.finite).length,2,message+': missing silhouettes '+JSON.stringify(state));
        for(const line of state.lines){
          assert.ok(Math.abs(line.strokeWidth-2)<1e-7,message+': silhouette outline must retain the default 2px stroke '+JSON.stringify(state));
          assert.ok(line.tangentError<2e-5,message+': generator must meet the circle tangentially '+JSON.stringify(state));
          assert.ok(Math.abs(line.axial)<1e-7&&line.radialError<1e-7,message+': generator endpoint must lie on base rim '+JSON.stringify(state));
        }
      }
    }
  };
   await assertAnchors('Initial all-z0 construction');
    const cameraCases=[{azimuth:.8,elevation:.4,bank:0},{azimuth:2.1,elevation:.65,bank:.2},{azimuth:-.4,elevation:.8,bank:-.3}];
    for(const projection of ['parallel','central']){
      await evaluate('__coord.setCoordinateProjection(__coordinateViews3d.raum,'+JSON.stringify(projection)+')');
      for(const camera of cameraCases){
        await evaluate('__coord.setCoordinateCamera(__coordinateViews3d.raum,'+JSON.stringify(camera)+')');
        await sleep(70);
        await assertAnchors(projection+' rotation');
        await assertTangents(projection+' '+JSON.stringify(camera));
      }
    }
    await evaluate("(()=>{const p=__points.raum;__coord.setCoordinatePoint3D(p.A,[-2.4,-.7,-.4]);__coord.setCoordinatePoint3D(p.B,[-1.4,1.1,1.6]);__coord.setCoordinatePoint3D(p.D,[2.2,-.8,-.3]);__coord.setCoordinatePoint3D(p.E,[1.8,1.6,1.1]);__boards.raum.fullUpdate();})()");
    await sleep(80);
    await assertAnchors('Moving centers and axes');
    await assertTangents('Moving centers and axes');
    await evaluate("(()=>{__coord.setCoordinatePoint3D(__points.raum.C,[-.2,2.3,1.1]);__coord.setCoordinatePoint3D(__points.raum.F,[3.5,2.4,-.6]);__boards.raum.fullUpdate();})()");
    await sleep(80);
    await assertAnchors('Editing radius point coordinates');
    const translated=await evaluate(`(()=>{
      const names=['A','B','C'],delta=[.35,-.2,.15],before=names.map(name=>{const p=__points.raum[name];return [p.X(),p.Y(),p.Z()];}),radius=__coord.coordinateSolid3DData(anchorSolid('cylinder')).radius;
      names.forEach((name,i)=>__coord.setCoordinatePoint3D(__points.raum[name],before[i].map((v,axis)=>v+delta[axis]),false));
      __boards.raum.fullUpdate();
      return {delta,before,after:names.map(name=>{const p=__points.raum[name];return [p.X(),p.Y(),p.Z()];}),radius,nextRadius:__coord.coordinateSolid3DData(anchorSolid('cylinder')).radius};
    })()`);
    translated.after.forEach((p,i)=>p.forEach((value,axis)=>assert.ok(Math.abs(value-translated.before[i][axis]-translated.delta[axis])<1e-7,'Group translation must move each source once: '+JSON.stringify(translated))));
    assert.ok(Math.abs(translated.radius-translated.nextRadius)<1e-7,'Group translation must preserve radius');
    await assertAnchors('Translating entire cylinder');
    await assertTangents('Editing radius point coordinates');
    await evaluate("__coord.setCoordinateProjection(__coordinateViews3d.raum,'parallel');__coord.setCoordinateCamera(__coordinateViews3d.raum,{azimuth:.8,elevation:.4,bank:0})");
    await sleep(80);
    const before=await evaluate("inspectAnchor('cone').point");
    const from=await evaluate("anchorPointScreen('F')"),to=[from[0]+26,from[1]-19];
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from[0],y:from[1]});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:from[0],y:from[1],clickCount:1});
    for(let i=1;i<=8;i++){
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:from[0]+(to[0]-from[0])*i/8,y:from[1]+(to[1]-from[1])*i/8});await sleep(18);
    }
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:to[0],y:to[1],clickCount:1});
    await sleep(120);
    const after=await evaluate("inspectAnchor('cone').point");
    const projectedAfter=await evaluate("anchorPointScreen('F')");
    console.log('Radius drag cursor alignment '+JSON.stringify({from,to,after:projectedAfter,errorPx:Math.hypot(projectedAfter[0]-to[0],projectedAfter[1]-to[1])}));
    assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>.02,'Actual mouse drag must move the radius control point');
    await assertAnchors('Mouse dragging radius point');
    await assertTangents('Mouse dragging radius point');
    assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(root,'tests/browser/3d-round-anchors.png'),Buffer.from(screenshot.data,'base64'));
    const cleanup=await evaluate(`(()=>{
      const p=__points.raum.C;
      document.getElementById('solid3d-spec-cylinder').remove();
      __bootstrapSolid3D();
      __coord.setCoordinatePoint3D(p,[-.3,4.2,2.5]);
      __boards.raum.fullUpdate();
      return {deleted:!__solid3DEntries['solid:cylinder'],point:[p.X(),p.Y(),p.Z()]};
    })()`);
    assert.equal(cleanup.deleted,true,'Deleting the solid macro must remove its body');
    assert.deepEqual(cleanup.point,[-.3,4.2,2.5],'Deleting the body must release its radius-point constraint');
    const numeric=await evaluate(`(()=>{
      const b=__boards.raum,point=p=>__coord.createCoordinatePoint3D(b,p,{name:'',withLabel:false,visible:false,fixed:true}),a=point([-3,0,0]),z=point([-3,0,2]);
      const solid=__coord.createCoordinateSolid3D(b,'cylinder',[a,z],[],undefined,.6,{fillOpacity:.18,withLabel:false});
      __coord.setCoordinatePoint3D(z,[-2.8,.3,2.1]);b.fullUpdate();
      const result={radius:__coord.coordinateSolid3DData(solid).radius,point:[z.X(),z.Y(),z.Z()]};
      solid.__liaSolid3DCleanup?.();b.removeObject(solid);b.removeObject(a);b.removeObject(z);return result;
    })()`);
    const macroDefaults=await evaluate(`(()=>{
      const marker=document.createElement('span');marker.id='solid3d-spec-numeric-default';marker.dataset.definition='cylinder';marker.dataset.spec='raum;N;A;B;radius=.6';marker.hidden=true;document.body.appendChild(marker);__bootstrapSolid3D();
      const solid=__solid3DEntries['solid:numeric-default'].object;
      const result={radius:__coord.coordinateSolid3DData(solid).radius,opacity:solid.faces.map(face=>Number(getComputedStyle(face.element2D.rendNode).fillOpacity)),width:solid.__liaSolid3DGuideCurves.map(guide=>Number.parseFloat(getComputedStyle(guide.element2D.rendNode).strokeWidth))};
      marker.remove();__bootstrapSolid3D();return result;
    })()`);
    assert.equal(macroDefaults.radius,.6,'Numeric-radius macro must retain its radius');
    assert.ok(macroDefaults.opacity.every(value=>Math.abs(value-.25)<1e-7),'Omitted macro opacity must use the translucent default: '+JSON.stringify(macroDefaults));
    assert.ok(macroDefaults.width.every(value=>Math.abs(value-2)<1e-7),'Omitted macro line width must use 2px: '+JSON.stringify(macroDefaults));
    assert.equal(numeric.radius,.6,'Numeric-radius construction must retain its radius');
    assert.deepEqual(numeric.point,[-2.8,.3,2.1],'Numeric-radius construction must not constrain its axis endpoints');
    assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
    console.log('PASS cylinder/cone radius anchors, tangent silhouettes, both projections, source edits, real pointer drag, deletion cleanup and numeric radii');
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