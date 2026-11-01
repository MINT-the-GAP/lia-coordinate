import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cameraAfterAxisDrag,
  cameraAfterTrackballDrag,
  cameraScreenBasis,
  snapCameraToCoordinatePlane
} from '../src/shared/cameraDrag3d.ts';

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, String(actual) + ' != ' + String(expected));
const closeVector = (actual, expected, tolerance = 1e-10) =>
  actual.forEach((value, index) => close(value, expected[index], tolerance));
const projected = (basis, vector) => [
  dot(basis.right, vector), dot(basis.up, vector), dot(basis.forward, vector)
];

test('camera screen basis stays orthonormal and right handed with bank and polar views', () => {
  for (const camera of [
    { azimuth: 0.8, elevation: 0.45, bank: 0.3 },
    { azimuth: 4.7, elevation: -1.2, bank: -2.1 },
    { azimuth: 0.3, elevation: Math.PI / 2, bank: 1.7 }
  ]) {
    const { right, up, forward } = cameraScreenBasis(camera);
    for (const axis of [right, up, forward]) close(dot(axis, axis), 1);
    close(dot(right, up), 0);
    close(dot(right, forward), 0);
    close(dot(up, forward), 0);
    closeVector(cross(right, up), forward);
  }
});

test('a center drag moves the scene toward the pointer horizontally and vertically', () => {
  const camera = { azimuth: 0.8, elevation: 0.45, bank: 0.3 };
  const before = cameraScreenBasis(camera);
  const from = [200, 200];
  const radius = 400 * 0.48;
  const expectedShift = 80 / radius;
  const expectedDepth = Math.sqrt(1 - expectedShift ** 2);

  const horizontal = cameraScreenBasis(cameraAfterTrackballDrag(camera, from, [280, 200], 400, 400));
  closeVector(projected(horizontal, before.forward), [expectedShift, 0, expectedDepth]);

  const vertical = cameraScreenBasis(cameraAfterTrackballDrag(camera, from, [200, 120], 400, 400));
  closeVector(projected(vertical, before.forward), [0, expectedShift, expectedDepth]);
});

test('off-center drags rotate the scene freely and reversing a drag restores the view', () => {
  const camera = { azimuth: 1.1, elevation: -0.35, bank: 0.2 };
  const before = cameraScreenBasis(camera);
  const radius = 400 * 0.48;
  const offset = 120 / radius;
  const depth = Math.sqrt(1 - offset ** 2);
  const point = before.right.map((value, index) => value * offset + before.forward[index] * depth);
  const moved = cameraAfterTrackballDrag(camera, [320, 200], [200, 80], 400, 400);
  closeVector(projected(cameraScreenBasis(moved), point), [0, offset, depth]);

  const restored = cameraAfterTrackballDrag(moved, [200, 80], [320, 200], 400, 400);
  const after = cameraScreenBasis(restored);
  closeVector(after.right, before.right);
  closeVector(after.up, before.up);
  closeVector(after.forward, before.forward);
});

test('axis-constrained drags keep the selected world axis fixed on screen', () => {
  const initial = { azimuth: 0.8, elevation: 0.45, bank: 0.3 };
  const worldAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const axisIndex of [0, 1, 2]) {
    const before = cameraScreenBasis(initial);
    const axisProjection = projected(before, worldAxes[axisIndex]);
    const screenLength = Math.hypot(axisProjection[0], axisProjection[1]);
    const delta = [
      axisProjection[1] / screenLength * 70,
      axisProjection[0] / screenLength * 70
    ];
    const movedCamera = cameraAfterAxisDrag(initial, axisIndex, delta, 500, 400);
    const moved = cameraScreenBasis(movedCamera);
    closeVector(projected(moved, worldAxes[axisIndex]), axisProjection);
    assert.ok(Math.abs(dot(moved.forward, before.forward)) < .999,
      'axis ' + axisIndex + ' did not rotate the other directions');
    const restored = cameraAfterAxisDrag(movedCamera, axisIndex, [-delta[0], -delta[1]], 500, 400);
    closeVector(cameraScreenBasis(restored).right, before.right);
    closeVector(cameraScreenBasis(restored).up, before.up);
    closeVector(cameraScreenBasis(restored).forward, before.forward);
  }
});

test('origin drags in exact XY, YZ and XZ views roll around the hidden axis', () => {
  const cases = [
    [{ azimuth: .8, elevation: Math.PI / 2, bank: .2 }, 2],
    [{ azimuth: Math.PI / 2, elevation: 0, bank: .2 }, 0],
    [{ azimuth: 0, elevation: 0, bank: .2 }, 1]
  ];
  for (const [camera, axisIndex] of cases) {
    const before = cameraScreenBasis(camera);
    const moved = cameraScreenBasis(cameraAfterAxisDrag(camera, axisIndex, [70, 0], 500, 400));
    const hiddenAxis = [0, 0, 0];
    hiddenAxis[axisIndex] = 1;
    closeVector(moved.forward, before.forward);
    closeVector(projected(moved, hiddenAxis), projected(before, hiddenAxis));
    assert.ok(dot(moved.right, before.right) < .995, 'hidden axis ' + axisIndex + ' did not roll the plane');
  }
});

test('repeated vertical drags pass both poles and complete a full turn', () => {
  const initial = { azimuth: 0.6, elevation: 0.2, bank: -0.4 };
  const before = cameraScreenBasis(initial);
  const radius = 400 * 0.48;
  const sixtyDegreeOffset = radius * Math.sqrt(Math.tan(Math.PI / 3) / 2);
  let camera = initial;
  for (let step = 1; step <= 6; step += 1) {
    camera = cameraAfterTrackballDrag(camera, [200, 200], [200, 200 - sixtyDegreeOffset], 400, 400);
    if (step === 3) close(dot(cameraScreenBasis(camera).forward, before.forward), -1);
  }
  const after = cameraScreenBasis(camera);
  closeVector(after.right, before.right);
  closeVector(after.up, before.up);
  closeVector(after.forward, before.forward);
});

test('nearby XY, YZ and XZ views snap to exact face-on normals without flipping the screen', () => {
  const cases = [
    [{ azimuth: 0.8, elevation: Math.PI / 2 - 0.04, bank: 0.25 }, [0, 0, 1]],
    [{ azimuth: -0.6, elevation: -Math.PI / 2 + 0.04, bank: -0.2 }, [0, 0, -1]],
    [{ azimuth: Math.PI / 2 - 0.04, elevation: 0.02, bank: 0.35 }, [1, 0, 0]],
    [{ azimuth: 3 * Math.PI / 2 + 0.04, elevation: -0.02, bank: -0.35 }, [-1, 0, 0]],
    [{ azimuth: 0.04, elevation: 0.03, bank: 0.2 }, [0, 1, 0]],
    [{ azimuth: Math.PI + 0.04, elevation: -0.03, bank: -0.2 }, [0, -1, 0]]
  ];
  for (const [camera, normal] of cases) {
    const before = cameraScreenBasis(camera);
    const snapped = snapCameraToCoordinatePlane(camera);
    assert.notStrictEqual(snapped, camera);
    const after = cameraScreenBasis(snapped);
    closeVector(after.forward, normal, 1e-12);
    assert.ok(dot(after.right, before.right) > 0.99);
  }
});

test('snap threshold leaves other views unchanged, and invalid drags preserve the camera', () => {
  const camera = { azimuth: 0.5, elevation: 0.4, bank: -0.2 };
  assert.strictEqual(snapCameraToCoordinatePlane(camera), camera);
  const exactFace = { azimuth: 0, elevation: 0, bank: 0.3 };
  closeVector(cameraScreenBasis(snapCameraToCoordinatePlane(exactFace)).forward, [0, 1, 0]);
  assert.strictEqual(cameraAfterTrackballDrag(camera, [200, 200], [200, 200], 400, 400), camera);
  assert.strictEqual(cameraAfterTrackballDrag(camera, [200, 200], [240, 200], 0, 400), camera);
  assert.strictEqual(cameraAfterTrackballDrag(camera, [NaN, 200], [240, 200], 400, 400), camera);
  assert.strictEqual(cameraAfterAxisDrag(camera, 0, [0, 0], 400, 400), camera);
  assert.strictEqual(cameraAfterAxisDrag(camera, 0, [20, 0], 0, 400), camera);
});
