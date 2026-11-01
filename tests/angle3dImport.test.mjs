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
    let source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : String(loaded.source);
    if (url.endsWith('/subsystems/analytic3d.ts')) source += '\nexport { createOrUpdate as importAnalytic };';
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const { importAnalytic } = await import('../src/subsystems/analytic3d.ts');
const { evaluateCurve3D, createEvaluatedCurve3D } = await import('../src/shared/curve3d.ts');

function fixture() {
  const live = new Set();
  const board = {
    __liaBoardId: 'S', __liaSceneMode: '3d',
    create(kind, parents, attributes) {
      const object = { board, kind, parents, attributes, element2D: {} };
      live.add(object);
      return object;
    },
    removeObject(object) { live.delete(object); },
    fullUpdate() {}
  };
  const point = (name, xyz) => ({
    __liaPoint3D: true, __liaDgsPointName: name, xyz,
    X() { return xyz[0]; }, Y() { return xyz[1]; }, Z() { return xyz[2]; }
  });
  const A = point('A', [0, 0, 0]), B = point('B', [1, 0, 0]),
    C = point('C', [0, 1, 0]), D = point('D', [0, 0, 1]);
  const line = (name, first, second) => ({
    __liaLinear3D: true, __liaDgsLineName: name, __liaLinear3DKind: 'line',
    __liaLinear3DSourcePoints: [first, second]
  });
  const g = line('g', A, B), h = line('h', A, C), k = line('k', A, D);
  const plane = (name, points) => ({
    __liaPlane3D: true, __liaDgsPlaneName: name, __liaPlane3DDefinition: 'three-points',
    __liaPlane3DSourcePoints: points, __liaPlane3DSourceVectors: []
  });
  const E = plane('E', [A, B, C]), F = plane('F', [A, C, D]);
  const entry = {
    board, config: { xmin: -4, xmax: 4, ymin: -3, ymax: 3, zmin: -4, zmax: 4 },
    points: new Set([A, B, C, D]), linearObjects: new Set([g, h, k]),
    planeObjects: new Set([E, F]), curveObjects: new Set(), surfaceObjects: new Set(),
    view: { create: board.create.bind(board), project3DTo2D: point => [1, point[0], point[1]] }
  };
  globalThis.window = {
    __boards: { S: board }, __coordinateViews3d: { S: entry }, __analytic3DEntries: {},
    __points: { S: { A, B, C, D } }
  };
  return { board, entry, live, A, B, C, D, g, h, k, E, F };
}

for (const [operation, names, definition] of [
  ['angle-lines', ['g', 'h'], 'lines'],
  ['angle-line-plane', ['k', 'E'], 'line-plane'],
  ['angle-planes', ['E', 'F'], 'planes']
]) {
  test(operation + ' restores the native arc, helper rays and dynamic label', () => {
    const { entry, live } = fixture();
    const spec = ['S', 'alpha', ...names, 'visual=1', 'color=#ff3300', 'language=en'].join(';');
    assert.equal(importAnalytic('angle', spec, operation), true);
    const angle = window.__analytic3DEntries.angle.object;
    assert.equal(angle.__liaDgsAngle3D, true);
    assert.equal(angle.__liaDgsAngle3DDefinition, definition);
    assert.equal(angle.__liaDgsAngle3DHelpers.length, 2);
    assert.equal(angle.__liaDgsLineColor, '#ff3300');
    assert.equal(entry.curveObjects.size, 3);
    assert.match(angle.label.parents[2](), /90/);
    const midpoint = evaluateCurve3D(angle.__liaCurve3DEvaluator(), 0.5);
    assert.ok(midpoint.every(Number.isFinite));
    assert.ok(Math.hypot(...midpoint) > 0.5, 'arc has a nonzero radius');
    assert.equal(importAnalytic('angle', spec + ';showvalue=0', operation), true);
    assert.equal(entry.curveObjects.size, 3, 'updating the macro removes the old arc and guides');
    assert.equal(live.size, 4, 'updating the macro removes the old label too');
    assert.doesNotMatch(window.__analytic3DEntries.angle.object.label.parents[2](), /90/);
  });
}

test('visual angle remains dependent when a defining point moves', () => {
  const { C } = fixture();
  assert.equal(importAnalytic('angle', 'S;alpha;g;h;visual=1', 'angle-lines'), true);
  const angle = window.__analytic3DEntries.angle.object;
  assert.match(angle.label.parents[2](), /90/);
  const before = evaluateCurve3D(angle.__liaCurve3DEvaluator(), 1);
  C.xyz[0] = 1;
  assert.match(angle.label.parents[2](), /45/);
  const after = evaluateCurve3D(angle.__liaCurve3DEvaluator(), 1);
  assert.notDeepEqual(after, before);
});

test('legacy scalar angle macros remain scalar measurements', () => {
  const { entry } = fixture();
  assert.equal(importAnalytic('angle', 'S;alpha;g;h', 'angle-lines'), true);
  const angle = window.__analytic3DEntries.angle.object;
  assert.equal(angle.__liaDgsAngle3D, undefined);
  assert.equal(angle.__liaAnalytic3DEvaluator(), Math.PI / 2);
  assert.equal(entry.curveObjects.size, 0);
});

test('unchanged analytic specs rebind to replacement curves instead of exporting stale source names', () => {
  const { entry } = fixture();
  const curve = offset => ({
    __liaCurve3D: true, __liaDgsCurve3DName: 'c', __liaDgsPersistentId: 'curve-c',
    __liaCurve3DData: createEvaluatedCurve3D(t => [t, t * t + offset, 0], [-2, 2])
  });
  const first = curve(0);
  entry.curveObjects.add(first);
  const spec = 'S;t_c;c;t=0.5';
  assert.equal(importAnalytic('tangent', spec, 'curve-tangent'), true);
  const before = window.__analytic3DEntries.tangent.object;
  assert.equal(importAnalytic('tangent', spec, 'curve-tangent'), true);
  assert.equal(window.__analytic3DEntries.tangent.object, before, 'unchanged source retains the existing object');
  entry.curveObjects.delete(first);
  const replacement = curve(3);
  entry.curveObjects.add(replacement);
  assert.equal(importAnalytic('tangent', spec, 'curve-tangent'), true);
  const after = window.__analytic3DEntries.tangent.object;
  assert.notEqual(after, before);
  assert.equal(after.__liaDgsAnalytic3DSources[0], replacement);
  assert.deepEqual(after.__liaLinear3DSourcePoints[0].parents[0](), [0.5, 3.25, 0]);
});