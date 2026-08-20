// Circle subsystem (@Circle / @Kreis macros).
// Creates a circle around a named point with optional area and circumference.

import { isHiddenNameOption, parseMacroName, splitTopLevel, unquote } from '../shared/parser';
import { getAccentColor, getNeutralColor, initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';
import { getLivePoint } from '../shared/boardObjects';
import { subscriptTexName as texName } from '../shared/texName';
import { mayDisplayDgsValues } from '../shared/dgsPermissions';
import {
  applyLineStyle,
  lineStyleAttributes,
  parseLineStyleOptions,
  type LineStyle
} from '../shared/lineStyle';

interface CircleConfig {
  boardId: string;
  name: string;
  showName: boolean;
  centerName: string;
  color: string;
  hasExplicitColor: boolean;
  opacity: number;
  radius: number;
  radiusPointName: string;
  showArea: boolean;
  showCircumference: boolean;
  language: 'de' | 'en';
  visible: boolean;
  lineStyle: LineStyle;
}

export function init(): void {
  if (window.__circleReady) {
    try {
      if (window.__scheduleBootstrapCircles) window.__scheduleBootstrapCircles();
    } catch (e) {}
    return;
  }
  window.__circleReady = true;

  window.__circleEntries = window.__circleEntries || {};
  initThemeSync();

  let hasPendingCircles = false;

  function parseCircleSpec(spec: string, language?: string): CircleConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const explicitColor = String(parts[3] || '').trim();
    const parsedOpacity = parseFloat(String(parts[4] || '').replace(',', '.'));
    const opacity = Number.isFinite(parsedOpacity)
      ? Math.max(0, Math.min(1, parsedOpacity))
      : 0.2;
    const options = parts.slice(5).map(function(option) {
      return String(option || '').trim();
    });
    const name = parseMacroName(parts[1] || '');
    const visible = !options.some(function(option) {
      return /^(?:visible|sichtbar)\s*=\s*0$/i.test(option);
    });
    let radius = 1;
    let radiusPointName = '';

    options.forEach(function(option) {
      const match = option.match(/^radius\s*=\s*(.+)$/i);
      if (!match) return;
      const radiusSpec = String(match[1] || '').trim();
      const isNumeric = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(radiusSpec);

      if (isNumeric) {
        const parsedRadius = Number(radiusSpec.replace(',', '.'));
        if (Number.isFinite(parsedRadius) && parsedRadius !== 0) radius = Math.abs(parsedRadius);
        radiusPointName = '';
      } else {
        radiusPointName = radiusSpec;
      }
    });

    return {
      boardId: String(parts[0] || '').trim(),
      name: name.name,
      showName: name.showName && !options.some(isHiddenNameOption),
      centerName: String(parts[2] || '').trim(),
      color: explicitColor || getAccentColor(),
      hasExplicitColor: !!explicitColor,
      opacity: opacity,
      radius: radius,
      radiusPointName: radiusPointName,
      showArea: options.some(function(option) {
        return /^(?:inhalt|area)\s*=\s*1$/i.test(option);
      }),
      showCircumference: options.some(function(option) {
        return /^(?:umfang|circumference|perimeter)\s*=\s*1$/i.test(option);
      }),
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de',
      visible: visible,
      lineStyle: parseLineStyleOptions(options)
    };
  }

  function entryKey(uid: string): string {
    return 'circle-' + String(uid || '');
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__circleEntries[key];
    if (!entry) return;

    try {
      if (entry.board && entry.measurementLabel) entry.board.removeObject(entry.measurementLabel);
    } catch (e) {}
    try {
      if (entry.board && entry.nameLabel) entry.board.removeObject(entry.nameLabel);
    } catch (e) {}
    try {
      if (entry.board && entry.circle) entry.board.removeObject(entry.circle);
    } catch (e) {}

    delete window.__circleEntries[key];
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  function formatValue(value: number, language: 'de' | 'en'): string {
    const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
    let formatted = rounded.toFixed(3);
    if (language === 'de') formatted = formatted.replace('.', '{,}');
    return formatted;
  }

  function currentRadius(cfg: CircleConfig, center: any, radiusPoint: any): number {
    if (!radiusPoint) return cfg.radius;

    try {
      return Math.hypot(
        Number(radiusPoint.X()) - Number(center.X()),
        Number(radiusPoint.Y()) - Number(center.Y())
      );
    } catch (e) {
      return NaN;
    }
  }

  function measurementText(cfg: CircleConfig, center: any, radiusPoint: any): string {
    if (!mayDisplayDgsValues(cfg.boardId)) return '';
    const radius = currentRadius(cfg, center, radiusPoint);
    if (!Number.isFinite(radius)) return '';
    const lines: string[] = [];
    if (cfg.showArea) {
      const unit = cfg.language === 'de' ? 'FE' : 'AU';
      lines.push('A \\approx ' + formatValue(Math.PI * radius * radius, cfg.language) +
        '\\,\\mathrm{' + unit + '}');
    }
    if (cfg.showCircumference) {
      const unit = cfg.language === 'de' ? 'LE' : 'LU';
      lines.push('u \\approx ' + formatValue(2 * Math.PI * radius, cfg.language) +
        '\\,\\mathrm{' + unit + '}');
    }

    if (!lines.length) return '';
    if (lines.length === 1) return '\\(' + lines[0] + '\\)';
    // Leave two text lines of vertical space so the midpoint remains visible.
    return '\\(\\begin{aligned}' + lines.join('\\\\[2em]') + '\\end{aligned}\\)';
  }

  function applyCircleStyle(circle: any, color: string, opacity: number): void {
    if (!circle || typeof circle.setAttribute !== 'function') return;
    try {
      circle.setAttribute({
        strokeColor: color,
        highlightStrokeColor: color,
        strokeOpacity: 1,
        highlightStrokeOpacity: 1,
        strokeWidth: 2.5,
        highlightStrokeWidth: 2.5,
        fillColor: color,
        highlightFillColor: color,
        fillOpacity: opacity,
        highlightFillOpacity: opacity
      });
    } catch (e) {}
  }

  function applyNameStyle(label: any, color: string): void {
    if (!label || typeof label.setAttribute !== 'function') return;
    try { label.setAttribute({ strokeColor: color, fillColor: color }); } catch (e) {}
  }

  function applyMeasurementTheme(label: any): void {
    if (!label || typeof label.setAttribute !== 'function') return;
    const color = getNeutralColor();
    try { label.setAttribute({ strokeColor: color, fillColor: color }); } catch (e) {}
  }

  function setElementVisibility(element: any, visible: boolean): void {
    if (!element) return;
    try {
      if (typeof element.setAttribute === 'function') element.setAttribute({ visible: visible });
      if (visible && typeof element.showElement === 'function') element.showElement();
      if (!visible && typeof element.hideElement === 'function') element.hideElement();
    } catch (e) {}
  }

  function applyCircleVisibility(
    circle: any,
    nameLabel: any,
    measurementLabel: any,
    cfg: CircleConfig
  ): void {
    const visible = cfg.visible !== false;
    setElementVisibility(circle, visible);
    setElementVisibility(nameLabel, visible && cfg.showName && !!cfg.name);
    setElementVisibility(measurementLabel, visible && mayDisplayDgsValues(cfg.boardId) &&
      (cfg.showArea || cfg.showCircumference));
  }

  function createNameLabel(board: any, center: any, radiusPoint: any, cfg: CircleConfig): any {
    if (!cfg.name) return null;

    return board.create('text', [
      function() {
        const diagonal = currentRadius(cfg, center, radiusPoint) * Math.SQRT1_2;
        return Number(center.X()) + diagonal + 8 / Math.max(1e-9, Math.abs(Number(board.unitX) || 1));
      },
      function() {
        const diagonal = currentRadius(cfg, center, radiusPoint) * Math.SQRT1_2;
        return Number(center.Y()) + diagonal + 8 / Math.max(1e-9, Math.abs(Number(board.unitY) || 1));
      },
      '\\(' + texName(cfg.name) + '\\)'
    ], {
      fixed: true,
      visible: cfg.visible && cfg.showName,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'left',
      anchorY: 'bottom',
      strokeColor: cfg.color,
      fillColor: cfg.color,
      fontSize: 14
    });
  }

  function applyCircleDgsMetadata(
    circle: any,
    center: any,
    radiusPoint: any,
    nameLabel: any,
    measurementLabel: any,
    cfg: CircleConfig
  ): void {
    if (!circle) return;
    circle.__liaDgsMacroManaged = true;
    circle.__liaDgsCircle = true;
    circle.__liaDgsCircleName = cfg.name;
    circle.__liaDgsCircleCenter = center;
    circle.__liaDgsCircleRadiusPoint = radiusPoint || null;
    circle.__liaDgsLanguage = cfg.language;
    circle.__liaDgsColor = cfg.color;
    circle.__liaDgsTextColor = cfg.color;
    circle.__liaDgsLineColor = cfg.color;
    circle.__liaDgsFillColor = cfg.color;
    circle.__liaDgsShowName = cfg.showName;
    circle.__liaDgsShowObject = cfg.visible;
    circle.__liaDgsOpacity = cfg.opacity;
    circle.__liaDgsShowArea = cfg.showArea;
    circle.__liaDgsShowPerimeter = cfg.showCircumference;
    circle.__liaDgsCircleNameLabel = nameLabel || null;
    circle.__liaDgsCircleMeasurementLabel = measurementLabel || null;
    circle.__liaDgsCircleLabel = nameLabel || measurementLabel || null;
    circle.__liaDgsMeasurementLabel = measurementLabel || null;
    applyLineStyle(circle, cfg.lineStyle);
    if (nameLabel || measurementLabel) circle.label = nameLabel || measurementLabel;
    [nameLabel, measurementLabel].forEach(function(label) {
      if (!label) return;
      label.__liaDgsMacroManaged = true;
      label.__liaDgsOwner = circle;
    });
  }

  function createMeasurementLabel(board: any, center: any, radiusPoint: any, cfg: CircleConfig): any {
    if (!cfg.showArea && !cfg.showCircumference) return null;
    const color = getNeutralColor();

    return board.create('text', [
      function() { return Number(center.X()); },
      function() { return Number(center.Y()); },
      function() { return measurementText(cfg, center, radiusPoint); }
    ], {
      fixed: true,
      visible: cfg.visible && mayDisplayDgsValues(cfg.boardId),
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      anchorX: 'middle',
      anchorY: 'middle',
      strokeColor: color,
      fillColor: color,
      fontSize: 14
    });
  }

  window.renderCircleFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseCircleSpec(spec, language);
    const key = entryKey(uid);

    if (!uid || !cfg.boardId || !cfg.centerName) {
      removeEntry(uid);
      return false;
    }

    const board = window.__boards && window.__boards[cfg.boardId];
    const center = getLivePoint(board, cfg.boardId, cfg.centerName);
    const radiusPoint = cfg.radiusPointName
      ? getLivePoint(board, cfg.boardId, cfg.radiusPointName)
      : null;
    if (!board || !center || (cfg.radiusPointName && (!radiusPoint || radiusPoint === center))) {
      removeEntry(uid);
      return false;
    }

    const old = window.__circleEntries[key];
    if (
      old &&
      old.board === board &&
      old.center === center &&
      old.boardId === cfg.boardId &&
      old.centerName === cfg.centerName &&
      old.radiusPoint === radiusPoint &&
      old.radiusPointName === cfg.radiusPointName &&
      old.name === cfg.name &&
      old.showName === cfg.showName &&
      old.radius === cfg.radius &&
      old.language === cfg.language &&
      old.showArea === cfg.showArea &&
      old.showCircumference === cfg.showCircumference &&
      old.circle &&
      (!(cfg.showName && cfg.name) || old.nameLabel) &&
      (!(cfg.showArea || cfg.showCircumference) || old.measurementLabel)
    ) {
      old.color = cfg.color;
      old.opacity = cfg.opacity;
      old.hasExplicitColor = cfg.hasExplicitColor;
      old.visible = cfg.visible;
      old.lineStyle = cfg.lineStyle;
      applyCircleStyle(old.circle, cfg.color, cfg.opacity);
      applyNameStyle(old.nameLabel, cfg.color);
      applyMeasurementTheme(old.measurementLabel);
      applyCircleVisibility(old.circle, old.nameLabel, old.measurementLabel, cfg);
      applyCircleDgsMetadata(
        old.circle,
        old.center,
        old.radiusPoint,
        old.nameLabel,
        old.measurementLabel,
        cfg
      );
      try { board.update(); } catch (e) {}
      return true;
    }

    removeEntry(uid);
    let circle = null;
    let nameLabel = null;
    let measurementLabel = null;

    try {
      circle = board.create('circle', [center, radiusPoint || cfg.radius], {
        name: '',
        withLabel: false,
        fixed: true,
        visible: cfg.visible,
        highlight: false,
        strokeColor: cfg.color,
        highlightStrokeColor: cfg.color,
        strokeWidth: 2.5,
        highlightStrokeWidth: 2.5,
        ...lineStyleAttributes(cfg.lineStyle),
        fillColor: cfg.color,
        highlightFillColor: cfg.color,
        fillOpacity: cfg.opacity,
        highlightFillOpacity: cfg.opacity
      });
      circle.__liaDgsShowName = cfg.showName;
      applyCircleStyle(circle, cfg.color, cfg.opacity);
      nameLabel = createNameLabel(board, center, radiusPoint, cfg);
      measurementLabel = createMeasurementLabel(board, center, radiusPoint, cfg);
      applyCircleDgsMetadata(circle, center, radiusPoint, nameLabel, measurementLabel, cfg);
      applyCircleVisibility(circle, nameLabel, measurementLabel, cfg);

      window.__circleEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        name: cfg.name,
        showName: cfg.showName,
        centerName: cfg.centerName,
        center: center,
        radiusPointName: cfg.radiusPointName,
        radiusPoint: radiusPoint,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        opacity: cfg.opacity,
        radius: cfg.radius,
        language: cfg.language,
        showArea: cfg.showArea,
        showCircumference: cfg.showCircumference,
        visible: cfg.visible,
        lineStyle: cfg.lineStyle,
        board: board,
        circle: circle,
        nameLabel: nameLabel,
        measurementLabel: measurementLabel
      };

      scheduleBootstrap(function() {
        try { board.update(); } catch (e) {}
      });
      try { board.update(); } catch (e) {}
      return true;
    } catch (e) {
      try { if (measurementLabel) board.removeObject(measurementLabel); } catch (removeError) {}
      try { if (nameLabel) board.removeObject(nameLabel); } catch (removeError) {}
      try { if (circle) board.removeObject(circle); } catch (removeError) {}
      return false;
    }
  };

  window.__bootstrapCircles = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="circle-spec-"][data-spec]:not([data-lia-static-claimed])');
    const activeKeys = new Set<string>();
    let pending = false;

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^circle-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'en');
      if (!uid) return;

      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderCircleFromSpec || !window.renderCircleFromSpec(uid, spec, language)) {
        pending = true;
      }
    });

    Object.keys(window.__circleEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingCircles = pending;
  };

  window.__scheduleBootstrapCircles = function(): void {
    if (window.__bootstrapCirclesRAF) return;
    window.__bootstrapCirclesRAF = requestAnimationFrame(function() {
      window.__bootstrapCirclesRAF = 0;
      try { if (window.__bootstrapCircles) window.__bootstrapCircles(); } catch (e) {}
    });
  };

  function containsCircleSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^circle-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="circle-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^circle-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || [])
          .concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsCircleSpec);
      }

      if (needsBootstrap && window.__scheduleBootstrapCircles) {
        window.__scheduleBootstrapCircles();
      }
    });

    const root = document.body || document.documentElement;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-spec', 'data-language']
      });
    }
  } catch (e) {}

  window.__registerLiaThemeListener(function() {
    Object.keys(window.__circleEntries || {}).forEach(function(key) {
      const entry = window.__circleEntries[key];
      if (!entry) return;
      if (!entry.hasExplicitColor) entry.color = getAccentColor();
      applyCircleStyle(entry.circle, entry.color, entry.opacity);
      applyNameStyle(entry.nameLabel, entry.color);
      applyMeasurementTheme(entry.measurementLabel);
      applyCircleVisibility(entry.circle, entry.nameLabel, entry.measurementLabel, entry as CircleConfig);
      try { if (entry.board) entry.board.update(); } catch (e) {}
    });
  });

  window.__circleRetryInterval = setInterval(function() {
    if (hasPendingCircles && window.__scheduleBootstrapCircles) {
      window.__scheduleBootstrapCircles();
    }
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapCircles) window.__scheduleBootstrapCircles();
  });
}
