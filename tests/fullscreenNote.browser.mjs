import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/bundle.js' ? bundle : pathname.startsWith('/assets/')
    ? join(assets, pathname.slice(8)) : join(root, 'tests/fixtures/dynamic-pan-zoom.html');
  try {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.setHeader('Cache-Control', 'no-store');
    response.end(readFileSync(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(String(error));
  }
});

let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const executablePath = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].find(path => path && existsSync(path));
  assert.ok(executablePath, 'No browser found; set CHROME_PATH or EDGE_PATH');

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error.stack || error)));

  await page.goto('http://127.0.0.1:' + port + '/?dgs=1&instrument=0&integration=0', {
    waitUntil: 'load'
  });
  await page.evaluate(() => profileReady());

  await page.evaluate(async () => {
    const makeNote = (parent, id, boardId, language, longContent) => {
      const wrapper = document.createElement('article');
      wrapper.id = 'fullscreen-note-source-' + id;
      wrapper.className = 'fullscreen-note-test-source';

      const start = document.createElement('div');
      start.id = 'fullscreen-note-start-' + id;
      start.className = 'lia-fullscreen-note-start';
      start.dataset.boardId = boardId;
      start.dataset.language = language;
      start.hidden = true;
      start.setAttribute('aria-hidden', 'true');

      const lead = document.createElement('p');
      lead.className = 'note-lead';
      lead.innerHTML = '<strong>Aufgabe:</strong> Zeichne <span class="note-math">\\(f(x)=2x+1\\)</span>.';
      const list = document.createElement('ul');
      list.innerHTML = '<li>Markiere den y-Achsenabschnitt.</li><li>Nutze die Steigung.</li>';

      const end = document.createElement('div');
      end.id = 'fullscreen-note-end-' + id;
      end.className = 'lia-fullscreen-note-end';
      end.hidden = true;
      end.setAttribute('aria-hidden', 'true');

      wrapper.append(start, lead, list);
      if (longContent) {
        for (let index = 1; index <= 28; index += 1) {
          const paragraph = document.createElement('p');
          paragraph.textContent = 'Mehrzeilige Zusatzanweisung ' + index;
          wrapper.appendChild(paragraph);
        }
      }
      wrapper.appendChild(end);
      parent.appendChild(wrapper);
      return wrapper;
    };

    const firstParent = document.querySelector('.flex-child');
    const firstNote = makeNote(firstParent, 'browser-a1', 'A1', 'de', true);

    const secondParent = document.createElement('section');
    secondParent.id = 'fullscreen-note-second-board';
    secondParent.className = 'flex-child';
    secondParent.style.width = '620px';
    const secondBoardHost = document.createElement('lia-coordinate-board');
    secondBoardHost.id = 'fullscreen-note-board-b2';
    secondBoardHost.setAttribute('data-lia-coordinate-key', 'fullscreen-note-b2');
    secondBoardHost.setAttribute('data-spec', 'xmin=-5;xmax=5;ymin=-4;ymax=4;width=600;id=B2');
    const secondDgs = document.createElement('div');
    secondDgs.id = 'dgs-ui-fullscreen-note-b2';
    secondDgs.dataset.spec = 'B2';
    secondDgs.dataset.language = 'en';
    secondParent.append(secondBoardHost, secondDgs);
    document.body.appendChild(secondParent);
    const secondNote = makeNote(secondParent, 'browser-b2', 'B2', 'en', false);

    if (window.MathJax?.typesetPromise) {
      await window.MathJax.typesetPromise([firstNote, secondNote]);
    }
    window.__bootstrapFullscreenNotes();
  });

  await page.waitForFunction(() =>
    window.__boards?.B2?.containerObj?.querySelector('.lia-dgs-fullscreen-button') &&
    window.__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar') &&
    window.__boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
  );

  const embedded = await page.evaluate(() => {
    const source = document.querySelector('#fullscreen-note-source-browser-a1');
    const firstBar = __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    const secondBar = __boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    return {
      sourceVisible: source.getBoundingClientRect().height > 0,
      sourceStrong: source.querySelector('strong')?.textContent,
      firstDisplay: getComputedStyle(firstBar).display,
      secondDisplay: getComputedStyle(secondBar).display,
      strong: firstBar.querySelector('strong')?.textContent,
      listItems: firstBar.querySelectorAll('li').length,
      math: !!firstBar.querySelector('mjx-container'),
      firstLanguage: firstBar.querySelector('.lia-dgs-fullscreen-note-title')?.textContent,
      secondLanguage: secondBar.querySelector('.lia-dgs-fullscreen-note-title')?.textContent
    };
  });
  assert.deepEqual(embedded, {
    sourceVisible: true,
    sourceStrong: 'Aufgabe:',
    firstDisplay: 'none',
    secondDisplay: 'none',
    strong: 'Aufgabe:',
    listItems: 2,
    math: true,
    firstLanguage: 'Vollbildnotizen',
    secondLanguage: 'Fullscreen notes'
  });

  await page.evaluate(() => {
    const source = document.querySelector('#fullscreen-note-source-browser-a1');
    source.querySelector('strong').textContent = 'Aufgabe aktualisiert:';
    const liveParagraph = document.createElement('p');
    liveParagraph.dataset.liveUpdate = '1';
    liveParagraph.textContent = 'Nachträglich gerenderter Hinweis';
    source.querySelector('.lia-fullscreen-note-end').before(liveParagraph);
  });
  await page.waitForFunction(() => {
    const bar = __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    return bar?.querySelector('strong')?.textContent === 'Aufgabe aktualisiert:' &&
      bar.querySelector('[data-live-update="1"]')?.textContent === 'Nachträglich gerenderter Hinweis';
  });

  const firstBoard = page.locator('lia-coordinate-board').first();
  await firstBoard.locator('.lia-dgs-menu-button').click();
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-top-menu')?.dataset.open === '1'
  );
  await firstBoard.locator('.lia-dgs-fullscreen-button').click();
  await page.waitForFunction(() => {
    const container = __boards.A1.containerObj;
    return container.getRootNode().fullscreenElement === container ||
      document.fullscreenElement === container;
  });
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '1'
  );

  const fullscreen = await page.evaluate(() => {
    const firstBar = __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    const secondBar = __boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    const viewport = firstBar.querySelector('.lia-dgs-fullscreen-note-viewport');
    const rect = firstBar.getBoundingClientRect();
    return {
      fullscreen: firstBar.dataset.fullscreen,
      open: firstBar.dataset.open,
      expanded: firstBar.querySelector('button').getAttribute('aria-expanded'),
      display: getComputedStyle(firstBar).display,
      height: rect.height,
      viewportHeight: innerHeight,
      scrollable: viewport.scrollHeight > viewport.clientHeight,
      secondDisplay: getComputedStyle(secondBar).display,
      secondFullscreen: secondBar.dataset.fullscreen,
      updatedText: firstBar.querySelector('strong')?.textContent,
      liveText: firstBar.querySelector('[data-live-update="1"]')?.textContent
    };
  });
  assert.equal(fullscreen.fullscreen, '1');
  assert.equal(fullscreen.open, '1');
  assert.equal(fullscreen.expanded, 'true');
  assert.equal(fullscreen.display, 'flex');
  assert.ok(fullscreen.height <= fullscreen.viewportHeight * 0.35 + 2, JSON.stringify(fullscreen));
  assert.equal(fullscreen.scrollable, true);
  assert.equal(fullscreen.secondDisplay, 'none');
  assert.equal(fullscreen.secondFullscreen, '0');
  assert.equal(fullscreen.updatedText, 'Aufgabe aktualisiert:');
  assert.equal(fullscreen.liveText, 'Nachträglich gerenderter Hinweis');

  const noteToggle = firstBoard.locator('.lia-dgs-fullscreen-note-toggle');
  await noteToggle.click();
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '0'
  );
  assert.equal(await page.evaluate(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-toggle')
      .getAttribute('aria-expanded')
  ), 'false');
  await noteToggle.click();
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '1'
  );

  const isolated = await page.evaluate(() => {
    const container = __boards.A1.containerObj;
    const bar = container.querySelector('.lia-dgs-fullscreen-note-bar');
    const target = bar.querySelector('strong');
    const leaks = { boardPointer: 0, boardKey: 0, documentPointer: 0, documentKey: 0 };
    const boardPointer = () => { leaks.boardPointer += 1; };
    const boardKey = () => { leaks.boardKey += 1; };
    const documentPointer = () => { leaks.documentPointer += 1; };
    const documentKey = () => { leaks.documentKey += 1; };
    container.addEventListener('pointerdown', boardPointer);
    container.addEventListener('keydown', boardKey);
    document.addEventListener('pointerdown', documentPointer);
    document.addEventListener('keydown', documentKey);
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      bubbles: true,
      composed: true
    }));
    container.removeEventListener('pointerdown', boardPointer);
    container.removeEventListener('keydown', boardKey);
    document.removeEventListener('pointerdown', documentPointer);
    document.removeEventListener('keydown', documentKey);
    return leaks;
  });
  assert.deepEqual(isolated, {
    boardPointer: 0,
    boardKey: 0,
    documentPointer: 0,
    documentKey: 0
  });

  await page.evaluate(() => {
    window.__detachedFullscreenNote = document.querySelector('#fullscreen-note-source-browser-a1');
    window.__detachedFullscreenNote.remove();
  });
  await page.waitForFunction(() =>
    !__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
  );
  await page.evaluate(() => {
    document.querySelector('.flex-child').appendChild(window.__detachedFullscreenNote);
    window.__bootstrapFullscreenNotes();
  });
  await page.waitForFunction(() =>
    __boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')?.dataset.open === '1'
  );

  await firstBoard.locator('.lia-dgs-fullscreen-button').click();
  await page.waitForFunction(() => {
    const container = __boards.A1.containerObj;
    return container.getRootNode().fullscreenElement !== container &&
      document.fullscreenElement !== container;
  });
  await page.waitForFunction(() =>
    getComputedStyle(__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')).display === 'none'
  );

  await page.evaluate(() => {
    window.__oldFullscreenNoteBoard = __boards.B2;
    const oldHost = document.querySelector('#fullscreen-note-board-b2');
    oldHost.replaceWith(oldHost.cloneNode(false));
  });
  await page.waitForFunction(() =>
    window.__boards?.B2 &&
    window.__boards.B2 !== window.__oldFullscreenNoteBoard &&
    window.__boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
  );
  const replaced = await page.evaluate(() => {
    const bar = __boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar');
    return {
      bars: __boards.B2.containerObj.querySelectorAll('.lia-dgs-fullscreen-note-bar').length,
      display: getComputedStyle(bar).display,
      title: bar.querySelector('.lia-dgs-fullscreen-note-title')?.textContent,
      text: bar.querySelector('strong')?.textContent
    };
  });
  assert.deepEqual(replaced, {
    bars: 1,
    display: 'none',
    title: 'Fullscreen notes',
    text: 'Aufgabe:'
  });

  await page.evaluate(() => {
    document.querySelector('#fullscreen-note-source-browser-a1').remove();
    document.querySelector('#fullscreen-note-source-browser-b2').remove();
  });
  await page.waitForFunction(() =>
    !__boards.A1.containerObj.querySelector('.lia-dgs-fullscreen-note-bar') &&
    !__boards.B2.containerObj.querySelector('.lia-dgs-fullscreen-note-bar')
  );

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(await page.evaluate(() => profileErrors.slice()), []);
  console.log('PASS fullscreen note rendering, fullscreen UI, isolation, multiple boards, and lifecycle');
} finally {
  try { await browser?.close(); } catch {}
  server.closeAllConnections();
  server.close();
}
