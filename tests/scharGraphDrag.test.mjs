import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/subsystems/schar.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('schar.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set([
  'decodeExprPlaceholders', 'toJsExpr', 'compileFamilyExpr', 'escapeRegExp',
  'eventToUser', 'detectShiftPair', 'detectShiftBC', 'detectShiftCD',
  'canDragScharGraph', 'bindGraphDrag', 'refreshScharCurveGeometry'
]);
const selected = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(selected.length, names.size, 'all graph drag helpers are tested from the current source');
const script = ts.transpileModule(selected.map((node) => node.getText(parsed)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText;

class Target {
  listeners = new Map();
  style = {};
  captured = new Set();
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) {
    const e = {
      button: 0, buttons: 1, isPrimary: true, pointerId: 7, cancelable: true,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...event, type: name, currentTarget: this
    };
    [...this.listeners.get(name) || []].forEach((callback) => callback(e));
    return e;
  }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  count(name) { return this.listeners.get(name)?.size || 0; }
}

function fixture(expr = 'a*(x-b)^2+c', { inner = 'b', outer = 'c', scale = 1 } = {}) {
  const target = new Target();
  const invisibleTarget = new Target();
  const win = new Target();
  let frameId = 0;
  const frames = new Map();
  const calls = [];
  const rect = { left: 45, top: -130, width: 604 * scale, height: 504 * scale };
  const classes = new Set();
  const container = {
    isConnected: true, offsetWidth: 604, offsetHeight: 504, clientLeft: 2, clientTop: 2,
    getBoundingClientRect: () => rect,
    classList: { contains: (name) => classes.has(name) }
  };
  const board = {
    containerObj: container, origin: { scrCoords: [1, 200, 250] }, unitX: 50, unitY: 50,
    __coordBorderEnabled: true, bbox: [-4, 5, 8, -5],
    update() { calls.push('board'); }
  };
  const params = ['a', inner, outer];
  const entry = {
    board, boardId: 'board', cfg: { expr, variableName: 'x' },
    values: { a: 0.5, [inner]: 0, [outer]: 0 }, params,
    graph: { rendNode: target, rendNodeStroke: target, updateCurve() { calls.push('visible'); } },
    dragGraph: { rendNode: invisibleTarget, updateCurve() { calls.push('hit'); } }
  };
  win.__boards = { board };
  win.__liaRegressionStates = {};
  win.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  const context = vm.createContext({
    window: win, exports: {},
    syncSliderUiFromValues: () => calls.push('sliders'),
    refreshScharTerm: () => calls.push('term'),
    persistScharEntryState: () => calls.push('persist')
  });
  vm.runInContext(script, context);
  const detector = inner === 'b' ? 'detectShiftBC' : 'detectShiftCD';
  entry[inner === 'b' ? 'shiftBC' : 'shiftCD'] = context[detector](entry.cfg, params);
  entry.fn = context.compileFamilyExpr(expr, 'x', params);
  context.bindGraphDrag(entry);
  const point = (x, y) => ({
    clientX: rect.left + (board.origin.scrCoords[1] + x * board.unitX + container.clientLeft) * scale,
    clientY: rect.top + (board.origin.scrCoords[2] - y * board.unitY + container.clientTop) * scale
  });
  return {
    entry, board, win, target, invisibleTarget, classes, frames, calls, rect, api: context, point,
    down: (x = 2, y = 2, overrides = {}) => target.emit('pointerdown', { ...point(x, y), ...overrides }),
    move: (x, y, overrides = {}) => win.emit('pointermove', { ...point(x, y), ...overrides }),
    up: (overrides = {}) => win.emit('pointerup', overrides),
    flush() { const queue = [...frames.values()]; frames.clear(); queue.forEach((callback) => callback()); }
  };
}

for (const inner of ['b', 'c']) {
  const outer = inner === 'b' ? 'c' : 'd';
  for (const innerSign of ['+', '-']) for (const outerSign of ['+', '-']) {
    const expr = `a*(x${innerSign}${inner})^2${outerSign}${outer}`;
    test(`${expr}: a stays fixed and a drag translates the same function model`, () => {
      const f = fixture(expr, { inner, outer });
      const before = { ...f.entry.values };
      const bbox = f.board.bbox.slice();
      const event = f.down();
      assert.equal(event.defaultPrevented, true);
      assert.equal(f.target.count('pointerdown'), 1, 'duplicate SVG aliases do not bind duplicate handlers');
      assert.equal(f.target.hasPointerCapture(7), true);
      f.move(2.25, 1.5);
      f.move(3, 0);
      assert.equal(f.frames.size, 1, 'multiple moves share a paint frame');
      f.up();
      assert.equal(f.entry.values.a, 0.5);
      assert.equal(f.entry.values[inner], innerSign === '+' ? -1 : 1);
      assert.equal(f.entry.values[outer], outerSign === '+' ? -2 : 2);
      for (const x of [-2, 0, 1, 3, 5]) {
        assert.equal(f.entry.fn(x, f.entry.values), f.entry.fn(x - 1, before) - 2);
      }
      assert.deepEqual(f.board.bbox, bbox);
      assert.deepEqual(f.calls, ['sliders', 'visible', 'hit', 'board', 'term', 'persist']);
      assert.equal(f.target.hasPointerCapture(7), false);
      assert.equal(f.win.count('pointermove'), 0);
      assert.equal(f.frames.size, 0);
    });
  }
}

test('the lecture parabola reaches S(1,-2) and P(3,0) under CSS scaling and scroll', () => {
  const f = fixture('a*(x-b)^2+c', { scale: 0.65 });
  f.down();
  f.rect.top -= 175;
  f.move(3, 0);
  f.up();
  assert.ok(Math.abs(f.entry.values.b - 1) < 1e-12);
  assert.ok(Math.abs(f.entry.values.c + 2) < 1e-12);
  assert.ok(Math.abs(f.entry.fn(1, f.entry.values) + 2) < 1e-12);
  assert.ok(Math.abs(f.entry.fn(3, f.entry.values)) < 1e-12);
});

test('legacy c/d sine and reciprocal families retain signed translation metadata', () => {
  const f = fixture();
  for (const expr of ['A*sin(b*(x+c))+d', 'A/(b*(x-c))-d']) {
    const hit = f.api.detectShiftCD({ expr, variableName: 'x' }, ['A', 'b', 'c', 'd']);
    assert.equal(hit.c, 'c');
    assert.equal(hit.d, 'd');
    assert.equal(hit.innerSign, expr.includes('(x+c)') ? 1 : -1);
    assert.equal(hit.outerSign, expr.endsWith('+d') ? 1 : -1);
  }
  assert.equal(f.api.detectShiftBC({ expr: 'a*(x-b)^2+b*x+c', variableName: 'x' }, ['a', 'b', 'c']), null);
});

test('secondary pointers, right clicks, border=0 and active tools do not start graph drags', () => {
  const f = fixture();
  for (const overrides of [{ button: 2 }, { isPrimary: false }]) {
    assert.equal(f.down(2, 2, overrides).defaultPrevented, undefined);
  }
  f.board.__coordBorderEnabled = false;
  assert.equal(f.down().defaultPrevented, undefined);
  f.board.__coordBorderEnabled = true;
  f.classes.add('lia-dgs-construction-mode');
  assert.equal(f.down().defaultPrevented, undefined);
  f.classes.clear();
  for (const activeTool of ['draw', 'erase', 'regression']) {
    f.win.__liaRegressionStates.other = { board: f.board, activeTool };
    assert.equal(f.down().defaultPrevented, undefined);
  }
  f.win.__liaRegressionStates = {};
  assert.equal(f.down().defaultPrevented, true, 'returning to normal mode restores dragging');
  f.up();
});

for (const termination of ['pointercancel', 'lostpointercapture', 'blur', 'dispose']) {
  test(`${termination} clears capture, frame and all active gesture listeners`, () => {
    const f = fixture();
    f.down();
    f.move(3, 0);
    assert.equal(f.frames.size, 1);
    if (termination === 'dispose') f.entry.stopDrag();
    else if (termination === 'lostpointercapture') f.target.emit(termination);
    else f.win.emit(termination);
    assert.equal(f.target.hasPointerCapture(7), false);
    assert.equal(f.target.count('lostpointercapture'), 0);
    for (const name of ['pointermove', 'pointerup', 'pointercancel', 'blur']) assert.equal(f.win.count(name), 0);
    assert.equal(f.frames.size, 0);
    const values = { ...f.entry.values };
    f.move(10, 10);
    assert.deepEqual(f.entry.values, values);
    if (termination === 'dispose') assert.equal(f.target.count('pointerdown'), 0);
    else {
      assert.equal(f.down().defaultPrevented, true);
      f.up();
    }
  });
}

test('releasing elsewhere on the window works and unrelated pointer IDs are ignored', () => {
  const f = fixture();
  f.down();
  f.move(8, 8, { pointerId: 8 });
  f.up({ pointerId: 8 });
  assert.deepEqual(f.entry.values, { a: 0.5, b: 0, c: 0 });
  assert.equal(f.target.hasPointerCapture(7), true);
  f.move(3, 0);
  f.up({ target: new Target() });
  assert.deepEqual(f.entry.values, { a: 0.5, b: 1, c: -2 });
  assert.equal(f.target.hasPointerCapture(7), false);
});

test('an invalid or removed board cannot write nonfinite parameter values', () => {
  const f = fixture();
  f.board.unitX = 0;
  assert.equal(f.down().defaultPrevented, undefined);
  f.board.unitX = 50;
  f.down();
  f.board.containerObj.isConnected = false;
  f.move(3, 0);
  assert.equal(f.win.count('pointermove'), 0);
  assert.deepEqual(f.entry.values, { a: 0.5, b: 0, c: 0 });
});
