// Polygon construction quizzes (@KonstruktionQuiz / @ConstructionQuiz).
// A quiz always reads the current DGS board when LiaScript's Check button is
// pressed. No geometry is cached between checks or across slide remounts.

import { getBoardObjects } from '../shared/boardObjects';
import { scheduleBootstrap } from '../shared/bootstrap';
import { splitTopLevel, unquote } from '../shared/parser';
import {
  DEFAULT_ANGLE_TOLERANCE,
  DEFAULT_LENGTH_TOLERANCE,
  analyzePolygonGeometry,
  isLearnerDgsPolygon,
  normalizePolygonCounterClockwise,
  readPolygonCoordinates,
  type PolygonCoordinate,
} from '../shared/polygonGeometry';

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

type ConstructionCoordinate = PolygonCoordinate;

type ConstructionFeature = ConstructionConstraint & {
  boundaryIndex: number;
};

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

export function buildConstructionFeatures(
  inputCoordinates: ConstructionCoordinate[]
): ConstructionFeature[] {
  const analysis = analyzePolygonGeometry(inputCoordinates);
  if (!analysis.valid) return [];
  const coordinates = normalizePolygonCounterClockwise(inputCoordinates);
  const count = coordinates.length;
  const angles = analysis.interiorAngles;
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

export function polygonMatchesConstruction(
  polygon: any,
  config: ConstructionQuizConfig
): boolean {
  if (!config.valid || !isLearnerDgsPolygon(polygon, false)) return false;
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
