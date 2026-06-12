// Points-on-graph subsystem (@PointsOnGraph macro).
// Drag multiple points onto a function graph as a quiz exercise.

import { unquote } from '../shared/parser';
import { getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

export function init(): void {
  if (window.__pointsOnGraphReady) {
    try {
      if (window.__scheduleBootstrapPointsOnGraph) window.__scheduleBootstrapPointsOnGraph();
      else if (window.__bootstrapPointsOnGraph) window.__bootstrapPointsOnGraph();
    } catch (e) {}
    return;
  }
  window.__pointsOnGraphReady = true;

  try {
    if (window.JXG && JXG.Options && JXG.Options.text) {
      JXG.Options.text.useMathJax = true;
    }
  } catch (e) {}

  window.__points = window.__points || {};
  window.__pointStates = window.__pointStates || {};
  window.__pointGraphs = window.__pointGraphs || {};
  window.__pointGraphStates = window.__pointGraphStates || {};
  window.__pointNeutralColor = getNeutralColor;
  window.__pointsOnGraphInstances = window.__pointsOnGraphInstances || {};
  window.__pointsOnGraphLocks = window.__pointsOnGraphLocks || {};

  initThemeSync();

  function splitSpec(spec) {
    return unquote(spec)
      .split(';')
      .map(function(s) { return s.trim(); });
  }

  function parseCountToken(s) {
    const raw = String(s || '').trim();
    const cleaned = raw.replace(/^n\s*=\s*/i, '');
    const v = parseInt(cleaned, 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  function parseDistanceToken(s) {
    const raw = String(s || '').trim();
    const cleaned = raw.replace(/^d\s*=\s*/i, '');
    const v = parseFloat(cleaned.replace(',', '.'));
    return Number.isFinite(v) ? Math.abs(v) : 0;
  }

  function parseEpsToken(s, fallback) {
    const v = parseFloat(String(s || '').replace(',', '.'));
    return Number.isFinite(v) ? Math.abs(v) : fallback;
  }

  function isColorToken(s) {
    const v = String(s || '').trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
  }

  function texName(name) {
    const s = String(name || '').trim();
    if (!s) return '\\(f\\)';
    if (s.includes('\\(') || s.includes('\\[') || s.includes('$')) return s;

    const m = s.match(/^(.+?)_(.+)$/);
    if (m) {
      return '\\(' + m[1] + '_{' + m[2] + '}\\)';
    }
    return '\\(' + s + '\\)';
  }

  function ensureBuckets(boardId) {
    window.__points[boardId] = window.__points[boardId] || {};
    window.__pointStates[boardId] = window.__pointStates[boardId] || {};
    window.__pointGraphs[boardId] = window.__pointGraphs[boardId] || {};
    window.__pointGraphStates[boardId] = window.__pointGraphStates[boardId] || {};
  }

  function getTargetFromSpec(spec) {
    const parts = splitSpec(spec);

    const boardId = parts[0] || '';
    const count   = parseCountToken(parts[1] || '1');
    const minDist = parseDistanceToken(parts[2] || '0');
    const prefix  = parts[3] || 'A';

    let pointColor = '#ff00ff';
    let graphName = 'f';
    let expr = '';
    let graphColor = '#b41f65';
    let eps = 0.05;

    if (isColorToken(parts[4])) {
      pointColor = parts[4] || '#ff00ff';
      graphName = parts[5] || 'f';
      expr = parts[6] || '';
      graphColor = isColorToken(parts[7]) ? parts[7] : '#b41f65';
      eps = parseEpsToken(parts[8], 0.05);
    } else {
      graphName = parts[4] || 'f';
      expr = parts[5] || '';
      eps = parseEpsToken(parts[6], 0.05);
    }

    const names = [];
    for (let i = 1; i <= count; i++) {
      names.push(prefix + '_' + i);
    }

    return {
      boardId: boardId,
      count: count,
      minDist: minDist,
      prefix: prefix,
      pointColor: pointColor || '#ff00ff',
      graphName: graphName || 'f',
      expr: expr,
      graphColor: graphColor || '#b41f65',
      eps: eps,
      names: names
    };
  }

  function getGraphKey(target) {
    return [
      String(target.prefix || ''),
      String(target.count || 0),
      String(target.graphName || ''),
      String(target.expr || '')
    ].join('||');
  }

  function isLocked(uid) {
    return !!window.__pointsOnGraphLocks[String(uid)];
  }

  function setLocked(uid, value) {
    window.__pointsOnGraphLocks[String(uid)] = !!value;
    try {
      applyPointsOnGraphUi(uid);
    } catch (e) {}
  }

  function applyPointVisual(pt, pointColor) {
    if (!pt || typeof pt.setAttribute !== 'function') return;

    const pCol = String(pointColor || '#ff00ff').trim() || '#ff00ff';

    try {
      pt.setAttribute({
        strokeColor: pCol,
        fillColor: pCol,
        highlightStrokeColor: pCol,
        highlightFillColor: pCol,
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        face: 'x',
        size: 7
      });
    } catch (e) {}
  }

  function stylePointLabel(pt) {
    if (!pt || typeof pt.setAttribute !== 'function') return;

    const c = getNeutralColor();

    try {
      pt.setAttribute({
        label: {
          strokeColor: c,
          fillColor: c,
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });
    } catch (e) {}

    try {
      if (pt.label && typeof pt.label.setAttribute === 'function') {
        pt.label.setAttribute({
          strokeColor: c,
          fillColor: c,
          fontSize: 24,
          parse: false,
          useMathJax: true
        });
      }
    } catch (e) {}
  }

  function refreshAllPointLabels() {
    try {
      const boards = window.__points || {};
      Object.keys(boards).forEach(function(boardId) {
        const entries = boards[boardId] || {};
        Object.keys(entries).forEach(function(name) {
          stylePointLabel(entries[name]);
        });
      });
    } catch (e) {}
  }

  function savePointState(boardId, name, pt) {
    if (!pt) return;
    ensureBuckets(boardId);

    let fixed = false;
    try {
      fixed = !!(pt.getAttribute ? pt.getAttribute('fixed') : pt.visProp && pt.visProp.fixed);
    } catch (e) {}

    try {
      window.__pointStates[boardId][name] = {
        x: pt.X(),
        y: pt.Y(),
        fixed: fixed
      };
    } catch (e) {}
  }

  function movePointTo(pt, x, y) {
    if (!pt) return false;

    try {
      if (typeof pt.moveTo === 'function') {
        pt.moveTo([x, y], 0);
        return true;
      }
    } catch (e) {}

    try {
      if (typeof pt.setPositionDirectly === 'function' && typeof JXG !== 'undefined') {
        pt.setPositionDirectly(JXG.COORDS_BY_USER, [x, y]);
        return true;
      }
    } catch (e) {}

    try {
      if (typeof pt.setPosition === 'function' && typeof JXG !== 'undefined') {
        pt.setPosition(JXG.COORDS_BY_USER, [x, y]);
        return true;
      }
    } catch (e) {}

    return false;
  }

  function bindPointPersistence(boardId, name, pt) {
    if (!pt || pt.__liaStateBound) return;
    pt.__liaStateBound = true;

    const persist = function() {
      savePointState(boardId, name, pt);
    };

    try { pt.on('drag', persist); } catch (e) {}
    try { pt.on('up', persist); } catch (e) {}
    try { pt.on('move', persist); } catch (e) {}

    persist();
  }

  function createPoint(board, boardId, name, x0, y0, pointColor) {
    const pCol = String(pointColor || '#ff00ff').trim() || '#ff00ff';

    try {
      const pt = board.create('point', [x0, y0], {
        name: texName(name),
        fixed: false,
        withLabel: true,
        showInfobox: false,
        strokeColor: pCol,
        fillColor: pCol,
        highlightStrokeColor: pCol,
        highlightFillColor: pCol,
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        face: 'x',
        size: 7,
        label: {
          strokeColor: getNeutralColor(),
          fillColor: getNeutralColor(),
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });

      ensureBuckets(boardId);
      window.__points[boardId][name] = pt;

      applyPointVisual(pt, pCol);
      stylePointLabel(pt);
      bindPointPersistence(boardId, name, pt);
      savePointState(boardId, name, pt);

      return pt;
    } catch (e) {
      return null;
    }
  }

  function getLivePointOnCurrentBoard(boardId, name) {
    const board = window.__boards && window.__boards[boardId];
    const pt = window.__points && window.__points[boardId] && window.__points[boardId][name];

    if (!board || !pt) return null;

    try {
      if (pt.board === board) return pt;
    } catch (e) {}

    return null;
  }

  function restorePointFromState(boardId, name, pointColor) {
    const board = window.__boards && window.__boards[boardId];
    const state = window.__pointStates && window.__pointStates[boardId] && window.__pointStates[boardId][name];

    if (!board || !state) return null;

    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (!pt) {
      pt = createPoint(board, boardId, name, state.x, state.y, pointColor);
      if (!pt) return null;
    }

    movePointTo(pt, state.x, state.y);

    try {
      pt.setAttribute({ fixed: !!state.fixed });
    } catch (e) {}

    applyPointVisual(pt, pointColor);
    stylePointLabel(pt);
    bindPointPersistence(boardId, name, pt);
    savePointState(boardId, name, pt);

    try { board.update(); } catch (e) {}
    return pt;
  }

  function randomStartPositions(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        x: Math.random(),
        y: Math.random()
      });
    }
    return out;
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function allPairDistancesOk(points, minDist) {
    if (!(minDist > 0)) return true;

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = distance(
          { x: Number(points[i].X()), y: Number(points[i].Y()) },
          { x: Number(points[j].X()), y: Number(points[j].Y()) }
        );

        if (!Number.isFinite(d) || d < minDist) {
          return false;
        }
      }
    }

    return true;
  }

  function normalizeExpr(expr) {
    expr = unquote(expr)
      .trim()
      .replace(/\u2212/g, '-')
      .replace(/\u00B7/g, '*')
      .replace(/\s+/g, ' ');

    expr = expr.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    expr = expr.replace(/(\d),(\d)/g, '$1.$2');
    expr = expr.replace(/\^/g, '**');
    expr = expr.replace(/\bln\s*\(/gi, 'log(');
    expr = expr.replace(/\bpi\b/g, 'PI');
    expr = expr.replace(/\be\b/g, 'E');

    const FN =
      '(?:sin|cos|tan|asin|acos|atan|sqrt|abs|log|exp|floor|ceil|round|min|max|pow)';

    expr = expr.replace(new RegExp('(\\d)\\s*(x|PI|E|\\()', 'gi'), '$1*$2');
    expr = expr.replace(new RegExp('(\\))\\s*(x|PI|E|\\()', 'gi'), '$1*$2');
    expr = expr.replace(new RegExp('(x|PI|E)\\s*(\\()', 'gi'), '$1*$2');
    expr = expr.replace(new RegExp('(\\d|x|\\)|PI|E)\\s*(' + FN + '\\s*\\()', 'gi'), '$1*$2');

    return expr.trim();
  }

  function buildGraphFunction(expr) {
    const src = normalizeExpr(expr);

    if (!src) {
      throw new Error('Empty expression');
    }

    if (/[^0-9A-Za-z_+\-*/().,\s]/.test(src)) {
      throw new Error('Disallowed characters in expression');
    }

    const ids = src.match(/[A-Za-z_]+/g) || [];
    const allowed = new Set([
      'x',
      'sin', 'cos', 'tan',
      'asin', 'acos', 'atan',
      'sqrt', 'abs', 'log', 'exp',
      'floor', 'ceil', 'round',
      'min', 'max', 'pow',
      'PI', 'E'
    ]);

    for (let i = 0; i < ids.length; i++) {
      if (!allowed.has(ids[i])) {
        throw new Error('Disallowed identifier: ' + ids[i]);
      }
    }

    return new Function(
      'x',
      `
      const {
        sin, cos, tan,
        asin, acos, atan,
        sqrt, abs, log, exp,
        floor, ceil, round,
        min, max, pow,
        PI, E
      } = Math;

      return (${src});
      `
    );
  }

  function safeBBox(board) {
    try {
      const bb = board.getBoundingBox();
      if (
        Array.isArray(bb) &&
        bb.length === 4 &&
        bb.every(function(v) { return Number.isFinite(v); }) &&
        bb[2] > bb[0] &&
        bb[1] > bb[3]
      ) {
        return bb.slice();
      }
    } catch (e) {}

    return [-5, 5, 5, -5];
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

  function createFunctionLabel(board, fn, graphName, graphColor) {
    const labelText = texName(graphName);
    const gCol = String(graphColor || '#b41f65').trim() || '#b41f65';

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

    const text = board.create('text', [
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
      strokeColor: gCol,
      fillColor: gCol,
      fontSize: 24,
      anchorX: 'left',
      anchorY: 'top'
    });

    return {
      anchor: anchor,
      text: text
    };
  }

  function getLiveGraphEntryOnCurrentBoard(boardId, graphKey) {
    const board = window.__boards && window.__boards[boardId];
    const entry = window.__pointGraphs && window.__pointGraphs[boardId] && window.__pointGraphs[boardId][graphKey];

    if (!board || !entry || !entry.graph) return null;

    try {
      if (entry.graph.board === board) return entry;
    } catch (e) {}

    return null;
  }

  function removeGraphEntry(entry) {
    if (!entry) return;

    try {
      if (entry.graph && entry.graph.board) entry.graph.board.removeObject(entry.graph);
    } catch (e) {}

    try {
      if (entry.anchor && entry.anchor.board) entry.anchor.board.removeObject(entry.anchor);
    } catch (e) {}

    try {
      if (entry.text && entry.text.board) entry.text.board.removeObject(entry.text);
    } catch (e) {}
  }

  function createGraphFromSpec(spec) {
    const target = getTargetFromSpec(spec);
    const boardId = target.boardId;
    const expr = target.expr;
    const graphName = target.graphName || 'f';
    const graphColor = target.graphColor || '#b41f65';
    const board = window.__boards && window.__boards[boardId];
    const graphKey = getGraphKey(target);

    if (!board || !expr) return null;

    let f;
    try {
      f = buildGraphFunction(expr);
    } catch (e) {
      return null;
    }

    try {
      const graph = board.create('functiongraph', [
        function(x) {
          return f(x);
        }
      ], {
        strokeColor: graphColor,
        highlightStrokeColor: graphColor,
        strokeWidth: 3,
        fixed: true,
        withLabel: false,
        resolution: 3,
        vectorContent: 2,
        plotpoints: false
      });

      const labelPack = createFunctionLabel(board, f, graphName, graphColor);

      ensureBuckets(boardId);
      window.__pointGraphs[boardId][graphKey] = {
        graph: graph,
        anchor: labelPack.anchor,
        text: labelPack.text,
        name: graphName,
        color: graphColor,
        expr: expr
      };
      window.__pointGraphStates[boardId][graphKey] = {
        visible: true,
        name: graphName,
        color: graphColor
      };

      return window.__pointGraphs[boardId][graphKey];
    } catch (e) {
      return null;
    }
  }

  window.showGraphFromPointsOnGraphSpec = function(spec) {
    const target = getTargetFromSpec(spec);
    const boardId = target.boardId;
    const graphKey = getGraphKey(target);
    const graphColor = target.graphColor || '#b41f65';
    const board = window.__boards && window.__boards[boardId];

    if (!board || !target.expr) return false;

    ensureBuckets(boardId);

    let entry = getLiveGraphEntryOnCurrentBoard(boardId, graphKey);

    if (!entry) {
      entry = createGraphFromSpec(spec);
      if (!entry) return false;
    } else {
      try {
        if (entry.graph) {
          entry.graph.setAttribute({
            visible: true,
            strokeColor: graphColor,
            highlightStrokeColor: graphColor,
            strokeWidth: 3,
            fixed: true
          });
        }
      } catch (e) {}

      try {
        if (entry.text) {
          entry.text.setAttribute({
            strokeColor: graphColor,
            fillColor: graphColor,
            fontSize: 24
          });
        }
      } catch (e) {}

      window.__pointGraphStates[boardId][graphKey] = {
        visible: true,
        name: target.graphName,
        color: graphColor
      };
    }

    try { board.update(); } catch (e) {}
    return true;
  };

  // Legacy alias used in README macro

  window.restorePointsOnGraphVisualState = function(spec) {
    const target = getTargetFromSpec(spec);
    const boardId = target.boardId;
    const graphKey = getGraphKey(target);

    if (!boardId) return false;

    if (
      window.__pointGraphStates &&
      window.__pointGraphStates[boardId] &&
      window.__pointGraphStates[boardId][graphKey] &&
      window.__pointGraphStates[boardId][graphKey].visible
    ) {
      return window.showGraphFromPointsOnGraphSpec(spec);
    }

    return false;
  };

  // Legacy alias

  window.restorePointsOnGraphFromSpec = function(spec) {
    const target = getTargetFromSpec(spec);
    if (!target.boardId || !target.names.length) return [];

    const out = [];
    for (let i = 0; i < target.names.length; i++) {
      const pt = restorePointFromState(target.boardId, target.names[i], target.pointColor);
      if (pt) out.push(pt);
    }
    return out;
  };

  // Legacy alias

  window.getPointsOnGraphFromSpec = function(spec) {
    const target = getTargetFromSpec(spec);
    const out = [];

    for (let i = 0; i < target.names.length; i++) {
      const name = target.names[i];
      let pt = getLivePointOnCurrentBoard(target.boardId, name);
      if (!pt) pt = restorePointFromState(target.boardId, name, target.pointColor);
      if (pt) {
        applyPointVisual(pt, target.pointColor);
        out.push(pt);
      }
    }

    return out;
  };

  // Legacy alias

  window.ensurePointsOnGraphFromSpec = function(uid, spec) {
    if (isLocked(uid)) return false;

    const target = getTargetFromSpec(spec);
    const board = window.__boards && window.__boards[target.boardId];

    if (!board || !target.names.length) return false;
    ensureBuckets(target.boardId);

    const positions = randomStartPositions(target.count);

    for (let i = 0; i < target.names.length; i++) {
      const name = target.names[i];
      const pos = positions[i];

      let pt = getLivePointOnCurrentBoard(target.boardId, name);
      if (!pt) pt = restorePointFromState(target.boardId, name, target.pointColor);
      if (!pt) pt = createPoint(board, target.boardId, name, pos.x, pos.y, target.pointColor);
      if (!pt) continue;

      movePointTo(pt, pos.x, pos.y);

      try {
        pt.setAttribute({ fixed: false });
      } catch (e) {}

      applyPointVisual(pt, target.pointColor);
      stylePointLabel(pt);
      bindPointPersistence(target.boardId, name, pt);
      savePointState(target.boardId, name, pt);
    }

    try { board.update(); } catch (e) {}
    applyPointsOnGraphUi(uid);
    return true;
  };

  // Legacy alias

  window.checkPointsOnGraphFromSpec = function(uid, spec) {
    const target = getTargetFromSpec(spec);

    if (!target.boardId || !target.expr || !target.names.length) return false;

    let f;
    try {
      f = buildGraphFunction(target.expr);
    } catch (e) {
      return false;
    }

    const pts = [];

    for (let i = 0; i < target.names.length; i++) {
      const name = target.names[i];
      let pt = getLivePointOnCurrentBoard(target.boardId, name);
      if (!pt) pt = restorePointFromState(target.boardId, name, target.pointColor);
      if (!pt) return false;

      applyPointVisual(pt, target.pointColor);

      let x, y, fy;
      try {
        x = Number(pt.X());
        y = Number(pt.Y());
        fy = Number(f(x));
      } catch (e) {
        return false;
      }

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fy)) {
        return false;
      }

      if (Math.abs(y - fy) > target.eps) {
        return false;
      }

      pts.push(pt);
    }

    if (!allPairDistancesOk(pts, target.minDist)) {
      return false;
    }

    return true;
  };

  // Legacy alias

  window.finalizePointsOnGraphFromSpec = function(uid, spec) {
    const target = getTargetFromSpec(spec);
    const board = window.__boards && window.__boards[target.boardId];
    let any = false;

    for (let i = 0; i < target.names.length; i++) {
      const name = target.names[i];
      let pt = getLivePointOnCurrentBoard(target.boardId, name);
      if (!pt) pt = restorePointFromState(target.boardId, name, target.pointColor);
      if (!pt) continue;

      try {
        pt.setAttribute({ fixed: true });
      } catch (e) {}

      applyPointVisual(pt, target.pointColor);
      savePointState(target.boardId, name, pt);
      any = true;
    }

    const shown = window.showGraphFromPointsOnGraphSpec(spec);
    setLocked(uid, true);

    try { if (board) board.update(); } catch (e) {}

    return !!(any || shown);
  };

  // Legacy alias

  window.__checkPointsOnGraphFromSpec = function(uid, spec) {
    const ok = !!(
      typeof window.checkPointsOnGraphFromSpec === 'function' &&
      window.checkPointsOnGraphFromSpec(uid, spec)
    );

    if (ok && typeof window.finalizePointsOnGraphFromSpec === 'function') {
      window.finalizePointsOnGraphFromSpec(uid, spec);
    }

    return ok;
  };

  function findCheckButton(checkRoot) {
    return checkRoot.querySelector(
      'button.lia-btn, input.lia-btn, button, input[type="button"], input[type="submit"]'
    );
  }

  function findAllQuizButtons(checkRoot) {
    return Array.from(
      checkRoot.querySelectorAll(
        'button.lia-btn, input.lia-btn, button, input[type="button"], input[type="submit"]'
      )
    );
  }

  function ensureInnerSpan(btn) {
    let inner = btn.querySelector('.lia-btn-inner');
    if (inner) return inner;

    inner = document.createElement('span');
    inner.className = 'lia-btn-inner';

    while (btn.firstChild) {
      inner.appendChild(btn.firstChild);
    }
    btn.appendChild(inner);

    return inner;
  }

  function looksLikeResolveButton(checkRoot, targetBtn) {
    const buttons = findAllQuizButtons(checkRoot);
    const idx = buttons.indexOf(targetBtn);
    const text = String(targetBtn.textContent || targetBtn.value || '').trim().toLowerCase();

    if (idx >= 1) return true;
    if (/solution|show/.test(text)) return true;

    return false;
  }

  function applyLockedStateToButton(uid, btn) {
    const locked = isLocked(uid);

    btn.disabled = locked;
    btn.style.opacity = locked ? '0.55' : '';
    btn.style.cursor = locked ? 'not-allowed' : '';
    btn.style.pointerEvents = locked ? 'none' : '';
  }

  function applyPointsOnGraphUi(uid) {
    const uiRoot = document.getElementById('multi-graph-ui-' + uid);
    const taskRoot = document.getElementById('multi-graph-task-' + uid);
    const checkRoot = document.getElementById('multi-graph-check-' + uid);
    const btn = document.getElementById('multi-graph-btn-' + uid);

    if (!uiRoot || !taskRoot || !checkRoot || !btn) return false;

    const spec = uiRoot.dataset.spec || '';

    uiRoot.style.display = 'inline-flex';
    uiRoot.style.alignItems = 'flex-start';
    uiRoot.style.gap = '.6rem';
    uiRoot.style.flexWrap = 'nowrap';

    taskRoot.style.display = 'inline-flex';
    taskRoot.style.alignItems = 'flex-start';
    taskRoot.style.alignSelf = 'flex-start';
    taskRoot.style.margin = '0';
    taskRoot.style.padding = '0';

    checkRoot.style.display = 'inline-flex';
    checkRoot.style.alignItems = 'flex-start';
    checkRoot.style.alignSelf = 'flex-start';
    checkRoot.style.margin = '0';
    checkRoot.style.padding = '0';

    Array.from(checkRoot.children).forEach(function(el: Element) { const hel = el as HTMLElement;
      try { hel.style.margin = '0'; } catch (e) {}
    });

    const c = (window.__pointNeutralColor ? window.__pointNeutralColor() : '#000');
    btn.style.color = c;

    const checkBtn = findCheckButton(checkRoot);
    if (!checkBtn) {
      applyLockedStateToButton(uid, btn);

      if (typeof window.restorePointsOnGraphFromSpec === 'function') {
        window.restorePointsOnGraphFromSpec(spec);
      }
      if (typeof window.restorePointsOnGraphVisualState === 'function') {
        window.restorePointsOnGraphVisualState(spec);
      }
      return true;
    }

    const cs = window.getComputedStyle(checkBtn);
    const h = checkBtn.offsetHeight;
    const inner = ensureInnerSpan(btn);

    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'stretch';
    btn.style.justifyContent = 'center';
    btn.style.verticalAlign = 'top';
    btn.style.boxSizing = 'border-box';
    btn.style.margin = '0';
    btn.style.textAlign = 'center';

    if (h > 0) {
      btn.style.height = h + 'px';
      btn.style.minHeight = h + 'px';
    }

    btn.style.paddingTop = '0';
    btn.style.paddingBottom = '0';
    btn.style.paddingLeft = '0';
    btn.style.paddingRight = '0';

    btn.style.fontSize = cs.fontSize;
    btn.style.fontFamily = cs.fontFamily;
    btn.style.fontWeight = cs.fontWeight;
    btn.style.lineHeight = 'normal';

    inner.style.display = 'inline-flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.boxSizing = 'border-box';
    inner.style.height = '100%';
    inner.style.paddingTop = '0';
    inner.style.paddingBottom = '0';
    inner.style.paddingLeft = cs.paddingLeft;
    inner.style.paddingRight = cs.paddingRight;
    inner.style.lineHeight = '1';
    inner.style.transform = 'translateY(0px)';
    inner.style.whiteSpace = 'nowrap';

    applyLockedStateToButton(uid, btn);

    if (typeof window.restorePointsOnGraphFromSpec === 'function') {
      window.restorePointsOnGraphFromSpec(spec);
    }

    if (typeof window.restorePointsOnGraphVisualState === 'function') {
      window.restorePointsOnGraphVisualState(spec);
    }

    return true;
  }

  window.renderPointsOnGraphFromSpec = function(uid, spec) {
    const uiRoot = document.getElementById('multi-graph-ui-' + uid);
    const taskRoot = document.getElementById('multi-graph-task-' + uid);
    const checkRoot = document.getElementById('multi-graph-check-' + uid);

    if (!uiRoot || !taskRoot || !checkRoot) return false;

    uiRoot.dataset.spec = spec;

    let btn = document.getElementById('multi-graph-btn-' + uid);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'multi-graph-btn-' + uid;
      btn.className = 'lia-btn';
      btn.type = 'button';
      btn.textContent = 'Place points';
      taskRoot.appendChild(btn);
    }

    if (!btn.__liaMultiGraphEnsureBound) {
      btn.__liaMultiGraphEnsureBound = true;
      btn.addEventListener('click', function() {
        const curSpec = uiRoot.dataset.spec || '';
        if (typeof window.ensurePointsOnGraphFromSpec === 'function') {
          window.ensurePointsOnGraphFromSpec(uid, curSpec);
        }
      });
    }

    btn.dataset.spec = spec;

    applyPointsOnGraphUi(uid);

    if (!checkRoot.__liaMultiGraphUiObserved) {
      checkRoot.__liaMultiGraphUiObserved = true;

      try {
        checkRoot.addEventListener('click', function(e) {
          const targetBtn = (e.target as HTMLElement)?.closest('button, input[type="button"], input[type="submit"]') ?? null;

          if (!targetBtn || !checkRoot.contains(targetBtn)) return;
          if (!looksLikeResolveButton(checkRoot, targetBtn)) return;

          setTimeout(function() {
            const curSpec = uiRoot.dataset.spec || '';
            if (typeof window.finalizePointsOnGraphFromSpec === 'function') {
              window.finalizePointsOnGraphFromSpec(uid, curSpec);
            }
          }, 0);

          setTimeout(function() {
            const curSpec = uiRoot.dataset.spec || '';
            if (typeof window.finalizePointsOnGraphFromSpec === 'function') {
              window.finalizePointsOnGraphFromSpec(uid, curSpec);
            }
          }, 80);
        });
      } catch (e) {}

      if (window.__registerLiaThemeListener) {
        window.__registerLiaThemeListener(function() {
          applyPointsOnGraphUi(uid);
        });
      }
    }

    setTimeout(function() {
      if (typeof window.restorePointsOnGraphFromSpec === 'function') {
        window.restorePointsOnGraphFromSpec(spec);
      }
      if (typeof window.restorePointsOnGraphVisualState === 'function') {
        window.restorePointsOnGraphVisualState(spec);
      }
      applyPointsOnGraphUi(uid);
    }, 0);

    setTimeout(function() {
      if (typeof window.restorePointsOnGraphFromSpec === 'function') {
        window.restorePointsOnGraphFromSpec(spec);
      }
      if (typeof window.restorePointsOnGraphVisualState === 'function') {
        window.restorePointsOnGraphVisualState(spec);
      }
      applyPointsOnGraphUi(uid);
    }, 120);

    return true;
  };

  window.__bootstrapPointsOnGraph = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="multi-graph-ui-"][data-spec]');

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^multi-graph-ui-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;

      window.renderPointsOnGraphFromSpec(uid, spec);
    });

    refreshAllPointLabels();
  };

  if (!window.__scheduleBootstrapPointsOnGraph) {
    window.__scheduleBootstrapPointsOnGraph = function() {
      if (window.__bootstrapPointsOnGraphRAF) return;
      window.__bootstrapPointsOnGraphRAF = requestAnimationFrame(function() {
        window.__bootstrapPointsOnGraphRAF = 0;
        try {
          if (window.__bootstrapPointsOnGraph) window.__bootstrapPointsOnGraph();
        } catch (e) {}
      });
    };
  }

  try {
    const mo = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type !== 'childList') continue;

        const added = Array.from(m.addedNodes || []);
        for (let j = 0; j < added.length; j++) {
          const n = added[j] as HTMLElement;
          if (!n || n.nodeType !== 1) continue;

          if (
            (n.id && /^multi-graph-ui-/.test(n.id)) ||
            (n.querySelector && n.querySelector('[id^="multi-graph-ui-"][data-spec]'))
          ) {
            needsBootstrap = true;
            break;
          }
        }

        if (needsBootstrap) break;
      }

      if (needsBootstrap && window.__scheduleBootstrapPointsOnGraph) {
        window.__scheduleBootstrapPointsOnGraph();
      }
    });

    const root = document.body || document.documentElement;
    if (root) {
      mo.observe(root, {
        childList: true,
        subtree: true
      });
    }
  } catch (e) {}

  try {
    window.addEventListener('hashchange', function() {
      if (window.__scheduleBootstrapPointsOnGraph) window.__scheduleBootstrapPointsOnGraph();
    }, true);
  } catch (e) {}

  try {
    window.addEventListener('pageshow', function() {
      if (window.__scheduleBootstrapPointsOnGraph) window.__scheduleBootstrapPointsOnGraph();
    }, true);
  } catch (e) {}

  try {
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && window.__scheduleBootstrapPointsOnGraph) {
        window.__scheduleBootstrapPointsOnGraph();
      }
    }, true);
  } catch (e) {}

  window.__registerLiaThemeListener(refreshAllPointLabels);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapPointsOnGraph) window.__scheduleBootstrapPointsOnGraph();
  });
}
