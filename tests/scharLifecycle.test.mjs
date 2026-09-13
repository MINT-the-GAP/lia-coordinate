import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
  },
  load(url, context, next) {
    const loaded = next(url, context);
    if (!url.endsWith('.ts')) return loaded;
    let source = Buffer.from(loaded.source).toString('utf8');
    if (url.endsWith('/subsystems/schar.ts')) source += '\nexport { scharMutationIsRelevant, restoreScharEntryState, applyScharLanguage };';
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});
globalThis.window = {};
const { init, scharMutationIsRelevant, restoreScharEntryState, applyScharLanguage, buildScharTermMarkup } = await import('../src/subsystems/schar.ts');

function element(id = '', children = []) {
  return {
    nodeType: 1, id, isConnected: true, children,
    matches: () => id.startsWith('schar-spec-'),
    querySelector: () => children.find(child => child.matches()) || null,
    contains(node) { return this === node || children.some(child => child.contains(node)); },
    hasAttribute: () => false
  };
}
const childList = (addedNodes = [], removedNodes = []) => ({ type: 'childList', addedNodes, removedNodes });
const attribute = (target, attributeName, oldValue = null) => ({ type: 'attributes', target, attributeName, oldValue });

test('only Schar markers and removal of their own board cause lifecycle work', () => {
  const host = element('jsx-host');
  const container = element('board');
  container.getRootNode = () => ({ host });
  window.__scharEntries = { a: { board: { containerObj: container } } };
  for (const id of ['quiz-feedback', 'MathJax', 'other-board', 'schar-panel']) {
    assert.equal(scharMutationIsRelevant(childList([element(id)], [element(id)])), false);
    assert.equal(scharMutationIsRelevant(attribute(element(id), 'data-spec')), false);
  }
  const marker = element('schar-spec-one');
  assert.equal(scharMutationIsRelevant(childList([element('wrapper', [marker])])), true);
  assert.equal(scharMutationIsRelevant(childList([], [marker])), true);
  for (const name of ['data-spec', 'data-lia-static-claimed', 'id', 'data-language']) {
    assert.equal(scharMutationIsRelevant(attribute(marker, name)), true);
  }
  assert.equal(scharMutationIsRelevant(attribute(element('renamed'), 'id', 'schar-spec-one')), true);
  assert.equal(scharMutationIsRelevant(childList([], [host])), true);
  assert.equal(scharMutationIsRelevant(childList([], [element('wrapper', [container])])), true);
});

test('repeated bootstrap preserves input, graph, values, scale and listeners on a live unchanged board', () => {
  const spec = 'g;x;a*(x-b)^2+c;board;term=1;#b41f65';
  const marker = element('schar-spec-one'); marker.dataset = { spec };
  const ui = languageUi();
  const panel = ui.panel;
  const graph = { id: 'graph' };
  const container = element('board', []);
  container.contains = node => node === panel;
  container.getRootNode = () => ({ querySelector: () => ({ id: '__lia_schar_css_v6' }) });
  const board = { containerObj: container, objects: { graph } };
  const values = { a: .5, b: 1, c: -2 };
  const slider = { isConnected: true, value: '1' };
  const entry = { ...ui, uid: 'one', language: 'en', spec, marker, boardId: 'board', board, panel, graph, values,
    cfg: { showTerm: true }, termVisible: false, termMarkup: '',
    slidersByParam: { b: slider }, panelScale: 1.2, panelMinimized: false,
    stopDrag: () => assert.fail('must keep current drag binding') };
  const observers = [], deferred = [];
  const originals = new Map(['window', 'document', 'MutationObserver', 'requestAnimationFrame', 'setTimeout'].map(k => [k, globalThis[k]]));
  try {
    globalThis.window = { __boards: { board }, __scharEntries: { 'schar-one': entry } };
    globalThis.document = { getElementById: () => marker, querySelectorAll: () => [marker], body: {} };
    globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target, options) { this.options = options; } };
    globalThis.requestAnimationFrame = fn => deferred.push(fn);
    globalThis.setTimeout = fn => deferred.push(fn);
    init(); deferred.splice(0).forEach(fn => fn()); init();
    for (let i = 0; i < 8; i++) window.__bootstrapScharen();
    assert.equal(window.__scharEntries['schar-one'], entry);
    assert.equal(entry.slidersByParam.b, slider);
    assert.equal(entry.graph, graph);
    assert.equal(entry.values, values);
    assert.equal(entry.panelScale, 1.2);
    assert.equal(observers.length, 1);
    assert.deepEqual(observers[0].options.attributeFilter, ['data-spec', 'id', 'data-lia-static-claimed', 'data-language']);
    let scans = 0;
    const bootstrap = window.__bootstrapScharen;
    window.__bootstrapScharen = () => { scans++; bootstrap(); };
    observers[0].callback([childList([element('quiz-feedback')])]);
    assert.equal(scans, 0);
    observers[0].callback([attribute(marker, 'data-spec')]);
    assert.equal(scans, 1);
    assert.equal(window.__scharEntries['schar-one'], entry);
    marker.dataset.language = 'de-DE';
    observers[0].callback([attribute(marker, 'data-language')]);
    assert.equal(entry.language, 'de');
    assert.equal(ui.termLabel.textContent, 'Term anzeigen');
    assert.equal(ui.minBtnEl.getAttribute('aria-label'), 'Parameterregler minimieren');
    assert.equal(entry.slidersByParam.b, slider);
    assert.equal(entry.graph, graph);
    assert.equal(entry.values, values);
    assert.equal(entry.panelScale, 1.2);
    assert.equal(entry.termVisible, false);
    assert.equal(window.renderScharFromSpec('one', spec, 'en-GB'), true);
    assert.equal(entry.language, 'en');
    assert.equal(ui.termLabel.textContent, 'Show term');
    assert.equal(entry.slidersByParam.b, slider);
    assert.equal(window.__scharEntries['schar-one'], entry);
  } finally {
    for (const [key, value] of originals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('saved values and panel scale survive restoration, including the original compact scale', () => {
  window.__liaScharStateStore = { 'one::board': { values: { a: .5, b: 1, c: -2 }, panelScale: 1.2, panelMinimized: true, termVisible: true } };
  const entry = { uid: 'one', boardId: 'board', params: ['a', 'b', 'c'], values: {}, panelScale: 1 };
  restoreScharEntryState(entry);
  assert.deepEqual(entry.values, { a: .5, b: 1, c: -2 });
  assert.equal(entry.panelScale, 1.2); assert.equal(entry.panelMinimized, true); assert.equal(entry.termVisible, true);
  window.__liaScharStateStore['one::board'].panelScale = .55;
  restoreScharEntryState(entry); assert.equal(entry.panelScale, .55);
});

function languageUi() {
  const makeControl = () => ({
    isConnected: true, attributes: new Map(), style: {}, writes: 0,
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    setAttribute(name, value) { this.writes++; this.attributes.set(name, value); },
    set innerHTML(value) { assert.fail('A language update must not replace control descendants'); }
  });
  const panel = makeControl(), resize = makeControl();
  const termLabel = { textContent: '' };
  panel.querySelector = () => resize;
  const termToggleWrapEl = makeControl();
  termToggleWrapEl.querySelector = () => termLabel;
  return { panel, resize, termLabel, termToggleWrapEl, minBtnEl: makeControl(), miniWrapEl: makeControl(),
    termToggleEl: makeControl(), termEl: makeControl() };
}

test('Schar updates localized text, tooltips and accessibility names without replacing controls or panel state', () => {
  const ui = languageUi();
  const entry = { ...ui, language: 'en', values: { a: .5, b: 1, c: -2 }, panelScale: 1.25,
    panelMinimized: false, termVisible: true, graph: {}, slidersByParam: { a: {} } };
  const original = { graph: entry.graph, slider: entry.slidersByParam.a, values: entry.values };
  applyScharLanguage(entry, 'en');
  assert.equal(ui.termLabel.textContent, 'Show term');
  assert.equal(ui.minBtnEl.getAttribute('title'), 'Minimize parameter controls');
  assert.equal(ui.minBtnEl.getAttribute('aria-label'), 'Minimize parameter controls');
  assert.equal(ui.miniWrapEl.getAttribute('aria-label'), 'Restore parameter controls');
  assert.equal(ui.resize.getAttribute('aria-label'), 'Resize parameter controls');
  assert.equal(ui.panel.getAttribute('lang'), 'en');
  const writes = () => [ui.panel, ui.resize, ui.termToggleWrapEl, ui.minBtnEl, ui.miniWrapEl, ui.termToggleEl]
    .reduce((sum, control) => sum + control.writes, 0);
  const count = writes();
  applyScharLanguage(entry, 'en');
  assert.equal(writes(), count, 'unchanged locale must not create attribute mutations');
  entry.panelMinimized = true;
  applyScharLanguage(entry, 'de');
  assert.equal(ui.termLabel.textContent, 'Term anzeigen');
  assert.equal(ui.termToggleEl.getAttribute('aria-label'), 'Term anzeigen');
  assert.equal(ui.minBtnEl.getAttribute('title'), 'Parameterregler wiederherstellen');
  assert.equal(ui.miniWrapEl.getAttribute('title'), 'Parameterregler wiederherstellen');
  assert.equal(ui.resize.getAttribute('aria-label'), 'Größe der Parameterregler ändern');
  assert.equal(ui.panel.getAttribute('lang'), 'de');
  assert.equal(entry.graph, original.graph);
  assert.equal(entry.slidersByParam.a, original.slider);
  assert.equal(entry.values, original.values);
  assert.equal(entry.panelScale, 1.25);
  assert.equal(entry.panelMinimized, true);
  assert.equal(entry.termVisible, true);
});

test('Schar localizes displayed parabola and line decimals without changing model values', () => {
  const entry = { language: 'en', cfg: { name: 'g', showName: true, variableName: 'x', expr: 'a*(x-b)^2+c' },
    params: ['a', 'b', 'c'], values: { a: .5, b: 1.25, c: -2.5 }, linearMN: null, polyCoeffDrag: null };
  const model = entry.values;
  assert.match(buildScharTermMarkup(entry), /0\.5/);
  assert.match(buildScharTermMarkup(entry), /1\.25/);
  entry.language = 'de';
  assert.match(buildScharTermMarkup(entry), /0\{,\}5/);
  assert.match(buildScharTermMarkup(entry), /1\{,\}25/);
  entry.linearMN = { m: 'a', n: 'c' };
  assert.match(buildScharTermMarkup(entry), /0\{,\}5/);
  entry.language = 'en';
  assert.match(buildScharTermMarkup(entry), /0\.5/);
  assert.equal(entry.values, model);
  assert.deepEqual(entry.values, { a: .5, b: 1.25, c: -2.5 });
});
