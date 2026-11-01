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
const fixture = join(root, 'tests/fixtures/dynamic-3d-surface-draw.html');
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

  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-surface-draw-chrome-'));
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

  const selectedConstructionColor = '#0055ff';
  const colorChoice = await evaluate(`(()=>{
    const container=__boards.raum.containerObj;
    const button=container.querySelector('.lia-dgs-construction-color-button');
    if(!button||button.hidden)throw Error('Missing visible 3D construction color button');
    if(button.previousElementSibling?.classList.contains('lia-dgs-select-button')!==true)throw Error('Color button must follow the select button');
    button.click();
    const menu=container.querySelector('.lia-dgs-construction-color-menu');
    const swatches=[...menu.querySelectorAll('.lia-dgs-construction-color-item')];
    const item=swatches.find(entry=>entry.dataset.color==='${selectedConstructionColor}');
    if(!item)throw Error('Missing requested 3D construction color');
    const opened=button.getAttribute('aria-expanded');
    item.click();
    const result={opened,count:swatches.length,active:item.dataset.active,
      selected:getComputedStyle(button).getPropertyValue('--lia-dgs-construction-color').trim()};
    button.click();
    return result;
  })()`);
  assert.deepEqual(colorChoice,{opened:'true',count:10,active:'1',selected:selectedConstructionColor});

  const clickAt=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p[0],y:p[1]});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:p[0],y:p[1],clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:p[0],y:p[1],clickCount:1});await sleep(80);};
  const buttonCenter=expression=>evaluate("(()=>{const b="+expression+";if(!b)throw Error('Missing button');b.scrollIntoView({block:'nearest',inline:'nearest'});const r=b.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]})()");
  const container='__boards.raum.containerObj';
  const toolFor=kind=>"[..."+container+".querySelectorAll('.lia-dgs-geometry-tool')].find(b=>b.textContent.trim()==="+JSON.stringify(kind==='circle'?'Raumkreis durch drei Punkte':'Raumvieleck')+")";
  const closePanels=()=>evaluate(container+".querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click())");
  let polygonMenuSaved=false;
  const activate=async(kind)=>{
    await closePanels();
    const tool=toolFor(kind);
    if(await evaluate("("+tool+").getAttribute('aria-pressed')")==='true')return;
    if(await evaluate(container+".querySelector('.lia-dgs-menu-button').getAttribute('aria-expanded')!=='true'")){
      await clickAt(await buttonCenter(container+".querySelector('.lia-dgs-menu-button')"));await sleep(150);
    }
    const parent=container+".querySelector("+JSON.stringify(kind==='circle'?'.lia-dgs-round2d-button':'.lia-dgs-polygon-button')+")";
    if(await evaluate("("+parent+").getAttribute('aria-expanded')!=='true'"))await clickAt(await buttonCenter(parent));
    if(kind==='polygon'){
      assert.equal(await evaluate(container+".querySelector('.lia-dgs-polygon3d-sides')"),null,'Spatial polygon must not offer a predefined vertex count');
      assert.equal(await evaluate(container+".querySelector('.lia-dgs-polygon3d-draw-options')"),null,'Spatial polygon must not show drag options');
      if(!polygonMenuSaved){
        const screenshot=await send('Page.captureScreenshot',{format:'png'});
        writeFileSync(join(tmpdir(),'lia-coordinate-surface-polygon-menu.png'),Buffer.from(screenshot.data,'base64'));
        polygonMenuSaved=true;
      }
    }
    await clickAt(await buttonCenter(tool));
    assert.equal(await evaluate("("+tool+").getAttribute('aria-pressed')"),'true','Missing active '+kind+' tool');
  };
  const state=()=>evaluate('drawState()');
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(100);};
  const down=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p[0],y:p[1]});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:p[0],y:p[1],clickCount:1});};
  const move=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:p[0],y:p[1]});await sleep(90);};
  const up=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:p[0],y:p[1],clickCount:1});await sleep(180);};
  const history=async direction=>{await clickAt(await buttonCenter("Object.values(__liaRegressionStates).find(s=>s.boardId==='raum')."+direction+"Button"));await sleep(140);};
  const anchor=()=>evaluate("(()=>{const r=__boards.raum.containerObj.getBoundingClientRect();return[r.left+r.width*.40,r.top+r.height*.52]})()");
  const near=(a,b,tolerance=1e-6)=>Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
  const clean=(actual,expected,message)=>assert.deepEqual(actual.counts,expected.counts,message+': '+JSON.stringify(actual.counts));
  const assertFilled=(surface,message)=>{
    assert.ok(surface.visible&&surface.pathLength>20,message+': geometry must visibly render '+JSON.stringify(surface));
    assert.ok(surface.fill&&surface.fill!=='none'&&surface.fill!=='transparent',message+': missing fill '+JSON.stringify(surface));
    assert.ok(surface.opacity>0&&surface.opacity<1,message+': fill must remain transparent '+JSON.stringify(surface));
    assert.equal(surface.line.toLowerCase(),surface.fill.toLowerCase(),message+': contour and fill must use the same color');
    assert.equal(surface.line.toLowerCase(),selectedConstructionColor,message+': surface must use the preselected 3D construction color');
    if(surface.kind==='circle'){assert.equal(surface.advancedPlot,false,message+': circle must use bounded sampling');assert.ok(surface.sampleCount>0&&surface.sampleCount<=256,message+': circle sample budget exceeded '+surface.sampleCount);}
    if(surface.kind==='polygon')assert.ok(surface.borders.length===surface.vertices.length&&surface.borders.every(b=>b.line===surface.line&&b.width>=1.5),message+': all polygon borders must match the contour style '+JSON.stringify(surface.borders));
  };
  const assertGeometry=(surface,kind,sides)=>{
    assert.ok(surface.area>0,'A surface must have positive area');
    if(kind==='circle'){assert.ok(surface.radius>0);return;}
    assert.equal(surface.vertices.length,sides,'Polygon must have exactly n vertices');
    assert.ok(surface.vertices.every(p=>near(p[2],surface.vertices[0][2])),'Drawn polygon must be planar');
  };
  const exportConstruction=()=>evaluate("(()=>{const c=__boards.raum.containerObj;c.querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click());const panel=c.querySelector('.lia-dgs-object-list-panel');if(!panel.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();[...c.querySelectorAll('.lia-dgs-export-dialog button')].find(b=>b.dataset.primary==='1').click();const value=c.querySelector('.lia-dgs-export-textarea').value;[...c.querySelectorAll('.lia-dgs-export-dialog .lia-dgs-angle-dialog-button')].find(b=>/Schlie|Close/i.test(b.textContent)).click();c.querySelectorAll('.lia-dgs-side-menu-close').forEach(b=>b.click());return value;})()");
  const baseline=await state();
  assert.equal(baseline.surfaces.length,0);
  for(const [kind,sides] of [['circle',0]]){
    await activate(kind,sides);
    const start=await anchor(),mid=[start[0]+100,start[1]],end=[start[0]+200,start[1]];
    const before=await state();
    await down(start);await move(mid);
    const small=await state(),preview=small.surfaces[0];
    assert.equal(small.surfaces.length,1,'Drag must create one surface preview');
    assert.equal(preview.preview,true,'Preview must not commit before release');
    assertFilled(preview,'Small '+kind+' preview');
    assert.ok(Math.hypot(...preview.anchor.map((v,i)=>v-start[i]))<2,'Initial center/vertex must remain at the click: '+JSON.stringify({preview:preview.anchor,start}));
    await move(end);
    const large=await state();
    assert.equal(large.surfaces.length,1,'Growing preview must reuse the same surface');
    assert.ok(near(large.surfaces[0].area/preview.area,4,1e-3),'Doubling cursor distance must quadruple area');
    assert.deepEqual(large.camera,before.camera,'Drawing must keep the camera still');
    await up(end);
    const committed=await state(),surface=committed.surfaces[0];
    assert.equal(committed.surfaces.length,1);
    assert.equal(surface.preview,false);
    assert.equal(surface.kind,kind);
    assert.equal(committed.undoCount,before.undoCount+1,'Drawing must add one undo transaction');
    assertFilled(surface,'Committed '+kind);
    assertGeometry(surface,kind,sides);
    assert.ok(near(surface.area,large.surfaces[0].area),'Commit must preserve preview dimensions');
    await closePanels();
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(tmpdir(),'lia-coordinate-surface-draw-'+kind+(sides||'')+'.png'),Buffer.from(screenshot.data,'base64'));
    await history('undo');clean(await state(),baseline,'Undo removes surface and its generated sources');
    await history('redo');
    const restored=await state();
    assert.equal(restored.surfaces.length,1,'Redo must restore the surface');
    assert.ok(near(restored.surfaces[0].area,surface.area),'Redo must restore dimensions');
    assertFilled(restored.surfaces[0],'Restored '+kind);
    if(kind==='circle')assert.equal(restored.surfaces[0].radiusPointConstrained,true,'Redo must restore the drawn radius-point plane constraint');
    const exported=await exportConstruction();
    assert.ok(kind==='polygon'?exported.includes('@Vieleck3D('):exported.includes('@KreisMittelpunktNormalPunkt3D('),'Surface must export with standard macros: '+exported);
    assert.ok(exported.includes('@Punkt3D(')||exported.includes('@Point3D('),'Defining points must export');
    if(kind==='circle'){assert.ok(exported.includes('radiuspointinplane=1'),'Export must retain the drawn radius-point constraint');assert.ok(exported.includes('fillcolor='),'Export must retain the filled circle surface');}
    if(kind==='circle'){
      await evaluate('window.surfaceExport='+JSON.stringify(exported));
      const importSurface=async()=>{
        const tick=String.fromCharCode(96),pattern=new RegExp('@(\\w+)\\('+tick+'([\\s\\S]*?)'+tick+'\\)','g');
        const entries=[...surfaceExport.matchAll(pattern)].map(m=>({macro:m[1],spec:m[2]}));
        const id='surface-import',section=document.createElement('section');section.className='flex-child';
        const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey=id;host.dataset.spec='id='+id+';mode=3d;xmin=-5;xmax=5;ymin=-5;ymax=5;zmin=-4;zmax=5;width=500';section.append(host);
        const add=(prefix,entry,index,extra={})=>{const marker=document.createElement('span');marker.id=prefix+'surface-import-'+index;marker.dataset.spec=id+entry.spec.slice(entry.spec.indexOf(';'));marker.dataset.language='de';Object.assign(marker.dataset,extra);marker.style.display='none';section.append(marker);};
        entries.filter(e=>/^(Punkt3D|Point3D)$/.test(e.macro)).forEach((e,i)=>add('point3d-spec-',e,i));
        entries.filter(e=>/^(Vektor3D|Vector3D)$/.test(e.macro)).forEach((e,i)=>add('linear3d-spec-',e,i,{kind:'vector'}));
        const circles=entries.filter(e=>/^(KreisMittelpunktNormalPunkt3D|CircleCenterNormalPoint3D)$/.test(e.macro));
        if(circles.length!==1)throw Error('Missing exported circle');
        add('circle3d-spec-',circles[0],0,{definition:'center-normal-point'});document.body.append(section);
        let object;
        for(let attempt=0;attempt<160;attempt++){object=Object.values(__circle3DEntries||{}).find(e=>e.boardId===id)?.object;if(object)break;await new Promise(r=>setTimeout(r,30));}
        if(!object)throw Error('Surface macro import timed out '+JSON.stringify(profileErrors));
        const node=object.element2D.rendNode,data=__coord.coordinateCircle3DData(object);
        const result={radius:data.radius,fill:node.getAttribute('fill'),opacity:Number(node.getAttribute('fill-opacity')),constrained:!!object.__liaCircle3DSourcePoints[1]?.__liaRoundRadiusPoint3DSync};
        section.remove();
        for(let attempt=0;attempt<80&&Object.values(__circle3DEntries||{}).some(e=>e.boardId===id);attempt++)await new Promise(r=>setTimeout(r,25));
        return result;
      };
      const imported=await evaluate('('+importSurface.toString()+')()');
      assert.ok(near(imported.radius,surface.radius),'Macro import must preserve the drawn circle radius');
      assert.equal(imported.fill.toLowerCase(),surface.fill.toLowerCase(),'Macro import must preserve circle fill');
      assert.ok(near(imported.opacity,surface.opacity),'Macro import must preserve circle transparency');
      assert.equal(imported.constrained,true,'Macro import must preserve the radius point plane constraint');
    }    await history('undo');clean(await state(),baseline,'Undo after redo must remove the complete construction');
    console.log('PASS circle: drag preview, transparent fill, undo/redo, export and macro reimport');
  }

  const polygonClicks=async(count=5,{earlyClose=false}={})=>{
    await activate('polygon');
    const center=await anchor(),pixels=Array.from({length:count},(_,index)=>{
      const angle=-Math.PI/2+index*Math.PI*2/count,radius=100+(index%2)*25;
      return[center[0]+Math.cos(angle)*radius,center[1]+Math.sin(angle)*radius];
    });
    const before=await state();
    for(let index=0;index<pixels.length;index++){
      await clickAt(pixels[index]);
      const draft=await state();
      assert.equal(draft.surfaces.length,before.surfaces.length,'Every click must add a vertex without auto-closing');
      assert.equal(draft.selectedVertices,index+1,'Clicked vertices must stay in construction order');
      assert.equal(draft.counts.points,before.counts.points+index+1,'Clicking empty space must create exactly one point');
      assert.equal(draft.undoCount,before.undoCount,'Incomplete polygon must not add history');
      if(earlyClose&&index<2){
        await clickAt(pixels[0]);
        const premature=await state();
        assert.equal(premature.surfaces.length,before.surfaces.length,'Closing needs at least three different vertices');
        assert.equal(premature.selectedVertices,index+1,'Early closure must not duplicate the first vertex');
      }
    }
    await clickAt(pixels[0]);
    const committed=await state(),surface=committed.surfaces.at(-1);
    assert.equal(committed.surfaces.length,before.surfaces.length+1,'Clicking the first point must close exactly one polygon');
    assert.equal(committed.selectedVertices,0,'Finishing must clear the polygon draft');
    assert.equal(committed.undoCount,before.undoCount+1,'The entire polygon must be one history transaction');
    assert.equal(surface.preview,false);
    assertFilled(surface,'Clicked polygon');
    assertGeometry(surface,'polygon',count);
    assert.deepEqual(committed.camera,before.camera,'Click construction must not move the camera');
    await closePanels();
    return committed;
  };
  for(const count of [3,5,8]){
    const committed=await polygonClicks(count,{earlyClose:true}),surface=committed.surfaces[0];
    if(count===5){
      assert.ok(surface.edgeLengths.some(length=>!near(length,surface.edgeLengths[0])),'Click construction must retain an arbitrary polygon, not regularize its vertices');
      const screenshot=await send('Page.captureScreenshot',{format:'png'});
      writeFileSync(join(tmpdir(),'lia-coordinate-surface-polygon-clicks.png'),Buffer.from(screenshot.data,'base64'));
    }
    const exported=await exportConstruction();
    assert.ok(exported.includes('@Vieleck3D('),'Clicked polygon must export as the standard polygon macro');
    assert.equal((exported.match(/@(?:Punkt3D|Point3D)\(/g)||[]).length,count,'Export must include exactly the clicked source points');
    await history('undo');clean(await state(),baseline,'Undo removes a clicked polygon and its new vertices');
    await history('redo');
    const restored=await state();
    assert.equal(restored.surfaces.length,1);
    assert.deepEqual(restored.surfaces[0].vertices,surface.vertices,'Redo must preserve every clicked vertex');
    assertFilled(restored.surfaces[0],'Restored clicked polygon');
    await history('undo');clean(await state(),baseline,'Undo after redo removes the complete clicked polygon');
    console.log('PASS polygon '+count+': click vertices, min-three closure, fill, undo/redo and export');
  }

  // Existing vertices are reused by identity; a shared point must survive undo.
  const firstPolygon=await polygonClicks(3),existing=firstPolygon.surfaces[0].vertexScreens;
  await activate('polygon');
  await clickAt(existing[0]);await clickAt(existing[1]);await escape();
  clean(await state(),firstPolygon,'Cancelling reused points must retain the original polygon and its sources');
  await activate('polygon');
  await clickAt(existing[0]);await clickAt(existing[1]);
  assert.equal((await state()).counts.points,firstPolygon.counts.points,'Existing polygon points must not be duplicated');
  const next=[existing[1][0]+100,existing[1][1]+80];
  await clickAt(next);await clickAt(existing[0]);
  const sharedPolygons=await state();
  assert.equal(sharedPolygons.surfaces.length,2,'Mixed existing/new vertices must close another polygon');
  assert.equal(sharedPolygons.counts.points,firstPolygon.counts.points+1,'Only the one new vertex may be created');
  assert.deepEqual(sharedPolygons.surfaces[1].vertices.slice(0,2),firstPolygon.surfaces[0].vertices.slice(0,2),'The second polygon must share its source vertices');
  await closePanels();await history('undo');clean(await state(),firstPolygon,'Undo must retain all reused source points');
  await clickAt(await evaluate("(()=>{const r=__boards.raum.containerObj.getBoundingClientRect();return[r.left+r.width*.78,Math.min(r.bottom-50,innerHeight-80)]})()"));
  clean(await state(),firstPolygon,'A blank canvas click after undo must keep the restored construction');
  assert.ok(await evaluate("Object.values(__liaRegressionStates).find(s=>s.boardId==='raum').redoActions.length>0"),'A blank canvas click must not discard polygon redo history');
  await history('redo');assert.equal((await state()).surfaces.length,2,'Redo restores a polygon with shared vertices');
  await history('undo');await history('undo');clean(await state(),baseline,'Undo clears both polygons without orphaned points');

  // Pointer movement is never a regular-polygon preview, and Escape cancels drafts.
  await activate('polygon');
  let polygonStart=await anchor(),polygonEnd=[polygonStart[0]+140,polygonStart[1]+30];
  const beforePolygonDrag=await state();
  await down(polygonStart);await move(polygonEnd);
  const movingPolygon=await state();
  assert.equal(movingPolygon.surfaces.length,0,'Holding and moving must not create a polygon draw preview');
  assert.equal(movingPolygon.counts.solids,0,'Polygon pointer movement must not enter a solid draw tool');
  assert.equal(movingPolygon.counts.lines,0,'Polygon pointer movement must not create support vectors');
  assert.deepEqual(movingPolygon.camera,beforePolygonDrag.camera,'Polygon pointer movement must not pan the coordinate system');
  await up(polygonEnd);
  assert.equal((await state()).surfaces.length,0,'Dragging must not commit a regular polygon');
  await escape();clean(await state(),baseline,'Escape cancels any first-click polygon source');
  assert.equal((await state()).undoCount,beforePolygonDrag.undoCount,'Cancelled pointer movement must not add history');
  await activate('polygon');
  polygonStart=await anchor();await clickAt(polygonStart);await clickAt([polygonStart[0]+90,polygonStart[1]+60]);
  assert.equal((await state()).selectedVertices,2,'The unfinished polygon must contain both clicks');
  await escape();clean(await state(),baseline,'Escape removes the complete unfinished polygon draft');
  console.log('PASS polygon shared vertices, no drag/count option, and draft cancellation');

  // Fill follows the visible line color using the real object properties panel.
  for(const kind of ['circle','polygon']){
    if(kind==='polygon')await polygonClicks(5);
    else{await activate(kind);const start=await anchor(),end=[start[0]+150,start[1]];await down(start);await move(end);await up(end);}
    const before=(await state()).surfaces[0];
    if(!before){const image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(tmpdir(),'lia-coordinate-surface-draw-missing.png'),Buffer.from(image.data,'base64'));}
    assert.ok(before,'Missing surface before '+kind+' color test: '+JSON.stringify(await state())+' / '+await evaluate('JSON.stringify({tool:__boards.raum.__liaDgs3DHookState.activeTool,selected:__boards.raum.__liaDgs3DHookState.selectedRoundPoints.length})'));
    await evaluate("(()=>{const e=__coordinateViews3d.raum,o="+(kind==='circle'?'[...e.circleObjects][0]':'[...e.polygonObjects][0]')+",c=__boards.raum.containerObj,list=c.querySelector('.lia-dgs-object-list-panel');if(!list.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();const name=o.__liaDgsCircle3DName||o.__liaDgsPolygon3DName;[...list.querySelectorAll('.lia-dgs-object-list-entry')].find(item=>item.querySelector('.lia-dgs-object-list-name')?.textContent===name).click();c.querySelector('.lia-dgs-color-button[data-color-kind=\"line\"]').click();const input=c.querySelector('.lia-dgs-color-hex');input.value='#ff6600';input.dispatchEvent(new Event('change',{bubbles:true}));__boards.raum.update();})()");
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1110,y:20});await sleep(100);
    const colored=(await state()).surfaces[0];
    assert.equal(colored.line.toLowerCase(),'#ff6600','Line picker must update the surface contour');
    assert.equal(colored.fill.toLowerCase(),'#ff6600','Line picker must update the transparent surface fill');
    assert.ok(colored.borders.every(b=>b.line.toLowerCase()==='#ff6600'),'Line picker must update every polygon border');
    assert.ok(near(colored.opacity,before.opacity),'Color editing must retain surface opacity');
    await closePanels();await history('undo');
    assert.equal((await state()).surfaces[0].fill.toLowerCase(),before.fill.toLowerCase(),'Undo must restore the fill color');
    await history('undo');clean(await state(),baseline,'Undo must remove the colored construction');
    console.log('PASS '+kind+' line color and transparent fill remain coupled');
  }

  for(const kind of ['circle']){
    await activate(kind);let start=await anchor(),end=[start[0]+120,start[1]-20];
    const before=await state();await down(start);await move(end);
    assert.equal((await state()).surfaces[0]?.preview,true);
    await escape();await up(end);
    clean(await state(),baseline,'Escape removes '+kind+' preview');
    assert.equal((await state()).undoCount,before.undoCount,'Escape must not add history');
    await activate(kind,5);await clickAt(await anchor());
    const clicked=await state();
    assert.equal(clicked.surfaces.length,0,'Short click must preserve manual construction');
    assert.equal(clicked.counts.points,baseline.counts.points+1,'Short click must create/select one manual source point');
    await escape();clean(await state(),baseline,'Manual first point cancellation must clean its source');
  }

  // A radius handle must stay on its visible circle after actual pointer dragging.
  await activate('circle');let radiusStart=await anchor(),radiusEnd=[radiusStart[0]+150,radiusStart[1]];
  await down(radiusStart);await move(radiusEnd);await up(radiusEnd);await closePanels();
  const circleBefore=(await state()).surfaces[0],handle=circleBefore.radiusPoint;
  assert.ok(handle,'Drawn circle must expose a radius point');
  const handleEnd=[handle[0]+45,handle[1]-35];
  await down(handle);await move(handleEnd);await up(handleEnd);
  const movedCircle=(await state()).surfaces[0],radial=movedCircle.radiusPoint3d.map((v,i)=>v-movedCircle.anchor3d[i]);
  assert.ok(Math.abs(radial.reduce((sum,v,i)=>sum+v*movedCircle.normal[i],0))<1e-7,'Dragged radius point must remain in the circle plane');
  assert.ok(near(Math.hypot(...radial),movedCircle.radius),'Dragged radius point must remain on the circle rim');
  assert.ok(Math.abs(movedCircle.radius-circleBefore.radius)>1e-3,'Dragging the radius point must actually resize the circle');
  await history('undo');assert.ok(near((await state()).surfaces[0].radius,circleBefore.radius),'Undo restores the original radius');
  await history('undo');clean(await state(),baseline,'Undo removes drawn circle after radius editing');

  // A new circle may reuse a polygon vertex as its center without moving it.
  const polygonBefore=await polygonClicks(3),sharedAnchor=polygonBefore.surfaces[0].anchor;
  await activate('circle');const circleEnd=[sharedAnchor[0]+110,sharedAnchor[1]];
  await down(sharedAnchor);await move(circleEnd);await up(circleEnd);
  const sharedState=await state(),sharedCircle=sharedState.surfaces.find(s=>s.kind==='circle');
  assert.equal(sharedState.surfaces.length,2,'Drawing from a polygon vertex must create an additional circle');
  assert.deepEqual(sharedCircle.anchor3d,polygonBefore.surfaces[0].anchor3d,'Shared center must remain at the existing source');
  assert.equal(sharedState.counts.points,polygonBefore.counts.points+2,'Circle must reuse its center and add only radius and normal points');
  await closePanels();await history('undo');clean(await state(),polygonBefore,'Undo must keep the shared source polygon');
  await history('undo');clean(await state(),baseline,'Undo removes the source polygon');
  console.log('PASS circle radius handle constraint and shared source anchor');
  const circleRadius=async()=>{
    await activate('circle');const start=await anchor(),end=[start[0]+120,start[1]];
    await down(start);await move(end);await up(end);const radius=(await state()).surfaces[0].radius;
    await closePanels();await history('undo');return radius;
  };
  const radiusBefore=await circleRadius(),zoomAt=await anchor();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:zoomAt[0],y:zoomAt[1],deltaX:0,deltaY:-200});await sleep(200);
  const radiusAfter=await circleRadius();
  assert.ok(radiusAfter<radiusBefore*.95&&radiusAfter>radiusBefore*.1,'Same pixel drag must use smaller world radius after zoom');

  await activate('polygon');let start=await anchor(),end=[start[0]+110,start[1]+40];
  const beforeToolChange=await state();await clickAt(start);await clickAt(end);
  await evaluate("("+toolFor('circle')+").click()");
  clean(await state(),baseline,'Tool change must remove all unfinished polygon source points');
  assert.equal((await state()).undoCount,beforeToolChange.undoCount,'Tool change must not add history');

  await activate('circle');start=await anchor();end=[start[0]+110,start[1]];
  await down(start);await move(end);
  await evaluate("__coord.setCoordinateViewMode(__coordinateViews3d.raum,'2d')");await up(end);
  const switched=await state();
  clean(switched,baseline,'Mode switch must remove circle preview');
  assert.equal(switched.mode,'2d');
  assert.deepEqual(switched.errors,[]);
  console.log('PASS Escape, manual clicks, zoom, tool and mode cleanup');
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
