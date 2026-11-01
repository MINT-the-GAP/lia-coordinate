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
  intersectLinePolygon3D,
  nearestPointOnPolygon3D,
  pointInPolygon3D,
  polygonFromPoints3D,
  polygonLocalCoordinates3D,
  polygonPointAt3D
} = await import('../src/shared/polygon3d.ts');
const {
  coneFromBaseApexRadius3D,
  conePointAt3D,
  cylinderFromAxisRadius3D,
  cylinderPointAt3D,
  intersectLineCone3D,
  intersectLineCylinder3D,
  intersectLinePolyhedron3D,
  intersectPlanePolyhedron3D,
  parallelepipedFromPointVectors3D,
  prismFromBaseVector3D,
  pyramidFromBaseApex3D,
  roundSolidSilhouetteAngles3D,
  tetrahedronFromPoints3D
} = await import('../src/shared/solid3d.ts');
const { planeFromPointNormal } = await import('../src/shared/plane3d.ts');

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, String(actual) + ' != ' + String(expected));
const closeVector = (actual, expected, tolerance = 1e-9) => {
  assert.ok(actual);
  actual.forEach((value, index) => close(value, expected[index], tolerance));
};

test('tilted spatial polygons retain area, perimeter, centroid and local bindings', () => {
  const polygon = polygonFromPoints3D([[0, 0, 0], [2, 0, 2], [2, 2, 2], [0, 2, 0]]);
  assert.ok(polygon);
  close(polygon.area, 4 * Math.sqrt(2));
  close(polygon.perimeter, 4 + 4 * Math.sqrt(2));
  closeVector(polygon.centroid, [1, 1, 1]);
  assert.equal(pointInPolygon3D([1, 1, 1], polygon), true);
  assert.equal(pointInPolygon3D([3, 1, 3], polygon), false);
  const binding = polygonLocalCoordinates3D(polygon, [1, 1, 4]);
  closeVector(polygonPointAt3D(polygon, binding), [2.5, 1, 2.5]);
  closeVector(nearestPointOnPolygon3D([4, 1, 4], polygon), [2, 1, 2]);
});

test('polygon validation rejects non-coplanar, collinear, repeated and crossed vertices', () => {
  assert.equal(polygonFromPoints3D([[0, 0, 0], [1, 0, 0], [1, 1, 1], [0, 1, 0]]), null);
  assert.equal(polygonFromPoints3D([[0, 0, 0], [1, 0, 0], [2, 0, 0]]), null);
  assert.equal(polygonFromPoints3D([[0, 0, 0], [1, 0, 0], [1, 0, 0], [0, 1, 0]]), null);
  assert.equal(polygonFromPoints3D([[0, 0, 0], [1, 1, 0], [0, 1, 0], [1, 0, 0]]), null);
});

test('line-polygon intersections respect line, ray and segment domains', () => {
  const polygon = polygonFromPoints3D([[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]]);
  assert.equal(intersectLinePolygon3D([0, 0, 1], [0, 0, -2], polygon, 'segment').kind, 'point');
  assert.equal(intersectLinePolygon3D([0, 0, 1], [0, 0, 2], polygon, 'ray').kind, 'outside');
  assert.equal(intersectLinePolygon3D([2, 0, 1], [0, 0, -1], polygon).kind, 'none');
  assert.equal(intersectLinePolygon3D([0, 0, 0], [1, 0, 0], polygon).kind, 'contained');
});

test('polyhedra expose stable topology and expected school geometry metrics', () => {
  const tetrahedron = tetrahedronFromPoints3D([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.ok(tetrahedron);
  assert.equal(tetrahedron.edges.length, 6);
  assert.equal(tetrahedron.facePolygons.length, 4);
  close(tetrahedron.volume, 1 / 6);

  const base = polygonFromPoints3D([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]]);
  const pyramid = pyramidFromBaseApex3D(base, [1, 1, 3]);
  const prism = prismFromBaseVector3D(base, [1, 0, 3]);
  assert.ok(pyramid);
  assert.ok(prism);
  close(pyramid.volume, 4);
  close(pyramid.height, 3);
  close(prism.volume, 12);
  close(prism.height, 3);

  const box = parallelepipedFromPointVectors3D([0, 0, 0], [2, 0, 0], [0, 3, 0], [0, 0, 4], true);
  assert.ok(box);
  close(box.volume, 24);
  close(box.surfaceArea, 52);
  assert.equal(parallelepipedFromPointVectors3D(
    [0, 0, 0], [2, 0, 0], [1, 3, 0], [0, 0, 4], true
  ), null);
});

test('cylinder and cone metrics, bindings and finite line intersections are robust', () => {
  const cylinder = cylinderFromAxisRadius3D([0, 0, 0], [0, 0, 4], 2);
  const cone = coneFromBaseApexRadius3D([0, 0, 0], [0, 0, 3], 2);
  assert.ok(cylinder);
  assert.ok(cone);
  close(cylinder.volume, 16 * Math.PI);
  close(cylinder.surfaceArea, 24 * Math.PI);
  close(cone.volume, 4 * Math.PI);
  close(cone.slantHeight, Math.sqrt(13));
  closeVector(cylinderPointAt3D(cylinder, { surface: 'side', angle: 0, height: 0.25 }), [0, 2, 1]);

  const cylinderHits = intersectLineCylinder3D([-3, 0, 2], [6, 0, 0], cylinder, 'segment');
  assert.equal(cylinderHits.kind, 'points');
  assert.equal(cylinderHits.points.length, 2);
  closeVector(cylinderHits.points[0], [-2, 0, 2]);
  closeVector(cylinderHits.points[1], [2, 0, 2]);

  const tangent = intersectLineCylinder3D([-3, 2, 2], [6, 0, 0], cylinder, 'segment');
  assert.equal(tangent.kind, 'point');
  closeVector(tangent.points[0], [0, 2, 2]);

  const coneHits = intersectLineCone3D([-3, 0, 1.5], [6, 0, 0], cone, 'segment');
  assert.equal(coneHits.kind, 'points');
  closeVector(coneHits.points[0], [-1, 0, 1.5]);
  closeVector(coneHits.points[1], [1, 0, 1.5]);
});

test('polyhedron line and plane sections deduplicate edge and vertex hits', () => {
  const box = parallelepipedFromPointVectors3D([0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2], true);
  const hits = intersectLinePolyhedron3D([-1, 1, 1], [4, 0, 0], box, 'segment');
  assert.equal(hits.kind, 'points');
  assert.equal(hits.points.length, 2);
  closeVector(hits.points[0], [0, 1, 1]);
  closeVector(hits.points[1], [2, 1, 1]);

  const plane = planeFromPointNormal([0, 0, 1], [0, 0, 1]);
  const section = intersectPlanePolyhedron3D(plane, box);
  assert.ok(section);
  assert.equal(section.vertices.length, 4);
  close(section.area, 4);
});






test('smooth cone and cylinder generators meet the projected cap tangentially', () => {
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const sub = (a, b) => a.map((value, i) => value - b[i]);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => a.map(value => value / Math.hypot(...a));
  const projection = (solid, view) => {
    const forward = unit('eye' in view ? sub(solid.centroid, view.eye) : view.direction);
    const right = unit(cross(forward, Math.abs(forward[2]) < .9 ? [0,0,1] : [0,1,0]));
    const up = cross(right, forward);
    return point => {
      const delta = 'eye' in view ? sub(point, view.eye) : point;
      const distance = 'eye' in view ? dot(delta, forward) : 1;
      return [dot(delta, right) / distance, dot(delta, up) / distance];
    };
  };
  const solids = [
    coneFromBaseApexRadius3D([0,0,0], [0,0,4], 1.5),
    coneFromBaseApexRadius3D([-2,1,3], [1,3,6], 1.2),
    cylinderFromAxisRadius3D([0,0,0], [0,0,4], 1.5),
    cylinderFromAxisRadius3D([-2,1,3], [1,3,6], 1.2)
  ];
  for (const solid of solids) for (const view of [
    { direction: [4,-5,1.5] }, { eye: [10,-8,9] }, { eye: [-8,10,-5] }
  ]) {
    const angles = roundSolidSilhouetteAngles3D(solid, view);
    assert.ok(angles, 'Expected two silhouette generators');
    const project = projection(solid, view);
    const pointAt = solid.kind === 'cone' ? conePointAt3D : cylinderPointAt3D;
    for (const angle of angles) {
      const rim = project(pointAt(solid, { surface:'base', angle }));
      const end = project(pointAt(solid, { surface:'side', angle, height:1 }));
      const before = project(pointAt(solid, { surface:'base', angle:angle-1e-6 }));
      const after = project(pointAt(solid, { surface:'base', angle:angle+1e-6 }));
      const edge = sub(end, rim), tangent = sub(after, before);
      const sine = (edge[0]*tangent[1]-edge[1]*tangent[0]) / Math.hypot(...edge) / Math.hypot(...tangent);
      close(sine, 0, 2e-8);
    }
  }
  const cone = solids[0];
  const coneAngles = roundSolidSilhouetteAngles3D(cone, { direction:[4,-5,1.5] });
  assert.ok(Math.abs(Math.abs(coneAngles[1]-coneAngles[0])-Math.PI) > .01,
    'An inclined cone silhouette must not use opposite points on its base rim');
});

test('round silhouettes disappear in axial, interior and grazing views', () => {
  const cylinder = cylinderFromAxisRadius3D([0,0,0], [0,0,4], 2);
  const cone = coneFromBaseApexRadius3D([0,0,0], [0,0,4], 2);
  for (const solid of [cylinder, cone]) {
    assert.equal(roundSolidSilhouetteAngles3D(solid, { direction:[0,0,1] }), null);
    assert.equal(roundSolidSilhouetteAngles3D(solid, { direction:[0,0,0] }), null);
    assert.equal(roundSolidSilhouetteAngles3D(solid, { eye:[0,0,8] }), null);
    assert.equal(roundSolidSilhouetteAngles3D(solid, { eye:[.1,0,1] }), null);
  }
  assert.equal(roundSolidSilhouetteAngles3D(cone, { direction:[1,0,2] }), null);
  assert.equal(roundSolidSilhouetteAngles3D(cylinder, { eye:[2,0,8] }), null);
  assert.equal(roundSolidSilhouetteAngles3D(cone, { eye:[0,0,4] }), null);
});
