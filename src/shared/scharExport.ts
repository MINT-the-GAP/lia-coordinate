import { splitTopLevel, unquote } from './parser';

/** Optional finite parameter defaults; malformed entries leave legacy defaults intact. */
export function parseScharInitialValues(options: string[]): Record<string, number> {
  const values: Record<string, number> = Object.create(null);
  for (const option of options) {
    const match = unquote(option).match(/^params\s*=\s*\[([\s\S]*)\]$/i);
    if (!match) continue;
    for (const part of splitTopLevel(match[1], ';')) {
      const assignment = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i);
      if (!assignment) continue;
      const value = Number(assignment[2]);
      if (Number.isFinite(value)) values[assignment[1]] = value;
    }
  }
  return values;
}

export function formatScharInitialValues(values: Record<string, number>): string {
  // String(number) preserves fitted coefficients, including tiny values that
  // the coordinate exporter would round to zero.
  return 'params=[' + Object.entries(values).map(([name, value]) => name + '=' + String(value)).join(';') + ']';
}

const REGRESSION_FAMILIES: Record<string, { expression: string; parameters: string[] }> = {
  linear: { expression: 'm*x+n', parameters: ['m', 'n'] },
  quadratic: { expression: 'a*(x+c)^2+d', parameters: ['a', 'c', 'd'] },
  cubic: { expression: 'a*x^3+b*x^2+c*x+d', parameters: ['a', 'b', 'c', 'd'] },
  quartic: { expression: 'a*x^4+b*x^3+c*x^2+d*x+f', parameters: ['a', 'b', 'c', 'd', 'f'] },
  sin: { expression: 'A*sin(b*(x+c))+d', parameters: ['A', 'b', 'c', 'd'] },
  exp: { expression: 'A*exp(b*(x+c))+d', parameters: ['A', 'b', 'c', 'd'] },
  log: { expression: 'A*ln(abs(b)*(x+c))+d', parameters: ['A', 'b', 'c', 'd'] },
  sqrt: { expression: 'A*sqrt(abs(b)*(x+c))+d', parameters: ['A', 'b', 'c', 'd'] },
  hyperbola: { expression: 'A/(b*(x+c))+d', parameters: ['A', 'b', 'c', 'd'] },
  hyperbola2: { expression: 'A/(b*x-c)^2+d', parameters: ['A', 'b', 'c', 'd'] }
};

type ScharExportDefinition = {
  name: string;
  showName: boolean;
  variable: string;
  expression: string;
  values: Record<string, number>;
  showTerm: boolean;
  color: string;
  lineStyle: string;
};

/** Read only recognized models or the visible curve of a live Schar. */
export function getScharExportDefinition(object: any): ScharExportDefinition | null {
  if (object?.__liaRegressionAnalysisGraph) {
    const entry = object.__liaRegressionEntry;
    const family = REGRESSION_FAMILIES[entry?.classKey];
    if (!family || !entry?.model) return null;
    const values = Object.fromEntries(family.parameters.map(name => [name, entry.model[name]]));
    if (!Object.values(values).every(value => typeof value === 'number' && Number.isFinite(value))) return null;
    return { name: 'f', showName: false, variable: 'x', expression: family.expression,
      values, showTerm: true, color: entry.color, lineStyle: 'solid' };
  }
  const entry = object?.__liaScharEntry;
  if (!entry || entry.graph !== object) return null;
  const values: Record<string, number> = Object.fromEntries(entry.params.map((name: string) => [name, entry.values[name]]));
  // Cubic and quartic Schar drags retain an additional horizontal shift.
  // Expand it into their existing coefficients so another export is lossless.
  if (entry.polyCoeffDrag && entry.dragShiftX) {
    const mapping = entry.polyCoeffDrag.degreeToParam;
    const degree = entry.polyCoeffDrag.maxDegree;
    for (let j = 0; j <= degree; j++) {
      let sum = 0;
      for (let k = j; k <= degree; k++) {
        let choose = 1;
        for (let i = 1; i <= j; i++) choose = choose * (k - i + 1) / i;
        sum += entry.values[mapping[k]] * choose * Math.pow(-entry.dragShiftX, k - j);
      }
      values[mapping[j]] = sum;
    }
  }
  if (!Object.values(values).every(value => typeof value === 'number' && Number.isFinite(value))) return null;
  return { name: entry.cfg.name, showName: entry.cfg.showName, variable: entry.cfg.variableName,
    expression: entry.cfg.expr, values, showTerm: entry.cfg.showTerm,
    color: entry.cfg.color, lineStyle: entry.cfg.lineStyle };
}
