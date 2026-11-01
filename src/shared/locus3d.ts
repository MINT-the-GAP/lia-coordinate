import { createEvaluatedCurve3D, type ParametricCurve3D } from './curve3d';
import { createEvaluatedSurface3D, type ParametricSurface3D } from './surface3d';
import type { Vector3 } from './vector3d';

export interface LocusDriver3D {
  id: string;
  source?: unknown;
  range: [number, number];
  get: () => number;
  set: (value: number) => void;
}

export interface LocusCurve3DDefinition {
  kind: 'locus-curve3d';
  driverId: string;
  tracePointId: string;
  range: [number, number];
  quality: number;
  curve: ParametricCurve3D;
}

export interface LocusSurface3DDefinition {
  kind: 'locus-surface3d';
  driverIds: [string, string];
  tracePointId: string;
  uRange: [number, number];
  vRange: [number, number];
  quality: [number, number];
  surface: ParametricSurface3D;
}

function finitePoint(value: unknown): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const point: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return point.every(Number.isFinite) ? point : null;
}

export function withRestoredDrivers3D<T>(drivers: LocusDriver3D[], action: () => T): T {
  const original = drivers.map(driver => driver.get());
  try {
    return action();
  } finally {
    drivers.forEach((driver, index) => {
      try { driver.set(original[index]); } catch (error) {}
    });
  }
}

export function createLocusCurve3D(
  driver: LocusDriver3D,
  tracePointId: string,
  evaluateTracePoint: () => readonly number[] | null,
  options: { quality?: number; batch?: (action: () => void) => void } = {}
): LocusCurve3DDefinition | null {
  if (!driver || typeof driver.get !== 'function' || typeof driver.set !== 'function' ||
      typeof evaluateTracePoint !== 'function') return null;
  const quality = Math.max(8, Math.min(512, Math.round(Number(options.quality) || 96)));
  let evaluating = false;
  const evaluate = (parameter: number): Vector3 | null => {
    if (evaluating) return null;
    evaluating = true;
    let point: Vector3 | null = null;
    try {
      // Restoring a driver is part of the batch too: it must not trigger a
      // complete board redraw while the locus itself is being sampled.
      const update = () => withRestoredDrivers3D([driver], () => {
        driver.set(parameter); point = finitePoint(evaluateTracePoint());
      });
      if (options.batch) options.batch(update); else update();
      return point;
    } finally {
      evaluating = false;
    }
  };
  const curve = createEvaluatedCurve3D(evaluate, driver.range, {
    parameter: 't', expressions: ['locus-x(t)', 'locus-y(t)', 'locus-z(t)'], quality
  });
  return curve ? {
    kind: 'locus-curve3d', driverId: driver.id, tracePointId,
    range: [...driver.range] as [number, number], quality, curve
  } : null;
}

export function createLocusSurface3D(
  first: LocusDriver3D,
  second: LocusDriver3D,
  tracePointId: string,
  evaluateTracePoint: () => readonly number[] | null,
  options: { quality?: number | [number, number]; batch?: (action: () => void) => void } = {}
): LocusSurface3DDefinition | null {
  if (!first || !second || first.id === second.id || typeof evaluateTracePoint !== 'function') return null;
  const rawQuality = options.quality;
  const quality: [number, number] = Array.isArray(rawQuality)
    ? [Math.max(4, Math.min(64, Math.round(Number(rawQuality[0]) || 20))), Math.max(4, Math.min(64, Math.round(Number(rawQuality[1]) || 20)))]
    : [Math.max(4, Math.min(64, Math.round(Number(rawQuality) || 20))), Math.max(4, Math.min(64, Math.round(Number(rawQuality) || 20)))];
  let evaluating = false;
  const evaluate = (u: number, v: number): Vector3 | null => {
    if (evaluating) return null;
    evaluating = true;
    let point: Vector3 | null = null;
    try {
      const update = () => withRestoredDrivers3D([first, second], () => {
        first.set(u); second.set(v); point = finitePoint(evaluateTracePoint());
      });
      if (options.batch) options.batch(update); else update();
      return point;
    } finally {
      evaluating = false;
    }
  };
  const surface = createEvaluatedSurface3D(evaluate, first.range, second.range, {
    parameters: ['u', 'v'], expressions: ['locus-x(u,v)', 'locus-y(u,v)', 'locus-z(u,v)'], quality
  });
  return surface ? {
    kind: 'locus-surface3d', driverIds: [first.id, second.id], tracePointId,
    uRange: [...first.range] as [number, number], vRange: [...second.range] as [number, number], quality, surface
  } : null;
}