import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinatePlane3DData, coordinateSolid3DData, createCoordinateCurve3D,
  createCoordinateDependentPoint3D, createCoordinateSurface3D, getCoordinateView3D
} from '../coord/view3d';
import { createEvaluatedCurve3D, createParametricCurve3D, type ParametricCurve3D } from '../shared/curve3d';
import { compileParameterizedExpression } from '../shared/functionExpression';
import { parseScharInitialValues } from '../shared/scharExport';
import { createFunctionSurface3D, createParametricSurface3D } from '../shared/surface3d';
import { intersectPlaneConeConic3D, intersectPlaneCylinderConic3D, type ConicSection3D } from '../shared/conic3d';
import {
  createConicSection3DRecord, createCurve3DRecord, createSurface3DRecord
} from '../shared/scene3d';

interface StyleConfig {
  color: string; fillColor: string; opacity: number; width: number;
  visible: boolean; fixed: boolean; objectId: string; quality: number; showName: boolean;
}
interface CurveConfig extends StyleConfig {
  boardId: string; name: string; parameter: string; expressions: [string, string, string]; range: [number, number];
  parameterValues: Record<string, number>;
}
interface SurfaceConfig extends StyleConfig {
  boardId: string; name: string; parameters: [string, string]; expressions: [string, string, string];
  uRange: [number, number]; vRange: [number, number]; functionGraph: boolean; qualityV: number;
  parameterValues: Record<string, number>;
}
interface ConicConfig extends StyleConfig { boardId: string; name: string; planeName: string; solidName: string; }

const number = (value: unknown, fallback: number): number => {
  const token = String(value == null ? '' : value).trim();
  if (!token) return fallback;
  const parsed = Number(token.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const expressionNumber = (
  value: unknown,
  fallback: number,
  variables: Record<string, number | (() => number)> = {}
): number => {
  const direct = number(value, NaN);
  if (Number.isFinite(direct)) return direct;
  const compiled = compileParameterizedExpression(value, ['rangevalue'], {}, variables);
  if (!compiled.fn) return fallback;
  try {
    const evaluated = Number(compiled.fn(0));
    return Number.isFinite(evaluated) ? evaluated : fallback;
  } catch (error) { return fallback; }
};
const bool = (value: unknown, fallback: boolean): boolean => {
  const token = String(value == null ? '' : value).trim().toLowerCase();
  return /^(?:1|true|yes|ja|on)$/.test(token) ? true : (/^(?:0|false|no|nein|off)$/.test(token) ? false : fallback);
};
function options(parts: string[]): { positional: string[]; values: Record<string, string>; flags: Set<string> } {
  const positional: string[] = [];
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  parts.forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) values[match[1].trim().toLowerCase()] = unquote(match[2].trim());
    else if (/^(?:hidden|fix|fixed|noname)$/i.test(part)) flags.add(part.toLowerCase());
    else positional.push(part);
  });
  return { positional, values, flags };
}
function style(
  values: Record<string, string>,
  flags: Set<string>,
  qualityBounds: [number, number, number] = [8, 512, 96]
): StyleConfig {
  const color = values.linecolor || values.linienfarbe || values.color || values.farbe || '#00dfe8';
  const fillColor = values.fillcolor || values.fuellfarbe || values.füllfarbe || color;
  const [minimumQuality, maximumQuality, fallbackQuality] = qualityBounds;
  return {
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#00dfe8',
    fillColor: /^#[0-9a-f]{3,8}$/i.test(fillColor) ? fillColor : '#00dfe8',
    opacity: Math.max(0, Math.min(1, number(values.opacity || values.deckkraft, 0.3))),
    width: Math.max(0.5, Math.min(16, number(values.width || values.breite, 3))),
    visible: bool(values.visible ?? values.sichtbar, !flags.has('hidden')),
    fixed: bool(values.fixed ?? values.fixiert, flags.has('fix') || flags.has('fixed')),
    objectId: String(values.objectid || values.objektid || '').trim(),
    quality: Math.max(minimumQuality, Math.min(maximumQuality,
      Math.round(number(values.quality || values.qualitaet || values.qualität, fallbackQuality)))),
    showName: !flags.has('noname')
  };
}
function parseCurveSpec(spec: string): CurveConfig | null {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(value => unquote(value).trim());
  if (parts.length < 8) return null;
  const tail = options(parts.slice(8));
  const parameterValues = parseScharInitialValues(['params=' + String(tail.values.params || '[]')]);
  const variables = expressionVariables(parts[0] || 'A1', parameterValues);
  const range: [number, number] = [expressionNumber(parts[6], NaN, variables), expressionNumber(parts[7], NaN, variables)];
  if (!range.every(Number.isFinite) || range[1] <= range[0]) return null;
  const name = parseMacroName(parts[1] || 'c', 'c');
  return {
    boardId: parts[0] || 'A1', name: name.name, parameter: parts[2] || 't',
    expressions: [parts[3], parts[4], parts[5]], range, parameterValues,
    ...style(tail.values, tail.flags),
    opacity: Math.max(0, Math.min(1, number(tail.values.opacity ?? tail.values.deckkraft, 1))),
    showName: name.showName && !tail.flags.has('noname')
  };
}
function parseSurfaceSpec(spec: string, functionGraph: boolean): SurfaceConfig | null {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(value => unquote(value).trim());
  if (functionGraph) {
    if (parts.length < 7) return null;
    const tail = options(parts.slice(7));
    const name = parseMacroName(parts[1] || 'S', 'S');
    const parameterValues = parseScharInitialValues(['params=' + String(tail.values.params || '[]')]);
    const variables = expressionVariables(parts[0] || 'A1', parameterValues);
    const uRange: [number, number] = [expressionNumber(parts[3], NaN, variables), expressionNumber(parts[4], NaN, variables)];
    const vRange: [number, number] = [expressionNumber(parts[5], NaN, variables), expressionNumber(parts[6], NaN, variables)];
    if (![...uRange, ...vRange].every(Number.isFinite) || uRange[1] <= uRange[0] || vRange[1] <= vRange[0]) return null;
    const base = style(tail.values, tail.flags, [4, 128, 24]);
    const qualityV = Math.max(4, Math.min(128, Math.round(number(tail.values.qualityv || tail.values.qualitaetv, base.quality))));
    return { boardId: parts[0] || 'A1', name: name.name, parameters: ['u', 'v'], expressions: ['u', 'v', parts[2]], uRange, vRange, functionGraph: true, qualityV, parameterValues, ...base, showName: name.showName && !tail.flags.has('noname') };
  }
  if (parts.length < 11) return null;
  const tail = options(parts.slice(11));
  const name = parseMacroName(parts[1] || 'S', 'S');
  const parameterValues = parseScharInitialValues(['params=' + String(tail.values.params || '[]')]);
  const variables = expressionVariables(parts[0] || 'A1', parameterValues);
  const uRange: [number, number] = [expressionNumber(parts[7], NaN, variables), expressionNumber(parts[8], NaN, variables)];
  const vRange: [number, number] = [expressionNumber(parts[9], NaN, variables), expressionNumber(parts[10], NaN, variables)];
  if (![...uRange, ...vRange].every(Number.isFinite) || uRange[1] <= uRange[0] || vRange[1] <= vRange[0]) return null;
  const base = style(tail.values, tail.flags, [4, 128, 24]);
  const qualityV = Math.max(4, Math.min(128, Math.round(number(tail.values.qualityv || tail.values.qualitaetv, base.quality))));
  return { boardId: parts[0] || 'A1', name: name.name, parameters: [parts[2] || 'u', parts[3] || 'v'], expressions: [parts[4], parts[5], parts[6]], uRange, vRange, functionGraph: false, qualityV, parameterValues, ...base, showName: name.showName && !tail.flags.has('noname') };
}
function parseConicSpec(spec: string): ConicConfig | null {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(value => unquote(value).trim());
  if (parts.length < 4) return null;
  const tail = options(parts.slice(4));
  const name = parseMacroName(parts[1] || 'k', 'k');
  return {
    boardId: parts[0] || 'A1', name: name.name, planeName: parts[2], solidName: parts[3],
    ...style(tail.values, tail.flags),
    // Conics are curves: keep their established opaque default, while honoring
    // an explicitly supplied opacity for every branch and isolated point.
    opacity: Math.max(0, Math.min(1, number(tail.values.opacity ?? tail.values.deckkraft ?? 1, 1))),
    showName: name.showName && !tail.flags.has('noname')
  };
}
function expressionVariables(boardId: string, initial: Record<string, number> = {}): Record<string, number | (() => number)> {
  const result: Record<string, number | (() => number)> = { ...initial };
  const bindings = sliderVariables(boardId);
  Object.keys(bindings).forEach(name => { result[name] = bindings[name]; });
  return result;
}
function sliderVariables(boardId: string): Record<string, () => number> {
  const bindings = window.__getCoordSliderBindings?.(boardId) || {};
  const result: Record<string, () => number> = {};
  Object.keys(bindings).forEach(name => { if (typeof bindings[name] === 'function') result[name] = bindings[name]; });
  return result;
}
function plain(value: unknown): string { return String(value || '').replace(/\\\(|\\\)|\$/g, '').trim(); }
function objectName(object: any): string {
  return plain(object?.__liaDgsPlaneName || object?.__liaDgsSolid3DName || object?.__liaDgsCurve3DName ||
    object?.__liaDgsSurface3DName || object?.__liaSceneRecord?.name || object?.name);
}
function sourceByName(board: any, name: string): any | null {
  const entry = getCoordinateView3D(board);
  return ([...Array.from(entry?.planeObjects || []), ...Array.from(entry?.solidObjects || [])] as any[])
    .find(object => objectName(object) === plain(name)) || null;
}
function cleanupObject(board: any, object: any): void {
  try { object?.__liaCurve3DCleanup?.(); } catch (error) {}
  try { object?.__liaSurface3DCleanup?.(); } catch (error) {}
  try { object?.__liaPoint3DCleanup?.(); } catch (error) {}
  try { board?.removeObject?.(object); } catch (error) {}
}
function removeEntry(registryName: '__curve3DEntries' | '__surface3DEntries' | '__conic3DEntries', key: string): void {
  const registry = window[registryName] as Record<string, any> | undefined;
  const entry = registry?.[key];
  if (!entry) return;
  (entry.objects || [entry.object]).forEach((object: any) => cleanupObject(entry.board, object));
  delete registry![key];
}
function decorate(object: any, config: CurveConfig | SurfaceConfig, uid: string): void {
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = (object.__liaCurve3D ? 'macro:curve3d:' : 'macro:surface3d:') + uid;
  object.__liaDgsPersistentId = config.objectId || object.__liaDgsMacroKey;
  object.__liaDgsShowObject = config.visible;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLineColor = config.color;
  object.__liaDgsFillColor = config.fillColor;
  object.__liaDgsOpacity = config.opacity;
  if (object.__liaCurve3D) object.__liaDgsCurve3DName = config.name;
  else object.__liaDgsSurface3DName = config.name;
}
function createCurve(uid: string, spec: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createCurveSpatial(uid, spec)) === true;
}

function createCurveSpatial(uid: string, spec: string): boolean {
  const config = parseCurveSpec(spec);
  const board = config && window.__boards?.[config.boardId];
  if (!config || !board || board.__liaSceneMode !== '3d') return false;
  const previous = window.__curve3DEntries?.[uid];
  if (previous?.board === board && previous.spec === spec) return true;
  if (previous) removeEntry('__curve3DEntries', uid);
  const curve = createParametricCurve3D(config.expressions, config.range, {
    parameter: config.parameter, quality: config.quality, customVariables: expressionVariables(config.boardId, config.parameterValues)
  });
  if (!curve) return false;
  try {
    const object = createCoordinateCurve3D(board, curve, {
      name: config.showName ? config.name : '', withLabel: config.showName, fixed: config.fixed,
      visible: config.visible, strokeColor: config.color, strokeWidth: config.width
    });
    decorate(object, config, uid);
    object.__liaSceneRecord = createCurve3DRecord(config.objectId || 'macro:curve3d:' + uid,
      config.expressions, config.range, { name: config.name, parameter: config.parameter, quality: config.quality, visible: config.visible, fixed: config.fixed, style: { lineColor: config.color, strokeWidth: config.width } });
    window.__curve3DEntries![uid] = { board, boardId: config.boardId, object, objects: [object], config, spec };
    board.fullUpdate?.();
    return true;
  } catch (error) { window.__lastCurveSurface3DError = error instanceof Error ? error.stack || error.message : String(error); return false; }
}
function createSurface(uid: string, spec: string, functionGraph: boolean): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createSurfaceSpatial(uid, spec, functionGraph)) === true;
}

function createSurfaceSpatial(uid: string, spec: string, functionGraph: boolean): boolean {
  const config = parseSurfaceSpec(spec, functionGraph);
  const board = config && window.__boards?.[config.boardId];
  if (!config || !board || board.__liaSceneMode !== '3d') return false;
  const key = uid;
  const previous = window.__surface3DEntries?.[key];
  if (previous?.board === board && previous.spec === spec) return true;
  if (previous) removeEntry('__surface3DEntries', key);
  const customVariables = expressionVariables(config.boardId, config.parameterValues);
  const surface = functionGraph
    ? createFunctionSurface3D(config.expressions[2], config.uRange, config.vRange, { quality: [config.quality, config.qualityV], customVariables })
    : createParametricSurface3D(config.expressions, config.uRange, config.vRange, { parameters: config.parameters, quality: [config.quality, config.qualityV], customVariables });
  if (!surface) return false;
  try {
    const object = createCoordinateSurface3D(board, surface, {
      name: config.showName ? config.name : '', withLabel: config.showName, fixed: config.fixed,
      visible: config.visible, strokeColor: config.color, fillColor: config.fillColor,
      fillOpacity: config.opacity, strokeOpacity: Math.max(config.opacity, 0.55), strokeWidth: Math.min(config.width, 3)
    });
    decorate(object, config, uid);
    object.__liaSceneRecord = createSurface3DRecord(config.objectId || 'macro:surface3d:' + uid,
      config.expressions, config.uRange, config.vRange, { name: config.name, definition: functionGraph ? 'function' : 'parametric', parameters: config.parameters, quality: [config.quality, config.qualityV], visible: config.visible, fixed: config.fixed, style: { lineColor: config.color, fillColor: config.fillColor, opacity: config.opacity } });
    window.__surface3DEntries![key] = { board, boardId: config.boardId, object, objects: [object], config, spec, functionGraph };
    board.fullUpdate?.();
    return true;
  } catch (error) { window.__lastCurveSurface3DError = error instanceof Error ? error.stack || error.message : String(error); return false; }
}
/** Keep branch availability intact when common formatting changes visibility. */
function installConicPartVisibility(part: any, owner: any, available: () => boolean): void {
  if (part !== owner) part.__liaConic3DOwner = owner;
  part.__liaConic3DPartAvailable = available;
  [part, part.element2D, part.label].filter((target, index, values) => !!target && values.indexOf(target) === index).forEach(target => {
    const original = target.setAttribute;
    if (typeof original !== 'function') return;
    if (target !== owner) target.__liaConic3DOwner = owner;
    target.__liaConic3DPartAvailable = available;
    const guarded = (value: any): (() => boolean) => {
      if (typeof value === 'function' && value.__liaConicVisibilityPart === part) return value;
      const visibility = () => {
        let requested = value;
        try { if (typeof value === 'function') requested = value(); } catch (error) { requested = false; }
        return !!requested && owner.__liaDgsShowObject !== false && available()
          && (target !== part.label || owner.__liaDgsShowName !== false);
      };
      visibility.__liaConicVisibilityPart = part;
      return visibility;
    };
    target.setAttribute = function(attributes: any, ...rest: any[]): any {
      if (attributes && typeof attributes === 'object' &&
          Object.prototype.hasOwnProperty.call(attributes, 'visible')) {
        return original.call(this, { ...attributes, visible: guarded(attributes.visible) }, ...rest);
      }
      return original.call(this, attributes, ...rest);
    };
    target.setAttribute({ visible: target.visProp?.visible ?? true });
  });
}

function createConic(uid: string, spec: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createConicSpatial(uid, spec)) === true;
}

function createConicSpatial(uid: string, spec: string): boolean {
  const config = parseConicSpec(spec);
  const board = config && window.__boards?.[config.boardId];
  if (!config || !board || board.__liaSceneMode !== '3d') return false;
  const planeObject = sourceByName(board, config.planeName);
  const solidObject = sourceByName(board, config.solidName);
  const plane = coordinatePlane3DData(planeObject);
  const solid = coordinateSolid3DData(solidObject);
  if (!planeObject || !solidObject || !plane || !solid || (solid.kind !== 'cylinder' && solid.kind !== 'cone')) return false;
  const previous = window.__conic3DEntries?.[uid];
  if (previous?.board === board && previous.spec === spec && previous.planeObject === planeObject && previous.solidObject === solidObject) return true;
  if (previous) removeEntry('__conic3DEntries', uid);
  let cacheKey = '';
  let cache: ConicSection3D | null = null;
  const section = (): ConicSection3D | null => {
    const currentPlane = coordinatePlane3DData(planeObject);
    const currentSolid = coordinateSolid3DData(solidObject);
    if (!currentPlane || !currentSolid || (currentSolid.kind !== 'cylinder' && currentSolid.kind !== 'cone')) return null;
    const key = JSON.stringify([currentPlane.coefficients, currentSolid.kind,
      currentSolid.kind === 'cylinder' ? currentSolid.baseCenter : currentSolid.apex,
      currentSolid.kind === 'cylinder' ? currentSolid.topCenter : currentSolid.baseCenter, currentSolid.radius]);
    if (key !== cacheKey) {
      cacheKey = key;
      cache = currentSolid.kind === 'cylinder'
        ? intersectPlaneCylinderConic3D(currentPlane, currentSolid)
        : intersectPlaneConeConic3D(currentPlane, currentSolid);
    }
    return cache;
  };
  const objects: any[] = [];
  try {
    for (let branchIndex = 0; branchIndex < 2; branchIndex += 1) {
      const wrapper = createEvaluatedCurve3D(t => {
        const branch = section()?.branches[branchIndex];
        if (!branch) return null;
        const parameter = branch.range[0] + (t + 1) * (branch.range[1] - branch.range[0]) / 2;
        return branch.evaluate(parameter);
      }, [-1, 1], { quality: config.quality });
      const object = createCoordinateCurve3D(board, wrapper!, {
        name: branchIndex === 0 && config.showName ? config.name : '', withLabel: branchIndex === 0 && config.showName,
        fixed: config.fixed, visible: () => config.visible && !!section()?.branches[branchIndex],
        strokeColor: config.color, strokeWidth: config.width,
        strokeOpacity: config.opacity, highlightStrokeOpacity: config.opacity
      });
      object.__liaConicSection3D = true;
      object.__liaDgsConic3DName = config.name;
      object.__liaDgsMacroManaged = true;
      object.__liaDgsMacroKey = 'macro:conic3d:' + uid;
      object.__liaDgsPersistentId = branchIndex === 0
        ? (config.objectId || object.__liaDgsMacroKey)
        : object.__liaDgsMacroKey + ':branch:' + branchIndex;
      object.__liaDgsShowObject = config.visible;
      object.__liaDgsFixed = config.fixed;
      object.__liaDgsLineColor = config.color;
      object.__liaDgsOpacity = config.opacity;
      object.__liaDgsShowName = branchIndex === 0 && config.showName;
      if (branchIndex > 0) object.__liaDgsSegment6Helper = true;
      objects.push(object);
    }
    const point = createCoordinateDependentPoint3D(board, () => section()?.points[0] || [0, 0, 0], {
      name: config.showName ? config.name : '', withLabel: config.showName, fixed: true,
      visible: () => config.visible && !!section()?.points[0], strokeColor: config.color, fillColor: config.color, size: 6,
      strokeOpacity: config.opacity, fillOpacity: config.opacity,
      highlightStrokeOpacity: config.opacity, highlightFillOpacity: config.opacity
    });
    point.__liaConicSection3D = true;
    point.__liaDgsConic3DName = config.name;
    point.__liaDgsMacroManaged = true;
    point.__liaDgsMacroKey = 'macro:conic3d:' + uid + ':point';
    point.__liaDgsPersistentId = point.__liaDgsMacroKey;
    point.__liaDgsSegment6Helper = true;
    point.__liaDgsOpacity = config.opacity;
    point.__liaDgsShowName = config.showName;
    objects.push(point);
    const object = objects[0];
    // Secondary branches and the isolated-point case are one styled object.
    // Do not include the owner in its own parts list.
    object.__liaConic3DParts = objects.slice(1);
    objects.forEach((part, index) => installConicPartVisibility(part, object, () =>
      index < 2 ? !!section()?.branches[index] : !!section()?.points[0]
    ));
    object.__liaConicSection3DEvaluator = section;
    object.__liaSceneRecord = createConicSection3DRecord(config.objectId || 'macro:conic3d:' + uid,
      solid.kind === 'cylinder' ? 'plane-cylinder' : 'plane-cone',
      [String(planeObject.__liaDgsPersistentId || config.planeName), String(solidObject.__liaDgsPersistentId || config.solidName)],
      { name: config.name, classification: section()?.conicKind, visible: config.visible, fixed: config.fixed, style: { lineColor: config.color, strokeWidth: config.width, opacity: config.opacity } });
    window.__conic3DEntries![uid] = { board, boardId: config.boardId, object, objects, planeObject, solidObject, config, spec, section };
    board.fullUpdate?.();
    return true;
  } catch (error) {
    objects.forEach(item => cleanupObject(board, item));
    return false;
  }
}

export function init(): void {
  if (window.__curveSurface3DReady) { window.__scheduleBootstrapCurveSurface3D?.(); return; }
  window.__curveSurface3DReady = true;
  window.__curve3DEntries = window.__curve3DEntries || {};
  window.__surface3DEntries = window.__surface3DEntries || {};
  window.__conic3DEntries = window.__conic3DEntries || {};
  window.renderCurve3DFromSpec = createCurve;
  window.renderSurface3DFromSpec = (uid, spec, functionGraph) => createSurface(uid, spec, Boolean(functionGraph));
  window.renderConic3DFromSpec = createConic;
  let dependencyRetryCount = 0;
  let dependencyRetryTimer = 0;
  window.__bootstrapCurveSurface3D = () => {
    let pending = false;
    const activeCurves = new Set<string>();
    const activeSurfaces = new Set<string>();
    const activeConics = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="curve3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('curve3d-spec-'.length); activeCurves.add(uid);
      if (!createCurve(uid, marker.dataset.spec || '')) pending = true;
    });
    document.querySelectorAll<HTMLElement>('[id^="surface3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('surface3d-spec-'.length);
      const key = uid;
      activeSurfaces.add(key);
      if (!createSurface(uid, marker.dataset.spec || '', marker.dataset.functionGraph === 'true')) pending = true;
    });
    document.querySelectorAll<HTMLElement>('[id^="conic3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('conic3d-spec-'.length); activeConics.add(uid);
      if (!createConic(uid, marker.dataset.spec || '')) pending = true;
    });
    Object.keys(window.__curve3DEntries || {}).forEach(key => { if (!activeCurves.has(key)) removeEntry('__curve3DEntries', key); });
    Object.keys(window.__surface3DEntries || {}).forEach(key => { if (!activeSurfaces.has(key)) removeEntry('__surface3DEntries', key); });
    Object.keys(window.__conic3DEntries || {}).forEach(key => { if (!activeConics.has(key)) removeEntry('__conic3DEntries', key); });
    window.__scheduleBootstrapPoint3D?.();
    window.__scheduleBootstrapTransformation3D?.();
    if (!pending) dependencyRetryCount = 0;
    else if (dependencyRetryCount < 16 && !dependencyRetryTimer) {
      dependencyRetryCount += 1;
      dependencyRetryTimer = window.setTimeout(() => {
        dependencyRetryTimer = 0;
        window.__scheduleBootstrapCurveSurface3D?.();
      }, 160);
    }
  };
  window.__scheduleBootstrapCurveSurface3D = () => {
    if (window.__bootstrapCurveSurface3DRAF) return;
    window.__bootstrapCurveSurface3DRAF = requestAnimationFrame(() => {
      window.__bootstrapCurveSurface3DRAF = 0;
      window.__bootstrapCurveSurface3D?.();
    });
  };
  window.__curveSurface3DObserver = new MutationObserver(records => {
    const relevant = records.some(record => {
      const target = record.target as Element;
      if (record.type === 'attributes') return /^(?:curve3d|surface3d|conic3d)-spec-/.test(target?.id || '');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node => node.nodeType === 1 && (
        /^(?:curve3d|surface3d|conic3d)-spec-/.test((node as Element).id || '') ||
        !!(node as Element).querySelector?.('[id^="curve3d-spec-"],[id^="surface3d-spec-"],[id^="conic3d-spec-"]')
      ));
    });
    if (relevant) {
      dependencyRetryCount = 0;
      if (dependencyRetryTimer) { window.clearTimeout(dependencyRetryTimer); dependencyRetryTimer = 0; }
      window.__scheduleBootstrapCurveSurface3D?.();
    }
  });
  window.__curveSurface3DObserver.observe(document.body || document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-function-graph']
  });
  scheduleBootstrap(() => window.__scheduleBootstrapCurveSurface3D?.());
}