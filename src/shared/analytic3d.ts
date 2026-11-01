import { addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3 } from './vector3d';
import {
  crossVector3, distancePointPlane, dotVector3, intersectLinePlane3D, intersectLines3D,
  intersectPlanes3D, planeFromPointNormal, projectPointToPlane, type LinearDomain3D, type Plane3
} from './plane3d';

export type SpatialRelation3D =
  | 'identical' | 'parallel' | 'strictly-parallel' | 'intersecting' | 'skew'
  | 'orthogonal' | 'contained' | 'not-contained' | 'invalid';

export interface LineDefinition3D {
  anchor: Vector3;
  direction: Vector3;
  domain?: LinearDomain3D;
}

export interface CommonPerpendicular3D {
  first: Vector3;
  second: Vector3;
  distance: number;
  firstParameter: number;
  secondParameter: number;
}

export interface AnalyticScalar3D {
  kind: 'scalar3d';
  operation: string;
  sourceIds: string[];
  value: number;
  unit?: 'length' | 'angle' | 'area' | 'volume' | 'scalar';
}

const EPS = 1e-10;

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const result: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return result.every(Number.isFinite) ? result : null;
}

function clamp(value: number, min = -1, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function negateVector3(vector: readonly number[]): Vector3 | null {
  return scaleVector3(vector, -1);
}

export function connectPointsVector3(first: readonly number[], second: readonly number[]): Vector3 | null {
  return subtractVector3(second, first);
}

export function projectVectorOntoVector3(vectorValue: readonly number[], targetValue: readonly number[]): Vector3 | null {
  const vector = finiteVector(vectorValue);
  const target = finiteVector(targetValue);
  if (!vector || !target) return null;
  const denominator = dotVector3(target, target);
  return denominator > EPS * EPS ? scaleVector3(target, dotVector3(vector, target) / denominator) : null;
}

export function projectVectorIntoPlane3(vectorValue: readonly number[], plane: Plane3): Vector3 | null {
  const vector = finiteVector(vectorValue);
  if (!vector || !plane) return null;
  const normalPart = scaleVector3(plane.normal, dotVector3(vector, plane.normal));
  return normalPart ? subtractVector3(vector, normalPart) : null;
}

export function scalarTripleProduct3(
  first: readonly number[], second: readonly number[], third: readonly number[]
): number {
  const cross = crossVector3(second, third);
  return cross ? dotVector3(first, cross) : NaN;
}

export function angleBetweenVectors3(first: readonly number[], second: readonly number[]): number {
  const a = finiteVector(first);
  const b = finiteVector(second);
  const denominator = a && b ? vector3Norm(a) * vector3Norm(b) : NaN;
  return Number.isFinite(denominator) && denominator > EPS
    ? Math.acos(clamp(dotVector3(a!, b!) / denominator))
    : NaN;
}

export function distancePoints3(first: readonly number[], second: readonly number[]): number {
  const difference = subtractVector3(second, first);
  return difference ? vector3Norm(difference) : NaN;
}

export function projectionParameterOnLine3(pointValue: readonly number[], line: LineDefinition3D): number {
  const point = finiteVector(pointValue);
  const delta = point ? subtractVector3(point, line.anchor) : null;
  const denominator = dotVector3(line.direction, line.direction);
  return delta && denominator > EPS * EPS ? dotVector3(delta, line.direction) / denominator : NaN;
}

export function projectPointToLine3(pointValue: readonly number[], line: LineDefinition3D): Vector3 | null {
  const parameter = projectionParameterOnLine3(pointValue, line);
  const offset = Number.isFinite(parameter) ? scaleVector3(line.direction, parameter) : null;
  return offset ? addVector3(line.anchor, offset) : null;
}

export function distancePointLine3(point: readonly number[], line: LineDefinition3D): number {
  const projection = projectPointToLine3(point, line);
  return projection ? distancePoints3(point, projection) : NaN;
}

export function commonPerpendicularLines3(first: LineDefinition3D, second: LineDefinition3D): CommonPerpendicular3D | null {
  const p = finiteVector(first.anchor);
  const q = finiteVector(second.anchor);
  const u = finiteVector(first.direction);
  const v = finiteVector(second.direction);
  if (!p || !q || !u || !v) return null;
  const w = subtractVector3(p, q)!;
  const a = dotVector3(u, u);
  const b = dotVector3(u, v);
  const c = dotVector3(v, v);
  const d = dotVector3(u, w);
  const e = dotVector3(v, w);
  const denominator = a * c - b * b;
  if (a <= EPS || c <= EPS || Math.abs(denominator) <= EPS * Math.max(1, a * c)) return null;
  const firstParameter = (b * e - c * d) / denominator;
  const secondParameter = (a * e - b * d) / denominator;
  const firstOffset = scaleVector3(u, firstParameter);
  const secondOffset = scaleVector3(v, secondParameter);
  const firstPoint = firstOffset && addVector3(p, firstOffset);
  const secondPoint = secondOffset && addVector3(q, secondOffset);
  if (!firstPoint || !secondPoint) return null;
  return {
    first: firstPoint, second: secondPoint, distance: distancePoints3(firstPoint, secondPoint),
    firstParameter, secondParameter
  };
}

export function distanceLines3(first: LineDefinition3D, second: LineDefinition3D): number {
  const cross = crossVector3(first.direction, second.direction);
  const difference = subtractVector3(second.anchor, first.anchor);
  if (!cross || !difference) return NaN;
  const crossLength = vector3Norm(cross);
  if (crossLength <= EPS) return distancePointLine3(second.anchor, first);
  return Math.abs(dotVector3(difference, cross)) / crossLength;
}

export function distanceParallelPlanes3(first: Plane3, second: Plane3): number {
  const angle = angleBetweenVectors3(first.normal, second.normal);
  if (!Number.isFinite(angle) || Math.min(angle, Math.PI - angle) > EPS * 10) return NaN;
  return distancePointPlane(second.point, first);
}

export function angleLines3(first: LineDefinition3D, second: LineDefinition3D): number {
  const angle = angleBetweenVectors3(first.direction, second.direction);
  return Number.isFinite(angle) ? Math.min(angle, Math.PI - angle) : NaN;
}

export function angleLinePlane3(line: LineDefinition3D, plane: Plane3): number {
  const angle = angleBetweenVectors3(line.direction, plane.normal);
  return Number.isFinite(angle) ? Math.abs(Math.PI / 2 - angle) : NaN;
}

export function anglePlanes3(first: Plane3, second: Plane3): number {
  const angle = angleBetweenVectors3(first.normal, second.normal);
  return Number.isFinite(angle) ? Math.min(angle, Math.PI - angle) : NaN;
}

export function perpendicularLineToPlane3(point: readonly number[], plane: Plane3): LineDefinition3D | null {
  const anchor = finiteVector(point);
  return anchor ? { anchor, direction: [...plane.normal] as Vector3, domain: 'line' } : null;
}

export function normalVectorOfPlane3(plane: Plane3): Vector3 {
  return [...plane.normal] as Vector3;
}

export function relationLines3(first: LineDefinition3D, second: LineDefinition3D): SpatialRelation3D {
  const intersection = intersectLines3D(
    first.anchor, first.direction, second.anchor, second.direction,
    first.domain || 'line', second.domain || 'line'
  );
  if (intersection.kind === 'invalid') return 'invalid';
  if (intersection.kind === 'coincident') return 'identical';
  if (intersection.kind === 'parallel') return 'strictly-parallel';
  if (intersection.kind === 'skew') return 'skew';
  if (intersection.kind === 'point') return Math.abs(dotVector3(first.direction, second.direction)) <= EPS ? 'orthogonal' : 'intersecting';
  return 'not-contained';
}

export function relationLinePlane3(line: LineDefinition3D, plane: Plane3): SpatialRelation3D {
  const result = intersectLinePlane3D(line.anchor, line.direction, plane, line.domain || 'line');
  if (result.kind === 'invalid') return 'invalid';
  if (result.kind === 'contained') return 'contained';
  if (result.kind === 'parallel') return 'strictly-parallel';
  if (result.kind === 'point') return Math.abs(angleLinePlane3(line, plane) - Math.PI / 2) <= EPS ? 'orthogonal' : 'intersecting';
  return 'not-contained';
}

export function relationPlanes3(first: Plane3, second: Plane3): SpatialRelation3D {
  const result = intersectPlanes3D(first, second);
  if (result.kind === 'invalid') return 'invalid';
  if (result.kind === 'coincident') return 'identical';
  if (result.kind === 'parallel') return 'strictly-parallel';
  return Math.abs(dotVector3(first.normal, second.normal)) <= EPS ? 'orthogonal' : 'intersecting';
}

export function pointOnLine3(point: readonly number[], line: LineDefinition3D, tolerance = 1e-8): boolean {
  const parameter = projectionParameterOnLine3(point, line);
  if (!Number.isFinite(parameter)) return false;
  const projected = projectPointToLine3(point, line);
  if (!projected || distancePoints3(point, projected) > tolerance * Math.max(1, vector3Norm(point))) return false;
  const domain = line.domain || 'line';
  return domain === 'line' || (domain === 'ray' ? parameter >= -tolerance : parameter >= -tolerance && parameter <= 1 + tolerance);
}

export function pointOnPlane3(point: readonly number[], plane: Plane3, tolerance = 1e-8): boolean {
  return distancePointPlane(point, plane) <= tolerance * Math.max(1, vector3Norm(point), vector3Norm(plane.point));
}

export { addVector3, crossVector3, distancePointPlane, dotVector3, normalizeVector3, projectPointToPlane, scaleVector3, subtractVector3, vector3Norm };