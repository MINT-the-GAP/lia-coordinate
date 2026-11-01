import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { createCoordinateAngle3D } from '../coord/angle3dObjects';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinateCurve3DData, coordinateLinear3DData, coordinatePlane3DData, coordinateSurface3DData,
  coordinateVector3DComponents, createCoordinateDependentLine3D, createCoordinateDependentPoint3D,
  getCoordinateView3D, point3DCoordinates
} from '../coord/view3d';
import { createCoordinateDependentLinearObject3D, createCoordinateDependentPlane3D } from '../coord/transform3dObjects';
import {
  addVector3, angleBetweenVectors3, angleLinePlane3, angleLines3, anglePlanes3,
  commonPerpendicularLines3, connectPointsVector3, crossVector3, distanceLines3,
  distanceParallelPlanes3, distancePointLine3, distancePointPlane, distancePoints3, dotVector3, negateVector3,
  normalVectorOfPlane3, projectPointToLine3, projectPointToPlane, projectVectorIntoPlane3,
  projectVectorOntoVector3, relationLinePlane3, relationLines3, relationPlanes3,
  scalarTripleProduct3, scaleVector3, subtractVector3, vector3Norm, type LineDefinition3D
} from '../shared/analytic3d';
import { curveArcLength3D, curveFrame3D, evaluateCurve3D, nearestCurveParameter3D } from '../shared/curve3d';
import { evaluateSurface3D, nearestSurfaceParameters3D, surfaceFrame3D } from '../shared/surface3d';
import {
  createAnalyticConstruction3DRecord, createDerivedVector3DRecord,
  createAnalyticScalar3DRecord, createCurveSurfaceAnalysis3DRecord,
  type DerivedVector3DOperation
} from '../shared/scene3d';
import { planeFromPointNormal } from '../shared/plane3d';
import type { Vector3 } from '../shared/vector3d';

interface Config {
  boardId: string; name: string; sources: string[]; operation: string;
  value: number; valueName: string; t: number; u: number; v: number;
  color: string; visible: boolean; fixed: boolean; showValue: boolean; objectId: string;
  visual: boolean; showName: boolean; language: string;
}
const num = (value: unknown, fallback = NaN): number => {
  const parsed = Number(String(value == null ? '' : value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => {
  const token = String(value == null ? '' : value).trim().toLowerCase();
  return /^(?:1|true|yes|ja|on)$/.test(token) ? true : (/^(?:0|false|no|nein|off)$/.test(token) ? false : fallback);
};
function parseSpec(spec: string, operation: string): Config | null {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(value => unquote(value).trim());
  if (parts.length < 3) return null;
  const options: Record<string, string> = {};
  const sources: string[] = [];
  parts.slice(2).forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) options[match[1].trim().toLowerCase()] = unquote(match[2].trim());
    else if (part) sources.push(part);
  });
  const name = parseMacroName(parts[1], 'a');
  const valueToken = options.value || options.wert || '';
  const numeric = num(valueToken);
  return {
    boardId: parts[0] || 'A1', name: name.name, sources, operation,
    value: numeric, valueName: Number.isFinite(numeric) ? '' : valueToken,
    t: num(options.t, 0), u: num(options.u, 0), v: num(options.v, 0),
    color: /^#[0-9a-f]{3,8}$/i.test(options.color || options.farbe || '') ? (options.color || options.farbe) : '#00dfe8',
    visible: bool(options.visible ?? options.sichtbar, true), fixed: bool(options.fixed ?? options.fixiert, true),
    showValue: bool(options.showvalue ?? options.wertanzeige, true),
    visual: bool(options.visual ?? options.visuell, false),
    showName: name.showName,
    language: String(options.language || options.sprache || 'de').toLowerCase() === 'en' ? 'en' : 'de',
    objectId: String(options.objectid || options.objektid || '').trim()
  };
}
function plain(value: unknown): string { return String(value || '').replace(/\\\(|\\\)|\$/g, '').trim(); }
function objectName(object: any): string {
  return plain(object?.__liaDgsPointName || object?.__liaDgsLineName || object?.__liaDgsRayName ||
    object?.__liaDgsVectorName || object?.__liaDgsSegmentName || object?.__liaDgsPlaneName ||
    object?.__liaDgsCurve3DName || object?.__liaDgsSurface3DName || object?.__liaDgsAnalytic3DName ||
    object?.__liaSceneRecord?.name || object?.name);
}
function objects(board: any): any[] {
  const entry = getCoordinateView3D(board);
  return [
    ...Array.from(entry?.points || []), ...Array.from(entry?.linearObjects || []),
    ...Array.from(entry?.planeObjects || []), ...Array.from(entry?.curveObjects || []),
    ...Array.from(entry?.surfaceObjects || [])
  ] as any[];
}
function sourceByName(board: any, boardId: string, name: string): any | null {
  const point = window.__points?.[boardId]?.[name];
  if (point?.__liaPoint3D) return point;
  return objects(board).find(object => !object.__liaPoint3DHelper && objectName(object) === plain(name)) || null;
}
function line(object: any): LineDefinition3D | null {
  const value = coordinateLinear3DData(object);
  return value ? { anchor: value.anchor, direction: value.direction, domain: value.domain } : null;
}
function vector(object: any): Vector3 | null { return coordinateVector3DComponents(object); }
function sliderValue(config: Config): number {
  if (Number.isFinite(config.value)) return config.value;
  const getter = config.valueName ? window.__getCoordSliderBindings?.(config.boardId)?.[config.valueName] : null;
  return typeof getter === 'function' ? Number(getter()) : NaN;
}
function vectorResult(config: Config, sources: any[]): Vector3 | null {
  const first = vector(sources[0]);
  const second = vector(sources[1]);
  if (config.operation === 'vector-add') return first && second ? addVector3(first, second) : null;
  if (config.operation === 'vector-subtract') return first && second ? subtractVector3(first, second) : null;
  if (config.operation === 'vector-scale') return first ? scaleVector3(first, sliderValue(config)) : null;
  if (config.operation === 'vector-negate') return first ? negateVector3(first) : null;
  if (config.operation === 'vector-unit') return first ? (vector3Norm(first) > 1e-12 ? scaleVector3(first, 1 / vector3Norm(first)) : null) : null;
  if (config.operation === 'vector-connect') {
    const a = point3DCoordinates(sources[0]); const b = point3DCoordinates(sources[1]);
    return a && b ? connectPointsVector3(a, b) : null;
  }
  if (config.operation === 'vector-project') return first && second ? projectVectorOntoVector3(first, second) : null;
  if (config.operation === 'vector-project-plane') {
    const plane = coordinatePlane3DData(sources[1]); return first && plane ? projectVectorIntoPlane3(first, plane) : null;
  }
  if (config.operation === 'vector-cross') return first && second ? crossVector3(first, second) : null;
  if (config.operation === 'plane-normal') {
    const plane = coordinatePlane3DData(sources[0]); return plane ? normalVectorOfPlane3(plane) : null;
  }
  if (config.operation === 'curve-tangent-vector' || config.operation === 'curve-velocity') {
    const curve = coordinateCurve3DData(sources[0]);
    const frame = curve && curveFrame3D(curve, config.t);
    return frame ? (config.operation === 'curve-velocity' ? frame.velocity : frame.tangent) : null;
  }
  if (config.operation === 'surface-normal' || config.operation === 'surface-tangent-u' || config.operation === 'surface-tangent-v') {
    const surface = coordinateSurface3DData(sources[0]); const frame = surface && surfaceFrame3D(surface, config.u, config.v);
    if (!frame) return null;
    return config.operation === 'surface-tangent-u' ? frame.tangentU :
      (config.operation === 'surface-tangent-v' ? frame.tangentV : frame.normal);
  }
  return null;
}
function scalarResult(config: Config, sources: any[]): number | string {
  const a = vector(sources[0]); const b = vector(sources[1]); const c = vector(sources[2]);
  const la = line(sources[0]); const lb = line(sources[1]);
  const pa = coordinatePlane3DData(sources[0]); const pb = coordinatePlane3DData(sources[1]);
  const pointA = point3DCoordinates(sources[0]); const pointB = point3DCoordinates(sources[1]);
  if (config.operation === 'magnitude') return a ? vector3Norm(a) : NaN;
  if (config.operation === 'dot') return a && b ? dotVector3(a, b) : NaN;
  if (config.operation === 'triple') return a && b && c ? scalarTripleProduct3(a, b, c) : NaN;
  if (config.operation === 'angle-vectors') return a && b ? angleBetweenVectors3(a, b) : NaN;
  if (config.operation === 'distance-points') return pointA && pointB ? distancePoints3(pointA, pointB) : NaN;
  if (config.operation === 'distance-point-line') return pointA && lb ? distancePointLine3(pointA, lb) : NaN;
  if (config.operation === 'distance-point-plane') return pointA && pb ? distancePointPlane(pointA, pb) : NaN;
  if (config.operation === 'distance-lines') return la && lb ? distanceLines3(la, lb) : NaN;
  if (config.operation === 'distance-planes') return pa && pb ? distanceParallelPlanes3(pa, pb) : NaN;
  if (config.operation === 'angle-lines') return la && lb ? angleLines3(la, lb) : NaN;
  if (config.operation === 'angle-line-plane') return la && pb ? angleLinePlane3(la, pb) : NaN;
  if (config.operation === 'angle-planes') return pa && pb ? anglePlanes3(pa, pb) : NaN;
  if (config.operation === 'relation-lines') return la && lb ? relationLines3(la, lb) : 'invalid';
  if (config.operation === 'relation-line-plane') return la && pb ? relationLinePlane3(la, pb) : 'invalid';
  if (config.operation === 'relation-planes') return pa && pb ? relationPlanes3(pa, pb) : 'invalid';
  if (config.operation === 'relation-point-object') {
    if (!pointA || !sources[1]) return 'invalid';
    const scale = Math.max(1, vector3Norm(pointA));
    const tolerance = 1e-7 * scale;
    const targetLine = line(sources[1]);
    if (targetLine) return distancePointLine3(pointA, targetLine) <= tolerance ? 'contained' : 'not-contained';
    const targetPlane = coordinatePlane3DData(sources[1]);
    if (targetPlane) return distancePointPlane(pointA, targetPlane) <= tolerance ? 'contained' : 'not-contained';
    const targetCurve = coordinateCurve3DData(sources[1]);
    if (targetCurve) {
      const parameter = nearestCurveParameter3D(targetCurve, pointA);
      const nearest = evaluateCurve3D(targetCurve, parameter);
      return nearest && distancePoints3(pointA, nearest) <= tolerance ? 'contained' : 'not-contained';
    }
    const targetSurface = coordinateSurface3DData(sources[1]);
    if (targetSurface) {
      const parameters = nearestSurfaceParameters3D(targetSurface, pointA);
      const nearest = evaluateSurface3D(targetSurface, parameters[0], parameters[1]);
      return nearest && distancePoints3(pointA, nearest) <= tolerance ? 'contained' : 'not-contained';
    }
    return 'invalid';
  }
  if (config.operation === 'curve-arc-length') {
    const curve = coordinateCurve3DData(sources[0]);
    const from = Number.isFinite(config.u) ? config.u : curve?.range[0];
    const to = Number.isFinite(config.v) && config.v !== 0 ? config.v : curve?.range[1];
    return curve ? curveArcLength3D(curve, from, to) : NaN;
  }
  return NaN;
}
function sourceIds(sources: any[]): string[] {
  return sources.map(source => String(source?.__liaDgsPersistentId || source?.__liaSceneRecord?.id || objectName(source)));
}
function cleanup(board: any, object: any): void {
  try { object?.__liaDgsAngle3DCleanup?.(); } catch (error) {}
  try { object?.__liaCurve3DCleanup?.(); } catch (error) {}
  try { object?.__liaLinear3DCleanup?.(); } catch (error) {}
  try { object?.__liaPlane3DCleanup?.(); } catch (error) {}
  try { object?.__liaPoint3DCleanup?.(); } catch (error) {}
  try { object?.rendNode?.remove?.(); } catch (error) {}
  try { board?.removeObject?.(object); } catch (error) {}
}
function removeEntry(key: string): void {
  const entry = window.__analytic3DEntries?.[key];
  if (!entry) return;
  (entry.objects || [entry.object]).forEach((object: any) => cleanup(entry.board, object));
  delete window.__analytic3DEntries![key];
}
function decorate(object: any, config: Config, uid: string, sources: any[]): void {
  object.__liaDgsMacroManaged = true; object.__liaDgsMacroKey = 'macro:analytic3d:' + uid;
  object.__liaDgsPersistentId = config.objectId || object.__liaDgsMacroKey;
  object.__liaDgsAnalytic3D = true; object.__liaDgsAnalytic3DName = config.name;
  object.__liaDgsAnalytic3DOperation = config.operation; object.__liaDgsAnalytic3DSources = sources;
  object.__liaDgsShowObject = config.visible; object.__liaDgsShowValue = config.showValue;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsColor = config.color;
  object.__liaDgsLineColor = config.color;
  object.__liaDgsTextColor = config.color;
  object.__liaDgsFixed = config.fixed;
}
function createOrUpdate(uid: string, spec: string, operation: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, operation)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, operation: string): boolean {
  const config = parseSpec(spec, operation);
  const board = config && window.__boards?.[config.boardId];
  if (!config || !board || board.__liaSceneMode !== '3d') return false;
  const sources = config.sources.map(name => sourceByName(board, config.boardId, name));
  if (sources.some(source => !source)) return false;
  const previous = window.__analytic3DEntries?.[uid];
  const previousSources = previous?.object?.__liaDgsAnalytic3DSources;
  if (previous?.board === board && previous.spec === spec && previous.operation === operation &&
      Array.isArray(previousSources) && previousSources.length === sources.length &&
      previousSources.every((source: any, index: number) => source === sources[index])) return true;
  if (previous) removeEntry(uid);
  const vectorOperations = new Set(['vector-add','vector-subtract','vector-scale','vector-negate','vector-unit','vector-connect','vector-project','vector-project-plane','vector-cross','plane-normal','curve-tangent-vector','curve-velocity','surface-normal','surface-tangent-u','surface-tangent-v']);
  const objectsCreated: any[] = [];
  try {
    let object: any;
    const angleDefinition = operation === 'angle-lines' ? 'lines'
      : (operation === 'angle-line-plane' ? 'line-plane' : (operation === 'angle-planes' ? 'planes' : null));
    if (config.visual && angleDefinition) {
      object = createCoordinateAngle3D(board, sources[0], sources[1], angleDefinition, {
        name: config.name, color: config.color, language: config.language,
        showName: config.showName, showAngle: config.showValue,
        visible: config.visible, fixed: config.fixed
      });
      if (!object) return false;
    } else if (vectorOperations.has(operation)) {
      const initial = vectorResult(config, sources);
      if (!initial || vector3Norm(initial) <= 1e-12) return false;
      object = createCoordinateDependentLinearObject3D(board, 'vector', () => {
        const result = vectorResult(config, sources);
        if (!result || vector3Norm(result) <= 1e-12) return null;
        const curveData = coordinateCurve3DData(sources[0]);
        const surfaceData = coordinateSurface3DData(sources[0]);
        const curveFrame = (operation === 'curve-tangent-vector' || operation === 'curve-velocity') && curveData
          ? curveFrame3D(curveData, config.t) : null;
        const surfaceFrame = operation.startsWith('surface-') && surfaceData
          ? surfaceFrame3D(surfaceData, config.u, config.v) : null;
        const anchor = operation === 'vector-connect' ? point3DCoordinates(sources[0]) :
          (curveFrame?.point || surfaceFrame?.point || [0, 0, 0] as Vector3);
        return anchor ? { point: anchor, direction: result } : null;
      }, { name: config.name, withLabel: true, visible: config.visible, fixed: config.fixed, strokeColor: config.color, strokeWidth: 3 });
      object.__liaDgsVectorName = config.name;
      if (operation === 'curve-tangent-vector' || operation === 'curve-velocity') {
        object.__liaSceneRecord = createCurveSurfaceAnalysis3DRecord(
          'curve-analysis3d', config.objectId || 'macro:analytic3d:' + uid,
          operation === 'curve-velocity' ? 'velocity' : 'tangent', sourceIds(sources), { t: config.t },
          { name: config.name, visible: config.visible, fixed: config.fixed }
        );
      } else if (operation === 'surface-normal' || operation === 'surface-tangent-u' || operation === 'surface-tangent-v') {
        const analysisOperation = operation === 'surface-tangent-u' ? 'tangent-u' :
          (operation === 'surface-tangent-v' ? 'tangent-v' : 'normal-vector');
        object.__liaSceneRecord = createCurveSurfaceAnalysis3DRecord(
          'surface-analysis3d', config.objectId || 'macro:analytic3d:' + uid, analysisOperation,
          sourceIds(sources), { u: config.u, v: config.v },
          { name: config.name, visible: config.visible, fixed: config.fixed }
        );
      } else {
        const recordOperations: Record<string, DerivedVector3DOperation> = {
          'vector-add': 'add', 'vector-subtract': 'subtract', 'vector-scale': 'scale',
          'vector-negate': 'negate', 'vector-unit': 'unit', 'vector-connect': 'connect',
          'vector-project': 'project-vector', 'vector-project-plane': 'project-plane',
          'vector-cross': 'cross', 'plane-normal': 'normal'
        };
        object.__liaSceneRecord = createDerivedVector3DRecord(
          config.objectId || 'macro:analytic3d:' + uid, recordOperations[operation], sourceIds(sources),
          { name: config.name, scalar: sliderValue(config), scalarSourceId: config.valueName || undefined,
            visible: config.visible, fixed: config.fixed }
        );
      }
    } else if (operation === 'project-point-line' || operation === 'project-point-plane') {
      const evaluator = () => {
        const point = point3DCoordinates(sources[0]);
        if (!point) return null;
        if (operation === 'project-point-line') { const target = line(sources[1]); return target ? projectPointToLine3(point, target) : null; }
        const target = coordinatePlane3DData(sources[1]); return target ? projectPointToPlane(point, target) : null;
      };
      if (!evaluator()) return false;
      object = createCoordinateDependentPoint3D(board, evaluator, { name: config.name, withLabel: true, visible: config.visible, fixed: true, strokeColor: config.color, fillColor: config.color, size: 6 });
      object.__liaDgsPointName = config.name;
      object.__liaSceneRecord = createAnalyticConstruction3DRecord(
        config.objectId || 'macro:analytic3d:' + uid, operation, 'point3d', sourceIds(sources),
        { name: config.name, visible: config.visible, fixed: true }
      );
    } else if (operation === 'perpendicular-line-plane') {
      const evaluator = () => {
        const point = point3DCoordinates(sources[0]);
        const plane = coordinatePlane3DData(sources[1]);
        return point && plane ? { point, direction: plane.normal } : null;
      };
      if (!evaluator()) return false;
      object = createCoordinateDependentLine3D(board, evaluator, { name: config.name, withLabel: true, visible: config.visible, fixed: true, strokeColor: config.color, strokeWidth: 3 });
      object.__liaDgsLineName = config.name;
      object.__liaSceneRecord = createAnalyticConstruction3DRecord(
        config.objectId || 'macro:analytic3d:' + uid, operation, 'line3d', sourceIds(sources),
        { name: config.name, visible: config.visible, fixed: true }
      );
    } else if (operation === 'curve-tangent') {
      const evaluator = () => {
        const curve = coordinateCurve3DData(sources[0]); const frame = curve && curveFrame3D(curve, config.t);
        return frame ? { point: frame.point, direction: frame.tangent } : null;
      };
      if (!evaluator()) return false;
      object = createCoordinateDependentLine3D(board, evaluator, { name: config.name, withLabel: true, visible: config.visible, fixed: true, strokeColor: config.color, strokeWidth: 3 });
      object.__liaDgsLineName = config.name;
      object.__liaSceneRecord = createCurveSurfaceAnalysis3DRecord('curve-analysis3d', config.objectId || 'macro:analytic3d:' + uid, 'tangent', sourceIds(sources), { t: config.t }, { name: config.name });
    } else if (operation === 'curve-normal-plane' || operation === 'surface-tangent-plane') {
      const evaluator = () => {
        if (operation === 'curve-normal-plane') {
          const curve = coordinateCurve3DData(sources[0]); const frame = curve && curveFrame3D(curve, config.t);
          return frame ? planeFromPointNormal(frame.point, frame.tangent) : null;
        }
        const surface = coordinateSurface3DData(sources[0]); return surfaceFrame3D(surface!, config.u, config.v)?.tangentPlane || null;
      };
      if (!evaluator()) return false;
      object = createCoordinateDependentPlane3D(board, evaluator, { name: config.name, withLabel: true, visible: config.visible, fixed: true, strokeColor: config.color, fillColor: config.color, fillOpacity: 0.2 });
      object.__liaDgsPlaneName = config.name;
      object.__liaSceneRecord = createCurveSurfaceAnalysis3DRecord(operation === 'curve-normal-plane' ? 'curve-analysis3d' : 'surface-analysis3d', config.objectId || 'macro:analytic3d:' + uid, operation === 'curve-normal-plane' ? 'normal-plane' : 'tangent-plane', sourceIds(sources), operation === 'curve-normal-plane' ? { t: config.t } : { u: config.u, v: config.v }, { name: config.name });
    } else if (operation === 'common-perpendicular') {
      const evaluator = () => {
        const first = line(sources[0]); const second = line(sources[1]); const result = first && second ? commonPerpendicularLines3(first, second) : null;
        return result ? { point: result.first, direction: subtractVector3(result.second, result.first)! } : null;
      };
      if (!evaluator()) return false;
      object = createCoordinateDependentLinearObject3D(board, 'segment', evaluator, { name: config.name, withLabel: true, visible: config.visible, fixed: true, strokeColor: config.color, strokeWidth: 3 });
      object.__liaDgsSegmentName = config.name;
      object.__liaSceneRecord = createAnalyticConstruction3DRecord(
        config.objectId || 'macro:analytic3d:' + uid, operation, 'segment3d', sourceIds(sources),
        { name: config.name, visible: config.visible, fixed: true }
      );
    } else {
      const evaluator = () => scalarResult(config, sources);
      const value = evaluator();
      if (typeof value === 'number' && !Number.isFinite(value)) return false;
      object = { board, __liaAnalytic3DEvaluator: evaluator, __liaDgsAnalytic3DValue: value };
      object.__liaSceneRecord = createAnalyticScalar3DRecord(config.objectId || 'macro:analytic3d:' + uid, operation, sourceIds(sources), { name: config.name, showValue: config.showValue, visible: config.visible, fixed: config.fixed, unit: operation.startsWith('angle') ? 'angle' : (operation.startsWith('distance') || operation === 'magnitude' || operation === 'curve-arc-length' ? 'length' : 'scalar') });
    }
    decorate(object, config, uid, sources);
    objectsCreated.push(object);
    window.__analytic3DEntries![uid] = { board, boardId: config.boardId, object, objects: objectsCreated, config, spec, operation };
    board.fullUpdate?.();
    return true;
  } catch (error) {
    objectsCreated.forEach(object => cleanup(board, object));
    return false;
  }
}

export function init(): void {
  if (window.__analytic3DReady) { window.__scheduleBootstrapAnalytic3D?.(); return; }
  window.__analytic3DReady = true; window.__analytic3DEntries = window.__analytic3DEntries || {};
  window.renderAnalytic3DFromSpec = createOrUpdate;
  let dependencyRetryCount = 0;
  let dependencyRetryTimer = 0;
  window.__bootstrapAnalytic3D = () => {
    let pending = false; const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="analytic3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('analytic3d-spec-'.length); active.add(uid);
      if (!createOrUpdate(uid, marker.dataset.spec || '', marker.dataset.operation || 'dot')) pending = true;
    });
    Object.keys(window.__analytic3DEntries || {}).forEach(key => { if (!active.has(key)) removeEntry(key); });
    if (!pending) dependencyRetryCount = 0;
    else if (dependencyRetryCount < 16 && !dependencyRetryTimer) {
      dependencyRetryCount += 1;
      dependencyRetryTimer = window.setTimeout(() => {
        dependencyRetryTimer = 0;
        window.__scheduleBootstrapAnalytic3D?.();
      }, 160);
    }
  };
  window.__scheduleBootstrapAnalytic3D = () => {
    if (window.__bootstrapAnalytic3DRAF) return;
    window.__bootstrapAnalytic3DRAF = requestAnimationFrame(() => { window.__bootstrapAnalytic3DRAF = 0; window.__bootstrapAnalytic3D?.(); });
  };
  window.__analytic3DObserver = new MutationObserver(records => {
    const relevant = records.some(record => {
      const target = record.target as Element;
      if (record.type === 'attributes') return target?.id?.startsWith('analytic3d-spec-');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
        node.nodeType === 1 && (
          (node as Element).id?.startsWith('analytic3d-spec-') ||
          !!(node as Element).querySelector?.('[id^="analytic3d-spec-"]')
        )
      );
    });
    if (relevant) {
      dependencyRetryCount = 0;
      if (dependencyRetryTimer) { window.clearTimeout(dependencyRetryTimer); dependencyRetryTimer = 0; }
      window.__scheduleBootstrapAnalytic3D?.();
    }
  });
  window.__analytic3DObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec','data-operation'] });
  scheduleBootstrap(() => window.__scheduleBootstrapAnalytic3D?.());
}