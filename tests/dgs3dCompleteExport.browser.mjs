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
const extraMarkers = [
  '<span id="analytic3d-spec-complete-angle" data-operation="angle-lines" data-spec="raum;alpha;vx;vy;visual=1;objectid=complete-angle"></span>',
  '<span id="circle3d-spec-complete-circle" data-definition="three-points" data-spec="raum;k;O;X;Y;objectid=complete-circle"></span>',
  '<span id="sphere3d-spec-complete-sphere" data-definition="center-point" data-spec="raum;S;O;X;objectid=complete-sphere"></span>',
  '<span id="curve3d-spec-complete-curve" data-spec="raum;c;t;cos(t);sin(t);t/3;-3;3;quality=40;objectid=complete-curve"></span>',
  '<span id="surface3d-spec-complete-surface" data-function-graph="true" data-spec="raum;surface;u*u-v*v;-1;1;-1;1;quality=8;objectid=complete-surface"></span>',
  '<span id="analytic3d-spec-complete-sum" data-operation="vector-add" data-spec="raum;sum;vx;vy;objectid=complete-sum"></span>',
  '<span id="analytic3d-spec-complete-tangent" data-operation="curve-tangent" data-spec="raum;tc;c;t=0.5;objectid=complete-tangent"></span>'
].join('');
let fixture = readFileSync(join(root, 'tests/fixtures/dynamic-3d-solid-export.html'),'utf8')
  .replace('<div id="dgs-ui-segment-5-3d"',extraMarkers+'<div id="dgs-ui-segment-5-3d"');

  // Existing solid fixture supplies construction syntax; retain a small scene for fast round trips.
  const fixtureIds = new Set([
    'o','x','y','z','apex','vx','vy','vz','axis','half','base','tetra','cylinder',
    'translate','rotate','dilate','bound-polygon','bound-solid',
    'complete-circle','complete-sphere','complete-curve','complete-surface',
    'complete-sum','complete-tangent','complete-angle'
  ]);
  fixture = fixture.replace('raum;H;H0;H1;H2;','raum;H;O;X;Y;')
    .replace('raum;F0;O;X;XY;Y;','raum;F0;O;X;Y;')
    .replace('raum;K2;K;O;','raum;K2;X;O;')
    .replace(/<span[^>]+id="[^"]+-spec-([^"]+)"[\s\S]*?<\/span>/g,
      (tag, uid) => fixtureIds.has(uid) ? tag : '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://localhost').pathname;
  const file = requestPath === '/bundle.js' ? bundle : requestPath.startsWith('/assets/')
    ? join(assets, requestPath.slice(8)) : fixture;
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(file === fixture ? fixture : readFileSync(file));
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

  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-complete-export-chrome-'));
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 300000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).catch(error=>{error.message+=' ('+expression.slice(0,140)+')';throw error;});
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  events.set('Runtime.consoleAPICalled',[event=>{if(/^Import:/.test(event.args[0]?.value||''))console.log(...event.args.map(arg=>arg.value??arg.description));}]);
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await Promise.race([loaded,sleep(5000)]);
  console.log('Export test page navigated');

  await evaluate("(async()=>{for(let i=0;i<240;i++){if(__boards?.raum&&__points?.raum?.BK&&__analytic3DEntries?.['complete-tangent']&&__solid3DEntries?.['solid:cylinder'])return;await new Promise(r=>setTimeout(r,25))}throw Error('Source timeout '+JSON.stringify({errors:profileErrors,points:Object.keys(__points?.raum||{}),solids:Object.keys(__solid3DEntries||{}),analytic:Object.keys(__analytic3DEntries||{}),curves:Object.keys(__curve3DEntries||{})}))})()");
  console.log('Export test source ready');


  await evaluate(`(async()=>{
    for(let i=0;i<240&&!__analytic3DEntries?.['complete-tangent'];i++)await new Promise(r=>setTimeout(r,25));
    window.completeObjects=id=>{
      const e=__coordinateViews3d[id], found=new Set();
      for(const key of ['points','linearObjects','planeObjects','circleObjects','sphereObjects','polygonObjects','solidObjects','curveObjects','surfaceObjects'])
        for(const object of e[key]||[])found.add(object);
      for(const name of ['__analytic3DEntries','__transformation3DEntries','__intersection3DEntries'])
        for(const entry of Object.values(window[name]||{}))if(entry.boardId===id||entry.board===e.board)found.add(entry.object);
      return [...found].filter(Boolean);
    };
    window.completeSnapshot=id=>{
      const e=__coordinateViews3d[id],items={};
      for(const object of completeObjects(id)){
        const key=object.__liaDgsPersistentId;if(!key)continue;
        let kind,data;
        if(object.__liaPoint3D){kind='point';data=[object.X(),object.Y(),object.Z()];}
        else if(object.__liaSolid3D){kind='solid';data=__coord.coordinateSolid3DData(object);}
        else if(object.__liaPolygon3D){kind='polygon';data=__coord.coordinatePolygon3DData(object);}
        else if(object.__liaPlane3D){kind='plane';data=__coord.coordinatePlane3DData(object);}
        else if(object.__liaCircle3D){kind='circle';data=__coord.coordinateCircle3DData(object);}
        else if(object.__liaSphere3D){kind='sphere';data=__coord.coordinateSphere3DData(object);}
        else if(object.__liaLinear3D){kind='linear';data=__coord.coordinateLinear3DData(object);}
        else if(object.__liaCurve3D){kind='curve';const d=__coord.coordinateCurve3DData(object);data=d?{point:d.evaluate(.5),range:d.range}:null;}
        else if(object.__liaSurface3D){kind='surface';const d=__coord.coordinateSurface3DData(object);data=d?{point:d.evaluate(.25,.5),u:d.uRange,v:d.vRange}:null;}
        else continue;
        items[key]={kind,data,style:{line:object.__liaDgsLineColor,text:object.__liaDgsTextColor,
          opacity:object.__liaDgsOpacity,width:object.__liaDgsSegmentStrokeWidth,font:object.__liaDgsFormatFontSize,
          fixed:object.__liaDgsFixed,visible:object.__liaDgsShowObject,showName:object.__liaDgsShowName,layer:object.__liaDgsLayer,lineStyle:object.__liaDgsLineStyle}};
      }
      return {items,viewport:e.spatialRanges,box:e.view.bbox3D,camera:e.camera,projection:e.projection};
    };
    for(const key of ['half-plane','cylinder','complete-sphere','complete-curve','complete-surface']){
      const object=completeObjects('raum').find(o=>o.__liaDgsPersistentId===key);if(!object)throw Error('Missing source '+key);
      __applyDgsObjectExportFormat('raum',object,{lineColor:'#cc3300',textColor:'#123456',opacity:.37,fontSize:27,strokeWidth:4.5,fixed:true,layer:9,showName:false,lineStyle:'dashed'});
    }
    __coord.setCoordinatePoint3D(__points.raum.A,[1.25,.75,3.5]);
    __coord.setCoordinateCamera('raum',{azimuth:1.13,elevation:-.6,bank:.4});
    __boards.raum.fullUpdate();
  })()`);
  console.log('Source camera and point edit applied');
  const bounds=await evaluate("(()=>{const r=__boards.raum.containerObj.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:bounds.x,y:bounds.y,deltaX:0,deltaY:180});
  await sleep(350);
  const before=await evaluate("completeSnapshot('raum')");
  const localOnlyKeys=['complete-angle','complete-curve','complete-surface','complete-sum','complete-tangent'];
  const exportedKeys=Object.keys(before.items).filter(key=>!localOnlyKeys.includes(key));
  assert.ok(Object.keys(before.items).length>=20,'Expected a populated source scene');
  assert.notDeepEqual(before.viewport,[[-5,6],[-5,6],[-4,6]],'The real wheel gesture must change the viewport');
  for(const key of ['half-plane','cylinder','complete-sphere','complete-curve','complete-surface']){
    assert.equal(before.items[key].style.line,'#cc3300','Edited source color did not stick: '+key);
    assert.equal(before.items[key].style.opacity,.37,'Edited source opacity did not stick: '+key);
  }
  const exported=await evaluate(`(()=>{
    const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-side-menu-close')?.click();
    if(!c.querySelector('.lia-dgs-object-list-panel').classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();
    c.querySelector('.lia-dgs-object-list-export').click();
    const tools=[...c.querySelectorAll('.lia-dgs-export-tool')],keep=new Set([200,651]);
    if(tools.some(b=>Number(b.dataset.toolId)>=1200&&Number(b.dataset.toolId)<=1244))throw Error('Local-only tools leaked into export');
    for(const b of tools)if((b.dataset.enabled==='1')!==keep.has(Number(b.dataset.toolId)))b.click();
    c.querySelector('.lia-dgs-export-mode-option input[value="3d"]').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
    return c.querySelector('.lia-dgs-export-textarea').value;
  })()`);
  assert.ok(exported.includes('tools=[200;651]'),'Only normal tool allowlist must be exported');
  assert.ok(!/Raumkurve|Flaeche3D|Vektorsumme3D|TangenteRaumkurve|Geradenwinkel3D/.test(exported),
    'Local-only constructions must not be exported');
  assert.ok(exported.includes('viewport3d=['),'Viewport must be exported');
  console.log('Importing exported macros');
  const importResult=await evaluate(`(async()=>{
    const text=${JSON.stringify(exported)},tick=String.fromCharCode(96);
    const rows=text.split(String.fromCharCode(10)).map(line=>{
      const value=line.trim(),open=value.indexOf('('+tick),close=value.lastIndexOf(tick+')');
      return value.startsWith('@')&&open>1&&close>open?{macro:value.slice(1,open),spec:value.slice(open+2,close)}:null;
    }).filter(Boolean);
    const coordinate=rows.find(r=>['CoordinateSystem','Koordinatensystem'].includes(r.macro));
    const id=coordinate?.spec.match(/(?:^|;)id=([^;]+)/)?.[1];if(!id||id==='raum')throw Error('Missing fresh board id');
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='complete-roundtrip';host.dataset.spec=coordinate.spec;
    const section=document.createElement('section');section.className='flex-child';section.append(host);document.body.append(section);host.scrollIntoView({block:'start'});
    for(let i=0;i<240&&!__boards?.[id];i++)await new Promise(r=>setTimeout(r,25));
    if(!__boards?.[id])throw Error('Import board did not initialize');
    console.log('Import: board ready',id);
    const definitions={
      Punkt3D:['point3d'],Strecke3D:['linear3d','segment'],Strahl3D:['linear3d','ray'],Gerade3D:['linear3d','line'],Vektor3D:['linear3d','vector'],
      Ebene3D:['plane3d','three-points'],PunktNormalenEbene3D:['plane3d','point-normal'],ParameterEbene3D:['plane3d','point-vectors'],
      Kreis3D:['circle3d','three-points'],Normalenkreis3D:['circle3d','center-normal-point'],
      Kugel3D:['sphere3d','center-point'],Vierpunktkugel3D:['sphere3d','four-points'],Radiuskugel3D:['sphere3d','center-radius'],
      Vieleck3D:['polygon3d'],Tetraeder3D:['solid3d','tetrahedron'],Pyramide3D:['solid3d','pyramid'],Prisma3D:['solid3d','prism'],
      Spat3D:['solid3d','parallelepiped'],Quader3D:['solid3d','cuboid'],Zylinder3D:['solid3d','cylinder'],Kegel3D:['solid3d','cone'],
      Verschiebung3D:['transformation3d','translate'],Punktspiegelung3D:['transformation3d','reflect-point'],
      Geradenspiegelung3D:['transformation3d','reflect-line'],Ebenenspiegelung3D:['transformation3d','reflect-plane'],
      Achsendrehung3D:['transformation3d','rotate-axis'],ZentrischeStreckung3D:['transformation3d','dilate'],
      Schnitt3D:['intersection3d'],Raumkurve:['curve3d'],Flaeche3D:['surface3d'],Funktionsflaeche3D:['surface3d','function'],
      Vektorsumme3D:['analytic3d','vector-add'],TangenteRaumkurve:['analytic3d','curve-tangent'],
      Geradenwinkel3D:['analytic3d','angle-lines'],ObjektFormat:['object-format'],ObjectFormat:['object-format']
    };
    const unexpected=[];let index=0,dgsSpec;
    for(const row of rows){
      if(row===coordinate)continue;
      if(row.macro==='DGS'){dgsSpec=row.spec;continue;}
      const info=definitions[row.macro];if(!info){unexpected.push(row.macro);continue;}
      const marker=document.createElement('span');marker.id=info[0]+'-spec-complete-fresh-'+index++;marker.dataset.spec=row.spec;marker.dataset.language='de';marker.hidden=true;
      if(info[0]==='linear3d')marker.dataset.kind=info[1];
      else if(info[0]==='analytic3d')marker.dataset.operation=info[1];
      else if(info[0]==='surface3d')marker.dataset.functionGraph=String(info[1]==='function');
      else if(info[1])marker.dataset.definition=info[1];
      section.append(marker);
    }
    if(unexpected.length)throw Error('Unhandled macros '+unexpected.join(','));
    console.log('Import: marker rows queued',index);
    const expected=${JSON.stringify(exportedKeys)};let missing=[];
    for(let i=0;i<400;i++){
      const found=completeSnapshot(id).items;missing=expected.filter(key=>!found[key]);
      if(!missing.length)break;
      await new Promise(r=>setTimeout(r,25));
    }
    console.log('Import: geometry ready',missing);
    if(dgsSpec){const marker=document.createElement('div');marker.id='dgs-ui-complete-import';marker.dataset.spec=dgsSpec;marker.dataset.language='de';section.append(marker);__setupDGS('complete-import',dgsSpec,'de');}
    console.log('Import: DGS ready');
    await new Promise(r=>setTimeout(r,700));window.completeImportedId=id;
    return {id,missing,snapshot:completeSnapshot(id),errors:profileErrors.slice()};
  })()`);
  console.log('Imported macros initialized');
  assert.deepEqual(importResult.missing,[],'Every original object must exist after import');
  assert.deepEqual(importResult.errors,[],'No browser errors during import');
  const canonical=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v));
  for(const key of exportedKeys){const original=before.items[key];
    assert.deepEqual(canonical(importResult.snapshot.items[key].data),canonical(original.data),'Geometry changed: '+key);
  }
  for(const key of ['half-plane','cylinder','complete-sphere'])
    for(const property of ['line','text','opacity','width','font','fixed','layer','showName','lineStyle'])
      assert.deepEqual(importResult.snapshot.items[key].style[property],before.items[key].style[property],'Style '+property+' changed: '+key);
  assert.deepEqual(canonical(importResult.snapshot.viewport),canonical(before.viewport),'Viewport changed');
  assert.deepEqual(canonical(importResult.snapshot.box),canonical(before.box),'Render box changed');
  assert.deepEqual(canonical(importResult.snapshot.camera),canonical(before.camera),'Camera changed');
  assert.equal(importResult.snapshot.projection,before.projection);

  console.log('Checking repeated bootstraps');
  // Re-running macro discovery must not overwrite the user's restored appearance.
  await evaluate("(()=>{for(const key of ['__bootstrapLinear3D','__bootstrapPlane3D','__bootstrapSolid3D','__bootstrapTransformation3D','__bootstrapIntersection3D'])window[key]?.();})()");
  const stable = await evaluate("completeSnapshot(completeImportedId)");
  for (const key of ['half-plane','cylinder','complete-sphere'])
    assert.deepEqual(stable.items[key].style,importResult.snapshot.items[key].style,'Bootstrap reset imported style: '+key);
  console.log('Checking live dependencies');
  const dynamic = await evaluate(`(()=>{
    const id=completeImportedId,source=completeSnapshot('raum'),fresh=completeSnapshot(id);
    const change=boardId=>{__coord.setCoordinatePoint3D(__points[boardId].X,[2,.7,.3]);__boards[boardId].update();};
    change('raum');change(id);
    const angle=completeObjects(id).find(o=>o.__liaDgsPersistentId==='complete-angle');
    const r=angle?.element2D?.rendNode?.getBoundingClientRect?.();
    return {sourceBefore:source,freshBefore:fresh,sourceAfter:completeSnapshot('raum'),freshAfter:completeSnapshot(id),
      visualAngle:!!angle?.__liaDgsAngle3D,helpers:angle?.__liaDgsAngle3DHelpers?.length,
      angleVisible:!!r&&Math.max(r.width,r.height)>2,
      analyticCounts:Object.values(__analytic3DEntries||{}).filter(e=>e.boardId===id).map(e=>e.object?.__liaDgsPersistentId)};
  })()`);
  assert.equal(dynamic.visualAngle,false,'Local-only spatial angle must stay out of imported exports');
  for (const key of ['tr-rotate','tr-dilate']) {
    assert.notDeepEqual(canonical(dynamic.freshAfter.items[key].data),canonical(dynamic.freshBefore.items[key].data),
      'Imported construction did not follow its source: '+key);
    assert.deepEqual(canonical(dynamic.freshAfter.items[key].data),canonical(dynamic.sourceAfter.items[key].data),
      'Imported dependency differs from source: '+key);
  }
  assert.deepEqual(dynamic.analyticCounts,[],'Local-only analytic outputs must stay out of imported exports');

  console.log('Checking imported tool availability');
  const availability=await evaluate(`(()=>{
    const id=completeImportedId,c=__boards[id].containerObj,uiRoot=c.getRootNode();
    const allowed=__boards[id].__liaDgsAvailableToolIds,submenu=uiRoot.getElementById('dgs-segment6-submenu-'+id);
    const count=()=>Object.values(__analytic3DEntries||{}).filter(e=>e.boardId===id).length;
    if(!submenu)throw Error('Missing advanced submenu for '+id);
    return {normal:[651,652].map(toolId=>{const b=[...uiRoot.querySelectorAll('.lia-dgs-geometry-tool')].find(item=>item.dataset.dgsToolId===String(toolId));return {id:toolId,exists:!!b,hidden:b?.hidden,disabled:b?.disabled}}),
      allowed:allowed?[...allowed]:null,groups:[],operations:[],previous:count(),after:count(),
      advancedHidden:c.querySelector('.lia-dgs-segment6-button').hidden,
      mode:__coordinateViews3d[id].viewMode,errors:profileErrors.slice()};
    const actions=[...submenu.querySelectorAll('.lia-dgs-segment6-action')].filter(b=>!b.hidden&&!b.disabled);
    const normal=[651,652].map(toolId=>{const b=uiRoot.querySelector('.lia-dgs-geometry-tool[data-dgs-tool-id="'+toolId+'"]');return {id:toolId,exists:!!b,hidden:b?.hidden,disabled:b?.disabled}});
    const vector=submenu.querySelector('[data-dgs-advanced-group="vector"]');if(!vector)throw Error('Missing advanced vector action');vector.click();
    const form=uiRoot.querySelector('.lia-dgs-segment6-dialog form'),select=form?.querySelector('[name="operation"]');if(!select)throw Error('Missing vector selector');
    const operations=[...select.options].map(o=>o.value),option=document.createElement('option');option.value='vector-subtract';option.textContent='blocked';select.append(option);select.value='vector-subtract';
    form.querySelector('[name="name"]').value='forbiddenSubtract';
    form.querySelector('[name="source1"]').value='vx';form.querySelector('[name="source2"]').value='vy';
    const previous=count();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    return {normal,allowed:allowed?[...allowed]:null,groups:actions.map(b=>b.dataset.dgsAdvancedGroup),operations,previous,after:count(),mode:__coordinateViews3d[id].viewMode,errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(availability.allowed.sort((a,b)=>a-b),[200,651]);
  assert.deepEqual(availability.normal,[{id:651,exists:true,hidden:false,disabled:false},{id:652,exists:true,hidden:true,disabled:true}]);
  assert.equal(availability.advancedHidden,true,'Local-only advanced tools must stay hidden after import');
  assert.deepEqual(availability.groups,[],'No advanced groups may be exported');
  assert.deepEqual(availability.operations,[],'No advanced operations may be exported');
  assert.equal(availability.after,availability.previous,'Tampered disabled operation must not create geometry');
  assert.equal(availability.mode,'3d');assert.deepEqual(availability.errors,[]);
  console.log('PASS complete 3D export/import: geometry, edited appearance, viewport, camera and tool restrictions');
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
