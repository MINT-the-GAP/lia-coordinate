import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { splitTopLevel, unquote, parseMacroName } from '../shared/parser';
import {
  coordinateCircle3DData, coordinateCurve3DData, coordinateLinear3DData, coordinatePlane3DData, coordinateSphere3DData,
  coordinatePolygon3DData, coordinateSolid3DData,
  createCoordinateDependentCircle3D, createCoordinateDependentLine3D,
  createCoordinateDependentPoint3D, createCoordinateDependentPolygon3D, getCoordinateView3D
} from '../coord/view3d';
import { circleFromCenterNormalRadius, intersectCircles3D, intersectLineCircle3D, intersectPlaneCircle3D, type Circle3 } from '../shared/circle3d';
import { intersectCircleSphere3D, intersectLineSphere3D, intersectPlaneSphere3D, intersectSpheres3D } from '../shared/sphere3d';
import { intersectLinePlane3D, intersectLines3D, intersectPlanes3D } from '../shared/plane3d';
import type { Vector3 } from '../shared/vector3d';
import { intersectLinePolygon3D, type Polygon3 } from '../shared/polygon3d';
import {
  curveContainedInPlane3D, intersectCurveLine3D, intersectCurvePlane3D,
  intersectCurvePolygon3D, intersectCurveSphere3D
} from '../shared/curve3d';
import {
  intersectLineCone3D, intersectLineCylinder3D, intersectLinePolyhedron3D,
  intersectPlanePolyhedron3D
} from '../shared/solid3d';

type IntersectionValue =
  | { kind: 'points'; points: Vector3[] }
  | { kind: 'line'; point: Vector3; direction: Vector3 }
  | { kind: 'circle'; circle: Circle3 }
  | { kind: 'polygon'; polygon: Polygon3 };

type IntersectionCapabilities = { points: number; line: boolean; circle: boolean; polygon: boolean };

type IntersectionConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  firstName: string;
  secondName: string;
  color: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  persistentId: string;
  language: 'de' | 'en';
};

function bool(value: unknown, fallback: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (/^(?:1|true|yes|ja|on)$/.test(normalized)) return true;
  if (/^(?:0|false|no|nein|off)$/.test(normalized)) return false;
  return fallback;
}

function parseSpec(spec: string, languageValue?: string): IntersectionConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const name = parseMacroName(parts[1] || 'S', 'S');
  const options: Record<string, string> = {};
  parts.slice(6).forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) options[match[1].trim().toLowerCase()] = unquote(match[2].trim());
  });
  const opacity = Number(String(parts[5] || '1').replace(',', '.'));
  return {
    boardId: parts[0] || '',
    name: name.name,
    showName: name.showName,
    firstName: parts[2] || '',
    secondName: parts[3] || '',
    color: /^#[0-9a-f]{3,8}$/i.test(parts[4] || '') ? parts[4] : '#ff00ff',
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
    visible: bool(options.visible ?? options.sichtbar, true),
    fixed: bool(options.fixed ?? options.fixiert, true),
    persistentId: String(options.objectid ?? options.objektid ?? ''),
    language: String(languageValue || '').toLowerCase() === 'en' ? 'en' : 'de'
  };
}

function plainName(value: unknown): string {
  return String(value || '').replace(/\\\(|\\\)|\$/g, '').trim();
}

function objectName(object: any): string {
  return plainName(
    object?.__liaDgsPlaneName || object?.__liaDgsCircleName || object?.__liaDgsSphereName ||
    object?.__liaDgsPolygon3DName || object?.__liaDgsSolid3DName ||
    object?.__liaDgsLineName || object?.__liaDgsRayName || object?.__liaDgsVectorName ||
    object?.__liaDgsSegmentName || object?.__liaDgsCurve3DName || object?.__liaDgsConic3DName ||
    object?.__liaSceneRecord?.name || object?.name
  );
}

function sourceByName(board: any, name: string): any | null {
  const entry = getCoordinateView3D(board);
  const sources = [
    ...Array.from(entry?.linearObjects || []),
    ...Array.from(entry?.planeObjects || []),
    ...Array.from(entry?.circleObjects || []),
    ...Array.from(entry?.sphereObjects || []),
    ...Array.from(entry?.polygonObjects || []),
    ...Array.from(entry?.solidObjects || []),
    ...Array.from(entry?.curveObjects || [])
  ] as any[];
  return sources.find(source => objectName(source) === plainName(name)) || null;
}

function pointValue(points: Vector3[]): IntersectionValue | null {
  return points.length ? { kind: 'points', points: points.slice(0, 16) } : null;
}

function value(first: any, second: any): IntersectionValue | null {
  const firstPlane = coordinatePlane3DData(first);
  const secondPlane = coordinatePlane3DData(second);
  const firstLine = coordinateLinear3DData(first);
  const secondLine = coordinateLinear3DData(second);
  const firstCircle = coordinateCircle3DData(first);
  const secondCircle = coordinateCircle3DData(second);
  const firstSphere = coordinateSphere3DData(first);
  const secondSphere = coordinateSphere3DData(second);
  const firstPolygon = coordinatePolygon3DData(first);
  const secondPolygon = coordinatePolygon3DData(second);
  const firstSolid = coordinateSolid3DData(first);
  const secondSolid = coordinateSolid3DData(second);
  const firstCurve = coordinateCurve3DData(first);
  const secondCurve = coordinateCurve3DData(second);

  if (firstCurve && secondPlane) {
    if (curveContainedInPlane3D(firstCurve, secondPlane)) return null;
    return pointValue(intersectCurvePlane3D(firstCurve, secondPlane).map(result => result.point));
  }
  if (firstPlane && secondCurve) return value(second, first);
  if (firstCurve && secondSphere) return pointValue(intersectCurveSphere3D(firstCurve, secondSphere).map(result => result.point));
  if (firstSphere && secondCurve) return value(second, first);
  if (firstCurve && secondPolygon) return pointValue(intersectCurvePolygon3D(firstCurve, secondPolygon).map(result => result.point));
  if (firstPolygon && secondCurve) return value(second, first);
  if (firstCurve && first.__liaConicSection3D && secondLine) {
    return pointValue(intersectCurveLine3D(firstCurve, secondLine.anchor, secondLine.direction, secondLine.domain).map(result => result.point));
  }
  if (firstLine && secondCurve && second.__liaConicSection3D) return value(second, first);

  if (firstPlane && secondSolid && secondSolid.kind !== 'cylinder' && secondSolid.kind !== 'cone') {
    const polygon = intersectPlanePolyhedron3D(firstPlane, secondSolid);
    return polygon ? { kind: 'polygon', polygon } : null;
  }
  if (firstSolid && firstSolid.kind !== 'cylinder' && firstSolid.kind !== 'cone' && secondPlane) {
    return value(second, first);
  }
  if (firstPlane && secondPlane) {
    const result = intersectPlanes3D(firstPlane, secondPlane);
    return result.kind === 'line' && result.point && result.direction
      ? { kind: 'line', point: result.point, direction: result.direction } : null;
  }
  if (firstLine && secondPlane) {
    const result = intersectLinePlane3D(firstLine.anchor, firstLine.direction, secondPlane, firstLine.domain);
    return result.kind === 'point' && result.point ? pointValue([result.point]) : null;
  }
  if (firstPlane && secondLine) return value(second, first);
  if (firstLine && secondLine) {
    const result = intersectLines3D(
      firstLine.anchor, firstLine.direction, secondLine.anchor, secondLine.direction,
      firstLine.domain, secondLine.domain
    );
    return result.kind === 'point' && result.point ? pointValue([result.point]) : null;
  }
  if (firstLine && secondPolygon) {
    const result = intersectLinePolygon3D(
      firstLine.anchor, firstLine.direction, secondPolygon, firstLine.domain
    );
    return result.kind === 'point' && result.point ? pointValue([result.point]) : null;
  }
  if (firstPolygon && secondLine) return value(second, first);
  if (firstLine && secondSolid) {
    const result = secondSolid.kind === 'cylinder'
      ? intersectLineCylinder3D(firstLine.anchor, firstLine.direction, secondSolid, firstLine.domain)
      : (secondSolid.kind === 'cone'
        ? intersectLineCone3D(firstLine.anchor, firstLine.direction, secondSolid, firstLine.domain)
        : intersectLinePolyhedron3D(firstLine.anchor, firstLine.direction, secondSolid, firstLine.domain));
    return pointValue(result.points);
  }
  if (firstSolid && secondLine) return value(second, first);
  if (firstLine && secondCircle) {
    const result = intersectLineCircle3D(firstLine.anchor, firstLine.direction, secondCircle, firstLine.domain);
    return pointValue(result.points);
  }
  if (firstCircle && secondLine) return value(second, first);
  if (firstLine && secondSphere) {
    const result = intersectLineSphere3D(firstLine.anchor, firstLine.direction, secondSphere, firstLine.domain);
    return pointValue(result.points);
  }
  if (firstSphere && secondLine) return value(second, first);
  if (firstPlane && secondCircle) {
    const result = intersectPlaneCircle3D(firstPlane, secondCircle);
    return result.kind === 'coincident'
      ? { kind: 'circle', circle: secondCircle }
      : pointValue(result.points);
  }
  if (firstCircle && secondPlane) return value(second, first);
  if (firstPlane && secondSphere) {
    const result = intersectPlaneSphere3D(firstPlane, secondSphere);
    if (result.kind === 'circle' && result.circle) return { kind: 'circle', circle: result.circle };
    return result.kind === 'point' && result.point ? pointValue([result.point]) : null;
  }
  if (firstSphere && secondPlane) return value(second, first);
  if (firstCircle && secondCircle) return pointValue(intersectCircles3D(firstCircle, secondCircle).points);
  if (firstCircle && secondSphere) return pointValue(intersectCircleSphere3D(firstCircle, secondSphere).points);
  if (firstSphere && secondCircle) return value(second, first);
  if (firstSphere && secondSphere) {
    const result = intersectSpheres3D(firstSphere, secondSphere);
    if (result.kind === 'circle' && result.circle) return { kind: 'circle', circle: result.circle };
    return result.kind === 'point' && result.point ? pointValue([result.point]) : null;
  }
  return null;
}

function capabilities(first: any, second: any): IntersectionCapabilities {
  const curve1 = coordinateCurve3DData(first);
  const curve2 = coordinateCurve3DData(second);
  if (curve1 || curve2) {
    const current = value(first, second);
    return { points: current?.kind === 'points' ? current.points.length : 0, line: false, circle: false, polygon: false };
  }
  const plane1 = !!coordinatePlane3DData(first);
  const plane2 = !!coordinatePlane3DData(second);
  const circle1 = !!coordinateCircle3DData(first);
  const circle2 = !!coordinateCircle3DData(second);
  const sphere1 = !!coordinateSphere3DData(first);
  const sphere2 = !!coordinateSphere3DData(second);
  const polygon1 = !!coordinatePolygon3DData(first);
  const polygon2 = !!coordinatePolygon3DData(second);
  const solid1 = coordinateSolid3DData(first);
  const solid2 = coordinateSolid3DData(second);
  const line1 = !!coordinateLinear3DData(first);
  const line2 = !!coordinateLinear3DData(second);
  const planeSolid = (plane1 && solid2 && solid2.kind !== 'cylinder' && solid2.kind !== 'cone') ||
    (solid1 && solid1.kind !== 'cylinder' && solid1.kind !== 'cone' && plane2);
  if (planeSolid) return { points: 0, line: false, circle: false, polygon: true };
  if (plane1 && plane2) return { points: 0, line: true, circle: false, polygon: false };
  if ((plane1 && sphere2) || (sphere1 && plane2) || (sphere1 && sphere2)) {
    return { points: 1, line: false, circle: true, polygon: false };
  }
  if ((plane1 && circle2) || (circle1 && plane2)) {
    return { points: 2, line: false, circle: true, polygon: false };
  }
  if ((line1 && (solid2 || polygon2)) || ((solid1 || polygon1) && line2)) {
    return { points: solid1 || solid2 ? 2 : 1, line: false, circle: false, polygon: false };
  }
  if (circle1 || circle2 || sphere1 || sphere2) {
    return { points: 2, line: false, circle: false, polygon: false };
  }
  return { points: 1, line: false, circle: false, polygon: false };
}

function cleanupObject(board: any, boardId: string, object: any): void {
  const name = String(object?.__liaDgsPointName || '');
  try { object?.__liaPoint3DCleanup?.(); } catch (e) {}
  try { object?.__liaLinear3DCleanup?.(); } catch (e) {}
  try { object?.__liaCircle3DCleanup?.(); } catch (e) {}
  try { object?.__liaPolygon3DCleanup?.(); } catch (e) {}
  try { board?.removeObject?.(object); } catch (e) {}
  if (name && window.__points?.[boardId]?.[name] === object) delete window.__points[boardId][name];
}

function removeEntry(key: string): void {
  const entry = window.__intersection3DEntries?.[key];
  if (!entry) return;
  (entry.objects || [entry.object]).filter(Boolean).forEach((object: any) =>
    cleanupObject(entry.board, entry.boardId, object));
  delete window.__intersection3DEntries![key];
}

function decorate(
  object: any, config: IntersectionConfig, uid: string, first: any, second: any,
  kind: 'point' | 'line' | 'circle' | 'polygon', branch = 0
): void {
  const branchSuffix = kind === 'point' && branch >= 0 ? ':branch:' + branch : '';
  object.__liaDgsSpatialIntersection = true;
  object.__liaDgsSpatialIntersectionKind = kind;
  object.__liaDgsSpatialIntersectionBranch = kind === 'point' ? branch : undefined;
  object.__liaDgsSpatialIntersectionSource = first;
  object.__liaDgsSpatialIntersectionSource2 = second;
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:intersection3d:' + uid + branchSuffix;
  object.__liaDgsPersistentId = (config.persistentId || 'macro:intersection3d:' + uid) + branchSuffix;
  object.__liaDgsLanguage = config.language;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsShowObject = config.visible;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLineColor = config.color;
  object.__liaDgsFillColor = config.color;
  object.__liaDgsTextColor = config.color;
  object.__liaDgsOpacity = config.opacity;
  object.__liaDgsLineStyle = 'solid';
  object.__liaDgsSegmentStrokeWidth = 3;
}

function applyAppearance(
  object: any, config: IntersectionConfig, uid: string, first: any, second: any
): void {
  const kind = object.__liaDgsSpatialIntersectionKind as 'point' | 'line' | 'circle' | 'polygon';
  const branch = kind === 'point' ? Number(object.__liaDgsSpatialIntersectionBranch || 0) : -1;
  decorate(object, config, uid, first, second, kind, branch);
  const displayName = kind === 'point' && capabilities(first, second).points === 2
    ? config.name + '_' + (branch + 1)
    : config.name;
  if (kind === 'point') {
    object.__liaDgsPointName = displayName;
    object.__liaPoint3DUserVisible = config.visible;
  } else if (kind === 'line') {
    object.__liaDgsLineName = displayName;
    object.__liaLinear3DUserVisible = config.visible;
  } else {
    object.__liaDgsCircleName = displayName;
    object.__liaCircle3DUserVisible = config.visible;
  }
  const parts = [
    object, object?.curve, object?.element2D,
    ...(Array.isArray(object?.aux2D) ? object.aux2D : []),
    object?.label
  ].filter((part, index, all) => part && all.indexOf(part) === index);
  parts.forEach(part => {
    try {
      part.setAttribute?.({
        strokeColor: config.color,
        highlightStrokeColor: config.color,
        fillColor: config.color,
        highlightFillColor: config.color,
        strokeOpacity: config.visible ? config.opacity : 0,
        highlightStrokeOpacity: config.visible ? config.opacity : 0,
        fillOpacity: kind === 'circle' ? 0 : (config.visible ? config.opacity : 0),
        highlightFillOpacity: kind === 'circle' ? 0 : (config.visible ? config.opacity : 0),
        fixed: config.fixed
      });
    } catch (e) {}
  });
  try {
    object.setAttribute?.({
      name: config.showName ? '\\(' + displayName + '\\)' : '',
      withLabel: config.showName
    });
    object.label?.setAttribute?.({ visible: config.showName });
  } catch (e) {}
}

function connectIntersectionGroup(objects: any[], owner: any): void {
  objects.forEach(object => {
    object.__liaDgsSpatialIntersectionOwner = owner;
    object.__liaDgsSpatialIntersectionObjects = objects;
    object.__liaDgsSpatialIntersectionBranchHelper = object !== owner;
  });
}

function createPointBranch(
  board: any, config: IntersectionConfig, uid: string, first: any, second: any,
  branch: number, seed: Vector3
): any {
  let initializing = true;
  const evaluator = () => {
    const next = value(first, second);
    if (next?.kind === 'points' && next.points[branch]) return next.points[branch];
    return initializing ? seed : null;
  };
  const branchName = capabilities(first, second).points === 2 ? config.name + '_' + (branch + 1) : config.name;
  const object = createCoordinateDependentPoint3D(board, evaluator, {
    name: config.showName ? '\\(' + branchName + '\\)' : '',
    withLabel: config.showName, fixed: config.fixed, visible: config.visible,
    strokeColor: config.color, fillColor: config.color,
    strokeOpacity: config.visible ? config.opacity : 0,
    fillOpacity: config.visible ? config.opacity : 0, size: 7, face: 'x'
  });
  initializing = false;
  object.__liaDgsPointName = branchName;
  decorate(object, config, uid, first, second, 'point', branch);
  window.__points = window.__points || {};
  window.__points[config.boardId] = window.__points[config.boardId] || {};
  window.__points[config.boardId][branchName] = object;
  return object;
}

function createCircleBranch(
  board: any, config: IntersectionConfig, uid: string, first: any, second: any, seed: Circle3
): any {
  let initializing = true;
  const evaluator = () => {
    const next = value(first, second);
    return next?.kind === 'circle' ? next.circle : (initializing ? seed : null);
  };
  const object = createCoordinateDependentCircle3D(board, evaluator, {
    name: config.showName ? '\\(' + config.name + '\\)' : '',
    withLabel: config.showName, fixed: config.fixed, visible: config.visible,
    strokeColor: config.color, strokeOpacity: config.visible ? config.opacity : 0,
    strokeWidth: 3
  });
  initializing = false;
  object.__liaDgsCircleName = config.name;
  decorate(object, config, uid, first, second, 'circle', -1);
  return object;
}


function createPolygonBranch(
  board: any, config: IntersectionConfig, uid: string, first: any, second: any, seed: Polygon3
): any {
  let initializing = true;
  const evaluator = () => {
    const next = value(first, second);
    return next?.kind === 'polygon' ? next.polygon : (initializing ? seed : null);
  };
  const object = createCoordinateDependentPolygon3D(board, evaluator, {
    name: config.showName ? '\\(' + config.name + '\\)' : '',
    withLabel: config.showName, fixed: config.fixed, visible: config.visible,
    strokeColor: config.color, fillColor: config.color,
    strokeOpacity: config.visible ? config.opacity : 0,
    fillOpacity: config.visible ? Math.min(0.3, config.opacity) : 0,
    strokeWidth: 3
  });
  initializing = false;
  object.__liaDgsPolygon3DName = config.name;
  decorate(object, config, uid, first, second, 'polygon', -1);
  return object;
}
function createOrUpdate(uid: string, spec: string, language?: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, language)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, language?: string): boolean {
  const config = parseSpec(spec, language);
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') return false;
  const key = String(uid);
  const previous = window.__intersection3DEntries?.[key];
  const first = sourceByName(board, config.firstName);
  const second = sourceByName(board, config.secondName);
  if (!first || !second) {
    if (previous) removeEntry(key);
    return false;
  }
  const initial = value(first, second);
  if (!initial) return false;
  const caps = capabilities(first, second);
  const reusable = previous?.board === board && previous?.first === first && previous?.second === second &&
    previous?.capabilities?.points === caps.points && previous?.capabilities?.line === caps.line &&
    previous?.capabilities?.circle === caps.circle && previous?.capabilities?.polygon === caps.polygon;
  if (reusable && previous.spec === spec && JSON.stringify(previous.config) === JSON.stringify(config)) return true;
  if (!reusable && previous) removeEntry(key);
  if (reusable) {
    previous.objects.forEach((object: any) => applyAppearance(object, config, uid, first, second));
    connectIntersectionGroup(previous.objects, previous.object);
    previous.config = config;
    previous.spec = spec;
    previous.language = language;
    try { board.fullUpdate?.(); } catch (e) { try { board.update?.(); } catch (e2) {} }
    return true;
  }
  const objects: any[] = [];
  try {
    if (caps.line) {
      const lineSeed = initial.kind === 'line' ? initial : { kind: 'line' as const, point: [0, 0, 0] as Vector3, direction: [1, 0, 0] as Vector3 };
      const object = createCoordinateDependentLine3D(board, () => {
        const next = value(first, second);
        return next?.kind === 'line' ? { point: next.point, direction: next.direction } : null;
      }, {
        name: config.showName ? '\\(' + config.name + '\\)' : '',
        withLabel: config.showName, fixed: config.fixed, visible: config.visible,
        strokeColor: config.color, strokeOpacity: config.visible ? config.opacity : 0, strokeWidth: 3
      });
      object.__liaDgsLine = true;
      object.__liaDgsLineName = config.name;
      decorate(object, config, uid, first, second, 'line', -1);
      objects.push(object);
    }
    if (caps.points) {
      const seeds = initial.kind === 'points' ? initial.points : [[0, 0, 0] as Vector3];
      for (let branch = 0; branch < caps.points; branch += 1) {
        objects.push(createPointBranch(board, config, uid, first, second, branch, seeds[branch] || seeds[0]));
      }
    }
    if (caps.circle) {
      const seed = initial.kind === 'circle'
        ? initial.circle
        : circleFromCenterNormalRadius([0, 0, 0], [0, 0, 1], 1)!;
      objects.push(createCircleBranch(board, config, uid, first, second, seed));
    }
    if (caps.polygon && initial.kind === 'polygon') {
      objects.push(createPolygonBranch(board, config, uid, first, second, initial.polygon));
    }
    const visibleObject = objects.find(object => {
      const kind = object.__liaDgsSpatialIntersectionKind;
      return (initial.kind === 'line' && kind === 'line') ||
        (initial.kind === 'circle' && kind === 'circle') ||
        (initial.kind === 'polygon' && kind === 'polygon') ||
        (initial.kind === 'points' && kind === 'point' && object.__liaDgsSpatialIntersectionBranch === 0);
    }) || objects[0];
    objects.forEach(object => applyAppearance(object, config, uid, first, second));
    connectIntersectionGroup(objects, visibleObject);
    window.__intersection3DEntries![key] = {
      board, boardId: config.boardId, object: visibleObject, objects, first, second,
      kind: initial.kind, capabilities: caps, config, spec, language
    };
    board.fullUpdate?.();
    return true;
  } catch (e) {
    objects.forEach(object => cleanupObject(board, config.boardId, object));
    return false;
  }
}

export function init(): void {
  if (window.__intersection3DReady) {
    window.__scheduleBootstrapIntersection3D?.();
    return;
  }
  window.__intersection3DReady = true;
  window.__intersection3DEntries = window.__intersection3DEntries || {};
  window.renderIntersection3DFromSpec = createOrUpdate;
  let dependencyRetryCount = 0;
  let dependencyRetryTimer = 0;
  window.__bootstrapIntersection3D = () => {
    let pending = false;
    const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="intersection3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('intersection3d-spec-'.length);
      active.add(uid);
      if (!createOrUpdate(uid, marker.dataset.spec || '', marker.dataset.language)) pending = true;
    });
    Object.keys(window.__intersection3DEntries || {}).forEach(key => {
      if (!active.has(key)) removeEntry(key);
    });
    if (!pending) dependencyRetryCount = 0;
    else if (dependencyRetryCount < 24 && !dependencyRetryTimer) {
      dependencyRetryCount += 1;
      dependencyRetryTimer = window.setTimeout(() => {
        dependencyRetryTimer = 0;
        window.__scheduleBootstrapIntersection3D?.();
      }, 160);
    }
  };
  window.__scheduleBootstrapIntersection3D = () => {
    if (window.__bootstrapIntersection3DRAF) return;
    window.__bootstrapIntersection3DRAF = requestAnimationFrame(() => {
      window.__bootstrapIntersection3DRAF = 0;
      window.__bootstrapIntersection3D?.();
    });
  };
  window.__intersection3DObserver = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (record.type === 'attributes') return (record.target as Element)?.id?.startsWith('intersection3d-spec-');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
        node.nodeType === 1 && (
          (node as Element).id?.startsWith('intersection3d-spec-') ||
          !!(node as Element).querySelector?.('[id^="intersection3d-spec-"]')
        )
      );
    });
    if (relevant) {
      dependencyRetryCount = 0;
      if (dependencyRetryTimer) { window.clearTimeout(dependencyRetryTimer); dependencyRetryTimer = 0; }
      window.__scheduleBootstrapIntersection3D?.();
    }
  });
  window.__intersection3DObserver.observe(document.body || document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-spec', 'data-language']
  });
  scheduleBootstrap(() => window.__scheduleBootstrapIntersection3D?.());
}
