type AppearanceRole = 'face' | 'round-face' | 'round-guide';

function normalizedAttributes(args: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  const assign = (key: unknown, value: any): void => {
    result[String(key).replace(/\s+/g, '').toLowerCase()] = value;
  };
  args.forEach(argument => {
    if (typeof argument === 'string') {
      const separator = argument.indexOf(':');
      if (separator >= 0) assign(argument.slice(0, separator), argument.slice(separator + 1));
    } else if (Array.isArray(argument)) {
      if (argument.length >= 2) assign(argument[0], argument[1]);
    } else if (argument && typeof argument === 'object') {
      Object.entries(argument).forEach(([key, value]) => assign(key, value));
    }
  });
  return result;
}

function protectedAttributes(role: AppearanceRole): Record<string, any> {
  const label = { name: '', withlabel: false };
  if (role === 'round-guide') return {
    ...label,
    fillcolor: 'none',
    highlightfillcolor: 'none',
    fillopacity: 0,
    highlightfillopacity: 0,
    gradient: null,
    gradientsecondopacity: 0
  };
  if (role === 'round-face') return {
    ...label,
    strokewidth: 0,
    highlightstrokewidth: 0,
    strokeopacity: 0,
    highlightstrokeopacity: 0,
    gradient: null
  };
  return label;
}

function protectPart(part: any, role: AppearanceRole): void {
  if (!part || part.__liaSolid3DAppearanceInstalled) return;
  part.__liaSolid3DAppearanceInstalled = true;
  const invariant = protectedAttributes(role);
  const enforce = (): void => {
    if (part.visProp) Object.assign(part.visProp, invariant);
  };
  const synchronizeNode = (): void => {
    const node = part.rendNode as SVGElement | undefined;
    if (!node) return;
    if (role === 'round-guide') {
      node.setAttribute('fill', 'none');
      node.setAttribute('fill-opacity', '0');
      node.style.fill = 'none';
    } else if (role === 'round-face') {
      node.setAttribute('stroke-width', '0');
      node.setAttribute('stroke-opacity', '0');
    }
  };
  if (typeof part.setAttribute === 'function') {
    const nativeSetAttribute = part.setAttribute.bind(part);
    part.setAttribute = (...args: any[]): any => {
      const next = normalizedAttributes(args);
      // JSXGraph aliases write both fill and stroke. Preserve the applicable
      // channel, then suppress the channel reserved for the other geometry.
      const channel = role === 'round-guide' ? 'stroke' : 'fill';
      if (role !== 'face') {
        if ('color' in next && !(channel + 'color' in next)) next[channel + 'color'] = next.color;
        if ('opacity' in next && !(channel + 'opacity' in next)) next[channel + 'opacity'] = next.opacity;
        if ('highlightcolor' in next && !('highlight' + channel + 'color' in next)) {
          next['highlight' + channel + 'color'] = next.highlightcolor;
        }
        if ('highlightopacity' in next && !('highlight' + channel + 'opacity' in next)) {
          next['highlight' + channel + 'opacity'] = next.highlightopacity;
        }
        delete next.color;
        delete next.opacity;
        delete next.highlightcolor;
        delete next.highlightopacity;
      }
      delete next.label;
      nativeSetAttribute({ ...next, ...invariant });
      enforce();
      synchronizeNode();
      return part;
    };
    // Clear inherited native styles immediately, before the first frame.
    enforce();
    synchronizeNode();
  } else {
    enforce();
  }
  if (typeof part.updateRenderer === 'function') {
    const nativeUpdateRenderer = part.updateRenderer.bind(part);
    part.updateRenderer = (...args: any[]): any => {
      enforce();
      const result = nativeUpdateRenderer(...args);
      synchronizeNode();
      return result;
    };
  }
}

/**
 * Mesh faces own the translucent surface; circular rims and silhouettes own
 * its outlines. Keep those roles intact when a style is broadcast to all parts.
 */
export function installCoordinateSolidAppearance3D(object: any, roundSolid: boolean): void {
  if (!object) return;
  let kind = '';
  try {
    kind = String(object.__liaSolid3DEvaluator?.()?.kind || '');
  } catch (error) {
    // Geometry can temporarily be undefined while a defining point is moved.
  }
  (object.faces || []).forEach((face: any, index: number) => {
    const surfaceRole = !roundSolid ? 'polygon-face' : index === 0 ? 'base' :
      kind === 'cylinder' && index === 1 ? 'top' : 'mantle';
    [face, face?.element2D].forEach(part => {
      if (!part) return;
      part.__liaSolid3DSurfaceRole = surfaceRole;
      protectPart(part, roundSolid ? 'round-face' : 'face');
    });
  });
  if (roundSolid) (object.__liaSolid3DGuideCurves || []).forEach((guide: any) => {
    protectPart(guide, 'round-guide');
    protectPart(guide?.element2D, 'round-guide');
  });
}