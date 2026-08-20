// DGS subsystem (@DGS macro).
// Adds a menu button and a sliding top menu bar to a coordinate board.

import { scheduleBootstrap } from '../shared/bootstrap';
import { getAdaptiveTickMetric } from '../coord/boardHelpers';
import { formatMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, getNeutralColor, initThemeSync } from '../shared/theme';
import {
  applySafeRenderedLayer,
  getMacroLayerRenderRole,
  getMacroRenderedLayer
} from '../shared/macroLayer';
import {
  DGS_LAYER_OWNER_PROPERTIES,
  getExplicitDgsLayerFromOwner,
  getDgsRenderedLayer,
  getRenderedDgsLayerFromOwner
} from '../shared/dgsLayer';
import {
  compileFunctionExpression,
  expandImplicitVariableProducts,
  prepareFunctionInput,
  transformLatex
} from '../shared/functionExpression';
import { resolveRegressionDgsController } from '../shared/dgsRegressionProfile';
import { applyLineStyle } from '../shared/lineStyle';

type DgsAxisScaleMode = 'cartesian' | 'log-x' | 'log-y' | 'log-log';

const DGS_TOOL_IDS = {
  formatCopy: 100,
  setSquare: 140,
  compass: 150,
  point: 200,
  segment: 310,
  ray: 320,
  line: 330,
  vector: 340,
  arc: 350,
  orthogonal: 410,
  parallel: 420,
  midpoint: 430,
  angleBisector: 440,
  polygon: 510,
  circle: 520,
  sector: 530,
  angle: 610,
  measuredAngle: 620,
  function: 700,
  roots: 810,
  extrema: 820,
  inflections: 830,
  ordinateIntercept: 840,
  tangent: 850,
  intersection: 860,
  regressionDraw: 910,
  regressionErase: 920,
  regressionTools: 930,
  slider: 1000,
  text: 1010,
  zoom: 1110,
  axisScale: 1120
} as const;

type DgsToolId = typeof DGS_TOOL_IDS[keyof typeof DGS_TOOL_IDS];

// These are immutable capability identifiers, not visual positions. New tools
// may be placed anywhere in the UI, but existing ids must never be changed or
// reused. This keeps old restricted exports stable when the toolbar grows.
const DGS_KNOWN_TOOL_IDS: DgsToolId[] = [
  DGS_TOOL_IDS.formatCopy,
  DGS_TOOL_IDS.setSquare,
  DGS_TOOL_IDS.compass,
  DGS_TOOL_IDS.point,
  DGS_TOOL_IDS.segment,
  DGS_TOOL_IDS.ray,
  DGS_TOOL_IDS.line,
  DGS_TOOL_IDS.vector,
  DGS_TOOL_IDS.arc,
  DGS_TOOL_IDS.orthogonal,
  DGS_TOOL_IDS.parallel,
  DGS_TOOL_IDS.midpoint,
  DGS_TOOL_IDS.angleBisector,
  DGS_TOOL_IDS.polygon,
  DGS_TOOL_IDS.circle,
  DGS_TOOL_IDS.sector,
  DGS_TOOL_IDS.angle,
  DGS_TOOL_IDS.measuredAngle,
  DGS_TOOL_IDS.function,
  DGS_TOOL_IDS.roots,
  DGS_TOOL_IDS.extrema,
  DGS_TOOL_IDS.inflections,
  DGS_TOOL_IDS.ordinateIntercept,
  DGS_TOOL_IDS.tangent,
  DGS_TOOL_IDS.intersection,
  DGS_TOOL_IDS.regressionDraw,
  DGS_TOOL_IDS.regressionErase,
  DGS_TOOL_IDS.regressionTools,
  DGS_TOOL_IDS.slider,
  DGS_TOOL_IDS.text,
  DGS_TOOL_IDS.zoom,
  DGS_TOOL_IDS.axisScale
];

// Some foundational controls are deliberately present in every DGS. Keep
// their immutable capability ids in the registry for backwards compatibility,
// but do not expose them in the export profile: an old or restricted profile
// must never be able to hide these controls.
const DGS_ALWAYS_AVAILABLE_TOOL_IDS = new Set<number>([
  DGS_TOOL_IDS.setSquare,
  DGS_TOOL_IDS.compass
]);
const DGS_EXPORT_SELECTABLE_TOOL_IDS: DgsToolId[] = DGS_KNOWN_TOOL_IDS.filter(
  (toolId) => !DGS_ALWAYS_AVAILABLE_TOOL_IDS.has(toolId)
);

function dgsExportSelectableToolIds(toolIds: Iterable<number>): number[] {
  return Array.from(toolIds).filter((toolId) => !DGS_ALWAYS_AVAILABLE_TOOL_IDS.has(toolId));
}

const DGS_RESTRICTION_IDS = {
  objectPropertiesLocked: 100,
  objectPropertiesColorsTraceOnly: 200,
  valueControlsLocked: 300,
  exportLocked: 400
} as const;

type DgsRestrictionId = typeof DGS_RESTRICTION_IDS[keyof typeof DGS_RESTRICTION_IDS];

// Restriction ids are immutable capabilities as well. They are deliberately
// independent of checkbox order so future restrictions can be inserted in the
// export dialog without changing older profiles.
const DGS_KNOWN_RESTRICTION_IDS: DgsRestrictionId[] = [
  DGS_RESTRICTION_IDS.objectPropertiesLocked,
  DGS_RESTRICTION_IDS.objectPropertiesColorsTraceOnly,
  DGS_RESTRICTION_IDS.valueControlsLocked,
  DGS_RESTRICTION_IDS.exportLocked
];

type DgsMacroConfig = {
  boardId: string;
  toolIds: Set<number> | null;
  toolSelectionKey: string;
  restrictionIds: Set<number>;
  restrictionSelectionKey: string;
};

function canonicalDgsToolIds(ids: Iterable<number>): number[] {
  return Array.from(new Set(Array.from(ids)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)))
    .sort((a, b) => a - b);
}

function dgsToolSelectionKey(ids: Set<number> | null): string {
  if (ids == null) return '*';
  const values = canonicalDgsToolIds(ids);
  return values.length ? values.join(',') : '0';
}

function canonicalDgsRestrictionIds(ids: Iterable<number>): number[] {
  return Array.from(new Set(Array.from(ids)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)))
    .sort((a, b) => a - b);
}

function dgsRestrictionSelectionKey(ids: Iterable<number>): string {
  const values = canonicalDgsRestrictionIds(ids);
  return values.length ? values.join(',') : '0';
}

function parseDgsNumericIdList(raw: string | null): number[] {
  if (raw == null) return [];
  const listSource = raw.replace(/^\s*\[/, '').replace(/\]\s*$/, '');
  return listSource.split(/[;,\s]+/)
    .map((token) => token.trim())
    .filter((token) => /^\d+$/.test(token))
    .map((token) => Number(token))
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
}

function parseDgsMacroSpec(spec: string): DgsMacroConfig {
  const parts = splitTopLevel(unquote(String(spec || '').trim()), ';');
  const boardId = unquote(String(parts[0] || '').trim());
  let rawTools: string | null = null;
  let rawRestrictions: string | null = null;

  parts.slice(1).forEach((part) => {
    const value = String(part || '').trim();
    const toolsMatch = value.match(/^tools\s*=\s*([\s\S]*)$/i);
    const restrictionsMatch = value.match(/^restrictions\s*=\s*([\s\S]*)$/i);
    if (toolsMatch) rawTools = unquote(String(toolsMatch[1] || '').trim());
    if (restrictionsMatch) rawRestrictions = unquote(String(restrictionsMatch[1] || '').trim());
  });

  // Legacy macros, empty lists and malformed lists intentionally mean the
  // complete DGS. tools=[0] is the explicit empty allowlist.
  const numericToolValues = parseDgsNumericIdList(rawTools);
  const toolIds = rawTools == null || !numericToolValues.length
    ? null
    : new Set<number>(numericToolValues.filter((value) => value > 0));
  // Missing, empty and malformed restriction lists are unrestricted. A zero
  // can be used as an explicit empty list without affecting legacy macros.
  const restrictionIds = new Set<number>(
    parseDgsNumericIdList(rawRestrictions).filter((value) => value > 0)
  );
  if (restrictionIds.has(DGS_RESTRICTION_IDS.objectPropertiesLocked)) {
    restrictionIds.delete(DGS_RESTRICTION_IDS.objectPropertiesColorsTraceOnly);
  }
  return {
    boardId,
    toolIds,
    toolSelectionKey: dgsToolSelectionKey(toolIds),
    restrictionIds,
    restrictionSelectionKey: dgsRestrictionSelectionKey(restrictionIds)
  };
}

function formatDgsToolSelection(ids: Iterable<number>): string {
  const values = canonicalDgsToolIds(ids);
  return '[' + (values.length ? values.join(';') : '0') + ']';
}

function formatDgsRestrictionSelection(ids: Iterable<number>): string {
  const values = canonicalDgsRestrictionIds(ids);
  return '[' + (values.length ? values.join(';') : '0') + ']';
}

type DgsState = {
  uid: string;
  boardId: string;
  language: 'de' | 'en';
  macroSpecSignature: string;
  board: any;
  boardContainer: HTMLElement;
  button: HTMLButtonElement;
  menuClip: HTMLDivElement;
  menuBar: HTMLDivElement;
  menuEndGroup: HTMLDivElement;
  sideMenuClip: HTMLDivElement;
  sideMenu: HTMLDivElement;
  sideMenuTitle: HTMLDivElement;
  sideMenuObjectType: HTMLSpanElement;
  sideMenuNameInput: HTMLInputElement;
  sideMenuCloseButton: HTMLButtonElement;
  objectListClip: HTMLDivElement;
  objectListPanel: HTMLDivElement;
  objectListContent: HTMLDivElement;
  objectListFooter: HTMLDivElement;
  objectListCloseButton: HTMLButtonElement;
  objectListExportButton: HTMLButtonElement;
  exportDialog: HTMLDivElement;
  exportDialogTitle: HTMLDivElement;
  exportToolsStep: HTMLDivElement;
  exportMacroStep: HTMLDivElement;
  exportToolButtons: Map<number, HTMLButtonElement>;
  exportSelectedToolIds: Set<number>;
  exportRestrictionInputs: Map<number, HTMLInputElement>;
  exportSelectedRestrictionIds: Set<number>;
  exportDialogStep: 'tools' | 'macro';
  exportTextarea: HTMLTextAreaElement;
  exportCopyButton: HTMLButtonElement;
  exportBackButton: HTMLButtonElement;
  exportCloseButton: HTMLButtonElement;
  nameOption: HTMLLabelElement;
  objectOption: HTMLLabelElement;
  coordinateSection: HTMLDivElement;
  xCoordinateInput: HTMLInputElement;
  yCoordinateInput: HTMLInputElement;
  angleMeasureSection: HTMLDivElement;
  angleMeasureInput: HTMLInputElement;
  arcSettingsSection: HTMLDivElement;
  arcExitAngleInput: HTMLInputElement;
  arcEntryAngleInput: HTMLInputElement;
  strokeStyleSection: HTMLDivElement;
  lineStyleSelect: HTMLSelectElement;
  strokeDesignField: HTMLLabelElement;
  strokeDesignSelect: HTMLSelectElement;
  strokeWidthField: HTMLLabelElement;
  strokeWidthInput: HTMLInputElement;
  functionExpressionSection: HTMLDivElement;
  functionExpressionPreview: HTMLDivElement;
  functionExpressionInput: HTMLInputElement;
  textFontSizeSection: HTMLLabelElement;
  textFontSizeInput: HTMLInputElement;
  sliderSettingsSection: HTMLDivElement;
  sliderValueInput: HTMLInputElement;
  sliderMinInput: HTMLInputElement;
  sliderMaxInput: HTMLInputElement;
  sliderStepInput: HTMLInputElement;
  axisLabelSection: HTMLDivElement;
  axisVariableInput: HTMLInputElement;
  axisDescriptionInput: HTMLInputElement;
  fixedOption: HTMLLabelElement;
  fixedCheckbox: HTMLInputElement;
  fixedCheckboxText: HTMLSpanElement;
  traceOption: HTMLLabelElement;
  traceCheckbox: HTMLInputElement;
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
  lineColorButton: HTMLButtonElement;
  traceColorButton: HTMLButtonElement;
  colorButtons: HTMLButtonElement[];
  colorPreviews: HTMLSpanElement[];
  fillColorButton: HTMLButtonElement;
  colorSection: HTMLDivElement;
  colorPopup: HTMLDivElement;
  colorPalette: HTMLDivElement;
  colorPaletteCursor: HTMLSpanElement;
  colorHueInput: HTMLInputElement;
  colorPreview: HTMLSpanElement;
  colorHexInput: HTMLInputElement;
  opacityInput: HTMLInputElement;
  opacityValue: HTMLSpanElement;
  opacityRow: HTMLLabelElement;
  clearTraceButton: HTMLButtonElement;
  colorPopupOpen: boolean;
  activeColorKind: 'text' | 'line' | 'fill' | 'trace';
  layerInput: HTMLInputElement;
  layerRow: HTMLLabelElement;
  deleteButton: HTMLButtonElement;
  deleteArmed: boolean;
  colorHue: number;
  colorSaturation: number;
  colorValue: number;
  selectButton: HTMLButtonElement;
  setSquareButton: HTMLButtonElement;
  setSquareOverlay: HTMLDivElement;
  setSquareVisible: boolean;
  setSquareInitialized: boolean;
  setSquarePivotX: number;
  setSquarePivotY: number;
  setSquarePivotXRatio: number;
  setSquarePivotYRatio: number;
  setSquareAngle: number;
  setSquareScale: number;
  setSquarePointerId: number | null;
  setSquareInteraction: 'move' | 'rotate' | 'scale' | null;
  setSquareStartClientX: number;
  setSquareStartClientY: number;
  setSquareStartPivotX: number;
  setSquareStartPivotY: number;
  setSquareStartAngle: number;
  setSquareStartPointerAngle: number;
  setSquareStartScale: number;
  setSquareStartPointerDistance: number;
  setSquareLastContainerWidth: number;
  setSquareLastContainerHeight: number;
  setSquareRulerSignature: string;
  setSquareLayoutRAF?: number;
  compassButton: HTMLButtonElement;
  compassSubmenu: HTMLDivElement;
  compassToolButton: HTMLButtonElement;
  fixedRadiusCompassToolButton: HTMLButtonElement;
  compassRadiusDialog: HTMLDivElement;
  compassRadiusDialogInput: HTMLInputElement;
  compassRadiusDialogConfirmButton: HTMLButtonElement;
  compassRadiusDialogCancelButton: HTMLButtonElement;
  formatButton: HTMLButtonElement;
  toolsDivider: HTMLSpanElement;
  pointButton: HTMLButtonElement;
  segmentButton: HTMLButtonElement;
  orthogonalButton: HTMLButtonElement;
  relationSubmenu: HTMLDivElement;
  orthogonalToolButton: HTMLButtonElement;
  parallelToolButton: HTMLButtonElement;
  midpointToolButton: HTMLButtonElement;
  angleBisectorToolButton: HTMLButtonElement;
  polygonButton: HTMLButtonElement;
  angleButton: HTMLButtonElement;
  angleSubmenu: HTMLDivElement;
  angleToolButton: HTMLButtonElement;
  measuredAngleToolButton: HTMLButtonElement;
  angleDialog: HTMLDivElement;
  angleDialogInput: HTMLInputElement;
  angleDialogConfirmButton: HTMLButtonElement;
  angleDialogCancelButton: HTMLButtonElement;
  arcDialog: HTMLDivElement;
  arcDialogExitInput: HTMLInputElement;
  arcDialogEntryInput: HTMLInputElement;
  arcDialogConfirmButton: HTMLButtonElement;
  arcDialogCancelButton: HTMLButtonElement;
  geometrySubmenu: HTMLDivElement;
  segmentToolButton: HTMLButtonElement;
  rayToolButton: HTMLButtonElement;
  lineToolButton: HTMLButtonElement;
  vectorToolButton: HTMLButtonElement;
  arcToolButton: HTMLButtonElement;
  shapeSubmenu: HTMLDivElement;
  polygonToolButton: HTMLButtonElement;
  circleToolButton: HTMLButtonElement;
  sectorToolButton: HTMLButtonElement;
  functionDivider: HTMLSpanElement;
  functionButton: HTMLButtonElement;
  rootButton: HTMLButtonElement;
  rootSubmenu: HTMLDivElement;
  rootToolButton: HTMLButtonElement;
  extremaToolButton: HTMLButtonElement;
  inflectionToolButton: HTMLButtonElement;
  yInterceptToolButton: HTMLButtonElement;
  tangentToolButton: HTMLButtonElement;
  intersectionToolButton: HTMLButtonElement;
  functionDialog: HTMLDivElement;
  functionDialogInput: HTMLInputElement;
  functionDialogConfirmButton: HTMLButtonElement;
  functionDialogCancelButton: HTMLButtonElement;
  regressionDivider: HTMLSpanElement;
  textDivider: HTMLSpanElement;
  sliderButton: HTMLButtonElement;
  textButton: HTMLButtonElement;
  zoomDivider: HTMLSpanElement;
  zoomModeButton: HTMLButtonElement;
  axisScaleButton: HTMLButtonElement;
  axisScaleSubmenu: HTMLDivElement;
  cartesianScaleButton: HTMLButtonElement;
  logXScaleButton: HTMLButtonElement;
  logYScaleButton: HTMLButtonElement;
  logLogScaleButton: HTMLButtonElement;
  fullscreenButton: HTMLButtonElement;
  objectListButton: HTMLButtonElement;
  menuScrollSpacer: HTMLSpanElement;
  textDialog: HTMLDivElement;
  textDialogInput: HTMLInputElement;
  textDialogConfirmButton: HTMLButtonElement;
  textDialogCancelButton: HTMLButtonElement;
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
  compassSubmenuOpen: boolean;
  geometrySubmenuOpen: boolean;
  relationSubmenuOpen: boolean;
  shapeSubmenuOpen: boolean;
  angleSubmenuOpen: boolean;
  rootSubmenuOpen: boolean;
  axisScaleSubmenuOpen: boolean;
  angleDialogOpen: boolean;
  compassRadiusDialogOpen: boolean;
  arcDialogOpen: boolean;
  functionDialogOpen: boolean;
  textDialogOpen: boolean;
  exportDialogOpen: boolean;
  availableToolIds: Set<number> | null;
  toolSelectionKey: string;
  restrictionIds: Set<number>;
  restrictionSelectionKey: string;
  sideMenuOpen: boolean;
  objectListOpen: boolean;
  objectListSignature: string;
  fullscreenSnapshot: {
    widthStyle: string;
    heightStyle: string;
    width: number;
    height: number;
    boundingBox: number[] | null;
  } | null;
  fullscreenRenderWidth: number;
  fullscreenRenderHeight: number;
  contextObject: any | null;
  activeTool: '' | 'compass' | 'format-copy' | 'point' | 'segment' | 'ray' | 'line' | 'vector' | 'arc' | 'orthogonal' | 'parallel' | 'midpoint' | 'angle-bisector' | 'polygon' | 'circle' | 'sector' | 'angle' | 'angle-measured' | 'roots' | 'extrema' | 'inflections' | 'ordinate-intercept' | 'tangent' | 'intersection' | 'text';
  externalToolActive: boolean;
  pendingTextPosition: { x: number; y: number } | null;
  zoomMode: 'both' | 'vertical' | 'horizontal';
  axisScaleMode: DgsAxisScaleMode;
  selectedSegmentPoint: any | null;
  selectedCompassCenter: any | null;
  selectedCompassPoint: any | null;
  compassPreview: any | null;
  compassPointerId: number | null;
  compassStartAngle: number;
  compassLastAngle: number;
  compassSweep: number;
  compassRadius: number;
  compassMoved: boolean;
  compassMode: 'free' | 'fixed';
  compassPresetRadius: number;
  pendingArcPoints: any[];
  selectedRelationLine: any | null;
  selectedRelationPoint: any | null;
  selectedMidpointPoint: any | null;
  selectedBisectorPoints: any[];
  selectedPolygonPoints: any[];
  selectedAnglePoints: any[];
  selectedCircleCenter: any | null;
  selectedSectorPoints: any[];
  selectedIntersectionObject: any | null;
  selectedFormatSource: any | null;
  circlePreview: any | null;
  circlePreviewPosition: { x: number; y: number } | null;
  restoring: boolean;
  boardReplacementPrepared?: boolean;
  rootConstructions: any[];
  rootUpdateRAF?: number;
  rootUpdating?: boolean;
  restoreTimer?: number;
  coordinateSyncRAF?: number;
  coordinateSyncing?: boolean;
  fixedCompassSyncRAF?: number;
  fixedCompassSyncing?: boolean;
  fixedCompassPersistPending?: boolean;
  fixedCompassPersistHistory?: boolean;
  onBoardViewportChange?: () => void;
  onBoardRootUpdate?: () => void;
  onBoardPointerDown?: (evt: PointerEvent) => void;
  onBoardPointerMove?: (evt: PointerEvent) => void;
  onBoardLostPointerCapture?: (evt: PointerEvent) => void;
  onBoardContextMenu?: (evt: MouseEvent) => void;
  onDocumentPointerDown?: (evt: PointerEvent) => void;
  onDocumentPointerUp?: (evt: PointerEvent) => void;
  onDocumentPointerCancel?: (evt: PointerEvent) => void;
  onFullscreenChange?: () => void;
  resizeObserver?: ResizeObserver;
  fullscreenResizeRAF?: number;
  fullscreenReleaseTimer?: number;
  axisAnimationRAF?: number;
  axisSyncRAF?: number;
  xAxisAnimationRAF?: number;
  xAxisSyncRAF?: number;
};

type DgsObjectPropertiesMode = 'full' | 'colors-trace' | 'locked';

function hasDgsRestriction(state: DgsState, id: DgsRestrictionId): boolean {
  return state.restrictionIds.has(id);
}

function getDgsObjectPropertiesMode(state: DgsState): DgsObjectPropertiesMode {
  if (hasDgsRestriction(state, DGS_RESTRICTION_IDS.objectPropertiesLocked)) return 'locked';
  if (hasDgsRestriction(state, DGS_RESTRICTION_IDS.objectPropertiesColorsTraceOnly)) {
    return 'colors-trace';
  }
  return 'full';
}

const DGS_TEXT = {
  de: {
    exportToolsTitle: 'Werkzeuge f\u00fcr den Import ausw\u00e4hlen',
    exportToolsHint: 'Nur gr\u00fcn markierte Werkzeuge stehen im importierten DGS zur Verf\u00fcgung.',
    exportRestrictionsTitle: 'Einschr\u00e4nkungen im importierten DGS',
    lockObjectProperties: 'Rechtsklick f\u00fcr bestehende Objekte sperren',
    colorsTracePropertiesOnly: 'Im Rechtsklickmen\u00fc nur Farben und Spuren anzeigen',
    lockValueControls: 'Das Anzeigen von Werten sperren',
    lockExport: 'Export in der Objektliste sperren',
    objectPropertiesLocked: 'Objekteigenschaften sind in diesem DGS gesperrt',
    colorTraceProperties: 'Farb- und Spureinstellungen \u00f6ffnen',
    nextExport: 'Weiter', backExport: 'Zur\u00fcck',
    toolAvailable: 'verf\u00fcgbar', toolUnavailable: 'nicht verf\u00fcgbar',
    setSquare: 'Geodreieck', showSetSquare: 'Geodreieck einblenden', hideSetSquare: 'Geodreieck ausblenden', moveSetSquare: 'Geodreieck verschieben', rotateSetSquare: 'Geodreieck um die Nullmarke drehen',
    compass: 'Zirkel', compassTools: 'Zirkelmodi', freeCompass: 'Radius durch zwei Punkte', fixedRadiusCompass: 'Radius eingeben', enterCompassRadius: 'Zirkelradius eingeben', radius: 'Radius', compassArc: 'Zirkelbogen', showCompassArc: 'Zirkelbogen anzeigen',
    arc: 'Bogen', showArc: 'Bogen anzeigen', createArc: 'Bogen erzeugen',
    exitAngle: 'Austrittswinkel', entryAngle: 'Eintrittswinkel',
    appearance: 'Darstellung', lineStyle: 'Linienart', solid: 'Durchgezogen', dashed: 'Gestrichelt', dotted: 'Gepunktet', dashdotted: 'Strichpunktiert', design: 'Design', strokeWidth: 'Linienstärke',
    enterFullscreen: 'Vollbildmodus starten', exitFullscreen: 'Vollbildmodus beenden',
    objectList: 'Objektliste', noObjects: 'Noch keine Objekte', exportMacros: 'Export', exportMacrosTitle: 'Als Makros exportieren', copyExport: 'Kopieren', copiedExport: 'Kopiert', closeExport: 'Schließen', exportHint: 'Kopiere diesen Block in eine LiaScript-Datei.', exportUnsupported: 'Nicht als Makro exportiert', copyFormat: 'Format übernehmen', selectFormatTarget: 'Zielobjekt für das Format auswählen',
    point: 'Punkt', root: 'Nullstelle', extremum: 'Extremstelle', inflection: 'Wendepunkt', yIntercept: 'Ordinatenachsenabschnitt', tangent: 'Tangente', intersection: 'Schnittpunkt', line: 'Gerade', ray: 'Strahl', vector: 'Vektor', orthogonal: 'Orthogonale', parallel: 'Parallele', midpoint: 'Mittelpunkt', angleBisector: 'Winkelhalbierende', polygon: 'Vieleck', segment: 'Strecke', angle: 'Winkel', circle: 'Kreis', sector: 'Kreissektor', function: 'Funktion', text: 'Text', xAxis: 'Querachse', yAxis: 'Hochachse',
    coordinates: 'Koordinaten', fixed: 'Fixieren', lockPosition: 'Position sperren', trace: 'Spur', traceColor: 'Spurfarbe', clearTrace: 'Spur löschen', showName: 'Name anzeigen',
    showPoint: 'Punkt anzeigen', showLine: 'Gerade anzeigen', showRay: 'Strahl anzeigen', showVector: 'Vektor anzeigen', showPolygon: 'Vieleck anzeigen', showCircle: 'Kreis anzeigen', showSector: 'Kreissektor anzeigen', showAngleObject: 'Winkel anzeigen', showFunction: 'Funktion anzeigen', showText: 'Text anzeigen', showSlider: 'Schieberegler anzeigen',
    showSegment: 'Strecke anzeigen', showEquation: 'Geradengleichung anzeigen',
    showDistance: 'Distanzwert anzeigen', showArea: 'Flächeninhalt anzeigen',
    showPerimeter: 'Umfang anzeigen', showAngle: 'Winkelwert anzeigen', showTerm: 'Term anzeigen', showValue: 'Wert anzeigen', showCoordinates: 'Koordinaten anzeigen', textColor: 'Schriftfarbe', lineColor: 'Linienfarbe',
    fillColor: 'Inhaltsfarbe', opacity: 'Deckkraft', delete: 'Löschen',
    confirmDelete: 'Löschen bestätigen', setPoint: 'Punkt setzen', stopPoint: 'Punktmodus beenden',
    straightLine: 'Gerade', distance: 'Strecke', createAngle: 'Winkel markieren', createMeasuredAngle: 'Winkel nach Maß', angleMeasure: 'Winkelmaß', create: 'Erzeugen', cancel: 'Abbrechen', shapes: 'Flächenwerkzeuge', layer: 'Ebene',
    enterFunction: 'Funktion eingeben', functionInput: 'Funktionsterm in JSXGraph- oder TeX-Syntax', functionEquation: 'Funktionsgleichung', insertText: 'Text einfügen', textInput: 'Textinhalt', fontSize: 'Schriftgröße', insertSlider: 'Schieberegler einfügen', slider: 'Schieberegler', parameterName: 'Parametername', currentValue: 'Aktueller Wert', minimum: 'Minimalwert', maximum: 'Maximalwert', stepWidth: 'Schrittweite', variableName: 'Variablenname', axisDescription: 'Achsenbeschriftung', normalMode: 'Normalmodus', zoomBoth: 'Beidachsig zoomen', zoomVertical: 'Nur vertikal zoomen', zoomHorizontal: 'Nur horizontal zoomen', axisScale: 'Achsenskalierung', cartesianScale: 'Kartesisch', logXScale: 'x logarithmisch, y kartesisch', logYScale: 'x kartesisch, y logarithmisch', logLogScale: 'Doppellogarithmisch', createRoots: 'Nullstellen bestimmen', createExtrema: 'Extremstellen bestimmen', createInflections: 'Wendepunkte bestimmen', createYIntercept: 'Ordinatenachsenabschnitt bestimmen', createTangent: 'Tangente anlegen', createIntersection: 'Schnittpunkte bestimmen', analysis: 'Funktionsanalyse'
  },
  en: {
    exportToolsTitle: 'Choose tools for the imported DGS',
    exportToolsHint: 'Only tools marked in green are available in the imported DGS.',
    exportRestrictionsTitle: 'Restrictions in the imported DGS',
    lockObjectProperties: 'Disable right-click for existing objects',
    colorsTracePropertiesOnly: 'Show only colors and traces in the object menu',
    lockValueControls: 'Disable displaying values',
    lockExport: 'Disable export in the object list',
    objectPropertiesLocked: 'Object properties are disabled in this DGS',
    colorTraceProperties: 'Open color and trace settings',
    nextExport: 'Continue', backExport: 'Back',
    toolAvailable: 'available', toolUnavailable: 'not available',
    setSquare: 'Set square', showSetSquare: 'Show set square', hideSetSquare: 'Hide set square', moveSetSquare: 'Move set square', rotateSetSquare: 'Rotate set square around its zero mark',
    compass: 'Compass', compassTools: 'Compass modes', freeCompass: 'Radius through two points', fixedRadiusCompass: 'Enter radius', enterCompassRadius: 'Enter compass radius', radius: 'Radius', compassArc: 'Compass arc', showCompassArc: 'Show compass arc',
    arc: 'Arc', showArc: 'Show arc', createArc: 'Create arc',
    exitAngle: 'Exit angle', entryAngle: 'Entry angle',
    appearance: 'Appearance', lineStyle: 'Line style', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', dashdotted: 'Dash-dotted', design: 'Design', strokeWidth: 'Line width',
    enterFullscreen: 'Enter fullscreen', exitFullscreen: 'Exit fullscreen',
    objectList: 'Object list', noObjects: 'No objects yet', exportMacros: 'Export', exportMacrosTitle: 'Export as macros', copyExport: 'Copy', copiedExport: 'Copied', closeExport: 'Close', exportHint: 'Copy this block into a LiaScript file.', exportUnsupported: 'Not exported as a macro', copyFormat: 'Copy formatting', selectFormatTarget: 'Select the target object for the formatting',
    point: 'Point', root: 'Zero', extremum: 'Extremum', inflection: 'Inflection point', yIntercept: 'Ordinate-axis intercept', tangent: 'Tangent', intersection: 'Intersection', line: 'Straight Line', ray: 'Ray', vector: 'Vector', orthogonal: 'Perpendicular', parallel: 'Parallel', midpoint: 'Midpoint', angleBisector: 'Angle bisector', polygon: 'Polygon', segment: 'Distance', angle: 'Angle', circle: 'Circle', sector: 'Circular sector', function: 'Function', text: 'Text', xAxis: 'Horizontal axis', yAxis: 'Vertical axis',
    coordinates: 'Coordinates', fixed: 'Lock', lockPosition: 'Lock position', trace: 'Trace', traceColor: 'Trace color', clearTrace: 'Clear trace', showName: 'Show name',
    showPoint: 'Show point', showLine: 'Show straight line', showRay: 'Show ray', showVector: 'Show vector', showPolygon: 'Show polygon', showCircle: 'Show circle', showSector: 'Show circular sector', showAngleObject: 'Show angle', showFunction: 'Show function', showText: 'Show text', showSlider: 'Show slider',
    showSegment: 'Show distance', showEquation: 'Show line equation',
    showDistance: 'Show distance value', showArea: 'Show area',
    showPerimeter: 'Show perimeter', showAngle: 'Show angle value', showTerm: 'Show expression', showValue: 'Show value', showCoordinates: 'Show coordinates', textColor: 'Text color', lineColor: 'Line color',
    fillColor: 'Fill color', opacity: 'Opacity', delete: 'Delete',
    confirmDelete: 'Confirm delete', setPoint: 'Place point', stopPoint: 'Exit point mode',
    straightLine: 'Straight Line', distance: 'Distance', createAngle: 'Mark angle', createMeasuredAngle: 'Angle by measure', angleMeasure: 'Angle measure', create: 'Create', cancel: 'Cancel', shapes: 'Shape tools', layer: 'Layer',
    enterFunction: 'Enter function', functionInput: 'Function expression in JSXGraph or TeX syntax', functionEquation: 'Function equation', insertText: 'Insert text', textInput: 'Text content', fontSize: 'Font size', insertSlider: 'Insert slider', slider: 'Slider', parameterName: 'Parameter name', currentValue: 'Current value', minimum: 'Minimum', maximum: 'Maximum', stepWidth: 'Step size', variableName: 'Variable name', axisDescription: 'Axis label', normalMode: 'Normal mode', zoomBoth: 'Zoom both axes', zoomVertical: 'Zoom vertically only', zoomHorizontal: 'Zoom horizontally only', axisScale: 'Axis scaling', cartesianScale: 'Cartesian', logXScale: 'logarithmic x, Cartesian y', logYScale: 'Cartesian x, logarithmic y', logLogScale: 'Double logarithmic', createRoots: 'Find zeros', createExtrema: 'Find extrema', createInflections: 'Find inflection points', createYIntercept: 'Find ordinate-axis intercept', createTangent: 'Create tangent', createIntersection: 'Find intersections', analysis: 'Function analysis'
  }
} as const;

function dgsText(language: 'de' | 'en') { return DGS_TEXT[language]; }

const DGS_SET_SQUARE_VIEW_WIDTH = 600;
const DGS_SET_SQUARE_VIEW_HEIGHT = 350;
const DGS_SET_SQUARE_PIVOT_X = 300;
const DGS_SET_SQUARE_PIVOT_Y = 34;
const DGS_SET_SQUARE_MIN_VISIBLE_FRACTION = 0.05;

const DGS_SET_SQUARE_ICON =
  '<svg class=lia-dgs-set-square-icon viewBox=0,0,24,24 aria-hidden=true>' +
  '<path class=lia-dgs-set-square-icon-fill d=M2.5,4.5H21.5L12,20.7Z></path>' +
  '<path class=lia-dgs-reference d=M2.5,4.5H21.5L12,20.7ZM6.6,4.5C7.3,11.3,16.7,11.3,17.4,4.5M5.2,4.5V6.6M8.2,4.5V5.9M15.8,4.5V5.9M18.8,4.5V6.6></path>' +
  '<path class=lia-dgs-set-square-icon-accent d=M12,4.5V17.6M10.7,4.5H13.3></path>' +
  '</svg>';

function createDgsSetSquareGraphic(): string {
  const number = (value: number): string => {
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  };
  const point = (radius: number, degree: number): [number, number] => {
    const radians = degree * Math.PI / 180;
    return [
      DGS_SET_SQUARE_PIVOT_X + Math.cos(radians) * radius,
      DGS_SET_SQUARE_PIVOT_Y + Math.sin(radians) * radius
    ];
  };
  const edgeRadius = (degree: number): number => {
    const radians = degree * Math.PI / 180;
    return 1 / (
      Math.abs(Math.cos(radians)) / 290 +
      Math.sin(radians) / 300
    );
  };

  const rulerTicks = 'M300,34V52';
  const rulerLabels =
    '<text class=lia-dgs-set-square-ruler-number x=300 y=67 text-anchor=middle>0</text>';

  const protractorRadius = 136;
  let protractorArc = '';
  for (let degree = 0; degree <= 180; degree += 2) {
    const [x, y] = point(protractorRadius, degree);
    protractorArc += (degree === 0 ? 'M' : 'L') + number(x) + ',' + number(y);
  }
  let protractorTicks = '';
  let protractorRays = '';
  let protractorLabels = '';
  for (let degree = 0; degree <= 180; degree += 1) {
    const tickLength = degree % 10 === 0 ? 20 : (degree % 5 === 0 ? 12 : 6);
    const [outerX, outerY] = point(protractorRadius + tickLength / 2, degree);
    const [innerX, innerY] = point(protractorRadius - tickLength / 2, degree);
    protractorTicks += 'M' + number(innerX) + ',' + number(innerY) +
      'L' + number(outerX) + ',' + number(outerY);
    if (degree % 10 === 0 && degree > 0 && degree < 180) {
      const [rayStartX, rayStartY] = point(protractorRadius + 14, degree);
      const [rayEndX, rayEndY] = point(edgeRadius(degree), degree);
      protractorRays += 'M' + number(rayStartX) + ',' + number(rayStartY) +
        'L' + number(rayEndX) + ',' + number(rayEndY);
      const [outerLabelX, outerLabelY] = point(160, degree);
      const [innerLabelX, innerLabelY] = point(110, degree);
      protractorLabels += '<text class=lia-dgs-set-square-degree-outer data-angle=' + degree +
        ' data-ring=outer x=' +
        number(outerLabelX) + ' y=' + number(outerLabelY) +
        ' text-anchor=middle dominant-baseline=middle>' + degree + '</text>' +
        '<text class=lia-dgs-set-square-degree-inner data-angle=' + degree +
        ' data-ring=inner x=' + number(innerLabelX) +
        ' y=' + number(innerLabelY) +
        ' text-anchor=middle dominant-baseline=middle>' + (180 - degree) + '</text>';
    }
  }

  let edgeAngleTicksMinor = '';
  let edgeAngleTicksMedium = '';
  let edgeAngleTicksMajor = '';
  for (let degree = 1; degree < 180; degree += 1) {
    const [edgeX, edgeY] = point(edgeRadius(degree), degree);
    const radians = degree * Math.PI / 180;
    const tickLength = degree % 10 === 0 ? 9 : (degree % 5 === 0 ? 6 : 3.5);
    const inwardX = -Math.cos(radians);
    const inwardY = -Math.sin(radians);
    const tick = 'M' + number(edgeX) + ',' + number(edgeY) +
      'L' + number(edgeX + inwardX * tickLength) + ',' +
      number(edgeY + inwardY * tickLength);
    if (degree % 10 === 0) edgeAngleTicksMajor += tick;
    else if (degree % 5 === 0) edgeAngleTicksMedium += tick;
    else edgeAngleTicksMinor += tick;
  }

  return [
    '<svg viewBox=0,0,' + DGS_SET_SQUARE_VIEW_WIDTH + ',' +
      DGS_SET_SQUARE_VIEW_HEIGHT + ' aria-hidden=true>',
    '<title class=lia-dgs-set-square-svg-title></title>',
    '<path class=lia-dgs-set-square-surface d=M10,34H590L300,334Z></path>',
    '<path class=lia-dgs-set-square-outline d=M10,34H590L300,334Z></path>',
    '<path class=lia-dgs-set-square-ruler-ticks d=' + rulerTicks + '></path>',
    '<g class=lia-dgs-set-square-ruler-labels>' + rulerLabels + '</g>',
    '<path class=lia-dgs-set-square-protractor-arc d=' + protractorArc + '></path>',
    '<path class=lia-dgs-set-square-protractor-rays d=' + protractorRays + '></path>',
    '<path class=lia-dgs-set-square-protractor-ticks d=' + protractorTicks + '></path>',
    '<path class=lia-dgs-set-square-edge-angle-ticks-minor d=' + edgeAngleTicksMinor + '></path>',
    '<path class=lia-dgs-set-square-edge-angle-ticks-medium d=' + edgeAngleTicksMedium + '></path>',
    '<path class=lia-dgs-set-square-edge-angle-ticks-major d=' + edgeAngleTicksMajor + '></path>',
    '<g class=lia-dgs-set-square-labels>' + protractorLabels + '</g>',
    '<path class=lia-dgs-set-square-guides d=M300,34V329></path>',
    '<line class=lia-dgs-set-square-accent-guide x1=300 y1=34 x2=152.54 y2=181.46></line>',
    '<line class=lia-dgs-set-square-accent-guide x1=300 y1=34 x2=447.46 y2=181.46></line>',
    '<path class=lia-dgs-set-square-zero d=M291,34H309M300,25V43></path>',
    '<circle class=lia-dgs-set-square-zero-dot cx=300 cy=34 r=3.2></circle>',
    '<g class=lia-dgs-set-square-scale-handle data-side=left>',
    '<circle class=lia-dgs-set-square-scale-hit cx=85 cy=72 r=22></circle>',
    '<circle class=lia-dgs-set-square-scale-ring cx=85 cy=72 r=11></circle>',
    '<path class=lia-dgs-set-square-scale-arrow d=M82,75L88,69></path>',
    '<path class=lia-dgs-set-square-handle-arrowhead d=M77.4,79.6L84.62,77.62L79.38,72.38Z></path>',
    '<path class=lia-dgs-set-square-handle-arrowhead d=M92.6,64.4L90.62,71.62L85.38,66.38Z></path>',
    '</g>',
    '<g class=lia-dgs-set-square-scale-handle data-side=right>',
    '<circle class=lia-dgs-set-square-scale-hit cx=515 cy=72 r=22></circle>',
    '<circle class=lia-dgs-set-square-scale-ring cx=515 cy=72 r=11></circle>',
    '<path class=lia-dgs-set-square-scale-arrow d=M512,69L518,75></path>',
    '<path class=lia-dgs-set-square-handle-arrowhead d=M507.4,64.4L509.38,71.62L514.62,66.38Z></path>',
    '<path class=lia-dgs-set-square-handle-arrowhead d=M522.6,79.6L515.38,77.62L520.62,72.38Z></path>',
    '</g>',
    '<g class=lia-dgs-set-square-rotate-handle>',
    '<circle class=lia-dgs-set-square-rotate-hit cx=300 cy=270 r=22></circle>',
    '<circle class=lia-dgs-set-square-rotate-ring cx=300 cy=270 r=11></circle>',
    '<path class=lia-dgs-set-square-rotate-arrow d=M306.75,273.9A7.8,7.8,0,0,1,293.25,273.9></path>',
    '<path class=lia-dgs-set-square-handle-arrowhead d=M309.4,269.31L309.35,275.4L304.15,272.4Z></path>',
    '<path class=lia-dgs-set-square-handle-arrowhead d=M290.6,269.31L295.85,272.4L290.65,275.4Z></path>',
    '</g>',
    '</svg>'
  ].join('');
}

const DGS_ZOOM_ICONS: Record<'both' | 'vertical' | 'horizontal', string> = {
  both: '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M12,3V21M9.5,5.5L12,3l2.5,2.5M9.5,18.5L12,21l2.5,-2.5M3,12H21M5.5,9.5L3,12l2.5,2.5M18.5,9.5L21,12l-2.5,2.5></path></svg>',
  vertical: '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M12,3V21M9,6L12,3l3,3M9,18l3,3l3,-3></path></svg>',
  horizontal: '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M3,12H21M6,9L3,12l3,3M18,9l3,3l-3,3></path></svg>'
};

const DGS_FULLSCREEN_ICONS: Record<'enter' | 'exit', string> = {
  enter: '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M9,4H4V9M15,4H20V9M4,15V20H9M20,15V20H15></path></svg>',
  exit: '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M4,9H9V4M20,9H15V4M4,15H9V20M20,15H15V20></path></svg>'
};

function getDgsFullscreenElement(state: DgsState): Element | null {
  try {
    const root = state.boardContainer.getRootNode?.() as Document | ShadowRoot;
    const rootElement = root && (root as any).fullscreenElement;
    if (rootElement) return rootElement;
  } catch (e) {}
  return document.fullscreenElement || (document as any).webkitFullscreenElement || null;
}

function isDgsFullscreen(state: DgsState): boolean {
  try { if (state.boardContainer.matches(':fullscreen')) return true; } catch (e) {}
  try { if (state.boardContainer.matches(':-webkit-full-screen')) return true; } catch (e) {}
  return getDgsFullscreenElement(state) === state.boardContainer;
}

function renderDgsFullscreenButton(state: DgsState): void {
  const active = isDgsFullscreen(state);
  const label = active ? dgsText(state.language).exitFullscreen : dgsText(state.language).enterFullscreen;
  state.boardContainer.classList.toggle('lia-dgs-fullscreen-active', active);
  state.fullscreenButton.innerHTML = DGS_FULLSCREEN_ICONS[active ? 'exit' : 'enter'];
  state.fullscreenButton.classList.toggle('is-active', active);
  state.fullscreenButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  state.fullscreenButton.setAttribute('aria-label', label);
  state.fullscreenButton.title = label;
}

function readDgsBoundingBox(state: DgsState): number[] | null {
  try {
    const bbox = state.board?.getBoundingBox?.();
    if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((value: unknown) => Number.isFinite(Number(value)))) {
      return bbox.map(Number);
    }
  } catch (e) {}
  return null;
}

function resizeDgsFullscreenBoard(state: DgsState): void {
  if (!isDgsFullscreen(state)) return;
  const rect = state.boardContainer.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || state.boardContainer.clientWidth || window.innerWidth || 1));
  const height = Math.max(1, Math.round(rect.height || state.boardContainer.clientHeight || window.innerHeight || 1));
  if (width === state.fullscreenRenderWidth && height === state.fullscreenRenderHeight) return;
  state.fullscreenRenderWidth = width;
  state.fullscreenRenderHeight = height;
  try { state.board?.resizeContainer?.(width, height, false, true); } catch (e) {}
  try { state.board?.fullUpdate?.(); } catch (e) {
    try { state.board?.update?.(); } catch (e2) {}
  }
  scheduleAxisSync(state);
  scheduleXAxisSync(state);
  scheduleDgsRootUpdate(state);
  refreshDgsSliderTypography(state);
  scheduleDgsSetSquareLayout(state, true);
  try { window.__refreshAllAxisTitles?.(); } catch (e) {}
}

function scheduleDgsFullscreenResize(state: DgsState): void {
  if (state.fullscreenResizeRAF != null) cancelAnimationFrame(state.fullscreenResizeRAF);
  let passes = 2;
  const resize = () => {
    state.fullscreenResizeRAF = undefined;
    resizeDgsFullscreenBoard(state);
    passes -= 1;
    if (passes > 0 && isDgsFullscreen(state)) {
      state.fullscreenResizeRAF = requestAnimationFrame(resize);
    }
  };
  state.fullscreenResizeRAF = requestAnimationFrame(resize);
}

function restoreDgsEmbeddedSize(state: DgsState): void {
  const snapshot = state.fullscreenSnapshot;
  if (!snapshot) {
    if (state.board) state.board.__liaDgsFullscreenActive = false;
    return;
  }
  if (state.fullscreenResizeRAF != null) {
    cancelAnimationFrame(state.fullscreenResizeRAF);
    state.fullscreenResizeRAF = undefined;
  }
  if (state.fullscreenReleaseTimer != null) window.clearTimeout(state.fullscreenReleaseTimer);
  const container = state.boardContainer;
  const boundingBox = readDgsBoundingBox(state) || snapshot.boundingBox;
  container.classList.remove('lia-dgs-fullscreen-active');
  if (snapshot.widthStyle) container.style.width = snapshot.widthStyle;
  else container.style.removeProperty('width');
  if (snapshot.heightStyle) container.style.height = snapshot.heightStyle;
  else container.style.removeProperty('height');
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || snapshot.width));
  const height = Math.max(1, Math.round(rect.height || snapshot.height));
  if (state.board) state.board.__restoreLockUntil = Date.now() + 500;
  try { state.board?.resizeContainer?.(width, height, false, true); } catch (e) {}
  if (snapshot.widthStyle) container.style.width = snapshot.widthStyle;
  else container.style.removeProperty('width');
  if (snapshot.heightStyle) container.style.height = snapshot.heightStyle;
  else container.style.removeProperty('height');
  if (boundingBox) {
    try { state.board?.setBoundingBox?.(boundingBox.slice(), true); } catch (e) {}
  }
  try { state.board?.fullUpdate?.(); } catch (e) {
    try { state.board?.update?.(); } catch (e2) {}
  }
  state.fullscreenSnapshot = null;
  state.fullscreenRenderWidth = 0;
  state.fullscreenRenderHeight = 0;
  scheduleAxisSync(state);
  scheduleXAxisSync(state);
  scheduleDgsRootUpdate(state);
  refreshDgsSliderTypography(state);
  scheduleDgsSetSquareLayout(state, true);
  try { window.__refreshAllAxisTitles?.(); } catch (e) {}
  if (boundingBox) {
    window.__coordBoardStates = window.__coordBoardStates || {};
    const previousState = window.__coordBoardStates[state.boardId] || {};
    const manualWidth = Number(state.board?.__manualWidth);
    const manualHeight = Number(state.board?.__manualHeight);
    const keepManualSize = previousState.sizeMode === 'manual' &&
      Number.isFinite(manualWidth) && manualWidth > 0 &&
      Number.isFinite(manualHeight) && manualHeight > 0;
    window.__coordBoardStates[state.boardId] = {
      ...previousState,
      width: keepManualSize ? Math.round(manualWidth) : width,
      height: keepManualSize ? Math.round(manualHeight) : height,
      bbox: boundingBox.slice()
    };
  }
  state.fullscreenReleaseTimer = window.setTimeout(() => {
    state.fullscreenReleaseTimer = undefined;
    if (!isDgsFullscreen(state) && state.board) state.board.__liaDgsFullscreenActive = false;
  }, 120);
}

function handleDgsFullscreenChange(state: DgsState): void {
  if (isDgsFullscreen(state)) {
    if (state.fullscreenReleaseTimer != null) {
      window.clearTimeout(state.fullscreenReleaseTimer);
      state.fullscreenReleaseTimer = undefined;
    }
    if (state.board) state.board.__liaDgsFullscreenActive = true;
    scheduleDgsFullscreenResize(state);
  } else if (state.fullscreenSnapshot) {
    restoreDgsEmbeddedSize(state);
  } else if (state.board && state.fullscreenReleaseTimer == null) {
    state.board.__liaDgsFullscreenActive = false;
  }
  renderDgsFullscreenButton(state);
}

async function toggleDgsFullscreen(state: DgsState): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const container = state.boardContainer as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (isDgsFullscreen(state)) {
      if (typeof document.exitFullscreen === 'function') await document.exitFullscreen();
      else if (typeof doc.webkitExitFullscreen === 'function') await doc.webkitExitFullscreen();
      handleDgsFullscreenChange(state);
      return;
    }
    const rect = container.getBoundingClientRect();
    state.fullscreenSnapshot = {
      widthStyle: container.style.width,
      heightStyle: container.style.height,
      width: Math.max(1, Math.round(rect.width || container.clientWidth || 1)),
      height: Math.max(1, Math.round(rect.height || container.clientHeight || 1)),
      boundingBox: readDgsBoundingBox(state)
    };
    state.fullscreenRenderWidth = 0;
    state.fullscreenRenderHeight = 0;
    if (state.board) state.board.__liaDgsFullscreenActive = true;
    if (typeof container.requestFullscreen === 'function') await container.requestFullscreen();
    else if (typeof container.webkitRequestFullscreen === 'function') await container.webkitRequestFullscreen();
    else throw new Error('Fullscreen API is unavailable');
    handleDgsFullscreenChange(state);
  } catch (error) {
    if (!isDgsFullscreen(state)) {
      state.fullscreenSnapshot = null;
      if (state.board) state.board.__liaDgsFullscreenActive = false;
    }
    renderDgsFullscreenButton(state);
    try { console.warn('[lia-coordinate] DGS fullscreen request failed.', error); } catch (e) {}
  }
}

const DGS_AXIS_SCALE_ICONS: Record<DgsAxisScaleMode, string> = {
  cartesian: '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M4,20V4M4,20H21M2.5,6L4,4l1.5,2M19,18.5L21,20l-2,1.5></path><text class=lia-dgs-axis-scale-label x=6 y=9>lin</text><text class=lia-dgs-axis-scale-label x=11 y=17>lin</text></svg>',
  'log-x': '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M4,20V4M4,20H21M2.5,6L4,4l1.5,2M19,18.5L21,20l-2,1.5></path><text class=lia-dgs-axis-scale-label x=6 y=9>lin</text><text class=lia-dgs-axis-scale-label x=10 y=17>log</text></svg>',
  'log-y': '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M4,20V4M4,20H21M2.5,6L4,4l1.5,2M19,18.5L21,20l-2,1.5></path><text class=lia-dgs-axis-scale-label x=6 y=9>log</text><text class=lia-dgs-axis-scale-label x=11 y=17>lin</text></svg>',
  'log-log': '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M4,20V4M4,20H21M2.5,6L4,4l1.5,2M19,18.5L21,20l-2,1.5></path><text class=lia-dgs-axis-scale-label x=6 y=9>log</text><text class=lia-dgs-axis-scale-label x=10 y=17>log</text></svg>'
};

function normalizeDgsAxisScaleMode(value: unknown): DgsAxisScaleMode {
  return value === 'log-x' || value === 'log-y' || value === 'log-log' ? value : 'cartesian';
}

function dgsAxisUsesLogX(mode: DgsAxisScaleMode): boolean {
  return mode === 'log-x' || mode === 'log-log';
}

function dgsAxisUsesLogY(mode: DgsAxisScaleMode): boolean {
  return mode === 'log-y' || mode === 'log-log';
}

function getDgsAxisScaleLabel(state: DgsState, mode: DgsAxisScaleMode): string {
  const text = dgsText(state.language);
  if (mode === 'log-x') return text.logXScale;
  if (mode === 'log-y') return text.logYScale;
  if (mode === 'log-log') return text.logLogScale;
  return text.cartesianScale;
}

function normalizeDgsZoomMode(value: unknown): 'both' | 'vertical' | 'horizontal' {
  return value === 'vertical' || value === 'horizontal' ? value : 'both';
}

function renderDgsZoomMode(state: DgsState): void {
  const text = dgsText(state.language);
  const label = state.zoomMode === 'vertical'
    ? text.zoomVertical
    : (state.zoomMode === 'horizontal' ? text.zoomHorizontal : text.zoomBoth);
  state.zoomModeButton.innerHTML = DGS_ZOOM_ICONS[state.zoomMode];
  state.zoomModeButton.setAttribute('aria-label', label);
  state.zoomModeButton.title = label;
  state.zoomModeButton.dataset.mode = state.zoomMode;
}

function installDgsZoomModeHooks(board: any): void {
  if (!board || board.__liaDgsZoomModeHooksInstalled ||
      typeof board.zoomIn !== 'function' || typeof board.zoomOut !== 'function') return;
  const originalZoomIn = board.zoomIn;
  const originalZoomOut = board.zoomOut;
  const invokeZoom = (method: Function, args: any[]) => {
    const mode = normalizeDgsZoomMode(board.__liaDgsZoomMode);
    if (mode === 'both' || !board.attr || !board.attr.zoom) return method.apply(board, args);
    const zoom = board.attr.zoom;
    const factorX = zoom.factorx;
    const factorY = zoom.factory;
    const keepAspectRatio = board.keepaspectratio;
    if (mode === 'vertical') zoom.factorx = 1;
    else zoom.factory = 1;
    board.keepaspectratio = false;
    try {
      return method.apply(board, args);
    } finally {
      zoom.factorx = factorX;
      zoom.factory = factorY;
      board.keepaspectratio = keepAspectRatio;
    }
  };
  board.zoomIn = function(...args: any[]) { return invokeZoom(originalZoomIn, args); };
  board.zoomOut = function(...args: any[]) { return invokeZoom(originalZoomOut, args); };
  board.__liaDgsZoomModeHooksInstalled = true;
}

function setDgsZoomMode(state: DgsState, mode: unknown, save = true): void {
  state.zoomMode = normalizeDgsZoomMode(mode);
  if (state.board) {
    state.board.__liaDgsZoomMode = state.zoomMode;
    installDgsZoomModeHooks(state.board);
  }
  if (save) {
    window.__coordBoardStates = window.__coordBoardStates || {};
    window.__coordBoardStates[state.boardId] = {
      ...(window.__coordBoardStates[state.boardId] || {}),
      zoomMode: state.zoomMode
    };
  }
  renderDgsZoomMode(state);
}

function formatDgsLogTickLabel(exponent: number, language: 'de' | 'en'): string {
  if (!Number.isFinite(exponent)) return '';
  const roundedExponent = Math.round(exponent);
  if (Math.abs(exponent - roundedExponent) < 1e-8) {
    if (roundedExponent >= -4 && roundedExponent <= 6) {
      const value = Math.pow(10, roundedExponent);
      const text = roundedExponent < 0 ? value.toFixed(-roundedExponent) : String(value);
      return language === 'de' ? text.replace('.', ',') : text;
    }
    const superscript: Record<string, string> = {
      '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
    };
    return '10' + String(roundedExponent).split('').map((char) => superscript[char] || char).join('');
  }
  const value = Math.pow(10, exponent);
  if (!Number.isFinite(value)) return '';
  const text = value.toPrecision(3).replace(/(?:\.0+|(?:(\.\d*?)0+))(?=e|$)/, '$1');
  return language === 'de' ? text.replace('.', ',') : text;
}

function applyDgsLogTickGenerator(state: DgsState, axis: any, key: 'x' | 'y', logarithmic: boolean): void {
  const ticks = axis && axis.defaultTicks;
  if (!ticks) return;
  if (!('__liaDgsOriginalGenerateLabelText' in ticks)) {
    ticks.__liaDgsOriginalGenerateLabelText = ticks.generateLabelText;
  }
  if (logarithmic) {
    ticks.generateLabelText = function(tick: any, zero: any) {
      const index = key === 'x' ? 1 : 2;
      const exponent = Number(tick?.usrCoords?.[index]) - Number(zero?.usrCoords?.[index]);
      return formatDgsLogTickLabel(exponent, state.language);
    };
  } else {
    ticks.generateLabelText = ticks.__liaDgsOriginalGenerateLabelText;
  }
  ticks.needsUpdate = true;
}

function createDgsPlottedFunctionEvaluator(
  state: DgsState,
  evaluator: (x: number) => number
): (coordinate: number) => number {
  return (coordinate: number) => {
    const physicalX = dgsAxisUsesLogX(state.axisScaleMode) ? Math.pow(10, coordinate) : coordinate;
    const physicalY = Number(evaluator(physicalX));
    if (!Number.isFinite(physicalY)) return NaN;
    if (!dgsAxisUsesLogY(state.axisScaleMode)) return physicalY;
    return physicalY > 0 ? Math.log10(physicalY) : NaN;
  };
}

function refreshDgsFunctionAxisScaling(state: DgsState): void {
  getDgsBoardObjects(state.board).filter(isDgsFunction).forEach((graph) => {
    if (typeof graph.__liaDgsFunctionEvaluator !== 'function' && typeof graph.Y === 'function') {
      graph.__liaDgsFunctionEvaluator = graph.Y;
    }
    if (typeof graph.__liaDgsFunctionEvaluator !== 'function') return;
    graph.Y = createDgsPlottedFunctionEvaluator(state, graph.__liaDgsFunctionEvaluator);
    graph.needsUpdate = true;
    try { graph.updateCurve?.(); } catch (e) {}
  });
}

function renderDgsAxisScaleMode(state: DgsState): void {
  const label = getDgsAxisScaleLabel(state, state.axisScaleMode);
  state.axisScaleButton.innerHTML = DGS_AXIS_SCALE_ICONS[state.axisScaleMode];
  state.axisScaleButton.setAttribute('aria-label', dgsText(state.language).axisScale + ': ' + label);
  state.axisScaleButton.title = label;
  state.axisScaleButton.dataset.mode = state.axisScaleMode;
  const buttons: Array<[HTMLButtonElement, DgsAxisScaleMode]> = [
    [state.cartesianScaleButton, 'cartesian'],
    [state.logXScaleButton, 'log-x'],
    [state.logYScaleButton, 'log-y'],
    [state.logLogScaleButton, 'log-log']
  ];
  buttons.forEach(([button, mode]) => {
    const active = state.axisScaleMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function setDgsAxisScaleMode(state: DgsState, modeValue: unknown, save = true): void {
  state.axisScaleMode = normalizeDgsAxisScaleMode(modeValue);
  if (state.board) state.board.__liaDgsAxisScaleMode = state.axisScaleMode;
  applyDgsLogTickGenerator(state, state.xAxis, 'x', dgsAxisUsesLogX(state.axisScaleMode));
  applyDgsLogTickGenerator(state, state.yAxis, 'y', dgsAxisUsesLogY(state.axisScaleMode));
  refreshDgsFunctionAxisScaling(state);
  scheduleDgsRootUpdate(state);
  renderDgsAxisScaleMode(state);
  if (save) {
    window.__coordBoardStates = window.__coordBoardStates || {};
    window.__coordBoardStates[state.boardId] = {
      ...(window.__coordBoardStates[state.boardId] || {}),
      axisScaleMode: state.axisScaleMode
    };
  }
  try { state.board?.fullUpdate?.(); } catch (e) {
    try { state.board?.update?.(); } catch (e2) {}
  }
}

const states: Record<string, DgsState> = {};

type DgsInstrumentKind = 'compass' | 'set-square';

type DgsInstrumentRequest = {
  uid: string;
  boardId: string;
  kind: DgsInstrumentKind;
  language?: string;
  anchor: HTMLElement | null;
  appliedState: DgsState | null;
};

const dgsInstrumentRequests: Record<string, DgsInstrumentRequest> = {};

type DgsRegressionRequest = {
  uid: string;
  boardId: string;
  language?: string;
  anchor: HTMLElement;
};

const dgsRegressionRequests: Record<string, DgsRegressionRequest> = {};

type DgsSetSquareStoredPose = {
  visible: boolean;
  initialized: boolean;
  pivotXRatio: number;
  pivotYRatio: number;
  angle: number;
  scale: number;
};

function normalizeDgsSetSquareAngle(value: unknown): number {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

function normalizeDgsSetSquareScale(value: unknown): number {
  const scale = Number(value);
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.35, Math.min(2, scale));
}

function readDgsSetSquarePose(boardId: string): DgsSetSquareStoredPose {
  const raw = window.__coordBoardStates &&
    window.__coordBoardStates[boardId] &&
    (window.__coordBoardStates[boardId] as any).dgsSetSquare;
  const hasX = Number.isFinite(Number(raw && raw.pivotXRatio));
  const hasY = Number.isFinite(Number(raw && raw.pivotYRatio));
  return {
    visible: !!(raw && raw.visible),
    initialized: !!(raw && raw.initialized && hasX && hasY),
    pivotXRatio: hasX ? Number(raw.pivotXRatio) : 0.5,
    pivotYRatio: hasY ? Number(raw.pivotYRatio) : 0.22,
    angle: normalizeDgsSetSquareAngle(raw && raw.angle),
    scale: normalizeDgsSetSquareScale(raw && raw.scale)
  };
}

function persistDgsSetSquarePose(state: DgsState): void {
  const width = state.boardContainer.clientWidth;
  const height = state.boardContainer.clientHeight;
  if (state.setSquareInitialized && width > 0 && height > 0) {
    state.setSquarePivotXRatio = state.setSquarePivotX / width;
    state.setSquarePivotYRatio = state.setSquarePivotY / height;
  }
  window.__coordBoardStates = window.__coordBoardStates || {};
  const previous = window.__coordBoardStates[state.boardId] || {};
  window.__coordBoardStates[state.boardId] = {
    ...previous,
    dgsSetSquare: {
      visible: state.setSquareVisible,
      initialized: state.setSquareInitialized,
      pivotXRatio: state.setSquarePivotXRatio,
      pivotYRatio: state.setSquarePivotYRatio,
      angle: normalizeDgsSetSquareAngle(state.setSquareAngle),
      scale: normalizeDgsSetSquareScale(state.setSquareScale)
    }
  };
}

function getDgsSetSquareScaleBounds(containerWidth: number): {
  baseWidth: number;
  minScale: number;
  maxScale: number;
} {
  const availableWidth = Math.max(80, containerWidth - 16);
  const baseWidth = Math.min(520, availableWidth);
  const minWidth = Math.min(baseWidth, Math.max(140, baseWidth * 0.45));
  const maxWidth = Math.max(baseWidth, Math.min(900, availableWidth));
  return {
    baseWidth,
    minScale: minWidth / baseWidth,
    maxScale: maxWidth / baseWidth
  };
}

function getDgsSetSquareSizing(state: DgsState, containerWidth: number): {
  width: number;
  scale: number;
} {
  const bounds = getDgsSetSquareScaleBounds(containerWidth);
  const scale = Math.max(
    bounds.minScale,
    Math.min(bounds.maxScale, normalizeDgsSetSquareScale(state.setSquareScale))
  );
  return { width: bounds.baseWidth * scale, scale };
}

type DgsSetSquareScreenPoint = [number, number];

function dgsSetSquarePolygonArea(points: DgsSetSquareScreenPoint[]): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) * 0.5;
}

function clipDgsSetSquarePolygonAtBoundary(
  polygon: DgsSetSquareScreenPoint[],
  isInside: (point: DgsSetSquareScreenPoint) => boolean,
  intersect: (
    from: DgsSetSquareScreenPoint,
    to: DgsSetSquareScreenPoint
  ) => DgsSetSquareScreenPoint
): DgsSetSquareScreenPoint[] {
  if (!polygon.length) return [];
  const clipped: DgsSetSquareScreenPoint[] = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = isInside(previous);
  polygon.forEach((current) => {
    const currentInside = isInside(current);
    if (currentInside !== previousInside) clipped.push(intersect(previous, current));
    if (currentInside) clipped.push(current);
    previous = current;
    previousInside = currentInside;
  });
  return clipped;
}

function getDgsSetSquareVisibleFraction(
  pivotX: number,
  pivotY: number,
  scale: number,
  angle: number,
  containerWidth: number,
  containerHeight: number
): number {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let polygon: DgsSetSquareScreenPoint[] = [
    [-290 * scale, 0],
    [290 * scale, 0],
    [0, 300 * scale]
  ].map(([x, y]) => [
    pivotX + x * cos - y * sin,
    pivotY + x * sin + y * cos
  ] as DgsSetSquareScreenPoint);
  const totalArea = dgsSetSquarePolygonArea(polygon);
  if (!(totalArea > 1e-9)) return 0;

  const clipAtX = (boundary: number) => (
    from: DgsSetSquareScreenPoint,
    to: DgsSetSquareScreenPoint
  ): DgsSetSquareScreenPoint => {
    const delta = to[0] - from[0];
    const ratio = Math.abs(delta) > 1e-12 ? (boundary - from[0]) / delta : 0;
    return [boundary, from[1] + (to[1] - from[1]) * ratio];
  };
  const clipAtY = (boundary: number) => (
    from: DgsSetSquareScreenPoint,
    to: DgsSetSquareScreenPoint
  ): DgsSetSquareScreenPoint => {
    const delta = to[1] - from[1];
    const ratio = Math.abs(delta) > 1e-12 ? (boundary - from[1]) / delta : 0;
    return [from[0] + (to[0] - from[0]) * ratio, boundary];
  };

  polygon = clipDgsSetSquarePolygonAtBoundary(polygon, (point) => point[0] >= 0, clipAtX(0));
  polygon = clipDgsSetSquarePolygonAtBoundary(
    polygon,
    (point) => point[0] <= containerWidth,
    clipAtX(containerWidth)
  );
  polygon = clipDgsSetSquarePolygonAtBoundary(polygon, (point) => point[1] >= 0, clipAtY(0));
  polygon = clipDgsSetSquarePolygonAtBoundary(
    polygon,
    (point) => point[1] <= containerHeight,
    clipAtY(containerHeight)
  );
  return Math.max(0, Math.min(1, dgsSetSquarePolygonArea(polygon) / totalArea));
}

function constrainDgsSetSquarePivot(
  state: DgsState,
  proposedX: number,
  proposedY: number,
  scale: number,
  angle: number
): { x: number; y: number; visibleFraction: number } {
  const width = state.boardContainer.clientWidth;
  const height = state.boardContainer.clientHeight;
  const radians = angle * Math.PI / 180;
  const centroidOffsetX = -100 * scale * Math.sin(radians);
  const centroidOffsetY = 100 * scale * Math.cos(radians);
  const centeredX = width * 0.5 - centroidOffsetX;
  const centeredY = height * 0.5 - centroidOffsetY;
  const targetX = Number.isFinite(proposedX) ? proposedX : centeredX;
  const targetY = Number.isFinite(proposedY) ? proposedY : centeredY;
  const visibleAt = (x: number, y: number): number => getDgsSetSquareVisibleFraction(
    x,
    y,
    scale,
    angle,
    width,
    height
  );
  const targetVisible = visibleAt(targetX, targetY);
  if (targetVisible >= DGS_SET_SQUARE_MIN_VISIBLE_FRACTION) {
    return { x: targetX, y: targetY, visibleFraction: targetVisible };
  }

  let anchorX = centeredX;
  let anchorY = centeredY;
  let anchorVisible = visibleAt(anchorX, anchorY);
  if (state.setSquareInteraction === 'move') {
    const startX = state.setSquareStartPivotX;
    const startY = state.setSquareStartPivotY;
    const startVisible = visibleAt(startX, startY);
    if (startVisible >= DGS_SET_SQUARE_MIN_VISIBLE_FRACTION) {
      anchorX = startX;
      anchorY = startY;
      anchorVisible = startVisible;
    }
  }
  if (anchorVisible < DGS_SET_SQUARE_MIN_VISIBLE_FRACTION) {
    return { x: anchorX, y: anchorY, visibleFraction: anchorVisible };
  }

  let validRatio = 0;
  let invalidRatio = 1;
  let visibleFraction = anchorVisible;
  for (let index = 0; index < 28; index += 1) {
    const ratio = (validRatio + invalidRatio) * 0.5;
    const x = anchorX + (targetX - anchorX) * ratio;
    const y = anchorY + (targetY - anchorY) * ratio;
    const visible = visibleAt(x, y);
    if (visible >= DGS_SET_SQUARE_MIN_VISIBLE_FRACTION) {
      validRatio = ratio;
      visibleFraction = visible;
    } else {
      invalidRatio = ratio;
    }
  }
  return {
    x: anchorX + (targetX - anchorX) * validRatio,
    y: anchorY + (targetY - anchorY) * validRatio,
    visibleFraction
  };
}

function formatDgsSetSquareRulerValue(
  value: number,
  step: number,
  language: 'de' | 'en'
): string {
  const normalized = Math.abs(value) < Math.abs(step) * 1e-8 ? 0 : Math.abs(value);
  let label: string;
  if ((normalized >= 1e6 || (normalized > 0 && normalized < 1e-4))) {
    label = normalized.toExponential(2).replace(/(?:\.0+|(?:(\.\d*?)0+))e/, '$1e');
  } else {
    const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(Math.abs(step)) + 1e-12)));
    label = normalized.toFixed(decimals).replace(/\.0+$|(?:(\.\d*?)0+)$/, '$1');
  }
  return language === 'de' ? label.replace('.', ',') : label;
}

function renderDgsSetSquareRuler(
  state: DgsState,
  toolWidth: number,
  angle: number
): void {
  const board = state.board;
  let unitX = Math.abs(Number(board && board.unitX));
  let unitY = Math.abs(Number(board && board.unitY));
  if (!(unitX > 1e-9) || !Number.isFinite(unitX)) unitX = 50;
  if (!(unitY > 1e-9) || !Number.isFinite(unitY)) unitY = unitX;

  const radians = angle * Math.PI / 180;
  const coordinateUnitsPerPixel = Math.hypot(
    Math.cos(radians) / unitX,
    Math.sin(radians) / unitY
  );
  if (!(coordinateUnitsPerPixel > 0) || !Number.isFinite(coordinateUnitsPerPixel)) return;

  const effectivePixelsPerUnit = 1 / coordinateUnitsPerPixel;
  const rulerMetric = getAdaptiveTickMetric(effectivePixelsPerUnit);
  const majorStep = rulerMetric.majorStep;
  const majorPixels = rulerMetric.pixelsPerMajor;
  const scale = toolWidth / DGS_SET_SQUARE_VIEW_WIDTH;
  const majorView = majorPixels / scale;
  const axisSubdivisions = rulerMetric.minorTicks + 1;
  const subdivisions = Math.max(10, axisSubdivisions * 2);
  const minorView = majorView / subdivisions;
  const signature = [
    unitX.toPrecision(7),
    unitY.toPrecision(7),
    angle.toFixed(3),
    toolWidth.toFixed(2),
    majorStep.toPrecision(7),
    axisSubdivisions,
    subdivisions,
    state.language
  ].join('|');
  if (state.setSquareRulerSignature === signature) return;

  const ticks = state.setSquareOverlay.querySelector<SVGPathElement>(
    '.lia-dgs-set-square-ruler-ticks'
  );
  const labels = state.setSquareOverlay.querySelector<SVGGElement>(
    '.lia-dgs-set-square-ruler-labels'
  );
  if (!ticks || !labels) return;

  const halfWidth = 278;
  let path = '';
  let markup = '';
  const firstIndex = Math.ceil(-halfWidth / minorView);
  const lastIndex = Math.floor(halfWidth / minorView);
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const x = DGS_SET_SQUARE_PIVOT_X + index * minorView;
    const isMajor = index % subdivisions === 0;
    const isHalf = !isMajor && subdivisions % 2 === 0 &&
      Math.abs(index % subdivisions) === subdivisions / 2;
    const quarterRemainder = Math.abs(index % subdivisions);
    const isQuarter = !isMajor && !isHalf && subdivisions % 4 === 0 &&
      (quarterRemainder === subdivisions / 4 || quarterRemainder === subdivisions * 3 / 4);
    const tickLength = isMajor ? 18 : (isHalf ? 13 : (isQuarter ? 10 : 6));
    path += 'M' + x.toFixed(2) + ',' + DGS_SET_SQUARE_PIVOT_Y +
      'V' + (DGS_SET_SQUARE_PIVOT_Y + tickLength);
    if (isMajor) {
      const majorIndex = index / subdivisions;
      const value = majorIndex * majorStep;
      markup += '<text class=lia-dgs-set-square-ruler-number x=' + x.toFixed(2) +
        ' y=68 text-anchor=middle data-value=' + String(value) + '>' +
        formatDgsSetSquareRulerValue(value, majorStep, state.language) +
        '</text>';
    }
  }

  ticks.setAttribute('d', path);
  labels.innerHTML = markup;
  state.setSquareOverlay.dataset.rulerStep = String(majorStep);
  state.setSquareOverlay.dataset.rulerMajorPixels = String(majorPixels);
  state.setSquareOverlay.dataset.rulerUnitsPerPixel = String(coordinateUnitsPerPixel);
  state.setSquareOverlay.dataset.rulerAxisMinorTicks = String(rulerMetric.minorTicks);
  state.setSquareOverlay.dataset.rulerMinorTicks = String(subdivisions - 1);
  state.setSquareOverlay.dataset.rulerSubdivisions = String(subdivisions);
  state.setSquareRulerSignature = signature;
}

function layoutDgsSetSquare(state: DgsState, fromRatios = false): boolean {
  const containerWidth = state.boardContainer.clientWidth;
  const containerHeight = state.boardContainer.clientHeight;
  if (!(containerWidth > 0) || !(containerHeight > 0)) return false;

  const sizing = getDgsSetSquareSizing(state, containerWidth);
  const toolWidth = sizing.width;
  const scale = toolWidth / DGS_SET_SQUARE_VIEW_WIDTH;
  const containerChanged =
    state.setSquareLastContainerWidth !== containerWidth ||
    state.setSquareLastContainerHeight !== containerHeight;
  if (!state.setSquareInitialized) {
    state.setSquarePivotX = containerWidth * 0.5;
    state.setSquarePivotY = Math.max(
      12 + DGS_SET_SQUARE_PIVOT_Y * scale,
      Math.min(containerHeight * 0.24, MENU_HEIGHT_PX + 100)
    );
    state.setSquarePivotXRatio = state.setSquarePivotX / containerWidth;
    state.setSquarePivotYRatio = state.setSquarePivotY / containerHeight;
    state.setSquareInitialized = true;
  } else if (
    fromRatios ||
    containerChanged
  ) {
    state.setSquarePivotX = state.setSquarePivotXRatio * containerWidth;
    state.setSquarePivotY = state.setSquarePivotYRatio * containerHeight;
  }

  const angle = normalizeDgsSetSquareAngle(state.setSquareAngle);
  state.setSquareAngle = angle;
  renderDgsSetSquareRuler(state, toolWidth, angle);
  const constrainedPivot = constrainDgsSetSquarePivot(
    state,
    state.setSquarePivotX,
    state.setSquarePivotY,
    scale,
    angle
  );
  state.setSquarePivotX = constrainedPivot.x;
  state.setSquarePivotY = constrainedPivot.y;
  state.setSquarePivotXRatio = state.setSquarePivotX / containerWidth;
  state.setSquarePivotYRatio = state.setSquarePivotY / containerHeight;
  state.setSquareLastContainerWidth = containerWidth;
  state.setSquareLastContainerHeight = containerHeight;

  const pivotLeft = DGS_SET_SQUARE_PIVOT_X * scale;
  const pivotTop = DGS_SET_SQUARE_PIVOT_Y * scale;
  state.setSquareOverlay.style.width = toolWidth + 'px';
  state.setSquareOverlay.style.left = (state.setSquarePivotX - pivotLeft) + 'px';
  state.setSquareOverlay.style.top = (state.setSquarePivotY - pivotTop) + 'px';
  state.setSquareOverlay.style.transformOrigin = pivotLeft + 'px ' + pivotTop + 'px';
  state.setSquareOverlay.style.transform = 'rotate(' + angle + 'deg)';
  state.setSquareOverlay.dataset.visible = state.setSquareVisible ? '1' : '0';
  state.setSquareOverlay.classList.toggle('is-visible', state.setSquareVisible);
  state.setSquareOverlay.dataset.angle = String(angle);
  state.setSquareOverlay.dataset.scale = String(sizing.scale);
  state.setSquareOverlay.dataset.toolWidth = String(toolWidth);
  state.setSquareOverlay.dataset.pivotX = String(state.setSquarePivotX);
  state.setSquareOverlay.dataset.pivotY = String(state.setSquarePivotY);
  state.setSquareOverlay.dataset.visibleFraction = constrainedPivot.visibleFraction.toFixed(6);
  state.setSquareOverlay.setAttribute('aria-hidden', state.setSquareVisible ? 'false' : 'true');
  return true;
}

function scheduleDgsSetSquareLayout(state: DgsState, fromRatios = true): void {
  if (state.setSquareLayoutRAF != null) cancelAnimationFrame(state.setSquareLayoutRAF);
  state.setSquareLayoutRAF = requestAnimationFrame(() => {
    state.setSquareLayoutRAF = undefined;
    layoutDgsSetSquare(state, fromRatios);
  });
}

function setDgsSetSquareVisible(state: DgsState, visible: boolean): void {
  if (!visible) cancelDgsSetSquareInteraction(state);
  state.setSquareVisible = visible;
  layoutDgsSetSquare(state, false);
  persistDgsSetSquarePose(state);
  renderToolState(state);
}

function bindDgsSetSquareInteraction(state: DgsState): void {
  const overlay = state.setSquareOverlay;
  const pointerPosition = (evt: PointerEvent): { x: number; y: number } => {
    const rect = state.boardContainer.getBoundingClientRect();
    const layoutWidth = state.boardContainer.offsetWidth || state.boardContainer.clientWidth || 1;
    const layoutHeight = state.boardContainer.offsetHeight || state.boardContainer.clientHeight || 1;
    const scaleX = rect.width > 1e-9 ? rect.width / layoutWidth : 1;
    const scaleY = rect.height > 1e-9 ? rect.height / layoutHeight : 1;
    return {
      x: (evt.clientX - rect.left) / scaleX - state.boardContainer.clientLeft,
      y: (evt.clientY - rect.top) / scaleY - state.boardContainer.clientTop
    };
  };
  const pointerAngle = (evt: PointerEvent): number => {
    const pointer = pointerPosition(evt);
    return Math.atan2(
      pointer.y - state.setSquarePivotY,
      pointer.x - state.setSquarePivotX
    ) * 180 / Math.PI;
  };
  const pointerDistance = (evt: PointerEvent): number => {
    const pointer = pointerPosition(evt);
    return Math.hypot(
      pointer.x - state.setSquarePivotX,
      pointer.y - state.setSquarePivotY
    );
  };
  const stop = (evt: PointerEvent): void => {
    evt.preventDefault();
    evt.stopImmediatePropagation();
  };
  const finish = (evt: PointerEvent): void => {
    if (state.setSquarePointerId == null || evt.pointerId !== state.setSquarePointerId) return;
    const pointerId = state.setSquarePointerId;
    state.setSquarePointerId = null;
    state.setSquareInteraction = null;
    overlay.removeAttribute('data-interaction');
    try {
      if (overlay.hasPointerCapture(pointerId)) overlay.releasePointerCapture(pointerId);
    } catch (e) {}
    persistDgsSetSquarePose(state);
    if (evt.type !== 'lostpointercapture') stop(evt);
  };

  overlay.addEventListener('pointerdown', (evt) => {
    if (!state.setSquareVisible || state.setSquarePointerId != null) return;
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;
    const target = evt.target as Element;
    const rotate = !!target.closest('.lia-dgs-set-square-rotate-hit');
    const scaleHandle = !!target.closest('.lia-dgs-set-square-scale-hit');
    const surface = !!target.closest('.lia-dgs-set-square-surface');
    if (!rotate && !scaleHandle && !surface) return;
    stop(evt);
    if (scaleHandle) {
      const currentSizing = getDgsSetSquareSizing(
        state,
        state.boardContainer.clientWidth
      );
      state.setSquareScale = currentSizing.scale;
    }
    const pointer = pointerPosition(evt);
    state.setSquarePointerId = evt.pointerId;
    state.setSquareInteraction = rotate ? 'rotate' : (scaleHandle ? 'scale' : 'move');
    state.setSquareStartClientX = pointer.x;
    state.setSquareStartClientY = pointer.y;
    state.setSquareStartPivotX = state.setSquarePivotX;
    state.setSquareStartPivotY = state.setSquarePivotY;
    state.setSquareStartAngle = state.setSquareAngle;
    state.setSquareStartPointerAngle = pointerAngle(evt);
    state.setSquareStartScale = state.setSquareScale;
    state.setSquareStartPointerDistance = pointerDistance(evt);
    overlay.dataset.interaction = state.setSquareInteraction;
    try { overlay.setPointerCapture(evt.pointerId); } catch (e) {}
  });

  overlay.addEventListener('pointermove', (evt) => {
    if (state.setSquarePointerId == null || evt.pointerId !== state.setSquarePointerId) return;
    stop(evt);
    if (state.setSquareInteraction === 'move') {
      const pointer = pointerPosition(evt);
      state.setSquarePivotX = state.setSquareStartPivotX +
        (pointer.x - state.setSquareStartClientX);
      state.setSquarePivotY = state.setSquareStartPivotY +
        (pointer.y - state.setSquareStartClientY);
    } else if (state.setSquareInteraction === 'rotate') {
      let angle = state.setSquareStartAngle +
        normalizeDgsSetSquareAngle(pointerAngle(evt) - state.setSquareStartPointerAngle);
      if (evt.shiftKey) angle = Math.round(angle / 5) * 5;
      state.setSquareAngle = normalizeDgsSetSquareAngle(angle);
    } else if (state.setSquareInteraction === 'scale') {
      const distance = pointerDistance(evt);
      if (state.setSquareStartPointerDistance > 1 && Number.isFinite(distance)) {
        const bounds = getDgsSetSquareScaleBounds(state.boardContainer.clientWidth);
        const scale = state.setSquareStartScale *
          distance / state.setSquareStartPointerDistance;
        state.setSquareScale = Math.max(bounds.minScale, Math.min(bounds.maxScale, scale));
      }
    }
    layoutDgsSetSquare(state, false);
  });
  overlay.addEventListener('pointerup', finish);
  overlay.addEventListener('pointercancel', finish);
  overlay.addEventListener('lostpointercapture', finish);
}

function cancelDgsSetSquareInteraction(state: DgsState): void {
  if (state.setSquarePointerId != null) {
    const pointerId = state.setSquarePointerId;
    state.setSquarePointerId = null;
    try {
      if (state.setSquareOverlay.hasPointerCapture(pointerId)) {
        state.setSquareOverlay.releasePointerCapture(pointerId);
      }
    } catch (e) {}
  }
  state.setSquareInteraction = null;
  state.setSquareOverlay.removeAttribute('data-interaction');
}

function dgsMayDisplayObjectValues(object: any): boolean {
  return !(object && object.board && object.board.__liaDgsValueDisplayLocked);
}

window.__dgsMayDisplayValuesForBoard = function(boardId: string): boolean {
  const board = window.__boards && window.__boards[boardId];
  return !(board && board.__liaDgsValueDisplayLocked);
};
const dgsConstructionStates: Record<string, any> =
  ((window as any).__dgsConstructionStates = (window as any).__dgsConstructionStates || {});
const dgsConstructionBoards: Record<string, any> =
  ((window as any).__dgsConstructionBoards = (window as any).__dgsConstructionBoards || {});
let dgsPersistentIdCounter = 0;
const dgsHistoryApplying = new Set<string>();
const dgsPendingHistoryBefore: Record<string, any> = {};

function cloneDgsSnapshot(value: any): any {
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return { records: [] }; }
}
const pendingRetries: Record<string, number> = {};
const pendingRetryTimers: Record<string, number | undefined> = {};
const pendingRetryBoardIds: Record<string, string | undefined> = {};
const MAX_RETRIES = 40;
const RETRY_DELAY_MS = 120;

function isStaticDgsTarget(boardId: string, anchor?: HTMLElement | null): boolean {
  if (anchor && anchor.hasAttribute('data-lia-static-claimed')) return true;
  try {
    return !!(
      boardId &&
      window.__coord &&
      typeof window.__coord.isStaticCoordinateBoard === 'function' &&
      window.__coord.isStaticCoordinateBoard(boardId)
    );
  } catch (e) { return false; }
}

function clearPendingDgsRetry(uid: string): void {
  if (pendingRetryTimers[uid] != null) {
    try { window.clearTimeout(pendingRetryTimers[uid]); } catch (e) {}
  }
  pendingRetryTimers[uid] = undefined;
  pendingRetries[uid] = 0;
  delete pendingRetryBoardIds[uid];
}
const MENU_HEIGHT_PX = 50;
const SIDE_MENU_WIDTH_PX = 190;
const OBJECT_LIST_WIDTH_PX = 120;
const MENU_TRANSITION_MS = 220;
const DGS_STYLE_VERSION = '2026-07-18-10';

function assignDgsMacroPersistentIds(boardId: string, board: any): void {
  if (!board) return;
  const root = window as any;
  const assign = (object: any, key: string, force = false) => {
    if (!object || typeof object !== 'object' || object.board !== board) return;
    if (!force && !object.__liaDgsMacroManaged) return;
    const stableKey = 'macro:' + key;
    object.__liaDgsMacroManaged = true;
    object.__liaDgsMacroKey = stableKey;
    object.__liaDgsPersistentId = stableKey;
  };
  const assignList = (values: any, key: string, force = false) => {
    (Array.isArray(values) ? values : []).forEach((value: any, index: number) => {
      assign(value, key + ':' + index, force);
    });
  };
  const visit = (registryName: string, callback: (entry: any, key: string) => void) => {
    const entries = root[registryName];
    if (!entries || typeof entries !== 'object') return;
    Object.keys(entries).sort().forEach((entryKey) => {
      const entry = entries[entryKey];
      if (!entry || String(entry.boardId || boardId) !== boardId) return;
      const candidates = [
        entry.board,
        entry.graph?.board,
        entry.slider?.board,
        entry.object?.board,
        entry.curve?.board,
        entry.polygon?.board,
        entry.angle?.board,
        entry.text?.board,
        entry.circle?.board,
        entry.tangent?.board,
        entry.sector?.board,
        entry.contactPoint?.board,
        entry.source?.board,
        entry.source?.object?.board,
        entry.points?.[0]?.board,
        entry.ownedPoints?.[0]?.board,
        entry.ownedObjects?.[0]?.board,
        entry.segments?.[0]?.board
      ].filter(Boolean);
      if (!candidates.includes(board)) return;
      callback(entry, registryName.replace(/^__/, '') + ':' + entryKey);
    });
  };

  visit('__plotFunctionEntries', (entry, key) => assign(entry.graph, key + ':graph', true));
  visit('__sliderEntries', (entry, key) => assign(entry.slider, key + ':slider', true));
  visit('__distanceEntries', (entry, key) => {
    assignList(entry.ownedPoints, key + ':owned-point', true);
    assignList(entry.segments, key + ':segment', true);
  });
  visit('__linearObjectEntries', (entry, key) => {
    assignList(entry.ownedPoints, key + ':owned-point', true);
    assign(entry.object, key + ':object', true);
  });
  visit('__arcEntries', (entry, key) => {
    assignList(entry.ownedPoints, key + ':owned-point', true);
    assign(entry.curve, key + ':curve', true);
  });
  visit('__relationObjectEntries', (entry, key) => {
    assignList(entry.ownedPoints, key + ':owned-point', true);
    assign(entry.object, key + ':object', true);
  });
  visit('__areaEntries', (entry, key) => {
    assignList(entry.ownedPoints, key + ':owned-point', true);
    assign(entry.polygon, key + ':polygon', true);
    assignList(entry.polygon && (entry.polygon.__liaDgsPolygonBorders || entry.polygon.borders), key + ':border', true);
  });
  visit('__angleEntries', (entry, key) => assign(entry.angle, key + ':angle', true));
  visit('__coordTextEntries', (entry, key) => assign(entry.text, key + ':text', true));
  visit('__circleEntries', (entry, key) => assign(entry.circle, key + ':circle', true));
  visit('__tangentEntries', (entry, key) => {
    assignList(entry.ownedObjects, key + ':owned-object', true);
    assign(entry.contactPoint, key + ':contact', true);
    assign(entry.tangent, key + ':tangent', true);
  });
  visit('__sectorEntries', (entry, key) => assign(entry.sector, key + ':sector', true));
  visit('__functionAnalysisPointEntries', (entry, key) => assignList(entry.points, key + ':point', true));
  visit('__objectAnalysisPointEntries', (entry, key) => assignList(entry.points, key + ':point', true));
}

function getExternalDgsMacroSpecSignature(boardId: string): string {
  const objectSpecId = /^(?:(?:axis-title|point|coord-text|distance|linear|arc|relation|area|angle|circle|tangent|sector|plot|function-analysis|object-analysis|slider)-spec-|point-ui-)/;
  try {
    const entries = Array.from(document.querySelectorAll<HTMLElement>('[id][data-spec]:not([data-lia-static-claimed])')).flatMap((node) => {
      if (!objectSpecId.test(String(node.id || ''))) return [];
      const first = String(
        splitTopLevel(unquote(String(node.dataset.spec || '')), ';')[0] || ''
      ).trim();
      const idOption = first.match(/^id\s*=\s*(.+)$/i);
      const referencedBoardId = idOption ? unquote(String(idOption[1] || '')).trim() : first;
      if (referencedBoardId !== boardId) return [];
      return [{
        id: String(node.id || ''),
        spec: String(node.dataset.spec || ''),
        kind: String(node.dataset.kind || ''),
        language: String(node.dataset.language || '')
      }];
    }).filter(Boolean) as Array<{ id: string; spec: string; kind: string; language: string }>;
    entries.sort((a, b) => {
      const left = a.id + '\u0000' + a.kind + '\u0000' + a.spec + '\u0000' + a.language;
      const right = b.id + '\u0000' + b.kind + '\u0000' + b.spec + '\u0000' + b.language;
      return left.localeCompare(right);
    });
    return JSON.stringify(entries);
  } catch (e) {
    return '[]';
  }
}

function hasChangedDgsMacroSpecAnchor(savedSignature: string, currentSignature: string): boolean {
  try {
    const saved = JSON.parse(savedSignature);
    const current = JSON.parse(currentSignature);
    if (!Array.isArray(saved) || !Array.isArray(current)) return false;
    const savedById = new Map<string, any>();
    saved.forEach((entry: any) => {
      const id = String(entry && entry.id || '');
      if (id) savedById.set(id, entry);
    });
    return current.some((entry: any) => {
      const id = String(entry && entry.id || '');
      const previous = id ? savedById.get(id) : null;
      return !!previous && (
        String(previous.spec || '') !== String(entry.spec || '') ||
        String(previous.kind || '') !== String(entry.kind || '') ||
        String(previous.language || '') !== String(entry.language || '')
      );
    });
  } catch (e) {
    return false;
  }
}

function discardStaleMacroBackedDgsSnapshot(boardId: string, board: any): void {
  if (!board || !dgsConstructionStates[boardId]) return;
  const snapshotBoard = dgsConstructionBoards[boardId];
  if (snapshotBoard === board) return;
  const currentSignature = getExternalDgsMacroSpecSignature(boardId);
  const savedSignature = String(dgsConstructionStates[boardId].macroSpecSignature || '[]');
  if (savedSignature === currentSignature) return;
  // LiaScript can mount the DGS anchor before all object-macro anchors. A
  // temporarily empty or partial signature is therefore not proof of a source
  // change. Only an anchor that exists on both sides and whose own source data
  // changed invalidates the interactive snapshot. Added/removed anchors are
  // reconciled by their stable macro keys during the deferred restore.
  if (!hasChangedDgsMacroSpecAnchor(savedSignature, currentSignature)) return;
  delete dgsConstructionStates[boardId];
  delete dgsConstructionBoards[boardId];
  delete dgsPendingHistoryBefore[boardId];
  dgsHistoryApplying.delete(boardId);
}

function ensureStyles(root: Document | ShadowRoot): void {
  const existingStyle = root.querySelector<HTMLStyleElement>('#lia-dgs-style');
  if (existingStyle?.dataset.liaDgsStyleVersion === DGS_STYLE_VERSION) return;

  const style = existingStyle || document.createElement('style');
  style.id = 'lia-dgs-style';
  style.dataset.liaDgsStyleVersion = DGS_STYLE_VERSION;
  style.textContent = `
    .lia-dgs-menu-button {
      position: absolute;
      top: 7.5px;
      left: 10px;
      width: 35px;
      height: 35px;
      min-width: 35px;
      min-height: 35px;
      border-radius: 8.75px;
      border: 2.5px solid currentColor;
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
      width: 27.5px;
      height: 27.5px;
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
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .lia-dgs-top-menu::-webkit-scrollbar {
      display: none;
    }

    .lia-dgs-top-menu-fade {
      position: absolute;
      top: 0;
      width: 24px;
      height: calc(${MENU_HEIGHT_PX}px - 2px);
      opacity: 0;
      visibility: hidden;
      transition: opacity 150ms ease;
      pointer-events: none;
      z-index: 2;
    }

    .lia-dgs-top-menu[data-open="1"] ~ .lia-dgs-top-menu-fade[data-visible="1"] {
      opacity: 1;
      visibility: visible;
    }

    .lia-dgs-top-menu-fade-start {
      left: 48px;
      background: linear-gradient(to right, var(--lia-dgs-menu-bg, #fff), transparent);
    }

    .lia-dgs-top-menu-fade-end {
      right: 98px;
      background: linear-gradient(to left, var(--lia-dgs-menu-bg, #fff), transparent);
    }

    .lia-dgs-top-menu-mask-start {
      position: absolute;
      top: 0;
      left: 0;
      width: 48px;
      height: calc(${MENU_HEIGHT_PX}px - 2px);
      background: var(--lia-dgs-menu-bg, #fff);
      opacity: 0;
      visibility: hidden;
      transition: opacity 150ms ease;
      pointer-events: none;
      z-index: 2;
    }

    .lia-dgs-top-menu[data-open="1"] ~ .lia-dgs-top-menu-mask-start {
      opacity: 1;
      visibility: visible;
    }

    .lia-dgs-top-menu-end {
      position: absolute;
      top: 0;
      right: 0;
      width: 98px;
      height: ${MENU_HEIGHT_PX}px;
      box-sizing: border-box;
      padding: 7.5px 10px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      gap: 8px;
      border-bottom: 2px solid currentColor;
      background: var(--lia-dgs-menu-bg, #fff);
      color: var(--lia-dgs-neutral-color, currentColor);
      transform: translateY(calc(-100% - 2px));
      transition: transform ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1);
      pointer-events: none;
      z-index: 3;
    }

    .lia-dgs-top-menu[data-open="1"] ~ .lia-dgs-top-menu-end {
      transform: translateY(0);
      pointer-events: auto;
    }

    .lia-dgs-top-menu-end .lia-dgs-geometry-button {
      position: static;
      flex: 0 0 35px;
    }

    .lia-dgs-top-menu-scroll-spacer {
      position: absolute;
      top: 0;
      left: 882px;
      width: 1px;
      height: 1px;
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
        top ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1),
        right ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1);
      pointer-events: none;
    }

    .lia-dgs-side-menu.has-object-list {
      right: ${OBJECT_LIST_WIDTH_PX}px;
    }

    .lia-dgs-side-menu.has-object-list:not(.is-open) {
      transform: translateX(calc(100% + ${OBJECT_LIST_WIDTH_PX + 2}px));
    }

    .lia-dgs-side-menu[data-open="1"] {
      transform: translateX(0);
      pointer-events: auto;
    }

    .lia-dgs-side-menu[data-top-open="1"] {
      top: ${MENU_HEIGHT_PX}px;
    }

    .lia-dgs-object-list-clip {
      position: absolute;
      inset: 0;
      z-index: 48;
      overflow: hidden;
      pointer-events: none;
      border-radius: inherit;
    }

    .lia-dgs-object-list-panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: ${OBJECT_LIST_WIDTH_PX}px;
      box-sizing: border-box;
      padding: 10px 8px 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-left: 2px solid currentColor;
      background: var(--lia-dgs-menu-bg, #fff);
      box-shadow: -6px 0 16px rgba(0, 0, 0, 0.18);
      transform: translateX(calc(100% + 2px));
      transition:
        transform ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1),
        top ${MENU_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1);
      pointer-events: none;
    }

    .lia-dgs-object-list-panel.is-open {
      transform: translateX(0);
      pointer-events: auto;
    }

    .lia-dgs-object-list-panel.is-top-open {
      top: ${MENU_HEIGHT_PX}px;
    }

    .lia-dgs-object-list-header {
      min-height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 2px solid var(--lia-dgs-theme-color, currentColor);
      font-size: 13px;
      font-weight: 700;
    }

    .lia-dgs-object-list-content {
      min-height: 0;
      flex: 1 1 auto;
      overflow-y: auto;
      display: grid;
      align-content: start;
      gap: 6px;
    }

    .lia-dgs-object-list-footer {
      flex: 0 0 auto;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-object-list-export {
      width: 100%;
      min-height: 34px;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      padding: 5px 8px;
      border: 2px solid var(--lia-dgs-theme-color, currentColor);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    .lia-dgs-object-list-export:hover,
    .lia-dgs-object-list-export:focus-visible {
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 15%, transparent);
      outline: none;
    }

    .lia-dgs-object-list-empty {
      padding: 12px 6px;
      opacity: .7;
      font-size: 13px;
      text-align: center;
    }

    .lia-dgs-object-list-entry {
      width: 100%;
      min-height: 40px;
      display: grid;
      grid-template-columns: 11px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      box-sizing: border-box;
      padding: 5px 6px;
      border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
      border-radius: 7px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: context-menu;
    }

    .lia-dgs-object-list-entry:hover,
    .lia-dgs-object-list-entry:focus-visible,
    .lia-dgs-object-list-entry.is-selected {
      border-color: var(--lia-dgs-theme-color, currentColor);
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 13%, transparent);
      outline: none;
    }

    .lia-dgs-object-list-entry.is-hidden {
      opacity: .55;
    }

    .lia-dgs-object-list-swatch {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--lia-dgs-object-color, #ff00ff);
      box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 40%, transparent);
    }

    .lia-dgs-object-list-copy {
      min-width: 0;
      display: grid;
      gap: 1px;
    }

    .lia-dgs-object-list-name,
    .lia-dgs-object-list-type {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lia-dgs-object-list-name {
      font-size: 13px;
      font-weight: 700;
    }

    .lia-dgs-object-list-type {
      font-size: 11px;
      opacity: .72;
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

    .lia-dgs-coordinate-section[hidden],
    .lia-dgs-angle-measure-section[hidden],
    .lia-dgs-function-expression-section[hidden],
    .lia-dgs-slider-settings-section[hidden] {
      display: none;
    }

    .lia-dgs-angle-measure-section {
      margin-bottom: 6px;
    }

    .lia-dgs-function-expression-section {
      margin-bottom: 8px;
    }

    .lia-dgs-slider-settings-section {
      margin-bottom: 8px;
    }

    .lia-dgs-slider-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }

    .lia-dgs-slider-field {
      min-width: 0;
      display: grid;
      gap: 3px;
      font-size: 12px;
      font-weight: 600;
    }

    .lia-dgs-slider-field[data-wide=1] {
      grid-column: 1 / -1;
    }

    .lia-dgs-slider-field input,
    .lia-dgs-slider-field select {
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

    .lia-dgs-slider-field select {
      cursor: pointer;
    }

    .lia-dgs-slider-field input[aria-invalid=true] {
      border-color: #ff3333;
      box-shadow: 0 0 0 1px #ff3333;
    }

    .lia-dgs-function-expression-preview {
      min-height: 30px;
      margin-bottom: 6px;
      padding: 4px 5px;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      overflow-wrap: anywhere;
      text-align: center;
      font-size: 15px;
    }

    .lia-dgs-function-expression-input {
      width: 100%;
    }

    .lia-dgs-angle-measure-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
    }

    .lia-dgs-angle-measure-input {
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

    .lia-dgs-angle-measure-input[aria-invalid="true"] {
      border-color: #ff3333;
      box-shadow: 0 0 0 1px #ff3333;
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

    .lia-dgs-side-menu [hidden],
    .lia-dgs-object-list-footer[hidden] {
      display: none !important;
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

    .lia-dgs-trace-clear-button {
      width: 100%;
      min-height: 31px;
      margin-top: 6px;
      padding: 5px 10px;
      border: 1.5px solid var(--lia-dgs-theme-color, currentColor);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .lia-dgs-trace-clear-button:hover,
    .lia-dgs-trace-clear-button:focus-visible {
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 18%, transparent);
      outline: none;
    }

    .lia-dgs-trace-clear-button[hidden] {
      display: none;
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
    .lia-dgs-function-divider,
    .lia-dgs-regression-divider,
    .lia-dgs-text-divider,
    .lia-dgs-zoom-divider {
      position: absolute;
      top: 3px;
      width: 2px;
      height: 44px;
      border-radius: 999px;
      background: var(--lia-dgs-theme-color, currentColor);
      opacity: 1;
      pointer-events: none;
    }

    .lia-dgs-tools-divider {
      left: 138px;
    }

    .lia-dgs-function-divider {
      left: 362px;
    }

    .lia-dgs-regression-divider {
      left: 457px;
      display: none;
    }

    .lia-dgs-regression-divider[data-visible="1"] {
      display: block;
    }

    .lia-dgs-text-divider {
      left: 595px;
    }

    .lia-dgs-geometry-button {
      position: absolute;
      top: 7.5px;
      width: 35px;
      height: 35px;
      min-width: 35px;
      min-height: 35px;
      border-radius: 8.75px;
      border: 2.5px solid currentColor;
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

    .lia-dgs-select-button {
      left: 52px;
    }

    .lia-dgs-format-button {
      left: 95px;
    }

    .lia-dgs-format-button path {
      stroke: currentColor !important;
    }

    .lia-dgs-format-source {
      filter: drop-shadow(0 0 3px #ff00ff) drop-shadow(0 0 1px #ff00ff);
    }

    .lia-dgs-point-button {
      left: 147px;
    }

    .lia-dgs-segment-button {
      left: 190px;
    }

    .lia-dgs-orthogonal-button {
      left: 233px;
    }

    .lia-dgs-polygon-button {
      left: 276px;
    }

    .lia-dgs-angle-button {
      left: 319px;
    }

    .lia-dgs-function-button {
      left: 371px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 17px;
      font-style: italic;
      line-height: 1;
    }

    .lia-dgs-slider-button {
      left: 604px;
    }

    .lia-dgs-slider-button svg {
      width: 28px;
      height: 28px;
      overflow: visible;
    }

    .lia-dgs-slider-track {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }

    .lia-dgs-slider-button .lia-dgs-slider-knob {
      fill: #ff00ff !important;
      stroke: none !important;
    }

    .lia-dgs-text-button {
      left: 647px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 20px;
      font-weight: 700;
      line-height: 1;
    }

    .lia-dgs-zoom-divider {
      left: 690px;
    }

    .lia-dgs-zoom-mode-button {
      left: 699px;
    }

    .lia-dgs-axis-scale-button {
      left: 742px;
    }

    .lia-dgs-fullscreen-button {
      left: auto;
      right: auto;
    }

    .lia-dgs-fullscreen-button path {
      fill: none !important;
      stroke: var(--lia-dgs-neutral-color, currentColor) !important;
      stroke-width: 2.1;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lia-dgs-object-list-button {
      left: auto;
      right: auto;
    }

    .lia-dgs-object-list-dot {
      fill: currentColor !important;
      stroke: none !important;
    }

    .lia-dgs-object-list-button path {
      stroke: currentColor !important;
    }

    .lia-dgs-fullscreen-host.lia-dgs-fullscreen-active {
      width: 100vw !important;
      height: 100vh !important;
      height: 100dvh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      border-radius: 0 !important;
      background: var(--lia-dgs-fullscreen-bg, #fff) !important;
    }

    .lia-dgs-fullscreen-host.lia-dgs-fullscreen-active::backdrop {
      background: var(--lia-dgs-fullscreen-bg, #fff);
    }

    .lia-dgs-fullscreen-host.lia-dgs-fullscreen-active .lia-jxg-resize-handle {
      display: none !important;
    }

    .lia-dgs-axis-scale-button svg {
      width: 28px;
      height: 28px;
    }

    .lia-dgs-axis-scale-button text,
    .lia-dgs-axis-scale-submenu text {
      fill: #ff00ff;
      stroke: none;
      font-family: Arial, sans-serif;
      font-size: 6px;
      font-weight: 700;
    }

    .lia-dgs-axis-scale-button path,
    .lia-dgs-axis-scale-submenu path {
      stroke: var(--lia-dgs-neutral-color, currentColor) !important;
    }

    .lia-dgs-root-button {
      left: 414px;
    }

    .lia-dgs-root-button svg,
    .lia-dgs-root-tool svg {
      width: 30px;
      height: 30px;
    }

    .lia-dgs-root-button .lia-dgs-root-axis,
    .lia-dgs-root-button .lia-dgs-root-curve,
    .lia-dgs-root-tool .lia-dgs-root-axis,
    .lia-dgs-root-tool .lia-dgs-root-curve {
      stroke: var(--lia-dgs-neutral-color, currentColor);
    }

    .lia-dgs-root-button .lia-dgs-root-axis,
    .lia-dgs-root-tool .lia-dgs-root-axis {
      stroke-width: 1.15;
    }

    .lia-dgs-root-button .lia-dgs-root-curve,
    .lia-dgs-root-tool .lia-dgs-root-curve {
      stroke-width: 1.65;
    }

    .lia-dgs-root-button .lia-dgs-root-mark,
    .lia-dgs-root-tool .lia-dgs-root-mark {
      stroke: #ff00ff;
      stroke-width: 1.9;
    }

    .lia-dgs-geometry-button.lia-dgs-angle-button svg {
      width: 31.25px;
      height: 31.25px;
    }

    .lia-dgs-polygon-fill {
      fill: rgba(255, 0, 255, 0.75) !important;
    }

    .lia-dgs-sector-fill {
      fill: rgba(255, 0, 255, 0.75) !important;
    }

    .lia-dgs-angle-fill {
      fill: rgba(255, 0, 255, 0.28) !important;
    }

    .lia-dgs-geometry-submenu {
      position: absolute;
      top: 44px;
      left: 182px;
      z-index: 4;
      box-sizing: border-box;
      min-width: min(241.5px, calc(100% - 16px));
      max-width: calc(100% - 16px);
      display: grid;
      gap: 3.75px;
      padding: 7.5px;
      border: 2px solid currentColor;
      border-radius: 8px;
      background: var(--lia-dgs-menu-bg, #fff);
      color: var(--lia-dgs-neutral-color, currentColor);
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

    .lia-dgs-axis-scale-submenu {
      left: 646px;
      min-width: min(329px, calc(100% - 16px));
    }

    .lia-dgs-geometry-submenu[data-open="1"] {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition-delay: 0s;
      pointer-events: auto;
    }

    .lia-dgs-shape-submenu {
      left: 268px;
    }

    .lia-dgs-compass-submenu {
      min-width: min(270px, calc(100% - 16px));
    }

    .lia-dgs-relation-submenu {
      left: 225px;
    }

    .lia-dgs-angle-submenu {
      left: 311px;
    }

    .lia-dgs-root-submenu {
      left: 406px;
    }

    .lia-dgs-geometry-tool {
      min-width: 0;
      min-height: 42.5px;
      display: grid;
      grid-template-columns: 35px minmax(0, 1fr);
      align-items: center;
      gap: 11.25px;
      padding: 3.75px 11.25px 3.75px 6.25px;
      border: 0;
      border-radius: 7.5px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 1.25em;
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
      width: 32.5px;
      height: 32.5px;
      display: block;
      overflow: visible;
    }

    .lia-dgs-geometry-tool path {
      fill: none;
      stroke: #ff00ff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lia-dgs-geometry-tool .lia-dgs-cross {
      stroke: var(--lia-dgs-neutral-color, currentColor);
      stroke-width: 1.65;
    }

    .lia-dgs-geometry-button svg {
      display: block;
      width: 27.5px;
      height: 27.5px;
      overflow: visible;
    }

    .lia-dgs-geometry-button path {
      fill: none;
      stroke: #ff00ff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lia-dgs-select-button .lia-dgs-select-pointer {
      fill: var(--lia-dgs-neutral-color, currentColor);
      stroke: var(--lia-dgs-neutral-color, currentColor);
      stroke-width: 1.2;
    }

    .lia-dgs-set-square-button .lia-dgs-set-square-icon-fill {
      fill: var(--lia-dgs-neutral-color, currentColor) !important;
      fill-opacity: 0.14;
      stroke: none !important;
    }

    .lia-dgs-set-square-button .lia-dgs-reference {
      stroke: var(--lia-dgs-neutral-color, currentColor) !important;
      stroke-width: 1.35;
    }

    .lia-dgs-set-square-button .lia-dgs-set-square-icon-accent {
      stroke: var(--lia-dgs-theme-color, #00a8b5) !important;
      stroke-width: 1.75;
    }

    .lia-dgs-geometry-button .lia-dgs-cross {
      stroke: var(--lia-dgs-neutral-color, currentColor);
      stroke-width: 1.65;
    }

    .lia-dgs-geometry-button .lia-dgs-reference,
    .lia-dgs-geometry-tool .lia-dgs-reference {
      stroke: var(--lia-dgs-neutral-color, currentColor);
    }

    .lia-dgs-point-button .lia-dgs-cross {
      stroke: #ff00ff;
    }

    .lia-dgs-point-symbol {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.25px;
    }

    .lia-dgs-point-symbol svg {
      width: 10px;
      height: 10px;
      flex: 0 0 10px;
    }

    .lia-dgs-point-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 17.5px;
      line-height: 1;
      color: var(--lia-dgs-neutral-color, currentColor);
    }

    .lia-dgs-point-label mjx-container {
      display: inline-block !important;
      margin: 0 !important;
      font-size: 1em !important;
    }

    .lia-dgs-set-square-overlay {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 46;
      display: none;
      width: 520px;
      aspect-ratio: 600 / 350;
      box-sizing: border-box;
      color: var(--lia-dgs-neutral-color, currentColor);
      pointer-events: none;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      transform-origin: 50% 9.7142857%;
      will-change: left, top, transform;
      filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2));
    }

    .lia-dgs-set-square-overlay.is-visible {
      display: block;
    }

    .lia-dgs-set-square-overlay > svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .lia-dgs-set-square-surface {
      fill: var(--lia-dgs-neutral-color, currentColor);
      fill-opacity: 0.10;
      stroke: none;
      cursor: grab;
      pointer-events: all;
    }

    .lia-dgs-set-square-overlay[data-interaction=move] .lia-dgs-set-square-surface,
    .lia-dgs-set-square-overlay[data-interaction=rotate] .lia-dgs-set-square-rotate-hit {
      cursor: grabbing;
    }

    .lia-dgs-set-square-outline,
    .lia-dgs-set-square-ruler-ticks,
    .lia-dgs-set-square-protractor-arc,
    .lia-dgs-set-square-protractor-rays,
    .lia-dgs-set-square-protractor-ticks,
    .lia-dgs-set-square-edge-angle-ticks-minor,
    .lia-dgs-set-square-edge-angle-ticks-medium,
    .lia-dgs-set-square-edge-angle-ticks-major,
    .lia-dgs-set-square-guides {
      fill: none;
      stroke: var(--lia-dgs-neutral-color, currentColor);
      pointer-events: none;
      vector-effect: non-scaling-stroke;
    }

    .lia-dgs-set-square-outline {
      stroke-width: 2;
      stroke-linejoin: round;
    }

    .lia-dgs-set-square-ruler-ticks,
    .lia-dgs-set-square-protractor-arc {
      stroke-width: 1.15;
    }

    .lia-dgs-set-square-protractor-ticks {
      stroke-width: 0.7;
      stroke-opacity: 0.9;
    }

    .lia-dgs-set-square-edge-angle-ticks-minor,
    .lia-dgs-set-square-edge-angle-ticks-medium,
    .lia-dgs-set-square-edge-angle-ticks-major {
      stroke-linecap: butt;
    }

    .lia-dgs-set-square-edge-angle-ticks-minor {
      stroke-width: 0.95;
      stroke-opacity: 0.78;
    }

    .lia-dgs-set-square-edge-angle-ticks-medium {
      stroke-width: 1.3;
      stroke-opacity: 0.9;
    }

    .lia-dgs-set-square-edge-angle-ticks-major {
      stroke-width: 1.7;
      stroke-opacity: 1;
    }

    .lia-dgs-set-square-protractor-rays {
      stroke-width: 0.9;
      stroke-opacity: 0.52;
    }

    .lia-dgs-set-square-guides {
      stroke-width: 1;
      stroke-opacity: 0.78;
    }

    .lia-dgs-set-square-accent-guide,
    .lia-dgs-set-square-zero,
    .lia-dgs-set-square-rotate-arrow,
    .lia-dgs-set-square-scale-arrow {
      fill: none;
      stroke: var(--lia-dgs-theme-color, #00a8b5);
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
      vector-effect: non-scaling-stroke;
    }

    .lia-dgs-set-square-handle-arrowhead {
      fill: var(--lia-dgs-theme-color, #00a8b5);
      stroke: none;
      pointer-events: none;
    }

    .lia-dgs-set-square-accent-guide {
      stroke-width: 2.8;
      stroke-opacity: 1;
      filter: drop-shadow(0 0 1.5px var(--lia-dgs-theme-color, #00a8b5));
    }

    .lia-dgs-set-square-zero {
      stroke-width: 2;
    }

    .lia-dgs-set-square-zero-dot {
      fill: var(--lia-dgs-theme-color, #00a8b5);
      stroke: var(--lia-dgs-menu-bg, #fff);
      stroke-width: 1.2;
      pointer-events: none;
      vector-effect: non-scaling-stroke;
    }

    .lia-dgs-set-square-labels text,
    .lia-dgs-set-square-ruler-labels text {
      fill: var(--lia-dgs-neutral-color, currentColor);
      stroke: var(--lia-dgs-menu-bg, #fff);
      stroke-width: 1.8;
      paint-order: stroke fill;
      font-family: Arial, sans-serif;
      font-size: 8px;
      font-weight: 600;
      pointer-events: none;
    }

    .lia-dgs-set-square-ruler-number {
      font-size: 10.5px !important;
      font-weight: 700 !important;
    }

    .lia-dgs-set-square-degree-outer,
    .lia-dgs-set-square-degree-inner {
      font-size: 12.5px !important;
      font-weight: 700 !important;
      font-variant-numeric: tabular-nums;
      stroke-width: 2.4 !important;
    }

    .lia-dgs-set-square-degree-inner {
      font-size: 12px !important;
    }

    .lia-dgs-set-square-rotate-hit {
      fill: transparent;
      stroke: none;
      cursor: grab;
      pointer-events: all;
    }

    .lia-dgs-set-square-rotate-ring {
      fill: color-mix(in srgb, var(--lia-dgs-theme-color, #00a8b5) 24%, var(--lia-dgs-menu-bg, #fff));
      stroke: var(--lia-dgs-theme-color, #00a8b5);
      stroke-width: 2;
      pointer-events: none;
      vector-effect: non-scaling-stroke;
    }

    .lia-dgs-set-square-rotate-arrow {
      stroke-width: 2;
    }

    .lia-dgs-set-square-scale-hit {
      fill: transparent;
      stroke: none;
      pointer-events: all;
    }

    .lia-dgs-set-square-scale-handle[data-side=left] .lia-dgs-set-square-scale-hit {
      cursor: nwse-resize;
    }

    .lia-dgs-set-square-scale-handle[data-side=right] .lia-dgs-set-square-scale-hit {
      cursor: nesw-resize;
    }

    .lia-dgs-set-square-scale-ring {
      fill: color-mix(in srgb, var(--lia-dgs-theme-color, #00a8b5) 24%, var(--lia-dgs-menu-bg, #fff));
      stroke: var(--lia-dgs-theme-color, #00a8b5);
      stroke-width: 2;
      pointer-events: none;
      vector-effect: non-scaling-stroke;
    }

    .lia-dgs-set-square-scale-arrow {
      stroke-width: 2;
    }

    .lia-dgs-set-square-overlay[data-interaction=scale] .lia-dgs-set-square-scale-ring {
      stroke-width: 2.8;
      filter: drop-shadow(0 0 2px var(--lia-dgs-theme-color, #00a8b5));
    }

    .lia-dgs-set-square-overlay[data-interaction=rotate] .lia-dgs-set-square-rotate-ring {
      stroke-width: 2.8;
      filter: drop-shadow(0 0 2px var(--lia-dgs-theme-color, #00a8b5));
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

    .lia-dgs-relation-source {
      filter:
        drop-shadow(0 0 2px var(--lia-dgs-theme-color, #00a8b5))
        drop-shadow(0 0 4px var(--lia-dgs-theme-color, #00a8b5));
    }

    .lia-dgs-geometry-button circle,
    .lia-dgs-geometry-tool circle {
      fill: none;
      stroke: #ff00ff;
      stroke-width: 2;
    }

    .lia-dgs-measure-mark {
      fill: #ff00ff;
      stroke: none;
      font-size: 10px;
      font-weight: 700;
    }

    .lia-dgs-compass-radius-label {
      fill: #ff00ff;
      stroke: none;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 5.5px;
      font-style: italic;
      font-weight: 700;
    }

    .lia-dgs-compass-icon .lia-dgs-compass-body {
      stroke: var(--lia-dgs-neutral-color, currentColor);
      stroke-width: 1.45;
    }

    .lia-dgs-compass-icon .lia-dgs-compass-joint {
      fill: var(--lia-dgs-neutral-color, currentColor);
      stroke: var(--lia-dgs-neutral-color, currentColor);
      stroke-width: 1;
    }

    .lia-dgs-compass-icon .lia-dgs-compass-accent {
      stroke-width: 1.75;
    }

    .lia-dgs-angle-dialog {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 60;
      min-width: min(280px, calc(100% - 32px));
      display: none;
      gap: 10px;
      padding: 14px;
      box-sizing: border-box;
      border: 2px solid var(--lia-dgs-theme-color, currentColor);
      border-radius: 10px;
      background: var(--lia-dgs-menu-bg, #fff);
      color: inherit;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.30);
      transform: translate(-50%, -50%);
    }

    .lia-dgs-angle-dialog[data-open="1"] {
      display: grid;
    }

    .lia-dgs-function-dialog .lia-dgs-angle-dialog-field {
      display: block;
    }

    .lia-dgs-function-dialog-hint {
      font-size: 12px;
      line-height: 1.3;
      opacity: .75;
    }

    .lia-dgs-export-dialog {
      width: min(920px, calc(100% - 32px));
      max-width: calc(100% - 32px);
      max-height: min(82vh, calc(100% - 32px));
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
    }

    .lia-dgs-export-step {
      min-width: 0;
      min-height: 0;
    }

    .lia-dgs-export-step[hidden],
    .lia-dgs-export-dialog [hidden],
    .lia-dgs-menu-clip [hidden] {
      display: none !important;
    }

    .lia-dgs-export-tools-step {
      display: grid;
      gap: 10px;
      min-height: 0;
      padding-right: 3px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .lia-dgs-export-tools-hint {
      font-size: 13px;
      line-height: 1.35;
      opacity: .82;
    }

    .lia-dgs-export-tool-groups {
      min-width: 0;
      max-height: min(42vh, 360px);
      display: flex;
      align-items: stretch;
      gap: 10px;
      padding: 2px 8px 8px 2px;
      overflow: auto;
      overscroll-behavior: contain;
    }

    .lia-dgs-export-restrictions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 7px 18px;
      padding-top: 10px;
      border-top: 2px solid var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-export-restrictions-title {
      grid-column: 1 / -1;
      font-size: 13px;
      font-weight: 700;
    }

    .lia-dgs-export-restriction-option {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
      font-size: 13px;
      line-height: 1.3;
      cursor: pointer;
      user-select: none;
    }

    .lia-dgs-export-restriction-option input {
      flex: 0 0 auto;
      width: 17px;
      height: 17px;
      margin: 0;
      accent-color: var(--lia-dgs-theme-color, currentColor);
      cursor: pointer;
    }

    .lia-dgs-export-tool-group {
      flex: 0 0 auto;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-height: 44px;
    }

    .lia-dgs-export-tool-group + .lia-dgs-export-tool-group {
      padding-left: 10px;
      border-left: 2px solid var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-export-tool-column {
      display: grid;
      grid-auto-rows: 44px;
      gap: 8px;
    }

    .lia-dgs-export-tool.lia-dgs-geometry-button {
      position: relative !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      border-radius: 11px;
      overflow: visible;
    }

    .lia-dgs-export-tool-icon {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      transition: opacity 140ms ease, filter 140ms ease;
      pointer-events: none;
    }

    .lia-dgs-export-tool-icon > svg {
      width: 32px;
      height: 32px;
      display: block;
      overflow: visible;
    }

    .lia-dgs-export-tool[data-enabled="0"] .lia-dgs-export-tool-icon {
      opacity: .32;
      filter: grayscale(1);
    }

    .lia-dgs-export-tool[data-enabled="0"] {
      border-color: color-mix(
        in srgb,
        var(--lia-dgs-neutral-color, currentColor) 34%,
        transparent
      );
    }

    .lia-dgs-export-tool-status {
      position: absolute;
      right: -6px;
      bottom: -6px;
      z-index: 2;
      width: 17px;
      height: 17px;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      border: 1.5px solid #fff;
      border-radius: 50%;
      background: #24a148;
      color: #fff;
      font: 700 13px/1 Arial, sans-serif;
      pointer-events: none;
    }

    .lia-dgs-export-tool[data-enabled="0"] .lia-dgs-export-tool-status {
      background: #d32f2f;
    }

    .lia-dgs-export-tool:hover,
    .lia-dgs-export-tool:focus-visible {
      border-color: var(--lia-dgs-theme-color, currentColor);
      outline: 2px solid color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 55%, transparent);
      outline-offset: 2px;
    }

    .lia-dgs-export-tool .ico-color-dot {
      fill: #ff00ff !important;
      stroke: none !important;
    }

    .lia-dgs-export-regression-tool path,
    .lia-dgs-export-regression-tool .ico-stroke {
      fill: none !important;
      stroke: var(--lia-dgs-neutral-color, currentColor) !important;
    }

    .lia-dgs-export-macro-step {
      display: grid;
      gap: 10px;
      min-height: 0;
      overflow: auto;
    }

    .lia-dgs-export-textarea {
      min-width: 0;
      width: 100%;
      height: min(42vh, 320px);
      min-height: 150px;
      box-sizing: border-box;
      border: 1.5px solid currentColor;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      padding: 8px 10px;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
      resize: vertical;
      white-space: pre;
      overflow: auto;
    }

    .lia-dgs-export-textarea:focus-visible {
      outline: 2px solid var(--lia-dgs-theme-color, currentColor);
      outline-offset: 2px;
    }

    .lia-dgs-angle-dialog-title {
      font-size: 16px;
      font-weight: 700;
    }

    .lia-dgs-angle-dialog-field {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 7px;
    }

    .lia-dgs-angle-dialog-input {
      min-width: 0;
      width: 100%;
      height: 35px;
      box-sizing: border-box;
      border: 1.5px solid currentColor;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      padding: 5px 8px;
      font: inherit;
      font-size: 16px;
    }

    .lia-dgs-angle-dialog-input[aria-invalid="true"] {
      border-color: #ff3333;
      box-shadow: 0 0 0 1px #ff3333;
    }

    .lia-dgs-angle-dialog-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .lia-dgs-angle-dialog-button {
      min-height: 35px;
      padding: 5px 11px;
      border: 2px solid currentColor;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .lia-dgs-angle-dialog-button[data-primary="1"] {
      border-color: var(--lia-dgs-theme-color, currentColor);
      box-shadow: inset 0 0 0 1px var(--lia-dgs-theme-color, currentColor);
    }

    .lia-dgs-polygon-vertex,
    .lia-dgs-angle-point {
      filter:
        drop-shadow(0 0 2px var(--lia-dgs-theme-color, #00a8b5))
        drop-shadow(0 0 4px var(--lia-dgs-theme-color, #00a8b5));
    }

    @media (prefers-reduced-motion: reduce) {
      .lia-dgs-top-menu,
      .lia-dgs-top-menu-end,
      .lia-dgs-side-menu,
      .lia-dgs-geometry-submenu {
        transition: none;
      }
    }
  `;

  if (!existingStyle) {
    if (root instanceof Document) {
      (root.head || root.documentElement).appendChild(style);
    } else {
      root.appendChild(style);
    }
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
    if (segment.__liaDgsPolygonBorderInitializing) return;
    const type = String(segment.elType || '').toLowerCase();
    if (type !== 'segment' && type !== 'line' &&
        !segment.__liaDgsSegment && !segment.__liaDgsRay && !segment.__liaDgsLine &&
        !segment.__liaDgsVector && !segment.__liaDgsArc && !segment.__liaDgsCompassArc) return;

    [segment.__liaDgsSegmentName, segment.__liaDgsRayName, segment.__liaDgsLineName,
      segment.__liaDgsVectorName, segment.__liaDgsArcName, segment.__liaDgsCompassArcName,
      segment.name].forEach((value) => {
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
    '.lia-dgs-set-square-overlay',
    '.lia-dgs-menu-clip',
    '.lia-dgs-side-menu-clip',
    '.lia-dgs-color-popup',
    '.lia-dgs-angle-dialog',
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
    const syncDependentCoordinates = (readDraggedParameter: boolean) => {
      if (!point.__liaDgsCoordinateExpressions || point.__liaDgsCoordinateSyncing) return;
      if (readDraggedParameter) {
        try {
          const parameter = Number(point.X());
          if (Number.isFinite(parameter)) point.__liaDgsCoordinateParameter = parameter;
        } catch (e) {}
      }
      syncDgsCoordinatePoint(state, point);
    };
    try {
      point.on('drag', () => {
        syncDependentCoordinates(true);
        translateDgsFixedCompassComponent(state, point);
        recordDgsPointTraceMotion(state, point);
        savePosition(false);
      });
    } catch (e) {}
    try {
      point.on('up', () => {
        syncDependentCoordinates(false);
        translateDgsFixedCompassComponent(state, point);
        recordDgsPointTraceMotion(state, point);
        savePosition(true);
      });
    } catch (e) {}
    savePosition();

    try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
    try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
    try { if (typeof board.update === 'function') board.update(); } catch (e) {}
    return point;
  } catch (e) {
    return null;
  }
}

function createDgsMidpoint(state: DgsState, first: any, second: any): any | null {
  if (!state.board || !isDgsPoint(first) || !isDgsPoint(second) || first === second) return null;
  const name = getNextPointName(state);
  const labelColor = getNeutralColor();
  try {
    const point = state.board.create('point', [
      function() { return (Number(first.X()) + Number(second.X())) / 2; },
      function() { return (Number(first.Y()) + Number(second.Y())) / 2; }
    ], {
      name: '\\(' + name + '\\)',
      fixed: true,
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
    point.__liaDgsMidpoint = true;
    point.__liaDgsMidpointFirst = first;
    point.__liaDgsMidpointSecond = second;
    point.__liaDgsLanguage = state.language;
    point.__liaDgsColor = '#ff00ff';
    point.__liaDgsTextColor = labelColor;
    point.__liaDgsLineColor = '#ff00ff';
    point.__liaDgsFillColor = '#ff00ff';
    point.__liaDgsShowName = true;
    point.__liaDgsShowValue = false;
    point.__liaDgsShowObject = true;
    point.__liaDgsOpacity = 1;
    point.__liaPointVisual = { color: '#ff00ff', opacity: 1, hasExplicitColor: false };
    window.__points = window.__points || {};
    window.__points[state.boardId] = window.__points[state.boardId] || {};
    window.__points[state.boardId][name] = point;
    refreshDgsObjectLabel(point);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return point;
  } catch (e) {
    return null;
  }
}

function getSelectableBoardPoints(state: DgsState): any[] {
  const points: any[] = [];
  const seen = new Set<any>();
  const add = (point: any) => {
    if (!point || typeof point !== 'object' || point.__liaDgsTraceMarker ||
        point.__liaDgsSlider || point.__liaDgsSliderOwner || seen.has(point)) return;
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

function getNextFunctionName(state: DgsState): string {
  const used = new Set<string>();
  getDgsBoardObjects(state.board).forEach((object) => {
    if (isDgsFunction(object)) used.add(String(object.__liaDgsFunctionName || object.name || ''));
    if (isDgsSlider(object)) used.add(String(object.__liaDgsSliderName || ''));
  });
  for (let index = 0; ; index += 1) {
    const letter = String.fromCharCode(102 + (index % 21));
    const suffix = Math.floor(index / 21);
    const name = letter + (suffix ? '_{' + suffix + '}' : '');
    if (!used.has(name)) return name;
  }
}

function findOrCreateDgsPoint(state: DgsState, evt: PointerEvent): any | null {
  const existing = findNearestBoardPoint(state, evt);
  if (existing) return existing;

  const coordinates = eventToUserCoordinates(state, evt);
  if (!coordinates) return null;
  return createDgsPoint(state, coordinates.x, coordinates.y);
}

function isDgsLinearObject(object: any): boolean {
  return !!object && !!(
    object.__liaDgsSegment || object.__liaDgsRay || object.__liaDgsVector || object.__liaDgsLine
  );
}

function findNearestDgsLinearObject(
  state: DgsState,
  evt: MouseEvent | PointerEvent,
  maxDistancePx = 12
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
  if (![originX, originY, unitX, unitY].every(Number.isFinite)) return null;

  let nearest: any | null = null;
  let nearestDistance = maxDistancePx;
  let nearestLayer = -1;
  const seen = new Set<any>();
  const consider = (line: any) => {
    if (!isDgsLinearObject(line) || seen.has(line) || line.__liaDgsShowObject === false) return;
    seen.add(line);
    try {
      if (typeof line.hasPoint === 'function' && line.hasPoint(localX, localY)) {
        const layer = getDgsObjectRenderedLayer(line);
        if (layer >= nearestLayer) {
          nearest = line;
          nearestDistance = 0;
          nearestLayer = layer;
        }
        return;
      }
    } catch (e) {}
    const point1 = line.point1;
    const point2 = line.point2;
    if (!point1 || !point2 || typeof point1.X !== 'function' || typeof point2.X !== 'function') return;
    try {
      const x1 = originX + Number(point1.X()) * unitX;
      const y1 = originY - Number(point1.Y()) * unitY;
      const x2 = originX + Number(point2.X()) * unitX;
      const y2 = originY - Number(point2.Y()) * unitY;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq <= 1e-12) return;
      const rawRatio = ((localX - x1) * dx + (localY - y1) * dy) / lengthSq;
      const ratio = isDgsLine(line)
        ? rawRatio
        : (isDgsRay(line) ? Math.max(0, rawRatio) : Math.max(0, Math.min(1, rawRatio)));
      const distance = Math.hypot(localX - (x1 + ratio * dx), localY - (y1 + ratio * dy));
      const layer = getDgsObjectRenderedLayer(line);
      if (distance <= maxDistancePx &&
          (layer > nearestLayer || (layer === nearestLayer && distance <= nearestDistance))) {
        nearest = line;
        nearestDistance = distance;
        nearestLayer = layer;
      }
    } catch (e) {}
  };
  if (Array.isArray(board.objectsList)) board.objectsList.forEach(consider);
  if (board.objects && typeof board.objects === 'object') {
    Object.keys(board.objects).forEach((key) => consider(board.objects[key]));
  }
  return nearest;
}

function isDgsFunctionTarget(object: any): boolean {
  return !!object && typeof object.Y === 'function' && (
    isDgsFunction(object) ||
    object.__liaDgsAnalysisFunction === true ||
    String(object.elType || '').toLowerCase() === 'functiongraph'
  );
}

function isDgsExternalFunctionAnalysisTarget(object: any): boolean {
  return !!object && object.__liaDgsAnalysisFunction === true &&
    !isDgsFunction(object) && typeof object.Y === 'function' &&
    !!String(object.__liaDgsPersistentId || '');
}

function isDgsTangentTarget(object: any): boolean {
  return isDgsFunctionTarget(object) || isDgsLinearObject(object) || isDgsCircle(object);
}

function isDgsIntersectionTarget(object: any): boolean {
  return isDgsTangentTarget(object) ||
    (isDgsCompassArc(object) && !object.__liaDgsCompassDraft);
}

function findDgsTangentTarget(state: DgsState, evt: PointerEvent): any | null {
  const context = findDgsContextObject(state, evt as any);
  if (isDgsTangentTarget(context)) return context;
  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  let nearest: any | null = null;
  let layer = -1;
  getDgsBoardObjects(state.board).forEach((object) => {
    if (!isDgsFunctionTarget(object) && !isDgsCircle(object)) return;
    let hit = false;
    try {
      hit = isDgsCircle(object)
        ? dgsCircleContainsPointer(state, object, localX, localY)
        : (typeof object.hasPoint === 'function' && object.hasPoint(localX, localY));
    } catch (e) {}
    const objectLayer = getDgsObjectRenderedLayer(object);
    if (hit && objectLayer >= layer) {
      nearest = object;
      layer = objectLayer;
    }
  });
  return nearest || findNearestDgsLinearObject(state, evt);
}

function findDgsIntersectionTarget(state: DgsState, evt: PointerEvent): any | null {
  const context = findDgsContextObject(state, evt as any);
  if (isDgsIntersectionTarget(context)) return context;
  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  let nearest: any | null = null;
  let layer = -1;
  getDgsBoardObjects(state.board).forEach((object) => {
    if (!isDgsFunctionTarget(object) && !isDgsCircle(object) && !isDgsCompassArc(object)) return;
    if (object.__liaDgsCompassDraft || object.__liaDgsShowObject === false) return;
    let hit = false;
    try {
      hit = isDgsCircle(object)
        ? dgsCircleContainsPointer(state, object, localX, localY)
        : (typeof object.hasPoint === 'function' && object.hasPoint(localX, localY));
    } catch (e) {}
    const objectLayer = getDgsObjectRenderedLayer(object);
    if (hit && objectLayer >= layer) {
      nearest = object;
      layer = objectLayer;
    }
  });
  return nearest || findNearestDgsLinearObject(state, evt);
}

function findDgsRootTarget(state: DgsState, evt: PointerEvent, functionsOnly = false): any | null {
  const context = findDgsContextObject(state, evt as any);
  if (isDgsFunctionTarget(context) || (!functionsOnly && isDgsLinearObject(context))) return context;
  if (!functionsOnly) {
    const line = findNearestDgsLinearObject(state, evt);
    if (line) return line;
  }
  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  let nearest: any | null = null;
  let layer = -1;
  const seen = new Set<any>();
  const consider = (object: any) => {
    if (!isDgsFunctionTarget(object) || seen.has(object)) return;
    seen.add(object);
    try {
      if (typeof object.evalVisProp === 'function' && object.evalVisProp('visible') === false) return;
      if (typeof object.hasPoint !== 'function' || !object.hasPoint(localX, localY)) return;
      const objectLayer = getDgsObjectRenderedLayer(object);
      if (objectLayer >= layer) {
        nearest = object;
        layer = objectLayer;
      }
    } catch (e) {}
  };
  if (Array.isArray(state.board && state.board.objectsList)) state.board.objectsList.forEach(consider);
  if (state.board && state.board.objects && typeof state.board.objects === 'object') {
    Object.keys(state.board.objects).forEach((key) => consider(state.board.objects[key]));
  }
  return nearest;
}

function getDgsLinearRoot(source: any): number[] {
  let x = NaN;
  try {
    const form = source.stdform;
    if (Array.isArray(form) && form.length >= 3) {
      const constant = Number(form[0]);
      const xCoefficient = Number(form[1]);
      if (Number.isFinite(constant) && Number.isFinite(xCoefficient) && Math.abs(xCoefficient) > 1e-12) {
        x = -constant / xCoefficient;
      }
    }
    if (!Number.isFinite(x)) {
      const x1 = Number(source.point1.X());
      const y1 = Number(source.point1.Y());
      const x2 = Number(source.point2.X());
      const y2 = Number(source.point2.Y());
      const dy = y2 - y1;
      if (Math.abs(dy) <= 1e-12) return [];
      x = x1 - y1 * (x2 - x1) / dy;
    }
  } catch (e) { return []; }
  if (!Number.isFinite(x)) return [];
  try {
    if (!isDgsLine(source)) {
      const x1 = Number(source.point1.X());
      const y1 = Number(source.point1.Y());
      const x2 = Number(source.point2.X());
      const y2 = Number(source.point2.Y());
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq <= 1e-12) return [];
      const ratio = ((x - x1) * dx + (0 - y1) * dy) / lengthSq;
      if (isDgsRay(source) ? ratio < -1e-8 : (ratio < -1e-8 || ratio > 1 + 1e-8)) return [];
    }
  } catch (e) { return []; }
  return [x];
}

function getDgsFunctionRoots(state: DgsState, source: any): number[] {
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  const xmin = Number(bbox[0]);
  const xmax = Number(bbox[2]);
  const span = xmax - xmin;
  if (!Number.isFinite(span) || span <= 0 || typeof source.Y !== 'function') return [];
  const evaluate = (x: number) => {
    try {
      const value = Number(source.Y(x));
      return Number.isFinite(value) ? value : NaN;
    } catch (e) { return NaN; }
  };
  const samples = Math.max(500, Math.min(1600, Math.round(Number(state.board.canvasWidth || 600) * 1.5)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const x = xmin + span * index / samples;
    xs.push(x);
    ys.push(evaluate(x));
  }
  const finiteValues = ys.filter(Number.isFinite);
  if (finiteValues.length && finiteValues.filter((value) => Math.abs(value) <= 1e-7).length > finiteValues.length * 0.9) {
    return [];
  }
  const roots: number[] = [];
  const xTolerance = Math.max(1e-9, span * 1e-8);
  const yTolerance = 1e-7;
  const addRoot = (value: number) => {
    if (!Number.isFinite(value) || value < xmin - xTolerance || value > xmax + xTolerance) return;
    if (Math.abs(evaluate(value)) > yTolerance) return;
    if (!roots.some((root) => Math.abs(root - value) <= Math.max(xTolerance * 10, span / samples * 0.15))) {
      roots.push(value);
    }
  };
  for (let index = 0; index < samples; index += 1) {
    const leftY = ys[index];
    const rightY = ys[index + 1];
    if (!Number.isFinite(leftY) || !Number.isFinite(rightY)) continue;
    if (Math.abs(leftY) <= yTolerance) addRoot(xs[index]);
    if (leftY * rightY < 0) {
      let left = xs[index];
      let right = xs[index + 1];
      let fLeft = leftY;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const middle = (left + right) / 2;
        const fMiddle = evaluate(middle);
        if (!Number.isFinite(fMiddle)) break;
        if (Math.abs(fMiddle) <= yTolerance || right - left <= xTolerance) {
          left = middle;
          right = middle;
          break;
        }
        if (fLeft * fMiddle <= 0) right = middle;
        else { left = middle; fLeft = fMiddle; }
      }
      addRoot((left + right) / 2);
    }
  }
  if (Number.isFinite(ys[samples]) && Math.abs(ys[samples]) <= yTolerance) addRoot(xs[samples]);
  for (let index = 1; index < samples; index += 1) {
    if (!Number.isFinite(ys[index]) || Math.abs(ys[index]) > Math.abs(ys[index - 1]) ||
        Math.abs(ys[index]) > Math.abs(ys[index + 1])) continue;
    let x = xs[index];
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const value = evaluate(x);
      const h = Math.max(1e-7, span * 1e-6);
      const derivative = (evaluate(x + h) - evaluate(x - h)) / (2 * h);
      if (!Number.isFinite(value) || !Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
      const next = x - value / derivative;
      if (!Number.isFinite(next) || next < xmin || next > xmax) break;
      const delta = Math.abs(next - x);
      x = next;
      if (delta <= xTolerance) break;
    }
    addRoot(x);
  }
  return roots.sort((a, b) => a - b);
}

function getDgsRoots(state: DgsState, source: any): number[] {
  return isDgsLinearObject(source)
    ? getDgsLinearRoot(source)
    : (isDgsFunctionTarget(source) ? getDgsFunctionRoots(state, source) : []);
}

type DgsAnalysisPosition = { x: number; y: number };

function getDgsLineData(source: any): { x: number; y: number; dx: number; dy: number } | null {
  if (!isDgsLinearObject(source)) return null;
  try {
    const x = Number(source.point1.X());
    const y = Number(source.point1.Y());
    const dx = Number(source.point2.X()) - x;
    const dy = Number(source.point2.Y()) - y;
    return [x, y, dx, dy].every(Number.isFinite) && Math.hypot(dx, dy) > 1e-12
      ? { x, y, dx, dy }
      : null;
  } catch (e) { return null; }
}

function isPointOnDgsLinearObject(source: any, x: number, y: number): boolean {
  const line = getDgsLineData(source);
  if (!line) return false;
  if (isDgsLine(source)) return true;
  const lengthSq = line.dx * line.dx + line.dy * line.dy;
  const ratio = ((x - line.x) * line.dx + (y - line.y) * line.dy) / lengthSq;
  return isDgsRay(source)
    ? ratio >= -1e-8
    : ratio >= -1e-8 && ratio <= 1 + 1e-8;
}

function getDgsCircleData(source: any): { x: number; y: number; radius: number } | null {
  if (!isDgsCircle(source)) return null;
  try {
    const center = source.__liaDgsCircleCenter || source.center;
    const x = Number(center.X());
    const y = Number(center.Y());
    let radius = NaN;
    if (source.__liaDgsCircleRadiusPoint) {
      radius = Math.hypot(
        Number(source.__liaDgsCircleRadiusPoint.X()) - x,
        Number(source.__liaDgsCircleRadiusPoint.Y()) - y
      );
    } else if (typeof source.Radius === 'function') radius = Number(source.Radius());
    return [x, y, radius].every(Number.isFinite) && radius > 1e-12
      ? { x, y, radius }
      : null;
  } catch (e) { return null; }
}

function getDgsIntersectionCircleData(
  source: any
): { x: number; y: number; radius: number } | null {
  const circle = getDgsCircleData(source);
  if (circle) return circle;
  if (!isDgsCompassArc(source) || source.__liaDgsCompassDraft) return null;
  const geometry = getDgsCompassArcGeometry(source);
  return [geometry.cx, geometry.cy, geometry.radius].every(Number.isFinite) &&
    geometry.radius > 1e-12
    ? { x: geometry.cx, y: geometry.cy, radius: geometry.radius }
    : null;
}

function normalizeDgsPositiveAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = angle % fullTurn;
  return normalized < 0 ? normalized + fullTurn : normalized;
}

function isPointOnDgsCompassArc(
  arc: any,
  x: number,
  y: number,
  tolerance: number
): boolean {
  if (!isDgsCompassArc(arc) || arc.__liaDgsCompassDraft) return false;
  const geometry = getDgsCompassArcGeometry(arc);
  if (![geometry.cx, geometry.cy, geometry.radius, geometry.startAngle, geometry.sweepAngle, x, y]
      .every(Number.isFinite) || geometry.radius <= 1e-12) return false;
  const radialTolerance = Math.max(Math.abs(tolerance) * 8, geometry.radius * 1e-7, 1e-9);
  if (Math.abs(Math.hypot(x - geometry.cx, y - geometry.cy) - geometry.radius) > radialTolerance) {
    return false;
  }
  const fullTurn = Math.PI * 2;
  const angularTolerance = Math.max(1e-8, radialTolerance / geometry.radius);
  const sweep = Math.abs(geometry.sweepAngle);
  if (sweep >= fullTurn - angularTolerance) return true;
  const angle = Math.atan2(y - geometry.cy, x - geometry.cx);
  const progress = geometry.sweepAngle >= 0
    ? normalizeDgsPositiveAngle(angle - geometry.startAngle)
    : normalizeDgsPositiveAngle(geometry.startAngle - angle);
  return progress <= sweep + angularTolerance || fullTurn - progress <= angularTolerance;
}

function getDgsIntersectionPositions(
  state: DgsState,
  first: any,
  second: any
): DgsAnalysisPosition[] {
  if (!isDgsIntersectionTarget(first) || !isDgsIntersectionTarget(second) || first === second) return [];
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  const span = Math.max(1e-9, Number(bbox[2]) - Number(bbox[0]));
  const tolerance = span * 1e-7;
  const positions: DgsAnalysisPosition[] = [];
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        x < Number(bbox[0]) - tolerance || x > Number(bbox[2]) + tolerance ||
        y > Number(bbox[1]) + tolerance || y < Number(bbox[3]) - tolerance) return;
    if ((isDgsCompassArc(first) && !isPointOnDgsCompassArc(first, x, y, tolerance)) ||
        (isDgsCompassArc(second) && !isPointOnDgsCompassArc(second, x, y, tolerance))) return;
    if (!positions.some((point) => Math.hypot(point.x - x, point.y - y) <= tolerance * 4)) {
      positions.push({ x, y });
    }
  };

  const firstFunction = isDgsFunctionTarget(first);
  const secondFunction = isDgsFunctionTarget(second);
  if (firstFunction || secondFunction) {
    const graph = firstFunction ? first : second;
    const other = firstFunction ? second : first;
    const otherLine = getDgsLineData(other);
    const otherCircle = getDgsIntersectionCircleData(other);
    const evaluateGraph = (x: number) => {
      try {
        const y = Number(graph.Y(x));
        return Number.isFinite(y) ? y : NaN;
      } catch (e) { return NaN; }
    };
    const difference = {
      Y: (x: number) => {
        const y = evaluateGraph(x);
        if (!Number.isFinite(y)) return NaN;
        if (isDgsFunctionTarget(other)) {
          try {
            const otherY = Number(other.Y(x));
            return Number.isFinite(otherY) ? y - otherY : NaN;
          } catch (e) { return NaN; }
        }
        if (otherLine) {
          return otherLine.dy * (x - otherLine.x) - otherLine.dx * (y - otherLine.y);
        }
        if (otherCircle) {
          return (x - otherCircle.x) * (x - otherCircle.x) +
            (y - otherCircle.y) * (y - otherCircle.y) -
            otherCircle.radius * otherCircle.radius;
        }
        return NaN;
      }
    };
    getDgsFunctionRoots(state, difference).forEach((x) => {
      const y = evaluateGraph(x);
      if (otherLine && !isPointOnDgsLinearObject(other, x, y)) return;
      add(x, y);
    });
    return positions.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  const firstLine = getDgsLineData(first);
  const secondLine = getDgsLineData(second);
  const firstCircle = getDgsIntersectionCircleData(first);
  const secondCircle = getDgsIntersectionCircleData(second);
  if (firstLine && secondLine) {
    const determinant = firstLine.dx * secondLine.dy - firstLine.dy * secondLine.dx;
    if (Math.abs(determinant) <= 1e-12) return [];
    const offsetX = secondLine.x - firstLine.x;
    const offsetY = secondLine.y - firstLine.y;
    const ratio = (offsetX * secondLine.dy - offsetY * secondLine.dx) / determinant;
    const x = firstLine.x + ratio * firstLine.dx;
    const y = firstLine.y + ratio * firstLine.dy;
    if (isPointOnDgsLinearObject(first, x, y) && isPointOnDgsLinearObject(second, x, y)) add(x, y);
    return positions;
  }

  const lineSource = firstLine ? first : (secondLine ? second : null);
  const line = firstLine || secondLine;
  const circle = firstCircle || secondCircle;
  if (line && circle && lineSource) {
    const offsetX = line.x - circle.x;
    const offsetY = line.y - circle.y;
    const a = line.dx * line.dx + line.dy * line.dy;
    const b = 2 * (offsetX * line.dx + offsetY * line.dy);
    const c = offsetX * offsetX + offsetY * offsetY - circle.radius * circle.radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -1e-10) return [];
    const root = Math.sqrt(Math.max(0, discriminant));
    const ratios = root <= 1e-10 ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
    ratios.forEach((ratio) => {
      const x = line.x + ratio * line.dx;
      const y = line.y + ratio * line.dy;
      if (isPointOnDgsLinearObject(lineSource, x, y)) add(x, y);
    });
    return positions.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  if (firstCircle && secondCircle) {
    const dx = secondCircle.x - firstCircle.x;
    const dy = secondCircle.y - firstCircle.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1e-12 || distance > firstCircle.radius + secondCircle.radius + tolerance ||
        distance < Math.abs(firstCircle.radius - secondCircle.radius) - tolerance) return [];
    const along = (
      firstCircle.radius * firstCircle.radius -
      secondCircle.radius * secondCircle.radius +
      distance * distance
    ) / (2 * distance);
    const height = Math.sqrt(Math.max(0, firstCircle.radius * firstCircle.radius - along * along));
    const baseX = firstCircle.x + along * dx / distance;
    const baseY = firstCircle.y + along * dy / distance;
    const perpendicularX = -dy / distance;
    const perpendicularY = dx / distance;
    add(baseX + height * perpendicularX, baseY + height * perpendicularY);
    if (height > tolerance) add(baseX - height * perpendicularX, baseY - height * perpendicularY);
  }
  return positions.sort((a, b) => a.x - b.x || a.y - b.y);
}

function getDgsYIntercept(state: DgsState, source: any): DgsAnalysisPosition[] {
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  if (0 < Number(bbox[0]) || 0 > Number(bbox[2])) return [];

  if (isDgsFunctionTarget(source) && typeof source.Y === 'function') {
    try {
      const y = Number(source.Y(0));
      return Number.isFinite(y) ? [{ x: 0, y }] : [];
    } catch (e) { return []; }
  }
  if (!isDgsLinearObject(source)) return [];

  let y = NaN;
  try {
    const form = source.stdform;
    if (Array.isArray(form) && form.length >= 3) {
      const constant = Number(form[0]);
      const yCoefficient = Number(form[2]);
      if (Number.isFinite(constant) && Number.isFinite(yCoefficient) && Math.abs(yCoefficient) > 1e-12) {
        y = -constant / yCoefficient;
      }
    }
    const x1 = Number(source.point1.X());
    const y1 = Number(source.point1.Y());
    const x2 = Number(source.point2.X());
    const y2 = Number(source.point2.Y());
    const dx = x2 - x1;
    if (!Number.isFinite(y)) {
      if (Math.abs(dx) <= 1e-12) return [];
      y = y1 + (0 - x1) * (y2 - y1) / dx;
    }
    if (!isDgsLine(source)) {
      if (Math.abs(dx) <= 1e-12) return [];
      const ratio = (0 - x1) / dx;
      if (isDgsRay(source) ? ratio < -1e-8 : (ratio < -1e-8 || ratio > 1 + 1e-8)) return [];
    }
  } catch (e) { return []; }
  return Number.isFinite(y) ? [{ x: 0, y }] : [];
}

function getDgsExtrema(state: DgsState, source: any): DgsAnalysisPosition[] {
  if (!isDgsFunctionTarget(source) || typeof source.Y !== 'function') return [];
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  const span = Number(bbox[2]) - Number(bbox[0]);
  if (!Number.isFinite(span) || span <= 0) return [];
  const evaluate = (x: number) => {
    try {
      const value = Number(source.Y(x));
      return Number.isFinite(value) ? value : NaN;
    } catch (e) { return NaN; }
  };
  const derivativeStep = Math.max(1e-6, span * 1e-5);
  const derivativeSource = {
    Y: (x: number) => {
      const left = evaluate(x - derivativeStep);
      const right = evaluate(x + derivativeStep);
      return Number.isFinite(left) && Number.isFinite(right)
        ? (right - left) / (2 * derivativeStep)
        : NaN;
    }
  };
  const candidates = getDgsFunctionRoots(state, derivativeSource);
  const sideStep = Math.max(derivativeStep * 8, span / 4000);
  const result: DgsAnalysisPosition[] = [];
  candidates.forEach((x) => {
    const y = evaluate(x);
    const left = evaluate(x - sideStep);
    const right = evaluate(x + sideStep);
    if (![x, y, left, right].every(Number.isFinite)) return;
    const scale = Math.max(1, Math.abs(y), Math.abs(left), Math.abs(right));
    const tolerance = scale * 1e-12;
    const minimum = y <= left + tolerance && y <= right + tolerance &&
      (y < left - tolerance || y < right - tolerance);
    const maximum = y >= left - tolerance && y >= right - tolerance &&
      (y > left + tolerance || y > right + tolerance);
    if (minimum || maximum) result.push({ x, y });
  });
  return result;
}

function getDgsInflections(state: DgsState, source: any): DgsAnalysisPosition[] {
  if (!isDgsFunctionTarget(source) || typeof source.Y !== 'function') return [];
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  const span = Number(bbox[2]) - Number(bbox[0]);
  if (!Number.isFinite(span) || span <= 0) return [];
  const evaluate = (x: number) => {
    try {
      const value = Number(source.Y(x));
      return Number.isFinite(value) ? value : NaN;
    } catch (e) { return NaN; }
  };
  const derivativeStep = Math.max(1e-5, span * 1e-4);
  const secondDerivative = (x: number) => {
    const left = evaluate(x - derivativeStep);
    const center = evaluate(x);
    const right = evaluate(x + derivativeStep);
    return [left, center, right].every(Number.isFinite)
      ? (right - 2 * center + left) / (derivativeStep * derivativeStep)
      : NaN;
  };
  const candidates = getDgsFunctionRoots(state, { Y: secondDerivative });
  const sideStep = Math.max(derivativeStep * 8, span / 2000);
  const result: DgsAnalysisPosition[] = [];
  candidates.forEach((x) => {
    const y = evaluate(x);
    const leftCurvature = secondDerivative(x - sideStep);
    const rightCurvature = secondDerivative(x + sideStep);
    if (![x, y, leftCurvature, rightCurvature].every(Number.isFinite)) return;
    const scale = Math.max(1, Math.abs(leftCurvature), Math.abs(rightCurvature));
    const tolerance = scale * 1e-10;
    const changesConcavity =
      (leftCurvature < -tolerance && rightCurvature > tolerance) ||
      (leftCurvature > tolerance && rightCurvature < -tolerance);
    if (changesConcavity) result.push({ x, y });
  });
  return result;
}

function getDgsAnalysisPositions(state: DgsState, construction: any): DgsAnalysisPosition[] {
  if (construction && isDgsFunctionTarget(construction.source)) {
    if (construction.kind === 'roots' && dgsAxisUsesLogY(state.axisScaleMode)) return [];
    if (construction.kind === 'ordinate-intercept' && dgsAxisUsesLogX(state.axisScaleMode)) return [];
  }
  if (construction && construction.kind === 'intersections') {
    return getDgsIntersectionPositions(state, construction.source, construction.source2);
  }
  if (construction && construction.kind === 'extrema') return getDgsExtrema(state, construction.source);
  if (construction && construction.kind === 'inflections') return getDgsInflections(state, construction.source);
  if (construction && construction.kind === 'ordinate-intercept') {
    return getDgsYIntercept(state, construction.source);
  }
  return getDgsRoots(state, construction && construction.source).map((x) => ({ x, y: 0 }));
}

function createDgsRootPoint(
  state: DgsState,
  construction: any,
  position: DgsAnalysisPosition
): any | null {
  const name = getNextPointName(state);
  const holder = { x: position.x, y: position.y };
  const extremum = construction && construction.kind === 'extrema';
  const inflection = construction && construction.kind === 'inflections';
  const yIntercept = construction && construction.kind === 'ordinate-intercept';
  const intersection = construction && construction.kind === 'intersections';
  const labelColor = getNeutralColor();
  try {
    const point = state.board.create('point', [
      function() { return holder.x; },
      function() { return holder.y; }
    ], {
      name: '\\(' + name + '\\)',
      fixed: true,
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
    point.__liaDgsRootPoint = !extremum && !inflection && !yIntercept && !intersection;
    point.__liaDgsExtremumPoint = extremum;
    point.__liaDgsInflectionPoint = inflection;
    point.__liaDgsYInterceptPoint = yIntercept;
    point.__liaDgsIntersectionPoint = intersection;
    point.__liaDgsAnalysisConstruction = construction;
    if (extremum) point.__liaDgsExtremaConstruction = construction;
    else if (inflection) point.__liaDgsInflectionConstruction = construction;
    else if (yIntercept) point.__liaDgsYInterceptConstruction = construction;
    else if (intersection) point.__liaDgsIntersectionConstruction = construction;
    else point.__liaDgsRootConstruction = construction;
    point.__liaDgsRootHolder = holder;
    point.__liaDgsLanguage = state.language;
    point.__liaDgsColor = '#ff00ff';
    point.__liaDgsTextColor = labelColor;
    point.__liaDgsLineColor = '#ff00ff';
    point.__liaDgsFillColor = '#ff00ff';
    point.__liaDgsShowName = true;
    point.__liaDgsShowValue = false;
    point.__liaDgsShowObject = true;
    point.__liaDgsOpacity = 1;
    point.__liaPointVisual = { color: '#ff00ff', opacity: 1, hasExplicitColor: false };
    window.__points = window.__points || {};
    window.__points[state.boardId] = window.__points[state.boardId] || {};
    window.__points[state.boardId][name] = point;
    refreshDgsObjectLabel(point);
    return point;
  } catch (e) {
    return null;
  }
}

function removeDgsRootPoint(state: DgsState, point: any): void {
  if (!point) return;
  const name = String(point.__liaDgsPointName || '');
  try {
    if (window.__points && window.__points[state.boardId] && window.__points[state.boardId][name] === point) {
      delete window.__points[state.boardId][name];
    }
    if (window.__pointStates && window.__pointStates[state.boardId]) delete window.__pointStates[state.boardId][name];
  } catch (e) {}
  try { state.board.removeObject(point); } catch (e) {}
}

function updateDgsRootConstruction(state: DgsState, construction: any): boolean {
  if (!construction || !construction.source) return false;
  const positions = getDgsAnalysisPositions(state, construction);
  let changed = false;
  while (construction.points.length > positions.length) {
    removeDgsRootPoint(state, construction.points.pop());
    changed = true;
  }
  while (construction.points.length < positions.length) {
    const point = createDgsRootPoint(state, construction, positions[construction.points.length]);
    if (!point) break;
    construction.points.push(point);
    changed = true;
  }
  construction.points.forEach((point: any, index: number) => {
    const holder = point && point.__liaDgsRootHolder;
    const position = positions[index];
    if (!holder || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    if (Math.abs(Number(holder.x) - position.x) > 1e-10 ||
        Math.abs(Number(holder.y) - position.y) > 1e-10) {
      holder.x = position.x;
      holder.y = position.y;
      changed = true;
    }
    refreshSideMenusForObject(point);
  });
  return changed;
}

function createDgsAnalysisConstruction(
  state: DgsState,
  source: any,
  kind: 'roots' | 'extrema' | 'inflections' | 'ordinate-intercept'
): any | null {
  if (!source || (!isDgsLinearObject(source) && !isDgsFunctionTarget(source))) return null;
  if ((kind === 'extrema' || kind === 'inflections') && !isDgsFunctionTarget(source)) return null;
  if (isDgsFunctionTarget(source) && kind === 'roots' && dgsAxisUsesLogY(state.axisScaleMode)) return null;
  if (isDgsFunctionTarget(source) && kind === 'ordinate-intercept' && dgsAxisUsesLogX(state.axisScaleMode)) return null;
  const property = kind === 'extrema'
    ? '__liaDgsExtremaConstruction'
    : (kind === 'inflections'
      ? '__liaDgsInflectionConstruction'
      : (kind === 'ordinate-intercept' ? '__liaDgsYInterceptConstruction' : '__liaDgsRootConstruction'));
  const existing = source[property];
  if (existing && Array.isArray(existing.points) && existing.points.every((point: any) => !point || point.board === state.board)) {
    if (existing.__liaDgsMacroManaged) return existing;
    if (!state.rootConstructions.includes(existing)) state.rootConstructions.push(existing);
    updateDgsRootConstruction(state, existing);
    return existing;
  }
  const construction = { kind, source, points: [] as any[] };
  source[property] = construction;
  state.rootConstructions.push(construction);
  updateDgsRootConstruction(state, construction);
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  return construction;
}

function createDgsRootConstruction(state: DgsState, source: any): any | null {
  return createDgsAnalysisConstruction(state, source, 'roots');
}

function createDgsIntersectionConstruction(state: DgsState, first: any, second: any): any | null {
  if (!isDgsIntersectionTarget(first) || !isDgsIntersectionTarget(second) || first === second) return null;
  const candidates = state.rootConstructions.concat(
    Array.isArray(first.__liaDgsIntersectionConstructions)
      ? first.__liaDgsIntersectionConstructions
      : []
  );
  const existing = candidates.find((construction) =>
    construction && construction.kind === 'intersections' &&
    ((construction.source === first && construction.source2 === second) ||
     (construction.source === second && construction.source2 === first) ||
     (construction.__liaDgsSource === first && construction.__liaDgsSource2 === second) ||
     (construction.__liaDgsSource === second && construction.__liaDgsSource2 === first)) &&
    Array.isArray(construction.points) &&
    construction.points.every((point: any) => !point || point.board === state.board)
  );
  if (existing) {
    if (existing.__liaDgsMacroManaged) return existing;
    if (!state.rootConstructions.includes(existing)) state.rootConstructions.push(existing);
    updateDgsRootConstruction(state, existing);
    return existing;
  }
  const construction = {
    kind: 'intersections',
    source: first,
    source2: second,
    points: [] as any[]
  };
  first.__liaDgsIntersectionConstructions = Array.isArray(first.__liaDgsIntersectionConstructions)
    ? first.__liaDgsIntersectionConstructions
    : [];
  second.__liaDgsIntersectionConstructions = Array.isArray(second.__liaDgsIntersectionConstructions)
    ? second.__liaDgsIntersectionConstructions
    : [];
  first.__liaDgsIntersectionConstructions.push(construction);
  second.__liaDgsIntersectionConstructions.push(construction);
  state.rootConstructions.push(construction);
  updateDgsRootConstruction(state, construction);
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  return construction;
}

function removeDgsRootConstruction(state: DgsState, construction: any, updateBoard = true): void {
  if (!construction) return;
  (construction.points || []).slice().forEach((point: any) => removeDgsRootPoint(state, point));
  construction.points = [];
  if (construction.source && construction.source.__liaDgsRootConstruction === construction) {
    delete construction.source.__liaDgsRootConstruction;
  }
  if (construction.source && construction.source.__liaDgsExtremaConstruction === construction) {
    delete construction.source.__liaDgsExtremaConstruction;
  }
  if (construction.source && construction.source.__liaDgsInflectionConstruction === construction) {
    delete construction.source.__liaDgsInflectionConstruction;
  }
  if (construction.source && construction.source.__liaDgsYInterceptConstruction === construction) {
    delete construction.source.__liaDgsYInterceptConstruction;
  }
  [construction.source, construction.source2].forEach((source) => {
    if (!source || !Array.isArray(source.__liaDgsIntersectionConstructions)) return;
    source.__liaDgsIntersectionConstructions =
      source.__liaDgsIntersectionConstructions.filter((candidate: any) => candidate !== construction);
  });
  const index = state.rootConstructions.indexOf(construction);
  if (index >= 0) state.rootConstructions.splice(index, 1);
  if (state.contextObject && state.contextObject.__liaDgsAnalysisConstruction === construction) {
    setSideMenuOpen(state, false);
  }
  if (updateBoard) {
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  }
}

function scheduleDgsRootUpdate(state: DgsState): void {
  if (!state || !state.rootConstructions.length || state.rootUpdateRAF != null) return;
  state.rootUpdateRAF = requestAnimationFrame(() => {
    state.rootUpdateRAF = undefined;
    if (state.rootUpdating) return;
    state.rootUpdating = true;
    let changed = false;
    try {
      state.rootConstructions.slice().forEach((construction) => {
        changed = updateDgsRootConstruction(state, construction) || changed;
      });
    } finally {
      state.rootUpdating = false;
    }
    if (changed) {
      try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    }
  });
}

function setSelectedSegmentPoint(state: DgsState, point: any | null): void {
  const previousNode = state.selectedSegmentPoint && state.selectedSegmentPoint.rendNode;
  try { if (previousNode && previousNode.classList) previousNode.classList.remove('lia-dgs-segment-endpoint'); } catch (e) {}

  state.selectedSegmentPoint = point || null;
  const nextNode = state.selectedSegmentPoint && state.selectedSegmentPoint.rendNode;
  try { if (nextNode && nextNode.classList) nextNode.classList.add('lia-dgs-segment-endpoint'); } catch (e) {}
}

function setSelectedCompassPoints(state: DgsState, center: any | null, point: any | null): void {
  [state.selectedCompassCenter, state.selectedCompassPoint].forEach((candidate) => {
    const node = candidate && candidate.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-relation-source'); } catch (e) {}
  });
  state.selectedCompassCenter = center || null;
  state.selectedCompassPoint = point || null;
  [state.selectedCompassCenter, state.selectedCompassPoint].forEach((candidate) => {
    const node = candidate && candidate.rendNode;
    try { if (node && node.classList) node.classList.add('lia-dgs-relation-source'); } catch (e) {}
  });
}

function releaseDgsCompassPointer(state: DgsState): void {
  const pointerId = state.compassPointerId;
  state.compassPointerId = null;
  if (pointerId == null) return;
  try {
    if (state.boardContainer.hasPointerCapture(pointerId)) {
      state.boardContainer.releasePointerCapture(pointerId);
    }
  } catch (e) {}
}

function removeDgsCompassPreview(state: DgsState, preview: any): void {
  if (!preview || !preview.__liaDgsCompassDraft) return;
  try {
    if (preview.__liaDgsCompassArcLabel) state.board.removeObject(preview.__liaDgsCompassArcLabel);
  } catch (e) {}
  try { state.board.removeObject(preview); } catch (e) {}
}

function clearDgsCompassInteraction(state: DgsState, removePreview = true): void {
  releaseDgsCompassPointer(state);
  if (removePreview && state.compassPreview && state.compassPreview.__liaDgsCompassDraft &&
      state.selectedCompassCenter && state.selectedCompassPoint &&
      Number.isFinite(state.compassRadius) && state.compassRadius > 0) {
    let centerX = NaN;
    let centerY = NaN;
    try {
      centerX = Number(state.selectedCompassCenter.X());
      centerY = Number(state.selectedCompassCenter.Y());
    } catch (e) {}
    if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
      setDgsPointPosition(
        state.selectedCompassPoint,
        centerX + state.compassRadius * Math.cos(state.compassStartAngle),
        centerY + state.compassRadius * Math.sin(state.compassStartAngle)
      );
    }
  }
  if (removePreview && state.compassPreview) removeDgsCompassPreview(state, state.compassPreview);
  state.compassPreview = null;
  state.compassStartAngle = 0;
  state.compassLastAngle = 0;
  state.compassSweep = 0;
  state.compassRadius = 0;
  state.compassMoved = false;
  setSelectedCompassPoints(state, null, null);
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
}

function startDgsCompassDrag(state: DgsState, evt: PointerEvent): boolean {
  const center = state.selectedCompassCenter;
  const point = state.selectedCompassPoint;
  const preview = state.compassPreview;
  if (!center || !point || !isDgsCompassArc(preview)) return false;
  let angle = NaN;
  try {
    angle = Math.atan2(Number(point.Y()) - Number(center.Y()), Number(point.X()) - Number(center.X()));
  } catch (e) {}
  if (!Number.isFinite(angle)) return false;
  state.compassStartAngle = angle;
  state.compassLastAngle = angle;
  state.compassSweep = 0;
  state.compassMoved = false;
  preview.__liaDgsCompassStartAngle = angle;
  preview.__liaDgsCompassSweepAngle = 0;
  state.compassPointerId = evt.pointerId;
  try { state.boardContainer.setPointerCapture(evt.pointerId); } catch (e) {}
  return true;
}

function updateDgsCompassDrag(state: DgsState, evt: PointerEvent): boolean {
  if (state.compassPointerId == null || evt.pointerId !== state.compassPointerId ||
      !state.selectedCompassCenter || !state.selectedCompassPoint ||
      !isDgsCompassArc(state.compassPreview)) return false;
  const coordinates = eventToUserCoordinates(state, evt);
  if (!coordinates) return false;
  let centerX = NaN;
  let centerY = NaN;
  try {
    centerX = Number(state.selectedCompassCenter.X());
    centerY = Number(state.selectedCompassCenter.Y());
  } catch (e) {}
  const pointerDx = coordinates.x - centerX;
  const pointerDy = coordinates.y - centerY;
  if (![centerX, centerY, pointerDx, pointerDy].every(Number.isFinite) ||
      Math.hypot(pointerDx, pointerDy) <= 1e-12) return false;
  const angle = Math.atan2(pointerDy, pointerDx);
  const delta = Math.atan2(
    Math.sin(angle - state.compassLastAngle),
    Math.cos(angle - state.compassLastAngle)
  );
  if (!Number.isFinite(delta)) return false;
  state.compassLastAngle = angle;
  state.compassSweep += delta;
  const targetX = centerX + state.compassRadius * Math.cos(angle);
  const targetY = centerY + state.compassRadius * Math.sin(angle);
  if (!setDgsPointPosition(state.selectedCompassPoint, targetX, targetY)) return false;
  state.compassPreview.__liaDgsCompassRadius = state.compassRadius;
  state.compassPreview.__liaDgsCompassStartAngle = state.compassStartAngle;
  state.compassPreview.__liaDgsCompassSweepAngle = state.compassSweep;
  const unitX = Math.abs(Number(state.board && state.board.unitX) || 1);
  const unitY = Math.abs(Number(state.board && state.board.unitY) || 1);
  const sweptPixels = Math.abs(state.compassSweep) * state.compassRadius * Math.min(unitX, unitY);
  state.compassMoved = state.compassMoved || sweptPixels >= 3;
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  return true;
}

function finishDgsCompassDrag(state: DgsState, evt: PointerEvent, cancelled = false): void {
  if (state.compassPointerId == null || evt.pointerId !== state.compassPointerId) return;
  releaseDgsCompassPointer(state);
  if (cancelled) {
    clearDgsCompassInteraction(state, true);
    return;
  }
  const preview = state.compassPreview;
  const center = state.selectedCompassCenter;
  const point = state.selectedCompassPoint;
  if (!preview || !center || !point) {
    clearDgsCompassInteraction(state, true);
    return;
  }
  if (!state.compassMoved || Math.abs(state.compassSweep) <= 1e-7) {
    let centerX = NaN;
    let centerY = NaN;
    try { centerX = Number(center.X()); centerY = Number(center.Y()); } catch (e) {}
    setDgsPointPosition(
      point,
      centerX + state.compassRadius * Math.cos(state.compassStartAngle),
      centerY + state.compassRadius * Math.sin(state.compassStartAngle)
    );
    state.compassSweep = 0;
    state.compassLastAngle = state.compassStartAngle;
    state.compassMoved = false;
    preview.__liaDgsCompassSweepAngle = 0;
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return;
  }
  preview.__liaDgsCompassSweepAngle = state.compassSweep;
  if (!finalizeDgsCompassArc(state, preview)) {
    clearDgsCompassInteraction(state, true);
    return;
  }
  state.compassPreview = null;
  updateDgsCoordinatePointState(state, point);
  persistDgsConstruction(state);
  setActiveTool(state, '', false);
}

function setSelectedFormatSource(state: DgsState, object: any | null): void {
  const toggle = (candidate: any, active: boolean) => {
    try {
      const node = candidate && candidate.rendNode;
      if (node && node.classList) node.classList.toggle('lia-dgs-format-source', active);
    } catch (e) {}
  };
  toggle(state.selectedFormatSource, false);
  getDgsFontCandidates(state.selectedFormatSource).forEach((candidate) => toggle(candidate, false));
  state.selectedFormatSource = object || null;
  toggle(state.selectedFormatSource, true);
  getDgsFontCandidates(state.selectedFormatSource).forEach((candidate) => toggle(candidate, true));
  renderToolState(state);
}

function setSelectedRelationInputs(state: DgsState, line: any | null, point: any | null): void {
  [state.selectedRelationLine, state.selectedRelationPoint].forEach((object) => {
    const node = object && object.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-relation-source'); } catch (e) {}
  });
  state.selectedRelationLine = line || null;
  state.selectedRelationPoint = point || null;
  [state.selectedRelationLine, state.selectedRelationPoint].forEach((object) => {
    const node = object && object.rendNode;
    try { if (node && node.classList) node.classList.add('lia-dgs-relation-source'); } catch (e) {}
  });
}

function setSelectedMidpointPoint(state: DgsState, point: any | null): void {
  const previousNode = state.selectedMidpointPoint && state.selectedMidpointPoint.rendNode;
  try { if (previousNode && previousNode.classList) previousNode.classList.remove('lia-dgs-relation-source'); } catch (e) {}
  state.selectedMidpointPoint = point || null;
  const nextNode = state.selectedMidpointPoint && state.selectedMidpointPoint.rendNode;
  try { if (nextNode && nextNode.classList) nextNode.classList.add('lia-dgs-relation-source'); } catch (e) {}
}

function setSelectedBisectorPoints(state: DgsState, points: any[]): void {
  state.selectedBisectorPoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-relation-source'); } catch (e) {}
  });
  state.selectedBisectorPoints = Array.isArray(points) ? points.slice() : [];
  state.selectedBisectorPoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.add('lia-dgs-relation-source'); } catch (e) {}
  });
}

function setSelectedIntersectionObject(state: DgsState, object: any | null): void {
  const previousNode = state.selectedIntersectionObject && state.selectedIntersectionObject.rendNode;
  try { if (previousNode && previousNode.classList) previousNode.classList.remove('lia-dgs-relation-source'); } catch (e) {}
  state.selectedIntersectionObject = object || null;
  const nextNode = state.selectedIntersectionObject && state.selectedIntersectionObject.rendNode;
  try { if (nextNode && nextNode.classList) nextNode.classList.add('lia-dgs-relation-source'); } catch (e) {}
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

function setSelectedSectorPoints(state: DgsState, points: any[]): void {
  state.selectedSectorPoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.remove('lia-dgs-angle-point'); } catch (e) {}
  });
  state.selectedSectorPoints = Array.isArray(points) ? points.slice() : [];
  state.selectedSectorPoints.forEach((point) => {
    const node = point && point.rendNode;
    try { if (node && node.classList) node.classList.add('lia-dgs-angle-point'); } catch (e) {}
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
    if (!segment || typeof segment !== 'object' || seen.has(segment) ||
        (!segment.__liaDgsSegment && !segment.__liaDgsRay && !segment.__liaDgsLine && !segment.__liaDgsVector)) return;
    seen.add(segment);
    const color = normalizeHexColor(segment.__liaDgsColor) || '#ff00ff';
    const borderOverride = String(segment.__liaDgsLineStyle || '').trim();
    const polygonOwner = segment.__liaDgsPolygonBorderOwner;
    const ownerStyle = polygonOwner &&
      (polygonOwner.__liaDgsLineStyle || polygonOwner.__liaLineStyle)
      ? getDgsLineStyle(polygonOwner)
      : null;
    const lineStyle = borderOverride
      ? normalizeDgsLineStyle(borderOverride)
      : (ownerStyle || getDgsLineStyle(segment));
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
    applyLineStyle(segment, lineStyle);
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

type DgsLineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdotted';

function normalizeDgsLineStyle(value: unknown): DgsLineStyle {
  const normalized = String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (normalized === 'dashed' || normalized === 'gestrichelt') return 'dashed';
  if (normalized === 'dotted' || normalized === 'gepunktet') return 'dotted';
  if (normalized === 'dashdotted' || normalized === 'dashdot' || normalized === 'strichpunktiert') return 'dashdotted';
  return 'solid';
}

function dgsLineStyleFromDash(value: unknown): DgsLineStyle {
  const dash = Number(value);
  if (dash === 1 || dash === 7) return 'dotted';
  if (dash === 5 || dash === 6) return 'dashdotted';
  if (dash === 2 || dash === 3 || dash === 4) return 'dashed';
  return 'solid';
}

function readDgsLineStyleDash(object: any): unknown {
  if (!object) return 0;
  try {
    if (typeof object.getAttribute === 'function') {
      const dash = object.getAttribute('dash');
      if (dash != null) return dash;
    }
  } catch (e) {}
  try {
    if (typeof object.evalVisProp === 'function') {
      const dash = object.evalVisProp('dash');
      if (dash != null) return dash;
    }
  } catch (e) {}
  try {
    if (object.visProp && object.visProp.dash != null) return object.visProp.dash;
  } catch (e) {}
  return 0;
}

function isDgsLineStyleTarget(object: any): boolean {
  return !!object && (
    isDgsLinearObject(object) || isDgsArc(object) || isDgsCompassArc(object) ||
    isDgsPolygon(object) || isDgsCircle(object) || isDgsSector(object) ||
    isDgsAngle(object) || isDgsFunction(object)
  );
}

function getDgsLineStyle(object: any): DgsLineStyle {
  const stored = String(object && (object.__liaDgsLineStyle || object.__liaLineStyle) || '').trim();
  if (stored) return normalizeDgsLineStyle(stored);
  if (isDgsPolygon(object)) {
    const borders = object.__liaDgsPolygonBorders || object.borders;
    const firstBorder = Array.isArray(borders) ? borders.find(Boolean) : null;
    if (firstBorder) {
      const borderStored = String(firstBorder.__liaDgsLineStyle || firstBorder.__liaLineStyle || '').trim();
      if (borderStored) return normalizeDgsLineStyle(borderStored);
      return dgsLineStyleFromDash(readDgsLineStyleDash(firstBorder));
    }
  }
  return dgsLineStyleFromDash(readDgsLineStyleDash(object));
}

function getDgsLineStyleRenderTargets(object: any): any[] {
  const targets: any[] = [];
  const seen = new Set<any>();
  const add = (candidate: any) => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    targets.push(candidate);
  };
  add(object);
  if (isDgsPolygon(object)) {
    const borders = object.__liaDgsPolygonBorders || object.borders;
    if (Array.isArray(borders)) borders.forEach(add);
  }
  if (isDgsSector(object)) {
    add(object.arc);
    if (Array.isArray(object.lines)) object.lines.forEach(add);
  }
  return targets;
}

function applyDgsLineStyle(
  state: DgsState,
  object: any,
  value: unknown,
  recordHistory = true
): boolean {
  if (!isDgsLineStyleTarget(object)) return false;
  const lineStyle = normalizeDgsLineStyle(value);
  object.__liaDgsLineStyle = lineStyle;
  object.__liaLineStyle = lineStyle;
  if (isDgsPolygon(object)) {
    const borders = object.__liaDgsPolygonBorders || object.borders;
    if (Array.isArray(borders)) {
      borders.forEach((border: any) => {
        if (border) {
          border.__liaDgsLineStyle = lineStyle;
          border.__liaLineStyle = lineStyle;
        }
      });
    }
  }
  getDgsLineStyleRenderTargets(object).forEach((target) => {
    applyLineStyle(target, lineStyle);
  });
  try {
    if (state.board && typeof state.board.fullUpdate === 'function') state.board.fullUpdate();
    else if (state.board && typeof state.board.update === 'function') state.board.update();
  } catch (e) {}
  persistDgsConstruction(state, recordHistory);
  return true;
}

type DgsStrokeDesign = {
  normalized: string;
  firstArrow: boolean;
  lastArrow: boolean;
  startCap: boolean;
  endCap: boolean;
};

function normalizeDgsStrokeDesign(value: unknown): string {
  const raw = String(value == null ? '' : value)
    .trim()
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&vert;/gi, '|')
    .replace(/\u2194/g, '<->')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\s+/g, '');
  if (!raw || raw === '-') return '-';
  return /^\|?(?:->|<-|<->)\|?$/.test(raw) ? raw : '-';
}

function parseDgsStrokeDesign(value: unknown): DgsStrokeDesign {
  const normalized = normalizeDgsStrokeDesign(value);
  if (normalized === '-') {
    return { normalized, firstArrow: false, lastArrow: false, startCap: false, endCap: false };
  }
  let arrow = normalized;
  const startCap = arrow.startsWith('|');
  const endCap = arrow.endsWith('|');
  if (startCap) arrow = arrow.slice(1);
  if (endCap) arrow = arrow.slice(0, -1);
  return {
    normalized,
    firstArrow: arrow === '<-' || arrow === '<->',
    lastArrow: arrow === '->' || arrow === '<->',
    startCap,
    endCap
  };
}

function parseDgsStrokeWidth(value: unknown): number | null {
  const raw = String(value == null ? '' : value).trim().replace(',', '.');
  const match = raw.match(/^((?:\d+(?:\.\d*)?|\.\d+))\s*(?:px)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.max(0.25, Math.min(20, parsed)) : null;
}

function dgsStrokeArrowHead(enabled: boolean, strokeWidth: number): false | {
  type: number;
  size: number;
  highlightSize: number;
} {
  if (!enabled) return false;
  const size = 13 / Math.max(0.25, strokeWidth);
  return { type: 1, size, highlightSize: size };
}

function isDgsSegmentStyleTarget(object: any): boolean {
  return !!object && !!object.__liaDgsSegment && !object.__liaDgsPolygonBorder &&
    !object.__liaDgsRay && !object.__liaDgsVector && !object.__liaDgsLine;
}

function isDgsStrokeStyleTarget(object: any): boolean {
  return isDgsSegmentStyleTarget(object) || isDgsArc(object);
}

function getDgsStrokeDesign(object: any): string {
  return normalizeDgsStrokeDesign(isDgsArc(object)
    ? object.__liaDgsArcDesign
    : object && object.__liaDgsSegmentDesign);
}

function getDgsStrokeWidth(object: any): number {
  const stored = isDgsArc(object)
    ? object.__liaDgsArcStrokeWidth
    : object && object.__liaDgsSegmentStrokeWidth;
  return parseDgsStrokeWidth(stored) ?? 3;
}

function getDgsStrokeCapSegments(object: any): any[] {
  return Array.isArray(object && object.__liaDgsStyleCapSegments)
    ? object.__liaDgsStyleCapSegments.filter(Boolean)
    : [];
}

function getDgsStrokeCapPoints(object: any): any[] {
  return Array.isArray(object && object.__liaDgsStyleCapPoints)
    ? object.__liaDgsStyleCapPoints.filter(Boolean)
    : [];
}

function removeDgsStrokeCaps(object: any): void {
  if (!object) return;
  const board = object.board;
  const segments = getDgsStrokeCapSegments(object);
  const points = getDgsStrokeCapPoints(object);
  object.__liaDgsStyleCapSegments = [];
  object.__liaDgsStyleCapPoints = [];
  segments.forEach((segment) => {
    try { if (board && segment) board.removeObject(segment); } catch (e) {}
  });
  points.forEach((point) => {
    try { if (board && point) board.removeObject(point); } catch (e) {}
  });
}

function getDgsStrokeEndpoints(object: any): any[] {
  if (isDgsArc(object)) {
    return [object.__liaDgsArcStartPoint, object.__liaDgsArcEndPoint].filter(Boolean);
  }
  return [object && object.point1, object && object.point2].filter(Boolean);
}

function getDgsStrokeTangentScreen(
  object: any,
  atStart: boolean
): { x: number; y: number; length: number } {
  const board = object && object.board;
  const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
  if (isDgsArc(object)) {
    const angle = Number(atStart ? object.__liaDgsArcExitAngle : object.__liaDgsArcEntryAngle);
    if (!Number.isFinite(angle)) return { x: 0, y: 0, length: 0 };
    const radians = angle * Math.PI / 180;
    const x = Math.cos(radians) * unitX;
    const y = -Math.sin(radians) * unitY;
    return { x, y, length: Math.hypot(x, y) };
  }
  const endpoints = getDgsStrokeEndpoints(object);
  if (endpoints.length !== 2) return { x: 0, y: 0, length: 0 };
  const endpoint = endpoints[atStart ? 0 : 1];
  const other = endpoints[atStart ? 1 : 0];
  try {
    const x = (Number(other.X()) - Number(endpoint.X())) * unitX;
    const y = -(Number(other.Y()) - Number(endpoint.Y())) * unitY;
    return { x, y, length: Math.hypot(x, y) };
  } catch (e) {
    return { x: 0, y: 0, length: 0 };
  }
}

function getDgsStrokeCapOffset(
  object: any,
  atStart: boolean,
  side: number
): { x: number; y: number } {
  const board = object && object.board;
  const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
  const tangent = getDgsStrokeTangentScreen(object, atStart);
  if (!Number.isFinite(tangent.length) || tangent.length <= 1e-9) return { x: 0, y: 0 };
  const normalScreenX = -tangent.y / tangent.length;
  const normalScreenY = tangent.x / tangent.length;
  const halfLengthPx = 6;
  return {
    x: side * normalScreenX * halfLengthPx / unitX,
    y: -side * normalScreenY * halfLengthPx / unitY
  };
}

function createDgsStrokeCap(object: any, atStart: boolean): { segment: any; points: any[] } | null {
  const board = object && object.board;
  const endpoints = getDgsStrokeEndpoints(object);
  if (!board || endpoints.length !== 2) return null;
  const endpoint = endpoints[atStart ? 0 : 1];
  const makePoint = (side: number) => {
    const point = board.create('point', [
      function() { return Number(endpoint.X()) + getDgsStrokeCapOffset(object, atStart, side).x; },
      function() { return Number(endpoint.Y()) + getDgsStrokeCapOffset(object, atStart, side).y; }
    ], {
      name: '',
      withLabel: false,
      visible: false,
      fixed: true,
      frozen: false,
      highlight: false,
      showInfobox: false,
      size: 0,
      layer: getDgsObjectLayer(object)
    });
    point.__liaDgsDesignHelper = true;
    point.__liaDgsDesignOwner = object;
    try { if (typeof point.addParents === 'function') point.addParents(endpoints); } catch (e) {}
    return point;
  };
  const points = [makePoint(-1), makePoint(1)];
  const opacity = object.__liaDgsShowObject === false ? 0 : getDgsObjectOpacity(object);
  const color = getDgsObjectColor(object, 'line');
  const width = getDgsStrokeWidth(object);
  const segment = board.create('segment', points, {
    name: '',
    withLabel: false,
    fixed: true,
    highlight: false,
    visible: function() {
      return object.__liaDgsShowObject !== false && getDgsStrokeTangentScreen(object, atStart).length > 1e-9;
    },
    strokeColor: color,
    highlightStrokeColor: color,
    strokeWidth: width,
    highlightStrokeWidth: width,
    dash: 0,
    strokeOpacity: opacity,
    highlightStrokeOpacity: opacity,
    lineCap: 'round',
    layer: getDgsObjectLayer(object)
  });
  segment.__liaDgsDesignHelper = true;
  segment.__liaDgsDesignOwner = object;
  return { segment, points };
}

function applyDgsStrokeHelperAppearance(object: any): void {
  const color = getDgsObjectColor(object, 'line');
  const width = getDgsStrokeWidth(object);
  const opacity = object.__liaDgsShowObject === false ? 0 : getDgsObjectOpacity(object);
  const layer = getDgsObjectLayer(object);
  getDgsStrokeCapSegments(object).forEach((segment) => {
    try {
      segment.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color,
        strokeWidth: width,
        highlightStrokeWidth: width,
        dash: 0,
        strokeOpacity: opacity,
        highlightStrokeOpacity: opacity,
        layer
      });
    } catch (e) {}
  });
  getDgsStrokeCapPoints(object).forEach((point) => {
    try { point.setAttribute({ layer }); } catch (e) {}
  });
}

function applyDgsStrokeStyle(
  state: DgsState,
  object: any,
  designValue: unknown,
  strokeWidthValue: unknown,
  recordHistory = true
): boolean {
  if (!isDgsStrokeStyleTarget(object)) return false;
  const design = parseDgsStrokeDesign(designValue);
  const strokeWidth = parseDgsStrokeWidth(strokeWidthValue);
  if (strokeWidth == null) return false;
  if (isDgsArc(object)) {
    object.__liaDgsArcDesign = design.normalized;
    object.__liaDgsArcStrokeWidth = strokeWidth;
  } else {
    object.__liaDgsSegmentDesign = design.normalized;
    object.__liaDgsSegmentStrokeWidth = strokeWidth;
  }
  try {
    object.setAttribute({
      strokeWidth,
      highlightStrokeWidth: strokeWidth,
      firstArrow: dgsStrokeArrowHead(design.firstArrow, strokeWidth),
      lastArrow: dgsStrokeArrowHead(design.lastArrow, strokeWidth)
    });
  } catch (e) {}
  removeDgsStrokeCaps(object);
  const capSegments: any[] = [];
  const capPoints: any[] = [];
  if (design.startCap) {
    const cap = createDgsStrokeCap(object, true);
    if (cap) { capSegments.push(cap.segment); capPoints.push(...cap.points); }
  }
  if (design.endCap) {
    const cap = createDgsStrokeCap(object, false);
    if (cap) { capSegments.push(cap.segment); capPoints.push(...cap.points); }
  }
  object.__liaDgsStyleCapSegments = capSegments;
  object.__liaDgsStyleCapPoints = capPoints;
  applyDgsStrokeHelperAppearance(object);
  try { if (state.board && typeof state.board.fullUpdate === 'function') state.board.fullUpdate(); else state.board.update(); } catch (e) {}
  persistDgsConstruction(state, recordHistory);
  return true;
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
      dash: 0,
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
    segment.__liaDgsLineStyle = 'solid';
    segment.__liaDgsShowLength = false;
    segment.__liaDgsSegmentDesign = '-';
    segment.__liaDgsSegmentStrokeWidth = 3;
    segment.__liaDgsStyleCapSegments = [];
    segment.__liaDgsStyleCapPoints = [];
    refreshDgsObjectLabel(segment);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return segment;
  } catch (e) {
    return null;
  }
}

function createDgsRay(state: DgsState, point1: any, point2: any): any | null {
  if (!state.board || !point1 || !point2 || point1 === point2) return null;

  const name = getNextSegmentName(state);
  try {
    const ray = state.board.create('line', [point1, point2], {
      name: '',
      withLabel: false,
      fixed: true,
      straightFirst: false,
      straightLast: true,
      firstArrow: false,
      lastArrow: false,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0
    });
    ray.__liaDgsRay = true;
    ray.__liaDgsRayName = name;
    ray.__liaDgsLanguage = state.language;
    ray.__liaDgsColor = '#ff00ff';
    ray.__liaDgsShowName = true;
    ray.__liaDgsShowObject = true;
    ray.__liaDgsOpacity = 1;
    ray.__liaDgsLineStyle = 'solid';
    const label = state.board.create('text', [
      function() { return (Number(point1.X()) + Number(point2.X())) / 2; },
      function() { return (Number(point1.Y()) + Number(point2.Y())) / 2; },
      function() { return dgsObjectLabelText(ray); }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'bottom',
      offset: [0, 8],
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      fontSize: 20
    });
    ray.label = label;
    ray.__liaDgsRayLabel = label;
    refreshDgsObjectLabel(ray);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return ray;
  } catch (e) {
    return null;
  }
}

function getDgsVectorPointName(point: any): string {
  const dgsName = String(point && point.__liaDgsPointName || '').trim();
  if (dgsName) return dgsName;
  return unwrapAlphabeticName(point && point.name).trim();
}

function getAutomaticDgsVectorName(point1: any, point2: any): string {
  const firstName = getDgsVectorPointName(point1);
  const secondName = getDgsVectorPointName(point2);
  return firstName && secondName ? firstName + secondName : '';
}

function formatDgsVectorTexName(name: string): string {
  return '\\overrightarrow{' + name + '}';
}

function createDgsVector(state: DgsState, point1: any, point2: any): any | null {
  if (!state.board || !point1 || !point2 || point1 === point2) return null;

  const automaticName = getAutomaticDgsVectorName(point1, point2);
  const name = automaticName || getNextSegmentName(state);
  try {
    const vector = state.board.create('segment', [point1, point2], {
      name: '\\(' + formatDgsVectorTexName(name) + '\\)',
      withLabel: true,
      fixed: true,
      firstArrow: false,
      lastArrow: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });
    vector.__liaDgsVector = true;
    vector.__liaDgsVectorName = name;
    vector.__liaDgsVectorAutoName = !!automaticName;
    vector.__liaDgsLanguage = state.language;
    vector.__liaDgsColor = '#ff00ff';
    vector.__liaDgsShowName = true;
    vector.__liaDgsShowObject = true;
    vector.__liaDgsOpacity = 1;
    vector.__liaDgsLineStyle = 'solid';
    refreshDgsObjectLabel(vector);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return vector;
  } catch (e) {
    return null;
  }
}

type DgsArcGeometry = {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  chord: number;
};

function parseDgsArcAngle(value: unknown): number | null {
  const raw = String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/(?:\s*(?:deg|grad|°))$/, '')
    .replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const normalized = ((parsed % 360) + 360) % 360;
  return Math.abs(normalized - 360) < 1e-12 ? 0 : normalized;
}

function getDefaultDgsArcAngles(point1: any, point2: any): { exitAngle: number; entryAngle: number } {
  let direction = 0;
  try {
    direction = Math.atan2(
      Number(point2.Y()) - Number(point1.Y()),
      Number(point2.X()) - Number(point1.X())
    ) * 180 / Math.PI;
  } catch (e) {}
  const normalize = (value: number) => ((value % 360) + 360) % 360;
  return {
    exitAngle: normalize(direction + 45),
    entryAngle: normalize(direction + 135)
  };
}

function getDgsArcGeometry(
  point1: any,
  point2: any,
  exitAngle: number,
  entryAngle: number
): DgsArcGeometry {
  let startX = NaN;
  let startY = NaN;
  let endX = NaN;
  let endY = NaN;
  try {
    startX = Number(point1.X());
    startY = Number(point1.Y());
    endX = Number(point2.X());
    endY = Number(point2.Y());
  } catch (e) {}
  const chord = Math.hypot(endX - startX, endY - startY);
  const handle = chord / 3;
  const exitRadians = exitAngle * Math.PI / 180;
  const entryRadians = entryAngle * Math.PI / 180;
  return {
    p0: { x: startX, y: startY },
    p1: {
      x: startX + handle * Math.cos(exitRadians),
      y: startY + handle * Math.sin(exitRadians)
    },
    p2: {
      x: endX + handle * Math.cos(entryRadians),
      y: endY + handle * Math.sin(entryRadians)
    },
    p3: { x: endX, y: endY },
    chord
  };
}

function getDgsArcPoint(geometry: DgsArcGeometry, t: number): { x: number; y: number } {
  if (!Number.isFinite(geometry.chord) || geometry.chord < 1e-12) return { x: NaN, y: NaN };
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * geometry.p0.x + b * geometry.p1.x + c * geometry.p2.x + d * geometry.p3.x,
    y: a * geometry.p0.y + b * geometry.p1.y + c * geometry.p2.y + d * geometry.p3.y
  };
}

function getDgsArcDerivative(geometry: DgsArcGeometry, t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: 3 * u * u * (geometry.p1.x - geometry.p0.x) +
      6 * u * t * (geometry.p2.x - geometry.p1.x) +
      3 * t * t * (geometry.p3.x - geometry.p2.x),
    y: 3 * u * u * (geometry.p1.y - geometry.p0.y) +
      6 * u * t * (geometry.p2.y - geometry.p1.y) +
      3 * t * t * (geometry.p3.y - geometry.p2.y)
  };
}

function getDgsArcLabelPosition(arc: any): { x: number; y: number } {
  const point1 = arc && arc.__liaDgsArcStartPoint;
  const point2 = arc && arc.__liaDgsArcEndPoint;
  const geometry = getDgsArcGeometry(
    point1,
    point2,
    Number(arc && arc.__liaDgsArcExitAngle) || 0,
    Number(arc && arc.__liaDgsArcEntryAngle) || 0
  );
  const midpoint = getDgsArcPoint(geometry, 0.5);
  if (!Number.isFinite(midpoint.x) || !Number.isFinite(midpoint.y)) return midpoint;
  let derivative = getDgsArcDerivative(geometry, 0.5);
  if (Math.hypot(derivative.x, derivative.y) < 1e-12) {
    derivative = { x: geometry.p3.x - geometry.p0.x, y: geometry.p3.y - geometry.p0.y };
  }
  const board = arc && arc.board;
  const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
  const tangentX = derivative.x * unitX;
  const tangentY = -derivative.y * unitY;
  let normalX = -tangentY;
  let normalY = tangentX;
  const length = Math.hypot(normalX, normalY);
  if (length > 1e-12) {
    normalX /= length;
    normalY /= length;
  } else {
    normalX = 0;
    normalY = -1;
  }
  if (normalY > 0 || (Math.abs(normalY) < 1e-12 && normalX < 0)) {
    normalX = -normalX;
    normalY = -normalY;
  }
  const offsetPx = 15;
  return {
    x: midpoint.x + normalX * offsetPx / unitX,
    y: midpoint.y - normalY * offsetPx / unitY
  };
}

function createDgsArc(
  state: DgsState,
  point1: any,
  point2: any,
  exitAngleValue: unknown,
  entryAngleValue: unknown
): any | null {
  if (!state.board || !point1 || !point2 || point1 === point2) return null;
  const exitAngle = parseDgsArcAngle(exitAngleValue);
  const entryAngle = parseDgsArcAngle(entryAngleValue);
  if (exitAngle == null || entryAngle == null) return null;
  const name = getNextSegmentName(state);
  let arc: any = null;
  try {
    const geometry = () => {
      const currentExitAngle = arc ? Number(arc.__liaDgsArcExitAngle) : NaN;
      const currentEntryAngle = arc ? Number(arc.__liaDgsArcEntryAngle) : NaN;
      return getDgsArcGeometry(
        point1,
        point2,
        Number.isFinite(currentExitAngle) ? currentExitAngle : exitAngle,
        Number.isFinite(currentEntryAngle) ? currentEntryAngle : entryAngle
      );
    };
    arc = state.board.create('curve', [
      function(t: number) { return getDgsArcPoint(geometry(), Number(t)).x; },
      function(t: number) { return getDgsArcPoint(geometry(), Number(t)).y; },
      0,
      1
    ], {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      visible: function() {
        const current = geometry();
        return Number.isFinite(current.chord) && current.chord > 1e-12;
      },
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      lineCap: 'round',
      firstArrow: false,
      lastArrow: false,
      doAdvancedPlot: false,
      numberPointsLow: 64,
      numberPointsHigh: 128,
      needsRegularUpdate: true
    });
    arc.__liaDgsArc = true;
    arc.__liaDgsArcName = name;
    arc.__liaDgsArcStartPoint = point1;
    arc.__liaDgsArcEndPoint = point2;
    arc.__liaDgsArcExitAngle = exitAngle;
    arc.__liaDgsArcEntryAngle = entryAngle;
    arc.__liaDgsArcDesign = '-';
    arc.__liaDgsArcStrokeWidth = 3;
    arc.__liaDgsStyleCapSegments = [];
    arc.__liaDgsStyleCapPoints = [];
    arc.__liaDgsLanguage = state.language;
    arc.__liaDgsColor = '#ff00ff';
    arc.__liaDgsShowName = true;
    arc.__liaDgsShowObject = true;
    arc.__liaDgsOpacity = 1;
    arc.__liaDgsLineStyle = 'solid';
    arc.point1 = point1;
    arc.point2 = point2;
    try { if (typeof arc.addParents === 'function') arc.addParents([point1, point2]); } catch (e) {}
    const label = state.board.create('text', [
      function() { return getDgsArcLabelPosition(arc).x; },
      function() { return getDgsArcLabelPosition(arc).y; },
      function() { return dgsObjectLabelText(arc); }
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
      fontSize: 20
    });
    arc.label = label;
    arc.__liaDgsArcLabel = label;
    try { if (typeof label.addParents === 'function') label.addParents([point1, point2]); } catch (e) {}
    refreshDgsObjectLabel(arc);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return arc;
  } catch (e) {
    try { if (arc) state.board.removeObject(arc); } catch (removeError) {}
    return null;
  }
}

function setDgsArcAngles(
  state: DgsState,
  arc: any,
  exitAngleValue: unknown,
  entryAngleValue: unknown,
  recordHistory = true
): boolean {
  if (!isDgsArc(arc)) return false;
  const exitAngle = parseDgsArcAngle(exitAngleValue);
  const entryAngle = parseDgsArcAngle(entryAngleValue);
  if (exitAngle == null || entryAngle == null) return false;
  arc.__liaDgsArcExitAngle = exitAngle;
  arc.__liaDgsArcEntryAngle = entryAngle;
  try { if (typeof state.board.fullUpdate === 'function') state.board.fullUpdate(); else state.board.update(); } catch (e) {}
  persistDgsConstruction(state, recordHistory);
  return true;
}

type DgsCompassArcGeometry = {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  sweepAngle: number;
};

function getDgsCompassArcGeometry(arc: any): DgsCompassArcGeometry {
  const center = arc && arc.__liaDgsCompassCenterPoint;
  const point = arc && arc.__liaDgsCompassRadiusPoint;
  let cx = NaN;
  let cy = NaN;
  let px = NaN;
  let py = NaN;
  try {
    cx = Number(center.X());
    cy = Number(center.Y());
    px = Number(point.X());
    py = Number(point.Y());
  } catch (e) {}
  const storedDx = Number(arc && arc.__liaDgsCompassFixedDx);
  const storedDy = Number(arc && arc.__liaDgsCompassFixedDy);
  const usesFixedVector = arc && arc.__liaDgsCompassFixedRadius === true &&
    Number.isFinite(storedDx) && Number.isFinite(storedDy) &&
    Math.hypot(storedDx, storedDy) > 1e-12;
  const radiusDx = usesFixedVector ? storedDx : px - cx;
  const radiusDy = usesFixedVector ? storedDy : py - cy;
  const radius = Math.hypot(radiusDx, radiusDy);
  const sweepAngle = Number(arc && arc.__liaDgsCompassSweepAngle);
  const endAngle = Math.atan2(radiusDy, radiusDx);
  const geometry = {
    cx,
    cy,
    radius,
    startAngle: endAngle - (Number.isFinite(sweepAngle) ? sweepAngle : 0),
    sweepAngle: Number.isFinite(sweepAngle) ? sweepAngle : 0
  };
  if (arc && Number.isFinite(radius) && Number.isFinite(geometry.startAngle)) {
    arc.__liaDgsCompassRadius = radius;
    arc.__liaDgsCompassStartAngle = geometry.startAngle;
  }
  return geometry;
}

function getDgsCompassArcPoint(arc: any, t: number): { x: number; y: number } {
  const geometry = getDgsCompassArcGeometry(arc);
  const angle = geometry.startAngle + geometry.sweepAngle * Number(t);
  return {
    x: geometry.cx + geometry.radius * Math.cos(angle),
    y: geometry.cy + geometry.radius * Math.sin(angle)
  };
}

function getDgsCompassArcLabelPosition(arc: any): { x: number; y: number } {
  const geometry = getDgsCompassArcGeometry(arc);
  const midpoint = getDgsCompassArcPoint(arc, 0.5);
  if (![midpoint.x, midpoint.y, geometry.cx, geometry.cy].every(Number.isFinite)) return midpoint;
  const board = arc && arc.board;
  const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
  let screenX = (midpoint.x - geometry.cx) * unitX;
  let screenY = -(midpoint.y - geometry.cy) * unitY;
  const length = Math.hypot(screenX, screenY);
  if (length <= 1e-12) return midpoint;
  screenX /= length;
  screenY /= length;
  const offsetPx = 15;
  return {
    x: midpoint.x + screenX * offsetPx / unitX,
    y: midpoint.y - screenY * offsetPx / unitY
  };
}

function ensureDgsCompassArcLabel(state: DgsState, arc: any): any | null {
  if (!state.board || !isDgsCompassArc(arc)) return null;
  if (arc.__liaDgsCompassArcLabel) return arc.__liaDgsCompassArcLabel;
  try {
    const label = state.board.create('text', [
      function() { return getDgsCompassArcLabelPosition(arc).x; },
      function() { return getDgsCompassArcLabelPosition(arc).y; },
      function() { return dgsObjectLabelText(arc); }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: getDgsObjectColor(arc, 'text'),
      fillColor: getDgsObjectColor(arc, 'text'),
      fontSize: 20
    });
    arc.label = label;
    arc.__liaDgsCompassArcLabel = label;
    try {
      if (typeof label.addParents === 'function') {
        label.addParents([arc.__liaDgsCompassCenterPoint, arc.__liaDgsCompassRadiusPoint]);
      }
    } catch (e) {}
    refreshDgsObjectLabel(arc);
    return label;
  } catch (e) {
    return null;
  }
}

function createDgsCompassArc(
  state: DgsState,
  center: any,
  radiusPoint: any,
  sweepValue: unknown,
  draft = false
): any | null {
  if (!state.board || !center || !radiusPoint || center === radiusPoint) return null;
  let cx = NaN;
  let cy = NaN;
  let px = NaN;
  let py = NaN;
  try {
    cx = Number(center.X());
    cy = Number(center.Y());
    px = Number(radiusPoint.X());
    py = Number(radiusPoint.Y());
  } catch (e) {}
  const radius = Math.hypot(px - cx, py - cy);
  const sweepAngle = Number(sweepValue);
  if (!Number.isFinite(radius) || radius <= 1e-12 || !Number.isFinite(sweepAngle)) return null;
  const name = getNextSegmentName(state);
  let arc: any = null;
  try {
    const initialStartAngle = Math.atan2(py - cy, px - cx) - sweepAngle;
    const geometry = (): DgsCompassArcGeometry => arc
      ? getDgsCompassArcGeometry(arc)
      : { cx, cy, radius, startAngle: initialStartAngle, sweepAngle };
    const pointAt = (t: number) => {
      const current = geometry();
      const angle = current.startAngle + current.sweepAngle * Number(t);
      return {
        x: current.cx + current.radius * Math.cos(angle),
        y: current.cy + current.radius * Math.sin(angle)
      };
    };
    arc = state.board.create('curve', [
      function(t: number) { return pointAt(Number(t)).x; },
      function(t: number) { return pointAt(Number(t)).y; },
      0,
      1
    ], {
      name: '',
      withLabel: false,
      fixed: true,
      highlight: false,
      visible: function() {
        const current = geometry();
        return (!arc || arc.__liaDgsShowObject !== false) && current.radius > 1e-12 &&
          Math.abs(current.sweepAngle) > 1e-7;
      },
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      lineCap: 'round',
      firstArrow: false,
      lastArrow: false,
      doAdvancedPlot: false,
      numberPointsLow: 96,
      numberPointsHigh: 192,
      needsRegularUpdate: true
    });
    arc.__liaDgsCompassArc = true;
    arc.__liaDgsCompassDraft = !!draft;
    arc.__liaDgsCompassArcName = name;
    arc.__liaDgsCompassCenterPoint = center;
    arc.__liaDgsCompassRadiusPoint = radiusPoint;
    arc.__liaDgsCompassRadius = radius;
    arc.__liaDgsCompassStartAngle = initialStartAngle;
    arc.__liaDgsCompassSweepAngle = sweepAngle;
    arc.__liaDgsLanguage = state.language;
    arc.__liaDgsColor = '#ff00ff';
    arc.__liaDgsTextColor = '#ff00ff';
    arc.__liaDgsLineColor = '#ff00ff';
    arc.__liaDgsShowName = true;
    arc.__liaDgsShowObject = true;
    arc.__liaDgsOpacity = 1;
    arc.__liaDgsLineStyle = 'solid';
    try { if (typeof arc.addParents === 'function') arc.addParents([center, radiusPoint]); } catch (e) {}
    if (!draft) ensureDgsCompassArcLabel(state, arc);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return arc;
  } catch (e) {
    try { if (arc) state.board.removeObject(arc); } catch (removeError) {}
    return null;
  }
}

function finalizeDgsCompassArc(state: DgsState, arc: any): boolean {
  if (!isDgsCompassArc(arc)) return false;
  const geometry = getDgsCompassArcGeometry(arc);
  if (!Number.isFinite(geometry.radius) || geometry.radius <= 1e-12 ||
      !Number.isFinite(geometry.sweepAngle) || Math.abs(geometry.sweepAngle) <= 1e-7) return false;
  arc.__liaDgsCompassDraft = false;
  arc.__liaDgsCompassFixedRadius = state.compassMode === 'fixed';
  if (arc.__liaDgsCompassFixedRadius) {
    const center = readDgsPointPosition(arc.__liaDgsCompassCenterPoint);
    const point = readDgsPointPosition(arc.__liaDgsCompassRadiusPoint);
    if (center && point) {
      arc.__liaDgsCompassFixedDx = point.x - center.x;
      arc.__liaDgsCompassFixedDy = point.y - center.y;
    }
  }
  arc.__liaDgsCompassRadius = geometry.radius;
  arc.__liaDgsCompassStartAngle = geometry.startAngle;
  resetDgsFixedCompassTranslationSnapshot(arc);
  ensureDgsCompassArcLabel(state, arc);
  refreshDgsObjectLabel(arc);
  try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  return true;
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
      dash: 0,
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
    line.__liaDgsLineStyle = 'solid';
    line.__liaDgsShowEquation = false;
    refreshDgsObjectLabel(line);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return line;
  } catch (e) {
    return null;
  }
}

function getDgsAngleBisectorDirection(first: any, vertex: any, third: any): { x: number; y: number } | null {
  try {
    const firstX = Number(first.X()) - Number(vertex.X());
    const firstY = Number(first.Y()) - Number(vertex.Y());
    const thirdX = Number(third.X()) - Number(vertex.X());
    const thirdY = Number(third.Y()) - Number(vertex.Y());
    const firstLength = Math.hypot(firstX, firstY);
    const thirdLength = Math.hypot(thirdX, thirdY);
    if (firstLength <= 1e-12 || thirdLength <= 1e-12) return null;
    const unitFirstX = firstX / firstLength;
    const unitFirstY = firstY / firstLength;
    const unitThirdX = thirdX / thirdLength;
    const unitThirdY = thirdY / thirdLength;
    const sumX = unitFirstX + unitThirdX;
    const sumY = unitFirstY + unitThirdY;
    const sumLength = Math.hypot(sumX, sumY);
    return sumLength > 1e-10
      ? { x: sumX / sumLength, y: sumY / sumLength }
      : { x: -unitFirstY, y: unitFirstX };
  } catch (e) {
    return null;
  }
}

function createDgsAngleBisector(
  state: DgsState,
  first: any,
  vertex: any,
  third: any
): any | null {
  if (!state.board || !isDgsPoint(first) || !isDgsPoint(vertex) || !isDgsPoint(third) ||
      first === vertex || first === third || vertex === third ||
      !getDgsAngleBisectorDirection(first, vertex, third)) return null;
  const name = getNextSegmentName(state);
  let helper: any = null;
  let line: any = null;
  try {
    helper = state.board.create('point', [
      function() {
        const direction = getDgsAngleBisectorDirection(first, vertex, third);
        return Number(vertex.X()) + (direction ? direction.x : 1);
      },
      function() {
        const direction = getDgsAngleBisectorDirection(first, vertex, third);
        return Number(vertex.Y()) + (direction ? direction.y : 0);
      }
    ], {
      name: '',
      fixed: true,
      visible: false,
      withLabel: false
    });
    line = state.board.create('line', [vertex, helper], {
      name: '\\(' + name + '\\)',
      withLabel: true,
      fixed: true,
      straightFirst: true,
      straightLast: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });
    helper.__liaDgsAngleBisectorHelper = true;
    helper.__liaDgsAngleBisectorLine = line;
    line.__liaDgsLine = true;
    line.__liaDgsAngleBisector = true;
    line.__liaDgsAngleBisectorPoints = [first, vertex, third];
    line.__liaDgsAngleBisectorHelper = helper;
    line.__liaDgsLineName = name;
    line.__liaDgsLanguage = state.language;
    line.__liaDgsColor = '#ff00ff';
    line.__liaDgsShowName = true;
    line.__liaDgsShowObject = true;
    line.__liaDgsOpacity = 1;
    line.__liaDgsLineStyle = 'solid';
    line.__liaDgsShowEquation = false;
    refreshDgsObjectLabel(line);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return line;
  } catch (e) {
    try { if (line) state.board.removeObject(line); } catch (e2) {}
    try { if (helper) state.board.removeObject(helper); } catch (e2) {}
    return null;
  }
}

function getDgsTangentSlope(state: DgsState, source: any, x: number): number {
  let span = 10;
  try {
    const bbox = state.board.getBoundingBox();
    if (Array.isArray(bbox) && bbox.length === 4) span = Math.abs(Number(bbox[2]) - Number(bbox[0])) || span;
  } catch (e) {}
  const h = Math.max(1e-6, span * 1e-5);
  const evaluate = (value: number) => {
    try {
      const result = Number(source.Y(value));
      return Number.isFinite(result) ? result : NaN;
    } catch (e) { return NaN; }
  };
  const left = evaluate(x - h);
  const right = evaluate(x + h);
  if (Number.isFinite(left) && Number.isFinite(right)) return (right - left) / (2 * h);
  const center = evaluate(x);
  if (Number.isFinite(center) && Number.isFinite(right)) return (right - center) / h;
  if (Number.isFinite(center) && Number.isFinite(left)) return (center - left) / h;
  return NaN;
}

function getDgsTangentDirection(
  state: DgsState,
  source: any,
  x: number,
  y: number
): { x: number; y: number } | null {
  if (isDgsFunctionTarget(source)) {
    const slope = getDgsTangentSlope(state, source, x);
    return Number.isFinite(slope) ? { x: 1, y: slope } : null;
  }
  if (isDgsCircle(source)) {
    const center = source.__liaDgsCircleCenter || source.center;
    try {
      const radiusX = x - Number(center.X());
      const radiusY = y - Number(center.Y());
      return Math.hypot(radiusX, radiusY) > 1e-12
        ? { x: -radiusY, y: radiusX }
        : null;
    } catch (e) { return null; }
  }
  if (isDgsLinearObject(source)) {
    try {
      const directionX = Number(source.point2.X()) - Number(source.point1.X());
      const directionY = Number(source.point2.Y()) - Number(source.point1.Y());
      return Math.hypot(directionX, directionY) > 1e-12
        ? { x: directionX, y: directionY }
        : null;
    } catch (e) { return null; }
  }
  return null;
}

function createDgsTangent(
  state: DgsState,
  source: any,
  x: number,
  inputY?: number
): any | null {
  if (!state.board || !isDgsTangentTarget(source) || !Number.isFinite(x)) return null;
  let y = Number(inputY);
  if (isDgsFunctionTarget(source)) {
    try { y = Number(source.Y(x)); } catch (e) {}
  }
  if (!Number.isFinite(y) || !getDgsTangentDirection(state, source, x, y)) return null;

  const pointName = getNextPointName(state);
  const lineName = getNextSegmentName(state);
  const labelColor = getNeutralColor();
  let contactPoint: any = null;
  let helperPoint: any = null;
  let tangent: any = null;
  try {
    contactPoint = state.board.create('glider', [x, y, source], {
      name: '\\(' + pointName + '\\)',
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
    helperPoint = state.board.create('point', [
      function() {
        const contactX = Number(contactPoint.X());
        const contactY = Number(contactPoint.Y());
        const direction = getDgsTangentDirection(state, source, contactX, contactY);
        if (!direction) return contactX + 1;
        const length = Math.hypot(direction.x, direction.y) || 1;
        return contactX + direction.x / length;
      },
      function() {
        const contactX = Number(contactPoint.X());
        const contactY = Number(contactPoint.Y());
        const direction = getDgsTangentDirection(state, source, contactX, contactY);
        if (!direction) return contactY;
        const length = Math.hypot(direction.x, direction.y) || 1;
        return contactY + direction.y / length;
      }
    ], {
      name: '',
      fixed: true,
      visible: false,
      withLabel: false
    });
    tangent = state.board.create('line', [contactPoint, helperPoint], {
      name: '\\(' + lineName + '\\)',
      withLabel: true,
      fixed: true,
      straightFirst: true,
      straightLast: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });

    contactPoint.__liaDgsPointName = pointName;
    contactPoint.__liaDgsTangentPoint = true;
    contactPoint.__liaDgsTangentLine = tangent;
    contactPoint.__liaDgsLanguage = state.language;
    contactPoint.__liaDgsColor = '#ff00ff';
    contactPoint.__liaDgsTextColor = labelColor;
    contactPoint.__liaDgsLineColor = '#ff00ff';
    contactPoint.__liaDgsFillColor = '#ff00ff';
    contactPoint.__liaDgsShowName = true;
    contactPoint.__liaDgsShowObject = true;
    contactPoint.__liaDgsOpacity = 1;
    contactPoint.__liaPointVisual = { color: '#ff00ff', opacity: 1, hasExplicitColor: false };
    helperPoint.__liaDgsTangentHelper = true;
    helperPoint.__liaDgsTangentLine = tangent;

    tangent.__liaDgsLine = true;
    tangent.__liaDgsTangent = true;
    tangent.__liaDgsLineName = lineName;
    tangent.__liaDgsTangentSource = source;
    tangent.__liaDgsTangentPoint = contactPoint;
    tangent.__liaDgsTangentHelper = helperPoint;
    tangent.__liaDgsLanguage = state.language;
    tangent.__liaDgsColor = '#ff00ff';
    tangent.__liaDgsShowName = true;
    tangent.__liaDgsShowObject = true;
    tangent.__liaDgsOpacity = 1;
    tangent.__liaDgsLineStyle = 'solid';
    tangent.__liaDgsShowEquation = false;
    source.__liaDgsTangents = Array.isArray(source.__liaDgsTangents) ? source.__liaDgsTangents : [];
    source.__liaDgsTangents.push(tangent);

    window.__points = window.__points || {};
    window.__points[state.boardId] = window.__points[state.boardId] || {};
    window.__points[state.boardId][pointName] = contactPoint;
    const persistPosition = (recordHistory: boolean) => {
      refreshSideMenusForObject(contactPoint);
      refreshDgsObjectLabel(tangent);
      persistDgsConstruction(state, recordHistory);
    };
    try { contactPoint.on('drag', () => persistPosition(false)); } catch (e) {}
    try { contactPoint.on('up', () => persistPosition(true)); } catch (e) {}
    refreshDgsObjectLabel(contactPoint);
    refreshDgsObjectLabel(tangent);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return tangent;
  } catch (e) {
    try { if (tangent) state.board.removeObject(tangent); } catch (e2) {}
    try { if (helperPoint) state.board.removeObject(helperPoint); } catch (e2) {}
    try { if (contactPoint) state.board.removeObject(contactPoint); } catch (e2) {}
    return null;
  }
}

function removeDgsTangent(state: DgsState, tangent: any, updateBoard = true): void {
  if (!tangent) return;
  if (Array.isArray(tangent.__liaDgsIntersectionConstructions)) {
    tangent.__liaDgsIntersectionConstructions.slice().forEach((construction: any) => {
      removeDgsRootConstruction(state, construction, false);
    });
  }
  if (Array.isArray(tangent.__liaDgsTangents)) {
    tangent.__liaDgsTangents.slice().forEach((dependent: any) => {
      removeDgsTangent(state, dependent, false);
    });
  }
  const contactPoint = tangent.__liaDgsTangentPoint;
  const helperPoint = tangent.__liaDgsTangentHelper;
  const source = tangent.__liaDgsTangentSource;
  const name = String(contactPoint && contactPoint.__liaDgsPointName || '');
  try {
    if (window.__points && window.__points[state.boardId] &&
        window.__points[state.boardId][name] === contactPoint) {
      delete window.__points[state.boardId][name];
    }
  } catch (e) {}
  if (source && Array.isArray(source.__liaDgsTangents)) {
    source.__liaDgsTangents = source.__liaDgsTangents.filter((candidate: any) => candidate !== tangent);
  }
  if (state.contextObject === tangent || state.contextObject === contactPoint) setSideMenuOpen(state, false);
  try { state.board.removeObject(tangent); } catch (e) {}
  try { state.board.removeObject(helperPoint); } catch (e) {}
  try { state.board.removeObject(contactPoint); } catch (e) {}
  if (updateBoard) {
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  }
}

function createDgsPerpendicular(state: DgsState, baseLine: any, throughPoint: any): any | null {
  if (!state.board || !isDgsLinearObject(baseLine) || !throughPoint) return null;

  const name = getNextSegmentName(state);
  try {
    const line = state.board.create('perpendicular', [baseLine, throughPoint], {
      name: '\\(' + name + '\\)',
      withLabel: true,
      fixed: true,
      straightFirst: true,
      straightLast: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });
    line.__liaDgsLine = true;
    line.__liaDgsPerpendicular = true;
    line.__liaDgsPerpendicularBase = baseLine;
    line.__liaDgsPerpendicularPoint = throughPoint;
    line.__liaDgsLineName = name;
    line.__liaDgsLanguage = state.language;
    line.__liaDgsColor = '#ff00ff';
    line.__liaDgsShowName = true;
    line.__liaDgsShowObject = true;
    line.__liaDgsOpacity = 1;
    line.__liaDgsLineStyle = 'solid';
    line.__liaDgsShowEquation = false;
    refreshDgsObjectLabel(line);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return line;
  } catch (e) {
    return null;
  }
}

function createDgsParallel(state: DgsState, baseLine: any, throughPoint: any): any | null {
  if (!state.board || !isDgsLinearObject(baseLine) || !throughPoint) return null;

  const name = getNextSegmentName(state);
  try {
    const line = state.board.create('parallel', [baseLine, throughPoint], {
      name: '\\(' + name + '\\)',
      withLabel: true,
      fixed: true,
      straightFirst: true,
      straightLast: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 20,
        parse: false,
        useMathJax: true
      }
    });
    line.__liaDgsLine = true;
    line.__liaDgsParallel = true;
    line.__liaDgsParallelBase = baseLine;
    line.__liaDgsParallelPoint = throughPoint;
    line.__liaDgsLineName = name;
    line.__liaDgsLanguage = state.language;
    line.__liaDgsColor = '#ff00ff';
    line.__liaDgsShowName = true;
    line.__liaDgsShowObject = true;
    line.__liaDgsOpacity = 1;
    line.__liaDgsLineStyle = 'solid';
    line.__liaDgsShowEquation = false;
    refreshDgsObjectLabel(line);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return line;
  } catch (e) {
    return null;
  }
}

function initializeDgsPolygonBorders(state: DgsState, polygon: any): any[] {
  const borders = polygon && Array.isArray(polygon.borders) ? polygon.borders : [];
  const promoted: any[] = [];
  borders.forEach((border: any) => {
    if (border) border.__liaDgsPolygonBorderInitializing = true;
  });

  borders.forEach((border: any, index: number) => {
    if (!border) return;
    const name = getNextSegmentName(state);
    delete border.__liaDgsPolygonBorderInitializing;
    border.__liaDgsSegment = true;
    border.__liaDgsPolygonBorder = true;
    border.__liaDgsPolygonBorderOwner = polygon;
    border.__liaDgsPolygonBorderIndex = index;
    border.__liaDgsSegmentName = name;
    border.__liaDgsLanguage = state.language;
    border.__liaDgsColor = '#ff00ff';
    border.__liaDgsShowName = false;
    border.__liaDgsShowObject = true;
    border.__liaDgsOpacity = 1;
    border.__liaDgsLineStyle = 'solid';
    border.__liaDgsShowLength = false;
    ensureDgsPersistentId(border, 'polygon-border');

    try {
      border.setAttribute({
        name: '\\(' + name + '\\)',
        fixed: true,
        strokeColor: '#ff00ff',
        highlightStrokeColor: '#ff00ff',
        strokeWidth: 3,
        highlightStrokeWidth: 4,
        dash: 0
      });
    } catch (e) {}

    let label = border.label || null;
    if (!label) {
      try {
        label = state.board.create('text', [
          function() { return (Number(border.point1.X()) + Number(border.point2.X())) / 2; },
          function() { return (Number(border.point1.Y()) + Number(border.point2.Y())) / 2; },
          function() { return dgsObjectLabelText(border); }
        ], {
          fixed: true,
          visible: false,
          highlight: false,
          parse: false,
          useMathJax: true,
          display: 'html',
          anchorX: 'middle',
          anchorY: 'middle',
          strokeColor: '#ff00ff',
          fillColor: '#ff00ff',
          fontSize: 20
        });
        border.label = label;
      } catch (e) {
        label = null;
      }
    }
    try {
      if (label && typeof label.setAttribute === 'function') {
        label.setAttribute({
          visible: false,
          strokeColor: '#ff00ff',
          fillColor: '#ff00ff',
          fontSize: 20
        });
      }
    } catch (e) {}
    border.__liaDgsPolygonBorderLabel = label;
    refreshDgsObjectLabel(border);
    promoted.push(border);
  });

  polygon.__liaDgsPolygonBorders = promoted;
  return promoted;
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
        highlightStrokeWidth: 4,
        dash: 0
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
    polygon.__liaDgsLineStyle = 'solid';
    polygon.__liaDgsShowArea = false;
    polygon.__liaDgsShowPerimeter = false;
    initializeDgsPolygonBorders(state, polygon);
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
    if (object && object.__liaDgsSector) used.add(String(object.__liaDgsSectorName || ''));
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
      dash: 0,
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
    circle.__liaDgsLineStyle = 'solid';
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

function createDgsSector(state: DgsState, center: any, radiusPoint: any, anglePoint: any): any | null {
  if (!state.board || !center || !radiusPoint || !anglePoint ||
      center === radiusPoint || center === anglePoint || radiusPoint === anglePoint) return null;
  const name = getNextCircleName(state);
  try {
    const sector = state.board.create('sector', [center, radiusPoint, anglePoint], {
      name: '\\(' + name + '\\)',
      withLabel: true,
      fixed: true,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      highlightStrokeWidth: 4,
      dash: 0,
      fillColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      fillOpacity: 0.2,
      highlightFillOpacity: 0.3,
      label: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fontSize: 18,
        parse: false,
        useMathJax: true
      }
    });
    sector.__liaDgsSector = true;
    sector.__liaDgsSectorName = name;
    sector.__liaDgsSectorCenter = center;
    sector.__liaDgsSectorRadiusPoint = radiusPoint;
    sector.__liaDgsSectorAnglePoint = anglePoint;
    sector.__liaDgsLanguage = state.language;
    sector.__liaDgsColor = '#ff00ff';
    sector.__liaDgsTextColor = '#ff00ff';
    sector.__liaDgsLineColor = '#ff00ff';
    sector.__liaDgsFillColor = '#ff00ff';
    sector.__liaDgsShowName = true;
    sector.__liaDgsShowObject = true;
    sector.__liaDgsOpacity = 0.2;
    sector.__liaDgsLineStyle = 'solid';
    sector.__liaDgsShowArea = false;
    sector.__liaDgsShowPerimeter = false;
    refreshDgsObjectLabel(sector);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return sector;
  } catch (e) {
    return null;
  }
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

function syncDgsRightAngleStyle(angle: any): void {
  if (!isDgsAngle(angle)) return;
  const orthoType = 'sectordot';
  const color = getDgsObjectColor(angle, 'line');
  try {
    angle.setAttribute({
      orthoType,
      orthotype: orthoType,
      dot: {
        face: 'o',
        size: 2.5,
        strokeColor: color,
        fillColor: color,
        highlightStrokeColor: color,
        highlightFillColor: color
      }
    });
  } catch (e) {}
  try {
    if (angle.dot && typeof angle.dot.setAttribute === 'function') {
      angle.dot.setAttribute({
        face: 'o',
        size: 2.5,
        strokeColor: color,
        fillColor: color,
        highlightStrokeColor: color,
        highlightFillColor: color
      });
    }
  } catch (e) {}
  try {
    if (angle.arc && typeof angle.arc.setAttribute === 'function') {
      angle.arc.setAttribute({
        visible: false,
        fillColor: 'none',
        highlightFillColor: 'none',
        fillOpacity: 0,
        highlightFillOpacity: 0
      });
    }
  } catch (e) {}
  try {
    if (angle.arc && typeof angle.arc.hideElement === 'function') angle.arc.hideElement();
  } catch (e) {}
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
      orthoType: 'sectordot',
      orthotype: 'sectordot',
      orthoSensitivity: 0.25,
      orthosensitivity: 0.25,
      orientation: 'counterclockwise',
      selection: 'auto',
      radius: function() { return getDgsAngleRadius(points); },
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 2.5,
      highlightStrokeWidth: 2.5,
      dash: 0,
      fillColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      fillOpacity: 0.22,
      highlightFillOpacity: 0.22,
      arc: {
        visible: false,
        fillColor: 'none',
        highlightFillColor: 'none',
        fillOpacity: 0,
        highlightFillOpacity: 0
      },
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
    angle.__liaDgsLineStyle = 'solid';
    angle.__liaDgsShowAngle = false;
    syncDgsRightAngleStyle(angle);
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

function parseDgsAngleDegrees(value: unknown): number | null {
  const text = String(value == null ? '' : value).trim().replace(',', '.');
  const degrees = Number(text);
  return text && Number.isFinite(degrees) && degrees > 0 && degrees < 360 ? degrees : null;
}

function setDgsPointPosition(point: any, x: number, y: number): boolean {
  if (!point || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  try {
    if (typeof point.setPositionDirectly === 'function' && typeof JXG !== 'undefined') {
      point.setPositionDirectly(JXG.COORDS_BY_USER, [x, y]);
      return true;
    }
    if (typeof point.moveTo === 'function') {
      point.moveTo([x, y], 0);
      return true;
    }
  } catch (e) {}
  return false;
}

type DgsCompassTranslationSnapshot = {
  centerX: number;
  centerY: number;
  pointX: number;
  pointY: number;
};

function readDgsPointPosition(point: any): { x: number; y: number } | null {
  if (!point) return null;
  try {
    const x = Number(point.X());
    const y = Number(point.Y());
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch (e) {
    return null;
  }
}

function resetDgsFixedCompassTranslationSnapshot(arc: any): void {
  if (!isDgsCompassArc(arc)) return;
  const center = readDgsPointPosition(arc.__liaDgsCompassCenterPoint);
  const point = readDgsPointPosition(arc.__liaDgsCompassRadiusPoint);
  arc.__liaDgsCompassTranslationSnapshot = center && point
    ? {
        centerX: center.x,
        centerY: center.y,
        pointX: point.x,
        pointY: point.y
      } satisfies DgsCompassTranslationSnapshot
    : null;
}

function scheduleDgsFixedCompassRefresh(state: DgsState): void {
  if (!state || state.fixedCompassSyncRAF != null) return;
  state.fixedCompassSyncRAF = requestAnimationFrame(() => {
    state.fixedCompassSyncRAF = undefined;
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    refreshSideMenuCoordinates(state);
  });
}

function flushDgsFixedCompassPersistence(state: DgsState): void {
  if (!state || !state.fixedCompassPersistPending || state.fixedCompassSyncing) return;
  const recordHistory = state.fixedCompassPersistHistory === true;
  state.fixedCompassPersistPending = false;
  state.fixedCompassPersistHistory = false;
  persistDgsConstruction(state, recordHistory);
}

function fixedCompassSnapshotPosition(
  arc: any,
  point: any
): { x: number; y: number } | null {
  const snapshot = arc && arc.__liaDgsCompassTranslationSnapshot as
    DgsCompassTranslationSnapshot | null;
  if (!snapshot) return null;
  if (arc.__liaDgsCompassCenterPoint === point) {
    return Number.isFinite(snapshot.centerX) && Number.isFinite(snapshot.centerY)
      ? { x: snapshot.centerX, y: snapshot.centerY }
      : null;
  }
  if (arc.__liaDgsCompassRadiusPoint === point) {
    return Number.isFinite(snapshot.pointX) && Number.isFinite(snapshot.pointY)
      ? { x: snapshot.pointX, y: snapshot.pointY }
      : null;
  }
  return null;
}

function isDgsFixedCompassFollowerBlocked(point: any): boolean {
  return !point || getDgsObjectFixed(point) || !!point.__liaDgsCoordinateExpressions ||
    String(point.elType || '').toLowerCase() === 'glider' ||
    point.__liaDgsMidpoint === true || point.__liaDgsRootPoint === true ||
    point.__liaDgsExtremumPoint === true || point.__liaDgsInflectionPoint === true ||
    point.__liaDgsYInterceptPoint === true || point.__liaDgsIntersectionPoint === true ||
    point.__liaDgsTangentPoint === true || point.__liaDgsGeneratedPoint === true ||
    point.__liaDgsHelperPoint === true;
}

function translateDgsFixedCompassComponent(state: DgsState, driver: any): boolean {
  if (!state || !state.board || !driver || state.restoring || state.fixedCompassSyncing) return false;
  const availableArcs = getDgsBoardObjects(state.board).filter((object) =>
    isDgsCompassArc(object) && !object.__liaDgsCompassDraft &&
    object.__liaDgsCompassFixedRadius === true
  );
  const componentPoints = new Set<any>([driver]);
  const componentArcs = new Set<any>();
  const queue = [driver];
  while (queue.length) {
    const point = queue.shift();
    availableArcs.forEach((arc) => {
      if (componentArcs.has(arc) ||
          (arc.__liaDgsCompassCenterPoint !== point &&
           arc.__liaDgsCompassRadiusPoint !== point)) return;
      componentArcs.add(arc);
      [arc.__liaDgsCompassCenterPoint, arc.__liaDgsCompassRadiusPoint].forEach((candidate) => {
        if (!candidate || componentPoints.has(candidate)) return;
        componentPoints.add(candidate);
        queue.push(candidate);
      });
    });
  }
  if (!componentArcs.size) return false;

  const baseline = new Map<any, { x: number; y: number }>();
  componentArcs.forEach((arc) => {
    [arc.__liaDgsCompassCenterPoint, arc.__liaDgsCompassRadiusPoint].forEach((point) => {
      if (baseline.has(point)) return;
      const position = fixedCompassSnapshotPosition(arc, point);
      if (position) baseline.set(point, position);
    });
  });
  const previousDriver = baseline.get(driver);
  const currentDriver = readDgsPointPosition(driver);
  if (!previousDriver || !currentDriver || baseline.size !== componentPoints.size) {
    componentArcs.forEach(resetDgsFixedCompassTranslationSnapshot);
    return false;
  }
  const dx = currentDriver.x - previousDriver.x;
  const dy = currentDriver.y - previousDriver.y;
  const scale = Math.max(1, Math.abs(currentDriver.x), Math.abs(currentDriver.y));
  if (Math.hypot(dx, dy) <= 1e-9 * scale) return false;

  const followers = Array.from(componentPoints).filter((point) => point !== driver);
  const alreadyTranslated = followers.every((point) => {
    const previous = baseline.get(point);
    const current = readDgsPointPosition(point);
    if (!previous || !current) return false;
    const followerScale = Math.max(1, Math.abs(current.x), Math.abs(current.y));
    return Math.hypot(
      current.x - previous.x - dx,
      current.y - previous.y - dy
    ) <= 1e-9 * followerScale;
  });
  if (alreadyTranslated) {
    componentPoints.forEach((point) => updateDgsCoordinatePointState(state, point));
    componentArcs.forEach(resetDgsFixedCompassTranslationSnapshot);
    return true;
  }
  const blocked = followers.some(isDgsFixedCompassFollowerBlocked);
  state.fixedCompassSyncing = true;
  try {
    if (blocked) {
      setDgsPointPosition(driver, previousDriver.x, previousDriver.y);
    } else {
      let translated = true;
      followers.forEach((point) => {
        const previous = baseline.get(point);
        if (!previous) {
          translated = false;
          return;
        }
        const targetX = previous.x + dx;
        const targetY = previous.y + dy;
        translated = setDgsPointPosition(point, targetX, targetY) && translated;
        const current = readDgsPointPosition(point);
        const scale = current ? Math.max(1, Math.abs(current.x), Math.abs(current.y)) : 1;
        translated = !!current &&
          Math.hypot(current.x - targetX, current.y - targetY) <= 1e-8 * scale &&
          translated;
      });
      if (!translated) {
        componentPoints.forEach((point) => {
          const previous = baseline.get(point);
          if (previous) setDgsPointPosition(point, previous.x, previous.y);
        });
      } else {
        followers.forEach((point) => recordDgsPointTraceMotion(state, point));
      }
    }
    componentPoints.forEach((point) => updateDgsCoordinatePointState(state, point));
    componentArcs.forEach(resetDgsFixedCompassTranslationSnapshot);
  } finally {
    state.fixedCompassSyncing = false;
  }
  flushDgsFixedCompassPersistence(state);
  scheduleDgsFixedCompassRefresh(state);
  return true;
}

function syncDgsFixedCompassConstructions(state: DgsState): boolean {
  if (!state || !state.board || state.restoring || state.fixedCompassSyncing) return false;
  const arcs = getDgsBoardObjects(state.board).filter((object) =>
    isDgsCompassArc(object) && !object.__liaDgsCompassDraft &&
    object.__liaDgsCompassFixedRadius === true
  );
  if (!arcs.length) return false;

  const movedPoints = new Set<any>();
  arcs.forEach((arc) => {
    [arc.__liaDgsCompassCenterPoint, arc.__liaDgsCompassRadiusPoint].forEach((point) => {
      const previous = fixedCompassSnapshotPosition(arc, point);
      const current = readDgsPointPosition(point);
      if (!previous || !current) {
        resetDgsFixedCompassTranslationSnapshot(arc);
        return;
      }
      const scale = Math.max(1, Math.abs(current.x), Math.abs(current.y));
      if (Math.hypot(current.x - previous.x, current.y - previous.y) > 1e-9 * scale) {
        movedPoints.add(point);
      }
    });
  });
  let changed = false;
  movedPoints.forEach((point) => {
    changed = translateDgsFixedCompassComponent(state, point) || changed;
  });
  flushDgsFixedCompassPersistence(state);
  return changed;
}

function applyDgsMeasuredAngle(
  state: DgsState,
  angle: any,
  degrees: number,
  recordHistory = true
): boolean {
  if (!isDgsAngle(angle) || !angle.__liaDgsMeasuredConstruction ||
      !Number.isFinite(degrees) || degrees <= 0 || degrees >= 360) return false;
  const points = angle.__liaDgsAnglePoints;
  if (!Array.isArray(points) || points.length !== 3) return false;
  try {
    const firstX = Number(points[0].X());
    const firstY = Number(points[0].Y());
    const vertexX = Number(points[1].X());
    const vertexY = Number(points[1].Y());
    const dx = firstX - vertexX;
    const dy = firstY - vertexY;
    const radius = Math.hypot(dx, dy);
    if (!Number.isFinite(radius) || radius <= 1e-12) return false;
    const radians = degrees * Math.PI / 180;
    const targetX = vertexX + Math.cos(radians) * dx - Math.sin(radians) * dy;
    const targetY = vertexY + Math.sin(radians) * dx + Math.cos(radians) * dy;
    if (!setDgsPointPosition(points[2], targetX, targetY)) return false;
    angle.__liaDgsTargetAngle = degrees;
    refreshDgsObjectLabel(angle);
    if (state.contextObject === angle && state.angleMeasureSection && !state.angleMeasureSection.hidden) {
      state.angleMeasureInput.value = formatCoordinate(degrees);
      state.angleMeasureInput.setAttribute('aria-invalid', 'false');
    }
    try { if (state.board && typeof state.board.fullUpdate === 'function') state.board.fullUpdate(); } catch (e) {
      try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e2) {}
    }
    persistDgsConstruction(state, recordHistory);
    return true;
  } catch (e) { return false; }
}

function configureDgsMeasuredAngle(state: DgsState, angle: any): void {
  if (!isDgsAngle(angle) || !angle.__liaDgsMeasuredConstruction || angle.__liaDgsMeasuredListenersAttached) return;
  const points = angle.__liaDgsAnglePoints;
  if (!Array.isArray(points) || points.length !== 3) return;
  angle.__liaDgsMeasuredListenersAttached = true;
  angle.__liaDgsGeneratedPoint = points[2];

  const syncFromBase = (recordHistory: boolean) => {
    const degrees = Number(angle.__liaDgsTargetAngle);
    if (Number.isFinite(degrees)) applyDgsMeasuredAngle(state, angle, degrees, recordHistory);
  };
  [points[0], points[1]].forEach((point: any) => {
    try { point.on('drag', () => syncFromBase(false)); } catch (e) {}
    try { point.on('up', () => syncFromBase(true)); } catch (e) {}
  });
  try {
    points[2].on('drag', () => {
      const radians = getDgsAngleRadians(angle);
      if (!Number.isFinite(radians)) return;
      angle.__liaDgsTargetAngle = radians * 180 / Math.PI;
      syncFromBase(false);
    });
  } catch (e) {}
  try { points[2].on('up', () => syncFromBase(true)); } catch (e) {}
}

function ensureDgsPersistentId(object: any, prefix: string): string {
  if (!object.__liaDgsPersistentId) {
    dgsPersistentIdCounter += 1;
    object.__liaDgsPersistentId = prefix + '-' + Date.now().toString(36) + '-' + dgsPersistentIdCounter.toString(36);
  }
  return String(object.__liaDgsPersistentId);
}

function getDgsFunctionLabelPosition(state: DgsState, graph: any): [number, number] {
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  const unitX = Math.max(1, Math.abs(Number(state.board && state.board.unitX) || 1));
  const unitY = Math.max(1, Math.abs(Number(state.board && state.board.unitY) || 1));
  const xmin = bbox[0];
  const ymax = bbox[1];
  const xmax = bbox[2];
  const ymin = bbox[3];
  const rightInset = (state.sideMenuOpen ? SIDE_MENU_WIDTH_PX + 14 : 14) / unitX;
  const topInset = (state.open ? MENU_HEIGHT_PX + 18 : 18) / unitY;
  const bottomInset = 18 / unitY;
  const startX = xmax - rightInset;
  const endX = xmin + 18 / unitX;
  const topY = ymax - topInset;
  const bottomY = ymin + bottomInset;
  for (let index = 0; index <= 180; index += 1) {
    const ratio = index / 180;
    const x = startX - ratio * (startX - endX);
    let y = NaN;
    try { y = Number(graph.Y(x)); } catch (e) {}
    if (Number.isFinite(y) && y <= topY && y >= bottomY) return [x, y];
  }
  let fallbackY = NaN;
  try { fallbackY = Number(graph.Y(startX)); } catch (e) {}
  return [startX, fallbackY];
}

const dgsFunctionEvaluationStack = new Set<any>();

function getDgsExpressionFunctionName(object: any): string {
  let name = String(object && (object.__liaDgsFunctionName || object.name) || '').trim();
  name = name
    .replace(/^\\\(|\\\)$/g, '')
    .replace(/^\$+|\$+$/g, '')
    .replace(/\s*\(\s*x\s*\)\s*$/i, '')
    .trim()
    .toLowerCase();
  return /^[a-z][a-z0-9]*$/.test(name) ? name : '';
}

function getDgsExpressionFunctionBindings(
  state: DgsState,
  excludeObject?: any
): Record<string, (x: number) => number> {
  const bindings: Record<string, (x: number) => number> = {};
  getDgsBoardObjects(state.board).forEach((object) => {
    if (!object || object === excludeObject || !isDgsFunctionTarget(object) || typeof object.Y !== 'function') return;
    const name = getDgsExpressionFunctionName(object);
    if (!name || bindings[name]) return;
    bindings[name] = (x: number) => {
      if (dgsFunctionEvaluationStack.has(object)) return NaN;
      dgsFunctionEvaluationStack.add(object);
      try {
        const evaluator = typeof object.__liaDgsFunctionEvaluator === 'function'
          ? object.__liaDgsFunctionEvaluator
          : object.Y;
        const value = Number(evaluator(x));
        return Number.isFinite(value) ? value : NaN;
      } catch (e) {
        return NaN;
      } finally {
        dgsFunctionEvaluationStack.delete(object);
      }
    };
  });
  return bindings;
}

const DGS_RESERVED_PARAMETER_NAMES = new Set([
  'x', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'sqrt', 'exp', 'ln', 'log', 'abs', 'floor', 'ceil', 'round',
  'min', 'max', 'pow'
]);

function normalizeDgsParameterName(value: unknown): string {
  const name = String(value == null ? '' : value).trim().toLowerCase();
  return /^[a-z][a-z0-9]*$/.test(name) && !DGS_RESERVED_PARAMETER_NAMES.has(name) ? name : '';
}

function isDgsSlider(object: any): boolean {
  return !!object && !!object.__liaDgsSlider;
}

function getDgsSliderValue(slider: any): number {
  if (!isDgsSlider(slider) || slider.__liaDgsSliderDeleted) return NaN;
  try {
    const value = Number(typeof slider.Value === 'function' ? slider.Value() : slider.__liaDgsSliderValue);
    return Number.isFinite(value) ? value : NaN;
  } catch (e) {
    return NaN;
  }
}

function getDgsExpressionVariableBindings(
  state: DgsState,
  excludeObject?: any
): Record<string, () => number> {
  const bindings: Record<string, () => number> = {};
  getDgsBoardObjects(state.board).forEach((object) => {
    if (!isDgsSlider(object) || object === excludeObject) return;
    const name = normalizeDgsParameterName(object.__liaDgsSliderName);
    if (!name || bindings[name]) return;
    bindings[name] = () => getDgsSliderValue(object);
  });
  return bindings;
}

function compileDgsExpression(state: DgsState, expression: unknown, excludeObject?: any) {
  return compileFunctionExpression(
    expression,
    getDgsExpressionFunctionBindings(state, excludeObject),
    getDgsExpressionVariableBindings(state, excludeObject)
  );
}

function findMissingDgsExpressionParameters(
  state: DgsState,
  expression: unknown,
  excludeObject?: any
): string[] {
  let ascii = '';
  try { ascii = transformLatex(prepareFunctionInput(expression)); } catch (e) { return []; }
  const knownFunctions = new Set(Object.keys(getDgsExpressionFunctionBindings(state, excludeObject)));
  try { ascii = expandImplicitVariableProducts(ascii, knownFunctions); } catch (e) { return []; }
  const knownVariables = new Set(Object.keys(getDgsExpressionVariableBindings(state, excludeObject)));
  const missing: string[] = [];
  const pattern = /[A-Za-z][A-Za-z0-9]*/g;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(ascii))) {
    const name = String(match[0] || '').toLowerCase();
    if (!name || DGS_RESERVED_PARAMETER_NAMES.has(name) ||
        knownFunctions.has(name) || knownVariables.has(name) || missing.includes(name)) continue;
    const followedByParenthesis = /^\s*\(/.test(ascii.slice(pattern.lastIndex));
    if (followedByParenthesis && name.length > 1) continue;
    if (normalizeDgsParameterName(name) && dgsParameterNameAvailable(state, name, excludeObject)) {
      missing.push(name);
    }
  }
  return missing;
}

function compileDgsFunctionWithAutomaticParameters(
  state: DgsState,
  expression: unknown,
  excludeObject?: any
): { compiled: ReturnType<typeof compileFunctionExpression>; createdSliders: any[] } | null {
  const raw = String(expression == null ? '' : expression).trim();
  if (!raw) return null;
  if (state.restoring) {
    try {
      const compiled = compileDgsExpression(state, raw, excludeObject);
      return compiled.fn && compiled.normalized ? { compiled, createdSliders: [] } : null;
    } catch (e) {
      return null;
    }
  }
  const missing = findMissingDgsExpressionParameters(state, raw, excludeObject);
  const functionBindings = getDgsExpressionFunctionBindings(state, excludeObject);
  const virtualVariables: Record<string, () => number> = {
    ...getDgsExpressionVariableBindings(state, excludeObject)
  };
  missing.forEach((name) => { virtualVariables[name] = () => 1; });
  try {
    const preliminary = compileFunctionExpression(raw, functionBindings, virtualVariables);
    if (!preliminary.fn || !preliminary.normalized) return null;
  } catch (e) {
    return null;
  }

  const createdSliders: any[] = [];
  for (const name of missing) {
    const slider = createDgsSlider(state, name, -5, 5, 0.1, 1);
    if (!slider) {
      createdSliders.forEach((created) => removeDgsSliderImmediately(state, created));
      return null;
    }
    createdSliders.push(slider);
  }
  try {
    const compiled = compileDgsExpression(state, raw, excludeObject);
    if (!compiled.fn || !compiled.normalized) throw new Error('Invalid function expression');
    return { compiled, createdSliders };
  } catch (e) {
    createdSliders.forEach((created) => removeDgsSliderImmediately(state, created));
    return null;
  }
}

function dgsParameterNameAvailable(state: DgsState, nameValue: unknown, excludeObject?: any): boolean {
  const name = normalizeDgsParameterName(nameValue);
  if (!name) return false;
  if (isDgsFunction(excludeObject) && getDgsExpressionFunctionName(excludeObject) === name) return false;
  return !getDgsBoardObjects(state.board).some((object) => {
    if (!object || object === excludeObject) return false;
    if (isDgsSlider(object)) return normalizeDgsParameterName(object.__liaDgsSliderName) === name;
    if (isDgsFunction(object)) return getDgsExpressionFunctionName(object) === name;
    return false;
  });
}

function getNextDgsSliderName(state: DgsState): string {
  const preferred = 'abcdfghjklmnopqrstuvwyz';
  for (const name of preferred) {
    if (dgsParameterNameAvailable(state, name)) return name;
  }
  for (let index = 1; index < 10000; index += 1) {
    const name = 'a' + index;
    if (dgsParameterNameAvailable(state, name)) return name;
  }
  return 'parameter';
}

function normalizeDgsSliderSettings(
  minimumValue: unknown,
  maximumValue: unknown,
  stepValue: unknown,
  currentValue: unknown
): { minimum: number; maximum: number; step: number; value: number } | null {
  const parse = (value: unknown) => Number(String(value == null ? '' : value).trim().replace(',', '.'));
  const minimum = parse(minimumValue);
  const maximum = parse(maximumValue);
  const step = parse(stepValue);
  const inputValue = parse(currentValue);
  if (![minimum, maximum, step, inputValue].every(Number.isFinite) || maximum <= minimum || step <= 0) return null;
  const clamped = Math.max(minimum, Math.min(maximum, inputValue));
  const snapped = minimum + Math.round((clamped - minimum) / step) * step;
  const precision = Math.max(0, Math.min(12, String(step).split('.')[1]?.length || 0));
  return {
    minimum,
    maximum,
    step,
    value: Number(Math.max(minimum, Math.min(maximum, snapped)).toFixed(precision))
  };
}

function getDgsSliderPosition(state: DgsState): { x1: number; y1: number; x2: number; y2: number } {
  let bbox = [-5, 5, 5, -5];
  try {
    const current = state.board.getBoundingBox();
    if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
  } catch (e) {}
  const unitX = Math.max(1e-9, Math.abs(Number(state.board && state.board.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(state.board && state.board.unitY) || 1));
  const count = getDgsBoardObjects(state.board).filter(isDgsSlider).length;
  const leftInset = 34 / unitX;
  const topInset = (state.open ? MENU_HEIGHT_PX + 34 : 34) / unitY;
  const rowOffset = (count % 8) * 42 / unitY;
  const columnOffset = Math.floor(count / 8) * 190 / unitX;
  const x1 = bbox[0] + leftInset + columnOffset;
  const x2 = Math.min(bbox[2] - 34 / unitX, x1 + 145 / unitX);
  const y = bbox[1] - topInset - rowOffset;
  return { x1, y1: y, x2: Math.max(x1 + 50 / unitX, x2), y2: y };
}

function refreshDgsSliderDependents(state: DgsState, recordHistory = false): void {
  scheduleDgsCoordinateSync(state);
  scheduleDgsRootUpdate(state);
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  if (recordHistory) persistDgsConstruction(state);
}

function dgsSliderNameToTex(nameValue: unknown): string {
  const name = normalizeDgsParameterName(nameValue);
  if (!name) return '';
  const greek = new Set([
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
    'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
    'upsilon', 'phi', 'chi', 'psi', 'omega'
  ]);
  const match = name.match(/^([a-z]+)(\d+)?$/);
  if (!match) return name;
  const base = greek.has(match[1]) ? '\\' + match[1] : (match[1].length === 1 ? match[1] : '\\mathit{' + match[1] + '}');
  return match[2] ? base + '_{' + match[2] + '}' : base;
}

function refreshDgsSliderTypography(state: DgsState): void {
  const currentScale = Math.sqrt(
    Math.max(1e-9, Math.abs(Number(state.board && state.board.unitX) || 1)) *
    Math.max(1e-9, Math.abs(Number(state.board && state.board.unitY) || 1))
  );
  getDgsBoardObjects(state.board).filter(isDgsSlider).forEach((slider) => {
    const baseScale = Number(slider.__liaDgsSliderFontBaseScale) || currentScale;
    slider.__liaDgsSliderFontBaseScale = baseScale;
    const baseFontSize = Math.max(8, Math.min(96, Number(slider.__liaDgsFormatFontSize) || 18));
    const fontSize = Math.max(8, Math.min(96, baseFontSize * currentScale / baseScale));
    if (Math.abs(Number(slider.__liaDgsSliderFontSize) - fontSize) < 0.05) return;
    slider.__liaDgsSliderFontSize = fontSize;
    try { slider.label?.setAttribute({ fontSize }); } catch (e) {}
    try {
      if (slider.label && slider.label.rendNode) slider.label.rendNode.style.fontSize = fontSize.toFixed(2) + 'px';
    } catch (e) {}
  });
}

function removeDgsSliderImmediately(state: DgsState, slider: any): void {
  if (!isDgsSlider(slider)) return;
  slider.__liaDgsSliderDeleted = true;
  [slider.label, slider.highline, slider.baseline, slider.point1, slider.point2, slider].forEach((part) => {
    try { if (part && state.board) state.board.removeObject(part); } catch (e) {}
  });
}

function createDgsSlider(
  state: DgsState,
  nameValue: unknown,
  minimumValue: unknown,
  maximumValue: unknown,
  stepValue: unknown,
  currentValue: unknown,
  position?: { x1: number; y1: number; x2: number; y2: number }
): any | null {
  const name = normalizeDgsParameterName(nameValue);
  const settings = normalizeDgsSliderSettings(minimumValue, maximumValue, stepValue, currentValue);
  if (!state.board || !name || !settings || !dgsParameterNameAvailable(state, name)) return null;
  const coordinates = position || getDgsSliderPosition(state);
  let slider: any = null;
  try {
    slider = state.board.create('slider', [
      [coordinates.x1, coordinates.y1],
      [coordinates.x2, coordinates.y2],
      [settings.minimum, settings.value, settings.maximum]
    ], {
      name,
      withLabel: true,
      unitLabel: '',
      snapWidth: settings.step,
      precision: Math.max(2, Math.min(10, (String(settings.step).split('.')[1]?.length || 0) + 1)),
      size: 5,
      strokeWidth: 2,
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      highlightFillColor: '#ff00ff',
      baseline: {
        strokeColor: '#ff00ff',
        highlightStrokeColor: '#ff00ff',
        fixed: false,
        needsRegularUpdate: true
      },
      highline: {
        strokeColor: '#ff00ff',
        highlightStrokeColor: '#ff00ff'
      },
      point1: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fixed: false
      },
      point2: {
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        fixed: false
      },
      label: {
        strokeColor: '#ff00ff',
        highlightStrokeColor: '#ff00ff',
        useMathJax: true,
        fontSize: 18
      },
      fixed: false,
      frozen: false
    });
    slider.__liaDgsSlider = true;
    slider.__liaDgsSliderName = name;
    slider.__liaDgsSliderMinimum = settings.minimum;
    slider.__liaDgsSliderMaximum = settings.maximum;
    slider.__liaDgsSliderStep = settings.step;
    slider.__liaDgsSliderValue = settings.value;
    slider.__liaDgsSliderPositionLocked = false;
    slider.__liaDgsSliderFontBaseScale = Math.sqrt(
      Math.max(1e-9, Math.abs(Number(state.board.unitX) || 1)) *
      Math.max(1e-9, Math.abs(Number(state.board.unitY) || 1))
    );
    slider.__liaDgsFormatFontSize = 18;
    slider.__liaDgsShowName = true;
    slider.__liaDgsShowObject = true;
    slider.__liaDgsOpacity = 1;
    slider.__liaDgsTextColor = '#ff00ff';
    slider.__liaDgsLineColor = '#ff00ff';
    slider.__liaDgsFillColor = '#ff00ff';
    slider.__liaDgsLanguage = state.language;
    ensureDgsPersistentId(slider, 'slider');
    [slider.baseline, slider.highline, slider.point1, slider.point2].forEach((part: any) => {
      if (part) part.__liaDgsSliderOwner = slider;
    });
    const update = (recordHistory: boolean) => {
      slider.__liaDgsSliderValue = getDgsSliderValue(slider);
      refreshDgsSliderDependents(state, recordHistory);
      if (state.contextObject === slider && state.sliderValueInput) {
        state.sliderValueInput.value = formatCoordinate(slider.__liaDgsSliderValue);
      }
    };
    try { slider.on('drag', () => update(false)); } catch (e) {}
    try { slider.on('up', () => update(true)); } catch (e) {}
    [slider.point1, slider.point2, slider.baseline].forEach((part: any) => {
      try { part?.on('drag', () => persistDgsConstruction(state, false)); } catch (e) {}
      try { part?.on('up', () => persistDgsConstruction(state, true)); } catch (e) {}
    });
    refreshDgsObjectLabel(slider);
    refreshDgsSliderTypography(state);
    refreshDgsSliderDependents(state, false);
    return slider;
  } catch (e) {
    try { if (slider) state.board.removeObject(slider); } catch (e2) {}
    return null;
  }
}

function setDgsSliderSettings(
  state: DgsState,
  slider: any,
  minimumValue: unknown,
  maximumValue: unknown,
  stepValue: unknown,
  currentValue: unknown,
  recordHistory = true
): boolean {
  if (!isDgsSlider(slider)) return false;
  const settings = normalizeDgsSliderSettings(minimumValue, maximumValue, stepValue, currentValue);
  if (!settings) return false;
  try {
    slider.__liaDgsSliderMinimum = settings.minimum;
    slider.__liaDgsSliderMaximum = settings.maximum;
    slider.__liaDgsSliderStep = settings.step;
    if (typeof slider.setMin === 'function') slider.setMin(settings.minimum);
    else slider._smin = settings.minimum;
    if (typeof slider.setMax === 'function') slider.setMax(settings.maximum);
    else slider._smax = settings.maximum;
    if (typeof slider.setAttribute === 'function') slider.setAttribute({ snapWidth: settings.step });
    if (typeof slider.setValue === 'function') slider.setValue(settings.value);
    slider.__liaDgsSliderValue = settings.value;
    refreshDgsSliderDependents(state, recordHistory);
    return true;
  } catch (e) {
    return false;
  }
}

function createDgsFunction(state: DgsState, expression: string): any | null {
  const raw = String(expression || '').trim();
  if (!state.board || !raw) return null;
  let createdSliders: any[] = [];
  try {
    const result = compileDgsFunctionWithAutomaticParameters(state, raw);
    if (!result) return null;
    const compiled = result.compiled;
    createdSliders = result.createdSliders;
    const name = getNextFunctionName(state);
    const graph = state.board.create('functiongraph', [createDgsPlottedFunctionEvaluator(state, compiled.fn)], {
      name,
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      strokeWidth: 3,
      dash: 0,
      resolution: 3,
      vectorContent: 2,
      plotpoints: false,
      fixed: true,
      withLabel: false
    });
    graph.__liaDgsFunction = true;
    graph.__liaDgsFunctionEvaluator = compiled.fn;
    graph.__liaDgsFunctionName = name;
    graph.__liaDgsFunctionExpression = raw;
    graph.__liaDgsFunctionNormalized = compiled.normalized;
    graph.__liaDgsShowName = true;
    graph.__liaDgsShowExpression = false;
    graph.__liaDgsShowObject = true;
    graph.__liaDgsLineStyle = 'solid';
    graph.__liaDgsLineColor = '#ff00ff';
    graph.__liaDgsTextColor = '#ff00ff';
    graph.__liaDgsFillColor = '#ff00ff';
    graph.__liaDgsLanguage = state.language;
    ensureDgsPersistentId(graph, 'function');
    const label = state.board.create('text', [
      function() { return getDgsFunctionLabelPosition(state, graph)[0]; },
      function() { return getDgsFunctionLabelPosition(state, graph)[1]; },
      function() { return dgsObjectLabelText(graph); }
    ], {
      fixed: true,
      visible: true,
      useMathJax: true,
      display: 'html',
      strokeColor: '#ff00ff',
      fillColor: '#ff00ff',
      fontSize: 16,
      anchorX: 'right',
      anchorY: 'middle',
      highlight: false
    });
    graph.label = label;
    graph.__liaDgsFunctionLabel = label;
    refreshDgsObjectLabel(graph);
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return graph;
  } catch (e) {
    createdSliders.forEach((slider) => removeDgsSliderImmediately(state, slider));
    return null;
  }
}

function clampDgsTextFontSize(value: unknown): number {
  const size = Number(value);
  return Number.isFinite(size) ? Math.max(8, Math.min(96, Math.round(size))) : 18;
}

function createDgsText(
  state: DgsState,
  x: number,
  y: number,
  content: string,
  fontSize = 18
): any | null {
  const raw = String(content == null ? '' : content).trim();
  if (!state.board || !raw || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let textObject: any = null;
  try {
    textObject = state.board.create('text', [
      x,
      y,
      function() { return String(textObject && textObject.__liaDgsTextContent || raw); }
    ], {
      fixed: false,
      display: 'internal',
      parse: false,
      useMathJax: false,
      fontSize: clampDgsTextFontSize(fontSize),
      strokeColor: '#ff00ff',
      highlightStrokeColor: '#ff00ff',
      anchorX: 'left',
      anchorY: 'middle'
    });
    textObject.__liaDgsText = true;
    textObject.__liaDgsTextContent = raw;
    textObject.__liaDgsTextFontSize = clampDgsTextFontSize(fontSize);
    textObject.__liaDgsFormatFontSize = textObject.__liaDgsTextFontSize;
    textObject.__liaDgsShowName = true;
    textObject.__liaDgsShowObject = true;
    textObject.__liaDgsOpacity = 1;
    textObject.__liaDgsTextColor = '#ff00ff';
    textObject.__liaDgsLineColor = '#ff00ff';
    textObject.__liaDgsFillColor = '#ff00ff';
    textObject.__liaDgsLanguage = state.language;
    ensureDgsPersistentId(textObject, 'text');
    const saveText = (recordHistory = true) => persistDgsConstruction(state, recordHistory);
    try { textObject.on('drag', () => saveText(false)); } catch (e) {}
    try { textObject.on('up', () => saveText(true)); } catch (e) {}
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return textObject;
  } catch (e) {
    return null;
  }
}

function setDgsTextContent(state: DgsState, object: any, value: unknown): boolean {
  if (!isDgsText(object)) return false;
  const content = String(value == null ? '' : value).trim();
  if (!content) return false;
  object.__liaDgsTextContent = content;
  try {
    if (typeof object.setText === 'function') {
      object.setText(function() { return String(object.__liaDgsTextContent || ''); });
    }
  } catch (e) {}
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  persistDgsConstruction(state);
  return true;
}

function setDgsTextFontSize(state: DgsState, object: any, value: unknown): boolean {
  if (!isDgsText(object)) return false;
  const size = clampDgsTextFontSize(value);
  object.__liaDgsTextFontSize = size;
  object.__liaDgsFormatFontSize = size;
  try { object.setAttribute({ fontSize: size }); } catch (e) {}
  try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  persistDgsConstruction(state);
  return true;
}

function dgsFunctionExpressionToTex(expression: string): string {
  let value = String(expression || '').trim()
    .replace(/^\${1,2}\s*/, '').replace(/\s*\${1,2}$/, '')
    .replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '')
    .replace(/^\s*[A-Za-z]+\s*\(\s*x\s*\)\s*=\s*/, '')
    .replace(/^\s*y\s*=\s*/, '')
    .replace(/\bMath\./g, '');
  const hasTexCommands = value.includes('\\');
  value = value
    .replace(/(^|[^\w.])(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g, '$1\\frac{$2}{$3}')
    .replace(/(^|[^\w.])(\d+(?:\.\d+)?|[A-Za-z])\s*\/\s*(\d+(?:\.\d+)?|[A-Za-z])(?=$|[^\w.])/g, '$1\\frac{$2}{$3}');
  if (hasTexCommands) return value;
  value = value
    .replace(/\*\*/g, '^')
    .replace(/\^\(([^()]*)\)/g, '^{$1}')
    .replace(/\bpi\b/gi, '\\pi')
    .replace(/\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|ln|log|exp|sqrt)\b/g, '\\$1')
    .replace(/\babs\b/g, '\\operatorname{abs}')
    .replace(/\*/g, '\\cdot ');
  return value;
}

function refreshDgsFunctionExpressionPreview(state: DgsState, object: any, rawValue?: string): void {
  if (!state.functionExpressionPreview) return;
  const raw = typeof rawValue === 'string'
    ? rawValue
    : String(object && object.__liaDgsFunctionExpression || '');
  const name = getDgsObjectName(object) || 'f';
  let mathJax: any = null;
  try { mathJax = window.MathJax; } catch (e) {}
  if (!mathJax) {
    try { mathJax = window.parent && window.parent.MathJax; } catch (e) {}
  }
  try {
    if (mathJax && typeof mathJax.typesetClear === 'function') {
      mathJax.typesetClear([state.functionExpressionPreview]);
    }
  } catch (e) {}
  state.functionExpressionPreview.textContent =
    '\\(' + name + '(x) = ' + dgsFunctionExpressionToTex(raw) + '\\)';
  typesetDgsMath(state.functionExpressionPreview);
}

function applyDgsFunctionExpression(
  state: DgsState,
  object: any,
  expression: string,
  recordHistory = true
): boolean {
  if (!isDgsFunction(object)) return false;
  const raw = String(expression || '').trim();
  if (!raw) return false;
  let createdSliders: any[] = [];
  try {
    const result = compileDgsFunctionWithAutomaticParameters(state, raw, object);
    if (!result) return false;
    const compiled = result.compiled;
    createdSliders = result.createdSliders;
    object.__liaDgsFunctionEvaluator = compiled.fn;
    object.Y = createDgsPlottedFunctionEvaluator(state, compiled.fn);
    object.__liaDgsFunctionExpression = raw;
    object.__liaDgsFunctionNormalized = compiled.normalized;
    object.needsUpdate = true;
    try { if (typeof object.updateCurve === 'function') object.updateCurve(); } catch (e) {}
    try { if (typeof object.update === 'function') object.update(); } catch (e) {}
    refreshDgsObjectLabel(object);
    if (object.__liaDgsRootConstruction || object.__liaDgsExtremaConstruction ||
        object.__liaDgsInflectionConstruction || object.__liaDgsYInterceptConstruction ||
        (Array.isArray(object.__liaDgsIntersectionConstructions) &&
         object.__liaDgsIntersectionConstructions.length > 0)) {
      scheduleDgsRootUpdate(state);
    }
    syncDgsCoordinatePoints(state);
    try { if (state.board && typeof state.board.fullUpdate === 'function') state.board.fullUpdate(); } catch (e) {
      try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e2) {}
    }
    refreshDgsFunctionExpressionPreview(state, object);
    persistDgsConstruction(state, recordHistory);
    return true;
  } catch (e) {
    createdSliders.forEach((slider) => removeDgsSliderImmediately(state, slider));
    return false;
  }
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

type DgsAxisLabelEntry = { variable: string; description: string };
type DgsAxisLabels = { x: DgsAxisLabelEntry; y: DgsAxisLabelEntry };

function parseDgsAxisLabel(value: unknown, fallbackVariable: string): DgsAxisLabelEntry {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return { variable: fallbackVariable, description: '' };
  let match = raw.match(/^\$\$([^$]+)\$\$\s*(.*)$/);
  if (!match) match = raw.match(/^\$([^$]+)\$\s*(.*)$/);
  if (!match) match = raw.match(/^\\\((.+?)\\\)\s*(.*)$/);
  if (match) {
    return { variable: String(match[1] || '').trim(), description: String(match[2] || '').trim() };
  }
  const parts = raw.split(/\s+/);
  return {
    variable: String(parts.shift() || fallbackVariable).trim(),
    description: parts.join(' ').trim()
  };
}

function normalizeDgsAxisVariable(value: unknown): string {
  let variable = String(value == null ? '' : value).trim();
  const display = variable.match(/^\$\$([^$]+)\$\$$/);
  const dollar = variable.match(/^\$([^$]+)\$$/);
  const inline = variable.match(/^\\\((.+?)\\\)$/);
  if (display) variable = display[1];
  else if (dollar) variable = dollar[1];
  else if (inline) variable = inline[1];
  return variable.trim();
}

function getDgsAxisLabels(state: DgsState): DgsAxisLabels {
  const stored = state.board && state.board.__liaDgsAxisLabels;
  if (stored && stored.x && stored.y) {
    return {
      x: { variable: String(stored.x.variable || ''), description: String(stored.x.description || '') },
      y: { variable: String(stored.y.variable || ''), description: String(stored.y.description || '') }
    };
  }
  const spec = window.__liaAxisTitleSpecs && window.__liaAxisTitleSpecs[state.boardId];
  const labels = {
    x: parseDgsAxisLabel(spec && spec.xlabel, 'x'),
    y: parseDgsAxisLabel(spec && spec.ylabel, 'y')
  };
  if (state.board) state.board.__liaDgsAxisLabels = labels;
  return labels;
}

function formatDgsAxisLabel(entry: DgsAxisLabelEntry): string {
  const variable = normalizeDgsAxisVariable(entry.variable);
  const description = String(entry.description || '').trim();
  return (variable ? '$' + variable + '$' : '') + (description ? (variable ? ' ' : '') + description : '');
}

function applyDgsAxisLabels(state: DgsState, labels: DgsAxisLabels): void {
  const normalized: DgsAxisLabels = {
    x: {
      variable: normalizeDgsAxisVariable(labels.x.variable),
      description: String(labels.x.description || '').trim()
    },
    y: {
      variable: normalizeDgsAxisVariable(labels.y.variable),
      description: String(labels.y.description || '').trim()
    }
  };
  if (state.board) state.board.__liaDgsAxisLabels = normalized;
  window.__liaAxisTitleSpecs = window.__liaAxisTitleSpecs || {};
  const previous = window.__liaAxisTitleSpecs[state.boardId] || { id: state.boardId };
  window.__liaAxisTitleSpecs[state.boardId] = {
    ...previous,
    id: state.boardId,
    xlabel: formatDgsAxisLabel(normalized.x),
    ylabel: formatDgsAxisLabel(normalized.y)
  };
  try { window.__refreshAllAxisTitles?.(); } catch (e) {}
}

function getDgsAxisKey(state: DgsState, object: any): 'x' | 'y' | null {
  if (object && object === state.xAxis) return 'x';
  if (object && object === state.yAxis) return 'y';
  return null;
}

function dgsPointReference(point: any): any {
  return {
    id: point ? ensureDgsPersistentId(point, 'point') : '',
    macroKey: String((point && point.__liaDgsMacroKey) || ''),
    name: String((point && (point.__liaDgsPointName || point.name)) || '')
  };
}

function hasExplicitDgsLayer(object: any): boolean {
  try {
    return !!object && object.__liaDgsLayer != null &&
      Number.isFinite(Number(object.__liaDgsLayer));
  } catch (e) { return false; }
}

function hasExplicitDgsLayerOwner(object: any, seen = new Set<any>()): boolean {
  if (!object || typeof object !== 'object' || seen.has(object)) return false;
  seen.add(object);
  if (hasExplicitDgsLayer(object)) return true;
  return DGS_LAYER_OWNER_PROPERTIES.some((property) => {
    try { return hasExplicitDgsLayerOwner(object[property], seen); } catch (e) { return false; }
  });
}

function isMacroLayerManagedDgsObject(object: any, seen = new Set<any>()): boolean {
  if (!object || typeof object !== 'object' || seen.has(object)) return false;
  seen.add(object);
  try {
    if (object.__liaDgsMacroManaged === true ||
        String(object.__liaDgsMacroKey || '').startsWith('macro:') ||
        (object.__liaMacroSourceLayer != null &&
          Number.isFinite(Number(object.__liaMacroSourceLayer)))) return true;
  } catch (e) {}
  return DGS_LAYER_OWNER_PROPERTIES.some((property) => {
    try { return isMacroLayerManagedDgsObject(object[property], seen); } catch (e) { return false; }
  });
}

function dgsSnapshotLayerProperties(object: any): any {
  if (!isMacroLayerManagedDgsObject(object)) {
    // DGS-owned objects retain the historic always-persisted layer behaviour.
    return { layer: getDgsObjectLayer(object) };
  }
  if (!hasExplicitDgsLayerOwner(object)) {
    // A macro source layer is derived from code order. Omitting its numeric
    // value keeps automatic reordering out of DGS snapshots and undo history.
    return { layerExplicit: false };
  }
  // Explicit macro layers keep the legacy numeric shape. This both preserves
  // old snapshots and avoids a metadata-only undo entry during migration.
  return { layer: getDgsObjectLayer(object) };
}

function dgsDerivedPointRecord(point: any): any {
  const markers = getDgsPointTraceMarkers(point);
  const liveTracePoints = markers.map((marker: any) => {
    try { return { x: Number(marker.X()), y: Number(marker.Y()) }; } catch (e) { return null; }
  }).filter((entry: any) => entry && Number.isFinite(entry.x) && Number.isFinite(entry.y));
  const storedTracePoints = (Array.isArray(point?.__liaDgsTraceCoordinates)
    ? point.__liaDgsTraceCoordinates
    : []
  ).map((entry: any) => ({ x: Number(entry?.x), y: Number(entry?.y) }))
    .filter((entry: any) => Number.isFinite(entry.x) && Number.isFinite(entry.y));
  return {
    ...dgsPointReference(point),
    fixed: getDgsObjectFixed(point),
    showName: point.__liaDgsShowName !== false,
    showObject: point.__liaDgsShowObject !== false,
    showValue: !!point.__liaDgsShowValue,
    opacity: getDgsObjectOpacity(point),
    textColor: getDgsObjectColor(point, 'text'),
    lineColor: getDgsObjectColor(point, 'line'),
    fillColor: getDgsObjectColor(point, 'fill'),
    formatFontSize: getDgsFormatFontSize(point),
    ...dgsSnapshotLayerProperties(point),
    traceEnabled: !!point.__liaDgsTraceEnabled,
    traceColor: getDgsPointTraceColor(point),
    tracePoints: markers.length === 0 && storedTracePoints.length > 0
      ? storedTracePoints
      : (liveTracePoints.length === markers.length ? liveTracePoints : storedTracePoints)
  };
}

function dgsPolygonBorderRecord(border: any): any {
  return {
    id: ensureDgsPersistentId(border, 'polygon-border'),
    type: 'segment',
    name: getDgsObjectName(border),
    language: border.__liaDgsLanguage,
    fixed: getDgsObjectFixed(border),
    ...dgsSnapshotLayerProperties(border),
    showName: border.__liaDgsShowName !== false,
    showObject: border.__liaDgsShowObject !== false,
    opacity: getDgsObjectOpacity(border),
    textColor: getDgsObjectColor(border, 'text'),
    lineColor: getDgsObjectColor(border, 'line'),
    fillColor: getDgsObjectColor(border, 'fill'),
    formatFontSize: getDgsFormatFontSize(border),
    lineStyle: getDgsLineStyle(border),
    showLength: !!border.__liaDgsShowLength,
    design: isDgsSegmentStyleTarget(border) ? getDgsStrokeDesign(border) : '-',
    strokeWidth: isDgsSegmentStyleTarget(border) ? getDgsStrokeWidth(border) : 3,
    showRoots: !!border.__liaDgsRootConstruction,
    showYIntercept: !!border.__liaDgsYInterceptConstruction,
    rootPoints: (border.__liaDgsRootConstruction?.points || []).map(dgsDerivedPointRecord),
    yInterceptPoints: (border.__liaDgsYInterceptConstruction?.points || []).map(dgsDerivedPointRecord)
  };
}

function persistDgsConstruction(state: DgsState, recordHistory = true): void {
  if (!state || state.restoring || !state.board) return;
  if (state.fixedCompassSyncing) {
    state.fixedCompassPersistPending = true;
    state.fixedCompassPersistHistory =
      state.fixedCompassPersistHistory === true || recordHistory !== false;
    return;
  }
  syncDgsFixedCompassConstructions(state);
  assignDgsMacroPersistentIds(state.boardId, state.board);
  const records: any[] = [];
  getDgsBoardObjects(state.board).forEach((object) => {
    if (object && object.__liaDgsCompassDraft) return;
    if (object && (object.__liaDgsRootPoint || object.__liaDgsExtremumPoint ||
        object.__liaDgsInflectionPoint || object.__liaDgsYInterceptPoint ||
        object.__liaDgsIntersectionPoint)) return;
    if (object && (object.__liaDgsTangentPoint === true || object.__liaDgsTangentHelper === true)) return;
    if (object && object.__liaDgsPolygonBorder) return;
    let type = '';
    if (object && object.__liaDgsTangent) type = 'tangent';
    else if (object && object.__liaDgsMidpoint) type = 'midpoint';
    else if (object && object.__liaDgsAngleBisector) type = 'angle-bisector';
    else if (isDgsSlider(object)) type = 'slider';
    else if (isDgsPoint(object)) type = 'point';
    else if (isDgsText(object)) type = 'text';
    else if (isDgsFunction(object)) type = 'function';
    else if (isDgsExternalFunctionAnalysisTarget(object) && (
      object.__liaDgsRootConstruction || object.__liaDgsExtremaConstruction ||
      object.__liaDgsInflectionConstruction || object.__liaDgsYInterceptConstruction
    )) type = 'external-function-analysis';
    else if (object.__liaDgsSegment) type = 'segment';
    else if (isDgsRay(object)) type = 'ray';
    else if (isDgsVector(object)) type = 'vector';
    else if (isDgsCompassArc(object)) type = 'compass-arc';
    else if (isDgsArc(object)) type = 'arc';
    else if (isDgsPerpendicular(object)) type = 'perpendicular';
    else if (isDgsParallel(object)) type = 'parallel';
    else if (isDgsLine(object)) type = 'line';
    else if (isDgsPolygon(object)) type = 'polygon';
    else if (isDgsSector(object)) type = 'sector';
    else if (isDgsCircle(object)) type = 'circle';
    else if (isDgsAngle(object)) type = 'angle';
    if (!type) return;

    const record: any = {
      id: ensureDgsPersistentId(object, type),
      origin: object.__liaDgsMacroKey ? 'macro' : 'dgs',
      macroKey: String(object.__liaDgsMacroKey || ''),
      type,
      name: getDgsObjectName(object),
      language: object.__liaDgsLanguage || state.language,
      fixed: getDgsObjectFixed(object),
      ...dgsSnapshotLayerProperties(object),
      showName: object.__liaDgsShowName !== false,
      showObject: object.__liaDgsShowObject !== false,
      opacity: getDgsObjectOpacity(object),
      textColor: getDgsObjectColor(object, 'text'),
      lineColor: getDgsObjectColor(object, 'line'),
      fillColor: getDgsObjectColor(object, 'fill'),
      formatFontSize: getDgsFormatFontSize(object),
      showLength: !!object.__liaDgsShowLength,
      showEquation: !!object.__liaDgsShowEquation,
      showArea: !!object.__liaDgsShowArea,
      showPerimeter: !!object.__liaDgsShowPerimeter,
      showAngle: !!object.__liaDgsShowAngle,
      showExpression: !!object.__liaDgsShowExpression,
      showValue: !!object.__liaDgsShowValue,
      showRoots: !!object.__liaDgsRootConstruction,
      showExtrema: !!object.__liaDgsExtremaConstruction,
      showInflections: !!object.__liaDgsInflectionConstruction,
      showYIntercept: !!object.__liaDgsYInterceptConstruction,
      measuredAngle: !!object.__liaDgsMeasuredConstruction,
      targetAngle: Number.isFinite(Number(object.__liaDgsTargetAngle)) ? Number(object.__liaDgsTargetAngle) : null,
      autoName: isDgsVector(object)
        ? object.__liaDgsVectorAutoName !== false
        : object.__liaDgsPolygonAutoName !== false && object.__liaDgsAngleAutoName !== false
    };
    if (isDgsLineStyleTarget(object)) record.lineStyle = getDgsLineStyle(object);
    if (type === 'tangent') {
      const point = object.__liaDgsTangentPoint;
      const source = object.__liaDgsTangentSource;
      const sourceType = isDgsFunctionTarget(source)
        ? 'function'
        : (isDgsCircle(source)
          ? 'circle'
          : (isDgsRay(source)
            ? 'ray'
            : (isDgsVector(source) ? 'vector' : (source.__liaDgsSegment ? 'segment' : 'line'))));
      record.sourceId = ensureDgsPersistentId(source, sourceType);
      try { record.x = Number(point.X()); record.y = Number(point.Y()); } catch (e) {}
      record.contactPoint = {
        ...dgsDerivedPointRecord(point)
      };
    } else if (type === 'angle-bisector') {
      record.points = (object.__liaDgsAngleBisectorPoints || []).map(dgsPointReference);
    } else if (type === 'midpoint') {
      record.points = [
        dgsPointReference(object.__liaDgsMidpointFirst),
        dgsPointReference(object.__liaDgsMidpointSecond)
      ];
    } else if (type === 'slider') {
      const point1 = object.point1;
      const point2 = object.point2;
      try {
        record.x1 = Number(point1.X());
        record.y1 = Number(point1.Y());
        record.x2 = Number(point2.X());
        record.y2 = Number(point2.Y());
      } catch (e) {}
      record.minimum = Number(object.__liaDgsSliderMinimum);
      record.maximum = Number(object.__liaDgsSliderMaximum);
      record.step = Number(object.__liaDgsSliderStep);
      record.value = getDgsSliderValue(object);
    } else if (type === 'point') {
      try { record.x = Number(object.X()); record.y = Number(object.Y()); } catch (e) {}
      Object.assign(record, dgsDerivedPointRecord(object));
      if (object.__liaDgsCoordinateExpressions) {
        record.coordinateExpressions = {
          x: String(object.__liaDgsCoordinateExpressions.x || ''),
          y: String(object.__liaDgsCoordinateExpressions.y || '')
        };
        record.coordinateParameter = Number.isFinite(Number(object.__liaDgsCoordinateParameter))
          ? Number(object.__liaDgsCoordinateParameter)
          : record.x;
      }
    } else if (type === 'text') {
      try { record.x = Number(object.X()); record.y = Number(object.Y()); } catch (e) {}
      record.content = String(object.__liaDgsTextContent || '');
      record.fontSize = clampDgsTextFontSize(object.__liaDgsTextFontSize);
    } else if (type === 'function') {
      record.expression = String(object.__liaDgsFunctionExpression || '');
    } else if (type === 'perpendicular') {
      record.baseId = ensureDgsPersistentId(object.__liaDgsPerpendicularBase, 'line');
      record.points = [dgsPointReference(object.__liaDgsPerpendicularPoint)];
    } else if (type === 'parallel') {
      record.baseId = ensureDgsPersistentId(object.__liaDgsParallelBase, 'line');
      record.points = [dgsPointReference(object.__liaDgsParallelPoint)];
    } else if (type === 'compass-arc') {
      const geometry = getDgsCompassArcGeometry(object);
      record.points = [
        dgsPointReference(object.__liaDgsCompassCenterPoint),
        dgsPointReference(object.__liaDgsCompassRadiusPoint)
      ];
      record.radius = geometry.radius;
      record.startAngle = geometry.startAngle;
      record.sweepAngle = geometry.sweepAngle;
      record.fixedRadius = object.__liaDgsCompassFixedRadius === true;
      if (record.fixedRadius) {
        record.fixedDx = Number(object.__liaDgsCompassFixedDx);
        record.fixedDy = Number(object.__liaDgsCompassFixedDy);
      }
    } else if (type === 'arc') {
      record.points = [
        dgsPointReference(object.__liaDgsArcStartPoint),
        dgsPointReference(object.__liaDgsArcEndPoint)
      ];
      record.exitAngle = Number(object.__liaDgsArcExitAngle);
      record.entryAngle = Number(object.__liaDgsArcEntryAngle);
      record.design = String(object.__liaDgsArcDesign || '-');
      record.strokeWidth = Number(object.__liaDgsArcStrokeWidth) || 3;
    } else if (type === 'segment' || type === 'ray' || type === 'vector' || type === 'line') {
      record.points = [dgsPointReference(object.point1), dgsPointReference(object.point2)];
      if (type === 'segment' && isDgsSegmentStyleTarget(object)) {
        record.design = getDgsStrokeDesign(object);
        record.strokeWidth = getDgsStrokeWidth(object);
      }
    } else if (type === 'polygon') {
    const vertices = Array.isArray(object.vertices) ? object.vertices.slice() : [];
    if (vertices.length > 1 && vertices[0] === vertices[vertices.length - 1]) vertices.pop();
    record.points = vertices.map(dgsPointReference);
      record.borders = (object.__liaDgsPolygonBorders || object.borders || [])
        .filter((border: any) => !!border)
        .map(dgsPolygonBorderRecord);
    } else if (type === 'sector') {
      record.points = [
        dgsPointReference(object.__liaDgsSectorCenter),
        dgsPointReference(object.__liaDgsSectorRadiusPoint),
        dgsPointReference(object.__liaDgsSectorAnglePoint)
      ];
    } else if (type === 'circle') {
      record.points = [dgsPointReference(object.__liaDgsCircleCenter), dgsPointReference(object.__liaDgsCircleRadiusPoint)];
    } else if (type === 'angle') {
      record.points = (object.__liaDgsAnglePoints || []).map(dgsPointReference);
    }
    if (type === 'midpoint') Object.assign(record, dgsDerivedPointRecord(object));
    if (object.__liaDgsRootConstruction) {
      record.rootPoints = (object.__liaDgsRootConstruction.points || []).map(dgsDerivedPointRecord);
    }
    if (object.__liaDgsExtremaConstruction) {
      record.extremaPoints = (object.__liaDgsExtremaConstruction.points || []).map(dgsDerivedPointRecord);
    }
    if (object.__liaDgsInflectionConstruction) {
      record.inflectionPoints = (object.__liaDgsInflectionConstruction.points || []).map(dgsDerivedPointRecord);
    }
    if (object.__liaDgsYInterceptConstruction) {
      record.yInterceptPoints = (object.__liaDgsYInterceptConstruction.points || []).map(dgsDerivedPointRecord);
    }
    records.push(record);
  });
  const intersectionConstructions = new Set<any>();
  state.rootConstructions.forEach((construction) => {
    if (construction && construction.kind === 'intersections') intersectionConstructions.add(construction);
  });
  getDgsBoardObjects(state.board).forEach((object) => {
    (Array.isArray(object?.__liaDgsIntersectionConstructions)
      ? object.__liaDgsIntersectionConstructions
      : []
    ).forEach((construction: any) => {
      if (construction && construction.kind === 'intersections') intersectionConstructions.add(construction);
    });
  });
  intersectionConstructions.forEach((construction) => {
      const source = construction.source || construction.__liaDgsSource;
      const source2 = construction.source2 || construction.__liaDgsSource2;
      if (!source || !source2 || source.board !== state.board || source2.board !== state.board) return;
      records.push({
        type: 'intersection-construction',
        sourceId: ensureDgsPersistentId(source, 'object'),
        source2Id: ensureDgsPersistentId(source2, 'object'),
        intersectionPoints: (construction.points || []).map(dgsDerivedPointRecord)
      });
    });
  const next = {
    boardId: state.boardId,
    language: state.language,
    macroSpecSignature: String(
      state.macroSpecSignature ||
      dgsConstructionStates[state.boardId]?.macroSpecSignature ||
      getExternalDgsMacroSpecSignature(state.boardId)
    ),
    axisLabels: getDgsAxisLabels(state),
    records
  };
  const previous = dgsConstructionStates[state.boardId] || {
    boardId: state.boardId,
    language: state.language,
    axisLabels: cloneDgsSnapshot(next.axisLabels),
    records: []
  };
  if (!previous.axisLabels) previous.axisLabels = cloneDgsSnapshot(next.axisLabels);
  const changed = JSON.stringify(previous) !== JSON.stringify(next);
  dgsConstructionStates[state.boardId] = next;
  dgsConstructionBoards[state.boardId] = state.board;
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
  if (record.macroKey) {
    object.__liaDgsMacroManaged = true;
    object.__liaDgsMacroKey = String(record.macroKey);
  }
  object.__liaDgsLanguage = record.language || state.language;
  if (record.name) setDgsObjectName(state, object, record.name);
  setDgsObjectFixed(object, !!record.fixed);
  const macroLayerRecord = isMacroLayerManagedDgsObject(object) ||
    record.origin === 'macro' || !!record.macroKey ||
    String(record.id || '').startsWith('macro:');
  if (macroLayerRecord && record.layerExplicit === false) {
    clearDgsObjectLayerOverride(object);
  } else {
    // Records without layerExplicit are legacy snapshots. Preserve their old
    // interpretation as explicit layers so existing authored DGS formatting is
    // not silently lost; all newly derived macro records carry false above.
    setDgsObjectLayer(object, Number.isFinite(record.layer) ? record.layer : getDgsObjectLayer(object));
  }
  object.__liaDgsShowName = record.showName !== false;
  object.__liaDgsShowObject = record.showObject !== false;
  object.__liaDgsShowLength = !!record.showLength;
  object.__liaDgsShowEquation = !!record.showEquation;
  object.__liaDgsShowArea = !!record.showArea;
  object.__liaDgsShowPerimeter = !!record.showPerimeter;
  object.__liaDgsShowAngle = !!record.showAngle;
  object.__liaDgsShowExpression = !!record.showExpression;
  object.__liaDgsShowValue = !!record.showValue;
  if (isDgsPolygon(object)) object.__liaDgsPolygonAutoName = !!record.autoName;
  if (isDgsAngle(object)) object.__liaDgsAngleAutoName = !!record.autoName;
  if (isDgsVector(object)) object.__liaDgsVectorAutoName = !!record.autoName;
  if (isDgsCompassArc(object)) {
    const sweepAngle = Number(record.sweepAngle);
    if (Number.isFinite(sweepAngle)) object.__liaDgsCompassSweepAngle = sweepAngle;
    if (Number.isFinite(Number(record.radius))) object.__liaDgsCompassRadius = Number(record.radius);
    if (Number.isFinite(Number(record.startAngle))) object.__liaDgsCompassStartAngle = Number(record.startAngle);
    object.__liaDgsCompassDraft = false;
    object.__liaDgsCompassFixedRadius = record.fixedRadius === true;
    if (object.__liaDgsCompassFixedRadius) {
      let fixedDx = Number(record.fixedDx);
      let fixedDy = Number(record.fixedDy);
      if (!Number.isFinite(fixedDx) || !Number.isFinite(fixedDy) ||
          Math.hypot(fixedDx, fixedDy) <= 1e-12) {
        const center = readDgsPointPosition(object.__liaDgsCompassCenterPoint);
        const point = readDgsPointPosition(object.__liaDgsCompassRadiusPoint);
        if (center && point) {
          fixedDx = point.x - center.x;
          fixedDy = point.y - center.y;
        }
      }
      object.__liaDgsCompassFixedDx = fixedDx;
      object.__liaDgsCompassFixedDy = fixedDy;
    } else {
      delete object.__liaDgsCompassFixedDx;
      delete object.__liaDgsCompassFixedDy;
    }
    resetDgsFixedCompassTranslationSnapshot(object);
    ensureDgsCompassArcLabel(state, object);
  }
  if (isDgsArc(object)) {
    const exitAngle = parseDgsArcAngle(record.exitAngle);
    const entryAngle = parseDgsArcAngle(record.entryAngle);
    if (exitAngle != null) object.__liaDgsArcExitAngle = exitAngle;
    if (entryAngle != null) object.__liaDgsArcEntryAngle = entryAngle;
  }
  if (isDgsLineStyleTarget(object)) {
    applyDgsLineStyle(state, object, record.lineStyle || 'solid', false);
  }
  if (isDgsStrokeStyleTarget(object)) {
    applyDgsStrokeStyle(
      state,
      object,
      record.design || '-',
      record.strokeWidth == null ? 3 : record.strokeWidth,
      false
    );
  }
  if (isDgsAngle(object) && record.measuredAngle) {
    object.__liaDgsMeasuredConstruction = true;
    object.__liaDgsTargetAngle = Number(record.targetAngle);
    object.__liaDgsGeneratedPoint = object.__liaDgsAnglePoints && object.__liaDgsAnglePoints[2];
    configureDgsMeasuredAngle(state, object);
    if (Number.isFinite(object.__liaDgsTargetAngle)) {
      applyDgsMeasuredAngle(state, object, object.__liaDgsTargetAngle, false);
    }
  }
  setDgsObjectColor(object, 'text', record.textColor || '#ff00ff');
  setDgsObjectColor(object, 'line', record.lineColor || '#ff00ff');
  setDgsObjectColor(object, 'fill', record.fillColor || '#ff00ff');
  if (Number.isFinite(Number(record.formatFontSize))) {
    setDgsFormatFontSize(state, object, Number(record.formatFontSize));
  }
  if (isDgsAngle(object)) syncDgsRightAngleStyle(object);
  setDgsObjectOpacity(object, Number.isFinite(record.opacity) ? record.opacity : 1);
  setDgsObjectVisible(object, record.showObject !== false);
  setDgsObjectNameVisible(object, record.showName !== false);
  if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
  else refreshDgsObjectLabel(object);
}

window.__syncDgsFixedCompassPoint = function(boardId: string, point: any): boolean {
  const state = getDgsStateForBoard(String(boardId || ''));
  if (!state || !point) return false;
  return translateDgsFixedCompassComponent(state, point);
};

window.__prepareDgsBoardReplacement = function(): void {
  Object.keys(states).forEach((uid) => {
    const state = states[uid];
    if (state) persistDgsSetSquarePose(state);
    const currentBoard = window.__boards && window.__boards[state.boardId];
    if (!state || !currentBoard || state.board === currentBoard || state.boardReplacementPrepared) return;
    if (!state.boardContainer?.isConnected) {
      // LiaScript removes the old slide DOM before constructing the next
      // board. At that point macro MutationObservers may already have removed
      // most old-board objects. Serializing that transient remnant would
      // overwrite the last complete snapshot, so keep the snapshot captured
      // by the actual DGS edits and mark this replacement as prepared.
      state.boardReplacementPrepared = true;
      return;
    }
    // Run before the external macro bootstraps remove their objects from the
    // old board. Otherwise the final lifecycle snapshot would silently lose
    // all macro-backed records and their DGS-side formatting changes.
    if (state.compassPreview && state.compassPreview.__liaDgsCompassDraft) {
      clearDgsCompassInteraction(state, true);
    }
    persistDgsConstruction(state, true);
    state.boardReplacementPrepared = true;
  });
};

window.__persistDgsBoardState = function(boardId: string, recordHistory = true): void {
  const state = getDgsStateForBoard(String(boardId || ''));
  const currentBoard = window.__boards && window.__boards[String(boardId || '')];
  if (!state || !currentBoard || state.board !== currentBoard || !state.boardContainer?.isConnected) return;
  if (state.compassPreview && state.compassPreview.__liaDgsCompassDraft) {
    clearDgsCompassInteraction(state, true);
  }
  persistDgsConstruction(state, recordHistory !== false);
};

window.__detachDgsAnalysisFunctionTarget = function(boardId: string, target: any): void {
  const normalizedBoardId = String(boardId || '');
  const state = getDgsStateForBoard(normalizedBoardId);
  const currentBoard = window.__boards && window.__boards[normalizedBoardId];
  if (!state || !target || !currentBoard || state.board !== currentBoard ||
      target.board !== currentBoard || !state.boardContainer?.isConnected) return;

  const constructions = new Set<any>();
  [
    target.__liaDgsRootConstruction,
    target.__liaDgsExtremaConstruction,
    target.__liaDgsInflectionConstruction,
    target.__liaDgsYInterceptConstruction
  ].forEach((construction) => { if (construction) constructions.add(construction); });
  (Array.isArray(target.__liaDgsIntersectionConstructions)
    ? target.__liaDgsIntersectionConstructions
    : []
  ).forEach((construction: any) => { if (construction) constructions.add(construction); });
  constructions.forEach((construction) => removeDgsRootConstruction(state, construction, false));

  (Array.isArray(target.__liaDgsTangents) ? target.__liaDgsTangents.slice() : [])
    .forEach((tangent: any) => removeDgsTangent(state, tangent, false));
  try { state.board.update?.(); } catch (e) {}
  persistDgsConstruction(state, true);
};

function restoreDgsPointTraceState(state: DgsState, point: any, record: any): void {
  if (!point) return;
  const existingMarkers = Array.isArray(point.__liaDgsTraceMarkers)
    ? point.__liaDgsTraceMarkers.slice()
    : [];
  point.__liaDgsTraceRecording = true;
  existingMarkers.forEach((marker: any) => {
    try { if (marker && state.board) state.board.removeObject(marker); } catch (e) {}
  });
  point.__liaDgsTraceMarkers = [];
  point.__liaDgsTraceCoordinates = [];
  point.__liaDgsTraceEnabled = !!record.traceEnabled;
  point.__liaDgsTraceColor = normalizeHexColor(record.traceColor) || '#ff00ff';
  (Array.isArray(record.tracePoints) ? record.tracePoints : []).forEach((entry: any) => {
    createDgsTraceMarker(state, point, Number(entry.x), Number(entry.y));
  });
  try {
    point.__liaDgsTraceCursor = {
      x: Number(point.X()),
      y: Number(point.Y())
    };
  } catch (e) {
    point.__liaDgsTraceCursor = null;
  }
  point.__liaDgsTraceRecording = false;
}

function applyRestoredDgsSpecificState(state: DgsState, object: any, record: any): void {
  if (!object || !record) return;
  if (record.type === 'point') {
    setDgsPointPosition(object, Number(record.x), Number(record.y));
    restoreDgsPointTraceState(state, object, record);
  } else if (record.type === 'midpoint') {
    restoreDgsPointTraceState(state, object, record);
  } else if (record.type === 'slider') {
    setDgsPointPosition(object.point1, Number(record.x1), Number(record.y1));
    setDgsPointPosition(object.point2, Number(record.x2), Number(record.y2));
    setDgsSliderSettings(
      state,
      object,
      record.minimum,
      record.maximum,
      record.step,
      record.value,
      false
    );
  } else if (record.type === 'text') {
    setDgsPointPosition(object, Number(record.x), Number(record.y));
    setDgsTextContent(state, object, String(record.content || record.name || ''));
    setDgsTextFontSize(state, object, Number(record.fontSize || record.formatFontSize));
  } else if (record.type === 'function') {
    const expression = String(record.expression || '').trim();
    if (expression && expression !== String(object.__liaDgsFunctionExpression || '').trim()) {
      applyDgsFunctionExpression(state, object, expression, false);
    }
  } else if (record.type === 'arc') {
    setDgsArcAngles(state, object, record.exitAngle, record.entryAngle, false);
  } else if (record.type === 'tangent') {
    const point = object.__liaDgsTangentPoint;
    const pointRecord = record.contactPoint || {};
    if (point) {
      setDgsPointPosition(point, Number(record.x), Number(record.y));
      applyRestoredDgsProperties(state, point, {
        id: pointRecord.id || ensureDgsPersistentId(point, 'point'),
        name: pointRecord.name || getDgsObjectName(point),
        language: record.language || state.language,
        fixed: !!pointRecord.fixed,
        layer: pointRecord.layer,
        layerExplicit: pointRecord.layerExplicit,
        showName: pointRecord.showName,
        showObject: pointRecord.showObject,
        showValue: pointRecord.showValue,
        opacity: pointRecord.opacity,
        textColor: pointRecord.textColor,
        lineColor: pointRecord.lineColor,
        fillColor: pointRecord.fillColor || pointRecord.lineColor,
        formatFontSize: pointRecord.formatFontSize
      });
      restoreDgsPointTraceState(state, point, pointRecord);
    }
  }
}

function restoreDgsPolygonBorders(
  state: DgsState,
  polygon: any,
  records: any[],
  existingById: Map<string, any>
): void {
  const borders = polygon && (polygon.__liaDgsPolygonBorders || polygon.borders || []);
  if (!Array.isArray(borders) || !Array.isArray(records)) return;

  records.forEach((record: any, index: number) => {
    const border = borders[index];
    if (!border || !record) return;
    applyRestoredDgsProperties(state, border, record);
    if (record.id) existingById.set(String(record.id), border);
  });
}

function restoreDgsPendingRecords(
  state: DgsState,
  input: any[],
  existingById: Map<string, any>
): any[] {
  let pending = input.slice();
  while (pending.length) {
    const unresolved: any[] = [];
    let restoredThisPass = 0;
    pending.forEach((record: any) => {
      const existingKey = String(record.id || record.macroKey || '');
      const existing = existingKey ? existingById.get(existingKey) : null;
      if (existing) {
        applyRestoredDgsProperties(state, existing, record);
        applyRestoredDgsSpecificState(state, existing, record);
        if (record.type === 'polygon') {
          restoreDgsPolygonBorders(state, existing, record.borders || [], existingById);
        }
        restoredThisPass += 1;
        return;
      }
      if (record && (
        record.origin === 'macro' || record.macroKey || String(record.id || '').startsWith('macro:')
      )) {
        // External macro bootstraps may still be waiting for a point/function
        // dependency. Never manufacture a generic DGS replacement here: the
        // real macro object would arrive a frame later with the same stable ID.
        unresolved.push(record);
        return;
      }
      if (record.type === 'slider') {
        const slider = createDgsSlider(
          state,
          String(record.name || ''),
          Number(record.minimum),
          Number(record.maximum),
          Number(record.step),
          Number(record.value),
          {
            x1: Number(record.x1),
            y1: Number(record.y1),
            x2: Number(record.x2),
            y2: Number(record.y2)
          }
        );
        if (!slider) { unresolved.push(record); return; }
        applyRestoredDgsProperties(state, slider, record);
        existingById.set(record.id, slider);
        restoredThisPass += 1;
        return;
      }
      if (record.type === 'text') {
        const textObject = createDgsText(
          state,
          Number(record.x),
          Number(record.y),
          String(record.content || record.name || ''),
          Number(record.fontSize)
        );
        if (!textObject) { unresolved.push(record); return; }
        applyRestoredDgsProperties(state, textObject, record);
        existingById.set(record.id, textObject);
        restoredThisPass += 1;
        return;
      }
      if (record.type === 'function') {
        const graph = createDgsFunction(state, String(record.expression || ''));
        if (!graph) { unresolved.push(record); return; }
        applyRestoredDgsProperties(state, graph, record);
        existingById.set(record.id, graph);
        restoredThisPass += 1;
        return;
      }
      if (record.type === 'tangent') {
        const source = existingById.get(String(record.sourceId || ''));
        if (!isDgsTangentTarget(source)) { unresolved.push(record); return; }
        const tangent = createDgsTangent(state, source, Number(record.x), Number(record.y));
        if (!tangent) { unresolved.push(record); return; }
        applyRestoredDgsProperties(state, tangent, record);
        const pointRecord = record.contactPoint || {};
        const point = tangent.__liaDgsTangentPoint;
        if (point) {
          applyRestoredDgsProperties(state, point, {
            id: pointRecord.id || ensureDgsPersistentId(point, 'point'),
            name: pointRecord.name || getDgsObjectName(point),
            language: record.language || state.language,
            fixed: !!pointRecord.fixed,
            layer: pointRecord.layer,
            layerExplicit: pointRecord.layerExplicit,
            showName: pointRecord.showName,
            showObject: pointRecord.showObject,
            opacity: pointRecord.opacity,
            textColor: pointRecord.textColor,
            lineColor: pointRecord.lineColor,
            fillColor: pointRecord.fillColor || pointRecord.lineColor,
            formatFontSize: pointRecord.formatFontSize,
            showValue: pointRecord.showValue
          });
          restoreDgsPointTraceState(state, point, pointRecord);
          if (pointRecord.id) existingById.set(String(pointRecord.id), point);
        }
        existingById.set(record.id, tangent);
        restoredThisPass += 1;
        return;
      }
      const points = (record.points || []).map((reference: any) =>
        findDgsPointForRestore(state, reference, existingById)
      );
      if (!points.length || points.some((point: any) => !point)) {
        unresolved.push(record);
        return;
      }
      let object: any = null;
      if (record.type === 'perpendicular') {
        const baseLine = existingById.get(String(record.baseId || ''));
        if (!isDgsLinearObject(baseLine)) { unresolved.push(record); return; }
        object = createDgsPerpendicular(state, baseLine, points[0]);
      } else if (record.type === 'parallel') {
        const baseLine = existingById.get(String(record.baseId || ''));
        if (!isDgsLinearObject(baseLine)) { unresolved.push(record); return; }
        object = createDgsParallel(state, baseLine, points[0]);
      } else if (record.type === 'midpoint') {
        object = createDgsMidpoint(state, points[0], points[1]);
      } else if (record.type === 'angle-bisector') {
        object = createDgsAngleBisector(state, points[0], points[1], points[2]);
      } else if (record.type === 'segment') object = createDgsSegment(state, points[0], points[1]);
      else if (record.type === 'ray') object = createDgsRay(state, points[0], points[1]);
      else if (record.type === 'vector') object = createDgsVector(state, points[0], points[1]);
      else if (record.type === 'compass-arc') {
        object = createDgsCompassArc(state, points[0], points[1], record.sweepAngle, false);
      }
      else if (record.type === 'arc') {
        object = createDgsArc(state, points[0], points[1], record.exitAngle, record.entryAngle);
      }
      else if (record.type === 'line') object = createDgsLine(state, points[0], points[1]);
      else if (record.type === 'polygon') object = createDgsPolygon(state, points);
      else if (record.type === 'sector') object = createDgsSector(state, points[0], points[1], points[2]);
      else if (record.type === 'circle') object = createDgsCircle(state, points[0], points[1]);
      else if (record.type === 'angle') object = createDgsAngle(state, points);
      if (!object) { unresolved.push(record); return; }
      applyRestoredDgsProperties(state, object, record);
      applyRestoredDgsSpecificState(state, object, record);
      existingById.set(record.id, object);
      if (record.type === 'polygon') {
        restoreDgsPolygonBorders(state, object, record.borders || [], existingById);
      }
      restoredThisPass += 1;
    });
    pending = unresolved;
    if (!restoredThisPass) break;
  }
  return pending;
}

function restoreDgsConstruction(state: DgsState): boolean {
  const saved = dgsConstructionStates[state.boardId];
  if (!saved || saved.boardId !== state.boardId || !Array.isArray(saved.records)) return false;
  dgsConstructionBoards[state.boardId] = state.board;
  assignDgsMacroPersistentIds(state.boardId, state.board);
  const registered = window.__points && window.__points[state.boardId];
  if (registered && typeof registered === 'object') {
    Object.keys(registered).forEach((name) => {
      try { if (!registered[name] || registered[name].board !== state.board) delete registered[name]; } catch (e) {}
    });
  }
  const existingById = new Map<string, any>();
  getDgsBoardObjects(state.board).forEach((object) => {
    if (object && object.__liaDgsPersistentId) existingById.set(String(object.__liaDgsPersistentId), object);
    if (object && object.__liaDgsMacroKey) existingById.set(String(object.__liaDgsMacroKey), object);
  });

  state.restoring = true;
  try {
    let needsDeferredRestore = false;
    if (saved.axisLabels && saved.axisLabels.x && saved.axisLabels.y) {
      applyDgsAxisLabels(state, saved.axisLabels);
    }
    saved.records.filter((record: any) => record.type === 'point').forEach((record: any) => {
      const macroRecord = !!record && (
        record.origin === 'macro' || record.macroKey || String(record.id || '').startsWith('macro:')
      );
      let point = existingById.get(String(record.id || record.macroKey || ''));
      if (!point && !macroRecord) point = findDgsPointForRestore(state, record, existingById);
      if (!point && macroRecord) {
        needsDeferredRestore = true;
        return;
      }
      if (!point) point = createDgsPoint(state, Number(record.x), Number(record.y));
      if (!point) return;
      applyRestoredDgsProperties(state, point, record);
      applyRestoredDgsSpecificState(state, point, record);
      if (record.coordinateExpressions) {
        point.__liaDgsCoordinateExpressions = {
          x: String(record.coordinateExpressions.x || ''),
          y: String(record.coordinateExpressions.y || '')
        };
        point.__liaDgsCoordinateParameter = Number.isFinite(Number(record.coordinateParameter))
          ? Number(record.coordinateParameter)
          : Number(record.x);
        point.__liaDgsCoordinateCompiled = null;
      }
      existingById.set(record.id, point);
      if (record.macroKey) existingById.set(String(record.macroKey), point);
    });

    let pending = restoreDgsPendingRecords(
      state,
      saved.records.filter((record: any) =>
        record.type !== 'point' && record.type !== 'intersection-construction' &&
        record.type !== 'external-function-analysis'
      ),
      existingById
    );
    const applyAnalysisPointRecord = (point: any, reference: any) => {
      if (!point || !reference) return;
      const restoredRecord = {
        ...reference,
        id: reference.id || ensureDgsPersistentId(point, 'analysis-point'),
        name: reference.name || getDgsObjectName(point),
        language: reference.language || state.language,
        fixed: !!reference.fixed,
        layer: reference.layer,
        showName: reference.showName,
        showObject: reference.showObject,
        showValue: reference.showValue,
        opacity: reference.opacity,
        textColor: reference.textColor || getNeutralColor(),
        lineColor: reference.lineColor || '#ff00ff',
        fillColor: reference.fillColor || reference.lineColor || '#ff00ff',
        formatFontSize: reference.formatFontSize
      };
      applyRestoredDgsProperties(state, point, restoredRecord);
      point.__liaDgsShowValue = !!reference.showValue;
      setDgsAnalysisPointEntryOption(point, 'explicitValueVisibility', !!reference.showValue);
      restoreDgsPointTraceState(state, point, reference);
      if (restoredRecord.id) existingById.set(String(restoredRecord.id), point);
      if (reference.macroKey) existingById.set(String(reference.macroKey), point);
      refreshDgsObjectLabel(point);
    };
    needsDeferredRestore = needsDeferredRestore || pending.length > 0;
    const restoreAnalysisPoints = (
      record: any,
      kind: 'roots' | 'extrema' | 'inflections' | 'ordinate-intercept',
      references: any[]
    ) => {
      const source = existingById.get(String(record.id || ''));
      if (!source) {
        needsDeferredRestore = true;
        return;
      }
      const referencedPoints = references.map((reference: any) =>
        existingById.get(String(reference.id || reference.macroKey || '')) || null
      );
      const expectsMacroPoints = references.some((reference: any) =>
        !!reference.macroKey || String(reference.id || '').startsWith('macro:')
      );
      if (expectsMacroPoints && referencedPoints.some((point: any) => !point)) {
        needsDeferredRestore = true;
        return;
      }
      const property = kind === 'extrema'
        ? '__liaDgsExtremaConstruction'
        : (kind === 'inflections'
          ? '__liaDgsInflectionConstruction'
          : (kind === 'ordinate-intercept'
            ? '__liaDgsYInterceptConstruction'
            : '__liaDgsRootConstruction'));
      const linkedConstruction = referencedPoints.find(Boolean)?.__liaDgsAnalysisConstruction;
      const construction = linkedConstruction || source[property] ||
        createDgsAnalysisConstruction(state, source, kind);
      if (!construction) return;
      references.forEach((reference: any, index: number) => {
        const point = referencedPoints[index] || construction.points?.[index];
        if (!point) return;
        applyAnalysisPointRecord(point, reference);
      });
    };
    saved.records.forEach((record: any) => {
      const sourceRecords = [record].concat(
        record.type === 'polygon' && Array.isArray(record.borders) ? record.borders : []
      );
      sourceRecords.forEach((sourceRecord: any) => {
        if (sourceRecord.showRoots) {
          restoreAnalysisPoints(sourceRecord, 'roots', sourceRecord.rootPoints || []);
        }
        if (sourceRecord.showExtrema) {
          restoreAnalysisPoints(sourceRecord, 'extrema', sourceRecord.extremaPoints || []);
        }
        if (sourceRecord.showInflections) {
          restoreAnalysisPoints(sourceRecord, 'inflections', sourceRecord.inflectionPoints || []);
        }
        if (sourceRecord.showYIntercept) {
          restoreAnalysisPoints(
            sourceRecord,
            'ordinate-intercept',
            sourceRecord.yInterceptPoints || []
          );
        }
      });
    });
    if (pending.length) pending = restoreDgsPendingRecords(state, pending, existingById);
    if (pending.length) needsDeferredRestore = true;
    saved.records
      .filter((record: any) => record.type === 'intersection-construction')
      .forEach((record: any) => {
        const first = existingById.get(String(record.sourceId || ''));
        const second = existingById.get(String(record.source2Id || ''));
        const references = Array.isArray(record.intersectionPoints) ? record.intersectionPoints : [];
        const referencedPoints = references.map((reference: any) =>
          existingById.get(String(reference.id || reference.macroKey || '')) || null
        );
        const expectsMacroPoints = references.some((reference: any) =>
          !!reference.macroKey || String(reference.id || '').startsWith('macro:')
        );
        if (!first || !second || (expectsMacroPoints && referencedPoints.some((point: any) => !point))) {
          needsDeferredRestore = true;
          return;
        }
        const linkedConstruction = referencedPoints.find(Boolean)?.__liaDgsAnalysisConstruction;
        const construction = linkedConstruction || createDgsIntersectionConstruction(state, first, second);
        if (!construction) return;
        references.forEach((reference: any, index: number) => {
          const point = referencedPoints[index] || construction.points?.[index];
          if (!point) return;
          applyAnalysisPointRecord(point, reference);
        });
      });
    saved.records
      .filter((record: any) => record.type === 'point' && record.coordinateExpressions)
      .forEach((record: any) => {
        const point = existingById.get(String(record.id || ''));
        if (!point || !compileStoredDgsCoordinateExpressions(state, point)) return;
        syncDgsCoordinatePoint(state, point);
      });
    try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    return needsDeferredRestore;
  } finally {
    state.restoring = false;
  }
}

function cancelScheduledDgsConstructionRestore(state: DgsState): void {
  if (state.restoreTimer == null) return;
  window.clearTimeout(state.restoreTimer);
  state.restoreTimer = undefined;
}

function scheduleDgsConstructionRestore(state: DgsState): void {
  cancelScheduledDgsConstructionRestore(state);
  const delays = [160, 360, 700];
  const attempt = (index: number) => {
    state.restoreTimer = window.setTimeout(() => {
      state.restoreTimer = undefined;
      if (states[state.uid] !== state ||
          state.board !== (window.__boards && window.__boards[state.boardId]) ||
          !state.boardContainer?.isConnected) return;
      assignDgsMacroPersistentIds(state.boardId, state.board);
      const stillPending = restoreDgsConstruction(state);
      if (stillPending && index + 1 < delays.length) attempt(index + 1);
    }, delays[index]);
  };
  attempt(0);
}

function clearDgsConstructionFromBoard(state: DgsState): void {
  clearDgsCompassInteraction(state, true);
  clearDgsCirclePreview(state);
  setAngleDialogOpen(state, false);
  setArcDialogOpen(state, false);
  setTextDialogOpen(state, false);
  setSelectedSegmentPoint(state, null);
  state.pendingArcPoints = [];
  setSelectedRelationInputs(state, null, null);
  setSelectedMidpointPoint(state, null);
  setSelectedBisectorPoints(state, []);
  setSelectedIntersectionObject(state, null);
  setSelectedPolygonPoints(state, []);
  setSelectedAnglePoints(state, []);
  setSelectedSectorPoints(state, []);
  if (state.sideMenuOpen) setSideMenuOpen(state, false);
  state.rootConstructions.slice().forEach((construction) => removeDgsRootConstruction(state, construction, false));

  const objects = getDgsBoardObjects(state.board);
  objects.filter(isDgsPoint).forEach((point) => {
    point.__liaDgsTraceRecording = true;
    point.__liaDgsTraceMarkers = [];
    point.__liaDgsTraceCursor = null;
  });
  objects.filter((object) => object && object.__liaDgsTraceMarker).forEach((marker) => {
    try { state.board.removeObject(marker); } catch (e) {}
  });
  objects.filter((object) => object && object.__liaDgsTangent).forEach((tangent) => {
    removeDgsTangent(state, tangent, false);
  });
  objects.forEach((object) => {
    if (isDgsStrokeStyleTarget(object)) removeDgsStrokeCaps(object);
    if (object && object.__liaDgsPolygonBorder && object.__liaDgsPolygonBorderLabel) {
      try { state.board.removeObject(object.__liaDgsPolygonBorderLabel); } catch (e) {}
    }
    if (object && object.__liaDgsPolygon && object.__liaDgsMeasurementLabel) {
      try { state.board.removeObject(object.__liaDgsMeasurementLabel); } catch (e) {}
    }
    if (object && object.__liaDgsAngle && object.__liaDgsAngleLabel) {
      try { state.board.removeObject(object.__liaDgsAngleLabel); } catch (e) {}
    }
    if (object && object.__liaDgsCircle && object.__liaDgsCircleLabel) {
      try { state.board.removeObject(object.__liaDgsCircleLabel); } catch (e) {}
    }
    if (object && object.__liaDgsRay && object.__liaDgsRayLabel) {
      try { state.board.removeObject(object.__liaDgsRayLabel); } catch (e) {}
    }
    if (object && object.__liaDgsArc && object.__liaDgsArcLabel) {
      try { state.board.removeObject(object.__liaDgsArcLabel); } catch (e) {}
    }
    if (object && object.__liaDgsCompassArc && object.__liaDgsCompassArcLabel) {
      try { state.board.removeObject(object.__liaDgsCompassArcLabel); } catch (e) {}
    }
    if (object && object.__liaDgsFunction && object.__liaDgsFunctionLabel) {
      try { state.board.removeObject(object.__liaDgsFunctionLabel); } catch (e) {}
    }
    if (isDgsSlider(object)) object.__liaDgsSliderDeleted = true;
  });
  objects.filter((object) => object && object.__liaDgsSliderOwner).forEach((part) => {
    try { state.board.removeObject(part); } catch (e) {}
  });
  objects.filter((object) => object && !isDgsPoint(object) && (
    object.__liaDgsSegment || object.__liaDgsRay || object.__liaDgsVector || object.__liaDgsLine || object.__liaDgsArc || object.__liaDgsCompassArc || object.__liaDgsPolygon ||
    object.__liaDgsCircle || object.__liaDgsSector || object.__liaDgsAngle || object.__liaDgsFunction || object.__liaDgsText || object.__liaDgsSlider || object.__liaDgsTangentHelper ||
    object.__liaDgsAngleBisectorHelper
  )).forEach((object) => {
    try { state.board.removeObject(object); } catch (e) {}
  });
  objects.filter(isDgsPoint).forEach((point) => {
    const name = String(point.__liaDgsPointName || '');
    try {
      const pointRegistry = window.__points && window.__points[state.boardId];
      const aliases = pointRegistry
        ? Object.keys(pointRegistry).filter((key) => pointRegistry[key] === point)
        : [name];
      aliases.forEach((key) => {
        if (pointRegistry && pointRegistry[key] === point) delete pointRegistry[key];
        if (window.__pointStates && window.__pointStates[state.boardId]) {
          delete window.__pointStates[state.boardId][key];
        }
      });
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
    if (restoreDgsConstruction(state)) scheduleDgsConstructionRestore(state);
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
  const mayDisplayValues = dgsMayDisplayObjectValues(polygon);
  const name = getDgsObjectName(polygon);
  if (polygon.__liaDgsShowName !== false && name) lines.push('\\mathrm{' + name + '}');
  if (mayDisplayValues && polygon.__liaDgsShowArea) {
    const area = getDgsPolygonArea(coordinates);
    lines.push('A ' + dgsMeasurementRelation(area) + ' ' + formatDgsMeasurement(area, language) +
      '\\,\\mathrm{' + (language === 'de' ? 'FE' : 'AU') + '}');
  }
  if (mayDisplayValues && polygon.__liaDgsShowPerimeter) {
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
  const mayDisplayValues = dgsMayDisplayObjectValues(polygon);
  const requested = polygon.__liaDgsShowName !== false ||
    !!(mayDisplayValues && (polygon.__liaDgsShowArea || polygon.__liaDgsShowPerimeter));
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
      const layer = getDgsObjectRenderedLayer(candidate);
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
        (!segment.__liaDgsSegment && !segment.__liaDgsRay && !segment.__liaDgsVector && !segment.__liaDgsLine && !segment.__liaDgsArc && !segment.__liaDgsCompassArc &&
         !segment.__liaDgsPolygon && !segment.__liaDgsCircle && !segment.__liaDgsSector &&
         !segment.__liaDgsAngle && !segment.__liaDgsFunction && !segment.__liaDgsText && !segment.__liaDgsSlider)) return;
    if (segment.__liaDgsCompassDraft) return;
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
    const layer = getDgsObjectRenderedLayer(segment);
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
        const preferPolygonBorder = layer === nearestLayer &&
          isDgsLinearObject(segment) && isDgsPolygon(nearest);
        if (layer > nearestLayer || preferPolygonBorder) {
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
    const ratio = segment.__liaDgsLine
      ? rawRatio
      : (segment.__liaDgsRay ? Math.max(0, rawRatio) : Math.max(0, Math.min(1, rawRatio)));
    const px = x1 + ratio * dx;
    const py = y1 + ratio * dy;
    const distance = Math.hypot(localX - px, localY - py);
    const preferPolygonBorder = layer === nearestLayer &&
      isDgsLinearObject(segment) && isDgsPolygon(nearest);
    if (distance <= 10 && (
      layer > nearestLayer ||
      preferPolygonBorder ||
      (layer === nearestLayer && distance < nearestDistance)
    )) {
      nearest = segment;
      nearestDistance = distance;
      nearestLayer = layer;
    }
  });
  return nearest;
}

function findDgsAxisContextObject(state: DgsState, evt: MouseEvent): any | null {
  const rect = state.boardContainer.getBoundingClientRect();
  const localX = evt.clientX - rect.left;
  const localY = evt.clientY - rect.top;
  const hits: Array<{ key: 'x' | 'y'; axis: any }> = [];
  (['x', 'y'] as const).forEach((key) => {
    const axis = key === 'x' ? state.xAxis : state.yAxis;
    if (!axis || typeof axis.hasPoint !== 'function') return;
    try {
      if (typeof axis.evalVisProp === 'function' && axis.evalVisProp('visible') === false) return;
      if (axis.hasPoint(localX, localY)) hits.push({ key, axis });
    } catch (e) {}
  });
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0].axis;
  const width = Math.max(1, state.boardContainer.clientWidth || rect.width || 1);
  const height = Math.max(1, state.boardContainer.clientHeight || rect.height || 1);
  const originX = Math.max(24, Math.min(width - 24, Number(state.board?.origin?.scrCoords?.[1]) || 0));
  const originY = Math.max(24, Math.min(height - 24, Number(state.board?.origin?.scrCoords?.[2]) || 0));
  return Math.abs(localY - originY) <= Math.abs(localX - originX) ? state.xAxis : state.yAxis;
}

function isDgsPoint(object: any): boolean {
  return !!object && !!object.__liaDgsPointName;
}

function isDgsFunction(object: any): boolean {
  return !!object && !!object.__liaDgsFunction;
}

function isDgsText(object: any): boolean {
  return !!object && !!object.__liaDgsText;
}

function isDgsLine(object: any): boolean {
  return !!object && !!object.__liaDgsLine;
}

function isDgsPerpendicular(object: any): boolean {
  return !!object && !!object.__liaDgsPerpendicular;
}

function isDgsParallel(object: any): boolean {
  return !!object && !!object.__liaDgsParallel;
}

function isDgsRay(object: any): boolean {
  return !!object && !!object.__liaDgsRay;
}

function isDgsVector(object: any): boolean {
  return !!object && !!object.__liaDgsVector;
}

function isDgsArc(object: any): boolean {
  return !!object && !!object.__liaDgsArc;
}

function isDgsCompassArc(object: any): boolean {
  return !!object && !!object.__liaDgsCompassArc;
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

function isDgsSector(object: any): boolean {
  return !!object && !!object.__liaDgsSector;
}

function getDgsObjectName(object: any): string {
  if (isDgsText(object)) return String(object.__liaDgsTextContent || '');
  if (isDgsSlider(object)) return String(object.__liaDgsSliderName || object.name || '');
  if (isDgsFunction(object)) return String(object.__liaDgsFunctionName || object.name || '');
  if (isDgsPoint(object)) return String(object.__liaDgsPointName || '');
  if (isDgsRay(object)) return String(object.__liaDgsRayName || '');
  if (isDgsVector(object)) return String(object.__liaDgsVectorName || '');
  if (isDgsCompassArc(object)) return String(object.__liaDgsCompassArcName || '');
  if (isDgsArc(object)) return String(object.__liaDgsArcName || '');
  if (isDgsLine(object)) return String(object.__liaDgsLineName || '');
  if (isDgsPolygon(object)) return String(object.__liaDgsPolygonName || '');
  if (isDgsCircle(object)) return String(object.__liaDgsCircleName || '');
  if (isDgsSector(object)) return String(object.__liaDgsSectorName || '');
  if (isDgsAngle(object)) return String(object.__liaDgsAngleName || '');
  return String(object && object.__liaDgsSegmentName || '');
}

function isDgsObjectListEntry(object: any): boolean {
  return (isDgsPoint(object) && !object.__liaDgsHelperPoint) ||
    isDgsFunction(object) || isDgsText(object) || isDgsSlider(object) ||
    isDgsLinearObject(object) || (isDgsCompassArc(object) && !object.__liaDgsCompassDraft) ||
    isDgsArc(object) || isDgsPolygon(object) || isDgsCircle(object) ||
    isDgsSector(object) || isDgsAngle(object);
}

function getDgsObjectTypeLabel(state: DgsState, object: any): string {
  const text = dgsText(state.language);
  if (object && object.__liaDgsRootPoint) return text.root;
  if (object && object.__liaDgsExtremumPoint) return text.extremum;
  if (object && object.__liaDgsInflectionPoint) return text.inflection;
  if (object && object.__liaDgsYInterceptPoint) return text.yIntercept;
  if (object && object.__liaDgsIntersectionPoint) return text.intersection;
  if (object && object.__liaDgsMidpoint) return text.midpoint;
  if (isDgsPoint(object)) return text.point;
  if (isDgsFunction(object)) return text.function;
  if (isDgsSlider(object)) return text.slider;
  if (isDgsText(object)) return text.text;
  if (isDgsRay(object)) return text.ray;
  if (isDgsVector(object)) return text.vector;
  if (isDgsCompassArc(object)) return text.compassArc;
  if (isDgsArc(object)) return text.arc;
  if (object && object.__liaDgsTangent) return text.tangent;
  if (object && object.__liaDgsAngleBisector) return text.angleBisector;
  if (isDgsLine(object)) return text.line;
  if (isDgsPolygon(object)) return text.polygon;
  if (isDgsCircle(object)) return text.circle;
  if (isDgsSector(object)) return text.sector;
  if (isDgsAngle(object)) return text.angle;
  return text.segment;
}

function getDgsObjectListEntries(state: DgsState): any[] {
  return getDgsBoardObjects(state.board).filter(isDgsObjectListEntry);
}

function openDgsObjectProperties(state: DgsState, object: any, evt: Event): boolean {
  const mode = getDgsObjectPropertiesMode(state);
  const axisKey = getDgsAxisKey(state, object);
  evt.preventDefault();
  evt.stopImmediatePropagation();

  if (mode === 'locked' || (mode === 'colors-trace' && !!axisKey)) {
    if (state.sideMenuOpen) setSideMenuOpen(state, false);
    return false;
  }

  setActiveTool(state, '', false);
  updateSideMenuControls(state, object);
  setSideMenuOpen(state, true);
  refreshDgsObjectList(state, true);
  return true;
}

function refreshDgsObjectList(state: DgsState, force = false): void {
  if (!state.objectListOpen && !force) return;
  const objects = getDgsObjectListEntries(state);
  const selectedId = state.contextObject && String(state.contextObject.id || '');
  const signature = objects.map((object, index) => [
    String(object.id || index),
    getDgsObjectName(object),
    getDgsObjectTypeLabel(state, object),
    object.__liaDgsShowObject === false ? '0' : '1',
    getDgsObjectLayer(object),
    getDgsObjectColor(object, isDgsText(object) ? 'text' : 'line')
  ].join(':')).join('|') + '#selected=' + selectedId +
    '#properties=' + getDgsObjectPropertiesMode(state);
  if (!force && signature === state.objectListSignature) return;
  state.objectListSignature = signature;
  state.objectListContent.replaceChildren();

  if (!objects.length) {
    const empty = document.createElement('div');
    empty.className = 'lia-dgs-object-list-empty';
    empty.textContent = dgsText(state.language).noObjects;
    state.objectListContent.appendChild(empty);
    return;
  }

  objects.forEach((object, index) => {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'lia-dgs-object-list-entry';
    entry.classList.toggle('is-hidden', object.__liaDgsShowObject === false);
    entry.classList.toggle('is-selected', state.contextObject === object && state.sideMenuOpen);
    const typeLabel = getDgsObjectTypeLabel(state, object);
    const name = getDgsObjectName(object).trim() || typeLabel + ' ' + String(index + 1);
    const propertiesMode = getDgsObjectPropertiesMode(state);
    const propertiesLocked = propertiesMode === 'locked';
    entry.setAttribute(
      'aria-label',
      name + ', ' + typeLabel + (propertiesLocked ? ', ' + dgsText(state.language).objectPropertiesLocked : '')
    );
    entry.setAttribute('aria-disabled', propertiesLocked ? 'true' : 'false');
    entry.title = propertiesLocked
      ? dgsText(state.language).objectPropertiesLocked
      : (propertiesMode === 'colors-trace'
        ? dgsText(state.language).colorTraceProperties
        : (state.language === 'de'
          ? 'Rechtsklick: Eigenschaften von ' + name
          : 'Right-click: properties of ' + name));

    const swatch = document.createElement('span');
    swatch.className = 'lia-dgs-object-list-swatch';
    swatch.style.setProperty(
      '--lia-dgs-object-color',
      getDgsObjectColor(object, isDgsText(object) ? 'text' : 'line')
    );
    swatch.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'lia-dgs-object-list-copy';
    const nameElement = document.createElement('span');
    nameElement.className = 'lia-dgs-object-list-name';
    nameElement.textContent = name;
    const typeElement = document.createElement('span');
    typeElement.className = 'lia-dgs-object-list-type';
    typeElement.textContent = typeLabel;
    copy.appendChild(nameElement);
    copy.appendChild(typeElement);
    entry.appendChild(swatch);
    entry.appendChild(copy);

    const openProperties = (evt: Event) => {
      openDgsObjectProperties(state, object, evt);
    };
    entry.addEventListener('click', openProperties);
    entry.addEventListener('contextmenu', openProperties);
    entry.addEventListener('keydown', (evt) => {
      if (evt.key === 'ContextMenu' || (evt.shiftKey && evt.key === 'F10')) openProperties(evt);
    });
    state.objectListContent.appendChild(entry);
  });
}

function randomDgsExportId(): string {
  const first = 'abcdefghijklmnopqrstuvwxyz';
  const chars = first + '0123456789';
  const values = new Uint32Array(8);
  try {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(values);
    } else {
      for (let i = 0; i < values.length; i += 1) values[i] = Math.floor(Math.random() * 0xffffffff);
    }
  } catch (e) {
    for (let i = 0; i < values.length; i += 1) values[i] = Math.floor(Math.random() * 0xffffffff);
  }
  let id = first[values[0] % first.length];
  for (let i = 1; i < values.length; i += 1) id += chars[values[i] % chars.length];
  return id;
}

function formatDgsExportNumber(value: unknown, fallback = 0): string {
  const parsed = Number(value);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  const rounded = Math.round(number * 1e9) / 1e9;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function replaceDgsExportBackticks(value: unknown): string {
  return String(value == null ? '' : value).split(String.fromCharCode(96)).join(String.fromCharCode(39));
}

function cleanDgsExportToken(value: unknown): string {
  const text = replaceDgsExportBackticks(value)
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return splitTopLevel(text, ';').join(',');
}

function quoteDgsExportField(value: unknown): string {
  const text = replaceDgsExportBackticks(value).replace(/[\r\n]+/g, ' ');
  if (!text) return '';
  const needsQuote = /[;]/.test(text) ||
    text.includes('&') ||
    text.includes(String.fromCharCode(34)) ||
    text.includes(String.fromCharCode(39)) ||
    /^\s|\s$/.test(text);
  if (!needsQuote) return text;
  const encodeAttribute = (input: string): string => input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  // Prefer single-quoted macro fields because the README macro holders use a
  // double-quoted data attribute. If both quote styles occur, JSON escaping
  // gives splitTopLevel an unambiguous, fully reversible representation.
  if (!text.includes(String.fromCharCode(39))) {
    return String.fromCharCode(39) + encodeAttribute(text) + String.fromCharCode(39);
  }
  const quoted = text.includes(String.fromCharCode(34))
    ? '__lia_dgs_json_v1__:' + JSON.stringify(text)
    : String.fromCharCode(34) + text + String.fromCharCode(34);
  return encodeAttribute(quoted);
}

function macroDgsExportLine(name: string, spec: string): string {
  const tick = String.fromCharCode(96);
  return '@' + name + '(' + tick + replaceDgsExportBackticks(spec) + tick + ')';
}

function addDgsExportLineStyleOption(options: string[], object: any): void {
  if (!isDgsLineStyleTarget(object)) return;
  const lineStyle = getDgsLineStyle(object);
  if (lineStyle !== 'solid') options.push('linestyle=' + lineStyle);
}

function isDgsExportVisibleElement(object: any): boolean {
  if (!object) return false;
  try { if (typeof object.evalVisProp === 'function') return object.evalVisProp('visible') !== false; } catch (e) {}
  try { if (object.visPropCalc && object.visPropCalc.visible === false) return false; } catch (e) {}
  try { if (object.visProp && object.visProp.visible === false) return false; } catch (e) {}
  return true;
}

function getDgsExportPointCoordinates(point: any): { x: number; y: number } | null {
  try {
    const x = Number(point.X());
    const y = Number(point.Y());
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch (e) {
    return null;
  }
}

function getDgsExportBoardSpec(state: DgsState, exportId: string): string {
  let bbox = [-5, 5, 5, -5];
  try {
    const canonical = state.board && state.board.__coordExportBBox;
    const current = Array.isArray(canonical) ? canonical :
      (state.board && state.board.getBoundingBox && state.board.getBoundingBox());
    if (Array.isArray(current) && current.length === 4 && current.every((value: any) => Number.isFinite(Number(value))) &&
        Number(current[2]) > Number(current[0]) && Number(current[1]) > Number(current[3])) {
      bbox = current.map((value: any) => Number(value));
    }
  } catch (e) {}
  const stored = window.__coordBoardStates && window.__coordBoardStates[state.boardId];
  const containerRect = (() => {
    try { return state.boardContainer.getBoundingClientRect(); } catch (e) { return null; }
  })();
  const renderedWidth = Math.max(1, Math.round(
    Number(stored && stored.width) ||
    Number(state.boardContainer && state.boardContainer.clientWidth) ||
    Number(containerRect && containerRect.width) ||
    800
  ));
  const boardSizeMode = String(
    stored && stored.sizeMode ||
    state.board && state.board.__coordSizeMode ||
    ''
  ).trim().toLowerCase();
  const configuredMaxStartWidth = Number(
    state.board && state.board.__coordMaxStartWidth ||
    stored && stored.maxStartWidth
  );
  const cappedWidth = Number.isFinite(configuredMaxStartWidth) && configuredMaxStartWidth > 0
    ? Math.max(1, Math.round(configuredMaxStartWidth))
    : renderedWidth;
  const exportWidth = boardSizeMode === 'auto'
    ? ''
    : 'width=' + String(boardSizeMode === 'capped' ? cappedWidth : renderedWidth);
  const axes = (isDgsExportVisibleElement(state.xAxis) || isDgsExportVisibleElement(state.yAxis)) ? 1 : 0;
  const grid = state.board && (state.board.__liaMajorGrid || state.board.__liaMinorGrid) ? 1 : 0;
  let border = 1;
  try { if (String(state.boardContainer.style.border || '').trim().toLowerCase() === 'none') border = 0; } catch (e) {}
  return [
    'xmin=' + formatDgsExportNumber(bbox[0]),
    'xmax=' + formatDgsExportNumber(bbox[2]),
    'ymin=' + formatDgsExportNumber(bbox[3]),
    'ymax=' + formatDgsExportNumber(bbox[1]),
    exportWidth,
    'id=' + exportId,
    String(axes),
    String(grid),
    String(border)
  ].filter(Boolean).join(';');
}

function getDgsIntersectionConstructionsForExport(state: DgsState): any[] {
  const constructions: any[] = [];
  const seen = new Set<any>();
  const add = (construction: any) => {
    if (!construction || construction.kind !== 'intersections' || seen.has(construction)) return;
    if (construction.board && construction.board !== state.board) return;
    seen.add(construction);
    constructions.push(construction);
  };
  state.rootConstructions.forEach(add);
  Object.keys(window.__objectAnalysisPointEntries || {}).forEach((key) => {
    const entry = window.__objectAnalysisPointEntries[key];
    if (!entry || entry.board !== state.board || entry.boardId !== state.boardId) return;
    add(entry);
  });
  return constructions;
}

function buildDgsExportMacroBlock(
  state: DgsState,
  selectedToolIds: Iterable<number> = state.exportSelectedToolIds,
  selectedRestrictionIds: Iterable<number> = state.exportSelectedRestrictionIds
): string {
  const exportId = randomDgsExportId();
  const useGerman = state.language === 'de';
  const macros = {
    coordinate: useGerman ? 'Koordinatensystem' : 'CoordinateSystem',
    axisLabel: useGerman ? 'AchsenBeschriftung' : 'AxisLabel',
    point: useGerman ? 'Punkt' : 'Point',
    coordText: useGerman ? 'KoordText' : 'CoordText',
    segment: useGerman ? 'Strecke' : 'distance',
    line: useGerman ? 'Gerade' : 'Line',
    ray: useGerman ? 'Strahl' : 'Ray',
    vector: useGerman ? 'Vektor' : 'Vector',
    arc: useGerman ? 'Bogen' : 'Arc',
    perpendicular: useGerman ? 'Orthogonale' : 'Perpendicular',
    parallel: useGerman ? 'Parallele' : 'Parallel',
    midpoint: useGerman ? 'Mittelpunkt' : 'Midpoint',
    area: useGerman ? 'Flaeche' : 'Area',
    angle: useGerman ? 'Winkel' : 'angle',
    circle: useGerman ? 'Kreis' : 'Circle',
    tangent: useGerman ? 'Tangente' : 'Tangent',
    sector: useGerman ? 'Kreissegment' : 'CircularSector',
    plotFunction: useGerman ? 'PlotFunktion' : 'PlotFunction',
    zeros: useGerman ? 'Nullstellen' : 'Zeros',
    extrema: useGerman ? 'Extrempunkte' : 'Extrema',
    inflections: useGerman ? 'Wendepunkte' : 'InflectionPoints',
    ordinateIntercept: useGerman ? 'Ordinatenabschnitt' : 'OrdinateIntercept',
    intersection: useGerman ? 'Schnittpunkt' : 'Intersection',
    slider: useGerman ? 'Regler' : 'Slider',
    dgs: 'DGS'
  };
  const lines: string[] = [macroDgsExportLine(macros.coordinate, getDgsExportBoardSpec(state, exportId))];
  const pointLines: string[] = [];
  const midpointLines: string[] = [];
  const sliderLines: string[] = [];
  const objectLines: string[] = [];
  const unsupported: string[] = [];
  const exportedPoints = new Map<any, string>();
  const exportedObjectNames = new Map<any, string>();
  const usedPointNames = new Set<string>();
  const usedObjectNames = new Set<string>();
  const objects = getDgsBoardObjects(state.board);

  const exportFunctionExpression = (expression: unknown): string => {
    return String(expression == null ? '' : expression);
  };

  const allocatePointName = (point: any, preferred?: string): string => {
    const base = cleanDgsExportToken(preferred || point && (point.__liaDgsPointName || point.name) || 'P') || 'P';
    if (!usedPointNames.has(base)) {
      usedPointNames.add(base);
      return base;
    }
    for (let index = 2; ; index += 1) {
      const candidate = base + '_' + index;
      if (!usedPointNames.has(candidate)) {
        usedPointNames.add(candidate);
        return candidate;
      }
    }
  };

  const allocateObjectName = (object: any, preferred: unknown, fallback: string): string => {
    const existing = exportedObjectNames.get(object);
    if (existing) return existing;
    const base = cleanDgsExportToken(preferred) || fallback;
    let candidate = base;
    for (let index = 2; usedObjectNames.has(candidate); index += 1) {
      candidate = base + '_' + index;
    }
    usedObjectNames.add(candidate);
    exportedObjectNames.set(object, candidate);
    return candidate;
  };

  const ensurePoint = (point: any, preferred?: string): string | null => {
    if (!point || typeof point.X !== 'function' || typeof point.Y !== 'function') return null;
    if (exportedPoints.has(point)) return exportedPoints.get(point) || null;
    if (point.__liaDgsMidpoint) {
      const name = allocatePointName(point, preferred);
      exportedPoints.set(point, name);
      return name;
    }
    if (point.__liaDgsRootPoint || point.__liaDgsExtremumPoint || point.__liaDgsInflectionPoint ||
        point.__liaDgsYInterceptPoint || point.__liaDgsIntersectionPoint) {
      const name = allocatePointName(point, preferred);
      exportedPoints.set(point, name);
      return name;
    }
    const coordinates = getDgsExportPointCoordinates(point);
    if (!coordinates) return null;
    const name = allocatePointName(point, preferred);
    exportedPoints.set(point, name);
    const color = normalizeHexColor(getDgsObjectColor(point, 'line')) || '#ff00ff';
    const opacity = point.__liaDgsShowObject === false ? 0 : getDgsObjectOpacity(point);
    const parts = [
      exportId,
      formatMacroName(cleanDgsExportToken(name), point.__liaDgsShowName !== false),
      formatDgsExportNumber(coordinates.x),
      formatDgsExportNumber(coordinates.y),
      color,
      formatDgsExportNumber(opacity, 1)
    ];
    if (getDgsObjectFixed(point)) parts.push('fix');
    if (point.__liaDgsHelperPoint) parts.push('helper=1');
    const expressions = point.__liaDgsCoordinateExpressions;
    if (expressions && String(expressions.x || '').trim() && String(expressions.y || '').trim()) {
      parts.push('xexpr=' + quoteDgsExportField(String(expressions.x)));
      parts.push('yexpr=' + quoteDgsExportField(String(expressions.y)));
      const coordinateParameter = Number(point.__liaDgsCoordinateParameter);
      if (Number.isFinite(coordinateParameter)) {
        parts.push('parameter=' + formatDgsExportNumber(coordinateParameter));
      }
    }
    pointLines.push(macroDgsExportLine(macros.point, parts.join(';')));
    return name;
  };

  objects.forEach((object) => {
    if (!object || object.__liaDgsPolygonBorder) return;
    if (object.__liaDgsTangentPoint || object.__liaDgsTangentHelper) return;
    // Coordinate-mode macro helpers are serialized only when an exported
    // owner actually references them through pointList(). This avoids
    // accumulating orphaned invisible points over repeated roundtrips.
    if (isDgsPoint(object) && !object.__liaDgsHelperPoint) ensurePoint(object);
  });

  const axisLabels = getDgsAxisLabels(state);
  if (
    normalizeDgsAxisVariable(axisLabels.x.variable) !== 'x' || String(axisLabels.x.description || '').trim() ||
    normalizeDgsAxisVariable(axisLabels.y.variable) !== 'y' || String(axisLabels.y.description || '').trim()
  ) {
    objectLines.push(macroDgsExportLine(macros.axisLabel, [
      'id=' + exportId,
      'xlabel=' + quoteDgsExportField(formatDgsAxisLabel(axisLabels.x)),
      'ylabel=' + quoteDgsExportField(formatDgsAxisLabel(axisLabels.y))
    ].join(';')));
  }

  const pointList = (points: any[]): string | null => {
    const names = points.map((point) => ensurePoint(point)).filter(Boolean) as string[];
    return names.length === points.length ? '[' + names.map(cleanDgsExportToken).join(';') + ']' : null;
  };

  const pointPairReference = (object: any): string => {
    if (!object || !object.point1 || !object.point2) return '';
    return pointList([object.point1, object.point2]) || '';
  };

  const constructionSourceObject = (source: any): any => {
    return source && source.object ? source.object : source;
  };

  const analysisSourceReference = (sourceValue: any): string => {
    const source = constructionSourceObject(sourceValue);
    if (!source) return '';
    if (source.__liaDgsAnalysisFunction === true && !isDgsFunction(source)) return '';
    if (!source.__liaDgsPolygonBorder && !source.__liaDgsAngleBisector) {
      const exportedName = exportedObjectNames.get(source);
      if (exportedName) return exportedName;
    }
    return pointPairReference(source);
  };

  const addPointConstructionExport = (
    macroName: string,
    construction: any,
    sourceRefs: string[],
    prefix: string
  ) => {
    if (!construction) return;
    const cleanedRefs = sourceRefs.map(cleanDgsExportToken).filter(Boolean);
    if (!cleanedRefs.length || cleanedRefs.length !== sourceRefs.length) return;
    const analysisPoints = Array.isArray(construction.points) ? construction.points : [];
    const options: string[] = [];
    const names = analysisPoints.map((point: any) => ensurePoint(point, point && point.__liaDgsPointName)).filter(Boolean) as string[];
    if (names.length) {
      options.push('names=[' + names.map((name, index) => formatMacroName(
        cleanDgsExportToken(name),
        analysisPoints[index] && analysisPoints[index].__liaDgsShowName !== false
      )).join(';') + ']');
    }
    const valueFlags = analysisPoints.map((point: any) => !!(point && point.__liaDgsShowValue));
    if (valueFlags.length && valueFlags.every(Boolean)) {
      options.push(useGerman ? 'wert=1' : 'value=1');
    } else if (valueFlags.some(Boolean)) {
      options.push((useGerman ? 'werte' : 'values') + '=[' +
        valueFlags.map((visible) => visible ? '1' : '0').join(';') + ']');
    }
    const visibilityFlags = analysisPoints.map((point: any) =>
      !!point && point.__liaDgsShowObject !== false
    );
    if (visibilityFlags.some((visible) => !visible)) {
      options.push((useGerman ? 'sichtbar' : 'visible') + '=[' +
        visibilityFlags.map((visible) => visible ? '1' : '0').join(';') + ']');
    }
    objectLines.push(macroDgsExportLine(macroName, [
      exportId,
      ...cleanedRefs,
      normalizeHexColor((analysisPoints[0] && getDgsObjectColor(analysisPoints[0], 'line')) || '') || '#ff00ff',
      prefix
    ].concat(options).join(';')));
  };

  objects.forEach((object) => {
    if (!object || !object.__liaDgsMidpoint) return;
    const midpointName = ensurePoint(object, object.__liaDgsPointName || object.name || 'M');
    const points = pointList([object.__liaDgsMidpointFirst, object.__liaDgsMidpointSecond]);
    if (!midpointName || !points) return;
    const options: string[] = [];
    if (object.__liaDgsShowValue) options.push(useGerman ? 'wert=1' : 'value=1');
    if (object.__liaDgsShowObject === false) options.push('visible=0');
    midpointLines.push(macroDgsExportLine(macros.midpoint, [
      exportId,
      points,
      normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff',
      formatMacroName(cleanDgsExportToken(midpointName), object.__liaDgsShowName !== false)
    ].concat(options).join(';')));
  });

  objects.forEach((object) => {
    if (!isDgsSlider(object)) return;
    const sliderName = normalizeDgsParameterName(object.__liaDgsSliderName || object.name || '');
    if (!sliderName) return;
    const first = getDgsExportPointCoordinates(object.point1);
    const second = getDgsExportPointCoordinates(object.point2);
    const position = first && second
      ? '[[' + formatDgsExportNumber(first.x) + ';' + formatDgsExportNumber(first.y) + '];[' +
        formatDgsExportNumber(second.x) + ';' + formatDgsExportNumber(second.y) + ']]'
      : '';
    const options: string[] = [];
    if (position) options.push(position);
    if (object.__liaDgsSliderPositionLocked) options.push('lockposition=1');
    if (object.__liaDgsShowObject === false) options.push('visible=0');
    const fontSize = Number(object.__liaDgsFormatFontSize);
    if (Number.isFinite(fontSize) && Math.abs(fontSize - 18) > 1e-9) {
      options.push('fontsize=' + formatDgsExportNumber(fontSize, 18));
    }
    sliderLines.push(macroDgsExportLine(macros.slider, [
      exportId,
      formatMacroName(cleanDgsExportToken(sliderName), object.__liaDgsShowName !== false),
      formatDgsExportNumber(Number(object.__liaDgsSliderMinimum), -5),
      formatDgsExportNumber(Number(object.__liaDgsSliderMaximum), 5),
      formatDgsExportNumber(Number(object.__liaDgsSliderStep), 0.1),
      formatDgsExportNumber(getDgsSliderValue(object), 1),
      normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff'
    ].concat(options).join(';')));
  });

  objects.forEach((object) => {
    if (!object || isDgsPoint(object) || object.__liaDgsPolygonBorder) return;
    const name = cleanDgsExportToken(getDgsObjectName(object));
    const typeLabel = getDgsObjectTypeLabel(state, object);

    if (object.__liaDgsAnalysisFunction === true && !isDgsFunction(object)) {
      if (object.__liaDgsRootConstruction || object.__liaDgsExtremaConstruction ||
          object.__liaDgsInflectionConstruction || object.__liaDgsYInterceptConstruction) {
        const label = String(object.__liaRegressionEntry?.title ||
          object.__liaRegressionAnalysisId || dgsText(state.language).analysis);
        const message = label + ' - ' + dgsText(state.language).analysis;
        if (!unsupported.includes(message)) unsupported.push(message);
      }
      return;
    }

    const addFunctionAnalysisExport = (macroName: string, construction: any, prefix: string) => {
      addPointConstructionExport(
        macroName,
        construction,
        [exportedObjectNames.get(object) || name || object.__liaDgsFunctionName || 'f'],
        prefix
      );
    };

    if (isDgsText(object)) {
      const coordinates = getDgsExportPointCoordinates(object);
      if (!coordinates) return;
      objectLines.push(macroDgsExportLine(macros.coordText, [
        exportId,
        '[' + formatDgsExportNumber(coordinates.x) + ';' + formatDgsExportNumber(coordinates.y) + ']',
        quoteDgsExportField(object.__liaDgsTextContent || name),
        normalizeHexColor(getDgsObjectColor(object, 'text')) || '#ff00ff',
        formatDgsExportNumber(object.__liaDgsShowObject === false ? 0 : getDgsObjectOpacity(object), 1)
      ].join(';')));
      return;
    }

    if (isDgsFunction(object)) {
      const sourceName = allocateObjectName(object, name || object.__liaDgsFunctionName, 'f');
      const options = object.__liaDgsShowObject === false ? ['visible=0'] : [];
      addDgsExportLineStyleOption(options, object);
      objectLines.push(macroDgsExportLine(macros.plotFunction, [
        exportId,
        formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false),
        quoteDgsExportField(exportFunctionExpression(object.__liaDgsFunctionNormalized || object.__liaDgsFunctionExpression || '')),
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff'
      ].concat(options).join(';')));
      addFunctionAnalysisExport(macros.zeros, object.__liaDgsRootConstruction, useGerman ? 'N' : 'Z');
      addFunctionAnalysisExport(macros.extrema, object.__liaDgsExtremaConstruction, 'E');
      addFunctionAnalysisExport(macros.inflections, object.__liaDgsInflectionConstruction, useGerman ? 'W' : 'I');
      addFunctionAnalysisExport(macros.ordinateIntercept, object.__liaDgsYInterceptConstruction, 'O');
      return;
    }

    if (object.__liaDgsTangent) {
      const source = object.__liaDgsTangentSource;
      if (source && source.__liaDgsAnalysisFunction === true && !isDgsFunction(source)) {
        unsupported.push((name ? name + ' - ' : '') + typeLabel);
        return;
      }
      let sourceReference = source ? (exportedObjectNames.get(source) || '') : '';
      if (!sourceReference && source) {
        if (!isDgsFunction(source) && !isDgsCircle(source) && source.point1 && source.point2) {
          sourceReference = pointList([source.point1, source.point2]) || '';
        } else {
          sourceReference = allocateObjectName(source, getDgsObjectName(source), 'o');
        }
      }
      const contactPoint = object.__liaDgsTangentPoint;
      let contact = '';
      try {
        contact = '[' + formatDgsExportNumber(Number(contactPoint.X())) + ';' +
          formatDgsExportNumber(Number(contactPoint.Y())) + ']';
      } catch (e) {}
      if (!sourceReference || !contact) {
        unsupported.push((name ? name + ' - ' : '') + typeLabel);
        return;
      }
      const sourceName = allocateObjectName(object, name || object.__liaDgsLineName, 't');
      const pointName = cleanDgsExportToken(contactPoint && contactPoint.__liaDgsPointName || '');
      const parts = [
        exportId,
        sourceReference,
        contact,
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff',
        formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false)
      ];
      if (pointName) {
        parts.push(formatMacroName(pointName, contactPoint && contactPoint.__liaDgsShowName !== false));
      }
      if (object.__liaDgsShowObject === false) parts.push('visible=0');
      addDgsExportLineStyleOption(parts, object);
      objectLines.push(macroDgsExportLine(macros.tangent, parts.join(';')));
      addPointConstructionExport(macros.ordinateIntercept, object.__liaDgsYInterceptConstruction, [sourceName], 'O');
      return;
    }

    if (isDgsCompassArc(object)) {
      unsupported.push((name ? name + ' - ' : '') + typeLabel);
      return;
    }

    if (isDgsArc(object)) {
      const startName = ensurePoint(object.__liaDgsArcStartPoint);
      const endName = ensurePoint(object.__liaDgsArcEndPoint);
      if (!startName || !endName) return;
      const sourceName = allocateObjectName(object, name, 'b');
      const caption = object.__liaDgsShowName !== false && sourceName
        ? '$' + sourceName + '$'
        : '';
      const strokeWidth = Number(object.__liaDgsArcStrokeWidth);
      const options = object.__liaDgsShowObject === false ? ['visible=0'] : [];
      addDgsExportLineStyleOption(options, object);
      objectLines.push(macroDgsExportLine(macros.arc, [
        exportId,
        cleanDgsExportToken(startName),
        formatDgsExportNumber(Number(object.__liaDgsArcExitAngle)),
        cleanDgsExportToken(endName),
        formatDgsExportNumber(Number(object.__liaDgsArcEntryAngle)),
        caption,
        String(object.__liaDgsArcDesign || '-'),
        formatDgsExportNumber(Number.isFinite(strokeWidth) ? strokeWidth : 3, 3) + 'px',
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff'
      ].concat(options).join(';')));
      return;
    }

    if (object.__liaDgsSegment && !isDgsRay(object) && !isDgsVector(object) && !isDgsLine(object)) {
      const points = pointList([object.point1, object.point2]);
      if (!points) return;
      const sourceName = allocateObjectName(object, name, 's');
      const options = [formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false)];
      if (object.__liaDgsShowLength) options.push('length=1');
      const design = getDgsStrokeDesign(object);
      const strokeWidth = getDgsStrokeWidth(object);
      if (design !== '-' || Math.abs(strokeWidth - 3) > 1e-9) {
        options.push(design);
        options.push(formatDgsExportNumber(strokeWidth, 3) + 'px');
      }
      if (object.__liaDgsShowObject === false) options.push('visible=0');
      addDgsExportLineStyleOption(options, object);
      objectLines.push(macroDgsExportLine(macros.segment, [
        exportId,
        points,
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff'
      ].concat(options.filter(Boolean)).join(';')));
      addPointConstructionExport(macros.ordinateIntercept, object.__liaDgsYInterceptConstruction, [sourceName], 'O');
      return;
    }

    if (isDgsPerpendicular(object) || isDgsParallel(object)) {
      const throughPoint = isDgsPerpendicular(object) ? object.__liaDgsPerpendicularPoint : object.__liaDgsParallelPoint;
      const baseLine = isDgsPerpendicular(object) ? object.__liaDgsPerpendicularBase : object.__liaDgsParallelBase;
      const throughName = ensurePoint(throughPoint);
      const baseRequiresPointPair = !!(baseLine && (
        !isDgsLinearObject(baseLine) ||
        baseLine.__liaDgsPolygonBorder ||
        baseLine.__liaDgsTangent ||
        baseLine.__liaDgsAngleBisector
      ));
      const baseName = baseLine && !baseRequiresPointPair
        ? allocateObjectName(baseLine, getDgsObjectName(baseLine), 'g')
        : '';
      let baseReference = baseRequiresPointPair ? '' : baseName;
      if (!baseReference && baseLine && baseLine.point1 && baseLine.point2) {
        baseReference = pointList([baseLine.point1, baseLine.point2]) || '';
      }
      if (!throughName || !baseReference) return;
      const macroName = isDgsParallel(object) ? macros.parallel : macros.perpendicular;
      const sourceName = allocateObjectName(
        object,
        name,
        isDgsParallel(object) ? 'p' : 'o'
      );
      const parts = [
        exportId,
        baseReference,
        cleanDgsExportToken(throughName),
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff'
      ];
      if (sourceName) parts.push(formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false));
      if (object.__liaDgsShowObject === false) parts.push('visible=0');
      addDgsExportLineStyleOption(parts, object);
      objectLines.push(macroDgsExportLine(macroName, parts.join(';')));
      addPointConstructionExport(macros.ordinateIntercept, object.__liaDgsYInterceptConstruction, [sourceName], 'O');
      return;
    }

    if ((isDgsLine(object) || isDgsRay(object) || isDgsVector(object)) &&
        !object.__liaDgsTangent && !object.__liaDgsAngleBisector) {
      const points = pointList([object.point1, object.point2]);
      if (!points) return;
      const macroName = isDgsVector(object) ? macros.vector : (isDgsRay(object) ? macros.ray : macros.line);
      const sourceName = allocateObjectName(
        object,
        name,
        isDgsVector(object) ? 'v' : (isDgsRay(object) ? 'r' : 'g')
      );
      const parts = [
        exportId,
        points,
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff'
      ];
      if (sourceName) parts.push(formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false));
      if (object.__liaDgsShowObject === false) parts.push('visible=0');
      addDgsExportLineStyleOption(parts, object);
      objectLines.push(macroDgsExportLine(macroName, parts.join(';')));
      addPointConstructionExport(macros.ordinateIntercept, object.__liaDgsYInterceptConstruction, [sourceName], 'O');
      return;
    }

    if (isDgsPolygon(object)) {
      const points = pointList(Array.isArray(object.vertices) ? object.vertices : []);
      if (!points) return;
      const options: string[] = [];
      if (object.__liaDgsShowArea) options.push(useGerman ? 'inhalt=1' : 'area=1');
      if (object.__liaDgsShowPerimeter) options.push(useGerman ? 'umfang=1' : 'perimeter=1');
      if (object.__liaDgsShowObject === false) options.push('visible=0');
      addDgsExportLineStyleOption(options, object);
      objectLines.push(macroDgsExportLine(macros.area, [
        exportId,
        points,
        normalizeHexColor(getDgsObjectColor(object, 'fill')) || normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff',
        formatDgsExportNumber(getDgsObjectOpacity(object), 0.25)
      ].concat(options).join(';')));
      return;
    }

    if (isDgsCircle(object)) {
      const centerName = ensurePoint(object.__liaDgsCircleCenter);
      const radiusPointName = ensurePoint(object.__liaDgsCircleRadiusPoint);
      if (!centerName) return;
      const options: string[] = [];
      if (radiusPointName) options.push('radius=' + cleanDgsExportToken(radiusPointName));
      else {
        try { options.push('radius=' + formatDgsExportNumber(Number(object.Radius()), 1)); } catch (e) {}
      }
      if (object.__liaDgsShowArea) options.push(useGerman ? 'inhalt=1' : 'area=1');
      if (object.__liaDgsShowPerimeter) options.push(useGerman ? 'umfang=1' : 'circumference=1');
      if (object.__liaDgsShowObject === false) options.push('visible=0');
      addDgsExportLineStyleOption(options, object);
      const sourceName = allocateObjectName(object, name, 'k');
      objectLines.push(macroDgsExportLine(macros.circle, [
        exportId,
        formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false),
        cleanDgsExportToken(centerName),
        normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff',
        formatDgsExportNumber(getDgsObjectOpacity(object), 0.2)
      ].concat(options).join(';')));
      return;
    }

    if (isDgsSector(object)) {
      const points = pointList([
        object.__liaDgsSectorCenter,
        object.__liaDgsSectorRadiusPoint,
        object.__liaDgsSectorAnglePoint
      ]);
      if (!points) return;
      const options: string[] = [];
      if (object.__liaDgsShowArea) options.push(useGerman ? 'inhalt=1' : 'area=1');
      if (object.__liaDgsShowPerimeter) options.push(useGerman ? 'umfang=1' : 'perimeter=1');
      if (object.__liaDgsShowObject === false) options.push('visible=0');
      addDgsExportLineStyleOption(options, object);
      const sourceName = allocateObjectName(object, name || object.__liaDgsSectorName, 's');
      objectLines.push(macroDgsExportLine(macros.sector, [
        exportId,
        points,
        normalizeHexColor(getDgsObjectColor(object, 'fill')) || normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff',
        formatDgsExportNumber(getDgsObjectOpacity(object), 0.2),
        formatMacroName(sourceName, !!name && object.__liaDgsShowName !== false)
      ].concat(options).join(';')));
      return;
    }

    if (isDgsAngle(object)) {
      const points = pointList(Array.isArray(object.__liaDgsAnglePoints) ? object.__liaDgsAnglePoints : []);
      if (!points) return;
      const options: string[] = [];
      if (object.__liaDgsShowAngle) options.push(useGerman ? 'wert=1' : 'value=1');
      if (object.__liaDgsShowObject === false) options.push('visible=0');
      addDgsExportLineStyleOption(options, object);
      objectLines.push(macroDgsExportLine(macros.angle, [
        exportId,
        formatMacroName(name || 'alpha', !!name && object.__liaDgsShowName !== false),
        points,
        normalizeHexColor(getDgsObjectColor(object, 'fill')) || normalizeHexColor(getDgsObjectColor(object, 'line')) || '#ff00ff',
        formatDgsExportNumber(getDgsObjectOpacity(object), 1)
      ].concat(options).join(';')));
      return;
    }

    if (object.__liaDgsAngleBisector) {
      unsupported.push((name ? name + ' - ' : '') + typeLabel);
    }
  });

  objects.forEach((object) => {
    if (!object || !object.__liaDgsPolygonBorder || !object.__liaDgsYInterceptConstruction) return;
    const sourceReference = analysisSourceReference(object);
    if (!sourceReference) return;
    addPointConstructionExport(
      macros.ordinateIntercept,
      object.__liaDgsYInterceptConstruction,
      [sourceReference],
      'O'
    );
  });

  getDgsIntersectionConstructionsForExport(state)
    .forEach((construction) => {
      const firstSource = construction.source || construction.__liaDgsSource;
      const secondSource = construction.source2 || construction.__liaDgsSource2;
      const firstReference = analysisSourceReference(firstSource);
      const secondReference = analysisSourceReference(secondSource);
      if (!firstReference || !secondReference) {
        if ((firstSource && firstSource.__liaDgsAnalysisFunction === true) ||
            (secondSource && secondSource.__liaDgsAnalysisFunction === true)) {
          const message = dgsText(state.language).intersection + ' - ' + dgsText(state.language).analysis;
          if (!unsupported.includes(message)) unsupported.push(message);
        }
        return;
      }
      addPointConstructionExport(
        macros.intersection,
        construction,
        [firstReference, secondReference],
        useGerman ? 'S' : 'I'
      );
    });

  const dgsProfileParts = [
    exportId,
    'tools=' + formatDgsToolSelection(selectedToolIds)
  ];
  const restrictions = canonicalDgsRestrictionIds(selectedRestrictionIds);
  if (restrictions.length) {
    dgsProfileParts.push('restrictions=' + formatDgsRestrictionSelection(restrictions));
  }

  lines.push(
    ...pointLines,
    ...midpointLines,
    ...sliderLines,
    ...objectLines,
    macroDgsExportLine(
      macros.dgs,
      dgsProfileParts.join(';')
    )
  );
  if (unsupported.length) {
    lines.push('', '<!-- ' + dgsText(state.language).exportUnsupported + ': ' + unsupported.join(', ') + ' -->');
  }
  return lines.join('\n');
}

function renameDgsParameterReferences(state: DgsState, oldName: string, newName: string): void {
  if (!oldName || oldName === newName) return;
  const escaped = oldName.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
  const pattern = new RegExp('\\b' + escaped + '\\b', 'gi');
  getDgsBoardObjects(state.board).forEach((candidate) => {
    if (isDgsFunction(candidate)) {
      const expression = String(candidate.__liaDgsFunctionExpression || '');
      const replaced = expression.replace(pattern, newName);
      if (replaced !== expression) applyDgsFunctionExpression(state, candidate, replaced, false);
      return;
    }
    if (isDgsPoint(candidate) && candidate.__liaDgsCoordinateExpressions) {
      const expressions = candidate.__liaDgsCoordinateExpressions;
      const nextX = String(expressions.x || '').replace(pattern, newName);
      const nextY = String(expressions.y || '').replace(pattern, newName);
      if (nextX === expressions.x && nextY === expressions.y) return;
      candidate.__liaDgsCoordinateExpressions = { x: nextX, y: nextY };
      candidate.__liaDgsCoordinateCompiled = null;
      compileStoredDgsCoordinateExpressions(state, candidate);
    }
  });
}

function setDgsAnalysisPointEntryOption(object: any, property: string, value: unknown): void {
  const entry = object && object.__liaDgsAnalysisConstruction;
  if (!entry || !Array.isArray(entry.points)) return;
  const index = entry.points.indexOf(object);
  if (index < 0) return;
  if (!Array.isArray(entry[property])) entry[property] = [];
  entry[property][index] = value;
  if (property === 'explicitNames') {
    if (Array.isArray(entry.names)) entry.names[index] = String(value || '');
    return;
  }
  if (property === 'explicitNameVisibility') {
    if (!Array.isArray(entry.explicitNames)) entry.explicitNames = [];
    if (!entry.explicitNames[index]) entry.explicitNames[index] = getDgsObjectName(object);
  }
}

function setDgsObjectName(state: DgsState, object: any, value: string): boolean {
  const name = String(value || '').trim();
  if (!object || !name) return false;
  const oldName = getDgsObjectName(object);
  if (name === oldName) return true;
  if (isDgsText(object)) return setDgsTextContent(state, object, name);

  if (isDgsSlider(object)) {
    const normalized = normalizeDgsParameterName(name);
    if (!normalized || !dgsParameterNameAvailable(state, normalized, object)) return false;
    object.__liaDgsSliderName = normalized;
    renameDgsParameterReferences(state, normalizeDgsParameterName(oldName), normalized);
  } else if (isDgsPoint(object)) {
    const points = window.__points && window.__points[state.boardId];
    if (points && points[name] && points[name] !== object) return false;
    const macroSourceName = object.__liaDgsMacroManaged
      ? String(object.__liaDgsMacroPointName || '').trim()
      : '';

    try {
      if (points) {
        if (points[oldName] === object && oldName !== macroSourceName) delete points[oldName];
        points[name] = object;
        if (macroSourceName) points[macroSourceName] = object;
      }
      const pointStates = window.__pointStates && window.__pointStates[state.boardId];
      if (pointStates) {
        const savedState = pointStates[oldName] ||
          (macroSourceName ? pointStates[macroSourceName] : null);
        if (savedState && oldName !== macroSourceName) delete pointStates[oldName];
        const nextState = savedState || {
          x: Number(object.X()),
          y: Number(object.Y()),
          fixed: getDgsObjectFixed(object)
        };
        pointStates[name] = nextState;
        if (macroSourceName) pointStates[macroSourceName] = nextState;
      }
    } catch (e) {}
    object.__liaDgsPointName = name;
    setDgsAnalysisPointEntryOption(object, 'explicitNames', name);

    const seen = new Set<any>();
    const updatePolygonName = (candidate: any) => {
      if (!isDgsPolygon(candidate) || seen.has(candidate) || !candidate.__liaDgsPolygonAutoName ||
          !Array.isArray(candidate.vertices) || !candidate.vertices.includes(object)) return;
      seen.add(candidate);
      const vertices = candidate.vertices.slice();
      if (vertices.length > 1 && vertices[0] === vertices[vertices.length - 1]) vertices.pop();
      candidate.__liaDgsPolygonName = vertices
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
    const updateVectorName = (candidate: any) => {
      if (!isDgsVector(candidate) || !candidate.__liaDgsVectorAutoName ||
          (candidate.point1 !== object && candidate.point2 !== object)) return;
      const nextName = getAutomaticDgsVectorName(candidate.point1, candidate.point2);
      if (!nextName) return;
      candidate.__liaDgsVectorName = nextName;
      try { candidate.setAttribute({ name: '\\(' + formatDgsVectorTexName(nextName) + '\\)' }); } catch (e) {}
      refreshDgsObjectLabel(candidate);
    };
    if (state.board && Array.isArray(state.board.objectsList)) state.board.objectsList.forEach(updateVectorName);
    if (state.board && state.board.objects && typeof state.board.objects === 'object') {
      Object.keys(state.board.objects).forEach((key) => updateVectorName(state.board.objects[key]));
    }
    try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
    try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
  } else if (isDgsFunction(object)) {
    const expressionName = getDgsExpressionFunctionName({ __liaDgsFunctionName: name });
    if (expressionName && getDgsBoardObjects(state.board).some((candidate) =>
      isDgsSlider(candidate) && normalizeDgsParameterName(candidate.__liaDgsSliderName) === expressionName
    )) return false;
    object.__liaDgsFunctionName = name;
  } else if (isDgsRay(object)) {
    object.__liaDgsRayName = name;
  } else if (isDgsVector(object)) {
    object.__liaDgsVectorName = name;
    object.__liaDgsVectorAutoName = false;
  } else if (isDgsCompassArc(object)) {
    object.__liaDgsCompassArcName = name;
  } else if (isDgsArc(object)) {
    object.__liaDgsArcName = name;
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
  } else if (isDgsSector(object)) {
    object.__liaDgsSectorName = name;
  } else if (object.__liaDgsSegment) {
    object.__liaDgsSegmentName = name;
  } else {
    return false;
  }

  const texName = isDgsVector(object) ? formatDgsVectorTexName(name) : name;
  try { if (typeof object.setAttribute === 'function') object.setAttribute({ name: '\\(' + texName + '\\)' }); } catch (e) {}
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
  const relationLine = isDgsPerpendicular(line) || isDgsParallel(line);
  const point1 = isDgsPerpendicular(line)
    ? line.__liaDgsPerpendicularPoint
    : (isDgsParallel(line) ? line.__liaDgsParallelPoint : line && line.point1);
  const point2 = line && line.point2;
  if (!point1 || (!relationLine && !point2)) return '';

  let x1 = NaN;
  let y1 = NaN;
  let x2 = NaN;
  let y2 = NaN;
  try {
    x1 = Number(point1.X());
    y1 = Number(point1.Y());
    if (relationLine) {
      const baseLine = isDgsPerpendicular(line)
        ? line.__liaDgsPerpendicularBase
        : line.__liaDgsParallelBase;
      let baseDx = NaN;
      let baseDy = NaN;
      if (baseLine && Array.isArray(baseLine.stdform)) {
        baseDx = Number(baseLine.stdform[2]);
        baseDy = -Number(baseLine.stdform[1]);
      }
      if (!Number.isFinite(baseDx) || !Number.isFinite(baseDy) || Math.hypot(baseDx, baseDy) < 1e-12) {
        const basePoint1 = baseLine && baseLine.point1;
        const basePoint2 = baseLine && baseLine.point2;
        if (!basePoint1 || !basePoint2) return '';
        baseDx = Number(basePoint2.X()) - Number(basePoint1.X());
        baseDy = Number(basePoint2.Y()) - Number(basePoint1.Y());
      }
      x2 = isDgsPerpendicular(line) ? x1 - baseDy : x1 + baseDx;
      y2 = isDgsPerpendicular(line) ? y1 + baseDx : y1 + baseDy;
    } else {
      x2 = Number(point2.X());
      y2 = Number(point2.Y());
    }
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

function getDgsSectorMetrics(object: any): { radius: number; angle: number; area: number; perimeter: number } {
  try {
    const centerX = Number(object.__liaDgsSectorCenter.X());
    const centerY = Number(object.__liaDgsSectorCenter.Y());
    const radiusX = Number(object.__liaDgsSectorRadiusPoint.X()) - centerX;
    const radiusY = Number(object.__liaDgsSectorRadiusPoint.Y()) - centerY;
    const angleX = Number(object.__liaDgsSectorAnglePoint.X()) - centerX;
    const angleY = Number(object.__liaDgsSectorAnglePoint.Y()) - centerY;
    const radius = Math.hypot(radiusX, radiusY);
    const start = Math.atan2(radiusY, radiusX);
    const end = Math.atan2(angleY, angleX);
    const angle = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return {
      radius,
      angle,
      area: radius * radius * angle / 2,
      perimeter: radius * angle + 2 * radius
    };
  } catch (e) {
    return { radius: NaN, angle: NaN, area: NaN, perimeter: NaN };
  }
}

function dgsObjectLabelText(object: any): string {
  const name = getDgsObjectName(object);
  const showName = object && object.__liaDgsShowName !== false;
  const mayDisplayValues = dgsMayDisplayObjectValues(object);

  if (isDgsSlider(object)) {
    return showName && name
      ? '\\(' + dgsSliderNameToTex(name) + ' = ' +
        formatDgsMeasurement(getDgsSliderValue(object), object.__liaDgsLanguage) + '\\)'
      : '';
  }

  if (object && object.__liaDgsMidpoint) {
    const showValue = mayDisplayValues && !!object.__liaDgsShowValue;
    if (!showName && !showValue) return '';
    if (!showValue) return '\\(' + name + '\\)';
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    const x = formatDgsMeasurement(Number(object.X()), language);
    const y = formatDgsMeasurement(Number(object.Y()), language);
    return '\\(' + (showName && name ? name + ':\\; ' : '') + '(' + x + '\\mid ' + y + ')\\)';
  }

  if (object && (object.__liaDgsRootPoint || object.__liaDgsExtremumPoint ||
      object.__liaDgsInflectionPoint || object.__liaDgsYInterceptPoint ||
      object.__liaDgsIntersectionPoint)) {
    const showValue = mayDisplayValues && !!object.__liaDgsShowValue;
    if (!showName && !showValue) return '';
    if (!showValue) return '\\(' + name + '\\)';
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    const x = formatDgsMeasurement(Number(object.X()), language);
    if (object.__liaDgsYInterceptPoint) {
      const y = formatDgsMeasurement(Number(object.Y()), language);
      return '\\(' + (showName && name ? name + ':\\; ' : '') + 'y = ' + y + '\\)';
    }
    if (object.__liaDgsExtremumPoint || object.__liaDgsInflectionPoint ||
        object.__liaDgsIntersectionPoint) {
      const y = formatDgsMeasurement(Number(object.Y()), language);
      return '\\(' + (showName && name ? name + ':\\; ' : '') + '(' + x + '\\mid ' + y + ')\\)';
    }
    return '\\(' + (showName && name ? name + ':\\; ' : '') + 'x = ' + x + '\\)';
  }

  if (isDgsFunction(object)) {
    const showExpression = mayDisplayValues && !!object.__liaDgsShowExpression;
    if (!showName && !showExpression) return '';
    const leftSide = showName && name ? name + '(x)' : 'y';
    if (showExpression) {
      return '\\(' + leftSide + ' = ' +
        dgsFunctionExpressionToTex(String(object.__liaDgsFunctionExpression || '')) + '\\)';
    }
    return '\\(' + leftSide + '\\)';
  }

  if (isDgsVector(object)) {
    return showName && name ? '\\(' + formatDgsVectorTexName(name) + '\\)' : '';
  }

  if (isDgsSector(object)) {
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    const metrics = getDgsSectorMetrics(object);
    const lines: string[] = [];
    if (showName && name) lines.push('\\mathrm{' + name + '}');
    if (mayDisplayValues && object.__liaDgsShowArea) {
      lines.push('A ' + dgsMeasurementRelation(metrics.area) + ' ' +
        formatDgsMeasurement(metrics.area, language) + '\\,\\mathrm{' +
        (language === 'de' ? 'FE' : 'AU') + '}');
    }
    if (mayDisplayValues && object.__liaDgsShowPerimeter) {
      lines.push('u ' + dgsMeasurementRelation(metrics.perimeter) + ' ' +
        formatDgsMeasurement(metrics.perimeter, language) + '\\,\\mathrm{' +
        (language === 'de' ? 'LE' : 'LU') + '}');
    }
    if (!lines.length) return '';
    if (lines.length === 1) return '\\(' + lines[0] + '\\)';
    return '\\(\\begin{gathered}' + lines.join('\\\\[2pt]') + '\\end{gathered}\\)';
  }

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
    if (mayDisplayValues && object.__liaDgsShowArea) {
      const area = Math.PI * radius * radius;
      lines.push('A ' + dgsMeasurementRelation(area) + ' ' + formatDgsMeasurement(area, language) +
        '\\,\\mathrm{' + (language === 'de' ? 'FE' : 'AU') + '}');
    }
    if (mayDisplayValues && object.__liaDgsShowPerimeter) {
      const perimeter = 2 * Math.PI * radius;
      lines.push('u ' + dgsMeasurementRelation(perimeter) + ' ' + formatDgsMeasurement(perimeter, language) +
        '\\,\\mathrm{' + (language === 'de' ? 'LE' : 'LU') + '}');
    }
    if (!lines.length) return '';
    if (lines.length === 1) return '\\(' + lines[0] + '\\)';
    return '\\(\\begin{gathered}' + lines.join('\\\\[2pt]') + '\\end{gathered}\\)';
  }

  if (mayDisplayValues && isDgsLine(object) && object.__liaDgsShowEquation) {
    const equation = getDgsLineEquation(object);
    return '\\(' + (showName && name ? name + ': ' : '') + equation + '\\)';
  }

  if (mayDisplayValues && isDgsAngle(object) && object.__liaDgsShowAngle) {
    const degrees = getDgsAngleRadians(object) * 180 / Math.PI;
    const prefix = showName && name ? name + ' ' + dgsMeasurementRelation(degrees) + ' ' : '';
    const language = getDgsGeometryLanguage(null, object.__liaDgsLanguage);
    return '\\(' + prefix + formatDgsMeasurement(degrees, language) + '^{\\circ}\\)';
  }

  if (mayDisplayValues && object && object.__liaDgsSegment && object.__liaDgsShowLength) {
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
  const mayDisplayValues = dgsMayDisplayObjectValues(object);
  const measurementVisible = !!(
    mayDisplayValues && (
    (object.__liaDgsSegment && object.__liaDgsShowLength) ||
    (object.__liaDgsLine && object.__liaDgsShowEquation) ||
    (object.__liaDgsAngle && object.__liaDgsShowAngle) ||
    (object.__liaDgsCircle && (object.__liaDgsShowArea || object.__liaDgsShowPerimeter)) ||
    (object.__liaDgsSector && (object.__liaDgsShowArea || object.__liaDgsShowPerimeter)) ||
    (object.__liaDgsFunction && object.__liaDgsShowExpression) ||
    (object.__liaDgsMidpoint && object.__liaDgsShowValue) ||
    ((object.__liaDgsRootPoint || object.__liaDgsExtremumPoint ||
      object.__liaDgsInflectionPoint || object.__liaDgsYInterceptPoint ||
      object.__liaDgsIntersectionPoint) && object.__liaDgsShowValue))
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
  if (isDgsSlider(object)) return !!object.__liaDgsSliderPositionLocked;
  try {
    if (object && typeof object.getAttribute === 'function') return !!object.getAttribute('fixed');
  } catch (e) {}
  try { return !!(object && object.visProp && object.visProp.fixed); } catch (e) { return false; }
}

function setDgsObjectFixed(object: any, fixed: boolean): void {
  if (isDgsSlider(object)) {
    object.__liaDgsSliderPositionLocked = fixed;
    [object.point1, object.point2, object.baseline].forEach((part: any) => {
      try { if (part && typeof part.setAttribute === 'function') part.setAttribute({ fixed }); } catch (e) {}
    });
    return;
  }
  try { if (object && typeof object.setAttribute === 'function') object.setAttribute({ fixed }); } catch (e) {}
}

function getDgsObjectLayer(object: any): number {
  const stored = getExplicitDgsLayerFromOwner(object);
  if (stored != null) return stored;
  const sourceLayer = Number(object && object.__liaMacroSourceLayer);
  if (Number.isFinite(sourceLayer)) return Math.max(0, Math.min(20, Math.round(sourceLayer)));
  try {
    const value = Number(typeof object.getAttribute === 'function' ? object.getAttribute('layer') : object.visProp && object.visProp.layer);
    if (Number.isFinite(value)) return Math.max(0, Math.min(20, Math.round(value)));
  } catch (e) {}
  return 5;
}

/** Rank overlapping hit targets by the layer users actually see on screen. */
function getDgsObjectRenderedLayer(object: any): number {
  const dgsLayer = getRenderedDgsLayerFromOwner(object);
  if (dgsLayer != null) return dgsLayer;
  try {
    const macroLayer = Number(object && object.__liaMacroRenderedLayer);
    if (Number.isFinite(macroLayer)) return Math.max(0, Math.round(macroLayer));
  } catch (e) {}
  try {
    const value = Number(typeof object.getAttribute === 'function'
      ? object.getAttribute('layer')
      : object && object.visProp && object.visProp.layer);
    if (Number.isFinite(value)) return Math.max(0, Math.round(value));
  } catch (e) {}
  return getDgsRenderedLayer(getDgsObjectLayer(object), getMacroLayerRenderRole(null, null, object));
}

function applyDgsRenderedLayer(candidate: any, layer: number, fallbackBoard?: any): void {
  try {
    if (!candidate) return;
    const role = getMacroLayerRenderRole(null, null, candidate);
    // DGS keeps its public 0..20 scale, while the renderer uses the same
    // source-major role slots as automatic macro layers.
    const renderedLayer = getDgsRenderedLayer(layer, role);
    candidate.__liaDgsRenderedLayer = renderedLayer;
    applySafeRenderedLayer(candidate, renderedLayer, fallbackBoard, role);
  } catch (e) {}
}

function clearDgsObjectLayerOverride(object: any): void {
  if (!object) return;
  try { delete object.__liaDgsLayer; } catch (e) { object.__liaDgsLayer = undefined; }
  const clearRenderedLayer = (candidate: any) => {
    if (!candidate) return;
    try { delete candidate.__liaDgsRenderedLayer; } catch (e) { candidate.__liaDgsRenderedLayer = undefined; }
  };
  clearRenderedLayer(object);
  clearRenderedLayer(object.label);
  clearRenderedLayer(object.arc);
  clearRenderedLayer(object.dot);
  clearRenderedLayer(object.__liaDgsMeasurementLabel);
  clearRenderedLayer(object.__liaDgsAngleLabel);
  clearRenderedLayer(object.__liaDgsCircleLabel);
  if (isDgsSlider(object)) {
    clearRenderedLayer(object.baseline);
    clearRenderedLayer(object.highline);
    clearRenderedLayer(object.point1);
    clearRenderedLayer(object.point2);
  }
  if (isDgsPolygon(object) && Array.isArray(object.borders)) object.borders.forEach(clearRenderedLayer);
  getDgsStrokeCapSegments(object).forEach(clearRenderedLayer);
  getDgsStrokeCapPoints(object).forEach(clearRenderedLayer);
  try {
    const sourceLayer = object.__liaMacroSourceLayer;
    if (sourceLayer != null && Number.isFinite(Number(sourceLayer))) {
      const role = object.__liaMacroLayerRole || getMacroLayerRenderRole(null, null, object);
      const renderedLayer = Number(object.__liaMacroRenderedLayer);
      const layer = Number.isFinite(renderedLayer)
        ? Math.max(0, Math.round(renderedLayer))
        : getMacroRenderedLayer(Number(sourceLayer), role);
      applySafeRenderedLayer(object, layer, object.board, role);
    }
  } catch (e) {}
  // Composite parts and late macro objects are reconciled by the shared,
  // DGS-override-aware source-order pass.
  try { window.__scheduleMacroCodeOrderLayers?.(); } catch (e) {}
}

function setDgsObjectLayer(object: any, value: number): number {
  const layer = Math.max(0, Math.min(20, Math.round(Number(value) || 0)));
  if (!object) return layer;
  object.__liaDgsLayer = layer;
  const apply = (candidate: any) => applyDgsRenderedLayer(candidate, layer, object.board);
  apply(object);
  apply(object.label);
  apply(object.arc);
  apply(object.dot);
  apply(object.__liaDgsMeasurementLabel);
  apply(object.__liaDgsAngleLabel);
  apply(object.__liaDgsCircleLabel);
  if (isDgsSlider(object)) {
    apply(object.baseline);
    apply(object.highline);
    apply(object.point1);
    apply(object.point2);
  }
  if (isDgsPolygon(object) && Array.isArray(object.borders)) object.borders.forEach(apply);
  getDgsStrokeCapSegments(object).forEach(apply);
  getDgsStrokeCapPoints(object).forEach(apply);
  try { if (object.board && typeof object.board.fullUpdate === 'function') object.board.fullUpdate(); } catch (e) {
    try { if (object.board && typeof object.board.update === 'function') object.board.update(); } catch (e2) {}
  }
  return layer;
}

function setDgsObjectNameVisible(object: any, visible: boolean): void {
  if (!object) return;
  object.__liaDgsShowName = visible;
  setDgsAnalysisPointEntryOption(object, 'explicitNameVisibility', visible);
  if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
  else refreshDgsObjectLabel(object);
}

function getDgsObjectOpacity(object: any): number {
  const fallback = isDgsPolygon(object) ? 0.22 : ((isDgsCircle(object) || isDgsSector(object)) ? 0.2 : 1);
  const value = Number(object && object.__liaDgsOpacity);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function applyDgsObjectOpacity(object: any): void {
  if (!object) return;
  const visible = object.__liaDgsShowObject !== false;
  const opacity = visible ? getDgsObjectOpacity(object) : 0;
  if (isDgsSlider(object)) {
    [object, object.baseline, object.highline, object.point1, object.point2].forEach((part: any) => {
      try {
        if (part && typeof part.setAttribute === 'function') part.setAttribute({
          visible,
          strokeOpacity: opacity,
          fillOpacity: opacity,
          highlightStrokeOpacity: opacity,
          highlightFillOpacity: opacity
        });
      } catch (e) {}
    });
    try {
      if (object.label && typeof object.label.setAttribute === 'function') {
        object.label.setAttribute({ visible: visible && object.__liaDgsShowName !== false, strokeOpacity: opacity, fillOpacity: opacity });
      }
    } catch (e) {}
    return;
  }
  const polygon = isDgsPolygon(object);
  const outlinedShape = polygon || isDgsCircle(object) || isDgsSector(object);

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
      !!(dgsMayDisplayObjectValues(object) &&
        (object.__liaDgsShowArea || object.__liaDgsShowPerimeter))
    );
    try { object.__liaDgsMeasurementLabel.setAttribute({ visible: labelVisible, strokeOpacity: labelVisible ? 1 : 0, fillOpacity: labelVisible ? 1 : 0 }); } catch (e) {}
  }
  if (isDgsStrokeStyleTarget(object)) applyDgsStrokeHelperAppearance(object);
}

function setDgsObjectOpacity(object: any, opacity: number): void {
  if (!object || !Number.isFinite(opacity)) return;
  object.__liaDgsOpacity = Math.max(0, Math.min(1, opacity));
  applyDgsObjectOpacity(object);
}

function setDgsObjectVisible(object: any, visible: boolean): void {
  if (!object) return;
  object.__liaDgsShowObject = visible;
  setDgsAnalysisPointEntryOption(object, 'explicitObjectVisibility', visible);
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

function getDgsObjectColor(object: any, kind: 'text' | 'line' | 'fill' | 'trace' = 'line'): string {
  if (kind === 'trace') return getDgsPointTraceColor(object);
  const key = kind === 'text' ? '__liaDgsTextColor' : (kind === 'fill' ? '__liaDgsFillColor' : '__liaDgsLineColor');
  return normalizeHexColor(object && object[key]) || normalizeHexColor(object && object.__liaDgsColor) || '#ff00ff';
}

function setDgsObjectColor(object: any, kind: 'text' | 'line' | 'fill' | 'trace', colorValue: unknown): string | null {
  const color = normalizeHexColor(colorValue);
  if (!object || !color) return null;
  if (kind === 'trace') {
    if (!isDgsPoint(object)) return null;
    object.__liaDgsTraceColor = color;
    getDgsPointTraceMarkers(object).forEach((marker: any) => {
      try { marker.setAttribute({ strokeColor: color, fillColor: color }); } catch (e) {}
    });
    return color;
  }
  if (kind === 'text') object.__liaDgsTextColor = color;
  else if (kind === 'fill') object.__liaDgsFillColor = color;
  else object.__liaDgsLineColor = color;

  if (kind === 'line') {
    try { object.setAttribute({ strokeColor: color, highlightStrokeColor: color }); } catch (e) {}
    if (isDgsSlider(object)) {
      [object.baseline, object.highline, object.point1, object.point2].forEach((part: any) => {
        try { if (part) part.setAttribute({ strokeColor: color, highlightStrokeColor: color }); } catch (e) {}
      });
    }
  } else if (kind === 'fill') {
    try { object.setAttribute({ fillColor: color, highlightFillColor: color }); } catch (e) {}
    if (isDgsSlider(object)) {
      [object, object.point1, object.point2].forEach((part: any) => {
        try { if (part) part.setAttribute({ fillColor: color, highlightFillColor: color }); } catch (e) {}
      });
    }
  } else {
    try {
      if (object.label && typeof object.label.setAttribute === 'function') {
        object.label.setAttribute({ strokeColor: color, fillColor: color });
      }
    } catch (e) {}
    if (isDgsText(object)) {
      try { object.setAttribute({ strokeColor: color, highlightStrokeColor: color }); } catch (e) {}
    }
  }
  if (isDgsAngle(object) && (kind === 'line' || kind === 'fill')) {
    if (kind === 'line' && object.arc) {
      try {
        object.arc.setAttribute({ strokeColor: color, highlightStrokeColor: color });
      } catch (e) {}
    }
    syncDgsRightAngleStyle(object);
  }
  if (isDgsAngle(object) && object.dot && (kind === 'line' || kind === 'fill')) {
    try {
      object.dot.setAttribute({
        strokeColor: color,
        fillColor: color,
        highlightStrokeColor: color,
        highlightFillColor: color
      });
    } catch (e) {}
  }

  if (kind === 'line' && isDgsPolygon(object) && Array.isArray(object.borders)) {
    object.borders.forEach((border: any) => {
      try { border.setAttribute({ strokeColor: color, highlightStrokeColor: color }); } catch (e) {}
    });
  }
  if (kind === 'line' && isDgsStrokeStyleTarget(object)) {
    applyDgsStrokeHelperAppearance(object);
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

function getDgsFontCandidates(object: any): any[] {
  const candidates = [
    object && object.label,
    object && object.__liaDgsMeasurementLabel,
    object && object.__liaDgsAngleLabel,
    object && object.__liaDgsCircleLabel,
    object && object.__liaDgsFunctionLabel
  ];
  return candidates.filter((candidate, index) =>
    !!candidate && candidates.indexOf(candidate) === index
  );
}

function readDgsFontSizeValue(value: any): number {
  try {
    const resolved = typeof value === 'function' ? value() : value;
    const number = Number(resolved);
    return Number.isFinite(number) ? number : NaN;
  } catch (e) {
    return NaN;
  }
}

function getDgsFormatFontSize(object: any): number {
  const stored = readDgsFontSizeValue(object && object.__liaDgsFormatFontSize);
  if (Number.isFinite(stored)) return Math.max(8, Math.min(96, stored));
  if (isDgsText(object)) return clampDgsTextFontSize(object.__liaDgsTextFontSize);
  for (const candidate of getDgsFontCandidates(object)) {
    let size = NaN;
    try { size = readDgsFontSizeValue(candidate.getAttribute?.('fontSize')); } catch (e) {}
    if (!Number.isFinite(size)) size = readDgsFontSizeValue(candidate.visProp && candidate.visProp.fontsize);
    if (!Number.isFinite(size)) size = readDgsFontSizeValue(candidate.visPropCalc && candidate.visPropCalc.fontsize);
    if (!Number.isFinite(size)) {
      try { size = parseFloat(String(candidate.rendNode && candidate.rendNode.style.fontSize || '')); } catch (e) {}
    }
    if (Number.isFinite(size)) return Math.max(8, Math.min(96, size));
  }
  return 18;
}

function setDgsFormatFontSize(state: DgsState, object: any, value: unknown): number {
  const number = Number(value);
  const size = Math.max(8, Math.min(96, Number.isFinite(number) ? number : 18));
  if (!object) return size;
  object.__liaDgsFormatFontSize = size;
  if (isDgsText(object)) {
    object.__liaDgsTextFontSize = clampDgsTextFontSize(size);
    try { object.setAttribute({ fontSize: object.__liaDgsTextFontSize }); } catch (e) {}
  }
  getDgsFontCandidates(object).forEach((candidate) => {
    try { candidate.setAttribute?.({ fontSize: size }); } catch (e) {}
    try {
      if (candidate.rendNode) candidate.rendNode.style.fontSize = size.toFixed(2) + 'px';
    } catch (e) {}
  });
  if (isDgsSlider(object)) refreshDgsSliderTypography(state);
  return size;
}

function copyDgsObjectFormat(state: DgsState, source: any, target: any): boolean {
  if (!isDgsObjectListEntry(source) || !isDgsObjectListEntry(target) || source === target) return false;
  setDgsObjectColor(target, 'line', getDgsObjectColor(source, 'line'));
  setDgsObjectColor(target, 'fill', getDgsObjectColor(source, 'fill'));
  setDgsObjectColor(target, 'text', getDgsObjectColor(source, 'text'));
  if (isDgsPoint(source) && isDgsPoint(target)) {
    setDgsObjectColor(target, 'trace', getDgsObjectColor(source, 'trace'));
  }
  if (isDgsLineStyleTarget(source) && isDgsLineStyleTarget(target)) {
    applyDgsLineStyle(state, target, getDgsLineStyle(source), false);
  }
  setDgsFormatFontSize(state, target, getDgsFormatFontSize(source));
  refreshDgsObjectLabel(target);
  refreshSideMenusForObject(target);
  try { state.board?.update?.(); } catch (e) {}
  persistDgsConstruction(state);
  return true;
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return '';
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return normalized.toFixed(6).replace(/\.?0+$/, '');
}

const DGS_TRACE_SPACING_PX = 16;
const DGS_TRACE_MAX_MARKERS = 5000;

function getDgsPointTraceColor(point: any): string {
  return normalizeHexColor(point && point.__liaDgsTraceColor) || '#ff00ff';
}

function getDgsPointTraceMarkers(point: any): any[] {
  if (!point) return [];
  if (!Array.isArray(point.__liaDgsTraceMarkers)) point.__liaDgsTraceMarkers = [];
  return point.__liaDgsTraceMarkers;
}

function updateDgsTraceControls(state: DgsState, point: any): void {
  if (!state || state.contextObject !== point) return;
  const hasTrace = getDgsPointTraceMarkers(point).length > 0;
  state.clearTraceButton.hidden = !hasTrace;
  state.clearTraceButton.tabIndex = state.sideMenuOpen && hasTrace ? 0 : -1;
  const traceIndex = state.colorButtons.indexOf(state.traceColorButton);
  if (traceIndex >= 0) state.colorPreviews[traceIndex].style.background = getDgsPointTraceColor(point);
}

function createDgsTraceMarker(state: DgsState, point: any, x: number, y: number): any | null {
  if (!state.board || !point || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const color = getDgsPointTraceColor(point);
  let marker: any = null;
  const wasRecording = !!point.__liaDgsTraceRecording;
  point.__liaDgsTraceRecording = true;
  try {
    marker = state.board.create('point', [x, y], {
      name: '',
      withLabel: false,
      face: 'x',
      size: 3,
      strokeWidth: 1.4,
      strokeColor: color,
      fillColor: color,
      highlight: false,
      fixed: true,
      frozen: false,
      showInfobox: false,
      layer: Math.max(0, getDgsObjectLayer(point) - 1)
    });
    marker.__liaDgsTraceMarker = true;
    marker.__liaDgsTraceOwner = point;
    const markers = getDgsPointTraceMarkers(point);
    markers.push(marker);
    const coordinates = Array.isArray(point.__liaDgsTraceCoordinates)
      ? point.__liaDgsTraceCoordinates
      : (point.__liaDgsTraceCoordinates = []);
    coordinates.push({ x, y });
    if (markers.length > DGS_TRACE_MAX_MARKERS) {
      const oldest = markers.shift();
      coordinates.shift();
      try { if (oldest) state.board.removeObject(oldest); } catch (e) {}
    }
    updateDgsTraceControls(state, point);
    return marker;
  } catch (e) {
    try { if (marker) state.board.removeObject(marker); } catch (e2) {}
    return null;
  } finally {
    point.__liaDgsTraceRecording = wasRecording;
  }
}

function clearDgsPointTrace(state: DgsState, point: any): void {
  const markers = getDgsPointTraceMarkers(point).slice();
  point.__liaDgsTraceMarkers = [];
  point.__liaDgsTraceCoordinates = [];
  const wasRecording = !!point.__liaDgsTraceRecording;
  point.__liaDgsTraceRecording = true;
  try {
    point.__liaDgsTraceCursor = { x: Number(point.X()), y: Number(point.Y()) };
  } catch (e) {
    point.__liaDgsTraceCursor = null;
  }
  try {
    markers.forEach((marker: any) => {
      try { if (state.board) state.board.removeObject(marker); } catch (e) {}
    });
  } finally {
    point.__liaDgsTraceRecording = wasRecording;
  }
  updateDgsTraceControls(state, point);
}

function seedDgsPointTrace(state: DgsState, point: any): void {
  let x = NaN;
  let y = NaN;
  try { x = Number(point.X()); y = Number(point.Y()); } catch (e) {}
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  point.__liaDgsTraceCursor = { x, y };
  const markers = getDgsPointTraceMarkers(point);
  const last = markers[markers.length - 1];
  if (last) {
    try {
      const dx = (Number(last.X()) - x) * Number(state.board.unitX || 1);
      const dy = (Number(last.Y()) - y) * Number(state.board.unitY || 1);
      if (Math.hypot(dx, dy) < 1) return;
    } catch (e) {}
  }
  createDgsTraceMarker(state, point, x, y);
}

function setDgsPointTraceEnabled(state: DgsState, point: any, enabled: boolean): void {
  if (!isDgsPoint(point)) return;
  point.__liaDgsTraceEnabled = enabled;
  if (enabled) seedDgsPointTrace(state, point);
  else point.__liaDgsTraceCursor = null;
  updateDgsTraceControls(state, point);
}

function recordDgsPointTraceMotion(state: DgsState, point: any): boolean {
  if (!isDgsPoint(point) || !point.__liaDgsTraceEnabled || point.__liaDgsTraceRecording || state.restoring) return false;
  let currentX = NaN;
  let currentY = NaN;
  try { currentX = Number(point.X()); currentY = Number(point.Y()); } catch (e) {}
  if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) return false;
  let cursor = point.__liaDgsTraceCursor;
  if (!cursor || !Number.isFinite(Number(cursor.x)) || !Number.isFinite(Number(cursor.y))) {
    seedDgsPointTrace(state, point);
    return true;
  }
  let fromX = Number(cursor.x);
  let fromY = Number(cursor.y);
  let created = false;
  const unitX = Math.max(1e-9, Math.abs(Number(state.board && state.board.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(state.board && state.board.unitY) || 1));
  for (let guard = 0; guard < 1000; guard += 1) {
    const dx = currentX - fromX;
    const dy = currentY - fromY;
    const distancePx = Math.hypot(dx * unitX, dy * unitY);
    if (!Number.isFinite(distancePx) || distancePx < DGS_TRACE_SPACING_PX) break;
    const ratio = DGS_TRACE_SPACING_PX / distancePx;
    fromX += dx * ratio;
    fromY += dy * ratio;
    point.__liaDgsTraceCursor = { x: fromX, y: fromY };
    if (createDgsTraceMarker(state, point, fromX, fromY)) created = true;
  }
  point.__liaDgsTraceCursor = { x: fromX, y: fromY };
  return created;
}

function recordAllDgsPointTraces(state: DgsState): boolean {
  let created = false;
  getDgsBoardObjects(state.board).forEach((object) => {
    if (isDgsPoint(object) && object.__liaDgsTraceEnabled) {
      created = recordDgsPointTraceMotion(state, object) || created;
    }
  });
  return created;
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
  const expressions = point.__liaDgsCoordinateExpressions;
  if (document.activeElement !== state.xCoordinateInput) {
    state.xCoordinateInput.value = expressions ? String(expressions.x || '') : formatCoordinate(x);
  }
  if (document.activeElement !== state.yCoordinateInput) {
    state.yCoordinateInput.value = expressions ? String(expressions.y || '') : formatCoordinate(y);
  }
}

function refreshSideMenusForObject(object: any): void {
  Object.keys(states).forEach((uid) => {
    const state = states[uid];
    if (!state) return;
    if (state.contextObject === object) refreshSideMenuCoordinates(state);
    refreshDgsObjectList(state);
  });
}

function parseNumericCoordinateInput(input: HTMLInputElement): number | null {
  const raw = String(input.value || '').trim();
  const value = Number(raw.replace(',', '.'));
  const valid = raw !== '' && Number.isFinite(value);
  return valid ? value : null;
}

function compileDgsCoordinateInput(
  state: DgsState,
  input: HTMLInputElement
): { raw: string; fn: (x: number) => number } | null {
  const raw = String(input.value || '').trim();
  if (!raw) {
    input.setAttribute('aria-invalid', 'true');
    return null;
  }
  try {
    const compiled = compileDgsExpression(state, raw);
    const valid = !!compiled.fn && !!compiled.normalized;
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    return valid ? { raw, fn: compiled.fn! } : null;
  } catch (e) {
    input.setAttribute('aria-invalid', 'true');
    return null;
  }
}

function updateDgsCoordinatePointState(state: DgsState, point: any): void {
  try {
    if (!window.__pointStates || !window.__pointStates[state.boardId]) return;
    window.__pointStates[state.boardId][String(point.__liaDgsPointName || '')] = {
      x: Number(point.X()),
      y: Number(point.Y()),
      fixed: getDgsObjectFixed(point)
    };
  } catch (e) {}
}

function compileStoredDgsCoordinateExpressions(state: DgsState, point: any): boolean {
  const expressions = point && point.__liaDgsCoordinateExpressions;
  if (!expressions) return false;
  try {
    const xCompiled = compileDgsExpression(state, expressions.x);
    const yCompiled = compileDgsExpression(state, expressions.y);
    if (!xCompiled.fn || !yCompiled.fn) return false;
    point.__liaDgsCoordinateCompiled = { x: xCompiled.fn, y: yCompiled.fn };
    return true;
  } catch (e) {
    point.__liaDgsCoordinateCompiled = null;
    return false;
  }
}

function syncDgsCoordinatePoint(state: DgsState, point: any): boolean {
  if (!point || point.__liaDgsCoordinateSyncing || !point.__liaDgsCoordinateExpressions) return false;
  let compiled = point.__liaDgsCoordinateCompiled;
  if (!compiled && !compileStoredDgsCoordinateExpressions(state, point)) return false;
  compiled = point.__liaDgsCoordinateCompiled;
  let parameter = Number(point.__liaDgsCoordinateParameter);
  if (!Number.isFinite(parameter)) {
    try { parameter = Number(point.X()); } catch (e) { return false; }
  }
  let x = NaN;
  let y = NaN;
  try {
    x = Number(compiled.x(parameter));
    y = Number(compiled.y(parameter));
  } catch (e) {}
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  let currentX = NaN;
  let currentY = NaN;
  try { currentX = Number(point.X()); currentY = Number(point.Y()); } catch (e) {}
  const moved = !Number.isFinite(currentX) || !Number.isFinite(currentY) ||
    Math.abs(currentX - x) > 1e-10 || Math.abs(currentY - y) > 1e-10;
  if (moved) {
    point.__liaDgsCoordinateSyncing = true;
    try { setDgsPointPosition(point, x, y); } finally { point.__liaDgsCoordinateSyncing = false; }
    translateDgsFixedCompassComponent(state, point);
  }
  updateDgsCoordinatePointState(state, point);
  if (moved) refreshSideMenusForObject(point);
  return moved;
}

function syncDgsCoordinatePoints(state: DgsState): boolean {
  if (!state || state.coordinateSyncing) return false;
  state.coordinateSyncing = true;
  let moved = false;
  try {
    getDgsBoardObjects(state.board).forEach((object) => {
      if (isDgsPoint(object) && object.__liaDgsCoordinateExpressions) {
        moved = syncDgsCoordinatePoint(state, object) || moved;
      }
    });
  } finally {
    state.coordinateSyncing = false;
  }
  return moved;
}

function scheduleDgsCoordinateSync(state: DgsState): void {
  if (!state || state.coordinateSyncRAF != null || state.coordinateSyncing) return;
  state.coordinateSyncRAF = requestAnimationFrame(() => {
    state.coordinateSyncRAF = undefined;
    const moved = syncDgsCoordinatePoints(state);
    if (!moved) return;
    try {
      state.coordinateSyncing = true;
      if (state.board && typeof state.board.update === 'function') state.board.update();
    } catch (e) {
    } finally {
      state.coordinateSyncing = false;
    }
  });
}

function applyCoordinateInputs(state: DgsState): boolean {
  const point = state.contextObject;
  if (!isDgsPoint(point)) return false;
  const numericX = parseNumericCoordinateInput(state.xCoordinateInput);
  const numericY = parseNumericCoordinateInput(state.yCoordinateInput);
  const expressionsX = compileDgsCoordinateInput(state, state.xCoordinateInput);
  const expressionsY = compileDgsCoordinateInput(state, state.yCoordinateInput);
  if (!expressionsX || !expressionsY) return false;

  let parameter = Number(point.__liaDgsCoordinateParameter);
  if (!Number.isFinite(parameter)) {
    try { parameter = Number(point.X()); } catch (e) { return false; }
  }
  let x = NaN;
  let y = NaN;
  try {
    x = Number(expressionsX.fn(parameter));
    y = Number(expressionsY.fn(parameter));
  } catch (e) {}
  const validX = Number.isFinite(x);
  const validY = Number.isFinite(y);
  state.xCoordinateInput.setAttribute('aria-invalid', validX ? 'false' : 'true');
  state.yCoordinateInput.setAttribute('aria-invalid', validY ? 'false' : 'true');
  if (!validX || !validY) return false;

  if (numericX != null && numericY != null) {
    delete point.__liaDgsCoordinateExpressions;
    delete point.__liaDgsCoordinateCompiled;
    delete point.__liaDgsCoordinateParameter;
  } else {
    point.__liaDgsCoordinateExpressions = { x: expressionsX.raw, y: expressionsY.raw };
    point.__liaDgsCoordinateCompiled = { x: expressionsX.fn, y: expressionsY.fn };
    point.__liaDgsCoordinateParameter = parameter;
  }

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

  translateDgsFixedCompassComponent(state, point);
  updateDgsCoordinatePointState(state, point);
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

function deleteDgsObject(state: DgsState, object: any, recordHistory = true): void {
  if (!state.board || !object) return;
  if (object.__liaDgsPolygonBorder && object.__liaDgsPolygonBorderOwner) {
    object = object.__liaDgsPolygonBorderOwner;
  }
  const tangent = object.__liaDgsTangent ? object : object.__liaDgsTangentLine;
  if (tangent) {
    removeDgsTangent(state, tangent);
    persistDgsConstruction(state, recordHistory);
    return;
  }
  if (object.__liaDgsAnalysisConstruction) {
    removeDgsRootConstruction(state, object.__liaDgsAnalysisConstruction);
    persistDgsConstruction(state, recordHistory);
    return;
  }

  const toRemove = new Set<any>();
  const addPolygonParts = (polygon: any) => {
    if (!polygon) return;
    toRemove.add(polygon);
    const borders = polygon.__liaDgsPolygonBorders || polygon.borders || [];
    if (Array.isArray(borders)) {
      borders.forEach((border: any) => {
        if (!border) return;
        toRemove.add(border);
        if (border.__liaDgsPolygonBorderLabel) {
          toRemove.add(border.__liaDgsPolygonBorderLabel);
        }
      });
    }
    if (polygon.__liaDgsMeasurementLabel) {
      toRemove.add(polygon.__liaDgsMeasurementLabel);
    }
  };
  if (Array.isArray(object.__liaDgsIntersectionConstructions)) {
    object.__liaDgsIntersectionConstructions.slice().forEach((construction: any) => {
      removeDgsRootConstruction(state, construction, false);
    });
  }
  if (Array.isArray(object.__liaDgsTangents)) {
    object.__liaDgsTangents.slice().forEach((candidate: any) => {
      removeDgsTangent(state, candidate, false);
    });
  }
  if (isDgsPoint(object)) {
    const collectDependent = (candidate: any) => {
      if (!candidate) return;
      if ((candidate.__liaDgsSegment || candidate.__liaDgsRay || candidate.__liaDgsVector || candidate.__liaDgsLine) &&
          (candidate.point1 === object || candidate.point2 === object ||
           candidate.__liaDgsPerpendicularPoint === object || candidate.__liaDgsParallelPoint === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsArc &&
          (candidate.__liaDgsArcStartPoint === object || candidate.__liaDgsArcEndPoint === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsCompassArc &&
          (candidate.__liaDgsCompassCenterPoint === object ||
           candidate.__liaDgsCompassRadiusPoint === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsPolygon && Array.isArray(candidate.vertices) && candidate.vertices.includes(object)) {
        addPolygonParts(candidate);
      }
      if (candidate.__liaDgsAngle && Array.isArray(candidate.__liaDgsAnglePoints) &&
          candidate.__liaDgsAnglePoints.includes(object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsCircle &&
          (candidate.__liaDgsCircleCenter === object || candidate.__liaDgsCircleRadiusPoint === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsSector &&
          (candidate.__liaDgsSectorCenter === object ||
           candidate.__liaDgsSectorRadiusPoint === object ||
           candidate.__liaDgsSectorAnglePoint === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsMidpoint &&
          (candidate.__liaDgsMidpointFirst === object || candidate.__liaDgsMidpointSecond === object)) {
        toRemove.add(candidate);
      }
      if (candidate.__liaDgsAngleBisector &&
          Array.isArray(candidate.__liaDgsAngleBisectorPoints) &&
          candidate.__liaDgsAngleBisectorPoints.includes(object)) {
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
  if (isDgsPolygon(object)) addPolygonParts(object);
  else toRemove.add(object);

  // Perpendiculars and parallels depend on both their source line and their
  // through-point. Resolve this transitively for chained constructions.
  const boardObjects = getDgsBoardObjects(state.board);
  let addedDependent = true;
  while (addedDependent) {
    addedDependent = false;
    boardObjects.forEach((candidate) => {
      if (!candidate || toRemove.has(candidate)) return;
      if (candidate.__liaDgsMidpoint &&
          (toRemove.has(candidate.__liaDgsMidpointFirst) ||
           toRemove.has(candidate.__liaDgsMidpointSecond))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsAngleBisector &&
          Array.isArray(candidate.__liaDgsAngleBisectorPoints) &&
          candidate.__liaDgsAngleBisectorPoints.some((point: any) => toRemove.has(point))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if ((candidate.__liaDgsSegment || candidate.__liaDgsRay ||
           candidate.__liaDgsVector || candidate.__liaDgsLine) &&
          (toRemove.has(candidate.point1) || toRemove.has(candidate.point2) ||
           toRemove.has(candidate.__liaDgsPerpendicularPoint) ||
           toRemove.has(candidate.__liaDgsParallelPoint))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsArc &&
          (toRemove.has(candidate.__liaDgsArcStartPoint) ||
           toRemove.has(candidate.__liaDgsArcEndPoint))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsCompassArc &&
          (toRemove.has(candidate.__liaDgsCompassCenterPoint) ||
           toRemove.has(candidate.__liaDgsCompassRadiusPoint))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsPolygon && Array.isArray(candidate.vertices) &&
          candidate.vertices.some((point: any) => toRemove.has(point))) {
        addPolygonParts(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsAngle && Array.isArray(candidate.__liaDgsAnglePoints) &&
          candidate.__liaDgsAnglePoints.some((point: any) => toRemove.has(point))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsCircle &&
          (toRemove.has(candidate.__liaDgsCircleCenter) ||
           toRemove.has(candidate.__liaDgsCircleRadiusPoint))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if (candidate.__liaDgsSector &&
          (toRemove.has(candidate.__liaDgsSectorCenter) ||
           toRemove.has(candidate.__liaDgsSectorRadiusPoint) ||
           toRemove.has(candidate.__liaDgsSectorAnglePoint))) {
        toRemove.add(candidate);
        addedDependent = true;
        return;
      }
      if ((!isDgsPerpendicular(candidate) && !isDgsParallel(candidate)) || toRemove.has(candidate)) return;
      const base = isDgsPerpendicular(candidate)
        ? candidate.__liaDgsPerpendicularBase
        : candidate.__liaDgsParallelBase;
      const point = isDgsPerpendicular(candidate)
        ? candidate.__liaDgsPerpendicularPoint
        : candidate.__liaDgsParallelPoint;
      if (toRemove.has(base) || toRemove.has(point)) {
        toRemove.add(candidate);
        addedDependent = true;
      }
    });
  }
  Array.from(toRemove).forEach((candidate) => {
    if (isDgsStrokeStyleTarget(candidate)) removeDgsStrokeCaps(candidate);
    if (candidate && candidate.__liaDgsAngleBisector && candidate.__liaDgsAngleBisectorHelper) {
      toRemove.add(candidate.__liaDgsAngleBisectorHelper);
    }
    if (candidate && isDgsPoint(candidate)) {
      clearDgsPointTrace(state, candidate);
      const candidateName = String(candidate.__liaDgsPointName || '');
      try {
        const pointRegistry = window.__points && window.__points[state.boardId];
        const aliases = pointRegistry
          ? Object.keys(pointRegistry).filter((key) => pointRegistry[key] === candidate)
          : [candidateName];
        aliases.forEach((key) => {
          if (pointRegistry && pointRegistry[key] === candidate) delete pointRegistry[key];
          if (window.__pointStates && window.__pointStates[state.boardId]) {
            delete window.__pointStates[state.boardId][key];
          }
        });
      } catch (e) {}
    }
    if (candidate && Array.isArray(candidate.__liaDgsIntersectionConstructions)) {
      candidate.__liaDgsIntersectionConstructions.slice().forEach((construction: any) => {
        removeDgsRootConstruction(state, construction, false);
      });
    }
    if (candidate && Array.isArray(candidate.__liaDgsTangents)) {
      candidate.__liaDgsTangents.slice().forEach((tangent: any) => {
        removeDgsTangent(state, tangent, false);
      });
    }
    if (candidate && candidate.__liaDgsRootConstruction && !candidate.__liaDgsRootPoint) {
      removeDgsRootConstruction(state, candidate.__liaDgsRootConstruction, false);
    }
    if (candidate && candidate.__liaDgsExtremaConstruction && !candidate.__liaDgsExtremumPoint) {
      removeDgsRootConstruction(state, candidate.__liaDgsExtremaConstruction, false);
    }
    if (candidate && candidate.__liaDgsInflectionConstruction && !candidate.__liaDgsInflectionPoint) {
      removeDgsRootConstruction(state, candidate.__liaDgsInflectionConstruction, false);
    }
    if (candidate && candidate.__liaDgsYInterceptConstruction && !candidate.__liaDgsYInterceptPoint) {
      removeDgsRootConstruction(state, candidate.__liaDgsYInterceptConstruction, false);
    }
    if (candidate && candidate.__liaDgsPolygon && candidate.__liaDgsMeasurementLabel) {
      toRemove.add(candidate.__liaDgsMeasurementLabel);
    }
    if (candidate && candidate.__liaDgsAngle && candidate.__liaDgsAngleLabel) {
      toRemove.add(candidate.__liaDgsAngleLabel);
    }
    if (candidate && candidate.__liaDgsCircle && candidate.__liaDgsCircleLabel) {
      toRemove.add(candidate.__liaDgsCircleLabel);
    }
    if (candidate && candidate.__liaDgsRay && candidate.__liaDgsRayLabel) {
      toRemove.add(candidate.__liaDgsRayLabel);
    }
    if (candidate && candidate.__liaDgsArc && candidate.__liaDgsArcLabel) {
      toRemove.add(candidate.__liaDgsArcLabel);
    }
    if (candidate && candidate.__liaDgsCompassArc && candidate.__liaDgsCompassArcLabel) {
      toRemove.add(candidate.__liaDgsCompassArcLabel);
    }
    if (candidate && candidate.__liaDgsFunction && candidate.__liaDgsFunctionLabel) {
      toRemove.add(candidate.__liaDgsFunctionLabel);
    }
    if (isDgsSlider(candidate)) {
      candidate.__liaDgsSliderDeleted = true;
      [candidate.baseline, candidate.highline, candidate.point1, candidate.point2, candidate.label]
        .forEach((part: any) => { if (part) toRemove.add(part); });
    }
  });

  Object.keys(states).forEach((uid) => {
    const current = states[uid];
    if (!current) return;
    if (current.selectedSegmentPoint === object) setSelectedSegmentPoint(current, null);
    if ((current.selectedRelationLine && toRemove.has(current.selectedRelationLine)) ||
        (current.selectedRelationPoint && toRemove.has(current.selectedRelationPoint))) {
      setSelectedRelationInputs(current, null, null);
    }
    if (current.selectedMidpointPoint && toRemove.has(current.selectedMidpointPoint)) {
      setSelectedMidpointPoint(current, null);
    }
    if (current.selectedBisectorPoints.some((point) => toRemove.has(point))) {
      setSelectedBisectorPoints(current, []);
    }
    if (current.selectedIntersectionObject && toRemove.has(current.selectedIntersectionObject)) {
      setSelectedIntersectionObject(current, null);
    }
    if (current.selectedPolygonPoints.includes(object)) setSelectedPolygonPoints(current, []);
    if (current.selectedAnglePoints.includes(object)) setSelectedAnglePoints(current, []);
    if (current.selectedSectorPoints.includes(object)) setSelectedSectorPoints(current, []);
    if (current.selectedCircleCenter === object) clearDgsCirclePreview(current);
    if ((current.selectedCompassCenter && toRemove.has(current.selectedCompassCenter)) ||
        (current.selectedCompassPoint && toRemove.has(current.selectedCompassPoint)) ||
        (current.compassPreview && toRemove.has(current.compassPreview))) {
      clearDgsCompassInteraction(current, true);
    }
    if (current.contextObject && toRemove.has(current.contextObject)) setSideMenuOpen(current, false);
  });

  toRemove.forEach((candidate) => {
    try { state.board.removeObject(candidate); } catch (e) {}
  });
  try { if (typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  try { if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances(); } catch (e) {}
  try { if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas(); } catch (e) {}
  persistDgsConstruction(state, recordHistory);
}

function getDgsStateForBoard(boardId: string): DgsState | null {
  const board = window.__boards && window.__boards[boardId];
  return Object.keys(states)
    .map((uid) => states[uid])
    .find((state) => !!state && state.boardId === boardId && state.board === board) || null;
}

function normalizeDgsInstrumentKind(value: unknown): DgsInstrumentKind | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'compass') return 'compass';
  if (normalized === 'set-square' || normalized === 'setsquare') return 'set-square';
  return null;
}

function getDgsInstrumentControllerUid(boardId: string): string {
  const safeId = String(boardId || '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'board';
  let hash = 2166136261;
  for (let index = 0; index < boardId.length; index += 1) {
    hash ^= boardId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'instrument-' + safeId + '-' + (hash >>> 0).toString(36);
}

function findDgsMacroAnchorForBoard(boardId: string): {
  uid: string;
  spec: string;
  language?: string;
} | null {
  const anchors = document.querySelectorAll<HTMLElement>('[id^=dgs-ui-][data-spec]:not([data-lia-static-claimed])');
  let owner: { uid: string; spec: string; language?: string } | null = null;
  for (const anchor of Array.from(anchors)) {
    const match = String(anchor.id || '').match(/^dgs-ui-(.+)$/);
    if (!match) continue;
    const spec = String(anchor.dataset.spec || '').trim();
    if (parseDgsMacroSpec(spec).boardId !== boardId) continue;
    // bootstrapDGS historically applies matching macros in DOM order, so the
    // last authored @DGS is the canonical owner when a board is targeted more
    // than once. Reconciliation must select the same owner.
    owner = { uid: match[1], spec, language: anchor.dataset.language };
  }
  return owner;
}

function pruneDgsRegressionRequests(): void {
  Object.keys(dgsRegressionRequests).forEach((uid) => {
    const request = dgsRegressionRequests[uid];
    if (
      !request.anchor.isConnected ||
      isStaticDgsTarget(request.boardId, request.anchor)
    ) delete dgsRegressionRequests[uid];
  });
}

function getDgsRegressionRequestsForBoard(boardId: string): DgsRegressionRequest[] {
  pruneDgsRegressionRequests();
  return Object.keys(dgsRegressionRequests)
    .map((uid) => dgsRegressionRequests[uid])
    .filter((request) => request.boardId === boardId);
}

function pruneDgsInstrumentRequests(): void {
  Object.keys(dgsInstrumentRequests).forEach((uid) => {
    const request = dgsInstrumentRequests[uid];
    if (
      (request.anchor && !request.anchor.isConnected) ||
      isStaticDgsTarget(request.boardId, request.anchor)
    ) delete dgsInstrumentRequests[uid];
  });
}

function syncDgsInstrumentProfile(boardId: string): void {
  const boardContainer = getBoardContainer(boardId);
  if (!boardContainer) return;

  pruneDgsInstrumentRequests();
  const hasRegressionDgs = getDgsRegressionRequestsForBoard(boardId).length > 0;
  const hasFullDgs = !!findDgsMacroAnchorForBoard(boardId);
  const requestedToolIds = new Set<number>();
  if (!hasFullDgs) {
    Object.keys(dgsInstrumentRequests)
      .map((uid) => dgsInstrumentRequests[uid])
      .filter((request) => request.boardId === boardId)
      .forEach((request) => {
        requestedToolIds.add(
          request.kind === 'set-square'
            ? DGS_TOOL_IDS.setSquare
            : DGS_TOOL_IDS.compass
        );
      });
  }

  if (hasFullDgs) {
    delete boardContainer.dataset.liaDgsInstrumentTools;
  } else if (!requestedToolIds.size) {
    if (hasRegressionDgs || 'liaDgsInstrumentTools' in boardContainer.dataset) {
      boardContainer.dataset.liaDgsInstrumentTools = '0';
    }
  } else {
    boardContainer.dataset.liaDgsInstrumentTools =
      Array.from(requestedToolIds).sort((a, b) => a - b).join(',');
  }

  const state = getDgsStateForBoard(boardId);
  if (!state) return;
  applyDgsToolAvailability(state);
  if (hasFullDgs) return;
  if (!requestedToolIds.has(DGS_TOOL_IDS.setSquare) && state.setSquareVisible) {
    setDgsSetSquareVisible(state, false);
  }
  if (!requestedToolIds.has(DGS_TOOL_IDS.compass) &&
      (state.activeTool === 'compass' || state.compassRadiusDialogOpen)) {
    setActiveTool(state, '', false);
  }
}

function getDgsRegressionControllerUid(boardId: string): string {
  return getDgsInstrumentControllerUid(boardId).replace(/^instrument-/, 'regression-');
}

function syncDgsRegressionController(boardId: string, fallbackLanguage?: string): boolean {
  const requests = getDgsRegressionRequestsForBoard(boardId);
  if (!requests.length) return false;

  const dgsMacro = findDgsMacroAnchorForBoard(boardId);
  const requestLanguage = requests[requests.length - 1]?.language || fallbackLanguage;
  const controller = resolveRegressionDgsController(
    boardId,
    getDgsRegressionControllerUid(boardId),
    requestLanguage,
    dgsMacro
  );

  // The instrument profile is separate because set square and compass are
  // permanent in a normal DGS. In the implicit regression shell neither is
  // shown unless its own @SetSquare/@Compass macro requests it.
  syncDgsInstrumentProfile(boardId);
  setupDGS(controller.uid, controller.spec, controller.language);
  return true;
}

function setupDGSRegression(uid: string, spec: string, languageCode?: string): void {
  const boardId = parseDgsMacroSpec(spec).boardId;
  if (!uid || !boardId) return;

  const anchor = document.getElementById('regression-ui-' + uid) as HTMLElement | null;
  // DGS itself creates an anchorless regression instance. Accepting only real
  // anchors prevents DGS -> Regression -> DGS recursion and establishes clear
  // authored ownership.
  if (!anchor) return;
  if (isStaticDgsTarget(boardId, anchor)) {
    delete dgsRegressionRequests[uid];
    return;
  }

  dgsRegressionRequests[uid] = {
    uid,
    boardId,
    language: languageCode || anchor.dataset.language,
    anchor
  };
  syncDgsRegressionController(boardId, languageCode);
}

function applyDgsInstrumentRequests(boardId: string): boolean {
  const state = getDgsStateForBoard(boardId);
  if (!state) return false;

  pruneDgsInstrumentRequests();
  const pending = Object.keys(dgsInstrumentRequests)
    .map((uid) => dgsInstrumentRequests[uid])
    .filter((request) =>
      request.boardId === boardId &&
      request.appliedState !== state
    );
  if (!pending.length) return true;

  setMenuOpen(state, true);
  if (pending.some((request) => request.kind === 'set-square')) {
    setDgsSetSquareVisible(state, true);
  }
  if (pending.some((request) => request.kind === 'compass')) {
    setActiveTool(state, '', false);
    state.compassMode = 'free';
    const compassToolIcon = state.compassToolButton.querySelector('svg');
    if (compassToolIcon) {
      state.compassButton.replaceChildren(compassToolIcon.cloneNode(true));
    }
    setCompassRadiusDialogOpen(state, false);
    setCompassSubmenuOpen(state, false);
    setActiveTool(state, 'compass');
  }
  pending.forEach((request) => { request.appliedState = state; });
  return true;
}

function setupDGSInstrument(
  uid: string,
  spec: string,
  kindValue: unknown,
  languageCode?: string
): void {
  const kind = normalizeDgsInstrumentKind(kindValue);
  const boardId = parseDgsMacroSpec(spec).boardId;
  if (!uid || !boardId || !kind) return;

  const anchor = document.getElementById('dgs-instrument-ui-' + uid) as HTMLElement | null;
  if (isStaticDgsTarget(boardId, anchor)) {
    delete dgsInstrumentRequests[uid];
    return;
  }
  const previous = dgsInstrumentRequests[uid];
  const requestChanged =
    !previous ||
    previous.boardId !== boardId ||
    previous.kind !== kind ||
    previous.anchor !== anchor;
  dgsInstrumentRequests[uid] = {
    uid,
    boardId,
    kind,
    language: languageCode,
    anchor,
    appliedState: requestChanged ? null : previous.appliedState
  };
  syncDgsInstrumentProfile(boardId);

  const existing = getDgsStateForBoard(boardId);
  if (existing) {
    applyDgsInstrumentRequests(boardId);
    return;
  }

  const dgsMacro = findDgsMacroAnchorForBoard(boardId);
  const controllerUid = dgsMacro?.uid || getDgsInstrumentControllerUid(boardId);
  const controllerSpec = dgsMacro?.spec || (boardId + ';tools=[0]');
  setupDGS(controllerUid, controllerSpec, dgsMacro?.language || languageCode);
  applyDgsInstrumentRequests(boardId);
}

window.__beginDgsErase = function(boardId: string): void {
  const state = getDgsStateForBoard(boardId);
  if (!state) return;
  if (dgsPendingHistoryBefore[boardId]) persistDgsConstruction(state, true);
};

window.__eraseDgsAtClientPoint = function(
  boardId: string,
  clientX: number,
  clientY: number
): boolean {
  const state = getDgsStateForBoard(boardId);
  if (!state || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
  const object = findDgsContextObject(state, { clientX, clientY } as MouseEvent);
  if (!object) return false;
  deleteDgsObject(state, object, false);
  return true;
};

window.__finishDgsErase = function(boardId: string): void {
  const state = getDgsStateForBoard(boardId);
  if (!state || !dgsPendingHistoryBefore[boardId]) return;
  persistDgsConstruction(state, true);
};

function updateAxisSideMenuControls(state: DgsState, axis: any, key: 'x' | 'y'): void {
  const text = dgsText(state.language);
  const labels = getDgsAxisLabels(state);
  const entry = labels[key];
  setColorPopupOpen(state, false);
  state.contextObject = axis;
  state.sideMenuObjectType.textContent = key === 'x' ? text.xAxis : text.yAxis;
  state.sideMenuNameInput.hidden = true;
  state.axisLabelSection.hidden = false;
  state.axisVariableInput.value = entry.variable;
  state.axisVariableInput.setAttribute('aria-invalid', 'false');
  state.axisDescriptionInput.value = entry.description;
  state.axisDescriptionInput.setAttribute('aria-invalid', 'false');
  state.coordinateSection.hidden = true;
  state.angleMeasureSection.hidden = true;
  state.arcSettingsSection.hidden = true;
  state.strokeStyleSection.hidden = true;
  state.functionExpressionSection.hidden = true;
  state.sliderSettingsSection.hidden = true;
  state.textFontSizeSection.hidden = true;
  state.fixedOption.hidden = true;
  state.fixedCheckbox.disabled = true;
  state.traceOption.hidden = true;
  state.traceCheckbox.disabled = true;
  state.clearTraceButton.hidden = true;
  state.nameOption.hidden = true;
  state.objectOption.hidden = true;
  state.measurementOption.hidden = true;
  state.areaOption.hidden = true;
  state.perimeterOption.hidden = true;
  state.colorSection.hidden = true;
  state.traceColorButton.hidden = true;
  state.layerRow.hidden = true;
  state.deleteButton.hidden = true;
  resetDeleteButton(state);
}

function applyDgsSideMenuRestrictions(state: DgsState, object: any): void {
  const propertiesMode = getDgsObjectPropertiesMode(state);
  const valueControlsLocked = hasDgsRestriction(
    state,
    DGS_RESTRICTION_IDS.valueControlsLocked
  );

  if (valueControlsLocked || propertiesMode === 'colors-trace') {
    state.measurementOption.hidden = true;
    state.measurementCheckbox.disabled = true;
    state.areaOption.hidden = true;
    state.areaCheckbox.disabled = true;
    state.perimeterOption.hidden = true;
    state.perimeterCheckbox.disabled = true;
  }

  if (propertiesMode !== 'colors-trace') return;

  const point = isDgsPoint(object);
  state.sideMenuNameInput.hidden = true;
  state.coordinateSection.hidden = true;
  state.angleMeasureSection.hidden = true;
  state.arcSettingsSection.hidden = true;
  state.strokeStyleSection.hidden = true;
  state.functionExpressionSection.hidden = true;
  state.sliderSettingsSection.hidden = true;
  state.textFontSizeSection.hidden = true;
  state.axisLabelSection.hidden = true;
  state.fixedOption.hidden = true;
  state.fixedCheckbox.disabled = true;
  state.nameOption.hidden = true;
  state.nameCheckbox.disabled = true;
  state.objectOption.hidden = true;
  state.objectCheckbox.disabled = true;
  state.layerRow.hidden = true;
  state.deleteButton.hidden = true;
  state.traceOption.hidden = !point;
  state.traceCheckbox.disabled = !point;
  state.traceColorButton.hidden = !point;
  state.clearTraceButton.hidden = !point || getDgsPointTraceMarkers(object).length === 0;
  state.colorSection.hidden = false;
  resetDeleteButton(state);
}

function updateSideMenuControls(state: DgsState, object: any): void {
  const text = dgsText(state.language);
  const axisKey = getDgsAxisKey(state, object);
  if (axisKey) {
    updateAxisSideMenuControls(state, object, axisKey);
    return;
  }
  state.sideMenuNameInput.hidden = false;
  state.nameCheckbox.disabled = false;
  state.objectCheckbox.disabled = false;
  state.measurementCheckbox.disabled = false;
  state.areaCheckbox.disabled = false;
  state.perimeterCheckbox.disabled = false;
  state.axisLabelSection.hidden = true;
  state.objectOption.hidden = false;
  state.colorSection.hidden = false;
  state.layerRow.hidden = false;
  state.deleteButton.hidden = false;
  const point = isDgsPoint(object);
  const midpointPoint = point && !!object.__liaDgsMidpoint;
  const rootPoint = point && !!object.__liaDgsRootPoint;
  const extremumPoint = point && !!object.__liaDgsExtremumPoint;
  const inflectionPoint = point && !!object.__liaDgsInflectionPoint;
  const yInterceptPoint = point && !!object.__liaDgsYInterceptPoint;
  const intersectionPoint = point && !!object.__liaDgsIntersectionPoint;
  const analysisPoint = rootPoint || extremumPoint || inflectionPoint || yInterceptPoint || intersectionPoint;
  const valuePoint = analysisPoint || midpointPoint;
  const ray = isDgsRay(object);
  const vector = isDgsVector(object);
  const compassArc = isDgsCompassArc(object);
  const arc = isDgsArc(object);
  const lineStyleObject = isDgsLineStyleTarget(object);
  const strokeStyleObject = isDgsSegmentStyleTarget(object) || arc;
  const line = isDgsLine(object);
  const polygon = isDgsPolygon(object);
  const angle = isDgsAngle(object);
  const circle = isDgsCircle(object);
  const sector = isDgsSector(object);
  const textObject = isDgsText(object);
  const functionObject = isDgsFunction(object);
  const sliderObject = isDgsSlider(object);
  const tangentObject = !!object.__liaDgsTangent;
  const angleBisectorObject = !!object.__liaDgsAngleBisector;
  const name = getDgsObjectName(object);
  setColorPopupOpen(state, false);
  state.contextObject = object;
  object.__liaDgsLanguage = state.language;
  if (angle) syncDgsRightAngleStyle(object);
  state.sideMenuObjectType.textContent = rootPoint ? text.root : (extremumPoint ? text.extremum : (inflectionPoint ? text.inflection : (yInterceptPoint ? text.yIntercept : (intersectionPoint ? text.intersection : (functionObject ? text.function : (sliderObject ? text.slider : (textObject ? text.text : (midpointPoint ? text.midpoint : (point ? text.point : (ray ? text.ray : (vector ? text.vector : (tangentObject ? text.tangent : (angleBisectorObject ? text.angleBisector : (line ? text.line : (polygon ? text.polygon : (circle ? text.circle : (sector ? text.sector : (angle ? text.angle : text.segment))))))))))))))))));
  if (compassArc) state.sideMenuObjectType.textContent = text.compassArc;
  else if (arc) state.sideMenuObjectType.textContent = text.arc;
  state.sideMenuNameInput.value = name;
  state.sideMenuNameInput.setAttribute('aria-invalid', 'false');
  state.sideMenuNameInput.setAttribute('aria-label', textObject ? text.textInput : (sliderObject ? text.parameterName : (state.language === 'de' ? 'Objektname' : 'Object name')));
  state.fixedCheckbox.checked = getDgsObjectFixed(object);
  state.fixedCheckboxText.textContent = sliderObject ? text.lockPosition : text.fixed;
  state.fixedOption.hidden = functionObject || analysisPoint || midpointPoint || compassArc;
  state.fixedCheckbox.disabled = functionObject || analysisPoint || midpointPoint || compassArc;
  state.traceOption.hidden = !point;
  state.traceCheckbox.disabled = !point;
  state.traceCheckbox.checked = point && !!object.__liaDgsTraceEnabled;
  state.nameCheckbox.checked = object.__liaDgsShowName !== false;
  state.nameOption.hidden = textObject;
  state.objectCheckbox.checked = object.__liaDgsShowObject !== false;
  state.objectCheckboxText.textContent = functionObject ? text.showFunction : (sliderObject ? text.showSlider : (textObject ? text.showText : (point ? text.showPoint : (ray ? text.showRay : (vector ? text.showVector : (line ? text.showLine : (polygon ? text.showPolygon : (circle ? text.showCircle : (sector ? text.showSector : (angle ? text.showAngleObject : text.showSegment))))))))));
  if (compassArc) state.objectCheckboxText.textContent = text.showCompassArc;
  else if (arc) state.objectCheckboxText.textContent = text.showArc;
  state.measurementOption.hidden = textObject || sliderObject || (point && !valuePoint) || ray || vector || compassArc || arc || polygon || circle || sector;
  state.measurementCheckbox.checked = valuePoint
    ? !!object.__liaDgsShowValue
    : (functionObject
      ? !!object.__liaDgsShowExpression
      : (line ? !!object.__liaDgsShowEquation : (angle ? !!object.__liaDgsShowAngle : !!object.__liaDgsShowLength)));
  state.measurementCheckboxText.textContent = valuePoint
    ? (midpointPoint ? text.showCoordinates : text.showValue)
    : (functionObject
      ? text.showTerm
      : (line ? text.showEquation : (angle ? text.showAngle : text.showDistance)));
  state.areaOption.hidden = !polygon && !circle && !sector;
  state.areaCheckbox.checked = (polygon || circle || sector) && !!object.__liaDgsShowArea;
  state.perimeterOption.hidden = !polygon && !circle && !sector;
  state.perimeterCheckbox.checked = (polygon || circle || sector) && !!object.__liaDgsShowPerimeter;
  state.coordinateSection.hidden = !point || analysisPoint || midpointPoint;
  state.angleMeasureSection.hidden = !(angle && object.__liaDgsMeasuredConstruction);
  state.arcSettingsSection.hidden = !arc;
  state.strokeStyleSection.hidden = !lineStyleObject;
  state.strokeDesignField.hidden = !strokeStyleObject;
  state.strokeWidthField.hidden = !strokeStyleObject;
  state.functionExpressionSection.hidden = !functionObject;
  state.sliderSettingsSection.hidden = !sliderObject;
  state.textFontSizeSection.hidden = !textObject;
  if (!state.angleMeasureSection.hidden) {
    const degrees = Number.isFinite(Number(object.__liaDgsTargetAngle))
      ? Number(object.__liaDgsTargetAngle)
      : getDgsAngleRadians(object) * 180 / Math.PI;
    state.angleMeasureInput.value = formatCoordinate(degrees);
    state.angleMeasureInput.setAttribute('aria-invalid', 'false');
  }
  if (arc) {
    state.arcExitAngleInput.value = formatCoordinate(Number(object.__liaDgsArcExitAngle));
    state.arcEntryAngleInput.value = formatCoordinate(Number(object.__liaDgsArcEntryAngle));
    state.arcExitAngleInput.setAttribute('aria-invalid', 'false');
    state.arcEntryAngleInput.setAttribute('aria-invalid', 'false');
  }
  if (lineStyleObject) {
    state.lineStyleSelect.value = getDgsLineStyle(object);
  }
  if (strokeStyleObject) {
    state.strokeDesignSelect.value = getDgsStrokeDesign(object);
    state.strokeWidthInput.value = formatCoordinate(getDgsStrokeWidth(object));
    state.strokeWidthInput.setAttribute('aria-invalid', 'false');
  }
  if (functionObject) {
    state.functionExpressionInput.value = String(object.__liaDgsFunctionExpression || '');
    state.functionExpressionInput.setAttribute('aria-invalid', 'false');
    refreshDgsFunctionExpressionPreview(state, object);
  }
  if (sliderObject) {
    state.sliderValueInput.value = formatCoordinate(getDgsSliderValue(object));
    state.sliderMinInput.value = formatCoordinate(Number(object.__liaDgsSliderMinimum));
    state.sliderMaxInput.value = formatCoordinate(Number(object.__liaDgsSliderMaximum));
    state.sliderStepInput.value = formatCoordinate(Number(object.__liaDgsSliderStep));
    [state.sliderValueInput, state.sliderMinInput, state.sliderMaxInput, state.sliderStepInput]
      .forEach((input) => input.setAttribute('aria-invalid', 'false'));
  }
  if (textObject) state.textFontSizeInput.value = String(clampDgsTextFontSize(object.__liaDgsTextFontSize));
  resetDeleteButton(state);
  if (point) refreshSideMenuCoordinates(state);
  state.fillColorButton.hidden = !polygon && !circle && !sector && !angle;
  state.lineColorButton.hidden = textObject;
  state.traceColorButton.hidden = !point;
  state.clearTraceButton.hidden = !point || getDgsPointTraceMarkers(object).length === 0;
  state.colorButtons.forEach((button, index) => {
    const kind = button.dataset.colorKind as 'text' | 'line' | 'fill' | 'trace';
    state.colorPreviews[index].style.background = getDgsObjectColor(object, kind);
  });
  state.activeColorKind = 'text';
  state.opacityRow.hidden = false;
  syncColorPicker(state, getDgsObjectColor(object, state.activeColorKind));
  const opacityPercent = Math.round(getDgsObjectOpacity(object) * 100);
  state.opacityInput.value = String(opacityPercent);
  state.opacityValue.textContent = opacityPercent + '%';
  state.colorPreviews.forEach((preview, index) => {
    const kind = state.colorButtons[index].dataset.colorKind;
    preview.style.opacity = kind === 'trace'
      ? '1'
      : (polygon || circle || sector
      ? (kind === 'fill' ? String(opacityPercent / 100) : '1')
      : String(opacityPercent / 100));
  });
  state.layerInput.value = String(getDgsObjectLayer(object));
  applyDgsSideMenuRestrictions(state, object);
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
  const normalActive = state.activeTool === '' && !state.functionDialogOpen &&
    !state.compassRadiusDialogOpen && !state.externalToolActive;
  const compassActive = state.activeTool === 'compass' || state.compassRadiusDialogOpen;
  const formatActive = state.activeTool === 'format-copy';
  const pointActive = state.activeTool === 'point';
  const segmentActive = state.activeTool === 'segment';
  const rayActive = state.activeTool === 'ray';
  const lineActive = state.activeTool === 'line';
  const vectorActive = state.activeTool === 'vector';
  const arcActive = state.activeTool === 'arc';
  const orthogonalActive = state.activeTool === 'orthogonal';
  const parallelActive = state.activeTool === 'parallel';
  const midpointActive = state.activeTool === 'midpoint';
  const angleBisectorActive = state.activeTool === 'angle-bisector';
  const polygonActive = state.activeTool === 'polygon';
  const circleActive = state.activeTool === 'circle';
  const sectorActive = state.activeTool === 'sector';
  const angleActive = state.activeTool === 'angle';
  const measuredAngleActive = state.activeTool === 'angle-measured';
  const rootsActive = state.activeTool === 'roots';
  const extremaActive = state.activeTool === 'extrema';
  const inflectionsActive = state.activeTool === 'inflections';
  const yInterceptActive = state.activeTool === 'ordinate-intercept';
  const tangentActive = state.activeTool === 'tangent';
  const intersectionActive = state.activeTool === 'intersection';
  const textActive = state.activeTool === 'text';
  state.selectButton.classList.toggle('is-active', normalActive);
  state.selectButton.setAttribute('aria-pressed', normalActive ? 'true' : 'false');
  state.setSquareButton.classList.toggle('is-active', state.setSquareVisible);
  state.setSquareButton.setAttribute('aria-pressed', state.setSquareVisible ? 'true' : 'false');
  const setSquareLabel = state.setSquareVisible ? text.hideSetSquare : text.showSetSquare;
  state.setSquareButton.setAttribute('aria-label', setSquareLabel);
  state.setSquareButton.title = setSquareLabel;
  state.compassButton.classList.toggle('is-active', compassActive);
  state.compassButton.setAttribute('aria-pressed', compassActive ? 'true' : 'false');
  const freeCompassActive = state.activeTool === 'compass' && state.compassMode === 'free';
  const fixedCompassActive = (state.activeTool === 'compass' || state.compassRadiusDialogOpen) &&
    state.compassMode === 'fixed';
  state.compassToolButton.classList.toggle('is-active', freeCompassActive);
  state.compassToolButton.setAttribute('aria-pressed', freeCompassActive ? 'true' : 'false');
  state.fixedRadiusCompassToolButton.classList.toggle('is-active', fixedCompassActive);
  state.fixedRadiusCompassToolButton.setAttribute('aria-pressed', fixedCompassActive ? 'true' : 'false');
  state.formatButton.classList.toggle('is-active', formatActive);
  state.formatButton.setAttribute('aria-pressed', formatActive ? 'true' : 'false');
  const formatLabel = formatActive && state.selectedFormatSource
    ? text.selectFormatTarget
    : text.copyFormat;
  state.formatButton.setAttribute('aria-label', formatLabel);
  state.formatButton.title = formatLabel;
  state.pointButton.classList.toggle('is-active', pointActive);
  state.pointButton.setAttribute('aria-pressed', pointActive ? 'true' : 'false');
  state.pointButton.setAttribute('aria-label', pointActive ? text.stopPoint : text.setPoint);
  state.pointButton.title = pointActive ? text.stopPoint : text.setPoint;
  state.segmentButton.classList.toggle('is-active', segmentActive || rayActive || lineActive || vectorActive || arcActive);
  state.segmentToolButton.classList.toggle('is-active', segmentActive);
  state.segmentToolButton.setAttribute('aria-pressed', segmentActive ? 'true' : 'false');
  state.rayToolButton.classList.toggle('is-active', rayActive);
  state.rayToolButton.setAttribute('aria-pressed', rayActive ? 'true' : 'false');
  state.lineToolButton.classList.toggle('is-active', lineActive);
  state.lineToolButton.setAttribute('aria-pressed', lineActive ? 'true' : 'false');
  state.vectorToolButton.classList.toggle('is-active', vectorActive);
  state.vectorToolButton.setAttribute('aria-pressed', vectorActive ? 'true' : 'false');
  if (state.arcToolButton) {
    state.arcToolButton.classList.toggle('is-active', arcActive);
    state.arcToolButton.setAttribute('aria-pressed', arcActive ? 'true' : 'false');
  }
  state.orthogonalButton.classList.toggle('is-active', orthogonalActive || parallelActive || midpointActive || angleBisectorActive);
  state.orthogonalButton.setAttribute('aria-pressed', orthogonalActive || parallelActive || midpointActive || angleBisectorActive ? 'true' : 'false');
  state.orthogonalToolButton.classList.toggle('is-active', orthogonalActive);
  state.orthogonalToolButton.setAttribute('aria-pressed', orthogonalActive ? 'true' : 'false');
  state.parallelToolButton.classList.toggle('is-active', parallelActive);
  state.parallelToolButton.setAttribute('aria-pressed', parallelActive ? 'true' : 'false');
  state.midpointToolButton.classList.toggle('is-active', midpointActive);
  state.midpointToolButton.setAttribute('aria-pressed', midpointActive ? 'true' : 'false');
  state.angleBisectorToolButton.classList.toggle('is-active', angleBisectorActive);
  state.angleBisectorToolButton.setAttribute('aria-pressed', angleBisectorActive ? 'true' : 'false');
  state.polygonButton.classList.toggle('is-active', polygonActive || circleActive || sectorActive);
  state.polygonButton.setAttribute('aria-pressed', polygonActive || circleActive || sectorActive ? 'true' : 'false');
  state.polygonToolButton.classList.toggle('is-active', polygonActive);
  state.polygonToolButton.setAttribute('aria-pressed', polygonActive ? 'true' : 'false');
  state.circleToolButton.classList.toggle('is-active', circleActive);
  state.circleToolButton.setAttribute('aria-pressed', circleActive ? 'true' : 'false');
  state.sectorToolButton.classList.toggle('is-active', sectorActive);
  state.sectorToolButton.setAttribute('aria-pressed', sectorActive ? 'true' : 'false');
  state.angleButton.classList.toggle('is-active', angleActive || measuredAngleActive);
  state.angleButton.setAttribute('aria-pressed', angleActive || measuredAngleActive ? 'true' : 'false');
  state.angleToolButton.classList.toggle('is-active', angleActive);
  state.angleToolButton.setAttribute('aria-pressed', angleActive ? 'true' : 'false');
  state.measuredAngleToolButton.classList.toggle('is-active', measuredAngleActive);
  state.measuredAngleToolButton.setAttribute('aria-pressed', measuredAngleActive ? 'true' : 'false');
  if (state.rootButton) {
    state.rootButton.classList.toggle('is-active', rootsActive || extremaActive || inflectionsActive || yInterceptActive || tangentActive || intersectionActive);
    state.rootButton.setAttribute('aria-pressed', rootsActive || extremaActive || inflectionsActive || yInterceptActive || tangentActive || intersectionActive ? 'true' : 'false');
  }
  if (state.rootToolButton) {
    state.rootToolButton.classList.toggle('is-active', rootsActive);
    state.rootToolButton.setAttribute('aria-pressed', rootsActive ? 'true' : 'false');
  }
  if (state.extremaToolButton) {
    state.extremaToolButton.classList.toggle('is-active', extremaActive);
    state.extremaToolButton.setAttribute('aria-pressed', extremaActive ? 'true' : 'false');
  }
  if (state.inflectionToolButton) {
    state.inflectionToolButton.classList.toggle('is-active', inflectionsActive);
    state.inflectionToolButton.setAttribute('aria-pressed', inflectionsActive ? 'true' : 'false');
  }
  if (state.yInterceptToolButton) {
    state.yInterceptToolButton.classList.toggle('is-active', yInterceptActive);
    state.yInterceptToolButton.setAttribute('aria-pressed', yInterceptActive ? 'true' : 'false');
  }
  if (state.tangentToolButton) {
    state.tangentToolButton.classList.toggle('is-active', tangentActive);
    state.tangentToolButton.setAttribute('aria-pressed', tangentActive ? 'true' : 'false');
  }
  if (state.intersectionToolButton) {
    state.intersectionToolButton.classList.toggle('is-active', intersectionActive);
    state.intersectionToolButton.setAttribute('aria-pressed', intersectionActive ? 'true' : 'false');
  }
  state.textButton.classList.toggle('is-active', textActive);
  state.textButton.setAttribute('aria-pressed', textActive ? 'true' : 'false');
  refreshConstructionModeCursor(state.boardContainer);
}

function getDgsActiveToolId(tool: DgsState['activeTool']): number | null {
  switch (tool) {
    case 'compass': return DGS_TOOL_IDS.compass;
    case 'format-copy': return DGS_TOOL_IDS.formatCopy;
    case 'point': return DGS_TOOL_IDS.point;
    case 'segment': return DGS_TOOL_IDS.segment;
    case 'ray': return DGS_TOOL_IDS.ray;
    case 'line': return DGS_TOOL_IDS.line;
    case 'vector': return DGS_TOOL_IDS.vector;
    case 'arc': return DGS_TOOL_IDS.arc;
    case 'orthogonal': return DGS_TOOL_IDS.orthogonal;
    case 'parallel': return DGS_TOOL_IDS.parallel;
    case 'midpoint': return DGS_TOOL_IDS.midpoint;
    case 'angle-bisector': return DGS_TOOL_IDS.angleBisector;
    case 'polygon': return DGS_TOOL_IDS.polygon;
    case 'circle': return DGS_TOOL_IDS.circle;
    case 'sector': return DGS_TOOL_IDS.sector;
    case 'angle': return DGS_TOOL_IDS.angle;
    case 'angle-measured': return DGS_TOOL_IDS.measuredAngle;
    case 'roots': return DGS_TOOL_IDS.roots;
    case 'extrema': return DGS_TOOL_IDS.extrema;
    case 'inflections': return DGS_TOOL_IDS.inflections;
    case 'ordinate-intercept': return DGS_TOOL_IDS.ordinateIntercept;
    case 'tangent': return DGS_TOOL_IDS.tangent;
    case 'intersection': return DGS_TOOL_IDS.intersection;
    case 'text': return DGS_TOOL_IDS.text;
    default: return null;
  }
}

function setActiveTool(
  state: DgsState,
  tool: '' | 'compass' | 'format-copy' | 'point' | 'segment' | 'ray' | 'line' | 'vector' | 'arc' | 'orthogonal' | 'parallel' | 'midpoint' | 'angle-bisector' | 'polygon' | 'circle' | 'sector' | 'angle' | 'angle-measured' | 'roots' | 'extrema' | 'inflections' | 'ordinate-intercept' | 'tangent' | 'intersection' | 'text',
  deactivateRegression = true
): void {
  if (state.compassSubmenuOpen) setCompassSubmenuOpen(state, false);
  const requestedToolId = getDgsActiveToolId(tool);
  if (requestedToolId != null && !isDgsToolAvailable(state, requestedToolId)) tool = '';
  if (tool !== 'compass' && state.compassRadiusDialogOpen) {
    setCompassRadiusDialogOpen(state, false);
  }
  if (tool) {
    if (state.functionDialogOpen) setFunctionDialogOpen(state, false);
    if (state.axisScaleSubmenuOpen) setAxisScaleSubmenuOpen(state, false);
    Object.keys(states).forEach((uid) => {
      const other = states[uid];
      if (!other || other === state || other.boardId !== state.boardId || !other.activeTool) return;
      setSelectedSegmentPoint(other, null);
      clearDgsCompassInteraction(other, true);
      setSelectedRelationInputs(other, null, null);
      setSelectedMidpointPoint(other, null);
      setSelectedBisectorPoints(other, []);
      setSelectedIntersectionObject(other, null);
      setSelectedFormatSource(other, null);
      setSelectedPolygonPoints(other, []);
      setSelectedAnglePoints(other, []);
      setSelectedSectorPoints(other, []);
      setAngleDialogOpen(other, false);
      setArcDialogOpen(other, false);
      setTextDialogOpen(other, false);
      clearDgsCirclePreview(other);
      other.activeTool = '';
      renderToolState(other);
    });
    if (deactivateRegression) notifyRegressionLayout(state, false);
  }

  if ((state.activeTool === 'segment' || state.activeTool === 'ray' || state.activeTool === 'line' || state.activeTool === 'vector' || state.activeTool === 'arc') &&
      tool !== state.activeTool) {
    setSelectedSegmentPoint(state, null);
  }
  if (state.activeTool === 'compass' && tool !== 'compass') {
    clearDgsCompassInteraction(state, true);
  }
  if (state.activeTool === 'arc' && tool !== 'arc') setArcDialogOpen(state, false);
  if ((state.activeTool === 'orthogonal' || state.activeTool === 'parallel') && tool !== state.activeTool) {
    setSelectedRelationInputs(state, null, null);
  }
  if (state.activeTool === 'midpoint' && tool !== 'midpoint') {
    setSelectedMidpointPoint(state, null);
  }
  if (state.activeTool === 'angle-bisector' && tool !== 'angle-bisector') {
    setSelectedBisectorPoints(state, []);
  }
  if (state.activeTool === 'intersection' && tool !== 'intersection') {
    setSelectedIntersectionObject(state, null);
  }
  if (state.activeTool === 'format-copy' && tool !== 'format-copy') {
    setSelectedFormatSource(state, null);
  }
  if (state.activeTool === 'polygon' && tool !== 'polygon') setSelectedPolygonPoints(state, []);
  if (state.activeTool === 'sector' && tool !== 'sector') setSelectedSectorPoints(state, []);
  if ((state.activeTool === 'angle' || state.activeTool === 'angle-measured') && tool !== state.activeTool) {
    setSelectedAnglePoints(state, []);
  }
  if (state.activeTool === 'angle-measured' && tool !== 'angle-measured') setAngleDialogOpen(state, false);
  if (state.activeTool === 'circle' && tool !== 'circle') clearDgsCirclePreview(state);
  if (state.activeTool === 'text' && tool !== 'text') setTextDialogOpen(state, false);
  if (tool) setExportDialogOpen(state, false);
  state.activeTool = tool;
  renderToolState(state);
}

window.__setDgsExternalToolActive = function(boardId: string, active: boolean): void {
  Object.keys(states).forEach((uid) => {
    const state = states[uid];
    if (!state || state.boardId !== boardId) return;
    if (active && state.activeTool === 'format-copy') setActiveTool(state, '', false);
    state.externalToolActive = active;
    renderToolState(state);
  });
};

function releaseRegressionControls(state: DgsState): void {
  state.menuBar
    .querySelectorAll<HTMLElement>('.lia-plot-draw-btn, .lia-plot-erase-toggle, .lia-plot-regression-toggle')
    .forEach((button) => state.boardContainer.appendChild(button));
}

function isDgsToolAvailable(state: DgsState, toolId: number): boolean {
  if (DGS_ALWAYS_AVAILABLE_TOOL_IDS.has(toolId)) {
    const instrumentProfile = String(
      state.boardContainer.dataset.liaDgsInstrumentTools || ''
    ).split(',').filter(Boolean).map(Number);
    return !instrumentProfile.length || instrumentProfile.includes(toolId);
  }
  return state.availableToolIds == null || state.availableToolIds.has(toolId);
}

function setDgsButtonTabIndex(button: HTMLButtonElement, enabled: boolean): void {
  button.tabIndex = enabled && !button.hidden && !button.disabled ? 0 : -1;
}

function applyDgsToolAvailability(state: DgsState): void {
  const setLeaf = (button: HTMLButtonElement, toolId: number): boolean => {
    const enabled = isDgsToolAvailable(state, toolId);
    button.dataset.dgsToolId = String(toolId);
    button.hidden = !enabled;
    button.disabled = !enabled;
    if (!enabled) button.tabIndex = -1;
    return enabled;
  };
  const setGroup = (
    parent: HTMLButtonElement,
    entries: Array<[HTMLButtonElement, number]>
  ): boolean => {
    const enabledEntries = entries.filter(([button, id]) => setLeaf(button, id));
    const enabled = enabledEntries.length > 0;
    parent.hidden = !enabled;
    parent.disabled = !enabled;
    parent.dataset.dgsToolGroup = entries.map(([, id]) => String(id)).join(',');
    if (enabled) {
      const currentToolId = Number(parent.dataset.dgsCurrentToolId);
      if (!enabledEntries.some(([, id]) => id === currentToolId)) {
        const [firstButton, firstId] = enabledEntries[0];
        const icon = firstButton.firstElementChild;
        if (icon) parent.innerHTML = icon.outerHTML;
        parent.dataset.dgsCurrentToolId = String(firstId);
      }
    }
    if (!enabled) parent.tabIndex = -1;
    return enabled;
  };

  const setSquareVisible = setLeaf(state.setSquareButton, DGS_TOOL_IDS.setSquare);
  const compassVisible = setLeaf(state.compassButton, DGS_TOOL_IDS.compass);
  setLeaf(state.compassToolButton, DGS_TOOL_IDS.compass);
  setLeaf(state.fixedRadiusCompassToolButton, DGS_TOOL_IDS.compass);
  const formatVisible = setLeaf(state.formatButton, DGS_TOOL_IDS.formatCopy);
  const pointVisible = setLeaf(state.pointButton, DGS_TOOL_IDS.point);
  const lineGroupVisible = setGroup(state.segmentButton, [
    [state.segmentToolButton, DGS_TOOL_IDS.segment],
    [state.rayToolButton, DGS_TOOL_IDS.ray],
    [state.lineToolButton, DGS_TOOL_IDS.line],
    [state.vectorToolButton, DGS_TOOL_IDS.vector],
    [state.arcToolButton, DGS_TOOL_IDS.arc]
  ]);
  const relationGroupVisible = setGroup(state.orthogonalButton, [
    [state.orthogonalToolButton, DGS_TOOL_IDS.orthogonal],
    [state.parallelToolButton, DGS_TOOL_IDS.parallel],
    [state.midpointToolButton, DGS_TOOL_IDS.midpoint],
    [state.angleBisectorToolButton, DGS_TOOL_IDS.angleBisector]
  ]);
  const shapeGroupVisible = setGroup(state.polygonButton, [
    [state.polygonToolButton, DGS_TOOL_IDS.polygon],
    [state.circleToolButton, DGS_TOOL_IDS.circle],
    [state.sectorToolButton, DGS_TOOL_IDS.sector]
  ]);
  const angleGroupVisible = setGroup(state.angleButton, [
    [state.angleToolButton, DGS_TOOL_IDS.angle],
    [state.measuredAngleToolButton, DGS_TOOL_IDS.measuredAngle]
  ]);
  const functionVisible = setLeaf(state.functionButton, DGS_TOOL_IDS.function);
  const analysisGroupVisible = setGroup(state.rootButton, [
    [state.rootToolButton, DGS_TOOL_IDS.roots],
    [state.extremaToolButton, DGS_TOOL_IDS.extrema],
    [state.inflectionToolButton, DGS_TOOL_IDS.inflections],
    [state.yInterceptToolButton, DGS_TOOL_IDS.ordinateIntercept],
    [state.tangentToolButton, DGS_TOOL_IDS.tangent],
    [state.intersectionToolButton, DGS_TOOL_IDS.intersection]
  ]);
  const sliderVisible = setLeaf(state.sliderButton, DGS_TOOL_IDS.slider);
  const textVisible = setLeaf(state.textButton, DGS_TOOL_IDS.text);
  const zoomVisible = setLeaf(state.zoomModeButton, DGS_TOOL_IDS.zoom);
  const axisScaleVisible = setLeaf(state.axisScaleButton, DGS_TOOL_IDS.axisScale);
  [
    state.cartesianScaleButton,
    state.logXScaleButton,
    state.logYScaleButton,
    state.logLogScaleButton
  ].forEach((button) => {
    button.hidden = !axisScaleVisible;
    button.disabled = !axisScaleVisible;
    if (!axisScaleVisible) button.tabIndex = -1;
  });

  const regressionEntries: Array<[HTMLButtonElement | null, number]> = [
    [state.menuBar.querySelector<HTMLButtonElement>('.lia-plot-draw-btn'), DGS_TOOL_IDS.regressionDraw],
    [state.menuBar.querySelector<HTMLButtonElement>('.lia-plot-erase-toggle'), DGS_TOOL_IDS.regressionErase],
    [state.menuBar.querySelector<HTMLButtonElement>('.lia-plot-regression-toggle'), DGS_TOOL_IDS.regressionTools]
  ];
  const visibleRegressionButtons: HTMLButtonElement[] = [];
  regressionEntries.forEach(([button, id]) => {
    if (!button) return;
    const enabled = isDgsToolAvailable(state, id);
    button.dataset.dgsToolId = String(id);
    button.hidden = !enabled;
    button.disabled = !enabled;
    button.tabIndex = enabled && state.open ? 0 : -1;
    if (enabled) visibleRegressionButtons.push(button);
  });

  const geometryVisible = pointVisible || lineGroupVisible || relationGroupVisible ||
    shapeGroupVisible || angleGroupVisible;
  const functionsVisible = functionVisible || analysisGroupVisible;
  const contentVisible = sliderVisible || textVisible;
  const viewVisible = zoomVisible || axisScaleVisible;

  let left = 52;
  const placeButton = (button: HTMLButtonElement, visible: boolean) => {
    if (!visible) return;
    button.style.left = left + 'px';
    button.style.top = '7.5px';
    left += 43;
  };
  const placeDivider = (divider: HTMLElement, visible: boolean) => {
    divider.hidden = !visible;
    if (!visible) return;
    divider.style.left = left + 'px';
    left += 9;
  };

  placeButton(state.selectButton, true);
  placeButton(state.setSquareButton, setSquareVisible);
  placeButton(state.compassButton, compassVisible);
  placeButton(state.formatButton, formatVisible);
  placeDivider(state.toolsDivider, geometryVisible);
  placeButton(state.pointButton, pointVisible);
  placeButton(state.segmentButton, lineGroupVisible);
  placeButton(state.orthogonalButton, relationGroupVisible);
  placeButton(state.polygonButton, shapeGroupVisible);
  placeButton(state.angleButton, angleGroupVisible);
  placeDivider(state.functionDivider, functionsVisible);
  placeButton(state.functionButton, functionVisible);
  placeButton(state.rootButton, analysisGroupVisible);

  const regressionVisible = visibleRegressionButtons.length > 0;
  state.regressionDivider.dataset.visible = regressionVisible ? '1' : '0';
  placeDivider(state.regressionDivider, regressionVisible);
  visibleRegressionButtons.forEach((button) => placeButton(button, true));

  placeDivider(state.textDivider, contentVisible);
  placeButton(state.sliderButton, sliderVisible);
  placeButton(state.textButton, textVisible);
  placeDivider(state.zoomDivider, viewVisible);
  placeButton(state.zoomModeButton, zoomVisible);
  placeButton(state.axisScaleButton, axisScaleVisible);
  state.menuScrollSpacer.style.left = (left + 97) + 'px';

  setDgsButtonTabIndex(state.selectButton, state.open);
  [
    state.setSquareButton,
    state.compassButton,
    state.formatButton,
    state.pointButton,
    state.segmentButton,
    state.orthogonalButton,
    state.polygonButton,
    state.angleButton,
    state.functionButton,
    state.rootButton,
    state.sliderButton,
    state.textButton,
    state.zoomModeButton,
    state.axisScaleButton
  ].forEach((button) => setDgsButtonTabIndex(button, state.open));
  setDgsButtonTabIndex(state.fullscreenButton, state.open);
  setDgsButtonTabIndex(state.objectListButton, state.open);

  [
    state.compassToolButton,
    state.fixedRadiusCompassToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, state.compassSubmenuOpen));
  [
    state.segmentToolButton,
    state.rayToolButton,
    state.lineToolButton,
    state.vectorToolButton,
    state.arcToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, state.geometrySubmenuOpen));
  [
    state.orthogonalToolButton,
    state.parallelToolButton,
    state.midpointToolButton,
    state.angleBisectorToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, state.relationSubmenuOpen));
  [state.polygonToolButton, state.circleToolButton, state.sectorToolButton]
    .forEach((button) => setDgsButtonTabIndex(button, state.shapeSubmenuOpen));
  [state.angleToolButton, state.measuredAngleToolButton]
    .forEach((button) => setDgsButtonTabIndex(button, state.angleSubmenuOpen));
  [
    state.rootToolButton,
    state.extremaToolButton,
    state.inflectionToolButton,
    state.yInterceptToolButton,
    state.tangentToolButton,
    state.intersectionToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, state.rootSubmenuOpen));
  [
    state.cartesianScaleButton,
    state.logXScaleButton,
    state.logYScaleButton,
    state.logLogScaleButton
  ].forEach((button) => setDgsButtonTabIndex(button, state.axisScaleSubmenuOpen));

  const boardWidth = Math.max(0, state.boardContainer.clientWidth || 0);
  const popupMaxLeft = Math.max(4, boardWidth - 196);
  const drawButton = regressionEntries[0][0];
  const toolsButton = regressionEntries[2][0];
  const drawColorMenu = state.boardContainer.querySelector<HTMLElement>('.lia-plot-color-menu:not(.lia-plot-reg-menu)');
  const regressionMenu = state.boardContainer.querySelector<HTMLElement>('.lia-plot-reg-menu');
  if (drawButton && drawColorMenu && !drawButton.hidden) {
    drawColorMenu.style.left = Math.min(parseFloat(drawButton.style.left) || 0, popupMaxLeft) + 'px';
  }
  if (toolsButton && regressionMenu && !toolsButton.hidden) {
    regressionMenu.style.left = Math.min(parseFloat(toolsButton.style.left) || 0, popupMaxLeft) + 'px';
  }
  positionOpenDgsSubmenu(state);
}

window.__refreshDgsToolAvailabilityForBoard = function(boardId: string): void {
  Object.keys(states).forEach((uid) => {
    const state = states[uid];
    if (state && state.boardId === boardId) applyDgsToolAvailability(state);
  });
};

function applyLayout(state: DgsState): void {
  const tone = getNeutralColor();
  const accent = getAccentColor();
  const menuBackground = tone === '#fff' ? '#151a1c' : '#fff';

  state.button.style.color = tone;
  state.menuBar.style.color = tone;
  state.sideMenu.style.color = tone;
  state.objectListPanel.style.color = tone;
  state.colorPopup.style.color = tone;
  state.angleDialog.style.color = tone;
  state.compassRadiusDialog.style.color = tone;
  state.arcDialog.style.color = tone;
  state.functionDialog.style.color = tone;
  state.textDialog.style.color = tone;
  state.exportDialog.style.color = tone;
  state.menuBar.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.menuBar.style.setProperty('--lia-dgs-theme-color', accent);
  state.menuBar.style.setProperty('--lia-dgs-neutral-color', tone);
  state.sideMenu.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.sideMenu.style.setProperty('--lia-dgs-theme-color', accent);
  state.objectListPanel.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.objectListPanel.style.setProperty('--lia-dgs-theme-color', accent);
  state.colorPopup.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.colorPopup.style.setProperty('--lia-dgs-theme-color', accent);
  state.angleDialog.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.angleDialog.style.setProperty('--lia-dgs-theme-color', accent);
  state.compassRadiusDialog.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.compassRadiusDialog.style.setProperty('--lia-dgs-theme-color', accent);
  state.arcDialog.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.arcDialog.style.setProperty('--lia-dgs-theme-color', accent);
  state.functionDialog.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.functionDialog.style.setProperty('--lia-dgs-theme-color', accent);
  state.textDialog.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.textDialog.style.setProperty('--lia-dgs-theme-color', accent);
  state.exportDialog.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.exportDialog.style.setProperty('--lia-dgs-theme-color', accent);
  state.boardContainer.style.setProperty('--lia-dgs-menu-bg', menuBackground);
  state.boardContainer.style.setProperty('--lia-dgs-theme-color', accent);
  state.boardContainer.style.setProperty('--lia-dgs-neutral-color', tone);
  state.boardContainer.style.setProperty('--lia-dgs-fullscreen-bg', tone === '#fff' ? '#151a1c' : '#fff');
  layoutDgsSetSquare(state, false);
  styleDgsSegments(state);
  if (state.axisAdjusted) scheduleAxisSync(state);
  if (state.xAxisAdjusted) scheduleXAxisSync(state);
  notifyRegressionLayout(state);
  applyDgsToolAvailability(state);
  positionOpenDgsSubmenu(state);
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

function resetAxisPoint1ToOriginal(axis: any): void {
  const original = axis && axis._point1UsrCoordsOrg;
  if (!axis || !axis.point1 || !Array.isArray(original) || original.length < 3) return;
  const z = Number(original[0]) || 1;
  const coords = [Number(original[1]) / z, Number(original[2]) / z];
  try {
    if (typeof axis.point1.setPositionDirectly === 'function' && typeof JXG !== 'undefined') {
      axis.point1.setPositionDirectly(JXG.COORDS_BY_USER, coords);
    } else if (typeof axis.point1.setPosition === 'function' && typeof JXG !== 'undefined') {
      axis.point1.setPosition(JXG.COORDS_BY_USER, coords);
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
  resetAxisPoint1ToOriginal(axis);
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
  resetAxisPoint1ToOriginal(axis);
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

function targetRightPanelInset(state: DgsState): number {
  const requested = (state.sideMenuOpen ? SIDE_MENU_WIDTH_PX : 0) +
    (state.objectListOpen ? OBJECT_LIST_WIDTH_PX : 0);
  const available = Math.max(0, Number(state.boardContainer.clientWidth || 0) - 24);
  return Math.min(requested, available || requested);
}

function currentSideMenuInset(state: DgsState): number {
  try {
    const boardRect = state.boardContainer.getBoundingClientRect();
    const canvasRight = boardRect.left + (state.boardContainer.clientLeft || 0) + state.boardContainer.clientWidth;
    let leftmostVisible = canvasRight;
    [state.sideMenu, state.objectListPanel].forEach((panel) => {
      const rect = panel.getBoundingClientRect();
      if (rect.left < canvasRight && rect.right > boardRect.left) {
        leftmostVisible = Math.min(leftmostVisible, rect.left);
      }
    });
    return Math.max(
      0,
      Math.min(
        SIDE_MENU_WIDTH_PX + OBJECT_LIST_WIDTH_PX,
        Math.max(0, state.boardContainer.clientWidth - 24),
        canvasRight - leftmostVisible
      )
    );
  } catch (e) {
    return targetRightPanelInset(state);
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
  resetAxisPoint1ToOriginal(axis);
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
  resetAxisPoint1ToOriginal(axis);
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

  if ((state.sideMenuOpen || state.objectListOpen) && !state.xAxisAdjusted) {
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

    if (state.sideMenuOpen || state.objectListOpen) {
      applyXAxisInset(state, targetRightPanelInset(state));
    }
    else restoreXAxis(state);
  };
  state.xAxisAnimationRAF = requestAnimationFrame(frame);
}

function setColorPopupOpen(state: DgsState, open: boolean): void {
  state.colorPopupOpen = open;
  state.colorPopup.dataset.open = open ? '1' : '0';
  state.colorPopup.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.colorPopup.style.top = (state.open ? MENU_HEIGHT_PX + 10 : 10) + 'px';
  const rightPanelsWidth = SIDE_MENU_WIDTH_PX +
    (state.objectListOpen ? OBJECT_LIST_WIDTH_PX : 0);
  state.colorPopup.style.right = state.boardContainer.clientWidth >= rightPanelsWidth + 210
    ? rightPanelsWidth + 10 + 'px'
    : '10px';
  state.colorButtons.forEach((button) => button.setAttribute(
    'aria-expanded', open && button.dataset.colorKind === state.activeColorKind ? 'true' : 'false'
  ));
  state.colorPalette.tabIndex = open ? 0 : -1;
  state.colorHueInput.tabIndex = open ? 0 : -1;
  state.colorHexInput.tabIndex = open ? 0 : -1;
  state.opacityInput.tabIndex = open && !state.opacityRow.hidden ? 0 : -1;
}

function setSideMenuOpen(state: DgsState, open: boolean): void {
  if (open) {
    const propertiesMode = getDgsObjectPropertiesMode(state);
    const axisKey = getDgsAxisKey(state, state.contextObject);
    if (propertiesMode === 'locked' || (propertiesMode === 'colors-trace' && !!axisKey)) {
      open = false;
    } else if (state.contextObject) {
      applyDgsSideMenuRestrictions(state, state.contextObject);
    }
  }
  const changed = state.sideMenuOpen !== open;
  state.sideMenuOpen = open;
  state.sideMenu.dataset.open = open ? '1' : '0';
  state.sideMenu.classList.toggle('is-open', open);
  state.sideMenu.dataset.objectListOpen = state.objectListOpen ? '1' : '0';
  state.sideMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.sideMenuCloseButton.tabIndex = open ? 0 : -1;
  state.sideMenuNameInput.tabIndex = open && !state.sideMenuNameInput.hidden ? 0 : -1;
  const coordinatesAvailable = open && !state.coordinateSection.hidden;
  state.xCoordinateInput.tabIndex = coordinatesAvailable ? 0 : -1;
  state.yCoordinateInput.tabIndex = coordinatesAvailable ? 0 : -1;
  state.angleMeasureInput.tabIndex = open && !state.angleMeasureSection.hidden ? 0 : -1;
  state.arcExitAngleInput.tabIndex = open && !state.arcSettingsSection.hidden ? 0 : -1;
  state.arcEntryAngleInput.tabIndex = open && !state.arcSettingsSection.hidden ? 0 : -1;
  state.lineStyleSelect.tabIndex = open && !state.strokeStyleSection.hidden ? 0 : -1;
  state.strokeDesignSelect.tabIndex = open && !state.strokeStyleSection.hidden &&
    !state.strokeDesignField.hidden ? 0 : -1;
  state.strokeWidthInput.tabIndex = open && !state.strokeStyleSection.hidden &&
    !state.strokeWidthField.hidden ? 0 : -1;
  state.functionExpressionInput.tabIndex = open && !state.functionExpressionSection.hidden ? 0 : -1;
  state.textFontSizeInput.tabIndex = open && !state.textFontSizeSection.hidden ? 0 : -1;
  [state.sliderValueInput, state.sliderMinInput, state.sliderMaxInput, state.sliderStepInput]
    .forEach((input) => { input.tabIndex = open && !state.sliderSettingsSection.hidden ? 0 : -1; });
  state.axisVariableInput.tabIndex = open && !state.axisLabelSection.hidden ? 0 : -1;
  state.axisDescriptionInput.tabIndex = open && !state.axisLabelSection.hidden ? 0 : -1;
  state.fixedCheckbox.tabIndex = open && !state.fixedOption.hidden ? 0 : -1;
  state.nameCheckbox.tabIndex = open && !state.nameOption.hidden ? 0 : -1;
  state.objectCheckbox.tabIndex = open && !state.objectOption.hidden ? 0 : -1;
  state.traceCheckbox.tabIndex = open && !state.traceOption.hidden ? 0 : -1;
  state.measurementCheckbox.tabIndex = open && !state.measurementOption.hidden ? 0 : -1;
  state.areaCheckbox.tabIndex = open && !state.areaOption.hidden ? 0 : -1;
  state.perimeterCheckbox.tabIndex = open && !state.perimeterOption.hidden ? 0 : -1;
  state.colorButtons.forEach((button) => {
    button.tabIndex = open && !state.colorSection.hidden && !button.hidden ? 0 : -1;
  });
  state.layerInput.tabIndex = open && !state.layerRow.hidden ? 0 : -1;
  state.clearTraceButton.tabIndex = open && !state.clearTraceButton.hidden ? 0 : -1;
  state.deleteButton.tabIndex = open && !state.deleteButton.hidden ? 0 : -1;
  if (!open) {
    setColorPopupOpen(state, false);
    state.contextObject = null;
    resetDeleteButton(state);
  }
  if (changed) trackXAxisWithSideMenu(state);
  if (state.objectListOpen) refreshDgsObjectList(state, true);
  if (changed) {
    try { window.__refreshAllAxisTitles?.(); } catch (e) {}
  }
  applyDgsToolAvailability(state);
}

function setObjectListOpen(state: DgsState, open: boolean): void {
  const changed = state.objectListOpen !== open;
  state.objectListOpen = open;
  state.objectListPanel.dataset.open = open ? '1' : '0';
  state.objectListPanel.classList.toggle('is-open', open);
  state.objectListPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.objectListButton.classList.toggle('is-active', open);
  state.objectListButton.setAttribute('aria-pressed', open ? 'true' : 'false');
  state.sideMenu.dataset.objectListOpen = open ? '1' : '0';
  state.sideMenu.classList.toggle('has-object-list', open);
  state.objectListCloseButton.tabIndex = open ? 0 : -1;
  state.objectListExportButton.tabIndex = open && !state.objectListExportButton.hidden ? 0 : -1;
  if (open) refreshDgsObjectList(state, true);
  else state.objectListSignature = '';
  if (state.colorPopupOpen) setColorPopupOpen(state, true);
  if (changed) trackXAxisWithSideMenu(state);
  if (changed) {
    try { window.__refreshAllAxisTitles?.(); } catch (e) {}
  }
}

function refreshDgsValueDisplayRestriction(state: DgsState): void {
  getDgsBoardObjects(state.board).forEach((object) => {
    if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
    else refreshDgsObjectLabel(object);
  });
  try {
    if (state.board && typeof state.board.fullUpdate === 'function') state.board.fullUpdate();
    else if (state.board && typeof state.board.update === 'function') state.board.update();
  } catch (e) {}
}

function applyDgsProfileRestrictions(state: DgsState): void {
  const exportLocked = hasDgsRestriction(state, DGS_RESTRICTION_IDS.exportLocked);
  const valueDisplayLocked = hasDgsRestriction(
    state,
    DGS_RESTRICTION_IDS.valueControlsLocked
  );
  if (state.board) state.board.__liaDgsValueDisplayLocked = valueDisplayLocked;
  state.objectListFooter.hidden = exportLocked;
  state.objectListExportButton.hidden = exportLocked;
  state.objectListExportButton.disabled = exportLocked;
  state.objectListExportButton.tabIndex = state.objectListOpen && !exportLocked ? 0 : -1;

  if (exportLocked && state.exportDialogOpen) setExportDialogOpen(state, false);

  if (state.sideMenuOpen) {
    const propertiesMode = getDgsObjectPropertiesMode(state);
    const axisKey = getDgsAxisKey(state, state.contextObject);
    if (propertiesMode === 'locked' || (propertiesMode === 'colors-trace' && !!axisKey)) {
      setSideMenuOpen(state, false);
    } else if (state.contextObject) {
      updateSideMenuControls(state, state.contextObject);
      setSideMenuOpen(state, true);
    }
  }
  if (state.objectListOpen) refreshDgsObjectList(state, true);
  refreshDgsValueDisplayRestriction(state);
}

function setMenuOpen(state: DgsState, open: boolean): void {
  const changed = state.open !== open;
  state.open = open;
  state.menuBar.dataset.open = open ? '1' : '0';
  state.menuBar.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.menuEndGroup.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.button.setAttribute('aria-expanded', open ? 'true' : 'false');
  state.button.classList.toggle('is-active', open);
  state.sideMenu.dataset.topOpen = open ? '1' : '0';
  state.objectListPanel.dataset.topOpen = open ? '1' : '0';
  state.objectListPanel.classList.toggle('is-top-open', open);
  state.selectButton.tabIndex = open ? 0 : -1;
  state.setSquareButton.tabIndex = open && !state.setSquareButton.disabled ? 0 : -1;
  state.compassButton.tabIndex = open && !state.compassButton.disabled ? 0 : -1;
  state.formatButton.tabIndex = open ? 0 : -1;
  state.pointButton.tabIndex = open ? 0 : -1;
  state.segmentButton.tabIndex = open ? 0 : -1;
  state.orthogonalButton.tabIndex = open ? 0 : -1;
  state.polygonButton.tabIndex = open ? 0 : -1;
  state.angleButton.tabIndex = open ? 0 : -1;
  state.functionButton.tabIndex = open ? 0 : -1;
  state.rootButton.tabIndex = open ? 0 : -1;
  state.textButton.tabIndex = open ? 0 : -1;
  state.sliderButton.tabIndex = open ? 0 : -1;
  state.zoomModeButton.tabIndex = open ? 0 : -1;
  state.axisScaleButton.tabIndex = open ? 0 : -1;
  state.fullscreenButton.tabIndex = open ? 0 : -1;
  state.objectListButton.tabIndex = open ? 0 : -1;
  if (state.colorPopupOpen) setColorPopupOpen(state, true);
  if (!open) setCompassSubmenuOpen(state, false);
  if (!open) setGeometrySubmenuOpen(state, false);
  if (!open) setRelationSubmenuOpen(state, false);
  if (!open) setShapeSubmenuOpen(state, false);
  if (!open) setAngleSubmenuOpen(state, false);
  if (!open) setRootSubmenuOpen(state, false);
  if (!open) setAxisScaleSubmenuOpen(state, false);
  if (!open) setFunctionDialogOpen(state, false);
  if (!open) setCompassRadiusDialogOpen(state, false);
  if (!open) setTextDialogOpen(state, false);
  if (!open) setExportDialogOpen(state, false);
  if (changed) trackAxisWithMenu(state);
  if (changed) notifyRegressionLayout(state, open);
  if (changed) {
    try { window.__refreshAllAxisTitles?.(); } catch (e) {}
  }
}

function positionDgsSubmenu(
  state: DgsState,
  submenu: HTMLDivElement,
  anchorButton: HTMLButtonElement
): void {
  if (!state.menuClip.isConnected || !submenu.isConnected || !anchorButton.isConnected) return;

  const clipRect = state.menuClip.getBoundingClientRect();
  const anchorRect = anchorButton.getBoundingClientRect();
  const localClipWidth = state.menuClip.clientWidth || state.menuClip.offsetWidth;
  if (!(clipRect.width > 0) || !(localClipWidth > 0)) return;

  const scaleX = clipRect.width / localClipWidth;
  if (!(scaleX > 0)) return;
  const submenuWidth = submenu.offsetWidth || submenu.getBoundingClientRect().width / scaleX;
  if (!(submenuWidth > 0)) return;

  const margin = 8;
  const preferredLeft = (anchorRect.left - clipRect.left) / scaleX - margin;
  const maxLeft = Math.max(margin, localClipWidth - submenuWidth - margin);
  const left = Math.max(margin, Math.min(preferredLeft, maxLeft));
  submenu.style.left = `${Math.round(left)}px`;
}

function positionOpenDgsSubmenu(state: DgsState): void {
  if (state.compassSubmenuOpen) {
    positionDgsSubmenu(state, state.compassSubmenu, state.compassButton);
    return;
  }
  if (state.geometrySubmenuOpen) {
    positionDgsSubmenu(state, state.geometrySubmenu, state.segmentButton);
    return;
  }
  if (state.relationSubmenuOpen) {
    positionDgsSubmenu(state, state.relationSubmenu, state.orthogonalButton);
    return;
  }
  if (state.shapeSubmenuOpen) {
    positionDgsSubmenu(state, state.shapeSubmenu, state.polygonButton);
    return;
  }
  if (state.angleSubmenuOpen) {
    positionDgsSubmenu(state, state.angleSubmenu, state.angleButton);
    return;
  }
  if (state.rootSubmenuOpen) {
    positionDgsSubmenu(state, state.rootSubmenu, state.rootButton);
    return;
  }
  if (state.axisScaleSubmenuOpen) {
    positionDgsSubmenu(state, state.axisScaleSubmenu, state.axisScaleButton);
  }
}

function setCompassSubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setGeometrySubmenuOpen(state, false);
  if (open) setRelationSubmenuOpen(state, false);
  if (open) setShapeSubmenuOpen(state, false);
  if (open) setAngleSubmenuOpen(state, false);
  if (open) setRootSubmenuOpen(state, false);
  if (open) setAxisScaleSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.compassSubmenu, state.compassButton);
  state.compassSubmenuOpen = open;
  state.compassSubmenu.dataset.open = open ? '1' : '0';
  state.compassSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.compassButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [state.compassToolButton, state.fixedRadiusCompassToolButton]
    .forEach((button) => setDgsButtonTabIndex(button, open));
}

function setGeometrySubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setCompassSubmenuOpen(state, false);
  if (open) setRelationSubmenuOpen(state, false);
  if (open) setShapeSubmenuOpen(state, false);
  if (open) setAngleSubmenuOpen(state, false);
  if (open) setRootSubmenuOpen(state, false);
  if (open) setAxisScaleSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.geometrySubmenu, state.segmentButton);
  state.geometrySubmenuOpen = open;
  state.geometrySubmenu.dataset.open = open ? '1' : '0';
  state.geometrySubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.segmentButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [
    state.segmentToolButton,
    state.rayToolButton,
    state.lineToolButton,
    state.vectorToolButton,
    state.arcToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, open));
}

function setRelationSubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setCompassSubmenuOpen(state, false);
  if (open) setGeometrySubmenuOpen(state, false);
  if (open) setShapeSubmenuOpen(state, false);
  if (open) setAngleSubmenuOpen(state, false);
  if (open) setRootSubmenuOpen(state, false);
  if (open) setAxisScaleSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.relationSubmenu, state.orthogonalButton);
  state.relationSubmenuOpen = open;
  state.relationSubmenu.dataset.open = open ? '1' : '0';
  state.relationSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.orthogonalButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [
    state.orthogonalToolButton,
    state.parallelToolButton,
    state.midpointToolButton,
    state.angleBisectorToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, open));
}

function setShapeSubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setCompassSubmenuOpen(state, false);
  if (open && state.geometrySubmenuOpen) {
    state.geometrySubmenuOpen = false;
    state.geometrySubmenu.dataset.open = '0';
    state.geometrySubmenu.setAttribute('aria-hidden', 'true');
    state.segmentButton.setAttribute('aria-expanded', 'false');
    state.segmentToolButton.tabIndex = -1;
    state.rayToolButton.tabIndex = -1;
    state.lineToolButton.tabIndex = -1;
    state.vectorToolButton.tabIndex = -1;
    state.arcToolButton.tabIndex = -1;
  }
  if (open) setRelationSubmenuOpen(state, false);
  if (open) setAngleSubmenuOpen(state, false);
  if (open) setRootSubmenuOpen(state, false);
  if (open) setAxisScaleSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.shapeSubmenu, state.polygonButton);
  state.shapeSubmenuOpen = open;
  state.shapeSubmenu.dataset.open = open ? '1' : '0';
  state.shapeSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.polygonButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [state.polygonToolButton, state.circleToolButton, state.sectorToolButton]
    .forEach((button) => setDgsButtonTabIndex(button, open));
}

function setAngleSubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setCompassSubmenuOpen(state, false);
  if (open && state.geometrySubmenuOpen) setGeometrySubmenuOpen(state, false);
  if (open && state.relationSubmenuOpen) setRelationSubmenuOpen(state, false);
  if (open && state.shapeSubmenuOpen) setShapeSubmenuOpen(state, false);
  if (open && state.rootSubmenuOpen) setRootSubmenuOpen(state, false);
  if (open && state.axisScaleSubmenuOpen) setAxisScaleSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.angleSubmenu, state.angleButton);
  state.angleSubmenuOpen = open;
  state.angleSubmenu.dataset.open = open ? '1' : '0';
  state.angleSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.angleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [state.angleToolButton, state.measuredAngleToolButton]
    .forEach((button) => setDgsButtonTabIndex(button, open));
}

function setRootSubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setCompassSubmenuOpen(state, false);
  if (open && state.geometrySubmenuOpen) setGeometrySubmenuOpen(state, false);
  if (open && state.relationSubmenuOpen) setRelationSubmenuOpen(state, false);
  if (open && state.shapeSubmenuOpen) setShapeSubmenuOpen(state, false);
  if (open && state.angleSubmenuOpen) setAngleSubmenuOpen(state, false);
  if (open && state.axisScaleSubmenuOpen) setAxisScaleSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.rootSubmenu, state.rootButton);
  state.rootSubmenuOpen = open;
  state.rootSubmenu.dataset.open = open ? '1' : '0';
  state.rootSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.rootButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [
    state.rootToolButton,
    state.extremaToolButton,
    state.inflectionToolButton,
    state.yInterceptToolButton,
    state.tangentToolButton,
    state.intersectionToolButton
  ].forEach((button) => setDgsButtonTabIndex(button, open));
}

function setAxisScaleSubmenuOpen(state: DgsState, open: boolean): void {
  if (open) setCompassSubmenuOpen(state, false);
  if (open) setGeometrySubmenuOpen(state, false);
  if (open) setRelationSubmenuOpen(state, false);
  if (open) setShapeSubmenuOpen(state, false);
  if (open) setAngleSubmenuOpen(state, false);
  if (open) setRootSubmenuOpen(state, false);
  if (open) positionDgsSubmenu(state, state.axisScaleSubmenu, state.axisScaleButton);
  state.axisScaleSubmenuOpen = open;
  state.axisScaleSubmenu.dataset.open = open ? '1' : '0';
  state.axisScaleSubmenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.axisScaleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  [
    state.cartesianScaleButton,
    state.logXScaleButton,
    state.logYScaleButton,
    state.logLogScaleButton
  ].forEach((button) => setDgsButtonTabIndex(button, open));
}

function setCompassRadiusDialogOpen(state: DgsState, open: boolean): void {
  if (open) {
    setExportDialogOpen(state, false);
    setCompassSubmenuOpen(state, false);
  }
  state.compassRadiusDialogOpen = open;
  state.compassRadiusDialog.dataset.open = open ? '1' : '0';
  state.compassRadiusDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.compassRadiusDialogInput.tabIndex = open ? 0 : -1;
  state.compassRadiusDialogConfirmButton.tabIndex = open ? 0 : -1;
  state.compassRadiusDialogCancelButton.tabIndex = open ? 0 : -1;
  renderToolState(state);
  if (open) {
    state.compassRadiusDialogInput.value = formatCoordinate(state.compassPresetRadius);
    state.compassRadiusDialogInput.setAttribute('aria-invalid', 'false');
    window.setTimeout(() => {
      try {
        state.compassRadiusDialogInput.focus();
        state.compassRadiusDialogInput.select();
      } catch (e) {}
    }, 0);
  }
}

function confirmDgsCompassRadius(state: DgsState): boolean {
  const raw = String(state.compassRadiusDialogInput.value || '').trim().replace(',', '.');
  const radius = Number(raw);
  const valid = raw !== '' && Number.isFinite(radius) && radius > 1e-12;
  state.compassRadiusDialogInput.setAttribute('aria-invalid', valid ? 'false' : 'true');
  if (!valid) return false;
  state.compassPresetRadius = radius;
  state.compassMode = 'fixed';
  setCompassRadiusDialogOpen(state, false);
  setActiveTool(state, 'compass');
  return true;
}

function setAngleDialogOpen(state: DgsState, open: boolean): void {
  if (open) setExportDialogOpen(state, false);
  state.angleDialogOpen = open;
  state.angleDialog.dataset.open = open ? '1' : '0';
  state.angleDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.angleDialogInput.tabIndex = open ? 0 : -1;
  state.angleDialogConfirmButton.tabIndex = open ? 0 : -1;
  state.angleDialogCancelButton.tabIndex = open ? 0 : -1;
  if (open) {
    state.angleDialogInput.value = '90';
    state.angleDialogInput.setAttribute('aria-invalid', 'false');
    window.setTimeout(() => {
      try { state.angleDialogInput.focus(); state.angleDialogInput.select(); } catch (e) {}
    }, 0);
  }
}

function setArcDialogOpen(state: DgsState, open: boolean): void {
  if (!state.arcDialog || !state.arcDialogExitInput || !state.arcDialogEntryInput) {
    state.arcDialogOpen = false;
    state.pendingArcPoints = [];
    return;
  }
  if (open) setExportDialogOpen(state, false);
  state.arcDialogOpen = open;
  state.arcDialog.dataset.open = open ? '1' : '0';
  state.arcDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.arcDialogExitInput.tabIndex = open ? 0 : -1;
  state.arcDialogEntryInput.tabIndex = open ? 0 : -1;
  state.arcDialogConfirmButton.tabIndex = open ? 0 : -1;
  state.arcDialogCancelButton.tabIndex = open ? 0 : -1;
  if (open) {
    const defaults = state.pendingArcPoints.length === 2
      ? getDefaultDgsArcAngles(state.pendingArcPoints[0], state.pendingArcPoints[1])
      : { exitAngle: 45, entryAngle: 135 };
    state.arcDialogExitInput.value = formatCoordinate(defaults.exitAngle);
    state.arcDialogEntryInput.value = formatCoordinate(defaults.entryAngle);
    state.arcDialogExitInput.setAttribute('aria-invalid', 'false');
    state.arcDialogEntryInput.setAttribute('aria-invalid', 'false');
    window.setTimeout(() => {
      try { state.arcDialogExitInput.focus(); state.arcDialogExitInput.select(); } catch (e) {}
    }, 0);
  } else {
    state.pendingArcPoints = [];
  }
}

function createDgsArcFromDialog(state: DgsState): boolean {
  const exitAngle = parseDgsArcAngle(state.arcDialogExitInput.value);
  const entryAngle = parseDgsArcAngle(state.arcDialogEntryInput.value);
  state.arcDialogExitInput.setAttribute('aria-invalid', exitAngle == null ? 'true' : 'false');
  state.arcDialogEntryInput.setAttribute('aria-invalid', entryAngle == null ? 'true' : 'false');
  if (exitAngle == null || entryAngle == null || state.pendingArcPoints.length !== 2) return false;
  const arc = createDgsArc(
    state,
    state.pendingArcPoints[0],
    state.pendingArcPoints[1],
    exitAngle,
    entryAngle
  );
  if (!arc) return false;
  persistDgsConstruction(state);
  setArcDialogOpen(state, false);
  setActiveTool(state, '', false);
  return true;
}

function setFunctionDialogOpen(state: DgsState, open: boolean): void {
  if (open) setExportDialogOpen(state, false);
  state.functionDialogOpen = open;
  state.functionDialog.dataset.open = open ? '1' : '0';
  state.functionDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.functionDialogInput.tabIndex = open ? 0 : -1;
  state.functionDialogConfirmButton.tabIndex = open ? 0 : -1;
  state.functionDialogCancelButton.tabIndex = open ? 0 : -1;
  state.functionButton.classList.toggle('is-active', open);
  state.functionButton.setAttribute('aria-pressed', open ? 'true' : 'false');
  renderToolState(state);
  if (open) {
    state.functionDialogInput.setAttribute('aria-invalid', 'false');
    window.setTimeout(() => {
      try { state.functionDialogInput.focus(); state.functionDialogInput.select(); } catch (e) {}
    }, 0);
  }
}

function createDgsFunctionFromDialog(state: DgsState): boolean {
  const expression = String(state.functionDialogInput.value || '').trim();
  let graph: any | null = null;
  if (expression) graph = createDgsFunction(state, expression);
  state.functionDialogInput.setAttribute('aria-invalid', graph ? 'false' : 'true');
  if (!graph) return false;
  persistDgsConstruction(state);
  setFunctionDialogOpen(state, false);
  return true;
}

function setTextDialogOpen(state: DgsState, open: boolean): void {
  if (open) setExportDialogOpen(state, false);
  state.textDialogOpen = open;
  state.textDialog.dataset.open = open ? '1' : '0';
  state.textDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.textDialogInput.tabIndex = open ? 0 : -1;
  state.textDialogConfirmButton.tabIndex = open ? 0 : -1;
  state.textDialogCancelButton.tabIndex = open ? 0 : -1;
  if (open) {
    state.textDialogInput.value = '';
    state.textDialogInput.setAttribute('aria-invalid', 'false');
    window.setTimeout(() => {
      try { state.textDialogInput.focus(); } catch (e) {}
    }, 0);
  } else {
    state.pendingTextPosition = null;
  }
}

function renderDgsExportToolSelection(state: DgsState): void {
  const text = dgsText(state.language);
  state.exportToolButtons.forEach((button, id) => {
    const enabled = state.exportSelectedToolIds.has(id);
    button.dataset.enabled = enabled ? '1' : '0';
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.setAttribute(
      'aria-label',
      String(button.title || '') + ': ' + (enabled ? text.toolAvailable : text.toolUnavailable)
    );
    const status = button.querySelector<HTMLElement>('.lia-dgs-export-tool-status');
    if (status) status.textContent = enabled ? '\u2713' : '\u00d7';
    button.tabIndex = state.exportDialogOpen && state.exportDialogStep === 'tools' ? 0 : -1;
  });
}

function renderDgsExportRestrictionSelection(state: DgsState): void {
  state.exportRestrictionInputs.forEach((input, id) => {
    input.checked = state.exportSelectedRestrictionIds.has(id);
    input.tabIndex = state.exportDialogOpen && state.exportDialogStep === 'tools' ? 0 : -1;
  });
}

function setDgsExportDialogStep(state: DgsState, step: 'tools' | 'macro'): void {
  const text = dgsText(state.language);
  state.exportDialogStep = step;
  const toolsStep = step === 'tools';
  state.exportToolsStep.hidden = !toolsStep;
  state.exportMacroStep.hidden = toolsStep;
  state.exportBackButton.hidden = toolsStep;
  state.exportDialogTitle.textContent = toolsStep ? text.exportToolsTitle : text.exportMacrosTitle;
  state.exportCopyButton.textContent = toolsStep ? text.nextExport : text.copyExport;
  state.exportTextarea.tabIndex = state.exportDialogOpen && !toolsStep ? 0 : -1;
  state.exportBackButton.tabIndex = state.exportDialogOpen && !toolsStep ? 0 : -1;
  renderDgsExportToolSelection(state);
  renderDgsExportRestrictionSelection(state);

  if (!state.exportDialogOpen) return;
  if (!toolsStep) {
    state.exportTextarea.value = buildDgsExportMacroBlock(
      state,
      state.exportSelectedToolIds,
      state.exportSelectedRestrictionIds
    );
  }
  window.setTimeout(() => {
    try {
      if (toolsStep) {
        const first = Array.from(state.exportToolButtons.values())[0];
        first?.focus();
      } else {
        state.exportTextarea.focus();
        state.exportTextarea.select();
      }
    } catch (e) {}
  }, 0);
}

function setExportDialogOpen(state: DgsState, open: boolean): void {
  if (open && hasDgsRestriction(state, DGS_RESTRICTION_IDS.exportLocked)) return;
  const wasOpen = state.exportDialogOpen;
  state.exportDialogOpen = open;
  state.exportDialog.dataset.open = open ? '1' : '0';
  state.exportDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
  state.exportCopyButton.tabIndex = open ? 0 : -1;
  state.exportCloseButton.tabIndex = open ? 0 : -1;
  if (open) {
    state.exportSelectedToolIds = new Set<number>(
      state.availableToolIds == null
        ? DGS_EXPORT_SELECTABLE_TOOL_IDS
        : dgsExportSelectableToolIds(state.availableToolIds)
    );
    state.exportSelectedRestrictionIds = new Set<number>(state.restrictionIds);
    setDgsExportDialogStep(state, 'tools');
  } else {
    state.exportTextarea.tabIndex = -1;
    state.exportBackButton.tabIndex = -1;
    state.exportToolButtons.forEach((button) => { button.tabIndex = -1; });
    state.exportRestrictionInputs.forEach((input) => { input.tabIndex = -1; });
    if (wasOpen) {
      window.setTimeout(() => {
        try {
          if (!state.objectListExportButton.hidden) state.objectListExportButton.focus();
          else state.objectListCloseButton.focus();
        } catch (e) {}
      }, 0);
    }
  }
}

function copyDgsExportToClipboard(state: DgsState): void {
  const value = String(state.exportTextarea.value || '');
  const text = dgsText(state.language);
  const markCopied = () => {
    state.exportCopyButton.textContent = text.copiedExport;
    window.setTimeout(() => {
      if (state.exportDialogOpen) state.exportCopyButton.textContent = text.copyExport;
    }, 1200);
  };
  const fallback = () => {
    try {
      state.exportTextarea.focus();
      state.exportTextarea.select();
      document.execCommand('copy');
      markCopied();
    } catch (e) {}
  };
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(value).then(markCopied).catch(fallback);
      return;
    }
  } catch (e) {}
  fallback();
}

function createDgsTextFromDialog(state: DgsState): boolean {
  const position = state.pendingTextPosition;
  const content = String(state.textDialogInput.value || '').trim();
  const textObject = position && content
    ? createDgsText(state, position.x, position.y, content)
    : null;
  state.textDialogInput.setAttribute('aria-invalid', textObject ? 'false' : 'true');
  if (!textObject) return false;
  persistDgsConstruction(state);
  setTextDialogOpen(state, false);
  setActiveTool(state, '', false);
  return true;
}

function createMeasuredDgsAngleFromDialog(state: DgsState): boolean {
  const degrees = parseDgsAngleDegrees(state.angleDialogInput.value);
  state.angleDialogInput.setAttribute('aria-invalid', degrees == null ? 'true' : 'false');
  if (degrees == null || state.selectedAnglePoints.length !== 2) return false;
  const first = state.selectedAnglePoints[0];
  const vertex = state.selectedAnglePoints[1];
  try {
    const firstX = Number(first.X());
    const firstY = Number(first.Y());
    const vertexX = Number(vertex.X());
    const vertexY = Number(vertex.Y());
    const dx = firstX - vertexX;
    const dy = firstY - vertexY;
    if (Math.hypot(dx, dy) <= 1e-12) {
      state.angleDialogInput.setAttribute('aria-invalid', 'true');
      return false;
    }
    const radians = degrees * Math.PI / 180;
    const targetX = vertexX + Math.cos(radians) * dx - Math.sin(radians) * dy;
    const targetY = vertexY + Math.sin(radians) * dx + Math.cos(radians) * dy;
    const generated = createDgsPoint(state, targetX, targetY);
    if (!generated) return false;
    const angle = createDgsAngle(state, [first, vertex, generated]);
    if (!angle) return false;
    angle.__liaDgsMeasuredConstruction = true;
    angle.__liaDgsTargetAngle = degrees;
    angle.__liaDgsGeneratedPoint = generated;
    angle.__liaDgsShowAngle = true;
    syncDgsRightAngleStyle(angle);
    configureDgsMeasuredAngle(state, angle);
    applyDgsMeasuredAngle(state, angle, degrees, false);
    persistDgsConstruction(state);
    setAngleDialogOpen(state, false);
    setActiveTool(state, '', false);
    return true;
  } catch (e) { return false; }
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

function ensureDgsRegression(uid: string, boardId: string, language: 'de' | 'en'): void {
  try {
    if (typeof window.__setupRegressionUI === 'function') {
      window.__setupRegressionUI('dgs-regression-' + uid, boardId, language);
    }
  } catch (e) {}
}

function disposeDgsState(existing: DgsState): void {
  persistDgsSetSquarePose(existing);
  cancelDgsSetSquareInteraction(existing);
  setActiveTool(existing, '', false);
  if (existing.axisAnimationRAF) cancelAnimationFrame(existing.axisAnimationRAF);
  if (existing.axisSyncRAF) cancelAnimationFrame(existing.axisSyncRAF);
  if (existing.xAxisAnimationRAF) cancelAnimationFrame(existing.xAxisAnimationRAF);
  if (existing.xAxisSyncRAF) cancelAnimationFrame(existing.xAxisSyncRAF);
  if (existing.rootUpdateRAF != null) cancelAnimationFrame(existing.rootUpdateRAF);
  if (existing.coordinateSyncRAF != null) cancelAnimationFrame(existing.coordinateSyncRAF);
  if (existing.fixedCompassSyncRAF != null) cancelAnimationFrame(existing.fixedCompassSyncRAF);
  if (existing.setSquareLayoutRAF != null) cancelAnimationFrame(existing.setSquareLayoutRAF);
  cancelScheduledDgsConstructionRestore(existing);
  restoreAxis(existing);
  restoreXAxis(existing);
  if (existing.onBoardViewportChange && existing.board && typeof existing.board.off === 'function') {
    try { existing.board.off('move', existing.onBoardViewportChange); } catch (e) {}
    try { existing.board.off('boundingbox', existing.onBoardViewportChange); } catch (e) {}
  }
  if (existing.onBoardRootUpdate && existing.board && typeof existing.board.off === 'function') {
    try { existing.board.off('update', existing.onBoardRootUpdate); } catch (e) {}
  }
  if (existing.onBoardPointerDown) {
    existing.boardContainer.removeEventListener('pointerdown', existing.onBoardPointerDown, true);
  }
  if (existing.onBoardPointerMove) {
    existing.boardContainer.removeEventListener('pointermove', existing.onBoardPointerMove, true);
  }
  if (existing.onBoardLostPointerCapture) {
    existing.boardContainer.removeEventListener('lostpointercapture', existing.onBoardLostPointerCapture);
  }
  if (existing.onBoardContextMenu) {
    existing.boardContainer.removeEventListener('contextmenu', existing.onBoardContextMenu, true);
  }
  if (existing.onDocumentPointerDown) {
    document.removeEventListener('pointerdown', existing.onDocumentPointerDown, true);
  }
  if (existing.onDocumentPointerUp) {
    document.removeEventListener('pointerup', existing.onDocumentPointerUp, true);
  }
  if (existing.onDocumentPointerCancel) {
    document.removeEventListener('pointercancel', existing.onDocumentPointerCancel, true);
  }
  if (existing.onFullscreenChange) {
    document.removeEventListener('fullscreenchange', existing.onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', existing.onFullscreenChange as EventListener);
    existing.boardContainer.removeEventListener('fullscreenchange', existing.onFullscreenChange);
  }
  if (existing.fullscreenResizeRAF != null) cancelAnimationFrame(existing.fullscreenResizeRAF);
  if (existing.fullscreenReleaseTimer != null) window.clearTimeout(existing.fullscreenReleaseTimer);
  if (isDgsFullscreen(existing)) {
    try {
      const result = typeof document.exitFullscreen === 'function'
        ? document.exitFullscreen()
        : (document as any).webkitExitFullscreen?.();
      void Promise.resolve(result).then(
        () => restoreDgsEmbeddedSize(existing),
        () => restoreDgsEmbeddedSize(existing)
      );
    } catch (e) {
      restoreDgsEmbeddedSize(existing);
    }
  } else if (existing.fullscreenSnapshot) {
    restoreDgsEmbeddedSize(existing);
  }
  if (existing.resizeObserver) existing.resizeObserver.disconnect();
  if (Array.isArray(existing.rootConstructions)) {
    existing.rootConstructions.slice().forEach((construction) => {
      removeDgsRootConstruction(existing, construction, false);
    });
  }
  releaseRegressionControls(existing);
  try { existing.setSquareOverlay.remove(); } catch (e) {}
  try { existing.button.remove(); } catch (e) {}
  try { existing.menuClip.remove(); } catch (e) {}
  try { existing.sideMenuClip.remove(); } catch (e) {}
  try { existing.objectListClip.remove(); } catch (e) {}
  try { existing.colorPopup.remove(); } catch (e) {}
  try { existing.angleDialog.remove(); } catch (e) {}
  try { existing.compassRadiusDialog.remove(); } catch (e) {}
  try { existing.arcDialog.remove(); } catch (e) {}
  try { existing.functionDialog.remove(); } catch (e) {}
  try { existing.textDialog.remove(); } catch (e) {}
  try { existing.exportDialog.remove(); } catch (e) {}
  clearPendingDgsRetry(existing.uid);
  if (states[existing.uid] === existing) delete states[existing.uid];
}

function setupDGS(uid: string, spec: string, languageCode?: string): void {
  const config = parseDgsMacroSpec(spec);
  const boardId = config.boardId;
  if (!uid || !boardId) return;
  const anchor = document.getElementById('dgs-ui-' + uid) as HTMLElement | null;
  if (isStaticDgsTarget(boardId, anchor)) {
    disposeDgsForBoard(boardId);
    clearPendingDgsRetry(uid);
    return;
  }

  const boardContainer = getBoardContainer(boardId);
  if (!boardContainer) {
    pendingRetryBoardIds[uid] = boardId;
    if (pendingRetryTimers[uid] != null) return;
    const retries = (pendingRetries[uid] || 0) + 1;
    pendingRetries[uid] = retries;

    if (retries <= MAX_RETRIES) {
      pendingRetryTimers[uid] = window.setTimeout(() => {
        pendingRetryTimers[uid] = undefined;
        setupDGS(uid, spec, languageCode);
      }, RETRY_DELAY_MS);
    }
    return;
  }

  syncDgsInstrumentProfile(boardId);
  clearPendingDgsRetry(uid);
  const boardState = getDgsStateForBoard(boardId) ||
    Object.keys(states)
      .map((stateUid) => states[stateUid])
      .find((state) => !!state && state.boardId === boardId) ||
    null;
  if (!states[uid] && boardState) {
    setupDGS(boardState.uid, spec, languageCode);
    return;
  }
  const geometryLanguage = getDgsGeometryLanguage(anchor, languageCode);
  boardContainer.dataset.liaDgsTools = config.toolSelectionKey;
  boardContainer.dataset.liaDgsRestrictions = config.restrictionSelectionKey;
  boardContainer.dataset.liaDgsLanguage = geometryLanguage;
  ensureDgsRegression(uid, boardId, geometryLanguage);
  const currentBoard = window.__boards && window.__boards[boardId];
  const currentMacroSpecSignature = getExternalDgsMacroSpecSignature(boardId);
  const previousState = states[uid];
  if (previousState && previousState.board && previousState.board !== currentBoard) {
    if (!previousState.boardReplacementPrepared) persistDgsConstruction(previousState, true);
  }
  assignDgsMacroPersistentIds(boardId, currentBoard);
  discardStaleMacroBackedDgsSnapshot(boardId, currentBoard);

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
    !!existing.menuEndGroup?.isConnected &&
    !!existing.menuScrollSpacer?.isConnected &&
    existing.geometrySubmenu?.parentElement === existing.menuClip &&
    existing.relationSubmenu?.parentElement === existing.menuClip &&
    existing.shapeSubmenu?.parentElement === existing.menuClip &&
    existing.angleSubmenu?.parentElement === existing.menuClip &&
    existing.rootSubmenu?.parentElement === existing.menuClip &&
    existing.axisScaleSubmenu?.parentElement === existing.menuClip &&
    !!existing.sideMenuClip?.isConnected &&
    !!existing.sideMenu?.isConnected &&
    !!existing.sideMenuObjectType?.isConnected &&
    !!existing.sideMenuNameInput?.isConnected &&
    !!existing.objectListClip?.isConnected &&
    !!existing.objectListPanel?.isConnected &&
    !!existing.objectListContent?.isConnected &&
    !!existing.objectListFooter?.isConnected &&
    !!existing.objectListCloseButton?.isConnected &&
    !!existing.objectListExportButton?.isConnected &&
    !!existing.nameOption?.isConnected &&
    !!existing.objectOption?.isConnected &&
    !!existing.axisLabelSection?.isConnected &&
    !!existing.axisVariableInput?.isConnected &&
    !!existing.axisDescriptionInput?.isConnected &&
    !!existing.textFontSizeSection?.isConnected &&
    !!existing.textFontSizeInput?.isConnected &&
    !!existing.sliderSettingsSection?.isConnected &&
    !!existing.sliderValueInput?.isConnected &&
    !!existing.sliderMinInput?.isConnected &&
    !!existing.sliderMaxInput?.isConnected &&
    !!existing.sliderStepInput?.isConnected &&
    !!existing.lineColorButton?.isConnected &&
    !!existing.colorSection?.isConnected &&
    !!existing.functionExpressionSection?.isConnected &&
    !!existing.functionExpressionPreview?.isConnected &&
    !!existing.functionExpressionInput?.isConnected &&
    !!existing.fixedOption?.isConnected &&
    !!existing.fixedCheckboxText?.isConnected &&
    !!existing.traceOption?.isConnected &&
    !!existing.traceCheckbox?.isConnected &&
    !!existing.toolsDivider?.isConnected &&
    !!existing.selectButton?.isConnected &&
    !!existing.setSquareButton?.isConnected &&
    !!existing.setSquareOverlay?.isConnected &&
    !!existing.compassButton?.isConnected &&
    !!existing.compassSubmenu?.isConnected &&
    existing.compassSubmenu?.parentElement === existing.menuClip &&
    !!existing.compassToolButton?.isConnected &&
    !!existing.fixedRadiusCompassToolButton?.isConnected &&
    !!existing.compassRadiusDialog?.isConnected &&
    !!existing.compassRadiusDialogInput?.isConnected &&
    !!existing.compassRadiusDialogConfirmButton?.isConnected &&
    !!existing.compassRadiusDialogCancelButton?.isConnected &&
    !!existing.formatButton?.isConnected &&
    !!existing.pointButton?.isConnected &&
    !!existing.segmentButton?.isConnected &&
    !!existing.orthogonalButton?.isConnected &&
    !!existing.relationSubmenu?.isConnected &&
    !!existing.orthogonalToolButton?.isConnected &&
    !!existing.parallelToolButton?.isConnected &&
    !!existing.midpointToolButton?.isConnected &&
    !!existing.angleBisectorToolButton?.isConnected &&
    !!existing.polygonButton?.isConnected &&
    !!existing.angleButton?.isConnected &&
    !!existing.angleSubmenu?.isConnected &&
    !!existing.angleToolButton?.isConnected &&
    !!existing.measuredAngleToolButton?.isConnected &&
    !!existing.angleDialog?.isConnected &&
    !!existing.angleMeasureInput?.isConnected &&
    !!existing.arcSettingsSection?.isConnected &&
    !!existing.arcExitAngleInput?.isConnected &&
    !!existing.arcEntryAngleInput?.isConnected &&
    !!existing.strokeStyleSection?.isConnected &&
    !!existing.lineStyleSelect?.isConnected &&
    !!existing.strokeDesignField?.isConnected &&
    !!existing.strokeDesignSelect?.isConnected &&
    !!existing.strokeWidthField?.isConnected &&
    !!existing.strokeWidthInput?.isConnected &&
    !!existing.arcDialog?.isConnected &&
    !!existing.arcDialogExitInput?.isConnected &&
    !!existing.arcDialogEntryInput?.isConnected &&
    !!existing.arcDialogConfirmButton?.isConnected &&
    !!existing.arcDialogCancelButton?.isConnected &&
    !!existing.geometrySubmenu?.isConnected &&
    !!existing.segmentToolButton?.isConnected &&
    !!existing.rayToolButton?.isConnected &&
    !!existing.lineToolButton?.isConnected &&
    !!existing.vectorToolButton?.isConnected &&
    !!existing.arcToolButton?.isConnected &&
    !!existing.shapeSubmenu?.isConnected &&
    !!existing.polygonToolButton?.isConnected &&
    !!existing.circleToolButton?.isConnected &&
    !!existing.sectorToolButton?.isConnected &&
    !!existing.functionDivider?.isConnected &&
    !!existing.functionButton?.isConnected &&
    !!existing.rootButton?.isConnected &&
    !!existing.rootSubmenu?.isConnected &&
    !!existing.rootToolButton?.isConnected &&
    !!existing.extremaToolButton?.isConnected &&
    !!existing.inflectionToolButton?.isConnected &&
    !!existing.yInterceptToolButton?.isConnected &&
    !!existing.tangentToolButton?.isConnected &&
    !!existing.intersectionToolButton?.isConnected &&
    !!existing.functionDialog?.isConnected &&
    !!existing.textDivider?.isConnected &&
    !!existing.sliderButton?.isConnected &&
    !!existing.textButton?.isConnected &&
    !!existing.zoomDivider?.isConnected &&
    !!existing.zoomModeButton?.isConnected &&
    !!existing.axisScaleButton?.isConnected &&
    !!existing.axisScaleSubmenu?.isConnected &&
    !!existing.cartesianScaleButton?.isConnected &&
    !!existing.logXScaleButton?.isConnected &&
    !!existing.logYScaleButton?.isConnected &&
    !!existing.logLogScaleButton?.isConnected &&
    !!existing.fullscreenButton?.isConnected &&
    !!existing.objectListButton?.isConnected &&
    !!existing.textDialog?.isConnected &&
    !!existing.textDialogInput?.isConnected &&
    !!existing.textDialogConfirmButton?.isConnected &&
    !!existing.textDialogCancelButton?.isConnected &&
    !!existing.exportDialog?.isConnected &&
    !!existing.exportDialogTitle?.isConnected &&
    !!existing.exportToolsStep?.isConnected &&
    !!existing.exportMacroStep?.isConnected &&
    existing.exportToolButtons instanceof Map &&
    existing.exportToolButtons.size === DGS_EXPORT_SELECTABLE_TOOL_IDS.length &&
    existing.exportRestrictionInputs instanceof Map &&
    existing.exportRestrictionInputs.size === DGS_KNOWN_RESTRICTION_IDS.length &&
    Array.from(existing.exportRestrictionInputs.values()).every((input) => input.isConnected) &&
    existing.restrictionIds instanceof Set &&
    !!existing.exportTextarea?.isConnected &&
    !!existing.exportCopyButton?.isConnected &&
    !!existing.exportBackButton?.isConnected &&
    !!existing.exportCloseButton?.isConnected &&
    !!existing.measurementOption?.isConnected &&
    !!existing.measurementCheckbox?.isConnected &&
    !!existing.areaOption?.isConnected &&
    !!existing.areaCheckbox?.isConnected &&
    !!existing.perimeterOption?.isConnected &&
    !!existing.perimeterCheckbox?.isConnected &&
    !!existing.colorButton?.isConnected &&
    existing.colorButtons?.length === 4 &&
    existing.colorButtons.every((button) => button.isConnected) &&
    !!existing.traceColorButton?.isConnected &&
    !!existing.clearTraceButton?.isConnected &&
    !!existing.colorPopup?.isConnected &&
    !!existing.opacityInput?.isConnected &&
    !!existing.layerInput?.isConnected &&
    !!existing.layerRow?.isConnected &&
    !!existing.deleteButton?.isConnected &&
    !!existing.regressionDivider?.isConnected &&
    typeof existing.onBoardPointerDown === 'function' &&
    typeof existing.onBoardPointerMove === 'function' &&
    typeof existing.onBoardLostPointerCapture === 'function' &&
    typeof existing.onBoardContextMenu === 'function' &&
    typeof existing.onDocumentPointerDown === 'function' &&
    typeof existing.onDocumentPointerUp === 'function' &&
    typeof existing.onDocumentPointerCancel === 'function' &&
    typeof existing.onFullscreenChange === 'function'
  ) {
    const toolSelectionChanged = existing.toolSelectionKey !== config.toolSelectionKey;
    const restrictionSelectionChanged =
      existing.restrictionSelectionKey !== config.restrictionSelectionKey;
    existing.availableToolIds = config.toolIds == null ? null : new Set<number>(config.toolIds);
    existing.macroSpecSignature = currentMacroSpecSignature;
    existing.toolSelectionKey = config.toolSelectionKey;
    existing.restrictionIds = new Set<number>(config.restrictionIds);
    existing.restrictionSelectionKey = config.restrictionSelectionKey;
    if (toolSelectionChanged) {
      existing.exportSelectedToolIds = new Set<number>(
        config.toolIds == null
          ? DGS_EXPORT_SELECTABLE_TOOL_IDS
          : dgsExportSelectableToolIds(config.toolIds)
      );
    }
    if (restrictionSelectionChanged) {
      existing.exportSelectedRestrictionIds = new Set<number>(config.restrictionIds);
    }
    if (toolSelectionChanged || restrictionSelectionChanged) {
      setCompassSubmenuOpen(existing, false);
      setGeometrySubmenuOpen(existing, false);
      setRelationSubmenuOpen(existing, false);
      setShapeSubmenuOpen(existing, false);
      setAngleSubmenuOpen(existing, false);
      setRootSubmenuOpen(existing, false);
      setAxisScaleSubmenuOpen(existing, false);
      setAngleDialogOpen(existing, false);
      setCompassRadiusDialogOpen(existing, false);
      setArcDialogOpen(existing, false);
      setFunctionDialogOpen(existing, false);
      setTextDialogOpen(existing, false);
      setExportDialogOpen(existing, false);
      setActiveTool(existing, '', false);
      existing.externalToolActive = false;
      notifyRegressionLayout(existing, false);
    }
    const needsDeferredRestore = restoreDgsConstruction(existing);
    if (needsDeferredRestore) scheduleDgsConstructionRestore(existing);
    applyDgsProfileRestrictions(existing);
    applyLayout(existing);
    layoutDgsSetSquare(existing, false);
    applyDgsInstrumentRequests(boardId);
    return;
  }

  if (existing) {
    disposeDgsState(existing);
  }

  const menuClip = document.createElement('div');
  menuClip.className = 'lia-dgs-menu-clip';

  const menuBar = document.createElement('div');
  menuBar.id = `dgs-menu-${uid}`;
  menuBar.className = 'lia-dgs-top-menu';
  menuBar.setAttribute('role', 'navigation');
  menuBar.setAttribute('aria-label', geometryLanguage === 'de' ? 'DGS-Menüleiste' : 'DGS toolbar');

  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'lia-dgs-geometry-button lia-dgs-select-button';
  selectButton.setAttribute('aria-label', text.normalMode);
  selectButton.setAttribute('aria-pressed', 'true');
  selectButton.title = text.normalMode;
  selectButton.innerHTML = '<svg viewBox=0,0,24,24 aria-hidden=true><path class=lia-dgs-select-pointer d=M5,3.5V20l4.2-4.1,2.6,5.2,3.3-1.65-2.55-5.1H18Z></path></svg>';
  selectButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(selectButton);

  const setSquareButton = document.createElement('button');
  setSquareButton.type = 'button';
  setSquareButton.className = 'lia-dgs-geometry-button lia-dgs-set-square-button';
  setSquareButton.setAttribute('aria-label', text.showSetSquare);
  setSquareButton.setAttribute('aria-pressed', 'false');
  setSquareButton.title = text.showSetSquare;
  setSquareButton.innerHTML = DGS_SET_SQUARE_ICON;
  setSquareButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(setSquareButton);

  const setSquareOverlay = document.createElement('div');
  setSquareOverlay.className = 'lia-dgs-set-square-overlay';
  setSquareOverlay.setAttribute('role', 'group');
  setSquareOverlay.setAttribute('aria-label', text.setSquare);
  setSquareOverlay.setAttribute('aria-hidden', 'true');
  setSquareOverlay.dataset.visible = '0';
  setSquareOverlay.innerHTML = createDgsSetSquareGraphic();
  const setSquareTitle = setSquareOverlay.querySelector('.lia-dgs-set-square-svg-title');
  if (setSquareTitle) setSquareTitle.textContent = text.rotateSetSquare;
  setSquareOverlay.addEventListener('contextmenu', (evt) => {
    evt.preventDefault();
    evt.stopImmediatePropagation();
  });

  const refinedCompassBodyIcon =
    '<path class=lia-dgs-compass-body ' +
    'd=M11.25,1h1.5M11.25,1.7h1.5M11.25,2.4h1.5' +
    'M12,1v2.1M9.85,3.1h4.3v3.7h-4.3z' +
    'M10.7,7.1L6.15,20.8l-.45,1.55M13.3,7.1l4.55,13.7,.7,1.35' +
    'M4.7,10.05h14.6M4.7,9.35v1.4M19.3,9.35v1.4></path>' +
    '<circle class=lia-dgs-compass-joint ' +
    'cx=10.45 cy=7.45 r=.72></circle>' +
    '<circle class=lia-dgs-compass-joint ' +
    'cx=13.55 cy=7.45 r=.72></circle>';
  const compassIcon =
    '<svg class=lia-dgs-compass-icon viewBox=0,0,24,24 aria-hidden=true>' +
    '<g transform=rotate(-5,12,12)>' +
    refinedCompassBodyIcon +
    '<path class=lia-dgs-compass-accent ' +
    'd=M15.4,13.4C19.2,14.2,21.2,18.1,18.55,22.15></path></g></svg>';
  const fixedRadiusCompassIcon =
    '<svg class=lia-dgs-compass-icon viewBox=0,0,24,24 aria-hidden=true>' +
    '<g transform=rotate(-5,12,12)>' +
    refinedCompassBodyIcon +
    '<path class=lia-dgs-compass-accent d=M6.15,20.8H17.85></path>' +
    '<text class=lia-dgs-compass-radius-label x=10.75 y=19.9>r</text></g></svg>';
  const compassButton = document.createElement('button');
  compassButton.type = 'button';
  compassButton.className = 'lia-dgs-geometry-button lia-dgs-compass-button';
  compassButton.setAttribute('aria-label', text.compassTools);
  compassButton.setAttribute('aria-pressed', 'false');
  compassButton.setAttribute('aria-haspopup', 'menu');
  compassButton.setAttribute('aria-expanded', 'false');
  compassButton.title = text.compass;
  compassButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-reference" d="M12 3.5L5.5 20.5M8.5 13.2h7M4.5 20.5h2M10.5 5.2h3"></path><path d="M12 3.5l6.5 17M17.5 20.5h2M5.5 18.8A8 8 0 0 1 19.8 13.5"></path></svg>';
  compassButton.title = text.compassTools;
  compassButton.innerHTML = compassIcon;
  compassButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(compassButton);

  const formatButton = document.createElement('button');
  formatButton.type = 'button';
  formatButton.className = 'lia-dgs-geometry-button lia-dgs-format-button';
  formatButton.setAttribute('aria-label', text.copyFormat);
  formatButton.setAttribute('aria-pressed', 'false');
  formatButton.title = text.copyFormat;
  formatButton.innerHTML = '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M4,5H16V10H4ZM16,7H19V12H13M13,12V20></path></svg>';
  formatButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(formatButton);

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
  const rayLabel = text.ray;
  const lineLabel = text.straightLine;
  const vectorLabel = text.vector;
  const arcLabel = text.arc;
  const arcIcon = '<svg viewBox=0,0,24,24 aria-hidden=true><path d=M5,18C7,6,16,4,20,14></path><path class=lia-dgs-cross d=M3.5,16.5l3,3M6.5,16.5l-3,3M18.5,12.5l3,3M21.5,12.5l-3,3></path></svg>';
  const segmentIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16L18 8"></path><path class="lia-dgs-cross" d="M4.5 14.5l3 3M7.5 14.5l-3 3M16.5 6.5l3 3M19.5 6.5l-3 3"></path></svg>';
  const rayIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18L22 5"></path><path class="lia-dgs-cross" d="M3.5 16.5l3 3M6.5 16.5l-3 3M11.5 10.5l3 3M14.5 10.5l-3 3"></path></svg>';
  const lineIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19L22 5"></path><path class="lia-dgs-cross" d="M4.5 14.5l3 3M7.5 14.5l-3 3M16.5 6.5l3 3M19.5 6.5l-3 3"></path></svg>';
  const vectorIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18L19 8M14.5 7.8L19 8L17.8 12.4"></path><path class="lia-dgs-cross" d="M3.5 16.5l3 3M6.5 16.5l-3 3M17.5 6.5l3 3M20.5 6.5l-3 3"></path></svg>';
  const orthogonalIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-reference" d="M3 18L21 18"></path><path d="M12 18L12 3M12 14L16 14L16 18"></path><path class="lia-dgs-cross" d="M10.5 5.5l3 3M13.5 5.5l-3 3"></path></svg>';
  const parallelIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-reference" d="M3 17L19 9"></path><path d="M5 21L21 13"></path><path class="lia-dgs-cross" d="M11.5 15.5l3 3M14.5 15.5l-3 3"></path></svg>';
  const polygonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-polygon-fill" d="M5 18L12 5L19 18Z"></path><path class="lia-dgs-cross" d="M3.5 16.5l3 3M6.5 16.5l-3 3M10.5 3.5l3 3M13.5 3.5l-3 3M17.5 16.5l3 3M20.5 16.5l-3 3"></path></svg>';
  const circleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"></circle><path class="lia-dgs-cross" d="M10.5 10.5l3 3M13.5 10.5l-3 3M17.8 10.5l3 3M20.8 10.5l-3 3"></path></svg>';
  const angleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lia-dgs-angle-fill" d="M4 20L14 20A10 10 0 0 0 8.3 10.9Z"></path><path d="M4 20L20 20M4 20L12 3M14 20A10 10 0 0 0 8.3 10.9"></path><path class="lia-dgs-cross" d="M2.5 18.5l3 3M5.5 18.5l-3 3M18.5 18.5l3 3M21.5 18.5l-3 3M10.5 1.5l3 3M13.5 1.5l-3 3"></path></svg>';
  const measuredAngleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L20 20M4 20L12 3M14 20A10 10 0 0 0 8.3 10.9"></path><path class="lia-dgs-cross" d="M2.5 18.5l3 3M5.5 18.5l-3 3M18.5 18.5l3 3M21.5 18.5l-3 3"></path><text class="lia-dgs-measure-mark" x="12.5" y="13">°</text></svg>';

  const midpointIcon = '<svg viewBox=0,0,24,24 aria-hidden=true><path class=lia-dgs-reference d=M2.5,17.5l3,3M5.5,17.5l-3,3M18.5,3.5l3,3M21.5,3.5l-3,3></path><path d=M10.5,10.5l3,3M13.5,10.5l-3,3></path></svg>';
  const angleBisectorIcon = '<svg viewBox=0,0,24,24 aria-hidden=true><path class=lia-dgs-angle-fill d=M4,20L14,20A10,10,0,0,0,8.3,10.9Z></path><path class=lia-dgs-reference d=M4,20L20,20M4,20L12,3M14,20A10,10,0,0,0,8.3,10.9M2.5,18.5l3,3M5.5,18.5l-3,3M18.5,18.5l3,3M21.5,18.5l-3,3M10.5,1.5l3,3M13.5,1.5l-3,3></path><path d=M4,20L16.7,12></path></svg>';

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

  const compassSubmenu = document.createElement('div');
  compassSubmenu.id = `dgs-compass-submenu-${uid}`;
  compassSubmenu.className = 'lia-dgs-geometry-submenu lia-dgs-compass-submenu';
  compassSubmenu.setAttribute('role', 'menu');
  compassSubmenu.setAttribute('aria-label', text.compassTools);
  compassButton.setAttribute('aria-controls', compassSubmenu.id);
  const compassToolButton = makeGeometryTool(compassSubmenu, text.freeCompass, compassIcon);
  compassToolButton.setAttribute('aria-pressed', 'false');
  const fixedRadiusCompassToolButton = makeGeometryTool(
    compassSubmenu,
    text.fixedRadiusCompass,
    fixedRadiusCompassIcon
  );
  fixedRadiusCompassToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(compassSubmenu);

  const segmentToolButton = makeGeometryTool(geometrySubmenu, segmentLabel, segmentIcon);
  segmentToolButton.setAttribute('aria-pressed', 'false');
  const rayToolButton = makeGeometryTool(geometrySubmenu, rayLabel, rayIcon);
  rayToolButton.setAttribute('aria-pressed', 'false');
  const lineToolButton = makeGeometryTool(geometrySubmenu, lineLabel, lineIcon);
  lineToolButton.setAttribute('aria-pressed', 'false');
  const vectorToolButton = makeGeometryTool(geometrySubmenu, vectorLabel, vectorIcon);
  vectorToolButton.setAttribute('aria-pressed', 'false');
  const arcToolButton = makeGeometryTool(geometrySubmenu, arcLabel, arcIcon);
  arcToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(geometrySubmenu);

  const orthogonalButton = document.createElement('button');
  orthogonalButton.type = 'button';
  orthogonalButton.className = 'lia-dgs-geometry-button lia-dgs-orthogonal-button';
  orthogonalButton.setAttribute('aria-label', geometryLanguage === 'de' ? 'Lagebeziehungen' : 'Line relations');
  orthogonalButton.setAttribute('aria-pressed', 'false');
  orthogonalButton.setAttribute('aria-haspopup', 'menu');
  orthogonalButton.setAttribute('aria-expanded', 'false');
  orthogonalButton.title = geometryLanguage === 'de' ? 'Lagebeziehungen' : 'Line relations';
  orthogonalButton.innerHTML = orthogonalIcon;
  orthogonalButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(orthogonalButton);

  const relationSubmenu = document.createElement('div');
  relationSubmenu.id = `dgs-relation-submenu-${uid}`;
  relationSubmenu.className = 'lia-dgs-geometry-submenu lia-dgs-relation-submenu';
  relationSubmenu.setAttribute('role', 'menu');
  relationSubmenu.setAttribute('aria-label', geometryLanguage === 'de' ? 'Lagebeziehungen' : 'Line relations');
  orthogonalButton.setAttribute('aria-controls', relationSubmenu.id);
  const orthogonalToolButton = makeGeometryTool(relationSubmenu, text.orthogonal, orthogonalIcon);
  orthogonalToolButton.setAttribute('aria-pressed', 'false');
  const parallelToolButton = makeGeometryTool(relationSubmenu, text.parallel, parallelIcon);
  parallelToolButton.setAttribute('aria-pressed', 'false');
  const midpointToolButton = makeGeometryTool(relationSubmenu, text.midpoint, midpointIcon);
  midpointToolButton.setAttribute('aria-pressed', 'false');
  const angleBisectorToolButton = makeGeometryTool(relationSubmenu, text.angleBisector, angleBisectorIcon);
  angleBisectorToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(relationSubmenu);

  const sectorIcon = '<svg viewBox=0,0,24,24 aria-hidden=true><path class=lia-dgs-sector-fill d=M5,19L18,19A13,13,0,0,0,10,6Z></path><path d=M5,19L18,19A13,13,0,0,0,10,6Z></path><path class=lia-dgs-cross d=M3.5,17.5l3,3M6.5,17.5l-3,3M16.5,17.5l3,3M19.5,17.5l-3,3M8.5,4.5l3,3M11.5,4.5l-3,3></path></svg>';

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
  const sectorToolButton = makeGeometryTool(shapeSubmenu, text.sector, sectorIcon);
  sectorToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(shapeSubmenu);

  const angleButton = document.createElement('button');
  angleButton.type = 'button';
  angleButton.className = 'lia-dgs-geometry-button lia-dgs-angle-button';
  angleButton.setAttribute('aria-label', text.createAngle);
  angleButton.setAttribute('aria-pressed', 'false');
  angleButton.setAttribute('aria-haspopup', 'menu');
  angleButton.setAttribute('aria-expanded', 'false');
  angleButton.title = text.createAngle;
  angleButton.innerHTML = angleIcon;
  angleButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(angleButton);

  const angleSubmenu = document.createElement('div');
  angleSubmenu.id = `dgs-angle-submenu-${uid}`;
  angleSubmenu.className = 'lia-dgs-geometry-submenu lia-dgs-angle-submenu';
  angleSubmenu.setAttribute('role', 'menu');
  angleSubmenu.setAttribute('aria-label', text.angle);
  angleButton.setAttribute('aria-controls', angleSubmenu.id);
  const angleToolButton = makeGeometryTool(angleSubmenu, text.createAngle, angleIcon);
  angleToolButton.setAttribute('aria-pressed', 'false');
  const measuredAngleToolButton = makeGeometryTool(angleSubmenu, text.createMeasuredAngle, measuredAngleIcon);
  measuredAngleToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(angleSubmenu);

  const functionDivider = document.createElement('span');
  functionDivider.className = 'lia-dgs-function-divider';
  functionDivider.setAttribute('aria-hidden', 'true');
  menuBar.appendChild(functionDivider);

  const functionButton = document.createElement('button');
  functionButton.type = 'button';
  functionButton.className = 'lia-dgs-geometry-button lia-dgs-function-button';
  functionButton.setAttribute('aria-label', text.enterFunction);
  functionButton.setAttribute('aria-pressed', 'false');
  functionButton.title = text.enterFunction;
  functionButton.innerHTML = '<span aria-hidden=true>f(x)</span>';
  functionButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(functionButton);

  const rootIcon = '<svg viewBox=0,0,32,32 aria-hidden=true>' +
    '<path class=lia-dgs-root-axis d=M2,16H30M16,30V2M13.5,4.5L16,2L18.5,4.5M27.5,13.5L30,16L27.5,18.5></path>' +
    '<path class=lia-dgs-root-curve d=M5.5,28.04C12.5,-40.49,19.5,72.49,26.5,3.96></path>' +
    '<path class=lia-dgs-root-mark d=M5.3,14.3L8.7,17.7M8.7,14.3L5.3,17.7M14.3,14.3L17.7,17.7M17.7,14.3L14.3,17.7M23.3,14.3L26.7,17.7M26.7,14.3L23.3,17.7></path>' +
    '</svg>';
  const extremaIcon = '<svg viewBox=0,0,32,32 aria-hidden=true>' +
    '<path class=lia-dgs-root-curve d=M5.5,28.04C12.5,-40.49,19.5,72.49,26.5,3.96></path>' +
    '<path class=lia-dgs-root-mark d=M8.9,3.8L12.3,7.2M12.3,3.8L8.9,7.2M19.7,24.8L23.1,28.2M23.1,24.8L19.7,28.2></path>' +
    '</svg>';
  const inflectionIcon = '<svg viewBox=0,0,32,32 aria-hidden=true>' +
    '<path class=lia-dgs-root-curve d=M5.5,28.04C12.5,-40.49,19.5,72.49,26.5,3.96></path>' +
    '<path class=lia-dgs-root-mark d=M14.3,14.3L17.7,17.7M17.7,14.3L14.3,17.7></path>' +
    '</svg>';
  const yInterceptIcon = '<svg viewBox=0,0,32,32 aria-hidden=true>' +
    '<path class=lia-dgs-root-axis d=M16,30V2M13.5,4.5L16,2L18.5,4.5></path>' +
    '<path class=lia-dgs-root-curve d=M4,26Q16,4,28,12></path>' +
    '<path class=lia-dgs-root-mark d=M14.3,9.8L17.7,13.2M17.7,9.8L14.3,13.2></path>' +
    '</svg>';
  const tangentIcon = '<svg viewBox=0,0,32,32 aria-hidden=true>' +
    '<path class=lia-dgs-root-curve d=M4,25Q16,3,28,25></path>' +
    '<path d=M5,14H27></path>' +
    '<path class=lia-dgs-root-mark d=M14.3,12.3L17.7,15.7M17.7,12.3L14.3,15.7></path>' +
    '</svg>';
  const intersectionIcon = '<svg viewBox=0,0,32,32 aria-hidden=true>' +
    '<path class=lia-dgs-root-curve d=M4,26C10,18,18,13,28,6></path>' +
    '<path class=lia-dgs-root-curve d=M4,7C11,11,20,19,28,25></path>' +
    '<path class=lia-dgs-root-mark d=M14.3,14.3L17.7,17.7M17.7,14.3L14.3,17.7></path>' +
    '</svg>';
  const rootButton = document.createElement('button');
  rootButton.type = 'button';
  rootButton.className = 'lia-dgs-geometry-button lia-dgs-root-button';
  rootButton.setAttribute('aria-label', text.analysis);
  rootButton.setAttribute('aria-pressed', 'false');
  rootButton.setAttribute('aria-haspopup', 'menu');
  rootButton.setAttribute('aria-expanded', 'false');
  rootButton.title = text.analysis;
  rootButton.innerHTML = rootIcon;
  rootButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(rootButton);

  const rootSubmenu = document.createElement('div');
  rootSubmenu.id = 'dgs-root-submenu-' + uid;
  rootSubmenu.className = 'lia-dgs-geometry-submenu lia-dgs-root-submenu';
  rootSubmenu.setAttribute('role', 'menu');
  rootSubmenu.setAttribute('aria-label', text.analysis);
  rootButton.setAttribute('aria-controls', rootSubmenu.id);
  const rootToolButton = makeGeometryTool(rootSubmenu, text.createRoots, rootIcon);
  rootToolButton.classList.add('lia-dgs-root-tool');
  rootToolButton.setAttribute('aria-pressed', 'false');
  const extremaToolButton = makeGeometryTool(rootSubmenu, text.createExtrema, extremaIcon);
  extremaToolButton.classList.add('lia-dgs-root-tool');
  extremaToolButton.setAttribute('aria-pressed', 'false');
  const inflectionToolButton = makeGeometryTool(rootSubmenu, text.createInflections, inflectionIcon);
  inflectionToolButton.classList.add('lia-dgs-root-tool');
  inflectionToolButton.setAttribute('aria-pressed', 'false');
  const yInterceptToolButton = makeGeometryTool(rootSubmenu, text.createYIntercept, yInterceptIcon);
  yInterceptToolButton.classList.add('lia-dgs-root-tool');
  yInterceptToolButton.setAttribute('aria-pressed', 'false');
  const tangentToolButton = makeGeometryTool(rootSubmenu, text.createTangent, tangentIcon);
  tangentToolButton.classList.add('lia-dgs-root-tool');
  tangentToolButton.setAttribute('aria-pressed', 'false');
  const intersectionToolButton = makeGeometryTool(rootSubmenu, text.createIntersection, intersectionIcon);
  intersectionToolButton.classList.add('lia-dgs-root-tool');
  intersectionToolButton.setAttribute('aria-pressed', 'false');
  menuBar.appendChild(rootSubmenu);

  const regressionDivider = document.createElement('span');
  regressionDivider.className = 'lia-dgs-regression-divider';
  regressionDivider.setAttribute('aria-hidden', 'true');
  regressionDivider.dataset.visible = '0';
  menuBar.appendChild(regressionDivider);
  const textDivider = document.createElement('span');
  textDivider.className = 'lia-dgs-text-divider';
  textDivider.setAttribute('aria-hidden', 'true');
  menuBar.appendChild(textDivider);
  const sliderButton = document.createElement('button');
  sliderButton.type = 'button';
  sliderButton.className = 'lia-dgs-geometry-button lia-dgs-slider-button';
  sliderButton.setAttribute('aria-label', text.insertSlider);
  sliderButton.setAttribute('aria-pressed', 'false');
  sliderButton.title = text.insertSlider;
  sliderButton.innerHTML = '<svg viewBox=0,0,24,24 aria-hidden=true><path class=lia-dgs-slider-track d=M3,12H21></path><circle class=lia-dgs-slider-knob cx=15 cy=12 r=2.5></circle></svg>';
  sliderButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(sliderButton);
  const textButton = document.createElement('button');
  textButton.type = 'button';
  textButton.className = 'lia-dgs-geometry-button lia-dgs-text-button';
  textButton.setAttribute('aria-label', text.insertText);
  textButton.setAttribute('aria-pressed', 'false');
  textButton.title = text.insertText;
  textButton.innerHTML = '<span aria-hidden=true>T</span>';
  textButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(textButton);
  const zoomDivider = document.createElement('span');
  zoomDivider.className = 'lia-dgs-zoom-divider';
  zoomDivider.setAttribute('aria-hidden', 'true');
  menuBar.appendChild(zoomDivider);
  const zoomModeButton = document.createElement('button');
  zoomModeButton.type = 'button';
  zoomModeButton.className = 'lia-dgs-geometry-button lia-dgs-zoom-mode-button';
  zoomModeButton.innerHTML = DGS_ZOOM_ICONS.both;
  zoomModeButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(zoomModeButton);
  const axisScaleButton = document.createElement('button');
  axisScaleButton.type = 'button';
  axisScaleButton.className = 'lia-dgs-geometry-button lia-dgs-axis-scale-button';
  axisScaleButton.setAttribute('aria-label', text.axisScale);
  axisScaleButton.setAttribute('aria-haspopup', 'menu');
  axisScaleButton.setAttribute('aria-expanded', 'false');
  axisScaleButton.innerHTML = DGS_AXIS_SCALE_ICONS.cartesian;
  axisScaleButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.appendChild(axisScaleButton);
  const menuEndGroup = document.createElement('div');
  menuEndGroup.className = 'lia-dgs-top-menu-end';
  menuEndGroup.setAttribute('role', 'group');
  menuEndGroup.setAttribute('aria-hidden', 'true');
  menuEndGroup.setAttribute(
    'aria-label',
    geometryLanguage === 'de' ? 'Ansicht und Objektliste' : 'View and object list'
  );
  menuEndGroup.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuEndGroup.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  }, { passive: false });
  const fullscreenButton = document.createElement('button');
  fullscreenButton.type = 'button';
  fullscreenButton.className = 'lia-dgs-geometry-button lia-dgs-fullscreen-button';
  fullscreenButton.setAttribute('aria-label', text.enterFullscreen);
  fullscreenButton.setAttribute('aria-pressed', 'false');
  fullscreenButton.title = text.enterFullscreen;
  fullscreenButton.innerHTML = DGS_FULLSCREEN_ICONS.enter;
  fullscreenButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuEndGroup.appendChild(fullscreenButton);
  const objectListButton = document.createElement('button');
  objectListButton.type = 'button';
  objectListButton.className = 'lia-dgs-geometry-button lia-dgs-object-list-button';
  objectListButton.setAttribute('aria-label', text.objectList);
  objectListButton.setAttribute('aria-pressed', 'false');
  objectListButton.title = text.objectList;
  objectListButton.innerHTML = '<svg viewBox=0,0,24,24 aria-hidden=true><circle class=lia-dgs-object-list-dot cx=5 cy=6 r=1.6></circle><circle class=lia-dgs-object-list-dot cx=5 cy=12 r=1.6></circle><circle class=lia-dgs-object-list-dot cx=5 cy=18 r=1.6></circle><path d=M9,6H21M9,12H21M9,18H21></path></svg>';
  objectListButton.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuEndGroup.appendChild(objectListButton);
  const axisScaleSubmenu = document.createElement('div');
  axisScaleSubmenu.id = 'dgs-axis-scale-submenu-' + uid;
  axisScaleSubmenu.className = 'lia-dgs-geometry-submenu lia-dgs-axis-scale-submenu';
  axisScaleSubmenu.setAttribute('role', 'menu');
  axisScaleSubmenu.setAttribute('aria-label', text.axisScale);
  axisScaleButton.setAttribute('aria-controls', axisScaleSubmenu.id);
  const cartesianScaleButton = makeGeometryTool(axisScaleSubmenu, text.cartesianScale, DGS_AXIS_SCALE_ICONS.cartesian);
  const logXScaleButton = makeGeometryTool(axisScaleSubmenu, text.logXScale, DGS_AXIS_SCALE_ICONS['log-x']);
  const logYScaleButton = makeGeometryTool(axisScaleSubmenu, text.logYScale, DGS_AXIS_SCALE_ICONS['log-y']);
  const logLogScaleButton = makeGeometryTool(axisScaleSubmenu, text.logLogScale, DGS_AXIS_SCALE_ICONS['log-log']);
  [cartesianScaleButton, logXScaleButton, logYScaleButton, logLogScaleButton].forEach((scaleButton) => {
    scaleButton.setAttribute('role', 'menuitemradio');
    scaleButton.setAttribute('aria-checked', 'false');
  });
  menuBar.appendChild(axisScaleSubmenu);
  const menuScrollSpacer = document.createElement('span');
  menuScrollSpacer.className = 'lia-dgs-top-menu-scroll-spacer';
  menuScrollSpacer.setAttribute('aria-hidden', 'true');
  menuBar.appendChild(menuScrollSpacer);
  menuClip.appendChild(menuBar);

  // The toolbar scrolls horizontally and therefore clips its own descendants.
  // Keep flyout menus in the board-sized clip layer so they can extend below it.
  const flyoutSubmenus = [
    compassSubmenu,
    geometrySubmenu,
    relationSubmenu,
    shapeSubmenu,
    angleSubmenu,
    rootSubmenu,
    axisScaleSubmenu
  ];
  flyoutSubmenus.forEach((submenu) => menuClip.appendChild(submenu));

  const menuScrollMaskStart = document.createElement('div');
  menuScrollMaskStart.className = 'lia-dgs-top-menu-mask-start';
  menuClip.appendChild(menuScrollMaskStart);

  const menuScrollFadeStart = document.createElement('div');
  menuScrollFadeStart.className = 'lia-dgs-top-menu-fade lia-dgs-top-menu-fade-start';
  menuClip.appendChild(menuScrollFadeStart);

  const menuScrollFadeEnd = document.createElement('div');
  menuScrollFadeEnd.className = 'lia-dgs-top-menu-fade lia-dgs-top-menu-fade-end';
  menuClip.appendChild(menuScrollFadeEnd);
  menuClip.appendChild(menuEndGroup);

  const updateMenuScrollFades = (): void => {
    const maxScrollLeft = menuBar.scrollWidth - menuBar.clientWidth;
    menuScrollFadeStart.setAttribute('data-visible', menuBar.scrollLeft > 1 ? '1' : '0');
    menuScrollFadeEnd.setAttribute('data-visible', menuBar.scrollLeft < maxScrollLeft - 1 ? '1' : '0');
  };
  menuBar.addEventListener('scroll', updateMenuScrollFades, { passive: true });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(updateMenuScrollFades).observe(menuBar);
  }
  updateMenuScrollFades();

  const sideMenuClip = document.createElement('div');
  sideMenuClip.className = 'lia-dgs-side-menu-clip';

  const sideMenu = document.createElement('div');
  sideMenu.id = `dgs-side-menu-${uid}`;
  sideMenu.className = 'lia-dgs-side-menu';
  sideMenu.setAttribute('role', 'dialog');
  sideMenu.setAttribute('aria-label', geometryLanguage === 'de' ? 'DGS-Objekteigenschaften' : 'DGS object properties');

  const objectListClip = document.createElement('div');
  objectListClip.className = 'lia-dgs-object-list-clip';
  const objectListPanel = document.createElement('div');
  objectListPanel.id = 'dgs-object-list-' + uid;
  objectListPanel.className = 'lia-dgs-object-list-panel';
  objectListPanel.setAttribute('role', 'complementary');
  objectListPanel.setAttribute('aria-label', text.objectList);
  objectListPanel.setAttribute('aria-hidden', 'true');
  objectListButton.setAttribute('aria-controls', objectListPanel.id);
  const objectListHeader = document.createElement('div');
  objectListHeader.className = 'lia-dgs-object-list-header';
  const objectListTitle = document.createElement('span');
  objectListTitle.textContent = text.objectList;
  const objectListCloseButton = document.createElement('button');
  objectListCloseButton.type = 'button';
  objectListCloseButton.className = 'lia-dgs-side-menu-close';
  objectListCloseButton.setAttribute(
    'aria-label',
    geometryLanguage === 'de' ? 'Objektliste schlieÃŸen' : 'Close object list'
  );
  objectListCloseButton.textContent = '\u00d7';
  objectListHeader.appendChild(objectListTitle);
  objectListHeader.appendChild(objectListCloseButton);
  const objectListContent = document.createElement('div');
  objectListContent.className = 'lia-dgs-object-list-content';
  const objectListFooter = document.createElement('div');
  objectListFooter.className = 'lia-dgs-object-list-footer';
  const objectListExportButton = document.createElement('button');
  objectListExportButton.type = 'button';
  objectListExportButton.className = 'lia-dgs-object-list-export';
  objectListExportButton.textContent = text.exportMacros;
  objectListExportButton.title = text.exportMacrosTitle;
  objectListExportButton.setAttribute('aria-label', text.exportMacrosTitle);
  objectListExportButton.tabIndex = -1;
  objectListFooter.appendChild(objectListExportButton);
  objectListPanel.appendChild(objectListHeader);
  objectListPanel.appendChild(objectListContent);
  objectListPanel.appendChild(objectListFooter);
  objectListClip.appendChild(objectListPanel);

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
    input.inputMode = 'text';
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

  const angleMeasureSection = document.createElement('div');
  angleMeasureSection.className = 'lia-dgs-angle-measure-section';
  angleMeasureSection.hidden = true;
  const angleMeasureTitle = document.createElement('div');
  angleMeasureTitle.className = 'lia-dgs-context-section-title';
  angleMeasureTitle.textContent = text.angleMeasure;
  const angleMeasureRow = document.createElement('label');
  angleMeasureRow.className = 'lia-dgs-angle-measure-row';
  const angleMeasureInput = document.createElement('input');
  angleMeasureInput.type = 'text';
  angleMeasureInput.inputMode = 'decimal';
  angleMeasureInput.className = 'lia-dgs-angle-measure-input';
  angleMeasureInput.setAttribute('aria-label', text.angleMeasure);
  angleMeasureInput.setAttribute('aria-invalid', 'false');
  const angleMeasureUnit = document.createElement('span');
  angleMeasureUnit.textContent = '°';
  angleMeasureRow.appendChild(angleMeasureInput);
  angleMeasureRow.appendChild(angleMeasureUnit);
  angleMeasureSection.appendChild(angleMeasureTitle);
  angleMeasureSection.appendChild(angleMeasureRow);
  sideMenu.appendChild(angleMeasureSection);

  const arcSettingsSection = document.createElement('div');
  arcSettingsSection.className = 'lia-dgs-slider-settings-section lia-dgs-arc-settings-section';
  arcSettingsSection.hidden = true;
  const arcSettingsTitle = document.createElement('div');
  arcSettingsTitle.className = 'lia-dgs-context-section-title';
  arcSettingsTitle.textContent = text.arc;
  const arcSettingsGrid = document.createElement('div');
  arcSettingsGrid.className = 'lia-dgs-slider-settings-grid';
  const makeArcSettingsField = (captionText: string) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-slider-field';
    const caption = document.createElement('span');
    caption.textContent = captionText + ' (°)';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', captionText);
    input.setAttribute('aria-invalid', 'false');
    label.appendChild(caption);
    label.appendChild(input);
    arcSettingsGrid.appendChild(label);
    return input;
  };

  const arcExitAngleInput = makeArcSettingsField(text.exitAngle);
  const arcEntryAngleInput = makeArcSettingsField(text.entryAngle);
  arcSettingsSection.appendChild(arcSettingsTitle);
  arcSettingsSection.appendChild(arcSettingsGrid);
  sideMenu.appendChild(arcSettingsSection);

  const strokeStyleSection = document.createElement('div');
  strokeStyleSection.className = 'lia-dgs-slider-settings-section lia-dgs-stroke-style-section';
  strokeStyleSection.hidden = true;
  const strokeStyleTitle = document.createElement('div');
  strokeStyleTitle.className = 'lia-dgs-context-section-title';
  strokeStyleTitle.textContent = text.appearance;
  const strokeStyleGrid = document.createElement('div');
  strokeStyleGrid.className = 'lia-dgs-slider-settings-grid';
  const lineStyleField = document.createElement('label');
  lineStyleField.className = 'lia-dgs-slider-field';
  lineStyleField.dataset.wide = '1';
  const lineStyleCaption = document.createElement('span');
  lineStyleCaption.textContent = text.lineStyle;
  const lineStyleSelect = document.createElement('select');
  lineStyleSelect.className = 'lia-dgs-line-style-select';
  lineStyleSelect.setAttribute('aria-label', text.lineStyle);
  lineStyleSelect.title = text.lineStyle;
  (['solid', 'dashed', 'dotted', 'dashdotted'] as DgsLineStyle[]).forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text[value];
    lineStyleSelect.appendChild(option);
  });
  lineStyleField.appendChild(lineStyleCaption);
  lineStyleField.appendChild(lineStyleSelect);
  const strokeDesignField = document.createElement('label');
  strokeDesignField.className = 'lia-dgs-slider-field';
  const strokeDesignCaption = document.createElement('span');
  strokeDesignCaption.textContent = text.design;
  const strokeDesignSelect = document.createElement('select');
  strokeDesignSelect.setAttribute('aria-label', text.design);
  strokeDesignSelect.title = text.design;
  [
    '-', '->', '<-', '<->',
    '|->', '|<-', '|<->',
    '->|', '<-|', '<->|',
    '|->|', '|<-|', '|<->|'
  ].forEach((design) => {
    const option = document.createElement('option');
    option.value = design;
    option.textContent = design;
    strokeDesignSelect.appendChild(option);
  });
  strokeDesignField.appendChild(strokeDesignCaption);
  strokeDesignField.appendChild(strokeDesignSelect);
  const strokeWidthField = document.createElement('label');
  strokeWidthField.className = 'lia-dgs-slider-field';
  const strokeWidthCaption = document.createElement('span');
  strokeWidthCaption.textContent = text.strokeWidth + ' (px)';
  const strokeWidthInput = document.createElement('input');
  strokeWidthInput.type = 'text';
  strokeWidthInput.inputMode = 'decimal';
  strokeWidthInput.autocomplete = 'off';
  strokeWidthInput.spellcheck = false;
  strokeWidthInput.setAttribute('aria-label', text.strokeWidth);
  strokeWidthInput.setAttribute('aria-invalid', 'false');
  strokeWidthField.appendChild(strokeWidthCaption);
  strokeWidthField.appendChild(strokeWidthInput);
  strokeStyleGrid.appendChild(lineStyleField);
  strokeStyleGrid.appendChild(strokeDesignField);
  strokeStyleGrid.appendChild(strokeWidthField);
  strokeStyleSection.appendChild(strokeStyleTitle);
  strokeStyleSection.appendChild(strokeStyleGrid);
  sideMenu.appendChild(strokeStyleSection);

  const functionExpressionSection = document.createElement('div');
  functionExpressionSection.className = 'lia-dgs-function-expression-section';
  functionExpressionSection.hidden = true;
  const functionExpressionTitle = document.createElement('div');
  functionExpressionTitle.className = 'lia-dgs-context-section-title';
  functionExpressionTitle.textContent = text.functionEquation;
  const functionExpressionPreview = document.createElement('div');
  functionExpressionPreview.className = 'lia-dgs-function-expression-preview';
  const functionExpressionInput = document.createElement('input');
  functionExpressionInput.type = 'text';
  functionExpressionInput.className = 'lia-dgs-coordinate-input lia-dgs-function-expression-input';
  functionExpressionInput.setAttribute('aria-label', text.functionInput);
  functionExpressionInput.setAttribute('aria-invalid', 'false');
  functionExpressionInput.autocomplete = 'off';
  functionExpressionInput.spellcheck = false;
  functionExpressionSection.appendChild(functionExpressionTitle);
  functionExpressionSection.appendChild(functionExpressionPreview);
  functionExpressionSection.appendChild(functionExpressionInput);
  sideMenu.appendChild(functionExpressionSection);

  const sliderSettingsSection = document.createElement('div');
  sliderSettingsSection.className = 'lia-dgs-slider-settings-section';
  sliderSettingsSection.hidden = true;
  const sliderSettingsTitle = document.createElement('div');
  sliderSettingsTitle.className = 'lia-dgs-context-section-title';
  sliderSettingsTitle.textContent = text.slider;
  const sliderSettingsGrid = document.createElement('div');
  sliderSettingsGrid.className = 'lia-dgs-slider-settings-grid';
  const makeSliderField = (captionText: string, wide = false) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-slider-field';
    if (wide) label.dataset.wide = '1';
    const caption = document.createElement('span');
    caption.textContent = captionText;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', captionText);
    input.setAttribute('aria-invalid', 'false');
    label.appendChild(caption);
    label.appendChild(input);
    sliderSettingsGrid.appendChild(label);
    return input;
  };
  const sliderValueInput = makeSliderField(text.currentValue, true);
  const sliderMinInput = makeSliderField(text.minimum);
  const sliderMaxInput = makeSliderField(text.maximum);
  const sliderStepInput = makeSliderField(text.stepWidth, true);
  sliderSettingsSection.appendChild(sliderSettingsTitle);
  sliderSettingsSection.appendChild(sliderSettingsGrid);
  sideMenu.appendChild(sliderSettingsSection);

  const textFontSizeSection = document.createElement('label');
  textFontSizeSection.className = 'lia-dgs-layer-row';
  textFontSizeSection.hidden = true;
  const textFontSizeCaption = document.createElement('span');
  textFontSizeCaption.textContent = text.fontSize;
  const textFontSizeInput = document.createElement('input');
  textFontSizeInput.type = 'number';
  textFontSizeInput.className = 'lia-dgs-layer-input';
  textFontSizeInput.min = '8';
  textFontSizeInput.max = '96';
  textFontSizeInput.step = '1';
  textFontSizeInput.value = '18';
  textFontSizeInput.setAttribute('aria-label', text.fontSize);
  textFontSizeSection.appendChild(textFontSizeCaption);
  textFontSizeSection.appendChild(textFontSizeInput);
  sideMenu.appendChild(textFontSizeSection);

  const axisLabelSection = document.createElement('div');
  axisLabelSection.className = 'lia-dgs-function-expression-section lia-dgs-axis-label-section';
  axisLabelSection.hidden = true;
  const makeAxisLabelField = (captionText: string) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-coordinate-field';
    const caption = document.createElement('span');
    caption.textContent = captionText;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'lia-dgs-coordinate-input';
    input.setAttribute('aria-label', captionText);
    input.setAttribute('aria-invalid', 'false');
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.appendChild(caption);
    label.appendChild(input);
    axisLabelSection.appendChild(label);
    return input;
  };
  const axisVariableInput = makeAxisLabelField(text.variableName);
  const axisDescriptionInput = makeAxisLabelField(text.axisDescription);
  sideMenu.appendChild(axisLabelSection);

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
  const traceOption = makeContextOption(text.trace);
  traceOption.label.hidden = true;
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
  const makeColorButton = (kind: 'text' | 'line' | 'fill' | 'trace', caption: string) => {
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
  const lineColorButton = makeColorButton('line', text.lineColor);
  const fillColorButton = makeColorButton('fill', text.fillColor);
  const traceColorButton = makeColorButton('trace', text.traceColor);
  traceColorButton.hidden = true;
  const colorPreview = colorPreviews[0];
  sideMenu.appendChild(colorSection);

  const clearTraceButton = document.createElement('button');
  clearTraceButton.type = 'button';
  clearTraceButton.className = 'lia-dgs-trace-clear-button';
  clearTraceButton.textContent = text.clearTrace;
  clearTraceButton.hidden = true;
  sideMenu.appendChild(clearTraceButton);

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

  const angleDialog = document.createElement('div');
  angleDialog.className = 'lia-dgs-angle-dialog';
  angleDialog.setAttribute('role', 'dialog');
  angleDialog.setAttribute('aria-modal', 'true');
  angleDialog.setAttribute('aria-hidden', 'true');
  angleDialog.dataset.open = '0';
  const angleDialogTitle = document.createElement('div');
  angleDialogTitle.className = 'lia-dgs-angle-dialog-title';
  angleDialogTitle.textContent = text.createMeasuredAngle;
  const angleDialogField = document.createElement('label');
  angleDialogField.className = 'lia-dgs-angle-dialog-field';
  const angleDialogInput = document.createElement('input');
  angleDialogInput.type = 'text';
  angleDialogInput.inputMode = 'decimal';
  angleDialogInput.className = 'lia-dgs-angle-dialog-input';
  angleDialogInput.setAttribute('aria-label', text.angleMeasure);
  angleDialogInput.setAttribute('aria-invalid', 'false');
  angleDialogInput.value = '90';
  const angleDialogUnit = document.createElement('span');
  angleDialogUnit.textContent = '°';
  angleDialogField.appendChild(angleDialogInput);
  angleDialogField.appendChild(angleDialogUnit);
  const angleDialogActions = document.createElement('div');
  angleDialogActions.className = 'lia-dgs-angle-dialog-actions';
  const angleDialogCancelButton = document.createElement('button');
  angleDialogCancelButton.type = 'button';
  angleDialogCancelButton.className = 'lia-dgs-angle-dialog-button';
  angleDialogCancelButton.textContent = text.cancel;
  const angleDialogConfirmButton = document.createElement('button');
  angleDialogConfirmButton.type = 'button';
  angleDialogConfirmButton.className = 'lia-dgs-angle-dialog-button';
  angleDialogConfirmButton.dataset.primary = '1';
  angleDialogConfirmButton.textContent = text.create;
  angleDialogActions.appendChild(angleDialogCancelButton);
  angleDialogActions.appendChild(angleDialogConfirmButton);
  angleDialog.appendChild(angleDialogTitle);
  angleDialog.appendChild(angleDialogField);
  angleDialog.appendChild(angleDialogActions);

  const compassRadiusDialog = document.createElement('div');
  compassRadiusDialog.className =
    'lia-dgs-angle-dialog lia-dgs-function-dialog lia-dgs-compass-radius-dialog';
  compassRadiusDialog.setAttribute('role', 'dialog');
  compassRadiusDialog.setAttribute('aria-modal', 'true');
  compassRadiusDialog.setAttribute('aria-hidden', 'true');
  compassRadiusDialog.dataset.open = '0';
  const compassRadiusDialogTitle = document.createElement('div');
  compassRadiusDialogTitle.className = 'lia-dgs-angle-dialog-title';
  compassRadiusDialogTitle.textContent = text.enterCompassRadius;
  const compassRadiusDialogField = document.createElement('label');
  compassRadiusDialogField.className = 'lia-dgs-angle-dialog-field';
  const compassRadiusDialogInput = document.createElement('input');
  compassRadiusDialogInput.type = 'text';
  compassRadiusDialogInput.inputMode = 'decimal';
  compassRadiusDialogInput.className = 'lia-dgs-angle-dialog-input';
  compassRadiusDialogInput.setAttribute('aria-label', text.radius);
  compassRadiusDialogInput.setAttribute('aria-invalid', 'false');
  compassRadiusDialogInput.autocomplete = 'off';
  compassRadiusDialogInput.spellcheck = false;
  compassRadiusDialogField.appendChild(compassRadiusDialogInput);
  const compassRadiusDialogActions = document.createElement('div');
  compassRadiusDialogActions.className = 'lia-dgs-angle-dialog-actions';
  const compassRadiusDialogCancelButton = document.createElement('button');
  compassRadiusDialogCancelButton.type = 'button';
  compassRadiusDialogCancelButton.className = 'lia-dgs-angle-dialog-button';
  compassRadiusDialogCancelButton.textContent = text.cancel;
  const compassRadiusDialogConfirmButton = document.createElement('button');
  compassRadiusDialogConfirmButton.type = 'button';
  compassRadiusDialogConfirmButton.className = 'lia-dgs-angle-dialog-button';
  compassRadiusDialogConfirmButton.dataset.primary = '1';
  compassRadiusDialogConfirmButton.textContent = text.create;
  compassRadiusDialogActions.appendChild(compassRadiusDialogCancelButton);
  compassRadiusDialogActions.appendChild(compassRadiusDialogConfirmButton);
  compassRadiusDialog.appendChild(compassRadiusDialogTitle);
  compassRadiusDialog.appendChild(compassRadiusDialogField);
  compassRadiusDialog.appendChild(compassRadiusDialogActions);

  const arcDialog = document.createElement('div');
  arcDialog.className = 'lia-dgs-angle-dialog lia-dgs-function-dialog lia-dgs-arc-dialog';
  arcDialog.setAttribute('role', 'dialog');
  arcDialog.setAttribute('aria-modal', 'true');
  arcDialog.setAttribute('aria-hidden', 'true');
  arcDialog.dataset.open = '0';
  const arcDialogTitle = document.createElement('div');
  arcDialogTitle.className = 'lia-dgs-angle-dialog-title';
  arcDialogTitle.textContent = text.createArc;
  const arcDialogFields = document.createElement('div');
  arcDialogFields.className = 'lia-dgs-slider-settings-grid';
  const makeArcDialogField = (captionText: string) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-slider-field';
    const caption = document.createElement('span');
    caption.textContent = captionText + ' (°)';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'lia-dgs-angle-dialog-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', captionText);
    input.setAttribute('aria-invalid', 'false');
    label.appendChild(caption);
    label.appendChild(input);
    arcDialogFields.appendChild(label);
    return input;
  };
  const arcDialogExitInput = makeArcDialogField(text.exitAngle);
  const arcDialogEntryInput = makeArcDialogField(text.entryAngle);
  const arcDialogActions = document.createElement('div');
  arcDialogActions.className = 'lia-dgs-angle-dialog-actions';
  const arcDialogCancelButton = document.createElement('button');
  arcDialogCancelButton.type = 'button';
  arcDialogCancelButton.className = 'lia-dgs-angle-dialog-button';
  arcDialogCancelButton.textContent = text.cancel;
  const arcDialogConfirmButton = document.createElement('button');
  arcDialogConfirmButton.type = 'button';
  arcDialogConfirmButton.className = 'lia-dgs-angle-dialog-button';
  arcDialogConfirmButton.dataset.primary = '1';
  arcDialogConfirmButton.textContent = text.create;
  arcDialogActions.appendChild(arcDialogCancelButton);
  arcDialogActions.appendChild(arcDialogConfirmButton);
  arcDialog.appendChild(arcDialogTitle);
  arcDialog.appendChild(arcDialogFields);
  arcDialog.appendChild(arcDialogActions);

  const functionDialog = document.createElement('div');
  functionDialog.className = 'lia-dgs-angle-dialog lia-dgs-function-dialog';
  functionDialog.setAttribute('role', 'dialog');
  functionDialog.setAttribute('aria-modal', 'true');
  functionDialog.setAttribute('aria-hidden', 'true');
  functionDialog.dataset.open = '0';
  const functionDialogTitle = document.createElement('div');
  functionDialogTitle.className = 'lia-dgs-angle-dialog-title';
  functionDialogTitle.textContent = text.enterFunction;
  const functionDialogField = document.createElement('label');
  functionDialogField.className = 'lia-dgs-angle-dialog-field';
  const functionDialogInput = document.createElement('input');
  functionDialogInput.type = 'text';
  functionDialogInput.className = 'lia-dgs-angle-dialog-input';
  functionDialogInput.setAttribute('aria-label', text.functionInput);
  functionDialogInput.setAttribute('aria-invalid', 'false');
  functionDialogInput.autocomplete = 'off';
  functionDialogInput.spellcheck = false;
  functionDialogInput.placeholder = 'z. B. x^2 - 2x  oder  \\frac{1}{2}x^2';
  functionDialogField.appendChild(functionDialogInput);
  const functionDialogHint = document.createElement('div');
  functionDialogHint.className = 'lia-dgs-function-dialog-hint';
  functionDialogHint.textContent = 'JSXGraph / TeX';
  const functionDialogActions = document.createElement('div');
  functionDialogActions.className = 'lia-dgs-angle-dialog-actions';
  const functionDialogCancelButton = document.createElement('button');
  functionDialogCancelButton.type = 'button';
  functionDialogCancelButton.className = 'lia-dgs-angle-dialog-button';
  functionDialogCancelButton.textContent = text.cancel;
  const functionDialogConfirmButton = document.createElement('button');
  functionDialogConfirmButton.type = 'button';
  functionDialogConfirmButton.className = 'lia-dgs-angle-dialog-button';
  functionDialogConfirmButton.dataset.primary = '1';
  functionDialogConfirmButton.textContent = text.create;
  functionDialogActions.appendChild(functionDialogCancelButton);
  functionDialogActions.appendChild(functionDialogConfirmButton);
  functionDialog.appendChild(functionDialogTitle);
  functionDialog.appendChild(functionDialogField);
  functionDialog.appendChild(functionDialogHint);
  functionDialog.appendChild(functionDialogActions);

  const textDialog = document.createElement('div');
  textDialog.className = 'lia-dgs-angle-dialog lia-dgs-function-dialog lia-dgs-text-dialog';
  textDialog.setAttribute('role', 'dialog');
  textDialog.setAttribute('aria-modal', 'true');
  textDialog.setAttribute('aria-hidden', 'true');
  textDialog.dataset.open = '0';
  const textDialogTitle = document.createElement('div');
  textDialogTitle.className = 'lia-dgs-angle-dialog-title';
  textDialogTitle.textContent = text.insertText;
  const textDialogField = document.createElement('label');
  textDialogField.className = 'lia-dgs-angle-dialog-field';
  const textDialogInput = document.createElement('input');
  textDialogInput.type = 'text';
  textDialogInput.className = 'lia-dgs-angle-dialog-input';
  textDialogInput.setAttribute('aria-label', text.textInput);
  textDialogInput.setAttribute('aria-invalid', 'false');
  textDialogInput.autocomplete = 'off';
  textDialogInput.spellcheck = true;
  textDialogField.appendChild(textDialogInput);
  const textDialogActions = document.createElement('div');
  textDialogActions.className = 'lia-dgs-angle-dialog-actions';
  const textDialogCancelButton = document.createElement('button');
  textDialogCancelButton.type = 'button';
  textDialogCancelButton.className = 'lia-dgs-angle-dialog-button';
  textDialogCancelButton.textContent = text.cancel;
  const textDialogConfirmButton = document.createElement('button');
  textDialogConfirmButton.type = 'button';
  textDialogConfirmButton.className = 'lia-dgs-angle-dialog-button';
  textDialogConfirmButton.dataset.primary = '1';
  textDialogConfirmButton.textContent = text.create;
  textDialogActions.appendChild(textDialogCancelButton);
  textDialogActions.appendChild(textDialogConfirmButton);
  textDialog.appendChild(textDialogTitle);
  textDialog.appendChild(textDialogField);
  textDialog.appendChild(textDialogActions);

  const exportDialog = document.createElement('div');
  exportDialog.className = 'lia-dgs-angle-dialog lia-dgs-function-dialog lia-dgs-export-dialog';
  exportDialog.setAttribute('role', 'dialog');
  exportDialog.setAttribute('aria-modal', 'true');
  exportDialog.setAttribute('aria-hidden', 'true');
  exportDialog.dataset.open = '0';
  const exportDialogTitle = document.createElement('div');
  exportDialogTitle.id = 'dgs-export-dialog-title-' + uid;
  exportDialogTitle.className = 'lia-dgs-angle-dialog-title';
  exportDialogTitle.textContent = text.exportToolsTitle;
  exportDialog.setAttribute('aria-labelledby', exportDialogTitle.id);
  const exportToolsStep = document.createElement('div');
  exportToolsStep.className = 'lia-dgs-export-step lia-dgs-export-tools-step';
  const exportToolsHint = document.createElement('div');
  exportToolsHint.className = 'lia-dgs-export-tools-hint';
  exportToolsHint.textContent = text.exportToolsHint;
  const exportToolGroups = document.createElement('div');
  exportToolGroups.className = 'lia-dgs-export-tool-groups';
  exportToolGroups.setAttribute('role', 'group');
  exportToolGroups.setAttribute('aria-label', text.exportToolsTitle);
  const exportToolButtons = new Map<number, HTMLButtonElement>();
  type ExportToolDefinition = {
    id: number;
    label: string;
    icon: string;
    className?: string;
  };
  const appendExportToolGroup = (
    label: string,
    columns: ExportToolDefinition[][]
  ) => {
    const group = document.createElement('div');
    group.className = 'lia-dgs-export-tool-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    columns.forEach((definitions) => {
      const column = document.createElement('div');
      column.className = 'lia-dgs-export-tool-column';
      definitions.forEach((definition) => {
        const toolButton = document.createElement('button');
        toolButton.type = 'button';
        toolButton.className = 'lia-dgs-geometry-button lia-dgs-export-tool ' +
          String(definition.className || '');
        toolButton.dataset.toolId = String(definition.id);
        toolButton.dataset.enabled = '1';
        toolButton.setAttribute('aria-pressed', 'true');
        toolButton.setAttribute('aria-label', definition.label + ': ' + text.toolAvailable);
        toolButton.title = definition.label;
        toolButton.innerHTML =
          '<span class="lia-dgs-export-tool-icon" aria-hidden="true">' +
          definition.icon +
          '</span><span class="lia-dgs-export-tool-status" aria-hidden="true">\u2713</span>';
        column.appendChild(toolButton);
        exportToolButtons.set(definition.id, toolButton);
      });
      group.appendChild(column);
    });
    exportToolGroups.appendChild(group);
  };
  const regressionDrawIcon = boardContainer
    .querySelector<HTMLButtonElement>('.lia-plot-draw-btn')?.innerHTML ||
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.7-1.1L19 8.6 15.4 5 5.1 15.3zM13.9 6.5l3.6 3.6"></path><circle class="ico-color-dot" cx="16.5" cy="16.5" r="4.5"></circle></svg>';
  const regressionEraseIcon = boardContainer
    .querySelector<HTMLButtonElement>('.lia-plot-erase-toggle')?.innerHTML ||
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 15.7l8-8a2 2 0 0 1 2.8 0l3.1 3.1a2 2 0 0 1 0 2.8l-6.7 6.7H9.3l-3.1-3.1a2 2 0 0 1 0-1.5zM9.2 20.3h8M10 13.9l5.7 5.7"></path></svg>';
  const regressionToolsIcon = boardContainer
    .querySelector<HTMLButtonElement>('.lia-plot-regression-toggle')?.innerHTML ||
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18h4M7 16v4M12.8 4.5l1.7 3.5 3.9.5-2.8 2.7.7 3.8-3.5-1.8-3.5 1.8.7-3.8-2.8-2.7 3.9-.5z"></path></svg>';
  appendExportToolGroup(geometryLanguage === 'de' ? 'Format' : 'Formatting', [[
    { id: DGS_TOOL_IDS.formatCopy, label: text.copyFormat, icon: formatButton.innerHTML, className: 'lia-dgs-format-button' }
  ]]);
  appendExportToolGroup(geometryLanguage === 'de' ? 'Geometrie' : 'Geometry', [
    [{ id: DGS_TOOL_IDS.point, label: text.point, icon: pointButton.innerHTML, className: 'lia-dgs-point-button' }],
    [
      { id: DGS_TOOL_IDS.segment, label: text.segment, icon: segmentIcon, className: 'lia-dgs-segment-button' },
      { id: DGS_TOOL_IDS.ray, label: text.ray, icon: rayIcon, className: 'lia-dgs-segment-button' },
      { id: DGS_TOOL_IDS.line, label: text.line, icon: lineIcon, className: 'lia-dgs-segment-button' },
      { id: DGS_TOOL_IDS.vector, label: text.vector, icon: vectorIcon, className: 'lia-dgs-segment-button' },
      { id: DGS_TOOL_IDS.arc, label: text.arc, icon: arcIcon, className: 'lia-dgs-segment-button' }
    ],
    [
      { id: DGS_TOOL_IDS.orthogonal, label: text.orthogonal, icon: orthogonalIcon, className: 'lia-dgs-orthogonal-button' },
      { id: DGS_TOOL_IDS.parallel, label: text.parallel, icon: parallelIcon, className: 'lia-dgs-orthogonal-button' },
      { id: DGS_TOOL_IDS.midpoint, label: text.midpoint, icon: midpointIcon, className: 'lia-dgs-orthogonal-button' },
      { id: DGS_TOOL_IDS.angleBisector, label: text.angleBisector, icon: angleBisectorIcon, className: 'lia-dgs-orthogonal-button' }
    ],
    [
      { id: DGS_TOOL_IDS.polygon, label: text.polygon, icon: polygonIcon, className: 'lia-dgs-polygon-button' },
      { id: DGS_TOOL_IDS.circle, label: text.circle, icon: circleIcon, className: 'lia-dgs-polygon-button' },
      { id: DGS_TOOL_IDS.sector, label: text.sector, icon: sectorIcon, className: 'lia-dgs-polygon-button' }
    ],
    [
      { id: DGS_TOOL_IDS.angle, label: text.angle, icon: angleIcon, className: 'lia-dgs-angle-button' },
      { id: DGS_TOOL_IDS.measuredAngle, label: text.createMeasuredAngle, icon: measuredAngleIcon, className: 'lia-dgs-angle-button' }
    ]
  ]);
  appendExportToolGroup(geometryLanguage === 'de' ? 'Funktionen' : 'Functions', [
    [{ id: DGS_TOOL_IDS.function, label: text.function, icon: functionButton.innerHTML, className: 'lia-dgs-function-button' }],
    [
      { id: DGS_TOOL_IDS.roots, label: text.root, icon: rootIcon, className: 'lia-dgs-root-button' },
      { id: DGS_TOOL_IDS.extrema, label: text.extremum, icon: extremaIcon, className: 'lia-dgs-root-button' },
      { id: DGS_TOOL_IDS.inflections, label: text.inflection, icon: inflectionIcon, className: 'lia-dgs-root-button' },
      { id: DGS_TOOL_IDS.ordinateIntercept, label: text.yIntercept, icon: yInterceptIcon, className: 'lia-dgs-root-button' },
      { id: DGS_TOOL_IDS.tangent, label: text.tangent, icon: tangentIcon, className: 'lia-dgs-root-button' },
      { id: DGS_TOOL_IDS.intersection, label: text.intersection, icon: intersectionIcon, className: 'lia-dgs-root-button' }
    ]
  ]);
  appendExportToolGroup(geometryLanguage === 'de' ? 'Zeichnen und Regression' : 'Drawing and regression', [
    [{ id: DGS_TOOL_IDS.regressionDraw, label: geometryLanguage === 'de' ? 'Freihandzeichnen' : 'Freehand drawing', icon: regressionDrawIcon, className: 'lia-dgs-export-regression-tool' }],
    [{ id: DGS_TOOL_IDS.regressionErase, label: geometryLanguage === 'de' ? 'Radierer' : 'Eraser', icon: regressionEraseIcon, className: 'lia-dgs-export-regression-tool' }],
    [{ id: DGS_TOOL_IDS.regressionTools, label: geometryLanguage === 'de' ? 'Regression' : 'Regression', icon: regressionToolsIcon, className: 'lia-dgs-export-regression-tool' }]
  ]);
  appendExportToolGroup(geometryLanguage === 'de' ? 'Inhalte' : 'Content', [
    [{ id: DGS_TOOL_IDS.slider, label: text.slider, icon: sliderButton.innerHTML, className: 'lia-dgs-slider-button' }],
    [{ id: DGS_TOOL_IDS.text, label: text.text, icon: textButton.innerHTML, className: 'lia-dgs-text-button' }]
  ]);
  appendExportToolGroup(geometryLanguage === 'de' ? 'Ansicht' : 'View', [
    [{ id: DGS_TOOL_IDS.zoom, label: text.zoomBoth, icon: zoomModeButton.innerHTML, className: 'lia-dgs-zoom-mode-button' }],
    [{ id: DGS_TOOL_IDS.axisScale, label: text.axisScale, icon: axisScaleButton.innerHTML, className: 'lia-dgs-axis-scale-button' }]
  ]);
  const exportRestrictions = document.createElement('div');
  exportRestrictions.className = 'lia-dgs-export-restrictions';
  exportRestrictions.setAttribute('role', 'group');
  const exportRestrictionsTitle = document.createElement('div');
  exportRestrictionsTitle.id = 'dgs-export-restrictions-title-' + uid;
  exportRestrictionsTitle.className = 'lia-dgs-export-restrictions-title';
  exportRestrictionsTitle.textContent = text.exportRestrictionsTitle;
  exportRestrictions.setAttribute('aria-labelledby', exportRestrictionsTitle.id);
  exportRestrictions.appendChild(exportRestrictionsTitle);
  const exportRestrictionInputs = new Map<number, HTMLInputElement>();
  const exportRestrictionLabels: Record<DgsRestrictionId, string> = {
    [DGS_RESTRICTION_IDS.objectPropertiesLocked]: text.lockObjectProperties,
    [DGS_RESTRICTION_IDS.objectPropertiesColorsTraceOnly]: text.colorsTracePropertiesOnly,
    [DGS_RESTRICTION_IDS.valueControlsLocked]: text.lockValueControls,
    [DGS_RESTRICTION_IDS.exportLocked]: text.lockExport
  };
  DGS_KNOWN_RESTRICTION_IDS.forEach((restrictionId) => {
    const label = document.createElement('label');
    label.className = 'lia-dgs-export-restriction-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.restrictionId = String(restrictionId);
    input.tabIndex = -1;
    const caption = document.createElement('span');
    caption.textContent = exportRestrictionLabels[restrictionId];
    label.appendChild(input);
    label.appendChild(caption);
    exportRestrictions.appendChild(label);
    exportRestrictionInputs.set(restrictionId, input);
  });
  exportToolsStep.appendChild(exportToolsHint);
  exportToolsStep.appendChild(exportToolGroups);
  exportToolsStep.appendChild(exportRestrictions);
  const exportMacroStep = document.createElement('div');
  exportMacroStep.className = 'lia-dgs-export-step lia-dgs-export-macro-step';
  exportMacroStep.hidden = true;
  const exportTextarea = document.createElement('textarea');
  exportTextarea.className = 'lia-dgs-export-textarea';
  exportTextarea.setAttribute('aria-label', text.exportMacrosTitle);
  exportTextarea.spellcheck = false;
  exportTextarea.readOnly = true;
  exportTextarea.tabIndex = -1;
  const exportDialogHint = document.createElement('div');
  exportDialogHint.className = 'lia-dgs-function-dialog-hint';
  exportDialogHint.textContent = text.exportHint;
  exportMacroStep.appendChild(exportTextarea);
  exportMacroStep.appendChild(exportDialogHint);
  const exportDialogActions = document.createElement('div');
  exportDialogActions.className = 'lia-dgs-angle-dialog-actions';
  const exportBackButton = document.createElement('button');
  exportBackButton.type = 'button';
  exportBackButton.className = 'lia-dgs-angle-dialog-button';
  exportBackButton.textContent = text.backExport;
  exportBackButton.hidden = true;
  exportBackButton.tabIndex = -1;
  const exportCloseButton = document.createElement('button');
  exportCloseButton.type = 'button';
  exportCloseButton.className = 'lia-dgs-angle-dialog-button';
  exportCloseButton.textContent = text.closeExport;
  exportCloseButton.tabIndex = -1;
  const exportCopyButton = document.createElement('button');
  exportCopyButton.type = 'button';
  exportCopyButton.className = 'lia-dgs-angle-dialog-button';
  exportCopyButton.dataset.primary = '1';
  exportCopyButton.textContent = text.nextExport;
  exportCopyButton.tabIndex = -1;
  exportDialogActions.appendChild(exportBackButton);
  exportDialogActions.appendChild(exportCloseButton);
  exportDialogActions.appendChild(exportCopyButton);
  exportDialog.appendChild(exportDialogTitle);
  exportDialog.appendChild(exportToolsStep);
  exportDialog.appendChild(exportMacroStep);
  exportDialog.appendChild(exportDialogActions);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lia-dgs-menu-button';
  button.setAttribute('aria-label', geometryLanguage === 'de' ? 'DGS-Menü' : 'DGS menu');
  button.setAttribute('aria-controls', menuBar.id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path></svg>';
  button.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  menuBar.addEventListener('wheel', (evt) => {
    evt.stopPropagation();
    if (menuBar.scrollWidth <= menuBar.clientWidth) return;
    evt.preventDefault();
    menuBar.scrollLeft += Math.abs(evt.deltaX) > Math.abs(evt.deltaY) ? evt.deltaX : evt.deltaY;
  }, { passive: false });
  flyoutSubmenus.forEach((submenu) => {
    submenu.addEventListener('pointerdown', (evt) => evt.stopPropagation());
    submenu.addEventListener('wheel', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
    }, { passive: false });
  });
  sideMenu.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  objectListPanel.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  colorPopup.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  angleDialog.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  compassRadiusDialog.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  arcDialog.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  functionDialog.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  textDialog.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  exportDialog.addEventListener('pointerdown', (evt) => evt.stopPropagation());
  sideMenu.addEventListener('contextmenu', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });
  objectListPanel.addEventListener('contextmenu', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });

  boardContainer.appendChild(setSquareOverlay);
  boardContainer.appendChild(objectListClip);
  boardContainer.appendChild(sideMenuClip);
  boardContainer.appendChild(menuClip);
  boardContainer.appendChild(colorPopup);
  boardContainer.appendChild(angleDialog);
  boardContainer.appendChild(compassRadiusDialog);
  boardContainer.appendChild(arcDialog);
  boardContainer.appendChild(functionDialog);
  boardContainer.appendChild(textDialog);
  boardContainer.appendChild(exportDialog);
  boardContainer.appendChild(button);
  boardContainer.classList.add('lia-dgs-fullscreen-host');
  typesetDgsMath(pointButton);
  typesetDgsMath(exportToolGroups);

  const board = window.__boards && window.__boards[boardId];
  const storedZoomMode = normalizeDgsZoomMode(
    board && board.__liaDgsZoomMode ||
    window.__coordBoardStates && window.__coordBoardStates[boardId] &&
      (window.__coordBoardStates[boardId].zoomMode || window.__coordBoardStates[boardId].panMode)
  );
  const storedAxisScaleMode = normalizeDgsAxisScaleMode(
    board && board.__liaDgsAxisScaleMode ||
    window.__coordBoardStates && window.__coordBoardStates[boardId] &&
      window.__coordBoardStates[boardId].axisScaleMode
  );
  const storedSetSquarePose = readDgsSetSquarePose(boardId);
  const xAxis = board && board.defaultAxes && board.defaultAxes.x;
  const yAxis = board && board.defaultAxes && board.defaultAxes.y;
  const state: DgsState = {
    uid,
    boardId,
    language: geometryLanguage,
    macroSpecSignature: currentMacroSpecSignature,
    board,
    boardContainer,
    button,
    menuClip,
    menuBar,
    menuEndGroup,
    sideMenuClip,
    sideMenu,
    sideMenuTitle,
    sideMenuObjectType,
    sideMenuNameInput,
    sideMenuCloseButton,
    objectListClip,
    objectListPanel,
    objectListContent,
    objectListFooter,
    objectListCloseButton,
    objectListExportButton,
    exportDialog,
    exportDialogTitle,
    exportToolsStep,
    exportMacroStep,
    exportToolButtons,
    exportSelectedToolIds: new Set<number>(
      config.toolIds == null
        ? DGS_EXPORT_SELECTABLE_TOOL_IDS
        : dgsExportSelectableToolIds(config.toolIds)
    ),
    exportRestrictionInputs,
    exportSelectedRestrictionIds: new Set<number>(config.restrictionIds),
    exportDialogStep: 'tools',
    exportTextarea,
    exportCopyButton,
    exportBackButton,
    exportCloseButton,
    nameOption: nameOption.label,
    coordinateSection,
    xCoordinateInput,
    yCoordinateInput,
    angleMeasureSection,
    angleMeasureInput,
    arcSettingsSection,
    arcExitAngleInput,
    arcEntryAngleInput,
    strokeStyleSection,
    lineStyleSelect,
    strokeDesignField,
    strokeDesignSelect,
    strokeWidthField,
    strokeWidthInput,
    functionExpressionSection,
    functionExpressionPreview,
    functionExpressionInput,
    textFontSizeSection,
    textFontSizeInput,
    sliderSettingsSection,
    sliderValueInput,
    sliderMinInput,
    sliderMaxInput,
    sliderStepInput,
    axisLabelSection,
    axisVariableInput,
    axisDescriptionInput,
    fixedOption: fixedOption.label,
    fixedCheckbox: fixedOption.input,
    fixedCheckboxText: fixedOption.caption,
    traceOption: traceOption.label,
    traceCheckbox: traceOption.input,
    nameCheckbox: nameOption.input,
    objectOption: objectOption.label,
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
    lineColorButton,
    traceColorButton,
    colorButtons,
    colorPreviews,
    fillColorButton,
    colorSection,
    colorPopup,
    colorPalette,
    colorPaletteCursor,
    colorHueInput,
    colorPreview,
    colorHexInput,
    opacityInput,
    opacityValue,
    opacityRow,
    clearTraceButton,
    colorPopupOpen: false,
    activeColorKind: 'text',
    layerInput,
    layerRow,
    deleteButton,
    deleteArmed: false,
    colorHue: 300,
    colorSaturation: 1,
    colorValue: 1,
    selectButton,
    setSquareButton,
    setSquareOverlay,
    setSquareVisible: storedSetSquarePose.visible,
    setSquareInitialized: storedSetSquarePose.initialized,
    setSquarePivotX: storedSetSquarePose.initialized
      ? storedSetSquarePose.pivotXRatio * boardContainer.clientWidth
      : 0,
    setSquarePivotY: storedSetSquarePose.initialized
      ? storedSetSquarePose.pivotYRatio * boardContainer.clientHeight
      : 0,
    setSquarePivotXRatio: storedSetSquarePose.pivotXRatio,
    setSquarePivotYRatio: storedSetSquarePose.pivotYRatio,
    setSquareAngle: storedSetSquarePose.angle,
    setSquareScale: storedSetSquarePose.scale,
    setSquarePointerId: null,
    setSquareInteraction: null,
    setSquareStartClientX: 0,
    setSquareStartClientY: 0,
    setSquareStartPivotX: 0,
    setSquareStartPivotY: 0,
    setSquareStartAngle: 0,
    setSquareStartPointerAngle: 0,
    setSquareStartScale: storedSetSquarePose.scale,
    setSquareStartPointerDistance: 1,
    setSquareLastContainerWidth: storedSetSquarePose.initialized
      ? boardContainer.clientWidth
      : 0,
    setSquareLastContainerHeight: storedSetSquarePose.initialized
      ? boardContainer.clientHeight
      : 0,
    setSquareRulerSignature: '',
    compassButton,
    compassSubmenu,
    compassToolButton,
    fixedRadiusCompassToolButton,
    compassRadiusDialog,
    compassRadiusDialogInput,
    compassRadiusDialogConfirmButton,
    compassRadiusDialogCancelButton,
    formatButton,
    toolsDivider,
    pointButton,
    segmentButton,
    orthogonalButton,
    relationSubmenu,
    orthogonalToolButton,
    parallelToolButton,
    midpointToolButton,
    angleBisectorToolButton,
    polygonButton,
    angleButton,
    angleSubmenu,
    angleToolButton,
    measuredAngleToolButton,
    angleDialog,
    angleDialogInput,
    angleDialogConfirmButton,
    angleDialogCancelButton,
    arcDialog,
    arcDialogExitInput,
    arcDialogEntryInput,
    arcDialogConfirmButton,
    arcDialogCancelButton,
    geometrySubmenu,
    segmentToolButton,
    rayToolButton,
    lineToolButton,
    vectorToolButton,
    arcToolButton,
    shapeSubmenu,
    polygonToolButton,
    circleToolButton,
    sectorToolButton,
    functionDivider,
    functionButton,
    rootButton,
    rootSubmenu,
    rootToolButton,
    extremaToolButton,
    inflectionToolButton,
    yInterceptToolButton,
    tangentToolButton,
    intersectionToolButton,
    functionDialog,
    functionDialogInput,
    functionDialogConfirmButton,
    functionDialogCancelButton,
    regressionDivider,
    textDivider,
    sliderButton,
    textButton,
    zoomDivider,
    zoomModeButton,
    axisScaleButton,
    axisScaleSubmenu,
    cartesianScaleButton,
    logXScaleButton,
    logYScaleButton,
    logLogScaleButton,
    fullscreenButton,
    objectListButton,
    menuScrollSpacer,
    textDialog,
    textDialogInput,
    textDialogConfirmButton,
    textDialogCancelButton,
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
    compassSubmenuOpen: false,
    geometrySubmenuOpen: false,
    relationSubmenuOpen: false,
    shapeSubmenuOpen: false,
    angleSubmenuOpen: false,
    rootSubmenuOpen: false,
    axisScaleSubmenuOpen: false,
    angleDialogOpen: false,
    compassRadiusDialogOpen: false,
    arcDialogOpen: false,
    functionDialogOpen: false,
    textDialogOpen: false,
    exportDialogOpen: false,
    availableToolIds: config.toolIds == null ? null : new Set<number>(config.toolIds),
    toolSelectionKey: config.toolSelectionKey,
    restrictionIds: new Set<number>(config.restrictionIds),
    restrictionSelectionKey: config.restrictionSelectionKey,
    sideMenuOpen: false,
    objectListOpen: false,
    objectListSignature: '',
    fullscreenSnapshot: null,
    fullscreenRenderWidth: 0,
    fullscreenRenderHeight: 0,
    contextObject: null,
    activeTool: '',
    externalToolActive: false,
    pendingTextPosition: null,
    zoomMode: storedZoomMode,
    axisScaleMode: storedAxisScaleMode,
    selectedSegmentPoint: null,
    selectedCompassCenter: null,
    selectedCompassPoint: null,
    compassPreview: null,
    compassPointerId: null,
    compassStartAngle: 0,
    compassLastAngle: 0,
    compassSweep: 0,
    compassRadius: 0,
    compassMoved: false,
    compassMode: 'free',
    compassPresetRadius: 1,
    pendingArcPoints: [],
    selectedRelationLine: null,
    selectedRelationPoint: null,
    selectedMidpointPoint: null,
    selectedBisectorPoints: [],
    selectedPolygonPoints: [],
    selectedAnglePoints: [],
    selectedCircleCenter: null,
    selectedSectorPoints: [],
    selectedIntersectionObject: null,
    selectedFormatSource: null,
    circlePreview: null,
    circlePreviewPosition: null,
    restoring: false,
    rootConstructions: [],
    rootUpdating: false,
    coordinateSyncing: false,
    fixedCompassSyncing: false,
    fixedCompassPersistPending: false,
    fixedCompassPersistHistory: false
  };
  states[uid] = state;
  bindDgsSetSquareInteraction(state);
  layoutDgsSetSquare(state, false);
  exportToolButtons.forEach((toolButton, toolId) => {
    toolButton.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (state.exportSelectedToolIds.has(toolId)) state.exportSelectedToolIds.delete(toolId);
      else state.exportSelectedToolIds.add(toolId);
      renderDgsExportToolSelection(state);
    });
  });
  exportRestrictionInputs.forEach((input, restrictionId) => {
    input.addEventListener('change', (evt) => {
      evt.stopPropagation();
      if (input.checked) {
        if (restrictionId === DGS_RESTRICTION_IDS.objectPropertiesLocked) {
          state.exportSelectedRestrictionIds.delete(
            DGS_RESTRICTION_IDS.objectPropertiesColorsTraceOnly
          );
        } else if (restrictionId === DGS_RESTRICTION_IDS.objectPropertiesColorsTraceOnly) {
          state.exportSelectedRestrictionIds.delete(DGS_RESTRICTION_IDS.objectPropertiesLocked);
        }
        state.exportSelectedRestrictionIds.add(restrictionId);
      } else {
        state.exportSelectedRestrictionIds.delete(restrictionId);
      }
      renderDgsExportRestrictionSelection(state);
    });
  });
  menuBar.addEventListener('scroll', () => positionOpenDgsSubmenu(state), { passive: true });
  setDgsZoomMode(state, storedZoomMode, false);
  setDgsAxisScaleMode(state, storedAxisScaleMode, false);
  restoreDgsConstruction(state);
  // Several legacy macros finish their own restore in a zero/120 ms timeout.
  // One settling pass therefore always runs after them; further passes happen
  // only while dependencies are still unresolved.
  scheduleDgsConstructionRestore(state);
  setMenuOpen(state, false);
  setCompassSubmenuOpen(state, false);
  setGeometrySubmenuOpen(state, false);
  setRelationSubmenuOpen(state, false);
  setShapeSubmenuOpen(state, false);
  setAngleSubmenuOpen(state, false);
  setRootSubmenuOpen(state, false);
  setAxisScaleSubmenuOpen(state, false);
  setAngleDialogOpen(state, false);
  setCompassRadiusDialogOpen(state, false);
  setArcDialogOpen(state, false);
  setFunctionDialogOpen(state, false);
  setTextDialogOpen(state, false);
  setExportDialogOpen(state, false);
  setObjectListOpen(state, false);
  setSideMenuOpen(state, false);
  applyDgsProfileRestrictions(state);
  applyLayout(state);
  renderToolState(state);
  renderDgsFullscreenButton(state);

  selectButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setAngleDialogOpen(state, false);
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setActiveTool(state, '', false);
    notifyRegressionLayout(state, false);
  });

  setSquareButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setDgsSetSquareVisible(state, !state.setSquareVisible);
  });

  compassButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setAngleDialogOpen(state, false);
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setCompassRadiusDialogOpen(state, false);
    setCompassSubmenuOpen(state, !state.compassSubmenuOpen);
  });

  compassToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const deactivate = state.activeTool === 'compass' && state.compassMode === 'free';
    setActiveTool(state, '', false);
    state.compassMode = 'free';
    compassButton.innerHTML = compassIcon;
    setCompassSubmenuOpen(state, false);
    if (!deactivate) setActiveTool(state, 'compass');
  });

  fixedRadiusCompassToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setActiveTool(state, '', false);
    state.compassMode = 'fixed';
    compassButton.innerHTML = fixedRadiusCompassIcon;
    setCompassSubmenuOpen(state, false);
    setCompassRadiusDialogOpen(state, true);
  });

  formatButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setAngleDialogOpen(state, false);
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setActiveTool(state, state.activeTool === 'format-copy' ? '' : 'format-copy');
  });

  pointButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
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
    segmentButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.segment);
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'segment' ? '' : 'segment');
  });

  rayToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    segmentButton.innerHTML = rayIcon;
    segmentButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.ray);
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'ray' ? '' : 'ray');
  });

  lineToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    segmentButton.innerHTML = lineIcon;
    segmentButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.line);
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'line' ? '' : 'line');
  });

  vectorToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    segmentButton.innerHTML = vectorIcon;
    segmentButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.vector);
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'vector' ? '' : 'vector');
  });

  arcToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    segmentButton.innerHTML = arcIcon;
    segmentButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.arc);
    setGeometrySubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'arc' ? '' : 'arc');
  });

  orthogonalButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setRelationSubmenuOpen(state, !state.relationSubmenuOpen);
  });

  orthogonalToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    orthogonalButton.innerHTML = orthogonalIcon;
    orthogonalButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.orthogonal);
    setRelationSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'orthogonal' ? '' : 'orthogonal');
  });

  parallelToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    orthogonalButton.innerHTML = parallelIcon;
    orthogonalButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.parallel);
    setRelationSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'parallel' ? '' : 'parallel');
  });

  midpointToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    orthogonalButton.innerHTML = midpointIcon;
    orthogonalButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.midpoint);
    setRelationSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'midpoint' ? '' : 'midpoint');
  });

  angleBisectorToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    orthogonalButton.innerHTML = angleBisectorIcon;
    orthogonalButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.angleBisector);
    setRelationSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'angle-bisector' ? '' : 'angle-bisector');
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
    polygonButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.polygon);
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'polygon' ? '' : 'polygon');
  });

  circleToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    polygonButton.innerHTML = circleIcon;
    polygonButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.circle);
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'circle' ? '' : 'circle');
  });

  sectorToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    polygonButton.innerHTML = sectorIcon;
    polygonButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.sector);
    setShapeSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'sector' ? '' : 'sector');
  });

  angleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, !state.angleSubmenuOpen);
  });

  angleToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    angleButton.innerHTML = angleIcon;
    angleButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.angle);
    setAngleSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'angle' ? '' : 'angle');
  });

  measuredAngleToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    angleButton.innerHTML = measuredAngleIcon;
    angleButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.measuredAngle);
    setAngleSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'angle-measured' ? '' : 'angle-measured');
  });

  functionButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setActiveTool(state, '', false);
    setFunctionDialogOpen(state, !state.functionDialogOpen);
  });

  sliderButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setActiveTool(state, '', false);
    const slider = createDgsSlider(state, getNextDgsSliderName(state), -5, 5, 0.1, 1);
    if (slider) persistDgsConstruction(state);
  });

  textButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setFunctionDialogOpen(state, false);
    setActiveTool(state, state.activeTool === 'text' ? '' : 'text');
  });

  zoomModeButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setActiveTool(state, '', false);
    const nextMode = state.zoomMode === 'both'
      ? 'vertical'
      : (state.zoomMode === 'vertical' ? 'horizontal' : 'both');
    setDgsZoomMode(state, nextMode);
  });

  axisScaleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setActiveTool(state, '', false);
    setAxisScaleSubmenuOpen(state, !state.axisScaleSubmenuOpen);
  });

  const selectAxisScaleMode = (mode: DgsAxisScaleMode) => {
    setDgsAxisScaleMode(state, mode);
    setAxisScaleSubmenuOpen(state, false);
  };
  cartesianScaleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    selectAxisScaleMode('cartesian');
  });
  logXScaleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    selectAxisScaleMode('log-x');
  });
  logYScaleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    selectAxisScaleMode('log-y');
  });
  logLogScaleButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    selectAxisScaleMode('log-log');
  });

  fullscreenButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    void toggleDgsFullscreen(state);
  });

  objectListButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setActiveTool(state, '', false);
    setObjectListOpen(state, !state.objectListOpen);
  });

  rootButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setFunctionDialogOpen(state, false);
    setRootSubmenuOpen(state, !state.rootSubmenuOpen);
  });

  rootToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    rootButton.innerHTML = rootIcon;
    rootButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.roots);
    setRootSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'roots' ? '' : 'roots');
  });

  extremaToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    rootButton.innerHTML = extremaIcon;
    rootButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.extrema);
    setRootSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'extrema' ? '' : 'extrema');
  });

  inflectionToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    rootButton.innerHTML = inflectionIcon;
    rootButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.inflections);
    setRootSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'inflections' ? '' : 'inflections');
  });

  yInterceptToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    rootButton.innerHTML = yInterceptIcon;
    rootButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.ordinateIntercept);
    setRootSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'ordinate-intercept' ? '' : 'ordinate-intercept');
  });

  tangentToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    rootButton.innerHTML = tangentIcon;
    rootButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.tangent);
    setRootSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'tangent' ? '' : 'tangent');
  });

  intersectionToolButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    rootButton.innerHTML = intersectionIcon;
    rootButton.dataset.dgsCurrentToolId = String(DGS_TOOL_IDS.intersection);
    setRootSubmenuOpen(state, false);
    setActiveTool(state, state.activeTool === 'intersection' ? '' : 'intersection');
  });

  menuBar.addEventListener('click', (evt) => {
    const target = evt.target as Element | null;
    if (
      target &&
      typeof target.closest === 'function' &&
      target.closest('.lia-plot-draw-btn, .lia-plot-erase-toggle, .lia-plot-regression-toggle, .lia-plot-reg-item')
    ) {
      setGeometrySubmenuOpen(state, false);
      setRelationSubmenuOpen(state, false);
      setShapeSubmenuOpen(state, false);
      setAngleSubmenuOpen(state, false);
      setRootSubmenuOpen(state, false);
      setFunctionDialogOpen(state, false);
      setTextDialogOpen(state, false);
      setActiveTool(state, '', false);
    }
  }, true);

  sideMenuCloseButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setSideMenuOpen(state, false);
  });

  objectListCloseButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setObjectListOpen(state, false);
  });

  objectListExportButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (hasDgsRestriction(state, DGS_RESTRICTION_IDS.exportLocked)) return;
    setGeometrySubmenuOpen(state, false);
    setRelationSubmenuOpen(state, false);
    setShapeSubmenuOpen(state, false);
    setAngleSubmenuOpen(state, false);
    setRootSubmenuOpen(state, false);
    setAxisScaleSubmenuOpen(state, false);
    setFunctionDialogOpen(state, false);
    setTextDialogOpen(state, false);
    setActiveTool(state, '', false);
    setExportDialogOpen(state, true);
  });

  exportCloseButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setExportDialogOpen(state, false);
  });

  exportCopyButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (state.exportDialogStep === 'tools') {
      setDgsExportDialogStep(state, 'macro');
    } else {
      copyDgsExportToClipboard(state);
    }
  });

  exportBackButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setDgsExportDialogStep(state, 'tools');
  });

  exportTextarea.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      setExportDialogOpen(state, false);
    } else {
      evt.stopPropagation();
    }
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

  const applyAngleMeasureInput = () => {
    const object = state.contextObject;
    const degrees = parseDgsAngleDegrees(angleMeasureInput.value);
    const valid = !!object && isDgsAngle(object) && !!object.__liaDgsMeasuredConstruction && degrees != null;
    angleMeasureInput.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid || degrees == null) return false;
    return applyDgsMeasuredAngle(state, object, degrees);
  };
  angleMeasureInput.addEventListener('blur', applyAngleMeasureInput);
  angleMeasureInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key !== 'Enter') return;
    evt.preventDefault();
    evt.stopPropagation();
    if (applyAngleMeasureInput()) angleMeasureInput.blur();
  });

  exportDialog.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      setExportDialogOpen(state, false);
      return;
    }
    if (evt.key !== 'Tab' || !state.exportDialogOpen) return;
    const focusable = Array.from(
      exportDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])'
      )
    ).filter((element) =>
      element.tabIndex >= 0 &&
      !element.hidden &&
      !element.closest('[hidden]') &&
      element.getClientRects().length > 0
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (evt.shiftKey && (active === first || !exportDialog.contains(active))) {
      evt.preventDefault();
      last.focus();
    } else if (!evt.shiftKey && (active === last || !exportDialog.contains(active))) {
      evt.preventDefault();
      first.focus();
    }
  });

  const applyArcSettingsInputs = () => {
    const arc = state.contextObject;
    const exitAngle = parseDgsArcAngle(arcExitAngleInput.value);
    const entryAngle = parseDgsArcAngle(arcEntryAngleInput.value);
    arcExitAngleInput.setAttribute('aria-invalid', exitAngle == null ? 'true' : 'false');
    arcEntryAngleInput.setAttribute('aria-invalid', entryAngle == null ? 'true' : 'false');
    if (!isDgsArc(arc) || exitAngle == null || entryAngle == null) return false;
    const valid = setDgsArcAngles(
      state,
      arc,
      exitAngle,
      entryAngle
    );
    if (valid) {
      arcExitAngleInput.value = formatCoordinate(Number(arc.__liaDgsArcExitAngle));
      arcEntryAngleInput.value = formatCoordinate(Number(arc.__liaDgsArcEntryAngle));
    }
    return valid;
  };
  [arcExitAngleInput, arcEntryAngleInput].forEach((input) => {
    input.addEventListener('input', () => input.setAttribute('aria-invalid', 'false'));
    input.addEventListener('blur', applyArcSettingsInputs);
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
          evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        evt.stopPropagation();
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        evt.stopPropagation();
        if (applyArcSettingsInputs()) input.blur();
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        const arc = state.contextObject;
        if (isDgsArc(arc)) {
          arcExitAngleInput.value = formatCoordinate(Number(arc.__liaDgsArcExitAngle));
          arcEntryAngleInput.value = formatCoordinate(Number(arc.__liaDgsArcEntryAngle));
        }
        arcExitAngleInput.setAttribute('aria-invalid', 'false');
        arcEntryAngleInput.setAttribute('aria-invalid', 'false');
        input.blur();
      }
    });
  });

  const resetLineStyleInput = () => {
    const object = state.contextObject;
    if (!isDgsLineStyleTarget(object)) return;
    lineStyleSelect.value = getDgsLineStyle(object);
  };
  lineStyleSelect.addEventListener('change', () => {
    const object = state.contextObject;
    if (!isDgsLineStyleTarget(object)) return;
    if (applyDgsLineStyle(state, object, lineStyleSelect.value)) {
      resetLineStyleInput();
    }
  });
  lineStyleSelect.addEventListener('keydown', (evt) => {
    evt.stopPropagation();
  });

  const resetStrokeStyleInputs = () => {
    const object = state.contextObject;
    if (!isDgsStrokeStyleTarget(object)) return;
    strokeDesignSelect.value = getDgsStrokeDesign(object);
    strokeWidthInput.value = formatCoordinate(getDgsStrokeWidth(object));
    strokeWidthInput.setAttribute('aria-invalid', 'false');
  };
  strokeDesignSelect.addEventListener('change', () => {
    const object = state.contextObject;
    if (!isDgsStrokeStyleTarget(object)) return;
    if (applyDgsStrokeStyle(
      state,
      object,
      strokeDesignSelect.value,
      getDgsStrokeWidth(object)
    )) {
      resetStrokeStyleInputs();
    }
  });
  strokeDesignSelect.addEventListener('keydown', (evt) => {
    evt.stopPropagation();
  });
  const applyStrokeWidthInput = () => {
    const object = state.contextObject;
    const strokeWidth = parseDgsStrokeWidth(strokeWidthInput.value);
    const valid = isDgsStrokeStyleTarget(object) && strokeWidth != null;
    strokeWidthInput.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid || strokeWidth == null) return false;
    const applied = applyDgsStrokeStyle(
      state,
      object,
      strokeDesignSelect.value,
      strokeWidth
    );
    if (applied) resetStrokeStyleInputs();
    return applied;
  };
  strokeWidthInput.addEventListener('input', () => {
    strokeWidthInput.setAttribute('aria-invalid', 'false');
  });
  strokeWidthInput.addEventListener('blur', applyStrokeWidthInput);
  strokeWidthInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      if (applyStrokeWidthInput()) strokeWidthInput.blur();
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      resetStrokeStyleInputs();
      strokeWidthInput.blur();
    }
  });

  let editingFunctionObject: any | null = null;
  functionExpressionInput.addEventListener('focus', () => {
    if (state.contextObject && isDgsFunction(state.contextObject)) {
      editingFunctionObject = state.contextObject;
    }
  });
  const applyFunctionExpressionInput = () => {
    const object = state.contextObject && isDgsFunction(state.contextObject)
      ? state.contextObject
      : editingFunctionObject;
    const valid = !!object && isDgsFunction(object) &&
      applyDgsFunctionExpression(state, object, functionExpressionInput.value);
    functionExpressionInput.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (valid) functionExpressionInput.value = String(object.__liaDgsFunctionExpression || '');
    return valid;
  };
  functionExpressionInput.addEventListener('input', () => {
    functionExpressionInput.setAttribute('aria-invalid', 'false');
    if (state.contextObject && isDgsFunction(state.contextObject)) {
      refreshDgsFunctionExpressionPreview(state, state.contextObject, functionExpressionInput.value);
    }
  });
  functionExpressionInput.addEventListener('blur', applyFunctionExpressionInput);
  functionExpressionInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      if (applyFunctionExpressionInput()) functionExpressionInput.blur();
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      const object = state.contextObject && isDgsFunction(state.contextObject)
        ? state.contextObject
        : editingFunctionObject;
      functionExpressionInput.value = object && isDgsFunction(object)
        ? String(object.__liaDgsFunctionExpression || '')
        : '';
      functionExpressionInput.setAttribute('aria-invalid', 'false');
      if (object && isDgsFunction(object)) refreshDgsFunctionExpressionPreview(state, object);
      functionExpressionInput.blur();
    }
  });

  compassRadiusDialogConfirmButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    confirmDgsCompassRadius(state);
  });
  compassRadiusDialogCancelButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setCompassRadiusDialogOpen(state, false);
    setActiveTool(state, '', false);
  });
  compassRadiusDialogInput.addEventListener('input', () => {
    compassRadiusDialogInput.setAttribute('aria-invalid', 'false');
  });
  compassRadiusDialogInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      confirmDgsCompassRadius(state);
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      setCompassRadiusDialogOpen(state, false);
      setActiveTool(state, '', false);
    }
  });

  angleDialogConfirmButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    createMeasuredDgsAngleFromDialog(state);
  });
  angleDialogCancelButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setActiveTool(state, '', false);
  });
  angleDialogInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      createMeasuredDgsAngleFromDialog(state);
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      setActiveTool(state, '', false);
    }
  });

  arcDialogConfirmButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    createDgsArcFromDialog(state);
  });
  arcDialogCancelButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setActiveTool(state, '', false);
  });
  [arcDialogExitInput, arcDialogEntryInput].forEach((input) => {
    input.addEventListener('input', () => input.setAttribute('aria-invalid', 'false'));
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
          evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        evt.stopPropagation();
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        evt.stopPropagation();
        createDgsArcFromDialog(state);
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        setActiveTool(state, '', false);
      }
    });
  });

  functionDialogConfirmButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    createDgsFunctionFromDialog(state);
  });
  functionDialogCancelButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setFunctionDialogOpen(state, false);
  });
  functionDialogInput.addEventListener('input', () => {
    functionDialogInput.setAttribute('aria-invalid', 'false');
  });
  functionDialogInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      createDgsFunctionFromDialog(state);
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      setFunctionDialogOpen(state, false);
    }
  });

  textDialogConfirmButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    createDgsTextFromDialog(state);
  });
  textDialogCancelButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setActiveTool(state, '', false);
  });
  textDialogInput.addEventListener('input', () => {
    textDialogInput.setAttribute('aria-invalid', 'false');
  });
  textDialogInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
        evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      evt.stopPropagation();
      createDgsTextFromDialog(state);
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      setActiveTool(state, '', false);
    }
  });

  const applyTextFontSizeInput = () => {
    const object = state.contextObject;
    if (!isDgsText(object)) return false;
    const applied = setDgsTextFontSize(state, object, textFontSizeInput.value);
    textFontSizeInput.value = String(clampDgsTextFontSize(object.__liaDgsTextFontSize));
    return applied;
  };
  textFontSizeInput.addEventListener('blur', applyTextFontSizeInput);
  textFontSizeInput.addEventListener('change', applyTextFontSizeInput);
  textFontSizeInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.stopPropagation();
      return;
    }
    if (evt.key !== 'Enter') return;
    evt.preventDefault();
    evt.stopPropagation();
    if (applyTextFontSizeInput()) textFontSizeInput.blur();
  });

  const applySliderSettingsInputs = () => {
    const slider = state.contextObject;
    if (!isDgsSlider(slider)) return false;
    const valid = setDgsSliderSettings(
      state,
      slider,
      sliderMinInput.value,
      sliderMaxInput.value,
      sliderStepInput.value,
      sliderValueInput.value
    );
    [sliderValueInput, sliderMinInput, sliderMaxInput, sliderStepInput]
      .forEach((input) => input.setAttribute('aria-invalid', valid ? 'false' : 'true'));
    if (valid) {
      sliderValueInput.value = formatCoordinate(getDgsSliderValue(slider));
      sliderMinInput.value = formatCoordinate(Number(slider.__liaDgsSliderMinimum));
      sliderMaxInput.value = formatCoordinate(Number(slider.__liaDgsSliderMaximum));
      sliderStepInput.value = formatCoordinate(Number(slider.__liaDgsSliderStep));
    }
    return valid;
  };
  [sliderValueInput, sliderMinInput, sliderMaxInput, sliderStepInput].forEach((input) => {
    input.addEventListener('input', () => input.setAttribute('aria-invalid', 'false'));
    input.addEventListener('blur', applySliderSettingsInputs);
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
          evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        evt.stopPropagation();
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        evt.stopPropagation();
        if (applySliderSettingsInputs()) input.blur();
      }
    });
  });

  const applyAxisLabelInputs = () => {
    const key = getDgsAxisKey(state, state.contextObject);
    if (!key) return false;
    persistDgsConstruction(state);
    const labels = getDgsAxisLabels(state);
    labels[key] = {
      variable: normalizeDgsAxisVariable(axisVariableInput.value),
      description: String(axisDescriptionInput.value || '').trim()
    };
    axisVariableInput.value = labels[key].variable;
    axisDescriptionInput.value = labels[key].description;
    axisVariableInput.setAttribute('aria-invalid', 'false');
    axisDescriptionInput.setAttribute('aria-invalid', 'false');
    applyDgsAxisLabels(state, labels);
    persistDgsConstruction(state);
    return true;
  };
  [axisVariableInput, axisDescriptionInput].forEach((input) => {
    input.addEventListener('blur', applyAxisLabelInputs);
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||
          evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        evt.stopPropagation();
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        evt.stopPropagation();
        if (applyAxisLabelInputs()) input.blur();
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        const key = getDgsAxisKey(state, state.contextObject);
        if (key) {
          const entry = getDgsAxisLabels(state)[key];
          axisVariableInput.value = entry.variable;
          axisDescriptionInput.value = entry.description;
        }
        input.blur();
      }
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

  traceOption.input.addEventListener('change', () => {
    const point = state.contextObject;
    if (!isDgsPoint(point)) return;
    setDgsPointTraceEnabled(state, point, traceOption.input.checked);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    persistDgsConstruction(state);
  });

  clearTraceButton.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const point = state.contextObject;
    if (!isDgsPoint(point)) return;
    clearDgsPointTrace(state, point);
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
    if (applied && isDgsFunction(object)) refreshDgsFunctionExpressionPreview(state, object);
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
    if (hasDgsRestriction(state, DGS_RESTRICTION_IDS.valueControlsLocked)) return;
    const object = state.contextObject;
    const analysisPoint = object && (object.__liaDgsRootPoint || object.__liaDgsExtremumPoint ||
      object.__liaDgsInflectionPoint || object.__liaDgsYInterceptPoint ||
      object.__liaDgsIntersectionPoint);
    const valuePoint = analysisPoint || !!(object && object.__liaDgsMidpoint);
    if (!object || (isDgsPoint(object) && !valuePoint) || isDgsRay(object) || isDgsVector(object) || isDgsPolygon(object) || isDgsCircle(object) || isDgsSector(object)) return;
    if (valuePoint) {
      object.__liaDgsShowValue = measurementOption.input.checked;
      setDgsAnalysisPointEntryOption(object, 'explicitValueVisibility', measurementOption.input.checked);
    }
    else if (isDgsFunction(object)) object.__liaDgsShowExpression = measurementOption.input.checked;
    else if (isDgsLine(object)) object.__liaDgsShowEquation = measurementOption.input.checked;
    else if (isDgsAngle(object)) {
      object.__liaDgsShowAngle = measurementOption.input.checked;
      syncDgsRightAngleStyle(object);
    }
    else object.__liaDgsShowLength = measurementOption.input.checked;
    refreshDgsObjectLabel(object);
    persistDgsConstruction(state);
  });

  areaOption.input.addEventListener('change', () => {
    if (hasDgsRestriction(state, DGS_RESTRICTION_IDS.valueControlsLocked)) return;
    const object = state.contextObject;
    if (!isDgsPolygon(object) && !isDgsCircle(object) && !isDgsSector(object)) return;
    object.__liaDgsShowArea = areaOption.input.checked;
    if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
    else refreshDgsObjectLabel(object);
    persistDgsConstruction(state);
  });

  perimeterOption.input.addEventListener('change', () => {
    if (hasDgsRestriction(state, DGS_RESTRICTION_IDS.valueControlsLocked)) return;
    const object = state.contextObject;
    if (!isDgsPolygon(object) && !isDgsCircle(object) && !isDgsSector(object)) return;
    object.__liaDgsShowPerimeter = perimeterOption.input.checked;
    if (isDgsPolygon(object)) refreshDgsPolygonMeasurementLabel(object);
    else refreshDgsObjectLabel(object);
    persistDgsConstruction(state);
  });

  colorButtons.forEach((button) => button.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (!state.contextObject) return;
    const kind = button.dataset.colorKind as 'text' | 'line' | 'fill' | 'trace';
    const alreadyOpen = state.colorPopupOpen && state.activeColorKind === kind;
    state.activeColorKind = kind;
    state.opacityRow.hidden = kind === 'trace';
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
    if (!object || state.activeColorKind === 'trace') return;
    const percent = Math.max(0, Math.min(100, Number(opacityInput.value) || 0));
    opacityValue.textContent = Math.round(percent) + '%';
    colorPreviews.forEach((preview, index) => {
      const kind = colorButtons[index].dataset.colorKind;
      preview.style.opacity = kind === 'trace'
        ? '1'
        : (isDgsPolygon(object) || isDgsCircle(object) || isDgsSector(object)
        ? (kind === 'fill' ? String(percent / 100) : '1')
        : String(percent / 100));
    });
    setDgsObjectOpacity(object, percent / 100);
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
    persistDgsConstruction(state, recordHistory);
  };
  opacityInput.addEventListener('input', () => applyOpacity(false));
  opacityInput.addEventListener('change', () => applyOpacity(true));

  state.onDocumentPointerDown = (evt: PointerEvent) => {
    const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [];
    if (state.exportDialogOpen && !path.includes(exportDialog) && !path.includes(objectListExportButton)) {
      setExportDialogOpen(state, false);
    }
    if (!state.colorPopupOpen) return;
    if (colorButtons.some((button) => path.includes(button)) || path.includes(colorPopup)) return;
    setColorPopupOpen(state, false);
  };
  document.addEventListener('pointerdown', state.onDocumentPointerDown, true);

  state.onDocumentPointerUp = (evt: PointerEvent) => {
    finishDgsCompassDrag(state, evt, false);
  };
  document.addEventListener('pointerup', state.onDocumentPointerUp, true);

  state.onDocumentPointerCancel = (evt: PointerEvent) => {
    finishDgsCompassDrag(state, evt, true);
  };
  document.addEventListener('pointercancel', state.onDocumentPointerCancel, true);

  state.onFullscreenChange = () => handleDgsFullscreenChange(state);
  document.addEventListener('fullscreenchange', state.onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', state.onFullscreenChange as EventListener);
  boardContainer.addEventListener('fullscreenchange', state.onFullscreenChange);

  state.onBoardContextMenu = (evt: MouseEvent) => {
    if (eventTargetsBoardUi(evt)) return;
    const object = findDgsContextObject(state, evt) || findDgsAxisContextObject(state, evt);
    if (!object) {
      if (state.sideMenuOpen) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        setSideMenuOpen(state, false);
      }
      return;
    }
    openDgsObjectProperties(state, object, evt);
  };
  boardContainer.addEventListener('contextmenu', state.onBoardContextMenu, true);

  state.onBoardPointerDown = (evt: PointerEvent) => {
    if (!state.activeTool) return;
    if (evt.button !== 0 || evt.isPrimary === false || eventTargetsBoardUi(evt)) return;

    if (state.activeTool === 'format-copy') {
      const object = findDgsContextObject(state, evt as any);
      if (!object) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedFormatSource) {
        setSelectedFormatSource(state, object);
        return;
      }
      if (object === state.selectedFormatSource) return;
      if (copyDgsObjectFormat(state, state.selectedFormatSource, object)) {
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'compass') {
      if (state.selectedCompassCenter && state.selectedCompassPoint && state.compassPreview) {
        const point = findNearestBoardPoint(state, evt);
        if (point !== state.selectedCompassPoint) return;
        evt.preventDefault();
        evt.stopImmediatePropagation();
        startDgsCompassDrag(state, evt);
        return;
      }

      if (!state.selectedCompassCenter) {
        const center = findOrCreateDgsPoint(state, evt);
        if (!center) return;
        evt.preventDefault();
        evt.stopImmediatePropagation();
        setSelectedCompassPoints(state, center, null);
        return;
      }

      let point = state.compassMode === 'fixed' ? null : findNearestBoardPoint(state, evt);
      const center = state.selectedCompassCenter;
      const coordinates = eventToUserCoordinates(state, evt);
      if (!coordinates) return;
      let centerX = NaN;
      let centerY = NaN;
      try { centerX = Number(center.X()); centerY = Number(center.Y()); } catch (e) {}
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) ||
          Math.hypot(coordinates.x - centerX, coordinates.y - centerY) <= 1e-12) return;
      if (point === center) return;
      if (state.compassMode === 'fixed') {
        const directionX = coordinates.x - centerX;
        const directionY = coordinates.y - centerY;
        const directionLength = Math.hypot(directionX, directionY);
        const presetRadius = Number(state.compassPresetRadius);
        if (!Number.isFinite(presetRadius) || presetRadius <= 1e-12 || directionLength <= 1e-12) return;
        point = createDgsPoint(
          state,
          centerX + presetRadius * directionX / directionLength,
          centerY + presetRadius * directionY / directionLength
        );
      } else {
        if (point && (getDgsObjectFixed(point) || point.__liaDgsCoordinateExpressions ||
            String(point.elType || '').toLowerCase() === 'glider')) point = null;
        if (!point) point = createDgsPoint(state, coordinates.x, coordinates.y);
      }
      if (!point || point === center) return;
      let pointX = NaN;
      let pointY = NaN;
      try { pointX = Number(point.X()); pointY = Number(point.Y()); } catch (e) {}
      const radius = state.compassMode === 'fixed'
        ? Number(state.compassPresetRadius)
        : Math.hypot(pointX - centerX, pointY - centerY);
      if (!Number.isFinite(radius) || radius <= 1e-12) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      setSelectedCompassPoints(state, center, point);
      state.compassRadius = radius;
      state.compassStartAngle = Math.atan2(pointY - centerY, pointX - centerX);
      state.compassLastAngle = state.compassStartAngle;
      state.compassSweep = 0;
      state.compassMoved = false;
      state.compassPreview = createDgsCompassArc(state, center, point, 0, true);
      if (!state.compassPreview) {
        setSelectedCompassPoints(state, center, null);
        return;
      }
      startDgsCompassDrag(state, evt);
      return;
    }

    if (state.activeTool === 'text') {
      if (state.textDialogOpen) return;
      const coordinates = eventToUserCoordinates(state, evt);
      if (!coordinates) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      state.pendingTextPosition = coordinates;
      setTextDialogOpen(state, true);
      return;
    }

    if (state.activeTool === 'angle-bisector') {
      const point = findNearestBoardPoint(state, evt);
      if (!point || state.selectedBisectorPoints.includes(point)) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      const points = state.selectedBisectorPoints.concat(point);
      if (points.length < 3) {
        setSelectedBisectorPoints(state, points);
        return;
      }
      if (createDgsAngleBisector(state, points[0], points[1], points[2])) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'midpoint') {
      const point = findNearestBoardPoint(state, evt);
      if (!point) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedMidpointPoint) {
        setSelectedMidpointPoint(state, point);
        return;
      }
      if (point === state.selectedMidpointPoint) return;
      if (createDgsMidpoint(state, state.selectedMidpointPoint, point)) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'intersection') {
      const source = findDgsIntersectionTarget(state, evt);
      if (!source) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedIntersectionObject) {
        setSelectedIntersectionObject(state, source);
        return;
      }
      if (source === state.selectedIntersectionObject) return;
      if (createDgsIntersectionConstruction(state, state.selectedIntersectionObject, source)) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'tangent') {
      const source = findDgsTangentTarget(state, evt);
      const coordinates = eventToUserCoordinates(state, evt);
      if (!source || !coordinates) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (createDgsTangent(state, source, coordinates.x, coordinates.y)) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'roots' || state.activeTool === 'extrema' ||
        state.activeTool === 'inflections' || state.activeTool === 'ordinate-intercept') {
      const analysisTool = state.activeTool;
      const source = findDgsRootTarget(
        state,
        evt,
        analysisTool === 'extrema' || analysisTool === 'inflections'
      );
      if (!source) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (createDgsAnalysisConstruction(state, source, analysisTool)) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'orthogonal' || state.activeTool === 'parallel') {
      const relationTool = state.activeTool;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      let point = findNearestBoardPoint(state, evt);
      const line = findNearestDgsLinearObject(state, evt);

      if (state.selectedRelationLine) {
        if (!point && (!line || line === state.selectedRelationLine)) {
          const coordinates = eventToUserCoordinates(state, evt);
          if (coordinates) point = createDgsPoint(state, coordinates.x, coordinates.y);
        }
        if (point) {
          setSelectedRelationInputs(state, state.selectedRelationLine, point);
        } else if (line) {
          setSelectedRelationInputs(state, line, null);
        }
      } else if (state.selectedRelationPoint) {
        if (line) {
          setSelectedRelationInputs(state, line, state.selectedRelationPoint);
        } else if (point) {
          setSelectedRelationInputs(state, null, point);
        }
      } else if (point) {
        setSelectedRelationInputs(state, null, point);
      } else if (line) {
        setSelectedRelationInputs(state, line, null);
      } else {
        const coordinates = eventToUserCoordinates(state, evt);
        if (coordinates) {
          point = createDgsPoint(state, coordinates.x, coordinates.y);
          if (point) setSelectedRelationInputs(state, null, point);
        }
      }

      if (state.selectedRelationLine && state.selectedRelationPoint) {
        const relationLine = relationTool === 'parallel'
          ? createDgsParallel(state, state.selectedRelationLine, state.selectedRelationPoint)
          : createDgsPerpendicular(state, state.selectedRelationLine, state.selectedRelationPoint);
        if (relationLine) {
          persistDgsConstruction(state);
          setActiveTool(state, '', false);
        }
      }
      return;
    }

    if (state.activeTool === 'circle') {
      const point = findOrCreateDgsPoint(state, evt);
      if (!point) return;
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

    if (state.activeTool === 'sector') {
      const point = findOrCreateDgsPoint(state, evt);
      if (!point || state.selectedSectorPoints.includes(point)) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      const selected = state.selectedSectorPoints.concat(point);
      if (selected.length < 3) {
        setSelectedSectorPoints(state, selected);
        return;
      }
      const sector = createDgsSector(state, selected[0], selected[1], selected[2]);
      if (sector) {
        persistDgsConstruction(state);
        setActiveTool(state, '', false);
      }
      return;
    }

    if (state.activeTool === 'angle-measured') {
      if (state.angleDialogOpen) return;
      const point = findOrCreateDgsPoint(state, evt);
      if (!point || state.selectedAnglePoints.includes(point)) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      const selected = state.selectedAnglePoints.concat(point);
      setSelectedAnglePoints(state, selected);
      if (selected.length === 2) setAngleDialogOpen(state, true);
      return;
    }

    if (state.activeTool === 'angle') {
      const point = findOrCreateDgsPoint(state, evt);
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
      const point = findOrCreateDgsPoint(state, evt);
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

    if (state.activeTool === 'segment' || state.activeTool === 'ray' || state.activeTool === 'line' || state.activeTool === 'vector' || state.activeTool === 'arc') {
      if (state.activeTool === 'arc' && state.arcDialogOpen) return;
      const point = findOrCreateDgsPoint(state, evt);
      if (!point) return;

      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (!state.selectedSegmentPoint) {
        setSelectedSegmentPoint(state, point);
        return;
      }
      if (state.selectedSegmentPoint === point) return;

      if (state.activeTool === 'arc') {
        state.pendingArcPoints = [state.selectedSegmentPoint, point];
        setSelectedSegmentPoint(state, null);
        setArcDialogOpen(state, true);
        return;
      }

      const geometry = state.activeTool === 'line'
        ? createDgsLine(state, state.selectedSegmentPoint, point)
        : (state.activeTool === 'ray'
          ? createDgsRay(state, state.selectedSegmentPoint, point)
          : (state.activeTool === 'vector'
            ? createDgsVector(state, state.selectedSegmentPoint, point)
            : createDgsSegment(state, state.selectedSegmentPoint, point)));
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
    if (state.activeTool === 'compass' && state.compassPointerId != null) {
      if (eventTargetsBoardUi(evt)) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      updateDgsCompassDrag(state, evt);
      return;
    }
    if (state.activeTool !== 'circle' || !state.selectedCircleCenter || eventTargetsBoardUi(evt)) return;
    const coordinates = eventToUserCoordinates(state, evt);
    if (!coordinates) return;
    state.circlePreviewPosition = coordinates;
    try { if (state.board && typeof state.board.update === 'function') state.board.update(); } catch (e) {}
  };
  boardContainer.addEventListener('pointermove', state.onBoardPointerMove, true);

  state.onBoardLostPointerCapture = (evt: PointerEvent) => {
    if (state.compassPointerId == null || evt.pointerId !== state.compassPointerId) return;
    finishDgsCompassDrag(state, evt, true);
  };
  boardContainer.addEventListener('lostpointercapture', state.onBoardLostPointerCapture);

  state.onBoardViewportChange = () => {
    applyDgsLogTickGenerator(state, state.xAxis, 'x', dgsAxisUsesLogX(state.axisScaleMode));
    applyDgsLogTickGenerator(state, state.yAxis, 'y', dgsAxisUsesLogY(state.axisScaleMode));
    if (!state.axisSyncing) {
      scheduleAxisSync(state);
      scheduleXAxisSync(state);
    }
    scheduleDgsRootUpdate(state);
    refreshDgsSliderTypography(state);
    scheduleDgsSetSquareLayout(state, false);
  };
  state.onBoardRootUpdate = () => {
    syncDgsFixedCompassConstructions(state);
    if (!state.axisSyncing) {
      scheduleAxisSync(state);
      scheduleXAxisSync(state);
    }
    scheduleDgsRootUpdate(state);
    scheduleDgsCoordinateSync(state);
    recordAllDgsPointTraces(state);
    refreshDgsObjectList(state);
  };
  if (board && typeof board.on === 'function') {
    try { board.on('move', state.onBoardViewportChange); } catch (e) {}
    try { board.on('boundingbox', state.onBoardViewportChange); } catch (e) {}
    try { board.on('update', state.onBoardRootUpdate); } catch (e) {}
  }

  if (typeof ResizeObserver === 'function') {
    state.resizeObserver = new ResizeObserver(() => {
      if (isDgsFullscreen(state)) scheduleDgsFullscreenResize(state);
      const setSquareSizeChanged =
        state.setSquareLastContainerWidth !== boardContainer.clientWidth ||
        state.setSquareLastContainerHeight !== boardContainer.clientHeight;
      scheduleDgsSetSquareLayout(state, setSquareSizeChanged);
      positionOpenDgsSubmenu(state);
      scheduleAxisSync(state);
      scheduleXAxisSync(state);
      scheduleDgsRootUpdate(state);
      refreshDgsSliderTypography(state);
    });
    state.resizeObserver.observe(boardContainer);
  }

  scheduleDgsCoordinateSync(state);

  button.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMenuOpen(state, !state.open);
  });
  applyDgsInstrumentRequests(boardId);
}

/** Release every transient DGS state, request, and retry owned by one board. */
export function disposeDgsForBoard(boardId: string): void {
  const key = String(boardId || '').trim();
  if (!key) return;
  Object.keys(states).forEach((uid) => {
    const state = states[uid];
    if (state && state.boardId === key) disposeDgsState(state);
  });
  Object.keys(pendingRetryBoardIds).forEach((uid) => {
    if (pendingRetryBoardIds[uid] === key) clearPendingDgsRetry(uid);
  });
  Object.keys(dgsRegressionRequests).forEach((uid) => {
    if (dgsRegressionRequests[uid].boardId === key) delete dgsRegressionRequests[uid];
  });
  Object.keys(dgsInstrumentRequests).forEach((uid) => {
    if (dgsInstrumentRequests[uid].boardId === key) delete dgsInstrumentRequests[uid];
  });
  // Point and graph registries may also contain learner-created, DGS-only
  // objects that are not owned by a macro entry. Drop the complete board
  // buckets while the board is still available to the caller for disposal.
  try { if (window.__points) delete window.__points[key]; } catch (e) {}
  try { if (window.__pointStates) delete window.__pointStates[key]; } catch (e) {}
  try { if (window.__pointGraphs) delete window.__pointGraphs[key]; } catch (e) {}
  try { if (window.__pointGraphStates) delete window.__pointGraphStates[key]; } catch (e) {}
  // disposeDgsState persists the learner snapshot and temporarily records its
  // source board. Keep the serializable snapshot, but never retain a freed
  // JSXGraph board after a host disconnect or dynamic-to-static switch.
  delete dgsConstructionBoards[key];
}

window.__disposeDGSForBoard = disposeDgsForBoard;

window.__setupDGS = function (uid: string, spec: string, language?: string): void {
  const rawSpec = String(spec || '').trim();
  const boardId = parseDgsMacroSpec(rawSpec).boardId;
  const anchor = document.getElementById('dgs-ui-' + uid) as HTMLElement | null;
  if (isStaticDgsTarget(boardId, anchor)) {
    disposeDgsForBoard(boardId);
    clearPendingDgsRetry(uid);
    return;
  }
  scheduleBootstrap(() => setupDGS(uid, rawSpec, language));
};

window.__setupDGSRegression = function (
  uid: string,
  spec: string,
  language?: string
): void {
  const rawSpec = String(spec || '').trim();
  const boardId = parseDgsMacroSpec(rawSpec).boardId;
  const anchor = document.getElementById('regression-ui-' + uid) as HTMLElement | null;
  if (isStaticDgsTarget(boardId, anchor)) {
    delete dgsRegressionRequests[uid];
    return;
  }
  scheduleBootstrap(() => setupDGSRegression(uid, rawSpec, language));
};

window.__setupDGSInstrument = function (
  uid: string,
  spec: string,
  kind: string,
  language?: string
): void {
  const rawSpec = String(spec || '').trim();
  const boardId = parseDgsMacroSpec(rawSpec).boardId;
  const anchor = document.getElementById('dgs-instrument-ui-' + uid) as HTMLElement | null;
  if (isStaticDgsTarget(boardId, anchor)) {
    delete dgsInstrumentRequests[uid];
    return;
  }
  scheduleBootstrap(() => setupDGSInstrument(uid, rawSpec, kind, language));
};

export function bootstrapDGS(): void {
  const anchors = document.querySelectorAll('[id^="dgs-ui-"][data-spec]:not([data-lia-static-claimed])');

  anchors.forEach((el: Element) => {
    const match = String(el.id || '').match(/^dgs-ui-(.+)$/);
    if (!match) return;

    const uid = match[1];
    const spec = String((el as HTMLElement).dataset.spec || '').trim();
    setupDGS(uid, spec, (el as HTMLElement).dataset.language);
  });

  pruneDgsRegressionRequests();
  const regressionAnchors = document.querySelectorAll(
    '[id^="regression-ui-"][data-spec]:not([data-lia-static-claimed])'
  );
  regressionAnchors.forEach((el: Element) => {
    const match = String(el.id || '').match(/^regression-ui-(.+)$/);
    if (!match) return;
    const anchor = el as HTMLElement;
    setupDGSRegression(
      match[1],
      String(anchor.dataset.spec || '').trim(),
      anchor.dataset.language
    );
  });

  pruneDgsInstrumentRequests();
  const instrumentAnchors =
    document.querySelectorAll('[id^=dgs-instrument-ui-][data-spec][data-instrument]:not([data-lia-static-claimed])');
  instrumentAnchors.forEach((el: Element) => {
    const match = String(el.id || '').match(/^dgs-instrument-ui-(.+)$/);
    if (!match) return;

    const anchor = el as HTMLElement;
    setupDGSInstrument(
      match[1],
      String(anchor.dataset.spec || '').trim(),
      String(anchor.dataset.instrument || '').trim(),
      anchor.dataset.language
    );
  });
  Array.from(new Set(
    Object.keys(states)
      .map((uid) => states[uid])
      .filter(Boolean)
      .map((state) => state.boardId)
      .concat(Object.keys(dgsRegressionRequests).map((uid) => dgsRegressionRequests[uid].boardId))
  )).forEach((boardId) => {
    syncDgsInstrumentProfile(boardId);
    syncDgsRegressionController(boardId);
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
