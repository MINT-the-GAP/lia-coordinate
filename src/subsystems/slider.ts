// Slider subsystem (@Slider / @Regler macros).
// Creates JSXGraph parameter sliders that can be used as scalar variables by
// function expressions and DGS-dependent objects.

import { CoordinatePair, parseCoordinateList, splitTopLevel, unquote } from '../shared/parser';
import { initThemeSync } from '../shared/theme';
import { scheduleBootstrap } from '../shared/bootstrap';

interface SliderConfig {
  boardId: string;
  name: string;
  minimum: number;
  maximum: number;
  step: number;
  value: number;
  color: string;
  hasExplicitColor: boolean;
  position: CoordinatePair[] | null;
  lockPosition: boolean;
  showObject: boolean;
  fontSize: number;
  language: 'de' | 'en';
}

const RESERVED_PARAMETER_NAMES = new Set([
  'x', 'y', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'sqrt', 'exp', 'ln', 'log', 'abs', 'floor', 'ceil', 'round',
  'min', 'max', 'pow'
]);

export function init(): void {
  if (window.__sliderReady) {
    try { if (window.__scheduleBootstrapSliders) window.__scheduleBootstrapSliders(); } catch (e) {}
    return;
  }

  window.__sliderReady = true;
  window.__sliderEntries = window.__sliderEntries || {};
  initThemeSync();

  let hasPendingSliders = false;

  function normalizeParameterName(value: unknown): string {
    const name = String(value == null ? '' : value).trim().toLowerCase();
    return /^[a-z][a-z0-9]*$/.test(name) && !RESERVED_PARAMETER_NAMES.has(name) ? name : '';
  }

  function parseNumber(value: unknown): number {
    return Number(String(value == null ? '' : value).trim().replace(',', '.'));
  }

  function normalizeSliderSettings(
    minimumValue: unknown,
    maximumValue: unknown,
    stepValue: unknown,
    currentValue: unknown
  ): { minimum: number; maximum: number; step: number; value: number } | null {
    const minimum = parseNumber(minimumValue);
    const maximum = parseNumber(maximumValue);
    const step = parseNumber(stepValue);
    const inputValue = parseNumber(currentValue);
    if (![minimum, maximum, step, inputValue].every(Number.isFinite) || maximum <= minimum || step <= 0) return null;
    const clamped = Math.max(minimum, Math.min(maximum, inputValue));
    const snapped = minimum + Math.round((clamped - minimum) / step) * step;
    const precision = Math.max(0, Math.min(12, String(step).split('.')[1]?.length || 0));
    return {
      minimum,
      maximum,
      step,
      value: Number(Math.max(minimum, Math.min(maximum, snapped)).toFixed(precision))
    };
  }

  function isOption(value: string): boolean {
    return /^(?:lockposition|positionlocked|lock|fix|fixed|visible|show|anzeigen|fontsize|font-size|schriftgroesse|schriftgröße|position)\s*=/i.test(value) ||
      /^(?:lockposition|positionlocked|lock|fix|fixed)$/i.test(value);
  }

  function parsePositionOption(value: string): CoordinatePair[] | null {
    let raw = String(value || '').trim();
    const match = raw.match(/^position\s*=\s*(.+)$/i);
    if (match) raw = String(match[1] || '').trim();
    const coordinates = parseCoordinateList(raw);
    return coordinates && coordinates.length >= 2 ? coordinates.slice(0, 2) : null;
  }

  function parseSliderSpec(spec: string, language?: string): SliderConfig {
    const parts = splitTopLevel(unquote(String(spec || '')), ';')
      .map(function(part) { return unquote(part).trim(); });
    const settings = normalizeSliderSettings(parts[2], parts[3], parts[4], parts[5]) || {
      minimum: -5,
      maximum: 5,
      step: 0.1,
      value: 1
    };

    let color = '#ff00ff';
    let hasExplicitColor = false;
    let optionStart = 6;
    const colorCandidate = String(parts[6] || '').trim();
    if (colorCandidate && !parsePositionOption(colorCandidate) && !isOption(colorCandidate)) {
      color = colorCandidate;
      hasExplicitColor = true;
      optionStart = 7;
    }

    let position: CoordinatePair[] | null = null;
    let lockPosition = false;
    let showObject = true;
    let fontSize = 18;
    parts.slice(optionStart).forEach(function(option) {
      const raw = String(option || '').trim();
      if (!raw) return;
      const parsedPosition = parsePositionOption(raw);
      if (parsedPosition) {
        position = parsedPosition;
        return;
      }
      if (/^(?:lockposition|positionlocked|lock|fix|fixed)(?:\s*=\s*1)?$/i.test(raw)) {
        lockPosition = true;
        return;
      }
      if (/^(?:lockposition|positionlocked|lock|fix|fixed)\s*=\s*0$/i.test(raw)) {
        lockPosition = false;
        return;
      }
      const visibleMatch = raw.match(/^(?:visible|show|anzeigen)\s*=\s*(.+)$/i);
      if (visibleMatch) {
        showObject = !/^(?:0|false|nein|no)$/i.test(String(visibleMatch[1] || '').trim());
        return;
      }
      const fontMatch = raw.match(/^(?:fontsize|font-size|schriftgroesse|schriftgröße)\s*=\s*(.+)$/i);
      if (fontMatch) {
        const parsed = parseNumber(fontMatch[1]);
        if (Number.isFinite(parsed)) fontSize = Math.max(8, Math.min(96, parsed));
      }
    });

    return {
      boardId: String(parts[0] || '').trim(),
      name: normalizeParameterName(parts[1] || 'a'),
      minimum: settings.minimum,
      maximum: settings.maximum,
      step: settings.step,
      value: settings.value,
      color,
      hasExplicitColor,
      position,
      lockPosition,
      showObject,
      fontSize,
      language: String(language || '').trim().toLowerCase() === 'en' ? 'en' : 'de'
    };
  }

  function entryKey(uid: string): string {
    return 'slider-' + String(uid || '');
  }

  function getBoardObjects(board: any): any[] {
    const seen = new Set<any>();
    const objects: any[] = [];
    const add = function(object: any) {
      if (!object || seen.has(object)) return;
      seen.add(object);
      objects.push(object);
    };
    try { if (Array.isArray(board && board.objectsList)) board.objectsList.forEach(add); } catch (e) {}
    try {
      if (board && board.objects && typeof board.objects === 'object') {
        Object.keys(board.objects).forEach(function(key) { add(board.objects[key]); });
      }
    } catch (e) {}
    return objects;
  }

  function isSliderObject(object: any): boolean {
    return !!object && (!!object.__liaDgsSlider || !!object.__liaMacroSlider);
  }

  function getSliderValue(slider: any): number {
    if (!slider || slider.__liaDgsSliderDeleted) return NaN;
    try {
      const value = Number(typeof slider.Value === 'function' ? slider.Value() : slider.__liaDgsSliderValue);
      return Number.isFinite(value) ? value : NaN;
    } catch (e) {
      return NaN;
    }
  }

  function sliderNameAvailable(board: any, nameValue: unknown, excludeObject?: any): boolean {
    const name = normalizeParameterName(nameValue);
    if (!name) return false;
    return !getBoardObjects(board).some(function(object) {
      if (!object || object === excludeObject) return false;
      if (isSliderObject(object)) return normalizeParameterName(object.__liaDgsSliderName || object.__liaMacroSliderName) === name;
      if (object.__liaDgsFunction) return normalizeParameterName(object.__liaDgsFunctionName || object.name || '') === name;
      if (object.__liaPlotFunctionName) return normalizeParameterName(object.__liaPlotFunctionName || object.name || '') === name;
      return false;
    });
  }

  function autoSliderPosition(board: any): CoordinatePair[] {
    let bbox = [-5, 5, 5, -5];
    try {
      const current = board.getBoundingBox();
      if (Array.isArray(current) && current.length === 4 && current.every(Number.isFinite)) bbox = current;
    } catch (e) {}
    const unitX = Math.max(1e-9, Math.abs(Number(board && board.unitX) || 1));
    const unitY = Math.max(1e-9, Math.abs(Number(board && board.unitY) || 1));
    const count = getBoardObjects(board).filter(isSliderObject).length;
    const leftInset = 34 / unitX;
    const topInset = 34 / unitY;
    const rowOffset = (count % 8) * 42 / unitY;
    const columnOffset = Math.floor(count / 8) * 190 / unitX;
    const x1 = bbox[0] + leftInset + columnOffset;
    const x2 = Math.min(bbox[2] - 34 / unitX, x1 + 145 / unitX);
    const y = bbox[1] - topInset - rowOffset;
    return [{ x: x1, y }, { x: Math.max(x1 + 50 / unitX, x2), y }];
  }

  function currentSliderPosition(slider: any): CoordinatePair[] | null {
    try {
      if (!slider || !slider.point1 || !slider.point2) return null;
      const first = { x: Number(slider.point1.X()), y: Number(slider.point1.Y()) };
      const second = { x: Number(slider.point2.X()), y: Number(slider.point2.Y()) };
      return [first.x, first.y, second.x, second.y].every(Number.isFinite) ? [first, second] : null;
    } catch (e) {
      return null;
    }
  }

  function sliderNameToTex(nameValue: unknown): string {
    const name = normalizeParameterName(nameValue);
    if (!name) return '';
    const greek = new Set([
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
      'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
      'upsilon', 'phi', 'chi', 'psi', 'omega'
    ]);
    const match = name.match(/^([a-z]+)(\d+)?$/);
    if (!match) return name;
    const base = greek.has(match[1]) ? '\\' + match[1] : (match[1].length === 1 ? match[1] : '\\mathit{' + match[1] + '}');
    return match[2] ? base + '_{' + match[2] + '}' : base;
  }

  function formatNumber(value: number, language: 'de' | 'en'): string {
    if (!Number.isFinite(value)) return '?';
    const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round((value + Number.EPSILON) * 1000) / 1000;
    let text = String(rounded);
    if (language === 'de') text = text.replace('.', '{,}');
    return text;
  }

  function sliderLabelText(slider: any): string {
    const name = sliderNameToTex(slider && (slider.__liaDgsSliderName || slider.__liaMacroSliderName));
    if (!name || slider.__liaDgsShowName === false) return '';
    return '\\(' + name + ' = ' + formatNumber(getSliderValue(slider), slider.__liaDgsLanguage || 'de') + '\\)';
  }

  function applySliderVisual(slider: any, cfg: SliderConfig): void {
    if (!slider) return;
    const visible = cfg.showObject !== false;
    try {
      slider.setAttribute({
        name: cfg.name,
        visible,
        strokeColor: cfg.color,
        fillColor: cfg.color,
        highlightStrokeColor: cfg.color,
        highlightFillColor: cfg.color,
        label: {
          strokeColor: cfg.color,
          fillColor: cfg.color,
          highlightStrokeColor: cfg.color,
          highlightFillColor: cfg.color,
          useMathJax: true,
          parse: false,
          fontSize: cfg.fontSize
        }
      });
    } catch (e) {}
    [slider.baseline, slider.highline, slider.point1, slider.point2].forEach(function(part: any) {
      try {
        if (!part || typeof part.setAttribute !== 'function') return;
        part.setAttribute({
          visible,
          strokeColor: cfg.color,
          fillColor: cfg.color,
          highlightStrokeColor: cfg.color,
          highlightFillColor: cfg.color,
          fixed: cfg.lockPosition
        });
      } catch (e) {}
    });
    try {
      if (slider.label && typeof slider.label.setText === 'function') {
        slider.label.setText(function() { return sliderLabelText(slider); });
      }
      if (slider.label && typeof slider.label.setAttribute === 'function') {
        slider.label.setAttribute({
          visible,
          strokeColor: cfg.color,
          fillColor: cfg.color,
          fontSize: cfg.fontSize,
          parse: false,
          useMathJax: true
        });
      }
    } catch (e) {}
  }

  function scheduleDependents(boardId: string, board: any): void {
    try { if (window.__bootstrapPlotFunctions) window.__bootstrapPlotFunctions(); } catch (e) {}
    try { if (window.__scheduleFunctionAnalysisPointsForBoard) window.__scheduleFunctionAnalysisPointsForBoard(boardId); } catch (e) {}
    try { if (window.__scheduleObjectAnalysisPointsForBoard) window.__scheduleObjectAnalysisPointsForBoard(boardId); } catch (e) {}
    try { if (board && typeof board.update === 'function') board.update(); } catch (e) {}
  }

  function removeEntryByKey(key: string): void {
    const entry = window.__sliderEntries[key];
    if (!entry) return;
    const slider = entry.slider;
    if (slider) slider.__liaDgsSliderDeleted = true;
    [slider && slider.label, slider && slider.highline, slider && slider.baseline,
      slider && slider.point1, slider && slider.point2, slider].forEach(function(part: any) {
      try { if (part && entry.board) entry.board.removeObject(part); } catch (e) {}
    });
    delete window.__sliderEntries[key];
    scheduleDependents(String(entry.boardId || ''), entry.board);
  }

  function removeEntry(uid: string): void {
    removeEntryByKey(entryKey(uid));
  }

  window.__getCoordSliderBindings = function(boardId?: string, excludeObject?: any): Record<string, () => number> {
    const bindings: Record<string, () => number> = {};
    const addSlider = function(slider: any, sliderBoardId?: string) {
      if (!slider || slider === excludeObject || slider.__liaDgsSliderDeleted) return;
      if (boardId && sliderBoardId && sliderBoardId !== boardId) return;
      if (boardId && !sliderBoardId) {
        const board = window.__boards && window.__boards[boardId];
        if (board && slider.board !== board) return;
      }
      const name = normalizeParameterName(slider.__liaDgsSliderName || slider.__liaMacroSliderName || slider.name || '');
      if (!name || bindings[name]) return;
      bindings[name] = function() { return getSliderValue(slider); };
    };
    Object.keys(window.__sliderEntries || {}).forEach(function(key) {
      const entry = window.__sliderEntries[key];
      addSlider(entry && entry.slider, entry && entry.boardId);
    });
    if (boardId && window.__boards && window.__boards[boardId]) {
      getBoardObjects(window.__boards[boardId]).forEach(function(object) {
        if (isSliderObject(object)) addSlider(object, boardId);
      });
    }
    return bindings;
  };

  window.renderSliderFromSpec = function(uid: string, spec: string, language?: string): boolean {
    const cfg = parseSliderSpec(spec, language);
    const key = entryKey(uid);
    if (!uid || !cfg.boardId || !cfg.name) {
      removeEntry(uid);
      return false;
    }
    const board = window.__boards && window.__boards[cfg.boardId];
    if (!board) {
      removeEntry(uid);
      return false;
    }
    const old = window.__sliderEntries[key];
    if (!sliderNameAvailable(board, cfg.name, old && old.slider)) {
      removeEntry(uid);
      return false;
    }
    const oldPosition = old && old.slider ? currentSliderPosition(old.slider) : null;
    if (old && old.board === board && old.name === cfg.name && old.minimum === cfg.minimum &&
        old.maximum === cfg.maximum && old.step === cfg.step && old.color === cfg.color &&
        old.lockPosition === cfg.lockPosition && old.showObject === cfg.showObject &&
        old.fontSize === cfg.fontSize && old.language === cfg.language &&
        JSON.stringify(old.position || null) === JSON.stringify(cfg.position || null)) {
      try {
        if (typeof old.slider.setValue === 'function') old.slider.setValue(cfg.value);
        old.slider.__liaDgsSliderValue = cfg.value;
      } catch (e) {}
      applySliderVisual(old.slider, cfg);
      scheduleDependents(cfg.boardId, board);
      return true;
    }

    removeEntry(uid);
    const position = cfg.position || oldPosition || autoSliderPosition(board);
    let slider: any = null;
    try {
      slider = board.create('slider', [
        [position[0].x, position[0].y],
        [position[1].x, position[1].y],
        [cfg.minimum, cfg.value, cfg.maximum]
      ], {
        name: cfg.name,
        withLabel: true,
        unitLabel: '',
        snapWidth: cfg.step,
        precision: Math.max(2, Math.min(10, (String(cfg.step).split('.')[1]?.length || 0) + 1)),
        size: 5,
        strokeWidth: 2,
        strokeColor: cfg.color,
        fillColor: cfg.color,
        highlightStrokeColor: cfg.color,
        highlightFillColor: cfg.color,
        baseline: { strokeColor: cfg.color, highlightStrokeColor: cfg.color, fixed: cfg.lockPosition, needsRegularUpdate: true },
        highline: { strokeColor: cfg.color, highlightStrokeColor: cfg.color },
        point1: { strokeColor: cfg.color, fillColor: cfg.color, fixed: cfg.lockPosition },
        point2: { strokeColor: cfg.color, fillColor: cfg.color, fixed: cfg.lockPosition },
        label: { strokeColor: cfg.color, fillColor: cfg.color, useMathJax: true, parse: false, fontSize: cfg.fontSize },
        fixed: false,
        frozen: false,
        visible: cfg.showObject
      });
      slider.__liaMacroSlider = true;
      slider.__liaMacroSliderName = cfg.name;
      slider.__liaDgsSlider = true;
      slider.__liaDgsSliderName = cfg.name;
      slider.__liaDgsSliderMinimum = cfg.minimum;
      slider.__liaDgsSliderMaximum = cfg.maximum;
      slider.__liaDgsSliderStep = cfg.step;
      slider.__liaDgsSliderValue = cfg.value;
      slider.__liaDgsSliderPositionLocked = cfg.lockPosition;
      slider.__liaDgsShowName = true;
      slider.__liaDgsShowObject = cfg.showObject;
      slider.__liaDgsOpacity = cfg.showObject ? 1 : 0;
      slider.__liaDgsFormatFontSize = cfg.fontSize;
      slider.__liaDgsSliderFontSize = cfg.fontSize;
      slider.__liaDgsTextColor = cfg.color;
      slider.__liaDgsLineColor = cfg.color;
      slider.__liaDgsFillColor = cfg.color;
      slider.__liaDgsLanguage = cfg.language;
      [slider.baseline, slider.highline, slider.point1, slider.point2].forEach(function(part: any) {
        if (part) part.__liaDgsSliderOwner = slider;
      });
      const update = function() {
        slider.__liaDgsSliderValue = getSliderValue(slider);
        applySliderVisual(slider, cfg);
        scheduleDependents(cfg.boardId, board);
      };
      try { slider.on('drag', update); } catch (e) {}
      try { slider.on('up', update); } catch (e) {}
      [slider.point1, slider.point2, slider.baseline].forEach(function(part: any) {
        try { if (part && typeof part.on === 'function') part.on('drag', update); } catch (e) {}
        try { if (part && typeof part.on === 'function') part.on('up', update); } catch (e) {}
      });
      applySliderVisual(slider, cfg);
      window.__sliderEntries[key] = {
        uid: String(uid),
        boardId: cfg.boardId,
        name: cfg.name,
        minimum: cfg.minimum,
        maximum: cfg.maximum,
        step: cfg.step,
        value: cfg.value,
        color: cfg.color,
        hasExplicitColor: cfg.hasExplicitColor,
        position: cfg.position ? cfg.position.map(function(point) { return { x: point.x, y: point.y }; }) : null,
        lockPosition: cfg.lockPosition,
        showObject: cfg.showObject,
        fontSize: cfg.fontSize,
        language: cfg.language,
        board,
        slider
      };
      scheduleDependents(cfg.boardId, board);
      return true;
    } catch (e) {
      try { if (slider) board.removeObject(slider); } catch (removeError) {}
      return false;
    }
  };

  window.__bootstrapSliders = function(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="slider-spec-"][data-spec]');
    const activeKeys = new Set<string>();
    let pending = false;
    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^slider-spec-/, '');
      const spec = String(node.dataset.spec || '');
      const language = String(node.dataset.language || 'de');
      if (!uid) return;
      activeKeys.add(entryKey(uid));
      if (!spec || !window.renderSliderFromSpec || !window.renderSliderFromSpec(uid, spec, language)) pending = true;
    });
    Object.keys(window.__sliderEntries || {}).forEach(function(key) {
      if (!activeKeys.has(key)) removeEntryByKey(key);
    });
    hasPendingSliders = pending;
  };

  window.__scheduleBootstrapSliders = function(): void {
    if (window.__bootstrapSlidersRAF) return;
    window.__bootstrapSlidersRAF = requestAnimationFrame(function() {
      window.__bootstrapSlidersRAF = 0;
      try { if (window.__bootstrapSliders) window.__bootstrapSliders(); } catch (e) {}
    });
  };

  function containsSliderSpec(node: Node): boolean {
    const element = node as HTMLElement;
    if (!element || element.nodeType !== 1) return false;
    if (element.id && /^slider-spec-/.test(element.id)) return true;
    return !!(element.querySelector && element.querySelector('[id^="slider-spec-"][data-spec]'));
  }

  try {
    const observer = new MutationObserver(function(mutations) {
      let needsBootstrap = false;
      for (let i = 0; i < mutations.length && !needsBootstrap; i++) {
        const mutation = mutations[i];
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          needsBootstrap = !!(target && target.id && /^slider-spec-/.test(target.id));
          continue;
        }
        if (mutation.type !== 'childList') continue;
        const changedNodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        needsBootstrap = changedNodes.some(containsSliderSpec);
      }
      if (needsBootstrap && window.__scheduleBootstrapSliders) window.__scheduleBootstrapSliders();
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-spec', 'data-language'] });
  } catch (e) {}

  window.__sliderRetryInterval = setInterval(function() {
    if (hasPendingSliders && window.__scheduleBootstrapSliders) window.__scheduleBootstrapSliders();
  }, 300);

  scheduleBootstrap(function() {
    if (window.__scheduleBootstrapSliders) window.__scheduleBootstrapSliders();
  });

  try {
    if (window.__bootstrapSliders) window.__bootstrapSliders();
  } catch (e) {}
}
