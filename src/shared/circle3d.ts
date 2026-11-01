import { addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3 } from './vector3d';
import {
  crossVector3, dotVector3, intersectLinePlane3D, intersectPlanes3D, parameterAllowed3D,
  planeFromPointNormal, planeFromThreePoints, planeTolerance, projectPointToPlane,
  signedDistancePointPlane, type LinearDomain3D, type Plane3
} from './plane3d';

export interface Circle3 {
  center: Vector3;
  radius: number;
  normal: Vector3;
  direction1: Vector3;
  direction2: Vector3;
  plane: Plane3;
}

export interface PointSetIntersection3D {
  kind: 'none' | 'point' | 'points' | 'coincident' | 'invalid';
  points: Vector3[];
  parameters?: number[];
}

const TAU = Math.PI * 2;

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const result: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return result.every(Number.isFinite) ? result : null;
}

function circleScale(circle: Circle3): number {
  return Math.max(1, vector3Norm(circle.center), circle.radius);
}

function cleanAngle(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function pointResult(points: Vector3[], parameters?: number[]): PointSetIntersection3D {
  if (!points.length) return { kind: 'none', points: [] };
  return { kind: points.length === 1 ? 'point' : 'points', points, ...(parameters ? { parameters } : {}) };
}

export function circleFromCenterNormalRadius(
  centerValue: readonly number[], normalValue: readonly number[], radiusValue: number
): Circle3 | null {
  const center = finiteVector(centerValue);
  const radius = Number(radiusValue);
  const plane = center ? planeFromPointNormal(center, normalValue) : null;
  const tolerance = center ? planeTolerance(center, normalValue) : NaN;
  if (!center || !plane || !Number.isFinite(radius) || radius <= tolerance) return null;
  return { center, radius, normal: plane.normal, direction1: plane.direction1, direction2: plane.direction2, plane };
}

export function circleFromThreePoints(
  firstValue: readonly number[], secondValue: readonly number[], thirdValue: readonly number[]
): Circle3 | null {
  const first = finiteVector(firstValue);
  const second = finiteVector(secondValue);
  const third = finiteVector(thirdValue);
  const plane = first && second && third ? planeFromThreePoints(first, second, third) : null;
  if (!first || !second || !third || !plane) return null;
  const a = subtractVector3(second, first)!;
  const b = subtractVector3(third, first)!;
  const aa = dotVector3(a, a);
  const ab = dotVector3(a, b);
  const bb = dotVector3(b, b);
  const determinant = aa * bb - ab * ab;
  const tolerance = planeTolerance(first, second, third);
  if (!Number.isFinite(determinant) || determinant <= tolerance * tolerance * Math.max(1, aa, bb)) return null;
  const u = bb * (aa - ab) / (2 * determinant);
  const v = aa * (bb - ab) / (2 * determinant);
  const firstOffset = scaleVector3(a, u);
  const secondOffset = scaleVector3(b, v);
  const center = firstOffset && secondOffset ? addVector3(addVector3(first, firstOffset) || [], secondOffset) : null;
  const radial = center ? subtractVector3(first, center) : null;
  const radius = radial ? vector3Norm(radial) : NaN;
  const direction1 = radial ? normalizeVector3(radial) : null;
  const direction2 = direction1 ? normalizeVector3(crossVector3(plane.normal, direction1) || []) : null;
  if (!center || !direction1 || !direction2 || !Number.isFinite(radius) || radius <= tolerance) return null;
  const centeredPlane = planeFromPointNormal(center, plane.normal);
  return centeredPlane ? { center, radius, normal: plane.normal, direction1, direction2, plane: centeredPlane } : null;
}

export function circlePointAt(circle: Circle3, parameter: number): Vector3 | null {
  const angle = Number(parameter);
  if (!Number.isFinite(angle)) return null;
  const first = scaleVector3(circle.direction1, circle.radius * Math.cos(angle));
  const second = scaleVector3(circle.direction2, circle.radius * Math.sin(angle));
  return first && second ? addVector3(addVector3(circle.center, first) || [], second) : null;
}

export function circleParameterAt(circle: Circle3, pointValue: readonly number[]): number {
  const point = finiteVector(pointValue);
  const radial = point ? subtractVector3(point, circle.center) : null;
  return radial ? cleanAngle(Math.atan2(dotVector3(radial, circle.direction2), dotVector3(radial, circle.direction1))) : NaN;
}

export function circleCircumference(circle: Circle3): number {
  return Number.isFinite(circle?.radius) ? TAU * circle.radius : NaN;
}

export function circleArea(circle: Circle3): number {
  return Number.isFinite(circle?.radius) ? Math.PI * circle.radius * circle.radius : NaN;
}

export function projectPointToCirclePlane(point: readonly number[], circle: Circle3): Vector3 | null {
  return projectPointToPlane(point, circle.plane);
}

export function nearestPointOnCircle(pointValue: readonly number[], circle: Circle3): Vector3 | null {
  const projected = projectPointToCirclePlane(pointValue, circle);
  const radial = projected ? subtractVector3(projected, circle.center) : null;
  const direction = radial && normalizeVector3(radial);
  return circlePointAt(circle, direction
    ? Math.atan2(dotVector3(direction, circle.direction2), dotVector3(direction, circle.direction1))
    : 0);
}

export function pointOnCircle(pointValue: readonly number[], circle: Circle3, toleranceValue?: number): boolean {
  const point = finiteVector(pointValue);
  if (!point) return false;
  const tolerance = Number.isFinite(toleranceValue) ? Math.abs(Number(toleranceValue)) : 1e-9 * circleScale(circle);
  const radial = subtractVector3(point, circle.center);
  return Math.abs(signedDistancePointPlane(point, circle.plane)) <= tolerance &&
    !!radial && Math.abs(vector3Norm(radial) - circle.radius) <= tolerance;
}

export function intersectLineCircle3D(
  anchorValue: readonly number[], directionValue: readonly number[], circle: Circle3,
  domain: LinearDomain3D = 'line'
): PointSetIntersection3D {
  const anchor = finiteVector(anchorValue);
  const direction = finiteVector(directionValue);
  if (!anchor || !direction || vector3Norm(direction) <= planeTolerance(direction)) return { kind: 'invalid', points: [] };
  const planeHit = intersectLinePlane3D(anchor, direction, circle.plane, domain);
  const tolerance = 1e-9 * Math.max(circleScale(circle), vector3Norm(anchor), vector3Norm(direction));
  if (planeHit.kind === 'point') {
    return planeHit.point && pointOnCircle(planeHit.point, circle, tolerance)
      ? pointResult([planeHit.point], [Number(planeHit.parameter)])
      : { kind: 'none', points: [] };
  }
  if (planeHit.kind !== 'contained') {
    return planeHit.kind === 'invalid' ? { kind: 'invalid', points: [] } : { kind: 'none', points: [] };
  }
  const offset = subtractVector3(anchor, circle.center)!;
  const a = dotVector3(direction, direction);
  const b = 2 * dotVector3(offset, direction);
  const c = dotVector3(offset, offset) - circle.radius * circle.radius;
  const discriminant = b * b - 4 * a * c;
  const threshold = tolerance * Math.max(1, Math.abs(b * b), Math.abs(4 * a * c));
  if (discriminant < -threshold) return { kind: 'none', points: [] };
  const root = Math.sqrt(Math.max(0, discriminant));
  const raw = root <= tolerance ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  const parameters = raw.filter(value => parameterAllowed3D(value, domain, tolerance)).sort((x, y) => x - y);
  const points = parameters.map(parameter => addVector3(anchor, scaleVector3(direction, parameter) || [])!);
  return pointResult(points, parameters);
}

export function intersectPlaneCircle3D(plane: Plane3, circle: Circle3): PointSetIntersection3D {
  const planes = intersectPlanes3D(plane, circle.plane);
  if (planes.kind === 'coincident') return { kind: 'coincident', points: [] };
  if (planes.kind !== 'line' || !planes.point || !planes.direction) {
    return planes.kind === 'invalid' ? { kind: 'invalid', points: [] } : { kind: 'none', points: [] };
  }
  return intersectLineCircle3D(planes.point, planes.direction, circle);
}

function intersectCoplanarCircles(first: Circle3, second: Circle3): PointSetIntersection3D {
  const between = subtractVector3(second.center, first.center);
  const distance = between ? vector3Norm(between) : NaN;
  const tolerance = 1e-9 * Math.max(circleScale(first), circleScale(second));
  if (!between || !Number.isFinite(distance)) return { kind: 'invalid', points: [] };
  if (distance <= tolerance) {
    return Math.abs(first.radius - second.radius) <= tolerance
      ? { kind: 'coincident', points: [] } : { kind: 'none', points: [] };
  }
  if (distance > first.radius + second.radius + tolerance ||
      distance < Math.abs(first.radius - second.radius) - tolerance) return { kind: 'none', points: [] };
  const axis = normalizeVector3(between)!;
  const along = (first.radius ** 2 - second.radius ** 2 + distance ** 2) / (2 * distance);
  const heightSquared = first.radius ** 2 - along ** 2;
  if (heightSquared < -tolerance * Math.max(1, first.radius)) return { kind: 'none', points: [] };
  const base = addVector3(first.center, scaleVector3(axis, along) || []);
  const perpendicular = normalizeVector3(crossVector3(first.normal, axis) || []);
  if (!base || !perpendicular) return { kind: 'invalid', points: [] };
  const height = Math.sqrt(Math.max(0, heightSquared));
  if (height <= tolerance) return pointResult([base]);
  const delta = scaleVector3(perpendicular, height)!;
  return pointResult([addVector3(base, delta)!, subtractVector3(base, delta)!]);
}

export function intersectCircles3D(first: Circle3, second: Circle3): PointSetIntersection3D {
  const planes = intersectPlanes3D(first.plane, second.plane);
  if (planes.kind === 'coincident') return intersectCoplanarCircles(first, second);
  if (planes.kind !== 'line' || !planes.point || !planes.direction) {
    return planes.kind === 'invalid' ? { kind: 'invalid', points: [] } : { kind: 'none', points: [] };
  }
  const candidates = intersectLineCircle3D(planes.point, planes.direction, first);
  if (candidates.kind !== 'point' && candidates.kind !== 'points') return candidates;
  const tolerance = 1e-9 * Math.max(circleScale(first), circleScale(second));
  return pointResult(candidates.points.filter(point => pointOnCircle(point, second, tolerance)));
}
