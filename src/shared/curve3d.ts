import { compileParameterizedExpression } from './functionExpression';
import { addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3 } from './vector3d';
import { crossVector3, dotVector3, parameterAllowed3D, signedDistancePointPlane, type LinearDomain3D, type Plane3 } from './plane3d';
import { pointInPolygon3D, type Polygon3 } from './polygon3d';
import type { Sphere3 } from './sphere3d';
import { transformDirection3D, transformPoint3D, type SimilarityTransform3D } from './transform3d';

export interface ParametricCurve3D {
  kind: 'curve3d';
  parameter: string;
  expressions: [string, string, string];
  range: [number, number];
  evaluate: (t: number) => Vector3 | null;
  quality: number;
}

export interface CurveSample3D { t: number; point: Vector3; }
export interface CurveFrame3D {
  point: Vector3;
  velocity: Vector3;
  tangent: Vector3;
  acceleration: Vector3 | null;
  normal: Vector3 | null;
  binormal: Vector3 | null;
  curvature: number;
}
export interface CurveIntersection3D { parameter: number; point: Vector3; branchId: string; }
export interface CurveSamplingOptions { quality?: number; tolerance?: number; maxPoints?: number; maxDepth?: number; }

const EPS = 1e-10;

function finitePoint(value: unknown): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const point: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return point.every(Number.isFinite) ? point : null;
}

function normalizeRange(value: readonly number[]): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = Number(value[0]);
  const second = Number(value[1]);
  return Number.isFinite(first) && Number.isFinite(second) && second > first ? [first, second] : null;
}

export function createParametricCurve3D(
  expressions: readonly string[],
  rangeValue: readonly number[],
  options: {
    parameter?: string;
    quality?: number;
    customVariables?: Record<string, number | (() => number)>;
    customFunctions?: Record<string, (...values: number[]) => number>;
  } = {}
): ParametricCurve3D | null {
  if (!Array.isArray(expressions) || expressions.length < 3) return null;
  const range = normalizeRange(rangeValue);
  if (!range) return null;
  const parameter = String(options.parameter || 't').trim().toLowerCase();
  const compiled = expressions.slice(0, 3).map(expression => compileParameterizedExpression(
    expression, [parameter], options.customFunctions || {}, options.customVariables || {}
  ));
  if (compiled.some(item => !item.fn)) return null;
  const source = expressions.slice(0, 3).map(String) as [string, string, string];
  return {
    kind: 'curve3d', parameter, expressions: source, range,
    quality: Math.max(8, Math.min(512, Math.round(Number(options.quality) || 96))),
    evaluate: (t: number): Vector3 | null => {
      if (!Number.isFinite(t)) return null;
      return finitePoint(compiled.map(item => item.fn!(t)));
    }
  };
}

export function createEvaluatedCurve3D(
  evaluate: (t: number) => readonly number[] | null,
  rangeValue: readonly number[],
  options: { parameter?: string; expressions?: [string, string, string]; quality?: number } = {}
): ParametricCurve3D | null {
  const range = normalizeRange(rangeValue);
  if (!range || typeof evaluate !== 'function') return null;
  return {
    kind: 'curve3d', parameter: options.parameter || 't',
    expressions: options.expressions || ['x(t)', 'y(t)', 'z(t)'], range,
    quality: Math.max(8, Math.min(512, Math.round(Number(options.quality) || 96))),
    evaluate: t => {
      try { return finitePoint(evaluate(t)); } catch (error) { return null; }
    }
  };
}

export function evaluateCurve3D(curve: ParametricCurve3D, t: number): Vector3 | null {
  if (!curve || !Number.isFinite(t) || t < curve.range[0] - EPS || t > curve.range[1] + EPS) return null;
  try { return finitePoint(curve.evaluate(t)); } catch (error) { return null; }
}

function derivativeStep(curve: ParametricCurve3D, t: number): number {
  const span = curve.range[1] - curve.range[0];
  return Math.max(1e-7, Math.min(span / 128, Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(t), span)));
}

export function curveDerivative3D(curve: ParametricCurve3D, t: number, order = 1): Vector3 | null {
  const h = derivativeStep(curve, t);
  const lower = curve.range[0];
  const upper = curve.range[1];
  if (order === 2) {
    const center = evaluateCurve3D(curve, t);
    const before = evaluateCurve3D(curve, Math.max(lower, t - h));
    const after = evaluateCurve3D(curve, Math.min(upper, t + h));
    if (!center || !before || !after) return null;
    const h1 = t - Math.max(lower, t - h);
    const h2 = Math.min(upper, t + h) - t;
    if (h1 <= 0 || h2 <= 0) return null;
    return [0, 1, 2].map(index =>
      2 * (before[index] / (h1 * (h1 + h2)) - center[index] / (h1 * h2) + after[index] / (h2 * (h1 + h2)))
    ) as Vector3;
  }
  const beforeT = Math.max(lower, t - h);
  const afterT = Math.min(upper, t + h);
  const before = evaluateCurve3D(curve, beforeT);
  const after = evaluateCurve3D(curve, afterT);
  const width = afterT - beforeT;
  return before && after && width > 0 ? scaleVector3(subtractVector3(after, before) || [], 1 / width) : null;
}

export function curveFrame3D(curve: ParametricCurve3D, t: number): CurveFrame3D | null {
  const point = evaluateCurve3D(curve, t);
  const velocity = curveDerivative3D(curve, t);
  const tangent = velocity && normalizeVector3(velocity);
  if (!point || !velocity || !tangent) return null;
  const acceleration = curveDerivative3D(curve, t, 2);
  const cross = acceleration ? crossVector3(velocity, acceleration) : null;
  const speed = vector3Norm(velocity);
  const curvature = cross && speed > EPS ? vector3Norm(cross) / (speed ** 3) : NaN;
  const binormal = cross && normalizeVector3(cross);
  const normal = binormal && normalizeVector3(crossVector3(binormal, tangent) || []);
  return { point, velocity, tangent, acceleration, normal, binormal, curvature };
}

function segmentError(first: Vector3, middle: Vector3, last: Vector3): number {
  const chordMiddle: Vector3 = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2, (first[2] + last[2]) / 2];
  return vector3Norm(subtractVector3(middle, chordMiddle) || []);
}

export function sampleCurve3D(curve: ParametricCurve3D, options: CurveSamplingOptions = {}): CurveSample3D[][] {
  const quality = Math.max(8, Math.min(512, Math.round(options.quality || curve.quality || 96)));
  const maxPoints = Math.max(quality, Math.min(4096, Math.round(options.maxPoints || quality * 8)));
  const maxDepth = Math.max(1, Math.min(12, Math.round(options.maxDepth || 8)));
  const span = curve.range[1] - curve.range[0];
  const tolerance = Math.max(1e-8, Number(options.tolerance) || 5e-4);
  const segments: CurveSample3D[][] = [];
  let current: CurveSample3D[] = [];
  let pointCount = 0;
  const append = (sample: CurveSample3D | null): void => {
    if (!sample) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    const previous = current[current.length - 1];
    if (!previous || Math.abs(previous.t - sample.t) > EPS) current.push(sample);
  };
  const refine = (a: CurveSample3D, b: CurveSample3D, depth: number): void => {
    if (pointCount >= maxPoints) { append(b); return; }
    const tm = (a.t + b.t) / 2;
    const pm = evaluateCurve3D(curve, tm);
    if (!pm) { append(null); return; }
    const scale = Math.max(1, vector3Norm(a.point), vector3Norm(pm), vector3Norm(b.point));
    const jump = vector3Norm(subtractVector3(b.point, a.point) || []);
    if (depth < maxDepth && (segmentError(a.point, pm, b.point) > tolerance * scale || jump > scale * 2)) {
      const middle = { t: tm, point: pm };
      refine(a, middle, depth + 1);
      refine(middle, b, depth + 1);
    } else {
      append(b);
      pointCount += 1;
    }
  };
  for (let index = 0; index < quality; index += 1) {
    const aT = curve.range[0] + span * index / quality;
    const bT = curve.range[0] + span * (index + 1) / quality;
    const aPoint = evaluateCurve3D(curve, aT);
    const bPoint = evaluateCurve3D(curve, bT);
    if (!aPoint || !bPoint) { append(null); continue; }
    const a = { t: aT, point: aPoint };
    if (!current.length) { append(a); pointCount += 1; }
    refine(a, { t: bT, point: bPoint }, 0);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

function speedAt(curve: ParametricCurve3D, t: number): number {
  const derivative = curveDerivative3D(curve, t);
  return derivative ? vector3Norm(derivative) : NaN;
}

function adaptiveSimpson(
  curve: ParametricCurve3D, a: number, b: number, fa: number, fm: number, fb: number,
  estimate: number, tolerance: number, depth: number
): number {
  const middle = (a + b) / 2;
  const leftMiddle = (a + middle) / 2;
  const rightMiddle = (middle + b) / 2;
  const fl = speedAt(curve, leftMiddle);
  const fr = speedAt(curve, rightMiddle);
  if (![fl, fr].every(Number.isFinite)) return NaN;
  const left = (middle - a) * (fa + 4 * fl + fm) / 6;
  const right = (b - middle) * (fm + 4 * fr + fb) / 6;
  if (depth <= 0 || Math.abs(left + right - estimate) <= 15 * tolerance) return left + right + (left + right - estimate) / 15;
  const first = adaptiveSimpson(curve, a, middle, fa, fl, fm, left, tolerance / 2, depth - 1);
  const second = adaptiveSimpson(curve, middle, b, fm, fr, fb, right, tolerance / 2, depth - 1);
  return Number.isFinite(first) && Number.isFinite(second) ? first + second : NaN;
}

export function curveArcLength3D(curve: ParametricCurve3D, from = curve.range[0], to = curve.range[1], tolerance = 1e-6): number {
  const a = Math.max(curve.range[0], Math.min(curve.range[1], Number(from)));
  const b = Math.max(curve.range[0], Math.min(curve.range[1], Number(to)));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  if (a === b) return 0;
  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  const pieces = Math.max(4, Math.min(64, Math.ceil((upper - lower) / Math.max(EPS, curve.range[1] - curve.range[0]) * 16)));
  let total = 0;
  for (let index = 0; index < pieces; index += 1) {
    const start = lower + (upper - lower) * index / pieces;
    const end = lower + (upper - lower) * (index + 1) / pieces;
    const middle = (start + end) / 2;
    const fa = speedAt(curve, start);
    const fm = speedAt(curve, middle);
    const fb = speedAt(curve, end);
    if (![fa, fm, fb].every(Number.isFinite)) return NaN;
    const estimate = (end - start) * (fa + 4 * fm + fb) / 6;
    const value = adaptiveSimpson(curve, start, end, fa, fm, fb, estimate, tolerance / pieces, 12);
    if (!Number.isFinite(value)) return NaN;
    total += value;
  }
  return total;
}

export function nearestCurveParameter3D(curve: ParametricCurve3D, pointValue: readonly number[], quality = 128): number {
  const target = finitePoint(pointValue);
  if (!target) return NaN;
  const count = Math.max(16, Math.min(1024, Math.round(quality)));
  const distanceSquared = (t: number): number => {
    const point = evaluateCurve3D(curve, t);
    return point ? dotVector3(subtractVector3(point, target)!, subtractVector3(point, target)!) : Infinity;
  };
  let bestT = curve.range[0];
  let best = Infinity;
  for (let index = 0; index <= count; index += 1) {
    const t = curve.range[0] + (curve.range[1] - curve.range[0]) * index / count;
    const distance = distanceSquared(t);
    if (distance < best) { best = distance; bestT = t; }
  }
  let step = (curve.range[1] - curve.range[0]) / count;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const left = Math.max(curve.range[0], bestT - step);
    const right = Math.min(curve.range[1], bestT + step);
    const leftDistance = distanceSquared(left);
    const rightDistance = distanceSquared(right);
    if (leftDistance < best) { best = leftDistance; bestT = left; }
    if (rightDistance < best) { best = rightDistance; bestT = right; }
    step *= 0.5;
  }
  return bestT;
}

function rootsOnCurve(
  curve: ParametricCurve3D,
  evaluateScalar: (point: Vector3, parameter: number) => number,
  options: { quality?: number; tolerance?: number } = {}
): number[] {
  const quality = Math.max(32, Math.min(2048, Math.round(options.quality || curve.quality * 4)));
  const tolerance = Math.max(1e-10, options.tolerance || 1e-7);
  const range = curve.range[1] - curve.range[0];
  const samples: Array<{ t: number; value: number }> = [];
  for (let index = 0; index <= quality; index += 1) {
    const t = curve.range[0] + range * index / quality;
    const point = evaluateCurve3D(curve, t);
    const value = point ? Number(evaluateScalar(point, t)) : NaN;
    samples.push({ t, value });
  }
  const roots: number[] = [];
  const addRoot = (value: number): void => {
    if (!Number.isFinite(value)) return;
    const merge = Math.max(1e-8, range / quality / 8);
    if (!roots.some(root => Math.abs(root - value) <= merge)) roots.push(value);
  };
  for (let index = 0; index < quality; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) continue;
    if (Math.abs(a.value) <= tolerance) addRoot(a.t);
    if (a.value * b.value < 0) {
      let left = a.t;
      let right = b.t;
      let leftValue = a.value;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const middle = (left + right) / 2;
        const point = evaluateCurve3D(curve, middle);
        const middleValue = point ? evaluateScalar(point, middle) : NaN;
        if (!Number.isFinite(middleValue)) break;
        if (Math.abs(middleValue) <= tolerance || right - left <= range * 1e-12) { left = right = middle; break; }
        if (leftValue * middleValue <= 0) right = middle;
        else { left = middle; leftValue = middleValue; }
      }
      addRoot((left + right) / 2);
    } else if (index > 0 && index < quality - 1) {
      const previous = samples[index - 1];
      const next = samples[index + 1];
      if (Number.isFinite(previous.value) && Number.isFinite(next.value) &&
          Math.abs(a.value) <= Math.abs(previous.value) && Math.abs(a.value) <= Math.abs(next.value)) {
        let left = previous.t;
        let right = next.t;
        for (let iteration = 0; iteration < 32; iteration += 1) {
          const m1 = left + (right - left) / 3;
          const m2 = right - (right - left) / 3;
          const p1 = evaluateCurve3D(curve, m1);
          const p2 = evaluateCurve3D(curve, m2);
          const f1 = p1 ? Math.abs(evaluateScalar(p1, m1)) : Infinity;
          const f2 = p2 ? Math.abs(evaluateScalar(p2, m2)) : Infinity;
          if (f1 < f2) right = m2; else left = m1;
        }
        const candidate = (left + right) / 2;
        const point = evaluateCurve3D(curve, candidate);
        if (point && Math.abs(evaluateScalar(point, candidate)) <= tolerance * 8) addRoot(candidate);
      }
    }
  }
  if (Math.abs(samples[quality].value) <= tolerance) addRoot(samples[quality].t);
  return roots.sort((a, b) => a - b);
}

function intersectionsFromRoots(curve: ParametricCurve3D, roots: number[], prefix: string): CurveIntersection3D[] {
  const results: CurveIntersection3D[] = [];
  roots.forEach(parameter => {
    const point = evaluateCurve3D(curve, parameter);
    if (!point) return;
    const duplicate = results.some(result => {
      const difference = subtractVector3(point, result.point);
      const scale = Math.max(1, vector3Norm(point), vector3Norm(result.point));
      return !!difference && vector3Norm(difference) <= 1e-7 * scale;
    });
    if (!duplicate) results.push({ parameter, point, branchId: prefix + ':' + results.length });
  });
  return results;
}

export function intersectCurvePlane3D(curve: ParametricCurve3D, plane: Plane3): CurveIntersection3D[] {
  return intersectionsFromRoots(curve, rootsOnCurve(curve, point => signedDistancePointPlane(point, plane)), 'curve-plane');
}

export function intersectCurveSphere3D(curve: ParametricCurve3D, sphere: Sphere3): CurveIntersection3D[] {
  return intersectionsFromRoots(curve, rootsOnCurve(curve, point => {
    const difference = subtractVector3(point, sphere.center);
    return difference ? dotVector3(difference, difference) - sphere.radius ** 2 : NaN;
  }), 'curve-sphere');
}

export function intersectCurvePolygon3D(curve: ParametricCurve3D, polygon: Polygon3): CurveIntersection3D[] {
  return intersectCurvePlane3D(curve, polygon.plane)
    .filter(result => pointInPolygon3D(result.point, polygon))
    .map((result, index) => ({ ...result, branchId: 'curve-polygon:' + index }));
}

export function curveContainedInPlane3D(curve: ParametricCurve3D, plane: Plane3, tolerance = 1e-7): boolean {
  if (!curve || !plane) return false;
  let valid = 0;
  for (let index = 0; index <= 24; index += 1) {
    const parameter = curve.range[0] + (curve.range[1] - curve.range[0]) * index / 24;
    const point = evaluateCurve3D(curve, parameter);
    if (!point) continue;
    valid += 1;
    const scale = Math.max(1, vector3Norm(point), vector3Norm(plane.point));
    if (Math.abs(signedDistancePointPlane(point, plane)) > tolerance * scale) return false;
  }
  return valid >= 3;
}

export function intersectCurveLine3D(
  curve: ParametricCurve3D,
  anchorValue: readonly number[],
  directionValue: readonly number[],
  domain: LinearDomain3D = 'line'
): CurveIntersection3D[] {
  const anchor = finitePoint(anchorValue);
  const direction = finitePoint(directionValue);
  const directionSquared = direction ? dotVector3(direction, direction) : NaN;
  if (!anchor || !direction || !Number.isFinite(directionSquared) || directionSquared <= EPS) return [];
  const roots = rootsOnCurve(curve, point => {
    const difference = subtractVector3(point, anchor);
    if (!difference) return NaN;
    const parameter = dotVector3(difference, direction) / directionSquared;
    const projection = addVector3(anchor, scaleVector3(direction, parameter) || []);
    const perpendicular = projection && subtractVector3(point, projection);
    const scale = Math.max(1, vector3Norm(point), vector3Norm(anchor));
    return perpendicular ? dotVector3(perpendicular, perpendicular) / (scale * scale) : NaN;
  }, { quality: Math.max(128, curve.quality * 6), tolerance: 1e-10 });
  return intersectionsFromRoots(curve, roots, 'curve-line').filter(result => {
    const difference = subtractVector3(result.point, anchor);
    const lineParameter = difference ? dotVector3(difference, direction) / directionSquared : NaN;
    if (!parameterAllowed3D(lineParameter, domain, 1e-7)) return false;
    const projection = addVector3(anchor, scaleVector3(direction, lineParameter) || []);
    const residual = projection && subtractVector3(result.point, projection);
    const scale = Math.max(1, vector3Norm(result.point), vector3Norm(anchor));
    return !!residual && vector3Norm(residual) <= 2e-5 * scale;
  }).map((result, index) => ({ ...result, branchId: 'curve-line:' + index }));
}
export function transformCurve3D(transform: SimilarityTransform3D, curve: ParametricCurve3D): ParametricCurve3D | null {
  return createEvaluatedCurve3D(t => {
    const point = evaluateCurve3D(curve, t);
    return point ? transformPoint3D(transform, point) : null;
  }, curve.range, {
    parameter: curve.parameter,
    expressions: curve.expressions.map(expression => 'T(' + expression + ')') as [string, string, string],
    quality: curve.quality
  });
}

export function transformedCurveTangent3D(transform: SimilarityTransform3D, curve: ParametricCurve3D, t: number): Vector3 | null {
  const derivative = curveDerivative3D(curve, t);
  return derivative ? transformDirection3D(transform, derivative) : null;
}