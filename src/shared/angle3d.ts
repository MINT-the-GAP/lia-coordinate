import {
  angleLinePlane3,
  angleLines3,
  anglePlanes3,
  commonPerpendicularLines3,
  type LineDefinition3D
} from './analytic3d';
import {
  crossVector3,
  dotVector3,
  intersectLinePlane3D,
  intersectLines3D,
  intersectPlanes3D,
  projectPointToPlane,
  type Plane3
} from './plane3d';
import {
  addVector3,
  normalizeVector3,
  scaleVector3,
  subtractVector3,
  type Vector3
} from './vector3d';

export type SpatialAngle3DDefinition = 'lines' | 'line-plane' | 'planes';

export interface SpatialAngle3D {
  kind: 'angle3d';
  definition: SpatialAngle3DDefinition;
  center: Vector3;
  firstDirection: Vector3;
  secondDirection: Vector3;
  radians: number;
}

const EPSILON = 1e-10;

function midpoint(first: readonly number[], second: readonly number[]): Vector3 {
  return [
    (Number(first[0]) + Number(second[0])) / 2,
    (Number(first[1]) + Number(second[1])) / 2,
    (Number(first[2]) + Number(second[2])) / 2
  ];
}

function orientAcute(first: Vector3, second: Vector3): Vector3 {
  return dotVector3(first, second) < 0
    ? [-second[0], -second[1], -second[2]]
    : second;
}

function stablePerpendicular(normal: readonly number[]): Vector3 | null {
  const unit = normalizeVector3(normal);
  if (!unit) return null;
  const helper: Vector3 = Math.abs(unit[0]) <= Math.abs(unit[1]) && Math.abs(unit[0]) <= Math.abs(unit[2])
    ? [1, 0, 0]
    : (Math.abs(unit[1]) <= Math.abs(unit[2]) ? [0, 1, 0] : [0, 0, 1]);
  return normalizeVector3(crossVector3(unit, helper) || []);
}

export function angleBetweenLinesArc3(
  first: LineDefinition3D,
  second: LineDefinition3D
): SpatialAngle3D | null {
  const firstDirection = normalizeVector3(first.direction);
  const rawSecond = normalizeVector3(second.direction);
  const radians = angleLines3(first, second);
  if (!firstDirection || !rawSecond || !Number.isFinite(radians)) return null;
  const secondDirection = orientAcute(firstDirection, rawSecond);
  const intersection = intersectLines3D(
    first.anchor, first.direction, second.anchor, second.direction,
    first.domain || 'line', second.domain || 'line'
  );
  let center: Vector3 = [...first.anchor] as Vector3;
  if (intersection.kind === 'point' && intersection.point) {
    center = [...intersection.point] as Vector3;
  } else {
    const common = commonPerpendicularLines3(first, second);
    if (common) center = midpoint(common.first, common.second);
    else center = midpoint(first.anchor, second.anchor);
  }
  return { kind: 'angle3d', definition: 'lines', center, firstDirection, secondDirection, radians };
}

export function angleBetweenLinePlaneArc3(
  line: LineDefinition3D,
  plane: Plane3
): SpatialAngle3D | null {
  const lineDirection = normalizeVector3(line.direction);
  const radians = angleLinePlane3(line, plane);
  if (!lineDirection || !Number.isFinite(radians)) return null;
  const normalPart = scaleVector3(plane.normal, dotVector3(lineDirection, plane.normal));
  const projected = normalPart ? normalizeVector3(subtractVector3(lineDirection, normalPart) || []) : null;
  const firstDirection = projected || stablePerpendicular(plane.normal);
  if (!firstDirection) return null;
  const secondDirection = orientAcute(firstDirection, lineDirection);
  const intersection = intersectLinePlane3D(line.anchor, line.direction, plane, line.domain || 'line');
  const center = intersection.kind === 'point' && intersection.point
    ? ([...intersection.point] as Vector3)
    : (projectPointToPlane(line.anchor, plane) || ([...line.anchor] as Vector3));
  return { kind: 'angle3d', definition: 'line-plane', center, firstDirection, secondDirection, radians };
}

export function angleBetweenPlanesArc3(first: Plane3, second: Plane3): SpatialAngle3D | null {
  const radians = anglePlanes3(first, second);
  if (!Number.isFinite(radians)) return null;
  const intersection = intersectPlanes3D(first, second);
  let center: Vector3;
  let firstDirection: Vector3 | null;
  let secondDirection: Vector3 | null;
  if (intersection.kind === 'line' && intersection.point && intersection.direction) {
    center = [...intersection.point] as Vector3;
    firstDirection = normalizeVector3(crossVector3(intersection.direction, first.normal) || []);
    secondDirection = normalizeVector3(crossVector3(intersection.direction, second.normal) || []);
  } else {
    center = midpoint(first.point, second.point);
    firstDirection = stablePerpendicular(first.normal);
    secondDirection = firstDirection ? ([...firstDirection] as Vector3) : null;
  }
  if (!firstDirection || !secondDirection) return null;
  secondDirection = orientAcute(firstDirection, secondDirection);
  return { kind: 'angle3d', definition: 'planes', center, firstDirection, secondDirection, radians };
}

export function spatialAngleArcPoint3(
  angle: SpatialAngle3D,
  radiusValue: number,
  parameterValue: number
): Vector3 | null {
  const radius = Number(radiusValue);
  const parameter = Math.max(0, Math.min(1, Number(parameterValue)));
  if (!angle || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(parameter)) return null;
  const first = normalizeVector3(angle.firstDirection);
  const second = normalizeVector3(angle.secondDirection);
  if (!first || !second) return null;
  const cosine = Math.max(-1, Math.min(1, dotVector3(first, second)));
  const angleRadians = Math.acos(cosine);
  if (angleRadians <= EPSILON) {
    const offset = scaleVector3(first, radius);
    return offset ? addVector3(angle.center, offset) : null;
  }
  const projection = scaleVector3(first, cosine);
  const tangent = projection ? normalizeVector3(subtractVector3(second, projection) || []) : null;
  if (!tangent) return null;
  const theta = angleRadians * parameter;
  const firstPart = scaleVector3(first, radius * Math.cos(theta));
  const secondPart = scaleVector3(tangent, radius * Math.sin(theta));
  const offset = firstPart && secondPart ? addVector3(firstPart, secondPart) : null;
  return offset ? addVector3(angle.center, offset) : null;
}

export function spatialAngleLabelPoint3(angle: SpatialAngle3D, radius: number): Vector3 | null {
  return spatialAngleArcPoint3(angle, Number(radius) * 1.28, 0.5);
}
