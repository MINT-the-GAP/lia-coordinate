import type { Vector3 } from '../shared/vector3d';

const EPSILON = 1e-10;
const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vector3, factor: number): Vector3 => [a[0] * factor, a[1] * factor, a[2] * factor];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
];
const same = (a: Vector3, b: Vector3): boolean => a.every((value, index) => Math.abs(value - b[index]) <= EPSILON);

function coordinates(point: any): Vector3 | null {
  const result: Vector3 = [Number(point?.X?.()), Number(point?.Y?.()), Number(point?.Z?.())];
  return result.every(Number.isFinite) ? result : null;
}
function frame(base: any, endpoint: any): { origin: Vector3; normal: Vector3 } | null {
  const origin = coordinates(base), end = coordinates(endpoint);
  if (!origin || !end) return null;
  const direction = subtract(end, origin), length = Math.hypot(...direction);
  return length > EPSILON ? { origin, normal: scale(direction, 1 / length) } : null;
}
function project(position: Vector3, origin: Vector3, normal: Vector3): Vector3 {
  return subtract(position, scale(normal, dot(subtract(position, origin), normal)));
}
function transport(radial: Vector3, previous: Vector3, normal: Vector3): Vector3 {
  const cosine = Math.max(-1, Math.min(1, dot(previous, normal)));
  const rotation = cross(previous, normal);
  // At a half turn, the radial vector itself is a valid rotation axis.
  let result = cosine < -1 + EPSILON ? radial : add(add(radial, cross(rotation, radial)),
    scale(cross(rotation, cross(rotation, radial)), 1 / (1 + cosine)));
  result = subtract(result, scale(normal, dot(result, normal)));
  const length = Math.hypot(...result), radius = Math.hypot(...radial);
  return length > EPSILON ? scale(result, radius / length) : radial;
}

type RadiusConstraint = {
  base: any;
  endpoint: any;
  leases: Set<object>;
  sync: () => void;
  restore: () => void;
};
const constraints = new WeakMap<object, RadiusConstraint>();

/**
 * The third point is the radius control in the plane through the base center,
 * perpendicular to the body axis. Keep this implicit construction constraint
 * separate from glider bindings: it must remain draggable with the whole body.
 */
export function installRoundRadiusPoint3D(
  point: any, base: any, endpoint: any, owner?: any
): () => void {
  if (!point?.__liaPoint3D || point === base || point === endpoint ||
      typeof point.setPosition !== 'function') {
    throw new TypeError('A round body requires a separate radius control point.');
  }
  let state = constraints.get(point);
  if (state && (state.base !== base || state.endpoint !== endpoint)) {
    throw new TypeError('This radius point already belongs to a different body axis.');
  }
  if (!state) {
    const existingDependency = point.__liaPoint3DDependent || point.__liaPoint3DBindingSource || point.slide ||
        point.__liaDgsCoordinateExpressions || typeof point.F === 'function' ||
        (Array.isArray(point.F) && point.F.some((value: any) => typeof value === 'function')) ||
        point.transformations?.length;
    const initialFrame = frame(base, endpoint), initial = coordinates(point);
    if (!initialFrame || !initial) throw new TypeError('The body axis and radius point must have finite coordinates.');
    const initialPosition = project(initial, initialFrame.origin, initialFrame.normal);
    if (Math.hypot(...subtract(initialPosition, initialFrame.origin)) <= EPSILON) {
      throw new TypeError('The radius control must lie outside the body axis.');
    }
    if (existingDependency) {
      // Compatible existing dependencies retain ownership of their coordinates.
      // The solid evaluator validates this invariant on subsequent updates.
      if (!same(initial, initialPosition)) {
        throw new TypeError('The bound radius point must lie in the base plane.');
      }
      return () => {};
    }

    const names = ['X', 'Y', 'Z', 'setPosition', 'update'] as const;
    const original = Object.fromEntries(names.map(name => [name, point[name]]));
    const own = Object.fromEntries(names.map(name => [name, Object.prototype.hasOwnProperty.call(point, name)]));
    const replacements: Record<string, any> = {};
    let origin = initialFrame.origin, normal = initialFrame.normal;
    let position = initialPosition;
    let radial = subtract(position, origin);
    let syncing = false;
    const raw = (): Vector3 => [original.X.call(point), original.Y.call(point), original.Z.call(point)];
    const updateProjection = (): void => {
      const child = point.element2D;
      if (!child?.coords?.setCoordinates || typeof point.view?.project3DTo2D !== 'function') return;
      const projected = point.view.project3DTo2D(point.coords);
      child.coords.setCoordinates((globalThis as any).JXG?.COORDS_BY_USER ?? 0, projected);
      point._c2d = child.coords.usrCoords.slice();
      child.needsUpdate = true;
      point.needsUpdate = true;
    };
    const write = (next: Vector3, current: { origin: Vector3; normal: Vector3 }): void => {
      origin = current.origin;
      normal = current.normal;
      position = next;
      radial = subtract(position, origin);
      original.setPosition.call(point, position.slice());
      updateProjection();
    };
    const sync = (): void => {
      if (syncing) return;
      syncing = true;
      try {
        const current = frame(base, endpoint);
        if (!current) return; // The body is hidden while its axis is degenerate.
        const present = raw();
        if (!present.every(Number.isFinite)) return;
        if (!same(present, position)) {
          write(project(present, current.origin, current.normal), current);
        } else if (!same(current.origin, origin) || !same(current.normal, normal)) {
          write(add(current.origin, transport(radial, normal, current.normal)), current);
        }
      } finally { syncing = false; }
    };
    replacements.setPosition = function(value: number[], ...args: any[]): any {
      if (syncing) return original.setPosition.call(point, value, ...args);
      const current = frame(base, endpoint);
      let next: Vector3 | null = null;
      if (Array.isArray(value) && value.length === 3) next = value.slice() as Vector3;
      else if (Array.isArray(value) && value.length >= 4 && Math.abs(value[0]) > EPSILON) {
        next = [value[1] / value[0], value[2] / value[0], value[3] / value[0]];
      }
      if (!current || !next?.every(Number.isFinite)) return original.setPosition.call(point, value, ...args);
      syncing = true;
      try { write(project(next, current.origin, current.normal), current); } finally { syncing = false; }
      return point;
    };
    for (const name of ['X', 'Y', 'Z']) replacements[name] = function(): number {
      sync();
      return original[name].call(point);
    };
    if (typeof original.update === 'function') replacements.update = function(...args: any[]): any {
      sync();
      const result = original.update.apply(point, args);
      sync(); // Native Point3D dragging can assign its coords without setPosition.
      return result;
    };
    Object.assign(point, replacements);
    state = {
      base, endpoint, leases: new Set(), sync,
      restore: () => {
        for (const name of Object.keys(replacements)) {
          if (point[name] !== replacements[name]) continue;
          if (own[name]) point[name] = original[name];
          else delete point[name];
        }
        if (point.__liaRoundRadiusPoint3DSync === sync) delete point.__liaRoundRadiusPoint3DSync;
        constraints.delete(point);
      }
    };
    constraints.set(point, state);
    point.__liaRoundRadiusPoint3DSync = sync;
    syncing = true;
    try { write(initialPosition, initialFrame); } finally { syncing = false; }
  }
  const lease = { owner };
  state.leases.add(lease);
  const registered = state;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    registered.leases.delete(lease);
    if (!registered.leases.size) registered.restore();
  };
}