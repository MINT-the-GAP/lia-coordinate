// Axis title subsystem (@AxisLabel macro).
// Renders LaTeX axis labels as overlays on a JSXGraph board.

export function init(): void {
  if (window.__axisTitlesReady) {
    try {
      if (window.__bootstrapAxisTitles) window.__bootstrapAxisTitles();
    } catch (e) {}
    return;
  }
  window.__axisTitlesReady = true;

  window.__liaAxisTitleSpecs = window.__liaAxisTitleSpecs || {};

  function splitTopLevel(str) {
    const out = [];
    let cur = '';
    let quote = '';
    let esc = false;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (esc) {
        cur += ch;
        esc = false;
        continue;
      }

      if (ch === '\\') {
        cur += ch;
        esc = true;
        continue;
      }

      if (quote) {
        cur += ch;
        if (ch === quote) quote = '';
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        cur += ch;
        quote = ch;
        continue;
      }

      if (ch === ';' || ch === ',') {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
        continue;
      }

      cur += ch;
    }

    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function unquote(v) {
    v = String(v || '').trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")) ||
      (v.startsWith('`') && v.endsWith('`'))
    ) {
      return v.slice(1, -1);
    }
    return v;
  }

  function normalizeAxisLabelMath(s) {
    let out = String(s || '').trim();
    if (!out) return '';

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

  function getMathJaxEngine() {
    try {
      if (window.MathJax) return window.MathJax;
    } catch (e) {}

    try {
      if (window.parent && window.parent.MathJax) return window.parent.MathJax;
    } catch (e) {}

    return null;
  }

  function neutralColor() {
    try {
      const doc = (window.parent && window.parent.document) ? window.parent.document : document;
      const win = (window.parent && window.parent.getComputedStyle) ? window.parent : window;
      const el  = doc.body || doc.documentElement;
      const bg  = win.getComputedStyle(el).backgroundColor;
      const m   = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return '#000';

      const r = parseInt(m[1], 10);
      const g = parseInt(m[2], 10);
      const b = parseInt(m[3], 10);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      return lum < 128 ? '#fff' : '#000';
    } catch (e) {
      return '#000';
    }
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
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '40';
    el.style.whiteSpace = 'nowrap';
    el.style.lineHeight = '1.2';
    el.style.fontSize = '20px';
    el.style.maxWidth = 'none';
    el.style.display = 'none';
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
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';

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

  function applyAxisTitles(boardId) {
    const specs = window.__liaAxisTitleSpecs || {};
    const cfg = specs[boardId];
    if (!cfg) return;

    const board = window.__boards && window.__boards[boardId];
    if (!board || !board.containerObj) return;

    ensureOverlays(board);

    const xEl = board.__xTitleOverlay;
    const yEl = board.__yTitleOverlay;

    const col = neutralColor();
    if (xEl) xEl.style.color = col;
    if (yEl) yEl.style.color = col;

    const xHTML = normalizeAxisLabelMath(cfg.xlabel || '');
    const yHTML = normalizeAxisLabelMath(cfg.ylabel || '');

    setOverlayContent(xEl, xHTML);
    setOverlayContent(yEl, yHTML);

    const bb = getSafeBBox(board);
    const xmin = bb[0];
    const ymax = bb[1];
    const xmax = bb[2];
    const ymin = bb[3];

    const w = board.containerObj.clientWidth || 0;
    const h = board.containerObj.clientHeight || 0;

    const xAxisTop = 0 > ymax;
    const xAxisBottom = 0 < ymin;
    const yAxisLeft = 0 < xmin;
    const yAxisRight = 0 > xmax;

    if (xEl && xHTML) {
      xEl.style.left = 'auto';
      xEl.style.right = '12px';
      xEl.style.textAlign = 'right';
      xEl.style.transform = 'none';

      if (xAxisTop) {
        xEl.style.top = '44px';
        xEl.style.bottom = 'auto';
      } else if (xAxisBottom) {
        xEl.style.top = 'auto';
        xEl.style.bottom = '12px';
      } else {
        const scrY = userToScrY(board, 0);

        if (scrY < h / 2) {
          xEl.style.top = Math.max(8, Math.round(scrY + 16)) + 'px';
          xEl.style.bottom = 'auto';
        } else {
          xEl.style.top = Math.max(8, Math.round(scrY - 34)) + 'px';
          xEl.style.bottom = 'auto';
        }
      }
    }

    if (yEl && yHTML) {
      yEl.style.top = (xAxisTop ? 64 : 12) + 'px';
      yEl.style.bottom = 'auto';

      if (yAxisLeft) {
        yEl.style.left = '40px';
        yEl.style.right = 'auto';
        yEl.style.textAlign = 'left';
        yEl.style.transform = 'none';
      } else if (yAxisRight) {
        yEl.style.left = Math.max(0, w - 40) + 'px';
        yEl.style.right = 'auto';
        yEl.style.textAlign = 'right';
        yEl.style.transform = 'translateX(-100%)';
      } else {
        const scrX = userToScrX(board, 0);

        if (scrX < w / 2) {
          yEl.style.left = Math.round(scrX + 18) + 'px';
          yEl.style.right = 'auto';
          yEl.style.textAlign = 'left';
          yEl.style.transform = 'none';
        } else {
          yEl.style.left = Math.round(scrX - 18) + 'px';
          yEl.style.right = 'auto';
          yEl.style.textAlign = 'right';
          yEl.style.transform = 'translateX(-100%)';
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

  window.__bootstrapAxisTitles = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="axis-title-spec-"][data-spec]');

    nodes.forEach(function(node) {
      const spec = String(node.dataset.spec || '');
      if (!spec) return;

      if (node.__liaAxisBootstrapped && node.__liaAxisLastSpec === spec) return;

      node.__liaAxisBootstrapped = true;
      node.__liaAxisLastSpec = spec;

      window.renderAxisTitlesFromSpec(spec);
    });

    window.__refreshAllAxisTitles();
  };

  function kickAxisTitles() {
    try {
      if (window.__bootstrapAxisTitles) window.__bootstrapAxisTitles();
    } catch (e) {}
  }

  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = function() {
      kickAxisTitles();
    };

    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (mq && typeof mq.addListener === 'function') mq.addListener(handler);
  } catch (e) {}

  window.addEventListener('resize', function() {
    requestAnimationFrame(function() {
      kickAxisTitles();
    });
  });

  try {
    const mo = new MutationObserver(function() {
      kickAxisTitles();
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

  setInterval(function() {
    kickAxisTitles();
  }, 400);

  kickAxisTitles();
}
