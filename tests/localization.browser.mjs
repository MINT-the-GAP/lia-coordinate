// Real LiaScript 0.16.10 + JSXGraph localization regression.
// Prepare pinned dependencies: node tests/browser/prepare-schar-assets.mjs
// Run: node tests/localization.browser.mjs (CHROME_PATH and LIASCRIPT_RUNTIME supported).
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
        res.end(readFileSync(join(root, 'tests/fixtures/localization.md'), 'utf8').replace('language: en', 'language: ' + requestPath.match(/course-(en|de)/)[1]).replaceAll('/assets/', 'http://' + req.headers.host + '/assets/').replace('/coordinate.md', 'http://' + req.headers.host + '/coordinate.md'));
        return;
    }
    if (requestPath.startsWith('/runtime/')) {
        const name = requestPath.slice(9) || 'index.html';
        try {
            res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
            let bytes = readFileSync(join(runtime, name));
            if (name === 'index.html')
                bytes = bytes.toString().replace('constructionQuizNestedSolution.md', '/course.md').replace('</head>', '<script>window.LIA=window.LIA||{};window.LIA.defaultCourseURL="/course-' + (new URL(req.url,"http://localhost").searchParams.get("language")==="de"?"de":"en") + '.md";</script><script src="/fixture-api.js"></script></head>');
            res.end(bytes);
        }
        catch (e) {
            res.statusCode = 404;
            res.end(String(e));
        }
        return;
    }
    const p = new URL(req.url, 'http://localhost').pathname;
    const file = p === '/bundle.js' ? bundle : p === '/fixture-api.js' ? join(root, 'tests/browser/localization-fixture-api.js') : p.startsWith('/assets/') ? join(assets, p.slice(8)) : join(root, 'tests/fixtures/schar-reconstruction.html');
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
const profile = mkdtempSync(join(tmpdir(), 'lia-localization-chrome-'));
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
    const evaluate = async (expression, userGesture = false) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    await send('Page.enable');
    await send('Runtime.enable');
    events.set('Runtime.exceptionThrown', e => console.log('BROWSER_ERROR', JSON.stringify(e.exceptionDetails)));
    events.set('Runtime.consoleAPICalled', e => { if (process.argv.includes('--runtime-debug'))
        console.log('CONSOLE', e.type, JSON.stringify(e.args)); });
    const navigate = async (query) => { const loaded = new Promise(r => events.set('Page.loadEventFired', r)); await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + ('/runtime/?language=' + query) }); await loaded; await send('Page.bringToFront'); await evaluate('localizationFixture.ready()'); };
    const press = async (p, type = 'mouse') => send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1, pointerType: type });
    const release = async p => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1 });
    const state = () => evaluate('localizationFixture.state()');

    const report = {
        browser: await send('Browser.getVersion'),
        runtime: 'LiaScript 0.16.10',
        checks: ['Six UI families follow actual English and German courses', 'Native point, table, plot, clear, Schar key/toggle/minimize/restore actions', 'Root language mutations translate existing errors and success status', 'In-place updates preserve graph, point, input and panel identities', 'Explicit data-language overrides win; removing them restores course inheritance'],
        bundleSha256: createHash('sha256').update(readFileSync(bundle)).digest('hex'),
        scenarios: []
    };
    const labels = {
        en: { points: ['Set point', 'Set point', 'Set points'], term: 'Show term',
            min: 'Minimize parameter controls', restore: 'Restore parameter controls', resize: 'Resize parameter controls' },
        de: { points: ['Punkt setzen', 'Punkt setzen', 'Punkte setzen'], term: 'Term anzeigen',
            min: 'Parameterregler minimieren', restore: 'Parameterregler wiederherstellen', resize: 'Gr\u00f6\u00dfe der Parameterregler \u00e4ndern' }
    };
    const clickAt = async coordinates => {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coordinates[0], y: coordinates[1], button: 'none', buttons: 0 });
        await press(coordinates);
        await release(coordinates);
        await delay(150);
    };
    const checkLabels = (snapshot, language) => {
        const expected = labels[language];
        assert.deepEqual(snapshot.plot.labels, language === 'en' ? ['Plot','Clear'] : ['Zeichnen','L'+String.fromCharCode(246)+'schen']);
        assert.equal(snapshot.plot.inputAria, language === 'en' ? 'Function expression' : 'Funktionsterm');
        assert.ok(snapshot.plot.placeholder.startsWith(language === 'en' ? 'e.g.' : 'z. B.'));
        for (const button of snapshot.table.buttons) {
            assert.match(button.label.normalize('NFKC'), language === 'en' ? /^Set point T/ : /^Punkt T.*setzen$/);
            if (button.disabled) assert.equal(button.title, language === 'en' ? 'Enter numeric values for x and f(x) first.' : 'Bitte zuerst numerische Werte f'+String.fromCharCode(252)+'r x und f(x) eintragen.');
        }
        assert.deepEqual(snapshot.pointLabels, expected.points);
        assert.equal(snapshot.termLabel, expected.term);
        assert.equal(snapshot.termAria, expected.term);
        assert.equal(snapshot.minTitle, snapshot.minimized ? expected.restore : expected.min);
        assert.equal(snapshot.minAria, snapshot.minimized ? expected.restore : expected.min);
        assert.equal(snapshot.restoreTitle, expected.restore);
        assert.equal(snapshot.restoreAria, expected.restore);
        assert.equal(snapshot.resizeTitle, expected.resize);
        assert.equal(snapshot.resizeAria, expected.resize);
    };
    for (const language of ['en', 'de']) {
        await navigate(language);
        const initial = await state();
        if(process.argv.includes('--diagnose')) {
            const environment=await evaluate('({version:window.LIA?.version,keys:Object.keys(window.LIA||{}),settings:window.LIA?.settings,langs:Array.from(document.querySelectorAll("[lang]")).map(e=>({tag:e.localName,id:e.id,lang:e.lang})),body:document.body.innerText.slice(0,2000)})');
            report.scenarios.push({language,initial,environment});console.log('LOCALIZATION_DIAGNOSTIC',language,JSON.stringify({marker:initial.language,points:initial.pointLabels,term:initial.termLabel,plot:initial.plot.labels,environment}));continue;
        }
        checkLabels(initial, language);
        assert.equal(initial.courseLanguage, language, 'Actual LiaScript course must expose its selected language');
        assert.equal(initial.language, undefined, 'Schar inherits course language without unresolved macro placeholders');
        assert.deepEqual(initial.pointLanguages, [null, null, null]);
        assert.equal(initial.table.language, undefined);
        assert.equal(initial.plot.language, undefined);
        assert.equal(initial.pointCount, 0);
        assert.ok(initial.table.buttons.every(button => button.disabled));
        for (const [index, expected] of [[0, 1], [1, 2], [2, 4]]) {
            await clickAt(await evaluate('localizationFixture.center(localizationFixture.buttons()[' + index + '])'));
            const placed = await state();
            assert.equal(placed.pointCount, expected, 'Localized point button must create its points');
            assert.ok(Object.values(placed.coordinates).flat().every(Number.isFinite));
        }
        // Native plot validation and its language-dependent feedback.
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.plot().btnPlot)'));
        const emptyMessage = language === 'en' ? 'Please enter a function expression.' : 'Bitte einen Funktionsterm eingeben.';
        assert.equal((await state()).plot.message, emptyMessage);
        await evaluate('localizationFixture.changeCourseLanguage('+JSON.stringify(language === 'en' ? 'de' : 'en')+')');
        await delay(350);
        const translatedEmpty = (await state()).plot.message;
        assert.equal(translatedEmpty, language === 'en' ? 'Bitte einen Funktionsterm eingeben.' : 'Please enter a function expression.');
        await evaluate('localizationFixture.changeCourseLanguage('+JSON.stringify(language)+')');
        await delay(350);
        for (const [index,text] of [[0,'2'],[2,'3']]) {
            await evaluate('localizationFixture.tableInputs()['+index+'].focus()');
            await send('Input.insertText',{text});
        }
        assert.equal((await state()).table.buttons[0].disabled,false);
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.tableRoot().querySelector(".lia-dyn-table-point-btn"))'));
        assert.deepEqual((await state()).coordinates.T_1,[2,3]);
        await evaluate('localizationFixture.plot().input.focus()');
        await send('Input.insertText',{text:'x^2'});
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.plot().btnPlot)'));
        assert.equal((await state()).plot.message,language === 'en' ? 'Graph plotted.' : 'Graph gezeichnet.');
        assert.equal((await state()).plot.graphAtTwo,4);
        await evaluate('localizationFixture.entry().slidersByParam.a.focus()');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.entry().termToggleEl)'));
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.entry().minBtnEl)'));
        await evaluate('localizationFixture.remember()');
        const beforeChange = await state();
        assert.equal(beforeChange.values.a, 1.1);
        assert.equal(beforeChange.termVisible, true);
        assert.equal(beforeChange.minimized, true);
        const nextLanguage = language === 'en' ? 'de' : 'en';
        await evaluate('localizationFixture.changeCourseLanguage(' + JSON.stringify(nextLanguage) + ')');
        await delay(500);
        const changed = await state();
        checkLabels(changed, nextLanguage);
        assert.deepEqual(changed.identity, { entry: true, board: true, panel: true, input: true, buttons: true, points: true, tableInputs: true, plotInput: true, plotGraph: true });
        assert.deepEqual(changed.values, beforeChange.values);
        assert.deepEqual(changed.coordinates, beforeChange.coordinates);
        assert.deepEqual(changed.table.inputs,beforeChange.table.inputs);
        assert.equal(changed.plot.input,'x^2');
        assert.equal(changed.plot.graphAtTwo,4);
        assert.equal(changed.plot.message,nextLanguage === 'en' ? 'Graph plotted.' : 'Graph gezeichnet.');
        assert.equal(changed.panelScale, beforeChange.panelScale);
        assert.equal(changed.termVisible, true);
        assert.equal(changed.minimized, true);
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.entry().miniWrapEl)'));
        const restored = await state();
        checkLabels(restored, nextLanguage);
        assert.equal(restored.minimized, false);
        assert.match(restored.termText, nextLanguage === 'en' ? /1\.1/ : /1(?:\{,\}|,)1/, 'Visible term uses the new language decimal separator');
        assert.deepEqual(restored.values, beforeChange.values);
        // Explicit metadata wins over the course language, without rebuilding controls.
        await evaluate('localizationFixture.changeLanguage(' + JSON.stringify(language) + ')');
        await delay(350);
        const overridden = await state();
        checkLabels(overridden, language);
        assert.equal(overridden.courseLanguage, nextLanguage);
        assert.deepEqual(overridden.identity, changed.identity);
        assert.deepEqual(overridden.values, beforeChange.values);
        assert.deepEqual(overridden.table.inputs, beforeChange.table.inputs);
        assert.equal(overridden.plot.input, 'x^2');
        assert.equal(overridden.plot.graphAtTwo, 4);
        await evaluate('localizationFixture.changeCourseLanguage(' + JSON.stringify(language) + ')');
        await delay(350);
        await evaluate('localizationFixture.changeCourseLanguage(' + JSON.stringify(nextLanguage) + ')');
        await delay(350);
        checkLabels(await state(), language);
        await evaluate('localizationFixture.clearLanguageOverrides()');
        await delay(350);
        checkLabels(await state(), nextLanguage);
        await evaluate('localizationFixture.changeCourseLanguage(' + JSON.stringify(language) + ')');
        await delay(350);
        checkLabels(await state(), language);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(root, 'tests/browser/localization-' + language + '.png'), Buffer.from(shot.data, 'base64'));
        await clickAt(await evaluate('localizationFixture.center(localizationFixture.plot().btnClear)'));
        const cleared = (await state()).plot;
        assert.equal(cleared.hasGraph,false);
        assert.equal(cleared.input,'');
        assert.equal(cleared.message,'');
        report.scenarios.push({ language, initial, placed: beforeChange.coordinates, emptyMessage, translatedEmpty, languageUpdate: changed, restored, overridden, cleared });
        console.log('LOCALIZATION_PASS', language, JSON.stringify({ labels: initial.pointLabels, term: initial.termLabel,
            points: Object.keys(beforeChange.coordinates), statePreserved: changed.identity }));
    }
    writeFileSync(join(root, 'tests/browser/localization' + (process.argv.includes('--diagnose') ? '-diagnostic' : '') + '.json'), JSON.stringify(report, null, 2) + '\n');
    await send('Browser.close').catch(() => {});
} finally {
    ws?.close();
    proc.kill();
    server.close();
    for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(Error('Browser closed'));
    }
}
