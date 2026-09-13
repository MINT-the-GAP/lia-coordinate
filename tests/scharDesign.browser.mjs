import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const root = resolve('.'), assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const before = process.argv.includes('--before');
const runtime = process.env.LIASCRIPT_RUNTIME || join(tmpdir(), 'lia-coordinate-webexport', 'course');
const bundle = before ? join(assets, 'schar-baseline-index.js') : join(root, 'dist/index.js');
if (before && !existsSync(bundle)) {
    const r = spawnSync('git', ['show', '8dcdbb50d410cea6b107388d4ef5f7e4dedf63cb:dist/index.js'], { cwd: root, windowsHide: true, maxBuffer: 15e6 });
    assert.equal(r.status, 0);
    writeFileSync(bundle, r.stdout);
}
const reportReplacer=(key,value)=>{if(key==='captureCalls'||key==='rangeLifecycle')return undefined;if(key==='events'&&Array.isArray(value)){const seen=new Set();return value.filter(e=>{if(seen.has(e.type))return false;seen.add(e.type);return true})}if(key==='trace'&&value?.events){const counts={};for(const event of value.events)counts[event.type]=(counts[event.type]||0)+1;const seen=new Set();return{...value,eventCounts:counts,events:value.events.filter(event=>{if(seen.has(event.type))return false;seen.add(event.type);return true})}}return value};
const delay = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
    const requestPath = new URL(req.url, 'http://localhost').pathname;
    if (process.argv.includes('--runtime-debug'))
        console.log('REQUEST', requestPath);
    if (requestPath === '/coordinate.md') {
        res.setHeader('Content-Type', 'text/plain');
        res.end(readFileSync(join(root, 'README.md'), 'utf8').replace(/^import:.*$/m, '').replace('script:   ./dist/index.js', 'script:   http://' + req.headers.host + '/bundle.js'));
        return;
    }
    if (requestPath === '/course.md') {
        res.setHeader('Content-Type', 'text/plain');
        res.end(readFileSync(join(root, 'tests/fixtures/schar-reconstruction.md'), 'utf8').replaceAll('/assets/', 'http://' + req.headers.host + '/assets/').replace('/coordinate.md', 'http://' + req.headers.host + '/coordinate.md'));
        return;
    }
    if (requestPath.startsWith('/runtime/')) {
        const name = requestPath.slice(9) || 'index.html';
        try {
            res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
            let bytes = readFileSync(join(runtime, name));
            if (name === 'index.html')
                bytes = bytes.toString().replace('constructionQuizNestedSolution.md', '/course.md').replace('</head>', '<script src="/fixture-api.js"></script></head>');
            res.end(bytes);
        }
        catch (e) {
            res.statusCode = 404;
            res.end(String(e));
        }
        return;
    }
    const p = new URL(req.url, 'http://localhost').pathname;
    const file = p === '/bundle.js' ? bundle : p === '/fixture-api.js' ? join(root, 'tests/browser/schar-fixture-api.js') : p.startsWith('/assets/') ? join(assets, p.slice(8)) : join(root, 'tests/fixtures/schar-reconstruction.html');
    try {
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(file));
    }
    catch (e) {
        res.statusCode = 404;
        res.end(String(e));
    }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && existsSync(p));
assert.ok(chrome, 'Set CHROME_PATH');
const profile = mkdtempSync(join(tmpdir(), 'lia-schar-chrome-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', '--window-size=1480,1200', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
const pending = new Map(), events = new Map();
let sequence = 0;
try {
    let debug;
    for (let i = 0; i < 100; i++) {
        if (existsSync(join(profile, 'DevToolsActivePort'))) {
            debug = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
            break;
        }
        await delay(100);
    }
    assert.ok(debug, 'Chrome did not start');
    const pages = await (await fetch('http://127.0.0.1:' + debug + '/json')).json();
    ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.id) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        clearTimeout(p?.timer);
        if (m.error)
            p?.reject(Error(JSON.stringify(m.error)));
        else
            p?.resolve(m.result);
    }
    else
        events.get(m.method)?.(m.params); });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression, userGesture = false) => { let r; try { r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }); } catch (error) { throw new Error(error.message + ': ' + expression.slice(0, 180), { cause: error }); } assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await send('Page.enable');
    await send('Runtime.enable');
    events.set('Runtime.exceptionThrown', e => console.log('BROWSER_ERROR', JSON.stringify(e.exceptionDetails)));
    events.set('Runtime.consoleAPICalled', e => { if (process.argv.includes('--runtime-debug'))
        console.log('CONSOLE', e.type, JSON.stringify(e.args)); });
    const navigate = async (query) => { const loaded = new Promise(r => events.set('Page.loadEventFired', r)); await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + (query === 'runtime' ? '/runtime/' : '/?' + query) }); await loaded; await send('Page.bringToFront'); await evaluate('scharFixture.ready()'); };
    const press = async (p, type = 'mouse') => send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1, pointerType: type });
    const move = async (p, type = 'mouse') => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], button:'left', buttons: 1, pointerType: type });
    const release = async (p, type = 'mouse') => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1, pointerType: type });
    const drag = async (from, to, { foreign = false, type = 'mouse' } = {}) => { await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:from[0],y:from[1],buttons:0,pointerType:type}); await delay(30); await press(from, type); for (let i = 1; i <= 12; i++) {
        await move([from[0] + (to[0] - from[0]) * i / 12, from[1] + (to[1] - from[1]) * i / 12], type);
        if (foreign && i === 5) {
            await evaluate('scharFixture.mutateForeign()');
            await delay(120);
        }
        await delay(20);
    } await release(to, type); await delay(180); };
    const state = () => evaluate('scharFixture.state()');
    const report = { before, browser: await send('Browser.getVersion'), bundleSha256: createHash('sha256').update(readFileSync(bundle)).digest('hex'), scenarios: [] };

    const variant=before?'before':(process.argv.includes('--capture-only')?'review':'after');
    const design=()=>evaluate(`(()=>{const e=scharFixture.entry();const read=el=>{if(!el)return null;const c=getComputedStyle(el);return{rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(['width','height','padding','background','border','borderRadius','boxShadow','backdropFilter','fontSize','color','transform','appearance','accentColor','margin','minWidth','maxWidth'].map(k=>[k,c[k]])),inline:el.getAttribute('style')}};return{scale:e.panelScale,locale:document.documentElement.lang,root:e.panel.getRootNode().constructor.name,panel:read(e.panel),range:read(e.slidersByParam.a),row:read(e.slidersByParam.a.parentElement),label:read(e.panel.querySelector('.lia-schar-param-label')),min:read(e.minBtnEl),mini:read(e.miniWrapEl),termToggle:read(e.termToggleWrapEl),resize:read(e.panel.querySelector('.lia-schar-resize-handle')),styles:Array.from(e.panel.getRootNode().querySelectorAll('style')).filter(s=>s.textContent.includes('.lia-schar-slider')).map(s=>s.textContent),values:{...e.values},bbox:e.board.getBoundingBox()}})()`);
    const click=async expr=>{const p=await evaluate('(()=>{const e='+expr+',r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]})()');await press(p);await release(p);await delay(150);};
    for(const context of ['dgs=1','runtime']){
      await navigate(context);
      const initial=await design();
      const shot=await send('Page.captureScreenshot',{format:'png'});
      writeFileSync(join(root,'tests/browser/schar-design-'+variant+'-'+(context==='runtime'?'viewer':'board')+'.png'),Buffer.from(shot.data,'base64'));
      const result={context,initial};
      console.log('DESIGN',variant,context,JSON.stringify({scale:initial.scale,panel:[initial.panel.rect.width,initial.panel.rect.height],range:[initial.range.rect.width,initial.range.rect.height],rootStyleCount:initial.styles.length}));
      if(!before&&!process.argv.includes('--capture-only')){
        const baseline=JSON.parse(readFileSync(join(root,'tests/browser/schar-design-before.json'),'utf8')).scenarios.find(s=>s.context===context).initial;
        assert.equal(initial.scale,baseline.scale,'Restore original panel scale');
        for(const part of ['panel','range','row','label','termToggle','min','resize']){
          for(const property of ['padding','background','border','borderRadius','boxShadow','fontSize','color','transform','appearance','margin']){
            assert.equal(initial[part].style[property],baseline[part].style[property],part+' original '+property);
          }
          for(const property of (part==='termToggle'?['height']:['width','height']))assert.ok(Math.abs(initial[part].rect[property]-baseline[part].rect[property])<.1,part+' original '+property);
        }
        result.visualParity={parts:['panel','range','row','label','termToggle','min','resize'],originalScale:initial.scale,localeTextWidthExcluded:true,absolutePanelTopExcluded:true};
        await evaluate('scharFixture.observeRange("a")');
        const beforeDrag=await state();
        await drag(await evaluate('scharFixture.rangePoint("a")'),await evaluate('scharFixture.rangePoint("a",3)'));
        const afterDrag=await state();
        assert.ok(afterDrag.trace.input.length>=5,'Native range remains continuous');
        assert.equal(afterDrag.activeSame,true);
        assert.deepEqual(afterDrag.bbox,beforeDrag.bbox);
        await click('scharFixture.entry().minBtnEl');
        assert.equal((await state()).panelMinimized,true);
        await click('scharFixture.entry().miniWrapEl');
        assert.equal((await state()).panelMinimized,false);
        for(const [name,value]of [['a',.5],['b',0],['c',0]]){
          const current=await evaluate('(()=>{const s=scharFixture.entry().slidersByParam['+JSON.stringify(name)+'];s.focus();return Number(s.value)})()');
          const key=value<current?'ArrowLeft':'ArrowRight',code=value<current?37:39;
          for(let i=0;i<Math.round(Math.abs(current-value)*10);i++){
            await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});
            await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});
          }
        }
        const beforeGraph=await state();
        await drag(await evaluate('scharFixture.point(3,4.5)'),await evaluate('scharFixture.point(4,2.5)'));
        const afterGraph=await state();
        assert.ok(Math.abs(afterGraph.values.a-.5)<.01);
        assert.ok(Math.abs(afterGraph.values.b-1)<.06);
        assert.ok(Math.abs(afterGraph.values.c+2)<.06);
        assert.deepEqual(afterGraph.bbox,beforeGraph.bbox);
        assert.equal(afterGraph.reconstruction,true);
        result.behavior={nativeInputs:afterDrag.trace.input.length,inputIdentity:afterDrag.activeSame,minimizeRestore:true,graphValues:afterGraph.values,reconstruction:true};
      }
      report.scenarios.push(result);
    }
    writeFileSync(join(root,'tests/browser/schar-design-'+variant+'.json'),JSON.stringify(report,null,2)+'\n');
    await send('Browser.close');
} finally {ws?.close();proc.kill();server.close();for(const r of pending.values()){clearTimeout(r.timer);r.reject(Error('Browser closed'));}}
