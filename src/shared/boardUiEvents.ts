const BOARD_UI_SELECTOR = [
  'button', 'input', 'select', 'textarea', 'a', '[role="button"]',
  '.lia-dgs-set-square-overlay', '.lia-dgs-menu-clip', '.lia-dgs-side-menu-clip',
  '.lia-dgs-color-popup', '.lia-dgs-angle-dialog', '.lia-plot-analyze-panel',
  '.lia-plot-color-menu', '.lia-schar-panel', '.lia-jxg-resize-handle', '.JXG_navigation'
].join(',');

/** Capture handlers must inspect the original targets across a ShadowRoot boundary. */
export function eventTargetsBoardUi(evt: Event): boolean {
  const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [evt.target];
  return path.some((node) => {
    const element = node as Element;
    return !!element && typeof element.closest === 'function' && !!element.closest(BOARD_UI_SELECTOR);
  });
}
