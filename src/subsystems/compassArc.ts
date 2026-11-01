// Compass arc subsystem (@CompassArc/@Zirkelbogen macros).
// Recreates DGS compass arcs from their center and radius points so dependent
// intersections remain dynamic after macro export and import.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { getLivePoint } from '../shared/boardObjects';
import { subscriptTexName as texName } from '../shared/texName';
import {
  applyLineStyle,
  lineStyleAttributes,
  parseLineStyleOptions,
  type LineStyle
} from '../shared/lineStyle';

interface CompassArcConfig {
  boardId: string;
  name: string;
  showName: boolean;
  centerName: string;
  radiusPointName: string;
  sweepAngle: number;
  color: string;
  hasExplicitColor: boolean;
  visible: boolean;
  fixedRadius: boolean;
  fixedDx: number;
  fixedDy: number;
  language: 'de' | 'en';
  lineStyle: LineStyle;
}

type CompassArcGeometry = {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  sweepAngle: number;
};

export function init(): void {
  if (window.__compassArcReady) {
    try { if (window.__scheduleBootstrapCompassArcs) window.__scheduleBootstrapCompassArcs(); } catch (e) {}
    return;
  }
  window.__compassArcReady = true;
  window.__compassArcEntries = window.__compassArcEntries || {};
  initThemeSync();
  let hasPendingCompassArcs = false;

  function numberOption(options: string[], name: RegExp): number {
    const option = options.find(function(value) { return name.test(value); }) || '';
    const match = option.match(/^[^=]+\s*=\s*(.+)$/);
    const value = Number(String(match && match[1] || '').replace(',', '.'));
    return Number.isFinite(value) ? value : NaN;
  }

  function parseCompassArcSpec(spec: string, language?: string): CompassArcConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';').map(function(part) {
      return unquote(part).trim();
    });
    const parsedName = parseMacroName(parts[1] || '');
    const sweepAngle = Number(String(parts[4] || '').replace(',', '.'));
    const explicitColor = String(parts[5] || '').trim();
    const options = parts.slice(6).map(function(option) { return String(option || '').trim(); });
    return {
      boardId: String(parts[0] || '').trim(),
      name: parsedName.name,
      showName: parsedName.showName && !options.some(isHiddenNameOption),
      centerName: String(parts[2] || '').trim(),
      radiusPointName: String(parts[3] || '').trim(),
      sweepAngle,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      visible: !options.some(function(option) {
        return /^(?:visible|sichtbar)\s*=\s*0$/i.test(option);
      }),
      fixedRadius: options.some(function(option) {
        return /^(?:fixedradius|festradius)\s*=\s*1$/i.test(option);
      }),
      fixedDx: numberOption(options, /^(?:fixeddx|festdx)\s*=/i),
      fixedDy: numberOption(options, /^(?:fixeddy|festdy)\s*=/i),
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
      lineStyle: parseLineStyleOptions(options)
    };
  }

  function entryKey(uid: string): string {
    return 'compass-arc-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__compassArcEntries[key];
    if (!entry) return;
    try { if (entry.board && entry.label) entry.board.removeObject(entry.label); } catch (e) {}
    try { if (entry.board && entry.arc) entry.board.removeObject(entry.arc); } catch (e) {}
    delete window.__compassArcEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function geometry(arc: any): CompassArcGeometry {
    const center = arc && arc.__liaDgsCompassCenterPoint;
    const radiusPoint = arc && arc.__liaDgsCompassRadiusPoint;
    let cx = NaN;
    let cy = NaN;
    let px = NaN;
    let py = NaN;
    try {
      cx = Number(center.X());
      cy = Number(center.Y());
      px = Number(radiusPoint.X());
      py = Number(radiusPoint.Y());
    } catch (e) {}
    const fixedDx = Number(arc && arc.__liaDgsCompassFixedDx);
    const fixedDy = Number(arc && arc.__liaDgsCompassFixedDy);
    const useFixed = arc && arc.__liaDgsCompassFixedRadius === true &&
      Number.isFinite(fixedDx) && Number.isFinite(fixedDy) && Math.hypot(fixedDx, fixedDy) > 1e-12;
    const dx = useFixed ? fixedDx : px - cx;
    const dy = useFixed ? fixedDy : py - cy;
    const sweepAngle = Number(arc && arc.__liaDgsCompassSweepAngle);
    const radius = Math.hypot(dx, dy);
    const endAngle = Math.atan2(dy, dx);
    return {
      cx,
      cy,
      radius,
      startAngle: endAngle - (Number.isFinite(sweepAngle) ? sweepAngle : 0),
      sweepAngle: Number.isFinite(sweepAngle) ? sweepAngle : 0
    };
  }

  function pointAt(arc: any, t: number): { x: number; y: number } {
    const current = geometry(arc);
    const angle = current.startAngle + current.sweepAngle * Number(t);
    return {
      x: current.cx + current.radius * Math.cos(angle),
      y: current.cy + current.radius * Math.sin(angle)
    };
  }

  function labelPosition(arc: any): { x: number; y: number } {
    const current = geometry(arc);
    const midpoint = pointAt(arc, 0.5);
    const unitX = Math.max(1e-9, Math.abs(Number(arc && arc.board && arc.board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(arc && arc.board && arc.board.unitY) || 1));
    let screenX = (midpoint.x - current.cx) * unitX;
    let screenY = -(midpoint.y - current.cy) * unitY;
    const length = Math.hypot(screenX, screenY);
    if (length <= 1e-12) return midpoint;
    screenX /= length;
    screenY /= length;
    return { x: midpoint.x + screenX * 15 / unitX, y: midpoint.y - screenY * 15 / unitY };
  }

  function labelText(arc: any): string {
    const name = String(arc && arc.__liaDgsCompassArcName || '');
    return arc && arc.__liaDgsShowName !== false && name ? '\\(' + texName(name) + '\\)' : '';
  }

  function setVisible(element: any, visible: boolean): void {
    if (!element) return;
    try {
      if (typeof element.setAttribute === 'function') element.setAttribute({ visible });
      if (visible && typeof element.showElement === 'function') element.showElement();
      if (!visible && typeof element.hideElement === 'function') element.hideElement();
    } catch (e) {}
  }

  function applyVisual(arc: any, label: any, cfg: CompassArcConfig): void {
    try {
      arc.setAttribute({
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 4,
        ...lineStyleAttributes(cfg.lineStyle)
      });
    } catch (e) {}
    applyLineStyle(arc, cfg.lineStyle);
    try { label?.setAttribute({ strokeColor: cfg.color, fillColor: cfg.color }); } catch (e) {}
    setVisible(arc, cfg.visible);
    setVisible(label, cfg.visible && cfg.showName && !!cfg.name);
  }

  function applyMetadata(
    arc: any,
    label: any,
    center: any,
    radiusPoint: any,
    cfg: CompassArcConfig
  ): void {
    const dx = Number.isFinite(cfg.fixedDx) ? cfg.fixedDx : Number(radiusPoint.X()) - Number(center.X());
    const dy = Number.isFinite(cfg.fixedDy) ? cfg.fixedDy : Number(radiusPoint.Y()) - Number(center.Y());
    arc.__liaDgsMacroManaged = true;
    arc.__liaDgsCompassArc = true;
    arc.__liaDgsCompassDraft = false;
    arc.__liaDgsCompassArcName = cfg.name;
    arc.__liaDgsCompassCenterPoint = center;
    arc.__liaDgsCompassRadiusPoint = radiusPoint;
    arc.__liaDgsCompassSweepAngle = cfg.sweepAngle;
    arc.__liaDgsCompassFixedRadius = cfg.fixedRadius;
    if (cfg.fixedRadius) {
      arc.__liaDgsCompassFixedDx = dx;
      arc.__liaDgsCompassFixedDy = dy;
    } else {
      delete arc.__liaDgsCompassFixedDx;
      delete arc.__liaDgsCompassFixedDy;
    }
    const current = geometry(arc);
    arc.__liaDgsCompassRadius = current.radius;
    arc.__liaDgsCompassStartAngle = current.startAngle;
    arc.__liaDgsLanguage = cfg.language;
    arc.__liaDgsColor = cfg.color;
    arc.__liaDgsTextColor = cfg.color;
    arc.__liaDgsLineColor = cfg.color;
    arc.__liaDgsFillColor = cfg.color;
    arc.__liaDgsShowName = cfg.showName;
    arc.__liaDgsShowObject = cfg.visible;
    arc.__liaDgsOpacity = 1;
    arc.__liaDgsLineStyle = cfg.lineStyle;
    arc.__liaDgsCompassArcLabel = label;
    arc.label = label;
    if (label) {
      label.__liaDgsMacroManaged = true;
      label.__liaDgsOwner = arc;
    }
  }

  window.renderCompassArcFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseCompassArcSpec(spec, language);
    const key = entryKey(uid);
    const board = window.__boards && window.__boards[cfg.boardId];
    const center = getLivePoint(board, cfg.boardId, cfg.centerName);
    const radiusPoint = getLivePoint(board, cfg.boardId, cfg.radiusPointName);
    if (!uid || !board || !cfg.name || !center || !radiusPoint || center === radiusPoint ||
        !Number.isFinite(cfg.sweepAngle) || Math.abs(cfg.sweepAngle) <= 1e-9) {
      removeEntry(uid);
      return false;
    }
    const old = window.__compassArcEntries[key];
    if (old && old.board === board && old.center === center && old.radiusPoint === radiusPoint &&
        old.name === cfg.name && old.showName === cfg.showName && old.sweepAngle === cfg.sweepAngle &&
        old.fixedRadius === cfg.fixedRadius && old.fixedDx === cfg.fixedDx && old.fixedDy === cfg.fixedDy &&
        old.language === cfg.language) {
      Object.assign(old, { color: cfg.color, hasExplicitColor: cfg.hasExplicitColor,
        visible: cfg.visible, lineStyle: cfg.lineStyle });
      applyMetadata(old.arc, old.label, center, radiusPoint, cfg);
      applyVisual(old.arc, old.label, cfg);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    let arc: any = null;
    let label: any = null;
    try {
      arc = board.create('curve', [
        function(t: number) { return pointAt(arc, Number(t)).x; },
        function(t: number) { return pointAt(arc, Number(t)).y; },
        0,
        1
      ], {
        name: '',
        withLabel: false,
        fixed: true,
        visible: cfg.visible,
        highlight: false,
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 4,
        ...lineStyleAttributes(cfg.lineStyle),
        lineCap: 'round',
        doAdvancedPlot: false,
        numberPointsLow: 96,
        numberPointsHigh: 192,
        needsRegularUpdate: true
      });
      applyMetadata(arc, null, center, radiusPoint, cfg);
      try { if (typeof arc.addParents === 'function') arc.addParents([center, radiusPoint]); } catch (e) {}
      label = board.create('text', [
        function() { return labelPosition(arc).x; },
        function() { return labelPosition(arc).y; },
        function() { return labelText(arc); }
      ], {
        fixed: true,
        visible: cfg.visible && cfg.showName,
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
      try { if (typeof label.addParents === 'function') label.addParents([center, radiusPoint]); } catch (e) {}
      applyMetadata(arc, label, center, radiusPoint, cfg);
      applyVisual(arc, label, cfg);
      window.__compassArcEntries[key] = {
        uid: String(uid), boardId: cfg.boardId, name: cfg.name, showName: cfg.showName,
        centerName: cfg.centerName, radiusPointName: cfg.radiusPointName, center, radiusPoint,
        sweepAngle: cfg.sweepAngle, fixedRadius: cfg.fixedRadius, fixedDx: cfg.fixedDx,
        fixedDy: cfg.fixedDy, color: cfg.color, hasExplicitColor: cfg.hasExplicitColor,
        visible: cfg.visible, language: cfg.language, lineStyle: cfg.lineStyle, board, arc, label
      };
      scheduleBootstrap(function() { try { board.update(); } catch (e) {} });
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      try { if (arc) board.removeObject(arc); } catch (removeError) {}
      return false;
    }
  };

  window.__bootstrapCompassArcs = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="compass-arc-spec-"][data-spec]:not([data-lia-static-claimed])');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^compass-arc-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'en');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderCompassArcFromSpec || !window.renderCompassArcFromSpec(uid, spec, language)) pending = true;
    });
    Object.keys(window.__compassArcEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingCompassArcs = pending;
  };

  window.__scheduleBootstrapCompassArcs = function(): void {
    if (window.__bootstrapCompassArcsRAF) return;
    window.__bootstrapCompassArcsRAF = requestAnimationFrame(function() {
      window.__bootstrapCompassArcsRAF = 0;
      try { if (window.__bootstrapCompassArcs) window.__bootstrapCompassArcs(); } catch (e) {}
    });
  };

  function containsCompassArcSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^compass-arc-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="compass-arc-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let index = 0; index < mutations.length && !needsBootstrap; index += 1) {
        const mutation = mutations[index];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^compass-arc-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const nodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = nodes.some(containsCompassArcSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapCompassArcs) window.__scheduleBootstrapCompassArcs();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-spec', 'data-language'] });
  } catch (e) {}

  window.__registerLiaThemeListener(function() {
    Object.keys(window.__compassArcEntries || {}).forEach(function(key) {
      const entry = window.__compassArcEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = getAccentColor();
      applyVisual(entry.arc, entry.label, entry as CompassArcConfig);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__compassArcRetryInterval = setInterval(function() {
    if (hasPendingCompassArcs && window.__scheduleBootstrapCompassArcs) {
      window.__scheduleBootstrapCompassArcs();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapCompassArcs) window.__scheduleBootstrapCompassArcs();
  });
}
