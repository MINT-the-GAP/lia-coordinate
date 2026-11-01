import {
  addVector3, normalizeVector3, scaleVector3, subtractVector3, vector3Norm, type Vector3
} from './vector3d';
import {
  crossVector3, dotVector3, parameterAllowed3D, planeFromPointNormal,
  planeTolerance, signedDistancePointPlane, type LinearDomain3D, type Plane3
} from './plane3d';
import {
  intersectLinePolygon3D, nearestPointOnPolygon3D, polygonFromPoints3D,
  polygonLocalCoordinates3D, polygonPointAt3D, type Polygon3
} from './polygon3d';

export type Polyhedron3Kind = 'tetrahedron' | 'pyramid' | 'prism' | 'parallelepiped' | 'cuboid' | 'section';

export interface Polyhedron3 {
  kind: Polyhedron3Kind;
  vertices: Vector3[];
  faces: number[][];
  edges: Array<[number, number]>;
  facePolygons: Polygon3[];
  centroid: Vector3;
  surfaceArea: number;
  volume: number;
  baseArea?: number;
  height?: number;
}

export interface Cylinder3 {
  kind: 'cylinder';
  baseCenter: Vector3;
  topCenter: Vector3;
  axis: Vector3;
  height: number;
  radius: number;
  direction1: Vector3;
  direction2: Vector3;
  basePlane: Plane3;
  topPlane: Plane3;
  baseArea: number;
  lateralArea: number;
  surfaceArea: number;
  volume: number;
  centroid: Vector3;
}

export interface Cone3 {
  kind: 'cone';
  baseCenter: Vector3;
  apex: Vector3;
  axis: Vector3;
  height: number;
  radius: number;
  slantHeight: number;
  direction1: Vector3;
  direction2: Vector3;
  basePlane: Plane3;
  baseArea: number;
  lateralArea: number;
  surfaceArea: number;
  volume: number;
  centroid: Vector3;
}

export type Solid3 = Polyhedron3 | Cylinder3 | Cone3;

export interface SolidSurfaceBinding3D {
  surface: 'side' | 'base' | 'top' | 'face';
  face?: number;
  u?: number;
  v?: number;
  angle?: number;
  height?: number;
  radial?: number;
}

export interface PointSetSolidIntersection3D {
  kind: 'none' | 'point' | 'points' | 'contained' | 'invalid';
  points: Vector3[];
  parameters?: number[];
}

function finiteVector(value: readonly number[]): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const vector: Vector3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return vector.every(Number.isFinite) ? vector : null;
}

function mean(points: readonly Vector3[]): Vector3 {
  return points.reduce<Vector3>((sum, point) => [
    sum[0] + point[0] / points.length,
    sum[1] + point[1] / points.length,
    sum[2] + point[2] / points.length
  ], [0, 0, 0]);
}

function uniqueEdges(faces: readonly number[][]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  const seen = new Set<string>();
  faces.forEach(face => face.forEach((value, index) => {
    const next = face[(index + 1) % face.length];
    const edge: [number, number] = value < next ? [value, next] : [next, value];
    const key = edge[0] + ':' + edge[1];
    if (!seen.has(key)) {
      seen.add(key);
      result.push(edge);
    }
  }));
  return result;
}

function convexVolume(vertices: readonly Vector3[], faces: readonly number[][], center: Vector3): number {
  let volume = 0;
  faces.forEach(face => {
    if (face.length < 3) return;
    const first = subtractVector3(vertices[face[0]], center)!;
    for (let index = 1; index < face.length - 1; index += 1) {
      const second = subtractVector3(vertices[face[index]], center)!;
      const third = subtractVector3(vertices[face[index + 1]], center)!;
      volume += Math.abs(dotVector3(first, crossVector3(second, third) || [])) / 6;
    }
  });
  return volume;
}

export function polyhedronFromVerticesFaces3D(
  kind: Polyhedron3Kind,
  vertexValues: ReadonlyArray<readonly number[]>,
  faceValues: ReadonlyArray<readonly number[]>,
  metrics: Partial<Pick<Polyhedron3, 'volume' | 'centroid' | 'baseArea' | 'height'>> = {}
): Polyhedron3 | null {
  const converted = vertexValues.map(finiteVector);
  if (converted.length < 4 || converted.some(point => !point)) return null;
  const vertices = converted as Vector3[];
  const faces = faceValues.map(face => Array.from(face, Number));
  if (faces.length < 4 || faces.some(face =>
    face.length < 3 || face.some(index => !Number.isInteger(index) || index < 0 || index >= vertices.length))) return null;
  const facePolygons = faces.map(face => polygonFromPoints3D(face.map(index => vertices[index])));
  if (facePolygons.some(face => !face)) return null;
  const polygons = facePolygons as Polygon3[];
  const centroid = metrics.centroid && finiteVector(metrics.centroid)
    ? finiteVector(metrics.centroid)!
    : mean(vertices);
  const surfaceArea = polygons.reduce((sum, face) => sum + face.area, 0);
  const calculatedVolume = convexVolume(vertices, faces, centroid);
  const volume = Number.isFinite(metrics.volume) ? Math.abs(Number(metrics.volume)) : calculatedVolume;
  const tolerance = planeTolerance(...vertices);
  if (!Number.isFinite(surfaceArea) || !Number.isFinite(volume) || surfaceArea <= tolerance || volume <= tolerance ** 3) return null;
  return {
    kind,
    vertices: vertices.map(point => point.slice() as Vector3),
    faces: faces.map(face => face.slice()),
    edges: uniqueEdges(faces),
    facePolygons: polygons,
    centroid,
    surfaceArea,
    volume,
    ...(Number.isFinite(metrics.baseArea) ? { baseArea: Number(metrics.baseArea) } : {}),
    ...(Number.isFinite(metrics.height) ? { height: Math.abs(Number(metrics.height)) } : {})
  };
}

export function tetrahedronFromPoints3D(values: ReadonlyArray<readonly number[]>): Polyhedron3 | null {
  if (values.length < 4) return null;
  const points = values.slice(0, 4).map(finiteVector);
  if (points.some(point => !point)) return null;
  const [a, b, c, d] = points as Vector3[];
  const volume = Math.abs(dotVector3(
    subtractVector3(b, a) || [],
    crossVector3(subtractVector3(c, a) || [], subtractVector3(d, a) || []) || []
  )) / 6;
  return polyhedronFromVerticesFaces3D(
    'tetrahedron', [a, b, c, d], [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]], { volume }
  );
}

export function pyramidFromBaseApex3D(base: Polygon3, apexValue: readonly number[]): Polyhedron3 | null {
  const apex = finiteVector(apexValue);
  if (!apex) return null;
  const signedHeight = signedDistancePointPlane(apex, base.plane);
  const tolerance = planeTolerance(apex, ...base.vertices);
  if (!Number.isFinite(signedHeight) || Math.abs(signedHeight) <= tolerance) return null;
  const vertices = [...base.vertices, apex];
  const apexIndex = vertices.length - 1;
  const faces: number[][] = [base.vertices.map((_, index) => index)];
  base.vertices.forEach((_, index) => faces.push([index, (index + 1) % base.vertices.length, apexIndex]));
  return polyhedronFromVerticesFaces3D('pyramid', vertices, faces, {
    baseArea: base.area,
    height: Math.abs(signedHeight),
    volume: base.area * Math.abs(signedHeight) / 3,
    centroid: addVector3(scaleVector3(base.centroid, 0.75) || [], scaleVector3(apex, 0.25) || []) || undefined
  });
}

export function prismFromBaseVector3D(base: Polygon3, vectorValue: readonly number[]): Polyhedron3 | null {
  const vector = finiteVector(vectorValue);
  if (!vector || vector3Norm(vector) <= planeTolerance(vector, ...base.vertices)) return null;
  const height = Math.abs(dotVector3(vector, base.normal));
  if (height <= planeTolerance(vector, ...base.vertices)) return null;
  const count = base.vertices.length;
  const top = base.vertices.map(point => addVector3(point, vector)!);
  const faces: number[][] = [
    base.vertices.map((_, index) => index),
    top.map((_, index) => count + count - 1 - index)
  ];
  base.vertices.forEach((_, index) => faces.push([index, (index + 1) % count, count + (index + 1) % count, count + index]));
  return polyhedronFromVerticesFaces3D('prism', [...base.vertices, ...top], faces, {
    baseArea: base.area,
    height,
    volume: base.area * height,
    centroid: addVector3(base.centroid, scaleVector3(vector, 0.5) || []) || undefined
  });
}

function parallelepipedVertices(origin: Vector3, first: Vector3, second: Vector3, third: Vector3): Vector3[] {
  const add = (...vectors: Vector3[]): Vector3 =>
    vectors.reduce((sum, vector) => addVector3(sum, vector)!, [0, 0, 0] as Vector3);
  return [
    origin, add(origin, first), add(origin, first, second), add(origin, second),
    add(origin, third), add(origin, first, third), add(origin, first, second, third), add(origin, second, third)
  ];
}

export function parallelepipedFromPointVectors3D(
  originValue: readonly number[], firstValue: readonly number[],
  secondValue: readonly number[], thirdValue: readonly number[],
  requireOrthogonal = false
): Polyhedron3 | null {
  const values = [originValue, firstValue, secondValue, thirdValue].map(finiteVector);
  if (values.some(value => !value)) return null;
  const [origin, first, second, third] = values as Vector3[];
  const scale = Math.max(1, vector3Norm(first), vector3Norm(second), vector3Norm(third));
  const tolerance = 1e-10 * scale * scale;
  const triple = dotVector3(first, crossVector3(second, third) || []);
  if (!Number.isFinite(triple) || Math.abs(triple) <= tolerance * scale) return null;
  if (requireOrthogonal && (
    Math.abs(dotVector3(first, second)) > tolerance ||
    Math.abs(dotVector3(first, third)) > tolerance ||
    Math.abs(dotVector3(second, third)) > tolerance
  )) return null;
  const kind: Polyhedron3Kind = requireOrthogonal ? 'cuboid' : 'parallelepiped';
  return polyhedronFromVerticesFaces3D(kind, parallelepipedVertices(origin, first, second, third), [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]
  ], { volume: Math.abs(triple) });
}

function roundFrame(baseValue: readonly number[], topValue: readonly number[], radiusValue: number) {
  const base = finiteVector(baseValue);
  const top = finiteVector(topValue);
  const axisVector = base && top ? subtractVector3(top, base) : null;
  const height = axisVector ? vector3Norm(axisVector) : NaN;
  const axis = axisVector ? normalizeVector3(axisVector) : null;
  const radius = Number(radiusValue);
  const basePlane = base && axis ? planeFromPointNormal(base, axis) : null;
  const topPlane = top && axis ? planeFromPointNormal(top, axis) : null;
  if (!base || !top || !axis || !basePlane || !topPlane ||
      !Number.isFinite(radius) || radius <= planeTolerance(base, top) ||
      !Number.isFinite(height) || height <= planeTolerance(base, top)) return null;
  return { base, top, axis, height, radius, basePlane, topPlane };
}

export function cylinderFromAxisRadius3D(
  baseValue: readonly number[], topValue: readonly number[], radiusValue: number
): Cylinder3 | null {
  const frame = roundFrame(baseValue, topValue, radiusValue);
  if (!frame) return null;
  const baseArea = Math.PI * frame.radius ** 2;
  const lateralArea = 2 * Math.PI * frame.radius * frame.height;
  return {
    kind: 'cylinder',
    baseCenter: frame.base,
    topCenter: frame.top,
    axis: frame.axis,
    height: frame.height,
    radius: frame.radius,
    direction1: frame.basePlane.direction1,
    direction2: frame.basePlane.direction2,
    basePlane: frame.basePlane,
    topPlane: frame.topPlane,
    baseArea,
    lateralArea,
    surfaceArea: lateralArea + 2 * baseArea,
    volume: baseArea * frame.height,
    centroid: scaleVector3(addVector3(frame.base, frame.top) || [], 0.5)!
  };
}

export function coneFromBaseApexRadius3D(
  baseValue: readonly number[], apexValue: readonly number[], radiusValue: number
): Cone3 | null {
  const frame = roundFrame(baseValue, apexValue, radiusValue);
  if (!frame) return null;
  const baseArea = Math.PI * frame.radius ** 2;
  const slantHeight = Math.hypot(frame.height, frame.radius);
  const lateralArea = Math.PI * frame.radius * slantHeight;
  return {
    kind: 'cone',
    baseCenter: frame.base,
    apex: frame.top,
    axis: frame.axis,
    height: frame.height,
    radius: frame.radius,
    slantHeight,
    direction1: frame.basePlane.direction1,
    direction2: frame.basePlane.direction2,
    basePlane: frame.basePlane,
    baseArea,
    lateralArea,
    surfaceArea: lateralArea + baseArea,
    volume: baseArea * frame.height / 3,
    centroid: addVector3(frame.base, scaleVector3(subtractVector3(frame.top, frame.base) || [], 0.25) || [])!
  };
}

/** Viewing data in world coordinates, independent of screen scale or panning. */
export type RoundSolidView3D = { direction: Vector3 } | { eye: Vector3 };

/**
 * Generator angles where the smooth mantle is tangent to the viewing rays.
 * Cone generators are generally not opposite each other on the base circle.
 * No generators are visible when the projected tip lies inside the base rim.
 */
export function roundSolidSilhouetteAngles3D(
  solid: Cylinder3 | Cone3,
  view: RoundSolidView3D
): [number, number] | null {
  const perspective = 'eye' in view;
  const viewer = perspective
    ? subtractVector3(view.eye, solid.baseCenter)
    : normalizeVector3(view.direction);
  if (!viewer || !viewer.every(Number.isFinite)) return null;
  const first = dotVector3(viewer, solid.direction1);
  const second = dotVector3(viewer, solid.direction2);
  const axial = dotVector3(viewer, solid.axis);
  const radial = Math.hypot(first, second);
  const scale = Math.max(1, vector3Norm(viewer));
  if (radial <= 1e-12 * scale) return null;

  // A cone's outward mantle normal is h*u + r*axis; a cylinder's is u.
  const target = solid.kind === 'cone'
    ? solid.radius * ((perspective ? 1 : 0) - axial / solid.height)
    : perspective ? solid.radius : 0;
  const cosine = target / radial;
  if (!Number.isFinite(cosine) || Math.abs(cosine) >= 1 - 1e-12) return null;
  const centerAngle = Math.atan2(second, first);
  const separation = Math.acos(cosine);
  return [centerAngle - separation, centerAngle + separation];
}

function roundPoint(center: Vector3, first: Vector3, second: Vector3, radius: number, angle: number): Vector3 {
  return addVector3(
    addVector3(center, scaleVector3(first, radius * Math.cos(angle)) || []) || [],
    scaleVector3(second, radius * Math.sin(angle)) || []
  )!;
}

export function cylinderPointAt3D(cylinder: Cylinder3, binding: SolidSurfaceBinding3D): Vector3 | null {
  const angle = Number(binding.angle || 0);
  const radial = Math.max(0, Math.min(1, Number(binding.radial == null ? 1 : binding.radial)));
  if (!Number.isFinite(angle) || !Number.isFinite(radial)) return null;
  if (binding.surface === 'base') return roundPoint(cylinder.baseCenter, cylinder.direction1, cylinder.direction2, cylinder.radius * radial, angle);
  if (binding.surface === 'top') return roundPoint(cylinder.topCenter, cylinder.direction1, cylinder.direction2, cylinder.radius * radial, angle);
  const height = Math.max(0, Math.min(1, Number(binding.height == null ? 0.5 : binding.height)));
  const center = addVector3(cylinder.baseCenter, scaleVector3(cylinder.axis, height * cylinder.height) || []);
  return center ? roundPoint(center, cylinder.direction1, cylinder.direction2, cylinder.radius, angle) : null;
}

export function conePointAt3D(cone: Cone3, binding: SolidSurfaceBinding3D): Vector3 | null {
  const angle = Number(binding.angle || 0);
  if (!Number.isFinite(angle)) return null;
  if (binding.surface === 'base') {
    const radial = Math.max(0, Math.min(1, Number(binding.radial == null ? 1 : binding.radial)));
    return roundPoint(cone.baseCenter, cone.direction1, cone.direction2, cone.radius * radial, angle);
  }
  const height = Math.max(0, Math.min(1, Number(binding.height == null ? 0.5 : binding.height)));
  const center = addVector3(cone.baseCenter, scaleVector3(cone.axis, height * cone.height) || []);
  return center ? roundPoint(center, cone.direction1, cone.direction2, cone.radius * (1 - height), angle) : null;
}

function addCandidate(
  result: Array<{ point: Vector3; parameter: number }>,
  anchor: Vector3, direction: Vector3, parameter: number,
  domain: LinearDomain3D, tolerance: number
): void {
  if (!Number.isFinite(parameter) || !parameterAllowed3D(parameter, domain, tolerance)) return;
  const point = addVector3(anchor, scaleVector3(direction, parameter) || []);
  if (!point || result.some(candidate => vector3Norm(subtractVector3(candidate.point, point) || []) <= tolerance)) return;
  result.push({ point, parameter });
}

function resultFromCandidates(candidates: Array<{ point: Vector3; parameter: number }>): PointSetSolidIntersection3D {
  candidates.sort((a, b) => a.parameter - b.parameter);
  return {
    kind: candidates.length === 0 ? 'none' : (candidates.length === 1 ? 'point' : 'points'),
    points: candidates.map(candidate => candidate.point),
    parameters: candidates.map(candidate => candidate.parameter)
  };
}

function localRoundCoordinates(point: Vector3, base: Vector3, first: Vector3, second: Vector3, axis: Vector3): Vector3 {
  const delta = subtractVector3(point, base)!;
  return [dotVector3(delta, first), dotVector3(delta, second), dotVector3(delta, axis)];
}


export function solidBindingAt3D(solid: Solid3, pointValue: readonly number[]): SolidSurfaceBinding3D | null {
  const point = finiteVector(pointValue);
  if (!point) return null;
  if (solid.kind !== 'cylinder' && solid.kind !== 'cone') {
    let best: { face: number; point: Vector3; distance: number } | null = null;
    solid.facePolygons.forEach((face, index) => {
      const candidate = nearestPointOnPolygon3D(point, face);
      const distance = candidate ? vector3Norm(subtractVector3(candidate, point) || []) : Infinity;
      if (candidate && (!best || distance < best.distance)) best = { face: index, point: candidate, distance };
    });
    if (!best) return null;
    const binding = polygonLocalCoordinates3D(solid.facePolygons[best.face], best.point);
    return binding ? { surface: 'face', face: best.face, u: binding.u, v: binding.v } : null;
  }
  const base = solid.baseCenter;
  const coordinates = localRoundCoordinates(point, base, solid.direction1, solid.direction2, solid.axis);
  const radial = Math.hypot(coordinates[0], coordinates[1]);
  const angle = Math.atan2(coordinates[1], coordinates[0]);
  if (solid.kind === 'cylinder') {
    const normalizedHeight = Math.max(0, Math.min(1, coordinates[2] / solid.height));
    const sideDistance = Math.hypot(radial - solid.radius,
      coordinates[2] < 0 ? coordinates[2] : (coordinates[2] > solid.height ? coordinates[2] - solid.height : 0));
    const baseDistance = Math.hypot(coordinates[2], Math.max(0, radial - solid.radius));
    const topDistance = Math.hypot(coordinates[2] - solid.height, Math.max(0, radial - solid.radius));
    if (baseDistance <= sideDistance && baseDistance <= topDistance) {
      return { surface: 'base', angle, radial: Math.max(0, Math.min(1, radial / solid.radius)) };
    }
    if (topDistance <= sideDistance) {
      return { surface: 'top', angle, radial: Math.max(0, Math.min(1, radial / solid.radius)) };
    }
    return { surface: 'side', angle, height: normalizedHeight };
  }
  const normalizedHeight = Math.max(0, Math.min(1, coordinates[2] / solid.height));
  const expectedRadius = solid.radius * (1 - normalizedHeight);
  const sideDistance = Math.abs(radial - expectedRadius) /
    Math.sqrt(1 + (solid.radius / solid.height) ** 2);
  const baseDistance = Math.hypot(coordinates[2], Math.max(0, radial - solid.radius));
  return baseDistance <= sideDistance
    ? { surface: 'base', angle, radial: Math.max(0, Math.min(1, radial / solid.radius)) }
    : { surface: 'side', angle, height: normalizedHeight };
}

export function solidPointAt3D(solid: Solid3, binding: SolidSurfaceBinding3D): Vector3 | null {
  if (solid.kind === 'cylinder') return cylinderPointAt3D(solid, binding);
  if (solid.kind === 'cone') return conePointAt3D(solid, binding);
  const faceIndex = Number(binding.face);
  if (binding.surface !== 'face' || !Number.isInteger(faceIndex) ||
      faceIndex < 0 || faceIndex >= solid.facePolygons.length) return null;
  return polygonPointAt3D(solid.facePolygons[faceIndex], {
    u: Number(binding.u),
    v: Number(binding.v)
  });
}

export function nearestPointOnSolid3D(point: readonly number[], solid: Solid3): Vector3 | null {
  const binding = solidBindingAt3D(solid, point);
  return binding ? solidPointAt3D(solid, binding) : null;
}

export function intersectLineCylinder3D(
  anchorValue: readonly number[], directionValue: readonly number[], cylinder: Cylinder3,
  domain: LinearDomain3D = 'line'
): PointSetSolidIntersection3D {
  const anchor = finiteVector(anchorValue);
  const direction = finiteVector(directionValue);
  if (!anchor || !direction || vector3Norm(direction) <= planeTolerance(direction)) return { kind: 'invalid', points: [] };
  const a = localRoundCoordinates(anchor, cylinder.baseCenter, cylinder.direction1, cylinder.direction2, cylinder.axis);
  const d: Vector3 = [
    dotVector3(direction, cylinder.direction1),
    dotVector3(direction, cylinder.direction2),
    dotVector3(direction, cylinder.axis)
  ];
  const tolerance = 1e-9 * Math.max(1, cylinder.radius, cylinder.height, vector3Norm(anchor));
  const candidates: Array<{ point: Vector3; parameter: number }> = [];
  const qa = d[0] ** 2 + d[1] ** 2;
  const qb = 2 * (a[0] * d[0] + a[1] * d[1]);
  const qc = a[0] ** 2 + a[1] ** 2 - cylinder.radius ** 2;
  if (qa > tolerance ** 2) {
    const discriminant = qb ** 2 - 4 * qa * qc;
    if (discriminant >= -tolerance) {
      const root = Math.sqrt(Math.max(0, discriminant));
      const values = root <= tolerance ? [-qb / (2 * qa)] : [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)];
      values.forEach(parameter => {
        const z = a[2] + parameter * d[2];
        if (z >= -tolerance && z <= cylinder.height + tolerance) addCandidate(candidates, anchor, direction, parameter, domain, tolerance);
      });
    }
  }
  if (Math.abs(d[2]) > tolerance) {
    [0, cylinder.height].forEach(z => {
      const parameter = (z - a[2]) / d[2];
      const x = a[0] + parameter * d[0];
      const y = a[1] + parameter * d[1];
      if (x * x + y * y <= cylinder.radius ** 2 + tolerance) addCandidate(candidates, anchor, direction, parameter, domain, tolerance);
    });
  }
  return resultFromCandidates(candidates);
}

export function intersectLineCone3D(
  anchorValue: readonly number[], directionValue: readonly number[], cone: Cone3,
  domain: LinearDomain3D = 'line'
): PointSetSolidIntersection3D {
  const anchor = finiteVector(anchorValue);
  const direction = finiteVector(directionValue);
  if (!anchor || !direction || vector3Norm(direction) <= planeTolerance(direction)) return { kind: 'invalid', points: [] };
  const a = localRoundCoordinates(anchor, cone.baseCenter, cone.direction1, cone.direction2, cone.axis);
  const d: Vector3 = [dotVector3(direction, cone.direction1), dotVector3(direction, cone.direction2), dotVector3(direction, cone.axis)];
  const slope = cone.radius / cone.height;
  const q0 = cone.height - a[2];
  const qa = d[0] ** 2 + d[1] ** 2 - slope ** 2 * d[2] ** 2;
  const qb = 2 * (a[0] * d[0] + a[1] * d[1] + slope ** 2 * q0 * d[2]);
  const qc = a[0] ** 2 + a[1] ** 2 - slope ** 2 * q0 ** 2;
  const tolerance = 1e-9 * Math.max(1, cone.radius, cone.height, vector3Norm(anchor));
  const candidates: Array<{ point: Vector3; parameter: number }> = [];
  if (Math.abs(qa) <= tolerance) {
    if (Math.abs(qb) > tolerance) {
      const parameter = -qc / qb;
      const z = a[2] + parameter * d[2];
      if (z >= -tolerance && z <= cone.height + tolerance) addCandidate(candidates, anchor, direction, parameter, domain, tolerance);
    }
  } else {
    const discriminant = qb ** 2 - 4 * qa * qc;
    if (discriminant >= -tolerance) {
      const root = Math.sqrt(Math.max(0, discriminant));
      const values = root <= tolerance ? [-qb / (2 * qa)] : [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)];
      values.forEach(parameter => {
        const z = a[2] + parameter * d[2];
        if (z >= -tolerance && z <= cone.height + tolerance) addCandidate(candidates, anchor, direction, parameter, domain, tolerance);
      });
    }
  }
  if (Math.abs(d[2]) > tolerance) {
    const parameter = -a[2] / d[2];
    const x = a[0] + parameter * d[0];
    const y = a[1] + parameter * d[1];
    if (x * x + y * y <= cone.radius ** 2 + tolerance) addCandidate(candidates, anchor, direction, parameter, domain, tolerance);
  }
  return resultFromCandidates(candidates);
}

export function intersectLinePolyhedron3D(
  anchor: readonly number[], direction: readonly number[], polyhedron: Polyhedron3,
  domain: LinearDomain3D = 'line'
): PointSetSolidIntersection3D {
  const candidates: Array<{ point: Vector3; parameter: number }> = [];
  const tolerance = 1e-9 * Math.max(1, ...polyhedron.vertices.map(vector3Norm));
  let contained = false;
  polyhedron.facePolygons.forEach(face => {
    const result = intersectLinePolygon3D(anchor, direction, face, domain);
    if (result.kind === 'contained') contained = true;
    if (result.kind === 'point' && result.point && Number.isFinite(result.parameter)) {
      addCandidate(candidates, finiteVector(anchor)!, finiteVector(direction)!, Number(result.parameter), domain, tolerance);
    }
  });
  return candidates.length ? resultFromCandidates(candidates) : { kind: contained ? 'contained' : 'none', points: [] };
}

export function intersectPlanePolyhedron3D(plane: Plane3, polyhedron: Polyhedron3): Polygon3 | null {
  const tolerance = 1e-9 * Math.max(1, ...polyhedron.vertices.map(vector3Norm));
  const points: Vector3[] = [];
  const add = (point: Vector3) => {
    if (!points.some(existing => vector3Norm(subtractVector3(existing, point) || []) <= tolerance)) points.push(point);
  };
  polyhedron.edges.forEach(([firstIndex, secondIndex]) => {
    const first = polyhedron.vertices[firstIndex];
    const second = polyhedron.vertices[secondIndex];
    const firstDistance = signedDistancePointPlane(first, plane);
    const secondDistance = signedDistancePointPlane(second, plane);
    if (Math.abs(firstDistance) <= tolerance) add(first);
    if (Math.abs(secondDistance) <= tolerance) add(second);
    if (firstDistance * secondDistance < -(tolerance ** 2)) {
      const parameter = firstDistance / (firstDistance - secondDistance);
      const point = addVector3(first, scaleVector3(subtractVector3(second, first) || [], parameter) || []);
      if (point) add(point);
    }
  });
  if (points.length < 3) return null;
  const center = mean(points);
  const ordered = points.slice().sort((first, second) => {
    const a = subtractVector3(first, center)!;
    const b = subtractVector3(second, center)!;
    return Math.atan2(dotVector3(a, plane.direction2), dotVector3(a, plane.direction1)) -
      Math.atan2(dotVector3(b, plane.direction2), dotVector3(b, plane.direction1));
  });
  return polygonFromPoints3D(ordered);
}
