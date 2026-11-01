import { getCoordinateView3D, type CoordinateView3DEntry } from '../coord/view3d';
import type { Vector3 } from '../shared/vector3d';

type Axis3D = 0 | 1 | 2;
type ScreenPoint = [number, number];

export interface DgsAxisDrag3DCallbacks {
  start(axis: Axis3D, event: PointerEvent, anchor: Vector3): boolean;
  move(axis: Axis3D, event: PointerEvent, delta: Vector3): void;
  finish(cancelled: boolean): void;
}

export interface DgsAxisDrag3DController {
  setSelection(object: any, anchor: () => Vector3 | null): void;
  refresh(): void;
  clear(): void;
  destroy(): void;
}

interface AxisDrag {
  axis: Axis3D;
  pointerId: number;
  anchor: Vector3;
  client: ScreenPoint;
  screen: ScreenPoint;
  scale: ScreenPoint;
  span: number;
  pending: PointerEvent | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const AXIS_COLORS = ['#ff00ff', '#00ffff', '#ffff00'];
const AXIS_NAMES = ['x', 'y', 'z'];

function pointAlongAxis(anchor: Vector3, axis: Axis3D, amount: number): Vector3 {
  const point = anchor.slice() as Vector3;
  point[axis] += amount;
  return point;
}

function screenPoint(entry: CoordinateView3DEntry, point: Vector3): ScreenPoint | null {
  try {
    const projected = entry.view.project3DTo2D(point);
    const board = entry.board;
    const container = board.containerObj as HTMLElement;
    const scaleX = container.clientWidth / (Number(board.canvasWidth) || container.clientWidth || 1);
    const scaleY = container.clientHeight / (Number(board.canvasHeight) || container.clientHeight || 1);
    const x = (Number(board.origin?.scrCoords?.[1]) + Number(projected?.[1]) * Number(board.unitX)) * scaleX;
    const y = (Number(board.origin?.scrCoords?.[2]) - Number(projected?.[2]) * Number(board.unitY)) * scaleY;
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  } catch (error) {
    return null;
  }
}

function spatialSpan(entry: CoordinateView3DEntry): number {
  return Math.max(1e-6, ...entry.spatialRanges.map(range => Math.abs(range[1] - range[0])));
}

function axisDragDelta(entry: CoordinateView3DEntry, drag: AxisDrag, event: PointerEvent): Vector3 | null {
  const target: ScreenPoint = [
    drag.screen[0] + (event.clientX - drag.client[0]) * drag.scale[0],
    drag.screen[1] + (event.clientY - drag.client[1]) * drag.scale[1]
  ];
  const epsilon = Math.max(1e-7, drag.span * 1e-5);
  let amount = 0;
  // A world axis projects to a screen line. Solve only the component along it;
  // the perpendicular component of mouse motion does not move the object.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const point = pointAlongAxis(drag.anchor, drag.axis, amount);
    const projected = screenPoint(entry, point);
    const next = screenPoint(entry, pointAlongAxis(point, drag.axis, epsilon));
    if (!projected || !next) return null;
    const derivativeX = (next[0] - projected[0]) / epsilon;
    const derivativeY = (next[1] - projected[1]) / epsilon;
    const lengthSquared = derivativeX ** 2 + derivativeY ** 2;
    if (!Number.isFinite(lengthSquared) || lengthSquared < 1e-12) return null;
    const error = (target[0] - projected[0]) * derivativeX +
      (target[1] - projected[1]) * derivativeY;
    if (Math.abs(error) / Math.sqrt(lengthSquared) < 0.02) break;
    const step = error / lengthSquared;
    if (!Number.isFinite(step)) return null;
    amount += Math.max(-drag.span * 8, Math.min(drag.span * 8, step));
    if (Math.abs(amount) > drag.span * 1000) return null;
  }
  const delta: Vector3 = [0, 0, 0];
  delta[drag.axis] = amount;
  return delta;
}

export function mountDgsAxisDrag3D(
  board: any,
  callbacks: DgsAxisDrag3DCallbacks,
  language: 'de' | 'en' = 'de'
): DgsAxisDrag3DController {
  const container = board.containerObj as HTMLElement;
  const root = document.createElementNS(SVG_NS, 'svg');
  root.classList.add('lia-dgs-axis-drag-3d');
  root.setAttribute('aria-label', language === 'de' ? '3D-Objektachsen' : '3D object axes');
  Object.assign(root.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    overflow: 'visible', pointerEvents: 'none', zIndex: '35', display: 'none'
  });
  const groups = AXIS_NAMES.map((name, axis) => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.dataset.axis = name;
    group.setAttribute('aria-label', language === 'de' ? name + '-Achse' : name + ' axis');
    group.setAttribute('role', 'button');
    group.style.cursor = 'grab';
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '16');
    hit.setAttribute('stroke-linecap', 'round');
    hit.setAttribute('fill', 'none');
    hit.style.pointerEvents = 'stroke';
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('stroke', AXIS_COLORS[axis]);
    line.setAttribute('stroke-width', '1.6');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('fill', 'none');
    line.style.pointerEvents = 'none';
    const arrow = document.createElementNS(SVG_NS, 'path');
    arrow.setAttribute('fill', AXIS_COLORS[axis]);
    arrow.style.pointerEvents = 'none';
    group.append(hit, line, arrow);
    root.appendChild(group);
    return { group, hit, line, arrow };
  });
  container.appendChild(root);

  let object: any = null;
  let getAnchor: (() => Vector3 | null) | null = null;
  let drag: AxisDrag | null = null;
  let renderFrame = 0;
  let dragFrame = 0;
  let destroyed = false;

  const refresh = (): void => {
    if (destroyed) return;
    const entry = getCoordinateView3D(board);
    const anchor = getAnchor?.();
    if (!object || !entry || entry.viewMode !== '3d' || board.__liaSceneMode !== '3d' ||
        object.__liaDgsShowObject === false || !anchor || !anchor.every(Number.isFinite)) {
      if (drag) finish(true);
      root.style.display = 'none';
      return;
    }
    const origin = screenPoint(entry, anchor);
    if (!origin) {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';
    root.setAttribute('viewBox', '0 0 ' + container.clientWidth + ' ' + container.clientHeight);
    const sample = spatialSpan(entry) / 8;
    groups.forEach(({ group, hit, line, arrow }, index) => {
      const axis = index as Axis3D;
      const end = screenPoint(entry, pointAlongAxis(anchor, axis, sample));
      const length = end ? Math.hypot(end[0] - origin[0], end[1] - origin[1]) : 0;
      if (!end || length < 8) {
        group.style.display = 'none';
        return;
      }
      group.style.display = '';
      const x = (end[0] - origin[0]) / length;
      const y = (end[1] - origin[1]) / length;
      // Leave the object's center free for point selection and its context menu.
      const startX = origin[0] + x * 18;
      const startY = origin[1] + y * 18;
      const tipX = origin[0] + x * 58;
      const tipY = origin[1] + y * 58;
      const neckX = tipX - x * 9;
      const neckY = tipY - y * 9;
      const path = 'M' + startX + ',' + startY + ' L' + tipX + ',' + tipY;
      hit.setAttribute('d', path);
      line.setAttribute('d', 'M' + (origin[0] + x * 5) + ',' + (origin[1] + y * 5) + ' L' + neckX + ',' + neckY);
      arrow.setAttribute('d', 'M' + tipX + ',' + tipY + ' L' + (neckX - y * 4) + ',' +
        (neckY + x * 4) + ' L' + (neckX + y * 4) + ',' + (neckY - x * 4) + ' Z');
      group.style.cursor = drag?.axis === axis ? 'grabbing' : 'grab';
    });
  };
  const scheduleRefresh = (): void => {
    if (destroyed || renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      refresh();
    });
  };
  const stop = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const flushDrag = (): void => {
    if (dragFrame) window.cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    if (!drag?.pending) return;
    const event = drag.pending;
    drag.pending = null;
    const entry = getCoordinateView3D(board);
    if (!entry) return;
    const delta = axisDragDelta(entry, drag, event);
    if (delta) callbacks.move(drag.axis, event, delta);
    refresh();
  };
  const finish = (cancelled: boolean, event?: PointerEvent): void => {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    if (event) {
      stop(event);
      if (!cancelled) drag.pending = event;
    }
    if (!cancelled) flushDrag();
    else if (dragFrame) window.cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    if (!drag) return;
    const pointerId = drag.pointerId;
    drag = null;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('keydown', keydown, true);
    try { root.releasePointerCapture(pointerId); } catch (error) {}
    callbacks.finish(cancelled);
    refresh();
  };
  const move = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stop(event);
    drag.pending = event;
    if (!dragFrame) dragFrame = window.requestAnimationFrame(flushDrag);
  };
  const up = (event: PointerEvent): void => finish(false, event);
  const cancel = (event: PointerEvent): void => finish(true, event);
  const keydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !drag) return;
    stop(event);
    finish(true);
  };
  const down = (event: PointerEvent): void => {
    if (drag || event.button !== 0 || event.isPrimary === false) return;
    const target = event.target as Element;
    const group = target?.closest?.('[data-axis]') as SVGElement | null;
    const index = AXIS_NAMES.indexOf(group?.dataset.axis || '');
    const entry = getCoordinateView3D(board);
    const anchor = getAnchor?.();
    if (index < 0 || !entry || entry.viewMode !== '3d' || !anchor ||
        !anchor.every(Number.isFinite)) return;
    const origin = screenPoint(entry, anchor);
    if (!origin) return;
    const rect = container.getBoundingClientRect();
    stop(event);
    if (!callbacks.start(index as Axis3D, event, anchor.slice() as Vector3)) return;
    drag = {
      axis: index as Axis3D, pointerId: event.pointerId,
      anchor: anchor.slice() as Vector3,
      client: [event.clientX, event.clientY], screen: origin,
      scale: [container.clientWidth / Math.max(1, rect.width),
        container.clientHeight / Math.max(1, rect.height)],
      span: spatialSpan(entry), pending: null
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('keydown', keydown, true);
    try { root.setPointerCapture(event.pointerId); } catch (error) {}
    refresh();
  };
  const lostCapture = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) finish(true);
  };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('lostpointercapture', lostCapture);
  container.addEventListener('lia-coordinate-scene-change', scheduleRefresh);
  container.addEventListener('lia-coordinate-3d-view-update', scheduleRefresh);
  container.addEventListener('lia-coordinate-geometry-change', scheduleRefresh);
  board.on?.('update', scheduleRefresh);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleRefresh) : null;
  observer?.observe(container);

  return {
    setSelection(nextObject, anchor) {
      if (drag && nextObject !== object) finish(true);
      object = nextObject;
      getAnchor = anchor;
      refresh();
    },
    refresh,
    clear() {
      if (drag) finish(true);
      object = null;
      getAnchor = null;
      root.style.display = 'none';
    },
    destroy() {
      if (destroyed) return;
      if (drag) finish(true);
      destroyed = true;
      if (renderFrame) window.cancelAnimationFrame(renderFrame);
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('lostpointercapture', lostCapture);
      container.removeEventListener('lia-coordinate-scene-change', scheduleRefresh);
      container.removeEventListener('lia-coordinate-3d-view-update', scheduleRefresh);
      container.removeEventListener('lia-coordinate-geometry-change', scheduleRefresh);
      board.off?.('update', scheduleRefresh);
      observer?.disconnect();
      root.remove();
    }
  };
}
