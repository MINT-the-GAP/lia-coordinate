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

export type CombinedQuizCondition =
  | {
      kind: 'construction';
      config: ConstructionQuizConfig;
    }
  | {
      kind: 'metric';
      metricKind: PolygonMetricKind;
      config: PolygonMetricQuizSpec;
    };

export type CombinedQuizSpec = {
  boardId: string;
  corners: number;
  conditions: CombinedQuizCondition[];
  valid: boolean;
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
): CombinedQuizCondition | null {
  const match = String(expression || '').trim().match(/^([^\s(]+)\s*\(([\s\S]*)\)$/);
  if (!match) return null;

  const name = normalizeConditionName(match[1]);
  const argumentsSpec = String(match[2] || '').trim();
  if (!argumentsSpec) return null;

  if (name === 'konstruktion' || name === 'construction') {
    const config = parseConstructionQuizSpec(
      boardId + ';' + corners + ';' + argumentsSpec
    );
    return config.valid ? { kind: 'construction', config } : null;
  }

  let metricKind: PolygonMetricKind | null = null;
  if (name === 'flaeche' || name === 'flache' || name === 'area') {
    metricKind = 'area';
  } else if (name === 'umfang' || name === 'perimeter') {
    metricKind = 'perimeter';
  }
  if (!metricKind || splitTopLevel(argumentsSpec, ';').length !== 2) return null;

  const config = parsePolygonMetricQuizSpec(
    boardId + ';' + corners + ';' + argumentsSpec
  );
  return config.valid ? { kind: 'metric', metricKind, config } : null;
}

export function parseCombinedQuizSpec(spec: string): CombinedQuizSpec {
  const rawSpec = unquote(String(spec || '').trim());
  const parts = splitTopLevel(rawSpec, ';');
  const boardId = unquote(parts[0] || '').trim();
  const corners = parseLocalizedInteger(parts[1]);
  const conditionExpressions = parts.slice(2);
  const conditions: CombinedQuizCondition[] = [];

  if (boardId && Number.isInteger(corners) && corners >= 3) {
    for (const expression of conditionExpressions) {
      const condition = parseCondition(expression, boardId, corners);
      if (!condition) {
        return { boardId, corners, conditions: [], valid: false };
      }
      conditions.push(condition);
    }
  }

  const valid = !!boardId && Number.isInteger(corners) && corners >= 3 &&
    conditions.length > 0 && conditions.length === conditionExpressions.length;
  return { boardId, corners, conditions, valid };
}

export function checkCombinedQuizOnBoard(board: any, config: CombinedQuizSpec): boolean {
  if (!board || !config.valid) return false;

  return getBoardObjects(board).some(function(object) {
    return config.conditions.every(function(condition) {
      if (condition.kind === 'construction') {
        return polygonMatchesConstruction(object, condition.config);
      }
      return polygonMatchesMetric(object, condition.config, condition.metricKind);
    });
  });
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

function applyQuizMetadata(uid: string, spec: string, language?: string): void {
  const node = document.getElementById('combined-quiz-spec-' + uid) as HTMLElement | null;
  if (!node) return;
  node.dataset.spec = String(spec || readQuizSpecNode(node));
  if (language) node.dataset.language = language;
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
    if (!config.valid) return false;
    const board = window.__boards && window.__boards[config.boardId];
    return checkCombinedQuizOnBoard(board, config);
  };

  window.__checkCombinedQuiz = function(uid: string, spec: string): boolean {
    const resolved = resolveQuizSpec(uid, spec);
    if (!resolved || !window.__checkCombinedQuizFromSpec) return false;
    return window.__checkCombinedQuizFromSpec(resolved);
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
      window.__setupCombinedQuiz(
        uid,
        readQuizSpecNode(node),
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
