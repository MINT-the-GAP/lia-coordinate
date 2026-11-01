import { installCoordinateSphereAppearance3D } from './sphereAppearance3d';
import {
  addVector3, subtractVector3, type Vector3
} from '../shared/vector3d';
import type { Plane3 } from '../shared/plane3d';
import type { Sphere3 } from '../shared/sphere3d';
import { transformCurve3D } from '../shared/curve3d';
import { transformSurface3D } from '../shared/surface3d';
import {
  createTransformation3DRecord,
  type Transformation3DDefinition
} from '../shared/scene3d';
import {
  transformCircle3D, transformPlane3D, transformPoint3D, transformPolygon3D,
  transformSolid3D, transformSphere3D, type SimilarityTransform3D
} from '../shared/transform3d';
import {
  coordinateCircle3DData,
  coordinateCurve3DData,
  coordinateSurface3DData,
  coordinateLinear3DData,
  coordinatePlane3DData,
  coordinatePolygon3DData,
  coordinateSolid3DData,
  coordinateSphere3DData,
  createCoordinateDependentCircle3D,
  createCoordinateDependentPoint3D,
  createCoordinateDependentPolygon3D,
  createCoordinateDependentSolid3D,
  createCoordinateCurve3D,
  createCoordinateSurface3D,
  createCoordinateLinear3D,
  ensureCoordinateView3D,
  installCoordinatePlane3DProjection,
  point3DCoordinates,
  type CoordinateDependentLine3DValue,
  type CoordinateLinear3DKind
} from './view3d';

export function createCoordinateDependentLinearObject3D(
  board: any,
  kind: CoordinateLinear3DKind,
  evaluator: () => CoordinateDependentLine3DValue | null,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('A transformed linear object requires valid initial data.');
  const read = (): CoordinateDependentLine3DValue => {
    const next = evaluator();
    if (next && next.point.every(Number.isFinite) && next.direction.every(Number.isFinite)) current = next;
    return current!;
  };
  const first = entry.view.create('point3d', [() => read().point], {
    name: '', withLabel: false, visible: false, fixed: true
  });
  const second = entry.view.create('point3d', [() => addVector3(read().point, read().direction)!], {
    name: '', withLabel: false, visible: false, fixed: true
  });
  [first, second].forEach(point => {
    point.__liaPoint3D = true;
    point.__liaDimension = 3;
    point.__liaPoint3DHelper = true;
    if (point.element2D) point.element2D.__liaPoint3DProxy = point;
  });
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  let object: any = null;
  object = createCoordinateLinear3D(board, kind, first, second, {
    ...attributes,
    visible: () => sourceVisible() && object?.__liaLinear3DUserVisible !== false && !!evaluator()
  });
  object.__liaLinear3DUserVisible = authored !== false;
  object.__liaLinear3DDependent = true;
  object.__liaLinear3DEvaluator = evaluator;
  const cleanup = object.__liaLinear3DCleanup;
  object.__liaLinear3DCleanup = () => {
    try { cleanup?.(); } catch (e) {}
    [first, second].forEach(point => { try { entry.board.removeObject(point); } catch (e) {} });
  };
  return object;
}

export function createCoordinateDependentPlane3D(
  board: any,
  evaluator: () => Plane3 | null,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('A dependent Plane3D requires valid initial data.');
  const read = (): Plane3 => {
    const next = evaluator();
    if (next) current = next;
    return current!;
  };
  const anchor = entry.view.create('point3d', [() => read().point], {
    name: '', withLabel: false, visible: false, fixed: true
  });
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  let object: any = null;
  object = entry.view.create('plane3d', [
    anchor,
    [() => read().direction1[0], () => read().direction1[1], () => read().direction1[2]],
    [() => read().direction2[0], () => read().direction2[1], () => read().direction2[2]]
  ], {
    fixed: true,
    fillOpacity: 0.22,
    ...attributes,
    visible: () => sourceVisible() && object?.__liaPlane3DUserVisible !== false && !!evaluator()
  });
  object.__liaPlane3D = true;
  object.__liaDimension = 3;
  object.__liaPlane3DDependent = true;
  object.__liaPlane3DEvaluator = evaluator;
  object.__liaPlane3DUserVisible = authored !== false;
  object.__liaPlane3DData = evaluator;
  installCoordinatePlane3DProjection(entry, object, evaluator);
  if (object.element2D) {
    object.element2D.__liaPlane3DProxy = object;
    object.hasPoint = (...args: any[]) => object.element2D?.hasPoint?.(...args) === true;
  }
  entry.planeObjects.add(object);
  object.__liaPlane3DCleanup = () => {
    entry.planeObjects.delete(object);
    try { entry.board.removeObject(anchor); } catch (e) {}
  };
  return object;
}

export function createCoordinateDependentSphere3D(
  board: any,
  evaluator: () => Sphere3 | null,
  attributes: Record<string, unknown> = {}
): any {
  const entry = ensureCoordinateView3D(board);
  let current = evaluator();
  if (!current) throw new TypeError('A dependent Sphere3D requires valid initial data.');
  const read = (): Sphere3 => {
    const next = evaluator();
    if (next) current = next;
    return current!;
  };
  const center = entry.view.create('point3d', [() => read().center], {
    name: '', withLabel: false, visible: false, fixed: true
  });
  const authored = attributes.visible;
  const sourceVisible = typeof authored === 'function' ? authored as () => boolean : () => true;
  let object: any = null;
  object = entry.view.create('sphere3d', [center, () => read().radius], {
    fixed: true,
    fillOpacity: 0.16,
    ...attributes,
    doAdvancedPlot: false,
    numberPointsHigh: 128,
    numberPointsLow: 64,
    visible: () => sourceVisible() && object?.__liaSphere3DUserVisible !== false && !!evaluator()
  });
  object.__liaSphere3D = true;
  object.__liaDimension = 3;
  object.__liaSphere3DDefinition = 'transformation';
  object.__liaSphere3DDependent = true;
  object.__liaSphere3DEvaluator = evaluator;
  object.__liaSphere3DUserVisible = authored !== false;
  object.__liaSphere3DCenterHelper = center;
  installCoordinateSphereAppearance3D(object);
  if (object.element2D) {
    object.element2D.__liaSphere3DProxy = object;
    object.hasPoint = (...args: any[]) => object.element2D?.hasPoint?.(...args) === true;
  }
  entry.sphereObjects.add(object);
  object.__liaSphere3DCleanup = () => {
    entry.sphereObjects.delete(object);
    try { entry.board.removeObject(center); } catch (e) {}
  };
  return object;
}

export function createCoordinateTransformedObject3D(
  board: any,
  source: any,
  transformEvaluator: () => SimilarityTransform3D | null,
  definition: Transformation3DDefinition,
  references: any[] = [],
  value?: number | (() => number),
  attributes: Record<string, unknown> = {}
): any {
  let object: any = null;
  if (source?.__liaPoint3D) {
    object = createCoordinateDependentPoint3D(board, () => {
      const transform = transformEvaluator();
      const point = point3DCoordinates(source);
      return transform && point ? transformPoint3D(transform, point) : null;
    }, attributes);
  } else if (source?.__liaLinear3D) {
    object = createCoordinateDependentLinearObject3D(board,
      String(source.__liaLinear3DKind || 'line') as CoordinateLinear3DKind,
      () => {
        const transform = transformEvaluator();
        const line = coordinateLinear3DData(source);
        if (!transform || !line) return null;
        const point = transformPoint3D(transform, line.anchor);
        const endpoint = transformPoint3D(transform, addVector3(line.anchor, line.direction) || []);
        const direction = point && endpoint ? subtractVector3(endpoint, point) : null;
        return point && direction ? { point, direction } : null;
      }, attributes);
  } else if (source?.__liaPlane3D) {
    object = createCoordinateDependentPlane3D(board, () => {
      const transform = transformEvaluator();
      const plane = coordinatePlane3DData(source);
      return transform && plane ? transformPlane3D(transform, plane) : null;
    }, attributes);
  } else if (source?.__liaCircle3D) {
    object = createCoordinateDependentCircle3D(board, () => {
      const transform = transformEvaluator();
      const circle = coordinateCircle3DData(source);
      return transform && circle ? transformCircle3D(transform, circle) : null;
    }, attributes);
  } else if (source?.__liaSphere3D) {
    object = createCoordinateDependentSphere3D(board, () => {
      const transform = transformEvaluator();
      const sphere = coordinateSphere3DData(source);
      return transform && sphere ? transformSphere3D(transform, sphere) : null;
    }, attributes);
  } else if (source?.__liaPolygon3D) {
    object = createCoordinateDependentPolygon3D(board, () => {
      const transform = transformEvaluator();
      const polygon = coordinatePolygon3DData(source);
      return transform && polygon ? transformPolygon3D(transform, polygon) : null;
    }, attributes);
  } else if (source?.__liaSolid3D) {
    object = createCoordinateDependentSolid3D(board, () => {
      const transform = transformEvaluator();
      const solid = coordinateSolid3DData(source);
      return transform && solid ? transformSolid3D(transform, solid) : null;
    }, attributes);
  } else if (source?.__liaCurve3D) {
    object = createCoordinateCurve3D(board, () => {
      const transform = transformEvaluator();
      const curve = coordinateCurve3DData(source);
      return transform && curve ? transformCurve3D(transform, curve) : null;
    }, attributes);
  } else if (source?.__liaSurface3D) {
    object = createCoordinateSurface3D(board, () => {
      const transform = transformEvaluator();
      const surface = coordinateSurface3DData(source);
      return transform && surface ? transformSurface3D(transform, surface) : null;
    }, attributes);
  }
  if (!object) throw new TypeError('This source object cannot be transformed in 3D.');
  object.__liaTransformation3D = true;
  object.__liaTransformation3DDefinition = definition;
  object.__liaTransformation3DSource = source;
  object.__liaTransformation3DReferences = references.slice();
  object.__liaTransformation3DValue = value;
  object.__liaTransformation3DEvaluator = transformEvaluator;
  object.__liaSceneRecord = createTransformation3DRecord(
    '', definition, ['source'], new Array(Math.max(1, references.length)).fill('reference'),
    typeof value === 'number' ? { value } : (typeof value === 'function' ? { valueSourceId: 'value' } : {})
  );
  return object;
}
