// Real LiaScript 0.16.10 native quiz control regression.
// Prepare pinned dependencies: node tests/browser/prepare-schar-assets.mjs
// Run: node tests/quizFamilies.browser.mjs (CHROME_PATH and LIASCRIPT_RUNTIME supported).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const root = resolve('.'), assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const runtime = process.env.LIASCRIPT_RUNTIME || join(tmpdir(), 'lia-coordinate-webexport', 'course');
const bundle = join(root, 'dist/index.js');
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
    if (/^\/course-(en|de)\.md$/.test(requestPath)) {
        res.setHeader('Content-Type', 'text/plain');
        res.end(readFileSync(join(root, 'tests/fixtures/dynFlexQuizFamilies.md'), 'utf8').replace(/^<!--[^]*?-->/, '<!--\nversion: 1.0.0\nlanguage: de\nmode: Textbook\nscript: /assets/mathjax.js\n        /assets/jsxgraph-template.js\n        /assets/dynflex.js\n        /assets/timer.js\nimport: /coordinate.md\n-->').replace('<section class="dynFlex">', '<section class="dynFlex" data-basis="49%">').replace(/<\/section>\s*$/, readFileSync(join(root, 'tests/fixtures/quiz-area-extension.md'), 'utf8') + '\n</section>').replace('language: en', 'language: ' + requestPath.match(/course-(en|de)/)[1]).replaceAll('/assets/', 'http://' + req.headers.host + '/assets/').replace('/coordinate.md', 'http://' + req.headers.host + '/coordinate.md'));
        return;
    }
    if (requestPath.startsWith('/runtime/')) {
        const name = requestPath.slice(9) || 'index.html';
        try {
            res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
            let bytes = readFileSync(join(runtime, name));
            if (name === 'index.html')
                bytes = bytes.toString().replace('constructionQuizNestedSolution.md', '/course.md').replace('</head>', '<script>window.LIA=window.LIA||{};window.LIA.defaultCourseURL="/course-' + (new URL(req.url, "http://localhost").searchParams.get("language") === "de" ? "de" : "en") + '.md' + (new URL(req.url, "http://localhost").searchParams.get("phase") === "resolve" ? '?resolve' : '') + '";</script><script src="/fixture-api.js"></script></head>');
            res.end(bytes);
        }
        catch (e) {
            res.statusCode = 404;
            res.end(String(e));
        }
        return;
    }
    const p = new URL(req.url, 'http://localhost').pathname;
    const file = p === '/bundle.js' ? bundle : p === '/fixture-api.js' ? join(root, 'tests/browser/quiz-families-fixture-api.js') : p.startsWith('/assets/') ? join(assets, p.slice(8)) : join(root, 'tests/fixtures/schar-reconstruction.html');
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
const profile = mkdtempSync(join(tmpdir(), 'lia-quiz-families-chrome-'));
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
    ws.addEventListener('message', ({ data }) => {
        const m = JSON.parse(data);
        if (m.id) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            clearTimeout(p?.timer);
            if (m.error)
                p?.reject(Error(JSON.stringify(m.error)));
            else
                p?.resolve(m.result);
        }
        else
            events.get(m.method)?.(m.params);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression, userGesture = false) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await send('Page.enable');
    await send('Runtime.enable');
    events.set('Runtime.exceptionThrown', e => console.log('BROWSER_ERROR', JSON.stringify(e.exceptionDetails)));
    events.set('Runtime.consoleAPICalled', e => {
        if (process.argv.includes('--runtime-debug'))
            console.log('CONSOLE', e.type, JSON.stringify(e.args));
    });
    const navigate = async (query) => { const loaded = new Promise(r => events.set('Page.loadEventFired', r)); await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + ('/runtime/?language=' + query) }); await loaded; await send('Page.bringToFront'); await evaluate('quizFixture.ready()'); };
    const press = async (p, type = 'mouse') => send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1, pointerType: type });
    const release = async (p) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1 });
    const report = {
        browser: await send('Browser.getVersion'),
        runtime: 'LiaScript 0.16.10',
        checks: ['All seven native LiaScript quiz families plus area and perimeter variants', 'Native incorrect Check, Hint, correct Check and Resolve', 'Native point creation buttons; JSXGraph point/polygon and Schar parameter geometry prepared explicitly', 'Point lock and unchanged hint geometry assertions'],
        bundleSha256: createHash('sha256').update(readFileSync(bundle)).digest('hex'),
        scenarios: []
    };
    const ids = ['q_create', 'q_metric', 'q_construction', 'q_combined', 'q_graph', 'q_multi_graph', 'q_reconstruction', 'q_area'];
    const snap = id => evaluate('quizFixture.snapshot(' + JSON.stringify(id) + ')');
    const click = async (expr) => { const p = await evaluate('quizFixture.center(' + expr + ')'); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], buttons: 0 }); const hit = await evaluate('(()=>{const e=' + expr + ',p=' + JSON.stringify(p) + ',h=e.getRootNode().elementFromPoint(...p);return{correct:e===h||e.contains(h),wanted:e.outerHTML,hit:h?.outerHTML}})()'); assert.ok(hit.correct, JSON.stringify(hit)); await press(p); await release(p); await delay(350); };
    const quizClick = (id, part) => click('quizFixture.quiz(quizFixture.byBoard(' + JSON.stringify(id) + ')).querySelector(' + JSON.stringify('.lia-quiz__' + part) + ')');
    const polygon = async (id, coords) => evaluate('(()=>{const b=window.__boards[' + JSON.stringify(id) + '],coords=' + JSON.stringify(coords) + ';window.quizPolygons=window.quizPolygons||{};let p=window.quizPolygons[' + JSON.stringify(id) + '];if(p){coords.forEach((c,i)=>p.vertices[i].moveTo(c));}else{const points=coords.map((c,i)=>b.create("point",c,{name:"V"+i,fixed:false}));p=b.create("polygon",points,{fillOpacity:.15});p.__liaDgsPolygon=true;window.quizPolygons[' + JSON.stringify(id) + ']=p;}b.update();})()');
    const solve = async (id) => {
        if (['q_create', 'q_graph', 'q_multi_graph'].includes(id)) {
            await click('quizFixture.source(quizFixture.byBoard(' + JSON.stringify(id) + ')).querySelector("button")');
            await evaluate('(()=>{const id=' + JSON.stringify(id) + ';Object.values(window.__points[id]).forEach((p,i)=>p.moveTo(id==="q_multi_graph"?[i-1,i-2]:[1,1]));window.__boards[id].update();})()');
        }
        else if (id === 'q_reconstruction') {
            await evaluate('(()=>{const e=Object.values(window.__scharEntries).find(e=>e.boardId==="q_reconstruction");e.values.m=2;e.values.n=-1;e.board.update();})()');
        }
        else {
            const coords = id === 'q_metric' ? [[0, 0], [3, 0], [1.5, Math.sqrt(6.75)]] : id === 'q_construction' ? [[0, 0], [3, 0], [-3 * Math.cos(Math.PI / 12), 3 * Math.sin(Math.PI / 12)]] : [[0, 0], [3, 0], [3, 2], [0, 2]];
            await polygon(id, coords);
        }
    };
    await navigate('de');
    for (const id of ids) {
        const initial = await snap(id);
        if (['q_metric', 'q_construction', 'q_combined', 'q_area'].includes(id))
            await polygon(id, ['q_metric', 'q_construction'].includes(id) ? [[0, 0], [1, 0], [0, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]]);
        await quizClick(id, 'check');
        const wrong = await snap(id);
        assert.match(wrong.text, /Die richtige Antwort wurde noch nicht gegeben/, id + ' wrong check');
        await quizClick(id, 'hint');
        const hinted = await snap(id);
        assert.ok(hinted.hints?.length, id + ' native hint');
        assert.deepEqual(hinted.points, wrong.points, id + ' hint must not finalize points');
        assert.deepEqual(hinted.schars, wrong.schars, id + ' hint must not change controls');
        assert.deepEqual(hinted.polygons, wrong.polygons, id + ' hint must not change geometry');
        await solve(id);
        const attempted = await snap(id);
        await quizClick(id, 'check');
        const correct = await snap(id);
        console.log('QUIZ_RESULT', id, JSON.stringify({ state: correct.quizClass, points: correct.points, schars: correct.schars }));
        assert.match(correct.text, /das war die richtige Antwort/, id + ' native correct check');
        assert.match(correct.quizClass, /solved/, id + ' native solved state');
        assert.equal(correct.buttons.find(b => b.class.includes('lia-quiz__check')).disabled, true);
        if (['q_create', 'q_graph', 'q_multi_graph'].includes(id))
            assert.ok(correct.points.every(p => p.fixed), id + ' locks solved points');
        report.scenarios.push({ id, passed: true, initial, wrong, hinted, attempted, correct });
    }
    await navigate('de&phase=resolve');
    for (const id of ids) {
        if (['q_graph', 'q_multi_graph'].includes(id)) {
            await click('quizFixture.source(quizFixture.byBoard(' + JSON.stringify(id) + ')).querySelector("button")');
            await evaluate('(()=>{const id=' + JSON.stringify(id) + ';Object.values(window.__points[id]).forEach((p,i)=>p.moveTo([i,2]));window.__boards[id].update();})()');
        }
        await quizClick(id, 'check');
        const wrong = await snap(id);
        assert.match(wrong.text, /Die richtige Antwort wurde noch nicht gegeben/, id + ' resolve fresh wrong');
        await quizClick(id, 'hint');
        const hinted = await snap(id);
        assert.ok(hinted.hints?.length);
        assert.deepEqual(hinted.points, wrong.points);
        await quizClick(id, 'check');
        await delay(1100);
        const beforeResolve = await snap(id);
        assert.equal(beforeResolve.buttons.find(b => b.class.includes('lia-quiz__resolve')).visible, true);
        await quizClick(id, 'resolve');
        const resolved = await snap(id);
        console.log('RESOLVE_RESULT', id, JSON.stringify({ state: resolved.quizClass, points: resolved.points, solution: !!resolved.solution }));
        assert.ok(resolved.solution?.length, id + ' native extended solution');
        assert.match(resolved.quizClass, /resolved/, id + ' native resolved state');
        assert.equal(resolved.buttons.find(b => b.class.includes('lia-quiz__check')).disabled, true);
        if (['q_create', 'q_graph', 'q_multi_graph'].includes(id))
            assert.ok(resolved.points.length && resolved.points.every(p => p.fixed), id + ' resolve locks points');
        report.scenarios.find(s => s.id === id).resolve = { passed: true, beforeResolve, resolved };
    }
    writeFileSync(join(root, 'tests/browser/quiz-families.json'), JSON.stringify(report, null, 2));
    await send('Browser.close');
}
finally {
    ws?.close();
    proc.kill();
    server.close();
    for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(Error('Browser closed'));
    }
}
