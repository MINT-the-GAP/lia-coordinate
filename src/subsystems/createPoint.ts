// Create-point subsystem (@CreatePoint and @Point macros).
// Handles draggable student points and pre-placed static points on a JSXGraph board.

import { unquote } from '../shared/parser';
import { getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

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
    return unquote(spec)
      .split(';')
      .map(function(s){ return s.trim(); });
  }

  function parseFixToken(v) {
    return /^fix$/i.test(String(v || '').trim());
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

    return {
      boardId: parts[0] || '',
      name: parts[1] || 'A',
      tx: parseFloat((parts[2] || '').replace(',', '.')),
      ty: parseFloat((parts[3] || '').replace(',', '.')),
      fixed: parseFixToken(parts[4] || '')
    };
  }

  function stylePointLabel(pt) {
    if (!pt || typeof pt.setAttribute !== 'function') return;

    const c = getNeutralColor();

    try {
      pt.setAttribute({
        label: {
          strokeColor: c,
          fillColor: c,
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
          fontSize: 24,
          parse: false,
          useMathJax: true
        });
      }
    } catch (e) {}
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
        fixed: fixed
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

    const persist = function() {
      savePointState(boardId, name, pt);
    };

    try { pt.on('drag', persist); } catch (e) {}
    try { pt.on('up', persist); } catch (e) {}
    try { pt.on('move', persist); } catch (e) {}

    persist();
  }

  function createPoint(board, boardId, name, x0, y0, isFixed = false) {
    try {
      const pt = board.create('point', [x0, y0], {
        name: texName(name),
        fixed: !!isFixed,
        withLabel: true,
        showInfobox: false,
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        highlightStrokeColor: '#ff00ff',
        highlightFillColor: '#ff00ff',
        strokeWidth: 3,
        highlightStrokeWidth: 3,
        face: 'x',
        size: 7,
        label: {
          strokeColor: getNeutralColor(),
          fillColor: getNeutralColor(),
          fontSize: 24,
          parse: false,
          useMathJax: true
        }
      });

      ensureBuckets(boardId);
      window.__points[boardId][name] = pt;

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

  function restorePointFromState(boardId, name) {
    const board = window.__boards && window.__boards[boardId];
    const state = window.__pointStates && window.__pointStates[boardId] && window.__pointStates[boardId][name];

    if (!board || !state) return null;

    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (!pt) {
      pt = createPoint(board, boardId, name, state.x, state.y);
      if (!pt) return null;
    }

    movePointTo(pt, state.x, state.y);

    try {
      pt.setAttribute({ fixed: !!state.fixed });
    } catch (e) {}

    stylePointLabel(pt);
    bindPointPersistence(boardId, name, pt);
    savePointState(boardId, name, pt);

    try { board.update(); } catch (e) {}
    return pt;
  }

  window.restorePointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    if (!target.boardId || !target.name) return null;
    return restorePointFromState(target.boardId, target.name);
  };

  window.getPointFromSpec = function(spec) {
    const target = getPointTargetFromSpec(spec);
    const boardId = target.boardId;
    const name = target.name;

    let pt = getLivePointOnCurrentBoard(boardId, name);
    if (pt) return pt;

    return restorePointFromState(boardId, name);
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
      stylePointLabel(pt);
      bindPointPersistence(boardId, name, pt);
      savePointState(boardId, name, pt);
      try { board.update(); } catch (e) {}
      return true;
    }

    pt = restorePointFromState(boardId, name);
    if (pt) {
      try { board.update(); } catch (e) {}
      return true;
    }

    const x0 = Math.random();
    const y0 = Math.random();

    pt = createPoint(board, boardId, name, x0, y0);
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
    if (!pt) pt = restorePointFromState(boardId, name);
    if (!pt) pt = createPoint(board, boardId, name, tx, ty);
    if (!pt) return false;

    movePointTo(pt, tx, ty);

    try {
      pt.setAttribute({ fixed: true });
    } catch (e) {}

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
        pt = createPoint(board, boardId, name, tx, ty, true);
      } else if (
        state &&
        Number.isFinite(state.x) &&
        Number.isFinite(state.y)
      ) {
        pt = createPoint(board, boardId, name, state.x, state.y, false);
      } else {
        pt = createPoint(board, boardId, name, tx, ty, false);
      }
    }

    if (!pt) return false;

    if (isFixed) {
      movePointTo(pt, tx, ty);
    }

    try {
      pt.setAttribute({ fixed: isFixed });
    } catch (e) {}

    stylePointLabel(pt);
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

    if (typeof window.placeStaticPointFromSpec === 'function') {
      return !!window.placeStaticPointFromSpec(spec);
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

  function findCheckButton(checkRoot) {
    return checkRoot.querySelector(
      'button.lia-btn, input.lia-btn, button, input[type="button"], input[type="submit"]'
    );
  }

  function findAllQuizButtons(checkRoot) {
    return Array.from(
      checkRoot.querySelectorAll(
        'button.lia-btn, input.lia-btn, button, input[type="button"], input[type="submit"]'
      )
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

  function looksLikeResolveButton(checkRoot, targetBtn) {
    const buttons = findAllQuizButtons(checkRoot);
    const idx = buttons.indexOf(targetBtn);
    const text = String(targetBtn.textContent || targetBtn.value || '').trim().toLowerCase();

    if (idx >= 1) return true;
    if (/solution|show|loesung|losung|anzeig|zeigen/.test(text)) return true;

    return false;
  }

  function applyCreatePointUi(uid) {
    const uiRoot = document.getElementById('point-ui-' + uid);
    const taskRoot = document.getElementById('point-task-' + uid);
    const checkRoot = document.getElementById('point-check-' + uid);
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

    checkRoot.style.display = 'inline-flex';
    checkRoot.style.alignItems = 'flex-start';
    checkRoot.style.alignSelf = 'flex-start';
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

      if (typeof window.restorePointFromSpec === 'function') {
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

    if (typeof window.restorePointFromSpec === 'function') {
      window.restorePointFromSpec(spec);
    }

    return true;
  }

  window.renderCreatePointFromSpec = function(uid, spec) {
    const uiRoot = document.getElementById('point-ui-' + uid);
    const taskRoot = document.getElementById('point-task-' + uid);
    const checkRoot = document.getElementById('point-check-' + uid);

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
      });
    }

    applyCreatePointUi(uid);

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
          if (!looksLikeResolveButton(checkRoot, targetBtn)) return;

          setTimeout(function() {
            const curSpec = uiRoot.dataset.spec || '';
            if (typeof window.finalizePointFromSpec === 'function') {
              window.finalizePointFromSpec(curSpec);
            }
          }, 0);

          setTimeout(function() {
            const curSpec = uiRoot.dataset.spec || '';
            if (typeof window.finalizePointFromSpec === 'function') {
              window.finalizePointFromSpec(curSpec);
            }
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
      if (typeof window.restorePointFromSpec === 'function') {
        window.restorePointFromSpec(spec);
      }
    }, 0);

    setTimeout(function() {
      if (typeof window.restorePointFromSpec === 'function') {
        window.restorePointFromSpec(spec);
      }
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
