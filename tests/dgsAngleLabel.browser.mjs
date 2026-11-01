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
const fixture = join(root, 'tests/fixtures/dynamic-pan-zoom.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-dgs-angle-label-chrome-'));
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

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=1&instrument=0&integration=0' });
  await loaded;
  await evaluate('profileReady()');
  await sleep(250);

  const setup = await evaluate(`(() => {
    const half=20*Math.PI/180,E=[0,3],length=3;
    const definitions={U:[E[0]+length*Math.cos(-half),E[1]+length*Math.sin(-half)],V:E,W:[E[0]+length*Math.cos(half),E[1]+length*Math.sin(half)]};
    for(const [name,[x,y]] of Object.entries(definitions)) {
      if(!finalizePointFromSpec('A1;'+name+';'+x+';'+y+';#ff00ff;1')) return {ok:false,stage:'point',name,existing:Object.keys(__points.A1||{})};
    }
    const board=__boards.A1,container=board.containerObj;
    window.angleScreenPoint=(point)=>{const rect=container.getBoundingClientRect();
      return [rect.left+board.origin.scrCoords[1]+point.X()*board.unitX,
        rect.top+board.origin.scrCoords[2]-point.Y()*board.unitY];};
    const button=[...container.querySelectorAll('.lia-dgs-angle-submenu .lia-dgs-geometry-tool')]
      .find(item=>item.textContent.trim()==='Winkel markieren');
    if(!button)return {ok:false,stage:'button',buttons:[...container.querySelectorAll('.lia-dgs-angle-submenu .lia-dgs-geometry-tool')].map(item=>item.textContent.trim())};button.click();return {ok:true};
  })()`);
  assert.equal(setup.ok, true, 'angle tool setup failed: '+JSON.stringify(setup));
  for (const name of ['U', 'V', 'W']) await clickAt(await evaluate(`angleScreenPoint(__points.A1.${name})`));
  await sleep(300);

  const exists = await evaluate(`!!__boards.A1.objectsList.find(object=>object.__liaDgsAngle&&!object.__liaDgsMacroManaged)`);
  assert.equal(exists, true, 'DGS angle missing');

  const readPlacement = async boundingBox => {
    await evaluate(`(() => {const board=__boards.A1;board.setBoundingBox(${JSON.stringify(boundingBox)},false);
      if(board.fullUpdate)board.fullUpdate();else board.update();})()`);
    await sleep(300);
    return evaluate(`(() => {
      const board=__boards.A1,angle=board.objectsList.find(object=>object.__liaDgsAngle&&!object.__liaDgsMacroManaged);
      const points=angle.__liaDgsAnglePoints,label=angle.__liaDgsAngleLabel,vertex=points[1];
      const ux=points[0].X()-vertex.X(),uy=points[0].Y()-vertex.Y();
      const vx=points[2].X()-vertex.X(),vy=points[2].Y()-vertex.Y();
      let radians=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);if(radians<0)radians+=Math.PI*2;
      const direction=Math.atan2(uy,ux)+radians/2,dx=Math.cos(direction),dy=Math.sin(direction);
      const pixelsPerUnit=Math.hypot(dx*board.unitX,dy*board.unitY);
      const radius=Math.max(.05,Math.min(.8,Math.min(Math.hypot(ux,uy),Math.hypot(vx,vy))*.35));
      const deltaX=(label.X()-vertex.X())*board.unitX,deltaY=-(label.Y()-vertex.Y())*board.unitY;
      const distance=Math.hypot(deltaX,deltaY),rect=label.rendNode.getBoundingClientRect();
      const screenX=dx*board.unitX/pixelsPerUnit,screenY=-dy*board.unitY/pixelsPerUnit;
      const radialHalf=Math.abs(screenX)*rect.width/2+Math.abs(screenY)*rect.height/2;
      return {distance,radius:radius*pixelsPerUnit,radialHalf,width:rect.width,height:rect.height,
        text:label.rendNode.textContent,errors:profileErrors.slice()};
    })()`);
  };

  const close = await readPlacement([-1.5,4.5,1.5,1.5]);
  assert.ok(close.width > 20 && close.height > 10, JSON.stringify(close));
  assert.ok(close.distance + close.radialHalf + 3 < close.radius,
    'close zoom should place the complete label inside: ' + JSON.stringify(close));
  assert.match(close.text.replace(/\s/g,''), /UVW/);
  assert.deepEqual(close.errors, []);

  const far = await readPlacement([-6,9,6,-3]);
  assert.ok(far.distance - far.radialHalf >= far.radius + 6,
    'far zoom should keep the complete label just outside: ' + JSON.stringify(far));
  assert.ok(far.distance - far.radialHalf - far.radius <= 10,
    'outside gap should stay pixel-relative: ' + JSON.stringify(far));
  assert.deepEqual(far.errors, []);

  const closeAgain = await readPlacement([-1.5,4.5,1.5,1.5]);
  assert.ok(closeAgain.distance + closeAgain.radialHalf + 3 < closeAgain.radius,
    'zooming in again should return the label inside: ' + JSON.stringify(closeAgain));
  const macroCreated = await evaluate(`renderAngleFromSpec('adaptive-label','A1;alpha;[U;V;W];#00a8b5;1','de')`);
  assert.equal(macroCreated, true, 'macro angle missing');
  await sleep(300);
  const macroClose = await evaluate(`(() => {
    const board=__boards.A1,entry=__angleEntries['angle-adaptive-label'],angle=entry?.angle,label=entry?.label;
    const points=angle?.__liaDgsAnglePoints,vertex=points?.[1];if(!angle||!label||!vertex)return {missing:true};
    const ux=points[0].X()-vertex.X(),uy=points[0].Y()-vertex.Y();
    const vx=points[2].X()-vertex.X(),vy=points[2].Y()-vertex.Y();
    let radians=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);if(radians<0)radians+=Math.PI*2;
    const direction=Math.atan2(uy,ux)+radians/2,dx=Math.cos(direction),dy=Math.sin(direction);
    const pixelsPerUnit=Math.hypot(dx*board.unitX,dy*board.unitY);
    const radius=Math.max(.05,Math.min(.8,Math.min(Math.hypot(ux,uy),Math.hypot(vx,vy))*.35))*pixelsPerUnit;
    const distance=Math.hypot((label.X()-vertex.X())*board.unitX,(label.Y()-vertex.Y())*board.unitY);
    return {distance,radius,text:label.rendNode.textContent,errors:profileErrors.slice()};
  })()`);
  assert.ok(!macroClose.missing && macroClose.distance < macroClose.radius, JSON.stringify(macroClose));
  assert.match(macroClose.text.toLowerCase(), /α|alpha/);
  assert.deepEqual(macroClose.errors, []);
  console.log('PASS adaptive angle label moves inside on close zoom and stays pixel-close outside on far zoom');
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  try { ws?.close(); } catch {}
  try { proc?.kill(); } catch {}
  await new Promise(resolve => server.close(resolve));
  if (profile) try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
