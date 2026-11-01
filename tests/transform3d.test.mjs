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

const { circleFromCenterNormalRadius } = await import('../src/shared/circle3d.ts');
const { planeFromPointNormal } = await import('../src/shared/plane3d.ts');
const { polygonFromPoints3D } = await import('../src/shared/polygon3d.ts');
const { sphereFromCenterRadius } = await import('../src/shared/sphere3d.ts');
const {
  coneFromBaseApexRadius3D,
  cylinderFromAxisRadius3D,
  parallelepipedFromPointVectors3D
} = await import('../src/shared/solid3d.ts');
const {
  axisRotationTransform3D,
  dilationTransform3D,
  lineReflectionTransform3D,
  planeReflectionTransform3D,
  pointReflectionTransform3D,
  transformCircle3D,
  transformPlane3D,
  transformPoint3D,
  transformPolygon3D,
  transformSolid3D,
  transformSphere3D,
  transformedDistance3D,
  translationTransform3D
} = await import('../src/shared/transform3d.ts');

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, String(actual) + ' != ' + String(expected));
const closeVector = (actual, expected, tolerance = 1e-9) => {
  assert.ok(actual);
  actual.forEach((value, index) => close(value, expected[index], tolerance));
};

test('translation, point reflection and signed dilation transform points predictably', () => {
  closeVector(transformPoint3D(translationTransform3D([2, -1, 3]), [1, 2, 3]), [3, 1, 6]);
  closeVector(transformPoint3D(pointReflectionTransform3D([1, 1, 1]), [2, 4, -1]), [0, -2, 3]);
  const dilation = dilationTransform3D([1, 1, 1], -2);
  closeVector(transformPoint3D(dilation, [2, 1, 0]), [-1, 1, 3]);
  close(transformedDistance3D(dilation, [0, 0, 0], [0, 3, 4]), 10);
  assert.equal(dilationTransform3D([0, 0, 0], 0), null);
});

test('axis rotations, line half-turns and plane reflections preserve rigid distances', () => {
  const rotation = axisRotationTransform3D([0, 0, 0], [0, 0, 1], Math.PI / 2);
  closeVector(transformPoint3D(rotation, [2, 0, 1]), [0, 2, 1]);
  close(transformedDistance3D(rotation, [0, 0, 0], [2, 0, 1]), Math.sqrt(5));

  const halfTurn = lineReflectionTransform3D([0, 0, 0], [1, 0, 0]);
  closeVector(transformPoint3D(halfTurn, [2, 3, 4]), [2, -3, -4]);

  const plane = planeFromPointNormal([0, 0, 2], [0, 0, 1]);
  const reflection = planeReflectionTransform3D(plane);
  closeVector(transformPoint3D(reflection, [1, -2, 5]), [1, -2, -1]);
});

test('planes, circles, spheres and polygons retain their object type', () => {
  const transform = axisRotationTransform3D([0, 0, 0], [0, 1, 0], Math.PI / 2);
  const plane = transformPlane3D(transform, planeFromPointNormal([0, 0, 1], [0, 0, 1]));
  closeVector(plane.point, [1, 0, 0]);
  close(Math.abs(plane.normal[0]), 1);

  const circle = transformCircle3D(transform, circleFromCenterNormalRadius([0, 0, 1], [0, 0, 1], 2));
  closeVector(circle.center, [1, 0, 0]);
  close(circle.radius, 2);

  const sphere = transformSphere3D(dilationTransform3D([0, 0, 0], -3), sphereFromCenterRadius([1, 0, 0], 2));
  closeVector(sphere.center, [-3, 0, 0]);
  close(sphere.radius, 6);

  const polygon = polygonFromPoints3D([[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]]);
  const image = transformPolygon3D(translationTransform3D([0, 0, 3]), polygon);
  close(image.area, 2);
  closeVector(image.centroid, [1, 0.5, 3]);
});

test('polyhedra and round solids retain metrics under rigid motion and dilation', () => {
  const box = parallelepipedFromPointVectors3D([0, 0, 0], [2, 0, 0], [0, 3, 0], [0, 0, 4], true);
  const cylinder = cylinderFromAxisRadius3D([0, 0, 0], [0, 0, 4], 2);
  const cone = coneFromBaseApexRadius3D([0, 0, 0], [0, 0, 3], 2);
  const translation = translationTransform3D([2, 3, 4]);
  const movedBox = transformSolid3D(translation, box);
  const movedCylinder = transformSolid3D(translation, cylinder);
  const movedCone = transformSolid3D(translation, cone);
  close(movedBox.volume, box.volume);
  close(movedCylinder.volume, cylinder.volume);
  close(movedCone.volume, cone.volume);

  const scaledBox = transformSolid3D(dilationTransform3D([0, 0, 0], 2), box);
  const scaledCylinder = transformSolid3D(dilationTransform3D([0, 0, 0], 2), cylinder);
  close(scaledBox.volume, 8 * box.volume);
  close(scaledBox.surfaceArea, 4 * box.surfaceArea);
  close(scaledCylinder.volume, 8 * cylinder.volume);
  close(scaledCylinder.surfaceArea, 4 * cylinder.surfaceArea);
});
