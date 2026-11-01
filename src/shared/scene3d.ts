export type SceneMode = '2d' | '3d';
export type SceneViewMode = '2d' | '3d';
export type Dimension = 2 | 3;
export type Projection3D = 'parallel' | 'central';
export type SpatialRanges3D = [[number, number], [number, number], [number, number]];

/** Copy a finite, nonempty 3D viewport without altering the construction bounds. */
export function normalizeSpatialRanges3D(value: unknown): SpatialRanges3D | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every(axis => Array.isArray(axis) && axis.length === 2
    && axis.every(bound => typeof bound === 'number' && Number.isFinite(bound))
    && axis[1] > axis[0])) return null;
  return value.map(axis => [axis[0], axis[1]]) as SpatialRanges3D;
}

export interface Camera3D {
  azimuth: number;
  elevation: number;
  bank: number;
}

export interface ConstructionObject {
  id: string;
  kind: string;
  dimension: Dimension;
  name?: string;
  visible?: boolean;
  fixed?: boolean;
  style?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface PointRecord extends ConstructionObject {
  kind: 'point';
  coordinates: [number, number] | [number, number, number];
}

export type Linear3DKind = 'segment3d' | 'line3d' | 'ray3d' | 'vector3d';

export interface Linear3DRecordBase extends ConstructionObject {
  kind: Linear3DKind;
  dimension: 3;
  pointIds: [string, string];
}

export interface Segment3DRecord extends Linear3DRecordBase {
  kind: 'segment3d';
}

export interface Line3DRecord extends Linear3DRecordBase {
  kind: 'line3d';
}

export interface Ray3DRecord extends Linear3DRecordBase {
  kind: 'ray3d';
}

export interface Vector3DRecord extends Linear3DRecordBase {
  kind: 'vector3d';
  definition: 'points' | 'components';
  anchorPointId?: string;
  components?: [number, number, number];
}

export type Linear3DRecord = Segment3DRecord | Line3DRecord | Ray3DRecord | Vector3DRecord;
export type Plane3DDefinition = 'three-points' | 'point-vectors' | 'point-normal';

export interface Plane3DRecord extends ConstructionObject {
  kind: 'plane3d';
  dimension: 3;
  definition: Plane3DDefinition;
  pointIds: string[];
  vectorIds: string[];
  equationForm?: 'parameter' | 'normal' | 'coordinate';
}

export type Circle3DDefinition =
  | 'three-points'
  | 'center-normal-radius'
  | 'center-normal-point'
  | 'intersection';

export interface Circle3DRecord extends ConstructionObject {
  kind: 'circle3d';
  dimension: 3;
  definition: Circle3DDefinition;
  pointIds: string[];
  vectorIds: string[];
  sourceIds?: [string, string];
  radius?: number;
  radiusSourceId?: string;
}

export type Sphere3DDefinition = 'center-point' | 'center-radius' | 'four-points';

export interface Sphere3DRecord extends ConstructionObject {
  kind: 'sphere3d';
  dimension: 3;
  definition: Sphere3DDefinition;
  pointIds: string[];
  radius?: number;
  radiusSourceId?: string;
}


export interface Polygon3DRecord extends ConstructionObject {
  kind: 'polygon3d';
  dimension: 3;
  pointIds: string[];
}

export type Solid3DDefinition =
  | 'tetrahedron'
  | 'pyramid'
  | 'prism'
  | 'parallelepiped'
  | 'cuboid'
  | 'cylinder'
  | 'cone';

export interface Solid3DRecord extends ConstructionObject {
  kind: 'solid3d';
  dimension: 3;
  definition: Solid3DDefinition;
  pointIds: string[];
  vectorIds: string[];
  polygonId?: string;
  radius?: number;
  radiusSourceId?: string;
}

export type Transformation3DDefinition =
  | 'translate'
  | 'reflect-point'
  | 'reflect-line'
  | 'reflect-plane'
  | 'rotate-axis'
  | 'dilate';

export interface Transformation3DRecord extends ConstructionObject {
  kind: 'transformation3d';
  dimension: 3;
  definition: Transformation3DDefinition;
  sourceIds: string[];
  referenceIds: string[];
  value?: number;
  valueSourceId?: string;
}

export interface SpatialIntersection3DRecord extends ConstructionObject {
  kind: 'intersection-point3d' | 'intersection-points3d' | 'intersection-line3d' | 'intersection-circle3d';
  dimension: 3;
  sourceIds: [string, string];
  branchIds?: string[];
}

export type DerivedVector3DOperation =
  | 'add' | 'subtract' | 'scale' | 'negate' | 'unit' | 'connect'
  | 'project-vector' | 'project-plane' | 'cross' | 'normal';

export interface DerivedVector3DRecord extends ConstructionObject {
  kind: 'derived-vector3d';
  dimension: 3;
  operation: DerivedVector3DOperation;
  sourceIds: string[];
  scalar?: number;
  scalarSourceId?: string;
  anchorPointId?: string;
}

export interface AnalyticScalar3DRecord extends ConstructionObject {
  kind: 'analytic-scalar3d';
  dimension: 3;
  operation: string;
  sourceIds: string[];
  unit?: 'scalar' | 'length' | 'angle' | 'area' | 'volume';
  showValue?: boolean;
}

export interface Curve3DRecord extends ConstructionObject {
  kind: 'curve3d' | 'locus-curve3d';
  dimension: 3;
  parameter: string;
  expressions: [string, string, string];
  parameterRange: [number, number];
  quality: number;
  sourceIds?: string[];
  driverIds?: string[];
  tracePointId?: string;
}

export interface ConicSection3DRecord extends ConstructionObject {
  kind: 'conic-section3d';
  dimension: 3;
  definition: 'plane-cylinder' | 'plane-cone';
  sourceIds: [string, string];
  classification?: 'empty' | 'point' | 'line' | 'two-lines' | 'circle' | 'ellipse' | 'parabola' | 'hyperbola';
  localFrame?: { origin: [number, number, number]; direction1: [number, number, number]; direction2: [number, number, number] };
}

export interface Surface3DRecord extends ConstructionObject {
  kind: 'surface3d' | 'locus-surface3d';
  dimension: 3;
  definition: 'parametric' | 'function' | 'locus';
  parameters: [string, string];
  expressions: [string, string, string];
  uRange: [number, number];
  vRange: [number, number];
  quality: [number, number];
  sourceIds?: string[];
  driverIds?: [string, string];
  tracePointId?: string;
}

export interface CurveSurfaceAnalysis3DRecord extends ConstructionObject {
  kind: 'curve-analysis3d' | 'surface-analysis3d';
  dimension: 3;
  operation: 'tangent' | 'velocity' | 'normal-plane' | 'arc-length' | 'tangent-plane' | 'normal-vector' | 'tangent-u' | 'tangent-v';
  sourceIds: string[];
  parameters: Record<string, number>;
}

export interface AnalyticConstruction3DRecord extends ConstructionObject {
  kind: 'analytic-construction3d';
  dimension: 3;
  operation: 'project-point-line' | 'project-point-plane' | 'perpendicular-line-plane' | 'common-perpendicular';
  resultKind: 'point3d' | 'line3d' | 'segment3d';
  sourceIds: string[];
}
export interface SceneState {
  version: 1;
  mode: SceneMode;
  viewMode: SceneViewMode;
  projection: Projection3D;
  camera: Camera3D;
  bounds: { x: [number, number]; y: [number, number]; z: [number, number] };
  viewport3d?: SpatialRanges3D;
  objects: ConstructionObject[];
}

export const DEFAULT_CAMERA_3D: Camera3D = Object.freeze({ azimuth: 0.9, elevation: 0.45, bank: 0 });

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function range(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return fallback.slice() as [number, number];
  const lower = finite(value[0], fallback[0]);
  const upper = finite(value[1], fallback[1]);
  return upper > lower ? [lower, upper] : fallback.slice() as [number, number];
}

export function normalizeSceneMode(value: unknown, fallback: SceneMode = '2d'): SceneMode {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === '3' || normalized === '3d') return '3d';
  if (normalized === '2' || normalized === '2d') return '2d';
  return fallback;
}

export function normalizeProjection3D(value: unknown, fallback: Projection3D = 'parallel'): Projection3D {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === 'central' || normalized === 'perspective' || normalized === 'perspektivisch') return 'central';
  if (normalized === 'parallel' || normalized === 'orthographic' || normalized === 'orthogonal') return 'parallel';
  return fallback;
}

export function normalizeCamera3D(value: unknown, fallback = DEFAULT_CAMERA_3D): Camera3D {
  const source = value && typeof value === 'object' ? value as Partial<Camera3D> : {};
  return {
    azimuth: finite(source.azimuth, fallback.azimuth),
    elevation: finite(source.elevation, fallback.elevation),
    bank: finite(source.bank, fallback.bank)
  };
}

export function createSceneState(overrides: Partial<SceneState> = {}): SceneState {
  const mode = normalizeSceneMode(overrides.mode, '2d');
  const rawBounds = overrides.bounds || ({} as SceneState['bounds']);
  const viewport3d = normalizeSpatialRanges3D(overrides.viewport3d);
  return {
    version: 1,
    mode,
    viewMode: normalizeSceneMode(overrides.viewMode, mode),
    projection: normalizeProjection3D(overrides.projection),
    camera: normalizeCamera3D(overrides.camera),
    ...(viewport3d ? { viewport3d } : {}),
    bounds: {
      x: range(rawBounds.x, [-4, 4]),
      y: range(rawBounds.y, [-3, 3]),
      z: range(rawBounds.z, [-4, 4])
    },
    objects: Array.isArray(overrides.objects) ? overrides.objects.slice() : []
  };
}

export function createLinear3DRecord(
  kind: Linear3DKind,
  id: string,
  pointIds: [string, string],
  overrides: Partial<Linear3DRecord> = {}
): Linear3DRecord {
  const normalizedPointIds: [string, string] = [String(pointIds[0] || ''), String(pointIds[1] || '')];
  const base = {
    ...overrides,
    id: String(id || ''),
    kind,
    dimension: 3 as const,
    pointIds: normalizedPointIds
  };
  if (kind !== 'vector3d') return base as Linear3DRecord;
  const components = Array.isArray((overrides as Partial<Vector3DRecord>).components)
    ? (overrides as Partial<Vector3DRecord>).components!.map(value => finite(value, 0)) as [number, number, number]
    : undefined;
  return {
    ...base,
    kind: 'vector3d',
    definition: (overrides as Partial<Vector3DRecord>).definition === 'components' ? 'components' : 'points',
    ...((overrides as Partial<Vector3DRecord>).anchorPointId
      ? { anchorPointId: String((overrides as Partial<Vector3DRecord>).anchorPointId) }
      : {}),
    ...(components ? { components } : {})
  } as Vector3DRecord;
}

export function createPlane3DRecord(
  id: string,
  definition: Plane3DDefinition,
  pointIds: readonly string[],
  vectorIds: readonly string[] = [],
  overrides: Partial<Plane3DRecord> = {}
): Plane3DRecord {
  const requiredPoints = definition === 'three-points' ? 3 : 1;
  const requiredVectors = definition === 'point-vectors' ? 2 : (definition === 'point-normal' ? 1 : 0);
  const normalizedPoints = pointIds.slice(0, requiredPoints).map(value => String(value || ''));
  const normalizedVectors = vectorIds.slice(0, requiredVectors).map(value => String(value || ''));
  if (normalizedPoints.length !== requiredPoints || normalizedPoints.some(value => !value) ||
      normalizedVectors.length !== requiredVectors || normalizedVectors.some(value => !value)) {
    throw new TypeError('Plane3D records require complete stable source ids.');
  }
  const equationForm = overrides.equationForm === 'normal' || overrides.equationForm === 'coordinate'
    ? overrides.equationForm
    : 'parameter';
  return {
    ...overrides,
    id: String(id || ''),
    kind: 'plane3d',
    dimension: 3,
    definition,
    pointIds: normalizedPoints,
    vectorIds: normalizedVectors,
    equationForm
  };
}

export function createCircle3DRecord(
  id: string,
  definition: Circle3DDefinition,
  pointIds: readonly string[] = [],
  vectorIds: readonly string[] = [],
  overrides: Partial<Circle3DRecord> = {}
): Circle3DRecord {
  const points = pointIds.map(value => String(value || ''));
  const vectors = vectorIds.map(value => String(value || ''));
  const expectedPoints = definition === 'three-points' ? 3
    : (definition === 'center-normal-point' ? 2 : (definition === 'center-normal-radius' ? 1 : 0));
  const expectedVectors = definition === 'center-normal-radius' || definition === 'center-normal-point' ? 1 : 0;
  if (points.length < expectedPoints || points.slice(0, expectedPoints).some(value => !value) ||
      vectors.length < expectedVectors || vectors.slice(0, expectedVectors).some(value => !value)) {
    throw new TypeError('Circle3D records require complete stable source ids.');
  }
  const radius = Number(overrides.radius);
  if (definition === 'center-normal-radius' && (!Number.isFinite(radius) || radius <= 0) && !overrides.radiusSourceId) {
    throw new TypeError('A radius-defined Circle3D requires a positive radius or radius source.');
  }
  if (definition === 'intersection' && (!overrides.sourceIds || overrides.sourceIds.some(value => !String(value)))) {
    throw new TypeError('An intersection Circle3D requires two source ids.');
  }
  return {
    ...overrides,
    id: String(id || ''),
    kind: 'circle3d',
    dimension: 3,
    definition,
    pointIds: points.slice(0, expectedPoints),
    vectorIds: vectors.slice(0, expectedVectors),
    ...(Number.isFinite(radius) ? { radius } : {})
  };
}

export function createSphere3DRecord(
  id: string,
  definition: Sphere3DDefinition,
  pointIds: readonly string[],
  overrides: Partial<Sphere3DRecord> = {}
): Sphere3DRecord {
  const expectedPoints = definition === 'four-points' ? 4 : 1 + (definition === 'center-point' ? 1 : 0);
  const points = pointIds.slice(0, expectedPoints).map(value => String(value || ''));
  const radius = Number(overrides.radius);
  if (points.length !== expectedPoints || points.some(value => !value)) {
    throw new TypeError('Sphere3D records require complete stable point ids.');
  }
  if (definition === 'center-radius' && (!Number.isFinite(radius) || radius <= 0) && !overrides.radiusSourceId) {
    throw new TypeError('A radius-defined Sphere3D requires a positive radius or radius source.');
  }
  return {
    ...overrides,
    id: String(id || ''),
    kind: 'sphere3d',
    dimension: 3,
    definition,
    pointIds: points,
    ...(Number.isFinite(radius) ? { radius } : {})
  };
}


export function createPolygon3DRecord(
  id: string,
  pointIds: readonly string[],
  overrides: Partial<Polygon3DRecord> = {}
): Polygon3DRecord {
  const points = pointIds.map(value => String(value || ''));
  if (points.length < 3 || points.some(value => !value)) {
    throw new TypeError('Polygon3D records require at least three stable point ids.');
  }
  return { ...overrides, id: String(id || ''), kind: 'polygon3d', dimension: 3, pointIds: points };
}

export function createSolid3DRecord(
  id: string,
  definition: Solid3DDefinition,
  pointIds: readonly string[] = [],
  vectorIds: readonly string[] = [],
  overrides: Partial<Solid3DRecord> = {}
): Solid3DRecord {
  const points = pointIds.map(value => String(value || ''));
  const vectors = vectorIds.map(value => String(value || ''));
  const requirements: Record<Solid3DDefinition, [number, number]> = {
    tetrahedron: [4, 0],
    pyramid: [1, 0],
    prism: [0, 1],
    parallelepiped: [1, 3],
    cuboid: [1, 3],
    cylinder: [2, 0],
    cone: [2, 0]
  };
  const [requiredPoints, requiredVectors] = requirements[definition];
  if (points.length < requiredPoints || points.slice(0, requiredPoints).some(value => !value) ||
      vectors.length < requiredVectors || vectors.slice(0, requiredVectors).some(value => !value)) {
    throw new TypeError('Solid3D records require complete stable source ids.');
  }
  if ((definition === 'pyramid' || definition === 'prism') && !String(overrides.polygonId || '')) {
    throw new TypeError('Pyramid and prism records require a Polygon3D source id.');
  }
  const radius = Number(overrides.radius);
  if ((definition === 'cylinder' || definition === 'cone') &&
      (!Number.isFinite(radius) || radius <= 0) && !overrides.radiusSourceId && points.length < 3) {
    throw new TypeError('Round Solid3D records require a positive radius or radius source.');
  }
  return {
    ...overrides,
    id: String(id || ''),
    kind: 'solid3d',
    dimension: 3,
    definition,
    pointIds: points,
    vectorIds: vectors,
    ...(Number.isFinite(radius) ? { radius } : {})
  };
}

export function createTransformation3DRecord(
  id: string,
  definition: Transformation3DDefinition,
  sourceIds: readonly string[],
  referenceIds: readonly string[],
  overrides: Partial<Transformation3DRecord> = {}
): Transformation3DRecord {
  const sources = sourceIds.map(value => String(value || ''));
  const references = referenceIds.map(value => String(value || ''));
  if (!sources.length || sources.some(value => !value) || !references.length || references.some(value => !value)) {
    throw new TypeError('Transformation3D records require stable source and reference ids.');
  }
  const value = Number(overrides.value);
  if ((definition === 'rotate-axis' || definition === 'dilate') &&
      !Number.isFinite(value) && !overrides.valueSourceId) {
    throw new TypeError('Parameterized Transformation3D records require a finite value or value source.');
  }
  return {
    ...overrides,
    id: String(id || ''),
    kind: 'transformation3d',
    dimension: 3,
    definition,
    sourceIds: sources,
    referenceIds: references,
    ...(Number.isFinite(value) ? { value } : {})
  };
}

export function createSpatialIntersection3DRecord(
  kind: 'intersection-point3d' | 'intersection-points3d' | 'intersection-line3d' | 'intersection-circle3d',
  id: string,
  sourceIds: [string, string],
  overrides: Partial<SpatialIntersection3DRecord> = {}
): SpatialIntersection3DRecord {
  const normalized: [string, string] = [String(sourceIds[0] || ''), String(sourceIds[1] || '')];
  if (normalized.some(value => !value)) throw new TypeError('Spatial intersections require two source ids.');
  return { ...overrides, id: String(id || ''), kind, dimension: 3, sourceIds: normalized };
}
export function createDerivedVector3DRecord(
  id: string,
  operation: DerivedVector3DOperation,
  sourceIds: readonly string[],
  overrides: Partial<DerivedVector3DRecord> = {}
): DerivedVector3DRecord {
  const sources = sourceIds.map(value => String(value || ''));
  if (!sources.length || sources.some(value => !value)) throw new TypeError('Derived vectors require stable source ids.');
  const scalar = Number(overrides.scalar);
  return {
    ...overrides, id: String(id || ''), kind: 'derived-vector3d', dimension: 3,
    operation, sourceIds: sources, ...(Number.isFinite(scalar) ? { scalar } : {})
  };
}

export function createAnalyticScalar3DRecord(
  id: string, operation: string, sourceIds: readonly string[], overrides: Partial<AnalyticScalar3DRecord> = {}
): AnalyticScalar3DRecord {
  const sources = sourceIds.map(value => String(value || ''));
  if (!operation || !sources.length || sources.some(value => !value)) throw new TypeError('Analytic values require an operation and stable source ids.');
  return { ...overrides, id: String(id || ''), kind: 'analytic-scalar3d', dimension: 3, operation, sourceIds: sources };
}

export function createCurve3DRecord(
  id: string, expressions: readonly string[], parameterRange: readonly number[], overrides: Partial<Curve3DRecord> = {}
): Curve3DRecord {
  if (expressions.length < 3 || expressions.slice(0, 3).some(value => !String(value).trim())) throw new TypeError('Curve3D requires three component expressions.');
  const normalizedRange = range(parameterRange, [0, 1]);
  const quality = Math.max(8, Math.min(512, Math.round(finite(overrides.quality, 96))));
  return {
    ...overrides, id: String(id || ''), kind: overrides.kind === 'locus-curve3d' ? 'locus-curve3d' : 'curve3d', dimension: 3,
    parameter: String(overrides.parameter || 't'), expressions: expressions.slice(0, 3).map(String) as [string, string, string],
    parameterRange: normalizedRange, quality
  };
}

export function createConicSection3DRecord(
  id: string, definition: 'plane-cylinder' | 'plane-cone', sourceIds: [string, string], overrides: Partial<ConicSection3DRecord> = {}
): ConicSection3DRecord {
  const sources: [string, string] = [String(sourceIds[0] || ''), String(sourceIds[1] || '')];
  if (sources.some(value => !value)) throw new TypeError('Conic sections require plane and solid source ids.');
  return { ...overrides, id: String(id || ''), kind: 'conic-section3d', dimension: 3, definition, sourceIds: sources };
}

export function createSurface3DRecord(
  id: string, expressions: readonly string[], uRangeValue: readonly number[], vRangeValue: readonly number[],
  overrides: Partial<Surface3DRecord> = {}
): Surface3DRecord {
  if (expressions.length < 3 || expressions.slice(0, 3).some(value => !String(value).trim())) throw new TypeError('Surface3D requires three component expressions.');
  const rawQuality = overrides.quality || [24, 24];
  const quality: [number, number] = [
    Math.max(4, Math.min(128, Math.round(finite(rawQuality[0], 24)))),
    Math.max(4, Math.min(128, Math.round(finite(rawQuality[1], 24))))
  ];
  return {
    ...overrides, id: String(id || ''), kind: overrides.kind === 'locus-surface3d' ? 'locus-surface3d' : 'surface3d', dimension: 3,
    definition: overrides.definition || 'parametric', parameters: overrides.parameters || ['u', 'v'],
    expressions: expressions.slice(0, 3).map(String) as [string, string, string],
    uRange: range(uRangeValue, [-1, 1]), vRange: range(vRangeValue, [-1, 1]), quality
  };
}

export function createAnalyticConstruction3DRecord(
  id: string, operation: AnalyticConstruction3DRecord['operation'],
  resultKind: AnalyticConstruction3DRecord['resultKind'], sourceIds: readonly string[],
  overrides: Partial<AnalyticConstruction3DRecord> = {}
): AnalyticConstruction3DRecord {
  const sources = sourceIds.map(value => String(value || ''));
  if (!sources.length || sources.some(value => !value)) {
    throw new TypeError('Analytic constructions require stable source ids.');
  }
  return { ...overrides, id: String(id || ''), kind: 'analytic-construction3d', dimension: 3, operation, resultKind, sourceIds: sources };
}
export function createCurveSurfaceAnalysis3DRecord(
  kind: 'curve-analysis3d' | 'surface-analysis3d', id: string,
  operation: CurveSurfaceAnalysis3DRecord['operation'], sourceIds: readonly string[],
  parameters: Record<string, number> = {}, overrides: Partial<CurveSurfaceAnalysis3DRecord> = {}
): CurveSurfaceAnalysis3DRecord {
  const sources = sourceIds.map(value => String(value || ''));
  const values: Record<string, number> = {};
  Object.keys(parameters).forEach(key => { const value = Number(parameters[key]); if (Number.isFinite(value)) values[key] = value; });
  if (!sources.length || sources.some(value => !value)) throw new TypeError('Curve and surface analysis requires stable source ids.');
  return { ...overrides, id: String(id || ''), kind, dimension: 3, operation, sourceIds: sources, parameters: values };
}

export function serializeSceneState(scene: SceneState): string {
  return JSON.stringify(createSceneState(scene));
}

export function deserializeSceneState(value: string | object): SceneState {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') throw new TypeError('Invalid scene state');
  return createSceneState(parsed as Partial<SceneState>);
}
