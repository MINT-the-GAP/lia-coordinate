// Create-point subsystem (@CreatePoint and @Point macros).
// Handles draggable student points and pre-placed static points on a JSXGraph board.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { getCoordinateQuizRoot, isQuizResolveButton } from '../shared/quizDom';

/** Build the visual attributes that a static @Point needs on its first paint. */
export function getStaticPointCreationAttributes(target: any, neutralColor = '#000'): any {
  const color = String(target && target.color || '#ff00ff').trim() || '#ff00ff';
  const rawOpacity = target && target.opacity;
  const opacityValue = rawOpacity == null || rawOpacity === '' ? NaN : Number(rawOpacity);
  const opacity = Number.isFinite(opacityValue)
    ? Math.max(0, Math.min(1, opacityValue))
    : 1;
  const labelColor = target && target.hasExplicitColor ? color : neutralColor;
  return {
    strokeColor: color,
    fillColor: color,
    highlightStrokeColor: color,
    highlightFillColor: color,
    strokeOpacity: opacity,
    fillOpacity: opacity,
    highlightStrokeOpacity: opacity,
    highlightFillOpacity: opacity,
    label: {
      strokeColor: labelColor,
      fillColor: labelColor,
      strokeOpacity: opacity,
      fillOpacity: opacity,
      highlightStrokeOpacity: opacity,
      highlightFillOpacity: opacity
    }
  };
}

export function init(): void {
  if (window.__createPointReady) {
    try {
      if (window.__bootstrapCreatePoints) window.__bootstrapCreatePoints();
    } catch (e) {}
    return;
  }
  window.__createPointReady = true;

  try {
    if (window.JXG && JXG.Options && JXG.Options.text) {
      JXG.Options.text.useMathJax = true;
    }
  } catch (e) {}

  window.__points = window.__points || {};
  window.__pointStates = window.__pointStates || {};
  window.__pointNeutralColor = getNeutralColor;
  window.__createPointInstances = window.__createPointInstances || {};

  initThemeSync();

  function splitSpec(spec) {
    return splitTopLevel(unquote(spec), ';')
      .map(function(s){ return s.trim(); });
  }

  function parseFixToken(v) {
    return /^fix$/i.test(String(v || '').trim());
  }

  function parseHelperToken(v) {
    return /^(?:helper|hilfspunkt)\s*=\s*1$/i.test(String(v || '').trim());
  }

  function parseInternalPointOption(v) {
    return /^(?:helper|hilfspunkt|xexpr|yexpr|parameter|param)\s*=/i.test(String(v || '').trim());
  }

  function texName(name) {
    const s = String(name || '').trim();
    if (!s) return '\\(A\\)';
    if (s.includes('\\(') || s.includes('\\[') || s.includes('$')) return s;

    const m = s.match(/^(.+?)_(.+)$/);
    if (m) {
      return '\\(' + m[1] + '_{' + m[2] + '}\\)';
    }

    return '\\(' + s + '\\)';
  }

  function ensureBuckets(boardId) {
    window.__points[boardId] = window.__points[boardId] || {};
    window.__pointStates[boardId] = window.__pointStates[boardId] || {};
  }

  function getPointTargetFromSpec(spec) {
    const parts = splitSpec(spec);
    const parsedName = parseMacroName(parts[1] || 'A', 'A');
    const rawOptions = parts.slice(4);
    const visualOptions = rawOptions.filter(function(option) {
      return !isHiddenNameOption(option) && !parseInternalPointOption(option);
    });
    const colorToken = String(visualOptions[0] || '').trim();
    const hasExplicitColor = !!colorToken && !parseFixToken(colorToken);
    const opacityToken = String(visualOptions[1] || '').trim();
    const parsedOpacity = parseFloat(opacityToken.replace(',', '.'));
    const namedOption = function(names) {
      const optionNames = Array.isArray(names) ? names : [names];
      const option = rawOptions.find(function(value) {
        return optionNames.some(function(name) {
          return new RegExp('^' + name + '\\s*=', 'i').test(String(value || '').trim());
        });
      });
      if (!option) return '';
      const match = String(option).match(/^[^=]+=\s*([\s\S]*)$/);
      return match ? unquote(String(match[1] || '').trim()) : '';
    };
    const parameterToken = namedOption(['parameter', 'param']).replace(',', '.');
    const coordinateParameter = parameterToken === '' ? NaN : Number(parameterToken);

    return {
      boardId: parts[0] || '',
      name: parsedName.name || 'A',
      showName: parsedName.showName && !rawOptions.some(isHiddenNameOption),
      tx: parseFloat((parts[2] || '').replace(',', '.')),
      ty: parseFloat((parts[3] || '').replace(',', '.')),
      color: hasExplicitColor ? colorToken : '#ff00ff',
      hasExplicitColor: hasExplicitColor,
      opacity: Number.isFinite(parsedOpacity)
        ? Math.max(0, Math.min(1, parsedOpacity))
        : 1,
      fixed: visualOptions.some(parseFixToken),
      helper: rawOptions.some(parseHelperToken),
      xExpression: namedOption('xexpr'),
      yExpression: namedOption('yexpr'),
      coordinateParameter: Number.isFinite(coordinateParameter) ? coordinateParameter : null
    };
  }

  function findPointMacroObject(uid, spec) {
    const target = getPointTargetFromSpec(spec);
    const board = window.__boards && window.__boards[target.boardId];
    let point = window.__points && window.__points[target.boardId] &&
      window.__points[target.boardId][target.name];
    if (!uid || !board) return null;
    const key = 'macro:point:' + String(uid);
    if (!point || point.board !== board) {
      const objects = board.objects && typeof board.objects === 'object'
        ? Object.keys(board.objects).map(function(objectKey) { return board.objects[objectKey]; })
        : [];
      point = objects.find(function(candidate) {
        return candidate && candidate.board === board && candidate.__liaDgsMacroKey === key;
      }) || null;
    }
    return point && point.board === board ? point : null;
  }

  function assignPointMacroIdentity(uid, spec) {
    const target = getPointTargetFromSpec(spec);
    const point = findPointMacroObject(uid, spec);
    if (!point) return null;
    ensureBuckets(target.boardId);
    const key = 'macro:point:' + String(uid);
    // Keep the source name as a resolver alias even when the visible DGS name
    // is changed. Dependent macros still refer to the name from their source.
    window.__points[target.boardId][target.name] = point;
    point.__liaDgsMacroManaged = true;
    point.__liaDgsMacroKey = key;
    point.__liaDgsPersistentId = key;
    point.__liaDgsMacroPointName = target.name;
    point.__liaPointMacroSpec = String(spec || '');
    try {
      if (window.__scheduleMacroCodeOrderLayers) {
        window.__scheduleMacroCodeOrderLayers();
      }
    } catch (e) {}
    return point;
  }

  function stylePointLabel(pt) {
    if (!pt || typeof pt.setAttribute !== 'function') return;

    const visual = pt.__liaPointVisual || null;
    const c = visual && visual.hasExplicitColor
      ? String(visual.color || '#ff00ff')
      : getNeutralColor();
    const opacity = visual && Number.isFinite(Number(visual.opacity))
      ? Math.max(0, Math.min(1, Number(visual.opacity)))
      : 1;
    const showName = pt.__liaDgsShowName !== false;

    try {
      pt.setAttribute({
        label: {
          strokeColor: c,
          fillColor: c,
          strokeOpacity: opacity,
          fillOpacity: opacity,
          highlightStrokeOpacity: opacity,
          highlightFillOpacity: opacity,
          visible: showName,
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });
    } catch (e) {}

    try {
      if (pt.label && typeof pt.label.setAttribute === 'function') {
        pt.label.setAttribute({
          strokeColor: c,
          fillColor: c,
          strokeOpacity: opacity,
          fillOpacity: opacity,
          highlightStrokeOpacity: opacity,
          highlightFillOpacity: opacity,
          visible: showName,
          fontSize: 24,
          parse: false,
          useMathJax: true
        });
      }
    } catch (e) {}

    try {
      if (pt.label && showName && typeof pt.label.showElement === 'function') pt.label.showElement();
      if (pt.label && !showName && typeof pt.label.hideElement === 'function') pt.label.hideElement();
    } catch (e) {}

    try {
      if (pt.label && pt.label.rendNode && pt.label.rendNode.style) {
        pt.label.rendNode.style.opacity = String(showName ? opacity : 0);
      }
    } catch (e) {}
  }

  function applyStaticPointVisual(pt, target) {
    if (!pt || typeof pt.setAttribute !== 'function') return;

    const color = String(target.color || '#ff00ff').trim() || '#ff00ff';
    const opacity = Number.isFinite(Number(target.opacity))
      ? Math.max(0, Math.min(1, Number(target.opacity)))
      : 1;
    const labelColor = target.hasExplicitColor ? color : getNeutralColor();

    pt.__liaPointVisual = {
      color: color,
      opacity: opacity,
      hasExplicitColor: !!target.hasExplicitColor
    };
    pt.__liaDgsMacroManaged = true;
    pt.__liaDgsHelperPoint = !!target.helper;
    pt.__liaDgsPointName = String(target.name || '');
    pt.__liaDgsLanguage = pt.__liaDgsLanguage ||
      (/^de(?:-|$)/i.test(String(document.documentElement.lang || '')) ? 'de' : 'en');
    pt.__liaDgsColor = color;
    pt.__liaDgsTextColor = labelColor;
    pt.__liaDgsLineColor = color;
    pt.__liaDgsFillColor = color;
    pt.__liaDgsShowName = target.showName !== false;
    pt.__liaDgsShowObject = opacity > 0;
    pt.__liaDgsOpacity = opacity;
    pt.__liaDgsFormatFontSize = 24;
    if (target.xExpression && target.yExpression) {
      const nextExpressions = {
        x: String(target.xExpression).trim(),
        y: String(target.yExpression).trim()
      };
      const previousExpressions = pt.__liaDgsCoordinateExpressions;
      const sameBinding = !!previousExpressions &&
        String(previousExpressions.x || '').trim() === nextExpressions.x &&
        String(previousExpressions.y || '').trim() === nextExpressions.y;
      const previousParameter = Number(pt.__liaDgsCoordinateParameter);
      const requestedParameter = target.coordinateParameter == null
        ? NaN
        : Number(target.coordinateParameter);
      pt.__liaDgsCoordinateExpressions = {
        x: nextExpressions.x,
        y: nextExpressions.y
      };
      pt.__liaDgsCoordinateCompiled = null;
      let parameter = sameBinding && Number.isFinite(previousParameter)
        ? previousParameter
        : requestedParameter;
      if (!Number.isFinite(parameter)) {
        try { parameter = Number(pt.X()); } catch (e) { parameter = NaN; }
      }
      if (Number.isFinite(parameter)) pt.__liaDgsCoordinateParameter = parameter;
      else delete pt.__liaDgsCoordinateParameter;
    } else {
      delete pt.__liaDgsCoordinateExpressions;
      delete pt.__liaDgsCoordinateCompiled;
      delete pt.__liaDgsCoordinateParameter;
    }

    try {
      pt.setAttribute({
        strokeColor: color,
        fillColor: color,
        highlightStrokeColor: color,
        highlightFillColor: color,
        strokeOpacity: opacity,
        fillOpacity: opacity,
        highlightStrokeOpacity: opacity,
        highlightFillOpacity: opacity
      });
    } catch (e) {}

    stylePointLabel(pt);
  }

  function refreshAllPointLabels() {
    try {
      const boards = window.__points || {};
      Object.keys(boards).forEach(function(boardId) {
        const entries = boards[boardId] || {};
        Object.keys(entries).forEach(function(name) {
          stylePointLabel(entries[name]);
        });
      });
    } catch (e) {}
  }

  function savePointState(boardId, name, pt) {
    if (!pt) return;
    ensureBuckets(boardId);

    let fixed = false;
    try {
      fixed = !!(pt.getAttribute ? pt.getAttribute('fixed') : pt.visProp && pt.visProp.fixed);
    } catch (e) {}

    try {
      window.__pointStates[boardId][name] = {
        x: pt.X(),
        y: pt.Y(),
        fixed: fixed,
        showName: pt.__liaDgsShowName !== false
      };
    } catch (e) {}
  }

  function movePointTo(pt, x, y) {
    if (!pt) return false;

    try {
      if (typeof pt.moveTo === 'function') {
        pt.moveTo([x, y], 0);
        return true;
      }
    } catch (e) {}

    try {
      if (typeof pt.setPositionDirectly === 'function' && typeof JXG !== 'undefined') {
        pt.setPositionDirectly(JXG.COORDS_BY_USER, [x, y]);
        return true;
      }
    } catch (e) {}

    try {
      if (typeof pt.setPosition === 'function' && typeof JXG !== 'undefined') {
        pt.setPosition(JXG.COORDS_BY_USER, [x, y]);
        return true;
      }
    } catch (e) {}

    return false;
  }

  function bindPointPersistence(boardId, name, pt) {
    if (!pt || pt.__liaStateBound) return;
    pt.__liaStateBound = true;

    const persist = function(recordHistory) {
      try {
        if (typeof window.__syncDgsFixedCompassPoint === 'function') {
          window.__syncDgsFixedCompassPoint(boardId, pt);
        }
      } catch (e) {}
      savePointState(boardId, name, pt);
      try {
        if (typeof window.__persistDgsBoardState === 'function') {
          window.__persistDgsBoardState(boardId, recordHistory !== false);
        }
      } catch (e) {}
    };

    try { pt.on('drag', function() { persist(false); }); } catch (e) {}
    try { pt.on('up', function() { persist(true); }); } catch (e) {}
    try { pt.on('move', function() { persist(false); }); } catch (e) {}

    savePointState(boardId, name, pt);
  }

  function createPoint(
    board,
    boardId,
    name,
    x0,
    y0,
    isFixed = false,
    showName = true,
    initialVisual = null
  ) {
    try {
      const initialAttributes = initialVisual
        ? getStaticPointCreationAttributes(initialVisual, getNeutralColor())
        : getStaticPointCreationAttributes(null, getNeutralColor());
      const pt = board.create('point', [x0, y0], {
        name: texName(name),
        fixed: !!isFixed,
        withLabel: true,
        showInfobox: false,
        strokeColor: initialAttributes.strokeColor,
        fillColor: initialAttributes.fillColor,
        highlightStrokeColor: initialAttributes.highlightStrokeColor,
        highlightFillColor: initialAttributes.highlightFillColor,
        strokeOpacity: initialAttributes.strokeOpacity,
        fillOpacity: initialAttributes.fillOpacity,
        highlightStrokeOpacity: initialAttributes.highlightStrokeOpacity,
        highlightFillOpacity: initialAttributes.highlightFillOpacity,
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        face: 'x',
        size: 7,
        label: {
          strokeColor: initialAttributes.label.strokeColor,
          fillColor: initialAttributes.label.fillColor,
          strokeOpacity: initialAttributes.label.strokeOpacity,
          fillOpacity: initialAttributes.label.fillOpacity,
          highlightStrokeOpacity: initialAttributes.label.highlightStrokeOpacity,
          highlightFillOpacity: initialAttributes.label.highlightFillOpacity,
          visible: showName !== false,
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });

      pt.__liaDgsPointName = String(name || '');
      pt.__liaDgsShowName = showName !== false;
      if (initialVisual) {
        pt.__liaPointVisual = {
          color: initialAttributes.strokeColor,
          opacity: initialAttributes.strokeOpacity,
          hasExplicitColor: !!initialVisual.hasExplicitColor
        };
      }

      ensureBuckets(boardId);
      window.__points[boardId][name] = pt;
      if (window.__scheduleBootstrapDistances) window.__scheduleBootstrapDistances();
      if (window.__scheduleBootstrapAreas) window.__scheduleBootstrapAreas();

      stylePointLabel(pt);
      bindPointPersistence(boardId, name, pt);
      savePointState(boardId, name, pt);

      return pt;
    } catch (e) {
      return null;
    }
  }

  function getLivePointOnCurrentBoard(boardId, name) {
    const board = window.__boards && window.__boards[boardId];
    const pt = window.__points && window.__points[boardId] && window.__points[boardId][name];

    if (!board || !pt) return null;

    try {
      if (pt.board === board) return pt;
    } catch (e) {}

    return null;
  }

  function restorePointFromState(boardId, name, requestedShowName) {
    const board = window.__boards && window.__boards[boardId];
    const state = window.__pointStates && window.__pointStates[boardId] && window.__pointStates[boardId][name];

    if (!board || !state) return null;

    const showName = typeof requestedShowName === 'boolean'
      ? requestedShowName
      : state.showName !== false;
    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (!pt) {
      pt = createPoint(board, boardId, name, state.x, state.y, false, showName);
      if (!pt) return null;
    }

    movePointTo(pt, state.x, state.y);

    try {
      pt.setAttribute({ fixed: !!state.fixed });
    } catch (e) {}

    pt.__liaDgsPointName = String(name || '');
    pt.__liaDgsShowName = showName;
    stylePointLabel(pt);
    bindPointPersistence(boardId, name, pt);
    savePointState(boardId, name, pt);

    try { board.update(); } catch (e) {}
    return pt;
  }

  window.restorePointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    if (!target.boardId || !target.name) return null;
    return restorePointFromState(target.boardId, target.name, target.showName);
  };

  window.getPointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    const boardId = target.boardId;
    const name = target.name;

    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (pt) {
      pt.__liaDgsPointName = String(name || '');
      pt.__liaDgsShowName = target.showName !== false;
      stylePointLabel(pt);
      return pt;
    }

    return restorePointFromState(boardId, name, target.showName);
  };

  window.ensurePointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    const boardId = target.boardId;
    const name = target.name;

    const board = window.__boards && window.__boards[boardId];
    if (!board || !name) return false;

    ensureBuckets(boardId);

    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (pt) {
      pt.__liaDgsPointName = String(name || '');
      pt.__liaDgsShowName = target.showName !== false;
      stylePointLabel(pt);
      bindPointPersistence(boardId, name, pt);
      savePointState(boardId, name, pt);
      try { board.update(); } catch (e) {}
      return true;
    }

    pt = restorePointFromState(boardId, name, target.showName);
    if (pt) {
      try { board.update(); } catch (e) {}
      return true;
    }

    const x0 = Math.random();
    const y0 = Math.random();

    pt = createPoint(board, boardId, name, x0, y0, false, target.showName);
    if (!pt) return false;

    try { board.update(); } catch (e) {}
    return true;
  };

  window.finalizePointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    const boardId = target.boardId;
    const name = target.name;
    const tx = target.tx;
    const ty = target.ty;

    const board = window.__boards && window.__boards[boardId];
    if (!board || !name || Number.isNaN(tx) || Number.isNaN(ty)) return false;

    ensureBuckets(boardId);

    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (!pt) pt = restorePointFromState(boardId, name, target.showName);
    if (!pt) pt = createPoint(board, boardId, name, tx, ty, false, target.showName);
    if (!pt) return false;

    movePointTo(pt, tx, ty);

    try {
      pt.setAttribute({ fixed: true });
    } catch (e) {}

    pt.__liaDgsPointName = String(name || '');
    pt.__liaDgsShowName = target.showName !== false;
    stylePointLabel(pt);
    savePointState(boardId, name, pt);

    try { board.update(); } catch (e) {}
    return true;
  };

  window.placeStaticPointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    const boardId = target.boardId;
    const name = target.name;
    const tx = target.tx;
    const ty = target.ty;
    const isFixed = !!target.fixed;

    const board = window.__boards && window.__boards[boardId];
    if (!board || !name || Number.isNaN(tx) || Number.isNaN(ty)) return false;

    ensureBuckets(boardId);

    const state = window.__pointStates &&
      window.__pointStates[boardId] &&
      window.__pointStates[boardId][name];

    let pt = getLivePointOnCurrentBoard(boardId, name);

    if (!pt) {
      if (isFixed) {
        pt = createPoint(board, boardId, name, tx, ty, true, target.showName, target);
      } else if (
        state &&
        Number.isFinite(state.x) &&
        Number.isFinite(state.y)
      ) {
        pt = createPoint(board, boardId, name, state.x, state.y, false, target.showName, target);
      } else {
        pt = createPoint(board, boardId, name, tx, ty, false, target.showName, target);
      }
    }

    if (!pt) return false;

    if (isFixed) {
      movePointTo(pt, tx, ty);
    }

    try {
      pt.setAttribute({ fixed: isFixed });
    } catch (e) {}

    applyStaticPointVisual(pt, target);
    bindPointPersistence(boardId, name, pt);
    savePointState(boardId, name, pt);

    try { board.update(); } catch (e) {}
    return true;
  };

  window.renderStaticPointFromSpec = function(uid, spec) {
    const holder = document.getElementById('point-spec-' + uid);
    if (!holder) return false;

    if ((holder.dataset.spec || '') !== String(spec || '')) {
      holder.dataset.spec = spec;
    }

    const existing = findPointMacroObject(uid, spec);
    if (existing && String(existing.__liaPointMacroSpec || '') === String(spec || '')) {
      assignPointMacroIdentity(uid, spec);
      return true;
    }

    if (typeof window.placeStaticPointFromSpec === 'function') {
      const placed = !!window.placeStaticPointFromSpec(spec);
      if (placed) assignPointMacroIdentity(uid, spec);
      return placed;
    }
    return false;
  };

  window.__bootstrapStaticPoints = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="point-spec-"][data-spec]');

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^point-spec-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;

      window.renderStaticPointFromSpec(uid, spec);
    });

    refreshAllPointLabels();
  };

  if (!window.__scheduleBootstrapStaticPoints) {
    window.__scheduleBootstrapStaticPoints = function() {
      if (window.__bootstrapStaticPointsRAF) return;
      window.__bootstrapStaticPointsRAF = requestAnimationFrame(function() {
        window.__bootstrapStaticPointsRAF = 0;
        try {
          if (window.__bootstrapStaticPoints) window.__bootstrapStaticPoints();
        } catch (e) {}
      });
    };
  }

  try {
    const moStaticPoints = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];

        if (m.type === 'attributes') {
          const target = m.target as HTMLElement;
          if (target && target.id && /^point-spec-/.test(target.id)) {
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
            (n.id && /^point-spec-/.test(n.id)) ||
            (n.querySelector && n.querySelector('[id^="point-spec-"][data-spec]'))
          ) {
            needsBootstrap = true;
            break;
          }
        }

        if (needsBootstrap) break;
      }

      if (needsBootstrap && window.__scheduleBootstrapStaticPoints) {
        window.__scheduleBootstrapStaticPoints();
      }
    });

    const rootStaticPoints = document.body || document.documentElement;
    if (rootStaticPoints) {
      moStaticPoints.observe(rootStaticPoints, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-spec']
      });
    }
  } catch (e) {}

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapStaticPoints) window.__scheduleBootstrapStaticPoints();
  });

  window.__checkPointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    const pt = window.getPointFromSpec ? window.getPointFromSpec(spec) : null;
    const eps = 0.05;

    const ok = !!pt
      && !Number.isNaN(target.tx)
      && !Number.isNaN(target.ty)
      && Math.abs(pt.X() - target.tx) < eps
      && Math.abs(pt.Y() - target.ty) < eps;

    if (ok && typeof window.finalizePointFromSpec === 'function') {
      window.finalizePointFromSpec(spec);
    }

    return ok;
  };

  window.__checkCreatePointQuiz = function(uid, spec) {
    const uiRoot = document.getElementById('point-ui-' + uid);
    const resolved = String(spec || uiRoot?.dataset.spec || '');
    return !!(resolved && window.__checkPointFromSpec && window.__checkPointFromSpec(resolved));
  };

  function findCheckButton(checkRoot) {
    return checkRoot.querySelector(
      'button.lia-btn, input.lia-btn, button, input[type="button"], input[type="submit"]'
    );
  }

  function ensureInnerSpan(btn) {
    let inner = btn.querySelector('.lia-btn-inner');
    if (inner) return inner;

    inner = document.createElement('span');
    inner.className = 'lia-btn-inner';

    while (btn.firstChild) {
      inner.appendChild(btn.firstChild);
    }
    btn.appendChild(inner);

    return inner;
  }

  function applyCreatePointUi(uid) {
    const uiRoot = document.getElementById('point-ui-' + uid);
    const taskRoot = document.getElementById('point-task-' + uid);
    const checkRoot = getCoordinateQuizRoot(document.getElementById('point-check-' + uid));
    const btn = document.getElementById('btn-' + uid);

    if (!uiRoot || !taskRoot || !checkRoot || !btn) return false;

    const spec = uiRoot.dataset.spec || '';

    uiRoot.style.display = 'inline-flex';
    uiRoot.style.alignItems = 'flex-start';
    uiRoot.style.gap = '.6rem';
    uiRoot.style.flexWrap = 'nowrap';

    taskRoot.style.display = 'inline-flex';
    taskRoot.style.alignItems = 'flex-start';
    taskRoot.style.alignSelf = 'flex-start';
    taskRoot.style.margin = '0';
    taskRoot.style.padding = '0';

    const checkHost = checkRoot.parentElement as HTMLElement | null;
    if (checkHost) {
      checkHost.style.display = 'inline-flex';
      checkHost.style.alignItems = 'flex-start';
      checkHost.style.verticalAlign = 'top';
    }
    checkRoot.style.margin = '0';
    checkRoot.style.padding = '0';

    Array.from(checkRoot.children).forEach(function(el: Element) { const hel = el as HTMLElement;
      try { hel.style.margin = '0'; } catch (e) {}
    });

    const c = getNeutralColor();
    btn.style.color = c;

    const checkBtn = findCheckButton(checkRoot);
    if (!checkBtn) {
      try {
        const inner = ensureInnerSpan(btn);
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.verticalAlign = 'top';
        btn.style.boxSizing = 'border-box';
        btn.style.margin = '0';
        inner.style.display = 'inline-flex';
        inner.style.alignItems = 'center';
        inner.style.justifyContent = 'center';
        inner.style.whiteSpace = 'nowrap';
        inner.style.transform = 'translateY(0px)';
      } catch (e) {}

      const existing = findPointMacroObject(uid, spec);
      if ((!existing || String(existing.__liaPointMacroSpec || '') !== String(spec || '')) &&
          typeof window.restorePointFromSpec === 'function') {
        window.restorePointFromSpec(spec);
      }
      return true;
    }

    const cs = window.getComputedStyle(checkBtn);
    const h = checkBtn.offsetHeight;
    const inner = ensureInnerSpan(btn);

    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'stretch';
    btn.style.justifyContent = 'center';
    btn.style.verticalAlign = 'top';
    btn.style.boxSizing = 'border-box';
    btn.style.margin = '0';
    btn.style.textAlign = 'center';

    if (h > 0) {
      btn.style.height = h + 'px';
      btn.style.minHeight = h + 'px';
    }

    btn.style.paddingTop = '0';
    btn.style.paddingBottom = '0';
    btn.style.paddingLeft = '0';
    btn.style.paddingRight = '0';

    btn.style.fontSize = cs.fontSize;
    btn.style.fontFamily = cs.fontFamily;
    btn.style.fontWeight = cs.fontWeight;
    btn.style.lineHeight = 'normal';

    inner.style.display = 'inline-flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.boxSizing = 'border-box';
    inner.style.height = '100%';
    inner.style.paddingTop = '0';
    inner.style.paddingBottom = '0';
    inner.style.paddingLeft = cs.paddingLeft;
    inner.style.paddingRight = cs.paddingRight;
    inner.style.lineHeight = '1';
    inner.style.transform = 'translateY(0px)';
    inner.style.whiteSpace = 'nowrap';

    const existing = findPointMacroObject(uid, spec);
    if ((!existing || String(existing.__liaPointMacroSpec || '') !== String(spec || '')) &&
        typeof window.restorePointFromSpec === 'function') {
      window.restorePointFromSpec(spec);
    }

    return true;
  }

  window.renderCreatePointFromSpec = function(uid, spec) {
    const uiRoot = document.getElementById('point-ui-' + uid);
    const taskRoot = document.getElementById('point-task-' + uid);
    const checkRoot = getCoordinateQuizRoot(document.getElementById('point-check-' + uid));

    if (!uiRoot || !taskRoot || !checkRoot) return false;

    if ((uiRoot.dataset.spec || '') !== String(spec || '')) {
      uiRoot.dataset.spec = spec;
    }

    let btn = document.getElementById('btn-' + uid);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'btn-' + uid;
      btn.className = 'lia-btn';
      btn.type = 'button';
      btn.textContent = 'Punkt setzen';
      taskRoot.appendChild(btn);
    }

    if (!btn.__liaPointEnsureBound) {
      btn.__liaPointEnsureBound = true;
      btn.addEventListener('click', function() {
        const curSpec = uiRoot.dataset.spec || '';
        if (typeof window.ensurePointFromSpec === 'function') {
          window.ensurePointFromSpec(curSpec);
        }
        assignPointMacroIdentity(uid, curSpec);
      });
    }

    applyCreatePointUi(uid);
    assignPointMacroIdentity(uid, spec);

    if (!checkRoot.__liaPointUiObserved) {
      checkRoot.__liaPointUiObserved = true;

      try {
        const mo = new MutationObserver(function() {
          if (checkRoot.__liaPointUiScheduled) return;
          checkRoot.__liaPointUiScheduled = true;
          requestAnimationFrame(function() {
            checkRoot.__liaPointUiScheduled = false;
            applyCreatePointUi(uid);
          });
        });
        mo.observe(checkRoot, { childList: true, subtree: true });
      } catch (e) {}

      try {
        checkRoot.addEventListener('click', function(e) {
          const targetBtn = (e.target as HTMLElement)?.closest('button, input[type="button"], input[type="submit"]') ?? null;

          if (!targetBtn || !checkRoot.contains(targetBtn)) return;
          if (!isQuizResolveButton(checkRoot, targetBtn)) return;

          setTimeout(function() {
            const curSpec = uiRoot.dataset.spec || '';
            if (typeof window.finalizePointFromSpec === 'function') {
              window.finalizePointFromSpec(curSpec);
            }
            assignPointMacroIdentity(uid, curSpec);
          }, 0);

          setTimeout(function() {
            const curSpec = uiRoot.dataset.spec || '';
            if (typeof window.finalizePointFromSpec === 'function') {
              window.finalizePointFromSpec(curSpec);
            }
            assignPointMacroIdentity(uid, curSpec);
          }, 80);
        });
      } catch (e) {}

      if (window.__registerLiaThemeListener) {
        window.__registerLiaThemeListener(function() {
          applyCreatePointUi(uid);
        });
      }
    }

    setTimeout(function() {
      if (!uiRoot.isConnected || String(uiRoot.dataset.spec || '') !== String(spec || '')) return;
      const existing = findPointMacroObject(uid, spec);
      if ((!existing || String(existing.__liaPointMacroSpec || '') !== String(spec || '')) &&
          typeof window.restorePointFromSpec === 'function') {
        window.restorePointFromSpec(spec);
      }
      assignPointMacroIdentity(uid, spec);
    }, 0);

    setTimeout(function() {
      if (!uiRoot.isConnected || String(uiRoot.dataset.spec || '') !== String(spec || '')) return;
      const existing = findPointMacroObject(uid, spec);
      if ((!existing || String(existing.__liaPointMacroSpec || '') !== String(spec || '')) &&
          typeof window.restorePointFromSpec === 'function') {
        window.restorePointFromSpec(spec);
      }
      assignPointMacroIdentity(uid, spec);
    }, 120);

    return true;
  };

  window.__bootstrapCreatePoints = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="point-ui-"][data-spec]');

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^point-ui-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;

      window.renderCreatePointFromSpec(uid, spec);
    });

    refreshAllPointLabels();
  };

  if (!window.__scheduleBootstrapCreatePoints) {
    window.__scheduleBootstrapCreatePoints = function() {
      if (window.__bootstrapCreatePointsRAF) return;
      window.__bootstrapCreatePointsRAF = requestAnimationFrame(function() {
        window.__bootstrapCreatePointsRAF = 0;
        try {
          if (window.__bootstrapCreatePoints) window.__bootstrapCreatePoints();
        } catch (e) {}
      });
    };
  }

  try {
    const mo = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type !== 'childList') continue;

        const added = Array.from(m.addedNodes || []);
        for (let j = 0; j < added.length; j++) {
          const n = added[j] as HTMLElement;
          if (!n || n.nodeType !== 1) continue;

          if (
            (n.id && /^point-ui-/.test(n.id)) ||
            (n.querySelector && n.querySelector('[id^="point-ui-"][data-spec]'))
          ) {
            needsBootstrap = true;
            break;
          }
        }

        if (needsBootstrap) break;
      }

      if (needsBootstrap && window.__scheduleBootstrapCreatePoints) {
        window.__scheduleBootstrapCreatePoints();
      }
    });

    const root = document.body || document.documentElement;
    if (root) {
      mo.observe(root, {
        childList: true,
        subtree: true
      });
    }
  } catch (e) {}

  window.__registerLiaThemeListener(refreshAllPointLabels);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapCreatePoints) window.__scheduleBootstrapCreatePoints();
  });
}
