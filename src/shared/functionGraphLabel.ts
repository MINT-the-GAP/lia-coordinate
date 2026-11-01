export type FunctionGraphLabelPlacementOptions = {
  label?: any;
  text?: string;
  fontSize?: number;
  leftInsetPx?: number;
  rightInsetPx?: number;
  topInsetPx?: number;
  bottomInsetPx?: number;
  horizontalGapPx?: number;
  horizontalGapUser?: number;
  verticalOffsetUser?: number;
};

export type FunctionGraphLabelPlacement = {
  x: number;
  y: number;
  graphX: number;
  graphY: number;
  side: 'left' | 'right';
  widthPx: number;
  heightPx: number;
};

function safeBoundingBox(board: any): [number, number, number, number] {
  try {
    const box = board && typeof board.getBoundingBox === 'function'
      ? board.getBoundingBox()
      : null;
    if (Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) &&
        box[2] > box[0] && box[1] > box[3]) {
      return [box[0], box[1], box[2], box[3]];
    }
  } catch (e) {}
  return [-5, 5, 5, -5];
}

function visibleTextLength(value: unknown): number {
  const text = String(value == null ? '' : value)
    .replace(/\\\(|\\\)|\\\[|\\\]|\$+/g, '')
    .replace(/\\(?:mathrm|text|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[A-Za-z]+/g, 'x')
    .replace(/[{}_^]/g, '');
  return Math.max(1, Array.from(text).length);
}

function renderedLabelSize(label: any, text: unknown, fontSize: number): { width: number; height: number } {
  const candidates = [
    label && label.rendNode,
    label && label.rendNode && label.rendNode.querySelector?.('mjx-container'),
    label && label.rendNode && label.rendNode.querySelector?.('svg')
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const rect = candidate.getBoundingClientRect?.();
      if (rect && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 1 && rect.height > 1) {
        return { width: rect.width, height: rect.height };
      }
    } catch (e) {}
  }
  return {
    width: Math.max(fontSize * 1.8, visibleTextLength(text) * fontSize * 0.64),
    height: Math.max(fontSize * 1.25, 18)
  };
}

function boardPixelScale(board: any, box: [number, number, number, number]): { x: number; y: number } {
  let x = Math.abs(Number(board && board.unitX));
  let y = Math.abs(Number(board && board.unitY));
  const rect = board && board.containerObj && board.containerObj.getBoundingClientRect?.();
  if ((!Number.isFinite(x) || x <= 0) && rect && Number(rect.width) > 0) {
    x = Number(rect.width) / (box[2] - box[0]);
  }
  if ((!Number.isFinite(y) || y <= 0) && rect && Number(rect.height) > 0) {
    y = Number(rect.height) / (box[1] - box[3]);
  }
  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1
  };
}

export function positionFunctionGraphLabel(
  board: any,
  fn: (x: number) => number,
  options: FunctionGraphLabelPlacementOptions = {}
): FunctionGraphLabelPlacement {
  const box = safeBoundingBox(board);
  const xmin = box[0], ymax = box[1], xmax = box[2], ymin = box[3];
  const scale = boardPixelScale(board, box);
  const fontSize = Math.max(8, Number(options.fontSize) || 24);
  const size = renderedLabelSize(options.label, options.text, fontSize);
  const leftInset = Math.max(6, Number(options.leftInsetPx) || 10);
  const rightInset = Math.max(6, Number(options.rightInsetPx) || 10);
  const topInset = Math.max(6, Number(options.topInsetPx) || 10);
  const bottomInset = Math.max(6, Number(options.bottomInsetPx) || 10);
  const gapPx = options.horizontalGapUser == null
    ? Math.max(4, Number(options.horizontalGapPx) || 8)
    : Math.max(0, Number(options.horizontalGapUser) || 0) * scale.x;
  const verticalOffset = Number(options.verticalOffsetUser) || 0;
  const halfHeight = size.height / 2;
  const minY = ymin + (bottomInset + halfHeight) / scale.y;
  const maxY = ymax - (topInset + halfHeight) / scale.y;
  const startX = xmax - rightInset / scale.x;
  const endX = xmin + leftInset / scale.x;
  let fallback: { x: number; y: number; leftRoom: number; rightRoom: number } | null = null;

  for (let index = 0; index <= 180; index += 1) {
    const ratio = index / 180;
    const graphX = startX - ratio * (startX - endX);
    let graphY = NaN;
    try { graphY = Number(fn(graphX)); } catch (e) {}
    if (!Number.isFinite(graphY)) continue;
    const labelY = graphY + verticalOffset;
    if (labelY < minY || labelY > maxY) continue;
    const leftRoom = (graphX - xmin) * scale.x - leftInset;
    const rightRoom = (xmax - graphX) * scale.x - rightInset;
    if (!fallback) fallback = { x: graphX, y: labelY, leftRoom, rightRoom };
    const leftFits = leftRoom >= size.width + gapPx;
    const rightFits = rightRoom >= size.width + gapPx;
    if (!leftFits && !rightFits) continue;
    const side: 'left' | 'right' = graphX >= (xmin + xmax) / 2
      ? (leftFits ? 'left' : 'right')
      : (rightFits ? 'right' : 'left');
    return placementForSide(graphX, labelY, side, size.width, size.height, gapPx, scale.x,
      xmin, xmax, leftInset, rightInset);
  }

  const graphX = fallback ? fallback.x : (xmin + xmax) / 2;
  let graphY = fallback ? fallback.y : (ymin + ymax) / 2;
  if (minY <= maxY) graphY = Math.max(minY, Math.min(maxY, graphY));
  const side: 'left' | 'right' = fallback && fallback.leftRoom > fallback.rightRoom ? 'left' : 'right';
  return placementForSide(graphX, graphY, side, size.width, size.height, gapPx, scale.x,
    xmin, xmax, leftInset, rightInset);
}

function placementForSide(
  graphX: number,
  graphY: number,
  side: 'left' | 'right',
  widthPx: number,
  heightPx: number,
  gapPx: number,
  unitX: number,
  xmin: number,
  xmax: number,
  leftInsetPx: number,
  rightInsetPx: number
): FunctionGraphLabelPlacement {
  const minX = xmin + leftInsetPx / unitX;
  const maxX = xmax - (rightInsetPx + widthPx) / unitX;
  const proposed = side === 'left'
    ? graphX - (gapPx + widthPx) / unitX
    : graphX + gapPx / unitX;
  const x = maxX >= minX ? Math.max(minX, Math.min(maxX, proposed)) : minX;
  return { x, y: graphY, graphX, graphY, side, widthPx, heightPx };
}

export function keepFunctionGraphLabelOnOneLine(label: any): void {
  if (!label) return;
  try {
    label.setAttribute?.({ cssStyle: 'white-space:nowrap;overflow:visible;' });
  } catch (e) {}
  try {
    if (label.rendNode && label.rendNode.style) {
      label.rendNode.style.whiteSpace = 'nowrap';
      label.rendNode.style.overflow = 'visible';
      label.rendNode.style.maxWidth = 'none';
    }
  } catch (e) {}
  const refresh = () => {
    try {
      label.needsUpdate = true;
      label.board?.update?.();
    } catch (e) {}
  };
  try { window.requestAnimationFrame(refresh); } catch (e) {}
  try { window.setTimeout(refresh, 100); } catch (e) {}
  try { window.setTimeout(refresh, 300); } catch (e) {}
}
