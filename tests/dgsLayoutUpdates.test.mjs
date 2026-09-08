import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// Export internals only from the in-memory test module; production API is unchanged.
registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  },
  load(url, context, next) {
    const loaded = next(url, context);
    if (!url.endsWith('.ts')) return loaded;
    let source = Buffer.isBuffer(loaded.source) ? loaded.source.toString() : String(loaded.source);
    if (url.endsWith('/subsystems/dgs.ts')) source += `
export { layoutDgsSetSquare, scheduleDgsSetSquareLayout, persistDgsSetSquarePose,
  setDgsSetSquareVisible, readDgsSetSquarePose, applyDgsLogTickGenerator,
  scheduleDgsCoordinateSync, syncDgsFixedCompassConstructions, recordAllDgsPointTraces,
  refreshDgsSliderTypography };`;
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

globalThis.window = {};
const dgs = await import('../src/subsystems/dgs.ts');
const { trackDgsUpdateObject } = await import('../src/shared/dgsUpdateTargets.ts');
const { setStyleIfChanged } = await import('../src/shared/domUpdates.ts');
let writes = 0;
class Element {
  constructor() {
    this.attrs = new Map(); this.children = []; this.parentElement = null;
    this.style = new Proxy({}, { set(target, key, value) { writes++; target[key] = value; return true; } });
    this.classes = new Set(); this.value = '';
    this.classList = {
      contains: key => this.classes.has(key),
      add: key => { writes++; this.classes.add(key); },
      remove: key => { writes++; this.classes.delete(key); },
      toggle: (key, active) => { if (active !== this.classes.has(key)) { writes++; active ? this.classes.add(key) : this.classes.delete(key); } }
    };
  }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  setAttribute(key, value) { writes++; this.attrs.set(key, String(value)); }
  removeAttribute(key) { if (this.attrs.delete(key)) writes++; }
  get textContent() { return this.value; }
  set textContent(value) { writes++; this.value = value; }
  insertBefore(node, reference) {
    node.remove(); const index = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index, 0, node); node.parentElement = this; writes++;
  }
  remove() {
    if (this.parentElement) { const p = this.parentElement; p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; writes++; }
  }
  querySelector(selector) { return selector.endsWith('-ticks') ? this.ticks : this.labels; }
}
function fixture() {
  let next = 1; const frames = new Map(), timers = new Map();
  globalThis.requestAnimationFrame = fn => { const id = next++; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  window.setTimeout = fn => { const id = next++; timers.set(id, fn); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.__coordBoardStates = {};
  globalThis.document = { createElementNS: () => new Element() };
  const overlay = new Element(); overlay.ticks = new Element(); overlay.labels = new Element();
  const state = {
    boardId: 'A1', language: 'de', board: { origin: { scrCoords: [1, 350, 350] }, unitX: 35, unitY: 35, objects: {}, objectsList: [] },
    boardContainer: { clientWidth: 700, clientHeight: 700 }, setSquareOverlay: overlay,
    setSquareButton: new Element(), setSquareVisible: false, setSquareInitialized: false,
    setSquarePivotX: 350, setSquarePivotY: 150, setSquarePivotUserX: null, setSquarePivotUserY: null,
    setSquarePivotXRatio: .5, setSquarePivotYRatio: .22, setSquareAngle: 0, setSquareScale: 1,
    setSquareLastContainerWidth: 0, setSquareLastContainerHeight: 0, setSquareRulerSignature: '',
    setSquarePointerId: null, setSquareInteraction: null
  };
  return { state, overlay, frames, timers, flush() { const tasks = [...frames.values()]; frames.clear(); tasks.forEach(fn => fn()); } };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('hidden pan/zoom changes only the pose; showing projects and renders the current ruler', () => {
  const { state, overlay, flush, frames } = fixture();
  writes = 0; dgs.layoutDgsSetSquare(state, 'screen'); assert.equal(writes, 0);
  const user = [state.setSquarePivotUserX, state.setSquarePivotUserY];
  state.board.origin.scrCoords = [1, 375, 370]; state.board.unitX = 50; state.board.unitY = 45;
  for (let i = 0; i < 20; i++) dgs.scheduleDgsSetSquareLayout(state, 'board');
  assert.equal(frames.size, 1); flush(); assert.equal(writes, 0);
  close(state.setSquarePivotX, 375 + user[0] * 50); close(state.setSquarePivotY, 370 - user[1] * 45);
  dgs.setDgsSetSquareVisible(state, true);
  assert.ok(overlay.classList.contains('is-visible')); assert.ok(overlay.labels.children.length > 0);
  close(Number(overlay.getAttribute('data-ruler-units-per-pixel')), 1 / 50);
  assert.ok(overlay.style.transform.includes('translate3d('));
  writes = 0; dgs.layoutDgsSetSquare(state, 'board'); assert.equal(writes, 0, 'unchanged visible layout must be a DOM no-op');
});

test('persistence flushes hidden viewport motion before RAF and preserves pose across restoration', () => {
  const { state, frames } = fixture(); dgs.layoutDgsSetSquare(state, 'screen');
  state.board.origin.scrCoords[1] += 42;
  dgs.scheduleDgsSetSquareLayout(state, 'board');
  dgs.persistDgsSetSquarePose(state);
  assert.equal(frames.size, 0); close(state.setSquarePivotX, 392);
  const stored = dgs.readDgsSetSquarePose('A1'); close(stored.pivotXRatio, 392 / 700);
  const restored = { ...state, setSquarePivotX: stored.pivotXRatio * 700, setSquarePivotY: stored.pivotYRatio * 700,
    setSquarePivotUserX: null, setSquarePivotUserY: null, setSquareAngle: stored.angle, setSquareScale: stored.scale };
  dgs.layoutDgsSetSquare(restored, 'screen'); dgs.setDgsSetSquareVisible(restored, true);
  close(restored.setSquarePivotXRatio, stored.pivotXRatio); close(restored.setSquarePivotYRatio, stored.pivotYRatio);
});

test('hidden resize takes ratio priority over queued pan before showing', () => {
  const { state } = fixture(); dgs.layoutDgsSetSquare(state, 'screen');
  const ratio = state.setSquarePivotXRatio;
  state.board.origin.scrCoords[1] += 100; dgs.scheduleDgsSetSquareLayout(state, 'board');
  state.boardContainer.clientWidth = 900; dgs.scheduleDgsSetSquareLayout(state, 'ratio');
  dgs.setDgsSetSquareVisible(state, true);
  close(state.setSquarePivotX, ratio * 900); close(state.setSquareLastContainerWidth, 900);
});

test('visible zoom reuses ruler label nodes and hidden zoom leaves the SVG untouched', () => {
  const { state, overlay } = fixture(); dgs.setDgsSetSquareVisible(state, true);
  const old = new Map(overlay.labels.children.map(node => [node.getAttribute('data-value'), node]));
  state.board.unitX *= 1.01; state.board.unitY *= 1.01;
  dgs.layoutDgsSetSquare(state, 'board');
  for (const node of overlay.labels.children) if (old.has(node.getAttribute('data-value'))) assert.equal(node, old.get(node.getAttribute('data-value')));
  dgs.setDgsSetSquareVisible(state, false); writes = 0;
  state.board.unitX *= 2; dgs.layoutDgsSetSquare(state, 'board'); assert.equal(writes, 0);
});

test('tick generators stay stable through pan/zoom, language and axis replacement are refreshed', () => {
  const { state } = fixture(); const original = () => 'cartesian'; const axis = { defaultTicks: { generateLabelText: original, needsUpdate: false } };
  dgs.applyDgsLogTickGenerator(state, axis, 'x', false); assert.equal(axis.defaultTicks.needsUpdate, false);
  dgs.applyDgsLogTickGenerator(state, axis, 'x', true); const generator = axis.defaultTicks.generateLabelText;
  axis.defaultTicks.needsUpdate = false; dgs.applyDgsLogTickGenerator(state, axis, 'x', true);
  assert.equal(axis.defaultTicks.generateLabelText, generator); assert.equal(axis.defaultTicks.needsUpdate, false);
  state.language = 'en'; dgs.applyDgsLogTickGenerator(state, axis, 'x', true); assert.equal(axis.defaultTicks.needsUpdate, true);
  dgs.applyDgsLogTickGenerator(state, axis, 'x', false); assert.equal(axis.defaultTicks.generateLabelText, original);
  axis.defaultTicks = { generateLabelText: original }; dgs.applyDgsLogTickGenerator(state, axis, 'x', true);
  assert.notEqual(axis.defaultTicks.generateLabelText, generator); assert.equal(axis.defaultTicks.needsUpdate, true);
});

test('inactive coordinate, trace, compass and slider updates do no repeated board scans or RAF work', () => {
  const { state, frames } = fixture();
  dgs.scheduleDgsCoordinateSync(state); // seed once
  state.board.objectsList = new Proxy([], { get() { throw Error('unexpected board scan'); } });
  for (let i = 0; i < 20; i++) {
    dgs.scheduleDgsCoordinateSync(state); dgs.syncDgsFixedCompassConstructions(state);
    dgs.recordAllDgsPointTraces(state); dgs.refreshDgsSliderTypography(state);
  }
  assert.equal(frames.size, 0);
  let fontSize = 0;
  const slider = { id: 's', __liaDgsSlider: true, label: { setAttribute: a => { fontSize = a.fontSize; } } };
  state.board.objects.s = slider; trackDgsUpdateObject(state.board, slider);
  dgs.refreshDgsSliderTypography(state); assert.equal(fontSize, 18);
  state.board.unitX *= 2; state.board.unitY *= 2; dgs.refreshDgsSliderTypography(state); assert.equal(fontSize, 36);
});

test('style guard handles CSSOM normalization and corrects external edits', () => {
  let value = '', calls = 0;
  const element = { style: { get color() { return value; }, set color(next) { calls++; value = next === '#000' ? 'rgb(0, 0, 0)' : next; } } };
  setStyleIfChanged(element, 'color', '#000'); setStyleIfChanged(element, 'color', '#000'); assert.equal(calls, 1);
  value = 'red'; setStyleIfChanged(element, 'color', '#000'); assert.equal(calls, 2);
});


test('a formula activated after initialization follows parameter changes and stops after removal', () => {
  const { state, frames, flush } = fixture();
  dgs.scheduleDgsCoordinateSync(state); assert.equal(frames.size, 0);
  globalThis.JXG = { COORDS_BY_USER: 0 };
  let parameter = 2, x = 0, y = 0, updates = 0;
  const point = {
    id: 'formula', board: state.board, __liaDgsPointName: 'Q',
    __liaDgsCoordinateExpressions: { x: 'a', y: '2*a' },
    __liaDgsCoordinateCompiled: { x: () => parameter, y: () => 2 * parameter },
    __liaDgsCoordinateParameter: 0,
    X: () => x, Y: () => y,
    setPositionDirectly(mode, coords) { [x, y] = coords; }
  };
  state.board.objects.formula = point;
  state.board.update = () => { updates++; dgs.scheduleDgsCoordinateSync(state); };
  trackDgsUpdateObject(state.board, point);
  dgs.scheduleDgsCoordinateSync(state); flush(); assert.deepEqual([x, y], [2, 4]);
  assert.equal(updates, 1); assert.equal(frames.size, 0);
  parameter = 3; dgs.scheduleDgsCoordinateSync(state); flush(); assert.deepEqual([x, y], [3, 6]);
  dgs.scheduleDgsCoordinateSync(state); flush(); assert.equal(updates, 2, 'unchanged formula adds no board update');
  delete state.board.objects.formula; dgs.scheduleDgsCoordinateSync(state); assert.equal(frames.size, 0);
});


test('showing an off-screen hidden tool clamps it without losing rotation or scale', () => {
  const { state, overlay, flush } = fixture();
  state.setSquareAngle = 37; state.setSquareScale = .8;
  dgs.layoutDgsSetSquare(state, 'screen');
  state.board.unitX *= 1.4; state.board.unitY *= .7;
  state.board.origin.scrCoords[1] += 2000;
  dgs.scheduleDgsSetSquareLayout(state, 'board'); flush();
  assert.ok(state.setSquarePivotX > 700, 'hidden viewport projection must not clamp');
  dgs.persistDgsSetSquarePose(state);
  const stored = dgs.readDgsSetSquarePose('A1');
  assert.equal(stored.angle, 37); assert.equal(stored.scale, .8); assert.equal(stored.visible, false);
  dgs.setDgsSetSquareVisible(state, true);
  assert.ok(Number(overlay.getAttribute('data-visible-fraction')) > 0, 'tool must be reachable after showing');
  assert.equal(state.setSquareAngle, 37); assert.equal(state.setSquareScale, .8);
  assert.ok(overlay.style.transform.includes('rotate(37deg)'));
});
