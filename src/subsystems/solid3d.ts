import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { applyLineStyle, parseLineStyle } from '../shared/lineStyle';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinatePolygon3DData, coordinateSolid3DData,
  createCoordinatePolygon3D, createCoordinateSolid3D, getCoordinateView3D,
  point3DCoordinates, type CoordinateSolid3DDefinition
} from '../coord/view3d';
import { getAccentColor, initThemeSync } from '../shared/theme';

type SolidValueMode = 'volume' | 'surface' | 'base' | 'height' | 'area' | 'perimeter';

type Object3DConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  definition: 'polygon' | CoordinateSolid3DDefinition;
  sourceNames: string[];
  radius: number;
  lineColor: string;
  fillColor: string;
  textColor: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  showValue: boolean;
  valueMode: SolidValueMode;
  lineStyle: string;
  strokeWidth: number;
  layer: number;
  persistentId: string;
  language: 'de' | 'en';
};

const finiteNumber = (value: unknown, fallback: number): number => {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (/^(?:1|true|yes|ja|on)$/.test(normalized)) return true;
  if (/^(?:0|false|no|nein|off)$/.test(normalized)) return false;
  return fallback;
};
const validColor = (value: unknown, fallback: string): string => {
  const result = String(value == null ? '' : value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(result) ? result : fallback;
};

function normalizeDefinition(value: unknown): Object3DConfig['definition'] {
  const token = String(value || '').toLowerCase();
  if (token.includes('polygon') || token.includes('vieleck')) return 'polygon';
  if (token.includes('tetra')) return 'tetrahedron';
  if (token.includes('pyramid')) return 'pyramid';
  if (token.includes('prism')) return 'prism';
  if (token.includes('parallel')) return 'parallelepiped';
  if (token.includes('cuboid') || token.includes('quader')) return 'cuboid';
  if (token.includes('cyl') || token.includes('zyl')) return 'cylinder';
  if (token.includes('cone') || token.includes('kegel')) return 'cone';
  return 'polygon';
}

function sourceCount(definition: Object3DConfig['definition']): number {
  if (definition === 'tetrahedron') return 4;
  if (definition === 'pyramid' || definition === 'prism') return 2;
  if (definition === 'parallelepiped' || definition === 'cuboid') return 4;
  if (definition === 'cylinder' || definition === 'cone') return 3;
  return Number.POSITIVE_INFINITY;
}

function parseSpec(spec: string, definitionValue: string, languageValue?: string): Object3DConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const definition = normalizeDefinition(definitionValue);
  const trailing = parts.slice(2);
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  const positional: string[] = [];
  trailing.forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) options[match[1].trim().toLowerCase()] = unquote(match[2].trim());
    else if (/^#[0-9a-f]{3,8}$/i.test(part)) {
      if (!options.linecolor) options.linecolor = part;
      else if (!options.fillcolor) options.fillcolor = part;
    } else if (/^(?:hidden|noname|value|wert|fix|fixed)$/i.test(part)) flags.add(part.toLowerCase());
    else if (part) positional.push(part);
  });
  const wanted = sourceCount(definition);
  const sources = positional.slice(0, wanted);
  let radius = finiteNumber(options.radius ?? options.r, NaN);
  if ((definition === 'cylinder' || definition === 'cone') && sources.length >= 3) {
    const numeric = finiteNumber(sources[2], NaN);
    if (Number.isFinite(numeric)) {
      radius = numeric;
      sources.splice(2, 1);
    }
  }
  const accent = getAccentColor();
  const nameSpec = parseMacroName(parts[1], definition === 'polygon' ? 'P' : 'K');
  const visibleOption = options.visible ?? options.sichtbar;
  const fixedOption = options.fixed ?? options.fixiert;
  const valueOption = options.value ?? options.wert;
  const mode = String(options.measure ?? options.mass ?? options.valuemode ?? options.wertart ??
    (definition === 'polygon' ? 'area' : 'volume')).toLowerCase();
  const valueMode: SolidValueMode =
    mode.startsWith('ober') || mode.startsWith('surf') ? 'surface' :
    mode.startsWith('grund') || mode.startsWith('base') ? 'base' :
    mode.startsWith('h') || mode.startsWith('höhe') || mode.startsWith('height') ? 'height' :
    mode.startsWith('umfang') || mode.startsWith('per') ? 'perimeter' :
    mode.startsWith('area') || mode.startsWith('fl') ? 'area' : 'volume';
  return {
    boardId: parts[0] || 'A1',
    name: nameSpec.name,
    showName: nameSpec.showName && !flags.has('noname'),
    definition,
    sourceNames: sources,
    radius,
    lineColor: validColor(options.linecolor ?? options.linienfarbe, accent),
    fillColor: validColor(options.fillcolor ?? options.fuellfarbe ?? options.füllfarbe, accent),
    textColor: validColor(options.textcolor ?? options.textfarbe, accent),
    opacity: Math.max(0, Math.min(1, finiteNumber(options.opacity ?? options.deckkraft, 0.25))),
    visible: visibleOption == null ? !flags.has('hidden') : bool(visibleOption, true),
    fixed: fixedOption == null ? flags.has('fix') || flags.has('fixed') : bool(fixedOption, true),
    showValue: valueOption == null ? flags.has('value') || flags.has('wert') : bool(valueOption, false),
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
function objectName(object: any): string {
  return String(object?.__liaDgsPolygon3DName || object?.__liaDgsSolid3DName ||
    object?.__liaDgsVectorName || object?.__liaSceneRecord?.name || object?.name || '')
    .replace(/\\\(|\\\)|\$/g, '').trim();
}
function vectorByName(board: any, name: string): any | null {
  return (Array.from(getCoordinateView3D(board)?.linearObjects || []) as any[])
    .find(object => object.__liaLinear3DKind === 'vector' && objectName(object) === name) || null;
}
function polygonByName(board: any, name: string): any | null {
  return (Array.from(getCoordinateView3D(board)?.polygonObjects || []) as any[])
    .find(object => objectName(object) === name) || null;
}
function renderedParts(object: any): any[] {
  const parts: any[] = [object, object?.element2D, object?.label];
  (object?.faces || []).forEach((face: any) => parts.push(face, face?.element2D));
  (object?.borders || []).forEach((border: any) => parts.push(border, border?.element2D));
  (object?.__liaSolid3DGuideCurves || []).forEach((guide: any) => parts.push(guide, guide?.element2D));
  return parts.filter((item, index, all) => item && all.indexOf(item) === index);
}
function formatted(value: number, language: 'de' | 'en'): string {
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round(value * 1000) / 1000;
  return String(rounded).replace('.', language === 'de' ? '{,}' : '.');
}
function measuredValue(config: Object3DConfig, object: any): { symbol: string; value: number } | null {
  if (config.definition === 'polygon') {
    const data = coordinatePolygon3DData(object);
    if (!data) return null;
    return config.valueMode === 'perimeter'
      ? { symbol: 'U', value: data.perimeter }
      : { symbol: 'A', value: data.area };
  }
  const data: any = coordinateSolid3DData(object);
  if (!data) return null;
  if (config.valueMode === 'surface') return { symbol: 'O', value: data.surfaceArea };
  if (config.valueMode === 'base') return { symbol: 'G', value: data.baseArea ?? 0 };
  if (config.valueMode === 'height') return { symbol: 'h', value: data.height ?? 0 };
  return { symbol: 'V', value: data.volume };
}
function label(config: Object3DConfig, object: any): string {
  const name = config.showName ? config.name : '';
  const metric = config.showValue ? measuredValue(config, object) : null;
  if (!metric) return name ? '\\(' + name + '\\)' : '';
  return '\\(' + (name ? name + ':\\;' : '') + metric.symbol + '=' + formatted(metric.value, config.language) + '\\)';
}

type ResolvedSources = { points: any[]; vectors: any[]; polygon: any | null };
function resolveSources(board: any, config: Object3DConfig): ResolvedSources | null {
  if (config.definition === 'polygon' || config.definition === 'tetrahedron') {
    const points = config.sourceNames.map(name => pointByName(config.boardId, name));
    return points.every(Boolean) ? { points, vectors: [], polygon: null } : null;
  }
  if (config.definition === 'pyramid') {
    const polygon = polygonByName(board, config.sourceNames[0]);
    const apex = pointByName(config.boardId, config.sourceNames[1]);
    return polygon && apex ? { points: [apex], vectors: [], polygon } : null;
  }
  if (config.definition === 'prism') {
    const polygon = polygonByName(board, config.sourceNames[0]);
    const vector = vectorByName(board, config.sourceNames[1]);
    return polygon && vector ? { points: [], vectors: [vector], polygon } : null;
  }
  if (config.definition === 'parallelepiped' || config.definition === 'cuboid') {
    const point = pointByName(config.boardId, config.sourceNames[0]);
    const vectors = config.sourceNames.slice(1, 4).map(name => vectorByName(board, name));
    return point && vectors.every(Boolean) ? { points: [point], vectors, polygon: null } : null;
  }
  const points = config.sourceNames.map(name => pointByName(config.boardId, name));
  const validRadius = points.length >= 3 || config.radius > 0;
  return points.length >= 2 && points.every(Boolean) && validRadius
    ? { points, vectors: [], polygon: null } : null;
}
function sameSources(object: any, config: Object3DConfig, sources: ResolvedSources): boolean {
  if (config.definition === 'polygon') {
    return object?.__liaPolygon3DSourcePoints?.length === sources.points.length &&
      sources.points.every((point, index) => object.__liaPolygon3DSourcePoints[index] === point);
  }
  return object?.__liaSolid3DDefinition === config.definition &&
    sources.points.every((point, index) => object.__liaSolid3DSourcePoints?.[index] === point) &&
    sources.vectors.every((vector, index) => object.__liaSolid3DSourceVectors?.[index] === vector) &&
    object?.__liaSolid3DSourcePolygon === sources.polygon &&
    // Only round solids have a radius. Comparing the absent NaN values for a
    // prism, pyramid or box would recreate its entire mesh on every bootstrap.
    ((config.definition !== 'cylinder' && config.definition !== 'cone') ||
      sources.points.length >= 3 || Number(object?.__liaSolid3DRadiusSource) === config.radius);
}
function stableId(source: any): string {
  return String(source?.__liaDgsPersistentId || source?.__liaSceneRecord?.id ||
    source?.__liaDgsPointName || source?.__liaDgsVectorName ||
    source?.__liaDgsPolygon3DName || source?.name || '');
}
function applyMetadata(object: any, config: Object3DConfig, uid: string, sources: ResolvedSources): void {
  const polygon = config.definition === 'polygon';
  const kind = polygon ? 'polygon3d' : 'solid3d';
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:' + kind + ':' + uid;
  object.__liaDgsPersistentId = config.persistentId || object.__liaDgsMacroKey;
  object.__liaDgsPolygon3D = polygon;
  object.__liaDgsSolid3D = !polygon;
  object.__liaDgsPolygon3DName = polygon ? config.name : undefined;
  object.__liaDgsSolid3DName = polygon ? undefined : config.name;
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
  if (polygon) object.__liaPolygon3DUserVisible = config.visible;
  else object.__liaSolid3DUserVisible = config.visible;
  const board = object.board;
  const suspendAppearance = board && !board.isSuspendedUpdate &&
    typeof board.suspendUpdate === 'function' && typeof board.unsuspendUpdate === 'function';
  if (suspendAppearance) board.suspendUpdate();
  try {
    renderedParts(object).forEach(part => {
      try {
        part.setAttribute?.({
          strokeColor: config.lineColor, highlightStrokeColor: config.lineColor,
          fillColor: config.fillColor, highlightFillColor: config.fillColor,
          strokeOpacity: config.visible ? 1 : 0,
          highlightStrokeOpacity: config.visible ? 1 : 0,
          fillOpacity: config.visible ? config.opacity : 0,
          highlightFillOpacity: config.visible ? Math.min(1, config.opacity + 0.12) : 0,
          strokeWidth: config.strokeWidth, fixed: config.fixed, layer: config.layer
        });
        applyLineStyle(part, config.lineStyle);
      } catch (e) {}
    });
    try { object.setAttribute?.({ name: label(config, object), withLabel: false }); } catch (e) {}
    try {
      object.label?.setText?.(() => label(config, object));
      object.label?.setAttribute?.({
        visible: config.visible && (config.showName || config.showValue),
        strokeColor: config.textColor, fillColor: config.textColor,
        fontSize: 18, parse: false, useMathJax: true
      });
    } catch (e) {}
  } finally {
    if (suspendAppearance) board.unsuspendUpdate();
  }
  if (object.__liaSceneRecord) Object.assign(object.__liaSceneRecord, {
    id: object.__liaDgsPersistentId, name: config.name, visible: config.visible, fixed: config.fixed,
    definition: config.definition,
    pointIds: sources.points.map(stableId),
    vectorIds: sources.vectors.map(stableId),
    ...(sources.polygon ? { polygonId: stableId(sources.polygon) } : {}),
    ...(Number.isFinite(config.radius) ? { radius: config.radius } : {}),
    style: {
      lineColor: config.lineColor, fillColor: config.fillColor, textColor: config.textColor,
      opacity: config.opacity, lineStyle: config.lineStyle, strokeWidth: config.strokeWidth,
      showName: config.showName, showValue: config.showValue, valueMode: config.valueMode, layer: config.layer
    }
  });
}
function removeEntry(key: string): void {
  const entry = window.__solid3DEntries?.[key];
  if (!entry) return;
  const object = entry.object;
  try { object?.__liaPolygon3DCleanup?.(); } catch (e) {}
  try { object?.__liaSolid3DCleanup?.(); } catch (e) {}
  try { entry.board?.removeObject?.(object); } catch (e) {}
  delete window.__solid3DEntries![key];
}
function createOrUpdate(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, definitionValue, language)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const config = parseSpec(spec, definitionValue, language);
  const key = String(uid);
  const previous = window.__solid3DEntries?.[key];
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') {
    if (previous) removeEntry(key);
    return false;
  }
  const sources = resolveSources(board, config);
  if (!sources) {
    if (previous) removeEntry(key);
    return false;
  }
  const reusable = !!previous && previous.board === board && sameSources(previous.object, config, sources);
  // An unchanged macro must retain learner edits and avoid another full board render.
  if (reusable && previous.spec === spec && JSON.stringify(previous.config) === JSON.stringify(config)) return true;
  let object = reusable ? previous.object : null;
  if (!reusable && previous) removeEntry(key);
  try {
    if (!object) {
      const attributes = {
        name: config.name, withLabel: config.showName || config.showValue,
        strokeColor: config.lineColor, fillColor: config.fillColor,
        strokeOpacity: config.visible ? 1 : 0,
        fillOpacity: config.visible ? config.opacity : 0,
        strokeWidth: config.strokeWidth, fixed: config.fixed
      };
      object = config.definition === 'polygon'
        ? createCoordinatePolygon3D(board, sources.points, attributes)
        : createCoordinateSolid3D(
            board, config.definition, sources.points, sources.vectors,
            sources.polygon || undefined,
            sources.points.length >= 3 ? undefined : config.radius,
            attributes
          );
    } else if (!Number.isNaN(config.radius)) {
      object.__liaSolid3DSetRadius?.(config.radius);
    }
    applyMetadata(object, config, uid, sources);
    window.__solid3DEntries![key] = { board, boardId: config.boardId, object, config, spec, definition: config.definition, language };
    board.fullUpdate?.();
    return true;
  } catch (e) {
    return false;
  }
}

export function init(): void {
  if (window.__solid3DReady) {
    window.__scheduleBootstrapSolid3D?.();
    return;
  }
  window.__solid3DReady = true;
  window.__solid3DEntries = window.__solid3DEntries || {};
  initThemeSync();
  window.renderSolid3DFromSpec = createOrUpdate;
  let dependencyRetryCount = 0;
  let dependencyRetryTimer = 0;
  window.__bootstrapSolid3D = () => {
    let pending = false;
    const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="polygon3d-spec-"],[id^="solid3d-spec-"]').forEach(marker => {
      const polygon = marker.id.startsWith('polygon3d-spec-');
      const prefix = polygon ? 'polygon3d-spec-' : 'solid3d-spec-';
      const uid = marker.id.slice(prefix.length);
      const key = (polygon ? 'polygon:' : 'solid:') + uid;
      active.add(key);
      if (!createOrUpdate(key, marker.dataset.spec || '', polygon ? 'polygon' : (marker.dataset.definition || ''), marker.dataset.language)) pending = true;
    });
    Object.keys(window.__solid3DEntries || {}).forEach(key => { if (!active.has(key)) removeEntry(key); });
    window.__scheduleBootstrapTransformation3D?.();
    window.__scheduleBootstrapIntersection3D?.();
    window.__scheduleBootstrapPoint3D?.();
    if (!pending) dependencyRetryCount = 0;
    else if (dependencyRetryCount < 24 && !dependencyRetryTimer) {
      dependencyRetryCount += 1;
      dependencyRetryTimer = window.setTimeout(() => {
        dependencyRetryTimer = 0;
        window.__scheduleBootstrapSolid3D?.();
      }, 160);
    }
  };
  window.__scheduleBootstrapSolid3D = () => {
    if (window.__bootstrapSolid3DRAF) return;
    window.__bootstrapSolid3DRAF = requestAnimationFrame(() => {
      window.__bootstrapSolid3DRAF = 0;
      window.__bootstrapSolid3D?.();
    });
  };
  window.__solid3DObserver = new MutationObserver(records => {
    const relevant = records.some(record => record.type === 'attributes'
      ? /^(?:polygon|solid)3d-spec-/.test((record.target as Element)?.id || '')
      : Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
          node.nodeType === 1 && (
            /^(?:polygon|solid)3d-spec-/.test((node as Element).id || '') ||
            !!(node as Element).querySelector?.('[id^="polygon3d-spec-"],[id^="solid3d-spec-"]')
          )));
    if (relevant) {
      dependencyRetryCount = 0;
      if (dependencyRetryTimer) { window.clearTimeout(dependencyRetryTimer); dependencyRetryTimer = 0; }
      window.__scheduleBootstrapSolid3D?.();
    }
  });
  window.__solid3DObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-spec', 'data-definition', 'data-language']
  });
  scheduleBootstrap(() => window.__scheduleBootstrapSolid3D?.());
}
