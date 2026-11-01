import {
  addVector3,
  normalizeVector3,
  scaleVector3,
  subtractVector3,
  vector3Norm,
  type Bounds3D,
  type Vector3
} from './vector3d';

export interface Plane3 {
  point: Vector3;
  direction1: Vector3;
  direction2: Vector3;
  normal: Vector3;
  coefficients: [number, number, number, number];
}

export type LinearDomain3D = 'line' | 'ray' | 'segment' | 'vector';

export interface LineLineIntersection3D {
  kind: 'point' | 'parallel' | 'coincident' | 'skew' | 'outside' | 'invalid';
  point?: Vector3;
  firstParameter?: number;
  secondParameter?: number;
}

export interface LinePlaneIntersection3D {
  kind: 'point' | 'parallel' | 'contained' | 'outside' | 'invalid';
  point?: Vector3;
  parameter?: number;
}

export interface PlanePlaneIntersection3D {
  kind: 'line' | 'parallel' | 'coincident' | 'invalid';
  point?: Vector3;
  direction?: Vector3;
}

const BASE_EPSILON = 1e-10;

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const vector: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return vector.every(Number.isFinite) ? vector : null;
}

function scaleOf(...vectors: ReadonlyArray<readonly number[]>): number {
  let scale = 1;
  vectors.forEach(vector => {
    const norm = vector3Norm(vector);
    if (Number.isFinite(norm)) scale = Math.max(scale, norm);
  });
  return scale;
}

export function planeTolerance(...vectors: ReadonlyArray<readonly number[]>): number {
  return BASE_EPSILON * scaleOf(...vectors);
}

export function dotVector3(first: readonly number[], second: readonly number[]): number {
  const a = finiteVector(first);
  const b = finiteVector(second);
  return a && b ? a[0] * b[0] + a[1] * b[1] + a[2] * b[2] : NaN;
}

export function crossVector3(first: readonly number[], second: readonly number[]): Vector3 | null {
  const a = finiteVector(first);
  const b = finiteVector(second);
  if (!a || !b) return null;
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function stablePlaneDirections(normal: Vector3): [Vector3, Vector3] | null {
  const helper: Vector3 = Math.abs(normal[0]) <= Math.abs(normal[1]) && Math.abs(normal[0]) <= Math.abs(normal[2])
    ? [1, 0, 0]
    : (Math.abs(normal[1]) <= Math.abs(normal[2]) ? [0, 1, 0] : [0, 0, 1]);
  const first = normalizeVector3(crossVector3(normal, helper) || []);
  const second = first && normalizeVector3(crossVector3(normal, first) || []);
  return first && second ? [first, second] : null;
}

function normalizedPlane(pointValue: readonly number[], normalValue: readonly number[], directions?: [readonly number[], readonly number[]]): Plane3 | null {
  const point = finiteVector(pointValue);
  const normal = normalizeVector3(normalValue);
  if (!point || !normal) return null;
  const tolerance = planeTolerance(point, normalValue);
  if (!(vector3Norm(normalValue) > tolerance)) return null;
  let direction1: Vector3 | null = directions ? finiteVector(directions[0]) : null;
  let direction2: Vector3 | null = directions ? finiteVector(directions[1]) : null;
  if (direction1 && direction2) {
    direction1 = normalizeVector3(direction1);
    const projection = direction1 ? scaleVector3(direction1, dotVector3(direction2, direction1)) : null;
    direction2 = projection ? normalizeVector3(subtractVector3(direction2, projection) || []) : null;
  } else {
    const stable = stablePlaneDirections(normal);
    direction1 = stable?.[0] || null;
    direction2 = stable?.[1] || null;
  }
  if (!direction1 || !direction2) return null;
  const d = -dotVector3(normal, point);
  if (!Number.isFinite(d)) return null;
  return {
    point,
    direction1,
    direction2,
    normal,
    coefficients: [normal[0], normal[1], normal[2], d]
  };
}

export function planeFromPointNormal(point: readonly number[], normal: readonly number[]): Plane3 | null {
  return normalizedPlane(point, normal);
}

export function planeFromPointVectors(
  point: readonly number[],
  direction1: readonly number[],
  direction2: readonly number[]
): Plane3 | null {
  const cross = crossVector3(direction1, direction2);
  if (!cross || vector3Norm(cross) <= planeTolerance(direction1, direction2) * scaleOf(direction1, direction2)) return null;
  return normalizedPlane(point, cross, [direction1, direction2]);
}

export function planeFromThreePoints(
  first: readonly number[],
  second: readonly number[],
  third: readonly number[]
): Plane3 | null {
  const direction1 = subtractVector3(second, first);
  const direction2 = subtractVector3(third, first);
  return direction1 && direction2 ? planeFromPointVectors(first, direction1, direction2) : null;
}

export function signedDistancePointPlane(pointValue: readonly number[], plane: Plane3): number {
  const point = finiteVector(pointValue);
  return point ? dotVector3(plane.normal, point) + plane.coefficients[3] : NaN;
}

export function distancePointPlane(point: readonly number[], plane: Plane3): number {
  const signed = signedDistancePointPlane(point, plane);
  return Number.isFinite(signed) ? Math.abs(signed) : NaN;
}

export function projectPointToPlane(pointValue: readonly number[], plane: Plane3): Vector3 | null {
  const point = finiteVector(pointValue);
  const distance = point ? signedDistancePointPlane(point, plane) : NaN;
  const offset = Number.isFinite(distance) ? scaleVector3(plane.normal, -distance) : null;
  return point && offset ? addVector3(point, offset) : null;
}

export function parameterAllowed3D(parameter: number, domain: LinearDomain3D, tolerance = BASE_EPSILON): boolean {
  if (!Number.isFinite(parameter)) return false;
  if (domain === 'line') return true;
  if (domain === 'ray') return parameter >= -tolerance;
  return parameter >= -tolerance && parameter <= 1 + tolerance;
}

export function intersectLinePlane3D(
  anchorValue: readonly number[],
  directionValue: readonly number[],
  plane: Plane3,
  domain: LinearDomain3D = 'line'
): LinePlaneIntersection3D {
  const anchor = finiteVector(anchorValue);
  const direction = finiteVector(directionValue);
  if (!anchor || !direction || vector3Norm(direction) <= planeTolerance(anchor, direction)) return { kind: 'invalid' };
  const denominator = dotVector3(plane.normal, direction);
  const numerator = -(dotVector3(plane.normal, anchor) + plane.coefficients[3]);
  const tolerance = planeTolerance(anchor, direction, plane.point);
  if (Math.abs(denominator) <= tolerance) {
    return Math.abs(numerator) <= tolerance ? { kind: 'contained' } : { kind: 'parallel' };
  }
  const parameter = numerator / denominator;
  if (!parameterAllowed3D(parameter, domain, tolerance)) return { kind: 'outside', parameter };
  const offset = scaleVector3(direction, parameter);
  const point = offset && addVector3(anchor, offset);
  return point ? { kind: 'point', point, parameter } : { kind: 'invalid' };
}

export function intersectLines3D(
  firstAnchorValue: readonly number[],
  firstDirectionValue: readonly number[],
  secondAnchorValue: readonly number[],
  secondDirectionValue: readonly number[],
  firstDomain: LinearDomain3D = 'line',
  secondDomain: LinearDomain3D = 'line'
): LineLineIntersection3D {
  const p = finiteVector(firstAnchorValue);
  const u = finiteVector(firstDirectionValue);
  const q = finiteVector(secondAnchorValue);
  const v = finiteVector(secondDirectionValue);
  if (!p || !u || !q || !v || vector3Norm(u) <= planeTolerance(u) || vector3Norm(v) <= planeTolerance(v)) {
    return { kind: 'invalid' };
  }
  const w0 = subtractVector3(p, q)!;
  const a = dotVector3(u, u);
  const b = dotVector3(u, v);
  const c = dotVector3(v, v);
  const d = dotVector3(u, w0);
  const e = dotVector3(v, w0);
  const denominator = a * c - b * b;
  const tolerance = planeTolerance(p, q, u, v);
  if (Math.abs(denominator) <= tolerance * Math.max(1, a * c)) {
    const separation = crossVector3(w0, u);
    return separation && vector3Norm(separation) <= tolerance * Math.max(1, vector3Norm(u))
      ? { kind: 'coincident' }
      : { kind: 'parallel' };
  }
  const firstParameter = (b * e - c * d) / denominator;
  const secondParameter = (a * e - b * d) / denominator;
  const firstOffset = scaleVector3(u, firstParameter);
  const secondOffset = scaleVector3(v, secondParameter);
  const firstPoint = firstOffset && addVector3(p, firstOffset);
  const secondPoint = secondOffset && addVector3(q, secondOffset);
  if (!firstPoint || !secondPoint) return { kind: 'invalid' };
  const gap = subtractVector3(firstPoint, secondPoint);
  if (!gap || vector3Norm(gap) > tolerance * Math.max(1, scaleOf(firstPoint, secondPoint))) {
    return { kind: 'skew', firstParameter, secondParameter };
  }
  if (!parameterAllowed3D(firstParameter, firstDomain, tolerance) ||
      !parameterAllowed3D(secondParameter, secondDomain, tolerance)) {
    return { kind: 'outside', firstParameter, secondParameter };
  }
  return {
    kind: 'point',
    point: [
      (firstPoint[0] + secondPoint[0]) / 2,
      (firstPoint[1] + secondPoint[1]) / 2,
      (firstPoint[2] + secondPoint[2]) / 2
    ],
    firstParameter,
    secondParameter
  };
}

export function intersectPlanes3D(first: Plane3, second: Plane3): PlanePlaneIntersection3D {
  const directionRaw = crossVector3(first.normal, second.normal);
  const tolerance = planeTolerance(first.point, second.point);
  if (!directionRaw || vector3Norm(directionRaw) <= tolerance) {
    return distancePointPlane(second.point, first) <= tolerance ? { kind: 'coincident' } : { kind: 'parallel' };
  }
  const direction = normalizeVector3(directionRaw);
  const squared = dotVector3(directionRaw, directionRaw);
  const firstScaled = scaleVector3(second.normal, first.coefficients[3]);
  const secondScaled = scaleVector3(first.normal, second.coefficients[3]);
  const difference = firstScaled && secondScaled ? subtractVector3(secondScaled, firstScaled) : null;
  const cross = difference && crossVector3(difference, directionRaw);
  const point = cross && scaleVector3(cross, 1 / squared);
  return direction && point ? { kind: 'line', point, direction } : { kind: 'invalid' };
}

function boxCorners(bounds: Bounds3D): Vector3[] | null {
  const values = [bounds?.x, bounds?.y, bounds?.z];
  if (values.some(range => !Array.isArray(range) || range.length < 2 ||
      !Number.isFinite(Number(range[0])) || !Number.isFinite(Number(range[1])) ||
      Number(range[1]) <= Number(range[0]))) return null;
  const [x, y, z] = values as [[number, number], [number, number], [number, number]];
  return [
    [x[0], y[0], z[0]], [x[1], y[0], z[0]], [x[0], y[1], z[0]], [x[1], y[1], z[0]],
    [x[0], y[0], z[1]], [x[1], y[0], z[1]], [x[0], y[1], z[1]], [x[1], y[1], z[1]]
  ];
}

const BOX_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
];

export function clipPlaneToBounds3D(plane: Plane3, bounds: Bounds3D): Vector3[] {
  const corners = boxCorners(bounds);
  if (!corners) return [];
  const scale = Math.max(...corners.map(corner => scaleOf(corner)));
  const tolerance = BASE_EPSILON * scale;
  const points: Vector3[] = [];
  const addUnique = (point: Vector3): void => {
    if (!point.every(Number.isFinite)) return;
    if (!points.some(existing => vector3Norm(subtractVector3(existing, point) || []) <= tolerance * 8)) points.push(point);
  };
  BOX_EDGES.forEach(([firstIndex, secondIndex]) => {
    const first = corners[firstIndex];
    const second = corners[secondIndex];
    const firstDistance = signedDistancePointPlane(first, plane);
    const secondDistance = signedDistancePointPlane(second, plane);
    if (Math.abs(firstDistance) <= tolerance) addUnique(first);
    if (Math.abs(secondDistance) <= tolerance) addUnique(second);
    if (firstDistance * secondDistance < -tolerance * tolerance) {
      const ratio = firstDistance / (firstDistance - secondDistance);
      const delta = subtractVector3(second, first);
      const offset = delta && scaleVector3(delta, ratio);
      const point = offset && addVector3(first, offset);
      if (point) addUnique(point);
    }
  });
  if (points.length < 3) return [];
  const centroid: Vector3 = [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
    points.reduce((sum, point) => sum + point[2], 0) / points.length
  ];
  return points.sort((first, second) => {
    const a = subtractVector3(first, centroid)!;
    const b = subtractVector3(second, centroid)!;
    const angleA = Math.atan2(dotVector3(a, plane.direction2), dotVector3(a, plane.direction1));
    const angleB = Math.atan2(dotVector3(b, plane.direction2), dotVector3(b, plane.direction1));
    return angleA - angleB;
  });
}