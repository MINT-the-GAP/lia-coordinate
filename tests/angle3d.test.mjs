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
  angleBetweenLinePlaneArc3,
  angleBetweenLinesArc3,
  angleBetweenPlanesArc3,
  spatialAngleArcPoint3,
  spatialAngleLabelPoint3
} = await import('../src/shared/angle3d.ts');
const { planeFromPointNormal } = await import('../src/shared/plane3d.ts');

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(actual);
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) =>
    assert.ok(Math.abs(value - expected[index]) <= tolerance, String(actual) + ' != ' + String(expected))
  );
};

test('line-line angle uses the intersection and the acute directions', () => {
  const angle = angleBetweenLinesArc3(
    { anchor: [0, 0, 0], direction: [1, 0, 0], domain: 'line' },
    { anchor: [0, 0, 0], direction: [0, -2, 0], domain: 'line' }
  );
  assert.ok(angle);
  assert.ok(Math.abs(angle.radians - Math.PI / 2) < 1e-9);
  close(angle.center, [0, 0, 0]);
  close(spatialAngleArcPoint3(angle, 2, 0), [2, 0, 0]);
  close(spatialAngleArcPoint3(angle, 2, 1), [0, -2, 0]);
  close(spatialAngleLabelPoint3(angle, 2), [Math.SQRT1_2 * 2.56, -Math.SQRT1_2 * 2.56, 0]);
});

test('skew line angle is centered between the closest points', () => {
  const angle = angleBetweenLinesArc3(
    { anchor: [0, 0, 0], direction: [1, 0, 0], domain: 'line' },
    { anchor: [0, 0, 2], direction: [0, 1, 0], domain: 'line' }
  );
  assert.ok(angle);
  close(angle.center, [0, 0, 1]);
  assert.ok(Math.abs(angle.radians - Math.PI / 2) < 1e-9);
});

test('line-plane angle is measured from the projected line direction', () => {
  const plane = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  assert.ok(plane);
  const angle = angleBetweenLinePlaneArc3(
    { anchor: [0, 0, 1], direction: [1, 0, -1], domain: 'line' },
    plane
  );
  assert.ok(angle);
  close(angle.center, [1, 0, 0]);
  assert.ok(Math.abs(angle.radians - Math.PI / 4) < 1e-9);
  close(spatialAngleArcPoint3(angle, 1, 0), [2, 0, 0]);
});

test('plane-plane angle is located on the intersection line', () => {
  const horizontal = planeFromPointNormal([0, 0, 0], [0, 0, 1]);
  const vertical = planeFromPointNormal([0, 0, 0], [1, 0, 0]);
  assert.ok(horizontal && vertical);
  const angle = angleBetweenPlanesArc3(horizontal, vertical);
  assert.ok(angle);
  close(angle.center, [0, 0, 0]);
  assert.ok(Math.abs(angle.radians - Math.PI / 2) < 1e-9);
  assert.ok(spatialAngleArcPoint3(angle, 1, 0.5));
});
