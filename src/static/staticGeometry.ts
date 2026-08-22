// Pure geometry primitives shared by the native static SVG renderer.
// This module intentionally has no DOM or JSXGraph dependency.

import { compileFunctionExpression } from '../shared/functionExpression';
import type { CoordinatePair } from '../shared/parser';

const TWO_PI = Math.PI * 2;
const DEFAULT_SAMPLE_COUNT = 512;
const MIN_SAMPLE_COUNT = 8;
const MAX_SAMPLE_COUNT = 8192;

export interface StaticGeometryBounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface StaticClippedSegment {
  start: CoordinatePair;
  end: CoordinatePair;
  /** Parameter of `start` in `origin + t * direction`. */
  tStart: number;
  /** Parameter of `end` in `origin + t * direction`. */
  tEnd: number;
}

export type StaticArcDirection = 'ccw' | 'cw';

export interface StaticCircularArcOptions {
  /** Direction in the mathematical, y-up coordinate system. */
  direction?: StaticArcDirection;
  /** Interpret coincident start and end angles as one complete revolution. */
  fullCircle?: boolean;
}

export interface StaticCircularArcSegment {
  start: CoordinatePair;
  end: CoordinatePair;
  startAngleRadians: number;
  endAngleRadians: number;
  /** Signed mathematical sweep: counterclockwise is positive. */
  sweepRadians: number;
  svgLargeArcFlag: 0 | 1;
  /** Ready for projected SVG coordinates: mathematical CCW maps to SVG sweep 0. */
  svgSweepFlag: 0 | 1;
}

export interface StaticCircularArcGeometry {
  center: CoordinatePair;
  radius: number;
  start: CoordinatePair;
  end: CoordinatePair;
  startAngleRadians: number;
  endAngleRadians: number;
  /** Signed mathematical sweep: counterclockwise is positive. */
  sweepRadians: number;
  /** A full circle is represented by two semicircles; other arcs need at most one segment. */
  segments: StaticCircularArcSegment[];
}

export interface StaticFunctionSamplingOptions {
  /** Number of deterministic, equally wide x-intervals. Defaults to 512. */
  sampleCount?: number;
  /** Absolute endpoint jump that triggers a discontinuity check. Defaults to four y-spans. */
  discontinuityThreshold?: number;
  /** Allowed deviation of the midpoint from linear interpolation. Defaults to 0.75 y-spans. */
  curvatureThreshold?: number;
  /** Evaluations above this absolute value are treated as unsafe. */
  maxAbsoluteY?: number;
}

export interface StaticFunctionSamplingResult {
  /** Polylines clipped to the requested bounds. No segment crosses a detected gap. */
  segments: CoordinatePair[][];
  sampleCount: number;
  evaluationCount: number;
}

export function isFiniteStaticPoint(point: CoordinatePair | null | undefined): point is CoordinatePair {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function staticVector(from: CoordinatePair, to: CoordinatePair): CoordinatePair {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function staticVectorLength(vector: CoordinatePair): number {
  return Math.hypot(vector.x, vector.y);
}

export function staticPointAt(
  origin: CoordinatePair,
  direction: CoordinatePair,
  parameter: number
): CoordinatePair {
  return {
    x: origin.x + parameter * direction.x,
    y: origin.y + parameter * direction.y
  };
}

function hasValidBounds(bounds: StaticGeometryBounds | null | undefined): bounds is StaticGeometryBounds {
  return !!bounds &&
    Number.isFinite(bounds.xmin) && Number.isFinite(bounds.xmax) &&
    Number.isFinite(bounds.ymin) && Number.isFinite(bounds.ymax) &&
    bounds.xmin <= bounds.xmax && bounds.ymin <= bounds.ymax;
}

function insideBounds(point: CoordinatePair, bounds: StaticGeometryBounds): boolean {
  return point.x >= bounds.xmin && point.x <= bounds.xmax &&
    point.y >= bounds.ymin && point.y <= bounds.ymax;
}

function clampToBounds(point: CoordinatePair, bounds: StaticGeometryBounds): CoordinatePair {
  return {
    x: Math.max(bounds.xmin, Math.min(bounds.xmax, point.x)),
    y: Math.max(bounds.ymin, Math.min(bounds.ymax, point.y))
  };
}

/**
 * Clip `origin + t * direction` to a rectangular board.
 *
 * The default parameter interval represents an infinite line. Passing
 * `[0, +Infinity]` gives a ray and `[0, 1]` gives a finite segment. Returned
 * parameters retain the scale of the authored direction vector.
 */
export function clipParametricLineToBounds(
  origin: CoordinatePair,
  direction: CoordinatePair,
  bounds: StaticGeometryBounds,
  minimumParameter = -Infinity,
  maximumParameter = Infinity
): StaticClippedSegment | null {
  if (!isFiniteStaticPoint(origin) || !isFiniteStaticPoint(direction) || !hasValidBounds(bounds)) {
    return null;
  }
  if ((direction.x === 0 && direction.y === 0) ||
      Number.isNaN(minimumParameter) || Number.isNaN(maximumParameter) ||
      minimumParameter > maximumParameter) {
    return null;
  }

  let tStart = minimumParameter;
  let tEnd = maximumParameter;

  const clipAxis = function(
    originValue: number,
    directionValue: number,
    minimum: number,
    maximum: number
  ): boolean {
    if (directionValue === 0) return originValue >= minimum && originValue <= maximum;
    let entry = (minimum - originValue) / directionValue;
    let exit = (maximum - originValue) / directionValue;
    if (entry > exit) {
      const swap = entry;
      entry = exit;
      exit = swap;
    }
    tStart = Math.max(tStart, entry);
    tEnd = Math.min(tEnd, exit);
    return tStart <= tEnd;
  };

  if (!clipAxis(origin.x, direction.x, bounds.xmin, bounds.xmax) ||
      !clipAxis(origin.y, direction.y, bounds.ymin, bounds.ymax) ||
      !Number.isFinite(tStart) || !Number.isFinite(tEnd)) {
    return null;
  }

  const start = staticPointAt(origin, direction, tStart);
  const end = staticPointAt(origin, direction, tEnd);
  if (!isFiniteStaticPoint(start) || !isFiniteStaticPoint(end)) return null;
  return {
    start: clampToBounds(start, bounds),
    end: clampToBounds(end, bounds),
    tStart,
    tEnd
  };
}

/** Clip an infinite line defined by two distinct authored points. */
export function clipLineToBounds(
  first: CoordinatePair,
  second: CoordinatePair,
  bounds: StaticGeometryBounds
): StaticClippedSegment | null {
  return clipParametricLineToBounds(first, staticVector(first, second), bounds);
}

/** Clip a ray starting at `origin` and passing through `through`. */
export function clipRayToBounds(
  origin: CoordinatePair,
  through: CoordinatePair,
  bounds: StaticGeometryBounds
): StaticClippedSegment | null {
  return clipParametricLineToBounds(origin, staticVector(origin, through), bounds, 0, Infinity);
}

/** Clip a finite line segment to the board. */
export function clipSegmentToBounds(
  first: CoordinatePair,
  second: CoordinatePair,
  bounds: StaticGeometryBounds
): StaticClippedSegment | null {
  if (isFiniteStaticPoint(first) && isFiniteStaticPoint(second) &&
      first.x === second.x && first.y === second.y) {
    if (!hasValidBounds(bounds) || !insideBounds(first, bounds)) return null;
    return { start: { ...first }, end: { ...first }, tStart: 0, tEnd: 0 };
  }
  return clipParametricLineToBounds(first, staticVector(first, second), bounds, 0, 1);
}

/** Normalize an angle to `[0, 2π)`. Invalid input produces `NaN`. */
export function normalizeAngleRadians(angle: number): number {
  if (!Number.isFinite(angle)) return NaN;
  const normalized = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  return normalized <= Number.EPSILON * TWO_PI ||
    Math.abs(normalized - TWO_PI) <= Number.EPSILON * TWO_PI ? 0 : normalized;
}

/** Normalize an angle to `[0, 360)`. Invalid input produces `NaN`. */
export function normalizeAngleDegrees(angle: number): number {
  if (!Number.isFinite(angle)) return NaN;
  const normalized = ((angle % 360) + 360) % 360;
  return normalized <= Number.EPSILON * 360 ||
    Math.abs(normalized - 360) <= Number.EPSILON * 360 ? 0 : normalized;
}

/**
 * Return a directed mathematical sweep from `start` to `end`.
 * Counterclockwise sweeps are positive, clockwise sweeps are negative.
 */
export function directedAngleSweepRadians(
  startAngleRadians: number,
  endAngleRadians: number,
  direction: StaticArcDirection = 'ccw',
  fullCircle = false
): number {
  if (!Number.isFinite(startAngleRadians) || !Number.isFinite(endAngleRadians)) return NaN;
  const magnitude = direction === 'cw'
    ? normalizeAngleRadians(startAngleRadians - endAngleRadians)
    : normalizeAngleRadians(endAngleRadians - startAngleRadians);
  const resolvedMagnitude = fullCircle && magnitude === 0 ? TWO_PI : magnitude;
  return direction === 'cw' ? -resolvedMagnitude : resolvedMagnitude;
}

export function staticPointOnCircle(
  center: CoordinatePair,
  radius: number,
  angleRadians: number
): CoordinatePair {
  return {
    x: center.x + radius * Math.cos(angleRadians),
    y: center.y + radius * Math.sin(angleRadians)
  };
}

function circularArcSegment(
  center: CoordinatePair,
  radius: number,
  startAngleRadians: number,
  sweepRadians: number
): StaticCircularArcSegment {
  const endAngleRadians = startAngleRadians + sweepRadians;
  return {
    start: staticPointOnCircle(center, radius, startAngleRadians),
    end: staticPointOnCircle(center, radius, endAngleRadians),
    startAngleRadians: normalizeAngleRadians(startAngleRadians),
    endAngleRadians: normalizeAngleRadians(endAngleRadians),
    sweepRadians,
    svgLargeArcFlag: Math.abs(sweepRadians) > Math.PI ? 1 : 0,
    // Logical y coordinates are projected by negating y. This reverses SVG's
    // visual sweep direction, hence mathematical CCW uses SVG sweep flag 0.
    svgSweepFlag: sweepRadians < 0 ? 1 : 0
  };
}

/**
 * Build logical circle-arc geometry for an SVG path. Angles use radians in a
 * mathematical y-up system; every returned SVG flag already accounts for the
 * later y-axis projection. Full circles are split into two valid SVG arcs.
 */
export function createDirectedCircularArcGeometry(
  center: CoordinatePair,
  radius: number,
  startAngleRadians: number,
  endAngleRadians: number,
  options: StaticCircularArcOptions = {}
): StaticCircularArcGeometry | null {
  if (!isFiniteStaticPoint(center) || !Number.isFinite(radius) || radius <= 0 ||
      !Number.isFinite(startAngleRadians) || !Number.isFinite(endAngleRadians)) {
    return null;
  }
  const direction = options.direction === 'cw' ? 'cw' : 'ccw';
  const normalizedStart = normalizeAngleRadians(startAngleRadians);
  const sweepRadians = directedAngleSweepRadians(
    startAngleRadians,
    endAngleRadians,
    direction,
    options.fullCircle === true
  );
  if (!Number.isFinite(sweepRadians)) return null;

  let segments: StaticCircularArcSegment[] = [];
  const isFullCircle = Math.abs(sweepRadians) >= TWO_PI - Number.EPSILON * TWO_PI;
  if (isFullCircle) {
    const halfSweep = sweepRadians / 2;
    segments = [
      circularArcSegment(center, radius, normalizedStart, halfSweep),
      circularArcSegment(center, radius, normalizedStart + halfSweep, halfSweep)
    ];
  } else if (sweepRadians !== 0) {
    segments = [circularArcSegment(center, radius, normalizedStart, sweepRadians)];
  }

  const start = staticPointOnCircle(center, radius, normalizedStart);
  const end = isFullCircle
    ? { ...start }
    : staticPointOnCircle(center, radius, normalizedStart + sweepRadians);
  return {
    center: { ...center },
    radius,
    start,
    end,
    startAngleRadians: normalizedStart,
    endAngleRadians: normalizeAngleRadians(normalizedStart + sweepRadians),
    sweepRadians,
    segments
  };
}

/** Convenience geometry for an angle whose rays are authored as points. */
export function createDirectedAngleArcGeometry(
  vertex: CoordinatePair,
  fromPoint: CoordinatePair,
  toPoint: CoordinatePair,
  radius: number,
  options: StaticCircularArcOptions = {}
): StaticCircularArcGeometry | null {
  if (!isFiniteStaticPoint(vertex) || !isFiniteStaticPoint(fromPoint) ||
      !isFiniteStaticPoint(toPoint)) return null;
  const fromVector = staticVector(vertex, fromPoint);
  const toVector = staticVector(vertex, toPoint);
  if (staticVectorLength(fromVector) === 0 || staticVectorLength(toVector) === 0) return null;
  return createDirectedCircularArcGeometry(
    vertex,
    radius,
    Math.atan2(fromVector.y, fromVector.x),
    Math.atan2(toVector.y, toVector.x),
    options
  );
}

function samplingNumber(value: unknown, fallback: number, minimum = Number.EPSILON): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function samePoint(
  first: CoordinatePair,
  second: CoordinatePair,
  tolerance: CoordinatePair
): boolean {
  return Math.abs(first.x - second.x) <= tolerance.x &&
    Math.abs(first.y - second.y) <= tolerance.y;
}

/**
 * Deterministically sample and clip a self-contained function.
 *
 * Besides non-finite evaluations, every interval is checked at its quarter
 * points for concentrated jumps and curvature. This prevents common straight
 * bridges across poles and bounded step discontinuities while retaining steep
 * but locally linear continuous graphs.
 */
export function sampleStaticFunction(
  evaluator: ((x: number) => number) | null | undefined,
  bounds: StaticGeometryBounds,
  options: StaticFunctionSamplingOptions = {}
): StaticFunctionSamplingResult | null {
  if (typeof evaluator !== 'function' || !hasValidBounds(bounds) ||
      bounds.xmin === bounds.xmax || bounds.ymin === bounds.ymax) return null;

  const requestedCount = Number(options.sampleCount);
  const sampleCount = Number.isFinite(requestedCount)
    ? Math.max(MIN_SAMPLE_COUNT, Math.min(MAX_SAMPLE_COUNT, Math.floor(requestedCount)))
    : DEFAULT_SAMPLE_COUNT;
  const ySpan = bounds.ymax - bounds.ymin;
  const yScale = Math.max(
    Number.MIN_VALUE,
    Math.abs(bounds.ymin),
    Math.abs(bounds.ymax),
    ySpan
  );
  const discontinuityThreshold = samplingNumber(options.discontinuityThreshold, ySpan * 4);
  const curvatureThreshold = samplingNumber(options.curvatureThreshold, ySpan * 0.75);
  const maxAbsoluteY = samplingNumber(options.maxAbsoluteY, yScale * 1e6);
  const xSpan = bounds.xmax - bounds.xmin;
  const pointTolerance = { x: xSpan * 1e-12, y: ySpan * 1e-12 };
  const xStep = xSpan / sampleCount;
  const segments: CoordinatePair[][] = [];
  let current: CoordinatePair[] = [];
  let evaluationCount = 0;

  const evaluate = function(x: number): number {
    evaluationCount += 1;
    try {
      const value = Number(evaluator(x));
      return Number.isFinite(value) && Math.abs(value) <= maxAbsoluteY ? value : NaN;
    } catch (e) {
      return NaN;
    }
  };
  const flush = function(): void {
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  const appendClipped = function(clipped: StaticClippedSegment | null): void {
    if (!clipped || samePoint(clipped.start, clipped.end, pointTolerance)) {
      flush();
      return;
    }
    if (!current.length) {
      current = [{ ...clipped.start }, { ...clipped.end }];
      return;
    }
    const last = current[current.length - 1];
    if (!samePoint(last, clipped.start, pointTolerance)) {
      flush();
      current = [{ ...clipped.start }, { ...clipped.end }];
      return;
    }
    if (!samePoint(last, clipped.end, pointTolerance)) current.push({ ...clipped.end });
  };
  const likelyDiscontinuous = function(
    xStart: number,
    xEnd: number,
    values: readonly number[]
  ): boolean {
    if (values.length < 3 || values.some((value) => !Number.isFinite(value))) return true;
    const yStart = values[0];
    const yMid = values[Math.floor(values.length / 2)];
    const yEnd = values[values.length - 1];
    const endpointJump = Math.abs(yEnd - yStart);
    const midpointDeviation = Math.abs(yMid - (yStart + yEnd) / 2);
    const midpointSpike = yMid > Math.max(yStart, yEnd) + discontinuityThreshold ||
      yMid < Math.min(yStart, yEnd) - discontinuityThreshold;
    const oppositeOutside = (yStart < bounds.ymin && yEnd > bounds.ymax) ||
      (yEnd < bounds.ymin && yStart > bounds.ymax);
    const largeMidpointDeviation = midpointDeviation > curvatureThreshold &&
      (endpointJump > discontinuityThreshold || midpointSpike || oppositeOutside);

    const deltas = values.slice(1).map((value, index) =>
      Math.abs(value - values[index]));
    const totalVariation = deltas.reduce((sum, value) => sum + value, 0);
    const largestDelta = Math.max(0, ...deltas);
    const meaningfulVariation = Math.max(
      ySpan * 1e-9,
      Number.EPSILON * ySpan * 64,
      Number.MIN_VALUE * 64
    );
    const concentratedJump = totalVariation > meaningfulVariation &&
      largestDelta / totalVariation >= 0.68;

    const curvatures = values.slice(1, -1).map((value, index) =>
      Math.abs(values[index + 2] - 2 * value + values[index]));
    const totalCurvature = curvatures.reduce((sum, value) => sum + value, 0);
    const largestCurvatures = [...curvatures].sort((first, second) => second - first);
    const curvatureToVariation = totalVariation > meaningfulVariation
      ? totalCurvature / totalVariation
      : 0;
    const curvatureCandidate = totalCurvature > Math.max(
      ySpan * 1e-3,
      Number.EPSILON * ySpan * 64,
      Number.MIN_VALUE * 64
    ) &&
      (largestCurvatures[0] + (largestCurvatures[1] || 0)) / totalCurvature >= 0.75 &&
      largestDelta * 4 * sampleCount / ySpan >= 2;

    if (largeMidpointDeviation) return true;
    if (concentratedJump) {
      const jumpIndex = deltas.indexOf(largestDelta);
      let leftX = xStart + (xEnd - xStart) * jumpIndex / deltas.length;
      let rightX = xStart + (xEnd - xStart) * (jumpIndex + 1) / deltas.length;
      let leftY = values[jumpIndex];
      let rightY = values[jumpIndex + 1];
      const jumpHistory = [Math.abs(rightY - leftY)];
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const middleX = (leftX + rightX) / 2;
        const middleY = evaluate(middleX);
        if (!Number.isFinite(middleY)) return true;
        const leftJump = Math.abs(middleY - leftY);
        const rightJump = Math.abs(rightY - middleY);
        if (leftJump >= rightJump) {
          rightX = middleX;
          rightY = middleY;
        } else {
          leftX = middleX;
          leftY = middleY;
        }
        jumpHistory.push(Math.abs(rightY - leftY));
      }
      const recentJumpRatios = jumpHistory.slice(-4, -1).map((value, index) =>
        jumpHistory[jumpHistory.length - 3 + index] / value);
      if (recentJumpRatios.every((value) => value >= 0.999)) return true;
    }
    if (!curvatureCandidate || curvatureToVariation < 0.1) return false;

    // Concentrated discrete curvature is only a reason to inspect more closely:
    // smooth extrema and Holder-continuous cusps can produce it as well. After
    // a bounded ternary refinement, values are probed at successively halved
    // distances. Their differences shrink for continuous extrema, stay level
    // for logarithmic poles, and grow for power poles.
    const refineExtreme = function(findMinimum: boolean): {
      unsafe: boolean; left: number; right: number;
    } {
      let left = xStart;
      let right = xEnd;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const third = (right - left) / 3;
        const firstX = left + third;
        const secondX = right - third;
        const firstY = evaluate(firstX);
        const secondY = evaluate(secondX);
        if (!Number.isFinite(firstY) || !Number.isFinite(secondY)) {
          return { unsafe: true, left, right };
        }
        const firstIsMoreExtreme = findMinimum ? firstY < secondY : firstY > secondY;
        if (firstIsMoreExtreme) right = secondX;
        else left = firstX;
      }
      return { unsafe: false, left, right };
    };

    const interiorOutside = values.slice(1, -1).some((value) =>
      value < bounds.ymin || value > bounds.ymax);
    if (interiorOutside) return true;
    const hasPersistentExtreme = function(findMinimum: boolean): boolean {
      const refined = refineExtreme(findMinimum);
      if (refined.unsafe) return true;
      const center = (refined.left + refined.right) / 2;
      const bracketWidth = refined.right - refined.left;
      const leftRoom = center - xStart;
      const rightRoom = xEnd - center;
      const direction = rightRoom >= leftRoom ? 1 : -1;
      const probeDistance = Math.min(
        bracketWidth * 4096,
        Math.max(leftRoom, rightRoom) * 0.75
      );
      if (!(probeDistance > 0)) return false;
      const probeValues = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125].map((factor) =>
        evaluate(center + direction * probeDistance * factor));
      if (probeValues.some((value) => !Number.isFinite(value))) return true;
      if (probeValues.some((value) => value < bounds.ymin || value > bounds.ymax)) return true;
      const monotoneTowardExtreme = findMinimum
        ? probeValues.every((value, index) =>
          index === 0 || probeValues[index - 1] > value)
        : probeValues.every((value, index) =>
          index === 0 || probeValues[index - 1] < value);
      if (!monotoneTowardExtreme) return false;
      const probeDeltas = probeValues.slice(1).map((value, index) =>
        Math.abs(value - probeValues[index]));
      if (probeDeltas.some((value) => value <= meaningfulVariation)) return false;
      const probeRatios = probeDeltas.slice(1).map((value, index) =>
        value / probeDeltas[index]);
      const persistentRatios = probeRatios.every((value) => value >= 0.999);
      const slowDivergence =
        probeRatios[probeRatios.length - 1] - probeRatios[0] >= 0.001;
      if (!persistentRatios && !slowDivergence) return false;

      let left = refined.left;
      let right = refined.right;
      for (let iteration = 24; iteration < 128; iteration += 1) {
        const third = (right - left) / 3;
        const firstX = left + third;
        const secondX = right - third;
        if (!(firstX > left && secondX > firstX && secondX < right)) return false;
        const firstY = evaluate(firstX);
        const secondY = evaluate(secondX);
        if (!Number.isFinite(firstY) || !Number.isFinite(secondY)) return true;
        if (firstY < bounds.ymin || firstY > bounds.ymax ||
            secondY < bounds.ymin || secondY > bounds.ymax) return true;
        const previousLeft = left;
        const previousRight = right;
        const firstIsMoreExtreme = findMinimum ? firstY < secondY : firstY > secondY;
        if (firstIsMoreExtreme) right = secondX;
        else left = firstX;
        if (left === previousLeft && right === previousRight) return false;
      }
      return false;
    };
    return hasPersistentExtreme(true) || hasPersistentExtreme(false);
  };

  let xStart = bounds.xmin;
  let yStart = evaluate(xStart);
  for (let index = 0; index < sampleCount; index += 1) {
    const xEnd = index + 1 === sampleCount
      ? bounds.xmax
      : bounds.xmin + (index + 1) * xStep;
    const xQuarter = xStart + (xEnd - xStart) / 4;
    const xMid = (xStart + xEnd) / 2;
    const xThreeQuarter = xEnd - (xEnd - xStart) / 4;
    const yQuarter = evaluate(xQuarter);
    const yMid = evaluate(xMid);
    const yThreeQuarter = evaluate(xThreeQuarter);
    const yEnd = evaluate(xEnd);
    if (likelyDiscontinuous(
      xStart,
      xEnd,
      [yStart, yQuarter, yMid, yThreeQuarter, yEnd]
    )) {
      flush();
    } else {
      appendClipped(clipSegmentToBounds(
        { x: xStart, y: yStart },
        { x: xEnd, y: yEnd },
        bounds
      ));
    }
    xStart = xEnd;
    yStart = yEnd;
  }
  flush();
  return { segments, sampleCount, evaluationCount };
}

/** Compile and sample only expressions accepted by the shared safe expression compiler. */
export function sampleStaticFunctionExpression(
  expression: unknown,
  bounds: StaticGeometryBounds,
  options: StaticFunctionSamplingOptions = {}
): StaticFunctionSamplingResult | null {
  try {
    const compiled = compileFunctionExpression(expression);
    return compiled.fn ? sampleStaticFunction(compiled.fn, bounds, options) : null;
  } catch (e) {
    return null;
  }
}
