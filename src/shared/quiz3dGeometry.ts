import {
  angleLinePlane3, angleLines3, anglePlanes3, distanceLines3, distancePointLine3,
  distancePoints3, pointOnLine3, pointOnPlane3, relationLinePlane3, relationLines3,
  relationPlanes3, type LineDefinition3D, type SpatialRelation3D,
} from './analytic3d';
import {
  createParametricCurve3D, curveArcLength3D, nearestCurveParameter3D, sampleCurve3D,
  type ParametricCurve3D,
} from './curve3d';
import { dotVector3, planeFromPointNormal, type LinearDomain3D, type Plane3 } from './plane3d';
import { polygonFromPoints3D, type Polygon3 } from './polygon3d';
import {
  createParametricSurface3D, nearestSurfaceParameters3D, type ParametricSurface3D,
} from './surface3d';
import { subtractVector3, vector3Norm, type Vector3 } from './vector3d';
import type { Circle3 } from './circle3d';
import type { ConicSection3D } from './conic3d';
import type { Solid3 } from './solid3d';
import type { Sphere3 } from './sphere3d';
import {
  DEFAULT_QUIZ_TOLERANCE_3D, emptyConstructionQuiz3DEvaluation,
  formatConstructionQuiz3DFeedback, normalizedQuizWord3D, quiz3DMessageKey,
  type CanonicalQuizObject3D, type ConstructionQuiz3DConfig,
  type ConstructionQuiz3DEvaluation, type ExpectedQuizObject3D,
  type ObjectComparison3D, type QuizCondition3D, type QuizDependency3D,
  type QuizIssue3D, type QuizObjectKind3D, type QuizObjectMatch3D,
  type QuizTolerance3D,
} from './quiz3dTypes';

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function finiteQuizVector3D(value: unknown): Vector3 | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const result: Vector3 = [
    Number(value[0]), Number(value[1]), value.length > 2 ? Number(value[2]) : 0
  ];
  return result.every(Number.isFinite) ? result : null;
}

export function scaledQuizTolerance3D(
  absolute: number, relative: number, ...values: number[]
): number {
  return Math.max(0, absolute) + Math.max(0, relative) *
    Math.max(1, ...values.map(value => Math.abs(value)).filter(Number.isFinite));
}

export function closeQuizNumber3D(
  first: number, second: number, absolute: number, relative: number
): boolean {
  return Number.isFinite(first) && Number.isFinite(second) &&
    Math.abs(first - second) <= scaledQuizTolerance3D(absolute, relative, first, second);
}

function vectorDistance(first: readonly number[], second: readonly number[]): number {
  const a = finiteQuizVector3D(first);
  const b = finiteQuizVector3D(second);
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity;
}

export function closeQuizVector3D(
  first: readonly number[], second: readonly number[], tolerance: QuizTolerance3D
): boolean {
  return vectorDistance(first, second) <= scaledQuizTolerance3D(
    tolerance.coordinate, tolerance.scalarRelative,
    vector3Norm(first), vector3Norm(second)
  );
}

export function parallelQuizDirections3D(
  first: readonly number[], second: readonly number[], tolerance: QuizTolerance3D
): boolean {
  const a = finiteQuizVector3D(first);
  const b = finiteQuizVector3D(second);
  const product = a && b ? vector3Norm(a) * vector3Norm(b) : 0;
  if (!a || !b || !(product > 0)) return false;
  return 1 - Math.min(1, Math.abs(dotVector3(a, b) / product)) <= tolerance.parallel;
}

function sameOrientation(
  first: readonly number[], second: readonly number[], tolerance: QuizTolerance3D
): boolean {
  return parallelQuizDirections3D(first, second, tolerance) && dotVector3(first, second) > 0;
}

function geometryOf(expected: ExpectedQuizObject3D): Record<string, any> {
  return expected.geometry && typeof expected.geometry === 'object' ? expected.geometry : {};
}

export function lineFromExpectedQuizObject3D(expected: ExpectedQuizObject3D): LineDefinition3D | null {
  const geometry = geometryOf(expected);
  const anchor = finiteQuizVector3D(
    geometry.anchor || geometry.point || geometry.start || geometry.first ||
    (expected.kind === 'vector3d' ? [0, 0, 0] : null)
  );
  let direction = finiteQuizVector3D(geometry.direction || geometry.components);
  const end = finiteQuizVector3D(geometry.end || geometry.second);
  if (!direction && anchor && end) direction = subtractVector3(end, anchor);
  if (!anchor || !direction || vector3Norm(direction) <= Number.EPSILON) return null;
  const domain: LinearDomain3D = expected.kind === 'line3d' ? 'line'
    : (expected.kind === 'ray3d' ? 'ray' : 'segment');
  return { anchor, direction, domain };
}

export function planeFromExpectedQuizObject3D(expected: ExpectedQuizObject3D): Plane3 | null {
  const geometry = geometryOf(expected);
  const point = finiteQuizVector3D(geometry.point || geometry.anchor || geometry.origin);
  const normal = finiteQuizVector3D(
    geometry.normal ||
    (Array.isArray(geometry.coefficients) ? geometry.coefficients.slice(0, 3) : null)
  );
  if (point && normal) return planeFromPointNormal(point, normal);
  if (Array.isArray(geometry.coefficients) && geometry.coefficients.length >= 4) {
    const coefficients = geometry.coefficients.slice(0, 4).map(Number);
    const normSquared = coefficients[0] ** 2 + coefficients[1] ** 2 + coefficients[2] ** 2;
    if (coefficients.every(Number.isFinite) && normSquared > 0) {
      return planeFromPointNormal([
        -coefficients[3] * coefficients[0] / normSquared,
        -coefficients[3] * coefficients[1] / normSquared,
        -coefficients[3] * coefficients[2] / normSquared,
      ], coefficients.slice(0, 3));
    }
  }
  return null;
}

function compareLine(
  actual: LineDefinition3D, expected: LineDefinition3D, kind: QuizObjectKind3D,
  geometry: Record<string, any>, tolerance: QuizTolerance3D
): ObjectComparison3D {
  if (!actual || !expected || vector3Norm(actual.direction) <= Number.EPSILON ||
      vector3Norm(expected.direction) <= Number.EPSILON) {
    return { matches: false, score: 0, code: 'degenerate' };
  }
  if (kind === 'segment3d') {
    const actualEnd: Vector3 = [
      actual.anchor[0] + actual.direction[0],
      actual.anchor[1] + actual.direction[1],
      actual.anchor[2] + actual.direction[2],
    ];
    const expectedEnd: Vector3 = [
      expected.anchor[0] + expected.direction[0],
      expected.anchor[1] + expected.direction[1],
      expected.anchor[2] + expected.direction[2],
    ];
    const direct = closeQuizVector3D(actual.anchor, expected.anchor, tolerance) &&
      closeQuizVector3D(actualEnd, expectedEnd, tolerance);
    const reverse = closeQuizVector3D(actual.anchor, expectedEnd, tolerance) &&
      closeQuizVector3D(actualEnd, expected.anchor, tolerance);
    return {
      matches: direct || reverse,
      score: direct || reverse ? 1 :
        (parallelQuizDirections3D(actual.direction, expected.direction, tolerance) ? 0.45 : 0),
      code: 'position-mismatch'
    };
  }
  if (kind === 'ray3d') {
    const origin = closeQuizVector3D(actual.anchor, expected.anchor, tolerance);
    const direction = sameOrientation(actual.direction, expected.direction, tolerance);
    return {
      matches: origin && direction,
      score: (Number(origin) + Number(direction)) / 2,
      code: 'position-mismatch'
    };
  }
  if (kind === 'vector3d') {
    const components = closeQuizVector3D(actual.direction, expected.direction, tolerance);
    const anchor = geometry.anchor == null && geometry.start == null ||
      closeQuizVector3D(actual.anchor, expected.anchor, tolerance);
    return {
      matches: components && anchor,
      score: (Number(components) + Number(anchor)) / 2,
      code: components ? 'position-mismatch' : 'value-mismatch'
    };
  }
  const direction = parallelQuizDirections3D(actual.direction, expected.direction, tolerance);
  const located = direction && pointOnLine3(
    expected.anchor, { ...actual, domain: 'line' }, tolerance.incidence
  );
  return {
    matches: located, score: located ? 1 : (direction ? 0.55 : 0),
    code: 'position-mismatch'
  };
}

function comparePlane(
  actual: Plane3, expected: Plane3, tolerance: QuizTolerance3D
): ObjectComparison3D {
  if (!actual || !expected) return { matches: false, score: 0, code: 'degenerate' };
  const parallel = parallelQuizDirections3D(actual.normal, expected.normal, tolerance);
  const located = parallel && pointOnPlane3(expected.point, actual, tolerance.incidence);
  return {
    matches: located, score: located ? 1 : (parallel ? 0.55 : 0),
    code: 'position-mismatch'
  };
}

function compareCircle(
  actual: Circle3, expected: Record<string, any>, tolerance: QuizTolerance3D
): ObjectComparison3D {
  const center = finiteQuizVector3D(expected.center || expected.point);
  const normal = finiteQuizVector3D(expected.normal);
  const radius = finiteNumber(expected.radius);
  if (!actual || !center || !normal || radius == null || radius <= 0) {
    return { matches: false, score: 0, code: 'degenerate' };
  }
  const sameCenter = closeQuizVector3D(actual.center, center, tolerance);
  const sameNormal = parallelQuizDirections3D(actual.normal, normal, tolerance);
  const sameRadius = closeQuizNumber3D(
    actual.radius, radius, tolerance.scalarAbsolute, tolerance.scalarRelative
  );
  return {
    matches: sameCenter && sameNormal && sameRadius,
    score: (Number(sameCenter) + Number(sameNormal) + Number(sameRadius)) / 3,
    code: sameCenter && sameNormal ? 'size-mismatch' : 'position-mismatch'
  };
}

function compareSphere(
  actual: Sphere3, expected: Record<string, any>, tolerance: QuizTolerance3D
): ObjectComparison3D {
  const center = finiteQuizVector3D(expected.center || expected.point);
  const radius = finiteNumber(expected.radius);
  if (!actual || !center || radius == null || radius <= 0) {
    return { matches: false, score: 0, code: 'degenerate' };
  }
  const sameCenter = closeQuizVector3D(actual.center, center, tolerance);
  const sameRadius = closeQuizNumber3D(
    actual.radius, radius, tolerance.scalarAbsolute, tolerance.scalarRelative
  );
  return {
    matches: sameCenter && sameRadius,
    score: (Number(sameCenter) + Number(sameRadius)) / 2,
    code: sameCenter ? 'size-mismatch' : 'position-mismatch'
  };
}

function cyclicVerticesMatch(
  actual: readonly Vector3[], expected: readonly Vector3[],
  tolerance: QuizTolerance3D, orientationRelevant: boolean
): boolean {
  if (actual.length !== expected.length || !actual.length) return false;
  for (let start = 0; start < actual.length; start += 1) {
    let forward = true;
    let reverse = !orientationRelevant;
    for (let index = 0; index < actual.length; index += 1) {
      forward = forward && closeQuizVector3D(
        actual[(start + index) % actual.length], expected[index], tolerance
      );
      reverse = reverse && closeQuizVector3D(
        actual[(start - index + actual.length) % actual.length], expected[index], tolerance
      );
    }
    if (forward || reverse) return true;
  }
  return false;
}

function uniquePointSetMatch(
  actual: readonly Vector3[], expected: readonly Vector3[], tolerance: QuizTolerance3D
): boolean {
  if (actual.length !== expected.length) return false;
  const assigned = new Array<number>(actual.length).fill(-1);
  const assign = (expectedIndex: number, seen: boolean[]): boolean => {
    for (let index = 0; index < actual.length; index += 1) {
      if (seen[index] || !closeQuizVector3D(
        actual[index], expected[expectedIndex], tolerance
      )) continue;
      seen[index] = true;
      if (assigned[index] < 0 || assign(assigned[index], seen)) {
        assigned[index] = expectedIndex;
        return true;
      }
    }
    return false;
  };
  return expected.every((_, index) => assign(index, new Array(actual.length).fill(false)));
}

function comparePolygon(
  actual: Polygon3, expected: Record<string, any>, tolerance: QuizTolerance3D,
  orientationRelevant: boolean
): ObjectComparison3D {
  const vertices = Array.isArray(expected.vertices)
    ? expected.vertices.map(finiteQuizVector3D) : [];
  if (!actual || vertices.length < 3 || vertices.some(value => !value)) {
    return { matches: false, score: 0, code: 'degenerate' };
  }
  const wanted = vertices as Vector3[];
  const polygon = polygonFromPoints3D(wanted);
  if (!polygon) return { matches: false, score: 0, code: 'degenerate' };
  const sameVertices = cyclicVerticesMatch(
    actual.vertices, wanted, tolerance, orientationRelevant
  );
  const sameArea = closeQuizNumber3D(
    actual.area, polygon.area, tolerance.scalarAbsolute, tolerance.scalarRelative
  );
  const samePerimeter = closeQuizNumber3D(
    actual.perimeter, polygon.perimeter,
    tolerance.scalarAbsolute, tolerance.scalarRelative
  );
  return {
    matches: sameVertices,
    score: sameVertices ? 1 : (Number(sameArea) + Number(samePerimeter)) * 0.3,
    code: sameArea && samePerimeter ? 'position-mismatch' : 'size-mismatch'
  };
}

function compareSolid(
  actual: Solid3, expected: Record<string, any>, tolerance: QuizTolerance3D
): ObjectComparison3D {
  if (!actual) return { matches: false, score: 0, code: 'undefined' };
  const wantedKind = normalizedQuizWord3D(
    expected.solidKind || expected.definition || expected.kind
  );
  if (wantedKind && normalizedQuizWord3D(actual.kind) !== wantedKind) {
    return { matches: false, score: 0, code: 'wrong-type' };
  }
  if (actual.kind === 'cylinder' || actual.kind === 'cone') {
    const first = finiteQuizVector3D(expected.baseCenter || expected.center);
    const second = finiteQuizVector3D(
      actual.kind === 'cylinder'
        ? (expected.topCenter || expected.end)
        : (expected.apex || expected.end)
    );
    const radius = finiteNumber(expected.radius);
    const points = (!first || closeQuizVector3D(actual.baseCenter, first, tolerance)) &&
      (!second || closeQuizVector3D(
        actual.kind === 'cylinder' ? actual.topCenter : actual.apex,
        second, tolerance
      ));
    const size = (radius == null || closeQuizNumber3D(
      actual.radius, radius, tolerance.scalarAbsolute, tolerance.scalarRelative
    )) && (expected.volume == null || closeQuizNumber3D(
      actual.volume, Number(expected.volume),
      tolerance.scalarAbsolute, tolerance.scalarRelative
    )) && (expected.surfaceArea == null || closeQuizNumber3D(
      actual.surfaceArea, Number(expected.surfaceArea),
      tolerance.scalarAbsolute, tolerance.scalarRelative
    ));
    return {
      matches: points && size, score: (Number(points) + Number(size)) / 2,
      code: points ? 'size-mismatch' : 'position-mismatch'
    };
  }
  const vertices = Array.isArray(expected.vertices)
    ? expected.vertices.map(finiteQuizVector3D) : [];
  const points = vertices.length
    ? !vertices.some(value => !value) &&
      uniquePointSetMatch(actual.vertices, vertices as Vector3[], tolerance)
    : true;
  const metrics = (expected.volume == null || closeQuizNumber3D(
    actual.volume, Number(expected.volume),
    tolerance.scalarAbsolute, tolerance.scalarRelative
  )) && (expected.surfaceArea == null || closeQuizNumber3D(
    actual.surfaceArea, Number(expected.surfaceArea),
    tolerance.scalarAbsolute, tolerance.scalarRelative
  ));
  return {
    matches: points && metrics, score: (Number(points) + Number(metrics)) / 2,
    code: points ? 'size-mismatch' : 'position-mismatch'
  };
}

function curveFromExpected(expected: Record<string, any>): ParametricCurve3D | null {
  if (expected.curve && typeof expected.curve.evaluate === 'function') {
    return expected.curve as ParametricCurve3D;
  }
  const range = expected.range || expected.parameterRange;
  return Array.isArray(expected.expressions) && Array.isArray(range)
    ? createParametricCurve3D(expected.expressions, range, {
        parameter: expected.parameter,
        quality: Math.min(128, Number(expected.quality) || 64),
      })
    : null;
}

function curvePoints(curve: ParametricCurve3D): Vector3[] {
  return sampleCurve3D(curve, {
    quality: 28, maxPoints: 144, maxDepth: 5,
  }).flat().map(sample => sample.point);
}

function directedCurveDistance(points: readonly Vector3[], curve: ParametricCurve3D): number {
  let maximum = 0;
  for (const point of points) {
    const parameter = nearestCurveParameter3D(curve, point, 48);
    const nearest = curve.evaluate(parameter);
    if (!nearest) return Infinity;
    maximum = Math.max(maximum, vectorDistance(point, nearest));
  }
  return maximum;
}

function compareCurve(
  actual: ParametricCurve3D, expectedValue: Record<string, any>,
  tolerance: QuizTolerance3D, parameterizationRelevant: boolean
): ObjectComparison3D {
  const expected = curveFromExpected(expectedValue);
  if (!actual || !expected) return { matches: false, score: 0, code: 'undefined' };
  if (parameterizationRelevant) {
    const expressions = actual.expressions.map(normalizedQuizWord3D).join('|') ===
      expected.expressions.map(normalizedQuizWord3D).join('|');
    const range = closeQuizNumber3D(
      actual.range[0], expected.range[0],
      tolerance.scalarAbsolute, tolerance.scalarRelative
    ) && closeQuizNumber3D(
      actual.range[1], expected.range[1],
      tolerance.scalarAbsolute, tolerance.scalarRelative
    );
    return {
      matches: expressions && range,
      score: (Number(expressions) + Number(range)) / 2,
      code: 'value-mismatch'
    };
  }
  const actualPoints = curvePoints(actual);
  const expectedPoints = curvePoints(expected);
  if (actualPoints.length < 2 || expectedPoints.length < 2) {
    return { matches: false, score: 0, code: 'undefined' };
  }
  const distance = Math.max(
    directedCurveDistance(actualPoints, expected),
    directedCurveDistance(expectedPoints, actual)
  );
  const allowed = scaledQuizTolerance3D(
    tolerance.curve, tolerance.scalarRelative,
    Math.max(1, ...actualPoints.map(vector3Norm), ...expectedPoints.map(vector3Norm))
  );
  return {
    matches: distance <= allowed,
    score: Number.isFinite(distance)
      ? Math.max(0, 1 - distance / Math.max(allowed * 4, Number.EPSILON)) : 0,
    code: 'position-mismatch',
    details: { distance, allowed }
  };
}

function surfaceFromExpected(expected: Record<string, any>): ParametricSurface3D | null {
  if (expected.surface && typeof expected.surface.evaluate === 'function') {
    return expected.surface as ParametricSurface3D;
  }
  return Array.isArray(expected.expressions) &&
    Array.isArray(expected.uRange) && Array.isArray(expected.vRange)
    ? createParametricSurface3D(
        expected.expressions, expected.uRange, expected.vRange,
        { parameters: expected.parameters, quality: [12, 12] }
      )
    : null;
}

function surfacePoints(surface: ParametricSurface3D): Vector3[] {
  const points: Vector3[] = [];
  for (let ui = 0; ui <= 6; ui += 1) {
    for (let vi = 0; vi <= 6; vi += 1) {
      const u = surface.uRange[0] +
        (surface.uRange[1] - surface.uRange[0]) * ui / 6;
      const v = surface.vRange[0] +
        (surface.vRange[1] - surface.vRange[0]) * vi / 6;
      const point = surface.evaluate(u, v);
      if (point) points.push(point);
    }
  }
  return points;
}

function directedSurfaceDistance(
  points: readonly Vector3[], surface: ParametricSurface3D
): number {
  let maximum = 0;
  for (const point of points) {
    const nearest = nearestSurfaceParameters3D(surface, point, 12);
    if (!nearest) return Infinity;
    maximum = Math.max(maximum, nearest.distance);
  }
  return maximum;
}

function compareSurface(
  actual: ParametricSurface3D, expectedValue: Record<string, any>,
  tolerance: QuizTolerance3D, parameterizationRelevant: boolean
): ObjectComparison3D {
  const expected = surfaceFromExpected(expectedValue);
  if (!actual || !expected) return { matches: false, score: 0, code: 'undefined' };
  if (parameterizationRelevant) {
    const expressions = actual.expressions.map(normalizedQuizWord3D).join('|') ===
      expected.expressions.map(normalizedQuizWord3D).join('|');
    const ranges = closeQuizNumber3D(
      actual.uRange[0], expected.uRange[0],
      tolerance.scalarAbsolute, tolerance.scalarRelative
    ) && closeQuizNumber3D(
      actual.uRange[1], expected.uRange[1],
      tolerance.scalarAbsolute, tolerance.scalarRelative
    ) && closeQuizNumber3D(
      actual.vRange[0], expected.vRange[0],
      tolerance.scalarAbsolute, tolerance.scalarRelative
    ) && closeQuizNumber3D(
      actual.vRange[1], expected.vRange[1],
      tolerance.scalarAbsolute, tolerance.scalarRelative
    );
    return {
      matches: expressions && ranges,
      score: (Number(expressions) + Number(ranges)) / 2,
      code: 'value-mismatch'
    };
  }
  const actualPoints = surfacePoints(actual);
  const expectedPoints = surfacePoints(expected);
  if (actualPoints.length < 4 || expectedPoints.length < 4) {
    return { matches: false, score: 0, code: 'undefined' };
  }
  const distance = Math.max(
    directedSurfaceDistance(actualPoints, expected),
    directedSurfaceDistance(expectedPoints, actual)
  );
  const allowed = scaledQuizTolerance3D(
    tolerance.surface, tolerance.scalarRelative,
    Math.max(1, ...actualPoints.map(vector3Norm), ...expectedPoints.map(vector3Norm))
  );
  return {
    matches: distance <= allowed,
    score: Number.isFinite(distance)
      ? Math.max(0, 1 - distance / Math.max(allowed * 4, Number.EPSILON)) : 0,
    code: 'position-mismatch',
    details: { distance, allowed }
  };
}

function compareConic(
  actual: ConicSection3D, expected: Record<string, any>, tolerance: QuizTolerance3D
): ObjectComparison3D {
  if (!actual) return { matches: false, score: 0, code: 'undefined' };
  const wantedKind = normalizedQuizWord3D(
    expected.conicKind || expected.classification || expected.kind
  );
  const kind = !wantedKind || normalizedQuizWord3D(actual.conicKind) === wantedKind;
  let plane = true;
  if (expected.plane && typeof expected.plane === 'object') {
    const wantedPlane = planeFromExpectedQuizObject3D({
      kind: 'plane3d', geometry: expected.plane
    });
    plane = !!wantedPlane && comparePlane(actual.plane, wantedPlane, tolerance).matches;
  }
  const sourceKind = !expected.sourceKind ||
    normalizedQuizWord3D(actual.sourceKind) === normalizedQuizWord3D(expected.sourceKind);
  let center = true;
  const wantedCenter = finiteQuizVector3D(expected.center);
  if (wantedCenter) {
    const localCenter = actual.canonical.center;
    if (!localCenter) center = false;
    else {
      const rotation = actual.canonical.rotation;
      const local: [number, number] = [
        rotation[0][0] * localCenter[0] + rotation[1][0] * localCenter[1],
        rotation[0][1] * localCenter[0] + rotation[1][1] * localCenter[1],
      ];
      const world: Vector3 = [
        actual.origin[0] + actual.direction1[0] * local[0] + actual.direction2[0] * local[1],
        actual.origin[1] + actual.direction1[1] * local[0] + actual.direction2[1] * local[1],
        actual.origin[2] + actual.direction1[2] * local[0] + actual.direction2[2] * local[1],
      ];
      center = closeQuizVector3D(world, wantedCenter, tolerance);
    }
  }  const branchCount = finiteNumber(expected.branches);
  const branches = branchCount == null || actual.branches.length === branchCount;
  let radii = true;
  if (Array.isArray(expected.radii) && Array.isArray(actual.canonical.radii)) {
    const a = actual.canonical.radii.slice().sort((x, y) => x - y);
    const b = expected.radii.map(Number).sort((x: number, y: number) => x - y);
    radii = b.length === 2 &&
      closeQuizNumber3D(a[0], b[0], tolerance.scalarAbsolute, tolerance.scalarRelative) &&
      closeQuizNumber3D(a[1], b[1], tolerance.scalarAbsolute, tolerance.scalarRelative);
  }
  return {
    matches: kind && sourceKind && plane && center && branches && radii,
    score: (Number(kind) + Number(sourceKind) + Number(plane) + Number(center) + Number(branches) + Number(radii)) / 6,
    code: kind ? (plane ? 'size-mismatch' : 'position-mismatch') : 'wrong-type'
  };
}

function arraysEqual(first: unknown, second: unknown, ordered: boolean): boolean {
  const a = Array.isArray(first) ? first.map(String) : [];
  const b = Array.isArray(second) ? second.map(String) : [];
  if (a.length !== b.length) return false;
  if (ordered) return a.every((value, index) => value === b[index]);
  const aa = a.slice().sort();
  const bb = b.slice().sort();
  return aa.every((value, index) => value === bb[index]);
}

function dependencyValueMatches3D(
  actual: unknown, expected: unknown, tolerance: QuizTolerance3D
): boolean {
  if (typeof expected === 'number') {
    return typeof actual === 'number' && closeQuizNumber3D(
      actual, expected, tolerance.scalarAbsolute, tolerance.scalarRelative
    );
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length &&
      expected.every((value, index) =>
        dependencyValueMatches3D(actual[index], value, tolerance)
      );
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      dependencyValueMatches3D((actual as Record<string, unknown>)[key], value, tolerance)
    );
  }
  if (typeof expected === 'string') {
    return normalizedQuizWord3D(actual) === normalizedQuizWord3D(expected);
  }
  return actual === expected;
}
export function dependenciesMatch3D(
  actual: QuizDependency3D | undefined, expected: QuizDependency3D | undefined,
  ordered = false, tolerance: QuizTolerance3D = DEFAULT_QUIZ_TOLERANCE_3D
): boolean {
  if (!expected) return true;
  if (!actual) return false;
  if (expected.definition != null &&
      normalizedQuizWord3D(actual.definition) !== normalizedQuizWord3D(expected.definition)) {
    return false;
  }
  if (expected.transformation != null &&
      normalizedQuizWord3D(actual.transformation) !==
      normalizedQuizWord3D(expected.transformation)) return false;
  if (expected.dependent != null &&
      Boolean(actual.dependent) !== Boolean(expected.dependent)) return false;
  if (expected.boundTo != null && String(actual.boundTo || '') !== String(expected.boundTo)) {
    return false;
  }
  if (expected.bindingKind != null &&
      normalizedQuizWord3D(actual.bindingKind) !==
      normalizedQuizWord3D(expected.bindingKind)) return false;
  if (expected.tracePointId != null &&
      String(actual.tracePointId || '') !== String(expected.tracePointId)) return false;
  if (expected.sourceIds && !arraysEqual(actual.sourceIds, expected.sourceIds, ordered)) {
    return false;
  }
  if (expected.referenceIds &&
      !arraysEqual(actual.referenceIds, expected.referenceIds, ordered)) return false;
  if (expected.driverIds && !arraysEqual(actual.driverIds, expected.driverIds, ordered)) {
    return false;
  }
  if (expected.parameters && !dependencyValueMatches3D(
    actual.parameters, expected.parameters, tolerance
  )) return false;
  return true;
}

export function compareQuizObjects3D(
  actual: CanonicalQuizObject3D, expected: ExpectedQuizObject3D,
  config: ConstructionQuiz3DConfig
): ObjectComparison3D {
  if (!actual || actual.kind !== expected.kind) {
    return { matches: false, score: 0, code: 'wrong-type' };
  }
  if (config.namesRelevant && expected.name != null &&
      String(actual.name || '') !== String(expected.name)) {
    return { matches: false, score: 0.1, code: 'value-mismatch' };
  }
  const geometry = geometryOf(expected);
  let result: ObjectComparison3D;
  if (expected.kind === 'point3d') {
    const actualPoint = finiteQuizVector3D(
      actual.geometry.coordinates || actual.geometry.point
    );
    const wanted = finiteQuizVector3D(geometry.coordinates || geometry.point);
    const matches = !!actualPoint && !!wanted &&
      closeQuizVector3D(actualPoint, wanted, config.tolerance);
    result = {
      matches, score: matches ? 1 : 0,
      code: actualPoint && wanted ? 'position-mismatch' : 'degenerate'
    };
  } else if (['vector3d', 'segment3d', 'line3d', 'ray3d'].includes(expected.kind)) {
    const wanted = lineFromExpectedQuizObject3D(expected);
    result = actual.geometry.line && wanted
      ? compareLine(actual.geometry.line, wanted, expected.kind, geometry, config.tolerance)
      : { matches: false, score: 0, code: 'degenerate' };
  } else if (expected.kind === 'plane3d') {
    const wanted = planeFromExpectedQuizObject3D(expected);
    result = actual.geometry.plane && wanted
      ? comparePlane(actual.geometry.plane, wanted, config.tolerance)
      : { matches: false, score: 0, code: 'degenerate' };
  } else if (expected.kind === 'circle3d') {
    result = compareCircle(actual.geometry.circle, geometry, config.tolerance);
  } else if (expected.kind === 'sphere3d') {
    result = compareSphere(actual.geometry.sphere, geometry, config.tolerance);
  } else if (expected.kind === 'polygon3d') {
    result = comparePolygon(
      actual.geometry.polygon, geometry, config.tolerance, !!expected.orientationRelevant
    );
  } else if (expected.kind === 'solid3d') {
    result = compareSolid(actual.geometry.solid, geometry, config.tolerance);
  } else if (expected.kind === 'curve3d') {
    result = compareCurve(
      actual.geometry.curve, geometry, config.tolerance, !!expected.parameterizationRelevant
    );
  } else if (expected.kind === 'surface3d') {
    result = compareSurface(
      actual.geometry.surface, geometry, config.tolerance,
      !!expected.parameterizationRelevant
    );
  } else if (expected.kind === 'conic3d') {
    result = compareConic(actual.geometry.conic, geometry, config.tolerance);
  } else {
    const actualValue = finiteNumber(actual.geometry.value);
    const wanted = finiteNumber(geometry.value);
    const value = actualValue != null && wanted != null && closeQuizNumber3D(
      actualValue, wanted, config.tolerance.scalarAbsolute, config.tolerance.scalarRelative
    );
    const unit = !geometry.unit ||
      normalizedQuizWord3D(actual.geometry.unit) === normalizedQuizWord3D(geometry.unit);
    result = {
      matches: value && unit, score: (Number(value) + Number(unit)) / 2,
      code: actualValue == null || wanted == null ? 'undefined' : 'value-mismatch'
    };
  }
  if (result.matches && config.visibilityRelevant && expected.visible != null &&
      Boolean(actual.visible) !== Boolean(expected.visible)) {
    return { matches: false, score: 0.9, code: 'value-mismatch' };
  }
  if (result.matches && config.fixedRelevant && expected.fixed != null &&
      Boolean(actual.fixed) !== Boolean(expected.fixed)) {
    return { matches: false, score: 0.9, code: 'value-mismatch' };
  }
  if (result.matches && config.formattingRelevant && expected.style &&
      !dependencyValueMatches3D(actual.style, expected.style, config.tolerance)) {
    return { matches: false, score: 0.9, code: 'value-mismatch' };
  }
  if (result.matches && config.mode === 'construction') {
    const requiredDependencies = [
      ...(expected.dependency ? [expected.dependency] : []),
      ...(expected.dependencyAlternatives || []),
    ];
    if (requiredDependencies.length && !requiredDependencies.some(dependency =>
      dependenciesMatch3D(
        actual.dependency, dependency, config.orderRelevant, config.tolerance
      )
    )) {
      return { matches: false, score: 0.8, code: 'dependency-mismatch' };
    }
  }
  return result;
}

function objectPoint(object: CanonicalQuizObject3D | undefined): Vector3 | null {
  return object ? finiteQuizVector3D(
    object.geometry.coordinates || object.geometry.point
  ) : null;
}

function normalizedQuizRelation3D(value: unknown): string {
  const word = normalizedQuizWord3D(value);
  const aliases: Record<string, string> = {
    identisch: 'identical', gleich: 'identical',
    parallel: 'parallel', echtparallel: 'strictlyparallel', strictlyparallel: 'strictlyparallel',
    schneidend: 'intersecting', schnitt: 'intersecting', intersecting: 'intersecting',
    windschief: 'skew', skew: 'skew',
    senkrecht: 'orthogonal', orthogonal: 'orthogonal',
    enthalten: 'contained', liegtinebene: 'contained', contained: 'contained',
    nichtenthalten: 'notcontained', notcontained: 'notcontained',
    ungueltig: 'invalid', invalid: 'invalid',
  };
  return aliases[word] || word;
}
function relationBetween(
  first: CanonicalQuizObject3D, second: CanonicalQuizObject3D
): SpatialRelation3D | null {
  const aLine = first.geometry.line as LineDefinition3D | undefined;
  const bLine = second.geometry.line as LineDefinition3D | undefined;
  const aPlane = first.geometry.plane as Plane3 | undefined;
  const bPlane = second.geometry.plane as Plane3 | undefined;
  if (aLine && bLine) return relationLines3(aLine, bLine);
  if (aLine && bPlane) return relationLinePlane3(aLine, bPlane);
  if (aPlane && bLine) return relationLinePlane3(bLine, aPlane);
  if (aPlane && bPlane) return relationPlanes3(aPlane, bPlane);
  return null;
}

function distanceBetween(
  first: CanonicalQuizObject3D, second: CanonicalQuizObject3D
): number {
  const aPoint = objectPoint(first);
  const bPoint = objectPoint(second);
  const aLine = first.geometry.line as LineDefinition3D | undefined;
  const bLine = second.geometry.line as LineDefinition3D | undefined;
  const aPlane = first.geometry.plane as Plane3 | undefined;
  const bPlane = second.geometry.plane as Plane3 | undefined;
  if (aPoint && bPoint) return distancePoints3(aPoint, bPoint);
  if (aPoint && bLine) return distancePointLine3(aPoint, bLine);
  if (bPoint && aLine) return distancePointLine3(bPoint, aLine);
  if (aLine && bLine) return distanceLines3(aLine, bLine);
  if (aPoint && bPlane) {
    return Math.abs(dotVector3(subtractVector3(aPoint, bPlane.point) || [], bPlane.normal));
  }
  if (bPoint && aPlane) {
    return Math.abs(dotVector3(subtractVector3(bPoint, aPlane.point) || [], aPlane.normal));
  }
  if (aPlane && bPlane && parallelQuizDirections3D(
    aPlane.normal, bPlane.normal, DEFAULT_QUIZ_TOLERANCE_3D
  )) {
    return Math.abs(dotVector3(
      subtractVector3(bPlane.point, aPlane.point) || [], aPlane.normal
    ));
  }
  return NaN;
}

function angleBetween(
  first: CanonicalQuizObject3D, second: CanonicalQuizObject3D
): number {
  const aLine = first.geometry.line as LineDefinition3D | undefined;
  const bLine = second.geometry.line as LineDefinition3D | undefined;
  const aPlane = first.geometry.plane as Plane3 | undefined;
  const bPlane = second.geometry.plane as Plane3 | undefined;
  if (aLine && bLine) return angleLines3(aLine, bLine);
  if (aLine && bPlane) return angleLinePlane3(aLine, bPlane);
  if (aPlane && bLine) return angleLinePlane3(bLine, aPlane);
  if (aPlane && bPlane) return anglePlanes3(aPlane, bPlane);
  return NaN;
}

function measurementOf(object: CanonicalQuizObject3D, name: string): number {
  const key = normalizedQuizWord3D(name);
  const geometry = object.geometry;
  if (key === 'value' || key === 'wert') return Number(geometry.value);
  if (key === 'radius') return Number(
    geometry.circle?.radius ?? geometry.sphere?.radius ?? geometry.solid?.radius
  );
  if (key === 'area' || key === 'flaeche') {
    if (geometry.polygon) return Number(geometry.polygon.area);
    if (geometry.circle) return Math.PI * Number(geometry.circle.radius) ** 2;
  }
  if (key === 'perimeter' || key === 'umfang') {
    if (geometry.polygon) return Number(geometry.polygon.perimeter);
    if (geometry.circle) return 2 * Math.PI * Number(geometry.circle.radius);
  }
  if (key === 'volume' || key === 'volumen') return Number(geometry.solid?.volume);
  if (key === 'surfacearea' || key === 'oberflaeche') {
    return Number(geometry.solid?.surfaceArea);
  }
  if (key === 'length' || key === 'laenge' ||
      key === 'magnitude' || key === 'betrag') {
    if (geometry.line?.direction) return vector3Norm(geometry.line.direction);
    if (geometry.curve) return curveArcLength3D(geometry.curve);
  }
  if (key === 'arclength' || key === 'bogenlaenge') {
    return geometry.curve ? curveArcLength3D(geometry.curve) : NaN;
  }
  return NaN;
}

export function evaluateQuizCondition3D(
  condition: QuizCondition3D, objects: Map<string, CanonicalQuizObject3D>,
  tolerance: QuizTolerance3D
): boolean {
  const values = condition.objects.map(id => objects.get(id))
    .filter(Boolean) as CanonicalQuizObject3D[];
  if (values.length !== condition.objects.length) return false;
  const first = values[0];
  const second = values[1];
  if (condition.kind === 'incidence') {
    const firstPoint = objectPoint(first);
    const secondPoint = objectPoint(second);
    const point = firstPoint || secondPoint;
    const target = firstPoint ? second : first;
    if (!point || !target) return false;
    if (target.geometry.line) {
      return pointOnLine3(
        point, target.geometry.line, condition.tolerance ?? tolerance.incidence
      );
    }
    if (target.geometry.plane) {
      return pointOnPlane3(
        point, target.geometry.plane, condition.tolerance ?? tolerance.incidence
      );
    }
    return false;
  }
  if (condition.kind === 'parallel') {
    const firstLine = first.geometry.line;
    const secondLine = second.geometry.line;
    const firstPlane = first.geometry.plane;
    const secondPlane = second.geometry.plane;
    if (firstLine && secondPlane || secondLine && firstPlane) {
      const direction = firstLine?.direction || secondLine?.direction;
      const normal = firstPlane?.normal || secondPlane?.normal;
      const denominator = vector3Norm(direction || []) * vector3Norm(normal || []);
      return denominator > Number.EPSILON &&
        Math.abs(dotVector3(direction || [], normal || [])) / denominator <=
          (condition.tolerance ?? tolerance.parallel);
    }
    const a = firstLine?.direction || firstPlane?.normal;
    const b = secondLine?.direction || secondPlane?.normal;
    return !!a && !!b && parallelQuizDirections3D(a, b, tolerance);
  }
  if (condition.kind === 'orthogonal') {
    const angle = angleBetween(first, second);
    return Number.isFinite(angle) &&
      Math.abs(angle - Math.PI / 2) <= (condition.tolerance ?? tolerance.angle);
  }
  if (condition.kind === 'relation') {
    const relation = relationBetween(first, second);
    if (!relation) return false;
    const actualRelation = normalizedQuizRelation3D(relation);
    const wantedRelation = normalizedQuizRelation3D(condition.relation);
    return wantedRelation === 'parallel'
      ? actualRelation === 'strictlyparallel' || actualRelation === 'identical'
      : actualRelation === wantedRelation;
  }
  if (condition.kind === 'distance') {
    return condition.value != null && closeQuizNumber3D(
      distanceBetween(first, second), condition.value,
      condition.tolerance ?? tolerance.scalarAbsolute, tolerance.scalarRelative
    );
  }
  if (condition.kind === 'angle') {
    let target = Number(condition.value);
    if (condition.unit !== 'rad') target *= Math.PI / 180;
    return Number.isFinite(target) &&
      Math.abs(angleBetween(first, second) - target) <=
        (condition.tolerance ?? tolerance.angle);
  }
  return condition.value != null && closeQuizNumber3D(
    measurementOf(first, String(condition.measurement || 'value')),
    condition.value, condition.tolerance ?? tolerance.scalarAbsolute,
    tolerance.scalarRelative
  );
}

export function evaluateConstructionQuiz3D(
  actualObjects: readonly CanonicalQuizObject3D[],
  config: ConstructionQuiz3DConfig, language = 'de'
): ConstructionQuiz3DEvaluation {
  const lang: 'de' | 'en' =
    normalizedQuizWord3D(language).startsWith('de') ? 'de' : 'en';
  if (!config.valid) {
    return emptyConstructionQuiz3DEvaluation(
      'invalid-config', lang, { errors: config.errors.slice() }
    );
  }
  const candidates = actualObjects.filter(object =>
    !object.auxiliary && (config.includeAuthored || !object.authored)
  );
  const comparisons = config.expected.map(expected =>
    candidates.map(actual => compareQuizObjects3D(actual, expected, config))
  );
  const candidateLists = comparisons.map(row => row
    .map((comparison, actualIndex) => ({ comparison, actualIndex }))
    .filter(item => item.comparison.matches)
    .sort((a, b) => b.comparison.score - a.comparison.score)
  );
  const order = config.expected.map((_, index) => index)
    .sort((a, b) => candidateLists[a].length - candidateLists[b].length);
  const assignedActual = new Array<number>(candidates.length).fill(-1);
  const assign = (expectedIndex: number, seen: boolean[]): boolean => {
    for (const item of candidateLists[expectedIndex]) {
      if (seen[item.actualIndex]) continue;
      seen[item.actualIndex] = true;
      if (assignedActual[item.actualIndex] < 0 ||
          assign(assignedActual[item.actualIndex], seen)) {
        assignedActual[item.actualIndex] = expectedIndex;
        return true;
      }
    }
    return false;
  };
  order.forEach(index => assign(index, new Array(candidates.length).fill(false)));
  const expectedToActual = new Array<number>(config.expected.length).fill(-1);
  assignedActual.forEach((expectedIndex, actualIndex) => {
    if (expectedIndex >= 0) expectedToActual[expectedIndex] = actualIndex;
  });

  const matches: QuizObjectMatch3D[] = [];
  const issues: QuizIssue3D[] = [];
  const mapped = new Map<string, CanonicalQuizObject3D>();
  let totalWeight = 0;
  let passedWeight = 0;

  config.expected.forEach((expected, expectedIndex) => {
    const weight = Number(expected.weight) || 1;
    if (expected.required !== false) totalWeight += weight;
    const actualIndex = expectedToActual[expectedIndex];
    if (actualIndex >= 0) {
      const actual = candidates[actualIndex];
      matches.push({
        expected, actual, score: comparisons[expectedIndex][actualIndex].score
      });
      mapped.set(String(expected.id), actual);
      if (expected.required !== false) passedWeight += weight;
      return;
    }
    if (expected.required === false) return;
    const nearest = candidates.map((actual, index) => ({
      actual, comparison: comparisons[expectedIndex][index]
    })).filter(item => item.actual.kind === expected.kind)
      .sort((a, b) => b.comparison.score - a.comparison.score)[0];
    const code = nearest
      ? (nearest.comparison.matches ? 'missing-object' : nearest.comparison.code)
      : (candidates.length ? 'wrong-type' : 'missing-object');
    if (nearest && !nearest.comparison.matches) {
      passedWeight += weight * Math.max(0, Math.min(0.9, nearest.comparison.score));
    }
    issues.push({
      code, expectedId: expected.id, actualKey: nearest?.actual.key,
      messageKey: quiz3DMessageKey(code), details: nearest?.comparison.details
    });
  });

  config.conditions.forEach(condition => {
    const weight = Number(condition.weight) || 1;
    totalWeight += weight;
    if (evaluateQuizCondition3D(condition, mapped, config.tolerance)) {
      passedWeight += weight;
    } else {
      issues.push({
        code: 'condition-mismatch', expectedId: condition.id,
        messageKey: 'conditionMismatch'
      });
    }
  });

  if (config.forbidExtra) {
    const used = new Set(matches.map(match => match.actual));
    const usedComponentKeys = new Set(matches.flatMap(match =>
      Array.isArray(match.actual.geometry?.componentKeys)
        ? match.actual.geometry.componentKeys.map(String)
        : []
    ));
    const extras = candidates.filter(candidate => !used.has(candidate) &&
      !usedComponentKeys.has(candidate.key)).concat(
      config.allowAuxiliary ? [] : actualObjects.filter(object =>
        object.auxiliary && (config.includeAuthored || !object.authored)
      )
    );
    if (extras.length) {
      issues.push({
        code: 'extra-object', actualKey: extras[0].key,
        messageKey: 'extraObject', details: { count: extras.length }
      });
    }
  }

  const correct = issues.length === 0;
  const score = totalWeight > 0
    ? Math.max(0, Math.min(1, passedWeight / totalWeight)) : Number(correct);
  const status: ConstructionQuiz3DEvaluation['status'] = correct
    ? 'correct' : (score > 0 ? 'partial' : 'incorrect');
  const code = correct ? 'correct' :
    (issues[0]?.code || (status === 'partial' ? 'partial' : 'missing-object'));
  const result: ConstructionQuiz3DEvaluation = {
    correct, status, code, score, passedWeight, totalWeight,
    matches, issues, message: '', language: lang
  };
  result.message = formatConstructionQuiz3DFeedback(result, lang);
  return result;
}
