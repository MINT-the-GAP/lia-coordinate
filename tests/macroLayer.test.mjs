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
const {
  computeResizeBBox,
  getResponsiveResizeAnchor,
  syncBoardRendererSize
} = await import('../src/coord/boardHelpers.ts');
const {
  applyMacroCodeOrderLayers,
  ensureMacroLayerCapacity,
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

test('both coordinate-system initializers leave resizing to the template', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.equal((readme.match(/resize:\s*\{\s*enabled:\s*false\s*\}/g) || []).length, 2);
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
  return {
    layerCalls,
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

function expectLayer(object, expected) {
  assert.equal(object.__liaMacroSourceLayer, expected);
  assert.equal(object.__liaDgsLayer, undefined);
  assert.equal(object.attributes.layer, expected);
  assert.equal(object.visProp.layer, expected);
  assert.equal(object.visPropCalc.layer, expected);
  assert.ok(
    object.board.layerCalls.some((call) => call.object === object && call.layer === expected),
    'renderer.setLayer should receive the assigned layer'
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
  const schar = scharEntry('family', 'board-a', board);
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
  expectLayer(distance.segment, 1);
});

test('graph quiz macros reserve source layers and layer their late JSXGraph objects', () => {
  const board = fakeBoard();
  const point = fakeObject(board);
  point.label = fakeObject(board);
  const graph = fakeObject(board);
  const anchor = fakeObject(board);
  const text = fakeObject(board);
  const multiPoint = fakeObject(board);
  const multiGraph = fakeObject(board);
  const multiAnchor = fakeObject(board);
  const multiText = fakeObject(board);
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

  [point, point.label, graph, anchor, text].forEach((object) => expectLayer(object, 0));
  [multiPoint, multiGraph, multiAnchor, multiText].forEach((object) => expectLayer(object, 1));
  expectLayer(distance.segment, 2);
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

test('all objects belonging to one composite distance macro share its owner layer', () => {
  const board = fakeBoard();
  const first = distanceEntry('plain', 'board-a', board);
  const segmentA = fakeObject(board);
  const segmentB = fakeObject(board);
  const capSegment = fakeObject(board);
  const capPointA = fakeObject(board);
  const capPointB = fakeObject(board);
  const ownedPoint = fakeObject(board);
  const label = fakeObject(board);
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

  [segmentA, segmentB, capSegment, capPointA, capPointB, ownedPoint, label]
    .forEach((object) => expectLayer(object, 1));
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

test('JSXGraph is configured with enough renderer groups for layer 20', () => {
  const root = { JXG: { Options: { layer: { numlayers: 20 } } } };
  assert.equal(ensureMacroLayerCapacity(root), 21);
  assert.equal(root.JXG.Options.layer.numlayers, 21);

  root.JXG.Options.layer.numlayers = 30;
  assert.equal(ensureMacroLayerCapacity(root), 30);
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
