import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { applyLineStyle, parseLineStyle } from '../shared/lineStyle';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinateCircle3DData, createCoordinateCircle3D, getCoordinateView3D,
  type CoordinateCircle3DDefinition
} from '../coord/view3d';
import { getAccentColor, initThemeSync } from '../shared/theme';

type PrimaryCircle3DDefinition = Exclude<CoordinateCircle3DDefinition, 'intersection'>;
type CircleValueMode = 'radius' | 'circumference' | 'area';

type Circle3DConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  definition: PrimaryCircle3DDefinition;
  pointNames: string[];
  vectorNames: string[];
  radius: number;
  lineColor: string;
  fillColor: string;
  radiusPointInPlane: boolean;
  textColor: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  showValue: boolean;
  valueMode: CircleValueMode;
  lineStyle: string;
  strokeWidth: number;
  layer: number;
  persistentId: string;
  language: 'de' | 'en';
};

const finiteNumber = (value: unknown, fallback: number): number => {
  if (value == null || String(value).trim() === '') return fallback;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const booleanOption = (value: unknown, fallback: boolean): boolean => {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (/^(?:1|true|yes|ja|on)$/.test(normalized)) return true;
  if (/^(?:0|false|no|nein|off)$/.test(normalized)) return false;
  return fallback;
};
const color = (value: unknown, fallback: string): string => {
  const result = String(value == null ? '' : value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(result) ? result : fallback;
};

function normalizeDefinition(value: unknown): PrimaryCircle3DDefinition {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('point') && normalized.includes('normal')) return 'center-normal-point';
  if (normalized.includes('radius') || normalized.includes('normal')) return 'center-normal-radius';
  return 'three-points';
}

function parseSpec(spec: string, definitionValue: string, languageValue?: string): Circle3DConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const definition = normalizeDefinition(definitionValue);
  const sourceCount = definition === 'three-points' ? 3 : (definition === 'center-normal-point' ? 3 : 2);
  const sourceNames = parts.slice(2, 2 + sourceCount);
  const trailing = parts.slice(2 + sourceCount);
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  trailing.forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) options[match[1].trim().toLowerCase()] = unquote(match[2].trim());
    else if (part) flags.add(part.toLowerCase());
  });
  const explicitColor = color(trailing.find(part => /^#[0-9a-f]{3,8}$/i.test(part)), getAccentColor());
  const opacityToken = trailing.find(part => /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(part));
  const nameSpec = parseMacroName(parts[1], 'k');
  const modeRaw = String(options.measure ?? options.mass ?? options.valuemode ?? options.wertart ?? 'radius').toLowerCase();
  const valueMode: CircleValueMode = modeRaw.startsWith('area') || modeRaw.startsWith('fl')
    ? 'area' : (modeRaw.startsWith('circ') || modeRaw.startsWith('umf') ? 'circumference' : 'radius');
  const visibleValue = options.visible ?? options.sichtbar;
  const fixedValue = options.fixed ?? options.fixiert;
  const valueValue = options.value ?? options.wert;
  return {
    boardId: parts[0] || 'A1',
    name: nameSpec.name,
    showName: nameSpec.showName && !flags.has('noname'),
    definition,
    pointNames: definition === 'three-points' ? sourceNames.slice(0, 3)
      : (definition === 'center-normal-point' ? [sourceNames[0], sourceNames[2]] : [sourceNames[0]]),
    vectorNames: definition === 'three-points' ? [] : [sourceNames[1]],
    radius: finiteNumber(options.radius ?? options.r, NaN),
    lineColor: color(options.linecolor ?? options.linienfarbe, explicitColor),
    fillColor: color(options.fillcolor ?? options.fuellfarbe, 'none'),
    radiusPointInPlane: definition === 'center-normal-point' && booleanOption(options.radiuspointinplane, false),
    textColor: color(options.textcolor ?? options.textfarbe, explicitColor),
    opacity: Math.max(0, Math.min(1, finiteNumber(options.opacity ?? options.deckkraft ?? opacityToken, 1))),
    visible: visibleValue == null ? !flags.has('hidden') : booleanOption(visibleValue, true),
    fixed: fixedValue == null ? flags.has('fix') || flags.has('fixed') : booleanOption(fixedValue, false),
    showValue: valueValue == null ? flags.has('value') || flags.has('wert') : booleanOption(valueValue, false),
    valueMode,
    lineStyle: parseLineStyle(options.linestyle ?? options.linienstil ?? 'solid') || 'solid',
    strokeWidth: Math.max(0.5, Math.min(20, finiteNumber(options.width ?? options.breite, 2))),
    layer: Math.max(0, Math.min(20, Math.round(finiteNumber(options.layer ?? options.ebene, 5)))),
    persistentId: String(options.objectid ?? options.objektid ?? '').trim(),
    language: String(languageValue || '').toLowerCase() === 'en' ? 'en' : 'de'
  };
}

function pointByName(boardId: string, name: string): any | null {
  const point = window.__points?.[boardId]?.[name];
  return point?.__liaPoint3D ? point : null;
}

function vectorByName(board: any, name: string): any | null {
  for (const object of Array.from(getCoordinateView3D(board)?.linearObjects || []) as any[]) {
    const objectName = String(object.__liaDgsVectorName || object.__liaSceneRecord?.name || object.name || '');
    if (object.__liaLinear3DKind === 'vector' && objectName === name) return object;
  }
  return null;
}

function formatted(value: number, language: 'de' | 'en'): string {
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round(value * 1000) / 1000;
  return (Number.isFinite(rounded) ? String(rounded) : '?').replace('.', language === 'de' ? '{,}' : '.');
}

function circleLabel(config: Circle3DConfig, object: any): string {
  const data = coordinateCircle3DData(object);
  const name = config.showName ? config.name : '';
  if (!config.showValue || !data) return name ? '\\(' + name + '\\)' : '';
  const value = config.valueMode === 'area' ? Math.PI * data.radius ** 2
    : (config.valueMode === 'circumference' ? 2 * Math.PI * data.radius : data.radius);
  const symbol = config.valueMode === 'area' ? 'A' : (config.valueMode === 'circumference' ? 'U' : 'r');
  return '\\(' + (name ? name + ':\\;' : '') + symbol + '=' + formatted(value, config.language) + '\\)';
}

function renderedParts(object: any): any[] {
  return [object, object?.curve, object?.element2D, object?.label].filter((value, index, all) => value && all.indexOf(value) === index);
}

function applyMetadata(object: any, config: Circle3DConfig, uid: string, points: any[], vectors: any[]): void {
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:circle3d:' + uid;
  object.__liaDgsPersistentId = config.persistentId || object.__liaDgsMacroKey;
  object.__liaDgsCircle3D = true;
  object.__liaDgsCircleName = config.name;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsShowValue = config.showValue;
  object.__liaDgsValueMode = config.valueMode;
  object.__liaDgsShowObject = config.visible;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLineColor = config.lineColor;
  object.__liaDgsFillColor = config.fillColor === 'none' ? config.lineColor : config.fillColor;
  object.__liaDgsTextColor = config.textColor;
  object.__liaDgsOpacity = config.opacity;
  object.__liaDgsLineStyle = config.lineStyle;
  object.__liaDgsSegmentStrokeWidth = config.strokeWidth;
  object.__liaDgsLayer = config.layer;
  object.__liaDgsLanguage = config.language;
  object.__liaCircle3DUserVisible = config.visible;
  object.__liaCircle3DSourcePoints = points;
  object.__liaCircle3DSourceVectors = vectors;
  renderedParts(object).forEach(part => {
    try {
      part.setAttribute?.({
        strokeColor: config.lineColor, highlightStrokeColor: config.lineColor,
        strokeOpacity: config.visible ? (config.fillColor === 'none' ? config.opacity : 1) : 0,
        fillColor: config.fillColor, highlightFillColor: config.fillColor,
        fillOpacity: config.visible && config.fillColor !== 'none' ? config.opacity : 0,
        highlightFillOpacity: config.visible && config.fillColor !== 'none' ? config.opacity : 0,
        highlightStrokeOpacity: config.visible ? (config.fillColor === 'none' ? config.opacity : 1) : 0,
        strokeWidth: config.strokeWidth, highlightStrokeWidth: config.strokeWidth + 1,
        fixed: config.fixed, layer: config.layer
      });
      applyLineStyle(part, config.lineStyle);
    } catch (e) {}
  });
  try { object.setAttribute?.({ name: circleLabel(config, object), withLabel: true }); } catch (e) {}
  if (object.label) {
    try {
      object.label.setText?.(() => circleLabel(config, object));
      object.label.setAttribute?.({
        visible: config.visible && (config.showName || config.showValue),
        strokeColor: config.textColor, fillColor: config.textColor,
        fontSize: 18, parse: false, useMathJax: true
      });
    } catch (e) {}
  }
  if (object.__liaSceneRecord) {
    Object.assign(object.__liaSceneRecord, {
      id: object.__liaDgsPersistentId, name: config.name, visible: config.visible, fixed: config.fixed,
      definition: config.definition,
      pointIds: points.map(point => String(point.__liaDgsPersistentId || point.__liaDgsPointName || point.name || '')),
      vectorIds: vectors.map(vector => String(vector.__liaDgsPersistentId || vector.__liaDgsVectorName || vector.name || '')),
      ...(config.definition === 'center-normal-radius' ? { radius: config.radius } : {}),
      style: {
        lineColor: config.lineColor, fillColor: config.fillColor, textColor: config.textColor, opacity: config.opacity,
        lineStyle: config.lineStyle, strokeWidth: config.strokeWidth,
        showName: config.showName, showValue: config.showValue, valueMode: config.valueMode, layer: config.layer
      }
    });
  }
}

function sameSources(object: any, config: Circle3DConfig, points: any[], vectors: any[]): boolean {
  return object?.__liaCircle3DDefinition === config.definition &&
    (object.__liaCircle3DConstrainRadiusPoint === true) === config.radiusPointInPlane &&
    points.length === object.__liaCircle3DSourcePoints?.length &&
    vectors.length === object.__liaCircle3DSourceVectors?.length &&
    points.every((point, index) => object.__liaCircle3DSourcePoints[index] === point) &&
    vectors.every((vector, index) => object.__liaCircle3DSourceVectors[index] === vector) &&
    (config.definition !== 'center-normal-radius' || Number(object.__liaCircle3DRadiusSource) === config.radius);
}

function removeEntry(key: string): void {
  const entry = window.__circle3DEntries?.[key];
  if (!entry) return;
  try { entry.object?.__liaCircle3DCleanup?.(); } catch (e) {}
  try { entry.board?.removeObject?.(entry.object); } catch (e) {}
  delete window.__circle3DEntries![key];
}

function createOrUpdate(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, definitionValue, language)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const config = parseSpec(spec, definitionValue, language);
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') return false;
  if (config.definition === 'center-normal-radius' && !(config.radius > 0)) return false;
  const points = config.pointNames.map(name => pointByName(config.boardId, name));
  const vectors = config.vectorNames.map(name => vectorByName(board, name));
  if (points.some(point => !point) || vectors.some(vector => !vector)) return false;
  const key = String(uid);
  const previous = window.__circle3DEntries?.[key];
  const reusable = !!previous && previous.board === board && sameSources(previous.object, config, points, vectors);
  // Geometry evaluators track moving sources; unchanged author configuration
  // needs no repeated style updates or expensive scene/depth redraws.
  if (reusable && previous.spec === spec && JSON.stringify(previous.config) === JSON.stringify(config)) return true;
  let object = reusable ? previous.object : null;
  const resume = !board.isSuspendedUpdate;
  if (resume) board.suspendUpdate?.();
  try {
    if (!reusable && previous) removeEntry(key);
    if (!object) {
      object = createCoordinateCircle3D(
        board, config.definition, points, vectors,
        config.definition === 'center-normal-radius' ? config.radius : undefined,
        {
          name: config.name, withLabel: true, strokeColor: config.lineColor,
          strokeOpacity: config.fillColor === 'none' ? config.opacity : 1, strokeWidth: config.strokeWidth,
          fillColor: config.fillColor, fillOpacity: config.fillColor === 'none' ? 0 : config.opacity,
          constrainRadiusPoint: config.radiusPointInPlane,
          label: { strokeColor: config.textColor, fontSize: 18, parse: false, useMathJax: true }
        }
      );
    }
    applyMetadata(object, config, uid, points, vectors);
    window.__circle3DEntries![key] = { board, boardId: config.boardId, object, config, spec, definition: config.definition, language };
    return true;
  } catch (e) {
    return false;
  } finally {
    if (resume) { try { board.unsuspendUpdate?.(); } catch (e) {} }
  }
}

export function init(): void {
  if (window.__circle3DReady) {
    window.__scheduleBootstrapCircle3D?.();
    return;
  }
  window.__circle3DReady = true;
  window.__circle3DEntries = window.__circle3DEntries || {};
  initThemeSync();
  let pending = false;
  window.renderCircle3DFromSpec = createOrUpdate;
  window.__bootstrapCircle3D = () => {
    pending = false;
    const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="circle3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('circle3d-spec-'.length);
      active.add(uid);
      if (!createOrUpdate(uid, marker.dataset.spec || '', marker.dataset.definition || 'three-points', marker.dataset.language || 'de')) pending = true;
    });
    Object.keys(window.__circle3DEntries || {}).forEach(key => { if (!active.has(key)) removeEntry(key); });
    window.__scheduleBootstrapSphere3D?.();
    window.__scheduleBootstrapIntersection3D?.();
    window.__scheduleBootstrapPoint3D?.();
  };
  window.__scheduleBootstrapCircle3D = () => {
    if (window.__bootstrapCircle3DRAF) return;
    window.__bootstrapCircle3DRAF = requestAnimationFrame(() => {
      window.__bootstrapCircle3DRAF = 0;
      window.__bootstrapCircle3D?.();
    });
  };
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => record.type === 'attributes'
      ? (record.target as Element)?.id?.startsWith('circle3d-spec-')
      : Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
          node.nodeType === 1 && ((node as Element).id?.startsWith('circle3d-spec-') ||
            !!(node as Element).querySelector?.('[id^="circle3d-spec-"]'))));
    if (relevant) window.__scheduleBootstrapCircle3D?.();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-spec', 'data-definition', 'data-language']
  });
  window.__circle3DObserver = observer;
  scheduleBootstrap(() => window.__scheduleBootstrapCircle3D?.());
  window.setTimeout(() => { if (pending) window.__scheduleBootstrapCircle3D?.(); }, 180);
}
