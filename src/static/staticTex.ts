// Optional MathJax 3 SVG output. Plain labels never load a TeX renderer.
const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js';

export interface StaticTextRun { text: string; math: boolean; display: boolean }

/** Leave ordinary text, unmatched dollars, and escaped delimiters outside TeX. */
export function splitStaticText(content: string): StaticTextRun[] {
  const runs: StaticTextRun[] = [];
  const pattern = /(\$\$|\$|\\\(|\\\[)/g;
  const escaped = (index: number) => {
    let count = 0;
    while (index > 0 && content[--index] === '\\') count++;
    return count % 2 === 1;
  };
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (escaped(match.index)) continue;
    const open = match[0];
    const close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
    let next = content.indexOf(close, pattern.lastIndex);
    while (next >= 0 && escaped(next)) {
      next = content.indexOf(close, next + close.length);
    }
    if (next < 0) continue;
    const tex = content.slice(pattern.lastIndex, next);
    if (!tex || (open === '$' && /[\r\n]/.test(tex))) continue;
    if (match.index > end) runs.push({ text: content.slice(end, match.index), math: false, display: false });
    runs.push({ text: tex, math: true, display: open === '$$' || open === '\\[' });
    end = next + close.length;
    pattern.lastIndex = end;
  }
  if (end < content.length) runs.push({ text: content.slice(end), math: false, display: false });
  return runs;
}

interface TexRenderer { engine: any; document: any }
interface TexLabel {
  text: SVGTextElement;
  content: string;
  runs: StaticTextRun[];
  math?: SVGSVGElement[];
}
interface TexState {
  renderer?: Promise<TexRenderer>;
  queue: Promise<unknown>;
  cache: Map<string, SVGSVGElement>;
  serial: number;
  warned: boolean;
  pending: TexLabel[];
  scheduled: boolean;
  active: WeakSet<SVGTextElement>;
  sources: WeakMap<SVGTextElement, string>;
}

// Share loading, conversion queue, and bounded cache across bundle instances.
function stateFor(view: Window): TexState {
  const runtime = view as Window & { __liaStaticTex?: TexState };
  return runtime.__liaStaticTex || (runtime.__liaStaticTex = {
    queue: Promise.resolve(), cache: new Map(), serial: 0, warned: false,
    pending: [], scheduled: false, active: new WeakSet(), sources: new WeakMap()
  });
}

function bounded<T>(view: Window, promise: Promise<T>, onLateSuccess?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = view.setTimeout(() => {
      timedOut = true;
      reject(new Error('MathJax loading timed out'));
    }, 20000);
    promise.then(value => {
      resolve(value);
      if (timedOut) onLateSuccess?.();
    }, reject).finally(() => view.clearTimeout(timer));
  });
}

function retryAfterLateResource(view: Window): void {
  // A startup/component promise can resolve after our timeout without another
  // DOM load event. Retry once on that success, after failed jobs leave the queue.
  stateFor(view).queue.then(() => retryStaticText(view.document.documentElement, true));
}
async function loadMathJax(view: Window): Promise<any> {
  const doc = view.document;
  let engine = (view as any).MathJax;
  // LiaScript can expose MathJax in the parent of a script frame.
  if (!engine) {
    try { engine = (view.parent as any).MathJax; } catch (_) { /* cross-origin parent */ }
  }
  if (!engine?.startup?.promise && !engine?.version) {
    const existing = Array.from(doc.scripts).find(script =>
      /(?:mathjax|tex-chtml|tex-svg)/i.test(script.src));
    if (existing) {
      let cleanup = () => {};
      try {
        await bounded(view, new Promise<void>((resolve, reject) => {
          const loaded = () => resolve();
          const failed = () => reject(new Error('MathJax script failed to load'));
          cleanup = () => {
            existing.removeEventListener('load', loaded);
            existing.removeEventListener('error', failed);
          };
          existing.addEventListener('load', loaded, { once: true });
          existing.addEventListener('error', failed, { once: true });
        }));
      } finally { cleanup(); }
    } else {
      // Keep CHTML as public output for other formulas, even in static-only
      // courses. Only a newly loaded engine disables automatic page scanning.
      const config = engine || {};
      (view as any).MathJax = {
        ...config, startup: { ...config.startup, typeset: false }
      };
      const script = doc.createElement('script');
      script.src = MATHJAX_URL;
      script.async = true;
      script.setAttribute('data-lia-static-mathjax', '');
      try {
        await bounded(view, new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('MathJax script failed to load'));
          (doc.head || doc.documentElement).appendChild(script);
        }));
      } catch (error) {
        script.remove();
        throw error;
      } finally { script.onload = script.onerror = null; }
    }
    engine = (view as any).MathJax;
  }
  if (!engine?.startup?.promise || !engine?.loader?.load) {
    throw new Error('Static TeX labels require MathJax 3 with its component loader');
  }
  await bounded(view, engine.startup.promise, () => retryAfterLateResource(view));
  return engine;
}

function rendererFor(view: Window, state: TexState): Promise<TexRenderer> {
  if (!state.renderer) {
    state.renderer = (async () => {
      const engine = await loadMathJax(view);
      await bounded(view, engine.loader.load('output/svg'), () => retryAfterLateResource(view));
      // The loaded options include the glyph tables and accent metrics.
      // Never change useOutput(), startup.document, or the global TeX state.
      const output = new engine.startup.constructors.svg({
        ...engine.config.svg, fontCache: 'none'
      });
      const mathDocument = engine.startup.handler.create(view.document, {
        InputJax: engine.startup.getInputJax(), OutputJax: output
      });
      return { engine, document: mathDocument };
    })().catch(error => {
      state.renderer = undefined;
      throw error;
    });
  }
  return state.renderer;
}

async function mathSvg(renderer: TexRenderer, state: TexState, run: StaticTextRun): Promise<SVGSVGElement> {
  const key = JSON.stringify([run.text, run.display]);
  let template = state.cache.get(key);
  if (!template) {
    const convert = () => renderer.document.convert(run.text, {
      format: 'TeX', display: run.display, em: 16, ex: 8, containerWidth: 1280
    });
    // Autoloaded TeX extensions request retries by throwing a promise.
    const result = await renderer.engine._.mathjax.mathjax.handleRetriesFor(convert);
    template = result.querySelector('svg');
    if (!template || template.querySelector('[data-mml-node="merror"]')) {
      throw new Error('MathJax could not convert the static TeX label');
    }
    if (state.cache.size >= 128) state.cache.delete(state.cache.keys().next().value);
    state.cache.set(key, template);
  }
  return template.cloneNode(true) as SVGSVGElement;
}

/** fontCache:none avoids glyph IDs; authored TeX can still supply other IDs. */
function uniqueIds(svg: SVGSVGElement, serial: number): void {
  const nodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const ids = new Map<string, string>();
  nodes.forEach(node => {
    if (node.id) {
      const renamed = 'lia-static-tex-' + serial + '-' + ids.size;
      ids.set(node.id, renamed);
      node.id = renamed;
    }
  });
  nodes.forEach(node => Array.from(node.attributes).forEach(attribute => {
    let value = attribute.value;
    ids.forEach((renamed, original) => {
      if (attribute.localName === 'href' && value === '#' + original) value = '#' + renamed;
      value = value.split('url(#' + original + ')').join('url(#' + renamed + ')');
      if (/^aria-(?:labelledby|describedby)$/.test(attribute.name)) {
        value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
      }
    });
    if (value !== attribute.value) node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
  }));
}

interface PreparedLabel {
  label: TexLabel;
  group: SVGGElement;
  pieces: { node: SVGTextElement | SVGSVGElement; width?: number }[];
  bounds?: DOMRect;
  failed?: boolean;
}

function failedLabel(label: TexLabel, state: TexState, error: unknown): void {
  if (!label.text.isConnected) return;
  label.text.setAttribute('data-lia-static-tex', 'error');
  if (!state.warned) {
    state.warned = true;
    console.warn('[lia-coordinate] Static TeX could not be rendered; keeping text fallback.', error);
  }
}

/** Keep writes, text-width reads, positioning, and bounding-box reads in batches. */
function placeLabels(labels: TexLabel[], state: TexState): void {
  const mounted = labels.filter(label => label.text.isConnected && label.text.parentNode);
  // One visibility read per board, before inserting any of our label output.
  const boards = new Map<SVGSVGElement | SVGTextElement, boolean>();
  mounted.forEach(({ text }) => {
    const board = text.ownerSVGElement || text;
    if (!boards.has(board)) boards.set(board,
      typeof board.getClientRects === 'function' && !board.getClientRects().length);
  });
  const measurements = new Map<SVGSVGElement | SVGTextElement, SVGSVGElement>();
  const prepared: PreparedLabel[] = [];
  const fail = (item: PreparedLabel, error: unknown) => {
    item.failed = true;
    item.group.remove();
    failedLabel(item.label, state, error);
  };
  try {
    mounted.forEach(label => {
      const { text, content, runs, math } = label;
      const doc = text.ownerDocument;
      const group = doc.createElementNS(SVG_NS, 'g');
      const item: PreparedLabel = { label, group, pieces: [] };
      prepared.push(item);
      try {
        // Read after async conversion: callers may override the default font size.
        const fontSize = Number(text.getAttribute('font-size'));
        const color = text.getAttribute('fill') || 'currentColor';
        group.setAttribute('data-lia-static-tex', 'ready');
        group.setAttribute('aria-label', content);
        group.setAttribute('role', 'img');
        group.setAttribute('font-size', String(fontSize));
        group.setAttribute('font-family', text.getAttribute('font-family') || 'system-ui, sans-serif');
        group.setAttribute('fill', color);
        group.style.color = color;
        group.setAttribute('opacity', text.getAttribute('fill-opacity') || '1');
        group.setAttribute('pointer-events', 'none');
        group.setAttribute('visibility', 'hidden');
        let index = 0;
        runs.forEach(run => {
          if (run.math) {
            const svg = math[index++];
            uniqueIds(svg, ++state.serial);
            const box = svg.viewBox.baseVal;
            const scale = fontSize / 1000;
            const width = box.width * scale;
            svg.setAttribute('x', '0');
            svg.setAttribute('y', String(box.y * scale));
            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(box.height * scale));
            svg.removeAttribute('style');
            svg.style.overflow = 'visible';
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            group.appendChild(svg);
            item.pieces.push({ node: svg, width });
          } else {
            const plain = doc.createElementNS(SVG_NS, 'text');
            plain.setAttribute('x', '0');
            plain.setAttribute('y', '0');
            plain.setAttribute('xml:space', 'preserve');
            plain.style.whiteSpace = 'pre';
            plain.textContent = run.text;
            group.appendChild(plain);
            item.pieces.push({ node: plain });
          }
        });
        const board = text.ownerSVGElement || text;
        if (boards.get(board)) {
          let measurement = measurements.get(board);
          if (!measurement) {
            // Hidden slides need native text metrics outside display:none.
            // All their labels share one temporary SVG at the design scale.
            measurement = doc.createElementNS(SVG_NS, 'svg');
            const viewBox = board.getAttribute('viewBox') || '0 0 1 1';
            const bounds = viewBox.split(/\s+/).map(Number);
            const width = Number(board.getAttribute('width')) || 640;
            measurement.setAttribute('viewBox', viewBox);
            measurement.setAttribute('aria-hidden', 'true');
            measurement.setAttribute('data-lia-static-tex-measurement', '');
            measurement.style.cssText = 'position:absolute;left:-100000px;top:0;' +
              'display:block;visibility:hidden;overflow:hidden;pointer-events:none;' +
              'width:' + width + 'px;height:' + width * bounds[3] / bounds[2] + 'px;';
            (doc.body || doc.documentElement).appendChild(measurement);
            measurements.set(board, measurement);
          }
          measurement.appendChild(group);
        } else {
          text.parentNode.insertBefore(group, text);
        }
      } catch (error) { fail(item, error); }
    });
    prepared.forEach(item => {
      if (item.failed) return;
      try {
        item.pieces.forEach(piece => {
          if (piece.width === undefined) piece.width = (piece.node as SVGTextElement).getComputedTextLength();
        });
      } catch (error) { fail(item, error); }
    });
    prepared.forEach(item => {
      if (item.failed) return;
      let cursor = 0;
      item.pieces.forEach(piece => {
        piece.node.setAttribute('x', String(cursor));
        cursor += piece.width;
      });
    });
    prepared.forEach(item => {
      if (item.failed) return;
      try { item.bounds = item.group.getBBox(); }
      catch (error) { fail(item, error); }
    });
    prepared.forEach(item => {
      if (item.failed) return;
      const { text } = item.label;
      const { group, bounds } = item;
      const x = Number(text.getAttribute('x')) - bounds.x - bounds.width / 2;
      const y = Number(text.getAttribute('y')) - bounds.y - bounds.height / 2;
      group.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      group.removeAttribute('visibility');
      if (group.parentNode !== text.parentNode) text.parentNode.insertBefore(group, text);
      text.remove();
    });
  } finally {
    measurements.forEach(measurement => measurement.remove());
  }
}

function scheduleLabels(view: Window, state: TexState): void {
  if (state.scheduled) return;
  state.scheduled = true;
  // Mounting is synchronous; gather labels from all boards in this turn.
  Promise.resolve().then(() => {
    state.scheduled = false;
    const labels = state.pending.splice(0);
    const render = async () => {
      try {
        if (!labels.some(label => label.text.isConnected)) return;
        const renderer = await rendererFor(view, state);
        const converted: TexLabel[] = [];
        for (const label of labels) {
          if (!label.text.isConnected) continue;
          try {
            label.math = [];
            for (const run of label.runs) {
              if (!label.text.isConnected) break;
              if (run.math) label.math.push(await mathSvg(renderer, state, run));
            }
            if (label.text.isConnected) converted.push(label);
          } catch (error) { failedLabel(label, state, error); }
        }
        placeLabels(converted, state);
      } catch (error) {
        labels.forEach(label => failedLabel(label, state, error));
      } finally {
        labels.forEach(label => state.active.delete(label.text));
      }
    };
    state.queue = state.queue.then(render, render);
  });
}

/** Replace only the original, still-mounted node; never append to a newer render. */
export function typesetStaticText(text: SVGTextElement, content: string): void {
  const runs = splitStaticText(content);
  if (!runs.some(run => run.math)) return;
  const view = text.ownerDocument.defaultView;
  if (!view) return;
  const state = stateFor(view);
  if (state.active.has(text)) return;
  state.sources.set(text, content);
  state.active.add(text);
  text.setAttribute('data-lia-static-tex', 'pending');
  state.pending.push({ text, content, runs });
  scheduleLabels(view, state);
}

/** Retry only fallback nodes; ready labels retain their DOM and measured layout. */
export function retryStaticText(root: ParentNode, retryErrors = false): void {
  root.querySelectorAll<SVGTextElement>('[data-lia-static-tex]').forEach(text => {
    const status = text.getAttribute('data-lia-static-tex');
    if (text.localName !== 'text' || (status !== 'pending' && !(retryErrors && status === 'error'))) return;
    const view = text.ownerDocument.defaultView;
    if (!view) return;
    const content = stateFor(view).sources.get(text);
    if (content !== undefined) typesetStaticText(text, content);
  });
}