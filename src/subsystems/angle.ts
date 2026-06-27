// Angle subsystem (@angle / @Winkel macros).
// Draws the minor angle defined by three named points and an optional measure.

import { splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

interface AngleConfig {
  boardId: string;
  name: string;
  pointNames: string[];
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
  showValue: boolean;
  language: 'de' | 'en';
}

interface XY {
  x: number;
  y: number;
}

export function init(): void {
  if (window.__angleReady) {
    try {
      if (window.__scheduleBootstrapAngles) window.__scheduleBootstrapAngles();
    } catch (e) {}
    return;
  }
  window.__angleReady = true;

  window.__angleEntries = window.__angleEntries || {};
  initThemeSync();

  let hasPendingAngles = false;

  function parseAngleSpec(spec: string, language?: string): AngleConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const pointList = String(parts[2] || '').trim();
    const pointListBody = pointList.startsWith('[') && pointList.endsWith(']')
      ? pointList.slice(1, -1)
      : pointList;
    const pointNames = splitTopLevel(pointListBody)
      .map(function(pointName) { return unquote(pointName).trim(); })
      .filter(Boolean)
      .slice(0, 3);
    const explicitColor = String(parts[3] || '').trim();
    const parsedOpacity = parseFloat(String(parts[4] || '').replace(',', '.'));
    const opacity = Number.isFinite(parsedOpacity)
      ? Math.max(0, Math.min(1, parsedOpacity))
      : 1;
    const options = parts.slice(5).map(function(option) {
      return String(option || '').trim();
    });

    return {
      boardId: String(parts[0] || '').trim(),
      name: String(parts[1] || '').trim(),
      pointNames: pointNames,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      opacity: opacity,
      showValue: options.some(function(option) {
        return /^(?:wert|value)\s*=\s*1$/i.test(option);
      }),
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
    };
  }

  function entryKey(uid: string): string {
    return 'angle-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__angleEntries[key];
    if (!entry) return;

    try {
      if (entry.board && entry.label) entry.board.removeObject(entry.label);
    } catch (e) {}

    try {
      if (entry.board && entry.angle) entry.board.removeObject(entry.angle);
    } catch (e) {}

    delete window.__angleEntries[key];
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

  function coordinates(point: any): XY | null {
    try {
      const x = Number(point.X());
      const y = Number(point.Y());
      return Number.isFinite(x) && Number.isFinite(y) ? { x: x, y: y } : null;
    } catch (e) {
      return null;
    }
  }

  function directedAngleRadians(points: any[]): number {
    const first = coordinates(points[0]);
    const vertex = coordinates(points[1]);
    const third = coordinates(points[2]);
    if (!first || !vertex || !third) return NaN;

    const ux = first.x - vertex.x;
    const uy = first.y - vertex.y;
    const vx = third.x - vertex.x;
    const vy = third.y - vertex.y;
    const uLength = Math.hypot(ux, uy);
    const vLength = Math.hypot(vx, vy);
    if (uLength <= 1e-12 || vLength <= 1e-12) return NaN;

    const dot = ux * vx + uy * vy;
    const cross = ux * vy - uy * vx;
    let angle = Math.atan2(cross, dot);
    if (angle < 0) angle += Math.PI * 2;
    return angle;
  }

  function angleMeasure(points: any[]): number {
    const radians = directedAngleRadians(points);
    return Number.isFinite(radians) ? radians * 180 / Math.PI : NaN;
  }

  function angleRadius(points: any[]): number {
    const first = coordinates(points[0]);
    const vertex = coordinates(points[1]);
    const third = coordinates(points[2]);
    if (!first || !vertex || !third) return 0.6;

    const shorterArm = Math.min(
      Math.hypot(first.x - vertex.x, first.y - vertex.y),
      Math.hypot(third.x - vertex.x, third.y - vertex.y)
    );
    return Math.max(0.05, Math.min(0.8, shorterArm * 0.35));
  }

  function angleBisector(points: any[]): XY {
    const first = coordinates(points[0]);
    const vertex = coordinates(points[1]);
    const third = coordinates(points[2]);
    if (!first || !vertex || !third) return { x: 1, y: 0 };

    const ux = first.x - vertex.x;
    const uy = first.y - vertex.y;
    const uLength = Math.hypot(ux, uy);
    const directedAngle = directedAngleRadians(points);
    if (uLength <= 1e-12 || !Number.isFinite(directedAngle)) return { x: 1, y: 0 };

    const bisectorAngle = Math.atan2(uy, ux) + directedAngle / 2;
    return { x: Math.cos(bisectorAngle), y: Math.sin(bisectorAngle) };
  }

  function labelPosition(board: any, points: any[]): XY {
    const vertex = coordinates(points[1]);
    if (!vertex) return { x: 0, y: 0 };
    const direction = angleBisector(points);
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const pixelsPerUnit = Math.max(1e-9, Math.hypot(
      direction.x * unitX,
      direction.y * unitY
    ));
    const distance = angleRadius(points) * 1.35 + 10 / pixelsPerUnit;

    return {
      x: vertex.x + direction.x * distance,
      y: vertex.y + direction.y * distance
    };
  }

  function texName(name: string): string {
    let value = String(name || '').trim();
    if (value.startsWith('\\(') && value.endsWith('\\)')) value = value.slice(2, -2).trim();
    else if (value.startsWith('$') && value.endsWith('$')) value = value.slice(1, -1).trim();

    const greekNames = new Set([
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
      'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
      'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi',
      'varphi', 'chi', 'psi', 'omega'
    ]);
    if (greekNames.has(value.toLowerCase())) return '\\' + value.toLowerCase();

    const subscript = value.match(/^(.+?)_([^{}]+)$/);
    if (subscript) return subscript[1] + '_{' + subscript[2] + '}';
    return value;
  }

  function fallbackAngleName(cfg: AngleConfig): string {
    return '\\angle ' + cfg.pointNames.map(texName).join('');
  }

  function formatMeasure(value: number, language: 'de' | 'en'): string {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    let formatted = rounded.toFixed(2);
    if (language === 'de') formatted = formatted.replace('.', '{,}');
    return formatted;
  }

  function labelText(cfg: AngleConfig, points: any[]): string {
    const name = texName(cfg.name) || fallbackAngleName(cfg);
    if (!cfg.showValue) return '\\(' + name + '\\)';

    const value = angleMeasure(points);
    if (!Number.isFinite(value)) return '\\(' + name + '\\)';
    return '\\(' + name + ' \\approx ' + formatMeasure(value, cfg.language) + '^\\circ\\)';
  }

  function applyAngleStyle(angle: any, color: string, opacity: number): void {
    const attributes = {
      strokeColor: color,
      highlightStrokeColor: color,
      strokeOpacity: 1,
      highlightStrokeOpacity: 1,
      fillColor: color,
      highlightFillColor: color,
      fillOpacity: opacity * 0.2,
      highlightFillOpacity: opacity * 0.2
    };

    try {
      if (angle && typeof angle.setAttribute === 'function') angle.setAttribute(attributes);
    } catch (e) {}
    try {
      if (angle && angle.arc && typeof angle.arc.setAttribute === 'function') {
        angle.arc.setAttribute(attributes);
      }
    } catch (e) {}
  }

  function applyLabelStyle(label: any, color: string, opacity: number): void {
    if (!label || typeof label.setAttribute !== 'function') return;
    try {
      label.setAttribute({
        strokeColor: color,
        fillColor: color,
        strokeOpacity: opacity,
        fillOpacity: opacity,
        cssStyle: 'opacity:' + opacity + ';'
      });
    } catch (e) {}
  }

  function createLabel(board: any, points: any[], cfg: AngleConfig): any {
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
      strokeOpacity: cfg.opacity,
      fillOpacity: cfg.opacity,
      cssStyle: 'opacity:' + cfg.opacity + ';',
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

  window.renderAngleFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseAngleSpec(spec, language);
    const key = entryKey(uid);

    if (!uid || !cfg.boardId || cfg.pointNames.length !== 3) {
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
    if (points.some(function(point) { return !point; }) || new Set(points).size !== 3) {
      removeEntry(uid);
      return false;
    }

    const old = window.__angleEntries[key];
    if (
      old &&
      old.board === board &&
      old.boardId === cfg.boardId &&
      samePoints(old.points, points) &&
      old.name === cfg.name &&
      old.language === cfg.language &&
      old.showValue === cfg.showValue &&
      old.angle &&
      old.label
    ) {
      old.color = cfg.color;
      old.opacity = cfg.opacity;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyAngleStyle(old.angle, cfg.color, cfg.opacity);
      applyLabelStyle(old.label, cfg.color, cfg.opacity);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    let angle = null;
    let label = null;

    try {
      angle = board.create('angle', points, {
        name: '',
        withLabel: false,
        fixed: true,
        highlight: false,
        type: 'sector',
        orientation: 'counterclockwise',
        selection: 'auto',
        radius: function() { return angleRadius(points); },
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 2.5,
        highlightStrokeWidth: 2.5,
        fillColor: cfg.color,
        highlightFillColor: cfg.color,
        fillOpacity: cfg.opacity * 0.2,
        highlightFillOpacity: cfg.opacity * 0.2
      });
      applyAngleStyle(angle, cfg.color, cfg.opacity);
      label = createLabel(board, points, cfg);

      window.__angleEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        name: cfg.name,
        pointNames: cfg.pointNames.slice(),
        points: points,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        opacity: cfg.opacity,
        showValue: cfg.showValue,
        language: cfg.language,
        board: board,
        angle: angle,
        label: label
      };

      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      try { if (angle) board.removeObject(angle); } catch (removeError) {}
      return false;
    }
  };

  window.__bootstrapAngles = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="angle-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^angle-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'en');
      if (!uid) return;

      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderAngleFromSpec || !window.renderAngleFromSpec(uid, spec, language)) {
        pending = true;
      }
    });

    Object.keys(window.__angleEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingAngles = pending;
  };

  window.__scheduleBootstrapAngles = function(): void {
    if (window.__bootstrapAnglesRAF) return;
    window.__bootstrapAnglesRAF = requestAnimationFrame(function() {
      window.__bootstrapAnglesRAF = 0;
      try { if (window.__bootstrapAngles) window.__bootstrapAngles(); } catch (e) {}
    });
  };

  function containsAngleSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^angle-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="angle-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];

        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^angle-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsAngleSpec);
      }

      if (needsBootstrap && window.__scheduleBootstrapAngles) {
        window.__scheduleBootstrapAngles();
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
    Object.keys(window.__angleEntries || {}).forEach(function(key) {
      const entry = window.__angleEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = getAccentColor();
      applyAngleStyle(entry.angle, entry.color, entry.opacity);
      applyLabelStyle(entry.label, entry.color, entry.opacity);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__angleRetryInterval = setInterval(function() {
    if (hasPendingAngles && window.__scheduleBootstrapAngles) {
      window.__scheduleBootstrapAngles();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapAngles) window.__scheduleBootstrapAngles();
  });
}
