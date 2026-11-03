import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function implementation(path, names) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const selected = tree.statements.filter(node => names.some(name =>
    node.name?.text === name || node.getText(tree).startsWith('window.' + name + ' =')));
  assert.equal(selected.length, names.length);
  return ts.transpileModule(selected.map(node => node.getText(tree)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
  }).outputText;
}
const drawing = implementation('../src/subsystems/regression.ts', [
  'strokeDistanceSq', 'readDgsSegmentEndpoint', 'findRecognizableDgsSegmentStroke',
  'localToUser', 'userToLocal', 'closestPointOnDrawSegment', 'pointStrictlyInsideTriangle',
  'constrainDrawPointToSetSquare', 'firstSetSquareBoundaryIntersection', 'findSegmentIntersection',
  'orientation', 'pointOnSegment', 'convertSetSquareStrokeToSegment', 'bindDrawLayer'
]);

function fixture(vertices = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 100 }]) {
  const segments = [];
  const state = {
    boardId: 'test', board: { origin: { scrCoords: [1, 25, 40] }, unitX: 30, unitY: 70 },
    drawLayer: { setPointerCapture() {} }, activeTool: 'draw', drawColor: '#0055ff',
    strokes: [], undoActions: [], redoActions: [], pointerId: null, drawing: false
  };
  const context = vm.createContext({
    window: { __createDgsDrawnSegment: (...args) => {
      segments.push(args);
      state.undoActions.push({ type: 'dgs' });
      return true;
    } },
    visibleSetSquareVertices: () => vertices,
    getDrawPos: (_, evt) => ({ x: evt.clientX, y: evt.clientY }),
    redrawCanvas() {}, updateButtonStates() {},
    findStrokesIntersection: () => ({ intersects: false })
  });
  vm.runInContext(drawing, context);
  context.bindDrawLayer(state);
  const event = (type, x, y, overrides = {}) => state.drawLayer['on' + type]({
    type, clientX: x, clientY: y, pointerId: 1, pointerType: 'pen', button: 0,
    preventDefault() {}, stopPropagation() {}, ...overrides
  });
  return { state, segments, event, context };
}

for (const [name, vertices, from, to] of [
  ['horizontal', undefined, [30, -5], [170, -5]],
  ['vertical', [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 100, y: 100 }], [-5, 30], [-5, 170]],
  ['diagonal', [{ x: 0, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], [35, 30], [165, 160]]
]) {
  test(`${name} ruler stroke becomes one construction using the release endpoint`, () => {
    const f = fixture(vertices);
    f.event('pointerdown', ...from);
    const start = { ...f.state.currentStroke.points[0] };
    const expectedEnd = f.context.localToUser(f.state,
      f.context.constrainDrawPointToSetSquare(f.state, { x: to[0], y: to[1] }, 0).point);
    f.event('pointerup', ...to);
    assert.equal(f.segments.length, 1);
    assert.deepEqual({ ...f.segments[0][1] }, start);
    assert.deepEqual({ ...f.segments[0][2] }, { ...expectedEnd });
    assert.equal(f.segments[0][3], '#0055ff');
    assert.equal(f.segments[0][4], 3);
    assert.equal(f.state.strokes.length, 0);
    assert.deepEqual(f.state.undoActions, [{ type: 'dgs' }]);
    assert.equal(f.state.setSquareStrokeEdge, null);
  });
}

test('backtracking along a ruler uses the actual start and end, not the extrema', () => {
  const f = fixture();
  f.event('pointerdown', 30, -5);
  f.event('pointermove', 170, -5);
  f.event('pointerup', 100, -5);
  assert.equal(f.segments.length, 1);
  assert.equal(f.segments[0][2].x, (100 - 25) / 30);
});

for (const [name, points, endType, vertices] of [
  ['tap', [[30, -5], [30, -5]]],
  ['short stroke', [[30, -5], [34, -5]]],
  ['leaves and returns to edge', [[30, -5], [80, -45], [150, -5]]],
  ['turns a corner', [[30, -5], [190, -5], [190, 40], [165, 65]]],
  ['enters triangle', [[30, -5], [80, 40], [150, -5]]],
  ['approaches ruler from outside', [[30, -50], [80, -5], [150, -5]]],
  ['cancelled', [[30, -5], [150, -5]], 'pointercancel'],
  ['no ruler', [[30, -5], [150, -5]], 'pointerup', null]
]) {
  test(`${name} remains freehand`, () => {
    const f = fixture(vertices);
    f.event('pointerdown', ...points[0]);
    for (const point of points.slice(1)) f.event('pointermove', ...point);
    f.event(endType || 'pointerup', ...points.at(-1));
    assert.equal(f.segments.length, 0);
    assert.equal(f.state.strokes.length, 1);
    assert.equal(f.state.undoActions[0].type, 'add');
  });
}

test('another pointer cannot replace or finish an active stroke', () => {
  const f = fixture();
  f.event('pointerdown', 30, -5);
  f.event('pointerdown', 80, -5, { pointerId: 2 });
  f.event('pointerup', 100, -5, { pointerId: 2 });
  assert.equal(f.state.pointerId, 1);
  assert.equal(f.state.strokes.length, 1);
  f.event('pointerup', 150, -5);
  assert.equal(f.segments.length, 1);
});

test('failed construction retains the original stroke and normal undo', () => {
  const f = fixture();
  f.context.window.__createDgsDrawnSegment = () => false;
  f.event('pointerdown', 30, -5);
  f.event('pointerup', 150, -5);
  assert.equal(f.state.strokes.length, 1);
  assert.equal(f.state.undoActions[0].type, 'add');
});

test('drawing recognition samples a learner-created DGS segment as an isolated line', () => {
  const f = fixture();
  const endpoint = (x, y) => ({ X: () => x, Y: () => y });
  const drawable = {
    __liaDgsSegment: true,
    __liaDgsSegmentStrokeWidth: 5,
    point1: endpoint(-2, 1),
    point2: endpoint(4, 7)
  };
  const macro = { ...drawable, __liaDgsMacroManaged: true };
  const polygonSide = { ...drawable, __liaDgsPolygonBorder: true };
  f.state.board.objectsList = [drawable, macro, polygonSide];

  const localMiddle = f.context.userToLocal(f.state, { x: 1, y: 4 });
  const stroke = f.context.findRecognizableDgsSegmentStroke(f.state, localMiddle, 18);
  assert.deepEqual(stroke && {
    color: stroke.color,
    width: stroke.width,
    points: Array.from(stroke.points, point => ({ x: point.x, y: point.y }))
  }, {
    color: '',
    width: 5,
    points: [{ x: -2, y: 1 }, { x: 4, y: 7 }]
  });

  f.state.board.objectsList = [macro, polygonSide];
  assert.equal(f.context.findRecognizableDgsSegmentStroke(f.state, localMiddle, 18), null);
  f.state.board.objectsList = [{
    __liaDgsSegment: true,
    point1: endpoint(1, -2),
    point2: endpoint(1, 6)
  }];
  assert.equal(f.context.findRecognizableDgsSegmentStroke(f.state, localMiddle, 18), null);
});

const construction = implementation('../src/subsystems/dgs.ts', ['__createDgsDrawnSegment']);
for (const fail of [false, 'point', 'segment']) {
  test(`construction is atomic with ${fail || 'no'} creation failure`, () => {
    const objects = [];
    const history = [];
    const state = { boardId: 'test', restoring: false, board: {
      unitX: 50, unitY: 50, removeObject: object => objects.splice(objects.indexOf(object), 1)
    } };
    const window = { __points: { test: {} }, __pointStates: { test: {} } };
    const context = vm.createContext({
      window, getDgsStateForBoard: () => state, dgsPendingHistoryBefore: {},
      persistDgsConstruction: (_, recordHistory = true) => {
        if (!state.restoring && recordHistory) history.push(objects.slice());
      },
      getSelectableBoardPoints: () => [], readDgsPointPosition: () => null,
      createDgsPoint: (_, x, y) => {
        if (fail === 'point' && objects.length) return null;
        const point = { __liaDgsPointName: String(objects.length), x, y };
        objects.push(point);
        window.__points.test[point.__liaDgsPointName] = point;
        window.__pointStates.test[point.__liaDgsPointName] = { x, y };
        context.persistDgsConstruction();
        return point;
      },
      createDgsSegment: (_, a, b) => {
        if (fail === 'segment') return null;
        const segment = { a, b }; objects.push(segment); return segment;
      },
      setDgsObjectColor() {}, applyDgsStrokeStyle() {}, refreshDgsObjectList() {}
    });
    vm.runInContext(construction, context);
    const result = window.__createDgsDrawnSegment('test', { x: 1, y: 2 }, { x: 3, y: 2 }, '#0055ff', 3);
    assert.equal(result, !fail);
    assert.equal(state.restoring, false);
    assert.equal(objects.length, fail ? 0 : 3);
    assert.equal(history.length, fail ? 0 : 1);
    assert.equal(Object.keys(window.__points.test).length, fail ? 0 : 2);
    assert.equal(Object.keys(window.__pointStates.test).length, fail ? 0 : 2);
  });
}
