// Axis title subsystem (@AxisLabel macro).
// Renders LaTeX axis labels as overlays on a JSXGraph board.

import { splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { setStyleIfChanged } from '../shared/domUpdates';

export function init(): void {
  if (window.__axisTitlesReady) {
    try {
      if (window.__bootstrapAxisTitles) window.__bootstrapAxisTitles();
    } catch (e) {}
    return;
  }
  window.__axisTitlesReady = true;

  window.__liaAxisTitleSpecs = window.__liaAxisTitleSpecs || {};

  function normalizeAxisLabelMath(s) {
    let out = String(s || '').trim();
    if (!out) return '';

    // Keep compatibility with legacy Koord authoring where parentheses were
    // written as {{...}} inside macro specs.
    out = out.replace(/\{\{/g, '(').replace(/\}\}/g, ')');

    out = out.replace(/\\\$/g, '__LIA_ESC_DOLLAR__');
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, function (_, inner) {
      return '\\[' + inner + '\\]';
    });
    out = out.replace(/\$([^$]+?)\$/g, function (_, inner) {
      return '\\(' + inner + '\\)';
    });
    out = out.replace(/__LIA_ESC_DOLLAR__/g, '$');

    return out;
  }

  function getMathJaxEngine() {
    try {
      if (window.MathJax) return window.MathJax;
    } catch (e) {}

    try {
      if (window.parent && window.parent.MathJax) return window.parent.MathJax;
    } catch (e) {}

    return null;
  }

  function getSafeBBox(board) {
    try {
      const bb = board.getBoundingBox();
      if (
        Array.isArray(bb) &&
        bb.length === 4 &&
        bb.every(function(v){ return Number.isFinite(v); }) &&
        bb[2] > bb[0] &&
        bb[1] > bb[3]
      ) {
        return bb.slice();
      }
    } catch (e) {}

    return [-5, 5, 5, -5];
  }

  function userToScrX(board, x) {
    return board.origin.scrCoords[1] + x * board.unitX;
  }

  function userToScrY(board, y) {
    return board.origin.scrCoords[2] - y * board.unitY;
  }

  function createOverlay(board) {
    const el = document.createElement('div');
    setStyleIfChanged(el, 'position', 'absolute');
    setStyleIfChanged(el, 'pointerEvents', 'none');
    setStyleIfChanged(el, 'zIndex', '40');
    setStyleIfChanged(el, 'whiteSpace', 'nowrap');
    setStyleIfChanged(el, 'lineHeight', '1.2');
    setStyleIfChanged(el, 'fontSize', '20px');
    setStyleIfChanged(el, 'maxWidth', 'none');
    setStyleIfChanged(el, 'display', 'none');
    board.containerObj.appendChild(el);
    return el;
  }

  function ensureOverlays(board) {
    if (!board || !board.containerObj) return;

    if (!board.__xTitleOverlay) {
      board.__xTitleOverlay = createOverlay(board);
    }

    if (!board.__yTitleOverlay) {
      board.__yTitleOverlay = createOverlay(board);
    }
  }

  function setOverlayContent(el, html) {
    if (!el) return;

    if (!html) {
      setStyleIfChanged(el, 'display', 'none');
      return;
    }

    setStyleIfChanged(el, 'display', 'block');

    if (el.__liaHtml === html) return;
    el.__liaHtml = html;
    el.innerHTML = html;

    const MJ = getMathJaxEngine();
    if (MJ && typeof MJ.typesetPromise === 'function') {
      try {
        MJ.typesetPromise([el]).catch(function(){});
      } catch (e) {}
    }
  }

  function parseSpec(spec) {
    const raw = unquote(String(spec || '').trim());
    const obj: Record<string, string> = {};

    splitTopLevel(raw).forEach(function(part) {
      const eq = part.indexOf('=');
      if (eq < 0) return;

      const key = part.slice(0, eq).trim().toLowerCase();
      const val = unquote(part.slice(eq + 1).trim());
      obj[key] = val;
    });

    return {
      id: obj.id != null ? obj.id : '',
      xlabel: obj.xlabel != null ? obj.xlabel : '',
      ylabel: obj.ylabel != null ? obj.ylabel : ''
    };
  }

  function applyAxisTitles(boardId) {
    const specs = window.__liaAxisTitleSpecs || {};
    const cfg = specs[boardId];
    if (!cfg) return;

    const board = window.__boards && window.__boards[boardId];
    if (!board || !board.containerObj) return;

    ensureOverlays(board);

    const xEl = board.__xTitleOverlay;
    const yEl = board.__yTitleOverlay;

    const bb = getSafeBBox(board);
    const xmin = bb[0];
    const ymax = bb[1];
    const xmax = bb[2];
    const ymin = bb[3];

    const w = board.containerObj.clientWidth || 0;
    const h = board.containerObj.clientHeight || 0;
    const dgsMenu = board.containerObj.querySelector('.lia-dgs-top-menu');
    const dgsSideMenu = board.containerObj.querySelector('.lia-dgs-side-menu');
    const dgsMenuOpen = !!dgsMenu && dgsMenu.getAttribute('data-open') === '1';
    const dgsSideMenuOpen = !!dgsSideMenu && dgsSideMenu.getAttribute('data-open') === '1';
    const safeTop = dgsMenuOpen ? 62 : 12;

    const xAxisTop = 0 > ymax;
    const xAxisBottom = 0 < ymin;
    const yAxisLeft = 0 < xmin;
    const yAxisRight = 0 > xmax;

    const col = getNeutralColor();
    if (xEl) setStyleIfChanged(xEl, 'color', col);
    if (yEl) setStyleIfChanged(yEl, 'color', col);

    const xHTML = normalizeAxisLabelMath(cfg.xlabel || '');
    const yHTML = normalizeAxisLabelMath(cfg.ylabel || '');

    setOverlayContent(xEl, xHTML);
    setOverlayContent(yEl, yHTML);

    if (xEl && xHTML) {
      setStyleIfChanged(xEl, 'left', 'auto');
      setStyleIfChanged(xEl, 'right', (dgsSideMenuOpen ? 202 : 12) + 'px');
      setStyleIfChanged(xEl, 'textAlign', 'right');
      setStyleIfChanged(xEl, 'transform', 'none');

      if (xAxisTop) {
        setStyleIfChanged(xEl, 'top', (dgsMenuOpen ? 62 : 44) + 'px');
        setStyleIfChanged(xEl, 'bottom', 'auto');
      } else if (xAxisBottom) {
        setStyleIfChanged(xEl, 'top', 'auto');
        setStyleIfChanged(xEl, 'bottom', '12px');
      } else {
        const scrY = userToScrY(board, 0);

        if (scrY < h / 2) {
          setStyleIfChanged(xEl, 'top', Math.max(safeTop, Math.round(scrY + 16)) + 'px');
          setStyleIfChanged(xEl, 'bottom', 'auto');
        } else {
          setStyleIfChanged(xEl, 'top', Math.max(safeTop, Math.round(scrY - 34)) + 'px');
          setStyleIfChanged(xEl, 'bottom', 'auto');
        }
      }
    }

    if (yEl && yHTML) {
      setStyleIfChanged(yEl, 'top', Math.max(safeTop, xAxisTop ? 64 : 12) + 'px');
      setStyleIfChanged(yEl, 'bottom', 'auto');

      if (yAxisLeft) {
        setStyleIfChanged(yEl, 'left', '40px');
        setStyleIfChanged(yEl, 'right', 'auto');
        setStyleIfChanged(yEl, 'textAlign', 'left');
        setStyleIfChanged(yEl, 'transform', 'none');
      } else if (yAxisRight) {
        setStyleIfChanged(yEl, 'left', Math.max(0, w - 40) + 'px');
        setStyleIfChanged(yEl, 'right', 'auto');
        setStyleIfChanged(yEl, 'textAlign', 'right');
        setStyleIfChanged(yEl, 'transform', 'translateX(-100%)');
      } else {
        const scrX = userToScrX(board, 0);

        if (scrX < w / 2) {
          setStyleIfChanged(yEl, 'left', Math.round(scrX + 18) + 'px');
          setStyleIfChanged(yEl, 'right', 'auto');
          setStyleIfChanged(yEl, 'textAlign', 'left');
          setStyleIfChanged(yEl, 'transform', 'none');
        } else {
          setStyleIfChanged(yEl, 'left', Math.round(scrX - 18) + 'px');
          setStyleIfChanged(yEl, 'right', 'auto');
          setStyleIfChanged(yEl, 'textAlign', 'right');
          setStyleIfChanged(yEl, 'transform', 'translateX(-100%)');
        }
      }
    }
  }

  window.renderAxisTitlesFromSpec = function(spec) {
    const cfg = parseSpec(spec);
    if (!cfg.id) return false;

    window.__liaAxisTitleSpecs[cfg.id] = cfg;
    applyAxisTitles(cfg.id);
    return true;
  };

  window.__refreshAllAxisTitles = function() {
    const specs = window.__liaAxisTitleSpecs || {};
    Object.keys(specs).forEach(applyAxisTitles);
  };
  window.__refreshAxisTitlesForBoard = function(boardId: string) {
    applyAxisTitles(String(boardId || ''));
  };

  function removeAxisTitles(boardId) {
    const board = window.__boards && window.__boards[boardId];
    ['__xTitleOverlay', '__yTitleOverlay'].forEach(function(key) {
      const overlay = board && board[key];
      try { if (overlay) overlay.remove(); } catch (e) {}
      if (board) board[key] = null;
    });
    delete window.__liaAxisTitleSpecs[boardId];
  }

  function stopAxisTitleInterval() {
    if (!window.__axisTitlesInterval) return;
    clearInterval(window.__axisTitlesInterval);
    window.__axisTitlesInterval = undefined;
  }

  function ensureAxisTitleInterval() {
    if (window.__axisTitlesInterval) return;
    window.__axisTitlesInterval = setInterval(function() {
      try { window.__bootstrapAxisTitles?.(); } catch (e) {}
    }, 400);
  }

  window.__bootstrapAxisTitles = function() {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[id^="axis-title-spec-"][data-spec]'));
    const activeBoardIds = new Set<string>();

    nodes.forEach(function(node) {
      const spec = String(node.dataset.spec || '');
      if (!spec) return;
      const cfg = parseSpec(spec);
      const board = cfg.id && window.__boards && window.__boards[cfg.id];
      if (node.hasAttribute('data-lia-static-claimed') || !board) {
        node.__liaAxisBootstrapped = false;
        node.__liaAxisLastSpec = '';
        if (cfg.id) removeAxisTitles(cfg.id);
        return;
      }
      activeBoardIds.add(cfg.id);

      if (node.__liaAxisBootstrapped && node.__liaAxisLastSpec === spec) return;

      node.__liaAxisBootstrapped = true;
      node.__liaAxisLastSpec = spec;

      window.renderAxisTitlesFromSpec(spec);
    });

    Object.keys(window.__liaAxisTitleSpecs || {}).forEach(function(boardId) {
      if (!activeBoardIds.has(boardId) || !(window.__boards && window.__boards[boardId])) {
        removeAxisTitles(boardId);
      }
    });

    window.__refreshAllAxisTitles();
    if (activeBoardIds.size) ensureAxisTitleInterval();
    else stopAxisTitleInterval();
  };

  let kickRAF = 0;
  function kickAxisTitles() {
    if (kickRAF) return;
    kickRAF = requestAnimationFrame(function() {
      kickRAF = 0;
      try {
        if (window.__bootstrapAxisTitles) window.__bootstrapAxisTitles();
      } catch (e) {}
    });
  }

  function containsAxisTitleMarker(node: Node): boolean {
    if (!(node instanceof Element)) return false;
    if (node.matches('[id^="axis-title-spec-"][data-spec]')) return true;
    return !!node.querySelector('[id^="axis-title-spec-"][data-spec]');
  }

  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = function() {
      kickAxisTitles();
    };

    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (mq && typeof (mq as any).addListener === 'function') (mq as any).addListener(handler);
  } catch (e) {}

  window.addEventListener('resize', function() {
    requestAnimationFrame(function() {
      kickAxisTitles();
    });
  });

  try {
    const mo = new MutationObserver(function(mutations) {
      const relevant = mutations.some(function(mutation) {
        if (
          mutation.type === 'attributes' &&
          mutation.target instanceof Element &&
          mutation.target.matches('[id^="axis-title-spec-"]')
        ) return true;
        return Array.from(mutation.addedNodes).some(containsAxisTitleMarker) ||
          Array.from(mutation.removedNodes).some(containsAxisTitleMarker);
      });
      if (relevant) kickAxisTitles();
    });

    const root = document.body || document.documentElement;
    if (root) {
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-spec']
      });
    }
  } catch (e) {}

  scheduleBootstrap(kickAxisTitles);
}
