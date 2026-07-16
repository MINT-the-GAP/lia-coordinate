/**
 * Returns whether value/measurement labels may be rendered for a board.
 *
 * DGS installs the optional window hook when an imported construction carries
 * a value-display restriction. Standalone macros must keep their historical
 * behaviour, so a missing or failing hook always permits the display.
 */
export function mayDisplayDgsValues(boardId: unknown): boolean {
  const checker = (window as any).__dgsMayDisplayValuesForBoard;
  if (typeof checker !== 'function') return true;

  try {
    return checker(String(boardId == null ? '' : boardId)) !== false;
  } catch (e) {
    return true;
  }
}
