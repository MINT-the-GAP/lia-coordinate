// Plot function subsystem (@PlotFunction macro).
// Renders a function graph from a mathematical expression onto a JSXGraph board.

import { splitTopLevel, unquote } from '../shared/parser';

export function init(): void {
  if (window.__plotFunctionReady) {
    try {
      if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions();
    } catch (e) {}
    return;
  }
  window.__plotFunctionReady = true;

  window.__plotFunctionEntries = window.__plotFunctionEntries || {};

  function decodeExprPlaceholders(s) {
    return String(s || '')
      .replace(/\{\{/g, '(')
      .replace(/\}\}/g, ')');
  }

  function parsePlotSpec(spec) {
    const raw = unquote(spec);
    const parts = splitTopLevel(raw, ';');

    return {
      boardId: parts[0] ? unquote(parts[0]) : '',
      name:    parts[1] ? unquote(parts[1]) : 'f',
      expr:    parts[2] ? decodeExprPlaceholders(unquote(parts[2])) : '',
      color:   parts[3] ? unquote(parts[3]) : 'red'
    };
  }

  function makeKey(uid) {
    return 'plot-' + uid;
  }

  function removeExisting(uid) {
    const key = makeKey(uid);
    const entry = window.__plotFunctionEntries[key];
    if (!entry) return;

    try {
      if (entry.graph && entry.graph.board) {
        entry.graph.board.removeObject(entry.graph);
      }
    } catch (e) {}

    try {
      if (entry.label && entry.label.board) {
        entry.label.board.removeObject(entry.label);
      }
    } catch (e) {}

    try {
      if (entry.anchor && entry.anchor.board) {
        entry.anchor.board.removeObject(entry.anchor);
      }
    } catch (e) {}

    delete window.__plotFunctionEntries[key];
  }

  function sameBoard(a, b) {
    try {
      return !!a && !!b && a === b;
    } catch (e) {
      return false;
    }
  }

  function normalizeExpr(expr) {
    let s = String(expr || '').trim();

    s = s.replace(/^[A-Za-z][A-Za-z0-9_]*\s*\(\s*x\s*\)\s*=\s*/i, '');
    s = s.replace(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*/i, '');

    s = s.replace(/−/g, '-');
    s = s.replace(/\^/g, '**');

    s = s.replace(/(\d)\s*x\b/g, '$1*x');
    s = s.replace(/(\d)\s*\(/g, '$1*(');
    s = s.replace(/\bx\s*\(/g, 'x*(');
    s = s.replace(/\)\s*(\d)/g, ')*$1');

    return s.trim();
  }

  function compileExpr(expr) {
    const s = normalizeExpr(expr);

    try {
      return new Function(
        'x',
        `
        const pi = Math.PI;
        const e = Math.E;

        const sin = Math.sin;
        const cos = Math.cos;
        const tan = Math.tan;
        const asin = Math.asin;
        const acos = Math.acos;
        const atan = Math.atan;

        const sinh = Math.sinh;
        const cosh = Math.cosh;
        const tanh = Math.tanh;

        const exp = Math.exp;
        const log = Math.log;
        const ln = Math.log;
        const sqrt = Math.sqrt;
        const abs = Math.abs;
        const floor = Math.floor;
        const ceil = Math.ceil;
        const round = Math.round;
        const min = Math.min;
        const max = Math.max;
        const pow = Math.pow;

        return (${s});
        `
      );
    } catch (e) {
      return null;
    }
  }

  function safeBBox(board) {
    try {
      const bb = board.getBoundingBox();
      if (
        Array.isArray(bb) &&
        bb.length === 4 &&
        bb.every(v => Number.isFinite(v)) &&
        bb[2] > bb[0] &&
        bb[1] > bb[3]
      ) {
        return bb.slice();
      }
    } catch (e) {}

    return [-5, 5, 5, -5];
  }

  function texName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    if (raw.includes('\\(') || raw.includes('\\[') || raw.includes('$')) return raw;
    return '\\(' + raw + '\\)';
  }

  function chooseVisibleAnchorX(board, fn) {
    const bb = safeBBox(board);
    const xmin = bb[0];
    const ymax = bb[1];
    const xmax = bb[2];
    const ymin = bb[3];

    const xspan = xmax - xmin;
    const yspan = ymax - ymin;

    const xStart = xmax - 0.10 * xspan;
    const xEnd   = xmin + 0.18 * xspan;

    const yPadTop = 0.14 * yspan;
    const yPadBottom = 0.12 * yspan;

    const steps = 120;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = xStart - t * (xStart - xEnd);

      let y;
      try {
        y = fn(x);
      } catch (e) {
        y = NaN;
      }

      if (!Number.isFinite(y)) continue;
      if (y <= ymax - yPadTop && y >= ymin + yPadBottom) return x;
    }

    return xmin + 0.60 * xspan;
  }

  function createFunctionLabel(board, fn, name, color) {
    const labelText = texName(name);

    const anchor = board.create('point', [
      function() {
        return chooseVisibleAnchorX(board, fn);
      },
      function() {
        const x = chooseVisibleAnchorX(board, fn);
        let y;

        try {
          y = fn(x);
        } catch (e) {
          y = NaN;
        }

        if (!Number.isFinite(y)) {
          const bb = safeBBox(board);
          return (bb[1] + bb[3]) / 2;
        }

        return y;
      }
    ], {
      visible: false,
      fixed: true,
      withLabel: false,
      name: ''
    });

    const label = board.create('text', [
      function() {
        return anchor.X() + 0.18;
      },
      function() {
        return anchor.Y() + 0.18;
      },
      function() {
        return labelText;
      }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      strokeColor: color,
      fillColor: color,
      fontSize: 28,
      anchorX: 'left',
      anchorY: 'top'
    });

    return { anchor, label };
  }

  window.renderPlotFunctionFromSpec = function(uid, spec) {
    const cfg = parsePlotSpec(spec);

    const boardId = String(cfg.boardId || '').trim();
    const name = String(cfg.name || 'f').trim() || 'f';
    const expr = String(cfg.expr || '').trim();
    const color = String(cfg.color || 'red').trim() || 'red';

    if (!boardId || !expr) return false;

    const board = window.__boards && window.__boards[boardId];
    if (!board) return false;

    const key = makeKey(uid);
    const old = window.__plotFunctionEntries[key];

    if (
      old &&
      old.boardId === boardId &&
      old.name === name &&
      old.expr === expr &&
      old.color === color &&
      old.graph &&
      sameBoard(old.graph.board, board)
    ) {
      return true;
    }

    removeExisting(uid);

    const fn = compileExpr(expr);
    if (!fn) return false;

    try {
      const graph = board.create('functiongraph', [fn], {
        strokeColor: color,
        highlightStrokeColor: color,
        strokeWidth: 3,
        fixed: true,
        withLabel: false
      });

      const labelPack = createFunctionLabel(board, fn, name, color);

      window.__plotFunctionEntries[key] = {
        uid: uid,
        boardId: boardId,
        name: name,
        expr: expr,
        color: color,
        graph: graph,
        anchor: labelPack.anchor,
        label: labelPack.label
      };

      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  };

  window.__bootstrapPlotFunctions = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="plot-spec-"][data-spec]');

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^plot-spec-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;

      window.renderPlotFunctionFromSpec(uid, spec);
    });
  };

  try {
    const mo = new MutationObserver(function() {
      if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions();
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

  try {
    if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions();
  } catch (e) {}
}
