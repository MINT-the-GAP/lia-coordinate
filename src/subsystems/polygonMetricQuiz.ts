// Polygon metric quizzes (@UmfangQuiz/@PerimeterQuiz and @FlaecheQuiz/@AreaQuiz).
// The LiaScript generic quiz calls these helpers whenever its normal Check
// button is pressed, so the current (possibly moved) DGS construction is used.

import { getBoardObjects } from '../shared/boardObjects';
import { scheduleBootstrap } from '../shared/bootstrap';
import { splitTopLevel, unquote } from '../shared/parser';

export type PolygonMetricKind = 'perimeter' | 'area';

export type PolygonMetricQuizSpec = {
  boardId: string;
  corners: number;
  target: number;
  tolerance: number;
  valid: boolean;
};

type PolygonCoordinate = {
  x: number;
  y: number;
};

function normalizeKind(value: unknown): PolygonMetricKind | null {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === 'perimeter' || normalized === 'umfang') return 'perimeter';
  if (normalized === 'area' || normalized === 'flaeche' || normalized === 'fläche') return 'area';
  return null;
}

function parseLocalizedNumber(value: unknown): number {
  const normalized = unquote(String(value == null ? '' : value))
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (!normalized) return NaN;
  return Number(normalized);
}

export function parsePolygonMetricQuizSpec(spec: string): PolygonMetricQuizSpec {
  const rawSpec = unquote(String(spec || '').trim());
  const parts = splitTopLevel(rawSpec, ';');
  const boardId = unquote(parts[0] || '').trim();
  const cornersValue = parseLocalizedNumber(parts[1]);
  const target = parseLocalizedNumber(parts[2]);
  const tolerance = parseLocalizedNumber(parts[3]);
  const corners = Number.isInteger(cornersValue) ? cornersValue : NaN;
  const valid = !!boardId && Number.isInteger(corners) && corners >= 3 &&
    Number.isFinite(target) && target >= 0 &&
    Number.isFinite(tolerance) && tolerance >= 0;

  return { boardId, corners, target, tolerance, valid };
}

function getPolygonCoordinates(polygon: any): PolygonCoordinate[] {
  if (!polygon || !Array.isArray(polygon.vertices)) return [];
  const vertices = polygon.vertices.slice();
  // JSXGraph closes polygons by appending the first vertex once more. The DGS
  // persistence layer removes that same sentinel before serializing a polygon;
  // it is a closing aid, not an additional corner of the N-gon.
  if (vertices.length > 1 && vertices[0] === vertices[vertices.length - 1]) {
    vertices.pop();
  }
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
  return coordinates;
}

export function polygonArea(coordinates: PolygonCoordinate[]): number {
  let sum = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next = coordinates[(index + 1) % coordinates.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
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

function isLearnerDgsPolygon(object: any): boolean {
  if (!object || object.__liaDgsMacroManaged === true || object.__liaDgsMacroKey) return false;
  if (!Array.isArray(object.vertices)) return false;

  // Interactive DGS polygons carry __liaDgsPolygon. Keep the JSXGraph type as
  // a fallback because LiaScript can remount/restore a board before all DGS
  // metadata has been attached again. In that short-lived state the object is
  // still an ordinary JSXGraph polygon and must remain checkable.
  const elementType = String(object.elType || object.elementClass || '').toLowerCase();
  return object.__liaDgsPolygon === true || elementType === 'polygon';
}

/** Check one concrete learner polygon against one metric condition. */
export function polygonMatchesMetric(
  polygon: any,
  config: PolygonMetricQuizSpec,
  kind: PolygonMetricKind
): boolean {
  if (!config.valid || !isLearnerDgsPolygon(polygon)) return false;
  const coordinates = getPolygonCoordinates(polygon);
  if (coordinates.length !== config.corners) return false;
  const metric = kind === 'area' ? polygonArea(coordinates) : polygonPerimeter(coordinates);
  const floatingPointSlack = Number.EPSILON * 16 *
    Math.max(1, Math.abs(config.target), Math.abs(metric));
  return Number.isFinite(metric) &&
    Math.abs(metric - config.target) <= config.tolerance + floatingPointSlack;
}

export function checkPolygonMetricOnBoard(
  board: any,
  config: PolygonMetricQuizSpec,
  kind: PolygonMetricKind
): boolean {
  if (!board || !config.valid) return false;

  return getBoardObjects(board).some(function(object) {
    return polygonMatchesMetric(object, config, kind);
  });
}

function resolveQuizSpec(uid: string, spec: string): string {
  const node = document.getElementById('polygon-metric-quiz-spec-' + uid) as HTMLElement | null;
  return String(spec || readQuizSpecNode(node));
}

function readQuizSpecNode(node: HTMLElement | null): string {
  if (!node) return '';
  const stored = String(node.dataset.spec || '');
  if (stored) return stored;
  const value = String((node as HTMLTextAreaElement).value || '');
  if (value) return value;
  return String(node.textContent || '');
}

function applyQuizMetadata(
  uid: string,
  spec: string,
  kindValue: unknown,
  language?: string
): void {
  const node = document.getElementById('polygon-metric-quiz-spec-' + uid) as HTMLElement | null;
  if (!node) return;
  const resolvedSpec = String(spec || readQuizSpecNode(node));
  const kind = normalizeKind(kindValue || node.dataset.kind);
  node.dataset.spec = resolvedSpec;
  if (kind) node.dataset.kind = kind;
  if (language) node.dataset.language = language;
}

export function init(): void {
  if (window.__polygonMetricQuizReady) {
    try {
      if (window.__bootstrapPolygonMetricQuizzes) window.__bootstrapPolygonMetricQuizzes();
    } catch (e) {}
    return;
  }

  window.__polygonMetricQuizReady = true;

  window.__checkPolygonMetricFromSpec = function(spec: string, kindValue: string): boolean {
    const kind = normalizeKind(kindValue);
    const config = parsePolygonMetricQuizSpec(spec);
    if (!kind || !config.valid) return false;
    const board = window.__boards && window.__boards[config.boardId];
    return checkPolygonMetricOnBoard(board, config, kind);
  };

  window.__checkPolygonMetricQuiz = function(
    uid: string,
    spec: string,
    kindValue: string
  ): boolean {
    const resolved = resolveQuizSpec(uid, spec);
    if (!resolved || !window.__checkPolygonMetricFromSpec) return false;
    return window.__checkPolygonMetricFromSpec(resolved, kindValue);
  };

  window.__setupPolygonMetricQuiz = function(
    uid: string,
    spec: string,
    kindValue: string,
    language?: string
  ): void {
    applyQuizMetadata(uid, spec, kindValue, language);
  };

  window.__bootstrapPolygonMetricQuizzes = function(): void {
    document.querySelectorAll<HTMLElement>(
      '[id^="polygon-metric-quiz-spec-"][data-kind]'
    ).forEach(function(node) {
      const uid = String(node.id || '').replace(/^polygon-metric-quiz-spec-/, '');
      if (!uid || !window.__setupPolygonMetricQuiz) return;
      window.__setupPolygonMetricQuiz(
        uid,
        readQuizSpecNode(node),
        String(node.dataset.kind || ''),
        node.dataset.language
      );
    });
  };

  scheduleBootstrap(function() {
    try {
      if (window.__bootstrapPolygonMetricQuizzes) window.__bootstrapPolygonMetricQuizzes();
    } catch (e) {}
  });
}
