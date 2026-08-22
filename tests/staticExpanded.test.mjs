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

const { parseCoordSpec } = await import('../src/coord/boardHelpers.ts');
const { renderStaticSvg, staticDashArray } = await import('../src/static/staticSvg.ts');
const {
  parseStaticAngleSpec,
  parseStaticAxisLabelSpec,
  parseStaticCircleSpec,
  parseStaticLinearSpec,
  parseStaticPlotFunctionSpec,
  parseStaticPointReference,
  parseStaticPointSpec,
  parseStaticRelationSpec,
  parseStaticSectorSpec
} = await import('../src/static/staticSpecs.ts');

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function dataAttributeName(property) {
  return 'data-' + String(property).replace(/[A-Z]/g, match => '-' + match.toLowerCase());
}

function createStyleDeclaration() {
  return {
    setProperty(name, value) { this[name] = String(value); },
    removeProperty(name) {
      const previous = this[name] || '';
      delete this[name];
      return previous;
    }
  };
}

function unquoteAttributeValue(value) {
  const source = String(value || '').trim();
  if (source.length < 2) return source;
  const first = source.charCodeAt(0);
  const last = source.charCodeAt(source.length - 1);
  return first === last && (first === 34 || first === 39)
    ? source.slice(1, -1)
    : source;
}

function simpleSelectorMatches(element, selector) {
  let source = String(selector || '').trim();
  if (!source) return false;
  if (source.includes(' ')) source = source.split(/\s+/).at(-1);

  const tagMatch = source.match(/^[a-z*][a-z0-9-]*/i);
  if (tagMatch && tagMatch[0] !== '*' && element.localName !== tagMatch[0].toLowerCase()) {
    return false;
  }
  const idMatch = source.match(/#([a-z0-9_-]+)/i);
  if (idMatch && element.id !== idMatch[1]) return false;
  const classes = String(element.className || '').split(/\s+/).filter(Boolean);
  for (const match of source.matchAll(/\.([a-z0-9_-]+)/gi)) {
    if (!classes.includes(match[1])) return false;
  }

  const pattern = /\[([^\]\s~|^$*!=]+)\s*(?:(\^=|\$=|\*=|=)\s*([^\]]*))?\]/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const operator = match[2];
    const expected = unquoteAttributeValue(match[3]);
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
      }
    });
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get firstChild() { return this.children[0] || null; }

  setAttribute(name, value) { this._attributes.set(String(name), String(value)); }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  getAttribute(name) {
    return this._attributes.has(String(name)) ? this._attributes.get(String(name)) : null;
  }
  hasAttribute(name) { return this._attributes.has(String(name)); }
  removeAttribute(name) { this._attributes.delete(String(name)); }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
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
    children.forEach(child => this.appendChild(child));
  }

  matches(selector) {
    return String(selector).split(',').some(part => simpleSelectorMatches(this, part));
  }
  querySelectorAll(selector) {
    const selectors = String(selector).split(',').map(part => part.trim()).filter(Boolean);
    const result = [];
    const visit = node => {
      node.children.forEach(child => {
        if (selectors.some(part => simpleSelectorMatches(child, part))) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument {
  constructor() {
    this.nodeType = 9;
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.body);
  }
  createElement(localName) { return new FakeElement(localName, this); }
  createElementNS(namespaceURI, localName) {
    return new FakeElement(localName, this, namespaceURI);
  }
  querySelectorAll(selector) {
    const root = this.documentElement.matches(selector) ? [this.documentElement] : [];
    return root.concat(this.documentElement.querySelectorAll(selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function installFakeBrowser() {
  const previous = new Map();
  ['document', 'window'].forEach(name => previous.set(name, globalThis[name]));
  const document = new FakeDocument();
  const window = {
    document,
    parent: null,
    getComputedStyle() {
      return {
        backgroundColor: 'rgb(255, 255, 255)',
        borderTopColor: 'rgba(0, 0, 0, 0)',
        color: 'rgb(0, 0, 0)'
      };
    }
  };
  Object.assign(globalThis, { document, window });
  return {
    document,
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

function appendSpecMarker(document, id, spec, options = {}) {
  const marker = document.createElement('span');
  marker.id = id;
  marker.dataset.spec = spec;
  if (options.language) marker.dataset.language = options.language;
  if (options.kind) marker.dataset.kind = options.kind;
  document.body.appendChild(marker);
  return marker;
}

function pointNames(points) {
  return points.map(point => point.kind === 'point' ? point.name : point.coordinate);
}

test('static point and axis-label parsers keep immutable public marker semantics', () => {
  assert.deepEqual(
    parseStaticAxisLabelSpec('id=axes;xlabel=$x$;ylabel=f{{x}}'),
    { kind: 'axis-label', boardId: 'axes', xLabel: '$x$', yLabel: 'f(x)' }
  );
  assert.deepEqual(
    parseStaticAxisLabelSpec('id=axes,xlabel=Zeit, in s,ylabel=Höhe'),
    { kind: 'axis-label', boardId: 'axes', xLabel: 'Zeit, in s', yLabel: 'Höhe' }
  );
  assert.equal(
    parseStaticAxisLabelSpec('id=axes,xlabel=Euler\'s Zahl,ylabel=y').xLabel,
    'Euler\'s Zahl'
  );
  assert.equal(parseStaticAxisLabelSpec('xlabel=x;ylabel=y'), null);

  const point = parseStaticPointSpec('axes;A=0;1,5;−2;#123456;0;fix');
  assert.deepEqual(point, {
    kind: 'point',
    boardId: 'axes',
    name: 'A',
    showName: false,
    coordinate: { x: 1.5, y: -2 },
    color: '#123456',
    hasExplicitColor: true,
    opacity: 0,
    fixed: true,
    helper: false
  });
  assert.equal(
    parseStaticPointSpec('axes;A;1;2;#123456;1;xexpr=x+1'),
    null,
    'runtime expressions are outside the static point subset'
  );
  assert.equal(parseStaticPointSpec('axes;A;x+1;2;#123456;1'), null);

  const helperPoint = parseStaticPointSpec(
    'axes;H;2;3;helper=1;#abcdef;0.25;fix'
  );
  assert.equal(helperPoint.helper, true);
  assert.equal(helperPoint.color, '#abcdef');
  assert.equal(helperPoint.opacity, 0.25);
  assert.equal(helperPoint.fixed, true);
  const ordinaryPoint = parseStaticPointSpec(
    'axes;N;3;2;hilfspunkt=0;#fedcba;0.4'
  );
  assert.equal(ordinaryPoint.helper, false);
  assert.equal(ordinaryPoint.color, '#fedcba');
  assert.equal(ordinaryPoint.opacity, 0.4);

  assert.deepEqual(parseStaticPointReference('[2;-3]'), {
    kind: 'coordinate', coordinate: { x: 2, y: -3 }
  });
  assert.deepEqual(parseStaticPointReference('A=0'), { kind: 'point', name: 'A' });
  assert.equal(parseStaticPointReference('A;B'), null);
});

test('static line, ray, vector, midpoint, and direct-base relation parsers retain options', () => {
  const line = parseStaticLinearSpec(
    'board;[A;B];#123456;g;linestyle=dashed;visible=0',
    'line',
    'en'
  );
  assert.equal(line.kind, 'line');
  assert.deepEqual(pointNames(line.points), ['A', 'B']);
  assert.equal(line.objectName, 'g');
  assert.equal(line.showName, true);
  assert.equal(line.visible, false);
  assert.equal(line.lineStyle, 'dashed');
  assert.equal(line.language, 'en');

  const ray = parseStaticLinearSpec(
    'board;[[0;0];[2;1]];#abcdef;r;linienstil=dotted',
    'Strahl',
    'de'
  );
  assert.equal(ray.kind, 'ray');
  assert.deepEqual(pointNames(ray.points), [{ x: 0, y: 0 }, { x: 2, y: 1 }]);
  assert.equal(ray.lineStyle, 'dotted');
  assert.equal(parseStaticLinearSpec('board;[A;B;C];#000', 'vector'), null);

  const midpoint = parseStaticRelationSpec(
    'board;[A;B];#ff00ff;M;wert=1',
    'Mittelpunkt',
    'de'
  );
  assert.equal(midpoint.kind, 'midpoint');
  assert.deepEqual(pointNames(midpoint.points), ['A', 'B']);
  assert.equal(midpoint.objectName, 'M');
  assert.equal(midpoint.showName, true);
  assert.equal(midpoint.showValue, true);
  assert.equal(
    parseStaticRelationSpec(
      'board;[A;B];#ff00ff;M;visible=0;visible=1',
      'midpoint',
      'en'
    ).visible,
    false
  );

  const parallel = parseStaticRelationSpec(
    'board;[A;B];C;#0088ff;p;linienstil=dashdotted',
    'parallel',
    'de'
  );
  assert.equal(parallel.kind, 'parallel');
  assert.equal(parallel.base.kind, 'points');
  assert.deepEqual(pointNames(parallel.base.points), ['A', 'B']);
  assert.deepEqual(parallel.through, { kind: 'point', name: 'C' });
  assert.equal(parallel.objectName, 'p');
  assert.equal(parallel.lineStyle, 'dashdotted');

  const namedBase = parseStaticRelationSpec('board;g;C;#0088ff;p', 'parallel', 'en');
  assert.deepEqual(namedBase.base, { kind: 'object', name: 'g' });
});

test('circle, angle, and sector parsers preserve named dependencies and measurements', () => {
  const circle = parseStaticCircleSpec(
    'board;k;O;#457b9d;0.25;radius=R;inhalt=1;umfang=1;linienstil=dashed',
    'de'
  );
  assert.equal(circle.kind, 'circle');
  assert.equal(circle.name, 'k');
  assert.deepEqual(circle.center, { kind: 'point', name: 'O' });
  assert.deepEqual(circle.radius, { kind: 'point', point: { kind: 'point', name: 'R' } });
  assert.equal(circle.opacity, 0.25);
  assert.equal(circle.showArea, true);
  assert.equal(circle.showCircumference, true);
  assert.equal(circle.lineStyle, 'dashed');
  assert.deepEqual(
    parseStaticCircleSpec('board;k;O;#457b9d;0.2;radius=-3', 'en').radius,
    { kind: 'number', value: 3 }
  );
  assert.deepEqual(
    parseStaticCircleSpec(
      'board;k;O;#457b9d;0.2;radius=2;radius=R;radius=0',
      'en'
    ).radius,
    { kind: 'number', value: 2 }
  );
  assert.equal(
    parseStaticCircleSpec(
      'board;k;O;#457b9d;0.2;visible=0;visible=1',
      'en'
    ).visible,
    false
  );
  assert.equal(parseStaticCircleSpec('board;k;[0;0];#457b9d;0.2;radius=2'), null);

  const angle = parseStaticAngleSpec(
    'board;alpha;[B;O;C];#ff8800;0.8;Wert=1;linienstil=dotted',
    'de'
  );
  assert.equal(angle.kind, 'angle');
  assert.deepEqual(pointNames(angle.points), ['B', 'O', 'C']);
  assert.equal(angle.name, 'alpha');
  assert.equal(angle.showValue, true);
  assert.equal(angle.lineStyle, 'dotted');
  assert.equal(
    parseStaticAngleSpec('board;alpha;[[1;0];[0;0];[0;1]];#ff8800;1', 'en'),
    null,
    'the public angle marker depends on three authored point names'
  );

  const sector = parseStaticSectorSpec(
    'board;[O;R;C];#457b9d;0.3;s;area=1;perimeter=1;visible=0;visible=1',
    'en'
  );
  assert.equal(sector.kind, 'sector');
  assert.deepEqual(pointNames(sector.points), ['O', 'R', 'C']);
  assert.equal(sector.objectName, 's');
  assert.equal(sector.showArea, true);
  assert.equal(sector.showPerimeter, true);
  assert.equal(sector.visible, false);
  assert.equal(sector.language, 'en');
});

test('static plot parser compiles self-contained expressions and rejects bindings', () => {
  const plot = parseStaticPlotFunctionSpec(
    'board;f=0;sin{{x}}+x^2;#6a4c93;linestyle=dashdotted'
  );
  assert.equal(plot.kind, 'plot');
  assert.equal(plot.name, 'f');
  assert.equal(plot.showName, false);
  assert.equal(plot.expression, 'sin(x)+x^2');
  assert.equal(plot.color, '#6a4c93');
  assert.equal(plot.lineStyle, 'dashdotted');
  assert.ok(Math.abs(plot.evaluate(2) - (Math.sin(2) + 4)) < 1e-12);
  assert.equal(
    parseStaticPlotFunctionSpec('board;f;x+a;#000;bindings=a=2'),
    null
  );
  assert.equal(parseStaticPlotFunctionSpec('board;f;;#000'), null);
});

test('first-quadrant axis ticks and numbers stay inside the SVG viewport', () => {
  const browser = installFakeBrowser();
  try {
    const host = appendHost(browser.document);
    const config = parseCoordSpec(
      'xmin=0;xmax=4;ymin=0;ymax=4;width=400;id=edge-axes;achsen=1;grid=0;border=0;static=1'
    );
    const svg = renderStaticSvg(host, config);
    const axes = svg.querySelector('g[data-lia-static-decoration=axes]');
    const xNumbers = axes.querySelectorAll('text[data-lia-static-axis-number=x]');
    const yNumbers = axes.querySelectorAll('text[data-lia-static-axis-number=y]');
    assert.ok(xNumbers.length > 1 && yNumbers.length > 1);
    assert.ok(xNumbers.every(label => Number(label.getAttribute('y')) < 4));
    assert.ok(yNumbers.every(label => Number(label.getAttribute('x')) > 0));
    axes.querySelectorAll('line[data-lia-static-axis-tick]').forEach(tick => {
      ['x1', 'x2', 'y1', 'y2'].forEach(attribute => {
        const value = Number(tick.getAttribute(attribute));
        assert.ok(value >= 0 && value <= 4, `${attribute}=${value} is inside the viewBox`);
      });
    });
  } finally {
    browser.restore();
  }
});

test('static SVG resolves forward named points and renders the expanded geometry in source order', () => {
  const browser = installFakeBrowser();
  const boardId = 'expanded-static-board';
  try {
    const host = appendHost(browser.document);

    appendSpecMarker(
      browser.document,
      'axis-title-spec-expanded',
      `id=${boardId};xlabel=$x$;ylabel=$y$`
    );
    appendSpecMarker(
      browser.document,
      'linear-spec-expanded-line',
      `${boardId};[A;B];#123456;g;linestyle=dashed`,
      { kind: 'line', language: 'en' }
    );
    appendSpecMarker(
      browser.document,
      'linear-spec-expanded-ray',
      `${boardId};[O;C];#654321;r;linestyle=dotted`,
      { kind: 'ray', language: 'en' }
    );
    appendSpecMarker(
      browser.document,
      'relation-spec-expanded-midpoint',
      `${boardId};[A;B];#ff00ff;M;wert=1`,
      { kind: 'midpoint', language: 'de' }
    );
    appendSpecMarker(
      browser.document,
      'relation-spec-expanded-parallel',
      `${boardId};[A;B];C;#0088ff;p;linienstil=dashdotted`,
      { kind: 'parallel', language: 'de' }
    );
    appendSpecMarker(
      browser.document,
      'circle-spec-expanded',
      `${boardId};k;O;#457b9d;0.25;radius=R;inhalt=1;umfang=1`,
      { language: 'de' }
    );
    appendSpecMarker(
      browser.document,
      'angle-spec-expanded',
      `${boardId};alpha;[B;O;C];#ff8800;0.8;Wert=1`,
      { language: 'de' }
    );
    appendSpecMarker(
      browser.document,
      'sector-spec-expanded',
      `${boardId};[O;R;C];#2a9d8f;0.3;s;area=1;perimeter=1`,
      { language: 'en' }
    );
    appendSpecMarker(
      browser.document,
      'plot-spec-expanded',
      `${boardId};f=0;x^2-1;#6a4c93;linestyle=dotted`
    );

    [
      ['A=0', -3, -1, '#e63946'],
      ['B=0', 3, -1, '#e63946'],
      ['C=0', 0, 3, '#e63946'],
      ['O=0', 0, 0, '#457b9d'],
      ['R=0', 2, 0, '#457b9d']
    ].forEach(([name, x, y, color], index) => {
      appendSpecMarker(
        browser.document,
        `point-spec-expanded-${index}`,
        `${boardId};${name};${x};${y};${color};0;fix`
      );
    });

    const config = parseCoordSpec(
      `xmin=-4;xmax=4;ymin=-3;ymax=4;width=480;id=${boardId};achsen=1;grid=0;border=0;static=1`
    );
    const svg = renderStaticSvg(host, config);
    assert.equal(svg.namespaceURI, SVG_NAMESPACE);
    assert.equal(svg.getAttribute('viewBox'), '0 0 8 7');
    assert.equal(host.children.length, 1);

    const groups = svg.querySelectorAll('g[data-lia-static-kind]');
    assert.deepEqual(
      groups.map(group => group.getAttribute('data-lia-static-kind')),
      [
        'axis-label', 'line', 'ray', 'midpoint', 'parallel',
        'circle', 'angle', 'sector', 'plot',
        'point', 'point', 'point', 'point', 'point'
      ],
      'dependent markers render in authored order even when points are declared later'
    );

    const axisLabels = groups[0].querySelectorAll('text');
    assert.deepEqual(axisLabels.map(label => label.textContent), ['x', 'y']);
    const axesDecoration = svg.querySelector('g[data-lia-static-decoration=axes]');
    assert.ok(axesDecoration);
    ['x', 'y'].forEach(axis => {
      const axisLine = axesDecoration.querySelector(`line[data-lia-static-axis=${axis}]`);
      assert.ok(axisLine, `${axis}-axis is present`);
      assert.match(axisLine.getAttribute('marker-end'), /^url\(#lia-static-arrow-/);
      assert.ok(
        axesDecoration.querySelectorAll(`line[data-lia-static-axis-tick=${axis}]`).length > 1,
        `${axis}-axis has deterministic ticks`
      );
      assert.ok(
        axesDecoration.querySelectorAll(`text[data-lia-static-axis-number=${axis}]`).length > 1,
        `${axis}-axis has numeric labels`
      );
    });

    const line = groups[1].querySelector('line');
    assert.deepEqual(
      ['x1', 'y1', 'x2', 'y2'].map(name => line.getAttribute(name)),
      ['0', '5', '8', '5'],
      'the infinite named line is clipped to both board edges'
    );
    assert.equal(line.getAttribute('stroke-dasharray'), staticDashArray('dashed'));
    assert.equal(groups[1].querySelector('text').textContent, 'g');

    const ray = groups[2].querySelector('line');
    assert.deepEqual(
      ['x1', 'y1', 'x2', 'y2'].map(name => ray.getAttribute(name)),
      ['4', '4', '4', '0'],
      'the ray starts at O and is clipped in its forward direction'
    );
    assert.equal(ray.getAttribute('stroke-dasharray'), staticDashArray('dotted'));

    const midpoint = groups[3];
    assert.equal(midpoint.querySelectorAll('line').length, 2);
    assert.match(midpoint.querySelector('text').textContent, /^M \(0 \| -1\)$/);

    const parallel = groups[4].querySelector('line');
    assert.equal(parallel.getAttribute('y1'), '1');
    assert.equal(parallel.getAttribute('y2'), '1');
    assert.equal(parallel.getAttribute('stroke-dasharray'), staticDashArray('dashdotted'));

    const circleGroup = groups[5];
    const circle = circleGroup.querySelector('circle');
    assert.deepEqual(
      ['cx', 'cy', 'r'].map(name => circle.getAttribute(name)),
      ['4', '4', '2']
    );
    assert.equal(circle.getAttribute('fill-opacity'), '0.25');
    const circleLabels = circleGroup.querySelectorAll('text');
    assert.equal(circleLabels.length, 2);
    assert.equal(circleLabels[0].textContent, 'k');
    assert.equal(circleLabels[0].getAttribute('fill'), '#457b9d');
    assert.match(circleLabels[1].textContent, /A ≈ 12,566 FE.*u ≈ 12,566 LE/);

    const anglePath = groups[6].querySelector('path');
    assert.ok(anglePath.getAttribute('d').includes(' A '));
    assert.equal(anglePath.getAttribute('fill'), '#ff8800');
    const angleLabel = groups[6].querySelector('text');
    assert.match(angleLabel.textContent, /^alpha ≈ \d+(?:,\d)?°$/);
    assert.equal(angleLabel.getAttribute('fill'), '#ff8800');
    assert.equal(angleLabel.getAttribute('fill-opacity'), '0.8');

    const sectorPath = groups[7].querySelector('path');
    assert.match(sectorPath.getAttribute('d'), /^M .* L .* A .* Z$/);
    assert.equal(sectorPath.getAttribute('fill-opacity'), '0.3');
    const sectorLabel = groups[7].querySelector('text');
    assert.match(sectorLabel.textContent, /s.*A ≈ 3\.142 AU.*u ≈ 7\.142 LU/);
    assert.equal(sectorLabel.getAttribute('fill'), '#2a9d8f');

    const plotGroup = groups[8];
    assert.ok(Number(plotGroup.getAttribute('data-lia-static-evaluations')) >= 256);
    assert.ok(plotGroup.querySelectorAll('path').length >= 1);
    plotGroup.querySelectorAll('path').forEach(path => {
      assert.equal(path.getAttribute('stroke'), '#6a4c93');
      assert.equal(path.getAttribute('stroke-dasharray'), staticDashArray('dotted'));
      assert.equal(path.getAttribute('vector-effect'), 'non-scaling-stroke');
    });

    groups.slice(9).forEach(pointGroup => {
      assert.equal(pointGroup.querySelectorAll('line').length, 2);
      pointGroup.querySelectorAll('line').forEach(glyph => {
        assert.equal(glyph.getAttribute('stroke-opacity'), '0');
      });
      assert.equal(pointGroup.querySelector('text'), null);
    });
  } finally {
    browser.restore();
  }
});
