import { withCoordinate3DImport } from '../coord/view3d';
import { scheduleBootstrap } from '../shared/bootstrap';
import { applyLineStyle, parseLineStyle } from '../shared/lineStyle';
import { parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import {
  coordinatePlane3DData,
  createCoordinatePlane3D,
  getCoordinateView3D,
  type CoordinatePlane3DDefinition
} from '../coord/view3d';
import { getAccentColor, initThemeSync } from '../shared/theme';

type PlaneEquationForm = 'parameter' | 'normal' | 'coordinate';

type Plane3DConfig = {
  boardId: string;
  name: string;
  showName: boolean;
  definition: CoordinatePlane3DDefinition;
  pointNames: string[];
  vectorNames: string[];
  lineColor: string;
  fillColor: string;
  textColor: string;
  opacity: number;
  visible: boolean;
  fixed: boolean;
  showEquation: boolean;
  equationForm: PlaneEquationForm;
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

function color(value: unknown, fallback: string): string {
  const result = String(value == null ? '' : value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(result) ? result : fallback;
}

function normalizeDefinition(value: unknown): CoordinatePlane3DDefinition {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'point-normal' || normalized === 'normal' || normalized === 'punkt-normal') return 'point-normal';
  if (normalized === 'point-vectors' || normalized === 'vectors' || normalized === 'parameter') return 'point-vectors';
  return 'three-points';
}

function parseSpec(spec: string, definitionValue: string, languageValue?: string): Plane3DConfig {
  const parts = splitTopLevel(unquote(String(spec || '')), ';').map(part => unquote(part).trim());
  const definition = normalizeDefinition(definitionValue);
  const sourceCount = definition === 'three-points' ? 3 : (definition === 'point-vectors' ? 3 : 2);
  const sourceNames = parts.slice(2, 2 + sourceCount);
  const colorIndex = 2 + sourceCount;
  const explicitColor = color(parts[colorIndex], getAccentColor());
  let opacityIndex = colorIndex + 1;
  let opacity = 0.25;
  if (parts[opacityIndex] && !String(parts[opacityIndex]).includes('=')) {
    opacity = Math.max(0, Math.min(1, finiteNumber(parts[opacityIndex], 0.25)));
    opacityIndex += 1;
  }
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  parts.slice(opacityIndex).forEach(part => {
    const match = String(part).match(/^([^=]+)=(.*)$/);
    if (match) options[String(match[1]).trim().toLowerCase()] = unquote(String(match[2]).trim());
    else if (part) flags.add(String(part).trim().toLowerCase());
  });
  const nameSpec = parseMacroName(parts[1], 'E');
  const formValue = String(options.equation ?? options.form ?? options.gleichung ?? options.gleichungsform ?? 'parameter').toLowerCase();
  const equationForm: PlaneEquationForm = formValue.startsWith('coord') || formValue.startsWith('koord')
    ? 'coordinate'
    : (formValue.startsWith('norm') ? 'normal' : 'parameter');
  const visibleValue = options.visible ?? options.sichtbar;
  const fixedValue = options.fixed ?? options.fixiert;
  const valueValue = options.value ?? options.wert ?? options.showequation ?? options.gleichunganzeigen;
  const styleValue = options.linestyle ?? options.linienstil;
  const widthValue = options.width ?? options.breite ?? options.strokewidth ?? options.linienstaerke;
  const lineColor = color(options.linecolor ?? options.linienfarbe, explicitColor);
  const pointNames = definition === 'three-points' ? sourceNames.slice(0, 3) : sourceNames.slice(0, 1);
  const vectorNames = definition === 'three-points' ? [] : sourceNames.slice(1);
  return {
    boardId: String(parts[0] || 'A1').trim() || 'A1',
    name: nameSpec.name,
    showName: nameSpec.showName && !flags.has('noname'),
    definition,
    pointNames,
    vectorNames,
    lineColor,
    fillColor: color(options.fillcolor ?? options.fuellfarbe, lineColor),
    textColor: color(options.textcolor ?? options.textfarbe, explicitColor),
    opacity,
    visible: visibleValue == null ? !flags.has('hidden') : booleanOption(visibleValue, true),
    fixed: fixedValue == null ? flags.has('fix') || flags.has('fixed') : booleanOption(fixedValue, false),
    showEquation: valueValue == null ? flags.has('value') || flags.has('wert') : booleanOption(valueValue, false),
    equationForm,
    lineStyle: parseLineStyle(styleValue || 'solid') || 'solid',
    strokeWidth: Math.max(0.5, Math.min(20, finiteNumber(widthValue, 2))),
    layer: Math.max(0, Math.min(20, Math.round(finiteNumber(options.layer ?? options.ebene, 4)))),
    persistentId: String(options.objectid ?? options.objektid ?? '').trim(),
    language: String(languageValue || '').toLowerCase() === 'en' ? 'en' : 'de'
  };
}

function pointByName(boardId: string, name: string): any | null {
  const point = window.__points?.[boardId]?.[name];
  return point?.__liaPoint3D ? point : null;
}

function vectorByName(board: any, name: string): any | null {
  const entry = getCoordinateView3D(board);
  for (const object of Array.from(entry?.linearObjects || []) as any[]) {
    const objectName = String(object.__liaDgsVectorName || object.__liaSceneRecord?.name || object.name || '');
    if (object.__liaLinear3DKind === 'vector' && objectName === name) return object;
  }
  return null;
}

function formatNumber(value: number, language: 'de' | 'en'): string {
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round(value * 1000) / 1000;
  const text = Number.isFinite(rounded) ? String(rounded) : '?';
  return language === 'de' ? text.replace('.', '{,}') : text;
}

function tuple(values: readonly number[], language: 'de' | 'en'): string {
  return '\\begin{pmatrix}' + values.map(value => formatNumber(value, language)).join('\\\\') + '\\end{pmatrix}';
}

function planeLabel(config: Plane3DConfig, object?: any): string {
  const name = config.showName && config.name ? config.name : '';
  if (!config.showEquation || !object) return name ? '\\(' + name + '\\)' : '';
  const data = coordinatePlane3DData(object);
  if (!data) return name ? '\\(' + name + '\\)' : '';
  const prefix = name ? name + ':\\;' : '';
  if (config.equationForm === 'coordinate') {
    const coefficients = data.coefficients;
    return '\\(' + prefix +
      formatNumber(coefficients[0], config.language) + 'x+' +
      formatNumber(coefficients[1], config.language) + 'y+' +
      formatNumber(coefficients[2], config.language) + 'z=' +
      formatNumber(-coefficients[3], config.language) + '\\)';
  }
  if (config.equationForm === 'normal') {
    return '\\(' + prefix + '\\left(\\vec{x}-' + tuple(data.point, config.language) +
      '\\right)\\cdot' + tuple(data.normal, config.language) + '=0\\)';
  }
  return '\\(' + prefix + '\\vec{x}=' + tuple(data.point, config.language) +
    '+r\\,' + tuple(data.direction1, config.language) +
    '+s\\,' + tuple(data.direction2, config.language) + '\\)';
}

function renderedParts(object: any): any[] {
  const result: any[] = [];
  const add = (value: any) => {
    if (value && !result.includes(value)) result.push(value);
  };
  add(object);
  add(object?.element2D);
  (object?.element2D?.borders || object?.borders || []).forEach(add);
  return result;
}

function applyAppearance(object: any, config: Plane3DConfig): void {
  object.__liaPlane3DUserVisible = config.visible;
  object.__liaDgsShowObject = config.visible;
  object.__liaDgsOpacity = config.opacity;
  object.__liaDgsLineColor = config.lineColor;
  object.__liaDgsFillColor = config.fillColor;
  object.__liaDgsTextColor = config.textColor;
  object.__liaDgsLineStyle = config.lineStyle;
  object.__liaDgsSegmentStrokeWidth = config.strokeWidth;
  renderedParts(object).forEach(part => {
    try {
      part.setAttribute?.({
        strokeColor: config.lineColor,
        highlightStrokeColor: config.lineColor,
        fillColor: config.fillColor,
        highlightFillColor: config.fillColor,
        strokeOpacity: config.visible ? Math.max(0.2, config.opacity) : 0,
        highlightStrokeOpacity: config.visible ? Math.max(0.2, config.opacity) : 0,
        fillOpacity: config.visible ? config.opacity : 0,
        highlightFillOpacity: config.visible ? Math.min(1, config.opacity + 0.12) : 0,
        strokeWidth: config.strokeWidth,
        highlightStrokeWidth: config.strokeWidth + 1,
        fixed: config.fixed,
        layer: config.layer
      });
      applyLineStyle(part, config.lineStyle);
    } catch (e) {}
  });
  try {
    object.setAttribute?.({ name: planeLabel(config, object), withLabel: true });
  } catch (e) {}
  if (object.label) {
    try {
      object.label.setText?.(() => planeLabel(config, object));
      object.label.setAttribute?.({
        visible: config.visible && (config.showName || config.showEquation),
        strokeColor: config.textColor,
        fillColor: config.textColor,
        strokeOpacity: config.opacity,
        fillOpacity: config.opacity,
        fontSize: 18,
        parse: false,
        useMathJax: true
      });
    } catch (e) {}
  }
}

function applyMetadata(object: any, config: Plane3DConfig, uid: string, points: any[], vectors: any[]): void {
  object.__liaDgsMacroManaged = true;
  object.__liaDgsMacroKey = 'macro:plane3d:' + uid;
  object.__liaDgsPersistentId = config.persistentId || 'macro:plane3d:' + uid;
  object.__liaDgsPlane = true;
  object.__liaDgsPlaneName = config.name;
  object.__liaDgsShowName = config.showName;
  object.__liaDgsShowEquation = config.showEquation;
  object.__liaDgsPlaneEquationForm = config.equationForm;
  object.__liaDgsFixed = config.fixed;
  object.__liaDgsLayer = config.layer;
  object.__liaDgsLanguage = config.language;
  object.__liaPlane3DDefinition = config.definition;
  object.__liaPlane3DSourcePoints = points;
  object.__liaPlane3DSourceVectors = vectors;
  if (object.__liaSceneRecord) {
    object.__liaSceneRecord.id = object.__liaDgsPersistentId;
    object.__liaSceneRecord.name = config.name;
    object.__liaSceneRecord.visible = config.visible;
    object.__liaSceneRecord.fixed = config.fixed;
    object.__liaSceneRecord.definition = config.definition;
    object.__liaSceneRecord.pointIds = points.map(point => String(point.__liaDgsPersistentId || point.__liaDgsPointName || point.name || ''));
    object.__liaSceneRecord.vectorIds = vectors.map(vector => String(vector.__liaDgsPersistentId || vector.__liaDgsVectorName || vector.name || ''));
    object.__liaSceneRecord.equationForm = config.equationForm;
    object.__liaSceneRecord.style = {
      lineColor: config.lineColor,
      fillColor: config.fillColor,
      textColor: config.textColor,
      opacity: config.opacity,
      lineStyle: config.lineStyle,
      strokeWidth: config.strokeWidth,
      showName: config.showName,
      showEquation: config.showEquation,
      layer: config.layer
    };
  }
  applyAppearance(object, config);
}

function sameSources(object: any, definition: CoordinatePlane3DDefinition, points: any[], vectors: any[]): boolean {
  return object?.__liaPlane3DDefinition === definition &&
    points.length === object.__liaPlane3DSourcePoints?.length &&
    vectors.length === object.__liaPlane3DSourceVectors?.length &&
    points.every((point, index) => object.__liaPlane3DSourcePoints[index] === point) &&
    vectors.every((vector, index) => object.__liaPlane3DSourceVectors[index] === vector);
}

function removeEntry(key: string): void {
  const entry = window.__plane3DEntries?.[key];
  if (!entry) return;
  try { entry.object?.__liaPlane3DCleanup?.(); } catch (e) {}
  try { entry.board?.removeObject?.(entry.object); } catch (e) {}
  delete window.__plane3DEntries![key];
}

function createOrUpdate(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const boardId = unquote(splitTopLevel(unquote(String(spec || '')), ';')[0] || '').trim();
  return withCoordinate3DImport(window.__boards?.[boardId], () => createOrUpdateSpatial(uid, spec, definitionValue, language)) === true;
}

function createOrUpdateSpatial(uid: string, spec: string, definitionValue: string, language?: string): boolean {
  const config = parseSpec(spec, definitionValue, language);
  const board = window.__boards?.[config.boardId];
  if (!board || board.__liaSceneMode !== '3d') return false;
  const points = config.pointNames.map(name => pointByName(config.boardId, name));
  const vectors = config.vectorNames.map(name => vectorByName(board, name));
  if (points.some(point => !point) || vectors.some(vector => !vector)) return false;
  const key = String(uid);
  const previous = window.__plane3DEntries?.[key];
  const reusable = !!previous && previous.board === board &&
    sameSources(previous.object, config.definition, points, vectors);
  // An unchanged macro must retain learner edits and avoid another full board render.
  if (reusable && previous.spec === spec && JSON.stringify(previous.config) === JSON.stringify(config)) return true;
  let object = reusable ? previous.object : null;
  if (!reusable && previous) removeEntry(key);
  try {
    if (!object) {
      object = createCoordinatePlane3D(board, config.definition, points, vectors, {
        name: config.name,
        withLabel: true,
        strokeColor: config.lineColor,
        fillColor: config.fillColor,
        strokeWidth: config.strokeWidth,
        fillOpacity: config.opacity,
        label: {
          strokeColor: config.textColor,
          fillColor: config.textColor,
          fontSize: 18,
          parse: false,
          useMathJax: true
        }
      });
    }
    applyMetadata(object, config, uid, points, vectors);
    window.__plane3DEntries![key] = { board, boardId: config.boardId, object, config, spec, definition: config.definition, language };
    try { board.fullUpdate?.(); } catch (e) { try { board.update?.(); } catch (e2) {} }
    return true;
  } catch (e) {
    return false;
  }
}

export function init(): void {
  if (window.__plane3DReady) {
    window.__scheduleBootstrapPlane3D?.();
    return;
  }
  window.__plane3DReady = true;
  window.__plane3DEntries = window.__plane3DEntries || {};
  initThemeSync();
  let pending = false;

  window.renderPlane3DFromSpec = createOrUpdate;
  window.__bootstrapPlane3D = () => {
    pending = false;
    const active = new Set<string>();
    document.querySelectorAll<HTMLElement>('[id^="plane3d-spec-"]').forEach(marker => {
      const uid = marker.id.slice('plane3d-spec-'.length);
      active.add(uid);
      const spec = marker.dataset.spec || '';
      const definition = marker.dataset.definition || 'three-points';
      const language = marker.dataset.language || 'de';
      if (!createOrUpdate(uid, spec, definition, language)) pending = true;
    });
    Object.keys(window.__plane3DEntries || {}).forEach(key => {
      if (!active.has(key)) removeEntry(key);
    });
    window.__scheduleBootstrapIntersection3D?.();
    window.__scheduleBootstrapPoint3D?.();
  };
  window.__scheduleBootstrapPlane3D = () => {
    if (window.__bootstrapPlane3DRAF) return;
    window.__bootstrapPlane3DRAF = requestAnimationFrame(() => {
      window.__bootstrapPlane3DRAF = 0;
      window.__bootstrapPlane3D?.();
    });
  };

  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (record.type === 'attributes') return (record.target as Element)?.id?.startsWith('plane3d-spec-');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
        node.nodeType === 1 && (
          (node as Element).id?.startsWith('plane3d-spec-') ||
          !!(node as Element).querySelector?.('[id^="plane3d-spec-"]')
        )
      );
    });
    if (relevant) window.__scheduleBootstrapPlane3D?.();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-spec', 'data-definition', 'data-language']
  });
  window.__plane3DObserver = observer;

  scheduleBootstrap(() => window.__scheduleBootstrapPlane3D?.());
  window.setTimeout(() => {
    if (pending) window.__scheduleBootstrapPlane3D?.();
  }, 160);
}
