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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/bundle.js' ? bundle : path.startsWith('/assets/')
    ? join(assets, path.slice(8)) : join(root, 'tests/fixtures/dynamic-pan-zoom.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-dgs-ellipse-chrome-'));
  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1100,1000', '--user-data-dir=' + profile, 'about:blank'
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 30_000);
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
    for (let step = 1; step <= 5; step += 1) {
      const ratio = step / 5;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: to[0], y: to[1], clickCount: 1 });
    await sleep(180);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=1&instrument=0&integration=0' });
  await loaded;
  await evaluate('profileReady()');
  await sleep(250);

  const setup = await evaluate(`(() => {
    for (const [name,[x,y]] of Object.entries({F1:[-2,0],F2:[2,0],P:[0,3],Q:[0,0]})) {
      if (!finalizePointFromSpec('A1;'+name+';'+x+';'+y+';#ff00ff;1')) return false;
    }
    const host=document.querySelector('.flex-child');
    const line=document.createElement('span');line.id='linear-spec-ellipse-axis';
    line.dataset.spec='A1;[F1;F2];#1565c0;g';line.dataset.kind='line';line.dataset.language='de';host.append(line);
    window.screenPoint=(x,y)=>{const b=__boards.A1,r=b.containerObj.getBoundingClientRect();
      return [r.left+b.origin.scrCoords[1]+x*b.unitX,r.top+b.origin.scrCoords[2]-y*b.unitY];};
    return true;
  })()`);
  assert.equal(setup, true);
  for (let index = 0; index < 40; index += 1) {
    if (await evaluate(`!!Object.values(__linearObjectEntries||{}).find(e=>e.boardId==='A1'&&e.objectName==='g')`)) break;
    await sleep(50);
  }

  const activated = await evaluate(`(() => {const c=__boards.A1.containerObj;
    const button=[...c.querySelectorAll('.lia-dgs-shape-submenu .lia-dgs-geometry-tool')]
      .find(button=>button.textContent.trim()==='Ellipse');if(!button)return false;button.click();return true;})()`);
  assert.equal(activated, true, 'Ellipse tool missing');
  for (const name of ['F1', 'F2', 'P']) {
    const position = await evaluate(`screenPoint(__points.A1.${name}.X(),__points.A1.${name}.Y())`);
    await clickAt(position);
  }

  const initial = await evaluate(`(() => {const e=__boards.A1.objectsList.find(o=>o.__liaDgsEllipse&&!o.__liaDgsMacroManaged);
    if(!e)return {missing:true,errors:profileErrors.slice()};
    const f1=e.__liaDgsEllipseFocus1,f2=e.__liaDgsEllipseFocus2,p=e.__liaDgsEllipsePoint;
    const a=(Math.hypot(p.X()-f1.X(),p.Y()-f1.Y())+Math.hypot(p.X()-f2.X(),p.Y()-f2.Y()))/2;
    const c=Math.hypot(f2.X()-f1.X(),f2.Y()-f1.Y())/2;
    return {name:e.__liaDgsEllipseName,points:[f1.__liaDgsPointName,f2.__liaDgsPointName,p.__liaDgsPointName],
      a,b:Math.sqrt(a*a-c*c),area:e.__liaDgsShowArea,perimeter:e.__liaDgsShowPerimeter,errors:profileErrors.slice()};})()`);
  assert.equal(initial.name, 'e');
  assert.deepEqual(initial.points, ['F1', 'F2', 'P']);
  assert.ok(Math.abs(initial.a - Math.sqrt(13)) < 1e-9, JSON.stringify(initial));
  assert.ok(Math.abs(initial.b - 3) < 1e-9, JSON.stringify(initial));
  assert.deepEqual(initial.errors, []);

  await evaluate(`(() => {const P=__points.A1.P;P.setPosition(JXG.COORDS_BY_USER,[0,4]);__boards.A1.update();})()`);
  await sleep(120);
  const moved = await evaluate(`(() => {const e=__boards.A1.objectsList.find(o=>o.__liaDgsEllipse&&!o.__liaDgsMacroManaged);
    const f1=e.__liaDgsEllipseFocus1,f2=e.__liaDgsEllipseFocus2,p=e.__liaDgsEllipsePoint;
    const a=(Math.hypot(p.X()-f1.X(),p.Y()-f1.Y())+Math.hypot(p.X()-f2.X(),p.Y()-f2.Y()))/2;
    const c=Math.hypot(f2.X()-f1.X(),f2.Y()-f1.Y())/2;return {a,b:Math.sqrt(a*a-c*c)};})()`);
  assert.ok(Math.abs(moved.a - Math.sqrt(20)) < 1e-9 && Math.abs(moved.b - 4) < 1e-9, JSON.stringify(moved));

  const bound = await evaluate(`(() => finalizePointFromSpec('A1;G;${Math.sqrt(20)};0;#ff00ff;1;on=e'))()`);
  assert.equal(bound, true);
  await sleep(250);
  const binding = await evaluate(`(() => {const e=__boards.A1.objectsList.find(o=>o.__liaDgsEllipse&&!o.__liaDgsMacroManaged),G=__points.A1.G;
    return {bound:G.slideObject===e||G.__liaDgsGliderSource===e,x:G.X(),y:G.Y(),errors:profileErrors.slice()};})()`);
  assert.equal(binding.bound, true, JSON.stringify(binding));
  assert.deepEqual(binding.errors, []);

  const midpoint = await evaluate(`(() => {const host=document.querySelector('.flex-child'),m=document.createElement('span');
    m.id='relation-spec-ellipse-midpoint';m.dataset.spec='A1;[G;Q];#ff00ff;M';m.dataset.kind='midpoint';m.dataset.language='de';host.append(m);
    return renderRelationObjectFromSpec('ellipse-midpoint',m.dataset.spec,'midpoint','de');})()`);
  assert.equal(midpoint, true);
  await sleep(120);
  const locusStarted = await evaluate(`(() => {const b=__boards.A1,c=b.containerObj,M=__points.A1.M;
    const p=screenPoint(M.X(),M.Y());c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p[0],clientY:p[1]}));
    const option=[...c.querySelectorAll('.lia-dgs-context-option')].find(label=>!label.hidden&&label.textContent.includes('Ortslinie anzeigen'));
    if(!option)return false;const input=option.querySelector('input');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));
    const G=__points.A1.G,q=screenPoint(G.X(),G.Y());c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,buttons:1,isPrimary:true,pointerId:17,clientX:q[0],clientY:q[1]}));return true;})()`);
  assert.equal(locusStarted, true);
  await sleep(900);
  const locus = await evaluate(`(() => {const l=__boards.A1.objectsList.find(o=>o.__liaDgsLocus&&!o.__liaDgsMacroManaged);
    const xs=l?.__liaDgsLocusDataX.filter(Number.isFinite)||[],ys=l?.__liaDgsLocusDataY.filter(Number.isFinite)||[];
    return {count:xs.length,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};})()`);
  assert.ok(locus.count >= 200, JSON.stringify(locus));
  assert.ok(Math.abs(locus.minX + Math.sqrt(20) / 2) < 0.02 && Math.abs(locus.maxX - Math.sqrt(20) / 2) < 0.02, JSON.stringify(locus));
  assert.ok(Math.abs(locus.minY + 2) < 0.02 && Math.abs(locus.maxY - 2) < 0.02, JSON.stringify(locus));

  const intersectionActivated = await evaluate(`(() => {const c=__boards.A1.containerObj;
    const button=[...c.querySelectorAll('.lia-dgs-root-submenu .lia-dgs-geometry-tool')]
      .find(button=>button.textContent.includes('Schnittpunkte'));if(!button)return false;button.click();return true;})()`);
  assert.equal(intersectionActivated, true, 'Intersection tool missing');
  await clickAt(await evaluate('screenPoint(0,4)'));
  await clickAt(await evaluate('screenPoint(0,0)'));
  await sleep(250);
  const intersections = await evaluate(`(() => __boards.A1.objectsList.filter(o=>o.__liaDgsIntersectionPoint)
    .map(p=>[p.X(),p.Y()]).sort((a,b)=>a[0]-b[0]))()`);
  assert.equal(intersections.length, 2, JSON.stringify(intersections));
  assert.ok(Math.abs(intersections[0][0] + Math.sqrt(20)) < 1e-6 && Math.abs(intersections[0][1]) < 1e-6, JSON.stringify(intersections));
  assert.ok(Math.abs(intersections[1][0] - Math.sqrt(20)) < 1e-6 && Math.abs(intersections[1][1]) < 1e-6, JSON.stringify(intersections));

  const measurements = await evaluate(`(() => {const b=__boards.A1,c=b.containerObj,e=b.objectsList.find(o=>o.__liaDgsEllipse&&!o.__liaDgsMacroManaged);
    const p=screenPoint(0,2);c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p[0],clientY:p[1]}));
    const options=[...c.querySelectorAll('.lia-dgs-context-option')].filter(x=>!x.hidden);
    for(const label of options){if(label.textContent.includes('Flächeninhalt')||label.textContent.includes('Umfang')){const input=label.querySelector('input');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}
    return {area:e.__liaDgsShowArea,perimeter:e.__liaDgsShowPerimeter,label:e.label?.plaintextStr||e.label?.htmlStr||''};})()`);
  assert.equal(measurements.area, true, JSON.stringify(measurements));
  assert.equal(measurements.perimeter, true, JSON.stringify(measurements));

  const block = await evaluate(`(() => {const c=__boards.A1.containerObj;c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  assert.match(block, /@Ellipse\([^\n]*;e;F1;F2;P;#ff00ff;0\.2;[^\n]*inhalt=1;umfang=1/);
  assert.match(block, /@Ortslinie\([^\n]*;M(?:_\d+)?;G;/);
  assert.match(block, /@Schnittpunkt\([^\n]*;e;g;/);

  const imported = await evaluate(`(() => {const ok=renderDgsEllipseFromSpec('ellipse-import',
    'A1;$e_import$;F1;F2;P;#1565c0;0.35;showname=1;area=1;perimeter=1;linestyle=dashed','de');
    const e=__dgsEllipseEntries['ellipse-import']?.ellipse;return {ok,name:e?.__liaDgsEllipseName,
      foci:[e?.__liaDgsEllipseFocus1?.__liaDgsPointName,e?.__liaDgsEllipseFocus2?.__liaDgsPointName],
      point:e?.__liaDgsEllipsePoint?.__liaDgsPointName,opacity:e?.__liaDgsOpacity,area:e?.__liaDgsShowArea,
      perimeter:e?.__liaDgsShowPerimeter,style:e?.__liaDgsLineStyle,errors:profileErrors.slice()};})()`);
  assert.deepEqual(imported, { ok: true, name: 'e_import', foci: ['F1', 'F2'], point: 'P', opacity: 0.35,
    area: true, perimeter: true, style: 'dashed', errors: [] });
  const importedDependents = await evaluate(`(() => {
    const pointOk=finalizePointFromSpec('A1;Z;${Math.sqrt(20)};0;#ff00ff;1;on=e_import');
    const intersectionOk=renderObjectAnalysisPointsFromSpec('ellipse-import-intersections',
      'A1;e_import;g;#ff00ff;T;names=[J;K]','intersections','de');
    const e=__dgsEllipseEntries['ellipse-import']?.ellipse,Z=__points.A1.Z;
    const entry=Object.values(__objectAnalysisPointEntries||{}).find(item=>item?.uid==='ellipse-import-intersections');
    const xy=(entry?.points||[]).map(p=>[p.X(),p.Y()]).sort((a,b)=>a[0]-b[0]);
    return {pointOk,bound:Z?.slideObject===e||Z?.__liaDgsGliderSource===e,intersectionOk,xy,errors:profileErrors.slice()};})()`);
  assert.equal(importedDependents.pointOk, true, JSON.stringify(importedDependents));
  assert.equal(importedDependents.bound, true, JSON.stringify(importedDependents));
  assert.equal(importedDependents.intersectionOk, true, JSON.stringify(importedDependents));
  assert.equal(importedDependents.xy.length, 2, JSON.stringify(importedDependents));
  assert.ok(Math.abs(importedDependents.xy[0][0] + Math.sqrt(20)) < 1e-6 &&
    Math.abs(importedDependents.xy[1][0] - Math.sqrt(20)) < 1e-6, JSON.stringify(importedDependents));
  assert.deepEqual(importedDependents.errors, []);
  console.log('PASS ellipse creation, dependencies, binding, locus, intersections, measurements, and export/import');

  const selectionReady = await evaluate(`(() => {
    const c=__boards.A1.containerObj,dialog=c.querySelector('.lia-dgs-export-dialog');
    const close=[...dialog.querySelectorAll('button')].find(button=>button.textContent.includes('Schließen'));
    close?.click();
    c.querySelector('.lia-dgs-select-button').click();
    window.regression=Object.values(__liaRegressionStates).find(state=>state.boardId==='A1');
    window.multiInitialPoints=new Set(__boards.A1.objectsList.filter(o=>o.__liaDgsPointName));
    c.querySelector('.lia-dgs-point-button').click();
    c.querySelector('.lia-dgs-point-submenu .lia-dgs-geometry-tool').click();
    return c.querySelector('.lia-dgs-select-button').title;
  })()`);
  assert.match(selectionReady, /Mehrfachauswahl/);
  for (const coordinates of [[-7,7],[-3,7],[1,7]]) await clickAt(await evaluate(`screenPoint(${coordinates[0]},${coordinates[1]})`));
  const pointSetup = await evaluate(`(() => {
    const c=__boards.A1.containerObj;c.querySelector('.lia-dgs-select-button').click();
    window.multiPoints=__boards.A1.objectsList.filter(o=>o.__liaDgsPointName&&!multiInitialPoints.has(o)).slice(-3);
    window.multiPointNames=multiPoints.map(p=>p.__liaDgsPointName);
    return {count:multiPoints.length,names:multiPoints.map(p=>p.__liaDgsPointName),
      title:c.querySelector('.lia-dgs-select-button').title,errors:profileErrors.slice()};
  })()`);
  assert.equal(pointSetup.count, 3, JSON.stringify(pointSetup));
  assert.match(pointSetup.title, /Mehrfachauswahl/);
  assert.deepEqual(pointSetup.errors, []);

  await clickAt(await evaluate('screenPoint(multiPoints[0].X(),multiPoints[0].Y())'));
  await clickAt(await evaluate('screenPoint(multiPoints[1].X(),multiPoints[1].Y())'));
  const selectedPoints = await evaluate(`(() => ({
    selected:multiPoints.map(p=>!!p.__liaDgsMultiSelected),
    marked:multiPoints.map(p=>p.rendNode.classList.contains('lia-dgs-multi-selected')),
    count:Number(__boards.A1.containerObj.querySelector('.lia-dgs-select-button').dataset.selectionCount),
    history:regression.undoActions.length
  }))()`);
  assert.deepEqual(selectedPoints.selected, [true,true,false]);
  assert.deepEqual(selectedPoints.marked, [true,true,false]);
  assert.equal(selectedPoints.count, 2);
  await dragAt(await evaluate('screenPoint(multiPoints[0].X(),multiPoints[0].Y())'), await evaluate('screenPoint(-6,6)'));
  const pointDrag = await evaluate(`(() => ({
    xy:multiPoints.map(p=>[+p.X().toFixed(6),+p.Y().toFixed(6)]),
    selected:multiPoints.map(p=>!!p.__liaDgsMultiSelected),
    history:regression.undoActions.length,errors:profileErrors.slice()
  }))()`);
  assert.deepEqual(pointDrag.xy, [[-6,6],[-2,6],[1,7]]);
  assert.deepEqual(pointDrag.selected, [true,true,false]);
  assert.equal(pointDrag.history, selectedPoints.history + 1, 'group drag is one history step');
  assert.deepEqual(pointDrag.errors, []);

  await clickAt(await evaluate('screenPoint(multiPoints[1].X(),multiPoints[1].Y())'));
  assert.deepEqual(await evaluate('multiPoints.map(p=>!!p.__liaDgsMultiSelected)'), [true,false,false]);
  await evaluate(`__boards.A1.containerObj.querySelector('.lia-dgs-select-button').click()`);
  await sleep(100);
  assert.deepEqual(await evaluate('multiPoints.map(p=>!!p.__liaDgsMultiSelected)'), [false,false,false]);

  const activateSegment = async () => {
    const activated = await evaluate(`(() => {const c=__boards.A1.containerObj;
      c.querySelector('.lia-dgs-segment-button').click();
      const button=[...c.querySelectorAll('.lia-dgs-geometry-submenu .lia-dgs-geometry-tool')].find(b=>b.textContent.trim()==='Strecke');
      if(!button)return false;button.click();return true;})()`);
    assert.equal(activated, true, 'Segment tool missing');
  };
  await activateSegment();
  await clickAt(await evaluate('screenPoint(multiPoints[0].X(),multiPoints[0].Y())'));
  await clickAt(await evaluate('screenPoint(multiPoints[1].X(),multiPoints[1].Y())'));
  await activateSegment();
  await clickAt(await evaluate('screenPoint(multiPoints[1].X(),multiPoints[1].Y())'));
  await clickAt(await evaluate('screenPoint(multiPoints[2].X(),multiPoints[2].Y())'));
  const segmentSetup = await evaluate(`(() => {
    const c=__boards.A1.containerObj;
    c.querySelector('.lia-dgs-orthogonal-button').click();
    const midpoint=[...c.querySelectorAll('.lia-dgs-relation-submenu .lia-dgs-geometry-tool')].find(b=>b.textContent.trim()==='Mittelpunkt');
    if(!midpoint)return false;midpoint.click();return true;
  })()`);
  assert.equal(segmentSetup, true, 'Midpoint tool missing');
  await clickAt(await evaluate('screenPoint(multiPoints[0].X(),multiPoints[0].Y())'));
  await clickAt(await evaluate('screenPoint(multiPoints[1].X(),multiPoints[1].Y())'));
  const capturedSegments = await evaluate(`(() => {
    window.multiSegments=__boards.A1.objectsList.filter(o=>o.__liaDgsSegment&&!o.__liaDgsPolygonBorder).slice(-2);
    window.multiMidpoint=__boards.A1.objectsList.filter(o=>o.__liaDgsMidpoint).at(-1);
    return {segments:multiSegments.length,midpoint:!!multiMidpoint};
  })()`);
  assert.deepEqual(capturedSegments, {segments:2,midpoint:true});
  for (const index of [0,1]) await clickAt(await evaluate(`(() => {
    const s=multiSegments[${index}],r=${index === 0 ? 0.25 : 0.5};
    return screenPoint(s.point1.X()+(s.point2.X()-s.point1.X())*r,
      s.point1.Y()+(s.point2.Y()-s.point1.Y())*r);})()`));
  const beforeSegmentDrag = await evaluate(`(() => ({history:regression.undoActions.length,
    xy:multiPoints.map(p=>[+p.X().toFixed(6),+p.Y().toFixed(6)]),
    mid:[+multiMidpoint.X().toFixed(6),+multiMidpoint.Y().toFixed(6)],
    selected:multiSegments.map(s=>!!s.__liaDgsMultiSelected)}))()`);
  assert.deepEqual(beforeSegmentDrag.selected, [true,true]);
  const segmentStart = await evaluate(`(() => {const s=multiSegments[0],r=.25;
    return screenPoint(s.point1.X()+(s.point2.X()-s.point1.X())*r,
      s.point1.Y()+(s.point2.Y()-s.point1.Y())*r);})()`);
  const segmentEnd = await evaluate(`(() => {const s=multiSegments[0],r=.25;
    return screenPoint(s.point1.X()+(s.point2.X()-s.point1.X())*r+1,
      s.point1.Y()+(s.point2.Y()-s.point1.Y())*r-2);})()`);
  await dragAt(segmentStart, segmentEnd);
  const segmentDrag = await evaluate(`(() => ({history:regression.undoActions.length,
    xy:multiPoints.map(p=>[+p.X().toFixed(6),+p.Y().toFixed(6)]),
    mid:[+multiMidpoint.X().toFixed(6),+multiMidpoint.Y().toFixed(6)],
    selected:multiSegments.map(s=>!!s.__liaDgsMultiSelected),errors:profileErrors.slice()}))()`);
  assert.deepEqual(segmentDrag.xy, [[-5,4],[-1,4],[2,5]], 'shared endpoint moves once');
  assert.deepEqual(segmentDrag.mid, [-3,4], 'dependent midpoint follows');
  assert.deepEqual(segmentDrag.selected, [true,true]);
  assert.equal(segmentDrag.history, beforeSegmentDrag.history + 1);
  assert.deepEqual(segmentDrag.errors, []);
  await evaluate('regression.undoButton.click()');await sleep(180);
  assert.deepEqual(await evaluate(`multiPointNames.map(name=>{const p=__points.A1[name];
    return [+p.X().toFixed(6),+p.Y().toFixed(6)]})`), beforeSegmentDrag.xy);
  await evaluate('regression.redoButton.click()');await sleep(180);
  assert.deepEqual(await evaluate(`multiPointNames.map(name=>{const p=__points.A1[name];
    return [+p.X().toFixed(6),+p.Y().toFixed(6)]})`), segmentDrag.xy);
  console.log('PASS additive multiple selection, visual state, group drag, shared points, dependencies, and undo/redo');
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  try { ws?.close(); } catch {}
  server.closeAllConnections();
  server.close();
  proc?.kill();
  await sleep(300);
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/'))) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
