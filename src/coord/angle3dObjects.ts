import {
  coordinateLinear3DData, coordinatePlane3DData, createCoordinateCurve3D, getCoordinateView3D
} from './view3d';
import { createEvaluatedCurve3D } from '../shared/curve3d';
import {
  angleBetweenLinesArc3, angleBetweenLinePlaneArc3, angleBetweenPlanesArc3,
  spatialAngleArcPoint3, spatialAngleLabelPoint3,
  type SpatialAngle3D, type SpatialAngle3DDefinition
} from '../shared/angle3d';
import type { Vector3 } from '../shared/vector3d';

export interface CoordinateAngle3DOptions {
  name: string;
  color?: string;
  language?: string;
  visible?: boolean;
  fixed?: boolean;
  showName?: boolean;
  showAngle?: boolean;
  autoName?: boolean;
  labelText?: (angle: any) => string;
}

/** The same dependent arc is used by interactive constructions and macro imports. */
export function createCoordinateAngle3D(
  board: any,
  firstSource: any,
  secondSource: any,
  definition: SpatialAngle3DDefinition,
  options: CoordinateAngle3DOptions
): any | null {
  if (!board || !firstSource || !secondSource || firstSource === secondSource) return null;
  let sources = [firstSource, secondSource];
  if (definition === 'line-plane' && coordinatePlane3DData(sources[0])) sources = [sources[1], sources[0]];
  const evaluateGeometry = (): SpatialAngle3D | null => {
    if (definition === 'lines') {
      const first = coordinateLinear3DData(sources[0]);
      const second = coordinateLinear3DData(sources[1]);
      return first && second ? angleBetweenLinesArc3(first, second) : null;
    }
    if (definition === 'line-plane') {
      const line = coordinateLinear3DData(sources[0]);
      const plane = coordinatePlane3DData(sources[1]);
      return line && plane ? angleBetweenLinePlaneArc3(line, plane) : null;
    }
    if (definition === 'planes') {
      const first = coordinatePlane3DData(sources[0]);
      const second = coordinatePlane3DData(sources[1]);
      return first && second ? angleBetweenPlanesArc3(first, second) : null;
    }
    return null;
  };
  if (!evaluateGeometry()) return null;
  const color = options.color || '#ff00ff';
  const radius = (): number => {
    const config = getCoordinateView3D(board)?.config;
    const spans = config ? [config.xmax - config.xmin, config.ymax - config.ymin, config.zmax - config.zmin]
      .filter(value => Number.isFinite(value) && value > 0) : [];
    return Math.max(0.12, (spans.length ? Math.min(...spans) : 8) * 0.11);
  };
  const created: any[] = [];
  const createCurve = (
    pointAt: (geometry: SpatialAngle3D, t: number) => Vector3 | null,
    width: number,
    dash = 0
  ): any => {
    const curve = createCoordinateCurve3D(board, () => createEvaluatedCurve3D(t => {
      const geometry = evaluateGeometry();
      return geometry ? pointAt(geometry, t) : null;
    }, [0, 1], { quality: 48 }), {
      name: '', withLabel: false, fixed: options.fixed !== false,
      visible: options.visible !== false, highlight: false,
      strokeColor: color, highlightStrokeColor: color,
      strokeWidth: width, highlightStrokeWidth: width, dash,
      fillOpacity: 0, highlightFillOpacity: 0
    });
    created.push(curve);
    return curve;
  };
  const remove = (object: any): void => {
    try { object?.__liaCurve3DCleanup?.(); } catch (error) {}
    try { board.removeObject(object); } catch (error) {}
  };
  try {
    const angle = createCurve((geometry, t) => spatialAngleArcPoint3(geometry, radius(), t), 3.2);
    const helperPoint = (parameter: number) =>
      (geometry: SpatialAngle3D, t: number): Vector3 | null => {
        const endpoint = spatialAngleArcPoint3(geometry, radius(), parameter);
        return endpoint ? [
          geometry.center[0] + (endpoint[0] - geometry.center[0]) * t,
          geometry.center[1] + (endpoint[1] - geometry.center[1]) * t,
          geometry.center[2] + (endpoint[2] - geometry.center[2]) * t
        ] : null;
      };
    const helpers = [createCurve(helperPoint(0), 1.5, 2), createCurve(helperPoint(1), 1.5, 2)];
    angle.__liaDgsAngle = true;
    angle.__liaDgsAngle3D = true;
    angle.__liaDgsAngleName = options.name;
    angle.__liaDgsAngleAutoName = !!options.autoName;
    angle.__liaDgsAngle3DDefinition = definition;
    angle.__liaDgsAngle3DSources = sources.slice();
    angle.__liaDgsAngle3DHelpers = helpers;
    angle.__liaDgsLanguage = options.language || 'de';
    angle.__liaDgsColor = color;
    angle.__liaDgsLineColor = color;
    angle.__liaDgsFillColor = color;
    angle.__liaDgsTextColor = color;
    angle.__liaDgsShowName = options.showName !== false;
    angle.__liaDgsShowAngle = options.showAngle !== false;
    angle.__liaDgsShowObject = options.visible !== false;
    angle.__liaDgsOpacity = 1;
    angle.__liaDgsLineStyle = 'solid';
    angle.__liaDgsSegmentStrokeWidth = 3.2;
    helpers.forEach(helper => {
      helper.__liaDgsAngle3DHelper = true;
      helper.__liaDgsAngle3DOwner = angle;
      helper.__liaDgsHelper = true;
      if (helper.element2D) helper.element2D.__liaCurve3DProxy = angle;
    });
    const labelPosition = (): [number, number] => {
      const entry = getCoordinateView3D(board);
      const geometry = evaluateGeometry();
      const point = geometry && spatialAngleLabelPoint3(geometry, radius());
      if (!entry || !point) return [0, 0];
      try {
        const projected = entry.view.project3DTo2D(point);
        const x = Number(projected?.[1]);
        const y = Number(projected?.[2]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : [0, 0];
      } catch (error) { return [0, 0]; }
    };
    const labelText = (): string => {
      if (options.labelText) return options.labelText(angle);
      const name = angle.__liaDgsShowName !== false ? String(angle.__liaDgsAngleName || '') : '';
      const radians = evaluateGeometry()?.radians;
      if (!angle.__liaDgsShowAngle || !Number.isFinite(radians)) return name ? '\\(' + name + '\\)' : '';
      const value = new Intl.NumberFormat(angle.__liaDgsLanguage === 'en' ? 'en' : 'de', {
        maximumFractionDigits: 2
      }).format(Number(radians) * 180 / Math.PI);
      return '\\(' + (name ? name + ' = ' : '') + value + '^{\\circ}\\)';
    };
    const label = board.create('text', [() => labelPosition()[0], () => labelPosition()[1], labelText], {
      fixed: true, highlight: false, parse: false, useMathJax: true,
      display: 'html', anchorX: 'middle', anchorY: 'middle',
      visible: options.visible !== false && (options.showName !== false || options.showAngle !== false),
      strokeColor: color, fillColor: color, fontSize: 18
    });
    created.push(label);
    angle.label = label;
    angle.__liaDgsAngleLabel = label;
    let cleaned = false;
    angle.__liaDgsAngle3DCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      helpers.forEach(remove);
      remove(label);
      angle.__liaDgsAngle3DHelpers = [];
    };
    return angle;
  } catch (error) {
    created.reverse().forEach(remove);
    return null;
  }
}
