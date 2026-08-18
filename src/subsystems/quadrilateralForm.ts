// Inclusive property checks for special quadrilaterals used by combined quizzes.

import { splitTopLevel, unquote } from '../shared/parser';
import {
  DEFAULT_ANGLE_TOLERANCE,
  DEFAULT_LENGTH_TOLERANCE,
  analyzePolygonGeometry,
  isLearnerDgsPolygon,
  readPolygonCoordinates,
  type PolygonCoordinate,
  type PolygonGeometryAnalysis,
  type PolygonValidationIssue,
} from '../shared/polygonGeometry';

export type QuadrilateralForm =
  | 'parallelogram'
  | 'rectangle'
  | 'rhombus'
  | 'square'
  | 'trapezoid'
  | 'kite';

export type QuadrilateralFormParseError =
  | 'missing-form'
  | 'unknown-form'
  | 'unsupported-attribute'
  | 'empty-exclusive'
  | 'unknown-exclusive-form'
  | 'self-exclusion'
  | 'requires-four-corners';

export type QuadrilateralFormConfig = {
  form: QuadrilateralForm | null;
  exclusions: QuadrilateralForm[];
  valid: boolean;
  error: QuadrilateralFormParseError | null;
  errorValue: string;
};

export type QuadrilateralProperties = Record<QuadrilateralForm, boolean>;

export type QuadrilateralToleranceOptions = {
  lengthTolerance?: number;
  angleTolerance?: number;
  relativeLengthTolerance?: number;
};

export type QuadrilateralValidationIssue =
  | PolygonValidationIssue
  | 'wrong-corner-count'
  | 'unreadable-coordinates'
  | 'not-learner-polygon';

export type QuadrilateralClassification = {
  valid: boolean;
  issue: QuadrilateralValidationIssue | null;
  analysis: PolygonGeometryAnalysis;
  properties: QuadrilateralProperties;
  lengthEqualityTolerance: number;
  angleTolerance: number;
};

export type QuadrilateralFormEvaluation = {
  matches: boolean;
  status: 'match' | 'invalid-spec' | 'invalid-quadrilateral' | 'base-mismatch' | 'excluded';
  config: QuadrilateralFormConfig;
  classification: QuadrilateralClassification | null;
  issue: QuadrilateralValidationIssue | null;
  excludedForm: QuadrilateralForm | null;
  detail: 'parallelism' | 'right-angles' | 'equal-sides' | 'adjacent-equal-sides' | null;
};

/** Internal scale-aware cap; deliberately not a public Form(...) attribute. */
export const FORM_RELATIVE_LENGTH_TOLERANCE = 0.01;
export const FORM_FLOATING_POINT_FACTOR = 64;

const EMPTY_PROPERTIES: QuadrilateralProperties = {
  parallelogram: false,
  rectangle: false,
  rhombus: false,
  square: false,
  trapezoid: false,
  kite: false,
};

const FORM_ALIASES: Record<string, QuadrilateralForm> = {
  parallelogramm: 'parallelogram',
  parallelogram: 'parallelogram',
  rechteck: 'rectangle',
  rectangle: 'rectangle',
  raute: 'rhombus',
  rhombus: 'rhombus',
  quadrat: 'square',
  square: 'square',
  trapez: 'trapezoid',
  trapezoid: 'trapezoid',
  drachenviereck: 'kite',
  kite: 'kite',
};

function normalizeWord(value: unknown): string {
  return unquote(String(value == null ? '' : value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function normalizeQuadrilateralForm(value: unknown): QuadrilateralForm | null {
  return FORM_ALIASES[normalizeWord(value)] || null;
}

function invalidConfig(
  error: QuadrilateralFormParseError,
  errorValue = '',
  form: QuadrilateralForm | null = null,
  exclusions: QuadrilateralForm[] = []
): QuadrilateralFormConfig {
  return { form, exclusions, valid: false, error, errorValue };
}

/** Parse the content inside Form(...). Only `exklusiv` is public. */
export function parseQuadrilateralFormSpec(
  spec: string,
  corners: number
): QuadrilateralFormConfig {
  const rawSpec = unquote(String(spec || '').trim());
  const parts = splitTopLevel(rawSpec, ';');
  const rawForm = unquote(parts[0] || '').trim();
  const form = normalizeQuadrilateralForm(rawForm);

  if (corners !== 4) return invalidConfig('requires-four-corners', String(corners), form);
  if (!rawForm) return invalidConfig('missing-form');
  if (!form) return invalidConfig('unknown-form', rawForm);
  if (parts.length > 2 || /;\s*(?:;|$)/.test(rawSpec)) {
    return invalidConfig('unsupported-attribute', parts.slice(1).join(';'), form);
  }
  if (parts.length === 1) {
    return { form, exclusions: [], valid: true, error: null, errorValue: '' };
  }

  const attribute = String(parts[1] || '').trim().match(/^([^=]+)=(.*)$/);
  if (!attribute || normalizeWord(attribute[1]) !== 'exklusiv') {
    return invalidConfig('unsupported-attribute', String(parts[1] || ''), form);
  }
  const rawExclusive = String(attribute[2] || '').trim();
  if (!rawExclusive) return invalidConfig('empty-exclusive', '', form);
  const values = rawExclusive.split('|');
  if (values.some(function(value) { return !String(value || '').trim(); })) {
    return invalidConfig('empty-exclusive', rawExclusive, form);
  }

  const exclusions: QuadrilateralForm[] = [];
  for (const value of values) {
    const excluded = normalizeQuadrilateralForm(value);
    if (!excluded) {
      return invalidConfig('unknown-exclusive-form', String(value || '').trim(), form, exclusions);
    }
    if (!exclusions.includes(excluded)) exclusions.push(excluded);
  }
  if (exclusions.includes(form)) {
    return invalidConfig('self-exclusion', rawForm, form, exclusions);
  }
  return { form, exclusions, valid: true, error: null, errorValue: '' };
}

function toleranceValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function vectorCross(a: PolygonCoordinate, b: PolygonCoordinate): number {
  return a.x * b.y - a.y * b.x;
}

function edgesAreParallel(
  first: PolygonCoordinate,
  second: PolygonCoordinate,
  firstLength: number,
  secondLength: number,
  angleTolerance: number
): boolean {
  if (!(firstLength > 0) || !(secondLength > 0)) return false;
  const normalizedCross = Math.abs(vectorCross(first, second)) /
    (firstLength * secondLength);
  const angularThreshold = Math.sin(Math.min(90, angleTolerance) * Math.PI / 180);
  return normalizedCross <= angularThreshold + Number.EPSILON * FORM_FLOATING_POINT_FACTOR;
}

function lengthValuesEqual(values: number[], tolerance: number): boolean {
  return Math.max(...values) - Math.min(...values) <= tolerance;
}

/** Classify one coordinate sequence by inclusive quadrilateral properties. */
export function classifyQuadrilateral(
  coordinates: PolygonCoordinate[],
  tolerances: QuadrilateralToleranceOptions = {}
): QuadrilateralClassification {
  const analysis = analyzePolygonGeometry(coordinates);
  const angleTolerance = toleranceValue(
    tolerances.angleTolerance,
    DEFAULT_ANGLE_TOLERANCE
  );
  const lengthTolerance = toleranceValue(
    tolerances.lengthTolerance,
    DEFAULT_LENGTH_TOLERANCE
  );
  const relativeLengthTolerance = toleranceValue(
    tolerances.relativeLengthTolerance,
    FORM_RELATIVE_LENGTH_TOLERANCE
  );

  if (coordinates.length !== 4) {
    return {
      valid: false,
      issue: 'wrong-corner-count',
      analysis,
      properties: { ...EMPTY_PROPERTIES },
      lengthEqualityTolerance: 0,
      angleTolerance,
    };
  }
  if (!analysis.valid) {
    return {
      valid: false,
      issue: analysis.issue,
      analysis,
      properties: { ...EMPTY_PROPERTIES },
      lengthEqualityTolerance: 0,
      angleTolerance,
    };
  }

  const sideLengths = analysis.sideLengths;
  const maximumSide = Math.max(...sideLengths);
  const scaledFloatingPointSlack = Number.EPSILON * FORM_FLOATING_POINT_FACTOR *
    Math.max(1, maximumSide, analysis.scale);
  const lengthEqualityTolerance = Math.min(
    lengthTolerance,
    relativeLengthTolerance * maximumSide
  ) + scaledFloatingPointSlack;
  const vectors = coordinates.map(function(current, index) {
    const next = coordinates[(index + 1) % coordinates.length];
    return { x: next.x - current.x, y: next.y - current.y };
  });
  const parallel02 = edgesAreParallel(
    vectors[0], vectors[2], sideLengths[0], sideLengths[2], angleTolerance
  );
  const parallel13 = edgesAreParallel(
    vectors[1], vectors[3], sideLengths[1], sideLengths[3], angleTolerance
  );
  const rightAngles = analysis.interiorAngles.every(function(angle) {
    const floatingPointSlack = Number.EPSILON * FORM_FLOATING_POINT_FACTOR *
      Math.max(1, Math.abs(angle));
    return Math.abs(angle - 90) <= angleTolerance + floatingPointSlack;
  });
  const allSidesEqual = lengthValuesEqual(sideLengths, lengthEqualityTolerance);
  const kitePairs = (
    Math.abs(sideLengths[0] - sideLengths[1]) <= lengthEqualityTolerance &&
    Math.abs(sideLengths[2] - sideLengths[3]) <= lengthEqualityTolerance
  ) || (
    Math.abs(sideLengths[1] - sideLengths[2]) <= lengthEqualityTolerance &&
    Math.abs(sideLengths[3] - sideLengths[0]) <= lengthEqualityTolerance
  );

  // Close the inclusive mathematical hierarchy explicitly. Near a tolerance
  // boundary, the independent raw predicates can otherwise disagree (for
  // example, a tolerated rhombus whose opposite edges miss the angle limit by
  // a few floating-point units). Exclusions use this same closed property map.
  const rectangle = rightAngles;
  const rhombus = allSidesEqual;
  const square = rectangle && rhombus;
  const parallelogram = (parallel02 && parallel13) || rectangle || rhombus;
  const trapezoid = parallel02 || parallel13 || parallelogram;
  const kite = kitePairs || rhombus;
  const properties: QuadrilateralProperties = {
    parallelogram,
    rectangle,
    rhombus,
    square,
    trapezoid,
    kite,
  };
  return {
    valid: true,
    issue: null,
    analysis,
    properties,
    lengthEqualityTolerance,
    angleTolerance,
  };
}

function baseMismatchDetail(
  form: QuadrilateralForm,
  properties: QuadrilateralProperties
): QuadrilateralFormEvaluation['detail'] {
  if (form === 'parallelogram' || form === 'trapezoid') return 'parallelism';
  if (form === 'rectangle') return 'right-angles';
  if (form === 'rhombus') return 'equal-sides';
  if (form === 'kite') return 'adjacent-equal-sides';
  return properties.rhombus ? 'right-angles' : 'equal-sides';
}

export function evaluateQuadrilateralForm(
  polygon: any,
  config: QuadrilateralFormConfig,
  tolerances: QuadrilateralToleranceOptions = {}
): QuadrilateralFormEvaluation {
  if (!config.valid || !config.form) {
    return {
      matches: false,
      status: 'invalid-spec',
      config,
      classification: null,
      issue: null,
      excludedForm: null,
      detail: null,
    };
  }
  if (!isLearnerDgsPolygon(polygon)) {
    return {
      matches: false,
      status: 'invalid-quadrilateral',
      config,
      classification: null,
      issue: 'not-learner-polygon',
      excludedForm: null,
      detail: null,
    };
  }

  const coordinates = readPolygonCoordinates(polygon);
  if (Array.isArray(polygon.vertices) && polygon.vertices.length && !coordinates.length) {
    return {
      matches: false,
      status: 'invalid-quadrilateral',
      config,
      classification: null,
      issue: 'unreadable-coordinates',
      excludedForm: null,
      detail: null,
    };
  }
  const classification = classifyQuadrilateral(coordinates, tolerances);
  if (!classification.valid) {
    return {
      matches: false,
      status: 'invalid-quadrilateral',
      config,
      classification,
      issue: classification.issue,
      excludedForm: null,
      detail: null,
    };
  }
  if (!classification.properties[config.form]) {
    return {
      matches: false,
      status: 'base-mismatch',
      config,
      classification,
      issue: null,
      excludedForm: null,
      detail: baseMismatchDetail(config.form, classification.properties),
    };
  }

  const excludedForm = config.exclusions.find(function(form) {
    return classification.properties[form];
  }) || null;
  if (excludedForm) {
    return {
      matches: false,
      status: 'excluded',
      config,
      classification,
      issue: null,
      excludedForm,
      detail: null,
    };
  }
  return {
    matches: true,
    status: 'match',
    config,
    classification,
    issue: null,
    excludedForm: null,
    detail: null,
  };
}

export function polygonMatchesQuadrilateralForm(
  polygon: any,
  config: QuadrilateralFormConfig,
  tolerances: QuadrilateralToleranceOptions = {}
): boolean {
  return evaluateQuadrilateralForm(polygon, config, tolerances).matches;
}

export function quadrilateralFormName(
  form: QuadrilateralForm,
  language: 'de' | 'en'
): string {
  const names: Record<QuadrilateralForm, [string, string]> = {
    parallelogram: ['Parallelogramm', 'parallelogram'],
    rectangle: ['Rechteck', 'rectangle'],
    rhombus: ['Raute', 'rhombus'],
    square: ['Quadrat', 'square'],
    trapezoid: ['Trapez', 'trapezoid'],
    kite: ['Drachenviereck', 'kite'],
  };
  return names[form][language === 'de' ? 0 : 1];
}

function invalidSpecMessage(
  config: QuadrilateralFormConfig,
  language: 'de' | 'en'
): string {
  const value = config.errorValue ? ' “' + config.errorValue + '”' : '';
  if (language === 'de') {
    if (config.error === 'requires-four-corners') {
      return 'Form(...) kann nur mit genau vier Eckpunkten verwendet werden.';
    }
    if (config.error === 'unknown-form') return 'Unbekannter Viereckstyp' + value + ' in Form(...).';
    if (config.error === 'unknown-exclusive-form') {
      return 'Unbekannter ausgeschlossener Viereckstyp' + value + ' in Form(...).';
    }
    if (config.error === 'self-exclusion') {
      return 'Die geforderte Grundform darf nicht zugleich über exklusiv ausgeschlossen werden.';
    }
    if (config.error === 'empty-exclusive') return 'exklusiv benötigt mindestens einen Viereckstyp.';
    if (config.error === 'unsupported-attribute') {
      return 'Form(...) unterstützt ausschließlich das optionale Attribut exklusiv.';
    }
    return 'Form(...) benötigt einen bekannten Viereckstyp.';
  }
  if (config.error === 'requires-four-corners') {
    return 'Form(...) can only be used with exactly four vertices.';
  }
  if (config.error === 'unknown-form') return 'Unknown quadrilateral type' + value + ' in Form(...).';
  if (config.error === 'unknown-exclusive-form') {
    return 'Unknown excluded quadrilateral type' + value + ' in Form(...).';
  }
  if (config.error === 'self-exclusion') {
    return 'The required base shape cannot also be excluded with exklusiv.';
  }
  if (config.error === 'empty-exclusive') return 'exklusiv requires at least one quadrilateral type.';
  if (config.error === 'unsupported-attribute') {
    return 'Form(...) supports only the optional exklusiv attribute.';
  }
  return 'Form(...) requires a known quadrilateral type.';
}

export function formatQuadrilateralFormFeedback(
  evaluation: QuadrilateralFormEvaluation,
  language: 'de' | 'en'
): string {
  const config = evaluation.config;
  if (evaluation.status === 'invalid-spec' || !config.form) {
    return invalidSpecMessage(config, language);
  }
  if (evaluation.status === 'invalid-quadrilateral') {
    if (language === 'de') {
      if (evaluation.issue === 'self-intersection') {
        return 'Die Konstruktion ist selbstüberschneidend und bildet kein gültiges Viereck.';
      }
      if (evaluation.issue === 'wrong-corner-count') {
        return 'Die Formbedingung benötigt ein Viereck mit genau vier Eckpunkten.';
      }
      if (evaluation.issue === 'duplicate-corner' || evaluation.issue === 'zero-length-side') {
        return 'Mindestens zwei Eckpunkte sind praktisch identisch; das Viereck ist degeneriert.';
      }
      if (evaluation.issue === 'collinear-corner') {
        return 'Drei aufeinanderfolgende Eckpunkte sind praktisch kollinear und bilden keine echte Ecke.';
      }
      if (evaluation.issue === 'near-zero-area') {
        return 'Der Flächeninhalt ist praktisch null; die Konstruktion bildet kein gültiges Viereck.';
      }
      if (evaluation.issue === 'invalid-coordinate' || evaluation.issue === 'unreadable-coordinates') {
        return 'Mindestens ein Eckpunkt besitzt keine gültigen endlichen Koordinaten.';
      }
      return 'Es wurde noch kein gültiges, nicht degeneriertes Viereck konstruiert.';
    }
    if (evaluation.issue === 'self-intersection') {
      return 'The construction is self-intersecting and does not form a valid quadrilateral.';
    }
    if (evaluation.issue === 'wrong-corner-count') {
      return 'The shape condition requires a quadrilateral with exactly four vertices.';
    }
    if (evaluation.issue === 'duplicate-corner' || evaluation.issue === 'zero-length-side') {
      return 'At least two vertices are practically identical, so the quadrilateral is degenerate.';
    }
    if (evaluation.issue === 'collinear-corner') {
      return 'Three consecutive vertices are practically collinear and do not form a genuine corner.';
    }
    if (evaluation.issue === 'near-zero-area') {
      return 'The area is practically zero, so the construction is not a valid quadrilateral.';
    }
    if (evaluation.issue === 'invalid-coordinate' || evaluation.issue === 'unreadable-coordinates') {
      return 'At least one vertex does not have valid finite coordinates.';
    }
    return 'No valid, non-degenerate quadrilateral has been constructed yet.';
  }
  if (evaluation.status === 'excluded' && evaluation.excludedForm) {
    const name = quadrilateralFormName(evaluation.excludedForm, language);
    return language === 'de'
      ? 'Die Konstruktion erfüllt zwar die Grundform, besitzt aber die ausgeschlossene Form ' + name + '.'
      : 'The construction satisfies the base shape but also has the excluded shape ' + name + '.';
  }
  if (evaluation.status === 'base-mismatch') {
    const name = quadrilateralFormName(config.form, language);
    if (language === 'de') {
      if (evaluation.detail === 'parallelism') {
        const suffix = config.form === 'trapezoid'
          ? 'Kein Paar gegenüberliegender Seiten ist parallel.'
          : 'Die gegenüberliegenden Seiten sind nicht paarweise parallel.';
        return 'Das Viereck ist noch kein ' + name + ': ' + suffix;
      }
      if (evaluation.detail === 'right-angles') {
        return 'Das Viereck ist noch kein ' + name + ': Nicht alle Innenwinkel betragen 90°.';
      }
      if (evaluation.detail === 'adjacent-equal-sides') {
        return 'Das Viereck ist noch kein ' + name + ': Es fehlen zwei verschiedene Paare gleich langer benachbarter Seiten.';
      }
      const article = config.form === 'rhombus' ? 'keine' : 'kein';
      return 'Das Viereck ist noch ' + article + ' ' + name + ': Nicht alle vier Seiten sind gleich lang.';
    }
    if (evaluation.detail === 'parallelism') {
      const suffix = config.form === 'trapezoid'
        ? 'Neither pair of opposite sides is parallel.'
        : 'The opposite sides are not parallel in pairs.';
      return 'The quadrilateral is not yet a ' + name + ': ' + suffix;
    }
    if (evaluation.detail === 'right-angles') {
      return 'The quadrilateral is not yet a ' + name + ': Not all interior angles are 90°.';
    }
    if (evaluation.detail === 'adjacent-equal-sides') {
      return 'The quadrilateral is not yet a ' + name + ': It lacks two distinct pairs of equal adjacent sides.';
    }
    return 'The quadrilateral is not yet a ' + name + ': Not all four sides have equal length.';
  }
  return '';
}
