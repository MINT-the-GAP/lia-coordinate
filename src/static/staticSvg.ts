// Lightweight native-SVG renderer for explicitly static coordinate systems.
// This module intentionally has no JSXGraph dependency and owns one batched
// DOM observer for all static boards and macro markers.

import type { BoardConfig } from '../shared/coordSpec';
import { parseCoordSpec } from '../shared/coordSpec';
import {
  isHiddenNameOption,
  parseCoordinateList,
  parseMacroName,
  splitTopLevel,
  unquote
} from '../shared/parser';
import type { CoordinatePair } from '../shared/parser';
import { isLineStyleOption, parseLineStyleOptions, type LineStyle } from '../shared/lineStyle';
import { getAccentColor, getNeutralColor, themeDoc } from '../shared/theme';
import {
  clipLineToBounds,
  clipRayToBounds,
  createDirectedAngleArcGeometry,
  createDirectedCircularArcGeometry,
  sampleStaticFunction,
  staticPointOnCircle
} from './staticGeometry';
import type { StaticCircularArcGeometry } from './staticGeometry';
import {
  parseStaticAngleSpec,
  parseStaticAxisLabelSpec,
  parseStaticCircleSpec,
  parseStaticLinearSpec,
  parseStaticPlotFunctionSpec,
  parseStaticPointReference,
  parseStaticPointSpec,
  parseStaticRelationSpec,
  parseStaticSectorSpec
} from './staticSpecs';
import type {
  StaticAngleSpec,
  StaticAxisLabelSpec,
  StaticCircleSpec,
  StaticLanguage,
  StaticMidpointSpec,
  StaticPlotFunctionSpec,
  StaticPointReference,
  StaticPointSpec,
  StaticRelatedLineSpec,
  StaticSectorSpec
} from './staticSpecs';

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
  language: StaticLanguage;
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
  language: StaticLanguage;
}

interface StaticLineDesign {
  normalizedDesign: string;
  firstArrow: boolean;
  lastArrow: boolean;
  startCap: boolean;
  endCap: boolean;
}

export interface StaticVectorSpec {
  kind: 'vector';
  boardId: string;
  coordinates: CoordinatePair[];
  color: string;
  hasExplicitColor: boolean;
  strokeWidth: number;
  lineStyle: LineStyle;
  visible: boolean;
  objectName: string;
  showName: boolean;
}

export interface StaticArcSpec extends StaticLineDesign {
  kind: 'arc';
  boardId: string;
  start: CoordinatePair;
  end: CoordinatePair;
  exitAngle: number;
  entryAngle: number;
  caption: string;
  renderedCaption: string;
  strokeWidth: number;
  color: string;
  hasExplicitColor: boolean;
  lineStyle: LineStyle;
  visible: boolean;
}

export interface StaticCoordTextSpec {
  kind: 'coord-text';
  boardId: string;
  coordinate: CoordinatePair;
  x: number;
  y: number;
  content: string;
  renderedContent: string;
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
}

interface StaticLineSpec {
  kind: 'line' | 'ray';
  boardId: string;
  coordinates: [CoordinatePair, CoordinatePair];
  color: string;
  hasExplicitColor: boolean;
  strokeWidth: number;
  lineStyle: LineStyle;
  visible: boolean;
  objectName: string;
  showName: boolean;
  language: StaticLanguage;
}

interface StaticMidpointGeometry extends Omit<StaticMidpointSpec, 'points'> {
  coordinate: CoordinatePair;
}

interface StaticRelatedLineGeometry extends Omit<StaticRelatedLineSpec, 'base' | 'through'> {
  coordinates: [CoordinatePair, CoordinatePair];
}

type StaticCircleGeometry = Omit<StaticCircleSpec, 'center' | 'radius'> & {
  center: CoordinatePair;
  radius: number;
};

type StaticAngleGeometry = Omit<StaticAngleSpec, 'points'> & {
  points: [CoordinatePair, CoordinatePair, CoordinatePair];
};

type StaticSectorGeometry = Omit<StaticSectorSpec, 'points'> & {
  points: [CoordinatePair, CoordinatePair, CoordinatePair];
};

type StaticPlotGeometry = Omit<StaticPlotFunctionSpec, 'evaluate'> & {
  segments: CoordinatePair[][];
  evaluationCount: number;
};

export type StaticGeometrySpec =
  | StaticAreaSpec
  | StaticDistanceSpec
  | StaticVectorSpec
  | StaticArcSpec
  | StaticCoordTextSpec
  | StaticAxisLabelSpec
  | StaticPointSpec
  | StaticLineSpec
  | StaticMidpointGeometry
  | StaticRelatedLineGeometry
  | StaticCircleGeometry
  | StaticAngleGeometry
  | StaticSectorGeometry
  | StaticPlotGeometry;

export interface StaticBoardHandle {
  id: string;
  container: HTMLElement;
  config: BoardConfig;
  svg: SVGSVGElement | null;
}

type StaticMarkerKind =
  | 'area'
  | 'distance'
  | 'axis-label'
  | 'point'
  | 'coord-text'
  | 'linear'
  | 'arc'
  | 'relation'
  | 'angle'
  | 'circle'
  | 'sector'
  | 'plot'
  | 'unsupported';

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
  { prefix: 'axis-title-spec-', kind: 'axis-label' },
  { prefix: 'point-ui-', kind: 'unsupported' },
  { prefix: 'point-spec-', kind: 'point' },
  { prefix: 'coord-text-spec-', kind: 'coord-text' },
  { prefix: 'linear-spec-', kind: 'linear' },
  { prefix: 'arc-spec-', kind: 'arc' },
  { prefix: 'relation-spec-', kind: 'relation' },
  { prefix: 'angle-spec-', kind: 'angle' },
  { prefix: 'circle-spec-', kind: 'circle' },
  { prefix: 'tangent-spec-', kind: 'unsupported' },
  { prefix: 'sector-spec-', kind: 'sector' },
  { prefix: 'plot-spec-', kind: 'plot' },
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
let bootstrapTimeout = 0;
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

/**
 * Split a positional marker while retaining empty top-level fields. Arc
 * captions and optional style slots use empty values as meaningful placeholders.
 */
function positionalParts(spec: string): string[] {
  const input = unquote(String(spec || ''));
  const result: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === String.fromCharCode(39)) {
      let previous = index - 1;
      while (previous >= 0 && /\s/.test(input[previous])) previous -= 1;
      const atValueStart = previous < 0 || ';,([{=:'.includes(input[previous]);
      let hasClosingQuote = false;
      let escapedQuote = false;
      for (let next = index + 1; atValueStart && next < input.length; next += 1) {
        if (escapedQuote) {
          escapedQuote = false;
          continue;
        }
        if (input[next] === String.fromCharCode(92)) {
          escapedQuote = true;
          continue;
        }
        if (input[next] === character) {
          hasClosingQuote = true;
          break;
        }
      }
      if (!atValueStart || !hasClosingQuote) {
        current += character;
        continue;
      }
    }
    if (
      character === String.fromCharCode(34) ||
      character === String.fromCharCode(39) ||
      character === String.fromCharCode(96)
    ) {
      current += character;
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      current += character;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      depth = Math.max(0, depth - 1);
      current += character;
      continue;
    }
    if (character === ';' && depth === 0) {
      result.push(unquote(current).trim());
      current = '';
      continue;
    }
    current += character;
  }
  result.push(unquote(current).trim());
  return result;
}

function parseDirectCoordinate(value: unknown): CoordinatePair | null {
  const coordinate = unquote(String(value == null ? '' : value)).trim();
  const parsed = parseCoordinateList('[' + coordinate + ']');
  return parsed && parsed.length === 1 ? parsed[0] : null;
}

type StaticPointResolver = (name: string) => CoordinatePair | null;

function parseNamedPointList(value: unknown): string[] | null {
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const names = splitTopLevel(raw.slice(1, -1), ';')
    .map(function(name) {
      const reference = parseStaticPointReference(name);
      return reference && reference.kind === 'point' ? reference.name : '';
    });
  return names.length && names.every(Boolean) ? names : null;
}

function resolveCoordinateList(
  value: unknown,
  resolvePoint?: StaticPointResolver
): CoordinatePair[] | null {
  const coordinates = parseCoordinateList(value);
  if (coordinates) return coordinates;
  if (!resolvePoint) return null;
  const names = parseNamedPointList(value);
  if (!names) return null;
  const resolved = names.map(resolvePoint);
  return resolved.every(function(point): point is CoordinatePair { return !!point; })
    ? resolved.map(function(point) { return { x: point.x, y: point.y }; })
    : null;
}

function resolvePointToken(value: unknown, resolvePoint?: StaticPointResolver): CoordinatePair | null {
  const direct = parseDirectCoordinate(value);
  if (direct) return direct;
  if (!resolvePoint) return null;
  const reference = parseStaticPointReference(value);
  return reference && reference.kind === 'point' ? resolvePoint(reference.name) : null;
}

function decodeLegacyParentheses(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/\{\{/g, '(')
    .replace(/\}\}/g, ')');
}

/** Safe readable fallback for authored plain text and dollar-delimited TeX. */
function staticTextFallback(value: unknown): string {
  return decodeLegacyParentheses(value)
    .replace(/\$\$([\s\S]+?)\$\$/g, function(_match, tex) { return tex; })
    .replace(/\$([^$\r\n]+?)\$/g, function(_match, tex) { return tex; })
    .replace(/\\\[([\s\S]+?)\\\]/g, function(_match, tex) { return tex; })
    .replace(/\\\(([^\r\n]+?)\\\)/g, function(_match, tex) { return tex; });
}

/** Parse a direct coordinate list or a list resolved from immutable static points. */
export function parseStaticAreaSpec(
  spec: string,
  language?: string,
  resolvePoint?: StaticPointResolver
): StaticAreaSpec | null {
  const parts = optionParts(spec);
  const coordinates = resolveCoordinateList(parts[1], resolvePoint);
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
    language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
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

function parseDesign(value: unknown): StaticLineDesign {
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

/** Parse the native subset of @Vector/@Vektor: exactly two fixed coordinates. */
export function parseStaticVectorSpec(spec: string, language?: string): StaticVectorSpec | null {
  const parts = optionParts(spec);
  const coordinates = parseCoordinateList(parts[1]);
  if (!coordinates || coordinates.length !== 2) return null;

  const explicitColor = String(parts[2] || '').trim();
  const trailingOptions = parts.slice(3)
    .map(function(part) { return String(part || '').trim(); })
    .filter(Boolean);
  const standaloneHiddenName = trailingOptions.some(isHiddenNameOption);
  const visibilityOptions = trailingOptions
    .map(visibilityOptionValue)
    .filter(function(value): value is boolean { return value != null; });
  const nameOptions = trailingOptions.filter(function(part) {
    return !isHiddenNameOption(part) &&
      !isLineStyleOption(part) &&
      visibilityOptionValue(part) == null;
  });
  const namedOption = nameOptions.map(function(part) {
    const match = part.match(/^name\s*=\s*(.+)$/i);
    return match ? String(match[1] || '').trim() : '';
  }).find(Boolean) || '';
  const rawObjectName = namedOption || nameOptions.find(function(part) {
    return !/^name\s*=/i.test(part);
  }) || '';
  const parsedName = parseMacroName(rawObjectName);
  return {
    kind: 'vector',
    boardId: String(parts[0] || '').trim(),
    coordinates,
    color: explicitColor || getAccentColor(),
    hasExplicitColor: !!explicitColor,
    strokeWidth: 3,
    lineStyle: parseLineStyleOptions(trailingOptions),
    visible: visibilityOptions.length ? visibilityOptions[visibilityOptions.length - 1] : true,
    objectName: parsedName.name,
    showName: parsedName.showName && !standaloneHiddenName
  };
}

function parseArcAngle(value: unknown): number | null {
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

function isArcDesignToken(value: unknown): boolean {
  const raw = normalizeDesignToken(value);
  return raw === '' || raw === '-' || /^\|?(?:->|<-|<->)\|?$/.test(raw);
}

/** Parse arcs with direct endpoints or endpoints from immutable static points. */
export function parseStaticArcSpec(
  spec: string,
  language?: string,
  resolvePoint?: StaticPointResolver
): StaticArcSpec | null {
  const parts = positionalParts(spec);
  const start = resolvePointToken(parts[1], resolvePoint);
  const exitAngle = parseArcAngle(parts[2]);
  const end = resolvePointToken(parts[3], resolvePoint);
  const entryAngle = parseArcAngle(parts[4]);
  if (!parts[0] || !start || exitAngle == null || !end || entryAngle == null) return null;

  const caption = decodeLegacyParentheses(parts[5] || '');
  const visibilityOptions = parts.slice(6)
    .map(visibilityOptionValue)
    .filter(function(value): value is boolean { return value != null; });
  const styleParts = parts.slice(6).filter(function(part) {
    return visibilityOptionValue(part) == null && !isLineStyleOption(part);
  });
  let designToken = styleParts[0] || '';
  let strokeWidthToken = styleParts[1] || '';
  let colorToken = styleParts[2] || '';
  if (!isArcDesignToken(designToken) && isArcDesignToken(strokeWidthToken)) {
    colorToken = designToken;
    designToken = strokeWidthToken;
    strokeWidthToken = styleParts[2] || '';
  } else if (!colorToken && strokeWidthToken && !isStrokeWidthToken(strokeWidthToken)) {
    colorToken = strokeWidthToken;
    strokeWidthToken = '';
  }
  const explicitColor = String(colorToken || '').trim();
  return {
    kind: 'arc',
    boardId: String(parts[0] || '').trim(),
    start,
    end,
    exitAngle,
    entryAngle,
    caption,
    renderedCaption: staticTextFallback(caption),
    strokeWidth: parseStrokeWidth(strokeWidthToken),
    color: explicitColor || getAccentColor(),
    hasExplicitColor: !!explicitColor,
    lineStyle: parseLineStyleOptions(parts.slice(6)),
    visible: visibilityOptions.length ? visibilityOptions[visibilityOptions.length - 1] : true,
    ...parseDesign(designToken)
  };
}

/** Parse one fixed @CoordText/@KoordText declaration for native SVG text. */
export function parseStaticCoordTextSpec(spec: string): StaticCoordTextSpec | null {
  // Color and opacity are positional. Keep an empty color slot so
  // `id;[x;y];content;;0.4` still applies the requested opacity.
  const parts = positionalParts(spec);
  const coordinate = parseDirectCoordinate(parts[1]);
  if (!coordinate) return null;
  const content = String(parts[2] || '');
  const explicitColor = String(parts[3] || '').trim();
  const parsedOpacity = parseFloat(String(parts[4] || '').replace(',', '.'));
  return {
    kind: 'coord-text',
    boardId: String(parts[0] || '').trim(),
    coordinate,
    x: coordinate.x,
    y: coordinate.y,
    content,
    renderedContent: staticTextFallback(content),
    color: explicitColor || getAccentColor(),
    hasExplicitColor: !!explicitColor,
    opacity: Number.isFinite(parsedOpacity)
      ? Math.max(0, Math.min(1, parsedOpacity))
      : 1
  };
}

/** Parse direct paths or paths resolved from immutable static points. */
export function parseStaticDistanceSpec(
  spec: string,
  language?: string,
  resolvePoint?: StaticPointResolver
): StaticDistanceSpec | null {
  const parts = optionParts(spec);
  const pointToken = String(parts[1] || '').trim();
  let coordinates = resolveCoordinateList(pointToken, resolvePoint);
  let colorIndex = 2;
  if (!coordinates && resolvePoint && pointToken && !pointToken.startsWith('[')) {
    const first = resolvePoint(pointToken);
    const second = resolvePoint(String(parts[2] || '').trim());
    if (first && second) {
      coordinates = [
        { x: first.x, y: first.y },
        { x: second.x, y: second.y }
      ];
      colorIndex = 3;
    }
  }
  if (!coordinates || coordinates.length < 2) return null;

  const explicitColor = String(parts[colorIndex] || '').trim();
  const trailingOptions = parts.slice(colorIndex + 1)
    .map(function(part) { return String(part || '').trim(); })
    .filter(Boolean);
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
    language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
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
    const step = niceGridStep(Math.max(width, height));
    const unit = logicalUnitsPerPixel(config);
    const tickHalf = 4 * unit;
    const edgeTolerance = Math.max(width, height) * 1e-12;
    if (config.ymin <= 0 && config.ymax >= 0) {
      const xAxis = svgElement(doc, 'line');
      const py = config.ymax;
      const atBottomEdge = Math.abs(config.ymin) <= edgeTolerance;
      const atTopEdge = Math.abs(config.ymax) <= edgeTolerance;
      xAxis.setAttribute('data-lia-static-axis', 'x');
      xAxis.setAttribute('x1', '0');
      xAxis.setAttribute('x2', String(width));
      xAxis.setAttribute('y1', String(py));
      xAxis.setAttribute('y2', String(py));
      setStableStroke(xAxis, color, 2.5, 'solid');
      xAxis.setAttribute('marker-end', 'url(#' + addArrowMarker(svg, doc, color, config.id) + ')');
      axes.appendChild(xAxis);
      for (let x = Math.ceil(config.xmin / step) * step; x <= config.xmax + step * 1e-9; x += step) {
        const normalizedX = Math.abs(x) <= step * 1e-9 ? 0 : x;
        const xNumberOffset = Math.abs(normalizedX - config.xmin) <= edgeTolerance
          ? 8
          : Math.abs(normalizedX - config.xmax) <= edgeTolerance ? -8 : 0;
        const projected = projectStaticPoint({ x: normalizedX, y: 0 }, config);
        const tick = svgElement(doc, 'line');
        tick.setAttribute('data-lia-static-axis-tick', 'x');
        tick.setAttribute('x1', String(projected.x));
        tick.setAttribute('x2', String(projected.x));
        tick.setAttribute('y1', String(
          atBottomEdge ? projected.y - 2 * tickHalf :
            atTopEdge ? projected.y : projected.y - tickHalf
        ));
        tick.setAttribute('y2', String(
          atBottomEdge ? projected.y :
            atTopEdge ? projected.y + 2 * tickHalf : projected.y + tickHalf
        ));
        setStableStroke(tick, color, 1.5, 'solid');
        axes.appendChild(tick);
        const label = appendCenteredText(
          axes,
          doc,
          projectedLabelPoint(
            { x: normalizedX, y: 0 },
            config,
            xNumberOffset,
            atBottomEdge ? -14 : 14
          ),
          formatStaticNumber(normalizedX, 'en'),
          color,
          config
        );
        label.setAttribute('data-lia-static-axis-number', 'x');
        label.setAttribute('font-size', String(13 * unit));
      }
    }
    if (config.xmin <= 0 && config.xmax >= 0) {
      const yAxis = svgElement(doc, 'line');
      const px = -config.xmin;
      const atLeftEdge = Math.abs(config.xmin) <= edgeTolerance;
      const atRightEdge = Math.abs(config.xmax) <= edgeTolerance;
      yAxis.setAttribute('data-lia-static-axis', 'y');
      yAxis.setAttribute('x1', String(px));
      yAxis.setAttribute('x2', String(px));
      yAxis.setAttribute('y1', String(height));
      yAxis.setAttribute('y2', '0');
      setStableStroke(yAxis, color, 2.5, 'solid');
      yAxis.setAttribute('marker-end', 'url(#' + addArrowMarker(svg, doc, color, config.id) + ')');
      axes.appendChild(yAxis);
      for (let y = Math.ceil(config.ymin / step) * step; y <= config.ymax + step * 1e-9; y += step) {
        const normalizedY = Math.abs(y) <= step * 1e-9 ? 0 : y;
        if (normalizedY === 0 && config.ymin <= 0 && config.ymax >= 0) continue;
        const yNumberOffset = Math.abs(normalizedY - config.ymin) <= edgeTolerance
          ? -8
          : Math.abs(normalizedY - config.ymax) <= edgeTolerance ? 8 : 0;
        const projected = projectStaticPoint({ x: 0, y: normalizedY }, config);
        const tick = svgElement(doc, 'line');
        tick.setAttribute('data-lia-static-axis-tick', 'y');
        tick.setAttribute('x1', String(
          atLeftEdge ? projected.x :
            atRightEdge ? projected.x - 2 * tickHalf : projected.x - tickHalf
        ));
        tick.setAttribute('x2', String(
          atLeftEdge ? projected.x + 2 * tickHalf :
            atRightEdge ? projected.x : projected.x + tickHalf
        ));
        tick.setAttribute('y1', String(projected.y));
        tick.setAttribute('y2', String(projected.y));
        setStableStroke(tick, color, 1.5, 'solid');
        axes.appendChild(tick);
        const label = appendCenteredText(
          axes,
          doc,
          projectedLabelPoint(
            { x: 0, y: normalizedY },
            config,
            atLeftEdge ? 14 : -14,
            yNumberOffset
          ),
          formatStaticNumber(normalizedY, 'en'),
          color,
          config
        );
        label.setAttribute('data-lia-static-axis-number', 'y');
        label.setAttribute('font-size', String(13 * unit));
      }
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

function logicalUnitsPerPixel(config: BoardConfig): number {
  return (config.xmax - config.xmin) / Math.max(config.width || 640, 1);
}

interface StaticArcGeometry {
  p0: CoordinatePair;
  p1: CoordinatePair;
  p2: CoordinatePair;
  p3: CoordinatePair;
  chord: number;
}

function staticArcGeometry(geometry: StaticArcSpec): StaticArcGeometry {
  const chord = Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y);
  const handle = chord / 3;
  const exitRadians = geometry.exitAngle * Math.PI / 180;
  const entryRadians = geometry.entryAngle * Math.PI / 180;
  return {
    p0: geometry.start,
    p1: {
      x: geometry.start.x + handle * Math.cos(exitRadians),
      y: geometry.start.y + handle * Math.sin(exitRadians)
    },
    // TikZ-like in-angle: the angle points from the end to its control arm.
    p2: {
      x: geometry.end.x + handle * Math.cos(entryRadians),
      y: geometry.end.y + handle * Math.sin(entryRadians)
    },
    p3: geometry.end,
    chord
  };
}

function cubicPoint(geometry: StaticArcGeometry, t: number): CoordinatePair {
  const u = 1 - t;
  return {
    x: u * u * u * geometry.p0.x +
      3 * u * u * t * geometry.p1.x +
      3 * u * t * t * geometry.p2.x +
      t * t * t * geometry.p3.x,
    y: u * u * u * geometry.p0.y +
      3 * u * u * t * geometry.p1.y +
      3 * u * t * t * geometry.p2.y +
      t * t * t * geometry.p3.y
  };
}

function cubicDerivative(geometry: StaticArcGeometry, t: number): CoordinatePair {
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

function appendArcCap(
  group: SVGGElement,
  doc: Document,
  geometry: StaticArcSpec,
  config: BoardConfig,
  atStart: boolean
): void {
  const endpoint = projectStaticPoint(atStart ? geometry.start : geometry.end, config);
  const angle = (atStart ? geometry.exitAngle : geometry.entryAngle) * Math.PI / 180;
  const halfLength = 6 * logicalUnitsPerPixel(config);
  // Project the mathematical tangent (cos, sin) into SVG (cos, -sin), then
  // rotate it by 90 degrees in screen space.
  const nx = Math.sin(angle) * halfLength;
  const ny = Math.cos(angle) * halfLength;
  const cap = svgElement(doc, 'line');
  cap.setAttribute('x1', String(endpoint.x - nx));
  cap.setAttribute('y1', String(endpoint.y - ny));
  cap.setAttribute('x2', String(endpoint.x + nx));
  cap.setAttribute('y2', String(endpoint.y + ny));
  setStableStroke(cap, geometry.color, geometry.strokeWidth, 'solid');
  cap.setAttribute('stroke-linecap', 'round');
  group.appendChild(cap);
}

function appendCenteredText(
  group: SVGGElement,
  doc: Document,
  point: CoordinatePair,
  content: string,
  color: string,
  config: BoardConfig,
  opacity?: number
): SVGTextElement {
  const text = svgElement(doc, 'text');
  text.setAttribute('x', String(point.x));
  text.setAttribute('y', String(point.y));
  text.setAttribute('fill', color);
  if (opacity != null) text.setAttribute('fill-opacity', String(opacity));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('alignment-baseline', 'middle');
  text.setAttribute('font-size', String(18 * logicalUnitsPerPixel(config)));
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('pointer-events', 'none');
  text.textContent = content;
  group.appendChild(text);
  return text;
}

function arcCaptionPoint(geometry: StaticArcSpec, config: BoardConfig): CoordinatePair {
  const mathematical = staticArcGeometry(geometry);
  const projected: StaticArcGeometry = {
    p0: projectStaticPoint(mathematical.p0, config),
    p1: projectStaticPoint(mathematical.p1, config),
    p2: projectStaticPoint(mathematical.p2, config),
    p3: projectStaticPoint(mathematical.p3, config),
    chord: mathematical.chord
  };
  const midpoint = cubicPoint(projected, 0.5);
  let derivative = cubicDerivative(projected, 0.5);
  if (Math.hypot(derivative.x, derivative.y) < 1e-12) {
    derivative = {
      x: projected.p3.x - projected.p0.x,
      y: projected.p3.y - projected.p0.y
    };
  }
  let normalX = -derivative.y;
  let normalY = derivative.x;
  const normalLength = Math.hypot(normalX, normalY);
  if (normalLength < 1e-12) {
    normalX = 0;
    normalY = -1;
  } else {
    normalX /= normalLength;
    normalY /= normalLength;
  }
  if (normalY > 0 || (Math.abs(normalY) < 1e-12 && normalX < 0)) {
    normalX = -normalX;
    normalY = -normalY;
  }
  const offset = Math.max(11, Math.min(20, 10 + geometry.strokeWidth)) *
    logicalUnitsPerPixel(config);
  return {
    x: midpoint.x + normalX * offset,
    y: midpoint.y + normalY * offset
  };
}

function formatStaticNumber(
  value: number,
  language: StaticLanguage = 'en',
  maximumDecimals = 3
): string {
  if (!Number.isFinite(value)) return '?';
  const factor = Math.pow(10, maximumDecimals);
  const rounded = Math.abs(value) < 0.5 / factor
    ? 0
    : Math.round((value + Number.EPSILON) * factor) / factor;
  let text = rounded.toFixed(maximumDecimals).replace(/\.?0+$/, '');
  if (text === '-0') text = '0';
  return language === 'de' ? text.replace('.', ',') : text;
}

function polylineLength(coordinates: readonly CoordinatePair[]): number {
  let length = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    length += Math.hypot(
      coordinates[index].x - coordinates[index - 1].x,
      coordinates[index].y - coordinates[index - 1].y
    );
  }
  return length;
}

function polylineMidpoint(coordinates: readonly CoordinatePair[]): CoordinatePair {
  if (!coordinates.length) return { x: 0, y: 0 };
  const total = polylineLength(coordinates);
  if (total <= 1e-12) return { ...coordinates[0] };
  const target = total / 2;
  let traversed = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const first = coordinates[index - 1];
    const second = coordinates[index];
    const length = Math.hypot(second.x - first.x, second.y - first.y);
    if (traversed + length >= target && length > 1e-12) {
      const ratio = (target - traversed) / length;
      return {
        x: first.x + ratio * (second.x - first.x),
        y: first.y + ratio * (second.y - first.y)
      };
    }
    traversed += length;
  }
  return { ...coordinates[coordinates.length - 1] };
}

function polygonMetrics(coordinates: readonly CoordinatePair[]): {
  area: number;
  perimeter: number;
  centroid: CoordinatePair;
} {
  let signedTwiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  let perimeter = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const first = coordinates[index];
    const second = coordinates[(index + 1) % coordinates.length];
    const cross = first.x * second.y - second.x * first.y;
    signedTwiceArea += cross;
    centroidX += (first.x + second.x) * cross;
    centroidY += (first.y + second.y) * cross;
    perimeter += Math.hypot(second.x - first.x, second.y - first.y);
  }
  let centroid: CoordinatePair;
  if (Math.abs(signedTwiceArea) > 1e-12) {
    centroid = {
      x: centroidX / (3 * signedTwiceArea),
      y: centroidY / (3 * signedTwiceArea)
    };
  } else {
    centroid = {
      x: coordinates.reduce(function(sum, point) { return sum + point.x; }, 0) /
        Math.max(1, coordinates.length),
      y: coordinates.reduce(function(sum, point) { return sum + point.y; }, 0) /
        Math.max(1, coordinates.length)
    };
  }
  return { area: Math.abs(signedTwiceArea) / 2, perimeter, centroid };
}

function projectedLabelPoint(
  point: CoordinatePair,
  config: BoardConfig,
  offsetXInPixels = 0,
  offsetYInPixels = -12
): CoordinatePair {
  const projected = projectStaticPoint(point, config);
  const unit = logicalUnitsPerPixel(config);
  return {
    x: projected.x + offsetXInPixels * unit,
    y: projected.y + offsetYInPixels * unit
  };
}

function appendPointGlyph(
  group: SVGGElement,
  doc: Document,
  coordinate: CoordinatePair,
  color: string,
  opacity: number,
  config: BoardConfig,
  labelContent = '',
  labelColor = color
): void {
  const center = projectStaticPoint(coordinate, config);
  const halfSize = 7 * logicalUnitsPerPixel(config);
  [
    [-halfSize, -halfSize, halfSize, halfSize],
    [-halfSize, halfSize, halfSize, -halfSize]
  ].forEach(function(values) {
    const line = svgElement(doc, 'line');
    line.setAttribute('x1', String(center.x + values[0]));
    line.setAttribute('y1', String(center.y + values[1]));
    line.setAttribute('x2', String(center.x + values[2]));
    line.setAttribute('y2', String(center.y + values[3]));
    line.setAttribute('stroke-opacity', String(opacity));
    setStableStroke(line, color, 3, 'solid');
    line.setAttribute('stroke-linecap', 'round');
    group.appendChild(line);
  });
  if (labelContent) {
    const label = appendCenteredText(
      group,
      doc,
      projectedLabelPoint(coordinate, config, 12, -12),
      staticTextFallback(labelContent),
      labelColor,
      config,
      opacity
    );
    label.setAttribute('font-size', String(24 * logicalUnitsPerPixel(config)));
  }
}

function circularArcPathData(
  arc: StaticCircularArcGeometry,
  config: BoardConfig,
  includeCenter: boolean
): string {
  const center = projectStaticPoint(arc.center, config);
  const start = projectStaticPoint(arc.start, config);
  let path = includeCenter
    ? 'M ' + center.x + ' ' + center.y + ' L ' + start.x + ' ' + start.y
    : 'M ' + start.x + ' ' + start.y;
  arc.segments.forEach(function(segment) {
    const end = projectStaticPoint(segment.end, config);
    path += ' A ' + arc.radius + ' ' + arc.radius + ' 0 ' +
      segment.svgLargeArcFlag + ' ' + segment.svgSweepFlag + ' ' +
      end.x + ' ' + end.y;
  });
  return includeCenter ? path + ' Z' : path;
}

function appendClippedInfiniteLine(
  group: SVGGElement,
  doc: Document,
  coordinates: [CoordinatePair, CoordinatePair],
  kind: 'line' | 'ray',
  color: string,
  strokeWidth: number,
  lineStyle: LineStyle,
  config: BoardConfig
): [CoordinatePair, CoordinatePair] | null {
  const clipped = kind === 'ray'
    ? clipRayToBounds(coordinates[0], coordinates[1], config)
    : clipLineToBounds(coordinates[0], coordinates[1], config);
  if (!clipped) return null;
  const start = projectStaticPoint(clipped.start, config);
  const end = projectStaticPoint(clipped.end, config);
  const line = svgElement(doc, 'line');
  line.setAttribute('x1', String(start.x));
  line.setAttribute('y1', String(start.y));
  line.setAttribute('x2', String(end.x));
  line.setAttribute('y2', String(end.y));
  line.setAttribute('fill', 'none');
  setStableStroke(line, color, strokeWidth, lineStyle);
  group.appendChild(line);
  return [clipped.start, clipped.end];
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
  if ('visible' in entry.geometry && !entry.geometry.visible) {
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
    if (entry.geometry.showArea || entry.geometry.showPerimeter) {
      const metrics = polygonMetrics(entry.geometry.coordinates);
      const labels: string[] = [];
      if (entry.geometry.showArea) {
        labels.push(
          'A ≈ ' + formatStaticNumber(metrics.area, entry.geometry.language) + ' ' +
          (entry.geometry.language === 'de' ? 'FE' : 'AU')
        );
      }
      if (entry.geometry.showPerimeter) {
        labels.push(
          'u ≈ ' + formatStaticNumber(metrics.perimeter, entry.geometry.language) + ' ' +
          (entry.geometry.language === 'de' ? 'LE' : 'LU')
        );
      }
      appendCenteredText(
        group,
        doc,
        projectStaticPoint(metrics.centroid, config),
        labels.join(' · '),
        getNeutralColor(),
        config
      );
    }
  } else if (entry.geometry.kind === 'distance') {
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
    if (entry.geometry.showLength || entry.geometry.showName) {
      const labels: string[] = [];
      if (entry.geometry.showName && entry.geometry.segmentName) {
        labels.push(staticTextFallback(entry.geometry.segmentName));
      }
      if (entry.geometry.showLength) {
        labels.push(
          formatStaticNumber(polylineLength(entry.geometry.coordinates), entry.geometry.language) +
          ' ' + (entry.geometry.language === 'de' ? 'LE' : 'LU')
        );
      }
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(polylineMidpoint(entry.geometry.coordinates), config),
        labels.join(' ≈ '),
        entry.geometry.color,
        config
      );
    }
  } else if (entry.geometry.kind === 'vector') {
    const start = projectStaticPoint(entry.geometry.coordinates[0], config);
    const end = projectStaticPoint(entry.geometry.coordinates[1], config);
    const line = svgElement(doc, 'line');
    line.setAttribute('x1', String(start.x));
    line.setAttribute('y1', String(start.y));
    line.setAttribute('x2', String(end.x));
    line.setAttribute('y2', String(end.y));
    line.setAttribute('fill', 'none');
    setStableStroke(line, entry.geometry.color, entry.geometry.strokeWidth, entry.geometry.lineStyle);
    const markerId = addArrowMarker(svg, doc, entry.geometry.color, config.id);
    line.setAttribute('marker-end', 'url(#' + markerId + ')');
    group.appendChild(line);
    if (entry.geometry.showName && entry.geometry.objectName) {
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(polylineMidpoint(entry.geometry.coordinates), config),
        staticTextFallback('→' + entry.geometry.objectName),
        entry.geometry.color,
        config
      );
    }
  } else if (entry.geometry.kind === 'line' || entry.geometry.kind === 'ray') {
    const clipped = appendClippedInfiniteLine(
      group,
      doc,
      entry.geometry.coordinates,
      entry.geometry.kind,
      entry.geometry.color,
      entry.geometry.strokeWidth,
      entry.geometry.lineStyle,
      config
    );
    if (clipped && entry.geometry.showName && entry.geometry.objectName) {
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(polylineMidpoint(clipped), config),
        staticTextFallback(entry.geometry.objectName),
        entry.geometry.color,
        config
      );
    }
  } else if (entry.geometry.kind === 'arc') {
    const mathematical = staticArcGeometry(entry.geometry);
    const p0 = projectStaticPoint(mathematical.p0, config);
    const p1 = projectStaticPoint(mathematical.p1, config);
    const p2 = projectStaticPoint(mathematical.p2, config);
    const p3 = projectStaticPoint(mathematical.p3, config);
    const path = svgElement(doc, 'path');
    path.setAttribute(
      'd',
      'M ' + p0.x + ' ' + p0.y +
      ' C ' + p1.x + ' ' + p1.y +
      ', ' + p2.x + ' ' + p2.y +
      ', ' + p3.x + ' ' + p3.y
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    setStableStroke(path, entry.geometry.color, entry.geometry.strokeWidth, entry.geometry.lineStyle);
    if (entry.geometry.firstArrow || entry.geometry.lastArrow) {
      const markerId = addArrowMarker(svg, doc, entry.geometry.color, config.id);
      if (entry.geometry.firstArrow) path.setAttribute('marker-start', 'url(#' + markerId + ')');
      if (entry.geometry.lastArrow) path.setAttribute('marker-end', 'url(#' + markerId + ')');
    }
    group.appendChild(path);
    if (entry.geometry.startCap) appendArcCap(group, doc, entry.geometry, config, true);
    if (entry.geometry.endCap) appendArcCap(group, doc, entry.geometry, config, false);
    if (entry.geometry.caption) {
      appendCenteredText(
        group,
        doc,
        arcCaptionPoint(entry.geometry, config),
        entry.geometry.renderedCaption,
        entry.geometry.color,
        config
      );
    }
  } else if (entry.geometry.kind === 'coord-text') {
    appendCenteredText(
      group,
      doc,
      projectStaticPoint(entry.geometry.coordinate, config),
      entry.geometry.renderedContent,
      entry.geometry.color,
      config,
      entry.geometry.opacity
    );
  } else if (entry.geometry.kind === 'axis-label') {
    const xAxisY = Math.max(config.ymin, Math.min(config.ymax, 0));
    const yAxisX = Math.max(config.xmin, Math.min(config.xmax, 0));
    if (entry.geometry.xLabel.trim()) {
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(
          { x: config.xmax, y: xAxisY },
          config,
          -16,
          xAxisY === config.ymax ? 16 : -16
        ),
        staticTextFallback(entry.geometry.xLabel),
        getNeutralColor(),
        config
      );
    }
    if (entry.geometry.yLabel.trim()) {
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(
          { x: yAxisX, y: config.ymax },
          config,
          yAxisX === config.xmax ? -16 : 16,
          16
        ),
        staticTextFallback(entry.geometry.yLabel),
        getNeutralColor(),
        config
      );
    }
  } else if (entry.geometry.kind === 'point') {
    appendPointGlyph(
      group,
      doc,
      entry.geometry.coordinate,
      entry.geometry.color,
      entry.geometry.opacity,
      config,
      entry.geometry.showName ? entry.geometry.name : '',
      entry.geometry.hasExplicitColor ? entry.geometry.color : getNeutralColor()
    );
  } else if (entry.geometry.kind === 'midpoint') {
    const labels: string[] = [];
    if (entry.geometry.showName && entry.geometry.objectName) {
      labels.push(entry.geometry.objectName);
    }
    if (entry.geometry.showValue) {
      labels.push(
        '(' + formatStaticNumber(entry.geometry.coordinate.x, entry.geometry.language) +
        ' | ' + formatStaticNumber(entry.geometry.coordinate.y, entry.geometry.language) + ')'
      );
    }
    appendPointGlyph(
      group,
      doc,
      entry.geometry.coordinate,
      entry.geometry.color,
      1,
      config,
      labels.join(' '),
      entry.geometry.hasExplicitColor ? entry.geometry.color : getNeutralColor()
    );
  } else if (entry.geometry.kind === 'parallel' || entry.geometry.kind === 'orthogonal') {
    const clipped = appendClippedInfiniteLine(
      group,
      doc,
      entry.geometry.coordinates,
      'line',
      entry.geometry.color,
      3,
      entry.geometry.lineStyle,
      config
    );
    if (clipped && entry.geometry.showName && entry.geometry.objectName) {
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(polylineMidpoint(clipped), config),
        staticTextFallback(entry.geometry.objectName),
        entry.geometry.color,
        config
      );
    }
  } else if (entry.geometry.kind === 'circle') {
    const center = projectStaticPoint(entry.geometry.center, config);
    const circle = svgElement(doc, 'circle');
    circle.setAttribute('cx', String(center.x));
    circle.setAttribute('cy', String(center.y));
    circle.setAttribute('r', String(entry.geometry.radius));
    circle.setAttribute('fill', entry.geometry.color);
    circle.setAttribute('fill-opacity', String(entry.geometry.opacity));
    setStableStroke(circle, entry.geometry.color, 2.5, entry.geometry.lineStyle);
    group.appendChild(circle);
    if (entry.geometry.showName && entry.geometry.name) {
      const namePoint = staticPointOnCircle(
        entry.geometry.center,
        entry.geometry.radius * Math.SQRT1_2,
        Math.PI / 4
      );
      const nameLabel = appendCenteredText(
        group,
        doc,
        projectedLabelPoint(namePoint, config, 8, -8),
        staticTextFallback(entry.geometry.name),
        entry.geometry.color,
        config
      );
      nameLabel.setAttribute('font-size', String(14 * logicalUnitsPerPixel(config)));
    }
    const measurements: string[] = [];
    if (entry.geometry.showArea) {
      measurements.push(
        'A ≈ ' + formatStaticNumber(
          Math.PI * entry.geometry.radius * entry.geometry.radius,
          entry.geometry.language
        ) + ' ' + (entry.geometry.language === 'de' ? 'FE' : 'AU')
      );
    }
    if (entry.geometry.showCircumference) {
      measurements.push(
        'u ≈ ' + formatStaticNumber(
          2 * Math.PI * entry.geometry.radius,
          entry.geometry.language
        ) + ' ' + (entry.geometry.language === 'de' ? 'LE' : 'LU')
      );
    }
    if (measurements.length) {
      const measurementLabel = appendCenteredText(
        group,
        doc,
        center,
        measurements.join(' · '),
        getNeutralColor(),
        config
      );
      measurementLabel.setAttribute('font-size', String(14 * logicalUnitsPerPixel(config)));
    }
  } else if (entry.geometry.kind === 'angle') {
    const first = entry.geometry.points[0];
    const vertex = entry.geometry.points[1];
    const third = entry.geometry.points[2];
    const shortestArm = Math.min(
      Math.hypot(first.x - vertex.x, first.y - vertex.y),
      Math.hypot(third.x - vertex.x, third.y - vertex.y)
    );
    const radius = Math.max(0.05, Math.min(0.8, shortestArm * 0.35));
    const arc = createDirectedAngleArcGeometry(vertex, first, third, radius, { direction: 'ccw' });
    if (arc && arc.segments.length) {
      const path = svgElement(doc, 'path');
      path.setAttribute('d', circularArcPathData(arc, config, true));
      path.setAttribute('fill', entry.geometry.color);
      path.setAttribute('fill-opacity', String(entry.geometry.opacity * 0.2));
      setStableStroke(path, entry.geometry.color, 2.5, entry.geometry.lineStyle);
      group.appendChild(path);
      const labels: string[] = [];
      if (entry.geometry.showName && entry.geometry.name) {
        labels.push(staticTextFallback(entry.geometry.name));
      }
      if (entry.geometry.showValue) {
        labels.push(
          formatStaticNumber(
            Math.abs(arc.sweepRadians) * 180 / Math.PI,
            entry.geometry.language,
            1
          ) + '°'
        );
      }
      if (labels.length) {
        const labelAngle = arc.startAngleRadians + arc.sweepRadians / 2;
        const labelRadius = radius * 1.35 + 10 * logicalUnitsPerPixel(config);
        const label = appendCenteredText(
          group,
          doc,
          projectStaticPoint(staticPointOnCircle(vertex, labelRadius, labelAngle), config),
          labels.join(' ≈ '),
          entry.geometry.color,
          config,
          entry.geometry.opacity
        );
        label.setAttribute('font-size', String(16 * logicalUnitsPerPixel(config)));
      }
    }
  } else if (entry.geometry.kind === 'sector') {
    const center = entry.geometry.points[0];
    const startPoint = entry.geometry.points[1];
    const directionPoint = entry.geometry.points[2];
    const radius = Math.hypot(startPoint.x - center.x, startPoint.y - center.y);
    const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
    const endAngle = Math.atan2(directionPoint.y - center.y, directionPoint.x - center.x);
    const arc = createDirectedCircularArcGeometry(
      center,
      radius,
      startAngle,
      endAngle,
      { direction: 'ccw' }
    );
    if (arc && arc.segments.length) {
      const path = svgElement(doc, 'path');
      path.setAttribute('d', circularArcPathData(arc, config, true));
      path.setAttribute('fill', entry.geometry.color);
      path.setAttribute('fill-opacity', String(entry.geometry.opacity));
      setStableStroke(path, entry.geometry.color, 3, entry.geometry.lineStyle);
      group.appendChild(path);
      const labels: string[] = [];
      if (entry.geometry.showName && entry.geometry.objectName) {
        labels.push(staticTextFallback(entry.geometry.objectName));
      }
      if (entry.geometry.showArea) {
        labels.push(
          'A ≈ ' + formatStaticNumber(
            radius * radius * Math.abs(arc.sweepRadians) / 2,
            entry.geometry.language
          ) + ' ' + (entry.geometry.language === 'de' ? 'FE' : 'AU')
        );
      }
      if (entry.geometry.showPerimeter) {
        labels.push(
          'u ≈ ' + formatStaticNumber(
            radius * (2 + Math.abs(arc.sweepRadians)),
            entry.geometry.language
          ) + ' ' + (entry.geometry.language === 'de' ? 'LE' : 'LU')
        );
      }
      if (labels.length) {
        const labelAngle = arc.startAngleRadians + arc.sweepRadians / 2;
        appendCenteredText(
          group,
          doc,
          projectStaticPoint(staticPointOnCircle(center, radius * 0.58, labelAngle), config),
          labels.join(' · '),
          entry.geometry.color,
          config
        );
      }
    }
  } else if (entry.geometry.kind === 'plot') {
    const plot = entry.geometry;
    group.setAttribute('data-lia-static-evaluations', String(plot.evaluationCount));
    plot.segments.forEach(function(segment) {
      if (segment.length < 2) return;
      const projected = segment.map(function(point) { return projectStaticPoint(point, config); });
      const path = svgElement(doc, 'path');
      path.setAttribute(
        'd',
        projected.map(function(point, index) {
          return (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y;
        }).join(' ')
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      setStableStroke(path, plot.color, 3, plot.lineStyle);
      group.appendChild(path);
    });
    if (plot.showName && plot.name && plot.segments.length) {
      const labelSegment = plot.segments.reduce(function(longest, segment) {
        return segment.length > longest.length ? segment : longest;
      });
      const labelPoint = labelSegment[labelSegment.length - 1];
      appendCenteredText(
        group,
        doc,
        projectedLabelPoint(labelPoint, config, -10, -12),
        staticTextFallback(plot.name),
        plot.color,
        config
      );
    }
  }
  svg.appendChild(group);
}

interface StaticPointRegistry {
  points: Map<string, CoordinatePair>;
  ambiguous: Set<string>;
}

function createStaticPointRegistry(
  config: BoardConfig,
  nodes: HTMLElement[]
): StaticPointRegistry {
  const points = new Map<string, CoordinatePair>();
  const ambiguous = new Set<string>();
  nodes.forEach(function(node) {
    const info = markerInfo(node);
    if (!info || info.kind !== 'point' || markerBoardId(node, info) !== config.id) return;
    const parsed = parseStaticPointSpec(String(node.dataset && node.dataset.spec || ''));
    if (!parsed || parsed.boardId !== config.id || !parsed.name) return;
    if (ambiguous.has(parsed.name) || points.has(parsed.name)) {
      points.delete(parsed.name);
      ambiguous.add(parsed.name);
      warnOnce(
        config.id + ':duplicate-static-point:' + parsed.name,
        'Static point name [' + parsed.name + '] is ambiguous on board [' + config.id +
          '] and cannot be used by dependent objects.'
      );
      return;
    }
    points.set(parsed.name, { x: parsed.coordinate.x, y: parsed.coordinate.y });
  });
  return { points, ambiguous };
}

function pointResolver(registry: StaticPointRegistry): StaticPointResolver {
  return function(name: string): CoordinatePair | null {
    const key = String(name || '').trim();
    if (!key || registry.ambiguous.has(key)) return null;
    const point = registry.points.get(key);
    return point ? { x: point.x, y: point.y } : null;
  };
}

function resolvePointReference(
  reference: StaticPointReference,
  resolvePoint: StaticPointResolver
): CoordinatePair | null {
  if (reference.kind === 'coordinate') {
    return { x: reference.coordinate.x, y: reference.coordinate.y };
  }
  return resolvePoint(reference.name);
}

function resolvePointReferences(
  references: readonly StaticPointReference[],
  resolvePoint: StaticPointResolver
): CoordinatePair[] | null {
  const points = references.map(function(reference) {
    return resolvePointReference(reference, resolvePoint);
  });
  return points.every(function(point): point is CoordinatePair { return !!point; })
    ? points
    : null;
}

function accentColor<T extends { color: string; hasExplicitColor: boolean }>(spec: T): T {
  if (!spec.hasExplicitColor) spec.color = getAccentColor();
  return spec;
}

function resolvedLinearGeometry(
  spec: string,
  markerKind: unknown,
  language: string,
  resolvePoint: StaticPointResolver
): StaticVectorSpec | StaticLineSpec | null {
  const parsed = parseStaticLinearSpec(spec, markerKind, language);
  if (!parsed) return null;
  const points = resolvePointReferences(parsed.points, resolvePoint);
  if (!points || points.length !== 2 ||
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) <= 1e-12) {
    return null;
  }
  accentColor(parsed);
  let objectName = parsed.objectName;
  if (!objectName && parsed.kind === 'vector') {
    objectName = parsed.points[0].kind === 'point' && parsed.points[1].kind === 'point'
      ? parsed.points[0].name + parsed.points[1].name
      : 'a';
  }
  if (parsed.kind === 'vector') {
    return {
      kind: 'vector',
      boardId: parsed.boardId,
      coordinates: [points[0], points[1]],
      color: parsed.color,
      hasExplicitColor: parsed.hasExplicitColor,
      strokeWidth: 3,
      lineStyle: parsed.lineStyle,
      visible: parsed.visible,
      objectName,
      showName: parsed.showName && !!objectName
    };
  }
  return {
    kind: parsed.kind,
    boardId: parsed.boardId,
    coordinates: [points[0], points[1]],
    color: parsed.color,
    hasExplicitColor: parsed.hasExplicitColor,
    strokeWidth: 3,
    lineStyle: parsed.lineStyle,
    visible: parsed.visible,
    objectName,
    showName: parsed.showName && !!objectName,
    language: parsed.language
  };
}

function resolvedRelationGeometry(
  spec: string,
  markerKind: unknown,
  language: string,
  resolvePoint: StaticPointResolver
): StaticMidpointGeometry | StaticRelatedLineGeometry | null {
  const parsed = parseStaticRelationSpec(spec, markerKind, language);
  if (!parsed) return null;
  if (parsed.kind === 'midpoint') {
    const points = resolvePointReferences(parsed.points, resolvePoint);
    if (!points || points.length !== 2) return null;
    return {
      ...parsed,
      color: parsed.hasExplicitColor ? parsed.color : '#ff00ff',
      coordinate: {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      }
    };
  }
  // Named line-like bases need an object dependency graph and stay dynamic.
  if (parsed.base.kind !== 'points') return null;
  const base = resolvePointReferences(parsed.base.points, resolvePoint);
  const through = resolvePointReference(parsed.through, resolvePoint);
  if (!base || base.length !== 2 || !through) return null;
  const dx = base[1].x - base[0].x;
  const dy = base[1].y - base[0].y;
  if (Math.hypot(dx, dy) <= 1e-12) return null;
  accentColor(parsed);
  const direction = parsed.kind === 'orthogonal'
    ? { x: -dy, y: dx }
    : { x: dx, y: dy };
  return {
    ...parsed,
    coordinates: [
      { x: through.x, y: through.y },
      { x: through.x + direction.x, y: through.y + direction.y }
    ]
  };
}

function resolvedCircleGeometry(
  spec: string,
  language: string,
  resolvePoint: StaticPointResolver
): StaticCircleGeometry | null {
  const parsed = parseStaticCircleSpec(spec, language);
  if (!parsed) return null;
  const center = resolvePointReference(parsed.center, resolvePoint);
  if (!center) return null;
  let radius = parsed.radius.kind === 'number' ? parsed.radius.value : NaN;
  if (parsed.radius.kind === 'point') {
    const radiusPoint = resolvePointReference(parsed.radius.point, resolvePoint);
    if (!radiusPoint) return null;
    radius = Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y);
  }
  if (!Number.isFinite(radius) || radius <= 1e-12) return null;
  accentColor(parsed);
  return { ...parsed, center, radius };
}

function resolvedAngleGeometry(
  spec: string,
  language: string,
  resolvePoint: StaticPointResolver
): StaticAngleGeometry | null {
  const parsed = parseStaticAngleSpec(spec, language);
  if (!parsed) return null;
  const points = resolvePointReferences(parsed.points, resolvePoint);
  if (!points || points.length !== 3) return null;
  accentColor(parsed);
  const fallbackName = !parsed.name && parsed.points.every(function(point) {
    return point.kind === 'point';
  })
    ? '∠' + parsed.points.map(function(point) {
        return point.kind === 'point' ? point.name : '';
      }).join('')
    : '';
  return {
    ...parsed,
    name: parsed.name || fallbackName,
    points: [points[0], points[1], points[2]]
  };
}

function resolvedSectorGeometry(
  spec: string,
  language: string,
  resolvePoint: StaticPointResolver
): StaticSectorGeometry | null {
  const parsed = parseStaticSectorSpec(spec, language);
  if (!parsed) return null;
  const points = resolvePointReferences(parsed.points, resolvePoint);
  if (!points || points.length !== 3 ||
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) <= 1e-12 ||
      Math.hypot(points[2].x - points[0].x, points[2].y - points[0].y) <= 1e-12) {
    return null;
  }
  accentColor(parsed);
  return {
    ...parsed,
    points: [points[0], points[1], points[2]]
  };
}

function resolvedPlotGeometry(spec: string, config: BoardConfig): StaticPlotGeometry | null {
  const parsed = parseStaticPlotFunctionSpec(spec);
  if (!parsed) return null;
  const sampled = sampleStaticFunction(parsed.evaluate, config, {
    sampleCount: Math.max(256, Math.min(2048, Math.round((config.width || 640) * 1.25)))
  });
  if (!sampled || !sampled.segments.length) return null;
  const { evaluate: _evaluate, ...geometry } = parsed;
  return {
    ...geometry,
    segments: sampled.segments,
    evaluationCount: sampled.evaluationCount
  };
}

function collectGeometry(config: BoardConfig, doc: Document): StaticGeometryEntry[] {
  const result: StaticGeometryEntry[] = [];
  let nodes: HTMLElement[] = [];
  try { nodes = Array.from(doc.querySelectorAll<HTMLElement>(MARKER_SELECTOR)); } catch (e) {}
  const resolvePoint = pointResolver(createStaticPointRegistry(config, nodes));
  nodes.forEach(function(node) {
    const info = markerInfo(node);
    if (!info || markerBoardId(node, info) !== config.id) return;
    const spec = String(node.dataset && node.dataset.spec || '');
    const language = String(node.dataset && node.dataset.language || '');
    if (info.kind === 'unsupported') {
      warnOnce(config.id + ':' + node.id + ':' + spec,
        'Board "' + config.id + '" ignores unsupported marker #' + node.id + '. ' +
        'Static mode supports only its documented deterministic marker subset.');
      return;
    }
    if (info.kind === 'linear' &&
        !/^(?:line|ray|vector)$/.test(
          String(node.dataset && node.dataset.kind || '').trim().toLowerCase()
        )) {
      warnOnce(config.id + ':' + node.id + ':' + spec + ':linear-kind',
        'Static mode ignores a linear marker with an unknown kind at #' + node.id + '.');
      return;
    }
    let geometry: StaticGeometrySpec | null = null;
    if (info.kind === 'area') geometry = parseStaticAreaSpec(spec, language, resolvePoint);
    else if (info.kind === 'distance') geometry = parseStaticDistanceSpec(spec, language, resolvePoint);
    else if (info.kind === 'axis-label') geometry = parseStaticAxisLabelSpec(spec);
    else if (info.kind === 'point') geometry = parseStaticPointSpec(spec);
    else if (info.kind === 'coord-text') geometry = parseStaticCoordTextSpec(spec);
    else if (info.kind === 'linear') {
      geometry = resolvedLinearGeometry(
        spec,
        String(node.dataset && node.dataset.kind || ''),
        language,
        resolvePoint
      );
    } else if (info.kind === 'arc') geometry = parseStaticArcSpec(spec, language, resolvePoint);
    else if (info.kind === 'relation') {
      geometry = resolvedRelationGeometry(
        spec,
        String(node.dataset && node.dataset.kind || ''),
        language,
        resolvePoint
      );
    } else if (info.kind === 'angle') geometry = resolvedAngleGeometry(spec, language, resolvePoint);
    else if (info.kind === 'circle') geometry = resolvedCircleGeometry(spec, language, resolvePoint);
    else if (info.kind === 'sector') geometry = resolvedSectorGeometry(spec, language, resolvePoint);
    else if (info.kind === 'plot') geometry = resolvedPlotGeometry(spec, config);
    if (!geometry) {
      warnOnce(config.id + ':' + node.id + ':' + spec,
        'Marker #' + node.id + ' on static board "' + config.id + '" could not be resolved ' +
        'from deterministic syntax and the board-local fixed-point registry.');
      return;
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

/** Batch changes into one frame, with a bounded fallback for throttled frames. */
export function scheduleStaticBootstrap(): void {
  if (bootstrapFrame || bootstrapTimeout) return;
  let completed = false;
  const run = function() {
    if (completed) return;
    completed = true;
    const frame = bootstrapFrame;
    const timeout = bootstrapTimeout;
    bootstrapFrame = 0;
    bootstrapTimeout = 0;
    try { if (frame) cancelAnimationFrame(frame); } catch (e) {}
    try {
      if (timeout && typeof window.clearTimeout === 'function') window.clearTimeout(timeout);
    } catch (e) {}
    bootstrapStaticCoordinateBoards();
  };
  try {
    bootstrapFrame = requestAnimationFrame(run);
  } catch (e) {
    bootstrapFrame = 0;
  }
  try {
    if (typeof window.setTimeout === 'function') {
      bootstrapTimeout = window.setTimeout(run, 50) as unknown as number;
    }
  } catch (e) {
    bootstrapTimeout = 0;
  }
  if (!bootstrapFrame && !bootstrapTimeout) run();
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
          'data-kind',
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
  // synchronously, but defer all SVG construction to the shared scheduled batch.
  initializeDeclarativeHosts(document);
  syncMarkerClaims(document);
  scheduleStaticBootstrap();
}
