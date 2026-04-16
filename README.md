<!--
author:   MINT-the-GAP
version:  0.0.1
language: de
edit: true
narrator: Deutsch Female
comment:  Interactive coordinate system plugin for LiaScript, powered by JSXGraph. Provides macros for coordinate planes, points, function plots, and value tables.

import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   ./dist/index.js

@Koordinatensystem: @Koordinatensystem_(@0)

@Koordinatensystem_
``` javascript @JSX.Graph
(function () {
  JXG.Options.text.useMathJax = true;

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

  function toNum(v, fallback) {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  function parseSpec(spec) {
    const raw = unquote(String(spec || '').trim());
    const obj = {};

    splitTopLevel(raw).forEach(part => {
      const eq = part.indexOf('=');
      if (eq < 0) return;

      const key = part.slice(0, eq).trim().toLowerCase();
      const val = unquote(part.slice(eq + 1).trim());
      obj[key] = val;
    });

    const cfg = {
      xmin:  toNum(obj.xmin, -4),
      xmax:  toNum(obj.xmax,  4),
      ymin:  toNum(obj.ymin, -3),
      ymax:  toNum(obj.ymax,  3),
      width: toNum(obj.width, NaN),
      id:    obj.id != null ? obj.id : 'A1'
    };

    if (!(cfg.xmax > cfg.xmin)) cfg.xmax = cfg.xmin + 1;
    if (!(cfg.ymax > cfg.ymin)) cfg.ymax = cfg.ymin + 1;
    if (!Number.isFinite(cfg.width) || cfg.width <= 0) cfg.width = null;

    return cfg;
  }

  const cfg = parseSpec(String.raw`@0`);

  const XMIN0 = cfg.xmin;
  const XMAX0 = cfg.xmax;
  const YMIN0 = cfg.ymin;
  const YMAX0 = cfg.ymax;
  const INITIAL_WIDTH = cfg.width;

  const INITIAL_BBOX = [XMIN0, YMAX0, XMAX0, YMIN0];
  const INITIAL_XSPAN = XMAX0 - XMIN0;
  const INITIAL_YSPAN = YMAX0 - YMIN0;
  const INITIAL_RATIO = INITIAL_YSPAN / INITIAL_XSPAN;

  let manualWidth = null;
  let manualHeight = null;

  function getBoardStateStore() {
    window.__coordBoardStates = window.__coordBoardStates || {};
    return window.__coordBoardStates;
  }

  function isValidBBox(bb) {
    return Array.isArray(bb) &&
      bb.length === 4 &&
      bb.every(v => Number.isFinite(v)) &&
      bb[2] > bb[0] &&
      bb[1] > bb[3];
  }

  function loadStoredBoardState(id) {
    const store = getBoardStateStore();
    const st = store[id];
    if (!st) return null;

    const width = Math.round(st.width);
    const height = Math.round(st.height);
    const bbox = Array.isArray(st.bbox) ? st.bbox.slice() : null;

    if (!(width > 0) || !(height > 0) || !isValidBBox(bbox)) return null;

    return { width, height, bbox };
  }

  function getSafeBBox(board) {
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

    return INITIAL_BBOX.slice();
  }

  function saveBoardState(board) {
    if (!board || !board.containerObj) return;
    if (board.__restoreLockUntil && Date.now() < board.__restoreLockUntil) return;

    const bbox = getSafeBBox(board);
    const width = Math.round(board.containerObj.clientWidth || 0);
    const height = Math.round(board.containerObj.clientHeight || 0);

    if (!(width > 0) || !(height > 0) || !isValidBBox(bbox)) return;

    getBoardStateStore()[cfg.id] = {
      width: width,
      height: height,
      bbox: bbox.slice()
    };
  }

  function isDarkTheme() {
    try {
      const doc = (window.parent && window.parent.document) ? window.parent.document : document;
      const win = (window.parent && window.parent.getComputedStyle) ? window.parent : window;
      const el  = doc.body || doc.documentElement;
      const bg  = win.getComputedStyle(el).backgroundColor;
      const m   = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return false;

      const r = parseInt(m[1], 10);
      const g = parseInt(m[2], 10);
      const b = parseInt(m[3], 10);

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum < 128;
    } catch (e) {
      return false;
    }
  }

  function neutralColor() {
    return isDarkTheme() ? '#fff' : '#000';
  }

  function getGridColor(fallback = '#0b5fff') {
    try {
      const doc = (window.parent && window.parent.document) ? window.parent.document : document;
      const win = (window.parent && window.parent.getComputedStyle) ? window.parent : window;

      const btn = doc.querySelector('.lia-btn');
      if (btn) {
        const cs = win.getComputedStyle(btn);

        const bg = cs.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;

        const br = cs.borderTopColor;
        if (br && br !== 'rgba(0, 0, 0, 0)') return br;

        if (cs.color) return cs.color;
      }
    } catch (e) {}

    return fallback;
  }

  function callIfFunction(fn) {
    if (typeof fn !== 'function') return;
    try { fn(); } catch (e) {}
  }

  function runExternalBootstraps() {
    callIfFunction(window.__bootstrapAxisTitles);
    callIfFunction(window.__bootstrapPlotFunctions);
    callIfFunction(window.__bootstrapPlotInputs);
    callIfFunction(window.__bootstrapErzeugePunkte);
    callIfFunction(window.__bootstrapKoordPunkte);
    callIfFunction(window.__bootstrapPunktGraphs);
  }

  function applyBoardFrame(board) {
    if (!board || !board.containerObj) return;

    board.containerObj.style.border = '2px solid ' + neutralColor();
    board.containerObj.style.borderRadius = '8px';
    board.containerObj.style.boxSizing = 'border-box';
    board.containerObj.style.background = 'transparent';
    board.containerObj.style.position = 'relative';
    board.containerObj.style.display = 'block';
    board.containerObj.style.marginLeft = '0';
    board.containerObj.style.marginRight = 'auto';
    board.containerObj.style.touchAction = 'none';
  }

  function applyNavColors(board) {
    if (!board || !board.containerObj) return;

    const nav = board.containerObj.querySelector('.JXG_navigation');
    if (!nav) return;

    const col  = neutralColor();
    const dark = isDarkTheme();

    nav.style.color = col;
    nav.style.background = 'transparent';

    nav.querySelectorAll('a, button, span').forEach(el => {
      el.style.color = col;
      el.style.borderColor = col;
      el.style.background = 'transparent';
      el.style.boxShadow = 'none';
    });

    nav.querySelectorAll('svg, svg *').forEach(el => {
      el.style.fill = col;
      el.style.stroke = col;
    });

    nav.querySelectorAll('img').forEach(img => {
      img.style.filter = dark ? 'invert(1)' : 'none';
    });
  }

  function applyGridColor(board, color) {
    if (!board || !color) return;

    try {
      if (board.options && board.options.grid) {
        if (board.options.grid.major) board.options.grid.major.strokeColor = color;
        if (board.options.grid.minor) board.options.grid.minor.strokeColor = color;
      }
    } catch (e) {}

    try {
      if (board.grids && board.grids.length) {
        board.grids.forEach(g => {
          if (g && typeof g.setAttribute === 'function') {
            g.setAttribute({ strokeColor: color });
          }
        });
      }
    } catch (e) {}

    try {
      if (board.objectsList && board.objectsList.length) {
        board.objectsList.forEach(o => {
          if (!o || typeof o.setAttribute !== 'function') return;
          if (o.elType === 'grid' || (typeof JXG !== 'undefined' && o.type === JXG.OBJECT_TYPE_GRID)) {
            o.setAttribute({ strokeColor: color });
          }
        });
      }
    } catch (e) {}
  }

  function applyAxisColors(board) {
    if (!board || !board.defaultAxes) return;

    const col = neutralColor();

    ['x', 'y'].forEach(axisKey => {
      const ax = board.defaultAxes[axisKey];
      if (!ax) return;

      try {
        ax.setAttribute({
          strokeColor: col,
          highlightStrokeColor: col
        });
      } catch (e) {}

      try {
        if (ax.defaultTicks) {
          ax.defaultTicks.setAttribute({
            strokeColor: col,
            highlightStrokeColor: col,
            label: {
              strokeColor: col,
              fillColor: col
            }
          });
        }
      } catch (e) {}
    });

    try {
      if (typeof board.fullUpdate === 'function') board.fullUpdate();
      else board.update();
    } catch (e) {}
  }

  function getConstrainedAncestorWidth(el) {
    function usableWidth(node) {
      if (!node) return 0;

      try {
        const cs = window.getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;

        const w = Math.round(node.getBoundingClientRect().width || 0);
        return w > 250 ? w : 0;
      } catch (e) {
        return 0;
      }
    }

    if (el) {
      const oldWidth = el.style.width;
      const oldMaxWidth = el.style.maxWidth;
      const oldMinWidth = el.style.minWidth;
      const oldBoxSizing = el.style.boxSizing;

      try {
        el.style.width = '100%';
        el.style.maxWidth = 'none';
        el.style.minWidth = '0';
        el.style.boxSizing = 'border-box';

        const measured = usableWidth(el);
        if (measured) return measured;
      } catch (e) {
      } finally {
        el.style.width = oldWidth;
        el.style.maxWidth = oldMaxWidth;
        el.style.minWidth = oldMinWidth;
        el.style.boxSizing = oldBoxSizing;
      }
    }

    let cur = el ? el.parentElement : null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const w = usableWidth(cur);
      if (w) return w;
      cur = cur.parentElement;
    }

    try {
      const fallback =
        document.querySelector('.reveal .slides section.present') ||
        document.querySelector('.lia-slide') ||
        document.querySelector('.lia-content') ||
        document.querySelector('main') ||
        document.querySelector('article');

      const w = usableWidth(fallback);
      if (w) return w;
    } catch (e) {}

    return 900;
  }

  function maxBoardWidth(board) {
    return getConstrainedAncestorWidth(board.containerObj);
  }

  function maxBoardHeight() {
    return Math.min(Math.round(window.innerHeight * 0.82), 900);
  }

  function clampWidth(board, w) {
    return Math.max(260, Math.min(maxBoardWidth(board), w));
  }

  function clampHeight(h) {
    return Math.max(220, Math.min(maxBoardHeight(), h));
  }

  function roundPx(v) {
    return Math.max(1, Math.round(v));
  }

  function solveAspectFittedSize(board, preferredWidth, ratio) {
    const minW = 260;
    const minH = 220;
    const maxW = maxBoardWidth(board);
    const maxH = maxBoardHeight();

    const safeRatio = Math.max(1e-9, ratio);

    const lowerW = Math.max(minW, minH / safeRatio);
    const upperW = Math.min(maxW, maxH / safeRatio);

    let width;

    if (upperW >= lowerW) {
      width = Math.min(preferredWidth, upperW);
      if (width < lowerW) width = lowerW;
    } else {
      width = Math.min(preferredWidth, maxW, maxH / safeRatio);
      if (!(width > 0)) width = Math.min(maxW, preferredWidth, 600);
      width = Math.max(1, width);
    }

    const height = width * safeRatio;

    return {
      width: roundPx(width),
      height: roundPx(height)
    };
  }

  function computeResizeBBox(width, height, anchorBBox) {
    const bb = (Array.isArray(anchorBBox) && anchorBBox.length === 4)
      ? anchorBBox
      : INITIAL_BBOX;

    const xmin  = bb[0];
    const ymax  = bb[1];
    const xspan = bb[2] - bb[0];
    const yspan = xspan * (height / width);

    return [xmin, ymax, xmin + xspan, ymax - yspan];
  }

  function applyBoardSize(board, desiredWidth, desiredHeight, useInitialBBox, anchorBBox) {
    if (!board || !board.containerObj) return null;

    const width  = clampWidth(board, desiredWidth);
    const height = clampHeight(desiredHeight);

    const basisBBox = useInitialBBox
      ? INITIAL_BBOX.slice()
      : getSafeBBox(board);

    const resizeAnchorBBox = useInitialBBox
      ? INITIAL_BBOX.slice()
      : (
          Array.isArray(anchorBBox) && anchorBBox.length === 4
            ? anchorBBox.slice()
            : basisBBox.slice()
        );

    board.containerObj.style.width = width + 'px';
    board.containerObj.style.height = height + 'px';

    try {
      board.resizeContainer(width, height, false, true);
    } catch (e) {}

    const bb = useInitialBBox
      ? INITIAL_BBOX.slice()
      : computeResizeBBox(width, height, resizeAnchorBBox);

    try {
      board.setBoundingBox(bb, true);
    } catch (e) {}

    try {
      board.update();
    } catch (e) {}

    saveBoardState(board);
    return { width, height };
  }

  function fitBoardSize(board) {
    if (!board || !board.containerObj) return;

    const autoMode = (manualWidth == null || manualHeight == null);

    if (autoMode) {
      const autoWidth = getConstrainedAncestorWidth(board.containerObj.parentElement);
      const preferredWidth = INITIAL_WIDTH != null ? INITIAL_WIDTH : autoWidth;
      const size = solveAspectFittedSize(board, preferredWidth, INITIAL_RATIO);
      applyBoardSize(board, size.width, size.height, true, INITIAL_BBOX);
      return;
    }

    applyBoardSize(board, manualWidth, manualHeight, false, getSafeBBox(board));
  }

  function restoreSavedBoardState(board) {
    if (!board || !board.containerObj) return false;

    const st = loadStoredBoardState(cfg.id);
    if (!st) return false;

    manualWidth = st.width;
    manualHeight = st.height;

    const width = clampWidth(board, st.width);
    const height = clampHeight(st.height);

    board.__restoreLockUntil = Date.now() + 500;

    board.containerObj.style.width = width + 'px';
    board.containerObj.style.height = height + 'px';

    try {
      board.resizeContainer(width, height, false, true);
    } catch (e) {}

    try {
      board.setBoundingBox(st.bbox.slice(), true);
    } catch (e) {}

    try {
      board.update();
    } catch (e) {}

    return true;
  }

  const PRESET_STATE = loadStoredBoardState(cfg.id);
  const START_BBOX = PRESET_STATE ? PRESET_STATE.bbox.slice() : INITIAL_BBOX.slice();

  if (PRESET_STATE) {
    manualWidth = PRESET_STATE.width;
    manualHeight = PRESET_STATE.height;

    try {
      jxgbox.style.width = Math.round(PRESET_STATE.width) + 'px';
      jxgbox.style.height = Math.round(PRESET_STATE.height) + 'px';
    } catch (e) {}
  }

  try {
    jxgbox.style.visibility = 'hidden';
  } catch (e) {}

  function styleResizeHandle(handle) {
    const col = neutralColor();

    handle.style.position = 'absolute';
    handle.style.right = '0';
    handle.style.bottom = '0';
    handle.style.left = 'auto';
    handle.style.width = '22px';
    handle.style.height = '22px';
    handle.style.cursor = 'nwse-resize';
    handle.style.zIndex = '50';
    handle.style.touchAction = 'none';
    handle.style.userSelect = 'none';
    handle.style.background = 'transparent';
    handle.style.borderRight = '2px solid ' + col;
    handle.style.borderBottom = '2px solid ' + col;
    handle.style.borderLeft = '0';
    handle.style.borderTop = '0';
    handle.style.borderBottomRightRadius = '8px';
    handle.style.borderBottomLeftRadius = '0';
    handle.style.boxSizing = 'border-box';
  }

  function ensureResizeHandle(board) {
    if (!board || !board.containerObj) return;

    let handle = board.containerObj.querySelector('.lia-jxg-resize-handle');
    if (!handle) {
      handle = document.createElement('div');
      handle.className = 'lia-jxg-resize-handle';
      board.containerObj.appendChild(handle);
    }

    styleResizeHandle(handle);

    if (handle.__bound) return;
    handle.__bound = true;

    let drag = null;

    function stopDrag() {
      drag = null;
      try { document.body.style.userSelect = ''; } catch (e) {}
    }

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW: board.containerObj.clientWidth,
        startH: board.containerObj.clientHeight,
        anchorBBox: getSafeBBox(board)
      };

      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      try { document.body.style.userSelect = 'none'; } catch (err) {}
    });

    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      manualWidth  = clampWidth(board, drag.startW + dx);
      manualHeight = clampHeight(drag.startH + dy);

      applyBoardSize(board, manualWidth, manualHeight, false, drag.anchorBBox);
      applyBoardFrame(board);
      applyNavColors(board);
      applyGridColor(board, getGridColor('#0b5fff'));
      applyAxisColors(board);
      applyAdaptiveTicks(board);
      updateStickyTickLabelPositions(board);
      styleResizeHandle(handle);
      runExternalBootstraps();
    });

    window.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      stopDrag();
    });

    window.addEventListener('pointercancel', () => {
      stopDrag();
    });
  }

  function pxPerUnitX(board) {
    const bb = board.getBoundingBox();
    const w  = board.containerObj ? board.containerObj.clientWidth : 800;
    return w / Math.max(1e-9, (bb[2] - bb[0]));
  }

  function pxPerUnitY(board) {
    const bb = board.getBoundingBox();
    const h  = board.containerObj ? board.containerObj.clientHeight : 600;
    return h / Math.max(1e-9, (bb[1] - bb[3]));
  }

  function chooseDecadeStep(raw) {
    if (!isFinite(raw) || raw <= 0) return 1;

    const exp  = Math.floor(Math.log10(raw));
    const base = Math.pow(10, exp);
    const next = base * 10;

    return (raw / base < next / raw) ? base : next;
  }

  function chooseMinorTicks(pxPerMajor) {
    if (pxPerMajor >= 220) return 9;
    if (pxPerMajor >= 120) return 3;
    if (pxPerMajor >= 60)  return 1;
    return 0;
  }

  let lastAdaptiveSig = '';

  function applyAdaptiveTicks(board) {
    if (!board || !board.defaultAxes) return;

    const ppuX = pxPerUnitX(board);
    const ppuY = pxPerUnitY(board);

    const targetPx = 90;

    const rawStepX = targetPx / Math.max(1e-9, ppuX);
    const rawStepY = targetPx / Math.max(1e-9, ppuY);

    const majorStepX = chooseDecadeStep(rawStepX);
    const majorStepY = chooseDecadeStep(rawStepY);

    const pxPerMajorX = majorStepX * ppuX;
    const pxPerMajorY = majorStepY * ppuY;

    const minorX = chooseMinorTicks(pxPerMajorX);
    const minorY = chooseMinorTicks(pxPerMajorY);

    let font = 18;
    if (Math.min(pxPerMajorX, pxPerMajorY) < 90) font = 16;
    if (Math.min(pxPerMajorX, pxPerMajorY) < 55) font = 14;

    const sig = [majorStepX, majorStepY, minorX, minorY, font].join('|');
    if (sig === lastAdaptiveSig) return;
    lastAdaptiveSig = sig;

    try {
      board.defaultAxes.x.setAttribute({
        ticks: {
          insertTicks: false,
          ticksDistance: majorStepX,
          minorTicks: minorX,
          label: { fontSize: font }
        }
      });

      board.defaultAxes.y.setAttribute({
        ticks: {
          insertTicks: false,
          ticksDistance: majorStepY,
          minorTicks: minorY,
          label: { fontSize: font }
        }
      });
    } catch (e) {}

    try {
      if (board.defaultAxes.x.defaultTicks) {
        board.defaultAxes.x.defaultTicks.setAttribute({
          ticksDistance: majorStepX,
          minorTicks: minorX,
          label: { fontSize: font }
        });
      }

      if (board.defaultAxes.y.defaultTicks) {
        board.defaultAxes.y.defaultTicks.setAttribute({
          ticksDistance: majorStepY,
          minorTicks: minorY,
          label: { fontSize: font }
        });
      }
    } catch (e) {}

    try {
      if (typeof board.fullUpdate === 'function') board.fullUpdate();
      else board.update();
    } catch (e) {}
  }

  function buildStickyAxes(board, axisCol) {
    const xAxis = board.create('axis', [[0, 0], [1, 0]], {
      strokeColor: axisCol,
      highlightStrokeColor: axisCol,
      strokeWidth: 2.5,
      name: '',
      withLabel: false,
      fixed: true,
      position: 'sticky',
      anchor: 'left right',
      anchorDist: '24px',
      ticksAutoPos: false,
      ticks: {
        insertTicks: false,
        ticksDistance: 1,
        strokeWidth: 1.75,
        minorTicks: 1,
        drawLabels: true,
        label: {
          fontSize: 18,
          strokeColor: axisCol,
          fillColor: axisCol,
          anchorX: 'middle',
          anchorY: 'top',
          offset: [0, 10]
        }
      }
    });

    const yAxis = board.create('axis', [[0, 0], [0, 1]], {
      strokeColor: axisCol,
      highlightStrokeColor: axisCol,
      strokeWidth: 2.5,
      name: '',
      withLabel: false,
      fixed: true,
      position: 'sticky',
      anchor: 'left right',
      anchorDist: '24px',
      ticksAutoPos: false,
      ticks: {
        insertTicks: false,
        ticksDistance: 1,
        strokeWidth: 1.75,
        minorTicks: 1,
        drawLabels: true,
        label: {
          fontSize: 18,
          strokeColor: axisCol,
          fillColor: axisCol,
          anchorX: 'right',
          anchorY: 'middle',
          offset: [-10, 0]
        }
      }
    });

    board.defaultAxes = { x: xAxis, y: yAxis };
  }

  function updateStickyTickLabelPositions(board) {
    if (!board || !board.defaultAxes) return;

    const bb = getSafeBBox(board);
    const xmin = bb[0];
    const ymax = bb[1];
    const xmax = bb[2];
    const ymin = bb[3];

    const xAxis = board.defaultAxes.x;
    const yAxis = board.defaultAxes.y;

    let xLabel;
    if (0 > ymax) {
      xLabel = {
        anchorX: 'middle',
        anchorY: 'top',
        offset: [0, -5]
      };
    } else if (0 < ymin) {
      xLabel = {
        anchorX: 'middle',
        anchorY: 'bottom',
        offset: [0, 5]
      };
    } else {
      xLabel = {
        anchorX: 'middle',
        anchorY: 'top',
        offset: [0, -5]
      };
    }

    let yLabel;
    if (0 < xmin) {
      yLabel = {
        anchorX: 'left',
        anchorY: 'middle',
        offset: [10, 0]
      };
    } else if (0 > xmax) {
      yLabel = {
        anchorX: 'right',
        anchorY: 'middle',
        offset: [-10, 0]
      };
    } else {
      yLabel = {
        anchorX: 'right',
        anchorY: 'middle',
        offset: [-10, 0]
      };
    }

    try {
      xAxis.setAttribute({
        ticks: { label: xLabel }
      });
    } catch (e) {}

    try {
      yAxis.setAttribute({
        ticks: { label: yLabel }
      });
    } catch (e) {}

    try {
      if (xAxis.defaultTicks) xAxis.defaultTicks.setAttribute({ label: xLabel });
      if (yAxis.defaultTicks) yAxis.defaultTicks.setAttribute({ label: yLabel });
    } catch (e) {}

    try {
      board.update();
    } catch (e) {}
  }

  const axisCol = neutralColor();
  const gridCol = getGridColor('#0b5fff');

  const board = JXG.JSXGraph.initBoard(jxgbox, {
    axis: false,
    showNavigation: true,
    showCopyright: false,
    boundingbox: START_BBOX,
    keepaspectratio: true,
    zoom: {
      enabled: true,
      wheel: true,
      needShift: false,
      factorX: 1.15,
      factorY: 1.15
    },
    pan: {
      enabled: true,
      needShift: false,
      needTwoFingers: false
    }
  });

  buildStickyAxes(board, axisCol);
  updateStickyTickLabelPositions(board);

  board.create('grid', [board.defaultAxes.x, board.defaultAxes.y], {
    majorStep: 'auto',
    minorElements: 'auto',
    includeBoundaries: true,
    forceSquare: true,
    major: {
      face: 'line',
      strokeColor: gridCol,
      strokeWidth: 0.5,
      dash: 0,
      drawZero: true
    },
    minor: {
      face: 'line',
      strokeColor: gridCol,
      strokeWidth: 1.5,
      dash: 1,
      drawZero: false
    }
  });

  window.__boards = window.__boards || {};
  window.__boards[cfg.id] = board;

  window.__liaCoordHooks = window.__liaCoordHooks || {};

  window.__liaCoordHooks[cfg.id] = function() {
    try { applyBoardFrame(board); } catch (e) {}
    try { applyNavColors(board); } catch (e) {}
    try { applyGridColor(board, getGridColor('#0b5fff')); } catch (e) {}
    try { applyAxisColors(board); } catch (e) {}
    try { applyAdaptiveTicks(board); } catch (e) {}
    try { updateStickyTickLabelPositions(board); } catch (e) {}
    try { ensureResizeHandle(board); } catch (e) {}
    runExternalBootstraps();
  };

  window.__liaRunCoordHooks = function() {
    const hooks = window.__liaCoordHooks || {};
    Object.keys(hooks).forEach(function(id) {
      try { hooks[id](); } catch (e) {}
    });
    runExternalBootstraps();
  };

  const hadSavedState = restoreSavedBoardState(board);
  if (!hadSavedState) {
    fitBoardSize(board);
  }

  function finalizeBoardAppearance() {
    applyBoardFrame(board);
    applyNavColors(board);
    applyGridColor(board, getGridColor('#0b5fff'));
    applyAxisColors(board);
    applyAdaptiveTicks(board);
    updateStickyTickLabelPositions(board);
    ensureResizeHandle(board);
    runExternalBootstraps();

    try {
      board.containerObj.style.visibility = 'visible';
    } catch (e) {}
  }

  if (hadSavedState) {
    let shown = false;

    const showBoard = () => {
      if (shown) return;
      shown = true;
      restoreSavedBoardState(board);
      finalizeBoardAppearance();
    };

    requestAnimationFrame(() => {
      restoreSavedBoardState(board);
      requestAnimationFrame(showBoard);
    });

    setTimeout(showBoard, 120);
  } else {
    finalizeBoardAppearance();
  }

  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      applyBoardFrame(board);
      applyNavColors(board);
      applyGridColor(board, getGridColor('#0b5fff'));
      applyAxisColors(board);
      applyAdaptiveTicks(board);
      updateStickyTickLabelPositions(board);
      ensureResizeHandle(board);
      runExternalBootstraps();
    };

    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (mq && typeof mq.addListener === 'function') mq.addListener(handler);
  } catch (e) {}

  let resizeRAF = 0;
  window.addEventListener('resize', () => {
    if (resizeRAF) return;

    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = 0;
      fitBoardSize(board);
      applyBoardFrame(board);
      applyNavColors(board);
      applyGridColor(board, getGridColor('#0b5fff'));
      applyAxisColors(board);
      applyAdaptiveTicks(board);
      updateStickyTickLabelPositions(board);
      ensureResizeHandle(board);
      runExternalBootstraps();
    });
  });

  let bboxRAF = 0;
  board.on('boundingbox', () => {
    if (bboxRAF) return;

    bboxRAF = requestAnimationFrame(() => {
      bboxRAF = 0;
      saveBoardState(board);
      applyAdaptiveTicks(board);
      applyAxisColors(board);
      updateStickyTickLabelPositions(board);
      ensureResizeHandle(board);
      runExternalBootstraps();
    });
  });

  let lastGridColor = '';
  setInterval(() => {
    const c = getGridColor('#0b5fff');
    if (!c || c === lastGridColor) return;
    lastGridColor = c;
    applyGridColor(board, c);
  }, 400);
})();
```
@end



















@AchsenBeschriftung: @AchsenBeschriftung_(@uid,@0)

@AchsenBeschriftung_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end









@ErzeugePunkt: @ErzeugePunkt_(@uid,@0,@1)

@ErzeugePunkt_
<div id="point-ui-@0" data-spec="@1">
  <div id="point-task-@0" class="lia-point-task"></div>

  <div id="point-check-@0">
    @2
    [[!]]
    <script modify="false">
      (() => {
        const root = document.getElementById('point-ui-@0');
        const spec = root ? (root.dataset.spec || '') : String.raw`@1`;

        if (typeof window.__checkPointFromSpec === 'function') {
          return window.__checkPointFromSpec(spec);
        }
        return false;
      })()
    </script>
  </div>
</div>

@end





@Punkt: @Punkt_(@uid,@0)

@Punkt_
<span id="punkt-spec-@0" data-spec="@1" style="display:none;"></span>
@end








@PlotFunktion: @PlotFunktion_(@uid,@0)

@PlotFunktion_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end







@PlotEingabeLatex: @PlotEingabeLatex_(@uid,@0)

@PlotEingabeLatex_
<div id="lia-plot-eingabe-@0" data-spec="@1"></div>
@end







@PunktGraph: @PunktGraph_(@uid,@0)

@PunktGraph_
<div id="graph-ui-@0">
  <div id="graph-task-@0" class="lia-graph-task"></div>

  <div id="graph-check-@0">
    [[!]]
    <script modify="false">
      (() => {
        const holder = document.getElementById('graph-spec-@0');
        const spec = holder ? String(holder.textContent || '') : String.raw`@1`;

        if (typeof window.__checkPointGraphFromSpec === 'function') {
          return window.__checkPointGraphFromSpec('@0', spec);
        }
        return false;
      })()
    </script>
  </div>
</div>

<span id="graph-spec-@0" style="display:none;">@1</span>

@end







@PunkteAufGraph: @PunkteAufGraph_(@uid,@0)

@PunkteAufGraph_
<div id="multi-graph-ui-@0" data-spec="@1">
  <div id="multi-graph-task-@0" class="lia-multi-graph-task"></div>

  <div id="multi-graph-check-@0">
    [[!]]
    <script modify="false">
      (() => {
        const root = document.getElementById('multi-graph-ui-@0');
        const spec = root ? (root.dataset.spec || '') : String.raw`@1`;
        const uid  = '@0';

        if (typeof window.__checkPunkteAufGraphFromSpec === 'function') {
          return window.__checkPunkteAufGraphFromSpec(uid, spec);
        }
        return false;
      })()
    </script>
  </div>
</div>

@end
















@TableCanvasItem: @TableCanvasItem_(@uid,@0,@1)

@TableCanvasItem_
<div class="lia-dyn-table-pool-item" data-table="@1" data-index="@2">
  @canvas
</div>
@end


@Tabelle: @Tabelle_(@uid,@0)

@Tabelle_
<div id="lia-table-@0" data-spec="@1"></div>

<div id="lia-table-pool-@0" class="lia-dyn-table-pool" aria-hidden="true">
  @TableCanvasItem(@0,0)
  @TableCanvasItem(@0,1)
  @TableCanvasItem(@0,2)
  @TableCanvasItem(@0,3)
  @TableCanvasItem(@0,4)
  @TableCanvasItem(@0,5)
  @TableCanvasItem(@0,6)
  @TableCanvasItem(@0,7)
  @TableCanvasItem(@0,8)
  @TableCanvasItem(@0,9)
  @TableCanvasItem(@0,10)
  @TableCanvasItem(@0,11)
  @TableCanvasItem(@0,12)
  @TableCanvasItem(@0,13)
  @TableCanvasItem(@0,14)
  @TableCanvasItem(@0,15)
  @TableCanvasItem(@0,16)
  @TableCanvasItem(@0,17)
  @TableCanvasItem(@0,18)
  @TableCanvasItem(@0,19)
  @TableCanvasItem(@0,20)
  @TableCanvasItem(@0,21)
  @TableCanvasItem(@0,22)
  @TableCanvasItem(@0,23)
  @TableCanvasItem(@0,24)
  @TableCanvasItem(@0,25)
  @TableCanvasItem(@0,26)
  @TableCanvasItem(@0,27)
  @TableCanvasItem(@0,28)
  @TableCanvasItem(@0,29)
  @TableCanvasItem(@0,30)
  @TableCanvasItem(@0,31)
  @TableCanvasItem(@0,32)
  @TableCanvasItem(@0,33)
  @TableCanvasItem(@0,34)
  @TableCanvasItem(@0,35)
  @TableCanvasItem(@0,36)
  @TableCanvasItem(@0,37)
  @TableCanvasItem(@0,38)
  @TableCanvasItem(@0,39)
  @TableCanvasItem(@0,40)
  @TableCanvasItem(@0,41)
  @TableCanvasItem(@0,42)
  @TableCanvasItem(@0,43)
  @TableCanvasItem(@0,44)
  @TableCanvasItem(@0,45)
  @TableCanvasItem(@0,46)
  @TableCanvasItem(@0,47)
  @TableCanvasItem(@0,48)
  @TableCanvasItem(@0,49)
  @TableCanvasItem(@0,50)
  @TableCanvasItem(@0,51)
  @TableCanvasItem(@0,52)
  @TableCanvasItem(@0,53)
  @TableCanvasItem(@0,54)
  @TableCanvasItem(@0,55)
  @TableCanvasItem(@0,56)
  @TableCanvasItem(@0,57)
  @TableCanvasItem(@0,58)
  @TableCanvasItem(@0,59)
</div>
@end





-->


# Coordinate System Plugin

          --{{0}}--
This plugin provides interactive coordinate systems for LiaScript courses, built on JSXGraph.
Place points, plot functions, draw graphs by hand, and connect value tables to coordinate planes.

__Try it on LiaScript:__
https://liascript.github.io/course/?https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.md

__See the project on GitHub:__
https://github.com/MINT-the-GAP/lia-coordinate

           {{1}}
1. Load the macros via

   `import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.md`

   or pin to a specific version:

   `import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/0.0.1/README.md`

2. Also requires JSXGraph (already included via the `import:` above):

   `import: https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md`

## `@Koordinatensystem`

          --{{0}}--
Renders an interactive JSXGraph coordinate plane. Supports panning, zooming, and a resize handle.

Parameters (semicolon-separated key=value pairs):
- `xmin`, `xmax`, `ymin`, `ymax` — axis bounds (defaults: -4, 4, -3, 3)
- `width` — initial width in pixels
- `id` — board identifier used to connect other macros to this board

``` markdown
@Koordinatensystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A1`)
```

---

@Koordinatensystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A1`)

## `@AchsenBeschriftung`

          --{{0}}--
Adds axis labels (supporting LaTeX math) to a coordinate board.
Place it directly after `@Koordinatensystem` with the same `id`.

Parameters: `id=<boardId>;xlabel=<label>;ylabel=<label>`

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_axis`)

@AchsenBeschriftung(`id=ex_axis;xlabel=$x$;ylabel=$y$`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_axis`)

@AchsenBeschriftung(`id=ex_axis;xlabel=$x$;ylabel=$y$`)

## `@ErzeugePunkt`

          --{{0}}--
Creates a draggable point exercise. The student drags a point to a target coordinate and checks their answer.
A "Create point" button appears — clicking it places the draggable point. The check button validates position within a tolerance of 0.05 units.

Parameters: `<boardId>;<pointName>;<targetX>;<targetY>`

The second argument must always be provided. Pass `` ` ` `` (a space) to use the default check button.

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_punkt_ez`)

@AchsenBeschriftung(`id=ex_punkt_ez;xlabel=$x$;ylabel=$y$`)

Drag point $A$ to the coordinates $(2 | 3)$.

@ErzeugePunkt(`ex_punkt_ez;A;2;3`,` `)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_punkt_ez`)

@AchsenBeschriftung(`id=ex_punkt_ez;xlabel=$x$;ylabel=$y$`)

Drag point $A$ to the coordinates $(2 | 3)$.

@ErzeugePunkt(`ex_punkt_ez;A;2;3`,` `)

## `@Punkt`

          --{{0}}--
Places a pre-defined point on the board. Add `fix` as a fifth parameter to make it immovable.
Useful for showing given points in a task without requiring student interaction.

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_punkt`)

@AchsenBeschriftung(`id=ex_punkt;xlabel=$x$;ylabel=$y$`)

@Punkt(`ex_punkt;A;2;3`)
@Punkt(`ex_punkt;B;-3;-1;fix`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_punkt`)

@AchsenBeschriftung(`id=ex_punkt;xlabel=$x$;ylabel=$y$`)

@Punkt(`ex_punkt;A;2;3`)
@Punkt(`ex_punkt;B;-3;-1;fix`)

## `@PlotFunktion`

          --{{0}}--
Plots a function curve on the board using a formula. The formula uses standard math syntax.

Parameters: `<boardId>;<funcName>;<formula>;<color>`

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_plot`)

@AchsenBeschriftung(`id=ex_plot;xlabel=$x$;ylabel=$f(x)$`)

@PlotFunktion(`ex_plot;f;0.5*x^2-2;#b41f65`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_plot`)

@AchsenBeschriftung(`id=ex_plot;xlabel=$x$;ylabel=$f(x)$`)

@PlotFunktion(`ex_plot;f;0.5*x^2-2;#b41f65`)

## `@PlotEingabeLatex`

          --{{0}}--
Renders a LaTeX input field where students can type a function and see it plotted live.

Parameters: `<boardId>;<funcName>;<color>`

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_eingabe`)

@AchsenBeschriftung(`id=ex_eingabe;xlabel=$x$;ylabel=$g(x)$`)

@PlotEingabeLatex(`ex_eingabe;g;#0055cc`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_eingabe`)

@AchsenBeschriftung(`id=ex_eingabe;xlabel=$x$;ylabel=$g(x)$`)

@PlotEingabeLatex(`ex_eingabe;g;#0055cc`)

## `@PunktGraph`

          --{{0}}--
Point-on-graph exercise: the student drags a point onto the graph of a given function.
The check validates whether the point lies on the curve within the given tolerance.

Parameters: `<boardId>;<pointName>;<funcName>;<formula>;<tolerance>`

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pg`)

@AchsenBeschriftung(`id=ex_pg;xlabel=$x$;ylabel=$f(x)$`)

Drag point $A$ onto the graph of $f(x) = 2x - 1$.

@PunktGraph(`ex_pg;A;f;2*x-1;0.05`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pg`)

@AchsenBeschriftung(`id=ex_pg;xlabel=$x$;ylabel=$f(x)$`)

Drag point $A$ onto the graph of $f(x) = 2x - 1$.

@PunktGraph(`ex_pg;A;f;2*x-1;0.05`)

## `@PunkteAufGraph`

          --{{0}}--
Multi-point-on-graph exercise: places several draggable points that must all land on the graph.

Parameters: `<boardId>;n=<count>;d=<step>;<pointName>;<funcName>;<formula>;<tolerance>`

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pag`)

@AchsenBeschriftung(`id=ex_pag;xlabel=$x$;ylabel=$f(x)$`)

Drag all 3 points onto the graph of $f(x) = x - 1$.

@PunkteAufGraph(`ex_pag;n=3;d=2;A;f;x-1;0.05`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pag`)

@AchsenBeschriftung(`id=ex_pag;xlabel=$x$;ylabel=$f(x)$`)

Drag all 3 points onto the graph of $f(x) = x - 1$.

@PunkteAufGraph(`ex_pag;n=3;d=2;A;f;x-1;0.05`)

## `@Tabelle`

          --{{0}}--
Renders a value table connected to a coordinate board. Students fill in x/y values and the corresponding points appear on the graph.

Parameters: `n=<startColumns>;x;<funcName>;<pointName>;id=<boardId>`

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_tab`)

@AchsenBeschriftung(`id=ex_tab;xlabel=$x$;ylabel=$f(x)$`)

@Tabelle(`n=3;x;f;P;id=ex_tab`)
```

---

@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_tab`)

@AchsenBeschriftung(`id=ex_tab;xlabel=$x$;ylabel=$f(x)$`)

@Tabelle(`n=3;x;f;P;id=ex_tab`)

## Implementation

          --{{0}}--
If you prefer not to use `import:`, copy the following block directly into the header of your LiaScript document.

``` markdown
import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   https://cdn.jsdelivr.net/gh/MINT-the-GAP/lia-coordinate@0.0.1/dist/index.js

@Koordinatensystem: @Koordinatensystem_(@0)

@Koordinatensystem_
` ` ` javascript @JSX.Graph
... (see README header for full definition)
` ` `
@end
```
