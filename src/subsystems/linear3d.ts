import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { applyLineStyle, parseLineStyle } from '../shared/lineStyle';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinateLinear3DSourcePoints,
  createCoordinateFreeVector3D,
  createCoordinateLinear3D,
  setCoordinateFreeVector3DComponents,
  type CoordinateLinear3DKind
} from '../coord/view3d';
import { getAccentColor, initThemeSync } from '../shared/theme';
import type { Vector3 } from '../shared/vector3d';

type Linear3DConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  kind: CoordinateLinear3DKind;
  firstName: string;
  secondName: string;
  components: Vector3 | null;
  color: string;
  textColor: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  showValue: boolean;
  lineStyle: string;
  strokeWidth: number;
  layer: number;
  persistentId: string;
  language: 'de' | 'en';
};

function finiteNumber(value: unknown, fallback: number): number {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return fallback;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function booleanOption(value: unknown, fallback: boolean): boolean {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (/^(?:1|true|yes|ja|on)$/.test(normalized)) return true;
  if (/^(?:0|false|no|nein|off)$/.test(normalized)) return false;
  return fallback;
}

function parseComponents(value: unknown): Vector3 | null {
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const values = splitTopLevel(raw.slice(1, -1), ';').map(part => finiteNumber(unquote(part), NaN));
  const vector = values.slice(0, 3) as Vector3;
  return values.length === 3 && vector.every(Number.isFinite) && Math.hypot(...vector) > 1e-12 ? vector : null;
}

function parseSpec(spec: string, kindValue: string, languageValue?: string): Linear3DConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const kind = (['segment', 'line', 'ray', 'vector'].includes(String(kindValue).toLowerCase())
    ? String(kindValue).toLowerCase()
    : 'segment') as CoordinateLinear3DKind;
  const nameSpec = parseMacroName(parts[1], kind === 'vector' ? 'v' : (kind === 'line' ? 'g' : (kind === 'ray' ? 'r' : 's')));
  const components = kind === 'vector' ? parseComponents(parts[3]) : null;
  const colorIndex = 4;
  const explicitColor = String(parts[colorIndex] || '').trim();
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  parts.slice(colorIndex + 1).forEach(part => {
    const match = String(part).match(/^([^=]+)=(.*)$/);
    if (match) options[String(match[1]).trim().toLowerCase()] = unquote(String(match[2]).trim());
    else if (part) flags.add(String(part).trim().toLowerCase());
  });
  const visibleValue = options.visible ?? options.sichtbar;
  const showValueValue = options.value ?? options.wert ?? options.length ?? options.laenge ?? options.länge;
  const fixedValue = options.fixed ?? options.fixiert;
  const styleValue = options.linestyle ?? options.linienstil;
  const widthValue = options.width ?? options.breite ?? options.strokewidth ?? options.linienstaerke ?? options.linienstärke;
  const opacity = Math.max(0, Math.min(1, finiteNumber(options.opacity ?? options.deckkraft, 1)));
  const fallbackColor = getAccentColor();
  return {
    boardId: String(parts[0] || 'A1').trim() || 'A1',
    name: nameSpec.name,
    showName: nameSpec.showName && !flags.has('noname'),
    kind,
    firstName: String(parts[2] || '').trim(),
    secondName: components ? '' : String(parts[3] || '').trim(),
    components,
    color: /^#[0-9a-f]{3,8}$/i.test(explicitColor) ? explicitColor : fallbackColor,
    textColor: /^#[0-9a-f]{3,8}$/i.test(options.textcolor || options.textfarbe || '')
      ? (options.textcolor || options.textfarbe)
      : (/^#[0-9a-f]{3,8}$/i.test(explicitColor) ? explicitColor : fallbackColor),
    opacity,
    visible: visibleValue == null ? !flags.has('hidden') : booleanOption(visibleValue, true),
    fixed: fixedValue == null ? flags.has('fix') || flags.has('fixed') : booleanOption(fixedValue, false),
    showValue: showValueValue == null ? flags.has('value') || flags.has('wert') : booleanOption(showValueValue, false),
    lineStyle: parseLineStyle(styleValue || 'solid') || 'solid',
    strokeWidth: Math.max(0.5, Math.min(20, finiteNumber(widthValue, 3))),
    layer: Math.max(0, Math.min(20, Math.round(finiteNumber(options.layer ?? options.ebene, 5)))),
    persistentId: String(options.objectid ?? options.objektid ?? '').trim(),
    language: String(languageValue || '').toLowerCase() === 'en' ? 'en' : 'de'
  };
}

function pointRegistry(boardId: string): Record<string, any> {
  return window.__points?.[boardId] || {};
}

function pointByName(boardId: string, name: string): any | null {
  const point = pointRegistry(boardId)[name];
  return point?.__liaPoint3D ? point : null;
}

function lineLabel(config: Linear3DConfig): string {
  if (!config.showName) return '';
  const name = config.kind === 'vector' ? '\\overrightarrow{' + config.name + '}' : config.name;
  return name ? '\\(' + name + '\\)' : '';
}

function formatNumber(value: number, language: 'de' | 'en'): string {
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round(value * 1000) / 1000;
  const text = Number.isFinite(rounded) ? String(rounded) : '?';
  return language === 'de' ? text.replace('.', '{,}') : text;
}

function pointCoordinates(point: any): Vector3 | null {
  try {
    const result: Vector3 = [Number(point.X()), Number(point.Y()), Number(point.Z())];
    return result.every(Number.isFinite) ? result : null;
  } catch (e) { return null; }
}

function valueLabel(config: Linear3DConfig, object: any): string {
  if (!config.showValue) return lineLabel(config);
  const points = coordinateLinear3DSourcePoints(object);
  const first = points && pointCoordinates(points[0]);
  const second = points && pointCoordinates(points[1]);
  if (!first || !second) return lineLabel(config);
  const components: Vector3 = [second[0] - first[0], second[1] - first[1], second[2] - first[2]];
  const tuple = (values: Vector3) => '\\begin{pmatrix}' +
    values.map(value => formatNumber(value, config.language)).join('\\\\') + '\\end{pmatrix}';
  const displayedName = config.kind === 'vector'
    ? '\\overrightarrow{' + (config.name || 'v') + '}'
    : config.name;
  const prefix = config.showName && displayedName ? displayedName + ':\\; ' : '';
  if (config.kind === 'vector') {
    return '\\(' + (config.showName ? displayedName + '=' : '') + tuple(components) +
      ',\\;|' + displayedName + '|=' + formatNumber(Math.hypot(...components), config.language) + '\\)';
  }
  if (config.kind === 'segment') {
    return '\\(' + prefix + formatNumber(Math.hypot(...components), config.language) +
      '\\,\\mathrm{' + (config.language === 'de' ? 'LE' : 'LU') + '}\\)';
  }
  const parameter = config.kind === 'ray' ? 't\\geq0' : 't\\in\\mathbb{R}';
  return '\\(' + prefix + '\\vec{x}=' + tuple(first) + '+t\\,' + tuple(components) +
    ',\\;' + parameter + '\\)';
}

function renderedObject(object: any): any {
  return object?.element2D || object;
}

function applyAppearance(object: any, config: Linear3DConfig): void {
  const visible = config.visible;
  const opacity = visible ? config.opacity : 0;
  object.__liaDgsShowObject = visible;
  object.__liaDgsOpacity = config.opacity;
  object.__liaDgsLineColor = config.color;
  object.__liaDgsTextColor = config.textColor;
  object.__liaDgsLineStyle = config.lineStyle;
  object.__liaDgsSegmentStrokeWidth = config.strokeWidth;
  const target = renderedObject(object);
  try {
    target.setAttribute({
      name: lineLabel(config),
      withLabel: true,
      visible,
      strokeColor: config.color,
      highlightStrokeColor: config.color,
      strokeOpacity: opacity,
      highlightStrokeOpacity: opacity,
      strokeWidth: config.strokeWidth,
      highlightStrokeWidth: config.strokeWidth + 1,
      fixed: config.fixed,
      layer: config.layer
    });
  } catch (e) {}
  applyLineStyle(target, config.lineStyle);
  if (object.label) {
    try {
      object.label.setText?.(() => valueLabel(config, object));
      object.label.setAttribute({
        visible: visible && (config.showName || config.showValue),
        strokeColor: config.textColor,
        fillColor: config.textColor,
        strokeOpacity: opacity,
        fillOpacity: opacity,
        fontSize: 20,
        parse: false,
        useMathJax: true
      });
    } catch (e) {}
  }
}

function applyMetadata(object: any, config: Linear3DConfig, uid: string, points: [any, any]): void {
  const name = config.name;
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:linear3d:' + uid;
  object.__liaDgsPersistentId = config.persistentId || 'macro:linear3d:' + uid;
  object.__liaDgsSegment = config.kind === 'segment';
  object.__liaDgsLine = config.kind === 'line';
  object.__liaDgsRay = config.kind === 'ray';
  object.__liaDgsVector = config.kind === 'vector';
  object.__liaDgsSegmentName = config.kind === 'segment' ? name : '';
  object.__liaDgsLineName = config.kind === 'line' ? name : '';
  object.__liaDgsRayName = config.kind === 'ray' ? name : '';
  object.__liaDgsVectorName = config.kind === 'vector' ? name : '';
  object.__liaDgsVectorAutoName = false;
  object.__liaDgsLinearPoints = points;
  object.__liaDgsLanguage = config.language;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsShowLength = config.kind === 'segment' && config.showValue;
  object.__liaDgsShowEquation = (config.kind === 'line' || config.kind === 'ray') && config.showValue;
  object.__liaDgsShowValue = config.kind === 'vector' && config.showValue;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLayer = config.layer;
  object.__liaDgsSegmentDesign = config.kind === 'segment' ? '-' : undefined;
  if (object.__liaSceneRecord) {
    object.__liaSceneRecord.id = object.__liaDgsPersistentId;
    object.__liaSceneRecord.name = name;
    object.__liaSceneRecord.fixed = config.fixed;
    object.__liaSceneRecord.visible = config.visible;
    const sourceIds = points.map(point => String(point.__liaDgsPersistentId || point.__liaDgsPointName || point.name || '')) as [string, string];
    object.__liaSceneRecord.pointIds = config.components ? [sourceIds[0], ''] : sourceIds;
    if (config.components) {
      object.__liaSceneRecord.definition = 'components';
      object.__liaSceneRecord.anchorPointId = sourceIds[0];
      object.__liaSceneRecord.components = config.components.slice();
    }
    object.__liaSceneRecord.style = {
      lineColor: config.color,
      textColor: config.textColor,
      opacity: config.opacity,
      lineStyle: config.lineStyle,
      strokeWidth: config.strokeWidth,
      showName: config.showName,
      showValue: config.showValue
    };
  }
  applyAppearance(object, config);
}

function removeEntry(key: string): void {
  const entry = window.__linear3DEntries?.[key];
  if (!entry) return;
  try { entry.object?.__liaLinear3DCleanup?.(); } catch (e) {}
  try { entry.board?.removeObject?.(entry.object); } catch (e) {}
  delete window.__linear3DEntries![key];
}

function createOrUpdate(uid: string, spec: string, kind: string, language?: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, kind, language)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, kind: string, language?: string): boolean {
  const config = parseSpec(spec, kind, language);
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') return false;
  const first = pointByName(config.boardId, config.firstName);
  const second = config.components ? null : pointByName(config.boardId, config.secondName);
  if (!first || (!config.components && !second)) return false;
  const key = String(uid);
  const old = window.__linear3DEntries?.[key];
  const oldPoints = old?.object ? coordinateLinear3DSourcePoints(old.object) : null;
  const reusable = !!old && old.board === board && old.config.kind === config.kind &&
    oldPoints?.[0] === first && (
      config.components ? old.object.__liaLinear3DFreeVector === true : oldPoints?.[1] === second
    );
  // An unchanged macro must retain learner edits and avoid another full board render.
  if (reusable && old.spec === spec && JSON.stringify(old.config) === JSON.stringify(config)) return true;
  let object = reusable ? old.object : null;
  if (!reusable && old) removeEntry(key);
  try {
    if (!object) {
      const attributes = {
        name: lineLabel(config),
        withLabel: true,
        fixed: true,
        strokeColor: config.color,
        highlightStrokeColor: config.color,
        strokeWidth: config.strokeWidth,
        highlightStrokeWidth: config.strokeWidth + 1,
        label: {
          strokeColor: config.textColor,
          fillColor: config.textColor,
          fontSize: 20,
          parse: false,
          useMathJax: true
        }
      };
      object = config.components
        ? createCoordinateFreeVector3D(board, first, config.components, attributes)
        : createCoordinateLinear3D(board, config.kind, first, second, attributes);
    } else if (config.components) {
      setCoordinateFreeVector3DComponents(object, config.components);
    }
    const points = coordinateLinear3DSourcePoints(object);
    if (!points) return false;
    applyMetadata(object, config, uid, points);
    window.__linear3DEntries![key] = { board, boardId: config.boardId, object, config, spec, kind, language };
    try { board.fullUpdate?.(); } catch (e) { try { board.update?.(); } catch (e2) {} }
    return true;
  } catch (e) {
    return false;
  }
}

export function init(): void {
  if (window.__linear3DReady) {
    window.__scheduleBootstrapLinear3D?.();
    return;
  }
  window.__linear3DReady = true;
  window.__linear3DEntries = window.__linear3DEntries || {};
  initThemeSync();
  let pending = false;

  window.renderLinear3DFromSpec = createOrUpdate;
  window.__bootstrapLinear3D = () => {
    pending = false;
    const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="linear3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('linear3d-spec-'.length);
      active.add(uid);
      const spec = marker.dataset.spec || '';
      const kind = marker.dataset.kind || 'segment';
      const language = marker.dataset.language || 'de';
      if (!createOrUpdate(uid, spec, kind, language)) pending = true;
    });
    Object.keys(window.__linear3DEntries || {}).forEach(key => {
      if (!active.has(key)) removeEntry(key);
    });
  };
  window.__scheduleBootstrapLinear3D = () => {
    if (window.__bootstrapLinear3DRAF) return;
    window.__bootstrapLinear3DRAF = requestAnimationFrame(() => {
      window.__bootstrapLinear3DRAF = 0;
      window.__bootstrapLinear3D?.();
    });
  };

  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (record.type === 'attributes') return (record.target as Element)?.id?.startsWith('linear3d-spec-');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
        node.nodeType === 1 && (
          (node as Element).id?.startsWith('linear3d-spec-') ||
          !!(node as Element).querySelector?.('[id^="linear3d-spec-"]')
        )
      );
    });
    if (relevant) window.__scheduleBootstrapLinear3D?.();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-kind', 'data-language'] });
  window.__linear3DObserver = observer;

  window.__registerLiaThemeListener?.(() => {
    Object.values(window.__linear3DEntries || {}).forEach((entry: any) => {
      if (!entry?.object || !entry?.config) return;
      if (!/^#[0-9a-f]{3,8}$/i.test(String(entry.config.color || ''))) {
        entry.config.color = getAccentColor();
        applyAppearance(entry.object, entry.config);
      }
    });
  });

  scheduleBootstrap(() => window.__scheduleBootstrapLinear3D?.());
  window.setTimeout(() => {
    if (pending) window.__scheduleBootstrapLinear3D?.();
  }, 120);
}
