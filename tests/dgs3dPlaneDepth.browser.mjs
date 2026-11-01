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
const fixture = join(root, 'tests/fixtures/dynamic-3d-plane-depth.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-plane-depth-chrome-'));
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
  await evaluate('preparePlaneScene()');
  await sleep(100);
  const run=fn=>evaluate('('+fn.toString()+')()');
  await run(()=>{
    window.planeScreen=point=>{const b=__boards.raum,p=__coordinateViews3d.raum.view.project3DTo2D(point);return [b.origin.scrCoords[1]+p[1]*b.unitX,b.origin.scrCoords[2]-p[2]*b.unitY];};
    window.planeMaskAlpha=async(object,point)=>{
      const node=(object.element2D||object).rendNode,root=__boards.raum.renderer.svgRoot,mask=node.getAttribute('mask')||node.style.mask||'none',opacity=Number(getComputedStyle(node).opacity||1);
      if(mask==='none')return opacity;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),b=__boards.raum,w=b.canvasWidth,h=b.canvasHeight;
      svg.setAttribute('xmlns',svg.namespaceURI);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('viewBox','0 0 '+w+' '+h);
      root.querySelectorAll('defs').forEach(defs=>svg.append(defs.cloneNode(true)));
      const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('width',w);rect.setAttribute('height',h);rect.setAttribute('fill','white');rect.setAttribute('mask',mask);svg.append(rect);
      const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await img.decode();
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const p=planeScreen(point);
      return ctx.getImageData(Math.round(p[0]),Math.round(p[1]),1,1).data[3]/255*opacity;
    };
    window.planeAxisAlpha=point=>{const e=__coordinateViews3d.raum,c=e.decorationCanvas,p=planeScreen(point),sx=c.width/e.board.canvasWidth,sy=c.height/e.board.canvasHeight;
      const data=c.getContext('2d').getImageData(Math.round(p[0]*sx)-2,Math.round(p[1]*sy)-2,5,5).data;let alpha=0;for(let i=3;i<data.length;i+=4)alpha=Math.max(alpha,data[i]/255);return alpha;};
  });
  const initial=await run(async()=>{
    const p=planeProbe,e=__coordinateViews3d.raum;e.occlusion.beginFrame();e.occlusion.updateMasks();
    return {hasSurfaces:e.occlusion.hasSurfaces,planeFill:p.plane.element2D.visProp.fillcolor,planeOpacity:p.plane.element2D.visProp.fillopacity,
      planeVisible:p.plane.element2D.visPropCalc,planeData:__coord.coordinatePlane3DData?.(p.plane),bounds:p.plane.__liaPlane3DClippedPolygon,
      front:e.occlusion.opacityAt(p.at(0,.55,2)),back:e.occlusion.opacityAt(p.at(0,-.55,-2)),
      frontMask:await planeMaskAlpha(p.front,p.at(0,.55,2)),backMask:await planeMaskAlpha(p.back,p.at(0,-.55,-2)),
      frontPoint:await planeMaskAlpha(p.frontPoint,p.at(.55,1.1,2)),backPoint:await planeMaskAlpha(p.backPoint,p.at(-.55,-1.1,-2)),
      frontAxis:planeAxisAlpha([1.4,0,0]),backAxis:planeAxisAlpha([-1.4,0,0])};
  });

  const firstShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'tests/browser/3d-plane-depth-initial.png'),Buffer.from(firstShot.data,'base64'));
  assert.ok(initial.hasSurfaces&&initial.front>.99&&initial.back<.9,'Plane must distinguish front and back: '+JSON.stringify(initial));
  assert.ok(initial.frontMask>.95&&initial.backMask<.9&&initial.frontPoint>.95&&initial.backPoint<.9,'Actual line/point appearance must follow plane depth: '+JSON.stringify(initial));
  assert.ok(initial.frontAxis>.95&&initial.backAxis<.9,'Axes must respect depth on either side of plane: '+JSON.stringify(initial));
  const coplanar=await run(()=>{
    const p=planeProbe,e=__coordinateViews3d.raum,b=e.board;
    p.plane.__liaPlane3DUserVisible=false;
    const xy=__coord.createCoordinatePlane3D(b,'three-points',[
      p.point([-2,-2,0],'','#ff00ff',false),p.point([2,-2,0],'','#ff00ff',false),p.point([0,2,0],'','#ff00ff',false)
    ],[],{name:'XY',withLabel:false,strokeColor:'#ff6600',fillColor:'#ff6600',fillOpacity:.22});
    b.fullUpdate();__coord.setCoordinateCamera(e,p.camera);e.occlusion.beginFrame();
    const result={x:e.occlusion.opacityAt([1.4,0,0]),y:e.occlusion.opacityAt([0,1.4,0]),
      frontZ:e.occlusion.opacityAt([0,0,1.4]),backZ:e.occlusion.opacityAt([0,0,-1.4]),
      frontAxis:planeAxisAlpha([0,0,1.4]),backAxis:planeAxisAlpha([0,0,-1.4])};
    xy.__liaPlane3DUserVisible=false;p.plane.__liaPlane3DUserVisible=true;b.fullUpdate();return result;
  });
  assert.ok(coplanar.x>.99&&coplanar.y>.99&&coplanar.frontZ>.99&&coplanar.backZ<.9&&coplanar.frontAxis>.95&&coplanar.backAxis<.9,
    'XY plane must leave coplanar x/y and front z clear, while weakening rear z: '+JSON.stringify(coplanar));
  const screenshotPixel=async point=>{
    const image=await send('Page.captureScreenshot',{format:'png'});
    return evaluate('(async()=>{const img=new Image();img.src="data:image/png;base64,"+'+JSON.stringify(image.data)+';await img.decode();const canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext("2d");c.drawImage(img,0,0);const local=planeScreen('+JSON.stringify(point)+'),rect=__boards.raum.containerObj.getBoundingClientRect();const data=c.getImageData(Math.round(rect.left+local[0])-2,Math.round(rect.top+local[1])-2,5,5).data;let best=[0,0,0,0];for(let i=0;i<data.length;i+=4){const color=[...data.slice(i,i+4)];if(Math.min(...color.slice(0,3))>Math.min(...best.slice(0,3)))best=color;}return best;})()');
  };
  const frontSample=await run(()=>planeProbe.at(1.8,.55,2));
  const clearFrontPixel=await screenshotPixel(frontSample);
  const frontPointSample=await run(()=>planeProbe.at(.55,1.1,2)),clearPointPixel=await screenshotPixel(frontPointSample);
  await run(()=>{planeProbe.plane.setAttribute({layer:15});__boards.raum.fullUpdate();});
  await sleep(100);
  const coveredFrontPixel=await screenshotPixel(frontSample),coveredPointPixel=await screenshotPixel(frontPointSample);
  assert.ok(coveredPointPixel.slice(0,3).every((value,index)=>Math.abs(value-clearPointPixel[index])<=2),'Foreground point must remain untinted: '+JSON.stringify({clearPointPixel,coveredPointPixel}));
  console.log('Actual front line pixels '+JSON.stringify({clearFrontPixel,coveredFrontPixel}));
  assert.ok(Math.min(...coveredFrontPixel.slice(0,3))>250,'Foreground white line must remain untinted even when the plane has a higher SVG layer: '+JSON.stringify({clearFrontPixel,coveredFrontPixel}));
  await run(()=>{planeProbe.front.setAttribute({layer:1});planeProbe.frontPoint.setAttribute({layer:1});__boards.raum.fullUpdate();});
  await sleep(80);
  const relayeredLine=await screenshotPixel(frontSample),relayeredPoint=await screenshotPixel(frontPointSample);
  assert.ok(Math.min(...relayeredLine.slice(0,3))>250&&relayeredPoint.slice(0,3).every((value,index)=>Math.abs(value-clearPointPixel[index])<=2),
    'Changing primitive layers must preserve foreground visibility: '+JSON.stringify({relayeredLine,relayeredPoint,clearPointPixel}));
  const modes=await run(async()=>{
    const p=planeProbe,e=__coordinateViews3d.raum;__coord.setCoordinateViewMode(e,'2d');
    const cleared={mask:p.back.element2D.rendNode.getAttribute('mask'),pointOpacity:Number(getComputedStyle(p.backPoint.element2D.rendNode).opacity||1),groupGone:!e.board.renderer.svgRoot.querySelector('[data-lia-coordinate-3d-primitives]'),parentRestored:p.front.element2D.rendNode.parentNode===e.board.renderer.layer[1]&&p.frontPoint.element2D.rendNode.parentNode===e.board.renderer.layer[1]};
    __coord.setCoordinateViewMode(e,'3d');e.board.fullUpdate();e.occlusion.beginFrame();e.occlusion.updateMasks();
    return {cleared,reapplied:await planeMaskAlpha(p.back,p.at(0,-.55,-2)),groupRestored:!!e.board.renderer.svgRoot.querySelector('[data-lia-coordinate-3d-primitives]')};
  });
  assert.ok(!modes.cleared.mask&&modes.cleared.pointOpacity>.99&&modes.cleared.groupGone&&modes.cleared.parentRestored&&modes.groupRestored&&modes.reapplied<.9,
    'Mode changes must clear and restore plane depth effects: '+JSON.stringify(modes));
  await run(()=>{const e=__coordinateViews3d.raum,c=planeProbe.camera;__coord.setCoordinateCamera(e,{azimuth:c.azimuth+Math.PI,elevation:-c.elevation,bank:0});});
  await sleep(80);
  const reverse=await run(async()=>{const e=__coordinateViews3d.raum,p=planeProbe;e.occlusion.beginFrame();e.occlusion.updateMasks();return {oldFront:await planeMaskAlpha(p.front,p.at(0,.55,2)),oldBack:await planeMaskAlpha(p.back,p.at(0,-.55,-2))};});
  assert.ok(reverse.oldFront<.9&&reverse.oldBack>.95,'Reverse viewpoint must exchange front and rear: '+JSON.stringify(reverse));
  await run(()=>__coord.setCoordinateCamera(__coordinateViews3d.raum,planeProbe.camera));
  const overlap=await run(async()=>{
    const p=planeProbe,e=__coordinateViews3d.raum,b=e.board,center=p.point(p.at(0,0,0),'O','#ff00ff',false);
    const sphere=__coord.createCoordinateSphere3D(b,'center-radius',[center],1.5,{name:'S',withLabel:true,strokeColor:'#ff0000',fillColor:'#ff0000',fillOpacity:.18});
    p.sphere=sphere;b.fullUpdate();e.occlusion.beginFrame();e.occlusion.updateMasks();
    return {covered:await planeMaskAlpha(p.plane,p.at(.5,0,0)),clear:await planeMaskAlpha(p.plane,p.at(2.2,0,0))};
  });
  assert.ok(overlap.covered<.9&&overlap.clear>.95,'Near sphere must attenuate only overlapped plane parts: '+JSON.stringify(overlap));
  await run(()=>__coord.setCoordinateProjection(__coordinateViews3d.raum,'central'));
  await sleep(80);
  const perspective=await run(()=>{const e=__coordinateViews3d.raum,p=planeProbe;e.occlusion.beginFrame();return {front:e.occlusion.opacityAt(p.at(0,.55,2)),back:e.occlusion.opacityAt(p.at(0,-.55,-2))};});
  assert.ok(perspective.front>.99&&perspective.back<.9,'Perspective depth must respect plane sides: '+JSON.stringify(perspective));
  await run(()=>__coord.setCoordinateProjection(__coordinateViews3d.raum,'parallel'));
  await sleep(80);
  const timing=await run(async()=>{
    const e=__coordinateViews3d.raum,c=planeProbe.camera,frames=[],depth=[];
    for(let i=1;i<=12;i++){const start=performance.now();__coord.setCoordinateCamera(e,{...c,azimuth:c.azimuth+i*.025});await new Promise(requestAnimationFrame);frames.push(performance.now()-start);depth.push(e.occlusion.lastFrameMs);}
    __coord.setCoordinateCamera(e,c);
    const stats=values=>{values.sort((a,b)=>a-b);return {medianMs:values[Math.floor(values.length/2)],maxMs:values.at(-1)};};
    return {rotation:stats(frames),depth:stats(depth)};
  });
  console.log('Plane/sphere depth rotation timing '+JSON.stringify(timing));
  assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'tests/browser/3d-plane-depth.png'),Buffer.from(screenshot.data,'base64'));
  console.log('PASS plane foreground/background masks, axes, rotation, sphere overlap and perspective');
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