import type { Vector3 } from './vector3d';
import { polygonFromPoints3D } from './polygon3d';
import {
  parallelepipedFromPointVectors3D, prismFromBaseVector3D,
  pyramidFromBaseApex3D, tetrahedronFromPoints3D, type Polyhedron3
} from './solid3d';

export type RegularSolid3DKind = 'tetrahedron' | 'pyramid' | 'prism' | 'parallelepiped' | 'cuboid';

/** Minimal independent sources for the existing editable construction tools. */
export interface RegularSolid3DRecipe {
  kind: RegularSolid3DKind;
  points: Vector3[];
  pointIndices: number[];
  baseIndices: number[];
  vectorIndices: Array<[number, number]>;
  solid: Polyhedron3;
}

/**
 * Draw a proportionate body above a horizontal base with its first vertex at anchor.
 * edgeLength is the common edge length, including the square pyramid's sides,
 * the triangular prism's height, and the oblique rhombohedron's three edges.
 */
export function createRegularSolid3DRecipe(
  kind: RegularSolid3DKind,
  anchor: Vector3,
  edgeLength: number
): RegularSolid3DRecipe | null {
  if (!Array.isArray(anchor) || anchor.length !== 3 || !anchor.every(Number.isFinite) ||
      !Number.isFinite(edgeLength) || edgeLength <= 0) return null;

  const sqrt3 = Math.sqrt(3);
  let local: Vector3[];
  let pointIndices: number[] = [];
  let baseIndices: number[] = [];
  let vectorIndices: Array<[number, number]> = [];
  switch (kind) {
    case 'tetrahedron':
      local = [
        [-0.5, -sqrt3 / 6, 0], [0.5, -sqrt3 / 6, 0], [0, sqrt3 / 3, 0],
        [0, 0, Math.sqrt(2 / 3)]
      ];
      pointIndices = [0, 1, 2, 3];
      break;
    case 'pyramid':
      local = [
        [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0],
        [0, 0, Math.SQRT1_2]
      ];
      pointIndices = [4];
      baseIndices = [0, 1, 2, 3];
      break;
    case 'prism':
      local = [
        [-0.5, -sqrt3 / 6, 0], [0.5, -sqrt3 / 6, 0], [0, sqrt3 / 3, 0],
        [-0.5, -sqrt3 / 6, 1]
      ];
      baseIndices = [0, 1, 2];
      vectorIndices = [[0, 3]];
      break;
    case 'parallelepiped':
      // Equal edge lengths and 60-degree angles give a symmetric rhombohedron.
      local = [
        [-0.75, -sqrt3 / 4, 0],
        [0.25, -sqrt3 / 4, 0],
        [-0.25, sqrt3 / 4, 0],
        [-0.25, -sqrt3 / 12, Math.sqrt(2 / 3)]
      ];
      pointIndices = [0];
      vectorIndices = [[0, 1], [0, 2], [0, 3]];
      break;
    case 'cuboid':
      local = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0], [-0.5, -0.5, 1]];
      pointIndices = [0];
      vectorIndices = [[0, 1], [0, 2], [0, 3]];
      break;
    default:
      return null;
  }

  const points = local.map(point => point.map((value, axis) =>
    anchor[axis] + (value - local[0][axis]) * edgeLength) as Vector3);
  if (points.some(point => !point.every(Number.isFinite))) return null;
  const vectors = vectorIndices.map(([start, end]) =>
    points[end].map((value, axis) => value - points[start][axis]) as Vector3);
  let solid: Polyhedron3 | null = null;
  if (kind === 'tetrahedron') solid = tetrahedronFromPoints3D(points);
  else if (kind === 'pyramid' || kind === 'prism') {
    const base = polygonFromPoints3D(baseIndices.map(index => points[index]));
    if (base) solid = kind === 'pyramid'
      ? pyramidFromBaseApex3D(base, points[pointIndices[0]])
      : prismFromBaseVector3D(base, vectors[0]);
  } else solid = parallelepipedFromPointVectors3D(
    points[0], vectors[0], vectors[1], vectors[2], kind === 'cuboid'
  );
  return solid ? { kind, points, pointIndices, baseIndices, vectorIndices, solid } : null;
}