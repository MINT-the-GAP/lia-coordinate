import type { Vector3 } from './vector3d';
import {
  intersectLineCone3D, intersectLineCylinder3D, type Solid3
} from './solid3d';

/** A ray from a rendered world point towards the viewer, in world units. */
export interface OcclusionRay3D {
  origin: Vector3;
  direction: Vector3;
  /** Distance from origin to the eye for perspective; omitted for parallel views. */
  maxDistance?: number;
  /** Surface contacts within this world-space distance are not occluders. */
  epsilon?: number;
}

interface OcclusionAppearance3D {
  opacity?: number;
  /** Faces sharing an owner attenuate only once; also allows self-exclusion. */
  owner?: unknown;
}

export type OcclusionSurface3D = OcclusionAppearance3D & (
  { kind: 'sphere'; center: Vector3; radius: number } |
  { kind: 'disk'; center: Vector3; normal: Vector3; radius: number } |
  { kind: 'polygon'; vertices: readonly Vector3[] } |
  { kind: 'solid'; solid: Solid3 }
);

export interface OcclusionHit3D {
  distance: number;
  point: Vector3;
  surface: OcclusionSurface3D;
}

interface NormalizedRay3D {
  origin: Vector3;
  direction: Vector3;
  maxDistance: number;
  epsilon: number;
}

function finitePoint(point: readonly number[]): boolean {
  return !!point && point.length >= 3 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2]);
}

function normalizedRay(ray: OcclusionRay3D): NormalizedRay3D | null {
  if (!ray || !finitePoint(ray.origin) || !finitePoint(ray.direction)) return null;
  const length = Math.hypot(...ray.direction);
  const maxDistance = ray.maxDistance ?? Infinity;
  if (!(length > 0) || !Number.isFinite(length) || !(maxDistance > 0)) return null;
  const epsilon = Number.isFinite(ray.epsilon) && ray.epsilon! >= 0
    ? ray.epsilon!
    : Math.max(1e-8, 32 * Number.EPSILON * Math.max(1, ...ray.origin.map(Math.abs)));
  return {
    origin: ray.origin,
    direction: [ray.direction[0] / length, ray.direction[1] / length, ray.direction[2] / length],
    maxDistance,
    epsilon
  };
}

function validDistance(ray: NormalizedRay3D, distance: number): boolean {
  return distance > ray.epsilon && distance < ray.maxDistance - ray.epsilon;
}

function sphereDistance(ray: NormalizedRay3D, center: Vector3, radius: number): number | null {
  if (!finitePoint(center) || !Number.isFinite(radius) || !(radius > 0)) return null;
  const dx = center[0] - ray.origin[0];
  const dy = center[1] - ray.origin[1];
  const dz = center[2] - ray.origin[2];
  const projection = dx * ray.direction[0] + dy * ray.direction[1] + dz * ray.direction[2];
  // Cross-product distance avoids cancellation in |delta|^2 - projection^2.
  const cx = dy * ray.direction[2] - dz * ray.direction[1];
  const cy = dz * ray.direction[0] - dx * ray.direction[2];
  const cz = dx * ray.direction[1] - dy * ray.direction[0];
  const discriminant = radius * radius - (cx * cx + cy * cy + cz * cz);
  // Tangency has no visible area and should not create a dark silhouette halo.
  if (!(discriminant > ray.epsilon * ray.epsilon)) return null;
  const halfChord = Math.sqrt(discriminant);
  const first = projection - halfChord;
  const second = projection + halfChord;
  if (validDistance(ray, first)) return first;
  return validDistance(ray, second) ? second : null;
}

function diskDistance(ray: NormalizedRay3D, center: Vector3, normal: Vector3, radius: number): number | null {
  if (!finitePoint(center) || !finitePoint(normal) || !(radius > 0) || !Number.isFinite(radius)) return null;
  const length = Math.hypot(...normal);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const nx = normal[0] / length, ny = normal[1] / length, nz = normal[2] / length;
  const denominator = nx * ray.direction[0] + ny * ray.direction[1] + nz * ray.direction[2];
  if (Math.abs(denominator) <= 1e-12) return null;
  const distance = ((center[0] - ray.origin[0]) * nx +
    (center[1] - ray.origin[1]) * ny + (center[2] - ray.origin[2]) * nz) / denominator;
  if (!validDistance(ray, distance)) return null;
  const dx = ray.origin[0] + distance * ray.direction[0] - center[0];
  const dy = ray.origin[1] + distance * ray.direction[1] - center[1];
  const dz = ray.origin[2] + distance * ray.direction[2] - center[2];
  return Math.hypot(dx, dy, dz) <= radius + ray.epsilon ? distance : null;
}
function polygonDistance(ray: NormalizedRay3D, vertices: readonly Vector3[]): number | null {
  if (!Array.isArray(vertices) || vertices.length < 3 || !vertices.every(finitePoint)) return null;
  const first = vertices[0];
  let nx = 0, ny = 0, nz = 0;
  // Newell's normal works for convex faces and planar concave polygons alike.
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const ax = a[0] - first[0], ay = a[1] - first[1], az = a[2] - first[2];
    const bx = b[0] - first[0], by = b[1] - first[1], bz = b[2] - first[2];
    nx += ay * bz - az * by;
    ny += az * bx - ax * bz;
    nz += ax * by - ay * bx;
  }
  const normalLength = Math.hypot(nx, ny, nz);
  if (!(normalLength > ray.epsilon * ray.epsilon)) return null;
  nx /= normalLength; ny /= normalLength; nz /= normalLength;
  const denominator = nx * ray.direction[0] + ny * ray.direction[1] + nz * ray.direction[2];
  if (Math.abs(denominator) <= 1e-12) return null;
  const distance = ((first[0] - ray.origin[0]) * nx +
    (first[1] - ray.origin[1]) * ny + (first[2] - ray.origin[2]) * nz) / denominator;
  if (!validDistance(ray, distance)) return null;
  const point: Vector3 = [
    ray.origin[0] + distance * ray.direction[0],
    ray.origin[1] + distance * ray.direction[1],
    ray.origin[2] + distance * ray.direction[2]
  ];
  const drop = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0
    : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
  const u = (drop + 1) % 3, v = (drop + 2) % 3;
  const px = point[u] - first[u], py = point[v] - first[v];
  let inside = false;
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const ax = a[u] - first[u], ay = a[v] - first[v];
    const bx = b[u] - first[u], by = b[v] - first[v];
    const ex = bx - ax, ey = by - ay;
    const cross = (px - ax) * ey - (py - ay) * ex;
    const edgeLength = Math.hypot(ex, ey);
    if (edgeLength > ray.epsilon && Math.abs(cross) <= ray.epsilon * edgeLength &&
        px >= Math.min(ax, bx) - ray.epsilon && px <= Math.max(ax, bx) + ray.epsilon &&
        py >= Math.min(ay, by) - ray.epsilon && py <= Math.max(ay, by) + ray.epsilon) return distance;
    if ((ay > py) !== (by > py) && px < ax + (py - ay) * ex / ey) inside = !inside;
  }
  return inside ? distance : null;
}

function surfaceDistance(ray: NormalizedRay3D, surface: OcclusionSurface3D): number | null {
  if (surface.kind === 'sphere') return sphereDistance(ray, surface.center, surface.radius);
  if (surface.kind === 'disk') return diskDistance(ray, surface.center, surface.normal, surface.radius);
  if (surface.kind === 'polygon') return polygonDistance(ray, surface.vertices);
  const solid = surface.solid;
  if (!solid) return null;
  if (solid.kind === 'cylinder' || solid.kind === 'cone') {
    const intersections = solid.kind === 'cylinder'
      ? intersectLineCylinder3D(ray.origin, ray.direction, solid, 'ray')
      : intersectLineCone3D(ray.origin, ray.direction, solid, 'ray');
    let nearest = Infinity;
    for (const distance of intersections.parameters || []) {
      if (validDistance(ray, distance)) nearest = Math.min(nearest, distance);
    }
    return Number.isFinite(nearest) ? nearest : null;
  }
  let nearest = Infinity;
  for (const face of solid.faces) {
    const distance = polygonDistance(ray, face.map(index => solid.vertices[index]));
    if (distance != null) nearest = Math.min(nearest, distance);
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/** First intersection strictly between the sampled point and viewer. */
export function occlusionHit3D(ray: OcclusionRay3D, surface: OcclusionSurface3D): OcclusionHit3D | null {
  const normalized = normalizedRay(ray);
  if (!normalized || !surface) return null;
  const distance = surfaceDistance(normalized, surface);
  return distance == null ? null : {
    distance,
    point: normalized.origin.map((value, axis) => value + distance * normalized.direction[axis]) as Vector3,
    surface
  };
}

/** Combined cover alpha; a closed body's front/back faces count only once. */
export function occlusionOpacity3D(
  ray: OcclusionRay3D,
  surfaces: readonly OcclusionSurface3D[],
  excludeOwner?: unknown
): number {
  const normalized = normalizedRay(ray);
  if (!normalized) return 0;
  let transmission = 1;
  const seen = new Set<unknown>();
  for (const surface of surfaces) {
    if (!surface || (excludeOwner !== undefined && surface.owner === excludeOwner)) continue;
    const owner = surface.owner ?? surface;
    if (seen.has(owner)) continue;
    const opacity = Math.max(0, Math.min(1, surface.opacity ?? 1));
    if (!(opacity > 0) || surfaceDistance(normalized, surface) == null) continue;
    seen.add(owner);
    transmission *= 1 - opacity;
    if (transmission <= 1e-4) return 1;
  }
  return 1 - transmission;
}
