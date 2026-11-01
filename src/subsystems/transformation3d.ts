import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { applyLineStyle, parseLineStyle } from '../shared/lineStyle';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinateLinear3DData, coordinatePlane3DData, coordinateVector3DComponents,
  getCoordinateView3D, point3DCoordinates
} from '../coord/view3d';
import { createCoordinateTransformedObject3D } from '../coord/transform3dObjects';
import {
  axisRotationTransform3D, dilationTransform3D, lineReflectionTransform3D,
  planeReflectionTransform3D, pointReflectionTransform3D, translationTransform3D,
  type SimilarityTransform3D
} from '../shared/transform3d';
import type { Transformation3DDefinition } from '../shared/scene3d';
import { getAccentColor, initThemeSync } from '../shared/theme';

type TransformConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  definition: Transformation3DDefinition;
  sourceName: string;
  referenceName: string;
  value: number;
  valueName: string;
  color: string;
  fillColor: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  lineStyle: string;
  strokeWidth: number;
  layer: number;
  persistentId: string;
  language: 'de' | 'en';
};
const number = (value: unknown, fallback: number): number => {
  const parsed = Number(String(value == null ? '' : value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (/^(?:1|true|yes|ja|on)$/.test(normalized)) return true;
  if (/^(?:0|false|no|nein|off)$/.test(normalized)) return false;
  return fallback;
};
const color = (value: unknown, fallback: string): string => {
  const token = String(value == null ? '' : value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(token) ? token : fallback;
};
function definition(value: unknown): Transformation3DDefinition {
  const token = String(value || '').toLowerCase();
  if (token.includes('translate') || token.includes('verschieb')) return 'translate';
  if (token.includes('reflect-point') || token.includes('punktspiegel')) return 'reflect-point';
  if (token.includes('reflect-line') || token.includes('geradenspiegel')) return 'reflect-line';
  if (token.includes('reflect-plane') || token.includes('ebenenspiegel')) return 'reflect-plane';
  if (token.includes('rotate') || token.includes('dreh')) return 'rotate-axis';
  return 'dilate';
}
function parseSpec(spec: string, definitionValue: string, languageValue?: string): TransformConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  parts.slice(4).forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) options[match[1].trim().toLowerCase()] = unquote(match[2].trim());
    else if (part) flags.add(part.toLowerCase());
  });
  const kind = definition(definitionValue);
  const rawValue = String(options.angle ?? options.winkel ?? options.factor ?? options.faktor ?? parts[4] ?? '').trim();
  const numeric = number(rawValue, NaN);
  const accent = getAccentColor();
  const name = parseMacroName(parts[1], 'T');
  return {
    boardId: parts[0] || 'A1',
    name: name.name,
    showName: name.showName && !flags.has('noname'),
    definition: kind,
    sourceName: parts[2] || '',
    referenceName: parts[3] || '',
    value: numeric,
    valueName: Number.isFinite(numeric) ? '' : rawValue,
    color: color(options.linecolor ?? options.linienfarbe, accent),
    fillColor: color(options.fillcolor ?? options.fuellfarbe ?? options.füllfarbe, accent),
    opacity: Math.max(0, Math.min(1, number(options.opacity ?? options.deckkraft, 0.25))),
    visible: options.visible == null && options.sichtbar == null
      ? !flags.has('hidden') : bool(options.visible ?? options.sichtbar, true),
    fixed: options.fixed == null && options.fixiert == null
      ? flags.has('fix') || flags.has('fixed') : bool(options.fixed ?? options.fixiert, true),
    lineStyle: parseLineStyle(options.linestyle ?? options.linienstil ?? 'solid') || 'solid',
    strokeWidth: Math.max(0.5, Math.min(20, number(options.width ?? options.breite, 2))),
    layer: Math.max(0, Math.min(20, Math.round(number(options.layer ?? options.ebene, 5)))),
    persistentId: String(options.objectid ?? options.objektid ?? '').trim(),
    language: String(languageValue || '').toLowerCase() === 'en' ? 'en' : 'de'
  };
}
function plain(value: unknown): string {
  return String(value || '').replace(/\\\(|\\\)|\$/g, '').trim();
}
function objectName(object: any): string {
  return plain(object?.__liaDgsPointName || object?.__liaDgsLineName || object?.__liaDgsRayName ||
    object?.__liaDgsVectorName || object?.__liaDgsSegmentName || object?.__liaDgsPlaneName ||
    object?.__liaDgsCircleName || object?.__liaDgsSphereName || object?.__liaDgsPolygon3DName ||
    object?.__liaDgsSolid3DName || object?.__liaDgsCurve3DName || object?.__liaDgsSurface3DName ||
    object?.__liaSceneRecord?.name || object?.name);
}
function sources(board: any): any[] {
  const entry = getCoordinateView3D(board);
  return [
    ...Array.from(entry?.points || []),
    ...Array.from(entry?.linearObjects || []),
    ...Array.from(entry?.planeObjects || []),
    ...Array.from(entry?.circleObjects || []),
    ...Array.from(entry?.sphereObjects || []),
    ...Array.from(entry?.polygonObjects || []),
    ...Array.from(entry?.solidObjects || []),
    ...Array.from(entry?.curveObjects || []),
    ...Array.from(entry?.surfaceObjects || [])
  ] as any[];
}
function sourceByName(board: any, name: string): any | null {
  const point = window.__points?.[String(board.__liaBoardId || board.container || '')]?.[name];
  if (point?.__liaPoint3D) return point;
  return sources(board).find(object => objectName(object) === plain(name) && !object.__liaPoint3DHelper) || null;
}
function referenceByName(board: any, name: string, kind: Transformation3DDefinition): any | null {
  return sources(board).find(object => {
    if (objectName(object) !== plain(name)) return false;
    if (kind === 'translate') return object.__liaLinear3DKind === 'vector';
    if (kind === 'reflect-point' || kind === 'dilate') return object.__liaPoint3D && !object.__liaPoint3DHelper;
    if (kind === 'reflect-line' || kind === 'rotate-axis') return !!object.__liaLinear3D;
    if (kind === 'reflect-plane') return !!object.__liaPlane3D;
    return false;
  }) || null;
}
function valueSource(config: TransformConfig): number | (() => number) | null {
  if (Number.isFinite(config.value)) return config.value;
  if (!config.valueName) return null;
  const getter = window.__getCoordSliderBindings?.(config.boardId)?.[config.valueName];
  return typeof getter === 'function' ? getter : null;
}
function transformEvaluator(
  config: TransformConfig, reference: any, value: number | (() => number) | null
): () => SimilarityTransform3D | null {
  return () => {
    if (config.definition === 'translate') {
      const vector = coordinateVector3DComponents(reference);
      return vector ? translationTransform3D(vector) : null;
    }
    if (config.definition === 'reflect-point') {
      const point = point3DCoordinates(reference);
      return point ? pointReflectionTransform3D(point) : null;
    }
    if (config.definition === 'reflect-line') {
      const line = coordinateLinear3DData(reference);
      return line ? lineReflectionTransform3D(line.anchor, line.direction) : null;
    }
    if (config.definition === 'reflect-plane') {
      const plane = coordinatePlane3DData(reference);
      return plane ? planeReflectionTransform3D(plane) : null;
    }
    const current = typeof value === 'function' ? Number(value()) : Number(value);
    if (!Number.isFinite(current)) return null;
    if (config.definition === 'rotate-axis') {
      const line = coordinateLinear3DData(reference);
      return line ? axisRotationTransform3D(line.anchor, line.direction, current * Math.PI / 180) : null;
    }
    const center = point3DCoordinates(reference);
    return center ? dilationTransform3D(center, current) : null;
  };
}
function parts(object: any): any[] {
  const result: any[] = [object, object?.element2D, object?.curve, object?.label];
  (object?.faces || []).forEach((face: any) => result.push(face, face?.element2D));
  (object?.borders || []).forEach((border: any) => result.push(border, border?.element2D));
  (object?.__liaSolid3DGuideCurves || []).forEach((guide: any) => result.push(guide, guide?.element2D));
  return result.filter((item, index, all) => item && all.indexOf(item) === index);
}
function stableId(object: any): string {
  return String(object?.__liaDgsPersistentId || object?.__liaSceneRecord?.id || objectName(object));
}
function decorate(
  object: any, config: TransformConfig, uid: string, source: any, reference: any,
  parameter: number | (() => number) | null
): void {
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:transformation3d:' + uid;
  object.__liaDgsPersistentId = config.persistentId || object.__liaDgsMacroKey;
  object.__liaDgsTransformation3D = true;
  object.__liaDgsTransformation3DName = config.name;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsShowObject = config.visible;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLineColor = config.color;
  object.__liaDgsFillColor = config.fillColor;
  object.__liaDgsTextColor = config.color;
  object.__liaDgsOpacity = config.opacity;
  object.__liaDgsLineStyle = config.lineStyle;
  object.__liaDgsSegmentStrokeWidth = config.strokeWidth;
  object.__liaDgsLayer = config.layer;
  object.__liaDgsLanguage = config.language;
  if (object.__liaPoint3D) {
    object.__liaDgsPointName = config.name;
    object.__liaPoint3DUserVisible = config.visible;
    window.__points = window.__points || {};
    window.__points[config.boardId] = window.__points[config.boardId] || {};
    window.__points[config.boardId][config.name] = object;
  } else if (object.__liaLinear3D) {
    const property = object.__liaLinear3DKind === 'vector' ? '__liaDgsVectorName'
      : object.__liaLinear3DKind === 'segment' ? '__liaDgsSegmentName'
      : object.__liaLinear3DKind === 'ray' ? '__liaDgsRayName' : '__liaDgsLineName';
    object[property] = config.name;
    object.__liaLinear3DUserVisible = config.visible;
  } else if (object.__liaPlane3D) {
    object.__liaDgsPlaneName = config.name; object.__liaPlane3DUserVisible = config.visible;
  } else if (object.__liaCircle3D) {
    object.__liaDgsCircleName = config.name; object.__liaCircle3DUserVisible = config.visible;
  } else if (object.__liaSphere3D) {
    object.__liaDgsSphereName = config.name; object.__liaSphere3DUserVisible = config.visible;
  } else if (object.__liaPolygon3D) {
    object.__liaDgsPolygon3DName = config.name; object.__liaPolygon3DUserVisible = config.visible;
  } else if (object.__liaSolid3D) {
    object.__liaDgsSolid3DName = config.name; object.__liaSolid3DUserVisible = config.visible;
  }
  const board = object.board;
  const suspendAppearance = board && !board.isSuspendedUpdate &&
    typeof board.suspendUpdate === 'function' && typeof board.unsuspendUpdate === 'function';
  if (suspendAppearance) board.suspendUpdate();
  try {
    parts(object).forEach(part => {
      try {
        part.setAttribute?.({
          strokeColor: config.color, highlightStrokeColor: config.color,
          fillColor: config.fillColor, highlightFillColor: config.fillColor,
          strokeOpacity: config.visible ? 1 : 0, fillOpacity: config.visible ? config.opacity : 0,
          highlightStrokeOpacity: config.visible ? 1 : 0,
          highlightFillOpacity: config.visible ? Math.min(1, config.opacity + 0.12) : 0,
          strokeWidth: config.strokeWidth, fixed: config.fixed, layer: config.layer
        });
        applyLineStyle(part, config.lineStyle);
      } catch (e) {}
    });
    try {
      object.setAttribute?.({ name: config.showName ? '\\(' + config.name + '\\)' : '', withLabel: config.showName });
      object.label?.setAttribute?.({ visible: config.visible && config.showName, strokeColor: config.color });
    } catch (e) {}
  } finally {
    if (suspendAppearance) board.unsuspendUpdate();
  }
  if (object.__liaSceneRecord) Object.assign(object.__liaSceneRecord, {
    id: object.__liaDgsPersistentId, name: config.name,
    sourceIds: [stableId(source)], referenceIds: [stableId(reference)],
    ...(typeof parameter === 'number' ? { value: parameter } : {}),
    ...(typeof parameter === 'function' ? { valueSourceId: config.valueName } : {}),
    visible: config.visible, fixed: config.fixed,
    style: {
      lineColor: config.color, fillColor: config.fillColor, textColor: config.color,
      opacity: config.opacity, lineStyle: config.lineStyle, strokeWidth: config.strokeWidth,
      showName: config.showName, layer: config.layer
    }
  });
}
function cleanupObject(entry: any): void {
  const object = entry.object;
  if (object?.__liaPoint3D && window.__points?.[entry.boardId]?.[entry.config?.name] === object) {
    delete window.__points[entry.boardId][entry.config.name];
  }
  try { object?.__liaPoint3DCleanup?.(); } catch (e) {}
  try { object?.__liaLinear3DCleanup?.(); } catch (e) {}
  try { object?.__liaPlane3DCleanup?.(); } catch (e) {}
  try { object?.__liaCircle3DCleanup?.(); } catch (e) {}
  try { object?.__liaSphere3DCleanup?.(); } catch (e) {}
  try { object?.__liaPolygon3DCleanup?.(); } catch (e) {}
  try { object?.__liaSolid3DCleanup?.(); } catch (e) {}
  try { object?.__liaCurve3DCleanup?.(); } catch (e) {}
  try { object?.__liaSurface3DCleanup?.(); } catch (e) {}
  try { entry.board?.removeObject?.(object); } catch (e) {}
}
function removeEntry(key: string): void {
  const entry = window.__transformation3DEntries?.[key];
  if (!entry) return;
  cleanupObject(entry);
  delete window.__transformation3DEntries![key];
}
function createOrUpdate(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, definitionValue, language)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const config = parseSpec(spec, definitionValue, language);
  const key = String(uid);
  const previous = window.__transformation3DEntries?.[key];
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') {
    if (previous) removeEntry(key);
    return false;
  }
  const source = sourceByName(board, config.sourceName);
  const reference = referenceByName(board, config.referenceName, config.definition);
  const sliderSource = config.valueName ? Object.values(window.__sliderEntries || {})
    .map((entry: any) => entry.slider).concat(board.objectsList || [])
    .find((object: any) => object?.board === board &&
      String(object.__liaDgsSliderName || object.__liaMacroSliderName || object.name) === config.valueName &&
      typeof object.Value === 'function') : null;
  const parameter = sliderSource && previous?.sliderSource === sliderSource &&
    previous?.config?.valueName === config.valueName ? previous.parameter : valueSource(config);
  if (!source || !reference ||
      ((config.definition === 'rotate-axis' || config.definition === 'dilate') && parameter == null)) {
    if (previous) removeEntry(key);
    return false;
  }
  const reusable = previous?.board === board && previous?.source === source &&
    previous?.reference === reference && previous?.config?.definition === config.definition &&
    previous?.parameter === parameter;
  // An unchanged macro must retain learner edits and avoid another full board render.
  if (reusable && previous.spec === spec && JSON.stringify(previous.config) === JSON.stringify(config)) return true;
  let object = reusable ? previous.object : null;
  if (!reusable && previous) removeEntry(key);
  try {
    if (!object) {
      object = createCoordinateTransformedObject3D(
        board, source, transformEvaluator(config, reference, parameter),
        config.definition, [reference], parameter == null ? undefined : parameter,
        {
          name: config.name, withLabel: config.showName,
          strokeColor: config.color, fillColor: config.fillColor,
          strokeOpacity: config.visible ? 1 : 0,
          fillOpacity: config.visible ? config.opacity : 0,
          strokeWidth: config.strokeWidth, fixed: config.fixed
        }
      );
    }
    decorate(object, config, uid, source, reference, parameter);
    window.__transformation3DEntries![key] = {
      board, boardId: config.boardId, object, source, reference, parameter, sliderSource, config, spec, definition: config.definition, language
    };
    board.fullUpdate?.();
    return true;
  } catch (e) {
    return false;
  }
}

export function init(): void {
  if (window.__transformation3DReady) {
    window.__scheduleBootstrapTransformation3D?.();
    return;
  }
  window.__transformation3DReady = true;
  window.__transformation3DEntries = window.__transformation3DEntries || {};
  initThemeSync();
  window.renderTransformation3DFromSpec = createOrUpdate;
  let dependencyRetryCount = 0;
  let dependencyRetryTimer = 0;
  window.__bootstrapTransformation3D = () => {
    let pending = false;
    const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="transformation3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('transformation3d-spec-'.length);
      active.add(uid);
      if (!createOrUpdate(uid, marker.dataset.spec || '', marker.dataset.definition || '', marker.dataset.language)) pending = true;
    });
    Object.keys(window.__transformation3DEntries || {}).forEach(key => { if (!active.has(key)) removeEntry(key); });
    window.__scheduleBootstrapIntersection3D?.();
    window.__scheduleBootstrapPoint3D?.();
    if (!pending) dependencyRetryCount = 0;
    else if (dependencyRetryCount < 24 && !dependencyRetryTimer) {
      dependencyRetryCount += 1;
      dependencyRetryTimer = window.setTimeout(() => {
        dependencyRetryTimer = 0;
        window.__scheduleBootstrapTransformation3D?.();
      }, 160);
    }
  };
  window.__scheduleBootstrapTransformation3D = () => {
    if (window.__bootstrapTransformation3DRAF) return;
    window.__bootstrapTransformation3DRAF = requestAnimationFrame(() => {
      window.__bootstrapTransformation3DRAF = 0;
      window.__bootstrapTransformation3D?.();
    });
  };
  window.__transformation3DObserver = new MutationObserver(records => {
    const relevant = records.some(record => record.type === 'attributes'
      ? (record.target as Element)?.id?.startsWith('transformation3d-spec-')
      : Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
          node.nodeType === 1 && (
            (node as Element).id?.startsWith('transformation3d-spec-') ||
            !!(node as Element).querySelector?.('[id^="transformation3d-spec-"]')
          )));
    if (relevant) {
      dependencyRetryCount = 0;
      if (dependencyRetryTimer) { window.clearTimeout(dependencyRetryTimer); dependencyRetryTimer = 0; }
      window.__scheduleBootstrapTransformation3D?.();
    }
  });
  window.__transformation3DObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-spec', 'data-definition', 'data-language']
  });
  scheduleBootstrap(() => window.__scheduleBootstrapTransformation3D?.());
}
