// Pure parsers for static-SVG data-spec markers. This module deliberately has
// no DOM, window, JSXGraph, theme, or subsystem dependency. Named inputs stay
// unresolved until the renderer applies its immutable board-local registry.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import type { CoordinatePair } from '../shared/parser';
import { isLineStyleOption, parseLineStyleOptions } from '../shared/lineStyle';
import type { LineStyle } from '../shared/lineStyle';
import { compileFunctionExpression } from '../shared/functionExpression';

export type StaticLanguage = 'de' | 'en';
export type StaticLinearKind = 'line' | 'ray' | 'vector';
export type StaticRelationKind = 'orthogonal' | 'parallel' | 'midpoint';

export const STATIC_SPEC_FALLBACK_ACCENT = '#000';
export const STATIC_SPEC_FALLBACK_POINT_COLOR = '#ff00ff';
export const STATIC_SPEC_FALLBACK_PLOT_COLOR = 'red';

export interface StaticCoordinateReference {
  kind: 'coordinate';
  coordinate: CoordinatePair;
}
export interface StaticNamedPointReference { kind: 'point'; name: string; }
export type StaticPointReference = StaticCoordinateReference | StaticNamedPointReference;
export interface StaticPointPairReference {
  kind: 'points';
  points: [StaticPointReference, StaticPointReference];
}
export interface StaticNamedObjectReference { kind: 'object'; name: string; }
export type StaticLineReference = StaticPointPairReference | StaticNamedObjectReference;
export interface StaticNumericRadius { kind: 'number'; value: number; }
export interface StaticPointRadius { kind: 'point'; point: StaticNamedPointReference; }
export type StaticRadiusReference = StaticNumericRadius | StaticPointRadius;

export interface StaticAxisLabelSpec {
  kind: 'axis-label'; boardId: string; xLabel: string; yLabel: string;
}
export interface StaticPointSpec {
  kind: 'point'; boardId: string; name: string; showName: boolean;
  coordinate: CoordinatePair; color: string; hasExplicitColor: boolean;
  opacity: number;
  /** Whether the macro contained `fix`; static output is frozen either way. */
  fixed: boolean;
  helper: boolean;
}
export interface StaticLinearSpec {
  kind: StaticLinearKind; boardId: string;
  points: [StaticPointReference, StaticPointReference];
  color: string; hasExplicitColor: boolean; objectName: string;
  showName: boolean; visible: boolean; lineStyle: LineStyle;
  language: StaticLanguage;
}
export interface StaticMidpointSpec {
  kind: 'midpoint'; boardId: string;
  points: [StaticPointReference, StaticPointReference];
  color: string; hasExplicitColor: boolean; objectName: string;
  showName: boolean; showValue: boolean; visible: boolean;
  language: StaticLanguage;
}
export interface StaticRelatedLineSpec {
  kind: 'orthogonal' | 'parallel'; boardId: string; base: StaticLineReference;
  through: StaticPointReference; color: string; hasExplicitColor: boolean;
  objectName: string; showName: boolean; visible: boolean;
  lineStyle: LineStyle; language: StaticLanguage;
}
export type StaticRelationSpec = StaticMidpointSpec | StaticRelatedLineSpec;

/** Split top-level semicolons while retaining meaningful empty fields. */
export function splitStaticSpecFields(spec: unknown): string[] {
  const input = unquote(String(spec == null ? '' : spec));
  const result: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) { current += character; escaped = false; continue; }
    if (character === '\\') { current += character; escaped = true; continue; }
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    const quotedApostrophe = character === String.fromCharCode(39) &&
      !current.trim() && input.indexOf(String.fromCharCode(39), index + 1) >= 0;
    if (character === String.fromCharCode(34) || character === String.fromCharCode(96) || quotedApostrophe) {
      current += character;
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1; current += character; continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      depth = Math.max(0, depth - 1); current += character; continue;
    }
    if (character === ';' && depth === 0) {
      result.push(unquote(current).trim()); current = ''; continue;
    }
    current += character;
  }
  result.push(unquote(current).trim());
  return result;
}

/** Strict decimal parser for immutable coordinates and dimensions. */
export function parseStaticNumber(value: unknown): number | null {
  const normalized = unquote(String(value == null ? '' : value)).trim()
    .replace(/[\u2212\u2013\u2014]/g, '-').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLanguage(language?: unknown): StaticLanguage {
  return String(language == null ? '' : language).trim().toLowerCase() === 'en' ? 'en' : 'de';
}
function clampOpacity(value: unknown, fallback: number): number {
  const parsed = parseStaticNumber(value);
  return parsed == null ? fallback : Math.max(0, Math.min(1, parsed));
}
function decodeLegacyParentheses(value: unknown): string {
  return String(value == null ? '' : value).replace(/\{\{/g, '(').replace(/\}\}/g, ')');
}

function parseDirectCoordinate(value: unknown): CoordinatePair | null {
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const parts = splitTopLevel(raw.slice(1, -1), ';').map((part) => unquote(part).trim());
  if (parts.length !== 2) return null;
  const x = parseStaticNumber(parts[0]);
  const y = parseStaticNumber(parts[1]);
  return x == null || y == null ? null : { x, y };
}

function parseDirectCoordinateList(value: unknown): CoordinatePair[] | null {
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const entries = splitTopLevel(raw.slice(1, -1), ';');
  if (!entries.length) return null;
  const coordinates: CoordinatePair[] = [];
  for (const entry of entries) {
    const coordinate = parseDirectCoordinate(entry);
    if (!coordinate) return null;
    coordinates.push(coordinate);
  }
  return coordinates;
}

function namedPointReference(value: unknown): StaticNamedPointReference | null {
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw || raw.startsWith('[') || raw.endsWith(']') || /[;,]/.test(raw)) return null;
  const parsed = parseMacroName(raw);
  return parsed.name ? { kind: 'point', name: parsed.name } : null;
}

/** Parse one direct coordinate or one unresolved named point reference. */
export function parseStaticPointReference(value: unknown): StaticPointReference | null {
  const coordinate = parseDirectCoordinate(value);
  return coordinate ? { kind: 'coordinate', coordinate } : namedPointReference(value);
}

function parsePointReferenceList(value: unknown, length: 2): [StaticPointReference, StaticPointReference] | null;
function parsePointReferenceList(value: unknown, length: 3): [StaticPointReference, StaticPointReference, StaticPointReference] | null;
function parsePointReferenceList(value: unknown, length: 2 | 3): StaticPointReference[] | null {
  const coordinates = parseDirectCoordinateList(value);
  if (coordinates) {
    if (coordinates.length !== length) return null;
    return coordinates.map((coordinate): StaticCoordinateReference => ({
      kind: 'coordinate', coordinate
    }));
  }
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const names = splitTopLevel(raw.slice(1, -1), ';');
  if (names.length !== length) return null;
  const references = names.map(namedPointReference);
  return references.every(Boolean) ? references as StaticNamedPointReference[] : null;
}

function parseNamedPointTriple(
  value: unknown
): [StaticNamedPointReference, StaticNamedPointReference, StaticNamedPointReference] | null {
  const references = parsePointReferenceList(value, 3);
  return references && references.every((reference) => reference.kind === 'point')
    ? references as [StaticNamedPointReference, StaticNamedPointReference, StaticNamedPointReference]
    : null;
}

function isFixOption(value: unknown): boolean {
  return /^fix$/i.test(String(value == null ? '' : value).trim());
}
function isHelperOption(value: unknown): boolean {
  return /^(?:helper|hilfspunkt)\s*=\s*1$/i.test(String(value == null ? '' : value).trim());
}
function isInternalHelperOption(value: unknown): boolean {
  return /^(?:helper|hilfspunkt)\s*=/i.test(String(value == null ? '' : value).trim());
}
function isDynamicPointOption(value: unknown): boolean {
  return /^(?:xexpr|yexpr|parameter|param)\s*=/i.test(String(value == null ? '' : value).trim());
}
function visibilityOptionValue(value: unknown): boolean | null {
  const match = String(value == null ? '' : value).trim()
    .match(/^(?:visible|sichtbar)\s*=\s*(0|1|false|true)$/i);
  return match ? !/^(?:0|false)$/i.test(match[1]) : null;
}
function optionVisibility(options: readonly unknown[]): boolean {
  const values = options.map(visibilityOptionValue)
    .filter((value): value is boolean => value != null);
  return values.length ? values[values.length - 1] : true;
}
function optionVisibilityOnceHidden(options: readonly unknown[]): boolean {
  return !options.some((option) => visibilityOptionValue(option) === false);
}
function isValueOption(value: unknown): boolean {
  return /^(?:wert|value|koordinaten|coordinates)\s*=\s*1$/i
    .test(String(value == null ? '' : value).trim());
}

function parseObjectName(
  options: string[],
  fallback = '',
  ignored?: (option: string) => boolean
): { name: string; showName: boolean } {
  const hiddenByOption = options.some(isHiddenNameOption);
  const namedOption = options.map((option) => {
    if (isHiddenNameOption(option)) return '';
    const match = option.match(/^name\s*=\s*(.+)$/i);
    return match ? String(match[1] || '').trim() : '';
  }).find(Boolean) || '';
  const positionalName = options.find((option) =>
    !/^name\s*=/i.test(option) &&
    !isHiddenNameOption(option) &&
    visibilityOptionValue(option) == null &&
    !isLineStyleOption(option) &&
    !(ignored && ignored(option))) || '';
  const parsed = parseMacroName(namedOption || positionalName, fallback);
  return { name: parsed.name, showName: parsed.showName && !hiddenByOption };
}

/** Parse `id=...;xlabel=...;ylabel=...` emitted by @AxisLabel. */
function splitStaticAxisLabelFields(spec: unknown): string[] {
  const input = unquote(String(spec == null ? '' : spec).trim());
  const result: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) { current += character; escaped = false; continue; }
    if (character === '\\') { current += character; escaped = true; continue; }
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === String.fromCharCode(39)) {
      let previous = index - 1;
      while (previous >= 0 && /\s/.test(input[previous])) previous -= 1;
      const atValueStart = previous < 0 || ';,([{=:'.includes(input[previous]);
      const hasClosingQuote = input.indexOf(character, index + 1) >= 0;
      if (!atValueStart || !hasClosingQuote) {
        current += character;
        continue;
      }
    }
    if (character === String.fromCharCode(34) ||
        character === String.fromCharCode(39) ||
        character === String.fromCharCode(96)) {
      current += character; quote = character; continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1; current += character; continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      depth = Math.max(0, depth - 1); current += character; continue;
    }
    const commaStartsField = character === ',' &&
      /^(?:id|xlabel|ylabel)\s*=/i.test(input.slice(index + 1).trimStart());
    if (depth === 0 && (character === ';' || commaStartsField)) {
      if (current.trim()) result.push(unquote(current).trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) result.push(unquote(current).trim());
  return result;
}

export function parseStaticAxisLabelSpec(spec: string): StaticAxisLabelSpec | null {
  const values: Record<string, string> = {};
  splitStaticAxisLabelFields(spec).forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim().toLowerCase();
    values[key] = unquote(part.slice(index + 1).trim());
  });
  const boardId = String(values.id || '').trim();
  if (!boardId) return null;
  return {
    kind: 'axis-label',
    boardId,
    xLabel: decodeLegacyParentheses(values.xlabel || ''),
    yLabel: decodeLegacyParentheses(values.ylabel || '')
  };
}

/** Parse only a point with finite authored x/y coordinates. */
export function parseStaticPointSpec(spec: string): StaticPointSpec | null {
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  const x = parseStaticNumber(parts[2]);
  const y = parseStaticNumber(parts[3]);
  const options = parts.slice(4).map((option) => String(option || '').trim());
  if (!boardId || x == null || y == null || options.some(isDynamicPointOption)) return null;
  const visualOptions = options.filter((option) =>
    !isHiddenNameOption(option) && !isInternalHelperOption(option) && !isDynamicPointOption(option));

  const parsedName = parseMacroName(parts[1] || 'A', 'A');
  const colorSlot = String(visualOptions[0] || '').trim();
  const hasExplicitColor = !!colorSlot &&
    !isFixOption(colorSlot);
  return {
    kind: 'point',
    boardId,
    name: parsedName.name || 'A',
    showName: parsedName.showName && !options.some(isHiddenNameOption),
    coordinate: { x, y },
    color: hasExplicitColor ? colorSlot : STATIC_SPEC_FALLBACK_POINT_COLOR,
    hasExplicitColor,
    opacity: clampOpacity(visualOptions[1], 1),
    fixed: visualOptions.some(isFixOption),
    helper: options.some(isHelperOption)
  };
}

function normalizeLinearKind(kind: unknown): StaticLinearKind | null {
  const value = String(kind == null ? '' : kind).trim().toLowerCase();
  if (value === 'line' || value === 'gerade') return 'line';
  if (value === 'ray' || value === 'strahl') return 'ray';
  if (value === 'vector' || value === 'vektor') return 'vector';
  return null;
}

/** Parse @Line/@Ray/@Vector from two direct coordinates or point names. */
export function parseStaticLinearSpec(
  spec: string,
  kind: unknown,
  language?: unknown
): StaticLinearSpec | null {
  const normalizedKind = normalizeLinearKind(kind);
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  if (!normalizedKind || !boardId) return null;

  const pairToken = String(parts[1] || '').trim();
  let points: [StaticPointReference, StaticPointReference] | null = null;
  let colorIndex = 3;
  if (pairToken.startsWith('[') && pairToken.endsWith(']')) {
    points = parsePointReferenceList(pairToken, 2);
    colorIndex = 2;
  } else {
    const first = namedPointReference(parts[1]);
    const second = namedPointReference(parts[2]);
    if (first && second) points = [first, second];
  }
  if (!points) return null;

  const explicitColor = String(parts[colorIndex] || '').trim();
  const options = parts.slice(colorIndex + 1)
    .map((part) => String(part || '').trim()).filter(Boolean);
  const objectName = parseObjectName(options);
  return {
    kind: normalizedKind,
    boardId,
    points,
    color: explicitColor || STATIC_SPEC_FALLBACK_ACCENT,
    hasExplicitColor: !!explicitColor,
    objectName: objectName.name,
    showName: objectName.showName,
    visible: optionVisibility(options),
    lineStyle: parseLineStyleOptions(options),
    language: normalizeLanguage(language)
  };
}

function normalizeRelationKind(kind: unknown): StaticRelationKind | null {
  const value = String(kind == null ? '' : kind).trim().toLowerCase();
  if (value === 'orthogonal' || value === 'perpendicular' || value === 'orthogonale') {
    return 'orthogonal';
  }
  if (value === 'parallel' || value === 'parallele') return 'parallel';
  if (value === 'midpoint' || value === 'mittelpunkt') return 'midpoint';
  return null;
}

/** Parse @Midpoint, @Parallel, or @Perpendicular without resolving names. */
export function parseStaticRelationSpec(
  spec: string,
  kind: unknown,
  language?: unknown
): StaticRelationSpec | null {
  const relationKind = normalizeRelationKind(kind);
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  if (!relationKind || !boardId) return null;

  if (relationKind === 'midpoint') {
    const pairToken = String(parts[1] || '').trim();
    let points: [StaticPointReference, StaticPointReference] | null = null;
    let colorIndex = 3;
    if (pairToken.startsWith('[') && pairToken.endsWith(']')) {
      points = parsePointReferenceList(pairToken, 2);
      colorIndex = 2;
    } else {
      const first = namedPointReference(parts[1]);
      const second = namedPointReference(parts[2]);
      if (first && second) points = [first, second];
    }
    if (!points) return null;

    const explicitColor = String(parts[colorIndex] || '').trim();
    const options = parts.slice(colorIndex + 1)
      .map((part) => String(part || '').trim()).filter(Boolean);
    const objectName = parseObjectName(options, 'M', isValueOption);
    return {
      kind: 'midpoint',
      boardId,
      points,
      color: explicitColor || STATIC_SPEC_FALLBACK_POINT_COLOR,
      hasExplicitColor: !!explicitColor,
      objectName: objectName.name,
      showName: objectName.showName,
      showValue: options.some(isValueOption),
      visible: optionVisibilityOnceHidden(options),
      language: normalizeLanguage(language)
    };
  }

  const baseToken = String(parts[1] || '').trim();
  const basePoints = parsePointReferenceList(baseToken, 2);
  const baseName = basePoints ? null : namedPointReference(baseToken);
  const through = parseStaticPointReference(parts[2]);
  if ((!basePoints && !baseName) || !through) return null;

  const explicitColor = String(parts[3] || '').trim();
  const options = parts.slice(4)
    .map((part) => String(part || '').trim()).filter(Boolean);
  const objectName = parseObjectName(options);
  return {
    kind: relationKind,
    boardId,
    base: basePoints
      ? { kind: 'points', points: basePoints }
      : { kind: 'object', name: (baseName as StaticNamedPointReference).name },
    through,
    color: explicitColor || STATIC_SPEC_FALLBACK_ACCENT,
    hasExplicitColor: !!explicitColor,
    objectName: objectName.name,
    showName: objectName.showName,
    visible: optionVisibilityOnceHidden(options),
    lineStyle: parseLineStyleOptions(options),
    language: normalizeLanguage(language)
  };
}

/** Parse the public circle syntax: named center, numeric or named-point radius. */
export function parseStaticCircleSpec(spec: string, language?: unknown): StaticCircleSpec | null {
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  const center = namedPointReference(parts[2]);
  if (!boardId || !center) return null;

  const explicitColor = String(parts[3] || '').trim();
  const options = parts.slice(5)
    .map((option) => String(option || '').trim()).filter(Boolean);
  let numericRadius = 1;
  let radius: StaticRadiusReference = { kind: 'number', value: numericRadius };
  for (const option of options) {
    const match = option.match(/^radius\s*=\s*(.+)$/i);
    if (!match) continue;
    const radiusValue = parseStaticNumber(match[1]);
    if (radiusValue != null) {
      if (radiusValue !== 0) numericRadius = Math.abs(radiusValue);
      radius = { kind: 'number', value: numericRadius };
      continue;
    }
    const radiusPoint = namedPointReference(match[1]);
    if (!radiusPoint) return null;
    radius = { kind: 'point', point: radiusPoint };
  }

  const parsedName = parseMacroName(parts[1] || '');
  return {
    kind: 'circle',
    boardId,
    name: parsedName.name,
    showName: parsedName.showName && !options.some(isHiddenNameOption),
    center,
    radius,
    color: explicitColor || STATIC_SPEC_FALLBACK_ACCENT,
    hasExplicitColor: !!explicitColor,
    opacity: clampOpacity(parts[4], 0.2),
    showArea: options.some((option) => /^(?:inhalt|area)\s*=\s*1$/i.test(option)),
    showCircumference: options.some((option) =>
      /^(?:umfang|circumference|perimeter)\s*=\s*1$/i.test(option)),
    visible: optionVisibilityOnceHidden(options),
    lineStyle: parseLineStyleOptions(options),
    language: normalizeLanguage(language)
  };
}

/** Parse the public three-named-point angle syntax. */
export function parseStaticAngleSpec(spec: string, language?: unknown): StaticAngleSpec | null {
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  const points = parseNamedPointTriple(parts[2]);
  if (!boardId || !points) return null;

  const explicitColor = String(parts[3] || '').trim();
  const options = parts.slice(5)
    .map((option) => String(option || '').trim()).filter(Boolean);
  const parsedName = parseMacroName(parts[1] || '');
  return {
    kind: 'angle',
    boardId,
    name: parsedName.name,
    showName: parsedName.showName && !options.some(isHiddenNameOption),
    points,
    color: explicitColor || STATIC_SPEC_FALLBACK_ACCENT,
    hasExplicitColor: !!explicitColor,
    opacity: clampOpacity(parts[4], 1),
    showValue: options.some((option) => /^(?:wert|value)\s*=\s*1$/i.test(option)),
    visible: optionVisibilityOnceHidden(options),
    lineStyle: parseLineStyleOptions(options),
    language: normalizeLanguage(language)
  };
}

function isSectorMetricOption(option: string): boolean {
  return /^(?:inhalt|area|umfang|perimeter|circumference)\s*=\s*1$/i.test(option);
}

/** Parse the named-point marker shared by all sector/segment aliases. */
export function parseStaticSectorSpec(spec: string, language?: unknown): StaticSectorSpec | null {
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  const points = parseNamedPointTriple(parts[1]);
  if (!boardId || !points) return null;

  const explicitColor = String(parts[2] || '').trim();
  const options = parts.slice(4)
    .map((option) => String(option || '').trim()).filter(Boolean);
  const objectName = parseObjectName(options, '', isSectorMetricOption);
  return {
    kind: 'sector',
    boardId,
    points,
    color: explicitColor || STATIC_SPEC_FALLBACK_ACCENT,
    hasExplicitColor: !!explicitColor,
    opacity: clampOpacity(parts[3], 0.2),
    objectName: objectName.name,
    showName: objectName.showName,
    showArea: options.some((option) => /^(?:inhalt|area)\s*=\s*1$/i.test(option)),
    showPerimeter: options.some((option) =>
      /^(?:umfang|perimeter|circumference)\s*=\s*1$/i.test(option)),
    visible: optionVisibilityOnceHidden(options),
    lineStyle: parseLineStyleOptions(options),
    language: normalizeLanguage(language)
  };
}

/** Alias matching the canonical English public macro name. */
export const parseStaticCircularSectorSpec = parseStaticSectorSpec;

function isDynamicPlotOption(option: string): boolean {
  return /^(?:slider|binding|bindings|variable|variables|parameter|param|function|functions)\s*=/i
    .test(String(option || '').trim());
}

/** Parse one self-contained f(x), rejecting sliders and custom bindings. */
export function parseStaticPlotFunctionSpec(spec: string): StaticPlotFunctionSpec | null {
  const parts = splitStaticSpecFields(spec);
  const boardId = String(parts[0] || '').trim();
  const expression = decodeLegacyParentheses(parts[2] || '');
  const options = parts.slice(4)
    .map((option) => String(option || '').trim()).filter(Boolean);
  if (!boardId || !expression.trim() || options.some(isDynamicPlotOption)) return null;

  let compiled;
  try {
    // No custom bindings: only x, constants, and built-in maths survive.
    compiled = compileFunctionExpression(expression);
  } catch (error) {
    return null;
  }
  if (!compiled.fn || !compiled.normalized) return null;

  const parsedName = parseMacroName(parts[1] || 'f', 'f');
  const explicitColor = String(parts[3] || '').trim();
  return {
    kind: 'plot',
    boardId,
    name: parsedName.name,
    showName: parsedName.showName && !options.some(isHiddenNameOption),
    visible: optionVisibility(options),
    expression,
    preparedExpression: compiled.prepared,
    asciiExpression: compiled.ascii,
    normalizedExpression: compiled.normalized,
    evaluate: compiled.fn,
    color: explicitColor || STATIC_SPEC_FALLBACK_PLOT_COLOR,
    hasExplicitColor: !!explicitColor,
    lineStyle: parseLineStyleOptions(options)
  };
}

export interface StaticCircleSpec {
  kind: 'circle'; boardId: string; name: string; showName: boolean;
  center: StaticNamedPointReference; radius: StaticRadiusReference;
  color: string; hasExplicitColor: boolean; opacity: number;
  showArea: boolean; showCircumference: boolean; visible: boolean;
  lineStyle: LineStyle; language: StaticLanguage;
}
export interface StaticAngleSpec {
  kind: 'angle'; boardId: string; name: string; showName: boolean;
  points: [StaticNamedPointReference, StaticNamedPointReference, StaticNamedPointReference];
  color: string; hasExplicitColor: boolean; opacity: number;
  showValue: boolean; visible: boolean; lineStyle: LineStyle;
  language: StaticLanguage;
}
export interface StaticSectorSpec {
  kind: 'sector'; boardId: string;
  points: [StaticNamedPointReference, StaticNamedPointReference, StaticNamedPointReference];
  color: string; hasExplicitColor: boolean; opacity: number;
  objectName: string; showName: boolean; showArea: boolean;
  showPerimeter: boolean; visible: boolean; lineStyle: LineStyle;
  language: StaticLanguage;
}
export interface StaticPlotFunctionSpec {
  kind: 'plot'; boardId: string; name: string; showName: boolean;
  visible: boolean; expression: string; preparedExpression: string;
  asciiExpression: string; normalizedExpression: string;
  evaluate: (x: number) => number; color: string;
  hasExplicitColor: boolean; lineStyle: LineStyle;
}
