import { resolveUiLanguage } from '../shared/language';
import { getBoardObjects } from '../shared/boardObjects';
import { scheduleBootstrap } from '../shared/bootstrap';
import { polygonFromPoints3D } from '../shared/polygon3d';
import {
  emptyConstructionQuiz3DEvaluation,
  parseConstructionQuiz3DSpec,
  type CanonicalQuizObject3D,
  type ConstructionQuiz3DConfig,
  type ConstructionQuiz3DEvaluation,
  type QuizDependency3D,
  type QuizObjectKind3D,
} from '../shared/quiz3dTypes';
import { evaluateConstructionQuiz3D } from '../shared/quiz3dGeometry';
import { subtractVector3, type Vector3 } from '../shared/vector3d';
import {
  coordinateCircle3DData,
  coordinateCurve3DData,
  coordinateLinear3DData,
  coordinatePlane3DData,
  coordinatePolygon3DData,
  coordinateSolid3DData,
  coordinateSphere3DData,
  coordinateSurface3DData,
  getCoordinateView3D,
  point3DCoordinates,
  requestCoordinateSceneMode,
} from '../coord/view3d';

interface ConstructionQuiz3DEntry {
  uid: string;
  node: HTMLElement;
  spec: string;
  language: string;
  config: ConstructionQuiz3DConfig;
  board: any;
  attempts: number;
  evaluation: ConstructionQuiz3DEvaluation | null;
  liveTimer: ReturnType<typeof setTimeout> | null;
  liveListener: (() => void) | null;
}

const entries = new Map<string, ConstructionQuiz3DEntry>();
let observer: MutationObserver | null = null;
let objectSequence = 0;

function cleanName(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/^\\\(|\\\)$/g, '')
    .replace(/^\$|\$$/g, '')
    .trim();
}

function objectName(object: any): string {
  return cleanName(
    object?.__liaDgsPointName ||
    object?.__liaDgsSegmentName ||
    object?.__liaDgsLineName ||
    object?.__liaDgsRayName ||
    object?.__liaDgsVectorName ||
    object?.__liaDgsPlaneName ||
    object?.__liaDgsCircle3DName ||
    object?.__liaDgsSphere3DName ||
    object?.__liaDgsPolygon3DName ||
    object?.__liaDgsPolygonName ||
    object?.__liaDgsSolid3DName ||
    object?.__liaDgsTransformation3DName ||
    object?.__liaDgsCurve3DName ||
    object?.__liaDgsSurface3DName ||
    object?.__liaDgsConic3DName ||
    object?.__liaDgsAnalytic3DName ||
    object?.__liaSceneRecord?.name ||
    object?.name ||
    object?.label?.plaintext
  );
}

function objectIdentifier(object: any): string {
  const identifier = cleanName(
    object?.__liaDgsPersistentId ||
    object?.__liaSceneRecord?.id ||
    objectName(object) ||
    object?.id
  );
  if (identifier) return identifier;
  if (!object.__liaQuiz3DGeneratedKey) {
    objectSequence += 1;
    object.__liaQuiz3DGeneratedKey = 'quiz-object-' + objectSequence;
  }
  return object.__liaQuiz3DGeneratedKey;
}

function referenceIds(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(objectIdentifier).filter(Boolean)
    : [];
}

function dependencyFor(object: any): QuizDependency3D | undefined {
  const record = object?.__liaSceneRecord || {};
  const sourceIds = [
    ...(Array.isArray(record.pointIds) ? record.pointIds : []),
    ...(Array.isArray(record.vectorIds) ? record.vectorIds : []),
    ...(Array.isArray(record.sourceIds) ? record.sourceIds : []),
  ].map(String).filter(Boolean);
  const referenceIdsValue = [
    ...(Array.isArray(record.referenceIds) ? record.referenceIds : []),
  ].map(String).filter(Boolean);

  if (object?.__liaTransformation3D) {
    let transformationValue: unknown = object.__liaDgsTransformation3DValue ??
      object.__liaTransformation3DValue ?? record.transformValue ?? record.value;
    try {
      if (typeof transformationValue === 'function') transformationValue = transformationValue();
    } catch (error) { transformationValue = undefined; }
    const source = object.__liaDgsTransformation3DSource ||
      object.__liaTransformation3DSource;
    const references = object.__liaDgsTransformation3DReference
      ? [object.__liaDgsTransformation3DReference]
      : (object.__liaTransformation3DReferences || []);
    return {
      definition: String(
        object.__liaDgsTransformation3DDefinition ||
        object.__liaTransformation3DDefinition ||
        record.definition || ''
      ),
      transformation: String(
        object.__liaDgsTransformation3DDefinition ||
        object.__liaTransformation3DDefinition ||
        record.definition || ''
      ),
      sourceIds: source ? [objectIdentifier(source)] : sourceIds,
      referenceIds: references.length
        ? referenceIds(references)
        : referenceIdsValue,
      dependent: true,
      ...(Number.isFinite(Number(transformationValue))
        ? { parameters: { value: Number(transformationValue) } }
        : {}),
    };
  }

  if (object?.__liaPoint3DBindingSource) {
    const parameters = object.__liaPoint3DBindingParameters || {};
    return {
      definition: 'point-on-object',
      sourceIds: [objectIdentifier(object.__liaPoint3DBindingSource)],
      boundTo: objectIdentifier(object.__liaPoint3DBindingSource),
      bindingKind: String(parameters.kind || ''),
      parameters: { ...parameters },
      dependent: true,
    };
  }

  const driverIds = Array.isArray(record.driverIds)
    ? record.driverIds.map(String).filter(Boolean)
    : [];
  const dependency: QuizDependency3D = {
    ...(record.definition || object?.__liaPlane3DDefinition ||
        object?.__liaCircle3DDefinition || object?.__liaSphere3DDefinition ||
        object?.__liaSolid3DDefinition
      ? { definition: String(
          record.definition ||
          object.__liaPlane3DDefinition ||
          object.__liaCircle3DDefinition ||
          object.__liaSphere3DDefinition ||
          object.__liaSolid3DDefinition
        ) }
      : {}),
    ...(sourceIds.length ? { sourceIds } : {}),
    ...(referenceIdsValue.length ? { referenceIds: referenceIdsValue } : {}),
    ...(driverIds.length ? { driverIds } : {}),
    ...(record.tracePointId ? { tracePointId: String(record.tracePointId) } : {}),
    dependent: Boolean(
      object?.__liaPoint3DDependent ||
      object?.__liaLinear3DDependent ||
      object?.__liaPlane3DDependent ||
      object?.__liaCircle3DDependent ||
      object?.__liaSphere3DDependent ||
      object?.__liaPolygon3DDependent ||
      object?.__liaSolid3DDependent ||
      object?.__liaTransformation3D ||
      record.kind === 'locus-curve3d' ||
      record.kind === 'locus-surface3d' ||
      sourceIds.length ||
      driverIds.length
    ),
  };
  return Object.keys(dependency).length > 1 ||
    dependency.definition ||
    dependency.sourceIds ||
    dependency.driverIds
    ? dependency
    : undefined;
}

function resolvedObject(value: any): any {
  return value?.__liaPoint3DProxy ||
    value?.__liaLinear3DProxy ||
    value?.__liaPlane3DProxy ||
    value?.__liaCircle3DProxy ||
    value?.__liaSphere3DProxy ||
    value?.__liaPolygon3DProxy ||
    value?.__liaSolid3DProxy ||
    value?.__liaCurve3DProxy ||
    value?.__liaSurface3DProxy ||
    value;
}

function sharedMetadata(object: any): Omit<CanonicalQuizObject3D, 'kind' | 'geometry'> {
  let visible: boolean | undefined;
  let fixed: boolean | undefined;
  try {
    visible = typeof object?.evalVisProp === 'function'
      ? object.evalVisProp('visible') !== false
      : object?.__liaDgsShowObject !== false;
  } catch (error) {}
  try {
    fixed = typeof object?.evalVisProp === 'function'
      ? object.evalVisProp('fixed') === true
      : object?.__liaDgsFixed === true;
  } catch (error) {}
  const style: Record<string, unknown> = {};
  const visual = object?.visProp || {};
  const strokeColor = object?.__liaDgsStrokeColor || object?.__liaDgsColor ||
    visual.strokecolor || visual.strokeColor;
  const fillColor = object?.__liaDgsFillColor || visual.fillcolor || visual.fillColor;
  const opacity = object?.__liaDgsOpacity ?? visual.opacity ??
    visual.strokeopacity ?? visual.strokeOpacity;
  const strokeWidth = object?.__liaDgsStrokeWidth ?? visual.strokewidth ?? visual.strokeWidth;
  if (strokeColor != null && String(strokeColor)) style.strokeColor = String(strokeColor);
  if (fillColor != null && String(fillColor)) style.fillColor = String(fillColor);
  if (Number.isFinite(Number(opacity))) style.opacity = Number(opacity);
  if (Number.isFinite(Number(strokeWidth))) style.strokeWidth = Number(strokeWidth);
  return {
    key: objectIdentifier(object),
    dimension: object?.__liaDimension === 2 ? 2 : 3,
    name: objectName(object),
    dependency: dependencyFor(object),
    auxiliary: Boolean(
      object?.__liaPoint3DHelper ||
      object?.__liaDgsHelperPoint ||
      object?.__liaDgsSegment6Helper ||
      object?.__liaDgsPolygonBorder
    ),
    authored: object?.__liaDgsMacroManaged === true,
    visible,
    fixed,
    ...(Object.keys(style).length ? { style } : {}),
    source: object,
  };
}

function canonicalConic(object: any): CanonicalQuizObject3D | null {
  if (!object?.__liaConicSection3D || object?.__liaDgsSegment6Helper) return null;
  let conic: any = null;
  try {
    conic = typeof object.__liaConicSection3DEvaluator === 'function'
      ? object.__liaConicSection3DEvaluator()
      : object.__liaConicSection3DEvaluator;
  } catch (error) {}
  return conic
    ? { ...sharedMetadata(object), kind: 'conic3d', geometry: { conic } }
    : null;
}

function canonical3D(object: any): CanonicalQuizObject3D | null {
  const conic = canonicalConic(object);
  if (conic) return conic;

  if (object?.__liaPoint3D && !object.__liaPoint3DHelper) {
    const coordinates = point3DCoordinates(object);
    return coordinates
      ? {
          ...sharedMetadata(object),
          kind: 'point3d',
          geometry: { coordinates },
        }
      : null;
  }

  if (object?.__liaLinear3D) {
    const line = coordinateLinear3DData(object);
    if (!line) return null;
    const aliases: Record<string, QuizObjectKind3D> = {
      segment: 'segment3d',
      line: 'line3d',
      ray: 'ray3d',
      vector: 'vector3d',
    };
    const kind = aliases[String(object.__liaLinear3DKind || 'line')] || 'line3d';
    return {
      ...sharedMetadata(object),
      kind,
      geometry: { line, components: line.direction },
    };
  }

  if (object?.__liaPlane3D) {
    const plane = coordinatePlane3DData(object);
    return plane
      ? { ...sharedMetadata(object), kind: 'plane3d', geometry: { plane } }
      : null;
  }

  if (object?.__liaCircle3D) {
    const circle = coordinateCircle3DData(object);
    return circle
      ? { ...sharedMetadata(object), kind: 'circle3d', geometry: { circle } }
      : null;
  }

  if (object?.__liaSphere3D) {
    const sphere = coordinateSphere3DData(object);
    return sphere
      ? { ...sharedMetadata(object), kind: 'sphere3d', geometry: { sphere } }
      : null;
  }

  if (object?.__liaPolygon3D) {
    const polygon = coordinatePolygon3DData(object);
    return polygon
      ? { ...sharedMetadata(object), kind: 'polygon3d', geometry: { polygon } }
      : null;
  }

  if (object?.__liaSolid3D) {
    const solid = coordinateSolid3DData(object);
    return solid
      ? { ...sharedMetadata(object), kind: 'solid3d', geometry: { solid } }
      : null;
  }

  if (object?.__liaCurve3D) {
    const curve = coordinateCurve3DData(object);
    return curve
      ? { ...sharedMetadata(object), kind: 'curve3d', geometry: { curve } }
      : null;
  }

  if (object?.__liaSurface3D) {
    const surface = coordinateSurface3DData(object);
    return surface
      ? { ...sharedMetadata(object), kind: 'surface3d', geometry: { surface } }
      : null;
  }

  if (typeof object?.__liaAnalytic3DEvaluator === 'function' ||
      object?.__liaSceneRecord?.kind === 'analytic-scalar3d') {
    let value: unknown = object.__liaDgsAnalytic3DValue;
    try {
      if (typeof object.__liaAnalytic3DEvaluator === 'function') {
        value = object.__liaAnalytic3DEvaluator();
      }
    } catch (error) {}
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return {
      ...sharedMetadata(object),
      kind: 'scalar3d',
      geometry: {
        value,
        unit: object.__liaSceneRecord?.unit,
        operation: object.__liaSceneRecord?.operation,
      },
    };
  }
  return null;
}

function coordinates2D(point: any): Vector3 | null {
  try {
    const coordinates: Vector3 = [Number(point.X()), Number(point.Y()), 0];
    return coordinates.every(Number.isFinite) ? coordinates : null;
  } catch (error) {
    return null;
  }
}

function twoDimensionalKind(object: any): QuizObjectKind3D | null {
  if (object?.__liaDgsVector) return 'vector3d';
  if (object?.__liaDgsRay) return 'ray3d';
  if (object?.__liaDgsSegment || object?.__liaDgsGuidedSegment) return 'segment3d';
  if (object?.__liaDgsLine || (object?.__liaQuiz3DParticipant && object?.elType === 'line')) return 'line3d';
  return null;
}

function canonical2D(object: any): CanonicalQuizObject3D | null {
  if (!object || object.__liaPoint3D || object.__liaLinear3D ||
      object.__liaDgsHelperPoint || object.__liaDgsPolygonBorder) return null;

  if ((object.__liaDgsPoint || object.__liaDgsPointName != null ||
       object.__liaDgsMacroManaged || object.__liaQuiz3DParticipant) &&
      object.elType === 'point' && typeof object.X === 'function' &&
      typeof object.Y === 'function') {
    const coordinates = coordinates2D(object);
    return coordinates
      ? {
          ...sharedMetadata(object),
          dimension: 2,
          kind: 'point3d',
          geometry: { coordinates },
        }
      : null;
  }

  const kind = twoDimensionalKind(object);
  const points = object.__liaDgsLinearPoints ||
    object.__liaLinear3DSourcePoints ||
    object.point1 && object.point2 && [object.point1, object.point2];
  if (kind && Array.isArray(points) && points.length >= 2) {
    const first = coordinates2D(points[0]);
    const second = coordinates2D(points[1]);
    const direction = first && second ? subtractVector3(second, first) : null;
    if (!first || !direction) return null;
    return {
      ...sharedMetadata(object),
      dimension: 2,
      kind,
      geometry: {
        line: {
          anchor: first,
          direction,
          domain: kind === 'line3d' ? 'line'
            : (kind === 'ray3d' ? 'ray' : 'segment'),
        },
        components: direction,
      },
    };
  }

  if (object.__liaDgsPolygon && Array.isArray(object.vertices)) {
    const vertices = object.vertices
      .map((point: any) => coordinates2D(point))
      .filter(Boolean) as Vector3[];
    if (vertices.length > 1 &&
        vertices[0] && vertices[vertices.length - 1] &&
        vertices[0].every((value, index) => value === vertices[vertices.length - 1][index])) {
      vertices.pop();
    }
    const polygon = polygonFromPoints3D(vertices);
    return polygon
      ? {
          ...sharedMetadata(object),
          dimension: 2,
          kind: 'polygon3d',
          geometry: { polygon },
        }
      : null;
  }
  return null;
}

function boardObjectCanEnterQuiz(object: any): boolean {
  const value = resolvedObject(object);
  if (!value) return false;
  return Boolean(
    value.__liaPoint3D || value.__liaLinear3D || value.__liaPlane3D ||
    value.__liaCircle3D || value.__liaSphere3D || value.__liaPolygon3D ||
    value.__liaSolid3D || value.__liaCurve3D || value.__liaSurface3D ||
    value.__liaConicSection3D || value.__liaAnalytic3DEvaluator ||
    value.__liaDgsPoint || value.__liaDgsPointName != null ||
    value.__liaDgsSegment || value.__liaDgsGuidedSegment || value.__liaDgsLine ||
    value.__liaDgsRay || value.__liaDgsVector || value.__liaDgsPolygon ||
    value.__liaQuiz3DParticipant ||
    (value.__liaDgsMacroManaged && value.elType === 'point')
  );
}
function collectRawObjects(board: any): any[] {
  const seen = new Set<any>();
  const result: any[] = [];
  const add = (object: any): void => {
    const resolved = resolvedObject(object);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    result.push(resolved);
  };
  getBoardObjects(board).forEach(object => {
    if (boardObjectCanEnterQuiz(object)) add(object);
  });
  const view = getCoordinateView3D(board);
  if (view) {
    [
      view.points,
      view.linearObjects,
      view.planeObjects,
      view.circleObjects,
      view.sphereObjects,
      view.polygonObjects,
      view.solidObjects,
      view.curveObjects,
      view.surfaceObjects,
    ].forEach(collection => collection?.forEach(add));
  }
  [
    window.__analytic3DEntries,
    window.__curve3DEntries,
    window.__surface3DEntries,
    window.__conic3DEntries,
    window.__locus3DEntries,
    window.__locusSurface3DEntries,
  ].forEach(registry => Object.values(registry || {}).forEach((entry: any) => {
    if (entry?.board !== board) return;
    add(entry.object);
    if (Array.isArray(entry.objects)) entry.objects.forEach(add);
  }));
  return result;
}

function syntheticTrianglePolygons(
  objects: readonly CanonicalQuizObject3D[]
): CanonicalQuizObject3D[] {
  const segments = objects.filter(object => object.kind === 'segment3d' &&
    object.geometry?.line?.anchor && object.geometry?.line?.direction
  ).slice(0, 32);
  const result: CanonicalQuizObject3D[] = [];
  const endpoint = (segment: CanonicalQuizObject3D, end: boolean): Vector3 | null => {
    const anchor = segment.geometry.line.anchor as Vector3;
    const direction = segment.geometry.line.direction as Vector3;
    const point: Vector3 = end
      ? [anchor[0] + direction[0], anchor[1] + direction[1], anchor[2] + direction[2]]
      : [anchor[0], anchor[1], anchor[2]];
    return point.every(Number.isFinite) ? point : null;
  };
  const close = (first: Vector3, second: Vector3): boolean => {
    const scale = Math.max(1, ...first.map(Math.abs), ...second.map(Math.abs));
    return Math.hypot(
      first[0] - second[0], first[1] - second[1], first[2] - second[2]
    ) <= 1e-7 * scale;
  };
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      for (let third = second + 1; third < segments.length; third += 1) {
        const selected = [segments[first], segments[second], segments[third]];
        const clusters: Array<{ point: Vector3; degree: number }> = [];
        let valid = true;
        selected.forEach(segment => {
          [endpoint(segment, false), endpoint(segment, true)].forEach(point => {
            if (!point) { valid = false; return; }
            const cluster = clusters.find(candidate => close(candidate.point, point));
            if (cluster) cluster.degree += 1;
            else clusters.push({ point, degree: 1 });
          });
        });
        if (!valid || clusters.length !== 3 ||
            clusters.some(cluster => cluster.degree !== 2)) continue;
        const polygon = polygonFromPoints3D(clusters.map(cluster => cluster.point));
        if (!polygon) continue;
        const componentKeys = Array.from(new Set(selected.flatMap(segment => {
          const sourcePoints = segment.source?.__liaDgsLinearPoints ||
            segment.source?.__liaLinear3DSourcePoints || [];
          return [segment.key, ...(Array.isArray(sourcePoints)
            ? sourcePoints.map(objectIdentifier)
            : [])];
        }))).sort();
        result.push({
          key: 'synthetic-polygon:' + componentKeys.join('|'),
          kind: 'polygon3d',
          dimension: selected.some(segment => segment.dimension === 3) ? 3 : 2,
          name: selected.map(segment => segment.name).filter(Boolean).join('-'),
          geometry: { polygon, componentKeys },
          dependency: {
            definition: 'polygon-from-segments',
            sourceIds: componentKeys,
            dependent: true,
          },
          auxiliary: false,
          authored: selected.every(segment => segment.authored),
          visible: selected.some(segment => segment.visible !== false),
          fixed: selected.every(segment => segment.fixed === true),
          source: selected.map(segment => segment.source),
        });
      }
    }
  }
  return result;
}
export function collectCanonicalQuizObjects3D(board: any): CanonicalQuizObject3D[] {
  if (!board) return [];
  const byKey = new Map<string, CanonicalQuizObject3D>();
  collectRawObjects(board).forEach(object => {
    const canonical = canonical3D(object) || canonical2D(object);
    if (!canonical) return;
    const current = byKey.get(canonical.key);
    if (!current || (current.dimension === 2 && canonical.dimension === 3)) {
      byKey.set(canonical.key, canonical);
    }
  });
  const canonical = Array.from(byKey.values());
  return canonical.concat(syntheticTrianglePolygons(canonical));
}

export function evaluateConstructionQuiz3DOnBoard(
  board: any,
  config: ConstructionQuiz3DConfig,
  language = 'de'
): ConstructionQuiz3DEvaluation {
  const resolvedLanguage = resolveUiLanguage(null, language);
  if (!board) return emptyConstructionQuiz3DEvaluation('missing-board', resolvedLanguage);
  return evaluateConstructionQuiz3D(
    collectCanonicalQuizObjects3D(board),
    config,
    resolvedLanguage
  );
}

function readNodeSpec(node: HTMLElement | null): string {
  return String(node?.dataset.spec || node?.textContent || '');
}

function dispatchFeedback(uid: string): void {
  try {
    document.dispatchEvent(new CustomEvent('lia-coordinate-quiz-feedback', {
      detail: { uid, kind: 'construction3d' },
    }));
  } catch (error) {}
}

function updateEntryNode(entry: ConstructionQuiz3DEntry): void {
  const evaluation = entry.evaluation;
  if (!evaluation) {
    delete entry.node.dataset.feedback;
    delete entry.node.dataset.quizStatus;
    delete entry.node.dataset.quizScore;
    entry.node.dataset.quizAttempts = String(entry.attempts);
    dispatchFeedback(entry.uid);
    return;
  }
  entry.node.dataset.feedback = evaluation.message;
  entry.node.dataset.quizStatus = evaluation.status;
  entry.node.dataset.quizScore = String(Math.round(evaluation.score * 100));
  entry.node.dataset.quizAttempts = String(entry.attempts);
  entry.node.dataset.quizResult = JSON.stringify({
    correct: evaluation.correct,
    status: evaluation.status,
    code: evaluation.code,
    score: evaluation.score,
    issues: evaluation.issues.map(issue => ({
      code: issue.code,
      expectedId: issue.expectedId,
    })),
  });
  dispatchFeedback(entry.uid);
}

function evaluateEntry(
  entry: ConstructionQuiz3DEntry,
  countAttempt: boolean
): ConstructionQuiz3DEvaluation {
  if (countAttempt) entry.attempts += 1;
  entry.evaluation = evaluateConstructionQuiz3DOnBoard(
    entry.board,
    entry.config,
    entry.language
  );
  updateEntryNode(entry);
  if (entry.evaluation.status === 'author-error') {
    try {
      console.error(
        '[lia-coordinate] Invalid ConstructionQuiz3D definition:',
        entry.config.errors
      );
    } catch (error) {}
  }
  return entry.evaluation;
}

function clearLiveBinding(entry: ConstructionQuiz3DEntry): void {
  if (entry.liveTimer != null) {
    clearTimeout(entry.liveTimer);
    entry.liveTimer = null;
  }
  if (entry.liveListener && entry.board?.containerObj?.removeEventListener) {
    try {
      entry.board.containerObj.removeEventListener(
        'lia-coordinate-geometry-change', entry.liveListener
      );
    } catch (error) {}
  }
  entry.liveListener = null;
}

function bindLiveFeedback(entry: ConstructionQuiz3DEntry): void {
  clearLiveBinding(entry);
  if (!entry.config.liveFeedback || !entry.board?.containerObj?.addEventListener) return;
  entry.liveListener = () => {
    if (entry.liveTimer != null) clearTimeout(entry.liveTimer);
    entry.liveTimer = setTimeout(() => {
      entry.liveTimer = null;
      if (!entry.node.isConnected || entries.get(entry.uid) !== entry) return;
      evaluateEntry(entry, false);
    }, 180);
  };
  try {
    entry.board.containerObj.addEventListener(
      'lia-coordinate-geometry-change', entry.liveListener
    );
  } catch (error) {
    entry.liveListener = null;
  }
}

function recomputeViewPolicy(board: any): void {
  const policies = board?.__liaConstructionQuiz3DPolicies as Map<string, string> | undefined;
  const locked = new Set(Array.from(policies?.values() || []).filter(value => value !== 'free'));
  board.__liaConstructionQuiz3DViewPolicy = locked.size === 1
    ? Array.from(locked)[0]
    : 'free';
}

function applyViewPolicy(entry: ConstructionQuiz3DEntry): void {
  if (!entry.board) return;
  const policies: Map<string, string> =
    entry.board.__liaConstructionQuiz3DPolicies instanceof Map
      ? entry.board.__liaConstructionQuiz3DPolicies
      : new Map<string, string>();
  entry.board.__liaConstructionQuiz3DPolicies = policies;
  policies.set(entry.uid, entry.config.viewPolicy);
  recomputeViewPolicy(entry.board);
  if (entry.config.viewPolicy === '2d' || entry.config.viewPolicy === '3d') {
    try { requestCoordinateSceneMode(entry.board, entry.config.viewPolicy); } catch (error) {}
  }
}

function clearViewPolicy(entry: ConstructionQuiz3DEntry): void {
  const policies = entry.board?.__liaConstructionQuiz3DPolicies;
  if (policies instanceof Map) {
    policies.delete(entry.uid);
    recomputeViewPolicy(entry.board);
  }
}

function disposeEntry(entry: ConstructionQuiz3DEntry): void {
  clearLiveBinding(entry);
  clearViewPolicy(entry);
  entries.delete(entry.uid);
}

function setup(uid: string, spec: string, language?: string): void {
  const node = document.getElementById(
    'construction-quiz3d-spec-' + uid
  ) as HTMLElement | null;
  if (!node) return;
  const resolvedSpec = String(spec || readNodeSpec(node));
  const config = parseConstructionQuiz3DSpec(resolvedSpec);
  const board = window.__boards && window.__boards[config.boardId];
  const current = entries.get(uid);
  if (current &&
      current.node === node &&
      current.spec === resolvedSpec &&
      current.board === board) {
    const liveBindingChanged = current.config.liveFeedback !== config.liveFeedback;
    current.language = String(language || node.dataset.language || current.language || 'de');
    current.config = config;
    applyViewPolicy(current);
    if (liveBindingChanged || (config.liveFeedback && !current.liveListener)) {
      bindLiveFeedback(current);
    }
    return;
  }
  if (current) disposeEntry(current);
  node.dataset.spec = resolvedSpec;
  if (language) node.dataset.language = language;
  const entry: ConstructionQuiz3DEntry = {
    uid,
    node,
    spec: resolvedSpec,
    language: String(language || node.dataset.language || 'de'),
    config,
    board,
    attempts: 0,
    evaluation: null,
    liveTimer: null,
    liveListener: null,
  };
  entries.set(uid, entry);
  applyViewPolicy(entry);
  bindLiveFeedback(entry);
  updateEntryNode(entry);
}

function bootstrap(): void {
  entries.forEach(entry => {
    if (!entry.node.isConnected ||
        document.getElementById(entry.node.id) !== entry.node) {
      disposeEntry(entry);
    }
  });
  document.querySelectorAll<HTMLElement>(
    '[id^="construction-quiz3d-spec-"]:not([data-lia-static-claimed])'
  ).forEach(node => {
    const uid = node.id.replace(/^construction-quiz3d-spec-/, '');
    if (uid) setup(uid, readNodeSpec(node), node.dataset.language);
  });
}

export function init(): void {
  if (window.__constructionQuiz3DReady) {
    window.__bootstrapConstructionQuiz3D?.();
    return;
  }
  window.__constructionQuiz3DReady = true;
  window.__constructionQuiz3DEntries = window.__constructionQuiz3DEntries || {};

  window.__setupConstructionQuiz3D = setup;
  window.__bootstrapConstructionQuiz3D = bootstrap;
  window.__checkConstructionQuiz3DFromSpec = (
    spec: string,
    language?: string
  ): ConstructionQuiz3DEvaluation => {
    const config = parseConstructionQuiz3DSpec(spec);
    const board = window.__boards && window.__boards[config.boardId];
    return evaluateConstructionQuiz3DOnBoard(board, config, language);
  };
  window.__checkConstructionQuiz3D = (uid: string, spec: string): boolean => {
    if (spec) setup(uid, spec);
    const entry = entries.get(uid);
    if (!entry) {
      setup(uid, '');
    }
    const current = entries.get(uid);
    if (!current) return false;
    if (current.config.maxAttempts != null &&
        current.attempts >= current.config.maxAttempts && current.evaluation) {
      return current.evaluation.correct;
    }
    const evaluation = evaluateEntry(current, true);
    window.__constructionQuiz3DEntries![uid] = {
      board: current.board,
      boardId: current.config.boardId,
      config: current.config,
      attempts: current.attempts,
      evaluation,
    };
    return evaluation.correct;
  };
  window.__getConstructionQuiz3DResult = (
    uid: string
  ): ConstructionQuiz3DEvaluation | null => entries.get(uid)?.evaluation || null;
  window.__resetConstructionQuiz3D = (uid: string): void => {
    const entry = entries.get(uid);
    if (!entry) return;
    const spec = entry.spec;
    const language = entry.language;
    try { entry.board?.__liaDgsRestoreInitialState?.(); } catch (error) {}
    setup(uid, spec, language);
    const current = entries.get(uid) || entry;
    current.attempts = 0;
    current.evaluation = null;
    bindLiveFeedback(current);
    updateEntryNode(current);
    if (window.__constructionQuiz3DEntries) {
      delete window.__constructionQuiz3DEntries[uid];
    }
  };

  scheduleBootstrap(bootstrap);
  if (!observer && document.documentElement) {
    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        if (record.type === 'attributes') {
          return (record.target as Element)?.id?.startsWith('construction-quiz3d-spec-');
        }
        return Array.from(record.addedNodes)
          .concat(Array.from(record.removedNodes))
          .some(node => node.nodeType === 1 && (
            (node as Element).matches?.('[id^="construction-quiz3d-spec-"]') ||
            (node as Element).querySelector?.('[id^="construction-quiz3d-spec-"]')
          ));
      });
      if (relevant) scheduleBootstrap(bootstrap);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-spec', 'data-language', 'data-lia-static-claimed'],
    });
    window.__constructionQuiz3DObserver = observer;
  }
}
