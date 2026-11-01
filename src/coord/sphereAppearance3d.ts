const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const SPHERE_GRADIENT = {
  gradient: 'radial',
  gradientcx: 0.5,
  gradientcy: 0.5,
  gradientr: 0.72,
  gradientfx: 0.3,
  gradientfy: 0.26,
  gradientfr: 0.04,
  gradientstartoffset: 0,
  gradientendoffset: 1,
  gradientsecondopacity: 1
};

function evaluatedColor(element: any, key: string): string {
  try {
    const raw = element?.visProp?.[key];
    return String(typeof raw === 'function' ? raw() : raw || '');
  } catch (error) {
    return '';
  }
}

function shadowColor(color: string): string {
  const hex = color.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  let channels: number[] | null = null;
  if (hex?.length === 3 || hex?.length === 4) {
    channels = hex.slice(0, 3).split('').map(channel => parseInt(channel + channel, 16));
  } else if (hex?.length === 6 || hex?.length === 8) {
    channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  } else {
    const rgb = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    if (rgb) channels = rgb.slice(1, 4).map(Number);
  }
  return channels
    ? '#' + channels.map(channel => Math.round(Math.min(255, channel) * 0.42).toString(16).padStart(2, '0')).join('')
    : color;
}

function setSvgAttribute(node: Element, key: string, value: string): void {
  if (node.getAttribute(key) !== value) node.setAttribute(key, value);
}

/**
 * Shade the actual rendered sphere using its surface color.
 *
 * JSXGraph's 3D setAttribute forwards the complete attribute object once per
 * key. Reapplying `gradient` through it creates duplicate SVG gradient IDs,
 * leaving the browser painted with the first (native green) gradient. Configure
 * the existing gradient directly instead, and retain the style across the
 * native circle/ellipse replacement when changing projection.
 */
export function installCoordinateSphereAppearance3D(object: any): void {
  if (!object || object.__liaSphere3DAppearanceInstalled) return;
  object.__liaSphere3DAppearanceInstalled = true;
  object.__liaSphere3DShaded = true;

  const configure = (element: any): string => {
    const normalColor = evaluatedColor(element, 'fillcolor') ||
      evaluatedColor(element, 'strokecolor') || '#ff00ff';
    const highlightedColor = element?.highlighted
      ? evaluatedColor(element, 'highlightfillcolor') : '';
    const surfaceColor = highlightedColor && highlightedColor !== 'none'
      ? highlightedColor : normalColor;
    Object.assign(element.visProp, SPHERE_GRADIENT, {
      gradientsecondcolor: shadowColor(surfaceColor)
    });
    return surfaceColor;
  };

  const checkedGradients = new WeakSet<object>();
  const synchronizeGradient = (element: any): void => {
    const node = element?.rendNode as SVGElement | undefined;
    if (!node) return;
    const surfaceColor = configure(element);
    // The native gradient renderer can retain a cached shape opacity after a
    // live color-picker edit. Synchronize the rendered alpha as well as its
    // stops; zero must remain zero and highlighting keeps its own opacity.
    const opacityKey = element.highlighted ? 'highlightfillopacity' : 'fillopacity';
    const rawOpacity = element.visProp?.[opacityKey] ?? element.visProp?.fillopacity;
    let opacity = NaN;
    try { opacity = Number(typeof rawOpacity === 'function' ? rawOpacity() : rawOpacity); } catch (error) {}
    if (Number.isFinite(opacity)) setSvgAttribute(node, 'fill-opacity', String(Math.max(0, Math.min(1, opacity))));
    const defs = element.board?.renderer?.defs || node.ownerSVGElement?.querySelector('defs');
    if (!defs) return;
    let gradient = element.gradNode as SVGElement | undefined;
    if (!gradient || !gradient.isConnected || gradient.tagName.toLowerCase() !== 'radialgradient') {
      gradient = node.ownerDocument.createElementNS(SVG_NAMESPACE, 'radialGradient');
      gradient.id = node.id + '-lia-sphere-gradient';
      defs.appendChild(gradient);
      element.gradNode = gradient;
      element.gradNode1 = undefined;
      element.gradNode2 = undefined;
    }
    // Repair any gradients left by an earlier native setAttribute({gradient}).
    if (!checkedGradients.has(gradient)) {
      for (const duplicate of Array.from(defs.children) as Element[]) {
        if (duplicate !== gradient && duplicate.id === gradient.id) duplicate.remove();
      }
      checkedGradients.add(gradient);
    }
    if (!element.gradNode1 || element.gradNode1.parentNode !== gradient ||
        !element.gradNode2 || element.gradNode2.parentNode !== gradient) {
      gradient.replaceChildren();
      element.gradNode1 = node.ownerDocument.createElementNS(SVG_NAMESPACE, 'stop');
      element.gradNode2 = node.ownerDocument.createElementNS(SVG_NAMESPACE, 'stop');
      gradient.append(element.gradNode1, element.gradNode2);
    }
    const fillReference = 'url("#' + gradient.id + '")';
    if (node.style.fill !== fillReference) node.style.fill = fillReference;
    const positions: Record<string, string> = {
      cx: '50%', cy: '50%', r: '72%', fx: '30%', fy: '26%', fr: '4%'
    };
    Object.entries(positions).forEach(([key, value]) => setSvgAttribute(gradient!, key, value));
    setSvgAttribute(element.gradNode1, 'offset', '0%');
    setSvgAttribute(element.gradNode2, 'offset', '100%');
    // The shape's fill-opacity already carries the chosen transparency. Do not
    // multiply it a second time inside the gradient stops.
    setSvgAttribute(element.gradNode1, 'style', 'stop-color:' + surfaceColor + ';stop-opacity:1');
    setSvgAttribute(element.gradNode2, 'style', 'stop-color:' + shadowColor(surfaceColor) + ';stop-opacity:1');
  };

  const installProjection = (): void => {
    const element = object.element2D;
    if (!element) return;
    element.__liaSphere3DProxy = object;
    object.rendNode = element.rendNode;
    object.label = element.label;
    if (!element.__liaSphere3DAppearanceInstalled) {
      element.__liaSphere3DAppearanceInstalled = true;
      const nativeUpdateRenderer = element.updateRenderer?.bind(element);
      element.updateRenderer = (...args: any[]): any => {
        configure(element);
        const result = nativeUpdateRenderer?.(...args);
        synchronizeGradient(element);
        return result || element;
      };
    }
    synchronizeGradient(element);
  };

  const nativeRebuildProjection = object.rebuildProjection?.bind(object);
  if (nativeRebuildProjection) {
    object.rebuildProjection = (attributes?: Record<string, unknown>): any => {
      const previous = object.element2D;
      const previousGradient = previous?.gradNode;
      const appearance = attributes || {
        ...object.visProp,
        ...previous?.visProp,
        name: previous?.name || object.name,
        id: null,
        element3d: object
      };
      const result = nativeRebuildProjection(appearance);
      if (Array.isArray(object.inherits)) {
        object.inherits = object.inherits.filter((child: any) => child !== previous);
      }
      previousGradient?.remove?.();
      installProjection();
      return result || object;
    };
  }
  object.__liaSphere3DSyncAppearance = installProjection;
  installProjection();
}
