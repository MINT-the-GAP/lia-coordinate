// Table subsystem (@Table macro).
// Renders interactive value tables connected to a JSXGraph board.

import { splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor, getAccentColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

export function init(): void {
if (window.__tableReady) {
  try {
    if (window.__scheduleBootstrapTables) window.__scheduleBootstrapTables();
    else if (window.__bootstrapTables) window.__bootstrapTables();
  } catch (e) {}
  return;
}
window.__tableReady = true;

  const DEFAULT_COLS = 3;
  const MIN_COLS = 2;
  const MAX_COLS = 30;

const MIN_CELL_PX = 120;
const MAX_CELL_PX = 900;

  window.__tableStates = window.__tableStates || {};


  function getMathJaxEngine() {
    try {
      if (window.MathJax) return window.MathJax;
    } catch (e) {}

    try {
      if (window.parent && window.parent.MathJax) return window.parent.MathJax;
    } catch (e) {}

    return null;
  }

  function typesetNode(node) {
    const MJ = getMathJaxEngine();
    if (!MJ || !node || typeof MJ.typesetPromise !== 'function') return;

    try {
      MJ.typesetPromise([node]).catch(function(){});
    } catch (e) {}
  }

  function toPositiveInt(v, fallback) {
    const n = parseInt(String(v || '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function parseCountToken(token) {
    const raw = String(token || '').trim();

    if (!raw) return DEFAULT_COLS;

    const cleaned = raw
      .replace(/^(rows|cols|columns|n)\s*=\s*/i, '')
      .trim();

    return Math.max(MIN_COLS, Math.min(MAX_COLS, toPositiveInt(cleaned, DEFAULT_COLS)));
  }

function parseSpec(spec) {
  const raw = unquote(String(spec || '').trim());
  const parts = splitTopLevel(raw);

  const count = parseCountToken(parts[0] || String(DEFAULT_COLS));
  const row1 = parts[1] ? unquote(parts[1]) : 'x';
  const row2 = parts[2] ? unquote(parts[2]) : 'f';

  let pointPrefix = '';
  let boardId = '';

  for (let i = 3; i < parts.length; i++) {
    const part = unquote(parts[i] || '').trim();
    if (!part) continue;

    const eq = part.indexOf('=');
    if (eq >= 0) {
      const key = part.slice(0, eq).trim().toLowerCase();
      const val = unquote(part.slice(eq + 1).trim());

      if (key === 'id') {
        boardId = val;
        continue;
      }

      if (key === 'p' || key === 'point' || key === 'points' || key === 'prefix') {
        pointPrefix = val;
        continue;
      }
    }

    if (!pointPrefix) pointPrefix = part;
  }

  return {
    count: count,
    row1: row1,
    row2: row2,
    pointPrefix: pointPrefix,
    boardId: boardId
  };
}

  function normalizeLabelMath(s, isSecondRow) {
    let out = String(s || '').trim();

    if (!out) out = isSecondRow ? 'f' : 'x';

    if (
      out.indexOf('\\(') >= 0 ||
      out.indexOf('\\[') >= 0
    ) {
      return out;
    }

    out = out.replace(/\\\$/g, '__LIA_ESC_DOLLAR__');
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, function (_, inner) {
      return '\\[' + inner + '\\]';
    });
    out = out.replace(/\$([^$]+?)\$/g, function (_, inner) {
      return '\\(' + inner + '\\)';
    });
    out = out.replace(/__LIA_ESC_DOLLAR__/g, '$');

    if (
      out.indexOf('\\(') >= 0 ||
      out.indexOf('\\[') >= 0
    ) {
      return out;
    }

    if (isSecondRow && !/[()[\]]/.test(out)) {
      out = out + '(x)';
    }

    return '\\(' + out + '\\)';
  }

  function cloneValue(v) {
    return {
      x: v && v.x != null ? String(v.x) : '',
      y: v && v.y != null ? String(v.y) : ''
    };
  }

  function resizeValues(values, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(cloneValue(values && values[i]));
    }
    return out;
  }

function ensureState(uid, spec) {
  const cfg = parseSpec(spec);
  let st = window.__tableStates[uid];

  if (!st) {
    st = {
      uid: uid,
      spec: spec,
      cols: cfg.count,
      row1: cfg.row1,
      row2: cfg.row2,
      pointPrefix: cfg.pointPrefix,
      boardId: cfg.boardId,
      values: resizeValues([], cfg.count),
      cellWidths: {}
    };
    window.__tableStates[uid] = st;
    return st;
  }

  if (st.spec !== spec) {
    st.spec = spec;
    st.cols = cfg.count;
    st.row1 = cfg.row1;
    st.row2 = cfg.row2;
    st.pointPrefix = cfg.pointPrefix;
    st.boardId = cfg.boardId;
    st.values = resizeValues(st.values, st.cols);
    st.cellWidths = st.cellWidths || {};
    return st;
  }

  st.row1 = cfg.row1;
  st.row2 = cfg.row2;
  st.pointPrefix = cfg.pointPrefix;
  st.boardId = cfg.boardId;
  st.values = resizeValues(st.values, st.cols);
  st.cellWidths = st.cellWidths || {};

  return st;
}


function parseTableNumber(v) {
  const s = String(v != null ? v : '').trim().replace(',', '.');
  if (!s) return NaN;

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function getPointName(prefix, colIndex) {
  const base = String(prefix || 'P').trim() || 'P';
  return base + '_' + (colIndex + 1);
}

function updatePointButtonState(uid, colIndex, btn) {
  if (!btn) return;

  const st = window.__tableStates[uid];
  const entry = st && st.values && st.values[colIndex] ? st.values[colIndex] : null;

  const x = parseTableNumber(entry ? entry.x : '');
  const y = parseTableNumber(entry ? entry.y : '');

  const ready = !!(
    st &&
    st.boardId &&
    st.pointPrefix &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    typeof window.finalizePointFromSpec === 'function'
  );

  btn.disabled = !ready;
  btn.style.opacity = ready ? '' : '0.55';
  btn.title = ready ? '' : 'Please enter numeric values for x and f(x) first.';
}

function refreshPointButtons(uid) {
  const root = getRoot(uid);
  if (!root) return;

  root.querySelectorAll<HTMLElement>('.lia-dyn-table-point-btn[data-col-index]').forEach(function(btn) {
    const colIndex = parseInt(btn.dataset.colIndex || '0', 10) || 0;
    updatePointButtonState(uid, colIndex, btn);
  });
}

function buildPointButton(uid, colIndex, state) {
  const wrap = document.createElement('div');
  wrap.className = 'lia-dyn-table-point-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lia-btn lia-dyn-table-point-btn';
  btn.dataset.colIndex = String(colIndex);

  const pointName = getPointName(state.pointPrefix, colIndex);
  btn.innerHTML = 'Place&nbsp;' + normalizeLabelMath(pointName, false);

  btn.addEventListener('click', function() {
    const st = window.__tableStates[uid];
    if (!st) return;

    const entry = st.values && st.values[colIndex] ? st.values[colIndex] : null;
    const x = parseTableNumber(entry ? entry.x : '');
    const y = parseTableNumber(entry ? entry.y : '');

    if (!st.boardId || !st.pointPrefix) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (typeof window.finalizePointFromSpec !== 'function') return;

    const spec =
      st.boardId +
      ';' +
      getPointName(st.pointPrefix, colIndex) +
      ';' +
      x +
      ';' +
      y;

    window.finalizePointFromSpec(spec);
  });

  wrap.appendChild(btn);
  typesetNode(btn);
  updatePointButtonState(uid, colIndex, btn);

  return wrap;
}

  function getRoot(uid) {
    return document.getElementById('lia-table-' + uid);
  }

function ensureCss() {
  if (document.getElementById('__lia_table_css_v3')) return;

  const st = document.createElement('style');
  st.id = '__lia_table_css_v3';
  st.textContent = `

    .lia-dyn-table-root{
      width: 100%;
      max-width: 100%;
      margin: .9rem 0 1.2rem 0;
      --lia-table-fg: #000;
      --lia-table-border: #000;
      --lia-table-accent: #0b5fff;
      --lia-table-soft: rgba(127,127,127,.08);
      --lia-table-soft-2: rgba(127,127,127,.14);
      --lia-table-cell-max: 520px;
    }

    .lia-dyn-table-shell{
      width: max-content;
      max-width: 100%;
      display: inline-flex;
      align-items: stretch;
      border: 2px solid var(--lia-table-border);
      border-radius: 18px;
      overflow: hidden;
      background: transparent;
      box-sizing: border-box;
    }

    .lia-dyn-table-wrap{
      flex: 0 1 auto;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      cursor: auto;
      background: transparent;
    }

    .lia-dyn-table{
      border-collapse: separate;
      border-spacing: 0;
      color: var(--lia-table-fg);
      margin: 0;
      width: max-content;
      min-width: 0;
      table-layout: auto;
      background: transparent;
    }

    .lia-dyn-table th,
    .lia-dyn-table td{
      padding: .55rem .6rem;
      text-align: center;
      vertical-align: middle;
      background: transparent;
      border-right: 1px solid var(--lia-table-border);
      border-bottom: 1px solid var(--lia-table-border);
      box-sizing: border-box;
    }

    .lia-dyn-table-last-col{
      border-right: 0 !important;
    }

    .lia-dyn-table-bottom-row{
      border-bottom: 0 !important;
    }

    .lia-dyn-table-label{
      min-width: 6.2rem;
      font-weight: 700;
      white-space: nowrap;
      background: var(--lia-table-soft);
    }

    .lia-dyn-table-double-sep{
      border-right: 4px double var(--lia-table-border) !important;
    }

    .lia-dyn-table-label > div{
      min-height: 2.15rem;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 .15rem;
    }

    .lia-dyn-table-pool-item{
      display: inline-block;
      width: max-content;
      min-width: 0;
      max-width: none;
    }

.lia-dyn-table-point-wrap{
  display: flex;
  align-items: center;
  justify-content: center;
}

.lia-dyn-table-point-btn{
  min-width: auto;
  width: auto;
  height: auto;
  min-height: 2.35rem;
  padding: .55rem 1.05rem;
  border-radius: 999px;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lia-dyn-table-point-btn:disabled{
  cursor: not-allowed;
}

    .lia-dyn-table-input{
      width: 6ch;
      min-width: 6ch;
      max-width: 40ch;
      box-sizing: content-box;
      margin: 0;
      padding: .55rem .6rem;
      border: 2px solid var(--lia-table-accent);
      border-radius: 12px;
      background: var(--lia-table-soft);
      color: var(--lia-table-fg);
      caret-color: var(--lia-table-fg);
      text-align: center;
      font: inherit;
      line-height: 1.2;
      outline: none;
      box-shadow: inset 0 0 0 1px rgba(127,127,127,.08);
      transition:
        border-color .14s ease,
        box-shadow .14s ease,
        background .14s ease,
        width .12s ease;
    }

    .lia-dyn-table-input-wrap{
      position: relative;
      display: inline-block;
      vertical-align: middle;
      line-height: 0;
    }

    .lia-dyn-table-mini-canvas{
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 12px;
      border: 1px solid var(--lia-table-border);
      background: rgba(127,127,127,.10);
      pointer-events: none;
      z-index: 1;
    }

    .lia-dyn-table-input{
      position: relative;
      z-index: 2;
      background: transparent;
    }

    .lia-dyn-table-input:hover{
      background: rgba(127,127,127,.11);
      box-shadow: inset 0 0 0 1px var(--lia-table-accent);
    }

    .lia-dyn-table-input:focus{
      border-color: var(--lia-table-accent);
      background: rgba(127,127,127,.13);
      box-shadow:
        inset 0 0 0 1px var(--lia-table-accent),
        0 0 0 2px var(--lia-table-accent);
    }

    .lia-dyn-table-rail{
      flex: 0 0 3.2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: .45rem;
      padding: .5rem .25rem;
      border-left: 1px solid var(--lia-table-border);
      background: var(--lia-table-soft);
      box-sizing: border-box;
      user-select: none;
      touch-action: auto;
      cursor: default;
    }

    .lia-dyn-table-rail.is-dragging{
      cursor: grabbing;
    }

    .lia-dyn-table-rail-buttons{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .45rem;
      width: 100%;
    }

    .lia-dyn-table-btn{
      min-width: 2.8rem;
      width: 2.8rem;
      height: 2.8rem;
      padding: 0;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      font-size: 3.0rem;
      font-weight: 700;
    }

    .lia-dyn-table-field-stack{
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: .35rem;
      width: max-content;
      min-width: 0;
      max-width: var(--lia-table-cell-max);
      flex: 0 1 auto;
    }

    .lia-dyn-table-value{
      min-width: 0;
      width: auto;
      max-width: var(--lia-table-cell-max);
      padding: .4rem .35rem;
      box-sizing: border-box;
    }

    .lia-dyn-table-pool{
      position: absolute;
      left: -99999px;
      top: 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
    }

    .lia-dyn-table-pool-item{
      display: inline-block;
      width: max-content;
      min-width: 0;
      max-width: var(--lia-table-cell-max);
    }

    .lia-draw-wrap{
      width: 100%;
      max-width: none;
    }



  `;

  (document.head || document.documentElement).appendChild(st);
}

function applyThemeToRoot(root) {
  if (!root) return;

  const c = getNeutralColor();
  const a = getAccentColor();

  root.style.setProperty('--lia-table-fg', c);
  root.style.setProperty('--lia-table-border', c);
  root.style.setProperty('--lia-table-accent', a);
  root.style.setProperty('--lia-table-cell-max', MAX_CELL_PX + 'px');
}

  function refreshAllTableThemes() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="lia-table-"]');
    nodes.forEach(function(node) {
      applyThemeToRoot(node);
    });
  }

  function setStateValue(uid, colIndex, key, value) {
    const st = window.__tableStates[uid];
    if (!st) return;

    st.values = resizeValues(st.values, st.cols);

    if (!st.values[colIndex]) {
      st.values[colIndex] = { x: '', y: '' };
    }

    st.values[colIndex][key] = String(value != null ? value : '');
  }

function getCellWidthKey(colIndex, key) {
  return colIndex + ':' + key;
}

function getStoredCellWidth(uid, colIndex, key) {
  const st = window.__tableStates[uid];
  if (!st || !st.cellWidths) return 0;
  return Math.max(0, parseInt(st.cellWidths[getCellWidthKey(colIndex, key)] || 0, 10) || 0);
}

function setStoredCellWidth(uid, colIndex, key, width) {
  const st = window.__tableStates[uid];
  if (!st) return;

  st.cellWidths = st.cellWidths || {};
  st.cellWidths[getCellWidthKey(colIndex, key)] =
    Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.round(width || MIN_CELL_PX)));
}

const POOL_SIZE = 60;

function ensurePool(uid: string) {
  const id = 'lia-table-pool-' + uid;
  if (document.getElementById(id)) return;

  const pool = document.createElement('div');
  pool.id = id;
  pool.className = 'lia-dyn-table-pool';
  pool.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < POOL_SIZE; i++) {
    const item = document.createElement('div');
    item.className = 'lia-dyn-table-pool-item';
    item.dataset.table = uid;
    item.dataset.index = String(i);
    pool.appendChild(item);
  }

  const root = getRoot(uid);
  if (root && root.parentNode) {
    root.parentNode.insertBefore(pool, root.nextSibling);
  } else {
    (document.body || document.documentElement).appendChild(pool);
  }
}

function getPoolRoot(uid) {
  return document.getElementById('lia-table-pool-' + uid);
}

function getPoolIndex(colIndex, key) {
  return colIndex * 2 + (key === 'y' ? 1 : 0);
}

function reclaimPoolItems(uid) {
  ensurePool(uid);
  const root = getRoot(uid);
  const pool = getPoolRoot(uid);
  if (!root || !pool) return;

  const mounted = root.querySelectorAll('.lia-dyn-table-pool-item[data-index]');
  mounted.forEach(function(node) {
    pool.appendChild(node);
  });
}

function takePoolItem(uid, index) {
  const pool = getPoolRoot(uid);
  if (!pool) return null;

  return pool.querySelector('.lia-dyn-table-pool-item[data-index="' + index + '"]');
}

function calcInputCh(value) {
  const s = String(value != null ? value : '').trim();
  if (!s) return 6;
  return Math.max(6, Math.min(40, s.length + 2));
}

function applyAutoInputWidth(input) {
  if (!input) return;
  input.style.width = calcInputCh(input.value) + 'ch';
}

function isElementLayoutVisible(el) {
  if (!el) return false;

  try {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity || '1') === 0) return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch (e) {
    return false;
  }
}

function isPoolCanvasOpen(poolItem) {
  if (!poolItem) return false;

  const candidates = poolItem.querySelectorAll(
    '.lia-draw-wrap, .lia-draw-block, .lia-ocr-wrap, .lia-canvas-wrap, canvas'
  );

  for (const el of candidates) {
    if (!isElementLayoutVisible(el)) continue;

    try {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) return true;
    } catch (e) {}
  }

  return false;
}

function syncCellWidthFromStack(uid, colIndex, key, stack, poolItem) {
  if (!stack || !stack.closest) return;

  const td = stack.closest('td');
  if (!td) return;

  const storedWidth = getStoredCellWidth(uid, colIndex, key);
  const canvasOpen = isPoolCanvasOpen(poolItem);

  td.style.width = 'auto';
  td.style.minWidth = '0px';
  td.style.maxWidth = MAX_CELL_PX + 'px';

  stack.style.width = 'auto';
  stack.style.minWidth = '0px';
  stack.style.maxWidth = MAX_CELL_PX + 'px';

  if (poolItem) {
    poolItem.style.maxWidth = MAX_CELL_PX + 'px';
  }

  let maxW = 0;

  function takeWidth(el) {
    if (!el) return;
    if (!isElementLayoutVisible(el)) return;

    try {
      const rect = el.getBoundingClientRect();
      maxW = Math.max(
        maxW,
        Math.ceil(rect.width || 0),
        Math.ceil(el.scrollWidth || 0),
        Math.ceil(el.offsetWidth || 0),
        Math.ceil(el.clientWidth || 0)
      );
    } catch (e) {}
  }

  takeWidth(stack);
  if (poolItem) takeWidth(poolItem);

  const descendants = stack.querySelectorAll('*');
  descendants.forEach(function(el) {
    takeWidth(el);
  });

  let effective = maxW;

  if (canvasOpen && storedWidth > 0) {
    effective = Math.max(effective, storedWidth);
  }

  if (effective <= 0) return;

  const clamped = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, effective));

  td.style.width = clamped + 'px';
  td.style.minWidth = clamped + 'px';
  td.style.maxWidth = MAX_CELL_PX + 'px';

  stack.style.width = clamped + 'px';
  stack.style.minWidth = clamped + 'px';
  stack.style.maxWidth = MAX_CELL_PX + 'px';

  if (poolItem) {
    if (canvasOpen) {
      poolItem.style.width = clamped + 'px';
      poolItem.style.minWidth = clamped + 'px';
    } else {
      poolItem.style.width = 'auto';
      poolItem.style.minWidth = '0px';
    }

    poolItem.style.maxWidth = MAX_CELL_PX + 'px';

    const innerHost =
      poolItem.querySelector('.lia-draw-wrap, .lia-draw-block, .lia-ocr-wrap, .lia-canvas-wrap') ||
      poolItem.firstElementChild;

    if (innerHost) {
      if (canvasOpen) {
        innerHost.style.width = clamped + 'px';
        innerHost.style.minWidth = clamped + 'px';
      } else {
        innerHost.style.width = 'auto';
        innerHost.style.minWidth = '0px';
      }
      innerHost.style.maxWidth = 'none';
    }
  }
}

function measureCellBaseWidth(stack, poolItem) {
  if (!stack || !stack.closest) return MIN_CELL_PX;

  const td = stack.closest('td');
  let w = 0;

  function takeWidth(el) {
    if (!el) return;

    try {
      const rect = el.getBoundingClientRect();
      w = Math.max(
        w,
        Math.ceil(rect.width || 0),
        Math.ceil(el.scrollWidth || 0),
        Math.ceil(el.offsetWidth || 0),
        Math.ceil(el.clientWidth || 0)
      );
    } catch (e) {}
  }

  takeWidth(td);
  takeWidth(stack);
  takeWidth(poolItem);

  return Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, w || MIN_CELL_PX));
}

function applyLiveDragWidth(uid, colIndex, key, stack, poolItem, widthPx) {
  if (!stack || !stack.closest) return;

  const td = stack.closest('td');
  if (!td) return;

  const w = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.round(widthPx || MIN_CELL_PX)));

  setStoredCellWidth(uid, colIndex, key, w);

  td.style.width = w + 'px';
  td.style.minWidth = w + 'px';
  td.style.maxWidth = MAX_CELL_PX + 'px';

  stack.style.width = w + 'px';
  stack.style.minWidth = w + 'px';
  stack.style.maxWidth = MAX_CELL_PX + 'px';

  if (poolItem) {
    poolItem.style.width = w + 'px';
    poolItem.style.minWidth = w + 'px';
    poolItem.style.maxWidth = MAX_CELL_PX + 'px';

    const innerHost =
      poolItem.querySelector('.lia-draw-wrap, .lia-draw-block, .lia-ocr-wrap, .lia-canvas-wrap') ||
      poolItem.firstElementChild;

    if (innerHost) {
      innerHost.style.width = w + 'px';
      innerHost.style.minWidth = w + 'px';
      innerHost.style.maxWidth = 'none';
    }
  }
}

function closeCellResizeHeadroom(stack) {
  if (!stack || !stack.closest) return;

  const td = stack.closest('td');
  if (!td) return;

  td.style.width = 'auto';
  td.style.minWidth = '0px';
  td.style.maxWidth = MAX_CELL_PX + 'px';

  stack.style.width = 'auto';
  stack.style.minWidth = '0px';
  stack.style.maxWidth = MAX_CELL_PX + 'px';
}

function isResizeHandleTarget(target, stopNode) {
  let el = target;

  while (el && el !== stopNode && el !== document.body) {
    try {
      const cur = window.getComputedStyle(el).cursor || '';
      if (/resize/i.test(cur)) return true;
    } catch (e) {}

    el = el.parentElement;
  }

  try {
    if (stopNode) {
      const cur = window.getComputedStyle(stopNode).cursor || '';
      if (/resize/i.test(cur)) return true;
    }
  } catch (e) {}

  return false;
}

function openCellResizeHeadroom(stack, poolItem) {
  if (!stack || !stack.closest) return;

  const td = stack.closest('td');
  if (!td) return;

  td.style.width = 'auto';
  td.style.minWidth = '0px';
  td.style.maxWidth = MAX_CELL_PX + 'px';

  stack.style.width = 'auto';
  stack.style.minWidth = '0px';
  stack.style.maxWidth = MAX_CELL_PX + 'px';

  if (poolItem) {
    poolItem.style.width = 'auto';
    poolItem.style.minWidth = '0px';
    poolItem.style.maxWidth = MAX_CELL_PX + 'px';
  }
}



function observeFieldWidth(uid, colIndex, key, stack, input, poolItem) {
  if (!stack || stack.__liaFieldWidthObserved) return;
  stack.__liaFieldWidthObserved = true;

  function syncNow() {
    syncCellWidthFromStack(uid, colIndex, key, stack, poolItem);
  }

  function syncSoon() {
    requestAnimationFrame(syncNow);
  }

  syncSoon();
  setTimeout(syncSoon, 0);
  setTimeout(syncSoon, 80);
  setTimeout(syncSoon, 220);
  setTimeout(syncSoon, 500);

  if (typeof ResizeObserver === 'function') {
    try {
      const ro = new ResizeObserver(function() {
        if (stack.__liaCellResizeDragging) return;
        syncSoon();
      });

      ro.observe(stack);
      if (input) ro.observe(input);
      if (poolItem) ro.observe(poolItem);

      const all = poolItem ? poolItem.querySelectorAll('*') : [];
      all.forEach(function(el) {
        try { ro.observe(el); } catch (e) {}
      });

      stack.__liaFieldWidthRO = ro;
    } catch (e) {}
  }

  if (poolItem && !poolItem.__liaOpenCloseSyncBound) {
  poolItem.__liaOpenCloseSyncBound = true;

  poolItem.addEventListener('click', function() {
    if (stack.__liaCellResizeDragging) return;

    syncSoon();
    setTimeout(syncSoon, 0);
    setTimeout(syncSoon, 80);
    setTimeout(syncSoon, 220);
    setTimeout(syncSoon, 500);
  }, true);

  try {
      const mo = new MutationObserver(function() {
        if (stack.__liaCellResizeDragging) return;

        syncSoon();
        setTimeout(syncSoon, 80);
        setTimeout(syncSoon, 220);
      });

      mo.observe(poolItem, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'open']
      });

      stack.__liaFieldWidthMO = mo;
    } catch (e) {}
  }

  if (poolItem && !poolItem.__liaDragWidthSyncBound) {
    poolItem.__liaDragWidthSyncBound = true;

    let drag = null;

    function start(e) {
      if (!isResizeHandleTarget(e.target, poolItem)) return;

      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseWidth: getStoredCellWidth(uid, colIndex, key) || measureCellBaseWidth(stack, poolItem),
        active: false
      };
    }

    function move(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.active) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        drag.active = true;
        stack.__liaCellResizeDragging = true;
      }

      applyLiveDragWidth(uid, colIndex, key, stack, poolItem, drag.baseWidth + dx);
    }

    function stop(e) {
      if (!drag) return;
      if (e && e.pointerId !== drag.pointerId) return;

      const wasActive = !!drag.active;
      drag = null;

      if (!wasActive) return;

      stack.__liaCellResizeDragging = false;

      syncSoon();
      setTimeout(syncSoon, 80);
      setTimeout(syncSoon, 220);
      setTimeout(syncSoon, 500);
    }

    poolItem.addEventListener('pointerdown', start, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
  }

  window.addEventListener('resize', function() {
    if (stack.__liaCellResizeDragging) return;
    syncSoon();
  });
}


function syncMiniCanvasSize(canvas, host) {
  if (!canvas || !host) return;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(host.offsetWidth || host.clientWidth || 1));
  const h = Math.max(1, Math.round(host.offsetHeight || host.clientHeight || 1));

  const pxW = Math.max(1, Math.round(w * dpr));
  const pxH = Math.max(1, Math.round(h * dpr));

  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;

  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

function scheduleMiniCanvasSync(canvas, host) {
  requestAnimationFrame(function() {
    syncMiniCanvasSize(canvas, host);
  });

  setTimeout(function() {
    syncMiniCanvasSize(canvas, host);
  }, 0);

  setTimeout(function() {
    syncMiniCanvasSize(canvas, host);
  }, 80);
}

function observeMiniCanvas(canvas, host) {
  if (!canvas || !host) return;
  if (host.__liaMiniCanvasObserved) return;
  host.__liaMiniCanvasObserved = true;

  if (typeof ResizeObserver === 'function') {
    try {
      const ro = new ResizeObserver(function() {
        syncMiniCanvasSize(canvas, host);
      });
      ro.observe(host);
      host.__liaMiniCanvasRO = ro;
      return;
    } catch (e) {}
  }

  window.addEventListener('resize', function() {
    syncMiniCanvasSize(canvas, host);
  });
}


function enableRailPan(scroller, rail) {
  if (!scroller || !rail || rail.__liaPanBound) return;
  rail.__liaPanBound = true;

  let drag = null;

  function stopDrag() {
    drag = null;
    rail.classList.remove('is-dragging');
    try { document.body.style.userSelect = ''; } catch (e) {}
  }

  rail.addEventListener('pointerdown', function(e) {
    const interactive = (e.target as HTMLElement)?.closest('button, input, textarea, select, label') ?? null;

    if (interactive) return;

    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startLeft: scroller.scrollLeft
    };

    rail.classList.add('is-dragging');

    try { rail.setPointerCapture(e.pointerId); } catch (err) {}
    try { document.body.style.userSelect = 'none'; } catch (err) {}

    e.preventDefault();
  });

  rail.addEventListener('pointermove', function(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    scroller.scrollLeft = drag.startLeft - dx;

    e.preventDefault();
  });

  rail.addEventListener('pointerup', function(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    stopDrag();
  });

  rail.addEventListener('pointercancel', function() {
    stopDrag();
  });

  rail.addEventListener('lostpointercapture', function() {
    stopDrag();
  });
}

function buildInput(uid, colIndex, key, value) {
  const stack = document.createElement('div');
  stack.className = 'lia-dyn-table-field-stack';

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.className = 'lia-dyn-table-input';
  input.value = String(value != null ? value : '');

  applyAutoInputWidth(input);
  stack.appendChild(input);

  const poolItem = takePoolItem(uid, getPoolIndex(colIndex, key));
  if (poolItem) {
    stack.appendChild(poolItem);
  }

  input.addEventListener('input', function() {
    setStateValue(uid, colIndex, key, input.value);
    applyAutoInputWidth(input);
    syncCellWidthFromStack(uid, colIndex, key, stack, poolItem);
    refreshPointButtons(uid);
  });

  input.addEventListener('blur', function() {
    applyAutoInputWidth(input);
    syncCellWidthFromStack(uid, colIndex, key, stack, poolItem);
    refreshPointButtons(uid);
  });

  observeFieldWidth(uid, colIndex, key, stack, input, poolItem);
  syncCellWidthFromStack(uid, colIndex, key, stack, poolItem);

  return stack;
}

function buildControl(uid, spec, state, scroller) {
  const rail = document.createElement('div');
  rail.className = 'lia-dyn-table-rail';

  const buttons = document.createElement('div');
  buttons.className = 'lia-dyn-table-rail-buttons';

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.className = 'lia-btn lia-dyn-table-btn';
  btnPlus.textContent = '+';
  btnPlus.disabled = state.cols >= MAX_COLS;

  btnPlus.addEventListener('click', function() {
    const st = window.__tableStates[uid];
    if (!st) return;

    st.cols = Math.min(MAX_COLS, st.cols + 1);
    st.values = resizeValues(st.values, st.cols);

    if (typeof window.renderTableFromSpec === 'function') {
      window.renderTableFromSpec(uid, spec, true);
    }
  });

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button';
  btnMinus.className = 'lia-btn lia-dyn-table-btn';
  btnMinus.textContent = '−';
  btnMinus.disabled = state.cols <= MIN_COLS;

  btnMinus.addEventListener('click', function() {
    const st = window.__tableStates[uid];
    if (!st) return;

    st.cols = Math.max(MIN_COLS, st.cols - 1);
    st.values = resizeValues(st.values, st.cols);

    if (typeof window.renderTableFromSpec === 'function') {
      window.renderTableFromSpec(uid, spec, true);
    }
  });

  buttons.appendChild(btnPlus);
  buttons.appendChild(btnMinus);

  rail.appendChild(buttons);

  return rail;
}

function rebuildTable(uid, spec) {
  const root = getRoot(uid);
  if (!root) return false;

  reclaimPoolItems(uid);

  ensureCss();
  applyThemeToRoot(root);

  const st = ensureState(uid, spec);
  const hasPointRow = !!(st.pointPrefix && st.boardId);

  root.innerHTML = '';
  root.classList.add('lia-dyn-table-root');
  root.dataset.spec = spec;

  const shell = document.createElement('div');
  shell.className = 'lia-dyn-table-shell';

  const wrap = document.createElement('div');
  wrap.className = 'lia-dyn-table-wrap';

  const table = document.createElement('table');
  table.className = 'lia-dyn-table';

  const tbody = document.createElement('tbody');

  const tr1 = document.createElement('tr');
  const tr2 = document.createElement('tr');
  const tr3 = hasPointRow ? document.createElement('tr') : null;

  const th1 = document.createElement('th');
  th1.className = 'lia-dyn-table-label lia-dyn-table-double-sep';
  const th1Inner = document.createElement('div');
  th1Inner.innerHTML = normalizeLabelMath(st.row1, false);
  th1.appendChild(th1Inner);

  const th2 = document.createElement('th');
  th2.className =
    'lia-dyn-table-label lia-dyn-table-double-sep' +
    (hasPointRow ? '' : ' lia-dyn-table-bottom-row');
  const th2Inner = document.createElement('div');
  th2Inner.innerHTML = normalizeLabelMath(st.row2, true);
  th2.appendChild(th2Inner);

  tr1.appendChild(th1);
  tr2.appendChild(th2);

  let th3Inner = null;

if (hasPointRow && tr3) {
  const th3 = document.createElement('th');
  th3.className = 'lia-dyn-table-label lia-dyn-table-double-sep lia-dyn-table-bottom-row';

  th3Inner = document.createElement('div');
  th3Inner.innerHTML = '&nbsp;';
  th3.appendChild(th3Inner);

  tr3.appendChild(th3);
}

  for (let i = 0; i < st.cols; i++) {
    const isLast = i === st.cols - 1;

    const tdTop = document.createElement('td');
    tdTop.className =
      'lia-dyn-table-value' +
      (isLast ? ' lia-dyn-table-last-col' : '');
    tdTop.appendChild(buildInput(uid, i, 'x', st.values[i] ? st.values[i].x : ''));
    tr1.appendChild(tdTop);

    const tdBottom = document.createElement('td');
    tdBottom.className =
      'lia-dyn-table-value' +
      (hasPointRow ? '' : ' lia-dyn-table-bottom-row') +
      (isLast ? ' lia-dyn-table-last-col' : '');
    tdBottom.appendChild(buildInput(uid, i, 'y', st.values[i] ? st.values[i].y : ''));
    tr2.appendChild(tdBottom);

    if (hasPointRow && tr3) {
      const tdPoint = document.createElement('td');
      tdPoint.className =
        'lia-dyn-table-value lia-dyn-table-bottom-row' +
        (isLast ? ' lia-dyn-table-last-col' : '');

      tdPoint.appendChild(buildPointButton(uid, i, st));
      tr3.appendChild(tdPoint);
    }
  }

  tbody.appendChild(tr1);
  tbody.appendChild(tr2);
  if (hasPointRow && tr3) tbody.appendChild(tr3);

  table.appendChild(tbody);
  wrap.appendChild(table);

  const rail = buildControl(uid, spec, st, wrap);

  shell.appendChild(wrap);
  shell.appendChild(rail);
  root.appendChild(shell);

  typesetNode(th1Inner);
  typesetNode(th2Inner);
  if (th3Inner) typesetNode(th3Inner);

  refreshPointButtons(uid);

  root.__liaTableMounted = true;
  root.__liaTableLastSpec = spec;

  return true;
}

  window.renderTableFromSpec = function(uid, spec, force) {
    const root = getRoot(uid);
    if (!root) return false;

    if (!force && root.__liaTableMounted && root.__liaTableLastSpec === spec) {
      applyThemeToRoot(root);
      return true;
    }

    return rebuildTable(uid, spec);
  };

  window.getTableValues = function(uid) {
    const st = window.__tableStates[uid];
    if (!st) return [];

    return resizeValues(st.values, st.cols).map(function(v) {
      return { x: v.x, y: v.y };
    });
  };

window.getTableData = function(uid) {
  const st = window.__tableStates[uid];
  if (!st) return null;

  return {
    uid: uid,
    cols: st.cols,
    rows: st.pointPrefix && st.boardId ? 3 : 2,
    row1: st.row1,
    row2: st.row2,
    pointPrefix: st.pointPrefix || '',
    boardId: st.boardId || '',
    values: window.getTableValues(uid)
  };
};

  window.setTableValues = function(uid, values) {
    const st = window.__tableStates[uid];
    if (!st) return false;

    const arr = Array.isArray(values) ? values : [];
    const newCount = Math.max(MIN_COLS, Math.min(MAX_COLS, arr.length || st.cols || DEFAULT_COLS));

    st.cols = newCount;
    st.values = resizeValues(arr, newCount);

    const root = getRoot(uid);
    if (root && typeof window.renderTableFromSpec === 'function') {
      window.renderTableFromSpec(uid, root.dataset.spec || st.spec || '', true);
    }

    return true;
  };

  window.__bootstrapTables = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="lia-table-"][data-spec]');

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^lia-table-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;

      window.renderTableFromSpec(uid, spec, false);
      applyThemeToRoot(node);
    });
  };

  if (!window.__scheduleBootstrapTables) {
    window.__scheduleBootstrapTables = function() {
      if (window.__bootstrapTablesRAF) return;

      window.__bootstrapTablesRAF = requestAnimationFrame(function() {
        window.__bootstrapTablesRAF = 0;
        try {
          if (window.__bootstrapTables) window.__bootstrapTables();
        } catch (e) {}
      });
    };
  }

  try {
    const mo = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];

        if (m.type === 'attributes') {
          const target = m.target as HTMLElement;
          if (target && target.id && /^lia-table-/.test(target.id)) {
            needsBootstrap = true;
            break;
          }
        }

        if (m.type !== 'childList') continue;

        const added = Array.from(m.addedNodes || []);
        for (let j = 0; j < added.length; j++) {
          const n = added[j] as HTMLElement;
          if (!n || n.nodeType !== 1) continue;

          if (
            (n.id && /^lia-table-/.test(n.id)) ||
            (n.querySelector && n.querySelector('[id^="lia-table-"][data-spec]'))
          ) {
            needsBootstrap = true;
            break;
          }
        }

        if (needsBootstrap) break;
      }

      if (needsBootstrap && window.__scheduleBootstrapTables) {
        window.__scheduleBootstrapTables();
      }
    });

    const root = document.body || document.documentElement;
    if (root) {
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-spec']
      });
    }
  } catch (e) {}

  try {
    window.addEventListener('hashchange', function() {
      if (window.__scheduleBootstrapTables) window.__scheduleBootstrapTables();
    }, true);
  } catch (e) {}

  try {
    window.addEventListener('pageshow', function() {
      if (window.__scheduleBootstrapTables) window.__scheduleBootstrapTables();
    }, true);
  } catch (e) {}

  try {
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && window.__scheduleBootstrapTables) {
        window.__scheduleBootstrapTables();
      }
    }, true);
  } catch (e) {}

  initThemeSync();
  window.__registerLiaThemeListener(refreshAllTableThemes);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapTables) window.__scheduleBootstrapTables();
  });
}
