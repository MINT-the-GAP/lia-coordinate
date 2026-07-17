// Cubic arc subsystem (@Arc / @Bogen macros).
// Connects named or coordinate endpoints with configurable out/in tangents.

import { CoordinatePair, unquote } from '../shared/parser';
import { getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { createHiddenPoint, getLivePoint } from '../shared/boardObjects';

interface ArcEndpointSpec {
  name: string;
  coordinate: CoordinatePair | null;
}

interface ArcDesign {
  normalized: string;
  firstArrow: boolean;
  lastArrow: boolean;
  startCap: boolean;
  endCap: boolean;
}

interface ArcConfig extends ArcDesign {
  boardId: string;
  start: ArcEndpointSpec;
  exitAngle: number;
  end: ArcEndpointSpec;
  entryAngle: number;
  caption: string;
  renderedCaption: string;
  useMathJax: boolean;
  strokeWidth: number;
  color: string;
  hasExplicitColor: boolean;
  visible: boolean;
  language: 'de' | 'en';
}

interface ArcGeometry {
  p0: CoordinatePair;
  p1: CoordinatePair;
  p2: CoordinatePair;
  p3: CoordinatePair;
  chord: number;
}

interface ArcCap {
  segment: any;
  points: any[];
}

export function init(): void {
  if (window.__arcReady) {
    try {
      if (window.__scheduleBootstrapArcs) window.__scheduleBootstrapArcs();
    } catch (e) {}
    return;
  }

  window.__arcReady = true;
  window.__arcEntries = window.__arcEntries || {};
  initThemeSync();

  let hasPendingArcs = false;

  /**
   * Arc specs are positional, so empty fields (especially an empty caption)
   * must be retained. The shared splitter intentionally drops empty fields.
   */
  function splitArcSpec(value: unknown): string[] {
    const input = unquote(String(value == null ? '' : value));
    const out: string[] = [];
    let current = '';
    let quote = '';
    let escaped = false;
    let depth = 0;

    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (escaped) {
        current += character;
        escaped = false;
        continue;
      }
      if (character === '\\') {
        current += character;
        escaped = true;
        continue;
      }
      if (quote) {
        current += character;
        if (character === quote) quote = '';
        continue;
      }
      if (character === String.fromCharCode(39)) {
        let previous = index - 1;
        while (previous >= 0 && /\s/.test(input[previous])) previous -= 1;
        const atValueStart = previous < 0 || ';,([{=:'.includes(input[previous]);
        let hasClosingQuote = false;
        let escapedQuote = false;
        for (let next = index + 1; atValueStart && next < input.length; next += 1) {
          if (escapedQuote) {
            escapedQuote = false;
            continue;
          }
          if (input[next] === String.fromCharCode(92)) {
            escapedQuote = true;
            continue;
          }
          if (input[next] === character) {
            hasClosingQuote = true;
            break;
          }
        }
        if (!atValueStart || !hasClosingQuote) {
          current += character;
          continue;
        }
      }
      if (character === '"' || character === "'" || character === '`') {
        current += character;
        quote = character;
        continue;
      }
      if (character === '(' || character === '[' || character === '{') {
        depth += 1;
        current += character;
        continue;
      }
      if (character === ')' || character === ']' || character === '}') {
        depth = Math.max(0, depth - 1);
        current += character;
        continue;
      }
      if (character === ';' && depth === 0) {
        out.push(current.trim());
        current = '';
        continue;
      }
      current += character;
    }

    out.push(current.trim());
    return out.map(function(part) { return unquote(part).trim(); });
  }

  function decodeLegacyParentheses(value: unknown): string {
    return String(value == null ? '' : value)
      .replace(/\{\{/g, '(')
      .replace(/\}\}/g, ')');
  }

  function parseCoordinate(value: unknown): CoordinatePair | null {
    const raw = unquote(String(value == null ? '' : value)).trim();
    if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
    const pair = splitArcSpec(raw.slice(1, -1));
    if (pair.length !== 2) return null;
    const x = Number(String(pair[0] || '').replace(',', '.'));
    const y = Number(String(pair[1] || '').replace(',', '.'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function parseEndpoint(value: unknown): ArcEndpointSpec | null {
    const raw = unquote(String(value == null ? '' : value)).trim();
    const coordinate = parseCoordinate(raw);
    if (coordinate) return { name: '', coordinate };
    return raw ? { name: raw, coordinate: null } : null;
  }

  function parseAngle(value: unknown): number | null {
    const raw = String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/(?:\s*(?:deg|grad|°))$/, '')
      .replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    const normalized = ((parsed % 360) + 360) % 360;
    return Math.abs(normalized - 360) < 1e-12 ? 0 : normalized;
  }

  function parseStrokeWidth(value: unknown): number {
    const raw = String(value == null ? '' : value).trim().replace(',', '.');
    const match = raw.match(/^((?:\d+(?:\.\d*)?|\.\d+))\s*(?:px)?$/i);
    if (!match) return 3;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(0.25, Math.min(20, parsed)) : 3;
  }

  function isStrokeWidthToken(value: unknown): boolean {
    const raw = String(value == null ? '' : value).trim().replace(',', '.');
    return /^((?:\d+(?:\.\d*)?|\.\d+))\s*(?:px)?$/i.test(raw);
  }

  function visibilityOptionValue(value: unknown): boolean | null {
    const match = String(value == null ? '' : value).trim()
      .match(/^(?:visible|sichtbar)\s*=\s*(0|1|false|true)$/i);
    if (!match) return null;
    return !/^(?:0|false)$/i.test(match[1]);
  }

  function normalizeDesignToken(value: unknown): string {
    return String(value == null ? '' : value)
      .trim()
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&vert;/gi, '|')
      .replace(/↔/g, '<->')
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/[−–—]/g, '-')
      .replace(/\s+/g, '');
  }

  function isDesignToken(value: unknown): boolean {
    const raw = normalizeDesignToken(value);
    return raw === '' || raw === '-' || /^\|?(?:->|<-|<->)\|?$/.test(raw);
  }

  function parseDesign(value: unknown): ArcDesign {
    let raw = normalizeDesignToken(value);
    const startCap = raw.startsWith('|');
    const endCap = raw.endsWith('|');
    if (startCap) raw = raw.slice(1);
    if (endCap && raw) raw = raw.slice(0, -1);
    const arrow = raw === '->' || raw === '<-' || raw === '<->' ? raw : '';
    return {
      normalized: (startCap ? '|' : '') + arrow + (endCap ? '|' : ''),
      firstArrow: arrow === '<-' || arrow === '<->',
      lastArrow: arrow === '->' || arrow === '<->',
      startCap,
      endCap
    };
  }

  function arrowHead(enabled: boolean, strokeWidth: number): false | {
    type: number;
    size: number;
    highlightSize: number;
  } {
    if (!enabled) return false;
    // JSXGraph multiplies arrow size by the line width. Keep the filled,
    // vector-like triangle at a compact and visually stable screen size.
    const size = 13 / Math.max(0.25, strokeWidth);
    return { type: 1, size, highlightSize: size };
  }

  function renderCaption(value: unknown): { text: string; useMathJax: boolean } {
    let useMathJax = false;
    let text = decodeLegacyParentheses(value);
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function(_match, tex) {
      useMathJax = true;
      return '\\[' + tex + '\\]';
    });
    text = text.replace(/\$([^$\r\n]+?)\$/g, function(_match, tex) {
      useMathJax = true;
      return '\\(' + tex + '\\)';
    });
    if (/\\\(|\\\[/.test(text)) useMathJax = true;
    return { text, useMathJax };
  }

  function parseArcSpec(spec: string, language?: string): ArcConfig | null {
    const parts = splitArcSpec(spec);
    const start = parseEndpoint(parts[1]);
    const exitAngle = parseAngle(parts[2]);
    const end = parseEndpoint(parts[3]);
    const entryAngle = parseAngle(parts[4]);
    if (!parts[0] || !start || exitAngle == null || !end || entryAngle == null) return null;
    const caption = decodeLegacyParentheses(parts[5] || '');
    const renderedCaption = renderCaption(caption);
    const visibilityOptions = parts.slice(6)
      .map(visibilityOptionValue)
      .filter(function(value): value is boolean { return value != null; });
    const styleParts = parts.slice(6).filter(function(part) {
      return visibilityOptionValue(part) == null;
    });
    let designToken = styleParts[0] || '';
    let strokeWidthToken = styleParts[1] || '';
    let colorToken = styleParts[2] || '';
    // The documented form appends color to the original signature. Also
    // accept caption;color;design;width, matching the order of older macros.
    if (!isDesignToken(designToken) && isDesignToken(strokeWidthToken)) {
      colorToken = designToken;
      designToken = strokeWidthToken;
      strokeWidthToken = styleParts[2] || '';
    } else if (!colorToken && strokeWidthToken && !isStrokeWidthToken(strokeWidthToken)) {
      // Allow design;color as a shorthand when the default width is desired.
      colorToken = strokeWidthToken;
      strokeWidthToken = '';
    }
    const explicitColor = String(colorToken || '').trim();
    const design = parseDesign(designToken);
    return {
      boardId: String(parts[0] || '').trim(),
      start,
      exitAngle,
      end,
      entryAngle,
      caption,
      renderedCaption: renderedCaption.text,
      useMathJax: renderedCaption.useMathJax,
      strokeWidth: parseStrokeWidth(strokeWidthToken),
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      visible: visibilityOptions.length ? visibilityOptions[visibilityOptions.length - 1] : true,
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
      ...design
    };
  }

  function entryKey(uid: string): string {
    return 'arc-' + String(uid || '');
  }

  function sameCoordinate(a: CoordinatePair | null, b: CoordinatePair | null): boolean {
    return !!a && !!b &&
      Math.abs(a.x - b.x) < 1e-12 &&
      Math.abs(a.y - b.y) < 1e-12;
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__arcEntries[key];
    if (!entry) return;
    try { if (entry.board && entry.label) entry.board.removeObject(entry.label); } catch (e) {}
    try { if (entry.board && entry.curve) entry.board.removeObject(entry.curve); } catch (e) {}
    (Array.isArray(entry.capSegments) ? entry.capSegments : []).forEach(function(segment: any) {
      try { if (entry.board && segment) entry.board.removeObject(segment); } catch (e) {}
    });
    (Array.isArray(entry.capPoints) ? entry.capPoints : []).forEach(function(point: any) {
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    (Array.isArray(entry.ownedPoints) ? entry.ownedPoints : []).forEach(function(point: any) {
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    delete window.__arcEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function pointCoordinate(point: any): CoordinatePair {
    try {
      return { x: Number(point.X()), y: Number(point.Y()) };
    } catch (e) {
      return { x: NaN, y: NaN };
    }
  }

  function currentArcAngle(
    curve: any,
    dgsProperty: '__liaDgsArcExitAngle' | '__liaDgsArcEntryAngle',
    legacyProperty: '__liaArcExitAngle' | '__liaArcEntryAngle',
    fallback: number
  ): number {
    const dgsAngle = Number(curve && curve[dgsProperty]);
    if (Number.isFinite(dgsAngle)) return dgsAngle;
    const legacyAngle = Number(curve && curve[legacyProperty]);
    return Number.isFinite(legacyAngle) ? legacyAngle : fallback;
  }

  function currentArcStrokeWidth(curve: any, fallback: number): number {
    const dgsStrokeWidth = Number(curve && curve.__liaDgsArcStrokeWidth);
    if (Number.isFinite(dgsStrokeWidth) && dgsStrokeWidth > 0) return dgsStrokeWidth;
    const legacyStrokeWidth = Number(curve && curve.__liaArcStrokeWidth);
    return Number.isFinite(legacyStrokeWidth) && legacyStrokeWidth > 0
      ? legacyStrokeWidth
      : fallback;
  }

  function arcGeometry(points: any[], exitAngle: number, entryAngle: number): ArcGeometry {
    const p0 = pointCoordinate(points[0]);
    const p3 = pointCoordinate(points[1]);
    const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const handle = chord / 3;
    const exitRadians = exitAngle * Math.PI / 180;
    const entryRadians = entryAngle * Math.PI / 180;
    return {
      p0,
      p1: {
        x: p0.x + handle * Math.cos(exitRadians),
        y: p0.y + handle * Math.sin(exitRadians)
      },
      // TikZ-like "in": the angle points from the end back to its control arm.
      p2: {
        x: p3.x + handle * Math.cos(entryRadians),
        y: p3.y + handle * Math.sin(entryRadians)
      },
      p3,
      chord
    };
  }

  function cubicPoint(geometry: ArcGeometry, t: number): CoordinatePair {
    if (!Number.isFinite(geometry.chord) || geometry.chord < 1e-12) return { x: NaN, y: NaN };
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return {
      x: a * geometry.p0.x + b * geometry.p1.x + c * geometry.p2.x + d * geometry.p3.x,
      y: a * geometry.p0.y + b * geometry.p1.y + c * geometry.p2.y + d * geometry.p3.y
    };
  }

  function cubicDerivative(geometry: ArcGeometry, t: number): CoordinatePair {
    const u = 1 - t;
    return {
      x: 3 * u * u * (geometry.p1.x - geometry.p0.x) +
        6 * u * t * (geometry.p2.x - geometry.p1.x) +
        3 * t * t * (geometry.p3.x - geometry.p2.x),
      y: 3 * u * u * (geometry.p1.y - geometry.p0.y) +
        6 * u * t * (geometry.p2.y - geometry.p1.y) +
        3 * t * t * (geometry.p3.y - geometry.p2.y)
    };
  }

  function hasVisibleChord(points: any[]): boolean {
    const start = pointCoordinate(points[0]);
    const end = pointCoordinate(points[1]);
    return Number.isFinite(start.x) && Number.isFinite(start.y) &&
      Number.isFinite(end.x) && Number.isFinite(end.y) &&
      Math.hypot(end.x - start.x, end.y - start.y) >= 1e-12;
  }

  function capOffset(board: any, angle: number, side: number): CoordinatePair {
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const radians = angle * Math.PI / 180;
    const tangentScreenX = Math.cos(radians) * unitX;
    const tangentScreenY = -Math.sin(radians) * unitY;
    const normalScreenX = -tangentScreenY;
    const normalScreenY = tangentScreenX;
    const length = Math.max(1e-9, Math.hypot(normalScreenX, normalScreenY));
    const halfLengthPx = 6;
    return {
      x: side * normalScreenX / length * halfLengthPx / unitX,
      y: -side * normalScreenY / length * halfLengthPx / unitY
    };
  }

  function createCap(
    board: any,
    endpoint: any,
    allEndpoints: any[],
    angle: number | (() => number),
    color: string,
    strokeWidth: number,
    layer: number,
    visible: boolean
  ): ArcCap {
    const currentAngle = function(): number {
      const value = Number(typeof angle === 'function' ? angle() : angle);
      return Number.isFinite(value) ? value : 0;
    };
    const makePoint = function(side: number) {
      const point = board.create('point', [
        function() { return Number(endpoint.X()) + capOffset(board, currentAngle(), side).x; },
        function() { return Number(endpoint.Y()) + capOffset(board, currentAngle(), side).y; }
      ], {
        name: '',
        withLabel: false,
        visible: false,
        fixed: true,
        frozen: false,
        highlight: false,
        showInfobox: false,
        size: 0
      });
      try { if (typeof point.addParents === 'function') point.addParents(allEndpoints); } catch (e) {}
      return point;
    };
    const points = [makePoint(-1), makePoint(1)];
    const segment = board.create('segment', points, {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      visible: function() { return visible && hasVisibleChord(allEndpoints); },
      strokeColor: color,
      highlightStrokeColor: color,
      strokeWidth,
      highlightStrokeWidth: strokeWidth,
      lineCap: 'round',
      layer
    });
    return { segment, points };
  }

  function labelPosition(board: any, points: any[], cfg: ArcConfig, curve: any): CoordinatePair {
    const geometry = arcGeometry(
      points,
      currentArcAngle(curve, '__liaDgsArcExitAngle', '__liaArcExitAngle', cfg.exitAngle),
      currentArcAngle(curve, '__liaDgsArcEntryAngle', '__liaArcEntryAngle', cfg.entryAngle)
    );
    const midpoint = cubicPoint(geometry, 0.5);
    if (!Number.isFinite(midpoint.x) || !Number.isFinite(midpoint.y)) return midpoint;
    let derivative = cubicDerivative(geometry, 0.5);
    if (Math.hypot(derivative.x, derivative.y) < 1e-12) {
      derivative = {
        x: geometry.p3.x - geometry.p0.x,
        y: geometry.p3.y - geometry.p0.y
      };
    }
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const tangentScreenX = derivative.x * unitX;
    const tangentScreenY = -derivative.y * unitY;
    let normalScreenX = -tangentScreenY;
    let normalScreenY = tangentScreenX;
    const normalLength = Math.hypot(normalScreenX, normalScreenY);
    if (normalLength < 1e-12) {
      normalScreenX = 0;
      normalScreenY = -1;
    } else {
      normalScreenX /= normalLength;
      normalScreenY /= normalLength;
    }
    if (normalScreenY > 0 || (Math.abs(normalScreenY) < 1e-12 && normalScreenX < 0)) {
      normalScreenX = -normalScreenX;
      normalScreenY = -normalScreenY;
    }
    const offsetPx = Math.max(11, Math.min(20, 10 + currentArcStrokeWidth(curve, cfg.strokeWidth)));
    return {
      x: midpoint.x + normalScreenX * offsetPx / unitX,
      y: midpoint.y - normalScreenY * offsetPx / unitY
    };
  }

  function createCurve(board: any, points: any[], cfg: ArcConfig, layer: number): any {
    let curve: any = null;
    const geometry = function(): ArcGeometry {
      return arcGeometry(
        points,
        currentArcAngle(curve, '__liaDgsArcExitAngle', '__liaArcExitAngle', cfg.exitAngle),
        currentArcAngle(curve, '__liaDgsArcEntryAngle', '__liaArcEntryAngle', cfg.entryAngle)
      );
    };
    curve = board.create('curve', [
      function(t: number) {
        return cubicPoint(geometry(), Number(t)).x;
      },
      function(t: number) {
        return cubicPoint(geometry(), Number(t)).y;
      },
      0,
      1
    ], {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      visible: function() { return cfg.visible && hasVisibleChord(points); },
      strokeColor: cfg.color,
      highlightStrokeColor: cfg.color,
      strokeWidth: cfg.strokeWidth,
      highlightStrokeWidth: cfg.strokeWidth,
      lineCap: 'round',
      firstArrow: arrowHead(cfg.firstArrow, cfg.strokeWidth),
      lastArrow: arrowHead(cfg.lastArrow, cfg.strokeWidth),
      doAdvancedPlot: false,
      numberPointsLow: 64,
      numberPointsHigh: 128,
      needsRegularUpdate: true,
      layer
    });
    try { if (typeof curve.addParents === 'function') curve.addParents(points); } catch (e) {}
    return curve;
  }

  function createLabel(board: any, points: any[], cfg: ArcConfig, curve: any): any {
    if (!cfg.caption) return null;
    const label = board.create('text', [
      function() { return labelPosition(board, points, cfg, curve).x; },
      function() { return labelPosition(board, points, cfg, curve).y; },
      cfg.renderedCaption
    ], {
      fixed: true,
      highlight: false,
      visible: function() { return cfg.visible && hasVisibleChord(points); },
      parse: false,
      useMathJax: cfg.useMathJax,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: cfg.color,
      fillColor: cfg.color,
      highlightStrokeColor: cfg.color,
      highlightFillColor: cfg.color,
      fontSize: 18
    });
    try { if (typeof label.addParents === 'function') label.addParents(points); } catch (e) {}
    return label;
  }

  function dgsArcNameFromCaption(value: unknown): string {
    const raw = decodeLegacyParentheses(value).trim();
    if (!raw) return '';
    const dollarMath = raw.match(/^\$([^$\r\n]+)\$$/);
    const inlineMath = raw.match(/^\\\(([^\r\n]+)\\\)$/);
    const candidate = String(
      dollarMath ? dollarMath[1] : (inlineMath ? inlineMath[1] : raw)
    ).trim();
    return candidate && !/[\s;,\[\]()$]/.test(candidate) ? candidate : '';
  }

  function applyDgsArcMetadata(entry: any): void {
    const curve = entry && entry.curve;
    if (!curve) return;
    const points = Array.isArray(entry.points) ? entry.points : [];
    const startPoint = curve.__liaArcStartPoint || points[0] || null;
    const endPoint = curve.__liaArcEndPoint || points[1] || null;
    const caption = String(
      entry.caption == null ? (curve.__liaArcCaption || '') : entry.caption
    );
    const name = dgsArcNameFromCaption(caption);
    const design = String(
      entry.normalized == null ? (curve.__liaArcDesign || '') : entry.normalized
    ) || '-';
    const strokeWidth = Number.isFinite(Number(entry.strokeWidth))
      ? Number(entry.strokeWidth)
      : (Number(curve.__liaArcStrokeWidth) || 3);
    const color = String(entry.color || curve.__liaArcColor || getAccentColor());
    const language = String(entry.language || curve.__liaArcLanguage || 'de')
      .toLowerCase() === 'en' ? 'en' : 'de';

    const currentExitAngle = Number(curve.__liaDgsArcExitAngle);
    const currentEntryAngle = Number(curve.__liaDgsArcEntryAngle);
    const macroBase = 'macro:arcEntries:' + entryKey(String(entry.uid || ''));
    curve.__liaDgsMacroManaged = true;
    curve.__liaDgsMacroKey = macroBase + ':curve';
    curve.__liaDgsPersistentId = macroBase + ':curve';
    curve.__liaDgsArc = true;
    curve.__liaDgsArcName = name;
    curve.__liaDgsArcStartPoint = startPoint;
    curve.__liaDgsArcEndPoint = endPoint;
    curve.__liaDgsArcExitAngle = Number.isFinite(currentExitAngle)
      ? currentExitAngle
      : Number(entry.exitAngle ?? curve.__liaArcExitAngle);
    curve.__liaDgsArcEntryAngle = Number.isFinite(currentEntryAngle)
      ? currentEntryAngle
      : Number(entry.entryAngle ?? curve.__liaArcEntryAngle);
    curve.__liaDgsArcCaption = caption;
    curve.__liaDgsArcDesign = design;
    curve.__liaDgsArcStrokeWidth = strokeWidth;
    curve.__liaDgsArcColor = color;
    curve.__liaDgsArcHasExplicitColor = !!(
      entry.hasExplicitColor ?? curve.__liaArcHasExplicitColor
    );
    curve.__liaDgsArcLanguage = language;
    curve.__liaDgsShowName = !!name;
    curve.__liaDgsShowObject = entry.visible !== false;
    if (!Number.isFinite(Number(curve.__liaDgsOpacity))) curve.__liaDgsOpacity = 1;
    curve.__liaDgsColor = color;
    curve.__liaDgsLineColor = color;
    curve.__liaDgsFillColor = color;
    curve.__liaDgsTextColor = color;
    curve.__liaDgsLanguage = language;
    curve.__liaDgsStyleCapSegments = Array.isArray(entry.capSegments)
      ? entry.capSegments
      : [];
    curve.__liaDgsStyleCapPoints = Array.isArray(entry.capPoints)
      ? entry.capPoints
      : [];
    curve.__liaDgsArcLabel = entry.label || null;
    if (entry.label) curve.label = entry.label;
    (Array.isArray(entry.ownedPoints) ? entry.ownedPoints : []).forEach(function(point: any, index: number) {
      if (!point) return;
      const key = macroBase + ':owned-point:' + index;
      point.__liaDgsMacroManaged = true;
      point.__liaDgsMacroKey = key;
      point.__liaDgsPersistentId = key;
    });
  }

  function applyArcVisibility(entry: any): void {
    const visible = entry && entry.visible !== false;
    const points = Array.isArray(entry && entry.points) ? entry.points : [];
    const dynamicVisibility = function() {
      return visible && hasVisibleChord(points);
    };
    try {
      if (entry && entry.curve && typeof entry.curve.setAttribute === 'function') {
        entry.curve.setAttribute({ visible: dynamicVisibility });
      }
    } catch (e) {}
    (Array.isArray(entry && entry.capSegments) ? entry.capSegments : []).forEach(function(segment: any) {
      try {
        if (segment && typeof segment.setAttribute === 'function') {
          segment.setAttribute({ visible: dynamicVisibility });
        }
      } catch (e) {}
    });
    try {
      if (entry && entry.label && typeof entry.label.setAttribute === 'function') {
        entry.label.setAttribute({ visible: dynamicVisibility });
      }
    } catch (e) {}
  }

  function applyArcStyle(entry: any, color: string): void {
    try {
      if (entry.curve && typeof entry.curve.setAttribute === 'function') {
        entry.curve.setAttribute({
          strokeColor: color,
          highlightStrokeColor: color,
          strokeWidth: entry.strokeWidth,
          highlightStrokeWidth: entry.strokeWidth,
          firstArrow: arrowHead(entry.firstArrow, entry.strokeWidth),
          lastArrow: arrowHead(entry.lastArrow, entry.strokeWidth)
        });
      }
    } catch (e) {}
    (Array.isArray(entry.capSegments) ? entry.capSegments : []).forEach(function(segment: any) {
      try {
        if (segment && typeof segment.setAttribute === 'function') {
          segment.setAttribute({
            strokeColor: color,
            highlightStrokeColor: color,
            strokeWidth: entry.strokeWidth,
            highlightStrokeWidth: entry.strokeWidth
          });
        }
      } catch (e) {}
    });
    try {
      if (entry.label && typeof entry.label.setAttribute === 'function') {
        entry.label.setAttribute({
          strokeColor: color,
          fillColor: color,
          highlightStrokeColor: color,
          highlightFillColor: color
        });
      }
    } catch (e) {}
    try {
      if (entry.curve) {
        entry.curve.__liaArcColor = color;
        entry.curve.__liaArcStrokeWidth = entry.strokeWidth;
        entry.curve.__liaArcHasExplicitColor = !!entry.hasExplicitColor;
      }
    } catch (e) {}
    applyArcVisibility(entry);
    applyDgsArcMetadata(entry);
  }

  function endpointUnchanged(
    old: any,
    index: number,
    endpoint: ArcEndpointSpec,
    namedPoint: any
  ): boolean {
    const oldCoordinate = index === 0 ? old.startCoordinate : old.endCoordinate;
    if (endpoint.coordinate) return sameCoordinate(oldCoordinate || null, endpoint.coordinate);
    return !oldCoordinate &&
      old.points &&
      old.points[index] === namedPoint &&
      String(index === 0 ? old.startName : old.endName) === endpoint.name;
  }

  window.renderArcFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseArcSpec(spec, language);
    const key = entryKey(uid);
    if (!uid || !cfg || !cfg.boardId) {
      removeEntry(uid);
      return false;
    }
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }

    const namedStart = cfg.start.coordinate ? null : getLivePoint(board, cfg.boardId, cfg.start.name);
    const namedEnd = cfg.end.coordinate ? null : getLivePoint(board, cfg.boardId, cfg.end.name);
    if ((!cfg.start.coordinate && !namedStart) || (!cfg.end.coordinate && !namedEnd) ||
        (namedStart && namedEnd && namedStart === namedEnd)) {
      removeEntry(uid);
      return false;
    }

    const old = window.__arcEntries[key];
    const geometryUnchanged = !!old && old.board === board &&
      endpointUnchanged(old, 0, cfg.start, namedStart) &&
      endpointUnchanged(old, 1, cfg.end, namedEnd);
    if (geometryUnchanged &&
        old.exitAngle === cfg.exitAngle &&
        old.entryAngle === cfg.entryAngle &&
        old.caption === cfg.caption &&
        old.normalized === cfg.normalized &&
        old.strokeWidth === cfg.strokeWidth &&
        old.language === cfg.language) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      old.visible = cfg.visible;
      applyArcStyle(old, cfg.color);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    const ownedPoints: any[] = [];
    const capSegments: any[] = [];
    const capPoints: any[] = [];
    let curve: any = null;
    let label: any = null;
    try {
      const startPoint = cfg.start.coordinate
        ? createHiddenPoint(board, cfg.start.coordinate)
        : namedStart;
      const endPoint = cfg.end.coordinate
        ? createHiddenPoint(board, cfg.end.coordinate)
        : namedEnd;
      if (cfg.start.coordinate) ownedPoints.push(startPoint);
      if (cfg.end.coordinate) ownedPoints.push(endPoint);
      const points = [startPoint, endPoint];
      const curveLayerValue = Number(board && board.options && board.options.layer && board.options.layer.curve);
      const curveLayer = Number.isFinite(curveLayerValue) ? curveLayerValue : 5;
      const capLayer = Math.max(0, curveLayer - 1);

      curve = createCurve(board, points, cfg, curveLayer);
      if (cfg.startCap) {
        const cap = createCap(
          board,
          startPoint,
          points,
          function() {
            return currentArcAngle(curve, '__liaDgsArcExitAngle', '__liaArcExitAngle', cfg.exitAngle);
          },
          cfg.color,
          cfg.strokeWidth,
          capLayer,
          cfg.visible
        );
        capSegments.push(cap.segment);
        capPoints.push.apply(capPoints, cap.points);
      }
      if (cfg.endCap) {
        const cap = createCap(
          board,
          endPoint,
          points,
          function() {
            return currentArcAngle(curve, '__liaDgsArcEntryAngle', '__liaArcEntryAngle', cfg.entryAngle);
          },
          cfg.color,
          cfg.strokeWidth,
          capLayer,
          cfg.visible
        );
        capSegments.push(cap.segment);
        capPoints.push.apply(capPoints, cap.points);
      }
      label = createLabel(board, points, cfg, curve);

      curve.__liaArc = true;
      curve.__liaArcStartPoint = startPoint;
      curve.__liaArcEndPoint = endPoint;
      curve.__liaArcExitAngle = cfg.exitAngle;
      curve.__liaArcEntryAngle = cfg.entryAngle;
      curve.__liaArcCaption = cfg.caption;
      curve.__liaArcDesign = cfg.normalized;
      curve.__liaArcStrokeWidth = cfg.strokeWidth;
      curve.__liaArcColor = cfg.color;
      curve.__liaArcHasExplicitColor = cfg.hasExplicitColor;
      curve.__liaArcLanguage = cfg.language;

      window.__arcEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        board,
        startName: cfg.start.name,
        endName: cfg.end.name,
        startCoordinate: cfg.start.coordinate ? { ...cfg.start.coordinate } : null,
        endCoordinate: cfg.end.coordinate ? { ...cfg.end.coordinate } : null,
        exitAngle: cfg.exitAngle,
        entryAngle: cfg.entryAngle,
        caption: cfg.caption,
        renderedCaption: cfg.renderedCaption,
        useMathJax: cfg.useMathJax,
        normalized: cfg.normalized,
        firstArrow: cfg.firstArrow,
        lastArrow: cfg.lastArrow,
        startCap: cfg.startCap,
        endCap: cfg.endCap,
        strokeWidth: cfg.strokeWidth,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        visible: cfg.visible,
        language: cfg.language,
        points,
        ownedPoints,
        capSegments,
        capPoints,
        curve,
        label
      };
      applyArcStyle(window.__arcEntries[key], cfg.color);
      scheduleBootstrap(function() { try { board.update(); } catch (e) {} });
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      try { if (curve) board.removeObject(curve); } catch (removeError) {}
      capSegments.forEach(function(segment) { try { board.removeObject(segment); } catch (removeError) {} });
      capPoints.forEach(function(point) { try { board.removeObject(point); } catch (removeError) {} });
      ownedPoints.forEach(function(point) { try { board.removeObject(point); } catch (removeError) {} });
      return false;
    }
  };

  window.__bootstrapArcs = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="arc-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^arc-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderArcFromSpec || !window.renderArcFromSpec(uid, spec, language)) {
        pending = true;
      }
    });
    Object.keys(window.__arcEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingArcs = pending;
  };

  window.__scheduleBootstrapArcs = function(): void {
    if (window.__bootstrapArcsRAF) return;
    window.__bootstrapArcsRAF = requestAnimationFrame(function() {
      window.__bootstrapArcsRAF = 0;
      try { if (window.__bootstrapArcs) window.__bootstrapArcs(); } catch (e) {}
    });
  };

  function containsArcSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^arc-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="arc-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let index = 0; index < mutations.length && !needsBootstrap; index += 1) {
        const mutation = mutations[index];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^arc-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsArcSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapArcs) window.__scheduleBootstrapArcs();
    });
    const root = document.body || document.documentElement;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-spec', 'data-language']
      });
    }
  } catch (e) {}

  if (window.__registerLiaThemeListener) {
    window.__registerLiaThemeListener(function() {
      Object.keys(window.__arcEntries || {}).forEach(function(key) {
        const entry = window.__arcEntries[key];
        if (!entry) return;
        if (!entry.hasExplicitColor) {
          entry.color = getAccentColor();
          applyArcStyle(entry, entry.color);
        }
        try { if (entry.board) entry.board.update(); } catch (e) {}
      });
    });
  }

  window.__arcRetryInterval = setInterval(function() {
    if (hasPendingArcs && window.__scheduleBootstrapArcs) window.__scheduleBootstrapArcs();
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapArcs) window.__scheduleBootstrapArcs();
  });
}
