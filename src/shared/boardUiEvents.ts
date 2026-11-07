const BOARD_UI_SELECTOR = [
  'button', 'input', 'select', 'textarea', 'a', '[role="button"]',
  '.lia-dgs-set-square-overlay', '.lia-dgs-menu-clip', '.lia-dgs-side-menu-clip',
  '.lia-dgs-color-popup', '.lia-dgs-angle-dialog', '.lia-plot-analyze-panel',
  '.lia-plot-color-menu', '.lia-schar-panel', '.lia-dgs-fullscreen-note-bar',
  '.lia-jxg-resize-handle', '.JXG_navigation'
].join(',');

const SLIDER_ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

type RangeKeyboardTarget = HTMLElement & {
  type?: string;
  __liaSliderKeyboardShielded?: boolean;
};

type JsxGraphSlider = {
  Value?: () => number;
  setValue?: (value: number) => void;
  on?: (name: string, callback: () => void) => void;
  rendNode?: HTMLElement | SVGElement;
  baseline?: { on?: (name: string, callback: () => void) => void };
  highline?: { on?: (name: string, callback: () => void) => void };
  __liaDgsSliderMinimum?: number;
  __liaDgsSliderMaximum?: number;
  __liaDgsSliderStep?: number;
  __liaDgsSliderValue?: number;
  __liaDgsSliderName?: string;
  __liaMacroSliderName?: string;
  __liaSliderKeyboardBound?: boolean;
  __liaSliderKeyboardNode?: HTMLElement | SVGElement;
  __liaSliderKeyboardUpdate?: () => void;
  __liaSliderKeyboardSync?: () => void;
};

export function isSliderArrowKey(key: unknown): boolean {
  return SLIDER_ARROW_KEYS.has(String(key || ''));
}

/** Return the next snapped value for a horizontal slider, or null for unrelated keys. */
export function sliderValueFromArrowKey(
  key: unknown,
  currentValue: unknown,
  minimumValue: unknown,
  maximumValue: unknown,
  stepValue: unknown
): number | null {
  if (!isSliderArrowKey(key)) return null;
  const minimum = Number(minimumValue);
  const maximum = Number(maximumValue);
  const step = Number(stepValue);
  const current = Number(currentValue);
  if (![minimum, maximum, step].every(Number.isFinite) || maximum <= minimum || step <= 0) return null;
  const direction = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1;
  const safeCurrent = Number.isFinite(current) ? Math.max(minimum, Math.min(maximum, current)) : minimum;
  const currentStep = Math.round((safeCurrent - minimum) / step);
  const next = Math.max(minimum, Math.min(maximum, minimum + (currentStep + direction) * step));
  const precision = Math.max(
    decimalPlaces(minimum),
    decimalPlaces(maximum),
    decimalPlaces(step)
  );
  return Number(next.toFixed(Math.min(12, precision)));
}

function decimalPlaces(value: number): number {
  const text = String(value).toLowerCase();
  const parts = text.split('e');
  const fraction = (parts[0].split('.')[1] || '').length;
  const exponent = Number(parts[1] || 0);
  return Math.max(0, fraction - exponent);
}

/** Keep native range keyboard behaviour, but do not leak arrow keys to LiaScript navigation. */
export function shieldRangeSliderArrowKeys(input: RangeKeyboardTarget): void {
  if (!input || String(input.type || '').toLowerCase() !== 'range' || input.__liaSliderKeyboardShielded) return;
  input.__liaSliderKeyboardShielded = true;
  const stopArrow = (event: KeyboardEvent): void => {
    if (isSliderArrowKey(event.key)) event.stopPropagation();
  };
  input.addEventListener('keydown', stopArrow);
  input.addEventListener('keyup', stopArrow);
}

/** Make a JSXGraph slider focusable and operate it with the same arrow semantics as a range input. */
export function bindJsxGraphSliderArrowKeys(slider: JsxGraphSlider, onChange: () => void): void {
  if (!slider) return;
  slider.__liaSliderKeyboardUpdate = onChange;

  const sliderValue = (): number => {
    try {
      const value = Number(typeof slider.Value === 'function' ? slider.Value() : slider.__liaDgsSliderValue);
      return Number.isFinite(value) ? value : Number(slider.__liaDgsSliderMinimum);
    } catch (error) {
      return Number(slider.__liaDgsSliderMinimum);
    }
  };
  const syncAccessibility = (): void => {
    const node = slider.__liaSliderKeyboardNode || slider.rendNode;
    if (!node || typeof node.setAttribute !== 'function') return;
    node.setAttribute('aria-valuemin', String(slider.__liaDgsSliderMinimum));
    node.setAttribute('aria-valuemax', String(slider.__liaDgsSliderMaximum));
    node.setAttribute('aria-valuenow', String(sliderValue()));
    node.setAttribute('aria-label', String(slider.__liaDgsSliderName || slider.__liaMacroSliderName || 'Slider'));
  };
  slider.__liaSliderKeyboardSync = syncAccessibility;

  if (slider.__liaSliderKeyboardBound) {
    prepareSliderNode(slider, syncAccessibility);
    syncAccessibility();
    return;
  }
  slider.__liaSliderKeyboardBound = true;

  const activate = (): void => {
    const node = prepareSliderNode(slider, syncAccessibility);
    syncAccessibility();
    try { node?.focus({ preventScroll: true }); } catch (error) {
      try { node?.focus(); } catch (focusError) {}
    }
  };
  try { slider.on?.('down', activate); } catch (error) {}
  try { slider.on?.('drag', syncAccessibility); } catch (error) {}
  try { slider.on?.('up', syncAccessibility); } catch (error) {}
  [slider.baseline, slider.highline].forEach((part) => {
    try { part?.on?.('down', activate); } catch (error) {}
  });
  prepareSliderNode(slider, syncAccessibility);
  syncAccessibility();
}

function prepareSliderNode(
  slider: JsxGraphSlider,
  syncAccessibility: () => void
): (HTMLElement | SVGElement) | null {
  const node = slider.rendNode;
  if (!node || typeof node.addEventListener !== 'function') return null;
  if (slider.__liaSliderKeyboardNode === node) return node;
  slider.__liaSliderKeyboardNode = node;
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'slider');
  node.setAttribute('aria-orientation', 'horizontal');
  node.addEventListener('keydown', (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    const next = sliderValueFromArrowKey(
      keyboardEvent.key,
      typeof slider.Value === 'function' ? slider.Value() : slider.__liaDgsSliderValue,
      slider.__liaDgsSliderMinimum,
      slider.__liaDgsSliderMaximum,
      slider.__liaDgsSliderStep
    );
    if (next == null) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    try {
      if (typeof slider.setValue === 'function') slider.setValue(next);
      slider.__liaDgsSliderValue = next;
      syncAccessibility();
      slider.__liaSliderKeyboardUpdate?.();
    } catch (error) {}
  });
  node.addEventListener('keyup', (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (isSliderArrowKey(keyboardEvent.key)) keyboardEvent.stopPropagation();
  });
  return node;
}

/** Capture handlers must inspect the original targets across a ShadowRoot boundary. */
export function eventTargetsBoardUi(evt: Event): boolean {
  const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [evt.target];
  return path.some((node) => {
    const element = node as Element;
    return !!element && typeof element.closest === 'function' && !!element.closest(BOARD_UI_SELECTOR);
  });
}
