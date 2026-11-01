import { addVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3 } from './vector3d';
import {
  dotVector3, intersectLinePlane3D, planeFromThreePoints, projectPointToPlane,
  type LinearDomain3D, type Plane3
} from './plane3d';

export type Vector2 = [number, number];
export interface PolygonBinding3D { u: number; v: number; }
export interface Polygon3 {
  vertices: Vector3[];
  plane: Plane3;
  normal: Vector3;
  localVertices: Vector2[];
  signedArea: number;
  area: number;
  perimeter: number;
  centroid: Vector3;
}
export interface LinePolygonIntersection3D {
  kind: 'none' | 'point' | 'contained' | 'outside' | 'invalid';
  point?: Vector3;
  parameter?: number;
}

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const vector: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return vector.every(Number.isFinite) ? vector : null;
}
function local(point: Vector3, plane: Plane3): Vector2 {
  const delta = subtractVector3(point, plane.point)!;
  return [dotVector3(delta, plane.direction1), dotVector3(delta, plane.direction2)];
}
function spatial(point: Vector2, plane: Plane3): Vector3 | null {
  const first = scaleVector3(plane.direction1, point[0]);
  const second = scaleVector3(plane.direction2, point[1]);
  return first && second ? addVector3(addVector3(plane.point, first) || [], second) : null;
}
function signedArea(vertices: readonly Vector2[]): number {
  let sum = 0;
  vertices.forEach((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    sum += point[0] * next[1] - next[0] * point[1];
  });
  return sum / 2;
}
function turn(a: Vector2, b: Vector2, c: Vector2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function onSegment(point: Vector2, a: Vector2, b: Vector2, tolerance: number): boolean {
  return Math.abs(turn(a, b, point)) <= tolerance &&
    point[0] >= Math.min(a[0], b[0]) - tolerance && point[0] <= Math.max(a[0], b[0]) + tolerance &&
    point[1] >= Math.min(a[1], b[1]) - tolerance && point[1] <= Math.max(a[1], b[1]) + tolerance;
}
function segmentsIntersect(a: Vector2, b: Vector2, c: Vector2, d: Vector2, tolerance: number): boolean {
  const values = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
  if (((values[0] > tolerance && values[1] < -tolerance) || (values[0] < -tolerance && values[1] > tolerance)) &&
      ((values[2] > tolerance && values[3] < -tolerance) || (values[2] < -tolerance && values[3] > tolerance))) return true;
  return (Math.abs(values[0]) <= tolerance && onSegment(c, a, b, tolerance)) ||
    (Math.abs(values[1]) <= tolerance && onSegment(d, a, b, tolerance)) ||
    (Math.abs(values[2]) <= tolerance && onSegment(a, c, d, tolerance)) ||
    (Math.abs(values[3]) <= tolerance && onSegment(b, c, d, tolerance));
}
function isSimple(vertices: readonly Vector2[], tolerance: number): boolean {
  for (let first = 0; first < vertices.length; first += 1) {
    const firstNext = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondNext = (second + 1) % vertices.length;
      if (firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(vertices[first], vertices[firstNext], vertices[second], vertices[secondNext], tolerance)) return false;
    }
  }
  return true;
}
function carrierPlane(vertices: readonly Vector3[]): Plane3 | null {
  for (let second = 1; second < vertices.length - 1; second += 1) {
    for (let third = second + 1; third < vertices.length; third += 1) {
      const plane = planeFromThreePoints(vertices[0], vertices[second], vertices[third]);
      if (plane) return plane;
    }
  }
  return null;
}
export function polygonTolerance3D(vertices: ReadonlyArray<readonly number[]>): number {
  return 1e-10 * Math.max(1, ...vertices.map(vector3Norm).filter(Number.isFinite));
}
export function polygonFromPoints3D(values: ReadonlyArray<readonly number[]>): Polygon3 | null {
  if (!Array.isArray(values) || values.length < 3) return null;
  const converted = values.map(finiteVector);
  if (converted.some(point => !point)) return null;
  const vertices = converted as Vector3[];
  const tolerance = polygonTolerance3D(vertices);
  if (vertices.some((point, index) =>
    vector3Norm(subtractVector3(point, vertices[(index + 1) % vertices.length]) || []) <= tolerance)) return null;
  const plane = carrierPlane(vertices);
  if (!plane || vertices.some(point =>
    Math.abs(dotVector3(subtractVector3(point, plane.point) || [], plane.normal)) > tolerance)) return null;
  const localVertices = vertices.map(point => local(point, plane));
  if (!isSimple(localVertices, tolerance)) return null;
  const orientedArea = signedArea(localVertices);
  if (!Number.isFinite(orientedArea) || Math.abs(orientedArea) <= tolerance * tolerance) return null;
  let perimeter = 0;
  let centroidU = 0;
  let centroidV = 0;
  localVertices.forEach((point, index) => {
    const nextLocal = localVertices[(index + 1) % localVertices.length];
    const nextSpatial = vertices[(index + 1) % vertices.length];
    const cross = point[0] * nextLocal[1] - nextLocal[0] * point[1];
    centroidU += (point[0] + nextLocal[0]) * cross;
    centroidV += (point[1] + nextLocal[1]) * cross;
    perimeter += vector3Norm(subtractVector3(nextSpatial, vertices[index]) || []);
  });
  const centroid = spatial([centroidU / (6 * orientedArea), centroidV / (6 * orientedArea)], plane);
  if (!centroid || !Number.isFinite(perimeter)) return null;
  return {
    vertices: vertices.map(point => point.slice() as Vector3),
    plane,
    normal: orientedArea >= 0 ? plane.normal.slice() as Vector3 : scaleVector3(plane.normal, -1)!,
    localVertices,
    signedArea: orientedArea,
    area: Math.abs(orientedArea),
    perimeter,
    centroid
  };
}
function containsLocal(vertices: readonly Vector2[], point: Vector2, tolerance: number): boolean {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const a = vertices[previous];
    const b = vertices[index];
    if (onSegment(point, a, b, tolerance)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function polygonLocalCoordinates3D(polygon: Polygon3, pointValue: readonly number[]): PolygonBinding3D | null {
  const point = finiteVector(pointValue);
  const projected = point ? projectPointToPlane(point, polygon.plane) : null;
  if (!projected) return null;
  const [u, v] = local(projected, polygon.plane);
  return { u, v };
}
export function polygonPointAt3D(polygon: Polygon3, binding: PolygonBinding3D): Vector3 | null {
  const point: Vector2 = [Number(binding?.u), Number(binding?.v)];
  return point.every(Number.isFinite) ? spatial(point, polygon.plane) : null;
}
export function pointInPolygon3D(pointValue: readonly number[], polygon: Polygon3, toleranceValue?: number): boolean {
  const point = finiteVector(pointValue);
  if (!point) return false;
  const tolerance = Number.isFinite(toleranceValue)
    ? Math.abs(Number(toleranceValue))
    : 1e-9 * Math.max(1, ...polygon.vertices.map(vector3Norm));
  if (Math.abs(dotVector3(subtractVector3(point, polygon.plane.point) || [], polygon.plane.normal)) > tolerance) return false;
  return containsLocal(polygon.localVertices, local(point, polygon.plane), tolerance);
}
export function nearestPointOnPolygon3D(pointValue: readonly number[], polygon: Polygon3): Vector3 | null {
  const point = finiteVector(pointValue);
  const projected = point ? projectPointToPlane(point, polygon.plane) : null;
  if (!projected) return null;
  const projectedLocal = local(projected, polygon.plane);
  if (containsLocal(polygon.localVertices, projectedLocal, polygonTolerance3D(polygon.vertices))) return projected;
  let nearest: Vector2 | null = null;
  let minimum = Infinity;
  polygon.localVertices.forEach((a, index) => {
    const b = polygon.localVertices[(index + 1) % polygon.localVertices.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const parameter = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((projectedLocal[0] - a[0]) * dx + (projectedLocal[1] - a[1]) * dy) / lengthSquared))
      : 0;
    const candidate: Vector2 = [a[0] + parameter * dx, a[1] + parameter * dy];
    const distance = Math.hypot(candidate[0] - projectedLocal[0], candidate[1] - projectedLocal[1]);
    if (distance < minimum) {
      minimum = distance;
      nearest = candidate;
    }
  });
  return nearest ? spatial(nearest, polygon.plane) : null;
}
export function intersectLinePolygon3D(
  anchor: readonly number[], direction: readonly number[], polygon: Polygon3,
  domain: LinearDomain3D = 'line'
): LinePolygonIntersection3D {
  const result = intersectLinePlane3D(anchor, direction, polygon.plane, domain);
  if (result.kind === 'contained') return { kind: 'contained' };
  if (result.kind === 'outside') return { kind: 'outside' };
  if (result.kind === 'invalid') return { kind: 'invalid' };
  if (result.kind !== 'point' || !result.point || !pointInPolygon3D(result.point, polygon)) return { kind: 'none' };
  return { kind: 'point', point: result.point, parameter: result.parameter };
}
export function polygonEdgeLengths3D(polygon: Polygon3): number[] {
  return polygon.vertices.map((point, index) =>
    vector3Norm(subtractVector3(polygon.vertices[(index + 1) % polygon.vertices.length], point) || []));
}
