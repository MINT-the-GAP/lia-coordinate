import { addVector3, normalizeVector3, scaleVector3, subtractVector3, type Vector3 } from './vector3d';
import { dotVector3, type Plane3 } from './plane3d';
import type { Cone3, Cylinder3 } from './solid3d';
import { createEvaluatedCurve3D, type ParametricCurve3D } from './curve3d';
import { transformPoint3D, type SimilarityTransform3D } from './transform3d';

export type ConicSection3DKind = 'empty' | 'point' | 'line' | 'two-lines' | 'circle' | 'ellipse' | 'parabola' | 'hyperbola';
export interface ConicCanonical3D {
  eigenvalues: [number, number];
  rotation: [[number, number], [number, number]];
  linear: [number, number];
  center?: [number, number];
  shiftedConstant?: number;
  radii?: [number, number];
  parabolaAxis?: 0 | 1;
}
export interface ConicSection3D {
  kind: 'conic-section3d';
  conicKind: ConicSection3DKind;
  sourceKind: 'plane-cylinder' | 'plane-cone';
  origin: Vector3;
  direction1: Vector3;
  direction2: Vector3;
  plane: Plane3;
  coefficients: [number, number, number, number, number, number];
  canonical: ConicCanonical3D;
  branches: ParametricCurve3D[];
  points: Vector3[];
}

const EPS = 1e-9;
type Quadratic = [number, number, number, number, number, number];

function pointFromLocal(origin: Vector3, first: Vector3, second: Vector3, u: number, v: number): Vector3 | null {
  const a = scaleVector3(first, u);
  const b = scaleVector3(second, v);
  return a && b ? addVector3(addVector3(origin, a) || [], b) : null;
}

function eigen2(a: number, b: number, c: number): { values: [number, number]; vectors: [[number, number], [number, number]] } {
  const angle = 0.5 * Math.atan2(b, a - c);
  const first: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const second: [number, number] = [-Math.sin(angle), Math.cos(angle)];
  const l1 = a * first[0] ** 2 + b * first[0] * first[1] + c * first[1] ** 2;
  const l2 = a * second[0] ** 2 + b * second[0] * second[1] + c * second[1] ** 2;
  return { values: [l1, l2], vectors: [first, second] };
}

function localToWorld(section: Pick<ConicSection3D, 'origin' | 'direction1' | 'direction2'>, local: [number, number]): Vector3 | null {
  return pointFromLocal(section.origin, section.direction1, section.direction2, local[0], local[1]);
}

function rotatedToLocal(rotation: [[number, number], [number, number]], value: [number, number]): [number, number] {
  return [
    rotation[0][0] * value[0] + rotation[1][0] * value[1],
    rotation[0][1] * value[0] + rotation[1][1] * value[1]
  ];
}

function makeCurve(
  section: Pick<ConicSection3D, 'origin' | 'direction1' | 'direction2'>,
  rotation: [[number, number], [number, number]],
  evaluateRotated: (t: number) => [number, number] | null,
  range: [number, number],
  quality = 128
): ParametricCurve3D | null {
  return createEvaluatedCurve3D(t => {
    const rotated = evaluateRotated(t);
    return rotated ? localToWorld(section, rotatedToLocal(rotation, rotated)) : null;
  }, range, { parameter: 't', expressions: ['conic-x(t)', 'conic-y(t)', 'conic-z(t)'], quality });
}

function classify(
  sourceKind: ConicSection3D['sourceKind'], plane: Plane3, coefficients: Quadratic,
  extent: number
): ConicSection3D {
  const [A, B, C, D, E, F] = coefficients;
  const eigen = eigen2(A, B, C);
  const [l1, l2] = eigen.values;
  const [r1, r2] = eigen.vectors;
  const linear: [number, number] = [D * r1[0] + E * r1[1], D * r2[0] + E * r2[1]];
  const scale = Math.max(1, Math.abs(A), Math.abs(B), Math.abs(C), Math.abs(D), Math.abs(E), Math.abs(F));
  const tolerance = EPS * scale;
  const shell: ConicSection3D = {
    kind: 'conic-section3d', conicKind: 'empty', sourceKind,
    origin: [...plane.point] as Vector3, direction1: [...plane.direction1] as Vector3,
    direction2: [...plane.direction2] as Vector3, plane,
    coefficients, canonical: { eigenvalues: eigen.values, rotation: eigen.vectors, linear },
    branches: [], points: []
  };
  const nonzero1 = Math.abs(l1) > tolerance;
  const nonzero2 = Math.abs(l2) > tolerance;
  if (nonzero1 && nonzero2) {
    const center: [number, number] = [-linear[0] / (2 * l1), -linear[1] / (2 * l2)];
    const shifted = F - linear[0] ** 2 / (4 * l1) - linear[1] ** 2 / (4 * l2);
    shell.canonical.center = center;
    shell.canonical.shiftedConstant = shifted;
    if (l1 * l2 > 0) {
      if (Math.abs(shifted) <= tolerance) {
        shell.conicKind = 'point';
        const point = localToWorld(shell, rotatedToLocal(eigen.vectors, center));
        if (point) shell.points.push(point);
      } else if (-shifted / l1 > 0 && -shifted / l2 > 0) {
        const radii: [number, number] = [Math.sqrt(-shifted / l1), Math.sqrt(-shifted / l2)];
        shell.canonical.radii = radii;
        shell.conicKind = Math.abs(radii[0] - radii[1]) <= tolerance * Math.max(1, ...radii) ? 'circle' : 'ellipse';
        const curve = makeCurve(shell, eigen.vectors, t => [center[0] + radii[0] * Math.cos(t), center[1] + radii[1] * Math.sin(t)], [0, 2 * Math.PI]);
        if (curve) shell.branches.push(curve);
      }
      return shell;
    }
    if (Math.abs(shifted) <= tolerance) {
      shell.conicKind = 'two-lines';
      const slope = Math.sqrt(Math.abs(l1 / l2));
      for (const sign of [-1, 1]) {
        const curve = makeCurve(shell, eigen.vectors, t => [center[0] + t, center[1] + Number(sign) * slope * t], [-extent, extent], 32);
        if (curve) shell.branches.push(curve);
      }
      return shell;
    }
    shell.conicKind = 'hyperbola';
    const positiveFirst = (-shifted / l1) > 0;
    const a = Math.sqrt(Math.abs(-shifted / (positiveFirst ? l1 : l2)));
    const b = Math.sqrt(Math.abs(-shifted / (positiveFirst ? l2 : l1)));
    shell.canonical.radii = positiveFirst ? [a, b] : [b, a];
    const limit = Math.max(1, Math.acosh(Math.max(1, extent / Math.max(a, b, EPS)) + 1));
    for (const sign of [-1, 1]) {
      const curve = makeCurve(shell, eigen.vectors, t => positiveFirst
        ? [center[0] + Number(sign) * a * Math.cosh(t), center[1] + b * Math.sinh(t)]
        : [center[0] + b * Math.sinh(t), center[1] + Number(sign) * a * Math.cosh(t)], [-limit, limit]);
      if (curve) shell.branches.push(curve);
    }
    return shell;
  }

  if (nonzero1 || nonzero2) {
    const quadraticIndex: 0 | 1 = nonzero1 ? 0 : 1;
    const nullIndex: 0 | 1 = quadraticIndex === 0 ? 1 : 0;
    const lambda = eigen.values[quadraticIndex];
    const lQuadratic = linear[quadraticIndex];
    const lNull = linear[nullIndex];
    const shift = -lQuadratic / (2 * lambda);
    const shifted = F - (lQuadratic ** 2) / (4 * lambda);
    shell.canonical.shiftedConstant = shifted;
    if (Math.abs(lNull) > tolerance) {
      shell.conicKind = 'parabola';
      shell.canonical.parabolaAxis = nullIndex;
      const curve = makeCurve(shell, eigen.vectors, t => {
        const result: [number, number] = [0, 0];
        result[quadraticIndex] = shift + t;
        result[nullIndex] = -(lambda * t * t + shifted) / lNull;
        return result;
      }, [-extent, extent]);
      if (curve) shell.branches.push(curve);
      return shell;
    }
    const value = -shifted / lambda;
    if (value > tolerance) {
      shell.conicKind = 'two-lines';
      const root = Math.sqrt(value);
      for (const sign of [-1, 1]) {
        const curve = makeCurve(shell, eigen.vectors, t => {
          const result: [number, number] = [0, 0];
          result[quadraticIndex] = shift + Number(sign) * root;
          result[nullIndex] = t;
          return result;
        }, [-extent, extent], 32);
        if (curve) shell.branches.push(curve);
      }
    } else if (Math.abs(value) <= tolerance) {
      shell.conicKind = 'line';
      const curve = makeCurve(shell, eigen.vectors, t => {
        const result: [number, number] = [0, 0];
        result[quadraticIndex] = shift;
        result[nullIndex] = t;
        return result;
      }, [-extent, extent], 32);
      if (curve) shell.branches.push(curve);
    }
    return shell;
  }

  if (Math.hypot(D, E) > tolerance) {
    shell.conicKind = 'line';
    const length = Math.hypot(D, E);
    const point: [number, number] = [-F * D / (length * length), -F * E / (length * length)];
    const direction: [number, number] = [-E / length, D / length];
    const curve = createEvaluatedCurve3D(t => localToWorld(shell, [point[0] + direction[0] * t, point[1] + direction[1] * t]), [-extent, extent]);
    if (curve) shell.branches.push(curve);
  } else if (Math.abs(F) <= tolerance) {
    shell.conicKind = 'line';
  }
  return shell;
}

function quadraticFromImplicit(
  plane: Plane3,
  center: Vector3,
  matrixApply: (vector: Vector3) => Vector3,
  constant: number
): Quadratic {
  const p = subtractVector3(plane.point, center)!;
  const e1 = plane.direction1;
  const e2 = plane.direction2;
  const mp = matrixApply(p);
  const m1 = matrixApply(e1);
  const m2 = matrixApply(e2);
  return [
    dotVector3(e1, m1),
    2 * dotVector3(e1, m2),
    dotVector3(e2, m2),
    2 * dotVector3(e1, mp),
    2 * dotVector3(e2, mp),
    dotVector3(p, mp) + constant
  ];
}

export function intersectPlaneCylinderConic3D(plane: Plane3, cylinder: Cylinder3, extent = 20): ConicSection3D {
  const axis = normalizeVector3(cylinder.axis)!;
  const apply = (vector: Vector3): Vector3 => {
    const axial = scaleVector3(axis, dotVector3(vector, axis))!;
    return subtractVector3(vector, axial)!;
  };
  return classify('plane-cylinder', plane,
    quadraticFromImplicit(plane, cylinder.baseCenter, apply, -(cylinder.radius ** 2)), extent);
}

export function intersectPlaneConeConic3D(plane: Plane3, cone: Cone3, extent = 20): ConicSection3D {
  const axis = normalizeVector3(subtractVector3(cone.baseCenter, cone.apex) || cone.axis)!;
  const slope = cone.radius / cone.height;
  const apply = (vector: Vector3): Vector3 => {
    const axial = scaleVector3(axis, dotVector3(vector, axis))!;
    const perpendicular = subtractVector3(vector, axial)!;
    return subtractVector3(perpendicular, scaleVector3(axial, slope ** 2)!)!;
  };
  return classify('plane-cone', plane, quadraticFromImplicit(plane, cone.apex, apply, 0), extent);
}

export function transformConicSection3D(
  transform: SimilarityTransform3D, section: ConicSection3D
): ConicSection3D | null {
  const origin = transformPoint3D(transform, section.origin);
  if (!origin) return null;
  const branches = section.branches.map(curve => createEvaluatedCurve3D(t => {
    const point = curve.evaluate(t);
    return point ? transformPoint3D(transform, point) : null;
  }, curve.range, { parameter: curve.parameter, expressions: curve.expressions, quality: curve.quality })).filter(Boolean) as ParametricCurve3D[];
  const points = section.points.map(point => transformPoint3D(transform, point)).filter(Boolean) as Vector3[];
  return { ...section, origin, branches, points };
}