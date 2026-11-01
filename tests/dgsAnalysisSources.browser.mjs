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
  profile = mkdtempSync(join(tmpdir(), 'lia-analysis-sources-chrome-'));
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

  const near = (actual, expected, message, tolerance = .045) =>
    assert.ok(Math.abs(actual - expected) < tolerance, message + ': ' + actual + ' vs ' + expected);
  async function clickAt(position) {
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:position[0], y:position[1] });
    await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', buttons:1,
      x:position[0], y:position[1], clickCount:1 });
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', buttons:0,
      x:position[0], y:position[1], clickCount:1 });
    await sleep(90);
  }
  async function tool(id) {
    assert.equal(await evaluate(`(() => {
      const button=__boards.A1.containerObj.querySelector('[data-dgs-tool-id="${id}"]');
      if (!button || button.hidden || button.disabled) return false;
      button.click();return true;
    })()`), true, 'Analysis tool ' + id + ' available');
  }
  async function addSchar(uid, expression, name = 'f') {
    const spec = name + ';x;' + expression + ';A1;term=1';
    await evaluate(`(() => {
      const marker=document.createElement('span');marker.id='schar-spec-${uid}';
      marker.dataset.spec=${JSON.stringify(spec)};
      marker.dataset.language='de';document.querySelector('.flex-child').append(marker);
      __bootstrapScharen();
    })()`);
    await sleep(300);
  }
  async function setup(kind) {
    await navigate({dgs:false});
    await evaluate(`window.screenPoint=(x,y)=>{
      const b=__boards.A1,r=b.containerObj.getBoundingClientRect();
      const sx=r.width/b.containerObj.offsetWidth,sy=r.height/b.containerObj.offsetHeight;
      return [r.left+(b.containerObj.clientLeft+b.origin.scrCoords[1]+x*b.unitX)*sx,
        r.top+(b.containerObj.clientTop+b.origin.scrCoords[2]-y*b.unitY)*sy];
    }`);
    if (kind==='schar') {
      await addSchar('source','a*x^3+b*x^2+c*x+d','sehrLangerFunktionsname');
      await evaluate(`window.entry=__scharEntries['schar-source'];
        for(const [key,value] of Object.entries({a:1,b:0,c:-3,d:0})) {
          entry.slidersByParam[key].value=value;
          entry.slidersByParam[key].dispatchEvent(new Event('input',{bubbles:true}));
        }`);
    } else {
      await evaluate(`(() => {
        const marker=document.createElement('div');marker.id='regression-ui-source';
        marker.dataset.spec='A1';marker.dataset.language='de';document.querySelector('.flex-child').append(marker);
        __setupRegressionUI('source','A1','de');
      })()`);
      await sleep(400);
      await evaluate(`window.regression=Object.values(__liaRegressionStates).find(s=>s.boardId==='A1');
        regression.toolsMenu.querySelector('[data-action="${kind==='drawing'?'recognize':'select-points'}"]').click()`);
      const points=await evaluate(`Array.from({length:${kind==='drawing'?65:9}},(_,i)=>{
        const x=-2+4*i/${kind==='drawing'?64:8}; return screenPoint(x,x*x*x-3*x);
      })`);
      if(kind==='drawing') {
        await evaluate('regression.drawButton.click()');
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points[0][0],y:points[0][1]});
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:points[0][0],y:points[0][1],clickCount:1});
        for(const [x,y] of points.slice(1)) await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x,y});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:points.at(-1)[0],y:points.at(-1)[1],clickCount:1});
        await evaluate(`regression.toolsMenu.querySelector('[data-action="recognize"]').click()`);
        await clickAt(points[16]);
      } else {
        await evaluate(`for(let i=0;i<9;i++){
          const x=-2+i/2, marker=document.createElement('span');
          marker.id='point-spec-sample'+i;marker.dataset.spec='A1;R'+i+';'+x+';'+(x*x*x-3*x)+';fix';
          document.querySelector('.flex-child').append(marker);
        } __bootstrapCreatePoints();`);
        await sleep(200);
        for(const point of points) await clickAt(point);
        assert.equal(await evaluate('regression.regressionPoints.length'),9);
        await evaluate(`regression.toolsMenu.querySelector('[data-action="compute"]').click()`);
      }
      await sleep(300);
      await evaluate(`(() => {
        const select=__boards.A1.containerObj.querySelector('.lia-plot-analysis-select');
        if(!select)throw Error('Curve recognition did not create a model: '+JSON.stringify({active:regression.activeTool,mode:regression.regressionMode,strokes:regression.strokes,errors:profileErrors,states:Object.values(__liaRegressionStates).map(s=>({uid:s.uid,language:s.language,active:s.activeTool,mode:s.regressionMode,strokes:s.strokes.length})),panels:document.querySelectorAll('.lia-plot-analyze-panel').length}));
        if(select.value!=='cubic'){select.value='cubic';select.dispatchEvent(new Event('change',{bubbles:true}));}
        window.entry=regression.cubicAnalysisEntries.at(-1);
        // Recognition fits a sampled, smoothed stroke. Set exact coefficients
        // with the real sliders so the six independent geometry checks have
        // reproducible analytical expectations for both regression sources.
        [1,0,-3,0].forEach((value,i)=>{
          const input=entry.panel.querySelectorAll('input[type="range"]')[i];
          input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
        });
        entry.panel.querySelector('.lia-plot-analysis-close').click();
      })()`);
    }
    await evaluate(`window.source=entry.graph;
      window.regression=Object.values(__liaRegressionStates).find(s=>s.boardId==='A1');
      window.analysisState=()=>{
        const read=key=>(source[key]?.points||[]).filter(p=>Number.isFinite(p.X())&&Number.isFinite(p.Y()))
          .map(p=>[p.X(),p.Y()]).sort((a,b)=>a[0]-b[0]);
        return {roots:read('__liaDgsRootConstruction'),extrema:read('__liaDgsExtremaConstruction'),
          inflections:read('__liaDgsInflectionConstruction'),ordinate:read('__liaDgsYInterceptConstruction'),
          intersections:(source.__liaDgsIntersectionConstructions||[]).flatMap(c=>c.points.map(p=>[p.X(),p.Y()])),
          tangents:(source.__liaDgsTangents||[]).map(t=>({source:t.__liaDgsTangentSource===source,
            point:[t.point1.X(),t.point1.Y()],slope:(t.point2.Y()-t.point1.Y())/(t.point2.X()-t.point1.X())})),
          sourceId:source.__liaDgsPersistentId,errors:profileErrors.slice()};
      };`);
    near(await evaluate('source.Y(1.5)'),-1.125,kind+' generated cubic',.09);
    if(kind==='schar') {
      await sleep(450);
      const bounds=await evaluate(`(() => {
        entry.board.update();
        const board=entry.board.containerObj.getBoundingClientRect();
        const label=entry.graphLabel.rendNode.getBoundingClientRect();
        return {board:{left:board.left,right:board.right,top:board.top,bottom:board.bottom},
          label:{left:label.left,right:label.right,top:label.top,bottom:label.bottom},
          whiteSpace:getComputedStyle(entry.graphLabel.rendNode).whiteSpace};
      })()`);
      assert.ok(bounds.label.left>=bounds.board.left+5,'function label stays inside left board edge: '+JSON.stringify(bounds));
      assert.ok(bounds.label.right<=bounds.board.right-5,'complete function label stays inside right board edge: '+JSON.stringify(bounds));
      assert.ok(bounds.label.top>=bounds.board.top+5 && bounds.label.bottom<=bounds.board.bottom-5,
        'function label stays inside vertical board edges: '+JSON.stringify(bounds));
      assert.equal(bounds.whiteSpace,'nowrap');
    }
  }

  async function verifyQuadraticTwoDimensionalDrag(kind) {
    assert.equal(await evaluate(`(() => {
      const select=entry.panel.querySelector('.lia-plot-analysis-select');
      if(!select)return false;
      select.value='quadratic';select.dispatchEvent(new Event('change',{bubbles:true}));
      window.entry=regression.quadraticAnalysisEntries.at(-1);
      if(!entry)return false;
      [1,0,0].forEach((value,i)=>{
        const input=entry.panel.querySelectorAll('input[type="range"]')[i];
        input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      regression.activeTool='';regression.regressionMode='';
      __boards.A1.containerObj.querySelector('.lia-dgs-select-button').click();
      window.source=entry.graph;
      return true;
    })()`),true,kind+' creates a draggable quadratic model');
    await evaluate(`entry.graph.board.containerObj.scrollIntoView({block:'center',inline:'center'})`);
    await sleep(180);
    const dragStart=await evaluate('screenPoint(1,1)');
    const dragEnd=await evaluate('screenPoint(2,1.75)');
    await drag(dragStart,dragEnd);
    await sleep(180);
    const moved=await evaluate(`({model:{...entry.model},vertex:[-entry.model.c,entry.graph.Y(-entry.model.c)]})`);
    near(moved.model.a,1,kind+' quadratic drag preserves shape',.03);
    near(moved.model.c,-1,kind+' quadratic drag pans horizontally',.08);
    near(moved.model.d,.75,kind+' quadratic drag pans vertically',.08);
    near(moved.vertex[0],1,kind+' quadratic vertex x follows horizontal pan',.08);
    near(moved.vertex[1],.75,kind+' quadratic vertex y follows vertical pan',.08);
    console.log('PASS '+kind+': quadratic regression graph pans horizontally and vertically');
  }

  async function verifyExportRoundtrip(kind) {
    const block=await evaluate(`(() => {
      const container=__boards.A1.containerObj;
      container.querySelector('.lia-dgs-object-list-export').click();
      container.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
      const value=container.querySelector('.lia-dgs-export-textarea').value;
      container.querySelectorAll('.lia-dgs-export-dialog .lia-dgs-angle-dialog-actions button')[1].click();
      return value;
    })()`);
    assert.equal((block.match(/^@Schar\(/gm)||[]).length,2,kind+' exports the recognized curve and the zero Schar exactly once');
    assert.match(block,/params=\[a=1;b=0;c=-3;d=1\]/);
    assert.doesNotMatch(block,/<!--|@Regression\(|@PlotFunktion\(/);
    for(const macro of ['Nullstellen','Extrempunkte','Wendepunkte','Ordinatenabschnitt','Tangente','Schnittpunkt']) {
      assert.ok(block.includes('@'+macro+'('),kind+' exports '+macro);
    }
    await evaluate(`window.exportBlock=${JSON.stringify(block)};void 0;`);
    const mounted=await evaluate(`(async () => {
      const root=document.createElement('section');root.style.width='700px';document.body.append(root);
      const definitions={Punkt:['point-spec-'],Schar:['schar-spec-'],DGS:['dgs-ui-'],
        ObjektFormat:['object-format-spec-'],
        AchsenBeschriftung:['axis-title-spec-'],Tangente:['tangent-spec-'],
        Nullstellen:['function-analysis-spec-','roots'],Extrempunkte:['function-analysis-spec-','extrema'],
        Wendepunkte:['function-analysis-spec-','inflections'],Ordinatenabschnitt:['object-analysis-spec-','ordinate-intercept'],
        Schnittpunkt:['object-analysis-spec-','intersections']};
      let id='';let sequence=0;
      for(const line of exportBlock.split('\\n')) {
        const match=line.match(/^@(\\w+)\\(.(.*).\\)$/);
        if(!match)continue;
        const [,macro,spec]=match;
        const uid='imported-'+${JSON.stringify(kind)}+'-'+sequence++;
        if(macro==='Koordinatensystem') {
          id=spec.match(/(?:^|;)id=([^;]+)/)[1];
          const host=document.createElement('lia-coordinate-board');
          host.dataset.liaCoordinateKey=uid;host.dataset.spec=spec;root.append(host);
        } else {
          const definition=definitions[macro];if(!definition)throw Error('Unknown exported macro '+macro);
          const node=document.createElement('span');node.id=definition[0]+uid;node.dataset.spec=spec;
          node.dataset.language='de';if(definition[1])node.dataset.kind=definition[1];
          root.append(node);
        }
      }
      for(let i=0;i<80;i++){
        await new Promise(r=>setTimeout(r,50));
        const entries=Object.values(__scharEntries).filter(e=>e.boardId===id);
        const imported=entries.find(e=>e.params.includes('a'));
        const b=__boards[id];
        if(imported && b?.objectsList.some(o=>o.__liaDgsTangent) && imported.graph.__liaDgsRootConstruction?.points.length===3) {
          window.importedSchar=imported;window.importedBoard=b;
          return {id,values:{...imported.values},count:entries.length,color:imported.cfg.color,
            curve:[-2,-1,0,1,2].map(x=>imported.graph.Y(x)),
            sliderValues:Object.fromEntries(Object.entries(imported.slidersByParam).map(([name,input])=>[name,Number(input.value)]))};
        }
      }
      throw Error('Imported analyses missing: '+JSON.stringify({id,errors:profileErrors,entries:Object.values(__scharEntries).map(e=>({board:e.boardId,params:e.params,values:e.values}))}));
    })()`);
    assert.equal(mounted.count,2);
    assert.deepEqual(mounted.values,{a:1,b:0,c:-3,d:1});
    assert.deepEqual(mounted.sliderValues,mounted.values);
    mounted.curve.forEach((y,i)=>near(y,[-1,3,1,-1,3][i],kind+' imported curve',1e-9));
    await evaluate(`importedSchar.slidersByParam.d.value=.5;
      importedSchar.slidersByParam.d.dispatchEvent(new Event('input',{bubbles:true}));`);
    await sleep(200);
    const updated=await evaluate(`(() => {
      const graph=importedSchar.graph;
      const points=key=>(graph[key]?.points||[]).map(p=>[p.X(),p.Y()]);
      return {roots:points('__liaDgsRootConstruction'),extrema:points('__liaDgsExtremaConstruction'),
        inflections:points('__liaDgsInflectionConstruction'),ordinate:points('__liaDgsYInterceptConstruction'),
        intersections:(graph.__liaDgsIntersectionConstructions||[]).flatMap(c=>c.points.map(p=>[p.X(),p.Y()])),
        tangents:importedBoard.objectsList.filter(o=>o.__liaDgsTangent).map(t=>[t.point1.X(),t.point1.Y()]),errors:profileErrors.slice()};
    })()`);
    assert.equal(updated.roots.length,3);assert.equal(updated.extrema.length,2);
    assert.equal(updated.inflections.length,1);assert.equal(updated.ordinate.length,1);
    assert.equal(updated.intersections.length,3);assert.equal(updated.tangents.length,1);
    for(const point of updated.roots.concat(updated.intersections)) near(point[0]**3-3*point[0]+.5,0,kind+' imported dynamic roots/intersections',.03);
    near(updated.ordinate[0][1],.5,kind+' imported dynamic ordinate');
    near(updated.inflections[0][1],.5,kind+' imported dynamic inflection');
    near(updated.tangents[0][1],updated.tangents[0][0]**3-3*updated.tangents[0][0]+.5,kind+' imported dynamic tangent');
    assert.deepEqual(updated.errors,[]);
    const again=await evaluate(`(() => {
      const c=importedBoard.containerObj;c.querySelector('.lia-dgs-object-list-export').click();
      c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
      const value=c.querySelector('.lia-dgs-export-textarea').value;
      c.querySelectorAll('.lia-dgs-export-dialog .lia-dgs-angle-dialog-actions button')[1].click();
      return value;
    })()`);
    assert.equal((again.match(/^@Schar\(/gm)||[]).length,2,'re-export does not duplicate hit proxies');
    assert.match(again,/params=\[a=1;b=0;c=-3;d=0.5\]/);
    assert.doesNotMatch(again,/<!--/);
    console.log('PASS '+kind+': export and re-import as adjustable Schar with all six dependent analyses');
  }

  for(const kind of ['schar','drawing','points']) {
    await setup(kind);
    for(const [id,key,count] of [[810,'roots',3],[820,'extrema',2],[830,'inflections',1],[840,'ordinate',1],[850,'tangents',1]]) {
      await tool(id);
      await clickAt(await evaluate('screenPoint(1.5,source.Y(1.5))'));
      const result=await evaluate('analysisState()');
      assert.equal(result[key].length,count,kind+' '+key+': '+JSON.stringify(result));
      await evaluate('regression.undoButton.click()');
      await sleep(80);
      assert.equal((await evaluate('analysisState()'))[key].length,0,kind+' undo '+key);
      await evaluate('regression.redoButton.click()');
      await sleep(80);
      assert.equal((await evaluate('analysisState()'))[key].length,count,kind+' redo '+key);
    }
    const initial=await evaluate('analysisState()');
    initial.roots.forEach((p,i)=>near(p[0],[-Math.sqrt(3),0,Math.sqrt(3)][i],kind+' root'));
    initial.extrema.forEach((p,i)=>{near(p[0],[-1,1][i],kind+' extremum x');near(p[1],[2,-2][i],kind+' extremum y');});
    near(initial.inflections[0][0],0,kind+' inflection');
    near(initial.ordinate[0][1],0,kind+' ordinate');
    assert.equal(initial.tangents[0].source,true,kind+' tangent uses visible source');
    near(initial.tangents[0].slope,3*initial.tangents[0].point[0]**2-3,kind+' tangent slope',.1);
    await addSchar('zero','0*x');
    await tool(860);
    await clickAt(await evaluate('screenPoint(.5,source.Y(.5))'));
    // Repeated clicks on a widened Schar hit zone must never intersect the curve with itself.
    await clickAt(await evaluate('screenPoint(.5,source.Y(.5))'));
    assert.equal((await evaluate('analysisState()')).intersections.length,0);
    await clickAt(await evaluate('screenPoint(4,0)'));
    const intersected=await evaluate('analysisState()');
    assert.equal(intersected.intersections.length,3,kind+' intersections: '+JSON.stringify(intersected));
    intersected.intersections.sort((a,b)=>a[0]-b[0]).forEach((p,i)=>near(p[0],[-Math.sqrt(3),0,Math.sqrt(3)][i],kind+' intersection'));
    await evaluate('regression.undoButton.click()');await sleep(80);
    assert.equal((await evaluate('analysisState()')).intersections.length,0);
    await evaluate('regression.redoButton.click()');await sleep(80);
    assert.equal((await evaluate('analysisState()')).intersections.length,3);
    await evaluate(kind==='schar' ? `entry.slidersByParam.d.value=1;entry.slidersByParam.d.dispatchEvent(new Event('input',{bubbles:true}));` :
      `entry.panel.querySelectorAll('input[type="range"]')[3].value=1;entry.panel.querySelectorAll('input[type="range"]')[3].dispatchEvent(new Event('input',{bubbles:true}));`);
    await sleep(200);
    const changed=await evaluate('analysisState()');
    near(changed.ordinate[0][1],1,kind+' changed ordinate');
    near(changed.inflections[0][1],1,kind+' changed inflection');
    near(changed.extrema[0][1],3,kind+' changed maximum');
    near(changed.extrema[1][1],-1,kind+' changed minimum');
    for(const p of changed.roots.concat(changed.intersections)) near(p[0]**3-3*p[0]+1,0,kind+' changed root/intersection',.07);
    near(changed.tangents[0].point[1],changed.tangents[0].point[0]**3-3*changed.tangents[0].point[0]+1,kind+' tangent contact follows curve',.08);
    assert.deepEqual(changed.errors,[]);
    await evaluate(`(() => {
      const host=document.querySelector('lia-coordinate-board'),parent=host.parentNode,next=host.nextSibling;
      const replacement=host.cloneNode(false);host.remove();parent.insertBefore(replacement,next);
    })()`);
    await evaluate('profileReady()');
    await sleep(900);
    await evaluate(`window.regression=Object.values(__liaRegressionStates).find(s=>s.boardId==='A1');
      window.entry=${kind==='schar' ? "__scharEntries['schar-source']" : 'regression.cubicAnalysisEntries.at(-1)'};
      window.source=entry.graph;void 0;`);
    const remounted=await evaluate('analysisState()');
    assert.equal(remounted.sourceId,changed.sourceId,kind+' stable curve identity after remount');
    for(const key of ['roots','extrema','inflections','ordinate','intersections','tangents']) {
      assert.equal(remounted[key].length,changed[key].length,kind+' remounted '+key+': '+JSON.stringify(remounted));
    }
    near(remounted.ordinate[0][1],1,kind+' remounted ordinate');
    for(const point of remounted.roots.concat(remounted.intersections)) near(point[0]**3-3*point[0]+1,0,kind+' remounted root/intersection',.07);
    assert.deepEqual(remounted.errors,[]);
    await verifyExportRoundtrip(kind);
    if(kind!=='schar') {
      await setup(kind);
      await verifyQuadraticTwoDimensionalDrag(kind);
    }
    if(kind==='schar') {
      assert.equal(await evaluate('entry.dragGraph.__liaDgsAnalysisTarget===source'),true);
      assert.ok(changed.sourceId.startsWith('schar:'));
      await evaluate(`document.getElementById('schar-spec-source').remove();__bootstrapScharen();`);
      await sleep(200);
      const removed=await evaluate('analysisState()');
      for(const key of ['roots','extrema','inflections','ordinate','intersections','tangents']) assert.equal(removed[key].length,0,'removed Schar '+key);
    }
    console.log('PASS '+kind+': all six analysis tools, coordinates, undo/redo, live parameters, and board remount');
  }

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
