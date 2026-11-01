import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(/^\.\.?\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const { init } = await import('../src/subsystems/objectFormat.ts');

const collections = [
  'points', 'linearObjects', 'planeObjects', 'circleObjects', 'sphereObjects',
  'polygonObjects', 'solidObjects', 'curveObjects', 'surfaceObjects'
];
const registries = [
  '__curve3DEntries', '__surface3DEntries', '__conic3DEntries',
  '__analytic3DEntries', '__locus3DEntries', '__locusSurface3DEntries'
];
function fixture() {
  const board = { __liaBoardId: 'B', objectsList: [], objects: {}, update() {} };
  const view = { board, ...Object.fromEntries(collections.map(key => [key, new Set()])) };
  const applied = [];
  globalThis.window = {
    __boards: { B: board }, __coordinateViews3d: { B: view },
    __applyDgsObjectExportFormat: (_id, object, config) => { applied.push({ object, config }); return true; },
    setTimeout() { return 0; }
  };
  globalThis.document = { querySelectorAll: () => [], body: {} };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 1;
  const originalTimeout = globalThis.setTimeout, originalInterval = globalThis.setInterval;
  globalThis.setTimeout = () => 0;
  globalThis.setInterval = () => 0;
  try { init(); } finally {
    globalThis.setTimeout = originalTimeout; globalThis.setInterval = originalInterval;
  }
  return { board, view, applied };
}
function object(name, id) {
  return {
    name, __liaDgsPersistentId: id, attrs: {},
    setAttribute(attrs) { Object.assign(this.attrs, attrs); }
  };
}

test('all spatial wrapper families restore appearance before projected board objects', () => {
  const { board, view, applied } = fixture();
  for (const [index, collection] of collections.entries()) {
    const target = object('S' + index, 'spatial:' + index);
    view[collection].add(target);
    const planar = object(target.name, 'planar:' + index);
    board.objectsList.push(planar);
    assert.equal(window.renderObjectFormatFromSpec('format' + index,
      'B;' + target.name + ';scene=3d;linecolor=#0088cc;opacity=0.27'), true);
    assert.equal(applied.at(-1).object, target);
    assert.equal(target.__liaDgsLineColor, '#0088cc');
    assert.equal(target.__liaDgsOpacity, 0.27);
    assert.equal(planar.__liaDgsLineColor, undefined);
  }
});

test('advanced registry objects and wrapper-only names resolve correctly', () => {
  const { board } = fixture();
  for (const [index, registry] of registries.entries()) {
    const target = object('', 'advanced:' + index);
    target.__liaDgsAnalytic3DName = 'A' + index;
    window[registry] = { entry: { board, object: target } };
    assert.equal(window.renderObjectFormatFromSpec('advanced' + index,
      'B;A' + index + ';scene=3d;linecolor=#993300'), true);
    assert.equal(target.__liaDgsLineColor, '#993300');
  }
});

test('scene and persistent identity prevent applying a format to the wrong object', () => {
  const { board, view, applied } = fixture();
  const planar = object('A', 'planar:A'), spatial = object('A', 'spatial:A');
  board.objectsList.push(planar);
  view.points.add(spatial);
  assert.equal(window.renderObjectFormatFromSpec('planar', 'B;A;scene=2d;linecolor=#123456'), true);
  assert.equal(applied.at(-1).object, planar);
  assert.equal(window.renderObjectFormatFromSpec('missing', 'B;A;objectid=spatial:pending;linecolor=#abcdef'), false);
  assert.equal(spatial.__liaDgsLineColor, undefined);
  assert.equal(window.renderObjectFormatFromSpec('identity', 'B;OldName;objectid=spatial:A;linecolor=#654321'), true);
  assert.equal(applied.at(-1).object, spatial);
  assert.equal(spatial.__liaDgsLineColor, '#654321');
  assert.equal(planar.__liaDgsLineColor, '#123456');
});

test('3D visibility, layer and measurement flags survive parsing and fallback restoration', () => {
  const { view, applied } = fixture();
  const target = object('S', 'sphere:S');
  view.sphereObjects.add(target);
  assert.equal(window.renderObjectFormatFromSpec('sphere',
    'B;S;scene=3d;objectid=sphere:S;visible=false;layer=99;showvalue=true;showangle=false;' +
    'area=true;perimeter=false;surface=true;volume=true;coordinates=false;radius=true'), true);
  assert.equal(target.__liaDgsShowObject, false);
  assert.equal(target.attrs.visible, false);
  assert.equal(target.attrs.layer, 20);
  assert.deepEqual(applied[0].config.flags, {
    __liaDgsShowValue: true, __liaDgsShowAngle: false, __liaDgsShowArea: true,
    __liaDgsShowPerimeter: false, __liaDgsShowSurfaceArea: true, __liaDgsShowVolume: true,
    __liaDgsShowCoordinates: false, __liaDgsShowRadius: true
  });
  for (const [key, value] of Object.entries(applied[0].config.flags)) assert.equal(target[key], value);
});

test('settled formats stay settled for spatial wrappers and reapply after reconstruction', () => {
  const { view, applied } = fixture();
  const target = object('S', 'sphere:S');
  view.sphereObjects.add(target);
  const spec = 'B;S;scene=3d;objectid=sphere:S;linecolor=#ff0000';
  assert.equal(window.renderObjectFormatFromSpec('sphere', spec), true);
  const marker = { id: 'object-format-spec-sphere', dataset: { spec, liaObjectFormatSettled: spec }, isConnected: true };
  document.querySelectorAll = () => [marker];
  window.__bootstrapObjectFormats();
  assert.equal(applied.length, 1, 'live wrapper must not repeatedly reapply formatting');
  view.sphereObjects.delete(target);
  const replacement = object('S', 'sphere:S');
  view.sphereObjects.add(replacement);
  window.__bootstrapObjectFormats();
  assert.equal(applied.length, 2);
  assert.equal(applied.at(-1).object, replacement);
  assert.equal(replacement.__liaDgsLineColor, '#ff0000');
});

test('spatial angles are restored in their 3D scene even though they are board objects', () => {
  const { board, applied } = fixture();
  const planar = object('alpha', 'planar:angle');
  const spatial = object('alpha', 'spatial:angle');
  spatial.__liaDgsAngle3D = true;
  board.objectsList.push(planar, spatial);
  assert.equal(window.renderObjectFormatFromSpec('angle', 'B;alpha;scene=3d;showangle=true;linecolor=#f07010'), true);
  assert.equal(applied.at(-1).object, spatial);
  assert.equal(spatial.__liaDgsShowAngle, true);
  assert.equal(planar.__liaDgsShowAngle, undefined);
});
test('a full format import and its delayed passes redraw each board only once', () => {
  const { board, view } = fixture();
  let redraws = 0;
  board.suspendUpdate = () => { board.isSuspendedUpdate = true; };
  board.unsuspendUpdate = () => { board.isSuspendedUpdate = false; redraws++; };
  board.update = () => { if (!board.isSuspendedUpdate) redraws++; };
  const callbacks = [];
  window.setTimeout = callback => { callbacks.push(callback); return callbacks.length; };
  const markers = Array.from({ length: 12 }, (_, index) => {
    const target = object('S' + index, 'sphere:' + index);
    target.board = board;
    view.sphereObjects.add(target);
    return { id: 'object-format-spec-' + index,
      dataset: { spec: 'B;S' + index + ';scene=3d;objectid=sphere:' + index + ';linecolor=#ff0000' },
      isConnected: true };
  });
  document.querySelectorAll = () => markers;
  window.__bootstrapObjectFormats();
  assert.equal(redraws, 1, 'all imported formats share one redraw');
  assert.equal(callbacks.length, 3);
  callbacks.forEach(callback => callback());
  assert.equal(redraws, 4, 'each delayed pass also shares one redraw');
  window.__bootstrapObjectFormats();
  assert.equal(redraws, 4, 'settled imports trigger no redraw');
  board.isSuspendedUpdate = true;
  markers[0].dataset.spec += ';width=5';
  window.__bootstrapObjectFormats();
  assert.equal(board.isSuspendedUpdate, true, 'caller-owned suspension remains active');
  assert.equal(redraws, 4);
});
