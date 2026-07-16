// Object analysis point subsystem (@OrdinateIntercept/@Ordinatenabschnitt and
// @Intersection/@Schnittpunkt macros). Creates dependent points for the
// ordinate-axis intercept of a function/linear object and for intersections of
// functions, linear objects, and circles.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { getBoardObjects } from '../shared/boardObjects';
import { formatNumber } from '../shared/format';

type ObjectAnalysisKind = 'ordinate-intercept' | 'intersections';
type SourceKind = 'function' | 'linear' | 'circle';
type LinearMode = 'line' | 'ray' | 'segment';

interface ObjectAnalysisConfig {
  boardId: string;
  kind: ObjectAnalysisKind;
  sourceName: string;
  source2Name: string;
  color: string;
  hasExplicitColor: boolean;
  prefix: string;
  explicitNames: string[];
  explicitNameVisibility: boolean[];
  explicitValueVisibility: boolean[];
  explicitObjectVisibility: boolean[];
  showName: boolean;
  language: 'de' | 'en';
  showValue: boolean;
}

interface AnalysisSource {
  object: any;
  kind: SourceKind;
  linearMode?: LinearMode;
}

interface AnalysisPosition {
  x: number;
  y: number;
}

interface ObjectAnalysisEntry {
  uid: string;
  key: string;
  boardId: string;
  kind: ObjectAnalysisKind;
  sourceName: string;
  source2Name: string;
  color: string;
  hasExplicitColor: boolean;
  prefix: string;
  explicitNames: string[];
  explicitNameVisibility: boolean[];
  explicitValueVisibility: boolean[];
  explicitObjectVisibility: boolean[];
  showName: boolean;
  language: 'de' | 'en';
  showValue: boolean;
  board: any;
  source: AnalysisSource;
  source2: AnalysisSource | null;
  points: any[];
  holders: AnalysisPosition[];
  names: string[];
  updateRAF?: number;
  updating?: boolean;
  handlers?: Array<{ event: string; fn: () => void }>;
  __liaDgsMacroManaged?: boolean;
  __liaDgsSource?: any;
  __liaDgsSource2?: any;
}

export function init(): void {
  if (window.__objectAnalysisPointsReady) {
    try { if (window.__scheduleBootstrapObjectAnalysisPoints) window.__scheduleBootstrapObjectAnalysisPoints(); } catch (e) {}
    return;
  }
  window.__objectAnalysisPointsReady = true;
  window.__objectAnalysisPointEntries = window.__objectAnalysisPointEntries || {};
  initThemeSync();

  let hasPendingObjectAnalysisPoints = false;

  function normalizeKind(kind: unknown): ObjectAnalysisKind {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'intersection' || value === 'intersections' || value === 'schnittpunkt' || value === 'schnittpunkte') {
      return 'intersections';
    }
    return 'ordinate-intercept';
  }

  function defaultPrefix(kind: ObjectAnalysisKind, language: 'de' | 'en'): string {
    if (kind === 'intersections') return language === 'de' ? 'S' : 'I';
    return 'O';
  }

  function isValueOption(part: string): boolean {
    return /^(wert|value|koordinaten|coordinates)\s*=\s*1$/i.test(String(part || '').trim());
  }

  function parseBooleanListOption(parts: string[], names: RegExp): boolean[] {
    const option = parts.find(function(part) { return names.test(String(part || '').trim()); }) || '';
    const match = option.match(/^[^=]+\s*=\s*(.+)$/);
    if (!match) return [];
    let raw = unquote(String(match[1] || '').trim());
    if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
    return splitTopLevel(raw, ';').map(function(value) {
      return !/^(?:0|false|nein|no)$/i.test(unquote(value).trim());
    });
  }

  function isPerPointOption(part: string): boolean {
    return /^(?:values|werte|visible|sichtbar)\s*=/i.test(String(part || '').trim());
  }

  function cleanName(value: unknown): string {
    let name = String(value == null ? '' : value).trim();
    if (name.startsWith('\\(') && name.endsWith('\\)')) name = name.slice(2, -2).trim();
    else if (name.startsWith('$') && name.endsWith('$')) name = name.slice(1, -1).trim();
    name = name.replace(/^\\overrightarrow\{(.+)\}$/, '$1');
    name = name.replace(/^\\angle\s+/, '').trim();
    name = name.replace(/\s*\(\s*x\s*\)\s*$/i, '').trim();
    return name;
  }

  function normalizeName(value: unknown): string {
    return cleanName(value)
      .replace(/_\{([^{}]+)\}/g, '_$1')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function normalizeFunctionName(value: unknown): string {
    const name = normalizeName(value);
    return /^[a-z][a-z0-9]*$/.test(name) ? name : '';
  }

  function namesEqual(a: unknown, b: unknown): boolean {
    const left = normalizeName(a);
    const right = normalizeName(b);
    return !!left && left === right;
  }

  function parseNamesList(value: string): Array<{ name: string; showName: boolean }> {
    let raw = String(value || '').trim();
    const match = raw.match(/^names?\s*=\s*(.+)$/i);
    if (match) raw = String(match[1] || '').trim();
    raw = unquote(raw);
    if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
    return splitTopLevel(raw, ';')
      .map(function(part) {
        const parsed = parseMacroName(unquote(part));
        return { name: cleanName(parsed.name), showName: parsed.showName };
      })
      .filter(function(parsed) { return !!parsed.name; });
  }

  function parseObjectAnalysisSpec(spec: string, kind: string, language?: string): ObjectAnalysisConfig {
    const analysisKind = normalizeKind(kind);
    const languageValue = String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de';
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const colorIndex = analysisKind === 'intersections' ? 3 : 2;
    const explicitColor = String(parts[colorIndex] || '').trim();
    const trailingOptions = parts.slice(colorIndex + 1)
      .map(function(part) { return String(part || '').trim(); })
      .filter(Boolean);
    const namesOption = trailingOptions.find(function(part) {
      return !isHiddenNameOption(part) && /^names?\s*=/i.test(part);
    }) || '';
    const prefixOption = trailingOptions.map(function(part) {
      const match = part.match(/^prefix\s*=\s*(.+)$/i);
      return match ? String(match[1] || '').trim() : '';
    }).find(Boolean) || '';
    const positionalPrefix = trailingOptions.find(function(part) {
      return !isValueOption(part) && !isPerPointOption(part) && !isHiddenNameOption(part) &&
        !/^names?\s*=/i.test(part) && !/^prefix\s*=/i.test(part);
    }) || '';
    const parsedPrefix = parseMacroName(prefixOption || positionalPrefix, defaultPrefix(analysisKind, languageValue));
    const parsedNames = namesOption ? parseNamesList(namesOption) : [];
    const explicitValueVisibility = parseBooleanListOption(trailingOptions, /^(?:values|werte)\s*=/i);
    const explicitObjectVisibility = parseBooleanListOption(trailingOptions, /^(?:visible|sichtbar)\s*=/i);
    return {
      boardId: String(parts[0] || '').trim(),
      kind: analysisKind,
      sourceName: cleanName(parts[1] || ''),
      source2Name: analysisKind === 'intersections' ? cleanName(parts[2] || '') : '',
      color: explicitColor || '#ff00ff',
      hasExplicitColor: !!explicitColor,
      prefix: cleanName(parsedPrefix.name) || defaultPrefix(analysisKind, languageValue),
      explicitNames: parsedNames.map(function(parsed) { return parsed.name; }),
      explicitNameVisibility: parsedNames.map(function(parsed) { return parsed.showName; }),
      explicitValueVisibility,
      explicitObjectVisibility,
      showName: parsedPrefix.showName && !trailingOptions.some(isHiddenNameOption),
      language: languageValue,
      showValue: trailingOptions.some(isValueOption)
    };
  }

  function entryKey(uid: string): string {
    return 'object-analysis-' + String(uid || '');
  }

  function texName(nameValue: string): string {
    const raw = cleanName(nameValue);
    const match = raw.match(/^(.+?)_([^{}]+)$/);
    return match ? match[1] + '_{' + match[2] + '}' : raw;
  }

  function pointNameForIndex(entry: ObjectAnalysisEntry | ObjectAnalysisConfig, index: number): string {
    const explicit = entry.explicitNames[index];
    if (explicit) return explicit;
    const prefix = cleanName(entry.prefix) || defaultPrefix(entry.kind, entry.language);
    return prefix + '_' + (index + 1);
  }

  function pointNameVisible(entry: ObjectAnalysisEntry | ObjectAnalysisConfig, index: number): boolean {
    if (entry.showName === false) return false;
    if (entry.explicitNames[index]) return entry.explicitNameVisibility[index] !== false;
    return true;
  }

  function pointValueVisible(entry: ObjectAnalysisEntry | ObjectAnalysisConfig, index: number): boolean {
    if (Array.isArray(entry.explicitValueVisibility) &&
        typeof entry.explicitValueVisibility[index] === 'boolean') {
      return entry.explicitValueVisibility[index];
    }
    return entry.showValue;
  }

  function pointObjectVisible(entry: ObjectAnalysisEntry | ObjectAnalysisConfig, index: number): boolean {
    if (Array.isArray(entry.explicitObjectVisibility) &&
        typeof entry.explicitObjectVisibility[index] === 'boolean') {
      return entry.explicitObjectVisibility[index];
    }
    return true;
  }

  function pointLabelText(entry: ObjectAnalysisEntry, index: number): string {
    const name = texName(entry.names[index] || pointNameForIndex(entry, index));
    const showName = pointNameVisible(entry, index);
    if (!pointValueVisible(entry, index)) return showName ? '\\(' + name + '\\)' : '';
    const holder = entry.holders[index] || { x: NaN, y: NaN };
    return '\\(' + (showName ? name + '\\; ' : '') + '(' + formatNumber(holder.x, entry.language) + '\\mid ' +
      formatNumber(holder.y, entry.language) + ')\\)';
  }

  function keepPointLabelOnOneLine(point: any): void {
    const labelNode = point && point.label && point.label.rendNode as HTMLElement | undefined;
    if (!labelNode || !labelNode.style) return;
    labelNode.style.whiteSpace = 'nowrap';
    labelNode.style.width = 'max-content';
    labelNode.style.maxWidth = 'none';
  }

  function getSafeBBox(board: any): number[] {
    try {
      const bb = board.getBoundingBox();
      if (Array.isArray(bb) && bb.length === 4 && bb.every(Number.isFinite) && bb[2] > bb[0] && bb[1] > bb[3]) return bb.slice();
    } catch (e) {}
    return [-5, 5, 5, -5];
  }

  function detectLinearMode(object: any): LinearMode {
    if (object && object.__liaDgsLine) return 'line';
    if (object && object.__liaDgsRay) return 'ray';
    if (object && (object.__liaDgsVector || object.__liaDgsSegment)) return 'segment';
    const type = String(object && object.elType || '').toLowerCase();
    if (type === 'segment') return 'segment';
    if (type === 'line') {
      let straightFirst = true;
      let straightLast = true;
      try {
        if (typeof object.getAttribute === 'function') {
          const first = object.getAttribute('straightFirst');
          const last = object.getAttribute('straightLast');
          if (typeof first === 'boolean') straightFirst = first;
          if (typeof last === 'boolean') straightLast = last;
        }
      } catch (e) {}
      try {
        if (object.visProp) {
          if (typeof object.visProp.straightfirst === 'boolean') straightFirst = object.visProp.straightfirst;
          if (typeof object.visProp.straightlast === 'boolean') straightLast = object.visProp.straightlast;
        }
      } catch (e) {}
      if (straightFirst && straightLast) return 'line';
      if (!straightFirst && straightLast) return 'ray';
      return 'segment';
    }
    return 'segment';
  }

  function sourceFromObject(object: any, kind?: SourceKind, mode?: LinearMode): AnalysisSource | null {
    if (!object) return null;
    const type = String(object.elType || '').toLowerCase();
    if (kind === 'function' || (typeof object.Y === 'function' && (object.__liaDgsFunction || object.__liaPlotFunctionName || type === 'functiongraph'))) {
      return { object, kind: 'function' };
    }
    if (kind === 'circle' || object.__liaDgsCircle || type === 'circle' || typeof object.Radius === 'function') {
      return { object, kind: 'circle' };
    }
    if (kind === 'linear' || object.point1 && object.point2) {
      return { object, kind: 'linear', linearMode: mode || detectLinearMode(object) };
    }
    return null;
  }

  function candidateNames(object: any): string[] {
    return [
      object && object.__liaDgsFunctionName,
      object && object.__liaPlotFunctionName,
      object && object.__liaDgsSegmentName,
      object && object.__liaDgsLineName,
      object && object.__liaDgsRayName,
      object && object.__liaDgsVectorName,
      object && object.__liaDgsCircleName,
      object && object.__liaMacroRelationName,
      object && object.name
    ].map(cleanName).filter(Boolean);
  }

  function parsePointPairReference(value: unknown): [string, string] | null {
    const raw = unquote(String(value == null ? '' : value)).trim();
    if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
    const pointNames = splitTopLevel(raw.slice(1, -1), ';')
      .map(function(part) {
        return cleanName(parseMacroName(unquote(part)).name);
      })
      .filter(Boolean);
    if (pointNames.length !== 2 || namesEqual(pointNames[0], pointNames[1])) return null;
    return [pointNames[0], pointNames[1]];
  }

  function pointCandidateNames(point: any): string[] {
    return [
      point && point.__liaDgsPointName,
      point && point.__liaPointName,
      point && point.name
    ].map(cleanName).filter(Boolean);
  }

  function findPointByName(board: any, boardId: string, pointName: string): any | null {
    const registered = window.__points && window.__points[boardId];
    if (registered && typeof registered === 'object') {
      for (const key of Object.keys(registered)) {
        const point = registered[key];
        if (!point || point.board !== board || !namesEqual(key, pointName)) continue;
        if (typeof point.X === 'function' && typeof point.Y === 'function') return point;
      }
    }
    for (const point of getBoardObjects(board)) {
      if (!point || point.board !== board ||
          typeof point.X !== 'function' || typeof point.Y !== 'function') continue;
      if (pointCandidateNames(point).some(function(name) { return namesEqual(name, pointName); })) {
        return point;
      }
    }
    return null;
  }

  function findPointPairSource(
    board: any,
    boardId: string,
    sourceName: string
  ): AnalysisSource | null {
    const reference = parsePointPairReference(sourceName);
    if (!reference) return null;
    const first = findPointByName(board, boardId, reference[0]);
    const second = findPointByName(board, boardId, reference[1]);
    if (!first || !second || first === second) return null;
    const matches = getBoardObjects(board).filter(function(object) {
      if (!object || !object.point1 || !object.point2) return false;
      return (object.point1 === first && object.point2 === second) ||
        (object.point1 === second && object.point2 === first);
    });
    matches.sort(function(left, right) {
      const score = function(object: any): number {
        if (object && object.__liaDgsPolygonBorder) return 4;
        if (object && object.__liaDgsSegment) return 3;
        if (String(object && object.elType || '').toLowerCase() === 'segment') return 2;
        return 1;
      };
      return score(right) - score(left);
    });
    for (const object of matches) {
      const source = sourceFromObject(object, 'linear', detectLinearMode(object));
      if (source) return source;
    }
    return null;
  }

  function findSource(board: any, boardId: string, sourceName: string): AnalysisSource | null {
    const wanted = normalizeName(sourceName);
    if (!board || !wanted) return null;
    const pointPairSource = findPointPairSource(board, boardId, sourceName);
    if (pointPairSource) return pointPairSource;

    const plotEntries = window.__plotFunctionEntries || {};
    for (const key of Object.keys(plotEntries)) {
      const entry = plotEntries[key];
      if (!entry || entry.boardId !== boardId || !entry.graph || entry.graph.board !== board) continue;
      if (normalizeFunctionName(entry.name) === wanted || namesEqual(entry.name, sourceName)) {
        return { object: entry.graph, kind: 'function' };
      }
    }

    const linearEntries = window.__linearObjectEntries || {};
    for (const key of Object.keys(linearEntries)) {
      const entry = linearEntries[key];
      if (!entry || entry.boardId !== boardId || !entry.object || entry.board !== board) continue;
      const autoVectorName = entry.kind === 'vector'
        ? cleanName(String(entry.point1Name || '') + String(entry.point2Name || ''))
        : '';
      if (namesEqual(entry.objectName, sourceName) || (autoVectorName && namesEqual(autoVectorName, sourceName))) {
        return { object: entry.object, kind: 'linear', linearMode: entry.kind === 'line' ? 'line' : (entry.kind === 'ray' ? 'ray' : 'segment') };
      }
    }

    const distanceEntries = window.__distanceEntries || {};
    for (const key of Object.keys(distanceEntries)) {
      const entry = distanceEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board) continue;
      if (!namesEqual(entry.segmentName, sourceName)) continue;
      const segment = entry.segment || (Array.isArray(entry.segments) ? entry.segments[0] : null);
      if (segment) return { object: segment, kind: 'linear', linearMode: 'segment' };
    }

    const relationEntries = window.__relationObjectEntries || {};
    for (const key of Object.keys(relationEntries)) {
      const entry = relationEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board || entry.kind === 'midpoint') continue;
      if (namesEqual(entry.objectName, sourceName) && entry.object) {
        return { object: entry.object, kind: 'linear', linearMode: 'line' };
      }
    }

    const circleEntries = window.__circleEntries || {};
    for (const key of Object.keys(circleEntries)) {
      const entry = circleEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board || !entry.circle) continue;
      if (namesEqual(entry.name, sourceName)) return { object: entry.circle, kind: 'circle' };
    }

    const objects = getBoardObjects(board);
    for (const object of objects) {
      if (!candidateNames(object).some(function(name) { return namesEqual(name, sourceName); })) continue;
      const source = sourceFromObject(object);
      if (source) return source;
    }
    return null;
  }

  function getSourceY(source: AnalysisSource, x: number): number {
    if (!source || source.kind !== 'function') return NaN;
    try {
      const object = source.object;
      const evaluator = typeof object.__liaDgsFunctionEvaluator === 'function'
        ? object.__liaDgsFunctionEvaluator
        : (typeof object.Y === 'function' ? object.Y.bind(object) : null);
      if (!evaluator) return NaN;
      const value = Number(evaluator(x));
      return Number.isFinite(value) ? value : NaN;
    } catch (e) {
      return NaN;
    }
  }

  function getFunctionRoots(board: any, evaluatorSource: { Y: (x: number) => number }): number[] {
    const bbox = getSafeBBox(board);
    const xmin = Number(bbox[0]);
    const xmax = Number(bbox[2]);
    const span = xmax - xmin;
    if (!Number.isFinite(span) || span <= 0) return [];
    const evaluate = (x: number) => {
      try {
        const value = Number(evaluatorSource.Y(x));
        return Number.isFinite(value) ? value : NaN;
      } catch (e) { return NaN; }
    };
    const samples = Math.max(500, Math.min(1600, Math.round(Number(board.canvasWidth || 600) * 1.5)));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let index = 0; index <= samples; index += 1) {
      const x = xmin + span * index / samples;
      xs.push(x);
      ys.push(evaluate(x));
    }
    const roots: number[] = [];
    const xTolerance = Math.max(1e-9, span * 1e-8);
    const yTolerance = 1e-7;
    const addRoot = (value: number) => {
      if (!Number.isFinite(value) || value < xmin - xTolerance || value > xmax + xTolerance) return;
      if (Math.abs(evaluate(value)) > yTolerance) return;
      if (!roots.some((root) => Math.abs(root - value) <= Math.max(xTolerance * 10, span / samples * 0.15))) {
        roots.push(value);
      }
    };
    for (let index = 0; index < samples; index += 1) {
      const leftY = ys[index];
      const rightY = ys[index + 1];
      if (!Number.isFinite(leftY) || !Number.isFinite(rightY)) continue;
      if (Math.abs(leftY) <= yTolerance) addRoot(xs[index]);
      if (leftY * rightY < 0) {
        let left = xs[index];
        let right = xs[index + 1];
        let fLeft = leftY;
        for (let iteration = 0; iteration < 60; iteration += 1) {
          const middle = (left + right) / 2;
          const fMiddle = evaluate(middle);
          if (!Number.isFinite(fMiddle)) break;
          if (Math.abs(fMiddle) <= yTolerance || right - left <= xTolerance) {
            left = middle;
            right = middle;
            break;
          }
          if (fLeft * fMiddle <= 0) right = middle;
          else { left = middle; fLeft = fMiddle; }
        }
        addRoot((left + right) / 2);
      }
    }
    if (Number.isFinite(ys[samples]) && Math.abs(ys[samples]) <= yTolerance) addRoot(xs[samples]);
    for (let index = 1; index < samples; index += 1) {
      if (!Number.isFinite(ys[index]) || Math.abs(ys[index]) > Math.abs(ys[index - 1]) ||
          Math.abs(ys[index]) > Math.abs(ys[index + 1])) continue;
      let x = xs[index];
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const value = evaluate(x);
        const h = Math.max(1e-7, span * 1e-6);
        const derivative = (evaluate(x + h) - evaluate(x - h)) / (2 * h);
        if (!Number.isFinite(value) || !Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
        const next = x - value / derivative;
        if (!Number.isFinite(next) || next < xmin || next > xmax) break;
        const delta = Math.abs(next - x);
        x = next;
        if (delta <= xTolerance) break;
      }
      addRoot(x);
    }
    return roots.sort((a, b) => a - b);
  }

  function getLineData(source: AnalysisSource | null): { x: number; y: number; dx: number; dy: number; mode: LinearMode; object: any } | null {
    if (!source || source.kind !== 'linear') return null;
    const object = source.object;
    try {
      const x1 = Number(object.point1.X());
      const y1 = Number(object.point1.Y());
      const x2 = Number(object.point2.X());
      const y2 = Number(object.point2.Y());
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (![x1, y1, dx, dy].every(Number.isFinite) || Math.hypot(dx, dy) <= 1e-12) return null;
      return { x: x1, y: y1, dx, dy, mode: source.linearMode || detectLinearMode(object), object };
    } catch (e) { return null; }
  }

  function isPointOnLinearSource(source: AnalysisSource, x: number, y: number): boolean {
    const line = getLineData(source);
    if (!line) return false;
    const cross = line.dx * (y - line.y) - line.dy * (x - line.x);
    const scale = Math.max(1, Math.hypot(line.dx, line.dy));
    if (Math.abs(cross) > scale * 1e-7) return false;
    if (line.mode === 'line') return true;
    const ratio = ((x - line.x) * line.dx + (y - line.y) * line.dy) / (line.dx * line.dx + line.dy * line.dy);
    if (line.mode === 'ray') return ratio >= -1e-8;
    return ratio >= -1e-8 && ratio <= 1 + 1e-8;
  }

  function getCircleData(source: AnalysisSource | null): { x: number; y: number; radius: number } | null {
    if (!source || source.kind !== 'circle') return null;
    const object = source.object;
    try {
      const center = object.center || object.midpoint || object.__liaDgsCircleCenter || (Array.isArray(object.parents) ? object.parents[0] : null);
      const x = Number(center && center.X ? center.X() : object.center && object.center.X());
      const y = Number(center && center.Y ? center.Y() : object.center && object.center.Y());
      let radius = NaN;
      if (object.__liaDgsCircleRadiusPoint) {
        radius = Math.hypot(
          Number(object.__liaDgsCircleRadiusPoint.X()) - x,
          Number(object.__liaDgsCircleRadiusPoint.Y()) - y
        );
      } else if (typeof object.Radius === 'function') {
        radius = Number(object.Radius());
      }
      return [x, y, radius].every(Number.isFinite) && radius > 1e-12 ? { x, y, radius } : null;
    } catch (e) { return null; }
  }

  function getOrdinateIntercept(board: any, source: AnalysisSource): AnalysisPosition[] {
    const bbox = getSafeBBox(board);
    if (0 < Number(bbox[0]) || 0 > Number(bbox[2])) return [];
    if (source.kind === 'function') {
      const y = getSourceY(source, 0);
      return Number.isFinite(y) ? [{ x: 0, y }] : [];
    }
    const line = getLineData(source);
    if (!line) return [];
    if (Math.abs(line.dx) <= 1e-12) return [];
    const ratio = (0 - line.x) / line.dx;
    if (line.mode === 'ray' && ratio < -1e-8) return [];
    if (line.mode === 'segment' && (ratio < -1e-8 || ratio > 1 + 1e-8)) return [];
    const y = line.y + ratio * line.dy;
    return Number.isFinite(y) ? [{ x: 0, y }] : [];
  }

  function getIntersectionPositions(board: any, first: AnalysisSource, second: AnalysisSource): AnalysisPosition[] {
    if (!first || !second || first.object === second.object) return [];
    const bbox = getSafeBBox(board);
    const span = Math.max(1e-9, Number(bbox[2]) - Number(bbox[0]));
    const tolerance = span * 1e-7;
    const positions: AnalysisPosition[] = [];
    const add = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) ||
          x < Number(bbox[0]) - tolerance || x > Number(bbox[2]) + tolerance ||
          y > Number(bbox[1]) + tolerance || y < Number(bbox[3]) - tolerance) return;
      if (!positions.some((point) => Math.hypot(point.x - x, point.y - y) <= tolerance * 4)) {
        positions.push({ x, y });
      }
    };

    if (first.kind === 'function' || second.kind === 'function') {
      const graph = first.kind === 'function' ? first : second;
      const other = first.kind === 'function' ? second : first;
      const otherLine = getLineData(other);
      const otherCircle = getCircleData(other);
      const difference = {
        Y: (x: number) => {
          const y = getSourceY(graph, x);
          if (!Number.isFinite(y)) return NaN;
          if (other.kind === 'function') return y - getSourceY(other, x);
          if (otherLine) return otherLine.dy * (x - otherLine.x) - otherLine.dx * (y - otherLine.y);
          if (otherCircle) {
            return (x - otherCircle.x) * (x - otherCircle.x) +
              (y - otherCircle.y) * (y - otherCircle.y) - otherCircle.radius * otherCircle.radius;
          }
          return NaN;
        }
      };
      getFunctionRoots(board, difference).forEach((x) => {
        const y = getSourceY(graph, x);
        if (otherLine && !isPointOnLinearSource(other, x, y)) return;
        add(x, y);
      });
      return positions.sort((a, b) => a.x - b.x || a.y - b.y);
    }

    const firstLine = getLineData(first);
    const secondLine = getLineData(second);
    const firstCircle = getCircleData(first);
    const secondCircle = getCircleData(second);
    if (firstLine && secondLine) {
      const determinant = firstLine.dx * secondLine.dy - firstLine.dy * secondLine.dx;
      if (Math.abs(determinant) <= 1e-12) return [];
      const offsetX = secondLine.x - firstLine.x;
      const offsetY = secondLine.y - firstLine.y;
      const ratio = (offsetX * secondLine.dy - offsetY * secondLine.dx) / determinant;
      const x = firstLine.x + ratio * firstLine.dx;
      const y = firstLine.y + ratio * firstLine.dy;
      if (isPointOnLinearSource(first, x, y) && isPointOnLinearSource(second, x, y)) add(x, y);
      return positions;
    }

    const lineSource = firstLine ? first : (secondLine ? second : null);
    const line = firstLine || secondLine;
    const circle = firstCircle || secondCircle;
    if (line && circle && lineSource) {
      const offsetX = line.x - circle.x;
      const offsetY = line.y - circle.y;
      const a = line.dx * line.dx + line.dy * line.dy;
      const b = 2 * (offsetX * line.dx + offsetY * line.dy);
      const c = offsetX * offsetX + offsetY * offsetY - circle.radius * circle.radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < -1e-10) return [];
      const root = Math.sqrt(Math.max(0, discriminant));
      const ratios = root <= 1e-10 ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
      ratios.forEach((ratio) => {
        const x = line.x + ratio * line.dx;
        const y = line.y + ratio * line.dy;
        if (isPointOnLinearSource(lineSource, x, y)) add(x, y);
      });
      return positions.sort((a, b) => a.x - b.x || a.y - b.y);
    }

    if (firstCircle && secondCircle) {
      const dx = secondCircle.x - firstCircle.x;
      const dy = secondCircle.y - firstCircle.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-12 || distance > firstCircle.radius + secondCircle.radius + tolerance ||
          distance < Math.abs(firstCircle.radius - secondCircle.radius) - tolerance) return [];
      const along = (
        firstCircle.radius * firstCircle.radius - secondCircle.radius * secondCircle.radius + distance * distance
      ) / (2 * distance);
      const height = Math.sqrt(Math.max(0, firstCircle.radius * firstCircle.radius - along * along));
      const baseX = firstCircle.x + along * dx / distance;
      const baseY = firstCircle.y + along * dy / distance;
      const perpendicularX = -dy / distance;
      const perpendicularY = dx / distance;
      add(baseX + height * perpendicularX, baseY + height * perpendicularY);
      if (height > tolerance) add(baseX - height * perpendicularX, baseY - height * perpendicularY);
    }
    return positions.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  function removeBoardHandlers(entry: ObjectAnalysisEntry): void {
    (entry.handlers || []).forEach(function(handler) {
      try { if (entry.board && typeof entry.board.off === 'function') entry.board.off(handler.event, handler.fn); } catch (e) {}
    });
    entry.handlers = [];
  }

  function detachEntryFromSources(entry: ObjectAnalysisEntry): void {
    if (!entry) return;
    const first = entry.source && entry.source.object;
    const second = entry.source2 && entry.source2.object;
    if (entry.kind === 'ordinate-intercept') {
      if (first && first.__liaDgsYInterceptConstruction === entry) {
        delete first.__liaDgsYInterceptConstruction;
      }
      return;
    }
    [first, second].forEach(function(source) {
      if (!source || !Array.isArray(source.__liaDgsIntersectionConstructions)) return;
      source.__liaDgsIntersectionConstructions = source.__liaDgsIntersectionConstructions
        .filter(function(candidate: any) { return candidate !== entry; });
    });
  }

  function attachEntryToSources(entry: ObjectAnalysisEntry): void {
    if (!entry || !entry.source || !entry.source.object) return;
    const first = entry.source.object;
    const second = entry.source2 && entry.source2.object;
    entry.__liaDgsMacroManaged = true;
    entry.__liaDgsSource = first;
    entry.__liaDgsSource2 = second || null;
    if (entry.kind === 'ordinate-intercept') {
      first.__liaDgsYInterceptConstruction = entry;
      return;
    }
    [first, second].forEach(function(source) {
      if (!source) return;
      const constructions = Array.isArray(source.__liaDgsIntersectionConstructions)
        ? source.__liaDgsIntersectionConstructions
        : [];
      source.__liaDgsIntersectionConstructions = constructions.includes(entry)
        ? constructions
        : constructions.concat(entry);
    });
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__objectAnalysisPointEntries[key] as ObjectAnalysisEntry | undefined;
    if (!entry) return;
    if (entry.updateRAF != null) {
      try { cancelAnimationFrame(entry.updateRAF); } catch (e) {}
      entry.updateRAF = undefined;
    }
    removeBoardHandlers(entry);
    detachEntryFromSources(entry);
    entry.points.forEach(function(point) {
      const name = String(point && point.__liaObjectAnalysisPointName || '');
      try {
        if (name && window.__points && window.__points[entry.boardId] && window.__points[entry.boardId][name] === point) {
          delete window.__points[entry.boardId][name];
        }
      } catch (e) {}
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    delete window.__objectAnalysisPointEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function applyPointVisual(entry: ObjectAnalysisEntry, point: any, index: number): void {
    const labelColor = getNeutralColor();
    const objectVisible = pointObjectVisible(entry, index);
    const labelVisible = objectVisible && (pointNameVisible(entry, index) || pointValueVisible(entry, index));
    try {
      point.setAttribute({
        visible: objectVisible,
        strokeColor: entry.color,
        fillColor: entry.color,
        highlightStrokeColor: entry.color,
        highlightFillColor: entry.color,
        label: {
          strokeColor: labelColor,
          fillColor: labelColor,
          fontSize: 24,
          parse: false,
          useMathJax: true,
          cssStyle: 'white-space: nowrap; width: max-content; max-width: none;'
        }
      });
    } catch (e) {}
    try {
      if (point.label && typeof point.label.setText === 'function') {
        point.label.setText(function() { return pointLabelText(entry, index); });
      }
      if (point.label && typeof point.label.setAttribute === 'function') {
        point.label.setAttribute({
          visible: labelVisible,
          strokeColor: labelColor,
          fillColor: labelColor,
          fontSize: 24,
          parse: false,
          useMathJax: true,
          cssStyle: 'white-space: nowrap; width: max-content; max-width: none;'
        });
      }
      if (point.label && labelVisible && typeof point.label.showElement === 'function') point.label.showElement();
      if (point.label && !labelVisible && typeof point.label.hideElement === 'function') point.label.hideElement();
      keepPointLabelOnOneLine(point);
      requestAnimationFrame(function() { keepPointLabelOnOneLine(point); });
    } catch (e) {}
    point.__liaPointVisual = { color: entry.color, opacity: 1, hasExplicitColor: entry.hasExplicitColor };
    point.__liaDgsMacroManaged = true;
    point.__liaDgsPointName = pointNameForIndex(entry, index);
    point.__liaDgsRootPoint = false;
    point.__liaDgsExtremumPoint = false;
    point.__liaDgsInflectionPoint = false;
    point.__liaDgsYInterceptPoint = entry.kind === 'ordinate-intercept';
    point.__liaDgsIntersectionPoint = entry.kind === 'intersections';
    point.__liaDgsAnalysisConstruction = entry;
    point.__liaDgsYInterceptConstruction = entry.kind === 'ordinate-intercept' ? entry : undefined;
    point.__liaDgsIntersectionConstruction = entry.kind === 'intersections' ? entry : undefined;
    point.__liaDgsRootHolder = entry.holders[index];
    point.__liaDgsLanguage = entry.language;
    point.__liaDgsColor = entry.color;
    point.__liaDgsTextColor = labelColor;
    point.__liaDgsLineColor = entry.color;
    point.__liaDgsFillColor = entry.color;
    point.__liaDgsShowName = pointNameVisible(entry, index);
    point.__liaDgsShowValue = pointValueVisible(entry, index);
    point.__liaDgsShowObject = objectVisible;
    point.__liaDgsOpacity = 1;
    point.__liaDgsFormatFontSize = 24;
  }

  function createAnalysisPoint(entry: ObjectAnalysisEntry, index: number): any | null {
    const holder = entry.holders[index];
    const name = entry.names[index];
    if (!holder || !name) return null;
    try {
      const point = entry.board.create('point', [
        function() { return holder.x; },
        function() { return holder.y; }
      ], {
        name: '\\(' + texName(name) + '\\)',
        fixed: true,
        withLabel: pointNameVisible(entry, index) || pointValueVisible(entry, index),
        visible: pointObjectVisible(entry, index),
        showInfobox: false,
        strokeColor: entry.color,
        fillColor: entry.color,
        highlightStrokeColor: entry.color,
        highlightFillColor: entry.color,
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        face: 'x',
        size: 7,
        label: {
          strokeColor: getNeutralColor(),
          fillColor: getNeutralColor(),
          fontSize: 24,
          parse: false,
          useMathJax: true,
          cssStyle: 'white-space: nowrap; width: max-content; max-width: none;'
        }
      });
      point.__liaObjectAnalysisPoint = true;
      point.__liaObjectAnalysisKind = entry.kind;
      point.__liaObjectAnalysisPointName = name;
      point.__liaDgsPointName = name;
      point.__liaDgsYInterceptPoint = entry.kind === 'ordinate-intercept';
      point.__liaDgsIntersectionPoint = entry.kind === 'intersections';
      point.__liaDgsShowName = pointNameVisible(entry, index);
      point.__liaDgsShowValue = pointValueVisible(entry, index);
      point.__liaDgsShowObject = pointObjectVisible(entry, index);
      point.__liaDgsColor = entry.color;
      point.__liaDgsLineColor = entry.color;
      point.__liaDgsFillColor = entry.color;
      point.__liaDgsTextColor = getNeutralColor();
      window.__points = window.__points || {};
      window.__points[entry.boardId] = window.__points[entry.boardId] || {};
      window.__points[entry.boardId][name] = point;
      applyPointVisual(entry, point, index);
      return point;
    } catch (e) {
      return null;
    }
  }

  function syncEntryPoints(entry: ObjectAnalysisEntry, positions: AnalysisPosition[]): boolean {
    let changed = false;
    const names = positions.map(function(_position, index) { return pointNameForIndex(entry, index); });
    const namesChanged = names.length !== entry.names.length || names.some(function(name, index) { return entry.names[index] !== name; });
    if (namesChanged || positions.length !== entry.points.length) {
      entry.points.forEach(function(point) {
        const name = String(point && point.__liaObjectAnalysisPointName || '');
        try {
          if (name && window.__points && window.__points[entry.boardId] && window.__points[entry.boardId][name] === point) {
            delete window.__points[entry.boardId][name];
          }
        } catch (e) {}
        try { entry.board.removeObject(point); } catch (e) {}
      });
      entry.names = names;
      entry.holders = positions.map(function(position) { return { x: position.x, y: position.y }; });
      entry.points = [];
      for (let index = 0; index < positions.length; index += 1) {
        const point = createAnalysisPoint(entry, index);
        if (point) entry.points.push(point);
      }
      return true;
    }
    positions.forEach(function(position, index) {
      const holder = entry.holders[index];
      if (!holder) return;
      if (Math.abs(Number(holder.x) - position.x) > 1e-10 || Math.abs(Number(holder.y) - position.y) > 1e-10) {
        holder.x = position.x;
        holder.y = position.y;
        changed = true;
      }
      applyPointVisual(entry, entry.points[index], index);
    });
    return changed;
  }

  function updateEntry(entry: ObjectAnalysisEntry): boolean {
    if (!entry || entry.updating) return false;
    entry.updating = true;
    try {
      const source = findSource(entry.board, entry.boardId, entry.sourceName);
      const source2 = entry.kind === 'intersections'
        ? findSource(entry.board, entry.boardId, entry.source2Name)
        : null;
      if (!source || (entry.kind === 'intersections' && !source2)) {
        detachEntryFromSources(entry);
        const changed = syncEntryPoints(entry, []);
        if (changed) {
          try { if (entry.board && typeof entry.board.update === 'function') entry.board.update(); } catch (e) {}
        }
        return false;
      }
      if (entry.kind === 'ordinate-intercept' && source.kind !== 'function' && source.kind !== 'linear') {
        detachEntryFromSources(entry);
        const changed = syncEntryPoints(entry, []);
        if (changed) {
          try { if (entry.board && typeof entry.board.update === 'function') entry.board.update(); } catch (e) {}
        }
        return false;
      }
      const sourcesChanged = entry.source?.object !== source.object ||
        entry.source2?.object !== source2?.object;
      if (sourcesChanged) detachEntryFromSources(entry);
      entry.source = source;
      entry.source2 = source2;
      attachEntryToSources(entry);
      const positions = entry.kind === 'intersections' && source2
        ? getIntersectionPositions(entry.board, source, source2)
        : getOrdinateIntercept(entry.board, source);
      const changed = syncEntryPoints(entry, positions);
      if (changed) {
        try { if (entry.board && typeof entry.board.update === 'function') entry.board.update(); } catch (e) {}
      }
      return true;
    } finally {
      entry.updating = false;
    }
  }

  function scheduleEntryUpdate(entry: ObjectAnalysisEntry): void {
    if (!entry || entry.updateRAF != null) return;
    entry.updateRAF = requestAnimationFrame(function() {
      entry.updateRAF = undefined;
      updateEntry(entry);
    });
  }

  function bindBoardHandlers(entry: ObjectAnalysisEntry): void {
    removeBoardHandlers(entry);
    if (!entry.board || typeof entry.board.on !== 'function') return;
    const events = ['move', 'boundingbox', 'update'];
    entry.handlers = events.map(function(event) {
      const fn = function() { scheduleEntryUpdate(entry); };
      try { entry.board.on(event, fn); } catch (e) {}
      return { event, fn };
    });
  }

  window.__scheduleObjectAnalysisPointsForBoard = function(boardId?: string): void {
    Object.keys(window.__objectAnalysisPointEntries || {}).forEach(function(key) {
      const entry = window.__objectAnalysisPointEntries[key] as ObjectAnalysisEntry;
      if (!entry || (boardId && entry.boardId !== boardId)) return;
      scheduleEntryUpdate(entry);
    });
  };

  window.renderObjectAnalysisPointsFromSpec = function(uid: string, spec: string, kind: string, language?: string): boolean {
    const cfg = parseObjectAnalysisSpec(spec, kind, language);
    const key = entryKey(uid);
    if (!uid || !cfg.boardId || !cfg.sourceName || (cfg.kind === 'intersections' && !cfg.source2Name)) {
      removeEntry(uid);
      return false;
    }
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }
    const source = findSource(board, cfg.boardId, cfg.sourceName);
    const source2 = cfg.kind === 'intersections' ? findSource(board, cfg.boardId, cfg.source2Name) : null;
    if (!source || (cfg.kind === 'intersections' && !source2) ||
        (cfg.kind === 'ordinate-intercept' && source.kind !== 'function' && source.kind !== 'linear')) {
      removeEntry(uid);
      return false;
    }
    const old = window.__objectAnalysisPointEntries[key] as ObjectAnalysisEntry | undefined;
    if (old && old.board === board && old.kind === cfg.kind && old.sourceName === cfg.sourceName &&
        old.source2Name === cfg.source2Name && old.prefix === cfg.prefix && old.language === cfg.language &&
        old.showValue === cfg.showValue && old.showName === cfg.showName &&
        old.explicitNames.join('\n') === cfg.explicitNames.join('\n') &&
        old.explicitNameVisibility.join('\n') === cfg.explicitNameVisibility.join('\n') &&
        (old.explicitValueVisibility || []).join('\n') === cfg.explicitValueVisibility.join('\n') &&
        (old.explicitObjectVisibility || []).join('\n') === cfg.explicitObjectVisibility.join('\n')) {
      const sourcesChanged = old.source?.object !== source.object ||
        old.source2?.object !== source2?.object;
      if (sourcesChanged) detachEntryFromSources(old);
      old.source = source;
      old.source2 = source2;
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      attachEntryToSources(old);
      updateEntry(old);
      return true;
    }
    removeEntry(uid);
    const entry: ObjectAnalysisEntry = {
      uid: String(uid),
      key,
      boardId: cfg.boardId,
      kind: cfg.kind,
      sourceName: cfg.sourceName,
      source2Name: cfg.source2Name,
      color: cfg.color,
      hasExplicitColor: cfg.hasExplicitColor,
      prefix: cfg.prefix,
      explicitNames: cfg.explicitNames.slice(),
      explicitNameVisibility: cfg.explicitNameVisibility.slice(),
      explicitValueVisibility: cfg.explicitValueVisibility.slice(),
      explicitObjectVisibility: cfg.explicitObjectVisibility.slice(),
      showName: cfg.showName,
      language: cfg.language,
      showValue: cfg.showValue,
      board,
      source,
      source2,
      points: [],
      holders: [],
      names: [],
      __liaDgsMacroManaged: true,
      __liaDgsSource: source.object,
      __liaDgsSource2: source2 ? source2.object : null
    };
    window.__objectAnalysisPointEntries[key] = entry;
    attachEntryToSources(entry);
    bindBoardHandlers(entry);
    updateEntry(entry);
    try { board.update(); } catch (e) {}
    return true;
  };

  window.__bootstrapObjectAnalysisPoints = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="object-analysis-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^object-analysis-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const kind = String(node.dataset.kind || 'ordinate-intercept');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderObjectAnalysisPointsFromSpec ||
          !window.renderObjectAnalysisPointsFromSpec(uid, spec, kind, language)) {
        pending = true;
      }
    });
    Object.keys(window.__objectAnalysisPointEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingObjectAnalysisPoints = pending;
  };

  window.__scheduleBootstrapObjectAnalysisPoints = function(): void {
    if (window.__bootstrapObjectAnalysisPointsRAF) return;
    window.__bootstrapObjectAnalysisPointsRAF = requestAnimationFrame(function() {
      window.__bootstrapObjectAnalysisPointsRAF = 0;
      try { if (window.__bootstrapObjectAnalysisPoints) window.__bootstrapObjectAnalysisPoints(); } catch (e) {}
    });
  };

  function containsObjectAnalysisSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^object-analysis-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="object-analysis-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^object-analysis-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsObjectAnalysisSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapObjectAnalysisPoints) window.__scheduleBootstrapObjectAnalysisPoints();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-kind', 'data-language'] });
  } catch (e) {}

  if (window.__registerLiaThemeListener) window.__registerLiaThemeListener(function() {
    Object.keys(window.__objectAnalysisPointEntries || {}).forEach(function(key) {
      const entry = window.__objectAnalysisPointEntries[key] as ObjectAnalysisEntry;
      if (!entry) return;
      entry.points.forEach(function(point, index) { applyPointVisual(entry, point, index); });
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__objectAnalysisPointsRetryInterval = setInterval(function() {
    if (hasPendingObjectAnalysisPoints && window.__scheduleBootstrapObjectAnalysisPoints) {
      window.__scheduleBootstrapObjectAnalysisPoints();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapObjectAnalysisPoints) window.__scheduleBootstrapObjectAnalysisPoints();
  });
}
