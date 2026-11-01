export type Vector3 = [number, number, number];

export interface Bounds3D {
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

const EPSILON = 1e-12;

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const result: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return result.every(Number.isFinite) ? result : null;
}

export function addVector3(first: readonly number[], second: readonly number[]): Vector3 | null {
  const a = finiteVector(first);
  const b = finiteVector(second);
  return a && b ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : null;
}

export function subtractVector3(first: readonly number[], second: readonly number[]): Vector3 | null {
  const a = finiteVector(first);
  const b = finiteVector(second);
  return a && b ? [a[0] - b[0], a[1] - b[1], a[2] - b[2]] : null;
}

export function scaleVector3(vector: readonly number[], factor: number): Vector3 | null {
  const value = finiteVector(vector);
  const scalar = Number(factor);
  return value && Number.isFinite(scalar)
    ? [value[0] * scalar, value[1] * scalar, value[2] * scalar]
    : null;
}

export function vector3Norm(vector: readonly number[]): number {
  const value = finiteVector(vector);
  return value ? Math.hypot(value[0], value[1], value[2]) : NaN;
}

export function normalizeVector3(vector: readonly number[]): Vector3 | null {
  const value = finiteVector(vector);
  if (!value) return null;
  const length = vector3Norm(value);
  return Number.isFinite(length) && length > EPSILON
    ? [value[0] / length, value[1] / length, value[2] / length]
    : null;
}

export function vector3Endpoint(anchor: readonly number[], components: readonly number[]): Vector3 | null {
  return addVector3(anchor, components);
}

export function vector3Components(start: readonly number[], end: readonly number[]): Vector3 | null {
  return subtractVector3(end, start);
}

function normalizedBounds(bounds: Bounds3D): [Vector3, Vector3] | null {
  const lower: Vector3 = [Number(bounds?.x?.[0]), Number(bounds?.y?.[0]), Number(bounds?.z?.[0])];
  const upper: Vector3 = [Number(bounds?.x?.[1]), Number(bounds?.y?.[1]), Number(bounds?.z?.[1])];
  if (!lower.every(Number.isFinite) || !upper.every(Number.isFinite)) return null;
  if (upper.some((value, index) => value <= lower[index])) return null;
  return [lower, upper];
}

export function clipParametricLine3D(
  anchorValue: readonly number[],
  directionValue: readonly number[],
  bounds: Bounds3D,
  range: [number, number] = [-Infinity, Infinity]
): [Vector3, Vector3] | null {
  const anchor = finiteVector(anchorValue);
  const direction = finiteVector(directionValue);
  const box = normalizedBounds(bounds);
  if (!anchor || !direction || !box || vector3Norm(direction) <= EPSILON) return null;
  let enter = Number(range[0]);
  let exit = Number(range[1]);
  if (Number.isNaN(enter) || Number.isNaN(exit) || exit < enter) return null;
  const [lower, upper] = box;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = direction[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (anchor[axis] < lower[axis] - EPSILON || anchor[axis] > upper[axis] + EPSILON) return null;
      continue;
    }
    const first = (lower[axis] - anchor[axis]) / delta;
    const second = (upper[axis] - anchor[axis]) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (exit < enter - EPSILON) return null;
  }
  if (!Number.isFinite(enter) || !Number.isFinite(exit)) return null;
  const startDelta = scaleVector3(direction, enter);
  const endDelta = scaleVector3(direction, exit);
  const start = startDelta ? addVector3(anchor, startDelta) : null;
  const end = endDelta ? addVector3(anchor, endDelta) : null;
  return start && end ? [start, end] : null;
}

export function clipInfiniteLine3D(
  first: readonly number[],
  second: readonly number[],
  bounds: Bounds3D
): [Vector3, Vector3] | null {
  const direction = subtractVector3(second, first);
  return direction ? clipParametricLine3D(first, direction, bounds) : null;
}

export function clipRay3D(
  start: readonly number[],
  through: readonly number[],
  bounds: Bounds3D
): [Vector3, Vector3] | null {
  const direction = subtractVector3(through, start);
  return direction ? clipParametricLine3D(start, direction, bounds, [0, Infinity]) : null;
}
