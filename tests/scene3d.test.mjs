import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  }
});

import {
  createSceneState,
  deserializeSceneState,
  normalizeProjection3D,
  normalizeSceneMode,
  serializeSceneState
} from '../src/shared/scene3d.ts';

const { parseCoordSpec } = await import('../src/shared/coordSpec.ts');

test('scene defaults preserve the existing two-dimensional mode', () => {
  const scene = createSceneState();
  assert.equal(scene.mode, '2d');
  assert.equal(scene.viewMode, '2d');
  assert.deepEqual(scene.bounds.z, [-4, 4]);
});

test('mode and projection aliases are normalized', () => {
  assert.equal(normalizeSceneMode('3D'), '3d');
  assert.equal(normalizeSceneMode('unknown'), '2d');
  assert.equal(normalizeProjection3D('perspective'), 'central');
  assert.equal(normalizeProjection3D('orthographic'), 'parallel');
});

test('scene state survives a JSON roundtrip with 3D coordinates and camera', () => {
  const before = createSceneState({
    mode: '3d', viewMode: '2d', projection: 'central',
    camera: { azimuth: 1.2, elevation: 0.4, bank: 0.1 },
    bounds: { x: [-5, 5], y: [-4, 4], z: [-2, 8] },
    objects: [{ id: 'P', kind: 'point', dimension: 3, coordinates: [1, 2, 3] }]
  });
  assert.deepEqual(deserializeSceneState(serializeSceneState(before)), before);
});
test('coordinate specs parse 3D bounds, camera, view and projection without changing 2D defaults', () => {
  const planar = parseCoordSpec('id=A1');
  assert.equal(planar.mode, '2d');
  assert.equal(planar.viewMode, '2d');
  assert.equal(planar.projection, 'parallel');

  const spatial = parseCoordSpec('id=S;mode=3d;view=2d;zmin=-2;zmax=7;projection=central;camera=1.2/0.4/0.1');
  assert.equal(spatial.mode, '3d');
  assert.equal(spatial.viewMode, '2d');
  assert.deepEqual([spatial.zmin, spatial.zmax], [-2, 7]);
  assert.equal(spatial.projection, 'central');
  assert.deepEqual(spatial.camera, { azimuth: 1.2, elevation: 0.4, bank: 0.1 });
});

test('invalid z bounds are repaired deterministically', () => {
  const config = parseCoordSpec('mode=3d;zmin=5;zmax=2');
  assert.deepEqual([config.zmin, config.zmax], [5, 6]);
});
test('missing and invalid spatial options retain finite backwards-compatible defaults', () => {
  const config = parseCoordSpec('id=invalid;mode=3d;zmin=nope;zmax=;projection=unknown;camera=nope//also-nope');
  assert.deepEqual([config.zmin, config.zmax], [-4, 4]);
  assert.equal(config.projection, 'parallel');
  assert.deepEqual(config.camera, { azimuth: 0.9, elevation: 0.45, bank: 0 });
});
test('3D pan and zoom survive scene and macro roundtrips independently of 2D bounds', () => {
  const viewport3d = [[-12.5, -4.5], [7.25, 13.25], [-1, 7]];
  const before = createSceneState({ mode: '3d', viewport3d });
  assert.deepEqual(deserializeSceneState(serializeSceneState(before)).viewport3d, viewport3d);
  const imported = parseCoordSpec('id=S;mode=3d;view=2d;xmin=-4;xmax=4;ymin=-3;ymax=3;viewport3d=['
    + viewport3d.flat().join(';') + ']');
  assert.deepEqual(imported.viewport3d, viewport3d);
  assert.deepEqual([imported.xmin, imported.xmax, imported.ymin, imported.ymax], [-4, 4, -3, 3]);
  assert.equal(imported.viewMode, '2d');
  viewport3d[0][0] = 999;
  assert.equal(before.viewport3d[0][0], -12.5, 'stored viewport must not alias mutable live ranges');
});

test('old and malformed viewport options retain the legacy construction bounds', () => {
  for (const option of ['', '[0;1;0;1]', '[0;0;0;1;0;1]', '[0;1;0;1;Infinity;2]',
    '[0;1;0;1;nope;2]', '[0;1;0;1;;2]', '[0;1;0;1;2x;3]']) {
    const config = parseCoordSpec('mode=3d;xmin=-6;xmax=6;viewport3d=' + option);
    assert.equal(config.viewport3d, undefined);
    assert.deepEqual([config.xmin, config.xmax], [-6, 6]);
  }
  assert.equal(createSceneState({ viewport3d: [[0, 1], [0, 1], [2, 1]] }).viewport3d, undefined);
});