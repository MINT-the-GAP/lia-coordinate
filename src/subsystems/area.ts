// Area subsystem (@Area / @Fläche macros).
// Fills a polygon spanned by named points and optionally displays area/perimeter.

import { splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

interface AreaConfig {
  boardId: string;
  pointNames: string[];
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
  showArea: boolean;
  showPerimeter: boolean;
  language: 'de' | 'en';
}

interface XY {
  x: number;
  y: number;
}

export function init(): void {
  if (window.__areaReady) {
    try {
      if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas();
    } catch (e) {}
    return;
  }
  window.__areaReady = true;

  window.__areaEntries = window.__areaEntries || {};
  initThemeSync();

  let hasPendingAreas = false;

  function parseAreaSpec(spec: string, language?: string): AreaConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const pointList = String(parts[1] || '').trim();
    const pointListBody = pointList.startsWith('[') && pointList.endsWith(']')
      ? pointList.slice(1, -1)
      : pointList;
    const pointNames = splitTopLevel(pointListBody)
      .map(function(pointName) { return unquote(pointName).trim(); })
      .filter(Boolean);
    const explicitColor = String(parts[2] || '').trim();
    const parsedOpacity = parseFloat(String(parts[3] || '').replace(',', '.'));
    const opacity = Number.isFinite(parsedOpacity)
      ? Math.max(0, Math.min(1, parsedOpacity))
      : 0.25;
    const options = parts.slice(4).map(function(option) {
      return String(option || '').trim();
    });

    return {
      boardId: String(parts[0] || '').trim(),
      pointNames: pointNames,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      opacity: opacity,
      showArea: options.some(function(option) {
        return /^(?:inhalt|area)\s*=\s*1$/i.test(option);
      }),
      showPerimeter: options.some(function(option) {
        return /^(?:umfang|perimeter)\s*=\s*1$/i.test(option);
      }),
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
    };
  }

  function entryKey(uid: string): string {
    return 'area-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__areaEntries[key];
    if (!entry) return;

    try {
      if (entry.board && entry.label) entry.board.removeObject(entry.label);
    } catch (e) {}

    try {
      if (entry.board && entry.polygon) entry.board.removeObject(entry.polygon);
    } catch (e) {}

    delete window.__areaEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function getLivePoint(board: any, boardId: string, pointName: string): any {
    const point = window.__points &&
      window.__points[boardId] &&
      window.__points[boardId][pointName];

    if (!board || !point) return null;

    try {
      if (point.board !== board) return null;
      if (typeof point.X !== 'function' || typeof point.Y !== 'function') return null;
    } catch (e) {
      return null;
    }

    return point;
  }

  function pointCoordinates(points: any[]): XY[] {
    const coordinates: XY[] = [];

    for (let i = 0; i < points.length; i++) {
      try {
        const x = Number(points[i].X());
        const y = Number(points[i].Y());
        if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
        coordinates.push({ x: x, y: y });
      } catch (e) {
        return [];
      }
    }

    return coordinates;
  }

  function signedDoubleArea(coordinates: XY[]): number {
    let sum = 0;
    for (let i = 0; i < coordinates.length; i++) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % coordinates.length];
      sum += current.x * next.y - next.x * current.y;
    }
    return sum;
  }

  function polygonArea(coordinates: XY[]): number {
    if (coordinates.length < 3) return 0;
    return Math.abs(signedDoubleArea(coordinates)) / 2;
  }

  function polygonPerimeter(coordinates: XY[]): number {
    if (coordinates.length < 2) return 0;
    let perimeter = 0;

    for (let i = 0; i < coordinates.length; i++) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % coordinates.length];
      perimeter += Math.hypot(next.x - current.x, next.y - current.y);
    }

    return perimeter;
  }

  function averagePoint(coordinates: XY[]): XY {
    if (!coordinates.length) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    coordinates.forEach(function(point) {
      x += point.x;
      y += point.y;
    });
    return { x: x / coordinates.length, y: y / coordinates.length };
  }

  function polygonCentroid(coordinates: XY[]): XY {
    const area2 = signedDoubleArea(coordinates);
    if (Math.abs(area2) < 1e-12) return averagePoint(coordinates);

    let x = 0;
    let y = 0;
    for (let i = 0; i < coordinates.length; i++) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % coordinates.length];
      const cross = current.x * next.y - next.x * current.y;
      x += (current.x + next.x) * cross;
      y += (current.y + next.y) * cross;
    }

    return {
      x: x / (3 * area2),
      y: y / (3 * area2)
    };
  }

  function pointInPolygon(point: XY, coordinates: XY[]): boolean {
    let inside = false;

    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const a = coordinates[i];
      const b = coordinates[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
        point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-12) + a.x;
      if (intersects) inside = !inside;
    }

    return inside;
  }

  function pointSegmentDistanceSquared(point: XY, a: XY, b: XY): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-18) {
      return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
    }

    const projection = Math.max(0, Math.min(1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
    ));
    const nearestX = a.x + projection * dx;
    const nearestY = a.y + projection * dy;
    return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
  }

  function minimumEdgeDistanceSquared(point: XY, coordinates: XY[]): number {
    let minimum = Infinity;
    for (let i = 0; i < coordinates.length; i++) {
      const distance = pointSegmentDistanceSquared(
        point,
        coordinates[i],
        coordinates[(i + 1) % coordinates.length]
      );
      if (distance < minimum) minimum = distance;
    }
    return minimum;
  }

  function interiorFallback(coordinates: XY[]): XY {
    if (!coordinates.length) return { x: 0, y: 0 };

    let xmin = coordinates[0].x;
    let xmax = coordinates[0].x;
    let ymin = coordinates[0].y;
    let ymax = coordinates[0].y;
    coordinates.forEach(function(point) {
      xmin = Math.min(xmin, point.x);
      xmax = Math.max(xmax, point.x);
      ymin = Math.min(ymin, point.y);
      ymax = Math.max(ymax, point.y);
    });

    let best = averagePoint(coordinates);
    let bestDistance = pointInPolygon(best, coordinates)
      ? minimumEdgeDistanceSquared(best, coordinates)
      : -1;
    const steps = 14;

    for (let row = 0; row < steps; row++) {
      for (let column = 0; column < steps; column++) {
        const candidate = {
          x: xmin + (column + 0.5) / steps * (xmax - xmin),
          y: ymin + (row + 0.5) / steps * (ymax - ymin)
        };
        if (!pointInPolygon(candidate, coordinates)) continue;
        const distance = minimumEdgeDistanceSquared(candidate, coordinates);
        if (distance > bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }

    return best;
  }

  function polygonLabelCenter(points: any[]): XY {
    const coordinates = pointCoordinates(points);
    if (!coordinates.length) return { x: 0, y: 0 };

    const centroid = polygonCentroid(coordinates);
    return pointInPolygon(centroid, coordinates)
      ? centroid
      : interiorFallback(coordinates);
  }

  function formatValue(value: number, language: 'de' | 'en'): string {
    const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
    let formatted = rounded.toFixed(3);
    if (language === 'de') formatted = formatted.replace('.', '{,}');
    return formatted;
  }

  function measurementText(cfg: AreaConfig, points: any[]): string {
    const coordinates = pointCoordinates(points);
    if (coordinates.length < 3) return '';

    const lines: string[] = [];
    if (cfg.showArea) {
      const unit = cfg.language === 'de' ? 'FE' : 'AU';
      lines.push('A \\approx ' + formatValue(polygonArea(coordinates), cfg.language) +
        '\\,\\mathrm{' + unit + '}');
    }
    if (cfg.showPerimeter) {
      const unit = cfg.language === 'de' ? 'LE' : 'LU';
      lines.push('u \\approx ' + formatValue(polygonPerimeter(coordinates), cfg.language) +
        '\\,\\mathrm{' + unit + '}');
    }

    if (!lines.length) return '';
    if (lines.length === 1) return '\\(' + lines[0] + '\\)';
    return '\\(\\begin{aligned}' + lines.join('\\\\[2pt]') + '\\end{aligned}\\)';
  }

  function applyPolygonStyle(polygon: any, color: string, opacity: number): void {
    if (!polygon) return;

    try {
      if (typeof polygon.setAttribute === 'function') {
        polygon.setAttribute({
          fillColor: color,
          highlightFillColor: color,
          fillOpacity: opacity,
          highlightFillOpacity: opacity
        });
      }
    } catch (e) {}

    try {
      const borders = Array.isArray(polygon.borders) ? polygon.borders : [];
      borders.forEach(function(border) {
        if (!border || typeof border.setAttribute !== 'function') return;
        border.setAttribute({
          strokeColor: color,
          highlightStrokeColor: color,
          strokeOpacity: 1,
          highlightStrokeOpacity: 1,
          strokeWidth: 2,
          highlightStrokeWidth: 2,
          fixed: true,
          highlight: false
        });
      });
    } catch (e) {}
  }

  function applyLabelTheme(label: any): void {
    if (!label || typeof label.setAttribute !== 'function') return;
    const color = getNeutralColor();
    try { label.setAttribute({ strokeColor: color, fillColor: color }); } catch (e) {}
  }

  function createMeasurementLabel(board: any, points: any[], cfg: AreaConfig): any {
    const color = getNeutralColor();
    const label = board.create('text', [
      function() { return polygonLabelCenter(points).x; },
      function() { return polygonLabelCenter(points).y; },
      function() { return measurementText(cfg, points); }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: color,
      fillColor: color,
      fontSize: 14
    });

    scheduleBootstrap(function() {
      try { board.update(); } catch (e) {}
    });
    return label;
  }

  function samePoints(a: any[], b: any[]): boolean {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  window.renderAreaFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseAreaSpec(spec, language);
    const key = entryKey(uid);

    if (!uid || !cfg.boardId || cfg.pointNames.length < 3) {
      removeEntry(uid);
      return false;
    }

    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }

    const points = cfg.pointNames.map(function(pointName) {
      return getLivePoint(board, cfg.boardId, pointName);
    });
    if (points.some(function(point) { return !point; }) || new Set(points).size < 3) {
      removeEntry(uid);
      return false;
    }

    const old = window.__areaEntries[key];
    if (
      old &&
      old.board === board &&
      old.boardId === cfg.boardId &&
      samePoints(old.points, points) &&
      old.language === cfg.language &&
      old.showArea === cfg.showArea &&
      old.showPerimeter === cfg.showPerimeter &&
      (!(cfg.showArea || cfg.showPerimeter) || old.label) &&
      old.polygon
    ) {
      old.color = cfg.color;
      old.opacity = cfg.opacity;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyPolygonStyle(old.polygon, cfg.color, cfg.opacity);
      applyLabelTheme(old.label);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    let polygon = null;
    let label = null;

    try {
      polygon = board.create('polygon', points, {
        fixed: true,
        highlight: false,
        fillColor: cfg.color,
        highlightFillColor: cfg.color,
        fillOpacity: cfg.opacity,
        highlightFillOpacity: cfg.opacity,
        borders: {
          fixed: true,
          highlight: false,
          strokeColor: cfg.color,
          highlightStrokeColor: cfg.color,
          strokeOpacity: 1,
          highlightStrokeOpacity: 1,
          strokeWidth: 2,
          highlightStrokeWidth: 2
        }
      });
      applyPolygonStyle(polygon, cfg.color, cfg.opacity);

      if (cfg.showArea || cfg.showPerimeter) {
        label = createMeasurementLabel(board, points, cfg);
      }

      window.__areaEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        pointNames: cfg.pointNames.slice(),
        points: points,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        opacity: cfg.opacity,
        language: cfg.language,
        showArea: cfg.showArea,
        showPerimeter: cfg.showPerimeter,
        board: board,
        polygon: polygon,
        label: label
      };

      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      try { if (polygon) board.removeObject(polygon); } catch (removeError) {}
      return false;
    }
  };

  window.__bootstrapAreas = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="area-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^area-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'en');
      if (!uid) return;

      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderAreaFromSpec || !window.renderAreaFromSpec(uid, spec, language)) {
        pending = true;
      }
    });

    Object.keys(window.__areaEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingAreas = pending;
  };

  window.__scheduleBootstrapAreas = function(): void {
    if (window.__bootstrapAreasRAF) return;
    window.__bootstrapAreasRAF = requestAnimationFrame(function() {
      window.__bootstrapAreasRAF = 0;
      try { if (window.__bootstrapAreas) window.__bootstrapAreas(); } catch (e) {}
    });
  };

  function containsAreaSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^area-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="area-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^area-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsAreaSpec);
      }

      if (needsBootstrap && window.__scheduleBootstrapAreas) {
        window.__scheduleBootstrapAreas();
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
    Object.keys(window.__areaEntries || {}).forEach(function(key) {
      const entry = window.__areaEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) {
        entry.color = getAccentColor();
        applyPolygonStyle(entry.polygon, entry.color, entry.opacity);
      }
      applyLabelTheme(entry.label);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__areaRetryInterval = setInterval(function() {
    if (hasPendingAreas && window.__scheduleBootstrapAreas) {
      window.__scheduleBootstrapAreas();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas();
  });
}
