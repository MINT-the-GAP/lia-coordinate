import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  }
});

const { splitStaticText, typesetStaticText } = await import('../src/static/staticTex.ts');
const { parseStaticCoordTextSpec } = await import('../src/static/staticSvg.ts');
const SVG_NS = 'http://www.w3.org/2000/svg';
const mathRun = (text, display = false) => ({ text, math: true, display });
const textRun = text => ({ text, math: false, display: false });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Geometry in this DOM double follows SVG baseline and viewBox coordinates.
// Actual glyph metrics and browser layout are covered in the browser suite.
class Element {
  constructor(name, document, namespaceURI = SVG_NS) {
    this.localName = name;
    this.ownerDocument = document;
    this.namespaceURI = namespaceURI;
    this.parentNode = null;
    this.children = [];
    this.style = {};
    this.textContent = '';
    this.attrs = new Map();
    this.listeners = new Map();
  }
  get attributes() { return [...this.attrs.values()]; }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get isConnected() {
    return this === this.ownerDocument.documentElement || !!this.parentNode?.isConnected;
  }
  get viewBox() {
    const [x, y, width, height] = (this.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number);
    return { baseVal: { x, y, width, height } };
  }
  setAttribute(name, value) { this.setAttributeNS(null, name, value); }
  setAttributeNS(namespaceURI, name, value) {
    this.attrs.set(name, { name, localName: name.split(':').at(-1), value: String(value), namespaceURI });
  }
  getAttribute(name) { return this.attrs.get(name)?.value ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    this.ownerDocument.onAppend?.(child);
    return child;
  }
  insertBefore(child, sibling) {
    child.remove();
    const index = this.children.indexOf(sibling);
    assert.notEqual(index, -1);
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
  }
  querySelectorAll(selector) {
    const nodes = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return nodes;
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return nodes.filter(node => attr
      ? node.getAttribute(attr[1]) !== null && (attr[2] === undefined || node.getAttribute(attr[1]) === attr[2])
      : node.localName === selector);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  cloneNode(deep) {
    const copy = new Element(this.localName, this.ownerDocument, this.namespaceURI);
    this.attributes.forEach(attribute => copy.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value));
    copy.textContent = this.textContent;
    copy.style = { ...this.style };
    if (deep) this.children.forEach(child => copy.appendChild(child.cloneNode(true)));
    return copy;
  }
  addEventListener(name, callback) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(callback);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, callback) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(listener => listener !== callback));
  }
  dispatch(name) {
    this['on' + name]?.();
    (this.listeners.get(name) || []).slice().forEach(listener => listener());
  }
  fontSize() { return Number(this.getAttribute('font-size')) || this.parentNode?.fontSize() || 16; }
  getComputedTextLength() { return this.textContent.length * this.fontSize() / 2; }
  getBBox() {
    if (this.localName === 'text') {
      const size = this.fontSize();
      return { x: Number(this.getAttribute('x')), y: Number(this.getAttribute('y')) - size * 0.8,
        width: this.getComputedTextLength(), height: size };
    }
    if (this.localName === 'svg') {
      return { x: Number(this.getAttribute('x')), y: Number(this.getAttribute('y')),
        width: Number(this.getAttribute('width')), height: Number(this.getAttribute('height')) };
    }
    const boxes = this.children.map(child => child.getBBox());
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    return { x: left, y: top, width: Math.max(...boxes.map(box => box.x + box.width)) - left,
      height: Math.max(...boxes.map(box => box.y + box.height)) - top };
  }
}

function browser() {
  const document = {
    createElementNS(namespace, name) { return new Element(name, this, namespace); },
    createElement(name) { return new Element(name, this, 'http://www.w3.org/1999/xhtml'); },
    get scripts() { return this.documentElement.querySelectorAll('script'); }
  };
  document.documentElement = document.createElement('html');
  document.head = document.documentElement.appendChild(document.createElement('head'));
  document.body = document.documentElement.appendChild(document.createElement('body'));
  const view = { document, setTimeout, clearTimeout };
  view.parent = view;
  document.defaultView = view;
  const root = document.body.appendChild(document.createElementNS(SVG_NS, 'svg'));
  return { document, view, root };
}

function label(env, content = '$x$', attrs = {}) {
  const element = env.document.createElementNS(SVG_NS, 'text');
  Object.entries({ x: 100, y: 200, 'font-size': 16, fill: '#0000ff', 'fill-opacity': 0.4,
    'font-family': 'Example Font', ...attrs }).forEach(([key, value]) => element.setAttribute(key, value));
  element.textContent = content;
  env.root.appendChild(element);
  return element;
}

function makeMathJax(env, { startup = Promise.resolve(), load, convert } = {}) {
  const calls = { loads: [], outputs: [], documents: [], conversions: [], inputs: [] };
  const font = Object.freeze({ family: 'TeX', glyphData: { vectorAccent: 'sentinel' } });
  const publicInput = { name: 'TeX', tags: { counter: 7 } };
  const publicDocument = { outputJax: { name: 'CHTML' }, inputJax: [publicInput] };
  const engine = {
    version: '3.2.2',
    config: { svg: Object.freeze({ font, scale: 1.2, fontCache: 'global' }) },
    loader: { load(name) { calls.loads.push(name); return load ? load(name) : Promise.resolve(); } },
    startup: {
      promise: startup,
      document: publicDocument,
      constructors: { svg: class {
        constructor(options) { this.options = options; calls.outputs.push(this); }
      } },
      getInputJax() {
        const input = { name: 'TeX', tags: { counter: 0 } };
        calls.inputs.push(input);
        return [input];
      },
      handler: { create(document, options) {
        calls.documents.push({ document, options });
        return { convert(source, settings) {
          calls.conversions.push({ source, settings });
          if (convert) return convert(source, settings);
          return convertedSvg(env.document);
        } };
      } }
    },
    _: { mathjax: { mathjax: { handleRetriesFor: async callback => {
      for (;;) {
        try { return await callback(); }
        catch (error) { if (!error.retry) throw error; await error.retry; }
      }
    } } } }
  };
  env.view.MathJax = engine;
  return { engine, calls, font, publicDocument, publicInput };
}

function convertedSvg(document, { error = false } = {}) {
  const container = document.createElement('mjx-container');
  const svg = container.appendChild(document.createElementNS(SVG_NS, 'svg'));
  svg.setAttribute('viewBox', '0 -750 1200 1000');
  svg.setAttribute('style', 'vertical-align: -0.25ex;');
  svg.id = 'formula';
  const clip = svg.appendChild(document.createElementNS(SVG_NS, 'clipPath'));
  clip.id = 'clip';
  const path = svg.appendChild(document.createElementNS(SVG_NS, 'path'));
  path.id = 'glyph';
  path.setAttribute('d', 'M0 0L1200 750');
  const use = svg.appendChild(document.createElementNS(SVG_NS, 'use'));
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#glyph');
  use.setAttribute('clip-path', 'url(#clip)');
  use.setAttribute('aria-labelledby', 'formula glyph');
  if (error) path.setAttribute('data-mml-node', 'merror');
  return container;
}

async function finish() {
  // Drain promise chains and work queued by callbacks without sleeping.
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
}

function ready(env) { return env.root.querySelectorAll('[data-lia-static-tex="ready"]'); }

test('delimited vectors, indices, fractions and mixed labels keep exact TeX source', () => {
  for (const source of [String.raw`\vec{a}`, String.raw`\vec{a} - \vec{b}`, 'v_0', 'p(v) = mv',
    String.raw`\frac{a}{b}`, 'x', 'y']) {
    assert.deepEqual(splitStaticText('$' + source + '$'), [mathRun(source)]);
  }
  assert.deepEqual(splitStaticText(String.raw`Tempo $v_0$ in $\frac{m}{s}$ heute`), [
    textRun('Tempo '), mathRun('v_0'), textRun(' in '), mathRun(String.raw`\frac{m}{s}`), textRun(' heute')
  ]);
  assert.deepEqual(splitStaticText(String.raw`$$\frac{1}{2}$$ und \(x\) oder \[y\]`), [
    mathRun(String.raw`\frac{1}{2}`, true), textRun(' und '), mathRun('x'), textRun(' oder '), mathRun('y', true)
  ]);
});

test('ordinary text, escaped dollars and unmatched delimiters stay literal', () => {
  for (const source of ['normaler Text', String.raw`\vec{a} und v_0`, String.raw`Preis \$5`,
    '$nicht geschlossen', 'Kosten 5 $', String.raw`\(nicht geschlossen`, '$x\ny$']) {
    assert.deepEqual(splitStaticText(source), [textRun(source)]);
  }
  assert.deepEqual(splitStaticText(''), []);
  assert.deepEqual(splitStaticText(String.raw`Preis \$5; $x$`), [textRun(String.raw`Preis \$5; `), mathRun('x')]);
});

test('plain text never loads MathJax or changes the SVG text node', async () => {
  const env = browser();
  Object.defineProperty(env.view, 'MathJax', { get() { assert.fail('plain text accessed MathJax'); } });
  const text = label(env, 'Vektor a und v_0');
  typesetStaticText(text, text.textContent);
  await finish();
  assert.equal(env.root.children[0], text);
  assert.equal(text.getAttribute('data-lia-static-tex'), null);
  assert.equal(env.document.scripts.length, 0);
  assert.equal(env.view.__liaStaticTex, undefined);
});

test('concurrent labels share SVG loading with loaded font options and leave global CHTML untouched', async () => {
  const env = browser();
  const startup = deferred();
  const loading = deferred();
  const math = makeMathJax(env, { startup: startup.promise, load: () => loading.promise });
  const first = label(env, String.raw`$\vec{a}$`);
  const second = label(env, '$v_0$');
  typesetStaticText(first, first.textContent);
  typesetStaticText(second, second.textContent);
  await finish();
  assert.equal(math.calls.loads.length, 0, 'startup completes before loading SVG');
  startup.resolve();
  await finish();
  assert.deepEqual(math.calls.loads, ['output/svg']);
  assert.equal(ready(env).length, 0);
  loading.resolve();
  await finish();
  assert.equal(ready(env).length, 2);
  assert.equal(math.calls.outputs.length, 1);
  assert.equal(math.calls.outputs[0].options.font, math.font, 'SVG font instance must not be replaced or copied');
  assert.equal(math.calls.outputs[0].options.scale, 1.2);
  assert.equal(math.calls.outputs[0].options.fontCache, 'none');
  assert.equal(math.engine.config.svg.fontCache, 'global');
  assert.equal(math.calls.documents[0].document, env.document);
  assert.notEqual(math.calls.documents[0].options.InputJax[0], math.publicInput);
  assert.equal(math.engine.startup.document, math.publicDocument);
  assert.equal(math.publicDocument.outputJax.name, 'CHTML');
  assert.equal(math.publicInput.tags.counter, 7);
  assert.deepEqual(math.calls.conversions.map(call => call.source), [String.raw`\vec{a}`, 'v_0']);
  assert.equal(env.document.scripts.length, 0);
});

test('static-only import lazily loads CHTML once while retaining authored MathJax configuration', async () => {
  const env = browser();
  const tex = { macros: { R: String.raw`\mathbb{R}` } };
  const readyCallback = () => {};
  env.view.MathJax = { tex, startup: { ready: readyCallback } };
  const sources = ['$x$', '$y$'];
  sources.forEach(source => { const node = label(env, source); typesetStaticText(node, source); });
  await finish();
  assert.equal(env.document.scripts.length, 1);
  const script = env.document.scripts[0];
  assert.match(script.src, /mathjax@3.*tex-chtml\.js$/);
  assert.equal(env.view.MathJax.tex, tex);
  assert.equal(env.view.MathJax.startup.ready, readyCallback);
  assert.equal(env.view.MathJax.startup.typeset, false);
  const math = makeMathJax(env);
  script.dispatch('load');
  await finish();
  assert.equal(ready(env).length, 2);
  assert.deepEqual(math.calls.loads, ['output/svg']);
  assert.equal(script.onload, null);
  assert.equal(script.onerror, null);
});

test('MathJax already loading in the host document is awaited without an extra script', async () => {
  const env = browser();
  const script = env.document.createElement('script');
  script.src = 'https://example.test/mathjax/tex-chtml.js';
  env.document.head.appendChild(script);
  const node = label(env);
  typesetStaticText(node, node.textContent);
  await finish();
  assert.equal(env.document.scripts.length, 1);
  makeMathJax(env);
  script.dispatch('load');
  await finish();
  assert.equal(ready(env).length, 1);
  assert.equal(script.listeners.get('load').length, 0);
  assert.equal(script.listeners.get('error').length, 0);
});

test('font overrides, color, opacity, centering and painter order survive asynchronous replacement', async () => {
  const env = browser();
  const loading = deferred();
  makeMathJax(env, { load: () => loading.promise });
  const background = env.root.appendChild(env.document.createElementNS(SVG_NS, 'path'));
  const node = label(env, '$x$');
  const foreground = env.root.appendChild(env.document.createElementNS(SVG_NS, 'path'));
  typesetStaticText(node, node.textContent);
  node.setAttribute('font-size', 20);
  loading.resolve();
  await finish();
  const group = ready(env)[0];
  assert.deepEqual(env.root.children, [background, group, foreground]);
  assert.equal(group.getAttribute('fill'), '#0000ff');
  assert.equal(group.style.color, '#0000ff');
  assert.equal(group.getAttribute('opacity'), '0.4');
  assert.equal(group.getAttribute('font-size'), '20');
  assert.equal(group.getAttribute('font-family'), 'Example Font');
  assert.equal(group.getAttribute('transform'), 'translate(88 205)');
  assert.equal(group.getAttribute('aria-label'), '$x$');
  assert.equal(group.getAttribute('visibility'), null);
  const svg = group.querySelector('svg');
  assert.equal(svg.getAttribute('width'), '24');
  assert.equal(svg.getAttribute('height'), '20');
  assert.equal(svg.getAttribute('y'), '-15');
  assert.equal(svg.getAttribute('style'), null);
  assert.equal(svg.style.overflow, 'visible');
});

test('mixed labels retain literal text runs and spaces next to formula SVGs', async () => {
  const env = browser();
  makeMathJax(env);
  const source = 'Tempo $v_0$ in m/s';
  const node = label(env, source, { 'font-size': 20 });
  typesetStaticText(node, source);
  await finish();
  const group = ready(env)[0];
  assert.deepEqual(group.children.map(child => child.localName), ['text', 'svg', 'text']);
  assert.deepEqual(group.querySelectorAll('text').map(child => child.textContent), ['Tempo ', ' in m/s']);
  assert.equal(group.children[1].getAttribute('x'), '60');
  assert.equal(group.children[2].getAttribute('x'), '84');
  assert.equal(group.children[0].style.whiteSpace, 'pre');
  assert.equal(group.children[0].getAttribute('xml:space'), 'preserve');
});

test('discarded renders cannot insert stale labels when loading or conversion finishes', async () => {
  const env = browser();
  const loading = deferred();
  const conversion = deferred();
  const math = makeMathJax(env, { load: () => loading.promise, convert: () => conversion.promise });
  const abandonedBeforeMount = label(env);
  typesetStaticText(abandonedBeforeMount, '$x$');
  abandonedBeforeMount.remove();
  await finish();
  assert.equal(math.calls.loads.length, 0);
  const abandonedDuringLoad = label(env, '$old$');
  typesetStaticText(abandonedDuringLoad, '$old$');
  await finish();
  abandonedDuringLoad.remove();
  const abandonedDuringConversion = label(env, '$obsolete$');
  typesetStaticText(abandonedDuringConversion, '$obsolete$');
  loading.resolve();
  await finish();
  abandonedDuringConversion.remove();
  const current = label(env, '$current$');
  typesetStaticText(current, '$current$');
  conversion.resolve(convertedSvg(env.document));
  await finish();
  assert.deepEqual(math.calls.conversions.map(call => call.source), ['obsolete', 'current']);
  assert.equal(ready(env).length, 1);
  assert.equal(ready(env)[0].getAttribute('aria-label'), '$current$');
  assert.equal(env.root.querySelectorAll('text').length, 0);
});

test('cached conversions and duplicate requests produce one label per node with unique IDs and references', async () => {
  const env = browser();
  const math = makeMathJax(env);
  const first = label(env);
  typesetStaticText(first, '$x$');
  typesetStaticText(first, '$x$');
  const second = label(env);
  typesetStaticText(second, '$x$');
  await finish();
  assert.equal(ready(env).length, 2);
  assert.equal(math.calls.conversions.length, 1, 'identical formulas reuse their conversion');
  const ids = env.root.querySelectorAll('[id]').map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  ready(env).forEach(group => {
    const svg = group.querySelector('svg');
    const use = svg.querySelector('use');
    assert.equal(use.getAttribute('xlink:href'), '#' + svg.querySelector('path').id);
    assert.equal(use.getAttribute('clip-path'), 'url(#' + svg.querySelector('clipPath').id + ')');
    assert.equal(use.getAttribute('aria-labelledby'), svg.id + ' ' + svg.querySelector('path').id);
  });
});

test('failed loading keeps readable fallback and a later render retries successfully', async () => {
  const env = browser();
  let attempts = 0;
  const math = makeMathJax(env, { load: () => ++attempts === 1
    ? Promise.reject(new Error('offline')) : Promise.resolve() });
  const warnings = [];
  const oldWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const first = label(env, '$v_0$');
    typesetStaticText(first, '$v_0$');
    await finish();
    assert.equal(first.isConnected, true);
    assert.equal(first.textContent, '$v_0$');
    assert.equal(first.getAttribute('data-lia-static-tex'), 'error');
    assert.equal(warnings.length, 1);
    first.remove();
    const second = label(env, '$v_0$');
    typesetStaticText(second, '$v_0$');
    await finish();
    assert.equal(ready(env).length, 1);
    assert.deepEqual(math.calls.loads, ['output/svg', 'output/svg']);
  } finally { console.warn = oldWarn; }
});

test('conversion errors do not poison the queue and missing extensions can request a retry', async () => {
  const env = browser();
  let retry = false;
  const math = makeMathJax(env, { convert: source => {
    if (source === 'bad') return convertedSvg(env.document, { error: true });
    if (!retry) { retry = true; throw { retry: Promise.resolve() }; }
    return convertedSvg(env.document);
  } });
  const oldWarn = console.warn;
  console.warn = () => {};
  try {
    const bad = label(env, '$bad$');
    const good = label(env, String.raw`$\require{cancel}\cancel{x}$`);
    typesetStaticText(bad, bad.textContent);
    typesetStaticText(good, good.textContent);
    await finish();
    assert.equal(bad.getAttribute('data-lia-static-tex'), 'error');
    assert.equal(bad.isConnected, true);
    assert.equal(ready(env).length, 1);
    assert.equal(math.calls.conversions.length, 3);
    assert.equal(good.isConnected, false);
  } finally { console.warn = oldWarn; }
});


test('CoordText parsing preserves nested TeX braces and escaped dollars while decoding legacy plain text', () => {
  const parse = content => parseStaticCoordTextSpec('diagramm;[1.5;0.35];' + content + ';#0000ff;1');
  const fraction = String.raw`$\frac{1}{\sqrt{2}}$`;
  assert.equal(parse(fraction).content, fraction);
  assert.equal(parse(fraction).renderedContent, String.raw`\frac{1}{\sqrt{2}}`);
  const escaped = String.raw`Price \$5 and \$10`;
  assert.equal(parse(escaped).renderedContent, escaped);
  const mixed = String.raw`{{Anteil}} $\frac{{a}}{{b}}$ und {{Text}}`;
  assert.equal(parse(mixed).content, mixed);
  assert.equal(parse(mixed).renderedContent, String.raw`(Anteil) \frac{{a}}{{b}} und (Text)`);
});

test('script-frame rendering reuses parent MathJax but constructs output for its own document', async () => {
  const parent = browser();
  const math = makeMathJax(parent);
  const child = browser();
  child.view.parent = parent.view;
  const node = label(child);
  typesetStaticText(node, '$x$');
  await finish();
  assert.equal(ready(child).length, 1);
  assert.equal(child.document.scripts.length, 0);
  assert.equal(math.calls.documents[0].document, child.document);
  assert.equal(parent.view.MathJax.startup.document, math.publicDocument);
});

test('failed static-only script is removed so another render can load it again', async () => {
  const env = browser();
  const oldWarn = console.warn;
  console.warn = () => {};
  try {
    const first = label(env);
    typesetStaticText(first, '$x$');
    await finish();
    const script = env.document.scripts[0];
    script.dispatch('error');
    await finish();
    assert.equal(env.document.scripts.length, 0);
    assert.equal(first.getAttribute('data-lia-static-tex'), 'error');
    first.remove();
    const second = label(env);
    typesetStaticText(second, '$x$');
    await finish();
    assert.equal(env.document.scripts.length, 1);
    assert.notEqual(env.document.scripts[0], script);
    makeMathJax(env);
    env.document.scripts[0].dispatch('load');
    await finish();
    assert.equal(ready(env).length, 1);
  } finally { console.warn = oldWarn; }
});


test('an even number of backslashes does not escape the following math delimiter', () => {
  assert.deepEqual(splitStaticText(String.raw`$a\\$`), [mathRun(String.raw`a\\`)]);
  assert.deepEqual(splitStaticText(String.raw`\\$v_0$`), [textRun(String.raw`\\`), mathRun('v_0')]);
});
