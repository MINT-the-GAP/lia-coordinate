import { coordinateScreenDragDelta3D, getCoordinateView3D } from '../coord/view3d';
import type { Vector3 } from '../shared/vector3d';

export interface DgsSolidDraw3DStart {
  anchor: Vector3;
  tool: string;
}

export interface DgsSolidDraw3DCallbacks {
  /** Pick a valid first anchor; geometry is created only once dragging begins. */
  begin(event: PointerEvent): DgsSolidDraw3DStart | null;
  /** Create or resize the same preview. Return false to abort the gesture. */
  preview(start: DgsSolidDraw3DStart, size: number, event: PointerEvent): boolean | void;
  finish(cancelled: boolean, start: DgsSolidDraw3DStart): void;
  /** Replay a short click through the existing construction handler. */
  click(event: PointerEvent): void;
}

export interface DgsSolidDraw3DController {
  readonly active: boolean;
  handlePointerDown(event: PointerEvent): boolean;
  cancel(): void;
  destroy(): void;
}

interface DrawGesture {
  start: DgsSolidDraw3DStart;
  down: PointerEvent;
  pointerId: number;
  client: [number, number];
  scale: [number, number];
  pending: PointerEvent | null;
  started: boolean;
}

/**
 * Distinguishes the existing first click from drawing a regular solid.
 * Geometry and history stay in DGS; this controller owns only the gesture.
 */
export function mountDgsSolidDraw3D(
  board: any,
  container: HTMLElement,
  callbacks: DgsSolidDraw3DCallbacks
): DgsSolidDraw3DController {
  let gesture: DrawGesture | null = null;
  let animationFrame = 0;
  let replayingClick = false;
  let destroyed = false;
  const stop = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const current3D = (): boolean => board.__liaSceneMode === '3d' &&
    getCoordinateView3D(board)?.viewMode === '3d';

  const flush = (): void => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const active = gesture;
    const event = active?.pending;
    if (!active || !event) return;
    active.pending = null;
    if (!current3D()) { finish(true); return; }
    const dx = event.clientX - active.client[0];
    const dy = event.clientY - active.client[1];
    if (!active.started && Math.hypot(dx, dy) < 5) return;
    const delta = coordinateScreenDragDelta3D(
      board, active.start.anchor, dx * active.scale[0], dy * active.scale[1], 'camera'
    );
    const size = delta && Math.hypot(...delta);
    if (!size || !Number.isFinite(size) || size <= 1e-9) return;
    active.started = true;
    try {
      if (callbacks.preview(active.start, size, event) === false) finish(true);
    } catch (error) {
      finish(true);
      throw error;
    }
  };

  const detach = (active: DrawGesture): void => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancelEvent, true);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('blur', blur);
    try {
      if (container.hasPointerCapture(active.pointerId)) container.releasePointerCapture(active.pointerId);
    } catch (error) {}
  };
  const finish = (cancelled: boolean, event?: PointerEvent): void => {
    const active = gesture;
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    if (event) {
      stop(event);
      if (!cancelled && active.started &&
          Math.hypot(event.clientX - active.client[0], event.clientY - active.client[1]) < 5) {
        cancelled = true;
      }
      if (!cancelled) active.pending = event;
    }
    if (!cancelled) flush();
    if (gesture !== active) return;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    gesture = null;
    detach(active);
    if (active.started) {
      callbacks.finish(cancelled, active.start);
    } else if (!cancelled) {
      replayingClick = true;
      try { callbacks.click(active.down); } finally { replayingClick = false; }
    }
  };
  const move = (event: PointerEvent): void => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    stop(event);
    gesture.pending = event;
    if (!animationFrame) animationFrame = window.requestAnimationFrame(flush);
  };
  const up = (event: PointerEvent): void => finish(false, event);
  const cancelEvent = (event: PointerEvent): void => finish(true, event);
  const keydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !gesture) return;
    stop(event);
    finish(true);
  };
  const blur = (): void => finish(true);
  const lostCapture = (event: PointerEvent): void => {
    if (gesture && event.pointerId === gesture.pointerId) finish(true);
  };
  const sceneChange = (): void => {
    if (gesture && !current3D()) finish(true);
  };

  container.addEventListener('lostpointercapture', lostCapture);
  container.addEventListener('lia-coordinate-scene-change', sceneChange);

  return {
    get active() { return !!gesture; },
    handlePointerDown(event) {
      if (destroyed || replayingClick || event.button !== 0 ||
          event.isPrimary === false || !current3D()) return false;
      if (gesture) { stop(event); return true; }
      const start = callbacks.begin(event);
      if (!start || !start.anchor.every(Number.isFinite)) return false;
      const rect = container.getBoundingClientRect();
      gesture = {
        start: { tool: start.tool, anchor: start.anchor.slice() as Vector3 },
        down: event, pointerId: event.pointerId,
        client: [event.clientX, event.clientY],
        scale: [
          (Number(board.canvasWidth) || container.clientWidth || 1) / Math.max(1, rect.width),
          (Number(board.canvasHeight) || container.clientHeight || 1) / Math.max(1, rect.height)
        ],
        pending: null, started: false
      };
      stop(event);
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', cancelEvent, true);
      window.addEventListener('keydown', keydown, true);
      window.addEventListener('blur', blur);
      try { container.setPointerCapture(event.pointerId); } catch (error) {}
      return true;
    },
    cancel() { finish(true); },
    destroy() {
      if (destroyed) return;
      finish(true);
      destroyed = true;
      container.removeEventListener('lostpointercapture', lostCapture);
      container.removeEventListener('lia-coordinate-scene-change', sceneChange);
    }
  };
}