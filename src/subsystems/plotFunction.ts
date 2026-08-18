// Plot function subsystem (@PlotFunction macro).
// Renders a function graph from a mathematical expression onto a JSXGraph board.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { compileFunctionExpression } from '../shared/functionExpression';
import { applyLineStyle, lineStyleAttributes, parseLineStyleOptions } from '../shared/lineStyle';

export function init(): void {
  if (window.__plotFunctionReady) {
    try {
      if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions();
    } catch (e) {}
    return;
  }
  window.__plotFunctionReady = true;

  window.__plotFunctionEntries = window.__plotFunctionEntries || {};

  function decodeExprPlaceholders(s) {
    return String(s || '')
      .replace(/\{\{/g, '(')
      .replace(/\}\}/g, ')');
  }

  function visibilityOptionValue(value) {
    const match = String(value == null ? '' : value).trim()
      .match(/^(?:visible|sichtbar)\s*=\s*(0|1|false|true)$/i);
    if (!match) return null;
    return !/^(?:0|false)$/i.test(match[1]);
  }

  function parsePlotSpec(spec) {
    const raw = unquote(spec);
    const parts = splitTopLevel(raw, ';');
    const parsedName = parseMacroName(parts[1] ? unquote(parts[1]) : 'f', 'f');
    const options = parts.slice(4).map(function(part) { return unquote(part).trim(); });
    const visibilityOptions = options
      .map(visibilityOptionValue)
      .filter(function(value) { return value != null; });

    return {
      boardId: parts[0] ? unquote(parts[0]) : '',
      name:    parsedName.name,
      showName: parsedName.showName && !options.some(isHiddenNameOption),
      visible: visibilityOptions.length ? visibilityOptions[visibilityOptions.length - 1] : true,
      expr:    parts[2] ? decodeExprPlaceholders(unquote(parts[2])) : '',
      color:   parts[3] ? unquote(parts[3]) : 'red',
      lineStyle: parseLineStyleOptions(options)
    };
  }

  function makeKey(uid) {
    return 'plot-' + uid;
  }

  function removeExisting(uid) {
    const key = makeKey(uid);
    const entry = window.__plotFunctionEntries[key];
    if (!entry) return;

    try {
      if (entry.graph && entry.graph.board) {
        entry.graph.board.removeObject(entry.graph);
      }
    } catch (e) {}

    try {
      if (entry.label && entry.label.board) {
        entry.label.board.removeObject(entry.label);
      }
    } catch (e) {}

    try {
      if (entry.anchor && entry.anchor.board) {
        entry.anchor.board.removeObject(entry.anchor);
      }
    } catch (e) {}

    delete window.__plotFunctionEntries[key];
    try { if (window.__scheduleFunctionAnalysisPointsForBoard) window.__scheduleFunctionAnalysisPointsForBoard(entry.boardId); } catch (e) {}
  }

  function sameBoard(a, b) {
    try {
      return !!a && !!b && a === b;
    } catch (e) {
      return false;
    }
  }

  const functionEvaluationStack = new Set<any>();

  function normalizeFunctionBindingName(value) {
    let name = String(value == null ? '' : value).trim();
    name = name
      .replace(/^\\\(|\\\)$/g, '')
      .replace(/^\$+|\$+$/g, '')
      .replace(/\s*\(\s*x\s*\)\s*$/i, '')
      .trim()
      .toLowerCase();
    return /^[a-z][a-z0-9]*$/.test(name) ? name : '';
  }

  function boardObjects(board) {
    const result: any[] = [];
    const seen = new Set<any>();
    const add = function(object) {
      if (!object || seen.has(object)) return;
      seen.add(object);
      result.push(object);
    };
    try {
      if (Array.isArray(board && board.objectsList)) board.objectsList.forEach(add);
    } catch (e) {}
    try {
      Object.keys(board && board.objects || {}).forEach(function(id) { add(board.objects[id]); });
    } catch (e) {}
    return result;
  }

  function isFunctionBindingTarget(object) {
    return !!object && (
      object.__liaDgsFunction === true ||
      typeof object.__liaDgsFunctionEvaluator === 'function' ||
      (!!object.__liaPlotFunctionName && typeof object.Y === 'function')
    );
  }

  function functionBindingName(object, fallback) {
    return normalizeFunctionBindingName(
      object && (object.__liaDgsFunctionName || object.__liaPlotFunctionName || object.name) || fallback
    );
  }

  function availableFunctionNames(boardId, board, excludeUid, excludeGraph) {
    const names = new Set<string>();
    const addObject = function(object, fallbackName) {
      if (!isFunctionBindingTarget(object) || object === excludeGraph) return;
      if (excludeUid && String(object.__liaPlotFunctionUid || '') === excludeUid) return;
      const name = functionBindingName(object, fallbackName);
      if (name) names.add(name);
    };

    boardObjects(board).forEach(function(object) { addObject(object, ''); });
    Object.keys(window.__plotFunctionEntries || {}).forEach(function(key) {
      const entry = window.__plotFunctionEntries[key];
      if (!entry || String(entry.boardId || '') !== boardId || String(entry.uid || '') === excludeUid) return;
      if (!entry.graph || !sameBoard(entry.graph.board, board)) return;
      addObject(entry.graph, entry.name);
    });
    return Array.from(names).sort();
  }

  function findFunctionBindingTarget(boardId, board, name, excludeUid, excludeGraph) {
    const objects = boardObjects(board);
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index];
      if (!isFunctionBindingTarget(object) || object === excludeGraph) continue;
      if (excludeUid && String(object.__liaPlotFunctionUid || '') === excludeUid) continue;
      if (functionBindingName(object, '') === name) return object;
    }

    const entries = window.__plotFunctionEntries || {};
    const keys = Object.keys(entries);
    for (let index = 0; index < keys.length; index += 1) {
      const entry = entries[keys[index]];
      if (!entry || String(entry.boardId || '') !== boardId || String(entry.uid || '') === excludeUid) continue;
      const graph = entry.graph;
      if (!graph || graph === excludeGraph || !sameBoard(graph.board, board)) continue;
      if (functionBindingName(graph, entry.name) === name) return graph;
    }
    return null;
  }

  function isCurrentFunctionBindingTarget(target, board, name, excludeUid, excludeGraph) {
    if (!target || target === excludeGraph || !isFunctionBindingTarget(target)) return false;
    if (excludeUid && String(target.__liaPlotFunctionUid || '') === excludeUid) return false;
    if (functionBindingName(target, '') !== name) return false;
    try {
      if (target.id && board && board.objects && board.objects[target.id] !== target) return false;
      if (!target.id && Array.isArray(board && board.objectsList) && !board.objectsList.includes(target)) return false;
    } catch (e) {
      return false;
    }
    return true;
  }

  function createFunctionBinding(boardId, board, name, excludeUid, excludeGraph) {
    let cachedTarget: any = null;
    return function(x) {
      const currentBoard = window.__boards && window.__boards[boardId];
      if (!sameBoard(currentBoard, board)) return NaN;
      if (!isCurrentFunctionBindingTarget(cachedTarget, board, name, excludeUid, excludeGraph)) {
        cachedTarget = findFunctionBindingTarget(boardId, board, name, excludeUid, excludeGraph);
      }
      const target = cachedTarget;
      if (!target || functionEvaluationStack.has(target)) return NaN;
      functionEvaluationStack.add(target);
      try {
        const evaluator = typeof target.__liaDgsFunctionEvaluator === 'function'
          ? target.__liaDgsFunctionEvaluator
          : target.Y;
        if (typeof evaluator !== 'function') return NaN;
        const value = Number(evaluator(x));
        return Number.isFinite(value) ? value : NaN;
      } catch (e) {
        return NaN;
      } finally {
        functionEvaluationStack.delete(target);
      }
    };
  }

  function normalizeExpr(expr) {
    let s = String(expr || '').trim();

    s = s.replace(/^[A-Za-z][A-Za-z0-9_]*\s*\(\s*x\s*\)\s*=\s*/i, '');
    s = s.replace(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*/i, '');

    s = s.replace(/−/g, '-');
    s = s.replace(/\^/g, '**');

    s = s.replace(/(\d)\s*x\b/g, '$1*x');
    s = s.replace(/(\d)\s*\(/g, '$1*(');
    s = s.replace(/\bx\s*\(/g, 'x*(');
    s = s.replace(/\)\s*(\d)/g, ')*$1');

    return s.trim();
  }

  function compileExpr(expr, boardId, uid, excludeGraph) {
    try {
      const board = window.__boards && window.__boards[boardId];
      if (!board) return null;
      const sliderBindings = typeof window.__getCoordSliderBindings === 'function'
        ? window.__getCoordSliderBindings(boardId)
        : {};
      const functionBindings: Record<string, (x: number) => number> = {};
      availableFunctionNames(boardId, board, String(uid || ''), excludeGraph).forEach(function(name) {
        functionBindings[name] = createFunctionBinding(
          boardId,
          board,
          name,
          String(uid || ''),
          excludeGraph
        );
      });
      const compiled = compileFunctionExpression(expr, functionBindings, sliderBindings);
      return compiled.fn ? compiled : null;
    } catch (e) {
      return null;
    }
  }

  function safeBBox(board) {
    try {
      const bb = board.getBoundingBox();
      if (
        Array.isArray(bb) &&
        bb.length === 4 &&
        bb.every(v => Number.isFinite(v)) &&
        bb[2] > bb[0] &&
        bb[1] > bb[3]
      ) {
        return bb.slice();
      }
    } catch (e) {}

    return [-5, 5, 5, -5];
  }

  function texName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    if (raw.includes('\\(') || raw.includes('\\[') || raw.includes('$')) return raw;
    return '\\(' + raw + '\\)';
  }

  function chooseVisibleAnchorX(board, fn) {
    const bb = safeBBox(board);
    const xmin = bb[0];
    const ymax = bb[1];
    const xmax = bb[2];
    const ymin = bb[3];

    const xspan = xmax - xmin;
    const yspan = ymax - ymin;

    const xStart = xmax - 0.10 * xspan;
    const xEnd   = xmin + 0.18 * xspan;

    const yPadTop = 0.14 * yspan;
    const yPadBottom = 0.12 * yspan;

    const steps = 120;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = xStart - t * (xStart - xEnd);

      let y;
      try {
        y = fn(x);
      } catch (e) {
        y = NaN;
      }

      if (!Number.isFinite(y)) continue;
      if (y <= ymax - yPadTop && y >= ymin + yPadBottom) return x;
    }

    return xmin + 0.60 * xspan;
  }

  function createFunctionLabel(board, fn, name, color, visible) {
    const labelText = texName(name);

    const anchor = board.create('point', [
      function() {
        return chooseVisibleAnchorX(board, fn);
      },
      function() {
        const x = chooseVisibleAnchorX(board, fn);
        let y;

        try {
          y = fn(x);
        } catch (e) {
          y = NaN;
        }

        if (!Number.isFinite(y)) {
          const bb = safeBBox(board);
          return (bb[1] + bb[3]) / 2;
        }

        return y;
      }
    ], {
      visible: false,
      fixed: true,
      withLabel: false,
      name: ''
    });

    const label = board.create('text', [
      function() {
        return anchor.X() + 0.18;
      },
      function() {
        return anchor.Y() + 0.18;
      },
      function() {
        return labelText;
      }
    ], {
      fixed: true,
      visible: visible !== false,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      strokeColor: color,
      fillColor: color,
      fontSize: 28,
      anchorX: 'left',
      anchorY: 'top'
    });

    return { anchor, label };
  }

  function applyFunctionVisibility(graph, label, showName, visible) {
    const showObject = visible !== false;
    try {
      if (graph && typeof graph.setAttribute === 'function') {
        graph.setAttribute({ visible: showObject });
      }
    } catch (e) {}
    try {
      if (label && typeof label.setAttribute === 'function') {
        label.setAttribute({ visible: showObject && showName !== false });
      }
    } catch (e) {}
  }

  function applyDgsFunctionMetadata(graph, cfg) {
    if (!graph || !cfg || typeof cfg.fn !== 'function') return;
    graph.__liaDgsMacroManaged = true;
    graph.__liaDgsFunction = true;
    graph.__liaDgsFunctionEvaluator = cfg.fn;
    graph.__liaDgsFunctionName = cfg.name;
    graph.__liaDgsFunctionExpression = cfg.expression;
    graph.__liaDgsFunctionNormalized = cfg.normalized;
    graph.__liaDgsShowName = cfg.showName !== false;
    graph.__liaDgsShowExpression = false;
    graph.__liaDgsShowObject = cfg.visible !== false;
    graph.__liaDgsOpacity = 1;
    graph.__liaDgsColor = cfg.color;
    graph.__liaDgsLineColor = cfg.color;
    graph.__liaDgsTextColor = cfg.color;
    graph.__liaDgsFillColor = cfg.color;
    graph.__liaDgsFormatFontSize = 28;
    graph.__liaDgsLanguage = graph.__liaDgsLanguage ||
      (/^de(?:-|$)/i.test(String(document.documentElement.lang || '')) ? 'de' : 'en');
    graph.label = cfg.label || null;
    graph.__liaDgsFunctionLabel = cfg.label || null;
    applyLineStyle(graph, cfg.lineStyle || 'solid');
  }

  window.renderPlotFunctionFromSpec = function(uid, spec) {
    const cfg = parsePlotSpec(spec);

    const boardId = String(cfg.boardId || '').trim();
    const name = String(cfg.name || 'f').trim() || 'f';
    const expr = String(cfg.expr || '').trim();
    const color = String(cfg.color || 'red').trim() || 'red';
    const showName = cfg.showName !== false;
    const visible = cfg.visible !== false;
    const lineStyle = cfg.lineStyle || 'solid';

    if (!boardId || !expr) return false;

    const board = window.__boards && window.__boards[boardId];
    if (!board) return false;

    const key = makeKey(uid);
    const old = window.__plotFunctionEntries[key];
    const compiled = compileExpr(expr, boardId, String(uid || ''), old && old.graph);
    if (!compiled || typeof compiled.fn !== 'function') return false;
    const fn = compiled.fn;

    if (
      old &&
      old.boardId === boardId &&
      old.name === name &&
      old.showName === showName &&
      old.expr === expr &&
      old.color === color &&
      old.graph &&
      old.evaluatorState &&
      typeof old.evaluator === 'function' &&
      sameBoard(old.graph.board, board)
    ) {
      old.graph.__liaPlotFunctionUid = String(uid || '');
      old.evaluatorState.fn = fn;
      old.fn = fn;
      old.normalized = compiled.normalized;
      old.visible = visible;
      old.lineStyle = lineStyle;
      applyFunctionVisibility(old.graph, old.label, showName, visible);
      applyDgsFunctionMetadata(old.graph, {
        fn: old.evaluator,
        name,
        expression: expr,
        normalized: compiled.normalized,
        showName,
        visible,
        color,
        lineStyle,
        label: old.label
      });
      old.graph.needsUpdate = true;
      try { if (typeof old.graph.updateCurve === 'function') old.graph.updateCurve(); } catch (e) {}
      try { if (typeof board.update === 'function') board.update(); } catch (e) {}
      return true;
    }

    removeExisting(uid);

    try {
      const evaluatorState = { fn };
      const evaluator = function(x: number): number {
        return Number(evaluatorState.fn(x));
      };
      const graph = board.create('functiongraph', [evaluator], {
        strokeColor: color,
        highlightStrokeColor: color,
        strokeWidth: 3,
        ...lineStyleAttributes(lineStyle),
        resolution: 3,
        vectorContent: 2,
        plotpoints: false,
        fixed: true,
        withLabel: false,
        visible: visible
      });
      graph.__liaPlotFunctionName = name;
      graph.__liaPlotFunctionExpression = expr;
      graph.__liaPlotFunctionUid = String(uid || '');
      const labelPack = createFunctionLabel(board, evaluator, name, color, showName && visible);
      applyDgsFunctionMetadata(graph, {
        fn: evaluator,
        name,
        expression: expr,
        normalized: compiled.normalized,
        showName,
        visible,
        color,
        lineStyle,
        label: labelPack.label
      });

      window.__plotFunctionEntries[key] = {
        uid: uid,
        boardId: boardId,
        name: name,
        showName: showName,
        visible: visible,
        expr: expr,
        normalized: compiled.normalized,
        fn: fn,
        evaluatorState: evaluatorState,
        evaluator: evaluator,
        color: color,
        lineStyle: lineStyle,
        graph: graph,
        anchor: labelPack.anchor,
        label: labelPack.label
      };

      try { board.update(); } catch (e) {}
      try { if (window.__scheduleBootstrapFunctionAnalysisPoints) window.__scheduleBootstrapFunctionAnalysisPoints(); } catch (e) {}
      try { if (window.__scheduleFunctionAnalysisPointsForBoard) window.__scheduleFunctionAnalysisPointsForBoard(boardId); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  };

  let plotBootstrapRunning = false;
  let unresolvedRetrySignature = '';
  let unresolvedRetryCount = 0;
  const unresolvedBoardFunctionSignatures = new Map<string, string>();
  const observedPendingBoards = new WeakSet<any>();
  const MAX_UNRESOLVED_RETRIES = 8;

  function queuePlotFunctionBootstrap() {
    if (window.__bootstrapPlotFunctionsRAF) return;
    window.__bootstrapPlotFunctionsRAF = requestAnimationFrame(function() {
      window.__bootstrapPlotFunctionsRAF = 0;
      try {
        if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions();
      } catch (e) {}
    });
  }

  window.__scheduleBootstrapPlotFunctions = function() {
    unresolvedRetrySignature = '';
    unresolvedRetryCount = 0;
    queuePlotFunctionBootstrap();
  };

  function plotSpecBoardId(spec) {
    try {
      return String(parsePlotSpec(spec).boardId || '').trim();
    } catch (e) {
      return '';
    }
  }

  function boardFunctionSignature(boardId, board) {
    return availableFunctionNames(boardId, board, '', null).join(',');
  }

  function observePendingBoard(boardId, board) {
    if (!boardId || !board) return;
    unresolvedBoardFunctionSignatures.set(boardId, boardFunctionSignature(boardId, board));
    if (observedPendingBoards.has(board)) return;
    observedPendingBoards.add(board);
    try {
      board.on('update', function() {
        if (!unresolvedBoardFunctionSignatures.has(boardId)) return;
        const currentBoard = window.__boards && window.__boards[boardId];
        if (!sameBoard(currentBoard, board)) return;
        const nextSignature = boardFunctionSignature(boardId, board);
        if (nextSignature === unresolvedBoardFunctionSignatures.get(boardId)) return;
        unresolvedBoardFunctionSignatures.set(boardId, nextSignature);
        if (window.__scheduleBootstrapPlotFunctions) {
          window.__scheduleBootstrapPlotFunctions();
        }
      });
    } catch (e) {}
  }

  function updatePendingBoardObservers(pending) {
    const pendingBoardIds = new Set<string>();
    pending.forEach(function(item) {
      const boardId = plotSpecBoardId(item.spec);
      if (!boardId) return;
      pendingBoardIds.add(boardId);
      const board = window.__boards && window.__boards[boardId];
      if (board) observePendingBoard(boardId, board);
    });
    Array.from(unresolvedBoardFunctionSignatures.keys()).forEach(function(boardId) {
      if (!pendingBoardIds.has(boardId)) {
        unresolvedBoardFunctionSignatures.delete(boardId);
      }
    });
  }

  function scheduleUnresolvedRetry(pending) {
    const signature = pending
      .map(function(item) { return item.uid + '\u001f' + item.spec; })
      .sort()
      .join('\u001e');
    if (signature !== unresolvedRetrySignature) {
      unresolvedRetrySignature = signature;
      unresolvedRetryCount = 0;
    }
    if (unresolvedRetryCount >= MAX_UNRESOLVED_RETRIES) return;
    unresolvedRetryCount += 1;
    queuePlotFunctionBootstrap();
  }

  window.__bootstrapPlotFunctions = function() {
    if (plotBootstrapRunning) {
      queuePlotFunctionBootstrap();
      return;
    }
    plotBootstrapRunning = true;
    try {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('[id^="plot-spec-"][data-spec]')
      );
      let pending = nodes.map(function(node) {
        return {
          uid: String(node.id || '').replace(/^plot-spec-/, ''),
          spec: String(node.dataset.spec || '')
        };
      }).filter(function(item) {
        return !!item.uid && !!item.spec;
      });

      const maxPasses = Math.max(1, pending.length + 1);
      for (let pass = 0; pass < maxPasses && pending.length; pass += 1) {
        const next: typeof pending = [];
        let progress = false;
        pending.forEach(function(item) {
          if (window.renderPlotFunctionFromSpec(item.uid, item.spec)) {
            progress = true;
          } else {
            next.push(item);
          }
        });
        pending = next;
        if (!progress) break;
      }

      updatePendingBoardObservers(pending);
      if (pending.length) {
        scheduleUnresolvedRetry(pending);
      } else {
        unresolvedRetrySignature = '';
        unresolvedRetryCount = 0;
      }
    } finally {
      plotBootstrapRunning = false;
    }
  };

  try {
    const mo = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];

        if (m.type === 'attributes') {
          const target = m.target as HTMLElement;
          if (target && target.id && /^plot-spec-/.test(target.id)) {
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
            (n.id && /^plot-spec-/.test(n.id)) ||
            (n.querySelector && n.querySelector('[id^="plot-spec-"][data-spec]'))
          ) {
            needsBootstrap = true;
            break;
          }
        }

        if (needsBootstrap) break;
      }

      if (needsBootstrap && window.__scheduleBootstrapPlotFunctions) {
        window.__scheduleBootstrapPlotFunctions();
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
    if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions();
  } catch (e) {}
}
