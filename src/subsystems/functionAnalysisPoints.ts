// Function analysis point subsystem (@Zeros/@Nullstellen, @Extrema/@Extrempunkte,
// @InflectionPoints/@Wendepunkte macros). Creates dynamic points for function
// roots, extrema, and inflection points in the current visible x-range.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { formatNumber } from '../shared/format';
import { mayDisplayDgsValues } from '../shared/dgsPermissions';

type AnalysisKind = 'roots' | 'extrema' | 'inflections';

interface AnalysisPointConfig {
  boardId: string;
  kind: AnalysisKind;
  sourceName: string;
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

interface AnalysisPosition {
  x: number;
  y: number;
}

interface AnalysisEntry {
  uid: string;
  key: string;
  boardId: string;
  kind: AnalysisKind;
  sourceName: string;
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
  source: any;
  points: any[];
  holders: AnalysisPosition[];
  names: string[];
  updateRAF?: number;
  updating?: boolean;
  handlers?: Array<{ event: string; fn: () => void }>;
  __liaDgsMacroManaged?: boolean;
}

export function init(): void {
  if (window.__functionAnalysisPointsReady) {
    try { if (window.__scheduleBootstrapFunctionAnalysisPoints) window.__scheduleBootstrapFunctionAnalysisPoints(); } catch (e) {}
    return;
  }
  window.__functionAnalysisPointsReady = true;
  window.__functionAnalysisPointEntries = window.__functionAnalysisPointEntries || {};
  initThemeSync();

  let hasPendingFunctionAnalysisPoints = false;

  function normalizeKind(kind: unknown): AnalysisKind {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'extrema' || value === 'extrempunkte' || value === 'extremstellen') return 'extrema';
    if (value === 'inflections' || value === 'inflectionpoints' || value === 'wendepunkte') return 'inflections';
    return 'roots';
  }

  function defaultPrefix(kind: AnalysisKind, language: 'de' | 'en'): string {
    if (kind === 'roots') return language === 'de' ? 'N' : 'Z';
    if (kind === 'inflections') return language === 'de' ? 'W' : 'I';
    return 'E';
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

  function parseAnalysisSpec(spec: string, kind: string, language?: string): AnalysisPointConfig {
    const analysisKind = normalizeKind(kind);
    const languageValue = String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de';
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const explicitColor = String(parts[2] || '').trim();
    const trailingOptions = parts.slice(3)
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
    return 'function-analysis-' + String(uid || '');
  }

  function cleanName(value: unknown): string {
    let name = String(value == null ? '' : value).trim();
    if (name.startsWith('\\(') && name.endsWith('\\)')) name = name.slice(2, -2).trim();
    else if (name.startsWith('$') && name.endsWith('$')) name = name.slice(1, -1).trim();
    name = name.replace(/^\\overrightarrow\{(.+)\}$/, '$1');
    name = name.replace(/\s*\(\s*x\s*\)\s*$/i, '').trim();
    return name;
  }

  function normalizeFunctionName(value: unknown): string {
    const name = cleanName(value).toLowerCase();
    return /^[a-z][a-z0-9]*$/.test(name) ? name : '';
  }

  function texName(nameValue: string): string {
    const raw = cleanName(nameValue);
    const match = raw.match(/^(.+?)_([^{}]+)$/);
    return match ? match[1] + '_{' + match[2] + '}' : raw;
  }


  function pointLabelText(entry: AnalysisEntry, index: number): string {
    const name = texName(entry.names[index] || pointNameForIndex(entry, index));
    const showName = pointNameVisible(entry, index);
    if (!pointValueRendered(entry, index)) return showName ? '\\(' + name + '\\)' : '';
    const holder = entry.holders[index] || { x: NaN, y: NaN };
    if (entry.kind === 'roots') {
      return '\\(' + (showName ? name + '\\; ' : '') + 'x = ' + formatNumber(holder.x, entry.language) + '\\)';
    }
    return '\\(' + (showName ? name + '\\; ' : '') + '(' + formatNumber(holder.x, entry.language) + '\\mid ' +
      formatNumber(holder.y, entry.language) + ')\\)';
  }

  function pointNameVisible(entry: AnalysisEntry | AnalysisPointConfig, index: number): boolean {
    if (entry.showName === false) return false;
    if (entry.explicitNames[index]) return entry.explicitNameVisibility[index] !== false;
    return true;
  }

  function pointValueVisible(entry: AnalysisEntry | AnalysisPointConfig, index: number): boolean {
    if (Array.isArray(entry.explicitValueVisibility) &&
        typeof entry.explicitValueVisibility[index] === 'boolean') {
      return entry.explicitValueVisibility[index];
    }
    return entry.showValue;
  }

  function pointValueRendered(entry: AnalysisEntry | AnalysisPointConfig, index: number): boolean {
    return mayDisplayDgsValues(entry.boardId) && pointValueVisible(entry, index);
  }

  function pointObjectVisible(entry: AnalysisEntry | AnalysisPointConfig, index: number): boolean {
    if (Array.isArray(entry.explicitObjectVisibility) &&
        typeof entry.explicitObjectVisibility[index] === 'boolean') {
      return entry.explicitObjectVisibility[index];
    }
    return true;
  }

  function keepPointLabelOnOneLine(point: any): void {
    const labelNode = point && point.label && point.label.rendNode as HTMLElement | undefined;
    if (!labelNode || !labelNode.style) return;
    labelNode.style.whiteSpace = 'nowrap';
    labelNode.style.width = 'max-content';
    labelNode.style.maxWidth = 'none';
  }

  function pointNameForIndex(entry: AnalysisEntry | AnalysisPointConfig, index: number): string {
    const explicit = entry.explicitNames[index];
    if (explicit) return explicit;
    const prefix = cleanName(entry.prefix) || defaultPrefix(entry.kind, entry.language);
    return prefix + '_' + (index + 1);
  }

  function getSafeBBox(board: any): number[] {
    try {
      const bb = board.getBoundingBox();
      if (Array.isArray(bb) && bb.length === 4 && bb.every(Number.isFinite) && bb[2] > bb[0]) return bb.slice();
    } catch (e) {}
    return [-5, 5, 5, -5];
  }

  function getSourceY(source: any, x: number): number {
    try {
      const evaluator = typeof source.__liaDgsFunctionEvaluator === 'function'
        ? source.__liaDgsFunctionEvaluator
        : (typeof source.Y === 'function' ? source.Y.bind(source) : null);
      if (!evaluator) return NaN;
      const value = Number(evaluator(x));
      return Number.isFinite(value) ? value : NaN;
    } catch (e) {
      return NaN;
    }
  }

  function getFunctionRoots(board: any, source: any): number[] {
    const bbox = getSafeBBox(board);
    const xmin = Number(bbox[0]);
    const xmax = Number(bbox[2]);
    const span = xmax - xmin;
    if (!Number.isFinite(span) || span <= 0) return [];
    const evaluate = (x: number) => getSourceY(source, x);
    const samples = Math.max(500, Math.min(1600, Math.round(Number(board.canvasWidth || 600) * 1.5)));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let index = 0; index <= samples; index += 1) {
      const x = xmin + span * index / samples;
      xs.push(x);
      ys.push(evaluate(x));
    }
    const finiteValues = ys.filter(Number.isFinite);
    if (finiteValues.length && finiteValues.filter((value) => Math.abs(value) <= 1e-7).length > finiteValues.length * 0.9) return [];
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

  function getExtrema(board: any, source: any): AnalysisPosition[] {
    const bbox = getSafeBBox(board);
    const span = Number(bbox[2]) - Number(bbox[0]);
    if (!Number.isFinite(span) || span <= 0) return [];
    const evaluate = (x: number) => getSourceY(source, x);
    const derivativeStep = Math.max(1e-6, span * 1e-5);
    const derivativeSource = {
      Y: (x: number) => {
        const left = evaluate(x - derivativeStep);
        const right = evaluate(x + derivativeStep);
        return Number.isFinite(left) && Number.isFinite(right) ? (right - left) / (2 * derivativeStep) : NaN;
      }
    };
    const candidates = getFunctionRoots(board, derivativeSource);
    const sideStep = Math.max(derivativeStep * 8, span / 4000);
    const result: AnalysisPosition[] = [];
    candidates.forEach((x) => {
      const y = evaluate(x);
      const left = evaluate(x - sideStep);
      const right = evaluate(x + sideStep);
      if (![x, y, left, right].every(Number.isFinite)) return;
      const scale = Math.max(1, Math.abs(y), Math.abs(left), Math.abs(right));
      const tolerance = scale * 1e-12;
      const minimum = y <= left + tolerance && y <= right + tolerance && (y < left - tolerance || y < right - tolerance);
      const maximum = y >= left - tolerance && y >= right - tolerance && (y > left + tolerance || y > right + tolerance);
      if (minimum || maximum) result.push({ x, y });
    });
    return result;
  }

  function getInflections(board: any, source: any): AnalysisPosition[] {
    const bbox = getSafeBBox(board);
    const span = Number(bbox[2]) - Number(bbox[0]);
    if (!Number.isFinite(span) || span <= 0) return [];
    const evaluate = (x: number) => getSourceY(source, x);
    const derivativeStep = Math.max(1e-5, span * 1e-4);
    const secondDerivative = (x: number) => {
      const left = evaluate(x - derivativeStep);
      const center = evaluate(x);
      const right = evaluate(x + derivativeStep);
      return [left, center, right].every(Number.isFinite)
        ? (right - 2 * center + left) / (derivativeStep * derivativeStep)
        : NaN;
    };
    const candidates = getFunctionRoots(board, { Y: secondDerivative });
    const sideStep = Math.max(derivativeStep * 8, span / 2000);
    const result: AnalysisPosition[] = [];
    candidates.forEach((x) => {
      const y = evaluate(x);
      const leftCurvature = secondDerivative(x - sideStep);
      const rightCurvature = secondDerivative(x + sideStep);
      if (![x, y, leftCurvature, rightCurvature].every(Number.isFinite)) return;
      const scale = Math.max(1, Math.abs(leftCurvature), Math.abs(rightCurvature));
      const tolerance = scale * 1e-10;
      const changesConcavity =
        (leftCurvature < -tolerance && rightCurvature > tolerance) ||
        (leftCurvature > tolerance && rightCurvature < -tolerance);
      if (changesConcavity) result.push({ x, y });
    });
    return result;
  }

  function getPositions(entry: Pick<AnalysisEntry, 'kind' | 'board' | 'source'>): AnalysisPosition[] {
    if (entry.kind === 'extrema') return getExtrema(entry.board, entry.source);
    if (entry.kind === 'inflections') return getInflections(entry.board, entry.source);
    return getFunctionRoots(entry.board, entry.source).map((x) => ({ x, y: 0 }));
  }

  function findFunctionSource(board: any, boardId: string, sourceName: string): any {
    const wanted = normalizeFunctionName(sourceName);
    if (!board || !wanted) return null;
    const plotEntries = window.__plotFunctionEntries || {};
    for (const key of Object.keys(plotEntries)) {
      const entry = plotEntries[key];
      if (!entry || entry.boardId !== boardId) continue;
      if (normalizeFunctionName(entry.name) === wanted && entry.graph && entry.graph.board === board) return entry.graph;
    }
    const seen = new Set<any>();
    const candidates: any[] = [];
    const add = function(object: any) {
      if (!object || seen.has(object)) return;
      seen.add(object);
      candidates.push(object);
    };
    try { if (Array.isArray(board.objectsList)) board.objectsList.forEach(add); } catch (e) {}
    try {
      if (board.objects && typeof board.objects === 'object') Object.keys(board.objects).forEach(function(key) { add(board.objects[key]); });
    } catch (e) {}
    for (const object of candidates) {
      const type = String(object && object.elType || '').toLowerCase();
      if (!object || typeof object.Y !== 'function' || (!object.__liaDgsFunction && type !== 'functiongraph')) continue;
      const names = [object.__liaDgsFunctionName, object.__liaPlotFunctionName, object.name].map(normalizeFunctionName);
      if (names.includes(wanted)) return object;
    }
    return null;
  }

  function removeBoardHandlers(entry: AnalysisEntry): void {
    (entry.handlers || []).forEach(function(handler) {
      try { if (entry.board && typeof entry.board.off === 'function') entry.board.off(handler.event, handler.fn); } catch (e) {}
    });
    entry.handlers = [];
  }

  function constructionProperty(kind: AnalysisKind): string {
    if (kind === 'extrema') return '__liaDgsExtremaConstruction';
    if (kind === 'inflections') return '__liaDgsInflectionConstruction';
    return '__liaDgsRootConstruction';
  }

  function detachEntryFromSource(entry: AnalysisEntry, source = entry.source): void {
    if (!entry || !source) return;
    const property = constructionProperty(entry.kind);
    if (source[property] === entry) delete source[property];
  }

  function attachEntryToSource(entry: AnalysisEntry): void {
    if (!entry || !entry.source) return;
    entry.__liaDgsMacroManaged = true;
    entry.source[constructionProperty(entry.kind)] = entry;
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__functionAnalysisPointEntries[key] as AnalysisEntry | undefined;
    if (!entry) return;
    if (entry.updateRAF != null) {
      try { cancelAnimationFrame(entry.updateRAF); } catch (e) {}
      entry.updateRAF = undefined;
    }
    removeBoardHandlers(entry);
    detachEntryFromSource(entry);
    entry.points.forEach(function(point) {
      const name = String(point && point.__liaFunctionAnalysisPointName || '');
      try {
        if (name && window.__points && window.__points[entry.boardId] && window.__points[entry.boardId][name] === point) {
          delete window.__points[entry.boardId][name];
        }
      } catch (e) {}
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    delete window.__functionAnalysisPointEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function applyPointVisual(entry: AnalysisEntry, point: any, index: number): void {
    const labelColor = getNeutralColor();
    const objectVisible = pointObjectVisible(entry, index);
    const labelVisible = objectVisible &&
      (pointNameVisible(entry, index) || pointValueRendered(entry, index));
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
    point.__liaDgsRootPoint = entry.kind === 'roots';
    point.__liaDgsExtremumPoint = entry.kind === 'extrema';
    point.__liaDgsInflectionPoint = entry.kind === 'inflections';
    point.__liaDgsYInterceptPoint = false;
    point.__liaDgsIntersectionPoint = false;
    point.__liaDgsAnalysisConstruction = entry;
    point.__liaDgsRootConstruction = entry.kind === 'roots' ? entry : undefined;
    point.__liaDgsExtremaConstruction = entry.kind === 'extrema' ? entry : undefined;
    point.__liaDgsInflectionConstruction = entry.kind === 'inflections' ? entry : undefined;
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

  function createAnalysisPoint(entry: AnalysisEntry, index: number): any | null {
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
        withLabel: pointNameVisible(entry, index) || pointValueRendered(entry, index),
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
      point.__liaFunctionAnalysisPoint = true;
      point.__liaFunctionAnalysisKind = entry.kind;
      point.__liaFunctionAnalysisPointName = name;
      point.__liaDgsPointName = name;
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

  function syncEntryPoints(entry: AnalysisEntry, positions: AnalysisPosition[]): boolean {
    let changed = false;
    const names = positions.map(function(_position, index) { return pointNameForIndex(entry, index); });
    const namesChanged = names.length !== entry.names.length || names.some(function(name, index) { return entry.names[index] !== name; });
    if (namesChanged || positions.length !== entry.points.length) {
      entry.points.forEach(function(point) {
        const name = String(point && point.__liaFunctionAnalysisPointName || '');
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
      try {
        if (window.__scheduleMacroCodeOrderLayers) {
          window.__scheduleMacroCodeOrderLayers();
        }
      } catch (e) {}
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

  function updateEntry(entry: AnalysisEntry): boolean {
    if (!entry || entry.updating) return false;
    entry.updating = true;
    try {
      const source = findFunctionSource(entry.board, entry.boardId, entry.sourceName);
      if (!source) {
        detachEntryFromSource(entry);
        const changed = syncEntryPoints(entry, []);
        if (changed) {
          try { if (entry.board && typeof entry.board.update === 'function') entry.board.update(); } catch (e) {}
        }
        return false;
      }
      if (entry.source !== source) detachEntryFromSource(entry);
      entry.source = source;
      attachEntryToSource(entry);
      const positions = getPositions(entry);
      const changed = syncEntryPoints(entry, positions);
      if (changed) {
        try { if (entry.board && typeof entry.board.update === 'function') entry.board.update(); } catch (e) {}
      }
      return true;
    } finally {
      entry.updating = false;
    }
  }

  function scheduleEntryUpdate(entry: AnalysisEntry): void {
    if (!entry || entry.updateRAF != null) return;
    entry.updateRAF = requestAnimationFrame(function() {
      entry.updateRAF = undefined;
      updateEntry(entry);
    });
  }

  function bindBoardHandlers(entry: AnalysisEntry): void {
    removeBoardHandlers(entry);
    if (!entry.board || typeof entry.board.on !== 'function') return;
    const events = ['move', 'boundingbox', 'update'];
    entry.handlers = events.map(function(event) {
      const fn = function() { scheduleEntryUpdate(entry); };
      try { entry.board.on(event, fn); } catch (e) {}
      return { event, fn };
    });
  }

  window.__scheduleFunctionAnalysisPointsForBoard = function(boardId?: string): void {
    Object.keys(window.__functionAnalysisPointEntries || {}).forEach(function(key) {
      const entry = window.__functionAnalysisPointEntries[key] as AnalysisEntry;
      if (!entry || (boardId && entry.boardId !== boardId)) return;
      scheduleEntryUpdate(entry);
    });
  };

  window.renderFunctionAnalysisPointsFromSpec = function(uid: string, spec: string, kind: string, language?: string): boolean {
    const cfg = parseAnalysisSpec(spec, kind, language);
    const key = entryKey(uid);
    if (!uid || !cfg.boardId || !cfg.sourceName) {
      removeEntry(uid);
      return false;
    }
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }
    const source = findFunctionSource(board, cfg.boardId, cfg.sourceName);
    if (!source) {
      removeEntry(uid);
      return false;
    }
    const old = window.__functionAnalysisPointEntries[key] as AnalysisEntry | undefined;
    if (old && old.board === board && old.kind === cfg.kind && old.sourceName === cfg.sourceName &&
        old.prefix === cfg.prefix && old.language === cfg.language && old.showValue === cfg.showValue &&
        old.showName === cfg.showName &&
        old.explicitNames.join('\n') === cfg.explicitNames.join('\n') &&
        old.explicitNameVisibility.join('\n') === cfg.explicitNameVisibility.join('\n') &&
        (old.explicitValueVisibility || []).join('\n') === cfg.explicitValueVisibility.join('\n') &&
        (old.explicitObjectVisibility || []).join('\n') === cfg.explicitObjectVisibility.join('\n')) {
      if (old.source !== source) detachEntryFromSource(old);
      old.source = source;
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      attachEntryToSource(old);
      updateEntry(old);
      return true;
    }
    removeEntry(uid);
    const entry: AnalysisEntry = {
      uid: String(uid),
      key,
      boardId: cfg.boardId,
      kind: cfg.kind,
      sourceName: cfg.sourceName,
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
      points: [],
      holders: [],
      names: [],
      __liaDgsMacroManaged: true
    };
    window.__functionAnalysisPointEntries[key] = entry;
    attachEntryToSource(entry);
    bindBoardHandlers(entry);
    updateEntry(entry);
    try { board.update(); } catch (e) {}
    return true;
  };

  window.__bootstrapFunctionAnalysisPoints = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="function-analysis-spec-"][data-spec]:not([data-lia-static-claimed])');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^function-analysis-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const kind = String(node.dataset.kind || 'roots');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderFunctionAnalysisPointsFromSpec || !window.renderFunctionAnalysisPointsFromSpec(uid, spec, kind, language)) {
        pending = true;
      }
    });
    Object.keys(window.__functionAnalysisPointEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingFunctionAnalysisPoints = pending;
  };

  window.__scheduleBootstrapFunctionAnalysisPoints = function(): void {
    if (window.__bootstrapFunctionAnalysisPointsRAF) return;
    window.__bootstrapFunctionAnalysisPointsRAF = requestAnimationFrame(function() {
      window.__bootstrapFunctionAnalysisPointsRAF = 0;
      try { if (window.__bootstrapFunctionAnalysisPoints) window.__bootstrapFunctionAnalysisPoints(); } catch (e) {}
    });
  };

  function containsFunctionAnalysisSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^function-analysis-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="function-analysis-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^function-analysis-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsFunctionAnalysisSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapFunctionAnalysisPoints) window.__scheduleBootstrapFunctionAnalysisPoints();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-kind', 'data-language'] });
  } catch (e) {}

  if (window.__registerLiaThemeListener) window.__registerLiaThemeListener(function() {
    Object.keys(window.__functionAnalysisPointEntries || {}).forEach(function(key) {
      const entry = window.__functionAnalysisPointEntries[key] as AnalysisEntry;
      if (!entry) return;
      entry.points.forEach(function(point, index) { applyPointVisual(entry, point, index); });
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__functionAnalysisPointsRetryInterval = setInterval(function() {
    if (hasPendingFunctionAnalysisPoints && window.__scheduleBootstrapFunctionAnalysisPoints) window.__scheduleBootstrapFunctionAnalysisPoints();
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapFunctionAnalysisPoints) window.__scheduleBootstrapFunctionAnalysisPoints();
  });
}
