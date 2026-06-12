// Rekonstruktion subsystem (@Rekonstruktion macro).
// Checks if the current Schar model matches a target expression.

import { splitTopLevel, unquote } from '../shared/parser';
import { scheduleBootstrap } from '../shared/bootstrap';

type RekSpec = {
  boardId: string;
  expr: string;
  eps: number;
};

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

export function init(): void {
  if (window.__rekonstruktionReady) {
    try {
      if (window.__bootstrapRekonstruktion) window.__bootstrapRekonstruktion();
    } catch (e) {}
    return;
  }

  window.__rekonstruktionReady = true;

  window.__checkRekonstruktionFromSpec = function (spec: string): boolean {
    const cfg = parseSpec(spec);
    if (!cfg.boardId || !cfg.expr) return false;

    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) return false;

    const target = compileExpr(cfg.expr);
    if (!target) return false;

    return checkScharAgainstTarget(cfg.boardId, target, cfg.eps);
  };

  window.__setupRekonstruktionQuiz = function (uid: string, spec: string): void {
    const node = document.getElementById('rek-spec-' + uid) as HTMLElement | null;
    if (!node) return;
    node.dataset.spec = String(spec || node.dataset.spec || '');
  };

  window.__checkRekonstruktionQuiz = function (uid: string, spec: string): boolean {
    const node = document.getElementById('rek-spec-' + uid) as HTMLElement | null;
    const resolved = String(spec || node?.dataset.spec || '');
    if (!resolved) return false;
    return !!(window.__checkRekonstruktionFromSpec && window.__checkRekonstruktionFromSpec(resolved));
  };

  window.__bootstrapRekonstruktion = function (): void {
    document.querySelectorAll<HTMLElement>('[id^="rek-spec-"][data-spec]').forEach(function (node) {
      const uid = String(node.id || '').replace(/^rek-spec-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;
      if (window.__setupRekonstruktionQuiz) window.__setupRekonstruktionQuiz(uid, spec);
    });
  };

  scheduleBootstrap(function () {
    try {
      if (window.__bootstrapRekonstruktion) window.__bootstrapRekonstruktion();
    } catch (e) {}
  });
}
