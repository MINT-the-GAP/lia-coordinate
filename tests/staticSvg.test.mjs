import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  }
});

const {
  initializeCoordinateBoard,
  parseCoordSpec
} = await import('../src/coord/boardHelpers.ts');
const {
  bootstrapStaticCoordinateBoards,
  disposeStaticCoordinateBoard,
  initStaticRenderer,
  initializeStaticCoordinateBoard,
  isStaticCoordinateBoard,
  parseStaticAreaSpec,
  parseStaticDistanceSpec,
  projectStaticPoint,
  renderStaticSvg,
  staticDashArray
} = await import('../src/static/staticSvg.ts');

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function dataAttributeName(property) {
  return 'data-' + String(property).replace(/[A-Z]/g, match => '-' + match.toLowerCase());
}

function createStyleDeclaration() {
  return {
    setProperty(name, value) {
      this[name] = String(value);
    },
    removeProperty(name) {
      const previous = this[name] || '';
      delete this[name];
      return previous;
    }
  };
}

function simpleSelectorMatches(element, selector) {
  let source = String(selector || '').trim();
  if (!source) return false;
  if (source.includes(' ')) source = source.split(/\s+/).at(-1);

  const negated = [...source.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]);
  source = source.replace(/:not\([^)]+\)/g, '');
  if (negated.some(part => simpleSelectorMatches(element, part))) return false;

  const tagMatch = source.match(/^[a-z*][a-z0-9-]*/i);
  if (tagMatch && tagMatch[0] !== '*' && element.localName !== tagMatch[0].toLowerCase()) {
    return false;
  }

  const idMatch = source.match(/#([a-z0-9_-]+)/i);
  if (idMatch && element.id !== idMatch[1]) return false;

  const classMatches = [...source.matchAll(/\.([a-z0-9_-]+)/gi)];
  const classes = String(element.className || '').split(/\s+/).filter(Boolean);
  if (classMatches.some(match => !classes.includes(match[1]))) return false;

  const attributePattern = /\[([^\]\s~|^$*!=]+)\s*(?:(\^=|\$=|\*=|=)\s*["']?([^\]"']*)["']?)?\]/g;
  for (const match of source.matchAll(attributePattern)) {
    const [, name, operator, expected = ''] = match;
    if (!element.hasAttribute(name)) return false;
    const actual = element.getAttribute(name) || '';
    if (operator === '=' && actual !== expected) return false;
    if (operator === '^=' && !actual.startsWith(expected)) return false;
    if (operator === '$=' && !actual.endsWith(expected)) return false;
    if (operator === '*=' && !actual.includes(expected)) return false;
  }

  return true;
}

class FakeElement {
  constructor(localName, ownerDocument, namespaceURI = 'http://www.w3.org/1999/xhtml') {
    this.nodeType = 1;
    this.localName = String(localName).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.namespaceURI = namespaceURI;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.style = createStyleDeclaration();
    this.className = '';
    this.textContent = '';
    this.clientWidth = 0;
    this.clientHeight = 0;
    this._attributes = new Map();
    this.dataset = new Proxy({}, {
      get: (_target, property) => this.getAttribute(dataAttributeName(property)),
      set: (_target, property, value) => {
        this.setAttribute(dataAttributeName(property), value);
        return true;
      },
      deleteProperty: (_target, property) => {
        this.removeAttribute(dataAttributeName(property));
        return true;
      }
    });
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get parentElement() {
    return this.parentNode instanceof FakeElement ? this.parentNode : null;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get childNodes() {
    return this.children;
  }

  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument?.documentElement) return true;
      current = current.parentNode;
    }
    return false;
  }

  setAttribute(name, value) {
    this._attributes.set(String(name), String(value));
  }

  setAttributeNS(_namespace, name, value) {
    this.setAttribute(name, value);
  }

  getAttribute(name) {
    return this._attributes.has(String(name)) ? this._attributes.get(String(name)) : null;
  }

  hasAttribute(name) {
    return this._attributes.has(String(name));
  }

  removeAttribute(name) {
    this._attributes.delete(String(name));
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach(child => this.appendChild(child));
  }

  insertBefore(child, reference) {
    if (!reference) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(reference);
    child.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  replaceChildren(...children) {
    this.children.slice().forEach(child => this.removeChild(child));
    this.append(...children);
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  matches(selector) {
    return String(selector).split(',').some(part => simpleSelectorMatches(this, part));
  }

  querySelectorAll(selector) {
    const source = String(selector || '').trim();
    const directOnly = /^:scope\s*>/.test(source);
    const normalized = source.replace(/^:scope\s*>\s*/, '');
    const selectors = normalized.split(',').map(part => part.trim()).filter(Boolean);
    const result = [];

    const visit = node => {
      node.children.forEach(child => {
        if (selectors.some(part => simpleSelectorMatches(child, part))) result.push(child);
        if (!directOnly) visit(child);
      });
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener() {}
  removeEventListener() {}

  getRootNode() {
    return this.ownerDocument || this;
  }

  getBoundingClientRect() {
    const width = Number.parseFloat(this.style.width) || this.clientWidth || 0;
    const height = Number.parseFloat(this.style.height) || this.clientHeight || 0;
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
  }
}

class FakeDocument {
  constructor() {
    this.nodeType = 9;
    this.hidden = false;
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.documentElement.clientWidth = 900;
    this.documentElement.clientHeight = 700;
    this.body.clientWidth = 900;
    this.body.clientHeight = 700;
    this.documentElement.appendChild(this.body);
  }

  createElement(localName) {
    return new FakeElement(localName, this);
  }

  createElementNS(namespaceURI, localName) {
    return new FakeElement(localName, this, namespaceURI);
  }

  querySelectorAll(selector) {
    const matches = this.documentElement.matches(selector) ? [this.documentElement] : [];
    return matches.concat(this.documentElement.querySelectorAll(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener() {}
  removeEventListener() {}
}

function installFakeBrowser() {
  const previous = new Map();
  const remember = name => previous.set(name, globalThis[name]);
  [
    'CSS', 'JXG', 'MutationObserver', 'ResizeObserver', 'cancelAnimationFrame',
    'document', 'requestAnimationFrame', 'window'
  ].forEach(remember);
  remember('setInterval');
  remember('clearInterval');

  const document = new FakeDocument();
  const animationFrames = [];
  const intervalCalls = [];
  const mutationObserverCalls = [];
  const mutationObservers = [];
  const resizeObserverCalls = [];
  const mediaListeners = [];
  const theme = {
    backgroundColor: 'rgb(255, 255, 255)',
    color: 'rgb(0, 0, 0)',
    accentColor: 'rgb(20, 40, 60)'
  };
  let nextAnimationFrame = 1;
  let nextInterval = 1;

  const requestAnimationFrame = callback => {
    animationFrames.push(callback);
    return nextAnimationFrame++;
  };
  const cancelAnimationFrame = () => {};
  const setInterval = (callback, delay) => {
    intervalCalls.push({ callback, delay });
    return nextInterval++;
  };
  const clearInterval = () => {};

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observations = [];
      this.disconnected = false;
      mutationObserverCalls.push(callback);
      mutationObservers.push(this);
    }
    observe(target, options) {
      this.observations.push({ target, options });
    }
    disconnect() {
      this.disconnected = true;
    }
  }

  class CountingResizeObserver {
    constructor(callback) {
      resizeObserverCalls.push(callback);
    }
    observe() {}
    disconnect() {}
  }

  const window = {
    document,
    parent: null,
    innerWidth: 900,
    innerHeight: 700,
    requestAnimationFrame,
    cancelAnimationFrame,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      return {
        addEventListener(type, listener) {
          if (type === 'change') mediaListeners.push(listener);
        },
        removeEventListener(type, listener) {
          if (type !== 'change') return;
          const index = mediaListeners.indexOf(listener);
          if (index >= 0) mediaListeners.splice(index, 1);
        },
        addListener(listener) { mediaListeners.push(listener); },
        removeListener(listener) {
          const index = mediaListeners.indexOf(listener);
          if (index >= 0) mediaListeners.splice(index, 1);
        }
      };
    },
    getComputedStyle(element) {
      const isAccent = String(element.className || '').split(/\s+/).includes('lia-btn');
      return {
        display: element.style.display || 'block',
        paddingLeft: '0px',
        paddingRight: '0px',
        borderLeftWidth: '0px',
        borderRightWidth: '0px',
        backgroundColor: isAccent ? theme.accentColor : theme.backgroundColor,
        borderTopColor: 'rgba(0, 0, 0, 0)',
        color: theme.color
      };
    }
  };

  Object.assign(globalThis, {
    CSS: { escape: value => String(value) },
    MutationObserver: FakeMutationObserver,
    ResizeObserver: CountingResizeObserver,
    cancelAnimationFrame,
    clearInterval,
    document,
    requestAnimationFrame,
    setInterval,
    window
  });

  return {
    document,
    intervalCalls,
    mutationObserverCalls,
    mutationObservers,
    resizeObserverCalls,
    window,
    setTheme(values) {
      Object.assign(theme, values);
    },
    triggerMutation(mutation) {
      mutationObservers.forEach(observer => {
        if (!observer.disconnected) observer.callback([mutation]);
      });
    },
    triggerMediaChange() {
      mediaListeners.slice().forEach(listener => listener({ matches: false }));
    },
    flushAnimationFrames(limit = 20) {
      let pass = 0;
      while (animationFrames.length && pass < limit) {
        const callbacks = animationFrames.splice(0);
        callbacks.forEach(callback => callback(Date.now()));
        pass += 1;
      }
      assert.equal(animationFrames.length, 0, 'animation-frame queue should settle');
    },
    restore() {
      previous.forEach((value, name) => {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      });
    }
  };
}

function appendHost(document) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

function appendSpecMarker(document, id, spec, language = 'de') {
  const marker = document.createElement('span');
  marker.id = id;
  marker.dataset.spec = spec;
  marker.dataset.language = language;
  document.body.appendChild(marker);
  return marker;
}

function geometryChildren(svg) {
  return svg.querySelectorAll('polygon, polyline, path');
}

function assertNonScalingStroke(element) {
  assert.equal(element.getAttribute('vector-effect'), 'non-scaling-stroke');
}

test('coordinate parser activates static mode only through static=1 or statisch=1', () => {
  assert.equal(parseCoordSpec('id=english;static=1').staticMode, true);
  assert.equal(parseCoordSpec('id=german;statisch=1').staticMode, true);
  assert.equal(parseCoordSpec('id=disabled;static=0;statisch=0').staticMode, false);

  const borderless = parseCoordSpec('id=legacy;border=0');
  assert.equal(borderless.border, false);
  assert.equal(borderless.staticMode, false);
});

test('static parsers accept direct coordinates and reject dependent point names', () => {
  const area = parseStaticAreaSpec(
    'plot;[[0;0];[2;3];[4;0]];#123456;0.4;sichtbar=0;linienstil=dashed',
    'de'
  );
  assert.deepEqual(area, {
    kind: 'area',
    boardId: 'plot',
    coordinates: [{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 4, y: 0 }],
    color: '#123456',
    hasExplicitColor: true,
    opacity: 0.4,
    visible: false,
    lineStyle: 'dashed',
    strokeWidth: 2,
    showArea: false,
    showPerimeter: false
  });
  assert.equal(parseStaticAreaSpec('plot;[A;B;C];#123456;0.4'), null);

  const distance = parseStaticDistanceSpec(
    'plot;[[0;0];[2;3];[4;0];[0;0]];#654321;;design=-;4px;linestyle=dashdotted;visible=0',
    'en'
  );
  assert.deepEqual(distance, {
    kind: 'distance',
    boardId: 'plot',
    coordinates: [
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 4, y: 0 },
      { x: 0, y: 0 }
    ],
    color: '#654321',
    hasExplicitColor: true,
    strokeWidth: 4,
    lineStyle: 'dashdotted',
    visible: false,
    normalizedDesign: '',
    firstArrow: false,
    lastArrow: false,
    startCap: false,
    endCap: false,
    showLength: false,
    segmentName: '',
    showName: false
  });
  assert.equal(parseStaticDistanceSpec('plot;[A;B];#654321'), null);
});

test('static geometry flips the mathematical y-axis and defines four SVG line styles', () => {
  const bounds = { xmin: -2, xmax: 8, ymin: -1, ymax: 4 };
  assert.deepEqual(projectStaticPoint({ x: -2, y: 4 }, bounds), { x: 0, y: 0 });
  assert.deepEqual(projectStaticPoint({ x: 3, y: 1 }, bounds), { x: 5, y: 3 });
  assert.deepEqual(projectStaticPoint({ x: 8, y: -1 }, bounds), { x: 10, y: 5 });

  const solid = staticDashArray('solid');
  const dashed = staticDashArray('dashed');
  const dotted = staticDashArray('dotted');
  const dashdotted = staticDashArray('dashdotted');
  assert.ok(solid == null || solid === '');
  [dashed, dotted, dashdotted].forEach(value => assert.equal(typeof value, 'string'));
  assert.ok(dashed.length > 0 && dotted.length > 0 && dashdotted.length > 0);
  assert.equal(new Set([dashed, dotted, dashdotted]).size, 3);
});

test('native SVG preserves source order, geometry, styles, and responsive aspect ratio', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-render-order';
  try {
    const host = appendHost(browser.document);
    appendSpecMarker(
      browser.document,
      'area-spec-first',
      `${boardId};[[0;0];[2;3];[4;0]];#123456;0.4;linestyle=dashed`
    );
    appendSpecMarker(
      browser.document,
      'distance-spec-second',
      `${boardId};[[-1;-1];[1;2];[3;0];[-1;-1]];#abcdef;;design=-;4px;linestyle=dotted`
    );
    appendSpecMarker(
      browser.document,
      'area-spec-third',
      `${boardId};[[5;1];[7;1];[6;3]];#fedcba;0.65;sichtbar=0;linestyle=dashdotted`
    );

    const cfg = parseCoordSpec(
      `xmin=-2;xmax=8;ymin=-1;ymax=4;width=220;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );
    const svg = renderStaticSvg(host, cfg);
    assert.equal(svg.namespaceURI, SVG_NAMESPACE);
    assert.equal(svg.getAttribute('viewBox'), '0 0 10 5');
    assert.equal(svg.getAttribute('width'), '220');
    assert.equal(svg.style.maxWidth, '100%');
    assert.equal(svg.style.height, 'auto');

    const geometry = geometryChildren(svg);
    assert.deepEqual(geometry.map(element => element.localName), ['polygon', 'polyline', 'polygon']);

    const [area, closedDistance, finalArea] = geometry;
    assert.equal(area.getAttribute('points'), '2,4 4,1 6,4');
    assert.equal(area.getAttribute('fill'), '#123456');
    assert.equal(area.getAttribute('fill-opacity'), '0.4');
    assert.equal(area.getAttribute('stroke'), '#123456');
    assert.equal(area.getAttribute('stroke-width'), '2');
    assert.equal(area.getAttribute('stroke-dasharray'), staticDashArray('dashed'));

    assert.equal(closedDistance.getAttribute('points'), '1,5 3,2 5,4 1,5');
    assert.equal(closedDistance.getAttribute('fill'), 'none');
    assert.equal(closedDistance.getAttribute('stroke'), '#abcdef');
    assert.equal(closedDistance.getAttribute('stroke-width'), '4');
    assert.equal(closedDistance.getAttribute('stroke-dasharray'), staticDashArray('dotted'));

    assert.equal(finalArea.getAttribute('fill'), '#fedcba');
    assert.equal(finalArea.getAttribute('fill-opacity'), '0.65');
    assert.equal(finalArea.getAttribute('stroke-dasharray'), staticDashArray('dashdotted'));
    assert.equal(finalArea.parentNode.getAttribute('visibility'), 'hidden');
    assert.equal(finalArea.parentNode.getAttribute('display'), 'none');
    geometry.forEach(assertNonScalingStroke);

    assert.equal(browser.resizeObserverCalls.length, 0, 'responsive SVG must not install ResizeObserver');
  } finally {
    browser.restore();
  }
});

test('default static colors rerender from one global observer and matchMedia without polling', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-theme-refresh';
  try {
    const accent = browser.document.createElement('button');
    accent.className = 'lia-btn';
    browser.document.body.appendChild(accent);
    const host = appendHost(browser.document);
    appendSpecMarker(
      browser.document,
      'area-spec-static-theme-refresh',
      `${boardId};[[0;0];[2;3];[4;0]]`
    );
    const cfg = parseCoordSpec(
      `xmin=0;xmax=4;ymin=0;ymax=4;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );
    browser.setTheme({ accentColor: 'rgb(20, 40, 60)' });
    initializeStaticCoordinateBoard(host, cfg);
    initStaticRenderer();
    browser.flushAnimationFrames();

    const strokeColor = () => host.querySelector('polygon').getAttribute('stroke');
    assert.equal(strokeColor(), 'rgb(20, 40, 60)');
    assert.equal(browser.mutationObserverCalls.length, 1, 'static theme and lifecycle share one observer');
    assert.equal(browser.intervalCalls.length, 0);
    const attributeFilters = browser.mutationObservers[0].observations
      .map(observation => observation.options && observation.options.attributeFilter)
      .filter(Boolean)
      .flat();
    ['class', 'style', 'data-theme'].forEach(attribute => {
      assert.ok(attributeFilters.includes(attribute), `observer must watch ${attribute}`);
    });

    browser.setTheme({ accentColor: 'rgb(40, 60, 80)' });
    browser.document.documentElement.className = 'theme-one';
    browser.triggerMutation({
      type: 'attributes',
      target: browser.document.documentElement,
      attributeName: 'class'
    });
    browser.flushAnimationFrames();
    assert.equal(strokeColor(), 'rgb(40, 60, 80)');

    browser.setTheme({ accentColor: 'rgb(60, 80, 100)' });
    browser.document.body.style.setProperty('color-scheme', 'dark');
    browser.triggerMutation({
      type: 'attributes',
      target: browser.document.body,
      attributeName: 'style'
    });
    browser.flushAnimationFrames();
    assert.equal(strokeColor(), 'rgb(60, 80, 100)');

    browser.setTheme({ accentColor: 'rgb(80, 100, 120)' });
    browser.document.body.setAttribute('data-theme', 'contrast');
    browser.triggerMutation({
      type: 'attributes',
      target: browser.document.body,
      attributeName: 'data-theme'
    });
    browser.flushAnimationFrames();
    assert.equal(strokeColor(), 'rgb(80, 100, 120)');

    browser.setTheme({ accentColor: 'rgb(100, 120, 140)' });
    browser.triggerMediaChange();
    browser.flushAnimationFrames();
    assert.equal(strokeColor(), 'rgb(100, 120, 140)');
    assert.equal(browser.mutationObserverCalls.length, 1);
    assert.equal(browser.intervalCalls.length, 0);
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('static board remount is idempotent and replacement/disposal leaves no duplicate SVG', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-remount';
  try {
    const firstHost = appendHost(browser.document);
    const secondHost = appendHost(browser.document);
    appendSpecMarker(
      browser.document,
      'area-spec-remount',
      `${boardId};[[0;0];[1;2];[2;0]];#336699;0.5`
    );
    const cfg = parseCoordSpec(
      `xmin=0;xmax=2;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );

    initializeStaticCoordinateBoard(firstHost, cfg);
    browser.flushAnimationFrames();
    initializeStaticCoordinateBoard(firstHost, cfg);
    browser.flushAnimationFrames();
    assert.equal(firstHost.querySelectorAll(`svg[data-lia-static-svg="${boardId}"]`).length, 1);
    assert.equal(geometryChildren(firstHost.querySelector('svg')).length, 1);
    assert.equal(isStaticCoordinateBoard(boardId), true);

    initializeStaticCoordinateBoard(secondHost, cfg);
    browser.flushAnimationFrames();
    assert.equal(firstHost.querySelectorAll('svg').length, 0, 'replacement host cleans up the old SVG');
    assert.equal(secondHost.querySelectorAll(`svg[data-lia-static-svg="${boardId}"]`).length, 1);

    disposeStaticCoordinateBoard(boardId, firstHost);
    assert.equal(secondHost.querySelectorAll('svg').length, 1, 'stale-host cleanup must not remove current board');
    disposeStaticCoordinateBoard(boardId, secondHost);
    assert.equal(secondHost.querySelectorAll('svg').length, 0);
    assert.equal(isStaticCoordinateBoard(boardId), false);
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('unsupported dependent geometry is claimed and warns only once across repeated bootstraps', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-unsupported';
  const warnings = [];
  const previousWarn = console.warn;
  console.warn = (...values) => warnings.push(values.map(String).join(' '));
  try {
    const host = appendHost(browser.document);
    const marker = appendSpecMarker(
      browser.document,
      'area-spec-unsupported',
      `${boardId};[A;B;C];#336699;0.5`
    );
    const cfg = parseCoordSpec(
      `xmin=0;xmax=4;ymin=0;ymax=4;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );

    initializeStaticCoordinateBoard(host, cfg);
    browser.flushAnimationFrames();
    initializeStaticCoordinateBoard(host, cfg);
    browser.flushAnimationFrames();

    assert.equal(marker.dataset.liaStaticClaimed, boardId);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /static/i);
    assert.match(warnings[0], /area-spec-unsupported|unsupported|nicht\s+unterst/i);
    assert.equal(geometryChildren(host.querySelector('svg')).length, 0);
    assert.equal(browser.intervalCalls.length, 0);
  } finally {
    console.warn = previousWarn;
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('a named table on a static board is claimed, warned once, and never starts the dynamic runtime', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-table-board';
  const warnings = [];
  let dynamicRuntimeCalls = 0;
  const previousWarn = console.warn;
  console.warn = (...values) => warnings.push(values.map(String).join(' '));
  browser.window.__ensureCoordinateDynamicRuntime = () => { dynamicRuntimeCalls += 1; };
  try {
    const host = appendHost(browser.document);
    const table = appendSpecMarker(
      browser.document,
      'lia-table-static-table',
      `n=3;x;f;P;id=${boardId}`
    );
    const cfg = parseCoordSpec(
      `xmin=0;xmax=4;ymin=0;ymax=4;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );

    initializeStaticCoordinateBoard(host, cfg);
    browser.flushAnimationFrames();
    initializeStaticCoordinateBoard(host, cfg);
    browser.flushAnimationFrames();

    assert.equal(table.dataset.liaStaticClaimed, boardId);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /static/i);
    assert.match(warnings[0], /lia-table-static-table|table/i);
    assert.equal(dynamicRuntimeCalls, 0);
    assert.equal(browser.intervalCalls.length, 0);
  } finally {
    console.warn = previousWarn;
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('comma-separated AxisLabel and Table specs are claimed before dynamic bootstraps', () => {
  const browser = installFakeBrowser();
  const boardId = 'S';
  const warnings = [];
  let dynamicRuntimeCalls = 0;
  const previousWarn = console.warn;
  console.warn = (...values) => warnings.push(values.map(String).join(' '));
  browser.window.__ensureCoordinateDynamicRuntime = () => { dynamicRuntimeCalls += 1; };
  try {
    const host = appendHost(browser.document);
    const axis = appendSpecMarker(
      browser.document,
      'axis-title-spec-comma-axis',
      'id=S,xlabel=x,ylabel=y'
    );
    const table = appendSpecMarker(
      browser.document,
      'lia-table-comma-table',
      'n=3,x,f,P,id=S'
    );
    const cfg = parseCoordSpec(
      `xmin=0;xmax=4;ymin=0;ymax=4;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );

    initializeStaticCoordinateBoard(host, cfg);
    browser.flushAnimationFrames();
    bootstrapStaticCoordinateBoards();
    bootstrapStaticCoordinateBoards();

    assert.equal(axis.dataset.liaStaticClaimed, boardId);
    assert.equal(table.dataset.liaStaticClaimed, boardId);
    assert.equal(warnings.length, 2, 'each unsupported marker warns exactly once');
    assert.ok(warnings.some(message => /axis-title-spec-comma-axis/.test(message)));
    assert.ok(warnings.some(message => /lia-table-comma-table/.test(message)));
    assert.equal(dynamicRuntimeCalls, 0);
    assert.equal(browser.intervalCalls.length, 0);
  } finally {
    console.warn = previousWarn;
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('static initialization creates no JSXGraph state, per-object resize observer, or retry interval', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-no-jxg';
  let initBoardCalls = 0;
  try {
    const host = appendHost(browser.document);
    appendSpecMarker(
      browser.document,
      'distance-spec-no-jxg',
      `${boardId};[[0;0];[2;2]];#cc0000;;design=-;3px`
    );
    browser.window.__boards = { existing: { sentinel: true } };
    globalThis.JXG = {
      Options: new Proxy({}, {
        get() { throw new Error('static mode accessed JXG.Options'); }
      }),
      JSXGraph: {
        initBoard() {
          initBoardCalls += 1;
          throw new Error('static mode initialized JSXGraph');
        }
      }
    };

    const handle = initializeCoordinateBoard(
      host,
      `xmin=0;xmax=4;ymin=0;ymax=2;width=200;id=${boardId};border=0;static=1`
    );
    initStaticRenderer();
    initStaticRenderer();
    browser.flushAnimationFrames();

    assert.equal(handle.id, boardId);
    assert.equal(initBoardCalls, 0);
    assert.equal(browser.window.__boards[boardId], undefined);
    assert.deepEqual(browser.window.__boards.existing, { sentinel: true });
    assert.equal(host.querySelectorAll('svg').length, 1);
    assert.equal(browser.intervalCalls.length, 0, 'static boards must not start 300-ms retry intervals');
    assert.equal(browser.resizeObserverCalls.length, 0);
    assert.equal(browser.mutationObserverCalls.length, 1, 'all static objects share one lifecycle observer');
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('same-container static A to dynamic B removes the stale static registry and SVG', () => {
  const browser = installFakeBrowser();
  const staticId = 'transition-static-a';
  const dynamicId = 'transition-dynamic-b';
  try {
    const host = appendHost(browser.document);
    appendSpecMarker(
      browser.document,
      'area-spec-transition-static-a',
      `${staticId};[[0;0];[1;2];[2;0]];#336699;0.4`
    );
    initializeCoordinateBoard(
      host,
      `xmin=0;xmax=2;ymin=0;ymax=2;width=220;id=${staticId};achsen=0;grid=0;border=0;static=1`
    );
    browser.flushAnimationFrames();
    assert.equal(isStaticCoordinateBoard(staticId), true);
    assert.equal(host.querySelectorAll('svg[data-lia-static-svg]').length, 1);

    const dynamicBoard = {
      containerObj: host,
      getBoundingBox() { return [0, 2, 2, 0]; },
      resizeContainer() {},
      setBoundingBox() {},
      update() {},
      on() {}
    };
    const jxg = {
      Options: { text: {} },
      JSXGraph: {
        initBoard(container) {
          const canvas = browser.document.createElement('canvas');
          canvas.dataset.dynamicBoard = dynamicId;
          container.replaceChildren(canvas);
          return dynamicBoard;
        },
        freeBoard() {}
      }
    };
    globalThis.JXG = jxg;
    browser.window.JXG = jxg;
    browser.window.__ensureCoordinateDynamicRuntime = () => {};

    const result = initializeCoordinateBoard(
      host,
      `xmin=0;xmax=2;ymin=0;ymax=2;width=220;id=${dynamicId};achsen=0;grid=0;border=0`
    );

    assert.equal(result, dynamicBoard);
    assert.equal(isStaticCoordinateBoard(staticId), false);
    assert.equal(host.hasAttribute('data-lia-static-coordinate'), false);
    assert.equal(host.querySelectorAll('svg[data-lia-static-svg]').length, 0);
    assert.equal(host.querySelectorAll('canvas[data-dynamic-board]').length, 1);
    assert.equal(browser.window.__boards[staticId], undefined);
    assert.equal(browser.window.__boards[dynamicId], dynamicBoard);
  } finally {
    disposeStaticCoordinateBoard(staticId);
    disposeStaticCoordinateBoard(dynamicId);
    browser.restore();
  }
});

test('same-container dynamic A to static B frees the old JSXGraph board and dynamic DOM', () => {
  const browser = installFakeBrowser();
  const dynamicId = 'transition-dynamic-a';
  const staticId = 'transition-static-b';
  let freeBoardCalls = 0;
  try {
    const host = appendHost(browser.document);
    const dynamicBoard = {
      containerObj: host,
      getBoundingBox() { return [0, 2, 2, 0]; },
      resizeContainer() {},
      setBoundingBox() {},
      update() {},
      on() {}
    };
    const jxg = {
      Options: { text: {} },
      JSXGraph: {
        initBoard(container) {
          const canvas = browser.document.createElement('canvas');
          canvas.dataset.dynamicBoard = dynamicId;
          container.replaceChildren(canvas);
          return dynamicBoard;
        },
        freeBoard(board) {
          assert.equal(board, dynamicBoard);
          freeBoardCalls += 1;
        }
      }
    };
    globalThis.JXG = jxg;
    browser.window.JXG = jxg;
    browser.window.__ensureCoordinateDynamicRuntime = () => {};
    initializeCoordinateBoard(
      host,
      `xmin=0;xmax=2;ymin=0;ymax=2;width=220;id=${dynamicId};achsen=0;grid=0;border=0`
    );
    assert.equal(browser.window.__boards[dynamicId], dynamicBoard);
    assert.equal(host.querySelectorAll('canvas[data-dynamic-board]').length, 1);

    appendSpecMarker(
      browser.document,
      'distance-spec-transition-static-b',
      `${staticId};[[0;0];[2;2]];#336699;design=-;3px`
    );
    initializeCoordinateBoard(
      host,
      `xmin=0;xmax=2;ymin=0;ymax=2;width=220;id=${staticId};achsen=0;grid=0;border=0;static=1`
    );
    browser.flushAnimationFrames();

    assert.equal(freeBoardCalls, 1);
    assert.equal(browser.window.__boards[dynamicId], undefined);
    assert.equal(isStaticCoordinateBoard(staticId), true);
    assert.equal(host.querySelectorAll('canvas[data-dynamic-board]').length, 0);
    assert.equal(host.querySelectorAll(`svg[data-lia-static-svg=${staticId}]`).length, 1);
  } finally {
    disposeStaticCoordinateBoard(staticId);
    browser.restore();
  }
});

test('durable declarative host survives static=1 to 0 to 1 with clean claims and runtime handoff', () => {
  const browser = installFakeBrowser();
  const boardId = 'declarative-mode-switch';
  let dynamicRuntimeCalls = 0;
  try {
    const host = appendHost(browser.document);
    host.id = 'declarative-mode-switch-host';
    host.dataset.liaStaticCoordinateHost = '';
    host.dataset.spec =
      `xmin=0;xmax=4;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`;
    const marker = appendSpecMarker(
      browser.document,
      'area-spec-declarative-mode-switch',
      `${boardId};[[0;0];[2;2];[4;0]];#336699;0.4`
    );
    browser.window.__ensureCoordinateDynamicRuntime = () => { dynamicRuntimeCalls += 1; };

    bootstrapStaticCoordinateBoards();
    assert.equal(isStaticCoordinateBoard(boardId), true);
    assert.equal(marker.dataset.liaStaticClaimed, boardId);
    assert.equal(host.querySelectorAll(`svg[data-lia-static-svg=${boardId}]`).length, 1);
    assert.equal(host.hasAttribute('data-lia-static-coordinate-host'), true);
    assert.equal(dynamicRuntimeCalls, 0);

    host.dataset.spec =
      `xmin=0;xmax=4;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=0`;
    bootstrapStaticCoordinateBoards();

    assert.equal(isStaticCoordinateBoard(boardId), false);
    assert.equal(host.querySelectorAll('svg[data-lia-static-svg]').length, 0);
    assert.equal(host.hasAttribute('data-lia-static-coordinate'), false);
    assert.equal(host.hasAttribute('data-lia-static-coordinate-host'), true);
    assert.equal(marker.hasAttribute('data-lia-static-claimed'), false);
    assert.equal(dynamicRuntimeCalls, 1);

    host.dataset.spec =
      `xmin=0;xmax=4;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`;
    bootstrapStaticCoordinateBoards();
    assert.equal(isStaticCoordinateBoard(boardId), true);
    assert.equal(marker.dataset.liaStaticClaimed, boardId);
    assert.equal(host.querySelectorAll(`svg[data-lia-static-svg=${boardId}]`).length, 1);
    assert.equal(dynamicRuntimeCalls, 1);
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('legacy declarative static marker is upgraded to the durable host attribute', () => {
  const browser = installFakeBrowser();
  const boardId = 'legacy-declarative-host';
  try {
    const host = appendHost(browser.document);
    host.id = 'legacy-declarative-host-element';
    host.dataset.liaStaticCoordinate = '';
    host.dataset.spec =
      `xmin=0;xmax=3;ymin=0;ymax=2;width=210;id=${boardId};achsen=0;grid=0;border=0;static=1`;
    const marker = appendSpecMarker(
      browser.document,
      'distance-spec-legacy-declarative-host',
      `${boardId};[[0;0];[3;2]];#336699;design=-;3px`
    );

    bootstrapStaticCoordinateBoards();

    assert.equal(host.hasAttribute('data-lia-static-coordinate-host'), true);
    assert.equal(host.dataset.liaStaticCoordinate, boardId);
    assert.equal(isStaticCoordinateBoard(boardId), true);
    assert.equal(marker.dataset.liaStaticClaimed, boardId);
    assert.equal(host.querySelectorAll(`svg[data-lia-static-svg=${boardId}]`).length, 1);
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('border=0 without static=1 retains the existing JSXGraph path', () => {
  const browser = installFakeBrowser();
  const boardId = 'dynamic-borderless';
  const initBoardCalls = [];
  try {
    const host = appendHost(browser.document);
    const board = {
      containerObj: host,
      getBoundingBox() { return [-2, 2, 2, -2]; },
      resizeContainer() {},
      setBoundingBox() {},
      update() {},
      on() {}
    };
    globalThis.JXG = {
      Options: { text: {} },
      JSXGraph: {
        initBoard(container, options) {
          initBoardCalls.push({ container, options });
          return board;
        }
      }
    };

    const result = initializeCoordinateBoard(
      host,
      `xmin=-2;xmax=2;ymin=-2;ymax=2;width=200;id=${boardId};achsen=0;grid=0;border=0`
    );

    assert.equal(result, board);
    assert.equal(initBoardCalls.length, 1);
    assert.equal(initBoardCalls[0].container, host);
    assert.equal(initBoardCalls[0].options.zoom.enabled, false);
    assert.equal(initBoardCalls[0].options.pan.enabled, false);
    assert.equal(browser.window.__boards[boardId], board);
    assert.equal(host.querySelectorAll('svg[data-lia-static-svg]').length, 0);
  } finally {
    browser.restore();
  }
});
