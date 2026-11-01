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
    if (url.endsWith('/src/coord/view3d.ts')) return {
      format: 'module', shortCircuit: true, source: [
        'export const withCoordinate3DImport = (board, callback) => board?.__liaSceneMode === '+JSON.stringify('3d')+' ? callback() : undefined;',
        'export const coordinateCircle3DData = source => source.data;',
        'export const coordinateCurve3DData = source => source.data;',
        'export const coordinateSurface3DData = source => source.data;',
        'export const coordinatePoint3DBindingParameters = point => point.__liaPoint3DBindingParameters;',
        'export const getCoordinateView3D = board => board.view;',
        'export const point3DCoordinates = point => point.position;',
        'export const createCoordinateCurve3D = (board, curve) => ({ board, curve });',
        'export const createCoordinateSurface3D = (board, surface) => ({ board, surface });'
      ].join('\n')
    };
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});
const { init } = await import('../src/subsystems/locus3d.ts');

test('runtime locus sampling updates only trace dependencies and restores them without rendering', () => {
  let redraws = 0, unrelatedUpdates = 0, factor = 2;
  const board = {
    __liaSceneMode: '3d',
    update() { if (!this.isSuspendedUpdate) redraws += 1; }
  };
  const source = { data: { uRange: [-2, 2], vRange: [-2, 2] } };
  const driver = {
    board, __liaPoint3D: true, __liaDgsPersistentId: 'point:driver',
    __liaPoint3DBindingSource: source,
    __liaPoint3DBindingParameters: { kind: 'surface', u: 0.5, v: -0.5 },
    position: [0.5, -0.5, -0.25],
    __liaPoint3DBindingSync() {
      const { u, v } = this.__liaPoint3DBindingParameters;
      this.position = [u, v, u * v];
    }
  };
  const trace = {
    board, __liaPoint3D: true, __liaPoint3DDependent: true,
    __liaDgsPersistentId: 'point:trace', __liaSceneRecord: { sourceIds: ['point:driver'] },
    position: [1, -1, -0.5], prepareUpdate() {},
    update() { this.position = driver.position.map(value => value * factor); }
  };
  const unrelated = {
    __liaPoint3D: true, __liaPoint3DDependent: true,
    update() { unrelatedUpdates += 1; }
  };
  board.view = Object.fromEntries([
    'points', 'linearObjects', 'planeObjects', 'circleObjects', 'sphereObjects',
    'polygonObjects', 'solidObjects', 'curveObjects', 'surfaceObjects'
  ].map(key => [key, new Set(key === 'points' ? [trace, unrelated, driver] : [])]));
  globalThis.window = { __boards: { B: board }, __points: { B: { D: driver, T: trace } } };
  globalThis.document = { body: {}, querySelectorAll: () => [] };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 1;
  const timeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try { init(); } finally { globalThis.setTimeout = timeout; }
  assert.equal(window.renderLocusSurface3DFromSpec('locus', 'B;L;D.u;D.v;T;quality=8'), true);
  const entry = window.__locusSurface3DEntries.locus;
  assert.equal(entry.drivers[0].source, driver, 'exporter retains actual driver identity');
  assert.deepEqual(entry.object.surface.evaluate(1, 2), [2, 4, 4]);
  assert.deepEqual(driver.position, [0.5, -0.5, -0.25]);
  assert.deepEqual(trace.position, [1, -1, -0.5]);
  factor = 4;
  assert.deepEqual(entry.object.surface.evaluate(1, 2), [4, 8, 8], 'dependency edits must be visible without a stale sample cache');
  assert.deepEqual(trace.position, [2, -2, -1]);
  assert.equal(redraws, 0);
  assert.equal(unrelatedUpdates, 0);
  assert.equal(board.isSuspendedUpdate, undefined);
  assert.equal(window.renderLocusSurface3DFromSpec('locus', 'B;L;D.u;D.v;T;quality=8'), true);
  assert.equal(window.__locusSurface3DEntries.locus, entry, 'unchanged inputs reuse the surface');
  assert.equal(window.renderLocus3DFromSpec('curve', 'B;C;D.u;T;quality=8'), true);
  const oldCurve = window.__locus3DEntries.curve;
  const nextDriver = { ...driver, position: driver.position.slice(),
    __liaPoint3DBindingParameters: { ...driver.__liaPoint3DBindingParameters } };
  const nextTrace = { ...trace, position: trace.position.slice(),
    update() { this.position = nextDriver.position.map(value => value * 5); } };
  window.__points.B = { D: nextDriver, T: nextTrace };
  board.view.points.delete(driver); board.view.points.delete(trace);
  board.view.points.add(nextDriver); board.view.points.add(nextTrace);
  assert.equal(window.renderLocusSurface3DFromSpec('locus', 'B;L;D.u;D.v;T;quality=8'), true);
  const rebound = window.__locusSurface3DEntries.locus;
  assert.notEqual(rebound, entry);
  assert.equal(rebound.drivers[0].source, nextDriver);
  assert.equal(rebound.trace, nextTrace);
  assert.deepEqual(rebound.object.surface.evaluate(1, 2), [5, 10, 10]);
  assert.equal(window.renderLocus3DFromSpec('curve', 'B;C;D.u;T;quality=8'), true);
  assert.notEqual(window.__locus3DEntries.curve, oldCurve);
  assert.equal(window.__locus3DEntries.curve.driver.source, nextDriver);
  assert.equal(window.__locus3DEntries.curve.trace, nextTrace);
});
