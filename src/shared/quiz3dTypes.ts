import { splitTopLevel, unquote } from './parser';

export type ConstructionQuiz3DMode = 'result' | 'construction';
export type ConstructionQuiz3DViewPolicy = 'free' | '2d' | '3d';
export type QuizObjectKind3D =
  | 'point3d' | 'vector3d' | 'segment3d' | 'line3d' | 'ray3d' | 'plane3d'
  | 'circle3d' | 'sphere3d' | 'polygon3d' | 'solid3d' | 'curve3d'
  | 'surface3d' | 'conic3d' | 'scalar3d';

export interface QuizTolerance3D {
  coordinate: number;
  angle: number;
  scalarAbsolute: number;
  scalarRelative: number;
  incidence: number;
  parallel: number;
  orthogonal: number;
  curve: number;
  surface: number;
}

export const DEFAULT_QUIZ_TOLERANCE_3D: Readonly<QuizTolerance3D> = Object.freeze({
  coordinate: 1e-5,
  angle: Math.PI / 720,
  scalarAbsolute: 1e-6,
  scalarRelative: 1e-5,
  incidence: 1e-6,
  parallel: 1e-6,
  orthogonal: 1e-6,
  curve: 2e-3,
  surface: 4e-3,
});

export interface QuizDependency3D {
  definition?: string;
  sourceIds?: string[];
  referenceIds?: string[];
  driverIds?: string[];
  tracePointId?: string;
  boundTo?: string;
  bindingKind?: string;
  transformation?: string;
  dependent?: boolean;
  parameters?: Record<string, unknown>;
}

export interface CanonicalQuizObject3D {
  key: string;
  kind: QuizObjectKind3D;
  dimension: 2 | 3;
  name?: string;
  geometry: Record<string, any>;
  dependency?: QuizDependency3D;
  dependencyAlternatives?: QuizDependency3D[];
  auxiliary?: boolean;
  authored?: boolean;
  visible?: boolean;
  fixed?: boolean;
  style?: Record<string, unknown>;
  source?: any;
}

export interface ExpectedQuizObject3D {
  id?: string;
  name?: string;
  kind: QuizObjectKind3D;
  geometry?: Record<string, any>;
  dependency?: QuizDependency3D;
  dependencyAlternatives?: QuizDependency3D[];
  required?: boolean;
  weight?: number;
  orientationRelevant?: boolean;
  parameterizationRelevant?: boolean;
  visible?: boolean;
  fixed?: boolean;
  style?: Record<string, unknown>;
}

export type QuizConditionKind3D =
  | 'incidence' | 'parallel' | 'orthogonal' | 'relation'
  | 'distance' | 'angle' | 'measurement';

export interface QuizCondition3D {
  id?: string;
  kind: QuizConditionKind3D;
  objects: string[];
  value?: number;
  relation?: string;
  measurement?: string;
  weight?: number;
  tolerance?: number;
  unit?: 'deg' | 'rad';
}

export interface ConstructionQuiz3DConfig {
  boardId: string;
  quizId?: string;
  mode: ConstructionQuiz3DMode;
  expected: ExpectedQuizObject3D[];
  conditions: QuizCondition3D[];
  tolerance: QuizTolerance3D;
  allowAuxiliary: boolean;
  forbidExtra: boolean;
  namesRelevant: boolean;
  visibilityRelevant: boolean;
  fixedRelevant: boolean;
  formattingRelevant: boolean;
  orderRelevant: boolean;
  includeAuthored: boolean;
  viewPolicy: ConstructionQuiz3DViewPolicy;
  liveFeedback: boolean;
  maxAttempts?: number;
  hints: string[];
  solution?: string;
  valid: boolean;
  errors: string[];
}

export type QuizEvaluationCode3D =
  | 'correct' | 'partial' | 'invalid-config' | 'missing-board' | 'missing-object'
  | 'wrong-type' | 'position-mismatch' | 'size-mismatch' | 'value-mismatch'
  | 'dependency-mismatch' | 'condition-mismatch' | 'extra-object'
  | 'degenerate' | 'undefined';

export interface QuizIssue3D {
  code: QuizEvaluationCode3D;
  expectedId?: string;
  actualKey?: string;
  messageKey: string;
  details?: Record<string, unknown>;
}

export interface QuizObjectMatch3D {
  expected: ExpectedQuizObject3D;
  actual: CanonicalQuizObject3D;
  score: number;
}

export interface ConstructionQuiz3DEvaluation {
  correct: boolean;
  status: 'correct' | 'partial' | 'incorrect' | 'author-error';
  code: QuizEvaluationCode3D;
  score: number;
  passedWeight: number;
  totalWeight: number;
  matches: QuizObjectMatch3D[];
  issues: QuizIssue3D[];
  message: string;
  language: 'de' | 'en';
}

export interface ObjectComparison3D {
  matches: boolean;
  score: number;
  code: QuizEvaluationCode3D;
  details?: Record<string, unknown>;
}

const KIND_ALIASES: Record<string, QuizObjectKind3D> = {
  point: 'point3d', punkt: 'point3d', point3d: 'point3d', punkt3d: 'point3d',
  vector: 'vector3d', vektor: 'vector3d', vector3d: 'vector3d', vektor3d: 'vector3d',
  segment: 'segment3d', strecke: 'segment3d', segment3d: 'segment3d', strecke3d: 'segment3d',
  line: 'line3d', gerade: 'line3d', line3d: 'line3d', gerade3d: 'line3d',
  ray: 'ray3d', strahl: 'ray3d', ray3d: 'ray3d', strahl3d: 'ray3d',
  plane: 'plane3d', ebene: 'plane3d', plane3d: 'plane3d', ebene3d: 'plane3d',
  circle: 'circle3d', kreis: 'circle3d', circle3d: 'circle3d', kreis3d: 'circle3d',
  sphere: 'sphere3d', kugel: 'sphere3d', sphere3d: 'sphere3d', kugel3d: 'sphere3d',
  polygon: 'polygon3d', polygon3d: 'polygon3d',
  solid: 'solid3d', koerper: 'solid3d', korper: 'solid3d', solid3d: 'solid3d', koerper3d: 'solid3d',
  curve: 'curve3d', kurve: 'curve3d', curve3d: 'curve3d', raumkurve: 'curve3d',
  surface: 'surface3d', flaeche: 'surface3d', surface3d: 'surface3d', flaeche3d: 'surface3d',
  conic: 'conic3d', kegelschnitt: 'conic3d', conic3d: 'conic3d', kegelschnitt3d: 'conic3d',
  scalar: 'scalar3d', wert: 'scalar3d', scalar3d: 'scalar3d', messwert: 'scalar3d',
};

export const QUIZ3D_MESSAGES = {
  de: {
    correct: 'Die Konstruktion ist vollständig richtig.',
    partial: 'Die Konstruktion ist teilweise richtig.',
    incorrect: 'Die Konstruktion erfüllt die Zielbedingungen noch nicht.',
    invalidConfig: 'Diese Aufgabe kann wegen einer ungültigen Quizdefinition technisch nicht geprüft werden.',
    missingBoard: 'Das zugehörige Koordinatensystem ist derzeit nicht verfügbar.',
    missingObject: 'Ein benötigtes Objekt fehlt.',
    wrongType: 'Ein Objekt hat noch nicht den geforderten Typ.',
    positionMismatch: 'Die Lage eines Objekts stimmt noch nicht.',
    sizeMismatch: 'Die Lage stimmt teilweise, aber eine Größe ist noch falsch.',
    valueMismatch: 'Ein Messwert liegt außerhalb der erlaubten Toleranz.',
    dependencyMismatch: 'Die Geometrie stimmt, aber die geforderte dynamische Abhängigkeit fehlt.',
    conditionMismatch: 'Eine geometrische Lage- oder Messbedingung ist noch nicht erfüllt.',
    extraObject: 'Die Konstruktion enthält ein nicht erlaubtes zusätzliches Zielobjekt.',
    degenerate: 'Mindestens ein Objekt ist geometrisch entartet.',
    undefined: 'Mindestens ein benötigtes Ergebnis ist derzeit nicht definiert.',
  },
  en: {
    correct: 'The construction is completely correct.',
    partial: 'The construction is partially correct.',
    incorrect: 'The construction does not yet satisfy all target conditions.',
    invalidConfig: 'This task cannot be checked because its quiz definition is invalid.',
    missingBoard: 'The associated coordinate board is currently unavailable.',
    missingObject: 'A required object is missing.',
    wrongType: 'An object does not yet have the required type.',
    positionMismatch: 'The position of an object is not correct yet.',
    sizeMismatch: 'The position is partly correct, but a size is still wrong.',
    valueMismatch: 'A measured value is outside the allowed tolerance.',
    dependencyMismatch: 'The geometry is correct, but the required dynamic dependency is missing.',
    conditionMismatch: 'A geometric relation or measurement condition is not satisfied yet.',
    extraObject: 'The construction contains a disallowed additional target object.',
    degenerate: 'At least one object is geometrically degenerate.',
    undefined: 'At least one required result is currently undefined.',
  },
} as const;

export function normalizedQuizWord3D(value: unknown): string {
  return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/[\s_-]+/g, '');
}

export function normalizeQuizObjectKind3D(value: unknown): QuizObjectKind3D | null {
  return KIND_ALIASES[normalizedQuizWord3D(value)] || null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  return Number.isFinite(number) ? number : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const word = normalizedQuizWord3D(value);
  if (['1', 'true', 'yes', 'ja', 'on'].includes(word)) return true;
  if (['0', 'false', 'no', 'nein', 'off'].includes(word)) return false;
  return fallback;
}

function jsonValue(value: string): unknown {
  const source = unquote(String(value || '').trim());
  if (!source) return null;
  try { return JSON.parse(source); } catch (error) { return source; }
}

function normalizeMode(value: unknown): ConstructionQuiz3DMode {
  const mode = normalizedQuizWord3D(value);
  return mode === 'construction' || mode === 'konstruktion' || mode === 'constructive'
    ? 'construction'
    : 'result';
}

function normalizeViewPolicy(value: unknown): ConstructionQuiz3DViewPolicy {
  const mode = normalizedQuizWord3D(value);
  if (mode === '2' || mode === '2d' || mode === 'locked2d') return '2d';
  if (mode === '3' || mode === '3d' || mode === 'locked3d') return '3d';
  return 'free';
}

function normalizeExpected(value: unknown, index: number, errors: string[]): ExpectedQuizObject3D | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('expected[' + index + '] must be an object');
    return null;
  }
  const source = value as Record<string, any>;
  const kind = normalizeQuizObjectKind3D(source.kind || source.type || source.typ);
  if (!kind) {
    errors.push('expected[' + index + '] has an unknown object kind');
    return null;
  }
  const reserved = new Set([
    'id', 'name', 'kind', 'type', 'typ', 'geometry', 'dependency', 'dependencyAlternatives', 'required',
    'weight', 'orientationRelevant', 'parameterizationRelevant', 'visible', 'fixed', 'style'
  ]);
  const inlineGeometry: Record<string, unknown> = {};
  Object.keys(source).forEach(key => { if (!reserved.has(key)) inlineGeometry[key] = source[key]; });
  const weight = finiteNumber(source.weight);
  return {
    id: source.id == null ? 'object-' + (index + 1) : String(source.id),
    ...(source.name == null ? {} : { name: String(source.name) }),
    kind,
    geometry: {
      ...inlineGeometry,
      ...(source.geometry && typeof source.geometry === 'object' ? source.geometry : {})
    },
    ...(source.dependency && typeof source.dependency === 'object'
      ? { dependency: source.dependency as QuizDependency3D } : {}),
    ...(Array.isArray(source.dependencyAlternatives)
      ? { dependencyAlternatives: source.dependencyAlternatives.filter((value: unknown) =>
          !!value && typeof value === 'object' && !Array.isArray(value)
        ) as QuizDependency3D[] }
      : {}),
    required: source.required !== false,
    weight: weight != null && weight > 0 ? weight : 1,
    orientationRelevant: bool(source.orientationRelevant, false),
    parameterizationRelevant: bool(source.parameterizationRelevant, false),
    ...(source.visible == null ? {} : { visible: bool(source.visible, true) }),
    ...(source.fixed == null ? {} : { fixed: bool(source.fixed, false) }),
    ...(source.style && typeof source.style === 'object' ? { style: source.style } : {}),
  };
}

function normalizeCondition(value: unknown, index: number, errors: string[]): QuizCondition3D | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('conditions[' + index + '] must be an object');
    return null;
  }
  const source = value as Record<string, any>;
  const aliases: Record<string, QuizConditionKind3D> = {
    incidence: 'incidence', inzidenz: 'incidence', liegtauf: 'incidence',
    parallel: 'parallel', orthogonal: 'orthogonal', senkrecht: 'orthogonal',
    relation: 'relation', lage: 'relation', distance: 'distance', abstand: 'distance',
    angle: 'angle', winkel: 'angle', measurement: 'measurement', messwert: 'measurement',
  };
  const kind = aliases[normalizedQuizWord3D(source.kind || source.type || source.typ)];
  const rawObjects = source.objects ?? source.objekte;
  const objects = Array.isArray(rawObjects) ? rawObjects.map(String) : [];
  if (!kind || !objects.length || (kind !== 'measurement' && objects.length < 2)) {
    errors.push('conditions[' + index + '] is incomplete');
    return null;
  }
  const rawValue = source.value ?? source.wert;
  const valueNumber = finiteNumber(rawValue);
  const rawTolerance = source.tolerance ?? source.toleranz;
  const tolerance = finiteNumber(rawTolerance);
  const weight = finiteNumber(source.weight ?? source.gewicht);
  const relation = source.relation ?? source.lagebeziehung;
  const measurement = source.measurement ?? source.messung ?? source.messwertname;
  const rawUnit = source.unit ?? source.einheit;
  let unit: 'deg' | 'rad' | undefined;
  if (rawUnit != null) {
    const word = normalizedQuizWord3D(rawUnit);
    if (['deg', 'degree', 'degrees', 'grad'].includes(word)) unit = 'deg';
    else if (['rad', 'radian', 'radians', 'bogenmass'].includes(word)) unit = 'rad';
    else errors.push('conditions[' + index + '] has an invalid angle unit');
  }
  if (rawTolerance != null && (tolerance == null || tolerance < 0)) {
    errors.push('conditions[' + index + '] has an invalid tolerance');
  }
  if (['distance', 'angle', 'measurement'].includes(kind) && valueNumber == null) {
    errors.push('conditions[' + index + '] requires a finite value');
  }
  if (kind === 'relation' && !String(relation || '').trim()) {
    errors.push('conditions[' + index + '] requires a relation');
  }
  if (kind === 'measurement' && !String(measurement || '').trim()) {
    errors.push('conditions[' + index + '] requires a measurement');
  }
  return {
    id: source.id == null ? 'condition-' + (index + 1) : String(source.id),
    kind,
    objects,
    ...(valueNumber == null ? {} : { value: valueNumber }),
    ...(relation == null ? {} : { relation: String(relation) }),
    ...(measurement == null ? {} : { measurement: String(measurement) }),
    ...(tolerance == null || tolerance < 0 ? {} : {
      tolerance: kind === 'angle' && unit !== 'rad' ? tolerance * Math.PI / 180 : tolerance
    }),
    ...(kind === 'angle' ? { unit: unit || 'deg' } : {}),
    weight: weight != null && weight > 0 ? weight : 1,
  };
}
function toleranceFrom(value: unknown, errors: string[]): QuizTolerance3D {
  const result: QuizTolerance3D = { ...DEFAULT_QUIZ_TOLERANCE_3D };
  if (value == null) return result;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 0) {
      result.coordinate = value;
      result.scalarAbsolute = value;
      result.incidence = value;
      return result;
    }
    errors.push('tolerance must be finite and non-negative');
    return result;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push('tolerance must be an object');
    return result;
  }
  const aliases: Record<string, keyof QuizTolerance3D> = {
    coordinate: 'coordinate', coordinates: 'coordinate', koordinate: 'coordinate',
    angle: 'angle', winkel: 'angle', scalarabsolute: 'scalarAbsolute', absolut: 'scalarAbsolute',
    scalarrelative: 'scalarRelative', relativ: 'scalarRelative',
    incidence: 'incidence', inzidenz: 'incidence', parallel: 'parallel',
    orthogonal: 'orthogonal', senkrecht: 'orthogonal',
    curve: 'curve', kurve: 'curve', surface: 'surface', flaeche: 'surface',
  };
  Object.entries(value as Record<string, unknown>).forEach(([rawKey, rawValue]) => {
    const key = aliases[normalizedQuizWord3D(rawKey)];
    const number = finiteNumber(rawValue);
    if (!key || number == null || number < 0) errors.push('invalid tolerance option: ' + rawKey);
    else result[key] = number;
  });
  return result;
}

function parseCompactSpec(source: string): Record<string, unknown> {
  const parts = splitTopLevel(unquote(source), ';').map(part => unquote(String(part || '').trim()));
  const result: Record<string, unknown> = { boardId: parts.shift() || '' };
  parts.forEach(part => {
    const match = part.match(/^([^=]+)=([\s\S]*)$/);
    if (!match) return;
    const key = normalizedQuizWord3D(match[1]);
    const aliases: Record<string, string> = {
      board: 'boardId', boardid: 'boardId', id: 'quizId', quizid: 'quizId',
      mode: 'mode', modus: 'mode', objects: 'expected', objekte: 'expected', expected: 'expected',
      conditions: 'conditions', bedingungen: 'conditions',
      tolerance: 'tolerance', toleranz: 'tolerance',
      allowauxiliary: 'allowAuxiliary', hilfsobjekte: 'allowAuxiliary',
      forbidextra: 'forbidExtra', zusatzobjekteverbieten: 'forbidExtra',
      namesrelevant: 'namesRelevant', namenrelevant: 'namesRelevant',
      visibilityrelevant: 'visibilityRelevant', sichtbarkeitrelevant: 'visibilityRelevant',
      fixedrelevant: 'fixedRelevant', fixierungrelevant: 'fixedRelevant',
      formattingrelevant: 'formattingRelevant', formatierungrelevant: 'formattingRelevant',
      orderrelevant: 'orderRelevant', reihenfolgerelevant: 'orderRelevant',
      includeauthored: 'includeAuthored', vorgabenbewerten: 'includeAuthored',
      view: 'viewPolicy', ansicht: 'viewPolicy', viewswitch: 'viewPolicy',
      livefeedback: 'liveFeedback', maxattempts: 'maxAttempts', versuche: 'maxAttempts',
      hints: 'hints', hinweise: 'hints', solution: 'solution', loesung: 'solution',
    };
    if (aliases[key]) result[aliases[key]] = jsonValue(match[2]);
  });
  return result;
}

function finiteVector(value: unknown, minimum = 3): boolean {
  return Array.isArray(value) && value.length >= minimum &&
    value.slice(0, minimum).every(item => Number.isFinite(Number(item)));
}

function finiteRange(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 &&
    value.slice(0, 2).every(item => Number.isFinite(Number(item))) &&
    Number(value[0]) !== Number(value[1]);
}

function validateExpectedGeometry(item: ExpectedQuizObject3D, errors: string[]): void {
  const geometry = item.geometry || {};
  const invalid = (message: string) => errors.push(
    'expected[' + String(item.id || '?') + '] ' + message
  );
  if (item.kind === 'point3d' && !finiteVector(geometry.point || geometry.coordinates)) {
    invalid('requires a finite 3D point');
  } else if (['segment3d', 'line3d', 'ray3d', 'vector3d'].includes(item.kind)) {
    const anchor = geometry.anchor || geometry.point || geometry.start || geometry.first;
    const direction = geometry.direction || geometry.components;
    const end = geometry.end || geometry.second;
    if (item.kind !== 'vector3d' && !finiteVector(anchor)) invalid('requires a finite anchor');
    if (!finiteVector(direction) && !(finiteVector(anchor) && finiteVector(end))) {
      invalid('requires a finite non-zero direction or two points');
    } else {
      const vector = finiteVector(direction) ? direction : [
        Number(end[0]) - Number(anchor[0]),
        Number(end[1]) - Number(anchor[1]),
        Number(end[2]) - Number(anchor[2]),
      ];
      if (Math.hypot(Number(vector[0]), Number(vector[1]), Number(vector[2])) <= Number.EPSILON) {
        invalid('has a degenerate direction');
      }
    }
  } else if (item.kind === 'plane3d') {
    const coefficients = geometry.coefficients;
    const normal = geometry.normal || (Array.isArray(coefficients) ? coefficients.slice(0, 3) : null);
    if (!finiteVector(normal) || Math.hypot(...normal.slice(0, 3).map(Number)) <= Number.EPSILON ||
        (!finiteVector(geometry.point || geometry.anchor || geometry.origin) &&
         !(Array.isArray(coefficients) && coefficients.length >= 4 && coefficients.slice(0, 4).every((value: unknown) => Number.isFinite(Number(value)))))) {
      invalid('requires a finite point and normal or four plane coefficients');
    }
  } else if (item.kind === 'circle3d') {
    if (!finiteVector(geometry.center || geometry.point) || !finiteVector(geometry.normal) ||
        !(Number(geometry.radius) > 0 && Number.isFinite(Number(geometry.radius)))) {
      invalid('requires center, normal and a positive radius');
    }
  } else if (item.kind === 'sphere3d') {
    if (!finiteVector(geometry.center || geometry.point) ||
        !(Number(geometry.radius) > 0 && Number.isFinite(Number(geometry.radius)))) {
      invalid('requires center and a positive radius');
    }
  } else if (item.kind === 'polygon3d') {
    if (!Array.isArray(geometry.vertices) || geometry.vertices.length < 3 ||
        !geometry.vertices.every((vertex: unknown) => finiteVector(vertex))) {
      invalid('requires at least three finite vertices');
    }
  } else if (item.kind === 'solid3d') {
    if (!String(geometry.solidKind || geometry.definition || geometry.kind || '').trim()) {
      invalid('requires a supported solid kind');
    }
  } else if (item.kind === 'curve3d') {
    if (!Array.isArray(geometry.expressions) || geometry.expressions.length !== 3 ||
        !finiteRange(geometry.range || geometry.parameterRange)) {
      invalid('requires three expressions and a finite parameter range');
    }
  } else if (item.kind === 'surface3d') {
    if (!Array.isArray(geometry.expressions) || geometry.expressions.length !== 3 ||
        !finiteRange(geometry.uRange) || !finiteRange(geometry.vRange)) {
      invalid('requires three expressions and finite u/v ranges');
    }
  } else if (item.kind === 'conic3d') {
    if (!String(geometry.conicKind || geometry.classification || geometry.kind || '').trim()) {
      invalid('requires a conic kind');
    }
  } else if (item.kind === 'scalar3d' && !Number.isFinite(Number(geometry.value))) {
    invalid('requires a finite value');
  }
}

function validateConditions(conditions: QuizCondition3D[], errors: string[]): void {
  const relationSets: Record<string, Set<string>> = {
    parallel: new Set(['strictlyparallel', 'identical']),
    strictlyparallel: new Set(['strictlyparallel']),
    identical: new Set(['identical']),
    intersecting: new Set(['intersecting']),
    skew: new Set(['skew']),
    orthogonal: new Set(['orthogonal']),
    contained: new Set(['contained']),
    notcontained: new Set(['notcontained']),
    invalid: new Set(['invalid']),
  };
  const relationByPair = new Map<string, Set<string>>();
  const directionByPair = new Map<string, Set<string>>();
  const numericByKey = new Map<string, { value: number; tolerance: number }>();
  conditions.forEach((condition, index) => {
    const pair = condition.objects.slice().sort().join('|');
    if (condition.kind === 'parallel' || condition.kind === 'orthogonal') {
      const kinds = directionByPair.get(pair) || new Set<string>();
      kinds.add(condition.kind);
      directionByPair.set(pair, kinds);
      if (kinds.has('parallel') && kinds.has('orthogonal')) {
        errors.push('conditions for ' + pair + ' are contradictory');
      }
    }
    if (condition.kind === 'relation') {
      const word = normalizedQuizWord3D(condition.relation);
      const aliases: Record<string, string> = {
        identisch: 'identical', gleich: 'identical', echtparallel: 'strictlyparallel',
        schneidend: 'intersecting', schnitt: 'intersecting', windschief: 'skew',
        senkrecht: 'orthogonal', enthalten: 'contained', liegtinebene: 'contained',
        nichtenthalten: 'notcontained', ungueltig: 'invalid',
      };
      const wanted = aliases[word] || word;
      const allowed = relationSets[wanted];
      if (!allowed) errors.push('conditions[' + index + '] has an unsupported relation');
      else {
        const current = relationByPair.get(pair);
        const intersection = current
          ? new Set(Array.from(current).filter(value => allowed.has(value)))
          : new Set(allowed);
        if (!intersection.size) errors.push('conditions for ' + pair + ' are contradictory');
        relationByPair.set(pair, intersection);
      }
    }
    if (condition.value == null || !['distance', 'angle', 'measurement'].includes(condition.kind)) return;
    const measurement = condition.kind === 'measurement'
      ? ':' + normalizedQuizWord3D(condition.measurement) : '';
    const key = condition.kind + ':' + pair + measurement;
    const tolerance = condition.tolerance ?? (condition.kind === 'angle'
      ? DEFAULT_QUIZ_TOLERANCE_3D.angle : DEFAULT_QUIZ_TOLERANCE_3D.scalarAbsolute);
    const current = numericByKey.get(key);
    if (current && Math.abs(current.value - condition.value) > current.tolerance + tolerance) {
      errors.push('conditions for ' + pair + ' are contradictory');
    } else if (!current) numericByKey.set(key, { value: condition.value, tolerance });
  });
}
function validateDependencyCycles(expected: ExpectedQuizObject3D[], errors: string[]): void {
  const ids = new Set(expected.map(item => String(item.id || '')));
  const graph = new Map<string, string[]>();
  expected.forEach(item => {
    const dependency = item.dependency;
    const references = [
      ...(dependency?.sourceIds || []), ...(dependency?.referenceIds || []),
      ...(dependency?.driverIds || []), dependency?.boundTo, dependency?.tracePointId,
    ].filter((value): value is string => !!value && ids.has(String(value))).map(String);
    graph.set(String(item.id || ''), references);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = (graph.get(id) || []).some(visit);
    visiting.delete(id);
    visited.add(id);
    return cyclic;
  };
  if (Array.from(graph.keys()).some(visit)) errors.push('expected dependencies contain a cycle');
}
export function parseConstructionQuiz3DSpec(spec: string): ConstructionQuiz3DConfig {
  const source = unquote(String(spec || '').trim());
  const errors: string[] = [];
  let parsed: Record<string, any> = {};
  if (source.startsWith('{')) {
    try {
      const value = JSON.parse(source);
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value;
      else errors.push('quiz definition must be an object');
    } catch (error) {
      errors.push('quiz definition contains invalid JSON');
    }
  } else {
    parsed = parseCompactSpec(source);
  }

  const boardId = String(parsed.boardId || parsed.board || '').trim();
  if (!boardId) errors.push('boardId is required');
  const rawExpected = parsed.expected || parsed.objects || parsed.objekte || [];
  if (!Array.isArray(rawExpected)) errors.push('expected must be an array');
  const expected = (Array.isArray(rawExpected) ? rawExpected : [])
    .map((value, index) => normalizeExpected(value, index, errors))
    .filter((value): value is ExpectedQuizObject3D => !!value);
  const rawConditions = parsed.conditions || parsed.bedingungen || [];
  if (!Array.isArray(rawConditions)) errors.push('conditions must be an array');
  const conditions = (Array.isArray(rawConditions) ? rawConditions : [])
    .map((value, index) => normalizeCondition(value, index, errors))
    .filter((value): value is QuizCondition3D => !!value);
  if (!expected.length && !conditions.length) errors.push('at least one expected object or condition is required');

  expected.forEach(item => validateExpectedGeometry(item, errors));
  validateDependencyCycles(expected, errors);
  validateConditions(conditions, errors);

  const ids = expected.map(item => String(item.id || ''));
  if (new Set(ids).size !== ids.length) errors.push('expected object ids must be unique');
  const known = new Set(ids);
  conditions.forEach(condition => condition.objects.forEach(id => {
    if (!known.has(id)) errors.push('condition references unknown expected object: ' + id);
  }));

  const maxAttempts = finiteNumber(parsed.maxAttempts);
  if (parsed.maxAttempts != null && (maxAttempts == null || maxAttempts < 1 || !Number.isInteger(maxAttempts))) {
    errors.push('maxAttempts must be a positive integer');
  }
  const hints = Array.isArray(parsed.hints) ? parsed.hints.map(String)
    : (parsed.hints == null ? [] : [String(parsed.hints)]);

  return {
    boardId,
    ...(parsed.quizId == null ? {} : { quizId: String(parsed.quizId) }),
    mode: normalizeMode(parsed.mode),
    expected,
    conditions,
    tolerance: toleranceFrom(parsed.tolerance, errors),
    allowAuxiliary: bool(parsed.allowAuxiliary, true),
    forbidExtra: bool(parsed.forbidExtra, false),
    namesRelevant: bool(parsed.namesRelevant, false),
    visibilityRelevant: bool(parsed.visibilityRelevant, false),
    fixedRelevant: bool(parsed.fixedRelevant, false),
    formattingRelevant: bool(parsed.formattingRelevant, false),
    orderRelevant: bool(parsed.orderRelevant, false),
    includeAuthored: bool(parsed.includeAuthored, false),
    viewPolicy: normalizeViewPolicy(parsed.viewPolicy),
    liveFeedback: bool(parsed.liveFeedback, false),
    ...(maxAttempts != null && maxAttempts >= 1 ? { maxAttempts } : {}),
    hints,
    ...(parsed.solution == null ? {} : { solution: String(parsed.solution) }),
    valid: errors.length === 0,
    errors,
  };
}

export function quiz3DMessageKey(code: QuizEvaluationCode3D): keyof typeof QUIZ3D_MESSAGES.de {
  const mapping: Record<QuizEvaluationCode3D, keyof typeof QUIZ3D_MESSAGES.de> = {
    correct: 'correct', partial: 'partial', 'invalid-config': 'invalidConfig',
    'missing-board': 'missingBoard', 'missing-object': 'missingObject',
    'wrong-type': 'wrongType', 'position-mismatch': 'positionMismatch',
    'size-mismatch': 'sizeMismatch', 'value-mismatch': 'valueMismatch',
    'dependency-mismatch': 'dependencyMismatch', 'condition-mismatch': 'conditionMismatch',
    'extra-object': 'extraObject', degenerate: 'degenerate', undefined: 'undefined',
  };
  return mapping[code];
}

export function formatConstructionQuiz3DFeedback(
  evaluation: Pick<ConstructionQuiz3DEvaluation, 'correct' | 'status' | 'code' | 'issues'>,
  language: string
): string {
  const lang: 'de' | 'en' = normalizedQuizWord3D(language).startsWith('de') ? 'de' : 'en';
  if (evaluation.correct) return QUIZ3D_MESSAGES[lang].correct;
  if (evaluation.status === 'author-error') return QUIZ3D_MESSAGES[lang][quiz3DMessageKey(evaluation.code)];
  const firstIssue = evaluation.issues[0];
  if (firstIssue) return QUIZ3D_MESSAGES[lang][quiz3DMessageKey(firstIssue.code)];
  return evaluation.status === 'partial' ? QUIZ3D_MESSAGES[lang].partial : QUIZ3D_MESSAGES[lang].incorrect;
}

export function emptyConstructionQuiz3DEvaluation(
  code: QuizEvaluationCode3D,
  language = 'de',
  details?: Record<string, unknown>
): ConstructionQuiz3DEvaluation {
  const lang: 'de' | 'en' = normalizedQuizWord3D(language).startsWith('de') ? 'de' : 'en';
  const issue: QuizIssue3D = {
    code, messageKey: quiz3DMessageKey(code), ...(details ? { details } : {})
  };
  const result: ConstructionQuiz3DEvaluation = {
    correct: false,
    status: code === 'invalid-config' ? 'author-error' : 'incorrect',
    code,
    score: 0,
    passedWeight: 0,
    totalWeight: 0,
    matches: [],
    issues: [issue],
    message: '',
    language: lang,
  };
  result.message = formatConstructionQuiz3DFeedback(result, lang);
  return result;
}
