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
  parseStaticArcSpec,
  parseStaticAreaSpec,
  parseStaticCoordTextSpec,
  parseStaticDistanceSpec,
  parseStaticVectorSpec,
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

  contains(candidate) {
    for (let current = candidate; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
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
  const documentQueries = [];
  const querySelectorAll = document.querySelectorAll.bind(document);
  document.querySelectorAll = selector => {
    documentQueries.push(String(selector));
    return querySelectorAll(selector);
  };
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
    documentQueries,
    window,
    pendingAnimationFrames() {
      return animationFrames.length;
    },
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

function appendTestVectorBoard(browser, boardId, color = '#123456') {
  const host = appendHost(browser.document);
  const marker = appendSpecMarker(
    browser.document,
    'linear-spec-' + boardId,
    `${boardId};[[0;0];[2;1]];${color};u=0`
  );
  marker.dataset.kind = 'vector';
  const config = parseCoordSpec(
    `xmin=0;xmax=4;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
  );
  initializeStaticCoordinateBoard(host, config);
  return { host, marker, config, svg: () => host.querySelector('svg[data-lia-static-svg]') };
}

function geometryChildren(svg) {
  return svg.querySelectorAll('polygon, polyline, path');
}

function assertNonScalingStroke(element) {
  assert.equal(element.getAttribute('vector-effect'), 'non-scaling-stroke');
}

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(Number(actual) - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test('Superposition arrowheads stay small in a narrow SVG viewBox', () => {
  const browser = installFakeBrowser();
  try {
    const host = appendHost(browser.document);
    const vector = appendSpecMarker(
      browser.document,
      'linear-spec-superposition-safari',
      'P10Superposition;[[0;0];[3;4]];#ff0000;c=0'
    );
    vector.dataset.kind = 'vector';
    const config = parseCoordSpec(
      'xmin=-0.6;xmax=6.6;ymin=-0.6;ymax=6.6;width=500;id=P10Superposition;achsen=1;grid=1;border=0;static=1'
    );
    const svg = renderStaticSvg(host, config);
    const markers = svg.querySelectorAll('marker');
    assert.equal(markers.length, 3, 'two axes and one vector have arrowheads');
    markers.forEach((marker, index) => {
      assert.equal(marker.getAttribute('markerUnits'), 'userSpaceOnUse');
      const size = Number(marker.getAttribute('markerWidth'));
      assertClose(size, (index < 2 ? 10 : 12) * 7.2 / 500);
      assertClose(Number(marker.getAttribute('markerHeight')), size);
      assert.ok(size < 1, 'an arrowhead must remain much smaller than the 7.2-unit board');
    });
  } finally {
    browser.restore();
  }
});

test('coordinate parser activates static mode only through static=1 or statisch=1', () => {
  assert.equal(parseCoordSpec('id=english;static=1').staticMode, true);
  assert.equal(parseCoordSpec('id=german;statisch=1').staticMode, true);
  assert.equal(parseCoordSpec('id=disabled;static=0;statisch=0').staticMode, false);

  const borderless = parseCoordSpec('id=legacy;border=0');
  assert.equal(borderless.border, false);
  assert.equal(borderless.staticMode, false);
});

test('legacy parser exports stay direct-only when no point resolver is supplied', () => {
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
    showPerimeter: false,
    language: 'de'
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
    showName: false,
    language: 'en'
  });
  assert.equal(parseStaticDistanceSpec('plot;[A;B];#654321'), null);
});

test('number-line parsers accept only fixed vectors, arcs, and coordinate texts', () => {
  const vector = parseStaticVectorSpec(
    'plot;[[0;0];[76;0]];#102030;u=0;linestyle=dashed;visible=0',
    'en'
  );
  assert.deepEqual(vector, {
    kind: 'vector',
    boardId: 'plot',
    coordinates: [{ x: 0, y: 0 }, { x: 76, y: 0 }],
    color: '#102030',
    hasExplicitColor: true,
    strokeWidth: 3,
    lineStyle: 'dashed',
    visible: false,
    objectName: 'u',
    showName: false
  });
  assert.equal(
    parseStaticVectorSpec('plot;[[0;0];[1;1];[2;2]];#102030;u=0', 'de'),
    null,
    'a static vector requires exactly two coordinates'
  );
  assert.equal(parseStaticVectorSpec('plot;[A;B];#102030;u=0', 'de'), null);
  assert.equal(
    parseStaticVectorSpec('plot;[[0;0];[1;1]];#102030;name=0', 'de').showName,
    false
  );

  const arc = parseStaticArcSpec(
    'plot;[18;2];35;[54;2];145;;->;5px;#ff0000;linestyle=dashdotted;visible=0',
    'de'
  );
  assert.deepEqual(arc, {
    kind: 'arc',
    boardId: 'plot',
    start: { x: 18, y: 2 },
    exitAngle: 35,
    end: { x: 54, y: 2 },
    entryAngle: 145,
    caption: '',
    renderedCaption: '',
    strokeWidth: 5,
    color: '#ff0000',
    hasExplicitColor: true,
    lineStyle: 'dashdotted',
    visible: false,
    normalizedDesign: '->',
    firstArrow: false,
    lastArrow: true,
    startCap: false,
    endCap: false
  });
  assert.equal(parseStaticArcSpec('plot;A;35;B;145;;->;3px;#000000', 'de'), null);
  assert.deepEqual(
    ['-', '<-', '<->', '|->|'].map(design => {
      const parsed = parseStaticArcSpec(
        `plot;[0;0];45;[3;0];135;$x$;${design};3px;#000000`,
        'en'
      );
      return {
        caption: parsed.renderedCaption,
        design: parsed.normalizedDesign,
        firstArrow: parsed.firstArrow,
        lastArrow: parsed.lastArrow,
        startCap: parsed.startCap,
        endCap: parsed.endCap
      };
    }),
    [
      { caption: 'x', design: '', firstArrow: false, lastArrow: false, startCap: false, endCap: false },
      { caption: 'x', design: '<-', firstArrow: true, lastArrow: false, startCap: false, endCap: false },
      { caption: 'x', design: '<->', firstArrow: true, lastArrow: true, startCap: false, endCap: false },
      { caption: 'x', design: '|->|', firstArrow: false, lastArrow: true, startCap: true, endCap: true }
    ]
  );

  const coordText = parseStaticCoordTextSpec('plot;[9;-5.1];$1250$;#123456;0.35');
  assert.deepEqual(coordText, {
    kind: 'coord-text',
    boardId: 'plot',
    coordinate: { x: 9, y: -5.1 },
    x: 9,
    y: -5.1,
    content: '$1250$',
    renderedContent: '1250',
    color: '#123456',
    hasExplicitColor: true,
    opacity: 0.35
  });
  assert.equal(parseStaticCoordTextSpec('plot;A;$x$;#123456;1'), null);
  assert.deepEqual(
    ['$0$', '$60$', '$1250$', '$x$'].map(content =>
      parseStaticCoordTextSpec(`plot;[0;0];${content};#000000;1`).renderedContent
    ),
    ['0', '60', '1250', 'x']
  );
  assert.equal(
    parseStaticCoordTextSpec('plot;[0;0];plain label;#000000;1').renderedContent,
    'plain label'
  );
  const defaultColorText = parseStaticCoordTextSpec('plot;[0;0];plain label;;0.4');
  assert.equal(defaultColorText.hasExplicitColor, false);
  assert.notEqual(defaultColorText.color, '0.4');
  assert.equal(defaultColorText.opacity, 0.4);
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

test('native SVG renders a complete number line in mixed source order', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-numberline';
  try {
    const host = appendHost(browser.document);
    appendSpecMarker(
      browser.document,
      'area-spec-numberline-background',
      `${boardId};[[-3;-8];[80;-8];[80;12];[-3;12]];#ffffff;1`
    );
    const vectorMarker = appendSpecMarker(
      browser.document,
      'linear-spec-numberline-axis',
      `${boardId};[[0;0];[76;0]];#000000;u=0;linestyle=dotted`
    );
    vectorMarker.dataset.kind = 'vector';
    appendSpecMarker(
      browser.document,
      'distance-spec-numberline-tick',
      `${boardId};[[0;-0.8];[0;0.8]];#112233;;-;3px;linestyle=dashed`
    );
    appendSpecMarker(
      browser.document,
      'arc-spec-numberline-jump',
      `${boardId};[18;2];35;[54;2];145;;->;3px;#000000;linestyle=dashdotted`
    );
    appendSpecMarker(
      browser.document,
      'arc-spec-numberline-vertical',
      `${boardId};[36;-0.8];90;[36;0.8];270;;-;5px;#ff0000`
    );
    [
      [0, '$0$', '#000000', 1],
      [9, '$60$', '#660000', 0.4],
      [18, '$1250$', '#006600', 0.75],
      [27, '$x$', '#000066', 1],
      [36, 'plain label', '#333333', 0.6]
    ].forEach(([x, content, color, opacity], index) => {
      const marker = appendSpecMarker(
        browser.document,
        `coord-text-spec-numberline-${index}`,
        `${boardId};[${x};-5.1];${content};${color};${opacity}`
      );
      marker.className = 'lia-coord-text-spec';
    });

    const cfg = parseCoordSpec(
      `xmin=-3;xmax=80;ymin=-8;ymax=12;width=720;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );
    const svg = renderStaticSvg(host, cfg);
    const groups = svg.querySelectorAll('g[data-lia-static-kind]');
    assert.deepEqual(
      groups.map(group => group.getAttribute('data-lia-static-kind')),
      [
        'area', 'vector', 'distance', 'arc', 'arc',
        'coord-text', 'coord-text', 'coord-text', 'coord-text', 'coord-text'
      ]
    );

    const vectorGroup = groups[1];
    const vectorLine = vectorGroup.querySelector('line, polyline');
    assert.ok(vectorLine, 'vector line is present');
    if (vectorLine.localName === 'line') {
      assert.equal(vectorLine.getAttribute('x1'), '3');
      assert.equal(vectorLine.getAttribute('y1'), '12');
      assert.equal(vectorLine.getAttribute('x2'), '79');
      assert.equal(vectorLine.getAttribute('y2'), '12');
    } else {
      assert.equal(vectorLine.getAttribute('points'), '3,12 79,12');
    }
    assert.equal(vectorLine.getAttribute('stroke'), '#000000');
    assert.equal(vectorLine.getAttribute('stroke-width'), '3');
    assert.equal(vectorLine.getAttribute('stroke-dasharray'), staticDashArray('dotted'));
    assertNonScalingStroke(vectorLine);
    const vectorMarkerEnd = vectorLine.getAttribute('marker-end');
    assert.match(vectorMarkerEnd, /^url\(#lia-static-arrow-/);
    const vectorArrowId = vectorMarkerEnd.match(/^url\(#(.+)\)$/)[1];
    const vectorArrow = svg.querySelector(`#${vectorArrowId}`);
    assert.ok(vectorArrow, 'vector arrow marker is defined in the SVG');
    assert.equal(vectorArrow.getAttribute('orient'), 'auto-start-reverse');
    assert.equal(vectorArrow.getAttribute('markerUnits'), 'userSpaceOnUse');
    assert.equal(vectorGroup.querySelectorAll('text').length, 0, 'u=0 suppresses the vector name');

    const tick = groups[2].querySelector('polyline, line');
    if (tick.localName === 'line') {
      assert.equal(tick.getAttribute('x1'), '3');
      assert.equal(tick.getAttribute('y1'), '12.8');
      assert.equal(tick.getAttribute('x2'), '3');
      assert.equal(tick.getAttribute('y2'), '11.2');
    } else {
      assert.equal(tick.getAttribute('points'), '3,12.8 3,11.2');
    }
    assert.equal(tick.getAttribute('stroke'), '#112233');
    assert.equal(tick.getAttribute('stroke-width'), '3');
    assert.equal(tick.getAttribute('stroke-dasharray'), staticDashArray('dashed'));

    const jumpArc = groups[3].querySelector('path');
    const jumpNumbers = (jumpArc.getAttribute('d').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [])
      .map(Number);
    assert.equal(jumpNumbers.length, 8, 'arc path contains four cubic Bezier points');
    const handle = 12;
    const exitRadians = 35 * Math.PI / 180;
    const entryRadians = 145 * Math.PI / 180;
    [
      21,
      10,
      21 + handle * Math.cos(exitRadians),
      10 - handle * Math.sin(exitRadians),
      57 + handle * Math.cos(entryRadians),
      10 - handle * Math.sin(entryRadians),
      57,
      10
    ].forEach((expected, index) => assertClose(jumpNumbers[index], expected));
    assert.equal(jumpArc.getAttribute('fill'), 'none');
    assert.equal(jumpArc.getAttribute('stroke'), '#000000');
    assert.equal(jumpArc.getAttribute('stroke-width'), '3');
    assert.equal(jumpArc.getAttribute('stroke-dasharray'), staticDashArray('dashdotted'));
    assert.match(jumpArc.getAttribute('marker-end'), /^url\(#lia-static-arrow-/);
    assertNonScalingStroke(jumpArc);
    assert.equal(groups[3].querySelectorAll('text').length, 0, 'an empty arc caption creates no text');

    const verticalArc = groups[4].querySelector('path');
    const verticalNumbers = (verticalArc.getAttribute('d').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [])
      .map(Number);
    assert.equal(verticalNumbers.length, 8);
    [39, 39, 39, 39].forEach((expected, index) =>
      assertClose(verticalNumbers[index * 2], expected)
    );
    assert.equal(new Set(verticalNumbers.filter((_value, index) => index % 2 === 1)).size, 4);
    assert.equal(verticalArc.getAttribute('stroke'), '#ff0000');
    assert.equal(verticalArc.getAttribute('stroke-width'), '5');
    assert.equal(verticalArc.hasAttribute('marker-end'), false, 'plain - design has no arrow');
    assert.equal(verticalArc.hasAttribute('stroke-dasharray'), false, 'solid arc has no dash array');
    assertNonScalingStroke(verticalArc);

    const texts = groups.slice(5).map(group => group.querySelector('text'));
    assert.deepEqual(texts.map(text => text.textContent), ['0', '60', '1250', 'x', 'plain label']);
    assert.deepEqual(texts.map(text => text.getAttribute('x')), ['3', '12', '21', '30', '39']);
    texts.forEach(text => {
      assert.equal(text.getAttribute('y'), '17.1');
      assert.equal(text.getAttribute('text-anchor'), 'middle');
      assert.match(text.getAttribute('dominant-baseline'), /^(?:middle|central)$/);
      assert.equal(text.children.length, 0, 'fallback text is inserted as textContent, not innerHTML');
      assert.equal(text.hasAttribute('opacity'), false, 'text opacity is not multiplied twice');
    });
    assert.deepEqual(texts.map(text => text.getAttribute('fill')), [
      '#000000', '#660000', '#006600', '#000066', '#333333'
    ]);
    assert.deepEqual(
      texts.map(text => text.getAttribute('fill-opacity')),
      ['1', '0.4', '0.75', '1', '0.6']
    );
  } finally {
    browser.restore();
  }
});

test('arc arrows, end caps, and caption fallbacks render natively', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-arc-designs';
  try {
    const host = appendHost(browser.document);
    [
      ['plain', '[0;0]', '[2;0]', 'plain caption', '-', '#111111'],
      ['left', '[2;0]', '[4;0]', '$x$', '<-', '#222222'],
      ['both', '[4;0]', '[6;0]', '', '<->', '#333333'],
      ['capped', '[6;0]', '[8;0]', '$$1250$$', '|->|', '#444444']
    ].forEach(([uid, start, end, caption, design, color]) => {
      appendSpecMarker(
        browser.document,
        `arc-spec-design-${uid}`,
        `${boardId};${start};45;${end};135;${caption};${design};3px;${color}`
      );
    });
    const cfg = parseCoordSpec(
      `xmin=0;xmax=8;ymin=-2;ymax=3;width=400;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );
    const svg = renderStaticSvg(host, cfg);
    const groups = svg.querySelectorAll('g[data-lia-static-kind=arc]');
    assert.equal(groups.length, 4);
    const paths = groups.map(group => group.querySelector('path'));

    assert.equal(paths[0].hasAttribute('marker-start'), false);
    assert.equal(paths[0].hasAttribute('marker-end'), false);
    assert.match(paths[1].getAttribute('marker-start'), /^url\(#lia-static-arrow-/);
    assert.equal(paths[1].hasAttribute('marker-end'), false);
    assert.match(paths[2].getAttribute('marker-start'), /^url\(#lia-static-arrow-/);
    assert.match(paths[2].getAttribute('marker-end'), /^url\(#lia-static-arrow-/);
    assert.equal(paths[2].getAttribute('marker-start'), paths[2].getAttribute('marker-end'));
    assert.equal(paths[3].hasAttribute('marker-start'), false);
    assert.match(paths[3].getAttribute('marker-end'), /^url\(#lia-static-arrow-/);

    const arrowMarkers = svg.querySelectorAll('marker');
    assert.equal(arrowMarkers.length, 3);
    arrowMarkers.forEach(marker => {
      assert.equal(marker.getAttribute('markerUnits'), 'userSpaceOnUse');
      assert.equal(marker.getAttribute('orient'), 'auto-start-reverse');
    });

    assert.deepEqual(groups.map(group => group.querySelectorAll('line').length), [0, 0, 0, 2]);
    groups[3].querySelectorAll('line').forEach(cap => {
      assert.equal(cap.getAttribute('stroke'), '#444444');
      assert.equal(cap.getAttribute('stroke-width'), '3');
      assertNonScalingStroke(cap);
    });
    paths.forEach(assertNonScalingStroke);

    const captions = groups.map(group => group.querySelector('text'));
    assert.equal(captions[0].textContent, 'plain caption');
    assert.equal(captions[0].getAttribute('fill'), '#111111');
    assert.equal(captions[1].textContent, 'x');
    assert.equal(captions[1].getAttribute('fill'), '#222222');
    assert.equal(captions[2], null, 'empty caption produces no SVG text');
    assert.equal(captions[3].textContent, '1250');
    assert.equal(captions[3].getAttribute('fill'), '#444444');
    [captions[0], captions[1], captions[3]].forEach(caption => {
      assert.equal(caption.getAttribute('text-anchor'), 'middle');
      assert.equal(caption.getAttribute('dominant-baseline'), 'middle');
      assert.equal(caption.children.length, 0, 'arc captions use safe textContent');
    });
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
    const area = appendSpecMarker(
      browser.document,
      'area-spec-remount',
      `${boardId};[[0;0];[1;2];[2;0]];#336699;0.5`
    );
    const markers = [area];
    const vector = appendSpecMarker(
      browser.document,
      'linear-spec-remount-vector',
      `${boardId};[[0;0];[2;0]];#000000;u=0`
    );
    vector.dataset.kind = 'vector';
    markers.push(vector);
    markers.push(appendSpecMarker(
      browser.document,
      'arc-spec-remount-arc',
      `${boardId};[0;0];45;[2;0];135;;->;3px;#000000`
    ));
    const coordText = appendSpecMarker(
      browser.document,
      'coord-text-spec-remount-text',
      `${boardId};[1;1];$x$;#000000;1`
    );
    coordText.className = 'lia-coord-text-spec';
    markers.push(coordText);
    const cfg = parseCoordSpec(
      `xmin=0;xmax=2;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );

    initializeStaticCoordinateBoard(firstHost, cfg);
    browser.flushAnimationFrames();
    initializeStaticCoordinateBoard(firstHost, cfg);
    browser.flushAnimationFrames();
    assert.equal(firstHost.querySelectorAll(`svg[data-lia-static-svg="${boardId}"]`).length, 1);
    bootstrapStaticCoordinateBoards();
    bootstrapStaticCoordinateBoards();
    assert.equal(firstHost.querySelectorAll('g[data-lia-static-kind]').length, 4);
    markers.forEach(marker => assert.equal(marker.dataset.liaStaticClaimed, boardId));
    assert.equal(isStaticCoordinateBoard(boardId), true);

    initializeStaticCoordinateBoard(secondHost, cfg);
    browser.flushAnimationFrames();
    assert.equal(firstHost.querySelectorAll('svg').length, 0, 'replacement host cleans up the old SVG');
    assert.equal(secondHost.querySelectorAll(`svg[data-lia-static-svg="${boardId}"]`).length, 1);

    assert.equal(secondHost.querySelectorAll('g[data-lia-static-kind]').length, 4);
    disposeStaticCoordinateBoard(boardId, firstHost);
    assert.equal(secondHost.querySelectorAll('svg').length, 1, 'stale-host cleanup must not remove current board');
    disposeStaticCoordinateBoard(boardId, secondHost);
    assert.equal(secondHost.querySelectorAll('svg').length, 0);
    assert.equal(isStaticCoordinateBoard(boardId), false);
    markers.forEach(marker => assert.equal(marker.hasAttribute('data-lia-static-claimed'), false));
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

test('supported number-line markers stay warning-free while one dependent variant warns once', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-numberline-warnings';
  const warnings = [];
  const previousWarn = console.warn;
  console.warn = (...values) => warnings.push(values.map(String).join(' '));
  try {
    const host = appendHost(browser.document);
    const vector = appendSpecMarker(
      browser.document,
      'linear-spec-supported-vector',
      `${boardId};[[0;0];[4;0]];#000000;u=0`
    );
    vector.dataset.kind = 'vector';
    const arc = appendSpecMarker(
      browser.document,
      'arc-spec-supported-arc',
      `${boardId};[0;0];45;[4;0];135;;->;3px;#000000`
    );
    const coordText = appendSpecMarker(
      browser.document,
      'coord-text-spec-supported-text',
      `${boardId};[2;-1];$x$;#000000;1`
    );
    coordText.className = 'lia-coord-text-spec';
    const dependentVector = appendSpecMarker(
      browser.document,
      'linear-spec-dependent-vector',
      `${boardId};[A;B];#cc0000;u=0`
    );
    dependentVector.dataset.kind = 'vector';
    const cfg = parseCoordSpec(
      `xmin=0;xmax=4;ymin=-2;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=1`
    );

    initializeStaticCoordinateBoard(host, cfg);
    browser.flushAnimationFrames();
    bootstrapStaticCoordinateBoards();
    bootstrapStaticCoordinateBoards();

    [vector, arc, coordText, dependentVector].forEach(marker => {
      assert.equal(marker.dataset.liaStaticClaimed, boardId);
    });
    assert.deepEqual(
      host.querySelectorAll('g[data-lia-static-kind]').map(group =>
        group.getAttribute('data-lia-static-kind')
      ),
      ['vector', 'arc', 'coord-text']
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /linear-spec-dependent-vector/);
    assert.doesNotMatch(warnings[0], /supported-(?:vector|arc|text)/);
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

test('comma-separated AxisLabel renders while Table is claimed before dynamic bootstraps', () => {
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
    const axisGroup = host.querySelector('g[data-lia-static-kind=axis-label]');
    assert.ok(axisGroup, 'the supported AxisLabel marker renders into the static SVG');
    assert.deepEqual(
      axisGroup.querySelectorAll('text').map(text => text.textContent),
      ['x', 'y']
    );
    assert.equal(warnings.length, 1, 'only the unsupported Table marker warns once');
    assert.match(warnings[0], /lia-table-comma-table/);
    assert.doesNotMatch(warnings[0], /axis-title-spec-comma-axis/);
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


test('unrelated root CSS variables and classes preserve static SVG, geometry, and labels', () => {
  const browser = installFakeBrowser();
  const ids = ['stable-root-a', 'stable-root-b', 'stable-root-c'];
  try {
    const boards = ids.map(id => appendTestVectorBoard(browser, id));
    boards.forEach(({ config }) => {
      const text = appendSpecMarker(
        browser.document, 'coord-text-spec-' + config.id, `${config.id};[1;1];$x$;#123456;1`
      );
      text.className = 'lia-coord-text-spec';
    });
    initStaticRenderer();
    browser.flushAnimationFrames();
    const originals = boards.map(board => ({
      svg: board.svg(),
      geometry: board.svg().querySelector('line'),
      label: board.svg().querySelector('text')
    }));
    originals.forEach(original => assert.ok(original.label));

    for (let pass = 0; pass < 6; pass += 1) {
      browser.document.documentElement.style.setProperty('--unrelated-scroll-position', pass);
      browser.document.documentElement.className = 'external-scroll-state-' + pass;
      ['style', 'class'].forEach(attributeName => browser.triggerMutation({
        type: 'attributes', target: browser.document.documentElement, attributeName
      }));
      browser.document.body.setAttribute('data-theme', 'unrelated-value-' + pass);
      browser.triggerMutation({
        type: 'attributes', target: browser.document.body, attributeName: 'data-theme'
      });
      browser.flushAnimationFrames();
      boards.forEach((board, index) => {
        assert.equal(board.svg(), originals[index].svg, 'unchanged effective styles retain the root SVG');
        assert.equal(board.svg().querySelector('line'), originals[index].geometry);
        assert.equal(board.svg().querySelector('text'), originals[index].label);
      });
    }
    boards.forEach(board => initializeStaticCoordinateBoard(board.host, { ...board.config }));
    bootstrapStaticCoordinateBoards();
    browser.flushAnimationFrames();
    boards.forEach((board, index) => {
      assert.equal(board.svg(), originals[index].svg, 'same macro configuration is idempotent');
      assert.equal(renderStaticSvg(board.host, board.config), originals[index].svg);
    });
    assert.equal(browser.pendingAnimationFrames(), 0, 'the fake event queue is settled, with no retry cycle');
    assert.equal(browser.intervalCalls.length, 0);
  } finally {
    ids.forEach(id => disposeStaticCoordinateBoard(id));
    browser.restore();
  }
});

test('marker and coordinate macro edits update only the corresponding static diagram', () => {
  const browser = installFakeBrowser();
  const ids = ['selective-edit-a', 'selective-edit-b', 'selective-edit-c'];
  try {
    const boards = ids.map(id => appendTestVectorBoard(browser, id));
    initStaticRenderer();
    browser.flushAnimationFrames();
    const initial = boards.map(board => board.svg());

    boards[0].marker.dataset.spec = `${ids[0]};[[0;0];[3;2]];#123456;u=0`;
    browser.triggerMutation({ type: 'attributes', target: boards[0].marker, attributeName: 'data-spec' });
    browser.flushAnimationFrames();
    assert.notEqual(boards[0].svg(), initial[0]);
    assert.notDeepEqual(
      ['x1', 'y1', 'x2', 'y2'].map(name => boards[0].svg().querySelector('line').getAttribute(name)),
      ['x1', 'y1', 'x2', 'y2'].map(name => initial[0].querySelector('line').getAttribute(name)),
      'the changed vector has new geometry'
    );
    assert.equal(boards[1].svg(), initial[1]);
    assert.equal(boards[2].svg(), initial[2]);

    const afterMarkerEdit = boards.map(board => board.svg());
    const changedConfig = { ...boards[1].config, xmax: 8 };
    initializeStaticCoordinateBoard(boards[1].host, changedConfig);
    browser.flushAnimationFrames();
    assert.equal(boards[0].svg(), afterMarkerEdit[0]);
    assert.notEqual(boards[1].svg(), afterMarkerEdit[1]);
    assert.equal(boards[1].svg().getAttribute('viewBox'), '0 0 8 2');
    assert.equal(boards[2].svg(), afterMarkerEdit[2]);
  } finally {
    ids.forEach(id => disposeStaticCoordinateBoard(id));
    browser.restore();
  }
});

test('marker reordering, retargeting, renaming, and removal reconcile only affected boards', () => {
  const browser = installFakeBrowser();
  const ids = ['selective-input-a', 'selective-input-b', 'selective-input-c'];
  try {
    const boards = ids.map(id => appendTestVectorBoard(browser, id));
    const extra = appendSpecMarker(
      browser.document, 'linear-spec-selective-input-extra', `${ids[0]};[[0;0];[1;2]];#654321;v=0`
    );
    extra.dataset.kind = 'vector';
    initStaticRenderer();
    browser.flushAnimationFrames();
    const groupIds = board => board.svg().querySelectorAll('g[data-lia-static-kind]')
      .map(group => group.getAttribute('data-lia-static-uid'));
    assert.deepEqual(groupIds(boards[0]), [ids[0], 'selective-input-extra']);
    let originals = boards.map(board => board.svg());

    browser.document.body.appendChild(boards[0].marker);
    browser.triggerMutation({
      type: 'childList', target: browser.document.body,
      addedNodes: [boards[0].marker], removedNodes: [boards[0].marker]
    });
    browser.flushAnimationFrames();
    assert.deepEqual(groupIds(boards[0]), ['selective-input-extra', ids[0]]);
    assert.notEqual(boards[0].svg(), originals[0]);
    assert.equal(boards[1].svg(), originals[1]);
    assert.equal(boards[2].svg(), originals[2]);
    originals = boards.map(board => board.svg());

    extra.dataset.spec = `${ids[1]};[[0;0];[1;2]];#654321;v=0`;
    browser.triggerMutation({ type: 'attributes', target: extra, attributeName: 'data-spec' });
    browser.flushAnimationFrames();
    assert.deepEqual(groupIds(boards[0]), [ids[0]]);
    assert.deepEqual(groupIds(boards[1]), [ids[1], 'selective-input-extra']);
    assert.equal(extra.dataset.liaStaticClaimed, ids[1]);
    assert.notEqual(boards[0].svg(), originals[0]);
    assert.notEqual(boards[1].svg(), originals[1]);
    assert.equal(boards[2].svg(), originals[2]);
    originals = boards.map(board => board.svg());

    extra.id = 'linear-spec-selective-input-renamed';
    browser.triggerMutation({ type: 'attributes', target: extra, attributeName: 'id' });
    browser.flushAnimationFrames();
    assert.deepEqual(groupIds(boards[1]), [ids[1], 'selective-input-renamed']);
    assert.equal(boards[0].svg(), originals[0]);
    assert.notEqual(boards[1].svg(), originals[1]);
    assert.equal(boards[2].svg(), originals[2]);
    originals = boards.map(board => board.svg());

    extra.remove();
    browser.triggerMutation({ type: 'childList', target: browser.document.body, addedNodes: [], removedNodes: [extra] });
    browser.flushAnimationFrames();
    assert.deepEqual(groupIds(boards[1]), [ids[1]]);
    assert.equal(boards[0].svg(), originals[0]);
    assert.notEqual(boards[1].svg(), originals[1]);
    assert.equal(boards[2].svg(), originals[2]);
  } finally {
    ids.forEach(id => disposeStaticCoordinateBoard(id));
    browser.restore();
  }
});

test('effective accent changes retain diagrams using only explicit colors', () => {
  const browser = installFakeBrowser();
  const ids = ['selective-theme-default', 'selective-theme-explicit'];
  try {
    const accent = browser.document.createElement('button');
    accent.className = 'lia-btn';
    browser.document.body.appendChild(accent);
    const boards = [appendTestVectorBoard(browser, ids[0], ''), appendTestVectorBoard(browser, ids[1])];
    initStaticRenderer();
    browser.flushAnimationFrames();
    const originals = boards.map(board => board.svg());
    const explicitGeometry = originals[1].querySelector('line');

    browser.setTheme({ accentColor: 'rgb(140, 80, 200)' });
    browser.triggerMutation({ type: 'attributes', target: browser.document.body, attributeName: 'class' });
    browser.flushAnimationFrames();
    assert.notEqual(boards[0].svg(), originals[0]);
    assert.equal(boards[0].svg().querySelector('line').getAttribute('stroke'), 'rgb(140, 80, 200)');
    assert.equal(boards[1].svg(), originals[1]);
    assert.equal(boards[1].svg().querySelector('line'), explicitGeometry);
    assert.equal(explicitGeometry.getAttribute('stroke'), '#123456');

    const themedSvg = boards[0].svg();
    browser.triggerMediaChange();
    browser.flushAnimationFrames();
    assert.equal(boards[0].svg(), themedSvg, 'same effective colors after a media event retain the SVG');
    assert.equal(boards[1].svg(), originals[1]);
  } finally {
    ids.forEach(id => disposeStaticCoordinateBoard(id));
    browser.restore();
  }
});

test('one bootstrap shares one document-wide marker search across three declarative diagrams', () => {
  const browser = installFakeBrowser();
  const ids = ['batched-search-a', 'batched-search-b', 'batched-search-c'];
  try {
    const hosts = ids.map(id => {
      const host = appendHost(browser.document);
      host.dataset.liaStaticCoordinateHost = '';
      host.dataset.spec = `xmin=0;xmax=4;ymin=0;ymax=2;width=240;id=${id};achsen=0;grid=0;border=0;static=1`;
      const marker = appendSpecMarker(browser.document, 'linear-spec-' + id, `${id};[[0;0];[2;1]];#123456;u=0`);
      marker.dataset.kind = 'vector';
      return host;
    });
    const markerSearches = () => browser.documentQueries.filter(query => query.includes('[id^="area-spec-"][data-spec]'));
    browser.documentQueries.length = 0;
    bootstrapStaticCoordinateBoards();
    assert.equal(markerSearches().length, 1, 'initial host registration, claims, and geometry share the marker index');
    const originals = hosts.map(host => host.querySelector('svg[data-lia-static-svg]'));
    originals.forEach(svg => assert.ok(svg));

    browser.documentQueries.length = 0;
    bootstrapStaticCoordinateBoards();
    assert.equal(markerSearches().length, 1, 'subsequent reconciliation scans the document once');
    hosts.forEach((host, index) => assert.equal(host.querySelector('svg[data-lia-static-svg]'), originals[index]));
  } finally {
    ids.forEach(id => disposeStaticCoordinateBoard(id));
    browser.restore();
  }
});

test('observer ignores owned SVG and TeX output mutations without scheduling feedback', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-output-feedback';
  try {
    const board = appendTestVectorBoard(browser, boardId);
    initStaticRenderer();
    browser.flushAnimationFrames();
    const svg = board.svg();
    const output = browser.document.createElementNS(SVG_NAMESPACE, 'g');
    // TeX output may use arbitrary ids and attributes, including marker-looking ones.
    output.id = 'linear-spec-generated-output';
    output.dataset.spec = `${boardId};[[0;0];[4;2]];#000000;u=0`;
    svg.appendChild(output);
    [
      { type: 'childList', target: board.host, addedNodes: [svg], removedNodes: [] },
      { type: 'childList', target: svg, addedNodes: [output], removedNodes: [] },
      { type: 'attributes', target: output, attributeName: 'data-spec' },
      { type: 'attributes', target: svg, attributeName: 'style' }
    ].forEach(mutation => browser.triggerMutation(mutation));
    assert.equal(browser.pendingAnimationFrames(), 0, 'owned output must not enqueue another bootstrap');
    browser.flushAnimationFrames();
    assert.equal(board.svg(), svg);
    bootstrapStaticCoordinateBoards();
    assert.equal(board.svg(), svg, 'later input searches also exclude owned output');
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});

test('hidden slides and unchanged detached slide revisits retain their SVG identity', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-slide-revisit';
  try {
    const slide = browser.document.createElement('section');
    browser.document.body.appendChild(slide);
    const board = appendTestVectorBoard(browser, boardId);
    slide.appendChild(board.host);
    slide.appendChild(board.marker);
    initStaticRenderer();
    browser.flushAnimationFrames();
    const svg = board.svg();

    slide.style.display = 'none';
    browser.triggerMutation({ type: 'attributes', target: slide, attributeName: 'style' });
    browser.flushAnimationFrames();
    slide.style.display = 'block';
    browser.triggerMutation({ type: 'attributes', target: slide, attributeName: 'style' });
    browser.flushAnimationFrames();
    assert.equal(board.svg(), svg, 'showing an unchanged slide preserves all SVG output');

    slide.remove();
    browser.triggerMutation({ type: 'childList', target: browser.document.body, addedNodes: [], removedNodes: [slide] });
    browser.flushAnimationFrames();
    assert.equal(isStaticCoordinateBoard(boardId), false);
    browser.document.body.appendChild(slide);
    browser.triggerMutation({ type: 'childList', target: browser.document.body, addedNodes: [slide], removedNodes: [] });
    browser.flushAnimationFrames();
    assert.equal(isStaticCoordinateBoard(boardId), true);
    assert.equal(board.svg(), svg, 'returning with the same DOM and configuration reuses the previous SVG');
    assert.equal(board.marker.dataset.liaStaticClaimed, boardId);
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});


test('a detached declarative slide can switch to dynamic mode before returning', () => {
  const browser = installFakeBrowser();
  const boardId = 'static-slide-mode-change';
  let dynamicRuntimeCalls = 0;
  browser.window.__ensureCoordinateDynamicRuntime = () => { dynamicRuntimeCalls += 1; };
  try {
    const slide = browser.document.createElement('section');
    browser.document.body.appendChild(slide);
    const host = browser.document.createElement('div');
    host.dataset.liaStaticCoordinateHost = '';
    const spec = `xmin=0;xmax=4;ymin=0;ymax=2;width=240;id=${boardId};achsen=0;grid=0;border=0;static=`;
    host.dataset.spec = spec + '1';
    slide.appendChild(host);
    const marker = appendSpecMarker(
      browser.document, 'linear-spec-' + boardId, `${boardId};[[0;0];[2;1]];#123456;u=0`
    );
    marker.dataset.kind = 'vector';
    slide.appendChild(marker);
    initStaticRenderer();
    browser.flushAnimationFrames();
    assert.equal(marker.dataset.liaStaticClaimed, boardId);
    assert.ok(host.querySelector('svg[data-lia-static-svg]'));

    slide.remove();
    browser.triggerMutation({ type: 'childList', target: browser.document.body, addedNodes: [], removedNodes: [slide] });
    browser.flushAnimationFrames();
    assert.equal(isStaticCoordinateBoard(boardId), false);
    host.dataset.spec = spec + '0';
    browser.document.body.appendChild(slide);
    browser.triggerMutation({ type: 'childList', target: browser.document.body, addedNodes: [slide], removedNodes: [] });
    browser.flushAnimationFrames();

    assert.equal(isStaticCoordinateBoard(boardId), false);
    assert.equal(host.querySelector('svg[data-lia-static-svg]'), null, 'cached static output is disposed on mode change');
    assert.equal(host.hasAttribute('data-lia-static-coordinate'), false);
    assert.equal(host.hasAttribute('data-lia-static-coordinate-host'), true);
    assert.equal(marker.hasAttribute('data-lia-static-claimed'), false);
    assert.equal(dynamicRuntimeCalls, 1);
  } finally {
    disposeStaticCoordinateBoard(boardId);
    browser.restore();
  }
});
