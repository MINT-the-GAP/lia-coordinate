import { cameraAfterAxisDrag, cameraAfterTrackballDrag, cameraScreenBasis, snapCameraToCoordinatePlane } from '../shared/cameraDrag3d';
import { installCoordinateSphereAppearance3D } from './sphereAppearance3d';
import { installCoordinateSolidAppearance3D } from './solidAppearance3d';
import { installRoundRadiusPoint3D } from './roundRadiusPoint3d';
import { mountCoordinateOcclusion3D, type CoordinateOcclusion3DController } from './coordinateOcclusion3d';
import type { BoardConfig } from '../shared/coordSpec';
import { createCircle3DRecord, createLinear3DRecord, createPlane3DRecord, createSphere3DRecord, createPolygon3DRecord, createSolid3DRecord, normalizeSpatialRanges3D } from '../shared/scene3d';
import type { Camera3D, Circle3DDefinition, Linear3DKind, Plane3DDefinition, Projection3D, SceneViewMode, Sphere3DDefinition, Solid3DDefinition, SpatialRanges3D } from '../shared/scene3d';
import { addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Components, vector3Endpoint, vector3Norm } from '../shared/vector3d';
import type { Vector3 } from '../shared/vector3d';
import {
  nearestPointOnPolygon3D, polygonFromPoints3D, polygonLocalCoordinates3D, polygonPointAt3D, type Polygon3
} from '../shared/polygon3d';
import {
  coneFromBaseApexRadius3D, cylinderFromAxisRadius3D, parallelepipedFromPointVectors3D,
  prismFromBaseVector3D, pyramidFromBaseApex3D, tetrahedronFromPoints3D,
  nearestPointOnSolid3D, solidBindingAt3D, solidPointAt3D, roundSolidSilhouetteAngles3D,
  type Solid3
} from '../shared/solid3d';
import { clipPlaneToBounds3D, planeFromPointNormal, planeFromPointVectors, planeFromThreePoints, type LinearDomain3D, type Plane3 } from '../shared/plane3d';
import {
  circleFromCenterNormalRadius, circleFromThreePoints, circleParameterAt, circlePointAt,
  nearestPointOnCircle, type Circle3
} from '../shared/circle3d';
import { createEvaluatedCurve3D, evaluateCurve3D, nearestCurveParameter3D, type ParametricCurve3D } from '../shared/curve3d';
import { evaluateSurface3D, nearestSurfaceParameters3D, type ParametricSurface3D } from '../shared/surface3d';
import {
  nearestPointOnSphere, sphereDirectionAt, sphereFromCenterPoint, sphereFromCenterRadius,
  sphereFromFourPoints, spherePointAtDirection, type Sphere3
} from '../shared/sphere3d';

export interface CoordinateView3DEntry {
  boardId: string;
  board: any;
  view: any;
  config: BoardConfig;
  projection: Projection3D;
  camera: Camera3D;
  viewMode: SceneViewMode;
  points: Set<any>;
  linearObjects: Set<any>;
  planeObjects: Set<any>;
  circleObjects: Set<any>;
  sphereObjects: Set<any>;
  polygonObjects: Set<any>;
  solidObjects: Set<any>;
  curveObjects: Set<any>;
  surfaceObjects: Set<any>;
  decorations: Set<any>;
  controls?: HTMLElement;
  controlsCleanup?: () => void;
  cameraDragCleanup?: () => void;
  viewportCleanup?: () => void;
  viewportSignature?: string;
  decorationSignature?: string;
  decorationPanOffset?: [number, number];
  decorationCanvas?: HTMLCanvasElement;
  occlusion?: CoordinateOcclusion3DController;
  occlusionCleanup?: () => void;
  occlusionFrame?: number;
  spatialRanges: SpatialRanges3D;
}

export interface SceneModeRequestResult {
  ok: boolean;
  message?: string;
}

const VIEW_2D_CAMERA: Camera3D = { azimuth: 0, elevation: Math.PI / 2, bank: 0 };

function registry(): Record<string, CoordinateView3DEntry> {
  window.__coordinateViews3d = window.__coordinateViews3d || {};
  return window.__coordinateViews3d;
}

function boardId(board: any): string {
  return String(board && (board.__liaBoardId || board.container || board.containerObj?.id) || 'A1');
}

function evaluatedCamera(view: any, fallback: Camera3D): Camera3D {
  const read = (slider: any, value: number) => {
    try {
      const next = Number(slider && slider.Value());
      return Number.isFinite(next) ? next : value;
    } catch (e) {
      return value;
    }
  };
  return {
    azimuth: read(view && view.az_slide, fallback.azimuth),
    elevation: read(view && view.el_slide, fallback.elevation),
    bank: read(view && view.bank_slide, fallback.bank)
  };
}

function updateBoard(board: any): void {
  try {
    if (typeof board.fullUpdate === 'function') board.fullUpdate();
    else if (typeof board.update === 'function') board.update();
  } catch (e) {}
}

function updateBoardFast(board: any): void {
  try {
    if (typeof board.update === 'function') board.update();
    else if (typeof board.fullUpdate === 'function') board.fullUpdate();
  } catch (e) {}
}

function wrapCameraAngle(value: number): number {
  const fullTurn = Math.PI * 2;
  const wrapped = value % fullTurn;
  return wrapped < 0 ? wrapped + fullTurn : wrapped;
}

function normalizeCameraForView(view: any, camera: Camera3D): Camera3D {
  const trackball = view?.trackballEnabled === true ||
    (() => { try { return view?.evalVisProp?.('trackball.enabled') === true; } catch (e) { return false; } })();
  if (!trackball) {
    return {
      azimuth: wrapCameraAngle(camera.azimuth),
      elevation: wrapCameraAngle(camera.elevation),
      bank: wrapCameraAngle(camera.bank + Math.PI) - Math.PI
    };
  }
  let azimuth = camera.azimuth;
  let elevation = wrapCameraAngle(camera.elevation);
  let bank = camera.bank;
  if (elevation > Math.PI / 2 && elevation < Math.PI * 1.5) {
    elevation = Math.PI - elevation;
    azimuth += Math.PI;
    bank += Math.PI;
  } else if (elevation >= Math.PI * 1.5) {
    elevation -= Math.PI * 2;
  }
  return {
    azimuth: wrapCameraAngle(azimuth),
    elevation,
    bank: wrapCameraAngle(bank + Math.PI) - Math.PI
  };
}

function cameraScreenPanDelta(
  view: any,
  camera: Camera3D,
  center: Vector3,
  dx: number,
  dy: number,
  horizontalScale: number,
  verticalScale: number
): Vector3 {
  const { right, up } = cameraScreenBasis(camera);
  try {
    const board = view?.board;
    const origin = view.project3DTo2D(center);
    const rightPoint = view.project3DTo2D(addVector3(center, right));
    const upPoint = view.project3DTo2D(addVector3(center, up));
    const unitX = Number(board?.unitX) || 1;
    const unitY = Number(board?.unitY) || 1;
    const rightScreenX = (Number(rightPoint?.[1]) - Number(origin?.[1])) * unitX;
    const rightScreenY = -(Number(rightPoint?.[2]) - Number(origin?.[2])) * unitY;
    const upScreenX = (Number(upPoint?.[1]) - Number(origin?.[1])) * unitX;
    const upScreenY = -(Number(upPoint?.[2]) - Number(origin?.[2])) * unitY;
    const determinant = rightScreenX * upScreenY - upScreenX * rightScreenY;
    if (Number.isFinite(determinant) && Math.abs(determinant) > 1e-8) {
      const rightAmount = (-dx * upScreenY + dy * upScreenX) / determinant;
      const upAmount = (-dy * rightScreenX + dx * rightScreenY) / determinant;
      return addVector3(scaleVector3(right, rightAmount), scaleVector3(up, upAmount));
    }
  } catch (e) {}
  return addVector3(
    scaleVector3(right, -dx * horizontalScale),
    scaleVector3(up, dy * verticalScale)
  );
}

function setSliderValue(slider: any, value: number): void {
  try {
    if (slider && typeof slider.setValue === 'function') slider.setValue(value);
  } catch (e) {}
}

function dispatchSceneChange(entry: CoordinateView3DEntry): void {
  try {
    entry.board.containerObj.dispatchEvent(new CustomEvent('lia-coordinate-scene-change', {
      bubbles: true,
      detail: {
        mode: entry.viewMode,
        viewMode: entry.viewMode,
        projection: entry.projection,
        camera: entry.viewMode === '2d' ? { ...entry.camera } : evaluatedCamera(entry.view, entry.camera)
      }
    }));
  } catch (e) {}
}

function setPlanarDecorationsVisible(board: any, visible: boolean): void {
  const cfg = board?.__liaBoardConfig as BoardConfig | undefined;
  const axesVisible = visible && cfg?.axes !== false;
  const gridVisible = visible && cfg?.grid === true;
  const set = (object: any, attributes: Record<string, unknown>) => {
    try { object?.setAttribute?.(attributes); } catch (e) {}
  };
  const setAxis = (axis: any) => {
    set(axis, { visible: axesVisible });
    const ticks = [axis?.defaultTicks, ...(Array.isArray(axis?.ticks) ? axis.ticks : [])].filter(Boolean);
    ticks.forEach((tick: any) => {
      set(tick, { visible: axesVisible, drawLabels: axesVisible });
      if (Array.isArray(tick?.labels)) tick.labels.forEach((label: any) => set(label, { visible: axesVisible }));
    });
  };
  setAxis(board?.defaultAxes?.x);
  setAxis(board?.defaultAxes?.y);
  set(board?.__liaMajorGrid, { visible: gridVisible });
  set(board?.__liaMinorGrid, { visible: gridVisible });
}

function projected3DElements(entry: CoordinateView3DEntry): any[] {
  const result = new Set<any>();
  const visited = new Set<any>();
  const visit = (value: any): void => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || visited.has(value)) return;
    visited.add(value);
    if (value.element2D) {
      result.add(value);
      result.add(value.element2D);
    }
    if (value.view === entry.view && typeof value.setAttribute === 'function') result.add(value);
    else if (value.board === entry.board &&
        (String(value.elType || '').toLowerCase() === 'text' || value.__liaSphere3DGuide === true) &&
        typeof value.setAttribute === 'function') result.add(value);
    [
      value.element2D, value.mesh3d, value.polyhedron, value.faces, value.borders, value.vertices,
      value.points, value.curves, value.aux2D, value.inherits, value.ticks,
      value.labels, value.label, value.point, value.point1, value.point2,
      value.__liaSphere3DGuideCurves, value.__liaSolid3DGuideCurves
    ].forEach(child => {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') {
        // A single label or projected element is itself owned geometry; only
        // dictionaries of children should be traversed through their values.
        if (typeof child.setAttribute === 'function') visit(child);
        else Object.values(child).forEach(visit);
      }
    });
  };
  entry.decorations.forEach(value => {
    result.add(value);
    visit(value);
  });
  Object.values(entry.view?.objects || {}).forEach(visit);
  [
    entry.points, entry.linearObjects, entry.planeObjects, entry.circleObjects,
    entry.sphereObjects, entry.polygonObjects, entry.solidObjects,
    entry.curveObjects, entry.surfaceObjects
  ].forEach(collection => collection.forEach(visit));
  return Array.from(result);
}

function updateCoordinateView3DFast(entry: CoordinateView3DEntry, updateDecorations = true): void {
  try {
    entry.view?.prepareUpdate?.();
    entry.view?.update?.();
  } catch (e) {}
  const elements = projected3DElements(entry);
  const sources = new Set<any>();
  elements.forEach(element => {
    if (!element?.element2D || element === entry.view || sources.has(element)) return;
    if (!updateDecorations && element?.__liaCoordinate3DDecoration === true) return;
    sources.add(element);
    try {
      element.prepareUpdate?.();
      element.update?.();
    } catch (e) {}
  });
  const updated = new Set<any>();
  elements.forEach(element => {
    const target = element?.element2D || element;
    if (!target || target === entry.view || updated.has(target)) return;
    if (!updateDecorations && (
      element?.__liaCoordinate3DDecoration === true ||
      target?.__liaCoordinate3DDecoration === true
    )) return;
    updated.add(target);
    if (target?.visProp?.visible === false) return;
    try {
      target.prepareUpdate?.();
      target.update?.();
      target.updateVisibility?.();
      target.updateRenderer?.();
    } catch (e) {}
  });
  if (updateDecorations) drawCoordinate3DDecorationCanvas(entry);
}

function ensureCoordinate3DDecorationCanvas(entry: CoordinateView3DEntry): HTMLCanvasElement | null {
  if (entry.decorationCanvas?.isConnected) return entry.decorationCanvas;
  const container = entry.board?.containerObj as HTMLElement | undefined;
  if (!container) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'lia-coordinate-3d-decoration-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  // Depth is handled per fragment, so foreground axes remain clear above surfaces.
  canvas.style.zIndex = '1';
  canvas.style.transformOrigin = '0 0';
  const rendererRoot = entry.board?.renderer?.svgRoot as SVGElement | undefined;
  if (rendererRoot?.parentNode) rendererRoot.parentNode.insertBefore(canvas, rendererRoot);
  else container.insertBefore(canvas, container.firstChild);
  entry.decorationCanvas = canvas;
  return canvas;
}

function coordinate3DCanvasPoint(entry: CoordinateView3DEntry, point: Vector3): [number, number] | null {
  try {
    const projected = entry.view.project3DTo2D(point);
    const x = Number(entry.board?.origin?.scrCoords?.[1]) + Number(projected?.[1]) * (Number(entry.board?.unitX) || 1);
    const y = Number(entry.board?.origin?.scrCoords?.[2]) - Number(projected?.[2]) * (Number(entry.board?.unitY) || 1);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  } catch (e) {
    return null;
  }
}

function coordinate3DPointOnScreenPlane(
  entry: CoordinateView3DEntry,
  planeOrigin: Vector3,
  planeFirst: Vector3,
  planeSecond: Vector3,
  target: [number, number]
): Vector3 | null {
  let firstAmount = 0;
  let secondAmount = 0;
  const span = Math.max(...entry.spatialRanges.map(range => Math.abs(range[1] - range[0])), 1);
  const epsilon = Math.max(1e-5, span * 1e-5);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const point = addVector3(
      planeOrigin,
      addVector3(scaleVector3(planeFirst, firstAmount), scaleVector3(planeSecond, secondAmount))
    );
    const projected = coordinate3DCanvasPoint(entry, point);
    if (!projected) return null;
    const errorX = target[0] - projected[0];
    const errorY = target[1] - projected[1];
    if (Math.hypot(errorX, errorY) <= 0.02) return point;
    const projectedFirst = coordinate3DCanvasPoint(entry, addVector3(point, scaleVector3(planeFirst, epsilon)));
    const projectedSecond = coordinate3DCanvasPoint(entry, addVector3(point, scaleVector3(planeSecond, epsilon)));
    if (!projectedFirst || !projectedSecond) return null;
    const firstX = (projectedFirst[0] - projected[0]) / epsilon;
    const firstY = (projectedFirst[1] - projected[1]) / epsilon;
    const secondX = (projectedSecond[0] - projected[0]) / epsilon;
    const secondY = (projectedSecond[1] - projected[1]) / epsilon;
    const determinant = firstX * secondY - secondX * firstY;
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-9) return null;
    const deltaFirst = (errorX * secondY - secondX * errorY) / determinant;
    const deltaSecond = (firstX * errorY - errorX * firstY) / determinant;
    if (!Number.isFinite(deltaFirst) || !Number.isFinite(deltaSecond)) return null;
    firstAmount += Math.max(-span * 8, Math.min(span * 8, deltaFirst));
    secondAmount += Math.max(-span * 8, Math.min(span * 8, deltaSecond));
  }
  const result = addVector3(
    planeOrigin,
    addVector3(scaleVector3(planeFirst, firstAmount), scaleVector3(planeSecond, secondAmount))
  );
  return result.every(Number.isFinite) ? result : null;
}

export function coordinateScreenDragDelta3D(
  board: any,
  anchor: Vector3,
  deltaX: number,
  deltaY: number,
  plane: 'xy' | 'camera' = 'camera'
): Vector3 | null {
  const entry = getCoordinateView3D(board);
  if (!entry || entry.viewMode !== '3d' || !anchor.every(Number.isFinite) ||
      !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null;
  const start = coordinate3DCanvasPoint(entry, anchor);
  if (!start) return null;
  let first: Vector3 = [1, 0, 0];
  let second: Vector3 = [0, 1, 0];
  if (plane === 'camera') {
    const camera = normalizeCameraForView(entry.view, evaluatedCamera(entry.view, entry.camera));
    const basis = cameraScreenBasis(camera);
    first = basis.right;
    second = basis.up;
  }
  let target = coordinate3DPointOnScreenPlane(
    entry,
    anchor,
    first,
    second,
    [start[0] + deltaX, start[1] + deltaY]
  );
  if (!target && plane === 'xy') {
    const camera = normalizeCameraForView(entry.view, evaluatedCamera(entry.view, entry.camera));
    const basis = cameraScreenBasis(camera);
    target = coordinate3DPointOnScreenPlane(
      entry,
      anchor,
      basis.right,
      basis.up,
      [start[0] + deltaX, start[1] + deltaY]
    );
  }
  return target ? subtractVector3(target, anchor) : null;
}

interface Coordinate3DCanvasBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Coordinate3DAxisMetric {
  segment: Coordinate3DAxisCanvasSegment | null;
  range: [number, number];
  step: number;
  decimals: number;
  values: number[];
}

function coordinate3DVisibleCanvasBounds(
  entry: CoordinateView3DEntry,
  width: number,
  height: number
): Coordinate3DCanvasBounds {
  const bounds: Coordinate3DCanvasBounds = {
    left: 4,
    top: 4,
    right: Math.max(4, width - 4),
    bottom: Math.max(4, height - 4)
  };
  const container = entry.board?.containerObj as HTMLElement | undefined;
  if (!container) return bounds;
  try {
    const containerRect = container.getBoundingClientRect();
    const canvasLeft = containerRect.left + (container.clientLeft || 0);
    const canvasTop = containerRect.top + (container.clientTop || 0);
    const canvasRight = canvasLeft + width;
    const canvasBottom = canvasTop + height;
    const topMenu = container.querySelector<HTMLElement>('.lia-dgs-top-menu');
    if (topMenu) {
      const rect = topMenu.getBoundingClientRect();
      if (rect.right > canvasLeft && rect.left < canvasRight && rect.bottom > canvasTop &&
          rect.top < canvasBottom && rect.top <= canvasTop + 4) {
        bounds.top = Math.max(bounds.top, Math.min(bounds.bottom - 40, rect.bottom - canvasTop + 10));
      }
    }
    container.querySelectorAll<HTMLElement>('.lia-dgs-side-menu,.lia-dgs-object-list-panel').forEach(panel => {
      const rect = panel.getBoundingClientRect();
      if (rect.left < canvasRight && rect.right > canvasLeft && rect.bottom > canvasTop &&
          rect.top < canvasBottom && rect.right >= canvasRight - 4) {
        bounds.right = Math.min(bounds.right, Math.max(bounds.left + 40, rect.left - canvasLeft - 10));
      }
    });
  } catch (e) {}
  return bounds;
}

function coordinate3DMetricValues(
  minimum: number,
  maximum: number,
  step: number,
  includeZero = true,
  maximumCount = 80
): number[] {
  if (!(step > 0) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) return [];
  const first = Math.ceil((minimum - step * 1e-8) / step);
  const last = Math.floor((maximum + step * 1e-8) / step);
  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
  const values: number[] = [];
  for (let index = first; index <= last && values.length < maximumCount; index += 1) {
    const raw = index * step;
    const value = Math.abs(raw) < step * 1e-8 ? 0 : Number(raw.toFixed(decimals + 2));
    if (includeZero || value !== 0) values.push(value);
  }
  return values;
}

function coordinate3DAxisMetric(
  entry: CoordinateView3DEntry,
  axis: number,
  width: number,
  height: number,
  bounds: Coordinate3DCanvasBounds
): Coordinate3DAxisMetric {
  const segment = coordinate3DAxisCanvasSegment(entry, axis, width, height, bounds);
  const fallback = entry.spatialRanges[axis] || [-1, 1];
  const first = Number(segment?.start?.[axis]);
  const last = Number(segment?.end?.[axis]);
  const range: [number, number] = Number.isFinite(first) && Number.isFinite(last)
    ? [Math.min(first, last), Math.max(first, last)]
    : [Math.min(fallback[0], fallback[1]), Math.max(fallback[0], fallback[1])];
  const step = coordinate3DTickStep(range[0], range[1]);
  return {
    segment,
    range,
    step,
    decimals: Math.max(0, Math.min(8, -Math.floor(Math.log10(step)))),
    values: coordinate3DMetricValues(range[0], range[1], step, true, 40)
  };
}

function coordinate3DMetricText(value: number, decimals: number): string {
  const formatted = value.toFixed(decimals).replace(/\.0+$|(?:(\.\d*?)0+)$/, '$1');
  return formatted.startsWith('-') ? '\u2212' + formatted.slice(1) : formatted;
}

interface Coordinate3DAxisCanvasSegment {
  start: Vector3;
  end: Vector3;
  startScreen: [number, number];
  endScreen: [number, number];
}

interface Coordinate3DGridLine {
  axis: 0 | 1 | 2;
  start: Vector3;
  end: Vector3;
  color: string;
  offMainPlanes: boolean;
}

function coordinate3DSpatialGridLines(
  ranges: Array<[number, number]>,
  values: [number[], number[], number[]]
): Coordinate3DGridLine[] {
  const lines: Coordinate3DGridLine[] = [];
  const isZero = (value: number): boolean => Math.abs(value) < 1e-10;
  const add = (
    axis: 0 | 1 | 2,
    firstFixed: number,
    secondFixed: number,
    start: Vector3,
    end: Vector3
  ): void => {
    // The corresponding colored main axis already represents this line.
    if (isZero(firstFixed) && isZero(secondFixed)) return;
    lines.push({
      axis,
      start,
      end,
      color: COORDINATE_3D_AXIS_COLORS[axis],
      offMainPlanes: !isZero(firstFixed) && !isZero(secondFixed)
    });
  };
  values[1].forEach(y => values[2].forEach(z =>
    add(0, y, z, [ranges[0][0], y, z], [ranges[0][1], y, z])));
  values[0].forEach(x => values[2].forEach(z =>
    add(1, x, z, [x, ranges[1][0], z], [x, ranges[1][1], z])));
  values[0].forEach(x => values[1].forEach(y =>
    add(2, x, y, [x, y, ranges[2][0]], [x, y, ranges[2][1]])));
  // In a face-on parallel projection several depth layers share exactly the
  // same screen segment. Prefer the layer nearest a main plane when deduping.
  return lines.sort((first, second) => {
    const firstDistance = first.start.reduce((sum, value, index) =>
      index === first.axis ? sum : sum + Math.abs(value), 0);
    const secondDistance = second.start.reduce((sum, value, index) =>
      index === second.axis ? sum : sum + Math.abs(value), 0);
    return firstDistance - secondDistance;
  });
}

function coordinate3DAxisCanvasSegment(
  entry: CoordinateView3DEntry,
  axis: number,
  width: number,
  height: number,
  bounds: Coordinate3DCanvasBounds = coordinate3DVisibleCanvasBounds(entry, width, height)
): Coordinate3DAxisCanvasSegment | null {
  const originWorld: Vector3 = [0, 0, 0];
  const unitWorld: Vector3 = [0, 0, 0];
  unitWorld[axis] = 1;
  const origin = coordinate3DCanvasPoint(entry, originWorld);
  const unit = coordinate3DCanvasPoint(entry, unitWorld);
  if (!origin || !unit) return null;
  const direction: [number, number] = [unit[0] - origin[0], unit[1] - origin[1]];
  if (Math.hypot(direction[0], direction[1]) < 1e-3) return null;

  const limits: Array<[number, number]> = [[bounds.left, bounds.right], [bounds.top, bounds.bottom]];
  let minimum = Number.NEGATIVE_INFINITY;
  let maximum = Number.POSITIVE_INFINITY;
  for (let dimension = 0; dimension < 2; dimension += 1) {
    const delta = direction[dimension];
    if (Math.abs(delta) < 1e-10) {
      if (origin[dimension] < limits[dimension][0] || origin[dimension] > limits[dimension][1]) return null;
      continue;
    }
    let first = (limits[dimension][0] - origin[dimension]) / delta;
    let last = (limits[dimension][1] - origin[dimension]) / delta;
    if (first > last) [first, last] = [last, first];
    minimum = Math.max(minimum, first);
    maximum = Math.min(maximum, last);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return null;
  const start: Vector3 = [0, 0, 0];
  const end: Vector3 = [0, 0, 0];
  start[axis] = minimum;
  end[axis] = maximum;
  return {
    start,
    end,
    startScreen: [origin[0] + direction[0] * minimum, origin[1] + direction[1] * minimum],
    endScreen: [origin[0] + direction[0] * maximum, origin[1] + direction[1] * maximum]
  };
}

function drawCoordinate3DDecorationCanvas(entry: CoordinateView3DEntry): void {
  // Camera/drag handlers already draw synchronously. Consume any queued board
  // update so the same geometry is not sampled again in the next animation frame.
  if (entry.occlusionFrame) window.cancelAnimationFrame(entry.occlusionFrame);
  entry.occlusionFrame = undefined;
  const canvas = ensureCoordinate3DDecorationCanvas(entry);
  const container = entry.board?.containerObj as HTMLElement | undefined;
  if (!canvas || !container || entry.viewMode !== '3d') return;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const depth = entry.occlusion;
  depth?.beginFrame();
  const brightness = (point: Vector3): number => depth?.hasSurfaces ? depth.opacityAt(point) : 1;
  const line = (
    start: Vector3,
    end: Vector3,
    color: string,
    widthValue: number,
    opacity: number,
    projectedStart?: [number, number],
    projectedEnd?: [number, number]
  ): void => {
    const a = projectedStart || coordinate3DCanvasPoint(entry, start);
    const b = projectedEnd || coordinate3DCanvasPoint(entry, end);
    if (!a || !b) return;
    context.strokeStyle = color;
    context.lineWidth = widthValue;
    if (!depth?.hasSurfaces) {
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.globalAlpha = opacity;
      context.stroke();
      return;
    }
    // Reuse paths for equal-depth runs; no geometry or DOM is rebuilt while dragging.
    const steps = Math.max(1, Math.min(1024, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (widthValue <= 1 ? 18 : 5))));
    const pointAt = (t: number): Vector3 => [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t
    ];
    let previous = a;
    let lastAlpha = -1;
    for (let i = 0; i < steps; i += 1) {
      const amount = (i + 1) / steps;
      const next: [number, number] | null = projectedStart && projectedEnd
        ? [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount]
        : coordinate3DCanvasPoint(entry, pointAt(amount));
      if (!next) continue;
      const alpha = Math.round(brightness(pointAt((i + .5) / steps)) * 32) / 32;
      if (alpha !== lastAlpha) {
        if (lastAlpha >= 0) context.stroke();
        context.beginPath();
        context.moveTo(previous[0], previous[1]);
        context.globalAlpha = opacity * alpha;
        lastAlpha = alpha;
      }
      context.lineTo(next[0], next[1]);
      previous = next;
    }
    if (lastAlpha >= 0) context.stroke();
  };
  const visibleBounds = coordinate3DVisibleCanvasBounds(entry, width, height);
  const axisMetrics = [0, 1, 2].map(axis =>
    coordinate3DAxisMetric(entry, axis, width, height, visibleBounds));
  (entry as any).__liaCoordinate3DVisibleBounds = { ...visibleBounds };
  (entry as any).__liaCoordinate3DVisibleAxisRanges = axisMetrics.map(metric => metric.range.slice());
  (entry as any).__liaCoordinate3DVisibleMetricValues = axisMetrics.map(metric => metric.values.slice());
  context.save();
  context.beginPath();
  context.rect(
    visibleBounds.left,
    visibleBounds.top,
    Math.max(0, visibleBounds.right - visibleBounds.left),
    Math.max(0, visibleBounds.bottom - visibleBounds.top)
  );
  context.clip();
  const projectedGridSegments = new Set<string>();
  let renderedGridLineCount = 0;
  const grid = (start: Vector3, end: Vector3, color: string): void => {
    const projectedStart = coordinate3DCanvasPoint(entry, start);
    const projectedEnd = coordinate3DCanvasPoint(entry, end);
    if (!projectedStart || !projectedEnd ||
        Math.hypot(projectedEnd[0] - projectedStart[0], projectedEnd[1] - projectedStart[1]) < .5) return;
    const keyPoint = (point: [number, number]): string =>
      Math.round(point[0] * 4) + ',' + Math.round(point[1] * 4);
    const first = keyPoint(projectedStart);
    const second = keyPoint(projectedEnd);
    const key = color + '|' + (first < second ? first + '|' + second : second + '|' + first);
    if (projectedGridSegments.has(key)) return;
    projectedGridSegments.add(key);
    renderedGridLineCount += 1;
    line(start, end, color, .55, .32, projectedStart, projectedEnd);
  };
  const gridValues = (axis: number): number[] => {
    const metric = axisMetrics[axis];
    return coordinate3DMetricValues(metric.range[0], metric.range[1], metric.step, false, 40);
  };
  const ranges = axisMetrics.map(metric => metric.range) as Array<[number, number]>;
  const visibleGridValues = [0, 1, 2].map(gridValues);
  (entry as any).__liaCoordinate3DVisibleGridValues = visibleGridValues.map(values => values.slice());
  const latticeValues = axisMetrics.map(metric => metric.values.slice()) as [number[], number[], number[]];
  const spatialGridLines = coordinate3DSpatialGridLines(ranges, latticeValues);
  spatialGridLines.forEach(item => grid(item.start, item.end, item.color));
  (entry as any).__liaCoordinate3DSpatialGrid = {
    worldLineCount: spatialGridLines.length,
    renderedLineCount: renderedGridLineCount,
    offMainPlaneLineCount: spatialGridLines.filter(item => item.offMainPlanes).length,
    countsByAxis: ([0, 1, 2] as const).map(axis =>
      spatialGridLines.filter(item => item.axis === axis).length)
  };
  entry.decorations.forEach((decoration: any) => {
    if (decoration?.visProp?.visible === false) return;
    const color = decoration.visProp.strokecolor;
    if (decoration.kind === 'axis') {
      const clipped = axisMetrics[decoration.axis]?.segment;
      const worldStart = clipped?.start || decoration.start;
      const worldEnd = clipped?.end || decoration.end;
      const start = clipped?.startScreen || coordinate3DCanvasPoint(entry, worldStart);
      const end = clipped?.endScreen || coordinate3DCanvasPoint(entry, worldEnd);
      if (!start || !end) return;
      line(worldStart, worldEnd, color, decoration.visProp.strokewidth, 1, start, end);
      const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
      if (length > 1e-6) {
        const ux = dx / length, uy = dy / length, size = 11;
        context.beginPath();
        context.moveTo(end[0], end[1]);
        context.lineTo(end[0] - ux * size - uy * size * .48, end[1] - uy * size + ux * size * .48);
        context.lineTo(end[0] - ux * size + uy * size * .48, end[1] - uy * size - ux * size * .48);
        context.closePath();
        context.globalAlpha = brightness(worldEnd);
        context.fillStyle = color;
        context.fill();
        context.font = '600 19px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const titleWidth = Math.max(10, context.measureText(decoration.text).width / 2 + 3);
        const titleX = Math.max(visibleBounds.left + titleWidth, Math.min(visibleBounds.right - titleWidth, end[0] - ux * 20 - uy * 14));
        const titleY = Math.max(visibleBounds.top + 11, Math.min(visibleBounds.bottom - 11, end[1] - uy * 20 + ux * 14));
        context.strokeStyle = 'rgba(20, 24, 26, .94)';
        context.lineWidth = 4;
        context.strokeText(decoration.text, titleX, titleY);
        context.fillText(decoration.text, titleX, titleY);
      }
      return;
    }
    if (decoration.kind === 'ticks') {
      const metric = axisMetrics[decoration.axis];
      if (!metric?.segment) return;
      const projectedStart = coordinate3DCanvasPoint(entry, [0, 0, 0]);
      const axisEnd: Vector3 = [0, 0, 0];
      axisEnd[decoration.axis] = 1;
      const projectedEnd = coordinate3DCanvasPoint(entry, axisEnd);
      if (!projectedStart || !projectedEnd) return;
      const dx = projectedEnd[0] - projectedStart[0];
      const dy = projectedEnd[1] - projectedStart[1];
      const length = Math.hypot(dx, dy);
      if (!(length > 1e-6)) return;
      const nx = -dy / length * 6;
      const ny = dx / length * 6;
      const offset = coordinate3DAxisLabelOffset(entry.view, decoration.axis);
      decoration.values = metric.values.slice();
      metric.values.forEach((value: number) => {
        const point: Vector3 = [0, 0, 0];
        point[decoration.axis] = value;
        const projected = coordinate3DCanvasPoint(entry, point);
        if (!projected) return;
        const alpha = decoration.visProp.strokeopacity * brightness(point);
        context.strokeStyle = color;
        context.lineWidth = decoration.visProp.strokewidth;
        context.globalAlpha = alpha;
        context.beginPath();
        context.moveTo(projected[0] - nx, projected[1] - ny);
        context.lineTo(projected[0] + nx, projected[1] + ny);
        context.stroke();
        if (value === 0) return;
        const text = coordinate3DMetricText(value, metric.decimals);
        context.font = '600 16px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const halfWidth = Math.max(8, context.measureText(text).width / 2 + 2);
        const labelX = Math.max(visibleBounds.left + halfWidth, Math.min(
          visibleBounds.right - halfWidth,
          projected[0] + offset[0]
        ));
        const labelY = Math.max(visibleBounds.top + 10, Math.min(
          visibleBounds.bottom - 10,
          projected[1] + offset[1]
        ));
        context.globalAlpha = brightness(point);
        context.fillStyle = color;
        context.strokeStyle = 'rgba(20, 24, 26, .96)';
        context.lineWidth = 4;
        context.strokeText(text, labelX, labelY);
        context.fillText(text, labelX, labelY);
      });
      return;
    }
    if (decoration.kind === 'label') {
      if (Number.isInteger(decoration.axis)) return;
      const projected = coordinate3DCanvasPoint(entry, decoration.position);
      if (!projected) return;
      const offset = Number.isInteger(decoration.axis)
        ? coordinate3DAxisLabelOffset(entry.view, decoration.axis)
        : decoration.offset;
      context.globalAlpha = brightness(decoration.position);
      context.fillStyle = color;
      context.font = '600 16px Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const labelX = projected[0] + offset[0];
      const labelY = projected[1] + offset[1];
      context.strokeStyle = 'rgba(20, 24, 26, .96)';
      context.lineWidth = 4;
      context.strokeText(decoration.text, labelX, labelY);
      context.fillText(decoration.text, labelX, labelY);
    }
  });
  context.restore();
  context.globalAlpha = 1;
  depth?.updateMasks();
  container.dispatchEvent(new Event('lia-coordinate-3d-view-update'));
}

function primeCoordinate3DDecorationLayers(entry: CoordinateView3DEntry): void {
  const canvas = ensureCoordinate3DDecorationCanvas(entry);
  entry.decorationPanOffset = [0, 0];
  if (canvas) canvas.style.transform = '';
  drawCoordinate3DDecorationCanvas(entry);
}


function clearCoordinate3DDecorationPan(entry: CoordinateView3DEntry): boolean {
  const offset = entry.decorationPanOffset || [0, 0];
  if (Math.abs(offset[0]) < 1e-6 && Math.abs(offset[1]) < 1e-6) return false;
  entry.decorationPanOffset = [0, 0];
  if (entry.decorationCanvas) entry.decorationCanvas.style.transform = '';
  return true;
}
function refreshCoordinate3DDecorationsFast(entry: CoordinateView3DEntry): void {
  const ranges = entry.spatialRanges.map(range => range.slice()) as Array<[number, number]>;
  entry.decorationSignature = ranges.flat()
    .map(value => Number(value).toPrecision(10)).join('|');
  clearCoordinate3DDecorationPan(entry);
  entry.decorations = createCoordinate3DDecorations(entry.view, ranges);
  drawCoordinate3DDecorationCanvas(entry);
}

function guardSpatialLabelVisibility(entry: CoordinateView3DEntry, label: any): void {
  if (String(label?.elType || '').toLowerCase() !== 'text' || !label.visProp || label.__liaScene3DLabelGuard) return;
  label.__liaScene3DLabelAuthoredVisible = Object.prototype.hasOwnProperty.call(label, '__liaScene3DVisible')
    ? label.__liaScene3DVisible : label.visProp.visible;
  // JSXGraph and macro label refreshes can write visible or call showElement
  // after import. Keep that authored choice, while the scene owns its mask.
  Object.defineProperty(label.visProp, 'visible', {
    configurable: true, enumerable: true,
    get: () => entry.viewMode === '3d' ? label.__liaScene3DLabelAuthoredVisible : false,
    set: value => {
      if (label.__liaScene3DApplyingMask) return;
      label.__liaScene3DLabelAuthoredVisible = value;
      if (entry.viewMode === '2d') label.__liaScene3DVisible = value;
    }
  });
  label.__liaScene3DLabelGuard = true;
}
function setSpatialSceneVisible(entry: CoordinateView3DEntry, visible: boolean): void {
  const elements = projected3DElements(entry);
  if (!visible) {
    elements.forEach(element => {
      if (!Object.prototype.hasOwnProperty.call(element, '__liaScene3DVisible')) {
        element.__liaScene3DVisible = element.__liaScene3DLabelGuard
          ? element.__liaScene3DLabelAuthoredVisible : (element?.visProp?.visible ?? true);
      }
    });
  }
  elements.forEach(element => {
    guardSpatialLabelVisibility(entry, element);
    const next = visible
      ? (Object.prototype.hasOwnProperty.call(element, '__liaScene3DVisible')
        ? element.__liaScene3DVisible
        : (element?.visProp?.visible ?? true))
      : false;
    element.__liaScene3DApplyingMask = !visible;
    try { element.setAttribute?.({ visible: next }); } catch (e) {}
    finally { delete element.__liaScene3DApplyingMask; }
    if (visible) delete element.__liaScene3DVisible;
  });
}

function setPlanarSceneVisible(entry: CoordinateView3DEntry, visible: boolean): void {
  const spatial = new Set(projected3DElements(entry));
  const candidates = new Set<any>([
    ...(Array.isArray(entry.board?.objectsList) ? entry.board.objectsList : []),
    ...Object.values(entry.board?.objects || {})
  ]);
  candidates.forEach(element => {
    if (!element || element === entry.view || spatial.has(element)) return;
    if (!visible && !Object.prototype.hasOwnProperty.call(element, '__liaScene2DVisible')) {
      element.__liaScene2DVisible = element?.visProp?.visible ?? true;
    }
    if (!Object.prototype.hasOwnProperty.call(element, '__liaScene2DVisible')) return;
    const next = visible ? element.__liaScene2DVisible : false;
    try { element.setAttribute?.({ visible: next }); } catch (e) {}
    if (visible) delete element.__liaScene2DVisible;
  });
}

export function getCoordinateView3D(boardOrId: any): CoordinateView3DEntry | null {
  const id = typeof boardOrId === 'string' ? boardOrId : boardId(boardOrId);
  return registry()[id] || null;
}

/** Import spatial geometry without switching the user's active 2D scene. */
export function withCoordinate3DImport<T>(board: any, callback: () => T): T | undefined {
  if (!board) return undefined;
  const active = board.__liaSceneMode === '3d';
  const entry = active ? null : getCoordinateView3D(board);
  if (!active && (!entry || entry.board !== board)) {
    // Board setup owns view creation. Bootstrap can retry once it is ready.
    return undefined;
  }
  const mode = board.__liaSceneMode;
  const suspended = !board.isSuspendedUpdate &&
    typeof board.suspendUpdate === 'function' && typeof board.unsuspendUpdate === 'function';
  if (suspended) board.suspendUpdate();
  let changed = false;
  const restoreUpdates: Array<() => void> = [];
  // Every geometry mutation requests an update, but unchanged macro retries
  // return before doing so. Track that distinction without inspecting geometry.
  ['update', 'fullUpdate'].forEach(key => {
    const original = board[key];
    if (typeof original !== 'function') return;
    const own = Object.prototype.hasOwnProperty.call(board, key);
    board[key] = function (...args: any[]): any {
      changed = true;
      return original.apply(this, args);
    };
    restoreUpdates.push(() => {
      if (own) board[key] = original;
      else delete board[key];
    });
  });
  board.__liaSceneMode = '3d';
  try {
    return callback();
  } finally {
    board.__liaSceneMode = mode;
    try {
      if (!active && changed) {
        // Preserve existing visibility caches and hide new projected elements.
        setSpatialSceneVisible(entry!, false);
      }
    } finally {
      restoreUpdates.forEach(restore => restore());
      if (suspended) {
        if (changed) board.unsuspendUpdate();
        // JSXGraph's unsuspendUpdate always redraws. A no-op bootstrap must not
        // create DOM mutations that would schedule the same bootstrap again.
        else board.isSuspendedUpdate = false;
      }
    }
  }
}

function coordinate3DDistanceToSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number]
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-8) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const amount = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(
    point[0] - start[0] - amount * dx,
    point[1] - start[1] - amount * dy
  );
}

function coordinate3DRotationAxisAt(
  entry: CoordinateView3DEntry,
  x: number,
  y: number,
  camera: Camera3D
): 0 | 1 | 2 | null {
  const origin = coordinate3DCanvasPoint(entry, [0, 0, 0]);
  const basis = cameraScreenBasis(camera);
  let hiddenAxis: 0 | 1 | 2 = 0;
  if (Math.abs(basis.forward[1]) > Math.abs(basis.forward[hiddenAxis])) hiddenAxis = 1;
  if (Math.abs(basis.forward[2]) > Math.abs(basis.forward[hiddenAxis])) hiddenAxis = 2;
  // In an exact plane view the normal axis collapses into the origin. Make the
  // origin a deliberate handle for rolling around that otherwise invisible axis.
  const originDistance = origin ? Math.hypot(x - origin[0], y - origin[1]) : Number.POSITIVE_INFINITY;
  if (Math.abs(basis.forward[hiddenAxis]) > .999999 && originDistance <= 14) return hiddenAxis;
  // Outside a snapped plane all three axes meet here, so selecting one would
  // be arbitrary. Keep the established free-trackball gesture at the origin.
  if (originDistance <= 14) return null;

  const width = Math.max(1, entry.board?.containerObj?.clientWidth || 1);
  const height = Math.max(1, entry.board?.containerObj?.clientHeight || 1);
  const bounds = coordinate3DVisibleCanvasBounds(entry, width, height);
  let closest: 0 | 1 | 2 | null = null;
  let closestDistance = 11;
  ([0, 1, 2] as const).forEach(axis => {
    const segment = coordinate3DAxisCanvasSegment(entry, axis, width, height, bounds);
    if (!segment) return;
    const distance = coordinate3DDistanceToSegment([x, y], segment.startScreen, segment.endScreen);
    if (distance <= closestDistance) {
      closestDistance = distance;
      closest = axis;
    }
  });
  return closest;
}

function installCoordinateCameraDrag(entry: CoordinateView3DEntry): void {
  const container = entry.board?.containerObj as HTMLElement | undefined;
  if (!container) return;
  let pointerId: number | null = null;
  let gesture: 'pan' | 'rotate' = 'pan';
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  let suppressContextMenu = false;
  let contextResetTimer = 0;
  let interactionFrame = 0;
  let pendingDx = 0;
  let pendingDy = 0;
  let pendingCamera: Camera3D | null = null;
  let rotationPending = false;
  let rotationAxis: 0 | 1 | 2 | null = null;
  let rotationLeft = 0;
  let rotationTop = 0;
  let rotationWidth = 1;
  let rotationHeight = 1;
  const stop = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const hitsSpatialObject = (x: number, y: number): boolean => {
    const pointHit = Array.from(entry.points).some((point: any) => {
      try { return point?.element2D?.hasPoint?.(x, y) === true; } catch (e) { return false; }
    });
    if (pointHit) return true;
    const collections = [
      entry.linearObjects, entry.planeObjects, entry.circleObjects, entry.sphereObjects,
      entry.polygonObjects, entry.solidObjects, entry.curveObjects, entry.surfaceObjects
    ];
    return collections.some(collection => Array.from(collection).some((object: any) => {
      const candidates = [
        object, object?.element2D, object?.curve?.element2D,
        ...(Array.isArray(object?.aux2D) ? object.aux2D : [])
      ];
      return candidates.some(candidate => {
        try { return candidate?.hasPoint?.(x, y) === true; } catch (e) { return false; }
      });
    }));
  };
  const renderPendingInteraction = (rebuildDecorations = false): void => {
    if (interactionFrame) {
      window.cancelAnimationFrame(interactionFrame);
      interactionFrame = 0;
    }
    const dx = pendingDx;
    const dy = pendingDy;
    pendingDx = 0;
    pendingDy = 0;
    if (gesture === 'rotate') {
      if (!rotationPending || !pendingCamera) return;
      rotationPending = false;
      if (clearCoordinate3DDecorationPan(entry)) updateCoordinateView3DFast(entry, true);
      setCoordinateCamera(entry, pendingCamera, false);
      return;
    }
    if (dx === 0 && dy === 0) {
      if (rebuildDecorations && refreshCoordinate3DViewport(entry, false, true)) updateBoardFast(entry.board);
      return;
    }
    const ranges = entry.spatialRanges;
    const spans = ranges.map(range => Math.max(1e-8, range[1] - range[0]));
    const horizontalScale = Math.max(spans[0], spans[1], spans[2]) / Math.max(1, container.clientWidth);
    const verticalScale = Math.max(spans[0], spans[1], spans[2]) / Math.max(1, container.clientHeight);
    const camera = normalizeCameraForView(entry.view, evaluatedCamera(entry.view, entry.camera));
    const center = ranges.map(range => (range[0] + range[1]) / 2) as Vector3;
    const shift = cameraScreenPanDelta(entry.view, camera, center, dx, dy, horizontalScale, verticalScale);
    entry.spatialRanges = ranges.map((range, index) => [
      range[0] + shift[index],
      range[1] + shift[index]
    ]) as [[number, number], [number, number], [number, number]];
    if (refreshCoordinate3DViewport(entry, false, false)) {
      updateCoordinateView3DFast(entry, false);
      refreshCoordinate3DDecorationsFast(entry);
    }
  };
  const scheduleInteraction = (): void => {
    if (interactionFrame) return;
    interactionFrame = window.requestAnimationFrame(() => renderPendingInteraction(false));
  };
  const finish = (event?: PointerEvent): void => {
    if (pointerId == null || (event && event.pointerId !== pointerId)) return;
    if (event && (event.clientX !== lastX || event.clientY !== lastY) &&
        (moved || Math.hypot(event.clientX - lastX, event.clientY - lastY) >= 2)) move(event);
    if (event && moved) stop(event);
    renderPendingInteraction(false);
    const completedGesture = gesture;
    const completedMove = moved;
    pointerId = null;
    moved = false;
    pendingCamera = null;
    rotationPending = false;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', finish, true);
    window.removeEventListener('pointercancel', finish, true);
    if (completedGesture === 'rotate' && completedMove) {
      suppressContextMenu = true;
      if (contextResetTimer) window.clearTimeout(contextResetTimer);
      contextResetTimer = window.setTimeout(() => { suppressContextMenu = false; }, 500);
      if (rotationAxis == null) {
        const current = evaluatedCamera(entry.view, entry.camera);
        const snapped = snapCameraToCoordinatePlane(current);
        if (snapped !== current) setCoordinateCamera(entry, snapped, false);
      }
      dispatchSceneChange(entry);
    }
    rotationAxis = null;
  };
  const move = (event: PointerEvent): void => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (dx === 0 && dy === 0) return;
    if (!moved && Math.hypot(dx, dy) < 2) return;
    moved = true;
    stop(event);
    if (gesture === 'rotate') {
      const current = pendingCamera || evaluatedCamera(entry.view, entry.camera);
      pendingCamera = rotationAxis == null
        ? cameraAfterTrackballDrag(
          current,
          [lastX - rotationLeft, lastY - rotationTop],
          [event.clientX - rotationLeft, event.clientY - rotationTop],
          rotationWidth, rotationHeight
        )
        : cameraAfterAxisDrag(current, rotationAxis, [dx, dy], rotationWidth, rotationHeight);
      rotationPending = true;
    } else {
      pendingDx += dx;
      pendingDy += dy;
    }
    lastX = event.clientX;
    lastY = event.clientY;
    scheduleInteraction();
  };
  const down = (event: PointerEvent): void => {
    if (pointerId != null || (event.button !== 0 && event.button !== 2) ||
        event.shiftKey || entry.viewMode !== '3d') return;
    const target = event.target as Element | null;
    if (target?.closest?.('button,input,select,textarea,.lia-dgs-axis-drag-3d,.lia-jxg-resize-handle,.lia-coordinate-3d-controls,.lia-dgs-top-menu,.lia-dgs-side-menu,.lia-dgs-object-list-panel')) return;
    const dgsState = entry.board?.__liaDgs3DHookState;
    if (dgsState?.activeTool) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (event.button === 0 && hitsSpatialObject(x, y)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.button === 0) event.preventDefault();
    pointerId = event.pointerId;
    gesture = event.button === 2 ? 'rotate' : 'pan';
    rotationLeft = rect.left;
    rotationTop = rect.top;
    rotationWidth = rect.width;
    rotationHeight = rect.height;
    pendingCamera = gesture === 'rotate' ? evaluatedCamera(entry.view, entry.camera) : null;
    rotationAxis = gesture === 'rotate'
      ? coordinate3DRotationAxisAt(entry, x, y, pendingCamera!)
      : null;
    rotationPending = false;
    lastX = event.clientX;
    lastY = event.clientY;
    moved = false;
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  };
  const onContextMenu = (event: MouseEvent): void => {
    if (!suppressContextMenu) return;
    suppressContextMenu = false;
    if (contextResetTimer) window.clearTimeout(contextResetTimer);
    contextResetTimer = 0;
    stop(event);
  };
  container.addEventListener('pointerdown', down, true);
  container.addEventListener('contextmenu', onContextMenu, true);
  entry.cameraDragCleanup = () => {
    container.removeEventListener('pointerdown', down, true);
    container.removeEventListener('contextmenu', onContextMenu, true);
    if (contextResetTimer) window.clearTimeout(contextResetTimer);
    contextResetTimer = 0;
    if (interactionFrame) window.cancelAnimationFrame(interactionFrame);
    interactionFrame = 0;
    pendingDx = 0;
    pendingDy = 0;
    pendingCamera = null;
    rotationPending = false;
    rotationAxis = null;
    if (pointerId != null) {
      pointerId = null;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    }
  };
}

const COORDINATE_3D_AXIS_COLORS = ['#ff00ff', '#00ffff', '#ffff00'] as const;

function coordinate3DTickStep(minimum: number, maximum: number): number {
  const span = Math.abs(maximum - minimum);
  if (!(span > 0)) return 1;
  const rough = span / 10;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

function hideDefaultCoordinate3DBox(view: any): void {
  const visited = new Set<any>();
  const transparent = {
    visible: false,
    fixed: true,
    highlight: false,
    showInfobox: false,
    strokeOpacity: 0,
    fillOpacity: 0,
    highlightStrokeOpacity: 0,
    highlightFillOpacity: 0,
    strokeWidth: 0
  };
  const hide = (value: any): void => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    try { value.setAttribute?.(transparent); } catch (e) {}
    if (value.element2D) {
      try { value.element2D.setAttribute?.(transparent); } catch (e) {}
    }
    [
      value.mesh3d, value.polyhedron, value.faces, value.borders, value.vertices,
      value.points, value.curves, value.aux2D, value.inherits, value.ticks,
      value.labels, value.label, value.point, value.point1, value.point2
    ].forEach(child => {
      if (Array.isArray(child)) child.forEach(hide);
      else if (child && typeof child === 'object') {
        if (typeof child.setAttribute === 'function' || child.element2D) hide(child);
        else Object.values(child).forEach(hide);
      }
    });
  };
  Object.values(view?.defaultAxes || {}).forEach(hide);
}

function hideAndRemoveCoordinate3DDecoration(board: any, root: any): void {
  const visited = new Set<any>();
  const ordered: any[] = [];
  const visit = (value: any): void => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') ||
        visited.has(value) || value === board) return;
    visited.add(value);
    [
      value.mesh3d, value.polyhedron, value.faces, value.borders, value.vertices,
      value.points, value.curves, value.aux2D, value.inherits, value.ticks,
      value.labels, value.label, value.point, value.point1, value.point2, value.element2D
    ].forEach(child => {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') {
        if (typeof child.setAttribute === 'function' || child.element2D) visit(child);
        else Object.values(child).forEach(visit);
      }
    });
    try { value.setAttribute?.({ visible: false, showInfobox: false }); } catch (e) {}
    ordered.push(value);
  };
  visit(root);
  ordered.forEach(value => {
    try { board.removeObject?.(value); } catch (e) {}
  });
}

function disableCoordinate3DDecorationInteraction(root: any): void {
  const visited = new Set<any>();
  const visit = (value: any): void => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || visited.has(value)) return;
    visited.add(value);
    if (typeof value.hasPoint === 'function') value.hasPoint = () => false;
    try {
      if (value.rendNode?.style) value.rendNode.style.pointerEvents = 'none';
    } catch (e) {}
    [
      value.element2D, value.label, value.labels, value.ticks,
      value.point, value.point1, value.point2, value.aux2D, value.inherits
    ].forEach(child => {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    });
  };
  visit(root);
}

function hideCoordinate3DHelperPoints(object: any): void {
  [object?.point, object?.point1, object?.point2].forEach(point => {
    if (!point) return;
    const hidden = { visible: false, name: '', withLabel: false, showInfobox: false, fixed: true };
    try { point.setAttribute?.(hidden); } catch (e) {}
    try { point.element2D?.setAttribute?.(hidden); } catch (e) {}
  });
}

function coordinate3DAxisLabelOffset(view: any, axisIndex: number): [number, number] {
  const fallback: Array<[number, number]> = [[10, 18], [-10, 18], [20, 0]];
  try {
    const origin = view.project3DTo2D([0, 0, 0]);
    const endpoint3D = [0, 0, 0];
    endpoint3D[axisIndex] = 1;
    const endpoint = view.project3DTo2D(endpoint3D);
    const unitX = Number(view?.board?.unitX) || 1;
    const unitY = Number(view?.board?.unitY) || 1;
    const screenX = (Number(endpoint?.[1]) - Number(origin?.[1])) * unitX;
    const screenY = -(Number(endpoint?.[2]) - Number(origin?.[2])) * unitY;
    const length = Math.hypot(screenX, screenY);
    if (Number.isFinite(length) && length > 1e-6) {
      const distance = 20;
      return [
        Math.round(-screenY * distance / length),
        Math.round(screenX * distance / length)
      ];
    }
  } catch (e) {}
  return fallback[axisIndex] || [10, 10];
}

function createCoordinate3DDecorations(
  view: any,
  ranges: Array<[number, number]>
): Set<any> {
  const decorations = new Set<any>();
  const add = (elType: string, kind: string, data: Record<string, unknown>, color: string, width: number, opacity = 1): any => {
    const decoration: any = {
      elType,
      kind,
      ...data,
      __liaCoordinate3DDecoration: true,
      visProp: {
        visible: true,
        strokecolor: color,
        fillcolor: color,
        strokewidth: width,
        strokeopacity: opacity
      },
      setAttribute(attributes: Record<string, unknown>) {
        Object.entries(attributes || {}).forEach(([key, value]) => {
          const normalized = String(key).toLowerCase();
          this.visProp[normalized] = value;
          if (this.element2D?.visProp) this.element2D.visProp[normalized] = value;
        });
      }
    };
    decorations.add(decoration);
    return decoration;
  };
  const axisNames = ['x', 'y', 'z'];
  const metricLabels: Array<{ position: Vector3; text: string; offset: [number, number]; color: string; axis: number }> = [];
  ranges.forEach(([minimum, maximum], axis) => {
    const color = COORDINATE_3D_AXIS_COLORS[axis];
    const start: Vector3 = [0, 0, 0];
    const end: Vector3 = [0, 0, 0];
    start[axis] = minimum;
    end[axis] = maximum;
    add('axis3d', 'axis', { start, end, axis, text: axisNames[axis] }, color, 3);
    const step = coordinate3DTickStep(minimum, maximum);
    const firstTick = Math.ceil((minimum - step * 1e-8) / step) * step;
    const lastTick = Math.floor((maximum + step * 1e-8) / step) * step;
    const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
    const tickValues: number[] = [];
    for (let value = firstTick; value <= lastTick + step * 1e-8; value += step) {
      const normalized = Math.abs(value) < step * 1e-8 ? 0 : Number(value.toFixed(decimals + 2));
      tickValues.push(normalized);
      if (normalized === 0) continue;
      const position: Vector3 = [0, 0, 0];
      position[axis] = normalized;
      const formatted = normalized.toFixed(decimals).replace(/\.0+$|(?:(\.\d*?)0+)$/, '$1');
      metricLabels.push({
        position,
        text: formatted.startsWith('-') ? '\u2212' + formatted.slice(1) : formatted,
        offset: coordinate3DAxisLabelOffset(view, axis),
        color,
        axis
      });
    }
    add('ticks3d', 'ticks', { axis, values: tickValues }, color, 2, .96);
  });
  const values = (range: [number, number]): number[] => {
    const step = coordinate3DTickStep(range[0], range[1]);
    const first = Math.ceil((range[0] - step * 1e-8) / step);
    const last = Math.floor((range[1] + step * 1e-8) / step);
    const result: number[] = [];
    for (let index = first; index <= last && result.length < 80; index += 1) {
      const value = index * step;
      if (Math.abs(value) > step * 1e-8) result.push(value);
    }
    return result;
  };
  const grid = (start: Vector3, end: Vector3, color: string): void => {
    add('line3d', 'grid', { start, end }, color, .55, .32);
  };
  values(ranges[0]).forEach(x => {
    grid([x, ranges[1][0], 0], [x, ranges[1][1], 0], COORDINATE_3D_AXIS_COLORS[1]);
    grid([x, 0, ranges[2][0]], [x, 0, ranges[2][1]], COORDINATE_3D_AXIS_COLORS[2]);
  });
  values(ranges[1]).forEach(y => {
    grid([ranges[0][0], y, 0], [ranges[0][1], y, 0], COORDINATE_3D_AXIS_COLORS[0]);
    grid([0, y, ranges[2][0]], [0, y, ranges[2][1]], COORDINATE_3D_AXIS_COLORS[2]);
  });
  values(ranges[2]).forEach(z => {
    grid([ranges[0][0], 0, z], [ranges[0][1], 0, z], COORDINATE_3D_AXIS_COLORS[0]);
    grid([0, ranges[1][0], z], [0, ranges[1][1], z], COORDINATE_3D_AXIS_COLORS[1]);
  });
  metricLabels.forEach(label => {
    add('text3d', 'label', {
      position: label.position,
      text: label.text,
      offset: label.offset,
      axis: label.axis,
      element2D: { visProp: { offset: label.offset }, plaintext: label.text }
    }, label.color, 0);
  });
  return decorations;
}
function coordinate3DViewport(entry: CoordinateView3DEntry): {
  footprint: [[number, number], [number, number]];
  ranges: Array<[number, number]>;
  signature: string;
} {
  const cfg = entry.config;
  let boundingBox: number[] = [];
  try { boundingBox = entry.board.getBoundingBox?.().map(Number) || []; } catch (e) {}
  const valid = boundingBox.length >= 4 && boundingBox.every(Number.isFinite);
  const left = valid ? Math.min(boundingBox[0], boundingBox[2]) : cfg.xmin;
  const right = valid ? Math.max(boundingBox[0], boundingBox[2]) : cfg.xmax;
  const bottom = valid ? Math.min(boundingBox[1], boundingBox[3]) : cfg.ymin;
  const top = valid ? Math.max(boundingBox[1], boundingBox[3]) : cfg.ymax;
  const xSpan = Math.max(1e-8, right - left);
  const ySpan = Math.max(1e-8, top - bottom);
  const ranges = entry.spatialRanges.map(range => range.slice()) as Array<[number, number]>;
  const footprint: [[number, number], [number, number]] = [[left, bottom], [xSpan, ySpan]];
  const signature = [...footprint[0], ...footprint[1], ...ranges.flat()]
    .map(value => Number(value).toPrecision(10)).join('|');
  return { footprint, ranges, signature };
}

function refreshCoordinate3DViewport(
  entry: CoordinateView3DEntry,
  force = false,
  rebuildDecorations = true
): boolean {
  const next = coordinate3DViewport(entry);
  const rangeSignature = next.ranges.flat().map(value => Number(value).toPrecision(10)).join('|');
  const viewportChanged = force || entry.viewportSignature !== next.signature;
  const decorationsChanged = force || entry.decorationSignature !== rangeSignature;
  if (!viewportChanged && !(rebuildDecorations && decorationsChanged)) return false;
  entry.viewportSignature = next.signature;
  entry.view.llftCorner = next.footprint[0].slice();
  entry.view.size = next.footprint[1].slice();
  entry.view.bbox3D = next.ranges.map(range => range.slice());
  if (!rebuildDecorations || !decorationsChanged) return true;
  entry.decorationSignature = rangeSignature;
  clearCoordinate3DDecorationPan(entry);
  const previous = Array.from(entry.decorations);
  const board = entry.board;
  let suspended = false;
  try {
    if (typeof board?.suspendUpdate === 'function') {
      board.suspendUpdate();
      suspended = true;
    }
    entry.decorations.clear();
    previous.reverse().forEach(object => hideAndRemoveCoordinate3DDecoration(board, object));
    entry.decorations = createCoordinate3DDecorations(entry.view, next.ranges);
    primeCoordinate3DDecorationLayers(entry);
    hideDefaultCoordinate3DBox(entry.view);
  } finally {
    if (suspended) {
      try { board.unsuspendUpdate(); } catch (e) {}
    }
  }
  return true;
}

function installCoordinate3DViewportSync(entry: CoordinateView3DEntry): void {
  let frame = 0;
  let decorationTimer = 0;
  let wheelDelta = 0;
  const refresh = () => {
    if (entry.viewMode !== '3d') return;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (entry.viewMode !== '3d') return;
      if (refreshCoordinate3DViewport(entry, false, false)) {
        updateBoardFast(entry.board);
        drawCoordinate3DDecorationCanvas(entry);
      }
    });
  };
  const container = entry.board?.containerObj as HTMLElement | undefined;
  let overlayFrame = 0;
  let overlayAnimationUntil = 0;
  const redrawOverlays = (now: number): void => {
    overlayFrame = 0;
    if (entry.viewMode === '3d') drawCoordinate3DDecorationCanvas(entry);
    if (now < overlayAnimationUntil) overlayFrame = window.requestAnimationFrame(redrawOverlays);
  };
  const scheduleOverlayRedraw = (): void => {
    overlayAnimationUntil = performance.now() + 320;
    if (!overlayFrame) overlayFrame = window.requestAnimationFrame(redrawOverlays);
  };
  const overlayObserver = typeof MutationObserver === 'undefined' || !container
    ? null
    : new MutationObserver(scheduleOverlayRedraw);
  overlayObserver?.observe(container, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-open', 'data-top-open']
  });
  const finishZoom = () => {
    decorationTimer = 0;
    if (entry.viewMode !== '3d') return;
    if (refreshCoordinate3DViewport(entry, false, true)) updateBoardFast(entry.board);
  };
  const zoom = () => {
    frame = 0;
    if (clearCoordinate3DDecorationPan(entry)) updateCoordinateView3DFast(entry, true);
    if (entry.viewMode !== '3d' || wheelDelta === 0) return;
    const delta = Math.max(-600, Math.min(600, wheelDelta));
    wheelDelta = 0;
    const factor = Math.exp(delta * 0.0015);
    const baseSpans = [
      Math.max(1e-8, entry.config.xmax - entry.config.xmin),
      Math.max(1e-8, entry.config.ymax - entry.config.ymin),
      Math.max(1e-8, entry.config.zmax - entry.config.zmin)
    ];
    entry.spatialRanges = entry.spatialRanges.map((range, index) => {
      const center = (range[0] + range[1]) / 2;
      const currentSpan = Math.max(1e-8, range[1] - range[0]);
      const span = Math.max(baseSpans[index] * 1e-4, Math.min(baseSpans[index] * 1e4, currentSpan * factor));
      return [center - span / 2, center + span / 2];
    }) as [[number, number], [number, number], [number, number]];
    if (refreshCoordinate3DViewport(entry, false, false)) {
      updateBoardFast(entry.board);
      drawCoordinate3DDecorationCanvas(entry);
    }
    if (decorationTimer) window.clearTimeout(decorationTimer);
    decorationTimer = window.setTimeout(finishZoom, 100);
  };
  const onWheel = (event: WheelEvent) => {
    if (entry.viewMode !== '3d' || event.defaultPrevented || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const target = event.target as Element | null;
    if (target?.closest?.('button,input,select,textarea,.lia-dgs-menu-bar,.lia-dgs-side-menu,.lia-dgs-object-list-panel')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, container?.clientHeight || 800) : 1;
    wheelDelta += event.deltaY * unit;
    if (!frame) frame = window.requestAnimationFrame(zoom);
  };
  try { entry.board.on?.('boundingbox', refresh); } catch (e) {}
  container?.addEventListener('wheel', onWheel, { capture: true, passive: false });
  entry.viewportCleanup = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (decorationTimer) window.clearTimeout(decorationTimer);
    decorationTimer = 0;
    wheelDelta = 0;
    try { entry.board.off?.('boundingbox', refresh); } catch (e) {}
    container?.removeEventListener('wheel', onWheel, true);
    overlayObserver?.disconnect();
    if (overlayFrame) window.cancelAnimationFrame(overlayFrame);
    overlayFrame = 0;
    overlayAnimationUntil = 0;
  };
}
export function ensureCoordinateView3D(board: any, config?: BoardConfig): CoordinateView3DEntry {
  const id = boardId(board);
  const existing = registry()[id];
  if (existing && existing.board === board) return existing;
  if (existing) disposeCoordinateView3D(id);
  if (!board || typeof board.create !== 'function') throw new Error('Coordinate board is unavailable.');

  const cfg = config || board.__liaBoardConfig;
  if (!cfg) throw new Error('The coordinate board has no 3D configuration.');
  const spatialRanges: SpatialRanges3D = normalizeSpatialRanges3D(cfg.viewport3d) || [
    [cfg.xmin, cfg.xmax], [cfg.ymin, cfg.ymax], [cfg.zmin, cfg.zmax]
  ];
  setPlanarDecorationsVisible(board, false);

  const hiddenPlane = {
    visible: false,
    fillOpacity: 0,
    strokeOpacity: 0,
    mesh3d: { visible: false },
    polyhedron: { visible: false, fillOpacity: 0, strokeOpacity: 0 }
  };
  const hiddenPlaneAxis = { visible: false };
  const view = board.create('view3d', [
    [cfg.xmin, cfg.ymin],
    [cfg.xmax - cfg.xmin, cfg.ymax - cfg.ymin],
    spatialRanges.map(range => range.slice())
  ], {
    projection: cfg.projection,
    axesPosition: 'none',
    xPlaneRear: hiddenPlane,
    yPlaneRear: hiddenPlane,
    zPlaneRear: hiddenPlane,
    xPlaneFront: hiddenPlane,
    yPlaneFront: hiddenPlane,
    zPlaneFront: hiddenPlane,
    xPlaneRearYAxis: hiddenPlaneAxis,
    xPlaneRearZAxis: hiddenPlaneAxis,
    yPlaneRearXAxis: hiddenPlaneAxis,
    yPlaneRearZAxis: hiddenPlaneAxis,
    zPlaneRearXAxis: hiddenPlaneAxis,
    zPlaneRearYAxis: hiddenPlaneAxis,
    xPlaneFrontYAxis: hiddenPlaneAxis,
    xPlaneFrontZAxis: hiddenPlaneAxis,
    yPlaneFrontXAxis: hiddenPlaneAxis,
    yPlaneFrontZAxis: hiddenPlaneAxis,
    zPlaneFrontXAxis: hiddenPlaneAxis,
    zPlaneFrontYAxis: hiddenPlaneAxis,
    verticalDrag: { enabled: true, key: 'shift' },
    trackball: { enabled: false, outside: true, button: -1, key: 'none' },
    az: { slider: { visible: false, start: cfg.camera.azimuth } },
    el: { slider: { visible: false, start: cfg.camera.elevation } },
    bank: { slider: { visible: false, start: cfg.camera.bank } }
  });

  hideDefaultCoordinate3DBox(view);
  const decorations = new Set<any>();
  const entry: CoordinateView3DEntry = {
    boardId: id,
    board,
    view,
    config: cfg,
    projection: cfg.projection,
    camera: { ...cfg.camera },
    viewMode: '3d',
    points: new Set(),
    linearObjects: new Set(),
    planeObjects: new Set(),
    circleObjects: new Set(),
    sphereObjects: new Set(),
    polygonObjects: new Set(),
    solidObjects: new Set(),
    curveObjects: new Set(),
    surfaceObjects: new Set(),
    decorations,
    spatialRanges
  };
  registry()[id] = entry;
  entry.occlusion = mountCoordinateOcclusion3D(entry, {
    sphere: coordinateSphere3DData,
    plane: object => object.__liaPlane3DEvaluator?.() || coordinatePlane3DData(object),
    polygon: coordinatePolygon3DData,
    solid: coordinateSolid3DData,
    line: coordinateLinear3DData,
    circle: coordinateCircle3DData,
    curve: coordinateCurve3DData
  });
  const refreshDepth = (): void => {
    if (entry.viewMode !== '3d') {
      if (entry.occlusionFrame) window.cancelAnimationFrame(entry.occlusionFrame);
      entry.occlusionFrame = undefined;
      entry.occlusion?.clear();
      return;
    }
    if (!entry.occlusionFrame) entry.occlusionFrame = window.requestAnimationFrame(() => {
      entry.occlusionFrame = undefined;
      drawCoordinate3DDecorationCanvas(entry);
    });
  };
  board.on?.('update', refreshDepth);
  board.containerObj?.addEventListener('lia-coordinate-geometry-change', refreshDepth);
  entry.occlusionCleanup = () => {
    if (entry.occlusionFrame) window.cancelAnimationFrame(entry.occlusionFrame);
    entry.occlusionFrame = undefined;
    board.off?.('update', refreshDepth);
    board.containerObj?.removeEventListener('lia-coordinate-geometry-change', refreshDepth);
    entry.occlusion?.destroy();
  };
  refreshCoordinate3DViewport(entry, true);
  primeCoordinate3DDecorationLayers(entry);
  installCoordinate3DViewportSync(entry);
  board.__liaSceneMode = '3d';
  board.__liaSceneViewMode = '3d';
  board.__liaCoordinateView3D = view;
  setCoordinateCamera(entry, cfg.camera, false);
  setCoordinateProjection(entry, cfg.projection, false);
  setPlanarSceneVisible(entry, false);
  setSpatialSceneVisible(entry, true);
  hideDefaultCoordinate3DBox(view);
  installCoordinateCameraDrag(entry);
  updateBoard(board);
  dispatchSceneChange(entry);
  return entry;
}

export function disposeCoordinateView3D(boardOrId: any): void {
  const entry = getCoordinateView3D(boardOrId);
  const board = entry?.board || (typeof boardOrId === 'object' ? boardOrId : null);
  if (!entry) {
    try { board?.__liaView3DControlsCleanup?.(); } catch (e) {}
    return;
  }
  try { entry.controlsCleanup?.(); } catch (e) {}
  try { entry.occlusionCleanup?.(); } catch (e) {}
  entry.occlusionCleanup = undefined;
  setPlanarSceneVisible(entry, true);
  try { entry.cameraDragCleanup?.(); } catch (e) {}
  entry.cameraDragCleanup = undefined;
  try { entry.viewportCleanup?.(); } catch (e) {}
  entry.viewportCleanup = undefined;
  try { board?.__liaView3DControlsCleanup?.(); } catch (e) {}
  entry.linearObjects.forEach(object => { try { object?.__liaLinear3DCleanup?.(); } catch (e) {} });
  entry.linearObjects.clear();
  entry.planeObjects.forEach(object => { try { object?.__liaPlane3DCleanup?.(); } catch (e) {} });
  entry.planeObjects.clear();
  entry.circleObjects.forEach(object => { try { object?.__liaCircle3DCleanup?.(); } catch (e) {} });
  entry.circleObjects.clear();
  entry.polygonObjects.forEach(object => { try { object?.__liaPolygon3DCleanup?.(); } catch (e) {} });
  entry.polygonObjects.clear();
  entry.solidObjects.forEach(object => { try { object?.__liaSolid3DCleanup?.(); } catch (e) {} });
  entry.solidObjects.clear();
  entry.curveObjects.forEach(object => { try { object?.__liaCurve3DCleanup?.(); } catch (e) {} });
  entry.curveObjects.clear();
  entry.surfaceObjects.forEach(object => { try { object?.__liaSurface3DCleanup?.(); } catch (e) {} });
  entry.surfaceObjects.clear();
  const macroCircles = window.__circle3DEntries || {};
  Object.keys(macroCircles).forEach(key => {
    if (macroCircles[key]?.board === entry.board) delete macroCircles[key];
  });
  const macroSpheres = window.__sphere3DEntries || {};
  Object.keys(macroSpheres).forEach(key => {
    if (macroSpheres[key]?.board === entry.board) delete macroSpheres[key];
  });
  const macroPlanes = window.__plane3DEntries || {};
  Object.keys(macroPlanes).forEach(key => {
    if (macroPlanes[key]?.board === entry.board) delete macroPlanes[key];
  });
  const macroLinears = window.__linear3DEntries || {};
  Object.keys(macroLinears).forEach(key => {
    if (macroLinears[key]?.board === entry.board) delete macroLinears[key];
  });
  const segment6Registries = [
    window.__curve3DEntries, window.__surface3DEntries, window.__conic3DEntries,
    window.__analytic3DEntries, window.__locus3DEntries, window.__locusSurface3DEntries
  ];
  segment6Registries.forEach(macroEntries => {
    Object.keys(macroEntries || {}).forEach(key => {
      if (macroEntries?.[key]?.board === entry.board) delete macroEntries[key];
    });
  });
  entry.points.forEach(point => { try { point?.__liaPoint3DCleanup?.(); } catch (e) {} });
  entry.points.clear();
  try { entry.controls?.remove(); } catch (e) {}
  try { entry.decorationCanvas?.remove(); } catch (e) {}
  entry.decorationCanvas = undefined;
  try {
    if (entry.view && entry.board && typeof entry.board.removeObject === 'function') {
      entry.board.removeObject(entry.view);
    }
  } catch (e) {}
  try {
    if (entry.board) {
      entry.board.__liaCoordinateView3D = null;
      entry.board.__liaSceneMode = '2d';
      entry.board.__liaSceneViewMode = '2d';
      setPlanarDecorationsVisible(entry.board, true);
    }
  } catch (e) {}
  delete registry()[entry.boardId];
}

function applyCameraToView(entry: CoordinateView3DEntry, camera: Camera3D): void {
  try {
    setSliderValue(entry.view.bank_slide, camera.bank);
    if (typeof entry.view.setView === 'function') entry.view.setView(camera.azimuth, camera.elevation);
    else {
      setSliderValue(entry.view.az_slide, camera.azimuth);
      setSliderValue(entry.view.el_slide, camera.elevation);
      updateBoardFast(entry.board);
    }
  } catch (e) {}
}

/** Restore 3D pan/zoom without changing the independently stored 2D bounds. */
export function setCoordinateViewport3D(
  entryOrBoard: CoordinateView3DEntry | any,
  ranges: unknown,
  emit = true
): boolean {
  const entry = entryOrBoard && entryOrBoard.view
    ? entryOrBoard as CoordinateView3DEntry
    : getCoordinateView3D(entryOrBoard);
  const next = normalizeSpatialRanges3D(ranges);
  if (!entry || !next) return false;
  entry.spatialRanges = next;
  if (refreshCoordinate3DViewport(entry)) {
    if (entry.viewMode === '2d') setSpatialSceneVisible(entry, false);
    updateBoardFast(entry.board);
    if (entry.viewMode === '3d') drawCoordinate3DDecorationCanvas(entry);
  }
  if (emit) dispatchSceneChange(entry);
  return true;
}

export function setCoordinateCamera(
  entryOrBoard: CoordinateView3DEntry | any,
  camera: Camera3D,
  emit = true
): void {
  const entry = entryOrBoard && entryOrBoard.view
    ? entryOrBoard as CoordinateView3DEntry
    : getCoordinateView3D(entryOrBoard);
  if (!entry) return;
  const next = normalizeCameraForView(entry.view, {
    azimuth: Number.isFinite(camera.azimuth) ? camera.azimuth : entry.camera.azimuth,
    elevation: Number.isFinite(camera.elevation) ? camera.elevation : entry.camera.elevation,
    bank: Number.isFinite(camera.bank) ? camera.bank : entry.camera.bank
  });
  entry.camera = next;
  applyCameraToView(entry, entry.viewMode === '2d' ? VIEW_2D_CAMERA : next);
  if (entry.viewMode === '3d') drawCoordinate3DDecorationCanvas(entry);
  if (emit) dispatchSceneChange(entry);
}

export function setCoordinateProjection(
  entryOrBoard: CoordinateView3DEntry | any,
  projection: Projection3D,
  emit = true
): void {
  const entry = entryOrBoard && entryOrBoard.view
    ? entryOrBoard as CoordinateView3DEntry
    : getCoordinateView3D(entryOrBoard);
  if (!entry) return;
  entry.projection = projection === 'central' ? 'central' : 'parallel';
  try { entry.view.setAttribute({ projection: entry.projection }); } catch (e) {
    try { entry.view.visProp.projection = entry.projection; } catch (e2) {}
  }
  updateBoard(entry.board);
  drawCoordinate3DDecorationCanvas(entry);
  if (emit) dispatchSceneChange(entry);
}

export function setCoordinateViewMode(
  entryOrBoard: CoordinateView3DEntry | any,
  viewMode: SceneViewMode
): void {
  const entry = entryOrBoard && entryOrBoard.view
    ? entryOrBoard as CoordinateView3DEntry
    : getCoordinateView3D(entryOrBoard);
  if (!entry) return;
  if (viewMode === '2d' && entry.viewMode === '3d') {
    entry.camera = evaluatedCamera(entry.view, entry.camera);
  }
  entry.viewMode = viewMode;
  if (viewMode === '2d') entry.occlusion?.clear();
  if (entry.decorationCanvas) entry.decorationCanvas.style.display = viewMode === '3d' ? '' : 'none';
  entry.board.__liaSceneMode = viewMode;
  entry.board.__liaSceneViewMode = viewMode;
  let suspended = false;
  try {
    if (!entry.board.isSuspendedUpdate && typeof entry.board.suspendUpdate === 'function') {
      entry.board.suspendUpdate();
      suspended = true;
    }
    if (viewMode === '2d') {
      setSpatialSceneVisible(entry, false);
      setPlanarSceneVisible(entry, true);
      setPlanarDecorationsVisible(entry.board, true);
      applyCameraToView(entry, VIEW_2D_CAMERA);
    } else {
      setPlanarSceneVisible(entry, false);
      setPlanarDecorationsVisible(entry.board, false);
      refreshCoordinate3DViewport(entry);
      setSpatialSceneVisible(entry, true);
      applyCameraToView(entry, entry.camera);
    }
  } finally {
    if (suspended) {
      try { entry.board.unsuspendUpdate?.(); } catch (e) {}
    }
  }
  updateBoard(entry.board);
  if (viewMode === '3d') drawCoordinate3DDecorationCanvas(entry);
  dispatchSceneChange(entry);
}

export function requestCoordinateSceneMode(board: any, mode: SceneViewMode): SceneModeRequestResult {
  const dgsPolicy = String(board?.__liaDgsSceneModePolicy || 'switchable').toLowerCase();
  const dgsGerman = String(board?.__liaDgsSceneModeLanguage || 'de').toLowerCase() !== 'en';
  if (dgsPolicy === '3d' && mode === '2d') {
    return { ok: false, message: dgsGerman ? 'Dieses DGS ist auf die 3D-Ansicht festgelegt.' : 'This DGS is locked to the 3D view.' };
  }
  if (dgsPolicy === '2d' && mode === '3d') {
    return { ok: false, message: dgsGerman ? 'Dieses DGS ist auf die 2D-Ansicht festgelegt.' : 'This DGS is locked to the 2D view.' };
  }
  const quizPolicy = String(board?.__liaConstructionQuiz3DViewPolicy || 'free');
  if (quizPolicy === '3d' && mode === '2d') {
    return { ok: false, message: 'Diese Aufgabe erfordert die 3D-Ansicht.' };
  }
  if (quizPolicy === '2d' && mode === '3d') {
    return { ok: false, message: 'Diese Aufgabe ist auf die 2D-Ansicht festgelegt.' };
  }
  if (mode === '2d') {
    const entry = getCoordinateView3D(board);
    if (!entry) {
      board.__liaSceneMode = '2d';
      board.__liaSceneViewMode = '2d';
      return { ok: true };
    }
    setCoordinateViewMode(entry, '2d');
    return { ok: true };
  }

  try {
    const entry = ensureCoordinateView3D(board);
    setCoordinateViewMode(entry, '3d');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function attachPoint3DZDragGuide(point: any): void {
  const interaction = point?.element2D;
  const container = point?.board?.containerObj as HTMLElement | undefined;
  if (!interaction || !container || typeof interaction.on !== 'function') return;
  let guide: HTMLElement | null = null;
  let zAtDown = NaN;
  let planarDragStart: [number, number, number] | null = null;
  let planarDragClient: [number, number] | null = null;
  const hide = () => {
    guide?.remove();
    guide = null;
    window.removeEventListener('pointerup', hide, true);
    window.removeEventListener('pointercancel', hide, true);
  };
  const update = () => {
    if (!guide) return;
    const screenX = Number(interaction?.coords?.scrCoords?.[1]);
    if (Number.isFinite(screenX)) guide.style.left = Math.max(0, Math.min(container.clientWidth, screenX)) + 'px';
    const z = Number(typeof point.Z === 'function' ? point.Z() : NaN);
    guide.dataset.value = Number.isFinite(z) ? 'Z = ' + String(Math.round(z * 1000) / 1000) : 'Z';
  };
  const show = () => {
    if (guide) return;
    guide = document.createElement('div');
    guide.className = 'lia-coordinate-z-drag-guide';
    guide.setAttribute('aria-hidden', 'true');
    container.appendChild(guide);
    update();
    window.addEventListener('pointerup', hide, true);
    window.addEventListener('pointercancel', hide, true);
  };
  const down = (event: any) => {
    zAtDown = Number(typeof point.Z === 'function' ? point.Z() : NaN);
    const source = event?.originalEvent || event;
    planarDragStart = null;
    planarDragClient = null;
    if (source?.shiftKey) {
      show();
      return;
    }
    const coordinates = point3DCoordinates(point);
    const clientX = Number(source?.clientX);
    const clientY = Number(source?.clientY);
    if (coordinates && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      planarDragStart = coordinates;
      planarDragClient = [clientX, clientY];
    }
  };
  const drag = (event: any) => {
    const source = event?.originalEvent || event;
    if (!source?.shiftKey && planarDragStart && planarDragClient) {
      const clientX = Number(source?.clientX);
      const clientY = Number(source?.clientY);
      const delta = coordinateScreenDragDelta3D(
        point.board,
        planarDragStart,
        clientX - planarDragClient[0],
        clientY - planarDragClient[1],
        'xy'
      );
      if (delta && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        try {
          point.setPosition([
            planarDragStart[0] + delta[0],
            planarDragStart[1] + delta[1],
            planarDragStart[2] + delta[2]
          ]);
          const entry = getCoordinateView3D(point.board);
          if (entry) updateCoordinateView3DFast(entry, false);
        } catch (e) {}
      }
    }
    const z = Number(typeof point.Z === 'function' ? point.Z() : NaN);
    if (!guide && (source?.shiftKey || (Number.isFinite(zAtDown) && Number.isFinite(z) && Math.abs(z - zAtDown) > 1e-10))) show();
    update();
  };
  let activePointer: number | null = null;
  let startClientY = 0;
  let startCoordinates: [number, number, number] | null = null;
  const stopNativeDrag = (event: Event, immediate = true) => {
    event.preventDefault();
    event.stopPropagation();
    if (immediate) event.stopImmediatePropagation();
  };
  const endZDrag = (event?: PointerEvent) => {
    if (activePointer == null || (event && event.pointerId !== activePointer)) return;
    activePointer = null;
    startCoordinates = null;
    window.removeEventListener('pointermove', moveZ, true);
    window.removeEventListener('pointerup', endZDrag, true);
    window.removeEventListener('pointercancel', endZDrag, true);
    try { interaction.triggerEventHandlers?.(['up'], [event]); } catch (e) {}
    hide();
  };
  const moveZ = (event: PointerEvent) => {
    if (activePointer == null || event.pointerId !== activePointer || !startCoordinates) return;
    stopNativeDrag(event);
    const entry = getCoordinateView3D(point.board);
    const lower = Number(entry?.config?.zmin);
    const upper = Number(entry?.config?.zmax);
    const span = Number.isFinite(lower) && Number.isFinite(upper) && upper > lower ? upper - lower : 8;
    const delta = (startClientY - event.clientY) * span / Math.max(120, container.clientHeight);
    const nextZ = Math.max(Number.isFinite(lower) ? lower : -Infinity,
      Math.min(Number.isFinite(upper) ? upper : Infinity, startCoordinates[2] + delta));
    try { point.setPosition([startCoordinates[0], startCoordinates[1], nextZ]); } catch (e) { return; }
    try { point.board?.update?.(); } catch (e) {}
    update();
    try { interaction.triggerEventHandlers?.(['drag'], [event]); } catch (e) {}
  };
  const pointerDown = (event: PointerEvent) => {
    if ((event.target as Element | null)?.closest?.('.lia-dgs-axis-drag-3d')) return;
    if (!event.shiftKey || event.button !== 0) return;
    try { if (point.evalVisProp?.('fixed') === true) return; } catch (e) {}
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let hit = false;
    try { hit = typeof interaction.hasPoint === 'function' && interaction.hasPoint(x, y); } catch (e) {}
    if (!hit) return;
    const coordinates = point3DCoordinates(point);
    if (!coordinates) return;
    stopNativeDrag(event, false);
    activePointer = event.pointerId;
    startClientY = event.clientY;
    startCoordinates = coordinates;
    zAtDown = coordinates[2];
    show();
    window.addEventListener('pointermove', moveZ, true);
    window.addEventListener('pointerup', endZDrag, true);
    window.addEventListener('pointercancel', endZDrag, true);
  };
  const mouseDown = (event: MouseEvent) => {
    if (activePointer != null && event.shiftKey) stopNativeDrag(event);
  };
  const up = () => {
    planarDragStart = null;
    planarDragClient = null;
    hide();
  };
  window.addEventListener('pointerdown', pointerDown, true);
  window.addEventListener('mousedown', mouseDown, true);
  interaction.on('down', down);
  interaction.on('drag', drag);
  interaction.on('up', up);
  point.__liaPoint3DCleanup = () => {
    endZDrag();
    hide();
    window.removeEventListener('pointerdown', pointerDown, true);
    window.removeEventListener('mousedown', mouseDown, true);
    try { interaction.off?.('down', down); } catch (e) {}
    try { interaction.off?.('drag', drag); } catch (e) {}
    try { interaction.off?.('up', up); } catch (e) {}
  };
}
export function createCoordinatePoint3D(
  board: any,
  coordinates: [number, number, number],
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  const point = entry.view.create('point3d', coordinates, attributes);
  point.__liaPoint3D = true;
  point.__liaDimension = 3;
  point.element2D.__liaPoint3DProxy = point;
  point.label = point.element2D.label;
  point.rendNode = point.element2D.rendNode;
  point.hasPoint = (...args: any[]) => point.element2D && typeof point.element2D.hasPoint === 'function'
    ? point.element2D.hasPoint(...args)
    : false;
  attachPoint3DZDragGuide(point);
  entry.points.add(point);
  return point;
}


export type CoordinatePoint3DEvaluator = () => Vector3 | null;

export function createCoordinateDependentPoint3D(
  board: any,
  evaluator: CoordinatePoint3DEvaluator,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('A dependent Point3D requires a valid initial position.');
  const authoredVisible = attributes.visible;
  const sourceVisible = typeof authoredVisible === 'function'
    ? authoredVisible as () => boolean
    : () => true;
  const read = (): Vector3 => {
    const next = evaluator();
    if (next && next.every(Number.isFinite)) current = next;
    return current!;
  };
  let point: any = null;
  point = entry.view.create('point3d', [() => read()], {
    ...attributes,
    fixed: true,
    visible: () => sourceVisible() && point?.__liaPoint3DUserVisible !== false && !!evaluator()
  });
  point.__liaPoint3D = true;
  point.__liaPoint3DUserVisible = authoredVisible !== false;
  point.__liaDimension = 3;
  point.__liaPoint3DDependent = true;
  point.__liaPoint3DEvaluator = evaluator;
  if (point.element2D) {
    point.element2D.__liaPoint3DProxy = point;
    point.label = point.element2D.label;
    point.rendNode = point.element2D.rendNode;
    point.hasPoint = (...args: any[]) => point.element2D && typeof point.element2D.hasPoint === 'function'
      ? point.element2D.hasPoint(...args)
      : false;
  }
  entry.points.add(point);
  point.__liaPoint3DCleanup = () => entry.points.delete(point);
  return point;
}

export interface CoordinateDependentLine3DValue {
  point: Vector3;
  direction: Vector3;
}

export function createCoordinateDependentLine3D(
  board: any,
  evaluator: () => CoordinateDependentLine3DValue | null,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('A dependent Line3D requires a valid initial position.');
  const authoredVisible = attributes.visible;
  const sourceVisible = typeof authoredVisible === 'function'
    ? authoredVisible as () => boolean
    : () => true;
  const read = (): CoordinateDependentLine3DValue => {
    const next = evaluator();
    if (next && next.point.every(Number.isFinite) && next.direction.every(Number.isFinite)) current = next;
    return current!;
  };
  const first = entry.view.create('point3d', [() => read().point], {
    name: '', withLabel: false, visible: false, fixed: true
  });
  const second = entry.view.create('point3d', [() => {
    const value = read();
    return [
      value.point[0] + value.direction[0],
      value.point[1] + value.direction[1],
      value.point[2] + value.direction[2]
    ];
  }], { name: '', withLabel: false, visible: false, fixed: true });
  [first, second].forEach(point => {
    point.__liaPoint3D = true;
    point.__liaDimension = 3;
    point.__liaPoint3DHelper = true;
    if (point.element2D) point.element2D.__liaPoint3DProxy = point;
  });
  let object: any = null;
  object = createCoordinateLinear3D(board, 'line', first, second, {
    ...attributes,
    visible: () => sourceVisible() && object?.__liaLinear3DUserVisible !== false && !!evaluator()
  });
  object.__liaLinear3DUserVisible = authoredVisible !== false;
  object.__liaLinear3DDependent = true;
  object.__liaLinear3DEvaluator = evaluator;
  const originalCleanup = object.__liaLinear3DCleanup;
  object.__liaLinear3DCleanup = () => {
    try { originalCleanup?.(); } catch (e) {}
    [first, second].forEach(point => {
      try { entry.board.removeObject(point); } catch (e) {}
    });
  };
  return object;
}

export type CoordinateLinear3DKind = 'segment' | 'line' | 'ray' | 'vector';

function sceneLinearKind(kind: CoordinateLinear3DKind): Linear3DKind {
  return (kind + '3d') as Linear3DKind;
}

/**
 * JSXGraph's Line3D projects both endpoints through intersectionLineCube(),
 * even for finite segments. A point outside bbox3D therefore stays visible,
 * while its segment or vector is shortened at the (hidden) cube boundary.
 *
 * Keep bbox3D as the metric/grid viewport and project authored endpoints
 * directly. Infinite lines and rays are then extended by the ordinary 2D
 * line renderer, which clips them at the actual board edge.
 */
function installCoordinateLinear3DViewportProjection(
  object: any,
  kind: CoordinateLinear3DKind,
  sourcePoints: [any, any]
): void {
  object.getPointCoords = (parameter: unknown): [number, number, number, number] => {
    const raw = typeof parameter === 'function' ? Number((parameter as () => unknown)()) : Number(parameter);
    const amount = raw === Number.NEGATIVE_INFINITY ? 0 : raw === Number.POSITIVE_INFINITY ? 1 : raw;
    const first: Vector3 = [
      Number(sourcePoints[0].X()), Number(sourcePoints[0].Y()), Number(sourcePoints[0].Z())
    ];
    const second: Vector3 = [
      Number(sourcePoints[1].X()), Number(sourcePoints[1].Y()), Number(sourcePoints[1].Z())
    ];
    if (!Number.isFinite(amount) || !first.every(Number.isFinite) || !second.every(Number.isFinite)) {
      return [1, NaN, NaN, NaN];
    }
    return [
      1,
      first[0] + (second[0] - first[0]) * amount,
      first[1] + (second[1] - first[1]) * amount,
      first[2] + (second[2] - first[2]) * amount
    ];
  };
  object.element2D?.setAttribute?.({
    straightFirst: kind === 'line',
    straightLast: kind === 'line' || kind === 'ray'
  });
  [object.point1, object.point2].forEach((endpoint: any) => {
    try { endpoint?.prepareUpdate?.().update?.(); } catch (e) {}
  });
  try { object.element2D?.prepareUpdate?.().update?.().updateRenderer?.(); } catch (e) {}
}

function installLinear3DProxy(
  entry: CoordinateView3DEntry,
  object: any,
  kind: CoordinateLinear3DKind,
  sourcePoints: [any, any]
): any {
  object.__liaLinear3D = true;
  object.__liaDimension = 3;
  object.__liaLinear3DKind = kind;
  object.__liaLinear3DSourcePoints = sourcePoints;
  object.__liaDgsLinearPoints = sourcePoints;
  object.__liaSceneRecord = createLinear3DRecord(sceneLinearKind(kind), '', ['', '']);
  if (object.element2D) {
    object.element2D.__liaLinear3DProxy = object;
    object.label = object.element2D.label;
    object.rendNode = object.element2D.rendNode;
    object.hasPoint = (...args: any[]) => object.element2D && typeof object.element2D.hasPoint === 'function'
      ? object.element2D.hasPoint(...args)
      : false;
  }
  entry.linearObjects.add(object);
  object.__liaLinear3DCleanup = () => {
    entry.linearObjects.delete(object);
    const helper = object.__liaLinear3DHelperPoint;
    object.__liaLinear3DHelperPoint = null;
    if (helper) {
      try { entry.board.removeObject(helper); } catch (e) {}
    }
  };
  return object;
}

export function createCoordinateLinear3D(
  board: any,
  kind: CoordinateLinear3DKind,
  point1: any,
  point2: any,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  if (!point1?.__liaPoint3D || !point2?.__liaPoint3D || point1 === point2) {
    throw new TypeError('Linear 3D objects require two distinct Point3D sources.');
  }
  const object = entry.view.create('line3d', [point1, point2], {
    fixed: true,
    straightFirst: kind === 'line',
    straightLast: kind === 'line' || kind === 'ray',
    firstArrow: false,
    lastArrow: kind === 'vector',
    ...attributes
  });
  installCoordinateLinear3DViewportProjection(object, kind, [point1, point2]);
  return installLinear3DProxy(entry, object, kind, [point1, point2]);
}

export function createCoordinateFreeVector3D(
  board: any,
  anchor: any,
  componentsValue: Vector3,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  if (!anchor?.__liaPoint3D) throw new TypeError('A free Vector3D requires a Point3D anchor.');
  const components: Vector3 = [Number(componentsValue[0]), Number(componentsValue[1]), Number(componentsValue[2])];
  if (!components.every(Number.isFinite) || Math.hypot(...components) <= 1e-12) {
    throw new TypeError('A free Vector3D requires three finite, non-zero components.');
  }
  const endpoint = entry.view.create('point3d', [
    () => [
      Number(anchor.X()) + components[0],
      Number(anchor.Y()) + components[1],
      Number(anchor.Z()) + components[2]
    ]
  ], { name: '', withLabel: false, visible: false, fixed: true });
  endpoint.__liaPoint3D = true;
  endpoint.__liaDimension = 3;
  if (endpoint.element2D) endpoint.element2D.__liaPoint3DProxy = endpoint;
  const object = createCoordinateLinear3D(board, 'vector', anchor, endpoint, attributes);
  object.__liaLinear3DFreeVector = true;
  object.__liaLinear3DAnchorPoint = anchor;
  object.__liaLinear3DHelperPoint = endpoint;
  object.__liaLinear3DComponents = components;
  object.__liaDgsLinearPoints = [anchor, endpoint];
  object.__liaSceneRecord = createLinear3DRecord('vector3d', '', ['', ''], {
    definition: 'components',
    anchorPointId: '',
    components: components.slice() as Vector3
  });
  return object;
}

export function coordinateLinear3DSourcePoints(object: any): [any, any] | null {
  const points = object?.__liaLinear3DSourcePoints || object?.__liaDgsLinearPoints;
  return Array.isArray(points) && points.length >= 2 && points[0] && points[1]
    ? [points[0], points[1]]
    : null;
}

export function coordinateVector3DComponents(object: any): Vector3 | null {
  if (!object?.__liaLinear3D || object.__liaLinear3DKind !== 'vector') return null;
  if (object.__liaLinear3DFreeVector && Array.isArray(object.__liaLinear3DComponents)) {
    const components: Vector3 = object.__liaLinear3DComponents.map(Number) as Vector3;
    return components.every(Number.isFinite) ? components : null;
  }
  const points = coordinateLinear3DSourcePoints(object);
  if (!points) return null;
  return vector3Components(
    [Number(points[0].X()), Number(points[0].Y()), Number(points[0].Z())],
    [Number(points[1].X()), Number(points[1].Y()), Number(points[1].Z())]
  );
}

export function setCoordinateFreeVector3DComponents(object: any, value: Vector3): boolean {
  if (!object?.__liaLinear3DFreeVector || !Array.isArray(object.__liaLinear3DComponents)) return false;
  const components: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  if (!components.every(Number.isFinite) || Math.hypot(...components) <= 1e-12) return false;
  object.__liaLinear3DComponents.splice(0, 3, ...components);
  if (object.__liaSceneRecord) {
    object.__liaSceneRecord.components = components.slice();
    object.__liaSceneRecord.definition = 'components';
  }
  try {
    object.__liaLinear3DHelperPoint?.prepareUpdate?.().update?.();
    object.prepareUpdate?.().update?.();
    object.element2D?.prepareUpdate?.().update?.().updateRenderer?.();
    object.board?.fullUpdate?.();
  } catch (e) {
    try { object.board?.update?.(); } catch (e2) {}
  }
  return true;
}

export function coordinateLinear3DEndpoint(object: any): Vector3 | null {
  const points = coordinateLinear3DSourcePoints(object);
  if (!points) return null;
  if (object.__liaLinear3DFreeVector) {
    const components = coordinateVector3DComponents(object);
    return components
      ? vector3Endpoint([Number(points[0].X()), Number(points[0].Y()), Number(points[0].Z())], components)
      : null;
  }
  const endpoint: Vector3 = [Number(points[1].X()), Number(points[1].Y()), Number(points[1].Z())];
  return endpoint.every(Number.isFinite) ? endpoint : null;
}

export type CoordinatePlane3DDefinition = Plane3DDefinition;

function coordinatesOfPoint3D(point: any): Vector3 | null {
  try {
    const value: Vector3 = [Number(point?.X?.()), Number(point?.Y?.()), Number(point?.Z?.())];
    return value.every(Number.isFinite) ? value : null;
  } catch (e) { return null; }
}

function planeDataFromSources(definition: CoordinatePlane3DDefinition, points: any[], vectors: any[]): Plane3 | null {
  const point = coordinatesOfPoint3D(points[0]);
  if (!point) return null;
  if (definition === 'three-points') {
    const second = coordinatesOfPoint3D(points[1]);
    const third = coordinatesOfPoint3D(points[2]);
    return second && third ? planeFromThreePoints(point, second, third) : null;
  }
  const firstVector = coordinateVector3DComponents(vectors[0]);
  if (!firstVector) return null;
  if (definition === 'point-normal') return planeFromPointNormal(point, firstVector);
  const secondVector = coordinateVector3DComponents(vectors[1]);
  return secondVector ? planeFromPointVectors(point, firstVector, secondVector) : null;
}

export function coordinatePlane3DData(object: any): Plane3 | null {
  if (!object?.__liaPlane3D) return null;
  return planeDataFromSources(
    object.__liaPlane3DDefinition,
    Array.isArray(object.__liaPlane3DSourcePoints) ? object.__liaPlane3DSourcePoints : [],
    Array.isArray(object.__liaPlane3DSourceVectors) ? object.__liaPlane3DSourceVectors : []
  );
}

export function installCoordinatePlane3DProjection(
  entry: CoordinateView3DEntry,
  object: any,
  evaluator: () => Plane3 | null
): void {
  const element = object?.element2D;
  if (!element) return;
  element.updateDataArray = function(): { X: number[]; Y: number[] } {
    const plane = evaluator();
    const ranges = entry.spatialRanges;
    const polygon = plane ? clipPlaneToBounds3D(plane, {
      x: ranges[0],
      y: ranges[1],
      z: ranges[2]
    }) : [];
    const projected = polygon.map(point => {
      try {
        const value = entry.view.project3DTo2D(point);
        const x = Number(value?.[1]);
        const y = Number(value?.[2]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] as [number, number] : null;
      } catch (e) {
        return null;
      }
    }).filter((value): value is [number, number] => !!value);
    if (projected.length >= 3) projected.push(projected[0]);
    this.dataX = projected.map(point => point[0]);
    this.dataY = projected.map(point => point[1]);
    object.__liaPlane3DClippedPolygon = polygon;
    return { X: this.dataX, Y: this.dataY };
  };
  try { element.prepareUpdate?.().update?.().updateRenderer?.(); } catch (e) {}
}

export function createCoordinatePlane3D(
  board: any,
  definition: CoordinatePlane3DDefinition,
  pointSources: any[],
  vectorSources: any[] = [],
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  const requiredPoints = definition === 'three-points' ? 3 : 1;
  const requiredVectors = definition === 'point-vectors' ? 2 : (definition === 'point-normal' ? 1 : 0);
  if (pointSources.length < requiredPoints || pointSources.slice(0, requiredPoints).some(point => !point?.__liaPoint3D)) {
    throw new TypeError('Plane3D requires valid Point3D sources.');
  }
  if (vectorSources.length < requiredVectors ||
      vectorSources.slice(0, requiredVectors).some(vector => !vector?.__liaLinear3D || vector.__liaLinear3DKind !== 'vector')) {
    throw new TypeError('Plane3D requires valid Vector3D sources.');
  }
  let current = planeDataFromSources(definition, pointSources, vectorSources);
  if (!current) throw new TypeError('Plane3D sources are degenerate.');
  const read = (): Plane3 => {
    const next = planeDataFromSources(definition, pointSources, vectorSources);
    if (next) current = next;
    return current!;
  };
  let object: any = null;
  const authoredVisible = attributes.visible !== false;
  const visible = () => authoredVisible &&
    !!planeDataFromSources(definition, pointSources, vectorSources) &&
    object?.__liaPlane3DUserVisible !== false;
  const direction1 = [() => read().direction1[0], () => read().direction1[1], () => read().direction1[2]];
  const direction2 = [() => read().direction2[0], () => read().direction2[1], () => read().direction2[2]];
  object = entry.view.create('plane3d', [pointSources[0], direction1, direction2], {
    fixed: true,
    fillOpacity: 0.22,
    ...attributes,
    visible
  });
  object.__liaPlane3D = true;
  object.__liaDimension = 3;
  object.__liaPlane3DDefinition = definition;
  object.__liaPlane3DSourcePoints = pointSources.slice(0, requiredPoints);
  object.__liaPlane3DSourceVectors = vectorSources.slice(0, requiredVectors);
  object.__liaPlane3DUserVisible = authoredVisible;
  object.__liaPlane3DData = () => planeDataFromSources(
    definition,
    object.__liaPlane3DSourcePoints,
    object.__liaPlane3DSourceVectors
  );
  object.__liaSceneRecord = createPlane3DRecord(
    '',
    definition,
    new Array(requiredPoints).fill('point'),
    new Array(requiredVectors).fill('vector')
  );
  installCoordinatePlane3DProjection(entry, object, () => planeDataFromSources(
    definition,
    object.__liaPlane3DSourcePoints,
    object.__liaPlane3DSourceVectors
  ));
  if (object.element2D) {
    object.element2D.__liaPlane3DProxy = object;
    object.label = object.element2D.label;
    object.rendNode = object.element2D.rendNode;
    object.hasPoint = (...args: any[]) => object.element2D && typeof object.element2D.hasPoint === 'function'
      ? object.element2D.hasPoint(...args)
      : false;
  }
  entry.planeObjects.add(object);
  object.__liaPlane3DCleanup = () => entry.planeObjects.delete(object);
  return object;
}


export type CoordinateCircle3DDefinition = Circle3DDefinition;
export type CoordinateSphere3DDefinition = Sphere3DDefinition;

function distance3D(first: Vector3, second: Vector3): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

const circleNormalEndpoints = new WeakMap<object, WeakMap<object, any>>();
function circleNormalEndpoint(center: any, vector: any): any {
  const sources = coordinateLinear3DSourcePoints(vector);
  if (sources?.[0] === center) return sources[1];
  let endpoints = circleNormalEndpoints.get(vector);
  if (!endpoints) { endpoints = new WeakMap(); circleNormalEndpoints.set(vector, endpoints); }
  let endpoint = endpoints.get(center);
  if (!endpoint) {
    endpoint = Object.fromEntries(['X', 'Y', 'Z'].map((coordinate, axis) => [coordinate,
      () => Number(center[coordinate]()) + (coordinateVector3DComponents(vector)?.[axis] ?? NaN)]));
    endpoints.set(center, endpoint);
  }
  return endpoint;
}
function circleDataFromSources(
  definition: CoordinateCircle3DDefinition,
  points: any[],
  vectors: any[],
  radiusSource?: number | (() => number),
  constrainRadiusPoint = false
): Circle3 | null {
  if (definition === 'intersection') return null;
  const first = coordinatesOfPoint3D(points[0]);
  if (!first) return null;
  if (definition === 'three-points') {
    const second = coordinatesOfPoint3D(points[1]);
    const third = coordinatesOfPoint3D(points[2]);
    return second && third ? circleFromThreePoints(first, second, third) : null;
  }
  const normal = coordinateVector3DComponents(vectors[0]);
  if (!normal) return null;
  const radiusPoint = definition === 'center-normal-point' ? coordinatesOfPoint3D(points[1]) : null;
  const radius = definition === 'center-normal-point'
    ? (radiusPoint ? (constrainRadiusPoint
      ? radiusFromBasePoint(first, addVector3(first, normal)!, radiusPoint)
      : distance3D(first, radiusPoint)) : NaN)
    : Number(typeof radiusSource === 'function' ? radiusSource() : radiusSource);
  return circleFromCenterNormalRadius(first, normal, radius);
}

export function coordinateCircle3DData(object: any): Circle3 | null {
  if (!object?.__liaCircle3D) return null;
  if (typeof object.__liaCircle3DEvaluator === 'function') return object.__liaCircle3DEvaluator();
  return circleDataFromSources(
    object.__liaCircle3DDefinition,
    object.__liaCircle3DSourcePoints || [],
    object.__liaCircle3DSourceVectors || [],
    object.__liaCircle3DRadiusSource,
    object.__liaCircle3DConstrainRadiusPoint === true
  );
}

function createCircleRenderer(
  board: any,
  evaluator: () => Circle3 | null,
  attributes: Record<string, unknown>
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('Circle3D sources are degenerate.');
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  const read = (): Circle3 => {
    const next = evaluator();
    if (next) current = next;
    return current!;
  };
  const center = entry.view.create('point3d', [() => read().center.slice()], {
    name: '', withLabel: false, visible: false, fixed: true, showInfobox: false
  });
  center.__liaPoint3D = true;
  center.__liaPoint3DHelper = true;
  let object: any = null;
  object = entry.view.create('circle3d', [
    center,
    () => [0, ...read().normal],
    () => evaluator() ? read().radius : NaN
  ], {
    fixed: true,
    ...attributes,
    doAdvancedPlot: false,
    numberPointsHigh: 96,
    numberPointsLow: 48,
    visible: () => sourceVisible() && object?.__liaCircle3DUserVisible !== false && !!evaluator()
  });
  object.element2D = object.curve?.element2D || object.element2D;
  object.__liaCircle3D = true;
  object.__liaDimension = 3;
  object.__liaCircle3DEvaluator = evaluator;
  object.__liaCircle3DUserVisible = authored !== false;
  object.__liaCircle3DCenterHelper = center;
  if (object.element2D) {
    object.element2D.__liaCircle3DProxy = object;
    object.label = object.element2D.label;
    object.rendNode = object.element2D.rendNode;
    const proxy = object.element2D;
    // Keep the actual projected curve bounded as well as the 3D wrapper.
    Object.assign(proxy.visProp, { doadvancedplot: false, numberpointshigh: 96, numberpointslow: 48 });
    const originalHasPoint = proxy.hasPoint;
    proxy.hasPoint = (x: number, y: number, ...args: any[]): boolean => {
      if (entry.viewMode !== '3d' || object.__liaCircle3DUserVisible === false ||
          object.__liaDgsShowObject === false || proxy.visPropCalc?.visible === false) return false;
      if (originalHasPoint?.call(proxy, x, y, ...args) === true) return true;
      const opacity = typeof proxy.visProp?.fillopacity === 'function'
        ? proxy.visProp.fillopacity() : proxy.visProp?.fillopacity;
      const color = typeof proxy.visProp?.fillcolor === 'function'
        ? proxy.visProp.fillcolor() : proxy.visProp?.fillcolor;
      if (!(Number(opacity) > 0) || !color || color === 'none' || color === 'transparent') return false;
      // Native Curve.hasPoint tests only the circumference; include the filled disk.
      let inside = false;
      const samples = proxy.points || [];
      for (let index = 0, previous = samples.length - 1; index < samples.length; previous = index++) {
        const a = samples[index]?.scrCoords, b = samples[previous]?.scrCoords;
        if (!a || !b) continue;
        if ((a[2] > y) !== (b[2] > y) && x < (b[1] - a[1]) * (y - a[2]) / (b[2] - a[2]) + a[1]) inside = !inside;
      }
      return inside;
    };
    object.hasPoint = (...args: any[]) => object.element2D?.hasPoint?.(...args) === true;
  }
  entry.circleObjects.add(object);
  object.__liaCircle3DCleanup = () => {
    entry.circleObjects.delete(object);
    try { entry.board.removeObject(center); } catch (e) {}
  };
  return object;
}

export function createCoordinateCircle3D(
  board: any,
  definition: Exclude<CoordinateCircle3DDefinition, 'intersection'>,
  pointSources: any[],
  vectorSources: any[] = [],
  radiusSource?: number | (() => number),
  attributes: Record<string, unknown> = {}
): any {
  const requiredPoints = definition === 'three-points' ? 3 : (definition === 'center-normal-point' ? 2 : 1);
  const requiredVectors = definition === 'three-points' ? 0 : 1;
  if (pointSources.length < requiredPoints || pointSources.slice(0, requiredPoints).some(point => !point?.__liaPoint3D)) {
    throw new TypeError('Circle3D requires valid Point3D sources.');
  }
  if (vectorSources.length < requiredVectors || vectorSources.slice(0, requiredVectors)
      .some(vector => !vector?.__liaLinear3D || vector.__liaLinear3DKind !== 'vector')) {
    throw new TypeError('Circle3D requires a valid Vector3D normal.');
  }
  let currentRadiusSource = radiusSource;
  const constrainRadiusPoint = definition === 'center-normal-point' && attributes.constrainRadiusPoint === true;
  const evaluator = () => circleDataFromSources(definition, pointSources, vectorSources, currentRadiusSource, constrainRadiusPoint);
  const releaseRadiusPoint = constrainRadiusPoint
    ? installRoundRadiusPoint3D(pointSources[1], pointSources[0], circleNormalEndpoint(pointSources[0], vectorSources[0]))
    : () => {};
  let object: any;
  try {
    object = createCircleRenderer(board, evaluator, attributes);
  } catch (error) {
    releaseRadiusPoint();
    throw error;
  }
  const cleanupRenderer = object.__liaCircle3DCleanup;
  object.__liaCircle3DCleanup = () => {
    releaseRadiusPoint();
    cleanupRenderer?.();
  };
  object.__liaCircle3DDefinition = definition;
  object.__liaCircle3DConstrainRadiusPoint = constrainRadiusPoint;
  object.__liaCircle3DSourcePoints = pointSources.slice(0, requiredPoints);
  object.__liaCircle3DSourceVectors = vectorSources.slice(0, requiredVectors);
  object.__liaCircle3DRadiusSource = radiusSource;
  object.__liaCircle3DSetRadius = (value: number): boolean => {
    const radius = Number(value);
    if (definition !== 'center-normal-radius' || !Number.isFinite(radius) || radius <= 0) return false;
    currentRadiusSource = radius;
    object.__liaCircle3DRadiusSource = radius;
    if (object.__liaSceneRecord) object.__liaSceneRecord.radius = radius;
    try { board.update?.(); } catch (e) {}
    return true;
  };
  object.__liaSceneRecord = createCircle3DRecord(
    '', definition, new Array(requiredPoints).fill('point'), new Array(requiredVectors).fill('vector'),
    definition === 'center-normal-radius' && typeof radiusSource === 'number' ? { radius: radiusSource } : {}
  );
  return object;
}

export function createCoordinateDependentCircle3D(
  board: any,
  evaluator: () => Circle3 | null,
  attributes: Record<string, unknown> = {}
): any {
  const object = createCircleRenderer(board, evaluator, attributes);
  object.__liaCircle3DDefinition = 'intersection';
  object.__liaCircle3DDependent = true;
  object.__liaSceneRecord = createCircle3DRecord('', 'intersection', [], [], { sourceIds: ['source1', 'source2'] });
  return object;
}

function sphereDataFromSources(
  definition: CoordinateSphere3DDefinition,
  points: any[],
  radiusSource?: number | (() => number)
): Sphere3 | null {
  const coordinates = points.map(coordinatesOfPoint3D);
  if (!coordinates[0]) return null;
  if (definition === 'center-point') return coordinates[1] ? sphereFromCenterPoint(coordinates[0], coordinates[1]) : null;
  if (definition === 'four-points') {
    return coordinates.length >= 4 && coordinates.slice(0, 4).every(Boolean)
      ? sphereFromFourPoints(coordinates[0]!, coordinates[1]!, coordinates[2]!, coordinates[3]!)
      : null;
  }
  const radius = Number(typeof radiusSource === 'function' ? radiusSource() : radiusSource);
  return sphereFromCenterRadius(coordinates[0], radius);
}

export function coordinateSphere3DData(object: any): Sphere3 | null {
  if (!object?.__liaSphere3D) return null;
  return typeof object.__liaSphere3DEvaluator === 'function'
    ? object.__liaSphere3DEvaluator()
    : sphereDataFromSources(object.__liaSphere3DDefinition, object.__liaSphere3DSourcePoints || [], object.__liaSphere3DRadiusSource);
}

export function createCoordinateSphere3D(
  board: any,
  definition: CoordinateSphere3DDefinition,
  pointSources: any[],
  radiusSource?: number | (() => number),
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  const requiredPoints = definition === 'four-points' ? 4 : (definition === 'center-point' ? 2 : 1);
  if (pointSources.length < requiredPoints || pointSources.slice(0, requiredPoints).some(point => !point?.__liaPoint3D)) {
    throw new TypeError('Sphere3D requires valid Point3D sources.');
  }
  let currentRadiusSource = radiusSource;
  const evaluator = () => sphereDataFromSources(definition, pointSources, currentRadiusSource);
  let current = evaluator();
  if (!current) throw new TypeError('Sphere3D sources are degenerate.');
  const read = (): Sphere3 => {
    const next = evaluator();
    if (next) current = next;
    return current!;
  };
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  let object: any = null;
  const visible = () => sourceVisible() && object?.__liaSphere3DUserVisible !== false && !!evaluator();
  const center = entry.view.create('point3d', [() => read().center.slice()], {
    name: '', withLabel: false, visible: false, fixed: true, showInfobox: false
  });
  center.__liaPoint3D = true;
  center.__liaPoint3DHelper = true;
  object = entry.view.create('sphere3d', [center, () => evaluator() ? read().radius : NaN], {
    fixed: true,
    fillOpacity: 0.16,
    ...attributes,
    // A perspective sphere is a native parametric ellipse. Keep its contour
    // sampling bounded, including near a camera-plane singularity.
    doAdvancedPlot: false,
    numberPointsHigh: 128,
    numberPointsLow: 64,
    visible
  });
  object.__liaSphere3D = true;
  object.__liaDimension = 3;
  object.__liaSphere3DDefinition = definition;
  object.__liaSphere3DSourcePoints = pointSources.slice(0, requiredPoints);
  object.__liaSphere3DRadiusSource = radiusSource;
  object.__liaSphere3DSetRadius = (value: number): boolean => {
    const radius = Number(value);
    if (definition !== 'center-radius' || !Number.isFinite(radius) || radius <= 0) return false;
    currentRadiusSource = radius;
    object.__liaSphere3DRadiusSource = radius;
    if (object.__liaSceneRecord) object.__liaSceneRecord.radius = radius;
    try { board.update?.(); } catch (e) {}
    return true;
  };
  object.__liaSphere3DEvaluator = evaluator;
  object.__liaSphere3DUserVisible = authored !== false;
  object.__liaSphere3DCenterHelper = center;
  installCoordinateSphereAppearance3D(object);
  const guideBases: Array<{ name: string; u: Vector3; v: Vector3 }> = [
    { name: 'equator', u: [1, 0, 0], v: [0, 1, 0] },
    { name: 'meridian', u: [1, 0, 0], v: [0, 0, 1] }
  ];
  const viewDirection = (): Vector3 => {
    const camera = normalizeCameraForView(entry.view, evaluatedCamera(entry.view, entry.camera));
    const basis = cameraScreenBasis(camera);
    return normalizeVector3([
      basis.right[1] * basis.up[2] - basis.right[2] * basis.up[1],
      basis.right[2] * basis.up[0] - basis.right[0] * basis.up[2],
      basis.right[0] * basis.up[1] - basis.right[1] * basis.up[0]
    ]) || [0, 0, 1];
  };
  const guideColor = (): string => {
    const candidate = object?.element2D?.visProp?.strokecolor ??
      object?.visProp?.strokecolor ?? attributes.strokeColor ?? attributes.strokecolor ?? '#ff00ff';
    if (typeof candidate === 'function') {
      try { return String(candidate()); } catch (e) {}
    }
    return String(candidate || '#ff00ff');
  };
  const createGuideHalf = (
    basis: { name: string; u: Vector3; v: Vector3 },
    rear: boolean
  ): any => {
    const coordinate = (axis: number) => (parameter: number): number => {
      const sphere = evaluator();
      if (!sphere) return NaN;
      const direction = viewDirection();
      const phase = Math.atan2(
        basis.v[0] * direction[0] + basis.v[1] * direction[1] + basis.v[2] * direction[2],
        basis.u[0] * direction[0] + basis.u[1] * direction[1] + basis.u[2] * direction[2]
      ) + (rear ? Math.PI : 0);
      const angle = phase + Number(parameter);
      return sphere.center[axis] + sphere.radius * (
        basis.u[axis] * Math.cos(angle) + basis.v[axis] * Math.sin(angle)
      );
    };
    // These are open orientation arcs, not surfaces. Keep their depth cues and
    // unfilled appearance independent of the sphere's surface formatting.
    const guideStyle = {
      strokeColor: guideColor,
      highlightStrokeColor: guideColor,
      strokeWidth: rear ? 1.05 : 1.35,
      highlightStrokeWidth: rear ? 1.05 : 1.35,
      strokeOpacity: rear ? 0.42 : 0.78,
      highlightStrokeOpacity: rear ? 0.42 : 0.78,
      dash: rear ? 2 : 0,
      fillColor: 'none',
      highlightFillColor: 'none',
      fillOpacity: 0,
      highlightFillOpacity: 0,
      gradient: null,
      gradientSecondOpacity: 0,
      highlight: false
    };
    const guide = entry.view.create('curve3d', [
      coordinate(0), coordinate(1), coordinate(2), [-Math.PI / 2, Math.PI / 2]
    ], {
      name: '',
      withLabel: false,
      fixed: true,
      showInfobox: false,
      doAdvancedPlot: false,
      numberPointsHigh: 48,
      numberPointsLow: 20,
      ...guideStyle,
      visible
    });
    const protectedStyle = Object.fromEntries(
      Object.entries(guideStyle).map(([key, value]) => [key.toLowerCase(), value])
    );
    [guide, guide.element2D].filter(Boolean).forEach(part => {
      const nativeSetAttribute = part.setAttribute?.bind(part);
      if (!nativeSetAttribute) return;
      part.setAttribute = (...updates: any[]): any => {
        const next: Record<string, unknown> = {};
        const add = (key: unknown, value: unknown) => {
          next[String(key).replace(/\s+/g, '').toLowerCase()] = value;
        };
        updates.forEach(update => {
          if (typeof update === 'string') {
            const [key, value] = update.split(':');
            if (value != null) add(key, value.trim());
          } else if (Array.isArray(update)) {
            add(update[0], update[1]);
          } else if (update && typeof update === 'object') {
            Object.entries(update).forEach(([key, value]) => add(key, value));
          }
        });
        // Native color/opacity shortcuts expand after attribute collection;
        // discard them so they cannot override the protected arc appearance.
        ['color', 'opacity', 'highlightcolor', 'highlightopacity'].forEach(key => delete next[key]);
        nativeSetAttribute({ ...next, ...protectedStyle });
        return part;
      };
    });
    guide.__liaSphere3DGuide = true;
    guide.__liaSphere3DGuideRole = rear ? 'rear' : 'front';
    guide.__liaSphere3DGuidePlane = basis.name;
    if (guide.element2D) {
      guide.element2D.__liaSphere3DGuide = true;
      guide.element2D.__liaSphere3DProxy = object;
    }
    disableCoordinate3DDecorationInteraction(guide);
    return guide;
  };
  object.__liaSphere3DGuideCurves = guideBases.flatMap(basis => [
    createGuideHalf(basis, true),
    createGuideHalf(basis, false)
  ]);
  object.__liaSceneRecord = createSphere3DRecord(
    '', definition, new Array(requiredPoints).fill('point'),
    definition === 'center-radius' && typeof radiusSource === 'number' ? { radius: radiusSource } : {}
  );
  if (object.element2D) {
    object.element2D.__liaSphere3DProxy = object;
    object.label = object.element2D.label;
    object.rendNode = object.element2D.rendNode;
    object.hasPoint = (...args: any[]) => object.element2D?.hasPoint?.(...args) === true;
  }
  entry.sphereObjects.add(object);
  object.__liaSphere3DCleanup = () => {
    entry.sphereObjects.delete(object);
    const guides = Array.isArray(object.__liaSphere3DGuideCurves)
      ? object.__liaSphere3DGuideCurves.slice() : [];
    object.__liaSphere3DGuideCurves = [];
    guides.forEach((guide: any) => {
      try { entry.board.removeObject(guide); } catch (e) {}
    });
    try { entry.board.removeObject(center); } catch (e) {}
  };
  return object;
}


export type CoordinateSolid3DDefinition = Solid3DDefinition;

function polygonDataFromSources(points: any[]): Polygon3 | null {
  const coordinates = points.map(coordinatesOfPoint3D);
  return coordinates.length >= 3 && coordinates.every(Boolean)
    ? polygonFromPoints3D(coordinates as Vector3[])
    : null;
}

export function coordinatePolygon3DData(object: any): Polygon3 | null {
  if (!object?.__liaPolygon3D) return null;
  if (typeof object.__liaPolygon3DEvaluator === 'function') return object.__liaPolygon3DEvaluator();
  return polygonDataFromSources(object.__liaPolygon3DSourcePoints || []);
}

function installComposite3DProxy(object: any, property: string): void {
  const parts = [
    object?.element2D,
    ...(Array.isArray(object?.element2D?.borders) ? object.element2D.borders : []),
    ...(Array.isArray(object?.faces) ? object.faces : []),
    ...(Array.isArray(object?.borders) ? object.borders : [])
  ].filter(Boolean);
  parts.forEach(part => {
    try { part[property] = object; } catch (e) {}
    try { if (part.element2D) part.element2D[property] = object; } catch (e) {}
  });
  object.element2D = object.element2D || parts.find(part => part?.element2D)?.element2D || parts[0]?.element2D;
  object.label = object.element2D?.label || object.label;
  object.rendNode = object.element2D?.rendNode || object.rendNode;
  object.hasPoint = (...args: any[]) => parts.some(part => {
    try {
      return part?.hasPoint?.(...args) === true || part?.element2D?.hasPoint?.(...args) === true;
    } catch (e) { return false; }
  });
}

function createPolygonRenderer(
  board: any,
  evaluator: () => Polygon3 | null,
  pointSources: any[],
  attributes: Record<string, unknown>
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('Polygon3D sources are degenerate or non-coplanar.');
  let cacheValid = true;
  let cacheResetScheduled = false;
  const read = (): Polygon3 => {
    if (!cacheValid) {
      const next = evaluator();
      if (next) current = next;
      cacheValid = true;
    }
    if (!cacheResetScheduled) {
      cacheResetScheduled = true;
      queueMicrotask(() => {
        cacheValid = false;
        cacheResetScheduled = false;
      });
    }
    return current!;
  };
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  const vertices = pointSources.length
    ? pointSources
    : current.vertices.map((_, index) => () => read().vertices[index]?.slice() || [NaN, NaN, NaN]);
  let object: any = null;
  object = entry.view.create('polygon3d', vertices, {
    fixed: true,
    fillOpacity: 0.2,
    hasInnerPoints: true,
    vertices: { visible: false, withLabel: false, name: '', fixed: true, showInfobox: false },
    ...attributes,
    borders: {
      strokeColor: attributes.strokeColor ?? '#ff00ff',
      highlightStrokeColor: attributes.highlightStrokeColor ?? attributes.strokeColor ?? '#ff00ff',
      strokeWidth: attributes.strokeWidth ?? 2,
      highlightStrokeWidth: attributes.highlightStrokeWidth ?? attributes.strokeWidth ?? 2,
      strokeOpacity: attributes.strokeOpacity ?? 1,
      highlightStrokeOpacity: attributes.highlightStrokeOpacity ?? attributes.strokeOpacity ?? 1,
      fillColor: 'none', fillOpacity: 0, highlightFillOpacity: 0,
      withLabel: false, name: '',
      ...(attributes.borders as Record<string, unknown> || {})
    },
    visible: () => sourceVisible() && object?.__liaPolygon3DUserVisible !== false && !!read()
  });
  object.__liaPolygon3D = true;
  object.__liaDimension = 3;
  object.__liaPolygon3DEvaluator = evaluator;
  object.__liaPolygon3DUserVisible = authored !== false;
  installComposite3DProxy(object, '__liaPolygon3DProxy');
  entry.polygonObjects.add(object);
  const helperVertices: any[] = pointSources.length ? [] : [...new Set<any>(object.vertices || [])];
  helperVertices.forEach(point => { point.__liaPoint3DHelper = true; });
  let disposed = false;
  object.__liaPolygon3DCleanup = () => {
    if (disposed) return;
    disposed = true;
    entry.polygonObjects.delete(object);
    // Native Polygon3D does not own callback-created vertices strongly enough
    // to remove them with the polygon. Preview closures must not outlive it.
    helperVertices.forEach(point => {
      try { entry.board.removeObject(point); } catch (error) {}
    });
  };
  return object;
}

export function createCoordinatePolygon3D(
  board: any,
  pointSources: any[],
  attributes: Record<string, unknown> = {}
): any {
  if (pointSources.length < 3 || pointSources.some(point => !point?.__liaPoint3D)) {
    throw new TypeError('Polygon3D requires at least three Point3D sources.');
  }
  const evaluator = () => polygonDataFromSources(pointSources);
  const object = createPolygonRenderer(board, evaluator, pointSources, attributes);
  object.__liaPolygon3DSourcePoints = pointSources.slice();
  object.__liaSceneRecord = createPolygon3DRecord('', new Array(pointSources.length).fill('point'));
  return object;
}

export function createCoordinateDependentPolygon3D(
  board: any,
  evaluator: () => Polygon3 | null,
  attributes: Record<string, unknown> = {}
): any {
  const object = createPolygonRenderer(board, evaluator, [], attributes);
  object.__liaPolygon3DDependent = true;
  return object;
}

function radiusFromBasePoint(first: Vector3, second: Vector3, point: Vector3): number {
  const axis = subtractVector3(second, first);
  const direction = axis && normalizeVector3(axis);
  const delta = subtractVector3(point, first);
  if (!direction || !delta) return NaN;
  const axial = delta[0] * direction[0] + delta[1] * direction[1] + delta[2] * direction[2];
  // A radius point belongs to the cap plane, not merely at a distance from the axis.
  // Independently bound/dependent points cannot be moved to resolve incompatible constraints.
  if (Math.abs(axial) > 1e-8 * Math.max(1, vector3Norm(delta), vector3Norm(axis!))) return NaN;
  return vector3Norm(delta);
}
function solidDataFromSources(
  definition: CoordinateSolid3DDefinition,
  points: any[],
  vectors: any[],
  polygonSource?: any,
  radiusSource?: number | (() => number)
): Solid3 | null {
  const coordinates = points.map(coordinatesOfPoint3D);
  if (definition === 'tetrahedron') {
    return coordinates.length >= 4 && coordinates.slice(0, 4).every(Boolean)
      ? tetrahedronFromPoints3D(coordinates.slice(0, 4) as Vector3[])
      : null;
  }
  if (definition === 'pyramid') {
    const polygon = coordinatePolygon3DData(polygonSource);
    return polygon && coordinates[0] ? pyramidFromBaseApex3D(polygon, coordinates[0]) : null;
  }
  if (definition === 'prism') {
    const polygon = coordinatePolygon3DData(polygonSource);
    const vector = coordinateVector3DComponents(vectors[0]);
    return polygon && vector ? prismFromBaseVector3D(polygon, vector) : null;
  }
  if (definition === 'parallelepiped' || definition === 'cuboid') {
    const vectorValues = vectors.slice(0, 3).map(coordinateVector3DComponents);
    return coordinates[0] && vectorValues.every(Boolean)
      ? parallelepipedFromPointVectors3D(
          coordinates[0], vectorValues[0]!, vectorValues[1]!, vectorValues[2]!, definition === 'cuboid'
        )
      : null;
  }
  if (!coordinates[0] || !coordinates[1]) return null;
  const radius = coordinates[2]
    ? radiusFromBasePoint(coordinates[0], coordinates[1], coordinates[2])
    : Number(typeof radiusSource === 'function' ? radiusSource() : radiusSource);
  return definition === 'cylinder'
    ? cylinderFromAxisRadius3D(coordinates[0], coordinates[1], radius)
    : coneFromBaseApexRadius3D(coordinates[0], coordinates[1], radius);
}

export function coordinateSolid3DData(object: any): Solid3 | null {
  if (!object?.__liaSolid3D) return null;
  if (typeof object.__liaSolid3DEvaluator === 'function') return object.__liaSolid3DEvaluator();
  return solidDataFromSources(
    object.__liaSolid3DDefinition,
    object.__liaSolid3DSourcePoints || [],
    object.__liaSolid3DSourceVectors || [],
    object.__liaSolid3DSourcePolygon,
    object.__liaSolid3DRadiusSource
  );
}

type SolidMesh3D = { vertices: Vector3[]; faces: number[][] };

function solidMesh3D(solid: Solid3, segments = 48): SolidMesh3D {
  if (solid.kind !== 'cylinder' && solid.kind !== 'cone') {
    return { vertices: solid.vertices, faces: solid.faces };
  }
  const ring = (center: Vector3, radius: number) => Array.from({ length: segments }, (_, index) => {
    const angle = index * Math.PI * 2 / segments;
    return addVector3(
      addVector3(center, scaleVector3(solid.direction1, radius * Math.cos(angle)) || []) || [],
      scaleVector3(solid.direction2, radius * Math.sin(angle)) || []
    )!;
  });
  const base = ring(solid.baseCenter, solid.radius);
  if (solid.kind === 'cylinder') {
    const top = ring(solid.topCenter, solid.radius);
    const faces: number[][] = [
      Array.from({ length: segments }, (_, index) => segments - 1 - index),
      Array.from({ length: segments }, (_, index) => segments + index)
    ];
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      faces.push([index, next, segments + next, segments + index]);
    }
    return { vertices: [...base, ...top], faces };
  }
  const apex = base.length;
  const faces: number[][] = [Array.from({ length: segments }, (_, index) => segments - 1 - index)];
  for (let index = 0; index < segments; index += 1) {
    faces.push([index, (index + 1) % segments, apex]);
  }
  return { vertices: [...base, solid.apex], faces };
}

function roundSolidPoint3D(
  solid: Extract<Solid3, { kind: 'cylinder' | 'cone' }>,
  angle: number,
  height: number
): Vector3 {
  const clampedHeight = Math.max(0, Math.min(1, height));
  const radius = solid.radius * (solid.kind === 'cone' ? 1 - clampedHeight : 1);
  const center = addVector3(
    solid.baseCenter,
    scaleVector3(solid.axis, solid.height * clampedHeight) || []
  ) || solid.baseCenter;
  return addVector3(
    addVector3(center, scaleVector3(solid.direction1, radius * Math.cos(angle)) || []) || [],
    scaleVector3(solid.direction2, radius * Math.sin(angle)) || []
  )!;
}

function roundSolidSilhouetteAngles(
  view: any,
  solid: Extract<Solid3, { kind: 'cylinder' | 'cone' }>
): [number, number] | null {
  try {
    if (view.projectionType === 'central' && view.boxToCam?.[3]) {
      const center: Vector3 = [
        -(view.shift?.[1]?.[0] || 0),
        -(view.shift?.[2]?.[0] || 0),
        -(view.shift?.[3]?.[0] || 0)
      ];
      const eye = addVector3(center, scaleVector3(
        view.boxToCam[3].slice(1, 4), -view.boxToCam[3][0]
      ) || []);
      return eye ? roundSolidSilhouetteAngles3D(solid, { eye }) : null;
    }
    const project = (point: Vector3): [number, number] => {
      const value = view.project3DTo2D(point);
      const weight = Number(value?.[0]) || 1;
      return [Number(value?.[1]) / weight, Number(value?.[2]) / weight];
    };
    const origin = project([0, 0, 0]);
    const axes: Vector3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const projected = axes.map(project);
    const x = projected.map(point => point[0] - origin[0]);
    const y = projected.map(point => point[1] - origin[1]);
    const direction = normalizeVector3([
      x[1] * y[2] - x[2] * y[1],
      x[2] * y[0] - x[0] * y[2],
      x[0] * y[1] - x[1] * y[0]
    ]);
    return direction ? roundSolidSilhouetteAngles3D(solid, { direction }) : null;
  } catch (error) {
    return null;
  }
}
function createRoundSolidGuideCurves(
  entry: CoordinateView3DEntry,
  object: any,
  readSolid: () => Solid3,
  sourceVisible: () => boolean,
  attributes: Record<string, unknown>
): any[] {
  const visible = () => sourceVisible() &&
    object?.__liaSolid3DUserVisible !== false &&
    (readSolid().kind === 'cylinder' || readSolid().kind === 'cone');
  const curveAttributes = {
    fixed: true,
    name: '',
    withLabel: false,
    strokeColor: attributes.strokeColor ?? '#ff00ff',
    highlightStrokeColor: attributes.highlightStrokeColor ?? attributes.strokeColor ?? '#ff00ff',
    strokeWidth: attributes.strokeWidth ?? 2,
    highlightStrokeWidth: attributes.strokeWidth ?? 2,
    strokeOpacity: 1,
    highlightStrokeOpacity: 1,
    fillOpacity: 0,
    highlightFillOpacity: 0,
    dash: attributes.dash ?? 0,
    doAdvancedPlot: false,
    visible
  };
  const makeCurve = (
    role: string,
    pointAt: (parameter: number) => Vector3,
    range: [number, number],
    numberPoints: number, shouldDraw: () => boolean = () => true
  ): any => {
    const curve = entry.view.create('curve3d', [
      (parameter: number) => pointAt(parameter)[0],
      (parameter: number) => pointAt(parameter)[1],
      (parameter: number) => pointAt(parameter)[2],
      range
    ], {
      ...curveAttributes,
      visible: () => visible() && shouldDraw(),
      numberPointsHigh: numberPoints,
      numberPointsLow: numberPoints
    });
    curve.__liaSolid3DGuide = true;
    curve.__liaSolid3DGuideRole = role;
    curve.__liaSolid3DProxy = object;
    if (curve.element2D) {
      curve.element2D.__liaSolid3DGuide = true;
      curve.element2D.__liaSolid3DGuideRole = role;
      curve.element2D.__liaSolid3DProxy = object;
    }
    return curve;
  };

  const readSilhouetteAngles = (): [number, number] | null => {
    const solid = readSolid();
    return solid.kind === 'cylinder' || solid.kind === 'cone'
      ? roundSolidSilhouetteAngles(entry.view, solid) : null;
  };
  const silhouettePoint = (index: number, height: number): Vector3 => {
    const angles = readSilhouetteAngles();
    return angles ? point(angles[index], height) : [NaN, NaN, NaN];
  };
  const point = (angle: number, height: number): Vector3 => {
    const solid = readSolid();
    return solid.kind === 'cylinder' || solid.kind === 'cone'
      ? roundSolidPoint3D(solid, angle, height)
      : [NaN, NaN, NaN];
  };
  const curves: any[] = [];
  const resumeUpdates = !entry.board.isSuspendedUpdate;
  if (resumeUpdates) entry.board.suspendUpdate?.();
  try {
    curves.push(makeCurve('base-rim', angle => point(angle, 0), [0, Math.PI * 2], 72));
    if (readSolid().kind === 'cylinder') {
      curves.push(makeCurve('top-rim', angle => point(angle, 1), [0, Math.PI * 2], 72));
    }
    curves.push(
      makeCurve('silhouette-a', height => silhouettePoint(0, height), [0, 1], 2, () => !!readSilhouetteAngles()),
      makeCurve('silhouette-b', height => silhouettePoint(1, height), [0, 1], 2, () => !!readSilhouetteAngles())
    );
  } finally {
    if (resumeUpdates) entry.board.unsuspendUpdate?.();
  }
  return curves;
}

function createSolidRenderer(
  board: any,
  evaluator: () => Solid3 | null,
  attributes: Record<string, unknown>
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('Solid3D sources are degenerate.');
  let currentMesh = solidMesh3D(current);
  let cacheValid = true;
  let validGeometry = true;
  let cacheResetScheduled = false;
  const readSolid = (): Solid3 => {
    if (!cacheValid) {
      const next = evaluator();
      validGeometry = !!next;
      if (next) {
        current = next;
        currentMesh = solidMesh3D(next);
      }
      cacheValid = true;
    }
    if (!cacheResetScheduled) {
      cacheResetScheduled = true;
      queueMicrotask(() => {
        cacheValid = false;
        cacheResetScheduled = false;
      });
    }
    return current;
  };
  const readMesh = (): SolidMesh3D => {
    readSolid();
    return currentMesh;
  };
  const hasValidGeometry = (): boolean => {
    readSolid();
    return validGeometry;
  };
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  // JSXGraph converts vertex callbacks to homogeneous coordinates in place.
  // Never let it mutate the shared XYZ geometry used by construction/metrics.
  const vertices = currentMesh.vertices.map((_, index) => () => readMesh().vertices[index].slice());
  const labelName = String(attributes.name || '');
  const wantsLabel = attributes.withLabel === true && !!labelName;
  const rendererAttributes = { ...attributes, name: '', withLabel: false };
  const roundSolid = current.kind === 'cylinder' || current.kind === 'cone';
  if (roundSolid) {
    Object.assign(rendererAttributes, {
      strokeWidth: 0,
      strokeOpacity: 0,
      highlightStrokeOpacity: 0
    });
  }
  let object: any = null;
  object = entry.view.create('polyhedron3d', [vertices, currentMesh.faces], {
    fixed: true,
    fillOpacity: 0.18,
    strokeWidth: 1.5,
    ...rendererAttributes,
    // The native default alternates white/black faces even when fillColor is set.
    fillColorArray: [],
    highlightFillColorArray: [],
    visible: () => sourceVisible() && object?.__liaSolid3DUserVisible !== false && hasValidGeometry()
  });
  object.__liaSolid3D = true;
  object.__liaDimension = 3;
  object.__liaSolid3DEvaluator = evaluator;
  object.__liaSolid3DUserVisible = authored !== false;
  const guideCurves = roundSolid
    ? createRoundSolidGuideCurves(entry, object, readSolid, () => sourceVisible() && hasValidGeometry(), attributes)
    : [];
  object.__liaSolid3DGuideCurves = guideCurves;
  installCoordinateSolidAppearance3D(object, roundSolid);
  let labelPoint: any = null;
  if (wantsLabel) {
    const centroid = (): Vector3 => readSolid().centroid.slice() as Vector3;
    const authoredLabel = attributes.label && typeof attributes.label === 'object'
      ? attributes.label as Record<string, unknown>
      : {};
    labelPoint = entry.view.create('point3d', [centroid], {
      name: labelName, withLabel: true, fixed: true, size: 0,
      strokeOpacity: 0, fillOpacity: 0, highlightStrokeOpacity: 0, highlightFillOpacity: 0,
      label: {
        strokeColor: attributes.strokeColor ?? '#ff00ff',
        fillColor: attributes.strokeColor ?? '#ff00ff',
        ...authoredLabel
      },
      visible: () => sourceVisible() && object?.__liaSolid3DUserVisible !== false && hasValidGeometry()
    });
    object.label = labelPoint.label;
    object.__liaSolid3DLabelPoint = labelPoint;
  }
  const nativeSetAttribute = object.setAttribute?.bind(object);
  if (nativeSetAttribute) {
    object.setAttribute = (updates: any): any => {
      if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        nativeSetAttribute(updates);
        return object;
      }
      const next = { ...updates };
      const labelAttributes: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(next, 'name')) {
        labelAttributes.name = next.name;
        delete next.name;
      }
      if (Object.prototype.hasOwnProperty.call(next, 'withLabel')) {
        labelAttributes.withLabel = next.withLabel;
        delete next.withLabel;
      }
      if (Object.prototype.hasOwnProperty.call(next, 'label')) {
        try { labelPoint?.label?.setAttribute?.(next.label); } catch (error) {}
        delete next.label;
      }
      if (labelPoint && Object.keys(labelAttributes).length) {
        try { labelPoint.setAttribute?.(labelAttributes); } catch (error) {}
      }
      if (roundSolid) {
        next.strokeWidth = 0;
        next.strokeOpacity = 0;
        next.highlightStrokeOpacity = 0;
      }
      nativeSetAttribute(next);
      return object;
    };
  }
  installComposite3DProxy(object, '__liaSolid3DProxy');
  guideCurves.forEach((guide: any) => {
    guide.__liaSolid3DProxy = object;
    if (guide.element2D) guide.element2D.__liaSolid3DProxy = object;
  });
  entry.solidObjects.add(object);
  object.__liaSolid3DCleanup = () => {
    entry.solidObjects.delete(object);
    object.__liaSolid3DGuideCurves = [];
    guideCurves.forEach((guide: any) => {
      try { entry.board.removeObject?.(guide); } catch (error) {}
    });
    try { if (labelPoint) board.removeObject?.(labelPoint); } catch (error) {}
  };
  return object;
}

export function createCoordinateSolid3D(
  board: any,
  definition: CoordinateSolid3DDefinition,
  pointSources: any[] = [],
  vectorSources: any[] = [],
  polygonSource?: any,
  radiusSource?: number | (() => number),
  attributes: Record<string, unknown> = {}
): any {
  if (pointSources.some(point => !point?.__liaPoint3D) ||
      vectorSources.some(vector => !vector?.__liaLinear3D || vector.__liaLinear3DKind !== 'vector')) {
    throw new TypeError('Solid3D requires valid Point3D and Vector3D sources.');
  }
  if ((definition === 'pyramid' || definition === 'prism') && !coordinatePolygon3DData(polygonSource)) {
    throw new TypeError('Pyramid and prism require a Polygon3D base.');
  }
  let currentRadiusSource = radiusSource;
  const evaluator = () => solidDataFromSources(
    definition, pointSources, vectorSources, polygonSource, currentRadiusSource
  );
  const releaseRadiusPoint = (definition === 'cylinder' || definition === 'cone') && pointSources[2]
    ? installRoundRadiusPoint3D(pointSources[2], pointSources[0], pointSources[1])
    : () => {};
  let object: any;
  try {
    object = createSolidRenderer(board, evaluator, attributes);
  } catch (error) {
    releaseRadiusPoint();
    throw error;
  }
  const cleanupRenderer = object.__liaSolid3DCleanup;
  object.__liaSolid3DCleanup = () => {
    releaseRadiusPoint();
    cleanupRenderer?.();
  };
  object.__liaSolid3DDefinition = definition;
  object.__liaSolid3DSourcePoints = pointSources.slice();
  object.__liaSolid3DSourceVectors = vectorSources.slice();
  object.__liaSolid3DSourcePolygon = polygonSource || null;
  object.__liaSolid3DRadiusSource = radiusSource;
  object.__liaSolid3DSetRadius = (value: number): boolean => {
    const radius = Number(value);
    if ((definition !== 'cylinder' && definition !== 'cone') ||
        pointSources.length >= 3 || !Number.isFinite(radius) || radius <= 0) return false;
    currentRadiusSource = radius;
    object.__liaSolid3DRadiusSource = radius;
    if (object.__liaSceneRecord) object.__liaSceneRecord.radius = radius;
    try { board.update?.(); } catch (e) {}
    return true;
  };
  object.__liaSceneRecord = createSolid3DRecord(
    '', definition,
    new Array(pointSources.length).fill('point'),
    new Array(vectorSources.length).fill('vector'),
    {
      ...(polygonSource ? { polygonId: 'polygon' } : {}),
      ...(typeof radiusSource === 'number' ? { radius: radiusSource } : {})
    }
  );
  return object;
}

export function createCoordinateDependentSolid3D(
  board: any,
  evaluator: () => Solid3 | null,
  attributes: Record<string, unknown> = {}
): any {
  const object = createSolidRenderer(board, evaluator, attributes);
  object.__liaSolid3DDependent = true;
  return object;
}

export function coordinateCurve3DData(object: any): ParametricCurve3D | null {
  if (!object?.__liaCurve3D) return null;
  try {
    const curve = object.__liaCurve3DEvaluator?.() || object.__liaCurve3DData;
    return curve?.kind === 'curve3d' ? curve : null;
  } catch (error) { return null; }
}

export function createCoordinateCurve3D(
  board: any,
  curveOrEvaluator: ParametricCurve3D | (() => ParametricCurve3D | null),
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  const evaluator = typeof curveOrEvaluator === 'function' ? curveOrEvaluator : () => curveOrEvaluator;
  const initial = evaluator();
  if (!initial) throw new TypeError('A Curve3D requires a valid initial definition.');
  const coordinate = (index: number) => (t: number): number => {
    const curve = evaluator();
    const point = curve && evaluateCurve3D(curve, Number(t));
    return point ? point[index] : NaN;
  };
  const object = entry.view.create('curve3d', [
    coordinate(0), coordinate(1), coordinate(2), [...initial.range]
  ], {
    ...attributes,
    doAdvancedPlot: false,
    numberPointsHigh: initial.quality,
    numberPointsLow: Math.max(8, Math.round(initial.quality / 3))
  });
  object.__liaCurve3D = true;
  object.__liaDimension = 3;
  object.__liaCurve3DEvaluator = evaluator;
  object.__liaCurve3DData = initial;
  if (object.element2D) {
    object.element2D.__liaCurve3DProxy = object;
    object.hasPoint = (...args: any[]) => object.element2D?.hasPoint?.(...args) || false;
    object.rendNode = object.element2D.rendNode;
  }
  entry.curveObjects.add(object);
  object.__liaCurve3DCleanup = () => entry.curveObjects.delete(object);
  return object;
}

export function coordinateSurface3DData(object: any): ParametricSurface3D | null {
  if (!object?.__liaSurface3D) return null;
  try {
    const surface = object.__liaSurface3DEvaluator?.() || object.__liaSurface3DData;
    return surface?.kind === 'surface3d' ? surface : null;
  } catch (error) { return null; }
}

export function createCoordinateSurface3D(
  board: any,
  surfaceOrEvaluator: ParametricSurface3D | (() => ParametricSurface3D | null),
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  const evaluator = typeof surfaceOrEvaluator === 'function' ? surfaceOrEvaluator : () => surfaceOrEvaluator;
  const initial = evaluator();
  if (!initial) throw new TypeError('A Surface3D requires a valid initial definition.');
  const coordinate = (index: number) => (u: number, v: number): number => {
    const surface = evaluator();
    const point = surface && evaluateSurface3D(surface, Number(u), Number(v));
    return point ? point[index] : NaN;
  };
  const object = entry.view.create('parametricsurface3d', [
    coordinate(0), coordinate(1), coordinate(2), [...initial.uRange], [...initial.vRange]
  ], { stepsU: initial.quality[0], stepsV: initial.quality[1], ...attributes });
  object.__liaSurface3D = true;
  object.__liaDimension = 3;
  object.__liaSurface3DEvaluator = evaluator;
  object.__liaSurface3DData = initial;
  if (object.element2D) {
    object.element2D.__liaSurface3DProxy = object;
    object.hasPoint = (...args: any[]) => object.element2D?.hasPoint?.(...args) || false;
    object.rendNode = object.element2D.rendNode;
  }
  entry.surfaceObjects.add(object);
  object.__liaSurface3DCleanup = () => entry.surfaceObjects.delete(object);
  return object;
}

export type CoordinatePoint3DBindingParameters =
  | { kind: 'curve'; t: number }
  | { kind: 'surface'; u: number; v: number }
  | { kind: 'line'; t: number }
  | { kind: 'plane'; u: number; v: number }
  | { kind: 'circle'; angle: number }
  | { kind: 'sphere'; direction: Vector3 }
  | { kind: 'polygon'; u: number; v: number }
  | { kind: 'solid'; surface: 'side' | 'base' | 'top' | 'face'; face?: number; u?: number; v?: number; angle?: number; height?: number; radial?: number };

function clampCoordinateLinearParameter(parameter: number, domain: LinearDomain3D): number {
  if (domain === 'segment' || domain === 'vector') return Math.max(0, Math.min(1, parameter));
  if (domain === 'ray') return Math.max(0, parameter);
  return parameter;
}

function coordinateBindingParametersAt(
  position: Vector3,
  source: any
): CoordinatePoint3DBindingParameters | null {
  const curve = coordinateCurve3DData(source);
  if (curve) {
    const t = nearestCurveParameter3D(curve, position);
    return Number.isFinite(t) ? { kind: 'curve', t } : null;
  }
  const surface = coordinateSurface3DData(source);
  if (surface) {
    const nearest = nearestSurfaceParameters3D(surface, position);
    return nearest ? { kind: 'surface', u: nearest.u, v: nearest.v } : null;
  }
  const polygon = coordinatePolygon3DData(source);
  if (polygon) {
    const nearest = nearestPointOnPolygon3D(position, polygon);
    const binding = nearest ? polygonLocalCoordinates3D(polygon, nearest) : null;
    return binding ? { kind: 'polygon', u: binding.u, v: binding.v } : null;
  }
  const solid = coordinateSolid3DData(source);
  if (solid) {
    const binding = solidBindingAt3D(solid, position);
    return binding ? { kind: 'solid', ...binding } : null;
  }
  const circle = coordinateCircle3DData(source);
  if (circle) {
    const nearest = nearestPointOnCircle(position, circle);
    const angle = nearest ? circleParameterAt(circle, nearest) : NaN;
    return Number.isFinite(angle) ? { kind: 'circle', angle } : null;
  }
  const sphere = coordinateSphere3DData(source);
  if (sphere) {
    const nearest = nearestPointOnSphere(position, sphere);
    const direction = nearest ? sphereDirectionAt(sphere, nearest) : null;
    return direction ? { kind: 'sphere', direction } : null;
  }
  const line = coordinateLinear3DData(source);
  if (line) {
    const denominator = dotVector3Components(line.direction, line.direction);
    if (!Number.isFinite(denominator) || denominator <= 1e-12) return null;
    const delta: Vector3 = [
      position[0] - line.anchor[0],
      position[1] - line.anchor[1],
      position[2] - line.anchor[2]
    ];
    const t = clampCoordinateLinearParameter(
      dotVector3Components(delta, line.direction) / denominator,
      line.domain
    );
    return Number.isFinite(t) ? { kind: 'line', t } : null;
  }
  const plane = coordinatePlane3DData(source);
  if (!plane) return null;
  const delta: Vector3 = [
    position[0] - plane.point[0],
    position[1] - plane.point[1],
    position[2] - plane.point[2]
  ];
  const g11 = dotVector3Components(plane.direction1, plane.direction1);
  const g12 = dotVector3Components(plane.direction1, plane.direction2);
  const g22 = dotVector3Components(plane.direction2, plane.direction2);
  const b1 = dotVector3Components(delta, plane.direction1);
  const b2 = dotVector3Components(delta, plane.direction2);
  const determinant = g11 * g22 - g12 * g12;
  const scale = Math.max(1, Math.abs(g11 * g22), Math.abs(g12 * g12));
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12 * scale) return null;
  const u = (b1 * g22 - b2 * g12) / determinant;
  const v = (b2 * g11 - b1 * g12) / determinant;
  return Number.isFinite(u) && Number.isFinite(v) ? { kind: 'plane', u, v } : null;
}

function dotVector3Components(first: Vector3, second: Vector3): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function coordinateBindingPosition(
  source: any,
  parameters: CoordinatePoint3DBindingParameters
): Vector3 | null {
  const curve = coordinateCurve3DData(source);
  if (curve && parameters.kind === 'curve') return evaluateCurve3D(curve, Number(parameters.t));
  const surface = coordinateSurface3DData(source);
  if (surface && parameters.kind === 'surface') {
    return evaluateSurface3D(surface, Number(parameters.u), Number(parameters.v));
  }
  const polygon = coordinatePolygon3DData(source);
  if (polygon && parameters.kind === 'polygon') {
    return polygonPointAt3D(polygon, { u: Number(parameters.u), v: Number(parameters.v) });
  }
  const solid = coordinateSolid3DData(source);
  if (solid && parameters.kind === 'solid') {
    return solidPointAt3D(solid, parameters);
  }
  const circle = coordinateCircle3DData(source);
  if (circle && parameters.kind === 'circle') return circlePointAt(circle, Number(parameters.angle));
  const sphere = coordinateSphere3DData(source);
  if (sphere && parameters.kind === 'sphere') return spherePointAtDirection(sphere, parameters.direction);
  const line = coordinateLinear3DData(source);
  if (line && parameters.kind === 'line') {
    const t = clampCoordinateLinearParameter(Number(parameters.t), line.domain);
    if (!Number.isFinite(t)) return null;
    return [
      line.anchor[0] + t * line.direction[0],
      line.anchor[1] + t * line.direction[1],
      line.anchor[2] + t * line.direction[2]
    ];
  }
  const plane = coordinatePlane3DData(source);
  if (plane && parameters.kind === 'plane') {
    const u = Number(parameters.u);
    const v = Number(parameters.v);
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
    return [
      plane.point[0] + u * plane.direction1[0] + v * plane.direction2[0],
      plane.point[1] + u * plane.direction1[1] + v * plane.direction2[1],
      plane.point[2] + u * plane.direction1[2] + v * plane.direction2[2]
    ];
  }
  return null;
}

function normalizeCoordinateBindingParameters(
  source: any,
  parameters: unknown
): CoordinatePoint3DBindingParameters | null {
  if (!parameters || typeof parameters !== 'object') return null;
  const value = parameters as Record<string, unknown>;
  if (coordinateCurve3DData(source) && value.kind === 'curve' && Number.isFinite(Number(value.t))) {
    const curve = coordinateCurve3DData(source)!;
    return { kind: 'curve', t: Math.max(curve.range[0], Math.min(curve.range[1], Number(value.t))) };
  }
  if (coordinateSurface3DData(source) && value.kind === 'surface' &&
      Number.isFinite(Number(value.u)) && Number.isFinite(Number(value.v))) {
    const surface = coordinateSurface3DData(source)!;
    return {
      kind: 'surface',
      u: Math.max(surface.uRange[0], Math.min(surface.uRange[1], Number(value.u))),
      v: Math.max(surface.vRange[0], Math.min(surface.vRange[1], Number(value.v)))
    };
  }
  if (coordinatePolygon3DData(source) && value.kind === 'polygon' &&
      Number.isFinite(Number(value.u)) && Number.isFinite(Number(value.v))) {
    return { kind: 'polygon', u: Number(value.u), v: Number(value.v) };
  }
  if (coordinateSolid3DData(source) && value.kind === 'solid') {
    const surface = String(value.surface || '');
    if (surface !== 'side' && surface !== 'base' && surface !== 'top' && surface !== 'face') return null;
    const normalized: CoordinatePoint3DBindingParameters = {
      kind: 'solid',
      surface,
      ...(Number.isFinite(Number(value.face)) ? { face: Number(value.face) } : {}),
      ...(Number.isFinite(Number(value.u)) ? { u: Number(value.u) } : {}),
      ...(Number.isFinite(Number(value.v)) ? { v: Number(value.v) } : {}),
      ...(Number.isFinite(Number(value.angle)) ? { angle: Number(value.angle) } : {}),
      ...(Number.isFinite(Number(value.height)) ? { height: Number(value.height) } : {}),
      ...(Number.isFinite(Number(value.radial)) ? { radial: Number(value.radial) } : {})
    };
    return solidPointAt3D(coordinateSolid3DData(source)!, normalized) ? normalized : null;
  }
  if (coordinateCircle3DData(source) && value.kind === 'circle' && Number.isFinite(Number(value.angle))) {
    return { kind: 'circle', angle: Number(value.angle) };
  }
  if (coordinateSphere3DData(source) && value.kind === 'sphere' && Array.isArray(value.direction)) {
    const direction = normalizeVector3(value.direction.map(Number));
    if (direction) return { kind: 'sphere', direction };
  }
  if (coordinateLinear3DData(source) && value.kind === 'line' && Number.isFinite(Number(value.t))) {
    const line = coordinateLinear3DData(source)!;
    return { kind: 'line', t: clampCoordinateLinearParameter(Number(value.t), line.domain) };
  }
  if (coordinatePlane3DData(source) && value.kind === 'plane' &&
      Number.isFinite(Number(value.u)) && Number.isFinite(Number(value.v))) {
    return { kind: 'plane', u: Number(value.u), v: Number(value.v) };
  }
  return null;
}

export function coordinatePoint3DBindingParameters(
  point: any
): CoordinatePoint3DBindingParameters | null {
  const parameters = point?.__liaPoint3DBindingParameters;
  if (!parameters || typeof parameters !== 'object') return null;
  if (parameters.kind === 'curve' && Number.isFinite(Number(parameters.t))) {
    return { kind: 'curve', t: Number(parameters.t) };
  }
  if (parameters.kind === 'surface' && Number.isFinite(Number(parameters.u)) && Number.isFinite(Number(parameters.v))) {
    return { kind: 'surface', u: Number(parameters.u), v: Number(parameters.v) };
  }
  if (parameters.kind === 'polygon' && Number.isFinite(Number(parameters.u)) && Number.isFinite(Number(parameters.v))) {
    return { kind: 'polygon', u: Number(parameters.u), v: Number(parameters.v) };
  }
  if (parameters.kind === 'solid') {
    const source = point?.__liaPoint3DBindingSource;
    return normalizeCoordinateBindingParameters(source, parameters);
  }  if (parameters.kind === 'circle' && Number.isFinite(Number(parameters.angle))) {
    return { kind: 'circle', angle: Number(parameters.angle) };
  }
  if (parameters.kind === 'sphere' && Array.isArray(parameters.direction)) {
    const direction = normalizeVector3(parameters.direction.map(Number));
    if (direction) return { kind: 'sphere', direction };
  }
  if (parameters.kind === 'line' && Number.isFinite(Number(parameters.t))) {
    return { kind: 'line', t: Number(parameters.t) };
  }
  if (parameters.kind === 'plane' &&
      Number.isFinite(Number(parameters.u)) && Number.isFinite(Number(parameters.v))) {
    return { kind: 'plane', u: Number(parameters.u), v: Number(parameters.v) };
  }
  return null;
}

export function clearCoordinatePoint3DConstraint(point: any): void {
  try { point?.__liaPoint3DBindingCleanup?.(); } catch (e) {}
  if (point) {
    point.__liaPoint3DBindingCleanup = null;
    point.__liaPoint3DBindingSync = null;
    point.__liaPoint3DBindingSource = null;
    point.__liaPoint3DBindingParameters = null;
  }
}

export function constrainCoordinatePoint3D(
  point: any,
  source: any,
  storedParameters?: CoordinatePoint3DBindingParameters | null
): boolean {
  if (!point?.__liaPoint3D || point.__liaPoint3DDependent ||
      (!coordinateCurve3DData(source) && !coordinateSurface3DData(source) &&
       !coordinateLinear3DData(source) && !coordinatePlane3DData(source) &&
       !coordinateCircle3DData(source) && !coordinateSphere3DData(source) &&
       !coordinatePolygon3DData(source) && !coordinateSolid3DData(source))) return false;
  const current = point3DCoordinates(point);
  if (!current) return false;
  const parameters = normalizeCoordinateBindingParameters(source, storedParameters) ||
    coordinateBindingParametersAt(current, source);
  if (!parameters) return false;
  clearCoordinatePoint3DConstraint(point);
  point.__liaPoint3DBindingSource = source;
  point.__liaPoint3DBindingParameters = parameters;

  const sync = () => {
    if (point.__liaPoint3DBindingSyncing) return;
    const active = coordinatePoint3DBindingParameters(point);
    if (!active) return;
    const position = coordinateBindingPosition(source, active);
    const present = point3DCoordinates(point);
    if (!position || !present ||
        position.every((value, index) => Math.abs(value - present[index]) <= 1e-10)) return;
    point.__liaPoint3DBindingSyncing = true;
    try { setCoordinatePoint3D(point, position, false); } finally { point.__liaPoint3DBindingSyncing = false; }
  };
  const updateFromDrag = () => {
    if (point.__liaPoint3DBindingSyncing) return;
    const position = point3DCoordinates(point);
    const next = position && coordinateBindingParametersAt(position, source);
    if (next) point.__liaPoint3DBindingParameters = next;
    sync();
  };
  const dragTarget = point.element2D || point;
  point.board?.on?.('update', sync);
  dragTarget?.on?.('drag', updateFromDrag);
  point.__liaPoint3DBindingSync = sync;
  point.__liaPoint3DBindingCleanup = () => {
    try { point.board?.off?.('update', sync); } catch (e) {}
    try { dragTarget?.off?.('drag', updateFromDrag); } catch (e) {}
    if (point.__liaPoint3DBindingSync === sync) point.__liaPoint3DBindingSync = null;
  };
  sync();
  return true;
}
export function coordinateLinear3DData(object: any): {
  anchor: Vector3;
  direction: Vector3;
  domain: LinearDomain3D;
} | null {
  const points = coordinateLinear3DSourcePoints(object);
  if (!points) return null;
  const anchor = coordinatesOfPoint3D(points[0]);
  const endpoint = coordinateLinear3DEndpoint(object);
  if (!anchor || !endpoint) return null;
  const direction: Vector3 = [
    endpoint[0] - anchor[0],
    endpoint[1] - anchor[1],
    endpoint[2] - anchor[2]
  ];
  if (!direction.every(Number.isFinite) || Math.hypot(...direction) <= 1e-12) return null;
  const kind = String(object.__liaLinear3DKind || 'line');
  const domain: LinearDomain3D = kind === 'ray'
    ? 'ray'
    : (kind === 'segment' || kind === 'vector' ? kind : 'line');
  return { anchor, direction, domain };
}
export function setCoordinatePoint3D(
  point: any,
  coordinates: [number, number, number],
  updateBoardAfterwards = true
): boolean {
  if (!point || !point.__liaPoint3D || typeof point.setPosition !== 'function') return false;
  try {
    point.setPosition(coordinates);
    if (updateBoardAfterwards) point.board?.update();
    return true;
  } catch (e) {
    return false;
  }
}

export function point3DCoordinates(point: any): [number, number, number] | null {
  if (!point || typeof point.X !== 'function' || typeof point.Y !== 'function' || typeof point.Z !== 'function') return null;
  const coordinates: [number, number, number] = [Number(point.X()), Number(point.Y()), Number(point.Z())];
  return coordinates.every(Number.isFinite) ? coordinates : null;
}

export function projectBoardCoordinatesToXYPlane(board: any, x: number, y: number): [number, number, number] {
  const entry = getCoordinateView3D(board);
  if (!entry || !entry.view || typeof entry.view.project2DTo3DPlane !== 'function') return [x, y, 0];
  try {
    const result = entry.view.project2DTo3DPlane(
      { coords: { usrCoords: [1, x, y] } },
      [1, 0, 0, 1],
      [1, 0, 0, 0]
    );
    if (Array.isArray(result) && result.length >= 4) {
      const coordinates: [number, number, number] = [Number(result[1]), Number(result[2]), 0];
      if (coordinates.every(Number.isFinite)) return coordinates;
    }
  } catch (e) {}
  return [x, y, 0];
}

function installControlStyles(container: HTMLElement): void {
  const root = container.getRootNode() as Document | ShadowRoot;
  if (!root || typeof (root as any).appendChild !== 'function') return;
  if ((root as any).__liaCoordinate3DStyles) return;
  (root as any).__liaCoordinate3DStyles = true;
  const style = document.createElement('style');
  style.textContent = `
    .lia-coordinate-scene-mode-switch{position:absolute;width:38px;height:38px}
    .lia-coordinate-scene-mode-switch::before{content:'';position:absolute;left:-9px;top:-4.5px;width:2px;height:44px;
      border:0;border-radius:999px;background:var(--lia-dgs-theme-color,#16e0df);pointer-events:none}
    .lia-coordinate-scene-mode-switch .lia-coordinate-scene-mode-button{position:relative;left:auto!important;top:auto!important;
      width:38px;height:38px;margin:0;padding:0;font:800 13px/1 system-ui,sans-serif;letter-spacing:-.02em}
    .lia-coordinate-scene-mode-button[aria-expanded="true"]{color:var(--lia-dgs-theme-color,#16e0df);
      border-color:var(--lia-dgs-theme-color,#16e0df);box-shadow:inset 0 0 0 1px var(--lia-dgs-theme-color,#16e0df)}
    .lia-coordinate-scene-mode-menu{position:absolute;top:50px;z-index:68;display:none;
      grid-template-columns:42px;grid-auto-rows:42px;gap:6px;width:auto;padding:7px;border:2px solid currentColor;
      border-radius:9px;background:var(--lia-dgs-menu-bg,#172024);color:var(--lia-dgs-neutral-color,#fff);
      box-shadow:0 6px 16px rgba(0,0,0,.28);pointer-events:none}
    .lia-coordinate-scene-mode-menu[data-open="1"]{display:grid;pointer-events:auto}
    .lia-coordinate-scene-mode-option{position:relative!important;left:auto!important;top:auto!important;
      width:42px!important;height:42px!important;margin:0!important;padding:0!important;
      font:800 13px/1 system-ui,sans-serif!important;letter-spacing:-.02em;pointer-events:auto}
    .lia-coordinate-scene-mode-option[aria-pressed="true"]{color:var(--lia-dgs-theme-color,#16e0df);
      border-color:var(--lia-dgs-theme-color,#16e0df);box-shadow:inset 0 0 0 1px var(--lia-dgs-theme-color,#16e0df);
      background:color-mix(in srgb,var(--lia-dgs-theme-color,#16e0df) 12%,transparent)}
    .lia-coordinate-3d-status{position:absolute;right:12px;top:56px;z-index:70;max-width:min(360px,calc(100% - 24px));
      padding:8px 10px;border-radius:7px;background:#5b2020;color:#fff;font:13px/1.35 system-ui,sans-serif;
      box-shadow:0 3px 12px rgba(0,0,0,.3)}
    .lia-coordinate-z-drag-guide{position:absolute;z-index:32;top:8%;bottom:8%;width:0;
      border-left:2px dashed #16e0df;pointer-events:none;filter:drop-shadow(0 0 2px #001)}
    .lia-coordinate-z-drag-guide::after{content:attr(data-value);position:absolute;top:4px;left:7px;
      padding:3px 6px;border-radius:5px;background:rgba(20,31,35,.92);color:#16e0df;
      font:600 13px/1.2 system-ui,sans-serif;white-space:nowrap}
  `;
  root.appendChild(style);
}

export function mountCoordinateView3DControls(
  board: any,
  container: HTMLElement,
  language: 'de' | 'en' = 'de'
): HTMLElement {
  try { board.__liaView3DControlsCleanup?.(); } catch (e) {}
  container.querySelectorAll(':scope > .lia-coordinate-3d-controls').forEach(node => node.remove());
  installControlStyles(container);

  const de = language === 'de';
  const menuBar = container.querySelector<HTMLElement>('.lia-dgs-top-menu');
  if (!menuBar || !menuBar.parentElement) {
    const placeholder = document.createElement('span');
    placeholder.className = 'lia-coordinate-3d-controls';
    placeholder.hidden = true;
    container.appendChild(placeholder);
    const cleanup = () => {
      placeholder.remove();
      if (board.__liaView3DControlsCleanup === cleanup) delete board.__liaView3DControlsCleanup;
    };
    board.__liaView3DControlsCleanup = cleanup;
    return placeholder;
  }

  const menuClip = menuBar.parentElement;
  const modeText: Record<SceneViewMode, string> = { '2d': '2D', '3d': '3D' };

  const controls = document.createElement('div');
  controls.className = 'lia-coordinate-3d-controls lia-coordinate-scene-mode-switch';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'lia-dgs-geometry-button lia-coordinate-scene-mode-button';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  controls.appendChild(trigger);
  const spacer = menuBar.querySelector('.lia-dgs-top-menu-scroll-spacer');
  menuBar.insertBefore(controls, spacer || null);

  const popup = document.createElement('div');
  popup.className = 'lia-coordinate-scene-mode-menu';
  popup.id = 'lia-coordinate-scene-mode-menu-' + String(board.__liaBoardId || container.id || 'board');
  popup.dataset.open = '0';
  popup.setAttribute('role', 'menu');
  popup.setAttribute('aria-label', de ? '2D- oder 3D-Ansicht wählen' : 'Choose 2D or 3D view');
  trigger.setAttribute('aria-controls', popup.id);
  menuClip.appendChild(popup);

  const makeOption = (mode: SceneViewMode, label: string) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'lia-dgs-geometry-button lia-coordinate-scene-mode-option';
    option.dataset.mode = mode;
    option.setAttribute('aria-label', label);
    option.setAttribute('aria-pressed', 'false');
    option.setAttribute('role', 'menuitemradio');
    option.title = label;
    option.textContent = modeText[mode];
    popup.appendChild(option);
    return option;
  };
  const twoD = makeOption('2d', de ? '2D-Ansicht' : '2D view');
  const threeD = makeOption('3d', de ? '3D-Ansicht' : '3D view');

  let status: HTMLElement | null = null;
  let statusTimer = 0;
  const showStatus = (message?: string) => {
    if (statusTimer) window.clearTimeout(statusTimer);
    status?.remove();
    status = null;
    if (!message) return;
    status = document.createElement('div');
    status.className = 'lia-coordinate-3d-status';
    status.setAttribute('role', 'status');
    status.textContent = message;
    container.appendChild(status);
    statusTimer = window.setTimeout(() => { status?.remove(); status = null; }, 5000);
  };
  const setOpen = (open: boolean) => {
    popup.dataset.open = open ? '1' : '0';
    trigger.setAttribute('aria-expanded', String(open));
    twoD.tabIndex = open ? 0 : -1;
    threeD.tabIndex = open ? 0 : -1;
    if (!open) return;
    container.dispatchEvent(new CustomEvent('lia-dgs-flyout-open', {
      detail: { owner: popup }
    }));
    const anchor = trigger.getBoundingClientRect();
    const clip = menuClip.getBoundingClientRect();
    const width = popup.offsetWidth || 104;
    popup.style.left = Math.max(8, Math.min(anchor.left - clip.left, clip.width - width - 8)) + 'px';
  };
  const sync = () => {
    const entry = getCoordinateView3D(board);
    const mode: SceneViewMode = board.__liaSceneMode === '3d' ? '3d' : '2d';
    trigger.textContent = modeText[mode];
    const title = de
      ? mode.toUpperCase() + '-Ansicht; Ansicht wechseln'
      : mode.toUpperCase() + ' view; change view';
    trigger.setAttribute('aria-label', title);
    trigger.title = title;
    twoD.setAttribute('aria-pressed', String(mode === '2d'));
    threeD.setAttribute('aria-pressed', String(mode === '3d'));
    if (entry) entry.controls = controls;
  };
  const requestMode = (mode: SceneViewMode) => {
    const result = requestCoordinateSceneMode(board, mode);
    showStatus(result.ok ? undefined : result.message);
    if (result.ok) setOpen(false);
    sync();
  };
  trigger.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(popup.dataset.open !== '1');
  });
  const selectMode = (event: MouseEvent, mode: SceneViewMode) => {
    event.preventDefault();
    event.stopPropagation();
    requestMode(mode);
  };
  twoD.addEventListener('click', event => selectMode(event, '2d'));
  threeD.addEventListener('click', event => selectMode(event, '3d'));
  controls.addEventListener('pointerdown', event => event.stopPropagation());
  popup.addEventListener('pointerdown', event => event.stopPropagation());

  const root = menuClip.getRootNode() as Document | ShadowRoot;
  const closeOutside = (event: Event) => {
    const target = event.target as Node | null;
    if (target && (controls.contains(target) || popup.contains(target))) return;
    setOpen(false);
  };
  const closeForPeerFlyout = (event: Event) => {
    if ((event as CustomEvent).detail?.owner !== popup) setOpen(false);
  };
  root.addEventListener('pointerdown', closeOutside, true);
  container.addEventListener('lia-dgs-flyout-open', closeForPeerFlyout);
  container.addEventListener('lia-coordinate-scene-change', sync);
  const cleanup = () => {
    root.removeEventListener('pointerdown', closeOutside, true);
    container.removeEventListener('lia-dgs-flyout-open', closeForPeerFlyout);
    container.removeEventListener('lia-coordinate-scene-change', sync);
    if (statusTimer) window.clearTimeout(statusTimer);
    status?.remove();
    popup.remove();
    controls.remove();
    const current = getCoordinateView3D(board);
    if (current?.controls === controls) current.controls = undefined;
    if (current?.controlsCleanup === cleanup) current.controlsCleanup = undefined;
    if (board.__liaView3DControlsCleanup === cleanup) delete board.__liaView3DControlsCleanup;
  };
  board.__liaView3DControlsCleanup = cleanup;
  sync();
  setOpen(false);
  const entry = getCoordinateView3D(board);
  if (entry) {
    entry.controls = controls;
    entry.controlsCleanup = cleanup;
  }
  return controls;
}
