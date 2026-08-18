// Shared public line-style parsing and JSXGraph attribute helpers.

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdotted';

const LINE_STYLE_DASH: Record<LineStyle, number> = {
  solid: 0,
  dashed: 2,
  dotted: 7,
  // JSXGraph has no separately named dash-dot preset. Pattern 6 is its
  // stable alternating dash pattern and is the closest renderer-native fit.
  dashdotted: 6
};

function normalizedLineStyleName(value: unknown): string {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/** Parse a public style value without silently accepting unknown values. */
export function parseLineStyle(value: unknown): LineStyle | null {
  const normalized = normalizedLineStyleName(value);
  if (normalized === 'solid') return 'solid';
  if (normalized === 'dashed') return 'dashed';
  if (normalized === 'dotted') return 'dotted';
  if (normalized === 'dashdotted' || normalized === 'dashdot') return 'dashdotted';
  return null;
}

/** Detect the additive named option, including invalid values that must not become labels. */
export function isLineStyleOption(value: unknown): boolean {
  return /^(?:line\s*-?\s*style|linienstil)\s*=/i.test(
    String(value == null ? '' : value).trim()
  );
}

/** Return a valid value from one `linestyle=` / `linienstil=` option. */
export function lineStyleOptionValue(value: unknown): LineStyle | null {
  const raw = String(value == null ? '' : value).trim();
  const match = raw.match(/^(?:line\s*-?\s*style|linienstil)\s*=\s*(.*)$/i);
  return match ? parseLineStyle(match[1]) : null;
}

/** Last valid option wins; absent or invalid options preserve the supplied fallback. */
export function parseLineStyleOptions(
  values: readonly unknown[],
  fallback: LineStyle = 'solid'
): LineStyle {
  let result = fallback;
  values.forEach(function(value) {
    const parsed = lineStyleOptionValue(value);
    if (parsed) result = parsed;
  });
  return result;
}

/** JSXGraph attributes for one public line style. */
export function lineStyleAttributes(style: LineStyle | unknown): {
  dash: number;
} {
  const normalized = parseLineStyle(style) || 'solid';
  return {
    dash: LINE_STYLE_DASH[normalized]
  };
}

type LineCap = 'butt' | 'round' | 'square';

function normalizeLineCap(value: unknown): LineCap | null {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return normalized === 'butt' || normalized === 'round' || normalized === 'square'
    ? normalized
    : null;
}

function baseLineCap(object: any): LineCap {
  const stored = normalizeLineCap(object && object.__liaLineStyleBaseLineCap);
  if (stored) return stored;
  let detected: LineCap | null = null;
  try {
    if (typeof object?.getAttribute === 'function') {
      detected = normalizeLineCap(object.getAttribute('lineCap'));
    }
  } catch (e) {}
  if (!detected) {
    try { detected = normalizeLineCap(object?.visProp?.linecap); } catch (e) {}
  }
  const baseline = detected || 'butt';
  if (object) object.__liaLineStyleBaseLineCap = baseline;
  return baseline;
}

/** Apply a style and retain its public name for DGS persistence and export. */
export function applyLineStyle(object: any, style: LineStyle | unknown): LineStyle {
  const normalized = parseLineStyle(style) || 'solid';
  if (!object) return normalized;
  const effective = parseLineStyle(object.__liaDgsLineStyle) || normalized;
  object.__liaLineStyle = effective;
  const originalLineCap = baseLineCap(object);
  try {
    if (typeof object.setAttribute === 'function') {
      object.setAttribute({
        ...lineStyleAttributes(effective),
        lineCap: effective === 'dotted' ? 'round' : originalLineCap
      });
    }
  } catch (e) {}
  return effective;
}
