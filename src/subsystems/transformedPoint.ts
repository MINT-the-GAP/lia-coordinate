// Dependent transformation-point subsystem (@TransformPoint/@Transformationspunkt).
// Recreates DGS image points while preserving their geometric dependencies.

import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { getLivePoint, getBoardObjects } from '../shared/boardObjects';
import { normalizeName, namesEqual } from '../shared/format';
import { normalizedTexName as texName } from '../shared/texName';

type TransformKind = 'reflect-line' | 'reflect-point' | 'rotate-point' | 'dilate-point';

type TransformConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  sourceName: string;
  kind: TransformKind;
  referenceName: string;
  axisPointNames: string[];
  value: number;
  color: string;
  opacity: number;
  language: 'de' | 'en';
};

function normalizeKind(value: unknown): TransformKind {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'reflect-line' || kind === 'axis-reflection' || kind === 'achsenspiegelung') return 'reflect-line';
  if (kind === 'reflect-point' || kind === 'point-reflection' || kind === 'punktspiegelung') return 'reflect-point';
  if (kind === 'dilate' || kind === 'dilate-point' || kind === 'dilation' || kind === 'streckung') return 'dilate-point';
  return 'rotate-point';
}

function parseSpec(spec: string, language?: string): TransformConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map((part) => unquote(part).trim());
  const parsedName = parseMacroName(parts[1] || 'P', 'P');
  const kind = normalizeKind(parts[3]);
  const reference = String(parts[4] || '').trim();
  const axisPointNames = kind === 'reflect-line' && reference.startsWith('[') && reference.endsWith(']')
    ? splitTopLevel(reference.slice(1, -1), ';').map((part) => unquote(part).trim()).filter(Boolean).slice(0, 2)
    : [];
  const parsedValue = Number(String(parts[5] || '').replace(',', '.'));
  const parsedOpacity = Number(String(parts[7] || '').replace(',', '.'));
  return {
    boardId: String(parts[0] || '').trim(),
    name: parsedName.name || 'P',
    showName: parsedName.showName,
    sourceName: String(parts[2] || '').trim(),
    kind,
    referenceName: axisPointNames.length ? '' : reference,
    axisPointNames,
    value: Number.isFinite(parsedValue) ? parsedValue : (kind === 'dilate-point' ? 2 : 90),
    color: String(parts[6] || '').trim() || '#ff00ff',
    opacity: Number.isFinite(parsedOpacity) ? Math.max(0, Math.min(1, parsedOpacity)) : 1,
    language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
  };
}

function transformedCoordinates(
  source: any,
  kind: TransformKind,
  reference: any,
  axisSecond: any,
  value: number
): { x: number; y: number } {
  const x = Number(source.X());
  const y = Number(source.Y());
  const cx = Number(reference.X());
  const cy = Number(reference.Y());
  if (kind === 'reflect-line') {
    const bx = Number(axisSecond.X());
    const by = Number(axisSecond.Y());
    const dx = bx - cx;
    const dy = by - cy;
    const denominator = dx * dx + dy * dy;
    if (!(denominator > 1e-20)) return { x: NaN, y: NaN };
    const parameter = ((x - cx) * dx + (y - cy) * dy) / denominator;
    return { x: 2 * (cx + parameter * dx) - x, y: 2 * (cy + parameter * dy) - y };
  }
  if (kind === 'reflect-point') return { x: 2 * cx - x, y: 2 * cy - y };
  if (kind === 'dilate-point') return { x: cx + value * (x - cx), y: cy + value * (y - cy) };
  const radians = value * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: cx + cos * (x - cx) - sin * (y - cy),
    y: cy + sin * (x - cx) + cos * (y - cy)
  };
}

function candidateLineNames(object: any): string[] {
  return [
    object && object.__liaDgsLineName,
    object && object.__liaDgsSegmentName,
    object && object.__liaDgsRayName,
    object && object.__liaDgsVectorName,
    object && object.__liaDgsParallelName,
    object && object.__liaDgsPerpendicularName,
    object && object.__liaDgsAngleBisectorName,
    object && object.name
  ].map(normalizeName).filter(Boolean);
}

function findNamedLine(board: any, name: string): any | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  return getBoardObjects(board).find((object: any) =>
    object && object.point1 && object.point2 && candidateLineNames(object).some((candidate) => namesEqual(candidate, wanted))
  ) || null;
}

export function init(): void {
  if (window.__transformedPointsReady) {
    try { window.__scheduleBootstrapTransformedPoints?.(); } catch (e) {}
    return;
  }
  window.__transformedPointsReady = true;
  window.__transformedPointEntries = window.__transformedPointEntries || {};
  initThemeSync();
  let hasPending = false;

  const keyFor = (uid: string) => 'transform-point-' + String(uid || '');
  const removeKey = (key: string) => {
    const entry = window.__transformedPointEntries[key];
    if (!entry) return;
    try {
      if (window.__points?.[entry.boardId]?.[entry.name] === entry.point) {
        delete window.__points[entry.boardId][entry.name];
      }
    } catch (e) {}
    try { entry.board?.removeObject?.(entry.point); } catch (e) {}
    delete window.__transformedPointEntries[key];
  };

  const scheduleDependents = () => {
    try { window.__scheduleBootstrapRelationObjects?.(); } catch (e) {}
    try { window.__scheduleBootstrapLinearObjects?.(); } catch (e) {}
    try { window.__scheduleBootstrapAreas?.(); } catch (e) {}
    try { window.__scheduleBootstrapAngles?.(); } catch (e) {}
    try { window.__scheduleBootstrapCircles?.(); } catch (e) {}
    try { window.__scheduleBootstrapCompassArcs?.(); } catch (e) {}
  };

  window.renderTransformedPointFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseSpec(spec, language);
    const key = keyFor(uid);
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!uid || !board || !cfg.name || !cfg.sourceName) { removeKey(key); return false; }
    const source = getLivePoint(board, cfg.boardId, cfg.sourceName);
    let reference: any = null;
    let axisSecond: any = null;
    if (cfg.kind === 'reflect-line') {
      if (cfg.axisPointNames.length === 2) {
        reference = getLivePoint(board, cfg.boardId, cfg.axisPointNames[0]);
        axisSecond = getLivePoint(board, cfg.boardId, cfg.axisPointNames[1]);
      } else {
        const line = findNamedLine(board, cfg.referenceName);
        reference = line && line.point1;
        axisSecond = line && line.point2;
      }
    } else reference = getLivePoint(board, cfg.boardId, cfg.referenceName);
    if (!source || !reference || (cfg.kind === 'reflect-line' && !axisSecond) ||
        (cfg.kind === 'dilate-point' && Math.abs(cfg.value) <= 1e-12)) {
      removeKey(key);
      return false;
    }

    const old = window.__transformedPointEntries[key];
    if (old && old.board === board && old.source === source && old.reference === reference &&
        old.axisSecond === axisSecond && old.kind === cfg.kind && old.value === cfg.value && old.name === cfg.name) {
      old.point.__liaDgsShowName = cfg.showName;
      old.point.__liaDgsColor = cfg.color;
      old.point.__liaDgsTextColor = getNeutralColor();
      old.point.__liaDgsLineColor = cfg.color;
      old.point.__liaDgsFillColor = cfg.color;
      old.point.__liaDgsOpacity = cfg.opacity;
      old.point.__liaDgsShowObject = cfg.opacity > 0;
      try {
        old.point.setAttribute({
          visible: cfg.opacity > 0,
          strokeColor: cfg.color,
          fillColor: cfg.color,
          strokeOpacity: cfg.opacity,
          fillOpacity: cfg.opacity,
          name: cfg.showName ? '\\(' + texName(cfg.name) + '\\)' : '',
          withLabel: cfg.showName
        });
        board.update();
      } catch (e) {}
      return true;
    }

    removeKey(key);
    try {
      const point = board.create('point', [
        function() { return transformedCoordinates(source, cfg.kind, reference, axisSecond, cfg.value).x; },
        function() { return transformedCoordinates(source, cfg.kind, reference, axisSecond, cfg.value).y; }
      ], {
        name: cfg.showName ? '\\(' + texName(cfg.name) + '\\)' : '',
        fixed: true,
        visible: cfg.opacity > 0,
        withLabel: cfg.showName,
        showInfobox: false,
        strokeColor: cfg.color,
        fillColor: cfg.color,
        highlightStrokeColor: cfg.color,
        highlightFillColor: cfg.color,
        strokeOpacity: cfg.opacity,
        fillOpacity: cfg.opacity,
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
      point.__liaDgsMacroManaged = true;
      point.__liaDgsMacroKey = 'macro:transform-point:' + String(uid);
      point.__liaDgsPersistentId = point.__liaDgsMacroKey;
      point.__liaDgsPointName = cfg.name;
      point.__liaDgsTransformPoint = true;
      point.__liaDgsTransformSource = source;
      point.__liaDgsTransformKind = cfg.kind;
      point.__liaDgsTransformReference = reference;
      point.__liaDgsTransformAxisSecond = axisSecond;
      point.__liaDgsTransformValue = cfg.value;
      point.__liaDgsLanguage = cfg.language;
      point.__liaDgsColor = cfg.color;
      point.__liaDgsTextColor = getNeutralColor();
      point.__liaDgsLineColor = cfg.color;
      point.__liaDgsFillColor = cfg.color;
      point.__liaDgsShowName = cfg.showName;
      point.__liaDgsShowObject = cfg.opacity > 0;
      point.__liaDgsOpacity = cfg.opacity;
      point.__liaPointVisual = { color: cfg.color, opacity: cfg.opacity, hasExplicitColor: true };
      if (point.label) {
        point.label.__liaDgsMacroManaged = true;
        point.label.__liaDgsOwner = point;
      }
      window.__points = window.__points || {};
      window.__points[cfg.boardId] = window.__points[cfg.boardId] || {};
      window.__points[cfg.boardId][cfg.name] = point;
      window.__transformedPointEntries[key] = {
        uid: String(uid), boardId: cfg.boardId, board, point, name: cfg.name,
        source, reference, axisSecond, kind: cfg.kind, value: cfg.value
      };
      scheduleDependents();
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  };

  window.__bootstrapTransformedPoints = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="transform-point-spec-"][data-spec]:not([data-lia-static-claimed])');
    const active = new Set<string>();
    let pending = false;
    nodes.forEach((node) => {
      const uid = String(node.id || '').replace(/^transform-point-spec-/, '');
      if (!uid) return;
      active.add(keyFor(uid));
      if (!window.renderTransformedPointFromSpec?.(uid, String(node.dataset.spec || ''), String(node.dataset.language || 'de'))) pending = true;
    });
    Object.keys(window.__transformedPointEntries || {}).forEach((key) => {
      if (!active.has(key)) removeKey(key);
    });
    hasPending = pending;
  };

  window.__scheduleBootstrapTransformedPoints = function(): void {
    if (window.__bootstrapTransformedPointsRAF) return;
    window.__bootstrapTransformedPointsRAF = requestAnimationFrame(function() {
      window.__bootstrapTransformedPointsRAF = 0;
      try { window.__bootstrapTransformedPoints?.(); } catch (e) {}
    });
  };

  try {
    const observer = new MutationObserver((mutations) => {
      const needsBootstrap = mutations.some((mutation) => {
        const target = mutation.target as HTMLElement;
        if (mutation.type === 'attributes') return !!target?.id?.startsWith('transform-point-spec-');
        return Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || [])).some((node) => {
          const element = node as HTMLElement;
          return !!element && element.nodeType === 1 && (
            !!element.id?.startsWith('transform-point-spec-') ||
            !!element.querySelector?.('[id^="transform-point-spec-"][data-spec]')
          );
        });
      });
      if (needsBootstrap) window.__scheduleBootstrapTransformedPoints?.();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-language'] });
  } catch (e) {}

  window.__transformedPointsRetryInterval = setInterval(function() {
    if (hasPending) window.__scheduleBootstrapTransformedPoints?.();
  }, 300);
  scheduleBootstrap(function() { window.__scheduleBootstrapTransformedPoints?.(); });
}
