// Shared JSXGraph board/point helpers used by all subsystems.

import { CoordinatePair } from './parser';

/**
 * Look up a live JSXGraph point by name, verifying it still belongs to the
 * given board and exposes coordinate accessors.
 */
export function getLivePoint(board: any, boardId: string, pointName: string): any {
  const point = window.__points &&
    window.__points[boardId] &&
    window.__points[boardId][pointName];

  if (!board || !point) return null;

  try {
    if (point.board !== board) return null;
    if (typeof point.X !== 'function' || typeof point.Y !== 'function') return null;
  } catch (e) {
    return null;
  }

  return point;
}

/** Create an invisible, fixed helper point at the given coordinate. */
export function createHiddenPoint(board: any, coordinate: CoordinatePair): any {
  return board.create('point', [coordinate.x, coordinate.y], {
    name: '',
    withLabel: false,
    visible: false,
    fixed: true,
    frozen: true,
    highlight: false,
    showInfobox: false,
    size: 0
  });
}

/** Collect all live objects registered on a board, deduplicated. */
export function getBoardObjects(board: any): any[] {
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

/** Compare two coordinate lists for equality within floating-point tolerance. */
export function sameCoordinates(a: CoordinatePair[] | null, b: CoordinatePair[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every(function(point, index) {
    return Math.abs(point.x - b[index].x) < 1e-12 &&
      Math.abs(point.y - b[index].y) < 1e-12;
  });
}
