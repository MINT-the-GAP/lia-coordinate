import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const { hideAngleHelperArc } = await import('../src/subsystems/angle.ts');
const { getStaticPointCreationAttributes } = await import('../src/subsystems/createPoint.ts');
const { createHiddenPoint } = await import('../src/shared/boardObjects.ts');
const {
  getDgsRenderedLayer,
  getExplicitDgsLayerFromOwner,
  getRenderedDgsLayerFromOwner
} = await import('../src/shared/dgsLayer.ts');
const {
  buildScharTermMarkup,
  refreshScharCurveGeometry,
  refreshScharTerm
} = await import('../src/subsystems/schar.ts');
const {
  computeResizeBBox,
  getResponsiveResizeAnchor,
  syncBoardRendererSize
} = await import('../src/coord/boardHelpers.ts');
const {
  MACRO_RENDER_LAYER_COUNT,
  applyMacroCodeOrderLayers,
  ensureBoardRendererLayerCapacity,
  ensureMacroLayerCapacity,
  getMacroHtmlZIndex,
  getMacroRenderedLayer,
  scheduleMacroCodeOrderLayers
} = await import('../src/shared/macroLayer.ts');

test('responsive shrink and grow keeps the complete logical viewport', () => {
  const initialBBox = [-4, 3, 4, -3];
  const transientRendererBBox = [-4, 4, 4, -4];
  const board = {
    __coordExportBBox: initialBBox.slice(),
    getBoundingBox: () => transientRendererBBox.slice()
  };

  const anchor = getResponsiveResizeAnchor(board, initialBBox);
  const narrowBBox = computeResizeBBox(400, 600, anchor, initialBBox);
  const restoredBBox = computeResizeBBox(800, 600, anchor, initialBBox);

  assert.deepEqual(anchor, initialBBox);
  assert.deepEqual(narrowBBox, [-4, 6, 4, -6]);
  assert.deepEqual(restoredBBox, initialBBox);
  assert.ok(narrowBBox[0] <= 0 && narrowBBox[2] >= 0);
  assert.ok(narrowBBox[1] >= -2.5 && narrowBBox[3] <= -2.5);
});

test('responsive resize anchor falls back to the current board viewport', () => {
  const initialBBox = [-4, 3, 4, -3];
  const liveBBox = [-5, 4, 5, -4];
  const board = {
    __coordExportBBox: [0, 0, 0, 0],
    getBoundingBox: () => liveBBox
  };

  const anchor = getResponsiveResizeAnchor(board, initialBBox);
  assert.deepEqual(anchor, liveBBox);
  assert.notEqual(anchor, liveBBox);
});

test('renderer follows the real flex size and restores the logical viewport after growing', () => {
  const initialBBox = [-4, 3, 4, -3];
  const container = {
    offsetWidth: 400,
    offsetHeight: 600,
    style: {}
  };
  const resizeCalls = [];
  const bboxCalls = [];
  const board = {
    containerObj: container,
    resizeContainer(...args) { resizeCalls.push(args); },
    setBoundingBox(...args) { bboxCalls.push(args); }
  };

  const shrunk = syncBoardRendererSize(
    board,
    800,
    600,
    false,
    initialBBox,
    initialBBox
  );

  container.offsetWidth = 800;
  container.offsetHeight = 600;
  const grown = syncBoardRendererSize(
    board,
    800,
    600,
    false,
    initialBBox,
    initialBBox
  );

  assert.deepEqual(resizeCalls, [
    [400, 600, true, true],
    [800, 600, true, true]
  ]);
  assert.deepEqual(bboxCalls, [
    [[-4, 6, 4, -6], true, 'keep'],
    [initialBBox, true, 'keep']
  ]);
  assert.deepEqual(shrunk, { width: 400, height: 600, bbox: [-4, 6, 4, -6] });
  assert.deepEqual(grown, { width: 800, height: 600, bbox: initialBBox });
});

test('the bundled coordinate-system initializer leaves resizing to the template', () => {
  const helpers = readFileSync(new URL('../src/coord/boardHelpers.ts', import.meta.url), 'utf8');
  assert.equal((helpers.match(/resize:\s*\{\s*enabled:\s*false\s*\}/g) || []).length, 1);
});

test('coordinate-system initializers survive DynFlex quiz blockification', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const pattern = /^@CoordinateSystem_\r?\n``` javascript @JSX\.Graph\r?\n([\s\S]*?)\r?\n```\r?\n@end$/gm;
  const bodies = [...readme.matchAll(pattern)].map((match) => match[1]);

  assert.equal(bodies.length, 2, 'header and implementation macro must both be covered');

  bodies.forEach((body) => {
    assert.doesNotMatch(body, /\r?\n[ \t]*\r?\n/);
    const normalizedBody = body.replace(/\r\n/g, '\n');
    const runMacro = new Function('window', 'jxgbox', normalizedBody);
    const jxgbox = {};
    const queuedCalls = [];
    const queuedWindow = {};

    runMacro(queuedWindow, jxgbox);
    assert.equal(queuedWindow.__liaRunCoordHooks.length, 1);
    queuedWindow.__coord = {
      initializeCoordinateBoard(...args) { queuedCalls.push(args); }
    };
    queuedWindow.__liaRunCoordHooks[0]();
    assert.deepEqual(queuedCalls, [[jxgbox, '@0']]);

    const immediateCalls = [];
    const readyWindow = {
      __coord: {
        initializeCoordinateBoard(...args) { immediateCalls.push(args); }
      },
      __liaRunCoordHooks: {
        push(fn) { fn(); }
      }
    };
    runMacro(readyWindow, jxgbox);
    assert.deepEqual(immediateCalls, [[jxgbox, '@0']]);

    const flexChild = `<jsx-graph>\n${normalizedBody}\n</jsx-graph>\n\n[[quiz]]`;
    const parts = flexChild
      .split(/\n[ \t]*\n+/)
      .filter((part) => part.replace(/\s+/g, '').length > 0);
    const graphParts = parts.filter((part) => part.includes('jsx-graph'));

    assert.equal(graphParts.length, 1);
    assert.match(graphParts[0], /^<jsx-graph>[\s\S]*<\/jsx-graph>$/);
  });
});

test('the internal JSXGraph angle helper arc always stays hidden and unfilled', () => {
  const calls = [];
  const arc = {
    hideCalls: 0,
    setAttribute(attributes) {
      calls.push(attributes);
    },
    hideElement() {
      this.hideCalls += 1;
    }
  };

  hideAngleHelperArc({ arc });

  assert.deepEqual(calls, [{
    visible: false,
    fillColor: 'none',
    highlightFillColor: 'none',
    fillOpacity: 0,
    highlightFillOpacity: 0
  }]);
  assert.equal(arc.hideCalls, 1);
});

test('DGS composite children inherit an explicit layer from their owner', () => {
  const owner = { __liaDgsLayer: 20, __liaDgsRenderedLayer: 65 };
  const border = { __liaMacroSourceLayer: 1, __liaDgsPolygonBorderOwner: owner };
  const label = { __liaDgsOwner: border };

  assert.equal(getExplicitDgsLayerFromOwner(owner), 20);
  assert.equal(getExplicitDgsLayerFromOwner(border), 20);
  assert.equal(getExplicitDgsLayerFromOwner(label), 20);
  assert.equal(getRenderedDgsLayerFromOwner(label), 65);
  delete owner.__liaDgsLayer;
  assert.equal(getExplicitDgsLayerFromOwner(border), null);
  owner.__liaDgsRenderedLayer = null;
  assert.equal(getRenderedDgsLayerFromOwner(label), null);
});

test('DGS ranks use the same source-major renderer slots as automatic macro ranks', () => {
  assert.equal(getDgsRenderedLayer(0, 'body'), getMacroRenderedLayer(0, 'body'));
  assert.equal(getDgsRenderedLayer(20, 'body'), getMacroRenderedLayer(20, 'body'));
  assert.equal(getDgsRenderedLayer(20, 'handle'), getMacroRenderedLayer(20, 'handle'));
  assert.equal(getDgsRenderedLayer(20, 'annotation'), getMacroRenderedLayer(20, 'annotation'));
});

test('source order outranks all renderer roles of an earlier macro', () => {
  const roles = ['body', 'hit', 'handle', 'annotation'];
  for (let sourceLayer = 0; sourceLayer < 20; sourceLayer += 1) {
    const currentMaximum = Math.max(...roles.map((role) =>
      getMacroRenderedLayer(sourceLayer, role)
    ));
    const nextMinimum = Math.min(...roles.map((role) =>
      getMacroRenderedLayer(sourceLayer + 1, role)
    ));
    assert.ok(
      currentMaximum < nextMinimum,
      `source layer ${sourceLayer + 1} must be completely above ${sourceLayer}`
    );
  }
});

test('Schar drag frames recalculate both curves before repainting the board', () => {
  const calls = [];
  const graph = {
    needsUpdate: false,
    updateCurve() { calls.push('graph'); }
  };
  const dragGraph = {
    needsUpdate: false,
    updateCurve() { calls.push('dragGraph'); }
  };
  const graphLabel = { needsUpdate: false };
  const board = { update() { calls.push('board'); } };

  refreshScharCurveGeometry({ graph, dragGraph, graphLabel, board });

  assert.deepEqual(calls, ['graph', 'dragGraph', 'board']);
  assert.equal(graph.needsUpdate, true);
  assert.equal(dragGraph.needsUpdate, true);
  assert.equal(graphLabel.needsUpdate, true);
});

test('Schar drag values update the visible term before pointerup', async () => {
  const entry = {
    boardId: 'board-a',
    board: {},
    cfg: {
      showTerm: true,
      showName: true,
      name: 'f',
      variableName: 'x'
    },
    values: { m: 1, n: 0 },
    linearMN: { m: 'm', n: 'n' },
    polyCoeffDrag: null,
    termVisible: true,
    panelMinimized: false,
    termEl: { innerHTML: '', textContent: '', style: {} },
    termToggleWrapEl: { style: {} },
    termToggleEl: { checked: false },
    termMarkup: '',
    pendingTermMarkup: null,
    termTypesetRunning: false
  };

  assert.match(buildScharTermMarkup(entry), /1 \\cdot x/);
  refreshScharTerm(entry);
  assert.match(entry.termEl.innerHTML, /1 \\cdot x/);

  entry.values.n = 2;
  refreshScharTerm(entry);
  await Promise.resolve();
  await Promise.resolve();

  assert.match(entry.termEl.innerHTML, /1 \\cdot x \+ 2/);
  assert.equal(entry.termToggleEl.checked, true);
});

test('Schar term updates and hiding serialize MathJax DOM mutations', async () => {
  const previousWindow = globalThis.window;
  const typesets = [];
  const clears = [];
  let html = '';
  const termEl = {
    style: {},
    get innerHTML() { return html; },
    set innerHTML(value) { html = String(value); },
    get textContent() { return html; },
    set textContent(value) { html = String(value); }
  };
  globalThis.window = {
    MathJax: {
      typesetClear(nodes) { clears.push([...nodes]); },
      typesetPromise(nodes) {
        let resolve;
        const promise = new Promise((done) => { resolve = done; });
        typesets.push({ markup: nodes[0].innerHTML, resolve });
        return promise;
      }
    }
  };
  const entry = {
    boardId: 'board-a', board: {},
    cfg: { showTerm: true, showName: true, name: 'f', variableName: 'x' },
    values: { m: 1, n: 0 }, linearMN: { m: 'm', n: 'n' }, polyCoeffDrag: null,
    termVisible: true, panelMinimized: false, termEl,
    termToggleWrapEl: { style: {} }, termToggleEl: { checked: false },
    termMarkup: '', pendingTermMarkup: null, termTypesetRunning: false
  };
  const drainMicrotasks = async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  };

  try {
    refreshScharTerm(entry);
    entry.values.n = 1;
    refreshScharTerm(entry);
    entry.values.n = 2;
    refreshScharTerm(entry);
    assert.equal(typesets.length, 1);
    assert.doesNotMatch(termEl.innerHTML, /\+ 2/);

    typesets[0].resolve();
    await drainMicrotasks();
    assert.equal(typesets.length, 2);
    assert.match(termEl.innerHTML, /\+ 2/);
    assert.equal(clears.length, 2);

    typesets[1].resolve();
    await drainMicrotasks();
    entry.values.n = 3;
    refreshScharTerm(entry);
    assert.equal(typesets.length, 3);
    entry.termVisible = false;
    refreshScharTerm(entry);
    assert.equal(entry.termEl.style.display, 'none');
    assert.match(termEl.innerHTML, /\+ 3/);

    typesets[2].resolve();
    await drainMicrotasks();
    assert.equal(termEl.innerHTML, '');
    assert.equal(entry.termMarkup, '');
    assert.equal(entry.termTypesetRunning, false);
    assert.equal(clears.length, 4);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('a hidden static point has zero opacity in its first creation attributes', () => {
  const attributes = getStaticPointCreationAttributes({
    color: '#ff00ff',
    opacity: 0,
    hasExplicitColor: true
  }, '#ffffff');

  assert.equal(attributes.strokeColor, '#ff00ff');
  [
    'strokeOpacity',
    'fillOpacity',
    'highlightStrokeOpacity',
    'highlightFillOpacity'
  ].forEach((property) => assert.equal(attributes[property], 0));
  assert.equal(attributes.label.strokeColor, '#ff00ff');
  [
    'strokeOpacity',
    'fillOpacity',
    'highlightStrokeOpacity',
    'highlightFillOpacity'
  ].forEach((property) => assert.equal(attributes.label[property], 0));
});

test('static point creation preserves partial opacity and neutral label color', () => {
  const attributes = getStaticPointCreationAttributes({
    color: '#123456',
    opacity: 0.65,
    hasExplicitColor: false
  }, '#eeeeee');

  assert.equal(attributes.strokeOpacity, 0.65);
  assert.equal(attributes.highlightFillOpacity, 0.65);
  assert.equal(attributes.label.strokeColor, '#eeeeee');
  assert.equal(attributes.label.fillOpacity, 0.65);
});

test('ordinary interactive points keep their fully visible default creation style', () => {
  const attributes = getStaticPointCreationAttributes(null, '#eeeeee');
  assert.equal(attributes.strokeColor, '#ff00ff');
  assert.equal(attributes.strokeOpacity, 1);
  assert.equal(attributes.label.fillOpacity, 1);
});

test('coordinate helper points are fixed for dragging but follow board pan and zoom', () => {
  let creation = null;
  const point = {};
  const board = {
    create(type, parents, attributes) {
      creation = { type, parents, attributes };
      return point;
    }
  };

  const result = createHiddenPoint(board, { x: 2, y: -3 });

  assert.equal(result, point);
  assert.equal(creation.type, 'point');
  assert.deepEqual(creation.parents, [2, -3]);
  assert.equal(creation.attributes.fixed, true);
  assert.equal(creation.attributes.frozen, false);
  assert.equal(creation.attributes.visible, false);
  assert.equal(point.__liaDgsHelperPoint, true);
});

function marker(id, spec, dataset = {}) {
  return {
    id,
    dataset: {
      spec,
      ...dataset
    }
  };
}

function fakeRoot(nodes) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '[id][data-spec]');
      return nodes;
    }
  };
}

function fakeBoard() {
  const layerCalls = [];
  const containerObj = {
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    children: [],
    appendChild(node) {
      node.parentNode = this;
      if (!this.children.includes(node)) this.children.push(node);
      return node;
    }
  };
  return {
    layerCalls,
    containerObj,
    fullUpdateCalls: 0,
    updateCalls: 0,
    renderer: {
      setLayer(object, layer) {
        layerCalls.push({ object, layer });
      }
    },
    fullUpdate() {
      this.fullUpdateCalls += 1;
    },
    update() {
      this.updateCalls += 1;
    }
  };
}

function fakeObject(board, initial = {}) {
  const object = {
    board,
    attributes: {},
    visProp: {},
    visPropCalc: {},
    setAttribute(attributes) {
      Object.assign(this.attributes, attributes);
      Object.assign(this.visProp, attributes);
      Object.assign(this.visPropCalc, attributes);
    },
    getAttribute(name) {
      return this.attributes[name];
    }
  };
  return Object.assign(object, initial);
}

function fakeHtmlText(board) {
  const rendNode = {
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    parentNode: board.containerObj,
    style: {}
  };
  return fakeObject(board, {
    elType: 'text',
    rendNode,
    visProp: { display: 'html' },
    visPropCalc: { display: 'html' }
  });
}

function attachFakeSvgLayers(board, count = MACRO_RENDER_LAYER_COUNT) {
  const layers = Array.from({ length: count }, () => ({ namespaceURI: 'http://www.w3.org/2000/svg' }));
  board.renderer.layer = layers;
  board.renderer.setLayer = function(object, layer) {
    this.layer[layer].appendChild
      ? this.layer[layer].appendChild(object.rendNode)
      : (object.rendNode.parentNode = this.layer[layer]);
    board.layerCalls.push({ object, layer });
  };
  return layers;
}

function distanceEntry(uid, boardId, board, overrides = {}) {
  const segment = fakeObject(board);
  return {
    key: 'distance-' + uid,
    entry: {
      uid,
      boardId,
      board,
      segments: [segment],
      segment,
      capSegments: [],
      capPoints: [],
      ownedPoints: [],
      label: null,
      ...overrides
    },
    segment
  };
}

function linearEntry(uid, boardId, board, overrides = {}) {
  const object = fakeObject(board);
  return {
    key: 'linear-' + uid,
    entry: {
      uid,
      boardId,
      board,
      object,
      ownedPoints: [],
      label: null,
      ...overrides
    },
    object
  };
}

function scharEntry(uid, boardId, board, overrides = {}) {
  const graph = fakeObject(board);
  return {
    key: 'schar-' + uid,
    entry: {
      uid,
      boardId,
      board,
      graph,
      dragGraph: null,
      graphLabel: null,
      ...overrides
    },
    graph
  };
}

function expectLayer(object, expected, role = 'body') {
  const rendered = getMacroRenderedLayer(expected, role);
  assert.equal(object.__liaMacroSourceLayer, expected);
  assert.equal(object.__liaMacroRenderedLayer, rendered);
  assert.equal(object.__liaMacroLayerRole, role);
  assert.equal(object.__liaDgsLayer, undefined);
  assert.equal(object.attributes.layer, undefined);
  assert.equal(object.visProp.layer, rendered);
  assert.equal(object.visPropCalc.layer, rendered);
  assert.ok(
    object.board.layerCalls.some((call) => call.object === object && call.layer === rendered),
    'renderer.setLayer should receive the assigned layer'
  );
}

function expectHtmlLayer(object, expected) {
  const rendered = getMacroRenderedLayer(expected, 'annotation');
  assert.equal(object.__liaMacroSourceLayer, expected);
  assert.equal(object.__liaMacroRenderedLayer, rendered);
  assert.equal(object.__liaMacroLayerRole, 'annotation');
  assert.equal(object.attributes.layer, undefined);
  assert.equal(object.visProp.layer, undefined);
  assert.equal(object.visPropCalc.layer, undefined);
  assert.equal(object.rendNode.style.zIndex, String(getMacroHtmlZIndex(expected)));
  assert.equal(object.rendNode.parentNode, object.board.containerObj);
  assert.equal(
    object.board.layerCalls.some((call) => call.object === object),
    false,
    'HTML text must never be moved into an SVG renderer layer'
  );
}

test('two distance macros receive zero-based layers in source order', () => {
  const board = fakeBoard();
  const first = distanceEntry('first', 'board-a', board);
  const second = distanceEntry('second', 'board-a', board);
  const registries = {
    __distanceEntries: {
      [second.key]: second.entry,
      [first.key]: first.entry
    }
  };

  applyMacroCodeOrderLayers(fakeRoot([
    marker('distance-spec-first', 'board-a;[[-2;0];[2;0]]'),
    marker('distance-spec-second', 'board-a;[[0;-2];[0;2]]')
  ]), registries);

  expectLayer(first.segment, 0);
  expectLayer(second.segment, 1);
});

test('mixed macro types use DOM order, reversed UIDs, and board-local counters', () => {
  const boardA = fakeBoard();
  const boardB = fakeBoard();
  const firstA = distanceEntry('z-first', 'board-a', boardA);
  const onlyB = distanceEntry('a-other-board', 'board-b', boardB);
  const secondA = linearEntry('y-second', 'board-a', boardA);
  const thirdA = distanceEntry('b-third', 'board-a', boardA);
  const registries = {
    __linearObjectEntries: {
      [secondA.key]: secondA.entry
    },
    __distanceEntries: {
      [thirdA.key]: thirdA.entry,
      [onlyB.key]: onlyB.entry,
      [firstA.key]: firstA.entry
    }
  };

  applyMacroCodeOrderLayers(fakeRoot([
    marker('distance-spec-z-first', 'board-a;[[-2;0];[2;0]]'),
    marker('distance-spec-a-other-board', 'board-b;[[-2;1];[2;1]]'),
    marker('linear-spec-y-second', 'board-a;[[-2;-2];[2;2]]', { kind: 'line' }),
    marker('distance-spec-b-third', 'board-a;[[0;-2];[0;2]]')
  ]), registries);

  expectLayer(firstA.segment, 0);
  expectLayer(onlyB.segment, 0);
  expectLayer(secondA.object, 1);
  expectLayer(thirdA.segment, 2);
});

test('a Schar macro resolves its fourth-field board id and reserves the first board-local layer', () => {
  const board = fakeBoard();
  const dragGraph = fakeObject(board);
  const graphLabel = fakeHtmlText(board);
  const schar = scharEntry('family', 'board-a', board, { dragGraph, graphLabel });
  const distance = distanceEntry('after-family', 'board-a', board);
  const registries = {
    __boards: { 'board-a': board },
    __scharEntries: { [schar.key]: schar.entry },
    __distanceEntries: { [distance.key]: distance.entry }
  };

  applyMacroCodeOrderLayers(fakeRoot([
    marker('schar-spec-family', 'f;x;mx+n;board-a;term=1;#00ffff'),
    marker('distance-spec-after-family', 'board-a;[[-2;0];[2;0]]')
  ]), registries);

  expectLayer(schar.graph, 0);
  expectLayer(dragGraph, 0, 'hit');
  expectHtmlLayer(graphLabel, 0);
  expectLayer(distance.segment, 1);
});

test('graph quiz macros reserve source layers and layer their late JSXGraph objects', () => {
  const board = fakeBoard();
  const point = fakeObject(board, { elType: 'point' });
  point.label = fakeHtmlText(board);
  const graph = fakeObject(board);
  const anchor = fakeObject(board, { elType: 'point' });
  const text = fakeHtmlText(board);
  const multiPoint = fakeObject(board, { elType: 'point' });
  const multiGraph = fakeObject(board);
  const multiAnchor = fakeObject(board, { elType: 'point' });
  const multiText = fakeHtmlText(board);
  const distance = distanceEntry('after-quiz', 'board-a', board);
  const graphKey = 'A||f||x';
  const multiGraphKey = 'B||1||g||x+1';
  const registries = {
    __boards: { 'board-a': board },
    __points: { 'board-a': { A: point, B_1: multiPoint } },
    __pointGraphs: {
      'board-a': {
        [graphKey]: { graph, anchor, text },
        [multiGraphKey]: { graph: multiGraph, anchor: multiAnchor, text: multiText }
      }
    },
    __pointOnGraphLayerEntries: {
      quiz: { boardId: 'board-a', names: ['A'], graphKey }
    },
    __pointsOnGraphLayerEntries: {
      multi: { boardId: 'board-a', names: ['B_1'], graphKey: multiGraphKey }
    },
    __distanceEntries: { [distance.key]: distance.entry }
  };

  applyMacroCodeOrderLayers(fakeRoot([
    marker('graph-ui-quiz', 'board-a;A;f;x'),
    marker('multi-graph-ui-multi', 'board-a;1;0;B;g;x+1'),
    marker('distance-spec-after-quiz', 'board-a;[[-2;0];[2;0]]')
  ]), registries);

  expectLayer(point, 0, 'handle');
  expectHtmlLayer(point.label, 0);
  expectLayer(graph, 0);
  assert.equal(anchor.__liaMacroSourceLayer, undefined);
  expectHtmlLayer(text, 0);
  expectLayer(multiPoint, 1, 'handle');
  expectLayer(multiGraph, 1);
  assert.equal(multiAnchor.__liaMacroSourceLayer, undefined);
  expectHtmlLayer(multiText, 1);
  expectLayer(distance.segment, 2);
});

test('source-local handles and HTML measurements do not override later macro geometry', () => {
  const board = fakeBoard();
  const point = fakeObject(board, {
    elType: 'point',
    __liaDgsMacroKey: 'macro:point:vertex'
  });
  point.label = fakeHtmlText(board);
  point.label.rendNode.parentNode = { namespaceURI: 'http://www.w3.org/2000/svg' };

  const polygon = fakeObject(board, { elType: 'polygon' });
  const areaLabel = fakeHtmlText(board);
  polygon.label = areaLabel;
  const angle = fakeObject(board, { elType: 'angle' });
  const hiddenAngleHelper = fakeObject(board, { elType: 'arc' });
  const angleDot = fakeObject(board, { elType: 'point' });
  angle.arc = hiddenAngleHelper;
  angle.dot = angleDot;
  const angleLabel = fakeHtmlText(board);
  angle.label = angleLabel;
  const coordText = fakeHtmlText(board);

  applyMacroCodeOrderLayers(fakeRoot([
    marker('point-spec-vertex', 'board-a;A;[0;0]'),
    marker('area-spec-triangle', 'board-a;[A;B;C]'),
    marker('angle-spec-alpha', 'board-a;[A;B;C]'),
    marker('coord-text-spec-caption', 'board-a;[0;0];Text')
  ]), {
    __boards: { 'board-a': board },
    __points: { 'board-a': { A: point } },
    __areaEntries: {
      'area-triangle': { uid: 'triangle', boardId: 'board-a', board, polygon, ownedPoints: [], label: areaLabel }
    },
    __angleEntries: {
      'angle-alpha': { uid: 'alpha', boardId: 'board-a', board, angle, label: angleLabel }
    },
    __coordTextEntries: {
      'coord-text-caption': { uid: 'caption', boardId: 'board-a', board, text: coordText }
    }
  });

  expectLayer(point, 0, 'handle');
  expectHtmlLayer(point.label, 0);
  expectLayer(polygon, 1);
  expectHtmlLayer(areaLabel, 1);
  expectLayer(angle, 2);
  expectLayer(angleDot, 2, 'body');
  assert.equal(hiddenAngleHelper.__liaMacroSourceLayer, undefined);
  expectHtmlLayer(angleLabel, 2);
  expectHtmlLayer(coordText, 3);
  assert.ok(point.__liaMacroRenderedLayer < polygon.__liaMacroRenderedLayer);
});

test('HTML text layering is idempotent and never triggers a second board update', () => {
  const board = fakeBoard();
  const text = fakeHtmlText(board);
  const root = fakeRoot([marker('coord-text-spec-stable', 'board-a;[0;0];Text')]);
  const registries = {
    __boards: { 'board-a': board },
    __coordTextEntries: {
      'coord-text-stable': { uid: 'stable', boardId: 'board-a', board, text }
    }
  };

  const first = applyMacroCodeOrderLayers(root, registries);
  const second = applyMacroCodeOrderLayers(root, registries);

  assert.equal(first.appliedObjects, 1);
  assert.equal(first.pendingObjects, 0);
  assert.equal(second.appliedObjects, 0);
  assert.equal(second.pendingObjects, 0);
  assert.equal(board.fullUpdateCalls, 1);
  expectHtmlLayer(text, 0);
});

test('internal SVG text uses the annotation renderer band', () => {
  const board = fakeBoard();
  const layers = attachFakeSvgLayers(board);
  const text = fakeObject(board, {
    elType: 'text',
    rendNode: {
      namespaceURI: 'http://www.w3.org/2000/svg',
      parentNode: layers[9]
    },
    visProp: { display: 'internal', layer: 9 },
    visPropCalc: { display: 'internal', layer: 9 }
  });

  const result = applyMacroCodeOrderLayers(
    fakeRoot([marker('coord-text-spec-internal', 'board-a;[0;0];Text')]),
    {
      __boards: { 'board-a': board },
      __coordTextEntries: {
        'coord-text-internal': { uid: 'internal', boardId: 'board-a', board, text }
      }
    }
  );

  assert.equal(result.pendingObjects, 0);
  expectLayer(text, 0, 'annotation');
  assert.equal(text.rendNode.parentNode, layers[getMacroRenderedLayer(0, 'annotation')]);
});

test('a failed SVG layer move stays pending and succeeds on the next pass', () => {
  const board = fakeBoard();
  const layers = attachFakeSvgLayers(board);
  const distance = distanceEntry('retry', 'board-a', board);
  distance.segment.rendNode = {
    namespaceURI: 'http://www.w3.org/2000/svg',
    parentNode: layers[7]
  };
  let shouldFail = true;
  let attempts = 0;
  board.renderer.setLayer = function(object, layer) {
    attempts += 1;
    if (shouldFail) throw new Error('renderer not ready');
    object.rendNode.parentNode = this.layer[layer];
    board.layerCalls.push({ object, layer });
  };
  const root = fakeRoot([marker('distance-spec-retry', 'board-a;[[0;0];[1;1]]')]);
  const registries = {
    __boards: { 'board-a': board },
    __distanceEntries: { [distance.key]: distance.entry }
  };

  const first = applyMacroCodeOrderLayers(root, registries);
  assert.equal(first.pendingObjects, 1);
  assert.equal(first.appliedObjects, 0);
  assert.equal(distance.segment.visProp.layer, undefined);
  assert.equal(distance.segment.__liaMacroLayerPending, true);

  shouldFail = false;
  const second = applyMacroCodeOrderLayers(root, registries);
  assert.equal(second.pendingObjects, 0);
  assert.equal(second.appliedObjects, 1);
  assert.equal(attempts, 2);
  expectLayer(distance.segment, 0);
});

test('a later macro keeps its DOM-derived layer when it is created before an earlier dependency', () => {
  const board = fakeBoard();
  const first = distanceEntry('first-pending', 'board-a', board);
  const second = distanceEntry('second-ready', 'board-a', board);
  const entries = {
    [second.key]: second.entry
  };
  const root = fakeRoot([
    marker('distance-spec-first-pending', 'board-a;[A;B]'),
    marker('distance-spec-second-ready', 'board-a;[[-2;0];[2;0]]')
  ]);
  const registries = { __distanceEntries: entries };

  applyMacroCodeOrderLayers(root, registries);
  expectLayer(second.segment, 1);

  entries[first.key] = first.entry;
  applyMacroCodeOrderLayers(root, registries);

  expectLayer(first.segment, 0);
  expectLayer(second.segment, 1);
});

test('a composite macro layers visible parts but leaves internal points untouched', () => {
  const board = fakeBoard();
  const first = distanceEntry('plain', 'board-a', board);
  const segmentA = fakeObject(board);
  const segmentB = fakeObject(board);
  const capSegment = fakeObject(board);
  const capPointA = fakeObject(board, { elType: 'point' });
  const capPointB = fakeObject(board, { elType: 'point' });
  const ownedPoint = fakeObject(board, { elType: 'point' });
  const label = fakeHtmlText(board);
  segmentA.label = label;
  segmentA.__liaDgsStyleCapSegments = [capSegment];
  segmentA.__liaDgsStyleCapPoints = [capPointA, capPointB];
  const composite = distanceEntry('composite', 'board-a', board, {
    segments: [segmentA, segmentB],
    segment: segmentA,
    capSegments: [capSegment],
    capPoints: [capPointA, capPointB],
    ownedPoints: [ownedPoint],
    label
  });
  const registries = {
    __distanceEntries: {
      [composite.key]: composite.entry,
      [first.key]: first.entry
    }
  };

  applyMacroCodeOrderLayers(fakeRoot([
    marker('distance-spec-plain', 'board-a;[[-2;0];[2;0]]'),
    marker('distance-spec-composite', 'board-a;[[-2;1];[0;2];[2;1]]')
  ]), registries);

  [segmentA, segmentB, capSegment].forEach((object) => expectLayer(object, 1));
  [capPointA, capPointB, ownedPoint].forEach((object) => {
    assert.equal(object.__liaMacroSourceLayer, undefined);
    assert.equal(object.visProp.layer, undefined);
  });
  expectHtmlLayer(label, 1);
});

test('a finite DGS layer override is preserved', () => {
  const board = fakeBoard();
  const segment = fakeObject(board, { __liaDgsLayer: 7 });
  const capSegment = fakeObject(board);
  const capPoint = fakeObject(board);
  const label = fakeObject(board);
  segment.label = label;
  segment.__liaDgsStyleCapSegments = [capSegment];
  segment.__liaDgsStyleCapPoints = [capPoint];
  const parts = [segment, capSegment, capPoint, label];
  parts.forEach((object) => object.setAttribute({ layer: 7 }));
  const distance = distanceEntry('manual', 'board-a', board, {
    segments: [segment],
    segment,
    capSegments: [capSegment],
    capPoints: [capPoint],
    label
  });

  applyMacroCodeOrderLayers(fakeRoot([
    marker('distance-spec-manual', 'board-a;[[-2;0];[2;0]]')
  ]), {
    __distanceEntries: { [distance.key]: distance.entry }
  });

  parts.forEach((object) => {
    assert.equal(object.__liaMacroSourceLayer, undefined);
    assert.equal(object.attributes.layer, 7);
    assert.equal(object.visProp.layer, 7);
    assert.equal(object.visPropCalc.layer, 7);
  });
  assert.equal(segment.__liaDgsLayer, 7);
  [capSegment, capPoint, label].forEach((object) => {
    assert.equal(object.__liaDgsLayer, undefined);
  });
  assert.equal(board.layerCalls.length, 0);
});

test('reapplying unchanged source layers is idempotent', () => {
  const board = fakeBoard();
  const distance = distanceEntry('stable', 'board-a', board);
  const root = fakeRoot([
    marker('distance-spec-stable', 'board-a;[[-2;0];[2;0]]')
  ]);
  const registries = {
    __boards: { 'board-a': board },
    __distanceEntries: { [distance.key]: distance.entry }
  };

  const firstResult = applyMacroCodeOrderLayers(root, registries);
  assert.equal(firstResult.assignments, 1);
  assert.equal(firstResult.appliedObjects, 1);
  assert.equal(firstResult.pendingMarkers, 0);
  assert.equal(board.layerCalls.length, 1);
  assert.equal(board.fullUpdateCalls, 1);
  assert.equal(board.updateCalls, 0);

  const secondResult = applyMacroCodeOrderLayers(root, registries);
  assert.equal(secondResult.assignments, 1);
  assert.equal(secondResult.appliedObjects, 0);
  assert.equal(secondResult.pendingMarkers, 0);
  assert.equal(board.layerCalls.length, 1);
  assert.equal(board.fullUpdateCalls, 1);
  assert.equal(board.updateCalls, 0);
  assert.equal(distance.segment.__liaMacroSourceLayer, 0);
});

test('the scheduler performs a settle-frame pass after a macro replaces its registry object', () => {
  const board = fakeBoard();
  const oldDistance = distanceEntry('live', 'board-a', board);
  const newDistance = distanceEntry('live', 'board-a', board);
  const entries = { [oldDistance.key]: oldDistance.entry };
  const frames = [];
  let frameId = 0;
  const registries = {
    __boards: { 'board-a': board },
    __distanceEntries: entries,
    requestAnimationFrame(callback) {
      frames.push(callback);
      frameId += 1;
      return frameId;
    }
  };

  scheduleMacroCodeOrderLayers(fakeRoot([
    marker('distance-spec-live', 'board-a;[[-2;0];[2;0]]')
  ]), registries);
  frames.push(() => { entries[oldDistance.key] = newDistance.entry; });

  while (frames.length) frames.shift()();

  expectLayer(oldDistance.segment, 0);
  expectLayer(newDistance.segment, 0);
});

test('JSXGraph is configured with enough renderer groups for all role bands', () => {
  const root = { JXG: { Options: { layer: { numlayers: 20 } } } };
  assert.equal(ensureMacroLayerCapacity(root), MACRO_RENDER_LAYER_COUNT);
  assert.equal(root.JXG.Options.layer.numlayers, MACRO_RENDER_LAYER_COUNT);

  root.JXG.Options.layer.numlayers = MACRO_RENDER_LAYER_COUNT + 10;
  assert.equal(ensureMacroLayerCapacity(root), MACRO_RENDER_LAYER_COUNT + 10);
});

test('existing SVG boards receive missing renderer groups in source order', () => {
  const children = [];
  const svgRoot = {
    ownerDocument: null,
    appendChild(node) {
      node.parentNode = this;
      children.push(node);
      return node;
    },
    insertBefore(node, before) {
      node.parentNode = this;
      const index = children.indexOf(before);
      children.splice(index < 0 ? children.length : index, 0, node);
      return node;
    }
  };
  const documentRoot = {
    createElementNS(namespaceURI, tagName) {
      return { namespaceURI, tagName, parentNode: null };
    }
  };
  svgRoot.ownerDocument = documentRoot;
  const layers = [];
  for (let index = 0; index < 20; index += 1) {
    const group = documentRoot.createElementNS('http://www.w3.org/2000/svg', 'g');
    layers.push(group);
    svgRoot.appendChild(group);
  }
  const foreignObjLayer = documentRoot.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  svgRoot.appendChild(foreignObjLayer);
  const board = {
    renderer: {
      type: 'svg',
      layer: layers,
      svgRoot,
      foreignObjLayer,
      svgNamespace: 'http://www.w3.org/2000/svg',
      container: { ownerDocument: documentRoot }
    }
  };

  assert.equal(ensureBoardRendererLayerCapacity(board), MACRO_RENDER_LAYER_COUNT);
  assert.equal(layers.length, MACRO_RENDER_LAYER_COUNT);
  assert.ok(layers.every((group) => group.parentNode === svgRoot));
  assert.equal(children.at(-1), foreignObjLayer);
});

test('objects from a stale board instance are not relayered', () => {
  const currentBoard = fakeBoard();
  const staleBoard = fakeBoard();
  const staleDistance = distanceEntry('stale', 'board-a', staleBoard);
  const result = applyMacroCodeOrderLayers(fakeRoot([
    marker('distance-spec-stale', 'board-a;[[-2;0];[2;0]]')
  ]), {
    __boards: { 'board-a': currentBoard },
    __distanceEntries: { [staleDistance.key]: staleDistance.entry }
  });

  assert.equal(result.assignments, 1);
  assert.equal(result.appliedObjects, 0);
  assert.equal(staleDistance.segment.__liaMacroSourceLayer, undefined);
  assert.equal(staleDistance.segment.attributes.layer, undefined);
  assert.equal(staleBoard.layerCalls.length, 0);
  assert.equal(staleBoard.fullUpdateCalls, 0);
  assert.equal(currentBoard.layerCalls.length, 0);
  assert.equal(currentBoard.fullUpdateCalls, 0);
});

test('axis-title and other non-drawable anchors do not consume a layer', () => {
  const board = fakeBoard();
  const distance = distanceEntry('visible', 'board-a', board);

  applyMacroCodeOrderLayers(fakeRoot([
    marker('axis-title-spec-title', 'id=board-a;xlabel=x;ylabel=y'),
    marker('dgs-ui-tools', 'board-a'),
    marker('distance-spec-visible', 'board-a;[[-2;0];[2;0]]')
  ]), {
    __distanceEntries: { [distance.key]: distance.entry }
  });

  expectLayer(distance.segment, 0);
});

test('automatic layers are clamped to the DGS maximum of 20', () => {
  const board = fakeBoard();
  const nodes = [];
  const entries = {};
  const segments = [];

  for (let index = 0; index < 22; index += 1) {
    const uid = 'item-' + String(index).padStart(2, '0');
    const distance = distanceEntry(uid, 'board-a', board);
    nodes.push(marker('distance-spec-' + uid, 'board-a;[[' + index + ';0];[' + index + ';1]]'));
    entries[distance.key] = distance.entry;
    segments.push(distance.segment);
  }

  applyMacroCodeOrderLayers(fakeRoot(nodes), { __distanceEntries: entries });

  segments.forEach((segment, index) => {
    expectLayer(segment, Math.min(index, 20));
  });
});
