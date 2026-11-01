// Read-only polygon candidates from closed chains of learner-created segments.
// These adapters never create JSXGraph objects or change the learner's drawing.
import { getBoardObjects } from './boardObjects';
import {
  GEOMETRY_EPSILON,
  analyzePolygonGeometry,
  type PolygonCoordinate,
} from './polygonGeometry';

export type ConstructionEdge = {
  start: PolygonCoordinate;
  end: PolygonCoordinate;
};

type DirectedEdge = ConstructionEdge & { index: number; segment: any };

function readPoint(point: any): PolygonCoordinate | null {
  try {
    const x = Number(point.X());
    const y = Number(point.Y());
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch (e) {
    return null;
  }
}

export function* segmentConstructionCandidates(
  board: any,
  corners: number,
  endpointTolerance: number
): Generator<any> {
  if (!board || !Number.isInteger(corners) || corners < 3 ||
      !Number.isFinite(endpointTolerance) || endpointTolerance < 0) return;
  const edges: DirectedEdge[] = [];
  for (const segment of getBoardObjects(board)) {
    if (segment.board !== board || segment.__liaDgsSegment !== true ||
        segment.elType !== 'segment' || segment.__liaDgsPolygonBorder ||
        segment.__liaDgsMacroManaged || segment.__liaDgsMacroKey) continue;
    const start = readPoint(segment.point1);
    const end = readPoint(segment.point2);
    if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) <= GEOMETRY_EPSILON) continue;
    edges.push({ start, end, segment, index: edges.length });
  }
  if (edges.length < corners) return;
  const touches = (a: PolygonCoordinate, b: PolygonCoordinate): boolean => {
    const slack = Math.max(GEOMETRY_EPSILON, Number.EPSILON * 4 *
      Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y)));
    return Math.hypot(a.x - b.x, a.y - b.y) <= endpointTolerance + slack;
  };
  const directed = edges.flatMap(edge => [edge, { ...edge, start: edge.end, end: edge.start }]);
  const neighbors = new Map<DirectedEdge, DirectedEdge[]>();
  for (const edge of directed) {
    neighbors.set(edge, directed.filter(next => next.index !== edge.index && touches(edge.end, next.start)));
  }
  const path: DirectedEdge[] = [];
  const used = new Set<number>();
  function* visit(edge: DirectedEdge): Generator<any> {
    path.push(edge);
    used.add(edge.index);
    try {
      if (path.length === corners) {
        // Start with the lowest segment index and emit only one direction.
        if (!touches(edge.end, path[0].start) || path[1].index > edge.index) return;
        const coordinates = path.map((current, index) => {
          const previous = path[(index + path.length - 1) % path.length];
          return {
            x: current.start.x + (previous.end.x - current.start.x) / 2,
            y: current.start.y + (previous.end.y - current.start.y) / 2,
          };
        });
        if (!analyzePolygonGeometry(coordinates).valid) return;
        // Joining nearby endpoints must not manufacture a corner between
        // collinear drawn segments.
        if (path.some((current, index) => {
          const next = path[(index + 1) % path.length];
          const dx = current.end.x - current.start.x;
          const dy = current.end.y - current.start.y;
          const nextX = next.end.x - next.start.x;
          const nextY = next.end.y - next.start.y;
          return Math.abs(dx * nextY - dy * nextX) <=
            GEOMETRY_EPSILON * Math.hypot(dx, dy) * Math.hypot(nextX, nextY);
        })) return;
        yield {
          board,
          __liaDgsPolygon: true,
          vertices: coordinates.map(point => ({ X: () => point.x, Y: () => point.y })),
          // Retain the actual drawn edges for length and angle measurements.
          __liaDgsConstructionEdges: path.map(({ start, end }) => ({ start, end })),
          segments: path.map(entry => entry.segment),
        };
        return;
      }
      for (const next of neighbors.get(edge) || []) {
        if (next.index <= path[0].index || used.has(next.index)) continue;
        yield* visit(next);
      }
    } finally {
      used.delete(edge.index);
      path.pop();
    }
  }
  for (const edge of directed) yield* visit(edge);
}
