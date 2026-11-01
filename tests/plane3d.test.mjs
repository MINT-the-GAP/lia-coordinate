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

const {
  clipPlaneToBounds3D,
  crossVector3,
  distancePointPlane,
  dotVector3,
  intersectLinePlane3D,
  intersectLines3D,
  intersectPlanes3D,
  planeFromPointNormal,
  planeFromPointVectors,
  planeFromThreePoints,
  projectPointToPlane
} = await import('../src/shared/plane3d.ts');

const close = (actual, expected, tolerance = 1e-9) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, String(actual) + ' != ' + String(expected)));
};

test('plane vector helpers and all definitions agree', () => {
  assert.equal(dotVector3([1, 2, 3], [4, -5, 6]), 12);
  close(crossVector3([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  const byPoints = planeFromThreePoints([0, 0, 2], [1, 0, 2], [0, 1, 2]);
  const byVectors = planeFromPointVectors([0, 0, 2], [2, 0, 0], [0, -3, 0]);
  const byNormal = planeFromPointNormal([0, 0, 2], [0, 0, 7]);
  assert.ok(byPoints && byVectors && byNormal);
  assert.ok(Math.abs(distancePointPlane([4, -8, 9], byPoints) - 7) < 1e-9);
  close(projectPointToPlane([4, -8, 9], byPoints), [4, -8, 2]);
  assert.ok(Math.abs(byNormal.coefficients[3] + 2) < 1e-9);
});

test('degenerate and non-finite plane definitions fail cleanly', () => {
  assert.equal(planeFromThreePoints([0, 0, 0], [1, 1, 1], [2, 2, 2]), null);
  assert.equal(planeFromPointVectors([0, 0, 0], [1, 0, 0], [2, 0, 0]), null);
  assert.equal(planeFromPointNormal([0, 0, 0], [0, 0, 0]), null);
  assert.equal(planeFromPointNormal([0, 0, Infinity], [0, 0, 1]), null);
});

test('plane clipping returns the ordered convex box section', () => {
  const plane = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  assert.ok(plane);
  const polygon = clipPlaneToBounds3D(plane, { x: [-2, 3], y: [-4, 5], z: [-6, 7] });
  assert.equal(polygon.length, 4);
  assert.ok(polygon.every(point => Math.abs(point[2]) < 1e-10));
  const corners = new Set(polygon.map(point => String(point[0]) + ',' + String(point[1])));
  assert.deepEqual(corners, new Set(['-2,-4', '3,-4', '-2,5', '3,5']));
  const diagonal = planeFromPointNormal([0, 0, 0], [1, 1, 1]);
  assert.ok(diagonal);
  assert.equal(clipPlaneToBounds3D(diagonal, { x: [-1, 1], y: [-1, 1], z: [-1, 1] }).length, 6);
});

test('line-plane intersections respect line, ray, segment, and vector domains', () => {
  const plane = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  assert.ok(plane);
  const hit = intersectLinePlane3D([1, 2, 3], [0, 0, -2], plane);
  assert.equal(hit.kind, 'point');
  close(hit.point, [1, 2, 0]);
  assert.equal(intersectLinePlane3D([0, 0, 1], [1, 0, 0], plane).kind, 'parallel');
  assert.equal(intersectLinePlane3D([0, 0, 0], [1, 0, 0], plane).kind, 'contained');
  assert.equal(intersectLinePlane3D([0, 0, 1], [0, 0, 1], plane, 'ray').kind, 'outside');
  assert.equal(intersectLinePlane3D([0, 0, 1], [0, 0, -0.25], plane, 'segment').kind, 'outside');
  assert.equal(intersectLinePlane3D([0, 0, 1], [0, 0, -2], plane, 'vector').kind, 'point');
});

test('spatial line intersections distinguish point, skew, parallel, coincident, and outside', () => {
  const crossing = intersectLines3D([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]);
  assert.equal(crossing.kind, 'point');
  close(crossing.point, [0, 0, 0]);
  assert.equal(intersectLines3D([0, 0, 0], [1, 0, 0], [0, 1, 1], [0, -1, 0]).kind, 'skew');
  assert.equal(intersectLines3D([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0]).kind, 'parallel');
  assert.equal(intersectLines3D([0, 0, 0], [1, 0, 0], [2, 0, 0], [4, 0, 0]).kind, 'coincident');
  assert.equal(intersectLines3D([0, 0, 0], [1, 0, 0], [2, 1, 0], [0, -1, 0], 'segment', 'line').kind, 'outside');
});

test('plane-plane intersections produce a stable line or classified degeneracy', () => {
  const xOne = planeFromPointNormal([1, 0, 0], [1, 0, 0]);
  const yTwo = planeFromPointNormal([0, 2, 0], [0, 1, 0]);
  assert.ok(xOne && yTwo);
  const result = intersectPlanes3D(xOne, yTwo);
  assert.equal(result.kind, 'line');
  close(result.point, [1, 2, 0]);
  close(result.direction, [0, 0, 1]);
  assert.equal(intersectPlanes3D(xOne, planeFromPointNormal([2, 0, 0], [1, 0, 0])).kind, 'parallel');
  assert.equal(intersectPlanes3D(xOne, planeFromPointNormal([1, 4, -2], [-2, 0, 0])).kind, 'coincident');
});