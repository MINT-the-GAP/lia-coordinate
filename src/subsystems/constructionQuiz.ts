// Polygon construction quizzes (@KonstruktionQuiz / @ConstructionQuiz).
// A quiz always reads the current DGS board when LiaScript's Check button is
// pressed. No geometry is cached between checks or across slide remounts.

import { getBoardObjects } from '../shared/boardObjects';
import { scheduleBootstrap } from '../shared/bootstrap';
import { splitTopLevel, unquote } from '../shared/parser';

export type ConstructionConstraintKind = 'side' | 'angle';
export type ConstructionQuizMode = 'fixed' | 'open';

export type ConstructionConstraint = {
  kind: ConstructionConstraintKind;
  value: number;
};

export type ConstructionQuizConfig = {
  boardId: string;
  corners: number;
  mode: ConstructionQuizMode;
  constraints: ConstructionConstraint[];
  lengthTolerance: number;
  angleTolerance: number;
  valid: boolean;
};

type ConstructionCoordinate = {
  x: number;
  y: number;
};

type ConstructionFeature = ConstructionConstraint & {
  boundaryIndex: number;
};

const DEFAULT_LENGTH_TOLERANCE = 0.05;
const DEFAULT_ANGLE_TOLERANCE = 1;
const GEOMETRY_EPSILON = 1e-10;

function normalizeWord(value: unknown): string {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s_-]+/g, '');
}

function normalizeMode(value: unknown): ConstructionQuizMode | null {
  const mode = normalizeWord(unquote(String(value == null ? '' : value)));
  if (mode === 'fest' || mode === 'fixed' || mode === 'geordnet' || mode === 'ordered') {
    return 'fixed';
  }
  if (mode === 'offen' || mode === 'open' || mode === 'frei' || mode === 'unordered') {
    return 'open';
  }
  return null;
}

function parseLocalizedNumber(value: unknown): number {
  const normalized = unquote(String(value == null ? '' : value))
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  return normalized ? Number(normalized) : NaN;
}

function constraintKindFromPrefix(value: string): ConstructionConstraintKind | null {
  const prefix = normalizeWord(value);
  if (
    prefix === 's' || prefix === 'seite' || prefix === 'strecke' ||
    prefix === 'side' || prefix === 'length' || prefix === 'edge'
  ) {
    return 'side';
  }
  if (prefix === 'w' || prefix === 'winkel' || prefix === 'angle') return 'angle';
  return null;
}

function parseConstructionConstraint(value: unknown): ConstructionConstraint | null {
  let raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw) return null;
  raw = raw.replace(/^\$|\$$/g, '').trim();

  const prefixMatch = raw.match(/^([A-Za-zÄÖÜäöüß]+)([\s\S]*)$/);
  if (!prefixMatch) return null;
  const kind = constraintKindFromPrefix(prefixMatch[1]);
  if (!kind) return null;

  let numberText = String(prefixMatch[2] || '').trim();
  numberText = numberText.replace(/^(?:=|:)\s*/, '');
  if (numberText.startsWith('(') && numberText.endsWith(')')) {
    numberText = numberText.slice(1, -1).trim();
  }
  if (kind === 'angle') {
    numberText = numberText
      .replace(/\^\s*\{?\s*\\?circ\s*\}?/gi, '')
      .replace(/\\circ/gi, '')
      .replace(/(?:°|degrees?|deg|grad)\s*$/i, '')
      .trim();
  } else {
    numberText = numberText.replace(/(?:le|units?|einheiten?)\s*$/i, '').trim();
  }

  const number = parseLocalizedNumber(numberText);
  if (!Number.isFinite(number)) return null;
  if (kind === 'side' && number <= 0) return null;
  if (kind === 'angle' && (number <= 0 || number >= 360)) return null;
  return { kind, value: number };
}

function unwrapConstraintList(value: unknown): string {
  let raw = unquote(String(value == null ? '' : value)).trim();
  if (
    raw.length >= 2 &&
    ((raw.startsWith('[') && raw.endsWith(']')) ||
     (raw.startsWith('(') && raw.endsWith(')')))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  return raw;
}

function parseToleranceOptions(
  values: string[]
): { lengthTolerance: number; angleTolerance: number; valid: boolean } {
  let lengthTolerance = DEFAULT_LENGTH_TOLERANCE;
  let angleTolerance = DEFAULT_ANGLE_TOLERANCE;
  let valid = true;

  values.forEach(function(value) {
    const match = String(value || '').trim().match(/^([^=]+)=(.+)$/);
    if (!match) {
      valid = false;
      return;
    }
    const key = normalizeWord(match[1]);
    const number = parseLocalizedNumber(match[2]);
    if (!Number.isFinite(number) || number < 0) {
      valid = false;
      return;
    }
    if (
      key === 'streckentoleranz' || key === 'laengentoleranz' ||
      key === 'lengthtolerance' || key === 'sidetolerance' ||
      key === 'stol' || key === 'ltol'
    ) {
      lengthTolerance = number;
      return;
    }
    if (
      key === 'winkeltoleranz' || key === 'angletolerance' ||
      key === 'wtol' || key === 'atol'
    ) {
      angleTolerance = number;
      return;
    }
    valid = false;
  });

  return { lengthTolerance, angleTolerance, valid };
}

export function parseConstructionQuizSpec(spec: string): ConstructionQuizConfig {
  const rawSpec = unquote(String(spec || '').trim());
  const parts = splitTopLevel(rawSpec, ';');
  const boardId = unquote(parts[0] || '').trim();
  const cornersValue = parseLocalizedNumber(parts[1]);
  const corners = Number.isInteger(cornersValue) ? cornersValue : NaN;
  const mode = normalizeMode(parts[2]);
  const rawConstraints = unwrapConstraintList(parts[3]);
  const constraintParts = rawConstraints ? splitTopLevel(rawConstraints, ',') : [];
  const constraints = constraintParts
    .map(parseConstructionConstraint)
    .filter(function(value): value is ConstructionConstraint { return !!value; });
  const tolerances = parseToleranceOptions(parts.slice(4));
  const valid = !!boardId && Number.isInteger(corners) && corners >= 3 &&
    !!mode && constraintParts.length > 0 &&
    constraints.length === constraintParts.length &&
    constraints.length <= corners * 2 &&
    tolerances.valid;

  return {
    boardId,
    corners,
    mode: mode || 'open',
    constraints,
    lengthTolerance: tolerances.lengthTolerance,
    angleTolerance: tolerances.angleTolerance,
    valid
  };
}

function readPolygonCoordinates(polygon: any): ConstructionCoordinate[] {
  if (!polygon || !Array.isArray(polygon.vertices)) return [];
  const coordinates: ConstructionCoordinate[] = [];
  for (const vertex of polygon.vertices) {
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
      polygon.vertices[0] === polygon.vertices[polygon.vertices.length - 1] ||
      (Math.abs(first.x - last.x) <= GEOMETRY_EPSILON &&
       Math.abs(first.y - last.y) <= GEOMETRY_EPSILON)
    ) {
      coordinates.pop();
    }
  }
  return coordinates;
}

function signedDoubleArea(coordinates: ConstructionCoordinate[]): number {
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

function coordinateScale(coordinates: ConstructionCoordinate[]): number {
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
  return Math.max(1, maxX - minX, maxY - minY);
}

function cross(
  a: ConstructionCoordinate,
  b: ConstructionCoordinate,
  c: ConstructionCoordinate
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(
  a: ConstructionCoordinate,
  b: ConstructionCoordinate,
  point: ConstructionCoordinate,
  epsilon: number
): boolean {
  return Math.abs(cross(a, b, point)) <= epsilon &&
    point.x >= Math.min(a.x, b.x) - epsilon &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    point.y >= Math.min(a.y, b.y) - epsilon &&
    point.y <= Math.max(a.y, b.y) + epsilon;
}

function segmentsIntersect(
  a: ConstructionCoordinate,
  b: ConstructionCoordinate,
  c: ConstructionCoordinate,
  d: ConstructionCoordinate,
  epsilon: number
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) {
    return true;
  }
  return pointOnSegment(a, b, c, epsilon) ||
    pointOnSegment(a, b, d, epsilon) ||
    pointOnSegment(c, d, a, epsilon) ||
    pointOnSegment(c, d, b, epsilon);
}

function isSimpleNonDegeneratePolygon(coordinates: ConstructionCoordinate[]): boolean {
  const count = coordinates.length;
  if (count < 3) return false;
  const scale = coordinateScale(coordinates);
  const epsilon = GEOMETRY_EPSILON * scale;
  const areaEpsilon = GEOMETRY_EPSILON * scale * scale;
  if (Math.abs(signedDoubleArea(coordinates)) <= areaEpsilon) return false;

  for (let first = 0; first < count; first += 1) {
    const firstNext = (first + 1) % count;
    const dx = coordinates[firstNext].x - coordinates[first].x;
    const dy = coordinates[firstNext].y - coordinates[first].y;
    if (Math.hypot(dx, dy) <= epsilon) return false;
    if (
      Math.abs(cross(
        coordinates[(first - 1 + count) % count],
        coordinates[first],
        coordinates[firstNext]
      )) <= areaEpsilon
    ) {
      // A point on a straight side is not an additional geometric corner.
      return false;
    }
    for (let second = first + 1; second < count; second += 1) {
      if (
        second === first ||
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
          epsilon
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function normalizeCounterClockwise(
  coordinates: ConstructionCoordinate[]
): ConstructionCoordinate[] {
  return signedDoubleArea(coordinates) < 0
    ? coordinates.slice().reverse()
    : coordinates.slice();
}

function interiorAngle(
  previous: ConstructionCoordinate,
  current: ConstructionCoordinate,
  next: ConstructionCoordinate
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

export function buildConstructionFeatures(
  inputCoordinates: ConstructionCoordinate[]
): ConstructionFeature[] {
  if (!isSimpleNonDegeneratePolygon(inputCoordinates)) return [];
  const coordinates = normalizeCounterClockwise(inputCoordinates);
  const count = coordinates.length;
  const angles = coordinates.map(function(current, index) {
    return interiorAngle(
      coordinates[(index - 1 + count) % count],
      current,
      coordinates[(index + 1) % count]
    );
  });
  const features: ConstructionFeature[] = [];
  for (let index = 0; index < count; index += 1) {
    const nextIndex = (index + 1) % count;
    features.push({
      kind: 'side',
      value: Math.hypot(
        coordinates[nextIndex].x - coordinates[index].x,
        coordinates[nextIndex].y - coordinates[index].y
      ),
      boundaryIndex: index
    });
    features.push({
      kind: 'angle',
      value: angles[nextIndex],
      boundaryIndex: nextIndex
    });
  }
  return features;
}

function constraintMatchesFeature(
  constraint: ConstructionConstraint,
  feature: ConstructionFeature,
  config: ConstructionQuizConfig
): boolean {
  if (constraint.kind !== feature.kind) return false;
  const tolerance = constraint.kind === 'side'
    ? config.lengthTolerance
    : config.angleTolerance;
  const floatingPointSlack = Number.EPSILON * 32 *
    Math.max(1, Math.abs(constraint.value), Math.abs(feature.value));
  return Math.abs(constraint.value - feature.value) <= tolerance + floatingPointSlack;
}

function matchesFixedConstruction(
  features: ConstructionFeature[],
  config: ConstructionQuizConfig
): boolean {
  if (!config.constraints.length || config.constraints.length > features.length) return false;
  const featureCount = features.length;

  for (let start = 0; start < featureCount; start += 1) {
    if (features[start].kind !== config.constraints[0].kind) continue;
    let featureIndex = start;
    const used = new Set<number>();
    let matches = true;

    for (let index = 0; index < config.constraints.length; index += 1) {
      const constraint = config.constraints[index];
      if (index > 0) {
        const previous = config.constraints[index - 1];
        featureIndex = (featureIndex + (previous.kind === constraint.kind ? 2 : 1)) %
          featureCount;
      }
      if (used.has(featureIndex) ||
          !constraintMatchesFeature(constraint, features[featureIndex], config)) {
        matches = false;
        break;
      }
      used.add(featureIndex);
    }
    if (matches) return true;
  }
  return false;
}

function matchesOpenConstruction(
  features: ConstructionFeature[],
  config: ConstructionQuizConfig
): boolean {
  const assignedConstraint = new Array<number>(features.length).fill(-1);

  const assign = function(constraintIndex: number, visited: boolean[]): boolean {
    for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
      if (visited[featureIndex] ||
          !constraintMatchesFeature(
            config.constraints[constraintIndex],
            features[featureIndex],
            config
          )) {
        continue;
      }
      visited[featureIndex] = true;
      if (
        assignedConstraint[featureIndex] < 0 ||
        assign(assignedConstraint[featureIndex], visited)
      ) {
        assignedConstraint[featureIndex] = constraintIndex;
        return true;
      }
    }
    return false;
  };

  for (let index = 0; index < config.constraints.length; index += 1) {
    if (!assign(index, new Array<boolean>(features.length).fill(false))) return false;
  }
  return true;
}

function isLearnerPolygon(object: any): boolean {
  if (!object || object.__liaDgsMacroManaged === true || object.__liaDgsMacroKey) return false;
  return object.__liaDgsPolygon === true && Array.isArray(object.vertices);
}

export function polygonMatchesConstruction(
  polygon: any,
  config: ConstructionQuizConfig
): boolean {
  if (!config.valid || !isLearnerPolygon(polygon)) return false;
  const coordinates = readPolygonCoordinates(polygon);
  if (coordinates.length !== config.corners) return false;
  const features = buildConstructionFeatures(coordinates);
  if (features.length !== config.corners * 2) return false;
  return config.mode === 'fixed'
    ? matchesFixedConstruction(features, config)
    : matchesOpenConstruction(features, config);
}

export function checkConstructionOnBoard(
  board: any,
  config: ConstructionQuizConfig
): boolean {
  if (!board || !config.valid) return false;
  return getBoardObjects(board).some(function(object) {
    if (!object || object.board !== board) return false;
    return polygonMatchesConstruction(object, config);
  });
}

function readSpecNode(node: HTMLElement | null): string {
  if (!node) return '';
  const stored = String(node.dataset.spec || '');
  if (stored) return stored;
  return String(node.textContent || '');
}

function resolveQuizSpec(uid: string, spec: string): string {
  const node = document.getElementById('construction-quiz-spec-' + uid) as HTMLElement | null;
  return String(spec || readSpecNode(node));
}

function applyQuizMetadata(
  uid: string,
  spec: string,
  language?: string
): void {
  const node = document.getElementById('construction-quiz-spec-' + uid) as HTMLElement | null;
  if (!node) return;
  node.dataset.spec = String(spec || readSpecNode(node));
  if (language) node.dataset.language = language;
}

export function init(): void {
  if (window.__constructionQuizReady) {
    try {
      if (window.__bootstrapConstructionQuizzes) window.__bootstrapConstructionQuizzes();
    } catch (e) {}
    return;
  }

  window.__constructionQuizReady = true;

  window.__checkConstructionQuizFromSpec = function(spec: string): boolean {
    const config = parseConstructionQuizSpec(spec);
    if (!config.valid) return false;
    const board = window.__boards && window.__boards[config.boardId];
    return checkConstructionOnBoard(board, config);
  };

  window.__checkConstructionQuiz = function(uid: string, spec: string): boolean {
    const resolved = resolveQuizSpec(uid, spec);
    if (!resolved || !window.__checkConstructionQuizFromSpec) return false;
    return window.__checkConstructionQuizFromSpec(resolved);
  };

  window.__setupConstructionQuiz = function(
    uid: string,
    spec: string,
    language?: string
  ): void {
    applyQuizMetadata(uid, spec, language);
  };

  window.__bootstrapConstructionQuizzes = function(): void {
    document.querySelectorAll<HTMLElement>(
      '[id^=construction-quiz-spec-]'
    ).forEach(function(node) {
      const uid = String(node.id || '').replace(/^construction-quiz-spec-/, '');
      if (!uid || !window.__setupConstructionQuiz) return;
      window.__setupConstructionQuiz(
        uid,
        readSpecNode(node),
        node.dataset.language
      );
    });
  };

  scheduleBootstrap(function() {
    try {
      if (window.__bootstrapConstructionQuizzes) window.__bootstrapConstructionQuizzes();
    } catch (e) {}
  });
}
