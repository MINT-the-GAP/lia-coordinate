// Board helpers for the @CoordinateSystem macro.
// All logic that does NOT require a live JSXGraph board reference at definition time
// lives here and is exposed on window.__coord so the inline macro code can call it.
//
// The macro still owns: initBoard(), buildStickyAxes(), board.create('grid'), event binding.
// Everything else (parse, theme, sizing, styling, ticks, resize handle) lives here.

import { getNeutralColor, getAccentColor } from '../shared/theme';

const MAJOR_GRID_COLOR = '#808080';
const MAJOR_GRID_OPACITY = 0.7;

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

export type BoardSizeMode = 'auto' | 'capped' | 'manual';

export interface StoredBoardState {
  width: number;
  height: number;
  bbox: number[];
  sizeMode: BoardSizeMode;
  maxStartWidth?: number | null;
  exportBBox?: number[] | null;
}

export function loadStoredBoardState(id: string): StoredBoardState | null {
  const store = getBoardStateStore();
  const st = store[id];
  if (!st) return null;

  const width = Math.round(st.width);
  const height = Math.round(st.height);
  const bbox = Array.isArray(st.bbox) ? st.bbox.slice() : null;

  if (!(width > 0) || !(height > 0) || !isValidBBox(bbox)) return null;

  const rawMode = String(st.sizeMode || '').toLowerCase();
  const sizeMode: BoardSizeMode = rawMode === 'manual' || st.manualSize === true
    ? 'manual'
    : rawMode === 'capped'
      ? 'capped'
      : 'auto';

  const parsedMaxStartWidth = Number(st.maxStartWidth);
  const maxStartWidth = Number.isFinite(parsedMaxStartWidth) && parsedMaxStartWidth > 0
    ? parsedMaxStartWidth
    : null;
  const exportBBox = isValidBBox(st.exportBBox) ? st.exportBBox.slice() : null;

  return { width, height, bbox, sizeMode, maxStartWidth, exportBBox };
}

function readRenderedOuterSize(container: HTMLElement, dimension: 'width' | 'height'): number {
  const offset = dimension === 'width' ? container.offsetWidth : container.offsetHeight;
  if (Number.isFinite(offset) && offset > 0) return offset;

  const inlineSize = parseFloat(dimension === 'width' ? container.style.width : container.style.height);
  if (Number.isFinite(inlineSize) && inlineSize > 0) return inlineSize;

  try {
    const rect = container.getBoundingClientRect();
    const rectSize = dimension === 'width' ? rect.width : rect.height;
    if (Number.isFinite(rectSize) && rectSize > 0) return rectSize;
  } catch (e) {}

  const client = dimension === 'width' ? container.clientWidth : container.clientHeight;
  return Number.isFinite(client) && client > 0 ? client : 0;
}

export function saveBoardState(board: any, id: string, initialBBox: number[]): void {
  if (!board || !board.containerObj) return;
  if (board.__liaDgsFullscreenActive) return;
  if (board.__restoreLockUntil && Date.now() < board.__restoreLockUntil) return;
  if (window.__boards && window.__boards[id] && window.__boards[id] !== board) return;

  const bbox = getSafeBBox(board, initialBBox);
  const manualWidth = Number(board.__manualWidth);
  const manualHeight = Number(board.__manualHeight);
  const isManual = board.__coordSizeMode === 'manual' &&
    Number.isFinite(manualWidth) && manualWidth > 0 &&
    Number.isFinite(manualHeight) && manualHeight > 0;
  const width = Math.round(isManual
    ? manualWidth
    : readRenderedOuterSize(board.containerObj, 'width'));
  const height = Math.round(isManual
    ? manualHeight
    : readRenderedOuterSize(board.containerObj, 'height'));
  const sizeMode: BoardSizeMode = isManual
    ? 'manual'
    : board.__coordSizeMode === 'capped'
      ? 'capped'
      : 'auto';
  const configuredMaxStartWidth = Number(board.__coordMaxStartWidth);
  const maxStartWidth = sizeMode === 'capped' &&
    Number.isFinite(configuredMaxStartWidth) && configuredMaxStartWidth > 0
    ? configuredMaxStartWidth
    : null;

  if (!(width > 0) || !(height > 0) || !isValidBBox(bbox)) return;

  const store = getBoardStateStore();
  const previous = store[id] || {};
  const exportBBox = isValidBBox(board.__coordExportBBox)
    ? board.__coordExportBBox.slice()
    : bbox.slice();
  store[id] = {
    ...previous,
    width,
    height,
    bbox: bbox.slice(),
    exportBBox,
    sizeMode,
    maxStartWidth,
    manualSize: sizeMode === 'manual',
    zoomMode: board.__liaDgsZoomMode || previous.zoomMode || previous.panMode || 'both'
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

function asHTMLElement(value: any): HTMLElement | null {
  return value && value.nodeType === 1 ? value as HTMLElement : null;
}

function getComposedParent(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  if (node.parentElement) return node.parentElement;
  try {
    const root = node.getRootNode && node.getRootNode() as any;
    return asHTMLElement(root && root.host);
  } catch (e) {
    return null;
  }
}

function getBoardShadowHost(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  try {
    const root = el.getRootNode && el.getRootNode() as any;
    return asHTMLElement(root && root.host);
  } catch (e) {
    return null;
  }
}

function getBoardContentStart(el: HTMLElement | null): HTMLElement | null {
  const shadowHost = getBoardShadowHost(el);
  return getComposedParent(shadowHost || el);
}

function isStableWidthContainer(display: string): boolean {
  return display === 'block' ||
    display === 'flex' ||
    display === 'grid' ||
    display === 'flow-root' ||
    display === 'list-item' ||
    display === 'table' ||
    display === 'table-cell';
}

function readContentBoxWidth(node: HTMLElement, cs: CSSStyleDeclaration): number {
  const paddingLeft = parseFloat(cs.paddingLeft) || 0;
  const paddingRight = parseFloat(cs.paddingRight) || 0;
  const clientWidth = Number(node.clientWidth) || 0;
  if (clientWidth > 1) return Math.max(0, clientWidth - paddingLeft - paddingRight);

  try {
    const rectWidth = Number(node.getBoundingClientRect().width) || 0;
    const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
    const borderRight = parseFloat(cs.borderRightWidth) || 0;
    return Math.max(0, rectWidth - borderLeft - borderRight - paddingLeft - paddingRight);
  } catch (e) {
    return 0;
  }
}

function getBoardContentContainers(el: HTMLElement | null): HTMLElement[] {
  let cur = getBoardContentStart(el);
  const containers: HTMLElement[] = [];
  while (cur) {
    try {
      const display = window.getComputedStyle(cur).display;
      if (display === 'none') {
        containers.push(cur);
        break;
      }
      if (isStableWidthContainer(display)) containers.push(cur);
    } catch (e) {}
    if (cur === document.body || cur === document.documentElement) break;
    cur = getComposedParent(cur);
  }
  return containers;
}

function stabilizeBoardHost(el: HTMLElement | null): void {
  if (!el) return;
  const host = getBoardShadowHost(el);
  if (!host || String(host.tagName || '').toLowerCase() !== 'jsx-graph') return;
  host.style.display = 'block';
  host.style.width = '100%';
  host.style.maxWidth = '100%';
  host.style.minWidth = '0';
  host.style.boxSizing = 'border-box';
}

export function getConstrainedAncestorWidth(el: HTMLElement | null): number {
  let cur = getBoardContentStart(el);
  let minimum = Number.POSITIVE_INFINITY;
  let hiddenLayout = false;

  while (cur) {
    try {
      const cs = window.getComputedStyle(cur);
      if (cs.display === 'none') {
        hiddenLayout = true;
        break;
      }
      if (isStableWidthContainer(cs.display)) {
        const width = readContentBoxWidth(cur, cs);
        if (width > 1) minimum = Math.min(minimum, width);
      }
    } catch (e) {}

    if (cur === document.body || cur === document.documentElement) break;
    cur = getComposedParent(cur);
  }

  if (!hiddenLayout && Number.isFinite(minimum)) {
    return Math.max(1, Math.floor(minimum));
  }

  const viewportWidth = Math.floor(
    (document.documentElement && document.documentElement.clientWidth) ||
    window.innerWidth ||
    900
  );
  return Math.max(1, viewportWidth);
}

export function maxBoardHeight(): number {
  return Math.max(1, Math.min(Math.round(window.innerHeight * 0.82), 900));
}

export function clampWidth(board: any, w: number): number {
  const maxWidth = Math.max(1, getConstrainedAncestorWidth(board.containerObj));
  const desiredWidth = Number.isFinite(w) ? w : maxWidth;
  return Math.max(1, Math.min(maxWidth, desiredWidth));
}

export function clampHeight(h: number): number {
  const maxHeight = maxBoardHeight();
  const desiredHeight = Number.isFinite(h) ? h : maxHeight;
  return Math.max(1, Math.min(maxHeight, desiredHeight));
}

function roundPx(v: number): number {
  return Math.max(1, Math.round(v));
}

export function solveAspectFittedSize(
  board: any,
  preferredWidth: number,
  ratio: number
): { width: number; height: number } {
  const maxW = Math.max(1, getConstrainedAncestorWidth(board.containerObj));
  const safeRatio = Math.max(1e-9, ratio);
  const requestedMax = Number.isFinite(preferredWidth) && preferredWidth > 0
    ? preferredWidth
    : maxW;
  const width = Math.max(1, Math.min(requestedMax, maxW));

  return {
    width: roundPx(width),
    height: roundPx(width * safeRatio)
  };
}

function fitDimensionsWithinBounds(
  board: any,
  preferredWidth: number,
  preferredHeight: number
): { width: number; height: number } {
  const width = Math.max(1, Number(preferredWidth) || 1);
  const height = Math.max(1, Number(preferredHeight) || 1);
  const maxWidth = Math.max(1, getConstrainedAncestorWidth(board.containerObj));
  const maxHeight = Math.max(1, maxBoardHeight());
  const scale = Math.min(1, maxWidth / width, maxHeight / height);

  return {
    width: roundPx(width * scale),
    height: roundPx(height * scale)
  };
}

export function prepareBoardContainer(
  container: HTMLElement,
  initialWidth: number | null,
  initialRatio: number,
  storedState: StoredBoardState | null
): void {
  if (!container) return;

  stabilizeBoardHost(container);
  container.style.boxSizing = 'border-box';
  container.style.maxWidth = '100%';
  container.style.minWidth = '0';
  container.style.maxHeight = 'none';
  container.style.aspectRatio = 'auto';

  const size = storedState && storedState.sizeMode === 'manual'
    ? fitDimensionsWithinBounds(
      { containerObj: container },
      storedState.width,
      storedState.height
    )
    : solveAspectFittedSize(
      { containerObj: container },
      initialWidth != null ? initialWidth : getConstrainedAncestorWidth(container),
      initialRatio
    );

  container.style.width = size.width + 'px';
  container.style.height = size.height + 'px';
  container.style.visibility = 'hidden';
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
  boardId: string,
  limitHeight: boolean = true
): { width: number; height: number } | null {
  if (!board || !board.containerObj) return null;

  const width  = clampWidth(board, desiredWidth);
  const height = limitHeight ? clampHeight(desiredHeight) : roundPx(desiredHeight);

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
  board.containerObj.style.maxWidth = '100%';
  board.containerObj.style.minWidth = '0';
  board.containerObj.style.maxHeight = 'none';
  board.containerObj.style.aspectRatio = 'auto';
  board.containerObj.style.background = 'transparent';
  board.containerObj.style.position = 'relative';
  board.containerObj.style.display = 'block';
  board.containerObj.style.marginLeft = '0';
  board.containerObj.style.marginRight = 'auto';
  board.containerObj.style.touchAction = 'none';

  const nav = board.containerObj.querySelector('.JXG_navigation') as HTMLElement | null;
  if (nav) nav.style.display = 'none';
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

  function colorGridElement(grid: any, isMinor: boolean): void {
    if (!grid || typeof grid.setAttribute !== 'function') return;
    const strokeColor = isMinor ? color : MAJOR_GRID_COLOR;
    const attributes: Record<string, any> = { strokeColor, highlightStrokeColor: strokeColor };
    if (!isMinor) {
      attributes.strokeOpacity = MAJOR_GRID_OPACITY;
      attributes.highlightStrokeOpacity = MAJOR_GRID_OPACITY;
    }
    grid.setAttribute(attributes);
  }

  try {
    if (board.options && board.options.grid) {
      if (board.options.grid.major) board.options.grid.major.strokeColor = MAJOR_GRID_COLOR;
      if (board.options.grid.minor) board.options.grid.minor.strokeColor = color;
    }
  } catch (e) {}

  try {
    colorGridElement(board.__liaMajorGrid, false);
    colorGridElement(board.__liaMinorGrid, true);

    if (board.grids && board.grids.length) {
      board.grids.forEach((g: any) => {
        colorGridElement(g, Boolean(g && g.majorGrid));
        if (g && g.minorGrid) colorGridElement(g.minorGrid, true);
      });
    }
  } catch (e) {}

  try {
    if (board.objectsList && board.objectsList.length) {
      board.objectsList.forEach((o: any) => {
        if (!o || typeof o.setAttribute !== 'function') return;
        if (o.elType === 'grid' || (typeof JXG !== 'undefined' && o.type === JXG.OBJECT_TYPE_GRID)) {
          // JSXGraph represents the minor grid as a child curve with a
          // `majorGrid` reference; the returned major curve owns `minorGrid`.
          colorGridElement(o, Boolean(o.majorGrid));
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

function styleResizeHandle(handle: HTMLElement, accentCol: string): void {
  handle.style.position = 'absolute';
  handle.style.right = '0';
  handle.style.bottom = '0';
  handle.style.left = 'auto';
  handle.style.width = '24px';
  handle.style.height = '24px';
  handle.style.cursor = 'nwse-resize';
  handle.style.zIndex = '50';
  handle.style.touchAction = 'none';
  handle.style.userSelect = 'none';
  handle.style.background = 'transparent';
  handle.style.borderLeft = '0';
  handle.style.borderBottom = '5px solid ' + accentCol;
  handle.style.borderRight = '5px solid ' + accentCol;
  handle.style.borderTop = '0';
  handle.style.borderBottomLeftRadius = '0';
  handle.style.borderBottomRightRadius = '8px';
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

  const col = getAccentColor();
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
      startW: board.containerObj.offsetWidth || board.containerObj.clientWidth,
      startH: board.containerObj.offsetHeight || board.containerObj.clientHeight,
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

    const minWidth = Math.min(260, drag.startW, getConstrainedAncestorWidth(board.containerObj));
    const minHeight = Math.min(220, drag.startH, maxBoardHeight());
    const mw = Math.max(minWidth, clampWidth(board, drag.startW + dx));
    const mh = Math.max(minHeight, clampHeight(drag.startH + dy));

    // Store manual dimensions on the board so fitBoardSize can read them.
    board.__manualWidth  = mw;
    board.__manualHeight = mh;
    board.__coordSizeMode = 'manual';

    applyBoardSize(board, mw, mh, false, drag.anchorBBox, initialBBox, boardId);
    onResize();
    styleResizeHandle(handle!, getAccentColor());
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
    const autoWidth = getConstrainedAncestorWidth(board.containerObj);
    const preferredWidth = initialWidth != null ? initialWidth : autoWidth;
    const size = solveAspectFittedSize(board, preferredWidth, initialRatio);
    applyBoardSize(
      board,
      size.width,
      size.height,
      false,
      getSafeBBox(board, initialBBox),
      initialBBox,
      boardId,
      false
    );
  } else {
    const size = fitDimensionsWithinBounds(board, manualWidth, manualHeight);
    applyBoardSize(board, size.width, size.height, false, getSafeBBox(board, initialBBox), initialBBox, boardId);
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

  if (st.sizeMode !== 'manual') {
    board.__manualWidth = null;
    board.__manualHeight = null;
    try { board.setBoundingBox(st.bbox.slice(), true); } catch (e) {}
    return false;
  }

  board.__manualWidth  = st.width;
  board.__manualHeight = st.height;
  board.__coordSizeMode = 'manual';

  const size = fitDimensionsWithinBounds(board, st.width, st.height);
  const width = size.width;
  const height = size.height;

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
  call(window.__bootstrapScharen);
  call(window.__bootstrapPlotFunctions);
  call(window.__bootstrapPlotInputs);
  call(window.__bootstrapCreatePoints);
  call(window.__bootstrapStaticPoints);
  call(window.__bootstrapPointOnGraphs);
  call(window.__bootstrapPointsOnGraph);
  call(window.__bootstrapDistances);
  call(window.__bootstrapArcs);
  call(window.__bootstrapAreas);
  call(window.__bootstrapAngles);
  call(window.__bootstrapCircles);
  call(window.__bootstrapRekonstruktion);
  call(window.__bootstrapDGS);
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

    if (ch === String.fromCharCode(39)) {
      let previous = i - 1;
      while (previous >= 0 && /\s/.test(str[previous])) previous -= 1;
      const atValueStart = previous < 0 || ';,([{=:'.includes(str[previous]);
      let hasClosingQuote = false;
      let escapedQuote = false;
      for (let next = i + 1; atValueStart && next < str.length; next += 1) {
        if (escapedQuote) {
          escapedQuote = false;
          continue;
        }
        if (str[next] === String.fromCharCode(92)) {
          escapedQuote = true;
          continue;
        }
        if (str[next] === ch) {
          hasClosingQuote = true;
          break;
        }
      }
      if (!atValueStart || !hasClosingQuote) {
        cur += ch;
        continue;
      }
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
  axes: boolean;
  grid: boolean;
  border: boolean;
}

// ---------------------------------------------------------------------------
// JSXGraph object creation — called with a live board reference
// ---------------------------------------------------------------------------

export function buildStickyAxes(board: any, axisCol: string, visible = true): void {
  const tickBase = {
    insertTicks: false,
    ticksDistance: 1,
    strokeWidth: 1.75,
    majorHeight: 10,
    minorHeight: 4,
    minorTicks: 1,
    drawLabels: visible,
    visible: visible
  };

  const xAxis = board.create('axis', [[0, 0], [1, 0]], {
    visible: visible,
    strokeColor: axisCol, highlightStrokeColor: axisCol, strokeWidth: 2.5,
    name: '', withLabel: false, fixed: true,
    position: 'sticky', anchor: 'left right', anchorDist: '24px', ticksAutoPos: false,
    ticks: { ...tickBase, label: { fontSize: 18, strokeColor: axisCol, fillColor: axisCol, anchorX: 'middle', anchorY: 'top',    offset: [0, 10]  } }
  });

  const yAxis = board.create('axis', [[0, 0], [0, 1]], {
    visible: visible,
    strokeColor: axisCol, highlightStrokeColor: axisCol, strokeWidth: 2.5,
    name: '', withLabel: false, fixed: true,
    position: 'sticky', anchor: 'left right', anchorDist: '24px', ticksAutoPos: false,
    ticks: { ...tickBase, label: { fontSize: 18, strokeColor: axisCol, fillColor: axisCol, anchorX: 'right',  anchorY: 'middle', offset: [-10, 0] } }
  });

  board.defaultAxes = { x: xAxis, y: yAxis };
}

export function createGrid(board: any, gridCol: string): void {
  const parents = board && board.defaultAxes && board.defaultAxes.x && board.defaultAxes.y
    ? [board.defaultAxes.x, board.defaultAxes.y]
    : [];

  const grid = board.create('grid', parents, {
    majorStep: 'auto', minorElements: 'auto', includeBoundaries: true, forceSquare: false,
    major: {
      face: 'line', strokeColor: MAJOR_GRID_COLOR, strokeOpacity: MAJOR_GRID_OPACITY,
      highlightStrokeOpacity: MAJOR_GRID_OPACITY, strokeWidth: 1, dash: 0, drawZero: true
    },
    minor: { face: 'line', strokeColor: gridCol, strokeWidth: 1.5, dash: 1, drawZero: false }
  });

  // Keep direct references so theme changes can recolor only the subordinate
  // grid without accidentally turning the numbered major grid into an accent.
  board.__liaMajorGrid = grid;
  board.__liaMinorGrid = grid && grid.minorGrid ? grid.minorGrid : null;
}

export function createBoardDecorations(
  board: any,
  cfg: BoardConfig,
  axisCol: string,
  gridCol: string
): void {
  // An auto-spaced grid needs axis ticks as its metric. In grid-only mode the
  // same axes are created as invisible parents, preserving the normal spacing.
  if (cfg.axes || cfg.grid) buildStickyAxes(board, axisCol, cfg.axes);
  if (cfg.grid) createGrid(board, gridCol);
}

/**
 * Wire all event listeners and hooks for a board after it has been created
 * and its axes/grid have been added. Returns nothing — all state lives on
 * the board object and in window.__liaCoordHooks.
 */
export function wireBoard(board: any, cfg: BoardConfig, initialBBox: number[], initialRatio: number): void {
  window.__boards = window.__boards || {};
  const previousBoard = window.__boards[cfg.id];
  try {
    if (previousBoard && typeof previousBoard.__coordViewportCleanup === 'function') {
      previousBoard.__coordViewportCleanup();
    }
  } catch (e) {}
  window.__boards[cfg.id] = board;
  const storedBoardState = loadStoredBoardState(cfg.id);
  board.__manualWidth = null;
  board.__manualHeight = null;
  board.__coordSizeMode = cfg.width == null ? 'auto' : 'capped';
  board.__coordMaxStartWidth = cfg.width == null ? null : cfg.width;
  board.__coordExportBBox = (
    storedBoardState && (
      isValidBBox(storedBoardState.exportBBox) ? storedBoardState.exportBBox :
      (isValidBBox(storedBoardState.bbox) ? storedBoardState.bbox : null)
    ) ||
    initialBBox
  ).slice();

  // JSXGraph slightly expands the requested bounding box to account for
  // aspect ratio and rendered borders. Keep the logical source viewport for
  // export until the learner actually pans or zooms the board.
  let userViewportPointerActive = false;
  let userViewportIntentUntil = 0;
  const isBoardUiControl = function(target: EventTarget | null): boolean {
    const element = target && (target as Element);
    if (!element || typeof element.closest !== 'function') return false;
    return !!element.closest('button,input,select,textarea,.lia-dgs-menu-bar,.lia-dgs-side-menu,.lia-dgs-object-list-panel');
  };
  const markUserViewportIntent = function(duration = 800): void {
    userViewportIntentUntil = Math.max(userViewportIntentUntil, Date.now() + duration);
  };
  const handleViewportWheel = function(event: WheelEvent): void {
    if (!isBoardUiControl(event.target)) markUserViewportIntent();
  };
  const handleViewportPointerDown = function(event: PointerEvent): void {
    if (isBoardUiControl(event.target)) return;
    userViewportPointerActive = true;
    markUserViewportIntent(1200);
  };
  const handleViewportPointerUp = function(): void {
    if (!isCurrentBoard()) {
      cleanupViewportIntentListeners();
      return;
    }
    if (!userViewportPointerActive) return;
    userViewportPointerActive = false;
    markUserViewportIntent(300);
  };
  const handleViewportPointerCancel = function(): void {
    userViewportPointerActive = false;
    if (!isCurrentBoard()) cleanupViewportIntentListeners();
  };
  const handleViewportKeyDown = function(event: KeyboardEvent): void {
    if (!isBoardUiControl(event.target)) markUserViewportIntent();
  };
  const cleanupViewportIntentListeners = function(): void {
    try { board.containerObj.removeEventListener('wheel', handleViewportWheel, true); } catch (e) {}
    try { board.containerObj.removeEventListener('pointerdown', handleViewportPointerDown, true); } catch (e) {}
    try { board.containerObj.removeEventListener('keydown', handleViewportKeyDown, true); } catch (e) {}
    try { window.removeEventListener('pointerup', handleViewportPointerUp, true); } catch (e) {}
    try { window.removeEventListener('pointercancel', handleViewportPointerCancel, true); } catch (e) {}
  };
  board.containerObj.addEventListener('wheel', handleViewportWheel, { capture: true, passive: true });
  board.containerObj.addEventListener('pointerdown', handleViewportPointerDown, true);
  window.addEventListener('pointerup', handleViewportPointerUp, true);
  window.addEventListener('pointercancel', handleViewportPointerCancel, true);
  board.containerObj.addEventListener('keydown', handleViewportKeyDown, true);
  board.__coordViewportCleanup = cleanupViewportIntentListeners;

  function isCurrentBoard(): boolean {
    return !!board && !!board.containerObj && board.containerObj.isConnected !== false &&
      (!window.__boards || !window.__boards[cfg.id] || window.__boards[cfg.id] === board);
  }

  function applyAll(): void {
    if (cfg.border) {
      applyBoardFrame(board);
    } else {
      try {
        board.containerObj.style.border = 'none';
        board.containerObj.style.borderRadius = '0';
        board.containerObj.style.background = 'transparent';
        board.containerObj.style.position = 'relative';
        board.containerObj.style.display = 'block';
        board.containerObj.style.marginLeft = '0';
        board.containerObj.style.marginRight = 'auto';
        board.containerObj.style.boxSizing = 'border-box';
        board.containerObj.style.touchAction = 'auto';
      } catch (e) {}
      try {
        const nav = board.containerObj.querySelector('.JXG_navigation') as HTMLElement | null;
        if (nav) nav.style.display = 'none';
      } catch (e) {}
    }
    applyNavColors(board);
    if (cfg.grid) applyGridColor(board, getAccentColor());
    if (cfg.axes) {
      applyAxisColors(board);
      applyAdaptiveTicks(board);
      updateStickyTickLabelPositions(board);
    }
    if (cfg.border) {
      ensureResizeHandle(board, initialBBox, cfg.id, applyAll);
    } else {
      try {
        const handle = board.containerObj.querySelector('.lia-jxg-resize-handle') as HTMLElement | null;
        if (handle) handle.remove();
      } catch (e) {}
    }
    runExternalBootstraps();
  }

  window.__liaCoordHooks = window.__liaCoordHooks || {};
  window.__liaCoordHooks[cfg.id] = applyAll;


  // Initial sizing.
  const hadSavedState = restoreSavedBoardState(board, initialBBox, cfg.id);
  if (!hadSavedState) fitBoardSize(board, initialBBox, cfg.width, initialRatio, cfg.id);

  function finalize(): void {
    applyAll();
    try { board.containerObj.style.visibility = 'visible'; } catch (e) {}
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (isCurrentBoard()) scheduleLayoutRefit();
      });
    });
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
    const handler = function(): void { if (isCurrentBoard()) applyAll(); };
    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (mq && typeof (mq as any).addListener === 'function') (mq as any).addListener(handler);
  } catch (e) {}

  // Keep the board inside the available content width. Besides real window
  // resizes, this also covers layout changes such as sidebars or slide panels.
  let layoutResizeRAF = 0;
  let lastAvailableWidth = getConstrainedAncestorWidth(board.containerObj);

  function scheduleLayoutRefit(): void {
    if (!isCurrentBoard()) {
      try { board.__coordContentResizeObserver?.disconnect(); } catch (e) {}
      window.removeEventListener('resize', scheduleLayoutRefit);
      return;
    }
    if (board.__liaDgsFullscreenActive) return;
    if (layoutResizeRAF) return;
    layoutResizeRAF = requestAnimationFrame(function() {
      layoutResizeRAF = 0;
      if (!isCurrentBoard()) return;
      if (board.__liaDgsFullscreenActive) return;
      lastAvailableWidth = getConstrainedAncestorWidth(board.containerObj);
      fitBoardSize(board, initialBBox, cfg.width, initialRatio, cfg.id);
      applyAll();
    });
  }

  window.addEventListener('resize', scheduleLayoutRefit);

  try {
    if (board.__coordContentResizeObserver) board.__coordContentResizeObserver.disconnect();
    const observedContainers = getBoardContentContainers(board.containerObj);
    if (observedContainers.length && typeof ResizeObserver === 'function') {
      board.__coordContentResizeObserver = new ResizeObserver(function() {
        if (!isCurrentBoard()) {
          try { board.__coordContentResizeObserver?.disconnect(); } catch (e) {}
          return;
        }
        const availableWidth = getConstrainedAncestorWidth(board.containerObj);
        if (Math.abs(availableWidth - lastAvailableWidth) < 1) return;
        lastAvailableWidth = availableWidth;
        scheduleLayoutRefit();
      });
      observedContainers.forEach(function(container) {
        try { board.__coordContentResizeObserver.observe(container); } catch (e) {}
      });
    }
  } catch (e) {
    board.__coordContentResizeObserver = null;
  }

  // Bounding-box change (pan/zoom).
  let bboxRAF = 0;
  board.on('boundingbox', function() {
    if (bboxRAF) return;
    bboxRAF = requestAnimationFrame(function() {
      bboxRAF = 0;
      if (userViewportPointerActive || Date.now() <= userViewportIntentUntil) {
        board.__coordExportBBox = getSafeBBox(board, initialBBox);
      }
      saveBoardState(board, cfg.id, initialBBox);

      // Suspend all internal updates during pan/zoom for massive performance boost
      try {
        if (typeof board.suspendUpdate === 'function') board.suspendUpdate();
      } catch (e) {}

      try {
        if (cfg.axes) {
          applyAdaptiveTicks(board);
          applyAxisColors(board);
          updateStickyTickLabelPositions(board);
        }
        if (cfg.border) ensureResizeHandle(board, initialBBox, cfg.id, applyAll);

        // Keep pan/zoom lightweight: avoid full DOM bootstrap scans on each move.
        // Axis titles need positional refresh on bounding-box changes.
        if (window.__refreshAllAxisTitles) window.__refreshAllAxisTitles();
      } catch (e) {}

      // Resume updates at the very end
      try {
        if (typeof board.unsuspendUpdate === 'function') board.unsuspendUpdate();
      } catch (e) {}
    });
  });

  // Theme color polling (accent color for grid).
  let lastGridColor = '';
  const themePoll = window.setInterval(function() {
    if (!isCurrentBoard()) {
      window.clearInterval(themePoll);
      try { board.__coordContentResizeObserver?.disconnect(); } catch (e) {}
      window.removeEventListener('resize', scheduleLayoutRefit);
      return;
    }
    if (!cfg.grid) return;
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
  const positional: string[] = [];

  splitTopLevelLocal(raw).forEach(part => {
    const eq = part.indexOf('=');
    if (eq < 0) {
      const value = unquoteLocal(part).trim();
      if (value) positional.push(value);
      return;
    }
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
    id:    obj.id != null ? obj.id : 'A1',
    axes:  true,
    grid:  true,
    border: true
  };

  function flag(value: string | undefined, fallback: boolean): boolean {
    const normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'nein' || normalized === 'no' || normalized === 'off') return false;
    if (normalized === '1' || normalized === 'true' || normalized === 'ja' || normalized === 'yes' || normalized === 'on') return true;
    return fallback;
  }

  cfg.axes = flag(obj.achsen != null ? obj.achsen : (obj.axes != null ? obj.axes : positional[0]), true);
  cfg.grid = flag(obj.grid != null ? obj.grid : positional[1], true);
  cfg.border = flag(obj.border != null ? obj.border : (obj.rahmen != null ? obj.rahmen : positional[2]), true);

  if (!(cfg.xmax > cfg.xmin)) cfg.xmax = cfg.xmin + 1;
  if (!(cfg.ymax > cfg.ymin)) cfg.ymax = cfg.ymin + 1;

  const w = toNum(obj.width, NaN);
  cfg.width = (Number.isFinite(w) && w > 0) ? w : null;

  return cfg;
}
