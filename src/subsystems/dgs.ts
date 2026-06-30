// DGS subsystem (@DGS macro).
// Adds a menu button and a sliding top menu bar to a coordinate board.

import { scheduleBootstrap } from '../shared/bootstrap';
import { unquote } from '../shared/parser';
import { getAccentColor, getNeutralColor, initThemeSync } from '../shared/theme';

type DgsState = {
  uid: string;
  boardId: string;
  language: 'de' | 'en';
  board: any;
  boardContainer: HTMLElement;
  button: HTMLButtonElement;
  menuClip: HTMLDivElement;
  menuBar: HTMLDivElement;
  sideMenuClip: HTMLDivElement;
  sideMenu: HTMLDivElement;
  sideMenuTitle: HTMLDivElement;
  sideMenuObjectType: HTMLSpanElement;
  sideMenuNameInput: HTMLInputElement;
  sideMenuCloseButton: HTMLButtonElement;
  coordinateSection: HTMLDivElement;
  xCoordinateInput: HTMLInputElement;
  yCoordinateInput: HTMLInputElement;
  fixedCheckbox: HTMLInputElement;
  nameCheckbox: HTMLInputElement;
  objectCheckbox: HTMLInputElement;
  objectCheckboxText: HTMLSpanElement;
  measurementOption: HTMLLabelElement;
  measurementCheckbox: HTMLInputElement;
  measurementCheckboxText: HTMLSpanElement;
  areaOption: HTMLLabelElement;
  areaCheckbox: HTMLInputElement;
  perimeterOption: HTMLLabelElement;
  perimeterCheckbox: HTMLInputElement;
  colorButton: HTMLButtonElement;
  colorButtons: HTMLButtonElement[];
  colorPreviews: HTMLSpanElement[];
  fillColorButton: HTMLButtonElement;
  colorPopup: HTMLDivElement;
  colorPalette: HTMLDivElement;
  colorPaletteCursor: HTMLSpanElement;
  colorHueInput: HTMLInputElement;
  colorPreview: HTMLSpanElement;
  colorHexInput: HTMLInputElement;
  opacityInput: HTMLInputElement;
  opacityValue: HTMLSpanElement;
  colorPopupOpen: boolean;
  activeColorKind: 'text' | 'line' | 'fill';
  layerInput: HTMLInputElement;
  deleteButton: HTMLButtonElement;
  deleteArmed: boolean;
  colorHue: number;
  colorSaturation: number;
  colorValue: number;
  toolsDivider: HTMLSpanElement;
  pointButton: HTMLButtonElement;
  segmentButton: HTMLButtonElement;
  polygonButton: HTMLButtonElement;
  angleButton: HTMLButtonElement;
  geometrySubmenu: HTMLDivElement;
  segmentToolButton: HTMLButtonElement;
  lineToolButton: HTMLButtonElement;
  shapeSubmenu: HTMLDivElement;
  polygonToolButton: HTMLButtonElement;
  circleToolButton: HTMLButtonElement;
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
  geometrySubmenuOpen: boolean;
  shapeSubmenuOpen: boolean;
  sideMenuOpen: boolean;
  contextObject: any | null;
  activeTool: '' | 'point' | 'segment' | 'line' | 'polygon' | 'circle' | 'angle';
  selectedSegmentPoint: any | null;
  selectedPolygonPoints: any[];
  selectedAnglePoints: any[];
  selectedCircleCenter: any | null;
  circlePreview: any | null;
  circlePreviewPosition: { x: number; y: number } | null;
  restoring: boolean;
  onBoardViewportChange?: () => void;
  onBoardPointerDown?: (evt: PointerEvent) => void;
  onBoardPointerMove?: (evt: PointerEvent) => void;
  onBoardContextMenu?: (evt: MouseEvent) => void;
  onDocumentPointerDown?: (evt: PointerEvent) => void;
  resizeObserver?: ResizeObserver;
  axisAnimationRAF?: number;
  axisSyncRAF?: number;
  xAxisAnimationRAF?: number;
  xAxisSyncRAF?: number;
};

const DGS_TEXT = {
  de: {
    point: 'Punkt', line: 'Gerade', polygon: 'Vieleck', segment: 'Strecke', angle: 'Winkel', circle: 'Kreis',
    coordinates: 'Koordinaten', fixed: 'Fixieren', showName: 'Name anzeigen',
    showPoint: 'Punkt anzeigen', showLine: 'Gerade anzeigen', showPolygon: 'Vieleck anzeigen', showCircle: 'Kreis anzeigen', showAngleObject: 'Winkel anzeigen',
    showSegment: 'Strecke anzeigen', showEquation: 'Geradengleichung anzeigen',
    showDistance: 'Distanzwert anzeigen', showArea: 'Flächeninhalt anzeigen',
    showPerimeter: 'Umfang anzeigen', showAngle: 'Winkelwert anzeigen', textColor: 'Schriftfarbe', lineColor: 'Linienfarbe',
    fillColor: 'Inhaltsfarbe', opacity: 'Deckkraft', delete: 'Löschen',
    confirmDelete: 'Löschen bestätigen', setPoint: 'Punkt setzen', stopPoint: 'Punktmodus beenden',
    straightLine: 'Gerade', distance: 'Strecke', createAngle: 'Winkel markieren', shapes: 'Flächenwerkzeuge', layer: 'Ebene'
  },
  en: {
    point: 'Point', line: 'Straight Line', polygon: 'Polygon', segment: 'Distance', angle: 'Angle', circle: 'Circle',
    coordinates: 'Coordinates', fixed: 'Lock', showName: 'Show name',
    showPoint: 'Show point', showLine: 'Show straight line', showPolygon: 'Show polygon', showCircle: 'Show circle', showAngleObject: 'Show angle',
    showSegment: 'Show distance', showEquation: 'Show line equation',
    showDistance: 'Show distance value', showArea: 'Show area',
    showPerimeter: 'Show perimeter', showAngle: 'Show angle value', textColor: 'Text color', lineColor: 'Line color',
    fillColor: 'Fill color', opacity: 'Opacity', delete: 'Delete',
    confirmDelete: 'Confirm delete', setPoint: 'Place point', stopPoint: 'Exit point mode',
    straightLine: 'Straight Line', distance: 'Distance', createAngle: 'Mark angle', shapes: 'Shape tools', layer: 'Layer'
  }
} as const;

function dgsText(language: 'de' | 'en') { return DGS_TEXT[language]; }

const states: Record<string, DgsState> = {};
const dgsConstructionStates: Record<string, any> =
  ((window as any).__dgsConstructionStates = (window as any).__dgsConstructionStates || {});
let dgsPersistentIdCounter = 0;
const dgsHistoryApplying = new Set<string>();
const dgsPendingHistoryBefore: Record<string, any> = {};

function cloneDgsSnapshot(value: any): any {
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return { records: [] }; }
}
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
      border-radius: 7px;
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

    .lia-dgs-side-menu-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .lia-dgs-name-input {
      min-width: 0;
      width: 82px;
      height: 25px;
      box-sizing: border-box;
      border: 1px solid currentColor;
      border-radius: 5px;
      background: transparent;
      color: inherit;
      padding: 2px 5px;
      font: inherit;
      font-weight: 600;
    }

    .lia-dgs-name-input[aria-invalid="true"] {
      border-color: #d93232;
      box-shadow: 0 0 0 1px #d93232;
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

    .lia-dgs-context-option[hidden] {
      display: none;
    }

    .lia-dgs-color-section {
      margin-top: 8px;
      display: grid;
      gap: 2px;
    }

    .lia-dgs-color-button {
      width: 100%;
      min-height: 27px;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 2px 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .lia-dgs-color-button[hidden] {
      display: none;
    }

    .lia-dgs-color-button:hover .lia-dgs-color-preview,
    .lia-dgs-color-button:focus-visible .lia-dgs-color-preview {
      box-shadow: 0 0 0 2px var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-layer-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 58px;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      margin-top: 7px;
      font-size: 14px;
    }

    .lia-dgs-layer-input {
      width: 58px;
      height: 27px;
      box-sizing: border-box;
      border: 1px solid currentColor;
      border-radius: 5px;
      background: transparent;
      color: inherit;
      padding: 2px 4px;
      font: inherit;
      text-align: center;
    }

    .lia-dgs-color-popup {
      position: absolute;
      right: ${SIDE_MENU_WIDTH_PX + 10}px;
      top: 10px;
      z-index: 58;
      width: 190px;
      display: none;
      gap: 7px;
      padding: 9px;
      border: 2px solid var(--lia-dgs-theme-color, currentColor);
      border-radius: 8px;
      background: var(--lia-dgs-menu-bg, #fff);
      color: inherit;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
      box-sizing: border-box;
    }

    .lia-dgs-color-popup[data-open="1"] {
      display: grid;
    }

    .lia-dgs-opacity-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) 38px;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }

    .lia-dgs-opacity-input {
      min-width: 0;
      width: 100%;
      margin: 0;
      accent-color: var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-opacity-value {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .lia-dgs-delete-button {
      width: 100%;
      min-height: 34px;
      margin-top: 12px;
      padding: 6px 10px;
      border: 2px solid #d93232;
      border-radius: 6px;
      background: transparent;
      color: #d93232;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .lia-dgs-delete-button[data-confirm="1"] {
      background: #d93232;
      color: #fff;
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
      width: 22px;
      height: 20px;
      flex: 0 0 22px;
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
      left: 196px;
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
      border-radius: 7px;
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

    .lia-dgs-polygon-button {
      left: 126px;
    }

    .lia-dgs-angle-button {
      left: 162px;
    }

    .lia-dgs-angle-button svg {
      width: 25px;
      height: 25px;
    }

    .lia-dgs-polygon-fill {
      fill: rgba(255, 255, 255, 0.60) !important;
    }

    .lia-dgs-angle-fill {
      fill: rgba(255, 255, 255, 0.60) !important;
    }

    .lia-dgs-geometry-submenu {
      position: absolute;
      top: 44px;
      left: 82px;
      min-width: 178px;
      display: grid;
      gap: 3px;
      padding: 6px;
      border: 2px solid currentColor;
      border-radius: 8px;
      background: var(--lia-dgs-menu-bg, #fff);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-5px);
      transition:
        opacity 120ms ease,
        transform 120ms ease,
        visibility 0s linear 120ms;
      pointer-events: none;
    }

    .lia-dgs-geometry-submenu[data-open="1"] {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition-delay: 0s;
      pointer-events: auto;
    }

    .lia-dgs-shape-submenu {
      left: 118px;
    }

    .lia-dgs-geometry-tool {
      min-width: 0;
      min-height: 34px;
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      align-items: center;
      gap: 9px;
      padding: 3px 9px 3px 5px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
    }

    .lia-dgs-geometry-tool:hover,
    .lia-dgs-geometry-tool:focus-visible,
    .lia-dgs-geometry-tool.is-active {
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 22%, transparent);
      outline: none;
    }

    .lia-dgs-geometry-tool svg {
      width: 26px;
      height: 26px;
      display: block;
      overflow: visible;
    }

    .lia-dgs-geometry-tool path {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lia-dgs-geometry-tool .lia-dgs-cross {
      stroke: #ff00ff;
      stroke-width: 1.65;
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

    .lia-dgs-geometry-button circle,
    .lia-dgs-geometry-tool circle {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }

    .lia-dgs-polygon-vertex,
    .lia-dgs-angle-point {
      filter:
        drop-shadow(0 0 2px var(--lia-dgs-theme-color, #00a8b5))
        drop-shadow(0 0 4px var(--lia-dgs-theme-color, #00a8b5));
    }

    @media (prefers-reduced-motion: reduce) {
      .lia-dgs-top-menu,
      .lia-dgs-side-menu,
      .lia-dgs-geometry-submenu {
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
    if (type !== 'segment' && type !== 'line' && !segment.__liaDgsSegment && !segment.__liaDgsLine) return;

    [segment.__liaDgsSegmentName, segment.__liaDgsLineName, segment.name].forEach((value) => {
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
    '.lia-dgs-color-popup',
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
    point.__liaDgsLanguage = state.language;
    point.__liaDgsColor = '#ff00ff';
    point.__liaDgsShowName = true;
    point.__liaDgsShowObject = true;
    point.__liaDgsOpacity = 1;
    point.__liaPointVisual = { color: '#ff00ff', opacity: 1, hasExplicitColor: false };
    window.__points = window.__points || {};
    window.__pointStates = window.__pointStates || {};
    window.__points[state.boardId] = window.__points[state.boardId] || {};
    window.__pointStates[state.boardId] = window.__pointStates[state.boardId] || {};
    window.__points[state.boardId][name] = point;

    const savePosition = (recordHistory = true) => {
      try {
        const currentName = String(point.__liaDgsPointName || name);
        window.__pointStates[state.boardId][currentName] = {
          x: point.X(),
          y: point.Y(),
          fixed: getDgsObjectFixed(point)
        };
      } catch (e) {}
      refreshSideMenusForObject(point);
      persistDgsConstruction(state, recordHistory);
    };
    try { point.on('drag', () => savePosition(false)); } catch (e) {}
    try { point.on('up', () => savePosition(true)); } catch (e) {}
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

function setSelectedPolygonPoints(state: DgsState, points: any[]): void {
  state.selectedPolygonPoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-polygon-vertex'); } catch (e) {}
  });

  state.selectedPolygonPoints = Array.isArray(points) ? points.slice() : [];
  state.selectedPolygonPoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.add('lia-dgs-polygon-vertex'); } catch (e) {}
  });
}

function setSelectedAnglePoints(state: DgsState, points: any[]): void {
  state.selectedAnglePoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-angle-point'); } catch (e) {}
  });

  state.selectedAnglePoints = Array.isArray(points) ? points.slice() : [];
  state.selectedAnglePoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.add('lia-dgs-angle-point'); } catch (e) {}
  });
}

function styleDgsSegments(state: DgsState): void {
  const seen = new Set<any>();
  const style = (segment: any) => {
    if (!segment || typeof segment !== 'object' || seen.has(segment) || (!segment.__liaDgsSegment && !segment.__liaDgsLine)) return;
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
    segment.__liaDgsLanguage = state.language;
    segment.__liaDgsColor = '#ff00ff';
    segment.__liaDgsShowName = true;
    segment.__liaDgsShowObject = true;
    segment.__liaDgsOpacity = 1;
    segment.__liaDgsShowLength = false;
    refreshDgsObjectLabel(segment);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return segment;
  } catch (e) {
    return null;
  }
}

function createDgsLine(state: DgsState, point1: any, point2: any): any | null {
  if (!state.board || !point1 || !point2 || point1 === point2) return null;

  const name = getNextSegmentName(state);
  try {
    const line = state.board.create('line', [point1, point2], {
      name: '\\(' + name + '\\)',
      withLabel: true,
      fixed: true,
      straightFirst: true,
      straightLast: true,
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
    line.__liaDgsLine = true;
    line.__liaDgsLineName = name;
    line.__liaDgsLanguage = state.language;
    line.__liaDgsColor = '#ff00ff';
    line.__liaDgsShowName = true;
    line.__liaDgsShowObject = true;
    line.__liaDgsOpacity = 1;
    line.__liaDgsShowEquation = false;
    refreshDgsObjectLabel(line);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return line;
  } catch (e) {
    return null;
  }
}

function createDgsPolygon(state: DgsState, points: any[]): any | null {
  if (!state.board || !Array.isArray(points) || points.length < 3 || new Set(points).size !== points.length) {
    return null;
  }

  const name = points.map((point) => String(point.__liaDgsPointName || '')).join('');
  try {
    const polygon = state.board.create('polygon', points, {
      name: name ? '\\(' + name + '\\)' : '',
      withLabel: false,
      fixed: true,
      hasInnerPoints: true,
      fillColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      fillOpacity: 0.22,
      highlightFillOpacity: 0.32,
      borders: {
        fixed: true,
        strokeColor: '#ff00ff',
        highlightStrokeColor: '#ff00ff',
        strokeWidth: 3,
        highlightStrokeWidth: 4
      }
    });
    polygon.__liaDgsPolygon = true;
    polygon.__liaDgsPolygonName = name;
    polygon.__liaDgsLanguage = state.language;
    polygon.__liaDgsPolygonAutoName = true;
    polygon.__liaDgsColor = '#ff00ff';
    polygon.__liaDgsShowName = true;
    polygon.__liaDgsShowObject = true;
    polygon.__liaDgsOpacity = 0.22;
    polygon.__liaDgsShowArea = false;
    polygon.__liaDgsShowPerimeter = false;
    refreshDgsPolygonMeasurementLabel(polygon);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return polygon;
  } catch (e) {
    return null;
  }
}

function getNextCircleName(state: DgsState): string {
  const used = new Set<string>();
  getDgsBoardObjects(state.board).forEach((object) => {
    if (object && object.__liaDgsCircle) used.add(String(object.__liaDgsCircleName || ''));
  });
  for (let index = 0; ; index += 1) {
    const name = 'k' + (index ? "'".repeat(index) : '');
    if (!used.has(name)) return name;
  }
}

function getDgsCircleLabelPosition(circle: any): { x: number; y: number } {
  const center = circle && circle.__liaDgsCircleCenter;
  const radiusPoint = circle && circle.__liaDgsCircleRadiusPoint;
  if (!center || !radiusPoint) return { x: 0, y: 0 };
  try {
    const centerX = Number(center.X());
    const centerY = Number(center.Y());
    const dx = Number(radiusPoint.X()) - centerX;
    const dy = Number(radiusPoint.Y()) - centerY;
    const radius = Math.hypot(dx, dy);
    if (radius <= 1e-12) return { x: centerX, y: centerY };
    const inwardPosition = 0.68;
    return {
      x: centerX - dx * inwardPosition,
      y: centerY - dy * inwardPosition
    };
  } catch (e) { return { x: 0, y: 0 }; }
}

function createDgsCircle(state: DgsState, center: any, radiusPoint: any): any | null {
  if (!state.board || !center || !radiusPoint || center === radiusPoint) return null;
  const name = getNextCircleName(state);
  try {
    const circle = state.board.create('circle', [center, radiusPoint], {
      name: '\\(' + name + '\\)',
      withLabel: false,
      fixed: false,
      hasInnerPoints: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      fillColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      fillOpacity: 0.2,
      highlightFillOpacity: 0.3,
    });
    circle.__liaDgsCircle = true;
    circle.__liaDgsCircleName = name;
    circle.__liaDgsCircleCenter = center;
    circle.__liaDgsCircleRadiusPoint = radiusPoint;
    circle.__liaDgsLanguage = state.language;
    circle.__liaDgsColor = '#ff00ff';
    circle.__liaDgsShowName = true;
    circle.__liaDgsShowObject = true;
    circle.__liaDgsOpacity = 0.2;
    circle.__liaDgsShowArea = false;
    circle.__liaDgsShowPerimeter = false;
    const label = state.board.create('text', [
      function() { return getDgsCircleLabelPosition(circle).x; },
      function() { return getDgsCircleLabelPosition(circle).y; },
      function() { return dgsObjectLabelText(circle); }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      fontSize: 15
    });
    circle.label = label;
    circle.__liaDgsCircleLabel = label;
    const saveCircle = (recordHistory = true) => {
      refreshDgsObjectLabel(circle);
      persistDgsConstruction(state, recordHistory);
    };
    try { circle.on('drag', () => saveCircle(false)); } catch (e) {}
    try { circle.on('up', () => saveCircle(true)); } catch (e) {}
    refreshDgsObjectLabel(circle);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return circle;
  } catch (e) { return null; }
}

function clearDgsCirclePreview(state: DgsState): void {
  if (state.selectedCircleCenter) {
    const node = state.selectedCircleCenter.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-angle-point'); } catch (e) {}
  }
  if (state.circlePreview) {
    try { state.board.removeObject(state.circlePreview); } catch (e) {}
  }
  state.selectedCircleCenter = null;
  state.circlePreview = null;
  state.circlePreviewPosition = null;
}

function startDgsCirclePreview(state: DgsState, center: any): void {
  clearDgsCirclePreview(state);
  state.selectedCircleCenter = center;
  state.circlePreviewPosition = { x: Number(center.X()), y: Number(center.Y()) };
  const node = center && center.rendNode;
  try { if (node && node.classList) node.classList.add('lia-dgs-angle-point'); } catch (e) {}
  try {
    state.circlePreview = state.board.create('circle', [center, function() {
      const position = state.circlePreviewPosition;
      if (!position) return 0;
      return Math.hypot(position.x - Number(center.X()), position.y - Number(center.Y()));
    }], {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      strokeColor: '#ff00ff',
      strokeOpacity: 0.75,
      strokeWidth: 2,
      dash: 2,
      fillOpacity: 0,
      highlightFillOpacity: 0
    });
  } catch (e) { state.circlePreview = null; }
}

function getDgsAngleRadians(angle: any): number {
  const points = angle && Array.isArray(angle.__liaDgsAnglePoints) ? angle.__liaDgsAnglePoints : [];
  if (points.length !== 3) return NaN;
  try {
    const ux = Number(points[0].X()) - Number(points[1].X());
    const uy = Number(points[0].Y()) - Number(points[1].Y());
    const vx = Number(points[2].X()) - Number(points[1].X());
    const vy = Number(points[2].Y()) - Number(points[1].Y());
    if (Math.hypot(ux, uy) <= 1e-12 || Math.hypot(vx, vy) <= 1e-12) return NaN;
    let radians = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (radians < 0) radians += Math.PI * 2;
    return radians;
  } catch (e) { return NaN; }
}

function getDgsAngleRadius(points: any[]): number {
  try {
    const firstArm = Math.hypot(points[0].X() - points[1].X(), points[0].Y() - points[1].Y());
    const secondArm = Math.hypot(points[2].X() - points[1].X(), points[2].Y() - points[1].Y());
    return Math.max(0.05, Math.min(0.8, Math.min(firstArm, secondArm) * 0.35));
  } catch (e) { return 0.6; }
}

function getDgsAngleLabelPosition(angle: any): { x: number; y: number } {
  const points = angle && angle.__liaDgsAnglePoints;
  if (!Array.isArray(points) || points.length !== 3) return { x: 0, y: 0 };
  try {
    const vertexX = Number(points[1].X());
    const vertexY = Number(points[1].Y());
    const startX = Number(points[0].X()) - vertexX;
    const startY = Number(points[0].Y()) - vertexY;
    const startLength = Math.hypot(startX, startY);
    const radians = getDgsAngleRadians(angle);
    if (startLength <= 1e-12 || !Number.isFinite(radians)) return { x: vertexX, y: vertexY };

    const direction = Math.atan2(startY, startX) + radians / 2;
    const dx = Math.cos(direction);
    const dy = Math.sin(direction);
    const board = angle.board;
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const pixelsPerUnit = Math.max(1e-9, Math.hypot(dx * unitX, dy * unitY));
    const distance = getDgsAngleRadius(points) * 1.35 + 10 / pixelsPerUnit;
    return { x: vertexX + dx * distance, y: vertexY + dy * distance };
  } catch (e) { return { x: 0, y: 0 }; }
}

function createDgsAngle(state: DgsState, points: any[]): any | null {
  if (!state.board || !Array.isArray(points) || points.length !== 3 || new Set(points).size !== 3) return null;
  const pointNames = points.map((point) => String(point.__liaDgsPointName || ''));
  const name = '\\angle ' + pointNames.join('');
  try {
    const angle = state.board.create('angle', points, {
      name: '\\(' + name + '\\)',
      withLabel: false,
      fixed: true,
      highlight: false,
      type: 'sector',
      orientation: 'counterclockwise',
      selection: 'auto',
      radius: function() { return getDgsAngleRadius(points); },
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 2.5,
      highlightStrokeWidth: 2.5,
      fillColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      fillOpacity: 0.22,
      highlightFillOpacity: 0.22,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 18,
        parse: false,
        useMathJax: true
      }
    });
    angle.__liaDgsAngle = true;
    angle.__liaDgsAngleName = name;
    angle.__liaDgsAngleAutoName = true;
    angle.__liaDgsAnglePoints = points.slice();
    angle.__liaDgsLanguage = state.language;
    angle.__liaDgsColor = '#ff00ff';
    angle.__liaDgsShowName = true;
    angle.__liaDgsShowObject = true;
    angle.__liaDgsOpacity = 0.22;
    angle.__liaDgsShowAngle = false;
    const label = state.board.create('text', [
      function() { return getDgsAngleLabelPosition(angle).x; },
      function() { return getDgsAngleLabelPosition(angle).y; },
      function() { return dgsObjectLabelText(angle); }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      fontSize: 18
    });
    angle.label = label;
    angle.__liaDgsAngleLabel = label;
    refreshDgsObjectLabel(angle);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return angle;
  } catch (e) { return null; }
}

function ensureDgsPersistentId(object: any, prefix: string): string {
  if (!object.__liaDgsPersistentId) {
    dgsPersistentIdCounter += 1;
    object.__liaDgsPersistentId = prefix + '-' + Date.now().toString(36) + '-' + dgsPersistentIdCounter.toString(36);
  }
  return String(object.__liaDgsPersistentId);
}

function getDgsBoardObjects(board: any): any[] {
  const objects: any[] = [];
  const seen = new Set<any>();
  const add = (object: any) => {
    if (!object || typeof object !== 'object' || seen.has(object)) return;
    seen.add(object);
    objects.push(object);
  };
  if (board && Array.isArray(board.objectsList)) board.objectsList.forEach(add);
  if (board && board.objects && typeof board.objects === 'object') {
    Object.keys(board.objects).forEach((key) => add(board.objects[key]));
  }
  return objects;
}

function dgsPointReference(point: any): any {
  return {
    id: point && point.__liaDgsPointName ? ensureDgsPersistentId(point, 'point') : '',
    name: String((point && (point.__liaDgsPointName || point.name)) || '')
  };
}

function persistDgsConstruction(state: DgsState, recordHistory = true): void {
  if (!state || state.restoring || !state.board) return;
  const records: any[] = [];
  getDgsBoardObjects(state.board).forEach((object) => {
    let type = '';
    if (isDgsPoint(object)) type = 'point';
    else if (object.__liaDgsSegment) type = 'segment';
    else if (isDgsLine(object)) type = 'line';
    else if (isDgsPolygon(object)) type = 'polygon';
    else if (isDgsCircle(object)) type = 'circle';
    else if (isDgsAngle(object)) type = 'angle';
    if (!type) return;

    const record: any = {
      id: ensureDgsPersistentId(object, type),
      type,
      name: getDgsObjectName(object),
      language: object.__liaDgsLanguage || state.language,
      fixed: getDgsObjectFixed(object),
      layer: getDgsObjectLayer(object),
      showName: object.__liaDgsShowName !== false,
      showObject: object.__liaDgsShowObject !== false,
      opacity: getDgsObjectOpacity(object),
      textColor: getDgsObjectColor(object, 'text'),
      lineColor: getDgsObjectColor(object, 'line'),
      fillColor: getDgsObjectColor(object, 'fill'),
      showLength: !!object.__liaDgsShowLength,
      showEquation: !!object.__liaDgsShowEquation,
      showArea: !!object.__liaDgsShowArea,
      showPerimeter: !!object.__liaDgsShowPerimeter,
      showAngle: !!object.__liaDgsShowAngle,
      autoName: object.__liaDgsPolygonAutoName !== false && object.__liaDgsAngleAutoName !== false
    };
    if (type === 'point') {
      try { record.x = Number(object.X()); record.y = Number(object.Y()); } catch (e) {}
    } else if (type === 'segment' || type === 'line') {
      record.points = [dgsPointReference(object.point1), dgsPointReference(object.point2)];
    } else if (type === 'polygon') {
      record.points = (object.vertices || []).map(dgsPointReference);
    } else if (type === 'circle') {
      record.points = [dgsPointReference(object.__liaDgsCircleCenter), dgsPointReference(object.__liaDgsCircleRadiusPoint)];
    } else if (type === 'angle') {
      record.points = (object.__liaDgsAnglePoints || []).map(dgsPointReference);
    }
    records.push(record);
  });
  const next = { boardId: state.boardId, language: state.language, records };
  const previous = dgsConstructionStates[state.boardId] || {
    boardId: state.boardId,
    language: state.language,
    records: []
  };
  const changed = JSON.stringify(previous) !== JSON.stringify(next);
  dgsConstructionStates[state.boardId] = next;
  if (changed && !recordHistory && !dgsPendingHistoryBefore[state.boardId]) {
    dgsPendingHistoryBefore[state.boardId] = cloneDgsSnapshot(previous);
  }
  const historyBefore = dgsPendingHistoryBefore[state.boardId] || previous;
  if (recordHistory) delete dgsPendingHistoryBefore[state.boardId];
  if (recordHistory && JSON.stringify(historyBefore) !== JSON.stringify(next) && !dgsHistoryApplying.has(state.boardId)) {
    try {
      if (window.__recordDgsHistory) {
        window.__recordDgsHistory(state.boardId, cloneDgsSnapshot(historyBefore), cloneDgsSnapshot(next));
      }
    } catch (e) {}
  }
}

function findDgsPointForRestore(state: DgsState, reference: any, byId: Map<string, any>): any | null {
  if (reference && reference.id && byId.has(reference.id)) return byId.get(reference.id);
  const name = String(reference && reference.name || '');
  const registered = window.__points && window.__points[state.boardId] && window.__points[state.boardId][name];
  try { if (registered && registered.board === state.board) return registered; } catch (e) {}
  return getDgsBoardObjects(state.board).find((point) => {
    if (!point || (String(point.elType || '').toLowerCase() !== 'point' && String(point.elType || '').toLowerCase() !== 'glider')) return false;
    return String(point.__liaDgsPointName || point.name || '') === name;
  }) || null;
}

function applyRestoredDgsProperties(state: DgsState, object: any, record: any): void {
  object.__liaDgsPersistentId = record.id;
  object.__liaDgsLanguage = record.language || state.language;
  if (record.name) setDgsObjectName(state, object, record.name);
  setDgsObjectFixed(object, !!record.fixed);
  setDgsObjectLayer(object, Number.isFinite(record.layer) ? record.layer : getDgsObjectLayer(object));
  object.__liaDgsShowName = record.showName !== false;
  object.__liaDgsShowObject = record.showObject !== false;
  object.__liaDgsShowLength = !!record.showLength;
  object.__liaDgsShowEquation = !!record.showEquation;
  object.__liaDgsShowArea = !!record.showArea;
  object.__liaDgsShowPerimeter = !!record.showPerimeter;
  object.__liaDgsShowAngle = !!record.showAngle;
  if (isDgsPolygon(object)) object.__liaDgsPolygonAutoName = !!record.autoName;
  if (isDgsAngle(object)) object.__liaDgsAngleAutoName = !!record.autoName;
  setDgsObjectColor(object, 'text', record.textColor || '#ff00ff');
  setDgsObjectColor(object, 'line', record.lineColor || '#ff00ff');
  setDgsObjectColor(object, 'fill', record.fillColor || '#ff00ff');
  setDgsObjectOpacity(object, Number.isFinite(record.opacity) ? record.opacity : 1);
  setDgsObjectVisible(object, record.showObject !== false);
  setDgsObjectNameVisible(object, record.showName !== false);
  if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
  else refreshDgsObjectLabel(object);
}

function restoreDgsConstruction(state: DgsState): void {
  const saved = dgsConstructionStates[state.boardId];
  if (!saved || saved.boardId !== state.boardId || !Array.isArray(saved.records)) return;
  const registered = window.__points && window.__points[state.boardId];
  if (registered && typeof registered === 'object') {
    Object.keys(registered).forEach((name) => {
      try { if (!registered[name] || registered[name].board !== state.board) delete registered[name]; } catch (e) {}
    });
  }
  const existingById = new Map<string, any>();
  getDgsBoardObjects(state.board).forEach((object) => {
    if (object && object.__liaDgsPersistentId) existingById.set(String(object.__liaDgsPersistentId), object);
  });

  state.restoring = true;
  try {
    saved.records.filter((record: any) => record.type === 'point').forEach((record: any) => {
      let point = existingById.get(record.id);
      if (!point) point = createDgsPoint(state, Number(record.x), Number(record.y));
      if (!point) return;
      applyRestoredDgsProperties(state, point, record);
      existingById.set(record.id, point);
    });

    saved.records.filter((record: any) => record.type !== 'point').forEach((record: any) => {
      if (existingById.has(record.id)) return;
      const points = (record.points || []).map((reference: any) => findDgsPointForRestore(state, reference, existingById));
      if (!points.length || points.some((point: any) => !point)) return;
      let object: any = null;
      if (record.type === 'segment') object = createDgsSegment(state, points[0], points[1]);
      else if (record.type === 'line') object = createDgsLine(state, points[0], points[1]);
      else if (record.type === 'polygon') object = createDgsPolygon(state, points);
      else if (record.type === 'circle') object = createDgsCircle(state, points[0], points[1]);
      else if (record.type === 'angle') object = createDgsAngle(state, points);
      if (!object) return;
      applyRestoredDgsProperties(state, object, record);
      existingById.set(record.id, object);
    });
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  } finally {
    state.restoring = false;
  }
}

function clearDgsConstructionFromBoard(state: DgsState): void {
  clearDgsCirclePreview(state);
  setSelectedSegmentPoint(state, null);
  setSelectedPolygonPoints(state, []);
  setSelectedAnglePoints(state, []);
  if (state.sideMenuOpen) setSideMenuOpen(state, false);

  const objects = getDgsBoardObjects(state.board);
  objects.forEach((object) => {
    if (object && object.__liaDgsPolygon && object.__liaDgsMeasurementLabel) {
      try { state.board.removeObject(object.__liaDgsMeasurementLabel); } catch (e) {}
    }
    if (object && object.__liaDgsAngle && object.__liaDgsAngleLabel) {
      try { state.board.removeObject(object.__liaDgsAngleLabel); } catch (e) {}
    }
    if (object && object.__liaDgsCircle && object.__liaDgsCircleLabel) {
      try { state.board.removeObject(object.__liaDgsCircleLabel); } catch (e) {}
    }
  });
  objects.filter((object) => object && !isDgsPoint(object) && (
    object.__liaDgsSegment || object.__liaDgsLine || object.__liaDgsPolygon ||
    object.__liaDgsCircle || object.__liaDgsAngle
  )).forEach((object) => {
    try { state.board.removeObject(object); } catch (e) {}
  });
  objects.filter(isDgsPoint).forEach((point) => {
    const name = String(point.__liaDgsPointName || '');
    try {
      if (window.__points && window.__points[state.boardId] && window.__points[state.boardId][name] === point) {
        delete window.__points[state.boardId][name];
      }
      if (window.__pointStates && window.__pointStates[state.boardId]) delete window.__pointStates[state.boardId][name];
    } catch (e) {}
    try { state.board.removeObject(point); } catch (e) {}
  });
}

window.__applyDgsHistory = function(boardId: string, snapshot: any): void {
  const state = Object.keys(states).map((uid) => states[uid]).find((candidate) =>
    !!candidate && candidate.boardId === boardId && candidate.board === (window.__boards && window.__boards[boardId])
  );
  if (!state) return;
  dgsHistoryApplying.add(boardId);
  delete dgsPendingHistoryBefore[boardId];
  try {
    clearDgsConstructionFromBoard(state);
    dgsConstructionStates[boardId] = cloneDgsSnapshot(snapshot || {
      boardId,
      language: state.language,
      records: []
    });
    restoreDgsConstruction(state);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  } finally {
    dgsHistoryApplying.delete(boardId);
  }
};

function getDgsPolygonCoordinates(polygon: any): Array<{ x: number; y: number }> {
  if (!polygon || !Array.isArray(polygon.vertices)) return [];
  const coordinates: Array<{ x: number; y: number }> = [];
  for (const point of polygon.vertices) {
    try {
      const x = Number(point.X());
      const y = Number(point.Y());
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      coordinates.push({ x, y });
    } catch (e) { return []; }
  }
  return coordinates;
}

function getDgsPolygonArea(coordinates: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next = coordinates[(index + 1) % coordinates.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function getDgsPolygonPerimeter(coordinates: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next = coordinates[(index + 1) % coordinates.length];
    sum += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return sum;
}

function getDgsPolygonCenter(polygon: any): { x: number; y: number } {
  const coordinates = getDgsPolygonCoordinates(polygon);
  if (!coordinates.length) return { x: 0, y: 0 };
  return coordinates.reduce(
    (sum, point) => ({ x: sum.x + point.x / coordinates.length, y: sum.y + point.y / coordinates.length }),
    { x: 0, y: 0 }
  );
}

function getDgsPolygonMeasurementText(polygon: any): string {
  const coordinates = getDgsPolygonCoordinates(polygon);
  if (coordinates.length < 3) return '';
  const language = getDgsGeometryLanguage(null, polygon.__liaDgsLanguage);
  const lines: string[] = [];
  const name = getDgsObjectName(polygon);
  if (polygon.__liaDgsShowName !== false && name) lines.push('\\mathrm{' + name + '}');
  if (polygon.__liaDgsShowArea) {
    const area = getDgsPolygonArea(coordinates);
    lines.push('A ' + dgsMeasurementRelation(area) + ' ' + formatDgsMeasurement(area, language) +
      '\\,\\mathrm{' + (language === 'de' ? 'FE' : 'AU') + '}');
  }
  if (polygon.__liaDgsShowPerimeter) {
    const perimeter = getDgsPolygonPerimeter(coordinates);
    lines.push('u ' + dgsMeasurementRelation(perimeter) + ' ' + formatDgsMeasurement(perimeter, language) +
      '\\,\\mathrm{' + (language === 'de' ? 'LE' : 'LU') + '}');
  }
  if (!lines.length) return '';
  if (lines.length === 1) return '\\(' + lines[0] + '\\)';
  return '\\(\\begin{gathered}' + lines.join('\\\\[2pt]') + '\\end{gathered}\\)';
}

function refreshDgsPolygonMeasurementLabel(polygon: any): void {
  if (!isDgsPolygon(polygon) || !polygon.board) return;
  const requested = polygon.__liaDgsShowName !== false ||
    !!(polygon.__liaDgsShowArea || polygon.__liaDgsShowPerimeter);
  const visible = polygon.__liaDgsShowObject !== false && requested;
  let label = polygon.__liaDgsMeasurementLabel;

  if (!label && requested) {
    try {
      label = polygon.board.create('text', [
        function() { return getDgsPolygonCenter(polygon).x; },
        function() { return getDgsPolygonCenter(polygon).y; },
        function() { return getDgsPolygonMeasurementText(polygon); }
      ], {
        fixed: true,
        highlight: false,
        parse: false,
        useMathJax: true,
        display: 'html',
        anchorX: 'middle',
        anchorY: 'middle',
        strokeColor: getDgsObjectColor(polygon, 'text'),
        fillColor: getDgsObjectColor(polygon, 'text'),
        fontSize: 15
      });
      polygon.__liaDgsMeasurementLabel = label;
    } catch (e) { label = null; }
  }

  if (label) {
    try { label.setAttribute({ visible }); } catch (e) {}
    try { if (visible && typeof label.showElement === 'function') label.showElement(); } catch (e) {}
    try { if (!visible && typeof label.hideElement === 'function') label.hideElement(); } catch (e) {}
  }
  try { if (typeof polygon.board.update === 'function') polygon.board.update(); } catch (e) {}
}

function dgsAngleContainsPointer(state: DgsState, angle: any, localX: number, localY: number): boolean {
  const points = angle && angle.__liaDgsAnglePoints;
  const board = state.board;
  if (!Array.isArray(points) || points.length !== 3 || !board || !board.origin) return false;
  try {
    const unitX = Number(board.unitX);
    const unitY = Number(board.unitY);
    if (!Number.isFinite(unitX) || !Number.isFinite(unitY) || Math.abs(unitX) < 1e-12 || Math.abs(unitY) < 1e-12) return false;
    const x = (localX - Number(board.origin.scrCoords[1])) / unitX;
    const y = (Number(board.origin.scrCoords[2]) - localY) / unitY;
    const vertexX = Number(points[1].X());
    const vertexY = Number(points[1].Y());
    const startX = Number(points[0].X()) - vertexX;
    const startY = Number(points[0].Y()) - vertexY;
    const targetX = x - vertexX;
    const targetY = y - vertexY;
    const targetDistance = Math.hypot(targetX, targetY);
    const tolerance = 10 / Math.max(1e-9, Math.min(Math.abs(unitX), Math.abs(unitY)));
    if (targetDistance > getDgsAngleRadius(points) + tolerance) return false;
    if (targetDistance <= tolerance) return true;

    let targetAngle = Math.atan2(startX * targetY - startY * targetX, startX * targetX + startY * targetY);
    if (targetAngle < 0) targetAngle += Math.PI * 2;
    const totalAngle = getDgsAngleRadians(angle);
    return Number.isFinite(totalAngle) && targetAngle <= totalAngle + 1e-8;
  } catch (e) { return false; }
}

function dgsCircleContainsPointer(state: DgsState, circle: any, localX: number, localY: number): boolean {
  const board = state.board;
  const center = circle && circle.__liaDgsCircleCenter;
  const radiusPoint = circle && circle.__liaDgsCircleRadiusPoint;
  if (!board || !board.origin || !center || !radiusPoint) return false;
  try {
    const unitX = Number(board.unitX);
    const unitY = Number(board.unitY);
    if (!Number.isFinite(unitX) || !Number.isFinite(unitY) || Math.abs(unitX) < 1e-12 || Math.abs(unitY) < 1e-12) return false;
    const x = (localX - Number(board.origin.scrCoords[1])) / unitX;
    const y = (Number(board.origin.scrCoords[2]) - localY) / unitY;
    const centerX = Number(center.X());
    const centerY = Number(center.Y());
    const radius = Math.hypot(Number(radiusPoint.X()) - centerX, Number(radiusPoint.Y()) - centerY);
    return Math.hypot(x - centerX, y - centerY) <= radius;
  } catch (e) { return false; }
}

function findDgsContextObject(state: DgsState, evt: MouseEvent): any | null {
  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  let point: any | null = null;
  let pointLayer = -1;
  let pointDistance = Infinity;
  getSelectableBoardPoints(state).forEach((candidate) => {
    if (!candidate.__liaDgsPointName) return;
    try {
      const screenX = Number(state.board.origin.scrCoords[1]) + Number(candidate.X()) * Number(state.board.unitX);
      const screenY = Number(state.board.origin.scrCoords[2]) - Number(candidate.Y()) * Number(state.board.unitY);
      const distance = Math.hypot(localX - screenX, localY - screenY);
      const layer = getDgsObjectLayer(candidate);
      if (distance <= 18 && (layer > pointLayer || (layer === pointLayer && distance < pointDistance))) {
        point = candidate;
        pointLayer = layer;
        pointDistance = distance;
      }
    } catch (e) {}
  });
  const candidates: any[] = [];
  const seen = new Set<any>();
  const add = (segment: any) => {
    if (!segment || typeof segment !== 'object' || seen.has(segment) ||
        (!segment.__liaDgsSegment && !segment.__liaDgsLine && !segment.__liaDgsPolygon && !segment.__liaDgsCircle && !segment.__liaDgsAngle)) return;
    seen.add(segment);
    candidates.push(segment);
  };
  if (state.board && Array.isArray(state.board.objectsList)) state.board.objectsList.forEach(add);
  if (state.board && state.board.objects && typeof state.board.objects === 'object') {
    Object.keys(state.board.objects).forEach((key) => add(state.board.objects[key]));
  }

  let nearest: any | null = point;
  let nearestDistance = point ? 0 : 10;
  let nearestLayer = point ? pointLayer : -1;
  candidates.forEach((segment) => {
    const layer = getDgsObjectLayer(segment);
    if (isDgsCircle(segment) && dgsCircleContainsPointer(state, segment, localX, localY)) {
      if (layer > nearestLayer) {
        nearest = segment;
        nearestDistance = 0;
        nearestLayer = layer;
      }
      return;
    }
    if (isDgsAngle(segment) && dgsAngleContainsPointer(state, segment, localX, localY)) {
      if (layer > nearestLayer) {
        nearest = segment;
        nearestDistance = 0;
        nearestLayer = layer;
      }
      return;
    }
    try {
      if (typeof segment.hasPoint === 'function' && segment.hasPoint(localX, localY)) {
        if (layer > nearestLayer) {
          nearest = segment;
          nearestDistance = 0;
          nearestLayer = layer;
        }
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
    const rawRatio = lengthSq > 1e-12
      ? ((localX - x1) * dx + (localY - y1) * dy) / lengthSq
      : 0;
    const ratio = segment.__liaDgsLine ? rawRatio : Math.max(0, Math.min(1, rawRatio));
    const px = x1 + ratio * dx;
    const py = y1 + ratio * dy;
    const distance = Math.hypot(localX - px, localY - py);
    if (distance <= 10 && (layer > nearestLayer || (layer === nearestLayer && distance < nearestDistance))) {
      nearest = segment;
      nearestDistance = distance;
      nearestLayer = layer;
    }
  });
  return nearest;
}

function isDgsPoint(object: any): boolean {
  return !!object && !!object.__liaDgsPointName;
}

function isDgsLine(object: any): boolean {
  return !!object && !!object.__liaDgsLine;
}

function isDgsPolygon(object: any): boolean {
  return !!object && !!object.__liaDgsPolygon;
}

function isDgsAngle(object: any): boolean {
  return !!object && !!object.__liaDgsAngle;
}

function isDgsCircle(object: any): boolean {
  return !!object && !!object.__liaDgsCircle;
}

function getDgsObjectName(object: any): string {
  return String(
    (isDgsPoint(object)
      ? object.__liaDgsPointName
      : (isDgsLine(object)
        ? object.__liaDgsLineName
        : (isDgsPolygon(object)
          ? object.__liaDgsPolygonName
          : (isDgsCircle(object)
            ? object.__liaDgsCircleName
            : (isDgsAngle(object) ? object.__liaDgsAngleName : object && object.__liaDgsSegmentName))))) || ''
  );
}

function setDgsObjectName(state: DgsState, object: any, value: string): boolean {
  const name = String(value || '').trim();
  if (!object || !name) return false;
  const oldName = getDgsObjectName(object);
  if (name === oldName) return true;

  if (isDgsPoint(object)) {
    const points = window.__points && window.__points[state.boardId];
    if (points && points[name] && points[name] !== object) return false;

    try {
      if (points) {
        if (points[oldName] === object) delete points[oldName];
        points[name] = object;
      }
      const pointStates = window.__pointStates && window.__pointStates[state.boardId];
      if (pointStates) {
        const savedState = pointStates[oldName];
        if (savedState) delete pointStates[oldName];
        pointStates[name] = savedState || {
          x: Number(object.X()),
          y: Number(object.Y()),
          fixed: getDgsObjectFixed(object)
        };
      }
    } catch (e) {}
    object.__liaDgsPointName = name;

    const seen = new Set<any>();
    const updatePolygonName = (candidate: any) => {
      if (!isDgsPolygon(candidate) || seen.has(candidate) || !candidate.__liaDgsPolygonAutoName ||
          !Array.isArray(candidate.vertices) || !candidate.vertices.includes(object)) return;
      seen.add(candidate);
      candidate.__liaDgsPolygonName = candidate.vertices
        .map((point: any) => String(point.__liaDgsPointName || ''))
        .join('');
      refreshDgsPolygonMeasurementLabel(candidate);
    };
    if (state.board && Array.isArray(state.board.objectsList)) state.board.objectsList.forEach(updatePolygonName);
    if (state.board && state.board.objects && typeof state.board.objects === 'object') {
      Object.keys(state.board.objects).forEach((key) => updatePolygonName(state.board.objects[key]));
    }
    const updateAngleName = (candidate: any) => {
      if (!isDgsAngle(candidate) || !candidate.__liaDgsAngleAutoName ||
          !Array.isArray(candidate.__liaDgsAnglePoints) || !candidate.__liaDgsAnglePoints.includes(object)) return;
      candidate.__liaDgsAngleName = '\\angle ' + candidate.__liaDgsAnglePoints
        .map((point: any) => String(point.__liaDgsPointName || ''))
        .join('');
      refreshDgsObjectLabel(candidate);
    };
    if (state.board && Array.isArray(state.board.objectsList)) state.board.objectsList.forEach(updateAngleName);
    if (state.board && state.board.objects && typeof state.board.objects === 'object') {
      Object.keys(state.board.objects).forEach((key) => updateAngleName(state.board.objects[key]));
    }
    try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
    try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
  } else if (isDgsLine(object)) {
    object.__liaDgsLineName = name;
  } else if (isDgsPolygon(object)) {
    object.__liaDgsPolygonName = name;
    object.__liaDgsPolygonAutoName = false;
  } else if (isDgsAngle(object)) {
    object.__liaDgsAngleName = name;
    object.__liaDgsAngleAutoName = false;
  } else if (isDgsCircle(object)) {
    object.__liaDgsCircleName = name;
  } else if (object.__liaDgsSegment) {
    object.__liaDgsSegmentName = name;
  } else {
    return false;
  }

  try { if (typeof object.setAttribute === 'function') object.setAttribute({ name: '\\(' + name + '\\)' }); } catch (e) {}
  if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
  else refreshDgsObjectLabel(object);
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  persistDgsConstruction(state);
  return true;
}

function formatDgsMeasurement(value: number, language: 'de' | 'en' = 'en'): string {
  if (!Number.isFinite(value)) return '?';
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round(value * 1000) / 1000;
  let text = String(rounded);
  if (language === 'de') text = text.replace('.', '{,}');
  return text;
}

function dgsMeasurementRelation(value: number): string {
  if (!Number.isFinite(value)) return '=';
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  const unchanged = Math.abs(value - rounded) <= Math.max(1, Math.abs(value)) * 1e-10;
  return unchanged ? '=' : '\\approx';
}

function getDgsLineEquation(line: any): string {
  const language = getDgsGeometryLanguage(null, line && line.__liaDgsLanguage);
  const point1 = line && line.point1;
  const point2 = line && line.point2;
  if (!point1 || !point2) return '';

  let x1 = NaN;
  let y1 = NaN;
  let x2 = NaN;
  let y2 = NaN;
  try {
    x1 = Number(point1.X());
    y1 = Number(point1.Y());
    x2 = Number(point2.X());
    y2 = Number(point2.Y());
  } catch (e) {}
  if (![x1, y1, x2, y2].every(Number.isFinite)) return '';

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 1e-10) return 'x = ' + formatDgsMeasurement(x1, language);

  const slope = dy / dx;
  const intercept = y1 - slope * x1;
  if (Math.abs(slope) < 1e-10) return 'y = ' + formatDgsMeasurement(intercept, language);

  let slopeTerm = '';
  if (Math.abs(slope - 1) < 1e-10) slopeTerm = 'x';
  else if (Math.abs(slope + 1) < 1e-10) slopeTerm = '-x';
  else slopeTerm = formatDgsMeasurement(slope, language) + 'x';

  if (Math.abs(intercept) < 1e-10) return 'y = ' + slopeTerm;
  const sign = intercept < 0 ? ' - ' : ' + ';
  return 'y = ' + slopeTerm + sign + formatDgsMeasurement(Math.abs(intercept), language);
}

function dgsObjectLabelText(object: any): string {
  const name = getDgsObjectName(object);
  const showName = object && object.__liaDgsShowName !== false;

  if (isDgsCircle(object)) {
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    let radius = NaN;
    try {
      radius = Math.hypot(
        Number(object.__liaDgsCircleRadiusPoint.X()) - Number(object.__liaDgsCircleCenter.X()),
        Number(object.__liaDgsCircleRadiusPoint.Y()) - Number(object.__liaDgsCircleCenter.Y())
      );
    } catch (e) {}
    const lines: string[] = [];
    if (showName && name) lines.push('\\mathrm{' + name + '}');
    if (object.__liaDgsShowArea) {
      const area = Math.PI * radius * radius;
      lines.push('A ' + dgsMeasurementRelation(area) + ' ' + formatDgsMeasurement(area, language) +
        '\\,\\mathrm{' + (language === 'de' ? 'FE' : 'AU') + '}');
    }
    if (object.__liaDgsShowPerimeter) {
      const perimeter = 2 * Math.PI * radius;
      lines.push('u ' + dgsMeasurementRelation(perimeter) + ' ' + formatDgsMeasurement(perimeter, language) +
        '\\,\\mathrm{' + (language === 'de' ? 'LE' : 'LU') + '}');
    }
    if (!lines.length) return '';
    if (lines.length === 1) return '\\(' + lines[0] + '\\)';
    return '\\(\\begin{gathered}' + lines.join('\\\\[2pt]') + '\\end{gathered}\\)';
  }

  if (isDgsLine(object) && object.__liaDgsShowEquation) {
    const equation = getDgsLineEquation(object);
    return '\\(' + (showName && name ? name + ': ' : '') + equation + '\\)';
  }

  if (isDgsAngle(object) && object.__liaDgsShowAngle) {
    const degrees = getDgsAngleRadians(object) * 180 / Math.PI;
    const prefix = showName && name ? name + ' ' + dgsMeasurementRelation(degrees) + ' ' : '';
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    return '\\(' + prefix + formatDgsMeasurement(degrees, language) + '^{\\circ}\\)';
  }

  if (object && object.__liaDgsSegment && object.__liaDgsShowLength) {
    let length = NaN;
    try { length = Math.hypot(object.point2.X() - object.point1.X(), object.point2.Y() - object.point1.Y()); } catch (e) {}
    const prefix = showName && name ? name + ' ' + dgsMeasurementRelation(length) + ' ' : '';
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    const unit = language === 'de' ? 'LE' : 'LU';
    return '\\(' + prefix + formatDgsMeasurement(length, language) + '\\,\\mathrm{' + unit + '}\\)';
  }

  return '\\(' + name + '\\)';
}

function refreshDgsObjectLabel(object: any): void {
  if (!object || !object.label) return;
  const measurementVisible = !!(
    (object.__liaDgsSegment && object.__liaDgsShowLength) ||
    (object.__liaDgsLine && object.__liaDgsShowEquation) ||
    (object.__liaDgsAngle && object.__liaDgsShowAngle) ||
    (object.__liaDgsCircle && (object.__liaDgsShowArea || object.__liaDgsShowPerimeter))
  );
  const visible = object.__liaDgsShowName !== false || measurementVisible;

  try {
    if (typeof object.label.setText === 'function') {
      object.label.setText(function() { return dgsObjectLabelText(object); });
    }

    if (typeof object.label.setAttribute === 'function') object.label.setAttribute({ visible });
    if (visible && typeof object.label.showElement === 'function') object.label.showElement();
    if (!visible && typeof object.label.hideElement === 'function') object.label.hideElement();
    if (object.board && typeof object.board.update === 'function') object.board.update();
  } catch (e) {}
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

function getDgsObjectLayer(object: any): number {
  const stored = Number(object && object.__liaDgsLayer);
  if (Number.isFinite(stored)) return Math.max(0, Math.min(20, Math.round(stored)));
  try {
    const value = Number(typeof object.getAttribute === 'function' ? object.getAttribute('layer') : object.visProp && object.visProp.layer);
    if (Number.isFinite(value)) return Math.max(0, Math.min(20, Math.round(value)));
  } catch (e) {}
  return 5;
}

function setDgsObjectLayer(object: any, value: number): number {
  const layer = Math.max(0, Math.min(20, Math.round(Number(value) || 0)));
  if (!object) return layer;
  object.__liaDgsLayer = layer;
  const apply = (candidate: any) => {
    try {
      if (!candidate) return;
      if (typeof candidate.setAttribute === 'function') candidate.setAttribute({ layer });
      if (candidate.visProp) candidate.visProp.layer = layer;
      if (candidate.visPropCalc) candidate.visPropCalc.layer = layer;
      const board = candidate.board || object.board;
      if (board && board.renderer && typeof board.renderer.setLayer === 'function') {
        board.renderer.setLayer(candidate, layer);
      }
    } catch (e) {}
  };
  apply(object);
  apply(object.label);
  apply(object.arc);
  apply(object.__liaDgsMeasurementLabel);
  apply(object.__liaDgsAngleLabel);
  apply(object.__liaDgsCircleLabel);
  if (isDgsPolygon(object) && Array.isArray(object.borders)) object.borders.forEach(apply);
  try { if (object.board && typeof object.board.fullUpdate === 'function') object.board.fullUpdate(); } catch (e) {
    try { if (object.board && typeof object.board.update === 'function') object.board.update(); } catch (e2) {}
  }
  return layer;
}

function setDgsObjectNameVisible(object: any, visible: boolean): void {
  if (!object) return;
  object.__liaDgsShowName = visible;
  if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
  else refreshDgsObjectLabel(object);
}

function getDgsObjectOpacity(object: any): number {
  const fallback = isDgsPolygon(object) ? 0.22 : (isDgsCircle(object) ? 0.2 : 1);
  const value = Number(object && object.__liaDgsOpacity);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function applyDgsObjectOpacity(object: any): void {
  if (!object) return;
  const visible = object.__liaDgsShowObject !== false;
  const opacity = visible ? getDgsObjectOpacity(object) : 0;
  const polygon = isDgsPolygon(object);
  const outlinedShape = polygon || isDgsCircle(object);

  try {
    object.setAttribute({
      strokeOpacity: outlinedShape && visible ? 1 : opacity,
      fillOpacity: opacity,
      highlightStrokeOpacity: outlinedShape && visible ? 1 : opacity,
      highlightFillOpacity: opacity
    });
  } catch (e) {}
  try {
    if (object.label && typeof object.label.setAttribute === 'function') {
      const labelOpacity = outlinedShape && visible ? 1 : opacity;
      object.label.setAttribute({ strokeOpacity: labelOpacity, fillOpacity: labelOpacity });
    }
  } catch (e) {}
  if (polygon && Array.isArray(object.borders)) {
    object.borders.forEach((border: any) => {
      try { border.setAttribute({ visible, strokeOpacity: visible ? 1 : 0, highlightStrokeOpacity: visible ? 1 : 0 }); } catch (e) {}
    });
  }
  if (polygon && object.__liaDgsMeasurementLabel) {
    const labelVisible = visible && (
      object.__liaDgsShowName !== false ||
      !!(object.__liaDgsShowArea || object.__liaDgsShowPerimeter)
    );
    try { object.__liaDgsMeasurementLabel.setAttribute({ visible: labelVisible, strokeOpacity: labelVisible ? 1 : 0, fillOpacity: labelVisible ? 1 : 0 }); } catch (e) {}
  }
}

function setDgsObjectOpacity(object: any, opacity: number): void {
  if (!object || !Number.isFinite(opacity)) return;
  object.__liaDgsOpacity = Math.max(0, Math.min(1, opacity));
  applyDgsObjectOpacity(object);
}

function setDgsObjectVisible(object: any, visible: boolean): void {
  if (!object) return;
  object.__liaDgsShowObject = visible;
  applyDgsObjectOpacity(object);
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
  state.colorPreviews.forEach((preview, index) => {
    if (state.colorButtons[index].dataset.colorKind === state.activeColorKind) preview.style.background = color;
  });
  state.colorHexInput.value = color;
  state.colorHexInput.setAttribute('aria-invalid', 'false');
}

function applyPickerColor(state: DgsState, recordHistory = true): string | null {
  if (!state.contextObject) return null;
  const color = hsvToHex(state.colorHue, state.colorSaturation, state.colorValue);
  const applied = setDgsObjectColor(state.contextObject, state.activeColorKind, color);
  if (!applied) return null;
  state.colorPalette.style.setProperty('--lia-dgs-picker-hue', state.colorHue.toFixed(2) + 'deg');
  state.colorPaletteCursor.style.left = (state.colorSaturation * 100).toFixed(2) + '%';
  state.colorPaletteCursor.style.top = ((1 - state.colorValue) * 100).toFixed(2) + '%';
  state.colorHueInput.value = String(Math.round(state.colorHue));
  const activeIndex = state.colorButtons.findIndex((button) => button.dataset.colorKind === state.activeColorKind);
  if (activeIndex >= 0) state.colorPreviews[activeIndex].style.background = applied;
  state.colorHexInput.value = applied;
  state.colorHexInput.setAttribute('aria-invalid', 'false');
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  persistDgsConstruction(state, recordHistory);
  return applied;
}

function getDgsObjectColor(object: any, kind: 'text' | 'line' | 'fill' = 'line'): string {
  const key = kind === 'text' ? '__liaDgsTextColor' : (kind === 'fill' ? '__liaDgsFillColor' : '__liaDgsLineColor');
  return normalizeHexColor(object && object[key]) || normalizeHexColor(object && object.__liaDgsColor) || '#ff00ff';
}

function setDgsObjectColor(object: any, kind: 'text' | 'line' | 'fill', colorValue: unknown): string | null {
  const color = normalizeHexColor(colorValue);
  if (!object || !color) return null;
  if (kind === 'text') object.__liaDgsTextColor = color;
  else if (kind === 'fill') object.__liaDgsFillColor = color;
  else object.__liaDgsLineColor = color;

  if (kind === 'line') {
    try { object.setAttribute({ strokeColor: color, highlightStrokeColor: color }); } catch (e) {}
  } else if (kind === 'fill') {
    try { object.setAttribute({ fillColor: color, highlightFillColor: color }); } catch (e) {}
  } else {
    try {
      if (object.label && typeof object.label.setAttribute === 'function') {
        object.label.setAttribute({ strokeColor: color, fillColor: color });
      }
    } catch (e) {}
  }
  if (isDgsAngle(object) && object.arc && (kind === 'line' || kind === 'fill')) {
    try {
      object.arc.setAttribute(kind === 'line'
        ? { strokeColor: color, highlightStrokeColor: color }
        : { fillColor: color, highlightFillColor: color });
    } catch (e) {}
  }

  if (kind === 'line' && isDgsPolygon(object) && Array.isArray(object.borders)) {
    object.borders.forEach((border: any) => {
      try { border.setAttribute({ strokeColor: color, highlightStrokeColor: color }); } catch (e) {}
    });
  }
  if (kind === 'text' && isDgsPolygon(object) && object.__liaDgsMeasurementLabel) {
    try { object.__liaDgsMeasurementLabel.setAttribute({ strokeColor: color, fillColor: color }); } catch (e) {}
  }

  if (kind === 'line' && isDgsPoint(object)) {
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
  persistDgsConstruction(state);
  return true;
}

function resetDeleteButton(state: DgsState): void {
  state.deleteArmed = false;
  state.deleteButton.dataset.confirm = '0';
  state.deleteButton.textContent = dgsText(state.language).delete;
}

function deleteDgsObject(state: DgsState, object: any): void {
  if (!state.board || !object) return;

  const toRemove = new Set<any>();
  if (isDgsPoint(object)) {
    const collectDependent = (candidate: any) => {
      if (!candidate) return;
      if ((candidate.__liaDgsSegment || candidate.__liaDgsLine) &&
          (candidate.point1 === object || candidate.point2 === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsPolygon && Array.isArray(candidate.vertices) && candidate.vertices.includes(object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsAngle && Array.isArray(candidate.__liaDgsAnglePoints) &&
          candidate.__liaDgsAnglePoints.includes(object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsCircle &&
          (candidate.__liaDgsCircleCenter === object || candidate.__liaDgsCircleRadiusPoint === object)) {
        toRemove.add(candidate);
      }
    };
    if (Array.isArray(state.board.objectsList)) state.board.objectsList.forEach(collectDependent);
    if (state.board.objects && typeof state.board.objects === 'object') {
      Object.keys(state.board.objects).forEach((key) => collectDependent(state.board.objects[key]));
    }

    const name = String(object.__liaDgsPointName || '');
    try {
      if (window.__points && window.__points[state.boardId] && window.__points[state.boardId][name] === object) {
        delete window.__points[state.boardId][name];
      }
      if (window.__pointStates && window.__pointStates[state.boardId]) {
        delete window.__pointStates[state.boardId][name];
      }
    } catch (e) {}
  }
  toRemove.add(object);
  Array.from(toRemove).forEach((candidate) => {
    if (candidate && candidate.__liaDgsPolygon && candidate.__liaDgsMeasurementLabel) {
      toRemove.add(candidate.__liaDgsMeasurementLabel);
    }
    if (candidate && candidate.__liaDgsAngle && candidate.__liaDgsAngleLabel) {
      toRemove.add(candidate.__liaDgsAngleLabel);
    }
    if (candidate && candidate.__liaDgsCircle && candidate.__liaDgsCircleLabel) {
      toRemove.add(candidate.__liaDgsCircleLabel);
    }
  });

  Object.keys(states).forEach((uid) => {
    const current = states[uid];
    if (!current) return;
    if (current.selectedSegmentPoint === object) setSelectedSegmentPoint(current, null);
    if (current.selectedPolygonPoints.includes(object)) setSelectedPolygonPoints(current, []);
    if (current.selectedAnglePoints.includes(object)) setSelectedAnglePoints(current, []);
    if (current.selectedCircleCenter === object) clearDgsCirclePreview(current);
    if (current.contextObject && toRemove.has(current.contextObject)) setSideMenuOpen(current, false);
  });

  toRemove.forEach((candidate) => {
    try { state.board.removeObject(candidate); } catch (e) {}
  });
  try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
  try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
  persistDgsConstruction(state);
}

function updateSideMenuControls(state: DgsState, object: any): void {
  const text = dgsText(state.language);
  const point = isDgsPoint(object);
  const line = isDgsLine(object);
  const polygon = isDgsPolygon(object);
  const angle = isDgsAngle(object);
  const circle = isDgsCircle(object);
  const name = getDgsObjectName(object);
  setColorPopupOpen(state, false);
  state.contextObject = object;
  object.__liaDgsLanguage = state.language;
  state.sideMenuObjectType.textContent = point ? text.point : (line ? text.line : (polygon ? text.polygon : (circle ? text.circle : (angle ? text.angle : text.segment))));
  state.sideMenuNameInput.value = name;
  state.sideMenuNameInput.setAttribute('aria-invalid', 'false');
  state.fixedCheckbox.checked = getDgsObjectFixed(object);
  state.nameCheckbox.checked = object.__liaDgsShowName !== false;
  state.objectCheckbox.checked = object.__liaDgsShowObject !== false;
  state.objectCheckboxText.textContent = point ? text.showPoint : (line ? text.showLine : (polygon ? text.showPolygon : (circle ? text.showCircle : (angle ? text.showAngleObject : text.showSegment))));
  state.measurementOption.hidden = point || polygon || circle;
  state.measurementCheckbox.checked = line ? !!object.__liaDgsShowEquation : (angle ? !!object.__liaDgsShowAngle : !!object.__liaDgsShowLength);
  state.measurementCheckboxText.textContent = line ? text.showEquation : (angle ? text.showAngle : text.showDistance);
  state.areaOption.hidden = !polygon && !circle;
  state.areaCheckbox.checked = (polygon || circle) && !!object.__liaDgsShowArea;
  state.perimeterOption.hidden = !polygon && !circle;
  state.perimeterCheckbox.checked = (polygon || circle) && !!object.__liaDgsShowPerimeter;
  state.coordinateSection.hidden = !point;
  resetDeleteButton(state);
  if (point) refreshSideMenuCoordinates(state);
  state.fillColorButton.hidden = !polygon && !circle && !angle;
  state.colorButtons.forEach((button, index) => {
    const kind = button.dataset.colorKind as 'text' | 'line' | 'fill';
    state.colorPreviews[index].style.background = getDgsObjectColor(object, kind);
  });
  state.activeColorKind = 'text';
  syncColorPicker(state, getDgsObjectColor(object, state.activeColorKind));
  const opacityPercent = Math.round(getDgsObjectOpacity(object) * 100);
  state.opacityInput.value = String(opacityPercent);
  state.opacityValue.textContent = opacityPercent + '%';
  state.colorPreviews.forEach((preview, index) => {
    const kind = state.colorButtons[index].dataset.colorKind;
    preview.style.opacity = polygon || circle
      ? (kind === 'fill' ? String(opacityPercent / 100) : '1')
      : String(opacityPercent / 100);
  });
  state.layerInput.value = String(getDgsObjectLayer(object));
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
  const text = dgsText(state.language);
  const pointActive = state.activeTool === 'point';
  const segmentActive = state.activeTool === 'segment';
  const lineActive = state.activeTool === 'line';
  const polygonActive = state.activeTool === 'polygon';
  const circleActive = state.activeTool === 'circle';
  const angleActive = state.activeTool === 'angle';
  state.pointButton.classList.toggle('is-active', pointActive);
  state.pointButton.setAttribute('aria-pressed', pointActive ? 'true' : 'false');
  state.pointButton.setAttribute('aria-label', pointActive ? text.stopPoint : text.setPoint);
  state.pointButton.title = pointActive ? text.stopPoint : text.setPoint;
  state.segmentButton.classList.toggle('is-active', segmentActive || lineActive);
  state.segmentToolButton.classList.toggle('is-active', segmentActive);
  state.segmentToolButton.setAttribute('aria-pressed', segmentActive ? 'true' : 'false');
  state.lineToolButton.classList.toggle('is-active', lineActive);
  state.lineToolButton.setAttribute('aria-pressed', lineActive ? 'true' : 'false');
  state.polygonButton.classList.toggle('is-active', polygonActive || circleActive);
  state.polygonButton.setAttribute('aria-pressed', polygonActive || circleActive ? 'true' : 'false');
  state.polygonToolButton.classList.toggle('is-active', polygonActive);
  state.polygonToolButton.setAttribute('aria-pressed', polygonActive ? 'true' : 'false');
  state.circleToolButton.classList.toggle('is-active', circleActive);
  state.circleToolButton.setAttribute('aria-pressed', circleActive ? 'true' : 'false');
  state.angleButton.classList.toggle('is-active', angleActive);
  state.angleButton.setAttribute('aria-pressed', angleActive ? 'true' : 'false');
  refreshConstructionModeCursor(state.boardContainer);
}

function setActiveTool(
  state: DgsState,
  tool: '' | 'point' | 'segment' | 'line' | 'polygon' | 'circle' | 'angle',
  deactivateRegression = true
): void {
  if (tool) {
    Object.keys(states).forEach((uid) => {
      const other = states[uid];
      if (!other || other === state || other.boardId !== state.boardId || !other.activeTool) return;
      setSelectedSegmentPoint(other, null);
      setSelectedPolygonPoints(other, []);
      setSelectedAnglePoints(other, []);
      clearDgsCirclePreview(other);
      other.activeTool = '';
      renderToolState(other);
    });
    if (deactivateRegression) notifyRegressionLayout(state, false);
  }

  if ((state.activeTool === 'segment' || state.activeTool === 'line') && tool !== state.activeTool) {
    setSelectedSegmentPoint(state, null);
  }
  if (state.activeTool === 'polygon' && tool !== 'polygon') setSelectedPolygonPoints(state, []);
  if (state.activeTool === 'angle' && tool !== 'angle') setSelectedAnglePoints(state, []);
  if (state.activeTool === 'circle' && tool !== 'circle') clearDgsCirclePreview(state);
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
  state.colorPopup.style.color = tone;
  state.menuBar.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.menuBar.style.setProperty('--lia-dgs-theme-color', accent);
  state.sideMenu.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.sideMenu.style.setProperty('--lia-dgs-theme-color', accent);
  state.colorPopup.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.colorPopup.style.setProperty('--lia-dgs-theme-color', accent);
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

function setColorPopupOpen(state: DgsState, open: boolean): void {
  state.colorPopupOpen = open;
  state.colorPopup.dataset.open = open ? '1' : '0';
  state.colorPopup.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.colorPopup.style.top = (state.open ? MENU_HEIGHT_PX + 10 : 10) + 'px';
  state.colorPopup.style.right = state.boardContainer.clientWidth >= SIDE_MENU_WIDTH_PX + 210
    ? SIDE_MENU_WIDTH_PX + 10 + 'px'
    : '10px';
  state.colorButtons.forEach((button) => button.setAttribute(
    'aria-expanded', open && button.dataset.colorKind === state.activeColorKind ? 'true' : 'false'
  ));
  state.colorPalette.tabIndex = open ? 0 : -1;
  state.colorHueInput.tabIndex = open ? 0 : -1;
  state.colorHexInput.tabIndex = open ? 0 : -1;
  state.opacityInput.tabIndex = open ? 0 : -1;
}

function setSideMenuOpen(state: DgsState, open: boolean): void {
  const changed = state.sideMenuOpen !== open;
  state.sideMenuOpen = open;
  state.sideMenu.dataset.open = open ? '1' : '0';
  state.sideMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.sideMenuCloseButton.tabIndex = open ? 0 : -1;
  state.sideMenuNameInput.tabIndex = open ? 0 : -1;
  const coordinatesAvailable = open && !state.coordinateSection.hidden;
  state.xCoordinateInput.tabIndex = coordinatesAvailable ? 0 : -1;
  state.yCoordinateInput.tabIndex = coordinatesAvailable ? 0 : -1;
  state.fixedCheckbox.tabIndex = open ? 0 : -1;
  state.nameCheckbox.tabIndex = open ? 0 : -1;
  state.objectCheckbox.tabIndex = open ? 0 : -1;
  state.measurementCheckbox.tabIndex = open && !state.measurementOption.hidden ? 0 : -1;
  state.areaCheckbox.tabIndex = open && !state.areaOption.hidden ? 0 : -1;
  state.perimeterCheckbox.tabIndex = open && !state.perimeterOption.hidden ? 0 : -1;
  state.colorButtons.forEach((button) => { button.tabIndex = open && !button.hidden ? 0 : -1; });
  state.layerInput.tabIndex = open ? 0 : -1;
  state.deleteButton.tabIndex = open ? 0 : -1;
  if (!open) {
    setColorPopupOpen(state, false);
    state.contextObject = null;
    resetDeleteButton(state);
  }
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
  state.polygonButton.tabIndex = open ? 0 : -1;
  state.angleButton.tabIndex = open ? 0 : -1;
  if (state.colorPopupOpen) setColorPopupOpen(state, true);
  if (!open) setGeometrySubmenuOpen(state, false);
  if (!open) setShapeSubmenuOpen(state, false);
  if (changed) trackAxisWithMenu(state);
  if (changed) notifyRegressionLayout(state, open);
}

function setGeometrySubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setShapeSubmenuOpen(state, false);
  state.geometrySubmenuOpen = open;
  state.geometrySubmenu.dataset.open = open ? '1' : '0';
  state.geometrySubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.segmentButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  state.segmentToolButton.tabIndex = open ? 0 : -1;
  state.lineToolButton.tabIndex = open ? 0 : -1;
}

function setShapeSubmenuOpen(state: DgsState, open: boolean): void {
  if (open && state.geometrySubmenuOpen) {
    state.geometrySubmenuOpen = false;
    state.geometrySubmenu.dataset.open = '0';
    state.geometrySubmenu.setAttribute('aria-hidden', 'true');
    state.segmentButton.setAttribute('aria-expanded', 'false');
    state.segmentToolButton.tabIndex = -1;
    state.lineToolButton.tabIndex = -1;
  }
  state.shapeSubmenuOpen = open;
  state.shapeSubmenu.dataset.open = open ? '1' : '0';
  state.shapeSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.polygonButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  state.polygonToolButton.tabIndex = open ? 0 : -1;
  state.circleToolButton.tabIndex = open ? 0 : -1;
}

function getDgsGeometryLanguage(anchor: HTMLElement | null, explicitLanguage?: string): 'de' | 'en' {
  const candidates: string[] = [];
  candidates.push(String(explicitLanguage || ''));
  try { candidates.push(anchor?.dataset.language || ''); } catch (e) {}
  try { candidates.push(anchor?.closest('[lang]')?.getAttribute('lang') || ''); } catch (e) {}
  try { candidates.push(document.documentElement.lang || ''); } catch (e) {}
  try { candidates.push(window.parent?.document?.documentElement?.lang || ''); } catch (e) {}

  for (const candidate of candidates) {
    if (/^de(?:-|$)/i.test(candidate)) return 'de';
    if (/^en(?:-|$)/i.test(candidate)) return 'en';
  }
  return 'en';
}

function ensureDgsRegression(uid: string, boardId: string): void {
  try {
    if (typeof window.__setupRegressionUI === 'function') {
      window.__setupRegressionUI('dgs-regression-' + uid, boardId);
    }
  } catch (e) {}
}

function setupDGS(uid: string, boardId: string, languageCode?: string): void {
  if (!uid || !boardId) return;

  const boardContainer = getBoardContainer(boardId);
  if (!boardContainer) {
    const retries = (pendingRetries[uid] || 0) + 1;
    pendingRetries[uid] = retries;

    if (retries <= MAX_RETRIES) {
      window.setTimeout(() => setupDGS(uid, boardId, languageCode), RETRY_DELAY_MS);
    }
    return;
  }

  pendingRetries[uid] = 0;
  ensureDgsRegression(uid, boardId);

  const anchor = document.getElementById(`dgs-ui-${uid}`);
  const geometryLanguage = getDgsGeometryLanguage(anchor, languageCode);
  const text = dgsText(geometryLanguage);
  if (anchor) {
    anchor.style.display = 'none';
    anchor.setAttribute('aria-hidden', 'true');
  }

  const rootNode = (boardContainer.getRootNode && boardContainer.getRootNode()) || document;
  ensureStyles(rootNode as Document | ShadowRoot);

  const existing = states[uid];
  if (
    existing &&
    existing.language === geometryLanguage &&
    existing.board === (window.__boards && window.__boards[boardId]) &&
    existing.boardContainer === boardContainer &&
    existing.button.isConnected &&
    !!existing.menuClip?.isConnected &&
    !!existing.menuBar?.isConnected &&
    !!existing.sideMenuClip?.isConnected &&
    !!existing.sideMenu?.isConnected &&
    !!existing.sideMenuObjectType?.isConnected &&
    !!existing.sideMenuNameInput?.isConnected &&
    !!existing.toolsDivider?.isConnected &&
    !!existing.pointButton?.isConnected &&
    !!existing.segmentButton?.isConnected &&
    !!existing.polygonButton?.isConnected &&
    !!existing.angleButton?.isConnected &&
    !!existing.geometrySubmenu?.isConnected &&
    !!existing.segmentToolButton?.isConnected &&
    !!existing.lineToolButton?.isConnected &&
    !!existing.shapeSubmenu?.isConnected &&
    !!existing.polygonToolButton?.isConnected &&
    !!existing.circleToolButton?.isConnected &&
    !!existing.measurementOption?.isConnected &&
    !!existing.measurementCheckbox?.isConnected &&
    !!existing.areaOption?.isConnected &&
    !!existing.areaCheckbox?.isConnected &&
    !!existing.perimeterOption?.isConnected &&
    !!existing.perimeterCheckbox?.isConnected &&
    !!existing.colorButton?.isConnected &&
    existing.colorButtons?.length === 3 &&
    existing.colorButtons.every((button) => button.isConnected) &&
    !!existing.colorPopup?.isConnected &&
    !!existing.opacityInput?.isConnected &&
    !!existing.layerInput?.isConnected &&
    !!existing.deleteButton?.isConnected &&
    !!existing.regressionDivider?.isConnected &&
    typeof existing.onBoardPointerDown === 'function' &&
    typeof existing.onBoardPointerMove === 'function' &&
    typeof existing.onBoardContextMenu === 'function' &&
    typeof existing.onDocumentPointerDown === 'function'
  ) {
    restoreDgsConstruction(existing);
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
    if (existing.onBoardPointerMove) {
      existing.boardContainer.removeEventListener('pointermove', existing.onBoardPointerMove, true);
    }
    if (existing.onBoardContextMenu) {
      existing.boardContainer.removeEventListener('contextmenu', existing.onBoardContextMenu, true);
    }
    if (existing.onDocumentPointerDown) {
      document.removeEventListener('pointerdown', existing.onDocumentPointerDown, true);
    }
    if (existing.resizeObserver) existing.resizeObserver.disconnect();
    releaseRegressionControls(existing);
    try { existing.button.remove(); } catch (e) {}
    try { existing.menuClip.remove(); } catch (e) {}
    try { existing.sideMenuClip.remove(); } catch (e) {}
    try { existing.colorPopup.remove(); } catch (e) {}
  }

  const menuClip = document.createElement('div');
  menuClip.className = 'lia-dgs-menu-clip';

  const menuBar = document.createElement('div');
  menuBar.id = `dgs-menu-${uid}`;
  menuBar.className = 'lia-dgs-top-menu';
  menuBar.setAttribute('role', 'navigation');
  menuBar.setAttribute('aria-label', geometryLanguage === 'de' ? 'DGS-Menüleiste' : 'DGS toolbar');

  const toolsDivider = document.createElement('span');
  toolsDivider.className = 'lia-dgs-tools-divider';
  toolsDivider.setAttribute('aria-hidden', 'true');
  menuBar.appendChild(toolsDivider);

  const pointButton = document.createElement('button');
  pointButton.type = 'button';
  pointButton.className = 'lia-dgs-geometry-button lia-dgs-point-button';
  pointButton.setAttribute('aria-label', text.setPoint);
  pointButton.setAttribute('aria-pressed', 'false');
  pointButton.title = text.setPoint;
  pointButton.innerHTML = '<span class="lia-dgs-point-symbol" aria-hidden="true"><svg viewBox="0 0 8 8"><path class="lia-dgs-cross" d="M2 2l4 4M6 2L2 6"></path></svg><span class="lia-dgs-point-label">\\(A\\)</span></span>';
  pointButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(pointButton);

  const segmentLabel = text.distance;
  const lineLabel = text.straightLine;
  const segmentIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16L18 8"></path><path class="lia-dgs-cross" d="M4.5 14.5l3 3M7.5 14.5l-3 3M16.5 6.5l3 3M19.5 6.5l-3 3"></path></svg>';
  const lineIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19L22 5"></path><path class="lia-dgs-cross" d="M4.5 14.5l3 3M7.5 14.5l-3 3M16.5 6.5l3 3M19.5 6.5l-3 3"></path></svg>';
  const polygonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-polygon-fill" d="M5 18L12 5L19 18Z"></path><path class="lia-dgs-cross" d="M3.5 16.5l3 3M6.5 16.5l-3 3M10.5 3.5l3 3M13.5 3.5l-3 3M17.5 16.5l3 3M20.5 16.5l-3 3"></path></svg>';
  const circleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"></circle><path class="lia-dgs-cross" d="M10.5 10.5l3 3M13.5 10.5l-3 3M17.8 10.5l3 3M20.8 10.5l-3 3"></path></svg>';

  const segmentButton = document.createElement('button');
  segmentButton.type = 'button';
  segmentButton.className = 'lia-dgs-geometry-button lia-dgs-segment-button';
  segmentButton.setAttribute('aria-label', geometryLanguage === 'de' ? 'Linienwerkzeuge' : 'Line tools');
  segmentButton.setAttribute('aria-haspopup', 'menu');
  segmentButton.setAttribute('aria-expanded', 'false');
  segmentButton.title = geometryLanguage === 'de' ? 'Linienwerkzeuge' : 'Line tools';
  segmentButton.innerHTML = segmentIcon;
  segmentButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(segmentButton);

  const geometrySubmenu = document.createElement('div');
  geometrySubmenu.id = `dgs-geometry-submenu-${uid}`;
  geometrySubmenu.className = 'lia-dgs-geometry-submenu';
  geometrySubmenu.setAttribute('role', 'menu');
  geometrySubmenu.setAttribute('aria-label', geometryLanguage === 'de' ? 'Linienwerkzeuge' : 'Line tools');
  segmentButton.setAttribute('aria-controls', geometrySubmenu.id);

  const makeGeometryTool = (parent: HTMLElement, label: string, icon: string) => {
    const toolButton = document.createElement('button');
    toolButton.type = 'button';
    toolButton.className = 'lia-dgs-geometry-tool';
    toolButton.setAttribute('role', 'menuitem');
    toolButton.innerHTML = icon + '<span>' + label + '</span>';
    toolButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
    parent.appendChild(toolButton);
    return toolButton;
  };

  const segmentToolButton = makeGeometryTool(geometrySubmenu, segmentLabel, segmentIcon);
  segmentToolButton.setAttribute('aria-pressed', 'false');
  const lineToolButton = makeGeometryTool(geometrySubmenu, lineLabel, lineIcon);
  lineToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(geometrySubmenu);

  const polygonButton = document.createElement('button');
  polygonButton.type = 'button';
  polygonButton.className = 'lia-dgs-geometry-button lia-dgs-polygon-button';
  polygonButton.setAttribute('aria-label', text.shapes);
  polygonButton.setAttribute('aria-pressed', 'false');
  polygonButton.title = text.shapes;
  polygonButton.setAttribute('aria-haspopup', 'menu');
  polygonButton.setAttribute('aria-expanded', 'false');
  polygonButton.innerHTML = polygonIcon;
  polygonButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(polygonButton);

  const shapeSubmenu = document.createElement('div');
  shapeSubmenu.id = `dgs-shape-submenu-${uid}`;
  shapeSubmenu.className = 'lia-dgs-geometry-submenu lia-dgs-shape-submenu';
  shapeSubmenu.setAttribute('role', 'menu');
  shapeSubmenu.setAttribute('aria-label', text.shapes);
  polygonButton.setAttribute('aria-controls', shapeSubmenu.id);
  const polygonToolButton = makeGeometryTool(shapeSubmenu, text.polygon, polygonIcon);
  polygonToolButton.setAttribute('aria-pressed', 'false');
  const circleToolButton = makeGeometryTool(shapeSubmenu, text.circle, circleIcon);
  circleToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(shapeSubmenu);

  const angleButton = document.createElement('button');
  angleButton.type = 'button';
  angleButton.className = 'lia-dgs-geometry-button lia-dgs-angle-button';
  angleButton.setAttribute('aria-label', text.createAngle);
  angleButton.setAttribute('aria-pressed', 'false');
  angleButton.title = text.createAngle;
  angleButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-angle-fill" d="M4 20L14 20A10 10 0 0 0 8.3 10.9Z"></path><path d="M4 20L20 20M4 20L12 3M14 20A10 10 0 0 0 8.3 10.9"></path><path class="lia-dgs-cross" d="M2.5 18.5l3 3M5.5 18.5l-3 3M18.5 18.5l3 3M21.5 18.5l-3 3M10.5 1.5l3 3M13.5 1.5l-3 3"></path></svg>';
  angleButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(angleButton);

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
  sideMenu.setAttribute('aria-label', geometryLanguage === 'de' ? 'DGS-Objekteigenschaften' : 'DGS object properties');

  const sideMenuHeader = document.createElement('div');
  sideMenuHeader.className = 'lia-dgs-side-menu-header';
  const sideMenuTitle = document.createElement('div');
  sideMenuTitle.className = 'lia-dgs-side-menu-title';
  const sideMenuObjectType = document.createElement('span');
  const sideMenuNameInput = document.createElement('input');
  sideMenuNameInput.type = 'text';
  sideMenuNameInput.className = 'lia-dgs-name-input';
  sideMenuNameInput.setAttribute('aria-label', geometryLanguage === 'de' ? 'Objektname' : 'Object name');
  sideMenuNameInput.setAttribute('aria-invalid', 'false');
  sideMenuNameInput.spellcheck = false;
  sideMenuTitle.appendChild(sideMenuObjectType);
  sideMenuTitle.appendChild(sideMenuNameInput);
  const sideMenuCloseButton = document.createElement('button');
  sideMenuCloseButton.type = 'button';
  sideMenuCloseButton.className = 'lia-dgs-side-menu-close';
  sideMenuCloseButton.setAttribute('aria-label', geometryLanguage === 'de' ? 'Eigenschaften schließen' : 'Close properties');
  sideMenuCloseButton.textContent = '×';
  sideMenuHeader.appendChild(sideMenuTitle);
  sideMenuHeader.appendChild(sideMenuCloseButton);
  sideMenu.appendChild(sideMenuHeader);

  const coordinateSection = document.createElement('div');
  coordinateSection.className = 'lia-dgs-coordinate-section';
  const coordinateTitle = document.createElement('div');
  coordinateTitle.className = 'lia-dgs-context-section-title';
  coordinateTitle.textContent = text.coordinates;
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
    input.setAttribute('aria-label', geometryLanguage === 'de' ? axis + '-Koordinate' : axis + ' coordinate');
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
    return { label, input, caption };
  };
  const fixedOption = makeContextOption(text.fixed);
  const nameOption = makeContextOption(text.showName);
  const objectOption = makeContextOption(text.showPoint);
  const measurementOption = makeContextOption(text.showDistance);
  measurementOption.label.hidden = true;
  const areaOption = makeContextOption(text.showArea);
  areaOption.label.hidden = true;
  const perimeterOption = makeContextOption(text.showPerimeter);
  perimeterOption.label.hidden = true;

  const colorSection = document.createElement('div');
  colorSection.className = 'lia-dgs-color-section';
  const colorButtons: HTMLButtonElement[] = [];
  const colorPreviews: HTMLSpanElement[] = [];
  const makeColorButton = (kind: 'text' | 'line' | 'fill', caption: string) => {
    const colorButton = document.createElement('button');
    colorButton.type = 'button';
    colorButton.className = 'lia-dgs-color-button';
    colorButton.dataset.colorKind = kind;
    colorButton.setAttribute('aria-label', geometryLanguage === 'de' ? caption + ' auswählen' : 'Select ' + caption.toLowerCase());
    colorButton.setAttribute('aria-haspopup', 'dialog');
    colorButton.setAttribute('aria-expanded', 'false');
    const colorPreview = document.createElement('span');
    colorPreview.className = 'lia-dgs-color-preview';
    colorPreview.setAttribute('aria-hidden', 'true');
    const colorButtonText = document.createElement('span');
    colorButtonText.textContent = caption;
    colorButton.appendChild(colorPreview);
    colorButton.appendChild(colorButtonText);
    colorSection.appendChild(colorButton);
    colorButtons.push(colorButton);
    colorPreviews.push(colorPreview);
    return colorButton;
  };
  const colorButton = makeColorButton('text', text.textColor);
  makeColorButton('line', text.lineColor);
  const fillColorButton = makeColorButton('fill', text.fillColor);
  const colorPreview = colorPreviews[0];
  sideMenu.appendChild(colorSection);

  const layerRow = document.createElement('label');
  layerRow.className = 'lia-dgs-layer-row';
  const layerCaption = document.createElement('span');
  layerCaption.textContent = text.layer;
  const layerInput = document.createElement('input');
  layerInput.type = 'number';
  layerInput.className = 'lia-dgs-layer-input';
  layerInput.min = '0';
  layerInput.max = '20';
  layerInput.step = '1';
  layerInput.value = '5';
  layerInput.setAttribute('aria-label', geometryLanguage === 'de' ? 'Zeichenebene' : 'Drawing layer');
  layerRow.appendChild(layerCaption);
  layerRow.appendChild(layerInput);
  sideMenu.appendChild(layerRow);

  const colorPopup = document.createElement('div');
  colorPopup.className = 'lia-dgs-color-popup';
  colorPopup.dataset.open = '0';
  colorPopup.setAttribute('role', 'dialog');
  colorPopup.setAttribute('aria-label', geometryLanguage === 'de' ? 'Farbe und Deckkraft' : 'Color and opacity');
  colorPopup.setAttribute('aria-hidden', 'true');
  const colorPalette = document.createElement('div');
  colorPalette.className = 'lia-dgs-color-palette';
  colorPalette.tabIndex = 0;
  colorPalette.setAttribute('role', 'application');
  colorPalette.setAttribute('aria-label', geometryLanguage === 'de' ? 'Sättigung und Helligkeit auswählen' : 'Select saturation and brightness');
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
  colorHueInput.setAttribute('aria-label', geometryLanguage === 'de' ? 'Farbton' : 'Hue');
  const colorRow = document.createElement('div');
  colorRow.className = 'lia-dgs-color-row';
  const colorHexInput = document.createElement('input');
  colorHexInput.type = 'text';
  colorHexInput.className = 'lia-dgs-color-hex';
  colorHexInput.value = '#ff00ff';
  colorHexInput.maxLength = 7;
  colorHexInput.spellcheck = false;
  colorHexInput.setAttribute('aria-label', geometryLanguage === 'de' ? 'Objektfarbe als Hexwert' : 'Object color as hex value');
  colorHexInput.setAttribute('aria-invalid', 'false');
  colorRow.appendChild(colorHexInput);
  const opacityRow = document.createElement('label');
  opacityRow.className = 'lia-dgs-opacity-row';
  const opacityCaption = document.createElement('span');
  opacityCaption.textContent = text.opacity;
  const opacityInput = document.createElement('input');
  opacityInput.type = 'range';
  opacityInput.className = 'lia-dgs-opacity-input';
  opacityInput.min = '0';
  opacityInput.max = '100';
  opacityInput.step = '1';
  opacityInput.value = '100';
  opacityInput.setAttribute('aria-label', geometryLanguage === 'de' ? 'Deckkraft in Prozent' : 'Opacity in percent');
  const opacityValue = document.createElement('span');
  opacityValue.className = 'lia-dgs-opacity-value';
  opacityValue.textContent = '100%';
  opacityRow.appendChild(opacityCaption);
  opacityRow.appendChild(opacityInput);
  opacityRow.appendChild(opacityValue);
  colorPopup.appendChild(colorPalette);
  colorPopup.appendChild(colorHueInput);
  colorPopup.appendChild(colorRow);
  colorPopup.appendChild(opacityRow);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'lia-dgs-delete-button';
  deleteButton.dataset.confirm = '0';
  deleteButton.textContent = text.delete;
  sideMenu.appendChild(deleteButton);
  sideMenuClip.appendChild(sideMenu);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lia-dgs-menu-button';
  button.setAttribute('aria-label', geometryLanguage === 'de' ? 'DGS-Menü' : 'DGS menu');
  button.setAttribute('aria-controls', menuBar.id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path></svg>';
  button.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  sideMenu.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  colorPopup.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  sideMenu.addEventListener('contextmenu', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });

  boardContainer.appendChild(sideMenuClip);
  boardContainer.appendChild(menuClip);
  boardContainer.appendChild(colorPopup);
  boardContainer.appendChild(button);
  typesetDgsMath(pointButton);

  const board = window.__boards && window.__boards[boardId];
  const xAxis = board && board.defaultAxes && board.defaultAxes.x;
  const yAxis = board && board.defaultAxes && board.defaultAxes.y;
  const state: DgsState = {
    uid,
    boardId,
    language: geometryLanguage,
    board,
    boardContainer,
    button,
    menuClip,
    menuBar,
    sideMenuClip,
    sideMenu,
    sideMenuTitle,
    sideMenuObjectType,
    sideMenuNameInput,
    sideMenuCloseButton,
    coordinateSection,
    xCoordinateInput,
    yCoordinateInput,
    fixedCheckbox: fixedOption.input,
    nameCheckbox: nameOption.input,
    objectCheckbox: objectOption.input,
    objectCheckboxText: objectOption.caption,
    measurementOption: measurementOption.label,
    measurementCheckbox: measurementOption.input,
    measurementCheckboxText: measurementOption.caption,
    areaOption: areaOption.label,
    areaCheckbox: areaOption.input,
    perimeterOption: perimeterOption.label,
    perimeterCheckbox: perimeterOption.input,
    colorButton,
    colorButtons,
    colorPreviews,
    fillColorButton,
    colorPopup,
    colorPalette,
    colorPaletteCursor,
    colorHueInput,
    colorPreview,
    colorHexInput,
    opacityInput,
    opacityValue,
    colorPopupOpen: false,
    activeColorKind: 'text',
    layerInput,
    deleteButton,
    deleteArmed: false,
    colorHue: 300,
    colorSaturation: 1,
    colorValue: 1,
    toolsDivider,
    pointButton,
    segmentButton,
    polygonButton,
    angleButton,
    geometrySubmenu,
    segmentToolButton,
    lineToolButton,
    shapeSubmenu,
    polygonToolButton,
    circleToolButton,
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
    geometrySubmenuOpen: false,
    shapeSubmenuOpen: false,
    sideMenuOpen: false,
    contextObject: null,
    activeTool: '',
    selectedSegmentPoint: null,
    selectedPolygonPoints: [],
    selectedAnglePoints: [],
    selectedCircleCenter: null,
    circlePreview: null,
    circlePreviewPosition: null,
    restoring: false
  };
  states[uid] = state;
  restoreDgsConstruction(state);
  setMenuOpen(state, false);
  setGeometrySubmenuOpen(state, false);
  setShapeSubmenuOpen(state, false);
  setSideMenuOpen(state, false);
  applyLayout(state);

  pointButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'point' ? '' : 'point');
  });

  segmentButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, !state.geometrySubmenuOpen);
  });

  segmentToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    segmentButton.innerHTML = segmentIcon;
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'segment' ? '' : 'segment');
  });

  lineToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    segmentButton.innerHTML = lineIcon;
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'line' ? '' : 'line');
  });

  polygonButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setShapeSubmenuOpen(state, !state.shapeSubmenuOpen);
  });

  polygonToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    polygonButton.innerHTML = polygonIcon;
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'polygon' ? '' : 'polygon');
  });

  circleToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    polygonButton.innerHTML = circleIcon;
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'circle' ? '' : 'circle');
  });

  angleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'angle' ? '' : 'angle');
  });

  menuBar.addEventListener('click', (evt) => {
    const target = evt.target as Element | null;
    if (
      target &&
      typeof target.closest === 'function' &&
      target.closest('.lia-plot-draw-btn, .lia-plot-erase-toggle, .lia-plot-regression-toggle, .lia-plot-reg-item')
    ) {
      setGeometrySubmenuOpen(state, false);
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
      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
          evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        evt.stopPropagation();
        return;
      }
      if (evt.key !== 'Enter') return;
      evt.preventDefault();
      evt.stopPropagation();
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
    persistDgsConstruction(state);
  });

  const applyLayerInput = () => {
    const object = state.contextObject;
    if (!object) return;
    const layer = setDgsObjectLayer(object, Number(layerInput.value));
    layerInput.value = String(layer);
    persistDgsConstruction(state);
  };
  layerInput.addEventListener('input', applyLayerInput);
  layerInput.addEventListener('blur', applyLayerInput);
  layerInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown' ||
        evt.key === 'ArrowLeft' || evt.key === 'ArrowRight') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      applyLayerInput();
      layerInput.blur();
    }
  });

  nameOption.input.addEventListener('change', () => {
    if (!state.contextObject) return;
    setDgsObjectNameVisible(state.contextObject, nameOption.input.checked);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    persistDgsConstruction(state);
  });

  objectOption.input.addEventListener('change', () => {
    if (!state.contextObject) return;
    setDgsObjectVisible(state.contextObject, objectOption.input.checked);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    persistDgsConstruction(state);
  });

  const applyNameInput = () => {
    const object = state.contextObject;
    if (!object) return false;
    const applied = setDgsObjectName(state, object, sideMenuNameInput.value);
    sideMenuNameInput.setAttribute('aria-invalid', applied ? 'false' : 'true');
    if (!applied) sideMenuNameInput.value = getDgsObjectName(object);
    return applied;
  };
  sideMenuNameInput.addEventListener('blur', applyNameInput);
  sideMenuNameInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      if (applyNameInput()) sideMenuNameInput.blur();
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      sideMenuNameInput.value = state.contextObject ? getDgsObjectName(state.contextObject) : '';
      sideMenuNameInput.setAttribute('aria-invalid', 'false');
      sideMenuNameInput.blur();
    }
  });

  measurementOption.input.addEventListener('change', () => {
    const object = state.contextObject;
    if (!object || isDgsPoint(object) || isDgsPolygon(object)) return;
    if (isDgsLine(object)) object.__liaDgsShowEquation = measurementOption.input.checked;
    else if (isDgsAngle(object)) object.__liaDgsShowAngle = measurementOption.input.checked;
    else object.__liaDgsShowLength = measurementOption.input.checked;
    refreshDgsObjectLabel(object);
    persistDgsConstruction(state);
  });

  areaOption.input.addEventListener('change', () => {
    const object = state.contextObject;
    if (!isDgsPolygon(object) && !isDgsCircle(object)) return;
    object.__liaDgsShowArea = areaOption.input.checked;
    if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
    else refreshDgsObjectLabel(object);
    persistDgsConstruction(state);
  });

  perimeterOption.input.addEventListener('change', () => {
    const object = state.contextObject;
    if (!isDgsPolygon(object) && !isDgsCircle(object)) return;
    object.__liaDgsShowPerimeter = perimeterOption.input.checked;
    if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
    else refreshDgsObjectLabel(object);
    persistDgsConstruction(state);
  });

  colorButtons.forEach((button) => button.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (!state.contextObject) return;
    const kind = button.dataset.colorKind as 'text' | 'line' | 'fill';
    const alreadyOpen = state.colorPopupOpen && state.activeColorKind === kind;
    state.activeColorKind = kind;
    syncColorPicker(state, getDgsObjectColor(state.contextObject, kind));
    setColorPopupOpen(state, !alreadyOpen);
  }));

  deleteButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const object = state.contextObject;
    if (!object) return;
    if (!state.deleteArmed) {
      state.deleteArmed = true;
      deleteButton.dataset.confirm = '1';
      deleteButton.textContent = dgsText(state.language).confirmDelete;
      return;
    }
    deleteDgsObject(state, object);
  });

  const applyColor = (value: string) => {
    if (!state.contextObject) return false;
    const color = setDgsObjectColor(state.contextObject, state.activeColorKind, value);
    colorHexInput.setAttribute('aria-invalid', color ? 'false' : 'true');
    if (!color) return false;
    syncColorPicker(state, color);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    persistDgsConstruction(state);
    return true;
  };

  let activePalettePointer: number | null = null;
  const updatePaletteFromPointer = (evt: PointerEvent) => {
    const rect = colorPalette.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    state.colorSaturation = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
    state.colorValue = 1 - Math.max(0, Math.min(1, (evt.clientY - rect.top) / rect.height));
    applyPickerColor(state, false);
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
    persistDgsConstruction(state, true);
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
    applyPickerColor(state, false);
  });
  colorHueInput.addEventListener('change', () => persistDgsConstruction(state, true));
  colorHexInput.addEventListener('change', () => applyColor(colorHexInput.value));
  colorHexInput.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Enter') return;
    evt.preventDefault();
    applyColor(colorHexInput.value);
  });
  const applyOpacity = (recordHistory: boolean) => {
    const object = state.contextObject;
    if (!object) return;
    const percent = Math.max(0, Math.min(100, Number(opacityInput.value) || 0));
    opacityValue.textContent = Math.round(percent) + '%';
    colorPreviews.forEach((preview, index) => {
      const kind = colorButtons[index].dataset.colorKind;
      preview.style.opacity = isDgsPolygon(object) || isDgsCircle(object)
        ? (kind === 'fill' ? String(percent / 100) : '1')
        : String(percent / 100);
    });
    setDgsObjectOpacity(object, percent / 100);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    persistDgsConstruction(state, recordHistory);
  };
  opacityInput.addEventListener('input', () => applyOpacity(false));
  opacityInput.addEventListener('change', () => applyOpacity(true));

  state.onDocumentPointerDown = (evt: PointerEvent) => {
    if (!state.colorPopupOpen) return;
    const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [];
    if (colorButtons.some((button) => path.includes(button)) || path.includes(colorPopup)) return;
    setColorPopupOpen(state, false);
  };
  document.addEventListener('pointerdown', state.onDocumentPointerDown, true);

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

    if (state.activeTool === 'circle') {
      let point = findNearestBoardPoint(state, evt);
      if (!point) {
        const coordinates = eventToUserCoordinates(state, evt);
        if (!coordinates) return;
        point = createDgsPoint(state, coordinates.x, coordinates.y);
        if (!point) return;
        persistDgsConstruction(state);
      }
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedCircleCenter) {
        startDgsCirclePreview(state, point);
        return;
      }
      if (point === state.selectedCircleCenter) return;
      const center = state.selectedCircleCenter;
      clearDgsCirclePreview(state);
      const circle = createDgsCircle(state, center, point);
      if (circle) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'angle') {
      const point = findNearestBoardPoint(state, evt);
      if (!point || state.selectedAnglePoints.includes(point)) return;

      evt.preventDefault();
      evt.stopImmediatePropagation();
      const selected = state.selectedAnglePoints.concat(point);
      if (selected.length < 3) {
        setSelectedAnglePoints(state, selected);
        return;
      }

      const angle = createDgsAngle(state, selected);
      if (angle) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'polygon') {
      const point = findNearestBoardPoint(state, evt);
      if (!point) return;

      evt.preventDefault();
      evt.stopImmediatePropagation();
      const selected = state.selectedPolygonPoints;
      if (!selected.length) {
        setSelectedPolygonPoints(state, [point]);
        return;
      }

      if (point === selected[0]) {
        if (selected.length < 3) return;
        const polygon = createDgsPolygon(state, selected);
        if (polygon) {
          persistDgsConstruction(state);
          setActiveTool(state, '', false);
        }
        return;
      }

      if (selected.includes(point)) return;
      setSelectedPolygonPoints(state, selected.concat(point));
      return;
    }

    if (state.activeTool === 'segment' || state.activeTool === 'line') {
      const point = findNearestBoardPoint(state, evt);
      if (!point) return;

      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedSegmentPoint) {
        setSelectedSegmentPoint(state, point);
        return;
      }
      if (state.selectedSegmentPoint === point) return;

      const geometry = state.activeTool === 'line'
        ? createDgsLine(state, state.selectedSegmentPoint, point)
        : createDgsSegment(state, state.selectedSegmentPoint, point);
      if (geometry) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    const coordinates = eventToUserCoordinates(state, evt);
    if (!coordinates) return;

    evt.preventDefault();
    evt.stopImmediatePropagation();
    const point = createDgsPoint(state, coordinates.x, coordinates.y);
    if (point) persistDgsConstruction(state);
  };
  boardContainer.addEventListener('pointerdown', state.onBoardPointerDown, true);

  state.onBoardPointerMove = (evt: PointerEvent) => {
    if (state.activeTool !== 'circle' || !state.selectedCircleCenter || eventTargetsBoardUi(evt)) return;
    const coordinates = eventToUserCoordinates(state, evt);
    if (!coordinates) return;
    state.circlePreviewPosition = coordinates;
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  };
  boardContainer.addEventListener('pointermove', state.onBoardPointerMove, true);

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

window.__setupDGS = function (uid: string, spec: string, language?: string): void {
  const boardId = unquote(String(spec || '').trim());
  scheduleBootstrap(() => setupDGS(uid, boardId, language));
};

export function bootstrapDGS(): void {
  const anchors = document.querySelectorAll('[id^="dgs-ui-"][data-spec]');

  anchors.forEach((el: Element) => {
    const match = String(el.id || '').match(/^dgs-ui-(.+)$/);
    if (!match) return;

    const uid = match[1];
    const boardId = unquote(String((el as HTMLElement).dataset.spec || '').trim());
    setupDGS(uid, boardId, (el as HTMLElement).dataset.language);
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
