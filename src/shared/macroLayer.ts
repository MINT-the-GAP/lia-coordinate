// Source-order layering for drawable, non-DGS coordinate macros.
//
// A macro marker reserves one board-local layer in document order. All JSXGraph
// objects owned by that marker retain the source rank, while renderer roles
// order labels and interaction handles inside that same rank. Referenced source
// objects (for example the endpoints of a named segment) stay untouched.

import { splitTopLevel, unquote } from './parser';

export const MACRO_SOURCE_LAYER_MIN = 0;
export const MACRO_SOURCE_LAYER_MAX = 20;

export type MacroLayerRenderRole = 'body' | 'hit' | 'handle' | 'annotation';

// JSXGraph reserves its low layers for background, grid and axes. Each source
// rank therefore owns four adjacent renderer slots. Source order stays the
// primary z-order; roles only order parts of the same macro.
export const MACRO_BODY_LAYER_BASE = 3;
export const MACRO_HIT_LAYER_BASE = MACRO_BODY_LAYER_BASE + 1;
export const MACRO_HANDLE_LAYER_BASE = MACRO_BODY_LAYER_BASE + 2;
export const MACRO_ANNOTATION_LAYER_BASE = MACRO_BODY_LAYER_BASE + 3;
export const MACRO_SOURCE_LAYER_STRIDE = 4;
export const MACRO_RENDER_LAYER_COUNT = MACRO_BODY_LAYER_BASE +
  (MACRO_SOURCE_LAYER_MAX + 1) * MACRO_SOURCE_LAYER_STRIDE;
export const MACRO_HTML_Z_INDEX_BASE = 10;

function clampMacroSourceLayer(layerValue: number): number {
  return Math.max(
    MACRO_SOURCE_LAYER_MIN,
    Math.min(MACRO_SOURCE_LAYER_MAX, Math.round(Number(layerValue) || 0))
  );
}

export function getMacroRenderedLayer(
  layerValue: number,
  role: MacroLayerRenderRole = 'body'
): number {
  const sourceLayer = clampMacroSourceLayer(layerValue);
  const sourceOffset = sourceLayer * MACRO_SOURCE_LAYER_STRIDE;
  if (role === 'annotation') return MACRO_ANNOTATION_LAYER_BASE + sourceOffset;
  if (role === 'handle') return MACRO_HANDLE_LAYER_BASE + sourceOffset;
  if (role === 'hit') return MACRO_HIT_LAYER_BASE + sourceOffset;
  return MACRO_BODY_LAYER_BASE + sourceOffset;
}

export function getMacroHtmlZIndex(layerValue: number): number {
  return MACRO_HTML_Z_INDEX_BASE + clampMacroSourceLayer(layerValue);
}

function getMacroSourceLayerFromRenderedLayer(
  renderedLayer: number,
  role: MacroLayerRenderRole
): number {
  const roleBase = role === 'annotation'
    ? MACRO_ANNOTATION_LAYER_BASE
    : (role === 'handle'
      ? MACRO_HANDLE_LAYER_BASE
      : (role === 'hit' ? MACRO_HIT_LAYER_BASE : MACRO_BODY_LAYER_BASE));
  return clampMacroSourceLayer(
    Math.floor((Math.round(Number(renderedLayer) || 0) - roleBase) / MACRO_SOURCE_LAYER_STRIDE)
  );
}

export type MacroLayerMarkerKind =
  | 'point'
  | 'coord-text'
  | 'distance'
  | 'linear'
  | 'arc'
  | 'relation'
  | 'area'
  | 'angle'
  | 'circle'
  | 'tangent'
  | 'sector'
  | 'plot'
  | 'function-analysis'
  | 'object-analysis'
  | 'slider'
  | 'schar'
  | 'point-on-graph'
  | 'points-on-graph'
  | 'plot-input';

type MarkerDefinition = {
  prefix: string;
  kind: MacroLayerMarkerKind;
};

export const MACRO_LAYER_MARKER_DEFINITIONS: readonly MarkerDefinition[] = [
  { prefix: 'point-spec-', kind: 'point' },
  { prefix: 'point-ui-', kind: 'point' },
  { prefix: 'coord-text-spec-', kind: 'coord-text' },
  { prefix: 'distance-spec-', kind: 'distance' },
  { prefix: 'linear-spec-', kind: 'linear' },
  { prefix: 'arc-spec-', kind: 'arc' },
  { prefix: 'relation-spec-', kind: 'relation' },
  { prefix: 'area-spec-', kind: 'area' },
  { prefix: 'angle-spec-', kind: 'angle' },
  { prefix: 'circle-spec-', kind: 'circle' },
  { prefix: 'tangent-spec-', kind: 'tangent' },
  { prefix: 'sector-spec-', kind: 'sector' },
  { prefix: 'plot-spec-', kind: 'plot' },
  { prefix: 'function-analysis-spec-', kind: 'function-analysis' },
  { prefix: 'object-analysis-spec-', kind: 'object-analysis' },
  { prefix: 'slider-spec-', kind: 'slider' },
  { prefix: 'schar-spec-', kind: 'schar' },
  { prefix: 'graph-ui-', kind: 'point-on-graph' },
  { prefix: 'multi-graph-ui-', kind: 'points-on-graph' },
  { prefix: 'lia-plot-input-', kind: 'plot-input' }
] as const;

export const MACRO_LAYER_MARKER_SELECTOR = '[id][data-spec]';

const MACRO_LAYER_MARKER_ID_SELECTOR = MACRO_LAYER_MARKER_DEFINITIONS
  .map(function(definition) { return '[id^="' + definition.prefix + '"]'; })
  .join(',');

export type MacroLayerMarkerInfo = {
  kind: MacroLayerMarkerKind;
  uid: string;
};

export interface MacroLayerAssignment<T = any> extends MacroLayerMarkerInfo {
  marker: T;
  boardId: string;
  layer: number;
}

export interface MacroLayerApplyResult {
  assignments: number;
  appliedObjects: number;
  skippedDgsObjects: number;
  pendingMarkers: number;
  pendingObjects: number;
}

/** Pure marker-id parser, intentionally independent of DOM globals. */
export function parseMacroLayerMarkerId(idValue: unknown): MacroLayerMarkerInfo | null {
  const id = String(idValue == null ? '' : idValue);
  for (let index = 0; index < MACRO_LAYER_MARKER_DEFINITIONS.length; index += 1) {
    const definition = MACRO_LAYER_MARKER_DEFINITIONS[index];
    if (!id.startsWith(definition.prefix)) continue;
    const uid = id.slice(definition.prefix.length);
    return uid ? { kind: definition.kind, uid } : null;
  }
  return null;
}

/** Parse the board id from the board field used by the given macro kind. */
export function parseMacroLayerBoardId(
  specValue: unknown,
  kind?: MacroLayerMarkerKind
): string {
  const spec = unquote(String(specValue == null ? '' : specValue)).trim();
  const parts = splitTopLevel(spec, ';');
  const rawBoardId = String(
    (kind === 'schar' ? parts[3] : parts[0]) ||
    (kind === 'plot-input' ? 'A1' : '')
  ).trim();
  const idOption = rawBoardId.match(/^id\s*=\s*(.+)$/i);
  return unquote(String(idOption ? idOption[1] : rawBoardId)).trim();
}

function markerId(marker: any): string {
  return String(marker && marker.id || '');
}

function markerSpec(marker: any): string {
  if (marker && marker.spec != null) return String(marker.spec);
  if (marker && marker.dataset && marker.dataset.spec != null) return String(marker.dataset.spec);
  try {
    if (marker && typeof marker.getAttribute === 'function') {
      return String(marker.getAttribute('data-spec') || '');
    }
  } catch (e) {}
  return '';
}

/**
 * Pure source-order assignment. Plain `{ id, spec }` objects can be supplied
 * by Node tests; DOM elements work through their `dataset.spec` fallback.
 */
export function assignMacroLayersBySourceOrder<T = any>(markers: readonly T[]): MacroLayerAssignment<T>[] {
  const counters: Record<string, number> = {};
  const assignments: MacroLayerAssignment<T>[] = [];

  Array.from(markers || []).forEach(function(marker: T) {
    const info = parseMacroLayerMarkerId(markerId(marker));
    if (!info) return;
    const boardId = parseMacroLayerBoardId(markerSpec(marker), info.kind);
    if (!boardId) return;
    const index = counters[boardId] || 0;
    counters[boardId] = index + 1;
    assignments.push({
      marker,
      kind: info.kind,
      uid: info.uid,
      boardId,
      layer: clampMacroSourceLayer(index)
    });
  });

  return assignments;
}

function registryEntry(root: any, registryName: string, key: string): any | null {
  try {
    const registry = root && root[registryName];
    return registry && registry[key] ? registry[key] : null;
  } catch (e) { return null; }
}

function pointMacroObject(root: any, boardId: string, uid: string): any | null {
  const macroKey = 'macro:point:' + String(uid || '');
  const board = root && root.__boards && root.__boards[boardId];
  if (!board) return null;
  const candidates: any[] = [];
  const seen = new Set<any>();
  const add = function(candidate: any) {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };

  try {
    const points = root.__points && root.__points[boardId];
    if (points && typeof points === 'object') Object.keys(points).forEach(function(key) { add(points[key]); });
  } catch (e) {}
  try { if (Array.isArray(board.objectsList)) board.objectsList.forEach(add); } catch (e) {}
  try {
    if (board.objects && typeof board.objects === 'object') {
      Object.keys(board.objects).forEach(function(key) { add(board.objects[key]); });
    }
  } catch (e) {}

  return candidates.find(function(candidate) {
    return candidate && candidate.board === board && String(candidate.__liaDgsMacroKey || '') === macroKey;
  }) || null;
}

function graphQuizMacroEntry(
  root: any,
  registryName: string,
  uid: string,
  boardId: string
): any | null {
  const metadata = registryEntry(root, registryName, uid);
  const board = root && root.__boards && root.__boards[boardId];
  if (!metadata || !board) return null;
  try {
    if (metadata.boardId && String(metadata.boardId) !== boardId) return null;
  } catch (e) {}

  const points: any[] = [];
  try {
    const pointBucket = root.__points && root.__points[boardId];
    (Array.isArray(metadata.names) ? metadata.names : []).forEach(function(name: any) {
      const point = pointBucket && pointBucket[String(name || '')];
      if (point && (!point.board || point.board === board)) points.push(point);
    });
  } catch (e) {}

  let graphEntry: any = null;
  try {
    graphEntry = root.__pointGraphs &&
      root.__pointGraphs[boardId] &&
      root.__pointGraphs[boardId][String(metadata.graphKey || '')];
    if (graphEntry && graphEntry.graph && graphEntry.graph.board !== board) graphEntry = null;
  } catch (e) { graphEntry = null; }

  return {
    board,
    boardId,
    points,
    graph: graphEntry && graphEntry.graph,
    anchor: graphEntry && graphEntry.anchor,
    text: graphEntry && graphEntry.text
  };
}

/** Resolve the existing subsystem registry entry for one marker assignment. */
export function resolveMacroLayerRegistryEntry(
  assignment: Pick<MacroLayerAssignment, 'kind' | 'uid' | 'boardId'>,
  registryRoot?: any
): any | null {
  const root = registryRoot || (typeof window !== 'undefined' ? window : globalThis as any);
  const uid = String(assignment && assignment.uid || '');
  const boardId = String(assignment && assignment.boardId || '');
  if (!uid || !boardId) return null;

  if (assignment.kind === 'point') return pointMacroObject(root, boardId, uid);
  if (assignment.kind === 'point-on-graph') {
    return graphQuizMacroEntry(root, '__pointOnGraphLayerEntries', uid, boardId);
  }
  if (assignment.kind === 'points-on-graph') {
    return graphQuizMacroEntry(root, '__pointsOnGraphLayerEntries', uid, boardId);
  }
  if (assignment.kind === 'plot-input') {
    return registryEntry(root, '__plotInputStates', uid);
  }

  const definitions: Partial<Record<MacroLayerMarkerKind, [string, string]>> = {
    'coord-text': ['__coordTextEntries', 'coord-text-'],
    distance: ['__distanceEntries', 'distance-'],
    linear: ['__linearObjectEntries', 'linear-'],
    arc: ['__arcEntries', 'arc-'],
    relation: ['__relationObjectEntries', 'relation-'],
    area: ['__areaEntries', 'area-'],
    angle: ['__angleEntries', 'angle-'],
    circle: ['__circleEntries', 'circle-'],
    tangent: ['__tangentEntries', 'tangent-'],
    sector: ['__sectorEntries', 'sector-'],
    plot: ['__plotFunctionEntries', 'plot-'],
    'function-analysis': ['__functionAnalysisPointEntries', 'function-analysis-'],
    'object-analysis': ['__objectAnalysisPointEntries', 'object-analysis-'],
    slider: ['__sliderEntries', 'slider-'],
    schar: ['__scharEntries', 'schar-']
  };
  const definition = definitions[assignment.kind];
  if (!definition) return null;
  const entry = registryEntry(root, definition[0], definition[1] + uid);
  if (!entry) return null;
  try {
    if (entry.boardId && String(entry.boardId) !== boardId) return null;
  } catch (e) {}
  return entry;
}

function isLayerableObject(value: any): boolean {
  return !!value && typeof value === 'object' && !!(
    value.board || value.visProp || value.visPropCalc || typeof value.setAttribute === 'function'
  );
}

const COMPOSITE_SINGLE_CHILDREN = [
  'label', 'arc', 'dot',
  '__liaDgsMeasurementLabel', '__liaDgsAngleLabel', '__liaDgsCircleLabel',
  '__liaDgsCircleNameLabel', '__liaDgsCircleMeasurementLabel',
  '__liaDgsFunctionLabel', '__liaDgsArcLabel', '__liaDgsPolygonBorderLabel'
];

const COMPOSITE_ARRAY_CHILDREN = [
  'borders', '__liaDgsPolygonBorders',
  '__liaDgsStyleCapSegments'
];

function addCompositeTree(
  value: any,
  output: any[],
  seen: Set<any>,
  expectedBoard?: any
): void {
  if (Array.isArray(value)) {
    value.forEach(function(item) { addCompositeTree(item, output, seen, expectedBoard); });
    return;
  }
  if (!isLayerableObject(value) || seen.has(value)) return;
  try { if (expectedBoard && value.board && value.board !== expectedBoard) return; } catch (e) {}
  seen.add(value);
  output.push(value);

  COMPOSITE_SINGLE_CHILDREN.forEach(function(property) {
    try { addCompositeTree(value[property], output, seen, expectedBoard); } catch (e) {}
  });
  COMPOSITE_ARRAY_CHILDREN.forEach(function(property) {
    try { addCompositeTree(value[property], output, seen, expectedBoard); } catch (e) {}
  });
  try {
    if (value.__liaDgsSlider || value.__liaMacroSlider || String(value.elType || '').toLowerCase() === 'slider') {
      [value.baseline, value.highline, value.point1, value.point2].forEach(function(part) {
        addCompositeTree(part, output, seen, expectedBoard);
      });
    }
  } catch (e) {}
}

/** Collect only objects created/owned by a registry entry, never its references. */
export function collectOwnedMacroLayerObjects(
  kind: MacroLayerMarkerKind,
  entry: any,
  expectedBoard?: any
): any[] {
  if (!entry) return [];
  const seeds: any[] = [];
  const add = function(value: any) {
    if (Array.isArray(value)) value.forEach(function(item) { seeds.push(item); });
    else if (value) seeds.push(value);
  };

  if (kind === 'point') add(entry);
  else if (kind === 'coord-text') add(entry.text);
  else if (kind === 'distance') {
    add(entry.segments);
    add(entry.capSegments);
    add(entry.label);
  } else if (kind === 'linear') {
    add(entry.object);
    add(entry.label);
  } else if (kind === 'arc') {
    add(entry.curve);
    add(entry.capSegments);
    add(entry.label);
  } else if (kind === 'relation') {
    add(entry.object);
  } else if (kind === 'area') {
    add(entry.polygon);
    add(entry.label);
  } else if (kind === 'angle') {
    add(entry.angle);
    add(entry.label);
  } else if (kind === 'circle') {
    add(entry.circle);
    add(entry.nameLabel);
    add(entry.measurementLabel);
  } else if (kind === 'tangent') {
    add(entry.tangent);
    add(entry.contactPoint);
  } else if (kind === 'sector') add(entry.sector);
  else if (kind === 'plot') {
    add(entry.graph);
    add(entry.label);
  } else if (kind === 'function-analysis' || kind === 'object-analysis') add(entry.points);
  else if (kind === 'slider') {
    add(entry.slider);
    try { add(entry.slider && entry.slider.label); } catch (e) {}
    try { add(entry.slider && entry.slider.baseline); } catch (e) {}
    try { add(entry.slider && entry.slider.highline); } catch (e) {}
    try { add(entry.slider && entry.slider.point1); } catch (e) {}
    try { add(entry.slider && entry.slider.point2); } catch (e) {}
  } else if (kind === 'schar') {
    add(entry.graph);
    add(entry.dragGraph);
    add(entry.graphLabel);
  } else if (kind === 'point-on-graph' || kind === 'points-on-graph') {
    add(entry.points);
    add(entry.graph);
    add(entry.text);
  } else if (kind === 'plot-input') {
    add(entry.graph);
    add(entry.text);
  }

  const output: any[] = [];
  const seen = new Set<any>();
  seeds.forEach(function(seed) { addCompositeTree(seed, output, seen, expectedBoard); });
  // JSXGraph's angle.arc is an internal helper that must remain permanently
  // hidden. Layer only the visible angle sector/dot and its annotation.
  let hiddenAngleHelper: any = null;
  try { if (kind === 'angle' && entry.angle) hiddenAngleHelper = entry.angle.arc; } catch (e) {}
  return hiddenAngleHelper ? output.filter(function(object) { return object !== hiddenAngleHelper; }) : output;
}

function entryContainsValue(value: any, target: any): boolean {
  if (Array.isArray(value)) return value.some(function(item) { return entryContainsValue(item, target); });
  return !!value && value === target;
}

function objectElementType(object: any): string {
  try { return String(object && (object.elType || object.typeName) || '').toLowerCase(); }
  catch (e) { return ''; }
}

/** Determine the renderer role without changing the logical source rank. */
export function getMacroLayerRenderRole(
  kind: MacroLayerMarkerKind | null,
  entry: any,
  object: any
): MacroLayerRenderRole {
  const type = objectElementType(object);
  const annotationValues = [
    entry && entry.label,
    entry && entry.text,
    entry && entry.graphLabel,
    entry && entry.nameLabel,
    entry && entry.measurementLabel,
    entry && entry.slider && entry.slider.label
  ];
  if (type === 'text' || annotationValues.some(function(value) { return entryContainsValue(value, object); })) {
    return 'annotation';
  }
  if (entry && object === entry.dragGraph) return 'hit';
  try {
    if (kind === 'angle' && entry && entry.angle && object === entry.angle.dot) return 'body';
  } catch (e) {}

  const handleValues = [
    kind === 'point' ? entry : null,
    entry && entry.points,
    entry && entry.contactPoint,
    entry && entry.slider,
    entry && entry.slider && entry.slider.point1,
    entry && entry.slider && entry.slider.point2
  ];
  if (type === 'point' || type === 'glider' || type === 'slider' ||
      handleValues.some(function(value) { return entryContainsValue(value, object); })) {
    return 'handle';
  }
  return 'body';
}

function finiteDgsLayer(object: any): boolean {
  try {
    return object && object.__liaDgsLayer != null && Number.isFinite(Number(object.__liaDgsLayer));
  } catch (e) { return false; }
}

function readObjectLayer(object: any): number | null {
  const candidates: any[] = [];
  try { candidates.push(object && object.visPropCalc && object.visPropCalc.layer); } catch (e) {}
  try { candidates.push(object && object.visProp && object.visProp.layer); } catch (e) {}
  try {
    if (object && typeof object.getAttribute === 'function') candidates.push(object.getAttribute('layer'));
  } catch (e) {}
  for (let index = 0; index < candidates.length; index += 1) {
    const value = Number(candidates[index]);
    if (Number.isFinite(value)) return Math.round(value);
  }
  return null;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function rendererNodes(object: any): any[] {
  const nodes: any[] = [];
  const seen = new Set<any>();
  ['rendNode', 'rendNodeText'].forEach(function(property) {
    try {
      const node = object && object[property];
      if (node && !seen.has(node)) {
        seen.add(node);
        nodes.push(node);
      }
    } catch (e) {}
  });
  return nodes;
}

function annotationUsesHtml(object: any, role: MacroLayerRenderRole): boolean {
  if (role !== 'annotation') return false;
  const nodes = rendererNodes(object);
  const namespaces = nodes
    .map(function(node) { return String(node.namespaceURI || ''); })
    .filter(Boolean);
  if (namespaces.some(function(namespace) { return namespace !== SVG_NAMESPACE; })) return true;
  if (namespaces.some(function(namespace) { return namespace === SVG_NAMESPACE; })) return false;

  const displayCandidates: any[] = [];
  try { displayCandidates.push(object && object.visProp && object.visProp.display); } catch (e) {}
  try { displayCandidates.push(object && object.visPropCalc && object.visPropCalc.display); } catch (e) {}
  try {
    if (object && typeof object.getAttribute === 'function') displayCandidates.push(object.getAttribute('display'));
  } catch (e) {}
  const display = displayCandidates
    .map(function(value) { return String(value == null ? '' : value).toLowerCase(); })
    .find(Boolean) || '';
  if (display === 'internal') return false;
  if (display === 'html') return true;
  return true;
}

function setLayerPending(object: any, pending: boolean): void {
  try {
    if (pending) object.__liaMacroLayerPending = true;
    else delete object.__liaMacroLayerPending;
  } catch (e) {
    try { object.__liaMacroLayerPending = pending || undefined; } catch (e2) {}
  }
}

/** Add missing SVG groups when a board was created before the global option changed. */
export function ensureBoardRendererLayerCapacity(
  board: any,
  required: number = MACRO_RENDER_LAYER_COUNT
): number | null {
  try {
    const renderer = board && board.renderer;
    const layers = renderer && renderer.layer;
    if (!Array.isArray(layers)) return null;
    const target = Math.max(1, Math.round(Number(required) || MACRO_RENDER_LAYER_COUNT));
    if (layers.length >= target && layers.slice(0, target).every(Boolean)) return layers.length;

    const root = renderer.svgRoot;
    const documentRoot = (renderer.container && renderer.container.ownerDocument) ||
      (root && root.ownerDocument);
    if (!root || !documentRoot || typeof documentRoot.createElementNS !== 'function') return layers.length;
    const namespace = renderer.svgNamespace || SVG_NAMESPACE;
    for (let index = 0; index < target; index += 1) {
      if (layers[index]) continue;
      const group = documentRoot.createElementNS(namespace, 'g');
      let before = null;
      for (let next = index + 1; next < layers.length; next += 1) {
        if (layers[next] && layers[next].parentNode === root) {
          before = layers[next];
          break;
        }
      }
      if (!before && renderer.foreignObjLayer && renderer.foreignObjLayer.parentNode === root) {
        before = renderer.foreignObjLayer;
      }
      if (before && typeof root.insertBefore === 'function') root.insertBefore(group, before);
      else if (typeof root.appendChild === 'function') root.appendChild(group);
      else return layers.length;
      layers[index] = group;
    }
    return layers.length;
  } catch (e) { return null; }
}

function svgLayerMembership(object: any, board: any, layer: number): boolean | null {
  try {
    const renderer = board && board.renderer;
    if (!renderer || !Array.isArray(renderer.layer)) return null;
    const target = renderer.layer[layer];
    const node = object && object.rendNode;
    if (!target || !node) return false;
    return node.parentNode === target;
  } catch (e) { return false; }
}

/**
 * Move SVG/VML objects safely and keep HTML/MathJax text in the board div.
 * Calling JSXGraph's setAttribute({ layer }) for an HTML text would append its
 * div to an SVG group and make it disappear.
 */
export function applySafeRenderedLayer(
  object: any,
  layerValue: number,
  fallbackBoard?: any,
  role: MacroLayerRenderRole = 'body'
): boolean {
  if (!object) return false;
  const layer = Math.max(0, Math.round(Number(layerValue) || 0));
  if (annotationUsesHtml(object, role)) {
    let changed = false;
    const board = object.board || fallbackBoard;
    const cssLayer = getMacroHtmlZIndex(
      getMacroSourceLayerFromRenderedLayer(layer, role)
    );
    const nodes = rendererNodes(object);
    if (!nodes.length) {
      setLayerPending(object, true);
      return false;
    }
    nodes.forEach(function(node) {
      try {
        if (node.parentNode && String(node.parentNode.namespaceURI || '') === SVG_NAMESPACE &&
            board && board.containerObj && typeof board.containerObj.appendChild === 'function') {
          board.containerObj.appendChild(node);
          changed = true;
        }
      } catch (e) {}
      try {
        if (node.style && String(node.style.zIndex || '') !== String(cssLayer)) {
          node.style.zIndex = String(cssLayer);
          changed = true;
        }
      } catch (e) {}
    });
    setLayerPending(object, false);
    return changed;
  }

  const board = object.board || fallbackBoard;
  ensureBoardRendererLayerCapacity(board);
  const membership = svgLayerMembership(object, board, layer);
  const changed = readObjectLayer(object) !== layer || membership === false;
  if (!changed) {
    setLayerPending(object, false);
    return false;
  }
  try {
    if (board && board.renderer && typeof board.renderer.setLayer === 'function') {
      board.renderer.setLayer(object, layer);
    }
  } catch (e) {
    setLayerPending(object, true);
    return false;
  }
  if (svgLayerMembership(object, board, layer) === false) {
    setLayerPending(object, true);
    return false;
  }
  try { if (object.visProp) object.visProp.layer = layer; } catch (e) {}
  try { if (object.visPropCalc) object.visPropCalc.layer = layer; } catch (e) {}
  setLayerPending(object, false);
  return true;
}

/** Apply one logical source layer without creating the DGS manual-layer sentinel. */
export function applyMacroSourceLayer(
  object: any,
  layerValue: number,
  role: MacroLayerRenderRole = 'body'
): boolean {
  if (!object || finiteDgsLayer(object)) return false;
  const sourceLayer = clampMacroSourceLayer(layerValue);
  const renderedLayer = getMacroRenderedLayer(sourceLayer, role);
  const metadataChanged = object.__liaMacroSourceLayer !== sourceLayer ||
    object.__liaMacroRenderedLayer !== renderedLayer || object.__liaMacroLayerRole !== role;
  object.__liaMacroSourceLayer = sourceLayer;
  object.__liaMacroRenderedLayer = renderedLayer;
  object.__liaMacroLayerRole = role;
  return applySafeRenderedLayer(object, renderedLayer, object.board, role) || metadataChanged;
}

function protectedDgsCompositeObjects(objects: any[], expectedBoard?: any): Set<any> {
  const protectedObjects = new Set<any>();
  objects.forEach(function(object) {
    if (!finiteDgsLayer(object)) return;
    const descendants: any[] = [];
    addCompositeTree(object, descendants, new Set<any>(), expectedBoard);
    descendants.forEach(function(descendant) { protectedObjects.add(descendant); });
  });
  objects.forEach(function(object) {
    const owners = [
      object && object.__liaDgsOwner,
      object && object.__liaDgsSliderOwner,
      object && object.__liaDgsPolygonBorderOwner,
      object && object.__liaDgsDesignOwner
    ];
    if (owners.some(finiteDgsLayer)) protectedObjects.add(object);
  });
  return protectedObjects;
}

function defaultDocumentRoot(): ParentNode | null {
  return typeof document !== 'undefined' ? document : null;
}

function defaultRegistryRoot(): any {
  return typeof window !== 'undefined' ? window : globalThis as any;
}

/**
 * JSXGraph's SVG renderer needs one group per usable renderer layer.
 */
export function ensureMacroLayerCapacity(registryRoot: any = defaultRegistryRoot()): number | null {
  try {
    const layerOptions = registryRoot && registryRoot.JXG &&
      registryRoot.JXG.Options && registryRoot.JXG.Options.layer;
    if (!layerOptions) return null;
    const required = MACRO_RENDER_LAYER_COUNT;
    const configured = Number(layerOptions.numlayers);
    if (!Number.isFinite(configured) || configured < required) {
      layerOptions.numlayers = required;
    }
    return Number(layerOptions.numlayers);
  } catch (e) { return null; }
}

/** Scan current markers and apply their board-local source layers. */
export function applyMacroCodeOrderLayers(
  documentRoot: ParentNode | null = defaultDocumentRoot(),
  registryRoot: any = defaultRegistryRoot()
): MacroLayerApplyResult {
  const result: MacroLayerApplyResult = {
    assignments: 0,
    appliedObjects: 0,
    skippedDgsObjects: 0,
    pendingMarkers: 0,
    pendingObjects: 0
  };
  if (!documentRoot || typeof (documentRoot as any).querySelectorAll !== 'function') return result;

  ensureMacroLayerCapacity(registryRoot);

  let markers: any[] = [];
  try {
    markers = Array.from((documentRoot as any).querySelectorAll(MACRO_LAYER_MARKER_SELECTOR))
      .filter(function(marker: any) {
        try {
          if (typeof marker?.hasAttribute === 'function') {
            return !marker.hasAttribute('data-lia-static-claimed');
          }
        } catch (e) {}
        return !(marker && marker.dataset && marker.dataset.liaStaticClaimed);
      });
  } catch (e) {}
  const assignments = assignMacroLayersBySourceOrder(markers);
  result.assignments = assignments.length;
  const changedBoards = new Set<any>();

  assignments.forEach(function(assignment) {
    const entry = resolveMacroLayerRegistryEntry(assignment, registryRoot);
    if (!entry) {
      result.pendingMarkers += 1;
      return;
    }
    const expectedBoard = registryRoot && registryRoot.__boards && registryRoot.__boards[assignment.boardId];
    ensureBoardRendererLayerCapacity(expectedBoard || entry.board);
    const objects = collectOwnedMacroLayerObjects(assignment.kind, entry, expectedBoard);
    const protectedObjects = protectedDgsCompositeObjects(objects, expectedBoard);
    objects.forEach(function(object) {
      if (protectedObjects.has(object) || finiteDgsLayer(object)) {
        result.skippedDgsObjects += 1;
        return;
      }
      const role = getMacroLayerRenderRole(assignment.kind, entry, object);
      const changed = applyMacroSourceLayer(object, assignment.layer, role);
      if (object.__liaMacroLayerPending) {
        result.pendingObjects += 1;
        return;
      }
      if (!changed) return;
      result.appliedObjects += 1;
      try { if (object.board) changedBoards.add(object.board); } catch (e) {}
    });
  });

  changedBoards.forEach(function(board) {
    try {
      if (board && typeof board.fullUpdate === 'function') board.fullUpdate();
      else if (board && typeof board.update === 'function') board.update();
    } catch (e) {
      try { if (board && typeof board.update === 'function') board.update(); } catch (e2) {}
    }
  });
  return result;
}

const MAX_RETRY_PASSES = 40;
const RETRY_DELAY_MS = 120;
const SETTLE_FRAME_PASSES = 1;
let scheduledFrame: number | null = null;
let fallbackFrame: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryPass = 0;
let settleFramePasses = 0;
let scheduledDocumentRoot: ParentNode | null = null;
let scheduledRegistryRoot: any = null;
let macroLayerObserver: MutationObserver | null = null;

function queueMacroLayerFrame(): void {
  if (scheduledFrame != null || fallbackFrame != null) return;
  const root = scheduledRegistryRoot || defaultRegistryRoot();
  const run = function() {
    scheduledFrame = null;
    fallbackFrame = null;
    const result = applyMacroCodeOrderLayers(
      scheduledDocumentRoot || defaultDocumentRoot(),
      scheduledRegistryRoot || defaultRegistryRoot()
    );
    const needsSettleFrame = settleFramePasses > 0;
    if (needsSettleFrame) settleFramePasses -= 1;
    if ((result.pendingMarkers > 0 || result.pendingObjects > 0) && retryPass < MAX_RETRY_PASSES) {
      retryPass += 1;
      if (retryTimer != null) clearTimeout(retryTimer);
      retryTimer = setTimeout(function() {
        retryTimer = null;
        queueMacroLayerFrame();
      }, RETRY_DELAY_MS);
    } else if (!needsSettleFrame) {
      retryPass = 0;
    }
    if (needsSettleFrame) queueMacroLayerFrame();
  };

  try {
    if (root && typeof root.requestAnimationFrame === 'function') {
      scheduledFrame = root.requestAnimationFrame(run);
      return;
    }
  } catch (e) {}
  fallbackFrame = setTimeout(run, 0);
}

/** RAF-deduped scheduler with bounded retries for asynchronously bootstrapped registries. */
export function scheduleMacroCodeOrderLayers(
  documentRoot: ParentNode | null = defaultDocumentRoot(),
  registryRoot: any = defaultRegistryRoot()
): void {
  scheduledDocumentRoot = documentRoot;
  scheduledRegistryRoot = registryRoot;
  retryPass = 0;
  settleFramePasses = Math.max(settleFramePasses, SETTLE_FRAME_PASSES);
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  queueMacroLayerFrame();
}

function nodeContainsMacroMarker(node: any): boolean {
  if (!node || node.nodeType !== 1) return false;
  try { if (typeof node.matches === 'function' && node.matches(MACRO_LAYER_MARKER_ID_SELECTOR)) return true; } catch (e) {}
  try {
    return !!(typeof node.querySelector === 'function' && node.querySelector(MACRO_LAYER_MARKER_ID_SELECTOR));
  } catch (e) { return false; }
}

/** Install the observer, expose browser globals, and schedule the initial pass. */
export function initMacroCodeOrderLayers(
  documentRoot: ParentNode | null = defaultDocumentRoot(),
  registryRoot: any = defaultRegistryRoot()
): void {
  const root = registryRoot || defaultRegistryRoot();
  ensureMacroLayerCapacity(root);
  try {
    root.__macroCodeLayersReady = true;
    root.__applyMacroCodeOrderLayers = applyMacroCodeOrderLayers;
    root.__scheduleMacroCodeOrderLayers = scheduleMacroCodeOrderLayers;
    root.__initMacroCodeOrderLayers = initMacroCodeOrderLayers;
  } catch (e) {}

  if (!documentRoot) return;
  if (!macroLayerObserver) {
    try {
      const Observer = (root && root.MutationObserver) ||
        (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
      if (Observer) {
        macroLayerObserver = new Observer(function(mutations: MutationRecord[]) {
          let relevant = false;
          for (let index = 0; index < mutations.length && !relevant; index += 1) {
            const mutation = mutations[index];
            if (mutation.type === 'attributes') {
              relevant = nodeContainsMacroMarker(mutation.target);
              continue;
            }
            if (mutation.type !== 'childList') continue;
            const changedNodes = Array.from(mutation.addedNodes || [])
              .concat(Array.from(mutation.removedNodes || []));
            relevant = changedNodes.some(nodeContainsMacroMarker);
          }
          if (relevant) scheduleMacroCodeOrderLayers(documentRoot, root);
        });
        const observedRoot = (documentRoot as any).documentElement || documentRoot;
        macroLayerObserver.observe(observedRoot, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-spec']
        });
        try { root.__macroCodeOrderLayerObserver = macroLayerObserver; } catch (e) {}
      }
    } catch (e) {}
  }
  scheduleMacroCodeOrderLayers(documentRoot, root);
}
