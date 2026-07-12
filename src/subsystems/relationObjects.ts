// Relation object subsystem (@Perpendicular/@Orthogonale, @Parallel/@Parallele,
// @Midpoint/@Mittelpunkt macros). Creates derived lines and midpoint points
// from existing macro/DGS objects or point pairs.

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

type RelationKind = 'orthogonal' | 'parallel' | 'midpoint';

interface RelationConfig {
  boardId: string;
  kind: RelationKind;
  baseName: string;
  basePointNames: string[] | null;
  baseCoordinates: CoordinatePair[] | null;
  throughPointName: string;
  throughCoordinate: CoordinatePair | null;
  point1Name: string;
  point2Name: string;
  midpointCoordinates: CoordinatePair[] | null;
  color: string;
  hasExplicitColor: boolean;
  objectName: string;
  showName: boolean;
  language: 'de' | 'en';
  showValue: boolean;
}

interface ResolvedRelationInput {
  baseLine: any;
  throughPoint: any;
  ownedPoints: any[];
  helperLine: any | null;
  sourcePoints: any[];
}

export function init(): void {
  if (window.__relationObjectsReady) {
    try { if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects(); } catch (e) {}
    return;
  }

  window.__relationObjectsReady = true;
  window.__relationObjectEntries = window.__relationObjectEntries || {};
  initThemeSync();

  let hasPendingRelationObjects = false;

  function normalizeKind(kind: unknown): RelationKind {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'parallel' || value === 'parallele') return 'parallel';
    if (value === 'midpoint' || value === 'mittelpunkt') return 'midpoint';
    return 'orthogonal';
  }

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

  function isValueOption(part: string): boolean {
    return /^(wert|value|koordinaten|coordinates)\s*=\s*1$/i.test(String(part || '').trim());
  }

  function parseObjectName(trailingOptions: string[], fallback = ''): { name: string; showName: boolean } {
    const hiddenByOption = trailingOptions.some(isHiddenNameOption);
    const namedOption = trailingOptions.map(function(part) {
      if (isHiddenNameOption(part)) return '';
      const match = part.match(/^name\s*=\s*(.+)$/i);
      return match ? String(match[1] || '').trim() : '';
    }).find(Boolean) || '';
    const positionalName = trailingOptions.find(function(part) {
      return !/^name\s*=/i.test(part) && !isValueOption(part) && !isHiddenNameOption(part);
    }) || '';
    const parsed = parseMacroName(namedOption || positionalName, fallback);
    return {
      name: parsed.name,
      showName: parsed.showName && !hiddenByOption
    };
  }

  function parseRelationSpec(spec: string, kind: string, language?: string): RelationConfig {
    const relationKind = normalizeKind(kind);
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const languageValue = String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de';

    if (relationKind === 'midpoint') {
      const pointPair = String(parts[1] || '').trim();
      const midpointCoordinates = parseCoordinateList(pointPair);
      const usesPointPair = pointPair.startsWith('[') && pointPair.endsWith(']');
      let point1Name = '';
      let point2Name = '';
      let colorIndex = 3;
      if (midpointCoordinates) {
        colorIndex = 2;
      } else if (usesPointPair) {
        const pointNames = splitTopLevel(pointPair.slice(1, -1), ';')
          .map(function(pointName) { return unquote(pointName).trim(); });
        point1Name = String(pointNames[0] || '').trim();
        point2Name = String(pointNames[1] || '').trim();
        colorIndex = 2;
      } else {
        point1Name = String(parts[1] || '').trim();
        point2Name = String(parts[2] || '').trim();
      }
      const explicitColor = String(parts[colorIndex] || '').trim();
      const trailingOptions = parts.slice(colorIndex + 1)
        .map(function(part) { return String(part || '').trim(); })
        .filter(Boolean);
      const objectName = parseObjectName(trailingOptions, 'M');
      return {
        boardId: String(parts[0] || '').trim(),
        kind: relationKind,
        baseName: '',
        basePointNames: null,
        baseCoordinates: null,
        throughPointName: '',
        throughCoordinate: null,
        point1Name: point1Name,
        point2Name: point2Name,
        midpointCoordinates: midpointCoordinates ? midpointCoordinates.slice(0, 2) : null,
        color: explicitColor || '#ff00ff',
        hasExplicitColor: !!explicitColor,
        objectName: objectName.name,
        showName: objectName.showName,
        language: languageValue,
        showValue: trailingOptions.some(isValueOption)
      };
    }

    const baseToken = String(parts[1] || '').trim();
    const baseCoordinates = parseCoordinateList(baseToken);
    let baseName = '';
    let basePointNames: string[] | null = null;
    if (baseCoordinates) {
      basePointNames = null;
    } else if (baseToken.startsWith('[') && baseToken.endsWith(']')) {
      const names = splitTopLevel(baseToken.slice(1, -1), ';')
        .map(function(pointName) { return unquote(pointName).trim(); });
      if (names.length >= 2) basePointNames = [String(names[0] || '').trim(), String(names[1] || '').trim()];
      else baseName = baseToken;
    } else {
      baseName = baseToken;
    }

    const throughToken = String(parts[2] || '').trim();
    const throughCoordinate = parseCoordinatePair(throughToken);
    const explicitColor = String(parts[3] || '').trim();
    const trailingOptions = parts.slice(4)
      .map(function(part) { return String(part || '').trim(); })
      .filter(Boolean);
    const objectName = parseObjectName(trailingOptions);

    return {
      boardId: String(parts[0] || '').trim(),
      kind: relationKind,
      baseName: baseName,
      basePointNames: basePointNames,
      baseCoordinates: baseCoordinates ? baseCoordinates.slice(0, 2) : null,
      throughPointName: throughCoordinate ? '' : throughToken,
      throughCoordinate: throughCoordinate,
      point1Name: '',
      point2Name: '',
      midpointCoordinates: null,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      objectName: objectName.name,
      showName: objectName.showName,
      language: languageValue,
      showValue: false
    };
  }

  function entryKey(uid: string): string {
    return 'relation-' + String(uid || '');
  }

  function scheduleDependentBootstraps(): void {
    try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
    try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
    try { if (window.__scheduleBootstrapAngles) window.__scheduleBootstrapAngles(); } catch (e) {}
    try { if (window.__scheduleBootstrapCircles) window.__scheduleBootstrapCircles(); } catch (e) {}
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__relationObjectEntries[key];
    if (!entry) return;
    try {
      if (entry.board && entry.kind === 'midpoint' && entry.objectName &&
          window.__points && window.__points[entry.boardId] &&
          window.__points[entry.boardId][entry.objectName] === entry.object) {
        delete window.__points[entry.boardId][entry.objectName];
      }
    } catch (e) {}
    try { if (entry.board && entry.object) entry.board.removeObject(entry.object); } catch (e) {}
    try { if (entry.board && entry.helperLine) entry.board.removeObject(entry.helperLine); } catch (e) {}
    (Array.isArray(entry.ownedPoints) ? entry.ownedPoints : []).forEach(function(point: any) {
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    delete window.__relationObjectEntries[key];
    scheduleDependentBootstraps();
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
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

  function createHiddenBaseLine(board: any, point1: any, point2: any): any {
    return board.create('line', [point1, point2], {
      name: '',
      withLabel: false,
      visible: false,
      fixed: true,
      highlight: false,
      strokeOpacity: 0,
      highlightStrokeOpacity: 0,
      straightFirst: true,
      straightLast: true
    });
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

  function candidateLineNames(object: any): string[] {
    return [
      object && object.__liaDgsSegmentName,
      object && object.__liaDgsLineName,
      object && object.__liaDgsRayName,
      object && object.__liaDgsVectorName,
      object && object.__liaDgsParallelName,
      object && object.__liaDgsPerpendicularName,
      object && object.name
    ].map(normalizeName).filter(Boolean);
  }

  function findNamedBaseLine(board: any, boardId: string, baseName: string): any {
    const wanted = normalizeName(baseName);
    if (!wanted) return null;

    const relationEntries = window.__relationObjectEntries || {};
    for (const key of Object.keys(relationEntries)) {
      const entry = relationEntries[key];
      if (!entry || entry.board !== board || entry.boardId !== boardId || entry.kind === 'midpoint') continue;
      if (namesEqual(entry.objectName, wanted)) return entry.object;
    }

    const linearEntries = window.__linearObjectEntries || {};
    for (const key of Object.keys(linearEntries)) {
      const entry = linearEntries[key];
      if (!entry || entry.board !== board || entry.boardId !== boardId) continue;
      if (namesEqual(entry.objectName, wanted)) return entry.object;
      const autoVectorName = entry.kind === 'vector'
        ? normalizeName(String(entry.point1Name || '') + String(entry.point2Name || ''))
        : '';
      if (autoVectorName && autoVectorName === wanted) return entry.object;
    }

    const distanceEntries = window.__distanceEntries || {};
    for (const key of Object.keys(distanceEntries)) {
      const entry = distanceEntries[key];
      if (!entry || entry.board !== board || entry.boardId !== boardId) continue;
      if (namesEqual(entry.segmentName, wanted)) return entry.segment || (Array.isArray(entry.segments) ? entry.segments[0] : null);
    }

    const boardObjects = getBoardObjects(board);
    for (const object of boardObjects) {
      if (candidateLineNames(object).some(function(name) { return name === wanted; })) return object;
    }
    return null;
  }

  function sameCoordinates(a: CoordinatePair[] | null, b: CoordinatePair[] | null): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return a.every(function(point, index) {
      return Math.abs(point.x - b[index].x) < 1e-12 && Math.abs(point.y - b[index].y) < 1e-12;
    });
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

  function formatMeasurement(value: number, language: 'de' | 'en'): string {
    if (!Number.isFinite(value)) return '?';
    const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round((value + Number.EPSILON) * 1000) / 1000;
    let text = String(rounded);
    if (language === 'de') text = text.replace('.', '{,}');
    return text;
  }

  function midpointLabelText(point: any, cfg: RelationConfig): string {
    const name = cfg.showName ? texName(cfg.objectName || 'M') : '';
    if (!cfg.showValue) return name ? '\\(' + name + '\\)' : '';
    let x = '?';
    let y = '?';
    try {
      x = formatMeasurement(Number(point.X()), cfg.language);
      y = formatMeasurement(Number(point.Y()), cfg.language);
    } catch (e) {}
    return '\\(' + (name ? name + ':\\; ' : '') + '(' + x + '\\mid ' + y + ')\\)';
  }

  function midpointLabelColor(cfg: RelationConfig): string {
    return cfg.hasExplicitColor ? cfg.color : getNeutralColor();
  }

  function applyRelationVisual(object: any, cfg: RelationConfig): void {
    if (!object || typeof object.setAttribute !== 'function') return;
    try {
      object.setAttribute({
        name: mathName(cfg.objectName),
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        label: {
          strokeColor: cfg.color,
          fillColor: cfg.color,
          fontSize: 20,
          parse: false,
          useMathJax: true
        }
      });
    } catch (e) {}
    try {
      if (object.label && typeof object.label.setAttribute === 'function') {
        object.label.setAttribute({
          visible: cfg.showName && !!cfg.objectName,
          strokeColor: cfg.color,
          fillColor: cfg.color,
          fontSize: 20,
          parse: false,
          useMathJax: true
        });
      }
      if (object.label && cfg.showName && cfg.objectName && typeof object.label.showElement === 'function') object.label.showElement();
      if (object.label && (!cfg.showName || !cfg.objectName) && typeof object.label.hideElement === 'function') object.label.hideElement();
    } catch (e) {}
    object.__liaDgsShowName = cfg.showName;
  }

  function applyMidpointVisual(point: any, cfg: RelationConfig): void {
    if (!point || typeof point.setAttribute !== 'function') return;
    const labelColor = midpointLabelColor(cfg);
    const labelVisible = cfg.showName || cfg.showValue;
    try {
      point.setAttribute({
        name: midpointLabelText(point, cfg),
        strokeColor: cfg.color,
        fillColor: cfg.color,
        highlightStrokeColor: cfg.color,
        highlightFillColor: cfg.color,
        strokeOpacity: 1,
        fillOpacity: 1,
        highlightStrokeOpacity: 1,
        highlightFillOpacity: 1,
        label: {
          strokeColor: labelColor,
          fillColor: labelColor,
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });
    } catch (e) {}
    try {
      if (point.label && typeof point.label.setText === 'function') {
        point.label.setText(function() { return midpointLabelText(point, cfg); });
      }
      if (point.label && typeof point.label.setAttribute === 'function') {
        point.label.setAttribute({
          visible: labelVisible,
          strokeColor: labelColor,
          fillColor: labelColor,
          fontSize: 24,
          parse: false,
          useMathJax: true
        });
      }
      if (point.label && labelVisible && typeof point.label.showElement === 'function') point.label.showElement();
      if (point.label && !labelVisible && typeof point.label.hideElement === 'function') point.label.hideElement();
    } catch (e) {}
    point.__liaDgsShowName = cfg.showName;
    point.__liaDgsShowValue = cfg.showValue;
    point.__liaPointVisual = { color: cfg.color, opacity: 1, hasExplicitColor: cfg.hasExplicitColor };
  }

  function resolveRelationInput(board: any, cfg: RelationConfig): ResolvedRelationInput | null {
    const ownedPoints: any[] = [];
    let helperLine: any | null = null;
    let baseLine: any = null;
    const sourcePoints: any[] = [];

    if (cfg.baseName) {
      baseLine = findNamedBaseLine(board, cfg.boardId, cfg.baseName);
      if (!baseLine) return null;
    } else if (cfg.baseCoordinates) {
      if (cfg.baseCoordinates.length < 2) return null;
      const first = createHiddenPoint(board, cfg.baseCoordinates[0]);
      const second = createHiddenPoint(board, cfg.baseCoordinates[1]);
      ownedPoints.push(first, second);
      sourcePoints.push(first, second);
      helperLine = createHiddenBaseLine(board, first, second);
      baseLine = helperLine;
    } else if (cfg.basePointNames && cfg.basePointNames.length >= 2) {
      const first = getLivePoint(board, cfg.boardId, cfg.basePointNames[0]);
      const second = getLivePoint(board, cfg.boardId, cfg.basePointNames[1]);
      if (!first || !second || first === second) return null;
      sourcePoints.push(first, second);
      helperLine = createHiddenBaseLine(board, first, second);
      baseLine = helperLine;
    }

    if (!baseLine) return null;

    let throughPoint: any = null;
    if (cfg.throughCoordinate) {
      throughPoint = createHiddenPoint(board, cfg.throughCoordinate);
      ownedPoints.push(throughPoint);
    } else {
      throughPoint = getLivePoint(board, cfg.boardId, cfg.throughPointName);
    }
    if (!throughPoint) {
      try { if (helperLine) board.removeObject(helperLine); } catch (e) {}
      ownedPoints.forEach(function(point) { try { board.removeObject(point); } catch (e) {} });
      return null;
    }

    return { baseLine, throughPoint, ownedPoints, helperLine, sourcePoints };
  }

  function createRelationLine(board: any, input: ResolvedRelationInput, cfg: RelationConfig): any {
    return board.create(cfg.kind === 'parallel' ? 'parallel' : 'perpendicular', [input.baseLine, input.throughPoint], {
      name: mathName(cfg.objectName),
      withLabel: true,
      fixed: true,
      straightFirst: true,
      straightLast: true,
      strokeColor: cfg.color,
      highlightStrokeColor: cfg.color,
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      label: {
        visible: cfg.showName && !!cfg.objectName,
        strokeColor: cfg.color,
        fillColor: cfg.color,
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });
  }

  function renderRelationLine(uid: string, cfg: RelationConfig, board: any): boolean {
    const key = entryKey(uid);
    if ((!cfg.baseName && !cfg.basePointNames && !cfg.baseCoordinates) ||
        (!cfg.throughPointName && !cfg.throughCoordinate)) {
      removeEntry(uid);
      return false;
    }

    const namedBaseLine = cfg.baseName ? findNamedBaseLine(board, cfg.boardId, cfg.baseName) : null;
    const throughPoint = cfg.throughPointName ? getLivePoint(board, cfg.boardId, cfg.throughPointName) : null;
    const baseNamedPoints = cfg.basePointNames
      ? cfg.basePointNames.map(function(name) { return getLivePoint(board, cfg.boardId, name); })
      : [];

    if ((cfg.baseName && !namedBaseLine) ||
        (cfg.basePointNames && (!baseNamedPoints[0] || !baseNamedPoints[1] || baseNamedPoints[0] === baseNamedPoints[1])) ||
        (cfg.throughPointName && !throughPoint)) {
      removeEntry(uid);
      return false;
    }

    const old = window.__relationObjectEntries[key];
    const baseUnchanged = cfg.baseName
      ? !!(old && old.baseLine === namedBaseLine)
      : (cfg.basePointNames
        ? !!(old && Array.isArray(old.sourcePoints) && old.sourcePoints[0] === baseNamedPoints[0] && old.sourcePoints[1] === baseNamedPoints[1])
        : !!(old && sameCoordinates(old.baseCoordinates || null, cfg.baseCoordinates)));
    const throughUnchanged = cfg.throughPointName
      ? !!(old && old.throughPoint === throughPoint)
      : !!(old && old.throughCoordinate && cfg.throughCoordinate &&
        Math.abs(old.throughCoordinate.x - cfg.throughCoordinate.x) < 1e-12 &&
        Math.abs(old.throughCoordinate.y - cfg.throughCoordinate.y) < 1e-12);

    if (old && old.board === board && old.kind === cfg.kind && baseUnchanged && throughUnchanged &&
        old.objectName === cfg.objectName && old.showName === cfg.showName && old.language === cfg.language) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyRelationVisual(old.object, cfg);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    const input = resolveRelationInput(board, cfg);
    if (!input) return false;
    let object: any = null;
    try {
      object = createRelationLine(board, input, cfg);
      object.__liaMacroRelationObject = true;
      object.__liaMacroRelationKind = cfg.kind;
      object.__liaMacroRelationName = cfg.objectName;
      object.__liaDgsShowName = cfg.showName;
      window.__relationObjectEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        kind: cfg.kind,
        baseName: cfg.baseName,
        basePointNames: cfg.basePointNames ? cfg.basePointNames.slice() : null,
        baseCoordinates: cfg.baseCoordinates ? cfg.baseCoordinates.map(function(point) { return { x: point.x, y: point.y }; }) : null,
        throughPointName: cfg.throughPointName,
        throughCoordinate: cfg.throughCoordinate ? { x: cfg.throughCoordinate.x, y: cfg.throughCoordinate.y } : null,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        objectName: cfg.objectName,
        showName: cfg.showName,
        language: cfg.language,
        board: board,
        object: object,
        baseLine: input.baseLine,
        throughPoint: input.throughPoint,
        sourcePoints: input.sourcePoints,
        helperLine: input.helperLine,
        ownedPoints: input.ownedPoints
      };
      applyRelationVisual(object, cfg);
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (object) board.removeObject(object); } catch (removeError) {}
      try { if (input.helperLine) board.removeObject(input.helperLine); } catch (removeError) {}
      input.ownedPoints.forEach(function(point) { try { board.removeObject(point); } catch (removeError) {} });
      return false;
    }
  }

  function renderMidpoint(uid: string, cfg: RelationConfig, board: any): boolean {
    const key = entryKey(uid);
    const coordinateMode = !!cfg.midpointCoordinates;
    if (!cfg.objectName || (coordinateMode ? cfg.midpointCoordinates!.length < 2 : (!cfg.point1Name || !cfg.point2Name))) {
      removeEntry(uid);
      return false;
    }
    const namedPoints = coordinateMode ? [] : [
      getLivePoint(board, cfg.boardId, cfg.point1Name),
      getLivePoint(board, cfg.boardId, cfg.point2Name)
    ];
    if (!coordinateMode && (!namedPoints[0] || !namedPoints[1] || namedPoints[0] === namedPoints[1])) {
      removeEntry(uid);
      return false;
    }
    const old = window.__relationObjectEntries[key];
    const geometryUnchanged = coordinateMode
      ? !!(old && sameCoordinates(old.midpointCoordinates || null, cfg.midpointCoordinates))
      : !!(old && Array.isArray(old.points) && old.points[0] === namedPoints[0] && old.points[1] === namedPoints[1]);
    if (old && old.board === board && old.kind === 'midpoint' && geometryUnchanged &&
        old.objectName === cfg.objectName && old.showName === cfg.showName &&
        old.language === cfg.language && old.showValue === cfg.showValue) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyMidpointVisual(old.object, cfg);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    let point: any = null;
    try {
      const points = coordinateMode ? [] : namedPoints;
      const coordinates = coordinateMode ? cfg.midpointCoordinates! : null;
      point = board.create('point', coordinateMode
        ? [
            (coordinates![0].x + coordinates![1].x) / 2,
            (coordinates![0].y + coordinates![1].y) / 2
          ]
        : [
            function() { return (Number(points[0].X()) + Number(points[1].X())) / 2; },
            function() { return (Number(points[0].Y()) + Number(points[1].Y())) / 2; }
          ], {
          name: mathName(cfg.objectName),
          fixed: true,
          withLabel: cfg.showName || cfg.showValue,
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
            strokeColor: midpointLabelColor(cfg),
            fillColor: midpointLabelColor(cfg),
            fontSize: 24,
            parse: false,
            useMathJax: true
          }
        });
      point.__liaMacroMidpoint = true;
      point.__liaDgsPointName = cfg.objectName;
      point.__liaDgsShowName = cfg.showName;
      point.__liaDgsShowValue = cfg.showValue;
      point.__liaPointVisual = { color: cfg.color, opacity: 1, hasExplicitColor: cfg.hasExplicitColor };
      applyMidpointVisual(point, cfg);
      window.__points = window.__points || {};
      window.__points[cfg.boardId] = window.__points[cfg.boardId] || {};
      window.__points[cfg.boardId][cfg.objectName] = point;
      window.__relationObjectEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        kind: 'midpoint',
        point1Name: cfg.point1Name,
        point2Name: cfg.point2Name,
        midpointCoordinates: cfg.midpointCoordinates ? cfg.midpointCoordinates.map(function(value) { return { x: value.x, y: value.y }; }) : null,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        objectName: cfg.objectName,
        showName: cfg.showName,
        language: cfg.language,
        showValue: cfg.showValue,
        board: board,
        object: point,
        points: points
      };
      scheduleDependentBootstraps();
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (point) board.removeObject(point); } catch (removeError) {}
      return false;
    }
  }

  window.renderRelationObjectFromSpec = function(uid: string, spec: string, kind: string, language?: string): boolean {
    const cfg = parseRelationSpec(spec, kind, language);
    if (!uid || !cfg.boardId) {
      removeEntry(uid);
      return false;
    }
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }
    return cfg.kind === 'midpoint'
      ? renderMidpoint(uid, cfg, board)
      : renderRelationLine(uid, cfg, board);
  };

  window.__bootstrapRelationObjects = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="relation-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^relation-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const kind = String(node.dataset.kind || 'orthogonal');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderRelationObjectFromSpec || !window.renderRelationObjectFromSpec(uid, spec, kind, language)) {
        pending = true;
      }
    });
    Object.keys(window.__relationObjectEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingRelationObjects = pending;
  };

  window.__scheduleBootstrapRelationObjects = function(): void {
    if (window.__bootstrapRelationObjectsRAF) return;
    window.__bootstrapRelationObjectsRAF = requestAnimationFrame(function() {
      window.__bootstrapRelationObjectsRAF = 0;
      try { if (window.__bootstrapRelationObjects) window.__bootstrapRelationObjects(); } catch (e) {}
    });
  };

  function containsRelationObjectSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^relation-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="relation-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^relation-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsRelationObjectSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-kind', 'data-language'] });
  } catch (e) {}

  if (window.__registerLiaThemeListener) window.__registerLiaThemeListener(function() {
    Object.keys(window.__relationObjectEntries || {}).forEach(function(key) {
      const entry = window.__relationObjectEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = entry.kind === 'midpoint' ? '#ff00ff' : getAccentColor();
      const cfg: RelationConfig = {
        boardId: String(entry.boardId || ''),
        kind: normalizeKind(entry.kind),
        baseName: String(entry.baseName || ''),
        basePointNames: Array.isArray(entry.basePointNames) ? entry.basePointNames.slice() : null,
        baseCoordinates: Array.isArray(entry.baseCoordinates) ? entry.baseCoordinates.map(function(point: CoordinatePair) { return { x: point.x, y: point.y }; }) : null,
        throughPointName: String(entry.throughPointName || ''),
        throughCoordinate: entry.throughCoordinate ? { x: Number(entry.throughCoordinate.x), y: Number(entry.throughCoordinate.y) } : null,
        point1Name: String(entry.point1Name || ''),
        point2Name: String(entry.point2Name || ''),
        midpointCoordinates: Array.isArray(entry.midpointCoordinates) ? entry.midpointCoordinates.map(function(point: CoordinatePair) { return { x: point.x, y: point.y }; }) : null,
        color: String(entry.color || (entry.kind === 'midpoint' ? '#ff00ff' : getAccentColor())),
        hasExplicitColor: !!entry.hasExplicitColor,
        objectName: String(entry.objectName || ''),
        showName: entry.showName !== false,
        language: String(entry.language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
        showValue: !!entry.showValue
      };
      if (entry.kind === 'midpoint') applyMidpointVisual(entry.object, cfg);
      else applyRelationVisual(entry.object, cfg);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__relationObjectsRetryInterval = setInterval(function() {
    if (hasPendingRelationObjects && window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects();
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects();
  });
}
