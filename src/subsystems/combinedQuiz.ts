// Combined polygon quizzes (@KoordQuiz/@GeometrieQuiz and English aliases).
// Every condition is evaluated against the same learner-created polygon.

import { getBoardObjects } from '../shared/boardObjects';
import { scheduleBootstrap } from '../shared/bootstrap';
import { splitTopLevel, unquote } from '../shared/parser';
import {
  parseConstructionQuizSpec,
  polygonMatchesConstruction,
  type ConstructionQuizConfig,
} from './constructionQuiz';
import {
  parsePolygonMetricQuizSpec,
  polygonMatchesMetric,
  type PolygonMetricKind,
  type PolygonMetricQuizSpec,
} from './polygonMetricQuiz';
import {
  evaluateQuadrilateralForm,
  formatQuadrilateralFormFeedback,
  parseQuadrilateralFormSpec,
  type QuadrilateralFormConfig,
  type QuadrilateralFormEvaluation,
} from './quadrilateralForm';
import {
  isLearnerDgsPolygon,
  readPolygonCoordinates,
} from '../shared/polygonGeometry';

export type CombinedQuizCondition =
  | {
      kind: 'construction';
      config: ConstructionQuizConfig;
    }
  | {
      kind: 'metric';
      metricKind: PolygonMetricKind;
      config: PolygonMetricQuizSpec;
    }
  | {
      kind: 'form';
      config: QuadrilateralFormConfig;
    };

export type CombinedQuizParseError =
  | {
      kind: 'invalid-condition';
      expression: string;
      formConfig: null;
    }
  | {
      kind: 'invalid-form';
      expression: string;
      formConfig: QuadrilateralFormConfig;
    };

export type CombinedQuizSpec = {
  boardId: string;
  corners: number;
  conditions: CombinedQuizCondition[];
  valid: boolean;
  /** Present on parser-produced specs; optional for backwards-compatible callers. */
  error?: CombinedQuizParseError | null;
};

export type CombinedQuizEvaluationCode =
  | 'matched'
  | 'invalid-spec'
  | 'missing-board'
  | 'missing-polygon'
  | 'invalid-quadrilateral'
  | 'form-mismatch'
  | 'excluded-form'
  | 'construction-mismatch'
  | 'area-mismatch'
  | 'perimeter-mismatch';

export type CombinedQuizEvaluation = {
  matches: boolean;
  code: CombinedQuizEvaluationCode;
  message: string;
  polygon: any;
  passedConditions: number;
  totalConditions: number;
  conditionIndex: number;
};

type ParsedCondition = {
  condition: CombinedQuizCondition | null;
  error: CombinedQuizParseError | null;
};

function parseLocalizedInteger(value: unknown): number {
  const normalized = unquote(String(value == null ? '' : value))
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function normalizeConditionName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseCondition(
  expression: string,
  boardId: string,
  corners: number
): ParsedCondition {
  const match = String(expression || '').trim().match(/^([^\s(]+)\s*\(([\s\S]*)\)$/);
  if (!match) {
    return {
      condition: null,
      error: { kind: 'invalid-condition', expression, formConfig: null }
    };
  }

  const name = normalizeConditionName(match[1]);
  const argumentsSpec = String(match[2] || '').trim();
  if (name === 'form') {
    const config = parseQuadrilateralFormSpec(argumentsSpec, corners);
    return config.valid
      ? { condition: { kind: 'form', config }, error: null }
      : {
          condition: null,
          error: { kind: 'invalid-form', expression, formConfig: config }
        };
  }

  if (!argumentsSpec) {
    return {
      condition: null,
      error: { kind: 'invalid-condition', expression, formConfig: null }
    };
  }

  if (name === 'konstruktion' || name === 'construction') {
    const config = parseConstructionQuizSpec(
      boardId + ';' + corners + ';' + argumentsSpec
    );
    return config.valid
      ? { condition: { kind: 'construction', config }, error: null }
      : {
          condition: null,
          error: { kind: 'invalid-condition', expression, formConfig: null }
        };
  }

  let metricKind: PolygonMetricKind | null = null;
  if (name === 'flaeche' || name === 'flache' || name === 'area') {
    metricKind = 'area';
  } else if (name === 'umfang' || name === 'perimeter') {
    metricKind = 'perimeter';
  }
  if (!metricKind || splitTopLevel(argumentsSpec, ';').length !== 2) {
    return {
      condition: null,
      error: { kind: 'invalid-condition', expression, formConfig: null }
    };
  }

  const config = parsePolygonMetricQuizSpec(
    boardId + ';' + corners + ';' + argumentsSpec
  );
  return config.valid
    ? { condition: { kind: 'metric', metricKind, config }, error: null }
    : {
        condition: null,
        error: { kind: 'invalid-condition', expression, formConfig: null }
      };
}

export function parseCombinedQuizSpec(spec: string): CombinedQuizSpec {
  const rawSpec = unquote(String(spec || '').trim());
  const parts = splitTopLevel(rawSpec, ';');
  const boardId = unquote(parts[0] || '').trim();
  const corners = parseLocalizedInteger(parts[1]);
  const conditionExpressions = parts.slice(2);
  const conditions: CombinedQuizCondition[] = [];
  let error: CombinedQuizParseError | null = null;

  if (boardId && Number.isInteger(corners)) {
    for (const expression of conditionExpressions) {
      const parsed = parseCondition(expression, boardId, corners);
      if (!parsed.condition) {
        error = parsed.error;
        if (error?.kind === 'invalid-form') {
          return { boardId, corners, conditions: [], valid: false, error };
        }
        return { boardId, corners, conditions: [], valid: false };
      }
      conditions.push(parsed.condition);
    }
  }

  const valid = !!boardId && Number.isInteger(corners) && corners >= 3 &&
    conditions.length > 0 && conditions.length === conditionExpressions.length;
  return error
    ? { boardId, corners, conditions, valid, error }
    : { boardId, corners, conditions, valid };
}

function normalizeLanguage(value: unknown): 'de' | 'en' {
  return String(value == null ? '' : value).trim().toLowerCase() === 'en'
    ? 'en'
    : 'de';
}

function emptyEvaluation(
  code: CombinedQuizEvaluationCode,
  message: string,
  totalConditions: number
): CombinedQuizEvaluation {
  return {
    matches: false,
    code,
    message,
    polygon: null,
    passedConditions: 0,
    totalConditions,
    conditionIndex: -1,
  };
}

function invalidSpecFeedback(
  config: CombinedQuizSpec,
  language: 'de' | 'en'
): string {
  if (config.error?.kind === 'invalid-form' && config.error.formConfig) {
    const evaluation: QuadrilateralFormEvaluation = {
      matches: false,
      status: 'invalid-spec',
      config: config.error.formConfig,
      classification: null,
      issue: null,
      excludedForm: null,
      detail: null,
    };
    return formatQuadrilateralFormFeedback(evaluation, language);
  }
  return language === 'de'
    ? 'Die Quizspezifikation enthält eine unbekannte oder ungültige Bedingung.'
    : 'The quiz specification contains an unknown or invalid condition.';
}

function conditionFailure(
  condition: CombinedQuizCondition,
  conditionIndex: number,
  formEvaluation: QuadrilateralFormEvaluation | null,
  language: 'de' | 'en'
): Pick<CombinedQuizEvaluation, 'code' | 'message' | 'conditionIndex'> {
  if (condition.kind === 'form' && formEvaluation) {
    const code: CombinedQuizEvaluationCode = formEvaluation.status === 'excluded'
      ? 'excluded-form'
      : (formEvaluation.status === 'invalid-quadrilateral'
        ? 'invalid-quadrilateral'
        : 'form-mismatch');
    return {
      code,
      message: formatQuadrilateralFormFeedback(formEvaluation, language),
      conditionIndex,
    };
  }
  if (condition.kind === 'construction') {
    return {
      code: 'construction-mismatch',
      message: language === 'de'
        ? 'Das Viereck erfüllt noch nicht alle geforderten Konstruktionsbedingungen.'
        : 'The quadrilateral does not yet satisfy all required construction conditions.',
      conditionIndex,
    };
  }
  const area = condition.kind === 'metric' && condition.metricKind === 'area';
  return {
    code: area ? 'area-mismatch' : 'perimeter-mismatch',
    message: language === 'de'
      ? (area
        ? 'Die Flächenbedingung ist an diesem Viereck noch nicht erfüllt.'
        : 'Die Umfangsbedingung ist an diesem Viereck noch nicht erfüllt.')
      : (area
        ? 'This quadrilateral does not yet satisfy the required area condition.'
        : 'This quadrilateral does not yet satisfy the required perimeter condition.'),
    conditionIndex,
  };
}

/**
 * Evaluate every condition on one and the same polygon and retain a localized
 * reason for the best learner-created candidate when no polygon succeeds.
 */
export function evaluateCombinedQuizOnBoard(
  board: any,
  config: CombinedQuizSpec,
  languageValue: unknown = 'en'
): CombinedQuizEvaluation {
  const language = normalizeLanguage(languageValue);
  const totalConditions = config.conditions.length;
  const formConditionCount = config.conditions.filter(function(condition) {
    return condition.kind === 'form';
  }).length;
  const hasForm = formConditionCount > 0;
  if (!config.valid) {
    return emptyEvaluation(
      'invalid-spec',
      invalidSpecFeedback(config, language),
      totalConditions
    );
  }
  if (!board) {
    return emptyEvaluation(
      'missing-board',
      language === 'de'
        ? 'Das zugehörige Koordinatensystem ist noch nicht verfügbar.'
        : 'The associated coordinate system is not available yet.',
      totalConditions
    );
  }

  const candidates = getBoardObjects(board).filter(function(object) {
    return isLearnerDgsPolygon(object);
  });
  if (!candidates.length) {
    return emptyEvaluation(
      'missing-polygon',
      language === 'de'
        ? 'Es wurde noch kein geeignetes Viereck konstruiert.'
        : 'No suitable quadrilateral has been constructed yet.',
      totalConditions
    );
  }

  let best: (CombinedQuizEvaluation & { rank: number; diagnosticPriority: number }) | null = null;
  for (const polygon of candidates) {
    const coordinates = readPolygonCoordinates(polygon);
    const cornerRank = coordinates.length === config.corners ? 20 : 0;
    const formEvaluations = config.conditions.map(function(condition) {
      return condition.kind === 'form'
        ? evaluateQuadrilateralForm(polygon, condition.config)
        : null;
    });
    const invalidFormIndex = formEvaluations.findIndex(function(evaluation) {
      return evaluation?.status === 'invalid-quadrilateral';
    });

    if (invalidFormIndex >= 0) {
      const condition = config.conditions[invalidFormIndex];
      const failure = conditionFailure(
        condition,
        invalidFormIndex,
        formEvaluations[invalidFormIndex],
        language
      );
      const candidate = {
        matches: false,
        ...failure,
        polygon,
        passedConditions: 0,
        totalConditions,
        rank: cornerRank,
        diagnosticPriority: 40,
      };
      if (!best || candidate.rank > best.rank ||
          (candidate.rank === best.rank && candidate.diagnosticPriority > best.diagnosticPriority)) {
        best = candidate;
      }
      continue;
    }

    let passedConditions = 0;
    let firstFailure: Pick<CombinedQuizEvaluation, 'code' | 'message' | 'conditionIndex'> | null = null;
    let diagnosticPriority = 0;
    config.conditions.forEach(function(condition, conditionIndex) {
      let matches = false;
      const formEvaluation = formEvaluations[conditionIndex];
      if (condition.kind === 'construction') {
        matches = polygonMatchesConstruction(polygon, condition.config);
      } else if (condition.kind === 'form') {
        matches = !!formEvaluation?.matches;
      } else {
        matches = polygonMatchesMetric(polygon, condition.config, condition.metricKind);
      }
      if (matches) {
        passedConditions += 1;
        return;
      }
      const failure = conditionFailure(condition, conditionIndex, formEvaluation, language);
      const priority = failure.code === 'excluded-form'
        ? 30
        : (failure.code === 'form-mismatch' ? 25 : 20);
      if (!firstFailure || priority > diagnosticPriority) {
        firstFailure = failure;
        diagnosticPriority = priority;
      }
    });

    if (passedConditions === totalConditions) {
      return {
        matches: true,
        code: 'matched',
        message: '',
        polygon,
        passedConditions,
        totalConditions,
        conditionIndex: -1,
      };
    }

    const failure = firstFailure || {
      code: 'invalid-spec' as CombinedQuizEvaluationCode,
      message: invalidSpecFeedback(config, language),
      conditionIndex: -1,
    };
    const matchedFormConditions = formEvaluations.filter(function(evaluation) {
      return evaluation?.matches;
    }).length;
    // Passing another condition remains the primary signal. At equal progress,
    // prefer a valid polygon that already has the requested form, so the next
    // actionable message concerns area/perimeter rather than an unrelated
    // polygon that happens to satisfy a metric.
    const formProgressBonus = hasForm
      ? Math.floor(49 * matchedFormConditions / formConditionCount)
      : 0;
    const validFormCandidateBonus = hasForm ? 30 : 0;
    const rank = passedConditions * 100 + cornerRank +
      validFormCandidateBonus + formProgressBonus;
    const candidate = {
      matches: false,
      ...failure,
      polygon,
      passedConditions,
      totalConditions,
      rank,
      diagnosticPriority,
    };
    if (!best || candidate.rank > best.rank ||
        (candidate.rank === best.rank && candidate.diagnosticPriority > best.diagnosticPriority)) {
      best = candidate;
    }
  }

  if (!best) {
    return emptyEvaluation(
      'missing-polygon',
      language === 'de'
        ? 'Es wurde noch kein geeignetes Viereck konstruiert.'
        : 'No suitable quadrilateral has been constructed yet.',
      totalConditions
    );
  }
  const { rank: _rank, diagnosticPriority: _priority, ...evaluation } = best;
  return evaluation;
}

export function checkCombinedQuizOnBoard(board: any, config: CombinedQuizSpec): boolean {
  return evaluateCombinedQuizOnBoard(board, config).matches;
}

function readQuizSpecNode(node: HTMLElement | null): string {
  if (!node) return '';
  const stored = String(node.dataset.spec || '');
  if (stored) return stored;
  const value = String((node as HTMLTextAreaElement).value || '');
  if (value) return value;
  return String(node.textContent || '');
}

function resolveQuizSpec(uid: string, spec: string): string {
  const node = document.getElementById('combined-quiz-spec-' + uid) as HTMLElement | null;
  return String(spec || readQuizSpecNode(node));
}

function removeRenderedQuizFeedback(uid: string): void {
  document.querySelectorAll<HTMLElement>('.lia-quiz').forEach(function(quiz) {
    if (quiz.dataset.liaCoordinateQuizUid !== uid) return;
    quiz.querySelector('[data-lia-coordinate-quiz-feedback]')?.remove();
  });
}

function applyQuizMetadata(uid: string, spec: string, language?: string): void {
  const node = document.getElementById('combined-quiz-spec-' + uid) as HTMLElement | null;
  if (!node) return;
  const resolvedSpec = String(spec || readQuizSpecNode(node));
  const metadataChanged = node.dataset.spec !== resolvedSpec ||
    (!!language && node.dataset.language !== language);
  if (metadataChanged) {
    delete node.dataset.feedback;
    delete node.dataset.feedbackCode;
    removeRenderedQuizFeedback(uid);
  }
  node.dataset.spec = resolvedSpec;
  if (language) node.dataset.language = language;
}

function storeQuizFeedback(
  uid: string,
  evaluation: CombinedQuizEvaluation,
  enabled: boolean
): void {
  const node = document.getElementById('combined-quiz-spec-' + uid) as HTMLElement | null;
  if (!node) return;
  node.dataset.feedback = enabled && !evaluation.matches ? evaluation.message : '';
  node.dataset.feedbackCode = evaluation.code;
}

export function init(): void {
  if (window.__combinedQuizReady) {
    try {
      if (window.__bootstrapCombinedQuizzes) window.__bootstrapCombinedQuizzes();
    } catch (e) {}
    return;
  }

  window.__combinedQuizReady = true;

  window.__checkCombinedQuizFromSpec = function(spec: string): boolean {
    const config = parseCombinedQuizSpec(spec);
    const board = window.__boards && window.__boards[config.boardId];
    return evaluateCombinedQuizOnBoard(board, config, 'en').matches;
  };

  window.__checkCombinedQuiz = function(uid: string, spec: string): boolean {
    const resolved = resolveQuizSpec(uid, spec);
    if (!resolved) return false;
    const node = document.getElementById('combined-quiz-spec-' + uid) as HTMLElement | null;
    const config = parseCombinedQuizSpec(resolved);
    const board = window.__boards && window.__boards[config.boardId];
    const evaluation = evaluateCombinedQuizOnBoard(
      board,
      config,
      node?.dataset.language || 'en'
    );
    const feedbackEnabled = config.conditions.some(function(condition) {
      return condition.kind === 'form';
    }) || config.error?.kind === 'invalid-form';
    storeQuizFeedback(uid, evaluation, feedbackEnabled);
    return evaluation.matches;
  };

  window.__setupCombinedQuiz = function(
    uid: string,
    spec: string,
    language?: string
  ): void {
    applyQuizMetadata(uid, spec, language);
  };

  window.__bootstrapCombinedQuizzes = function(): void {
    document.querySelectorAll<HTMLElement>('[id^="combined-quiz-spec-"]').forEach(function(node) {
      const uid = String(node.id || '').replace(/^combined-quiz-spec-/, '');
      if (!uid || !window.__setupCombinedQuiz) return;
      const spec = readQuizSpecNode(node);
      const config = parseCombinedQuizSpec(spec);
      if (node.hasAttribute('data-lia-static-claimed') ||
          !config.boardId || !(window.__boards && window.__boards[config.boardId])) {
        delete node.dataset.feedback;
        delete node.dataset.feedbackCode;
        removeRenderedQuizFeedback(uid);
        return;
      }
      window.__setupCombinedQuiz(
        uid,
        spec,
        node.dataset.language
      );
    });
  };

  scheduleBootstrap(function() {
    try {
      if (window.__bootstrapCombinedQuizzes) window.__bootstrapCombinedQuizzes();
    } catch (e) {}
  });
}
