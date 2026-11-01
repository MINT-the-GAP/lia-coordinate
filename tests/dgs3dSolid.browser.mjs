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
const fixture = join(root, 'tests/fixtures/dynamic-3d-solid.html');
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

  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-solid3d-chrome-'));
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

  const initial = await evaluate("(() => { const solids=Object.fromEntries(Object.entries(__solid3DEntries).map(([key,e])=>{const p=__coord.coordinatePolygon3DData(e.object),s=__coord.coordinateSolid3DData(e.object);return [key,{definition:e.definition,area:p&&p.area,perimeter:p&&p.perimeter,volume:s&&s.volume,surface:s&&s.surfaceArea,native:String(e.object.elType||e.object.constructor&&e.object.constructor.name||''),faces:(e.object.faces||[]).length}]})); const transforms=Object.fromEntries(Object.entries(__transformation3DEntries).map(([key,e])=>{const s=__coord.coordinateSolid3DData(e.object);return [key,{definition:e.definition,volume:s&&s.volume,surface:s&&s.surfaceArea}]})); const intersections=Object.fromEntries(Object.entries(__intersection3DEntries).map(([key,e])=>[key,e.objects.map(o=>o.__liaDgsSpatialIntersectionKind).sort()])); const bp=__points.raum.BP,bk=__points.raum.BK,cyl=__coord.coordinateSolid3DData(__solid3DEntries['solid:cylinder'].object); const axial=bk.Z()-cyl.baseCenter[2],radial=Math.hypot(bk.X()-cyl.baseCenter[0],bk.Y()-cyl.baseCenter[1]); return {solids,transforms,intersections,bindingPolygon:bp.__liaPoint3DBindingParameters,bindingSolid:bk.__liaPoint3DBindingParameters,bp:[bp.X(),bp.Y(),bp.Z()],bk:[bk.X(),bk.Y(),bk.Z()],radial,axial,errors:profileErrors.slice()}; })()");
  assert.equal(Object.keys(initial.solids).length, 8);
  assert.deepEqual(Object.values(initial.solids).map(value => value.definition).sort(),
    ['cone', 'cuboid', 'cylinder', 'parallelepiped', 'polygon', 'prism', 'pyramid', 'tetrahedron']);
  assert.ok(Math.abs(initial.solids['polygon:base'].area - 4) < 1e-8);
  assert.ok(Math.abs(initial.solids['polygon:base'].perimeter - 8) < 1e-8);
  assert.ok(Math.abs(initial.solids['solid:cuboid'].volume - 8) < 1e-8);
  assert.ok(Math.abs(initial.solids['solid:cuboid'].surface - 24) < 1e-8);
  assert.ok(Object.values(initial.solids).every(value => value.native.length > 0));
  assert.deepEqual(Object.values(initial.transforms).map(value => value.definition).sort(),
    ['dilate', 'reflect-line', 'reflect-plane', 'reflect-point', 'rotate-axis', 'translate']);
  assert.ok(Math.abs(initial.transforms.dilate.volume -
    8 * initial.solids['solid:cone'].volume) < 1e-7);
  assert.ok(Math.abs(initial.transforms.translate.volume -
    initial.solids['solid:cuboid'].volume) < 1e-8);
  assert.deepEqual(initial.bindingPolygon, { kind: 'polygon', u: 0, v: 0 });
  assert.equal(initial.bindingSolid.kind, 'solid');
  assert.equal(initial.bindingSolid.surface, 'side');
  assert.ok(Math.abs(initial.radial - 1) < 1e-8);
  assert.ok(Math.abs(initial.axial - 1) < 1e-8);
  assert.ok(Object.values(initial.intersections).some(kinds => kinds.includes('polygon')));
  assert.ok(Object.values(initial.intersections).some(kinds => kinds.filter(kind => kind === 'point').length >= 2));
  assert.deepEqual(initial.errors, []);

  const reuse = await evaluate(`(() => {
    const sources = Object.fromEntries(Object.entries(__solid3DEntries).map(([key,entry])=>[key,entry.object]));
    const transforms = Object.fromEntries(Object.entries(__transformation3DEntries).map(([key,entry])=>[key,entry.object]));
    const objectCount = __boards.raum.objectsList.length;
    for(let pass=0;pass<2;pass++){
      __bootstrapSolid3D();
      __bootstrapTransformation3D();
    }
    return {
      sourceIdentity:Object.fromEntries(Object.entries(sources).map(([key,object])=>[key,__solid3DEntries[key]?.object===object])),
      transformIdentity:Object.fromEntries(Object.entries(transforms).map(([key,object])=>[key,__transformation3DEntries[key]?.object===object])),
      before:objectCount,after:__boards.raum.objectsList.length
    };
  })()`);
  assert.ok(Object.values(reuse.sourceIdentity).every(Boolean),'Unchanged macros must reuse every solid: '+JSON.stringify(reuse));
  assert.ok(Object.values(reuse.transformIdentity).every(Boolean),'Unchanged transformations must retain their source meshes: '+JSON.stringify(reuse));
  assert.equal(reuse.after,reuse.before,'Repeated bootstraps must not add hidden native mesh objects');

  const solidVisual = await evaluate(`(() => {
    const board=__boards.raum.containerObj.getBoundingClientRect(),keys=['element2D','faces','borders','vertices','points','curves','aux2D','polyhedron','mesh3d','inherits'];
    const inspect=(object,name,definition)=>{const seen=new WeakSet(),nodes=[];const visit=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);const node=value.rendNode;if(node?.getBoundingClientRect)nodes.push(node);for(const key of keys){const child=value[key];if(Array.isArray(child))child.forEach(visit);else visit(child)}};visit(object);const rendered=nodes.map(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node),intersects=rect.right>board.left&&rect.left<board.right&&rect.bottom>board.top&&rect.top<board.bottom;return {tag:node.tagName,path:node.getAttribute?.('d')||'',width:rect.width,height:rect.height,intersects,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>0};});return {name,definition,nodes:rendered.length,visible:rendered.filter(item=>item.visible&&item.intersects&&Math.max(item.width,item.height)>4&&(item.path.includes('L')||['ellipse','circle','polygon','polyline','line'].includes(item.tag))).length,rendered};};
    return [...Object.entries(__solid3DEntries).map(([name,entry])=>inspect(entry.object,name,entry.definition)),...Object.entries(__transformation3DEntries).map(([name,entry])=>inspect(entry.object,name,entry.definition)),...Object.entries(__intersection3DEntries).flatMap(([name,entry])=>entry.objects.map((object,index)=>inspect(object,name+':'+index,'intersection-'+object.__liaDgsSpatialIntersectionKind)))];
  })()`);
  assert.ok(solidVisual.length>14,JSON.stringify(solidVisual));
  const solidSources=solidVisual.filter(item=>!item.definition.startsWith('intersection-')),solidIntersections=solidVisual.filter(item=>item.definition.startsWith('intersection-'));
  assert.ok(solidSources.every(item=>item.nodes>0&&item.visible>0),JSON.stringify(solidVisual));
  assert.ok([...new Set(solidIntersections.map(item=>item.name.split(':')[0]))].every(name=>solidIntersections.some(item=>item.name.startsWith(name+':')&&item.nodes>0&&item.visible>0)),JSON.stringify(solidVisual));
  const moved = await evaluate("(() => { __coord.setCoordinatePoint3D(__points.raum.X,[3,0,0]); __boards.raum.fullUpdate(); const cube=__coord.coordinateSolid3DData(__solid3DEntries['solid:cuboid'].object),movedCube=__coord.coordinateSolid3DData(__transformation3DEntries.translate.object),tetra=__coord.coordinateSolid3DData(__solid3DEntries['solid:tetra'].object); return {cube:cube.volume,movedCube:movedCube.volume,tetra:tetra.volume,errors:profileErrors.slice()}; })()");
  assert.ok(Math.abs(moved.cube - 12) < 1e-8);
  assert.ok(Math.abs(moved.movedCube - 12) < 1e-8);
  assert.ok(Math.abs(moved.tetra - 2) < 1e-8);
  assert.deepEqual(moved.errors, []);

  const tools = await evaluate("(() => [...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].map(button=>button.title||button.getAttribute('aria-label')||button.textContent||'').filter(Boolean))()");
  for (const fragment of ['Raumvieleck', 'Tetraeder', 'Pyramide', 'Prisma', 'Quader', 'Zylinder', 'Kegel', 'Verschiebung', 'Drehung um eine Achse']) {
    assert.ok(tools.some(label => label.includes(fragment)), 'Missing DGS tool: ' + fragment);
  }

  console.log('PASS Segment 5 core: spatial polygons, all solids, intersections, bindings, transformations, DGS tools, and dynamics');
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
