import test from 'node:test';
import assert from 'node:assert/strict';
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
  circleArea, circleCircumference, circleFromCenterNormalRadius, circleFromThreePoints,
  circleParameterAt, circlePointAt, intersectCircles3D, intersectLineCircle3D,
  intersectPlaneCircle3D, nearestPointOnCircle, pointOnCircle, projectPointToCirclePlane
} = await import('../src/shared/circle3d.ts');
const {
  intersectCircleSphere3D, intersectLineSphere3D, intersectPlaneSphere3D,
  intersectSpheres3D, nearestPointOnSphere, pointOnSphere, signedDistancePointSphere,
  sphereDiameter, sphereDirectionAt, sphereFromCenterPoint, sphereFromCenterRadius,
  sphereFromFourPoints, spherePointAtDirection, sphereSurfaceArea, sphereVolume
} = await import('../src/shared/sphere3d.ts');
const { planeFromPointNormal } = await import('../src/shared/plane3d.ts');

const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const closePoint = (actual, expected, tolerance = 1e-8) => {
  assert.ok(actual, 'missing point');
  expected.forEach((value, index) => close(actual[index], value, tolerance));
};
const sorted = points => points.map(point => point.map(value => Math.round(value * 1e8) / 1e8))
  .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

test('three-point circle has stable frame, metrics and parameterization', () => {
  const circle = circleFromThreePoints([1, 0, 0], [0, 1, 0], [-1, 0, 0]);
  assert.ok(circle);
  closePoint(circle.center, [0, 0, 0]);
  close(circle.radius, 1);
  close(circleCircumference(circle), 2 * Math.PI);
  close(circleArea(circle), Math.PI);
  const point = circlePointAt(circle, Math.PI / 3);
  assert.ok(pointOnCircle(point, circle));
  close(circleParameterAt(circle, point), Math.PI / 3);
  closePoint(nearestPointOnCircle([3, 0, 4], circle), [1, 0, 0]);
});

test('circle definitions reject nonfinite and collinear data', () => {
  assert.equal(circleFromThreePoints([0, 0, 0], [1, 0, 0], [2, 0, 0]), null);
  assert.equal(circleFromThreePoints([0, 0, 0], [1, 0, 0], [2, 1e-14, 0]), null);
  assert.equal(circleFromCenterNormalRadius([0, 0, 0], [0, 0, 0], 2), null);
  assert.equal(circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], Infinity), null);
});

test('line, plane and circle intersections classify secant, tangent, domains and coincidence', () => {
  const circle = circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], 2);
  assert.ok(circle);
  const secant = intersectLineCircle3D([-3, 0, 0], [1, 0, 0], circle);
  assert.equal(secant.kind, 'points');
  assert.deepEqual(sorted(secant.points), [[-2, 0, 0], [2, 0, 0]]);
  assert.equal(intersectLineCircle3D([-3, 2, 0], [1, 0, 0], circle).kind, 'point');
  assert.equal(intersectLineCircle3D([3, 0, 0], [1, 0, 0], circle, 'ray').kind, 'none');
  assert.equal(intersectLineCircle3D([0, 0, -2], [0, 0, 1], circle).kind, 'none');
  const vertical = planeFromPointNormal([0, 0, 0], [1, 0, 0]);
  const horizontal = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  assert.equal(intersectPlaneCircle3D(vertical, circle).kind, 'points');
  assert.equal(intersectPlaneCircle3D(horizontal, circle).kind, 'coincident');
  const other = circleFromCenterNormalRadius([2, 0, 0], [0, 0, 1], 2);
  assert.equal(intersectCircles3D(circle, other).kind, 'points');
});

test('sphere definitions, projection and metrics are robust', () => {
  const byPoint = sphereFromCenterPoint([0, 0, 0], [0, 0, 3]);
  const byRadius = sphereFromCenterRadius([0, 0, 0], 3);
  assert.deepEqual(byPoint, byRadius);
  close(sphereSurfaceArea(byRadius), 36 * Math.PI);
  close(sphereVolume(byRadius), 36 * Math.PI);
  closePoint(nearestPointOnSphere([4, 0, 0], byRadius), [3, 0, 0]);
  assert.ok(pointOnSphere([0, -3, 0], byRadius));
  const four = sphereFromFourPoints([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1]);
  assert.ok(four);
  closePoint(four.center, [0, 0, 0]);
  close(four.radius, 1);
  assert.equal(sphereFromFourPoints([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]), null);
});

test('line-sphere intersections respect line, ray and segment domains', () => {
  const sphere = sphereFromCenterRadius([0, 0, 0], 2);
  const secant = intersectLineSphere3D([-3, 0, 0], [1, 0, 0], sphere);
  assert.equal(secant.kind, 'points');
  assert.deepEqual(sorted(secant.points), [[-2, 0, 0], [2, 0, 0]]);
  assert.equal(intersectLineSphere3D([-3, 2, 0], [1, 0, 0], sphere).kind, 'point');
  assert.equal(intersectLineSphere3D([3, 0, 0], [1, 0, 0], sphere, 'ray').kind, 'none');
  assert.equal(intersectLineSphere3D([-3, 0, 0], [2, 0, 0], sphere, 'segment').kind, 'point');
  assert.equal(intersectLineSphere3D([-3, 3, 0], [2, 0, 0], sphere).kind, 'none');
});

test('plane-sphere and sphere-sphere intersections return points, circles and coincidence', () => {
  const sphere = sphereFromCenterRadius([0, 0, 0], 2);
  const through = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  const tangent = planeFromPointNormal([0, 0, 2], [0, 0, 1]);
  const outside = planeFromPointNormal([0, 0, 3], [0, 0, 1]);
  const section = intersectPlaneSphere3D(through, sphere);
  assert.equal(section.kind, 'circle');
  close(section.circle.radius, 2);
  assert.equal(intersectPlaneSphere3D(tangent, sphere).kind, 'point');
  assert.equal(intersectPlaneSphere3D(outside, sphere).kind, 'none');
  assert.equal(intersectSpheres3D(sphere, sphere).kind, 'coincident');
  assert.equal(intersectSpheres3D(sphere, sphereFromCenterRadius([4, 0, 0], 2)).kind, 'point');
  const lens = intersectSpheres3D(sphere, sphereFromCenterRadius([2, 0, 0], 2));
  assert.equal(lens.kind, 'circle');
  closePoint(lens.circle.center, [1, 0, 0]);
});

test('circle-sphere intersections support none, tangency, pairs and coincidence', () => {
  const circle = circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], 2);
  assert.equal(intersectCircleSphere3D(circle, sphereFromCenterRadius([0, 0, 0], 2)).kind, 'coincident');
  assert.equal(intersectCircleSphere3D(circle, sphereFromCenterRadius([0, 0, 3], 1)).kind, 'none');
  const pair = intersectCircleSphere3D(circle, sphereFromCenterRadius([1, 0, 0], 2));
  assert.equal(pair.kind, 'points');
  assert.equal(pair.points.length, 2);
  const tangent = intersectCircleSphere3D(circle, sphereFromCenterRadius([4, 0, 0], 2));
  assert.equal(tangent.kind, 'point');
});

test('circle frame is deterministic and plane projection is orthogonal', () => {
  const first = circleFromCenterNormalRadius([2, -1, 3], [1, 2, 3], 4);
  const second = circleFromCenterNormalRadius([2, -1, 3], [1, 2, 3], 4);
  assert.ok(first && second);
  assert.deepEqual(first.direction1, second.direction1);
  assert.deepEqual(first.direction2, second.direction2);
  close(Math.hypot(...first.direction1), 1);
  close(Math.hypot(...first.direction2), 1);
  close(first.direction1.reduce((sum, value, index) => sum + value * first.normal[index], 0), 0);
  const projected = projectPointToCirclePlane([9, -5, 8], first);
  assert.ok(projected);
  close(projected.reduce((sum, value, index) =>
    sum + (value - first.center[index]) * first.normal[index], 0), 0);
});

test('plane-circle distinguishes none, tangency, secancy and coincidence', () => {
  const circle = circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], 2);
  const tangent = planeFromPointNormal([2, 0, 0], [1, 0, 0]);
  const secant = planeFromPointNormal([1, 0, 0], [1, 0, 0]);
  const outside = planeFromPointNormal([3, 0, 0], [1, 0, 0]);
  const coincident = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  assert.equal(intersectPlaneCircle3D(tangent, circle).kind, 'point');
  assert.equal(intersectPlaneCircle3D(secant, circle).kind, 'points');
  assert.equal(intersectPlaneCircle3D(outside, circle).kind, 'none');
  assert.equal(intersectPlaneCircle3D(coincident, circle).kind, 'coincident');
});

test('circles in differently oriented planes intersect in stable spatial points', () => {
  const horizontal = circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], 2);
  const vertical = circleFromCenterNormalRadius([0, 0, 0], [1, 0, 0], 2);
  const result = intersectCircles3D(horizontal, vertical);
  assert.equal(result.kind, 'points');
  assert.deepEqual(sorted(result.points), [[0, -2, 0], [0, 2, 0]]);
});

test('sphere direction parameterization and signed surface distance roundtrip', () => {
  const sphere = sphereFromCenterRadius([1, 2, 3], 5);
  assert.ok(sphere);
  close(sphereDiameter(sphere), 10);
  close(signedDistancePointSphere([1, 2, 11], sphere), 3);
  const point = spherePointAtDirection(sphere, [2, -1, 2]);
  assert.ok(point && pointOnSphere(point, sphere));
  const direction = sphereDirectionAt(sphere, point);
  assert.ok(direction);
  close(Math.hypot(...direction), 1);
  closePoint(spherePointAtDirection(sphere, direction), point);
});

test('near-coplanar four-point spheres and nonfinite intersections fail safely', () => {
  assert.equal(sphereFromFourPoints(
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1e-14]
  ), null);
  const sphere = sphereFromCenterRadius([0, 0, 0], 2);
  const circle = circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], 2);
  assert.equal(intersectLineSphere3D([Infinity, 0, 0], [1, 0, 0], sphere).kind, 'invalid');
  assert.equal(intersectLineCircle3D([0, 0, 0], [NaN, 0, 0], circle).kind, 'invalid');
  assert.equal(nearestPointOnSphere([NaN, 0, 0], sphere), null);
  assert.equal(pointOnCircle([Infinity, 0, 0], circle), false);
});