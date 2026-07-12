// Linear object subsystem (@Line/@Gerade, @Ray/@Strahl, @Vector/@Vektor macros).
// Draws a straight line, ray, or vector through two named or hidden coordinate points.

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

type LinearKind = 'line' | 'ray' | 'vector';

interface LinearObjectConfig {
  boardId: string;
  kind: LinearKind;
  point1Name: string;
  point2Name: string;
  coordinates: CoordinatePair[] | null;
  color: string;
  hasExplicitColor: boolean;
  objectName: string;
  showName: boolean;
  language: 'de' | 'en';
}

export function init(): void {
  if (window.__linearObjectsReady) {
    try {
      if (window.__scheduleBootstrapLinearObjects) window.__scheduleBootstrapLinearObjects();
    } catch (e) {}
    return;
  }
  window.__linearObjectsReady = true;
  window.__linearObjectEntries = window.__linearObjectEntries || {};
  initThemeSync();

  let hasPendingLinearObjects = false;

  function normalizeKind(kind: unknown): LinearKind {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'ray' || value === 'strahl') return 'ray';
    if (value === 'vector' || value === 'vektor') return 'vector';
    return 'line';
  }

  function parseLinearObjectSpec(spec: string, kind: string, language?: string): LinearObjectConfig {
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
    const standaloneHiddenName = trailingOptions.some(isHiddenNameOption);
    const nameOptions = trailingOptions.filter(function(part) {
      return !isHiddenNameOption(part);
    });
    const namedOption = nameOptions.map(function(part) {
      const match = part.match(/^name\s*=\s*(.+)$/i);
      return match ? String(match[1] || '').trim() : '';
    }).find(Boolean) || '';
    const rawObjectName = namedOption || nameOptions.find(function(part) {
      return !/^name\s*=/i.test(part);
    }) || '';
    const parsedName = parseMacroName(rawObjectName);

    return {
      boardId: String(parts[0] || '').trim(),
      kind: normalizeKind(kind),
      point1Name: point1Name,
      point2Name: point2Name,
      coordinates: coordinates ? coordinates.slice(0, 2) : null,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      objectName: parsedName.name,
      showName: parsedName.showName && !standaloneHiddenName,
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
    };
  }

  function entryKey(uid: string): string {
    return 'linear-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__linearObjectEntries[key];
    if (!entry) return;
    try { if (entry.board && entry.label) entry.board.removeObject(entry.label); } catch (e) {}
    try { if (entry.board && entry.object) entry.board.removeObject(entry.object); } catch (e) {}
    (Array.isArray(entry.ownedPoints) ? entry.ownedPoints : []).forEach(function(point: any) {
      try { if (entry.board && point) entry.board.removeObject(point); } catch (e) {}
    });
    delete window.__linearObjectEntries[key];
    try { if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects(); } catch (e) {}
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

  function sameCoordinates(a: CoordinatePair[] | null, b: CoordinatePair[] | null): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return a.every(function(point, index) {
      return Math.abs(point.x - b[index].x) < 1e-12 &&
        Math.abs(point.y - b[index].y) < 1e-12;
    });
  }

  function texName(name: string): string {
    let value = String(name || '').trim();
    if (value.startsWith('\\(') && value.endsWith('\\)')) value = value.slice(2, -2).trim();
    else if (value.startsWith('$') && value.endsWith('$')) value = value.slice(1, -1).trim();
    const subscript = value.match(/^(.+?)_([^{}]+)$/);
    if (subscript) return subscript[1] + '_{' + subscript[2] + '}';
    return value;
  }

  function cleanVectorBase(value: string): string {
    return texName(value).replace(/^\\overrightarrow\{(.+)\}$/, '$1');
  }

  function pointLabelName(point: any): string {
    const raw = String(point && point.name || '').trim();
    const math = raw.match(/^\\\((.+)\\\)$/);
    return math ? math[1] : raw;
  }

  function vectorBaseName(cfg: LinearObjectConfig, points: any[]): string {
    if (cfg.objectName) return cleanVectorBase(cfg.objectName);
    const first = cfg.point1Name || pointLabelName(points[0]);
    const second = cfg.point2Name || pointLabelName(points[1]);
    const combined = cleanVectorBase(first) + cleanVectorBase(second);
    return combined.trim() || 'a';
  }

  function labelText(cfg: LinearObjectConfig, points: any[]): string {
    if (!cfg.showName) return '';
    if (cfg.kind === 'vector') return '\\(\\overrightarrow{' + vectorBaseName(cfg, points) + '}\\)';
    if (!cfg.objectName) return '';
    return '\\(' + texName(cfg.objectName) + '\\)';
  }

  function applyObjectColor(object: any, label: any, color: string): void {
    try {
      if (object && typeof object.setAttribute === 'function') object.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color
      });
    } catch (e) {}
    try {
      if (label && typeof label.setAttribute === 'function') label.setAttribute({
        strokeColor: color,
        fillColor: color,
        highlightStrokeColor: color,
        highlightFillColor: color
      });
    } catch (e) {}
  }

  function labelPosition(board: any, points: any[]): { x: number; y: number } {
    const x1 = Number(points[0].X());
    const y1 = Number(points[0].Y());
    const x2 = Number(points[1].X());
    const y2 = Number(points[1].Y());
    const midpointX = (x1 + x2) / 2;
    const midpointY = (y1 + y2) / 2;
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const screenX = (x2 - x1) * unitX;
    const screenY = -(y2 - y1) * unitY;
    const length = Math.hypot(screenX, screenY);
    let normalX = 0;
    let normalY = 1;
    if (length > 1e-9) {
      normalX = -screenY / length;
      normalY = screenX / length;
      if (normalX + normalY < 0) {
        normalX = -normalX;
        normalY = -normalY;
      }
    }
    return {
      x: midpointX + normalX * 10 / unitX,
      y: midpointY - normalY * 10 / unitY
    };
  }

  function createLabel(board: any, object: any, points: any[], cfg: LinearObjectConfig): any {
    if (!labelText(cfg, points)) return null;
    const label = board.create('text', [
      function() { return labelPosition(board, points).x; },
      function() { return labelPosition(board, points).y; },
      function() { return labelText(cfg, points); }
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
      fontSize: 20
    });
    object.label = label;
    scheduleBootstrap(function() { try { board.update(); } catch (e) {} });
    return label;
  }

  function createLinearObject(board: any, points: any[], cfg: LinearObjectConfig): any {
    const base = {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      strokeColor: cfg.color,
      highlightStrokeColor: cfg.color,
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      firstArrow: false,
      lastArrow: cfg.kind === 'vector'
    };
    if (cfg.kind === 'vector') {
      return board.create('segment', [points[0], points[1]], base);
    }
    return board.create('line', [points[0], points[1]], {
      ...base,
      straightFirst: cfg.kind === 'line',
      straightLast: true,
      lastArrow: false
    });
  }

  window.renderLinearObjectFromSpec = function(uid: string, spec: string, kind: string, language?: string): boolean {
    const cfg = parseLinearObjectSpec(spec, kind, language);
    const key = entryKey(uid);
    const coordinateMode = !!cfg.coordinates;
    if (!uid || !cfg.boardId || (coordinateMode ? cfg.coordinates!.length < 2 : (!cfg.point1Name || !cfg.point2Name))) {
      removeEntry(uid);
      return false;
    }
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
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
    const old = window.__linearObjectEntries[key];
    const geometryUnchanged = coordinateMode
      ? !!(old && sameCoordinates(old.coordinates || null, cfg.coordinates))
      : !!(old && Array.isArray(old.points) && old.points[0] === namedPoints[0] && old.points[1] === namedPoints[1]);
    if (old && old.board === board && old.kind === cfg.kind && geometryUnchanged &&
        old.objectName === cfg.objectName && old.showName === cfg.showName &&
        old.language === cfg.language) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyObjectColor(old.object, old.label, cfg.color);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    const ownedPoints: any[] = [];
    let object = null;
    let label = null;
    try {
      const points = coordinateMode
        ? cfg.coordinates!.map(function(coordinate) {
            const point = createHiddenPoint(board, coordinate);
            ownedPoints.push(point);
            return point;
          })
        : namedPoints;
      object = createLinearObject(board, points, cfg);
      label = createLabel(board, object, points, cfg);
      const effectiveName = cfg.kind === 'vector' ? vectorBaseName(cfg, points) : cfg.objectName;
      object.__liaDgsShowName = cfg.showName;
      if (cfg.kind === 'vector') object.__liaDgsVectorName = effectiveName;
      else if (cfg.kind === 'ray') object.__liaDgsRayName = effectiveName;
      else object.__liaDgsLineName = effectiveName;
      window.__linearObjectEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        kind: cfg.kind,
        point1Name: cfg.point1Name,
        point2Name: cfg.point2Name,
        coordinates: cfg.coordinates ? cfg.coordinates.map(function(point) { return { x: point.x, y: point.y }; }) : null,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        objectName: cfg.objectName,
        showName: cfg.showName,
        language: cfg.language,
        board: board,
        points: points,
        object: object,
        label: label,
        ownedPoints: ownedPoints
      };
      try { board.update(); } catch (e) {}
      try { if (window.__scheduleBootstrapRelationObjects) window.__scheduleBootstrapRelationObjects(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      try { if (object) board.removeObject(object); } catch (removeError) {}
      ownedPoints.forEach(function(point) { try { board.removeObject(point); } catch (removeError) {} });
      return false;
    }
  };

  window.__bootstrapLinearObjects = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="linear-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^linear-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const kind = String(node.dataset.kind || 'line');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderLinearObjectFromSpec || !window.renderLinearObjectFromSpec(uid, spec, kind, language)) {
        pending = true;
      }
    });
    Object.keys(window.__linearObjectEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingLinearObjects = pending;
  };

  window.__scheduleBootstrapLinearObjects = function(): void {
    if (window.__bootstrapLinearObjectsRAF) return;
    window.__bootstrapLinearObjectsRAF = requestAnimationFrame(function() {
      window.__bootstrapLinearObjectsRAF = 0;
      try { if (window.__bootstrapLinearObjects) window.__bootstrapLinearObjects(); } catch (e) {}
    });
  };

  function containsLinearObjectSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^linear-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="linear-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^linear-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsLinearObjectSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapLinearObjects) window.__scheduleBootstrapLinearObjects();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-kind', 'data-language'] });
  } catch (e) {}

  if (window.__registerLiaThemeListener) window.__registerLiaThemeListener(function() {
    Object.keys(window.__linearObjectEntries || {}).forEach(function(key) {
      const entry = window.__linearObjectEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) {
        entry.color = getAccentColor();
        applyObjectColor(entry.object, entry.label, entry.color);
      }
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__linearObjectsRetryInterval = setInterval(function() {
    if (hasPendingLinearObjects && window.__scheduleBootstrapLinearObjects) window.__scheduleBootstrapLinearObjects();
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapLinearObjects) window.__scheduleBootstrapLinearObjects();
  });
}
