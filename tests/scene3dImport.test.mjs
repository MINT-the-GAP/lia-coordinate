import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    const source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : String(loaded.source);
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});
const { withCoordinate3DImport, setCoordinateViewMode } = await import('../src/coord/view3d.ts');
globalThis.window = {};

function element(visible = true) {
  return { visProp: { visible }, setAttribute(attrs) { Object.assign(this.visProp, attrs); } };
}
function scene() {
  const frames = [];
  const board = {
    __liaBoardId: 'hidden-import', __liaSceneMode: '2d', __liaSceneViewMode: '2d',
    __liaBoardConfig: { mode: '3d' }, isSuspendedUpdate: false, suspends: 0, resumes: 0,
    update() { return this; }, fullUpdate() { return this.update(); },
    suspendUpdate() { this.isSuspendedUpdate = true; this.suspends++; },
    unsuspendUpdate() { this.isSuspendedUpdate = false; this.resumes++; frames.push([...entry.points].map(point => point.element2D.visProp.visible)); }
  };
  const entry = { board, view: { objects: {} }, viewMode: '2d', camera: { azimuth: 1, elevation: 0.4, bank: 0.2 } };
  for (const key of ['points', 'linearObjects', 'planeObjects', 'circleObjects', 'sphereObjects', 'polygonObjects', 'solidObjects', 'curveObjects', 'surfaceObjects', 'decorations']) entry[key] = new Set();
  window.__coordinateViews3d = { 'hidden-import': entry };
  const add = (visible = true) => {
    const point = { ...element(visible), element2D: element(visible), board, view: entry.view };
    entry.points.add(point);
    board.update();
    return point;
  };
  return { board, entry, add, frames };
}

test('3D import retains inactive mode, authored visibility and camera until the first redraw', () => {
  const { board, entry, add, frames } = scene();
  const old = add(false);
  let available = true;
  const saved = () => available;
  old.__liaScene3DVisible = saved;
  old.element2D.__liaScene3DVisible = saved;
  const camera = { ...entry.camera };
  let shown, hidden;
  const result = withCoordinate3DImport(board, () => {
    assert.equal(board.__liaSceneMode, '3d');
    assert.equal(board.isSuspendedUpdate, true);
    shown = add(true);
    hidden = add(false);
    return 'imported';
  });
  assert.equal(result, 'imported');
  assert.equal(board.__liaSceneMode, '2d');
  assert.equal(board.__liaSceneViewMode, '2d');
  assert.equal(entry.viewMode, '2d');
  assert.deepEqual(entry.camera, camera);
  assert.deepEqual(frames, [[false, false, false]]);
  assert.equal(old.__liaScene3DVisible, saved);
  assert.equal(old.element2D.__liaScene3DVisible, saved);
  assert.equal(shown.__liaScene3DVisible, true);
  assert.equal(shown.element2D.__liaScene3DVisible, true);
  assert.equal(hidden.__liaScene3DVisible, false);
  assert.equal(hidden.element2D.__liaScene3DVisible, false);
  available = false;
  assert.equal(old.__liaScene3DVisible(), false);
  withCoordinate3DImport(board, () => true);
  assert.equal(shown.__liaScene3DVisible, true);
  assert.equal(hidden.__liaScene3DVisible, false);
});

test('failed spatial imports restore mode and hide created projections before resuming', () => {
  const { board, add, frames } = scene();
  let point;
  assert.throws(() => withCoordinate3DImport(board, () => {
    point = add(true);
    throw new Error('construction failed');
  }), /construction failed/);
  assert.equal(board.__liaSceneMode, '2d');
  assert.equal(board.isSuspendedUpdate, false);
  assert.equal(board.suspends, 1);
  assert.equal(board.resumes, 1);
  assert.equal(point.__liaScene3DVisible, true);
  assert.deepEqual(frames, [[false]]);
});

test('3D imports respect existing board batches and directly run in active 3D', () => {
  const { board, add } = scene();
  board.isSuspendedUpdate = true;
  withCoordinate3DImport(board, () => add(true));
  assert.equal(board.isSuspendedUpdate, true);
  assert.equal(board.suspends, 0);
  assert.equal(board.resumes, 0);
  board.__liaSceneMode = '3d';
  const active = withCoordinate3DImport(board, () => add(true));
  assert.equal(active.visProp.visible, true);
  assert.equal(Object.hasOwn(active, '__liaScene3DVisible'), false);
  assert.equal(board.__liaSceneMode, '3d');
});

test('spatial imports do not create a 3D scene on native 2D or unfinished boards', () => {
  window.__coordinateViews3d = {};
  for (const mode of ['2d', '3d']) {
    const board = { __liaBoardId: 'uninitialized', __liaSceneMode: '2d', __liaBoardConfig: { mode } };
    assert.equal(withCoordinate3DImport(board, () => { throw new Error('must wait for board setup'); }), undefined);
    assert.equal(board.__liaSceneMode, '2d');
  }
  assert.equal(withCoordinate3DImport(null, () => true), undefined);
});

test('active 3D import batches all created parts into one visible redraw', () => {
  const { board, add, frames } = scene();
  board.__liaSceneMode = '3d';
  const created = withCoordinate3DImport(board, () => {
    assert.equal(board.isSuspendedUpdate, true);
    return [add(true), add(false), add(true)];
  });
  assert.equal(board.suspends, 1);
  assert.equal(board.resumes, 1);
  assert.equal(board.isSuspendedUpdate, false);
  assert.deepEqual(frames, [[true, false, true]]);
  assert.equal(board.__liaSceneMode, '3d');
  for (const object of created) assert.equal(Object.hasOwn(object, '__liaScene3DVisible'), false);
});

test('failed active 3D imports resume their own batch and leave caller batches suspended', () => {
  const { board } = scene();
  board.__liaSceneMode = '3d';
  assert.throws(() => withCoordinate3DImport(board, () => { board.update(); throw new Error('failed'); }), /failed/);
  assert.equal(board.suspends, 1);
  assert.equal(board.resumes, 1);
  assert.equal(board.isSuspendedUpdate, false);
  board.isSuspendedUpdate = true;
  assert.throws(() => withCoordinate3DImport(board, () => { board.update(); throw new Error('failed'); }), /failed/);
  assert.equal(board.suspends, 1);
  assert.equal(board.resumes, 1);
  assert.equal(board.isSuspendedUpdate, true);
});

for (const active of [true, false]) {
  test(`unchanged macro retries do not redraw or alter visibility in active ${active ? '3D' : '2D'}`, () => {
    const { board, add, frames } = scene();
    const point = add(false);
    point.__liaScene3DVisible = true;
    point.element2D.__liaScene3DVisible = true;
    board.__liaSceneMode = active ? '3d' : '2d';
    const update = board.update;
    const fullUpdate = board.fullUpdate;
    let sets = 0;
    point.setAttribute = () => { sets++; };
    for (let retry = 0; retry < 4; retry++) assert.equal(withCoordinate3DImport(board, () => true), true);
    assert.equal(board.resumes, 0);
    assert.equal(board.isSuspendedUpdate, false);
    assert.deepEqual(frames, []);
    assert.equal(sets, 0);
    assert.equal(board.update, update);
    assert.equal(board.fullUpdate, fullUpdate);
    assert.equal(board.__liaSceneMode, active ? '3d' : '2d');
    assert.equal(point.__liaScene3DVisible, true);
    assert.throws(() => withCoordinate3DImport(board, () => { throw new Error('no mutation'); }), /no mutation/);
    assert.equal(board.resumes, 0);
    assert.equal(board.isSuspendedUpdate, false);
    assert.equal(board.update, update);
    assert.equal(board.fullUpdate, fullUpdate);
  });
}

test('import restores inherited update methods after failed mutations', () => {
  const { board } = scene();
  const update = board.update;
  const fullUpdate = board.fullUpdate;
  delete board.update;
  delete board.fullUpdate;
  Object.setPrototypeOf(board, { update, fullUpdate });
  board.__liaSceneMode = '3d';
  assert.throws(() => withCoordinate3DImport(board, () => { board.fullUpdate(); throw new Error('changed'); }), /changed/);
  assert.equal(Object.hasOwn(board, 'update'), false);
  assert.equal(Object.hasOwn(board, 'fullUpdate'), false);
  assert.equal(board.update, update);
  assert.equal(board.fullUpdate, fullUpdate);
  assert.equal(board.resumes, 1);
});

test('initial 2D import hides direct and projected labels with their authored visibility cached', () => {
  const { board, add } = scene();
  let direct, projected, hidden;
  withCoordinate3DImport(board, () => {
    const point = add(true);
    direct = point.label = { ...element(true), board, elType: 'text' };
    projected = point.element2D.label = { ...element(true), board, elType: 'text' };
    hidden = { ...element(false), board, elType: 'text' };
    point.labels = { hidden };
    board.update();
  });
  assert.equal(direct.visProp.visible, false);
  assert.equal(projected.visProp.visible, false);
  assert.equal(hidden.visProp.visible, false);
  assert.equal(direct.__liaScene3DVisible, true);
  assert.equal(projected.__liaScene3DVisible, true);
  assert.equal(hidden.__liaScene3DVisible, false);
  // A retry must neither leak these labels nor replace their saved visibility.
  withCoordinate3DImport(board, () => true);
  assert.equal(direct.visProp.visible, false);
  assert.equal(projected.visProp.visible, false);
  assert.equal(direct.__liaScene3DVisible, true);
  assert.equal(projected.__liaScene3DVisible, true);
});
test('restoring a scene view respects the surrounding history batch', () => {
  const { board, entry } = scene();
  board.isSuspendedUpdate = true;
  setCoordinateViewMode(entry, '2d');
  assert.equal(board.isSuspendedUpdate, true);
  assert.equal(board.suspends, 0);
  assert.equal(board.resumes, 0);
});

test('late showElement and direct visibility writes cannot expose a spatial label in 2D', () => {
  const { board, entry, add } = scene();
  let label;
  withCoordinate3DImport(board, () => {
    const point = add(true);
    label = point.label = { ...element(true), board, elType: 'text', showElement() { this.setAttribute({ visible: true }); } };
    board.update();
  });
  for (let retry = 0; retry < 4; retry++) {
    label.showElement();
    assert.equal(label.visProp.visible, false);
    label.visProp.visible = true;
    assert.equal(label.visProp.visible, false);
    assert.equal(label.__liaScene3DVisible, true);
  }
  let available = false;
  label.setAttribute({ visible: () => available });
  assert.equal(label.visProp.visible, false);
  entry.viewMode = '3d';
  label.setAttribute({ visible: label.__liaScene3DVisible });
  delete label.__liaScene3DVisible;
  assert.equal(label.visProp.visible(), false);
  available = true;
  assert.equal(label.visProp.visible(), true);
  entry.viewMode = '2d';
  assert.equal(label.visProp.visible, false);
  label.setAttribute({ visible: false });
  assert.equal(label.__liaScene3DVisible, false);
  entry.viewMode = '3d';
  assert.equal(label.visProp.visible, false);
});