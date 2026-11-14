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

type FunctionGraphSample = {
  x: number;
  y: number;
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

function evaluateGraphSample(
  fn: (x: number) => number,
  x: number
): FunctionGraphSample | null {
  let y = NaN;
  try { y = Number(fn(x)); } catch (e) {}
  return Number.isFinite(y) ? { x, y } : null;
}

function findVisibleGraphPointBetween(
  fn: (x: number) => number,
  first: FunctionGraphSample,
  second: FunctionGraphSample,
  ymin: number,
  ymax: number
): FunctionGraphSample | null {
  const firstBelow = first.y < ymin;
  const secondBelow = second.y < ymin;
  const firstAbove = first.y > ymax;
  const secondAbove = second.y > ymax;
  if (!((firstBelow && secondAbove) || (firstAbove && secondBelow))) return null;

  let below = firstBelow ? first : second;
  let above = firstAbove ? first : second;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const midpoint = evaluateGraphSample(fn, (below.x + above.x) / 2);
    if (!midpoint) return null;
    if (midpoint.y >= ymin && midpoint.y <= ymax) return midpoint;
    if (midpoint.y < ymin) below = midpoint;
    else above = midpoint;
  }
  return null;
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
  let nearestOutside: { sample: FunctionGraphSample; distance: number } | null = null;
  let previous: FunctionGraphSample | null = null;

  const placeVisibleSample = (sample: FunctionGraphSample): FunctionGraphLabelPlacement | null => {
    const requestedY = sample.y + verticalOffset;
    const labelY = minY <= maxY
      ? Math.max(minY, Math.min(maxY, requestedY))
      : (ymin + ymax) / 2;
    const leftRoom = (sample.x - xmin) * scale.x - leftInset;
    const rightRoom = (xmax - sample.x) * scale.x - rightInset;
    if (!fallback) fallback = { x: sample.x, y: labelY, leftRoom, rightRoom };
    if (requestedY < minY || requestedY > maxY) return null;
    const leftFits = leftRoom >= size.width + gapPx;
    const rightFits = rightRoom >= size.width + gapPx;
    if (!leftFits && !rightFits) return null;
    const side: 'left' | 'right' = sample.x >= (xmin + xmax) / 2
      ? (leftFits ? 'left' : 'right')
      : (rightFits ? 'right' : 'left');
    return placementForSide(sample.x, requestedY, side, size.width, size.height, gapPx, scale.x,
      xmin, xmax, leftInset, rightInset);
  };

  for (let index = 0; index <= 180; index += 1) {
    const ratio = index / 180;
    const graphX = startX - ratio * (startX - endX);
    const sample = evaluateGraphSample(fn, graphX);
    if (!sample) {
      previous = null;
      continue;
    }

    if (sample.y >= ymin && sample.y <= ymax) {
      const placement = placeVisibleSample(sample);
      if (placement) return placement;
    } else {
      const distance = sample.y < ymin ? ymin - sample.y : sample.y - ymax;
      if (!nearestOutside || distance < nearestOutside.distance) {
        nearestOutside = { sample, distance };
      }
      if (previous) {
        const crossing = findVisibleGraphPointBetween(fn, previous, sample, ymin, ymax);
        if (crossing) {
          const placement = placeVisibleSample(crossing);
          if (placement) return placement;
        }
      }
    }
    previous = sample;
  }

  if (fallback) {
    const side: 'left' | 'right' = fallback.leftRoom > fallback.rightRoom ? 'left' : 'right';
    return placementForSide(fallback.x, fallback.y, side, size.width, size.height, gapPx, scale.x,
      xmin, xmax, leftInset, rightInset);
  }

  if (nearestOutside) {
    const sample = nearestOutside.sample;
    const labelY = sample.y > ymax
      ? Math.max(sample.y + verticalOffset, ymax + (topInset + halfHeight) / scale.y)
      : Math.min(sample.y + verticalOffset, ymin - (bottomInset + halfHeight) / scale.y);
    const leftRoom = (sample.x - xmin) * scale.x - leftInset;
    const rightRoom = (xmax - sample.x) * scale.x - rightInset;
    const side: 'left' | 'right' = leftRoom > rightRoom ? 'left' : 'right';
    return placementForSide(sample.x, labelY, side, size.width, size.height, gapPx, scale.x,
      xmin, xmax, leftInset, rightInset);
  }

  const y = (ymin + ymax) / 2;
  return {
    x: xmax + (rightInset + gapPx) / scale.x,
    y,
    graphX: xmax,
    graphY: y,
    side: 'right',
    widthPx: size.width,
    heightPx: size.height
  };
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
