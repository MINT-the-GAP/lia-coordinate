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
  profile = mkdtempSync(join(tmpdir(), 'lia-dgs-slider-animation-chrome-'));
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

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dgs=1&instrument=0&integration=0' });
  await loaded;
  await evaluate('profileReady()');

  const setup = await evaluate(`(() => {
    const marker=document.createElement('span');marker.id='slider-spec-animation';
    marker.dataset.spec='A1;a;0;2;1;2;#ff00ff;[[-2;3];[0;3]]';marker.dataset.language='de';
    document.querySelector('.flex-child').append(marker);__bootstrapSliders();
    window.screenPoint=(x,y)=>{const b=__boards.A1,r=b.containerObj.getBoundingClientRect();
      return [r.left+b.origin.scrCoords[1]+x*b.unitX,r.top+b.origin.scrCoords[2]-y*b.unitY];};
    return true;
  })()`);
  assert.equal(setup, true);
  for (let index = 0; index < 40; index += 1) {
    if (await evaluate(`!!(__sliderEntries['slider-animation']?.slider?.__liaDgsSliderAnimationButton)`)) break;
    await sleep(50);
  }

  const menu = await evaluate(`(() => {
    const c=__boards.A1.containerObj,p=screenPoint(-1,3);
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:p[0],clientY:p[1]}));
    const speed=c.querySelector('.lia-dgs-slider-animation-speed input');
    const checkbox=c.querySelector('.lia-dgs-slider-animation-option input');
    return {open:c.querySelector('.lia-dgs-side-menu').dataset.open,
      speed:speed?.value,checked:checkbox?.checked,
      buttonHidden:c.querySelector('.lia-dgs-slider-animation-button')?.hidden,
      errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(menu, { open: '1', speed: '1.5', checked: true, buttonHidden: false, errors: [] });

  const configured = await evaluate(`(() => {
    const c=__boards.A1.containerObj,speed=c.querySelector('.lia-dgs-slider-animation-speed input');
    speed.value='5';speed.dispatchEvent(new Event('input',{bubbles:true}));
    speed.dispatchEvent(new Event('change',{bubbles:true}));
    const slider=__sliderEntries['slider-animation'].slider;
    return {speed:slider.__liaDgsSliderAnimationSpeed,
      output:c.querySelector('.lia-dgs-slider-animation-speed-output').textContent};
  })()`);
  assert.deepEqual(configured, { speed: 5, output: '5 Schritte/s' });

  const values = await evaluate(`(async () => {
    const slider=__sliderEntries['slider-animation'].slider;
    slider.__liaDgsSliderAnimationButton.click();
    const values=[];
    for(let i=0;i<24;i++){values.push(slider.Value());await new Promise(r=>setTimeout(r,40));}
    slider.__liaDgsSliderAnimationButton.click();
    const paused=slider.Value();await new Promise(r=>setTimeout(r,320));
    return {values,paused,after:slider.Value(),playing:slider.__liaDgsSliderAnimating,
      label:slider.__liaDgsSliderAnimationButton.getAttribute('aria-label')};
  })()`);
  const compressed = values.values.filter((value, index, all) => index === 0 || value !== all[index - 1]);
  assert.deepEqual(compressed.slice(0, 5), [2, 0, 1, 2, 0], JSON.stringify(values));
  assert.equal(values.after, values.paused, 'Pause must keep the current slider value');
  assert.equal(values.playing, false);
  assert.equal(values.label, 'Animation starten');

  const hidden = await evaluate(`(() => {
    const c=__boards.A1.containerObj,checkbox=c.querySelector('.lia-dgs-slider-animation-option input');
    checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    const slider=__sliderEntries['slider-animation'].slider;
    return {hidden:slider.__liaDgsSliderAnimationButton.hidden,show:slider.__liaDgsShowAnimationControl};
  })()`);
  assert.deepEqual(hidden, { hidden: true, show: false });

  const block = await evaluate(`(() => {const c=__boards.A1.containerObj;
    c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();
    return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  assert.match(block, /@Regler\([^\n]*;animationspeed=5;animation=0/);

  const imported = await evaluate(`(() => {
    const ok=renderSliderFromSpec('animation-import','A1;b;0;3;1;1;#1565c0;[[1;3];[3;3]];animationspeed=2.5;animation=0','de');
    const slider=__sliderEntries['slider-animation-import']?.slider;
    return {ok,speed:slider?.__liaDgsSliderAnimationSpeed,show:slider?.__liaDgsShowAnimationControl,
      hidden:slider?.__liaDgsSliderAnimationButton?.hidden,errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(imported, { ok: true, speed: 2.5, show: false, hidden: true, errors: [] });
  console.log('PASS slider play/pause, speed, looping, visibility, and export/import');
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
