import { getMacroRenderedLayer, type MacroLayerRenderRole } from './macroLayer';

export const DGS_LAYER_OWNER_PROPERTIES = [
  '__liaDgsOwner',
  '__liaDgsSliderOwner',
  '__liaDgsPolygonBorderOwner',
  '__liaDgsDesignOwner'
] as const;

/** Map the public DGS rank onto the same source-major renderer slots as macros. */
export function getDgsRenderedLayer(
  layerValue: number,
  role: MacroLayerRenderRole
): number {
  return getMacroRenderedLayer(
    Math.max(0, Math.min(20, Math.round(Number(layerValue) || 0))),
    role
  );
}

/** Resolve an explicit DGS layer through composite-owner links. */
export function getExplicitDgsLayerFromOwner(
  object: any,
  seen = new Set<any>()
): number | null {
  if (!object || typeof object !== 'object' || seen.has(object)) return null;
  seen.add(object);
  try {
    if (object.__liaDgsLayer != null) {
      const ownLayer = Number(object.__liaDgsLayer);
      if (Number.isFinite(ownLayer)) return Math.max(0, Math.min(20, Math.round(ownLayer)));
    }
  } catch (e) {}
  for (let index = 0; index < DGS_LAYER_OWNER_PROPERTIES.length; index += 1) {
    try {
      const inherited = getExplicitDgsLayerFromOwner(
        object[DGS_LAYER_OWNER_PROPERTIES[index]],
        seen
      );
      if (inherited != null) return inherited;
    } catch (e) {}
  }
  return null;
}

/** Resolve the renderer layer that was applied to an object or composite owner. */
export function getRenderedDgsLayerFromOwner(
  object: any,
  seen = new Set<any>()
): number | null {
  if (!object || typeof object !== 'object' || seen.has(object)) return null;
  seen.add(object);
  try {
    if (object.__liaDgsRenderedLayer != null) {
      const renderedLayer = Number(object.__liaDgsRenderedLayer);
      if (Number.isFinite(renderedLayer)) return Math.max(0, Math.round(renderedLayer));
    }
  } catch (e) {}
  for (let index = 0; index < DGS_LAYER_OWNER_PROPERTIES.length; index += 1) {
    try {
      const inherited = getRenderedDgsLayerFromOwner(
        object[DGS_LAYER_OWNER_PROPERTIES[index]],
        seen
      );
      if (inherited != null) return inherited;
    } catch (e) {}
  }
  return null;
}
