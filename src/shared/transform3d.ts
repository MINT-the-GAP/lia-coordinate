import {
  addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3
} from './vector3d';
import {
  dotVector3, planeFromPointVectors, type Plane3
} from './plane3d';
import {
  circleFromCenterNormalRadius, type Circle3
} from './circle3d';
import {
  sphereFromCenterRadius, type Sphere3
} from './sphere3d';
import {
  polygonFromPoints3D, type Polygon3
} from './polygon3d';
import {
  coneFromBaseApexRadius3D, cylinderFromAxisRadius3D, polyhedronFromVerticesFaces3D,
  type Cone3, type Cylinder3, type Polyhedron3, type Solid3
} from './solid3d';

export type Matrix3 = [Vector3, Vector3, Vector3];
export type Transform3DKind =
  | 'translate'
  | 'reflect-point'
  | 'reflect-line'
  | 'reflect-plane'
  | 'rotate-axis'
  | 'dilate';

export interface SimilarityTransform3D {
  kind: Transform3DKind;
  matrix: Matrix3;
  translation: Vector3;
  scale: number;
  determinantSign: 1 | -1;
}

const IDENTITY: Matrix3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const vector: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return vector.every(Number.isFinite) ? vector : null;
}

function matrixVector(matrix: Matrix3, vector: Vector3): Vector3 {
  return [
    dotVector3(matrix[0], vector),
    dotVector3(matrix[1], vector),
    dotVector3(matrix[2], vector)
  ];
}

function determinant(matrix: Matrix3): number {
  const [a, b, c] = matrix;
  return a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function createTransform(
  kind: Transform3DKind,
  matrix: Matrix3,
  translation: Vector3
): SimilarityTransform3D | null {
  if (!matrix.flat().every(Number.isFinite) || !translation.every(Number.isFinite)) return null;
  const columnNorms = [0, 1, 2].map(column =>
    Math.hypot(matrix[0][column], matrix[1][column], matrix[2][column]));
  const scale = columnNorms.reduce((sum, value) => sum + value, 0) / 3;
  const tolerance = 1e-9 * Math.max(1, scale);
  if (!Number.isFinite(scale) || scale <= 1e-12 ||
      columnNorms.some(value => Math.abs(value - scale) > tolerance)) return null;
  const det = determinant(matrix);
  if (!Number.isFinite(det) || Math.abs(Math.abs(det) - scale ** 3) > tolerance * Math.max(1, scale ** 2)) return null;
  return { kind, matrix, translation, scale, determinantSign: det < 0 ? -1 : 1 };
}

function affineAround(
  kind: Transform3DKind,
  matrix: Matrix3,
  centerValue: readonly number[]
): SimilarityTransform3D | null {
  const center = finiteVector(centerValue);
  if (!center) return null;
  const transformedCenter = matrixVector(matrix, center);
  const translation = subtractVector3(center, transformedCenter);
  return translation ? createTransform(kind, matrix, translation) : null;
}

export function translationTransform3D(vectorValue: readonly number[]): SimilarityTransform3D | null {
  const vector = finiteVector(vectorValue);
  return vector ? createTransform('translate', IDENTITY.map(row => row.slice() as Vector3) as Matrix3, vector) : null;
}

export function pointReflectionTransform3D(center: readonly number[]): SimilarityTransform3D | null {
  return affineAround('reflect-point', [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], center);
}

export function dilationTransform3D(center: readonly number[], factorValue: number): SimilarityTransform3D | null {
  const factor = Number(factorValue);
  if (!Number.isFinite(factor) || Math.abs(factor) <= 1e-12) return null;
  return affineAround('dilate', [[factor, 0, 0], [0, factor, 0], [0, 0, factor]], center);
}

export function axisRotationTransform3D(
  pointValue: readonly number[],
  directionValue: readonly number[],
  angleValue: number
): SimilarityTransform3D | null {
  const direction = normalizeVector3(directionValue);
  const angle = Number(angleValue);
  if (!direction || !Number.isFinite(angle)) return null;
  const [x, y, z] = direction;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const complement = 1 - cosine;
  const matrix: Matrix3 = [
    [cosine + x * x * complement, x * y * complement - z * sine, x * z * complement + y * sine],
    [y * x * complement + z * sine, cosine + y * y * complement, y * z * complement - x * sine],
    [z * x * complement - y * sine, z * y * complement + x * sine, cosine + z * z * complement]
  ];
  return affineAround('rotate-axis', matrix, pointValue);
}

export function lineReflectionTransform3D(
  point: readonly number[],
  direction: readonly number[]
): SimilarityTransform3D | null {
  const transform = axisRotationTransform3D(point, direction, Math.PI);
  return transform ? { ...transform, kind: 'reflect-line' } : null;
}

export function planeReflectionTransform3D(plane: Plane3): SimilarityTransform3D | null {
  const normal = normalizeVector3(plane?.normal || []);
  if (!normal) return null;
  const [x, y, z] = normal;
  const matrix: Matrix3 = [
    [1 - 2 * x * x, -2 * x * y, -2 * x * z],
    [-2 * y * x, 1 - 2 * y * y, -2 * y * z],
    [-2 * z * x, -2 * z * y, 1 - 2 * z * z]
  ];
  return affineAround('reflect-plane', matrix, plane.point);
}

export function transformPoint3D(transform: SimilarityTransform3D, pointValue: readonly number[]): Vector3 | null {
  const point = finiteVector(pointValue);
  return point ? addVector3(matrixVector(transform.matrix, point), transform.translation) : null;
}

export function transformDirection3D(transform: SimilarityTransform3D, directionValue: readonly number[]): Vector3 | null {
  const direction = finiteVector(directionValue);
  return direction ? matrixVector(transform.matrix, direction) : null;
}

export function transformPlane3D(transform: SimilarityTransform3D, plane: Plane3): Plane3 | null {
  const point = transformPoint3D(transform, plane.point);
  const first = transformDirection3D(transform, plane.direction1);
  const second = transformDirection3D(transform, plane.direction2);
  return point && first && second ? planeFromPointVectors(point, first, second) : null;
}

export function transformCircle3D(transform: SimilarityTransform3D, circle: Circle3): Circle3 | null {
  const center = transformPoint3D(transform, circle.center);
  const normal = transformDirection3D(transform, circle.normal);
  return center && normal ? circleFromCenterNormalRadius(center, normal, circle.radius * transform.scale) : null;
}

export function transformSphere3D(transform: SimilarityTransform3D, sphere: Sphere3): Sphere3 | null {
  const center = transformPoint3D(transform, sphere.center);
  return center ? sphereFromCenterRadius(center, sphere.radius * transform.scale) : null;
}

export function transformPolygon3D(transform: SimilarityTransform3D, polygon: Polygon3): Polygon3 | null {
  const vertices = polygon.vertices.map(point => transformPoint3D(transform, point));
  return vertices.every(Boolean) ? polygonFromPoints3D(vertices as Vector3[]) : null;
}

export function transformPolyhedron3D(
  transform: SimilarityTransform3D,
  polyhedron: Polyhedron3
): Polyhedron3 | null {
  const vertices = polyhedron.vertices.map(point => transformPoint3D(transform, point));
  if (vertices.some(point => !point)) return null;
  const centroid = transformPoint3D(transform, polyhedron.centroid) || undefined;
  return polyhedronFromVerticesFaces3D(polyhedron.kind, vertices as Vector3[], polyhedron.faces, {
    centroid,
    volume: polyhedron.volume * transform.scale ** 3,
    baseArea: polyhedron.baseArea == null ? undefined : polyhedron.baseArea * transform.scale ** 2,
    height: polyhedron.height == null ? undefined : polyhedron.height * transform.scale
  });
}

export function transformCylinder3D(
  transform: SimilarityTransform3D,
  cylinder: Cylinder3
): Cylinder3 | null {
  const base = transformPoint3D(transform, cylinder.baseCenter);
  const top = transformPoint3D(transform, cylinder.topCenter);
  return base && top ? cylinderFromAxisRadius3D(base, top, cylinder.radius * transform.scale) : null;
}

export function transformCone3D(transform: SimilarityTransform3D, cone: Cone3): Cone3 | null {
  const base = transformPoint3D(transform, cone.baseCenter);
  const apex = transformPoint3D(transform, cone.apex);
  return base && apex ? coneFromBaseApexRadius3D(base, apex, cone.radius * transform.scale) : null;
}

export function transformSolid3D(transform: SimilarityTransform3D, solid: Solid3): Solid3 | null {
  if (solid.kind === 'cylinder') return transformCylinder3D(transform, solid);
  if (solid.kind === 'cone') return transformCone3D(transform, solid);
  return transformPolyhedron3D(transform, solid);
}

export function similarityPreservesDistances3D(transform: SimilarityTransform3D): boolean {
  return Math.abs(transform.scale - 1) <= 1e-10;
}

export function transformedDistance3D(
  transform: SimilarityTransform3D,
  first: readonly number[],
  second: readonly number[]
): number {
  const a = transformPoint3D(transform, first);
  const b = transformPoint3D(transform, second);
  return a && b ? vector3Norm(subtractVector3(b, a) || []) : NaN;
}
