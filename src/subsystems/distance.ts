// Segment subsystem (@Strecke / @distance macros).
// Connects two named points from the shared point registry on a JSXGraph board.

import { splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

interface DistanceConfig {
  boardId: string;
  point1Name: string;
  point2Name: string;
  color: string;
  hasExplicitColor: boolean;
  language: 'de' | 'en';
  showLength: boolean;
  segmentName: string;
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

  function parseDistanceSpec(spec: string, language?: string): DistanceConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const pointPair = String(parts[1] || '').trim();
    const usesPointPair = pointPair.startsWith('[') && pointPair.endsWith(']');
    let point1Name = '';
    let point2Name = '';
    let colorIndex = 3;

    if (usesPointPair) {
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
    const segmentName = trailingOptions.find(function(part) {
      return !/^length\s*=/i.test(part);
    }) || '';

    return {
      boardId: String(parts[0] || '').trim(),
      point1Name: point1Name,
      point2Name: point2Name,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
      showLength: trailingOptions.some(function(part) {
        return /^length\s*=\s*1$/i.test(part);
      }),
      segmentName: segmentName
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

    try {
      if (entry.board && entry.segment) entry.board.removeObject(entry.segment);
    } catch (e) {}

    delete window.__distanceEntries[key];
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

  function applySegmentColor(segment: any, color: string): void {
    if (!segment || typeof segment.setAttribute !== 'function') return;

    try {
      segment.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color
      });
    } catch (e) {}
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

  function lengthLabelText(cfg: DistanceConfig, point1: any, point2: any): string {
    let distance = NaN;

    try {
      distance = Math.hypot(point2.X() - point1.X(), point2.Y() - point1.Y());
    } catch (e) {}

    if (!Number.isFinite(distance)) return '';

    const rounded = Math.round((distance + Number.EPSILON) * 1000) / 1000;
    const unchanged = Math.abs(distance - rounded) <= Math.max(1, Math.abs(distance)) * 1e-10;
    const relation = unchanged ? '=' : '\\approx';
    let value = rounded.toFixed(3);
    if (cfg.language === 'de') value = value.replace('.', '{,}');

    const unit = cfg.language === 'de' ? 'LE' : 'LU';
    const pointNames = texPointName(cfg.point1Name) + texPointName(cfg.point2Name);
    const measuredObject = cfg.segmentName
      ? texPointName(cfg.segmentName)
      : '\\left| \\overline{' + pointNames + '} \\right|';

    return '\\(' + measuredObject + ' ' + relation + ' ' +
      value + '\\,\\mathrm{' + unit + '}\\)';
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
    point1: any,
    point2: any,
    label: any,
    cfg: DistanceConfig
  ): { x: number; y: number } {
    const x1 = Number(point1.X());
    const y1 = Number(point1.Y());
    const x2 = Number(point2.X());
    const y2 = Number(point2.Y());
    const midpointX = (x1 + x2) / 2;
    const midpointY = (y1 + y2) / 2;
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
    const offsetPx = halfExtentAlongNormal + 6;

    return {
      x: midpointX + normalX * offsetPx / unitX,
      y: midpointY - normalY * offsetPx / unitY
    };
  }

  function createLengthLabel(board: any, point1: any, point2: any, cfg: DistanceConfig): any {
    let label = null;

    label = board.create('text', [
      function() { return labelPosition(board, point1, point2, label, cfg).x; },
      function() { return labelPosition(board, point1, point2, label, cfg).y; },
      function() { return lengthLabelText(cfg, point1, point2); }
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

    if (!uid || !cfg.boardId || !cfg.point1Name || !cfg.point2Name) {
      removeEntry(uid);
      return false;
    }

    const board = window.__boards && window.__boards[cfg.boardId];
    const point1 = getLivePoint(board, cfg.boardId, cfg.point1Name);
    const point2 = getLivePoint(board, cfg.boardId, cfg.point2Name);

    if (!board || !point1 || !point2 || point1 === point2) {
      removeEntry(uid);
      return false;
    }

    const old = window.__distanceEntries[key];
    if (
      old &&
      old.board === board &&
      old.point1 === point1 &&
      old.point2 === point2 &&
      old.boardId === cfg.boardId &&
      old.point1Name === cfg.point1Name &&
      old.point2Name === cfg.point2Name &&
      old.language === cfg.language &&
      old.showLength === cfg.showLength &&
      old.segmentName === cfg.segmentName &&
      (!cfg.showLength || old.label) &&
      old.segment
    ) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applySegmentColor(old.segment, cfg.color);
      applyLabelColor(old.label, cfg.color);
      return true;
    }

    removeEntry(uid);

    let segment = null;
    let label = null;

    try {
      segment = board.create('segment', [point1, point2], {
        name: '',
        withLabel: false,
        fixed: true,
        highlight: false,
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        straightFirst: false,
        straightLast: false
      });

      if (cfg.showLength) label = createLengthLabel(board, point1, point2, cfg);

      window.__distanceEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        point1Name: cfg.point1Name,
        point2Name: cfg.point2Name,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        language: cfg.language,
        showLength: cfg.showLength,
        segmentName: cfg.segmentName,
        board: board,
        point1: point1,
        point2: point2,
        segment: segment,
        label: label
      };

      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (label) board.removeObject(label); } catch (removeError) {}
      try { if (segment) board.removeObject(segment); } catch (removeError) {}
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
        applySegmentColor(entry.segment, entry.color);
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
