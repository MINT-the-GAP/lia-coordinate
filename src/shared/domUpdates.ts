/** Avoid mutation records even when callers repeatedly request the same value. */
export function setAttributeIfChanged(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

const styleValues = new WeakMap<object, Map<string, { requested: string; actual: string }>>();

export function setStyleIfChanged(element: HTMLElement | SVGElement, property: string, value: string): void {
  const style = element.style as any;
  const current = style[property];
  let values = styleValues.get(element);
  const previous = values && values.get(property);
  // CSSOM normalizes e.g. #000 to rgb(0, 0, 0); compare its last actual value too.
  if (current === value || (previous?.requested === value && previous.actual === current)) return;
  style[property] = value;
  if (!values) { values = new Map(); styleValues.set(element, values); }
  values.set(property, { requested: value, actual: style[property] });
}
