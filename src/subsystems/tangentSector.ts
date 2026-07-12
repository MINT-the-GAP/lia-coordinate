// Tangent and circular-sector subsystem (@Tangent/@Tangente,
// @CircularSector/@Kreissektor/@Kreissegment macros).

import {
  CoordinatePair,
  isHiddenNameOption,
  parseCoordinateList,
  parseMacroName,
  splitTopLevel,
  unquote
} from '../shared/parser';
import { getAccentColor, getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

type SourceKind = 'function' | 'linear' | 'circle';

interface ResolvedSource {
  object: any;
  kind: SourceKind;
}

interface TangentConfig {
  boardId: string;
  sourceName: string;
  sourcePointNames: string[] | null;
  sourceCoordinates: CoordinatePair[] | null;
  contact: CoordinatePair | null;
  contactPointName: string;
  color: string;
  hasExplicitColor: boolean;
  lineName: string;
  pointName: string;
  lineShowName: boolean;
  pointShowName: boolean;
  language: 'de' | 'en';
}

interface SectorConfig {
  boardId: string;
  pointNames: string[];
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
  objectName: string;
  showName: boolean;
  showArea: boolean;
  showPerimeter: boolean;
  language: 'de' | 'en';
}

export function init(): void {
  if (window.__tangentSectorReady) {
    try { if (window.__scheduleBootstrapTangentSectorObjects) window.__scheduleBootstrapTangentSectorObjects(); } catch (e) {}
    return;
  }

  window.__tangentSectorReady = true;
  window.__tangentEntries = window.__tangentEntries || {};
  window.__sectorEntries = window.__sectorEntries || {};
  initThemeSync();

  let hasPendingTangentSectorObjects = false;

  function parseCoordinatePair(value: unknown): CoordinatePair | null {
    const raw = unquote(String(value == null ? '' : value)).trim();
    if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
    const parts = splitTopLevel(raw.slice(1, -1), ';')
      .map(function(part) { return unquote(part).trim(); });
    if (parts.length !== 2) return null;
    const x = Number(parts[0].replace(',', '.'));
    const y = Number(parts[1].replace(',', '.'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function parsePointList(value: unknown): string[] | null {
    const raw = unquote(String(value == null ? '' : value)).trim();
    if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
    if (parseCoordinateList(raw)) return null;
    const names = splitTopLevel(raw.slice(1, -1), ';')
      .map(function(name) { return unquote(name).trim(); })
      .filter(Boolean);
    return names.length ? names : null;
  }

  function isTruthyOption(option: string, de: string, en: string): boolean {
    const pattern = new RegExp('^(?:' + de + '|' + en + ')\\s*=\\s*1$', 'i');
    return pattern.test(String(option || '').trim());
  }

  function parseTangentSpec(spec: string, language?: string): TangentConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const sourceSpec = String(parts[1] || '').trim();
    const sourceCoordinates = parseCoordinateList(sourceSpec);
    const sourcePointNames = sourceCoordinates ? null : parsePointList(sourceSpec);
    const explicitColor = String(parts[3] || '').trim();
    const options = parts.slice(4)
      .map(function(part) { return String(part || '').trim(); })
      .filter(Boolean);
    let lineName = '';
    let pointName = '';
    let hideAllNames = false;
    options.forEach(function(option) {
      if (isHiddenNameOption(option)) {
        hideAllNames = true;
        return;
      }
      let match = option.match(/^(?:name|line|gerade|tangente)\s*=\s*(.+)$/i);
      if (match) {
        lineName = String(match[1] || '').trim();
        return;
      }
      match = option.match(/^(?:point|punkt|contact|beruehrpunkt|berührpunkt)\s*=\s*(.+)$/i);
      if (match) {
        pointName = String(match[1] || '').trim();
        return;
      }
      if (!lineName) lineName = option;
      else if (!pointName) pointName = option;
    });
    const parsedLineName = parseMacroName(lineName);
    const parsedPointName = parseMacroName(pointName);
    const contact = parseCoordinatePair(parts[2] || '');

    return {
      boardId: String(parts[0] || '').trim(),
      sourceName: sourceCoordinates || sourcePointNames ? '' : sourceSpec,
      sourcePointNames: sourcePointNames && sourcePointNames.length >= 2 ? sourcePointNames.slice(0, 2) : null,
      sourceCoordinates: sourceCoordinates && sourceCoordinates.length >= 2 ? sourceCoordinates.slice(0, 2) : null,
      contact,
      contactPointName: contact ? '' : String(parts[2] || '').trim(),
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      lineName: parsedLineName.name,
      pointName: parsedPointName.name,
      lineShowName: parsedLineName.showName && !hideAllNames,
      pointShowName: parsedPointName.showName && !hideAllNames,
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
    };
  }

  function parseSectorSpec(spec: string, language?: string): SectorConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const names = parsePointList(parts[1] || '') || [];
    const explicitColor = String(parts[2] || '').trim();
    const parsedOpacity = parseFloat(String(parts[3] || '').replace(',', '.'));
    const opacity = Number.isFinite(parsedOpacity) ? Math.max(0, Math.min(1, parsedOpacity)) : 0.2;
    const options = parts.slice(4)
      .map(function(part) { return String(part || '').trim(); })
      .filter(Boolean);
    const hideName = options.some(isHiddenNameOption);
    const namedOption = options.map(function(option) {
      if (isHiddenNameOption(option)) return '';
      const match = option.match(/^name\s*=\s*(.+)$/i);
      return match ? String(match[1] || '').trim() : '';
    }).find(Boolean) || '';
    const objectNameToken = namedOption || options.find(function(option) {
      return !isHiddenNameOption(option) &&
        !/^name\s*=/i.test(option) &&
        !isTruthyOption(option, 'inhalt', 'area') &&
        !isTruthyOption(option, 'umfang', 'perimeter') &&
        !isTruthyOption(option, 'umfang', 'circumference');
    }) || '';
    const parsedObjectName = parseMacroName(objectNameToken);

    return {
      boardId: String(parts[0] || '').trim(),
      pointNames: names.slice(0, 3),
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      opacity,
      objectName: parsedObjectName.name,
      showName: parsedObjectName.showName && !hideName,
      showArea: options.some(function(option) { return isTruthyOption(option, 'inhalt', 'area'); }),
      showPerimeter: options.some(function(option) {
        return isTruthyOption(option, 'umfang', 'perimeter') || isTruthyOption(option, 'umfang', 'circumference');
      }),
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
    };
  }

  function tangentKey(uid: string): string {
    return 'tangent-' + String(uid || '');
  }

  function sectorKey(uid: string): string {
    return 'sector-' + String(uid || '');
  }

  function normalizeName(value: unknown): string {
    let name = String(value == null ? '' : value).trim();
    if (name.startsWith('\\(') && name.endsWith('\\)')) name = name.slice(2, -2).trim();
    else if (name.startsWith('$') && name.endsWith('$')) name = name.slice(1, -1).trim();
    name = name.replace(/^\\overrightarrow\{(.+)\}$/, '$1');
    return name;
  }

  function namesEqual(a: unknown, b: unknown): boolean {
    return !!normalizeName(a) && normalizeName(a) === normalizeName(b);
  }

  function texName(name: string): string {
    let value = normalizeName(name);
    const subscript = value.match(/^(.+?)_([^{}]+)$/);
    if (subscript) value = subscript[1] + '_{' + subscript[2] + '}';
    return value;
  }

  function mathName(name: string): string {
    const body = texName(name);
    return body ? '\\(' + body + '\\)' : '';
  }

  function getBoardObjects(board: any): any[] {
    const seen = new Set<any>();
    const objects: any[] = [];
    const add = function(object: any) {
      if (!object || seen.has(object)) return;
      seen.add(object);
      objects.push(object);
    };
    try { if (Array.isArray(board && board.objectsList)) board.objectsList.forEach(add); } catch (e) {}
    try {
      if (board && board.objects && typeof board.objects === 'object') {
        Object.keys(board.objects).forEach(function(key) { add(board.objects[key]); });
      }
    } catch (e) {}
    return objects;
  }

  function sourceKind(object: any): SourceKind | null {
    if (!object) return null;
    const type = String(object.elType || '').toLowerCase();
    if (typeof object.Y === 'function' && (object.__liaDgsFunction || object.__liaPlotFunctionName || type === 'functiongraph')) return 'function';
    if (object.__liaDgsCircle || type === 'circle' || typeof object.Radius === 'function') return 'circle';
    if (object.point1 && object.point2) return 'linear';
    return null;
  }

  function sourceFromObject(object: any): ResolvedSource | null {
    const kind = sourceKind(object);
    return kind ? { object, kind } : null;
  }

  function candidateSourceNames(object: any): string[] {
    return [
      object && object.__liaDgsFunctionName,
      object && object.__liaPlotFunctionName,
      object && object.__liaDgsCircleName,
      object && object.__liaDgsSegmentName,
      object && object.__liaDgsLineName,
      object && object.__liaDgsRayName,
      object && object.__liaDgsVectorName,
      object && object.__liaMacroRelationName,
      object && object.name
    ].map(normalizeName).filter(Boolean);
  }

  function findNamedSource(board: any, boardId: string, sourceName: string): ResolvedSource | null {
    const wanted = normalizeName(sourceName);
    if (!board || !wanted) return null;

    const plotEntries = window.__plotFunctionEntries || {};
    for (const key of Object.keys(plotEntries)) {
      const entry = plotEntries[key];
      if (!entry || entry.boardId !== boardId || entry.graph?.board !== board) continue;
      if (namesEqual(entry.name, wanted)) return { object: entry.graph, kind: 'function' };
    }

    const tangentEntries = window.__tangentEntries || {};
    for (const key of Object.keys(tangentEntries)) {
      const entry = tangentEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board || !entry.tangent) continue;
      if (namesEqual(entry.lineName, wanted)) return { object: entry.tangent, kind: 'linear' };
    }

    const linearEntries = window.__linearObjectEntries || {};
    for (const key of Object.keys(linearEntries)) {
      const entry = linearEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board || !entry.object) continue;
      const autoVectorName = entry.kind === 'vector'
        ? normalizeName(String(entry.point1Name || '') + String(entry.point2Name || ''))
        : '';
      if (namesEqual(entry.objectName, wanted) || (autoVectorName && autoVectorName === wanted)) {
        return { object: entry.object, kind: 'linear' };
      }
    }

    const distanceEntries = window.__distanceEntries || {};
    for (const key of Object.keys(distanceEntries)) {
      const entry = distanceEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board) continue;
      if (!namesEqual(entry.segmentName, wanted)) continue;
      const segment = entry.segment || (Array.isArray(entry.segments) ? entry.segments[0] : null);
      if (segment) return { object: segment, kind: 'linear' };
    }

    const relationEntries = window.__relationObjectEntries || {};
    for (const key of Object.keys(relationEntries)) {
      const entry = relationEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board || entry.kind === 'midpoint') continue;
      if (namesEqual(entry.objectName, wanted) && entry.object) return { object: entry.object, kind: 'linear' };
    }

    const circleEntries = window.__circleEntries || {};
    for (const key of Object.keys(circleEntries)) {
      const entry = circleEntries[key];
      if (!entry || entry.boardId !== boardId || entry.board !== board || !entry.circle) continue;
      if (namesEqual(entry.name, wanted)) return { object: entry.circle, kind: 'circle' };
    }

    for (const object of getBoardObjects(board)) {
      if (!candidateSourceNames(object).some(function(name) { return name === wanted; })) continue;
      const source = sourceFromObject(object);
      if (source) return source;
    }
    return null;
  }

  function getLivePoint(board: any, boardId: string, pointName: string): any {
    const point = window.__points && window.__points[boardId] && window.__points[boardId][pointName];
    if (!board || !point) return null;
    try {
      if (point.board !== board) return null;
      if (typeof point.X !== 'function' || typeof point.Y !== 'function') return null;
    } catch (e) { return null; }
    return point;
  }

  function createHiddenPoint(board: any, coordinate: CoordinatePair): any {
    return board.create('point', [coordinate.x, coordinate.y], {
      name: '',
      withLabel: false,
      visible: false,
      fixed: true,
      frozen: true,
      highlight: false,
      showInfobox: false,
      size: 0
    });
  }

  function createHiddenSegment(board: any, points: any[]): any {
    return board.create('segment', points, {
      name: '',
      withLabel: false,
      visible: false,
      fixed: true,
      highlight: false
    });
  }

  function resolveSource(board: any, cfg: TangentConfig): { source: ResolvedSource; ownedObjects: any[] } | null {
    const ownedObjects: any[] = [];
    if (cfg.sourceCoordinates) {
      const points = cfg.sourceCoordinates.map(function(coordinate) {
        const point = createHiddenPoint(board, coordinate);
        ownedObjects.push(point);
        return point;
      });
      const segment = createHiddenSegment(board, points);
      ownedObjects.push(segment);
      return { source: { object: segment, kind: 'linear' }, ownedObjects };
    }
    if (cfg.sourcePointNames) {
      const points = cfg.sourcePointNames.map(function(name) { return getLivePoint(board, cfg.boardId, name); });
      if (!points[0] || !points[1] || points[0] === points[1]) return null;
      const segment = createHiddenSegment(board, points);
      ownedObjects.push(segment);
      return { source: { object: segment, kind: 'linear' }, ownedObjects };
    }
    const source = findNamedSource(board, cfg.boardId, cfg.sourceName);
    return source ? { source, ownedObjects } : null;
  }

  function sourceY(source: any, x: number): number {
    try {
      const evaluator = typeof source.__liaDgsFunctionEvaluator === 'function'
        ? source.__liaDgsFunctionEvaluator
        : (typeof source.Y === 'function' ? source.Y.bind(source) : null);
      if (!evaluator) return NaN;
      const value = Number(evaluator(x));
      return Number.isFinite(value) ? value : NaN;
    } catch (e) { return NaN; }
  }

  function tangentSlope(board: any, source: any, x: number): number {
    let span = 10;
    try {
      const bbox = board.getBoundingBox();
      if (Array.isArray(bbox) && bbox.length === 4) span = Math.abs(Number(bbox[2]) - Number(bbox[0])) || span;
    } catch (e) {}
    const h = Math.max(1e-6, span * 1e-5);
    const left = sourceY(source, x - h);
    const right = sourceY(source, x + h);
    if (Number.isFinite(left) && Number.isFinite(right)) return (right - left) / (2 * h);
    const center = sourceY(source, x);
    if (Number.isFinite(center) && Number.isFinite(right)) return (right - center) / h;
    if (Number.isFinite(center) && Number.isFinite(left)) return (center - left) / h;
    return NaN;
  }

  function circleCenter(source: any): any {
    return source && (source.__liaDgsCircleCenter || source.center || source.midpoint ||
      (Array.isArray(source.parents) ? source.parents[0] : null));
  }

  function tangentDirection(board: any, source: ResolvedSource, x: number, y: number): { x: number; y: number } | null {
    if (source.kind === 'function') {
      const slope = tangentSlope(board, source.object, x);
      return Number.isFinite(slope) ? { x: 1, y: slope } : null;
    }
    if (source.kind === 'circle') {
      const center = circleCenter(source.object);
      try {
        const radiusX = x - Number(center.X());
        const radiusY = y - Number(center.Y());
        return Math.hypot(radiusX, radiusY) > 1e-12 ? { x: -radiusY, y: radiusX } : null;
      } catch (e) { return null; }
    }
    try {
      const dx = Number(source.object.point2.X()) - Number(source.object.point1.X());
      const dy = Number(source.object.point2.Y()) - Number(source.object.point1.Y());
      return Math.hypot(dx, dy) > 1e-12 ? { x: dx, y: dy } : null;
    } catch (e) { return null; }
  }

  function applyTangentStyle(tangent: any, contactPoint: any, color: string): void {
    try {
      if (tangent && typeof tangent.setAttribute === 'function') tangent.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color,
        label: { strokeColor: color, fillColor: color, highlightStrokeColor: color, highlightFillColor: color }
      });
    } catch (e) {}
    try {
      if (contactPoint && typeof contactPoint.setAttribute === 'function') contactPoint.setAttribute({
        strokeColor: color,
        fillColor: color,
        highlightStrokeColor: color,
        highlightFillColor: color
      });
    } catch (e) {}
  }

  function notifyDependentObjectBootstraps(boardId?: string): void {
    try { if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects(); } catch (e) {}
    try { if (window.__scheduleBootstrapObjectAnalysisPoints) window.__scheduleBootstrapObjectAnalysisPoints(); } catch (e) {}
    try { if (window.__scheduleObjectAnalysisPointsForBoard) window.__scheduleObjectAnalysisPointsForBoard(boardId); } catch (e) {}
  }

  function removeTangentEntryByKey(key: string): void {
    const entry = window.__tangentEntries[key];
    if (!entry) return;
    try {
      const source = entry.source && entry.source.object;
      if (source && Array.isArray(source.__liaDgsTangents)) {
        source.__liaDgsTangents = source.__liaDgsTangents.filter(function(candidate: any) { return candidate !== entry.tangent; });
      }
    } catch (e) {}
    try {
      const pointName = String(entry.pointName || '');
      if (pointName && window.__points && window.__points[entry.boardId] && window.__points[entry.boardId][pointName] === entry.contactPoint) {
        delete window.__points[entry.boardId][pointName];
      }
    } catch (e) {}
    try { if (entry.board && entry.tangent) entry.board.removeObject(entry.tangent); } catch (e) {}
    try { if (entry.board && entry.helperPoint) entry.board.removeObject(entry.helperPoint); } catch (e) {}
    try { if (entry.board && entry.contactPoint) entry.board.removeObject(entry.contactPoint); } catch (e) {}
    (Array.isArray(entry.ownedObjects) ? entry.ownedObjects : []).slice().reverse().forEach(function(object: any) {
      try { if (entry.board && object) entry.board.removeObject(object); } catch (e) {}
    });
    delete window.__tangentEntries[key];
    notifyDependentObjectBootstraps(entry.boardId);
  }

  function removeTangentEntry(uid: string): void {
    removeTangentEntryByKey(tangentKey(uid));
  }

  function renderTangent(uid: string, cfg: TangentConfig, board: any): boolean {
    const key = tangentKey(uid);
    if (!uid || !cfg.boardId || (!cfg.sourceName && !cfg.sourcePointNames && !cfg.sourceCoordinates) || !cfg.contact) {
      removeTangentEntry(uid);
      return false;
    }
    const resolved = resolveSource(board, cfg);
    if (!resolved) {
      removeTangentEntry(uid);
      return false;
    }
    let contactX = cfg.contact.x;
    let contactY = cfg.contact.y;
    if (resolved.source.kind === 'function') {
      const y = sourceY(resolved.source.object, contactX);
      if (Number.isFinite(y)) contactY = y;
    }
    if (!tangentDirection(board, resolved.source, contactX, contactY)) {
      resolved.ownedObjects.forEach(function(object) { try { board.removeObject(object); } catch (e) {} });
      removeTangentEntry(uid);
      return false;
    }
    const old = window.__tangentEntries[key];
    if (old && old.board === board && old.source?.object === resolved.source.object && old.source?.kind === resolved.source.kind &&
        Math.abs(Number(old.contact?.x) - cfg.contact.x) < 1e-12 && Math.abs(Number(old.contact?.y) - cfg.contact.y) < 1e-12 &&
        old.lineName === cfg.lineName && old.pointName === cfg.pointName &&
        old.lineShowName === cfg.lineShowName && old.pointShowName === cfg.pointShowName &&
        old.language === cfg.language) {
      resolved.ownedObjects.forEach(function(object) { try { board.removeObject(object); } catch (e) {} });
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyTangentStyle(old.tangent, old.contactPoint, cfg.color);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeTangentEntry(uid);
    let contactPoint: any = null;
    let helperPoint: any = null;
    let tangent: any = null;
    try {
      const pointName = cfg.pointName || cfg.contactPointName || '';
      const lineName = cfg.lineName || '';
      contactPoint = board.create('glider', [contactX, contactY, resolved.source.object], {
        name: mathName(pointName),
        fixed: false,
        withLabel: !!pointName,
        showInfobox: false,
        strokeColor: cfg.color,
        fillColor: cfg.color,
        highlightStrokeColor: cfg.color,
        highlightFillColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        face: 'x',
        size: 7,
        label: {
          visible: !!pointName && cfg.pointShowName,
          strokeColor: getNeutralColor(),
          fillColor: getNeutralColor(),
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });
      helperPoint = board.create('point', [
        function() {
          const x = Number(contactPoint.X());
          const y = Number(contactPoint.Y());
          const direction = tangentDirection(board, resolved.source, x, y);
          if (!direction) return x + 1;
          const length = Math.hypot(direction.x, direction.y) || 1;
          return x + direction.x / length;
        },
        function() {
          const x = Number(contactPoint.X());
          const y = Number(contactPoint.Y());
          const direction = tangentDirection(board, resolved.source, x, y);
          if (!direction) return y;
          const length = Math.hypot(direction.x, direction.y) || 1;
          return y + direction.y / length;
        }
      ], {
        name: '',
        fixed: true,
        visible: false,
        withLabel: false
      });
      tangent = board.create('line', [contactPoint, helperPoint], {
        name: mathName(lineName),
        withLabel: !!lineName,
        fixed: true,
        straightFirst: true,
        straightLast: true,
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 4,
        label: {
          visible: !!lineName && cfg.lineShowName,
          strokeColor: cfg.color,
          fillColor: cfg.color,
          fontSize: 20,
          parse: false,
          useMathJax: true
        }
      });
      contactPoint.__liaDgsPointName = pointName;
      contactPoint.__liaDgsTangentPoint = true;
      contactPoint.__liaDgsTangentLine = tangent;
      contactPoint.__liaDgsLanguage = cfg.language;
      contactPoint.__liaDgsColor = cfg.color;
      contactPoint.__liaDgsTextColor = getNeutralColor();
      contactPoint.__liaDgsLineColor = cfg.color;
      contactPoint.__liaDgsFillColor = cfg.color;
      contactPoint.__liaDgsShowName = !!pointName && cfg.pointShowName;
      contactPoint.__liaDgsShowObject = true;
      contactPoint.__liaDgsOpacity = 1;
      contactPoint.__liaPointVisual = { color: cfg.color, opacity: 1, hasExplicitColor: cfg.hasExplicitColor };
      helperPoint.__liaDgsTangentHelper = true;
      helperPoint.__liaDgsTangentLine = tangent;
      tangent.__liaDgsLine = true;
      tangent.__liaDgsTangent = true;
      tangent.__liaDgsLineName = lineName;
      tangent.__liaDgsTangentSource = resolved.source.object;
      tangent.__liaDgsTangentPoint = contactPoint;
      tangent.__liaDgsTangentHelper = helperPoint;
      tangent.__liaDgsLanguage = cfg.language;
      tangent.__liaDgsColor = cfg.color;
      tangent.__liaDgsLineColor = cfg.color;
      tangent.__liaDgsTextColor = cfg.color;
      tangent.__liaDgsShowName = !!lineName && cfg.lineShowName;
      tangent.__liaDgsShowObject = true;
      tangent.__liaDgsOpacity = 1;
      tangent.__liaDgsShowEquation = false;
      resolved.source.object.__liaDgsTangents = Array.isArray(resolved.source.object.__liaDgsTangents)
        ? resolved.source.object.__liaDgsTangents
        : [];
      resolved.source.object.__liaDgsTangents.push(tangent);
      if (pointName) {
        window.__points = window.__points || {};
        window.__points[cfg.boardId] = window.__points[cfg.boardId] || {};
        window.__points[cfg.boardId][pointName] = contactPoint;
      }
      window.__tangentEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        sourceName: cfg.sourceName,
        sourcePointNames: cfg.sourcePointNames ? cfg.sourcePointNames.slice() : null,
        sourceCoordinates: cfg.sourceCoordinates ? cfg.sourceCoordinates.map(function(point) { return { x: point.x, y: point.y }; }) : null,
        contact: { x: cfg.contact.x, y: cfg.contact.y },
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        lineName,
        pointName,
        lineShowName: cfg.lineShowName,
        pointShowName: cfg.pointShowName,
        language: cfg.language,
        board,
        source: resolved.source,
        contactPoint,
        helperPoint,
        tangent,
        ownedObjects: resolved.ownedObjects
      };
      try { board.update(); } catch (e) {}
      notifyDependentObjectBootstraps(cfg.boardId);
      return true;
    } catch (e) {
      try { if (tangent) board.removeObject(tangent); } catch (removeError) {}
      try { if (helperPoint) board.removeObject(helperPoint); } catch (removeError) {}
      try { if (contactPoint) board.removeObject(contactPoint); } catch (removeError) {}
      resolved.ownedObjects.forEach(function(object) { try { board.removeObject(object); } catch (removeError) {} });
      return false;
    }
  }

  function sectorMetrics(center: any, radiusPoint: any, anglePoint: any): { radius: number; angle: number; area: number; perimeter: number } {
    try {
      const centerX = Number(center.X());
      const centerY = Number(center.Y());
      const radiusX = Number(radiusPoint.X()) - centerX;
      const radiusY = Number(radiusPoint.Y()) - centerY;
      const angleX = Number(anglePoint.X()) - centerX;
      const angleY = Number(anglePoint.Y()) - centerY;
      const radius = Math.hypot(radiusX, radiusY);
      const start = Math.atan2(radiusY, radiusX);
      const end = Math.atan2(angleY, angleX);
      const angle = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      return { radius, angle, area: radius * radius * angle / 2, perimeter: radius * angle + 2 * radius };
    } catch (e) {
      return { radius: NaN, angle: NaN, area: NaN, perimeter: NaN };
    }
  }

  function formatMeasurement(value: number, language: 'de' | 'en'): string {
    if (!Number.isFinite(value)) return '?';
    const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round((value + Number.EPSILON) * 1000) / 1000;
    let text = String(rounded);
    if (language === 'de') text = text.replace('.', '{,}');
    return text;
  }

  function measurementRelation(value: number): string {
    return Number.isFinite(value) ? '\\approx' : '=';
  }

  function sectorLabelText(cfg: SectorConfig, center: any, radiusPoint: any, anglePoint: any): string {
    const lines: string[] = [];
    if (cfg.showName && cfg.objectName) lines.push('\\mathrm{' + texName(cfg.objectName) + '}');
    const metrics = sectorMetrics(center, radiusPoint, anglePoint);
    if (cfg.showArea) {
      lines.push('A ' + measurementRelation(metrics.area) + ' ' + formatMeasurement(metrics.area, cfg.language) + '\\,\\mathrm{' + (cfg.language === 'de' ? 'FE' : 'AU') + '}');
    }
    if (cfg.showPerimeter) {
      lines.push('u ' + measurementRelation(metrics.perimeter) + ' ' + formatMeasurement(metrics.perimeter, cfg.language) + '\\,\\mathrm{' + (cfg.language === 'de' ? 'LE' : 'LU') + '}');
    }
    if (!lines.length) return '';
    if (lines.length === 1) return '\\(' + lines[0] + '\\)';
    return '\\(\\begin{gathered}' + lines.join('\\\\[2pt]') + '\\end{gathered}\\)';
  }

  function applySectorStyle(sector: any, cfg: SectorConfig): void {
    try {
      if (sector && typeof sector.setAttribute === 'function') sector.setAttribute({
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 4,
        fillColor: cfg.color,
        highlightFillColor: cfg.color,
        fillOpacity: cfg.opacity,
        highlightFillOpacity: cfg.opacity,
        label: { strokeColor: cfg.color, fillColor: cfg.color, highlightStrokeColor: cfg.color, highlightFillColor: cfg.color }
      });
      if (sector && sector.label && typeof sector.label.setAttribute === 'function') {
        sector.label.setAttribute({
          strokeColor: cfg.color,
          fillColor: cfg.color,
          visible: !!((cfg.showName && cfg.objectName) || cfg.showArea || cfg.showPerimeter)
        });
      }
    } catch (e) {}
  }

  function removeSectorEntryByKey(key: string): void {
    const entry = window.__sectorEntries[key];
    if (!entry) return;
    try { if (entry.board && entry.sector) entry.board.removeObject(entry.sector); } catch (e) {}
    delete window.__sectorEntries[key];
  }

  function removeSectorEntry(uid: string): void {
    removeSectorEntryByKey(sectorKey(uid));
  }

  function renderSector(uid: string, cfg: SectorConfig, board: any): boolean {
    const key = sectorKey(uid);
    if (!uid || !cfg.boardId || cfg.pointNames.length < 3) {
      removeSectorEntry(uid);
      return false;
    }
    const points = cfg.pointNames.map(function(name) { return getLivePoint(board, cfg.boardId, name); });
    if (!points[0] || !points[1] || !points[2] || new Set(points).size !== 3) {
      removeSectorEntry(uid);
      return false;
    }
    const old = window.__sectorEntries[key];
    if (old && old.board === board && old.points[0] === points[0] && old.points[1] === points[1] && old.points[2] === points[2] &&
        old.objectName === cfg.objectName && old.showName === cfg.showName &&
        old.language === cfg.language && old.showArea === cfg.showArea && old.showPerimeter === cfg.showPerimeter) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      old.opacity = cfg.opacity;
      applySectorStyle(old.sector, cfg);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeSectorEntry(uid);
    let sector: any = null;
    try {
      sector = board.create('sector', points, {
        name: '',
        withLabel: true,
        fixed: true,
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 4,
        fillColor: cfg.color,
        highlightFillColor: cfg.color,
        fillOpacity: cfg.opacity,
        highlightFillOpacity: cfg.opacity,
        label: {
          strokeColor: cfg.color,
          fillColor: cfg.color,
          fontSize: 18,
          parse: false,
          useMathJax: true,
          visible: !!((cfg.showName && cfg.objectName) || cfg.showArea || cfg.showPerimeter)
        }
      });
      sector.__liaDgsSector = true;
      sector.__liaDgsSectorName = cfg.objectName;
      sector.__liaDgsSectorCenter = points[0];
      sector.__liaDgsSectorRadiusPoint = points[1];
      sector.__liaDgsSectorAnglePoint = points[2];
      sector.__liaDgsLanguage = cfg.language;
      sector.__liaDgsColor = cfg.color;
      sector.__liaDgsTextColor = cfg.color;
      sector.__liaDgsLineColor = cfg.color;
      sector.__liaDgsFillColor = cfg.color;
      sector.__liaDgsShowName = !!cfg.objectName && cfg.showName;
      sector.__liaDgsShowObject = true;
      sector.__liaDgsOpacity = cfg.opacity;
      sector.__liaDgsShowArea = cfg.showArea;
      sector.__liaDgsShowPerimeter = cfg.showPerimeter;
      if (sector.label && typeof sector.label.setText === 'function') {
        sector.label.setText(function() { return sectorLabelText(cfg, points[0], points[1], points[2]); });
      }
      applySectorStyle(sector, cfg);
      window.__sectorEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        pointNames: cfg.pointNames.slice(),
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        opacity: cfg.opacity,
        objectName: cfg.objectName,
        showName: cfg.showName,
        language: cfg.language,
        showArea: cfg.showArea,
        showPerimeter: cfg.showPerimeter,
        board,
        points,
        sector
      };
      scheduleBootstrap(function() { try { board.update(); } catch (e) {} });
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (sector) board.removeObject(sector); } catch (removeError) {}
      return false;
    }
  }

  window.renderTangentFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseTangentSpec(spec, language);
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeTangentEntry(uid);
      return false;
    }
    return renderTangent(uid, cfg, board);
  };

  window.renderCircularSectorFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseSectorSpec(spec, language);
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeSectorEntry(uid);
      return false;
    }
    return renderSector(uid, cfg, board);
  };

  window.__bootstrapTangentSectorObjects = function(): void {
    const activeTangentKeys = new Set<string>();
    const activeSectorKeys = new Set<string>();
    let pending = false;

    document.querySelectorAll<HTMLElement>('[id^="tangent-spec-"][data-spec]').forEach(function(node) {
      const uid = String(node.id || '').replace(/^tangent-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeTangentKeys.add(tangentKey(uid));
      if (!spec || !window.renderTangentFromSpec || !window.renderTangentFromSpec(uid, spec, language)) pending = true;
    });

    document.querySelectorAll<HTMLElement>('[id^="sector-spec-"][data-spec]').forEach(function(node) {
      const uid = String(node.id || '').replace(/^sector-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeSectorKeys.add(sectorKey(uid));
      if (!spec || !window.renderCircularSectorFromSpec || !window.renderCircularSectorFromSpec(uid, spec, language)) pending = true;
    });

    Object.keys(window.__tangentEntries || {}).forEach(function(key) {
      if (!activeTangentKeys.has(key)) removeTangentEntryByKey(key);
    });
    Object.keys(window.__sectorEntries || {}).forEach(function(key) {
      if (!activeSectorKeys.has(key)) removeSectorEntryByKey(key);
    });
    hasPendingTangentSectorObjects = pending;
  };

  window.__scheduleBootstrapTangentSectorObjects = function(): void {
    if (window.__bootstrapTangentSectorObjectsRAF) return;
    window.__bootstrapTangentSectorObjectsRAF = requestAnimationFrame(function() {
      window.__bootstrapTangentSectorObjectsRAF = 0;
      try { if (window.__bootstrapTangentSectorObjects) window.__bootstrapTangentSectorObjects(); } catch (e) {}
    });
  };

  function containsTangentSectorSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^(?:tangent|sector)-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="tangent-spec-"][data-spec], [id^="sector-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^(?:tangent|sector)-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsTangentSectorSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapTangentSectorObjects) window.__scheduleBootstrapTangentSectorObjects();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-language'] });
  } catch (e) {}

  if (window.__registerLiaThemeListener) window.__registerLiaThemeListener(function() {
    Object.keys(window.__tangentEntries || {}).forEach(function(key) {
      const entry = window.__tangentEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = getAccentColor();
      applyTangentStyle(entry.tangent, entry.contactPoint, entry.color);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
    Object.keys(window.__sectorEntries || {}).forEach(function(key) {
      const entry = window.__sectorEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = getAccentColor();
      applySectorStyle(entry.sector, entry as SectorConfig);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__tangentSectorRetryInterval = setInterval(function() {
    if (hasPendingTangentSectorObjects && window.__scheduleBootstrapTangentSectorObjects) window.__scheduleBootstrapTangentSectorObjects();
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapTangentSectorObjects) window.__scheduleBootstrapTangentSectorObjects();
  });
}
