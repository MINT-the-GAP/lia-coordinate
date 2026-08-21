export type BoardCoordinatePoint = {
  x: number;
  y: number;
};

type BoardScreenTransform = {
  originX: number;
  originY: number;
  unitX: number;
  unitY: number;
};

function readBoardScreenTransform(board: any): BoardScreenTransform | null {
  const screenOrigin = board && board.origin && board.origin.scrCoords;
  if (!screenOrigin) return null;

  const originX = Number(screenOrigin[1]);
  const originY = Number(screenOrigin[2]);
  const unitX = Number(board.unitX);
  const unitY = Number(board.unitY);
  if (
    ![originX, originY, unitX, unitY].every(Number.isFinite) ||
    Math.abs(unitX) < 1e-12 ||
    Math.abs(unitY) < 1e-12
  ) {
    return null;
  }

  return { originX, originY, unitX, unitY };
}

export function screenToUserCoordinates(
  board: any,
  point: BoardCoordinatePoint
): BoardCoordinatePoint | null {
  const transform = readBoardScreenTransform(board);
  if (!transform || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

  return {
    x: (point.x - transform.originX) / transform.unitX,
    y: (transform.originY - point.y) / transform.unitY
  };
}

export function userToScreenCoordinates(
  board: any,
  point: BoardCoordinatePoint
): BoardCoordinatePoint | null {
  const transform = readBoardScreenTransform(board);
  if (!transform || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

  return {
    x: transform.originX + point.x * transform.unitX,
    y: transform.originY - point.y * transform.unitY
  };
}
