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
const fixture = join(root, 'tests/fixtures/dynamic-3d-depth.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-depth-chrome-'));
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
  await evaluate('prepareDepthScene()');
  await sleep(100);
  await evaluate(`(() => {
    window.inspectDepthSphere = () => {
      const object=depthProbe.sphere,node=object.element2D.rendNode,scope=node.getRootNode();
      // Inline CSS fill wins over the SVG fill attribute. Inspect what is painted.
      const fill=getComputedStyle(node).fill;
      const id=fill.match(/#([^)'" ]+)/)?.[1],gradient=id?scope.getElementById(id):null;
      const rgb=value=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const context=canvas.getContext('2d');context.fillStyle=value;context.fillRect(0,0,1,1);
        return [...context.getImageData(0,0,1,1).data].slice(0,3);
      };
      return {fill,id,gradient:gradient?.tagName,opacity:Number(node.getAttribute('fill-opacity')),
        duplicates:id?[...scope.querySelectorAll('[id]')].filter(element=>element.id===id).length:0,
        stops:gradient?[...gradient.querySelectorAll('stop')].map(stop=>({color:rgb(getComputedStyle(stop).stopColor),opacity:Number(getComputedStyle(stop).stopOpacity)})):[],
        guides:object.__liaSphere3DGuideCurves.map(guide=>({fill:guide.element2D.visProp.fillcolor,opacity:Number(guide.element2D.rendNode.getAttribute('fill-opacity'))}))};
    };
  })()`);
  const assertSphereTint=(state,channel)=>{
    assert.ok(state.gradient&&state.stops.length>=2,JSON.stringify(state));
    assert.equal(state.duplicates,1,'Only the current gradient may own its ID: '+JSON.stringify(state));
    for(const stop of state.stops){
      assert.ok(stop.color[channel]>stop.color[(channel+1)%3]&&stop.color[channel]>stop.color[(channel+2)%3],
        'Every visible gradient stop must use the selected hue: '+JSON.stringify(state));
    }
    assert.ok(state.guides.every(guide=>guide.fill==='none'&&guide.opacity===0),JSON.stringify(state));
  };
  assertSphereTint(await evaluate('inspectDepthSphere()'),0);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:20});
  await evaluate(`(() => {
    const container=__boards.raum.containerObj,list=container.querySelector('.lia-dgs-object-list-panel');
    if(!list.classList.contains('is-open'))container.querySelector('.lia-dgs-object-list-button').click();
    const entry=[...list.querySelectorAll('.lia-dgs-object-list-entry')].find(item=>item.querySelector('.lia-dgs-object-list-name')?.textContent==='S');
    entry.click();container.querySelector('.lia-dgs-color-button[data-color-kind="line"]').click();
  })()`);
  let gradientId=null;
  for(const [color,channel] of [['#00ff00',1],['#0000ff',2],['#ff0000',0]]){
    await evaluate(`(() => {const input=__boards.raum.containerObj.querySelector('.lia-dgs-color-hex');input.value=${JSON.stringify(color)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(100);
    const state=await evaluate('inspectDepthSphere()');
    assertSphereTint(state,channel);
    assert.equal(state.opacity,.18,'A color change must preserve sphere transparency');
    if(gradientId)assert.equal(state.id,gradientId,'Color changes should update the existing gradient');
    gradientId=state.id;
  }
  await evaluate(`__boards.raum.containerObj.querySelectorAll('.lia-dgs-side-menu-close').forEach(button=>button.click())`);
  console.log('PASS actual sphere gradient tint, all stops, unchanged transparency, and stable gradient IDs');

  await evaluate(`(() => {
    window.depthScreen = point => {
      const board=__boards.raum,p=__coordinateViews3d.raum.view.project3DTo2D(point);
      return [board.origin.scrCoords[1]+p[1]*board.unitX,board.origin.scrCoords[2]-p[2]*board.unitY];
    };
    window.depthMaskAlpha = async (object,point) => {
      const node=(object.element2D||object).rendNode,root=__boards.raum.renderer.svgRoot;
      const mask=node.getAttribute('mask')||node.style.mask||'none';
      const opacity=Number(getComputedStyle(node).opacity||1);
      if(!mask||mask==='none')return {mask,alpha:opacity};
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      const width=__boards.raum.containerObj.clientWidth,height=__boards.raum.containerObj.clientHeight;
      svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',width);svg.setAttribute('height',height);
      svg.setAttribute('viewBox','0 0 '+width+' '+height);
      for(const defs of root.querySelectorAll('defs'))svg.append(defs.cloneNode(true));
      const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('width',width);rect.setAttribute('height',height);
      rect.setAttribute('fill','#fff');rect.setAttribute('mask',mask);svg.append(rect);
      const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await img.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      const screen=depthScreen(point),x=Math.max(0,Math.min(width-1,Math.round(screen[0]))),y=Math.max(0,Math.min(height-1,Math.round(screen[1])));
      return {mask,alpha:ctx.getImageData(x,y,1,1).data[3]/255*opacity};
    };
    window.depthAxisAlpha = point => {
      const canvas=__coordinateViews3d.raum.decorationCanvas,screen=depthScreen(point);
      const sx=canvas.width/__boards.raum.containerObj.clientWidth,sy=canvas.height/__boards.raum.containerObj.clientHeight;
      const x=Math.round(screen[0]*sx),y=Math.round(screen[1]*sy),ctx=canvas.getContext('2d');
      const data=ctx.getImageData(x-2,y-2,5,5).data;let alpha=0;
      for(let i=3;i<data.length;i+=4)alpha=Math.max(alpha,data[i]/255);
      return alpha;
    };
  })()`);
  const depth=await evaluate(`(async()=>{
    const entry=__coordinateViews3d.raum,probe=depthProbe,occlusion=entry.occlusion;
    if(!occlusion)throw Error('Missing 3D depth renderer');
    occlusion.beginFrame();occlusion.updateMasks();
    const back=probe.at(0,-.55,-3),front=probe.at(0,.55,3),outside=probe.at(2.8,-.55,-3);
    return {behind:occlusion.opacityAt(back,probe.back),front:occlusion.opacityAt(front,probe.front),outside:occlusion.opacityAt(outside,probe.back),
      backMask:await depthMaskAlpha(probe.back,back),outsideMask:await depthMaskAlpha(probe.back,outside),frontMask:await depthMaskAlpha(probe.front,front),
      backPoint:await depthMaskAlpha(probe.backPoint,probe.at(-.55,-1.1,-3)),frontPoint:await depthMaskAlpha(probe.frontPoint,probe.at(.55,1.1,3)),
      axis:depthAxisAlpha([1,0,0])};
  })()`);
  assert.ok(depth.behind<.9&&depth.behind>0,'Geometry behind a transparent sphere must be weakened: '+JSON.stringify(depth));
  assert.ok(depth.front>.99&&depth.outside>.99,'Front and non-overlapping geometry must stay bright: '+JSON.stringify(depth));
  assert.ok(depth.backMask.alpha<.9&&depth.outsideMask.alpha>.95&&depth.frontMask.alpha>.95,
    'The visible SVG mask must attenuate only the occluded part of a line: '+JSON.stringify(depth));
  assert.ok(depth.backPoint.alpha<.9&&depth.frontPoint.alpha>.95,'Points must respect depth too: '+JSON.stringify(depth));
  await evaluate(`(()=>{const object=depthProbe.sphere;object.__liaSphere3DUserVisible=false;object.__liaDgsShowObject=false;__boards.raum.fullUpdate();__coord.setCoordinateCamera(__coordinateViews3d.raum,depthProbe.camera);})()`);
  await sleep(80);
  const clearAxis=await evaluate('depthAxisAlpha([1,0,0])');
  assert.ok(clearAxis>.95&&depth.axis<clearAxis-.05,'The actual axis canvas must fade behind the sphere: '+JSON.stringify({clearAxis,depth}));
  await evaluate(`(()=>{const object=depthProbe.sphere;object.__liaSphere3DUserVisible=true;object.__liaDgsShowObject=true;__boards.raum.fullUpdate();
    const camera=depthProbe.camera;__coord.setCoordinateCamera(__coordinateViews3d.raum,{azimuth:camera.azimuth+Math.PI,elevation:-camera.elevation,bank:0});})()`);
  await sleep(80);
  const reversed=await evaluate(`(()=>{const o=__coordinateViews3d.raum.occlusion;o.beginFrame();return {
    oldFront:o.opacityAt(depthProbe.at(0,.55,3),depthProbe.front),oldBack:o.opacityAt(depthProbe.at(0,-.55,-3),depthProbe.back)}})()`);
  assert.ok(reversed.oldFront<.9&&reversed.oldBack>.99,'Camera reversal must swap front/back occlusion: '+JSON.stringify(reversed));
  await evaluate(`__coord.setCoordinateCamera(__coordinateViews3d.raum,depthProbe.camera)`);
  await sleep(80);
  const surfaces=await evaluate(`(async()=>{
    const board=__boards.raum,probe=depthProbe,entry=__coordinateViews3d.raum;
    const center=__coord.createCoordinatePoint3D(board,probe.at(1.8,0,-4),{name:'',visible:false,withLabel:false,fixed:true});
    const rear=__coord.createCoordinateSphere3D(board,'center-radius',[center],1,
      {name:'rear-surface',withLabel:false,strokeColor:'#ffffff',fillOpacity:.18});
    board.fullUpdate();entry.occlusion.beginFrame();entry.occlusion.updateMasks();
    const covered=probe.at(1.1,0,-4),clear=probe.at(2.5,0,-4);
    probe.rearSurface=rear;const result={covered:await depthMaskAlpha(rear,covered),clear:await depthMaskAlpha(rear,clear)};
    rear.__liaSphere3DUserVisible=false;rear.__liaDgsShowObject=false;
    const outline=__coord.createCoordinateSphere3D(board,'center-radius',[center],1,
      {name:'outline-surface',withLabel:false,strokeColor:'#ffffff',fillOpacity:0,highlightFillOpacity:0});
    board.fullUpdate();entry.occlusion.beginFrame();entry.occlusion.updateMasks();
    result.unfilled={covered:await depthMaskAlpha(outline,covered),clear:await depthMaskAlpha(outline,clear),fillOpacity:Number(outline.element2D.rendNode.getAttribute('fill-opacity'))};
    outline.__liaSphere3DUserVisible=false;outline.__liaDgsShowObject=false;board.fullUpdate();
    return result;
  })()`);
  assert.ok(surfaces.covered.alpha<.9&&surfaces.clear.alpha>.95,
    'A rear sphere surface must fade only where a nearer sphere overlaps: '+JSON.stringify(surfaces));
  assert.ok(surfaces.unfilled.fillOpacity===0&&surfaces.unfilled.covered.alpha<.9&&surfaces.unfilled.clear.alpha>.95,
    'An unfilled rear sphere must retain depth attenuation on its outline: '+JSON.stringify(surfaces));
  const transparentForeground=await evaluate(`(async()=>{
    const sphere=depthProbe.sphere,entry=__coordinateViews3d.raum,container=entry.board.containerObj,list=container.querySelector('.lia-dgs-object-list-panel');
    if(!list.classList.contains('is-open'))container.querySelector('.lia-dgs-object-list-button').click();
    [...list.querySelectorAll('.lia-dgs-object-list-entry')].find(item=>item.querySelector('.lia-dgs-object-list-name')?.textContent==='S').click();
    container.querySelector('.lia-dgs-color-button[data-color-kind="line"]').click();
    const opacity=container.querySelector('.lia-dgs-opacity-input');opacity.value='0';opacity.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(requestAnimationFrame);entry.occlusion.beginFrame();entry.occlusion.updateMasks();
    const result={fillOpacity:Number(sphere.element2D.rendNode.getAttribute('fill-opacity')),brightness:entry.occlusion.opacityAt(depthProbe.at(0,-.55,-3),depthProbe.back),mask:await depthMaskAlpha(depthProbe.back,depthProbe.at(0,-.55,-3))};
    opacity.value='18';opacity.dispatchEvent(new Event('input',{bubbles:true}));container.querySelectorAll('.lia-dgs-side-menu-close').forEach(button=>button.click());
    return result;
  })()`);
  assert.ok(transparentForeground.fillOpacity===0&&transparentForeground.brightness>.99&&transparentForeground.mask.alpha>.99,
    'A completely transparent foreground sphere must stop weakening rear geometry: '+JSON.stringify(transparentForeground));
  await evaluate(`__coord.setCoordinateProjection(__coordinateViews3d.raum,'central')`);
  await sleep(100);
  assertSphereTint(await evaluate('inspectDepthSphere()'),0);
  const central=await evaluate(`(()=>{const entry=__coordinateViews3d.raum;entry.occlusion.beginFrame();return {
    inside:entry.occlusion.opacityAt([0,0,0]),outside:entry.occlusion.opacityAt([20,0,0])}})()`);
  assert.ok(central.inside<.9&&central.outside>.99,'Perspective view must use depth as well: '+JSON.stringify(central));
  await evaluate(`__coord.setCoordinateProjection(__coordinateViews3d.raum,'parallel')`);
  await sleep(100);
  assertSphereTint(await evaluate('inspectDepthSphere()'),0);
  const modes=await evaluate(`(async()=>{
    const entry=__coordinateViews3d.raum,node=depthProbe.back.element2D.rendNode,point=depthProbe.backPoint.element2D.rendNode;
    __coord.setCoordinateViewMode(entry,'2d');
    const restored={mask:node.getAttribute('mask'),pointOpacity:Number(getComputedStyle(point).opacity||1)};
    __coord.setCoordinateViewMode(entry,'3d');entry.board.fullUpdate();entry.occlusion.beginFrame();entry.occlusion.updateMasks();
    return {restored,reapplied:await depthMaskAlpha(depthProbe.back,depthProbe.at(0,-.55,-3))};
  })()`);
  assert.ok(!modes.restored.mask&&modes.restored.pointOpacity>.99&&modes.reapplied.alpha<.9,
    '2D must restore masks/opacity, and 3D must reapply current depth: '+JSON.stringify(modes));
  console.log('PASS depth-aware line/point/surface masks, partial overlap, axis canvas, zero-opacity surfaces, camera/projection/mode switches');
  const motion=await evaluate(`(async()=>{
    const entry=__coordinateViews3d.raum,camera=depthProbe.camera,rotation=[],panning=[],depth=[];
    const rear=depthProbe.rearSurface;rear.__liaSphere3DUserVisible=true;rear.__liaDgsShowObject=true;entry.board.fullUpdate();
    const frame=()=>new Promise(requestAnimationFrame);
    const sample=async(times,action)=>{const start=performance.now();action();await frame();times.push(performance.now()-start);depth.push(entry.occlusion.lastFrameMs);};
    for(let i=1;i<=12;i++)await sample(rotation,()=>__coord.setCoordinateCamera(entry,{...camera,azimuth:camera.azimuth+i*.025}));
    __coord.setCoordinateCamera(entry,camera);
    const board=entry.board,container=board.containerObj,rect=container.getBoundingClientRect(),x=rect.left+80,y=rect.top+90;
    const event=(type,dx,dy)=>new PointerEvent(type,{bubbles:true,pointerId:73,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x+dx,clientY:y+dy});
    container.dispatchEvent(event('pointerdown',0,0));
    const initial=JSON.stringify(entry.spatialRanges);
    for(let i=1;i<=12;i++)await sample(panning,()=>window.dispatchEvent(event('pointermove',i*4,i*2)));
    const moved=JSON.stringify(entry.spatialRanges)!==initial;
    for(let i=11;i>=0;i--)await sample(panning,()=>window.dispatchEvent(event('pointermove',i*4,i*2)));
    window.dispatchEvent(event('pointerup',0,0));
    rear.__liaSphere3DUserVisible=false;rear.__liaDgsShowObject=false;board.fullUpdate();
    const stats=times=>{times.sort((a,b)=>a-b);return {medianMs:times[Math.floor(times.length/2)],maxMs:times.at(-1)};};
    return {moved,rotation:stats(rotation),panning:stats(panning),depth:stats(depth)};
  })()`);
  assert.ok(motion.moved,'Performance sample must exercise actual coordinate panning');
  console.log('3D overlapping-sphere motion timing '+JSON.stringify(motion));
  const finalSphere=await evaluate(`(()=>{
    const node=depthProbe.sphere.element2D.rendNode,style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return {display:style.display,visibility:style.visibility,opacity:Number(style.fillOpacity),width:rect.width,
      guides:depthProbe.sphere.__liaSphere3DGuideCurves.map(guide=>getComputedStyle(guide.element2D.rendNode).display)};
  })()`);
  assert.ok(finalSphere.display!=='none'&&finalSphere.visibility==='visible'&&finalSphere.opacity===.18&&finalSphere.width>100&&finalSphere.guides.every(display=>display!=='none'),
    'Sphere and its guides must remain rendered after all interaction checks: '+JSON.stringify(finalSphere));
  assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(root,'tests/browser/3d-depth.png'),Buffer.from(screenshot.data,'base64'));
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