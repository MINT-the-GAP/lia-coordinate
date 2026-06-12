// Schar subsystem (@Schar macro).
// Provides a parameterized function family with sliders.

import { splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

type ScharCfg = {
  name: string;
  variableName: string;
  expr: string;
  boardId: string;
  showTerm: boolean;
  color: string;
};

type ScharEntry = {
  uid: string;
  boardId: string;
  board: any;
  cfg: ScharCfg;
  graph: any;
  dragGraph: any;
  graphLabel: any;
  panel: HTMLElement;
  termEl: HTMLElement;
  contentEl: HTMLElement;
  minBtnEl: HTMLButtonElement;
  miniWrapEl: HTMLElement;
  miniNameEl: HTMLElement;
  miniStripEl: HTMLElement;
  termToggleWrapEl: HTMLElement;
  termToggleEl: HTMLInputElement;
  termVisible: boolean;
  linearMN: { m: string; n: string } | null;
  shiftBC: { b: string; c: string } | null;
  shiftCD: { c: string; d: string } | null;
  polyCoeffDrag: { degreeToParam: Record<number, string>; maxDegree: number } | null;
  stopDrag: (() => void) | null;
  panelScale: number;
  panelMinimized: boolean;
  fn: ((x: number, values: Record<string, number>) => number) | null;
  params: string[];
  values: Record<string, number>;
  slidersByParam: Record<string, HTMLInputElement>;
  dragShiftX: number;
  dragShiftY: number;
  polyBaseByDegree: Record<number, number> | null;
};

const RESERVED = new Set([
  'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'exp', 'log', 'ln', 'sqrt', 'abs',
  'floor', 'ceil', 'round', 'min', 'max', 'pow'
]);

function ensureScharCss(): void {
  ['__lia_schar_css_v3', '__lia_schar_css_v4', '__lia_schar_css_v5'].forEach((id) => {
    const old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  });

  const st = document.createElement('style');
  st.id = '__lia_schar_css_v5';
  st.textContent = `
    .lia-schar-panel{
      position:absolute;
      left:10px;
      top:10px;
      z-index:52;
      min-width:190px;
      max-width:none;
      padding:8px 10px;
      border-radius:10px;
      box-sizing:border-box;
      font-family:inherit;
      transform-origin:top left;
      transform:scale(1);
      overflow:visible;
    }

    .lia-schar-head{
      display:flex;
      align-items:center !important;
      justify-content:space-between;
      gap:8px;
      margin-bottom:6px;
      margin-top:6px;
      font-size:10px;
      font-weight:600;
      line-height:1.2;
    }

    .lia-schar-title{
      font-size:11px;
      font-weight:700;
      margin-right:6px;
      white-space:nowrap;
      flex:1;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .lia-schar-min-btn{
      position:absolute;
      top:2px;
      right:2px;
      border:none;
      background:transparent;
      color: var(--lia-schar-accent, #0b5fff);
      width:24px;
      height:24px;
      cursor:pointer;
      font-size:25px;
      font-weight:900 !important;
      -webkit-text-stroke:4px currentColor;
      text-shadow:0 0 0 currentColor, 0 0 1px currentColor;
      line-height:1;
      padding:0;
      display:flex;
      align-items:center;
      justify-content:center;
      user-select:none;
      z-index:6;
      pointer-events:auto;
      box-shadow:none;
      appearance:none;
      -webkit-appearance:none;
    }

    .lia-schar-content{
      display:block;
    }

    .lia-schar-panel.is-minimized .lia-schar-content{
      display:none;
    }

    .lia-schar-slider{
      width:100%;
      flex:1;
      margin:0;
      margin-left:12px !important;
      margin-right:10px !important;
      position:relative;
      top:8px;
      transform:none !important;
      -webkit-appearance:none !important;
      -moz-appearance:none !important;
      appearance:none !important;
      color: var(--lia-schar-accent, #0b5fff) !important;
      background: linear-gradient(
        to right,
        var(--lia-schar-accent, #0b5fff) 0 var(--lia-schar-fill, 50%),
        rgba(128,128,128,.65) var(--lia-schar-fill, 50%) 100%
      ) !important;
      height:12px;
      min-height:12px;
      border-radius:999px !important;
      padding:0 !important;
      border:0 !important;
      outline:none !important;
      box-shadow:none !important;
      background-size:100% 5px !important;
      background-repeat:no-repeat !important;
      background-position:center !important;
    }

    .lia-schar-term-toggle-row{
      display:inline-flex;
      align-items:center;
      gap:6px;
      line-height:1;
    }

    .lia-schar-term-toggle-row > span{
      display:inline-flex;
      align-items:center;
    }

    .lia-schar-term-toggle-row .lia-schar-term-toggle{
      margin:0;
    }

    .lia-schar-slider::-webkit-slider-thumb{
      width:4px;
      height:4px;
      margin-top:0;
      -webkit-appearance:none !important;
      appearance:none !important;
      border:none !important;
      border-radius:50%;
      background: currentColor !important;
      box-shadow:none !important;
    }

    .lia-schar-slider::-webkit-slider-runnable-track{
      height:5px;
      background: transparent !important;
      border:none;
      border-radius:999px;
      box-shadow:none;
    }

    .lia-schar-slider::-moz-range-thumb{
      width:4px;
      height:4px;
      border:none !important;
      border-radius:50%;
      background: currentColor !important;
      box-shadow:none !important;
    }

    .lia-schar-slider::-moz-range-track{
      height:5px;
      background: rgba(128,128,128,.65) !important;
      border:none;
      border-radius:999px;
      box-shadow:none;
    }

    .lia-schar-slider::-moz-range-progress{
      height:5px;
      background: var(--lia-schar-accent, #0b5fff) !important;
      border:none;
      border-radius:999px;
      box-shadow:none;
    }

    .lia-schar-value{
      min-width:40px;
      text-align:right;
      font-variant-numeric: tabular-nums;
      line-height:1.2;
      margin-left:8px;
    }

    .lia-schar-param-label{
      min-width:18px;
      text-align:right;
      font-weight:600;
      display:inline-block;
      white-space:nowrap;
      line-height:1.2;
      font-size:10px !important;
      margin-right:6px;
    }

    .lia-schar-param-label mjx-container,
    .lia-schar-term mjx-container{
      font-size:1.08em !important;
      line-height:1.2 !important;
    }

    .lia-schar-mini-wrap{
      display:none;
      align-items:center;
      justify-content:center;
      gap:0;
      pointer-events:auto;
    }

    .lia-schar-mini-name{
      font-size:16px;
      line-height:1;
      white-space:nowrap;
      cursor:pointer;
      pointer-events:auto;
      display:none;
    }

    .lia-schar-mini-strip{
      width:22px;
      height:4px;
      border-radius:99px;
      background: var(--lia-schar-accent, #0b5fff);
      margin:0;
      cursor:pointer;
      pointer-events:auto;
    }

    .lia-schar-term{
      margin-top:8px;
      font-size:18px !important;
      line-height:1.2;
      word-break:normal;
      white-space:nowrap;
      overflow-wrap:normal;
      text-align:left;
    }

    .lia-schar-term-line{
      display:block;
      width:100%;
      text-align:left;
    }

    .lia-schar-term-line mjx-container,
    .lia-schar-term mjx-container{
      text-align:left !important;
      margin-left:0 !important;
      margin-right:auto !important;
      display:inline-block !important;
    }

    .lia-schar-resize-handle{
      position:absolute;
      right:0;
      bottom:0;
      width:15px;
      height:15px;
      cursor:nwse-resize;
      border-right:2px solid var(--lia-schar-accent, #0b5fff);
      border-bottom:2px solid var(--lia-schar-accent, #0b5fff);
      border-bottom-right-radius:8px;
      box-sizing:border-box;
      z-index:5;
      pointer-events:auto;
      user-select:none;
      touch-action:none;
      background:transparent;
    }
  `;

  (document.head || document.documentElement).appendChild(st);
}

function decodeExprPlaceholders(s: string): string {
  return String(s || '').replace(/\{\{/g, '(').replace(/\}\}/g, ')');
}

function parseBoolFlag(value: string, fallback: boolean): boolean {
  const raw = String(value || '').trim().toLowerCase().replace(/^term\s*=\s*/, '');
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'ja' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'nein' || raw === 'no') return false;
  return fallback;
}

function looksLikeColor(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^#|^rgb\(|^rgba\(|^hsl\(|^hsla\(|^[a-z]+$/i.test(raw);
}

function parseScharSpec(spec: string): ScharCfg {
  const raw = unquote(String(spec || '').trim());
  const parts = splitTopLevel(raw, ';');

  const cfg: ScharCfg = {
    name: parts[0] ? unquote(parts[0]) : 'f',
    variableName: parts[1] ? unquote(parts[1]) : 'x',
    expr: parts[2] ? decodeExprPlaceholders(unquote(parts[2])) : '',
    boardId: parts[3] ? unquote(parts[3]) : '',
    showTerm: true,
    color: '#0b5fff'
  };

  if (parts[4] && looksLikeColor(unquote(parts[4]))) {
    cfg.color = unquote(parts[4]);
    if (parts[5]) cfg.showTerm = parseBoolFlag(unquote(parts[5]), true);
  } else {
    if (parts[4]) cfg.showTerm = parseBoolFlag(unquote(parts[4]), true);
    if (parts[5] && looksLikeColor(unquote(parts[5]))) cfg.color = unquote(parts[5]);
  }

  cfg.name = String(cfg.name || 'f').trim() || 'f';
  cfg.variableName = String(cfg.variableName || 'x').trim() || 'x';
  cfg.expr = String(cfg.expr || '').trim();
  cfg.boardId = String(cfg.boardId || '').trim();
  cfg.color = String(cfg.color || '#0b5fff').trim() || '#0b5fff';

  return cfg;
}

function extractParams(expr: string, variableName: string): string[] {
  const variable = String(variableName || 'x').toLowerCase();
  const variableRaw = String(variableName || 'x').trim() || 'x';
  const seen = new Set<string>();
  const out: string[] = [];

  String(expr || '').replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, function (_, token: string) {
    let normalized = String(token || '');
    const lower = normalized.toLowerCase();

    // Legacy compact notation like mx+n should expose m as parameter and x as variable.
    if (lower.endsWith(variable) && lower.length > variable.length) {
      normalized = normalized.slice(0, normalized.length - variableRaw.length);
    }

    const normalizedLower = normalized.toLowerCase();
    if (lower === variable || RESERVED.has(lower)) return '';
    if (!normalized || normalizedLower === variable || RESERVED.has(normalizedLower)) return '';
    if (seen.has(normalized)) return '';
    seen.add(normalized);
    out.push(normalized);
    return '';
  });

  return out.slice(0, 6);
}

function toJsExpr(expr: string, variableName: string, params: string[]): string {
  let src = String(expr || '').trim();

  src = src.replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*\(\s*[^)]*\)\s*=\s*/i, '');
  src = src.replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*=\s*/i, '');
  src = src.replace(/\^/g, '**');
  src = src.replace(/(\d)\s*([A-Za-z(])/g, '$1*$2');
  src = src.replace(/\)\s*([A-Za-z0-9(])/g, ')*$1');
  src = src.replace(new RegExp('\\b' + variableName + '\\s*\\(', 'g'), variableName + '*(');

  // Legacy-friendly implicit multiplication for parameterized families:
  // mx+n  -> m*x+n
  // m(x+1)-> m*(x+1)
  const varEsc = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  params.forEach((param) => {
    const pEsc = String(param || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!pEsc) return;

    src = src.replace(new RegExp('(^|[^A-Za-z0-9_])' + pEsc + '\\s*' + varEsc + '\\b', 'g'), '$1' + param + '*' + variableName);
    src = src.replace(new RegExp('(^|[^A-Za-z0-9_])' + pEsc + '\\s*\\(', 'g'), '$1' + param + '*(');

    // Allow legacy forms like "A sin(...)" or "A e^(...)".
    src = src.replace(new RegExp('(^|[^A-Za-z0-9_])' + pEsc + '\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(', 'g'), '$1' + param + '*$2(');
    src = src.replace(new RegExp('(^|[^A-Za-z0-9_])' + pEsc + '\\s+([A-Za-z_][A-Za-z0-9_]*)\\b', 'g'), '$1' + param + '*$2');
  });

  return src;
}

function compileFamilyExpr(expr: string, variableName: string, params: string[]) {
  const jsExpr = toJsExpr(expr, variableName, params);

  try {
    const mapBody = params
      .map((p) => `const ${p} = Number(values[${JSON.stringify(p)}] ?? 0);`)
      .join('\n');

    return Function(
      '__x',
      'values',
      `
      const ${variableName} = Number(__x);
      ${mapBody}
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
      return (${jsExpr});
      `
    ) as (x: number, values: Record<string, number>) => number;
  } catch (e) {
    return null;
  }
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v - Math.round(v)) < 1e-8) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

function escapeRegExp(s: string): string {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMathJaxEngine(): any {
  try {
    if (window.MathJax) return window.MathJax;
  } catch (e) {}

  try {
    if (window.parent && window.parent.MathJax) return window.parent.MathJax;
  } catch (e) {}

  return null;
}

function typesetMathNode(node: HTMLElement): Promise<void> {
  const MJ = getMathJaxEngine();
  if (!MJ || typeof MJ.typesetPromise !== 'function') return Promise.resolve();

  try {
    return MJ.typesetPromise([node]).then(function () {}).catch(function () {});
  } catch (e) {}

  return Promise.resolve();
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function replaceNamedFunctionCalls(src: string, fnName: string, texName: string, asSqrt: boolean): string {
  let out = String(src || '');
  let i = 0;

  while (i < out.length) {
    const idx = out.indexOf(fnName, i);
    if (idx < 0) break;

    const before = idx > 0 ? out[idx - 1] : '';
    if (/[A-Za-z0-9_]/.test(before)) {
      i = idx + fnName.length;
      continue;
    }

    let open = idx + fnName.length;
    while (open < out.length && /\s/.test(out[open])) open += 1;
    if (open >= out.length || out[open] !== '(') {
      i = idx + fnName.length;
      continue;
    }

    const close = findMatchingParen(out, open);
    if (close < 0) {
      i = open + 1;
      continue;
    }

    const inner = out.slice(open + 1, close);
    const repl = asSqrt
      ? texName + '{' + inner + '}'
      : texName + '\\left(' + inner + '\\right)';

    out = out.slice(0, idx) + repl + out.slice(close + 1);
    i = idx + repl.length;
  }

  return out;
}

function replaceParenExponents(src: string): string {
  let out = String(src || '');
  let i = 0;

  while (i < out.length) {
    const hat = out.indexOf('^', i);
    if (hat < 0) break;

    let open = hat + 1;
    while (open < out.length && /\s/.test(out[open])) open += 1;
    if (open >= out.length || out[open] !== '(') {
      i = hat + 1;
      continue;
    }

    const close = findMatchingParen(out, open);
    if (close < 0) {
      i = open + 1;
      continue;
    }

    const inner = out.slice(open + 1, close);
    const repl = '^{' + inner + '}';
    out = out.slice(0, hat) + repl + out.slice(close + 1);
    i = hat + repl.length;
  }

  return out;
}

function stripOuterParens(s: string): string {
  const raw = String(s || '').trim();
  if (!raw.startsWith('(') || !raw.endsWith(')')) return raw;
  const end = findMatchingParen(raw, 0);
  if (end !== raw.length - 1) return raw;
  return raw.slice(1, -1).trim();
}

function replaceDivWithDfrac(src: string): string {
  let out = String(src || '');
  let i = 0;

  const readLeft = (slash: number): { start: number; end: number } | null => {
    let j = slash - 1;
    while (j >= 0 && /\s/.test(out[j])) j -= 1;
    if (j < 0) return null;

    let start = j;
    let end = j + 1;
    if (out[j] === ')') {
      let depth = 0;
      for (; start >= 0; start -= 1) {
        if (out[start] === ')') depth += 1;
        else if (out[start] === '(') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (start < 0) return null;
    } else {
      while (start >= 0 && /[A-Za-z0-9_.,]/.test(out[start])) start -= 1;
      start += 1;
      if (start >= end) return null;
    }

    return { start, end };
  };

  const readRight = (slash: number): { start: number; end: number } | null => {
    let start = slash + 1;
    while (start < out.length && /\s/.test(out[start])) start += 1;
    if (start >= out.length) return null;

    if (out[start] === '(') {
      const endMatch = findMatchingParen(out, start);
      if (endMatch < 0) return null;
      return { start, end: endMatch + 1 };
    }

    let end = start;
    while (end < out.length && /[A-Za-z0-9_.,]/.test(out[end])) end += 1;
    if (end <= start) return null;
    return { start, end };
  };

  while (i < out.length) {
    const slash = out.indexOf('/', i);
    if (slash < 0) break;

    const left = readLeft(slash);
    const right = readRight(slash);
    if (!left || !right) {
      i = slash + 1;
      continue;
    }

    const num = stripOuterParens(out.slice(left.start, left.end));
    const den = stripOuterParens(out.slice(right.start, right.end));
    if (!num || !den) {
      i = slash + 1;
      continue;
    }

    const repl = '\\dfrac{' + num + '}{' + den + '}';
    out = out.slice(0, left.start) + repl + out.slice(right.end);
    i = left.start + repl.length;
  }

  return out;
}

function toTexExpr(expr: string): string {
  let out = String(expr || '').trim();
  if (!out) return '';

  out = out.replace(/\*\*/g, '^');
  out = replaceNamedFunctionCalls(out, 'sqrt', '\\sqrt', true);
  out = replaceNamedFunctionCalls(out, 'sin', '\\sin', false);
  out = replaceNamedFunctionCalls(out, 'ln', '\\ln', false);
  out = replaceParenExponents(out);
  out = replaceDivWithDfrac(out);
  out = out.replace(/\^\s*([A-Za-z]+|\d+(?:[.,]\d+)?)/g, '^{$1}');
  out = out.replace(/\*/g, ' \\cdot ');
  out = out.replace(/(^|[^\w])(-?\d+)\.(\d+)/g, '$1$2,$3');

  // Hide neutral zero terms in rendered expressions (e.g., +0, -0).
  out = out.replace(/^0(?:[.,]0+)?\s*\+\s*/g, '');
  out = out.replace(/^0(?:[.,]0+)?\s*-\s*/g, '-');
  out = out.replace(/\s*\+\s*0(?:[.,]0+)?(?=\s*(?:$|[+\-]))/g, '');
  out = out.replace(/\s*-\s*0(?:[.,]0+)?(?=\s*(?:$|[+\-]))/g, '');

  // Collapse neutral parenthesized shifts such as (x+0) or \left(x-0\right).
  out = out.replace(/\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[+\-]\s*0(?:[.,]0+)?\s*\)/g, '$1');
  out = out.replace(/\\left\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[+\-]\s*0(?:[.,]0+)?\s*\\right\)/g, '$1');

  out = out.replace(/\s+/g, ' ').trim();
  out = out.replace(/\+\s*-/g, '- ');

  if (!out) return '0';

  return out;
}

function toTexName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return '\\(f\\)';
  if (raw.includes('\\(') || raw.includes('\\[') || raw.includes('$')) return raw;
  return '\\(' + raw + '\\)';
}

function getExpandedTexForEntry(entry: ScharEntry): string {
  let rhs = String(entry.cfg.expr || '');
  entry.params.forEach((name) => {
    rhs = substituteParamInTerm(rhs, name, entry.cfg.variableName, fmtNum(entry.values[name]));
  });
  return toTexExpr(rhs);
}

function refreshPolyBaseFromCurrent(entry: ScharEntry): void {
  if (!entry.polyCoeffDrag) {
    entry.polyBaseByDegree = null;
    return;
  }

  const base: Record<number, number> = {};
  Object.keys(entry.polyCoeffDrag.degreeToParam).forEach((degKey) => {
    const deg = Number(degKey);
    const pname = entry.polyCoeffDrag!.degreeToParam[deg];
    base[deg] = Number(entry.values[pname] ?? 0);
  });
  entry.polyBaseByDegree = base;
}

function buildShiftedPolyTex(entry: ScharEntry): string | null {
  if (!entry.polyCoeffDrag) return null;

  const xVar = String(entry.cfg.variableName || 'x').trim() || 'x';
  const shift = Number(entry.dragShiftX || 0);
  const n = -shift;
  let raw = String(entry.cfg.expr || '');
  const dMap = entry.polyCoeffDrag.degreeToParam;

  entry.params.forEach((name) => {
    const value = Number(entry.values[name] ?? 0);

    raw = substituteParamInTerm(raw, name, xVar, fmtNum(value));
  });

  const abs = Math.abs(n);
  if (abs > 1e-12) {
    const nSign = n >= 0 ? '+' : '-';
    const nVal = fmtNum(abs);
    const vEsc = escapeRegExp(xVar);
    raw = raw.replace(new RegExp('\\b' + vEsc + '\\b', 'g'), '(' + xVar + nSign + nVal + ')');
  }

  return toTexExpr(raw);
}

function buildExpandedShiftedPolyTex(entry: ScharEntry): string | null {
  if (!entry.polyCoeffDrag) return null;

  const maxN = entry.polyCoeffDrag.maxDegree;
  const xVar = String(entry.cfg.variableName || 'x').trim() || 'x';
  const n = -Number(entry.dragShiftX || 0);
  const coeffs: Record<number, number> = {};

  Object.keys(entry.polyCoeffDrag.degreeToParam).forEach((degKey) => {
    const deg = Number(degKey);
    const pname = entry.polyCoeffDrag!.degreeToParam[deg];
    coeffs[deg] = Number(entry.values[pname] ?? 0);
  });

  const expanded: Record<number, number> = {};
  for (let j = 0; j <= maxN; j += 1) {
    let sum = 0;
    for (let k = j; k <= maxN; k += 1) {
      sum += Number(coeffs[k] ?? 0) * binom(k, j) * Math.pow(n, k - j);
    }
    expanded[j] = sum;
  }

  const parts: string[] = [];
  for (let p = maxN; p >= 0; p -= 1) {
    const c = Number(expanded[p] ?? 0);
    if (!Number.isFinite(c) || Math.abs(c) < 1e-12) continue;

    const isFirst = parts.length === 0;
    const sign = c < 0 ? '-' : (isFirst ? '' : '+');
    const absC = Math.abs(c);
    const nearOne = Math.abs(absC - 1) < 1e-12;

    if (p === 0) {
      parts.push(sign + fmtNum(absC));
    } else {
      const coefPart = nearOne ? '' : fmtNum(absC) + '*';
      parts.push(sign + coefPart + xVar + (p > 1 ? '^' + String(p) : ''));
    }
  }

  if (!parts.length) return '0';
  return toTexExpr(parts.join(''));
}

function getSafeBoundingBox(board: any): [number, number, number, number] {
  try {
    const bb = board && typeof board.getBoundingBox === 'function' ? board.getBoundingBox() : null;
    if (
      Array.isArray(bb) &&
      bb.length === 4 &&
      bb.every((v: any) => Number.isFinite(v)) &&
      bb[2] > bb[0] &&
      bb[1] > bb[3]
    ) {
      return [bb[0], bb[1], bb[2], bb[3]];
    }
  } catch (e) {}
  return [-5, 5, 5, -5];
}

function chooseVisibleAnchorX(board: any, fn: (x: number) => number): number {
  const bb = getSafeBoundingBox(board);
  const xmin = bb[0];
  const ymax = bb[1];
  const xmax = bb[2];
  const ymin = bb[3];

  const xspan = xmax - xmin;
  const yspan = ymax - ymin;

  const xStart = xmax - 0.10 * xspan;
  const xEnd = xmin + 0.18 * xspan;

  const yPadTop = 0.14 * yspan;
  const yPadBottom = 0.12 * yspan;

  const steps = 120;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = xStart - t * (xStart - xEnd);

    let y = NaN;
    try {
      y = fn(x);
    } catch (e) {}

    if (!Number.isFinite(y)) continue;
    if (y <= ymax - yPadTop && y >= ymin + yPadBottom) return x;
  }

  return xmin + 0.60 * xspan;
}

function createPinnedGraphLabel(entry: ScharEntry): any {
  const board = entry.board;
  const fn = function (x: number): number {
    try {
      if (!entry.fn) return NaN;
      const xEval = entry.polyCoeffDrag ? (x - Number(entry.dragShiftX || 0)) : x;
      const y = entry.fn(xEval, entry.values);
      return Number.isFinite(y) ? y : NaN;
    } catch (e) {
      return NaN;
    }
  };

  return board.create('text', [
    function () {
      return chooseVisibleAnchorX(board, fn) + 0.18;
    },
    function () {
      const x = chooseVisibleAnchorX(board, fn);
      const y = fn(x);
      if (Number.isFinite(y)) return y + 0.18;

      const bb = getSafeBoundingBox(board);
      return (bb[1] + bb[3]) / 2;
    },
    function () {
      return toTexName(entry.cfg.name || 'f');
    }
  ], {
    fixed: true,
    highlight: false,
    parse: false,
    useMathJax: true,
    display: 'html',
    strokeColor: entry.cfg.color,
    fillColor: entry.cfg.color,
    fontSize: 24,
    anchorX: 'left',
    anchorY: 'top'
  });
}

function substituteParamInTerm(rawExpr: string, paramName: string, variableName: string, valueText: string): string {
  let out = String(rawExpr || '');
  const pEsc = escapeRegExp(paramName);
  const vEsc = escapeRegExp(variableName);

  // Replace standalone parameter tokens.
  out = out.replace(new RegExp('\\b' + pEsc + '\\b', 'g'), valueText);

  // Compact notation: mx -> 2*x, so downstream zero-term pruning and x-shift replacement work reliably.
  out = out.replace(new RegExp('(^|[^A-Za-z0-9_])' + pEsc + '(?=' + vEsc + '\\b)', 'g'), '$1' + valueText + '*');

  // Parameter before parentheses: m(x+1) -> 2*(x+1)
  out = out.replace(new RegExp('(^|[^A-Za-z0-9_])' + pEsc + '(?=\\s*\\()', 'g'), '$1' + valueText + '*');

  return out;
}

function updateSliderFill(slider: HTMLInputElement): void {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const val = Number(slider.value);
  const span = Number.isFinite(max - min) && (max - min) > 0 ? (max - min) : 1;
  const ratio = Math.max(0, Math.min(1, (val - min) / span));
  slider.style.setProperty('--lia-schar-fill', Math.round(ratio * 1000) / 10 + '%', 'important');
}

function ensureSliderRangeForValue(slider: HTMLInputElement, value: number): void {
  if (!Number.isFinite(value)) return;

  let min = Number(slider.min);
  let max = Number(slider.max);
  const stepRaw = Number(slider.step);
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 0.1;

  if (!Number.isFinite(min)) min = -10;
  if (!Number.isFinite(max)) max = 10;
  if (max <= min) max = min + 1;

  if (value < min) {
    const pad = Math.max((max - min) * 0.25, Math.abs(value) * 0.15, 2);
    min = Math.floor((value - pad) / step) * step;
  }

  if (value > max) {
    const pad = Math.max((max - min) * 0.25, Math.abs(value) * 0.15, 2);
    max = Math.ceil((value + pad) / step) * step;
  }

  slider.min = String(min);
  slider.max = String(max);
}

function getScharStateStore(): Record<string, any> {
  window.__liaScharStateStore = window.__liaScharStateStore || {};
  return window.__liaScharStateStore;
}

function getScharStateKey(uid: string, boardId: string): string {
  return String(uid || '') + '::' + String(boardId || '');
}

function persistScharEntryState(entry: ScharEntry): void {
  const key = getScharStateKey(entry.uid, entry.boardId);
  getScharStateStore()[key] = {
    values: Object.assign({}, entry.values),
    panelScale: Number(entry.panelScale || 1),
    panelMinimized: !!entry.panelMinimized,
    termVisible: !!entry.termVisible
  };
}

function restoreScharEntryState(entry: ScharEntry): void {
  const key = getScharStateKey(entry.uid, entry.boardId);
  const raw = getScharStateStore()[key];
  if (!raw || typeof raw !== 'object') return;

  const restoredValues = raw.values;
  if (restoredValues && typeof restoredValues === 'object') {
    entry.params.forEach((name) => {
      const v = Number(restoredValues[name]);
      if (Number.isFinite(v)) entry.values[name] = v;
    });
  }

  const scale = Number(raw.panelScale);
  if (Number.isFinite(scale)) {
    entry.panelScale = Math.max(0.55, Math.min(1.45, scale));
  }

  entry.panelMinimized = !!raw.panelMinimized;
  if (typeof raw.termVisible === 'boolean') {
    entry.termVisible = !!raw.termVisible;
  }
}

function eventToUser(board: any, evt: PointerEvent): { x: number; y: number } {
  const rect = board.containerObj.getBoundingClientRect();
  const lx = evt.clientX - rect.left;
  const ly = evt.clientY - rect.top;

  return {
    x: (lx - board.origin.scrCoords[1]) / board.unitX,
    y: (board.origin.scrCoords[2] - ly) / board.unitY
  };
}

function detectLinearMN(cfg: ScharCfg, params: string[]): { m: string; n: string } | null {
  const m = params.find((p) => String(p).toLowerCase() === 'm');
  const n = params.find((p) => String(p).toLowerCase() === 'n');
  if (!m || !n) return null;

  const expr = toJsExpr(cfg.expr, cfg.variableName, params).replace(/\s+/g, '');
  const rawExpr = String(cfg.expr || '').replace(/\{\{|\}\}/g, '').replace(/\s+/g, '').toLowerCase();
  const mEsc = escapeRegExp(m);
  const nEsc = escapeRegExp(n);
  const xEsc = escapeRegExp(cfg.variableName);

  const p1 = new RegExp('^' + mEsc + '\\*' + xEsc + '(?:[+\\-]' + nEsc + ')?$');
  const p2 = new RegExp('^' + nEsc + '[+\\-]' + mEsc + '\\*' + xEsc + '$');
  if (p1.test(expr) || p2.test(expr)) return { m, n };

  // Legacy authoring frequently uses compact raw forms such as mx+n.
  if (/^m\*?x([+\-]n)?$/i.test(rawExpr) || /^n[+\-]m\*?x$/i.test(rawExpr)) {
    return { m, n };
  }

  return null;
}

function detectShiftBC(cfg: ScharCfg, params: string[]): { b: string; c: string } | null {
  const b = params.find((p) => String(p).toLowerCase() === 'b');
  const c = params.find((p) => String(p).toLowerCase() === 'c');
  if (!b || !c) return null;

  const rawExpr = String(cfg.expr || '').replace(/\s+/g, '').toLowerCase();
  const varLower = String(cfg.variableName || 'x').trim().toLowerCase();

  // Enable direct 2D dragging for legacy shifted families like d(x+b)^2+c.
  if (rawExpr.includes('(' + varLower + '+b)') && /[+\-]c$/.test(rawExpr)) {
    return { b, c };
  }

  return null;
}

function detectShiftCD(cfg: ScharCfg, params: string[]): { c: string; d: string } | null {
  const c = params.find((p) => String(p).toLowerCase() === 'c');
  const d = params.find((p) => String(p).toLowerCase() === 'd');
  if (!c || !d) return null;

  const rawExpr = String(cfg.expr || '').replace(/\s+/g, '').toLowerCase();
  const varLower = String(cfg.variableName || 'x').trim().toLowerCase();

  // Families 3/4: inner horizontal shift by c and outer vertical offset by d.
  if (rawExpr.includes('(' + varLower + '+c)') && /[+\-]d$/.test(rawExpr)) {
    return { c, d };
  }

  return null;
}

function detectPolyCoeffDrag(cfg: ScharCfg, params: string[]): { degreeToParam: Record<number, string>; maxDegree: number } | null {
  const raw = String(cfg.expr || '').toLowerCase().replace(/\s+/g, '').replace(/\*/g, '');
  const v = String(cfg.variableName || 'x').trim().toLowerCase();
  if (!v) return null;

  const findParam = (name: string): string | null => {
    const hit = params.find((p) => String(p).toLowerCase() === name);
    return hit || null;
  };

  const a = findParam('a');
  const b = findParam('b');
  const c = findParam('c');
  const d = findParam('d');
  const f = findParam('f');

  if (a && b && c && d && raw === `a${v}^3+b${v}^2+c${v}+d`) {
    return {
      degreeToParam: { 3: a, 2: b, 1: c, 0: d },
      maxDegree: 3
    };
  }

  if (a && b && c && d && f && raw === `a${v}^4+b${v}^3+c${v}^2+d${v}+f`) {
    return {
      degreeToParam: { 4: a, 3: b, 2: c, 1: d, 0: f },
      maxDegree: 4
    };
  }

  return null;
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let kk = k;
  if (kk > n - kk) kk = n - kk;
  let res = 1;
  for (let i = 1; i <= kk; i++) {
    res = (res * (n - kk + i)) / i;
  }
  return res;
}

function removeExisting(uid: string): void {
  const key = 'schar-' + uid;
  const prev = window.__scharEntries[key];
  if (!prev) return;

  try {
    if (prev.graph && prev.board) prev.board.removeObject(prev.graph);
  } catch (e) {}

  try {
    if (prev.dragGraph && prev.board) prev.board.removeObject(prev.dragGraph);
  } catch (e) {}

  try {
    if (prev.graphLabel && prev.board) prev.board.removeObject(prev.graphLabel);
  } catch (e) {}

  try {
    if (prev.panel && prev.panel.parentNode) prev.panel.parentNode.removeChild(prev.panel);
  } catch (e) {}

  delete window.__scharEntries[key];

  try {
    relayoutPanelsForBoard(prev.boardId, prev.board);
  } catch (e) {}
}

function getPanelHost(entry: ScharEntry): HTMLElement | null {
  if (!entry || !entry.board || !entry.board.containerObj) return null;

  const boardEl = entry.board.containerObj as HTMLElement;
  try {
    const boardStyle = window.getComputedStyle(boardEl);
    if (!boardStyle.position || boardStyle.position === 'static') {
      boardEl.style.position = 'relative';
    }
  } catch (e) {}

  let host: HTMLElement | null = null;
  try {
    host = boardEl.querySelector(':scope > .lia-schar-overlay-host');
  } catch (e) {
    host = boardEl.querySelector('.lia-schar-overlay-host');
  }

  if (!host) {
    host = document.createElement('div');
    host.className = 'lia-schar-overlay-host';
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '60';
    boardEl.appendChild(host);
  }

  return host;
}

function relayoutPanelsForBoard(boardId: string, board: any): void {
  try {
    const entries = Object.keys(window.__scharEntries || {})
      .map((key) => window.__scharEntries[key])
      .filter((item) => {
        if (!item || !item.panel || !item.panel.parentNode) return false;
        if (board && item.board !== board) return false;
        return item.boardId === boardId;
      })
      .sort((a, b) => String(a.uid || '').localeCompare(String(b.uid || '')));

    let top = 10;
    entries.forEach((item) => {
      item.panel.style.left = '10px';
      item.panel.style.top = top + 'px';
      const panelH = Math.ceil((item.panel.getBoundingClientRect && item.panel.getBoundingClientRect().height) || item.panel.offsetHeight || 56);
      top += panelH + 8;
    });
  } catch (e) {}
}

function refreshEntry(entry: ScharEntry): void {
  const scheduleRelayout = () => {
    relayoutPanelsForBoard(entry.boardId, entry.board);
    try {
      window.requestAnimationFrame(() => relayoutPanelsForBoard(entry.boardId, entry.board));
    } catch (e) {}
  };

  if (typeof entry.stopDrag === 'function') {
    try { entry.stopDrag(); } catch (e) {}
    entry.stopDrag = null;
  }

  if (!entry.graph) {
    entry.graph = entry.board.create('functiongraph', [function (x: number) {
      try {
        if (!entry.fn) return NaN;
        const xEval = entry.polyCoeffDrag ? (x - Number(entry.dragShiftX || 0)) : x;
        const y = entry.fn(xEval, entry.values);
        return Number.isFinite(y) ? y : NaN;
      } catch (e) {
        return NaN;
      }
    }], {
      strokeColor: entry.cfg.color,
      highlightStrokeColor: entry.cfg.color,
      strokeWidth: 3,
      fixed: true,
      withLabel: false
    });
  } else {
    try {
      if (typeof entry.graph.setAttribute === 'function') {
        entry.graph.setAttribute({
          strokeColor: entry.cfg.color,
          highlightStrokeColor: entry.cfg.color,
          strokeWidth: 3,
          fixed: true,
          withLabel: false
        });
      }
    } catch (e) {}
  }

  if (entry.linearMN || entry.shiftBC || entry.shiftCD || entry.polyCoeffDrag) {
    if (!entry.dragGraph) {
      // Invisible interaction curve for draggable families only.
      entry.dragGraph = entry.board.create('functiongraph', [function (x: number) {
        try {
          if (!entry.fn) return NaN;
          const xEval = entry.polyCoeffDrag ? (x - Number(entry.dragShiftX || 0)) : x;
          const y = entry.fn(xEval, entry.values);
          return Number.isFinite(y) ? y : NaN;
        } catch (e) {
          return NaN;
        }
      }], {
        strokeColor: entry.cfg.color,
        highlightStrokeColor: entry.cfg.color,
        strokeWidth: 16,
        strokeOpacity: 0.01,
        highlightStrokeOpacity: 0.01,
        fixed: true,
        withLabel: false
      });
    } else {
      try {
        if (typeof entry.dragGraph.setAttribute === 'function') {
          entry.dragGraph.setAttribute({
            strokeColor: entry.cfg.color,
            highlightStrokeColor: entry.cfg.color,
            strokeWidth: 16,
            strokeOpacity: 0.01,
            highlightStrokeOpacity: 0.01,
            fixed: true,
            withLabel: false
          });
        }
      } catch (e) {}
    }
  } else {
    try {
      if (entry.dragGraph && entry.board) entry.board.removeObject(entry.dragGraph);
    } catch (e) {}
    entry.dragGraph = null;
  }

  if (!entry.graphLabel) {
    entry.graphLabel = createPinnedGraphLabel(entry);
  }
  try {
    if (entry.graphLabel && typeof entry.graphLabel.setAttribute === 'function') {
      entry.graphLabel.setAttribute({
        strokeColor: entry.cfg.color,
        fillColor: entry.cfg.color
      });
    }
  } catch (e) {}

  bindGraphDrag(entry);

  entry.params.forEach((name) => {
    const slider = entry.slidersByParam[name];
    if (!slider) return;
    ensureSliderRangeForValue(slider, Number(entry.values[name]));
    slider.value = String(entry.values[name]);
    updateSliderFill(slider);
  });

  entry.minBtnEl.style.color = entry.cfg.color;

  if (entry.cfg.showTerm && entry.termVisible) {
    const texLhs = `${entry.cfg.name}(${entry.cfg.variableName})`;
    let texRhs: string;

    if (entry.linearMN) {
      // Linear family: m·x + n with cdot; suppress n when 0
      const mVal = entry.values[entry.linearMN.m];
      const nVal = entry.values[entry.linearMN.n];
      const xVar = entry.cfg.variableName;
      const mAbs = Math.abs(mVal);
      const nAbs = Math.abs(nVal);
      const mIsNeg = mVal < -1e-9;
      let mPart: string;
      mPart = (mIsNeg ? '-' : '') + fmtNum(mAbs) + ' \\cdot ' + xVar;
      if (Math.abs(nVal) < 1e-9) {
        texRhs = mPart;
      } else if (nVal > 0) {
        texRhs = mPart + ' + ' + fmtNum(nAbs);
      } else {
        texRhs = mPart + ' - ' + fmtNum(nAbs);
      }
    } else {
      texRhs = getExpandedTexForEntry(entry);
    }

    if (entry.polyCoeffDrag) {
      const shiftedTex = buildShiftedPolyTex(entry) || texRhs;
      const expandedTex = buildExpandedShiftedPolyTex(entry) || texRhs;
      entry.termEl.innerHTML = '<div class="lia-schar-term-line">\\(' + texLhs + ' = ' + shiftedTex + '\\)</div>' +
        '<br>' +
        '<div class="lia-schar-term-line">\\(' + texLhs + ' = ' + expandedTex + '\\)</div>';
    } else {
      entry.termEl.innerHTML = '<div class="lia-schar-term-line">\\(' + texLhs + ' = ' + texRhs + '\\)</div>';
    }
    entry.termEl.style.fontSize = '20px';
    entry.termEl.style.lineHeight = '1.2';
    entry.termEl.style.textAlign = 'left';
    entry.termEl.style.whiteSpace = 'nowrap';
    entry.termEl.style.wordBreak = 'normal';
    entry.termEl.style.overflowWrap = 'normal';
    entry.termEl.style.overflowX = 'auto';
    entry.termEl.style.overflowY = 'hidden';
    typesetMathNode(entry.termEl).then(scheduleRelayout);
  } else {
    entry.termEl.textContent = '';
  }

  entry.termEl.style.display = (entry.cfg.showTerm && entry.termVisible && !entry.panelMinimized) ? 'block' : 'none';
  entry.termToggleWrapEl.style.display = (entry.cfg.showTerm && !entry.panelMinimized) ? 'inline-flex' : 'none';
  entry.termToggleEl.checked = !!entry.termVisible;

  try { entry.board.update(); } catch (e) {}
  scheduleRelayout();
}

function bindGraphDrag(entry: ScharEntry): void {
  if (!entry || (!entry.linearMN && !entry.shiftBC && !entry.shiftCD && !entry.polyCoeffDrag) || (!entry.graph && !entry.dragGraph)) return;

  const targets = [
    entry.graph && entry.graph.rendNode,
    entry.graph && entry.graph.rendNodeStroke,
    entry.dragGraph && entry.dragGraph.rendNode,
    entry.dragGraph && entry.dragGraph.rendNodeStroke
  ].filter(Boolean);
  if (!targets.length) return;

  const onPointerDown = (evt: PointerEvent) => {
    evt.preventDefault();
    evt.stopPropagation();

    targets.forEach((target) => {
      try { target.style.cursor = 'grabbing'; } catch (e) {}
    });

    const pointerId = evt.pointerId;
    const start = eventToUser(entry.board, evt);
    const startN = entry.linearMN ? Number(entry.values[entry.linearMN.n] ?? 0) : 0;
    const startM = entry.linearMN ? Number(entry.values[entry.linearMN.m] ?? 1) : 1;
    const startB = entry.shiftBC ? Number(entry.values[entry.shiftBC.b] ?? 0) : 0;
    const startC = entry.shiftBC ? Number(entry.values[entry.shiftBC.c] ?? 0) : 0;
    const startShiftC = entry.shiftCD ? Number(entry.values[entry.shiftCD.c] ?? 0) : 0;
    const startShiftD = entry.shiftCD ? Number(entry.values[entry.shiftCD.d] ?? 0) : 0;
    const startShiftX = Number(entry.dragShiftX || 0);
    const startShiftY = Number(entry.dragShiftY || 0);
    const startPolyParams: Record<string, number> = {};
    if (entry.polyCoeffDrag) {
      Object.keys(entry.polyCoeffDrag.degreeToParam).forEach((degKey) => {
        const pname = entry.polyCoeffDrag!.degreeToParam[Number(degKey)];
        startPolyParams[pname] = Number(entry.values[pname] ?? 0);
      });
    }

    const onMove = (moveEvt: PointerEvent) => {
      if (moveEvt.pointerId !== pointerId) return;
      moveEvt.preventDefault();
      moveEvt.stopPropagation();

      const now = eventToUser(entry.board, moveEvt);
      const dx = now.x - start.x;
      const dy = now.y - start.y;

      if (entry.linearMN) {
        // Translate line by drag delta while preserving slope m:
        // y = m*x + n  => n' = n + dy - m*dx
        entry.values[entry.linearMN.n] = startN + dy - (startM * dx);
      }

      if (entry.shiftBC) {
        // g(x)=d*(x+b)^2+c; dragging by (dx,dy) maps to b' = b - dx and c' = c + dy.
        entry.values[entry.shiftBC.b] = startB - dx;
        entry.values[entry.shiftBC.c] = startC + dy;
      }

      if (entry.shiftCD) {
        // Families like A*F(b*(x+c))+d and reciprocal variants:
        // horizontal drag modifies c inversely, vertical drag modifies d directly.
        entry.values[entry.shiftCD.c] = startShiftC - dx;
        entry.values[entry.shiftCD.d] = startShiftD + dy;
      }

      if (entry.polyCoeffDrag) {
        // Legacy semantics: horizontal drag uses x -> (x - s), vertical drag adds +d.
        entry.dragShiftX = startShiftX + dx;
        entry.dragShiftY = startShiftY + dy;

        // Keep polynomial prefactors as parameter values from drag start.
        Object.keys(startPolyParams).forEach((pname) => {
          entry.values[pname] = Number(startPolyParams[pname]);
        });

        // Only vertical constant shifts by dy.
        const verticalParam = entry.polyCoeffDrag.degreeToParam[0];
        if (verticalParam) {
          const startVertical = Number(startPolyParams[verticalParam] ?? entry.values[verticalParam] ?? 0);
          entry.values[verticalParam] = startVertical + dy;
        }
      }

      refreshEntry(entry);
      persistScharEntryState(entry);
    };

    const onUp = (upEvt: PointerEvent) => {
      if (upEvt.pointerId !== pointerId) return;
      upEvt.preventDefault();
      upEvt.stopPropagation();
      targets.forEach((target) => {
        try { target.style.cursor = 'grab'; } catch (e) {}
      });
      try { window.removeEventListener('pointermove', onMove, true); } catch (e) {}
      try { window.removeEventListener('pointerup', onUp, true); } catch (e) {}
      try { window.removeEventListener('pointercancel', onUp, true); } catch (e) {}
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  };

  targets.forEach((target) => {
    try {
      target.style.cursor = 'grab';
      target.style.touchAction = 'none';
      target.addEventListener('pointerdown', onPointerDown, true);
    } catch (e) {}
  });

  entry.stopDrag = () => {
    targets.forEach((target) => {
      try { target.removeEventListener('pointerdown', onPointerDown, true); } catch (e) {}
    });
  };
}

function applyPanelScale(entry: ScharEntry): void {
  const scale = Math.max(0.55, Math.min(1.45, Number(entry.panelScale || 1)));
  entry.panelScale = scale;
  entry.panel.style.transformOrigin = 'top left';
  entry.panel.style.transform = 'scale(' + scale + ')';
}

function applyPanelMinimized(entry: ScharEntry): void {
  const panelBg = entry.panel.dataset.baseBackground || entry.panel.style.background || '';
  const panelBorder = entry.panel.dataset.baseBorder || entry.panel.style.border || '';
  const panelShadow = entry.panel.dataset.baseShadow || entry.panel.style.boxShadow || '';

    entry.panel.classList.toggle('is-minimized', entry.panelMinimized);
    entry.panel.style.padding = entry.panelMinimized ? '4px 6px' : '14px 10px 8px 10px';
    entry.panel.style.display = entry.panelMinimized ? 'inline-flex' : 'block';
    entry.panel.style.alignItems = entry.panelMinimized ? 'center' : '';
    entry.panel.style.justifyContent = entry.panelMinimized ? 'center' : '';
    entry.panel.style.width = entry.panelMinimized ? '38px' : '';
    entry.panel.style.minWidth = entry.panelMinimized ? '38px' : '190px';
    entry.panel.style.height = entry.panelMinimized ? '16px' : '';
    entry.panel.style.minHeight = entry.panelMinimized ? '16px' : '';
    entry.panel.style.background = panelBg;
    entry.panel.style.border = panelBorder;
    entry.panel.style.boxShadow = panelShadow;
    entry.contentEl.style.display = entry.panelMinimized ? 'none' : 'block';
    entry.minBtnEl.style.display = entry.panelMinimized ? 'none' : 'block';
    entry.miniWrapEl.style.display = entry.panelMinimized ? 'inline-flex' : 'none';
    entry.miniWrapEl.style.alignItems = entry.panelMinimized ? 'center' : '';
    entry.miniWrapEl.style.justifyContent = entry.panelMinimized ? 'center' : '';
    entry.miniWrapEl.style.minWidth = entry.panelMinimized ? '22px' : '';
    entry.miniWrapEl.style.height = entry.panelMinimized ? '3px' : '';
    entry.miniNameEl.style.display = 'none';
    entry.miniStripEl.style.display = entry.panelMinimized ? 'block' : 'none';
    entry.miniStripEl.style.width = entry.panelMinimized ? '22px' : '';
    entry.miniStripEl.style.height = entry.panelMinimized ? '3px' : '';
    entry.miniStripEl.style.borderRadius = entry.panelMinimized ? '99px' : '';
    entry.miniStripEl.style.opacity = entry.panelMinimized ? '1' : '';

  entry.minBtnEl.title = entry.panelMinimized ? 'Overlay wiederherstellen' : 'Overlay minimieren';
  entry.minBtnEl.style.position = 'absolute';
  entry.minBtnEl.style.setProperty('top', '2px', 'important');
  entry.minBtnEl.style.setProperty('right', '2px', 'important');
  entry.minBtnEl.style.setProperty('left', 'auto', 'important');
  entry.minBtnEl.style.setProperty('background', 'transparent', 'important');
  entry.minBtnEl.style.setProperty('border', 'none', 'important');

  const c = entry.cfg && entry.cfg.color ? entry.cfg.color : '#0b5fff';
  entry.minBtnEl.style.color = c;
  entry.miniNameEl.style.color = c;
  entry.miniStripEl.style.background = c;
  entry.miniStripEl.style.boxShadow = '0 0 0 1px ' + c;
  entry.panel.style.setProperty('--lia-schar-accent', c);

  const resizeHandle = entry.panel.querySelector('.lia-schar-resize-handle') as HTMLElement | null;
  if (resizeHandle) resizeHandle.style.display = entry.panelMinimized ? 'none' : 'block';
  entry.termToggleWrapEl.style.display = (entry.cfg.showTerm && !entry.panelMinimized) ? 'inline-flex' : 'none';
  entry.termEl.style.display = (entry.cfg.showTerm && entry.termVisible && !entry.panelMinimized) ? 'block' : 'none';

  // Force immediate layout update so mini background/size is visible on the same click.
  void entry.panel.offsetWidth;
  relayoutPanelsForBoard(entry.boardId, entry.board);
  try {
    window.requestAnimationFrame(() => relayoutPanelsForBoard(entry.boardId, entry.board));
  } catch (e) {}
}

function bindPanelResizeHandle(entry: ScharEntry): void {
  if (!entry || !entry.panel) return;
  const panel = entry.panel;
  let handle = panel.querySelector('.lia-schar-resize-handle') as HTMLElement | null;
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'lia-schar-resize-handle';
    panel.appendChild(handle);
  }

  handle.style.position = 'absolute';
  handle.style.right = '0';
  handle.style.bottom = '0';
  handle.style.width = '15px';
  handle.style.height = '15px';
  handle.style.cursor = 'nwse-resize';
  handle.style.borderRight = '2px solid ' + entry.cfg.color;
  handle.style.borderBottom = '2px solid ' + entry.cfg.color;
  handle.style.borderBottomRightRadius = '8px';
  handle.style.boxSizing = 'border-box';
  handle.style.zIndex = '10';
  handle.style.display = entry.panelMinimized ? 'none' : 'block';
  handle.style.pointerEvents = 'auto';
  handle.style.userSelect = 'none';
  handle.style.touchAction = 'none';
  handle.style.background = 'transparent';

  if ((handle as any).__liaScharResizeBound) return;
  (handle as any).__liaScharResizeBound = true;

  type ResizeDrag = {
    entry: ScharEntry;
    pointerId: number | null;
    mode: 'pointer' | 'mouse';
    startX: number;
    startY: number;
    anchorX: number;
    anchorY: number;
    startDist: number;
    startScale: number;
    pendingScale: number;
    rafId: number;
  };

  const resizeState = (window as any).__liaScharPanelResize || {
    drag: null as ResizeDrag | null,
    installed: false,
    handles: [] as Array<{ handle: HTMLElement; entry: ScharEntry }>
  };
  (window as any).__liaScharPanelResize = resizeState;
  (handle as any).__liaScharEntry = entry;
  if (!(handle as any).__liaScharHandleRegistered) {
    (handle as any).__liaScharHandleRegistered = true;
    resizeState.handles.push({ handle, entry });
  }

  const scheduleApply = () => {
    const d = resizeState.drag as ResizeDrag | null;
    if (!d || d.rafId) return;

    try {
      d.rafId = window.requestAnimationFrame(() => {
        const cur = resizeState.drag as ResizeDrag | null;
        if (!cur) return;
        cur.rafId = 0;
        cur.entry.panelScale = cur.pendingScale;
        applyPanelScale(cur.entry);
      });
    } catch (e) {
      d.rafId = 0;
      d.entry.panelScale = d.pendingScale;
      applyPanelScale(d.entry);
    }
  };

  const startDrag = (dragEntry: ScharEntry, x: number, y: number, mode: 'pointer' | 'mouse', pointerId: number | null) => {
    const prev = resizeState.drag as ResizeDrag | null;
    if (prev && prev.rafId) {
      try { window.cancelAnimationFrame(prev.rafId); } catch (e) {}
    }

    resizeState.drag = {
      entry: dragEntry,
      pointerId,
      mode,
      startX: x,
      startY: y,
      anchorX: dragEntry.panel.getBoundingClientRect().left,
      anchorY: dragEntry.panel.getBoundingClientRect().top,
      startDist: 0,
      startScale: dragEntry.panelScale,
      pendingScale: dragEntry.panelScale,
      rafId: 0
    } as ResizeDrag;

    const dx0 = x - resizeState.drag.anchorX;
    const dy0 = y - resizeState.drag.anchorY;
    resizeState.drag.startDist = Math.max(8, Math.hypot(dx0, dy0));

    try { document.body.style.userSelect = 'none'; } catch (e) {}
  };

  const updateDrag = (x: number, y: number, mode: 'pointer' | 'mouse', pointerId: number | null) => {
    const d = resizeState.drag as ResizeDrag | null;
    if (!d || d.mode !== mode) return;
    if (d.mode === 'pointer' && d.pointerId !== pointerId) return;

    const dx = x - d.anchorX;
    const dy = y - d.anchorY;
    const dist = Math.max(8, Math.hypot(dx, dy));
    const nextScale = Math.max(0.55, Math.min(1.45, d.startScale * (dist / d.startDist)));
    if (Math.abs(nextScale - d.pendingScale) < 0.0015) return;
    d.pendingScale = nextScale;
    scheduleApply();
  };

  const stopDrag = (mode: 'pointer' | 'mouse', pointerId: number | null) => {
    const d = resizeState.drag as ResizeDrag | null;
    if (!d || d.mode !== mode) return;
    if (d.mode === 'pointer' && d.pointerId !== pointerId) return;

    if (d.rafId) {
      try { window.cancelAnimationFrame(d.rafId); } catch (e) {}
      d.rafId = 0;
    }

    d.entry.panelScale = Math.max(0.55, Math.min(1.45, d.pendingScale));
    applyPanelScale(d.entry);
    persistScharEntryState(d.entry);
    relayoutPanelsForBoard(d.entry.boardId, d.entry.board);
    resizeState.drag = null;
    try { document.body.style.userSelect = ''; } catch (e) {}
  };

  handle.addEventListener('pointerdown', (evt: PointerEvent) => {
    evt.preventDefault();
    evt.stopPropagation();
    startDrag(entry, evt.clientX, evt.clientY, 'pointer', evt.pointerId);
    try { handle!.setPointerCapture(evt.pointerId); } catch (e) {}
  }, { passive: false });

  handle.addEventListener('mousedown', (evt: MouseEvent) => {
    evt.preventDefault();
    evt.stopPropagation();
    startDrag(entry, evt.clientX, evt.clientY, 'mouse', null);
  }, { passive: false });

  if (!resizeState.installed) {
    resizeState.installed = true;

    document.addEventListener('mousedown', (evt: MouseEvent) => {
      const handles = Array.isArray(resizeState.handles) ? resizeState.handles : [];
      for (let i = handles.length - 1; i >= 0; i--) {
        const rec = handles[i];
        if (!rec || !rec.handle || !rec.entry || !rec.entry.panel || !rec.handle.isConnected) continue;
        if (rec.entry.panelMinimized || rec.handle.style.display === 'none') continue;

        const rect = rec.handle.getBoundingClientRect();
        if (evt.clientX < rect.left || evt.clientX > rect.right || evt.clientY < rect.top || evt.clientY > rect.bottom) {
          continue;
        }

        evt.preventDefault();
        evt.stopPropagation();
        startDrag(rec.entry, evt.clientX, evt.clientY, 'mouse', null);
        return;
      }
    }, true);

    window.addEventListener('pointermove', (evt: PointerEvent) => {
      updateDrag(evt.clientX, evt.clientY, 'pointer', evt.pointerId);
    }, true);

    window.addEventListener('pointerup', (evt: PointerEvent) => {
      stopDrag('pointer', evt.pointerId);
    }, true);

    window.addEventListener('pointercancel', (evt: PointerEvent) => {
      stopDrag('pointer', evt.pointerId);
    }, true);

    window.addEventListener('mousemove', (evt: MouseEvent) => {
      updateDrag(evt.clientX, evt.clientY, 'mouse', null);
    }, true);

    window.addEventListener('mouseup', () => {
      stopDrag('mouse', null);
    }, true);
  }
}

function createPanel(entry: ScharEntry): HTMLElement {
  ensureScharCss();

  const panel = document.createElement('div');
  panel.className = 'lia-schar-panel';

  const fg = getNeutralColor();
  const bg = fg === '#fff' ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.97)';

  panel.style.position = 'absolute';
  panel.style.left = '10px';
  panel.style.top = '10px';
  panel.style.zIndex = '52';
  panel.style.minWidth = '190px';
  panel.style.padding = '8px 10px';
  panel.style.borderRadius = '10px';
  panel.style.background = bg;
  panel.style.color = fg;
  panel.style.border = '1px solid ' + (fg === '#fff' ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.16)');
  panel.style.boxShadow = '0 6px 18px rgba(0,0,0,.18)';
  panel.dataset.baseBackground = panel.style.background;
  panel.dataset.baseBorder = panel.style.border;
  panel.dataset.baseShadow = panel.style.boxShadow;
  panel.style.boxSizing = 'border-box';
  panel.style.setProperty('--lia-schar-accent', entry.cfg.color);
  panel.style.pointerEvents = 'auto';

  const minBtn = document.createElement('button');
  minBtn.className = 'lia-schar-min-btn';
  minBtn.type = 'button';
  minBtn.textContent = '×';
  minBtn.style.position = 'absolute';
  minBtn.style.setProperty('top', '2px', 'important');
  minBtn.style.setProperty('right', '2px', 'important');
  minBtn.style.setProperty('left', 'auto', 'important');
  minBtn.style.setProperty('background', 'transparent', 'important');
  minBtn.style.setProperty('border', 'none', 'important');
  panel.appendChild(minBtn);

  const miniWrap = document.createElement('div');
  miniWrap.className = 'lia-schar-mini-wrap';
  const miniName = document.createElement('span');
  miniName.className = 'lia-schar-mini-name';
  const miniStrip = document.createElement('span');
  miniStrip.className = 'lia-schar-mini-strip';
  const cleanName = String(entry.cfg.name || 'f').trim().replace(/\(.*$/, '').replace(/[^A-Za-z]/g, '') || 'f';
  miniName.textContent = '\\(' + cleanName + '\\)';
  typesetMathNode(miniName);
  miniWrap.appendChild(miniName);
  miniWrap.appendChild(miniStrip);
  panel.appendChild(miniWrap);

  const content = document.createElement('div');
  content.className = 'lia-schar-content';

  ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'wheel', 'touchstart', 'touchmove', 'touchend'].forEach((evtName) => {
    panel.addEventListener(evtName, (evt) => evt.stopPropagation(), { capture: true });
  });

  const visibleParams = entry.linearMN
    ? entry.params.filter((name) => name !== entry.linearMN!.n)
    : entry.params.slice();

  visibleParams.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'lia-schar-head';

    const label = document.createElement('span');
    label.className = 'lia-schar-param-label';
    label.textContent = '\\(' + name + '\\):';
    typesetMathNode(label);

    const slider = document.createElement('input');
    slider.className = 'lia-schar-slider';
    slider.type = 'range';
    const baseVal = Number(entry.values[name]);
    const safeBase = Number.isFinite(baseVal) ? baseVal : 0;
    slider.min = String(safeBase - 5);
    slider.max = String(safeBase + 5);
    slider.step = '0.1';
    slider.value = String(entry.values[name]);
    slider.style.setProperty('margin-left', '12px', 'important');
    slider.style.setProperty('margin-right', '10px', 'important');
    slider.style.setProperty('transform', 'none', 'important');
    slider.style.setProperty('-webkit-appearance', 'none', 'important');
    slider.style.setProperty('appearance', 'none', 'important');
    slider.style.setProperty('-moz-appearance', 'none', 'important');
    slider.style.setProperty('accent-color', 'transparent', 'important');
    slider.style.setProperty('--lia-schar-accent', entry.cfg.color, 'important');
    slider.style.setProperty('--lia-schar-fill', '50%', 'important');
    slider.style.setProperty('color', entry.cfg.color, 'important');
    slider.style.setProperty(
      'background',
      'linear-gradient(to right, ' + entry.cfg.color + ' 0 var(--lia-schar-fill, 50%), rgba(128,128,128,.65) var(--lia-schar-fill, 50%) 100%)',
      'important'
    );
    slider.style.setProperty('background-size', '100% 5px', 'important');
    slider.style.setProperty('background-repeat', 'no-repeat', 'important');
    slider.style.setProperty('background-position', 'center', 'important');
    slider.style.setProperty('border-radius', '999px', 'important');
    slider.style.setProperty('height', '12px', 'important');
    slider.style.setProperty('min-height', '12px', 'important');

    entry.slidersByParam[name] = slider;
    ensureSliderRangeForValue(slider, Number(entry.values[name]));
    updateSliderFill(slider);

    slider.addEventListener('input', () => {
      entry.values[name] = Number(slider.value);
      entry.dragShiftX = 0;
      entry.dragShiftY = 0;
      refreshPolyBaseFromCurrent(entry);
      updateSliderFill(slider);
      refreshEntry(entry);
      persistScharEntryState(entry);
    });

    row.appendChild(label);
    row.appendChild(slider);
    content.appendChild(row);
  });

  const term = document.createElement('div');
  term.className = 'lia-schar-term';
  term.style.display = 'none';
  const termToggleWrap = document.createElement('label');
  termToggleWrap.style.display = entry.cfg.showTerm ? 'block' : 'none';
  termToggleWrap.style.fontSize = '12px';
  termToggleWrap.style.marginTop = '-8px';
  termToggleWrap.style.position = 'static';
  termToggleWrap.style.top = '0';
  termToggleWrap.style.lineHeight = '1';
  termToggleWrap.style.display = 'inline-flex';
  termToggleWrap.style.alignItems = 'center';
  termToggleWrap.style.userSelect = 'none';
  termToggleWrap.innerHTML = '<span class="lia-schar-term-toggle-row"><input class="lia-schar-term-toggle" type="checkbox" /><span>Term anzeigen</span></span>';
  const termToggle = termToggleWrap.querySelector('input') as HTMLInputElement;
  termToggle.checked = !!entry.termVisible;
  termToggle.addEventListener('input', () => {
    entry.termVisible = !!termToggle.checked;
    refreshEntry(entry);
    persistScharEntryState(entry);
  });
  content.appendChild(termToggleWrap);
  content.appendChild(term);

  minBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    entry.panelMinimized = !entry.panelMinimized;
    applyPanelMinimized(entry);
    persistScharEntryState(entry);
  });

  const restoreFromMini = (evt: Event) => {
    evt.preventDefault();
    evt.stopPropagation();
    entry.panelMinimized = false;
    applyPanelMinimized(entry);
    persistScharEntryState(entry);
  };
  miniStrip.addEventListener('click', restoreFromMini, true);
  miniName.addEventListener('click', restoreFromMini, true);
  miniWrap.addEventListener('click', restoreFromMini, true);
  panel.addEventListener('click', (evt) => {
    if (entry.panelMinimized && evt.target === panel) {
      restoreFromMini(evt);
    }
  }, true);

  entry.panel = panel;
  panel.appendChild(content);
  bindPanelResizeHandle(entry);

  entry.minBtnEl = minBtn;
  entry.contentEl = content;
  entry.miniWrapEl = miniWrap;
  entry.miniNameEl = miniName;
  entry.miniStripEl = miniStrip;
  entry.termToggleWrapEl = termToggleWrap;
  entry.termToggleEl = termToggle;
  entry.termEl = term;

  applyPanelScale(entry);
  applyPanelMinimized(entry);

  return panel;
}

export function init(): void {
  if (window.__scharReady) {
    try {
      if (window.__bootstrapScharen) window.__bootstrapScharen();
    } catch (e) {}
    return;
  }

  window.__scharReady = true;
  window.__scharEntries = window.__scharEntries || {};

  window.renderScharFromSpec = function (uid: string, spec: string): boolean {
    const cfg = parseScharSpec(spec);
    if (!cfg.boardId || !cfg.expr) return false;

    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board || !board.containerObj) return false;

    removeExisting(uid);

    const params = extractParams(cfg.expr, cfg.variableName);
    const values: Record<string, number> = {};
    const compactExpr = String(cfg.expr || '').toLowerCase().replace(/\s+/g, '');
    const varLower = String(cfg.variableName || 'x').toLowerCase();
    const usesShiftedB = compactExpr.includes('b(' + varLower + '+c)');
    params.forEach((name, idx) => {
      const lower = name.toLowerCase();
      if (lower === 'b' && usesShiftedB) {
        values[name] = 1;
      } else {
        values[name] = (idx === 0 || lower === 'a' || lower === 'm') ? 1 : 0;
      }
    });

    const fn = compileFamilyExpr(cfg.expr, cfg.variableName, params);
    if (!fn) return false;

    const entry: ScharEntry = {
      uid,
      boardId: cfg.boardId,
      board,
      cfg,
      graph: null,
      dragGraph: null,
      graphLabel: null,
      panel: document.createElement('div'),
      termEl: document.createElement('div'),
      contentEl: document.createElement('div'),
      minBtnEl: document.createElement('button'),
      miniWrapEl: document.createElement('div'),
      miniNameEl: document.createElement('span'),
      miniStripEl: document.createElement('span'),
      termToggleWrapEl: document.createElement('label'),
      termToggleEl: document.createElement('input'),
      termVisible: false,
      linearMN: null,
      shiftBC: null,
      shiftCD: null,
      polyCoeffDrag: null,
      stopDrag: null,
      panelScale: 1,
      panelMinimized: false,
      fn,
      params,
      values,
      slidersByParam: {},
      dragShiftX: 0,
      dragShiftY: 0,
      polyBaseByDegree: null
    };

    entry.linearMN = detectLinearMN(cfg, params);
    entry.shiftBC = detectShiftBC(cfg, params);
    entry.shiftCD = detectShiftCD(cfg, params);
    entry.polyCoeffDrag = detectPolyCoeffDrag(cfg, params);
    refreshPolyBaseFromCurrent(entry);

    restoreScharEntryState(entry);

    // Always start overlays at minimum scale when (re)loading.
    entry.panelScale = 0.55;

    entry.panel = createPanel(entry);
    const host = getPanelHost(entry);
    if (!host) return false;
    host.appendChild(entry.panel);
    refreshEntry(entry);
    applyPanelMinimized(entry);
    persistScharEntryState(entry);

    window.__scharEntries['schar-' + uid] = entry;
    relayoutPanelsForBoard(entry.boardId, entry.board);
    return true;
  };

  window.__bootstrapScharen = function () {
    document.querySelectorAll<HTMLElement>('[id^="schar-spec-"][data-spec]').forEach(function (node) {
      const uid = String(node.id || '').replace(/^schar-spec-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;
      if (window.renderScharFromSpec) window.renderScharFromSpec(uid, spec);
    });
  };

  try {
    const obs = new MutationObserver(function () {
      try {
        if (window.__bootstrapScharen) window.__bootstrapScharen();
      } catch (e) {}
    });
    const root = document.body || document.documentElement;
    if (root) obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec'] });
  } catch (e) {}

  scheduleBootstrap(function () {
    try {
      if (window.__bootstrapScharen) window.__bootstrapScharen();
    } catch (e) {}
  });
}
