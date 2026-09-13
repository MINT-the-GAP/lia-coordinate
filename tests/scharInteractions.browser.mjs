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
    if(process.argv.includes('--native-probe')){
        const probes=[];for(let i=0;i<3;i++){await navigate('runtime');await evaluate('document.querySelector("button[title=Cursor]")?.click()');await evaluate('scharFixture.observeRange("a")');const pre=await state();const target=pre.values.a<2?3:-1;await drag(await evaluate('scharFixture.rangePoint("a")'),await evaluate('scharFixture.rangePoint("a",'+target+')'),{foreign:true});const post=await state();assert.ok(post.trace.input.length>=5,'Fresh viewer first native gesture '+i);assert.equal(post.activeSame,true);assert.equal(post.activeConnected,true);assert.deepEqual(post.bbox,pre.bbox);probes.push({iteration:i,inputs:post.trace.input.length,before:pre.values,after:post.values,trace:post.trace});console.log('FRESH_NATIVE_PASS',i,post.trace.input.length)}writeFileSync(join(root,'tests/browser/schar-native-probe.json'),JSON.stringify({bundleSha256:report.bundleSha256,probes},reportReplacer,2)+'\n');await send('Browser.close');process.exit(0);
    }
    if (process.argv.includes('--runtime-debug')) {
        try {
            await navigate('runtime');
        }
        catch (error) {
            console.log('RUNTIME_DEBUG', await evaluate('JSON.stringify({body:document.body.innerText.slice(0,8000),scripts:Array.from(document.scripts).map(s=>s.src),LIA:window.LIA,boards:Object.keys(window.__boards||{})})'));
            throw error;
        }
        console.log('RUNTIME_READY', await state());
        console.log('RUNTIME_BUTTONS', await evaluate('JSON.stringify(Array.from(document.querySelectorAll("button")).map(b=>({title:b.title,aria:b.getAttribute("aria-label"),class:b.className,text:b.innerText})))'));
        console.log('ANNOTATION', await evaluate('JSON.stringify(window.__LIA_ANNOTATION__?.getStore())'));
        await send('Browser.close');
        process.exit(0);
    }
    if(process.argv.includes('--stack-only')){
        await navigate('dgs=1');const stacking=await evaluate('(async()=>{const marker=document.createElement("span");marker.id="schar-spec-second";marker.dataset.spec="h;x;a*(x-b)^2+c;koordRekonstruktion;term=1";document.querySelector("#board-column").append(marker);await new Promise(r=>setTimeout(r,250));const panels=Array.from(scharFixture.entry().board.containerObj.querySelectorAll(".lia-schar-panel"));const before=panels.map(p=>p.getBoundingClientRect().toJSON());scharFixture.entry().minBtnEl.click();await new Promise(r=>setTimeout(r,150));const minimized=panels.map(p=>p.getBoundingClientRect().toJSON());return{before,minimized}})()');for(const key of ['before','minimized']){const pair=stacking[key].sort((a,b)=>a.top-b.top);assert.equal(pair.length,2);assert.ok(pair[1].top>=pair[0].bottom+8,'Schar panels overlap '+key)}console.log('STACK_PASS',JSON.stringify(stacking));writeFileSync(join(root,'tests/browser/schar-stack.json'),JSON.stringify(stacking,null,2)+'\n');await send('Browser.close');process.exit(0);
    }
    if (process.argv.includes('--light-dom')) {
        await navigate('');
        const light = await evaluate('(async()=>{const host=document.createElement("div");host.id="light-board";host.style.cssText="width:700px;height:500px";document.body.append(host);const board=JXG.JSXGraph.initBoard(host.id,{boundingbox:[-4,6,7,-3],axis:true,showCopyright:false});window.__boards.light=board;const marker=document.createElement("span");marker.id="schar-spec-light";marker.dataset.spec="g;x;a*(x-b)^2+c;light;term=1";document.body.append(marker);await new Promise(r=>setTimeout(r,250));const entry=window.__scharEntries["schar-light"],input=entry.slidersByParam.a;let mutations=0;const observer=new MutationObserver(r=>mutations+=r.length);observer.observe(host,{childList:true,subtree:true});for(let i=0;i<8;i++){window.__bootstrapScharen();board.update();await new Promise(r=>setTimeout(r,30))}observer.disconnect();const result={documentRoot:host.getRootNode()===document,sameInput:input===window.__scharEntries["schar-light"].slidersByParam.a,panelCount:host.querySelectorAll(".lia-schar-panel").length,styleCount:Array.from(document.querySelectorAll("style")).filter(s=>s.textContent.includes(".lia-schar-slider")).length,mutations};marker.remove();await new Promise(r=>setTimeout(r,50));JXG.JSXGraph.freeBoard(board);host.remove();delete __boards.light;return result})()');
        assert.equal(light.documentRoot,true);assert.equal(light.sameInput,true);assert.equal(light.panelCount,1);assert.equal(light.styleCount,1);console.log('LIGHT_DOM_PASS',JSON.stringify(light));writeFileSync(join(root,'tests/browser/schar-light-dom.json'),JSON.stringify(light,null,2)+'\n');await send('Browser.close');process.exit(0);
    }
    await navigate('');
    const initial = await state();
    if (!before) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(root, 'tests/browser/schar-after.png'), Buffer.from(shot.data, 'base64'));
        console.log('SCHAR_RANGE_LAYOUT', JSON.stringify({ range: initial.rangeRect, minButton: initial.minButton }));
    }
    const geometry = await evaluate('(()=>{const b=scharFixture.entry().board,e=b.containerObj;return{canvas:[b.canvasWidth,b.canvasHeight],client:[e.clientWidth,e.clientHeight],offset:[e.offsetWidth,e.offsetHeight],border:[e.clientLeft,e.clientTop],svg:e.querySelector("svg")?.getBoundingClientRect().toJSON()}})()');
    await evaluate('scharFixture.observeRange("a")');
    await drag(await evaluate('scharFixture.rangePoint("a")'), await evaluate('scharFixture.rangePoint("a",3)'));
    const native = await state();if(process.argv.includes('--diagnostics'))writeFileSync(join(root,'tests/browser/schar-native-diagnostic.json'),JSON.stringify(native,null,2));
    await evaluate('scharFixture.observeRange("a")');
    await drag(await evaluate('scharFixture.rangePoint("a")'), await evaluate('scharFixture.rangePoint("a",4.5)'), { foreign: true });
    const mutated = await state();
    report.scenarios.push({ name: 'baseline-native-and-mutation', initial, native, mutated, geometry });
    console.log('SCHAR_BASELINE', JSON.stringify({ before, initial: { styleCount: initial.styleCount, rangeHeight: initial.rangeHeight, dragGraph: initial.dragGraph }, nativeInputs: native.trace.input.length, foreignInputs: mutated.trace.input.length, foreignPreserved: mutated.activeSame }));
    if (!before && !process.argv.includes('--runtime-only')) {
        assert.ok(native.trace.input.length >= 5, 'Mouse drag must update continuously');
        assert.equal(native.trace.events.find(e => e.type === 'pointerdown')?.finalDefaultPrevented, false, 'Range child handler must run without prevention');
        assert.deepEqual(native.bbox, initial.bbox);
        assert.equal(mutated.activeSame, true, 'Foreign DOM mutation replaced active input');
        assert.equal(mutated.activeConnected, true);
        assert.equal(mutated.trace.removed, false);
        assert.ok(mutated.trace.input.length >= 5);
        assert.equal(initial.styleCount, 1, 'Install CSS in actual ShadowRoot');
        assert.ok(Math.abs(initial.rangeHeight / initial.panelScale - 12) < .1, 'Native range retains the original 12px design before panel scaling');
    }
    if (before) {
        await evaluate('scharFixture.entry().slidersByParam.a.focus()');
        let a = await evaluate('scharFixture.entry().values.a');
        for (let i = 0; i < Math.round((a - .5) * 10); i++) {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
        }
        const pre = await state();
        await drag(await evaluate('scharFixture.point(3,4.5)'), await evaluate('scharFixture.point(4,2.5)'));
        const post = await state();
        report.scenarios.push({ label: 'baseline actual graph drag', before: pre.values, after: post.values, bboxBefore: pre.bbox, bboxAfter: post.bbox, reconstruction: post.reconstruction });
    }
    if (!before) {
        const near = (actual, expected, message, tolerance = .06) => assert.ok(Math.abs(actual - expected) < tolerance, message + ': ' + actual + ' != ' + expected);
        const layout = async (label) => { const result = await state(); const controls = result.buttons.filter(b => /(lia-dgs-menu-button|lia-plot-undo-btn|lia-plot-redo-btn)/.test(b.class) && b.rect.height > 0); const bottom = Math.max(...controls.map(b => b.rect.bottom)); assert.ok(result.panel.top >= bottom + 5, label + ': controls overlap ' + JSON.stringify({ panel: result.panel, bottom })); assert.ok(result.panel.right <= result.board.right + 1, label + ': panel extends past board'); return { label, panel: result.panel, controlsBottom: bottom }; };
        const keyboardValue = async (name, value) => { await evaluate('scharFixture.entry().slidersByParam[' + JSON.stringify(name) + '].focus()'); const current = await evaluate('Number(scharFixture.entry().slidersByParam[' + JSON.stringify(name) + '].value)'); const direction = value < current ? 'ArrowLeft' : 'ArrowRight'; const keyCode = value < current ? 37 : 39; for (let i = 0; i < Math.round(Math.abs(value - current) * 10); i++) {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: direction, code: direction, windowsVirtualKeyCode: keyCode });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: direction, code: direction, windowsVirtualKeyCode: keyCode });
        } near(await evaluate('Number(scharFixture.entry().values[' + JSON.stringify(name) + '])'), value, 'Keyboard sets ' + name, .011); };
        const reset = async () => { await keyboardValue('a', .5); await keyboardValue('b', 0); await keyboardValue('c', 0); };
        const graphDrag = async (label, signB = -1, signC = 1, type = 'mouse') => { await reset(); const pre = await state(); await evaluate('window.graphTrace=[];for(const type of ["pointerdown","pointermove","pointerup","mousedown","mousemove"]){window.addEventListener(type,e=>{const r={type,path:e.composedPath().map(t=>t.tagName+"#"+(t.id||"")+"."+(t.className||"")),x:e.clientX,y:e.clientY,defaultPrevented:e.defaultPrevented};graphTrace.push(r);setTimeout(()=>r.finalDefaultPrevented=e.defaultPrevented)},true)}'); await drag(await evaluate('scharFixture.point(3,4.5)'), await evaluate('scharFixture.point(4,2.5)'), { type }); const post = await state(); if (Math.abs(post.values.b + signB)>.06) {writeFileSync(join(root,'tests/browser/schar-graph-diagnostic.json'),JSON.stringify({label,pre,post,trace:await evaluate('window.graphTrace')},null,2));} near(post.values.a, .5, label + ' preserves a'); near(post.values.b, -signB, label + ' b'); near(post.values.c, -2 * signC, label + ' c'); assert.deepEqual(post.bbox, pre.bbox, label + ' preserves viewport'); near(post.graphY[0], -2, label + ' vertex'); near(post.graphY[1], 0, label + ' P'); assert.equal(post.reconstruction, true, label + ' accepted reconstruction'); console.log('PASS', label); return { label, values: post.values, reconstruction: post.reconstruction, term: post.term }; };
        if (!process.argv.includes('--integration-only')) {
        await navigate('dgs=1');
        report.scenarios.push(await layout('initial'));
        for (const name of ['a', 'b', 'c']) {
            await evaluate('scharFixture.observeRange(' + JSON.stringify(name) + ')');
            const pre = await state();
            await drag(await evaluate('scharFixture.rangePoint(' + JSON.stringify(name) + ')'), await evaluate('scharFixture.rangePoint(' + JSON.stringify(name) + ',2.5)'));
            const post = await state();
            assert.ok(post.trace.input.length >= 6, name + ' continuous native input');
            assert.ok(new Set(post.trace.input.map(i => i.graph)).size >= 5, name + ' graph continuously updates');
            assert.deepEqual(post.bbox, pre.bbox);
            assert.equal(post.activeSame, true);
            report.scenarios.push({ label: 'native ' + name, inputs: post.trace.input.length, events: post.trace.events });
        }
        // A track click and keyboard input remain native browser actions.
        const track = await evaluate('scharFixture.rangePoint("b",-1)');
        await press(track);
        await release(track);
        near((await state()).values.b, -1, 'Track click', .15);
        await keyboardValue('b', 0);
        await evaluate('scharFixture.entry().termToggleEl.focus()');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await delay(100);
        assert.equal(await evaluate('scharFixture.entry().termVisible'), true);
        report.scenarios.push(await graphDrag('exact lecture parabola'));
        assert.match((await state()).term, /0[.,]5/);
        assert.match((await state()).term, /[-\u2212].*2/);
        // Return from each actual drawing/erasing/regression control to normal drag.
        for (const selector of ['.lia-plot-draw-btn', '.lia-plot-erase-toggle', '.lia-plot-regression-toggle']) {
            await evaluate('(()=>{const b=scharFixture.entry().board.containerObj.querySelector(' + JSON.stringify(selector) + ');b.click();b.click()})()');
            assert.ok(await evaluate('Object.values(window.__liaRegressionStates||{}).every(s=>s.activeTool==="")'));
            report.scenarios.push(await graphDrag('return from ' + selector));
        }
        // Cancellation uses actual emulated touchscreen input and must release the drag.
        await reset();
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        const cancelFrom = await evaluate('scharFixture.point(3,4.5)'), cancelTo = [cancelFrom[0] + 15, cancelFrom[1] + 15];
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelFrom[0], y: cancelFrom[1], id: 9 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelTo[0], y: cancelTo[1], id: 9 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await delay(100);
        const cancelState = await state();
        await move([cancelTo[0] + 50, cancelTo[1] + 50]);
        assert.deepEqual((await state()).values, cancelState.values);
        await send('Emulation.setTouchEmulationEnabled', { enabled: false });
        report.scenarios.push({ label: 'pointercancel', values: cancelState.values });
        await reset();
        const outsideStart = await evaluate('scharFixture.point(3,4.5)'), outsideEnd = [initial.board.right + 80, outsideStart[1] + 40];
        await drag(outsideStart, outsideEnd);
        const outsideState = await state();
        await move([outsideEnd[0] + 30, outsideEnd[1] + 20]);
        assert.deepEqual((await state()).values, outsideState.values);
        report.scenarios.push({ label: 'release outside board', values: outsideState.values });
        await navigate('dgs=1');
        await graphDrag('restore exact model after lifecycle gestures');
        // Empty background panning must not move the mathematical family.
        const prePan = await state(), empty = await evaluate('scharFixture.point(5,4)');
        await drag(empty, [empty[0] + 30, empty[1] + 25]);
        const postPan = await state();
        assert.notDeepEqual(postPan.bbox, prePan.bbox);
        assert.deepEqual(postPan.values, prePan.values);
        await navigate('dgs=1');
        for (const [inner, outer, sb, sc] of [['-', '+', -1, 1], ['+', '+', 1, 1], ['-', '-', -1, -1], ['+', '-', 1, -1]]) {
            const expr = 'a*(x' + inner + 'b)^2' + outer + 'c';
            await evaluate('document.querySelector("[id^=schar-spec-]").dataset.spec=' + JSON.stringify('g;x;' + expr + ';koordRekonstruktion;term=1;#b41f65'));
            await delay(180);
            report.scenarios.push(await graphDrag(expr, sb, sc));
        }
        await navigate('dgs=1');
        // Native touch, including an unrelated light-DOM mutation mid-gesture.
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await evaluate('scharFixture.observeRange("a")');
        const touchStart = await evaluate('scharFixture.rangePoint("a")'), touchEnd = await evaluate('scharFixture.rangePoint("a",3)');
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStart[0], y: touchStart[1], id: 11, radiusX: 1, radiusY: 1, force: 1 }] });
        for (let i = 1; i <= 12; i++) {
            await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchStart[0] + (touchEnd[0] - touchStart[0]) * i / 12, y: touchStart[1], id: 11, radiusX: 1, radiusY: 1, force: 1 }] });
            if (i === 5)
                await evaluate('scharFixture.mutateForeign()');
            await delay(25);
        }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await delay(160);
        const touch = await state();
        assert.ok(touch.trace.input.length >= 5, 'Native touch must continuously change range');
        assert.equal(touch.activeSame, true);
        assert.equal(touch.trace.removed, false);
        report.scenarios.push({ label: 'emulated touch range', trace: touch.trace });
        await send('Emulation.setTouchEmulationEnabled', { enabled: false });
        report.scenarios.push(await graphDrag('emulated pen graph', -1, 1, 'pen'));
        // Bootstrap retains entry, graph, native inputs and saved scale/minimization.
        const idempotent = await evaluate('(()=>{const e=scharFixture.entry(),graph=e.graph,input=e.slidersByParam.a;e.panelScale=1.1;for(let i=0;i<8;i++)__bootstrapScharen();return{s:e===scharFixture.entry(),g:graph===scharFixture.entry().graph,i:input===scharFixture.entry().slidersByParam.a,scale:scharFixture.entry().panelScale,count:e.board.containerObj.querySelectorAll(".lia-schar-panel").length}})()');
        assert.deepEqual(idempotent, { s: true, g: true, i: true, scale: 1.1, count: 1 });
        await evaluate('scharFixture.entry().minBtnEl.click()');
        await delay(100);
        assert.equal((await state()).panelMinimized, true);
        await evaluate('scharFixture.entry().miniWrapEl.click()');
        await delay(150);
        report.scenarios.push(await layout('restore minimized'));
        await navigate('dgs=1&integration=1');
        assert.equal(await evaluate('!!window.__LIA_DYNFLEX_V1_0__'), true);
        await evaluate('document.querySelector(".dynFlex").style.width="1000px"');
        await delay(350);
        report.scenarios.push(await layout('DynFlex width change'));
        await evaluate('document.querySelector("#fixture").style.transform="scale(.8)";document.querySelector("#fixture").style.transformOrigin="top left";dispatchEvent(new Event("resize"))');
        await delay(300);
        report.scenarios.push(await layout('scaled board'));
        report.scenarios.push(await graphDrag('scaled graph'));
        await evaluate('document.body.style.paddingTop="500px";scrollTo(0,350)');
        await delay(150);
        report.scenarios.push(await graphDrag('scrolled scaled graph'));
        await evaluate('document.body.style.zoom="1.25";dispatchEvent(new Event("resize"))');
        await delay(350);
        report.scenarios.push(await layout('browser CSS zoom'));
        report.scenarios.push(await graphDrag('zoomed graph'));
        await navigate('dgs=1');
        await evaluate('document.querySelector("#fixture").requestFullscreen()', true);
        await delay(300);
        assert.equal(await evaluate('document.fullscreenElement?.id'), 'fixture');
        report.scenarios.push(await layout('fullscreen'));
        report.scenarios.push(await graphDrag('fullscreen graph'));
        await evaluate('document.exitFullscreen()');
        await delay(200);
        report.scenarios.push(await layout('fullscreen exit'));
        // Replacing the public macro host remounts its real JSXGraph board.
        const replacementValues=(await state()).values;
        const lifecycle = await evaluate('(async()=>{const old=scharFixture.entry(),host=document.querySelector("lia-coordinate-board"),replacement=host.cloneNode(false);host.replaceWith(replacement);for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,50));if(scharFixture.entry()&&scharFixture.entry().board!==old.board)return{newBoard:true,oldPanelRemoved:!old.panel.isConnected,oldCapture:old.board.containerObj.hasPointerCapture?.(1)||false,values:scharFixture.entry().values}}throw Error("Board remount failed")})()');
        assert.equal(lifecycle.newBoard, true);
        assert.equal(lifecycle.oldPanelRemoved, true);
        assert.equal(lifecycle.oldCapture, false);
        assert.deepEqual(lifecycle.values,replacementValues,'Board replacement preserves parameter model');
        report.scenarios.push({ label: 'board replacement', ...lifecycle });
        await evaluate('window.removedScharMarker=document.querySelector("[id^=schar-spec-]");removedScharMarker.remove()');
        await delay(150);
        assert.equal(await evaluate('Object.keys(window.__scharEntries).length'), 0);
        await evaluate('document.querySelector("#board-column").append(removedScharMarker)');
        await evaluate('scharFixture.ready()');
        assert.equal((await state()).panelCount, 1);
        report.scenarios.push({ label: 'marker removal and reattach' });
        await navigate('border=0');
        await reset();
        const borderPre = await state();
        await drag(await evaluate('scharFixture.point(3,4.5)'), await evaluate('scharFixture.point(4,2.5)'));
        assert.deepEqual((await state()).values, borderPre.values);
        assert.deepEqual((await state()).bbox, borderPre.bbox);
        }
        await navigate('dgs=1&integration=1&lecture=1');
        if(!process.argv.includes('--runtime-only')) report.scenarios.push(await graphDrag('lecture imports'));
        report.scenarios.push(await layout('lecture imports'));
        assert.ok(existsSync(join(runtime, 'index.html')), 'Prepare real LiaScript runtime or set LIASCRIPT_RUNTIME');
        if (existsSync(join(runtime, 'index.html'))) {
            await navigate('runtime');
            await evaluate('document.querySelector("button[title=Cursor]")?.click()');
            assert.equal(await evaluate('window.__LIA_ANNOTATION__.getStore().ui.mode'), 'cursor');
            await evaluate('scharFixture.observeRange("a")');
            const realBefore=await state();
            await drag(await evaluate('scharFixture.rangePoint("a")'), await evaluate('scharFixture.rangePoint("a",2.5)'), { foreign: true });
            const realRange = await state();
            if(process.argv.includes('--diagnostics')){writeFileSync(join(root,'tests/browser/schar-runtime-diagnostic.json'),JSON.stringify(realRange,null,2)+'\n');const debugShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'tests/browser/schar-runtime-diagnostic.png'),Buffer.from(debugShot.data,'base64'));}
            assert.ok(realRange.trace.input.length >= 5);
            assert.equal(realRange.activeSame, true);
            assert.equal(realRange.activeConnected, true);
            assert.deepEqual(realRange.bbox,realBefore.bbox,'Real presentation range must preserve stable viewport');
            report.scenarios.push({ label: 'real LiaScript native range', trace: realRange.trace });
            report.scenarios.push(await graphDrag('real LiaScript presentation'));
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(root, 'tests/browser/schar-presentation-after.png'), Buffer.from(shot.data, 'base64'));
            const quizPoint = await evaluate('(()=>{const r=document.querySelector(".lia-quiz__check").getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]})()');
            await press(quizPoint);
            await release(quizPoint);
            await delay(250);
            assert.ok(await evaluate('!!document.querySelector(".lia-quiz__feedback.text-success")'), 'Native LiaScript quiz check must accept dragged graph');
            report.scenarios.push({ label: 'native LiaScript reconstruction check', correct: true });
            const revisitValues = (await state()).values;
            await evaluate('document.querySelector("button[title=next]").click()');
            await delay(500);
            assert.ok(await evaluate('document.body.innerText.includes("Return to the previous slide")'));
            assert.equal(await evaluate('!!document.querySelector("[id^=schar-spec-]")'), false);
            await evaluate('document.querySelector("button[title=previous]").click()');
            await evaluate('scharFixture.ready()');
            assert.deepEqual((await state()).values, revisitValues);
            assert.equal((await state()).panelCount, 1);
            report.scenarios.push(await graphDrag('real LiaScript slide revisit'));
            report.scenarios.push(await layout('real LiaScript presentation'));
            assert.ok(await evaluate('!!document.querySelector(".lia-slide__container, .lia-slide")'), 'Real LiaScript rendered a slide');
        }
        console.log('SCHAR_CHECKS_PASSED', report.scenarios.map(s => s.label || s.name).join(', '));
    }
    writeFileSync(join(root, 'tests/browser/schar-' + (before ? 'before' : process.argv.includes('--runtime-only') ? 'runtime' : process.argv.includes('--integration-only') ? 'integration' : 'after') + '.json'), JSON.stringify(report, reportReplacer, 2) + '\n');
    await send('Browser.close').catch(() => { });
}
finally {
    ws?.close();
    proc.kill();
    server.close();
    for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error('Browser closed'));
    }
}
