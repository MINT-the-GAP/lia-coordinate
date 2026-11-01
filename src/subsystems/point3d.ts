import { withCoordinate3DImport } from '../coord/view3d';
import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getNeutralColor } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import {
  clearCoordinatePoint3DConstraint,
  constrainCoordinatePoint3D,
  createCoordinatePoint3D,
  getCoordinateView3D,
  point3DCoordinates,
  setCoordinatePoint3D
} from '../coord/view3d';

type Point3DTarget = {
  boardId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  color: string;
  opacity: number;
  fixed: boolean;
  showName: boolean;
  showCoordinates: boolean;
  visible: boolean;
  bindingName: string;
  bindingParameters:
    | { kind: 'curve'; t: number }
    | { kind: 'surface'; u: number; v: number }
    | { kind: 'line'; t: number }
    | { kind: 'plane'; u: number; v: number }
    | { kind: 'circle'; angle: number }
    | { kind: 'sphere'; direction: [number, number, number] }
    | { kind: 'polygon'; u: number; v: number }
    | { kind: 'solid'; surface: 'side' | 'base' | 'top' | 'face'; face?: number; u?: number; v?: number; angle?: number; height?: number; radial?: number }
    | null;
  objectId: string;
};

function parsePoint3DSpec(spec: string): Point3DTarget {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(value => value.trim());
  const parsedName = parseMacroName(parts[1] || 'A', 'A');
  const options = parts.slice(5);
  const visibleOption = options.find(value => /^(?:visible|sichtbar)\s*=/i.test(value));
  const bindingOption = options.find(value => /^(?:on|auf)\s*=/i.test(value));
  const colorToken = String(options.find(value => value && !/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value) && !/^fix$/i.test(value) && !/^[a-z][a-z0-9_-]*\s*=/i.test(value) && !isHiddenNameOption(value)) || '');
  const opacityToken = options.find(value => /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value));
  const opacity = Number(String(opacityToken == null ? 1 : opacityToken).replace(',', '.'));
  const optionValue = (name: string) => {
    const token = options.find(value => new RegExp('^' + name + '\\s*=', 'i').test(value));
    return token ? unquote(String(token).replace(/^[^=]+=/, '').trim()) : '';
  };
  const numericOption = (name: string) => {
    const raw = optionValue(name).trim();
    return raw ? Number(raw.replace(',', '.')) : NaN;
  };
  const t = numericOption('t');
  const u = numericOption('u');
  const v = numericOption('v');
  const angle = numericOption('angle');
  const face = numericOption('face');
  const height = numericOption('height');
  const radial = numericOption('radial');
  const surfaceRaw = (optionValue('surface') || optionValue('flaeche') || optionValue('fläche')).toLowerCase();
  const surface: '' | 'side' | 'base' | 'top' | 'face' = /^(?:side|mantel)$/.test(surfaceRaw) ? 'side' :
    (/^(?:base|grund)$/.test(surfaceRaw) ? 'base' :
    (/^(?:top|deck)$/.test(surfaceRaw) ? 'top' :
    (/^(?:face|seite)$/.test(surfaceRaw) ? 'face' : '')));
  const directionRaw = optionValue('direction') || optionValue('richtung');
  const directionValues = directionRaw.replace(/^[\[(]\s*|\s*[\])]$/g, '')
    .split(/[;,|/]/).map(value => Number(value.trim().replace(',', '.')));
  const direction = directionValues.length === 3 && directionValues.every(Number.isFinite)
    ? directionValues as [number, number, number]
    : null;
  const bindingParameters = surface
    ? {
        kind: 'solid' as const,
        surface,
        ...(Number.isFinite(face) ? { face } : {}),
        ...(Number.isFinite(u) ? { u } : {}),
        ...(Number.isFinite(v) ? { v } : {}),
        ...(Number.isFinite(angle) ? { angle } : {}),
        ...(Number.isFinite(height) ? { height } : {}),
        ...(Number.isFinite(radial) ? { radial } : {})
      }
    : (Number.isFinite(angle)
      ? { kind: 'circle' as const, angle }
      : (direction
        ? { kind: 'sphere' as const, direction }
        : (Number.isFinite(t)
          ? { kind: 'line' as const, t }
          : (Number.isFinite(u) && Number.isFinite(v)
            ? { kind: 'plane' as const, u, v }
            : null))));
  return {
    boardId: parts[0] || '',
    name: parsedName.name || 'A',
    x: Number(String(parts[2] || '').replace(',', '.')),
    y: Number(String(parts[3] || '').replace(',', '.')),
    z: Number(String(parts[4] || '').replace(',', '.')),
    color: colorToken || '#ff00ff',
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
    fixed: options.some(value => /^fix$/i.test(value)),
    showName: parsedName.showName && !options.some(isHiddenNameOption),
    showCoordinates: options.some(value => /^(?:value|wert|coordinates|koordinaten)\s*=\s*(?:1|true|ja|yes|on)$/i.test(value)),
    visible: !visibleOption || !/^(?:visible|sichtbar)\s*=\s*(?:0|false|nein|no|off)$/i.test(visibleOption),
    bindingName: bindingOption ? unquote(String(bindingOption).replace(/^[^=]+=/, '').trim()) : '',
    bindingParameters,
    objectId: optionValue('objectid')
  };
}


function plainObjectName(value: unknown): string {
  return String(value || '').replace(/\\\(|\\\)|\$/g, '').trim();
}

function bindingSourceByName(board: any, name: string): any | null {
  const entry = getCoordinateView3D(board);
  const sources = [
    ...Array.from(entry?.linearObjects || []),
    ...Array.from(entry?.planeObjects || []),
    ...Array.from(entry?.circleObjects || []),
    ...Array.from(entry?.sphereObjects || []),
    ...Array.from(entry?.polygonObjects || []),
    ...Array.from(entry?.solidObjects || []),
    ...Array.from(entry?.curveObjects || []),
    ...Array.from(entry?.surfaceObjects || [])
  ] as any[];
  const expected = plainObjectName(name);
  return sources.find(source => plainObjectName(
    source?.__liaDgsPlaneName || source?.__liaDgsCircleName || source?.__liaDgsSphereName ||
    source?.__liaDgsPolygon3DName || source?.__liaDgsSolid3DName || source?.__liaDgsCurve3DName ||
    source?.__liaDgsSurface3DName || source?.__liaDgsTransformation3DName ||
    source?.__liaDgsLineName || source?.__liaDgsRayName || source?.__liaDgsVectorName ||
    source?.__liaDgsSegmentName || source?.__liaSceneRecord?.name ||
    source?.name
  ) === expected) || null;
}

function texName(name: string): string {
  const value = String(name || '').trim();
  if (value.includes('\\(') || value.includes('\\[') || value.includes('$')) return value;
  const subscript = value.match(/^(.+?)_(.+)$/);
  return subscript ? '\\(' + subscript[1] + '_{' + subscript[2] + '}\\)' : '\\(' + value + '\\)';
}

function point3DLabelText(point: any): string {
  const name = String(point?.__liaDgsPointName || '').trim();
  const showName = point?.__liaDgsShowName !== false;
  const showCoordinates = point?.__liaDgsShowValue === true;
  if (!showName && !showCoordinates) return '';
  if (!showCoordinates) return texName(name);
  const language = point?.__liaDgsLanguage === 'en' ? 'en' : 'de';
  const format = (value: number) => {
    const rounded = String(Math.round(value * 1000) / 1000);
    return language === 'de' ? rounded.replace('.', ',') : rounded;
  };
  const coordinates = point3DCoordinates(point) || [0, 0, 0];
  return '\\(' + (showName && name ? name + ':\\; ' : '') + '(' +
    coordinates.map(format).join('\\mid ') + ')\\)';
}

function refreshPoint3DLabel(point: any): void {
  const visible = point?.__liaDgsShowObject !== false &&
    (point?.__liaDgsShowName !== false || point?.__liaDgsShowValue === true);
  try {
    point?.label?.setText?.(() => point3DLabelText(point));
    point?.label?.setAttribute?.({ visible });
    if (visible) point?.label?.showElement?.();
    else point?.label?.hideElement?.();
  } catch (e) {}
}

function ensureBuckets(boardId: string): void {
  window.__points = window.__points || {};
  window.__pointStates = window.__pointStates || {};
  window.__points[boardId] = window.__points[boardId] || {};
  window.__pointStates[boardId] = window.__pointStates[boardId] || {};
}

function removePoint3D(point: any, boardId: string, name: string): void {
  clearCoordinatePoint3DConstraint(point);
  try {
    const entry = window.__coordinateViews3d && window.__coordinateViews3d[boardId];
    entry?.points?.delete(point);
    point?.__liaPoint3DCleanup?.();
    if (point && point.board) point.board.removeObject(point);
  } catch (e) {}
  if (window.__points?.[boardId]?.[name] === point) delete window.__points[boardId][name];
  if (window.__pointStates?.[boardId]) delete window.__pointStates[boardId][name];
}

function createOrUpdatePoint3D(uid: string, spec: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdatePoint3DSpatial(uid, spec)) === true;
}

function createOrUpdatePoint3DSpatial(uid: string, spec: string): boolean {
  const target = parsePoint3DSpec(spec);
  const board = window.__boards && window.__boards[target.boardId];
  const renderedOpacity = target.visible ? target.opacity : 0;
  if (!board || !target.name || ![target.x, target.y, target.z].every(Number.isFinite)) return false;
  ensureBuckets(target.boardId);

  let point = window.__points[target.boardId][target.name];
  if (point && (!point.__liaPoint3D || point.board !== board)) {
    if (point.__liaDgsMacroKey === 'macro:point3d:' + uid) removePoint3D(point, target.boardId, target.name);
    point = null;
  }

  if (point && point.__liaPoint3DMacroSpec === spec && point.__liaDgsMacroKey === 'macro:point3d:' + uid) {
    if (!target.bindingName) return true;
    const source = bindingSourceByName(board, target.bindingName);
    if (source && point.__liaPoint3DBindingSource === source) return true;
  }

  if (!point) {
    point = createCoordinatePoint3D(board, [target.x, target.y, target.z], {
      name: texName(target.name),
      fixed: target.fixed,
      visible: target.visible,
      withLabel: target.showName || target.showCoordinates,
      showInfobox: false,
      strokeColor: target.color,
      fillColor: target.color,
      highlightStrokeColor: target.color,
      highlightFillColor: target.color,
      strokeOpacity: renderedOpacity,
      fillOpacity: renderedOpacity,
      size: 7,
      face: 'x',
      strokeWidth: 2,
      highlightStrokeWidth: 2,
      label: {
        strokeColor: target.color === '#ff00ff' ? getNeutralColor() : target.color,
        fillColor: target.color === '#ff00ff' ? getNeutralColor() : target.color,
        fontSize: 24,
        parse: false,
        useMathJax: true
      }
    });
  } else {
    setCoordinatePoint3D(point, [target.x, target.y, target.z]);
    point.setAttribute({
      name: texName(target.name),
      fixed: target.fixed,
      visible: target.visible,
      withLabel: target.showName || target.showCoordinates,
      strokeColor: target.color,
      fillColor: target.color,
      strokeOpacity: renderedOpacity,
      fillOpacity: renderedOpacity,
      strokeWidth: 2,
      highlightStrokeWidth: 2
    });
  }

  // A cross marker is only visible when its 2D proxy has an explicit stroke.
  point.element2D?.setAttribute?.({ strokeWidth: 2, highlightStrokeWidth: 2 });

  point.__liaDgsPointName = target.name;
  point.__liaDgsLanguage = document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'de';
  point.__liaDgsColor = target.color;
  point.__liaDgsOpacity = target.opacity;
  point.__liaDgsShowName = target.showName;
  point.__liaDgsShowValue = target.showCoordinates;
  point.__liaDgsShowObject = target.visible;
  point.__liaDgsMacroManaged = true;
  point.__liaDgsMacroKey = 'macro:point3d:' + uid;
  point.__liaDgsPersistentId = target.objectId || point.__liaDgsMacroKey;
  point.__liaDgsMacroPointName = target.name;
  point.__liaPoint3DMacroSpec = spec;
  point.__liaPointVisual = { color: target.color, opacity: target.opacity, hasExplicitColor: target.color !== '#ff00ff' };
  refreshPoint3DLabel(point);
  window.__points[target.boardId][target.name] = point;
  if (target.bindingName) {
    const source = bindingSourceByName(board, target.bindingName);
    if (!source) {
      clearCoordinatePoint3DConstraint(point);
      return false;
    }
    const parameters = source.__liaCurve3D && target.bindingParameters?.kind === 'line'
      ? { kind: 'curve' as const, t: target.bindingParameters.t }
      : (source.__liaSurface3D && target.bindingParameters?.kind === 'plane'
        ? { kind: 'surface' as const, u: target.bindingParameters.u, v: target.bindingParameters.v }
        : (source.__liaPolygon3D && target.bindingParameters?.kind === 'plane'
          ? { kind: 'polygon' as const, u: target.bindingParameters.u, v: target.bindingParameters.v }
          : target.bindingParameters));
    if (!constrainCoordinatePoint3D(point, source, parameters)) return false;
  } else {
    clearCoordinatePoint3DConstraint(point);
  }
  const coordinates = point3DCoordinates(point);
  if (coordinates) {
    window.__pointStates[target.boardId][target.name] = {
      x: coordinates[0], y: coordinates[1], z: coordinates[2], fixed: target.fixed
    };
  }
  try { board.update(); } catch (e) {}
  try { window.__scheduleMacroCodeOrderLayers?.(); } catch (e) {}
  return true;
}

let point3DDependencyRetryCount = 0;
let point3DDependencyRetryTimer = 0;

function bootstrapPoint3D(): void {
  const active = new Set<string>();
  let pending = false;
  document.querySelectorAll<HTMLElement>('[id^="point3d-spec-"][data-spec]').forEach(node => {
    const uid = String(node.id || '').replace(/^point3d-spec-/, '');
    const spec = String(node.dataset.spec || '');
    if (!uid || !spec) return;
    active.add(uid);
    if (!createOrUpdatePoint3D(uid, spec)) pending = true;
  });
  if (!pending) point3DDependencyRetryCount = 0;
  else if (point3DDependencyRetryCount < 24 && !point3DDependencyRetryTimer) {
    point3DDependencyRetryCount += 1;
    point3DDependencyRetryTimer = window.setTimeout(() => {
      point3DDependencyRetryTimer = 0;
      window.__scheduleBootstrapPoint3D?.();
    }, 160);
  }
  Object.keys(window.__points || {}).forEach(boardId => {
    Object.keys(window.__points[boardId] || {}).forEach(name => {
      const point = window.__points[boardId][name];
      const match = String(point && point.__liaDgsMacroKey || '').match(/^macro:point3d:(.+)$/);
      if (match && !active.has(match[1])) removePoint3D(point, boardId, name);
    });
  });
}

export function init(): void {
  if (window.__point3DReady) {
    window.__scheduleBootstrapPoint3D?.();
    return;
  }
  window.__point3DReady = true;
  window.renderPoint3DFromSpec = createOrUpdatePoint3D;
  window.__bootstrapPoint3D = bootstrapPoint3D;
  window.__scheduleBootstrapPoint3D = () => {
    if (window.__bootstrapPoint3DRAF) return;
    window.__bootstrapPoint3DRAF = requestAnimationFrame(() => {
      window.__bootstrapPoint3DRAF = 0;
      bootstrapPoint3D();
    });
  };
  try {
    window.__point3DObserver = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        if (mutation.type === 'attributes') return /^point3d-spec-/.test(target?.id || '');
        return Array.from(mutation.addedNodes || []).some(node => {
          const element = node as HTMLElement;
          return element?.nodeType === 1 && (
            /^point3d-spec-/.test(element.id || '') ||
            !!element.querySelector?.('[id^="point3d-spec-"][data-spec]')
          );
        });
      });
      if (relevant) {
        point3DDependencyRetryCount = 0;
        if (point3DDependencyRetryTimer) { window.clearTimeout(point3DDependencyRetryTimer); point3DDependencyRetryTimer = 0; }
        window.__scheduleBootstrapPoint3D?.();
      }
    });
    window.__point3DObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-spec']
    });
  } catch (e) {}
  scheduleBootstrap(() => window.__scheduleBootstrapPoint3D?.());
}
