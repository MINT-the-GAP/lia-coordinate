// Exported DGS object-format subsystem (@ObjectFormat / @ObjektFormat).
// Restores presentation properties after the structural geometry macros ran.

import { splitTopLevel, unquote } from '../shared/parser';
import { getBoardObjects } from '../shared/boardObjects';
import { getCoordinateView3D } from '../coord/view3d';
import { namesEqual } from '../shared/format';
import { applyLineStyle, parseLineStyleOptions, type LineStyle } from '../shared/lineStyle';
import { scheduleBootstrap } from '../shared/bootstrap';

interface ObjectFormatConfig {
  boardId: string;
  reference: string;
  objectId: string;
  scene: '2d' | '3d' | null;
  layer: number | null;
  visible: boolean | null;
  flags: Record<string, boolean>;
  textColor: string;
  lineColor: string;
  fillColor: string;
  opacity: number | null;
  fixed: boolean | null;
  fontSize: number | null;
  showEquation: boolean | null;
  showExpression: boolean | null;
  showName: boolean | null;
  showLength: boolean | null;
  objectName: string;
  lineStyle: LineStyle | null;
  strokeWidth: number | null;
  design: string;
}

function optionValue(parts: string[], names: string[]): string {
  let value = '';
  parts.forEach(function(part) {
    const match = String(part || '').match(/^([^=]+)\s*=\s*([\s\S]*)$/);
    if (!match || !names.includes(match[1].trim().toLowerCase())) return;
    value = unquote(match[2].trim());
  });
  return value;
}

function optionalBoolean(parts: string[], names: string[]): boolean | null {
  const value = optionValue(parts, names);
  if (!value) return null;
  if (/^(?:1|true|yes|ja)$/i.test(value)) return true;
  if (/^(?:0|false|no|nein)$/i.test(value)) return false;
  return null;
}

function optionalNumber(parts: string[], names: string[], min: number, max: number): number | null {
  const raw = optionValue(parts, names);
  if (!raw.trim()) return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : null;
}

function parseObjectFormatSpec(spec: string): ObjectFormatConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';')
    .map(function(part) { return unquote(part).trim(); });
  const options = parts.slice(2);
  const lineStyleValue = optionValue(options, ['linestyle', 'linienstil']);
  const sceneValue = optionValue(options, ['scene']).toLowerCase();
  const flags: Record<string, boolean> = {};
  const flagNames: Record<string, string> = {
    showvalue: '__liaDgsShowValue', showangle: '__liaDgsShowAngle',
    area: '__liaDgsShowArea', perimeter: '__liaDgsShowPerimeter',
    surface: '__liaDgsShowSurfaceArea', volume: '__liaDgsShowVolume',
    coordinates: '__liaDgsShowCoordinates', radius: '__liaDgsShowRadius'
  };
  Object.entries(flagNames).forEach(([option, property]) => {
    const value = optionalBoolean(options, [option]);
    if (value != null) flags[property] = value;
  });
  return {
    boardId: String(parts[0] || '').trim(),
    reference: String(parts[1] || '').trim(),
    objectId: optionValue(options, ['objectid']),
    scene: sceneValue === '2d' || sceneValue === '3d' ? sceneValue : null,
    layer: optionalNumber(options, ['layer', 'ebene'], 0, 20),
    visible: optionalBoolean(options, ['visible', 'sichtbar']),
    flags,
    textColor: optionValue(options, ['textcolor', 'textfarbe']),
    lineColor: optionValue(options, ['linecolor', 'linienfarbe']),
    fillColor: optionValue(options, ['fillcolor', 'fuellfarbe', 'füllfarbe']),
    opacity: optionalNumber(options, ['opacity', 'deckkraft'], 0, 1),
    fixed: optionalBoolean(options, ['fixed', 'fixiert']),
    fontSize: optionalNumber(options, ['fontsize', 'schriftgroesse', 'schriftgröße'], 8, 96),
    showEquation: optionalBoolean(options, ['equation', 'gleichung']),
    showExpression: optionalBoolean(options, ['expression', 'term']),
    showName: optionalBoolean(options, ['showname', 'nameanzeigen']),
    showLength: optionalBoolean(options, ['length', 'laenge', 'länge']),
    objectName: optionValue(options, ['name']),
    lineStyle: lineStyleValue ? parseLineStyleOptions(['linestyle=' + lineStyleValue]) : null,
    strokeWidth: optionalNumber(options, ['width', 'linienbreite'], 0.25, 20),
    design: optionValue(options, ['design'])
  };
}

function objectNames(object: any): string[] {
  const values = [
    object && object.__liaDgsPointName,
    object && object.__liaDgsSliderName,
    object && object.__liaDgsFunctionName,
    object && object.__liaDgsLineName,
    object && object.__liaDgsRayName,
    object && object.__liaDgsVectorName,
    object && object.__liaDgsSegmentName,
    object && object.__liaDgsArcName,
    object && object.__liaDgsCompassArcName,
    object && object.__liaDgsCircleName,
    object && object.__liaDgsSectorName,
    object && object.__liaDgsAngleName,
    object && object.__liaDgsPolygonName,
    object && object.__liaDgsPlaneName,
    object && object.__liaDgsCircle3DName,
    object && object.__liaDgsSphere3DName,
    object && object.__liaDgsPolygon3DName,
    object && object.__liaDgsSolid3DName,
    object && object.__liaDgsCurve3DName,
    object && object.__liaDgsSurface3DName,
    object && object.__liaDgsConic3DName,
    object && object.__liaDgsAnalytic3DName,
    object && object.__liaSceneRecord?.name,
    object && object.name
  ];
  return values.map(function(value) { return String(value || '').trim(); }).filter(Boolean);
}

function spatialFormatObjects(board: any): Set<any> {
  const view = getCoordinateView3D(board);
  const objects = new Set<any>();
  const add = (object: any) => { if (object) objects.add(object); };
  if (view) [
    view.points, view.linearObjects, view.planeObjects, view.circleObjects,
    view.sphereObjects, view.polygonObjects, view.solidObjects,
    view.curveObjects, view.surfaceObjects
  ].forEach(collection => collection?.forEach(add));
  [
    window.__curve3DEntries, window.__surface3DEntries, window.__conic3DEntries,
    window.__analytic3DEntries, window.__locus3DEntries, window.__locusSurface3DEntries
  ].forEach(registry => Object.values(registry || {}).forEach((entry: any) => {
    if (entry?.board === board) add(entry.object);
  }));
  return objects;
}

function spatialProxy(object: any): any {
  return object?.__liaPoint3DProxy || object?.__liaLinear3DProxy ||
    object?.__liaPlane3DProxy || object?.__liaCircle3DProxy ||
    object?.__liaSphere3DProxy || object?.__liaPolygon3DProxy ||
    object?.__liaSolid3DProxy || object?.__liaCurve3DProxy ||
    object?.__liaSurface3DProxy || object;
}

function formatObjects(board: any, scene: ObjectFormatConfig['scene'] = null): any[] {
  const spatial = spatialFormatObjects(board);
  const raw = getBoardObjects(board);
  raw.forEach(object => {
    const proxy = spatialProxy(object);
    if (proxy !== object || /3d$/i.test(String(proxy?.__liaSceneRecord?.kind || '')) ||
      proxy?.__liaPoint3D || proxy?.__liaLinear3D || proxy?.__liaPlane3D ||
      proxy?.__liaCircle3D || proxy?.__liaSphere3D || proxy?.__liaPolygon3D ||
      proxy?.__liaSolid3D || proxy?.__liaCurve3D || proxy?.__liaSurface3D ||
      proxy?.__liaConicSection3D || proxy?.__liaDgsAnalytic3D || proxy?.__liaTransformation3D || proxy?.__liaDgsAngle3D) {
      spatial.add(proxy);
    }
  });
  // Spatial wrappers own appearance; their JSXGraph projection is only a renderer.
  const planar = raw.filter(object => !spatial.has(spatialProxy(object)));
  if (scene === '3d') return Array.from(spatial);
  if (scene === '2d') return planar;
  return [...spatial, ...planar];
}

function findNamedObject(objects: any[], reference: string): any {
  return objects.find(object =>
    objectNames(object).some(name => namesEqual(name, reference))) || null;
}

function resolveObject(board: any, cfg: ObjectFormatConfig): any {
  const objects = formatObjects(board, cfg.scene);
  // Never apply a pending format to a same-named object in the other scene.
  if (cfg.objectId) {
    return objects.find(object => object.__liaDgsPersistentId === cfg.objectId ||
      object.__liaSceneRecord?.id === cfg.objectId) || null;
  }
  const side = cfg.reference.match(/^side:([\s\S]+):(\d+)$/i);
  if (side) {
    const polygon = findNamedObject(objects, side[1]);
    const index = Number(side[2]);
    return polygon && Array.isArray(polygon.borders) && Number.isInteger(index)
      ? polygon.borders[index] || null
      : null;
  }
  if (cfg.scene !== '3d') {
    const registeredLinear = Object.values(window.__linearObjectEntries || {}).find((entry: any) =>
      entry?.board === board && entry.object &&
      objectNames(entry.object).some(name => namesEqual(name, cfg.reference))
    ) as any;
    if (registeredLinear?.object) return registeredLinear.object;
  }
  return findNamedObject(objects, cfg.reference);
}

function applyFallbackFormat(object: any, cfg: ObjectFormatConfig): void {
  if (!object) return;
  if (cfg.textColor) object.__liaDgsTextColor = cfg.textColor;
  if (cfg.lineColor) object.__liaDgsLineColor = cfg.lineColor;
  if (cfg.fillColor) object.__liaDgsFillColor = cfg.fillColor;
  if (cfg.opacity != null) object.__liaDgsOpacity = cfg.opacity;
  if (cfg.fontSize != null) object.__liaDgsFormatFontSize = cfg.fontSize;
  if (cfg.showEquation != null) object.__liaDgsShowEquation = cfg.showEquation;
  if (cfg.showExpression != null) object.__liaDgsShowExpression = cfg.showExpression;
  if (cfg.showName != null) object.__liaDgsShowName = cfg.showName;
  if (cfg.showLength != null) object.__liaDgsShowLength = cfg.showLength;
  Object.entries(cfg.flags).forEach(([property, value]) => { object[property] = value; });
  if (cfg.visible != null) {
    object.__liaDgsShowObject = cfg.visible;
    try { object.setAttribute?.({ visible: cfg.visible }); } catch (e) {}
  }
  if (cfg.layer != null) {
    try { object.setAttribute?.({ layer: cfg.layer }); } catch (e) {}
  }
  if (cfg.objectName) {
    if (object.__liaDgsPolygonBorder) object.__liaDgsSegmentName = cfg.objectName;
    try { object.setAttribute?.({ name: cfg.objectName }); } catch (e) {}
  }
  if (cfg.lineStyle) {
    object.__liaDgsLineStyle = cfg.lineStyle;
    applyLineStyle(object, cfg.lineStyle);
  }
  if (cfg.strokeWidth != null) {
    object.__liaDgsSegmentStrokeWidth = cfg.strokeWidth;
    object.__liaDgsArcStrokeWidth = cfg.strokeWidth;
    try { object.setAttribute?.({ strokeWidth: cfg.strokeWidth, highlightStrokeWidth: cfg.strokeWidth }); } catch (e) {}
  }
  if (cfg.design) object.__liaDgsSegmentDesign = cfg.design;
  if (cfg.fixed != null) {
    try { object.setAttribute?.({ fixed: cfg.fixed }); } catch (e) {}
  }
  try {
    object.setAttribute?.({
      strokeColor: cfg.lineColor || object.__liaDgsLineColor,
      highlightStrokeColor: cfg.lineColor || object.__liaDgsLineColor,
      fillColor: cfg.fillColor || object.__liaDgsFillColor,
      highlightFillColor: cfg.fillColor || object.__liaDgsFillColor
    });
    if (object.label && cfg.textColor) {
      object.label.setAttribute?.({ strokeColor: cfg.textColor, fillColor: cfg.textColor });
    }
  } catch (e) {}
}

export function init(): void {
  if (window.__objectFormatReady) {
    try { window.__scheduleBootstrapObjectFormats?.(); } catch (e) {}
    return;
  }
  window.__objectFormatReady = true;
  window.__objectFormatEntries = window.__objectFormatEntries || {};

  let hasPending = false;
  window.renderObjectFormatFromSpec = function(uid: string, spec: string): boolean {
    const cfg = parseObjectFormatSpec(spec);
    if (!uid || !cfg.boardId || !cfg.reference) return false;
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) return false;
    const object = resolveObject(board, cfg);
    if (!object) return false;

    const suspend = !board.isSuspendedUpdate &&
      typeof board.suspendUpdate === 'function' && typeof board.unsuspendUpdate === 'function';
    if (suspend) board.suspendUpdate();
    try {
      applyFallbackFormat(object, cfg);
      try { window.__applyDgsObjectExportFormat?.(cfg.boardId, object, cfg); } catch (e) {}
      try { board.update?.(); } catch (e) {}
    } finally {
      if (suspend) board.unsuspendUpdate();
    }
    window.__objectFormatEntries[uid] = { spec: String(spec || ''), board, object };
    return true;
  };

  // One scene redraw per import pass, even when dozens of objects have formatting.
  const suspendFormatBoard = (board: any, suspended: Set<any>) => {
    if (!board || board.isSuspendedUpdate || typeof board.suspendUpdate !== 'function' ||
        typeof board.unsuspendUpdate !== 'function') return;
    board.suspendUpdate();
    suspended.add(board);
  };
  window.__bootstrapObjectFormats = function(): void {
    hasPending = false;
    const suspended = new Set<any>();
    const retryNodes: Array<{ node: HTMLElement; uid: string; spec: string }> = [];
    try {
      document.querySelectorAll<HTMLElement>('[id^="object-format-spec-"][data-spec]:not([data-lia-static-claimed])')
        .forEach(function(node) {
          const uid = String(node.id || '').replace(/^object-format-spec-/, '');
          const spec = String(node.dataset.spec || '');
          const boardId = parseObjectFormatSpec(spec).boardId;
          const board = window.__boards && window.__boards[boardId];
          const previous = window.__objectFormatEntries[uid];
          const previousIsLive = !!(
            previous && previous.spec === spec && board && previous.board === board &&
            previous.object && formatObjects(board).includes(previous.object)
          );
          if (node.dataset.liaObjectFormatSettled === spec && previousIsLive) return;
          suspendFormatBoard(board, suspended);
          if (!window.renderObjectFormatFromSpec?.(uid, spec)) {
            hasPending = true;
            return;
          }
          if (node.dataset.liaObjectFormatSettled === spec) return;
          node.dataset.liaObjectFormatSettled = spec;
          retryNodes.push({ node, uid, spec });
        });
    } finally {
      suspended.forEach(board => board.unsuspendUpdate());
    }
    if (retryNodes.length) [80, 250, 700].forEach(function(delay) {
      window.setTimeout(function() {
        const retryBoards = new Set<any>();
        try {
          retryNodes.forEach(({ node, uid, spec }) => {
            if (!node.isConnected || String(node.dataset.spec || '') !== spec) return;
            const board = window.__boards?.[parseObjectFormatSpec(spec).boardId];
            suspendFormatBoard(board, retryBoards);
            try { window.renderObjectFormatFromSpec?.(uid, spec); } catch (e) {}
          });
        } finally {
          retryBoards.forEach(board => board.unsuspendUpdate());
        }
      }, delay);
    });
  };
  window.__scheduleBootstrapObjectFormats = function(): void {
    if (window.__bootstrapObjectFormatsRAF) return;
    window.__bootstrapObjectFormatsRAF = requestAnimationFrame(function() {
      window.__bootstrapObjectFormatsRAF = 0;
      try { window.__bootstrapObjectFormats?.(); } catch (e) {}
    });
  };

  try {
    const observer = new MutationObserver(function() { window.__scheduleBootstrapObjectFormats?.(); });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-spec']
    });
  } catch (e) {}

  window.__objectFormatRetryInterval = setInterval(function() {
    if (hasPending) window.__scheduleBootstrapObjectFormats?.();
  }, 300);
  scheduleBootstrap(function() { window.__scheduleBootstrapObjectFormats?.(); });
}
