// Regression subsystem (@Regression macro).
// Creates legacy draw controls: undo, redo, draw(+color menu), eraser, tools(+submenu).

import { unquote } from '../shared/parser';
import { scheduleBootstrap } from '../shared/bootstrap';

type DrawPoint = { x: number; y: number };
type DrawStroke = { color: string; width: number; points: DrawPoint[] };
type EraseEntry = { stroke: DrawStroke; index: number };
type AutoPointData = { key: string; x: number; y: number };
type DrawAction =
  | { type: 'add'; stroke: DrawStroke }
  | { type: 'erase'; removed: EraseEntry[] }
  | { type: 'point-add'; point: AutoPointData }
  | { type: 'point-remove'; point: AutoPointData };

type LinearParamKey = 'm' | 'n';
type QuadraticParamKey = 'a' | 'c' | 'd';
type CubicParamKey = 'a' | 'b' | 'c' | 'd';
type QuarticParamKey = 'a' | 'b' | 'c' | 'd' | 'f';
type SinParamKey = 'A' | 'b' | 'c' | 'd';
type ExpParamKey = 'A' | 'b' | 'c' | 'd';
type LogParamKey = 'A' | 'b' | 'c' | 'd';
type SqrtParamKey = 'A' | 'b' | 'c' | 'd';
type HyperbolaParamKey = 'A' | 'b' | 'c' | 'd';
type Hyperbola2ParamKey = 'A' | 'b' | 'c' | 'd';
type AnalysisClassKey = 'linear' | 'quadratic' | 'cubic' | 'quartic' | 'sin' | 'exp' | 'log' | 'sqrt' | 'hyperbola' | 'hyperbola2';

type AnalysisOverlayCandidate = {
  name: 'linear';
  probability: number;
  params: Record<LinearParamKey, number>;
};

type AnalysisClassOption = {
  key: AnalysisClassKey;
  label: string;
};

type AnalysisLinkedModels = {
  linear: { m: number; n: number };
  quadratic: { a: number; c: number; d: number };
  cubic: { a: number; b: number; c: number; d: number };
  quartic: { a: number; b: number; c: number; d: number; f: number };
  sin: { A: number; b: number; c: number; d: number };
  exp: { A: number; b: number; c: number; d: number };
  log: { A: number; b: number; c: number; d: number };
  sqrt: { A: number; b: number; c: number; d: number };
  hyperbola: { A: number; b: number; c: number; d: number };
  hyperbola2: { A: number; b: number; c: number; d: number };
};

type AnalysisOverlayOptions = {
  classProbabilities?: Record<AnalysisClassKey, number>;
  linkedModels?: AnalysisLinkedModels;
  overlayScale?: number;
};

// All analysis entries share the same shape and differ only in their `model`
// parameter object. AnalysisEntry<M> captures the common fields.
type AnalysisEntry<M> = {
  id: string;
  title: string;
  color: string;
  panel: HTMLElement | null;
  graph: any;
  model: M;
  syncUi?: (lightweight?: boolean) => void;
  disposeUi?: () => void;
};

type LinearAnalysisEntry = AnalysisEntry<{ m: number; n: number }>;
type QuadraticAnalysisEntry = AnalysisEntry<{ a: number; c: number; d: number }>;
type CubicAnalysisEntry = AnalysisEntry<{ a: number; b: number; c: number; d: number }>;
type QuarticAnalysisEntry = AnalysisEntry<{ a: number; b: number; c: number; d: number; f: number }>;
type SinAnalysisEntry = AnalysisEntry<{ A: number; b: number; c: number; d: number }>;
type ExpAnalysisEntry = AnalysisEntry<{ A: number; b: number; c: number; d: number }>;
type LogAnalysisEntry = AnalysisEntry<{ A: number; b: number; c: number; d: number }>;
type SqrtAnalysisEntry = AnalysisEntry<{ A: number; b: number; c: number; d: number }>;
type HyperbolaAnalysisEntry = AnalysisEntry<{ A: number; b: number; c: number; d: number }>;
type Hyperbola2AnalysisEntry = AnalysisEntry<{ A: number; b: number; c: number; d: number }>;

type RegressionState = {
  uid: string;
  boardId: string;
  board: any;
  anchor: HTMLElement | null;
  boardContainer: HTMLElement;
  drawLayer: HTMLCanvasElement;
  drawCtx: CanvasRenderingContext2D | null;
  drawButton: HTMLButtonElement;
  eraseButton: HTMLButtonElement;
  toolsButton: HTMLButtonElement;
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  drawColorMenu: HTMLElement;
  toolsMenu: HTMLElement;
  drawColor: string;
  drawColorMenuOpen: boolean;
  toolsMenuOpen: boolean;
  activeTool: '' | 'draw' | 'erase' | 'tools' | 'regression';
  regressionMode: '' | 'recognize' | 'select-points';
  strokes: DrawStroke[];
  undoActions: DrawAction[];
  redoActions: DrawAction[];
  regressionPoints: AutoPointData[];
  drawing: boolean;
  pointerId: number | null;
  currentStroke: DrawStroke | null;
  eraseRemoved: EraseEntry[];
  autoCreatedPointsData: AutoPointData[];
  recognitionGraph: any;
  regressionGraph: any;
  analysisEntries: LinearAnalysisEntry[];
  quadraticAnalysisEntries: QuadraticAnalysisEntry[];
  cubicAnalysisEntries: CubicAnalysisEntry[];
  quarticAnalysisEntries: QuarticAnalysisEntry[];
  sinAnalysisEntries: SinAnalysisEntry[];
  expAnalysisEntries: ExpAnalysisEntry[];
  logAnalysisEntries: LogAnalysisEntry[];
  sqrtAnalysisEntries: SqrtAnalysisEntry[];
  hyperbolaAnalysisEntries: HyperbolaAnalysisEntry[];
  hyperbola2AnalysisEntries: Hyperbola2AnalysisEntry[];
  analysisSeq: number;
  onBoardPointerDown?: (evt: PointerEvent) => void;
  onBoardViewportChange?: () => void;
  onDocPointerDown?: (evt: PointerEvent) => void;
  onWindowResize?: () => void;
  resizeObserver?: ResizeObserver;
  overlayScaleCarry?: number;
  overlayScaleCarryUntil?: number;
};

const DRAW_COLORS = [
  '#ff0000', '#ff7500', '#ffff00', '#ff00ff', '#0055ff',
  '#00ffff', '#00ff00', '#007500', '#000000', '#ffffff'
];

const ANALYSIS_CLASS_OPTIONS: AnalysisClassOption[] = [
  { key: 'linear', label: 'Lineare Funktion' },
  { key: 'quadratic', label: 'Quadratische Funktion' },
  { key: 'cubic', label: 'Kubische Funktion' },
  { key: 'quartic', label: 'Quartische Funktion' },
  { key: 'sin', label: 'Sinusfunktion' },
  { key: 'exp', label: 'Exponentialfunktion' },
  { key: 'log', label: 'Logarithmusfunktion' },
  { key: 'sqrt', label: 'Wurzelfunktion' },
  { key: 'hyperbola', label: 'Hyperbelfunktion' },
  { key: 'hyperbola2', label: 'Quadratische Hyperbelfunktion' }
];

const states: Record<string, RegressionState> = {};
const pendingRetries: Record<string, number> = {};
const MAX_RETRIES = 40;
const RETRY_DELAY_MS = 120;
const OVERLAY_MIN_SCALE = 0.42;

function clampOverlayScale(value: number): number {
  return Math.max(0.35, Math.min(1.45, value));
}

function readOverlayScaleFromPanel(panel: HTMLElement | null): number | null {
  if (!panel) return null;
  const transform = String(panel.style.transform || '').trim();
  const match = transform.match(/scale\(([^)]+)\)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return clampOverlayScale(value);
}

function captureOverlayScaleCarry(state: RegressionState, panel: HTMLElement | null): void {
  const scale = readOverlayScaleFromPanel(panel);
  if (!Number.isFinite(scale as number)) return;
  state.overlayScaleCarry = scale as number;
  state.overlayScaleCarryUntil = Date.now() + 300;
}

function consumeInitialOverlayScale(state: RegressionState, options?: AnalysisOverlayOptions): number {
  const optionScale = Number(options && options.overlayScale);
  if (Number.isFinite(optionScale)) return clampOverlayScale(optionScale);

  const carryScale = Number(state.overlayScaleCarry);
  const carryUntil = Number(state.overlayScaleCarryUntil || 0);
  state.overlayScaleCarry = undefined;
  state.overlayScaleCarryUntil = 0;

  if (Number.isFinite(carryScale) && Date.now() <= carryUntil) {
    return clampOverlayScale(carryScale);
  }

  return OVERLAY_MIN_SCALE;
}

function ensureStyles(root: Document | ShadowRoot): void {
  if ((root as any).getElementById && (root as any).getElementById('lia-regression-style')) return;
  if (root.querySelector && root.querySelector('#lia-regression-style')) return;

  const style = document.createElement('style');
  style.id = 'lia-regression-style';
  style.textContent = `
    .lia-plot-draw-layer {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 47;
      touch-action: none;
      background: transparent;
    }

    .lia-plot-draw-layer[data-active="1"] {
      pointer-events: auto;
      cursor: crosshair;
    }

    .lia-plot-draw-toggle {
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
      z-index: 48;
      appearance: none;
      -webkit-appearance: none;
    }

    .lia-plot-draw-toggle svg {
      width: 22px;
      height: 22px;
      display: block;
      overflow: visible;
    }

    .lia-plot-draw-toggle .ico-stroke {
      stroke: currentColor;
      fill: none;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lia-plot-draw-toggle .ico-color-dot {
      fill: var(--draw-color, #ff0000);
      stroke: currentColor;
      stroke-width: 1.6;
    }

    .lia-plot-draw-toggle.is-active {
      background: rgba(6, 106, 114, 0.88);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.86);
    }

    .lia-plot-color-menu {
      position: absolute;
      z-index: 56;
      display: none;
      padding: 2px 8px;
      border: 1.5px solid var(--canvas-border, #000);
      border-radius: 12px;
      background: rgba(0, 0, 0, .15);
      backdrop-filter: blur(6px);
      overflow: hidden;
      color: #000;
      box-shadow: 0 6px 18px rgba(0,0,0,.18);
      box-sizing: border-box;
      row-gap: 10px;
    }

    .lia-plot-color-menu[data-open="1"] {
      display: grid;
    }

    .lia-plot-color-grid {
      display: grid;
      grid-template-columns: repeat(10, 16px);
      gap: 2px;
      padding: 2px;
      align-items: center;
    }

    .lia-plot-color-item {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      border: 1px solid #cccccc;
      padding: 0;
      margin: 0;
      cursor: pointer;
      box-sizing: border-box;
      display: inline-block;
    }

    .lia-plot-color-item[data-active="1"] {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }

    .lia-plot-reg-menu {
      row-gap: 2px;
      column-gap: 2px;
      padding: 3px;
      min-width: 190px;
      grid-template-columns: 1fr 1fr;
    }

    .lia-plot-reg-item {
      width: 100%;
      padding: 1px 4px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.86);
      background: rgba(0, 0, 0, 0.82);
      color: #fff;
      cursor: pointer;
      box-sizing: border-box;
      text-align: center;
      font-size: 0.64em;
      font-weight: 700;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10);
    }

    .lia-plot-reg-item.is-active {
      background: var(--lia-reg-item-bg, rgba(6, 106, 114, 0.88));
      color: var(--lia-reg-item-fg, #fff);
      border-color: rgba(255, 255, 255, 0.86);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.20), 0 0 0 1px rgba(255,255,255,0.16);
    }

    .lia-plot-draw-toggle.is-disabled,
    .lia-plot-draw-toggle:disabled {
      opacity: .42;
      cursor: default;
    }

    .lia-plot-reg-item.is-disabled,
    .lia-plot-reg-item:disabled {
      border-color: rgba(20, 101, 108, 0.95);
      background: rgba(6, 64, 70, 0.82);
      color: rgba(255,255,255,0.34);
      cursor: default;
    }

    .lia-plot-analyze-panel {
      position: absolute;
      top: 8px;
      left: 10px;
      z-index: 70;
      min-width: 260px;
      width: auto;
      max-width: calc(100% - 16px);
      min-height: 0 !important;
      height: auto !important;
      max-height: none !important;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 12px;
      background: rgba(0,0,0,.82);
      color: #fff;
      backdrop-filter: blur(6px);
      box-sizing: border-box;
      font-size: 10px;
      font-family: inherit;
      line-height: 1.1;
      white-space: normal;
      word-break: break-word;
      box-shadow: 0 8px 28px rgba(0,0,0,.5);
      display: none;
      pointer-events: auto;
      overflow: visible;
      transform-origin: top left;
    }

    .lia-plot-analyze-panel[data-open="1"] {
      display: inline-block;
    }

    .lia-plot-analysis-content {
      padding-right: 22px;
    }

    .lia-plot-analysis-close {
      position: absolute;
      top: 5px;
      right: 6px;
      z-index: 20;
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--lia-analysis-accent, #ff4400);
      font-size: 18px;
      font-weight: 900;
      line-height: 18px;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      user-select: none;
    }

    .lia-plot-analysis-select-wrap {
      margin-bottom: 8px;
    }

    .lia-plot-analysis-select {
      width: 100%;
      box-sizing: border-box;
      border-radius: 8px;
      padding: 6px 8px;
      border: 1px solid rgba(255,255,255,.35);
      background: rgba(0,0,0,.72);
      color: #fff;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
    }

    .lia-plot-analysis-select option {
      background: #1a1a1a;
      color: #ffffff;
    }

    .lia-plot-analysis-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .lia-plot-analysis-label {
      min-width: 30px;
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      text-align: right;
      flex: 0 0 auto;
      margin-right: 8px;
      font-size: 21px;
      font-weight: 700;
    }

    .lia-plot-analysis-label mjx-container,
    .lia-plot-analysis-formula mjx-container {
      font-size: 1.12em !important;
      line-height: 1.2 !important;
    }

    .lia-plot-analysis-slider {
      width: 220px;
      max-width: 220px;
      min-width: 220px;
      flex: 0 0 220px;
      margin: 0;
      margin-left: 12px;
      margin-right: 10px;
      position: relative;
      top: 8px;
      color: var(--lia-analysis-accent, #ff4400) !important;
      background: linear-gradient(
        to right,
        var(--lia-analysis-accent, #ff4400) 0 var(--lia-analysis-fill, 50%),
        rgba(128,128,128,.65) var(--lia-analysis-fill, 50%) 100%
      ) !important;
      height: 12px;
      min-height: 12px;
      border-radius: 999px !important;
      padding: 0 !important;
      border: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      background-size: 100% 5px !important;
      background-repeat: no-repeat !important;
      background-position: center !important;
      appearance: none !important;
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      touch-action: pan-x;
    }

    .lia-plot-analysis-slider::-webkit-slider-thumb {
      width: 18px;
      height: 18px;
      margin-top: -6px;
      border: none !important;
      border-radius: 50%;
      background: #8d8d93 !important;
      box-shadow: 0 0 0 2px #ffffff, 0 1px 3px rgba(0,0,0,.35) !important;
      appearance: none !important;
      -webkit-appearance: none !important;
    }

    .lia-plot-analysis-slider::-webkit-slider-runnable-track {
      height: 5px;
      background: transparent !important;
      border: none;
      border-radius: 999px;
      box-shadow: none;
    }

    .lia-plot-analysis-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border: none !important;
      border-radius: 50%;
      background: #8d8d93 !important;
      box-shadow: 0 0 0 2px #ffffff, 0 1px 3px rgba(0,0,0,.35) !important;
    }

    .lia-plot-analysis-slider::-moz-range-track {
      height: 5px;
      background: rgba(128,128,128,.65) !important;
      border: none;
      border-radius: 999px;
      box-shadow: none;
    }

    .lia-plot-analysis-slider::-moz-range-progress {
      height: 5px;
      background: var(--lia-analysis-accent, #ff4400) !important;
      border: none;
      border-radius: 999px;
      box-shadow: none;
    }

    .lia-plot-analysis-formula {
      margin-top: 12px;
      font-size: 18px !important;
      font-weight: 600;
      line-height: 1.2;
      word-break: break-word;
      white-space: normal;
      overflow-wrap: anywhere;
      max-width: 100%;
      display: block;
      overflow-x: auto;
      overflow-y: hidden;
      text-align: left;
    }

    .lia-plot-analysis-formula mjx-container {
      text-align: left !important;
      margin-left: 0 !important;
      margin-right: auto !important;
      display: block !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
    }

    .lia-plot-analysis-mini-wrap {
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      min-height: 16px;
      pointer-events: auto;
    }

    .lia-plot-analysis-mini-strip {
      width: 28px;
      height: 4px;
      border-radius: 99px;
      background: var(--lia-analysis-accent, #ff4400);
      cursor: pointer;
      pointer-events: auto;
    }

    .lia-plot-analysis-resize {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 18px;
      height: 18px;
      cursor: nwse-resize;
      background: transparent;
      padding: 0;
      margin: 0;
      border: 0;
      border-right: 2px solid var(--lia-analysis-accent, #ff4400);
      border-bottom: 2px solid var(--lia-analysis-accent, #ff4400);
      border-bottom-right-radius: 10px;
      box-sizing: border-box;
      user-select: none;
      touch-action: none;
      display: block;
      opacity: 1;
      z-index: 6;
      pointer-events: auto;
    }
  `;

  if (root instanceof ShadowRoot) {
    root.appendChild(style);
    return;
  }

  if (root.head) {
    root.head.appendChild(style);
    return;
  }

  root.appendChild(style);
}

function neutralColor(): string {
  try {
    if (window.__coord && typeof window.__coord.getNeutralColor === 'function') {
      return window.__coord.getNeutralColor();
    }
  } catch (e) {}
  return '#000';
}

function getOverlayMathJaxEngine(): any {
  try {
    if (window.MathJax) return window.MathJax;
  } catch (e) {}

  try {
    if (window.parent && window.parent.MathJax) return window.parent.MathJax;
  } catch (e) {}

  return null;
}

function typesetOverlayMath(node: HTMLElement): Promise<void> {
  const engine = getOverlayMathJaxEngine();
  if (!engine || typeof engine.typesetPromise !== 'function') return Promise.resolve();

  try {
    return engine.typesetPromise([node]).then(function () {}).catch(function () {});
  } catch (e) {}

  return Promise.resolve();
}

function stopPanelEventPropagation(el: HTMLElement): void {
  ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel']
    .forEach((evtName) => {
      el.addEventListener(evtName, (evt) => evt.stopPropagation(), true);
    });
}

function formatOverlayNumber(value: number, digits: number = 3): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = value.toFixed(digits);
  return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function toOverlayTexNumber(value: number, digits: number = 3): string {
  return formatOverlayNumber(value, digits).replace(/\./g, ',');
}

function buildLinearFormulaTex(m: number, n: number): string {
  const safeM = Number.isFinite(m) ? m : 0;
  const safeN = Number.isFinite(n) ? n : 0;
  const absM = Math.abs(safeM);
  const absN = Math.abs(safeN);
  let rhs = '';

  if (absM < 1e-12) {
    rhs = toOverlayTexNumber(safeN);
  } else {
    if (Math.abs(absM - 1) < 1e-12) {
      rhs = safeM < 0 ? '-x' : 'x';
    } else {
      rhs = toOverlayTexNumber(absM) + ' \\cdot x';
      if (safeM < 0) rhs = '-' + rhs;
    }

    if (absN >= 1e-12) {
      rhs += safeN < 0
        ? ' - ' + toOverlayTexNumber(absN)
        : ' + ' + toOverlayTexNumber(absN);
    }
  }

  return '\\(f(x) = ' + rhs + '\\)';
}

function updateAnalysisSliderFill(slider: HTMLInputElement): void {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const value = Number(slider.value);
  const ratio = !Number.isFinite(min) || !Number.isFinite(max) || max <= min
    ? 0.5
    : Math.max(0, Math.min(1, (value - min) / (max - min)));
  slider.style.setProperty('--lia-analysis-fill', (ratio * 100).toFixed(2) + '%');
}

function renderAnalysisFormula(host: HTMLElement, tex: string): void {
  host.innerHTML = tex;
  typesetOverlayMath(host);
}

function getLinearOverlayCandidate(m: number, n: number): AnalysisOverlayCandidate {
  return {
    name: 'linear',
    probability: 100,
    params: { m, n }
  };
}

function buildQuadraticFormulaTex(a: number, c: number, d: number): string {
  const safeA = Number.isFinite(a) ? a : 1;
  const safeC = Number.isFinite(c) ? c : 0;
  const safeD = Number.isFinite(d) ? d : 0;
  const absA = Math.abs(safeA);
  const absC = Math.abs(safeC);
  const absD = Math.abs(safeD);
  let rhs = '';

  if (Math.abs(absA - 1) < 1e-12) {
    rhs = safeA < 0 ? '-(x' : '(x';
  } else {
    rhs = toOverlayTexNumber(absA) + ' \\cdot (x';
    if (safeA < 0) rhs = '-' + rhs;
  }

  if (absC >= 1e-12) {
    rhs += safeC < 0 ? ' - ' + toOverlayTexNumber(absC) : ' + ' + toOverlayTexNumber(absC);
  }

  rhs += ')^2';

  if (absD >= 1e-12) {
    rhs += safeD < 0
      ? ' - ' + toOverlayTexNumber(absD)
      : ' + ' + toOverlayTexNumber(absD);
  }

  return '\\(f(x) = ' + rhs + '\\)';
}

function buildCubicFormulaTex(a: number, b: number, c: number, d: number): string {
  const terms: string[] = [];
  const pushTerm = (coef: number, power: number) => {
    if (!Number.isFinite(coef) || Math.abs(coef) < 1e-12) return;
    const sign = coef < 0 ? '-' : '+';
    const abs = Math.abs(coef);
    const coefStr = Math.abs(abs - 1) < 1e-12 && power > 0 ? '' : toOverlayTexNumber(abs);
    const powerStr = power === 0 ? '' : (power === 1 ? 'x' : `x^${power}`);
    const core = powerStr ? (coefStr ? `${coefStr} \\cdot ${powerStr}` : powerStr) : coefStr;
    terms.push((terms.length === 0 && sign === '+') ? core : `${sign} ${core}`);
  };

  pushTerm(a, 3);
  pushTerm(b, 2);
  pushTerm(c, 1);
  pushTerm(d, 0);
  return '\\(f(x) = ' + (terms.length ? terms.join(' ') : '0') + '\\)';
}

function buildQuarticFormulaTex(a: number, b: number, c: number, d: number, f: number): string {
  const terms: string[] = [];
  const pushTerm = (coef: number, power: number) => {
    if (!Number.isFinite(coef) || Math.abs(coef) < 1e-12) return;
    const sign = coef < 0 ? '-' : '+';
    const abs = Math.abs(coef);
    const coefStr = Math.abs(abs - 1) < 1e-12 && power > 0 ? '' : toOverlayTexNumber(abs);
    const powerStr = power === 0 ? '' : (power === 1 ? 'x' : `x^${power}`);
    const core = powerStr ? (coefStr ? `${coefStr} \\cdot ${powerStr}` : powerStr) : coefStr;
    terms.push((terms.length === 0 && sign === '+') ? core : `${sign} ${core}`);
  };

  pushTerm(a, 4);
  pushTerm(b, 3);
  pushTerm(c, 2);
  pushTerm(d, 1);
  pushTerm(f, 0);
  return '\\(f(x) = ' + (terms.length ? terms.join(' ') : '0') + '\\)';
}

function buildSinFormulaTex(A: number, b: number, c: number, d: number): string {
  const amp = toOverlayTexNumber(A);
  const freq = toOverlayTexNumber(b);
  const shiftSign = c >= 0 ? ' + ' : ' - ';
  const shiftAbs = toOverlayTexNumber(Math.abs(c));
  const rhs = `${amp} \\sin\\left(${freq} \\cdot (x${shiftSign}${shiftAbs})\\right)`;
  const tail = Math.abs(d) < 1e-12 ? '' : (d >= 0 ? ' + ' : ' - ') + toOverlayTexNumber(Math.abs(d));
  return `\\(f(x) = ${rhs}${tail}\\)`;
}

function buildExpFormulaTex(A: number, b: number, c: number, d: number): string {
  const amp = toOverlayTexNumber(A);
  const freq = toOverlayTexNumber(b);
  const shiftSign = c >= 0 ? ' + ' : ' - ';
  const shiftAbs = toOverlayTexNumber(Math.abs(c));
  const rhs = `${amp} \\cdot e^{${freq} \\cdot (x${shiftSign}${shiftAbs})}`;
  const tail = Math.abs(d) < 1e-12 ? '' : (d >= 0 ? ' + ' : ' - ') + toOverlayTexNumber(Math.abs(d));
  return `\\(f(x) = ${rhs}${tail}\\)`;
}

function buildLogFormulaTex(A: number, b: number, c: number, d: number): string {
  const amp = toOverlayTexNumber(A);
  const freq = toOverlayTexNumber(Math.abs(b));
  const shiftSign = c >= 0 ? ' + ' : ' - ';
  const shiftAbs = toOverlayTexNumber(Math.abs(c));
  const rhs = `${amp} \\cdot \\ln\\left(${freq} \\cdot (x${shiftSign}${shiftAbs})\\right)`;
  const tail = Math.abs(d) < 1e-12 ? '' : (d >= 0 ? ' + ' : ' - ') + toOverlayTexNumber(Math.abs(d));
  return `\\(f(x) = ${rhs}${tail}\\)`;
}

function buildSqrtFormulaTex(A: number, b: number, c: number, d: number): string {
  const amp = toOverlayTexNumber(A);
  const freq = toOverlayTexNumber(Math.abs(b));
  const shiftSign = c >= 0 ? ' + ' : ' - ';
  const shiftAbs = toOverlayTexNumber(Math.abs(c));
  const rhs = `${amp} \\cdot \\sqrt{${freq} \\cdot (x${shiftSign}${shiftAbs})}`;
  const tail = Math.abs(d) < 1e-12 ? '' : (d >= 0 ? ' + ' : ' - ') + toOverlayTexNumber(Math.abs(d));
  return `\\(f(x) = ${rhs}${tail}\\)`;
}

function buildHyperbolaFormulaTex(A: number, b: number, c: number, d: number): string {
  const amp = toOverlayTexNumber(A);
  const freq = toOverlayTexNumber(b);
  const shiftSign = c >= 0 ? ' + ' : ' - ';
  const shiftAbs = toOverlayTexNumber(Math.abs(c));
  const denom = `${freq} \\cdot (x${shiftSign}${shiftAbs})`;
  const rhs = `\\frac{${amp}}{${denom}}`;
  const tail = Math.abs(d) < 1e-12 ? '' : (d >= 0 ? ' + ' : ' - ') + toOverlayTexNumber(Math.abs(d));
  return `\\(f(x) = ${rhs}${tail}\\)`;
}

function buildHyperbola2FormulaTex(A: number, b: number, c: number, d: number): string {
  const amp = toOverlayTexNumber(A);
  const coef = toOverlayTexNumber(b);
  const constSign = c >= 0 ? ' - ' : ' + ';
  const constAbs = toOverlayTexNumber(Math.abs(c));
  const denom = `(${coef} \\cdot x${constSign}${constAbs})^{2}`;
  const rhs = `\\frac{${amp}}{${denom}}`;
  const tail = Math.abs(d) < 1e-12 ? '' : (d >= 0 ? ' + ' : ' - ') + toOverlayTexNumber(Math.abs(d));
  return `\\(f(x) = ${rhs}${tail}\\)`;
}

function getQuadraticOverlayCandidate(a: number, c: number, d: number): { name: string; probability: number } {
  return {
    name: 'quadratic',
    probability: 100
  };
}

function formatClassProbability(probability: number): string {
  const safe = Number.isFinite(probability) ? Math.max(0, probability) : 0;
  return safe.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function makeClassProbabilities(activeClass: AnalysisClassKey, activeProbability: number): Record<AnalysisClassKey, number> {
  const tiny = 0.0000000001;
  return {
    linear: activeClass === 'linear' ? activeProbability : tiny,
    quadratic: activeClass === 'quadratic' ? activeProbability : tiny,
    cubic: activeClass === 'cubic' ? activeProbability : tiny,
    quartic: activeClass === 'quartic' ? activeProbability : tiny,
    sin: activeClass === 'sin' ? activeProbability : tiny,
    exp: activeClass === 'exp' ? activeProbability : tiny,
    log: activeClass === 'log' ? activeProbability : tiny,
    sqrt: activeClass === 'sqrt' ? activeProbability : tiny,
    hyperbola: activeClass === 'hyperbola' ? activeProbability : tiny,
    hyperbola2: tiny
  };
}

function computeStableClassProbabilities(
  linearError: number | null,
  quadraticError: number | null,
  cubicError: number | null,
  quarticError: number | null,
  sinError: number | null,
  expError: number | null,
  logError: number | null,
  sqrtError: number | null,
  hyperbolaError: number | null,
  hyperbola2ErrorOrPreferred: number | AnalysisClassKey | null,
  preferredMaybe?: AnalysisClassKey
): Record<AnalysisClassKey, number> {
  const preferred: AnalysisClassKey = (typeof hyperbola2ErrorOrPreferred === 'string'
    ? hyperbola2ErrorOrPreferred
    : (preferredMaybe || 'linear'));
  const hyperbola2Error: number | null = (typeof hyperbola2ErrorOrPreferred === 'number'
    ? hyperbola2ErrorOrPreferred
    : null);

  const tiny = 0.0000000001;
  const linearScore = Number.isFinite(linearError as number) ? 1 / Math.max(1e-9, Number(linearError)) : 0;
  const quadraticScore = Number.isFinite(quadraticError as number) ? 1 / Math.max(1e-9, Number(quadraticError)) : 0;
  const cubicScore = Number.isFinite(cubicError as number) ? 1 / Math.max(1e-9, Number(cubicError)) : 0;
  const quarticScore = Number.isFinite(quarticError as number) ? 1 / Math.max(1e-9, Number(quarticError)) : 0;
  const sinScore = Number.isFinite(sinError as number) ? 1 / Math.max(1e-9, Number(sinError)) : 0;
  const expScore = Number.isFinite(expError as number) ? 1 / Math.max(1e-9, Number(expError)) : 0;
  const logScore = Number.isFinite(logError as number) ? 1 / Math.max(1e-9, Number(logError)) : 0;
  const sqrtScore = Number.isFinite(sqrtError as number) ? 1 / Math.max(1e-9, Number(sqrtError)) : 0;
  const hyperbolaScore = Number.isFinite(hyperbolaError as number) ? 1 / Math.max(1e-9, Number(hyperbolaError)) : 0;
  const hyperbola2Score = Number.isFinite(hyperbola2Error as number) ? 1 / Math.max(1e-9, Number(hyperbola2Error)) : 0;
  const total = linearScore + quadraticScore + cubicScore + quarticScore + sinScore + expScore + logScore + sqrtScore + hyperbolaScore + hyperbola2Score;

  let linearProb = 0;
  let quadraticProb = 0;
  let cubicProb = 0;
  let quarticProb = 0;
  let sinProb = 0;
  let expProb = 0;
  let logProb = 0;
  let sqrtProb = 0;
  let hyperbolaProb = 0;
  let hyperbola2Prob = 0;
  if (total > 0) {
    linearProb = (linearScore / total) * 100;
    quadraticProb = (quadraticScore / total) * 100;
    cubicProb = (cubicScore / total) * 100;
    quarticProb = (quarticScore / total) * 100;
    sinProb = (sinScore / total) * 100;
    expProb = (expScore / total) * 100;
    logProb = (logScore / total) * 100;
    sqrtProb = (sqrtScore / total) * 100;
    hyperbolaProb = (hyperbolaScore / total) * 100;
    hyperbola2Prob = (hyperbola2Score / total) * 100;
  } else {
    linearProb = preferred === 'linear' ? 100 : 0;
    quadraticProb = preferred === 'quadratic' ? 100 : 0;
    cubicProb = preferred === 'cubic' ? 100 : 0;
    quarticProb = preferred === 'quartic' ? 100 : 0;
    sinProb = preferred === 'sin' ? 100 : 0;
    expProb = preferred === 'exp' ? 100 : 0;
    logProb = preferred === 'log' ? 100 : 0;
    sqrtProb = preferred === 'sqrt' ? 100 : 0;
    hyperbolaProb = preferred === 'hyperbola' ? 100 : 0;
    hyperbola2Prob = preferred === 'hyperbola2' ? 100 : 0;
  }

  return {
    linear: linearProb,
    quadratic: quadraticProb,
    cubic: cubicProb,
    quartic: quarticProb,
    sin: sinProb,
    exp: expProb,
    log: logProb,
    sqrt: sqrtProb,
    hyperbola: hyperbolaProb,
    hyperbola2: hyperbola2Prob > 0 ? hyperbola2Prob : tiny
  };
}

function createLinkedModels(
  linearModel: { m: number; n: number },
  quadraticModel: { a: number; c: number; d: number },
  cubicModel: { a: number; b: number; c: number; d: number },
  quarticModel: { a: number; b: number; c: number; d: number; f: number },
  sinModel?: { A: number; b: number; c: number; d: number },
  expModel?: { A: number; b: number; c: number; d: number },
  logModel?: { A: number; b: number; c: number; d: number },
  sqrtModel?: { A: number; b: number; c: number; d: number },
  hyperbolaModel?: { A: number; b: number; c: number; d: number },
  hyperbola2Model?: { A: number; b: number; c: number; d: number }
): AnalysisLinkedModels {
  const fallbackSin = sinModel
    ? sinModel
    : { A: 1, b: 1, c: 0, d: Number(linearModel.n) };
  const fallbackExp = expModel
    ? expModel
    : { A: 1, b: 1, c: 0, d: Number(linearModel.n) };
  const fallbackLog = logModel
    ? logModel
    : { A: 1, b: 1, c: 1 - Number(linearModel.m), d: Number(linearModel.n) };
  const fallbackSqrt = sqrtModel
    ? sqrtModel
    : { A: 1, b: 1, c: 1 - Number(linearModel.m), d: Number(linearModel.n) };
  const fallbackHyperbola = hyperbolaModel
    ? hyperbolaModel
    : { A: 1, b: 1, c: 1 - Number(linearModel.m), d: Number(linearModel.n) };
  const fallbackHyperbola2 = hyperbola2Model
    ? hyperbola2Model
    : { A: 1, b: 1, c: 1 - Number(linearModel.m), d: Number(linearModel.n) };

  return {
    linear: { m: Number(linearModel.m), n: Number(linearModel.n) },
    quadratic: { a: Number(quadraticModel.a), c: Number(quadraticModel.c), d: Number(quadraticModel.d) },
    cubic: { a: Number(cubicModel.a), b: Number(cubicModel.b), c: Number(cubicModel.c), d: Number(cubicModel.d) },
    quartic: { a: Number(quarticModel.a), b: Number(quarticModel.b), c: Number(quarticModel.c), d: Number(quarticModel.d), f: Number(quarticModel.f) },
    sin: { A: Number(fallbackSin.A), b: Number(fallbackSin.b), c: Number(fallbackSin.c), d: Number(fallbackSin.d) },
    exp: { A: Number(fallbackExp.A), b: Number(fallbackExp.b), c: Number(fallbackExp.c), d: Number(fallbackExp.d) },
    log: { A: Number(fallbackLog.A), b: Number(fallbackLog.b), c: Number(fallbackLog.c), d: Number(fallbackLog.d) },
    sqrt: { A: Number(fallbackSqrt.A), b: Number(fallbackSqrt.b), c: Number(fallbackSqrt.c), d: Number(fallbackSqrt.d) },
    hyperbola: { A: Number(fallbackHyperbola.A), b: Number(fallbackHyperbola.b), c: Number(fallbackHyperbola.c), d: Number(fallbackHyperbola.d) },
    hyperbola2: { A: Number(fallbackHyperbola2.A), b: Number(fallbackHyperbola2.b), c: Number(fallbackHyperbola2.c), d: Number(fallbackHyperbola2.d) }
  };
}

function fillAnalysisClassSelect(select: HTMLSelectElement, probabilities: Record<AnalysisClassKey, number>, selected: AnalysisClassKey): void {
  select.innerHTML = '';

  const order = new Map<AnalysisClassKey, number>();
  ANALYSIS_CLASS_OPTIONS.forEach((item, index) => {
    order.set(item.key, index);
  });

  const sorted = ANALYSIS_CLASS_OPTIONS.slice().sort((a, b) => {
    const pa = Number.isFinite(probabilities[a.key]) ? Number(probabilities[a.key]) : 0;
    const pb = Number.isFinite(probabilities[b.key]) ? Number(probabilities[b.key]) : 0;
    if (Math.abs(pb - pa) > 1e-12) return pb - pa;
    return (order.get(a.key) || 0) - (order.get(b.key) || 0);
  });

  sorted.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.key;
    const p = probabilities[item.key];
    option.textContent = item.label + ' (' + formatClassProbability(p) + '%)';
    option.selected = item.key === selected;
    select.appendChild(option);
  });
}

function getAnalysisClassLabel(key: AnalysisClassKey): string {
  const match = ANALYSIS_CLASS_OPTIONS.find((item) => item.key === key);
  return match ? match.label : String(key);
}

function renderUnsupportedClassHint(host: HTMLElement, key: AnalysisClassKey): void {
  host.textContent = getAnalysisClassLabel(key) + ' (noch nicht implementiert)';
}

function getBoardContainer(boardId: string): HTMLElement | null {
  const board = window.__boards && window.__boards[boardId];
  if (!board || !board.containerObj) return null;
  return board.containerObj as HTMLElement;
}

function setAnalysisOverlayPanelWidth(panel: HTMLElement, boardContainer: HTMLElement): void {
  const boardWidth = boardContainer.clientWidth;
  const OVERLAY_MIN_WIDTH = 190;
  // Nutze 80% der Boardbreite, mindestens aber OVERLAY_MIN_WIDTH
  const desiredWidth = Math.max(OVERLAY_MIN_WIDTH, Math.floor(boardWidth * 0.8));
  const viewportLimit = Math.max(OVERLAY_MIN_WIDTH, Math.floor(window.innerWidth * 0.94));
  const finalWidth = Math.min(desiredWidth, viewportLimit);
  panel.style.width = finalWidth + 'px';
  panel.style.maxWidth = 'calc(100vw - 24px)';
  panel.style.minWidth = OVERLAY_MIN_WIDTH + 'px';
  panel.style.boxSizing = 'border-box';
}

function createToolbarButton(className: string, ariaLabel: string, svgHtml: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', ariaLabel);
  btn.innerHTML = svgHtml;
  return btn;
}

function setMenuOpen(menu: HTMLElement, open: boolean): void {
  menu.dataset.open = open ? '1' : '0';
  menu.style.display = open ? 'grid' : 'none';
}

function eventPathIncludes(evt: Event, el: HTMLElement | null): boolean {
  if (!el) return false;
  const path = typeof (evt as any).composedPath === 'function' ? (evt as any).composedPath() : [];
  return Array.isArray(path) && path.indexOf(el) >= 0;
}

function setDrawLayerInteractive(state: RegressionState): void {
  const regressionDrawActive = state.activeTool === 'regression' && state.regressionMode === 'recognize';
  const active = state.activeTool === 'draw' || state.activeTool === 'erase' || regressionDrawActive;
  state.drawLayer.dataset.active = active ? '1' : '0';
  state.drawLayer.style.pointerEvents = active ? 'auto' : 'none';
  state.drawLayer.style.cursor = state.activeTool === 'erase' ? 'cell' : (regressionDrawActive ? 'pointer' : 'crosshair');
}

function updateButtonStates(state: RegressionState): void {
  state.drawButton.classList.toggle('is-active', state.activeTool === 'draw');
  state.eraseButton.classList.toggle('is-active', state.activeTool === 'erase');
  state.toolsButton.classList.toggle('is-active', state.activeTool === 'tools' || !!state.regressionMode);
  const hasUndo = state.undoActions.length > 0;
  const hasRedo = state.redoActions.length > 0;
  const hasRegressionSelection = state.regressionPoints.length >= 2;
  const canComputeRegression = state.regressionPoints.length >= 2;

  state.undoButton.classList.toggle('is-disabled', !hasUndo);
  state.redoButton.classList.toggle('is-disabled', !hasRedo);
  state.undoButton.disabled = !hasUndo;
  state.redoButton.disabled = !hasRedo;

  state.toolsMenu.querySelectorAll<HTMLElement>('.lia-plot-reg-item').forEach((item) => {
    const action = String(item.dataset.action || '').trim();
    const isModeAction = action === 'recognize' || action === 'select-points';
    const isActiveMode =
      (action === 'recognize' && state.regressionMode === 'recognize') ||
      (action === 'select-points' && state.regressionMode === 'select-points');
    item.classList.toggle('is-active', isActiveMode);

    item.style.borderColor = 'rgba(255, 255, 255, 0.86)';
    item.style.color = '#fff';

    if (isModeAction) {
      item.disabled = false;
      item.classList.remove('is-disabled');
      item.style.background = isActiveMode
        ? 'var(--lia-reg-item-bg, rgba(6, 106, 114, 0.88))'
        : 'rgba(0, 0, 0, 0.82)';
    }

    if (action === 'compute') {
      item.disabled = !canComputeRegression;
      item.classList.toggle('is-disabled', !canComputeRegression);
      item.style.background = canComputeRegression
        ? 'var(--lia-reg-item-bg, rgba(6, 106, 114, 0.88))'
        : 'rgba(6, 64, 70, 0.82)';
      item.style.color = canComputeRegression ? 'var(--lia-reg-item-fg, #fff)' : 'rgba(255,255,255,0.34)';
    }
    if (action === 'clear') {
      item.disabled = !hasRegressionSelection;
      item.classList.toggle('is-disabled', !hasRegressionSelection);
      item.style.background = hasRegressionSelection
        ? 'var(--lia-reg-item-bg, rgba(6, 106, 114, 0.88))'
        : 'rgba(6, 64, 70, 0.82)';
      item.style.color = hasRegressionSelection ? 'var(--lia-reg-item-fg, #fff)' : 'rgba(255,255,255,0.34)';
    }
  });

  setDrawLayerInteractive(state);
}

function getDrawPos(layer: HTMLCanvasElement, evt: PointerEvent): DrawPoint {
  const rect = layer.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function eventToUser(board: any, evt: PointerEvent): { x: number; y: number } {
  const rect = board.containerObj.getBoundingClientRect();
  const lx = evt.clientX - rect.left;
  const ly = evt.clientY - rect.top;

  return {
    x: (lx - board.origin.scrCoords[1]) / board.unitX,
    y: (board.origin.scrCoords[2] - ly) / board.unitY
  };
}

function getContainerPos(container: HTMLElement, evt: PointerEvent): DrawPoint {
  const rect = container.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function strokeDistanceSq(point: DrawPoint, a: DrawPoint, b: DrawPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - a.x;
    const py = point.y - a.y;
    return px * px + py * py;
  }

  const tRaw = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  const t = Math.max(0, Math.min(1, tRaw));
  const sx = a.x + t * dx;
  const sy = a.y + t * dy;
  const ex = point.x - sx;
  const ey = point.y - sy;
  return ex * ex + ey * ey;
}

function hitStrokeIndex(state: RegressionState, point: DrawPoint, thresholdPx: number): number {
  const thresholdSq = thresholdPx * thresholdPx;

  for (let i = state.strokes.length - 1; i >= 0; i -= 1) {
    const stroke = state.strokes[i];
    if (!stroke || stroke.points.length === 0) continue;

    if (stroke.points.length === 1) {
      const p = userToLocal(state, stroke.points[0]);
      const dx = point.x - p.x;
      const dy = point.y - p.y;
      if (dx * dx + dy * dy <= thresholdSq) return i;
      continue;
    }

    for (let p = 1; p < stroke.points.length; p += 1) {
      const a = userToLocal(state, stroke.points[p - 1]);
      const b = userToLocal(state, stroke.points[p]);
      if (strokeDistanceSq(point, a, b) <= thresholdSq) {
        return i;
      }
    }
  }

  return -1;
}
function pointOnSegment(a: DrawPoint, b: DrawPoint, c: DrawPoint): boolean {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) &&
         Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}

function orientation(p: DrawPoint, q: DrawPoint, r: DrawPoint): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function findSegmentIntersection(p1: DrawPoint, q1: DrawPoint, p2: DrawPoint, q2: DrawPoint): { intersects: boolean; x?: number; y?: number } {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    const x1 = p1.x; const y1 = p1.y;
    const x2 = q1.x; const y2 = q1.y;
    const x3 = p2.x; const y3 = p2.y;
    const x4 = q2.x; const y4 = q2.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return { intersects: false };

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return {
      intersects: true,
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }

  if (o1 === 0 && pointOnSegment(p1, q1, p2)) return { intersects: true, x: p2.x, y: p2.y };
  if (o2 === 0 && pointOnSegment(p1, q1, q2)) return { intersects: true, x: q2.x, y: q2.y };
  if (o3 === 0 && pointOnSegment(p2, q2, p1)) return { intersects: true, x: p1.x, y: p1.y };
  if (o4 === 0 && pointOnSegment(p2, q2, q1)) return { intersects: true, x: q1.x, y: q1.y };

  return { intersects: false };
}

function findStrokesIntersection(a: DrawPoint[], b: DrawPoint[]): { intersects: boolean; x?: number; y?: number } {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return { intersects: false };
  }

  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const hit = findSegmentIntersection(a[i], a[i + 1], b[j], b[j + 1]);
      if (hit.intersects) return hit;
    }
  }

  return { intersects: false };
}

function localToUser(state: RegressionState, p: DrawPoint): DrawPoint {
  const board = state.board;
  if (!board || !board.origin || !board.origin.scrCoords) return { x: p.x, y: p.y };

  const ox = Number(board.origin.scrCoords[1] || 0);
  const oy = Number(board.origin.scrCoords[2] || 0);
  const ux = Number(board.unitX || 1) || 1;
  const uy = Number(board.unitY || 1) || 1;

  return {
    x: (p.x - ox) / ux,
    y: (oy - p.y) / uy
  };
}

function userToLocal(state: RegressionState, p: DrawPoint): DrawPoint {
  const board = state.board;
  if (!board || !board.origin || !board.origin.scrCoords) return { x: p.x, y: p.y };

  const ox = Number(board.origin.scrCoords[1] || 0);
  const oy = Number(board.origin.scrCoords[2] || 0);
  const ux = Number(board.unitX || 1) || 1;
  const uy = Number(board.unitY || 1) || 1;

  return {
    x: ox + p.x * ux,
    y: oy - p.y * uy
  };
}

function ensurePointBuckets(boardId: string): void {
  window.__points = window.__points || {};
  window.__points[boardId] = window.__points[boardId] || {};
}

function createAutoPoint(state: RegressionState, x: number, y: number, key?: string): AutoPointData | null {
  const board = state.board;
  if (!board || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const pointKey = String(key || ('auto-x-' + Date.now() + '-' + Math.floor(Math.random() * 1000000)));

  try {
    const pt = board.create('point', [x, y], {
      name: pointKey,
      fixed: false,
      withLabel: false,
      showInfobox: false,
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 3,
      face: 'x',
      size: 7
    });

    ensurePointBuckets(state.boardId);
    window.__points[state.boardId][pointKey] = pt;
    if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances();
    if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas();
  } catch (e) {
    return null;
  }

  const data: AutoPointData = { key: pointKey, x, y };
  const idx = state.autoCreatedPointsData.findIndex((p) => p.key === pointKey);
  if (idx >= 0) {
    state.autoCreatedPointsData[idx] = data;
  } else {
    state.autoCreatedPointsData.push(data);
  }

  return data;
}

function removeAutoPoint(state: RegressionState, key: string): AutoPointData | null {
  const pointKey = String(key || '').trim();
  if (!pointKey) return null;

  let data = state.autoCreatedPointsData.find((p) => p.key === pointKey) || null;

  try {
    ensurePointBuckets(state.boardId);
    const pt = window.__points[state.boardId][pointKey];
    if (!data && pt && pt.coords && Array.isArray(pt.coords.usrCoords)) {
      data = {
        key: pointKey,
        x: Number(pt.coords.usrCoords[1] || 0),
        y: Number(pt.coords.usrCoords[2] || 0)
      };
    }

    if (pt && state.board) {
      state.board.removeObject(pt);
    }
    delete window.__points[state.boardId][pointKey];
    if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances();
    if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas();
  } catch (e) {}

  state.autoCreatedPointsData = state.autoCreatedPointsData.filter((p) => p.key !== pointKey);
  return data;
}

function findNearestAutoPoint(state: RegressionState, localPoint: DrawPoint, maxDistancePx: number): AutoPointData | null {
  if (!Array.isArray(state.autoCreatedPointsData) || !state.autoCreatedPointsData.length) return null;

  let best: AutoPointData | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < state.autoCreatedPointsData.length; i += 1) {
    const p = state.autoCreatedPointsData[i];
    const lp = userToLocal(state, { x: p.x, y: p.y });
    const dx = lp.x - localPoint.x;
    const dy = lp.y - localPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }

  if (!best || bestDist > maxDistancePx) return null;
  return best;
}

function getSelectableBoardPoints(state: RegressionState): AutoPointData[] {
  const board = state.board;
  const boardId = state.boardId;
  if (!board) return [];

  const out: AutoPointData[] = [];
  const seen = new Set<string>();

  const pushPoint = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    const type = String(obj.elType || '').toLowerCase();
    if (type !== 'point' && type !== 'glider') return;

    try {
      if (obj.visPropCalc && obj.visPropCalc.visible === false) return;
      if (obj.visProp && obj.visProp.visible === false) return;
    } catch (e) {}

    let x = NaN;
    let y = NaN;
    try {
      if (typeof obj.X === 'function' && typeof obj.Y === 'function') {
        x = Number(obj.X());
        y = Number(obj.Y());
      }
    } catch (e) {}

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      try {
        const usr = obj.coords && obj.coords.usrCoords;
        if (Array.isArray(usr) && usr.length >= 3) {
          const w = Number(usr[0]);
          if (Number.isFinite(w) && Math.abs(w) > 1e-12) {
            x = Number(usr[1]) / w;
            y = Number(usr[2]) / w;
          }
        }
      } catch (e) {}
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const key = String(obj.id || obj.name || ('xy:' + x.toFixed(6) + ',' + y.toFixed(6)));
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, x, y });
  };

  const namedPoints = (window.__points && boardId && window.__points[boardId]) || null;
  if (namedPoints && typeof namedPoints === 'object') {
    Object.keys(namedPoints).forEach((name) => {
      pushPoint(namedPoints[name]);
    });
  }

  if (!out.length) {
    if (Array.isArray(board.objectsList)) {
      board.objectsList.forEach(pushPoint);
    }
    if (board.objects && typeof board.objects === 'object') {
      Object.keys(board.objects).forEach((key) => {
        pushPoint(board.objects[key]);
      });
    }
  }

  return out;
}

function findNearestSelectableBoardPoint(state: RegressionState, localPoint: DrawPoint, maxDistancePx: number): AutoPointData | null {
  const candidates = getSelectableBoardPoints(state);
  if (!candidates.length) return null;

  let best: AutoPointData | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const localCandidate = userToLocal(state, candidate);
    const dx = localCandidate.x - localPoint.x;
    const dy = localCandidate.y - localPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  if (!best || bestDist > maxDistancePx) return null;
  return best;
}

function fitLinear(points: DrawPoint[]): { m: number; n: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const point = pts[i];
    sumX += point.x;
    sumY += point.y;
    sumXX += point.x * point.x;
    sumXY += point.x * point.y;
  }

  const denom = pts.length * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;

  const m = (pts.length * sumXY - sumX * sumY) / denom;
  const n = (sumY - m * sumX) / pts.length;

  let error = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const point = pts[i];
    const diff = point.y - (m * point.x + n);
    error += diff * diff;
  }

  return {
    m,
    n,
    error: Math.sqrt(error / pts.length)
  };
}

function fitQuadratic(points: DrawPoint[]): { a: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 3) return null;

  // Fit y = AxÂ² + Bx + C using least squares
  let sumX = 0, sumY = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0, sumXY = 0, sumX2Y = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const x = pts[i].x;
    const y = pts[i].y;
    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x3 * x;
    sumX += x;
    sumY += y;
    sumX2 += x2;
    sumX3 += x3;
    sumX4 += x4;
    sumXY += x * y;
    sumX2Y += x2 * y;
  }

  const n = pts.length;
  const A = [[sumX4, sumX3, sumX2], [sumX3, sumX2, sumX], [sumX2, sumX, n]];
  const b = [sumX2Y, sumXY, sumY];

  // Gauss-Jordan elimination
  for (let i = 0; i < 3; i += 1) {
    let maxRow = i;
    for (let j = i + 1; j < 3; j += 1) {
      if (Math.abs(A[j][i]) > Math.abs(A[maxRow][i])) {
        maxRow = j;
      }
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    if (Math.abs(A[i][i]) < 1e-12) return null;

    for (let j = i + 1; j < 3; j += 1) {
      const factor = A[j][i] / A[i][i];
      for (let k = i; k < 3; k += 1) {
        A[j][k] -= factor * A[i][k];
      }
      b[j] -= factor * b[i];
    }
  }

  // Back substitution
  const coeff = [0, 0, 0];
  for (let i = 2; i >= 0; i -= 1) {
    coeff[i] = b[i];
    for (let j = i + 1; j < 3; j += 1) {
      coeff[i] -= A[i][j] * coeff[j];
    }
    coeff[i] /= A[i][i];
  }

  const polyA = coeff[0];
  const polyB = coeff[1];
  const polyC = coeff[2];

  // Convert from y = AxÂ² + Bx + C to y = a(x+c)Â² + d
  // Using vertex form: x_vertex = -B/(2A), y_vertex = C - BÂ²/(4A)
  const a = polyA;
  if (Math.abs(a) < 1e-9) return null;
  const c = polyB / (2 * a);
  const d = polyC - (polyB * polyB) / (4 * a);

  let error = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const x = pts[i].x;
    const predicted = a * (x + c) * (x + c) + d;
    const diff = pts[i].y - predicted;
    error += diff * diff;
  }

  return {
    a,
    c,
    d,
    error: Math.sqrt(error / pts.length)
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row) => row.slice());
  const b = vector.slice();

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }

    if (Math.abs(a[pivot][col]) < 1e-12) return null;

    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < n; k += 1) {
        a[row][k] -= factor * a[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < n; k += 1) sum -= a[row][k] * x[k];
    if (Math.abs(a[row][row]) < 1e-12) return null;
    x[row] = sum / a[row][row];
  }

  return x;
}

function fitPolynomial(points: DrawPoint[], degree: number): { coeff: number[]; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < degree + 1) return null;

  const n = degree + 1;
  const sums = Array(2 * degree + 1).fill(0);
  const rhs = Array(n).fill(0);

  for (let i = 0; i < pts.length; i += 1) {
    const x = pts[i].x;
    const y = pts[i].y;
    let xPow = 1;
    for (let p = 0; p <= 2 * degree; p += 1) {
      sums[p] += xPow;
      xPow *= x;
    }
    xPow = 1;
    for (let row = 0; row < n; row += 1) {
      rhs[row] += y * xPow;
      xPow *= x;
    }
  }

  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      matrix[row][col] = sums[row + col];
    }
  }

  const coeff = solveLinearSystem(matrix, rhs);
  if (!coeff) return null;

  let error = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const x = pts[i].x;
    let yHat = 0;
    let xPow = 1;
    for (let p = 0; p < coeff.length; p += 1) {
      yHat += coeff[p] * xPow;
      xPow *= x;
    }
    const diff = pts[i].y - yHat;
    error += diff * diff;
  }

  return {
    coeff,
    error: Math.sqrt(error / pts.length)
  };
}

function linear2FitFromFeature(
  points: DrawPoint[],
  featureFn: (x: number) => number,
  minUsedOverride?: number
): { A: number; d: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 2) return null;

  let sumZ = 0;
  let sumY = 0;
  let sumZZ = 0;
  let sumZY = 0;
  let used = 0;

  for (let i = 0; i < pts.length; i += 1) {
    const z = featureFn(pts[i].x);
    if (!Number.isFinite(z)) continue;
    sumZ += z;
    sumY += pts[i].y;
    sumZZ += z * z;
    sumZY += z * pts[i].y;
    used += 1;
  }

  const minUsed = Number.isFinite(minUsedOverride as number) ? Math.max(2, Number(minUsedOverride)) : 4;
  if (used < minUsed) return null;

  const denom = used * sumZZ - sumZ * sumZ;
  if (Math.abs(denom) < 1e-12) return null;
  const A = (used * sumZY - sumZ * sumY) / denom;
  const d = (sumY - A * sumZ) / used;
  if (!Number.isFinite(A) || !Number.isFinite(d)) return null;
  return { A, d };
}

function computeRmse(points: DrawPoint[], predictFn: (x: number) => number): number {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (!pts.length) return Number.POSITIVE_INFINITY;
  let se = 0;
  let used = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const yHat = predictFn(pts[i].x);
    if (!Number.isFinite(yHat)) continue;
    const diff = pts[i].y - yHat;
    se += diff * diff;
    used += 1;
  }
  if (!used) return Number.POSITIVE_INFINITY;
  return Math.sqrt(se / used);
}

function fitCubic(points: DrawPoint[]): { a: number; b: number; c: number; d: number; error: number } | null {
  const fitted = fitPolynomial(points, 3);
  if (!fitted) return null;
  return {
    a: Number(fitted.coeff[3] || 0),
    b: Number(fitted.coeff[2] || 0),
    c: Number(fitted.coeff[1] || 0),
    d: Number(fitted.coeff[0] || 0),
    error: fitted.error
  };
}

function fitQuartic(points: DrawPoint[]): { a: number; b: number; c: number; d: number; f: number; error: number } | null {
  const fitted = fitPolynomial(points, 4);
  if (!fitted) return null;
  return {
    a: Number(fitted.coeff[4] || 0),
    b: Number(fitted.coeff[3] || 0),
    c: Number(fitted.coeff[2] || 0),
    d: Number(fitted.coeff[1] || 0),
    f: Number(fitted.coeff[0] || 0),
    error: fitted.error
  };
}

function fitSin(points: DrawPoint[]): { A: number; b: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 4) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(0.5, xMax - xMin);

  const bMin = 0.15 / xSpan;
  const bMax = Math.max(22 / xSpan, 5);
  const cRange = xSpan * 1.5;

  let coarseBest: { A: number; b: number; c: number; d: number; error: number } | null = null;
  for (let bi = 0; bi <= 44; bi += 1) {
    const b = bMin + (bMax - bMin) * (bi / 44);
    for (let ci = 0; ci <= 34; ci += 1) {
      const c = -cRange + 2 * cRange * (ci / 34);
      const lin = linear2FitFromFeature(pts, (x) => Math.sin(b * (x + c)), 4);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => A * Math.sin(b * (x + c)) + d);
      if (!Number.isFinite(error)) continue;
      if (!coarseBest || error < coarseBest.error) coarseBest = { A, b, c, d, error };
    }
  }

  if (!coarseBest) return null;

  let best = coarseBest;
  const bFineMin = coarseBest.b * 0.88;
  const bFineMax = coarseBest.b * 1.12;
  for (let bi = 0; bi <= 30; bi += 1) {
    const b = bFineMin + (bFineMax - bFineMin) * (bi / 30);
    for (let ci = 0; ci <= 34; ci += 1) {
      const c = -cRange + 2 * cRange * (ci / 34);
      const lin = linear2FitFromFeature(pts, (x) => Math.sin(b * (x + c)), 4);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => A * Math.sin(b * (x + c)) + d);
      if (!Number.isFinite(error)) continue;
      if (error < best.error) best = { A, b, c, d, error };
    }
  }

  return best;
}

function fitExp(points: DrawPoint[]): { A: number; b: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 3) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(0.5, xMax - xMin);

  const bMin = -3 / xSpan;
  const bMax = 3 / xSpan;
  const cRange = xSpan;

  let best: { A: number; b: number; c: number; d: number; error: number } | null = null;
  for (let bi = 0; bi <= 32; bi += 1) {
    const b = bMin + (bMax - bMin) * (bi / 32);
    for (let ci = 0; ci <= 28; ci += 1) {
      const c = -cRange + 2 * cRange * (ci / 28);
      const lin = linear2FitFromFeature(pts, (x) => {
        const z = Math.exp(b * (x + c));
        return Number.isFinite(z) ? z : NaN;
      }, 3);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => A * Math.exp(b * (x + c)) + d);
      if (!Number.isFinite(error)) continue;
      if (!best || error < best.error) best = { A, b, c, d, error };
    }
  }

  return best;
}

function fitLog(points: DrawPoint[]): { A: number; b: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 3) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(0.5, xMax - xMin);

  const bMin = 0.2 / xSpan;
  const bMax = 8 / xSpan;
  const cBase = -xMin + 1e-3;
  const cRange = Math.max(0.5, 2 * xSpan);

  let best: { A: number; b: number; c: number; d: number; error: number } | null = null;
  for (let bi = 0; bi <= 32; bi += 1) {
    const b = bMin + (bMax - bMin) * (bi / 32);
    for (let ci = 0; ci <= 32; ci += 1) {
      const c = cBase + cRange * (ci / 32);
      const lin = linear2FitFromFeature(pts, (x) => {
        const arg = b * (x + c);
        if (arg <= 0 || !Number.isFinite(arg)) return NaN;
        const z = Math.log(arg);
        return Number.isFinite(z) ? z : NaN;
      }, 3);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => {
        const arg = b * (x + c);
        if (arg <= 0 || !Number.isFinite(arg)) return NaN;
        return A * Math.log(arg) + d;
      });
      if (!Number.isFinite(error)) continue;
      if (!best || error < best.error) best = { A, b, c, d, error };
    }
  }

  return best;
}

function fitSqrt(points: DrawPoint[]): { A: number; b: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 3) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(0.5, xMax - xMin);

  const bMin = 0.2 / xSpan;
  const bMax = 8 / xSpan;
  const cBase = -xMin + 1e-3;
  const cRange = Math.max(0.5, 2 * xSpan);

  let best: { A: number; b: number; c: number; d: number; error: number } | null = null;
  for (let bi = 0; bi <= 32; bi += 1) {
    const b = bMin + (bMax - bMin) * (bi / 32);
    for (let ci = 0; ci <= 32; ci += 1) {
      const c = cBase + cRange * (ci / 32);
      const lin = linear2FitFromFeature(pts, (x) => {
        const arg = b * (x + c);
        if (arg < 0 || !Number.isFinite(arg)) return NaN;
        const z = Math.sqrt(arg);
        return Number.isFinite(z) ? z : NaN;
      }, 3);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => {
        const arg = b * (x + c);
        if (arg < 0 || !Number.isFinite(arg)) return NaN;
        return A * Math.sqrt(arg) + d;
      });
      if (!Number.isFinite(error)) continue;
      if (!best || error < best.error) best = { A, b, c, d, error };
    }
  }

  return best;
}

function fitHyperbola(points: DrawPoint[]): { A: number; b: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 3) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(0.5, xMax - xMin);

  const bMin = -6 / xSpan;
  const bMax = 6 / xSpan;
  const cRange = Math.max(0.5, 2 * xSpan);

  let best: { A: number; b: number; c: number; d: number; error: number } | null = null;
  for (let bi = 0; bi <= 36; bi += 1) {
    const b = bMin + (bMax - bMin) * (bi / 36);
    if (Math.abs(b) < 1e-6) continue;
    for (let ci = 0; ci <= 34; ci += 1) {
      const c = -cRange + 2 * cRange * (ci / 34);
      const lin = linear2FitFromFeature(pts, (x) => {
        const denom = b * (x + c);
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return NaN;
        const z = 1 / denom;
        return Number.isFinite(z) ? z : NaN;
      }, 3);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => {
        const denom = b * (x + c);
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return NaN;
        return A / denom + d;
      });
      if (!Number.isFinite(error)) continue;
      if (!best || error < best.error) best = { A, b, c, d, error };
    }
  }

  return best;
}

function fitHyperbola2(points: DrawPoint[]): { A: number; b: number; c: number; d: number; error: number } | null {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length < 3) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(0.5, xMax - xMin);

  const bMin = -3;
  const bMax = 3;

  let best: { A: number; b: number; c: number; d: number; error: number } | null = null;
  for (let bi = 0; bi <= 36; bi += 1) {
    const b = bMin + (bMax - bMin) * (bi / 36);
    if (Math.abs(b) < 1e-6) continue;
    const bxMin = b * xMin;
    const bxMax = b * xMax;
    const cCenter = (bxMin + bxMax) * 0.5;
    const cRange = Math.max(0.5, Math.abs(b) * xSpan * 1.8);
    const eps = Math.max(1e-6, 0.04 * Math.max(0.5, Math.abs(b) * xSpan));
    for (let ci = 0; ci <= 34; ci += 1) {
      const c = cCenter - cRange + 2 * cRange * (ci / 34);
      const lin = linear2FitFromFeature(pts, (x) => {
        const t = b * x - c;
        if (!Number.isFinite(t) || Math.abs(t) < eps) return NaN;
        const z = 1 / (t * t);
        return Number.isFinite(z) ? z : NaN;
      }, 3);
      if (!lin) continue;
      const A = lin.A;
      const d = lin.d;
      const error = computeRmse(pts, (x) => {
        const t = b * x - c;
        if (!Number.isFinite(t) || Math.abs(t) < eps) return NaN;
        return A / (t * t) + d;
      });
      if (!Number.isFinite(error)) continue;
      if (!best || error < best.error) best = { A, b, c, d, error };
    }
  }

  return best;
}

function collectStrokePoints(stroke: DrawStroke): DrawPoint[] {
  if (!stroke || !Array.isArray(stroke.points)) return [];
  return stroke.points
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));
}

function normalizeStrokeColor(color: string): string {
  return String(color || '').trim().toLowerCase();
}

function collectSameColorStrokePoints(state: RegressionState, stroke: DrawStroke): DrawPoint[] {
  if (!state || !stroke) return [];

  const targetColor = normalizeStrokeColor(stroke.color);
  if (!targetColor) return collectStrokePoints(stroke);

  const grouped: DrawPoint[] = [];
  const strokes = Array.isArray(state.strokes) ? state.strokes : [];
  for (let i = 0; i < strokes.length; i += 1) {
    const candidate = strokes[i];
    if (!candidate) continue;
    if (normalizeStrokeColor(candidate.color) !== targetColor) continue;
    const points = collectStrokePoints(candidate);
    for (let j = 0; j < points.length; j += 1) grouped.push(points[j]);
  }

  return grouped.length ? grouped : collectStrokePoints(stroke);
}

function simplifyStrokeFitPoints(points: DrawPoint[]): DrawPoint[] {
  const pts = Array.isArray(points)
    ? points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (pts.length <= 3) return pts.slice();

  let xMin = pts[0].x;
  let xMax = pts[0].x;
  let yMin = pts[0].y;
  let yMax = pts[0].y;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i];
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }

  const dx = xMax - xMin;
  const dy = yMax - yMin;
  const diag = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
  const minStep = diag * 0.005;

  const reduced: DrawPoint[] = [pts[0]];
  let last = pts[0];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i];
    const ddx = p.x - last.x;
    const ddy = p.y - last.y;
    if (Math.sqrt(ddx * ddx + ddy * ddy) >= minStep) {
      reduced.push(p);
      last = p;
    }
  }
  reduced.push(pts[pts.length - 1]);

  const MAX_POINTS = 260;
  if (reduced.length <= MAX_POINTS) return reduced;

  const sampled: DrawPoint[] = [];
  for (let i = 0; i < MAX_POINTS; i += 1) {
    const t = i / (MAX_POINTS - 1);
    const idx = Math.min(reduced.length - 1, Math.round(t * (reduced.length - 1)));
    sampled.push(reduced[idx]);
  }
  return sampled;
}

function removeGraph(state: RegressionState, key: 'recognitionGraph' | 'regressionGraph'): void {
  const graph = state[key];
  if (!graph || !graph.board) {
    state[key] = null;
    return;
  }

  try {
    graph.board.removeObject(graph);
  } catch (e) {}
  state[key] = null;
}

function renderLinearGraph(state: RegressionState, m: number, n: number, color: string, key: 'recognitionGraph' | 'regressionGraph'): boolean {
  const board = state.board;
  if (!board || !Number.isFinite(m) || !Number.isFinite(n)) return false;

  removeGraph(state, key);

  try {
    const graph = board.create('functiongraph', [function(x: number) {
      return m * x + n;
    }], {
      strokeColor: color,
      highlightStrokeColor: color,
      strokeWidth: 3,
      fixed: true,
      withLabel: false
    });
    state[key] = graph;
    try { board.update(); } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

type AnyAnalysisEntry = AnalysisEntry<any>;

type GraphModelDescriptor = {
  // Plotted curve y = basis(model)(x).
  basis: (model: any) => (x: number) => number;
  // Mutates `model` in place from the snapshot taken at pointer-down plus the
  // pointer delta (dx, dy) in user coordinates.
  drag: (model: any, snap: any, dx: number, dy: number) => void;
};

const GRAPH_MODELS: Record<string, GraphModelDescriptor> = {
  linear: {
    basis: (m) => (x) => m.m * x + m.n,
    // Pan line while preserving slope m: y = m*x + n => n' = n + dy - m*dx
    drag: (m, s, dx, dy) => { m.n = s.n + dy - (s.m * dx); }
  },
  quadratic: {
    basis: (m) => (x) => m.a * (x + m.c) * (x + m.c) + m.d,
    // Pan parabola by shifting d only (keep a and c constant)
    drag: (m, s, _dx, dy) => { m.d = s.d + dy; }
  },
  cubic: {
    basis: (m) => (x) => m.a * x * x * x + m.b * x * x + m.c * x + m.d,
    drag: (m, s, dx, dy) => {
      m.d = s.d + dy;
      const n = -dx;
      m.b = s.b + 3 * s.a * n;
      m.c = s.c + 2 * s.b * n + 3 * s.a * n * n;
      m.d = m.d + s.c * n + s.b * n * n + s.a * n * n * n;
    }
  },
  quartic: {
    basis: (m) => (x) => m.a * x * x * x * x + m.b * x * x * x + m.c * x * x + m.d * x + m.f,
    drag: (m, s, dx, dy) => {
      m.f = s.f + dy;
      const n = -dx;
      const n2 = n * n, n3 = n2 * n, n4 = n3 * n;
      m.b = s.b + 4 * s.a * n;
      m.c = s.c + 3 * s.b * n + 6 * s.a * n2;
      m.d = s.d + 2 * s.c * n + 3 * s.b * n2 + 4 * s.a * n3;
      m.f = m.f + s.d * n + s.c * n2 + s.b * n3 + s.a * n4;
    }
  },
  sin: {
    basis: (m) => (x) => m.A * Math.sin(m.b * (x + m.c)) + m.d,
    drag: (m, s, dx, dy) => { m.c = s.c - dx; m.d = s.d + dy; }
  },
  exp: {
    basis: (m) => (x) => m.A * Math.exp(m.b * (x + m.c)) + m.d,
    drag: (m, s, dx, dy) => { m.c = s.c - dx; m.d = s.d + dy; }
  },
  log: {
    basis: (m) => (x) => {
      const arg = Math.abs(m.b) * (x + m.c);
      if (!Number.isFinite(arg) || arg <= 0) return NaN;
      return m.A * Math.log(arg) + m.d;
    },
    drag: (m, s, dx, dy) => { m.c = s.c - dx; m.d = s.d + dy; }
  },
  sqrt: {
    basis: (m) => (x) => {
      const arg = Math.abs(m.b) * (x + m.c);
      if (!Number.isFinite(arg) || arg < 0) return NaN;
      return m.A * Math.sqrt(arg) + m.d;
    },
    drag: (m, s, dx, dy) => { m.c = s.c - dx; m.d = s.d + dy; }
  },
  hyperbola: {
    basis: (m) => (x) => {
      const denom = m.b * (x + m.c);
      if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return NaN;
      return m.A / denom + m.d;
    },
    drag: (m, s, dx, dy) => { m.c = s.c - dx; m.d = s.d + dy; }
  },
  hyperbola2: {
    basis: (m) => (x) => {
      const t = m.b * x - m.c;
      if (!Number.isFinite(t) || Math.abs(t) < 1e-6) return NaN;
      return m.A / (t * t) + m.d;
    },
    drag: (m, s, dx, dy) => { m.c = s.c + s.b * dx; m.d = s.d + dy; }
  }
};

function removeEntryGraph(entry: AnyAnalysisEntry): void {
  const graph = entry.graph;
  if (!graph || !graph.board) {
    entry.graph = null;
    return;
  }

  if (graph.__liaAnalysisDragDetach && typeof graph.__liaAnalysisDragDetach === 'function') {
    try { graph.__liaAnalysisDragDetach(); } catch (e) {}
  }

  try {
    graph.board.removeObject(graph);
  } catch (e) {}
  entry.graph = null;
}

function renderEntryGraph(state: RegressionState, entry: AnyAnalysisEntry, descriptor: GraphModelDescriptor): boolean {
  const board = state.board;
  if (!board) return false;

  removeEntryGraph(entry);

  try {
    const fn = descriptor.basis(entry.model);
    const graph = board.create('functiongraph', [function(x: number) {
      return fn(x);
    }], {
      strokeColor: entry.color,
      highlightStrokeColor: entry.color,
      strokeWidth: 3,
      fixed: true,
      withLabel: false
    });
    entry.graph = graph;
    try { board.update(); } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

function bindEntryDrag(state: RegressionState, entry: AnyAnalysisEntry, descriptor: GraphModelDescriptor): void {
  const graph = entry.graph;
  const board = state.board;
  if (!graph || !board) return;
  if (graph.__liaAnalysisDragBound) return;

  const targets = [graph.rendNode, graph.rendNodeStroke].filter(Boolean);
  if (!targets.length) return;

  const onPointerDown = (evt: PointerEvent) => {
    evt.preventDefault();
    evt.stopPropagation();

    targets.forEach((target: any) => {
      try { target.style.cursor = 'grabbing'; } catch (e) {}
    });

    const pointerId = evt.pointerId;
    const start = eventToUser(board, evt);
    const snap = { ...entry.model };
    let moveRaf = 0;

    const onMove = (moveEvt: PointerEvent) => {
      if (moveEvt.pointerId !== pointerId) return;
      moveEvt.preventDefault();
      moveEvt.stopPropagation();

      const now = eventToUser(board, moveEvt);
      const dx = now.x - start.x;
      const dy = now.y - start.y;

      descriptor.drag(entry.model, snap, dx, dy);

      if (!moveRaf) {
        moveRaf = window.requestAnimationFrame(() => {
          moveRaf = 0;
          updateEntryGraph(state, entry, descriptor);
          if (entry.syncUi) entry.syncUi(true);
          redrawCanvas(state);
        });
      }
    };

    const onUp = (upEvt: PointerEvent) => {
      if (upEvt.pointerId !== pointerId) return;
      upEvt.preventDefault();
      upEvt.stopPropagation();

      targets.forEach((target: any) => {
        try { target.style.cursor = 'grab'; } catch (e) {}
      });

      if (moveRaf) {
        try { window.cancelAnimationFrame(moveRaf); } catch (e) {}
        moveRaf = 0;
      }

      if (entry.syncUi) entry.syncUi(false);
      updateEntryGraph(state, entry, descriptor);
      redrawCanvas(state);

      try { window.removeEventListener('pointermove', onMove, true); } catch (e) {}
      try { window.removeEventListener('pointerup', onUp, true); } catch (e) {}
      try { window.removeEventListener('pointercancel', onUp, true); } catch (e) {}
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  };

  targets.forEach((target: any) => {
    try {
      target.style.cursor = 'grab';
      target.style.touchAction = 'none';
      target.addEventListener('pointerdown', onPointerDown, true);
    } catch (e) {}
  });

  graph.__liaAnalysisDragBound = true;
  graph.__liaAnalysisDragDetach = () => {
    targets.forEach((target: any) => {
      try { target.removeEventListener('pointerdown', onPointerDown, true); } catch (e) {}
    });
  };
}

function updateEntryGraph(state: RegressionState, entry: AnyAnalysisEntry, descriptor: GraphModelDescriptor): void {
  const ok = renderEntryGraph(state, entry, descriptor);
  if (ok) bindEntryDrag(state, entry, descriptor);
}

// Public per-model wrappers (existing call sites depend on these names).
function removeAnalysisEntryGraph(entry: LinearAnalysisEntry): void { removeEntryGraph(entry); }
function removeQuadraticAnalysisEntryGraph(entry: QuadraticAnalysisEntry): void { removeEntryGraph(entry); }
function removeCubicAnalysisEntryGraph(entry: CubicAnalysisEntry): void { removeEntryGraph(entry); }
function removeQuarticAnalysisEntryGraph(entry: QuarticAnalysisEntry): void { removeEntryGraph(entry); }
function removeSinAnalysisEntryGraph(entry: SinAnalysisEntry): void { removeEntryGraph(entry); }
function removeExpAnalysisEntryGraph(entry: ExpAnalysisEntry): void { removeEntryGraph(entry); }
function removeLogAnalysisEntryGraph(entry: LogAnalysisEntry): void { removeEntryGraph(entry); }
function removeSqrtAnalysisEntryGraph(entry: SqrtAnalysisEntry): void { removeEntryGraph(entry); }
function removeHyperbolaAnalysisEntryGraph(entry: HyperbolaAnalysisEntry): void { removeEntryGraph(entry); }
function removeHyperbola2AnalysisEntryGraph(entry: Hyperbola2AnalysisEntry): void { removeEntryGraph(entry); }

function updateAnalysisGraph(state: RegressionState, entry: LinearAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.linear); }
function updateQuadraticAnalysisGraph(state: RegressionState, entry: QuadraticAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.quadratic); }
function updateCubicAnalysisGraph(state: RegressionState, entry: CubicAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.cubic); }
function updateQuarticAnalysisGraph(state: RegressionState, entry: QuarticAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.quartic); }
function updateSinAnalysisGraph(state: RegressionState, entry: SinAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.sin); }
function updateExpAnalysisGraph(state: RegressionState, entry: ExpAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.exp); }
function updateLogAnalysisGraph(state: RegressionState, entry: LogAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.log); }
function updateSqrtAnalysisGraph(state: RegressionState, entry: SqrtAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.sqrt); }
function updateHyperbolaAnalysisGraph(state: RegressionState, entry: HyperbolaAnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.hyperbola); }
function updateHyperbola2AnalysisGraph(state: RegressionState, entry: Hyperbola2AnalysisEntry): void { updateEntryGraph(state, entry, GRAPH_MODELS.hyperbola2); }

function recognizeQuadraticFromStroke(state: RegressionState, stroke: DrawStroke): boolean {
  const fitted = fitQuadratic(collectStrokePoints(stroke));
  if (!fitted) return false;
  if (!Number.isFinite(fitted.error) || fitted.error > 0.55) return false;
  const linkedModels = createLinkedModels(
    { m: 0, n: fitted.d },
    { a: fitted.a, c: fitted.c, d: fitted.d },
    { a: 0.1, b: 0, c: 0, d: fitted.d },
    { a: 0.1, b: 0.1, c: 0, d: 0, f: fitted.d }
  );
  const classProbabilities = computeStableClassProbabilities(null, fitted.error, null, null, null, null, null, null, null, 'quadratic');
  return openQuadraticAnalysisOverlay(state, fitted.a, fitted.c, fitted.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
}

function computeQuadraticRegression(state: RegressionState): boolean {
  if (!Array.isArray(state.regressionPoints) || state.regressionPoints.length < 3) return false;
  const fitted = fitQuadratic(state.regressionPoints);
  if (!fitted) return false;
  const linkedModels = createLinkedModels(
    { m: 0, n: fitted.d },
    { a: fitted.a, c: fitted.c, d: fitted.d },
    { a: 0.1, b: 0, c: 0, d: fitted.d },
    { a: 0.1, b: 0.1, c: 0, d: 0, f: fitted.d }
  );
  const classProbabilities = computeStableClassProbabilities(null, fitted.error, null, null, null, null, null, null, null, 'quadratic');
  return openQuadraticAnalysisOverlay(state, fitted.a, fitted.c, fitted.d, 'Regression', { classProbabilities, linkedModels });
}

function analyzeStrokeStructure(
  points: DrawPoint[],
  quadraticFit: { a: number; c: number; d: number; error: number } | null,
  linearFit: { m: number; n: number; error: number } | null,
  cubicFit: { a: number; b: number; c: number; d: number; error: number } | null,
  quarticFit: { a: number; b: number; c: number; d: number; f: number; error: number } | null,
  yMin: number,
  yMax: number,
  xMin: number,
  xMax: number,
  ySpan: number,
  xSpan: number
): {
  isOscillating: boolean;
  isMonotone: boolean;
  isAsymmetric: boolean;
  isSymmetric: boolean;
  isConcave: boolean;
  isConvex: boolean;
  isNearlyLinear: boolean;
  isStronglyLinear: boolean;
  curvatureNorm: number;
  quadGain: number;
  cubicGain: number;
} {
  // 1. Oscillation: direction reversals
  let dirChanges = 0;
  let lastDir = 0;
  const noiseThreshold = ySpan * 0.03;
  for (let i = 1; i < points.length; i++) {
    const dy = points[i].y - points[i - 1].y;
    if (Math.abs(dy) < noiseThreshold) continue;
    const dir = dy > 0 ? 1 : -1;
    if (lastDir !== 0 && dir !== lastDir) dirChanges++;
    lastDir = dir;
  }
  const isOscillating = dirChanges >= 2;
  const isMonotone = dirChanges === 0;

  // 2. Endpoint asymmetry
  function yAt(xTarget: number): number {
    if (points[0].x >= xTarget) return points[0].y;
    if (points[points.length - 1].x <= xTarget) return points[points.length - 1].y;
    for (let i = 1; i < points.length; i++) {
      if (points[i].x >= xTarget) {
        const t = (xTarget - points[i - 1].x) / (points[i].x - points[i - 1].x);
        return points[i - 1].y + t * (points[i].y - points[i - 1].y);
      }
    }
    return points[points.length - 1].y;
  }
  const yLeft = yAt(xMin + xSpan * 0.05);
  const yRight = yAt(xMax - xSpan * 0.05);
  const endpointDiff = Math.abs(yLeft - yRight) / Math.max(ySpan, 0.001);
  const isSymmetric = endpointDiff < 0.22;
  const isAsymmetric = endpointDiff > 0.35;

  // 3. Curvature sign from quadratic fit
  const isConcave = quadraticFit && quadraticFit.a < -1e-6;
  const isConvex = quadraticFit && quadraticFit.a > 1e-6;

  // 4. Near-linear detection
  const curvatureNorm = quadraticFit ? Math.abs(quadraticFit.a) * xSpan * xSpan / Math.max(ySpan, 0.001) : Infinity;
  
  let quadGain = 0;
  let cubicGain = 0;
  if (linearFit && quadraticFit && Number.isFinite(linearFit.error) && Number.isFinite(quadraticFit.error)) {
    quadGain = (linearFit.error - quadraticFit.error) / Math.max(linearFit.error, 1e-6);
  }
  if (linearFit && cubicFit && Number.isFinite(linearFit.error) && Number.isFinite(cubicFit.error)) {
    cubicGain = (linearFit.error - cubicFit.error) / Math.max(linearFit.error, 1e-6);
  }

  const isNearlyLinear = !!linearFit && (
    curvatureNorm < 0.09 ||
    (curvatureNorm < 0.14 && quadGain < 0.14 && cubicGain < 0.18)
  );
  const isStronglyLinear = !!linearFit && dirChanges <= 1 && (
    curvatureNorm < 0.18 &&
    quadGain < 0.22 &&
    cubicGain < 0.26
  );

  return {
    isOscillating, isMonotone, isAsymmetric, isSymmetric,
    isConcave: !!isConcave, isConvex: !!isConvex,
    isNearlyLinear, isStronglyLinear, curvatureNorm, quadGain, cubicGain
  };
}

function recognizeLinearFromStroke(state: RegressionState, stroke: DrawStroke): boolean {
  const points = simplifyStrokeFitPoints(collectSameColorStrokePoints(state, stroke));
  if (points.length < 2) return false;

  const linear = fitLinear(points);
  const quadratic = fitQuadratic(points);
  const cubic = fitCubic(points);
  const quartic = fitQuartic(points);
  const sin = fitSin(points);
  const exp = fitExp(points);
  const log = fitLog(points);
  const sqrt = fitSqrt(points);
  const hyperbola = fitHyperbola(points);
  const hyperbola2 = fitHyperbola2(points);

  let xMin = points[0].x;
  let xMax = points[0].x;
  let yMin = points[0].y;
  let yMax = points[0].y;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < xMin) xMin = points[i].x;
    if (points[i].x > xMax) xMax = points[i].x;
    if (points[i].y < yMin) yMin = points[i].y;
    if (points[i].y > yMax) yMax = points[i].y;
  }
  const xSpan = Math.max(0.5, xMax - xMin);
  const ySpan = Math.max(0.5, yMax - yMin);
  const baseTol = Math.max(0.35, ySpan * 0.22);

  const linearFinite = !!linear && Number.isFinite(linear.error);
  const quadraticFinite = !!quadratic && Number.isFinite(quadratic.error);
  const cubicFinite = !!cubic && Number.isFinite(cubic.error);
  const quarticFinite = !!quartic && Number.isFinite(quartic.error);
  const sinFinite = !!sin && Number.isFinite(sin.error);
  const expFinite = !!exp && Number.isFinite(exp.error);
  const logFinite = !!log && Number.isFinite(log.error);
  const sqrtFinite = !!sqrt && Number.isFinite(sqrt.error);
  const hyperbolaFinite = !!hyperbola && Number.isFinite(hyperbola.error);
  const hyperbola2Finite = !!hyperbola2 && Number.isFinite(hyperbola2.error);

  let linearOk = linearFinite && linear!.error <= baseTol * 1.45;
  let quadraticOk = quadraticFinite && quadratic!.error <= baseTol * 1.65;
  let cubicOk = cubicFinite && cubic!.error <= baseTol * 1.85;
  let quarticOk = quarticFinite && quartic!.error <= baseTol * 2.0;
  let sinOk = sinFinite && sin!.error <= baseTol * 1.95;
  let expOk = expFinite && exp!.error <= baseTol * 1.95;
  let logOk = logFinite && log!.error <= baseTol * 1.95;
  let sqrtOk = sqrtFinite && sqrt!.error <= baseTol * 1.95;
  let hyperbolaOk = hyperbolaFinite && hyperbola!.error <= baseTol * 1.95;
  let hyperbola2Ok = hyperbola2Finite && hyperbola2!.error <= baseTol * 1.95;

  if (!linearOk && !quadraticOk && !cubicOk && !quarticOk && !sinOk && !expOk && !logOk && !sqrtOk && !hyperbolaOk && !hyperbola2Ok) {
    linearOk = linearFinite;
    quadraticOk = quadraticFinite;
    cubicOk = cubicFinite;
    quarticOk = quarticFinite;
    sinOk = sinFinite;
    expOk = expFinite;
    logOk = logFinite;
    sqrtOk = sqrtFinite;
    hyperbolaOk = hyperbolaFinite;
    hyperbola2Ok = hyperbola2Finite;
  }

  if (!linearOk && !quadraticOk && !cubicOk && !quarticOk && !sinOk && !expOk && !logOk && !sqrtOk && !hyperbolaOk && !hyperbola2Ok) return false;

  // Structural analysis
  const structure = analyzeStrokeStructure(
    points, quadratic, linear, cubic, quartic, yMin, yMax, xMin, xMax, ySpan, xSpan
  );

  // Build score-weighted candidates list (error + complexity penalty + structural adjustments)
  type ScoreCandidate = {
    key: AnalysisClassKey;
    error: number;
    score: number;
    weight: number;
    probability: number;
  };
  const candidates: ScoreCandidate[] = [];

  function addCandidate(key: AnalysisClassKey, error: number, complexity: number): void {
    if (!Number.isFinite(error)) return;
    const penalty = (complexity / Math.max(points.length, 8)) * 0.5;
    let score = error / Math.max(ySpan, 0.001) + penalty;
    candidates.push({ key, error, score, weight: 0, probability: 0 });
  }

  if (linearOk) addCandidate('linear', linear!.error, 2);
  if (quadraticOk) addCandidate('quadratic', quadratic!.error, 3);
  if (cubicOk) addCandidate('cubic', cubic!.error, 4);
  if (quarticOk) addCandidate('quartic', quartic!.error, 5);
  if (sinOk) addCandidate('sin', sin!.error, 4);
  if (expOk) addCandidate('exp', exp!.error, 4);
  if (logOk) addCandidate('log', log!.error, 3);
  if (sqrtOk) addCandidate('sqrt', sqrt!.error, 3);
  if (hyperbolaOk) addCandidate('hyperbola', hyperbola!.error, 4);
  if (hyperbola2Ok) addCandidate('hyperbola2', hyperbola2!.error, 4);

  // Apply structural score adjustments (Legacy balancing logic)
  candidates.forEach((cand) => {
    if (structure.isStronglyLinear) {
      if (cand.key === 'linear') cand.score *= 0.28;
      if (cand.key === 'quadratic') cand.score *= 1.7;
      if (cand.key === 'cubic') cand.score *= 2.0;
      if (cand.key === 'quartic') cand.score *= 2.35;
      if (['sin', 'exp', 'log', 'sqrt', 'hyperbola'].includes(cand.key)) cand.score *= 2.0;
      if (cand.key === 'hyperbola2') cand.score *= 2.2;
    }

    if (structure.isNearlyLinear && !structure.isStronglyLinear) {
      if (cand.key === 'linear') cand.score *= 0.5;
      if (cand.key === 'quadratic') cand.score *= 1.45;
      if (cand.key === 'cubic') cand.score *= 1.75;
      if (cand.key === 'quartic') cand.score *= 1.95;
      if (['sin', 'exp', 'log', 'sqrt', 'hyperbola'].includes(cand.key)) cand.score *= 1.55;
      if (cand.key === 'hyperbola2') cand.score *= 1.65;
    }

    if (structure.isOscillating) {
      if (['sqrt', 'exp', 'log'].includes(cand.key)) cand.score *= 4;
      if (cand.key === 'hyperbola2') cand.score *= 3.2;
    }

    if (structure.isMonotone && structure.isAsymmetric) {
      if (cand.key === 'sin') cand.score *= 2.5;
      if (structure.isConcave) {
        if (cand.key === 'sqrt') cand.score *= 0.4;
        if (cand.key === 'log') cand.score *= 0.55;
        if (cand.key === 'exp') cand.score *= 2.5;
        if (cand.key === 'linear') cand.score *= 1.8;
        if (cand.key === 'cubic') cand.score *= 1.8;
        if (cand.key === 'quartic') cand.score *= 1.9;
      } else if (structure.isConvex) {
        if (cand.key === 'exp') cand.score *= 0.78;
        if (cand.key === 'sqrt') cand.score *= 2.5;
        if (cand.key === 'log') cand.score *= 2.5;
        if (cand.key === 'hyperbola2') cand.score *= 0.70;
        if (cand.key === 'hyperbola') cand.score *= 0.60;
        if (cand.key === 'linear') cand.score *= 1.70;
      }
    }

    if (structure.isMonotone && structure.isSymmetric) {
      if (['sqrt', 'exp', 'log', 'hyperbola'].includes(cand.key)) cand.score *= 2.5;
      if (cand.key === 'sin') cand.score *= 0.55;
      if (cand.key === 'quartic') cand.score *= 0.85;
    }
  });

  // Gain-based pairwise comparisons
  const linearCand = candidates.find((c) => c.key === 'linear');
  const quadCand = candidates.find((c) => c.key === 'quadratic');
  const cubicCand = candidates.find((c) => c.key === 'cubic');
  const expCand = candidates.find((c) => c.key === 'exp');
  const logCand = candidates.find((c) => c.key === 'log');
  const hyper2Cand = candidates.find((c) => c.key === 'hyperbola2');
  const hyperCand = candidates.find((c) => c.key === 'hyperbola');

  if (linearCand && expCand && Number.isFinite(linearCand.error) && Number.isFinite(expCand.error)) {
    const expGain = (linearCand.error - expCand.error) / Math.max(linearCand.error, 1e-6);
    if (expGain < 0.18) {
      linearCand.score *= 0.62;
      expCand.score *= 1.55;
    } else if (expGain < 0.28) {
      linearCand.score *= 0.78;
      expCand.score *= 1.22;
    }
  }

  if (linearCand && logCand && Number.isFinite(linearCand.error) && Number.isFinite(logCand.error)) {
    const logGain = (linearCand.error - logCand.error) / Math.max(linearCand.error, 1e-6);
    if (logGain < 0.16) {
      linearCand.score *= 0.74;
      logCand.score *= 1.28;
    }
  }

  if (linearCand && hyper2Cand && Number.isFinite(linearCand.error) && Number.isFinite(hyper2Cand.error)) {
    const hyper2Gain = (linearCand.error - hyper2Cand.error) / Math.max(linearCand.error, 1e-6);
    if (hyper2Gain >= 0.12) {
      linearCand.score *= 1.55;
      hyper2Cand.score *= 0.68;
    } else if (hyper2Gain >= 0.06) {
      linearCand.score *= 1.25;
      hyper2Cand.score *= 0.80;
    }
  }

  if (linearCand && hyperCand && Number.isFinite(linearCand.error) && Number.isFinite(hyperCand.error)) {
    const hyperGain = (linearCand.error - hyperCand.error) / Math.max(linearCand.error, 1e-6);
    if (hyperGain >= 0.12) {
      linearCand.score *= 1.55;
      hyperCand.score *= 0.68;
    } else if (hyperGain >= 0.06) {
      linearCand.score *= 1.25;
      hyperCand.score *= 0.80;
    }
  }

  // Tie-break: linear when nearly equal
  if (linearCand && Number.isFinite(linearCand.error)) {
    let bestErr = Infinity;
    for (const cand of candidates) {
      if (Number.isFinite(cand.error) && cand.error < bestErr) bestErr = cand.error;
    }
    if (Number.isFinite(bestErr) && bestErr > 0) {
      const relGap = (linearCand.error - bestErr) / bestErr;
      if (relGap <= 0.1) linearCand.score *= 0.58;
      else if (relGap <= 0.16) linearCand.score *= 0.78;
    }
  }

  // Compute exponential weights
  candidates.sort((a, b) => a.score - b.score);
  const minScore = candidates[0].score;
  let totalWeight = 0;
  candidates.forEach((cand) => {
    const weight = Math.exp(-6 * Math.max(0, cand.score - minScore));
    cand.weight = weight;
    totalWeight += weight;
  });
  candidates.forEach((cand) => {
    cand.probability = totalWeight > 0 ? (cand.weight / totalWeight) * 100 : 0;
  });

  const selected = candidates[0].key;

  const linkedModels = createLinkedModels(
    linearOk ? { m: linear!.m, n: linear!.n } : { m: 0, n: 0 },
    quadraticOk ? { a: quadratic!.a, c: quadratic!.c, d: quadratic!.d } : { a: 1, c: 0, d: linearOk ? linear!.n : 0 },
    cubicOk ? { a: cubic!.a, b: cubic!.b, c: cubic!.c, d: cubic!.d } : { a: 0.1, b: 0, c: 0, d: linearOk ? linear!.n : 0 },
    quarticOk ? { a: quartic!.a, b: quartic!.b, c: quartic!.c, d: quartic!.d, f: quartic!.f } : { a: 0.1, b: 0.1, c: 0, d: 0, f: linearOk ? linear!.n : 0 },
    sinOk ? { A: sin!.A, b: sin!.b, c: sin!.c, d: sin!.d } : { A: 1, b: 1, c: 0, d: linearOk ? linear!.n : 0 },
    expOk ? { A: exp!.A, b: exp!.b, c: exp!.c, d: exp!.d } : { A: 1, b: 1, c: 0, d: linearOk ? linear!.n : 0 },
    logOk ? { A: log!.A, b: log!.b, c: log!.c, d: log!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 },
    sqrtOk ? { A: sqrt!.A, b: sqrt!.b, c: sqrt!.c, d: sqrt!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 },
    hyperbolaOk ? { A: hyperbola!.A, b: hyperbola!.b, c: hyperbola!.c, d: hyperbola!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 },
    hyperbola2Ok ? { A: hyperbola2!.A, b: hyperbola2!.b, c: hyperbola2!.c, d: hyperbola2!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 }
  );

  const classProbabilities: Record<AnalysisClassKey, number> = {
    linear: 0, quadratic: 0, cubic: 0, quartic: 0, sin: 0, exp: 0, log: 0, sqrt: 0, hyperbola: 0, hyperbola2: 0
  };
  candidates.forEach((cand) => {
    classProbabilities[cand.key] = cand.probability;
  });

  if (selected === 'quadratic' && quadraticOk) {
    return openQuadraticAnalysisOverlay(state, quadratic!.a, quadratic!.c, quadratic!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'cubic' && cubicOk) {
    return openCubicAnalysisOverlay(state, cubic!.a, cubic!.b, cubic!.c, cubic!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'quartic' && quarticOk) {
    return openQuarticAnalysisOverlay(state, quartic!.a, quartic!.b, quartic!.c, quartic!.d, quartic!.f, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'sin' && sinOk) {
    return openSinAnalysisOverlay(state, sin!.A, sin!.b, sin!.c, sin!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'exp' && expOk) {
    return openExpAnalysisOverlay(state, exp!.A, exp!.b, exp!.c, exp!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'log' && logOk) {
    return openLogAnalysisOverlay(state, log!.A, log!.b, log!.c, log!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'sqrt' && sqrtOk) {
    return openSqrtAnalysisOverlay(state, sqrt!.A, sqrt!.b, sqrt!.c, sqrt!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'hyperbola' && hyperbolaOk) {
    return openHyperbolaAnalysisOverlay(state, hyperbola!.A, hyperbola!.b, hyperbola!.c, hyperbola!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'hyperbola2' && hyperbola2Ok) {
    return openHyperbola2AnalysisOverlay(state, hyperbola2!.A, hyperbola2!.b, hyperbola2!.c, hyperbola2!.d, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }
  if (selected === 'linear' && linearOk) {
    return openLinearAnalysisOverlay(state, linear!.m, linear!.n, 'Zeichnung erkannt', { classProbabilities, linkedModels });
  }

  return false;
}

function computeLinearRegression(state: RegressionState): boolean {
  if (!Array.isArray(state.regressionPoints) || state.regressionPoints.length < 2) return false;

  const linear = fitLinear(state.regressionPoints);
  const quadratic = state.regressionPoints.length >= 3 ? fitQuadratic(state.regressionPoints) : null;
  const cubic = state.regressionPoints.length >= 4 ? fitCubic(state.regressionPoints) : null;
  const quartic = state.regressionPoints.length >= 5 ? fitQuartic(state.regressionPoints) : null;
  const sin = state.regressionPoints.length >= 4 ? fitSin(state.regressionPoints) : null;
  const exp = state.regressionPoints.length >= 3 ? fitExp(state.regressionPoints) : null;
  const log = state.regressionPoints.length >= 3 ? fitLog(state.regressionPoints) : null;
  const sqrt = state.regressionPoints.length >= 3 ? fitSqrt(state.regressionPoints) : null;
  const hyperbola = state.regressionPoints.length >= 3 ? fitHyperbola(state.regressionPoints) : null;
  const hyperbola2 = state.regressionPoints.length >= 3 ? fitHyperbola2(state.regressionPoints) : null;

  const linearOk = !!linear && Number.isFinite(linear.error);
  const quadraticOk = !!quadratic && Number.isFinite(quadratic.error);
  const cubicOk = !!cubic && Number.isFinite(cubic.error);
  const quarticOk = !!quartic && Number.isFinite(quartic.error);
  const sinOk = !!sin && Number.isFinite(sin.error);
  const expOk = !!exp && Number.isFinite(exp.error);
  const logOk = !!log && Number.isFinite(log.error);
  const sqrtOk = !!sqrt && Number.isFinite(sqrt.error);
  const hyperbolaOk = !!hyperbola && Number.isFinite(hyperbola.error);
  const hyperbola2Ok = !!hyperbola2 && Number.isFinite(hyperbola2.error);

  if (!linearOk && !quadraticOk && !cubicOk && !quarticOk && !sinOk && !expOk && !logOk && !sqrtOk && !hyperbolaOk && !hyperbola2Ok) return false;

  // Compute bounds for structural analysis
  let xMin = state.regressionPoints[0].x;
  let xMax = state.regressionPoints[0].x;
  let yMin = state.regressionPoints[0].y;
  let yMax = state.regressionPoints[0].y;
  for (const pt of state.regressionPoints) {
    if (pt.x < xMin) xMin = pt.x;
    if (pt.x > xMax) xMax = pt.x;
    if (pt.y < yMin) yMin = pt.y;
    if (pt.y > yMax) yMax = pt.y;
  }
  const xSpan = Math.max(0.5, xMax - xMin);
  const ySpan = Math.max(0.5, yMax - yMin);

  // Structural analysis
  const structure = analyzeStrokeStructure(
    state.regressionPoints, quadratic, linear, cubic, quartic, yMin, yMax, xMin, xMax, ySpan, xSpan
  );

  // Build score-weighted candidates
  type ScoreCandidate = {
    key: AnalysisClassKey;
    error: number;
    score: number;
    weight: number;
    probability: number;
  };
  const candidates: ScoreCandidate[] = [];

  function addCandidate(key: AnalysisClassKey, error: number, complexity: number): void {
    if (!Number.isFinite(error)) return;
    const penalty = (complexity / Math.max(state.regressionPoints.length, 8)) * 0.5;
    const score = error / Math.max(ySpan, 0.001) + penalty;
    candidates.push({ key, error, score, weight: 0, probability: 0 });
  }

  if (linearOk) addCandidate('linear', linear!.error, 2);
  if (quadraticOk) addCandidate('quadratic', quadratic!.error, 3);
  if (cubicOk) addCandidate('cubic', cubic!.error, 4);
  if (quarticOk) addCandidate('quartic', quartic!.error, 5);
  if (sinOk) addCandidate('sin', sin!.error, 4);
  if (expOk) addCandidate('exp', exp!.error, 4);
  if (logOk) addCandidate('log', log!.error, 3);
  if (sqrtOk) addCandidate('sqrt', sqrt!.error, 3);
  if (hyperbolaOk) addCandidate('hyperbola', hyperbola!.error, 4);
  if (hyperbola2Ok) addCandidate('hyperbola2', hyperbola2!.error, 4);

  // Apply structural score adjustments
  candidates.forEach((cand) => {
    if (structure.isStronglyLinear) {
      if (cand.key === 'linear') cand.score *= 0.28;
      if (cand.key === 'quadratic') cand.score *= 1.7;
      if (cand.key === 'cubic') cand.score *= 2.0;
      if (cand.key === 'quartic') cand.score *= 2.35;
      if (['sin', 'exp', 'log', 'sqrt', 'hyperbola'].includes(cand.key)) cand.score *= 2.0;
      if (cand.key === 'hyperbola2') cand.score *= 2.2;
    }

    if (structure.isNearlyLinear && !structure.isStronglyLinear) {
      if (cand.key === 'linear') cand.score *= 0.5;
      if (cand.key === 'quadratic') cand.score *= 1.45;
      if (cand.key === 'cubic') cand.score *= 1.75;
      if (cand.key === 'quartic') cand.score *= 1.95;
      if (['sin', 'exp', 'log', 'sqrt', 'hyperbola'].includes(cand.key)) cand.score *= 1.55;
      if (cand.key === 'hyperbola2') cand.score *= 1.65;
    }

    if (structure.isOscillating) {
      if (['sqrt', 'exp', 'log'].includes(cand.key)) cand.score *= 4;
      if (cand.key === 'hyperbola2') cand.score *= 3.2;
    }

    if (structure.isMonotone && structure.isAsymmetric) {
      if (cand.key === 'sin') cand.score *= 2.5;
      if (structure.isConcave) {
        if (cand.key === 'sqrt') cand.score *= 0.4;
        if (cand.key === 'log') cand.score *= 0.55;
        if (cand.key === 'exp') cand.score *= 2.5;
        if (cand.key === 'linear') cand.score *= 1.8;
        if (cand.key === 'cubic') cand.score *= 1.8;
        if (cand.key === 'quartic') cand.score *= 1.9;
      } else if (structure.isConvex) {
        if (cand.key === 'exp') cand.score *= 0.78;
        if (cand.key === 'sqrt') cand.score *= 2.5;
        if (cand.key === 'log') cand.score *= 2.5;
        if (cand.key === 'hyperbola2') cand.score *= 0.70;
        if (cand.key === 'hyperbola') cand.score *= 0.60;
        if (cand.key === 'linear') cand.score *= 1.70;
      }
    }

    if (structure.isMonotone && structure.isSymmetric) {
      if (['sqrt', 'exp', 'log', 'hyperbola'].includes(cand.key)) cand.score *= 2.5;
      if (cand.key === 'sin') cand.score *= 0.55;
      if (cand.key === 'quartic') cand.score *= 0.85;
    }
  });

  // Gain-based pairwise comparisons
  const linearCand = candidates.find((c) => c.key === 'linear');
  const expCand = candidates.find((c) => c.key === 'exp');
  const logCand = candidates.find((c) => c.key === 'log');
  const hyper2Cand = candidates.find((c) => c.key === 'hyperbola2');
  const hyperCand = candidates.find((c) => c.key === 'hyperbola');

  if (linearCand && expCand && Number.isFinite(linearCand.error) && Number.isFinite(expCand.error)) {
    const expGain = (linearCand.error - expCand.error) / Math.max(linearCand.error, 1e-6);
    if (expGain < 0.18) {
      linearCand.score *= 0.62;
      expCand.score *= 1.55;
    } else if (expGain < 0.28) {
      linearCand.score *= 0.78;
      expCand.score *= 1.22;
    }
  }

  if (linearCand && logCand && Number.isFinite(linearCand.error) && Number.isFinite(logCand.error)) {
    const logGain = (linearCand.error - logCand.error) / Math.max(linearCand.error, 1e-6);
    if (logGain < 0.16) {
      linearCand.score *= 0.74;
      logCand.score *= 1.28;
    }
  }

  if (linearCand && hyper2Cand && Number.isFinite(linearCand.error) && Number.isFinite(hyper2Cand.error)) {
    const hyper2Gain = (linearCand.error - hyper2Cand.error) / Math.max(linearCand.error, 1e-6);
    if (hyper2Gain >= 0.12) {
      linearCand.score *= 1.55;
      hyper2Cand.score *= 0.68;
    } else if (hyper2Gain >= 0.06) {
      linearCand.score *= 1.25;
      hyper2Cand.score *= 0.80;
    }
  }

  if (linearCand && hyperCand && Number.isFinite(linearCand.error) && Number.isFinite(hyperCand.error)) {
    const hyperGain = (linearCand.error - hyperCand.error) / Math.max(linearCand.error, 1e-6);
    if (hyperGain >= 0.12) {
      linearCand.score *= 1.55;
      hyperCand.score *= 0.68;
    } else if (hyperGain >= 0.06) {
      linearCand.score *= 1.25;
      hyperCand.score *= 0.80;
    }
  }

  // Tie-break: linear when nearly equal
  if (linearCand && Number.isFinite(linearCand.error)) {
    let bestErr = Infinity;
    for (const cand of candidates) {
      if (Number.isFinite(cand.error) && cand.error < bestErr) bestErr = cand.error;
    }
    if (Number.isFinite(bestErr) && bestErr > 0) {
      const relGap = (linearCand.error - bestErr) / bestErr;
      if (relGap <= 0.1) linearCand.score *= 0.58;
      else if (relGap <= 0.16) linearCand.score *= 0.78;
    }
  }

  // Compute exponential weights
  candidates.sort((a, b) => a.score - b.score);
  const minScore = candidates[0].score;
  let totalWeight = 0;
  candidates.forEach((cand) => {
    const weight = Math.exp(-6 * Math.max(0, cand.score - minScore));
    cand.weight = weight;
    totalWeight += weight;
  });
  candidates.forEach((cand) => {
    cand.probability = totalWeight > 0 ? (cand.weight / totalWeight) * 100 : 0;
  });

  const selected = candidates[0].key;

  const linkedModels = createLinkedModels(
    linearOk ? { m: linear!.m, n: linear!.n } : { m: 0, n: 0 },
    quadraticOk ? { a: quadratic!.a, c: quadratic!.c, d: quadratic!.d } : { a: 1, c: 0, d: linearOk ? linear!.n : 0 },
    cubicOk ? { a: cubic!.a, b: cubic!.b, c: cubic!.c, d: cubic!.d } : { a: 0.1, b: 0, c: 0, d: linearOk ? linear!.n : 0 },
    quarticOk ? { a: quartic!.a, b: quartic!.b, c: quartic!.c, d: quartic!.d, f: quartic!.f } : { a: 0.1, b: 0.1, c: 0, d: 0, f: linearOk ? linear!.n : 0 },
    sinOk ? { A: sin!.A, b: sin!.b, c: sin!.c, d: sin!.d } : { A: 1, b: 1, c: 0, d: linearOk ? linear!.n : 0 },
    expOk ? { A: exp!.A, b: exp!.b, c: exp!.c, d: exp!.d } : { A: 1, b: 1, c: 0, d: linearOk ? linear!.n : 0 },
    logOk ? { A: log!.A, b: log!.b, c: log!.c, d: log!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 },
    sqrtOk ? { A: sqrt!.A, b: sqrt!.b, c: sqrt!.c, d: sqrt!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 },
    hyperbolaOk ? { A: hyperbola!.A, b: hyperbola!.b, c: hyperbola!.c, d: hyperbola!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 },
    hyperbola2Ok ? { A: hyperbola2!.A, b: hyperbola2!.b, c: hyperbola2!.c, d: hyperbola2!.d } : { A: 1, b: 1, c: 1 - (linearOk ? linear!.m : 0), d: linearOk ? linear!.n : 0 }
  );

  const classProbabilities: Record<AnalysisClassKey, number> = {
    linear: 0, quadratic: 0, cubic: 0, quartic: 0, sin: 0, exp: 0, log: 0, sqrt: 0, hyperbola: 0, hyperbola2: 0
  };
  candidates.forEach((cand) => {
    classProbabilities[cand.key] = cand.probability;
  });

  if (selected === 'quartic' && quarticOk) {
    return openQuarticAnalysisOverlay(state, quartic!.a, quartic!.b, quartic!.c, quartic!.d, quartic!.f, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'cubic' && cubicOk) {
    return openCubicAnalysisOverlay(state, cubic!.a, cubic!.b, cubic!.c, cubic!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'sin' && sinOk) {
    return openSinAnalysisOverlay(state, sin!.A, sin!.b, sin!.c, sin!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'exp' && expOk) {
    return openExpAnalysisOverlay(state, exp!.A, exp!.b, exp!.c, exp!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'log' && logOk) {
    return openLogAnalysisOverlay(state, log!.A, log!.b, log!.c, log!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'sqrt' && sqrtOk) {
    return openSqrtAnalysisOverlay(state, sqrt!.A, sqrt!.b, sqrt!.c, sqrt!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'hyperbola' && hyperbolaOk) {
    return openHyperbolaAnalysisOverlay(state, hyperbola!.A, hyperbola!.b, hyperbola!.c, hyperbola!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'hyperbola2' && hyperbola2Ok) {
    return openHyperbola2AnalysisOverlay(state, hyperbola2!.A, hyperbola2!.b, hyperbola2!.c, hyperbola2!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'quadratic' && quadraticOk) {
    return openQuadraticAnalysisOverlay(state, quadratic!.a, quadratic!.c, quadratic!.d, 'Regression', { classProbabilities, linkedModels });
  }
  if (selected === 'linear' && linearOk) {
    return openLinearAnalysisOverlay(state, linear!.m, linear!.n, 'Regression', { classProbabilities, linkedModels });
  }

  return false;
}

function clearRegressionSelection(state: RegressionState): void {
  state.regressionPoints = [];
  removeGraph(state, 'recognitionGraph');
  removeGraph(state, 'regressionGraph');
  removeAllAnalysisOverlays(state);
  removeAllQuadraticAnalysisOverlays(state);
  removeAllCubicAnalysisOverlays(state);
  removeAllQuarticAnalysisOverlays(state);
  removeAllSinAnalysisOverlays(state);
  removeAllExpAnalysisOverlays(state);
  removeAllLogAnalysisOverlays(state);
  removeAllSqrtAnalysisOverlays(state);
  removeAllHyperbolaAnalysisOverlays(state);
  removeAllHyperbola2AnalysisOverlays(state);
}

function toggleRegressionPoint(state: RegressionState, point: AutoPointData): void {
  const index = state.regressionPoints.findIndex((item) => item.key === point.key);
  if (index >= 0) {
    state.regressionPoints.splice(index, 1);
    return;
  }

  state.regressionPoints.push({ key: point.key, x: point.x, y: point.y });
}

// Removing an overlay is identical across models apart from which state list
// holds its entries; listKey selects that list. Public per-model wrappers below
// keep existing call sites unchanged.
type AnalysisListKey =
  | 'analysisEntries' | 'quadraticAnalysisEntries' | 'cubicAnalysisEntries'
  | 'quarticAnalysisEntries' | 'sinAnalysisEntries' | 'expAnalysisEntries'
  | 'logAnalysisEntries' | 'sqrtAnalysisEntries' | 'hyperbolaAnalysisEntries'
  | 'hyperbola2AnalysisEntries';

function removeEntryFromList(state: RegressionState, entry: AnyAnalysisEntry, listKey: AnalysisListKey): void {
  removeEntryGraph(entry);
  if (entry.disposeUi) {
    try { entry.disposeUi(); } catch (e) {}
    entry.disposeUi = undefined;
  }
  if (entry.panel) {
    captureOverlayScaleCarry(state, entry.panel);
    try { entry.panel.remove(); } catch (e) {}
    entry.panel = null;
  }
  entry.syncUi = undefined;
  (state as any)[listKey] = (state as any)[listKey].filter((item: AnyAnalysisEntry) => item !== entry);
  relayoutAnalysisPanels(state);
}

function removeAllFromList(state: RegressionState, listKey: AnalysisListKey): void {
  const entries = ((state as any)[listKey] as AnyAnalysisEntry[]).slice();
  entries.forEach((entry) => removeEntryFromList(state, entry, listKey));
}

function removeAnalysisEntry(state: RegressionState, entry: LinearAnalysisEntry): void { removeEntryFromList(state, entry, 'analysisEntries'); }
function removeQuadraticAnalysisEntry(state: RegressionState, entry: QuadraticAnalysisEntry): void { removeEntryFromList(state, entry, 'quadraticAnalysisEntries'); }
function removeCubicAnalysisEntry(state: RegressionState, entry: CubicAnalysisEntry): void { removeEntryFromList(state, entry, 'cubicAnalysisEntries'); }
function removeQuarticAnalysisEntry(state: RegressionState, entry: QuarticAnalysisEntry): void { removeEntryFromList(state, entry, 'quarticAnalysisEntries'); }
function removeSinAnalysisEntry(state: RegressionState, entry: SinAnalysisEntry): void { removeEntryFromList(state, entry, 'sinAnalysisEntries'); }
function removeExpAnalysisEntry(state: RegressionState, entry: ExpAnalysisEntry): void { removeEntryFromList(state, entry, 'expAnalysisEntries'); }
function removeLogAnalysisEntry(state: RegressionState, entry: LogAnalysisEntry): void { removeEntryFromList(state, entry, 'logAnalysisEntries'); }
function removeSqrtAnalysisEntry(state: RegressionState, entry: SqrtAnalysisEntry): void { removeEntryFromList(state, entry, 'sqrtAnalysisEntries'); }
function removeHyperbolaAnalysisEntry(state: RegressionState, entry: HyperbolaAnalysisEntry): void { removeEntryFromList(state, entry, 'hyperbolaAnalysisEntries'); }
function removeHyperbola2AnalysisEntry(state: RegressionState, entry: Hyperbola2AnalysisEntry): void { removeEntryFromList(state, entry, 'hyperbola2AnalysisEntries'); }

function removeAllAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'analysisEntries'); }
function removeAllQuadraticAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'quadraticAnalysisEntries'); }
function removeAllCubicAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'cubicAnalysisEntries'); }
function removeAllQuarticAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'quarticAnalysisEntries'); }
function removeAllSinAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'sinAnalysisEntries'); }
function removeAllExpAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'expAnalysisEntries'); }
function removeAllLogAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'logAnalysisEntries'); }
function removeAllSqrtAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'sqrtAnalysisEntries'); }
function removeAllHyperbolaAnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'hyperbolaAnalysisEntries'); }
function removeAllHyperbola2AnalysisOverlays(state: RegressionState): void { removeAllFromList(state, 'hyperbola2AnalysisEntries'); }

function relayoutAnalysisPanels(state: RegressionState): void {
  let nextTop = 8;

  const allEntries: AnyAnalysisEntry[] = ([] as AnyAnalysisEntry[])
    .concat(state.analysisEntries)
    .concat(state.quadraticAnalysisEntries)
    .concat(state.cubicAnalysisEntries)
    .concat(state.quarticAnalysisEntries)
    .concat(state.sinAnalysisEntries)
    .concat(state.expAnalysisEntries)
    .concat(state.logAnalysisEntries)
    .concat(state.sqrtAnalysisEntries)
    .concat(state.hyperbolaAnalysisEntries)
    .concat(state.hyperbola2AnalysisEntries)
    .sort((a, b) => {
      const ai = Number(String(a.id).split('-').pop() || '0');
      const bi = Number(String(b.id).split('-').pop() || '0');
      return ai - bi;
    });

  for (let i = 0; i < allEntries.length; i += 1) {
    const entry = allEntries[i];
    const panel = entry.panel;
    if (!panel || !panel.isConnected) continue;

    panel.style.left = '10px';
    panel.style.top = nextTop + 'px';

    const rect = panel.getBoundingClientRect();
    const isMinimized = miniWrapIsVisible(panel);
    const gap = isMinimized ? 6 : 10;
    nextTop += Math.max(16, Math.round(rect.height || 0)) + gap;
  }
}

function miniWrapIsVisible(panel: HTMLElement): boolean {
  const miniWrap = panel.querySelector('.lia-plot-analysis-mini-wrap') as HTMLElement | null;
  if (!miniWrap) return false;
  return miniWrap.style.display === 'inline-flex';
}

function openLinearAnalysisOverlay(state: RegressionState, m: number, n: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m, n },
      { a: Math.abs(m) < 1e-6 ? 1 : (m < 0 ? -0.5 : 0.5), c: 0, d: n },
      { a: 0.1, b: 0, c: m, d: n },
      { a: 0.1, b: 0.1, c: 0, d: m, f: n },
      { A: 1, b: 1, c: 0, d: n }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('linear', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: LinearAnalysisEntry = {
    id: 'analysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { m: linkedModels.linear.m, n: linkedModels.linear.n }
  };
  state.analysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'linear');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygroesse aendern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: LinearParamKey; label: string }> = [
    { key: 'm', label: 'm' },
    { key: 'n', label: 'n' }
  ];

  const sliderByKey: Partial<Record<LinearParamKey, HTMLInputElement>> = {};
  const syncSliderByKey: Partial<Record<LinearParamKey, (value: number, lightweight: boolean) => void>> = {};

  const syncUiFromModel = (lightweight: boolean = false) => {
    rows.forEach((rowEntry) => {
      const value = Number((entry.model as any)[rowEntry.key]);
      const syncSlider = syncSliderByKey[rowEntry.key];
      if (syncSlider) {
        syncSlider(value, lightweight);
        return;
      }
      if (sliderByKey[rowEntry.key]) {
        sliderByKey[rowEntry.key]!.value = String(value);
      }
    });
    linkedModels.linear.m = entry.model.m;
    linkedModels.linear.n = entry.model.n;
    renderAnalysisFormula(formula, buildLinearFormulaTex(entry.model.m, entry.model.n));
  };

  const syncGraph = (lightweight: boolean = false) => {
    updateAnalysisGraph(state, entry);
    syncUiFromModel(lightweight);
    redrawCanvas(state);
  };

  entry.syncUi = syncUiFromModel;

  const renderControls = () => {
    controlsHost.innerHTML = '';

    rows.forEach((rowEntry) => {
      const row = document.createElement('div');
      row.className = 'lia-plot-analysis-row';

      const label = document.createElement('div');
      label.className = 'lia-plot-analysis-label';
      label.innerHTML = '\\(' + rowEntry.label + '\\):';
      typesetOverlayMath(label);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'lia-plot-analysis-slider';
      slider.setAttribute('data-param-key', rowEntry.key);
      const analysisStep = 0.05;
      const analysisSpan = 12;
      const analysisPad = 1.0;
      const startValue = Number((entry.model as any)[rowEntry.key]);
      const absMax = Math.max(10, Math.ceil(Math.abs(startValue || 0)) + 2);

      const snapValue = (value: number) => Math.round(Number(value || 0) / analysisStep) * analysisStep;
      const setWindow = (center: number) => {
        const half = analysisSpan / 2;
        let min = snapValue(Number(center || 0) - half);
        let max = snapValue(Number(center || 0) + half);

        if (min < -absMax) {
          min = -absMax;
          max = snapValue(min + analysisSpan);
        }
        if (max > absMax) {
          max = absMax;
          min = snapValue(max - analysisSpan);
        }

        slider.min = String(min);
        slider.max = String(max);
      };

      const maybeShiftWindow = (value: number) => {
        const min = Number(slider.min);
        const max = Number(slider.max);
        const current = Number(value);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(current)) {
          setWindow(current);
          return;
        }
        if (current <= min + analysisPad || current >= max - analysisPad) {
          setWindow(current);
        }
      };

      setWindow(startValue);
      slider.step = String(analysisStep);
      slider.value = String(startValue);
      stopPanelEventPropagation(slider);
      updateAnalysisSliderFill(slider);
      sliderByKey[rowEntry.key] = slider;
      syncSliderByKey[rowEntry.key] = (value: number, lightweight: boolean) => {
        maybeShiftWindow(value);
        if (lightweight) {
          const isActive = (document.activeElement === slider) || !!(slider.matches && slider.matches(':active'));
          if (isActive) return;
        }
        slider.value = String(value);
        updateAnalysisSliderFill(slider);
      };

      const flushUpdate = () => {
        const next = Number(slider.value);
        (entry.model as any)[rowEntry.key] = next;
        (linkedModels.linear as any)[rowEntry.key] = next;
        syncGraph(false);
      };

      slider.addEventListener('input', () => {
        maybeShiftWindow(Number(slider.value));
        flushUpdate();
      });

      slider.addEventListener('change', flushUpdate);

      row.appendChild(label);
      row.appendChild(slider);
      controlsHost.appendChild(row);
    });
  };

  renderControls();

  select.addEventListener('change', () => {
    const selected = String(select.value || 'linear') as AnalysisClassKey;
    if (selected === 'linear') {
      entry.model.m = linkedModels.linear.m;
      entry.model.n = linkedModels.linear.n;
      renderControls();
      syncUiFromModel(false);
      return;
    }

    if (selected === 'quadratic') {
      removeAnalysisEntry(state, entry);
      openQuadraticAnalysisOverlay(
        state,
        linkedModels.quadratic.a,
        linkedModels.quadratic.c,
        linkedModels.quadratic.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'cubic') {
      removeAnalysisEntry(state, entry);
      openCubicAnalysisOverlay(
        state,
        linkedModels.cubic.a,
        linkedModels.cubic.b,
        linkedModels.cubic.c,
        linkedModels.cubic.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'quartic') {
      removeAnalysisEntry(state, entry);
      openQuarticAnalysisOverlay(
        state,
        linkedModels.quartic.a,
        linkedModels.quartic.b,
        linkedModels.quartic.c,
        linkedModels.quartic.d,
        linkedModels.quartic.f,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'sin') {
      removeAnalysisEntry(state, entry);
      openSinAnalysisOverlay(
        state,
        linkedModels.sin.A,
        linkedModels.sin.b,
        linkedModels.sin.c,
        linkedModels.sin.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'exp') {
      removeAnalysisEntry(state, entry);
      openExpAnalysisOverlay(
        state,
        linkedModels.exp.A,
        linkedModels.exp.b,
        linkedModels.exp.c,
        linkedModels.exp.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'log') {
      removeAnalysisEntry(state, entry);
      openLogAnalysisOverlay(
        state,
        linkedModels.log.A,
        linkedModels.log.b,
        linkedModels.log.c,
        linkedModels.log.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'sqrt') {
      removeAnalysisEntry(state, entry);
      openSqrtAnalysisOverlay(
        state,
        linkedModels.sqrt.A,
        linkedModels.sqrt.b,
        linkedModels.sqrt.c,
        linkedModels.sqrt.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'hyperbola') {
      removeAnalysisEntry(state, entry);
      openHyperbolaAnalysisOverlay(
        state,
        linkedModels.hyperbola.A,
        linkedModels.hyperbola.b,
        linkedModels.hyperbola.c,
        linkedModels.hyperbola.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'hyperbola2') {
      removeAnalysisEntry(state, entry);
      openHyperbola2AnalysisOverlay(
        state,
        linkedModels.hyperbola2.A,
        linkedModels.hyperbola2.b,
        linkedModels.hyperbola2.c,
        linkedModels.hyperbola2.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '190px';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(true);
  });
  close.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(true);
  }, true);
  close.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(true);
  }, true);

  close.addEventListener('pointerdown', (evt) => evt.stopPropagation(), true);
  miniWrap.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(false);
  }, true);
  miniStrip.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(false);
  }, true);

  // Robust fallback: panel-level delegation still works even if target listeners are blocked.
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) {
      evt.preventDefault();
      evt.stopPropagation();
      setMinimized(true);
      return;
    }
    if (target === miniWrap || miniWrap.contains(target)) {
      evt.preventDefault();
      evt.stopPropagation();
      setMinimized(false);
    }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  panel.style.transform = 'scale(' + initialScale + ')';
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.55, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.55, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openQuadraticAnalysisOverlay(state: RegressionState, a: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a, c, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('quadratic', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: QuadraticAnalysisEntry = {
    id: 'qanalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: {
      a: linkedModels.quadratic.a,
      c: linkedModels.quadratic.c,
      d: linkedModels.quadratic.d
    }
  };
  state.quadraticAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'quadratic');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygr\u00f6\u00dfe \u00e4ndern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: QuadraticParamKey; label: string }> = [
    { key: 'a', label: 'a' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];

  const sliderByKey: Partial<Record<QuadraticParamKey, HTMLInputElement>> = {};
  const syncSliderByKey: Partial<Record<QuadraticParamKey, (value: number, lightweight: boolean) => void>> = {};

  const syncUiFromModel = (lightweight: boolean = false) => {
    rows.forEach((rowEntry) => {
      const value = Number((entry.model as any)[rowEntry.key]);
      const syncSlider = syncSliderByKey[rowEntry.key];
      if (syncSlider) {
        syncSlider(value, lightweight);
        return;
      }
      if (sliderByKey[rowEntry.key]) {
        sliderByKey[rowEntry.key]!.value = String(value);
      }
    });
    linkedModels.quadratic.a = entry.model.a;
    linkedModels.quadratic.c = entry.model.c;
    linkedModels.quadratic.d = entry.model.d;
    renderAnalysisFormula(formula, buildQuadraticFormulaTex(entry.model.a, entry.model.c, entry.model.d));
  };

  const syncGraph = (lightweight: boolean = false) => {
    updateQuadraticAnalysisGraph(state, entry);
    syncUiFromModel(lightweight);
    redrawCanvas(state);
  };

  entry.syncUi = syncUiFromModel;

  const renderControls = () => {
    controlsHost.innerHTML = '';

    rows.forEach((rowEntry) => {
      const row = document.createElement('div');
      row.className = 'lia-plot-analysis-row';

      const label = document.createElement('div');
      label.className = 'lia-plot-analysis-label';
      label.innerHTML = '\\(' + rowEntry.label + '\\):';
      typesetOverlayMath(label);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'lia-plot-analysis-slider';
      slider.setAttribute('data-param-key', rowEntry.key);
      const analysisStep = 0.05;
      const analysisSpan = 12;
      const analysisPad = 1.0;
      const startValue = Number((entry.model as any)[rowEntry.key]);
      const absMax = Math.max(10, Math.ceil(Math.abs(startValue || 0)) + 2);

      const snapValue = (value: number) => Math.round(Number(value || 0) / analysisStep) * analysisStep;
      const setWindow = (center: number) => {
        const half = analysisSpan / 2;
        let min = snapValue(Number(center || 0) - half);
        let max = snapValue(Number(center || 0) + half);

        if (min < -absMax) {
          min = -absMax;
          max = snapValue(min + analysisSpan);
        }
        if (max > absMax) {
          max = absMax;
          min = snapValue(max - analysisSpan);
        }

        slider.min = String(min);
        slider.max = String(max);
      };

      const maybeShiftWindow = (value: number) => {
        const min = Number(slider.min);
        const max = Number(slider.max);
        const current = Number(value);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(current)) {
          setWindow(current);
          return;
        }
        if (current <= min + analysisPad || current >= max - analysisPad) {
          setWindow(current);
        }
      };

      setWindow(startValue);
      slider.step = String(analysisStep);
      slider.value = String(startValue);
      stopPanelEventPropagation(slider);
      updateAnalysisSliderFill(slider);
      sliderByKey[rowEntry.key] = slider;
      syncSliderByKey[rowEntry.key] = (value: number, lightweight: boolean) => {
        maybeShiftWindow(value);
        if (lightweight) {
          const isActive = (document.activeElement === slider) || !!(slider.matches && slider.matches(':active'));
          if (isActive) return;
        }
        slider.value = String(value);
        updateAnalysisSliderFill(slider);
      };

      const flushUpdate = () => {
        const next = Number(slider.value);
        (entry.model as any)[rowEntry.key] = next;
        (linkedModels.quadratic as any)[rowEntry.key] = next;
        syncGraph(false);
      };

      slider.addEventListener('input', () => {
        maybeShiftWindow(Number(slider.value));
        flushUpdate();
      });

      slider.addEventListener('change', flushUpdate);

      row.appendChild(label);
      row.appendChild(slider);
      controlsHost.appendChild(row);
    });
  };

  renderControls();

  select.addEventListener('change', () => {
    const selected = String(select.value || 'quadratic') as AnalysisClassKey;
    if (selected === 'quadratic') {
      entry.model.a = linkedModels.quadratic.a;
      entry.model.c = linkedModels.quadratic.c;
      entry.model.d = linkedModels.quadratic.d;
      renderControls();
      syncUiFromModel(false);
      return;
    }

    if (selected === 'linear') {
      removeQuadraticAnalysisEntry(state, entry);
      openLinearAnalysisOverlay(
        state,
        linkedModels.linear.m,
        linkedModels.linear.n,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'cubic') {
      removeQuadraticAnalysisEntry(state, entry);
      openCubicAnalysisOverlay(
        state,
        linkedModels.cubic.a,
        linkedModels.cubic.b,
        linkedModels.cubic.c,
        linkedModels.cubic.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'quartic') {
      removeQuadraticAnalysisEntry(state, entry);
      openQuarticAnalysisOverlay(
        state,
        linkedModels.quartic.a,
        linkedModels.quartic.b,
        linkedModels.quartic.c,
        linkedModels.quartic.d,
        linkedModels.quartic.f,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'sin') {
      removeQuadraticAnalysisEntry(state, entry);
      openSinAnalysisOverlay(
        state,
        linkedModels.sin.A,
        linkedModels.sin.b,
        linkedModels.sin.c,
        linkedModels.sin.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'exp') {
      removeQuadraticAnalysisEntry(state, entry);
      openExpAnalysisOverlay(
        state,
        linkedModels.exp.A,
        linkedModels.exp.b,
        linkedModels.exp.c,
        linkedModels.exp.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'log') {
      removeQuadraticAnalysisEntry(state, entry);
      openLogAnalysisOverlay(
        state,
        linkedModels.log.A,
        linkedModels.log.b,
        linkedModels.log.c,
        linkedModels.log.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'sqrt') {
      removeQuadraticAnalysisEntry(state, entry);
      openSqrtAnalysisOverlay(
        state,
        linkedModels.sqrt.A,
        linkedModels.sqrt.b,
        linkedModels.sqrt.c,
        linkedModels.sqrt.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'hyperbola') {
      removeQuadraticAnalysisEntry(state, entry);
      openHyperbolaAnalysisOverlay(
        state,
        linkedModels.hyperbola.A,
        linkedModels.hyperbola.b,
        linkedModels.hyperbola.c,
        linkedModels.hyperbola.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    if (selected === 'hyperbola2') {
      removeQuadraticAnalysisEntry(state, entry);
      openHyperbola2AnalysisOverlay(
        state,
        linkedModels.hyperbola2.A,
        linkedModels.hyperbola2.b,
        linkedModels.hyperbola2.c,
        linkedModels.hyperbola2.d,
        entry.title,
        { classProbabilities, linkedModels }
      );
      return;
    }

    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '190px';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(true);
  });
  close.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(true);
  }, true);
  close.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(true);
  }, true);

  close.addEventListener('pointerdown', (evt) => evt.stopPropagation(), true);
  miniWrap.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(false);
  }, true);
  miniStrip.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMinimized(false);
  }, true);

  // Robust fallback: panel-level delegation still works even if target listeners are blocked.
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) {
      evt.preventDefault();
      evt.stopPropagation();
      setMinimized(true);
      return;
    }
    if (target === miniWrap || miniWrap.contains(target)) {
      evt.preventDefault();
      evt.stopPropagation();
      setMinimized(false);
    }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  panel.style.transform = 'scale(' + initialScale + ')';
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.55, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.55, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openCubicAnalysisOverlay(state: RegressionState, a: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a, b, c, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('cubic', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: CubicAnalysisEntry = {
    id: 'canalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { a: linkedModels.cubic.a, b: linkedModels.cubic.b, c: linkedModels.cubic.c, d: linkedModels.cubic.d }
  };
  state.cubicAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'cubic');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygr\u00f6\u00dfe \u00e4ndern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: CubicParamKey; label: string }> = [
    { key: 'a', label: 'a' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<CubicParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.cubic.a = entry.model.a;
    linkedModels.cubic.b = entry.model.b;
    linkedModels.cubic.c = entry.model.c;
    linkedModels.cubic.d = entry.model.d;
    renderAnalysisFormula(formula, buildCubicFormulaTex(entry.model.a, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateCubicAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.cubic as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'cubic') as AnalysisClassKey;
    if (selected === 'cubic') {
      syncUiFromModel();
      return;
    }
    removeCubicAnalysisEntry(state, entry);
    if (selected === 'linear') {
      openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quadratic') {
      openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quartic') {
      openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sin') {
      openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'exp') {
      openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'log') {
      openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sqrt') {
      openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola') {
      openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola2') {
      openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola2') {
      openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola2') {
      openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola2') {
      openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openQuarticAnalysisOverlay(state: RegressionState, a: number, b: number, c: number, d: number, f: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: f },
      { a: 1, c: 0, d: f },
      { a: 0.1, b: 0, c: 0, d: f },
      { a, b, c, d, f },
      { A: 1, b: 1, c: 0, d: f }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('quartic', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: QuarticAnalysisEntry = {
    id: 'q4analysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { a: linkedModels.quartic.a, b: linkedModels.quartic.b, c: linkedModels.quartic.c, d: linkedModels.quartic.d, f: linkedModels.quartic.f }
  };
  state.quarticAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'quartic');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygr\u00f6\u00dfe \u00e4ndern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: QuarticParamKey; label: string }> = [
    { key: 'a', label: 'a' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' },
    { key: 'f', label: 'f' }
  ];
  const sliderByKey: Partial<Record<QuarticParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.quartic.a = entry.model.a;
    linkedModels.quartic.b = entry.model.b;
    linkedModels.quartic.c = entry.model.c;
    linkedModels.quartic.d = entry.model.d;
    linkedModels.quartic.f = entry.model.f;
    renderAnalysisFormula(formula, buildQuarticFormulaTex(entry.model.a, entry.model.b, entry.model.c, entry.model.d, entry.model.f));
  };

  const syncGraph = () => {
    updateQuarticAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.quartic as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'quartic') as AnalysisClassKey;
    if (selected === 'quartic') {
      syncUiFromModel();
      return;
    }
    removeQuarticAnalysisEntry(state, entry);
    if (selected === 'linear') {
      openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quadratic') {
      openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'cubic') {
      openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sin') {
      openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'exp') {
      openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'log') {
      openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sqrt') {
      openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola') {
      openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola2') {
      openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    renderUnsupportedClassHint(formula, selected);
  });

  function openSinAnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
    if (!state.boardContainer) return false;

    state.activeTool = '';
    state.regressionMode = '';
    state.toolsMenuOpen = true;
    setMenuOpen(state.toolsMenu, true);

    state.analysisSeq += 1;
    const linkedModels: AnalysisLinkedModels = options && options.linkedModels
      ? options.linkedModels
      : createLinkedModels(
        { m: 0, n: d },
        { a: 1, c: 0, d },
        { a: 0.1, b: 0, c: 0, d },
        { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
        { A, b, c, d }
      );
    const classProbabilities = options && options.classProbabilities
      ? options.classProbabilities
      : makeClassProbabilities('sin', 100);
    const initialScale = consumeInitialOverlayScale(state, options);

    const entry: SinAnalysisEntry = {
      id: 'sanalysis-' + state.analysisSeq,
      title,
      color: state.drawColor || '#ff0000',
      panel: null,
      graph: null,
      model: { A: linkedModels.sin.A, b: linkedModels.sin.b, c: linkedModels.sin.c, d: linkedModels.sin.d }
    };
    state.sinAnalysisEntries.push(entry);

    const panel = document.createElement('div');
    panel.className = 'lia-plot-analyze-panel';
    panel.dataset.open = '1';
    panel.style.display = 'inline-block';
    panel.style.pointerEvents = 'auto';
    panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
    panel.style.color = neutralColor();
    panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
    panel.style.left = '10px';
    panel.style.top = '8px';
    panel.style.right = 'auto';
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + initialScale + ')';
    panel.style.setProperty('--lia-analysis-accent', entry.color);
    stopPanelEventPropagation(panel);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'lia-plot-analysis-close';
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', 'Analyse minimieren');
    panel.appendChild(close);

    const miniWrap = document.createElement('div');
    miniWrap.className = 'lia-plot-analysis-mini-wrap';
    const miniStrip = document.createElement('div');
    miniStrip.className = 'lia-plot-analysis-mini-strip';
    miniWrap.appendChild(miniStrip);
    panel.appendChild(miniWrap);

    const content = document.createElement('div');
    content.className = 'lia-plot-analysis-content';
    panel.appendChild(content);

    const selectWrap = document.createElement('div');
    selectWrap.className = 'lia-plot-analysis-select-wrap';
    const select = document.createElement('select');
    select.className = 'lia-plot-analysis-select';
    select.setAttribute('aria-label', entry.title);
    fillAnalysisClassSelect(select, classProbabilities, 'sin');
    stopPanelEventPropagation(select);
    selectWrap.appendChild(select);
    content.appendChild(selectWrap);

    const controlsHost = document.createElement('div');
    content.appendChild(controlsHost);

    const formula = document.createElement('div');
    formula.className = 'lia-plot-analysis-formula';
    content.appendChild(formula);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'lia-plot-analysis-resize';
    resizeHandle.setAttribute('aria-label', 'Overlaygr\u00f6\u00dfe \u00e4ndern');
    panel.appendChild(resizeHandle);

    const rows: Array<{ key: SinParamKey; label: string }> = [
      { key: 'A', label: 'A' },
      { key: 'b', label: 'b' },
      { key: 'c', label: 'c' },
      { key: 'd', label: 'd' }
    ];
    const sliderByKey: Partial<Record<SinParamKey, HTMLInputElement>> = {};

    const syncUiFromModel = () => {
      rows.forEach((rowEntry) => {
        const slider = sliderByKey[rowEntry.key];
        if (slider) {
          slider.value = String((entry.model as any)[rowEntry.key]);
          updateAnalysisSliderFill(slider);
        }
      });
      linkedModels.sin.A = entry.model.A;
      linkedModels.sin.b = entry.model.b;
      linkedModels.sin.c = entry.model.c;
      linkedModels.sin.d = entry.model.d;
      renderAnalysisFormula(formula, buildSinFormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
    };

    const syncGraph = () => {
      updateSinAnalysisGraph(state, entry);
      syncUiFromModel();
      redrawCanvas(state);
    };

    entry.syncUi = () => syncUiFromModel();

    rows.forEach((rowEntry) => {
      const row = document.createElement('div');
      row.className = 'lia-plot-analysis-row';
      const label = document.createElement('div');
      label.className = 'lia-plot-analysis-label';
      label.innerHTML = '\\(' + rowEntry.label + '\\):';
      typesetOverlayMath(label);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'lia-plot-analysis-slider';
      slider.min = '-10';
      slider.max = '10';
      slider.step = '0.05';
      slider.value = String((entry.model as any)[rowEntry.key]);
      stopPanelEventPropagation(slider);
      updateAnalysisSliderFill(slider);
      sliderByKey[rowEntry.key] = slider;

      const onChange = () => {
        (entry.model as any)[rowEntry.key] = Number(slider.value);
        (linkedModels.sin as any)[rowEntry.key] = Number(slider.value);
        syncGraph();
      };
      slider.addEventListener('input', onChange);
      slider.addEventListener('change', onChange);

      row.appendChild(label);
      row.appendChild(slider);
      controlsHost.appendChild(row);
    });

    select.addEventListener('change', () => {
      const selected = String(select.value || 'sin') as AnalysisClassKey;
      if (selected === 'sin') {
        syncUiFromModel();
        return;
      }
      removeSinAnalysisEntry(state, entry);
      if (selected === 'linear') {
        openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'quadratic') {
        openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'cubic') {
        openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'quartic') {
        openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'exp') {
        openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'log') {
        openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'sqrt') {
        openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'hyperbola') {
        openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      if (selected === 'hyperbola2') {
        openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
        return;
      }
      renderUnsupportedClassHint(formula, selected);
    });

    const setMinimized = (value: boolean) => {
      resizeHandle.style.display = value ? 'none' : 'block';
      content.style.display = value ? 'none' : 'block';
      close.style.display = value ? 'none' : 'flex';
      miniWrap.style.display = value ? 'inline-flex' : 'none';
      if (value) {
        panel.style.padding = '4px 6px';
        panel.style.display = 'inline-flex';
        panel.style.alignItems = 'center';
        panel.style.justifyContent = 'center';
        panel.style.width = '38px';
        panel.style.minWidth = '38px';
        panel.style.height = '16px';
        panel.style.minHeight = '16px';
        miniStrip.style.width = '22px';
        miniStrip.style.height = '3px';
      } else {
        panel.style.padding = '14px 10px 8px 10px';
        panel.style.display = 'inline-block';
        panel.style.alignItems = '';
        panel.style.justifyContent = '';
        panel.style.width = '';
        panel.style.minWidth = '';
        panel.style.height = '';
        panel.style.minHeight = '';
        miniStrip.style.width = '';
        miniStrip.style.height = '';
      }
      window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
    };

    close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
    close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
    close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
    miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
    miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
    panel.addEventListener('click', (evt) => {
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
      if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
    }, true);

    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartScale = initialScale;
    let panelScale = initialScale;
    let resizeMode: 'pointer' | 'mouse' | null = null;
    let resizePointerId: number | null = null;
    const onResizeMove = (evt: PointerEvent) => {
      if (resizeMode !== 'pointer') return;
      if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
      const dx = evt.clientX - resizeStartX;
      const dy = evt.clientY - resizeStartY;
      panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
      panel.style.transformOrigin = 'top left';
      panel.style.transform = 'scale(' + panelScale + ')';
      relayoutAnalysisPanels(state);
    };
    const onResizeMoveMouse = (evt: MouseEvent) => {
      if (resizeMode !== 'mouse') return;
      const dx = evt.clientX - resizeStartX;
      const dy = evt.clientY - resizeStartY;
      panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
      panel.style.transformOrigin = 'top left';
      panel.style.transform = 'scale(' + panelScale + ')';
      relayoutAnalysisPanels(state);
    };
    const onResizeEnd = () => {
      resizeMode = null;
      resizePointerId = null;
      window.removeEventListener('pointermove', onResizeMove, true);
      window.removeEventListener('pointerup', onResizeEnd, true);
      window.removeEventListener('pointercancel', onResizeEnd, true);
      window.removeEventListener('mousemove', onResizeMoveMouse, true);
      window.removeEventListener('mouseup', onResizeEnd, true);
      relayoutAnalysisPanels(state);
    };
    const onDocMouseDown = (evt: MouseEvent) => {
      if (resizeMode) return;
      const rect = resizeHandle.getBoundingClientRect();
      if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
      evt.preventDefault();
      evt.stopPropagation();
      resizeMode = 'mouse';
      resizePointerId = null;
      resizeStartX = evt.clientX;
      resizeStartY = evt.clientY;
      resizeStartScale = panelScale;
      window.addEventListener('mousemove', onResizeMoveMouse, true);
      window.addEventListener('mouseup', onResizeEnd, true);
    };
    resizeHandle.addEventListener('pointerdown', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      resizeMode = 'pointer';
      resizePointerId = evt.pointerId;
      resizeStartX = evt.clientX;
      resizeStartY = evt.clientY;
      resizeStartScale = panelScale;
      window.addEventListener('pointermove', onResizeMove, true);
      window.addEventListener('pointerup', onResizeEnd, true);
      window.addEventListener('pointercancel', onResizeEnd, true);
    }, true);
    resizeHandle.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      resizeMode = 'mouse';
      resizePointerId = null;
      resizeStartX = evt.clientX;
      resizeStartY = evt.clientY;
      resizeStartScale = panelScale;
      window.addEventListener('mousemove', onResizeMoveMouse, true);
      window.addEventListener('mouseup', onResizeEnd, true);
    }, true);
    document.addEventListener('mousedown', onDocMouseDown, true);

    setAnalysisOverlayPanelWidth(panel, state.boardContainer);
    state.boardContainer.appendChild(panel);
    entry.panel = panel;
    entry.disposeUi = () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      onResizeEnd();
    };
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
    updateButtonStates(state);
    syncGraph();
    return true;
  }

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openSinAnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  if (!Array.isArray(state.sinAnalysisEntries)) state.sinAnalysisEntries = [];

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A, b, c, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('sin', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: SinAnalysisEntry = {
    id: 'sanalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { A: linkedModels.sin.A, b: linkedModels.sin.b, c: linkedModels.sin.c, d: linkedModels.sin.d }
  };
  state.sinAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'sin');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygr\u00f6\u00dfe \u00e4ndern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: SinParamKey; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<SinParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.sin.A = entry.model.A;
    linkedModels.sin.b = entry.model.b;
    linkedModels.sin.c = entry.model.c;
    linkedModels.sin.d = entry.model.d;
    renderAnalysisFormula(formula, buildSinFormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateSinAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.sin as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'sin') as AnalysisClassKey;
    if (selected === 'sin') {
      syncUiFromModel();
      return;
    }
    removeSinAnalysisEntry(state, entry);
    if (selected === 'linear') {
      openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quadratic') {
      openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'cubic') {
      openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quartic') {
      openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'exp') {
      openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'log') {
      openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sqrt') {
      openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola') {
      openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openExpAnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  if (!Array.isArray(state.expAnalysisEntries)) state.expAnalysisEntries = [];

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d },
      { A, b, c, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('exp', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: ExpAnalysisEntry = {
    id: 'eanalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { A: linkedModels.exp.A, b: linkedModels.exp.b, c: linkedModels.exp.c, d: linkedModels.exp.d }
  };
  state.expAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'exp');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygroesse aendern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: ExpParamKey; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<ExpParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.exp.A = entry.model.A;
    linkedModels.exp.b = entry.model.b;
    linkedModels.exp.c = entry.model.c;
    linkedModels.exp.d = entry.model.d;
    renderAnalysisFormula(formula, buildExpFormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateExpAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.exp as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'exp') as AnalysisClassKey;
    if (selected === 'exp') {
      syncUiFromModel();
      return;
    }
    removeExpAnalysisEntry(state, entry);
    if (selected === 'linear') {
      openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quadratic') {
      openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'cubic') {
      openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quartic') {
      openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sin') {
      openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'log') {
      openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sqrt') {
      openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola') {
      openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openLogAnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  if (!Array.isArray(state.logAnalysisEntries)) state.logAnalysisEntries = [];

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A, b, c, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('log', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: LogAnalysisEntry = {
    id: 'lanalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { A: linkedModels.log.A, b: linkedModels.log.b, c: linkedModels.log.c, d: linkedModels.log.d }
  };
  state.logAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'log');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygroesse aendern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: LogParamKey; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<LogParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.log.A = entry.model.A;
    linkedModels.log.b = entry.model.b;
    linkedModels.log.c = entry.model.c;
    linkedModels.log.d = entry.model.d;
    renderAnalysisFormula(formula, buildLogFormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateLogAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.log as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'log') as AnalysisClassKey;
    if (selected === 'log') {
      syncUiFromModel();
      return;
    }
    removeLogAnalysisEntry(state, entry);
    if (selected === 'linear') {
      openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quadratic') {
      openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'cubic') {
      openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quartic') {
      openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sin') {
      openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'exp') {
      openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sqrt') {
      openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola') {
      openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openSqrtAnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  if (!Array.isArray(state.sqrtAnalysisEntries)) state.sqrtAnalysisEntries = [];

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A, b, c, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('sqrt', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: SqrtAnalysisEntry = {
    id: 'rtanalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { A: linkedModels.sqrt.A, b: linkedModels.sqrt.b, c: linkedModels.sqrt.c, d: linkedModels.sqrt.d }
  };
  state.sqrtAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'sqrt');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygroesse aendern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: SqrtParamKey; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<SqrtParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.sqrt.A = entry.model.A;
    linkedModels.sqrt.b = entry.model.b;
    linkedModels.sqrt.c = entry.model.c;
    linkedModels.sqrt.d = entry.model.d;
    renderAnalysisFormula(formula, buildSqrtFormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateSqrtAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.sqrt as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'sqrt') as AnalysisClassKey;
    if (selected === 'sqrt') {
      syncUiFromModel();
      return;
    }
    removeSqrtAnalysisEntry(state, entry);
    if (selected === 'linear') {
      openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quadratic') {
      openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'cubic') {
      openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'quartic') {
      openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'sin') {
      openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'exp') {
      openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'log') {
      openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    if (selected === 'hyperbola') {
      openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
      return;
    }
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openHyperbolaAnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  if (!Array.isArray(state.hyperbolaAnalysisEntries)) state.hyperbolaAnalysisEntries = [];

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A, b, c, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('hyperbola', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: HyperbolaAnalysisEntry = {
    id: 'hanalysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { A: linkedModels.hyperbola.A, b: linkedModels.hyperbola.b, c: linkedModels.hyperbola.c, d: linkedModels.hyperbola.d }
  };
  state.hyperbolaAnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'hyperbola');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygroesse aendern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: HyperbolaParamKey; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<HyperbolaParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.hyperbola.A = entry.model.A;
    linkedModels.hyperbola.b = entry.model.b;
    linkedModels.hyperbola.c = entry.model.c;
    linkedModels.hyperbola.d = entry.model.d;
    renderAnalysisFormula(formula, buildHyperbolaFormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateHyperbolaAnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.hyperbola as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'hyperbola') as AnalysisClassKey;
    if (selected === 'hyperbola') {
      syncUiFromModel();
      return;
    }
    removeHyperbolaAnalysisEntry(state, entry);
    if (selected === 'linear') return void openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
    if (selected === 'quadratic') return void openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'cubic') return void openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'quartic') return void openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
    if (selected === 'sin') return void openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'exp') return void openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'log') return void openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'sqrt') return void openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'hyperbola2') return void openHyperbola2AnalysisOverlay(state, linkedModels.hyperbola2.A, linkedModels.hyperbola2.b, linkedModels.hyperbola2.c, linkedModels.hyperbola2.d, entry.title, { classProbabilities, linkedModels });
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function openHyperbola2AnalysisOverlay(state: RegressionState, A: number, b: number, c: number, d: number, title: string, options?: AnalysisOverlayOptions): boolean {
  if (!state.boardContainer) return false;

  state.activeTool = '';
  state.regressionMode = '';
  state.toolsMenuOpen = true;
  setMenuOpen(state.toolsMenu, true);

  if (!Array.isArray(state.hyperbola2AnalysisEntries)) state.hyperbola2AnalysisEntries = [];

  state.analysisSeq += 1;
  const linkedModels: AnalysisLinkedModels = options && options.linkedModels
    ? options.linkedModels
    : createLinkedModels(
      { m: 0, n: d },
      { a: 1, c: 0, d },
      { a: 0.1, b: 0, c: 0, d },
      { a: 0.1, b: 0.1, c: 0, d: 0, f: d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A: 1, b: 1, c: 0, d },
      { A, b, c, d }
    );
  const classProbabilities = options && options.classProbabilities
    ? options.classProbabilities
    : makeClassProbabilities('hyperbola2', 100);
  const initialScale = consumeInitialOverlayScale(state, options);

  const entry: Hyperbola2AnalysisEntry = {
    id: 'h2analysis-' + state.analysisSeq,
    title,
    color: state.drawColor || '#ff0000',
    panel: null,
    graph: null,
    model: { A: linkedModels.hyperbola2.A, b: linkedModels.hyperbola2.b, c: linkedModels.hyperbola2.c, d: linkedModels.hyperbola2.d }
  };
  state.hyperbola2AnalysisEntries.push(entry);

  const panel = document.createElement('div');
  panel.className = 'lia-plot-analyze-panel';
  panel.dataset.open = '1';
  panel.style.display = 'inline-block';
  panel.style.pointerEvents = 'auto';
  panel.style.background = neutralColor() === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  panel.style.color = neutralColor();
  panel.style.borderColor = neutralColor() === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
  panel.style.left = '10px';
  panel.style.top = '8px';
  panel.style.right = 'auto';
  panel.style.transformOrigin = 'top left';
  panel.style.transform = 'scale(' + initialScale + ')';
  panel.style.setProperty('--lia-analysis-accent', entry.color);
  stopPanelEventPropagation(panel);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lia-plot-analysis-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Analyse minimieren');
  panel.appendChild(close);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-plot-analysis-mini-wrap';
  const miniStrip = document.createElement('div');
  miniStrip.className = 'lia-plot-analysis-mini-strip';
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-plot-analysis-content';
  panel.appendChild(content);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'lia-plot-analysis-select-wrap';
  const select = document.createElement('select');
  select.className = 'lia-plot-analysis-select';
  select.setAttribute('aria-label', entry.title);
  fillAnalysisClassSelect(select, classProbabilities, 'hyperbola2');
  stopPanelEventPropagation(select);
  selectWrap.appendChild(select);
  content.appendChild(selectWrap);

  const controlsHost = document.createElement('div');
  content.appendChild(controlsHost);

  const formula = document.createElement('div');
  formula.className = 'lia-plot-analysis-formula';
  content.appendChild(formula);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'lia-plot-analysis-resize';
  resizeHandle.setAttribute('aria-label', 'Overlaygroesse aendern');
  panel.appendChild(resizeHandle);

  const rows: Array<{ key: Hyperbola2ParamKey; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'b', label: 'b' },
    { key: 'c', label: 'c' },
    { key: 'd', label: 'd' }
  ];
  const sliderByKey: Partial<Record<Hyperbola2ParamKey, HTMLInputElement>> = {};

  const syncUiFromModel = () => {
    rows.forEach((rowEntry) => {
      const slider = sliderByKey[rowEntry.key];
      if (slider) {
        slider.value = String((entry.model as any)[rowEntry.key]);
        updateAnalysisSliderFill(slider);
      }
    });
    linkedModels.hyperbola2.A = entry.model.A;
    linkedModels.hyperbola2.b = entry.model.b;
    linkedModels.hyperbola2.c = entry.model.c;
    linkedModels.hyperbola2.d = entry.model.d;
    renderAnalysisFormula(formula, buildHyperbola2FormulaTex(entry.model.A, entry.model.b, entry.model.c, entry.model.d));
  };

  const syncGraph = () => {
    updateHyperbola2AnalysisGraph(state, entry);
    syncUiFromModel();
    redrawCanvas(state);
  };

  entry.syncUi = () => syncUiFromModel();

  rows.forEach((rowEntry) => {
    const row = document.createElement('div');
    row.className = 'lia-plot-analysis-row';
    const label = document.createElement('div');
    label.className = 'lia-plot-analysis-label';
    label.innerHTML = '\\(' + rowEntry.label + '\\):';
    typesetOverlayMath(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lia-plot-analysis-slider';
    slider.min = '-10';
    slider.max = '10';
    slider.step = '0.05';
    slider.value = String((entry.model as any)[rowEntry.key]);
    stopPanelEventPropagation(slider);
    updateAnalysisSliderFill(slider);
    sliderByKey[rowEntry.key] = slider;

    const onChange = () => {
      (entry.model as any)[rowEntry.key] = Number(slider.value);
      (linkedModels.hyperbola2 as any)[rowEntry.key] = Number(slider.value);
      syncGraph();
    };
    slider.addEventListener('input', onChange);
    slider.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(slider);
    controlsHost.appendChild(row);
  });

  select.addEventListener('change', () => {
    const selected = String(select.value || 'hyperbola2') as AnalysisClassKey;
    if (selected === 'hyperbola2') {
      syncUiFromModel();
      return;
    }
    removeHyperbola2AnalysisEntry(state, entry);
    if (selected === 'linear') return void openLinearAnalysisOverlay(state, linkedModels.linear.m, linkedModels.linear.n, entry.title, { classProbabilities, linkedModels });
    if (selected === 'quadratic') return void openQuadraticAnalysisOverlay(state, linkedModels.quadratic.a, linkedModels.quadratic.c, linkedModels.quadratic.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'cubic') return void openCubicAnalysisOverlay(state, linkedModels.cubic.a, linkedModels.cubic.b, linkedModels.cubic.c, linkedModels.cubic.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'quartic') return void openQuarticAnalysisOverlay(state, linkedModels.quartic.a, linkedModels.quartic.b, linkedModels.quartic.c, linkedModels.quartic.d, linkedModels.quartic.f, entry.title, { classProbabilities, linkedModels });
    if (selected === 'sin') return void openSinAnalysisOverlay(state, linkedModels.sin.A, linkedModels.sin.b, linkedModels.sin.c, linkedModels.sin.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'exp') return void openExpAnalysisOverlay(state, linkedModels.exp.A, linkedModels.exp.b, linkedModels.exp.c, linkedModels.exp.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'log') return void openLogAnalysisOverlay(state, linkedModels.log.A, linkedModels.log.b, linkedModels.log.c, linkedModels.log.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'sqrt') return void openSqrtAnalysisOverlay(state, linkedModels.sqrt.A, linkedModels.sqrt.b, linkedModels.sqrt.c, linkedModels.sqrt.d, entry.title, { classProbabilities, linkedModels });
    if (selected === 'hyperbola') return void openHyperbolaAnalysisOverlay(state, linkedModels.hyperbola.A, linkedModels.hyperbola.b, linkedModels.hyperbola.c, linkedModels.hyperbola.d, entry.title, { classProbabilities, linkedModels });
    renderUnsupportedClassHint(formula, selected);
  });

  const setMinimized = (value: boolean) => {
    resizeHandle.style.display = value ? 'none' : 'block';
    content.style.display = value ? 'none' : 'block';
    close.style.display = value ? 'none' : 'flex';
    miniWrap.style.display = value ? 'inline-flex' : 'none';
    if (value) {
      panel.style.padding = '4px 6px';
      panel.style.display = 'inline-flex';
      panel.style.alignItems = 'center';
      panel.style.justifyContent = 'center';
      panel.style.width = '38px';
      panel.style.minWidth = '38px';
      panel.style.height = '16px';
      panel.style.minHeight = '16px';
      miniStrip.style.width = '22px';
      miniStrip.style.height = '3px';
    } else {
      panel.style.padding = '14px 10px 8px 10px';
      panel.style.display = 'inline-block';
      panel.style.alignItems = '';
      panel.style.justifyContent = '';
      panel.style.width = '';
      panel.style.minWidth = '';
      panel.style.height = '';
      panel.style.minHeight = '';
      miniStrip.style.width = '';
      miniStrip.style.height = '';
    }
    window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  };

  close.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); });
  close.addEventListener('pointerdown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  close.addEventListener('mousedown', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); }, true);
  miniWrap.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  miniStrip.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }, true);
  panel.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target === close || close.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(true); return; }
    if (target === miniWrap || miniWrap.contains(target)) { evt.preventDefault(); evt.stopPropagation(); setMinimized(false); }
  }, true);

  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartScale = initialScale;
  let panelScale = initialScale;
  let resizeMode: 'pointer' | 'mouse' | null = null;
  let resizePointerId: number | null = null;
  const onResizeMove = (evt: PointerEvent) => {
    if (resizeMode !== 'pointer') return;
    if (resizePointerId !== null && evt.pointerId !== resizePointerId) return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeMoveMouse = (evt: MouseEvent) => {
    if (resizeMode !== 'mouse') return;
    const dx = evt.clientX - resizeStartX;
    const dy = evt.clientY - resizeStartY;
    panelScale = Math.max(0.35, Math.min(1.45, resizeStartScale + (Math.max(dx, dy) / 260)));
    panel.style.transformOrigin = 'top left';
    panel.style.transform = 'scale(' + panelScale + ')';
    relayoutAnalysisPanels(state);
  };
  const onResizeEnd = () => {
    resizeMode = null;
    resizePointerId = null;
    window.removeEventListener('pointermove', onResizeMove, true);
    window.removeEventListener('pointerup', onResizeEnd, true);
    window.removeEventListener('pointercancel', onResizeEnd, true);
    window.removeEventListener('mousemove', onResizeMoveMouse, true);
    window.removeEventListener('mouseup', onResizeEnd, true);
    relayoutAnalysisPanels(state);
  };
  const onDocMouseDown = (evt: MouseEvent) => {
    if (resizeMode) return;
    const rect = resizeHandle.getBoundingClientRect();
    if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) return;
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  };
  resizeHandle.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'pointer';
    resizePointerId = evt.pointerId;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('pointermove', onResizeMove, true);
    window.addEventListener('pointerup', onResizeEnd, true);
    window.addEventListener('pointercancel', onResizeEnd, true);
  }, true);
  resizeHandle.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    resizeMode = 'mouse';
    resizePointerId = null;
    resizeStartX = evt.clientX;
    resizeStartY = evt.clientY;
    resizeStartScale = panelScale;
    window.addEventListener('mousemove', onResizeMoveMouse, true);
    window.addEventListener('mouseup', onResizeEnd, true);
  }, true);
  document.addEventListener('mousedown', onDocMouseDown, true);

  setAnalysisOverlayPanelWidth(panel, state.boardContainer);
  state.boardContainer.appendChild(panel);
  entry.panel = panel;
  entry.disposeUi = () => {
    document.removeEventListener('mousedown', onDocMouseDown, true);
    onResizeEnd();
  };
  window.requestAnimationFrame(() => relayoutAnalysisPanels(state));
  updateButtonStates(state);
  syncGraph();
  return true;
}

function syncCanvasSize(state: RegressionState): void {
  const layer = state.drawLayer;
  const rect = state.boardContainer.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 100) / 100);
  const pxW = Math.max(1, Math.round(cssW * dpr));
  const pxH = Math.max(1, Math.round(cssH * dpr));

  if (layer.width !== pxW || layer.height !== pxH) {
    layer.width = pxW;
    layer.height = pxH;
  }

  layer.style.width = cssW + 'px';
  layer.style.height = cssH + 'px';

  const ctx = layer.getContext('2d');
  state.drawCtx = ctx;
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function redrawCanvas(state: RegressionState): void {
  syncCanvasSize(state);
  const ctx = state.drawCtx;
  if (!ctx) return;

  const w = state.drawLayer.clientWidth;
  const h = state.drawLayer.clientHeight;
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < state.strokes.length; i += 1) {
    const stroke = state.strokes[i];
    if (!stroke || stroke.points.length === 0) continue;
    const first = userToLocal(state, stroke.points[0]);

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);

    for (let p = 1; p < stroke.points.length; p += 1) {
      const localPoint = userToLocal(state, stroke.points[p]);
      ctx.lineTo(localPoint.x, localPoint.y);
    }

    if (stroke.points.length === 1) {
      ctx.lineTo(first.x + 0.01, first.y + 0.01);
    }

    ctx.stroke();
    ctx.restore();
  }

  if (Array.isArray(state.regressionPoints) && state.regressionPoints.length > 0) {
    const tone = neutralColor();
    const selectablePoints = getSelectableBoardPoints(state);
    const pointByKey = new Map<string, AutoPointData>();
    for (let i = 0; i < selectablePoints.length; i += 1) {
      pointByKey.set(selectablePoints[i].key, selectablePoints[i]);
    }

    for (let i = 0; i < state.regressionPoints.length; i += 1) {
      const point = state.regressionPoints[i];
      const sourcePoint = pointByKey.get(point.key) || point;
      const local = userToLocal(state, sourcePoint);
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = '#ff00ff';
      ctx.strokeStyle = tone;
      ctx.lineWidth = 2;
      ctx.arc(local.x, local.y, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.arc(local.x, local.y, 2.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function eraseAtPoint(state: RegressionState, point: DrawPoint, thresholdPx: number): boolean {
  const hit = hitStrokeIndex(state, point, thresholdPx);
  if (hit < 0) return false;

  const stroke = state.strokes[hit];
  if (!stroke) return false;

  state.strokes.splice(hit, 1);
  state.eraseRemoved.push({ stroke, index: hit });
  return true;
}

function applyUndoAction(state: RegressionState, action: DrawAction): void {
  if (action.type === 'add') {
    const idx = state.strokes.indexOf(action.stroke);
    if (idx >= 0) state.strokes.splice(idx, 1);
    return;
  }

  if (action.type === 'point-add') {
    removeAutoPoint(state, action.point.key);
    return;
  }

  if (action.type === 'point-remove') {
    createAutoPoint(state, action.point.x, action.point.y, action.point.key);
    return;
  }

  const sorted = action.removed.slice().sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    const pos = Math.max(0, Math.min(entry.index, state.strokes.length));
    state.strokes.splice(pos, 0, entry.stroke);
  }
}

function applyRedoAction(state: RegressionState, action: DrawAction): void {
  if (action.type === 'add') {
    state.strokes.push(action.stroke);
    return;
  }

  if (action.type === 'point-add') {
    createAutoPoint(state, action.point.x, action.point.y, action.point.key);
    return;
  }

  if (action.type === 'point-remove') {
    removeAutoPoint(state, action.point.key);
    return;
  }

  for (let i = action.removed.length - 1; i >= 0; i -= 1) {
    const entry = action.removed[i];
    const idx = state.strokes.indexOf(entry.stroke);
    if (idx >= 0) {
      state.strokes.splice(idx, 1);
      continue;
    }

    const fallback = Math.max(0, Math.min(entry.index, state.strokes.length - 1));
    if (state.strokes[fallback] === entry.stroke) {
      state.strokes.splice(fallback, 1);
    }
  }
}

function bindDrawLayer(state: RegressionState): void {
  const layer = state.drawLayer;

  layer.onpointerdown = (evt: PointerEvent) => {
    if (state.activeTool !== 'draw' && state.activeTool !== 'erase' && state.activeTool !== 'regression') return;

    evt.preventDefault();
    evt.stopPropagation();

    const point = getDrawPos(layer, evt);

    if (state.activeTool === 'regression' && state.regressionMode === 'select-points') {
      const hitPoint = findNearestSelectableBoardPoint(state, point, 14);
      if (hitPoint) {
        toggleRegressionPoint(state, hitPoint);
        updateButtonStates(state);
        redrawCanvas(state);
      }
      state.pointerId = evt.pointerId;
      state.drawing = false;
      try { layer.setPointerCapture(evt.pointerId); } catch (e) {}
      return;
    }

    if (state.activeTool === 'regression' && state.regressionMode === 'recognize') {
      const strokeIndex = hitStrokeIndex(state, point, 18);
      const stroke = strokeIndex >= 0 ? state.strokes[strokeIndex] : (state.currentStroke || state.strokes[state.strokes.length - 1] || null);
      if (stroke) {
        recognizeLinearFromStroke(state, stroke);
        updateButtonStates(state);
        redrawCanvas(state);
      }
      state.pointerId = evt.pointerId;
      state.drawing = false;
      try { layer.setPointerCapture(evt.pointerId); } catch (e) {}
      return;
    }

    if (state.activeTool === 'erase') {
      state.eraseRemoved = [];
      if (eraseAtPoint(state, point, 10)) {
        redrawCanvas(state);
        updateButtonStates(state);
      } else {
        const hitPoint = findNearestAutoPoint(state, point, 14);
        if (hitPoint) {
          const removed = removeAutoPoint(state, hitPoint.key);
          if (removed) {
            state.undoActions.push({ type: 'point-remove', point: removed });
            state.redoActions = [];
          }
          redrawCanvas(state);
          updateButtonStates(state);
        }
      }
      state.pointerId = evt.pointerId;
      state.drawing = true;
      try { layer.setPointerCapture(evt.pointerId); } catch (e) {}
      return;
    }

    const stroke: DrawStroke = {
      color: state.drawColor,
      width: 3,
      points: [localToUser(state, point)]
    };

    state.currentStroke = stroke;
    state.strokes.push(stroke);
    state.pointerId = evt.pointerId;
    state.drawing = true;
    redrawCanvas(state);
    updateButtonStates(state);

    try { layer.setPointerCapture(evt.pointerId); } catch (e) {}
  };

  layer.onpointermove = (evt: PointerEvent) => {
    if (!state.drawing || state.pointerId !== evt.pointerId) return;
    if (state.activeTool !== 'draw' && state.activeTool !== 'erase') return;

    evt.preventDefault();
    evt.stopPropagation();

    const point = getDrawPos(layer, evt);

    if (state.activeTool === 'erase') {
      if (eraseAtPoint(state, point, 12)) {
        redrawCanvas(state);
        updateButtonStates(state);
      }
      return;
    }

    if (!state.currentStroke) return;
    state.currentStroke.points.push(localToUser(state, point));
    redrawCanvas(state);
  };

  const finishPointer = (evt: PointerEvent) => {
    if (!state.drawing || state.pointerId !== evt.pointerId) return;

    evt.preventDefault();
    evt.stopPropagation();

    state.drawing = false;
    state.pointerId = null;

    if (state.activeTool === 'regression') {
      updateButtonStates(state);
      return;
    }

    if (state.activeTool === 'erase') {
      if (state.eraseRemoved.length > 0) {
        state.undoActions.push({ type: 'erase', removed: state.eraseRemoved.slice() });
        state.redoActions = [];
      }
      state.eraseRemoved = [];
      state.currentStroke = null;
      updateButtonStates(state);
      return;
    }

    if (state.currentStroke) {
      state.undoActions.push({ type: 'add', stroke: state.currentStroke });
      state.redoActions = [];

      if (state.strokes.length >= 2) {
        const s1 = state.strokes[state.strokes.length - 2];
        const s2 = state.strokes[state.strokes.length - 1];
        if (s1 && s2 && Array.isArray(s1.points) && Array.isArray(s2.points)) {
          const hit = findStrokesIntersection(s1.points, s2.points);
          if (hit.intersects && Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
            const created = createAutoPoint(state, Number(hit.x), Number(hit.y));
            if (created) {
              state.undoActions.push({ type: 'point-add', point: created });
            }
          }
        }
      }
    }

    state.currentStroke = null;
    updateButtonStates(state);
  };

  layer.onpointerup = finishPointer;
  layer.onpointercancel = finishPointer;
}

function rebuildColorMenu(state: RegressionState): void {
  let html = '<div class="lia-plot-color-grid">';

  for (let i = 0; i < DRAW_COLORS.length; i += 1) {
    const color = DRAW_COLORS[i];
    const active = String(color).toLowerCase() === String(state.drawColor).toLowerCase() ? '1' : '0';
    html += '<button class="lia-plot-color-item" type="button" data-color="' + color + '" data-active="' + active + '" style="background:' + color + ';" aria-label="Farbe ' + color + '"></button>';
  }

  html += '</div>';
  state.drawColorMenu.innerHTML = html;

  state.drawColorMenu.querySelectorAll<HTMLElement>('.lia-plot-color-item').forEach((item) => {
    item.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();

      const color = String(item.dataset.color || '').trim();
      if (!color) return;

      state.drawColor = color;
      state.drawButton.style.setProperty('--draw-color', color);
      rebuildColorMenu(state);
      redrawCanvas(state);
    });
  });
}

function applyLayout(state: RegressionState): void {
  const tone = neutralColor();
  const menuFill = tone === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.94)';
  const menuBorder = tone === '#fff' ? 'rgba(255,255,255,.62)' : 'rgba(0,0,0,.46)';

  state.undoButton.style.position = 'absolute';
  state.undoButton.style.left = '10px';
  state.undoButton.style.bottom = '10px';
  state.undoButton.style.color = tone;

  state.redoButton.style.position = 'absolute';
  state.redoButton.style.left = '46px';
  state.redoButton.style.bottom = '10px';
  state.redoButton.style.color = tone;

  state.drawButton.style.position = 'absolute';
  state.drawButton.style.left = '82px';
  state.drawButton.style.bottom = '10px';
  state.drawButton.style.color = tone;
  state.drawButton.style.setProperty('--draw-color', state.drawColor);

  state.eraseButton.style.position = 'absolute';
  state.eraseButton.style.left = '118px';
  state.eraseButton.style.bottom = '10px';
  state.eraseButton.style.color = tone;

  state.toolsButton.style.position = 'absolute';
  state.toolsButton.style.left = '154px';
  state.toolsButton.style.bottom = '10px';
  state.toolsButton.style.color = tone;

  state.drawColorMenu.style.left = '10px';
  state.drawColorMenu.style.bottom = '56px';
  state.drawColorMenu.style.background = menuFill;
  state.drawColorMenu.style.color = tone;
  state.drawColorMenu.style.borderColor = menuBorder;
  state.drawColorMenu.style.borderStyle = 'solid';
  state.drawColorMenu.style.borderWidth = '1px';
  state.drawColorMenu.style.boxShadow = '0 6px 18px rgba(0,0,0,.18)';

  state.toolsMenu.style.left = '184px';
  state.toolsMenu.style.bottom = '10px';
  state.toolsMenu.style.background = menuFill;
  state.toolsMenu.style.color = tone;
  state.toolsMenu.style.borderColor = menuBorder;
  state.toolsMenu.style.borderStyle = 'solid';
  state.toolsMenu.style.borderWidth = '1px';
  state.toolsMenu.style.boxShadow = '0 6px 18px rgba(0,0,0,.18)';

  state.drawLayer.style.position = 'absolute';
  state.drawLayer.style.left = '0';
  state.drawLayer.style.top = '0';
  state.drawLayer.style.right = '0';
  state.drawLayer.style.bottom = '0';
  state.drawLayer.style.width = '100%';
  state.drawLayer.style.height = '100%';
  state.drawLayer.style.zIndex = '47';

  updateButtonStates(state);
  redrawCanvas(state);
}

function setupRegressionUI(uid: string, boardId: string): void {
  if (!uid || !boardId) return;

  const boardContainer = getBoardContainer(boardId);
  const board = window.__boards && window.__boards[boardId];
  if (!boardContainer || !board) {
    const retries = (pendingRetries[uid] || 0) + 1;
    pendingRetries[uid] = retries;

    if (retries <= MAX_RETRIES) {
      window.setTimeout(() => {
        setupRegressionUI(uid, boardId);
      }, RETRY_DELAY_MS);
    }
    return;
  }

  pendingRetries[uid] = 0;

  const anchor = document.getElementById(`regression-ui-${uid}`);
  if (anchor) {
    anchor.style.display = 'none';
    anchor.setAttribute('aria-hidden', 'true');
  }

  const rootNode = (boardContainer.getRootNode && boardContainer.getRootNode()) || document;
  ensureStyles(rootNode as Document | ShadowRoot);

  const existing = states[uid];
  if (existing && !Array.isArray(existing.sinAnalysisEntries)) {
    existing.sinAnalysisEntries = [];
  }
  if (existing && !Array.isArray(existing.expAnalysisEntries)) {
    existing.expAnalysisEntries = [];
  }
  if (existing && !Array.isArray(existing.logAnalysisEntries)) {
    existing.logAnalysisEntries = [];
  }
  if (existing && !Array.isArray(existing.sqrtAnalysisEntries)) {
    existing.sqrtAnalysisEntries = [];
  }
  if (existing && !Array.isArray(existing.hyperbolaAnalysisEntries)) {
    existing.hyperbolaAnalysisEntries = [];
  }
  if (
    existing &&
    existing.boardContainer === boardContainer &&
    existing.drawLayer.isConnected &&
    existing.undoButton.isConnected &&
    existing.redoButton.isConnected &&
    existing.drawButton.isConnected &&
    existing.eraseButton.isConnected &&
    existing.toolsButton.isConnected &&
    existing.drawColorMenu.isConnected &&
    existing.toolsMenu.isConnected
  ) {
    applyLayout(existing);
    return;
  }

  if (existing) {
    removeAllAnalysisOverlays(existing);
    removeAllQuadraticAnalysisOverlays(existing);
    removeAllCubicAnalysisOverlays(existing);
    removeAllQuarticAnalysisOverlays(existing);
    removeAllSinAnalysisOverlays(existing);
    removeAllExpAnalysisOverlays(existing);
    removeAllLogAnalysisOverlays(existing);
    removeAllSqrtAnalysisOverlays(existing);
    removeAllHyperbolaAnalysisOverlays(existing);
    if (existing.onBoardViewportChange && existing.board && typeof existing.board.off === 'function') {
      try { existing.board.off('update', existing.onBoardViewportChange); } catch (e) {}
      try { existing.board.off('move', existing.onBoardViewportChange); } catch (e) {}
      try { existing.board.off('boundingbox', existing.onBoardViewportChange); } catch (e) {}
    }
    if (existing.onBoardPointerDown) {
      existing.boardContainer.removeEventListener('pointerdown', existing.onBoardPointerDown, true);
    }
    if (existing.onDocPointerDown) {
      document.removeEventListener('pointerdown', existing.onDocPointerDown);
    }
    if (existing.onWindowResize) {
      window.removeEventListener('resize', existing.onWindowResize);
    }
    if (existing.resizeObserver) {
      existing.resizeObserver.disconnect();
    }
    try { existing.drawLayer.remove(); } catch (e) {}
    try { existing.undoButton.remove(); } catch (e) {}
    try { existing.redoButton.remove(); } catch (e) {}
    try { existing.drawButton.remove(); } catch (e) {}
    try { existing.eraseButton.remove(); } catch (e) {}
    try { existing.toolsButton.remove(); } catch (e) {}
    try { existing.drawColorMenu.remove(); } catch (e) {}
    try { existing.toolsMenu.remove(); } catch (e) {}
  }

  const undoButton = createToolbarButton(
    'lia-plot-draw-toggle lia-plot-undo-btn',
    'Rueckgaengig',
    '<svg viewBox="-4 0 24 24" aria-hidden="true" style="transform:translateX(-4px);"><path d="M21 8H10.2V4L2 12l8.2 8v-4H21V8z" fill="currentColor"></path><rect x="10.2" y="10.6" width="10.8" height="2.8" rx="1.4" fill="currentColor"></rect></svg>'
  );

  const redoButton = createToolbarButton(
    'lia-plot-draw-toggle lia-plot-redo-btn',
    'Wiederherstellen',
    '<svg viewBox="-4 0 24 24" aria-hidden="true" style="transform:translateX(-4px);"><path d="M3 8h10.8V4l8.2 8-8.2 8v-4H3V8z" fill="currentColor"></path><rect x="3" y="10.6" width="10.8" height="2.8" rx="1.4" fill="currentColor"></rect></svg>'
  );

  const drawButton = createToolbarButton(
    'lia-plot-draw-toggle lia-plot-draw-btn',
    'Freihandzeichnen',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="ico-stroke" d="M4 20l4.7-1.1L19 8.6 15.4 5 5.1 15.3z"></path><path class="ico-stroke" d="M13.9 6.5l3.6 3.6"></path><circle class="ico-color-dot" cx="16.5" cy="16.5" r="4.5"></circle></svg>'
  );

  const eraseButton = createToolbarButton(
    'lia-plot-draw-toggle lia-plot-erase-toggle',
    'Pinselstrich loeschen',
    '<svg viewBox="0 0 24 24" aria-hidden="true" style="transform:translate(-1px, -2px);"><path class="ico-stroke" d="M6.2 15.7l8-8a2 2 0 0 1 2.8 0l3.1 3.1a2 2 0 0 1 0 2.8L13.4 20.3H9.3l-3.1-3.1a2 2 0 0 1 0-1.5z"></path><path class="ico-stroke" d="M9.2 20.3h8"></path><path class="ico-stroke" d="M10 13.9l5.7 5.7"></path></svg>'
  );

  const toolsButton = createToolbarButton(
    'lia-plot-draw-toggle lia-plot-regression-toggle',
    'Tools',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="ico-stroke" d="M5 18h4"></path><path class="ico-stroke" d="M7 16v4"></path><path class="ico-stroke" d="M12.8 4.5l1.7 3.5 3.9.5-2.8 2.7.7 3.8-3.5-1.8-3.5 1.8.7-3.8-2.8-2.7 3.9-.5z"></path></svg>'
  );

  const drawColorMenu = document.createElement('div');
  drawColorMenu.className = 'lia-plot-color-menu';

  const drawLayer = document.createElement('canvas');
  drawLayer.className = 'lia-plot-draw-layer';
  drawLayer.setAttribute('aria-hidden', 'true');

  const toolsMenu = document.createElement('div');
  toolsMenu.className = 'lia-plot-color-menu lia-plot-reg-menu';
  toolsMenu.innerHTML = '' +
    '<button class="lia-plot-reg-item" type="button" data-action="recognize">Zeichnung erkennen</button>' +
    '<button class="lia-plot-reg-item" type="button" data-action="select-points">Punkte ausw\u00e4hlen</button>' +
    '<button class="lia-plot-reg-item is-disabled" type="button" data-action="compute" disabled="">Regression berechnen</button>' +
    '<button class="lia-plot-reg-item is-disabled" type="button" data-action="clear" disabled="">Auswahl aufheben</button>';

  boardContainer.appendChild(drawLayer);
  boardContainer.appendChild(undoButton);
  boardContainer.appendChild(redoButton);
  boardContainer.appendChild(drawButton);
  boardContainer.appendChild(eraseButton);
  boardContainer.appendChild(toolsButton);
  boardContainer.appendChild(drawColorMenu);
  boardContainer.appendChild(toolsMenu);

  const state: RegressionState = {
    uid,
    boardId,
    board,
    anchor,
    boardContainer,
    drawLayer,
    drawCtx: null,
    drawButton,
    eraseButton,
    toolsButton,
    undoButton,
    redoButton,
    drawColorMenu,
    toolsMenu,
    drawColor: '#ff0000',
    drawColorMenuOpen: false,
    toolsMenuOpen: false,
    activeTool: '',
    regressionMode: '',
    strokes: [],
    undoActions: [],
    redoActions: [],
    regressionPoints: [],
    drawing: false,
    pointerId: null,
    currentStroke: null,
    eraseRemoved: [],
    autoCreatedPointsData: [],
    recognitionGraph: null,
    regressionGraph: null,
    analysisEntries: [],
    quadraticAnalysisEntries: [],
    cubicAnalysisEntries: [],
    quarticAnalysisEntries: [],
    sinAnalysisEntries: [],
    expAnalysisEntries: [],
    logAnalysisEntries: [],
    sqrtAnalysisEntries: [],
    hyperbolaAnalysisEntries: [],
    hyperbola2AnalysisEntries: [],
    analysisSeq: 0
  };

  bindDrawLayer(state);
  rebuildColorMenu(state);
  setMenuOpen(drawColorMenu, false);
  setMenuOpen(toolsMenu, false);
  applyLayout(state);

  drawButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();

    const open = !state.drawColorMenuOpen;
    state.drawColorMenuOpen = open;
    state.toolsMenuOpen = false;
    state.activeTool = open ? 'draw' : '';

    setMenuOpen(state.drawColorMenu, open);
    setMenuOpen(state.toolsMenu, false);
    updateButtonStates(state);
    redrawCanvas(state);
  });

  eraseButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();

    const isActive = state.activeTool === 'erase';
    state.activeTool = isActive ? '' : 'erase';
    state.drawColorMenuOpen = false;
    state.toolsMenuOpen = false;

    setMenuOpen(state.drawColorMenu, false);
    setMenuOpen(state.toolsMenu, false);
    updateButtonStates(state);
    redrawCanvas(state);
  });

  toolsButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();

    const open = !state.toolsMenuOpen;
    state.toolsMenuOpen = open;
    state.drawColorMenuOpen = false;
    state.activeTool = open ? 'tools' : '';

    setMenuOpen(state.toolsMenu, open);
    setMenuOpen(state.drawColorMenu, false);
    updateButtonStates(state);
    redrawCanvas(state);
  });

  toolsMenu.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    const button = target && target.closest ? target.closest('.lia-plot-reg-item') as HTMLButtonElement | null : null;
    if (!button) return;

    evt.preventDefault();
    evt.stopPropagation();

    const action = String(button.dataset.action || '').trim();
    if (action === 'recognize') {
      state.regressionMode = 'recognize';
      state.activeTool = 'regression';
      state.drawing = false;
      state.pointerId = null;
      state.toolsMenuOpen = true;
      setMenuOpen(state.toolsMenu, true);
      updateButtonStates(state);
      redrawCanvas(state);
      return;
    }

    if (action === 'select-points') {
      state.regressionMode = 'select-points';
      state.activeTool = 'regression';
      state.toolsMenuOpen = true;
      setMenuOpen(state.toolsMenu, true);
      updateButtonStates(state);
      redrawCanvas(state);
      return;
    }

    if (action === 'compute') {
      computeLinearRegression(state);
      state.toolsMenuOpen = true;
      setMenuOpen(state.toolsMenu, true);
      updateButtonStates(state);
      redrawCanvas(state);
      return;
    }

    if (action === 'clear') {
      clearRegressionSelection(state);
      state.regressionMode = '';
      state.toolsMenuOpen = true;
      setMenuOpen(state.toolsMenu, true);
      updateButtonStates(state);
      redrawCanvas(state);
      return;
    }
  });

  undoButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (state.undoActions.length > 0) {
      const action = state.undoActions.pop() as DrawAction;
      applyUndoAction(state, action);
      state.redoActions.push(action);
      redrawCanvas(state);
      updateButtonStates(state);
      return;
    }

    try {
      if (typeof window.undoAction === 'function') {
        window.undoAction(boardId);
      }
    } catch (e) {}
  });

  redoButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (state.redoActions.length > 0) {
      const action = state.redoActions.pop() as DrawAction;
      applyRedoAction(state, action);
      state.undoActions.push(action);
      redrawCanvas(state);
      updateButtonStates(state);
      return;
    }

    try {
      if (typeof window.redoAction === 'function') {
        window.redoAction(boardId);
      }
    } catch (e) {}
  });

  state.onDocPointerDown = (evt: PointerEvent) => {
    const target = evt.target as Node | null;
    if (!target) return;

    const insideDraw =
      state.drawButton.contains(target) ||
      state.drawColorMenu.contains(target) ||
      state.drawLayer.contains(target) ||
      eventPathIncludes(evt, state.drawButton) ||
      eventPathIncludes(evt, state.drawColorMenu) ||
      eventPathIncludes(evt, state.drawLayer);

    const insideTools =
      state.toolsButton.contains(target) ||
      state.toolsMenu.contains(target) ||
      eventPathIncludes(evt, state.toolsButton) ||
      eventPathIncludes(evt, state.toolsMenu);

    const insideBoard =
      state.boardContainer.contains(target) ||
      eventPathIncludes(evt, state.boardContainer);

    if (insideDraw || insideTools || insideBoard) return;

    state.drawColorMenuOpen = false;
    state.toolsMenuOpen = false;
    state.activeTool = '';
    setMenuOpen(state.drawColorMenu, false);
    setMenuOpen(state.toolsMenu, false);
    updateButtonStates(state);
    redrawCanvas(state);
  };

  state.onBoardPointerDown = (evt: PointerEvent) => {
    if (state.activeTool !== 'regression' || state.regressionMode !== 'select-points') return;

    const point = getContainerPos(state.boardContainer, evt);
    const hitPoint = findNearestSelectableBoardPoint(state, point, 14);
    if (!hitPoint) return;

    evt.preventDefault();
    evt.stopPropagation();
    toggleRegressionPoint(state, hitPoint);
    updateButtonStates(state);
    redrawCanvas(state);
  };
  state.boardContainer.addEventListener('pointerdown', state.onBoardPointerDown, true);

  state.onBoardViewportChange = () => {
    redrawCanvas(state);
  };
  if (state.board && typeof state.board.on === 'function') {
    try { state.board.on('update', state.onBoardViewportChange); } catch (e) {}
    try { state.board.on('move', state.onBoardViewportChange); } catch (e) {}
    try { state.board.on('boundingbox', state.onBoardViewportChange); } catch (e) {}
  }

  document.addEventListener('pointerdown', state.onDocPointerDown);

  state.onWindowResize = () => {
    redrawCanvas(state);
  };
  window.addEventListener('resize', state.onWindowResize);

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      redrawCanvas(state);
    });
    ro.observe(boardContainer);
    state.resizeObserver = ro;
  }

  states[uid] = state;
  window.__liaRegressionStates = window.__liaRegressionStates || {};
  window.__liaRegressionStates[uid] = state;
}

window.__setupRegressionUI = function (uid: string, spec: string) {
  const boardId = unquote(String(spec || '').trim());
  scheduleBootstrap(() => {
    setupRegressionUI(uid, boardId);
  });
};

export function bootstrapRegression(): void {
  const anchors = document.querySelectorAll('[id^="regression-ui-"][data-spec]');

  anchors.forEach((el: Element) => {
    const match = String(el.id || '').match(/^regression-ui-(.+)$/);
    if (!match) return;

    const uid = match[1];
    const spec = (el as HTMLElement).dataset.spec || '';
    const boardId = unquote(String(spec).trim());
    setupRegressionUI(uid, boardId);
  });
}

export function init(): void {
  if (window.__regressionReady) {
    try {
      if (window.__bootstrapRegression) window.__bootstrapRegression();
    } catch (e) {}
    return;
  }

  window.__regressionReady = true;
  window.__bootstrapRegression = bootstrapRegression;

  scheduleBootstrap(() => {
    bootstrapRegression();
  });
}

