// Shared polygon coordinate access, validation, and metric helpers.
//
// Construction, metric, and combined quizzes all receive JSXGraph polygon
// objects. Keeping the numeric primitives here prevents the individual quiz
// families from developing subtly different closing-vertex and degeneracy
// rules.

export type PolygonCoordinate = {
  x: number;
  y: number;
};

export type PolygonValidationIssue =
  | 'too-few-corners'
  | 'invalid-coordinate'
  | 'duplicate-corner'
  | 'zero-length-side'
  | 'collinear-corner'
  | 'self-intersection'
  | 'near-zero-area';

export type PolygonGeometryAnalysis = {
  valid: boolean;
  issue: PolygonValidationIssue | null;
  coordinates: PolygonCoordinate[];
  signedDoubleArea: number;
  area: number;
  perimeter: number;
  scale: number;
  sideLengths: number[];
  interiorAngles: number[];
};

export const DEFAULT_LENGTH_TOLERANCE = 0.05;
export const DEFAULT_ANGLE_TOLERANCE = 1;
export const GEOMETRY_EPSILON = 1e-10;

/** Read finite polygon coordinates and remove JSXGraph's closing sentinel. */
export function readPolygonCoordinates(polygon: any): PolygonCoordinate[] {
  if (!polygon || !Array.isArray(polygon.vertices)) return [];
  const vertices = polygon.vertices.slice();
  const coordinates: PolygonCoordinate[] = [];

  for (const vertex of vertices) {
    try {
      const x = Number(vertex && vertex.X());
      const y = Number(vertex && vertex.Y());
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      coordinates.push({ x, y });
    } catch (e) {
      return [];
    }
  }

  if (coordinates.length > 1) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (
      vertices[0] === vertices[vertices.length - 1] ||
      (Math.abs(first.x - last.x) <= GEOMETRY_EPSILON &&
       Math.abs(first.y - last.y) <= GEOMETRY_EPSILON)
    ) {
      coordinates.pop();
    }
  }
  return coordinates;
}

/** Filter learner-created polygons while excluding template-managed presets. */
export function isLearnerDgsPolygon(
  object: any,
  allowElementTypeFallback = true
): boolean {
  if (!object || object.__liaDgsMacroManaged === true || object.__liaDgsMacroKey) {
    return false;
  }
  if (!Array.isArray(object.vertices)) return false;
  if (object.__liaDgsPolygon === true) return true;
  if (!allowElementTypeFallback) return false;

  // During a LiaScript/JSXGraph remount, the ordinary polygon can briefly be
  // present before the DGS metadata is restored.
  const elementType = String(object.elType || object.elementClass || '').toLowerCase();
  return elementType === 'polygon';
}

export function polygonSignedDoubleArea(coordinates: PolygonCoordinate[]): number {
  if (coordinates.length < 3) return 0;
  const origin = coordinates[0];
  let sum = 0;
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const currentX = coordinates[index].x - origin.x;
    const currentY = coordinates[index].y - origin.y;
    const nextX = coordinates[index + 1].x - origin.x;
    const nextY = coordinates[index + 1].y - origin.y;
    sum += currentX * nextY - nextX * currentY;
  }
  return sum;
}

export function polygonArea(coordinates: PolygonCoordinate[]): number {
  return Math.abs(polygonSignedDoubleArea(coordinates)) / 2;
}

export function polygonPerimeter(coordinates: PolygonCoordinate[]): number {
  let sum = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next = coordinates[(index + 1) % coordinates.length];
    sum += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return sum;
}

export function polygonCoordinateScale(coordinates: PolygonCoordinate[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  coordinates.forEach(function(point) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  // Keep the degeneracy thresholds relative to the actual figure. Callers
  // that need an absolute floating-point floor (such as Form side equality)
  // apply max(1, ...) at the final comparison instead.
  return Math.max(0, maxX - minX, maxY - minY);
}

export function polygonCross(
  a: PolygonCoordinate,
  b: PolygonCoordinate,
  c: PolygonCoordinate
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(
  a: PolygonCoordinate,
  b: PolygonCoordinate,
  point: PolygonCoordinate,
  lengthEpsilon: number,
  areaEpsilon: number
): boolean {
  return Math.abs(polygonCross(a, b, point)) <= areaEpsilon &&
    point.x >= Math.min(a.x, b.x) - lengthEpsilon &&
    point.x <= Math.max(a.x, b.x) + lengthEpsilon &&
    point.y >= Math.min(a.y, b.y) - lengthEpsilon &&
    point.y <= Math.max(a.y, b.y) + lengthEpsilon;
}

function segmentsIntersect(
  a: PolygonCoordinate,
  b: PolygonCoordinate,
  c: PolygonCoordinate,
  d: PolygonCoordinate,
  lengthEpsilon: number,
  areaEpsilon: number
): boolean {
  const abC = polygonCross(a, b, c);
  const abD = polygonCross(a, b, d);
  const cdA = polygonCross(c, d, a);
  const cdB = polygonCross(c, d, b);
  if (
    ((abC > areaEpsilon && abD < -areaEpsilon) ||
     (abC < -areaEpsilon && abD > areaEpsilon)) &&
    ((cdA > areaEpsilon && cdB < -areaEpsilon) ||
     (cdA < -areaEpsilon && cdB > areaEpsilon))
  ) {
    return true;
  }
  return pointOnSegment(a, b, c, lengthEpsilon, areaEpsilon) ||
    pointOnSegment(a, b, d, lengthEpsilon, areaEpsilon) ||
    pointOnSegment(c, d, a, lengthEpsilon, areaEpsilon) ||
    pointOnSegment(c, d, b, lengthEpsilon, areaEpsilon);
}

export function normalizePolygonCounterClockwise(
  coordinates: PolygonCoordinate[]
): PolygonCoordinate[] {
  return polygonSignedDoubleArea(coordinates) < 0
    ? coordinates.slice().reverse()
    : coordinates.slice();
}

export function polygonInteriorAngle(
  previous: PolygonCoordinate,
  current: PolygonCoordinate,
  next: PolygonCoordinate
): number {
  const incomingX = current.x - previous.x;
  const incomingY = current.y - previous.y;
  const outgoingX = next.x - current.x;
  const outgoingY = next.y - current.y;
  const turn = Math.atan2(
    incomingX * outgoingY - incomingY * outgoingX,
    incomingX * outgoingX + incomingY * outgoingY
  ) * 180 / Math.PI;
  let result = 180 - turn;
  if (result <= 0) result += 360;
  if (result >= 360) result -= 360;
  return result;
}

/** Validate and calculate one closed polygon in cyclic corner order. */
export function analyzePolygonGeometry(
  inputCoordinates: PolygonCoordinate[]
): PolygonGeometryAnalysis {
  const coordinates = inputCoordinates.map(function(point) {
    return { x: Number(point.x), y: Number(point.y) };
  });
  const count = coordinates.length;
  const hasFiniteCoordinates = coordinates.every(function(point) {
    return Number.isFinite(point.x) && Number.isFinite(point.y);
  });
  const signedArea = hasFiniteCoordinates
    ? polygonSignedDoubleArea(coordinates)
    : NaN;
  const area = Math.abs(signedArea) / 2;
  const perimeter = hasFiniteCoordinates && count >= 2
    ? polygonPerimeter(coordinates)
    : 0;
  const scale = hasFiniteCoordinates && count
    ? polygonCoordinateScale(coordinates)
    : 1;
  const lengthEpsilon = GEOMETRY_EPSILON * scale;
  const areaEpsilon = GEOMETRY_EPSILON * scale * scale;
  const sideLengths: number[] = [];

  const result = function(
    valid: boolean,
    issue: PolygonValidationIssue | null,
    interiorAngles: number[] = []
  ): PolygonGeometryAnalysis {
    return {
      valid,
      issue,
      coordinates,
      signedDoubleArea: signedArea,
      area,
      perimeter,
      scale,
      sideLengths,
      interiorAngles
    };
  };

  if (!hasFiniteCoordinates) return result(false, 'invalid-coordinate');
  if (count < 3) return result(false, 'too-few-corners');

  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      const dx = coordinates[second].x - coordinates[first].x;
      const dy = coordinates[second].y - coordinates[first].y;
      if (Math.hypot(dx, dy) <= lengthEpsilon) {
        return result(false, 'duplicate-corner');
      }
    }
  }

  for (let index = 0; index < count; index += 1) {
    const nextIndex = (index + 1) % count;
    const dx = coordinates[nextIndex].x - coordinates[index].x;
    const dy = coordinates[nextIndex].y - coordinates[index].y;
    const length = Math.hypot(dx, dy);
    sideLengths.push(length);
    if (length <= lengthEpsilon) return result(false, 'zero-length-side');
    if (
      Math.abs(polygonCross(
        coordinates[(index - 1 + count) % count],
        coordinates[index],
        coordinates[nextIndex]
      )) <= areaEpsilon
    ) {
      return result(false, 'collinear-corner');
    }
  }

  for (let first = 0; first < count; first += 1) {
    const firstNext = (first + 1) % count;
    for (let second = first + 1; second < count; second += 1) {
      if (
        second === firstNext ||
        (second + 1) % count === first
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          coordinates[first],
          coordinates[firstNext],
          coordinates[second],
          coordinates[(second + 1) % count],
          lengthEpsilon,
          areaEpsilon
        )
      ) {
        return result(false, 'self-intersection');
      }
    }
  }

  if (area <= areaEpsilon / 2) return result(false, 'near-zero-area');

  const normalized = normalizePolygonCounterClockwise(coordinates);
  const interiorAngles = normalized.map(function(current, index) {
    return polygonInteriorAngle(
      normalized[(index - 1 + count) % count],
      current,
      normalized[(index + 1) % count]
    );
  });
  return result(true, null, interiorAngles);
}
