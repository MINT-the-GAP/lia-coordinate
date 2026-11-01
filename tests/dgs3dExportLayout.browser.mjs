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
const fixture = join(root, 'tests/fixtures/dynamic-3d.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/bundle.js' ? bundle : path.startsWith('/assets/')
    ? join(assets, path.slice(8)) : fixture;
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(file === fixture ? readFileSync(file, 'utf8')
      .replace('width: 820px', 'width: calc(100vw - 24px)')
      .replace('xmin=-5;xmax=5;ymin=-5;ymax=5', 'xmin=-8;xmax=8;ymin=-4;ymax=4')
      .replace('width=760', 'width=1500') : readFileSync(file));
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-linear3d-chrome-'));
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
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method)), 120_000);
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
    await sleep(180);
  };
  const dragAt = async (from, to, modifiers = 0) => {
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1], modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, x: from[0], y: from[1], clickCount: 1, modifiers });
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, modifiers,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, x: to[0], y: to[1], clickCount: 1, modifiers });
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await sleep(220);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await evaluate(`(async()=>{for(let i=0;i<120;i++){if(Object.keys(__linear3DEntries||{}).filter(k=>k.startsWith('macro-')).length===5)return true;await new Promise(r=>setTimeout(r,25));}throw Error('Linear3D macro timeout');})()`);

  await evaluate(`(() => {
    const c=__boards.raum.containerObj;
    c.querySelector('.lia-dgs-object-list-button').click();
    c.querySelector('.lia-dgs-object-list-export').click();
  })()`);
  const failures=[];
  for (const [width,height] of [[1600,1000],[1280,800]]) {
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
    await sleep(250);
    const layout = await evaluate(`(() => {
      const dialog=__boards.raum.containerObj.querySelector('.lia-dgs-export-dialog');
      const step=dialog.querySelector('.lia-dgs-export-tools-step');
      const root=dialog.getRootNode();
      const buttons=[...dialog.querySelectorAll('.lia-dgs-export-tool')];
      const invisible=[];
      for(const button of buttons) {
        const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
        const hit=root.elementFromPoint(x,y);
        if(r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight||!button.contains(hit)) {
          invisible.push({id:button.dataset.toolId,title:button.title,rect:[r.left,r.top,r.right,r.bottom],hit:hit?.className});
        }
      }
      const last=buttons[buttons.length-1],lastRect=last.getBoundingClientRect();
      const actions=[...dialog.querySelectorAll('.lia-dgs-angle-dialog-actions button')].map(b=>{
        const r=b.getBoundingClientRect();return {text:b.textContent,rect:[r.left,r.top,r.right,r.bottom]};
      });
      return {viewport:[innerWidth,innerHeight],count:buttons.length,
        advanced:buttons.filter(b=>Number(b.dataset.toolId)>=1200&&Number(b.dataset.toolId)<=1244).length,
        dimensionTitles:[...dialog.querySelectorAll('.lia-dgs-export-dimension-title')].map(node=>node.textContent),
        sharedBasic:[200,310,320,330,340,610,860].map(id=>buttons.filter(button=>button.dataset.toolId===String(id)).length),
        overflow:step.scrollHeight>step.clientHeight+1,dimensions:[step.clientWidth,step.clientHeight,step.scrollWidth,step.scrollHeight],
        invisible,actions,last:{id:last.dataset.toolId,enabled:last.dataset.enabled,position:[lastRect.left+lastRect.width/2,lastRect.top+lastRect.height/2]}};
    })()`);
    console.log(JSON.stringify(layout));
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(tmpdir(),'dgs-export-'+width+'x'+height+'.png'),Buffer.from(screenshot.data,'base64'));
    if(layout.overflow||layout.invisible.length)failures.push(layout);

    assert.ok(layout.count>=60,'includes the complete separated 2D and 3D tool catalogs');
    assert.equal(layout.advanced,0,'local experimental 3D tools stay out of exports');
    assert.deepEqual(layout.dimensionTitles,['Allgemein','2D','3D']);
    assert.ok(layout.sharedBasic.every(count=>count===2),'shared basics are listed once per dimension');
    assert.ok(layout.actions.every(action=>action.rect[3]<=height&&action.rect[0]>=0));
    if(layout.invisible.some(button=>button.id===layout.last.id))continue;
    await clickAt(layout.last.position);
    const enabled=await evaluate(`__boards.raum.containerObj.querySelector('.lia-dgs-export-tool[data-tool-id="${layout.last.id}"]').dataset.enabled`);
    assert.notEqual(enabled,layout.last.enabled,'last 3D tool toggles by a real mouse click');
  }
  assert.deepEqual(failures,[],'all export tools must fit and be hit-testable');
  assert.deepEqual(await evaluate('profileErrors.slice()'),[]);
  console.log('PASS complete export tool menu is visible and clickable at 1600x1000 and 1280x800');
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
