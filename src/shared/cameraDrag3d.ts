import type { Camera3D } from './scene3d';
import type { Vector3 } from './vector3d';

const fullTurn = 2 * Math.PI;

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: Vector3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function normalized(a: Vector3): Vector3 {
  const length = norm(a);
  return length > 1e-12 ? [a[0] / length, a[1] / length, a[2] / length] : [0, 0, 0];
}
function plus(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scaled(a: Vector3, factor: number): Vector3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}
function rotated(vector: Vector3, axis: Vector3, angle: number): Vector3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return plus(plus(scaled(vector, cosine), scaled(cross(axis, vector), sine)),
    scaled(axis, dot(axis, vector) * (1 - cosine)));
}
function wrapped(value: number): number {
  const result = value % fullTurn;
  return result < 0 ? result + fullTurn : result;
}

/** The orthonormal rows used by JSXGraph's View3D projection. */
export function cameraScreenBasis(camera: Camera3D): { right: Vector3; up: Vector3; forward: Vector3 } {
  const ca = Math.cos(camera.azimuth);
  const sa = Math.sin(camera.azimuth);
  const ce = Math.cos(camera.elevation);
  const se = Math.sin(camera.elevation);
  const cb = Math.cos(camera.bank);
  const sb = Math.sin(camera.bank);
  const baseRight: Vector3 = [-ca, sa, 0];
  const baseUp: Vector3 = [-se * sa, -se * ca, ce];
  const right = plus(scaled(baseRight, cb), scaled(baseUp, sb));
  const up = plus(scaled(baseRight, -sb), scaled(baseUp, cb));
  return { right, up, forward: cross(right, up) };
}

function cameraFromBasis(rightValue: Vector3, forwardValue: Vector3, previous: Camera3D): Camera3D {
  const forward = normalized(forwardValue);
  const right = normalized(plus(rightValue, scaled(forward, -dot(rightValue, forward))));
  const horizontal = Math.hypot(forward[0], forward[1]);
  // At a polar view azimuth is undefined; bank preserves the in-plane angle.
  const azimuth = horizontal > 1e-8 ? Math.atan2(forward[0], forward[1]) : previous.azimuth;
  const elevation = Math.atan2(forward[2], horizontal);
  const ca = Math.cos(azimuth);
  const sa = Math.sin(azimuth);
  const baseRight: Vector3 = [-ca, sa, 0];
  const baseUp: Vector3 = [-Math.sin(elevation) * sa, -Math.sin(elevation) * ca, Math.cos(elevation)];
  const bank = Math.atan2(dot(right, baseUp), dot(right, baseRight));
  return { azimuth: wrapped(azimuth), elevation: wrapped(elevation), bank };
}

function trackballPoint(point: readonly [number, number], width: number, height: number): Vector3 {
  const radius = Math.max(80, Math.min(width, height) * 0.48);
  const x = (point[0] - width / 2) / radius;
  const y = (height / 2 - point[1]) / radius;
  const distance = Math.hypot(x, y);
  // The hyperbolic rim keeps rotation responsive outside the central sphere.
  const z = distance < Math.SQRT1_2 ? Math.sqrt(1 - distance * distance) : 0.5 / distance;
  return normalized([x, y, z]);
}

/** Rotate the scene along the right-button cursor path, including free roll. */
export function cameraAfterTrackballDrag(
  camera: Camera3D, from: [number, number], to: [number, number], width: number, height: number
): Camera3D {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !from.every(Number.isFinite) || !to.every(Number.isFinite) ||
      (from[0] === to[0] && from[1] === to[1])) return camera;
  const a = trackballPoint(from, width, height);
  const b = trackballPoint(to, width, height);
  const axis = cross(a, b);
  const axisLength = norm(axis);
  if (axisLength < 1e-10) return camera;
  const angle = Math.atan2(axisLength, Math.max(-1, Math.min(1, dot(a, b))));
  const basis = cameraScreenBasis(camera);
  const screenAxis = scaled(axis, 1 / axisLength);
  const worldAxis = normalized(plus(plus(
    scaled(basis.right, screenAxis[0]), scaled(basis.up, screenAxis[1])),
    scaled(basis.forward, screenAxis[2])));
  // The cursor rotates the projected scene, so the camera basis turns inversely.
  return cameraFromBasis(rotated(basis.right, worldAxis, -angle),
    rotated(basis.forward, worldAxis, -angle), camera);
}

/**
 * Rotate the scene around one fixed world axis. The pointer motion is measured
 * perpendicular to the projected axis, so the selected axis itself remains
 * visually stationary. If the axis points straight through the screen (as it
 * does for the hidden axis of an exact coordinate-plane view), horizontal or
 * vertical motion rolls the visible plane around that axis.
 */
export function cameraAfterAxisDrag(
  camera: Camera3D,
  axisIndex: 0 | 1 | 2,
  delta: readonly [number, number],
  width: number,
  height: number
): Camera3D {
  if (!Number.isInteger(axisIndex) || axisIndex < 0 || axisIndex > 2 ||
      !delta.every(Number.isFinite) || (delta[0] === 0 && delta[1] === 0) ||
      !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return camera;
  const basis = cameraScreenBasis(camera);
  const worldAxis: Vector3 = [0, 0, 0];
  worldAxis[axisIndex] = 1;
  const projectedX = dot(basis.right, worldAxis);
  const projectedY = -dot(basis.up, worldAxis);
  const projectedLength = Math.hypot(projectedX, projectedY);
  let travel: number;
  if (projectedLength > 1e-7) {
    const normalX = -projectedY / projectedLength;
    const normalY = projectedX / projectedLength;
    travel = delta[0] * normalX + delta[1] * normalY;
  } else {
    // At an exact face-on view the hidden axis has no screen direction. Use
    // the dominant cursor component and keep the perceived direction equal
    // when viewing the plane from its opposite side.
    travel = Math.abs(delta[0]) >= Math.abs(delta[1]) ? delta[0] : -delta[1];
    if (dot(basis.forward, worldAxis) < 0) travel = -travel;
  }
  if (Math.abs(travel) < 1e-10) return camera;
  const radius = Math.max(80, Math.min(width, height) * 0.48);
  const angle = travel / radius;
  return cameraFromBasis(
    rotated(basis.right, worldAxis, -angle),
    rotated(basis.forward, worldAxis, -angle),
    camera
  );
}

/** Settle a nearly face-on view precisely on XY, YZ, or XZ. */
export function snapCameraToCoordinatePlane(
  camera: Camera3D, thresholdRadians = 7 * Math.PI / 180
): Camera3D {
  const basis = cameraScreenBasis(camera);
  let axis = 0;
  for (let index = 1; index < 3; index += 1) {
    if (Math.abs(basis.forward[index]) > Math.abs(basis.forward[axis])) axis = index;
  }
  const alignment = Math.abs(basis.forward[axis]);
  if (Math.acos(Math.min(1, alignment)) > thresholdRadians) return camera;
  const forward: Vector3 = [0, 0, 0];
  forward[axis] = basis.forward[axis] < 0 ? -1 : 1;
  const right = normalized(plus(basis.right, scaled(forward, -dot(basis.right, forward))));
  return cameraFromBasis(right, forward, camera);
}
