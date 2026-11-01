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
const fixture = join(root, 'tests/fixtures/dynamic-3d-axis-drag.html');
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
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-sphere-style-chrome-'));
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
  // Inspect the rendered SVG, including the formerly filled orientation circles.
  await evaluate(`(() => {
    window.inspectSphereStyle = object => {
      const proxy=object.element2D||object,node=proxy.rendNode;
      const fill=node.getAttribute('fill')||getComputedStyle(node).fill;
      const gradientId=fill.match(/#([^)'" ]+)/)?.[1],gradient=gradientId?document.getElementById(gradientId):null;
      const stop=gradient?.querySelector('stop');
      const color=value=>String(value||'').trim().toLowerCase();
      return {line:color(node.getAttribute('stroke')),fill:color(stop?.getAttribute('stop-color')||stop?.style.stopColor||fill),
        opacity:Number(node.getAttribute('fill-opacity')),metadata:{line:object.__liaDgsLineColor,fill:object.__liaDgsFillColor},
        guides:(object.__liaSphere3DGuideCurves||[]).map(guide=>{const p=guide.element2D||guide,n=p.rendNode;return {
          role:guide.__liaSphere3DGuideRole,fill:color(n.getAttribute('fill')||getComputedStyle(n).fill),opacity:Number(n.getAttribute('fill-opacity')),
          configuredFill:color(p.visProp.fillcolor),highlightFill:color(p.visProp.highlightfillcolor),highlightOpacity:Number(p.visProp.highlightfillopacity),
          line:color(n.getAttribute('stroke')),dash:Number(p.visProp.dash),path:String(n.getAttribute('d')||'').length
        };})};
    };
  })()`);
  const assertUnfilledSphereGuides=(style,context)=>{
    assert.equal(style.guides.length,4,context+': '+JSON.stringify(style));
    for(const guide of style.guides){
      assert.equal(guide.configuredFill,'none',context+': '+JSON.stringify(guide));
      assert.equal(guide.opacity,0,context+': '+JSON.stringify(guide));
      assert.equal(guide.highlightFill,'none',context+': '+JSON.stringify(guide));
      assert.equal(guide.highlightOpacity,0,context+': '+JSON.stringify(guide));
      assert.ok(guide.path>20,context+': missing guide path '+JSON.stringify(guide));
      assert.equal(guide.dash===0,guide.role==='front',context+': hidden half must stay dashed '+JSON.stringify(guide));
    }
  };
  for(const style of await evaluate(`[...__coordinateViews3d.raum.sphereObjects].map(inspectSphereStyle)`)){
    assertUnfilledSphereGuides(style,'initial macro sphere');
  }
  await evaluate(`(() => {const button=[...__boards.raum.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(b=>b.textContent.includes('Kugel mit festem Radius'));button.click();})()`);
  await clickAt(await evaluate('pointScreen("P")'));
  const roundHistory=async kind=>{await evaluate(`(() => {const s=Object.values(__liaRegressionStates).find(s=>s.boardId==='raum');s[${JSON.stringify(kind)}+'Button'].click();})()`);await sleep(220)};
  const openStyledSphere=()=>evaluate(`(() => {
    const object=[...__coordinateViews3d.raum.sphereObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaSphere3DDefinition==='center-radius');
    const container=__boards.raum.containerObj,list=container.querySelector('.lia-dgs-object-list-panel');
    if(!list.classList.contains('is-open'))container.querySelector('.lia-dgs-object-list-button').click();
    const name=object.__liaDgsSphere3DName||object.__liaDgsSphereName;
    const candidates=[...list.querySelectorAll('.lia-dgs-object-list-entry')].filter(item=>item.querySelector('.lia-dgs-object-list-name')?.textContent===name);
    for(const entry of candidates){entry.click();if(__boards.raum.__liaDgs3DHookState.contextObject===object)break;}
    if(__boards.raum.__liaDgs3DHookState.contextObject!==object)throw Error('Sphere property entry missing: '+name+' / '+object.__liaDgsPersistentId);
    return {style:inspectSphereStyle(object),fillHidden:container.querySelector('.lia-dgs-color-button[data-color-kind="fill"]').hidden};
  })()`);
  const styledSphere=()=>evaluate(`inspectSphereStyle([...__coordinateViews3d.raum.sphereObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaSphere3DDefinition==='center-radius'))`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:20});
  const originalStyle=await openStyledSphere();
  assert.equal(originalStyle.fillHidden,true,'Sphere uses its line color, so no independent fill picker is shown');
  await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-color-button[data-color-kind="line"]').click();
    const input=c.querySelector('.lia-dgs-color-hex');input.value='#66ff00';input.dispatchEvent(new Event('change',{bubbles:true}));__boards.raum.update();})()`);
  await sleep(80);
  const coloredSphere=await styledSphere();
  assert.equal(coloredSphere.line,'#66ff00');
  assert.equal(coloredSphere.fill,'#66ff00');
  assert.equal(coloredSphere.opacity,originalStyle.style.opacity);
  assert.deepEqual(coloredSphere.metadata,{line:'#66ff00',fill:'#66ff00'});
  assert.ok(coloredSphere.guides.every(guide=>guide.line==='#66ff00'),JSON.stringify(coloredSphere));
  assertUnfilledSphereGuides(coloredSphere,'DGS linecolor change');
  await roundHistory('undo');
  const colorUndo=await styledSphere();
  assert.equal(colorUndo.line,originalStyle.style.line);
  assert.equal(colorUndo.fill,originalStyle.style.fill);
  assertUnfilledSphereGuides(colorUndo,'color undo');
  await roundHistory('redo');
  const colorRedo=await styledSphere();
  assert.equal(colorRedo.fill,'#66ff00');
  assert.equal(colorRedo.opacity,originalStyle.style.opacity);
  assertUnfilledSphereGuides(colorRedo,'color redo');
  await openStyledSphere();
  await evaluate(`(() => {const c=__boards.raum.containerObj,input=c.querySelector('.lia-dgs-opacity-input');
    input.value='36';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));__boards.raum.update();})()`);
  await sleep(80);
  const translucentSphere=await styledSphere();
  assert.equal(translucentSphere.opacity,.36);
  assertUnfilledSphereGuides(translucentSphere,'opacity change');
  const highlightedSphere=await evaluate(`(() => {const object=[...__coordinateViews3d.raum.sphereObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaSphere3DDefinition==='center-radius');
    object.element2D.highlight?.();for(const guide of object.__liaSphere3DGuideCurves)guide.element2D.highlight?.();
    const style=inspectSphereStyle(object);object.element2D.noHighlight?.();for(const guide of object.__liaSphere3DGuideCurves)guide.element2D.noHighlight?.();return style;})()`);
  assertUnfilledSphereGuides(highlightedSphere,'hover highlight');
  // Older format/export payloads can still contain an independent fill value.
  // Applying them must never turn the construction guides into filled discs.
  const formattedSphere=await evaluate(`(() => {const object=[...__coordinateViews3d.raum.sphereObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaSphere3DDefinition==='center-radius');
    __applyDgsObjectExportFormat('raum',object,{lineColor:'#66ff00',fillColor:'#ff8800',opacity:.36});
    __boards.raum.update();return inspectSphereStyle(object);})()`);
  assert.equal(formattedSphere.fill,'#66ff00','Legacy fill payload must follow the editor sphere line color');
  assertUnfilledSphereGuides(formattedSphere,'format replay');
  if(process.env.SPHERE_STYLE_SCREENSHOT){
    await evaluate(`(() => {const target=[...__coordinateViews3d.raum.sphereObjects].find(o=>!o.__liaDgsMacroManaged&&o.__liaSphere3DDefinition==='center-radius');
      const e=__coordinateViews3d.raum,others=[...e.sphereObjects,...e.circleObjects,...e.planeObjects,...e.linearObjects].filter(o=>o!==target),nodes=new Set();
      for(const object of others)for(const part of [object,object.element2D,object.label,...(object.__liaSphere3DGuideCurves||[])]){
        const node=part?.element2D?.rendNode||part?.rendNode;if(node)nodes.add(node);
      }
      window.sphereScreenshotRestore=[...nodes].map(node=>[node,node.style.visibility]);for(const node of nodes)node.style.visibility='hidden';
      __boards.raum.containerObj.querySelector('.lia-dgs-side-menu-close')?.click();document.body.style.background='#303030';document.body.style.color='#fff';
    })()`);
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(resolve(root,process.env.SPHERE_STYLE_SCREENSHOT),Buffer.from(screenshot.data,'base64'));
    await evaluate(`sphereScreenshotRestore.forEach(([node,visibility])=>node.style.visibility=visibility)`);
  }
  console.log('PASS sphere color, transparency, unfilled front/rear guides, hover, undo/redo, and format replay');

  const macroStyle=await evaluate(`(() => {
    const add=(id,name,extra)=>{const marker=document.createElement('span');marker.id='sphere3d-spec-'+id;
      marker.hidden=true;marker.dataset.definition='center-radius';marker.dataset.language='de';
      marker.dataset.spec='raum;'+name+';P;#42d66b;radius=2;opacity=0.2;linecolor=#66ff00'+extra;
      document.querySelector('#fixture section').append(marker);return marker;};
    const first=add('style-default','StyleDefault',''),second=add('style-explicit','StyleExplicit',';fillcolor=#abcdef');
    __bootstrapSphere3D();__boards.raum.fullUpdate();
    const lineDefault=inspectSphereStyle(__sphere3DEntries['style-default'].object);
    const explicit=inspectSphereStyle(__sphere3DEntries['style-explicit'].object);
    first.remove();second.remove();__bootstrapSphere3D();__boards.raum.fullUpdate();
    return {lineDefault,explicit};
  })()`);
  assert.equal(macroStyle.lineDefault.line,'#66ff00');
  assert.equal(macroStyle.lineDefault.fill,'#66ff00');
  assert.equal(macroStyle.lineDefault.opacity,.2);
  assert.equal(macroStyle.explicit.fill,'#abcdef');
  assertUnfilledSphereGuides(macroStyle.lineDefault,'macro linecolor');
  assertUnfilledSphereGuides(macroStyle.explicit,'macro explicit fill');

  console.log('PASS sphere macro line-color fallback and explicit authored fill without filled guides');
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
