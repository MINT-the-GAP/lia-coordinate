import {
  addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3
} from './vector3d';
import {
  dotVector3, parameterAllowed3D, planeFromPointNormal, planeTolerance, projectPointToPlane,
  signedDistancePointPlane, type LinearDomain3D, type Plane3
} from './plane3d';
import {
  circleFromCenterNormalRadius, intersectCircles3D, type Circle3, type PointSetIntersection3D
} from './circle3d';

export interface Sphere3 {
  center: Vector3;
  radius: number;
}

export interface CircleOrPointIntersection3D {
  kind: 'none' | 'point' | 'circle' | 'coincident' | 'invalid';
  point?: Vector3;
  circle?: Circle3;
}

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const result: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return result.every(Number.isFinite) ? result : null;
}

function sphereScale(sphere: Sphere3): number {
  return Math.max(1, vector3Norm(sphere.center), sphere.radius);
}

function solve3x3(matrix: number[][], values: number[], tolerance: number): Vector3 | null {
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) <= tolerance) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index < 4; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index < 4; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  const result: Vector3 = [augmented[0][3], augmented[1][3], augmented[2][3]];
  return result.every(Number.isFinite) ? result : null;
}

export function sphereFromCenterRadius(centerValue: readonly number[], radiusValue: number): Sphere3 | null {
  const center = finiteVector(centerValue);
  const radius = Number(radiusValue);
  const tolerance = center ? planeTolerance(center) : NaN;
  return center && Number.isFinite(radius) && radius > tolerance ? { center, radius } : null;
}

export function sphereFromCenterPoint(centerValue: readonly number[], pointValue: readonly number[]): Sphere3 | null {
  const center = finiteVector(centerValue);
  const point = finiteVector(pointValue);
  const delta = center && point ? subtractVector3(point, center) : null;
  return center && delta ? sphereFromCenterRadius(center, vector3Norm(delta)) : null;
}

export function sphereFromFourPoints(
  firstValue: readonly number[], secondValue: readonly number[],
  thirdValue: readonly number[], fourthValue: readonly number[]
): Sphere3 | null {
  const points = [firstValue, secondValue, thirdValue, fourthValue].map(finiteVector);
  if (points.some(point => !point)) return null;
  const [first, second, third, fourth] = points as Vector3[];
  const matrix = [second, third, fourth].map(point => [
    2 * (point[0] - first[0]), 2 * (point[1] - first[1]), 2 * (point[2] - first[2])
  ]);
  const firstSquared = dotVector3(first, first);
  const values = [second, third, fourth].map(point => dotVector3(point, point) - firstSquared);
  const scale = Math.max(1, ...points.map(vector3Norm));
  const center = solve3x3(matrix, values, 1e-10 * scale);
  return center ? sphereFromCenterPoint(center, first) : null;
}

export function sphereDiameter(sphere: Sphere3): number {
  return Number.isFinite(sphere?.radius) ? 2 * sphere.radius : NaN;
}

export function sphereSurfaceArea(sphere: Sphere3): number {
  return Number.isFinite(sphere?.radius) ? 4 * Math.PI * sphere.radius ** 2 : NaN;
}

export function sphereVolume(sphere: Sphere3): number {
  return Number.isFinite(sphere?.radius) ? (4 / 3) * Math.PI * sphere.radius ** 3 : NaN;
}

export function signedDistancePointSphere(pointValue: readonly number[], sphere: Sphere3): number {
  const point = finiteVector(pointValue);
  const delta = point ? subtractVector3(point, sphere.center) : null;
  return delta ? vector3Norm(delta) - sphere.radius : NaN;
}

export function pointOnSphere(point: readonly number[], sphere: Sphere3, toleranceValue?: number): boolean {
  const tolerance = Number.isFinite(toleranceValue) ? Math.abs(Number(toleranceValue)) : 1e-9 * sphereScale(sphere);
  const distance = signedDistancePointSphere(point, sphere);
  return Number.isFinite(distance) && Math.abs(distance) <= tolerance;
}

export function nearestPointOnSphere(
  pointValue: readonly number[], sphere: Sphere3, fallbackDirection: readonly number[] = [1, 0, 0]
): Vector3 | null {
  const point = finiteVector(pointValue);
  if (!point) return null;
  const radial = subtractVector3(point, sphere.center);
  const direction = normalizeVector3(radial || []) || normalizeVector3(fallbackDirection);
  const delta = direction && scaleVector3(direction, sphere.radius);
  return delta ? addVector3(sphere.center, delta) : null;
}

export function spherePointAtDirection(sphere: Sphere3, directionValue: readonly number[]): Vector3 | null {
  const direction = normalizeVector3(directionValue);
  const delta = direction && scaleVector3(direction, sphere.radius);
  return delta ? addVector3(sphere.center, delta) : null;
}

export function sphereDirectionAt(sphere: Sphere3, pointValue: readonly number[]): Vector3 | null {
  const point = finiteVector(pointValue);
  return point ? normalizeVector3(subtractVector3(point, sphere.center) || []) : null;
}

export function intersectLineSphere3D(
  anchorValue: readonly number[], directionValue: readonly number[], sphere: Sphere3,
  domain: LinearDomain3D = 'line'
): PointSetIntersection3D {
  const anchor = finiteVector(anchorValue);
  const direction = finiteVector(directionValue);
  if (!anchor || !direction || vector3Norm(direction) <= planeTolerance(direction)) return { kind: 'invalid', points: [] };
  const offset = subtractVector3(anchor, sphere.center)!;
  const a = dotVector3(direction, direction);
  const b = 2 * dotVector3(offset, direction);
  const c = dotVector3(offset, offset) - sphere.radius ** 2;
  const discriminant = b * b - 4 * a * c;
  const tolerance = 1e-9 * Math.max(sphereScale(sphere), vector3Norm(anchor), vector3Norm(direction));
  const threshold = tolerance * Math.max(1, Math.abs(b * b), Math.abs(4 * a * c));
  if (discriminant < -threshold) return { kind: 'none', points: [] };
  const root = Math.sqrt(Math.max(0, discriminant));
  const raw = root <= tolerance ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  const parameters = raw.filter(value => parameterAllowed3D(value, domain, tolerance)).sort((x, y) => x - y);
  const points = parameters.map(parameter => addVector3(anchor, scaleVector3(direction, parameter) || [])!).filter(Boolean);
  return { kind: points.length === 0 ? 'none' : (points.length === 1 ? 'point' : 'points'), points, parameters };
}

export function intersectPlaneSphere3D(plane: Plane3, sphere: Sphere3): CircleOrPointIntersection3D {
  const signed = signedDistancePointPlane(sphere.center, plane);
  if (!Number.isFinite(signed)) return { kind: 'invalid' };
  const tolerance = 1e-9 * sphereScale(sphere);
  const distance = Math.abs(signed);
  if (distance > sphere.radius + tolerance) return { kind: 'none' };
  const center = projectPointToPlane(sphere.center, plane);
  if (!center) return { kind: 'invalid' };
  const radiusSquared = sphere.radius ** 2 - distance ** 2;
  if (radiusSquared <= tolerance * Math.max(1, sphere.radius)) return { kind: 'point', point: center };
  const circle = circleFromCenterNormalRadius(center, plane.normal, Math.sqrt(Math.max(0, radiusSquared)));
  return circle ? { kind: 'circle', circle } : { kind: 'invalid' };
}

export function intersectSpheres3D(first: Sphere3, second: Sphere3): CircleOrPointIntersection3D {
  const between = subtractVector3(second.center, first.center);
  const distance = between ? vector3Norm(between) : NaN;
  const tolerance = 1e-9 * Math.max(sphereScale(first), sphereScale(second));
  if (!between || !Number.isFinite(distance)) return { kind: 'invalid' };
  if (distance <= tolerance) {
    return Math.abs(first.radius - second.radius) <= tolerance ? { kind: 'coincident' } : { kind: 'none' };
  }
  if (distance > first.radius + second.radius + tolerance ||
      distance < Math.abs(first.radius - second.radius) - tolerance) return { kind: 'none' };
  const normal = normalizeVector3(between)!;
  const along = (first.radius ** 2 - second.radius ** 2 + distance ** 2) / (2 * distance);
  const center = addVector3(first.center, scaleVector3(normal, along) || []);
  const radiusSquared = first.radius ** 2 - along ** 2;
  if (!center || radiusSquared < -tolerance * Math.max(1, first.radius)) return { kind: 'invalid' };
  if (radiusSquared <= tolerance * Math.max(1, first.radius)) return { kind: 'point', point: center };
  const circle = circleFromCenterNormalRadius(center, normal, Math.sqrt(Math.max(0, radiusSquared)));
  return circle ? { kind: 'circle', circle } : { kind: 'invalid' };
}

export function intersectCircleSphere3D(circle: Circle3, sphere: Sphere3): PointSetIntersection3D {
  const planeHit = intersectPlaneSphere3D(circle.plane, sphere);
  if (planeHit.kind === 'none' || planeHit.kind === 'invalid') return { kind: planeHit.kind, points: [] };
  if (planeHit.kind === 'point') {
    const delta = planeHit.point ? subtractVector3(planeHit.point, circle.center) : null;
    return planeHit.point && pointOnSphere(planeHit.point, sphere) && delta &&
        Math.abs(vector3Norm(delta) - circle.radius) <= 1e-9 * Math.max(1, circle.radius)
      ? { kind: 'point', points: [planeHit.point] }
      : { kind: 'none', points: [] };
  }
  return planeHit.circle ? intersectCircles3D(circle, planeHit.circle) : { kind: 'invalid', points: [] };
}

export function sphereTangentPlane(sphere: Sphere3, pointValue: readonly number[]): Plane3 | null {
  const point = finiteVector(pointValue);
  const normal = point ? subtractVector3(point, sphere.center) : null;
  return point && normal && pointOnSphere(point, sphere) ? planeFromPointNormal(point, normal) : null;
}
