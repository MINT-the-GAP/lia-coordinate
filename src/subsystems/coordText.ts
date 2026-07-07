// Coordinate text subsystem (@CoordText / @KoordText macros).
// Places plain text or dollar-delimited TeX at a fixed board coordinate.

import { splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

interface CoordTextConfig {
  boardId: string;
  x: number;
  y: number;
  content: string;
  renderedContent: string;
  useMathJax: boolean;
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
}

export function init(): void {
  if (window.__coordTextReady) {
    try {
      if (window.__scheduleBootstrapCoordTexts) window.__scheduleBootstrapCoordTexts();
    } catch (e) {}
    return;
  }
  window.__coordTextReady = true;

  window.__coordTextEntries = window.__coordTextEntries || {};
  initThemeSync();

  let hasPendingCoordTexts = false;

  function parseCoordinate(value: string): { x: number; y: number } | null {
    const raw = unquote(String(value || '')).trim();
    if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
    const pair = splitTopLevel(raw.slice(1, -1), ';')
      .map(function(part) { return unquote(part).trim(); });
    if (pair.length !== 2) return null;

    const x = Number(pair[0].replace(',', '.'));
    const y = Number(pair[1].replace(',', '.'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x: x, y: y } : null;
  }

  function renderDollarTeX(content: string): { text: string; useMathJax: boolean } {
    let useMathJax = false;
    // LiaScript code parameters now preserve ordinary parentheses. Keep the
    // established {{...}} notation working for existing Koord documents too.
    let text = String(content || '')
      .replace(/\{\{/g, '(')
      .replace(/\}\}/g, ')');

    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function(_match, tex) {
      useMathJax = true;
      return '\\[' + tex + '\\]';
    });
    text = text.replace(/\$([^$\r\n]+?)\$/g, function(_match, tex) {
      useMathJax = true;
      return '\\(' + tex + '\\)';
    });

    return { text: text, useMathJax: useMathJax };
  }

  function parseCoordTextSpec(spec: string): CoordTextConfig | null {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const coordinate = parseCoordinate(parts[1] || '');
    if (!coordinate) return null;

    const content = String(parts[2] || '');
    const rendered = renderDollarTeX(content);
    const explicitColor = String(parts[3] || '').trim();
    const parsedOpacity = parseFloat(String(parts[4] || '').replace(',', '.'));

    return {
      boardId: String(parts[0] || '').trim(),
      x: coordinate.x,
      y: coordinate.y,
      content: content,
      renderedContent: rendered.text,
      useMathJax: rendered.useMathJax,
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      opacity: Number.isFinite(parsedOpacity)
        ? Math.max(0, Math.min(1, parsedOpacity))
        : 1
    };
  }

  function entryKey(uid: string): string {
    return 'coord-text-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__coordTextEntries[key];
    if (!entry) return;
    try {
      if (entry.board && entry.text) entry.board.removeObject(entry.text);
    } catch (e) {}
    delete window.__coordTextEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function applyTextStyle(text: any, color: string, opacity: number): void {
    if (!text || typeof text.setAttribute !== 'function') return;
    try {
      text.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color,
        fillColor: color,
        highlightFillColor: color,
        strokeOpacity: opacity,
        highlightStrokeOpacity: opacity,
        fillOpacity: opacity,
        highlightFillOpacity: opacity,
        cssStyle: 'opacity:' + opacity + ';'
      });
    } catch (e) {}
  }

  window.renderCoordTextFromSpec = function(uid: string, spec: string): boolean {
    const cfg = parseCoordTextSpec(spec);
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

    const old = window.__coordTextEntries[key];
    if (
      old &&
      old.board === board &&
      old.x === cfg.x &&
      old.y === cfg.y &&
      old.content === cfg.content &&
      old.text
    ) {
      old.color = cfg.color;
      old.opacity = cfg.opacity;
      old.hasExplicitColor = cfg.hasExplicitColor;
      applyTextStyle(old.text, cfg.color, cfg.opacity);
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    let text = null;

    try {
      text = board.create('text', [cfg.x, cfg.y, cfg.renderedContent], {
        fixed: true,
        highlight: false,
        parse: false,
        useMathJax: cfg.useMathJax,
        display: 'html',
        anchorX: 'middle',
        anchorY: 'middle',
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        fillColor: cfg.color,
        highlightFillColor: cfg.color,
        strokeOpacity: cfg.opacity,
        highlightStrokeOpacity: cfg.opacity,
        fillOpacity: cfg.opacity,
        highlightFillOpacity: cfg.opacity,
        cssStyle: 'opacity:' + cfg.opacity + ';',
        fontSize: 18
      });

      window.__coordTextEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        x: cfg.x,
        y: cfg.y,
        content: cfg.content,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        opacity: cfg.opacity,
        board: board,
        text: text
      };

      scheduleBootstrap(function() {
        try { board.update(); } catch (e) {}
      });
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (text) board.removeObject(text); } catch (removeError) {}
      return false;
    }
  };

  window.__bootstrapCoordTexts = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('.lia-coord-text-spec[data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^coord-text-spec-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid) return;

      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderCoordTextFromSpec || !window.renderCoordTextFromSpec(uid, spec)) {
        pending = true;
      }
    });

    Object.keys(window.__coordTextEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingCoordTexts = pending;
  };

  window.__scheduleBootstrapCoordTexts = function(): void {
    if (window.__bootstrapCoordTextsRAF) return;
    window.__bootstrapCoordTextsRAF = requestAnimationFrame(function() {
      window.__bootstrapCoordTextsRAF = 0;
      try { if (window.__bootstrapCoordTexts) window.__bootstrapCoordTexts(); } catch (e) {}
    });
  };

  function containsCoordTextSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^coord-text-spec-/.test(element.id)) return true;
    return !!(element.querySelector &&
      element.querySelector('.lia-coord-text-spec[data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^coord-text-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsCoordTextSpec);
      }

      if (needsBootstrap && window.__scheduleBootstrapCoordTexts) {
        window.__scheduleBootstrapCoordTexts();
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
    Object.keys(window.__coordTextEntries || {}).forEach(function(key) {
      const entry = window.__coordTextEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = getAccentColor();
      applyTextStyle(entry.text, entry.color, entry.opacity);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__coordTextRetryInterval = setInterval(function() {
    if (hasPendingCoordTexts && window.__scheduleBootstrapCoordTexts) {
      window.__scheduleBootstrapCoordTexts();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapCoordTexts) window.__scheduleBootstrapCoordTexts();
  });
}
