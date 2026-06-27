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

  function parseDistanceSpec(spec: string): DistanceConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const explicitColor = String(parts[3] || '').trim();

    return {
      boardId: String(parts[0] || '').trim(),
      point1Name: String(parts[1] || '').trim(),
      point2Name: String(parts[2] || '').trim(),
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor
    };
  }

  function entryKey(uid: string): string {
    return 'distance-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__distanceEntries[key];
    if (!entry) return;

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

  window.renderDistanceFromSpec = function(uid: string, spec: string): boolean {
    const cfg = parseDistanceSpec(spec);
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
      old.segment
    ) {
      old.color = cfg.color;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applySegmentColor(old.segment, cfg.color);
      return true;
    }

    removeEntry(uid);

    try {
      const segment = board.create('segment', [point1, point2], {
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

      window.__distanceEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        point1Name: cfg.point1Name,
        point2Name: cfg.point2Name,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        board: board,
        point1: point1,
        point2: point2,
        segment: segment
      };

      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
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
      if (!uid) return;

      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderDistanceFromSpec || !window.renderDistanceFromSpec(uid, spec)) {
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
        attributeFilter: ['data-spec']
      });
    }
  } catch (e) {}

  window.__registerLiaThemeListener(function() {
    Object.keys(window.__distanceEntries || {}).forEach(function(key) {
      const entry = window.__distanceEntries[key];
      if (!entry || entry.hasExplicitColor) return;
      entry.color = getAccentColor();
      applySegmentColor(entry.segment, entry.color);
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
