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
const fixture = join(root, 'tests/fixtures/dynamic-3d-round.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-round3d-chrome-'));
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method + ' ' + String(params?.expression || '').slice(0, 220))), 120_000);
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
    await sleep(140);
  };
  const dragAt = async (from, to, modifiers = 0, inspectDuringDrag = null) => {
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1], modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
      x: from[0], y: from[1], clickCount: 1, modifiers });
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, modifiers,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
      if (step === 3 && inspectDuringDrag) await inspectDuringDrag();
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: to[0], y: to[1], clickCount: 1, modifiers });
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
    await sleep(180);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await evaluate(`(async()=>{for(let i=0;i<180;i++){if(Object.keys(__circle3DEntries||{}).length===3&&Object.keys(__sphere3DEntries||{}).length===3&&Object.keys(__intersection3DEntries||{}).length===1)return true;await new Promise(r=>setTimeout(r,40));}throw Error('Round3D macro timeout');})()`);

  const initial = await evaluate(`(() => {
    const circles=Object.fromEntries(Object.entries(__circle3DEntries).map(([key,e])=>{const d=__coord.coordinateCircle3DData(e.object);return [key,{definition:e.object.__liaCircle3DDefinition,radius:d?.radius,native:e.object.elType||e.object.constructor?.name,id:e.object.__liaDgsPersistentId}]}));
    const spheres=Object.fromEntries(Object.entries(__sphere3DEntries).map(([key,e])=>{const d=__coord.coordinateSphere3DData(e.object);return [key,{definition:e.object.__liaSphere3DDefinition,radius:d?.radius,native:e.object.elType||e.object.constructor?.name,id:e.object.__liaDgsPersistentId,shaded:e.object.__liaSphere3DShaded===true,gradient:(e.object.element2D||e.object)?.visProp?.gradient}]}));
    const intersection=Object.values(__intersection3DEntries)[0];
    return {circles,spheres,kinds:intersection.objects.map(o=>o.__liaDgsSpatialIntersectionKind).sort(),
      current:intersection.objects.filter(o=>o.__liaDgsSpatialIntersectionKind==='circle').map(o=>!!__coord.coordinateCircle3DData(o)),
      errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(Object.values(initial.circles).map(x=>x.definition).sort(),['center-normal-point','center-normal-radius','three-points']);
  assert.deepEqual(Object.values(initial.spheres).map(x=>x.definition).sort(),['center-point','center-radius','four-points']);
  assert.equal(initial.circles['macro-circle-radius'].radius,2);
  assert.equal(initial.spheres['macro-sphere-radius'].radius,3);
  assert.deepEqual(initial.kinds,['circle','point']);
  assert.deepEqual(initial.current,[true]);
  assert.ok(Object.values(initial.circles).every(x=>/circle/i.test(String(x.native))));
  assert.ok(Object.values(initial.spheres).every(x=>/sphere/i.test(String(x.native))));
  assert.ok(Object.values(initial.spheres).every(x=>x.shaded&&x.gradient==='radial'),JSON.stringify(initial.spheres));
  assert.deepEqual(initial.errors,[]);

  const initialVisual = await evaluate(`(() => {
    const board=__boards.raum.containerObj.getBoundingClientRect();
    const inspect=(object,name,definition)=>{const node=object?.element2D?.rendNode||object?.rendNode,rect=node?.getBoundingClientRect?.(),style=node?getComputedStyle(node):null;
      const overlap=rect?Math.max(0,Math.min(rect.right,board.right)-Math.max(rect.left,board.left))*Math.max(0,Math.min(rect.bottom,board.bottom)-Math.max(rect.top,board.top)):0;
      return {name,definition,node:!!node,path:node?.getAttribute?.('d')||'',width:rect?.width||0,height:rect?.height||0,overlap,display:style?.display,visibility:style?.visibility,opacity:Number(style?.opacity??1)};};
    return [...Object.entries(__circle3DEntries).map(([name,entry])=>inspect(entry.object,name,entry.object.__liaCircle3DDefinition)),
      ...Object.entries(__sphere3DEntries).map(([name,entry])=>inspect(entry.object,name,entry.object.__liaSphere3DDefinition)),
      ...Object.entries(__intersection3DEntries).flatMap(([name,entry])=>entry.objects.map((object,index)=>inspect(object,name+':'+index,'intersection-'+object.__liaDgsSpatialIntersectionKind)))];
  })()`);
  assert.equal(initialVisual.length,8,JSON.stringify(initialVisual));
  const roundVisible=item=>item.node&&item.width>4&&item.height>4&&item.overlap>16&&item.display!=='none'&&item.visibility!=='hidden'&&item.opacity>0;
  assert.ok(initialVisual.filter(item=>!item.definition.startsWith('intersection-')).every(roundVisible),JSON.stringify(initialVisual));
  assert.ok(initialVisual.filter(item=>item.definition.startsWith('intersection-')).some(roundVisible),JSON.stringify(initialVisual));

  const before=initial.circles['macro-circle-points'].radius;
  const moved=await evaluate(`(()=>{__coord.setCoordinatePoint3D(__points.raum.B,[-2.4,1.6,-1.8]);__boards.raum.fullUpdate();return {circle:__coord.coordinateCircle3DData(__circle3DEntries['macro-circle-points'].object).radius,sphere:__coord.coordinateSphere3DData(__sphere3DEntries['macro-sphere-point'].object).radius}})()`);
  assert.notEqual(moved.circle,before);
  assert.ok(moved.sphere>0);

  assert.equal(await evaluate(`(()=>{const A=__points.raum.A,B=__points.raum.B,C=__points.raum.C;window.savedC=[C.X(),C.Y(),C.Z()];__coord.setCoordinatePoint3D(C,[(A.X()+B.X())/2,(A.Y()+B.Y())/2,(A.Z()+B.Z())/2]);__boards.raum.fullUpdate();return __coord.coordinateCircle3DData(__circle3DEntries['macro-circle-points'].object)})()`),null);
  assert.equal(await evaluate(`(()=>{__coord.setCoordinatePoint3D(__points.raum.C,savedC);__boards.raum.fullUpdate();return !!__coord.coordinateCircle3DData(__circle3DEntries['macro-circle-points'].object)})()`),true);

  const life=await evaluate(`(async()=>{const m=document.getElementById('sphere3d-spec-macro-sphere-radius'),p=m.parentNode,n=m.nextSibling,c=m.cloneNode(true);m.remove();__scheduleBootstrapSphere3D();for(let i=0;i<80&&Object.keys(__sphere3DEntries).length!==2;i++)await new Promise(r=>setTimeout(r,25));const removed={s:Object.keys(__sphere3DEntries).length,i:Object.keys(__intersection3DEntries).length};p.insertBefore(c,n);__scheduleBootstrapSphere3D();for(let i=0;i<120&&(Object.keys(__sphere3DEntries).length!==3||Object.keys(__intersection3DEntries).length!==1);i++)await new Promise(r=>setTimeout(r,25));return {removed,restored:{s:Object.keys(__sphere3DEntries).length,i:Object.keys(__intersection3DEntries).length},errors:profileErrors.slice()}})()`);
  assert.deepEqual(life.removed,{s:2,i:0});
  assert.deepEqual(life.restored,{s:3,i:1});
  assert.deepEqual(life.errors,[]);

  await evaluate(`(()=>{const add=(id,spec)=>{const m=document.createElement('span');m.id=id;m.dataset.spec=spec;m.style.display='none';document.querySelector('#fixture section').append(m)};add('point3d-spec-round-bound-circle','raum;P;0;0;0;#ff00ff;1;on=c;angle=1.2;objectid=bound-circle-id');add('point3d-spec-round-bound-sphere','raum;Q;0;0;0;#00dfe8;1;on=T;direction=[1;2;3];objectid=bound-sphere-id');__scheduleBootstrapPoint3D()})()`);
  await evaluate(`(async()=>{for(let i=0;i<120;i++){if(__points.raum.P?.__liaPoint3DBindingSource&&__points.raum.Q?.__liaPoint3DBindingSource)return true;await new Promise(r=>setTimeout(r,30))}throw Error('Round binding timeout')})()`);
  const bindings=await evaluate(`(()=>{const P=__points.raum.P,Q=__points.raum.Q,c=__coord.coordinateCircle3DData(P.__liaPoint3DBindingSource),s=__coord.coordinateSphere3DData(Q.__liaPoint3DBindingSource);return {p:P.__liaPoint3DBindingParameters,q:Q.__liaPoint3DBindingParameters,pd:Math.hypot(P.X()-c.center[0],P.Y()-c.center[1],P.Z()-c.center[2]),pr:c.radius,qd:Math.hypot(Q.X()-s.center[0],Q.Y()-s.center[1],Q.Z()-s.center[2]),qr:s.radius}})()`);
  assert.equal(bindings.p.kind,'circle');
  assert.ok(Math.abs(bindings.p.angle-1.2)<1e-9);
  assert.equal(bindings.q.kind,'sphere');
  assert.ok(Math.abs(Math.hypot(...bindings.q.direction)-1)<1e-9);
  assert.ok(Math.abs(bindings.pd-bindings.pr)<1e-8);
  assert.ok(Math.abs(bindings.qd-bindings.qr)<1e-8);


  const activate=async part=>{const ok=await evaluate(`(()=>{const b=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.includes(${JSON.stringify(part)}));if(!b)return false;b.click();return !b.disabled&&b.getAttribute('aria-pressed')==='true'})()`);assert.equal(ok,true,'Missing tool '+part)};
  const ps=name=>evaluate(`pointScreen(${JSON.stringify(name)})`);
  const vs=()=>evaluate(`(()=>{const o=__linear3DEntries['macro-vector'].object.element2D,p=o.point1.coords.scrCoords,q=o.point2.coords.scrCoords,r=__boards.raum.containerObj.getBoundingClientRect();return [r.left+(p[1]+q[1])/2,r.top+(p[2]+q[2])/2]})()`);

  await activate('Raumkreis durch drei Punkte');for(const n of ['A','B','D'])await clickAt(await ps(n));
  await activate('Radiuspunkt');await clickAt(await ps('D'));await clickAt(await vs());await clickAt(await ps('B'));
  await activate('Kugel durch Mittelpunkt');await clickAt(await ps('D'));await clickAt(await ps('A'));
  await activate('Kugel durch vier Punkte');for(const n of ['A','B','C','D'])await clickAt(await ps(n));
  await activate('Kugel mit festem Radius');await clickAt(await ps('D'));

  const made=await evaluate(`(()=>{const e=__coordinateViews3d.raum,c=[...e.circleObjects].filter(o=>!o.__liaDgsMacroManaged&&!o.__liaDgsSpatialIntersection),s=[...e.sphereObjects].filter(o=>!o.__liaDgsMacroManaged);return {c:c.map(o=>o.__liaCircle3DDefinition).sort(),s:s.map(o=>o.__liaSphere3DDefinition).sort(),errors:profileErrors.slice()}})()`);
  assert.deepEqual(made.c,['center-normal-point','three-points']);
  assert.deepEqual(made.s,['center-point','center-radius','four-points']);
  assert.deepEqual(made.errors,[]);

  const dgsRoundVisual = await evaluate(`(() => {const board=__boards.raum.containerObj.getBoundingClientRect(),entry=__coordinateViews3d.raum,objects=[...entry.circleObjects,...entry.sphereObjects].filter(object=>!object.__liaDgsMacroManaged&&!object.__liaDgsSpatialIntersection);return objects.map(object=>{const node=object?.element2D?.rendNode||object?.rendNode,rect=node?.getBoundingClientRect?.(),style=node?getComputedStyle(node):null;return {definition:object.__liaCircle3DDefinition||object.__liaSphere3DDefinition,path:node?.getAttribute?.('d')||'',width:rect?.width||0,height:rect?.height||0,visible:!!rect&&rect.right>board.left&&rect.left<board.right&&rect.bottom>board.top&&rect.top<board.bottom&&style?.display!=='none'&&style?.visibility!=='hidden'};})})()`);
  assert.equal(dgsRoundVisual.length,5,JSON.stringify(dgsRoundVisual));
  assert.ok(dgsRoundVisual.every(item=>item.visible&&item.width>4&&item.height>4),JSON.stringify(dgsRoundVisual));
  const edited=await evaluate(`(()=>{const e=__coordinateViews3d.raum,o=[...e.sphereObjects].find(x=>!x.__liaDgsMacroManaged&&x.__liaSphere3DDefinition==='center-radius'),c=__boards.raum.containerObj,p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();const entries=[...c.querySelectorAll('.lia-dgs-object-list-entry')],entry=entries.find(x=>x.querySelector('.lia-dgs-object-list-name')?.textContent===(o.__liaDgsSphere3DName||o.__liaDgsSphereName));if(!entry)return {missing:(o.__liaDgsSphere3DName||o.__liaDgsSphereName),names:entries.map(x=>x.querySelector('.lia-dgs-object-list-name')?.textContent)};entry.click();const i=c.querySelector('.lia-dgs-round-geometry-section input[aria-label="Radius"]');i.value='2.75';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return {disabled:i.disabled,radius:__coord.coordinateSphere3DData(o).radius}})()`);
  assert.equal(edited.missing,undefined,JSON.stringify(edited));

  assert.ok(Math.abs(edited.radius-2.75)<1e-9,JSON.stringify(edited));

  const roundHistory=async kind=>{const ok=await evaluate(`(()=>{const s=Object.values(__liaRegressionStates).find(x=>x.boardId==='raum'),b=KIND==='undo'?s.undoButton:s.redoButton;if(!b)return false;b.click();return true})()`.replace('KIND',JSON.stringify(kind)));assert.equal(ok,true);await sleep(420)};
  const fixedRadius=()=>evaluate(`(()=>{const o=[...__coordinateViews3d.raum.sphereObjects].find(x=>!x.__liaDgsMacroManaged&&x.__liaSphere3DDefinition==='center-radius');return __coord.coordinateSphere3DData(o)?.radius})()`);
  await roundHistory('undo');
  const radiusUndo=await fixedRadius();
  assert.ok(Number.isFinite(radiusUndo)&&Math.abs(radiusUndo-2.75)>1e-9,JSON.stringify({radiusUndo}));
  await roundHistory('redo');
  assert.ok(Math.abs((await fixedRadius())-2.75)<1e-9);

  const beforeSourceDelete=await evaluate(`(()=>{const e=__coordinateViews3d.raum;return {c:[...e.circleObjects].filter(o=>!o.__liaDgsMacroManaged&&!o.__liaDgsSpatialIntersection).length,s:[...e.sphereObjects].filter(o=>!o.__liaDgsMacroManaged).length}})()`);
  await clickAt(await ps('D'),'right');
  const sourceDelete=await evaluate(`(()=>{const c=__boards.raum.containerObj,b=c.querySelector('.lia-dgs-delete-button');if(!b)return {missing:true};b.click();b.click();const e=__coordinateViews3d.raum;return {point:!!__points.raum.D,c:[...e.circleObjects].filter(o=>!o.__liaDgsMacroManaged&&!o.__liaDgsSpatialIntersection).length,s:[...e.sphereObjects].filter(o=>!o.__liaDgsMacroManaged).length}})()`);
  assert.equal(sourceDelete.missing,undefined,JSON.stringify(sourceDelete));
  assert.equal(sourceDelete.point,false,JSON.stringify(sourceDelete));
  assert.ok(sourceDelete.c<beforeSourceDelete.c&&sourceDelete.s<beforeSourceDelete.s,JSON.stringify({beforeSourceDelete,sourceDelete}));
  await roundHistory('undo');
  const sourceRestored=await evaluate(`(()=>{const e=__coordinateViews3d.raum;return {point:!!__points.raum.D?.__liaPoint3D,c:[...e.circleObjects].filter(o=>!o.__liaDgsMacroManaged&&!o.__liaDgsSpatialIntersection).length,s:[...e.sphereObjects].filter(o=>!o.__liaDgsMacroManaged).length}})()`);
  assert.deepEqual(sourceRestored,{point:true,...beforeSourceDelete});

  const toggles=await evaluate(`(()=>{const c=__boards.raum.containerObj,e=__coordinateViews3d.raum;
    const spheres=()=>[...e.sphereObjects];
    const proxies=()=>spheres().map(sphere=>sphere.element2D||sphere).filter(Boolean);
    c.querySelector('[aria-label="2D-Ansicht"]').click();
    const hidden2D=proxies().every(proxy=>proxy.visPropCalc?.visible===false);
    c.querySelector('[aria-label="3D-Ansicht"]').click();
    const restored=proxies(),visible3D=restored.length>0&&restored.every(proxy=>proxy.visPropCalc?.visible!==false);
    for(let i=0;i<20;i++){c.querySelector('[aria-label="2D-Ansicht"]').click();c.querySelector('[aria-label="3D-Ansicht"]').click()}
    for(const camera of [{azimuth:0,elevation:Math.PI/2,bank:0},{azimuth:Math.PI/2,elevation:0,bank:0},{azimuth:0,elevation:0,bank:0},e.config.camera])__coord.setCoordinateCamera(e,camera);
    __coord.setCoordinateProjection(e,'central');
    return {projection:e.projection,controls:c.querySelectorAll('.lia-coordinate-3d-controls').length,hidden2D,visible3D,errors:profileErrors.slice()}})()`);
  assert.deepEqual(toggles,{projection:'central',controls:1,hidden2D:true,visible3D:true,errors:[]});

  const exported=await evaluate(`(()=>{const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-side-menu-close')?.click();const p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value})()`);
  for(const m of ['Kreis3D','KreisMittelpunktNormal3D','KreisMittelpunktNormalPunkt3D','Kugel3D','KugelRadius3D','KugelVierPunkte3D','Schnitt3D'])assert.match(exported,new RegExp('@'+m+'\\('));
  assert.match(exported,/auf=c;angle=/);
  assert.match(exported,/auf=T;direction=\[[^\]]+\]/);
  assert.match(exported,/radius=2\.75/);

  const roundtripSetup=await evaluate(`(()=>{const block=${JSON.stringify(exported)},lines=block.split(/\\r?\\n/),tick=String.fromCharCode(96),value=line=>line.slice(line.indexOf(tick)+1,line.lastIndexOf(tick)),pick=names=>lines.filter(line=>names.some(name=>line.startsWith('@'+name+'('))).map(line=>({macro:line.slice(1,line.indexOf('(')),spec:value(line)}));
    const coordinate=value(lines.find(line=>line.startsWith('@Koordinatensystem(')||line.startsWith('@CoordinateSystem('))),id=(coordinate.match(/(?:^|;)id=([^;]+)/i)||[])[1];
    const points=pick(['Punkt3D','Point3D']),vectors=pick(['Vektor3D','Vector3D']),planes=pick(['Ebene3D','Plane3D','PunktNormalenEbene3D','PlanePointNormal3D','ParameterEbene3D','PlanePointVectors3D']);
    const circles=pick(['Kreis3D','Circle3D','KreisMittelpunktNormal3D','CircleCenterNormal3D','KreisMittelpunktNormalPunkt3D','CircleCenterNormalPoint3D']);
    const spheres=pick(['Kugel3D','Sphere3D','KugelRadius3D','SphereRadius3D','KugelVierPunkte3D','SphereFourPoints3D']),intersections=pick(['Schnitt3D','Intersection3D']);
    const section=document.createElement('section');section.className='roundtrip-round3d';section.style.width='760px';const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='roundtrip-round3d';host.dataset.spec=coordinate;section.append(host);
    const add=(prefix,item,index,extra={})=>{const m=document.createElement('span');m.id=prefix+'roundtrip-'+index;m.dataset.spec=item.spec;m.dataset.language='de';Object.assign(m.dataset,extra);m.style.display='none';section.append(m)};
    points.forEach((item,i)=>add('point3d-spec-',item,i));vectors.forEach((item,i)=>add('linear3d-spec-',item,i,{kind:'vector'}));
    planes.forEach((item,i)=>add('plane3d-spec-',item,i,{definition:/PunktNormalen|PointNormal/.test(item.macro)?'point-normal':(/Parameter|PointVectors/.test(item.macro)?'point-vectors':'three-points')}));
    circles.forEach((item,i)=>add('circle3d-spec-',item,i,{definition:/NormalPunkt|NormalPoint/.test(item.macro)?'center-normal-point':(/MittelpunktNormal|CenterNormal/.test(item.macro)?'center-normal-radius':'three-points')}));
    spheres.forEach((item,i)=>add('sphere3d-spec-',item,i,{definition:/VierPunkte|FourPoints/.test(item.macro)?'four-points':(/Radius/.test(item.macro)?'center-radius':'center-point')}));
    intersections.forEach((item,i)=>add('intersection3d-spec-',item,i));const d=document.createElement('div');d.id='dgs-ui-roundtrip-round3d';d.dataset.spec=id;d.dataset.language='de';section.append(d);document.querySelector('#fixture').append(section);
    window.round3dRoundtrip={id,section,host,coordinate,counts:{points:points.length,vectors:vectors.length,planes:planes.length,circles:circles.length,spheres:spheres.length,intersections:intersections.length}};return {id,...round3dRoundtrip.counts};})()`);
  assert.ok(roundtripSetup.circles>=5&&roundtripSetup.spheres>=6&&roundtripSetup.intersections>=1,JSON.stringify(roundtripSetup));
  await sleep(15_000);
  const roundtripReady=await evaluate(`(()=>{const x=round3dRoundtrip,e=__coordinateViews3d?.[x.id],
    c=Object.values(__circle3DEntries||{}).filter(v=>v.boardId===x.id).length,
    s=Object.values(__sphere3DEntries||{}).filter(v=>v.boardId===x.id).length,
    n=Object.values(__intersection3DEntries||{}).filter(v=>v.boardId===x.id).length;
    return {ready:!!__boards?.[x.id]&&!!e&&c===x.counts.circles&&s===x.counts.spheres&&n===x.counts.intersections&&
      !!__boards[x.id].containerObj.querySelector('.lia-dgs-object-list-export'),c,s,n,expected:x.counts,
      points:Object.keys(__points?.[x.id]||{}).length,errors:profileErrors.slice()}})()`);
  assert.equal(roundtripReady.ready,true,JSON.stringify(roundtripReady));
  const importedRound=await evaluate(`(()=>{const x=round3dRoundtrip,c=Object.values(__circle3DEntries).filter(v=>v.boardId===x.id),s=Object.values(__sphere3DEntries).filter(v=>v.boardId===x.id),i=Object.values(__intersection3DEntries).filter(v=>v.boardId===x.id),bindings=Object.values(__points[x.id]||{}).map(p=>p.__liaPoint3DBindingParameters?.kind).filter(Boolean);return {c:c.map(v=>v.object.__liaCircle3DDefinition).sort(),s:s.map(v=>v.object.__liaSphere3DDefinition).sort(),i:i.length,bindings,errors:profileErrors.slice()}})()`);
  assert.equal(importedRound.c.length,roundtripSetup.circles);assert.equal(importedRound.s.length,roundtripSetup.spheres);assert.equal(importedRound.i,roundtripSetup.intersections);
  for(const definition of ['three-points','center-normal-radius','center-normal-point'])assert.ok(importedRound.c.includes(definition),JSON.stringify(importedRound));
  for(const definition of ['center-point','center-radius','four-points'])assert.ok(importedRound.s.includes(definition),JSON.stringify(importedRound));
  assert.ok(importedRound.bindings.includes('circle')&&importedRound.bindings.includes('sphere'),JSON.stringify(importedRound));assert.deepEqual(importedRound.errors,[]);
  const reexported=await evaluate(`(()=>{const c=__boards[round3dRoundtrip.id].containerObj,p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value})()`);
  const semanticRound=block=>{const names=new Set(['Kreis3D','Circle3D','KreisMittelpunktNormal3D','CircleCenterNormal3D','KreisMittelpunktNormalPunkt3D','CircleCenterNormalPoint3D','Kugel3D','Sphere3D','KugelRadius3D','SphereRadius3D','KugelVierPunkte3D','SphereFourPoints3D','Schnitt3D','Intersection3D']);return block.split(/\r?\n/).filter(line=>names.has(line.slice(1,line.indexOf('(')))).map(line=>{const tick=line.indexOf(String.fromCharCode(96)),separator=line.indexOf(';',tick);return line.slice(0,tick+1)+line.slice(separator+1)}).sort()};
  assert.deepEqual(semanticRound(reexported),semanticRound(exported));

  console.log('PASS spatial circles/spheres: macros, five DGS tools, bindings, intersections, properties, export, views, degeneracy, lifecycle');

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
