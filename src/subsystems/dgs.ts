// DGS subsystem (@DGS macro).
// Adds a menu button and a sliding top menu bar to a coordinate board.

import { scheduleBootstrap } from '../shared/bootstrap';
import { unquote } from '../shared/parser';
import { getAccentColor, getNeutralColor, initThemeSync } from '../shared/theme';

type DgsState = {
  boardId: string;
  board: any;
  boardContainer: HTMLElement;
  button: HTMLButtonElement;
  menuClip: HTMLDivElement;
  menuBar: HTMLDivElement;
  sideMenuClip: HTMLDivElement;
  sideMenu: HTMLDivElement;
  sideMenuTitle: HTMLDivElement;
  sideMenuCloseButton: HTMLButtonElement;
  coordinateSection: HTMLDivElement;
  xCoordinateInput: HTMLInputElement;
  yCoordinateInput: HTMLInputElement;
  fixedCheckbox: HTMLInputElement;
  nameCheckbox: HTMLInputElement;
  objectCheckbox: HTMLInputElement;
  objectCheckboxText: HTMLSpanElement;
  colorPalette: HTMLDivElement;
  colorPaletteCursor: HTMLSpanElement;
  colorHueInput: HTMLInputElement;
  colorPreview: HTMLSpanElement;
  colorHexInput: HTMLInputElement;
  colorHue: number;
  colorSaturation: number;
  colorValue: number;
  toolsDivider: HTMLSpanElement;
  pointButton: HTMLButtonElement;
  segmentButton: HTMLButtonElement;
  regressionDivider: HTMLSpanElement;
  xAxis: any;
  xAxisOriginalPoint2: number[] | null;
  xAxisOriginalStraightLast: boolean;
  xAxisAdjusted: boolean;
  yAxis: any;
  axisOriginalPoint2: number[] | null;
  axisOriginalStraightLast: boolean;
  axisAdjusted: boolean;
  axisSyncing: boolean;
  open: boolean;
  sideMenuOpen: boolean;
  contextObject: any | null;
  activeTool: '' | 'point' | 'segment';
  selectedSegmentPoint: any | null;
  onBoardViewportChange?: () => void;
  onBoardPointerDown?: (evt: PointerEvent) => void;
  onBoardContextMenu?: (evt: MouseEvent) => void;
  resizeObserver?: ResizeObserver;
  axisAnimationRAF?: number;
  axisSyncRAF?: number;
  xAxisAnimationRAF?: number;
  xAxisSyncRAF?: number;
};

const states: Record<string, DgsState> = {};
const pendingRetries: Record<string, number> = {};
const MAX_RETRIES = 40;
const RETRY_DELAY_MS = 120;
const MENU_HEIGHT_PX = 50;
const SIDE_MENU_WIDTH_PX = 190;
const MENU_TRANSITION_MS = 220;

function ensureStyles(root: Document | ShadowRoot): void {
  if (root.querySelector('#lia-dgs-style')) return;

  const style = document.createElement('style');
  style.id = 'lia-dgs-style';
  style.textContent = `
    .lia-dgs-menu-button {
      position: absolute;
      top: 10px;
      left: 10px;
      width: 28px;
      height: 28px;
      min-width: 28px;
      min-height: 28px;
      border-radius: 999px;
      border: 2px solid currentColor;
      background: transparent;
      color: inherit;
      display: grid;
      place-items: center;
      padding: 0;
      margin: 0;
      cursor: pointer;
      box-sizing: border-box;
      z-index: 50;
      appearance: none;
      -webkit-appearance: none;
    }

    .lia-dgs-menu-button.is-active {
      background: rgba(6, 106, 114, 0.88);
      color: #fff !important;
      border-color: rgba(255, 255, 255, 0.86);
    }

    .lia-dgs-menu-button svg {
      width: 22px;
      height: 22px;
      display: block;
      overflow: visible;
    }

    .lia-dgs-menu-button path {
      stroke: currentColor;
      fill: none;
      stroke-width: 2.2;
      stroke-linecap: round;
    }

    .lia-dgs-menu-clip {
      position: absolute;
      inset: 0;
      z-index: 49;
      overflow: hidden;
      pointer-events: none;
      border-radius: inherit;
    }

    .lia-dgs-top-menu {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${MENU_HEIGHT_PX}px;
      box-sizing: border-box;
      padding: 8px 10px 8px 48px;
      border-bottom: 2px solid currentColor;
      background: var(--lia-dgs-menu-bg, #fff);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
      transform: translateY(calc(-100% - 2px));
      transition: transform ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1);
      pointer-events: none;
    }

    .lia-dgs-top-menu[data-open="1"] {
      transform: translateY(0);
      pointer-events: auto;
    }

    .lia-dgs-side-menu-clip {
      position: absolute;
      inset: 0;
      z-index: 48;
      overflow: hidden;
      pointer-events: none;
      border-radius: inherit;
    }

    .lia-dgs-side-menu {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: ${SIDE_MENU_WIDTH_PX}px;
      box-sizing: border-box;
      padding: 10px 12px;
      overflow-y: auto;
      border-left: 2px solid currentColor;
      background: var(--lia-dgs-menu-bg, #fff);
      box-shadow: -6px 0 16px rgba(0, 0, 0, 0.18);
      transform: translateX(calc(100% + 2px));
      transition:
        transform ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1),
        top ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1);
      pointer-events: none;
    }

    .lia-dgs-side-menu[data-open="1"] {
      transform: translateX(0);
      pointer-events: auto;
    }

    .lia-dgs-side-menu[data-top-open="1"] {
      top: ${MENU_HEIGHT_PX}px;
    }

    .lia-dgs-side-menu-header {
      min-height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 8px;
      margin-bottom: 6px;
      border-bottom: 2px solid var(--lia-dgs-theme-color, currentColor);
      font-size: 15px;
      font-weight: 700;
    }

    .lia-dgs-side-menu-title mjx-container {
      display: inline-block !important;
      margin: 0 !important;
    }

    .lia-dgs-side-menu-close {
      width: 24px;
      height: 24px;
      min-width: 24px;
      min-height: 24px;
      display: grid;
      place-items: center;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 21px;
      line-height: 1;
      cursor: pointer;
    }

    .lia-dgs-side-menu-close:hover,
    .lia-dgs-side-menu-close:focus-visible {
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 22%, transparent);
      outline: none;
    }

    .lia-dgs-coordinate-section[hidden] {
      display: none;
    }

    .lia-dgs-context-section-title {
      margin: 4px 0 6px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.8;
    }

    .lia-dgs-coordinate-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }

    .lia-dgs-coordinate-field {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 4px;
      min-width: 0;
      font-size: 13px;
    }

    .lia-dgs-coordinate-input,
    .lia-dgs-color-hex {
      min-width: 0;
      width: 100%;
      height: 28px;
      box-sizing: border-box;
      border: 1px solid currentColor;
      border-radius: 5px;
      background: transparent;
      color: inherit;
      padding: 3px 5px;
      font: inherit;
    }

    .lia-dgs-coordinate-input[aria-invalid="true"],
    .lia-dgs-color-hex[aria-invalid="true"] {
      border-color: #ff3333;
      box-shadow: 0 0 0 1px #ff3333;
    }

    .lia-dgs-context-option {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 32px;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
    }

    .lia-dgs-context-option input {
      width: 17px;
      height: 17px;
      margin: 0;
      accent-color: var(--lia-dgs-theme-color, currentColor);
      cursor: pointer;
    }

    .lia-dgs-color-section {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-color-palette {
      position: relative;
      width: 100%;
      height: 96px;
      box-sizing: border-box;
      border: 1px solid currentColor;
      border-radius: 6px;
      background:
        linear-gradient(to top, #000, transparent),
        linear-gradient(to right, #fff, hsl(var(--lia-dgs-picker-hue, 300deg) 100% 50%));
      cursor: crosshair;
      touch-action: none;
      overflow: hidden;
    }

    .lia-dgs-color-palette:focus-visible {
      outline: 2px solid var(--lia-dgs-theme-color, currentColor);
      outline-offset: 2px;
    }

    .lia-dgs-color-cursor {
      position: absolute;
      left: 100%;
      top: 0;
      width: 12px;
      height: 12px;
      box-sizing: border-box;
      border: 2px solid #fff;
      border-radius: 999px;
      box-shadow: 0 0 0 1px #000, 0 1px 4px rgba(0, 0, 0, 0.5);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .lia-dgs-color-hue {
      width: 100%;
      height: 18px;
      margin: 7px 0 5px;
      padding: 0;
      accent-color: transparent;
      cursor: ew-resize;
    }

    .lia-dgs-color-hue::-webkit-slider-runnable-track {
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    }

    .lia-dgs-color-hue::-moz-range-track {
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    }

    .lia-dgs-color-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .lia-dgs-color-preview {
      width: 30px;
      height: 28px;
      flex: 0 0 30px;
      box-sizing: border-box;
      border: 1px solid currentColor;
      border-radius: 5px;
      background: #ff00ff;
    }

    .lia-dgs-tools-divider,
    .lia-dgs-regression-divider {
      position: absolute;
      top: 7px;
      width: 2px;
      height: 36px;
      border-radius: 999px;
      background: var(--lia-dgs-theme-color, currentColor);
      opacity: 1;
      pointer-events: none;
    }

    .lia-dgs-tools-divider {
      left: 44px;
    }

    .lia-dgs-regression-divider {
      left: 124px;
      display: none;
    }

    .lia-dgs-regression-divider[data-visible="1"] {
      display: block;
    }

    .lia-dgs-geometry-button {
      position: absolute;
      top: 10px;
      width: 28px;
      height: 28px;
      min-width: 28px;
      min-height: 28px;
      border-radius: 999px;
      border: 2px solid currentColor;
      background: transparent;
      color: inherit;
      display: grid;
      place-items: center;
      padding: 0;
      margin: 0;
      cursor: pointer;
      box-sizing: border-box;
      appearance: none;
      -webkit-appearance: none;
    }

    .lia-dgs-geometry-button.is-active {
      border-color: var(--lia-dgs-theme-color, currentColor);
      box-shadow:
        inset 0 0 0 1px var(--lia-dgs-theme-color, currentColor),
        0 0 0 1px var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-point-button {
      left: 54px;
    }

    .lia-dgs-segment-button {
      left: 90px;
    }

    .lia-dgs-geometry-button svg {
      display: block;
      width: 22px;
      height: 22px;
      overflow: visible;
    }

    .lia-dgs-geometry-button path {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lia-dgs-geometry-button .lia-dgs-cross {
      stroke: #ff00ff;
      stroke-width: 1.65;
    }

    .lia-dgs-point-symbol {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1px;
    }

    .lia-dgs-point-symbol svg {
      width: 8px;
      height: 8px;
      flex: 0 0 8px;
    }

    .lia-dgs-point-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }

    .lia-dgs-point-label mjx-container {
      display: inline-block !important;
      margin: 0 !important;
      font-size: 1em !important;
    }

    .lia-dgs-construction-mode,
    .lia-dgs-construction-mode > svg,
    .lia-dgs-construction-mode > canvas {
      cursor: crosshair !important;
    }

    .lia-dgs-segment-endpoint {
      filter:
        drop-shadow(0 0 2px var(--lia-dgs-theme-color, #00a8b5))
        drop-shadow(0 0 3px var(--lia-dgs-theme-color, #00a8b5));
    }

    @media (prefers-reduced-motion: reduce) {
      .lia-dgs-top-menu,
      .lia-dgs-side-menu {
        transition: none;
      }
    }
  `;

  if (root instanceof Document) {
    (root.head || root.documentElement).appendChild(style);
  } else {
    root.appendChild(style);
  }
}

function getBoardContainer(boardId: string): HTMLElement | null {
  const board = window.__boards && window.__boards[boardId];
  if (!board || !board.containerObj) return null;
  return board.containerObj as HTMLElement;
}

function typesetDgsMath(element: HTMLElement): void {
  let mathJax: any = null;
  try { mathJax = window.MathJax; } catch (e) {}
  if (!mathJax) {
    try { mathJax = window.parent && window.parent.MathJax; } catch (e) {}
  }
  if (!mathJax || typeof mathJax.typesetPromise !== 'function') return;
  try { mathJax.typesetPromise([element]).catch(function () {}); } catch (e) {}
}

function unwrapAlphabeticName(value: unknown): string {
  let name = String(value == null ? '' : value).trim();
  const inlineMath = name.match(/^\\\(([\s\S]*)\\\)$/);
  const displayMath = name.match(/^\\\[([\s\S]*)\\\]$/);
  if (inlineMath) name = inlineMath[1].trim();
  else if (displayMath) name = displayMath[1].trim();

  name = name
    .replace(/^\\(?:mathrm|text)\{([\s\S]*)\}$/, '$1')
    .replace(/\\prime/g, "'")
    .replace(/[{}^\s]/g, '');

  return name;
}

function normalizeAlphabeticPointName(value: unknown): string {
  const name = unwrapAlphabeticName(value);
  return /^[A-Z]'*$/.test(name) ? name : '';
}

function getUsedPointNames(state: DgsState): Set<string> {
  const used = new Set<string>();
  const add = (value: unknown) => {
    const name = normalizeAlphabeticPointName(value);
    if (name) used.add(name);
  };

  const registered = window.__points && window.__points[state.boardId];
  if (registered && typeof registered === 'object') {
    Object.keys(registered).forEach(add);
  }

  const visitPoint = (point: any) => {
    if (!point || typeof point !== 'object') return;
    const type = String(point.elType || '').toLowerCase();
    if (type !== 'point' && type !== 'glider') return;
    add(point.__liaDgsPointName);
    add(point.name);
  };

  const board = state.board;
  if (board && Array.isArray(board.objectsList)) board.objectsList.forEach(visitPoint);
  if (board && board.objects && typeof board.objects === 'object') {
    Object.keys(board.objects).forEach((key) => visitPoint(board.objects[key]));
  }

  return used;
}

function getNextPointName(state: DgsState): string {
  const used = getUsedPointNames(state);
  for (let index = 0; ; index += 1) {
    const letter = String.fromCharCode(65 + (index % 26));
    const name = letter + "'".repeat(Math.floor(index / 26));
    if (!used.has(name)) return name;
  }
}

function getUsedSegmentNames(state: DgsState): Set<string> {
  const used = new Set<string>();
  const visitSegment = (segment: any) => {
    if (!segment || typeof segment !== 'object') return;
    const type = String(segment.elType || '').toLowerCase();
    if (type !== 'segment' && !segment.__liaDgsSegment) return;

    [segment.__liaDgsSegmentName, segment.name].forEach((value) => {
      const name = unwrapAlphabeticName(value);
      if (/^[a-z]'*$/.test(name)) used.add(name);
    });
  };

  const board = state.board;
  if (board && Array.isArray(board.objectsList)) board.objectsList.forEach(visitSegment);
  if (board && board.objects && typeof board.objects === 'object') {
    Object.keys(board.objects).forEach((key) => visitSegment(board.objects[key]));
  }
  return used;
}

function getNextSegmentName(state: DgsState): string {
  const used = getUsedSegmentNames(state);
  for (let index = 0; ; index += 1) {
    const letter = String.fromCharCode(97 + (index % 26));
    const name = letter + "'".repeat(Math.floor(index / 26));
    if (!used.has(name)) return name;
  }
}

function eventTargetsBoardUi(evt: Event): boolean {
  const selector = [
    'button',
    'input',
    'select',
    'textarea',
    'a',
    '[role="button"]',
    '.lia-dgs-menu-clip',
    '.lia-dgs-side-menu-clip',
    '.lia-plot-analyze-panel',
    '.lia-plot-color-menu',
    '.lia-schar-panel',
    '.lia-jxg-resize-handle',
    '.JXG_navigation'
  ].join(',');
  const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [evt.target];

  return path.some((node) => {
    const element = node as Element;
    return !!element && typeof element.matches === 'function' && element.matches(selector);
  });
}

function eventToUserCoordinates(state: DgsState, evt: PointerEvent): { x: number; y: number } | null {
  const board = state.board;
  if (!board || !board.origin || !board.origin.scrCoords) return null;

  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;

  const unitX = Number(board.unitX || 0);
  const unitY = Number(board.unitY || 0);
  if (!Number.isFinite(unitX) || !Number.isFinite(unitY) || Math.abs(unitX) < 1e-12 || Math.abs(unitY) < 1e-12) {
    return null;
  }

  const x = (localX - Number(board.origin.scrCoords[1] || 0)) / unitX;
  const y = (Number(board.origin.scrCoords[2] || 0) - localY) / unitY;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function createDgsPoint(state: DgsState, x: number, y: number): any | null {
  const board = state.board;
  if (!board) return null;

  const name = getNextPointName(state);
  const texName = '\\(' + name + '\\)';
  const labelColor = getNeutralColor();

  try {
    const point = board.create('point', [x, y], {
      name: texName,
      fixed: false,
      withLabel: true,
      showInfobox: false,
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 3,
      face: 'x',
      size: 7,
      label: {
        strokeColor: labelColor,
        fillColor: labelColor,
        fontSize: 24,
        parse: false,
        useMathJax: true
      }
    });

    point.__liaDgsPointName = name;
    point.__liaDgsColor = '#ff00ff';
    point.__liaDgsShowName = true;
    point.__liaDgsShowObject = true;
    point.__liaPointVisual = { color: '#ff00ff', opacity: 1, hasExplicitColor: false };
    window.__points = window.__points || {};
    window.__pointStates = window.__pointStates || {};
    window.__points[state.boardId] = window.__points[state.boardId] || {};
    window.__pointStates[state.boardId] = window.__pointStates[state.boardId] || {};
    window.__points[state.boardId][name] = point;

    const savePosition = () => {
      try {
        window.__pointStates[state.boardId][name] = {
          x: point.X(),
          y: point.Y(),
          fixed: getDgsObjectFixed(point)
        };
      } catch (e) {}
      refreshSideMenusForObject(point);
    };
    try { point.on('drag', savePosition); } catch (e) {}
    try { point.on('up', savePosition); } catch (e) {}
    savePosition();

    try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
    try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
    try { if (typeof board.update === 'function') board.update(); } catch (e) {}
    return point;
  } catch (e) {
    return null;
  }
}

function getSelectableBoardPoints(state: DgsState): any[] {
  const points: any[] = [];
  const seen = new Set<any>();
  const add = (point: any) => {
    if (!point || typeof point !== 'object' || seen.has(point)) return;
    const type = String(point.elType || '').toLowerCase();
    if (type !== 'point' && type !== 'glider') return;

    try {
      if (point.visPropCalc && point.visPropCalc.visible === false) return;
      if (point.visProp && point.visProp.visible === false) return;
      if (typeof point.evalVisProp === 'function' && point.evalVisProp('visible') === false) return;
    } catch (e) {}

    let x = NaN;
    let y = NaN;
    try {
      if (typeof point.X === 'function' && typeof point.Y === 'function') {
        x = Number(point.X());
        y = Number(point.Y());
      }
    } catch (e) {}
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    seen.add(point);
    points.push(point);
  };

  const registered = window.__points && window.__points[state.boardId];
  if (registered && typeof registered === 'object') {
    Object.keys(registered).forEach((name) => add(registered[name]));
  }

  const board = state.board;
  if (board && Array.isArray(board.objectsList)) board.objectsList.forEach(add);
  if (board && board.objects && typeof board.objects === 'object') {
    Object.keys(board.objects).forEach((key) => add(board.objects[key]));
  }
  return points;
}

function findNearestBoardPoint(
  state: DgsState,
  evt: MouseEvent | PointerEvent,
  maxDistancePx = 16,
  predicate?: (point: any) => boolean
): any | null {
  const board = state.board;
  if (!board || !board.origin || !board.origin.scrCoords) return null;

  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  const originX = Number(board.origin.scrCoords[1] || 0);
  const originY = Number(board.origin.scrCoords[2] || 0);
  const unitX = Number(board.unitX || 0);
  const unitY = Number(board.unitY || 0);
  if (!Number.isFinite(unitX) || !Number.isFinite(unitY)) return null;

  let nearest: any | null = null;
  let nearestDistance = maxDistancePx;
  getSelectableBoardPoints(state).forEach((point) => {
    if (predicate && !predicate(point)) return;
    let x = NaN;
    let y = NaN;
    try {
      x = Number(point.X());
      y = Number(point.Y());
    } catch (e) {}
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const dx = originX + x * unitX - localX;
    const dy = originY - y * unitY - localY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function setSelectedSegmentPoint(state: DgsState, point: any | null): void {
  const previousNode = state.selectedSegmentPoint && state.selectedSegmentPoint.rendNode;
  try { if (previousNode && previousNode.classList) previousNode.classList.remove('lia-dgs-segment-endpoint'); } catch (e) {}

  state.selectedSegmentPoint = point || null;
  const nextNode = state.selectedSegmentPoint && state.selectedSegmentPoint.rendNode;
  try { if (nextNode && nextNode.classList) nextNode.classList.add('lia-dgs-segment-endpoint'); } catch (e) {}
}

function styleDgsSegments(state: DgsState): void {
  const seen = new Set<any>();
  const style = (segment: any) => {
    if (!segment || typeof segment !== 'object' || seen.has(segment) || !segment.__liaDgsSegment) return;
    seen.add(segment);
    const color = normalizeHexColor(segment.__liaDgsColor) || '#ff00ff';
    try {
      segment.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color,
        label: {
          strokeColor: color,
          fillColor: color
        }
      });
    } catch (e) {}
    try {
      if (segment.label && typeof segment.label.setAttribute === 'function') {
        segment.label.setAttribute({ strokeColor: color, fillColor: color });
      }
    } catch (e) {}
  };

  const board = state.board;
  if (board && Array.isArray(board.objectsList)) board.objectsList.forEach(style);
  if (board && board.objects && typeof board.objects === 'object') {
    Object.keys(board.objects).forEach((key) => style(board.objects[key]));
  }
}

function createDgsSegment(state: DgsState, point1: any, point2: any): any | null {
  if (!state.board || !point1 || !point2 || point1 === point2) return null;

  const name = getNextSegmentName(state);
  try {
    const segment = state.board.create('segment', [point1, point2], {
      name: '\\(' + name + '\\)',
      withLabel: true,
      fixed: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });
    segment.__liaDgsSegment = true;
    segment.__liaDgsSegmentName = name;
    segment.__liaDgsColor = '#ff00ff';
    segment.__liaDgsShowName = true;
    segment.__liaDgsShowObject = true;
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return segment;
  } catch (e) {
    return null;
  }
}

function findDgsContextObject(state: DgsState, evt: MouseEvent): any | null {
  const point = findNearestBoardPoint(
    state,
    evt,
    18,
    (candidate) => !!candidate.__liaDgsPointName
  );
  if (point) return point;

  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  const candidates: any[] = [];
  const seen = new Set<any>();
  const add = (segment: any) => {
    if (!segment || typeof segment !== 'object' || seen.has(segment) || !segment.__liaDgsSegment) return;
    seen.add(segment);
    candidates.push(segment);
  };
  if (state.board && Array.isArray(state.board.objectsList)) state.board.objectsList.forEach(add);
  if (state.board && state.board.objects && typeof state.board.objects === 'object') {
    Object.keys(state.board.objects).forEach((key) => add(state.board.objects[key]));
  }

  let nearest: any | null = null;
  let nearestDistance = 10;
  candidates.forEach((segment) => {
    try {
      if (typeof segment.hasPoint === 'function' && segment.hasPoint(localX, localY)) {
        nearest = segment;
        nearestDistance = 0;
        return;
      }
    } catch (e) {}

    const p1 = segment.point1;
    const p2 = segment.point2;
    if (!p1 || !p2 || typeof p1.X !== 'function' || typeof p2.X !== 'function') return;
    const board = state.board;
    const x1 = Number(board.origin.scrCoords[1]) + Number(p1.X()) * Number(board.unitX);
    const y1 = Number(board.origin.scrCoords[2]) - Number(p1.Y()) * Number(board.unitY);
    const x2 = Number(board.origin.scrCoords[1]) + Number(p2.X()) * Number(board.unitX);
    const y2 = Number(board.origin.scrCoords[2]) - Number(p2.Y()) * Number(board.unitY);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    const ratio = lengthSq > 1e-12
      ? Math.max(0, Math.min(1, ((localX - x1) * dx + (localY - y1) * dy) / lengthSq))
      : 0;
    const px = x1 + ratio * dx;
    const py = y1 + ratio * dy;
    const distance = Math.hypot(localX - px, localY - py);
    if (distance <= nearestDistance) {
      nearest = segment;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function isDgsPoint(object: any): boolean {
  return !!object && !!object.__liaDgsPointName;
}

function getDgsObjectName(object: any): string {
  return String(
    (isDgsPoint(object) ? object.__liaDgsPointName : object && object.__liaDgsSegmentName) || ''
  );
}

function getDgsObjectFixed(object: any): boolean {
  try {
    if (object && typeof object.getAttribute === 'function') return !!object.getAttribute('fixed');
  } catch (e) {}
  try { return !!(object && object.visProp && object.visProp.fixed); } catch (e) { return false; }
}

function setDgsObjectFixed(object: any, fixed: boolean): void {
  try { if (object && typeof object.setAttribute === 'function') object.setAttribute({ fixed }); } catch (e) {}
}

function setDgsObjectNameVisible(object: any, visible: boolean): void {
  if (!object) return;
  object.__liaDgsShowName = visible;
  try {
    if (object.label && typeof object.label.setAttribute === 'function') {
      object.label.setAttribute({ visible });
      if (visible && typeof object.label.showElement === 'function') object.label.showElement();
      if (!visible && typeof object.label.hideElement === 'function') object.label.hideElement();
    }
  } catch (e) {}
}

function setDgsObjectVisible(object: any, visible: boolean): void {
  if (!object) return;
  object.__liaDgsShowObject = visible;
  const opacity = visible ? 1 : 0;
  try {
    object.setAttribute({
      strokeOpacity: opacity,
      fillOpacity: opacity,
      highlightStrokeOpacity: opacity,
      highlightFillOpacity: opacity
    });
  } catch (e) {}
}

function normalizeHexColor(value: unknown): string | null {
  const raw = String(value == null ? '' : value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return '#' + raw.split('').map((char) => char + char).join('').toLowerCase();
  }
  return /^[0-9a-f]{6}$/i.test(raw) ? '#' + raw.toLowerCase() : null;
}

function hexToHsv(colorValue: unknown): { h: number; s: number; v: number } | null {
  const color = normalizeHexColor(colorValue);
  if (!color) return null;
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 1e-12) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max > 1e-12 ? delta / max : 0, v: max };
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  const h = ((Number(hue) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, Number(saturation) || 0));
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - chroma;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = chroma; g = x; }
  else if (h < 120) { r = x; g = chroma; }
  else if (h < 180) { g = chroma; b = x; }
  else if (h < 240) { g = x; b = chroma; }
  else if (h < 300) { r = x; b = chroma; }
  else { r = chroma; b = x; }
  const channel = (number: number) => Math.round((number + m) * 255).toString(16).padStart(2, '0');
  return '#' + channel(r) + channel(g) + channel(b);
}

function syncColorPicker(state: DgsState, colorValue: unknown): void {
  const color = normalizeHexColor(colorValue) || '#ff00ff';
  const hsv = hexToHsv(color) || { h: 300, s: 1, v: 1 };
  state.colorHue = hsv.h;
  state.colorSaturation = hsv.s;
  state.colorValue = hsv.v;
  state.colorPalette.style.setProperty('--lia-dgs-picker-hue', hsv.h.toFixed(2) + 'deg');
  state.colorPaletteCursor.style.left = (hsv.s * 100).toFixed(2) + '%';
  state.colorPaletteCursor.style.top = ((1 - hsv.v) * 100).toFixed(2) + '%';
  state.colorHueInput.value = String(Math.round(hsv.h));
  state.colorPreview.style.background = color;
  state.colorHexInput.value = color;
  state.colorHexInput.setAttribute('aria-invalid', 'false');
}

function applyPickerColor(state: DgsState): string | null {
  if (!state.contextObject) return null;
  const color = hsvToHex(state.colorHue, state.colorSaturation, state.colorValue);
  const applied = setDgsObjectColor(state.contextObject, color);
  if (!applied) return null;
  state.colorPalette.style.setProperty('--lia-dgs-picker-hue', state.colorHue.toFixed(2) + 'deg');
  state.colorPaletteCursor.style.left = (state.colorSaturation * 100).toFixed(2) + '%';
  state.colorPaletteCursor.style.top = ((1 - state.colorValue) * 100).toFixed(2) + '%';
  state.colorHueInput.value = String(Math.round(state.colorHue));
  state.colorPreview.style.background = applied;
  state.colorHexInput.value = applied;
  state.colorHexInput.setAttribute('aria-invalid', 'false');
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  return applied;
}

function getDgsObjectColor(object: any): string {
  return normalizeHexColor(object && object.__liaDgsColor) || '#ff00ff';
}

function setDgsObjectColor(object: any, colorValue: unknown): string | null {
  const color = normalizeHexColor(colorValue);
  if (!object || !color) return null;
  object.__liaDgsColor = color;

  try {
    object.setAttribute({
      strokeColor: color,
      fillColor: color,
      highlightStrokeColor: color,
      highlightFillColor: color,
      label: { strokeColor: color, fillColor: color }
    });
  } catch (e) {}
  try {
    if (object.label && typeof object.label.setAttribute === 'function') {
      object.label.setAttribute({ strokeColor: color, fillColor: color });
    }
  } catch (e) {}

  if (isDgsPoint(object)) {
    const visual = object.__liaPointVisual || {};
    object.__liaPointVisual = {
      color,
      opacity: Number.isFinite(Number(visual.opacity)) ? Number(visual.opacity) : 1,
      hasExplicitColor: true
    };
  }
  return color;
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return '';
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return normalized.toFixed(6).replace(/\.?0+$/, '');
}

function refreshSideMenuCoordinates(state: DgsState): void {
  const point = state.contextObject;
  if (!isDgsPoint(point)) return;
  let x = NaN;
  let y = NaN;
  try {
    x = Number(point.X());
    y = Number(point.Y());
  } catch (e) {}
  if (document.activeElement !== state.xCoordinateInput) state.xCoordinateInput.value = formatCoordinate(x);
  if (document.activeElement !== state.yCoordinateInput) state.yCoordinateInput.value = formatCoordinate(y);
}

function refreshSideMenusForObject(object: any): void {
  Object.keys(states).forEach((uid) => {
    const state = states[uid];
    if (state && state.contextObject === object) refreshSideMenuCoordinates(state);
  });
}

function parseCoordinateInput(input: HTMLInputElement): number | null {
  const raw = String(input.value || '').trim();
  const value = Number(raw.replace(',', '.'));
  const valid = raw !== '' && Number.isFinite(value);
  input.setAttribute('aria-invalid', valid ? 'false' : 'true');
  return valid ? value : null;
}

function applyCoordinateInputs(state: DgsState): boolean {
  const point = state.contextObject;
  if (!isDgsPoint(point)) return false;
  const x = parseCoordinateInput(state.xCoordinateInput);
  const y = parseCoordinateInput(state.yCoordinateInput);
  if (x == null || y == null) return false;

  let moved = false;
  try {
    if (typeof point.setPositionDirectly === 'function' && typeof JXG !== 'undefined') {
      point.setPositionDirectly(JXG.COORDS_BY_USER, [x, y]);
      moved = true;
    } else if (typeof point.moveTo === 'function') {
      point.moveTo([x, y], 0);
      moved = true;
    }
  } catch (e) {}
  if (!moved) return false;

  try {
    if (window.__pointStates && window.__pointStates[state.boardId]) {
      window.__pointStates[state.boardId][String(point.__liaDgsPointName || '')] = {
        x,
        y,
        fixed: getDgsObjectFixed(point)
      };
    }
  } catch (e) {}
  try { if (state.board && typeof state.board.fullUpdate === 'function') state.board.fullUpdate(); } catch (e) {
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e2) {}
  }
  refreshSideMenuCoordinates(state);
  return true;
}

function updateSideMenuControls(state: DgsState, object: any): void {
  const point = isDgsPoint(object);
  const name = getDgsObjectName(object);
  state.contextObject = object;
  state.sideMenuTitle.innerHTML = (point ? 'Punkt ' : 'Strecke ') + '\\(' + name + '\\)';
  state.fixedCheckbox.checked = getDgsObjectFixed(object);
  state.nameCheckbox.checked = object.__liaDgsShowName !== false;
  state.objectCheckbox.checked = object.__liaDgsShowObject !== false;
  state.objectCheckboxText.textContent = point ? 'Punkt anzeigen' : 'Strecke anzeigen';
  state.coordinateSection.hidden = !point;
  if (point) refreshSideMenuCoordinates(state);
  const color = getDgsObjectColor(object);
  syncColorPicker(state, color);
  typesetDgsMath(state.sideMenuTitle);
}

function notifyRegressionLayout(state: DgsState, dgsOpen?: boolean): void {
  try {
    if (typeof window.__relayoutRegressionForBoard === 'function') {
      window.__relayoutRegressionForBoard(state.boardId, dgsOpen);
    }
  } catch (e) {}
}

function refreshConstructionModeCursor(boardContainer: HTMLElement): void {
  const active = Object.keys(states).some((uid) => {
    const state = states[uid];
    return !!state && state.boardContainer === boardContainer && state.activeTool !== '';
  });
  boardContainer.classList.toggle('lia-dgs-construction-mode', active);
}

function renderToolState(state: DgsState): void {
  const pointActive = state.activeTool === 'point';
  const segmentActive = state.activeTool === 'segment';
  state.pointButton.classList.toggle('is-active', pointActive);
  state.pointButton.setAttribute('aria-pressed', pointActive ? 'true' : 'false');
  state.pointButton.setAttribute('aria-label', pointActive ? 'Punktmodus beenden' : 'Punkt setzen');
  state.pointButton.title = pointActive ? 'Punktmodus beenden' : 'Punkt setzen';
  state.segmentButton.classList.toggle('is-active', segmentActive);
  state.segmentButton.setAttribute('aria-pressed', segmentActive ? 'true' : 'false');
  state.segmentButton.setAttribute('aria-label', segmentActive ? 'Streckenmodus beenden' : 'Strecke zeichnen');
  state.segmentButton.title = segmentActive ? 'Streckenmodus beenden' : 'Strecke zeichnen';
  refreshConstructionModeCursor(state.boardContainer);
}

function setActiveTool(
  state: DgsState,
  tool: '' | 'point' | 'segment',
  deactivateRegression = true
): void {
  if (tool) {
    Object.keys(states).forEach((uid) => {
      const other = states[uid];
      if (!other || other === state || other.boardId !== state.boardId || !other.activeTool) return;
      setSelectedSegmentPoint(other, null);
      other.activeTool = '';
      renderToolState(other);
    });
    if (deactivateRegression) notifyRegressionLayout(state, false);
  }

  if (state.activeTool === 'segment' && tool !== 'segment') setSelectedSegmentPoint(state, null);
  state.activeTool = tool;
  renderToolState(state);
}

function releaseRegressionControls(state: DgsState): void {
  state.menuBar
    .querySelectorAll<HTMLElement>('.lia-plot-draw-btn, .lia-plot-erase-toggle, .lia-plot-regression-toggle')
    .forEach((button) => state.boardContainer.appendChild(button));
}

function applyLayout(state: DgsState): void {
  const tone = getNeutralColor();
  const accent = getAccentColor();
  const menuBackground = tone === '#fff' ? '#151a1c' : '#fff';

  state.button.style.color = tone;
  state.menuBar.style.color = tone;
  state.sideMenu.style.color = tone;
  state.menuBar.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.menuBar.style.setProperty('--lia-dgs-theme-color', accent);
  state.sideMenu.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.sideMenu.style.setProperty('--lia-dgs-theme-color', accent);
  state.boardContainer.style.setProperty('--lia-dgs-theme-color', accent);
  styleDgsSegments(state);
  if (state.axisAdjusted) scheduleAxisSync(state);
  if (state.xAxisAdjusted) scheduleXAxisSync(state);
  notifyRegressionLayout(state);
  state.regressionDivider.dataset.visible = state.menuBar.querySelector('.lia-plot-draw-btn') ? '1' : '0';
}

function readAxisStraightLast(axis: any): boolean {
  if (!axis) return true;
  if (typeof axis.evalVisProp === 'function') {
    try { return !!axis.evalVisProp('straightlast'); } catch (e) {}
  }
  if (axis.visProp && typeof axis.visProp.straightlast !== 'undefined') {
    return !!axis.visProp.straightlast;
  }
  return true;
}

function readAxisPoint2(axis: any): number[] | null {
  const original = axis && axis._point2UsrCoordsOrg;
  if (Array.isArray(original) && original.length >= 3) return original.slice(0, 3);

  const current = axis && axis.point2 && axis.point2.coords && axis.point2.coords.usrCoords;
  if (Array.isArray(current) && current.length >= 3) return current.slice(0, 3);
  return null;
}

function setAxisPoint2(axis: any, homogeneous: number[]): void {
  if (!axis || !axis.point2 || !Array.isArray(homogeneous) || homogeneous.length < 3) return;
  const z = Number(homogeneous[0]) || 1;
  const coords = [Number(homogeneous[1]) / z, Number(homogeneous[2]) / z];

  try {
    if (typeof axis.point2.setPositionDirectly === 'function' && typeof JXG !== 'undefined') {
      axis.point2.setPositionDirectly(JXG.COORDS_BY_USER, coords);
    } else if (typeof axis.point2.setPosition === 'function' && typeof JXG !== 'undefined') {
      axis.point2.setPosition(JXG.COORDS_BY_USER, coords);
    }
  } catch (e) {}
}

function updateBoardForAxis(state: DgsState): void {
  if (!state.board || state.axisSyncing) return;
  state.axisSyncing = true;
  try {
    if (state.xAxis) state.xAxis.needsUpdate = true;
    if (state.xAxis && state.xAxis.point2) state.xAxis.point2.needsUpdate = true;
    if (state.xAxis && state.xAxis.defaultTicks) state.xAxis.defaultTicks.needsUpdate = true;
    if (state.yAxis) state.yAxis.needsUpdate = true;
    if (state.yAxis && state.yAxis.point2) state.yAxis.point2.needsUpdate = true;
    if (state.yAxis && state.yAxis.defaultTicks) state.yAxis.defaultTicks.needsUpdate = true;
    if (typeof state.board.fullUpdate === 'function') state.board.fullUpdate();
    else if (typeof state.board.update === 'function') state.board.update();
  } catch (e) {
  } finally {
    state.axisSyncing = false;
  }
}

function currentMenuInset(state: DgsState): number {
  try {
    const boardRect = state.boardContainer.getBoundingClientRect();
    const menuRect = state.menuBar.getBoundingClientRect();
    const canvasTop = boardRect.top + (state.boardContainer.clientTop || 0);
    return Math.max(0, Math.min(MENU_HEIGHT_PX, menuRect.bottom - canvasTop));
  } catch (e) {
    return state.open ? MENU_HEIGHT_PX : 0;
  }
}

function applyAxisInset(state: DgsState, insetPx: number): void {
  const axis = state.yAxis;
  const original = state.axisOriginalPoint2;
  if (!axis || !original || !state.board) return;

  let bbox: number[];
  try { bbox = state.board.getBoundingBox(); } catch (e) { return; }
  if (!Array.isArray(bbox) || bbox.length < 4) return;

  const unitY = Math.max(1e-9, Math.abs(Number(state.board.unitY) || 1));
  const z = Number(original[0]) || 1;
  const x = Number(original[1]) / z;
  const y = Number(bbox[1]) - Math.max(0, insetPx) / unitY;
  const endpoint = [1, x, y];

  axis._point2UsrCoordsOrg = endpoint.slice();
  setAxisPoint2(axis, endpoint);

  if (!state.axisAdjusted) {
    state.axisAdjusted = true;
    try { axis.setAttribute({ straightLast: false }); } catch (e) {
      if (axis.visProp) axis.visProp.straightlast = false;
    }
  }

  updateBoardForAxis(state);
}

function restoreAxis(state: DgsState): void {
  const axis = state.yAxis;
  const original = state.axisOriginalPoint2;
  if (!state.axisAdjusted || !axis || !original) return;

  axis._point2UsrCoordsOrg = original.slice();
  setAxisPoint2(axis, original);
  try { axis.setAttribute({ straightLast: state.axisOriginalStraightLast }); } catch (e) {
    if (axis.visProp) axis.visProp.straightlast = state.axisOriginalStraightLast;
  }
  state.axisAdjusted = false;
  updateBoardForAxis(state);
}

function scheduleAxisSync(state: DgsState): void {
  if (!state.axisAdjusted || state.axisAnimationRAF || state.axisSyncRAF) return;
  state.axisSyncRAF = requestAnimationFrame(() => {
    state.axisSyncRAF = 0;
    if (state.axisAdjusted) applyAxisInset(state, currentMenuInset(state));
  });
}

function trackAxisWithMenu(state: DgsState): void {
  if (!state.yAxis || !state.axisOriginalPoint2) return;
  if (state.axisAnimationRAF) cancelAnimationFrame(state.axisAnimationRAF);
  if (state.axisSyncRAF) {
    cancelAnimationFrame(state.axisSyncRAF);
    state.axisSyncRAF = 0;
  }

  if (state.open && !state.axisAdjusted) {
    applyAxisInset(state, currentMenuInset(state));
  }

  const startedAt = performance.now();
  const frame = (now: number) => {
    state.axisAnimationRAF = 0;
    if (state.axisAdjusted) applyAxisInset(state, currentMenuInset(state));

    if (now - startedAt < MENU_TRANSITION_MS + 80) {
      state.axisAnimationRAF = requestAnimationFrame(frame);
      return;
    }

    if (state.open) applyAxisInset(state, MENU_HEIGHT_PX);
    else restoreAxis(state);
  };

  state.axisAnimationRAF = requestAnimationFrame(frame);
}

function currentSideMenuInset(state: DgsState): number {
  try {
    const boardRect = state.boardContainer.getBoundingClientRect();
    const menuRect = state.sideMenu.getBoundingClientRect();
    const canvasRight = boardRect.left + (state.boardContainer.clientLeft || 0) + state.boardContainer.clientWidth;
    return Math.max(0, Math.min(SIDE_MENU_WIDTH_PX, canvasRight - menuRect.left));
  } catch (e) {
    return state.sideMenuOpen ? SIDE_MENU_WIDTH_PX : 0;
  }
}

function applyXAxisInset(state: DgsState, insetPx: number): void {
  const axis = state.xAxis;
  const original = state.xAxisOriginalPoint2;
  if (!axis || !original || !state.board) return;

  let bbox: number[];
  try { bbox = state.board.getBoundingBox(); } catch (e) { return; }
  if (!Array.isArray(bbox) || bbox.length < 4) return;

  const unitX = Math.max(1e-9, Math.abs(Number(state.board.unitX) || 1));
  const z = Number(original[0]) || 1;
  const x = Number(bbox[2]) - Math.max(0, insetPx) / unitX;
  const y = Number(original[2]) / z;
  const endpoint = [1, x, y];

  axis._point2UsrCoordsOrg = endpoint.slice();
  setAxisPoint2(axis, endpoint);
  if (!state.xAxisAdjusted) {
    state.xAxisAdjusted = true;
    try { axis.setAttribute({ straightLast: false }); } catch (e) {
      if (axis.visProp) axis.visProp.straightlast = false;
    }
  }
  updateBoardForAxis(state);
}

function restoreXAxis(state: DgsState): void {
  const axis = state.xAxis;
  const original = state.xAxisOriginalPoint2;
  if (!state.xAxisAdjusted || !axis || !original) return;

  axis._point2UsrCoordsOrg = original.slice();
  setAxisPoint2(axis, original);
  try { axis.setAttribute({ straightLast: state.xAxisOriginalStraightLast }); } catch (e) {
    if (axis.visProp) axis.visProp.straightlast = state.xAxisOriginalStraightLast;
  }
  state.xAxisAdjusted = false;
  updateBoardForAxis(state);
}

function scheduleXAxisSync(state: DgsState): void {
  if (!state.xAxisAdjusted || state.xAxisAnimationRAF || state.xAxisSyncRAF) return;
  state.xAxisSyncRAF = requestAnimationFrame(() => {
    state.xAxisSyncRAF = 0;
    if (state.xAxisAdjusted) applyXAxisInset(state, currentSideMenuInset(state));
  });
}

function trackXAxisWithSideMenu(state: DgsState): void {
  if (!state.xAxis || !state.xAxisOriginalPoint2) return;
  if (state.xAxisAnimationRAF) cancelAnimationFrame(state.xAxisAnimationRAF);
  if (state.xAxisSyncRAF) {
    cancelAnimationFrame(state.xAxisSyncRAF);
    state.xAxisSyncRAF = 0;
  }

  if (state.sideMenuOpen && !state.xAxisAdjusted) {
    applyXAxisInset(state, currentSideMenuInset(state));
  }

  const startedAt = performance.now();
  const frame = (now: number) => {
    state.xAxisAnimationRAF = 0;
    if (state.xAxisAdjusted) applyXAxisInset(state, currentSideMenuInset(state));

    if (now - startedAt < MENU_TRANSITION_MS + 80) {
      state.xAxisAnimationRAF = requestAnimationFrame(frame);
      return;
    }

    if (state.sideMenuOpen) applyXAxisInset(state, SIDE_MENU_WIDTH_PX);
    else restoreXAxis(state);
  };
  state.xAxisAnimationRAF = requestAnimationFrame(frame);
}

function setSideMenuOpen(state: DgsState, open: boolean): void {
  const changed = state.sideMenuOpen !== open;
  state.sideMenuOpen = open;
  state.sideMenu.dataset.open = open ? '1' : '0';
  state.sideMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.sideMenuCloseButton.tabIndex = open ? 0 : -1;
  const coordinatesAvailable = open && !state.coordinateSection.hidden;
  state.xCoordinateInput.tabIndex = coordinatesAvailable ? 0 : -1;
  state.yCoordinateInput.tabIndex = coordinatesAvailable ? 0 : -1;
  state.fixedCheckbox.tabIndex = open ? 0 : -1;
  state.nameCheckbox.tabIndex = open ? 0 : -1;
  state.objectCheckbox.tabIndex = open ? 0 : -1;
  state.colorPalette.tabIndex = open ? 0 : -1;
  state.colorHueInput.tabIndex = open ? 0 : -1;
  state.colorHexInput.tabIndex = open ? 0 : -1;
  if (!open) state.contextObject = null;
  if (changed) trackXAxisWithSideMenu(state);
}

function setMenuOpen(state: DgsState, open: boolean): void {
  const changed = state.open !== open;
  state.open = open;
  state.menuBar.dataset.open = open ? '1' : '0';
  state.menuBar.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.button.setAttribute('aria-expanded', open ? 'true' : 'false');
  state.button.classList.toggle('is-active', open);
  state.sideMenu.dataset.topOpen = open ? '1' : '0';
  state.pointButton.tabIndex = open ? 0 : -1;
  state.segmentButton.tabIndex = open ? 0 : -1;
  if (changed) trackAxisWithMenu(state);
  if (changed) notifyRegressionLayout(state, open);
}

function setupDGS(uid: string, boardId: string): void {
  if (!uid || !boardId) return;

  const boardContainer = getBoardContainer(boardId);
  if (!boardContainer) {
    const retries = (pendingRetries[uid] || 0) + 1;
    pendingRetries[uid] = retries;

    if (retries <= MAX_RETRIES) {
      window.setTimeout(() => setupDGS(uid, boardId), RETRY_DELAY_MS);
    }
    return;
  }

  pendingRetries[uid] = 0;

  const anchor = document.getElementById(`dgs-ui-${uid}`);
  if (anchor) {
    anchor.style.display = 'none';
    anchor.setAttribute('aria-hidden', 'true');
  }

  const rootNode = (boardContainer.getRootNode && boardContainer.getRootNode()) || document;
  ensureStyles(rootNode as Document | ShadowRoot);

  const existing = states[uid];
  if (
    existing &&
    existing.boardContainer === boardContainer &&
    existing.button.isConnected &&
    !!existing.menuClip?.isConnected &&
    !!existing.menuBar?.isConnected &&
    !!existing.sideMenuClip?.isConnected &&
    !!existing.sideMenu?.isConnected &&
    !!existing.toolsDivider?.isConnected &&
    !!existing.pointButton?.isConnected &&
    !!existing.segmentButton?.isConnected &&
    !!existing.regressionDivider?.isConnected &&
    typeof existing.onBoardPointerDown === 'function' &&
    typeof existing.onBoardContextMenu === 'function'
  ) {
    applyLayout(existing);
    return;
  }

  if (existing) {
    setActiveTool(existing, '', false);
    if (existing.axisAnimationRAF) cancelAnimationFrame(existing.axisAnimationRAF);
    if (existing.axisSyncRAF) cancelAnimationFrame(existing.axisSyncRAF);
    if (existing.xAxisAnimationRAF) cancelAnimationFrame(existing.xAxisAnimationRAF);
    if (existing.xAxisSyncRAF) cancelAnimationFrame(existing.xAxisSyncRAF);
    restoreAxis(existing);
    restoreXAxis(existing);
    if (existing.onBoardViewportChange && existing.board && typeof existing.board.off === 'function') {
      try { existing.board.off('move', existing.onBoardViewportChange); } catch (e) {}
      try { existing.board.off('boundingbox', existing.onBoardViewportChange); } catch (e) {}
    }
    if (existing.onBoardPointerDown) {
      existing.boardContainer.removeEventListener('pointerdown', existing.onBoardPointerDown, true);
    }
    if (existing.onBoardContextMenu) {
      existing.boardContainer.removeEventListener('contextmenu', existing.onBoardContextMenu, true);
    }
    if (existing.resizeObserver) existing.resizeObserver.disconnect();
    releaseRegressionControls(existing);
    try { existing.button.remove(); } catch (e) {}
    try { existing.menuClip.remove(); } catch (e) {}
    try { existing.sideMenuClip.remove(); } catch (e) {}
  }

  const menuClip = document.createElement('div');
  menuClip.className = 'lia-dgs-menu-clip';

  const menuBar = document.createElement('div');
  menuBar.id = `dgs-menu-${uid}`;
  menuBar.className = 'lia-dgs-top-menu';
  menuBar.setAttribute('role', 'navigation');
  menuBar.setAttribute('aria-label', 'DGS-Menüleiste');

  const toolsDivider = document.createElement('span');
  toolsDivider.className = 'lia-dgs-tools-divider';
  toolsDivider.setAttribute('aria-hidden', 'true');
  menuBar.appendChild(toolsDivider);

  const pointButton = document.createElement('button');
  pointButton.type = 'button';
  pointButton.className = 'lia-dgs-geometry-button lia-dgs-point-button';
  pointButton.setAttribute('aria-label', 'Punkt setzen');
  pointButton.setAttribute('aria-pressed', 'false');
  pointButton.title = 'Punkt setzen';
  pointButton.innerHTML = '<span class="lia-dgs-point-symbol" aria-hidden="true"><svg viewBox="0 0 8 8"><path class="lia-dgs-cross" d="M2 2l4 4M6 2L2 6"></path></svg><span class="lia-dgs-point-label">\\(A\\)</span></span>';
  pointButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(pointButton);

  const segmentButton = document.createElement('button');
  segmentButton.type = 'button';
  segmentButton.className = 'lia-dgs-geometry-button lia-dgs-segment-button';
  segmentButton.setAttribute('aria-label', 'Strecke zeichnen');
  segmentButton.setAttribute('aria-pressed', 'false');
  segmentButton.title = 'Strecke zeichnen';
  segmentButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16L18 8"></path><path class="lia-dgs-cross" d="M4.5 14.5l3 3M7.5 14.5l-3 3M16.5 6.5l3 3M19.5 6.5l-3 3"></path></svg>';
  segmentButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(segmentButton);

  const regressionDivider = document.createElement('span');
  regressionDivider.className = 'lia-dgs-regression-divider';
  regressionDivider.setAttribute('aria-hidden', 'true');
  regressionDivider.dataset.visible = '0';
  menuBar.appendChild(regressionDivider);
  menuClip.appendChild(menuBar);

  const sideMenuClip = document.createElement('div');
  sideMenuClip.className = 'lia-dgs-side-menu-clip';

  const sideMenu = document.createElement('div');
  sideMenu.id = `dgs-side-menu-${uid}`;
  sideMenu.className = 'lia-dgs-side-menu';
  sideMenu.setAttribute('role', 'dialog');
  sideMenu.setAttribute('aria-label', 'DGS-Objekteigenschaften');

  const sideMenuHeader = document.createElement('div');
  sideMenuHeader.className = 'lia-dgs-side-menu-header';
  const sideMenuTitle = document.createElement('div');
  sideMenuTitle.className = 'lia-dgs-side-menu-title';
  const sideMenuCloseButton = document.createElement('button');
  sideMenuCloseButton.type = 'button';
  sideMenuCloseButton.className = 'lia-dgs-side-menu-close';
  sideMenuCloseButton.setAttribute('aria-label', 'Eigenschaften schließen');
  sideMenuCloseButton.textContent = '×';
  sideMenuHeader.appendChild(sideMenuTitle);
  sideMenuHeader.appendChild(sideMenuCloseButton);
  sideMenu.appendChild(sideMenuHeader);

  const coordinateSection = document.createElement('div');
  coordinateSection.className = 'lia-dgs-coordinate-section';
  const coordinateTitle = document.createElement('div');
  coordinateTitle.className = 'lia-dgs-context-section-title';
  coordinateTitle.textContent = 'Koordinaten';
  const coordinateRow = document.createElement('div');
  coordinateRow.className = 'lia-dgs-coordinate-row';
  const makeCoordinateField = (axis: string) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-coordinate-field';
    const caption = document.createElement('span');
    caption.textContent = axis + ':';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'lia-dgs-coordinate-input';
    input.setAttribute('aria-label', axis + '-Koordinate');
    input.setAttribute('aria-invalid', 'false');
    label.appendChild(caption);
    label.appendChild(input);
    coordinateRow.appendChild(label);
    return input;
  };
  const xCoordinateInput = makeCoordinateField('x');
  const yCoordinateInput = makeCoordinateField('y');
  coordinateSection.appendChild(coordinateTitle);
  coordinateSection.appendChild(coordinateRow);
  sideMenu.appendChild(coordinateSection);

  const makeContextOption = (text: string) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-context-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const caption = document.createElement('span');
    caption.textContent = text;
    label.appendChild(input);
    label.appendChild(caption);
    sideMenu.appendChild(label);
    return { input, caption };
  };
  const fixedOption = makeContextOption('Fixieren');
  const nameOption = makeContextOption('Name anzeigen');
  const objectOption = makeContextOption('Punkt anzeigen');

  const colorSection = document.createElement('div');
  colorSection.className = 'lia-dgs-color-section';
  const colorTitle = document.createElement('div');
  colorTitle.className = 'lia-dgs-context-section-title';
  colorTitle.textContent = 'Farbauswahl';
  const colorPalette = document.createElement('div');
  colorPalette.className = 'lia-dgs-color-palette';
  colorPalette.tabIndex = 0;
  colorPalette.setAttribute('role', 'application');
  colorPalette.setAttribute('aria-label', 'Sättigung und Helligkeit auswählen');
  const colorPaletteCursor = document.createElement('span');
  colorPaletteCursor.className = 'lia-dgs-color-cursor';
  colorPalette.setAttribute('aria-hidden', 'false');
  colorPalette.appendChild(colorPaletteCursor);
  const colorHueInput = document.createElement('input');
  colorHueInput.type = 'range';
  colorHueInput.className = 'lia-dgs-color-hue';
  colorHueInput.min = '0';
  colorHueInput.max = '360';
  colorHueInput.step = '1';
  colorHueInput.value = '300';
  colorHueInput.setAttribute('aria-label', 'Farbton');
  const colorRow = document.createElement('div');
  colorRow.className = 'lia-dgs-color-row';
  const colorPreview = document.createElement('span');
  colorPreview.className = 'lia-dgs-color-preview';
  colorPreview.setAttribute('aria-hidden', 'true');
  const colorHexInput = document.createElement('input');
  colorHexInput.type = 'text';
  colorHexInput.className = 'lia-dgs-color-hex';
  colorHexInput.value = '#ff00ff';
  colorHexInput.maxLength = 7;
  colorHexInput.spellcheck = false;
  colorHexInput.setAttribute('aria-label', 'Objektfarbe als Hexwert');
  colorHexInput.setAttribute('aria-invalid', 'false');
  colorRow.appendChild(colorPreview);
  colorRow.appendChild(colorHexInput);
  colorSection.appendChild(colorTitle);
  colorSection.appendChild(colorPalette);
  colorSection.appendChild(colorHueInput);
  colorSection.appendChild(colorRow);
  sideMenu.appendChild(colorSection);
  sideMenuClip.appendChild(sideMenu);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lia-dgs-menu-button';
  button.setAttribute('aria-label', 'DGS-Menü');
  button.setAttribute('aria-controls', menuBar.id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path></svg>';
  button.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  sideMenu.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  sideMenu.addEventListener('contextmenu', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });

  boardContainer.appendChild(sideMenuClip);
  boardContainer.appendChild(menuClip);
  boardContainer.appendChild(button);
  typesetDgsMath(pointButton);

  const board = window.__boards && window.__boards[boardId];
  const xAxis = board && board.defaultAxes && board.defaultAxes.x;
  const yAxis = board && board.defaultAxes && board.defaultAxes.y;
  const state: DgsState = {
    boardId,
    board,
    boardContainer,
    button,
    menuClip,
    menuBar,
    sideMenuClip,
    sideMenu,
    sideMenuTitle,
    sideMenuCloseButton,
    coordinateSection,
    xCoordinateInput,
    yCoordinateInput,
    fixedCheckbox: fixedOption.input,
    nameCheckbox: nameOption.input,
    objectCheckbox: objectOption.input,
    objectCheckboxText: objectOption.caption,
    colorPalette,
    colorPaletteCursor,
    colorHueInput,
    colorPreview,
    colorHexInput,
    colorHue: 300,
    colorSaturation: 1,
    colorValue: 1,
    toolsDivider,
    pointButton,
    segmentButton,
    regressionDivider,
    xAxis,
    xAxisOriginalPoint2: readAxisPoint2(xAxis),
    xAxisOriginalStraightLast: readAxisStraightLast(xAxis),
    xAxisAdjusted: false,
    yAxis,
    axisOriginalPoint2: readAxisPoint2(yAxis),
    axisOriginalStraightLast: readAxisStraightLast(yAxis),
    axisAdjusted: false,
    axisSyncing: false,
    open: false,
    sideMenuOpen: false,
    contextObject: null,
    activeTool: '',
    selectedSegmentPoint: null
  };
  states[uid] = state;
  setMenuOpen(state, false);
  setSideMenuOpen(state, false);
  applyLayout(state);

  pointButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setActiveTool(state, state.activeTool === 'point' ? '' : 'point');
  });

  segmentButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setActiveTool(state, state.activeTool === 'segment' ? '' : 'segment');
  });

  menuBar.addEventListener('click', (evt) => {
    const target = evt.target as Element | null;
    if (
      target &&
      typeof target.closest === 'function' &&
      target.closest('.lia-plot-draw-btn, .lia-plot-erase-toggle, .lia-plot-regression-toggle, .lia-plot-reg-item')
    ) {
      setActiveTool(state, '', false);
    }
  }, true);

  sideMenuCloseButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setSideMenuOpen(state, false);
  });

  [xCoordinateInput, yCoordinateInput].forEach((input) => {
    input.addEventListener('blur', () => applyCoordinateInputs(state));
    input.addEventListener('keydown', (evt) => {
      if (evt.key !== 'Enter') return;
      evt.preventDefault();
      applyCoordinateInputs(state);
    });
  });

  fixedOption.input.addEventListener('change', () => {
    if (!state.contextObject) return;
    setDgsObjectFixed(state.contextObject, fixedOption.input.checked);
    if (isDgsPoint(state.contextObject)) {
      try {
        const name = String(state.contextObject.__liaDgsPointName || '');
        const pointState = window.__pointStates && window.__pointStates[state.boardId];
        if (pointState && pointState[name]) pointState[name].fixed = fixedOption.input.checked;
      } catch (e) {}
    }
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  });

  nameOption.input.addEventListener('change', () => {
    if (!state.contextObject) return;
    setDgsObjectNameVisible(state.contextObject, nameOption.input.checked);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  });

  objectOption.input.addEventListener('change', () => {
    if (!state.contextObject) return;
    setDgsObjectVisible(state.contextObject, objectOption.input.checked);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  });

  const applyColor = (value: string) => {
    if (!state.contextObject) return false;
    const color = setDgsObjectColor(state.contextObject, value);
    colorHexInput.setAttribute('aria-invalid', color ? 'false' : 'true');
    if (!color) return false;
    syncColorPicker(state, color);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return true;
  };

  let activePalettePointer: number | null = null;
  const updatePaletteFromPointer = (evt: PointerEvent) => {
    const rect = colorPalette.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    state.colorSaturation = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
    state.colorValue = 1 - Math.max(0, Math.min(1, (evt.clientY - rect.top) / rect.height));
    applyPickerColor(state);
  };
  colorPalette.addEventListener('pointerdown', (evt) => {
    if (evt.button !== 0) return;
    evt.preventDefault();
    evt.stopPropagation();
    activePalettePointer = evt.pointerId;
    try { colorPalette.setPointerCapture(evt.pointerId); } catch (e) {}
    updatePaletteFromPointer(evt);
  });
  colorPalette.addEventListener('pointermove', (evt) => {
    if (activePalettePointer !== evt.pointerId) return;
    evt.preventDefault();
    updatePaletteFromPointer(evt);
  });
  const finishPalettePointer = (evt: PointerEvent) => {
    if (activePalettePointer !== evt.pointerId) return;
    activePalettePointer = null;
    try { colorPalette.releasePointerCapture(evt.pointerId); } catch (e) {}
  };
  colorPalette.addEventListener('pointerup', finishPalettePointer);
  colorPalette.addEventListener('pointercancel', finishPalettePointer);
  colorPalette.addEventListener('keydown', (evt) => {
    const step = evt.shiftKey ? 0.1 : 0.01;
    if (evt.key === 'ArrowLeft') state.colorSaturation = Math.max(0, state.colorSaturation - step);
    else if (evt.key === 'ArrowRight') state.colorSaturation = Math.min(1, state.colorSaturation + step);
    else if (evt.key === 'ArrowUp') state.colorValue = Math.min(1, state.colorValue + step);
    else if (evt.key === 'ArrowDown') state.colorValue = Math.max(0, state.colorValue - step);
    else return;
    evt.preventDefault();
    applyPickerColor(state);
  });
  colorHueInput.addEventListener('input', () => {
    state.colorHue = Number(colorHueInput.value) || 0;
    applyPickerColor(state);
  });
  colorHexInput.addEventListener('change', () => applyColor(colorHexInput.value));
  colorHexInput.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Enter') return;
    evt.preventDefault();
    applyColor(colorHexInput.value);
  });

  state.onBoardContextMenu = (evt: MouseEvent) => {
    if (eventTargetsBoardUi(evt)) return;
    const object = findDgsContextObject(state, evt);
    if (!object) {
      if (state.sideMenuOpen) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        setSideMenuOpen(state, false);
      }
      return;
    }

    evt.preventDefault();
    evt.stopImmediatePropagation();
    setActiveTool(state, '', false);
    updateSideMenuControls(state, object);
    setSideMenuOpen(state, true);
  };
  boardContainer.addEventListener('contextmenu', state.onBoardContextMenu, true);

  state.onBoardPointerDown = (evt: PointerEvent) => {
    if (!state.activeTool) return;
    if (evt.button !== 0 || evt.isPrimary === false || eventTargetsBoardUi(evt)) return;

    if (state.activeTool === 'segment') {
      const point = findNearestBoardPoint(state, evt);
      if (!point) return;

      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedSegmentPoint) {
        setSelectedSegmentPoint(state, point);
        return;
      }
      if (state.selectedSegmentPoint === point) return;

      const segment = createDgsSegment(state, state.selectedSegmentPoint, point);
      if (segment) setActiveTool(state, '', false);
      return;
    }

    const coordinates = eventToUserCoordinates(state, evt);
    if (!coordinates) return;

    evt.preventDefault();
    evt.stopImmediatePropagation();
    createDgsPoint(state, coordinates.x, coordinates.y);
  };
  boardContainer.addEventListener('pointerdown', state.onBoardPointerDown, true);

  state.onBoardViewportChange = () => {
    if (!state.axisSyncing) {
      scheduleAxisSync(state);
      scheduleXAxisSync(state);
    }
  };
  if (board && typeof board.on === 'function') {
    try { board.on('move', state.onBoardViewportChange); } catch (e) {}
    try { board.on('boundingbox', state.onBoardViewportChange); } catch (e) {}
  }

  if (typeof ResizeObserver === 'function') {
    state.resizeObserver = new ResizeObserver(() => {
      scheduleAxisSync(state);
      scheduleXAxisSync(state);
    });
    state.resizeObserver.observe(boardContainer);
  }

  button.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMenuOpen(state, !state.open);
  });
}

window.__setupDGS = function (uid: string, spec: string): void {
  const boardId = unquote(String(spec || '').trim());
  scheduleBootstrap(() => setupDGS(uid, boardId));
};

export function bootstrapDGS(): void {
  const anchors = document.querySelectorAll('[id^="dgs-ui-"][data-spec]');

  anchors.forEach((el: Element) => {
    const match = String(el.id || '').match(/^dgs-ui-(.+)$/);
    if (!match) return;

    const uid = match[1];
    const boardId = unquote(String((el as HTMLElement).dataset.spec || '').trim());
    setupDGS(uid, boardId);
  });
}

export function init(): void {
  if (window.__dgsReady) {
    try { if (window.__bootstrapDGS) window.__bootstrapDGS(); } catch (e) {}
    return;
  }

  window.__dgsReady = true;
  window.__bootstrapDGS = bootstrapDGS;
  initThemeSync();

  if (window.__registerLiaThemeListener) {
    window.__registerLiaThemeListener(function () {
      Object.keys(states).forEach(function (uid) {
        const state = states[uid];
        if (state) applyLayout(state);
      });
    });
  }

  scheduleBootstrap(() => bootstrapDGS());
}
