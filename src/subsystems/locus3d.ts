import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinateCircle3DData, coordinateCurve3DData, coordinatePoint3DBindingParameters,
  coordinateSurface3DData, createCoordinateCurve3D, createCoordinateSurface3D,
  point3DCoordinates, getCoordinateView3D
} from '../coord/view3d';
import { createLocusCurve3D, createLocusSurface3D, type LocusDriver3D } from '../shared/locus3d';
import { createCurve3DRecord, createSurface3DRecord } from '../shared/scene3d';

type BaseConfig = {
  boardId: string; name: string; drivers: string[]; tracePoint: string;
  ranges: Array<[number, number] | null>; quality: number; color: string; fillColor: string;
  opacity: number; visible: boolean; fixed: boolean; objectId: string;
};
const number = (value: unknown, fallback = NaN): number => {
  const parsed = Number(String(value == null ? '' : value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => {
  const token = String(value == null ? '' : value).trim().toLowerCase();
  return /^(?:1|true|yes|ja|on)$/.test(token) ? true : (/^(?:0|false|no|nein|off)$/.test(token) ? false : fallback);
};
function parseSpec(spec: string, surface: boolean): BaseConfig | null {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(value => unquote(value).trim());
  const minimum = surface ? 5 : 4;
  if (parts.length < minimum) return null;
  const optionStart = surface ? 5 : 4;
  const options: Record<string, string> = {};
  parts.slice(optionStart).forEach(part => {
    const match = part.match(/^([^=]+)=(.*)$/);
    if (match) options[match[1].trim().toLowerCase()] = unquote(match[2].trim());
  });
  const readRange = (prefix: string): [number, number] | null => {
    const lower = number(options[prefix + 'min'] ?? options[(prefix === 't' ? 'von' : prefix + 'von')]);
    const upper = number(options[prefix + 'max'] ?? options[(prefix === 't' ? 'bis' : prefix + 'bis')]);
    return Number.isFinite(lower) && Number.isFinite(upper) && upper > lower ? [lower, upper] : null;
  };
  const name = parseMacroName(parts[1], surface ? 'L_S' : 'L');
  const color = options.linecolor || options.linienfarbe || '#00dfe8';
  const fill = options.fillcolor || options.fuellfarbe || options.füllfarbe || color;
  return {
    boardId: parts[0] || 'A1', name: name.name,
    drivers: surface ? [parts[2], parts[3]] : [parts[2]], tracePoint: surface ? parts[4] : parts[3],
    ranges: surface ? [readRange('u'), readRange('v')] : [readRange('t')],
    quality: Math.max(surface ? 4 : 8, Math.min(surface ? 64 : 256, Math.round(number(options.quality || options.qualitaet || options.qualität, surface ? 20 : 96)))),
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#00dfe8',
    fillColor: /^#[0-9a-f]{3,8}$/i.test(fill) ? fill : '#00dfe8',
    opacity: Math.max(0, Math.min(1, number(options.opacity || options.deckkraft, 0.28))),
    visible: bool(options.visible ?? options.sichtbar, true), fixed: bool(options.fixed ?? options.fixiert, true),
    objectId: String(options.objectid || options.objektid || '').trim()
  };
}
function plain(value: unknown): string { return String(value || '').replace(/\\\(|\\\)|\$/g, '').trim(); }
const samplingBoards = new WeakMap<object, number>();
const refreshingBoards = new WeakSet<object>();

function refreshLocusPointDependencies(board: any, trace: any): void {
  if (refreshingBoards.has(board)) return;
  refreshingBoards.add(board);
  try {
    const visited = new Set<any>();
    let objectsById: Map<string, any> | null = null;
    const resolveId = (id: unknown): any => {
      if (!objectsById) {
        objectsById = new Map();
        const view = getCoordinateView3D(board);
        const objects: any[] = view ? [
          ...view.points, ...view.linearObjects, ...view.planeObjects, ...view.circleObjects,
          ...view.sphereObjects, ...view.polygonObjects, ...view.solidObjects,
          ...view.curveObjects, ...view.surfaceObjects
        ] : [];
        objects.forEach(object => {
          [object.__liaDgsPersistentId, object.__liaSceneRecord?.id, object.id].filter(Boolean)
            .forEach(key => objectsById!.set(String(key), object));
        });
      }
      return objectsById.get(String(id));
    };
    const visit = (object: any): void => {
      if (!object || visited.has(object)) return;
      visited.add(object);
      // Follow the actual trace dependencies in source order. Updating all
      // spatial points here would also resample unrelated conics and loci.
      visit(object.__liaPoint3DBindingSource);
      [
        object.__liaDgsAnalytic3DSources, object.__liaLinear3DSourcePoints,
        object.__liaPlane3DSourcePoints, object.__liaCircle3DSourcePoints,
        object.__liaSphere3DSourcePoints, object.__liaPolygon3DSourcePoints,
        object.__liaSolid3DSourcePoints
      ].forEach(sources => { if (Array.isArray(sources)) sources.forEach(visit); });
      const record = object.__liaSceneRecord;
      [...(record?.sourceIds || []), ...(record?.referenceIds || [])]
        .forEach(id => visit(resolveId(id)));
      if (object.__liaPoint3D) {
        object.__liaPoint3DBindingSync?.();
        if (object.__liaPoint3DDependent) {
          object.prepareUpdate?.();
          object.update?.();
        }
      }
    };
    visit(trace);
  } finally {
    refreshingBoards.delete(board);
  }
}

function sampleWithoutBoardRedraw(board: any, trace: any, action: () => void): void {
  const depth = samplingBoards.get(board) || 0;
  const suspended = board.isSuspendedUpdate;
  samplingBoards.set(board, depth + 1);
  board.isSuspendedUpdate = true;
  try {
    action();
  } finally {
    try { refreshLocusPointDependencies(board, trace); } finally {
      board.isSuspendedUpdate = suspended;
      if (depth) samplingBoards.set(board, depth); else samplingBoards.delete(board);
    }
  }
}

function evaluateLocusTrace(board: any, trace: any): [number, number, number] | null {
  refreshLocusPointDependencies(board, trace);
  return point3DCoordinates(trace);
}

function syncDrivenPoint(point: any): void {
  try { point?.__liaPoint3DBindingSync?.(); } catch (error) {}
  if (!samplingBoards.has(point?.board)) point?.board?.update?.();
}
function sliderDriver(boardId: string, name: string): LocusDriver3D | null {
  const entry = Object.values(window.__sliderEntries || {}).find((candidate: any) =>
    String(candidate?.boardId || '') === boardId && plain(candidate?.name || candidate?.slider?.__liaDgsSliderName) === plain(name)) as any;
  const slider = entry?.slider;
  if (!slider || typeof slider.Value !== 'function' || typeof slider.setValue !== 'function') return null;
  const lower = number(entry.minimum, NaN);
  const upper = number(entry.maximum, NaN);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return null;
  return { id: String(entry.uid || name), source: slider, range: [lower, upper], get: () => Number(slider.Value()), set: value => slider.setValue(value) };
}
function pointDriver(boardId: string, nameValue: string): LocusDriver3D | null {
  const match = String(nameValue).match(/^(.*?)(?:\.(u|v|t))?$/);
  const name = match?.[1] || nameValue;
  const component = match?.[2] as 'u' | 'v' | 't' | undefined;
  const point = window.__points?.[boardId]?.[name];
  const binding = coordinatePoint3DBindingParameters(point);
  const source = point?.__liaPoint3DBindingSource;
  if (!point || !binding || !source) return null;
  if (binding.kind === 'curve') {
    const curve = coordinateCurve3DData(source);
    if (!curve) return null;
    return {
      source: point,
      id: String(point.__liaDgsPersistentId || name) + '.t', range: [...curve.range] as [number, number],
      get: () => Number(coordinatePoint3DBindingParameters(point)?.kind === 'curve' ? (coordinatePoint3DBindingParameters(point) as any).t : binding.t),
      set: value => { point.__liaPoint3DBindingParameters = { kind: 'curve', t: value }; syncDrivenPoint(point); }
    };
  }
  if (binding.kind === 'circle') {
    if (!coordinateCircle3DData(source)) return null;
    return {
      source: point,
      id: String(point.__liaDgsPersistentId || name) + '.angle', range: [0, 2 * Math.PI],
      get: () => Number((coordinatePoint3DBindingParameters(point) as any)?.angle ?? binding.angle),
      set: value => { point.__liaPoint3DBindingParameters = { kind: 'circle', angle: value }; syncDrivenPoint(point); }
    };
  }
  if (binding.kind === 'surface' && (component === 'u' || component === 'v')) {
    const surface = coordinateSurface3DData(source);
    if (!surface) return null;
    const key = component;
    return {
      source: point,
      id: String(point.__liaDgsPersistentId || name) + '.' + key,
      range: [...(key === 'u' ? surface.uRange : surface.vRange)] as [number, number],
      get: () => Number((coordinatePoint3DBindingParameters(point) as any)?.[key] ?? binding[key]),
      set: value => {
        const current = coordinatePoint3DBindingParameters(point);
        if (current?.kind !== 'surface') return;
        point.__liaPoint3DBindingParameters = { ...current, [key]: value };
        syncDrivenPoint(point);
      }
    };
  }
  return null;
}
function driver(boardId: string, name: string, range: [number, number] | null): LocusDriver3D | null {
  const result = sliderDriver(boardId, name) || pointDriver(boardId, name);
  return result && range ? { ...result, range } : result;
}
function cleanup(board: any, object: any): void {
  try { object?.__liaCurve3DCleanup?.(); } catch (error) {}
  try { object?.__liaSurface3DCleanup?.(); } catch (error) {}
  try { board?.removeObject?.(object); } catch (error) {}
}
function removeEntry(registryName: '__locus3DEntries' | '__locusSurface3DEntries', key: string): void {
  const registry = window[registryName] as Record<string, any> | undefined;
  const entry = registry?.[key]; if (!entry) return;
  cleanup(entry.board, entry.object); delete registry![key];
}
function sameDriver(previous: LocusDriver3D | undefined, next: LocusDriver3D): boolean {
  return !!previous && previous.source === next.source && previous.id === next.id &&
    previous.range[0] === next.range[0] && previous.range[1] === next.range[1];
}
function createCurve(uid: string, spec: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createCurveSpatial(uid, spec)) === true;
}

function createCurveSpatial(uid: string, spec: string): boolean {
  const config = parseSpec(spec, false); const board = config && window.__boards?.[config.boardId];
  if (!config || !board || board.__liaSceneMode !== '3d') return false;
  const trace = window.__points?.[config.boardId]?.[config.tracePoint];
  const source = driver(config.boardId, config.drivers[0], config.ranges[0]);
  if (!trace?.__liaPoint3D || !source) return false;
  const previous = window.__locus3DEntries?.[uid];
  if (previous?.board === board && previous.spec === spec && previous.trace === trace &&
      sameDriver(previous.driver, source)) return true;
  if (previous) removeEntry('__locus3DEntries', uid);
  const definition = createLocusCurve3D(source, String(trace.__liaDgsPersistentId || config.tracePoint), () => evaluateLocusTrace(board, trace), { quality: config.quality, batch: action => sampleWithoutBoardRedraw(board, trace, action) });
  if (!definition) return false;
  try {
    const object = createCoordinateCurve3D(board, definition.curve, { name: config.name, withLabel: true, visible: config.visible, fixed: config.fixed, strokeColor: config.color, strokeWidth: 3 });
    object.__liaLocus3D = true; object.__liaDgsCurve3DName = config.name;
    object.__liaDgsMacroManaged = true; object.__liaDgsMacroKey = 'macro:locus3d:' + uid;
    object.__liaDgsPersistentId = config.objectId || object.__liaDgsMacroKey;
    object.__liaDgsShowObject = config.visible; object.__liaDgsFixed = config.fixed; object.__liaDgsLineColor = config.color;
    object.__liaSceneRecord = createCurve3DRecord(object.__liaDgsPersistentId, ['locus-x(t)','locus-y(t)','locus-z(t)'], definition.range, { kind: 'locus-curve3d', name: config.name, quality: config.quality, driverIds: [source.id], tracePointId: definition.tracePointId, visible: config.visible, fixed: config.fixed, style: { lineColor: config.color } });
    window.__locus3DEntries![uid] = { board, boardId: config.boardId, object, config, spec, definition, driver: source, trace };
    board.fullUpdate?.(); return true;
  } catch (error) { return false; }
}
function createSurface(uid: string, spec: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createSurfaceSpatial(uid, spec)) === true;
}

function createSurfaceSpatial(uid: string, spec: string): boolean {
  const config = parseSpec(spec, true); const board = config && window.__boards?.[config.boardId];
  if (!config || !board || board.__liaSceneMode !== '3d') return false;
  const trace = window.__points?.[config.boardId]?.[config.tracePoint];
  const first = driver(config.boardId, config.drivers[0], config.ranges[0]);
  const second = driver(config.boardId, config.drivers[1], config.ranges[1]);
  if (!trace?.__liaPoint3D || !first || !second) return false;
  const previous = window.__locusSurface3DEntries?.[uid];
  if (previous?.board === board && previous.spec === spec && previous.trace === trace &&
      sameDriver(previous.drivers?.[0], first) && sameDriver(previous.drivers?.[1], second)) return true;
  if (previous) removeEntry('__locusSurface3DEntries', uid);
  const definition = createLocusSurface3D(first, second, String(trace.__liaDgsPersistentId || config.tracePoint), () => evaluateLocusTrace(board, trace), { quality: [config.quality, config.quality], batch: action => sampleWithoutBoardRedraw(board, trace, action) });
  if (!definition) return false;
  try {
    const object = createCoordinateSurface3D(board, definition.surface, { name: config.name, withLabel: true, visible: config.visible, fixed: config.fixed, strokeColor: config.color, fillColor: config.fillColor, fillOpacity: config.opacity });
    object.__liaLocusSurface3D = true; object.__liaDgsSurface3DName = config.name;
    object.__liaDgsMacroManaged = true; object.__liaDgsMacroKey = 'macro:locus-surface3d:' + uid;
    object.__liaDgsPersistentId = config.objectId || object.__liaDgsMacroKey;
    object.__liaDgsShowObject = config.visible; object.__liaDgsFixed = config.fixed;
    object.__liaDgsLineColor = config.color; object.__liaDgsFillColor = config.fillColor; object.__liaDgsOpacity = config.opacity;
    object.__liaSceneRecord = createSurface3DRecord(object.__liaDgsPersistentId, ['locus-x(u,v)','locus-y(u,v)','locus-z(u,v)'], definition.uRange, definition.vRange, { kind: 'locus-surface3d', definition: 'locus', name: config.name, quality: definition.quality, driverIds: definition.driverIds, tracePointId: definition.tracePointId, visible: config.visible, fixed: config.fixed, style: { lineColor: config.color, fillColor: config.fillColor, opacity: config.opacity } });
    window.__locusSurface3DEntries![uid] = { board, boardId: config.boardId, object, config, spec, definition, drivers: [first, second], trace };
    board.fullUpdate?.(); return true;
  } catch (error) { return false; }
}
export function init(): void {
  if (window.__locus3DReady) { window.__scheduleBootstrapLocus3D?.(); return; }
  window.__locus3DReady = true; window.__locus3DEntries = window.__locus3DEntries || {}; window.__locusSurface3DEntries = window.__locusSurface3DEntries || {};
  window.renderLocus3DFromSpec = createCurve; window.renderLocusSurface3DFromSpec = createSurface;
  let dependencyRetryCount = 0;
  let dependencyRetryTimer = 0;
  window.__bootstrapLocus3D = () => {
    let pending = false; const curves = new Set<string>(); const surfaces = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="locus3d-spec-"]').forEach(marker => { const uid = marker.id.slice('locus3d-spec-'.length); curves.add(uid); if (!createCurve(uid, marker.dataset.spec || '')) pending = true; });
    document.querySelectorAll<HTMLElement>('[id^="locussurface3d-spec-"]').forEach(marker => { const uid = marker.id.slice('locussurface3d-spec-'.length); surfaces.add(uid); if (!createSurface(uid, marker.dataset.spec || '')) pending = true; });
    Object.keys(window.__locus3DEntries || {}).forEach(key => { if (!curves.has(key)) removeEntry('__locus3DEntries', key); });
    Object.keys(window.__locusSurface3DEntries || {}).forEach(key => { if (!surfaces.has(key)) removeEntry('__locusSurface3DEntries', key); });
    if (!pending) dependencyRetryCount = 0;
    else if (dependencyRetryCount < 16 && !dependencyRetryTimer) {
      dependencyRetryCount += 1;
      dependencyRetryTimer = window.setTimeout(() => {
        dependencyRetryTimer = 0;
        window.__scheduleBootstrapLocus3D?.();
      }, 160);
    }
  };
  window.__scheduleBootstrapLocus3D = () => {
    if (window.__bootstrapLocus3DRAF) return;
    window.__bootstrapLocus3DRAF = requestAnimationFrame(() => { window.__bootstrapLocus3DRAF = 0; window.__bootstrapLocus3D?.(); });
  };
  window.__locus3DObserver = new MutationObserver(records => {
    const relevant = records.some(record => {
      const target = record.target as Element;
      if (record.type === 'attributes') return /^(?:locus3d|locussurface3d)-spec-/.test(target?.id || '');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
        node.nodeType === 1 && (
          /^(?:locus3d|locussurface3d)-spec-/.test((node as Element).id || '') ||
          !!(node as Element).querySelector?.('[id^="locus3d-spec-"],[id^="locussurface3d-spec-"]')
        )
      );
    });
    if (relevant) {
      dependencyRetryCount = 0;
      if (dependencyRetryTimer) { window.clearTimeout(dependencyRetryTimer); dependencyRetryTimer = 0; }
      window.__scheduleBootstrapLocus3D?.();
    }
  });
  window.__locus3DObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec'] });
  scheduleBootstrap(() => window.__scheduleBootstrapLocus3D?.());
}
