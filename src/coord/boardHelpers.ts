// Board helpers for the @CoordinateSystem macro.
// All logic that does NOT require a live JSXGraph board reference at definition time
// lives here and is exposed on window.__coord so the inline macro code can call it.
//
// The macro still owns: initBoard(), buildStickyAxes(), board.create('grid'), event binding.
// Everything else (parse, theme, sizing, styling, ticks, resize handle) lives here.

import { getNeutralColor, getAccentColor } from '../shared/theme';

// ---------------------------------------------------------------------------
// Board state persistence
// ---------------------------------------------------------------------------

export function getBoardStateStore(): Record<string, any> {
  window.__coordBoardStates = window.__coordBoardStates || {};
  return window.__coordBoardStates;
}

export function isValidBBox(bb: any): boolean {
  return Array.isArray(bb) &&
    bb.length === 4 &&
    bb.every((v: any) => Number.isFinite(v)) &&
    bb[2] > bb[0] &&
    bb[1] > bb[3];
}

export function loadStoredBoardState(id: string): { width: number; height: number; bbox: number[] } | null {
  const store = getBoardStateStore();
  const st = store[id];
  if (!st) return null;

  const width = Math.round(st.width);
  const height = Math.round(st.height);
  const bbox = Array.isArray(st.bbox) ? st.bbox.slice() : null;

  if (!(width > 0) || !(height > 0) || !isValidBBox(bbox)) return null;

  return { width, height, bbox };
}

export function saveBoardState(board: any, id: string, initialBBox: number[]): void {
  if (!board || !board.containerObj) return;
  if (board.__restoreLockUntil && Date.now() < board.__restoreLockUntil) return;

  const bbox = getSafeBBox(board, initialBBox);
  const width = Math.round(board.containerObj.clientWidth || 0);
  const height = Math.round(board.containerObj.clientHeight || 0);

  if (!(width > 0) || !(height > 0) || !isValidBBox(bbox)) return;

  getBoardStateStore()[id] = {
    width,
    height,
    bbox: bbox.slice()
  };
}

// ---------------------------------------------------------------------------
// Board geometry helpers
// ---------------------------------------------------------------------------

export function getSafeBBox(board: any, fallback: number[]): number[] {
  try {
    const bb = board.getBoundingBox();
    if (isValidBBox(bb)) return bb.slice();
  } catch (e) {}
  return fallback.slice();
}

export function getConstrainedAncestorWidth(el: HTMLElement | null): number {
  function usableWidth(node: HTMLElement | null): number {
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

  let cur: HTMLElement | null = el ? el.parentElement : null;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const w = usableWidth(cur);
    if (w) return w;
    cur = cur.parentElement;
  }

  try {
    const fallbackEl =
      document.querySelector<HTMLElement>('.reveal .slides section.present') ||
      document.querySelector<HTMLElement>('.lia-slide') ||
      document.querySelector<HTMLElement>('.lia-content') ||
      document.querySelector<HTMLElement>('main') ||
      document.querySelector<HTMLElement>('article');
    const w = usableWidth(fallbackEl);
    if (w) return w;
  } catch (e) {}

  return 900;
}

export function maxBoardHeight(): number {
  return Math.min(Math.round(window.innerHeight * 0.82), 900);
}

export function clampWidth(board: any, w: number): number {
  return Math.max(260, Math.min(getConstrainedAncestorWidth(board.containerObj), w));
}

export function clampHeight(h: number): number {
  return Math.max(220, Math.min(maxBoardHeight(), h));
}

function roundPx(v: number): number {
  return Math.max(1, Math.round(v));
}

export function solveAspectFittedSize(
  board: any,
  preferredWidth: number,
  ratio: number
): { width: number; height: number } {
  const minW = 260;
  const minH = 220;
  const maxW = getConstrainedAncestorWidth(board.containerObj);
  const maxH = maxBoardHeight();

  const safeRatio = Math.max(1e-9, ratio);

  const lowerW = Math.max(minW, minH / safeRatio);
  const upperW = Math.min(maxW, maxH / safeRatio);

  let width: number;

  if (upperW >= lowerW) {
    width = Math.min(preferredWidth, upperW);
    if (width < lowerW) width = lowerW;
  } else {
    width = Math.min(preferredWidth, maxW, maxH / safeRatio);
    if (!(width > 0)) width = Math.min(maxW, preferredWidth, 600);
    width = Math.max(1, width);
  }

  return {
    width: roundPx(width),
    height: roundPx(width * safeRatio)
  };
}

export function computeResizeBBox(width: number, height: number, anchorBBox: number[], initialBBox: number[]): number[] {
  const bb = isValidBBox(anchorBBox) ? anchorBBox : initialBBox;
  const xmin  = bb[0];
  const ymax  = bb[1];
  const xspan = bb[2] - bb[0];
  const yspan = xspan * (height / width);
  return [xmin, ymax, xmin + xspan, ymax - yspan];
}

export function applyBoardSize(
  board: any,
  desiredWidth: number,
  desiredHeight: number,
  useInitialBBox: boolean,
  anchorBBox: number[],
  initialBBox: number[],
  boardId: string
): { width: number; height: number } | null {
  if (!board || !board.containerObj) return null;

  const width  = clampWidth(board, desiredWidth);
  const height = clampHeight(desiredHeight);

  board.containerObj.style.width  = width + 'px';
  board.containerObj.style.height = height + 'px';

  try { board.resizeContainer(width, height, false, true); } catch (e) {}

  const bb = useInitialBBox
    ? initialBBox.slice()
    : computeResizeBBox(width, height, anchorBBox, initialBBox);

  try { board.setBoundingBox(bb, true); } catch (e) {}
  try { board.update(); } catch (e) {}

  saveBoardState(board, boardId, initialBBox);
  return { width, height };
}

// ---------------------------------------------------------------------------
// Board appearance
// ---------------------------------------------------------------------------

export function applyBoardFrame(board: any): void {
  if (!board || !board.containerObj) return;

  const col = getNeutralColor();
  board.containerObj.style.border = '2px solid ' + col;
  board.containerObj.style.borderRadius = '8px';
  board.containerObj.style.boxSizing = 'border-box';
  board.containerObj.style.background = 'transparent';
  board.containerObj.style.position = 'relative';
  board.containerObj.style.display = 'block';
  board.containerObj.style.marginLeft = '0';
  board.containerObj.style.marginRight = 'auto';
  board.containerObj.style.touchAction = 'none';
}

export function applyNavColors(board: any): void {
  if (!board || !board.containerObj) return;

  const nav = board.containerObj.querySelector('.JXG_navigation');
  if (!nav) return;

  const col  = getNeutralColor();
  const dark = col === '#fff';

  nav.style.color = col;
  nav.style.background = 'transparent';

  nav.querySelectorAll('a, button, span').forEach((el: HTMLElement) => {
    el.style.color = col;
    el.style.borderColor = col;
    el.style.background = 'transparent';
    el.style.boxShadow = 'none';
  });

  nav.querySelectorAll('svg, svg *').forEach((el: HTMLElement) => {
    (el as any).style.fill = col;
    (el as any).style.stroke = col;
  });

  nav.querySelectorAll('img').forEach((img: HTMLImageElement) => {
    img.style.filter = dark ? 'invert(1)' : 'none';
  });
}

export function applyGridColor(board: any, color: string): void {
  if (!board || !color) return;

  try {
    if (board.options && board.options.grid) {
      if (board.options.grid.major) board.options.grid.major.strokeColor = color;
      if (board.options.grid.minor) board.options.grid.minor.strokeColor = color;
    }
  } catch (e) {}

  try {
    if (board.grids && board.grids.length) {
      board.grids.forEach((g: any) => {
        if (g && typeof g.setAttribute === 'function') g.setAttribute({ strokeColor: color });
      });
    }
  } catch (e) {}

  try {
    if (board.objectsList && board.objectsList.length) {
      board.objectsList.forEach((o: any) => {
        if (!o || typeof o.setAttribute !== 'function') return;
        if (o.elType === 'grid' || (typeof JXG !== 'undefined' && o.type === JXG.OBJECT_TYPE_GRID)) {
          o.setAttribute({ strokeColor: color });
        }
      });
    }
  } catch (e) {}
}

export function applyAxisColors(board: any): void {
  if (!board || !board.defaultAxes) return;

  const col = getNeutralColor();

  ['x', 'y'].forEach((axisKey: string) => {
    const ax = board.defaultAxes[axisKey];
    if (!ax) return;

    try {
      ax.setAttribute({ strokeColor: col, highlightStrokeColor: col });
    } catch (e) {}

    try {
      if (ax.defaultTicks) {
        ax.defaultTicks.setAttribute({
          strokeColor: col,
          highlightStrokeColor: col,
          label: { strokeColor: col, fillColor: col }
        });
      }
    } catch (e) {}
  });

  try {
    if (typeof board.fullUpdate === 'function') board.fullUpdate();
    else board.update();
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Adaptive ticks
// ---------------------------------------------------------------------------

function pxPerUnitX(board: any): number {
  const bb = board.getBoundingBox();
  const w  = board.containerObj ? board.containerObj.clientWidth : 800;
  return w / Math.max(1e-9, (bb[2] - bb[0]));
}

function pxPerUnitY(board: any): number {
  const bb = board.getBoundingBox();
  const h  = board.containerObj ? board.containerObj.clientHeight : 600;
  return h / Math.max(1e-9, (bb[1] - bb[3]));
}

function chooseDecadeStep(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 1;
  const exp  = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const next = base * 10;
  return (raw / base < next / raw) ? base : next;
}

function chooseMinorTicks(pxPerMajor: number): number {
  if (pxPerMajor >= 220) return 9;
  if (pxPerMajor >= 120) return 3;
  if (pxPerMajor >= 60)  return 1;
  return 0;
}

// Per-board last-sig cache to avoid redundant setAttribute calls.
const adaptiveSigCache = new WeakMap<object, string>();

export function applyAdaptiveTicks(board: any): void {
  if (!board || !board.defaultAxes) return;

  const ppuX = pxPerUnitX(board);
  const ppuY = pxPerUnitY(board);
  const targetPx = 90;

  const majorStepX = chooseDecadeStep(targetPx / Math.max(1e-9, ppuX));
  const majorStepY = chooseDecadeStep(targetPx / Math.max(1e-9, ppuY));

  const minorX = chooseMinorTicks(majorStepX * ppuX);
  const minorY = chooseMinorTicks(majorStepY * ppuY);

  let font = 18;
  if (Math.min(majorStepX * ppuX, majorStepY * ppuY) < 90) font = 16;
  if (Math.min(majorStepX * ppuX, majorStepY * ppuY) < 55) font = 14;

  const sig = [majorStepX, majorStepY, minorX, minorY, font].join('|');
  if (adaptiveSigCache.get(board) === sig) return;
  adaptiveSigCache.set(board, sig);

  try {
    board.defaultAxes.x.setAttribute({ ticks: { insertTicks: false, ticksDistance: majorStepX, minorTicks: minorX, label: { fontSize: font } } });
    board.defaultAxes.y.setAttribute({ ticks: { insertTicks: false, ticksDistance: majorStepY, minorTicks: minorY, label: { fontSize: font } } });
  } catch (e) {}

  try {
    if (board.defaultAxes.x.defaultTicks) board.defaultAxes.x.defaultTicks.setAttribute({ ticksDistance: majorStepX, minorTicks: minorX, label: { fontSize: font } });
    if (board.defaultAxes.y.defaultTicks) board.defaultAxes.y.defaultTicks.setAttribute({ ticksDistance: majorStepY, minorTicks: minorY, label: { fontSize: font } });
  } catch (e) {}

  try {
    if (typeof board.fullUpdate === 'function') board.fullUpdate();
    else board.update();
  } catch (e) {}
}

export function updateStickyTickLabelPositions(board: any): void {
  if (!board || !board.defaultAxes) return;

  let bb: number[];
  try { bb = board.getBoundingBox(); } catch (e) { return; }
  if (!isValidBBox(bb)) return;

  const [xmin, ymax, xmax, ymin] = bb;
  const xAxis = board.defaultAxes.x;
  const yAxis = board.defaultAxes.y;

  const xLabel = (0 < ymin)
    ? { anchorX: 'middle', anchorY: 'bottom', offset: [0, 5] }
    : { anchorX: 'middle', anchorY: 'top',    offset: [0, -5] };

  const yLabel = (0 < xmin)
    ? { anchorX: 'left',  anchorY: 'middle', offset: [10, 0] }
    : { anchorX: 'right', anchorY: 'middle', offset: [-10, 0] };

  try { xAxis.setAttribute({ ticks: { label: xLabel } }); } catch (e) {}
  try { yAxis.setAttribute({ ticks: { label: yLabel } }); } catch (e) {}
  try { if (xAxis.defaultTicks) xAxis.defaultTicks.setAttribute({ label: xLabel }); } catch (e) {}
  try { if (yAxis.defaultTicks) yAxis.defaultTicks.setAttribute({ label: yLabel }); } catch (e) {}
  try { board.update(); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Resize handle
// ---------------------------------------------------------------------------

function styleResizeHandle(handle: HTMLElement, neutralCol: string): void {
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
  handle.style.borderRight = '2px solid ' + neutralCol;
  handle.style.borderBottom = '2px solid ' + neutralCol;
  handle.style.borderLeft = '0';
  handle.style.borderTop = '0';
  handle.style.borderBottomRightRadius = '8px';
  handle.style.borderBottomLeftRadius = '0';
  handle.style.boxSizing = 'border-box';
}

// Per-board resize state stored in a WeakMap instead of element properties.
const resizeDragState = new WeakMap<HTMLElement, {
  pointerId: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  anchorBBox: number[];
} | null>();

export function ensureResizeHandle(
  board: any,
  initialBBox: number[],
  boardId: string,
  onResize: () => void
): void {
  if (!board || !board.containerObj) return;

  let handle = board.containerObj.querySelector('.lia-jxg-resize-handle') as HTMLElement | null;
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'lia-jxg-resize-handle';
    board.containerObj.appendChild(handle);
  }

  const col = getNeutralColor();
  styleResizeHandle(handle, col);

  if (resizeDragState.has(handle)) return; // already bound
  resizeDragState.set(handle, null);

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizeDragState.set(handle!, {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startW: board.containerObj.clientWidth,
      startH: board.containerObj.clientHeight,
      anchorBBox: getSafeBBox(board, initialBBox)
    });

    try { handle!.setPointerCapture(e.pointerId); } catch (err) {}
    try { document.body.style.userSelect = 'none'; } catch (err) {}
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    const drag = resizeDragState.get(handle!);
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    const mw = clampWidth(board, drag.startW + dx);
    const mh = clampHeight(drag.startH + dy);

    // Store manual dimensions on the board so fitBoardSize can read them.
    board.__manualWidth  = mw;
    board.__manualHeight = mh;

    applyBoardSize(board, mw, mh, false, drag.anchorBBox, initialBBox, boardId);
    onResize();
    styleResizeHandle(handle!, getNeutralColor());
  });

  window.addEventListener('pointerup', (e: PointerEvent) => {
    const drag = resizeDragState.get(handle!);
    if (!drag || e.pointerId !== drag.pointerId) return;
    resizeDragState.set(handle!, null);
    try { document.body.style.userSelect = ''; } catch (e2) {}
  });

  window.addEventListener('pointercancel', () => {
    resizeDragState.set(handle!, null);
    try { document.body.style.userSelect = ''; } catch (e2) {}
  });
}

// ---------------------------------------------------------------------------
// Size fitting
// ---------------------------------------------------------------------------

export function fitBoardSize(
  board: any,
  initialBBox: number[],
  initialWidth: number | null,
  initialRatio: number,
  boardId: string
): void {
  if (!board || !board.containerObj) return;

  const manualWidth  = board.__manualWidth  ?? null;
  const manualHeight = board.__manualHeight ?? null;

  if (manualWidth == null || manualHeight == null) {
    const autoWidth = getConstrainedAncestorWidth(board.containerObj.parentElement);
    const preferredWidth = initialWidth != null ? initialWidth : autoWidth;
    const size = solveAspectFittedSize(board, preferredWidth, initialRatio);
    applyBoardSize(board, size.width, size.height, true, initialBBox, initialBBox, boardId);
  } else {
    applyBoardSize(board, manualWidth, manualHeight, false, getSafeBBox(board, initialBBox), initialBBox, boardId);
  }
}

export function restoreSavedBoardState(
  board: any,
  initialBBox: number[],
  boardId: string
): boolean {
  if (!board || !board.containerObj) return false;

  const st = loadStoredBoardState(boardId);
  if (!st) return false;

  board.__manualWidth  = st.width;
  board.__manualHeight = st.height;

  const width  = clampWidth(board, st.width);
  const height = clampHeight(st.height);

  board.__restoreLockUntil = Date.now() + 500;
  board.containerObj.style.width  = width + 'px';
  board.containerObj.style.height = height + 'px';

  try { board.resizeContainer(width, height, false, true); } catch (e) {}
  try { board.setBoundingBox(st.bbox.slice(), true); } catch (e) {}
  try { board.update(); } catch (e) {}

  return true;
}

// ---------------------------------------------------------------------------
// Bootstrap coordination
// ---------------------------------------------------------------------------

export function runExternalBootstraps(): void {
  function call(fn: (() => void) | undefined): void {
    if (typeof fn !== 'function') return;
    try { fn(); } catch (e) {}
  }

  call(window.__bootstrapAxisTitles);
  call(window.__bootstrapPlotFunctions);
  call(window.__bootstrapPlotInputs);
  call(window.__bootstrapCreatePoints);
  call(window.__bootstrapStaticPoints);
  call(window.__bootstrapPointOnGraphs);
}

// ---------------------------------------------------------------------------
// Spec parsing (mirrors shared/parser but kept self-contained for the macro)
// ---------------------------------------------------------------------------

function splitTopLevelLocal(str: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  let depth = 0;
  let esc = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { cur += ch; esc = true; continue; }

    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') { cur += ch; quote = ch; continue; }
    if (ch === '(' || ch === '[') { cur += ch; depth++; continue; }
    if (ch === ')' || ch === ']') { cur += ch; depth--; continue; }

    if (depth === 0 && (ch === ';' || ch === ',')) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }

    cur += ch;
  }

  if (cur.trim()) out.push(cur.trim());
  return out;
}

function unquoteLocal(v: string): string {
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

function toNum(v: any, fallback: number): number {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export interface BoardConfig {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  width: number | null;
  id: string;
}

// ---------------------------------------------------------------------------
// JSXGraph object creation — called with a live board reference
// ---------------------------------------------------------------------------

export function buildStickyAxes(board: any, axisCol: string): void {
  const tickBase = {
    insertTicks: false,
    ticksDistance: 1,
    strokeWidth: 1.75,
    minorTicks: 1,
    drawLabels: true
  };

  const xAxis = board.create('axis', [[0, 0], [1, 0]], {
    strokeColor: axisCol, highlightStrokeColor: axisCol, strokeWidth: 2.5,
    name: '', withLabel: false, fixed: true,
    position: 'sticky', anchor: 'left right', anchorDist: '24px', ticksAutoPos: false,
    ticks: { ...tickBase, label: { fontSize: 18, strokeColor: axisCol, fillColor: axisCol, anchorX: 'middle', anchorY: 'top',    offset: [0, 10]  } }
  });

  const yAxis = board.create('axis', [[0, 0], [0, 1]], {
    strokeColor: axisCol, highlightStrokeColor: axisCol, strokeWidth: 2.5,
    name: '', withLabel: false, fixed: true,
    position: 'sticky', anchor: 'left right', anchorDist: '24px', ticksAutoPos: false,
    ticks: { ...tickBase, label: { fontSize: 18, strokeColor: axisCol, fillColor: axisCol, anchorX: 'right',  anchorY: 'middle', offset: [-10, 0] } }
  });

  board.defaultAxes = { x: xAxis, y: yAxis };
}

export function createGrid(board: any, gridCol: string): void {
  board.create('grid', [board.defaultAxes.x, board.defaultAxes.y], {
    majorStep: 'auto', minorElements: 'auto', includeBoundaries: true, forceSquare: true,
    major: { face: 'line', strokeColor: gridCol, strokeWidth: 0.5, dash: 0, drawZero: true  },
    minor: { face: 'line', strokeColor: gridCol, strokeWidth: 1.5, dash: 1, drawZero: false }
  });
}

/**
 * Wire all event listeners and hooks for a board after it has been created
 * and its axes/grid have been added. Returns nothing — all state lives on
 * the board object and in window.__liaCoordHooks.
 */
export function wireBoard(board: any, cfg: BoardConfig, initialBBox: number[], initialRatio: number): void {
  window.__boards = window.__boards || {};
  window.__boards[cfg.id] = board;

  function applyAll(): void {
    applyBoardFrame(board);
    applyNavColors(board);
    applyGridColor(board, getAccentColor());
    applyAxisColors(board);
    applyAdaptiveTicks(board);
    updateStickyTickLabelPositions(board);
    ensureResizeHandle(board, initialBBox, cfg.id, applyAll);
    runExternalBootstraps();
  }

  window.__liaCoordHooks = window.__liaCoordHooks || {};
  window.__liaCoordHooks[cfg.id] = applyAll;

  window.__liaRunCoordHooks = function(): void {
    const hooks = window.__liaCoordHooks || {};
    Object.keys(hooks).forEach(function(id) { try { hooks[id]!(); } catch (e) {} });
    runExternalBootstraps();
  };

  // Initial sizing.
  const hadSavedState = restoreSavedBoardState(board, initialBBox, cfg.id);
  if (!hadSavedState) fitBoardSize(board, initialBBox, cfg.width, initialRatio, cfg.id);

  function finalize(): void {
    applyAll();
    try { board.containerObj.style.visibility = 'visible'; } catch (e) {}
  }

  if (hadSavedState) {
    let shown = false;
    const showBoard = function(): void {
      if (shown) return;
      shown = true;
      restoreSavedBoardState(board, initialBBox, cfg.id);
      finalize();
    };
    requestAnimationFrame(function() {
      restoreSavedBoardState(board, initialBBox, cfg.id);
      requestAnimationFrame(showBoard);
    });
    setTimeout(showBoard, 120);
  } else {
    finalize();
  }

  // Color scheme change.
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = function(): void { applyAll(); };
    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (mq && typeof (mq as any).addListener === 'function') (mq as any).addListener(handler);
  } catch (e) {}

  // Window resize.
  let resizeRAF = 0;
  window.addEventListener('resize', function() {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(function() {
      resizeRAF = 0;
      fitBoardSize(board, initialBBox, cfg.width, initialRatio, cfg.id);
      applyAll();
    });
  });

  // Bounding-box change (pan/zoom).
  let bboxRAF = 0;
  board.on('boundingbox', function() {
    if (bboxRAF) return;
    bboxRAF = requestAnimationFrame(function() {
      bboxRAF = 0;
      saveBoardState(board, cfg.id, initialBBox);
      applyAdaptiveTicks(board);
      applyAxisColors(board);
      updateStickyTickLabelPositions(board);
      ensureResizeHandle(board, initialBBox, cfg.id, applyAll);
      runExternalBootstraps();
    });
  });

  // Theme color polling (accent color for grid).
  let lastGridColor = '';
  setInterval(function() {
    const c = getAccentColor();
    if (!c || c === lastGridColor) return;
    lastGridColor = c;
    applyGridColor(board, c);
  }, 400);
}

// ---------------------------------------------------------------------------
// Spec parsing
// ---------------------------------------------------------------------------

export function parseCoordSpec(spec: string): BoardConfig {
  const raw = unquoteLocal(String(spec || '').trim());
  const obj: Record<string, string> = {};

  splitTopLevelLocal(raw).forEach(part => {
    const eq = part.indexOf('=');
    if (eq < 0) return;
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = unquoteLocal(part.slice(eq + 1).trim());
    obj[key] = val;
  });

  const cfg: BoardConfig = {
    xmin:  toNum(obj.xmin, -4),
    xmax:  toNum(obj.xmax,  4),
    ymin:  toNum(obj.ymin, -3),
    ymax:  toNum(obj.ymax,  3),
    width: null,
    id:    obj.id != null ? obj.id : 'A1'
  };

  if (!(cfg.xmax > cfg.xmin)) cfg.xmax = cfg.xmin + 1;
  if (!(cfg.ymax > cfg.ymin)) cfg.ymax = cfg.ymin + 1;

  const w = toNum(obj.width, NaN);
  cfg.width = (Number.isFinite(w) && w > 0) ? w : null;

  return cfg;
}
