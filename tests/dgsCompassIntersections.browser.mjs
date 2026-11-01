import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Uses the same local JSXGraph/MathJax assets as dynamicPanZoom.browser.mjs.
// Prepare them using: node tests/dynamicPanZoom.browser.mjs prepare
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');
async function withTimeout(promise, label, duration = 30_000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(label + ' timed out')), duration);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
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
let proc, ws, send, profile;
const pending = new Map();
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-compass-intersections-chrome-'));
  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1100,1000', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', data => { stderr += data; });
  proc.on('error', error => { stderr += String(error); });
  let debug;
  for (let i = 0; i < 100; i++) {
    if (existsSync(join(profile, 'DevToolsActivePort'))) {
      debug = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      break;
    }
    await sleep(100);
  }
  assert.ok(debug, 'Chrome failed to expose CDP: ' + stderr);
  const pages = await (await fetch('http://127.0.0.1:' + debug + '/json')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await withTimeout(new Promise(r => ws.addEventListener('open', r, { once: true })), 'CDP connection');
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
  send = function(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('CDP request timed out: ' + method));
      }, 30_000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function navigate(options) {
    // Wait for the navigation event, so a prior document cannot satisfy readiness.
    const loaded = new Promise(r => events.set('Page.loadEventFired', [r]));
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=' +
      (options.dgs ? '1' : '0') + '&instrument=' + (options.instrument ? '1' : '0') + '&integration=' + (options.integration ? '1' : '0') });
    await withTimeout(loaded, 'Page navigation');
    await evaluate('profileReady()');
  }
  async function drag(from, to, steps = 12) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
      x: from[0], y: from[1], clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1,
        x: from[0] + (to[0] - from[0]) * i / steps,
        y: from[1] + (to[1] - from[1]) * i / steps });
      await sleep(16);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: to[0], y: to[1], clickCount: 1 });
    await sleep(150);
  }


  await send('Page.enable');
  await send('Runtime.enable');
  await navigate({ dgs: true });
  await sleep(500);
  async function clickAt(position) {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:position[0], y:position[1] });
    await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', buttons:1,
      x:position[0], y:position[1], clickCount:1 });
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', buttons:0,
      x:position[0], y:position[1], clickCount:1 });
    await sleep(60);
  }
  await evaluate(`(() => {
    window.regression = Object.values(__liaRegressionStates).find(s => s.boardId === 'A1');
    window.screenPoint = (x,y) => {
      const b=__boards.A1, rect=b.containerObj.getBoundingClientRect();
      return [rect.left + b.origin.scrCoords[1] + x*b.unitX,
        rect.top + b.origin.scrCoords[2] - y*b.unitY];
    };
    window.compassState = () => ({
      arcs:__boards.A1.objectsList.filter(o=>o.__liaDgsCompassArc&&!o.__liaDgsCompassDraft).map(o=>({
        id:o.id, cx:o.__liaDgsCompassCenterPoint.X(), cy:o.__liaDgsCompassCenterPoint.Y(),
        radius:o.__liaDgsCompassRadius, sweep:o.__liaDgsCompassSweepAngle
      })),
      intersections:__boards.A1.objectsList.filter(o=>o.__liaDgsIntersectionPoint).map(o=>({
        name:o.__liaDgsPointName, x:o.X(), y:o.Y()
      })),
      history:regression.undoActions.length, errors:profileErrors.slice()
    });
  })()`);
  const functionLabelSetup=await evaluate(`(() => {
    const container=__boards.A1.containerObj;
    const button=container.querySelector('.lia-dgs-top-menu .lia-dgs-function-button');
    if(!button)return {ok:false,stage:'button',classes:Array.from(container.querySelectorAll('button')).map(b=>b.className)};
    button.click();
    const dialog=Array.from(container.querySelectorAll('.lia-dgs-function-dialog:not(.lia-dgs-export-dialog):not(.lia-dgs-text-dialog)'))
      .find(node=>node.dataset.open==='1');
    const input=dialog?.querySelector('.lia-dgs-angle-dialog-input');
    if(!dialog||!input)return {ok:false,stage:'dialog'};
    input.value='x*x*x';input.dispatchEvent(new Event('input',{bubbles:true}));
    dialog.querySelector('button[data-primary="1"]').click();
    const graph=__boards.A1.objectsList.find(o=>o.__liaDgsFunction);
    if(!graph||!graph.__liaDgsFunctionLabel)return {ok:false,stage:'graph',open:dialog.dataset.open,
      invalid:input.getAttribute('aria-invalid'),objects:__boards.A1.objectsList.map(o=>({type:o.elType,dgs:o.__liaDgsFunction}))};
    graph.__liaDgsFunctionName='sehrLangerFunktionsname';
    graph.name='sehrLangerFunktionsname';
    __applyDgsObjectExportFormat('A1',graph,{showName:true});
    window.labelTestGraph=graph;
    return {ok:true};
  })()`);
  assert.equal(functionLabelSetup.ok,true,'DGS function with long name created: '+JSON.stringify(functionLabelSetup));
  await sleep(450);
  const labelBounds=await evaluate(`(() => {
    const board=__boards.A1.containerObj.getBoundingClientRect();
    const label=labelTestGraph.__liaDgsFunctionLabel.rendNode.getBoundingClientRect();
    return {board:{left:board.left,right:board.right,top:board.top,bottom:board.bottom},
      label:{left:label.left,right:label.right,top:label.top,bottom:label.bottom},
      whiteSpace:getComputedStyle(labelTestGraph.__liaDgsFunctionLabel.rendNode).whiteSpace};
  })()`);
  assert.ok(labelBounds.label.left>=labelBounds.board.left+5,'DGS function label stays inside left edge: '+JSON.stringify(labelBounds));
  assert.ok(labelBounds.label.right<=labelBounds.board.right-5,'complete DGS function name stays inside right edge: '+JSON.stringify(labelBounds));
  assert.ok(labelBounds.label.top>=labelBounds.board.top+5&&labelBounds.label.bottom<=labelBounds.board.bottom-5,
    'DGS function label stays inside vertical edges: '+JSON.stringify(labelBounds));
  assert.equal(labelBounds.whiteSpace,'nowrap');
  await evaluate(`(() => {
    const graph=labelTestGraph,label=graph.__liaDgsFunctionLabel;
    __boards.A1.removeObject(label);__boards.A1.removeObject(graph);delete window.labelTestGraph;
    __boards.A1.update();
  })()`);
  console.log('PASS complete DGS function label flips inside the board');
  async function drawArc(cx, cy, radius, startAngle, sweep) {
    await evaluate(`__boards.A1.containerObj.querySelector('.lia-dgs-compass-submenu button').click()`);
    const points=await evaluate(`Array.from({length:65},(_,i)=>screenPoint(
      ${cx}+${radius}*Math.cos(${startAngle}+${sweep}*i/64),
      ${cy}+${radius}*Math.sin(${startAngle}+${sweep}*i/64)))`);
    await clickAt(await evaluate(`screenPoint(${cx},${cy})`));
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:points[0][0], y:points[0][1] });
    await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', buttons:1,
      x:points[0][0], y:points[0][1], clickCount:1 });
    for(const [x,y] of points.slice(1)) {
      await send('Input.dispatchMouseEvent', { type:'mouseMoved', buttons:1, x,y });
      // Give Chromium a chance to deliver every angular step. Without this,
      // headless runs can coalesce the complete circle into no visible sweep.
      await sleep(4);
    }
    const [x,y]=points.at(-1);
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', buttons:0,x,y,clickCount:1 });
    await sleep(100);
  }
  async function intersectionTool() {
    await evaluate(`[...__boards.A1.containerObj.querySelectorAll('.lia-dgs-root-tool')].find(b=>b.textContent==='Schnittpunkte bestimmen').click()`);
  }
  let drawn;
  for(let attempt=0;attempt<3;attempt++) {
    const current=await evaluate('compassState()');
    if(!current.arcs.some(arc=>Math.abs(arc.cx+2)<.1)) await drawArc(-2,0,4,0,Math.PI*2);
    // Start the second circle at its left edge. Its right edge lies just beyond
    // the default viewport and therefore cannot receive a pointer-down event.
    if(!current.arcs.some(arc=>Math.abs(arc.cx-2)<.1)) await drawArc(2,0,4,Math.PI,Math.PI*2);
    drawn=await evaluate('compassState()');
    if(drawn.arcs.length===2) break;
  }
  assert.equal(drawn.arcs.length,2,JSON.stringify(drawn));
  await intersectionTool();
  await clickAt(await evaluate('screenPoint(-2,4)'));
  await clickAt(await evaluate('screenPoint(2,-4)'));
  const separate=await evaluate('compassState()');
  assert.equal(separate.intersections.length,2,JSON.stringify(separate));
  assert.ok(separate.intersections.every(p=>Math.abs(p.x)<0.07&&Math.abs(Math.abs(p.y)-Math.sqrt(12))<0.07));
  console.log('PASS two drawn compass circles create both dependent intersections');
  await evaluate('regression.undoButton.click()');
  assert.equal((await evaluate('compassState()')).intersections.length,0);
  await intersectionTool();
  const crossing=await evaluate('screenPoint(0,Math.sqrt(12))');
  await clickAt(crossing);
  await clickAt(crossing);
  const overlap=await evaluate('compassState()');
  assert.equal(overlap.intersections.length,2,'Both sources must be selectable at their crossing: '+JSON.stringify(overlap));
  assert.deepEqual(overlap.errors,[]);
  console.log('PASS selecting overlapping arcs at the crossing');
  assert.equal(overlap.history,drawn.history+1,'intersection creation is one history step');
  await evaluate('regression.undoButton.click()');
  assert.equal((await evaluate('compassState()')).intersections.length,0);
  await evaluate('regression.redoButton.click()');
  const restored=await evaluate('compassState()');
  assert.deepEqual(restored.intersections,overlap.intersections);
  console.log('PASS intersection undo/redo');

  await evaluate(`__createDgsDrawnSegment('A1',{x:-7,y:1},{x:7,y:1},'#0055ff',3)`);
  await intersectionTool();
  const lineCrossing=await evaluate('screenPoint(-2+Math.sqrt(15),1)');
  await clickAt(lineCrossing);
  await clickAt(lineCrossing);
  const withSegment=await evaluate('compassState()');
  assert.equal(withSegment.intersections.length,4,'arc and segment must both be selectable at their crossing');
  assert.ok(withSegment.intersections.filter(p=>Math.abs(p.y-1)<0.05).length===2);
  console.log('PASS compass arc / segment intersections');

  const dependentBefore=await evaluate(`(() => {
    const point=Object.values(__points.A1).find(o=>o.__liaDgsIntersectionPoint&&o.Y()< -1);
    if(!__createDgsDrawnSegment('A1',{x:point.X(),y:point.Y()},{x:7,y:6},'#0055ff',3)) throw Error('dependent segment missing');
    window.dependentSegment=__boards.A1.objectsList.filter(o=>o.__liaDgsSegment).at(-1);
    if(dependentSegment.point1!==point) throw Error('intersection point not reused');
    const before=[point.X(),point.Y()];
    const arc=__boards.A1.objectsList.find(o=>o.__liaDgsCompassArc&&!o.__liaDgsCompassDraft);
    arc.__liaDgsCompassCenterPoint.setPosition(JXG.COORDS_BY_USER,[-3,0]);
    __boards.A1.update();
    return before;
  })()`);
  await sleep(200);
  const dependentAfter=await evaluate(`({point:[dependentSegment.point1.X(),dependentSegment.point1.Y()],
    dependent:dependentSegment.point1.__liaDgsIntersectionPoint,errors:profileErrors.slice()})`);
  assert.equal(dependentAfter.dependent,true);
  assert.ok(Math.hypot(...dependentAfter.point.map((v,i)=>v-dependentBefore[i]))>0.1);
  assert.deepEqual(dependentAfter.errors,[]);
  console.log('PASS intersection points remain usable as dependent construction endpoints');

  // Build one focused construction from the same public macro renderers that
  // receive an exported LiaScript block. This keeps the roundtrip independent
  // from pointer timing and verifies all newly supported object types together.
  await navigate({ dgs: true });
  await sleep(300);
  const created=await evaluate(`(() => {
    window.screenPoint = (x,y) => {
      const b=__boards.A1, rect=b.containerObj.getBoundingClientRect();
      return [rect.left + b.origin.scrCoords[1] + x*b.unitX,
        rect.top + b.origin.scrCoords[2] - y*b.unitY];
    };
    const points={
      A:[-3,-2],B:[0,1],C:[3,-2],G1:[-3,-1],G2:[3,2],
      P:[-4,-1],Q:[2,2],R:[4,-2],C1:[-2,0],R1:[2,0],C2:[2,0],R2:[6,0],
      M1:[1,0],MV:[0,0],M3:[0.5,0.8660254038]
    };
    const markerRoot=document.querySelector('.flex-child');
    const mark=(prefix,uid,spec,kind='')=>{
      const node=document.createElement('span');node.id=prefix+uid;node.dataset.spec=spec;
      node.dataset.language='de';if(kind)node.dataset.kind=kind;markerRoot.append(node);return spec;
    };
    for(const [name,[x,y]] of Object.entries(points)) {
      if(!finalizePointFromSpec('A1;'+name+';'+x+';'+y+';#ff00ff;1')) {
        throw Error('Point creation failed: '+name);
      }
    }
    const lineSpec=mark('linear-spec-','roundtrip-line','A1;[G1;G2];#1565c0;g','line');
    const areaSpec=mark('area-spec-','roundtrip-area','A1;[P;Q;R];#66aa55;0.2;name=Delta');
    const bisectorSpec=mark('relation-spec-','roundtrip-bisector','A1;[A;B;C];#8844cc;w','angle-bisector');
    const angleSpec=mark('angle-spec-','roundtrip-angle','A1;beta;[M1;MV;M3];#aa5500;0.4;wert=1;zielwinkel=60');
    const textSpec=mark('coord-text-spec-','roundtrip-text','A1;[1.5;3];Hinweis;#112233;0.7;fontsize=31;fixed=0');
    document.getElementById('coord-text-spec-roundtrip-text').className='lia-coord-text-spec';
    const functionSpec=mark('plot-spec-','roundtrip-function','A1;f;x^2-1;#228833;term=1');
    const arc1Spec=mark('compass-arc-spec-','roundtrip-arc-1','A1;z1;C1;R1;6.283185307179586;#d32f2f');
    const arc2Spec=mark('compass-arc-spec-','roundtrip-arc-2','A1;z2;C2;R2;6.283185307179586;#f57c00');
    const lineRootSpec=mark('object-analysis-spec-','roundtrip-line-root','A1;g;#222222;N','roots');
    const sideRootSpec=mark('object-analysis-spec-','roundtrip-side-root','A1;[P;Q];#222222;N','roots');
    const crossingSpec=mark('object-analysis-spec-','roundtrip-arcs-crossing','A1;z1;z2;#222222;S','intersections');
    if(!renderLinearObjectFromSpec('roundtrip-line',lineSpec,'line','de')) throw Error('Line creation failed');
    if(!renderAreaFromSpec('roundtrip-area',areaSpec,'de')) throw Error('Area creation failed');
    if(!renderRelationObjectFromSpec('roundtrip-bisector',bisectorSpec,'angle-bisector','de')) throw Error('Bisector creation failed');
    if(!renderAngleFromSpec('roundtrip-angle',angleSpec,'de')) throw Error('Measured angle creation failed');
    if(!renderCoordTextFromSpec('roundtrip-text',textSpec)) throw Error('Text creation failed');
    if(!renderPlotFunctionFromSpec('roundtrip-function',functionSpec)) throw Error('Function creation failed');
    if(!renderCompassArcFromSpec('roundtrip-arc-1',arc1Spec,'de')) throw Error('First compass arc creation failed');
    if(!renderCompassArcFromSpec('roundtrip-arc-2',arc2Spec,'de')) throw Error('Second compass arc creation failed');
    if(!renderObjectAnalysisPointsFromSpec('roundtrip-line-root',lineRootSpec,'roots','de')) throw Error('Line root creation failed');
    if(!renderObjectAnalysisPointsFromSpec('roundtrip-side-root',sideRootSpec,'roots','de')) throw Error('Polygon-side root creation failed');
    if(!renderObjectAnalysisPointsFromSpec('roundtrip-arcs-crossing',crossingSpec,'intersections','de')) throw Error('Arc intersection creation failed');
    const line=Object.values(__linearObjectEntries).find(e=>e.uid==='roundtrip-line').object;
    line.__liaDgsShowEquation=true;line.__liaDgsTextColor='#123456';line.__liaDgsLineColor='#654321';
    line.__liaDgsFillColor='#abcdef';line.__liaDgsOpacity=0.55;line.setAttribute({fixed:false});
    const polygon=Object.values(__areaEntries).find(e=>e.uid==='roundtrip-area').polygon;
    polygon.__liaDgsPolygonName='Delta';polygon.__liaDgsPolygonAutoName=false;polygon.__liaDgsShowName=true;
    const side=polygon.borders[1];side.__liaDgsSegmentName='b';side.__liaDgsShowName=true;
    side.__liaDgsShowLength=true;side.__liaDgsTextColor='#0a0b0c';side.__liaDgsLineColor='#102030';
    side.__liaDgsFillColor='#405060';side.__liaDgsOpacity=0.45;side.__liaDgsLineStyle='dashed';
    side.setAttribute({strokeColor:'#102030',dash:2,fixed:false});
    const container=__boards.A1.containerObj;
    container.querySelector('.lia-dgs-zoom-mode-button').click();
    container.querySelector('.lia-dgs-set-square-button').click();
    container.querySelector('.lia-dgs-axis-scale-button').click();
    container.querySelectorAll('.lia-dgs-axis-scale-submenu button')[1].click();
    __boards.A1.update();
    return {
      arcs:__boards.A1.objectsList.filter(o=>o.__liaDgsCompassArc&&!o.__liaDgsCompassDraft).length,
      bisectors:__boards.A1.objectsList.filter(o=>o.__liaDgsAngleBisector).length,
      analyses:Object.values(__objectAnalysisPointEntries).filter(e=>e.boardId==='A1').map(e=>({kind:e.kind,source:e.sourceName,count:e.points.length})),
      errors:profileErrors.slice()
    };
  })()`);
  assert.equal(created.arcs,2,JSON.stringify(created));
  assert.equal(created.bisectors,1,JSON.stringify(created));
  assert.equal(created.analyses.filter(e=>e.kind==='roots'&&e.count===1).length,2,JSON.stringify(created));
  assert.equal(created.analyses.find(e=>e.kind==='intersections')?.count,2,JSON.stringify(created));
  assert.deepEqual(created.errors,[]);
  await evaluate(`(() => {
    window.bindingLine=Object.values(__linearObjectEntries).find(e=>e.uid==='roundtrip-line').object;
    const container=__boards.A1.containerObj;
    container.querySelector('.lia-dgs-point-button').click();
    container.querySelector('.lia-dgs-point-submenu .lia-dgs-geometry-tool').click();
    const [clientX,clientY]=screenPoint(2.5,1.75);
    __boards.A1.containerObj.dispatchEvent(new PointerEvent('pointerdown',{
      bubbles:true,cancelable:true,button:0,isPrimary:true,clientX,clientY
    }));
  })()`);
  const boundPoint=await evaluate(`(() => {
    window.uiBoundPoint=__boards.A1.objectsList.find(o=>o.__liaDgsPointName&&o.slideObject===bindingLine);
    if(uiBoundPoint)return {id:uiBoundPoint.id,name:uiBoundPoint.__liaDgsPointName,
      x:uiBoundPoint.X(),y:uiBoundPoint.Y(),source:uiBoundPoint.slideObject===bindingLine};
    return {source:false,line:{type:bindingLine.elType,dgs:bindingLine.__liaDgsLine,
      segment:bindingLine.__liaDgsSegment},points:__boards.A1.objectsList
        .filter(o=>o.__liaDgsPointName).map(o=>({name:o.__liaDgsPointName,x:o.X(),y:o.Y(),slide:!!o.slideObject})),
      button:__boards.A1.containerObj.querySelector('.lia-dgs-point-button').getAttribute('aria-pressed')};
  })()`);
  assert.equal(boundPoint?.source,true,JSON.stringify(boundPoint));
  await evaluate(`(() => {
    const [clientX,clientY]=screenPoint(uiBoundPoint.X(),uiBoundPoint.Y());
    __boards.A1.containerObj.dispatchEvent(new MouseEvent('contextmenu',{
      bubbles:true,cancelable:true,button:2,clientX,clientY
    }));
  })()`);
  await sleep(100);
  const released=await evaluate(`(() => {
    const option=Array.from(__boards.A1.containerObj.querySelectorAll('.lia-dgs-context-option'))
      .find(label=>label.textContent.includes('An Objekt gebunden'));
    if(!option)throw Error('Binding checkbox missing');
    option.querySelector('input').click();
    return {same:uiBoundPoint.id===${JSON.stringify(boundPoint?.id)},source:!!uiBoundPoint.slideObject};
  })()`);
  assert.deepEqual(released,{same:true,source:false});
  const rebound=await evaluate(`(() => {
    const option=Array.from(__boards.A1.containerObj.querySelectorAll('.lia-dgs-context-option'))
      .find(label=>label.textContent.includes('An Objekt gebunden'));
    option.querySelector('input').click();
    return {same:uiBoundPoint.id===${JSON.stringify(boundPoint?.id)},source:uiBoundPoint.slideObject===bindingLine};
  })()`);
  assert.deepEqual(rebound,{same:true,source:true});
  console.log('PASS point tool binds to an object and the context checkbox releases and rebinds in place');
  // Ownership reconciliation is scheduled because macro objects may be added
  // after the DGS shell has already claimed its board.
  await sleep(500);
  await evaluate(`(() => {
    const line=Object.values(__linearObjectEntries).find(e=>e.uid==='roundtrip-line').object;
    __applyDgsObjectExportFormat('A1',line,{textColor:'#123456',lineColor:'#654321',fillColor:'#abcdef',
      opacity:0.55,fixed:false,showEquation:true});
    const side=Object.values(__areaEntries).find(e=>e.uid==='roundtrip-area').polygon.borders[1];
    side.__liaDgsSegmentName='b';side.__liaDgsShowName=true;side.__liaDgsShowLength=true;
    side.__liaDgsLineStyle='dashed';side.setAttribute({dash:2});
    __applyDgsObjectExportFormat('A1',side,{textColor:'#0a0b0c',lineColor:'#102030',fillColor:'#405060',
      opacity:0.45,fixed:false,showName:true,showLength:true});
    __boards.A1.update();
  })()`);

  const block=await evaluate(`(() => {
    const container=__boards.A1.containerObj;
    container.querySelector('.lia-dgs-object-list-export').click();
    container.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
    return container.querySelector('.lia-dgs-export-textarea').value;
  })()`);
  assert.equal((block.match(/^@Zirkelbogen\(/gm)||[]).length,2,block);
  assert.equal((block.match(/^@Winkelhalbierende\(/gm)||[]).length,1,block);
  assert.equal((block.match(/^@ObjektNullstellen\(/gm)||[]).length,2,block);
  assert.equal((block.match(/^@Schnittpunkt\(/gm)||[]).length,1,block);
  assert.match(block,/^@Winkel\(.+;zielwinkel=60/m);
  assert.match(block,/^@KoordText\(.+;fontsize=31;fixed=0/m);
  assert.match(block,/^@Flaeche\(.+;name=Delta/m);
  assert.match(block,/^@PlotFunktion\(.+;term=1/m);
  assert.match(block,/^@ObjektFormat\(.+;g;textcolor=#123456;linecolor=#654321;fillcolor=#abcdef;opacity=0\.55;fixed=0;.*;gleichung=1(?:;|`\))/m);
  assert.match(block,/^@ObjektFormat\(.+;side:Delta:1;textcolor=#0a0b0c;linecolor=#102030;fillcolor=#405060;opacity=0\.45;fixed=0;.+linestyle=dashed/m);
  assert.match(block,/^@DGS\(.+;zoom=vertical;axisscale=log-x;viewmode=switchable;setsquare=\[1,/m);
  assert.match(block,/^@ObjektNullstellen\(.+;g;/m);
  assert.match(block,/^@ObjektNullstellen\(.+;\[P;Q\];/m);
  assert.match(block,/^@Punkt\(.+;auf=g/m);
  assert.doesNotMatch(block,/nicht als Makro exportiert|not exported as a macro/i);

  await evaluate(`window.exportBlock=${JSON.stringify(block)};void 0;`);
  const imported=await evaluate(`(async () => {
    const root=document.createElement('section');root.style.width='700px';document.body.append(root);
    const definitions={
      Punkt:['point-spec-'],Gerade:['linear-spec-','line'],Flaeche:['area-spec-'],
      Winkelhalbierende:['relation-spec-','angle-bisector'],Zirkelbogen:['compass-arc-spec-'],
      Winkel:['angle-spec-'],KoordText:['coord-text-spec-','', 'lia-coord-text-spec'],
      PlotFunktion:['plot-spec-'],ObjektFormat:['object-format-spec-'],
      ObjektNullstellen:['object-analysis-spec-','roots'],Schnittpunkt:['object-analysis-spec-','intersections'],
      DGS:['dgs-ui-'],AchsenBeschriftung:['axis-title-spec-']
    };
    let id='';let sequence=0;
    for(const line of exportBlock.split('\\n')) {
      const match=line.match(/^@(\\w+)\\(.(.*).\\)$/);
      if(!match)continue;
      const [,macro,spec]=match,uid='construction-import-'+sequence++;
      if(macro==='Koordinatensystem') {
        id=spec.match(/(?:^|;)id=([^;]+)/)[1];
        const host=document.createElement('lia-coordinate-board');
        host.dataset.liaCoordinateKey=uid;host.dataset.spec=spec;root.append(host);
      } else {
        const definition=definitions[macro];if(!definition)throw Error('Unknown exported macro '+macro);
        const node=document.createElement('span');node.id=definition[0]+uid;node.dataset.spec=spec;
        node.dataset.language='de';if(definition[1])node.dataset.kind=definition[1];
        if(definition[2])node.className=definition[2];root.append(node);
      }
    }
    for(let i=0;i<100;i++) {
      await new Promise(r=>setTimeout(r,50));
      const board=__boards[id];
      const arcs=Object.values(__compassArcEntries).filter(e=>e.boardId===id);
      const bisector=Object.values(__relationObjectEntries).find(e=>e.boardId===id&&e.kind==='angle-bisector');
      const analyses=Object.values(__objectAnalysisPointEntries).filter(e=>e.boardId===id);
      const angle=Object.values(__angleEntries).find(e=>e.boardId===id);
      const text=Object.values(__coordTextEntries).find(e=>e.boardId===id);
      const fn=Object.values(__plotFunctionEntries).find(e=>e.boardId===id);
      const area=Object.values(__areaEntries).find(e=>e.boardId===id);
      const line=Object.values(__linearObjectEntries).find(e=>e.boardId===id);
      const boundPoint=board&&line&&Object.values(__points[id]||{}).find(point=>point.slideObject===line.object);
      if(board&&arcs.length===2&&bisector&&angle&&text&&fn&&area&&line&&boundPoint&&
          line.object.__liaDgsTextColor==='#123456'&&area.polygon.borders[1].__liaDgsLineColor==='#102030'&&
          analyses.length===3&&analyses.every(e=>e.points.length)) {
        window.importedConstruction={id,board,arcs,bisector,analyses,angle,text,fn,area,line};
        const side=area.polygon.borders[1];
        return {
          id,arcs:arcs.length,bisectors:1,
          roots:analyses.filter(e=>e.kind==='roots').map(e=>({source:e.sourceName,point:[e.points[0].X(),e.points[0].Y()]})),
          intersections:analyses.find(e=>e.kind==='intersections').points.map(p=>[p.X(),p.Y()]),
          angle:{measured:angle.angle.__liaDgsMeasuredConstruction,target:angle.angle.__liaDgsTargetAngle},
          text:{font:text.text.__liaDgsTextFontSize,fixed:text.text.getAttribute('fixed')},
          fn:{expression:fn.graph.__liaDgsShowExpression},
          binding:{point:boundPoint.__liaDgsPointName,source:boundPoint.slideObject===line.object},
          line:{equation:line.object.__liaDgsShowEquation,text:line.object.__liaDgsTextColor,
            stroke:line.object.__liaDgsLineColor,fill:line.object.__liaDgsFillColor,
            opacity:line.object.__liaDgsOpacity,fixed:line.object.getAttribute('fixed')},
          polygon:{name:area.polygon.__liaDgsPolygonName,show:area.polygon.__liaDgsShowName,
            side:{name:side.__liaDgsSegmentName,show:side.__liaDgsShowName,length:side.__liaDgsShowLength,
              text:side.__liaDgsTextColor,stroke:side.__liaDgsLineColor,fill:side.__liaDgsFillColor,
              opacity:side.__liaDgsOpacity,style:side.__liaDgsLineStyle,fixed:side.getAttribute('fixed')}},
          boardState:{zoom:board.__liaDgsZoomMode,scale:board.__liaDgsAxisScaleMode,
            setSquare:board.containerObj.querySelector('.lia-dgs-set-square-overlay')?.dataset.visible},
          errors:profileErrors.slice()
        };
      }
    }
    const board=__boards[id];
    const angle=Object.values(__angleEntries).find(e=>e.boardId===id);
    const text=Object.values(__coordTextEntries).find(e=>e.boardId===id);
    const fn=Object.values(__plotFunctionEntries).find(e=>e.boardId===id);
    const area=Object.values(__areaEntries).find(e=>e.boardId===id);
    const line=Object.values(__linearObjectEntries).find(e=>e.boardId===id);
    const boundPoint=board&&line&&Object.values(__points[id]||{}).find(point=>point.slideObject===line.object);
    throw Error('Imported construction missing: '+JSON.stringify({id,errors:profileErrors,
      ready:{board:!!board,angle:!!angle,text:!!text,fn:!!fn,area:!!area,line:!!line,boundPoint:!!boundPoint,
        lineText:line?.object?.__liaDgsTextColor,sideColor:area?.polygon?.borders?.[1]?.__liaDgsLineColor},
      arcs:Object.values(__compassArcEntries).map(e=>e.boardId),
      relations:Object.values(__relationObjectEntries).map(e=>({board:e.boardId,kind:e.kind})),
      analyses:Object.values(__objectAnalysisPointEntries).map(e=>({board:e.boardId,kind:e.kind,source:e.sourceName,count:e.points.length}))}));
  })()`);
  assert.equal(imported.arcs,2);
  assert.equal(imported.bisectors,1);
  assert.equal(imported.roots.length,2);
  assert.ok(imported.roots.some(e=>e.source==='g'&&Math.abs(e.point[0]+1)<.02),JSON.stringify(imported));
  assert.ok(imported.roots.some(e=>e.source==='[P;Q]'&&Math.abs(e.point[0]+2)<.02),JSON.stringify(imported));
  assert.equal(imported.intersections.length,2);
  assert.deepEqual(imported.angle,{measured:true,target:60});
  assert.deepEqual(imported.text,{font:31,fixed:false});
  assert.equal(imported.fn.expression,true);
  assert.equal(imported.binding.source,true,JSON.stringify(imported));
  assert.deepEqual(imported.line,{equation:true,text:'#123456',stroke:'#654321',fill:'#abcdef',opacity:0.55,fixed:false});
  assert.deepEqual(imported.polygon,{name:'Delta',show:true,side:{name:'b',show:true,length:true,
    text:'#0a0b0c',stroke:'#102030',fill:'#405060',opacity:0.45,style:'dashed',fixed:false}});
  assert.deepEqual(imported.boardState,{zoom:'vertical',scale:'log-x',setSquare:'1'});
  imported.intersections.forEach(p=>assert.ok(Math.abs(p[0])<.02&&Math.abs(Math.abs(p[1])-Math.sqrt(12))<.03,JSON.stringify(imported)));
  assert.deepEqual(imported.errors,[]);

  const beforeUpdate=await evaluate(`(() => {
    const {id,bisector,analyses}=importedConstruction;
    const lineRoot=analyses.find(e=>e.kind==='roots'&&e.sourceName==='g').points[0];
    const sideRoot=analyses.find(e=>e.kind==='roots'&&e.sourceName==='[P;Q]').points[0];
    const crossings=analyses.find(e=>e.kind==='intersections').points;
    return {lineRoot:lineRoot.X(),sideRoot:sideRoot.X(),crossing:crossings[0].X(),
      measuredThird:[__points[id].M3.X(),__points[id].M3.Y()],
      bisector:[bisector.object.point2.X()-bisector.object.point1.X(),bisector.object.point2.Y()-bisector.object.point1.Y()]};
  })()`);
  await evaluate(`(() => {
    const {id,board}=importedConstruction,p=__points[id];
    p.G2.setPosition(JXG.COORDS_BY_USER,[3,3]);
    p.Q.setPosition(JXG.COORDS_BY_USER,[2,3]);
    p.C.setPosition(JXG.COORDS_BY_USER,[4,-1]);
    p.C1.setPosition(JXG.COORDS_BY_USER,[-3,0]);
    p.M1.setPosition(JXG.COORDS_BY_USER,[2,0]);
    p.M1.triggerEventHandlers?.(['drag'],[{type:'drag'}]);
    board.update();
  })()`);
  await sleep(300);
  const afterUpdate=await evaluate(`(() => {
    const {bisector,analyses}=importedConstruction;
    const lineRoot=analyses.find(e=>e.kind==='roots'&&e.sourceName==='g').points[0];
    const sideRoot=analyses.find(e=>e.kind==='roots'&&e.sourceName==='[P;Q]').points[0];
    const crossings=analyses.find(e=>e.kind==='intersections').points;
    return {lineRoot:lineRoot.X(),sideRoot:sideRoot.X(),crossing:crossings[0].X(),
      measuredThird:[__points[importedConstruction.id].M3.X(),__points[importedConstruction.id].M3.Y()],
      bisector:[bisector.object.point2.X()-bisector.object.point1.X(),bisector.object.point2.Y()-bisector.object.point1.Y()],
      errors:profileErrors.slice()};
  })()`);
  assert.ok(Math.abs(afterUpdate.lineRoot-beforeUpdate.lineRoot)>.2,JSON.stringify({beforeUpdate,afterUpdate}));
  assert.ok(Math.abs(afterUpdate.sideRoot-beforeUpdate.sideRoot)>.2,JSON.stringify({beforeUpdate,afterUpdate}));
  assert.ok(Math.abs(afterUpdate.crossing-beforeUpdate.crossing)>.2,JSON.stringify({beforeUpdate,afterUpdate}));
  assert.ok(Math.abs(afterUpdate.measuredThird[0]-1)<.02&&Math.abs(afterUpdate.measuredThird[1]-Math.sqrt(3))<.02,
    JSON.stringify({beforeUpdate,afterUpdate}));
  assert.ok(Math.hypot(afterUpdate.bisector[0]-beforeUpdate.bisector[0],afterUpdate.bisector[1]-beforeUpdate.bisector[1])>.05,
    JSON.stringify({beforeUpdate,afterUpdate}));
  assert.deepEqual(afterUpdate.errors,[]);

  const reexported=await evaluate(`(() => {
    const c=importedConstruction.board.containerObj;c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
    return c.querySelector('.lia-dgs-export-textarea').value;
  })()`);
  for(const macro of ['Zirkelbogen','Winkelhalbierende','Winkel','ObjektFormat','ObjektNullstellen','Schnittpunkt']) {
    assert.ok(reexported.includes('@'+macro+'('),'Re-export misses '+macro+'\n'+reexported);
  }
  assert.match(reexported,/^@Punkt\(.+;auf=g/m);
  assert.doesNotMatch(reexported,/nicht als Makro exportiert|not exported as a macro/i);
  console.log('PASS compass arcs, angle bisectors, arc intersections, and linear roots survive export/import/re-export');

} finally {
  if (send && ws?.readyState === WebSocket.OPEN) {
    await withTimeout(send('Browser.close'), 'Browser shutdown', 2_000).catch(() => {});
  }
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  ws?.close();
  server.closeAllConnections();
  server.close();
  proc?.kill();
  await sleep(300);
  // Only delete the exact directory returned by mkdtemp under the OS temp root.
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/'))) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold locks. */ }
  }
}
