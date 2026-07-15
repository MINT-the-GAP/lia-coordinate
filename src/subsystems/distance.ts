// Segment subsystem (@Strecke / @distance macros).
// Connects two named points from the shared point registry on a JSXGraph board.

import {
  CoordinatePair,
  isHiddenNameOption,
  parseCoordinateList,
  parseMacroName,
  splitTopLevel,
  unquote
} from '../shared/parser';
import { getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { getLivePoint, createHiddenPoint, sameCoordinates } from '../shared/boardObjects';

interface DistanceDesign {
  normalizedDesign: string;
  firstArrow: boolean;
  lastArrow: boolean;
  startCap: boolean;
  endCap: boolean;
}

interface DistanceConfig extends DistanceDesign {
  boardId: string;
  point1Name: string;
  point2Name: string;
  coordinates: CoordinatePair[] | null;
  color: string;
  hasExplicitColor: boolean;
  language: 'de' | 'en';
  showLength: boolean;
  segmentName: string;
  showName: boolean;
  strokeWidth: number;
}

interface DistanceCap {
  segment: any;
  points: any[];
}

export function init(): void {
  if (window.__distanceReady) {
    try {
      if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances();
    } catch (e) {}
    return;
  }
  window.__distanceReady = true;

  window.__distanceEntries = window.__distanceEntries || {};
  initThemeSync();

  let hasPendingDistances = false;

  function normalizeDesignToken(value: unknown): string {
    return String(value == null ? '' : value)
      .trim()
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&vert;/gi, '|')
      .replace(/\u2194/g, '<->')
      .replace(/\u2192/g, '->')
      .replace(/\u2190/g, '<-')
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/\s+/g, '');
  }

  function designOptionValue(value: unknown): string | null {
    const raw = String(value == null ? '' : value).trim();
    const keyed = raw.match(/^design\s*=\s*(.*)$/i);
    const token = normalizeDesignToken(keyed ? keyed[1] : raw);
    return token === '-' || /^\|?(?:->|<-|<->)\|?$/.test(token)
      ? token
      : null;
  }

  function parseDesign(value: unknown): DistanceDesign {
    let raw = normalizeDesignToken(value);
    if (raw === '-') raw = '';
    const startCap = raw.startsWith('|');
    const endCap = raw.endsWith('|');
    if (startCap) raw = raw.slice(1);
    if (endCap && raw) raw = raw.slice(0, -1);
    const arrow = raw === '->' || raw === '<-' || raw === '<->' ? raw : '';
    return {
      normalizedDesign: (startCap ? '|' : '') + arrow + (endCap ? '|' : ''),
      firstArrow: arrow === '<-' || arrow === '<->',
      lastArrow: arrow === '->' || arrow === '<->',
      startCap,
      endCap
    };
  }

  function isStrokeWidthToken(value: unknown): boolean {
    const raw = String(value == null ? '' : value).trim().replace(',', '.');
    return /^(?:\d+(?:\.\d*)?|\.\d+)\s*(?:px)?$/i.test(raw);
  }

  function strokeWidthOptionValue(value: unknown, allowBareNumber: boolean): string | null {
    const raw = String(value == null ? '' : value).trim();
    const keyed = raw.match(/^(?:stroke-?width|line-?width|width|linienst(?:\u00e4rke|aerke))\s*=\s*(.+)$/i);
    if (keyed) return isStrokeWidthToken(keyed[1]) ? keyed[1] : null;
    if (!isStrokeWidthToken(raw)) return null;
    return /px\s*$/i.test(raw) || allowBareNumber ? raw : null;
  }

  function parseStrokeWidth(value: unknown): number {
    const raw = String(value == null ? '' : value).trim().replace(',', '.');
    const match = raw.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    const parsed = match ? Number(match[0]) : NaN;
    return Number.isFinite(parsed) ? Math.max(0.25, Math.min(20, parsed)) : 3;
  }

  function arrowHead(enabled: boolean, strokeWidth: number): false | {
    type: number;
    size: number;
    highlightSize: number;
  } {
    if (!enabled) return false;
    const size = 13 / Math.max(0.25, strokeWidth);
    return { type: 1, size, highlightSize: size };
  }

  function parseDistanceSpec(spec: string, language?: string): DistanceConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const pointPair = String(parts[1] || '').trim();
    const usesPointPair = pointPair.startsWith('[') && pointPair.endsWith(']');
    const coordinates = parseCoordinateList(pointPair);
    let point1Name = '';
    let point2Name = '';
    let colorIndex = 3;

    if (coordinates) {
      colorIndex = 2;
    } else if (usesPointPair) {
      const pointNames = splitTopLevel(pointPair.slice(1, -1))
        .map(function(pointName) { return unquote(pointName).trim(); });
      point1Name = String(pointNames[0] || '').trim();
      point2Name = String(pointNames[1] || '').trim();
      colorIndex = 2;
    } else {
      // Keep the original board;A;B;color form working as a legacy alias.
      point1Name = String(parts[1] || '').trim();
      point2Name = String(parts[2] || '').trim();
    }

    const explicitColor = String(parts[colorIndex] || '').trim();
    const trailingOptions = parts.slice(colorIndex + 1)
      .map(function(part) { return String(part || '').trim(); })
      .filter(Boolean);
    const designIndex = trailingOptions.findIndex(function(part) {
      return designOptionValue(part) != null;
    });
    let strokeWidthIndex = trailingOptions.findIndex(function(part) {
      return strokeWidthOptionValue(part, false) != null;
    });
    if (strokeWidthIndex < 0 && designIndex >= 0) {
      strokeWidthIndex = trailingOptions.findIndex(function(part, index) {
        return index > designIndex && strokeWidthOptionValue(part, true) != null;
      });
    }
    const design = parseDesign(
      designIndex >= 0 ? designOptionValue(trailingOptions[designIndex]) : ''
    );
    const strokeWidthToken = strokeWidthIndex >= 0
      ? strokeWidthOptionValue(trailingOptions[strokeWidthIndex], true)
      : '';
    const standaloneHiddenName = trailingOptions.some(isHiddenNameOption);
    const rawSegmentName = trailingOptions.find(function(part, index) {
      return index !== designIndex &&
        index !== strokeWidthIndex &&
        !/^length\s*=/i.test(part) &&
        !isHiddenNameOption(part);
    }) || '';
    const parsedName = parseMacroName(rawSegmentName);

    return {
      boardId: String(parts[0] || '').trim(),
      point1Name: point1Name,
      point2Name: point2Name,
      coordinates: coordinates,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
      showLength: trailingOptions.some(function(part) {
        return /^length\s*=\s*1$/i.test(part);
      }),
      segmentName: parsedName.name,
      showName: parsedName.showName && !standaloneHiddenName,
      strokeWidth: parseStrokeWidth(strokeWidthToken),
      ...design
    };
  }

  function entryKey(uid: string): string {
    return 'distance-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__distanceEntries[key];
    if (!entry) return;

    try {
      if (entry.board && entry.label) entry.board.removeObject(entry.label);
    } catch (e) {}

    (Array.isArray(entry.capSegments) ? entry.capSegments : []).forEach(function(segment: any) {
      try { if (entry.board && segment) entry.board.removeObject(segment); } catch (e) {}
    });
    (Array.isArray(entry.capPoints) ? entry.capPoints : []).forEach(function(point: any) {
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    const segments = Array.isArray(entry.segments)
      ? entry.segments
      : (entry.segment ? [entry.segment] : []);
    segments.forEach(function(segment: any) {
      try { if (entry.board && segment) entry.board.removeObject(segment); } catch (e) {}
    });
    (Array.isArray(entry.ownedPoints) ? entry.ownedPoints : []).forEach(function(point: any) {
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });

    delete window.__distanceEntries[key];
    try { if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects(); } catch (e) {}
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function endpointTangentScreen(
    board: any,
    points: any[],
    atStart: boolean
  ): { x: number; y: number; length: number } {
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const endpointIndex = atStart ? 0 : points.length - 1;
    const endpoint = points[endpointIndex];
    if (!endpoint) return { x: 0, y: 0, length: 0 };

    const step = atStart ? 1 : -1;
    for (
      let index = endpointIndex + step;
      index >= 0 && index < points.length;
      index += step
    ) {
      try {
        const x = (Number(points[index].X()) - Number(endpoint.X())) * unitX;
        const y = -(Number(points[index].Y()) - Number(endpoint.Y())) * unitY;
        const length = Math.hypot(x, y);
        if (Number.isFinite(length) && length > 1e-9) return { x, y, length };
      } catch (e) {}
    }
    return { x: 0, y: 0, length: 0 };
  }

  function capOffset(
    board: any,
    points: any[],
    atStart: boolean,
    side: number
  ): CoordinatePair {
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const tangent = endpointTangentScreen(board, points, atStart);
    if (tangent.length <= 1e-9) return { x: 0, y: 0 };
    const normalScreenX = -tangent.y / tangent.length;
    const normalScreenY = tangent.x / tangent.length;
    const halfLengthPx = 6;
    return {
      x: side * normalScreenX * halfLengthPx / unitX,
      y: -side * normalScreenY * halfLengthPx / unitY
    };
  }

  function createCap(
    board: any,
    points: any[],
    atStart: boolean,
    color: string,
    strokeWidth: number
  ): DistanceCap {
    const endpoint = points[atStart ? 0 : points.length - 1];
    const makePoint = function(side: number) {
      const point = board.create('point', [
        function() { return Number(endpoint.X()) + capOffset(board, points, atStart, side).x; },
        function() { return Number(endpoint.Y()) + capOffset(board, points, atStart, side).y; }
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
      try { if (typeof point.addParents === 'function') point.addParents(points); } catch (e) {}
      return point;
    };
    const capPoints = [makePoint(-1), makePoint(1)];
    const segment = board.create('segment', capPoints, {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      visible: function() {
        return endpointTangentScreen(board, points, atStart).length > 1e-9;
      },
      strokeColor: color,
      highlightStrokeColor: color,
      strokeWidth,
      highlightStrokeWidth: strokeWidth,
      lineCap: 'round'
    });
    return { segment, points: capPoints };
  }

  function applySegmentStyle(
    segment: any,
    color: string,
    strokeWidth: number,
    firstArrow: boolean,
    lastArrow: boolean,
    normalizedDesign: string
  ): void {
    if (!segment || typeof segment.setAttribute !== 'function') return;

    try {
      segment.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color,
        strokeWidth,
        highlightStrokeWidth: strokeWidth,
        firstArrow: arrowHead(firstArrow, strokeWidth),
        lastArrow: arrowHead(lastArrow, strokeWidth)
      });
    } catch (e) {}
    try {
      segment.__liaDistanceColor = color;
      segment.__liaDistanceStrokeWidth = strokeWidth;
      segment.__liaDistanceDesign = normalizedDesign;
    } catch (e) {}
  }

  function applySegmentStyles(
    segments: any[],
    color: string,
    strokeWidth: number,
    firstArrow: boolean,
    lastArrow: boolean,
    normalizedDesign: string
  ): void {
    segments.forEach(function(segment, index) {
      applySegmentStyle(
        segment,
        color,
        strokeWidth,
        firstArrow && index === 0,
        lastArrow && index === segments.length - 1,
        normalizedDesign
      );
    });
  }

  function applyCapStyles(capSegments: any[], color: string, strokeWidth: number): void {
    capSegments.forEach(function(segment) {
      try {
        if (segment && typeof segment.setAttribute === 'function') {
          segment.setAttribute({
            strokeColor: color,
            highlightStrokeColor: color,
            strokeWidth,
            highlightStrokeWidth: strokeWidth
          });
        }
      } catch (e) {}
    });
  }

  function applyLabelColor(label: any, color: string): void {
    if (!label || typeof label.setAttribute !== 'function') return;

    try {
      label.setAttribute({
        strokeColor: color,
        fillColor: color
      });
    } catch (e) {}
  }

  function texPointName(pointName: string): string {
    let name = String(pointName || '').trim();
    if (name.startsWith('\\(') && name.endsWith('\\)')) name = name.slice(2, -2).trim();
    else if (name.startsWith('$') && name.endsWith('$')) name = name.slice(1, -1).trim();

    const subscript = name.match(/^(.+?)_([^{}]+)$/);
    if (subscript) return subscript[1] + '_{' + subscript[2] + '}';
    return name;
  }

  function segmentLabelText(cfg: DistanceConfig, points: any[]): string {
    const visibleName = cfg.showName && cfg.segmentName
      ? texPointName(cfg.segmentName)
      : '';
    if (!cfg.showLength) return visibleName ? '\\(' + visibleName + '\\)' : '';

    let distance = 0;
    try {
      for (let index = 1; index < points.length; index++) {
        distance += Math.hypot(
          points[index].X() - points[index - 1].X(),
          points[index].Y() - points[index - 1].Y()
        );
      }
    } catch (e) { distance = NaN; }

    if (!Number.isFinite(distance)) return '';

    const rounded = Math.round((distance + Number.EPSILON) * 1000) / 1000;
    const unchanged = Math.abs(distance - rounded) <= Math.max(1, Math.abs(distance)) * 1e-10;
    const relation = unchanged ? '=' : '\\approx';
    let value = rounded.toFixed(3);
    if (cfg.language === 'de') value = value.replace('.', '{,}');

    const unit = cfg.language === 'de' ? 'LE' : 'LU';
    const pointNames = texPointName(cfg.point1Name) + texPointName(cfg.point2Name);
    const measuredObject = cfg.showName
      ? (visibleName || (pointNames
        ? '\\left| \\overline{' + pointNames + '} \\right|'
        : 's'))
      : '';
    const measurement = value + '\\,\\mathrm{' + unit + '}';

    return measuredObject
      ? '\\(' + measuredObject + ' ' + relation + ' ' + measurement + '\\)'
      : '\\(' + measurement + '\\)';
  }

  function labelPixelSize(label: any, cfg: DistanceConfig): { width: number; height: number } {
    const renderNodes = [
      label && label.rendNode,
      label && label.rendNodeText
    ];

    for (let i = 0; i < renderNodes.length; i++) {
      const node = renderNodes[i];
      if (!node || typeof node.getBoundingClientRect !== 'function') continue;

      try {
        const rect = node.getBoundingClientRect();
        if (rect && rect.width > 1 && rect.height > 1) {
          return { width: rect.width, height: rect.height };
        }
      } catch (e) {}
    }

    try {
      if (label && typeof label.getSize === 'function') {
        const size = label.getSize();
        if (Array.isArray(size) && size[0] > 1 && size[1] > 1) {
          return { width: Number(size[0]), height: Number(size[1]) };
        }
      }
    } catch (e) {}

    try {
      if (label && Array.isArray(label.size) && label.size[0] > 1 && label.size[1] > 1) {
        return { width: Number(label.size[0]), height: Number(label.size[1]) };
      }
    } catch (e) {}

    // Conservative first-render estimate until MathJax exposes its real bounds.
    return {
      width: cfg.segmentName ? 105 : 155,
      height: 22
    };
  }

  function labelPosition(
    board: any,
    points: any[],
    label: any,
    cfg: DistanceConfig
  ): { x: number; y: number } {
    if (!Array.isArray(points) || points.length < 2) return { x: 0, y: 0 };
    let point1 = points[0];
    let point2 = points[1];
    let midpointX = (Number(point1.X()) + Number(point2.X())) / 2;
    let midpointY = (Number(point1.Y()) + Number(point2.Y())) / 2;
    const lengths: number[] = [];
    let totalLength = 0;
    for (let index = 1; index < points.length; index++) {
      const length = Math.hypot(
        Number(points[index].X()) - Number(points[index - 1].X()),
        Number(points[index].Y()) - Number(points[index - 1].Y())
      );
      lengths.push(length);
      totalLength += length;
    }
    if (totalLength > 1e-12) {
      const target = totalLength / 2;
      let traversed = 0;
      for (let index = 0; index < lengths.length; index++) {
        const length = lengths[index];
        if (traversed + length + 1e-12 < target) {
          traversed += length;
          continue;
        }
        point1 = points[index];
        point2 = points[index + 1];
        const ratio = length > 1e-12
          ? Math.max(0, Math.min(1, (target - traversed) / length))
          : 0.5;
        midpointX = Number(point1.X()) + ratio * (Number(point2.X()) - Number(point1.X()));
        midpointY = Number(point1.Y()) + ratio * (Number(point2.Y()) - Number(point1.Y()));
        break;
      }
    }
    const x1 = Number(point1.X());
    const y1 = Number(point1.Y());
    const x2 = Number(point2.X());
    const y2 = Number(point2.Y());
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));

    // Work in screen space so the visual gap remains constant while zooming.
    const segmentX = (x2 - x1) * unitX;
    const segmentY = -(y2 - y1) * unitY;
    const segmentLength = Math.hypot(segmentX, segmentY);
    let normalX = Math.SQRT1_2;
    let normalY = Math.SQRT1_2;

    if (segmentLength > 1e-9) {
      normalX = -segmentY / segmentLength;
      normalY = segmentX / segmentLength;

      // Choose the perpendicular side pointing more strongly to screen bottom-right.
      if (normalX + normalY < 0) {
        normalX = -normalX;
        normalY = -normalY;
      }
    }

    const labelSize = labelPixelSize(label, cfg);
    const halfExtentAlongNormal = (
      Math.abs(normalX) * labelSize.width +
      Math.abs(normalY) * labelSize.height
    ) / 2;
    const lineGapPx = Math.max(6, cfg.strokeWidth / 2 + 3);
    const offsetPx = halfExtentAlongNormal + lineGapPx;

    return {
      x: midpointX + normalX * offsetPx / unitX,
      y: midpointY - normalY * offsetPx / unitY
    };
  }

  function createLengthLabel(board: any, points: any[], cfg: DistanceConfig): any {
    let label = null;

    label = board.create('text', [
      function() { return labelPosition(board, points, label, cfg).x; },
      function() { return labelPosition(board, points, label, cfg).y; },
      function() { return segmentLabelText(cfg, points); }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: cfg.color,
      fillColor: cfg.color,
      fontSize: 14
    });

    // MathJax changes the DOM bounds asynchronously. Re-run the position after
    // its first layout passes so the final rectangle keeps the requested gap.
    scheduleBootstrap(function() {
      try { board.update(); } catch (e) {}
    });
    setTimeout(function() {
      try { board.update(); } catch (e) {}
    }, 500);

    return label;
  }

  window.renderDistanceFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseDistanceSpec(spec, language);
    const key = entryKey(uid);
    const coordinateMode = !!cfg.coordinates;

    if (!uid || !cfg.boardId ||
        (coordinateMode
          ? (cfg.coordinates!.length < 2)
          : (!cfg.point1Name || !cfg.point2Name))) {
      removeEntry(uid);
      return false;
    }

    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }

    const namedPoints = coordinateMode
      ? []
      : [
          getLivePoint(board, cfg.boardId, cfg.point1Name),
          getLivePoint(board, cfg.boardId, cfg.point2Name)
        ];
    if (!coordinateMode && (!namedPoints[0] || !namedPoints[1] || namedPoints[0] === namedPoints[1])) {
      removeEntry(uid);
      return false;
    }

    const old = window.__distanceEntries[key];
    const geometryUnchanged = coordinateMode
      ? !!(old && sameCoordinates(old.coordinates || null, cfg.coordinates))
      : !!(old && Array.isArray(old.points) &&
          old.points[0] === namedPoints[0] && old.points[1] === namedPoints[1]);
    if (
      old &&
      old.board === board &&
      old.boardId === cfg.boardId &&
      geometryUnchanged &&
      old.point1Name === cfg.point1Name &&
      old.point2Name === cfg.point2Name &&
      old.language === cfg.language &&
      old.showLength === cfg.showLength &&
      old.segmentName === cfg.segmentName &&
      old.showName === cfg.showName &&
      old.normalizedDesign === cfg.normalizedDesign &&
      (!(cfg.showLength || (cfg.showName && cfg.segmentName)) || old.label) &&
      Array.isArray(old.segments) &&
      old.segments.length === (coordinateMode ? cfg.coordinates!.length - 1 : 1) &&
      Array.isArray(old.capSegments) &&
      old.capSegments.length === (cfg.startCap ? 1 : 0) + (cfg.endCap ? 1 : 0)
    ) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      old.strokeWidth = cfg.strokeWidth;
      old.firstArrow = cfg.firstArrow;
      old.lastArrow = cfg.lastArrow;
      old.startCap = cfg.startCap;
      old.endCap = cfg.endCap;
      applySegmentStyles(
        old.segments,
        cfg.color,
        cfg.strokeWidth,
        cfg.firstArrow,
        cfg.lastArrow,
        cfg.normalizedDesign
      );
      applyCapStyles(old.capSegments, cfg.color, cfg.strokeWidth);
      applyLabelColor(old.label, cfg.color);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);

    const ownedPoints: any[] = [];
    const segments: any[] = [];
    const capSegments: any[] = [];
    const capPoints: any[] = [];
    let label = null;

    try {
      const points = coordinateMode
        ? cfg.coordinates!.map(function(coordinate) {
            const point = createHiddenPoint(board, coordinate);
            ownedPoints.push(point);
            return point;
          })
        : namedPoints;

      for (let index = 1; index < points.length; index++) {
        const segment = board.create('segment', [points[index - 1], points[index]], {
          name: '',
          withLabel: false,
          fixed: true,
          highlight: false,
          strokeColor: cfg.color,
          highlightStrokeColor: cfg.color,
          strokeWidth: cfg.strokeWidth,
          highlightStrokeWidth: cfg.strokeWidth,
          firstArrow: arrowHead(cfg.firstArrow && index === 1, cfg.strokeWidth),
          lastArrow: arrowHead(
            cfg.lastArrow && index === points.length - 1,
            cfg.strokeWidth
          ),
          straightFirst: false,
          straightLast: false
        });
        segment.__liaDgsSegmentName = cfg.segmentName;
        segment.__liaDgsShowName = cfg.showName;
        segment.__liaDgsShowLength = cfg.showLength;
        segment.__liaDistanceColor = cfg.color;
        segment.__liaDistanceStrokeWidth = cfg.strokeWidth;
        segment.__liaDistanceDesign = cfg.normalizedDesign;
        segments.push(segment);
      }

      if (cfg.startCap) {
        const cap = createCap(board, points, true, cfg.color, cfg.strokeWidth);
        capSegments.push(cap.segment);
        capPoints.push.apply(capPoints, cap.points);
      }
      if (cfg.endCap) {
        const cap = createCap(board, points, false, cfg.color, cfg.strokeWidth);
        capSegments.push(cap.segment);
        capPoints.push.apply(capPoints, cap.points);
      }

      if (cfg.showLength || (cfg.showName && cfg.segmentName)) {
        label = createLengthLabel(board, points, cfg);
      }

      window.__distanceEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        point1Name: cfg.point1Name,
        point2Name: cfg.point2Name,
        coordinates: cfg.coordinates ? cfg.coordinates.map(function(point) {
          return { x: point.x, y: point.y };
        }) : null,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        language: cfg.language,
        showLength: cfg.showLength,
        segmentName: cfg.segmentName,
        showName: cfg.showName,
        strokeWidth: cfg.strokeWidth,
        normalizedDesign: cfg.normalizedDesign,
        firstArrow: cfg.firstArrow,
        lastArrow: cfg.lastArrow,
        startCap: cfg.startCap,
        endCap: cfg.endCap,
        board: board,
        points: points,
        point1: points[0],
        point2: points[points.length - 1],
        segments: segments,
        segment: segments[0] || null,
        capSegments: capSegments,
        capPoints: capPoints,
        ownedPoints: ownedPoints,
        label: label
      };

      try { board.update(); } catch (e) {}
      try { if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      segments.forEach(function(segment) {
        try { board.removeObject(segment); } catch (removeError) {}
      });
      capSegments.forEach(function(segment) {
        try { board.removeObject(segment); } catch (removeError) {}
      });
      capPoints.forEach(function(point) {
        try { board.removeObject(point); } catch (removeError) {}
      });
      ownedPoints.forEach(function(point) {
        try { board.removeObject(point); } catch (removeError) {}
      });
      return false;
    }
  };

  window.__bootstrapDistances = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="distance-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^distance-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;

      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderDistanceFromSpec || !window.renderDistanceFromSpec(uid, spec, language)) {
        pending = true;
      }
    });

    Object.keys(window.__distanceEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });

    hasPendingDistances = pending;
  };

  window.__scheduleBootstrapDistances = function(): void {
    if (window.__bootstrapDistancesRAF) return;

    window.__bootstrapDistancesRAF = requestAnimationFrame(function() {
      window.__bootstrapDistancesRAF = 0;
      try {
        if (window.__bootstrapDistances) window.__bootstrapDistances();
      } catch (e) {}
    });
  };

  function containsDistanceSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^distance-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="distance-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];

        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^distance-spec-/.test(target.id));
          continue;
        }

        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsDistanceSpec);
      }

      if (needsBootstrap && window.__scheduleBootstrapDistances) {
        window.__scheduleBootstrapDistances();
      }
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

  window.__registerLiaThemeListener(function() {
    Object.keys(window.__distanceEntries || {}).forEach(function(key) {
      const entry = window.__distanceEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) {
        entry.color = getAccentColor();
        applySegmentStyles(
          Array.isArray(entry.segments) ? entry.segments : (entry.segment ? [entry.segment] : []),
          entry.color,
          Number(entry.strokeWidth) || 3,
          !!entry.firstArrow,
          !!entry.lastArrow,
          String(entry.normalizedDesign || '')
        );
        applyCapStyles(
          Array.isArray(entry.capSegments) ? entry.capSegments : [],
          entry.color,
          Number(entry.strokeWidth) || 3
        );
      }
      applyLabelColor(entry.label, entry.color);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  // Keep retrying only while at least one declared segment is still waiting
  // for its board or one of its named points.
  window.__distanceRetryInterval = setInterval(function() {
    if (hasPendingDistances && window.__scheduleBootstrapDistances) {
      window.__scheduleBootstrapDistances();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances();
  });
}
