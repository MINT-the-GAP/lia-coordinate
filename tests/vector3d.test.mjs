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
  addVector3,
  clipInfiniteLine3D,
  clipRay3D,
  normalizeVector3,
  scaleVector3,
  subtractVector3,
  vector3Components,
  vector3Endpoint,
  vector3Norm
} from '../src/shared/vector3d.ts';
import {
  createLinear3DRecord,
  createSceneState,
  deserializeSceneState,
  serializeSceneState
} from '../src/shared/scene3d.ts';

const bounds = { x: [-2, 2], y: [-3, 3], z: [-4, 4] };

test('3D vector arithmetic covers addition, subtraction, scaling, norm, and normalization', () => {
  assert.deepEqual(addVector3([1, -2, 0.5], [-4, 3, 1.5]), [-3, 1, 2]);
  assert.deepEqual(subtractVector3([1, -2, 0.5], [-4, 3, 1.5]), [5, -5, -1]);
  assert.deepEqual(scaleVector3([1, -2, 0.5], -2), [-2, 4, -1]);
  assert.equal(vector3Norm([2, -3, 6]), 7);
  assert.deepEqual(normalizeVector3([0, 3, 4]), [0, 0.6, 0.8]);
  assert.equal(normalizeVector3([0, 0, 0]), null);
});

test('free-vector endpoint and point-vector components are inverse operations', () => {
  const endpoint = vector3Endpoint([1.25, -2, 0.5], [-3, 4.5, 2]);
  assert.deepEqual(endpoint, [-1.75, 2.5, 2.5]);
  assert.deepEqual(vector3Components([1.25, -2, 0.5], endpoint), [-3, 4.5, 2]);
});

test('infinite lines and rays clip against every axis of a 3D box', () => {
  assert.deepEqual(clipInfiniteLine3D([-4, -2, -1], [4, 2, 1], bounds), [
    [-2, -1, -0.5], [2, 1, 0.5]
  ]);
  assert.deepEqual(clipRay3D([0, 0, 0], [-1, 0.5, 2], bounds), [
    [0, 0, 0], [-2, 1, 4]
  ]);
  assert.equal(clipRay3D([3, 0, 0], [4, 0, 0], bounds), null);
});

test('invalid and non-finite vector inputs fail without leaking invalid coordinates', () => {
  assert.equal(addVector3([1, 2, Infinity], [0, 0, 0]), null);
  assert.equal(scaleVector3([1, 2, 3], NaN), null);
  assert.ok(Number.isNaN(vector3Norm([1, 2, NaN])));
  assert.equal(clipInfiniteLine3D([0, 0, 0], [0, 0, 0], bounds), null);
  assert.equal(clipInfiniteLine3D([0, 0, 0], [1, 1, 1], { ...bounds, z: [2, 2] }), null);
});

test('all linear 3D records survive scene serialization', () => {
  const records = [
    createLinear3DRecord('segment3d', 's-1', ['A', 'B'], { name: 's' }),
    createLinear3DRecord('line3d', 'g-1', ['A', 'C'], { fixed: true }),
    createLinear3DRecord('ray3d', 'r-1', ['B', 'C'], { visible: false }),
    createLinear3DRecord('vector3d', 'v-1', ['A', 'B'], { definition: 'points' }),
    createLinear3DRecord('vector3d', 'v-2', ['A', ''], {
      definition: 'components', anchorPointId: 'A', components: [-1.5, 2.25, 0.5]
    })
  ];
  const scene = createSceneState({ mode: '3d', viewMode: '3d', objects: records });
  assert.deepEqual(deserializeSceneState(serializeSceneState(scene)).objects, records);
});
