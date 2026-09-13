import { setStyleIfChanged } from './domUpdates';

const PANEL_SELECTOR = '.lia-schar-panel, .lia-plot-analyze-panel';
const CONTROL_SELECTOR = '.lia-dgs-menu-button, .lia-plot-undo-btn, .lia-plot-redo-btn';
const WATCH_SELECTOR = PANEL_SELECTOR + ', ' + CONTROL_SELECTOR + ', .lia-dgs-top-menu, .lia-schar-overlay-host';
const PANEL_GAP = 10;

type LayoutObserver = { references: number; refresh: () => void; dispose: () => void };
const observers = new WeakMap<HTMLElement, LayoutObserver>();

/** DOMRects include ancestor transforms; absolute CSS offsets do not. */
function boardScaleY(container: HTMLElement): number {
  const height = Number(container.offsetHeight);
  const rendered = Number(container.getBoundingClientRect().height);
  return height > 0 && rendered > 0 ? rendered / height : 1;
}

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden) return false;
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse');
}

/** Reserve the actual permanent top-left menu/history group in the board root. */
export function boardPanelsStartTop(container: HTMLElement): number {
  const scaleY = boardScaleY(container);
  const boardTop = container.getBoundingClientRect().top;
  const borderTop = Number(container.clientTop) || 0;
  const scrollTop = Number(container.scrollTop) || 0;
  let bottom = 0;
  for (const control of Array.from(container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))) {
    // Legacy regression alone places history at the bottom, outside this top stack.
    if (control.style.top === 'auto' && control.style.bottom && control.style.bottom !== 'auto') continue;
    if (!isVisible(control)) continue;
    bottom = Math.max(bottom, (control.getBoundingClientRect().bottom - boardTop) / scaleY - borderTop + scrollTop);
  }
  return Math.ceil(bottom) + PANEL_GAP;
}

/** Schar and regression share one stack, including minimized and scaled panels. */
export function relayoutBoardPanels(container: HTMLElement): void {
  const scaleY = boardScaleY(container);
  const panels = Array.from(container.querySelectorAll<HTMLElement>(PANEL_SELECTOR));
  panels.sort((a, b) => Number(b.classList.contains('lia-schar-panel')) - Number(a.classList.contains('lia-schar-panel')));
  let top = boardPanelsStartTop(container);
  for (const panel of panels) {
    if (!isVisible(panel)) continue;
    if (panel.classList.contains('lia-schar-panel') && container.clientWidth > 0) {
      const scaleMatch = String(panel.style.transform || '').match(/scale\(\s*([\d.]+)/);
      const panelScale = scaleMatch ? Number(scaleMatch[1]) || 1 : 1;
      setStyleIfChanged(panel, 'maxWidth', Math.max(0, (container.clientWidth - 20) / panelScale) + 'px');
    }
    setStyleIfChanged(panel, 'left', '10px');
    setStyleIfChanged(panel, 'top', top + 'px');
    top += Math.ceil(panel.getBoundingClientRect().height / scaleY) + PANEL_GAP;
  }
  observers.get(container)?.refresh();
}

/** One observer per board, shared and released by its panel-owning subsystems. */
export function observeBoardPanelLayout(container: HTMLElement): () => void {
  let state = observers.get(container);
  if (!state) {
    const view = container.ownerDocument.defaultView;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null || !view) return;
      frame = view.requestAnimationFrame(() => {
        frame = null;
        if (container.isConnected) relayoutBoardPanels(container);
      });
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const observed = new Set<Element>();
    const refresh = () => {
      const current = new Set<Element>([container, ...Array.from(container.querySelectorAll(WATCH_SELECTOR))]);
      for (const element of observed) {
        if (!current.has(element)) { resize?.unobserve(element); observed.delete(element); }
      }
      for (const element of current) {
        if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
      }
    };
    const containsLayoutElement = (node: Node): boolean => {
      const element = node as Element;
      return typeof element.matches === 'function' &&
        (element.matches(WATCH_SELECTOR) || !!element.querySelector(WATCH_SELECTOR));
    };
    const mutations = typeof MutationObserver === 'function' ? new MutationObserver((records) => {
      if (records.some((record) => record.type === 'attributes'
        ? record.target === container || (record.target as Element).matches(WATCH_SELECTOR)
        : [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(containsLayoutElement))) schedule();
    }) : null;
    mutations?.observe(container, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'data-open']
    });
    const doc = container.ownerDocument;
    view?.addEventListener('resize', schedule);
    doc.addEventListener('fullscreenchange', schedule);
    doc.addEventListener('webkitfullscreenchange', schedule);
    container.addEventListener('fullscreenchange', schedule);
    container.addEventListener('transitionend', schedule);
    state = {
      references: 0,
      refresh,
      dispose: () => {
        if (frame !== null) view?.cancelAnimationFrame(frame);
        resize?.disconnect();
        mutations?.disconnect();
        view?.removeEventListener('resize', schedule);
        doc.removeEventListener('fullscreenchange', schedule);
        doc.removeEventListener('webkitfullscreenchange', schedule);
        container.removeEventListener('fullscreenchange', schedule);
        container.removeEventListener('transitionend', schedule);
      }
    };
    observers.set(container, state);
    refresh();
    schedule();
  }
  state.references += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state!.references > 0) return;
    state!.dispose();
    observers.delete(container);
  };
}
