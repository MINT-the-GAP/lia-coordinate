import type { Vector3 } from './vector3d';
import { circleFromCenterNormalRadius, type Circle3 } from './circle3d';

export type RegularSurface3DKind = 'circle';

/** Independent sources suitable for an ordinary editable 3D circle. */
export interface RegularSurface3DRecipe {
  kind: RegularSurface3DKind;
  anchor: Vector3;
  points: Vector3[];
  circle: Circle3;
}

/**
 * Draw a circle parallel to world XY, starting at its center with the given radius.
 * Sources are center, radius point and the endpoint of its normal vector.
 */
export function createRegularSurface3DRecipe(
  kind: RegularSurface3DKind,
  anchor: Vector3,
  size: number
): RegularSurface3DRecipe | null {
  if (kind !== 'circle' || !Array.isArray(anchor) || anchor.length !== 3 ||
      !anchor.every(Number.isFinite) || !Number.isFinite(size) || size <= 0) return null;

  const start = anchor.slice() as Vector3;
  const points: Vector3[] = [
    start.slice() as Vector3,
    [start[0] + size, start[1], start[2]],
    [start[0], start[1], start[2] + size]
  ];
  if (points.some(point => !point.every(Number.isFinite))) return null;
  const circle = circleFromCenterNormalRadius(start, [0, 0, 1], size);
  return circle ? { kind, anchor: start, points, circle } : null;
}
