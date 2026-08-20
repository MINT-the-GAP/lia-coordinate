// Lightweight native-SVG renderer for explicitly static coordinate systems.
// This module intentionally has no JSXGraph dependency and owns one batched
// DOM observer for all static boards and macro markers.

import type { BoardConfig } from '../shared/coordSpec';
import { parseCoordSpec } from '../shared/coordSpec';
import { isHiddenNameOption, parseCoordinateList, splitTopLevel, unquote } from '../shared/parser';
import type { CoordinatePair } from '../shared/parser';
import { parseLineStyleOptions, type LineStyle } from '../shared/lineStyle';
import { getAccentColor, getNeutralColor, themeDoc } from '../shared/theme';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const STATIC_CLAIM_ATTRIBUTE = 'data-lia-static-claimed';
export const STATIC_CONTAINER_SELECTOR = '[data-lia-static-coordinate]';
export const STATIC_DECLARATIVE_HOST_ATTRIBUTE = 'data-lia-static-coordinate-host';
export const STATIC_HOST_SELECTOR =
  '[' + STATIC_DECLARATIVE_HOST_ATTRIBUTE + '][data-spec],' +
  '[data-lia-static-coordinate=""][data-spec]';
export const STATIC_SVG_SELECTOR = 'svg[data-lia-static-svg]';

export interface StaticBounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface StaticAreaSpec {
  kind: 'area';
  boardId: string;
  coordinates: CoordinatePair[];
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
  visible: boolean;
  lineStyle: LineStyle;
  strokeWidth: number;
  showArea: boolean;
  showPerimeter: boolean;
}

export interface StaticDistanceSpec {
  kind: 'distance';
  boardId: string;
  coordinates: CoordinatePair[];
  color: string;
  hasExplicitColor: boolean;
  strokeWidth: number;
  lineStyle: LineStyle;
  visible: boolean;
  normalizedDesign: string;
  firstArrow: boolean;
  lastArrow: boolean;
  startCap: boolean;
  endCap: boolean;
  showLength: boolean;
  segmentName: string;
  showName: boolean;
}

export type StaticGeometrySpec = StaticAreaSpec | StaticDistanceSpec;

export interface StaticBoardHandle {
  id: string;
  container: HTMLElement;
  config: BoardConfig;
  svg: SVGSVGElement | null;
}

type StaticMarkerKind = 'area' | 'distance' | 'unsupported';

interface StaticMarkerInfo {
  kind: StaticMarkerKind;
  uid: string;
  boardIndex: number;
}

interface StaticGeometryEntry {
  marker: HTMLElement;
  info: StaticMarkerInfo;
  geometry: StaticGeometrySpec;
}

// Every data-spec host consumed by a coordinate subsystem is listed here so a
// static board can claim unsupported declarations before their normal
// subsystem bootstrap sees them. Schar is the sole established format whose
// board id does not occupy the first field.
const STATIC_MARKER_PREFIXES: ReadonlyArray<{
  prefix: string;
  kind: StaticMarkerKind;
  boardIndex?: number;
}> = [
  { prefix: 'area-spec-', kind: 'area' },
  { prefix: 'distance-spec-', kind: 'distance' },
  { prefix: 'axis-title-spec-', kind: 'unsupported' },
  { prefix: 'point-ui-', kind: 'unsupported' },
  { prefix: 'point-spec-', kind: 'unsupported' },
  { prefix: 'coord-text-spec-', kind: 'unsupported' },
  { prefix: 'linear-spec-', kind: 'unsupported' },
  { prefix: 'arc-spec-', kind: 'unsupported' },
  { prefix: 'relation-spec-', kind: 'unsupported' },
  { prefix: 'angle-spec-', kind: 'unsupported' },
  { prefix: 'circle-spec-', kind: 'unsupported' },
  { prefix: 'tangent-spec-', kind: 'unsupported' },
  { prefix: 'sector-spec-', kind: 'unsupported' },
  { prefix: 'plot-spec-', kind: 'unsupported' },
  { prefix: 'function-analysis-spec-', kind: 'unsupported' },
  { prefix: 'object-analysis-spec-', kind: 'unsupported' },
  { prefix: 'slider-spec-', kind: 'unsupported' },
  { prefix: 'lia-plot-input-', kind: 'unsupported' },
  { prefix: 'schar-spec-', kind: 'unsupported', boardIndex: 3 },
  { prefix: 'polygon-metric-quiz-spec-', kind: 'unsupported' },
  { prefix: 'construction-quiz-spec-', kind: 'unsupported' },
  { prefix: 'combined-quiz-spec-', kind: 'unsupported' },
  { prefix: 'rek-spec-', kind: 'unsupported' },
  { prefix: 'graph-ui-', kind: 'unsupported' },
  { prefix: 'graph-spec-', kind: 'unsupported' },
  { prefix: 'multi-graph-ui-', kind: 'unsupported' },
  { prefix: 'lia-table-', kind: 'unsupported' },
  { prefix: 'dgs-ui-', kind: 'unsupported' },
  { prefix: 'dgs-instrument-ui-', kind: 'unsupported' },
  { prefix: 'regression-ui-', kind: 'unsupported' }
];

const MARKER_SELECTOR = STATIC_MARKER_PREFIXES
  .map(function(definition) { return '[id^="' + definition.prefix + '"][data-spec]'; })
  .join(',');

let fallbackRegistry: Record<string, StaticBoardHandle> = {};
let bootstrapFrame = 0;
let bootstrapRunning = false;
let staticObserver: MutationObserver | null = null;
let markerSerial = 0;

function registry(): Record<string, StaticBoardHandle> {
  if (typeof window === 'undefined') return fallbackRegistry;
  window.__staticCoordinateBoards = window.__staticCoordinateBoards || {};
  return window.__staticCoordinateBoards;
}

function warningKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set<string>();
  window.__staticCoordinateWarnings = window.__staticCoordinateWarnings || new Set<string>();
  return window.__staticCoordinateWarnings;
}

function warnOnce(key: string, message: string): void {
  const keys = warningKeys();
  if (keys.has(key)) return;
  keys.add(key);
  try { console.warn('[lia-coordinate static] ' + message); } catch (e) {}
}

function documentFor(container?: HTMLElement | null): Document | null {
  if (container && container.ownerDocument) return container.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

function markerInfo(node: Element): StaticMarkerInfo | null {
  const id = String((node as HTMLElement).id || '');
  for (let index = 0; index < STATIC_MARKER_PREFIXES.length; index += 1) {
    const definition = STATIC_MARKER_PREFIXES[index];
    if (!id.startsWith(definition.prefix)) continue;
    const uid = id.slice(definition.prefix.length);
    return uid ? {
      kind: definition.kind,
      uid,
      boardIndex: definition.boardIndex || 0
    } : null;
  }
  return null;
}

function markerBoardId(node: HTMLElement, info: StaticMarkerInfo): string {
  const spec = unquote(String(node.dataset && node.dataset.spec || '')).trim();
  const parts = splitTopLevel(spec, ';');
  if (node.id.startsWith('axis-title-spec-') || node.id.startsWith('lia-table-')) {
    const namedParts = splitTopLevel(spec);
    for (let index = namedParts.length - 1; index >= 0; index -= 1) {
      const namedId = String(namedParts[index] || '').trim().match(/^id\s*=\s*(.+)$/i);
      if (namedId) return unquote(String(namedId[1] || '')).trim();
    }
  }
  let value = String(parts[info.boardIndex] || '').trim();
  if (!value && node.id.startsWith('lia-plot-input-')) value = 'A1';
  const idOption = value.match(/^id\s*=\s*(.+)$/i);
  return unquote(String(idOption ? idOption[1] : value)).trim();
}

function optionParts(spec: string): string[] {
  return splitTopLevel(unquote(String(spec || '')), ';')
    .map(function(part) { return unquote(part).trim(); });
}

/** Parse only the direct-coordinate subset supported by the native renderer. */
export function parseStaticAreaSpec(spec: string, language?: string): StaticAreaSpec | null {
  const parts = optionParts(spec);
  const coordinates = parseCoordinateList(parts[1]);
  if (!coordinates || coordinates.length < 3) return null;
  const distinct = new Set(coordinates.map(function(point) { return point.x + ':' + point.y; }));
  if (distinct.size < 3) return null;

  const explicitColor = String(parts[2] || '').trim();
  const parsedOpacity = parseFloat(String(parts[3] || '').replace(',', '.'));
  const options = parts.slice(4).map(function(option) { return String(option || '').trim(); });
  return {
    kind: 'area',
    boardId: String(parts[0] || '').trim(),
    coordinates,
    color: explicitColor || getAccentColor(),
    hasExplicitColor: !!explicitColor,
    opacity: Number.isFinite(parsedOpacity) ? Math.max(0, Math.min(1, parsedOpacity)) : 0.25,
    visible: !options.some(function(option) {
      return /^(?:visible|sichtbar)\s*=\s*0$/i.test(option);
    }),
    lineStyle: parseLineStyleOptions(options),
    strokeWidth: 2,
    showArea: options.some(function(option) { return /^(?:inhalt|area)\s*=\s*1$/i.test(option); }),
    showPerimeter: options.some(function(option) { return /^(?:umfang|perimeter)\s*=\s*1$/i.test(option); })
  };
}

function normalizeDesignToken(value: unknown): string {
  return String(value == null ? '' : value)
    .trim()
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&vert;/gi, '|')
    .replace(/\u2194/g, '<->')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\s+/g, '');
}

function designOptionValue(value: unknown): string | null {
  const raw = String(value == null ? '' : value).trim();
  const keyed = raw.match(/^design\s*=\s*(.*)$/i);
  const token = normalizeDesignToken(keyed ? keyed[1] : raw);
  return token === '-' || /^\|?(?:->|<-|<->)\|?$/.test(token) ? token : null;
}

function parseDesign(value: unknown): Pick<StaticDistanceSpec,
  'normalizedDesign' | 'firstArrow' | 'lastArrow' | 'startCap' | 'endCap'> {
  let raw = normalizeDesignToken(value);
  if (raw === '-') raw = '';
  const startCap = raw.startsWith('|');
  const endCap = raw.endsWith('|');
  if (startCap) raw = raw.slice(1);
  if (endCap && raw) raw = raw.slice(0, -1);
  const arrow = raw === '->' || raw === '<-' || raw === '<->' ? raw : '';
  return {
    normalizedDesign: (startCap ? '|' : '') + arrow + (endCap ? '|' : ''),
    firstArrow: arrow === '<-' || arrow === '<->',
    lastArrow: arrow === '->' || arrow === '<->',
    startCap,
    endCap
  };
}

function isStrokeWidthToken(value: unknown): boolean {
  return /^(?:\d+(?:\.\d*)?|\.\d+)\s*(?:px)?$/i.test(
    String(value == null ? '' : value).trim().replace(',', '.')
  );
}

function strokeWidthOptionValue(value: unknown, allowBareNumber: boolean): string | null {
  const raw = String(value == null ? '' : value).trim();
  const keyed = raw.match(/^(?:stroke-?width|line-?width|width|linienst(?:\u00e4rke|aerke))\s*=\s*(.+)$/i);
  if (keyed) return isStrokeWidthToken(keyed[1]) ? keyed[1] : null;
  if (!isStrokeWidthToken(raw)) return null;
  return /px\s*$/i.test(raw) || allowBareNumber ? raw : null;
}

function parseStrokeWidth(value: unknown): number {
  const match = String(value == null ? '' : value).trim().replace(',', '.')
    .match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? Math.max(0.25, Math.min(20, parsed)) : 3;
}

function visibilityOptionValue(value: unknown): boolean | null {
  const match = String(value == null ? '' : value).trim()
    .match(/^(?:visible|sichtbar)\s*=\s*(0|1|false|true)$/i);
  return match ? !/^(?:0|false)$/i.test(match[1]) : null;
}

/** Parse only direct coordinate lists; named/dependent points return null. */
export function parseStaticDistanceSpec(spec: string, language?: string): StaticDistanceSpec | null {
  const parts = optionParts(spec);
  const coordinates = parseCoordinateList(parts[1]);
  if (!coordinates || coordinates.length < 2) return null;

  const explicitColor = String(parts[2] || '').trim();
  const trailingOptions = parts.slice(3).map(function(part) { return String(part || '').trim(); }).filter(Boolean);
  const designIndex = trailingOptions.findIndex(function(part) { return designOptionValue(part) != null; });
  let strokeWidthIndex = trailingOptions.findIndex(function(part) {
    return strokeWidthOptionValue(part, false) != null;
  });
  if (strokeWidthIndex < 0 && designIndex >= 0) {
    strokeWidthIndex = trailingOptions.findIndex(function(part, index) {
      return index > designIndex && strokeWidthOptionValue(part, true) != null;
    });
  }
  const design = parseDesign(designIndex >= 0 ? designOptionValue(trailingOptions[designIndex]) : '');
  const visibilityOptions = trailingOptions
    .map(visibilityOptionValue)
    .filter(function(value): value is boolean { return value != null; });
  const standaloneHiddenName = trailingOptions.some(isHiddenNameOption);
  const rawSegmentName = trailingOptions.find(function(part, index) {
    return index !== designIndex &&
      index !== strokeWidthIndex &&
      !/^length\s*=/i.test(part) &&
      !/^(?:line\s*-?\s*style|linienstil)\s*=/i.test(part) &&
      visibilityOptionValue(part) == null &&
      !isHiddenNameOption(part);
  }) || '';
  const hiddenName = rawSegmentName.match(/^(.+?)\s*=\s*0$/);
  const segmentName = String(hiddenName ? hiddenName[1] : rawSegmentName).trim();
  return {
    kind: 'distance',
    boardId: String(parts[0] || '').trim(),
    coordinates,
    color: explicitColor || getAccentColor(),
    hasExplicitColor: !!explicitColor,
    strokeWidth: parseStrokeWidth(
      strokeWidthIndex >= 0 ? strokeWidthOptionValue(trailingOptions[strokeWidthIndex], true) : ''
    ),
    lineStyle: parseLineStyleOptions(trailingOptions),
    visible: visibilityOptions.length ? visibilityOptions[visibilityOptions.length - 1] : true,
    showLength: trailingOptions.some(function(part) { return /^length\s*=\s*1$/i.test(part); }),
    segmentName,
    showName: !!segmentName && !hiddenName && !standaloneHiddenName,
    ...design
  };
}

/** Convert mathematical coordinates into the top-left SVG coordinate system. */
export function projectStaticPoint(point: CoordinatePair, bounds: StaticBounds): CoordinatePair {
  return {
    x: point.x - bounds.xmin,
    y: bounds.ymax - point.y
  };
}

/** SVG equivalent of the public JSXGraph line-style presets. */
export function staticDashArray(style: LineStyle | unknown): string | null {
  switch (String(style || '').toLowerCase()) {
    case 'dashed': return '8 6';
    case 'dotted': return '1 5';
    case 'dashdotted': return '8 5 1 5';
    default: return null;
  }
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  name: K
): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG_NS, name);
}

function setStableStroke(element: SVGElement, color: string, width: number, style: LineStyle): void {
  element.setAttribute('stroke', color);
  element.setAttribute('stroke-width', String(width));
  element.setAttribute('vector-effect', 'non-scaling-stroke');
  const dashArray = staticDashArray(style);
  if (dashArray) element.setAttribute('stroke-dasharray', dashArray);
  if (style === 'dotted') element.setAttribute('stroke-linecap', 'round');
}

function pointsAttribute(coordinates: CoordinatePair[], bounds: StaticBounds): string {
  return coordinates.map(function(point) {
    const projected = projectStaticPoint(point, bounds);
    return projected.x + ',' + projected.y;
  }).join(' ');
}

function niceGridStep(span: number): number {
  const raw = Math.max(span / 12, Number.EPSILON);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function appendDecorations(svg: SVGSVGElement, config: BoardConfig, doc: Document): void {
  const width = config.xmax - config.xmin;
  const height = config.ymax - config.ymin;
  if (config.grid) {
    const grid = svgElement(doc, 'g');
    grid.setAttribute('data-lia-static-decoration', 'grid');
    const step = niceGridStep(Math.max(width, height));
    const color = '#808080';
    for (let x = Math.ceil(config.xmin / step) * step; x <= config.xmax + step * 1e-9; x += step) {
      const line = svgElement(doc, 'line');
      const px = x - config.xmin;
      line.setAttribute('x1', String(px));
      line.setAttribute('x2', String(px));
      line.setAttribute('y1', '0');
      line.setAttribute('y2', String(height));
      setStableStroke(line, color, 1, 'solid');
      line.setAttribute('stroke-opacity', '0.7');
      grid.appendChild(line);
    }
    for (let y = Math.ceil(config.ymin / step) * step; y <= config.ymax + step * 1e-9; y += step) {
      const line = svgElement(doc, 'line');
      const py = config.ymax - y;
      line.setAttribute('x1', '0');
      line.setAttribute('x2', String(width));
      line.setAttribute('y1', String(py));
      line.setAttribute('y2', String(py));
      setStableStroke(line, color, 1, 'solid');
      line.setAttribute('stroke-opacity', '0.7');
      grid.appendChild(line);
    }
    svg.appendChild(grid);
  }

  if (config.axes) {
    const axes = svgElement(doc, 'g');
    axes.setAttribute('data-lia-static-decoration', 'axes');
    const color = getNeutralColor();
    if (config.ymin <= 0 && config.ymax >= 0) {
      const xAxis = svgElement(doc, 'line');
      const py = config.ymax;
      xAxis.setAttribute('x1', '0');
      xAxis.setAttribute('x2', String(width));
      xAxis.setAttribute('y1', String(py));
      xAxis.setAttribute('y2', String(py));
      setStableStroke(xAxis, color, 2.5, 'solid');
      axes.appendChild(xAxis);
    }
    if (config.xmin <= 0 && config.xmax >= 0) {
      const yAxis = svgElement(doc, 'line');
      const px = -config.xmin;
      yAxis.setAttribute('x1', String(px));
      yAxis.setAttribute('x2', String(px));
      yAxis.setAttribute('y1', '0');
      yAxis.setAttribute('y2', String(height));
      setStableStroke(yAxis, color, 2.5, 'solid');
      axes.appendChild(yAxis);
    }
    svg.appendChild(axes);
  }
}

function addArrowMarker(
  svg: SVGSVGElement,
  doc: Document,
  color: string,
  boardId: string
): string {
  let defs = svg.querySelector('defs[data-lia-static-defs]') as SVGDefsElement | null;
  if (!defs) {
    defs = svgElement(doc, 'defs');
    defs.setAttribute('data-lia-static-defs', '');
    svg.insertBefore(defs, svg.firstChild);
  }
  markerSerial += 1;
  const safeBoardId = boardId.replace(/[^a-z0-9_-]/gi, '-') || 'board';
  const id = 'lia-static-arrow-' + safeBoardId + '-' + markerSerial;
  const marker = svgElement(doc, 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '4');
  marker.setAttribute('markerHeight', '4');
  marker.setAttribute('markerUnits', 'strokeWidth');
  marker.setAttribute('orient', 'auto-start-reverse');
  const path = svgElement(doc, 'path');
  path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  path.setAttribute('fill', color);
  marker.appendChild(path);
  defs.appendChild(marker);
  return id;
}

function appendCap(
  group: SVGGElement,
  doc: Document,
  geometry: StaticDistanceSpec,
  config: BoardConfig,
  atStart: boolean
): void {
  const points = geometry.coordinates.map(function(point) { return projectStaticPoint(point, config); });
  const endpointIndex = atStart ? 0 : points.length - 1;
  const step = atStart ? 1 : -1;
  const endpoint = points[endpointIndex];
  let neighbor: CoordinatePair | null = null;
  for (let index = endpointIndex + step; index >= 0 && index < points.length; index += step) {
    if (Math.hypot(points[index].x - endpoint.x, points[index].y - endpoint.y) > 1e-12) {
      neighbor = points[index];
      break;
    }
  }
  if (!neighbor) return;
  const dx = neighbor.x - endpoint.x;
  const dy = neighbor.y - endpoint.y;
  const length = Math.hypot(dx, dy);
  const logicalPerPixel = (config.xmax - config.xmin) / Math.max(config.width || 640, 1);
  const halfLength = 6 * logicalPerPixel;
  const nx = -dy / length * halfLength;
  const ny = dx / length * halfLength;
  const cap = svgElement(doc, 'line');
  cap.setAttribute('x1', String(endpoint.x - nx));
  cap.setAttribute('y1', String(endpoint.y - ny));
  cap.setAttribute('x2', String(endpoint.x + nx));
  cap.setAttribute('y2', String(endpoint.y + ny));
  setStableStroke(cap, geometry.color, geometry.strokeWidth, 'solid');
  cap.setAttribute('stroke-linecap', 'round');
  group.appendChild(cap);
}

function appendGeometry(
  svg: SVGSVGElement,
  entry: StaticGeometryEntry,
  config: BoardConfig,
  doc: Document
): void {
  const group = svgElement(doc, 'g');
  group.setAttribute('data-lia-static-kind', entry.geometry.kind);
  group.setAttribute('data-lia-static-uid', entry.info.uid);
  if (!entry.geometry.visible) {
    group.setAttribute('visibility', 'hidden');
    group.setAttribute('display', 'none');
  }

  if (entry.geometry.kind === 'area') {
    const polygon = svgElement(doc, 'polygon');
    polygon.setAttribute('points', pointsAttribute(entry.geometry.coordinates, config));
    polygon.setAttribute('fill', entry.geometry.color);
    polygon.setAttribute('fill-opacity', String(entry.geometry.opacity));
    polygon.setAttribute('stroke-opacity', '1');
    setStableStroke(polygon, entry.geometry.color, entry.geometry.strokeWidth, entry.geometry.lineStyle);
    group.appendChild(polygon);
  } else {
    const polyline = svgElement(doc, 'polyline');
    polyline.setAttribute('points', pointsAttribute(entry.geometry.coordinates, config));
    polyline.setAttribute('fill', 'none');
    setStableStroke(polyline, entry.geometry.color, entry.geometry.strokeWidth, entry.geometry.lineStyle);
    if (entry.geometry.firstArrow || entry.geometry.lastArrow) {
      const markerId = addArrowMarker(svg, doc, entry.geometry.color, config.id);
      if (entry.geometry.firstArrow) polyline.setAttribute('marker-start', 'url(#' + markerId + ')');
      if (entry.geometry.lastArrow) polyline.setAttribute('marker-end', 'url(#' + markerId + ')');
    }
    group.appendChild(polyline);
    if (entry.geometry.startCap) appendCap(group, doc, entry.geometry, config, true);
    if (entry.geometry.endCap) appendCap(group, doc, entry.geometry, config, false);
  }
  svg.appendChild(group);
}

function collectGeometry(config: BoardConfig, doc: Document): StaticGeometryEntry[] {
  const result: StaticGeometryEntry[] = [];
  let nodes: HTMLElement[] = [];
  try { nodes = Array.from(doc.querySelectorAll<HTMLElement>(MARKER_SELECTOR)); } catch (e) {}
  nodes.forEach(function(node) {
    const info = markerInfo(node);
    if (!info || markerBoardId(node, info) !== config.id) return;
    const spec = String(node.dataset && node.dataset.spec || '');
    const language = String(node.dataset && node.dataset.language || '');
    if (info.kind === 'unsupported') {
      warnOnce(config.id + ':' + node.id + ':' + spec,
        'Board "' + config.id + '" ignores unsupported marker #' + node.id + '. ' +
        'Static mode currently supports only direct @Area/@Flaeche and @distance/@Strecke coordinates.');
      return;
    }
    const geometry = info.kind === 'area'
      ? parseStaticAreaSpec(spec, language)
      : parseStaticDistanceSpec(spec, language);
    if (!geometry) {
      warnOnce(config.id + ':' + node.id + ':' + spec,
        'Marker #' + node.id + ' on static board "' + config.id + '" requires a valid direct coordinate list.');
      return;
    }
    if (geometry.kind === 'area' && (geometry.showArea || geometry.showPerimeter)) {
      warnOnce(config.id + ':' + node.id + ':measurement',
        'Static area measurements are not rendered for #' + node.id + '; the polygon itself is rendered.');
    }
    if (geometry.kind === 'distance' && (geometry.showLength || geometry.showName)) {
      warnOnce(config.id + ':' + node.id + ':label',
        'Static distance labels are not rendered for #' + node.id + '; the path itself is rendered.');
    }
    result.push({ marker: node, info, geometry });
  });
  return result;
}

function clearContainer(container: HTMLElement): void {
  try {
    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren();
      return;
    }
  } catch (e) {}
  while (container.firstChild) {
    try { container.removeChild(container.firstChild); } catch (e) { break; }
  }
}

/** Render one complete static board synchronously as exactly one root SVG. */
export function renderStaticSvg(container: HTMLElement, config: BoardConfig): SVGSVGElement {
  const doc = documentFor(container);
  if (!doc) throw new Error('Static SVG rendering requires a document.');
  container.style.aspectRatio = 'auto';
  const width = config.xmax - config.xmin;
  const height = config.ymax - config.ymin;
  const svg = svgElement(doc, 'svg');
  svg.setAttribute('data-lia-static-svg', config.id);
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Static coordinate system ' + config.id);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', config.width == null ? '100%' : String(config.width));
  svg.style.display = 'block';
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  svg.style.aspectRatio = width + ' / ' + height;
  svg.style.boxSizing = 'border-box';
  svg.style.background = 'transparent';
  if (config.border) {
    svg.style.border = '2px solid ' + getNeutralColor();
    svg.style.borderRadius = '8px';
  } else {
    svg.style.border = 'none';
    svg.style.borderRadius = '0';
  }

  appendDecorations(svg, config, doc);
  collectGeometry(config, doc).forEach(function(entry) {
    appendGeometry(svg, entry, config, doc);
  });
  clearContainer(container);
  container.appendChild(svg);
  return svg;
}

function cleanupInteractiveBoard(id: string): void {
  const boards = typeof window !== 'undefined' && window.__boards;
  const previous = boards && boards[id];
  const clearPointBuckets = function() {
    try { if (window.__points) delete window.__points[id]; } catch (e) {}
    try { if (window.__pointStates) delete window.__pointStates[id]; } catch (e) {}
    try { if (window.__pointGraphs) delete window.__pointGraphs[id]; } catch (e) {}
    try { if (window.__pointGraphStates) delete window.__pointGraphStates[id]; } catch (e) {}
  };
  if (!previous) {
    clearPointBuckets();
    return;
  }
  try {
    if (window.__disposeDGSForBoard) window.__disposeDGSForBoard(id);
  } catch (e) {}
  try {
    if (window.__disposeRegressionForBoard) window.__disposeRegressionForBoard(id);
  } catch (e) {}
  try {
    if (typeof previous.__coordCleanup === 'function') previous.__coordCleanup();
    else if (typeof previous.__coordViewportCleanup === 'function') previous.__coordViewportCleanup();
  } catch (e) {}
  try {
    const graph = window.JXG && window.JXG.JSXGraph;
    if (graph && typeof graph.freeBoard === 'function') graph.freeBoard(previous);
  } catch (e) {}
  try { if (boards[id] === previous) delete boards[id]; } catch (e) {}
  clearPointBuckets();
}

function elementOwnsContainer(owner: HTMLElement, candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate === owner) return true;
  try {
    if (owner.contains(candidate as Node)) return true;
  } catch (e) {}

  // JSXGraph's actual jxgbox lives in the <jsx-graph> shadow root. Walk the
  // composed ownership chain so an outer hybrid host can release that board.
  let current: any = candidate;
  const visited = new Set<any>();
  while (current && !visited.has(current)) {
    if (current === owner) return true;
    visited.add(current);
    if (current.parentNode) {
      current = current.parentNode;
      continue;
    }
    let root: any = null;
    try { root = typeof current.getRootNode === 'function' ? current.getRootNode() : null; } catch (e) {}
    current = root && root.host && root.host !== current ? root.host : null;
  }
  return false;
}

/** Dispose every registered JSXGraph board rendered in this host or a child. */
export function disposeInteractiveCoordinateBoardsInContainer(container: HTMLElement): void {
  const boards = typeof window !== 'undefined' && window.__boards;
  if (!boards) return;
  Object.keys(boards).forEach(function(id) {
    const board = boards[id];
    if (board && elementOwnsContainer(container, board.containerObj)) cleanupInteractiveBoard(id);
  });
}

function syncMarkerClaims(doc: Document): void {
  const activeIds = new Set<string>();
  let claimsAdded = false;
  Object.keys(registry()).forEach(function(id) {
    const entry = registry()[id];
    if (entry && entry.container && entry.container.isConnected !== false) activeIds.add(id);
  });
  let nodes: HTMLElement[] = [];
  try { nodes = Array.from(doc.querySelectorAll<HTMLElement>(MARKER_SELECTOR)); } catch (e) {}
  nodes.forEach(function(node) {
    const info = markerInfo(node);
    if (!info) return;
    const boardId = markerBoardId(node, info);
    if (activeIds.has(boardId)) {
      if (node.getAttribute(STATIC_CLAIM_ATTRIBUTE) !== boardId) {
        node.setAttribute(STATIC_CLAIM_ATTRIBUTE, boardId);
        claimsAdded = true;
      }
    } else if (node.hasAttribute(STATIC_CLAIM_ATTRIBUTE)) {
      node.removeAttribute(STATIC_CLAIM_ATTRIBUTE);
    }
  });
  if (claimsAdded && window.__coordinateDynamicRuntimeReady === true) {
    try {
      const coord = window.__coord;
      if (coord && typeof coord.runExternalBootstraps === 'function') {
        coord.runExternalBootstraps();
      }
    } catch (e) {}
  }
}

function ensureDynamicRuntimeForUnclaimedMarkers(doc: Document): void {
  let nodes: HTMLElement[] = [];
  try { nodes = Array.from(doc.querySelectorAll<HTMLElement>(MARKER_SELECTOR)); } catch (e) {}
  if (!nodes.some(function(node) { return !node.hasAttribute(STATIC_CLAIM_ATTRIBUTE); })) return;
  try {
    if (window.__ensureCoordinateDynamicRuntime) window.__ensureCoordinateDynamicRuntime();
  } catch (e) {}
}

/** True only for currently mounted explicit static boards. */
export function isStaticCoordinateBoard(id: string): boolean {
  const entry = registry()[String(id || '')];
  return !!entry && !!entry.container && entry.container.isConnected !== false;
}

/** Remove a static board, its SVG, and its marker claims. */
export function disposeStaticCoordinateBoard(id: string, expectedContainer?: HTMLElement): void {
  const key = String(id || '');
  const entries = registry();
  const entry = entries[key];
  if (!entry || (expectedContainer && entry.container !== expectedContainer)) return;
  try { entry.container.querySelectorAll(STATIC_SVG_SELECTOR).forEach(function(svg) { svg.remove(); }); } catch (e) {}
  try { entry.container.removeAttribute('data-lia-static-coordinate'); } catch (e) {}
  delete entries[key];
  const doc = documentFor(entry.container);
  if (doc) syncMarkerClaims(doc);
}

/** Dispose every static registry entry owned by this host or a child host. */
export function disposeStaticCoordinateBoardsInContainer(container: HTMLElement): void {
  const entries = registry();
  Object.keys(entries).forEach(function(id) {
    const entry = entries[id];
    if (entry && elementOwnsContainer(container, entry.container)) {
      disposeStaticCoordinateBoard(id, entry.container);
    }
  });
}

/** Release both rendering modes before a host is removed, reused, or remounted. */
export function disposeCoordinateBoardsInContainer(container: HTMLElement): void {
  disposeInteractiveCoordinateBoardsInContainer(container);
  disposeStaticCoordinateBoardsInContainer(container);
}

/** Register one normal macro host without creating any JSXGraph board. */
export function initializeStaticCoordinateBoard(
  container: HTMLElement,
  config: BoardConfig
): StaticBoardHandle {
  // A host can switch id and rendering mode during LiveEditor recompilation.
  // Dispose by physical container before resolving the new public board id.
  disposeInteractiveCoordinateBoardsInContainer(container);
  const entries = registry();
  Object.keys(entries).forEach(function(previousId) {
    const previous = entries[previousId];
    if (previousId !== config.id && previous && previous.container === container) {
      disposeStaticCoordinateBoard(previousId, container);
    }
  });
  const existing = entries[config.id];
  if (existing && existing.container !== container) {
    disposeStaticCoordinateBoard(config.id, existing.container);
  }
  const current = entries[config.id];
  const sameConfiguration = !!current && current.container === container &&
    current.config.xmin === config.xmin &&
    current.config.xmax === config.xmax &&
    current.config.ymin === config.ymin &&
    current.config.ymax === config.ymax &&
    current.config.width === config.width &&
    current.config.axes === config.axes &&
    current.config.grid === config.grid &&
    current.config.border === config.border &&
    current.config.staticMode === config.staticMode;
  if (sameConfiguration) return current;

  cleanupInteractiveBoard(config.id);
  const handle = entries[config.id] && entries[config.id].container === container
    ? entries[config.id]
    : { id: config.id, container, config, svg: null };
  handle.config = config;
  handle.id = config.id;
  entries[config.id] = handle;
  container.setAttribute('data-lia-static-coordinate', config.id);
  container.style.display = 'block';
  container.style.width = '100%';
  container.style.maxWidth = config.width == null ? '100%' : config.width + 'px';
  container.style.height = 'auto';
  container.style.aspectRatio = 'auto';
  container.style.marginLeft = '0';
  container.style.marginRight = 'auto';
  container.style.boxSizing = 'border-box';
  const doc = documentFor(container);
  if (doc) syncMarkerClaims(doc);
  if (!bootstrapRunning) scheduleStaticBootstrap();
  return handle;
}

function initializeDeclarativeHosts(doc: Document): void {
  let hosts: HTMLElement[] = [];
  try { hosts = Array.from(doc.querySelectorAll<HTMLElement>(STATIC_HOST_SELECTOR)); } catch (e) {}
  hosts.forEach(function(host) {
    if (!host.hasAttribute(STATIC_DECLARATIVE_HOST_ATTRIBUTE)) {
      host.setAttribute(STATIC_DECLARATIVE_HOST_ATTRIBUTE, '');
    }
    const config = parseCoordSpec(String(host.dataset && host.dataset.spec || ''));
    if (!config.staticMode) {
      disposeStaticCoordinateBoardsInContainer(host);
      warnOnce('host:' + String(host.id || config.id),
        'Declarative static host #' + String(host.id || config.id) + ' needs static=1 or statisch=1.');
      return;
    }
    initializeStaticCoordinateBoard(host, config);
  });
}

function cleanupDisconnectedBoards(): void {
  const entries = registry();
  Object.keys(entries).forEach(function(id) {
    const entry = entries[id];
    if (!entry || !entry.container || entry.container.isConnected === false) {
      if (entry) disposeStaticCoordinateBoard(id, entry.container);
      else delete entries[id];
    }
  });
}

/** Reconcile declarative hosts, claims, and all SVGs in one pass. */
export function bootstrapStaticCoordinateBoards(): void {
  const doc = documentFor();
  if (!doc) return;
  bootstrapRunning = true;
  try {
    cleanupDisconnectedBoards();
    initializeDeclarativeHosts(doc);
    syncMarkerClaims(doc);
    ensureDynamicRuntimeForUnclaimedMarkers(doc);
    Object.keys(registry()).forEach(function(id) {
      const entry = registry()[id];
      if (!entry || !entry.container || entry.container.isConnected === false) return;
      entry.svg = renderStaticSvg(entry.container, entry.config);
    });
  } finally {
    bootstrapRunning = false;
  }
}

/** Batch all board/object changes into one animation frame. */
export function scheduleStaticBootstrap(): void {
  if (bootstrapFrame) return;
  const run = function() {
    bootstrapFrame = 0;
    bootstrapStaticCoordinateBoards();
  };
  try {
    bootstrapFrame = requestAnimationFrame(run);
  } catch (e) {
    try { bootstrapFrame = window.setTimeout(run, 0) as unknown as number; } catch (timeoutError) { run(); }
  }
}

function elementContainsStaticInput(node: Node): boolean {
  const element = node as Element;
  if (!element || element.nodeType !== 1) return false;
  try {
    if (
      element.matches(STATIC_CONTAINER_SELECTOR) ||
      element.matches(STATIC_HOST_SELECTOR) ||
      element.matches(MARKER_SELECTOR)
    ) return true;
    return !!element.querySelector(
      STATIC_CONTAINER_SELECTOR + ',' + STATIC_HOST_SELECTOR + ',' + MARKER_SELECTOR
    );
  } catch (e) { return false; }
}

function isThemeMutationTarget(node: Node): boolean {
  try {
    const doc = themeDoc();
    return node === doc.documentElement || node === doc.body;
  } catch (e) { return false; }
}

/** Install the single shared lifecycle observer. Safe to call repeatedly. */
export function initStaticRenderer(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__staticCoordinateRendererReady) {
    scheduleStaticBootstrap();
    return;
  }
  window.__staticCoordinateRendererReady = true;

  const root = document.documentElement || document.body;
  if (root && typeof MutationObserver === 'function') {
    staticObserver = new MutationObserver(function(mutations) {
      const relevant = mutations.some(function(mutation) {
        if (mutation.type === 'attributes') {
          if (
            mutation.attributeName === 'class' ||
            mutation.attributeName === 'style' ||
            mutation.attributeName === 'data-theme'
          ) return isThemeMutationTarget(mutation.target);
          return elementContainsStaticInput(mutation.target);
        }
        if (mutation.type !== 'childList') return false;
        return Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []))
          .some(elementContainsStaticInput);
      });
      if (relevant) scheduleStaticBootstrap();
    });
    try {
      staticObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'data-spec',
          'data-language',
          STATIC_DECLARATIVE_HOST_ATTRIBUTE,
          'class',
          'style',
          'data-theme'
        ]
      });
      const themedDocument = themeDoc();
      const themedRoot = themedDocument && themedDocument.documentElement;
      if (themedRoot && themedRoot !== root) {
        staticObserver.observe(themedRoot, {
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme']
        });
      }
      window.__staticCoordinateObserver = staticObserver;
    } catch (e) { staticObserver = null; }
  }

  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media && typeof media.addEventListener === 'function') {
      media.addEventListener('change', scheduleStaticBootstrap);
    } else if (media && typeof (media as any).addListener === 'function') {
      (media as any).addListener(scheduleStaticBootstrap);
    }
  } catch (e) {}

  // Register declarative lightweight hosts and claim already mounted markers
  // synchronously, but defer all SVG construction to the shared frame.
  initializeDeclarativeHosts(document);
  syncMarkerClaims(document);
  scheduleStaticBootstrap();
}
