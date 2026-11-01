import { compileParameterizedExpression } from './functionExpression';
import { addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3 } from './vector3d';
import { crossVector3, dotVector3, planeFromPointNormal, type Plane3 } from './plane3d';
import { transformDirection3D, transformPoint3D, type SimilarityTransform3D } from './transform3d';

export interface ParametricSurface3D {
  kind: 'surface3d';
  parameters: [string, string];
  expressions: [string, string, string];
  uRange: [number, number];
  vRange: [number, number];
  quality: [number, number];
  evaluate: (u: number, v: number) => Vector3 | null;
  functionGraph?: boolean;
}

export interface SurfaceFrame3D {
  point: Vector3;
  tangentU: Vector3;
  tangentV: Vector3;
  normal: Vector3;
  tangentPlane: Plane3;
}

export interface SurfaceMesh3D {
  uValues: number[];
  vValues: number[];
  points: Array<Array<Vector3 | null>>;
  cells: Array<[Vector3, Vector3, Vector3, Vector3]>;
}

const EPS = 1e-10;

function range(value: readonly number[]): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const a = Number(value[0]);
  const b = Number(value[1]);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? [a, b] : null;
}

function finitePoint(value: unknown): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const result: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return result.every(Number.isFinite) ? result : null;
}

function quality(value: unknown, fallback = 24): number {
  return Math.max(4, Math.min(128, Math.round(Number(value) || fallback)));
}

export function createParametricSurface3D(
  expressions: readonly string[],
  uRangeValue: readonly number[],
  vRangeValue: readonly number[],
  options: {
    parameters?: [string, string]; quality?: number | [number, number];
    customVariables?: Record<string, number | (() => number)>;
    customFunctions?: Record<string, (...values: number[]) => number>;
    functionGraph?: boolean;
  } = {}
): ParametricSurface3D | null {
  if (!Array.isArray(expressions) || expressions.length < 3) return null;
  const uRange = range(uRangeValue);
  const vRange = range(vRangeValue);
  if (!uRange || !vRange) return null;
  const parameters = options.parameters || ['u', 'v'];
  const compiled = expressions.slice(0, 3).map(expression => compileParameterizedExpression(
    expression, parameters, options.customFunctions || {}, options.customVariables || {}
  ));
  if (compiled.some(item => !item.fn)) return null;
  const q = Array.isArray(options.quality)
    ? [quality(options.quality[0]), quality(options.quality[1])] as [number, number]
    : [quality(options.quality), quality(options.quality)] as [number, number];
  return {
    kind: 'surface3d', parameters, expressions: expressions.slice(0, 3).map(String) as [string, string, string],
    uRange, vRange, quality: q, functionGraph: Boolean(options.functionGraph),
    evaluate: (u, v) => finitePoint(compiled.map(item => item.fn!(u, v)))
  };
}

export function createFunctionSurface3D(
  expression: string,
  xRange: readonly number[],
  yRange: readonly number[],
  options: Omit<Parameters<typeof createParametricSurface3D>[3], 'parameters' | 'functionGraph'> = {}
): ParametricSurface3D | null {
  return createParametricSurface3D(['u', 'v', expression], xRange, yRange, {
    ...options, parameters: ['u', 'v'], functionGraph: true
  });
}

export function createEvaluatedSurface3D(
  evaluate: (u: number, v: number) => readonly number[] | null,
  uRangeValue: readonly number[],
  vRangeValue: readonly number[],
  options: Partial<Pick<ParametricSurface3D, 'parameters' | 'expressions' | 'quality' | 'functionGraph'>> = {}
): ParametricSurface3D | null {
  const uRange = range(uRangeValue);
  const vRange = range(vRangeValue);
  if (!uRange || !vRange || typeof evaluate !== 'function') return null;
  return {
    kind: 'surface3d', parameters: options.parameters || ['u', 'v'],
    expressions: options.expressions || ['x(u,v)', 'y(u,v)', 'z(u,v)'],
    uRange, vRange, quality: options.quality || [24, 24], functionGraph: options.functionGraph,
    evaluate: (u, v) => {
      try { return finitePoint(evaluate(u, v)); } catch (error) { return null; }
    }
  };
}

export function evaluateSurface3D(surface: ParametricSurface3D, u: number, v: number): Vector3 | null {
  if (!surface || !Number.isFinite(u) || !Number.isFinite(v) ||
      u < surface.uRange[0] - EPS || u > surface.uRange[1] + EPS ||
      v < surface.vRange[0] - EPS || v > surface.vRange[1] + EPS) return null;
  try { return finitePoint(surface.evaluate(u, v)); } catch (error) { return null; }
}

function partialStep(parameter: number, parameterRange: [number, number]): number {
  const span = parameterRange[1] - parameterRange[0];
  return Math.max(1e-7, Math.min(span / 128, Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(parameter), span)));
}

export function surfacePartialDerivative3D(
  surface: ParametricSurface3D, u: number, v: number, parameter: 'u' | 'v'
): Vector3 | null {
  const parameterRange = parameter === 'u' ? surface.uRange : surface.vRange;
  const value = parameter === 'u' ? u : v;
  const h = partialStep(value, parameterRange);
  const before = Math.max(parameterRange[0], value - h);
  const after = Math.min(parameterRange[1], value + h);
  const first = parameter === 'u' ? evaluateSurface3D(surface, before, v) : evaluateSurface3D(surface, u, before);
  const second = parameter === 'u' ? evaluateSurface3D(surface, after, v) : evaluateSurface3D(surface, u, after);
  return first && second && after > before ? scaleVector3(subtractVector3(second, first) || [], 1 / (after - before)) : null;
}

export function surfaceFrame3D(surface: ParametricSurface3D, u: number, v: number): SurfaceFrame3D | null {
  const point = evaluateSurface3D(surface, u, v);
  const tangentU = surfacePartialDerivative3D(surface, u, v, 'u');
  const tangentV = surfacePartialDerivative3D(surface, u, v, 'v');
  const normalRaw = tangentU && tangentV ? crossVector3(tangentU, tangentV) : null;
  const normal = normalRaw && normalizeVector3(normalRaw);
  const tangentPlane = point && normal ? planeFromPointNormal(point, normal) : null;
  return point && tangentU && tangentV && normal && tangentPlane &&
    vector3Norm(tangentU) > EPS && vector3Norm(tangentV) > EPS
    ? { point, tangentU, tangentV, normal, tangentPlane }
    : null;
}

export function sampleSurface3D(
  surface: ParametricSurface3D,
  qualityOverride?: number | [number, number]
): SurfaceMesh3D {
  const q = Array.isArray(qualityOverride)
    ? [quality(qualityOverride[0]), quality(qualityOverride[1])] as [number, number]
    : qualityOverride == null ? surface.quality : [quality(qualityOverride), quality(qualityOverride)] as [number, number];
  const uValues = Array.from({ length: q[0] + 1 }, (_, index) =>
    surface.uRange[0] + (surface.uRange[1] - surface.uRange[0]) * index / q[0]);
  const vValues = Array.from({ length: q[1] + 1 }, (_, index) =>
    surface.vRange[0] + (surface.vRange[1] - surface.vRange[0]) * index / q[1]);
  const points = uValues.map(u => vValues.map(v => evaluateSurface3D(surface, u, v)));
  const cells: Array<[Vector3, Vector3, Vector3, Vector3]> = [];
  for (let uIndex = 0; uIndex < q[0]; uIndex += 1) {
    for (let vIndex = 0; vIndex < q[1]; vIndex += 1) {
      const corners = [
        points[uIndex][vIndex], points[uIndex + 1][vIndex],
        points[uIndex + 1][vIndex + 1], points[uIndex][vIndex + 1]
      ];
      if (corners.every(Boolean)) cells.push(corners as [Vector3, Vector3, Vector3, Vector3]);
    }
  }
  return { uValues, vValues, points, cells };
}

export function nearestSurfaceParameters3D(
  surface: ParametricSurface3D,
  pointValue: readonly number[],
  qualityOverride = 24
): { u: number; v: number; point: Vector3; distance: number } | null {
  const target = finitePoint(pointValue);
  if (!target) return null;
  const count = quality(qualityOverride, 24);
  const distanceSquared = (u: number, v: number): { distance: number; point: Vector3 | null } => {
    const point = evaluateSurface3D(surface, u, v);
    const difference = point && subtractVector3(point, target);
    return { distance: difference ? dotVector3(difference, difference) : Infinity, point };
  };
  let bestU = surface.uRange[0];
  let bestV = surface.vRange[0];
  let bestPoint: Vector3 | null = null;
  let best = Infinity;
  for (let ui = 0; ui <= count; ui += 1) {
    for (let vi = 0; vi <= count; vi += 1) {
      const u = surface.uRange[0] + (surface.uRange[1] - surface.uRange[0]) * ui / count;
      const v = surface.vRange[0] + (surface.vRange[1] - surface.vRange[0]) * vi / count;
      const candidate = distanceSquared(u, v);
      if (candidate.distance < best) { best = candidate.distance; bestU = u; bestV = v; bestPoint = candidate.point; }
    }
  }
  let uStep = (surface.uRange[1] - surface.uRange[0]) / count;
  let vStep = (surface.vRange[1] - surface.vRange[0]) / count;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let improved = false;
    for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const u = Math.max(surface.uRange[0], Math.min(surface.uRange[1], bestU + Number(du) * uStep));
      const v = Math.max(surface.vRange[0], Math.min(surface.vRange[1], bestV + Number(dv) * vStep));
      const candidate = distanceSquared(u, v);
      if (candidate.distance < best) {
        best = candidate.distance; bestU = u; bestV = v; bestPoint = candidate.point; improved = true;
      }
    }
    if (!improved) { uStep *= 0.5; vStep *= 0.5; }
  }
  return bestPoint ? { u: bestU, v: bestV, point: bestPoint, distance: Math.sqrt(best) } : null;
}

export function transformSurface3D(
  transform: SimilarityTransform3D,
  surface: ParametricSurface3D
): ParametricSurface3D | null {
  return createEvaluatedSurface3D((u, v) => {
    const point = evaluateSurface3D(surface, u, v);
    return point ? transformPoint3D(transform, point) : null;
  }, surface.uRange, surface.vRange, {
    parameters: surface.parameters,
    expressions: surface.expressions.map(expression => 'T(' + expression + ')') as [string, string, string],
    quality: surface.quality,
    functionGraph: surface.functionGraph
  });
}

export function transformedSurfaceNormal3D(
  transform: SimilarityTransform3D, surface: ParametricSurface3D, u: number, v: number
): Vector3 | null {
  const frame = surfaceFrame3D(surface, u, v);
  const transformed = frame ? transformDirection3D(transform, frame.normal) : null;
  return transformed && normalizeVector3(transformed);
}