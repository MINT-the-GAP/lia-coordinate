import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { applyLineStyle, parseLineStyle } from '../shared/lineStyle';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinateSphere3DData, createCoordinateSphere3D, type CoordinateSphere3DDefinition
} from '../coord/view3d';
import { getAccentColor, initThemeSync } from '../shared/theme';

type SphereValueMode = 'radius' | 'surface' | 'volume';

type Sphere3DConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  definition: CoordinateSphere3DDefinition;
  pointNames: string[];
  radius: number;
  lineColor: string;
  fillColor: string;
  textColor: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  showValue: boolean;
  valueMode: SphereValueMode;
  lineStyle: string;
  strokeWidth: number;
  layer: number;
  persistentId: string;
  language: 'de' | 'en';
};

const finiteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(String(value == null ? '' : value).trim().replace(',', '.'));
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

function normalizeDefinition(value: unknown): CoordinateSphere3DDefinition {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('four') || normalized.includes('vier')) return 'four-points';
  if (normalized.includes('radius')) return 'center-radius';
  return 'center-point';
}

function parseSpec(spec: string, definitionValue: string, languageValue?: string): Sphere3DConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const definition = normalizeDefinition(definitionValue);
  const sourceCount = definition === 'four-points' ? 4 : (definition === 'center-point' ? 2 : 1);
  const pointNames = parts.slice(2, 2 + sourceCount);
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
  const nameSpec = parseMacroName(parts[1], 'S');
  const modeRaw = String(options.measure ?? options.mass ?? options.valuemode ?? options.wertart ?? 'radius').toLowerCase();
  const valueMode: SphereValueMode = modeRaw.startsWith('vol')
    ? 'volume' : (modeRaw.startsWith('surf') || modeRaw.startsWith('ober') ? 'surface' : 'radius');
  const visibleValue = options.visible ?? options.sichtbar;
  const fixedValue = options.fixed ?? options.fixiert;
  const valueValue = options.value ?? options.wert;
  const lineColor = color(options.linecolor ?? options.linienfarbe, explicitColor);
  return {
    boardId: parts[0] || 'A1',
    name: nameSpec.name,
    showName: nameSpec.showName && !flags.has('noname'),
    definition,
    pointNames,
    radius: finiteNumber(options.radius ?? options.r, NaN),
    lineColor,
    fillColor: color(options.fillcolor ?? options.fuellfarbe, lineColor),
    textColor: color(options.textcolor ?? options.textfarbe, explicitColor),
    opacity: Math.max(0, Math.min(1, finiteNumber(options.opacity ?? options.deckkraft ?? opacityToken, 0.2))),
    visible: visibleValue == null ? !flags.has('hidden') : booleanOption(visibleValue, true),
    fixed: fixedValue == null ? flags.has('fix') || flags.has('fixed') : booleanOption(fixedValue, false),
    showValue: valueValue == null ? flags.has('value') || flags.has('wert') : booleanOption(valueValue, false),
    valueMode,
    lineStyle: parseLineStyle(options.linestyle ?? options.linienstil ?? 'solid') || 'solid',
    strokeWidth: Math.max(0.5, Math.min(20, finiteNumber(options.width ?? options.breite, 2))),
    layer: Math.max(0, Math.min(20, Math.round(finiteNumber(options.layer ?? options.ebene, 3)))),
    persistentId: String(options.objectid ?? options.objektid ?? '').trim(),
    language: String(languageValue || '').toLowerCase() === 'en' ? 'en' : 'de'
  };
}

function pointByName(boardId: string, name: string): any | null {
  const point = window.__points?.[boardId]?.[name];
  return point?.__liaPoint3D ? point : null;
}

function formatted(value: number, language: 'de' | 'en'): string {
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round(value * 1000) / 1000;
  return (Number.isFinite(rounded) ? String(rounded) : '?').replace('.', language === 'de' ? '{,}' : '.');
}

function sphereLabel(config: Sphere3DConfig, object: any): string {
  const data = coordinateSphere3DData(object);
  const name = config.showName ? config.name : '';
  if (!config.showValue || !data) return name ? '\\(' + name + '\\)' : '';
  const value = config.valueMode === 'surface' ? 4 * Math.PI * data.radius ** 2
    : (config.valueMode === 'volume' ? (4 / 3) * Math.PI * data.radius ** 3 : data.radius);
  const symbol = config.valueMode === 'surface' ? 'A' : (config.valueMode === 'volume' ? 'V' : 'r');
  return '\\(' + (name ? name + ':\\;' : '') + symbol + '=' + formatted(value, config.language) + '\\)';
}

function renderedParts(object: any): any[] {
  const guides = Array.isArray(object?.__liaSphere3DGuideCurves)
    ? object.__liaSphere3DGuideCurves : [];
  return [
    object, object?.element2D, ...(object?.aux2D || []),
    ...guides, ...guides.map((guide: any) => guide?.element2D), object?.label
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

function applyMetadata(object: any, config: Sphere3DConfig, uid: string, points: any[]): void {
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:sphere3d:' + uid;
  object.__liaDgsPersistentId = config.persistentId || object.__liaDgsMacroKey;
  object.__liaDgsSphere3D = true;
  object.__liaDgsSphereName = config.name;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsShowValue = config.showValue;
  object.__liaDgsValueMode = config.valueMode;
  object.__liaDgsShowObject = config.visible;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLineColor = config.lineColor;
  object.__liaDgsFillColor = config.fillColor;
  object.__liaDgsTextColor = config.textColor;
  object.__liaDgsOpacity = config.opacity;
  object.__liaDgsLineStyle = config.lineStyle;
  object.__liaDgsSegmentStrokeWidth = config.strokeWidth;
  object.__liaDgsLayer = config.layer;
  object.__liaDgsLanguage = config.language;
  object.__liaSphere3DUserVisible = config.visible;
  object.__liaSphere3DSourcePoints = points;
  renderedParts(object).forEach(part => {
    if (part.__liaSphere3DGuide) {
      try { part.setAttribute?.({ layer: config.layer }); } catch (e) {}
      return;
    }
    try {
      part.setAttribute?.({
        strokeColor: config.lineColor, highlightStrokeColor: config.lineColor,
        fillColor: config.fillColor, highlightFillColor: config.fillColor,
        strokeOpacity: config.visible ? Math.max(0.25, config.opacity) : 0,
        highlightStrokeOpacity: config.visible ? Math.max(0.25, config.opacity) : 0,
        fillOpacity: config.visible ? config.opacity : 0,
        highlightFillOpacity: config.visible ? Math.min(1, config.opacity + 0.1) : 0,
        strokeWidth: config.strokeWidth, highlightStrokeWidth: config.strokeWidth + 1,
        fixed: config.fixed, layer: config.layer
      });
      applyLineStyle(part, config.lineStyle);
    } catch (e) {}
  });
  try { object.setAttribute?.({ name: sphereLabel(config, object), withLabel: true }); } catch (e) {}
  if (object.label) {
    try {
      object.label.setText?.(() => sphereLabel(config, object));
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
      ...(config.definition === 'center-radius' ? { radius: config.radius } : {}),
      style: {
        lineColor: config.lineColor, fillColor: config.fillColor, textColor: config.textColor,
        opacity: config.opacity, lineStyle: config.lineStyle, strokeWidth: config.strokeWidth,
        showName: config.showName, showValue: config.showValue, valueMode: config.valueMode, layer: config.layer
      }
    });
  }
}

function sameSources(object: any, config: Sphere3DConfig, points: any[]): boolean {
  return object?.__liaSphere3DDefinition === config.definition &&
    points.length === object.__liaSphere3DSourcePoints?.length &&
    points.every((point, index) => object.__liaSphere3DSourcePoints[index] === point) &&
    (config.definition !== 'center-radius' || Number(object.__liaSphere3DRadiusSource) === config.radius);
}

function removeEntry(key: string): void {
  const entry = window.__sphere3DEntries?.[key];
  if (!entry) return;
  try { entry.object?.__liaSphere3DCleanup?.(); } catch (e) {}
  try { entry.board?.removeObject?.(entry.object); } catch (e) {}
  delete window.__sphere3DEntries![key];
}

function createOrUpdate(uid: string, spec: string, definitionValue: string, language?: string, deferUpdate = false): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, definitionValue, language, deferUpdate)) === true;
}

function createOrUpdateSpatial(
  uid: string,
  spec: string,
  definitionValue: string,
  language?: string,
  deferUpdate = false
): boolean {
  const config = parseSpec(spec, definitionValue, language);
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') return false;
  if (config.definition === 'center-radius' && !(config.radius > 0)) return false;
  const points = config.pointNames.map(name => pointByName(config.boardId, name));
  if (points.some(point => !point)) return false;
  const key = String(uid);
  const previous = window.__sphere3DEntries?.[key];
  const reusable = !!previous && previous.board === board && sameSources(previous.object, config, points);
  if (reusable && previous.spec === spec && previous.definition === config.definition &&
      previous.language === language) return true;
  let object = reusable ? previous.object : null;
  if (!reusable && previous) removeEntry(key);
  try {
    if (!object) {
      object = createCoordinateSphere3D(
        board, config.definition, points,
        config.definition === 'center-radius' ? config.radius : undefined,
        {
          name: config.name, withLabel: true,
          strokeColor: config.lineColor, fillColor: config.fillColor,
          strokeOpacity: config.opacity, fillOpacity: config.opacity,
          strokeWidth: config.strokeWidth,
          label: { strokeColor: config.textColor, fontSize: 18, parse: false, useMathJax: true }
        }
      );
    }
    applyMetadata(object, config, uid, points);
    window.__sphere3DEntries![key] = {
      board, boardId: config.boardId, object, config, spec,
      definition: config.definition, language
    };
    if (!deferUpdate) {
      try { board.fullUpdate?.(); } catch (e) { try { board.update?.(); } catch (e2) {} }
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function init(): void {
  if (window.__sphere3DReady) {
    window.__scheduleBootstrapSphere3D?.();
    return;
  }
  window.__sphere3DReady = true;
  window.__sphere3DEntries = window.__sphere3DEntries || {};
  initThemeSync();
  let pending = false;
  window.renderSphere3DFromSpec = createOrUpdate;
  window.__bootstrapSphere3D = () => {
    pending = false;
    const active = new Set<string>();
    const boardsToUpdate = new Set<any>();
    document.querySelectorAll<HTMLElement>('[id^="sphere3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('sphere3d-spec-'.length);
      active.add(uid);
      const before = window.__sphere3DEntries?.[uid];
      const definition = marker.dataset.definition || 'center-point';
      const language = marker.dataset.language || 'de';
      if (!createOrUpdate(uid, marker.dataset.spec || '', definition, language, true)) {
        pending = true;
        return;
      }
      const after = window.__sphere3DEntries?.[uid];
      if (after && (!before || before.object !== after.object || before.spec !== after.spec ||
          before.definition !== after.definition || before.language !== after.language)) {
        boardsToUpdate.add(after.board);
      }
    });
    Object.keys(window.__sphere3DEntries || {}).forEach(key => {
      if (!active.has(key)) removeEntry(key);
    });
    boardsToUpdate.forEach(board => {
      try { board.fullUpdate?.(); } catch (e) { try { board.update?.(); } catch (e2) {} }
    });
    window.__scheduleBootstrapIntersection3D?.();
    window.__scheduleBootstrapPoint3D?.();
  };
  window.__scheduleBootstrapSphere3D = () => {
    if (window.__bootstrapSphere3DRAF) return;
    window.__bootstrapSphere3DRAF = requestAnimationFrame(() => {
      window.__bootstrapSphere3DRAF = 0;
      window.__bootstrapSphere3D?.();
    });
  };
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => record.type === 'attributes'
      ? (record.target as Element)?.id?.startsWith('sphere3d-spec-')
      : Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
          node.nodeType === 1 && ((node as Element).id?.startsWith('sphere3d-spec-') ||
            !!(node as Element).querySelector?.('[id^="sphere3d-spec-"]'))));
    if (relevant) window.__scheduleBootstrapSphere3D?.();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-spec', 'data-definition', 'data-language']
  });
  window.__sphere3DObserver = observer;
  scheduleBootstrap(() => window.__scheduleBootstrapSphere3D?.());
  window.setTimeout(() => { if (pending) window.__scheduleBootstrapSphere3D?.(); }, 180);
}
