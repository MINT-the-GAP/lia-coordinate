// Rekonstruktion subsystem (@Rekonstruktion macro).
// Checks if the current Schar model matches a target expression.

import { splitTopLevel, unquote } from '../shared/parser';
import { scheduleBootstrap } from '../shared/bootstrap';
import { resolveUiLanguage } from '../shared/language';

type RekSpec = {
  boardId: string;
  expr: string;
  eps: number;
};

type NumericModel = Record<string, number>;

type RawDrawingPoint = { x: number; y: number };
type RawDrawingStroke = { color?: string; points?: RawDrawingPoint[] };

export type RawDrawingCheck = {
  matches: boolean;
  hasDrawing: boolean;
  hasEvaluableDrawing: boolean;
};

type ReconstructionCheck = RawDrawingCheck & {
  hasCandidate: boolean;
  invalid: boolean;
};

export const RAW_DRAWING_TOLERANCE_FACTOR = 1.5;
const MIN_RAW_DRAWING_POINTS = 6;
const MIN_RAW_DRAWING_SAMPLES = 6;
const REGRESSION_ENTRY_KEYS = [
  'analysisEntries', 'quadraticAnalysisEntries', 'cubicAnalysisEntries',
  'quarticAnalysisEntries', 'sinAnalysisEntries', 'expAnalysisEntries',
  'logAnalysisEntries', 'sqrtAnalysisEntries', 'hyperbolaAnalysisEntries',
  'hyperbola2AnalysisEntries'
];

function finiteStrokePoints(stroke: RawDrawingStroke | null | undefined): RawDrawingPoint[] {
  if (!stroke || !Array.isArray(stroke.points)) return [];
  return stroke.points.filter((point) => {
    return !!point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
  }).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
}

function groupRawStrokes(state: any): RawDrawingStroke[][] {
  const groups = new Map<string, RawDrawingStroke[]>();
  const strokes = Array.isArray(state?.strokes) ? state.strokes : [];
  strokes.forEach((stroke: RawDrawingStroke, index: number) => {
    if (!finiteStrokePoints(stroke).length) return;
    const color = String(stroke?.color || '').trim().toLowerCase();
    const key = color || ('stroke-' + index);
    const group = groups.get(key) || [];
    group.push(stroke);
    groups.set(key, group);
  });
  return Array.from(groups.values());
}

function interpolatedStrokeY(stroke: RawDrawingStroke, x: number): number[] {
  const points = finiteStrokePoints(stroke);
  const values: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x < minX || x > maxX) continue;
    const dx = b.x - a.x;
    if (Math.abs(dx) <= 1e-12) {
      if (Math.abs(x - a.x) <= 1e-9) values.push(a.y, b.y);
      continue;
    }
    const t = (x - a.x) / dx;
    values.push(a.y + t * (b.y - a.y));
  }
  return values;
}

/**
 * Compare raw freehand strokes with the reconstruction target without creating
 * a recognized graph object. Strokes of the same color form one candidate so
 * separate branches can still describe one function.
 */
export function checkRawDrawingStates(
  states: any[],
  boardId: string,
  target: (x: number) => number,
  sampleX: number[],
  configuredTolerance: number,
  visibleYRange?: [number, number] | null
): RawDrawingCheck {
  const result: RawDrawingCheck = {
    matches: false,
    hasDrawing: false,
    hasEvaluableDrawing: false
  };
  const tolerance = configuredTolerance * RAW_DRAWING_TOLERANCE_FACTOR;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return result;

  const relevantStates = Array.isArray(states)
    ? states.filter((state) => state && state.boardId === boardId)
    : [];

  for (const state of relevantStates) {
    const groups = groupRawStrokes(state);
    if (groups.length) result.hasDrawing = true;

    for (const strokes of groups) {
      const points = strokes.flatMap(finiteStrokePoints);
      let comparablePoints = 0;
      let allPointsMatch = true;
      for (const point of points) {
        let expected = NaN;
        try { expected = target(point.x); } catch (e) {}
        if (!Number.isFinite(expected)) continue;
        comparablePoints += 1;
        if (Math.abs(point.y - expected) > tolerance) allPointsMatch = false;
      }
      if (comparablePoints < MIN_RAW_DRAWING_POINTS) continue;

      const eligibleSamples = sampleX.filter((x) => {
        let expected = NaN;
        try { expected = target(x); } catch (e) {}
        if (!Number.isFinite(expected)) return false;
        if (!visibleYRange) return true;
        return expected >= visibleYRange[0] - tolerance && expected <= visibleYRange[1] + tolerance;
      });
      const requiredSamples = Math.min(MIN_RAW_DRAWING_SAMPLES, eligibleSamples.length);
      if (!requiredSamples) continue;

      let coveredSamples = 0;
      let matchingSamples = 0;
      for (const x of eligibleSamples) {
        const actualValues = strokes.flatMap((stroke) => interpolatedStrokeY(stroke, x));
        if (!actualValues.length) continue;
        coveredSamples += 1;
        let expected = NaN;
        try { expected = target(x); } catch (e) {}
        if (actualValues.some((actual) => Math.abs(actual - expected) <= tolerance)) {
          matchingSamples += 1;
        }
      }

      if (coveredSamples < requiredSamples) continue;
      result.hasEvaluableDrawing = true;
      if (allPointsMatch && matchingSamples === coveredSamples) {
        result.matches = true;
        return result;
      }
    }
  }

  return result;
}

function isStaticReconstructionTarget(boardId: string, anchor?: HTMLElement | null): boolean {
  if (anchor && anchor.hasAttribute('data-lia-static-claimed')) return true;
  try {
    return !!(
      boardId &&
      window.__coord &&
      typeof window.__coord.isStaticCoordinateBoard === 'function' &&
      window.__coord.isStaticCoordinateBoard(boardId)
    );
  } catch (e) { return false; }
}

function removeGeneratedRegressionAnchor(uid: string): void {
  const node = document.getElementById('regression-ui-' + uid) as HTMLElement | null;
  if (node && node.dataset.liaReconstructionAnchor === '1') node.remove();
}

function ensureRegressionAnchor(uid: string, boardId: string): void {
  const id = 'regression-ui-' + uid;
  let node = document.getElementById(id) as HTMLElement | null;
  if (!node) {
    node = document.createElement('span');
    node.id = id;
    node.style.display = 'none';
    node.dataset.liaReconstructionAnchor = '1';

    const rekNode = document.getElementById('rek-spec-' + uid);
    if (rekNode && rekNode.parentNode) {
      rekNode.parentNode.insertBefore(node, rekNode.nextSibling);
    } else {
      (document.body || document.documentElement).appendChild(node);
    }
  }

  node.dataset.spec = boardId;
}

function ensureRegressionUiForSpec(uid: string, spec: string): void {
  const cfg = parseSpec(spec);
  if (!cfg.boardId) return;
  const rekNode = document.getElementById('rek-spec-' + uid) as HTMLElement | null;
  if (isStaticReconstructionTarget(cfg.boardId, rekNode)) {
    removeGeneratedRegressionAnchor(uid);
    return;
  }

  ensureRegressionAnchor(uid, cfg.boardId);

  const run = () => {
    const current = document.getElementById('rek-spec-' + uid) as HTMLElement | null;
    if (isStaticReconstructionTarget(cfg.boardId, current)) {
      removeGeneratedRegressionAnchor(uid);
      return;
    }
    if (typeof window.__setupRegressionUI === 'function') {
      window.__setupRegressionUI(uid, cfg.boardId);
    }
  };

  run();
  scheduleBootstrap(run);
}

function decodeExprPlaceholders(s: string): string {
  return String(s || '').replace(/\{\{/g, '(').replace(/\}\}/g, ')');
}

function parseSpec(spec: string): RekSpec {
  const parts = splitTopLevel(unquote(String(spec || '').trim()), ';');
  const boardId = parts[0] ? unquote(parts[0]) : '';
  const expr = parts[1] ? decodeExprPlaceholders(unquote(parts[1])) : '';
  const rawEps = parts[2] ? parseFloat(String(parts[2]).replace(',', '.')) : 0.1;
  const eps = Number.isFinite(rawEps) && rawEps > 0 ? rawEps : 0.1;
  return {
    boardId: String(boardId || '').trim(),
    expr: String(expr || '').trim(),
    eps
  };
}

function compileExpr(expr: string): ((x: number) => number) | null {
  let src = String(expr || '').trim();
  if (!src) return null;

  src = src.replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*\(\s*x\s*\)\s*=\s*/i, '');
  src = src.replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*=\s*/i, '');
  src = src.replace(/\^/g, '**');
  src = src.replace(/(\d)\s*([A-Za-z(])/g, '$1*$2');
  src = src.replace(/\)\s*([A-Za-z0-9(])/g, ')*$1');

  try {
    return Function(
      'x',
      `
      const pi = Math.PI;
      const e = Math.E;
      const sin = Math.sin;
      const cos = Math.cos;
      const tan = Math.tan;
      const asin = Math.asin;
      const acos = Math.acos;
      const atan = Math.atan;
      const exp = Math.exp;
      const log = Math.log;
      const ln = Math.log;
      const sqrt = Math.sqrt;
      const abs = Math.abs;
      const floor = Math.floor;
      const ceil = Math.ceil;
      const round = Math.round;
      const min = Math.min;
      const max = Math.max;
      const pow = Math.pow;
      return (${src});
      `
    ) as (x: number) => number;
  } catch (e) {
    return null;
  }
}

function checkScharAgainstTarget(boardId: string, target: (x: number) => number, eps: number): boolean {
  const entries = Object.values(window.__scharEntries || {}).filter((entry: any) => {
    return entry && entry.boardId === boardId && typeof entry.fn === 'function';
  }) as any[];

  if (!entries.length) return false;

  const sampleX = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  for (const entry of entries) {
    let ok = true;

    for (const x of sampleX) {
      let yt = NaN;
      let ys = NaN;

      try { yt = target(x); } catch (e) {}
      try { ys = entry.fn(x, entry.values || {}); } catch (e) {}

      if (!Number.isFinite(yt) || !Number.isFinite(ys) || Math.abs(yt - ys) > eps) {
        ok = false;
        break;
      }
    }

    if (ok) return true;
  }

  return false;
}

function getSampleX(boardId: string): number[] {
  const fallback = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const board = window.__boards && window.__boards[boardId];
  if (!board || typeof board.getBoundingBox !== 'function') return fallback;

  let bb: any = null;
  try { bb = board.getBoundingBox(); } catch (e) {}
  if (!Array.isArray(bb) || bb.length < 4) return fallback;

  const left = Number(bb[0]);
  const right = Number(bb[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return fallback;

  const minX = Math.min(left, right);
  const maxX = Math.max(left, right);
  const width = maxX - minX;
  if (!Number.isFinite(width) || width <= 0) return fallback;

  const samples: number[] = [];
  const n = 13;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    samples.push(minX + (width * t));
  }
  return samples;
}

function getVisibleYRange(boardId: string): [number, number] | null {
  const board = window.__boards && window.__boards[boardId];
  if (!board || typeof board.getBoundingBox !== 'function') return null;
  let bb: any = null;
  try { bb = board.getBoundingBox(); } catch (e) {}
  if (!Array.isArray(bb) || bb.length < 4) return null;
  const top = Number(bb[1]);
  const bottom = Number(bb[3]);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return [Math.min(top, bottom), Math.max(top, bottom)];
}

function comparePredictorToTarget(
  predictor: (x: number) => number,
  target: (x: number) => number,
  sampleX: number[],
  eps: number
): boolean {
  let comparable = 0;

  for (const x of sampleX) {
    let yt = NaN;
    let yp = NaN;
    try { yt = target(x); } catch (e) {}
    try { yp = predictor(x); } catch (e) {}

    if (!Number.isFinite(yt) || !Number.isFinite(yp)) continue;
    comparable += 1;
    if (Math.abs(yt - yp) > eps) return false;
  }

  return comparable >= Math.min(6, sampleX.length);
}

function isFiniteModel(model: NumericModel | null | undefined, keys: string[]): boolean {
  if (!model) return false;
  return keys.every((key) => Number.isFinite(Number(model[key])));
}

function checkRegressionAgainstTarget(boardId: string, target: (x: number) => number, eps: number): boolean {
  const allStates = Object.values(window.__liaRegressionStates || {}).filter((state: any) => {
    return state && state.boardId === boardId;
  }) as any[];

  if (!allStates.length) return false;

  const sampleX = getSampleX(boardId);

  for (const state of allStates) {
    const linearEntries = Array.isArray(state.analysisEntries) ? state.analysisEntries : [];
    for (const entry of linearEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['m', 'n'])) continue;
      const ok = comparePredictorToTarget((x) => model.m * x + model.n, target, sampleX, eps);
      if (ok) return true;
    }

    const quadraticEntries = Array.isArray(state.quadraticAnalysisEntries) ? state.quadraticAnalysisEntries : [];
    for (const entry of quadraticEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['a', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => model.a * (x + model.c) * (x + model.c) + model.d, target, sampleX, eps);
      if (ok) return true;
    }

    const cubicEntries = Array.isArray(state.cubicAnalysisEntries) ? state.cubicAnalysisEntries : [];
    for (const entry of cubicEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['a', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => model.a * x * x * x + model.b * x * x + model.c * x + model.d, target, sampleX, eps);
      if (ok) return true;
    }

    const quarticEntries = Array.isArray(state.quarticAnalysisEntries) ? state.quarticAnalysisEntries : [];
    for (const entry of quarticEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['a', 'b', 'c', 'd', 'f'])) continue;
      const ok = comparePredictorToTarget(
        (x) => model.a * x * x * x * x + model.b * x * x * x + model.c * x * x + model.d * x + model.f,
        target,
        sampleX,
        eps
      );
      if (ok) return true;
    }

    const sinEntries = Array.isArray(state.sinAnalysisEntries) ? state.sinAnalysisEntries : [];
    for (const entry of sinEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['A', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => model.A * Math.sin(model.b * (x + model.c)) + model.d, target, sampleX, eps);
      if (ok) return true;
    }

    const expEntries = Array.isArray(state.expAnalysisEntries) ? state.expAnalysisEntries : [];
    for (const entry of expEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['A', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => model.A * Math.exp(model.b * (x + model.c)) + model.d, target, sampleX, eps);
      if (ok) return true;
    }

    const logEntries = Array.isArray(state.logAnalysisEntries) ? state.logAnalysisEntries : [];
    for (const entry of logEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['A', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => {
        const arg = Math.abs(model.b) * (x + model.c);
        if (!Number.isFinite(arg) || arg <= 0) return NaN;
        return model.A * Math.log(arg) + model.d;
      }, target, sampleX, eps);
      if (ok) return true;
    }

    const sqrtEntries = Array.isArray(state.sqrtAnalysisEntries) ? state.sqrtAnalysisEntries : [];
    for (const entry of sqrtEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['A', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => {
        const arg = Math.abs(model.b) * (x + model.c);
        if (!Number.isFinite(arg) || arg < 0) return NaN;
        return model.A * Math.sqrt(arg) + model.d;
      }, target, sampleX, eps);
      if (ok) return true;
    }

    const hyperbolaEntries = Array.isArray(state.hyperbolaAnalysisEntries) ? state.hyperbolaAnalysisEntries : [];
    for (const entry of hyperbolaEntries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['A', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => {
        const denom = model.b * (x + model.c);
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return NaN;
        return model.A / denom + model.d;
      }, target, sampleX, eps);
      if (ok) return true;
    }

    const hyperbola2Entries = Array.isArray(state.hyperbola2AnalysisEntries) ? state.hyperbola2AnalysisEntries : [];
    for (const entry of hyperbola2Entries) {
      const model = entry && entry.model;
      if (!isFiniteModel(model, ['A', 'b', 'c', 'd'])) continue;
      const ok = comparePredictorToTarget((x) => {
        const t = model.b * x - model.c;
        if (!Number.isFinite(t) || Math.abs(t) < 1e-6) return NaN;
        return model.A / (t * t) + model.d;
      }, target, sampleX, eps);
      if (ok) return true;
    }
  }

  return false;
}

function hasRegressionModel(states: any[]): boolean {
  return states.some((state) => {
    return REGRESSION_ENTRY_KEYS.some((key) => Array.isArray(state?.[key]) && state[key].length > 0);
  });
}

function evaluateReconstructionFromSpec(spec: string): ReconstructionCheck {
  const empty: ReconstructionCheck = {
    matches: false,
    hasDrawing: false,
    hasEvaluableDrawing: false,
    hasCandidate: false,
    invalid: true
  };
  const cfg = parseSpec(spec);
  if (!cfg.boardId || !cfg.expr) return empty;

  const board = window.__boards && window.__boards[cfg.boardId];
  if (!board) return empty;

  const target = compileExpr(cfg.expr);
  if (!target) return empty;

  const scharEntries = Object.values(window.__scharEntries || {}).filter((entry: any) => {
    return entry && entry.boardId === cfg.boardId && typeof entry.fn === 'function';
  }) as any[];
  const regressionStates = Object.values(window.__liaRegressionStates || {}).filter((state: any) => {
    return state && state.boardId === cfg.boardId;
  }) as any[];
  const rawDrawing = checkRawDrawingStates(
    regressionStates,
    cfg.boardId,
    target,
    getSampleX(cfg.boardId),
    cfg.eps,
    getVisibleYRange(cfg.boardId)
  );
  const matches = checkScharAgainstTarget(cfg.boardId, target, cfg.eps) ||
    checkRegressionAgainstTarget(cfg.boardId, target, cfg.eps) ||
    rawDrawing.matches;

  return {
    ...rawDrawing,
    matches,
    hasCandidate: scharEntries.length > 0 ||
      hasRegressionModel(regressionStates) ||
      rawDrawing.hasEvaluableDrawing,
    invalid: false
  };
}

function updateReconstructionFeedback(
  node: HTMLElement | null,
  result: ReconstructionCheck
): void {
  if (!node) return;
  delete node.dataset.feedback;
  delete node.dataset.quizStatus;
  if (result.matches) return;

  const language = resolveUiLanguage(node);
  let message = '';
  if (result.invalid) {
    message = language === 'de'
      ? 'Die Rekonstruktionsaufgabe kann nicht ausgewertet werden.'
      : 'The reconstruction task cannot be evaluated.';
  } else if (result.hasDrawing && !result.hasEvaluableDrawing) {
    message = language === 'de'
      ? 'Die Zeichnung enthält noch nicht genug auswertbare Graphenpunkte.'
      : 'The drawing does not yet contain enough evaluable graph points.';
  } else if (!result.hasCandidate) {
    message = language === 'de'
      ? 'Zeichne zuerst einen auswertbaren Graphen oder erzeuge ein Graphenobjekt.'
      : 'First draw an evaluable graph or create a graph object.';
  }

  if (message) {
    node.dataset.feedback = message;
    node.dataset.quizStatus = 'incorrect';
  }
}

export function init(): void {
  if (window.__rekonstruktionReady) {
    try {
      if (window.__bootstrapRekonstruktion) window.__bootstrapRekonstruktion();
    } catch (e) {}
    return;
  }

  window.__rekonstruktionReady = true;

  window.__checkRekonstruktionFromSpec = function (spec: string): boolean {
    return evaluateReconstructionFromSpec(spec).matches;
  };

  window.__checkReconstructionFromSpec = function (spec: string): boolean {
    return !!(window.__checkRekonstruktionFromSpec && window.__checkRekonstruktionFromSpec(spec));
  };

  window.__setupRekonstruktionQuiz = function (uid: string, spec: string): void {
    const node = document.getElementById('rek-spec-' + uid) as HTMLElement | null;
    if (!node) return;
    const resolved = String(spec || node.dataset.spec || '');
    node.dataset.spec = resolved;
    delete node.dataset.feedback;
    delete node.dataset.quizStatus;
    const cfg = parseSpec(resolved);
    if (isStaticReconstructionTarget(cfg.boardId, node)) {
      removeGeneratedRegressionAnchor(uid);
      return;
    }
    ensureRegressionUiForSpec(uid, resolved);
  };

  window.__setupReconstructionQuiz = function (uid: string, spec: string): void {
    if (window.__setupRekonstruktionQuiz) {
      window.__setupRekonstruktionQuiz(uid, spec);
    }
  };

  window.__checkRekonstruktionQuiz = function (uid: string, spec: string): boolean {
    const node = document.getElementById('rek-spec-' + uid) as HTMLElement | null;
    const resolved = String(spec || node?.dataset.spec || '');
    const result = evaluateReconstructionFromSpec(resolved);
    updateReconstructionFeedback(node, result);
    return result.matches;
  };

  window.__checkReconstructionQuiz = function (uid: string, spec: string): boolean {
    return !!(window.__checkRekonstruktionQuiz && window.__checkRekonstruktionQuiz(uid, spec));
  };

  window.__bootstrapRekonstruktion = function (): void {
    const activeUids = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="rek-spec-"][data-spec]').forEach(function (node) {
      const uid = String(node.id || '').replace(/^rek-spec-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;
      const cfg = parseSpec(spec);
      if (node.hasAttribute('data-lia-static-claimed') ||
          isStaticReconstructionTarget(cfg.boardId, node) ||
          !cfg.boardId || !(window.__boards && window.__boards[cfg.boardId])) {
        removeGeneratedRegressionAnchor(uid);
        return;
      }
      activeUids.add(uid);
      if (window.__setupRekonstruktionQuiz) window.__setupRekonstruktionQuiz(uid, spec);
    });
    document.querySelectorAll<HTMLElement>('[data-lia-reconstruction-anchor="1"]').forEach(function(anchor) {
      const uid = String(anchor.id || '').replace(/^regression-ui-/, '');
      if (!activeUids.has(uid)) anchor.remove();
    });
  };

  window.__bootstrapReconstruction = function (): void {
    if (window.__bootstrapRekonstruktion) {
      window.__bootstrapRekonstruktion();
    }
  };

  scheduleBootstrap(function () {
    try {
      if (window.__bootstrapRekonstruktion) window.__bootstrapRekonstruktion();
    } catch (e) {}
  });
}
